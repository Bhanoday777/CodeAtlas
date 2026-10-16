import type { ImpactResponse } from '../types/api'
import { groupByDistance } from './impact'

/** What the report is about and when it was saved; passed in so output is reproducible. */
export interface ExportContext {
  repository: string
  /** ISO 8601 timestamp, e.g. new Date().toISOString(). */
  exportedAt: string
}

export const ESTIMATE_NOTE =
  'Static analysis of import statements: an estimate of which modules may be affected, not a guarantee of runtime behavior.'

export function exportFileName(report: ImpactResponse, format: 'md' | 'json'): string {
  return `impact-${report.changed_module}.${format}`
}

/** Pipes and line breaks would end a Markdown table cell early. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

/**
 * The impact report as Markdown, for a pull request or an issue: counts, the API's
 * caveats, and every affected module with its explanation path. Built only from the
 * API response; nothing is recomputed.
 */
export function impactToMarkdown(report: ImpactResponse, { repository, exportedAt }: ExportContext): string {
  const changed = report.changed_module
  const lines = [
    `# Change impact: \`${changed}\``,
    '',
    `Repository: \`${repository}\` · Exported: ${exportedAt}`,
    '',
  ]

  if (report.affected.length === 0) {
    lines.push(`No other local module depends on \`${changed}\`, directly or through other modules.`)
  } else {
    lines.push(
      `If \`${changed}\` changes, **${report.affected.length}** module${report.affected.length === 1 ? '' : 's'} may be affected: ` +
        `${report.direct.length} direct, ${report.transitive.length} transitive.`,
    )
  }

  if (report.diagnostics.length > 0) {
    lines.push('', '## This list may be incomplete', '')
    for (const diagnostic of report.diagnostics) lines.push(`- ${diagnostic.message}`)
  }

  if (report.affected.length > 0) {
    lines.push('', '## Affected modules', '', '| Distance | Module | Why: each step depends on the next |', '|---:|---|---|')
    for (const group of groupByDistance(report)) {
      for (const module of group.modules) {
        const path = module.path.map((id) => `\`${id}\``).join(' → ')
        lines.push(`| ${group.distance} | \`${cell(module.id)}\` | ${cell(path)} |`)
      }
    }
  }

  lines.push('', `_${ESTIMATE_NOTE}_`, '')
  return lines.join('\n')
}

/** The API response unchanged under `report`, with where and when it was exported. */
export function impactToJson(report: ImpactResponse, { repository, exportedAt }: ExportContext): string {
  return `${JSON.stringify({ repository, exported_at: exportedAt, note: ESTIMATE_NOTE, report }, null, 2)}\n`
}

/** Save text as a file through the browser's download. */
export function downloadFile(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  // Revoked on the next tick: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
