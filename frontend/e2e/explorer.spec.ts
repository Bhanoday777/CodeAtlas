// Graph explorer workflows on the fixture repository. Expected values were checked
// against the running API (and match contract/fixture/*.json).
//
// The graph itself is a canvas: these tests reach modules through the list, the
// palette and the panels. Clicking graph nodes is a manual check (docs/ui.md, Testing the canvas).

import { expect, test } from '@playwright/test'

import { detailsPanel, jumpTo, openApp } from './helpers.ts'

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('shows the repository summary from the API', async ({ page }) => {
  const summary = page.getByRole('list', { name: 'Repository summary' })
  // Counts are plain cards; issue counts are buttons that open the diagnostics drawer.
  // Each card reads: label, count, detail.
  await expect(summary.getByRole('listitem')).toHaveText([
    'Modules164 packages',
    'Import edges34imports + parent packages',
    'External imports6stdlib + third-party',
    'Unresolved3look local, no match',
    'Scan errors1files not parsed',
    'Warnings0self-imports',
  ])
  await expect(summary.getByRole('button', { name: /^Unresolved: 3,/ })).toBeVisible()
  await expect(summary.getByRole('button', { name: /^Scan errors: 1,/ })).toBeVisible()
  await expect(summary.getByRole('button', { name: /^Warnings: 0,/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /16 modules, 34 import edges/ })).toBeVisible()
  await expect(detailsPanel(page).getByText('No module selected')).toBeVisible()
})

test('filters the module list and shows the chosen module’s details', async ({ page }) => {
  const modules = page.getByRole('region', { name: 'Modules' })
  await modules.getByPlaceholder('Filter modules or paths').fill('  PRICING ')
  await modules.getByRole('button', { name: /^pricing/ }).click()

  const details = detailsPanel(page)
  await expect(details.getByRole('heading', { level: 2 })).toHaveText('pricing')
  await expect(details.getByText('shop/services/pricing.py')).toBeVisible()
  await expect(details.getByTitle('Select shop.models.order')).toBeVisible()
  await expect(details.getByTitle('Select shop.utils.helpers')).toBeVisible()
  await expect(details.getByTitle('Select shop.lazy')).toBeVisible()
  await expect(details.getByTitle('Select shop.services.orders')).toBeVisible()
  await expect(details.getByText('from decimal import Decimal')).toBeVisible()
})

test('Ctrl+K jumps to a module and module links navigate', async ({ page }) => {
  await jumpTo(page, 'order')
  const details = detailsPanel(page)
  // "order" ranks the exact name shop.models.order above shop.services.orders.
  await expect(details.getByText('shop.models.order', { exact: true })).toBeVisible()

  await details.getByTitle('Select shop.utils.helpers').click()
  await expect(details.getByRole('heading', { level: 2 })).toHaveText('helpers')
  await expect(page.getByRole('region', { name: 'Modules' }).getByRole('button', { name: /^helpers/ })).toHaveAttribute('aria-current', 'true')
})

test('flags the file that could not be parsed and lists unresolved imports', async ({ page }) => {
  await jumpTo(page, 'broken')
  await expect(detailsPanel(page).getByText('This file could not be parsed')).toBeVisible()

  await jumpTo(page, 'legacy')
  const details = detailsPanel(page)
  await expect(details.getByText('import shop.missing_module')).toBeVisible()
  await expect(details.getByText('from .gone import thing')).toBeVisible()
})

test('the diagnostics drawer lists the scan error and unresolved imports', async ({ page }) => {
  await page.getByRole('button', { name: /^Scan errors: 1,/ }).click()
  const drawer = page.getByRole('complementary', { name: 'Scan diagnostics' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('shop/broken.py').first()).toBeVisible()
  await expect(drawer.getByText('import shop.missing_module')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
})
