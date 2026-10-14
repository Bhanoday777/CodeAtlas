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

## Progress

| Day | Scope | Status |
|-----|-------|--------|
| 1 | Project setup, parser, fixture, parser tests | ✅ Done: 62 tests passing |
| 2 | Graph engine, BFS impact analysis | Not started |
| 3 | FastAPI endpoints | Not started |
| 4 | Frontend graph + search | Not started |
| 5 | Impact workflow UI | Not started |
| 6 | Integration testing | Not started |
| 7 | Docs, delivery | Not started |
