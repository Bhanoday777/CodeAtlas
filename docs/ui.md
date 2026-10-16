# CodeAtlas UI

React 19 + TypeScript in `frontend/`, styled with Tailwind CSS v4; the graph is Cytoscape.js with the
`cytoscape-dagre` layered layout. Inter and JetBrains Mono are bundled through Fontsource, so the page
makes no external font requests. All backend calls go through `src/services/api.ts`; components use the
hooks in `src/hooks/`.

Run it with `npm run dev` and open **http://localhost:5173** (not `127.0.0.1`, which the API's CORS
setting does not allow). The dev server refuses to start on another port for the same reason. The UI
calls the API at `VITE_API_BASE_URL`, default `http://127.0.0.1:8000`; to change it, copy
`frontend/.env.example` to `frontend/.env.local`.

## Graph explorer

- **Graph:** every module from `GET /api/graph` is a node and every edge an arrow in the API's direction:
  **A → B means A depends on B** (A imports B, or a module inside package B). Importers sit above the
  modules they import. Labels show the last part of the module ID; hovering shows the full ID, path and
  counts.
- **Package boxes:** modules are drawn inside nested boxes for their packages, each with its own color,
  used the same way in the list, the details panel and the palette. A package's `__init__.py` sits inside
  its own box, with a dashed border. Boxes are layout only: they are not modules and have no edges.
- **Node size** grows with the number of modules that depend on it. Files that failed to parse have red
  borders.
- **Controls:** zoom in and out with a zoom readout, fit to view, and reset (re-runs the layout, which
  undoes dragged nodes, and clears the selection). The mouse wheel and dragging pan and zoom too.
- **Selection:** clicking a node or a module in the list selects it in both. Its direct dependencies
  (blue) and direct dependents (teal) are highlighted and everything else is dimmed. Transitive impact
  is a separate mode.
- **Module details** (`GET /api/modules/{id}`): path, dependencies (including parent packages),
  dependents, and external and unresolved imports with line numbers. Module links select that module.
- **Module list:** grouped by package (collapsible) and filtered by module ID or path as you type.
- **Ctrl+K / Cmd+K:** a quick-jump palette. Results are ranked: exact name, name prefix, ID prefix,
  segment prefix, anywhere in the ID, then path. Enter selects; **Shift+Enter** analyzes impact.
- **Summary and diagnostics:** the six counts from the graph's `summary`. The issue cards and the rail
  icon open the diagnostics drawer (`GET /api/scan/issues`): scan errors, unresolved imports,
  self-imports, and the analysis limitations.
- **Failure states:** loading, backend unreachable (with the command to start it), HTTP errors
  (including the API's 404 message), and responses that do not match the contract each get their own
  message, with Retry where it helps. A failure is never shown as an empty graph.

## Change impact

Impact is a separate mode, entered explicitly, so it is never confused with the selection highlight.

- **Entering:** **Analyze impact** in the module details, or **Shift+Enter** in the palette. The data
  comes from `GET /api/impact/{id}`; the UI only displays it.
- **Graph:** the changed module is filled orange, affected modules are outlined by distance (1, 2, and
  3 or more), and the edges drawn are the explanation paths. Everything else is dimmed, and the view fits
  the affected modules.
- **Report:** replaces the details panel. It shows total, direct and transitive counts, the API's
  diagnostics as "this list may be incomplete" caveats (linking to the diagnostics drawer), and the
  affected modules grouped by distance. A module nothing depends on gets an explicit empty result.
- **Why is it affected?** Clicking a module in the report, the graph or the list focuses its explanation
  path, emphasized on the graph and listed step by step. A step to a package reads "imports from"
  (`shop.services.orders imports from shop.models`), since the edge may come from a module inside it.
  Clicking it again, the changed module, or the empty canvas clears the focus.
- **Export:** **Markdown** saves the counts, caveats and a table of every affected module with its path,
  for a pull request or an issue. **JSON** saves the API response unchanged under `report`, with the
  repository and the export time. Files are named `impact-<module>.md` / `.json`.
- **Leaving:** Esc, or Exit in the report or on the canvas banner. The changed module stays selected.

## Testing the canvas

The graph is drawn on a canvas, so most browser tests reach modules through the list, the palette and
the panels; the data the canvas draws is tested by the graph-conversion unit tests and the contract
test. One e2e test (`e2e/canvas.spec.ts`) finds a node by moving the mouse over the canvas until its
hover card appears, and checks that the card closes when the pointer moves onto the view controls.
These are still checked by hand:

1. Click a node: it is selected in the list and the details panel, with dependencies blue and
   dependents teal. Clicking the empty canvas clears the selection.
2. In impact mode, click an affected node: its explanation path is emphasized and expanded in the
   report. Click it again, or click an unaffected node, to clear the focus.
3. Drag a node, zoom with the wheel and the controls, Fit, then Reset: the layout and view are restored.
