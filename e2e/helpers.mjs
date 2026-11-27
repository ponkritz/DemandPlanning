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
export const fixture = (name) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url))

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
// scale: the device scale factor (2 for sharp screenshots); the default is the browser's (1).
// loadFromGit (GIT-29): the forced "Load latest Release Details" pop-up (GIT-36), which shows once per change of the shared Streams
// file, is answered whenever it is in the way (Playwright's locator handler); false leaves it to the scenario.
export async function openPage(app, { width = 1300, height = 1000, guide = false, roles, init, initArg, scale, loadFromGit = true } = {}) {
  const context = await app.browser.newContext({ viewport: { width, height }, acceptDownloads: true, ...(scale ? { deviceScaleFactor: scale } : {}) })
  const errors = []
  if (!guide) await context.addInitScript(() => { localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed') })
  if (roles) await context.addInitScript((text) => { localStorage.setItem('demand-planning-access-v1', text) }, cachedRoles(roles === true ? 'Tool Owner' : roles))
  if (init) await context.addInitScript(init, initArg)
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  if (loadFromGit) {
    const forced = page.getByRole('dialog', { name: 'Load latest Release Details' })
    await page.addLocatorHandler(forced, async () => { await forced.getByRole('button', { name: /^(Load latest Release Details|Retry)$/ }).click(); await forced.waitFor({ state: 'detached' }) })
  }
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
// SET-26: an Admin page and one of its sections (the row of sections is there only when the person sees more than one).
export const openSection = async (page, label, section) => { await navigate(page, label); const tab = page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: section, exact: true }); if (await tab.count()) await tab.click() }

export async function loadSample(page) {
  await page.getByRole('button', { name: 'Load synthetic sample' }).first().click()
  await page.locator('.notice', { hasText: 'synthetic sample dataset' }).first().waitFor()
}

export const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ').trim()

// CHT-25: the text of a panel's ⓘ (the one by its title), opened by pointing at it and closed with Escape.
export async function infoText(page, panel) {
  const button = panel.locator('h2 .info-button').first()
  await page.mouse.move(0, 0)
  await button.hover()
  const tip = page.getByRole('tooltip')
  await tip.waitFor()
  const value = await text(tip)
  await page.keyboard.press('Escape')
  await tip.waitFor({ state: 'detached' })
  return value
}
// OND-61, DSH-13: the items of a ⋯ menu ("More actions: {label}"), opened; the caller closes it with Escape.
export async function menuOf(page, label) {
  await page.getByRole('button', { name: `More actions: ${label}`, exact: true }).click()
  const menu = page.getByRole('menu', { name: label, exact: true })
  await menu.waitFor()
  return menu
}

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

// CAP-58, CAP-59: Admin → People & access → People — open a person's drawer by a click on their row (the name cell, not
// the tick box), and the text behind the source line's ⓘ (where the people come from, the team read).
export async function openPerson(page, name) {
  await page.locator(`.people-table tr[data-row-key="${name}"] td`).nth(1).click()
  const drawer = page.locator('aside.drawer[role="dialog"]', { has: page.getByRole('heading', { name, exact: true }) })
  await drawer.waitFor()
  return drawer
}
export async function peopleSource(page) {
  await page.mouse.move(0, 0)
  await page.getByRole('button', { name: 'Where the people come from' }).hover()
  const tip = page.getByRole('tooltip')
  await tip.waitFor()
  const value = await text(tip)
  await page.keyboard.press('Escape')
  await tip.waitFor({ state: 'detached' })
  return value
}
// A value of a MultiSelect filter ticked or unticked (the list opened, then closed with Escape).
export async function toggleFilter(page, label, option) {
  await page.getByRole('button', { name: new RegExp(`^${label}: `) }).click()
  const list = page.getByRole('listbox', { name: label, exact: true })
  await list.getByRole('checkbox', { name: option, exact: true }).click()
  await page.keyboard.press('Escape')
  await list.waitFor({ state: 'detached' })
}

// CHT-70: the chart and block pop-ups hold their fields in tabs (Data, Filters, Format, Elements, Narrative): open one
// before using its fields; it returns once that tab is the chosen one. Its name may carry a count, "Filters (2)".
export async function editorTab(dialog, name) {
  const tab = dialog.getByRole('tablist').getByRole('tab', { name: new RegExp(`^${name}\\b`) })
  await tab.click()
  await dialog.locator('[role="tab"][aria-selected="true"]', { hasText: name }).waitFor()
  return tab
}

// OND-124: the part of GitHub's Git Data API a page rename (and a delete of a page with more than one file) uses — one
// commit of many files: the branch's commit, a tree, a commit, the branch moved — for the scenarios that mock GitHub by
// hand with a map of files (path → text) and a list of writes ({ path, message, data } or { path, message, deleted }).
// Returns a handler that answers such a request (true) or leaves it (false). One branch; the commit's files are applied
// to the map when the branch is moved.
export function gitDataApi(files, writes, repo = '/repos/example/storage') {
  let head = '0'.repeat(40), counter = 0
  const trees = new Map(), commits = new Map()
  const sha = () => (++counter).toString(16).padStart(40, 'a')
  return (request, url, json) => {
    const path = url.pathname, method = request.method()
    if (!path.startsWith(`${repo}/git/`)) return false
    const rest = path.slice(repo.length)
    const body = request.postData() ? JSON.parse(request.postData()) : null
    if (/^\/git\/ref\/heads\//.test(rest) && method === 'GET') { json({ object: { sha: head } }); return true }
    if (/^\/git\/commits\/[0-9a-f]{40}$/.test(rest) && method === 'GET') { json({ tree: { sha: commits.get(rest.slice('/git/commits/'.length))?.tree ?? 'b'.repeat(40) } }); return true }
    if (rest === '/git/trees' && method === 'POST') { const made = sha(); trees.set(made, body.tree); json({ sha: made }); return true }
    if (rest === '/git/commits' && method === 'POST') { const made = sha(); commits.set(made, { tree: made, entries: trees.get(body.tree) ?? [], parent: body.parents[0], message: body.message }); json({ sha: made, html_url: `https://github.com/example/storage/commit/${made}` }); return true }
    if (/^\/git\/refs\/heads\//.test(rest) && method === 'PATCH') {
      const made = commits.get(body.sha)
      if (!made || made.parent !== head) { json({ message: 'Update is not a fast forward' }, 422); return true }
      head = body.sha
      for (const entry of made.entries) {
        if (entry.sha === null) { delete files[entry.path]; writes.push({ path: entry.path, message: made.message, deleted: true }); continue }
        files[entry.path] = entry.content
        let data = null
        try { data = JSON.parse(entry.content) } catch { /* not JSON */ }
        writes.push({ path: entry.path, message: made.message, data })
      }
      json({ object: { sha: head } }); return true
    }
    return false
  }
}
