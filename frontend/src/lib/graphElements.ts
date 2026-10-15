import type { ElementDefinition } from 'cytoscape'

import type { GraphResponse } from '../types/api'

export interface ModuleNodeData {
  id: string
  label: string
  path: string
  isPackage: boolean
  hasScanError: boolean
}

export interface ImportEdgeData {
  id: string
  /** The importing module. */
  source: string
  /** The imported module. */
  target: string
}

/** Last segment of a dotted module ID: "shop.models.order" -> "order". */
export function shortLabel(moduleId: string): string {
  const dot = moduleId.lastIndexOf('.')
  return dot === -1 ? moduleId : moduleId.slice(dot + 1)
}

export function edgeId(source: string, target: string): string {
  return `${source}→${target}`
}

/**
 * Converts the API graph into Cytoscape elements.
 *
 * Edge direction is kept exactly as the API sends it: source imports target.
 * The API never sends duplicate edges; if it did, the repeat is skipped, because
 * Cytoscape rejects two elements with the same ID.
 */
export function toElements(graph: GraphResponse): ElementDefinition[] {
  const nodes: ElementDefinition[] = graph.nodes.map((node) => {
    const data: ModuleNodeData = {
      id: node.id,
      label: shortLabel(node.id),
      path: node.path,
      isPackage: node.is_package,
      hasScanError: node.has_scan_error,
    }
    const classes = [node.is_package && 'package', node.has_scan_error && 'scan-error'].filter(Boolean).join(' ')
    return { group: 'nodes', data, classes }
  })

  const seen = new Set<string>()
  const edges: ElementDefinition[] = []
  for (const { source, target } of graph.edges) {
    const id = edgeId(source, target)
    if (seen.has(id)) continue
    seen.add(id)
    const data: ImportEdgeData = { id, source, target }
    edges.push({ group: 'edges', data })
  }

  return [...nodes, ...edges]
}
