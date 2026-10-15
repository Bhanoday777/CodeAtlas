"""The scan and graph of one repository, computed once at startup.

The graph alone has no file paths or import details, so the API keeps the
ScanResult next to it. Nothing here re-implements graph logic.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.api.schemas import Diagnostic
from app.graph.dependency_graph import DependencyGraph
from app.parser.models import ImportKind, ResolvedImport, ScanResult
from app.parser.scanner import scan_repository

LIMITATIONS = [
    "Static analysis of import statements only; analyzed code is never executed.",
    "Dynamic imports (importlib.import_module, __import__) are not detected.",
    "Imports under `if TYPE_CHECKING:` count as dependencies and can overstate impact.",
    "An empty issue list does not mean the analysis is complete or that there are no "
    "runtime dependencies.",
]


@dataclass(frozen=True)
class RepositoryAnalysis:
    root: Path
    scan: ScanResult
    graph: DependencyGraph

    @classmethod
    def load(cls, root: Path) -> RepositoryAnalysis:
        scan = scan_repository(root)
        return cls(root=root, scan=scan, graph=DependencyGraph.from_scan(scan))

    @property
    def name(self) -> str:
        return self.root.name

    def imports_of_kind(self, kind: ImportKind) -> list[ResolvedImport]:
        """Imports of one kind, sorted by (module, line, text)."""
        return sorted(
            (imp for imp in self.scan.imports if imp.kind is kind),
            key=lambda imp: (imp.source, imp.lineno, imp.raw),
        )

    def self_imports(self) -> list[ResolvedImport]:
        """Local imports of a module by itself: kept by the parser, not graph edges."""
        return [imp for imp in self.imports_of_kind(ImportKind.LOCAL) if imp.target == imp.source]

    def error_paths(self) -> set[str]:
        return {error.path for error in self.scan.errors}

    def impact_diagnostics(self) -> list[Diagnostic]:
        """Repository-wide reasons an impact report may miss affected modules."""
        diagnostics = []
        if self.scan.errors:
            paths = ", ".join(sorted(self.error_paths()))
            diagnostics.append(
                Diagnostic(
                    code="scan_errors",
                    message=(
                        f"{len(self.scan.errors)} file(s) could not be parsed ({paths}). "
                        "Their imports are missing from the graph, so impact reports can "
                        "miss modules that depend on a change through them."
                    ),
                )
            )
        unresolved = self.imports_of_kind(ImportKind.UNRESOLVED)
        if unresolved:
            diagnostics.append(
                Diagnostic(
                    code="unresolved_imports",
                    message=(
                        f"{len(unresolved)} import(s) look local but match no module in the "
                        "repository. They are not graph edges."
                    ),
                )
            )
        return diagnostics

    def all_diagnostics(self) -> list[Diagnostic]:
        diagnostics = self.impact_diagnostics()
        self_imports = self.self_imports()
        if self_imports:
            diagnostics.append(
                Diagnostic(
                    code="self_imports",
                    message=(
                        f"{len(self_imports)} import(s) refer to their own module. "
                        "They are reported here but are not graph edges."
                    ),
                )
            )
        return diagnostics
