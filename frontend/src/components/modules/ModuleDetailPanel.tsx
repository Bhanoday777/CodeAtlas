import type { ReactNode } from 'react'

import { useModuleDetail } from '../../hooks/useCodeAtlas'
import { errorTitle } from '../../lib/errorText'
import { shortLabel } from '../../lib/graphElements'
import type { PackageModel } from '../../lib/packages'
import type { ImportEntry, ModuleDetail } from '../../types/api'
import { AlertIcon, ArrowLeftIcon, ArrowRightIcon, FileIcon, GraphIcon } from '../common/icons'
import { Spinner, StatusMessage } from '../common/StatusMessage'

interface ModuleDetailPanelProps {
  selectedId: string | null
  packages: PackageModel
  onSelect: (moduleId: string) => void
  onAnalyzeImpact: (moduleId: string) => void
}

export function ModuleDetailPanel({ selectedId, packages, onSelect, onAnalyzeImpact }: ModuleDetailPanelProps) {
  const detail = useModuleDetail(selectedId)

  return (
    <section aria-label="Module details" className="flex h-full min-h-0 flex-col">
      {detail.status === 'idle' && <EmptyDetail />}
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
      {detail.status === 'success' && (
        // Keyed so the fade-in replays when the selection changes.
        <ModuleDetailBody
          key={detail.data.id}
          module={detail.data}
          packages={packages}
          onSelect={onSelect}
          onAnalyzeImpact={onAnalyzeImpact}
        />
      )}
    </section>
  )
}

function EmptyDetail() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <div className="grid size-11 place-items-center rounded-xl border border-line-strong bg-raised text-faint">
        <GraphIcon width={20} height={20} />
      </div>
      <p className="text-md font-medium">No module selected</p>
      <p className="max-w-60 text-sm text-muted">
        Click a node in the graph, pick one from the list, or press{' '}
        <kbd className="rounded border border-line-strong bg-raised px-1 text-xs text-ink">Ctrl K</kbd> to jump to a module.
      </p>
    </div>
  )
}

interface BodyProps {
  module: ModuleDetail
  packages: PackageModel
  onSelect: (moduleId: string) => void
  onAnalyzeImpact: (moduleId: string) => void
}

function ModuleDetailBody({ module, packages, onSelect, onAnalyzeImpact }: BodyProps) {
  const pkg = packages.clusterOf.get(module.id) ?? null

  return (
    <div className="min-h-0 flex-1 animate-fade-in overflow-y-auto">
      <header className="border-b border-line px-4 pt-4 pb-3.5">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-xs"
            style={{ borderColor: `${packages.colorOf(module.id)}55`, color: packages.colorOf(module.id) }}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
            <span className="truncate">{pkg ?? 'top level'}</span>
          </span>
          <span className="text-xs text-faint">{module.is_package ? 'Package' : 'Module'}</span>
        </div>
        <h2 className="mt-2 text-xl leading-tight font-semibold tracking-tight break-all">{shortLabel(module.id)}</h2>
        <p className="mt-0.5 font-mono text-sm break-all text-muted">{module.id}</p>
        <p className="mt-2 flex items-center gap-1.5 font-mono text-xs break-all text-faint">
          <FileIcon className="shrink-0" width={13} height={13} />
          {module.path}
        </p>
        {module.has_scan_error && (
          <p className="mt-3 flex gap-2 rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-2 text-sm text-danger">
            <AlertIcon className="mt-px shrink-0" width={14} height={14} />
            <span>This file could not be parsed, so its imports are missing from the graph.</span>
          </p>
        )}

        <dl className="mt-3.5 grid grid-cols-2 gap-1.5">
          <Stat label="Imports" value={module.dependencies.length} className="text-accent" />
          <Stat label="Imported by" value={module.dependents.length} className="text-incoming" />
          <Stat label="External" value={module.external_imports.length} className="text-ink" />
          <Stat
            label="Unresolved"
            value={module.unresolved_imports.length}
            className={module.unresolved_imports.length > 0 ? 'text-warn' : 'text-ink'}
          />
        </dl>

        <button
          type="button"
          onClick={() => onAnalyzeImpact(module.id)}
          title="Which modules may be affected if this module changes"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-impact/40 bg-impact/10 px-3 py-1.5 text-sm font-medium text-impact transition-colors hover:bg-impact/20"
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          Analyze impact
        </button>
      </header>

      <Section
        title="Imports"
        hint="Local modules it imports, plus their parent packages"
        count={module.dependencies.length}
        icon={<ArrowRightIcon className="text-accent" width={14} height={14} />}
        empty="Imports no local modules."
      >
        <ModuleLinks ids={module.dependencies} packages={packages} onSelect={onSelect} />
      </Section>

      <Section
        title="Imported by"
        hint="Local modules that import it (or a module inside it)"
        count={module.dependents.length}
        icon={<ArrowLeftIcon className="text-incoming" width={14} height={14} />}
        empty="No local module imports this one."
      >
        <ModuleLinks ids={module.dependents} packages={packages} onSelect={onSelect} />
      </Section>

      <Section title="External imports" hint="Standard library and third-party; not graph nodes" count={module.external_imports.length} empty="None.">
        <ImportLines entries={module.external_imports} />
      </Section>

      <Section
        title="Unresolved imports"
        hint="Look local but match no module in the repository; not graph edges"
        count={module.unresolved_imports.length}
        tone={module.unresolved_imports.length > 0 ? 'warn' : undefined}
        empty="None."
      >
        <ImportLines entries={module.unresolved_imports} tone="warn" />
      </Section>
    </div>
  )
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-lg border border-line bg-raised/60 px-2.5 py-1.5">
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className={`font-mono text-lg leading-tight font-semibold tabular-nums ${className}`}>{value}</dd>
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
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        {icon}
        {title}
        <span className={`ml-auto rounded-md bg-hover px-1.5 font-mono text-2xs font-normal ${tone === 'warn' ? 'text-warn' : 'text-muted'}`}>
          {count}
        </span>
      </h3>
      <p className="mt-0.5 text-xs text-faint">{hint}</p>
      <div className="mt-2">{count === 0 ? <p className="text-sm text-faint italic">{empty}</p> : children}</div>
    </div>
  )
}

function ModuleLinks({ ids, packages, onSelect }: { ids: string[]; packages: PackageModel; onSelect: (moduleId: string) => void }) {
  return (
    <ul className="-mx-1.5 space-y-px">
      {ids.map((id) => (
        <li key={id}>
          <button
            type="button"
            onClick={() => onSelect(id)}
            title={`Select ${id}`}
            className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-hover"
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: packages.colorOf(id) }} aria-hidden="true" />
            <span className="text-sm text-ink group-hover:text-accent-ink">{shortLabel(id)}</span>
            <span className="min-w-0 truncate font-mono text-xs text-faint">{id}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function ImportLines({ entries, tone }: { entries: ImportEntry[]; tone?: 'warn' }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-line bg-canvas/60">
      {entries.map((entry) => (
        <li key={`${entry.lineno}:${entry.raw}`} className="flex gap-2 border-b border-line/60 px-2 py-1 font-mono text-xs last:border-b-0">
          <span className="w-7 shrink-0 text-right text-faint select-none">{entry.lineno}</span>
          <code className={`min-w-0 break-all ${tone === 'warn' ? 'text-warn/90' : 'text-muted'}`}>{entry.raw}</code>
        </li>
      ))}
    </ul>
  )
}
