"""Print a scan report for manual checking:  python -m app.parser <repo_path>"""

import sys
from pathlib import Path

from app.parser.models import ImportKind
from app.parser.scanner import scan_repository


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("usage: python -m app.parser <repo_path>", file=sys.stderr)
        return 2

    root = Path(args[0])
    try:
        result = scan_repository(root)
    except NotADirectoryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"Scanned {root.resolve()}")
    print(f"\nModules ({len(result.modules)}):")
    for info in sorted(result.modules.values(), key=lambda m: m.module_id):
        print(f"  {info.module_id:<35} {info.path}")

    edges = sorted(result.local_edges())
    print(f"\nLocal edges, A -> B means A imports B ({len(edges)}):")
    for source, target in edges:
        print(f"  {source} -> {target}")

    for kind in (ImportKind.EXTERNAL, ImportKind.UNRESOLVED):
        imports = [imp for imp in result.imports if imp.kind is kind]
        print(f"\n{kind.value.capitalize()} imports ({len(imports)}):")
        for imp in imports:
            print(f"  {imp.source}:{imp.lineno}  {imp.raw}")

    print(f"\nScan errors ({len(result.errors)}):")
    for error in result.errors:
        location = error.path if error.lineno is None else f"{error.path}:{error.lineno}"
        print(f"  {location}  {error.message}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
