# CodeAtlas

Codebase intelligence and change-impact analyzer for Python repositories.

CodeAtlas statically parses a Python repository (it never executes the code), builds a
module dependency graph from local imports, and estimates which modules may be affected
when a given module changes.

> **Status: in development (Day 2 of 7).** The parser and the graph / impact engine are
> implemented; there is no API or UI yet.

## Repository layout

```text
backend/    FastAPI service (Day 3) + static import parser (Day 1) + graph engine (Day 2)
  app/parser/   discovery -> extraction -> resolution
  app/graph/    dependency graph, BFS change-impact analysis
  tests/        pytest suites
frontend/   React + TypeScript + Vite (scaffold only so far)
fixtures/   sample_python_project: small repo with hand-verified import relationships
```

## Setup

Requirements: Python 3.13, Node.js 20+.

```bash
# Backend
cd backend
py -3.13 -m venv .venv            # Windows; use python3.13 on macOS/Linux
.venv/Scripts/python -m pip install -r requirements.txt   # .venv/bin/python on macOS/Linux
.venv/Scripts/python -m pytest

# Frontend
cd frontend
npm install
npm run build
```

To print a scan report for any Python repository (read-only; nothing is executed):

```bash
cd backend
.venv/Scripts/python -m app.parser ../fixtures/sample_python_project
```

To print a change-impact report (which modules may be affected if one changes):

```bash
cd backend
.venv/Scripts/python -m app.graph ../fixtures/sample_python_project shop.models.order
```

Leave out the module ID to list every module with its import counts.

Always invoke Python through the venv (`.venv/Scripts/python -m ...`) so packages and
interpreter match.

## Parser: supported behavior

- Recursively discovers `.py` files, skipping `.git`, dot-directories, `venv`, `node_modules`, `__pycache__`.
- Module IDs are dotted names relative to the repository root (`app/x/__init__.py` → `app.x`).
- Extracts `import` and `from ... import ...` with `ast`, including imports inside functions and `try` blocks.
- Resolves absolute and relative imports. `from X import Y` targets submodule `X.Y` when it exists, otherwise `X`.
- Classifies each import as **local**, **external** (stdlib / third-party), or **unresolved** (looks local, no matching module).
- Syntax errors and undecodable files are reported as scan errors; the scan continues.

## Graph engine and impact analysis

`DependencyGraph` (`backend/app/graph/dependency_graph.py`) is built from a scan with
`DependencyGraph.from_scan(scan)`. Edge convention: **A → B means A imports B**.

- Every discovered module is a node, including isolated ones (e.g. a file with a syntax error).
- Edges are stored twice, as sorted adjacency lists: `dependencies_of(A)` (what A imports) and
  `dependents_of(B)` (what imports B).
- `impact(changed)` runs a breadth-first search over the reverse edges. It returns every module that
  directly or transitively imports `changed`, with its distance (1 = direct) and one shortest
  explanation path in import direction, e.g. `manage -> shop.main -> shop.services.orders -> shop.models.order`.
  The changed module is never in its own result, even inside an import cycle.
- Cycles are safe: BFS visits each module once. When several shortest paths exist, the one through the
  alphabetically earlier dependent wins, so results are identical on every run.
- `explanation_path(a, b)` returns the same path for one pair, or `None` if `a` does not depend on `b`.
- An unknown module ID raises `UnknownModuleError`; a known module with no dependents returns an
  empty report. Building a graph with an edge to an unknown module, or with a self-loop, raises `ValueError`.
  Duplicate edges are merged.

Complexity (V modules, E edges):

| Operation | Time |
|---|---|
| Build graph | O(V + E), plus O(V log V + E log E) for sorting |
| `dependencies_of` / `dependents_of` | O(1) (pre-sorted) |
| `impact` (one query) | O(V + E) for the BFS, plus the total length of the returned paths: O(V²) worst case, e.g. a long chain |
| `explanation_path` (one query) | O(V + E) |

Memory: O(V + E) for the two adjacency lists, plus O(V) per query for the BFS queue and path pointers.

Impact results are an estimate from import statements, not a prediction of runtime behavior.

## Known limitations (static analysis)

- Dynamic imports (`importlib.import_module`, `__import__`, string-built names) are not detected.
- `sys.path` manipulation and `src/`-style layouts are not supported: the repository root is the import root.
- `from X import name` is assumed to refer to a name defined in `X`; the name itself is not verified.
- A local package with the same top-level name as an installed one is treated as local.
- Importing `a.b.c` creates an edge only to `a.b.c`, not to the parent packages `a` and `a.b`
  (whose `__init__.py` Python also executes).
- `import nspkg` of a namespace package (a directory without `__init__.py`) is reported as
  unresolved, although Python accepts it. Imports of its submodules resolve correctly.
- A package split across several folders (e.g. langgraph's `libs/*/langgraph/...`) only
  resolves the parts inside the scanned root; the rest are reported as unresolved.
- Imports under `if TYPE_CHECKING:` are included as dependencies. This can overstate impact: in
  Click, such imports create cycles through `click.core`, so most modules appear to affect 12-15 of the 17.
- Self-imports are kept as local imports but are not graph edges.
- Impact inherits every parser gap: an import the parser misses (dynamic, unresolved, parent
  package) is a dependency the impact report also misses.
- Virtual environments are skipped when they contain `pyvenv.cfg` (or are dot-directories);
  a virtualenv without that marker would be scanned.

## Progress

| Day | Scope | Status |
|-----|-------|--------|
| 1 | Project setup, parser, fixture, parser tests | ✅ Done: 137 passing, 1 expected failure (known limitation) |
| 2 | Graph engine, BFS impact analysis | ✅ Done: 206 passing, 1 expected failure (same known limitation) |
| 3 | FastAPI endpoints | Not started |
| 4 | Frontend graph + search | Not started |
| 5 | Impact workflow UI | Not started |
| 6 | Integration testing | Not started |
| 7 | Docs, delivery | Not started |

## Development approach

**Decisions**
- **Scope:** a strict MVP (Python only, static analysis, no database, no LLM features, one
  configured demo repository), planned as a seven-day schedule.
- **Architecture:** separate stages for discovery, AST extraction, import resolution, graph
  traversal, API, and UI, so each can be tested and explained on its own.
- **Trade-offs:** which limitations to accept and document (dynamic imports, namespace
  packages, `TYPE_CHECKING` imports) rather than over-engineer.
- **Process:** each phase was proposed as a plan, reviewed and approved by me before
  implementation, and verified with tests before moving on.

**How correctness was verified**
- **Hand-written expected results:** the fixture repository's expected modules, edges,
  external/unresolved imports, and errors were written before running the parser, and the
  tests compare them with exact set equality, so both missing and extra edges fail.
- **Independent checker:** a separate reference resolver, sharing no code with the parser and
  using Python's own `importlib.util.resolve_name`, produced identical edges on the fixture,
  [click](https://github.com/pallets/click) (61 edges), and langgraph (428 edges). The same
  `importlib` cross-check is part of the test suite (`test_absolute_base_agrees_with_importlib`).
- **Regression tests:** a review against real packages found two bugs (a real package named
  `env`/`venv` was silently skipped; self-imports produced self-loop edges). Both were fixed,
  and their tests were confirmed to fail on the old code and pass on the fix.
- **Graph cross-checks:** impact results are compared with two independent methods that share no
  code with the BFS: forward reachability (plain DFS) on every fixture module, and shortest
  distances by repeated relaxation on 25 random graphs with cycles. Running the engine on Click
  (17 modules, 61 edges) completed without errors, and sample paths were checked against the source.
- **Tests that can fail:** tests were checked against deliberately broken code to confirm
  they catch the bugs they are meant to catch.

## License

[MIT](LICENSE)
