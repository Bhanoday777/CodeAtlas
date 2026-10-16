import { useEffect, useRef } from 'react'

import type { RequestState } from '../../hooks/useApiRequest'
import { errorTitle } from '../../lib/errorText'
import { shortLabel } from '../../lib/graphElements'
import { distanceBucket, groupByDistance, stepVerb, type DistanceBucket } from '../../lib/impact'
import type { PackageModel } from '../../lib/packages'
import type { AffectedModule, ImpactResponse } from '../../types/api'
import { AlertIcon, CloseIcon } from '../common/icons'
import { Spinner, StatusMessage } from '../common/StatusMessage'

// Tailwind classes per distance bucket; the graph uses the same colors (graphStyle.ts).
const BUCKET_DOT: Record<DistanceBucket, string> = { 1: 'bg-impact', 2: 'bg-impact-2', 3: 'bg-impact-3' }
const BUCKET_TEXT: Record<DistanceBucket, string> = { 1: 'text-impact', 2: 'text-impact-2', 3: 'text-impact-3' }

interface ImpactReportProps {
  changedId: string
  report: RequestState<ImpactResponse> & { retry: () => void }
  focusedId: string | null
  packages: PackageModel
  /** Focus one affected module's explanation path (null clears it). */
  onFocus: (moduleId: string | null) => void
  onExit: () => void
  onOpenDiagnostics: () => void
}

/** Impact mode's replacement for the details panel: what may be affected if `changedId` changes, and why. */
export function ImpactReport({ changedId, report, focusedId, packages, onFocus, onExit, onOpenDiagnostics }: ImpactReportProps) {
  return (
    <section aria-label={`Change impact of ${changedId}`} className="flex h-full min-h-0 flex-col">
      <header className="border-b border-line px-4 pt-4 pb-3.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-impact/40 bg-impact/10 px-1.5 py-0.5 text-xs font-medium text-impact">
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            Change impact
          </span>
          <button
            type="button"
            onClick={onExit}
            title="Exit impact mode (Esc)"
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2 py-1 text-sm text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <CloseIcon width={12} height={12} />
            Exit
            <kbd className="text-2xs text-faint">Esc</kbd>
          </button>
        </div>
        <h2 className="mt-2 text-xl leading-tight font-semibold tracking-tight break-all">
          If <span className="text-impact">{shortLabel(changedId)}</span> changes…
        </h2>
        <p className="mt-0.5 font-mono text-sm break-all text-muted">{changedId}</p>
        <p className="mt-2 text-sm text-faint">
          These modules depend on it, directly or through other modules, so they may be affected.
        </p>
      </header>

      {report.status === 'loading' && (
        <div className="flex flex-1 items-center justify-center py-8">
          <Spinner label="Analyzing impact…" />
        </div>
      )}
      {report.status === 'error' && (
        <StatusMessage tone="error" compact title={errorTitle(report.error, 'the impact report')} action={{ label: 'Retry', onClick: report.retry }}>
          {report.error.message}
        </StatusMessage>
      )}
      {report.status === 'success' && (
        <ReportBody
          // Keyed so the fade-in replays for each new report.
          key={report.data.changed_module}
          report={report.data}
          focusedId={focusedId}
          packages={packages}
          onFocus={onFocus}
          onOpenDiagnostics={onOpenDiagnostics}
        />
      )}
    </section>
  )
}

interface ReportBodyProps {
  report: ImpactResponse
  focusedId: string | null
  packages: PackageModel
  onFocus: (moduleId: string | null) => void
  onOpenDiagnostics: () => void
}

function ReportBody({ report, focusedId, packages, onFocus, onOpenDiagnostics }: ReportBodyProps) {
  const groups = groupByDistance(report)

  return (
    <div className="min-h-0 flex-1 animate-fade-in overflow-y-auto">
      <div className="border-b border-line px-4 py-3">
        <dl className="grid grid-cols-3 gap-1.5">
          <Stat label="Affected" value={report.affected.length} className="text-ink" />
          <Stat label="Direct" value={report.direct.length} className="text-impact" />
          <Stat label="Transitive" value={report.transitive.length} className="text-impact-2" />
        </dl>
        {report.diagnostics.length > 0 && <Caveats report={report} onOpenDiagnostics={onOpenDiagnostics} />}
      </div>

      {groups.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-md font-medium">No other module is affected</p>
          <p className="mt-1 text-sm text-muted">
            No local module depends on <span className="font-mono text-ink">{report.changed_module}</span>, directly or indirectly.
          </p>
        </div>
      ) : (
        groups.map((group) => {
          const bucket = distanceBucket(group.distance)
          return (
            <div key={group.distance} className="border-b border-line px-4 py-3 last:border-b-0">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <span className={`size-2 rounded-full ${BUCKET_DOT[bucket]}`} aria-hidden="true" />
                Distance {group.distance}
                <span className="ml-auto rounded-md bg-hover px-1.5 font-mono text-2xs font-normal text-muted">{group.modules.length}</span>
              </h3>
              <p className="mt-0.5 text-xs text-faint">
                {group.distance === 1
                  ? 'Import the changed module directly'
                  : `Through ${group.distance - 1} intermediate module${group.distance === 2 ? '' : 's'}`}
              </p>
              <ul className="-mx-1.5 mt-2 space-y-px">
                {group.modules.map((module) => (
                  <AffectedRow
                    key={module.id}
                    module={module}
                    bucket={bucket}
                    focused={module.id === focusedId}
                    packages={packages}
                    onFocus={onFocus}
                  />
                ))}
              </ul>
            </div>
          )
        })
      )}
    </div>
  )
}

function Caveats({ report, onOpenDiagnostics }: { report: ImpactResponse; onOpenDiagnostics: () => void }) {
  return (
    <div role="note" className="mt-3 rounded-lg border border-warn/30 bg-warn/[0.07] px-2.5 py-2 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-warn">
        <AlertIcon className="shrink-0" width={13} height={13} />
        This list may be incomplete
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted marker:text-warn/60">
        {report.diagnostics.map((diagnostic) => (
          <li key={diagnostic.code}>{diagnostic.message}</li>
        ))}
      </ul>
      <button type="button" onClick={onOpenDiagnostics} className="mt-1.5 text-xs text-warn underline-offset-2 hover:underline">
        View scan diagnostics
      </button>
    </div>
  )
}

interface AffectedRowProps {
  module: AffectedModule
  bucket: DistanceBucket
  focused: boolean
  packages: PackageModel
  onFocus: (moduleId: string | null) => void
}

function AffectedRow({ module, bucket, focused, packages, onFocus }: AffectedRowProps) {
  const pathId = `impact-path-${module.id}`
  const rowRef = useRef<HTMLLIElement>(null)

  // A path focused from the graph may be scrolled out of view in the report.
  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focused])

  return (
    <li ref={rowRef} className={`rounded-md ${focused ? 'bg-impact/[0.07] ring-1 ring-impact/30' : ''}`}>
      <button
        type="button"
        onClick={() => onFocus(focused ? null : module.id)}
        aria-expanded={focused}
        aria-controls={pathId}
        title={focused ? 'Hide explanation path' : 'Show why this module may be affected'}
        className="group flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-hover"
      >
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: packages.colorOf(module.id) }} aria-hidden="true" />
        <span className={`text-sm ${focused ? BUCKET_TEXT[bucket] : 'text-ink'}`}>{shortLabel(module.id)}</span>
        <span className="min-w-0 truncate font-mono text-xs text-faint">{module.id}</span>
        <span className={`ml-auto shrink-0 text-2xs text-faint transition-transform ${focused ? 'rotate-90' : ''}`} aria-hidden="true">
          ▸
        </span>
      </button>
      {focused && <ExplanationPath id={pathId} path={module.path} packages={packages} onFocus={onFocus} />}
    </li>
  )
}

interface ExplanationPathProps {
  id: string
  path: string[]
  packages: PackageModel
  onFocus: (moduleId: string | null) => void
}

/** The dependency chain from the affected module down to the changed one: each step depends on the next. */
function ExplanationPath({ id, path, packages, onFocus }: ExplanationPathProps) {
  const last = path.length - 1
  return (
    <ol id={id} aria-label="Explanation path" className="animate-fade-in px-2 pt-1 pb-2">
      {path.map((step, index) => (
        <li key={step}>
          {index > 0 && (
            <span className="ml-[5px] flex items-center gap-2 border-l border-impact/40 py-0.5 pl-3 text-2xs text-faint">
              {stepVerb(step, packages)}
            </span>
          )}
          {index === 0 || index === last ? (
            <PathStep id={step} emphasis={index === last ? 'changed' : 'start'} />
          ) : (
            <button
              type="button"
              onClick={() => onFocus(step)}
              title={`Show the path for ${step}`}
              className="-mx-1 rounded px-1 text-left transition-colors hover:bg-hover"
            >
              <PathStep id={step} />
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}

function PathStep({ id, emphasis }: { id: string; emphasis?: 'start' | 'changed' }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={`size-[11px] shrink-0 rounded-full border-2 ${emphasis === 'changed' ? 'border-impact bg-impact' : 'border-impact/60 bg-surface'}`}
        aria-hidden="true"
      />
      <span className={`font-mono text-xs break-all ${emphasis ? 'text-ink' : 'text-muted'}`}>{id}</span>
    </span>
  )
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-lg border border-line bg-raised/60 px-2.5 py-1.5">
      <dt className="truncate text-xs text-muted">{label}</dt>
      <dd className={`font-mono text-lg leading-tight font-semibold tabular-nums ${className}`}>{value}</dd>
    </div>
  )
}
