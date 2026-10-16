"""Parser -> graph integration on fixtures/sample_python_project.

Expected impact reports were worked out by hand from the fixture's edge list
(see tests/parser/test_scan_fixture.py) before running the graph code.
"""

from pathlib import Path

import pytest

from app.graph.__main__ import main
from app.graph.dependency_graph import AffectedModule, DependencyGraph
from app.parser.scanner import scan_repository

FIXTURE_ROOT = Path(__file__).resolve().parents[3] / "fixtures" / "sample_python_project"


@pytest.fixture(scope="module")
def scan():
    return scan_repository(FIXTURE_ROOT)


@pytest.fixture(scope="module")
def graph(scan):
    return DependencyGraph.from_scan(scan)


def test_graph_has_every_scanned_module_and_local_edge(scan, graph):
    assert set(graph.modules) == set(scan.modules)
    assert set(graph.edges) == scan.local_edges()
    assert len(graph.modules) == 16
    assert len(graph.edges) == 34  # 14 from import statements + 20 to parent packages


def test_module_with_syntax_error_is_an_isolated_node(graph):
    assert "shop.broken" in graph
    assert graph.dependencies_of("shop.broken") == ()
    assert graph.dependents_of("shop.broken") == ()
    assert graph.impact("shop.broken").affected == ()


def test_impact_of_helpers(graph):
    # Ties at distance 2: shop.services.orders reaches helpers through both
    # shop.models.order and shop.services.pricing; models.order sorts first.
    assert graph.impact("shop.utils.helpers").affected == (
        AffectedModule("shop.dupes", 1, ("shop.dupes", "shop.utils.helpers")),
        AffectedModule("shop.main", 1, ("shop.main", "shop.utils.helpers")),
        AffectedModule("shop.models.order", 1, ("shop.models.order", "shop.utils.helpers")),
        AffectedModule("shop.services.pricing", 1, ("shop.services.pricing", "shop.utils.helpers")),
        AffectedModule("manage", 2, ("manage", "shop.main", "shop.utils.helpers")),
        AffectedModule(
            "shop.lazy", 2, ("shop.lazy", "shop.services.pricing", "shop.utils.helpers")
        ),
        AffectedModule(
            "shop.services.orders",
            2,
            ("shop.services.orders", "shop.models.order", "shop.utils.helpers"),
        ),
        AffectedModule(
            "shop.services",
            3,
            ("shop.services", "shop.services.orders", "shop.models.order", "shop.utils.helpers"),
        ),
    )


def test_impact_of_order_model(graph):
    assert graph.impact("shop.models.order").affected == (
        AffectedModule("shop.services.orders", 1, ("shop.services.orders", "shop.models.order")),
        AffectedModule("shop.services.pricing", 1, ("shop.services.pricing", "shop.models.order")),
        AffectedModule(
            "shop.lazy", 2, ("shop.lazy", "shop.services.pricing", "shop.models.order")
        ),
        AffectedModule(
            "shop.main", 2, ("shop.main", "shop.services.orders", "shop.models.order")
        ),
        AffectedModule(
            "shop.services", 2, ("shop.services", "shop.services.orders", "shop.models.order")
        ),
        AffectedModule(
            "manage",
            3,
            ("manage", "shop.main", "shop.services.orders", "shop.models.order"),
        ),
    )


def test_fixture_cycle(graph):
    assert graph.impact("shop.cycle_a").affected == (
        AffectedModule("shop.cycle_b", 1, ("shop.cycle_b", "shop.cycle_a")),
    )


@pytest.mark.parametrize(
    ("changed", "expected"),
    [
        ("manage", set()),  # entry point: nothing imports it
        # A package's __init__ affects everything that imports it or anything inside it.
        (
            "shop.utils",
            {
                "shop.legacy", "shop.dupes", "shop.main", "shop.models.order", "shop.services.pricing",
                "manage", "shop.lazy", "shop.services.orders", "shop.services",
            },
        ),
        (
            "shop",
            {
                "manage", "shop.cycle_a", "shop.cycle_b", "shop.dupes", "shop.lazy", "shop.legacy",
                "shop.main", "shop.models.order", "shop.services", "shop.services.orders",
                "shop.services.pricing",
            },
        ),
        # Nothing imports shop.models by name; its importers come from `from ..models import order`.
        (
            "shop.models",
            {"shop.services.orders", "shop.services.pricing", "shop.lazy", "shop.main", "shop.services", "manage"},
        ),
        # shop.services <-> shop.services.orders is a cycle (an import one way, a parent
        # edge back): neither is in its own result.
        ("shop.services", {"shop.lazy", "shop.main", "shop.services.orders", "manage"}),
        ("shop.services.orders", {"shop.main", "shop.services", "shop.lazy", "manage"}),
        ("shop.legacy", set()),
    ],
)
def test_impact_sets(graph, changed, expected):
    assert {m.module_id for m in graph.impact(changed).affected} == expected


def test_impact_matches_forward_reachability_for_every_module(graph):
    """Independent check: A is affected by a change to C exactly when C is
    reachable from A by following imports forward (plain DFS, no BFS code)."""

    def reachable_from(start):
        seen, stack = set(), [start]
        while stack:
            for nxt in graph.dependencies_of(stack.pop()):
                if nxt not in seen:
                    seen.add(nxt)
                    stack.append(nxt)
        return seen

    reach = {m: reachable_from(m) for m in graph.modules}
    for changed in graph.modules:
        expected = {m for m in graph.modules if m != changed and changed in reach[m]}
        assert {m.module_id for m in graph.impact(changed).affected} == expected


# --- CLI ----------------------------------------------------------------------


def test_cli_impact_report(capsys):
    assert main([str(FIXTURE_ROOT), "shop.models.order"]) == 0
    out = capsys.readouterr().out
    assert "16 modules, 34 edges, 1 scan errors" in out
    assert "May be affected (6: 2 direct, 4 transitive)" in out
    assert "[3] manage" in out
    assert "manage -> shop.main -> shop.services.orders -> shop.models.order" in out


def test_cli_lists_modules_without_module_argument(capsys):
    assert main([str(FIXTURE_ROOT)]) == 0
    out = capsys.readouterr().out
    assert "shop.utils.helpers" in out
    assert "shop.broken" in out


def test_cli_unknown_module_fails(capsys):
    assert main([str(FIXTURE_ROOT), "shop.nope"]) == 1
    assert "Unknown module: 'shop.nope'" in capsys.readouterr().err


def test_cli_usage_error(capsys):
    assert main([]) == 2
    assert "usage:" in capsys.readouterr().err


def test_cli_missing_repository_fails_without_traceback(tmp_path, capsys):
    assert main([str(tmp_path / "missing"), "shop"]) == 1
    assert "error: Repository root is not a directory" in capsys.readouterr().err


def test_parent_package_explanation_paths(graph):
    # manage imports shop.main, which runs shop/__init__.py: a direct edge to shop.
    report = graph.impact("shop.models")
    assert report.direct == (
        AffectedModule("shop.services.orders", 1, ("shop.services.orders", "shop.models")),
        AffectedModule("shop.services.pricing", 1, ("shop.services.pricing", "shop.models")),
    )
    assert AffectedModule("manage", 3, ("manage", "shop.main", "shop.services.orders", "shop.models")) in report.affected
    assert graph.explanation_path("manage", "shop") == ("manage", "shop")
    # Every step of every path is a real edge.
    edges = set(graph.edges)
    for module in report.affected:
        assert all(step in edges for step in zip(module.path, module.path[1:]))
