"""Stage 2: extract import statements from Python source using the `ast` module.

Source is parsed, never executed. ast.walk visits every node, so imports nested
inside functions, classes, `if` and `try` blocks are found too.
"""

from __future__ import annotations

import ast

from app.parser.models import ImportRecord


def extract_imports(source: str | bytes, filename: str = "<unknown>") -> list[ImportRecord]:
    """Return one ImportRecord per imported target, in source order.

    Raises SyntaxError (or ValueError for invalid source bytes) if the source
    cannot be parsed; the caller decides how to report that.
    Passing bytes lets `ast` honour PEP 263 encoding declarations.
    """
    tree = ast.parse(source, filename=filename)
    records: list[ImportRecord] = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            # import a.b, c as d  -> one record per alias; the `as` name is irrelevant
            for alias in node.names:
                records.append(ImportRecord(module=alias.name, name=None, level=0, lineno=node.lineno))
        elif isinstance(node, ast.ImportFrom):
            # from ..pkg import x, y  -> node.module="pkg", node.level=2
            # from . import x         -> node.module=None, node.level=1
            for alias in node.names:
                records.append(
                    ImportRecord(module=node.module, name=alias.name, level=node.level, lineno=node.lineno)
                )

    # ast.walk is breadth-first, so nested imports would come out of line order.
    records.sort(key=lambda r: r.lineno)
    return records
