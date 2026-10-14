"""End-to-end scan of fixtures/sample_python_project.

The expected sets below were written by hand from reading the fixture files,
before running the scanner. Assertions use exact set equality, so both missing
and extra relationships fail the test.
"""

from pathlib import Path

import pytest

from app.parser.models import ImportKind
from app.parser.scanner import scan_repository

FIXTURE_ROOT = Path(__file__).resolve().parents[3] / "fixtures" / "sample_python_project"

EXPECTED_MODULES = {
    "manage",
    "shop",
    "shop.broken",
    "shop.cycle_a",
    "shop.cycle_b",
    "shop.dupes",
    "shop.lazy",
    "shop.legacy",
    "shop.main",
    "shop.models",
    "shop.models.order",
    "shop.services",
    "shop.services.orders",
    "shop.services.pricing",
    "shop.utils",
    "shop.utils.helpers",
}

# (importer, imported): "A imports B"
EXPECTED_EDGES = {
    ("manage", "shop.main"),
    ("shop.main", "shop.services.orders"),
    ("shop.main", "shop.utils.helpers"),
    ("shop.services", "shop.services.orders"),
    ("shop.services.orders", "shop.services.pricing"),
    ("shop.services.orders", "shop.models.order"),
    ("shop.services.pricing", "shop.models.order"),
    ("shop.services.pricing", "shop.utils.helpers"),
    ("shop.models.order", "shop.utils.helpers"),
    ("shop.cycle_a", "shop.cycle_b"),
    ("shop.cycle_b", "shop.cycle_a"),
    ("shop.dupes", "shop.utils.helpers"),
    ("shop.legacy", "shop.utils"),
    ("shop.lazy", "shop.services.pricing"),
}

EXPECTED_EXTERNAL = {
    ("shop.main", "import os"),
    ("shop.main", "import requests"),
    ("shop.services.pricing", "from decimal import Decimal"),
    ("shop.models.order", "from dataclasses import dataclass"),
    ("shop.utils.helpers", "import json"),
    ("shop.lazy", "import ujson"),
}

EXPECTED_UNRESOLVED = {
    ("manage", "from . import settings"),
    ("shop.legacy", "import shop.missing_module"),
    ("shop.legacy", "from .gone import thing"),
}


@pytest.fixture(scope="module")
def scan():
    return scan_repository(FIXTURE_ROOT)


def by_kind(scan, kind):
    return {(imp.source, imp.raw) for imp in scan.imports if imp.kind is kind}


def test_discovers_every_python_module(scan):
    assert set(scan.modules) == EXPECTED_MODULES


def test_local_edges_match_exactly(scan):
    assert scan.local_edges() == EXPECTED_EDGES


def test_edge_direction_is_importer_to_imported(scan):
    edges = scan.local_edges()
    assert ("shop.models.order", "shop.utils.helpers") in edges
    assert ("shop.utils.helpers", "shop.models.order") not in edges


def test_external_imports_match_exactly(scan):
    assert by_kind(scan, ImportKind.EXTERNAL) == EXPECTED_EXTERNAL


def test_unresolved_imports_match_exactly(scan):
    assert by_kind(scan, ImportKind.UNRESOLVED) == EXPECTED_UNRESOLVED


def test_syntax_error_is_reported_and_module_still_listed(scan):
    assert [(e.path, e.lineno) for e in scan.errors] == [("shop/broken.py", 3)]
    assert scan.errors[0].message.startswith("SyntaxError")
    assert "shop.broken" in scan.modules
    assert not any(imp.source == "shop.broken" for imp in scan.imports)


def test_duplicate_imports_collapse_to_one_edge(scan):
    dupes = [imp for imp in scan.imports if imp.source == "shop.dupes"]
    assert len(dupes) == 3
    assert {(imp.source, imp.target) for imp in dupes} == {("shop.dupes", "shop.utils.helpers")}


def test_empty_files_are_modules_without_imports(scan):
    assert scan.modules["shop.models"].is_package
    assert not any(imp.source == "shop.models" for imp in scan.imports)


def test_scan_of_empty_directory(tmp_path):
    result = scan_repository(tmp_path)
    assert (result.modules, result.imports, result.errors) == ({}, [], [])


def test_scan_of_missing_directory_raises(tmp_path):
    with pytest.raises(NotADirectoryError):
        scan_repository(tmp_path / "does-not-exist")


def test_undecodable_file_is_reported(tmp_path):
    (tmp_path / "good.py").write_text("import os\n", encoding="utf-8")
    (tmp_path / "bad.py").write_bytes(b"x = '\xff\xfe'\n")

    result = scan_repository(tmp_path)

    assert set(result.modules) == {"good", "bad"}
    assert [e.path for e in result.errors] == ["bad.py"]
    assert [(i.source, i.raw) for i in result.imports] == [("good", "import os")]
