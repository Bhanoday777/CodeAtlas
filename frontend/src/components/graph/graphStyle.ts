import type { LayoutOptions, NodeSingular, StylesheetJson } from 'cytoscape'

// Mirrors the tokens in src/index.css (the canvas cannot read CSS variables).
export const palette = {
  node: '#141820',
  label: '#d3d8e2',
  edge: '#2e3644',
  accent: '#5b9dff',
  accentFill: '#14233a',
  accentInk: '#eef4ff',
  incoming: '#3fb9a7',
  incomingFill: '#0f2622',
  danger: '#ef6f68',
} as const

export const SANS = '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const MONO = '"JetBrains Mono Variable", ui-monospace, "Cascadia Code", Consolas, monospace'

// Node size grows with importance (data.weight, 0..1: how many modules import it).
const fontSize = (node: NodeSingular) => 11 + 3 * (node.data('weight') as number)
const nodeHeight = (node: NodeSingular) => 26 + 14 * (node.data('weight') as number)
/** Width from the label, so short labels get compact boxes (`width: label` is deprecated). */
const nodeWidth = (node: NodeSingular) => {
  const label: string = node.data('label')
  return Math.max(46, Math.round(label.length * fontSize(node) * 0.6 + 26))
}

export const graphStyle: StylesheetJson = [
  // --- Package boxes (compound nodes) ---
  {
    selector: 'node.cluster',
    style: {
      shape: 'round-rectangle',
      'corner-radius': '10px',
      'background-color': 'data(color)',
      'background-opacity': 0.045,
      'border-width': 1,
      'border-color': 'data(color)',
      'border-opacity': 0.32,
      padding: '16px',
      label: 'data(label)',
      color: 'data(color)',
      'font-family': MONO,
      'font-size': 10.5,
      'font-weight': 500,
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': -5,
      'text-opacity': 0.85,
      'min-zoomed-font-size': 6,
      'transition-property': 'background-opacity, border-opacity, text-opacity',
      'transition-duration': 150,
    },
  },
  {
    selector: 'node.cluster.dimmed',
    style: { 'background-opacity': 0.015, 'border-opacity': 0.1, 'text-opacity': 0.3 },
  },

  // --- Modules ---
  {
    selector: 'node.module',
    style: {
      shape: 'round-rectangle',
      'corner-radius': '7px',
      width: nodeWidth,
      height: nodeHeight,
      'background-color': palette.node,
      'border-width': 1.25,
      'border-color': 'data(color)',
      'border-opacity': 0.55,
      label: 'data(label)',
      color: palette.label,
      'font-family': SANS,
      'font-size': fontSize,
      'font-weight': 500,
      'text-valign': 'center',
      'text-halign': 'center',
      'min-zoomed-font-size': 7,
      'transition-property': 'opacity, background-color, border-color, border-opacity, underlay-opacity',
      'transition-duration': 150,
    },
  },
  {
    // Packages (__init__.py): dashed border.
    selector: 'node.module.package',
    style: { 'border-style': 'dashed' },
  },
  {
    // Files that failed to parse: their imports are missing from the graph.
    selector: 'node.module.scan-error',
    style: { 'border-color': palette.danger, 'border-opacity': 1, color: palette.danger },
  },
  {
    selector: 'node.module.hovered',
    style: { 'border-opacity': 1, 'border-width': 1.75 },
  },

  // --- Imports ---
  {
    selector: 'edge',
    style: {
      width: 1.25,
      'line-color': palette.edge,
      'target-arrow-color': palette.edge,
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      'curve-style': 'bezier',
      'transition-property': 'opacity, line-color, width',
      'transition-duration': 150,
    },
  },

  // --- Selection: the selected module and its direct neighbors only ---
  {
    // Modules the selected module imports (outgoing edges).
    selector: 'node.module.dependency',
    style: { 'background-color': palette.accentFill, 'border-color': palette.accent, 'border-opacity': 1 },
  },
  {
    selector: 'edge.outgoing',
    style: { 'line-color': palette.accent, 'target-arrow-color': palette.accent, width: 2, 'z-index': 5 },
  },
  {
    // Modules that import the selected module (incoming edges).
    selector: 'node.module.dependent',
    style: { 'background-color': palette.incomingFill, 'border-color': palette.incoming, 'border-opacity': 1 },
  },
  {
    selector: 'edge.incoming',
    style: { 'line-color': palette.incoming, 'target-arrow-color': palette.incoming, width: 2, 'z-index': 5 },
  },
  {
    selector: 'node.module.selected',
    style: {
      'background-color': palette.accentFill,
      'border-color': palette.accent,
      'border-opacity': 1,
      'border-width': 2,
      color: palette.accentInk,
      'font-weight': 650,
      'underlay-color': palette.accent,
      'underlay-opacity': 0.16,
      'underlay-padding': 6,
      'underlay-shape': 'round-rectangle',
      'z-index': 10,
    },
  },
  {
    selector: '.faded',
    style: { opacity: 0.16 },
  },
]

/** Layered top-to-bottom layout: importers above the modules they import, grouped by package. */
export const layoutOptions = {
  name: 'dagre',
  rankDir: 'TB',
  nodeSep: 26,
  rankSep: 58,
  edgeSep: 12,
  fit: true,
  padding: 36,
  animate: false,
} as LayoutOptions
