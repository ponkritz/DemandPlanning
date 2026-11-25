import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { infoText, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// The Insights tab's filter row (OND-50…OND-56) against a mocked GitHub: the owner sets up a period on Found on and a
// Category filter with Filters… (saved to Git with the page); the viewer narrows to a quarter and a value — every chart
// and a drill-down follow — the choice is kept after a reload and Reset filters clears it (TC-OND-40, UAT); a viewer
// without the setup right sees Filters… disabled with the reason, and still uses the row (TC-OND-45); a Currency filter
// in one chosen currency narrows the charts, which show that currency (TC-OND-46, OND-57…OND-60).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear()
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint', 'Label'] },
  { id: 'c2', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon'] },
  { id: 'c3', name: 'Cost (EUR)', type: 'number' },
  { id: 'c4', name: 'Found on', type: 'date' },
]
// This year: Rework 1200 (Jan), Scrap 600 (Feb), Scrap 400 (Mar), Complaint 500 (Mar), Scrap 300 (May), Rework 450 (Jul);
// a Scrap of last year and a Label without a date. Q1 + Scrap: CONQ-0002 and CONQ-0003, 1,000.
const rows = [
  ['Rework', ['Berlin'], '1200', `${year}-01-10`], ['Scrap', ['Leeds'], '600', `${year}-02-10`], ['Scrap', ['Berlin'], '400', `${year}-03-10`],
  ['Complaint', ['Lyon'], '500', `${year}-03-15`], ['Scrap', ['Lyon'], '300', `${year}-05-10`], ['Rework', ['Leeds'], '450', `${year}-07-10`],
  ['Scrap', ['Berlin'], '999', `${year - 1}-11-10`], ['Label', ['Berlin'], '100', ''],
].map(([category, sites, cost, date], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: category, c2: sites, c3: cost, ...(date ? { c4: date } : {}) } }))
const insights = [
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c3', sort: 'value' },
  { id: 'i2', title: 'Rows', type: 'kpi', category: '', measure: 'count', sort: 'value' },
]
const conq = (extra = {}) => ({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights, ...extra })

const gitStorage = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
}
// The data repository: files by path (text), the roles of `role`, every write recorded.
async function mockGitHub(context, files, role = 'Tool Owner') {
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
async function open(files, role, viewport = {}) {
  const { page, context, errors } = await openPage(app, { init: gitStorage, ...viewport })
  const writes = await mockGitHub(context, files, role)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, writes }
}
const insightsTab = (page) => page.getByRole('tab', { name: /^Insights/ })
const panel = (page, title) => page.locator('.od-insight', { has: page.locator('h2', { hasText: title }) })
const row = (page) => page.getByRole('group', { name: 'Insights filters' })
const scope = (page) => page.locator('.ins-scope')
async function openInsights(page) {
  await navigate(page, 'CoNQ')
  await insightsTab(page).click()
  await panel(page, 'Cost by category').locator('svg[role="img"]').waitFor()
}
// Tick options of a MultiSelect of the filter row, then close its list.
async function tick(page, label, options) {
  await row(page).getByRole('button', { name: new RegExp(`^${label}:`) }).click()
  const list = page.getByRole('listbox', { name: label })
  for (const option of options) await list.getByRole('checkbox', { name: option, exact: true }).check()
  await page.keyboard.press('Escape')
  await list.waitFor({ state: 'detached' })
}
const kpi = async (page) => text(panel(page, 'Rows').locator('.od-kpi strong'))
const bars = (page) => panel(page, 'Cost by category').locator('svg[role="img"] title').first().textContent()

test('TC-OND-40: the owner sets up a period and a Category filter; the viewer narrows every chart and a drill-down to Q1 and Scrap, the choice kept after a reload, Reset clears it', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq()) }
  const { page, context, errors, writes } = await open(files)
  await openInsights(page)
  // OND-56: without a setup there is no filter row and the charts count every row as before.
  assert.equal(await row(page).count(), 0)
  assert.equal(await kpi(page), '8')

  // OND-51: Filters… — the period on Found on and a Category filter; Save to Git saves them with the page at once.
  await page.getByRole('button', { name: 'Filters…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Filters of the Insights tab' })
  await dialog.getByLabel('Period on').selectOption({ label: 'Found on' })
  await dialog.getByRole('button', { name: '＋ Add filter' }).click()
  await dialog.getByLabel('Filter 1 column').selectOption({ label: 'Category (values)' })
  assert.equal(await dialog.getByLabel('Filter 1 column').locator('option', { hasText: 'Found on' }).count(), 0, 'the period column is not offered again')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  const saved = () => writes.filter((write) => write.path === 'on-demand/conq.json').at(-1)
  await row(page).waitFor()
  for (const until = Date.now() + 30000; !saved()?.data.insightFilters && Date.now() < until;) await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(saved().data.insightFilters, { period: 'c4', fields: ['c1'] })
  assert.match(saved().message, /^CoNQ: set up the filter row of the Insights/)
  assert.equal(saved().data.insights.length, 2, 'the charts are kept')

  // OND-53: the current year to start with — the row without a date and last year's left out.
  await scope(page).filter({ hasText: `Period on Found on: ${year} (whole year) · 6 of 8 rows counted (1 without a date in Found on left out).` }).waitFor()
  assert.equal(await kpi(page), '6')

  // OND-54: Q1 and Scrap — every chart, its Table view and the drill-down follow.
  await tick(page, 'Quarter', ['Q1'])
  await tick(page, 'Category', ['Scrap'])
  await scope(page).filter({ hasText: `Period on Found on: Q1 ${year} · Category: Scrap · 2 of 8 rows counted (1 without a date in Found on left out).` }).waitFor()
  assert.equal(await kpi(page), '2')
  assert.match(await bars(page), /^Cost by category: Scrap 1,000$/)
  const bar = panel(page, 'Cost by category')
  await bar.getByRole('button', { name: 'Table', exact: true }).click()
  assert.deepEqual(await bar.locator('tbody tr').evaluateAll((list) => list.map((entry) => entry.innerText.replace(/\s+/g, ' ').trim())), ['Scrap 1,000', 'Total 1,000'])
  await bar.getByRole('button', { name: 'Chart', exact: true }).click()
  await bar.locator('text.viz-row-label', { hasText: 'Scrap' }).click()
  const drill = page.getByRole('dialog', { name: 'Rows behind Scrap' })
  await drill.locator('tbody tr').first().waitFor()
  assert.deepEqual(await drill.locator('tbody tr').evaluateAll((list) => list.map((entry) => entry.innerText.trim().split(/\s/)[0])), ['CONQ-0002', 'CONQ-0003'])
  await drill.locator('.modal-actions').getByRole('button', { name: 'Close', exact: true }).click()
  await drill.waitFor({ state: 'detached' })

  // OND-55: the choice is the viewer's — kept after a reload (no write of the page for it).
  const pageWrites = writes.filter((write) => write.path === 'on-demand/conq.json').length
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await openInsights(page)
  await scope(page).filter({ hasText: `Q1 ${year} · Category: Scrap · 2 of 8 rows counted` }).waitFor()
  assert.equal(await kpi(page), '2')
  assert.equal(writes.filter((write) => write.path === 'on-demand/conq.json').length, pageWrites, 'a viewer’s choice is not written into the page')

  // Reset filters: the current year, no filter.
  await row(page).getByRole('button', { name: 'Reset filters' }).click()
  await scope(page).filter({ hasText: `Period on Found on: ${year} (whole year) · 6 of 8 rows counted` }).waitFor()
  assert.equal(await row(page).getByRole('button', { name: 'Reset filters' }).isDisabled(), true)
  assert.equal(await kpi(page), '6')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-OND-45: a viewer without the setup right sees Filters… disabled with the reason and still narrows the charts with the row', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq({ insightFilters: { period: 'c4', fields: ['c1', 'gone'] } })) }
  const { page, context, errors, writes } = await open(files, 'Team Member')
  await openInsights(page)
  const button = page.getByRole('button', { name: 'Filters…' })
  assert.equal(await button.isDisabled(), true)
  assert.match(await button.getAttribute('title'), /Your role does not allow “Set up On-Demand pages/)
  // A filter on a removed column is left out with a note; the rest of the row works.
  await page.locator('.notice', { hasText: 'Filter row: A filter’s column is no longer on the page (removed): the filter is left out.' }).waitFor()
  await tick(page, 'Category', ['Rework'])
  await scope(page).filter({ hasText: 'Category: Rework · 2 of 8 rows counted' }).waitFor()
  assert.equal(await kpi(page), '2')
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

// OND-57…OND-60: a Currency column in the row — one chosen currency, an amount range in it; a chart summing the
// column shows that currency, its drill-down the same rows. EUR: Scrap 150, Scrap 600, Rework 200, Complaint 450 (no
// code: the column's EUR), Label 80; USD: Rework 300, Scrap 120. EUR 100–500: Complaint 450, Rework 200, Scrap 150.
const moneyColumns = [columns[0], { id: 'c5', name: 'Cost', type: 'currency', currency: 'EUR' }]
const moneyRows = [['Scrap', '150 EUR'], ['Scrap', '600 EUR'], ['Rework', '200 EUR'], ['Complaint', '450'], ['Label', '80 EUR'], ['Rework', '300 USD'], ['Scrap', '120 USD']]
  .map(([category, cost], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: category, c5: cost } }))
const moneyInsights = [
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', measure: 'sum', value: 'c5', sort: 'value' },
  { id: 'i2', title: 'Rows', type: 'kpi', category: '', measure: 'count', sort: 'value' },
]

test('TC-OND-46: the owner adds a Currency filter; the viewer picks EUR 100–500 — a chart summing the column and its drill-down show the EUR rows in the range, the choice kept after a reload', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq({ columns: moneyColumns, rows: moneyRows, insights: moneyInsights })) }
  const { page, context, errors, writes } = await open(files)
  await openInsights(page)
  assert.equal(await kpi(page), '7')

  // OND-57: Filters… offers the Currency column; Save to Git saves it with the page.
  await page.getByRole('button', { name: 'Filters…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Filters of the Insights tab' })
  await dialog.getByRole('button', { name: '＋ Add filter' }).click()
  await dialog.getByLabel('Filter 1 column').selectOption({ label: 'Cost (one currency, from / to amount)' })
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  const saved = () => writes.filter((write) => write.path === 'on-demand/conq.json').at(-1)
  await row(page).waitFor()
  for (const until = Date.now() + 30000; !saved()?.data.insightFilters && Date.now() < until;) await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(saved().data.insightFilters, { fields: ['c5'] })

  // OND-58: the currencies of the column's rows, most first, then Any currency; EUR to start with, nothing filtered.
  const currency = row(page).getByLabel('Cost currency')
  assert.deepEqual(await currency.locator('option').allInnerTexts(), ['EUR (5 rows)', 'USD (2 rows)', 'Any currency'])
  assert.equal(await currency.inputValue(), 'EUR')
  await scope(page).filter({ hasText: 'No filter · 7 of 7 rows counted.' }).waitFor()

  // EUR 100–500: the KPI, the bar chart (in EUR), its Table view and the drill-down follow.
  await row(page).getByLabel('Cost at least').fill('100')
  await row(page).getByLabel('Cost at most').fill('500')
  await scope(page).filter({ hasText: 'Cost: EUR 100–500 · 3 of 7 rows counted.' }).waitFor()
  assert.equal(await kpi(page), '3')
  const bar = panel(page, 'Cost by category')
  // CHT-25: the chart's rows and currency are in its ⓘ.
  assert.match(await infoText(page, bar), /Currency: EUR \(3 rows\)\./)
  await bar.getByRole('button', { name: 'Table', exact: true }).click()
  assert.deepEqual(await bar.locator('tbody tr').evaluateAll((list) => list.map((entry) => entry.innerText.replace(/\s+/g, ' ').trim())), ['Complaint 450', 'Rework 200', 'Scrap 150', 'Total 800'])
  await bar.getByRole('button', { name: 'Chart', exact: true }).click()
  await bar.locator('text.viz-row-label', { hasText: 'Rework' }).click()
  const drill = page.getByRole('dialog', { name: 'Rows behind Rework' })
  await drill.locator('tbody tr').first().waitFor()
  assert.deepEqual(await drill.locator('tbody tr').evaluateAll((list) => list.map((entry) => entry.innerText.trim().split(/\s/)[0])), ['CONQ-0003'])
  await drill.locator('.modal-actions').getByRole('button', { name: 'Close', exact: true }).click()
  await drill.waitFor({ state: 'detached' })

  // OND-59: From above To is shown as an error and not applied.
  await row(page).getByLabel('Cost at least').fill('900')
  await row(page).getByRole('alert').filter({ hasText: 'Cost: From is above To: the amount range is not applied until it is put right.' }).waitFor()
  await scope(page).filter({ hasText: 'Cost: EUR 900–500 not applied (From is above To) · 7 of 7 rows counted.' }).waitFor()
  const minimum = row(page).getByLabel('Cost at least')
  await minimum.press('ControlOrMeta+a')
  await minimum.pressSequentially('100')
  await scope(page).filter({ hasText: 'Cost: EUR 100–500 · 3 of 7 rows counted.' }).waitFor()

  // OND-55: kept after a reload; OND-60: USD picked in the row — the chart shows USD to match.
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await openInsights(page)
  await scope(page).filter({ hasText: 'Cost: EUR 100–500 · 3 of 7 rows counted.' }).waitFor()
  assert.equal(await row(page).getByLabel('Cost at least').inputValue(), '100')
  await row(page).getByLabel('Cost currency').selectOption('USD')
  await scope(page).filter({ hasText: 'Cost: USD 100–500 · 2 of 7 rows counted.' }).waitFor()
  assert.match(await infoText(page, panel(page, 'Cost by category')), /Currency: USD \(2 rows\)\./)
  // Any currency: the amounts are cleared and disabled, nothing is filtered, the chart keeps its own currency.
  await row(page).getByLabel('Cost currency').selectOption({ label: 'Any currency' })
  await scope(page).filter({ hasText: 'No filter · 7 of 7 rows counted.' }).waitFor()
  assert.equal(await row(page).getByLabel('Cost at least').isDisabled(), true)
  // Several currencies in the chart: a visible warning names the one shown; ⓘ lists them.
  await panel(page, 'Cost by category').locator('.od-insight-warning', { hasText: 'Several currencies: EUR shown' }).waitFor()
  assert.match(await infoText(page, panel(page, 'Cost by category')), /shown: EUR/)
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
