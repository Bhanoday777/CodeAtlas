import type { ReactNode } from 'react'

import { useModuleDetail } from '../../hooks/useCodeAtlas'
import { errorTitle } from '../../lib/errorText'
import type { ImportEntry, ModuleDetail } from '../../types/api'
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon } from '../common/icons'
import { Spinner, StatusMessage } from '../common/StatusMessage'

interface ModuleDetailPanelProps {
  selectedId: string | null
  onSelect: (moduleId: string) => void
}

export function ModuleDetailPanel({ selectedId, onSelect }: ModuleDetailPanelProps) {
  const detail = useModuleDetail(selectedId)

  return (
    <section aria-label="Module details" className="flex h-full min-h-0 flex-col">
      {detail.status === 'idle' && (
        <StatusMessage title="No module selected" compact>
          Select a module in the graph or the module list to see what it imports and what imports it.
        </StatusMessage>
      )}
      {detail.status === 'loading' && (
        <div className="flex h-full items-center justify-center py-8">
          <Spinner label={`Loading ${selectedId}…`} />
        </div>
      )}
      {detail.status === 'error' && (
        <StatusMessage
          tone="error"
          compact
          title={errorTitle(detail.error, 'this module')}
          action={{ label: 'Retry', onClick: detail.retry }}
        >
          {detail.error.message}
        </StatusMessage>
      )}
      {detail.status === 'success' && <ModuleDetailBody module={detail.data} onSelect={onSelect} />}
    </section>
  )
}

function ModuleDetailBody({ module, onSelect }: { module: ModuleDetail; onSelect: (moduleId: string) => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-b border-line px-4 py-3">
        <p className="text-[11px] font-medium tracking-wide text-faint uppercase">
          {module.is_package ? 'Package' : 'Module'}
        </p>
        <h2 className="mt-0.5 font-mono text-[14px] break-all text-ink">{module.id}</h2>
        <p className="mt-1 font-mono text-[12px] break-all text-muted">{module.path}</p>
        {module.has_scan_error && (
          <p className="mt-3 flex gap-2 rounded-md border border-danger/30 bg-danger/10 px-2.5 py-2 text-[12px] text-danger">
            <AlertIcon className="mt-px shrink-0" width={14} height={14} />
            <span>This file could not be parsed, so its imports are missing from the graph.</span>
          </p>
        )}
      </header>

      <Section
        title="Imports"
        hint="Local modules this module imports"
        count={module.dependencies.length}
        icon={<ArrowRightIcon className="text-accent" width={14} height={14} />}
        empty="Imports no local modules."
      >
        <ModuleLinks ids={module.dependencies} onSelect={onSelect} />
      </Section>

      <Section
        title="Imported by"
        hint="Local modules that import this module directly"
        count={module.dependents.length}
        icon={<ArrowLeftIcon className="text-incoming" width={14} height={14} />}
        empty="No local module imports this one."
      >
        <ModuleLinks ids={module.dependents} onSelect={onSelect} />
      </Section>

      <Section
        title="External imports"
        hint="Standard library and third-party imports; not graph nodes"
        count={module.external_imports.length}
        empty="None."
      >
        <ImportLines entries={module.external_imports} />
      </Section>

      <Section
        title="Unresolved imports"
        hint="Look local but match no module in the repository; not graph edges"
        count={module.unresolved_imports.length}
        tone={module.unresolved_imports.length > 0 ? 'warn' : undefined}
        empty="None."
      >
        <ImportLines entries={module.unresolved_imports} />
      </Section>
    </div>
  )
}

interface SectionProps {
  title: string
  hint: string
  count: number
  empty: string
  icon?: ReactNode
  tone?: 'warn'
  children: ReactNode
}

function Section({ title, hint, count, empty, icon, tone, children }: SectionProps) {
  return (
    <div className="border-b border-line px-4 py-3 last:border-b-0">
      <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-ink" title={hint}>
        {icon}
        {title}
        <span className={`ml-auto font-mono text-[11px] font-normal ${tone === 'warn' ? 'text-warn' : 'text-faint'}`}>
          {count}
        </span>
      </h3>
      <p className="mt-0.5 text-[11px] text-faint">{hint}</p>
      <div className="mt-2">{count === 0 ? <p className="text-[12px] text-faint">{empty}</p> : children}</div>
    </div>
  )
}

function ModuleLinks({ ids, onSelect }: { ids: string[]; onSelect: (moduleId: string) => void }) {
  return (
    <ul className="-mx-1.5 space-y-px">
      {ids.map((id) => (
        <li key={id}>
          <button
            type="button"
            onClick={() => onSelect(id)}
            className="w-full truncate rounded px-1.5 py-1 text-left font-mono text-[12px] text-accent-ink transition-colors hover:bg-hover"
          >
            {id}
          </button>
        </li>
      ))}
    </ul>
  )
}

function ImportLines({ entries }: { entries: ImportEntry[] }) {
  return (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <li key={`${entry.lineno}:${entry.raw}`} className="flex gap-2 font-mono text-[12px]">
          <span className="w-8 shrink-0 text-right text-faint">L{entry.lineno}</span>
          <code className="min-w-0 break-all text-muted">{entry.raw}</code>
        </li>
      ))}
    </ul>
  )
}
