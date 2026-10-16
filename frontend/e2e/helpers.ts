import { expect, type Page } from '@playwright/test'

/** Open the app and wait until the fixture graph has loaded. */
export async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('img', { name: /Dependency graph of sample_python_project/ })).toBeVisible()
}

/** Jump to a module with Ctrl+K. `impact` uses Shift+Enter (analyze impact) instead of Enter. */
export async function jumpTo(page: Page, query: string, { impact = false } = {}) {
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Jump to module' })
  await expect(palette).toBeVisible()
  await palette.getByRole('combobox').fill(query)
  await palette.getByRole('combobox').press(impact ? 'Shift+Enter' : 'Enter')
  await expect(palette).toBeHidden()
}

export const detailsPanel = (page: Page) => page.getByRole('region', { name: 'Module details' })

export const impactReport = (page: Page, changed: string) => page.getByRole('region', { name: `Change impact of ${changed}` })

/** The module rows (in display order) under the report's "Distance N" heading. */
export function distanceRows(page: Page, changed: string, distance: number) {
  const heading = impactReport(page, changed).getByRole('heading', { level: 3, name: new RegExp(`^Distance ${distance}\\b`) })
  return heading.locator('xpath=..').locator('button[aria-expanded]')
}

/** Expect the report's distance groups to list exactly these module IDs, in this order. */
export async function expectGroups(page: Page, changed: string, groups: string[][]) {
  const report = impactReport(page, changed)
  await expect(report.getByRole('heading', { level: 3, name: /^Distance \d+/ })).toHaveCount(groups.length)
  for (const [index, ids] of groups.entries()) {
    const rows = distanceRows(page, changed, index + 1)
    // Each row reads: short name, full ID, expand marker.
    await expect(rows).toHaveText(ids.map((id) => `${id.split('.').pop()}${id}▸`))
  }
}
