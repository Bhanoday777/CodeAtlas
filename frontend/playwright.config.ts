// End-to-end tests: the real backend (uvicorn, scanning the fixture repository)
// and the Vite dev server, driven in a real browser. Run with `npm run test:e2e`.
//
// Browser: the locally installed Google Chrome by default (no download).
// For CI, set CODEATLAS_E2E_BROWSER=chromium and run `npx playwright install chromium`
// first to use Playwright's own Chromium build instead.
//
// Servers already running on :8000 / :5173 are reused locally (not on CI); the
// global setup refuses to run if that backend is serving a different repository.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, devices } from '@playwright/test'

const here = path.dirname(fileURLToPath(import.meta.url))
const backend = path.resolve(here, '../backend')
const python =
  process.env.CODEATLAS_PYTHON ??
  path.join(backend, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const useBundledChromium = process.env.CODEATLAS_E2E_BROWSER === 'chromium'
const reuse = !process.env.CI

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: useBundledChromium ? 'chromium' : 'chrome',
      use: { ...devices['Desktop Chrome'], ...(useBundledChromium ? {} : { channel: 'chrome' }), viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      // Always the fixture, even if the developer's shell sets CODEATLAS_REPO to another repository.
      command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: backend,
      url: 'http://127.0.0.1:8000/api/health',
      env: { CODEATLAS_REPO: path.resolve(here, '../fixtures/sample_python_project') },
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      cwd: here,
      url: 'http://localhost:5173',
      reuseExistingServer: reuse,
      timeout: 60_000,
    },
  ],
})
