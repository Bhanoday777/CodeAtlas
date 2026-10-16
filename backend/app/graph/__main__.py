"""Print a change-impact report for manual checking:

    python -m app.graph <repo_path> <module_id>

Without module_id, lists every module with its import counts.
"""

import sys
from pathlib import Path

from app.graph.dependency_graph import DependencyGraph, UnknownModuleError
from app.parser.scanner import scan_repository


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args or len(args) > 2:
        print("usage: python -m app.graph <repo_path> [module_id]", file=sys.stderr)
        return 2

    root = Path(args[0])
    try:
        scan = scan_repository(root)
    except NotADirectoryError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    graph = DependencyGraph.from_scan(scan)
    print(
        f"Scanned {root.resolve()}: {len(graph.modules)} modules, "
        f"{len(graph.edges)} edges, {len(scan.errors)} scan errors"
    )

    if len(args) == 1:
        print("\nModule  (imports / imported by):")
        for module_id in graph.modules:
            deps, users = graph.dependencies_of(module_id), graph.dependents_of(module_id)
            print(f"  {module_id:<35} {len(deps):>3} / {len(users)}")
        return 0

    changed = args[1]
    try:
        report = graph.impact(changed)
    except UnknownModuleError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(f"\nChanged module: {changed}")
    print(f"Imports ({len(graph.dependencies_of(changed))}): {', '.join(graph.dependencies_of(changed))}")
    print(f"Imported by ({len(graph.dependents_of(changed))}): {', '.join(graph.dependents_of(changed))}")
    print(
        f"\nMay be affected ({len(report.affected)}: "
        f"{len(report.direct)} direct, {len(report.transitive)} transitive):"
    )
    for module in report.affected:
        print(f"  [{module.distance}] {module.module_id:<35} {' -> '.join(module.path)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
