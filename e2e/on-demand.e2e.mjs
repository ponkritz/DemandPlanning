import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { infoText, menuOf, navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// On-Demand pages (OND-01…10, CON-103): CoNQ set up with a Dropdown and a Multi-select column, a row added and saved
// to Git as on-demand/conq.json — each change at once (OND-28) — (TC-OND-01, UAT), and a viewer without the rights
// (TC-OND-07), against a mocked GitHub.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

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

test('TC-OND-01: On-Demand → CoNQ — add a Dropdown and a Multi-select column with options, add a row, Save to Git writes on-demand/conq.json, and a reload shows it from Git', async () => {
  const files = {}
  const { page, context, errors } = await openPage(app, { init: gitStorage })
  const writes = await mockGitHub(context, files)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  // The On-Demand menu group lists CoNQ from the start (not in Git yet).
  const group = page.locator('.sidebar nav .nav-section', { hasText: 'ON-DEMAND' })
  assert.match(await text(group), /CoNQ/)
  await navigate(page, 'CoNQ')
  assert.equal(await text(page.locator('header.topbar h1')), 'CoNQ')
  assert.equal(await page.locator('header.topbar h1').getAttribute('title'), 'Cost of Non-Quality')
  await page.getByText('CoNQ is not in Git yet: it is created with its first save to Git.').waitFor()

  // Set up columns…: a Dropdown (one value) and a Multi-select, each with its options.
  await page.getByRole('button', { name: 'Set up columns…' }).click()
  const columns = page.getByRole('dialog', { name: 'Set up columns' })
  await columns.getByRole('button', { name: '＋ Add column' }).click()
  await columns.getByLabel('Column 1 name').fill('Category')
  await columns.getByLabel('Column 1 type').selectOption('dropdown')
  for (const [index, option] of ['Scrap', 'Rework'].entries()) { await columns.getByRole('button', { name: '＋ Add option' }).click(); await columns.getByLabel(`Category option ${index + 1}`).fill(option) }
  await columns.getByRole('button', { name: '＋ Add column' }).click()
  await columns.getByLabel('Column 2 name').fill('Sites')
  await columns.getByLabel('Column 2 type').selectOption('multi')
  for (const [index, option] of ['Berlin', 'Leeds', 'Lyon'].entries()) { await columns.getByRole('button', { name: '＋ Add option' }).nth(1).click(); await columns.getByLabel(`Sites option ${index + 1}`).fill(option) }
  await columns.getByRole('button', { name: 'Save', exact: true }).click()
  await columns.waitFor({ state: 'detached' })
  // OND-28: the columns are saved to Git at once (the page is created in Git with them).
  assert.deepEqual(writes.filter((write) => write.path === 'on-demand/conq.json').map((write) => write.data.columns.map((column) => column.name)), [['Category', 'Sites']])
  assert.equal(await page.locator('.git-bar-dirty').count(), 0, 'no unsaved-changes bar')

  // ＋ Add row (the row drawer, OND-27): one value of the Dropdown, two of the Multi-select; Save to Git saves it at once.
  await page.getByRole('button', { name: '＋ Add row' }).click()
  const row = page.getByRole('dialog', { name: 'New row' })
  await row.getByLabel('Category').selectOption('Rework')
  await row.getByRole('checkbox', { name: 'Berlin' }).check()
  await row.getByRole('checkbox', { name: 'Lyon' }).check()
  await row.getByRole('button', { name: 'Save to Git' }).click()
  await page.getByRole('dialog', { name: 'CONQ-0001' }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'CONQ-0001' }).waitFor({ state: 'detached' })
  const table = page.locator('.od-panel table')
  assert.match(await text(table.locator('thead')), /Key.*Category.*Sites.*Actions/i)
  // OND-18: the row has its key the moment it is added — prefix, date (UTC), 4 random characters.
  const key = await text(table.locator('tbody tr').first().locator('code.od-key').nth(1))
  assert.match(key, new RegExp(`^CONQ-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-[2-9A-HJKMNP-Z]{4}$`))
  assert.match(await text(table.locator('tbody tr').first()), /Rework Berlin, Lyon/)
  assert.match(await text(page.locator('.od-panel')), /1 of 1 row/)

  // Saved to Git: a second commit of on-demand/conq.json with the columns, their options and the row's values.
  const saved = writes.filter((write) => write.path === 'on-demand/conq.json')
  assert.equal(saved.length, 2)
  const file = saved[1].data
  assert.deepEqual([file.kind, file.id, file.name, file.description], ['on-demand-page', 'conq', 'CoNQ', 'Cost of Non-Quality'])
  assert.deepEqual(file.columns.map((column) => [column.name, column.type, column.options]), [['Category', 'dropdown', ['Scrap', 'Rework']], ['Sites', 'multi', ['Berlin', 'Leeds', 'Lyon']]])
  assert.deepEqual(file.rows.map((entry) => entry.cells), [{ [file.columns[0].id]: 'Rework', [file.columns[1].id]: ['Berlin', 'Lyon'] }])
  assert.equal(file.rows[0].key, key, 'the key shown is the key saved')
  assert.equal(file.keyPrefix, 'CONQ')
  assert.match(saved[1].message, /^CoNQ: add row CONQ-0001 \(CONQ-.+\) \[saved \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\]( \[by [^\]]+\])?$/, 'a queued save carries its time (GIT-17)')
  assert.equal(JSON.stringify(writes).includes('test-token'), false, 'no token in the data repository')
  // §8: the result is a Background jobs entry.
  await page.locator('.jobs-button').click()
  assert.match(await text(page.getByRole('dialog', { name: 'Background jobs' }).locator('li.job', { hasText: 'Save to Git · CoNQ · add row' })), /Saved to Git\. on-demand\/conq\.json — added CONQ-0001/)
  await page.getByRole('dialog', { name: 'Background jobs' }).getByRole('button', { name: 'Close', exact: true }).click()

  // Reload without the copy kept in this browser: the page is read back from Git.
  await page.evaluate(() => localStorage.removeItem('demand-planning-on-demand-v1'))
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.locator('.od-panel table tbody tr').first().waitFor()
  assert.match(await text(page.locator('.od-panel table tbody tr').first()), /Rework Berlin, Lyon/)
  assert.equal(await page.getByText('CoNQ is not in Git yet').count(), 0)
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-OND-07: a viewer without the On-Demand rights sees the page read only — rows shown, Add row, Edit, Remove and Set up columns… disabled with the reason', async () => {
  const conq = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap'] }], rows: [{ id: 'r1', cells: { c1: 'Rework' } }] }
  const files = { 'on-demand/conq.json': JSON.stringify(conq) }
  const { page, context, errors } = await openPage(app, { init: gitStorage })
  const writes = await mockGitHub(context, files, 'Team Member')
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  const first = page.locator('.od-panel table tbody tr').first()
  await first.waitFor()
  // The value no longer in the options is kept and marked.
  assert.match(await text(first), /Rework not in the list/)
  for (const name of ['＋ Add row', 'Set up columns…']) assert.equal(await page.getByRole('button', { name }).isDisabled(), true, `${name} is disabled`)
  // OND-61: the page's other actions are in its ⋯ menu, disabled there.
  const pageMenu = await menuOf(page, 'page CoNQ')
  for (const name of ['＋ Add page…', 'Rename page…', 'Hide page', 'Delete page…']) assert.equal(await pageMenu.getByRole('menuitem', { name }).isDisabled(), true, `${name} is disabled`)
  await page.keyboard.press('Escape')
  assert.equal(await first.getByRole('button', { name: /^Edit row/ }).isDisabled(), true)
  assert.equal(await first.getByRole('button', { name: /^Hide row/ }).isDisabled(), true)
  assert.equal(await text(page.locator('.od-panel .write-blocked')), 'Your role does not allow “Edit On-Demand data (rows)”, “Set up On-Demand pages (pages, columns, options)”. An Admin can change this in Admin → People & roles → Role rights.')
  assert.match(await first.getByRole('button', { name: /^Edit row/ }).getAttribute('title'), /Your role does not allow “Edit On-Demand data \(rows\)”/)
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

// OND-11…OND-17 Insights: CoNQ with its columns in Git; rows added on the Data tab, then a Bar chart and a Summary table.
const conqColumns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'] },
  { id: 'c2', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon'] },
  { id: 'c3', name: 'Cost (EUR)', type: 'number' },
  { id: 'c4', name: 'Found on', type: 'date' },
]
const insightsTab = (page) => page.getByRole('tab', { name: /^Insights/ })

test('TC-OND-09: Insights — on CoNQ add rows, add a Bar chart of Sum of cost by Category and a Summary table, Save to Git writes them into on-demand/conq.json, a reload shows them and the Table view lists the values', async () => {
  const files = { 'on-demand/conq.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', columns: conqColumns, rows: [] }) }
  const { page, context, errors } = await openPage(app, { init: gitStorage })
  const writes = await mockGitHub(context, files)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.getByText('No rows yet.').waitFor()
  // Data tab: three rows, each saved to Git from the row drawer (OND-27, OND-28).
  for (const [index, [category, sites, cost]] of [['Rework', ['Berlin', 'Lyon'], '1200'], ['Scrap', ['Leeds'], '300'], ['Rework', ['Berlin'], '450']].entries()) {
    await page.getByRole('button', { name: '＋ Add row' }).click()
    const row = page.getByRole('dialog', { name: 'New row' })
    await row.getByLabel('Category').selectOption(category)
    for (const site of sites) await row.getByRole('checkbox', { name: site }).check()
    await row.getByLabel('Cost (EUR)', { exact: true }).fill(cost)
    await row.getByLabel('Found on', { exact: true }).fill('2026-11-02')
    await row.getByRole('button', { name: 'Save to Git' }).click()
    await page.getByRole('dialog', { name: `CONQ-000${index + 1}` }).waitFor()
    await page.keyboard.press('Escape')
    await page.locator('aside.drawer').waitFor({ state: 'detached' })
  }
  assert.match(await text(page.locator('.od-panel')), /3 of 3 rows/)

  // Insights tab: empty at first.
  await insightsTab(page).click()
  await page.getByText('No charts or tables yet.').waitFor()
  // ＋ Add chart / table → Bar / column, Sum of Cost (EUR) by Category, with a live preview.
  await page.getByRole('button', { name: '＋ Add chart / table' }).click()
  let dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
  await dialog.getByLabel('Title').fill('Cost by category')
  await dialog.getByRole('radio', { name: 'Bar / column' }).check()
  await dialog.getByLabel('Categories by').selectOption({ label: 'Category (Dropdown)' })
  await dialog.getByLabel('Measure').selectOption('sum')
  await dialog.getByLabel('Of the Number column').selectOption({ label: 'Cost (EUR)' })
  const preview = dialog.getByRole('region', { name: 'Preview' })
  // CHT-38 (KB-86): the preview's header is the chart's own — its title and ⓘ, no subtitle repeating what ⓘ says.
  assert.match(await text(preview.locator('.od-preview-title')), /^Cost by category ⓘ/)
  assert.doesNotMatch(await text(preview), /Filters: All rows|rows counted/)
  await preview.locator('svg[role="img"] title', { hasText: 'Rework 1,650' }).waitFor({ state: 'attached' })
  await dialog.getByRole('button', { name: 'Add chart' }).click()
  await dialog.waitFor({ state: 'detached' })
  // ＋ Add chart / table → Summary table: Count of rows by Category, columns by Sites.
  await page.getByRole('button', { name: '＋ Add chart / table' }).click()
  dialog = page.getByRole('dialog', { name: 'Add a chart or table' })
  await dialog.getByLabel('Title').fill('Rows by category and site')
  await dialog.getByRole('radio', { name: 'Summary table' }).check()
  await dialog.getByLabel('Rows by').selectOption({ label: 'Category (Dropdown)' })
  await dialog.getByLabel('Columns by').selectOption({ label: 'Sites' })
  await dialog.getByRole('button', { name: 'Add chart' }).click()
  await dialog.waitFor({ state: 'detached' })
  assert.match(await text(insightsTab(page)), /Insights \(2\)/)
  const bar = page.locator('.od-insight', { hasText: 'Cost by category' })
  // CHT-25, CHT-39: the heading is the title only (no type above it); the type, what the chart measures and its filters
  // are in its ⓘ.
  assert.match(await text(bar.locator('.panel-heading')), /^Cost by category/)
  assert.equal(await bar.locator('.panel-heading .eyebrow').count(), 0)
  assert.match(await infoText(page, bar), /^Type: Bar \/ column\. Sum of Cost \(EUR\) by Category\. Its own filters: All rows\./)
  const pivot = page.locator('.od-insight', { hasText: 'Rows by category and site' })
  assert.match(await text(pivot.locator('thead')), /^Category Berlin Leeds Lyon Total$/i)
  assert.match(await text(pivot.locator('tbody tr', { hasText: 'Rework' })), /^Rework 2 0 1 2$/)
  assert.match(await text(pivot.locator('tbody tr.matrix-total')), /^Total 2 1 1 3$/)

  // Each insight was saved to Git at once (OND-28): the last commit has both, with the rows.
  await page.locator('.jobs-button', { hasText: 'Jobs done' }).waitFor()
  assert.equal(await page.locator('.git-bar-dirty').count(), 0, 'no unsaved-changes bar')
  const saved = writes.filter((write) => write.path === 'on-demand/conq.json')
  assert.equal(saved.length, 5, 'three rows and two insights, each its own commit')
  assert.match(saved[4].message, /^CoNQ: change the charts and tables \[saved /)
  const file = saved[4].data
  assert.equal(file.rows.length, 3)
  assert.deepEqual(file.insights.map(({ title, type, category, second, measure, value }) => ({ title, type, category, second, measure, value })), [
    { title: 'Cost by category', type: 'bar', category: 'c1', second: undefined, measure: 'sum', value: 'c3' },
    { title: 'Rows by category and site', type: 'table', category: 'c1', second: 'c2', measure: 'count', value: undefined },
  ])

  // Reload without the copy kept in this browser: read back from Git, the Insights tab remembered.
  await page.evaluate(() => localStorage.removeItem('demand-planning-on-demand-v1'))
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  const again = page.locator('.od-insight', { hasText: 'Cost by category' })
  await again.waitFor()
  assert.equal(await insightsTab(page).getAttribute('aria-selected'), 'true', 'the chosen tab is remembered for the page')
  // The chart's Table view lists the values (largest first).
  await again.getByRole('button', { name: 'Table', exact: true }).click()
  await again.locator('table').waitFor()
  assert.deepEqual(await again.locator('tbody tr').evaluateAll((list) => list.map((row) => row.innerText.replace(/\s+/g, ' ').trim())), ['Rework 1,650', 'Scrap 300', 'Total 1,950'])
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

test('TC-OND-13: a viewer without the setup right sees the Insights read only — charts shown, Add chart / table disabled with the reason, no chart ⋯ menu', async () => {
  const conq = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', columns: conqColumns,
    rows: [{ id: 'r1', cells: { c1: 'Rework', c2: ['Berlin'], c3: '100', c4: '2026-10-01' } }, { id: 'r2', cells: { c1: 'Scrap', c3: '40', c4: '2026-11-03' } }],
    insights: [{ id: 'i1', title: 'Cost per month', type: 'line', category: 'c4', measure: 'sum', value: 'c3', sort: 'label' }, { id: 'i2', title: 'Old chart', type: 'bar', category: 'gone', measure: 'count', sort: 'value' }] }
  const files = { 'on-demand/conq.json': JSON.stringify(conq) }
  const { page, context, errors } = await openPage(app, { init: gitStorage })
  const writes = await mockGitHub(context, files, 'Team Member')
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await insightsTab(page).click()
  const line = page.locator('.od-insight', { hasText: 'Cost per month' })
  await line.locator('svg[role="img"]').waitFor()
  assert.match(await infoText(page, line), /2 of 2 rows counted/)
  // A chart whose column is gone says so instead of failing.
  assert.match(await text(page.locator('.od-insight', { hasText: 'Old chart' })), /This chart cannot be shown: The column for the categories is no longer on the page \(removed\)\./)
  assert.equal(await page.getByRole('button', { name: '＋ Add chart / table' }).isDisabled(), true)
  // OND-61: Move up / down, Edit…, Size… and Remove… are in each chart's ⋯ menu, shown only to those who may set charts up.
  assert.equal(await page.getByRole('button', { name: 'More actions: Cost per month' }).count(), 0, 'no chart menu for a viewer')
  assert.equal(await line.getByRole('button', { name: /^(Edit|Remove|Move)/ }).count(), 0, 'no chart buttons for a viewer')
  assert.equal(await text(page.locator('.od-insights-head .write-blocked')), 'Your role does not allow “Set up On-Demand pages (pages, columns, options)”. An Admin can change this in Admin → People & roles → Role rights.')
  assert.match(await page.getByRole('button', { name: '＋ Add chart / table' }).getAttribute('title'), /Your role does not allow “Set up On-Demand pages/)
  // The Data tab is unchanged.
  await page.getByRole('tab', { name: 'Data' }).click()
  await page.locator('.od-panel table tbody tr').first().waitFor()
  assert.equal(writes.length, 0, 'nothing is written')
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})

// OND-19…OND-25: a Long text and a Currency column with descriptions, a row with its ID given on Save to Git, who added
// it and when, and an edit logged in the row's History and in the file (TC-OND-16, UAT).
test('TC-OND-16: row details — Long text and Currency columns with a description, a row gets CONQ-0001 when it is saved to Git with who added it and when, an edit is logged in History and in the file', async () => {
  const email = 'qe.lead@example.com'
  const files = { 'on-demand/conq.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: 'Cost of Non-Quality', keyPrefix: 'CONQ', columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework'] }], rows: [] }) }
  const { page, context, errors } = await openPage(app, { init: (work) => {
    localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
    localStorage.setItem('demand-planning-git-token-v1', 'test-token')
    localStorage.setItem('demand-planning-work-email-v1', work)
  }, initArg: email })
  const writes = await mockGitHub(context, files)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, 'CoNQ')
  await page.getByText('No rows yet.').waitFor()

  // Set up columns…: a Long text and a Currency (default USD), each with a description of how to fill it.
  await page.getByRole('button', { name: 'Set up columns…' }).click()
  const columns = page.getByRole('dialog', { name: 'Set up columns' })
  await columns.getByRole('button', { name: '＋ Add column' }).click()
  await columns.getByLabel('Column 2 name').fill('Details')
  await columns.getByLabel('Column 2 type').selectOption('longtext')
  await columns.getByLabel('Column 2 description').fill('What went wrong and what was done, in a few sentences.')
  await columns.getByRole('button', { name: '＋ Add column' }).click()
  await columns.getByLabel('Column 3 name').fill('Cost')
  await columns.getByLabel('Column 3 type').selectOption('currency')
  await columns.getByLabel('Column 3 default currency').selectOption('USD')
  await columns.getByLabel('Column 3 description').fill('The cost in the supplier’s currency, without VAT.')
  await columns.getByRole('button', { name: 'Save', exact: true }).click()
  await columns.waitFor({ state: 'detached' })

  // ＋ Add row (the row drawer, OND-27): the descriptions are shown under the fields; the ID is given in the row's save.
  await page.getByRole('button', { name: '＋ Add row' }).click()
  let row = page.getByRole('dialog', { name: 'New row' })
  assert.match(await text(row), /What went wrong and what was done, in a few sentences\./)
  assert.match(await text(row), /The cost in the supplier’s currency, without VAT\./)
  assert.match(await text(row.locator('.od-row-facts')), /ID given when the row is saved to Git/)
  await row.getByLabel('Category').selectOption('Rework')
  const paragraph = 'The seal ring was cut too short.\nThe batch was reworked on site and checked again before shipping.'
  await row.getByLabel('Details', { exact: true }).fill(paragraph)
  assert.equal(await row.getByLabel('Cost currency').inputValue(), 'USD', 'the column’s default currency')
  await row.getByLabel('Cost', { exact: true }).fill('1200')
  // Save to Git (OND-28): the row is saved at once and gets CONQ-0001; the file has who added it, when and the first log entry.
  await row.getByRole('button', { name: 'Save to Git' }).click()
  row = page.getByRole('dialog', { name: 'CONQ-0001' })
  await row.waitFor()
  await page.keyboard.press('Escape')
  await row.waitFor({ state: 'detached' })
  const table = page.locator('.od-panel table')
  assert.match(await text(table.locator('thead')), /ID.*Key.*Category.*Details.*Cost.*Added by.*Added on.*Actions/i)
  assert.equal(await table.getByRole('button', { name: 'About Cost' }).count(), 1, 'the description behind ⓘ on the heading')
  const first = table.locator('tbody tr').first()
  assert.match(await text(first), /^CONQ-0001 CONQ-\d{6}-[2-9A-HJKMNP-Z]{4} Rework/)
  assert.match(await text(first), /1,200\.00 USD/)
  assert.match(await text(first), new RegExp(email.replace(/\./g, '\\.')))
  let saved = writes.filter((write) => write.path === 'on-demand/conq.json')
  assert.equal(saved.length, 2, 'the columns, then the row')
  let file = saved[1].data
  const [, details, cost] = file.columns
  assert.deepEqual([details.type, details.description, cost.type, cost.currency, cost.description], ['longtext', 'What went wrong and what was done, in a few sentences.', 'currency', 'USD', 'The cost in the supplier’s currency, without VAT.'])
  assert.equal(file.rows[0].seq, 1)
  assert.equal(file.rows[0].addedBy, email)
  assert.match(file.rows[0].addedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.ok(Math.abs(Date.parse(file.rows[0].addedAt) - Date.now()) < 10 * 60_000, 'added now')
  assert.equal(file.rows[0].cells[details.id], paragraph, 'the paragraph kept with its line break')
  assert.equal(file.rows[0].cells[cost.id], '1200 USD')
  assert.deepEqual(file.rows[0].log.map((entry) => [entry.added, entry.by]), [[true, email]])

  // Edit: change the cost; Save to Git logs the change on its own — History shows who, when and old → new.
  await first.getByRole('button', { name: /^Edit row/ }).click()
  row = page.getByRole('dialog', { name: 'CONQ-0001' })
  assert.match(await text(row.locator('.od-row-facts')), new RegExp(`ID CONQ-0001.*Added .* by ${email.replace(/\./g, '\\.')}`))
  assert.equal(await row.getByLabel(/^Why/).count(), 0, 'no comment to type: the change is logged on its own')
  await row.getByLabel('Cost', { exact: true }).fill('1500')
  await row.getByLabel('Cost currency').selectOption('EUR')
  await row.getByRole('button', { name: 'Save to Git' }).click()
  await row.locator('.od-row-values').waitFor()
  assert.match(await text(first), /1,500\.00 EUR/)
  saved = writes.filter((write) => write.path === 'on-demand/conq.json')
  assert.equal(saved.length, 3)
  file = saved[2].data
  assert.equal(file.rows[0].seq, 1, 'the ID never changes')
  assert.equal(file.rows[0].addedBy, email)
  assert.equal(file.rows[0].log.length, 2)
  const edit = file.rows[0].log[1]
  assert.equal(edit.by, email)
  assert.match(edit.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  assert.equal(edit.comment, undefined)
  assert.deepEqual(edit.changes, [{ column: cost.id, from: '1200 USD', to: '1500 EUR' }])
  // History in the row drawer, newest first.
  const history = row.getByRole('region', { name: 'History' })
  const entries = history.locator('ol > li')
  assert.equal(await entries.count(), 2)
  assert.match(await text(entries.nth(0)), new RegExp(`^Changed · .* · ${email.replace(/\./g, '\\.')} Cost: 1,200\\.00 USD → 1,500\\.00 EUR$`))
  assert.match(await text(entries.nth(1)), /^Added · .* Category: Rework Details: The seal ring was cut too short\./)
  await row.getByRole('button', { name: 'Close' }).click()
  await row.waitFor({ state: 'detached' })
  // Last updated by / on: hidden at first, offered in the Columns list.
  assert.doesNotMatch(await text(table.locator('thead')), /Last updated/)
  assert.deepEqual(errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await context.close()
})
