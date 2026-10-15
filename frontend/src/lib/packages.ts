import type { GraphNode } from '../types/api'

// Package colors: chosen to stay distinct from the selection colors (blue = imports,
// teal = imported by) and from the warning/error colors (amber, red).
export const PACKAGE_COLORS = ['#a78bfa', '#f472b6', '#fb923c', '#a3e635', '#e2c97e', '#c084fc', '#f9a8d4', '#86efac'] as const
export const ROOT_COLOR = '#8b93a3'

export interface PackageCluster {
  /** Dotted package name, e.g. "shop.services". */
  id: string
  /** Enclosing package cluster, or null at the top level. */
  parent: string | null
  color: string
  /** Number of modules directly inside (not in sub-packages). */
  moduleCount: number
}

export interface PackageModel {
  /** Every package cluster, sorted by ID. */
  clusters: PackageCluster[]
  /** The cluster that directly contains each module (null for top-level modules like "manage"). */
  clusterOf: ReadonlyMap<string, string | null>
  colorOf(moduleId: string): string
}

/**
 * The package a module lives in: a package's own __init__ belongs to its own cluster
 * ("shop.services" -> "shop.services"); a plain module belongs to its parent
 * ("shop.services.orders" -> "shop.services"); a top-level module has none.
 */
export function containingPackage(node: Pick<GraphNode, 'id' | 'is_package'>): string | null {
  if (node.is_package) return node.id
  const dot = node.id.lastIndexOf('.')
  return dot === -1 ? null : node.id.slice(0, dot)
}

function parentPackage(packageId: string): string | null {
  const dot = packageId.lastIndexOf('.')
  return dot === -1 ? null : packageId.slice(0, dot)
}

/**
 * Groups modules into nested package clusters. Clusters also exist for intermediate
 * packages with no modules of their own (e.g. namespace packages), so nesting is complete.
 * Colors are assigned in sorted order, so the same repository always gets the same colors.
 */
export function buildPackageModel(nodes: readonly GraphNode[]): PackageModel {
  const clusterOf = new Map<string, string | null>()
  const counts = new Map<string, number>()

  for (const node of nodes) {
    const pkg = containingPackage(node)
    clusterOf.set(node.id, pkg)
    for (let p = pkg; p !== null; p = parentPackage(p)) {
      if (!counts.has(p)) counts.set(p, 0)
    }
    if (pkg !== null) counts.set(pkg, (counts.get(pkg) ?? 0) + 1)
  }

  const ids = [...counts.keys()].sort()
  const clusters = ids.map((id, index) => ({
    id,
    parent: parentPackage(id),
    color: PACKAGE_COLORS[index % PACKAGE_COLORS.length],
    moduleCount: counts.get(id) ?? 0,
  }))
  const colors = new Map(clusters.map((c) => [c.id, c.color]))

  return {
    clusters,
    clusterOf,
    colorOf(moduleId) {
      const pkg = clusterOf.get(moduleId)
      return (pkg != null && colors.get(pkg)) || ROOT_COLOR
    },
  }
}
