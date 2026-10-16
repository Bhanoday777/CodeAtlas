"""A generated repository of 2,021 modules: strict correctness, generous time limits.

The generator knows every import it writes, so the expected edge set is exact
(not a sample, not an invariant): the scan must find exactly those edges. The
repository has import cycles across packages, a 100-module import chain (shortened by random cross-imports), and four
import forms (absolute `import`, absolute `from`, relative `from .` and `from ..`).
Packages sit under one root package (`proj`), so `from ..pkgXX` stays inside it,
as Python requires.

Timing is measured and reported (see "measured runtimes" in the pytest summary).
The limits only catch accidental blow-ups (e.g. quadratic work per module); they
are far above the measured times so a slow or busy machine does not fail them.

The scan is timed twice. The first ("cold") read of freshly written files can be
dominated by the OS, e.g. antivirus on-access scanning on Windows; the second
("warm") scan of the same files is closer to the scanner's own cost.
"""

from __future__ import annotations

import random
import time
from collections import deque
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.graph.dependency_graph import DependencyGraph
from app.main import create_app
from app.parser.scanner import scan_repository

PACKAGES = 20
MODULES_PER_PACKAGE = 100
SEED = 20261016  # fixed: the same repository on every run

MODULE_COUNT = 1 + PACKAGES * (MODULES_PER_PACKAGE + 1)  # proj + each package's __init__ and modules
COLD_SCAN_LIMIT_S = 180.0
WARM_SCAN_LIMIT_S = 60.0
IMPACT_ALL_LIMIT_S = 120.0
PATH_SAMPLE = 40  # modules whose every explanation path is walked edge by edge


def generate(root: Path) -> set[tuple[str, str]]:
    """Write the repository under root; return the exact (importer, imported) edges."""
    rng = random.Random(SEED)
    ids = [f"proj.pkg{p:02d}.m{m:03d}" for p in range(PACKAGES) for m in range(MODULES_PER_PACKAGE)]
    edges: set[tuple[str, str]] = set()
    (root / "proj").mkdir()
    (root / "proj" / "__init__.py").write_text('"""Generated root package."""\n', encoding="utf-8")
    for p in range(PACKAGES):
        package = root / "proj" / f"pkg{p:02d}"
        package.mkdir()
        (package / "__init__.py").write_text('"""Generated package."""\n', encoding="utf-8")
        for m in range(MODULES_PER_PACKAGE):
            me = f"proj.pkg{p:02d}.m{m:03d}"
            lines = ["import os", "from typing import Any"]  # external: never edges
            targets = set(rng.sample(ids, rng.randint(0, 3))) - {me}
            if p == PACKAGES - 1 and m > 0:
                targets.add(f"proj.pkg{p:02d}.m{m - 1:03d}")  # the long chain
            for target in sorted(targets):
                _, target_pkg, target_mod = target.split(".")
                form = rng.randrange(3)
                if form == 0:
                    lines.append(f"import {target}")
                elif form == 1:
                    lines.append(f"from {target} import name_{rng.randrange(9)}")
                elif target_pkg == f"pkg{p:02d}":
                    lines.append(f"from .{target_mod} import name_{rng.randrange(9)}")
                else:
                    lines.append(f"from ..{target_pkg}.{target_mod} import name")
                edges.add((me, target))
            (package / f"m{m:03d}.py").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return edges


def reverse_distances(changed: str, importers: dict[str, list[str]]) -> dict[str, int]:
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


@pytest.fixture(scope="module")
def generated(tmp_path_factory):
    root = tmp_path_factory.mktemp("scale_repo")
    return root, generate(root)


def test_scale_repository(generated, record_timing):
    root, expected_edges = generated
    module_count = MODULE_COUNT

    start = time.perf_counter()
    scan_repository(root)
    cold_scan_s = time.perf_counter() - start
    start = time.perf_counter()
    scan = scan_repository(root)
    warm_scan_s = time.perf_counter() - start

    # Correctness: exact module set, exact edge set, nothing unexpected.
    assert len(scan.modules) == module_count
    assert scan.errors == []
    assert scan.local_edges() == expected_edges

    start = time.perf_counter()
    graph = DependencyGraph.from_scan(scan)
    reports = {m: graph.impact(m) for m in graph.modules}
    impact_s = time.perf_counter() - start

    importers: dict[str, list[str]] = {m: [] for m in graph.modules}
    for source, target in expected_edges:
        importers[target].append(source)
    for module_id, report in reports.items():
        expected = reverse_distances(module_id, importers)
        assert {a.module_id: a.distance for a in report.affected} == expected, module_id

    # Walk every explanation path of a fixed sample, edge by edge.
    for module_id in sorted(reports)[:: len(reports) // PATH_SAMPLE]:
        for affected in reports[module_id].affected:
            path = affected.path
            assert path[0] == affected.module_id and path[-1] == module_id
            assert all(step in expected_edges for step in zip(path, path[1:]))

    longest = max(a.distance for r in reports.values() for a in r.affected)
    affected_total = sum(len(r.affected) for r in reports.values())

    record_timing(
        "scale repository",
        f"{module_count} modules, {len(expected_edges)} edges; scan cold {cold_scan_s:.2f}s / warm {warm_scan_s:.2f}s; "
        f"graph + impact of all {module_count} modules {impact_s:.2f}s "
        f"({affected_total} affected entries, longest distance {longest})",
    )
    assert cold_scan_s < COLD_SCAN_LIMIT_S, f"cold scan took {cold_scan_s:.1f}s (limit {COLD_SCAN_LIMIT_S}s)"
    assert warm_scan_s < WARM_SCAN_LIMIT_S, f"warm scan took {warm_scan_s:.1f}s (limit {WARM_SCAN_LIMIT_S}s)"
    assert impact_s < IMPACT_ALL_LIMIT_S, f"impact of every module took {impact_s:.1f}s (limit {IMPACT_ALL_LIMIT_S}s)"


def test_scale_repository_through_the_api(generated, record_timing):
    root, expected_edges = generated
    start = time.perf_counter()
    with TestClient(create_app(root)) as client:
        startup_s = time.perf_counter() - start
        start = time.perf_counter()
        graph = client.get("/api/graph").json()
        graph_s = time.perf_counter() - start
        report = client.get("/api/impact/proj.pkg19.m000").json()

    assert {(e["source"], e["target"]) for e in graph["edges"]} == expected_edges
    assert graph["summary"]["modules"] == MODULE_COUNT
    assert report["changed_module"] == "proj.pkg19.m000" and len(report["affected"]) > 0
    record_timing(
        "scale repository (API)",
        f"startup scan {startup_s:.2f}s, GET /api/graph {graph_s:.2f}s ({len(graph['nodes'])} nodes)",
    )
