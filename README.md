# CodeAtlas

Codebase intelligence and change-impact analyzer for Python repositories.

CodeAtlas statically parses a Python repository (it never executes the code), builds a
module dependency graph from local imports, and estimates which modules may be affected
when a given module changes.

> **Status: in development (Day 1 of 7).** Only the parser is implemented so far.

## Repository layout

```text
backend/    FastAPI service (Day 3) + static import parser (Day 1)
  app/parser/   discovery -> extraction -> resolution
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

Always invoke Python through the venv (`.venv/Scripts/python -m ...`) so packages and
interpreter match.

## Parser: supported behavior

- Recursively discovers `.py` files, skipping `.git`, dot-directories, `venv`, `node_modules`, `__pycache__`.
- Module IDs are dotted names relative to the repository root (`app/x/__init__.py` → `app.x`).
- Extracts `import` and `from ... import ...` with `ast`, including imports inside functions and `try` blocks.
- Resolves absolute and relative imports. `from X import Y` targets submodule `X.Y` when it exists, otherwise `X`.
- Classifies each import as **local**, **external** (stdlib / third-party), or **unresolved** (looks local, no matching module).
- Syntax errors and undecodable files are reported as scan errors; the scan continues.

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
- Imports under `if TYPE_CHECKING:` are included as dependencies.
- Self-imports are kept as local imports but are not graph edges.
- Virtual environments are skipped when they contain `pyvenv.cfg` (or are dot-directories);
  a virtualenv without that marker would be scanned.

## Progress

| Day | Scope | Status |
|-----|-------|--------|
| 1 | Project setup, parser, fixture, parser tests | ✅ Done: 137 passing, 1 expected failure (known limitation) |
| 2 | Graph engine, BFS impact analysis | Not started |
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
- **Tests that can fail:** tests were checked against deliberately broken code to confirm
  they catch the bugs they are meant to catch.
