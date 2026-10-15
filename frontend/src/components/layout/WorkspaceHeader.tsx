import type { GraphSummary } from '../../types/api'
import { AlertIcon } from '../common/icons'

interface WorkspaceHeaderProps {
  repository: string | null
  loading: boolean
  summary: GraphSummary | null
  diagnosticsOpen: boolean
  onToggleDiagnostics: () => void
}

export function WorkspaceHeader({ repository, loading, summary, diagnosticsOpen, onToggleDiagnostics }: WorkspaceHeaderProps) {
  const issueCount = summary ? summary.scan_errors + summary.unresolved_imports + summary.warnings : null

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3">
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-semibold tracking-tight">
          {repository ?? <span className="text-muted">{loading ? 'Loading repository…' : 'Repository unavailable'}</span>}
        </h1>
        <p className="text-[12px] text-muted">Explore module dependencies · static analysis of import statements</p>
      </div>
      {summary && (
        <button
          type="button"
          onClick={onToggleDiagnostics}
          aria-expanded={diagnosticsOpen}
          aria-controls="diagnostics-panel"
          className="ml-auto flex items-center gap-2 rounded-md border border-line bg-raised px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-hover"
        >
          <AlertIcon className={issueCount ? 'text-warn' : 'text-faint'} />
          Diagnostics
          <span className="rounded bg-canvas px-1.5 font-mono text-[11px] text-muted">{issueCount}</span>
        </button>
      )}
    </header>
  )
}
