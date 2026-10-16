# CodeAtlas: project write-up

A codebase intelligence tool for Python: it maps a repository's module dependencies and estimates which
modules may be affected when one of them changes, with a reason for each.

Repository: <https://github.com/Bhanoday777/CodeAtlas>. Every number below comes from the final test run
on commit `464f389` (Windows 11, Python 3.13.5, Node 24.12.0) unless stated otherwise.

---

## 1. The problem

Before changing a module in an unfamiliar codebase, a developer wants to know what else might break.
Searching for `import x` finds direct importers, but not the modules that depend on them in turn, and it
misses relative imports (`from ..models import order`), imports inside functions, and the fact that
importing `a.b.c` also runs `a/__init__.py`. Reviewers have the same question about a pull request:
how far can this change reach?

CodeAtlas answers **"if this module changes, which modules may be affected, and why?"** For every affected
module it gives the distance and one concrete chain of dependencies, such as
`manage → shop.main → shop.services.orders → shop.models`, so the answer can be checked by reading the code.

## 2. What it does

- Scans a Python repository **statically**. It parses source with `ast` and never runs the analyzed code,
  so any repository can be scanned safely.
- Classifies every import as local (with the module it resolves to), external (stdlib or third-party),
  or unresolved (looks local but matches nothing). Files that fail to parse are reported, and the scan
  continues.
- Builds a dependency graph. An edge A → B means A depends on B: A imports B, or A imports a module inside
  package B.
- Computes change impact with a breadth-first search over the reverse edges: every affected module, its
  distance, and one shortest explanation path.
- Serves it through a FastAPI API and a React UI: an interactive graph grouped by package, module details,
  a change-impact mode, scan diagnostics, keyboard search, and Markdown/JSON export of impact reports.
- Reports its own blind spots. Every impact report says when files failed to parse or imports could not
  be resolved, because either can hide affected modules.

## 3. Architecture

```text
discovery ──> extraction ──> resolution ──> dependency graph ──> FastAPI ──> React UI
 .py files     ast imports    local /         edges A → B          JSON       Cytoscape graph,
 → module IDs  (never run)    external /      + reverse BFS        API        impact report
                              unresolved      for impact
```

| Stage | Responsibility | Key decision |
|---|---|---|
| Discovery | Find `.py` files, assign dotted module IDs | Virtualenvs are detected by their `pyvenv.cfg` marker rather than by name, so a real package called `env` is not dropped. If `x.py` and `x/__init__.py` both exist, the package wins, as in Python. |
| Extraction | Every `import` / `from … import`, including ones in functions and `try` blocks | `ast.walk` over the whole tree, then sorted by line. Parsing bytes lets `ast` honor encoding declarations. |
| Resolution | Map each import to a local module, or classify it | `from X import Y` targets submodule `X.Y` when it exists, otherwise `X`. Relative imports that climb above the top-level package are unresolved. |
| Graph | Adjacency lists in both directions, impact BFS | Lists are pre-sorted, so ties between equally short paths are always broken the same way. The changed module is never in its own result, even inside a cycle. |
| API | Scan once at startup, serve five GET endpoints | No database; results stay in memory. An invalid repository path stops startup instead of falling back to the sample repository. |
| UI | Graph explorer and impact mode | The UI only displays API results; there is no second impact algorithm in the browser. Responses are validated, so a contract mismatch shows an error, never an empty graph. |

Code size: about 1,140 lines of backend code and 3,340 lines of frontend code, with about 2,220 and
1,170 lines of tests respectively.

## 4. Technology choices and why

| Technology | Version | Why |
|---|---|---|
| Python `ast` | 3.13 | The standard library's own parser: exact syntax coverage, no execution of the analyzed code, and no dependency. |
| FastAPI + Pydantic | 0.143 / 2.14 | Typed response models double as the API contract, and the interactive docs come for free. |
| uvicorn | 0.54 | Standard ASGI server for FastAPI. |
| pytest | 8.4 | Parametrized tests and fixtures for the many small temporary repositories the parser tests build. |
| React + TypeScript | 19.3 / 6.0 | Component state for selection, impact mode and focus, with types mirroring the API schemas. |
| Vite | 8.3 | Fast dev server and build. The graph library is split into its own chunk (480 kB of the 765 kB total). |
| Cytoscape.js + dagre | 3.34 / 4.0 | Compound nodes draw package boxes, and dagre's layered layout suits a directed dependency graph: importers above what they import. |
| Tailwind CSS | 4.3 | Design tokens (colors and an 8-step type scale) in one CSS file. |
| Vitest | 5.0 | Unit and contract tests for the frontend, sharing Vite's config. |
| Playwright | 1.63 | Browser tests against the real backend; the installed Chrome locally, its own Chromium in CI. |
| GitHub Actions | – | Backend, frontend and browser jobs on every push to `main` and on pull requests. |

## 5. Results

| Repository | Modules | Edges | Largest impact | Verification |
|---|---:|---:|---:|---|
| Fixture (hand-built sample) | 16 | 34 | 11 | Every module, edge (14 from imports, 20 to parent packages) and impact set written by hand before running the code |
| Click 8.5.0 | 17 | 76 | 16 | Every endpoint self-consistent; every impact report equals an independent BFS over the API's own edges |
| requests (`src/`, commit `611c616`) | 19 | 88 | 16 | Same checks |
| Generated repository | 2,021 | 7,611 | – | Exact generated edge set; impact of every module equals an independent BFS |

On the generated repository: warm scan 0.50 s, the impact reports of all 2,021 modules 5.77 s,
`GET /api/graph` 0.04 s. The first (cold) scan of 2,021 new files took 7.73 s, mostly the operating
system's first read of the files.

Tests in the final run: **271** backend tests (plus 1 expected failure documenting a known limitation,
and 1 skip for an optional check), **94** frontend unit and contract tests, and **18** browser tests.

## 6. How correctness was established

- **Expected results written first.** The fixture's modules, edges, external and unresolved imports and
  impact sets were derived by hand from its source files, then compared with exact set equality, so both
  missing and extra results fail.
- **Independent cross-checks.** Relative-import resolution is checked against Python's own
  `importlib.util.resolve_name`. Impact is checked against forward reachability (a plain DFS) on every
  fixture module, and against Bellman-Ford-style relaxation on 25 random graphs with cycles. Neither
  shares code with the BFS.
- **One contract, tested from both sides.** 16 committed API snapshots: the backend must reproduce them
  exactly, and the frontend runs its validation, graph conversion, highlighting and export on the same
  files.
- **Regression test before every fix.** Each fix in the final round started with a test that failed on the
  old code: a deeply nested file crashing the scan, the hover card staying open, and package
  `__init__.py` changes reporting no impact.

## 7. Interesting problems

**Package `__init__.py` files were invisible to impact analysis.** `import shop.models.order` runs
`shop/__init__.py` and `shop/models/__init__.py`, but the graph only had an edge to `shop.models.order`, so
changing `shop/models/__init__.py` reported nothing affected. I compared two fixes on requests before
choosing one:

| Edge design | Edges | Average modules affected | Modules that affect all others |
|---|---:|---:|---:|
| No parent edges (before) | 73 | 8.2 | 0 |
| Every module → its parent package | 91 | 17.1 | 18 of 19 |
| Importer → parent packages of what it imports (chosen) | 88 | 14.4 | 0 |

The first fix sounds natural but makes nearly every module affect everything, because requests'
`__init__.py` imports most of its submodules. The chosen design follows what Python actually executes and
stays useful. It is still a conservative approximation, and the documentation says so.

**One file could stop the whole service.** `ast.parse` raises `RecursionError` or `MemoryError` (not
`SyntaxError`) on very deeply nested source, such as generated code. The scanner did not catch those, so
the API would not start. The regression test makes the parser raise each error on purpose, so it is
deterministic and never actually exhausts memory.

**A test cache hid a new test case.** After a new contract snapshot was added, the frontend contract test
still ran the old set. Vitest's persistent module cache had stored the old `import.meta.glob` result, and
even touching the file did not refresh it. I found it by asserting on the glob's keys in a throwaway test,
then turned the cache off: the suite runs in under a second without it.

**Testing a canvas.** Graph nodes are pixels, not DOM elements, so the hover-card bug was hard to test.
The test moves the mouse across the canvas in a grid until a hover card appears, then moves onto the
controls. It reproduced the bug before the fix, and it passed 8 of 8 repeated runs after.

## 8. Trade-offs and limitations

- **Static, not runtime.** Dynamic imports (`importlib.import_module`) and `sys.path` changes are not
  seen; results are estimates, not guarantees.
- **Conservative by design.** `TYPE_CHECKING` imports count as dependencies, and package edges assume a
  package's `__init__.py` matters to everything that imports inside it. With an `__init__.py` that imports
  its own submodules, this creates cycles: in Click 16 of 17 modules, and in requests 18 of 19, appear to
  affect 15 or 16 others. I chose over-reporting over silently missing a dependency.
- **One repository, scanned once.** No database and no re-scan while running: a deliberate MVP scope.
- **Import root is the scanned folder.** A `src/` layout is analyzed by pointing at `src/`. Namespace
  packages imported by name are reported as unresolved (documented by the expected-failure test).

## 9. Future work

- Mark type-only imports (`if TYPE_CHECKING:`) and let the UI include or exclude them.
- Tag edges by kind (import or parent package) in the API, so the UI can style them differently.
- Re-scan on file changes, and analyze several repositories.
- Impact of a whole diff: the union of affected modules for every file a pull request touches.

## 10. Explaining it in an interview

**30 seconds.** CodeAtlas is a static analysis tool for Python repositories. It parses every file with
Python's `ast` module, without running the code, resolves the imports into a module dependency graph, and
answers "if I change this module, what else may break, and why?" with a breadth-first search over reverse
edges. Each affected module comes with an explanation path. It has a FastAPI backend, a React and
Cytoscape UI, and about 380 tests, including browser tests and a 2,021-module scale test.

**2 minutes.** Add, in this order:
1. The pipeline: discovery, extraction, resolution, graph, API, UI, each tested on its own.
2. The algorithm: reverse BFS, with a next-hop map to rebuild one shortest path per module, sorted
   adjacency for deterministic tie-breaking, and cycle safety by visiting each module once.
3. Python's import semantics: relative imports, `from X import Y` meaning a submodule or a name, and the
   parent-package problem with the measured comparison above.
4. Verification: hand-written expectations, independent algorithms, a shared contract between backend
   and frontend, and regression tests before fixes.
5. Honesty about limits: the report says when it may be incomplete.

## 11. FAQ

**Why not just run the code and trace imports?** Running arbitrary repository code is unsafe and needs
its dependencies installed. Static parsing works on any checkout, in about half a second for 2,021 files
once they are cached.

**Why breadth-first search?** It reaches modules in order of distance, so the first time it sees a module
is via a shortest path. That gives the distance and an explanation path in one pass, and it handles
cycles, because each module is visited once.

**How do you know the results are right?** Four independent checks: hand-written expectations on the
fixture, `importlib` for import resolution, two independent graph algorithms (DFS reachability and
Bellman-Ford-style relaxation), and self-consistency plus an independent BFS on Click, requests and a
generated repository.

**What happens with circular imports?** They are kept as edges in both directions. The BFS visits each
module once, so it terminates, and the changed module is never reported as affecting itself.

**Why is the impact sometimes so large?** Import cycles, often created by `TYPE_CHECKING` imports and by
package `__init__.py` files that import their own submodules, connect most of a package. The tool reports
what the imports say; it would rather over-report than miss a dependency.

**How do the frontend and backend stay in sync?** Committed JSON snapshots of every response shape. The
backend must reproduce them exactly, and the frontend tests run on the same files, so renaming a field on
either side fails a test.

**What would you do differently at a larger scale?** Persist scans, re-scan incrementally on file changes,
and measure the graph view on large repositories. The API is measured at 2,021 modules, but the UI has
only been used on repositories of up to 19 modules (the fixture, Click and requests), so its limits are
still unknown.

**What was the hardest bug?** The stale Vitest cache: everything passed, but one new test case was
silently not running. It only showed up because the test count did not go up when I expected it to.
