// Graph canvas interactions. Nodes are drawn on a canvas with no DOM elements, so a
// node is found by moving the mouse across the graph until its hover card appears.

import { expect, test, type Page } from '@playwright/test'

import { openApp } from './helpers.ts'

const hoverCard = (page: Page) => page.getByText(/^→ imports \d+$/)

/** Move the mouse over the graph in a grid until it is over a module node. */
async function hoverAnyNode(page: Page) {
  const box = await page.getByRole('img', { name: /Dependency graph of/ }).boundingBox()
  if (!box) throw new Error('graph container has no size')
  for (let y = box.y + 40; y < box.y + box.height - 40; y += 12) {
    for (let x = box.x + 40; x < box.x + box.width - 80; x += 12) {
      await page.mouse.move(x, y)
      if (await hoverCard(page).isVisible()) return
    }
  }
  throw new Error('no module node found under the mouse')
}

test.beforeEach(async ({ page }) => {
  await openApp(page)
})

test('the hover card closes when the mouse leaves the graph for the controls', async ({ page }) => {
  await hoverAnyNode(page)
  await page.getByRole('button', { name: 'Reset layout and selection' }).click()
  await expect(hoverCard(page)).toBeHidden()
})
