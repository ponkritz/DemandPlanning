import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadSample, menuOf, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Dashboard pages (DSH-01…DSH-16) against a mocked GitHub: a Tool Owner adds a Dashboard page, builds it from a KPI
// tile, a bar chart and a summary table over a table page's rows and filters it by period (TC-DSH-01, UAT); a person
// without the right sees the dashboard with every builder button disabled and the reason (TC-DSH-09); "Set up On-Demand
// pages" alone no longer builds (TC-DSH-13); a summary table's export ends with its Total row (TC-DSH-14); a block is
// copied to another dashboard (TC-DSH-15); the Time Writing hours as a data source (TC-DSH-16, UAT).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear(), last = year - 1
const issues = {
  schema: 1, kind: 'on-demand-page', id: 'supplier-issues', name: 'Supplier issues', description: '', keyPrefix: 'SUPPLIER',
  columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Delay'] }, { id: 'c2', name: 'Cost', type: 'currency', currency: 'EUR' }, { id: 'c3', name: 'Found on', type: 'date' }],
  rows: [
    ['r1', 'Scrap', '1200 EUR', `${year}-02-10`], ['r2', 'Scrap', '300 EUR', `${year}-05-03`], ['r3', 'Rework', '450 EUR', `${year}-05-20`],
    ['r4', 'Delay', '80 EUR', `${year}-09-01`], ['r5', 'Rework', '999 EUR', `${last}-11-15`],
  ].map(([id, category, cost, found], index) => ({ id, seq: index + 1, cells: { c1: category, c2: cost, c3: found } })),
}
const signIn = (email) => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', email)
}
// The data repository: files by path (text), access.json with everyone in `role`, every write recorded.
async function mockGitHub(context, files, role) {
  const writes = []
  await context.route('https://dev.azure.com/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
  await context.route('https://api.github.com/**', (route) => {
    if (/^\/repos\/[^/]+\/[^/]+\/branches\/[^/]+$/.test(new URL(route.request().url()).pathname)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'main' }) }) // GIT-25: the branch can be read
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/repos/example/storage') return json({ visibility: 'private', permissions: { push: true } })
    if (url.pathname === '/repos/example/storage/commits') return json([])
    const match = /^\/repos\/example\/storage\/contents\/(.*)$/.exec(url.pathname)
    if (!match) return json({ message: 'Not Found' }, 404)
    const path = decodeURIComponent(match[1])
    if (request.method() === 'PUT') {
      if (path === '.demand-planning-write-check') return json({ message: 'Invalid request' }, 422)
      const body = JSON.parse(request.postData())
      files[path] = Buffer.from(body.content, 'base64').toString()
      writes.push({ path, message: body.message, data: JSON.parse(files[path]) })
      return json({ content: { sha: `v${writes.length}` }, commit: { html_url: `https://github.com/example/storage/commit/v${writes.length}` } })
    }
    if (path === 'access.json') return json(rolesFile(role))
    const folder = Object.keys(files).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${files[file].length}` })))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}
async function open(email, files, role, viewport = {}) {
  const { page, context, errors } = await openPage(app, { init: signIn, initArg: email, ...viewport })
  const writes = await mockGitHub(context, files, role)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, writes }
}
const lastWrite = (writes, path) => writes.filter((write) => write.path === path).at(-1)
const tile = (page, title) => page.locator('.metric-grid article', { has: page.locator('span', { hasText: title }) })
const panel = (page, title) => page.locator('.dsh-block', { has: page.locator('h2', { hasText: title }) })
// CON-107: the reason a builder action is disabled for a role without “Build On-Demand Dashboards”.
const buildReason = 'Your role does not allow “Build On-Demand Dashboards (blocks, tabs, filters — every dashboard)”. An Admin can change this in Admin → People & access → Role rights.'
const openDashboard = async (page, name) => { await page.locator('.sidebar nav button', { hasText: name }).click(); await page.locator('header.topbar h1', { hasText: name }).waitFor() }
const openJobs = async (page) => { const jobs = page.locator('.jobs-button'); await jobs.waitFor(); await jobs.click(); const list = page.getByRole('dialog', { name: 'Background jobs' }); await list.waitFor(); return list }
// Ticks values in a filter-row multi-select (its list closes with Escape).
async function pick(page, label, values) {
  await page.getByRole('button', { name: new RegExp(`^${label}: `) }).click()
  const list = page.getByRole('listbox', { name: label })
  for (const value of values) await list.getByRole('checkbox', { name: value, exact: true }).check()
  await page.keyboard.press('Escape')
  await list.waitFor({ state: 'detached' })
}

const dashboardFiles = () => ({
  'on-demand/supplier-issues.json': JSON.stringify(issues),
  'on-demand/quality-dashboard.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'quality-dashboard', name: 'Quality dashboard', description: 'Supplier issues at a glance', keyPrefix: 'QUALITYD', columns: [], rows: [] }),
  'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'supplier-issues': { type: 'table', group: 'on-demand', order: 1, icon: '⚑', owners: [] }, 'quality-dashboard': { type: 'dashboard', group: 'on-demand', order: 2, icon: '◔', owners: [] } } }),
  'dashboards/quality-dashboard.json': JSON.stringify({ schema: 1, kind: 'dashboard', id: 'quality-dashboard', tabs: [], filters: [], blocks: [
    { id: 'b1', title: 'Issues', type: 'kpi', source: 'page:supplier-issues', measure: 'count', sort: 'value', period: 'c3' },
    { id: 'b2', title: 'Issues by category', type: 'bar', source: 'page:supplier-issues', category: 'c1', measure: 'count', sort: 'value', period: 'c3' },
  ] }),
})

test('TC-DSH-01: a Tool Owner adds a Dashboard page, builds it from a KPI tile, a bar chart and a summary table over a table page’s rows and filters it by period — saved in Git', async () => {
  const files = { 'on-demand/supplier-issues.json': JSON.stringify(issues), 'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'supplier-issues': { type: 'table', group: 'on-demand', order: 1, icon: '⚑', owners: [] } } }) }
  const { page, context, errors, writes } = await open('tool.owner@example.com', files, 'Tool Owner')
  await navigate(page, 'Pages & reports')
  await page.locator('.pgb-pages tbody tr', { hasText: 'Supplier issues' }).waitFor()
  // ＋ Add page…: type Dashboard in On-Demand.
  await page.getByRole('button', { name: '＋ Add page…' }).click()
  const add = page.getByRole('dialog', { name: 'Add a page' })
  await add.getByRole('radio', { name: 'On-Demand Dashboard' }).check()
  await add.getByLabel('Page name', { exact: true }).fill('Quality dashboard')
  await add.getByLabel('Icon').selectOption('◔')
  await add.getByRole('button', { name: 'Add page' }).click()
  await add.waitFor({ state: 'detached' })
  await page.locator('header.topbar h1', { hasText: 'Quality dashboard' }).waitFor()
  await page.locator('.empty-state', { hasText: 'No blocks yet.' }).waitFor()
  assert.deepEqual(lastWrite(writes, 'menu-layout.json').data.pages['quality-dashboard'], { type: 'dashboard', group: 'on-demand', order: 2, icon: '◔', owners: [] })
  assert.equal(writes.some((write) => write.path.startsWith('dashboards/')), false, 'no dashboard file until the first block')

  // A KPI tile: Count of rows of Supplier issues, the period on Found on.
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  let dialog = page.getByRole('dialog', { name: 'Add a block' })
  await dialog.getByLabel('Title').fill('Issues')
  await dialog.getByLabel('Data source').selectOption({ label: 'Supplier issues (table page)' })
  assert.equal(await dialog.getByLabel('Period filter on').inputValue(), 'c3', 'the first Date column is the period column')
  await dialog.locator('.od-insight-preview .metric-grid article').waitFor()
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  await tile(page, 'Issues').waitFor()
  assert.match(await text(tile(page, 'Issues').locator('strong')), /^4$/, 'this year: 4 of the 5 rows')
  let saved = lastWrite(writes, 'dashboards/Quality dashboard--quality-dashboard.json')
  assert.match(saved.message, /\[saved \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\]( \[by [^\]]+\])?$/, 'a queued save (GIT-17)')
  assert.deepEqual(saved.data.blocks.map((entry) => [entry.type, entry.title, entry.source, entry.measure, entry.period]), [['kpi', 'Issues', 'page:supplier-issues', 'count', 'c3']])

  // A bar chart: Count of rows by Category.
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  dialog = page.getByRole('dialog', { name: 'Add a block' })
  await dialog.getByLabel('Title').fill('Issues by category')
  await dialog.getByRole('radio', { name: 'Bar chart' }).check()
  await dialog.getByLabel('Data source').selectOption({ label: 'Supplier issues (table page)' })
  await dialog.getByLabel('Categories by').selectOption({ label: 'Category (Dropdown)' })
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  const bars = panel(page, 'Issues by category')
  await bars.locator('.viz-root').waitFor()
  assert.equal(await bars.getByRole('button', { name: 'Table', exact: true }).count(), 1, 'the chart frame has the Table toggle')

  // A summary table: Sum of Cost by Category, largest first.
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  dialog = page.getByRole('dialog', { name: 'Add a block' })
  await dialog.getByLabel('Title').fill('Cost by category')
  await dialog.getByRole('radio', { name: 'Pivot table' }).check()
  await dialog.getByLabel('Data source').selectOption({ label: 'Supplier issues (table page)' })
  await dialog.getByLabel('Rows by').selectOption({ label: 'Category (Dropdown)' })
  await dialog.getByLabel('Measure').selectOption('sum')
  await dialog.getByLabel('Of the Number column').selectOption({ label: 'Cost (Currency)' })
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  const table = panel(page, 'Cost by category')
  await table.locator('table tbody tr').first().waitFor()
  assert.deepEqual((await table.locator('table tbody tr').allInnerTexts()).map((row) => row.replace(/\s+/g, ' ').trim()), ['Scrap 1,500', 'Rework 450', 'Delay 80', 'Total 2,030'])
  assert.deepEqual(lastWrite(writes, 'dashboards/Quality dashboard--quality-dashboard.json').data.blocks.map((entry) => entry.title), ['Issues', 'Issues by category', 'Cost by category'])

  // The period: last year only — the tile and the table follow; Reset filters goes back to this year.
  await pick(page, 'Year', [String(last)])
  await page.locator('.dsh-scope', { hasText: `${last} (whole year)` }).waitFor()
  assert.match(await text(tile(page, 'Issues').locator('strong')), /^1$/)
  assert.deepEqual((await table.locator('table tbody tr').allInnerTexts()).map((row) => row.replace(/\s+/g, ' ').trim()), ['Rework 999', 'Total 999'])
  // A month without rows: "No data for this selection."
  await pick(page, 'Month', ['Jan'])
  await table.locator('.empty-state', { hasText: 'No data for this selection.' }).waitFor()
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await page.locator('.dsh-scope', { hasText: `${year} (whole year)` }).waitFor()
  assert.match(await text(tile(page, 'Issues').locator('strong')), /^4$/)
  // Remembered for the person: the period comes back after a reload.
  // (the personal views are saved to Git a moment after the change: wait for that save, then reload)
  const remembered = page.waitForRequest((request) => request.method() === 'PUT' && request.url().includes('personal-views') && Buffer.from(JSON.parse(request.postData()).content, 'base64').toString().includes(`${year}-Q2`))
  await pick(page, 'Quarter', ['Q2'])
  await remembered
  await page.reload()
  await page.locator('.sidebar nav button', { hasText: 'Quality dashboard' }).click()
  await page.locator('.dsh-scope', { hasText: `Apr ${year}, May ${year}, Jun ${year}` }).waitFor()
  assert.match(await text(tile(page, 'Issues').locator('strong')), /^2$/)
  assert.equal(JSON.stringify(writes).includes('test-token'), false, 'no token in the data repository')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-DSH-09: a viewer without the right sees the dashboard read only, every builder button disabled with the reason', async () => {
  const files = dashboardFiles()
  const { page, context, errors, writes } = await open('someone@example.com', files, 'Team Member')
  await page.locator('.sidebar nav button', { hasText: 'Quality dashboard' }).click()
  await page.locator('header.topbar h1', { hasText: 'Quality dashboard' }).waitFor()
  await tile(page, 'Issues').waitFor()
  assert.match(await text(tile(page, 'Issues').locator('strong')), /^4$/)
  await panel(page, 'Issues by category').locator('.viz-root').waitFor()
  const reason = buildReason
  // DSH-13: the page's actions in its ⋯ menu, each disabled with its reason as its tooltip; no block ⋯ menus.
  const pageMenu = await menuOf(page, 'page Quality dashboard')
  for (const name of ['＋ Add block…', 'Arrange blocks…', 'Arrange on the page', 'Tabs and filters…']) {
    const item = pageMenu.getByRole('menuitem', { name })
    assert.equal(await item.isDisabled(), true, `${name} is disabled`)
    assert.equal(await item.getAttribute('title'), reason)
  }
  for (const name of ['Rename page…', 'Hide page', 'Delete page…']) assert.equal(await pageMenu.getByRole('menuitem', { name }).isDisabled(), true, `${name} is disabled`)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('button', { name: 'More actions: Issues by category' }).count(), 0)
  assert.equal(await text(page.locator('.dashboard-page .write-blocked').first()), reason)
  // The viewer still filters for themselves.
  await pick(page, 'Year', [String(last)])
  await page.locator('.dsh-scope', { hasText: `${last} (whole year)` }).waitFor()
  assert.match(await text(tile(page, 'Issues').locator('strong')), /^1$/)
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-DSH-13: “Set up On-Demand pages” alone no longer builds a dashboard — an Admin sees the builder actions disabled with “Build On-Demand Dashboards”', async () => {
  const { page, context, errors, writes } = await open('admin@example.com', dashboardFiles(), 'Admin')
  await openDashboard(page, 'Quality dashboard')
  await tile(page, 'Issues').waitFor()
  const pageMenu = await menuOf(page, 'page Quality dashboard')
  for (const name of ['＋ Add block…', 'Arrange blocks…', 'Tabs and filters…']) {
    const item = pageMenu.getByRole('menuitem', { name })
    assert.equal(await item.isDisabled(), true, `${name} is disabled`)
    assert.equal(await item.getAttribute('title'), buildReason)
  }
  // The page builder's own actions (rename) still follow "Set up On-Demand pages" in the On-Demand group (PGB-10).
  assert.equal(await pageMenu.getByRole('menuitem', { name: 'Rename page…' }).isDisabled(), false)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('button', { name: 'More actions: Issues by category' }).count(), 0, 'no block ⋯ menus')
  assert.equal(await text(page.locator('.dashboard-page .write-blocked').first()), buildReason)
  assert.equal(writes.length, 0)
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-DSH-14: a summary table’s Export (CSV) ends with its Total row, labelled Total', async () => {
  const files = dashboardFiles()
  const board = JSON.parse(files['dashboards/quality-dashboard.json'])
  board.blocks.push({ id: 'b3', title: 'Cost by category', type: 'table', source: 'page:supplier-issues', category: 'c1', measure: 'sum', value: 'c2', sort: 'value', period: 'c3' })
  files['dashboards/quality-dashboard.json'] = JSON.stringify(board)
  const { page, context, errors } = await open('someone@example.com', files, 'Team Member')
  await openDashboard(page, 'Quality dashboard')
  const table = panel(page, 'Cost by category')
  await table.locator('table tbody tr.matrix-total').waitFor()
  await table.getByRole('button', { name: /^Export/ }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'CSV (.csv)' }).click()])
  const lines = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean)
  assert.deepEqual(lines.slice(1), ['Scrap,1500', 'Rework,450', 'Delay,80', 'Total,2030'], 'every row, then the Total row')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-DSH-15: Copy to… copies a block to another dashboard (the first tab when no tab has its name, said) and duplicates it here — each saved to the dashboard’s file', async () => {
  const files = dashboardFiles()
  files['on-demand/second-board.json'] = JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'second-board', name: 'Second board', description: '', keyPrefix: 'SECONDB', columns: [], rows: [] })
  files['dashboards/second-board.json'] = JSON.stringify({ schema: 1, kind: 'dashboard', id: 'second-board', tabs: [{ id: 't1', name: 'Summary' }], filters: [], blocks: [] })
  const layout = JSON.parse(files['menu-layout.json']); layout.pages['second-board'] = { type: 'dashboard', group: 'on-demand', order: 3, icon: '◔', owners: [] }
  files['menu-layout.json'] = JSON.stringify(layout)
  const quality = JSON.parse(files['dashboards/quality-dashboard.json']); quality.tabs = [{ id: 'q1', name: 'Overview' }]
  files['dashboards/quality-dashboard.json'] = JSON.stringify(quality)
  const { page, context, errors, writes } = await open('tool.owner@example.com', files, 'Tool Owner')
  await openDashboard(page, 'Quality dashboard')
  await panel(page, 'Issues by category').locator('.viz-root').waitFor()
  // To another dashboard: the pop-up lists This dashboard and the dashboards the person may build.
  await (await menuOf(page, 'Issues by category')).getByRole('menuitem', { name: 'Copy to…' }).click()
  let dialog = page.getByRole('dialog', { name: 'Copy the block' })
  assert.deepEqual(await dialog.getByLabel('Copy to').locator('option').allInnerTexts(), ['This dashboard', 'Second board'])
  await dialog.getByLabel('Copy to').selectOption({ label: 'Second board' })
  await dialog.getByRole('button', { name: 'Copy block' }).click()
  await dialog.waitFor({ state: 'detached' })
  const copied = lastWrite(writes, 'dashboards/second-board.json')
  assert.equal(copied.data.blocks.length, 1)
  const [block] = copied.data.blocks
  assert.notEqual(block.id, 'b2', 'a new id')
  assert.deepEqual([block.title, block.type, block.source, block.category, block.measure, block.period, block.tab], ['Issues by category', 'bar', 'page:supplier-issues', 'c1', 'count', 'c3', undefined], 'its settings and data source; the first tab')
  const jobs = await openJobs(page)
  await jobs.getByText('Second board has no tab named “Overview”: the block is on its first tab, Summary.', { exact: false }).waitFor()
  assert.match(await text(jobs), /Copy block · Issues by category → Second board/)
  await page.locator('.jobs-button').click()
  await jobs.waitFor({ state: 'detached' })
  // A duplicate on this dashboard.
  await (await menuOf(page, 'Issues by category')).getByRole('menuitem', { name: 'Copy to…' }).click()
  dialog = page.getByRole('dialog', { name: 'Copy the block' })
  await dialog.getByRole('button', { name: 'Copy block' }).click()
  await dialog.waitFor({ state: 'detached' })
  await panel(page, 'Issues by category (copy)').locator('.viz-root').waitFor()
  assert.deepEqual(lastWrite(writes, 'dashboards/quality-dashboard.json').data.blocks.map((entry) => entry.title), ['Issues', 'Issues by category', 'Issues by category (copy)'])
  // The other dashboard shows the copy.
  await openDashboard(page, 'Second board')
  await panel(page, 'Issues by category').locator('.viz-root').waitFor()
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

const hoursBoard = () => {
  const files = dashboardFiles()
  files['dashboards/quality-dashboard.json'] = JSON.stringify({ schema: 1, kind: 'dashboard', id: 'quality-dashboard', tabs: [], filters: [], blocks: [
    { id: 'b1', title: 'Issues', type: 'kpi', source: 'page:supplier-issues', measure: 'count', sort: 'value', period: 'c3' },
    { id: 'h1', title: 'Planned hours', type: 'kpi', source: 'hours:time-writing', measure: 'sum', value: 'tw-planned', sort: 'value', period: 'tw-month' },
    { id: 'h2', title: 'Booked hours by team member', type: 'table', source: 'hours:time-writing', category: 'tw-person', measure: 'sum', value: 'tw-booked', sort: 'value', period: 'tw-month' },
  ] })
  return files
}

test('TC-DSH-16: the Time Writing hours as a data source — planned and booked hours by team member over the period; “Not available for your role” without Team overview', async () => {
  // A Tool Owner with Time Writing data (the synthetic sample) sees the hours.
  const { page, context, errors } = await open('tool.owner@example.com', hoursBoard(), 'Tool Owner')
  await loadSample(page)
  await openDashboard(page, 'Quality dashboard')
  const planned = tile(page, 'Planned hours')
  await planned.locator('strong', { hasText: /^[\d,.]+$/ }).waitFor()
  assert.ok(Number((await text(planned.locator('strong'))).replace(/,/g, '')) > 0, 'planned hours of this year')
  const table = panel(page, 'Booked hours by team member')
  await table.locator('table tbody tr.matrix-total').waitFor()
  assert.ok(await table.locator('table tbody tr').count() > 2, 'a row per team member and the Total')
  assert.equal(await table.getByRole('cell', { name: 'Chen Wei', exact: true }).count(), 1)
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()

  // A Team Member (no Team insights) sees the blocks over the hours as not available; the others are drawn.
  const viewer = await open('someone@example.com', hoursBoard(), 'Team Member')
  await openDashboard(viewer.page, 'Quality dashboard')
  await tile(viewer.page, 'Issues').locator('strong', { hasText: '4' }).waitFor()
  await tile(viewer.page, 'Planned hours').locator('.dsh-problem', { hasText: 'Not available for your role.' }).waitFor()
  await panel(viewer.page, 'Booked hours by team member').locator('.notice', { hasText: 'Not available for your role.' }).waitFor()
  assert.equal(await panel(viewer.page, 'Booked hours by team member').locator('table').count(), 0, 'no hours shown')
  assert.deepEqual(viewer.errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await viewer.context.close()
})

test('TC-DSH-16: a builder adds a block over the Time Writing hours in the block pop-up — only its settings are saved', async () => {
  const { page, context, errors, writes } = await open('tool.owner@example.com', dashboardFiles(), 'Tool Owner')
  await openDashboard(page, 'Quality dashboard')
  await tile(page, 'Issues').waitFor()
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a block' })
  await dialog.getByLabel('Title').fill('Booked by stream')
  await dialog.getByRole('radio', { name: 'Bar chart' }).check()
  await dialog.getByLabel('Data source').selectOption({ label: 'Time Writing hours (as in Team overview)' })
  assert.equal(await dialog.getByLabel('Measure').inputValue(), 'sum', 'hours are summed, never counted')
  await dialog.getByLabel('Categories by').selectOption({ label: 'Stream (Dropdown)' })
  await dialog.getByLabel('Of the Number column').selectOption({ label: 'Booked hours' })
  assert.equal(await dialog.getByLabel('Period filter on').inputValue(), 'tw-month')
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  await panel(page, 'Booked by stream').waitFor()
  const saved = lastWrite(writes, 'dashboards/quality-dashboard.json').data.blocks.at(-1)
  assert.deepEqual([saved.source, saved.category, saved.measure, saved.value, saved.period], ['hours:time-writing', 'tw-stream', 'sum', 'tw-booked', 'tw-month'])
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
