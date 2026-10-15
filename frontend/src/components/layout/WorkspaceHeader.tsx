import { FolderIcon, SearchIcon } from '../common/icons'

type ApiStatus = 'loading' | 'connected' | 'unavailable'

interface WorkspaceHeaderProps {
  repository: string | null
  apiStatus: ApiStatus
  apiBaseUrl: string
  onOpenSearch: () => void
}

const STATUS: Record<ApiStatus, { label: string; dot: string }> = {
  loading: { label: 'Connecting', dot: 'bg-faint animate-pulse' },
  connected: { label: 'Connected', dot: 'bg-ok' },
  unavailable: { label: 'Unavailable', dot: 'bg-danger' },
}

export function WorkspaceHeader({ repository, apiStatus, apiBaseUrl, onOpenSearch }: WorkspaceHeaderProps) {
  const status = STATUS[apiStatus]

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface/60 px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-strong bg-raised text-muted">
          <FolderIcon />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] text-faint">
            <span>CodeAtlas</span>
            <span aria-hidden="true">/</span>
            <span>Graph Explorer</span>
          </div>
          <h1 className="truncate text-[16px] leading-tight font-semibold tracking-tight">
            {repository ?? (
              <span className="text-muted">{apiStatus === 'loading' ? 'Loading repository…' : 'Repository unavailable'}</span>
            )}
          </h1>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {apiStatus === 'connected' && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="hidden h-8 w-64 items-center gap-2 rounded-lg border border-line-strong bg-raised px-2.5 text-[13px] text-faint transition-colors hover:border-faint/60 hover:text-muted sm:flex"
          >
            <SearchIcon />
            <span>Jump to module…</span>
            <kbd className="ml-auto rounded border border-line-strong bg-surface px-1.5 text-[10px] text-muted">Ctrl K</kbd>
          </button>
        )}
        <div
          className="flex h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-[12px] text-muted"
          title={`API: ${apiBaseUrl}`}
        >
          <span className={`size-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
          <span>
            API <span className="text-ink">{status.label}</span>
          </span>
          <span className="hidden font-mono text-[11px] text-faint lg:inline">{apiBaseUrl.replace(/^https?:\/\//, '')}</span>
        </div>
      </div>
    </header>
  )
}
