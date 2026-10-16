"""Consistency checks that must hold for ANY repository, through the real HTTP API.

Used on repositories whose exact edges nobody wrote down by hand (installed
packages, user-supplied paths), where the fixture's hand-written expectations
cannot apply. Impact is checked against a plain breadth-first search written here
from the API's own edge list, sharing no code with app.graph.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from urllib.parse import quote

from fastapi.testclient import TestClient


@dataclass
class CheckedRepository:
    modules: int
    edges: int
    largest_impact: int


def reverse_distances(changed: str, importers: dict[str, set[str]]) -> dict[str, int]:
    """Shortest number of import steps from each module that (transitively) imports `changed`."""
    distance = {changed: 0}
    queue = deque([changed])
    while queue:
        current = queue.popleft()
        for importer in importers[current]:
            if importer not in distance:
                distance[importer] = distance[current] + 1
                queue.append(importer)
    del distance[changed]
    return distance


def check_repository(client: TestClient, detail_sample: int | None = None) -> CheckedRepository:
    """Assert the invariants on every endpoint; returns counts for reporting.

    detail_sample limits how many /api/modules and /api/impact calls are made
    (None = every module).
    """
    health = client.get("/api/health").json()
    graph = client.get("/api/graph").json()
    nodes, edges = graph["nodes"], graph["edges"]
    ids = [n["id"] for n in nodes]
    pairs = [(e["source"], e["target"]) for e in edges]

    # Shape: unique, sorted, closed over the node set, no self-loops.
    assert ids == sorted(set(ids)), "node IDs must be unique and sorted"
    assert pairs == sorted(set(pairs)), "edges must be unique and sorted"
    id_set, edge_set = set(ids), set(pairs)
    assert all(s in id_set and t in id_set for s, t in pairs), "edge endpoint missing from nodes"
    assert all(s != t for s, t in pairs), "self-imports must not be edges"

    # Counts agree everywhere they are reported.
    assert graph["summary"]["modules"] == len(nodes) == health["module_count"]
    assert graph["summary"]["edges"] == len(edges) == health["edge_count"]
    imports: dict[str, set[str]] = {i: set() for i in ids}
    importers: dict[str, set[str]] = {i: set() for i in ids}
    for source, target in pairs:
        imports[source].add(target)
        importers[target].add(source)
    for node in nodes:
        assert node["dependency_count"] == len(imports[node["id"]]), node["id"]
        assert node["dependent_count"] == len(importers[node["id"]]), node["id"]

    issues = client.get("/api/scan/issues").json()
    assert len(issues["scan_errors"]) == graph["summary"]["scan_errors"]
    assert len(issues["unresolved_imports"]) == graph["summary"]["unresolved_imports"]
    assert len(issues["self_imports"]) == graph["summary"]["warnings"]

    largest = 0
    for module_id in ids if detail_sample is None else ids[:: max(1, len(ids) // detail_sample)]:
        encoded = quote(module_id, safe="")
        detail = client.get(f"/api/modules/{encoded}").json()
        assert detail["dependencies"] == sorted(imports[module_id]), module_id
        assert detail["dependents"] == sorted(importers[module_id]), module_id

        report = client.get(f"/api/impact/{encoded}").json()
        expected = reverse_distances(module_id, importers)
        actual = {m["id"]: m["distance"] for m in report["affected"]}
        assert actual == expected, f"impact of {module_id} differs from an independent BFS"
        assert [m["id"] for m in report["affected"]] == sorted(actual, key=lambda i: (actual[i], i))
        for module in report["affected"]:
            path = module["path"]
            assert path[0] == module["id"] and path[-1] == module_id
            assert len(path) == module["distance"] + 1
            assert all((a, b) in edge_set for a, b in zip(path, path[1:])), f"path {path} uses a non-edge"
        assert report["direct"] == [m["id"] for m in report["affected"] if m["distance"] == 1]
        assert report["transitive"] == [m["id"] for m in report["affected"] if m["distance"] > 1]
        largest = max(largest, len(actual))

    return CheckedRepository(modules=len(nodes), edges=len(edges), largest_impact=largest)
