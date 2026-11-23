// Shared set-up for the end-to-end suite (e2e/*.e2e.mjs): serves the built web app (dist/) with `vite preview` on a
// free port, opens a Chromium page with Playwright, collects page errors, and offers the actions the scenarios share.
// The suite runs against the build under test, exactly as the browser would, with no Azure DevOps, GitHub or network:
// data comes from the synthetic sample (SMP-01) or from fixtures in e2e/fixtures.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

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

// CON-101: the app is read-only until a roles file is loaded. A scenario that changes something opens with one cached in
// this browser (as after an earlier read from Git), the starting matrix with everyone else in `role` (Tool Owner: every
// right, no Testing pages, as the app had before without a file).
export const cachedRoles = (role = 'Tool Owner') => { const policy = defaultPolicy(); policy.defaultRole = role; return serializeAccess(policy) }
// The same roles as access.json in a mocked GitHub contents answer (a read that finds no file would drop the cached copy).
export const rolesFile = (role = 'Tool Owner') => ({ type: 'file', encoding: 'base64', content: Buffer.from(cachedRoles(role)).toString('base64'), sha: 'roles' })

// A fresh browser context (clean storage) with the Get started pop-up dismissed unless asked for, and page errors recorded.
// roles: a role name (or true for Tool Owner) caches a roles file first (cachedRoles); a scenario's own init runs after.
export async function openPage(app, { width = 1300, height = 1000, guide = false, roles, init, initArg } = {}) {
  const context = await app.browser.newContext({ viewport: { width, height }, acceptDownloads: true })
  const errors = []
  if (!guide) await context.addInitScript(() => { localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed') })
  if (roles) await context.addInitScript((text) => { localStorage.setItem('demand-planning-access-v1', text) }, cachedRoles(roles === true ? 'Tool Owner' : roles))
  if (init) await context.addInitScript(init, initArg)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  // CI-12: E2E_CPU_SLOWDOWN=4 runs the page on a CPU four times slower (Chromium's own throttling), as on a busy
  // laptop, so a step that only works because the app happens to be fast (a race) fails here rather than for a user.
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors }
}

// Pages load on demand: wait for the page's code too (the "Loading the page…" placeholder gone).
export const navigate = async (page, label) => { await page.locator('.sidebar nav button', { hasText: label }).first().click(); await page.locator('header.topbar h1').waitFor(); await page.locator('.page-loading').waitFor({ state: 'detached' }) }

export async function loadSample(page) {
  await page.getByRole('button', { name: 'Load synthetic sample' }).first().click()
  await page.locator('.notice', { hasText: 'synthetic sample dataset' }).first().waitFor()
}

export const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim()

// Reload a page that has the synthetic sample loaded. The sample is saved to IndexedDB in the background; a reload
// that beats that save (slow CI runners) starts without it, so it is loaded again. Settings kept in localStorage stay.
export async function reloadWithSample(page) {
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  const kept = await page.locator('.notice', { hasText: 'synthetic sample dataset' }).first().waitFor({ timeout: 5000 }).then(() => true, () => false)
  if (!kept) await loadSample(page)
}

// NAV-48: an item of the profile menu (top right).
export async function profileItem(page, name) {
  await page.locator('header.topbar').getByRole('button', { name: /^Profile/ }).click()
  await page.getByRole('menu', { name: 'Profile' }).getByRole('menuitem', { name }).click()
}
