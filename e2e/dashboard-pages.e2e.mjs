import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Dashboard pages (DSH-01…DSH-14) against a mocked GitHub: a Tool Owner adds a Dashboard page, builds it from a KPI
// tile, a bar chart and a summary table over a table page's rows and filters it by period (TC-DSH-01, UAT); a person
// without the right sees the dashboard with every builder button disabled and the reason (TC-DSH-09).
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
  await navigate(page, 'Pages & menu')
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
  let saved = lastWrite(writes, 'dashboards/quality-dashboard.json')
  assert.match(saved.message, /\[saved \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\]$/, 'a queued save (GIT-17)')
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
  await dialog.getByRole('radio', { name: 'Summary table' }).check()
  await dialog.getByLabel('Data source').selectOption({ label: 'Supplier issues (table page)' })
  await dialog.getByLabel('Rows by').selectOption({ label: 'Category (Dropdown)' })
  await dialog.getByLabel('Measure').selectOption('sum')
  await dialog.getByLabel('Of the Number column').selectOption({ label: 'Cost (Currency)' })
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  const table = panel(page, 'Cost by category')
  await table.locator('table tbody tr').first().waitFor()
  assert.deepEqual((await table.locator('table tbody tr').allInnerTexts()).map((row) => row.replace(/\s+/g, ' ').trim()), ['Scrap 1,500', 'Rework 450', 'Delay 80', 'Total 2,030'])
  assert.deepEqual(lastWrite(writes, 'dashboards/quality-dashboard.json').data.blocks.map((entry) => entry.title), ['Issues', 'Issues by category', 'Cost by category'])

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
  const reason = 'Your role does not allow “Set up On-Demand pages (pages, columns, options)”. An Admin can change this in Admin → People & roles → Role rights.'
  for (const name of ['＋ Add block…', 'Arrange blocks…', 'Tabs and filters…']) {
    const button = page.getByRole('button', { name })
    assert.equal(await button.isDisabled(), true, `${name} is disabled`)
    assert.equal(await button.getAttribute('title'), reason)
  }
  for (const name of ['Rename page…', 'Hide page', 'Delete page…']) assert.equal(await page.getByRole('button', { name }).isDisabled(), true, `${name} is disabled`)
  assert.equal(await text(page.locator('.dashboard-page .write-blocked').first()), reason)
  // The viewer still filters for themselves.
  await pick(page, 'Year', [String(last)])
  await page.locator('.dsh-scope', { hasText: `${last} (whole year)` }).waitFor()
  assert.match(await text(tile(page, 'Issues').locator('strong')), /^1$/)
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
