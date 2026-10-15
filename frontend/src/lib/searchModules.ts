import type { GraphNode } from '../types/api'

/**
 * Case-insensitive substring search over module IDs and file paths.
 * Surrounding whitespace is ignored; an empty query returns every module.
 * Results keep the API's order (sorted by module ID).
 */
export function searchModules(nodes: readonly GraphNode[], query: string): GraphNode[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...nodes]
  return nodes.filter(
    (node) => node.id.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle),
  )
}
