import { describe, expect, it } from 'vitest'

import type { ImpactResponse } from '../types/api'
import { ESTIMATE_NOTE, exportFileName, impactToJson, impactToMarkdown } from './exportReport'

const snapshots = import.meta.glob<{ body: ImpactResponse }>('../../../contract/fixture/impact--*.json', { eager: true, import: 'default' })
const recorded = (id: string) => snapshots[`../../../contract/fixture/impact--${id}.json`].body

const CONTEXT = { repository: 'sample_python_project', exportedAt: '2026-10-16T12:00:00.000Z' }

describe('impactToMarkdown', () => {
  it('writes the real fixture report: counts, caveats, and every path, nearest first', () => {
    // Expected text written from contract/fixture/impact--shop.services.pricing.json.
    expect(impactToMarkdown(recorded('shop.services.pricing'), CONTEXT)).toBe(
      [
        '# Change impact: `shop.services.pricing`',
        '',
        'Repository: `sample_python_project` · Exported: 2026-10-16T12:00:00.000Z',
        '',
        'If `shop.services.pricing` changes, **5** modules may be affected: 2 direct, 3 transitive.',
        '',
        '## This list may be incomplete',
        '',
        '- 1 file(s) could not be parsed (shop/broken.py). Their imports are missing from the graph, so impact reports can miss modules that depend on a change through them.',
        '- 3 import(s) look local but match no module in the repository. They are not graph edges.',
        '',
        '## Affected modules',
        '',
        '| Distance | Module | Why: each step depends on the next |',
        '|---:|---|---|',
        '| 1 | `shop.lazy` | `shop.lazy` → `shop.services.pricing` |',
        '| 1 | `shop.services.orders` | `shop.services.orders` → `shop.services.pricing` |',
        '| 2 | `shop.main` | `shop.main` → `shop.services.orders` → `shop.services.pricing` |',
        '| 2 | `shop.services` | `shop.services` → `shop.services.orders` → `shop.services.pricing` |',
        '| 3 | `manage` | `manage` → `shop.main` → `shop.services.orders` → `shop.services.pricing` |',
        '',
        `_${ESTIMATE_NOTE}_`,
        '',
      ].join('\n'),
    )
  })

  it('says explicitly when nothing is affected, and keeps the caveats', () => {
    const markdown = impactToMarkdown(recorded('manage'), CONTEXT)
    expect(markdown).toContain('No other local module depends on `manage`, directly or through other modules.')
    expect(markdown).not.toContain('## Affected modules')
    expect(markdown).toContain('## This list may be incomplete')
  })

  it('leaves out the caveats section when the API reports none', () => {
    const report: ImpactResponse = { ...recorded('shop.cycle_a'), diagnostics: [] }
    expect(impactToMarkdown(report, CONTEXT)).not.toContain('may be incomplete')
  })

  it('uses the singular for one affected module', () => {
    expect(impactToMarkdown(recorded('shop.cycle_a'), CONTEXT)).toContain('**1** module may be affected: 1 direct, 0 transitive.')
  })

  it('escapes table-breaking characters in cells', () => {
    const report: ImpactResponse = {
      changed_module: 'b',
      affected: [{ id: 'a|x', distance: 1, path: ['a|x', 'b'] }],
      direct: ['a|x'],
      transitive: [],
      diagnostics: [],
    }
    expect(impactToMarkdown(report, CONTEXT)).toContain('| 1 | `a\\|x` | `a\\|x` → `b` |')
  })

  it.each(Object.keys(snapshots))('lists every affected module of %s exactly once', (path) => {
    const report = snapshots[path].body
    const rows = impactToMarkdown(report, CONTEXT)
      .split('\n')
      .filter((line) => /^\| \d+ \|/.test(line))
    expect(rows.map((line) => line.split(' | ')[1])).toEqual(report.affected.map((m) => `\`${m.id}\``))
  })
})

describe('impactToJson', () => {
  it('keeps the API response unchanged under `report`, with the export context', () => {
    const report = recorded('shop.models')
    const parsed = JSON.parse(impactToJson(report, CONTEXT))
    expect(parsed).toEqual({ repository: 'sample_python_project', exported_at: '2026-10-16T12:00:00.000Z', note: ESTIMATE_NOTE, report })
  })
})

describe('exportFileName', () => {
  it('names the file after the changed module', () => {
    expect(exportFileName(recorded('shop.models'), 'md')).toBe('impact-shop.models.md')
    expect(exportFileName(recorded('shop.models'), 'json')).toBe('impact-shop.models.json')
  })
})
