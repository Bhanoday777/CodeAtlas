// Mirrors backend/app/api/schemas.py. The backend is the source of truth:
// change both together.
//
// Conventions from the backend:
// - Module IDs are dotted Python names ("shop.models.order").
// - An edge {source, target} means source imports target.
// - Every list is sorted, so identical scans give identical responses.

export interface Diagnostic {
  /** "scan_errors" | "unresolved_imports" | "self_imports" */
  code: string
  message: string
}

export interface HealthResponse {
  status: 'ok'
  repository: string
  module_count: number
  edge_count: number
}

export interface GraphNode {
  id: string
  path: string
  is_package: boolean
  has_scan_error: boolean
  dependency_count: number
  dependent_count: number
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphSummary {
  modules: number
  edges: number
  external_imports: number
  unresolved_imports: number
  scan_errors: number
  /** Self-imports: kept as local imports but not graph edges. */
  warnings: number
}

export interface GraphResponse {
  repository: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  summary: GraphSummary
}

/** One import statement as written in the module. */
export interface ImportEntry {
  raw: string
  lineno: number
}

export interface ModuleDetail {
  id: string
  path: string
  is_package: boolean
  has_scan_error: boolean
  /** Local modules this module imports. */
  dependencies: string[]
  /** Local modules that import this module. */
  dependents: string[]
  external_imports: ImportEntry[]
  unresolved_imports: ImportEntry[]
}

export interface ScanErrorOut {
  path: string
  message: string
  lineno: number | null
}

export interface ImportIssue {
  module: string
  raw: string
  lineno: number
}

export interface ScanIssuesResponse {
  scan_errors: ScanErrorOut[]
  unresolved_imports: ImportIssue[]
  self_imports: ImportIssue[]
  diagnostics: Diagnostic[]
  limitations: string[]
}
