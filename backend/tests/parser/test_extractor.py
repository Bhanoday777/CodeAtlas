import pytest

from app.parser.extractor import extract_imports
from app.parser.models import ImportRecord


def test_plain_import_and_multiple_aliases():
    records = extract_imports("import os\nimport a.b, c as d\n")
    assert records == [
        ImportRecord(module="os", name=None, level=0, lineno=1),
        ImportRecord(module="a.b", name=None, level=0, lineno=2),
        ImportRecord(module="c", name=None, level=0, lineno=2),
    ]


def test_from_import_produces_one_record_per_name():
    records = extract_imports("from pkg.mod import x, y as z\n")
    assert records == [
        ImportRecord(module="pkg.mod", name="x", level=0, lineno=1),
        ImportRecord(module="pkg.mod", name="y", level=0, lineno=1),
    ]


def test_relative_imports_keep_level_and_optional_module():
    records = extract_imports("from . import a\nfrom ..models import order\n")
    assert records == [
        ImportRecord(module=None, name="a", level=1, lineno=1),
        ImportRecord(module="models", name="order", level=2, lineno=2),
    ]


def test_star_import():
    assert extract_imports("from pkg import *\n") == [
        ImportRecord(module="pkg", name="*", level=0, lineno=1)
    ]


def test_nested_imports_are_found_and_returned_in_line_order():
    source = (
        "def f():\n"
        "    import inner\n"
        "try:\n"
        "    import optional\n"
        "except ImportError:\n"
        "    pass\n"
        "import top\n"
    )
    assert [(r.module, r.lineno) for r in extract_imports(source)] == [
        ("inner", 2),
        ("optional", 4),
        ("top", 7),
    ]


def test_duplicate_imports_are_kept_as_separate_records():
    # Deduplication happens at the edge level, not here: line numbers stay accurate.
    records = extract_imports("import a\nimport a\n")
    assert [r.lineno for r in records] == [1, 2]


@pytest.mark.parametrize("source", ["", "\n\n", "# only a comment\n", '"""docstring"""\n'])
def test_files_without_imports_return_empty_list(source):
    assert extract_imports(source) == []


def test_syntax_error_raises():
    with pytest.raises(SyntaxError):
        extract_imports("def broken(:\n    pass\n")


def test_source_is_parsed_not_executed():
    source = "import os\nraise RuntimeError('this must never run')\n"
    assert [r.module for r in extract_imports(source)] == ["os"]


def test_bytes_source_with_encoding_declaration():
    source = "# -*- coding: latin-1 -*-\nimport os\nname = 'caf\xe9'\n".encode("latin-1")
    assert [r.module for r in extract_imports(source)] == ["os"]
