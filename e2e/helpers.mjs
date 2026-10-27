// Shared set-up for the end-to-end suite (e2e/*.e2e.mjs): serves the built web app (dist/) with `vite preview` on a
// free port, opens a Chromium page with Playwright, collects page errors, and offers the actions the scenarios share.
// The suite runs against the build under test, exactly as the browser would, with no Azure DevOps, GitHub or network:
// data comes from the synthetic sample (SMP-01) or from fixtures in e2e/fixtures.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = new URL('../', import.meta.url)
export const fixture = (name) => new URL(`fixtures/${name}`, import.meta.url).pathname

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer()
  server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)) })
  server.on('error', reject)
})

export async function startApp() {
  if (!existsSync(new URL('dist/index.html', root))) throw new Error('dist/index.html is missing: run `pnpm build:web` before `pnpm test:e2e`.')
  const port = await freePort()
  // vite is started directly with this Node (no npx wrapper), so that killing the process ends the server.
  const vite = fileURLToPath(new URL('node_modules/vite/bin/vite.js', root))
  const server = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  const url = `http://127.0.0.1:${port}/`
  const started = Date.now()
  for (;;) {
    try { const response = await fetch(url); if (response.ok) break } catch { /* not up yet */ }
    if (Date.now() - started > 30000) { server.kill(); throw new Error('vite preview did not start within 30 s') }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  const browser = await chromium.launch()
  const stop = async () => { await browser.close(); server.kill() }
  return { url, browser, stop }
}

// A fresh browser context (clean storage) with the Get started pop-up dismissed unless asked for, and page errors recorded.
export async function openPage(app, { width = 1300, height = 1000, guide = false, init } = {}) {
  const context = await app.browser.newContext({ viewport: { width, height }, acceptDownloads: true })
  const errors = []
  if (!guide) await context.addInitScript(() => { localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed') })
  if (init) await context.addInitScript(init)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}

export const navigate = async (page, label) => { await page.locator('.sidebar nav button', { hasText: label }).first().click(); await page.locator('header.topbar h1').waitFor() }

export async function loadSample(page) {
  await page.getByRole('button', { name: 'Load synthetic sample' }).first().click()
  await page.locator('.notice', { hasText: 'synthetic sample dataset' }).first().waitFor()
}

export const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim()
