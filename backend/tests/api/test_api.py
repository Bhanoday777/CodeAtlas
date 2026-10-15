"""API tests against the fixture repository and small temporary repositories.

Expected JSON was written by hand from the fixture (see
tests/parser/test_scan_fixture.py and tests/graph/test_graph_fixture.py).
"""

from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

import app.api.analysis
from app.api.config import ENV_VAR, FIXTURE_REPO, RepositoryConfigError
from app.graph.dependency_graph import DependencyGraph
from app.main import create_app
from app.parser.scanner import scan_repository

FIXTURE_ROOT = Path(__file__).resolve().parents[3] / "fixtures" / "sample_python_project"

FIXTURE_EDGES = [
    ("manage", "shop.main"),
    ("shop.cycle_a", "shop.cycle_b"),
    ("shop.cycle_b", "shop.cycle_a"),
    ("shop.dupes", "shop.utils.helpers"),
    ("shop.lazy", "shop.services.pricing"),
    ("shop.legacy", "shop.utils"),
    ("shop.main", "shop.services.orders"),
    ("shop.main", "shop.utils.helpers"),
    ("shop.models.order", "shop.utils.helpers"),
    ("shop.services", "shop.services.orders"),
    ("shop.services.orders", "shop.models.order"),
    ("shop.services.orders", "shop.services.pricing"),
    ("shop.services.pricing", "shop.models.order"),
    ("shop.services.pricing", "shop.utils.helpers"),
]

FIXTURE_DIAGNOSTICS = [
    {
        "code": "scan_errors",
        "message": "1 file(s) could not be parsed (shop/broken.py). Their imports are missing "
        "from the graph, so impact reports can miss modules that depend on a change through them.",
    },
    {
        "code": "unresolved_imports",
        "message": "3 import(s) look local but match no module in the repository. "
        "They are not graph edges.",
    },
]


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(FIXTURE_ROOT)) as test_client:
        yield test_client


def make_repo(root: Path, files: dict[str, str]) -> Path:
    for relative, source in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(source, encoding="utf-8")
    return root


# --- /api/health ---------------------------------------------------------------


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "repository": "sample_python_project",
        "module_count": 16,
        "edge_count": 14,
    }


# --- /api/graph ----------------------------------------------------------------


def test_graph_edges_and_summary(client):
    body = client.get("/api/graph").json()
    assert body["repository"] == "sample_python_project"
    assert body["edges"] == [{"source": a, "target": b} for a, b in FIXTURE_EDGES]
    assert body["summary"] == {
        "modules": 16,
        "edges": 14,
        "external_imports": 6,
        "unresolved_imports": 3,
        "scan_errors": 1,
        "warnings": 0,
    }


def test_graph_nodes(client):
    nodes = {node["id"]: node for node in client.get("/api/graph").json()["nodes"]}
    assert list(nodes) == sorted(nodes)
    assert len(nodes) == 16
    assert nodes["shop.models"] == {
        "id": "shop.models",
        "path": "shop/models/__init__.py",
        "is_package": True,
        "has_scan_error": False,
        "dependency_count": 0,
        "dependent_count": 0,
    }
    assert nodes["shop.models.order"] == {
        "id": "shop.models.order",
        "path": "shop/models/order.py",
        "is_package": False,
        "has_scan_error": False,
        "dependency_count": 1,
        "dependent_count": 2,
    }
    assert nodes["shop.broken"]["has_scan_error"] is True
    assert [n for n, node in nodes.items() if node["has_scan_error"]] == ["shop.broken"]


# --- /api/modules/{id} -----------------------------------------------------------


def test_module_detail(client):
    response = client.get("/api/modules/shop.models.order")
    assert response.status_code == 200
    assert response.json() == {
        "id": "shop.models.order",
        "path": "shop/models/order.py",
        "is_package": False,
        "has_scan_error": False,
        "dependencies": ["shop.utils.helpers"],
        "dependents": ["shop.services.orders", "shop.services.pricing"],
        "external_imports": [{"raw": "from dataclasses import dataclass", "lineno": 1}],
        "unresolved_imports": [],
    }


def test_module_detail_with_unresolved_imports(client):
    body = client.get("/api/modules/shop.legacy").json()
    assert body["dependencies"] == ["shop.utils"]
    assert body["dependents"] == []
    assert body["unresolved_imports"] == [
        {"raw": "import shop.missing_module", "lineno": 1},
        {"raw": "from .gone import thing", "lineno": 3},
    ]


def test_module_detail_for_file_with_syntax_error(client):
    body = client.get("/api/modules/shop.broken").json()
    assert body["has_scan_error"] is True
    assert body["dependencies"] == body["dependents"] == []


# --- /api/impact/{id} ----------------------------------------------------------


def test_impact_report(client):
    response = client.get("/api/impact/shop.models.order")
    assert response.status_code == 200
    assert response.json() == {
        "changed_module": "shop.models.order",
        "affected": [
            {"id": "shop.services.orders", "distance": 1,
             "path": ["shop.services.orders", "shop.models.order"]},
            {"id": "shop.services.pricing", "distance": 1,
             "path": ["shop.services.pricing", "shop.models.order"]},
            {"id": "shop.lazy", "distance": 2,
             "path": ["shop.lazy", "shop.services.pricing", "shop.models.order"]},
            {"id": "shop.main", "distance": 2,
             "path": ["shop.main", "shop.services.orders", "shop.models.order"]},
            {"id": "shop.services", "distance": 2,
             "path": ["shop.services", "shop.services.orders", "shop.models.order"]},
            {"id": "manage", "distance": 3,
             "path": ["manage", "shop.main", "shop.services.orders", "shop.models.order"]},
        ],
        "direct": ["shop.services.orders", "shop.services.pricing"],
        "transitive": ["shop.lazy", "shop.main", "shop.services", "manage"],
        "diagnostics": FIXTURE_DIAGNOSTICS,
    }


def test_impact_of_module_nothing_imports(client):
    body = client.get("/api/impact/manage").json()
    assert body["affected"] == body["direct"] == body["transitive"] == []


def test_impact_matches_graph_engine_for_every_module(client):
    """The API must only reshape DependencyGraph.impact(), never compute its own."""
    graph = DependencyGraph.from_scan(scan_repository(FIXTURE_ROOT))
    for module_id in graph.modules:
        body = client.get(f"/api/impact/{quote(module_id, safe='')}").json()
        report = graph.impact(module_id)
        assert body["changed_module"] == module_id
        assert body["affected"] == [
            {"id": m.module_id, "distance": m.distance, "path": list(m.path)}
            for m in report.affected
        ]
        assert body["direct"] == [m.module_id for m in report.direct]
        assert body["transitive"] == [m.module_id for m in report.transitive]


def test_impact_paths_follow_graph_edges(client):
    edges = {(e["source"], e["target"]) for e in client.get("/api/graph").json()["edges"]}
    for node in client.get("/api/graph").json()["nodes"]:
        for affected in client.get(f"/api/impact/{node['id']}").json()["affected"]:
            path = affected["path"]
            assert path[0] == affected["id"] and path[-1] == node["id"]
            assert all(step in edges for step in zip(path, path[1:]))


# --- Unknown modules and URL encoding -------------------------------------------


@pytest.mark.parametrize("endpoint", ["/api/modules", "/api/impact"])
@pytest.mark.parametrize("module_id", ["shop.nope", "Shop.main", "sho"])
def test_unknown_module_is_404(client, endpoint, module_id):
    response = client.get(f"{endpoint}/{module_id}")
    assert response.status_code == 404
    assert response.json() == {"detail": f"Unknown module: {module_id!r}"}


def test_percent_encoded_ascii_ids_are_unchanged(client):
    for node in client.get("/api/graph").json()["nodes"]:
        assert quote(node["id"], safe="") == node["id"]


def test_non_ascii_module_id_round_trips(tmp_path):
    repo = make_repo(tmp_path, {"naïve.py": "", "main.py": "import naïve\n"})
    with TestClient(create_app(repo)) as client:
        encoded = quote("naïve", safe="")
        assert encoded == "na%C3%AFve"
        assert client.get(f"/api/modules/{encoded}").json()["dependents"] == ["main"]
        assert client.get(f"/api/impact/{encoded}").json()["direct"] == ["main"]


# --- /api/scan/issues ------------------------------------------------------------


def test_scan_issues(client):
    body = client.get("/api/scan/issues").json()
    assert body["scan_errors"] == [
        {"path": "shop/broken.py", "message": "SyntaxError: invalid syntax", "lineno": 3}
    ]
    assert body["unresolved_imports"] == [
        {"module": "manage", "raw": "from . import settings", "lineno": 3},
        {"module": "shop.legacy", "raw": "import shop.missing_module", "lineno": 1},
        {"module": "shop.legacy", "raw": "from .gone import thing", "lineno": 3},
    ]
    assert body["self_imports"] == []
    assert body["diagnostics"] == FIXTURE_DIAGNOSTICS
    assert any("does not mean the analysis is complete" in note for note in body["limitations"])


def test_self_imports_are_reported_as_warnings(tmp_path):
    repo = make_repo(
        tmp_path,
        {
            "pkg/__init__.py": "from . import VERSION\n",  # name inside pkg itself
            "pkg/core.py": "import pkg\nimport pkg.missing\n",
        },
    )
    with TestClient(create_app(repo)) as client:
        issues = client.get("/api/scan/issues").json()
        assert issues["self_imports"] == [
            {"module": "pkg", "raw": "from . import VERSION", "lineno": 1}
        ]
        assert issues["unresolved_imports"] == [
            {"module": "pkg.core", "raw": "import pkg.missing", "lineno": 2}
        ]
        assert [d["code"] for d in issues["diagnostics"]] == ["unresolved_imports", "self_imports"]
        graph = client.get("/api/graph").json()
        assert graph["edges"] == [{"source": "pkg.core", "target": "pkg"}]
        assert graph["summary"]["warnings"] == 1
        assert graph["summary"]["unresolved_imports"] == 1
        # Self-imports do not hide dependents, so they are not an impact diagnostic.
        impact = client.get("/api/impact/pkg").json()
        assert impact["direct"] == ["pkg.core"]
        assert [d["code"] for d in impact["diagnostics"]] == ["unresolved_imports"]


def test_empty_repository(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        assert client.get("/api/health").json()["module_count"] == 0
        graph = client.get("/api/graph").json()
        assert graph["nodes"] == graph["edges"] == []
        assert set(graph["summary"].values()) == {0}
        issues = client.get("/api/scan/issues").json()
        assert issues["scan_errors"] == issues["unresolved_imports"] == issues["diagnostics"] == []
        assert issues["limitations"]  # still says an empty list is not proof of completeness
        assert client.get("/api/impact/anything").status_code == 404


# --- Startup and configuration --------------------------------------------------


def test_invalid_repo_path_fails_startup(tmp_path):
    missing = tmp_path / "does-not-exist"
    with pytest.raises(RepositoryConfigError, match="is not an existing directory"):
        with TestClient(create_app(missing)):
            pass


def test_file_is_not_a_valid_repo_path(tmp_path):
    file_path = tmp_path / "module.py"
    file_path.write_text("")
    with pytest.raises(RepositoryConfigError):
        with TestClient(create_app(file_path)):
            pass


def test_invalid_env_var_fails_without_falling_back(monkeypatch, tmp_path):
    monkeypatch.setenv(ENV_VAR, str(tmp_path / "nope"))
    with pytest.raises(RepositoryConfigError, match="nope"):
        with TestClient(create_app()):
            pass


def test_empty_env_var_fails(monkeypatch):
    monkeypatch.setenv(ENV_VAR, "  ")
    with pytest.raises(RepositoryConfigError, match="set but empty"):
        with TestClient(create_app()):
            pass


def test_env_var_selects_repository(monkeypatch, tmp_path):
    repo = make_repo(tmp_path / "myrepo", {"a.py": "import b\n", "b.py": ""})
    monkeypatch.setenv(ENV_VAR, str(repo / ".." / "myrepo"))  # normalized before use
    with TestClient(create_app()) as client:
        assert client.get("/api/health").json() == {
            "status": "ok",
            "repository": "myrepo",
            "module_count": 2,
            "edge_count": 1,
        }
        assert client.app.state.analysis.root == repo.resolve()


def test_default_is_fixture_repository(monkeypatch):
    monkeypatch.delenv(ENV_VAR, raising=False)
    assert FIXTURE_REPO == FIXTURE_ROOT
    with TestClient(create_app()) as client:
        assert client.get("/api/health").json()["repository"] == "sample_python_project"


def test_repository_is_scanned_once_per_startup(monkeypatch):
    calls = []
    real_scan = app.api.analysis.scan_repository

    def counting_scan(root):
        calls.append(root)
        return real_scan(root)

    monkeypatch.setattr(app.api.analysis, "scan_repository", counting_scan)
    with TestClient(create_app(FIXTURE_ROOT)) as client:
        for url in ["/api/health", "/api/graph", "/api/modules/shop", "/api/impact/shop",
                    "/api/scan/issues", "/api/graph"]:
            assert client.get(url).status_code == 200
    assert calls == [FIXTURE_ROOT.resolve()]


# --- CORS --------------------------------------------------------------------------


def test_cors_allows_vite_dev_origin(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    preflight = client.options(
        "/api/graph",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert preflight.status_code == 200


def test_cors_rejects_other_origins(client):
    response = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers
