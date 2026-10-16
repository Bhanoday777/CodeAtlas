import type { ElementDefinition } from 'cytoscape'

import type { GraphResponse } from '../types/api'
import { buildPackageModel, type PackageModel } from './packages'

export interface ModuleNodeData {
  kind: 'module'
  id: string
  label: string
  path: string
  isPackage: boolean
  hasScanError: boolean
  dependencyCount: number
  dependentCount: number
  /** Package color for this module. */
  color: string
  /** 0..1, from how many modules import this one relative to the most-imported module. */
  weight: number
  parent?: string
}

export interface PackageNodeData {
  kind: 'package'
  /** Prefixed (see clusterNodeId) so a package box never collides with the package's own module ID. */
  id: string
  label: string
  color: string
  parent?: string
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

/** Element ID of a package box. "shop" is both a module and a package, so boxes are prefixed. */
export function clusterNodeId(packageId: string): string {
  return `pkg:${packageId}`
}

/**
 * Converts the API graph into Cytoscape elements: package boxes (compound nodes),
 * one node per module inside its package box, and one edge per import.
 *
 * Edge direction is kept exactly as the API sends it: source depends on target.
 * The API never sends duplicate edges; if it did, the repeat is skipped, because
 * Cytoscape rejects two elements with the same ID.
 */
export function toElements(graph: GraphResponse, packages: PackageModel = buildPackageModel(graph.nodes)): ElementDefinition[] {
  const clusters: ElementDefinition[] = packages.clusters.map((cluster) => {
    const data: PackageNodeData = {
      kind: 'package',
      id: clusterNodeId(cluster.id),
      label: cluster.id,
      color: cluster.color,
    }
    if (cluster.parent !== null) data.parent = clusterNodeId(cluster.parent)
    return { group: 'nodes', data, classes: 'cluster', selectable: false }
  })

  const maxDependents = Math.max(0, ...graph.nodes.map((n) => n.dependent_count))
  const nodes: ElementDefinition[] = graph.nodes.map((node) => {
    const data: ModuleNodeData = {
      kind: 'module',
      id: node.id,
      label: shortLabel(node.id),
      path: node.path,
      isPackage: node.is_package,
      hasScanError: node.has_scan_error,
      dependencyCount: node.dependency_count,
      dependentCount: node.dependent_count,
      color: packages.colorOf(node.id),
      weight: maxDependents === 0 ? 0 : Math.sqrt(node.dependent_count / maxDependents),
    }
    const pkg = packages.clusterOf.get(node.id)
    if (pkg != null) data.parent = clusterNodeId(pkg)
    const classes = ['module', node.is_package && 'package', node.has_scan_error && 'scan-error'].filter(Boolean).join(' ')
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

  return [...clusters, ...nodes, ...edges]
}
