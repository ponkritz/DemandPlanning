import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
import { editorTab, openPage, rolesFile, startApp, text } from './helpers.mjs'

// CHT-74…CHT-82 The nested Pivot table against a mocked GitHub, synthetic rows only: on a Table + Insights page a Tool
// Owner builds a Pivot table with rows Epic → State and columns by Month (＋ then by), closes and opens a group, lists the
// rows behind a subtotal and exports the flat table (TC-CHT-70, UAT); the same on an On-Demand Dashboard page
// (TC-CHT-71). A chart's own value name (its Y axis title "Services") names the value in the legend and the Table view
// (TC-CHT-72); a save GitHub answers with HTTP 500 is tried once more by itself, and twice a 500 says so in plain words
// and Retry saves it (TC-GIT-22). PIVOT_SHOTS=<folder> also writes the screenshots of the builder and the table (1440 px, light, scale 2).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const shots = process.env.PIVOT_SHOTS
const year = new Date().getUTCFullYear()
const columns = [
  { id: 'c1', name: 'Epic', type: 'dropdown', options: ['Platform', 'Mobile', 'Reporting'] },
  { id: 'c2', name: 'State', type: 'dropdown', options: ['New', 'Active', 'Closed'] },
  { id: 'c3', name: 'Stream', type: 'dropdown', options: ['Core', 'Apps'] },
  { id: 'c4', name: 'Start', type: 'date' },
  { id: 'c5', name: 'Effort', type: 'number' },
]
const cells = [
  ['Platform', 'New', 'Core', `${year}-01-10`, '5'], ['Platform', 'Active', 'Core', `${year}-01-20`, '8'], ['Platform', 'Active', 'Apps', `${year}-02-03`, '3'],
  ['Platform', 'Closed', 'Core', `${year}-02-14`, '13'], ['Mobile', 'New', 'Apps', `${year}-01-05`, '2'], ['Mobile', 'Active', 'Apps', `${year}-02-11`, '5'],
  ['Mobile', 'Active', 'Apps', `${year}-03-02`, '8'], ['Reporting', 'Closed', 'Core', `${year}-03-15`, '1'],
]
const rows = cells.map(([c1, c2, c3, c4, c5], index) => ({ id: `r${index + 1}`, seq: index + 1, key: `PLAN-260101-AA${String(index).padStart(2, '0')}`, cells: { c1, c2, c3, c4, c5 } }))
const plan = { schema: 1, kind: 'on-demand-page', id: 'delivery-plan', name: 'Delivery plan', description: 'Synthetic work items', keyPrefix: 'PLAN', columns, rows }
const files = () => ({
  'on-demand/delivery-plan.json': JSON.stringify(plan),
  'on-demand/plan-board.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'plan-board', name: 'Plan board', description: 'The plan at a glance', keyPrefix: 'PLANB', columns: [], rows: [] }),
  'dashboards/plan-board.json': JSON.stringify({ schema: 1, kind: 'dashboard', id: 'plan-board', tabs: [], filters: [], blocks: [] }),
  'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'delivery-plan': { type: 'table-insights', group: 'on-demand', order: 1, icon: '⚑', owners: [] }, 'plan-board': { type: 'dashboard', group: 'on-demand', order: 2, icon: '◔', owners: [] } } }),
})
const signIn = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', 'tool.owner@example.com')
}
// fail: answers given, in order, to the next PUTs of a file instead of writing it (GIT-27: e.g. [500]).
async function mockGitHub(context, store, fail = {}) {
  const writes = []
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (/^\/repos\/[^/]+\/[^/]+\/branches\/[^/]+$/.test(url.pathname)) return json({ name: 'main' })
    if (url.pathname === '/repos/example/storage') return json({ visibility: 'private', permissions: { push: true } })
    if (url.pathname === '/repos/example/storage/commits') return json([])
    const match = /^\/repos\/example\/storage\/contents\/(.*)$/.exec(url.pathname)
    if (!match) return json({ message: 'Not Found' }, 404)
    const path = decodeURIComponent(match[1])
    if (request.method() === 'PUT') {
      if (path === '.demand-planning-write-check') return json({ message: 'Invalid request' }, 422)
      if (fail[path]?.length) return json({ message: 'Server Error' }, fail[path].shift())
      const body = JSON.parse(request.postData())
      store[path] = Buffer.from(body.content, 'base64').toString()
      writes.push({ path, data: JSON.parse(store[path]) })
      return json({ content: { sha: `v${writes.length}` }, commit: { html_url: `https://github.com/example/storage/commit/v${writes.length}` } })
    }
    if (path === 'access.json') return json(rolesFile('Tool Owner'))
    const folder = Object.keys(store).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${store[file].length}` })))
    if (store[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(store[path]).toString('base64'), sha: `s${store[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}
async function open(fail = {}, extra = {}) {
  const store = { ...files(), ...extra }
  const { page, context, errors } = await openPage(app, { init: signIn, width: 1440, height: 1000, ...(shots ? { scale: 2 } : {}) })
  const writes = await mockGitHub(context, store, fail)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, writes }
}
const shoot = async (target, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await target.screenshot({ path: `${shots}/${name}.png` }) }
const lines = async (table) => (await table.locator('tbody tr').allInnerTexts()).map((row) => row.replace(/\s+/g, ' ').trim())

// The Data tab of the editor: Pivot table, rows Epic then State, columns Start (by month).
async function buildPivot(page, dialog) {
  await dialog.getByLabel('Title').fill('Items by epic and state')
  await dialog.getByRole('radio', { name: 'Pivot table' }).check()
  await dialog.getByLabel('Rows by').selectOption({ label: 'Epic (Dropdown)' })
  await dialog.getByRole('button', { name: '＋ then by (rows)' }).click()
  await dialog.getByLabel('Rows then by (level 2)').selectOption({ label: 'State (Dropdown)' })
  await dialog.getByLabel('Columns by').selectOption({ label: 'Start' })
  // ＋ then by on the columns, then removed again: Stream → Start would be the nested columns.
  await dialog.getByRole('button', { name: '＋ then by (columns)' }).click()
  await dialog.getByLabel('Columns then by (level 2)').selectOption({ label: 'Stream' })
  await dialog.getByRole('button', { name: 'Move Stream up in the columns' }).click()
  assert.equal(await dialog.getByLabel('Columns by').inputValue(), 'c3', 'Stream moved first')
  await dialog.locator('.od-insight-preview .pivot-table').waitFor()
  await shoot(dialog, 'builder-nested-rows-and-columns')
  await dialog.getByRole('button', { name: 'Remove Stream from the columns' }).click()
  assert.equal(await dialog.getByLabel('Columns by').inputValue(), 'c4')
  assert.equal(await dialog.getByLabel('Columns then by (level 2)').count(), 0)
}
// The table: Platform first (4 rows), its states inside it; Mobile; Reporting.
const expected = [
  '▾ Platform 2 2 0 4', 'New 1 0 0 1', 'Active 1 1 0 2', 'Closed 0 1 0 1',
  '▾ Mobile 1 1 1 3', 'New 1 0 0 1', 'Active 0 1 1 2',
  '▾ Reporting 0 0 1 1', 'Closed 0 0 1 1', 'Total 3 3 2 8',
]
async function checkPivot(page, table, writes, path) {
  await table.locator('tbody tr').first().waitFor()
  assert.equal((await text(table.locator('thead'))).toLowerCase(), `Epic / State Jan ${year} Feb ${year} Mar ${year} Total`.toLowerCase(), 'the headings (shown in capitals)')
  assert.deepEqual(await lines(table), expected)
  // Collapse a group: its subtotal line stays, its rows go; Expand all brings them back.
  await table.getByRole('button', { name: 'Collapse Mobile' }).click()
  assert.deepEqual(await lines(table), [...expected.slice(0, 4), '▸ Mobile 1 1 1 3', ...expected.slice(7)])
  await shoot(table.locator('xpath=ancestor::*[contains(@class,"od-insight")][1]'), path === 'insights' ? 'pivot-subtotals-one-group-collapsed' : 'dashboard-pivot-one-group-collapsed')
  const scope = table.locator('xpath=ancestor::*[contains(@class,"od-pivot-nested")][1]')
  await scope.getByRole('button', { name: 'Collapse all' }).click()
  assert.deepEqual(await lines(table), ['▸ Platform 2 2 0 4', '▸ Mobile 1 1 1 3', '▸ Reporting 0 0 1 1', 'Total 3 3 2 8'])
  assert.equal(await scope.getByRole('button', { name: 'Collapse all' }).isDisabled(), true)
  await scope.getByRole('button', { name: 'Expand all' }).click()
  assert.deepEqual(await lines(table), expected)
  // Drill a subtotal: Platform in February — the rows of that epic and month.
  await table.getByRole('button', { name: `Platform · Feb ${year}: 2 — list the rows behind it` }).click()
  const drill = page.getByRole('dialog', { name: `Rows behind Platform · Feb ${year}` })
  await drill.waitFor()
  assert.match(await text(drill), /2 rows counted in Platform · Feb/)
  assert.deepEqual((await drill.locator('tbody tr').allInnerTexts()).map((row) => row.split('\t')[2]), ['Active', 'Closed'])
  await drill.locator('.modal-actions').getByRole('button', { name: 'Close' }).click()
  await drill.waitFor({ state: 'detached' })
  // Export: the flat table — Epic, State, Line, the months, Total; the subtotals marked; the Total last.
  await scope.getByRole('button', { name: 'Export ▾' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'CSV (.csv)' }).click()])
  const csv = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  assert.deepEqual(csv.slice(0, 3), [`Epic,State,Line,Jan ${year},Feb ${year},Mar ${year},Total`, 'Platform,,Subtotal,2,2,0,4', 'Platform,New,,1,0,0,1'])
  assert.equal(csv.at(-1), 'Total,,Total,3,3,2,8')
  assert.equal(csv.length, 11)
  void writes
}

test('TC-CHT-70: on a Table + Insights page a Tool Owner builds a Pivot table — rows Epic then State, columns by Month — closes and opens a group, lists the rows behind a subtotal and exports the flat table; saved in Git', async () => {
  const { page, context, errors, writes } = await open()
  await page.locator('.sidebar nav button', { hasText: 'Delivery plan' }).click()
  await page.getByRole('tab', { name: /^Insights/ }).click()
  await page.getByRole('button', { name: '＋ Add chart / table' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
  await buildPivot(page, dialog)
  await editorTab(dialog, 'Data')
  await dialog.getByRole('button', { name: 'Add chart' }).click()
  await dialog.waitFor({ state: 'detached' })
  const panel = page.locator('.od-insight', { has: page.locator('h2', { hasText: 'Items by epic and state' }) })
  await checkPivot(page, panel.locator('table.pivot-table'), writes, 'insights')
  await page.locator('.jobs-button', { hasText: 'Jobs done' }).waitFor()
  const saved = writes.filter((write) => write.path === 'on-demand/delivery-plan.json').at(-1)
  const { id, ...stored } = saved.data.insights[0]
  assert.ok(id)
  assert.deepEqual(stored, { title: 'Items by epic and state', type: 'table', category: 'c1', second: 'c4', rows2: 'c2', measure: 'count', sort: 'value' })
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-CHT-71: on an On-Demand Dashboard page the same Pivot table as a block — collapse, Expand all, a subtotal’s rows, Export; saved in the dashboard’s file', async () => {
  const { page, context, errors, writes } = await open()
  await page.locator('.sidebar nav button', { hasText: 'Plan board' }).click()
  await page.locator('header.topbar h1', { hasText: 'Plan board' }).waitFor()
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a block' })
  await dialog.getByLabel('Title').fill('Items by epic and state')
  await dialog.getByRole('radio', { name: 'Pivot table' }).check()
  await dialog.getByLabel('Data source').selectOption({ label: 'Delivery plan (table page)' })
  await dialog.getByLabel('Period filter on').selectOption('')
  await buildPivot(page, dialog)
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  const panel = page.locator('.dsh-block', { has: page.locator('h2', { hasText: 'Items by epic and state' }) })
  await checkPivot(page, panel.locator('table.pivot-table'), writes, 'dashboard')
  const saved = writes.filter((write) => write.path === 'dashboards/plan-board.json').at(-1).data.blocks[0]
  assert.deepEqual([saved.type, saved.category, saved.rows2, saved.second, saved.second2], ['table', 'c1', 'c2', 'c4', undefined])
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-CHT-72: the Y axis title the owners gave a chart ("Services") names its value in the legend and in the Table view — not "Count of rows"', async () => {
  const named = { ...plan, insights: [{ id: 'i1', title: 'Service distribution', type: 'bar', category: 'c1', measure: 'count', sort: 'value', options: { orientation: 'vertical', yTitle: 'Services' } }] }
  const { page, context, errors } = await open({}, { 'on-demand/delivery-plan.json': JSON.stringify(named) })
  await page.locator('.sidebar nav button', { hasText: 'Delivery plan' }).click()
  await page.getByRole('tab', { name: /^Insights/ }).click()
  const panel = page.locator('.od-insight', { has: page.locator('h2', { hasText: 'Service distribution' }) })
  assert.equal(await text(panel.getByRole('list', { name: 'Legend' })), 'Services')
  await panel.getByRole('button', { name: 'Table', exact: true }).click()
  assert.equal((await text(panel.locator('thead'))).toLowerCase(), 'epic services')
  assert.equal(await panel.getByText('Count of rows').count(), 0)
  assert.deepEqual(errors, [])
  await context.close()
})

test('TC-GIT-22: a save GitHub answers with HTTP 500 is tried once more by itself and saved; twice a 500: the change is kept with a plain message, and Retry saves it', async () => {
  const path = 'on-demand/delivery-plan.json'
  const { page, context, errors, writes } = await open({ [path]: [500] })
  await page.locator('.sidebar nav button', { hasText: 'Delivery plan' }).click()
  await page.getByRole('tab', { name: /^Insights/ }).click()
  const add = async (title) => {
    await page.getByRole('button', { name: '＋ Add chart / table' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
    await dialog.getByLabel('Title').fill(title)
    await dialog.getByRole('button', { name: 'Add chart' }).click()
    await dialog.waitFor({ state: 'detached' })
  }
  await add('First chart')
  await page.locator('.jobs-button', { hasText: 'Jobs done' }).waitFor()
  assert.deepEqual(writes.filter((write) => write.path === path).map((write) => write.data.insights.map((entry) => entry.title)), [['First chart']], 'written once, by the second try')
  assert.equal(await page.locator('.od-pending').count(), 0)
  // Twice a 500 (the save and its own second try): the change is kept, said in plain words; Retry writes it.
  // (the mock answers the next two PUTs of the page with HTTP 500)
  await context.unroute('https://api.github.com/**')
  const store = { ...files(), [path]: JSON.stringify(writes.at(-1).data) }
  const again = await mockGitHub(context, store, { [path]: [500, 500] })
  await add('Second chart')
  const bar = page.locator('.od-pending')
  await bar.waitFor()
  assert.match(await text(bar), /GitHub had a problem saving on-demand\/delivery-plan\.json \(HTTP 500\)\. Your change is kept here — press Retry in a minute\. If it keeps failing, the page file is \d+ KB/)
  assert.match(await text(page.locator('.od-insight', { has: page.locator('h2', { hasText: 'Second chart' }) }).first()), /Second chart/, 'still shown while kept')
  const saved = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('delivery-plan.json') && response.status() === 200)
  await bar.getByRole('button', { name: 'Retry' }).click()
  await saved
  await bar.waitFor({ state: 'detached' })
  assert.deepEqual(again.filter((write) => write.path === path).at(-1).data.insights.map((entry) => entry.title), ['First chart', 'Second chart'])
  assert.deepEqual(errors, [])
  await context.close()
})
