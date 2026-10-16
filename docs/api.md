# CodeAtlas API

FastAPI service in `backend/`. Start it with `.venv/Scripts/python -m uvicorn app.main:app` from
`backend/` (macOS/Linux: `.venv/bin/python`); interactive docs are served at
`http://127.0.0.1:8000/docs`. Response schemas are in `backend/app/api/schemas.py`, and the
frontend mirrors them in `frontend/src/types/api.ts`.

## Repository and startup

- The repository is `CODEATLAS_REPO`, or `fixtures/sample_python_project` when it is unset. The path
  is resolved to an absolute directory and scanned **once, at startup**; results stay in memory.
  Restart the API to pick up changes.
- If `CODEATLAS_REPO` is set but is not a directory, startup fails. The API never falls back to the
  fixture, which would quietly serve the wrong repository.
- A file that cannot be read or parsed (syntax error, undecodable, or nested too deeply for `ast`) is a
  scan error. The scan continues, and the file is still a module, just with no outgoing edges.
- CORS allows only the Vite dev server origin, `http://localhost:5173`, and only `GET`.

## Endpoints

| Endpoint | Returns |
|---|---|
| `GET /api/health` | `status`, repository folder name, `module_count`, `edge_count` |
| `GET /api/graph` | `nodes` (id, path, is_package, has_scan_error, dependency and dependent counts), `edges` (`source` depends on `target`), `summary` counts |
| `GET /api/modules/{id}` | path, direct `dependencies` and `dependents`, external and unresolved imports with line numbers |
| `GET /api/impact/{id}` | `affected` (id, distance, explanation path), `direct`, `transitive`, `diagnostics` |
| `GET /api/scan/issues` | scan errors, unresolved imports, self-imports, `diagnostics`, `limitations` |

## Conventions

- **Module IDs** are dotted names relative to the repository root: `shop/models/order.py` is
  `shop.models.order`, and `shop/models/__init__.py` is `shop.models`. In URLs, clients apply
  `encodeURIComponent` to the ID; plain ASCII IDs are unchanged by it, and FastAPI decodes before lookup.
- **Edges:** `{source, target}` means *source depends on target*. Either source imports target, or it
  imports a module inside package target: `import shop.models.order` gives edges to `shop.models.order`,
  `shop.models` and `shop`, because Python runs each package's `__init__.py` first. Only packages that
  exist (with an `__init__.py`) get edges. Edges are deduplicated, and a module never has an edge to itself.
- **Impact:** every module that reaches the changed module by following edges, with its distance
  (1 = direct) and one shortest path in edge direction. Ties are broken by module ID, so the same scan
  always gives the same paths. The changed module is never in its own result, even inside a cycle.
- **Order:** every list is sorted, so the same scan always gives the same JSON.
- **Unknown IDs** return `404` with `{"detail": "Unknown module: 'no.such.module'"}`.
- **Diagnostics** report only what the scan recorded. `scan_errors` and `unresolved_imports` appear
  on every impact report, because both can hide dependents; `self_imports` appear in `/api/scan/issues`.
  An empty list does not mean the analysis is complete.

## Example

`GET /api/impact/shop.models` on the fixture. Nothing imports `shop.models` by name; `orders` and
`pricing` import `shop.models.order`, which runs `shop/models/__init__.py` first.

```json
{
  "changed_module": "shop.models",
  "affected": [
    {"id": "shop.services.orders", "distance": 1, "path": ["shop.services.orders", "shop.models"]},
    {"id": "shop.services.pricing", "distance": 1, "path": ["shop.services.pricing", "shop.models"]},
    {"id": "shop.lazy", "distance": 2, "path": ["shop.lazy", "shop.services.pricing", "shop.models"]},
    {"id": "shop.main", "distance": 2, "path": ["shop.main", "shop.services.orders", "shop.models"]},
    {"id": "shop.services", "distance": 2, "path": ["shop.services", "shop.services.orders", "shop.models"]},
    {"id": "manage", "distance": 3, "path": ["manage", "shop.main", "shop.services.orders", "shop.models"]}
  ],
  "direct": ["shop.services.orders", "shop.services.pricing"],
  "transitive": ["shop.lazy", "shop.main", "shop.services", "manage"],
  "diagnostics": [
    {"code": "scan_errors", "message": "1 file(s) could not be parsed (shop/broken.py). Their imports are missing from the graph, so impact reports can miss modules that depend on a change through them."},
    {"code": "unresolved_imports", "message": "3 import(s) look local but match no module in the repository. They are not graph edges."}
  ]
}
```

Every response shape is recorded in `contract/fixture/*.json`; see [testing.md](testing.md#contract-snapshots).

## Command-line tools

From `backend/`, without starting the API:

```bash
.venv/Scripts/python -m app.parser ../fixtures/sample_python_project                    # scan report
.venv/Scripts/python -m app.graph ../fixtures/sample_python_project shop.models.order   # impact report
.venv/Scripts/python -m app.graph ../fixtures/sample_python_project                     # modules with edge counts
```
