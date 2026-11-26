import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { menuOf, openPage, rolesFile, startApp, text } from './helpers.mjs'

// Azure DevOps queries as dashboard data sources (DSH-17…DSH-23) against a fake dev.azure.com and a fake GitHub:
// a Tool Owner adds a block over the DP stream's query (TC-DSH-17, UAT), adds a saved query by its address and builds a
// Pivot table and a bar chart on its fields — the dashboard file in Git holds only the reference (TC-DSH-18, UAT) — and
// reads it again with ↻ (TC-DSH-22); another viewer without a PAT sees the reason instead of data and sends nothing to
// Azure DevOps (TC-DSH-23, UAT). Synthetic rows only; every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

// Optional screenshots (E2E_SHOTS=<folder>); the assertions never depend on them.
const shots = process.env.E2E_SHOTS
const shot = async (locator, name) => { if (!shots) return; mkdirSync(shots, { recursive: true }); await locator.screenshot({ path: `${shots}/${name}.png` }) }

const year = new Date().getUTCFullYear()
const server = 'https://dev.azure.com/example'
const queryId = '0f8a3c1e-2b4d-4e6f-8a9b-1c2d3e4f5a6b'
const queryUrl = `${server}/DHP/_queries/query/${queryId}/`
const setup = ({ email, pat }) => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-work-email-v1', email)
  localStorage.setItem('demand-planning-servers-v1', JSON.stringify([{ serverUrl: '', organization: 'example' }]))
  localStorage.setItem('demand-planning-azure-connection-profiles-v1', JSON.stringify([{ id: 'dp-conn', url: 'https://dev.azure.com/example/DHP', reason: 'DP', viewName: 'DP', role: 'reference', query: "SELECT [System.Id], [System.Title], [System.State], [Custom.Lab] FROM WorkItems WHERE [System.WorkItemType] = 'Release'", token: '' }]))
  if (pat) localStorage.setItem('demand-planning-server-pats-v1', JSON.stringify({ 'https://dev.azure.com/example': pat }))
}
const item = (id, fields) => ({ id, rev: 1, fields: { 'System.Id': id, 'System.TeamProject': 'DHP', 'System.AreaPath': 'DHP', 'System.IterationPath': 'DHP', ...fields } })
// The DP stream's releases (its query, fetched at start) and the saved query's defects (read on demand by its id).
const releases = [
  item(101, { 'System.WorkItemType': 'Release', 'System.Title': 'DP Alpha 1.0', 'System.State': 'Approved', 'Custom.Lab': 'Lab A' }),
  item(102, { 'System.WorkItemType': 'Release', 'System.Title': 'DP Beta 2.0', 'System.State': 'Approved', 'Custom.Lab': 'Lab B' }),
  item(103, { 'System.WorkItemType': 'Release', 'System.Title': 'DP Gamma 3.0', 'System.State': 'Draft', 'Custom.Lab': 'Lab A' }),
]
const person = (name) => ({ displayName: name, uniqueName: `${name.toLowerCase().replace(' ', '.')}@example.com`, id: name })
const defects = [
  item(201, { 'System.WorkItemType': 'Bug', 'System.Title': 'Seal leaks', 'System.State': 'Active', 'System.AssignedTo': person('Ana Costa'), 'Microsoft.VSTS.Common.Severity': '2 - High', 'Microsoft.VSTS.Scheduling.StoryPoints': 3, 'System.Tags': 'QE; Supplier', 'Microsoft.VSTS.Scheduling.TargetDate': `${year}-03-10T00:00:00Z` }),
  item(202, { 'System.WorkItemType': 'Bug', 'System.Title': 'Label faded', 'System.State': 'Active', 'System.AssignedTo': person('Bo Li'), 'Microsoft.VSTS.Common.Severity': '3 - Medium', 'Microsoft.VSTS.Scheduling.StoryPoints': 5, 'System.Tags': 'QE', 'Microsoft.VSTS.Scheduling.TargetDate': `${year}-04-02T00:00:00Z` }),
  item(203, { 'System.WorkItemType': 'Bug', 'System.Title': 'Wrong torque', 'System.State': 'New', 'System.AssignedTo': person('Ana Costa'), 'Microsoft.VSTS.Common.Severity': '2 - High', 'Microsoft.VSTS.Scheduling.StoryPoints': 2, 'System.Tags': 'Supplier', 'Microsoft.VSTS.Scheduling.TargetDate': `${year}-05-20T00:00:00Z` }),
]
const savedColumns = [['System.Id', 'ID'], ['System.Title', 'Title'], ['System.AssignedTo', 'Assigned To'], ['Microsoft.VSTS.Common.Severity', 'Severity'], ['Microsoft.VSTS.Scheduling.StoryPoints', 'Story Points'], ['System.Tags', 'Tags'], ['Microsoft.VSTS.Scheduling.TargetDate', 'Target Date']]
const fieldList = [['System.Id', 'ID', 'integer'], ['System.Title', 'Title', 'string'], ['System.State', 'State', 'string'], ['System.AssignedTo', 'Assigned To', 'string', { isIdentity: true }], ['Microsoft.VSTS.Common.Severity', 'Severity', 'string', { isPicklist: true }], ['Microsoft.VSTS.Scheduling.StoryPoints', 'Story Points', 'double'], ['System.Tags', 'Tags', 'plainText'], ['Microsoft.VSTS.Scheduling.TargetDate', 'Target Date', 'dateTime'], ['Custom.Lab', 'Lab', 'string']]

// The fake Azure DevOps: the DP query (POST wiql, paged by ID), the saved query by id (GET wiql/<id>), the field list and
// the batch read — reads only; anything else is refused and recorded.
async function fakeAzure(context) {
  const calls = []
  await context.route('https://dev.azure.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    calls.push(`${request.method()} ${url.pathname}`)
    if (!(request.headers().authorization ?? '').startsWith('Basic ')) return json({ message: 'no PAT' }, 401)
    if (request.method() === 'GET' && url.pathname === `/example/DHP/_apis/wit/wiql/${queryId}`) return json({ queryType: 'flat', columns: savedColumns.map(([referenceName, name]) => ({ referenceName, name })), workItems: defects.map(({ id }) => ({ id })) })
    if (request.method() === 'GET' && url.pathname === '/example/DHP/_apis/wit/queries') return json({ value: [{ name: 'Shared Queries', isFolder: true, children: [{ id: queryId, name: 'Open defects', path: 'Shared Queries/Open defects' }] }] })
    if (request.method() === 'POST' && url.pathname.endsWith('/_apis/wit/wiql')) { const query = JSON.parse(request.postData() ?? '{}').query ?? ''; return json({ workItems: /\[System\.Id\] > 0\b/.test(query) ? releases.map(({ id }) => ({ id })) : [] }) }
    if (request.method() === 'POST' && url.pathname.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; return json({ value: [...releases, ...defects].filter((entry) => ids.includes(entry.id)) }) }
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
const panel = (page, title) => page.locator('.dsh-block', { has: page.locator('h2', { hasText: title }) })
const openDashboard = async (page) => { await page.locator('.sidebar nav button', { hasText: 'Quality dashboard' }).click(); await page.locator('header.topbar h1', { hasText: 'Quality dashboard' }).waitFor() }
// A Data source option that can be chosen (its data is there): the option enabled.
const sourceReady = (dialog, label) => dialog.page().waitForFunction(([selector, wanted]) => [...document.querySelectorAll(selector)].some((option) => option.textContent === wanted && !option.disabled), ['[role="dialog"] select[aria-label="Data source"] option', label])
const filesOf = () => ({
  'on-demand/quality-dashboard.json': JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'quality-dashboard', name: 'Quality dashboard', description: '', keyPrefix: 'QUALITYD', columns: [], rows: [] }),
  'menu-layout.json': JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: { 'quality-dashboard': { type: 'dashboard', group: 'on-demand', order: 1, icon: '◔', owners: [] } } }),
})

test('TC-DSH-17, TC-DSH-18, TC-DSH-22, TC-DSH-23: a block over a stream’s query; a saved query added by its address with a Pivot table and a bar chart on its fields, only its reference in Git; a viewer without a PAT sees the reason', async () => {
  const files = filesOf()
  const owner = await open(files, { email: 'tool.owner@example.com', pat: 'test-pat' })
  const { page } = owner
  await openDashboard(page)
  await page.locator('.empty-state', { hasText: 'No blocks yet.' }).waitFor()

  // (a) TC-DSH-17: the DP stream's query (fetched at start) as a data source — a bar chart of its releases by State.
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  let dialog = page.getByRole('dialog', { name: 'Add a block' })
  await sourceReady(dialog, 'DP (Release Details stream query)')
  await dialog.getByLabel('Title').fill('DP releases by state')
  await dialog.getByRole('radio', { name: 'Bar chart' }).check()
  await dialog.getByLabel('Data source').selectOption({ label: 'DP (Release Details stream query)' })
  assert.match(await text(dialog.locator('label', { hasText: 'Data source' }).locator('small')), /^The Release Details query DP as the app last fetched it fetched \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC \(3 rows\)\.$/)
  await dialog.getByLabel('Categories by').selectOption({ label: 'State (Dropdown)' })
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  await panel(page, 'DP releases by state').locator('.viz-root').waitFor()
  const dpBlock = owner.writes.filter((write) => write.path === 'dashboards/quality-dashboard.json').at(-1).data.blocks[0]
  assert.deepEqual([dpBlock.source, dpBlock.category], ['azv:dp-conn', 'q_System_State'])

  // (b) TC-DSH-18: ＋ Add Azure query… by the query's address.
  let menu = await menuOf(page, 'page Quality dashboard')
  await menu.getByRole('menuitem', { name: '＋ Add Azure query…' }).click()
  const add = page.getByRole('dialog', { name: 'Add an Azure DevOps query' })
  // Picking lists the project's saved queries with the owner's PAT; the address is the other way in.
  assert.equal(await add.getByRole('radio', { name: 'Pick a saved query of a connection' }).isChecked(), true)
  assert.equal(await add.getByLabel(/^Connection/).locator('option:checked').innerText(), 'dev.azure.com/example · DHP')
  await add.getByRole('button', { name: 'List the saved queries' }).click()
  await add.getByLabel(/^Saved query/).locator('option', { hasText: 'Shared Queries/Open defects' }).waitFor({ state: 'attached' })
  assert.deepEqual(await add.getByLabel(/^Saved query/).locator('option').allInnerTexts(), ['— Choose —', 'Shared Queries/Open defects'])
  await add.getByRole('radio', { name: 'Paste the query’s address' }).check()
  await add.getByLabel('Query address').fill(queryUrl)
  await add.locator('small', { hasText: `dev.azure.com/example · DHP · query ${queryId}` }).waitFor()
  await add.getByLabel(/^Name/).fill('Open defects')
  await shot(add, 'add-azure-query-dialog')
  await add.getByRole('button', { name: 'Add data source' }).click()
  await add.waitFor({ state: 'detached' })
  const saved = owner.writes.filter((write) => write.path === 'dashboards/quality-dashboard.json').at(-1).data
  assert.deepEqual(saved.queries, [{ id: saved.queries[0].id, name: 'Open defects', server, project: 'DHP', queryId }], 'only the reference: server, project, query id, name')

  // A Pivot table on its fields: Story Points summed by Assigned To (identities by display name), columns by Severity.
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  dialog = page.getByRole('dialog', { name: 'Add a block' })
  await sourceReady(dialog, 'Open defects (Azure DevOps query)')
  const picker = dialog.getByLabel('Data source')
  if (shots) { await picker.evaluate((select) => { select.size = select.options.length }); await shot(dialog.locator('label', { hasText: 'Data source' }), 'data-source-picker'); await picker.evaluate((select) => { select.size = 0 }) }
  assert.deepEqual((await picker.locator('option').allInnerTexts()).filter((label) => /query\)|My view\)/.test(label)), ['DP (Release Details stream query)', 'Open defects (Azure DevOps query)'])
  await dialog.getByLabel('Title').fill('Story points by person')
  await dialog.getByRole('radio', { name: 'Pivot table' }).check()
  await picker.selectOption({ label: 'Open defects (Azure DevOps query)' })
  assert.deepEqual(await dialog.getByLabel('Rows by').locator('option').allInnerTexts(), ['ID (Text)', 'Title (Text)', 'Assigned To (Dropdown)', 'Severity (Dropdown)', 'Tags (Multi-select)', 'Target Date (by month)'])
  await dialog.getByLabel('Rows by').selectOption({ label: 'Assigned To (Dropdown)' })
  await dialog.getByLabel('Measure').selectOption('sum')
  await dialog.getByLabel('Of the Number column').selectOption({ label: 'Story Points' })
  assert.equal(await dialog.getByLabel('Period filter on').inputValue(), 'q_Microsoft_VSTS_Scheduling_TargetDate')
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  const pivot = panel(page, 'Story points by person')
  await pivot.locator('table tbody tr').first().waitFor()
  assert.deepEqual((await pivot.locator('table tbody tr').allInnerTexts()).map((row) => row.replace(/\s+/g, ' ').trim()), ['Ana Costa 5', 'Bo Li 5', 'Total 10'])
  assert.equal((await text(pivot)).includes('@'), false, 'no email shown')

  // A bar chart: Count of defects by Severity, stacked by Tags (a Multi-select).
  await page.getByRole('button', { name: '＋ Add block…' }).click()
  dialog = page.getByRole('dialog', { name: 'Add a block' })
  await sourceReady(dialog, 'Open defects (Azure DevOps query)')
  await dialog.getByLabel('Title').fill('Defects by severity')
  await dialog.getByRole('radio', { name: 'Bar chart' }).check()
  await dialog.getByLabel('Data source').selectOption({ label: 'Open defects (Azure DevOps query)' })
  await dialog.getByLabel('Categories by').selectOption({ label: 'Severity (Dropdown)' })
  await dialog.getByLabel('Measure').selectOption('count')
  await dialog.getByRole('button', { name: 'Add block' }).click()
  await dialog.waitFor({ state: 'detached' })
  const bars = panel(page, 'Defects by severity')
  await bars.locator('.viz-root').waitFor()
  await shot(bars, 'chart-on-query-source')

  // TC-DSH-22: ↻ Refresh Azure queries reads the saved query again (it is read when the dashboard opens; no polling).
  const reads = () => owner.calls.filter((call) => call === `GET /example/DHP/_apis/wit/wiql/${queryId}`).length
  const before = reads()
  menu = await menuOf(page, 'page Quality dashboard')
  await menu.getByRole('menuitem', { name: '↻ Refresh Azure queries' }).click()
  for (const end = Date.now() + 30000; reads() === before && Date.now() < end;) await page.waitForRequest((request) => request.url().includes(`/_apis/wit/wiql/${queryId}`), { timeout: 30000 }).catch(() => undefined)
  assert.equal(reads(), before + 1)
  assert.ok(owner.calls.every((call) => /^(GET|POST) /.test(call)) && !owner.calls.some((call) => /PATCH|DELETE/.test(call)), 'reads only')

  // Only the reference in Git: no PAT, no rows, no names of the work items.
  const stored = files['dashboards/quality-dashboard.json']
  for (const word of ['test-pat', 'Seal leaks', 'Ana Costa', 'DP Alpha', '@example.com']) assert.equal(stored.includes(word), false, word)
  assert.deepEqual(JSON.parse(stored).blocks.map((entry) => entry.source), ['azv:dp-conn', `azq:${saved.queries[0].id}`, `azq:${saved.queries[0].id}`])
  assert.deepEqual(owner.errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await owner.context.close()

  // TC-DSH-23: another viewer without a PAT for dev.azure.com/example — every block with its reason, nothing sent to Azure DevOps.
  const viewer = await open(files, { email: 'viewer@example.com', pat: '' })
  await openDashboard(viewer.page)
  const reason = panel(viewer.page, 'Story points by person').locator('.notice', { hasText: 'This block cannot be shown:' })
  await reason.waitFor()
  assert.equal(await text(reason), 'This block cannot be shown: Add your PAT for dev.azure.com/example in My settings → Servers and PATs to see this: an Azure query is read with each viewer’s own PAT, and you have none for that server here.')
  await panel(viewer.page, 'DP releases by state').locator('.notice', { hasText: 'Not fetched yet: fetch DP from Azure DevOps' }).waitFor()
  await shot(panel(viewer.page, 'Story points by person'), 'no-pat-reason')
  assert.deepEqual(viewer.calls.filter((call) => call.includes('/_apis/wit/wiql/')), [], 'no read of the saved query without a PAT')
  assert.deepEqual(viewer.errors.filter((entry) => !/401|Unauthorized/.test(entry)), [])
  await viewer.context.close()
})
