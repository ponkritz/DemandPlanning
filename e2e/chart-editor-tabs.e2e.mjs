import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { editorTab, navigate, openPage, rolesFile, startApp } from './helpers.mjs'

// The chart editor in tabs (CHT-70…CHT-73) against a mocked GitHub, named after UAT case TC-CHT-58: on CoNQ's Insights
// tab the owner edits a bar chart — the pop-up opens on Data with the preview beside the tabs and the buttons always
// visible; the arrow keys move between Data, Filters, Format and Elements; a change in Elements shows "Elements (1)"; a
// filter with nothing ticked marks Filters red and Save opens and focuses it; a KPI and a Narrative show only their tabs;
// at 390 px the preview is under the tabs. TC-CHT-59: the On-Demand Dashboard block pop-up has the same tabs, with the
// data source, the period's Date column and the dashboard tab on Data, and a KPI tile only Data and Filters.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const year = new Date().getUTCFullYear()
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'] },
  { id: 'c2', name: 'Site', type: 'dropdown', options: ['Berlin', 'Leeds', 'Lyon'] },
  { id: 'c3', name: 'Cost (EUR)', type: 'number' },
  { id: 'c4', name: 'Found on', type: 'date' },
]
const rows = [['Rework', 'Berlin', '1200'], ['Rework', 'Berlin', '400'], ['Rework', 'Leeds', '450'], ['Scrap', 'Lyon', '600'], ['Scrap', 'Berlin', '300'], ['Complaint', 'Leeds', '500']]
  .map(([category, site, cost], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1: category, c2: site, c3: cost, c4: `${year}-0${1 + index}-10` } }))
const insights = [
  { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c1', second: 'c2', measure: 'sum', value: 'c3', sort: 'value' },
  { id: 'i2', title: 'Total cost', type: 'kpi', category: '', measure: 'sum', value: 'c3', sort: 'value' },
  { id: 'i3', title: 'Cost summary', type: 'narrative', category: 'c1', measure: 'sum', value: 'c3', sort: 'value', narrative: { auto: ['total'], rules: [] } },
]
const conq = () => ({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns, rows, insights })
const dashboard = () => ({ schema: 1, kind: 'dashboard', id: 'cost-dashboard', tabs: [{ id: 't1', name: 'Overview' }, { id: 't2', name: 'Costs' }], filters: [], blocks: [
  { id: 'b1', title: 'Issues', type: 'kpi', source: 'page:conq', category: '', measure: 'count', sort: 'value', period: 'c4' },
  { id: 'b2', title: 'Cost by site', type: 'bar', source: 'page:conq', category: 'c2', measure: 'sum', value: 'c3', sort: 'value', period: 'c4' },
] })

const gitStorage = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
}
async function mockGitHub(context, files) {
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
    if (path === 'access.json') return json(rolesFile('Tool Owner'))
    const folder = Object.keys(files).filter((file) => file.startsWith(`${path}/`))
    if (folder.length) return json(folder.map((file) => ({ type: 'file', name: file.slice(path.length + 1), path: file, sha: `s${files[file].length}` })))
    if (files[path] != null) return json({ type: 'file', encoding: 'base64', content: Buffer.from(files[path]).toString('base64'), sha: `s${files[path].length}` })
    return json({ message: 'Not Found' }, 404)
  })
  return writes
}
async function open(viewport = {}) {
  const files = {
    'on-demand/conq.json': JSON.stringify(conq()),
    'on-demand/cost-dashboard.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'cost-dashboard', name: 'Cost dashboard', description: '', keyPrefix: 'COSTD', columns: [], rows: [] }),
    'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'cost-dashboard': { type: 'dashboard', group: 'on-demand', order: 2, icon: '◔', owners: [] } } }),
    'dashboards/cost-dashboard.json': JSON.stringify(dashboard()),
  }
  const { page, context, errors } = await openPage(app, { init: gitStorage, width: 1440, height: 900, ...viewport })
  const writes = await mockGitHub(context, files)
  // The start fetch (Azure DevOps answers 401 here) may open the setup guide at any moment: close it whenever it appears.
  const guide = page.getByRole('dialog').filter({ hasText: 'Could not fetch from Azure DevOps' })
  await page.addLocatorHandler(guide, async () => { await guide.getByRole('button', { name: 'Close', exact: true }).last().click() })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, writes }
}
async function openInsights(page) {
  await navigate(page, 'CoNQ')
  await page.getByRole('tab', { name: /^Insights/ }).click()
  await page.locator('.chart-panel', { has: page.locator('h2', { hasText: 'Cost by category' }) }).locator('svg[role="img"]').first().waitFor()
}
async function edit(page, title, name = 'Edit the chart or table') {
  await page.getByRole('button', { name: `More actions: ${title}`, exact: true }).click()
  await page.getByRole('menuitem', { name: 'Edit…' }).click()
  const dialog = page.getByRole('dialog', { name })
  await dialog.getByRole('tablist').waitFor()
  return dialog
}
// A tab's text as shown (its error reason is for screen readers only).
const shownText = (tab) => [...tab.childNodes].filter((node) => !node.classList?.contains('sr-only')).map((node) => node.textContent).join('').replace(/\s+/g, ' ').trim()
const tabNames = (dialog) => dialog.getByRole('tablist').getByRole('tab').evaluateAll((list, code) => list.map(new Function(`return ${code}`)()), shownText.toString())
const chosen = (dialog) => dialog.locator('[role="tab"][aria-selected="true"]').evaluate((tab, code) => new Function(`return ${code}`)()(tab), shownText.toString())
const focusedTab = (page) => page.evaluate(() => document.activeElement?.getAttribute('role') === 'tab' ? document.activeElement.textContent : null)
const until = async (check, what, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 50)) } assert.fail(`waited for ${what}`) }
const realErrors = (errors) => errors.filter((entry) => !/401|Unauthorized/.test(entry))
// The box of the form, the preview and the buttons, and whether the buttons are on screen.
const layoutOf = (dialog) => dialog.evaluate((box) => {
  const rect = (selector) => box.querySelector(selector).getBoundingClientRect()
  const fields = rect('.od-insight-fields'), preview = rect('.od-insight-preview'), save = rect('.modal-actions .primary')
  return { beside: preview.left >= fields.right - 1, under: preview.top >= fields.bottom - 1, saveShown: save.bottom <= window.innerHeight && save.top >= 0, sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth }
})
// CHART_EDITOR_SHOTS=<folder>: screenshots of each tab for the review, light and dark (not taken otherwise).
const shots = process.env.CHART_EDITOR_SHOTS
async function shoot(page, name) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  const width = page.viewportSize().width
  for (const scheme of ['light', 'dark']) { await page.emulateMedia({ colorScheme: scheme }); await page.screenshot({ path: `${shots}/${name}-${width}-${scheme}.png` }) }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('TC-CHT-58: the chart editor opens on Data with the preview beside its tabs — arrow keys, a count on Elements, a filter error marks Filters and Save focuses it', async () => {
  const { page, context, errors, writes } = await open()
  await openInsights(page)
  let dialog = await edit(page, 'Cost by category')
  // Opens on Data, the Title field focused; the tabs the bar chart takes; the preview beside them; the buttons on screen.
  assert.equal(await chosen(dialog), 'Data')
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Title')
  assert.deepEqual(await tabNames(dialog), ['Data', 'Filters', 'Format', 'Elements'])
  assert.equal(await dialog.getByLabel('Measure').inputValue(), 'sum', 'the data fields are on Data')
  assert.equal(await dialog.getByLabel('Orientation').count(), 0, 'Format’s fields are on their own tab')
  await shoot(page, 'tab-data')
  // The arrow keys, Home and End move between the tabs and open them; one tab is in the Tab order.
  await dialog.getByRole('tab', { name: 'Data' }).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await chosen(dialog), 'Filters')
  assert.equal(await focusedTab(page), 'Filters')
  await page.keyboard.press('End')
  assert.equal(await chosen(dialog), 'Elements')
  await page.keyboard.press('ArrowRight')
  assert.equal(await chosen(dialog), 'Data', 'from the last tab to the first')
  await page.keyboard.press('ArrowLeft')
  assert.equal(await focusedTab(page), 'Elements')
  assert.deepEqual(await dialog.getByRole('tab').evaluateAll((list) => list.map((tab) => tab.tabIndex)), [-1, -1, -1, 0])
  // Elements: the longest tab — the preview stays beside it and Save stays on screen; Legend: Bottom counts one setting.
  const elements = dialog.getByRole('group', { name: /^Chart elements/ })
  await elements.getByRole('combobox', { name: 'Legend' }).selectOption('bottom')
  await dialog.getByRole('tab', { name: 'Elements (1)' }).waitFor()
  await dialog.getByRole('region', { name: 'Preview' }).locator('.viz-legend-bottom').waitFor()
  assert.deepEqual(await layoutOf(dialog), { beside: true, under: false, saveShown: true, sideways: false })
  await shoot(page, 'tab-elements')
  await editorTab(dialog, 'Format')
  assert.equal(await dialog.getByLabel('Orientation').inputValue(), 'horizontal')
  assert.equal(await dialog.getByLabel('X axis name').count(), 0, 'the axis names are on Elements')
  await shoot(page, 'tab-format')
  // Filters: a filter with nothing ticked counts and, on Save, marks the tab red; Save opens and focuses it.
  await editorTab(dialog, 'Filters')
  await dialog.getByRole('button', { name: '＋ Add filter' }).click()
  await dialog.getByRole('tab', { name: 'Filters (1)' }).waitFor()
  await editorTab(dialog, 'Data')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  const reason = 'The filter on “Category” has nothing chosen: tick a value or give a month, or remove it.'
  await dialog.locator('.notice', { hasText: reason }).waitFor()
  assert.equal(await chosen(dialog), 'Filters (1)!')
  assert.equal(await focusedTab(page), `Filters (1)!: ${reason}`)
  const filtersTab = dialog.getByRole('tab', { name: /^Filters \(1\)/ })
  assert.equal(await filtersTab.getAttribute('title'), reason)
  assert.equal(await filtersTab.evaluate((tab) => tab.classList.contains('editor-tab-invalid')), true)
  assert.equal(await dialog.getByRole('tab', { name: 'Data' }).getAttribute('title'), null, 'only the tab with the error')
  await shoot(page, 'tab-filters-error')
  // Fixed: the marker goes; Save writes the chart as before plus the two changes.
  await dialog.getByRole('checkbox', { name: 'Rework' }).check()
  await until(async () => (await filtersTab.getAttribute('title')) === null, 'the marker to go')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  const saved = () => writes.filter((write) => write.path === 'on-demand/conq.json').at(-1)?.data
  await until(() => saved()?.insights?.[0]?.filters?.length === 1, 'the chart saved to Git')
  assert.deepEqual(saved().insights[0], { ...insights[0], filters: [{ column: 'c1', values: ['Rework'] }], options: { elements: { legend: 'bottom' } } })

  // A KPI: Data, Filters and Format (Show as, no Elements); a Narrative: Data, Filters and Narrative.
  dialog = await edit(page, 'Total cost')
  assert.deepEqual(await tabNames(dialog), ['Data', 'Filters', 'Format'])
  await editorTab(dialog, 'Format')
  assert.equal(await dialog.getByLabel('Show as').inputValue(), 'card')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  dialog = await edit(page, 'Cost summary')
  assert.deepEqual(await tabNames(dialog), ['Data', 'Filters', 'Narrative (1)'])
  assert.equal(await dialog.getByLabel('Group by', { exact: true }).inputValue(), 'c1', 'Group by is on Data')
  await editorTab(dialog, 'Narrative')
  await dialog.getByRole('group', { name: 'Automatic sentences' }).waitFor()
  await shoot(page, 'tab-narrative')
  // The type decides the tabs: a pie has Elements (without Axes), a summary table none.
  await editorTab(dialog, 'Data')
  await dialog.getByRole('radio', { name: 'Pie / donut' }).check()
  assert.deepEqual(await tabNames(dialog), ['Data', 'Filters', 'Format', 'Elements'])
  await editorTab(dialog, 'Elements')
  assert.equal(await dialog.getByRole('group', { name: 'Axes' }).count(), 0)
  await editorTab(dialog, 'Data')
  await dialog.getByRole('radio', { name: 'Pivot table' }).check()
  assert.deepEqual(await tabNames(dialog), ['Data', 'Filters', 'Format'])
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })

  // A phone: the tabs in one row that scrolls sideways, the preview under the form, Save on screen, no sideways page.
  await page.setViewportSize({ width: 390, height: 800 })
  dialog = await edit(page, 'Cost by category')
  await editorTab(dialog, 'Elements')
  const row = await dialog.getByRole('tablist').evaluate((list) => ({ wraps: getComputedStyle(list).flexWrap, scrolls: getComputedStyle(list).overflowX }))
  assert.deepEqual(row, { wraps: 'nowrap', scrolls: 'auto' })
  assert.deepEqual(await layoutOf(dialog), { beside: false, under: true, saveShown: true, sideways: false })
  await shoot(page, 'tab-elements')
  await editorTab(dialog, 'Data')
  await shoot(page, 'tab-data')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.deepEqual(realErrors(errors), [])
  await context.close()
})

test('TC-CHT-59: the Dashboard block pop-up has the same tabs — data source, period and tab on Data; a KPI tile only Data and Filters', async () => {
  const { page, context, errors, writes } = await open()
  await page.locator('.sidebar nav button', { hasText: 'Cost dashboard' }).click()
  await page.locator('.dsh-block', { has: page.locator('h2', { hasText: 'Cost by site' }) }).locator('svg[role="img"]').waitFor()
  // ＋ Add block…: a KPI tile (the first type) has only Data and Filters; a bar chart all four.
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  let dialog = page.getByRole('dialog', { name: 'Add a block' })
  await dialog.getByRole('tablist').waitFor()
  assert.equal(await dialog.getByRole('radio', { name: 'KPI tile' }).isChecked(), true)
  assert.deepEqual(await tabNames(dialog), ['Data', 'Filters'])
  await dialog.getByLabel('Data source').selectOption('page:conq')
  assert.equal(await dialog.getByLabel('Period filter on').inputValue(), 'c4')
  assert.equal(await dialog.getByLabel('Opens the tab').inputValue(), 't1')
  await dialog.getByRole('radio', { name: 'Bar chart' }).check()
  assert.deepEqual(await tabNames(dialog), ['Data', 'Filters', 'Format', 'Elements'])
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await dialog.waitFor({ state: 'detached' })

  dialog = await edit(page, 'Cost by site', 'Edit the block')
  assert.equal(await chosen(dialog), 'Data')
  assert.deepEqual(await tabNames(dialog), ['Data', 'Filters', 'Format', 'Elements'])
  assert.equal(await dialog.getByLabel('On the tab').inputValue(), 't1')
  await shoot(page, 'block-tab-data')
  await editorTab(dialog, 'Format')
  await dialog.getByLabel('Width', { exact: true }).selectOption('full')
  await dialog.getByRole('tab', { name: 'Format (1)' }).waitFor()
  assert.deepEqual(await layoutOf(dialog), { beside: true, under: false, saveShown: true, sideways: false })
  await shoot(page, 'block-tab-format')
  // An empty title: Save marks Data and opens it from Format.
  await editorTab(dialog, 'Data')
  await dialog.getByLabel('Title').fill('')
  await editorTab(dialog, 'Format')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.locator('.notice', { hasText: 'Give the block a title.' }).waitFor()
  assert.equal(await focusedTab(page), 'Data!: Give the block a title.')
  await dialog.getByLabel('Title').fill('Cost by site')
  await dialog.getByRole('button', { name: 'Save to Git' }).click()
  await dialog.waitFor({ state: 'detached' })
  const saved = () => writes.filter((write) => write.path === 'dashboards/cost-dashboard.json').at(-1)?.data
  await until(() => saved()?.blocks?.[1]?.options?.size === 'full', 'the block saved to Git')
  assert.deepEqual(saved().blocks.map((block) => [block.title, block.type, block.options]), [['Issues', 'kpi', undefined], ['Cost by site', 'bar', { size: 'full' }]])
  assert.deepEqual(realErrors(errors), [])
  await context.close()
})
