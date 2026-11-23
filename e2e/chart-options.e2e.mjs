import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Chart options (CHT-01…CHT-12) against a mocked GitHub: on CoNQ's Insights tab the owner makes a Pareto and a stacked
// horizontal bar with Top 5 + Other and a target line, pins a colour, drills into a bar and a stack, sets the widths and
// saves to Git (TC-CHT-01, UAT); a viewer without the setup right sees them — and a Dashboard Pareto block — read only,
// and drills into them (TC-CHT-02).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear()
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint', 'Label', 'Seal', 'Late', 'Damage'] },
  { id: 'c2', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon'] },
  { id: 'c3', name: 'Cost (EUR)', type: 'number' },
  { id: 'c4', name: 'Found on', type: 'date' },
]
// Sum of cost: Rework 1950, Scrap 1000, Complaint 700, Label 350, Seal 250, Late 150, Damage 100 (total 4500): the top 5
// and "Other" (Late + Damage = 250); cumulative 43.3%, 65.6%, 81.1%, 88.9%, 94.4%, 100%.
const rows = [
  ['Rework', ['Berlin', 'Lyon'], '1200'], ['Rework', ['Berlin'], '450'], ['Rework', ['Leeds'], '300'], ['Scrap', ['Leeds'], '600'], ['Scrap', ['Berlin'], '400'],
  ['Complaint', ['Lyon'], '500'], ['Complaint', ['Berlin'], '200'], ['Label', ['Leeds'], '350'], ['Seal', ['Berlin'], '250'], ['Late', ['Lyon'], '150'], ['Damage', ['Berlin'], '100'],
].map(([category, sites, cost], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: category, c2: sites, c3: cost, c4: `${year}-0${1 + index % 9}-10` } }))
const conq = (insights = []) => ({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights })

const gitStorage = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
}
// The data repository: files by path (text), the roles of `role`, every write recorded.
async function mockGitHub(context, files, role = 'Tool Owner') {
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
async function open(files, role, viewport = {}) {
  const { page, context, errors } = await openPage(app, { init: gitStorage, ...viewport })
  const writes = await mockGitHub(context, files, role)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, writes }
}
const insightsTab = (page) => page.getByRole('tab', { name: /^Insights/ })
const panel = (page, title) => page.locator('.od-insight', { has: page.locator('h2', { hasText: title }) })
// The rows of the drill-down pop-up's table, as text.
async function drilled(page, title) {
  const dialog = page.getByRole('dialog', { name: title })
  await dialog.locator('tbody tr').first().waitFor()
  const list = await dialog.locator('tbody tr').evaluateAll((items) => items.map((row) => row.innerText.replace(/\s+/g, ' ').trim()))
  return { dialog, list }
}
async function closeDrill(dialog) {
  await dialog.locator('.modal-actions').getByRole('button', { name: 'Close', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

test('TC-CHT-01: the owner makes a Pareto and a stacked horizontal bar with Top 5 + Other and a target line, pins a colour, drills into a bar, sets the widths and saves to Git', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq()) }
  const { page, context, errors, writes } = await open(files)
  await navigate(page, 'CoNQ')
  await insightsTab(page).click()
  await page.getByText('No charts or tables yet.').waitFor()

  // A Pareto of Sum of Cost by Category: Top 5 + Other, a target line, full width.
  await page.getByRole('button', { name: '＋ Add chart / table' }).click()
  let dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
  await dialog.getByLabel('Title').fill('Cost Pareto')
  await dialog.getByRole('radio', { name: 'Pareto' }).check()
  await dialog.getByLabel('Categories by').selectOption({ label: 'Category (Dropdown)' })
  await dialog.getByLabel('Measure').selectOption('sum')
  await dialog.getByLabel('Of the Number column').selectOption({ label: 'Cost (EUR)' })
  // Options the Pareto does not take are not offered.
  assert.equal(await dialog.getByLabel('Orientation').count(), 0)
  assert.equal(await dialog.getByLabel('Stacked by').count(), 0)
  await dialog.getByLabel('Show', { exact: true }).selectOption('5')
  await dialog.getByLabel('Target line value').fill('1000')
  await dialog.getByLabel('Target line label').fill('Budget')
  await dialog.getByLabel('Width', { exact: true }).selectOption('full')
  const preview = dialog.getByRole('region', { name: 'Preview' })
  await preview.locator('svg[role="img"] title', { hasText: 'Other 250 (cumulative 100%)' }).waitFor({ state: 'attached' })
  await dialog.getByRole('button', { name: 'Add chart' }).click()
  await dialog.waitFor({ state: 'detached' })

  // A stacked horizontal bar of Sum of Cost by Category, stacked by Sites: Top 5 + Other, a target, Berlin pinned, half width.
  await page.getByRole('button', { name: '＋ Add chart / table' }).click()
  dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
  await dialog.getByLabel('Title').fill('Cost by category and site')
  await dialog.getByRole('radio', { name: 'Bar / column' }).check()
  await dialog.getByLabel('Categories by').selectOption({ label: 'Category (Dropdown)' })
  await dialog.getByLabel('Stacked by').selectOption({ label: 'Sites' })
  await dialog.getByLabel('Measure').selectOption('sum')
  await dialog.getByLabel('Of the Number column').selectOption({ label: 'Cost (EUR)' })
  assert.equal(await dialog.getByLabel('Orientation').inputValue(), 'horizontal', 'horizontal bars, as before, unless chosen')
  await dialog.getByLabel('Show', { exact: true }).selectOption('5')
  await dialog.getByLabel('Target line value').fill('800')
  await dialog.getByLabel('Target line label').fill('Limit')
  await dialog.getByLabel('Width', { exact: true }).selectOption('half')
  await dialog.getByLabel('Colour of Berlin').selectOption('3')
  await dialog.getByRole('button', { name: 'Add chart' }).click()
  await dialog.waitFor({ state: 'detached' })

  // The Pareto: largest first, "Other" last, the cumulative share up to 100%, the 80% and target lines; full width.
  const pareto = panel(page, 'Cost Pareto')
  await pareto.locator('svg[role="img"]').waitFor()
  assert.match(await pareto.locator('svg[role="img"] title').first().textContent(), /^Cost Pareto: Rework 1,950 \(cumulative 43%\), Scrap 1,000 \(cumulative 66%\), Complaint 700 \(cumulative 81%\), Label 350 \(cumulative 89%\), Seal 250 \(cumulative 94%\), Other 250 \(cumulative 100%\)$/)
  assert.match(await text(pareto.locator('.viz-legend')), /Cumulative share \(%\).*80%.*Budget \(1,000\)/)
  assert.equal(await pareto.evaluate((element) => element.classList.contains('od-insight-full')), true)
  assert.equal(await panel(page, 'Cost by category and site').evaluate((element) => element.classList.contains('od-insight-full')), false)
  // Its Table view: value, share and cumulative share.
  await pareto.getByRole('button', { name: 'Table', exact: true }).click()
  assert.deepEqual(await pareto.locator('tbody tr').evaluateAll((list) => list.map((row) => row.innerText.replace(/\s+/g, ' ').trim())).then((list) => list.slice(0, 2)), ['Rework 1,950 43.3 43.3', 'Scrap 1,000 22.2 65.6'])
  await pareto.getByRole('button', { name: 'Chart', exact: true }).click()

  // The stacked bar: Top 5 + Other, Berlin in the pinned colour, the target line.
  const bar = panel(page, 'Cost by category and site')
  await bar.locator('svg[role="img"]').waitFor()
  assert.deepEqual(await bar.locator('text.viz-row-label').allTextContents(), ['Rework', 'Scrap', 'Complaint', 'Label', 'Seal', 'Other'].map((label) => `${label}${label}`))
  assert.ok(await bar.locator('path[fill="var(--viz-series-3)"]').count() > 0, 'Berlin is drawn in colour 3')
  assert.match(await bar.locator('.viz-target-group').textContent(), /Limit 800/)
  // Drill down: a click on a bar lists the rows behind it; a click on a stack the rows of that value.
  await bar.locator('text.viz-row-label', { hasText: 'Rework' }).click()
  let rowsBehind = await drilled(page, 'Rows behind Rework')
  assert.deepEqual(rowsBehind.list.map((row) => row.split(' ')[0]), ['CONQ-0001', 'CONQ-0002', 'CONQ-0003'])
  assert.equal(await rowsBehind.dialog.getByRole('button', { name: /^Edit/ }).count(), 0, 'read only')
  await closeDrill(rowsBehind.dialog)
  await bar.locator('path[fill="var(--viz-series-3)"]').first().click()
  rowsBehind = await drilled(page, 'Rows behind Rework · Berlin')
  assert.equal(rowsBehind.list.length, 2)
  await closeDrill(rowsBehind.dialog)
  // … and "Other" lists the rows summed into it; with the keyboard: Arrow keys, then Enter.
  await pareto.locator('svg[role="img"]').focus()
  for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  rowsBehind = await drilled(page, 'Rows behind Other')
  assert.deepEqual(rowsBehind.list.map((row) => row.split(' ')[0]), ['CONQ-0010', 'CONQ-0011'])
  await closeDrill(rowsBehind.dialog)

  // Each chart change is saved to Git at once (OND-30): the options and the colour pin are in the page file; a chart
  // without options has none. Wait until the last save holding both charts and the pin has reached Git.
  const saved = () => writes.filter((write) => write.path === 'on-demand/conq.json').at(-1)?.data
  const done = () => saved()?.insights?.length === 2 && saved()?.colors?.Berlin === 3 && saved().insights.every((item) => item.options?.size)
  for (const until = Date.now() + 30000; !done() && Date.now() < until;) await new Promise((resolve) => setTimeout(resolve, 50))
  const file = saved()
  assert.deepEqual(file.insights.map(({ title, type, second, options }) => ({ title, type, second, options })), [
    { title: 'Cost Pareto', type: 'pareto', second: undefined, options: { top: 5, target: { value: 1000, label: 'Budget' }, size: 'full' } },
    { title: 'Cost by category and site', type: 'bar', second: 'c2', options: { top: 5, target: { value: 800, label: 'Limit' }, size: 'half' } },
  ])
  assert.deepEqual(file.colors, { Berlin: 3 })
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-CHT-02: a viewer without the setup right sees the charts and a Dashboard Pareto read only, and drills into them', async () => {
  const insights = [
    { id: 'i1', title: 'Cost Pareto', type: 'pareto', category: 'c1', measure: 'sum', value: 'c3', sort: 'value', options: { top: 5, target: { value: 1000, label: 'Budget' }, size: 'full' } },
    { id: 'i2', title: 'Cost by category and site', type: 'bar', category: 'c1', second: 'c2', measure: 'sum', value: 'c3', sort: 'value', options: { top: 5, orientation: 'vertical', target: { value: 800, label: 'Limit' } } },
  ]
  const files = {
    'on-demand/conq.json': JSON.stringify({ ...conq(insights), colors: { Berlin: 3 } }),
    'on-demand/cost-dashboard.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'cost-dashboard', name: 'Cost dashboard', description: '', keyPrefix: 'COSTD', columns: [], rows: [] }),
    'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'cost-dashboard': { type: 'dashboard', group: 'on-demand', order: 2, icon: '◔', owners: [] } } }),
    'dashboards/cost-dashboard.json': JSON.stringify({ schema: 1, kind: 'dashboard', id: 'cost-dashboard', tabs: [], filters: [], blocks: [
      { id: 'b1', title: 'Pareto of cost', type: 'pareto', source: 'page:conq', category: 'c1', measure: 'sum', value: 'c3', sort: 'value', options: { top: 3, size: 'full' } },
    ] }),
  }
  const { page, context, errors, writes } = await open(files, 'Team Member')
  await navigate(page, 'CoNQ')
  await insightsTab(page).click()
  const pareto = panel(page, 'Cost Pareto')
  await pareto.locator('svg[role="img"]').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Edit Cost Pareto', exact: true }).isDisabled(), true)
  // The stacked bar as vertical columns, read only: a click lists the rows.
  const bar = panel(page, 'Cost by category and site')
  await bar.locator('svg[role="img"]').waitFor()
  assert.ok(await bar.locator('path[fill="var(--viz-series-3)"]').count() > 0, 'the page’s colour pin applies for everyone')
  await bar.locator('rect.viz-row-hit').first().click({ position: { x: 4, y: 4 } })
  const rowsBehind = await drilled(page, 'Rows behind Rework')
  assert.equal(rowsBehind.list.length, 3)
  await closeDrill(rowsBehind.dialog)

  // The Dashboard: the same Pareto as a block, Top 3 + Other, full width; a click on "Other" lists its rows.
  await page.locator('.sidebar nav button', { hasText: 'Cost dashboard' }).click()
  const block = page.locator('.dsh-block', { has: page.locator('h2', { hasText: 'Pareto of cost' }) })
  await block.locator('svg[role="img"]').waitFor()
  assert.equal(await block.evaluate((element) => element.classList.contains('od-insight-full')), true)
  assert.match(await block.locator('svg[role="img"] title').first().textContent(), /Other 850 \(cumulative 100%\)$/)
  await block.locator('svg[role="img"]').focus()
  for (let step = 0; step < 4; step++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  const other = await drilled(page, 'Rows behind Other')
  assert.equal(other.list.length, 4)
  await closeDrill(other.dialog)
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
