"""Directed module dependency graph and change-impact analysis.

Edge convention (same as the parser): (A, B) means module A imports module B.

The graph keeps every edge in two adjacency lists, one per direction:

    dependencies[A] = modules A imports          A -> B
    dependents[B]   = modules that import B      B <- A

Impact analysis walks the reverse direction: if B changes, every module that
imports B may be affected, then every module importing those, and so on.

Results are static estimates. They follow import statements only, so they
can miss runtime-only dependencies (e.g. dynamic imports) and can include
imports that never execute (e.g. under `if TYPE_CHECKING:`).

Complexity, with V modules and E edges:
    construction             O(V + E), plus O(V log V + E log E) for sorting
    dependencies_of / dependents_of   O(1) lookup (lists are pre-sorted)
    impact()                 O(V + E) for the BFS, plus the total length of
                             the returned paths (O(V^2) worst case, e.g. a
                             long chain, where every path is long)
    explanation_path()       O(V + E) for the BFS, plus O(V) for one path
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass

from app.parser.models import ScanResult


class UnknownModuleError(LookupError):
    """A query named a module that is not in the graph.

    Kept distinct from an empty result: a known module with no dependents
    returns an empty report, an unknown one raises this.
    """

    def __init__(self, module_id: str) -> None:
        super().__init__(f"Unknown module: {module_id!r}")
        self.module_id = module_id


@dataclass(frozen=True)
class AffectedModule:
    """A module that may be affected by a change.

    distance: number of import edges to the changed module (1 = direct dependent).
    path:     one shortest chain of imports, in import direction, from this
              module to the changed module, e.g.
              ("shop.main", "shop.services.orders", "shop.models.order").
              len(path) == distance + 1.
    """

    module_id: str
    distance: int
    path: tuple[str, ...]


@dataclass(frozen=True)
class ImpactReport:
    """Every module that directly or transitively imports changed_module.

    affected is sorted by (distance, module_id) and never includes
    changed_module itself, even when it is part of an import cycle.
    """

    changed_module: str
    affected: tuple[AffectedModule, ...]

    @property
    def direct(self) -> tuple[AffectedModule, ...]:
        """Modules that import changed_module themselves."""
        return tuple(m for m in self.affected if m.distance == 1)

    @property
    def transitive(self) -> tuple[AffectedModule, ...]:
        """Modules affected only through other modules."""
        return tuple(m for m in self.affected if m.distance > 1)


class DependencyGraph:
    """Immutable directed graph of local module imports."""

    def __init__(self, modules: Iterable[str], edges: Iterable[tuple[str, str]]) -> None:
        """Build the graph. Every module becomes a node, even with no edges.

        Duplicate edges are merged (importing a module twice is valid Python).
        Raises ValueError for an edge whose endpoint is not in `modules`, or
        for a self-loop: the parser never produces one, so it signals bad input.
        """
        module_set = set(modules)
        forward: dict[str, set[str]] = {m: set() for m in module_set}
        reverse: dict[str, set[str]] = {m: set() for m in module_set}

        for source, target in edges:
            for endpoint in (source, target):
                if endpoint not in module_set:
                    raise ValueError(
                        f"Edge {source!r} -> {target!r} refers to unknown module {endpoint!r}"
                    )
            if source == target:
                raise ValueError(f"Self-loop edge on {source!r}: a module cannot depend on itself")
            forward[source].add(target)
            reverse[target].add(source)

        # Freeze as sorted tuples so every query returns the same order every time.
        self._modules = tuple(sorted(module_set))
        self._dependencies = {m: tuple(sorted(targets)) for m, targets in forward.items()}
        self._dependents = {m: tuple(sorted(sources)) for m, sources in reverse.items()}

    @classmethod
    def from_scan(cls, scan: ScanResult) -> DependencyGraph:
        """Build the graph from a parser scan: all modules, all local edges."""
        return cls(scan.modules, scan.local_edges())

    @property
    def modules(self) -> tuple[str, ...]:
        """All module IDs, sorted."""
        return self._modules

    @property
    def edges(self) -> tuple[tuple[str, str], ...]:
        """All (importer, imported) edges, sorted."""
        return tuple((a, b) for a in self._modules for b in self._dependencies[a])

    def __contains__(self, module_id: object) -> bool:
        return module_id in self._dependencies

    def dependencies_of(self, module_id: str) -> tuple[str, ...]:
        """Modules that module_id imports directly, sorted."""
        self._require(module_id)
        return self._dependencies[module_id]

    def dependents_of(self, module_id: str) -> tuple[str, ...]:
        """Modules that import module_id directly, sorted (its direct impact)."""
        self._require(module_id)
        return self._dependents[module_id]

    def impact(self, changed: str) -> ImpactReport:
        """All modules that may be affected if `changed` changes, with one path each."""
        self._require(changed)
        next_hop = self._reverse_bfs(changed)
        paths = [self._path(m, next_hop) for m in next_hop if m != changed]
        affected = [AffectedModule(path[0], len(path) - 1, path) for path in paths]
        affected.sort(key=lambda m: (m.distance, m.module_id))
        return ImpactReport(changed, tuple(affected))

    def explanation_path(self, source: str, target: str) -> tuple[str, ...] | None:
        """One shortest import chain source -> ... -> target.

        Returns None when source does not depend on target, including when
        source == target. Gives the same path as impact(target) for source.
        """
        self._require(source)
        self._require(target)
        next_hop = self._reverse_bfs(target, stop_at=source)
        if source == target or source not in next_hop:
            return None
        return self._path(source, next_hop)

    def _reverse_bfs(self, changed: str, stop_at: str | None = None) -> dict[str, str | None]:
        """Breadth-first search from `changed` along reverse (imported-by) edges.

        Returns next_hop: for every reached module m, the module m imports on
        its shortest route to `changed` (None for `changed` itself). Following
        next_hop from any module rebuilds a valid shortest path, because each
        step was a real edge "m imports next_hop[m]".

        BFS reaches modules in order of distance, so the first time a module is
        seen is via a shortest route; later sightings are ignored. That same
        check is what stops import cycles from looping forever. Dependents are
        visited in sorted order, so ties between equally short routes are
        broken the same way on every run.
        """
        next_hop: dict[str, str | None] = {changed: None}
        queue = deque([changed])
        while queue:
            current = queue.popleft()
            for dependent in self._dependents[current]:
                if dependent in next_hop:
                    continue
                next_hop[dependent] = current
                if dependent == stop_at:
                    return next_hop
                queue.append(dependent)
        return next_hop

    @staticmethod
    def _path(start: str, next_hop: dict[str, str | None]) -> tuple[str, ...]:
        path = [start]
        while (step := next_hop[path[-1]]) is not None:
            path.append(step)
        return tuple(path)

    def _require(self, module_id: str) -> None:
        if module_id not in self._dependencies:
            raise UnknownModuleError(module_id)
