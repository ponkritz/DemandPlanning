import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { navigate, openPage, rolesFile, startApp, text } from './helpers.mjs'

// PGB-22…PGB-27 The Page type tick boxes and a Table (Query) page, against a fake dev.azure.com and a fake GitHub: a Tool
// Owner ticks Table (Query) + Insights in ＋ Add page… (the combinations that are not a type disabled with their reason),
// picks a saved query listed with their own PAT and adds the page — only the query's reference is in Git; the page
// reads the query's rows (read only: no row buttons), searches them and draws a chart of them on its Insights tab;
// Edit keeps the source fixed and switches Insights off; another viewer without a PAT sees the reason and nothing is
// read (TC-PGB-18, UAT; TC-PGB-17, TC-PGB-19). Synthetic rows only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

const shots = process.env.E2E_SHOTS
const shot = async (locator, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await locator.screenshot({ path: `${shots}/${name}.png` }) }

const server = 'https://dev.azure.com/example'
const queryId = '0f8a3c1e-2b4d-4e6f-8a9b-1c2d3e4f5a6b'
const setup = ({ email, pat }) => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', email)
  localStorage.setItem('demand-planning-servers-v1', JSON.stringify([{ serverUrl: '', organization: 'example' }]))
  localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([{ id: 'dp-conn', url: 'https://dev.azure.com/example/DHP', reason: 'DP', viewName: 'DP', role: 'reference', query: "SELECT [System.Id], [System.Title] FROM WorkItems WHERE [System.WorkItemType] = 'Release'", token: '' }]))
  if (pat) localStorage.setItem('demand-planning-server-pats-v1', JSON.stringify({ 'https://dev.azure.com/example': pat }))
}
const item = (id, fields) => ({ id, rev: 1, fields: { 'System.Id': id, 'System.TeamProject': 'DHP', 'System.AreaPath': 'DHP', 'System.IterationPath': 'DHP', ...fields } })
const person = (name) => ({ displayName: name, uniqueName: `${name.toLowerCase().replace(' ', '.')}@example.com`, id: name })
const defects = [
  item(201, { 'System.WorkItemType': 'Bug', 'System.Title': 'Seal leaks', 'System.State': 'Active', 'System.AssignedTo': person('Ana Costa'), 'Microsoft.VSTS.Common.Severity': '2 - High' }),
  item(202, { 'System.WorkItemType': 'Bug', 'System.Title': 'Label faded', 'System.State': 'Active', 'System.AssignedTo': person('Bo Li'), 'Microsoft.VSTS.Common.Severity': '3 - Medium' }),
  item(203, { 'System.WorkItemType': 'Bug', 'System.Title': 'Wrong torque', 'System.State': 'New', 'System.AssignedTo': person('Ana Costa'), 'Microsoft.VSTS.Common.Severity': '2 - High' }),
]
const savedColumns = [['System.Id', 'ID'], ['System.Title', 'Title'], ['System.State', 'State'], ['System.AssignedTo', 'Assigned To'], ['Microsoft.VSTS.Common.Severity', 'Severity']]
const fieldList = [['System.Id', 'ID', 'integer'], ['System.Title', 'Title', 'string'], ['System.State', 'State', 'string'], ['System.AssignedTo', 'Assigned To', 'string', { isIdentity: true }], ['Microsoft.VSTS.Common.Severity', 'Severity', 'string', { isPicklist: true }]]

// The fake Azure DevOps: the saved query by id, the project's saved queries, the field list and the batch read — reads
// only; the app's own start fetch finds no work; anything else is refused and recorded.
async function fakeAzure(context) {
  const calls = []
  await context.route('https://dev.azure.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    calls.push(`${request.method()} ${url.pathname}`)
    if (!(request.headers().authorization ?? '').startsWith('Basic ')) return json({ message: 'no PAT' }, 401)
    if (request.method() === 'GET' && url.pathname === `/example/DHP/_apis/wit/wiql/${queryId}`) return json({ queryType: 'flat', columns: savedColumns.map(([referenceName, name]) => ({ referenceName, name })), workItems: defects.map(({ id }) => ({ id })) })
    if (request.method() === 'GET' && url.pathname === '/example/DHP/_apis/wit/queries') return json({ value: [{ name: 'Shared Queries', isFolder: true, children: [{ id: queryId, name: 'Open defects', path: 'Shared Queries/Open defects' }] }] })
    if (request.method() === 'POST' && url.pathname.endsWith('/_apis/wit/wiql')) return json({ workItems: [] })
    if (request.method() === 'POST' && url.pathname.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: defects.filter((entry) => ids.includes(entry.id)) }) }
    if (request.method() === 'GET' && url.pathname.endsWith('/_apis/wit/fields')) return json({ value: fieldList.map(([referenceName, name, type, extra]) => ({ referenceName, name, type, ...extra })) })
    return json({ message: 'Not here' }, 404)
  })
  return calls
}
// The data repository: files by path, access.json with everyone a Tool Owner, every write recorded.
async function fakeGitHub(context, files) {
  const writes = []
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
      const body = JSON.parse(request.postData())
      files[path] = Buffer.from(body.content, 'base64').toString()
      writes.push({ path, data: JSON.parse(files[path]) })
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
async function open(files, who) {
  const { page, context, errors } = await openPage(app, { init: setup, initArg: who, width: 1440, height: 1000, scale: shots ? 2 : undefined })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  const calls = await fakeAzure(context)
  const writes = await fakeGitHub(context, files)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  return { page, context, errors, calls, writes }
}
const tick = (dialog, name) => dialog.getByRole('checkbox', { name, exact: true })
const reasonOf = async (dialog, key) => text(dialog.locator(`#page-type-${key}`))
const pageFile = (files) => Object.keys(files).find((path) => /^on-demand\/.*defect-list\.json$/.test(path))

test('TC-PGB-18, TC-PGB-17, TC-PGB-19: a Tool Owner adds a Table (Query) + Insights page from a saved query — only its reference in Git; the rows read live, read only, searched and charted; Edit keeps the source; a viewer without a PAT sees the reason', async () => {
  const files = {}
  const owner = await open(files, { email: 'tool.owner@example.com', pat: 'test-pat' })
  const { page } = owner
  await navigate(page, 'Pages & reports')
  await page.getByRole('button', { name: '＋ Add page…' }).first().click()
  const add = page.getByRole('dialog', { name: 'Add a page' })

  // TC-PGB-17: four tick boxes in order, Table (Build your own) ticked; a choice that is no type disabled with its reason.
  assert.deepEqual((await add.locator('.pgb-kinds .pgb-kind label').allInnerTexts()).map((label) => label.trim()), ['Table (Build your own)', 'Table (Query)', 'Insights', 'Dashboard'])
  assert.equal(await tick(add, 'Table (Build your own)').isChecked(), true)
  assert.equal(await text(add.locator('.pgb-type-result')), 'This page: Table · rows the team adds itself')
  assert.equal(await tick(add, 'Table (Query)').isDisabled(), true)
  assert.equal(await reasonOf(add, 'query'), 'A table has one source: untick Table (Build your own) first.')
  assert.equal(await reasonOf(add, 'dashboard'), 'A Dashboard stands alone: untick Table (Build your own) first.')
  await tick(add, 'Table (Build your own)').uncheck()
  assert.equal(await text(add.locator('.pgb-type-result')), 'Choose a page type.')
  assert.equal(await add.getByRole('button', { name: 'Add page' }).isDisabled(), true)
  assert.equal(await text(add.locator('.modal-actions .muted')), 'Choose a page type.')
  await tick(add, 'Insights').check()
  assert.equal(await text(add.locator('.pgb-type-result')), 'Insights reads a table’s rows: tick Table (Build your own) or Table (Query) as well.')
  assert.equal(await tick(add, 'Dashboard').isDisabled(), true)
  await tick(add, 'Table (Query)').check()
  assert.equal(await text(add.locator('.pgb-type-result')), 'This page: Table + Insights · rows from an Azure DevOps query')
  assert.equal(await tick(add, 'Table (Build your own)').isDisabled(), true)

  // PGB-23: the query picker of the dashboards — listed with the owner's PAT; Add page waits for the query.
  assert.equal(await text(add.locator('.modal-actions .muted')), 'Choose a saved query.')
  await add.getByRole('button', { name: 'List the saved queries' }).click()
  await add.getByLabel(/^Saved query/).locator('option', { hasText: 'Shared Queries/Open defects' }).waitFor({ state: 'attached' })
  await add.getByLabel(/^Saved query/).selectOption({ label: 'Shared Queries/Open defects' })
  assert.equal(await add.getByLabel(/^Query name/).inputValue(), 'Open defects')
  await add.getByLabel('Page name', { exact: true }).fill('Defect list')
  await shot(add, 'add-page-query-table')
  await add.getByRole('button', { name: 'Add page' }).click()
  await add.waitFor({ state: 'detached' })

  // Only the reference in the page file; the type in the menu layout.
  await page.locator('header.topbar h1', { hasText: 'Defect list' }).waitFor()
  const path = pageFile(files)
  const saved = owner.writes.filter((write) => write.path === path).at(-1).data
  assert.deepEqual([saved.columns, saved.rows, saved.source], [[], [], { kind: 'query', query: { id: 'q1', name: 'Open defects', server, project: 'DHP', queryId } }])
  assert.equal(owner.writes.filter((write) => write.path === 'menu-layout.json').at(-1).data.pages['defect-list'].type, 'table-insights')

  // PGB-24: the rows read with the owner's PAT, read only — no row buttons, no column setup; search works.
  const panel = page.locator('.od-panel')
  await panel.locator('tbody tr', { hasText: 'Seal leaks' }).waitFor()
  assert.match(await text(panel), /3 of 3 rows/)
  assert.match(await text(panel.locator('tbody tr', { hasText: 'Seal leaks' })), /^#201 Seal leaks Active Ana Costa 2 - High/)
  assert.equal(await panel.locator('a[href$="/_workitems/edit/201"]').count(), 1, 'the ID links to the work item')
  for (const name of ['＋ Add row', 'Set up columns…', 'Edit', 'Hide']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0, `no ${name}`)
  await panel.getByRole('searchbox', { name: 'Search Defect list' }).fill('torque')
  await panel.locator('tbody tr', { hasText: 'Seal leaks' }).waitFor({ state: 'detached' })
  assert.match(await text(panel), /1 of 3 rows/)
  await panel.getByRole('searchbox', { name: 'Search Defect list' }).fill('')
  await shot(page.locator('.content'), 'query-table-page')

  // PGB-25: Insights over the same rows — a bar chart of the defects by Severity, saved in the page file by field id.
  await page.getByRole('tab', { name: /^Insights/ }).click()
  await page.getByRole('button', { name: '＋ Add chart / table' }).click()
  const chart = page.getByRole('dialog', { name: 'Add a chart or table' })
  await chart.getByLabel('Title').fill('Defects by severity')
  await chart.getByRole('radio', { name: 'Bar / column' }).check()
  await chart.getByLabel('Categories by').selectOption({ label: 'Severity (Dropdown)' })
  await chart.getByRole('region', { name: 'Preview' }).locator('svg[role="img"] title', { hasText: '2 - High 2' }).waitFor({ state: 'attached' })
  await chart.getByRole('button', { name: 'Add chart' }).click()
  await chart.waitFor({ state: 'detached' })
  const withChart = await (async () => { for (;;) { const last = owner.writes.filter((write) => write.path === path).at(-1).data; if (last.insights?.length) return last; await page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('/contents/on-demand/')) } })()
  assert.deepEqual([withChart.insights[0].category, withChart.rows, withChart.source.kind], ['q_Microsoft_VSTS_Common_Severity', [], 'query'])

  // TC-PGB-19 (PGB-26): Edit keeps the source — the other source and Dashboard disabled with the reason; Insights off.
  await navigate(page, 'Pages & reports')
  await page.locator('.pgb-pages').getByRole('button', { name: 'Edit page Defect list', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit the page' })
  assert.equal(await tick(edit, 'Table (Build your own)').isDisabled(), true)
  assert.equal(await reasonOf(edit, 'own'), 'The table’s rows come from a saved Azure DevOps query; add a new page for the other source.')
  assert.equal(await tick(edit, 'Table (Query)').isChecked(), true)
  assert.equal(await tick(edit, 'Dashboard').isDisabled(), true)
  await tick(edit, 'Insights').uncheck()
  assert.equal(await text(edit.locator('.pgb-type-result')), 'This page: Table · rows from an Azure DevOps query')
  await edit.getByRole('button', { name: 'Save to Git' }).click()
  await edit.waitFor({ state: 'detached' })
  assert.match(await text(page.locator('.pgb-pages tbody tr', { hasText: 'Defect list' })), /Table · Query/)
  assert.equal(owner.writes.filter((write) => write.path === 'menu-layout.json').at(-1).data.pages['defect-list'].type, 'table')
  assert.ok(owner.calls.every((call) => /^(GET|POST) /.test(call)), 'reads only: nothing written to Azure DevOps')
  for (const word of ['test-pat', 'Seal leaks', 'Ana Costa', '@example.com']) assert.equal(files[path].includes(word), false, word)
  assert.deepEqual(owner.errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await owner.context.close()

  // A viewer without a PAT for dev.azure.com/example: the reason instead of rows, nothing sent for the query.
  const viewer = await open(files, { email: 'viewer@example.com', pat: '' })
  await viewer.page.locator('.sidebar nav button', { hasText: 'Defect list' }).click()
  const empty = viewer.page.locator('.od-panel .empty-state', { hasText: 'The rows cannot be shown.' })
  await empty.waitFor()
  assert.match(await text(empty), /Add your PAT for dev\.azure\.com\/example in My settings → Servers and PATs to see this/)
  await shot(viewer.page.locator('.od-panel'), 'query-table-no-pat')
  assert.deepEqual(viewer.calls.filter((call) => call.includes('/_apis/wit/wiql/')), [], 'no read of the saved query without a PAT')
  assert.deepEqual(viewer.errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await viewer.context.close()
})
