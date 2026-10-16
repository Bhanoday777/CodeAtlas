# Testing CodeAtlas

```bash
backend/.venv/Scripts/python scripts/check_all.py              # everything, one pass/fail summary
backend/.venv/Scripts/python scripts/check_all.py --skip-e2e   # without the browser tests
```

`check_all.py` runs backend pytest, frontend lint, typecheck + build, Vitest, and Playwright. Every step
runs even if an earlier one fails, so one run shows all failures. GitHub Actions
(`.github/workflows/ci.yml`) runs the same suites on every push to `main` and on pull requests.

## Layers

| Layer | Where | What it checks |
|---|---|---|
| Parser | `backend/tests/parser` | Discovery, `ast` extraction, import resolution, scan edge cases; the fixture's modules, edges, external and unresolved imports, and errors written by hand. |
| Graph | `backend/tests/graph` | BFS impact, explanation paths, cycles, determinism; hand-derived impact sets on the fixture; two independent cross-checks. |
| API | `backend/tests/api` | Every endpoint on the fixture and on small temporary repositories, errors, repository configuration, CORS. |
| Contract | `contract/fixture/*.json`, `backend/tests/contract`, `frontend/src/contract.test.ts` | One set of committed API snapshots, read by both sides. |
| Integration | `backend/tests/integration` | Real repositories and a 2,021-module generated repository through the scanner, the engine and the HTTP API. |
| Frontend unit | `frontend/src/**/*.test.ts` | API client and response guards, graph conversion, package grouping, search, impact highlighting, export. |
| End-to-end | `frontend/e2e` | User workflows in a real browser against the real backend (scanning the fixture) and the Vite dev server. |

Final run (commit `464f389`): **271** backend tests passed, plus 1 expected failure and 1 skip;
**94** Vitest tests; **18** browser tests. The expected failure documents a known limitation
(`import nspkg` of a namespace package is reported as unresolved). The skip is the configurable
real-repository test, which needs `CODEATLAS_REAL_REPOS`.

## How results are cross-checked

- **Hand-written expectations.** The fixture's expected modules, edges (14 from import statements and
  20 to parent packages, listed separately) and impact sets were written from the source files before
  running the code. They are compared with exact set equality, so both missing and extra results fail.
- **Python's own resolver.** `test_absolute_base_agrees_with_importlib` checks relative-import
  resolution against `importlib.util.resolve_name`.
- **Independent graph algorithms.** On every fixture module, impact must equal forward reachability
  computed by a plain DFS. On 25 random graphs with cycles, distances must equal a Bellman-Ford-style
  relaxation over the edge list. Neither shares code with the BFS.
- **Regression tests first.** Each bug fixed in this project has a test that was run on the old code
  and failed before the fix: virtualenv detection by name, self-loop edges, files too deeply nested for
  `ast` stopping the scan, the hover card staying open, and parent packages missing from impact.

## Contract snapshots

`contract/fixture/` holds 16 API responses on the fixture: health, graph, scan issues, five module
details, seven impact reports and a 404. The modules were chosen to cover every response shape, including
an empty result, a file that failed to parse, a cycle, and a package reached only through parent edges
(`shop.models`).

- The backend test requires the API to reproduce each file exactly.
- The frontend test runs its response guards, API client, graph conversion, impact highlighting and
  export on the same files and checks them against each other. For example, every explanation-path edge
  must exist in the graph snapshot.
- A field renamed on either side therefore fails a test on the other.

Snapshots are deterministic: object keys are sorted, list order is part of the contract, and the one
environment-dependent value (the wording of a Python `SyntaxError`) is replaced by a placeholder.
Regenerating them twice gives byte-identical files. They change only on request, and the diff is
reviewed:

```bash
cd backend
.venv/Scripts/python -m pytest tests/contract --update-contract
git diff ../contract/
```

Vitest's persistent module cache is turned off in `vite.config.ts`, because it kept an old
`import.meta.glob` result and silently skipped a newly added snapshot.

## Real repositories

The installed Click package (it comes with uvicorn) is copied under a temporary root and scanned
through the API. Every endpoint is checked for self-consistency: counts agree everywhere they appear,
edges connect real modules, details match edges, and every impact report equals an independent BFS
over the API's own edges, with every path step a real edge. A test confirms that the checker fails on
a deliberately corrupted report.

More repositories can be checked by path; nothing is downloaded:

```bash
cd backend
CODEATLAS_REAL_REPOS="/path/to/repo1;/path/to/repo2" .venv/Scripts/python -m pytest tests/integration   # os.pathsep-separated
```

## Scale

A generated repository (20 packages of 100 modules, seeded, with cycles, a 100-module chain and four
import forms) must produce exactly the edge set the generator wrote, including the two parent-package
edges per import. The impact of every module must equal an independent BFS. Time limits are deliberately
generous (cold scan 180 s, warm scan 60 s, impact of all modules 120 s) and only catch accidental
blow-ups. Measured runtimes are printed at the end of every pytest run.

## Measured in the final run

Windows 11, Python 3.13.5, Node 24.12.0, commit `464f389`:

```text
click 8.5.0             17 modules, 76 edges, largest impact 16; scan + every endpoint checked in 0.45s
scale repository        2021 modules, 7611 edges; scan cold 7.73s / warm 0.50s; graph + impact of all 2021 modules 5.77s (1706130 affected entries, longest distance 32)
scale repository (API)  startup scan 0.49s, GET /api/graph 0.04s (2021 nodes)
```

With `CODEATLAS_REAL_REPOS` set to a clone of requests (`src/`, commit `611c616`):

```text
src                     19 modules, 88 edges, largest impact 16; checked in 0.17s
```

The cold scan (the first read of 2,021 freshly written files) varies between runs, while the warm scan
stays under a second. The difference is the operating system's first-read cost (on Windows, most likely
antivirus on-access scanning), not the scanner.

## Browser tests

`npm run test:e2e` starts uvicorn (pinned to the fixture even if `CODEATLAS_REPO` is set) and the Vite
dev server, or reuses ones already running locally. A global setup refuses to run against a backend
serving another repository. The specs cover the summary, list filtering, the palette, module details
and links, the diagnostics drawer, the hover card, the impact workflow (counts, caveats, groups,
explanation paths, the package case, Esc and Exit, Shift+Enter, the empty result), both exports, and
failure states via request interception (backend unreachable with Retry, a response that breaks the
contract, a 404, a failed impact request with Retry).

Locally they use the installed Google Chrome. CI sets `CODEATLAS_E2E_BROWSER=chromium` (after
`npx playwright install chromium`) to use Playwright's own Chromium, and `CODEATLAS_PYTHON` for the
interpreter that runs uvicorn. In CI, servers are never reused and failed tests are retried once.
