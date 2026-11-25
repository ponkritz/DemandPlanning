// User guide screenshots and how-to clips (DOC-16): drives the built web app (dist/, served by `vite preview` as the
// end-to-end suite does) with Playwright and writes docs/user-guide/images/*.png and docs/user-guide/media/*.webm (+ a
// poster .png per clip). Only synthetic data is used: the app's synthetic sample (SMP-01) and made-up On-Demand pages,
// dashboards, people and Windchill rows served by a fake GitHub (e2e/fakeGitHub.mjs); Azure DevOps is refused. Before
// every capture the visible text, field values and placeholders are checked: a real host, organisation, repository, a token or an
// email outside example.com stops the run. The few preset server names the app ships with are replaced on screen by
// made-up ones (scrub) before that check.
//
//   pnpm build:web && pnpm docs:shots          screenshots (light 1440×900, a few dark and phone ones)
//   pnpm build:web && pnpm docs:videos         the clips (1280×720 WebM; trimmed and compressed with ffmpeg when found)
//   node scripts/user-guide-shots.mjs --only home,people    some of them (names as below, without .png)
//
// A recording script, not a test: each step waits for what it needs; the clips add short pauses only so that a viewer
// can see a result.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { editorTab, startApp } from '../e2e/helpers.mjs'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'
import { defaultPolicy, serializeAccess } from '../src/access.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const imagesDir = join(root, 'docs/user-guide/images'), mediaDir = join(root, 'docs/user-guide/media')
const args = process.argv.slice(2)
const videos = args.includes('--videos')
const only = (args[args.indexOf('--only') + 1] ?? '').split(',').filter((name) => args.includes('--only') && name)
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0

// ── Synthetic data ──────────────────────────────────────────────────────────────────────────────────────────────────
const year = new Date().getUTCFullYear()
const owner = 'ana.costa@example.com'
const people = { 'ana.costa@example.com': 'Ana Costa', 'ben.okafor@example.com': 'Ben Okafor', 'chen.wei@example.com': 'Chen Wei', 'diya.sharma@example.com': 'Diya Sharma' }
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint', 'Supplier defect'], required: true, description: 'What kind of non-quality cost this is.' },
  { id: 'c2', name: 'Department', type: 'dropdown', options: ['Assembly', 'Testing', 'Packaging', 'Logistics'], required: true },
  { id: 'c3', name: 'Sites', type: 'multi', options: ['Northfield', 'Lakeside', 'Hillcrest'], required: false },
  { id: 'c4', name: 'Cost', type: 'currency', currency: 'EUR', options: [], required: true, description: 'Total cost, labour and material, in the currency it was booked in.' },
  { id: 'c5', name: 'Found on', type: 'date', options: [], required: true },
  { id: 'c6', name: 'Status', type: 'dropdown', options: ['Open', 'Closed'], required: false },
  { id: 'c7', name: 'Description', type: 'longtext', options: [], required: false },
]
const rowData = [
  ['Scrap', 'Assembly', ['Northfield'], 1200, '01-14', 'Closed', 'Wrong label printed on a carton batch.'],
  ['Rework', 'Testing', ['Lakeside'], 450, '01-28', 'Closed', 'Re-test after a calibration drift.'],
  ['Complaint', 'Packaging', ['Hillcrest'], 300, '02-09', 'Closed', 'Dented outer box reported by a customer.'],
  ['Supplier defect', 'Logistics', ['Northfield', 'Lakeside'], 2100, '02-21', 'Closed', 'Cable sets with a loose connector.'],
  ['Scrap', 'Assembly', ['Lakeside'], 800, '03-05', 'Closed', 'Housing scratched during assembly.'],
  ['Rework', 'Assembly', ['Northfield'], 650, '03-19', 'Closed', 'Screws torqued below the limit.'],
  ['Complaint', 'Testing', ['Hillcrest'], 220, '04-02', 'Closed', 'Test report missing a signature.'],
  ['Scrap', 'Packaging', ['Northfield'], 380, '04-23', 'Closed', 'Pallet dropped in the warehouse.'],
  ['Supplier defect', 'Assembly', ['Lakeside'], 1750, '05-07', 'Closed', 'Batch of displays with dead pixels.'],
  ['Rework', 'Testing', ['Lakeside', 'Hillcrest'], 520, '05-26', 'Closed', 'Firmware re-flashed on 40 units.'],
  ['Scrap', 'Assembly', ['Hillcrest'], 960, '06-11', 'Closed', 'Glue cured too fast; parts discarded.'],
  ['Complaint', 'Logistics', ['Northfield'], 410, '06-30', 'Closed', 'Late delivery penalty.'],
  ['Rework', 'Packaging', ['Northfield'], 270, '07-08', 'Closed', 'Leaflets in the wrong language.'],
  ['Supplier defect', 'Testing', ['Hillcrest'], 1300, '07-22', 'Open', 'Sensors out of tolerance at incoming inspection.'],
  ['Scrap', 'Assembly', ['Lakeside'], 700, '08-13', 'Closed', 'Wrong colour variant assembled.'],
  ['Rework', 'Assembly', ['Northfield', 'Hillcrest'], 880, '08-27', 'Open', 'Rework of a solder joint on the main board.'],
  ['Complaint', 'Packaging', ['Lakeside'], 190, '09-04', 'Closed', 'Missing quick-start card.'],
  ['Scrap', 'Logistics', ['Northfield'], 560, '09-18', 'Open', 'Units damaged in transit.'],
  ['Supplier defect', 'Assembly', ['Northfield'], 2400, '10-02', 'Open', 'Power supplies failing burn-in.'],
  ['Rework', 'Testing', ['Lakeside'], 610, '10-16', 'Open', 'Repeat of the safety test after a tester update.'],
  ['Scrap', 'Packaging', ['Hillcrest'], 340, '10-29', 'Open', 'Shrink wrap too tight; cartons crushed.'],
  ['Complaint', 'Assembly', ['Northfield'], 720, '11-05', 'Open', 'Customer found a loose screw.'],
  ['Rework', 'Logistics', ['Lakeside'], 300, '11-12', 'Open', 'Relabelling for a new distributor.'],
  ['Scrap', 'Testing', ['Hillcrest'], 450, '11-19', 'Open', 'Test fixture damaged two units.'],
]
const emails = Object.keys(people)
const conqRows = rowData.map(([c1, c2, c3, cost, day, c6, c7], index) => {
  const addedAt = `${year}-${day}T09:${String(10 + index).padStart(2, '0')}:00.000Z`, by = emails[index % emails.length]
  return { id: `r${index + 1}`, key: `CONQ-${String(year).slice(2)}${day.replace('-', '')}-${'K7Q2M4P9A3B6C8D5E2F7G4H9'.slice(index % 20, index % 20 + 4)}`, seq: index + 1, addedBy: by, addedAt,
    log: [{ id: `l${index + 1}`, at: addedAt, by, added: true, changes: [] }], cells: { c1, c2, c3, c4: `${cost} EUR`, c5: `${year}-${day}`, c6, c7 } }
})
const insights = [
  { id: 'k1', title: 'Issues', type: 'kpi', category: '', second: '', measure: 'count', value: '', filters: [], sort: 'value' },
  { id: 'k2', title: 'Total cost', type: 'kpi', category: '', second: '', measure: 'sum', value: 'c4', filters: [], sort: 'value' },
  { id: 'k3', title: 'Open issues', type: 'kpi', category: '', second: '', measure: 'count', value: '', filters: [{ column: 'c6', values: ['Open'] }], sort: 'value' },
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', second: '', measure: 'sum', value: 'c4', filters: [], sort: 'value' },
  { id: 'i2', title: 'Issues by department', type: 'pie', category: 'c2', second: '', measure: 'count', value: '', filters: [], sort: 'value' },
  { id: 'i3', title: 'Cost per month', type: 'line', category: 'c5', second: '', measure: 'sum', value: 'c4', filters: [], sort: 'label', options: { size: 'full' } },
  { id: 'i4', title: 'Issues by department and status', type: 'table', category: 'c2', second: 'c6', measure: 'count', value: '', filters: [], sort: 'value' },
]
const page = (id, name, description, prefix, cols, rows, extra = {}) => ({ schema: 1, kind: 'on-demand-page', id, name, description, keyPrefix: prefix, columns: cols, rows, insights: [], ...extra })
const conq = (more = {}) => page('conq', 'CoNQ', 'Cost of Non-Quality', 'CONQ', columns, conqRows, { insights, insightFilters: { period: 'c5', fields: ['c2', 'c1'] }, ...more })
const supplierColumns = [{ id: 'd1', name: 'Supplier', type: 'dropdown', options: ['Acme Parts', 'Bolt & Co', 'Cirrus Components'], required: true }, { id: 'd2', name: 'Opened', type: 'date', options: [], required: true }, { id: 'd3', name: 'Severity', type: 'dropdown', options: ['Low', 'Medium', 'High'], required: false }]
const supplier = page('supplier-issues', 'Supplier issues', 'Issues raised with suppliers', 'SUP', supplierColumns,
  [['Acme Parts', '02-03', 'Low'], ['Bolt & Co', '03-14', 'High'], ['Acme Parts', '05-20', 'Medium'], ['Cirrus Components', '07-01', 'Medium'], ['Bolt & Co', '08-09', 'Low'], ['Acme Parts', '09-15', 'High'], ['Cirrus Components', '10-21', 'Low']]
    .map(([d1, day, d3], index) => ({ id: `s${index + 1}`, key: `SUP-${String(year).slice(2)}${day.replace('-', '')}-AB${index}C`, seq: index + 1, addedBy: emails[index % 4], addedAt: `${year}-${day}T08:00:00.000Z`, cells: { d1, d2: `${year}-${day}`, d3 } })))
const block = (id, title, source, type, period, extra = {}) => ({ id, title, type, source, category: '', second: '', measure: 'count', value: '', filters: [], sort: 'value', period, tab: '', ...extra })
const board = { schema: 1, kind: 'dashboard', id: 'quality-board', tabs: [{ id: 't1', name: 'Cost' }, { id: 't2', name: 'Suppliers' }],
  filters: [{ id: 'f1', source: 'page:conq', column: 'c2' }, { id: 'f2', source: 'page:supplier-issues', column: 'd1' }],
  blocks: [block('b1', 'CoNQ issues', 'page:conq', 'kpi', 'c5', { tab: 't1' }), block('b2', 'CoNQ cost', 'page:conq', 'kpi', 'c5', { measure: 'sum', value: 'c4', tab: 't1' }), block('b5', 'Supplier issues', 'page:supplier-issues', 'kpi', 'd2', { tab: 't2' }),
    block('b3', 'Cost by category', 'page:conq', 'bar', 'c5', { category: 'c1', measure: 'sum', value: 'c4', tab: 't1' }), block('b6', 'Cost by department', 'page:conq', 'pie', 'c5', { category: 'c2', measure: 'sum', value: 'c4', tab: 't1' }),
    block('b4', 'Issues by supplier', 'page:supplier-issues', 'bar', 'd2', { category: 'd1', second: 'd3', tab: 't2' })] }
const policy = () => { const value = defaultPolicy(); value.defaultRole = 'Team Member'; value.members = { [owner]: ['Tool Owner'], 'ben.okafor@example.com': ['Admin'], 'chen.wei@example.com': ['Team Member'], 'diya.sharma@example.com': ['Scrum Master'], 'emil.novak@example.com': ['People Manager'], 'fatima.zahra@example.com': ['Product Owner'] }; return serializeAccess(value) }
const files = (pages = {}) => ({
  'access.json': policy(),
  'on-demand/conq.json': JSON.stringify(conq(pages.conq)), 'on-demand/supplier-issues.json': JSON.stringify(supplier), 'dashboards/quality-board.json': JSON.stringify(board),
  'on-demand/quality-board.json': JSON.stringify(page('quality-board', 'Quality board', 'Cost and supplier issues at a glance', 'QUALITYB', [], [])),
  'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: { 'on-demand': { acceptsPages: true, owners: ['diya.sharma@example.com'] } }, pages: {
    conq: { type: 'table-insights', group: 'on-demand', order: 1, icon: '⚑', owners: ['ben.okafor@example.com'] }, 'supplier-issues': { type: 'table', group: 'on-demand', order: 2, icon: '▤', owners: [] }, 'quality-board': { type: 'dashboard', group: 'on-demand', order: 3, icon: '◔', owners: [] } } }),
})
// A made-up Windchill search export (no real product, document or folder names).
const windchillCsv = ['Search Results', 'Number,Name,State,Last Modified,Location',
  `DOC-101,Field Service App 2.4 Verification Report,Released,${year}-10-02,/Products/Field Service App 2.4/DHF`,
  `DOC-102,Field Service App 2.4 Test Plan,Released,${year}-09-12,/Products/Field Service App 2.4/DHF`,
  `DOC-103,Lab Console 3.1 Release Notes,Released,${year}-10-14,/Products/Lab Console 3.1/DHF`,
  `DOC-104,Lab Console 3.1 SRS,Released,${year}-08-20,/Products/Lab Console 3.1/DHF`,
  `DOC-105,Inventory Portal 1.2 Verification Report,Released,${year}-10-21,/Products/Inventory Portal 1.2/DHF`,
  `DOC-106,Quality Manual,Released,${year}-10-05,/Shared/Manuals`].join('\n')

// ── What must never be on a capture ─────────────────────────────────────────────────────────────────────────────────
// The app ships with the team's preset server and repository names; on screen they become made-up ones.
const scrubs = [['https?://[\\w.-]*philips\\.com(/tfs)?', 'https://tfs.example.com/tfs'], ['tfsapac04[\\w.]*', 'tfs.example.com'], ['philips-internal/InD_DemandPlanningStorage', 'example-team/planning-data'], ['philips-internal', 'example-team'], ['InD_DemandPlanningStorage', 'planning-data'], ['philips', 'example'], ['ALMP-ORG-MSTP01', 'example-org'],
  ['DHPCollection', 'ExampleCollection'], ['ponkritz/DemandPlanningStorage', 'example-team/planning-data'], ['ponkritz', 'example-team'], ['DemandPlanningStorage', 'planning-data'],
  ['neurolooom-eng/Test2', 'example-team/demand-planning'], ['neurolooom-eng', 'example-team'], ['Patient Safety and Quality', 'Quality Project']]
const forbidden = /philips|tfsapac|ALMP-ORG|MSTP01|ponkritz|neurolooom|DemandPlanningStorage|Patient Safety and Quality|DHPCollection|ghp_|github_pat_|e2e-secret/i
function scrubber(list) {
  const patterns = list.map(([source, to]) => [new RegExp(source, 'gi'), to])
  const fix = (text) => patterns.reduce((value, [pattern, to]) => value.replace(pattern, to), text)
  const walk = (node) => {
    if (node.nodeType === 3) { const next = fix(node.nodeValue); if (next !== node.nodeValue) node.nodeValue = next; return }
    if (node.nodeType === 1 && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') && node.type !== 'password' && node.value) { const next = fix(node.value); if (next !== node.value) node.value = next }
    if (node.nodeType === 1) for (const name of ['placeholder', 'title', 'aria-label']) { const value = node.getAttribute(name); if (value) { const next = fix(value); if (next !== value) node.setAttribute(name, next) } }
    for (const child of node.childNodes ?? []) walk(child)
  }
  window.__scrub = () => walk(document.body)
  new MutationObserver((records) => { for (const record of records) { if (record.type === 'characterData' || record.type === 'attributes') walk(record.target); for (const node of record.addedNodes) walk(node) } })
    .observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] })
}
async function check(page, name) {
  const found = await page.evaluate(() => {
    window.__scrub?.()
    const values = [...document.querySelectorAll('input:not([type=password]), textarea')].flatMap((field) => [field.value, field.placeholder])
    const options = [...document.querySelectorAll('select')].map((select) => select.selectedOptions[0]?.textContent ?? '')
    return [document.body.innerText, ...values, ...options].join('\n')
  })
  const bad = found.match(forbidden)?.[0] ?? (found.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []).find((email) => !/@(example|company)\.com$/i.test(email))
  if (bad) throw new Error(`${name}: "${bad}" is on screen — only synthetic data may be captured.`)
}

// ── Browser set-up ──────────────────────────────────────────────────────────────────────────────────────────────────
// kind 'sample': the synthetic sample, the roles cached in this browser (everyone in `role`), "me" = a sample person.
// kind 'git': Git storage on a fake GitHub with the pages above and access.json (the viewer is `email`).
const openContexts = new Set()
async function open(app, { kind = 'sample', width = 1440, height = 900, theme = 'light', guide = false, role = 'Admin', name = 'Chen Wei', email = owner, gh, record, extra } = {}) {
  const context = await app.browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, acceptDownloads: true, colorScheme: theme === 'dark' ? 'dark' : 'light',
    ...(record ? { recordVideo: { dir: record, size: { width, height } } } : {}) })
  const started = Date.now()
  openContexts.add(context)
  await context.addInitScript(scrubber, scrubs)
  await context.addInitScript(({ guide, theme, kind, name, email, roles }) => {
    if (!guide) localStorage.setItem('demand-planning-setup-guide-v1', 'dismissed')
    localStorage.setItem('demand-planning-theme', theme)
    if (name) localStorage.setItem('demand-planning-my-name-v1', name)
    if (kind === 'sample' && roles) localStorage.setItem('demand-planning-access-v1', roles)
    if (kind === 'git') {
      localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example-team', repo: 'planning-data', branch: 'main', path: 'planning-data.json' }))
      localStorage.setItem('demand-planning-git-token-v1', 'example-git-token')
      localStorage.setItem('demand-planning-work-email-v1', email)
    }
  }, { guide, theme, kind, name: kind === 'sample' ? name : '', email, roles: kind === 'sample' && role ? (() => { const value = defaultPolicy(); value.defaultRole = role; return serializeAccess(value) })() : '' })
  if (extra) await context.addInitScript(extra)
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  if (gh) await context.route('https://api.github.com/**', gh.route)
  else await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not Found"}' }))
  const page = await context.newPage()
  page.on('pageerror', (error) => console.warn(`  page error: ${error.message}`))
  // The start fetch from Azure DevOps fails here (no connection): the guide it may open is closed.
  if (!guide) {
    const fetchGuide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
    await page.addLocatorHandler(fetchGuide, async () => { await fetchGuide.getByRole('button', { name: 'Close', exact: true }).last().click() })
  }
  await page.goto(app.url)
  await page.locator('.sidebar nav').waitFor()
  if (kind === 'sample') {
    await page.getByRole('button', { name: 'Load synthetic sample' }).first().click()
    await page.locator('.notice', { hasText: 'synthetic sample dataset' }).first().waitFor()
    // The one-time "loaded" message is closed; the sample banner stays.
    const loaded = page.locator('.notice', { hasText: 'Synthetic sample dataset loaded' }).getByRole('button', { name: /close|dismiss|×/i })
    if (await loaded.count()) await loaded.first().click()
  }
  return { page, context, started }
}
const navigate = async (page, label) => {
  await page.locator('.sidebar nav button').filter({ hasText: new RegExp(`^\\W*${label.replace(/[[\]&()+.?]/g, '\\$&')}\\s*\\d*$`) }).first().click()
  await page.locator('header.topbar h1').waitFor()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
}
const profileItem = async (page, name) => { await page.locator('header.topbar').getByRole('button', { name: /^Profile/ }).click(); await page.getByRole('menu', { name: 'Profile' }).getByRole('menuitem', { name }).click() }
const menuOf = async (page, label) => { await page.getByRole('button', { name: `More actions: ${label}`, exact: true }).click(); const menu = page.getByRole('menu', { name: label, exact: true }); await menu.waitFor(); return menu }
const settle = async (page) => { await page.mouse.move(0, 0); await page.evaluate(() => document.fonts.ready); await page.waitForLoadState('networkidle').catch(() => {}); await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))) }
const insightsTab = async (page) => { await page.getByRole('tab', { name: /^Insights/ }).click(); await page.locator('.od-insight svg[role="img"]').first().waitFor() }
const panelOf = (page, title) => page.locator('.od-insight', { has: page.locator('h2', { hasText: title }) })

// ── Capture ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const written = []
// A screenshot of the window, of one element (`target`, with a margin) or of a region. PNGs are reduced to 256 colours
// with ffmpeg when it is installed (no dithering: flat UI colours stay exact).
async function shot(page, name, { target, margin = 12, fullPage = false, clip } = {}) {
  await settle(page)
  await check(page, name)
  const path = join(imagesDir, `${name}.png`)
  let region = clip
  if (target) {
    await target.scrollIntoViewIfNeeded()
    const box = await target.boundingBox()
    const view = page.viewportSize()
    const x = Math.max(0, box.x - margin), y = Math.max(0, box.y - margin)
    region = { x, y, width: Math.min(view.width - x, box.width + 2 * margin), height: Math.min(view.height - y, box.height + 2 * margin) }
  }
  await page.screenshot({ path, fullPage, ...(region ? { clip: region } : {}), animations: 'disabled', caret: 'hide' })
  optimisePng(path)
  written.push(path)
  console.log(`  ${name}.png ${(statSync(path).size / 1024).toFixed(0)} KB`)
}
function optimisePng(path) {
  if (!ffmpeg) return
  const out = `${path}.tmp.png`
  const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', path, '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=none', '-pred', 'mixed', out])
  if (run.status === 0 && existsSync(out) && statSync(out).size < statSync(path).size) renameSync(out, path)
  else rmSync(out, { force: true })
}

// ── Screenshots ─────────────────────────────────────────────────────────────────────────────────────────────────────
const shots = {
  async home(app) {
    const { page, context } = await open(app)
    await navigate(page, 'Home')
    await shot(page, 'home')
    await shot(page, 'menu', { clip: { x: 0, y: 0, width: 240, height: 900 } })
    await context.close()
  },
  async 'home-dark'(app) {
    const { page, context } = await open(app, { theme: 'dark' })
    await navigate(page, 'Home')
    await shot(page, 'home-dark')
    await context.close()
  },
  async 'phone-menu'(app) {
    const { page, context } = await open(app, { width: 390, height: 844 })
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.locator('.sidebar nav').waitFor()
    await shot(page, 'phone-menu')
    await context.close()
  },
  async 'get-started'(app) {
    const { page, context } = await open(app, { kind: 'fresh', guide: true, name: '' })
    const dialog = page.getByRole('dialog').first()
    await dialog.waitFor()
    await shot(page, 'get-started', { target: dialog })
    await context.close()
  },
  async 'my-settings'(app) {
    const { page, context } = await open(app)
    await profileItem(page, 'My settings')
    await page.locator('header.topbar h1').waitFor()
    await shot(page, 'my-settings')
    await context.close()
  },
  async 'git-storage'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'Data & sharing')
    await page.getByRole('tab', { name: 'Git storage' }).click()
    await shot(page, 'git-storage')
    await context.close()
  },
  async 'background-jobs'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'CoNQ')
    const row = page.locator('.od-panel table tbody tr').filter({ hasText: 'CONQ-0024' })
    await row.locator('td').nth(2).click()
    const drawer = page.locator('aside.drawer[role="dialog"]')
    await drawer.getByRole('button', { name: 'Edit', exact: true }).click()
    await drawer.getByLabel('Status', { exact: true }).selectOption('Closed')
    await drawer.getByRole('button', { name: 'Save to Git' }).click()
    await drawer.getByRole('button', { name: 'Edit', exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.locator('.jobs-button').click()
    const jobs = page.getByRole('dialog', { name: 'Background jobs' })
    await jobs.locator('li.job').first().waitFor()
    await shot(page, 'background-jobs', { target: jobs })
    await context.close()
  },
  async 'newer-data'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh, extra: () => { window.__guideClock = true } })
    await page.clock.install()
    await page.reload()
    await page.locator('.sidebar nav').waitFor()
    await navigate(page, 'CoNQ')
    await page.locator('.od-panel table tbody tr').first().waitFor()
    const changed = conq(); changed.rows = [...changed.rows, { ...changed.rows[0], id: 'r99', key: 'CONQ-261124-N3W1', seq: 25, cells: { ...changed.rows[0].cells, c7: 'Added by a colleague.' } }]
    gh.put('on-demand/conq.json', JSON.stringify(changed), 'main', `CoNQ: add row CONQ-0025 [saved ${year}-11-24T10:15:00Z] [by Ben Okafor <ben.okafor@example.com>]`)
    const notice = page.locator('.page-git-notice')
    for (let tries = 0; tries < 12 && !(await notice.count()); tries += 1) { await page.clock.fastForward('05:01'); await page.waitForTimeout(500) }
    await notice.waitFor()
    await shot(page, 'newer-data', { target: notice })
    await context.close()
  },
  async 'read-only'(app) {
    const { page, context } = await open(app, { kind: 'fresh', name: '' })
    const notice = page.locator('.notice').filter({ hasText: /read.only/i }).first()
    await notice.waitFor()
    await shot(page, 'read-only', { clip: { x: 240, y: 0, width: 1200, height: 260 } })
    await context.close()
  },
  async 'disabled-reason'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh, email: 'chen.wei@example.com' })
    await navigate(page, 'CoNQ')
    await page.locator('.od-panel table tbody tr').first().waitFor()
    await shot(page, 'disabled-reason', { clip: { x: 240, y: 0, width: 1200, height: 470 } })
    await context.close()
  },
  async 'view-as'(app) {
    const { page, context } = await open(app)
    await profileItem(page, 'View as…')
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    await shot(page, 'view-as', { target: dialog })
    await dialog.getByRole('radio', { name: 'A role' }).check()
    await dialog.getByRole('combobox', { name: 'Role' }).selectOption('Team Member')
    await dialog.getByRole('button', { name: 'View as', exact: true }).click()
    await page.locator('.view-as-banner').waitFor()
    await navigate(page, 'Home')
    await shot(page, 'view-as-banner')
    await context.close()
  },
  async 'role-rights'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'People & roles')
    await page.getByRole('tab', { name: 'Role rights' }).click()
    await page.locator('table').first().waitFor()
    await shot(page, 'role-rights')
    await context.close()
  },
  async 'time-writing'(app) {
    const { page, context } = await open(app)
    await navigate(page, 'Time Writing')
    await shot(page, 'time-writing')
    await context.close()
  },
  async 'my-tasks'(app) {
    const { page, context } = await open(app)
    await navigate(page, 'My Tasks [Board]')
    await shot(page, 'my-tasks')
    await context.close()
  },
  async backlog(app) {
    const { page, context } = await open(app)
    await navigate(page, 'QMS-0025')
    await page.getByRole('button', { name: 'Expand all' }).click().catch(() => {})
    await shot(page, 'backlog')
    await page.getByRole('button', { name: '＋ New Feature' }).first().click()
    const form = page.locator('form.nf-form')
    await form.waitFor()
    await form.getByLabel('Parent Epic').selectOption({ index: 1 })
    await shot(page, 'new-feature', { target: page.getByRole('dialog').filter({ has: form }) })
    await context.close()
  },
  async 'sprint-check'(app) {
    const { page, context } = await open(app)
    await navigate(page, 'Sprint check')
    await shot(page, 'sprint-check')
    await context.close()
  },
  async 'my-dashboard'(app) {
    const { page, context } = await open(app)
    await navigate(page, 'My dashboard')
    await shot(page, 'my-dashboard')
    // MYD-14…MYD-18: blocks of your own over Azure DevOps work and Capacity and utilization.
    const content = page.locator('.content')
    const addBlock = async (title, type, source, more, picture) => {
      await page.getByRole('button', { name: '＋ Add block…' }).click()
      const dialog = page.getByRole('dialog', { name: 'Add a block' })
      await dialog.waitFor()
      await dialog.getByLabel('Title').fill(title)
      await dialog.getByRole('radio', { name: type, exact: true }).check()
      const pick = dialog.getByLabel('Data source')
      await pick.selectOption({ label: await pick.locator('option', { hasText: source }).first().textContent() })
      await more(dialog)
      if (picture) { await dialog.getByRole('region', { name: 'Preview' }).locator('svg').first().waitFor(); await shot(page, picture, { target: dialog }) }
      await dialog.getByRole('button', { name: 'Add block' }).click()
      await dialog.waitFor({ state: 'detached' })
    }
    await addBlock('Work by state', 'Bar chart', 'Azure DevOps work', async (dialog) => {
      await dialog.getByLabel('Categories by').selectOption({ label: 'State (Dropdown)' })
      await dialog.getByLabel('Period filter on').selectOption({ value: '' })
    }, 'my-dashboard-sources')
    await addBlock('Utilization by month', 'Line chart', 'Capacity and utilization', async (dialog) => {
      await dialog.getByLabel('Measure').selectOption({ value: 'average' })
      await dialog.getByLabel('Of the Number column').selectOption({ label: 'Utilization %' })
    })
    const block = (title) => content.locator('.dsh-block', { has: page.locator('h2', { hasText: title }) })
    await block('Utilization by month').locator('svg').first().waitFor()
    await content.getByRole('button', { name: 'Customize' }).click()
    await content.getByRole('button', { name: 'Move Work by state up' }).click()
    await content.getByRole('button', { name: 'Move Utilization by month up' }).click()
    await shot(page, 'my-dashboard-customize')
    await content.getByRole('button', { name: 'Done' }).click()
    await block('Work by state').scrollIntoViewIfNeeded()
    // Both blocks of your own, with the period row above them.
    await page.evaluate(() => window.scrollBy(0, -80))
    const boxes = await Promise.all([page.getByRole('button', { name: 'Reset filters' }).first(), block('Work by state'), block('Utilization by month')].map((entry) => entry.boundingBox()))
    const top = Math.max(0, Math.min(...boxes.map((box) => box.y)) - 12), left = Math.max(0, Math.min(...boxes.map((box) => box.x)) - 12)
    const bottom = Math.min(900, Math.max(...boxes.map((box) => box.y + box.height)) + 12), right = Math.min(1440, Math.max(...boxes.map((box) => box.x + box.width)) + 12)
    await shot(page, 'my-dashboard-custom', { clip: { x: Math.min(left, 256), y: top, width: right - Math.min(left, 256), height: bottom - top } })
    await context.close()
  },
  async 'save-view'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'CoNQ')
    const data = page.locator('.data-table').first()
    await data.locator('tbody tr').first().waitFor()
    await data.getByRole('button', { name: /^Columns/ }).click()
    const panel = data.locator('fieldset.column-chooser')
    await panel.waitFor()
    await panel.getByRole('checkbox', { name: 'Description', exact: true }).uncheck()
    await panel.getByRole('button', { name: 'Save view for everyone' }).click()
    await panel.getByText(/The view for everyone, saved by/).waitFor()
    await shot(page, 'save-view', { target: panel })
    await context.close()
  },
  async 'team-overview'(app) {
    const { page, context } = await open(app)
    await navigate(page, 'Team overview')
    await shot(page, 'team-overview')
    await context.close()
  },
  async 'pulse-check'(app) {
    const { page, context } = await open(app)
    await navigate(page, 'Pulse Check')
    await page.getByRole('tab', { name: /^Last month/ }).click()
    await shot(page, 'pulse-check')
    await page.getByRole('tab', { name: /^Monthly pack/ }).click()
    await shot(page, 'monthly-pack')
    await context.close()
  },
  async 'testing-pages'(app) {
    const { page, context } = await open(app)
    await navigate(page, 'Planning Overview')
    await shot(page, 'planning-overview')
    await navigate(page, 'Capacity vs Actual')
    await shot(page, 'capacity-vs-actual')
    await context.close()
  },
  async 'backlog-health'(app) {
    const { page, context } = await open(app)
    await navigate(page, 'Backlog Health')
    await shot(page, 'backlog-health')
    await context.close()
  },
  async windchill(app) {
    const dir = mkdtempSync(join(tmpdir(), 'guide-windchill-')), csv = join(dir, 'field-service-export.csv')
    writeFileSync(csv, windchillCsv)
    const { page, context } = await open(app)
    await navigate(page, 'Import Windchill export')
    await page.locator('input[type=file]').first().setInputFiles(csv)
    await page.locator('.panel').filter({ has: page.locator('h2, h3', { hasText: /^Releases/ }) }).first().waitFor()
    await page.getByLabel('Show', { exact: true }).selectOption('all').catch(() => {})
    await shot(page, 'windchill')
    await context.close()
    rmSync(dir, { recursive: true, force: true })
  },
  // LST-06, LST-08: the QE list from an Azure DevOps team — a built-in list column in Set up columns…, and ↻ Refresh…
  // with one person added, one removed and one renamed (a made-up team on a fake dev.azure.com).
  async builtinLists(app) {
    // A made-up Azure DevOps identity id per person (the key of a list's items, LST-04).
    const guideId = (email) => `${(Object.keys(people).indexOf(email) + 1).toString(16).padStart(8, 'a')}-0000-4000-8000-000000000000`
    const qe = { id: 'qe-team', name: 'QE team', source: { kind: 'azure-team', server: 'https://dev.azure.com/example-org', project: 'Quality', team: 'QE Team' }, items: ['ana.costa@example.com', 'ben.okafor@example.com', 'chen.wei@example.com'].map((email) => ({ name: people[email], id: guideId(email) })), createdBy: 'Ana Costa', createdAt: `${year}-11-20T08:00:00.000Z`, refreshedAt: `${year}-11-20T08:00:00.000Z`, refreshedBy: 'Ana Costa', log: [] }
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: { ...files(), 'shared-lists.json': `${JSON.stringify({ schema: 1, kind: 'shared-lists', lists: [qe] }, null, 1)}\n` } })
    const connection = { id: 'tw-guide', url: 'https://dev.azure.com/example-org/Quality/_backlogs/backlog/QE%20Team/Features', reason: 'Time Writing', token: 'x'.repeat(52), role: 'time-tracking', creatorEmail: owner }
    const { page, context } = await open(app, { kind: 'git', gh, extra: `localStorage.setItem('demand-planning-azure-connection-profiles-v1', ${JSON.stringify(JSON.stringify([connection]))})` })
    const members = [['Ana Costa', 'ana.costa@example.com'], ['Ben Okafor-Smith', 'ben.okafor@example.com'], ['Diya Sharma', 'diya.sharma@example.com']].map(([displayName, uniqueName]) => ({ identity: { id: guideId(uniqueName), displayName, uniqueName } }))
    await context.route(/https:\/\/dev\.azure\.com\/.*\/teams\/[^/]+\/members/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: members }) }))
    await navigate(page, 'CoNQ')
    await page.locator('.od-panel table tbody tr').first().waitFor()
    await page.getByRole('button', { name: 'Set up columns…' }).click()
    const setup = page.getByRole('dialog', { name: 'Set up columns' })
    await setup.getByRole('button', { name: '＋ Add column' }).click()
    const at = await setup.locator('li.od-column').count()
    await setup.getByLabel(`Column ${at} name`).fill('Auditor')
    await setup.getByLabel(`Column ${at} type`).selectOption({ label: 'Dropdown (built-in list)' })
    await setup.getByLabel('Auditor list').selectOption({ label: 'QE team (Azure DevOps team QE Team · 3 people)' })
    await setup.locator('li.od-column').last().scrollIntoViewIfNeeded()
    await shot(page, 'builtin-list-column-editor', { target: setup.locator('li.od-column').last() })
    await setup.getByRole('button', { name: 'Cancel' }).click()
    await navigate(page, 'Epic & Feature setup')
    await page.getByRole('tablist', { name: 'Sections' }).getByRole('tab', { name: 'Value lists' }).click()
    await page.getByRole('button', { name: 'Refresh QE team' }).click()
    const dialog = page.getByRole('dialog', { name: 'Refresh QE team' })
    await dialog.getByText('1 added · 1 removed · 1 renamed · 1 unchanged').waitFor()
    await shot(page, 'builtin-list-refresh-diff', { target: dialog })
    await context.close()
  },
  async conq(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'CoNQ')
    await page.locator('.od-panel table tbody tr').first().waitFor()
    await shot(page, 'conq-table')
    await page.locator('.od-panel table tbody tr').filter({ hasText: 'CONQ-0019' }).locator('td').nth(2).click()
    const drawer = page.locator('aside.drawer[role="dialog"]')
    await drawer.waitFor()
    await shot(page, 'row-drawer')
    await drawer.getByRole('button', { name: 'Edit', exact: true }).click()
    await shot(page, 'row-drawer-edit', { target: drawer, margin: 0 })
    await drawer.getByRole('button', { name: 'Cancel' }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Set up columns…' }).click()
    const setup = page.getByRole('dialog', { name: 'Set up columns' })
    await setup.waitFor()
    await shot(page, 'set-up-columns', { target: setup })
    await setup.getByRole('button', { name: 'Cancel' }).click()
    await (await menuOf(page, 'page CoNQ')).waitFor()
    await shot(page, 'page-menu', { clip: { x: 760, y: 60, width: 680, height: 420 } })
    await page.keyboard.press('Escape')
    await context.close()
  },
  // UI-25…UI-28: CoNQ grouped by Status, then Category, with one group closed; the filter row; the Save view for
  // everyone pop-up with Start collapsed.
  async 'table-group-by'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'CoNQ')
    const data = page.locator('.od-panel .data-table').first()
    await data.locator('tbody tr').first().waitFor()
    const bar = data.getByRole('group', { name: 'Group and filter the table' })
    await bar.getByRole('combobox', { name: 'Group by' }).selectOption({ label: 'Status' })
    await bar.getByRole('combobox', { name: 'Group level 2' }).selectOption({ label: 'Category' })
    await data.locator('tr.data-table-group[data-group-depth="1"]').first().waitFor()
    await data.locator('tr.data-table-group[data-group-depth="1"]').first().getByRole('button').click()
    await shot(page, 'table-group-by', { clip: { x: 240, y: 0, width: 1200, height: 900 } })
    await bar.getByRole('combobox', { name: 'Group by' }).selectOption({ label: 'No grouping' })
    await bar.getByRole('button', { name: 'Filter by column' }).click()
    await data.getByRole('combobox', { name: 'Filter Department' }).selectOption('Assembly')
    await bar.getByText(/match the column filter/).waitFor()
    await shot(page, 'table-filter-row', { clip: { x: 240, y: 0, width: 1200, height: 640 } })
    await bar.getByRole('combobox', { name: 'Group by' }).selectOption({ label: 'Status' })
    await data.getByRole('button', { name: /^Columns/ }).click()
    await data.locator('fieldset.column-chooser').getByRole('button', { name: 'Save view for everyone' }).click()
    const dialog = page.getByRole('dialog', { name: 'Save view for everyone' })
    await dialog.getByRole('checkbox', { name: 'Start collapsed' }).check()
    await shot(page, 'save-view-collapsed', { target: dialog })
    await context.close()
  },
  async 'sample-mode'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'CoNQ')
    await page.getByRole('group', { name: 'Data shown on CoNQ' }).getByRole('button', { name: 'Sample', exact: true }).click()
    await page.getByText('Sample data — nothing is saved.').first().waitFor()
    await shot(page, 'sample-mode', { clip: { x: 240, y: 0, width: 1200, height: 520 } })
    await context.close()
  },
  async insights(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'CoNQ')
    await insightsTab(page)
    await shot(page, 'insights')
    await page.getByRole('group', { name: 'Insights filters' }).waitFor()
    await shot(page, 'filter-row', { target: page.getByRole('group', { name: 'Insights filters' }) })
    const bar = panelOf(page, 'Cost by category')
    await bar.locator('text.viz-row-label', { hasText: 'Supplier defect' }).click()
    const drill = page.getByRole('dialog', { name: 'Rows behind Supplier defect' })
    await drill.waitFor()
    await shot(page, 'drill-down', { target: drill })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '＋ Add chart / table' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
    await dialog.getByLabel('Title').fill('Cost Pareto')
    await dialog.getByRole('radio', { name: 'Pareto' }).check()
    await dialog.getByLabel('Categories by').selectOption('c1')
    await dialog.getByLabel('Measure').selectOption('sum')
    await dialog.getByLabel('Of the Number column').selectOption('c4')
    await dialog.getByRole('region', { name: 'Preview' }).locator('svg').first().waitFor()
    await shot(page, 'chart-dialog', { target: dialog })
    // CHT-70: the display options on Format, the chart elements on Elements; each tab counts what was changed.
    await editorTab(dialog, 'Format')
    await dialog.getByLabel('Target line value').fill('3000')
    await dialog.getByLabel('Target line label').fill('Budget')
    await dialog.getByRole('tab', { name: /^Format \(\d+\)/ }).waitFor()
    await shot(page, 'chart-format', { target: dialog })
    await editorTab(dialog, 'Elements')
    await dialog.getByRole('group', { name: /^Chart elements/ }).getByRole('combobox', { name: 'Legend' }).selectOption('bottom')
    await dialog.getByRole('tab', { name: /^Elements \(\d+\)/ }).waitFor()
    await shot(page, 'chart-elements', { target: dialog })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Arrange charts' }).click()
    await page.locator('.chart-resize-handle').first().waitFor()
    await shot(page, 'arrange-charts')
    await page.keyboard.press('Escape')
    await context.close()
  },
  async narrative(app) {
    const narrative = { id: 'n1', title: 'CoNQ summary', type: 'narrative', category: 'c1', second: '', measure: 'sum', value: 'c4', filters: [], sort: 'value', options: { size: 'full' },
      narrative: { auto: ['total', 'top'], rules: [{ metric: 'total', op: 'gt', value: 15000, template: 'CoNQ cost above the yearly budget: {value}', tone: 'warning' }] } }
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files({ conq: { insights: [...insights.slice(0, 3), narrative, ...insights.slice(3)] } }) })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'CoNQ')
    await insightsTab(page)
    const panel = panelOf(page, 'CoNQ summary')
    await panel.locator('.narrative-line').first().waitFor()
    await shot(page, 'narrative', { target: panel })
    await context.close()
  },
  async 'pdf-and-publish'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh, extra: () => { window.print = () => {} } })
    await navigate(page, 'CoNQ')
    await insightsTab(page)
    await (await menuOf(page, 'Insights')).getByRole('menuitem', { name: 'Export PDF…' }).click()
    const pdf = page.getByRole('dialog', { name: 'Export PDF' })
    await pdf.waitFor()
    await shot(page, 'export-pdf', { target: pdf })
    await pdf.getByRole('button', { name: 'Cancel' }).click()
    await (await menuOf(page, 'page CoNQ')).getByRole('menuitem', { name: 'Publish interactive HTML…' }).click()
    const publish = page.getByRole('dialog', { name: 'Publish interactive HTML' })
    await publish.waitFor()
    await shot(page, 'publish-html', { target: publish })
    await context.close()
  },
  async dashboard(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'Quality board')
    await page.locator('svg[role="img"]').first().waitFor()
    await shot(page, 'dashboard')
    await context.close()
  },
  async 'pages-menu'(app) {
    const gh = fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() })
    const { page, context } = await open(app, { kind: 'git', gh })
    await navigate(page, 'Pages & menu')
    await page.getByText('Supplier issues').first().waitFor()
    await shot(page, 'pages-menu')
    await page.getByRole('button', { name: '＋ Add page…' }).first().click()
    const dialog = page.getByRole('dialog').first()
    await dialog.waitFor()
    await shot(page, 'add-page', { target: dialog })
    await context.close()
  },
  async people(app) {
    const { page, context } = await open(app)
    await navigate(page, 'People & roles')
    await page.locator('.people-table').waitFor()
    await shot(page, 'people')
    await page.locator('.people-table tr[data-row-key="Chen Wei"] td').nth(1).click()
    const drawer = page.locator('aside.drawer[role="dialog"]')
    await drawer.waitFor()
    await shot(page, 'person-drawer', { target: drawer, margin: 0 })
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'detached' })
    for (const name of ['Chen Wei', 'Diya Sharma']) await page.getByRole('checkbox', { name: `Select ${name}` }).check()
    await shot(page, 'people-bulk', { clip: { x: 240, y: 0, width: 1200, height: 900 } })
    await page.getByRole('tab', { name: 'Team tree' }).click()
    await shot(page, 'team-tree')
    await context.close()
  },
  async admin(app) {
    const { page, context } = await open(app)
    const admin = async (label, file, tab) => { await navigate(page, label); if (tab) await page.getByRole('tab', { name: tab }).click(); await shot(page, file) }
    await admin('Overview', 'admin-overview')
    await admin('Streams', 'streams')
    await admin('Capacity & time', 'capacity-time')
    await admin('History', 'history')
    await profileItem(page, 'Look & feel')
    await page.locator('header.topbar h1').waitFor()
    await shot(page, 'look-and-feel')
    await context.close()
  },
  async docs(app) {
    const { page, context } = await open(app)
    await navigate(page, 'Documentation')
    await page.getByRole('tab', { name: 'User guide' }).click()
    await page.locator('.docs-panel h2, .docs-panel h3').first().waitFor()
    // Scrolled to a section with a screenshot, as it shows in the app.
    const section = page.locator('.docs-panel h4', { hasText: 'The Get started pop-up' })
    await section.evaluate((element) => element.scrollIntoView({ block: 'start' }))
    await page.locator('.docs-panel img.markdown-image').first().evaluate((image) => image.decode())
    await shot(page, 'documentation')
    await context.close()
  },
}

// ── Clips ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// A ring around what is about to be clicked, so a viewer sees where the action is.
async function point(page, locator, pause = 450) {
  await locator.scrollIntoViewIfNeeded()
  await locator.evaluate((element) => { element.style.outline = '3px solid #f59e0b'; element.style.outlineOffset = '2px' })
  await page.waitForTimeout(pause)
  await locator.evaluate((element) => { element.style.outline = ''; element.style.outlineOffset = '' }).catch(() => {})
}
const clickShown = async (page, locator) => { await point(page, locator); await locator.click() }
const showTab = async (page, dialog, name) => { await point(page, dialog.getByRole('tablist').getByRole('tab', { name: new RegExp(`^${name}\\b`) })); await editorTab(dialog, name) }
const look = (page, ms = 1200) => page.waitForTimeout(ms)
async function typeShown(page, locator, text) { await point(page, locator, 250); await locator.fill(''); await locator.pressSequentially(text, { delay: 35 }) }

const clips = {
  async 'clip-conq-row'(page) {
    await navigate(page, 'CoNQ')
    const row = page.locator('.od-panel table tbody tr').filter({ hasText: 'CONQ-0021' })
    await row.waitFor()
    return async () => {
      await look(page, 800)
      await clickShown(page, row.locator('td').nth(2))
      const drawer = page.locator('aside.drawer[role="dialog"]')
      await drawer.waitFor(); await look(page)
      await clickShown(page, drawer.getByRole('button', { name: 'Edit', exact: true }))
      await clickShown(page, drawer.getByLabel('Status', { exact: true })); await drawer.getByLabel('Status', { exact: true }).selectOption('Closed')
      await typeShown(page, drawer.getByLabel('Description', { exact: true }), 'Shrink wrap setting corrected; cartons replaced.')
      await clickShown(page, drawer.getByRole('button', { name: 'Save to Git' }))
      await drawer.getByRole('button', { name: 'Edit', exact: true }).waitFor(); await look(page, 1500)
      await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'detached' })
      await clickShown(page, page.locator('.jobs-button'))
      await page.getByRole('dialog', { name: 'Background jobs' }).locator('li.job').first().waitFor(); await look(page, 2000)
    }
  },
  async 'clip-add-chart'(page) {
    await navigate(page, 'CoNQ')
    await insightsTab(page)
    return async () => {
      await look(page, 800)
      await clickShown(page, page.getByRole('button', { name: '＋ Add chart / table' }))
      const dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
      await typeShown(page, dialog.getByLabel('Title'), 'Cost by department')
      await clickShown(page, dialog.getByRole('radio', { name: 'Bar / column' })); await dialog.getByRole('radio', { name: 'Bar / column' }).check()
      await dialog.getByLabel('Categories by').selectOption('c2'); await look(page, 600)
      await dialog.getByLabel('Measure').selectOption('sum')
      await dialog.getByLabel('Of the Number column').selectOption('c4'); await look(page, 900)
      await showTab(page, dialog, 'Elements'); await look(page, 500)
      const elements = dialog.getByRole('group', { name: /^Chart elements/ })
      await clickShown(page, elements.getByRole('combobox', { name: 'Data labels' })); await elements.getByRole('combobox', { name: 'Data labels' }).selectOption('on'); await look(page, 900)
      await elements.getByRole('combobox', { name: 'Legend' }).selectOption('bottom').catch(() => {})
      await elements.getByRole('checkbox', { name: 'Major horizontal' }).check().catch(() => {}); await look(page, 1200)
      await clickShown(page, dialog.getByRole('button', { name: 'Add chart' }))
      await dialog.waitFor({ state: 'detached' })
      await panelOf(page, 'Cost by department').scrollIntoViewIfNeeded(); await look(page, 2000)
    }
  },
  async 'clip-filter-drill'(page) {
    await navigate(page, 'CoNQ')
    await insightsTab(page)
    return async () => {
      await look(page, 800)
      const row = page.getByRole('group', { name: 'Insights filters' })
      await clickShown(page, row.getByRole('button', { name: /^Department:/ }))
      const list = page.getByRole('listbox', { name: 'Department' })
      await clickShown(page, list.getByRole('checkbox', { name: 'Assembly', exact: true })); await list.getByRole('checkbox', { name: 'Assembly', exact: true }).check()
      await page.keyboard.press('Escape'); await look(page, 1500)
      const label = panelOf(page, 'Cost by category').locator('text.viz-row-label').first()
      await clickShown(page, label)
      await page.getByRole('dialog', { name: /^Rows behind/ }).waitFor(); await look(page, 2500)
      await page.keyboard.press('Escape'); await look(page, 500)
      await clickShown(page, page.getByRole('button', { name: 'Reset filters' })); await look(page, 1800)
    }
  },
  async 'clip-narrative'(page) {
    await navigate(page, 'CoNQ')
    await insightsTab(page)
    return async () => {
      await look(page, 600)
      await clickShown(page, page.getByRole('button', { name: '＋ Add chart / table' }))
      const dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
      await typeShown(page, dialog.getByLabel('Title'), 'CoNQ summary')
      await clickShown(page, dialog.getByRole('radio', { name: 'Narrative (text)' })); await dialog.getByRole('radio', { name: 'Narrative (text)' }).check()
      await dialog.getByLabel('Measure').selectOption('sum')
      await dialog.getByLabel('Of the Number column').selectOption('c4')
      await dialog.getByLabel('Group by', { exact: true }).selectOption('c1'); await look(page, 900)
      await showTab(page, dialog, 'Narrative'); await look(page, 600)
      await clickShown(page, dialog.getByRole('button', { name: '＋ Add rule' }))
      const rule = dialog.getByRole('group', { name: 'Rule 1' })
      await rule.getByLabel('Rule 1 metric').selectOption('total')
      await rule.getByLabel('Rule 1 operator').selectOption('gt')
      await typeShown(page, rule.getByLabel('Rule 1 value'), '15000')
      await rule.getByLabel('Rule 1 tone').selectOption('warning')
      await typeShown(page, rule.getByLabel('Rule 1 sentence'), 'CoNQ cost above budget: {value}')
      await dialog.getByRole('region', { name: 'Preview' }).locator('.narrative-warning').waitFor()
      await dialog.getByRole('region', { name: 'Preview' }).scrollIntoViewIfNeeded(); await look(page, 1800)
      await clickShown(page, dialog.getByRole('button', { name: 'Add chart' }))
      await dialog.waitFor({ state: 'detached' })
      await panelOf(page, 'CoNQ summary').scrollIntoViewIfNeeded(); await look(page, 2000)
    }
  },
  async 'clip-arrange'(page) {
    await navigate(page, 'CoNQ')
    await insightsTab(page)
    return async () => {
      await look(page, 600)
      await clickShown(page, page.getByRole('button', { name: 'Arrange charts' }))
      const pie = panelOf(page, 'Issues by department').first()
      const handle = pie.locator('.chart-resize-handle')
      await handle.waitFor(); await look(page, 800)
      const corner = await handle.boundingBox()
      await point(page, handle)
      await page.mouse.move(corner.x + 6, corner.y + 6); await page.mouse.down()
      await page.mouse.move(corner.x + 6 + 110, corner.y + 6 + 60, { steps: 20 }); await page.mouse.up(); await look(page, 1200)
      await clickShown(page, page.getByRole('button', { name: 'More actions: Issues by department', exact: true }))
      const match = page.getByRole('menuitem', { name: 'Match heights in this row' })
      await point(page, match); await match.click(); await look(page, 1500)
      const grip = panelOf(page, 'Issues by department and status').locator('[aria-label^="Move"], .chart-grip').first()
      if (await grip.count()) { await grip.focus(); await point(page, grip); for (const key of ['ArrowUp', 'ArrowUp', 'Enter']) { await page.keyboard.press(key); await look(page, 500) } }
      await look(page, 1500)
    }
  },
  async 'clip-publish'(page, context) {
    await navigate(page, 'CoNQ')
    await insightsTab(page)
    return async () => {
      await look(page, 600)
      const row = page.getByRole('group', { name: 'Insights filters' })
      await clickShown(page, row.getByRole('button', { name: /^Category:/ }))
      const list = page.getByRole('listbox', { name: 'Category' })
      await list.getByRole('checkbox', { name: 'Scrap', exact: true }).check(); await list.getByRole('checkbox', { name: 'Rework', exact: true }).check()
      await page.keyboard.press('Escape'); await look(page, 900)
      const menu = await menuOf(page, 'page CoNQ')
      await clickShown(page, menu.getByRole('menuitem', { name: 'Publish interactive HTML…' }))
      const dialog = page.getByRole('dialog', { name: 'Publish interactive HTML' })
      await dialog.waitFor(); await look(page, 2200)
      await clickShown(page, dialog.getByRole('button', { name: 'Publish now' }))
      await dialog.waitFor({ state: 'detached' })
      await page.waitForFunction(() => window.__written?.length === 1); await look(page, 600)
      // The published file, opened as a colleague would (from a folder; offline).
      const html = await page.evaluate(() => window.__written[0])
      const dir = mkdtempSync(join(tmpdir(), 'guide-publish-')), file = join(dir, 'CoNQ.html')
      writeFileSync(file, html)
      await page.goto(`file://${file}`)
      await page.locator('.pv-header').waitFor(); await look(page, 2200)
      const bar = page.locator('text.viz-row-label').first()
      if (await bar.count()) { await clickShown(page, bar); await look(page, 1800); await page.keyboard.press('Escape') }
      const rowsTab = page.getByRole('tab', { name: /^Rows/ })
      if (await rowsTab.count()) { await clickShown(page, rowsTab); await look(page, 1800) }
      rmSync(dir, { recursive: true, force: true })
      void context
    }
  },
  async 'clip-people'(page) {
    await navigate(page, 'People & roles')
    await page.locator('.people-table').waitFor()
    return async () => {
      await look(page, 600)
      await clickShown(page, page.locator('.people-table tr[data-row-key="Diya Sharma"] td').nth(1))
      const drawer = page.locator('aside.drawer[role="dialog"]')
      await drawer.waitFor(); await look(page, 1500)
      await clickShown(page, drawer.getByRole('button', { name: 'Next person' })); await look(page, 1200)
      await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'detached' })
      for (const name of ['Chen Wei', 'Diya Sharma']) await clickShown(page, page.getByRole('checkbox', { name: `Select ${name}` })).then(() => page.getByRole('checkbox', { name: `Select ${name}` }).check())
      const bar = page.getByRole('region', { name: 'Selected people' })
      await look(page, 800)
      await clickShown(page, bar.getByRole('button', { name: 'Set region…' }))
      const dialog = page.getByRole('form', { name: 'Set region for 2 people' })
      await dialog.getByLabel('Region', { exact: true }).selectOption('Netherlands'); await look(page, 700)
      await clickShown(page, dialog.getByRole('button', { name: 'Save', exact: true }))
      await dialog.waitFor({ state: 'detached' }); await look(page, 2000)
    }
  },
}

async function recordClip(app, name) {
  const dir = mkdtempSync(join(tmpdir(), 'guide-video-'))
  const git = name !== 'clip-people'
  const gh = git ? fakeGitHub({ owner: 'example-team', repo: 'planning-data', files: files() }) : undefined
  const publishStub = () => {
    window.__written = []
    window.showSaveFilePicker = async (options) => ({ kind: 'file', name: options.suggestedName, queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      createWritable: async () => { const parts = []; return { write: async (data) => { parts.push(typeof data === 'string' ? data : await data.text()) }, close: async () => { window.__written.push(parts.join('')) } } } })
  }
  const { page, context, started } = await open(app, { kind: git ? 'git' : 'sample', gh, width: 1280, height: 720, record: dir, extra: publishStub })
  const run = await clips[name](page, context)
  await settle(page)
  await check(page, name)
  const poster = join(mediaDir, `${name}.png`)
  await page.screenshot({ path: poster, animations: 'disabled', caret: 'hide' })
  optimisePng(poster)
  const from = (Date.now() - started) / 1000
  await run()
  await check(page, name).catch((error) => { if (!page.url().startsWith('file:')) throw error })
  const video = page.video()
  await context.close()
  const raw = await video.path()
  const out = join(mediaDir, `${name}.webm`)
  if (ffmpeg) {
    const start = Math.max(0, from - 0.3).toFixed(2)
    const encode = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', start, '-i', raw, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '42', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-an', out])
    if (encode.status !== 0) throw new Error(`${name}: ffmpeg failed: ${encode.stderr}`)
  } else renameSync(raw, out)
  rmSync(dir, { recursive: true, force: true })
  written.push(out)
  console.log(`  ${name}.webm ${(statSync(out).size / 1024).toFixed(0)} KB${existsSync(poster) ? `, poster ${(statSync(poster).size / 1024).toFixed(0)} KB` : ''}`)
}

// ── Run ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
mkdirSync(imagesDir, { recursive: true }); mkdirSync(mediaDir, { recursive: true })
if (!ffmpeg) console.warn('ffmpeg not found: images are kept as Playwright writes them, clips untrimmed.')
const app = await startApp()
const failed = []
try {
  const list = videos ? Object.keys(clips) : Object.keys(shots)
  for (const name of list.filter((entry) => !only.length || only.includes(entry))) {
    console.log(name)
    try { if (videos) await recordClip(app, name); else await shots[name](app) } catch (error) { failed.push(name); console.error(`  FAILED ${name}: ${error.message.split('\n').slice(0, 3).join(' | ')}`) }
    for (const context of openContexts) await context.close().catch(() => {})
    openContexts.clear()
  }
} finally { await app.stop() }
const total = (dir) => readdirSync(dir).reduce((sum, file) => sum + statSync(join(dir, file)).size, 0)
console.log(`\n${written.length} files written. Images ${(total(imagesDir) / 1048576).toFixed(2)} MB, media ${(total(mediaDir) / 1048576).toFixed(2)} MB.`)
if (failed.length) { console.error(`Failed: ${failed.join(', ')}`); process.exitCode = 1 }
