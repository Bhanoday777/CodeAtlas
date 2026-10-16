"""Plain data structures produced by the parser.

The parser is split into three stages, each producing one of these types:

    discovery.py  -> ModuleInfo       (which .py files exist, and their module IDs)
    extractor.py  -> ImportRecord     (what import statements a file contains)
    resolver.py   -> ResolvedImport   (what each import refers to in this repository)

Problems never raise out of a scan; they are collected as ScanError values.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


@dataclass(frozen=True)
class ModuleInfo:
    """A Python file in the scanned repository.

    module_id: dotted import name, e.g. "app.services.orders".
               A package's __init__.py gets the package name, e.g. "app.services".
    path:      repository-relative POSIX path, e.g. "app/services/orders.py".
    is_package: True for __init__.py files. Needed to resolve relative imports,
               because "." inside a package's __init__ means the package itself.
    """

    module_id: str
    path: str
    is_package: bool


@dataclass(frozen=True)
class ImportRecord:
    """One imported target exactly as written in source, before resolution.

    `import a.b, c`            -> two records: module="a.b", module="c"
    `from ..models import x`   -> module="models", name="x", level=2
    `from . import pricing`    -> module=None, name="pricing", level=1

    name is None for plain `import x` statements.
    level is 0 for absolute imports, N for N leading dots.
    """

    module: str | None
    name: str | None
    level: int
    lineno: int


class ImportKind(str, Enum):
    LOCAL = "local"            # resolved to a module in this repository
    EXTERNAL = "external"      # stdlib or third-party; not part of the graph
    UNRESOLVED = "unresolved"  # looks local but no matching module exists


@dataclass(frozen=True)
class ResolvedImport:
    """An ImportRecord after resolution against the repository's module index.

    target is the local module ID when kind is LOCAL, otherwise None.
    raw is a human-readable form of the original import, for display/debugging.
    """

    source: str
    raw: str
    kind: ImportKind
    target: str | None
    lineno: int


@dataclass(frozen=True)
class ScanError:
    """A file that could not be fully analyzed (syntax error, unreadable, ...)."""

    path: str
    message: str
    lineno: int | None = None


@dataclass
class ScanResult:
    """Everything a repository scan produces.

    modules:  module_id -> ModuleInfo, for every discovered .py file
              (including files with syntax errors: they exist, we just
              couldn't read their imports).
    imports:  every resolved import, including duplicates, in source order.
    errors:   files that could not be parsed.
    """

    modules: dict[str, ModuleInfo] = field(default_factory=dict)
    imports: list[ResolvedImport] = field(default_factory=list)
    errors: list[ScanError] = field(default_factory=list)

    def local_edges(self) -> set[tuple[str, str]]:
        """Deduplicated (importer, imported) pairs between local modules.

        Edge convention: (A, B) means module A depends on module B: A imports B,
        or A imports something inside package B. Python runs every enclosing
        package's __init__.py before the module itself, so `import a.b.c` gives
        edges to a.b.c, a.b and a (those that exist as packages).

        Self-imports (e.g. `from . import name` inside a package's own
        __init__.py) stay in `imports` but add no edges, not even to parent
        packages: by the time a module runs, its own parents have already run.
        """
        edges: set[tuple[str, str]] = set()
        for imp in self.imports:
            if imp.kind is not ImportKind.LOCAL or imp.target is None or imp.target == imp.source:
                continue
            for target in (imp.target, *self.parent_packages(imp.target)):
                if target != imp.source:
                    edges.add((imp.source, target))
        return edges

    def parent_packages(self, module_id: str) -> list[str]:
        """Enclosing packages of module_id that exist in the scan, nearest first.

        "shop.models.order" -> ["shop.models", "shop"]. A namespace package (no
        __init__.py) has no code to run and no module, so it is skipped; so is a
        plain module that happens to share a folder's name.
        """
        parts = module_id.split(".")
        parents = []
        for end in range(len(parts) - 1, 0, -1):
            info = self.modules.get(".".join(parts[:end]))
            if info is not None and info.is_package:
                parents.append(info.module_id)
        return parents
