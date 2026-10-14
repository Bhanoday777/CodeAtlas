"""Scan-level edge cases found while reviewing the parser against real packages."""

from pathlib import Path

import pytest

from app.parser.models import ImportKind
from app.parser.scanner import scan_repository


def make_repo(root: Path, files: dict[str, str]) -> Path:
    for relative, content in files.items():
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return root


def kinds(scan, source: str) -> list[tuple[str, ImportKind]]:
    return [(imp.raw, imp.kind) for imp in scan.imports if imp.source == source]


def test_self_imports_are_resolved_but_not_edges(tmp_path):
    scan = scan_repository(make_repo(tmp_path, {
        "pkg/__init__.py": "from . import helper_name\nhelper_name = 1\n",
        "pkg/selfref.py": "import pkg.selfref\n",
        "pkg/user.py": "from pkg import selfref\n",
    }))

    assert scan.local_edges() == {("pkg.user", "pkg.selfref")}
    # The import records themselves are still reported as local, not hidden.
    assert kinds(scan, "pkg") == [("from . import helper_name", ImportKind.LOCAL)]
    assert kinds(scan, "pkg.selfref") == [("import pkg.selfref", ImportKind.LOCAL)]


def test_type_checking_imports_are_included(tmp_path):
    # Static analysis cannot tell type-only imports from runtime ones; we include them.
    scan = scan_repository(make_repo(tmp_path, {
        "pkg/__init__.py": "",
        "pkg/models.py": "",
        "pkg/service.py": (
            "from typing import TYPE_CHECKING\n"
            "if TYPE_CHECKING:\n"
            "    from pkg.models import Model\n"
        ),
    }))

    assert scan.local_edges() == {("pkg.service", "pkg.models")}


def test_aliased_imports_resolve_to_the_real_module(tmp_path):
    scan = scan_repository(make_repo(tmp_path, {
        "pkg/__init__.py": "",
        "pkg/core.py": "",
        "app.py": "import pkg.core as c\nfrom pkg import core as k\n",
    }))

    assert scan.local_edges() == {("app", "pkg.core")}


def test_deep_relative_imports(tmp_path):
    scan = scan_repository(make_repo(tmp_path, {
        "a/__init__.py": "",
        "a/top.py": "",
        "a/b/__init__.py": "",
        "a/b/c/__init__.py": "",
        "a/b/c/leaf.py": (
            "from ... import top\n"        # a.top
            "from ...top import thing\n"   # a.top
            "from .... import beyond\n"    # climbs above `a`: unresolved
        ),
    }))

    assert scan.local_edges() == {("a.b.c.leaf", "a.top")}
    assert kinds(scan, "a.b.c.leaf")[2] == ("from .... import beyond", ImportKind.UNRESOLVED)


def test_cycle_edges_are_kept_in_both_directions(tmp_path):
    scan = scan_repository(make_repo(tmp_path, {
        "x.py": "import y\n",
        "y.py": "import z\n",
        "z.py": "import x\n",
    }))

    assert scan.local_edges() == {("x", "y"), ("y", "z"), ("z", "x")}


def test_partially_unresolvable_repo_keeps_resolvable_edges(tmp_path):
    scan = scan_repository(make_repo(tmp_path, {
        "pkg/__init__.py": "",
        "pkg/ok.py": "",
        "pkg/mixed.py": "import pkg.ok\nimport pkg.gone\nfrom .also_gone import f\nimport requests\n",
        "pkg/broken.py": "def (:\n",
    }))

    assert scan.local_edges() == {("pkg.mixed", "pkg.ok")}
    assert [k for _, k in kinds(scan, "pkg.mixed")] == [
        ImportKind.LOCAL, ImportKind.UNRESOLVED, ImportKind.UNRESOLVED, ImportKind.EXTERNAL,
    ]
    assert [e.path for e in scan.errors] == ["pkg/broken.py"]


@pytest.mark.xfail(strict=True, reason="Known limitation: namespace packages (no __init__.py) "
                   "are not modules in the index, so `import nspkg` is reported as unresolved")
def test_import_of_namespace_package_is_not_unresolved(tmp_path):
    scan = scan_repository(make_repo(tmp_path, {
        "nspkg/mod.py": "",
        "app.py": "import nspkg\n",
    }))

    assert kinds(scan, "app")[0][1] is not ImportKind.UNRESOLVED


def test_submodule_of_namespace_package_resolves(tmp_path):
    scan = scan_repository(make_repo(tmp_path, {
        "nspkg/mod.py": "",
        "app.py": "from nspkg import mod\nimport nspkg.mod\n",
    }))

    assert scan.local_edges() == {("app", "nspkg.mod")}
