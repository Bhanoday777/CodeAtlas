import { api } from '../services/api'
import type { GraphResponse, ImpactResponse, ModuleDetail, ScanIssuesResponse } from '../types/api'
import { useApiRequest } from './useApiRequest'

// Module-level loaders keep useApiRequest's effect dependencies stable.
const loadGraph = (_key: string, signal: AbortSignal) => api.getGraph(signal)
const loadModule = (moduleId: string, signal: AbortSignal) => api.getModule(moduleId, signal)
const loadScanIssues = (_key: string, signal: AbortSignal) => api.getScanIssues(signal)
const loadImpact = (moduleId: string, signal: AbortSignal) => api.getImpact(moduleId, signal)

/** The full module graph, loaded once (and again on retry). */
export function useGraph() {
  return useApiRequest<GraphResponse>('graph', loadGraph)
}

/** Details for the selected module; idle when nothing is selected. */
export function useModuleDetail(moduleId: string | null) {
  return useApiRequest<ModuleDetail>(moduleId, loadModule)
}

/** Scan issues, fetched the first time `enabled` is true and kept afterwards. */
export function useScanIssues(enabled: boolean) {
  return useApiRequest<ScanIssuesResponse>(enabled ? 'scan-issues' : null, loadScanIssues)
}

/** Change-impact report for `moduleId`; idle when impact mode is off. */
export function useImpact(moduleId: string | null) {
  return useApiRequest<ImpactResponse>(moduleId, loadImpact)
}
