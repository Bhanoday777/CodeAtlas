// Failure states, using request interception: the fixture backend never fails on
// its own, and the UI never offers a module ID the API does not know.

import { expect, test } from '@playwright/test'

import { detailsPanel, impactReport, jumpTo, openApp } from './helpers.ts'

test('backend unreachable: explains how to start it, and Retry recovers', async ({ page }) => {
  await page.route('**/api/graph', (route) => route.abort('connectionrefused'))
  await page.goto('/')
  const alert = page.getByRole('alert')
  await expect(alert).toContainText("Can't reach the CodeAtlas API")
  await expect(alert).toContainText('uvicorn app.main:app')

  await page.unroute('**/api/graph')
  await alert.getByRole('button', { name: 'Retry' }).click()
  await expect(page.getByRole('img', { name: /16 modules, 14 import edges/ })).toBeVisible()
})

test('a response that breaks the API contract is reported, not drawn as an empty graph', async ({ page }) => {
  await page.route('**/api/graph', (route) => route.fulfill({ json: { repository: 'x', nodes: 'not a list' } }))
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('The API sent the graph in an unexpected format')
  await expect(page.getByRole('img', { name: /Dependency graph/ })).toHaveCount(0)
})

test("a 404 from the module endpoint shows the API's message", async ({ page }) => {
  await openApp(page)
  await page.route('**/api/modules/**', (route) =>
    route.fulfill({ status: 404, json: { detail: "Unknown module: 'shop.services.pricing'" } }),
  )
  await jumpTo(page, 'pricing')
  const alert = detailsPanel(page).getByRole('alert')
  await expect(alert).toContainText('This module was not found')
  await expect(alert).toContainText("404: Unknown module: 'shop.services.pricing'")
})

test('an impact request that fails can be retried', async ({ page }) => {
  await openApp(page)
  await page.route('**/api/impact/**', (route) => route.abort('connectionrefused'))
  await jumpTo(page, 'pricing', { impact: true })
  const report = impactReport(page, 'shop.services.pricing')
  await expect(report.getByRole('alert')).toContainText("Can't reach the CodeAtlas API")

  await page.unroute('**/api/impact/**')
  await report.getByRole('button', { name: 'Retry' }).click()
  await expect(report.getByRole('definition')).toHaveText(['5', '2', '3'])
})
