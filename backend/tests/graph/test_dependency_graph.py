"""Unit tests for DependencyGraph on small hand-built graphs.

Edges are (A, B) = "A imports B". Expected results are written out in full
and compared with exact equality, so missing and extra modules both fail.
"""

import random

import pytest

from app.graph.dependency_graph import (
    AffectedModule,
    DependencyGraph,
    ImpactReport,
    UnknownModuleError,
)


def build(edges, extra_modules=()):
    """Graph whose modules are every edge endpoint plus extra_modules."""
    modules = {m for edge in edges for m in edge} | set(extra_modules)
    return DependencyGraph(modules, edges)


def assert_valid_path(graph, affected, changed):
    """A path must follow real import edges from the affected module to the changed one."""
    path = affected.path
    assert path[0] == affected.module_id
    assert path[-1] == changed
    assert len(path) == affected.distance + 1
    assert len(set(path)) == len(path), "path repeats a module"
    for importer, imported in zip(path, path[1:]):
        assert imported in graph.dependencies_of(importer), f"{importer} does not import {imported}"


# --- 1-4. Linear chain A -> B -> C, plus unrelated D ---------------------------

CHAIN = [("A", "B"), ("B", "C")]


def test_chain_forward_and_reverse_queries():
    graph = build(CHAIN)
    assert graph.dependencies_of("A") == ("B",)
    assert graph.dependencies_of("B") == ("C",)
    assert graph.dependencies_of("C") == ()
    assert graph.dependents_of("C") == ("B",)
    assert graph.dependents_of("B") == ("A",)
    assert graph.dependents_of("A") == ()


def test_direct_impact_of_c_is_b():
    report = build(CHAIN).impact("C")
    assert report.direct == (AffectedModule("B", 1, ("B", "C")),)


def test_transitive_impact_of_c_is_b_then_a():
    report = build(CHAIN).impact("C")
    assert report == ImpactReport(
        "C",
        (
            AffectedModule("B", 1, ("B", "C")),
            AffectedModule("A", 2, ("A", "B", "C")),
        ),
    )
    assert report.transitive == (AffectedModule("A", 2, ("A", "B", "C")),)


def test_impact_flows_only_against_import_direction():
    # A imports B, so changing A cannot affect B or C.
    assert build(CHAIN).impact("A").affected == ()
    assert [m.module_id for m in build(CHAIN).impact("B").affected] == ["A"]


def test_unrelated_module_is_not_affected():
    graph = build(CHAIN + [("D", "E")])
    affected = {m.module_id for m in graph.impact("C").affected}
    assert affected == {"A", "B"}


# --- 5. Isolated node ---------------------------------------------------------


def test_isolated_module_is_a_node_with_no_edges():
    graph = build(CHAIN, extra_modules=["D"])
    assert graph.modules == ("A", "B", "C", "D")
    assert "D" in graph
    assert graph.dependencies_of("D") == ()
    assert graph.dependents_of("D") == ()
    assert graph.impact("D") == ImpactReport("D", ())
    assert "D" not in {m.module_id for m in graph.impact("C").affected}


# --- 6-8. Cycles and self-loops -----------------------------------------------


def test_two_module_cycle_terminates_and_excludes_changed_module():
    graph = build([("A", "B"), ("B", "A")])
    assert graph.impact("A") == ImpactReport("A", (AffectedModule("B", 1, ("B", "A")),))
    assert graph.impact("B") == ImpactReport("B", (AffectedModule("A", 1, ("A", "B")),))


def test_three_module_cycle():
    graph = build([("A", "B"), ("B", "C"), ("C", "A")])
    # Who imports A? C. Who imports C? B. B's importer is A itself: excluded.
    assert graph.impact("A") == ImpactReport(
        "A",
        (
            AffectedModule("C", 1, ("C", "A")),
            AffectedModule("B", 2, ("B", "C", "A")),
        ),
    )


def test_cycle_with_entry_point():
    # main -> A <-> B: changing B reaches A, then main; A's cycle back to B is not re-visited.
    graph = build([("main", "A"), ("A", "B"), ("B", "A")])
    assert graph.impact("B").affected == (
        AffectedModule("A", 1, ("A", "B")),
        AffectedModule("main", 2, ("main", "A", "B")),
    )


def test_self_loop_is_rejected():
    with pytest.raises(ValueError, match="Self-loop edge on 'A'"):
        DependencyGraph(["A"], [("A", "A")])


# --- 9-10. Several dependents, several paths ----------------------------------


def test_multiple_direct_dependents():
    graph = build([("A", "C"), ("B", "C")])
    assert graph.dependents_of("C") == ("A", "B")
    assert graph.impact("C").affected == (
        AffectedModule("A", 1, ("A", "C")),
        AffectedModule("B", 1, ("B", "C")),
    )


def test_diamond_reports_module_once_with_one_deterministic_path():
    # A reaches D through B and through C; both are 2 edges long.
    graph = build([("A", "B"), ("A", "C"), ("B", "D"), ("C", "D")])
    report = graph.impact("D")
    assert [m.module_id for m in report.affected] == ["B", "C", "A"]
    # Tie broken by visiting dependents in sorted order: B is reached before C.
    assert report.affected[2] == AffectedModule("A", 2, ("A", "B", "D"))
    for module in report.affected:
        assert_valid_path(graph, module, "D")


def test_shortest_path_is_chosen_over_longer_one():
    # X imports D directly and also through a 3-step chain.
    graph = build([("X", "D"), ("X", "Y"), ("Y", "Z"), ("Z", "D")])
    x = next(m for m in graph.impact("D").affected if m.module_id == "X")
    assert x == AffectedModule("X", 1, ("X", "D"))


# --- 11. Unknown module IDs ---------------------------------------------------


@pytest.mark.parametrize(
    "query",
    [
        lambda g: g.dependencies_of("missing"),
        lambda g: g.dependents_of("missing"),
        lambda g: g.impact("missing"),
        lambda g: g.explanation_path("missing", "A"),
        lambda g: g.explanation_path("A", "missing"),
    ],
)
def test_unknown_module_raises(query):
    graph = build(CHAIN)
    with pytest.raises(UnknownModuleError) as excinfo:
        query(graph)
    assert excinfo.value.module_id == "missing"
    assert isinstance(excinfo.value, LookupError)


def test_unknown_module_is_distinct_from_module_with_no_dependents():
    graph = build(CHAIN)
    assert graph.impact("A").affected == ()  # known, nothing imports it
    with pytest.raises(UnknownModuleError):
        graph.impact("a")  # IDs are case-sensitive, as in Python


# --- 12-14. Empty graph, duplicates, invalid edges ----------------------------


def test_empty_graph():
    graph = DependencyGraph([], [])
    assert graph.modules == ()
    assert graph.edges == ()
    with pytest.raises(UnknownModuleError):
        graph.impact("A")


def test_duplicate_edges_are_merged():
    graph = DependencyGraph(["A", "B"], [("A", "B"), ("A", "B"), ("A", "B")])
    assert graph.edges == (("A", "B"),)
    assert graph.dependencies_of("A") == ("B",)
    assert graph.dependents_of("B") == ("A",)
    assert graph.impact("B").affected == (AffectedModule("A", 1, ("A", "B")),)


def test_duplicate_module_ids_are_merged():
    graph = DependencyGraph(["A", "A", "B"], [("A", "B")])
    assert graph.modules == ("A", "B")


@pytest.mark.parametrize(
    ("edge", "bad"),
    [(("A", "ghost"), "ghost"), (("ghost", "A"), "ghost")],
)
def test_edge_to_unknown_module_is_rejected(edge, bad):
    with pytest.raises(ValueError, match=f"unknown module '{bad}'"):
        DependencyGraph(["A"], [edge])


# --- 15. Determinism ----------------------------------------------------------

DIAMOND_PLUS = [("A", "B"), ("A", "C"), ("B", "D"), ("C", "D"), ("E", "D"), ("F", "A"), ("C", "A")]


def test_results_do_not_depend_on_input_order():
    reference = build(DIAMOND_PLUS)
    rng = random.Random(0)
    for _ in range(20):
        edges = DIAMOND_PLUS[:]
        rng.shuffle(edges)
        graph = build(edges)
        assert graph.modules == reference.modules
        assert graph.edges == reference.edges
        for module in reference.modules:
            assert graph.dependencies_of(module) == reference.dependencies_of(module)
            assert graph.dependents_of(module) == reference.dependents_of(module)
            assert graph.impact(module) == reference.impact(module)


def test_outputs_are_sorted():
    graph = build(DIAMOND_PLUS)
    assert list(graph.modules) == sorted(graph.modules)
    assert list(graph.edges) == sorted(graph.edges)
    assert graph.dependents_of("D") == ("B", "C", "E")
    keys = [(m.distance, m.module_id) for m in graph.impact("D").affected]
    assert keys == sorted(keys)


# --- 16. Forward/reverse consistency ------------------------------------------


def test_forward_and_reverse_adjacency_agree():
    graph = build(DIAMOND_PLUS, extra_modules=["lonely"])
    forward = {(a, b) for a in graph.modules for b in graph.dependencies_of(a)}
    reverse = {(a, b) for b in graph.modules for a in graph.dependents_of(b)}
    assert forward == reverse == set(DIAMOND_PLUS) == set(graph.edges)


# --- Explanation paths --------------------------------------------------------


def test_explanation_path_follows_import_direction():
    graph = build(CHAIN)
    assert graph.explanation_path("A", "C") == ("A", "B", "C")
    assert graph.explanation_path("B", "C") == ("B", "C")


def test_explanation_path_is_none_when_no_dependency():
    graph = build(CHAIN, extra_modules=["D"])
    assert graph.explanation_path("C", "A") is None  # wrong direction
    assert graph.explanation_path("D", "C") is None  # unrelated
    assert graph.explanation_path("A", "A") is None  # a module is not its own impact


def test_explanation_path_matches_impact_report():
    graph = build(DIAMOND_PLUS)
    for changed in graph.modules:
        for module in graph.impact(changed).affected:
            assert graph.explanation_path(module.module_id, changed) == module.path


# --- Cross-check against brute force on random graphs -------------------------


def brute_force_distances(modules, edges, changed):
    """Shortest import distance from every module to `changed`, by repeated
    relaxation over the edge list (Bellman-Ford style). Shares no code with BFS."""
    dist = {changed: 0}
    for _ in range(len(modules)):
        for importer, imported in edges:
            if imported in dist and importer != changed:
                candidate = dist[imported] + 1
                if candidate < dist.get(importer, float("inf")):
                    dist[importer] = candidate
    del dist[changed]
    return dist


@pytest.mark.parametrize("seed", range(25))
def test_impact_matches_brute_force_on_random_graphs(seed):
    rng = random.Random(seed)
    modules = [f"m{i}" for i in range(rng.randint(1, 12))]
    edges = {(a, b) for a in modules for b in modules if a != b and rng.random() < 0.2}
    graph = DependencyGraph(modules, edges)
    for changed in modules:
        report = graph.impact(changed)
        assert {m.module_id: m.distance for m in report.affected} == brute_force_distances(
            modules, edges, changed
        )
        for module in report.affected:
            assert_valid_path(graph, module, changed)
