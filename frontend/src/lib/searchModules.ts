import type { GraphNode } from '../types/api'
import { shortLabel } from './graphElements'

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

/** Lower is better; null means no match. */
function matchScore(node: GraphNode, needle: string): number | null {
  const label = shortLabel(node.id).toLowerCase()
  const id = node.id.toLowerCase()
  if (label === needle) return 0
  if (label.startsWith(needle)) return 1
  if (id.startsWith(needle)) return 2
  if (id.includes(`.${needle}`)) return 3
  if (id.includes(needle)) return 4
  if (node.path.toLowerCase().includes(needle)) return 5
  return null
}

/**
 * Same matching rules as searchModules, ordered for jumping to a module:
 * exact name, then name prefix, then ID prefix, then segment prefix, then anywhere
 * in the ID, then path. Ties keep module-ID order.
 */
export function rankModules(nodes: readonly GraphNode[], query: string, limit = 50): GraphNode[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return nodes.slice(0, limit)
  return nodes
    .map((node) => ({ node, score: matchScore(node, needle) }))
    .filter((m): m is { node: GraphNode; score: number } => m.score !== null)
    .sort((a, b) => a.score - b.score || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0))
    .slice(0, limit)
    .map((m) => m.node)
}
