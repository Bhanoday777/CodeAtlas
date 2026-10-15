import type { LayoutOptions, NodeSingular, StylesheetJson } from 'cytoscape'

// Mirrors the tokens in src/index.css (the canvas cannot read CSS variables).
export const palette = {
  canvas: '#0c0f14',
  node: '#181d26',
  package: '#12161d',
  nodeBorder: '#343c4a',
  label: '#c9cfda',
  edge: '#3a4352',
  accent: '#5b9dff',
  accentFill: '#1a2a44',
  accentInk: '#e6efff',
  incoming: '#3fb9a7',
  incomingFill: '#13302d',
  danger: '#ef6f68',
} as const

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const FONT_SIZE = 11
const NODE_HEIGHT = 26

/** Node width from its label, so short labels get compact boxes (`width: label` is deprecated). */
function nodeWidth(node: NodeSingular): number {
  const label: string = node.data('label')
  return Math.max(44, Math.round(label.length * FONT_SIZE * 0.6 + 22))
}

export const graphStyle: StylesheetJson = [
  {
    selector: 'node',
    style: {
      shape: 'round-rectangle',
      width: nodeWidth,
      height: NODE_HEIGHT,
      'background-color': palette.node,
      'border-width': 1,
      'border-color': palette.nodeBorder,
      label: 'data(label)',
      color: palette.label,
      'font-family': FONT,
      'font-size': FONT_SIZE,
      'text-valign': 'center',
      'text-halign': 'center',
      'min-zoomed-font-size': 7,
      'transition-property': 'opacity, background-color, border-color',
      'transition-duration': 120,
    },
  },
  {
    // Packages (__init__.py): darker fill and a dashed border.
    selector: 'node.package',
    style: { 'background-color': palette.package, 'border-style': 'dashed' },
  },
  {
    // Files that failed to parse: their imports are missing from the graph.
    selector: 'node.scan-error',
    style: { 'border-color': palette.danger, 'border-width': 1.5, color: palette.danger },
  },
  {
    selector: 'edge',
    style: {
      width: 1.25,
      'line-color': palette.edge,
      'target-arrow-color': palette.edge,
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.85,
      'curve-style': 'bezier',
      'transition-property': 'opacity, line-color',
      'transition-duration': 120,
    },
  },
  // --- Selection: the selected module and its direct neighbors only. ---
  {
    selector: 'node.selected',
    style: {
      'background-color': palette.accentFill,
      'border-color': palette.accent,
      'border-width': 2,
      color: palette.accentInk,
      'font-weight': 600,
      'z-index': 10,
    },
  },
  {
    // Modules the selected module imports (outgoing edges).
    selector: 'node.dependency',
    style: { 'border-color': palette.accent, 'border-width': 1.5 },
  },
  {
    selector: 'edge.outgoing',
    style: { 'line-color': palette.accent, 'target-arrow-color': palette.accent, width: 2, 'z-index': 5 },
  },
  {
    // Modules that import the selected module (incoming edges).
    selector: 'node.dependent',
    style: { 'background-color': palette.incomingFill, 'border-color': palette.incoming, 'border-width': 1.5 },
  },
  {
    selector: 'edge.incoming',
    style: { 'line-color': palette.incoming, 'target-arrow-color': palette.incoming, width: 2, 'z-index': 5 },
  },
  {
    selector: '.faded',
    style: { opacity: 0.22 },
  },
  {
    selector: 'node.hovered',
    style: { 'border-color': palette.accent },
  },
]

/** Layered top-to-bottom layout: importers above the modules they import. */
export const layoutOptions = {
  name: 'dagre',
  rankDir: 'TB',
  nodeSep: 28,
  rankSep: 64,
  edgeSep: 12,
  fit: true,
  padding: 40,
  animate: false,
} as LayoutOptions
