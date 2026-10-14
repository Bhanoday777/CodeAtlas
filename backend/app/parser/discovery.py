"""Stage 1: find Python files and assign each a dotted module ID.

The repository root is treated as the import root, so
    <root>/app/services/orders.py   -> "app.services.orders"
    <root>/app/services/__init__.py -> "app.services"
"""

from __future__ import annotations

import os
from pathlib import Path, PurePosixPath

from app.parser.models import ModuleInfo, ScanError

# Directories that never contain the project's own source code.
# Dot-directories (.git, .venv, .tox, ...) are skipped separately.
SKIPPED_DIRS = frozenset({"__pycache__", "node_modules", "venv", "env", "site-packages"})


def path_to_module_id(relative_path: PurePosixPath) -> tuple[str, bool]:
    """Convert a repo-relative .py path to (module_id, is_package).

    Returns an empty module_id for a root-level __init__.py, which has no
    importable name when the repository root is the import root.
    """
    parts = list(relative_path.with_suffix("").parts)
    is_package = parts[-1] == "__init__"
    if is_package:
        parts = parts[:-1]
    return ".".join(parts), is_package


def discover_modules(root: Path) -> tuple[dict[str, ModuleInfo], list[ScanError]]:
    """Recursively find .py files under root.

    Returns (module_id -> ModuleInfo, errors). Symlinked directories are not
    followed, so the walk cannot leave the repository.
    """
    modules: dict[str, ModuleInfo] = {}
    errors: list[ScanError] = []

    for dirpath, dirnames, filenames in os.walk(root):
        # Prune in place so os.walk does not descend into skipped directories.
        # Sorting makes scan order (and therefore output) deterministic.
        dirnames[:] = sorted(
            d for d in dirnames if not d.startswith(".") and d not in SKIPPED_DIRS
        )
        for filename in sorted(filenames):
            if not filename.endswith(".py"):
                continue
            relative = PurePosixPath(Path(dirpath, filename).relative_to(root).as_posix())
            module_id, is_package = path_to_module_id(relative)

            if not module_id:
                errors.append(
                    ScanError(str(relative), "skipped: __init__.py at the repository root has no module name")
                )
                continue

            info = ModuleInfo(module_id=module_id, path=str(relative), is_package=is_package)
            existing = modules.get(module_id)
            if existing is not None:
                # e.g. both app/utils.py and app/utils/__init__.py exist.
                # Python's import system prefers the package, so we do too.
                keep, drop = (info, existing) if info.is_package else (existing, info)
                modules[module_id] = keep
                errors.append(
                    ScanError(drop.path, f"skipped: module name '{module_id}' conflicts with {keep.path}")
                )
                continue
            modules[module_id] = info

    return modules, errors
