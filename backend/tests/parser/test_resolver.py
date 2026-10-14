"""Resolver tests against a small in-memory module index (no filesystem).

Index:
    pkg/__init__.py        -> pkg          (package)
    pkg/a.py               -> pkg.a
    pkg/sub/__init__.py    -> pkg.sub      (package)
    pkg/sub/b.py           -> pkg.sub.b
    top.py                 -> top          (top-level module, not in a package)
"""

import importlib.util

import pytest

from app.parser.models import ImportKind, ImportRecord, ModuleInfo
from app.parser.resolver import absolute_base, format_import, resolve_import

MODULES = {
    "pkg": ModuleInfo("pkg", "pkg/__init__.py", is_package=True),
    "pkg.a": ModuleInfo("pkg.a", "pkg/a.py", is_package=False),
    "pkg.sub": ModuleInfo("pkg.sub", "pkg/sub/__init__.py", is_package=True),
    "pkg.sub.b": ModuleInfo("pkg.sub.b", "pkg/sub/b.py", is_package=False),
    "top": ModuleInfo("top", "top.py", is_package=False),
}
MODULE_IDS = frozenset(MODULES)
LOCAL_ROOTS = frozenset({"pkg", "top"})


def resolve(importer: str, module: str | None, name: str | None = None, level: int = 0):
    record = ImportRecord(module=module, name=name, level=level, lineno=1)
    resolved = resolve_import(record, MODULES[importer], MODULE_IDS, LOCAL_ROOTS)
    return resolved.kind, resolved.target


# --- absolute imports -------------------------------------------------------

def test_import_local_module():
    assert resolve("top", "pkg.sub.b") == (ImportKind.LOCAL, "pkg.sub.b")


def test_import_local_package_targets_its_init():
    assert resolve("top", "pkg.sub") == (ImportKind.LOCAL, "pkg.sub")


def test_from_package_import_submodule_targets_the_submodule():
    assert resolve("top", "pkg.sub", name="b") == (ImportKind.LOCAL, "pkg.sub.b")


def test_from_module_import_name_targets_the_module():
    assert resolve("top", "pkg.sub.b", name="SomeClass") == (ImportKind.LOCAL, "pkg.sub.b")


def test_from_package_import_unknown_name_targets_the_package():
    # We cannot verify the name exists without executing code; assume it is defined in pkg.
    assert resolve("top", "pkg", name="not_a_module") == (ImportKind.LOCAL, "pkg")


def test_star_import_targets_the_module():
    assert resolve("top", "pkg.sub", name="*") == (ImportKind.LOCAL, "pkg.sub")


# --- relative imports -------------------------------------------------------

def test_relative_from_module_uses_containing_package():
    # In pkg/sub/b.py, "." means pkg.sub
    assert resolve("pkg.sub.b", None, name="helper", level=1) == (ImportKind.LOCAL, "pkg.sub")


def test_relative_two_levels_up_to_sibling_module():
    assert resolve("pkg.sub.b", None, name="a", level=2) == (ImportKind.LOCAL, "pkg.a")
    assert resolve("pkg.sub.b", "a", name="func", level=2) == (ImportKind.LOCAL, "pkg.a")


def test_relative_from_package_init_uses_the_package_itself():
    # In pkg/sub/__init__.py, "." means pkg.sub (not pkg)
    assert resolve("pkg.sub", None, name="b", level=1) == (ImportKind.LOCAL, "pkg.sub.b")


def test_relative_import_beyond_top_level_package_is_unresolved():
    assert resolve("pkg.a", None, name="x", level=2) == (ImportKind.UNRESOLVED, None)


def test_relative_import_from_top_level_module_is_unresolved():
    assert resolve("top", None, name="x", level=1) == (ImportKind.UNRESOLVED, None)


def test_relative_import_of_missing_module_is_unresolved():
    assert resolve("pkg.a", "missing", name="x", level=1) == (ImportKind.UNRESOLVED, None)


# --- external vs unresolved -------------------------------------------------

@pytest.mark.parametrize(
    "module, name",
    [("os", None), ("os.path", None), ("collections", "OrderedDict"), ("requests", None)],
)
def test_non_local_top_level_name_is_external(module, name):
    assert resolve("top", module, name=name) == (ImportKind.EXTERNAL, None)


@pytest.mark.parametrize("module, name", [("pkg.missing", None), ("pkg.missing", "x"), ("top.nope", None)])
def test_missing_module_under_local_root_is_unresolved(module, name):
    assert resolve("top", module, name=name) == (ImportKind.UNRESOLVED, None)


# --- helpers ----------------------------------------------------------------

@pytest.mark.parametrize(
    "importer, module, level, expected",
    [
        ("pkg.sub.b", "x.y", 0, "x.y"),
        ("pkg.sub.b", None, 1, "pkg.sub"),
        ("pkg.sub.b", None, 2, "pkg"),
        ("pkg.sub.b", "a", 2, "pkg.a"),
        ("pkg.sub.b", None, 3, None),
        ("pkg.sub", None, 1, "pkg.sub"),
        ("pkg.sub", None, 2, "pkg"),
        ("top", None, 1, None),
    ],
)
def test_absolute_base(importer, module, level, expected):
    record = ImportRecord(module=module, name="n", level=level, lineno=1)
    assert absolute_base(record, MODULES[importer]) == expected


@pytest.mark.parametrize("importer", sorted(MODULES))
@pytest.mark.parametrize("level", [1, 2, 3, 4])
@pytest.mark.parametrize("module", [None, "x", "x.y"])
def test_absolute_base_agrees_with_importlib(importer, level, module):
    # Independent oracle: the standard library's own relative-name resolution.
    info = MODULES[importer]
    package = info.module_id if info.is_package else info.module_id.rpartition(".")[0]
    relative_name = "." * level + (module or "")
    try:
        expected = importlib.util.resolve_name(relative_name, package)
    except ImportError:  # beyond top-level package, or no package at all
        expected = None

    record = ImportRecord(module=module, name="n", level=level, lineno=1)
    assert absolute_base(record, info) == expected


def test_resolved_import_records_source_raw_and_line():
    record = ImportRecord(module="models", name="order", level=2, lineno=7)
    resolved = resolve_import(record, MODULES["pkg.sub.b"], MODULE_IDS, LOCAL_ROOTS)
    assert resolved.source == "pkg.sub.b"
    assert resolved.raw == "from ..models import order"
    assert resolved.lineno == 7


def test_format_import():
    assert format_import(ImportRecord("a.b", None, 0, 1)) == "import a.b"
    assert format_import(ImportRecord(None, "x", 1, 1)) == "from . import x"
    assert format_import(ImportRecord("m", "x", 3, 1)) == "from ...m import x"
