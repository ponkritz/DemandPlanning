import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { menuOf, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Publish interactive HTML… (OND-90…OND-99) in a browser against a mocked GitHub, with showSaveFilePicker replaced by a
// stub that keeps what is written. A table page: the Tool Owner narrows CoNQ's Insights to Q3 and Department QRE and
// publishes; the file holds only those rows (never the hidden one) and, opened from file:// with every request
// refused and recorded, works offline — the header states the cut, the filter row narrows further and the charts
// follow, the drill-down lists the rows behind a bar, the Rows tab searches, on a phone too, no console error
// (TC-OND-94, UAT), and a schedule saved keeps those filters (TC-OND-96). An On-Demand Dashboard with two data sources and two tabs published with its filter row
// (TC-OND-95).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear()
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'] },
  { id: 'c2', name: 'Cost', type: 'currency', currency: 'EUR' },
  { id: 'c3', name: 'Found on', type: 'date' },
  { id: 'c4', name: 'Department', type: 'dropdown', options: ['QRE', 'QA', 'Production'] },
  { id: 'c5', name: 'Note', type: 'text' },
]
// Q3 of this year and QRE: CONQ-0001, -0002, -0004 and -0010 (4 of the 9 rows that are not hidden).
const cells = [
  ['Scrap', '1200 EUR', `${year}-07-02`, 'QRE', 'Wrong label'], ['Rework', '80 EUR', `${year}-08-15`, 'QRE', 'Late batch'],
  ['Complaint', '450 EUR', `${year}-09-01`, 'QA', 'Customer QA'], ['Scrap', '300 EUR', `${year}-09-20`, 'QRE', 'Second scrap'],
  ['Scrap', '70 EUR', `${year}-02-01`, 'QRE', 'First quarter'], ['Rework', '10 EUR', `${year}-10-05`, 'QRE', 'Fourth quarter'],
  ['Scrap', '5 EUR', `${year}-07-09`, 'QRE', 'Hidden secret'], ['Complaint', '999 EUR', `${year - 1}-07-01`, 'QRE', 'Last year'],
  ['Scrap', '40 EUR', `${year}-08-01`, 'Production', 'Production scrap'], ['Rework', '25 EUR', `${year}-07-30`, 'QRE', 'Late </script><script>alert(1)</script>'],
]
const rows = cells.map(([c1, c2, c3, c4, c5], index) => ({ id: `r${index + 1}`, seq: index + 1, key: `CONQ-260101-AA${String(index).padStart(2, '0')}`, addedBy: 'ana@example.com', addedAt: `${year}-01-02T10:00:00.000Z`, cells: { c1, c2, c3, c4, c5 },
  ...(index === 6 ? { hidden: { by: 'ana@example.com', at: `${year}-08-01T10:00:00.000Z` } } : {}) }))
const insights = [
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c2', sort: 'value' },
  { id: 'i2', title: 'Rows', type: 'kpi', category: '', measure: 'count', sort: 'value' },
  { id: 'i3', title: 'Rows by department', type: 'pie', category: 'c4', measure: 'count', sort: 'value' },
]
const conq = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights, insightFilters: { period: 'c3', fields: ['c4'] } }
const issues = { schema: 1, kind: 'on-demand-page', id: 'supplier-issues', name: 'Supplier issues', description: '', keyPrefix: 'SUP',
  columns: [{ id: 'd1', name: 'Supplier', type: 'dropdown', options: ['Acme', 'Bolt'] }, { id: 'd2', name: 'Opened', type: 'date' }],
  rows: [['s1', 'Acme', `${year}-03-01`], ['s2', 'Bolt', `${year}-05-02`], ['s3', 'Acme', `${year}-09-05`], ['s4', 'Acme', `${year - 1}-09-30`]].map(([id, d1, d2], index) => ({ id, seq: index + 1, cells: { d1, d2 } })), insights: [] }
const block = (id, title, source, type, period, extra = {}) => ({ id, title, type, source, category: '', second: '', measure: 'count', value: '', filters: [], sort: 'value', period, tab: '', ...extra })
const board = { schema: 1, kind: 'dashboard', id: 'quality-board', tabs: [{ id: 't1', name: 'Cost' }, { id: 't2', name: 'Suppliers' }],
  filters: [{ id: 'f1', source: 'page:conq', column: 'c4' }, { id: 'f2', source: 'page:supplier-issues', column: 'd1' }],
  blocks: [block('b1', 'CoNQ rows', 'page:conq', 'kpi', 'c3'), block('b2', 'Issues', 'page:supplier-issues', 'kpi', 'd2', { tab: 't2' }),
    block('b3', 'Cost by category', 'page:conq', 'bar', 'c3', { category: 'c1', measure: 'sum', value: 'c2' }), block('b4', 'Issues by supplier', 'page:supplier-issues', 'pie', 'd2', { category: 'd1', tab: 't2' })] }
const files = () => ({
  'on-demand/conq.json': JSON.stringify(conq), 'on-demand/supplier-issues.json': JSON.stringify(issues), 'dashboards/quality-board.json': JSON.stringify(board),
  'on-demand/quality-board.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'quality-board', name: 'Quality board', description: 'Cost and suppliers', keyPrefix: 'QUALITYB', columns: [], rows: [] }),
  'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { conq: { type: 'table-insights', group: 'on-demand', order: 1, icon: '⚑', owners: [] }, 'supplier-issues': { type: 'table', group: 'on-demand', order: 2, icon: '⚑', owners: [] }, 'quality-board': { type: 'dashboard', group: 'on-demand', order: 3, icon: '◔', owners: [] } } }),
})

const init = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', 'ana@example.com')
  // The File System Access API: a file handle whose writes are kept for the test.
  window.__written = []
  window.showSaveFilePicker = async (options) => {
    window.__picker = options
    return { kind: 'file', name: options.suggestedName, queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      createWritable: async () => { const parts = []; return { write: async (data) => { parts.push(typeof data === 'string' ? data : await data.text()) }, close: async () => { window.__written.push(parts.join('')) } } } }
  }
}
async function open(role = 'Tool Owner') {
  const { page, context, errors } = await openPage(app, { init })
  const data = files(), writes = []
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/repos/example/storage') return json({ visibility: 'private', permissions: { push: true } })
    if (url.pathname === '/repos/example/storage/commits') return json([])
    if (request.method() !== 'GET') { if (!url.pathname.endsWith('/.demand-planning-write-check')) writes.push(url.pathname); return json({ message: 'Invalid request' }, 422) }
    const match = /^\/repos\/example\/storage\/contents\/(.*)$/.exec(url.pathname)
    if (!match) return json({ message: 'Not Found' }, 404)
    const path = decodeURIComponent(match[1])
    if (path === 'access.json') return json(rolesFile(role))
    const folder = Object.keys(data).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${data[file].length}` })))
    if (data[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(data[path]).toString('base64'), sha: `s${data[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  // The Azure DevOps guide may open over the page (no connection here): closed whenever it does.
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, async () => { await guide.getByRole('button', { name: 'Close', exact: true }).last().click() })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, writes }
}
// Ticks options of a MultiSelect in a filter row, then closes its list.
async function tick(page, group, label, options) {
  await group.getByRole('button', { name: new RegExp(`^${label}:`) }).click()
  const list = page.getByRole('listbox', { name: label })
  for (const option of options) await list.getByRole('checkbox', { name: option, exact: true }).check()
  await page.keyboard.press('Escape')
  await list.waitFor({ state: 'detached' })
}
// Publish now from the page ⋯; the confirmation's first sentence; the file written.
async function publish(page, menuLabel, count) {
  await (await menuOf(page, menuLabel)).getByRole('menuitem', { name: 'Publish interactive HTML…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Publish interactive HTML' })
  await dialog.waitFor()
  const warning = await text(dialog.locator('.publish-warning'))
  await dialog.getByText('A scheduled run publishes the rows that pass the filters saved with the schedule').waitFor()
  await dialog.getByRole('button', { name: 'Publish now' }).click()
  await dialog.waitFor({ state: 'detached' })
  await page.waitForFunction((n) => window.__written.length === n, count)
  return { warning, html: await page.evaluate((n) => window.__written[n - 1], count) }
}
// The file on its own, from file:// in a fresh context: every request that is not the file itself refused and
// recorded; console errors and page errors recorded.
async function openFile(html, name, viewport = { width: 1440, height: 1000 }) {
  const dir = mkdtempSync(join(tmpdir(), 'dph-interactive-'))
  const path = join(dir, name)
  writeFileSync(path, html)
  const context = await app.browser.newContext({ viewport })
  const requests = [], problems = []
  await context.route(/^(?!file:)/, (route) => { requests.push(route.request().url()); return route.abort() })
  const file = await context.newPage()
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(file)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  file.on('request', (request) => { if (!request.url().startsWith('file:')) requests.push(request.url()) })
  file.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text()) })
  file.on('pageerror', (error) => problems.push(error.message))
  await file.goto(pathToFileURL(path).href)
  await file.locator('.pv-header').waitFor()
  return { file, requests, problems, close: async () => { await context.close(); rmSync(dir, { recursive: true, force: true }) } }
}
// What the file may contain as an address: XML namespace names and the document types of the Excel export (never
// loaded), React's error-text prefix, and a row's own text. No element that loads anything; no token or Git path.
const allowed = /^(?:http:\/\/www\.w3\.org\/|http:\/\/schemas\.openxmlformats\.org\/|https:\/\/react\.dev\/errors\/$)/
function assertSafe(html) {
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-[A-Za-z0-9+/=]+'; style-src 'sha256-[A-Za-z0-9+/=]+'; img-src data:; base-uri 'none'; form-action 'none'">/)
  // One script that runs — the viewer, last in the body (inside it "</script" is escaped, so its first "</script>" ends it).
  const viewer = /<script>([\s\S]*?)<\/script>\n<\/body>\n<\/html>\n$/.exec(html)
  assert.ok(viewer, 'the viewer script ends the body')
  const markup = html.slice(0, viewer.index)
  assert.equal(markup.match(/<script\b/g).length, 1, 'besides the viewer only the JSON data block')
  assert.match(markup, /<script type="application\/json" id="dp-published">[^<]*<\/script>/)
  assert.doesNotMatch(viewer[1], /<\/script/i)
  assert.doesNotMatch(markup, /<(?:img|link|iframe|object|embed|form|base)\b|\s(?:src|href|action)="|@import|url\(\s*["']?(?!#|data:)/i)
  for (const url of html.match(/https?:\/\/[^\s"'`\\)<]*/g) ?? []) assert.match(url, allowed, `no other address in the file: ${url}`)
  assert.doesNotMatch(html, /test-token|api\.github|example\/storage|on-demand\/|dashboards\//)
}
const dataOf = (html) => { const start = html.indexOf('id="dp-published">') + 'id="dp-published">'.length; return JSON.parse(html.slice(start, html.indexOf('</script>', start))) }
const card = (file, title) => file.locator('.od-kpi-card', { has: file.locator('h2', { hasText: title }) })
const panel = (file, title) => file.locator('.od-insight', { has: file.locator('h2', { hasText: title }) })

test('TC-OND-94: the Tool Owner publishes CoNQ cut to Q3 and QRE; the file holds only those rows and works offline — header, filter row, charts, drill-down, Rows search, phone', async () => {
  const { page, context, errors, writes } = await open()
  await navigate(page, 'CoNQ')
  await page.getByRole('tab', { name: /^Insights/ }).click()
  const filters = page.getByRole('group', { name: 'Insights filters' })
  await tick(page, filters, 'Quarter', ['Q3'])
  await tick(page, filters, 'Department', ['QRE'])
  await page.locator('.ins-scope', { hasText: '4 of 9 rows counted' }).waitFor()

  const { warning, html } = await publish(page, 'page CoNQ', 1)
  assert.match(warning, /^This file contains the 4 rows of CoNQ that pass your filters\. Anyone who receives it can read them\. \(Your filters: Found on: Q3 \d{4} · Department: QRE; 4 of 9 rows; hidden rows are never published\./)
  assert.equal(await page.evaluate(() => window.__picker.suggestedName), 'CoNQ.html')
  assertSafe(html)
  // OND-91: only the rows that pass — not the hidden one, not QA, Production, Q1, Q4 or last year.
  const data = dataOf(html)
  assert.deepEqual(data.sources[0].rows.map((row) => row.seq), [1, 2, 4, 10])
  for (const gone of ['Hidden secret', 'Customer QA', 'Production scrap', 'First quarter', 'Fourth quarter', 'Last year']) assert.ok(!html.includes(gone), gone)
  assert.ok(!html.includes('</script><script>alert(1)'), 'a cell cannot end the data block')
  assert.equal(writes.length, 0, 'nothing written to Git')

  const { file, requests, problems, close } = await openFile(html, 'CoNQ.html')
  // OND-93: the header.
  assert.equal(await text(file.locator('h1')), 'CoNQ')
  assert.match(await text(file.locator('.pv-published')), /^Published by .+ on \d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} \S+$/)
  assert.equal(await text(file.getByTestId('published-cut')), `Data published: Found on: Q3 ${year} · Department: QRE · 4 of 9 rows`)
  // OND-95, OND-97: the filter row starts with nothing narrowed and offers only what the file holds.
  const row = file.getByRole('group', { name: 'Filters' })
  await file.locator('.ins-scope', { hasText: '4 of 4 rows of this file shown.' }).waitFor()
  assert.equal(await text(card(file, 'Rows').locator('.od-kpi strong')), '4')
  await row.getByRole('button', { name: /^Department:/ }).click()
  assert.deepEqual(await file.getByRole('listbox', { name: 'Department' }).getByRole('checkbox').evaluateAll((list) => list.map((box) => box.closest('label')?.textContent?.trim())).then((names) => names.filter((name) => name !== 'Select all')), ['QRE'])
  await file.keyboard.press('Escape')
  await row.getByRole('button', { name: /^Year:/ }).click()
  assert.deepEqual(await file.getByRole('listbox', { name: 'Year' }).getByRole('checkbox').evaluateAll((list) => list.map((box) => box.closest('label')?.textContent?.trim())).then((names) => names.filter((name) => name !== 'Select all')), [String(year)])
  await file.keyboard.press('Escape')
  const bars = panel(file, 'Cost by category')
  assert.match(await bars.locator('svg[role="img"] title').first().textContent(), /^Cost by category: Scrap 1,500, Rework 105/)
  await tick(file, row, 'Month', ['Jul'])
  await file.locator('.ins-scope', { hasText: '2 of 4 rows of this file shown.' }).waitFor()
  assert.equal(await text(card(file, 'Rows').locator('.od-kpi strong')), '2')
  assert.match(await bars.locator('svg[role="img"] title').first().textContent(), /^Cost by category: Scrap 1,200, Rework 25/)
  // Table view and Data labels, as in the app.
  await bars.getByRole('button', { name: 'Table', exact: true }).click()
  assert.deepEqual(await bars.locator('tbody tr').evaluateAll((list) => list.map((entry) => entry.innerText.replace(/\s+/g, ' ').trim())), ['Scrap 1,200', 'Rework 25', 'Total 1,225'])
  await bars.getByRole('button', { name: 'Chart', exact: true }).click()
  // The drill-down: the rows behind a bar.
  await bars.locator('text.viz-row-label', { hasText: 'Scrap' }).click()
  const drill = file.getByRole('dialog', { name: 'Rows behind Scrap' })
  await drill.locator('tbody tr').first().waitFor()
  assert.deepEqual(await drill.locator('tbody tr').evaluateAll((list) => list.map((entry) => entry.innerText.trim().split(/\s/)[0])), ['CONQ-0001'])
  await file.keyboard.press('Escape')
  await drill.waitFor({ state: 'detached' })
  // OND-97: the Rows tab — the rows the filter row keeps, search over all columns.
  await row.getByRole('button', { name: 'Reset filters' }).click()
  await file.getByRole('tab', { name: 'Rows (4)' }).click()
  const table = file.locator('.pv-rows')
  await table.locator('tbody tr').first().waitFor()
  assert.equal(await table.locator('tbody tr').count(), 4)
  await file.getByRole('searchbox', { name: 'Search all columns' }).fill('late')
  await table.locator('tbody tr').nth(1).waitFor()
  assert.deepEqual(await table.locator('tbody tr').evaluateAll((list) => list.map((entry) => entry.innerText.trim().split(/\s/)[0])), ['CONQ-0002', 'CONQ-0010'])
  assert.ok((await text(table.locator('tbody tr').nth(1))).includes('Late </script><script>alert(1)</script>'), 'shown as text')
  assert.match(await text(table), /2 of 4 rows/)
  // The theme toggle switches to dark.
  await file.getByRole('button', { name: /^Theme: / }).click()
  await file.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light' || document.documentElement.getAttribute('data-theme') === 'dark')
  assert.deepEqual(requests, [], 'no request leaves the file')
  assert.deepEqual(problems, [])
  await close()

  // On a phone (390 px): no horizontal scroll of the page, the charts and the filter row there.
  const phone = await openFile(html, 'CoNQ.html', { width: 390, height: 844 })
  await panel(phone.file, 'Cost by category').locator('svg[role="img"]').waitFor()
  assert.equal(await phone.file.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  assert.deepEqual(phone.requests, [])
  assert.deepEqual(phone.problems, [])
  await phone.close()

  // OND-96: a schedule keeps the filters it was saved with (the file is chosen now, so the schedule can be set).
  await (await menuOf(page, 'page CoNQ')).getByRole('menuitem', { name: 'Publish interactive HTML…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Publish interactive HTML' })
  await dialog.getByText('CoNQ.html').first().waitFor()
  await dialog.getByRole('radio', { name: 'Daily' }).check()
  await dialog.getByRole('button', { name: 'Save schedule' }).click()
  await dialog.locator('small[role="status"]', { hasText: 'Saved on this computer with your current filters: Daily at' }).waitFor()
  await dialog.getByText(`Saved with the schedule: Found on: Q3 ${year} · Department: QRE.`).waitFor()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('demand-planning-publish-schedule-v2'))[JSON.stringify(['example/storage@main:access.json', 'ana@example.com', 'conq'])])
  assert.deepEqual(saved.cut, { kind: 'table', choice: { period: { years: [], quarters: [`${year}-Q3`], months: [] }, fields: { c4: { values: ['QRE'] } } } })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-OND-95: an On-Demand Dashboard over two table pages published with its filter row — each source cut, the tabs, the KPI tiles and the Rows of each source in the file', async () => {
  const { page, context, errors } = await open()
  await page.locator('.sidebar nav button', { hasText: 'Quality board' }).click()
  await page.locator('header.topbar h1', { hasText: 'Quality board' }).waitFor()
  const filters = page.getByRole('group', { name: 'Dashboard filters' })
  await page.locator('.metric-grid article', { hasText: 'CoNQ rows' }).waitFor()
  await tick(page, filters, 'Department', ['QRE'])
  // The current year (nothing ticked) and QRE: CoNQ 1, 2, 4, 5, 6, 10; the issues of this year: s1, s2, s3.
  const { warning, html } = await publish(page, 'page Quality board', 1)
  assert.match(warning, /^This file contains the 9 rows of Quality board that pass your filters\./)
  assertSafe(html)
  const data = dataOf(html)
  assert.deepEqual(data.sources.map((source) => [source.name, source.rows.map((row) => row.seq)]), [['CoNQ', [1, 2, 4, 5, 6, 10]], ['Supplier issues', [1, 2, 3]]])

  const { file, requests, problems, close } = await openFile(html, 'Quality board.html')
  assert.equal(await text(file.getByTestId('published-cut')), `Data published: Period: ${year} (whole year) · Department: QRE · 9 of 13 rows`)
  const tile = (title) => file.locator('.metric-grid article', { has: file.locator('span', { hasText: new RegExp(`^${title}$`) }) }).locator('strong')
  assert.equal(await text(tile('CoNQ rows')), '6')
  assert.equal(await text(tile('Issues')), '3')
  // The tabs: Cost first, then Suppliers with its pie.
  assert.equal(await file.getByRole('tab', { name: 'Cost' }).getAttribute('aria-selected'), 'true')
  await file.locator('.dsh-block', { hasText: 'Cost by category' }).locator('svg[role="img"]').waitFor()
  await file.getByRole('tab', { name: 'Suppliers' }).click()
  await file.locator('.dsh-block', { hasText: 'Issues by supplier' }).locator('svg[role="img"]').waitFor()
  // Narrowing within the file: Supplier Acme.
  const row = file.getByRole('group', { name: 'Filters' })
  await tick(file, row, 'Supplier', ['Acme'])
  await tile('Issues').filter({ hasText: /^2$/ }).waitFor()
  assert.equal(await text(tile('CoNQ rows')), '6', 'a filter of another source leaves it')
  // The Rows of each source.
  await file.getByRole('tab', { name: /^Rows \(\d+\)$/ }).click()
  await file.getByLabel('Rows of').selectOption({ label: 'Supplier issues' })
  const table = file.locator('.pv-rows')
  await table.locator('tbody tr').nth(1).waitFor()
  assert.deepEqual(await table.locator('tbody tr').evaluateAll((list) => list.map((entry) => entry.innerText.trim().split(/\s/)[0])), ['SUP-0001', 'SUP-0003'])
  assert.deepEqual(requests, [])
  assert.deepEqual(problems, [])
  await close()
  assert.deepEqual(errors, [])
  await context.close()
})
