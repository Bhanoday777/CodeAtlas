"""Scan real repositories through the API and check the invariants in invariants.py.

- The installed Click package is always tried (it is installed with uvicorn). The
  package folder is copied under a temporary root, so it is scanned as `click.*`
  with its relative imports intact, exactly as from a source checkout.
- More repositories can be supplied, never downloaded:
      CODEATLAS_REAL_REPOS=/path/to/repo1;/path/to/repo2   (os.pathsep-separated)
  A path that does not exist is skipped with that reason.
"""

from __future__ import annotations

import importlib.metadata
import importlib.util
import os
import shutil
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.integration.invariants import CheckedRepository, check_repository

ENV_VAR = "CODEATLAS_REAL_REPOS"


def check(root: Path) -> tuple[CheckedRepository, float]:
    start = time.perf_counter()
    with TestClient(create_app(root)) as client:
        checked = check_repository(client)
    return checked, time.perf_counter() - start


def test_installed_click(tmp_path, record_timing):
    spec = importlib.util.find_spec("click")
    if spec is None or not spec.submodule_search_locations:
        pytest.skip("the click package is not installed in this environment")
    package = Path(next(iter(spec.submodule_search_locations)))
    shutil.copytree(package, tmp_path / "click", ignore=shutil.ignore_patterns("__pycache__"))
    python_files = sorted(tmp_path.rglob("*.py"))

    checked, seconds = check(tmp_path)

    # Every .py file is a module, and Click's modules import each other.
    assert checked.modules == len(python_files)
    assert checked.edges > 0
    version = importlib.metadata.version("click")
    record_timing(
        f"click {version}",
        f"{checked.modules} modules, {checked.edges} edges, largest impact {checked.largest_impact}; "
        f"scan + every endpoint checked in {seconds:.2f}s",
    )


def configured_repos() -> list:
    raw = os.environ.get(ENV_VAR, "")
    paths = [p.strip() for p in raw.split(os.pathsep) if p.strip()]
    if not paths:
        return [pytest.param(None, id="none-configured")]
    return [pytest.param(Path(p), id=Path(p).name or p) for p in paths]


@pytest.mark.parametrize("root", configured_repos())
def test_configured_repository(root, record_timing):
    if root is None:
        pytest.skip(f"{ENV_VAR} is not set; no extra repositories to check")
    if not root.is_dir():
        pytest.skip(f"{ENV_VAR} entry {root} does not exist or is not a directory")
    checked, seconds = check(root)
    assert checked.modules > 0, f"{root} contains no Python modules"
    record_timing(
        root.name,
        f"{checked.modules} modules, {checked.edges} edges, largest impact {checked.largest_impact}; "
        f"checked in {seconds:.2f}s",
    )


class CorruptedClient:
    """Wraps a TestClient and drops the last affected module from one impact report."""

    def __init__(self, client: TestClient, target: str):
        self.client, self.target = client, target

    def get(self, url: str):
        response = self.client.get(url)
        if url != f"/api/impact/{self.target}":
            return response
        body = response.json()
        body["affected"] = body["affected"][:-1]

        class Patched:
            def json(self):
                return body

        return Patched()


def test_checker_detects_a_wrong_impact_report():
    """The invariants are only useful if they can fail."""
    from app.api.config import FIXTURE_REPO

    with TestClient(create_app(FIXTURE_REPO)) as client:
        with pytest.raises(AssertionError, match="independent BFS"):
            check_repository(CorruptedClient(client, "shop.services.pricing"))
