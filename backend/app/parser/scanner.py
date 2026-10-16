"""Entry point: run discovery -> extraction -> resolution over a repository."""

from __future__ import annotations

from pathlib import Path

from app.parser.discovery import discover_modules
from app.parser.extractor import extract_imports
from app.parser.models import ScanError, ScanResult
from app.parser.resolver import resolve_import


def scan_repository(root: Path) -> ScanResult:
    """Statically scan every Python file under root. Never executes code.

    A file that cannot be read or parsed (including source too deeply nested for
    `ast`) is recorded in `errors` and still
    appears in `modules` (it exists and other files may import it); it simply
    contributes no outgoing imports.
    """
    root = Path(root)
    if not root.is_dir():
        raise NotADirectoryError(f"Repository root is not a directory: {root}")

    modules, errors = discover_modules(root)
    module_ids = frozenset(modules)
    local_roots = frozenset(module_id.split(".")[0] for module_id in modules)
    result = ScanResult(modules=modules, errors=errors)

    for info in sorted(modules.values(), key=lambda m: m.path):
        try:
            source = (root / info.path).read_bytes()
            records = extract_imports(source, filename=info.path)
        except SyntaxError as exc:
            result.errors.append(ScanError(info.path, f"SyntaxError: {exc.msg}", exc.lineno))
            continue
        except (OSError, ValueError) as exc:
            result.errors.append(ScanError(info.path, f"{type(exc).__name__}: {exc}"))
            continue
        except (RecursionError, MemoryError) as exc:
            # ast.parse raises these for very deeply nested source ("parser stack
            # overflowed"). The parser's partial state is gone by now, so one such
            # file is skipped like a syntax error instead of ending the whole scan.
            result.errors.append(ScanError(info.path, f"{type(exc).__name__}: source is too complex to parse"))
            continue

        for record in records:
            result.imports.append(resolve_import(record, info, module_ids, local_roots))

    return result
