"""The API's responses on the fixture must match the committed snapshots in contract/fixture/.

The same files are read by the frontend's contract test (frontend/src/contract.test.ts),
which runs the frontend's response guards and graph conversion on them. A backend
change to a field the frontend relies on therefore fails on one side or the other.

Snapshots are only rewritten on request:

    .venv/Scripts/python -m pytest tests/contract --update-contract

and the result is reviewed with `git diff contract/` like any other change.

Determinism:
- Object keys are written sorted; list order is NOT normalized, because sorted
  lists are part of the API contract (schemas.py) and a change in order should fail.
- The only environment-dependent value is the text of a Python SyntaxError, which
  CPython words differently between versions; it is replaced by a placeholder.
  Its file path and line number are kept.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from app.api.config import FIXTURE_REPO
from app.main import create_app

CONTRACT_DIR = Path(__file__).resolve().parents[3] / "contract" / "fixture"

# Modules chosen to cover every response shape: a long impact chain (pricing, order,
# helpers), nothing affected (manage), a file that failed to parse (broken), a cycle
# (cycle_a), a package __init__ (shop.services details; shop.models impact, reached only
# through parent-package edges), and unresolved imports (legacy).
DETAIL_MODULES = ["manage", "shop.broken", "shop.legacy", "shop.services", "shop.services.pricing"]
IMPACT_MODULES = [
    "manage",
    "shop.broken",
    "shop.cycle_a",
    "shop.models",
    "shop.models.order",
    "shop.services.pricing",
    "shop.utils.helpers",
]

SNAPSHOTS: dict[str, str] = {
    "health": "/api/health",
    "graph": "/api/graph",
    "scan-issues": "/api/scan/issues",
    **{f"module--{m}": f"/api/modules/{quote(m, safe='')}" for m in DETAIL_MODULES},
    **{f"impact--{m}": f"/api/impact/{quote(m, safe='')}" for m in IMPACT_MODULES},
    "error--unknown-module": "/api/modules/no.such.module",
}

SYNTAX_ERROR = re.compile(r"^SyntaxError: .*$")
SYNTAX_ERROR_PLACEHOLDER = "SyntaxError: <message wording depends on the Python version>"


def normalize(body):
    """Replace environment-dependent values; see the module docstring."""
    if isinstance(body, dict):
        return {
            key: SYNTAX_ERROR_PLACEHOLDER
            if key == "message" and isinstance(value, str) and SYNTAX_ERROR.match(value)
            else normalize(value)
            for key, value in body.items()
        }
    if isinstance(body, list):
        return [normalize(item) for item in body]
    return body


def render(request: str, status: int, body) -> str:
    snapshot = {"request": f"GET {request}", "status": status, "body": normalize(body)}
    return json.dumps(snapshot, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(FIXTURE_REPO)) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def update(request) -> bool:
    return request.config.getoption("--update-contract")


@pytest.mark.parametrize("name", list(SNAPSHOTS))
def test_response_matches_snapshot(name, client, update):
    request = SNAPSHOTS[name]
    response = client.get(request)
    actual = render(request, response.status_code, response.json())
    path = CONTRACT_DIR / f"{name}.json"

    if update:
        CONTRACT_DIR.mkdir(parents=True, exist_ok=True)
        changed = not path.exists() or path.read_text(encoding="utf-8") != actual
        path.write_text(actual, encoding="utf-8", newline="\n")
        pytest.skip(f"{'rewrote' if changed else 'unchanged'} {path.name}; review with `git diff contract/`")

    assert path.exists(), f"missing snapshot {path.name}; create it with --update-contract and review it"
    # Compared as parsed JSON so a line-ending conversion on checkout cannot fail the test.
    assert json.loads(actual) == json.loads(path.read_text(encoding="utf-8")), (
        f"{request} no longer matches contract/fixture/{path.name}. If the change is intended, "
        "rerun with --update-contract, review the diff, and check the frontend contract test."
    )


def test_no_stale_snapshot_files(update):
    """Every committed snapshot is produced by a request above; renamed ones must not linger."""
    if update:
        for stale in sorted(set(p.stem for p in CONTRACT_DIR.glob("*.json")) - set(SNAPSHOTS)):
            (CONTRACT_DIR / f"{stale}.json").unlink()
    assert sorted(p.stem for p in CONTRACT_DIR.glob("*.json")) == sorted(SNAPSHOTS)


def test_normalize_only_replaces_syntax_error_text():
    body = {
        "scan_errors": [{"path": "a.py", "message": "SyntaxError: invalid syntax", "lineno": 3}],
        "diagnostics": [{"code": "scan_errors", "message": "1 file(s) could not be parsed (a.py)."}],
    }
    assert normalize(body) == {
        "scan_errors": [{"path": "a.py", "message": SYNTAX_ERROR_PLACEHOLDER, "lineno": 3}],
        "diagnostics": [{"code": "scan_errors", "message": "1 file(s) could not be parsed (a.py)."}],
    }
