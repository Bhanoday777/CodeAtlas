// Change-impact workflows on the fixture repository. Expected reports were checked
// against the running API and `python -m app.graph` (and match contract/fixture/impact--*.json).

import { expect, test } from '@playwright/test'

import { detailsPanel, distanceRows, expectGroups, impactReport, jumpTo, openApp } from './helpers.ts'

const PRICING = 'shop.services.pricing'

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('analyze impact from the details panel: counts, caveats and groups', async ({ page }) => {
  await jumpTo(page, 'pricing')
  await detailsPanel(page).getByRole('button', { name: 'Analyze impact' }).click()

  const report = impactReport(page, PRICING)
  await expect(report).toBeVisible()
  await expect(detailsPanel(page)).toBeHidden() // the report replaces the details panel
  await expect(report.getByRole('definition')).toHaveText(['5', '2', '3']) // affected, direct, transitive

  const caveats = report.getByRole('note')
  await expect(caveats).toContainText('This list may be incomplete')
  await expect(caveats.getByRole('listitem')).toHaveCount(2)
  await expect(caveats).toContainText('shop/broken.py')

  await expectGroups(page, PRICING, [['shop.lazy', 'shop.services.orders'], ['shop.main', 'shop.services'], ['manage']])
  await expect(page.getByText(/Impact of pricing · 5 affected/)).toBeVisible()
})

test('explains why a module is affected, from the report and from the module list', async ({ page }) => {
  await jumpTo(page, 'pricing', { impact: true })
  const report = impactReport(page, PRICING)

  const manage = distanceRows(page, PRICING, 3).first()
  await manage.click()
  await expect(manage).toHaveAttribute('aria-expanded', 'true')
  const path = report.getByRole('list', { name: 'Explanation path' })
  await expect(path.getByRole('listitem')).toHaveText([
    'manage',
    'importsshop.main',
    'importsshop.services.orders',
    'importsshop.services.pricing',
  ])

  // An intermediate step focuses that module's own path.
  await path.getByRole('button', { name: 'shop.main' }).click()
  await expect(distanceRows(page, PRICING, 2).first()).toHaveAttribute('aria-expanded', 'true')
  await expect(report.getByRole('list', { name: 'Explanation path' }).getByRole('listitem')).toHaveCount(3)

  // In impact mode the module list focuses paths too; an unaffected module clears the focus.
  const modules = page.getByRole('region', { name: 'Modules' })
  await modules.getByRole('button', { name: /^lazy/ }).click()
  await expect(distanceRows(page, PRICING, 1).first()).toHaveAttribute('aria-expanded', 'true')
  await modules.getByRole('button', { name: /^dupes/ }).click()
  await expect(report.getByRole('list', { name: 'Explanation path' })).toHaveCount(0)
})

test('Esc leaves impact mode and returns to the module details', async ({ page }) => {
  await jumpTo(page, 'pricing', { impact: true })
  await expect(impactReport(page, PRICING)).toBeVisible()

  // Esc inside the palette closes only the palette.
  await page.keyboard.press('Control+k')
  await page.keyboard.press('Escape')
  await expect(impactReport(page, PRICING)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(impactReport(page, PRICING)).toBeHidden()
  await expect(detailsPanel(page).getByRole('heading', { level: 2 })).toHaveText('pricing')
})

test('Shift+Enter in the palette analyzes impact directly', async ({ page }) => {
  await jumpTo(page, 'order', { impact: true })
  const report = impactReport(page, 'shop.models.order')
  await expect(report.getByRole('definition')).toHaveText(['6', '2', '4'])
  await expectGroups(page, 'shop.models.order', [
    ['shop.services.orders', 'shop.services.pricing'],
    ['shop.lazy', 'shop.main', 'shop.services'],
    ['manage'],
  ])

  await report.getByRole('button', { name: /Exit/ }).click()
  await expect(report).toBeHidden()
})

test('a module nothing imports has an explicit empty result', async ({ page }) => {
  await jumpTo(page, 'manage', { impact: true })
  const report = impactReport(page, 'manage')
  await expect(report.getByRole('definition')).toHaveText(['0', '0', '0'])
  await expect(report.getByText('No other module is affected')).toBeVisible()
})

test('the caveat links to the diagnostics drawer', async ({ page }) => {
  await jumpTo(page, 'pricing', { impact: true })
  await impactReport(page, PRICING).getByRole('button', { name: 'View scan diagnostics' }).click()
  const drawer = page.getByRole('complementary', { name: 'Scan diagnostics' })
  await expect(drawer).toBeVisible()
  // Esc closes the drawer first; impact mode stays on.
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(impactReport(page, PRICING)).toBeVisible()
})
