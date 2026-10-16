import { useEffect, type ReactNode } from 'react'

import { useScanIssues } from '../../hooks/useCodeAtlas'
import { errorTitle } from '../../lib/errorText'
import type { ScanIssuesResponse } from '../../types/api'
import { CloseIcon } from '../common/icons'
import { Spinner, StatusMessage } from '../common/StatusMessage'

interface DiagnosticsPanelProps {
  open: boolean
  onClose: () => void
  onSelectModule: (moduleId: string) => void
}

/** Side drawer listing /api/scan/issues. Loaded the first time it opens. */
export function DiagnosticsPanel({ open, onClose, onSelectModule }: DiagnosticsPanelProps) {
  const issues = useScanIssues(open)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <aside
      id="diagnostics-panel"
      aria-label="Scan diagnostics"
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[440px] flex-col border-l border-line bg-surface shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-md font-semibold">Scan diagnostics</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close diagnostics"
          className="ml-auto grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <CloseIcon />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {issues.status === 'loading' && (
          <div className="flex justify-center py-10">
            <Spinner label="Loading diagnostics…" />
          </div>
        )}
        {issues.status === 'error' && (
          <StatusMessage
            tone="error"
            compact
            title={errorTitle(issues.error, 'diagnostics')}
            action={{ label: 'Retry', onClick: issues.retry }}
          >
            {issues.error.message}
          </StatusMessage>
        )}
        {issues.status === 'success' && (
          <DiagnosticsBody issues={issues.data} onSelectModule={onSelectModule} />
        )}
      </div>
    </aside>
  )
}

function DiagnosticsBody({ issues, onSelectModule }: { issues: ScanIssuesResponse; onSelectModule: (id: string) => void }) {
  return (
    <>
      {issues.diagnostics.length > 0 && (
        <div className="space-y-2 border-b border-line px-4 py-3">
          {issues.diagnostics.map((d) => (
            <p key={d.code} className="text-sm text-muted">
              {d.message}
            </p>
          ))}
        </div>
      )}

      <Group title="Scan errors" hint="Files that could not be parsed. Their imports are missing from the graph." count={issues.scan_errors.length} tone="danger">
        {issues.scan_errors.map((e) => (
          <li key={`${e.path}:${e.lineno}:${e.message}`} className="font-mono text-sm">
            <span className="text-ink">
              {e.path}
              {e.lineno !== null && <span className="text-faint">:{e.lineno}</span>}
            </span>
            <span className="block text-danger">{e.message}</span>
          </li>
        ))}
      </Group>

      <Group title="Unresolved imports" hint="Look local but match no module in the repository. Not graph edges." count={issues.unresolved_imports.length} tone="warn">
        {issues.unresolved_imports.map((i) => (
          <IssueLine key={`${i.module}:${i.lineno}:${i.raw}`} module={i.module} lineno={i.lineno} raw={i.raw} onSelect={onSelectModule} />
        ))}
      </Group>

      <Group title="Self-imports" hint="A module importing itself. Kept as a local import, not a graph edge." count={issues.self_imports.length} tone="warn">
        {issues.self_imports.map((i) => (
          <IssueLine key={`${i.module}:${i.lineno}:${i.raw}`} module={i.module} lineno={i.lineno} raw={i.raw} onSelect={onSelectModule} />
        ))}
      </Group>

      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Limitations</h3>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted">
          {issues.limitations.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>
    </>
  )
}

function Group({
  title,
  hint,
  count,
  tone,
  children,
}: {
  title: string
  hint: string
  count: number
  tone: 'danger' | 'warn'
  children: ReactNode
}) {
  return (
    <div className="border-b border-line px-4 py-3">
      <h3 className="flex items-center text-sm font-semibold text-ink">
        {title}
        <span className={`ml-auto font-mono text-xs font-normal ${count === 0 ? 'text-faint' : tone === 'danger' ? 'text-danger' : 'text-warn'}`}>
          {count}
        </span>
      </h3>
      <p className="mt-0.5 text-xs text-faint">{hint}</p>
      {count === 0 ? <p className="mt-2 text-sm text-faint">None recorded.</p> : <ul className="mt-2 space-y-2">{children}</ul>}
    </div>
  )
}

function IssueLine({ module, lineno, raw, onSelect }: { module: string; lineno: number; raw: string; onSelect: (id: string) => void }) {
  return (
    <li className="font-mono text-sm">
      <button type="button" onClick={() => onSelect(module)} className="text-accent-ink hover:underline">
        {module}
      </button>
      <span className="text-faint">:{lineno}</span>
      <code className="block break-all text-muted">{raw}</code>
    </li>
  )
}
