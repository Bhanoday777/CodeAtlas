from pathlib import Path, PurePosixPath

import pytest

from app.parser.discovery import discover_modules, path_to_module_id


def touch(root: Path, relative: str, content: str = "") -> None:
    path = root / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@pytest.mark.parametrize(
    "path, expected",
    [
        ("main.py", ("main", False)),
        ("app/services/orders.py", ("app.services.orders", False)),
        ("app/services/__init__.py", ("app.services", True)),
        ("__init__.py", ("", True)),
    ],
)
def test_path_to_module_id(path, expected):
    assert path_to_module_id(PurePosixPath(path)) == expected


def test_discovers_nested_packages_with_posix_paths(tmp_path):
    touch(tmp_path, "main.py")
    touch(tmp_path, "app/__init__.py")
    touch(tmp_path, "app/core/__init__.py")
    touch(tmp_path, "app/core/deep/thing.py")

    modules, errors = discover_modules(tmp_path)

    assert errors == []
    assert sorted(modules) == ["app", "app.core", "app.core.deep.thing", "main"]
    assert modules["app.core"].path == "app/core/__init__.py"
    assert modules["app.core"].is_package is True
    assert modules["app.core.deep.thing"].path == "app/core/deep/thing.py"
    assert modules["app.core.deep.thing"].is_package is False


def test_skips_virtualenvs_caches_hidden_dirs_and_non_python_files(tmp_path):
    touch(tmp_path, "keep.py")
    for skipped in [
        ".venv/lib/x.py",
        ".git/hooks/y.py",
        "venv/lib/z.py",
        "node_modules/pkg/w.py",
        "__pycache__/v.py",
        "nested/__pycache__/u.py",
    ]:
        touch(tmp_path, skipped)
    touch(tmp_path, "notes.txt")
    touch(tmp_path, "script.pyc")

    modules, errors = discover_modules(tmp_path)

    assert list(modules) == ["keep"]
    assert errors == []


def test_empty_directory(tmp_path):
    assert discover_modules(tmp_path) == ({}, [])


def test_root_init_is_reported_not_silently_dropped(tmp_path):
    touch(tmp_path, "__init__.py")
    touch(tmp_path, "a.py")

    modules, errors = discover_modules(tmp_path)

    assert list(modules) == ["a"]
    assert [e.path for e in errors] == ["__init__.py"]


def test_module_and_package_name_conflict_prefers_package(tmp_path):
    touch(tmp_path, "app/utils.py")
    touch(tmp_path, "app/utils/__init__.py")

    modules, errors = discover_modules(tmp_path)

    assert modules["app.utils"].path == "app/utils/__init__.py"
    assert [e.path for e in errors] == ["app/utils.py"]
    assert "conflicts" in errors[0].message
