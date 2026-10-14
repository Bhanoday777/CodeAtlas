"""Stage 3: decide what each ImportRecord refers to in this repository.

Rules, in order:
1. Convert relative imports to an absolute "base" module name using the
   importer's package. Climbing above the top-level package is UNRESOLVED.
2. For `from X import Y`, prefer the submodule X.Y if it exists locally
   (`from app.utils import helpers` depends on app.utils.helpers).
   Otherwise Y is a name defined inside X, so the dependency is on X.
3. If no local module matches:
   - relative imports are UNRESOLVED (they can only ever mean local code);
   - absolute imports whose top-level name is a local top-level package/module
     are UNRESOLVED (e.g. `import app.missing`);
   - everything else is EXTERNAL (stdlib or third-party).

Rule 3's local-vs-external split is a heuristic: a local package that shadows
an installed one by name would be treated as local.
"""

from __future__ import annotations

from app.parser.models import ImportKind, ImportRecord, ModuleInfo, ResolvedImport


def format_import(record: ImportRecord) -> str:
    """Rebuild a readable import statement, e.g. 'from ..models import order'."""
    if record.name is None:
        return f"import {record.module}"
    return f"from {'.' * record.level}{record.module or ''} import {record.name}"


def absolute_base(record: ImportRecord, importer: ModuleInfo) -> str | None:
    """Return the absolute module the import's `from` part refers to.

    Returns None when a relative import climbs above the top-level package.
    For absolute imports this is simply record.module.
    """
    if record.level == 0:
        return record.module

    # The package that "." refers to: the module itself if it is a package
    # (__init__.py), otherwise the package containing it.
    package_parts = importer.module_id.split(".")
    if not importer.is_package:
        package_parts = package_parts[:-1]

    # Each extra dot climbs one package up.
    climb = record.level - 1
    if climb >= len(package_parts):
        return None
    base_parts = package_parts[: len(package_parts) - climb]
    if record.module:
        base_parts.append(record.module)
    return ".".join(base_parts)


def resolve_import(
    record: ImportRecord,
    importer: ModuleInfo,
    module_ids: set[str] | frozenset[str],
    local_roots: set[str] | frozenset[str],
) -> ResolvedImport:
    """Classify one import as LOCAL (with a target), EXTERNAL, or UNRESOLVED.

    module_ids:  every module ID discovered in the repository.
    local_roots: the first component of every module ID, e.g. {"app"}.
    """

    def result(kind: ImportKind, target: str | None = None) -> ResolvedImport:
        return ResolvedImport(
            source=importer.module_id,
            raw=format_import(record),
            kind=kind,
            target=target,
            lineno=record.lineno,
        )

    base = absolute_base(record, importer)
    if base is None:
        return result(ImportKind.UNRESOLVED)

    # Rule 2: `from X import Y` where X.Y is a submodule.
    if record.name is not None and record.name != "*":
        submodule = f"{base}.{record.name}"
        if submodule in module_ids:
            return result(ImportKind.LOCAL, submodule)

    if base in module_ids:
        return result(ImportKind.LOCAL, base)

    # Rule 3: nothing local matched.
    if record.level > 0 or base.split(".")[0] in local_roots:
        return result(ImportKind.UNRESOLVED)
    return result(ImportKind.EXTERNAL)
