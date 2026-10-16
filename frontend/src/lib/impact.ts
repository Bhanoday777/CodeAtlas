import type { AffectedModule, ImpactResponse } from '../types/api'
import { edgeId } from './graphElements'
import type { PackageModel } from './packages'

/** Graph color bucket for a distance: 1, 2, and 3 for everything farther. */
export type DistanceBucket = 1 | 2 | 3

export function distanceBucket(distance: number): DistanceBucket {
  return distance <= 1 ? 1 : distance === 2 ? 2 : 3
}

export interface DistanceGroup {
  distance: number
  modules: AffectedModule[]
}

/** Affected modules grouped by exact distance, nearest first; module order within a group is kept. */
export function groupByDistance(report: ImpactResponse): DistanceGroup[] {
  const groups = new Map<number, AffectedModule[]>()
  for (const module of report.affected) {
    const group = groups.get(module.distance)
    if (group) group.push(module)
    else groups.set(module.distance, [module])
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([distance, modules]) => ({ distance, modules }))
}

/** Edge IDs along an explanation path. Each step depends on the next, so path [a, b] is the edge a → b. */
export function pathEdgeIds(path: readonly string[]): string[] {
  return path.slice(1).map((target, i) => edgeId(path[i], target))
}

export interface ImpactHighlight {
  changed: string
  /** False while the report is loading: only the changed module is known. */
  ready: boolean
  /** Distance bucket of every affected module. */
  buckets: ReadonlyMap<string, DistanceBucket>
  /**
   * Edges on at least one explanation path. Every affected module has exactly one
   * path, and paths share their tails, so these form a tree rooted at `changed`.
   */
  pathEdges: ReadonlySet<string>
  /** The explanation path picked in the report or on the graph, if any. */
  focus: { id: string; nodes: string[]; edges: string[] } | null
}

/**
 * What the graph highlights in impact mode. `report` is null while it loads; a
 * report for a different module (a stale one) is ignored.
 */
export function impactHighlight(changed: string, report: ImpactResponse | null, focusedId: string | null): ImpactHighlight {
  const usable = report?.changed_module === changed ? report : null
  const buckets = new Map<string, DistanceBucket>()
  const pathEdges = new Set<string>()
  let focus: ImpactHighlight['focus'] = null
  for (const module of usable?.affected ?? []) {
    buckets.set(module.id, distanceBucket(module.distance))
    const edges = pathEdgeIds(module.path)
    for (const id of edges) pathEdges.add(id)
    if (module.id === focusedId) focus = { id: module.id, nodes: module.path, edges }
  }
  return { changed, ready: usable !== null, buckets, pathEdges, focus }
}

/**
 * How one explanation-path step reads: "a imports b", or "a imports from b" when b is a
 * package. A package edge can come from importing a module inside it, which runs the
 * package's __init__.py first, so "imports b" would not always be literally true.
 */
export function stepVerb(target: string, packages: Pick<PackageModel, 'clusterOf'>): 'imports' | 'imports from' {
  return packages.clusterOf.get(target) === target ? 'imports from' : 'imports'
}
