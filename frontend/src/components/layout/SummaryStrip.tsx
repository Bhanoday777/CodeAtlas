import type { GraphSummary } from '../../types/api'

interface Metric {
  label: string
  value: number
  hint: string
  tone?: 'warn' | 'danger'
}

/** The six counts from GraphResponse.summary, shown as reported by the backend. */
export function SummaryStrip({ summary }: { summary: GraphSummary }) {
  const metrics: Metric[] = [
    { label: 'Modules', value: summary.modules, hint: 'Python modules discovered in the repository' },
    { label: 'Import edges', value: summary.edges, hint: 'Local module-to-module imports (graph edges)' },
    { label: 'External imports', value: summary.external_imports, hint: 'Standard library and third-party imports; not graph nodes' },
    { label: 'Unresolved', value: summary.unresolved_imports, hint: 'Imports that look local but match no module', tone: 'warn' },
    { label: 'Scan errors', value: summary.scan_errors, hint: 'Files that could not be parsed', tone: 'danger' },
    { label: 'Warnings', value: summary.warnings, hint: 'Self-imports: kept as local imports, not graph edges', tone: 'warn' },
  ]

  return (
    <dl className="grid grid-cols-3 border-b border-line sm:grid-cols-6">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          title={metric.hint}
          className="border-line px-5 py-2.5 not-last:border-r max-sm:border-b max-sm:[&:nth-child(3n)]:border-r-0"
        >
          <dt className="truncate text-[11px] text-faint">{metric.label}</dt>
          <dd
            className={`font-mono text-[17px] font-medium tabular-nums ${
              metric.value > 0 && metric.tone === 'danger'
                ? 'text-danger'
                : metric.value > 0 && metric.tone === 'warn'
                  ? 'text-warn'
                  : 'text-ink'
            }`}
          >
            {metric.value.toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  )
}
