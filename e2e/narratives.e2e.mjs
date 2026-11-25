import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { editorTab, infoText, menuOf, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Narratives (CHT-60…CHT-69) against a mocked GitHub: on CoNQ's Insights tab the owner adds a Narrative with the total,
// the highest category and a warning rule "if Sum of Cost > 20000 then 'CoNQ cost above budget: {value}'", saved to Git;
// the filter row narrows it and the sentences change; the PDF print view includes it (TC-CHT-56, UAT). A viewer sees it
// — and a Dashboard Narrative block — read only, the tone read out in words (TC-CHT-57).
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear()
const columns = [
  { id: 'c1', name: 'Department', type: 'dropdown', options: ['Post-Production', 'Assembly', 'Design'] },
  { id: 'c2', name: 'Cost', type: 'currency', currency: 'EUR' },
  { id: 'c3', name: 'Found on', type: 'date' },
]
// This year: Post-Production 12,000 + 8,000 + 6,000, Assembly 12,000, Design 5,000 + 2,000 — 45,000 EUR in 6 rows.
const rows = [['Post-Production', '12000 EUR', '10'], ['Post-Production', '8000 EUR', '11'], ['Design', '5000 EUR', '11'], ['Assembly', '12000 EUR', '08'], ['Post-Production', '6000 EUR', '09'], ['Design', '2000 EUR', '07']]
  .map(([department, cost, month], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: department, c2: cost, c3: `${year}-${month}-05` } }))
const bar = { id: 'i1', title: 'Cost by department', type: 'bar', category: 'c1', measure: 'sum', value: 'c2', sort: 'value' }
const conq = (insights = [bar]) => ({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights, insightFilters: { period: 'c3', fields: ['c1'] } })
const summary = { id: 'n1', title: 'CoNQ summary', type: 'narrative', category: 'c1', measure: 'sum', value: 'c2', sort: 'value', options: { size: 'full' },
  narrative: { auto: ['total', 'top'], rules: [{ metric: 'total', op: 'gt', value: 20000, template: 'CoNQ cost above budget: {value}', tone: 'warning' }] } }

const init = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  // The browser's print dialog is replaced by a counter (it would block the test).
  window.print = () => { window.__printed = (window.__printed ?? 0) + 1 }
}
// The data repository: files by path (text), the roles of `role`; every write recorded, and waited for by condition.
async function mockGitHub(context, files, role = 'Tool Owner') {
  const writes = [], waiting = []
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
      for (const entry of [...waiting]) if (entry.done(writes.at(-1))) { waiting.splice(waiting.indexOf(entry), 1); entry.resolve(writes.at(-1)) }
      return json({ content: { sha: `v${writes.length}` }, commit: { html_url: `https://github.com/example/storage/commit/v${writes.length}` } })
    }
    if (path === 'access.json') return json(rolesFile(role))
    const folder = Object.keys(files).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${files[file].length}` })))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  const writeWhere = (done) => { const found = writes.find(done); return found ? Promise.resolve(found) : new Promise((resolve) => waiting.push({ done, resolve })) }
  return { writes, writeWhere }
}
async function open(files, role, viewport = {}) {
  const { page, context, errors } = await openPage(app, { init, ...viewport })
  const git = await mockGitHub(context, files, role)
  // The start fetch from Azure DevOps fails (401) and may open the setup guide at any moment: close it when it appears.
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, async () => { await guide.getByRole('button', { name: 'Close', exact: true }).last().click() })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, ...git }
}
const panel = (page, title) => page.locator('.od-insight', { has: page.locator('h2', { hasText: title }) })
const lines = (locator) => locator.locator('.narrative-line').evaluateAll((list) => list.map((line) => ({ tone: line.getAttribute('data-tone'), text: line.querySelector('.narrative-text').textContent.replace(/\s+/g, ' ').trim() })))
const filterRow = (page) => page.getByRole('group', { name: 'Insights filters' })
async function tick(page, label, options) {
  await filterRow(page).getByRole('button', { name: new RegExp(`^${label}:`) }).click()
  const list = page.getByRole('listbox', { name: label })
  for (const option of options) await list.getByRole('checkbox', { name: option, exact: true }).check()
  await page.keyboard.press('Escape')
  await list.waitFor({ state: 'detached' })
}
const allYear = [
  { tone: 'info', text: 'Info: Sum of Cost: 45,000 EUR across 6 rows.' },
  { tone: 'info', text: 'Info: Highest Department: Post-Production with 26,000 EUR (57.8% of the total).' },
  { tone: 'warning', text: 'Warning: CoNQ cost above budget: 45,000 EUR' },
]

test('TC-CHT-56: the owner adds a Narrative with the total, the highest category and a warning rule — saved to Git; the filter row changes its sentences; the PDF includes it', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify(conq()) }
  const { page, context, errors, writeWhere } = await open(files)
  await navigate(page, 'CoNQ')
  await page.getByRole('tab', { name: /^Insights/ }).click()
  await panel(page, 'Cost by department').locator('svg[role="img"]').waitFor()

  // The chart pop-up, type Narrative: the measure as for a chart, Group by, the sentences ticked and one rule.
  await page.getByRole('button', { name: '＋ Add chart / table' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
  await dialog.getByLabel('Title').fill('CoNQ summary')
  await dialog.getByRole('radio', { name: 'Narrative (text)' }).check()
  assert.equal(await dialog.getByLabel('Categories by').count(), 0, 'a narrative has Group by instead')
  await dialog.getByLabel('Measure').selectOption('sum')
  await dialog.getByLabel('Of the Number column').selectOption({ label: 'Cost (Currency)' })
  await dialog.getByLabel('Group by', { exact: true }).selectOption({ label: 'Department' })
  await editorTab(dialog, 'Narrative')
  const sentences = dialog.getByRole('group', { name: 'Automatic sentences' })
  assert.equal(await sentences.getByRole('checkbox', { name: 'Total' }).isChecked(), true)
  assert.equal(await sentences.getByRole('checkbox', { name: 'Highest category' }).isChecked(), true)
  assert.equal(await sentences.getByRole('checkbox', { name: /^Change vs the previous period/ }).isDisabled(), true, 'needs the period’s Date column')
  await dialog.getByRole('button', { name: '＋ Add rule' }).click()
  const rule = dialog.getByRole('group', { name: 'Rule 1' })
  await rule.getByLabel('Rule 1 metric').selectOption('total')
  await rule.getByLabel('Rule 1 operator').selectOption('gt')
  await rule.getByLabel('Rule 1 value').fill('20000')
  await rule.getByLabel('Rule 1 tone').selectOption('warning')
  await rule.getByLabel('Rule 1 sentence').fill('CoNQ cost above budget: {value}')
  await dialog.getByLabel('Width', { exact: true }).selectOption('full')
  // The live preview (before the filter row: every row).
  const preview = dialog.getByRole('region', { name: 'Preview' })
  await preview.locator('.narrative-warning').waitFor()
  assert.deepEqual(await lines(preview), allYear)
  await dialog.getByRole('button', { name: 'Add chart' }).click()
  await dialog.waitFor({ state: 'detached' })

  // Saved to Git at once, as the insight's narrative field.
  const saved = await writeWhere((write) => write.path === 'on-demand/conq.json' && write.data.insights?.length === 2)
  const stored = saved.data.insights[1]
  assert.deepEqual({ type: stored.type, category: stored.category, measure: stored.measure, value: stored.value, options: stored.options, narrative: stored.narrative }, {
    type: 'narrative', category: 'c1', measure: 'sum', value: 'c2', options: { size: 'full' },
    narrative: { auto: ['total', 'top'], rules: [{ metric: 'total', op: 'gt', value: 20000, template: 'CoNQ cost above budget: {value}', tone: 'warning' }] },
  })

  // On the tab: the panel in the chart grid, the sentences with their tones; ⓘ lists the rule.
  const narrative = panel(page, 'CoNQ summary')
  await narrative.locator('.narrative-warning').waitFor()
  assert.deepEqual(await lines(narrative), allYear)
  assert.equal(await narrative.evaluate((element) => element.classList.contains('chart-w-full')), true)
  assert.match(await infoText(page, narrative), /Type: Narrative \(text\)\..*Rule 1\. If Sum of Cost > 20,000: “CoNQ cost above budget: \{value\}” \(Warning\)\./)

  // The filter row narrows it: Department = Design — the total and the highest change, the rule no longer matches.
  await tick(page, 'Department', ['Design'])
  await narrative.locator('.narrative-line', { hasText: '7,000 EUR across 2 rows' }).waitFor()
  assert.deepEqual(await lines(narrative), [
    { tone: 'info', text: 'Info: Sum of Cost: 7,000 EUR across 2 rows.' },
    { tone: 'info', text: 'Info: Highest Department: Design with 7,000 EUR (100% of the total).' },
  ])
  assert.equal(await narrative.locator('.chart-filtered').count(), 1, 'the Filtered pill, as for a chart')

  // Export PDF…: the print view draws the narrative with the active filters.
  const menu = await menuOf(page, 'Insights')
  await menu.getByRole('menuitem', { name: 'Export PDF…' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Export PDF' })
  await exportDialog.getByRole('button', { name: 'Export PDF' }).click()
  const view = page.getByRole('dialog', { name: 'Print view of CoNQ' })
  await view.waitFor()
  await page.waitForFunction(() => window.__printed === 1)
  const printed = view.locator('[data-print-item]', { has: page.locator('.narrative') })
  assert.match(await text(printed), /CoNQ summary.*Sum of Cost: 7,000 EUR across 2 rows\..*Highest Department: Design/)
  await view.getByRole('button', { name: 'Close' }).click()
  await view.waitFor({ state: 'detached' })
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-CHT-57: a viewer sees a Narrative and a Dashboard Narrative block read only, the tone read out in words', async () => {
  const files = {
    'on-demand/conq.json': JSON.stringify(conq([bar, summary])),
    'on-demand/cost-dashboard.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'cost-dashboard', name: 'Cost dashboard', description: '', keyPrefix: 'COSTD', columns: [], rows: [] }),
    'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'cost-dashboard': { type: 'dashboard', group: 'on-demand', order: 2, icon: '◔', owners: [] } } }),
    'dashboards/cost-dashboard.json': JSON.stringify({ schema: 1, kind: 'dashboard', id: 'cost-dashboard', tabs: [], filters: [], blocks: [
      { id: 'b1', title: 'Cost story', type: 'narrative', source: 'page:conq', category: 'c1', measure: 'sum', value: 'c2', sort: 'value', period: 'c3',
        narrative: { auto: ['total'], rules: [{ metric: 'top', op: 'is_top', value: 'Post-Production', template: '{top} leads with {share}', tone: 'bad' }] } },
    ] }),
  }
  const { page, context, errors, writes } = await open(files, 'Team Member')
  await navigate(page, 'CoNQ')
  await page.getByRole('tab', { name: /^Insights/ }).click()
  const narrative = panel(page, 'CoNQ summary')
  await narrative.locator('.narrative-warning').waitFor()
  assert.deepEqual(await lines(narrative), allYear)
  assert.equal(await page.getByRole('button', { name: 'More actions: CoNQ summary', exact: true }).count(), 0, 'no ⋯ menu for a viewer')
  // The tone in words for a screen reader, the icon hidden from it.
  assert.equal(await narrative.locator('.narrative-warning .sr-only').textContent(), 'Warning: ')
  assert.equal(await narrative.locator('.narrative-warning .narrative-icon').getAttribute('aria-hidden'), 'true')

  // The Dashboard block: the same component, over the dashboard's period (this year by default).
  await navigate(page, 'Cost dashboard')
  const block = panel(page, 'Cost story')
  await block.locator('.narrative-bad').waitFor()
  assert.deepEqual(await lines(block), [
    { tone: 'info', text: 'Info: Sum of Cost: 45,000 EUR across 6 rows.' },
    { tone: 'bad', text: 'Bad: Post-Production leads with 57.8%' },
  ])
  assert.equal(await page.getByRole('button', { name: 'More actions: Cost story', exact: true }).count(), 0)
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
