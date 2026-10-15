// The only place the frontend talks to the backend. Components use the hooks in
// src/hooks, which call this client.
//
// Every failure becomes an ApiError; nothing is turned into an empty result.

import type {
  GraphResponse,
  ImportEntry,
  ImportIssue,
  ModuleDetail,
  ScanIssuesResponse,
} from '../types/api'

export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000'

export type ApiErrorKind =
  | 'network' // backend unreachable (not running, wrong URL, CORS rejection)
  | 'http' // backend answered with a non-2xx status
  | 'invalid' // backend answered 2xx with a body that does not match the contract

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | undefined

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function resolveBaseUrl(configured: string | undefined): string {
  const value = configured?.trim() || DEFAULT_API_BASE_URL
  return value.replace(/\/+$/, '')
}

// --- Response validation -----------------------------------------------------
// Checks the fields the UI relies on, so a contract mismatch shows up as a clear
// error instead of a crash deep inside a component.

type Guard<T> = (value: unknown) => value is T

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArrayOf<T>(value: unknown, guard: Guard<T>): value is T[] {
  return Array.isArray(value) && value.every(guard)
}

const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number'
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

function isImportEntry(value: unknown): value is ImportEntry {
  return isRecord(value) && isString(value.raw) && isNumber(value.lineno)
}

function isImportIssue(value: unknown): value is ImportIssue {
  return isRecord(value) && isImportEntry(value) && isString(value.module)
}

export function isGraphResponse(value: unknown): value is GraphResponse {
  if (!isRecord(value) || !isString(value.repository)) return false
  const { nodes, edges, summary } = value
  const nodesOk = isArrayOf(
    nodes,
    (n): n is GraphResponse['nodes'][number] =>
      isRecord(n) &&
      isString(n.id) &&
      isString(n.path) &&
      isBoolean(n.is_package) &&
      isBoolean(n.has_scan_error) &&
      isNumber(n.dependency_count) &&
      isNumber(n.dependent_count),
  )
  const edgesOk = isArrayOf(
    edges,
    (e): e is GraphResponse['edges'][number] => isRecord(e) && isString(e.source) && isString(e.target),
  )
  const summaryOk =
    isRecord(summary) &&
    ['modules', 'edges', 'external_imports', 'unresolved_imports', 'scan_errors', 'warnings'].every((key) =>
      isNumber(summary[key]),
    )
  if (!nodesOk || !edgesOk || !summaryOk) return false
  // Every edge must connect two modules in the response; the graph cannot be drawn otherwise.
  const ids = new Set(nodes.map((n) => n.id))
  return edges.every((e) => ids.has(e.source) && ids.has(e.target))
}

export function isModuleDetail(value: unknown): value is ModuleDetail {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.path) &&
    isBoolean(value.is_package) &&
    isBoolean(value.has_scan_error) &&
    isArrayOf(value.dependencies, isString) &&
    isArrayOf(value.dependents, isString) &&
    isArrayOf(value.external_imports, isImportEntry) &&
    isArrayOf(value.unresolved_imports, isImportEntry)
  )
}

export function isScanIssuesResponse(value: unknown): value is ScanIssuesResponse {
  return (
    isRecord(value) &&
    isArrayOf(
      value.scan_errors,
      (e): e is ScanIssuesResponse['scan_errors'][number] =>
        isRecord(e) && isString(e.path) && isString(e.message) && (e.lineno === null || isNumber(e.lineno)),
    ) &&
    isArrayOf(value.unresolved_imports, isImportIssue) &&
    isArrayOf(value.self_imports, isImportIssue) &&
    isArrayOf(
      value.diagnostics,
      (d): d is ScanIssuesResponse['diagnostics'][number] => isRecord(d) && isString(d.code) && isString(d.message),
    ) &&
    isArrayOf(value.limitations, isString)
  )
}

// --- Client --------------------------------------------------------------------

export interface ApiClient {
  readonly baseUrl: string
  getGraph(signal?: AbortSignal): Promise<GraphResponse>
  getModule(moduleId: string, signal?: AbortSignal): Promise<ModuleDetail>
  getScanIssues(signal?: AbortSignal): Promise<ScanIssuesResponse>
}

export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): ApiClient {
  async function request<T>(path: string, guard: Guard<T>, signal?: AbortSignal): Promise<T> {
    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { signal, headers: { Accept: 'application/json' } })
    } catch (error) {
      if (isAbortError(error)) throw error
      throw new ApiError('network', `Could not reach the CodeAtlas API at ${baseUrl}.`)
    }

    let body: unknown
    try {
      body = await response.json()
    } catch (error) {
      if (isAbortError(error)) throw error
      body = undefined
    }

    if (!response.ok) {
      const detail = isRecord(body) && isString(body.detail) ? body.detail : response.statusText
      throw new ApiError('http', detail ? `${response.status}: ${detail}` : `HTTP ${response.status}`, response.status)
    }
    if (!guard(body)) {
      throw new ApiError('invalid', `Unexpected response from ${path}: it does not match the API contract.`)
    }
    return body
  }

  return {
    baseUrl,
    getGraph: (signal) => request('/api/graph', isGraphResponse, signal),
    // Module IDs are encoded per the backend contract (FastAPI decodes before lookup).
    getModule: (moduleId, signal) =>
      request(`/api/modules/${encodeURIComponent(moduleId)}`, isModuleDetail, signal),
    getScanIssues: (signal) => request('/api/scan/issues', isScanIssuesResponse, signal),
  }
}

export const api = createApiClient(resolveBaseUrl(import.meta.env.VITE_API_BASE_URL))
