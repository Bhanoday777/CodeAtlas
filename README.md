# CodeAtlas

Codebase intelligence and change-impact analyzer for Python repositories.

CodeAtlas statically parses a Python repository (it never executes the code), builds a
module dependency graph from local imports, and estimates which modules may be affected
when a given module changes.

> **Status: in development (Day 6 of 7).** The parser, the graph / impact engine, the HTTP
> API, the graph explorer UI, and the change-impact UI are implemented and covered by unit,
> contract, integration, and browser end-to-end tests. Delivery (Day 7) is next.

## Repository layout

```text
backend/    FastAPI service (Day 3) + static import parser (Day 1) + graph engine (Day 2)
  app/parser/   discovery -> extraction -> resolution
  app/graph/    dependency graph, BFS change-impact analysis
  app/api/      HTTP routes, response schemas, repository config
  app/main.py   FastAPI app (scans the configured repository once at startup)
  tests/        pytest suites: parser, graph, api, contract, integration (real repos, scale)
frontend/   React + TypeScript + Vite UI (Days 4-5): graph explorer and change-impact analysis
  src/services/   API client (the only code that calls the backend)
  src/hooks/      request state (loading / error / retry) for each endpoint
  src/lib/        pure helpers: API graph -> Cytoscape elements, module search, impact grouping
  src/components/ layout, graph (Cytoscape), module explorer and details, impact report, diagnostics
  e2e/            Playwright browser tests against the real backend and dev server
contract/   committed API snapshots on the fixture, checked by backend and frontend tests
fixtures/   sample_python_project: small repo with hand-verified import relationships
scripts/    check_all.py: every check in one command
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
npm test          # unit + contract tests (Vitest)
npm run lint
npm run build
npm run test:e2e  # browser tests (Playwright; starts both servers, uses installed Chrome)

# Everything, from the repository root, with one pass/fail summary
backend/.venv/Scripts/python scripts/check_all.py      # --skip-e2e to leave out the browser tests
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

To run the API (http://127.0.0.1:8000, interactive docs at `/docs`):

```bash
cd backend
.venv/Scripts/python -m uvicorn app.main:app
# Analyze another repository instead of the fixture:
CODEATLAS_REPO=/path/to/repo .venv/Scripts/python -m uvicorn app.main:app   # PowerShell: $env:CODEATLAS_REPO="..."
```

To run the UI, start the API as above, then in another terminal:

```bash
cd frontend
npm run dev       # http://localhost:5173
```

Open **http://localhost:5173**, not `127.0.0.1:5173`: the API's CORS setting only allows the
`localhost` origin. The UI calls the API at `VITE_API_BASE_URL`, default `http://127.0.0.1:8000`;
to change it, copy `frontend/.env.example` to `frontend/.env.local` and edit it.

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

## API

The repository in `CODEATLAS_REPO` (default: `fixtures/sample_python_project`) is resolved to an
absolute path and scanned **once at startup**; results stay in memory. If `CODEATLAS_REPO` is set
to something that is not a directory, the server refuses to start; it never falls back to the
fixture. CORS allows only the Vite dev server, `http://localhost:5173`.

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `status`, repository folder name, module and edge counts |
| `GET /api/graph` | `nodes` (id, path, is_package, has_scan_error, dependency/dependent counts), `edges` (`source` imports `target`), `summary` counts |
| `GET /api/modules/{id}` | path, direct dependencies and dependents, external and unresolved imports |
| `GET /api/impact/{id}` | `affected` (id, distance, explanation path), `direct`, `transitive`, `diagnostics` |
| `GET /api/scan/issues` | scan errors, unresolved imports, self-imports, `diagnostics`, `limitations` |

- **Module IDs in URLs:** dotted names (`/api/impact/shop.models.order`). Clients should apply
  `encodeURIComponent` to the ID; plain ASCII IDs are unchanged by it and non-ASCII IDs round-trip.
- **Unknown IDs** return `404` with `{"detail": "Unknown module: 'x'"}`.
- All lists are sorted, so the same scan always gives the same JSON.
- **Diagnostics** only report what the scan recorded: files that failed to parse and unresolved
  imports (both can hide dependents, so they also appear on impact reports), and self-imports.
  An empty issue list does not mean the analysis is complete.
- The impact endpoint only reshapes `DependencyGraph.impact()`; there is no second algorithm.

Example, `GET /api/impact/shop.services.pricing` on the fixture (diagnostics shortened):

```json
{
  "changed_module": "shop.services.pricing",
  "affected": [
    {"id": "shop.lazy", "distance": 1, "path": ["shop.lazy", "shop.services.pricing"]},
    {"id": "shop.services.orders", "distance": 1, "path": ["shop.services.orders", "shop.services.pricing"]},
    {"id": "shop.main", "distance": 2, "path": ["shop.main", "shop.services.orders", "shop.services.pricing"]},
    {"id": "shop.services", "distance": 2, "path": ["shop.services", "shop.services.orders", "shop.services.pricing"]},
    {"id": "manage", "distance": 3, "path": ["manage", "shop.main", "shop.services.orders", "shop.services.pricing"]}
  ],
  "direct": ["shop.lazy", "shop.services.orders"],
  "transitive": ["shop.main", "shop.services", "manage"],
  "diagnostics": [{"code": "scan_errors", "message": "1 file(s) could not be parsed ..."},
                  {"code": "unresolved_imports", "message": "3 import(s) look local ..."}]
}
```

## Graph explorer (frontend)

React 19 + TypeScript, Tailwind CSS v4, Cytoscape.js with the `cytoscape-dagre` layered layout.
Inter and JetBrains Mono are bundled through Fontsource (no external font requests).

- **Graph:** every module from `GET /api/graph` is a node and every edge an arrow, in the API's
  direction (**A → B means A imports B**). The layout places importers above the modules they import.
  Labels show the last part of the module ID; hovering shows the full ID, path, and import counts.
- **Package boxes:** modules are drawn inside nested boxes for their packages (`shop` contains
  `shop.models`, `shop.services`, …), each with its own color, used consistently in the list, the
  details panel, and the palette. Grouping comes from module IDs (`src/lib/packages.ts`); a package's
  `__init__.py` sits inside its own box. Boxes are layout only: they are not modules and have no edges.
- **Node size:** grows with the number of modules that import it, so heavily imported modules stand out.
  Package `__init__.py` modules have dashed borders; files that failed to parse have red borders.
- **Controls:** zoom in/out with a zoom readout, fit to view, and reset (re-runs the layout, which undoes
  dragged nodes, and clears the selection). Mouse wheel and drag pan and zoom as well.
- **Ctrl+K (Cmd+K):** quick-jump palette. Results are ranked: exact name, then name prefix, then the
  rest of the ID, then path. Arrow keys and Enter select; Shift+Enter analyzes the module's change
  impact; Esc closes.
- **Selection:** clicking a node or a module in the list selects it in both. The selected module's direct
  imports (blue) and direct importers (teal) are highlighted; everything else is dimmed. Only direct
  neighbors are shown here; transitive impact is a separate mode (below).
- **Module details:** from `GET /api/modules/{id}`: path, imports, imported by, external and unresolved
  imports with line numbers. Module links in the panel select that module.
- **Module list:** grouped by package (collapsible) and filtered by module ID or file path as you type
  (case-insensitive, surrounding spaces ignored).
- **Summary and diagnostics:** the six counts from the graph response's `summary`, unchanged; the
  package count is counted from the graph nodes. The issue cards and the rail icon open the
  Diagnostics drawer, which shows `GET /api/scan/issues`: scan errors, unresolved imports, self-imports, and the
  analysis limitations, in separate sections.
- **Failure states:** loading, backend unreachable, HTTP errors (including the API's 404 message), and
  responses that do not match the contract each get their own message, with Retry where it helps. The
  client checks response shapes and never turns a failure into an empty graph.

### Change impact (Day 5)

"If this module changes, which modules may be affected, and why?" Impact is a separate mode, entered
explicitly, so it is never confused with the direct-neighbor selection highlight.

- **Entering:** the **Analyze impact** button in the module details, or **Shift+Enter** in the Ctrl+K
  palette. The data comes from `GET /api/impact/{id}`; the UI only displays it (no second algorithm).
- **Graph:** the changed module is filled orange; affected modules are outlined in a warm ramp by
  distance (1, 2, and 3 or more share the last color); the edges drawn are the explanation paths, one
  shortest import chain per affected module. Everything else is dimmed, and the view fits the impact set.
- **Report:** replaces the details panel while the mode is on: direct / transitive / total counts,
  the API's diagnostics as "this list may be incomplete" caveats (with a link to the Diagnostics drawer),
  and the affected modules grouped by distance. A module nothing imports gets an explicit "no other
  module is affected" state.
- **Why is it affected?** Clicking a module in the report, the graph, or the module list focuses its
  explanation path (for example `manage → shop.main → shop.services.orders → shop.services.pricing`):
  the path is emphasized on the graph and listed step by step in the report. Clicking it again, the
  changed module, or the empty canvas clears the focus.
- **Leaving:** Esc, or Exit in the report or on the canvas banner. The changed module stays selected,
  so its details are shown again.
- The client rejects an impact response whose paths, distances, and direct / transitive lists disagree,
  since the graph, the groups, and the counts are all drawn from them.

Report export (Markdown / JSON) is planned for Day 7.

Frontend tests (`npm test`) cover the API client (success, network failure, HTTP errors, malformed
bodies, ID encoding, inconsistent impact reports), the graph conversion (edge direction, cycles,
self-loops, duplicates, package nesting, node weights, empty graph), package grouping and colors,
search filtering and ranking, and impact grouping and highlighting (distance buckets, explanation-path
edges, focus, cycles, empty and stale reports). The UI workflows are covered by the browser tests
described under [Testing](#testing).

## Testing

| Layer | Where | What it checks |
|---|---|---|
| Unit (backend) | `backend/tests/parser`, `tests/graph` | Discovery, extraction, resolution, BFS impact; hand-written expected results on the fixture; independent cross-checks (importlib, forward reachability, random graphs). |
| API | `backend/tests/api` | Every endpoint on the fixture and on small temporary repositories, error handling, repository configuration, CORS. |
| Contract | `contract/fixture/*.json`, `backend/tests/contract`, `frontend/src/contract.test.ts` | One set of committed API snapshots, read by both sides (see below). |
| Integration | `backend/tests/integration` | Real repositories and a 2,021-module generated repository through the scanner, the engine, and the HTTP API (see below). |
| Unit (frontend) | `frontend/src/**/*.test.ts` | API client and response guards, graph conversion, package grouping, search, impact grouping and highlighting. |
| End-to-end | `frontend/e2e` | Real user workflows in Chrome against the real backend (scanning the fixture) and the Vite dev server. |

**Contract snapshots.** `contract/fixture/` holds the API's responses on the fixture repository: health,
graph, scan issues, module details and impact reports for modules chosen to cover every response shape,
and a 404. The backend test requires the API to reproduce them exactly. The frontend test runs its
response guards, API client, graph conversion and impact highlighting on the same files and checks
them against each other (for example, every explanation-path edge exists in the graph snapshot). A
field renamed on either side therefore fails a test. Snapshots are deterministic: object keys are
sorted, and list order is kept because sorted lists are part of the API contract. The only
environment-dependent value, the wording of a Python `SyntaxError` (it differs between Python
versions), is replaced by a placeholder. Snapshots change only on request, and the diff is reviewed:

```bash
cd backend
.venv/Scripts/python -m pytest tests/contract --update-contract
git diff ../contract/
```

**Real repositories.** The installed Click package (it comes with uvicorn) is copied under a
temporary root and scanned through the API. Every endpoint is then checked for self-consistency:
counts agree everywhere they appear, edges connect real modules, details match edges, and every
impact report equals an independent breadth-first search over the API's own edges, with every
path step a real edge. More repositories can be checked by path; nothing is downloaded:

```bash
CODEATLAS_REAL_REPOS="/path/to/repo1;/path/to/repo2" .venv/Scripts/python -m pytest tests/integration   # os.pathsep-separated
```

A listed path that does not exist is skipped with that reason. A test confirms the checker fails on
a deliberately corrupted impact report.

**Scale.** A generated repository (2,021 modules, 3,102 edges, cycles, four import forms) must produce
exactly the generated edge set, and the impact of every module must equal an independent BFS. Time
limits are deliberately generous (cold scan 180 s, warm scan 60 s, impact of every module 120 s) and
only catch accidental blow-ups. Actual runtimes are printed at the end of every pytest run. One run on
Windows 11 (Python 3.13):

```text
click 8.5.0             17 modules, 61 edges, largest impact 15; scan + every endpoint checked in 0.52s
scale repository        2021 modules, 3102 edges; scan cold 8.04s / warm 0.82s; graph + impact of all 2021 modules 7.86s
scale repository (API)  startup scan 0.50s, GET /api/graph 0.02s (2021 nodes)
```

The cold scan (first read of freshly written files) varied between 8 and 20 s across runs while the
warm scan stayed under 1 s; the difference is the operating system's first-read cost (on Windows,
most likely antivirus on-access scanning), not the scanner.

**Browser tests.** `npm run test:e2e` starts uvicorn (pinned to the fixture even if `CODEATLAS_REPO`
is set) and the Vite dev server, or reuses ones already running. A global setup refuses to run
against a backend serving another repository. The specs cover the summary, list filtering, the
Ctrl+K palette, module details and links, the diagnostics drawer, the impact workflow (counts,
caveats, distance groups, explanation paths from the report and the module list, Esc and Exit,
Shift+Enter, the empty result), and failure states via request interception (backend unreachable
with Retry, a response that breaks the contract, a 404, a failed impact request with Retry). They
use the installed Google Chrome; set `CODEATLAS_E2E_BROWSER=chromium` (after
`npx playwright install chromium`) to use Playwright's own Chromium instead.

**Manual check: graph canvas.** The graph is drawn on a canvas, so the browser tests reach modules
through the list, the palette, and the panels. The data the canvas draws is tested separately
(graph conversion unit tests, and the contract test on real API output). Clicking nodes is checked
by hand:

1. Click a node: it is selected in the list and the details panel; its direct imports are blue and
   its importers teal. Clicking the empty canvas clears the selection.
2. Hover a node: the card shows its full ID, path, and import counts.
3. In impact mode, click an affected node: its explanation path is emphasized and expanded in the
   report. Click it again, or click an unaffected node, to clear the focus.
4. Drag a node, zoom with the wheel and the controls, Fit, then Reset: the layout and view are restored.

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
- The API reports the repository by its folder name only; scanning Click's `src/` folder shows as `src`.
- Virtual environments are skipped when they contain `pyvenv.cfg` (or are dot-directories);
  a virtualenv without that marker would be scanned.

## Progress

| Day | Scope | Status |
|-----|-------|--------|
| 1 | Project setup, parser, fixture, parser tests | ✅ Done: 137 passing, 1 expected failure (known limitation) |
| 2 | Graph engine, BFS impact analysis | ✅ Done: 206 passing, 1 expected failure (same known limitation) |
| 3 | FastAPI endpoints | ✅ Done: 236 passing, 1 expected failure (same known limitation) |
| 4 | Frontend graph + search | ✅ Done: 41 frontend tests passing; backend unchanged (236 passing, 1 expected failure) |
| 5 | Impact workflow UI | ✅ Done: 60 frontend tests passing; backend unchanged (236 passing, 1 expected failure) |
| 6 | Integration testing | ✅ Done: 257 backend passing, 1 skipped (no extra repos configured), 1 expected failure; 77 frontend; 15 browser e2e |
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
- **Contract between backend and frontend:** both sides test against the same committed API
  snapshots; renaming a field in a snapshot was confirmed to fail both the backend and the
  frontend test.
- **Real and large repositories:** every endpoint is checked for self-consistency on the installed
  Click package, and a generated 2,021-module repository must produce exactly the generated edges,
  with every impact report matching an independent BFS.
- **Browser end-to-end tests:** the UI workflows run in Chrome against the real backend. They
  replaced the manual checks of Days 4-5 and found one bug: Cytoscape ignored the `font-weight: 650`
  used for the selected and focused module labels (it accepts multiples of 100); it is now 600.
- **Tests that can fail:** tests were checked against deliberately broken code to confirm
  they catch the bugs they are meant to catch.

## License

[MIT](LICENSE)
