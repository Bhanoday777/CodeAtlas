import type { ReactNode } from 'react'

import type { GraphSummary } from '../../types/api'
import { AlertIcon, CubeIcon, EdgesIcon, ExternalIcon, QuestionIcon, XCircleIcon } from '../common/icons'

interface Metric {
  label: string
  value: number
  detail: string
  icon: ReactNode
  /** Issue metrics are highlighted only when non-zero. */
  tone?: 'warn' | 'danger'
}

interface SummaryStripProps {
  summary: GraphSummary
  /** Modules that are packages (__init__.py), counted from the graph nodes. */
  packageCount: number
  onOpenDiagnostics: () => void
}

const CARD = 'block h-full w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-left shadow-(--shadow-panel)'

/** The six counts from GraphResponse.summary, shown as reported by the backend. */
export function SummaryStrip({ summary, packageCount, onOpenDiagnostics }: SummaryStripProps) {
  const metrics: Metric[] = [
    { label: 'Modules', value: summary.modules, detail: `${packageCount} ${packageCount === 1 ? 'package' : 'packages'}`, icon: <CubeIcon /> },
    { label: 'Import edges', value: summary.edges, detail: 'imports + parent packages', icon: <EdgesIcon /> },
    { label: 'External imports', value: summary.external_imports, detail: 'stdlib + third-party', icon: <ExternalIcon /> },
    { label: 'Unresolved', value: summary.unresolved_imports, detail: 'look local, no match', icon: <QuestionIcon />, tone: 'warn' },
    { label: 'Scan errors', value: summary.scan_errors, detail: 'files not parsed', icon: <XCircleIcon />, tone: 'danger' },
    { label: 'Warnings', value: summary.warnings, detail: 'self-imports', icon: <AlertIcon />, tone: 'warn' },
  ]

  return (
    <ul aria-label="Repository summary" className="grid grid-cols-2 gap-2 border-b border-line px-5 py-3 sm:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => (
        <li key={metric.label}>
          {metric.tone ? (
            // Issue cards open the diagnostics drawer, where the individual issues are listed.
            <button
              type="button"
              onClick={onOpenDiagnostics}
              title="Show in diagnostics"
              aria-label={`${metric.label}: ${metric.value}, ${metric.detail}. Show in diagnostics`}
              className={`${CARD} transition-colors hover:border-line-strong hover:bg-raised`}
            >
              <MetricBody metric={metric} />
            </button>
          ) : (
            <div className={CARD}>
              <MetricBody metric={metric} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function MetricBody({ metric }: { metric: Metric }) {
  const flagged = metric.tone !== undefined && metric.value > 0
  const valueColor = !flagged ? 'text-ink' : metric.tone === 'danger' ? 'text-danger' : 'text-warn'
  const iconColor = !flagged ? 'bg-hover text-faint' : metric.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-warn/10 text-warn'

  return (
    <>
      <span className="flex items-center justify-between">
        <span className="text-sm text-muted">{metric.label}</span>
        <span className={`grid size-6 place-items-center rounded-md ${iconColor}`} aria-hidden="true">
          {metric.icon}
        </span>
      </span>
      <span className="mt-1 flex items-baseline gap-2">
        <span className={`font-mono text-2xl leading-none font-semibold tabular-nums ${valueColor}`}>
          {metric.value.toLocaleString()}
        </span>
        <span className="truncate text-xs text-faint">{metric.detail}</span>
      </span>
    </>
  )
}
