import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { cachedRoles, infoText, navigate, openPage, startApp, text } from './helpers.mjs'
import { fakeGitHub } from './fakeGitHub.mjs'

// Tool Validations from two queries (TVL-19…TVL-22, TVL-31; TC-TVL-18, UAT): the Tool Owner adds the Tools query and the
// Signed documents query as two connections of the stream in Stream mapping, sees which is which in the Tool
// Validations queries panel, keeps Changed Date as the completion date and then picks another date column; the
// Tool Validations page shows the month's Completed and Supported tools as the master list's Current Month Status (with
// their ID, Used by, Validated and Type, TVL-34…TVL-36), the Tool List [TFS] and Validation Documents [TFS] tabs — every
// document with its Parent's name (a retired tool's read by ID at ↻), in the queries' column order — and no Releases
// table; Pulse Check counts the same master list tools. GitHub (e2e/fakeGitHub.mjs) and Azure DevOps
// are faked with synthetic rows; nothing leaves the machine. Every step waits for what it needs, never for a time.
let app
before(async () => { app = await startApp() })
after(async () => { await app.stop() })

// Optional screenshots (E2E_SHOTS=<folder>); the assertions never depend on them.
const shots = process.env.E2E_SHOTS
const shot = async (page, name, locator) => { if (!shots) return; mkdirSync(shots, { recursive: true }); if (locator) await locator.screenshot({ path: `${shots}/${name}.png` }); else await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false }) }

const setup = () => {
  localStorage.setItem('demand-planning-git-storage-v1', JSON.stringify({ owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }))
  localStorage.setItem('demand-planning-git-token-v1', 'test-token')
  localStorage.setItem('demand-planning-servers-v1', JSON.stringify([{ serverUrl: '', organization: 'example' }]))
  localStorage.setItem('demand-planning-server-pats-v1', JSON.stringify({ 'https://dev.azure.com/example': 'test-pat' }))
}
const base = (id, type, title, extra) => ({ id, rev: 1, fields: { 'System.Id': id, 'System.Title': title, 'System.WorkItemType': type, 'System.State': 'Active', 'System.AreaPath': 'DHP', 'System.IterationPath': 'DHP', 'System.TeamProject': 'DHP', ...extra } })
// Tools (one row per tool): Changed Date, a Validation Completed date column and the Source, State and Type columns
// (TVL-34: Used by, Validated and Type on the master list).
const tools = [
  base(501, 'Tool', 'Minitab 21', { 'System.ChangedDate': '2026-10-05T10:00:00Z', 'Custom.ValidationCompleted': '2026-09-20T00:00:00Z', 'System.State': 'Validated', 'Custom.Source': 'Lab A', 'Custom.Type': 'Statistics' }),
  base(502, 'Tool', 'LabVIEW 2020', { 'System.ChangedDate': '2026-11-02T10:00:00Z', 'Custom.ValidationCompleted': '2026-10-12T00:00:00Z', 'Custom.Source': 'Lab B', 'Custom.Type': 'Test bench' }),
  base(503, 'Tool', 'JMP 17', { 'System.ChangedDate': '2026-10-20T10:00:00Z', 'Custom.Source': 'Lab A', 'Custom.Type': 'Statistics' }),
]
const signed = (name, role, date) => ({ 'Custom.ApproverName1': name, 'Custom.ApproverFunction1': role, 'Custom.ApproverApprovalDate1': date })
// Signed documents (Parent = the tool): Minitab's plan signed by QA in October; JMP's report signed by its author in
// October and by QE in September; a report whose Parent is no tool of the Tools query.
const documents = [
  base(601, 'Document', 'Minitab 21 Validation Plan', { 'System.Parent': 501, 'System.ChangedDate': '2026-10-14T10:00:00Z', ...signed('Ana Costa', 'QA', '2026-10-14T09:00:00Z') }),
  base(602, 'Document', 'JMP 17 Validation Report', { 'System.Parent': 503, 'System.ChangedDate': '2026-10-21T10:00:00Z', ...signed('Bo Li', 'Author', '2026-10-21T09:00:00Z'), 'Custom.ApproverName2': 'Cy Dahl', 'Custom.ApproverFunction2': 'QE', 'Custom.ApproverApprovalDate2': '2026-09-05T09:00:00Z' }),
  base(603, 'Document', 'Orphan Test Report', { 'System.Parent': 999, 'System.ChangedDate': '2026-10-03T10:00:00Z', ...signed('Ana Costa', 'QA', '2026-10-03T09:00:00Z') }),
  // TVL-31: a document of a tool whose work item Azure DevOps does not return (deleted or not readable).
  base(604, 'Document', 'Gone Tool Plan', { 'System.Parent': 998, 'System.ChangedDate': '2026-08-03T10:00:00Z' }),
]
// TVL-31: the retired tool 999 — not in the Tools query; its title is read by ID only (the batch read).
const retired = [base(999, 'Tool', 'Old Analyzer 1.0', { 'System.State': 'Retired' })]
const fieldNames = [['Custom.ValidationCompleted', 'Validation Completed'], ['Custom.Source', 'Source'], ['Custom.Type', 'Type'], ['System.Parent', 'Parent'], ['Custom.ApproverName1', 'ApproverName1'], ['Custom.ApproverFunction1', 'ApproverFunction1'], ['Custom.ApproverApprovalDate1', 'ApproverApprovalDate1'], ['Custom.ApproverName2', 'ApproverName2'], ['Custom.ApproverFunction2', 'ApproverFunction2'], ['Custom.ApproverApprovalDate2', 'ApproverApprovalDate2']]
const toolsQuery = "SELECT [System.Id], [System.Title], [System.ChangedDate], [Custom.ValidationCompleted], [Custom.Source], [System.State], [Custom.Type] FROM WorkItems WHERE [System.WorkItemType] = 'Tool'"
const documentsQuery = "SELECT [System.Id], [System.Title], [System.Parent], [Custom.ApproverName1], [Custom.ApproverFunction1], [Custom.ApproverApprovalDate1], [Custom.ApproverName2], [Custom.ApproverFunction2], [Custom.ApproverApprovalDate2] FROM WorkItems WHERE [System.WorkItemType] = 'Document'"

async function fakeAzure(context, data = { tools, documents }) {
  const reads = Object.assign([], { batches: [] })
  await context.route('https://dev.azure.com/**', (route) => {
    const request = route.request(), url = new URL(request.url())
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    // Read only: only the query, batch and field-list endpoints are answered; nothing is written.
    reads.push(`${request.method()} ${url.pathname}`)
    if (url.pathname.endsWith('/_apis/wit/wiql')) {
      const query = JSON.parse(request.postData() ?? '{}').query ?? ''
      const rows = /'Tool'/.test(query) ? data.tools : /'Document'/.test(query) ? data.documents : []
      return json({ workItems: /\[System\.Id\] > 0\b/.test(query) ? rows.map(({ id }) => ({ id })) : [] })
    }
    if (url.pathname.endsWith('/_apis/wit/workitemsbatch')) { const ids = JSON.parse(request.postData() ?? '{}').ids ?? []; reads.batches.push(ids); return json({ value: [...data.tools, ...data.documents, ...retired].filter((entry) => ids.includes(entry.id)) }) }
    if (url.pathname.endsWith('/_apis/wit/fields')) return json({ value: fieldNames.map(([referenceName, name]) => ({ referenceName, name })) })
    return json({ value: [] })
  })
  return reads
}
const until = async (check, what) => { for (const end = Date.now() + 30000; Date.now() < end;) { const value = check(); if (value) return value; await new Promise((resolve) => setTimeout(resolve, 50)) } throw new Error(`Timed out waiting for ${what}`) }
const panelTitled = (page, title) => page.locator('.panel').filter({ has: page.locator('h2', { hasText: new RegExp(`^${title}`) }) })
const releaseDetails = (page) => page.locator('.sidebar nav .nav-section', { hasText: 'RELEASE DETAILS' })
const masterRow = (page, name) => panelTitled(page, 'Master list').locator('tbody tr').filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^${name}$`) }) })
const cells = async (row, ...labels) => { const heads = (await row.page().locator('.panel').filter({ has: row.page().locator('h2', { hasText: /^Master list/ }) }).locator('thead th').allTextContents()).map((label) => label.replace(/[▴▾]/g, '').trim()); const values = await row.locator('td').allInnerTexts(); return labels.map((label) => values[heads.indexOf(label)]?.replace(/\s+/g, ' ').trim()) }
const tile = (page, label) => page.locator('.release-counts article').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('strong')

// TVL-33: Add query on a Tool Validations row asks the category — Tool List or Validation Documents — pre-selected by
// the connection's name or columns; `category` (when given) is checked as pre-selected and confirmed.
async function addQuery(page, rowName, query, category) {
  const mapping = page.locator('.connection-panel', { hasText: 'STEP 2' })
  await mapping.locator('tbody tr').filter({ has: page.locator('td:first-child strong', { hasText: new RegExp(`^${rowName}$`) }) }).getByRole('button', { name: 'Add query' }).click()
  const form = page.getByRole('dialog', { name: 'New connection' })
  await form.locator('label', { hasText: /^Server/ }).locator('select').selectOption('https://dev.azure.com/example')
  await form.locator('label', { hasText: /^Project/ }).locator('input').fill('DHP')
  await form.locator('label.query-field textarea').fill(query)
  if (category) assert.equal(await form.getByRole('radio', { name: category }).isChecked(), true, `${category} pre-selected`)
  const name = await form.getByLabel('Name', { exact: true }).inputValue()
  await form.getByRole('button', { name: 'Save and refresh data' }).click()
  await form.waitFor({ state: 'detached' })
  return name
}

test('TC-TVL-18: the Tool Owner sets up the Tools and the Signed documents queries, picks the completion date and sees Completed and Supported on the Tool Validations page and in Pulse Check', async () => {
  const gh = fakeGitHub({ files: { 'access.json': cachedRoles('Tool Owner') } })
  const { page, context, errors } = await openPage(app, { init: setup, width: 1440, height: 1000, scale: shots ? 2 : undefined })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  await context.route('https://api.github.com/**', gh.route)
  const reads = await fakeAzure(context)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()

  // TVL-19: Stream mapping — Add query on the Tool Validations row, then on its Validation Documents row (TVL-33).
  await navigate(page, /Streams$/)
  assert.equal(await addQuery(page, 'Tool Validations', toolsQuery, 'Tool List'), 'Tool Validations')
  assert.equal(await addQuery(page, 'Tool Validations · Validation Documents', documentsQuery, 'Validation Documents'), 'Tool Validations Signed documents')
  const panel = panelTitled(page, 'Tool Validations queries')
  const roleOf = (name) => panel.locator('tbody tr', { hasText: name }).locator('td').nth(1)
  await panel.locator('tbody tr', { hasText: 'Tool Validations Signed documents' }).locator('td').nth(2).getByText('4').waitFor()
  await panel.locator('tbody tr').filter({ has: page.locator('strong', { hasText: /^Tool Validations$/ }) }).locator('td').nth(2).getByText('3').waitFor()
  assert.equal(await text(roleOf('Tool Validations Signed documents')), 'Validation Documents')
  assert.equal(await text(panel.locator('tbody tr').filter({ has: page.locator('strong', { hasText: /^Tool Validations$/ }) }).locator('td').nth(1)), 'Tool List')
  // TVL-33: the category confirmed at Add query is saved: the Validation Documents query is the one chosen.
  assert.match(await text(panel), /How they are told apart: chosen in Stream mapping → Tool Validations queries\./)
  assert.equal(await panel.getByLabel('Validation Documents query').inputValue(), 'Tool Validations Signed documents')
  // TVL-20: Changed Date (last updated date) by default, with the note that it moves on any edit.
  const field = panel.getByLabel('Completion date field')
  assert.equal(await field.inputValue(), 'System.ChangedDate')
  assert.match(await text(panel), /Changed Date is the last update of the tool’s work item: it moves on any edit/)
  assert.deepEqual(await field.locator('option').allInnerTexts(), ['Changed Date (last updated date) — default', 'Validation Completed (Custom.ValidationCompleted)'])
  const mappingRows = page.locator('.connection-panel', { hasText: 'STEP 2' })
  await shot(page, 'stream-mapping-two-queries', mappingRows)
  await shot(page, 'tool-validations-queries-panel', panel)

  // TVL-21, TVL-22, TVL-35: October 2026 on the Tool Validations page — Completed by Changed Date: Minitab and JMP;
  // Supported: Minitab (a QA signature in October; JMP's October signature is its author's).
  await page.locator('header.topbar input[type=month]').fill('2026-10')
  await releaseDetails(page).locator('button:not(.nav-missing)', { hasText: 'Tool Validations' }).click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  const tabs = page.getByRole('tablist', { name: 'Result' })
  // TVL-23: the counts are on the Master list tab only, as Validations.
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  assert.deepEqual([await text(tile(page, 'Validations in October 2026')), await text(tile(page, 'Completed validations')), await text(tile(page, 'Supported validations'))], ['2', '2', '1'])
  // TVL-14: the tabs — Tool List [TFS] and Validation Documents [TFS] after Master list; no Azure tab, no Releases table.
  assert.deepEqual(await tabs.getByRole('tab').allInnerTexts(), ['Expiry list', 'Master list', 'Tool List [TFS]', 'Validation Documents [TFS]', 'Setup'])
  await shot(page, 'tool-validations-tabs', tabs)
  // TVL-34, TVL-35: the master list's ID, Used by, Validated, Type and Current Month Status (October, UTC).
  await masterRow(page, 'Minitab 21').getByText('Completed').first().waitFor()
  const columnsOf = (name) => cells(masterRow(page, name), 'ID', 'Used by', 'Validated', 'Type', 'Current Month Status')
  assert.deepEqual(await columnsOf('Minitab 21'), ['501', 'Lab A', 'Validated', 'Statistics', 'Completed Supported'])
  assert.deepEqual(await columnsOf('JMP 17'), ['503', 'Lab A', 'Active', 'Statistics', 'Completed'])
  assert.deepEqual(await columnsOf('LabVIEW 2020'), ['502', 'Lab B', 'Active', 'Test bench', ''])
  await shot(page, 'tool-validations-master-list', panelTitled(page, 'Master list'))
  await tabs.getByRole('tab', { name: 'Tool List [TFS]' }).click()
  assert.equal(await page.locator('.release-counts').count(), 0, 'TVL-23: no counts on the Tool List [TFS] tab')
  assert.equal(await page.locator('.panel h2', { hasText: /^Releases/ }).count(), 0, 'TVL-14: no Releases table')
  // TVL-31: Tool List (Azure) and Validation Documents, every column in the query's SELECT order; no "Not linked to a
  // tool" table. ↻ fetches both queries, then reads the retired Parent's title by ID (999), read only; a Parent Azure
  // DevOps does not return (998) shows as #998 with the reason in ⓘ.
  const headings = async (panel) => (await panel.locator('thead th .sort-button').allTextContents()).map((label) => label.replace(/[▴▾]/g, '').trim())
  const toolList = panelTitled(page, 'Tool List \\[TFS\\]')
  assert.match(await text(toolList.locator('.record-count')), /^3 rows$/)
  assert.deepEqual(await headings(toolList), ['ID', 'Title', 'Changed Date', 'Validation Completed', 'Source', 'State', 'Type'], 'the Tools query’s SELECT order')
  await shot(page, 'tool-validations-tool-list-tfs')
  await tabs.getByRole('tab', { name: 'Validation Documents [TFS]' }).click()
  const validation = panelTitled(page, 'Validation Documents \\[TFS\\]')
  assert.equal(await page.locator('.panel h2', { hasText: /^Releases/ }).count(), 0, 'TVL-14: no Releases table')
  assert.equal(await page.locator('.panel h2', { hasText: /^Not linked to a tool/ }).count(), 0)
  assert.deepEqual(await headings(validation), ['Tool', 'Parent ID', 'Tool List (Azure)', 'ID', 'Title', 'Parent', 'ApproverName1', 'ApproverFunction1', 'ApproverApprovalDate1', 'ApproverName2', 'ApproverFunction2', 'ApproverApprovalDate2'], 'Tool, Parent ID, then the Signed documents query’s SELECT order')
  assert.match(await text(validation.locator('.record-count')), /^4 documents · 2 not in Tool List \(Azure\) · not counted$/)
  const docRow = (id) => validation.locator('tbody tr').filter({ has: page.locator('td a', { hasText: new RegExp(`^${id}$`) }) })
  assert.match(await text(docRow(601)), /^Minitab 21 501 Listed 601 Minitab 21 Validation Plan/)
  // The names are read as soon as the documents are shown without them (here after Save and refresh data); ↻ reads
  // them again.
  await docRow(603).getByText('Old Analyzer 1.0').waitFor()
  const batchesBeforeRefresh = reads.batches.length
  await page.getByTitle('Refresh from Azure: the Tools and the Signed documents queries').click()
  await until(() => reads.batches.slice(batchesBeforeRefresh).some((ids) => ids.includes(999)) || null, '↻ reads the Parent names again')
  await docRow(603).getByText('Old Analyzer 1.0').waitFor()
  assert.ok(reads.batches.some((ids) => ids.length === 2 && ids.includes(998) && ids.includes(999)), 'the two Parents read by ID in one batch read')
  assert.match(await text(docRow(603)), /^Old Analyzer 1\.0 999 Not in Tool List \(Azure\) 603 Orphan Test Report/)
  assert.match(await text(docRow(604)), /^#998 998 Not in Tool List \(Azure\) 604 Gone Tool Plan/)
  assert.match(await infoText(page, validation), /1 Parent name not read — shown as #ID: Name not read: Not returned by Azure DevOps/)
  assert.match(await infoText(page, validation), /not counted/)
  await shot(page, 'tool-validations-validation-documents-tfs')
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  assert.equal(await panelTitled(page, 'Master list').locator('tbody tr', { hasText: 'Old Analyzer' }).count(), 0, 'the retired tool is not in the master list, not counted')
  assert.equal(await text(tile(page, 'Validations in October 2026')), '2')
  await tabs.getByRole('tab', { name: 'Validation Documents [TFS]' }).click()
  // Kept with the fetched documents (saved in this browser's database): still there after a reload, without reading again.
  await page.waitForFunction(() => new Promise((resolve) => { const open = indexedDB.open('demand-planning-data-v1'); open.onsuccess = () => { const get = open.result.transaction('snapshots').objectStore('snapshots').get('current'); get.onsuccess = () => { open.result.close(); resolve((get.result?.azureSources ?? []).some((source) => source.parentTitles?.['999']?.title === 'Old Analyzer 1.0')) }; get.onerror = () => { open.result.close(); resolve(false) } }; open.onerror = () => resolve(false) }))
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await releaseDetails(page).locator('button:not(.nav-missing)', { hasText: 'Tool Validations' }).click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  await page.locator('header.topbar input[type=month]').fill('2026-10')
  await tabs.getByRole('tab', { name: 'Validation Documents [TFS]' }).click()
  await docRow(603).getByText('Old Analyzer 1.0').waitFor()
  // Still named after the reload: kept with the saved fetch, or read again if the fetch at start replaced the
  // documents before the saved names were back (a Parent without a name is always read).
  assert.match(await text(docRow(604)), /^#998 998 /, 'a Parent Azure DevOps does not return stays #ID')

  // TVL-20: the Tool Owner picks Validation Completed as the completion date: Completed is LabVIEW only.
  await navigate(page, /Streams$/)
  await panelTitled(page, 'Tool Validations queries').getByLabel('Completion date field').selectOption('Custom.ValidationCompleted')
  await panelTitled(page, 'Tool Validations queries').getByText(/Changed Date is the last update/).waitFor({ state: 'detached' })
  // Saved in the shared settings, with the planning data in the data repository, for everyone (Save on the bar).
  await page.locator('.connection-panel', { hasText: 'STEP 2' }).locator('.git-bar-dirty').getByRole('button', { name: /^Save to/ }).click()
  const saved = await until(() => { const data = gh.read('planning-data.json'); return data && JSON.parse(data).releaseSourceSettings?.toolValidations?.completionField ? JSON.parse(data) : null }, 'the completion field saved to the data repository')
  assert.deepEqual(saved.releaseSourceSettings.toolValidations, { completionField: 'Custom.ValidationCompleted', documentsQuery: 'Tool Validations Signed documents' }, 'the completion field and the Validation Documents query confirmed at Add query (TVL-33)')
  await releaseDetails(page).locator('button:not(.nav-missing)', { hasText: 'Tool Validations' }).click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  await masterRow(page, 'LabVIEW 2020').getByText('Completed').waitFor()
  assert.deepEqual([await text(tile(page, 'Validations in October 2026')), await text(tile(page, 'Completed validations')), await text(tile(page, 'Supported validations'))], ['2', '1', '1'])
  assert.match(await text(page.locator('.release-counts')), /Completed validations 1 Master list tools whose Validation Completed is in the month/)
  assert.deepEqual([(await columnsOf('LabVIEW 2020'))[4], (await columnsOf('Minitab 21'))[4], (await columnsOf('JMP 17'))[4]], ['Completed', 'Supported', ''])

  // TVL-22: Pulse Check counts the same — Current month releases · October 2026.
  await navigate(page, 'Pulse Check')
  await page.getByRole('tab', { name: /^Current month releases ·/ }).click()
  const quadrant = page.locator('.release-quadrant').filter({ has: page.locator('h2', { hasText: /^Tool Validations$/ }) })
  await quadrant.waitFor()
  assert.match(await text(quadrant.locator('.quadrant-counts')), /^1 completed 1 supported$/)
  assert.match(await text(page.locator('.supported-summary')), /Tool Validations \[1\] : Minitab 21/)
  assert.match(await text(page.locator('.release-summary').first()), /Tool Validations \[1\] : LabVIEW 2020/)
  // TVL-36: the drill-down lists the master list's tools — name and version, ID, status.
  const lines = (await quadrant.locator('.quadrant-titles li').allInnerTexts()).map((line) => line.replace(/\s+/g, ' ').trim())
  assert.equal(lines.length, 2, lines.join(' | '))
  assert.match(lines[0], /^LabVIEW 2020 ID 502 · Completed/)
  assert.match(lines[1], /^Minitab 21 ID 501 · Supported/)
  await shot(page, 'pulse-check-tool-validations', quadrant)

  // Read only: Azure DevOps was only queried (WIQL, batch reads, field lists).
  assert.ok(reads.every((entry) => /^(POST|GET) .*\/_apis\/wit\/(wiql|workitemsbatch|fields)/.test(entry) || entry.startsWith('GET ')), reads.join('\n'))
  assert.deepEqual(errors, [])
  await context.close()
})

// TVL-29, TVL-30 (TC-TVL-26, TC-TVL-27, UAT): the tools of the Tools query are validated on their completion date
// (Changed Date by default) and due 24 months later; Edit and Remove are disabled for them with the reason, Edit notes…
// saves their notes; a tool the
// query no longer returns can be removed; a tool added by hand stays editable, and one added with the name and version of
// an Azure DevOps tool is refused. Synthetic rows; GitHub (e2e/fakeGitHub.mjs) and Azure DevOps faked.
const day = (offset) => { const at = new Date(); at.setUTCHours(0, 0, 0, 0); at.setUTCDate(at.getUTCDate() + offset); return at.toISOString().slice(0, 10) }
const plusMonths = (date, months) => { const [y, m, d] = date.split('-').map(Number); const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10) }
const longDate = (page, date) => page.evaluate((value) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)), date)
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Minitab 21 completed 700 days ago (due in about a month), LabVIEW 2020 completed 20 days ago (due later).
const azureTool = (id, title, tool, release, changed) => base(id, 'Tool', title, { 'System.ChangedDate': `${changed}T10:00:00Z`, 'System.AreaPath': `DHP\\Tool Validations\\${tool}`, 'System.IterationPath': `DHP\\Release ${release}` })
const azureTools = () => [azureTool(701, 'Minitab 21 Validation', 'Minitab', '21', day(-700)), azureTool(702, 'LabVIEW 2020 Validation', 'LabVIEW', '2020', day(-20))]
// In Git before the fetch: Polyspace from the query (no longer returned by it) and Excel Validator added by hand.
const lockedList = () => JSON.stringify({ schema: 1, kind: 'tool-validations', defaultDays: 60, owners: [], sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { periodUnit: 'months', confirmed: false } }],
  tools: [
    { name: 'Polyspace', version: 'R2024a', validationDate: day(-300), sources: { stream: { inSource: true } }, addedAt: '2026-01-05T10:00:00Z' },
    { name: 'Excel Validator', version: '2.0', dueDate: day(40), manual: ['dueDate'], sources: {}, addedAt: '2026-01-05T10:00:00Z' },
  ] })

test('TC-TVL-27: tools from Azure DevOps are validated on their completion date (TC-TVL-26) and locked — Edit and Remove disabled with the reason, Edit notes… saved; a tool gone from the query removed; a tool added by hand edited; a hand-added twin refused', async () => {
  const gh = fakeGitHub({ files: { 'access.json': cachedRoles('Tool Owner'), 'tool-validations.json': lockedList() } })
  const { page, context, errors } = await openPage(app, { init: setup, width: 1440, height: 1000, scale: shots ? 2 : undefined })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  await context.route('https://api.github.com/**', gh.route)
  await fakeAzure(context, { tools: azureTools(), documents: [] })
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  const saved = () => { const data = gh.read('tool-validations.json'); return data ? JSON.parse(data) : null }

  // TVL-04, TVL-29: the fetch appends the tools with the completion date (Changed Date) as their validation date.
  await navigate(page, /Streams$/)
  await addQuery(page, 'Tool Validations', "SELECT [System.Id], [System.Title], [System.AreaPath], [System.IterationPath], [System.ChangedDate] FROM WorkItems WHERE [System.WorkItemType] = 'Tool'")
  const appended = await until(() => { const data = saved(); return data?.tools.some((entry) => entry.name === 'Minitab') ? data : null }, 'the tools of the query appended')
  const minitab = appended.tools.find((entry) => entry.name === 'Minitab')
  assert.deepEqual([minitab.version, minitab.validationDate, minitab.validityMonths, minitab.dueDate, minitab.sources], ['21', day(-700), undefined, undefined, { stream: { inSource: true } }], 'the completion date written as a source value; the default period never written')
  assert.deepEqual(appended.tools.find((entry) => entry.name === 'Polyspace').sources, { stream: { inSource: false } }, 'no longer returned by the query')

  await releaseDetails(page).locator('button:not(.nav-missing)', { hasText: 'Tool Validations' }).click()
  await page.locator('.page-loading').waitFor({ state: 'detached' })
  const tabs = page.getByRole('tablist', { name: 'Result' })
  await tabs.getByRole('tab', { name: 'Master list' }).click()
  const master = panelTitled(page, 'Master list')
  const row = (name) => master.locator('tbody tr', { hasText: name })
  await row('Minitab').waitFor()
  const due = plusMonths(day(-700), 24)
  assert.match(await text(row('Minitab')), new RegExp(`^Minitab 21 701 ${escape(await longDate(page, day(-700)))} \\(completion date\\) 24 \\(default\\) ${escape(await longDate(page, due))} .*\\(completion date \\+ 24 months \\(default\\)\\) In source`))
  // TVL-30: Edit and Remove disabled with the reason (each button's tooltip, and the line above the table).
  const lock = 'Comes from Azure DevOps (Tool Validations query): change it there.'
  for (const name of ['Minitab', 'LabVIEW']) {
    const edit = row(name).getByRole('button', { name: 'Edit', exact: true }), remove = row(name).getByRole('button', { name: 'Remove' })
    assert.deepEqual([await edit.isDisabled(), await edit.getAttribute('title')], [true, lock], `${name}: Edit`)
    assert.deepEqual([await remove.isDisabled(), await remove.getAttribute('title')], [true, 'Comes from Azure DevOps (Tool Validations query): change it there; it can be removed here once Azure DevOps no longer returns it.'], `${name}: Remove`)
  }
  assert.equal(await text(master.locator('.write-blocked')), 'Tools from Azure DevOps are changed there: Edit is disabled for them (Edit notes… changes their notes here), and Remove until Azure DevOps no longer returns them.')
  await shot(page, 'master-list-azure-locked')
  if (shots) { await row('Minitab').getByRole('button', { name: 'Remove' }).scrollIntoViewIfNeeded(); await shot(page, 'master-list-azure-locked-actions') }

  // Its notes are kept here: Edit notes… saves only the notes to Git; Edit stays disabled.
  await row('Minitab').getByRole('button', { name: 'Edit notes…' }).click()
  const notes = page.getByRole('dialog', { name: 'Edit notes of Minitab' })
  assert.match(await text(notes), /comes from Azure DevOps \(Tool Validations\): its dates are changed there/)
  await notes.getByLabel('Notes (optional)').fill('Re-check the macro library')
  await notes.getByRole('button', { name: 'Save to Git' }).click()
  await notes.waitFor({ state: 'detached' })
  const noted = await until(() => saved()?.tools.find((entry) => entry.name === 'Minitab' && entry.notes === 'Re-check the macro library'), 'the notes of Minitab saved')
  assert.deepEqual([noted.validationDate, noted.manual, noted.sources], [day(-700), undefined, { stream: { inSource: true } }], 'nothing else changed')
  await row('Minitab').getByText('Re-check the macro library').waitFor()
  assert.equal(await row('Minitab').getByRole('button', { name: 'Edit', exact: true }).isDisabled(), true)

  // A hand-added twin of an Azure DevOps tool (the TVL-03 match) is refused with the reason, in the pop-up.
  await master.getByRole('button', { name: '＋ Add tool…' }).click()
  const add = page.getByRole('dialog', { name: 'Add a tool' })
  await add.getByLabel('Tool name').fill('mini-tab')
  await add.getByLabel('Version (optional)').fill('v21.0')
  await add.getByLabel('Due date (optional)').fill(day(900))
  await add.getByRole('button', { name: 'Add tool' }).click()
  await add.getByText(`This tool and version is already in the master list. ${lock}`).waitFor()
  await add.getByRole('button', { name: 'Cancel' }).click()
  await add.waitFor({ state: 'detached' })

  // Not in source now: Remove allowed (TVL-11 rights), Edit still locked.
  assert.match(await text(row('Polyspace')), /Not in source now/)
  assert.deepEqual([await row('Polyspace').getByRole('button', { name: 'Edit', exact: true }).isDisabled(), await row('Polyspace').getByRole('button', { name: 'Edit', exact: true }).getAttribute('title')], [true, lock])
  await row('Polyspace').getByRole('button', { name: 'Remove' }).click()
  const remove = page.getByRole('dialog', { name: 'Remove Polyspace' })
  await remove.getByRole('button', { name: 'Remove Polyspace' }).click()
  await remove.waitFor({ state: 'detached' })
  await until(() => saved() && !saved().tools.some((entry) => entry.name === 'Polyspace'), 'Polyspace removed')
  await row('Polyspace').waitFor({ state: 'detached' })

  // A tool added by hand stays editable.
  assert.equal(await row('Excel Validator').getByRole('button', { name: 'Edit notes…' }).count(), 0, 'a tool added by hand has Edit itself')
  await row('Excel Validator').getByRole('button', { name: 'Edit', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit Excel Validator' })
  await edit.getByLabel('Notes (optional)').fill('Checked by hand')
  await edit.getByRole('button', { name: 'Save to Git' }).click()
  await edit.waitFor({ state: 'detached' })
  await until(() => saved()?.tools.find((entry) => entry.name === 'Excel Validator')?.notes === 'Checked by hand', 'the note saved')

  // TVL-08, TVL-29: the Expiry list — Minitab due 24 months after its completion date, said so.
  await tabs.getByRole('tab', { name: 'Expiry list' }).click()
  const expiry = panelTitled(page, 'Validation expiry')
  const minitabDue = expiry.locator('tbody tr', { hasText: 'Minitab' })
  await minitabDue.waitFor()
  assert.match(await text(minitabDue), new RegExp(`^Due soon Minitab 21 ${escape(await longDate(page, due))} .* completion date \\+ 24 months \\(default\\) ${escape(await longDate(page, day(-700)))} \\(completion date\\) 24 \\(default\\)$`))
  assert.equal(await expiry.locator('tbody tr', { hasText: 'LabVIEW' }).count(), 0, 'LabVIEW is due later')
  await shot(page, 'expiry-list-azure')
  assert.deepEqual(errors, [])
  await context.close()
})

// TVL-33: Add query on a Tool Validations row of Stream mapping asks the category — Tool List or Validation Documents —
// pre-selected by the connection's name or columns and confirmed by the person; a role already held is not offered; the
// panel Tool Validations queries names the roles Tool List and Validation Documents; a Tool List query whose name says
// "docs" never becomes the Validation Documents query.
test('TC-TVL-30: Stream mapping Add query asks the category — Tool List or Validation Documents, pre-selected by name or columns and confirmed; the queries panel names the roles Tool List and Validation Documents', async () => {
  const gh = fakeGitHub({ files: { 'access.json': cachedRoles('Tool Owner') } })
  const { page, context, errors } = await openPage(app, { init: setup, width: 1440, height: 1000, scale: shots ? 2 : undefined })
  page.addLocatorHandler(page.getByRole('dialog', { name: /Could not fetch from Azure DevOps/ }), async (dialog) => { await dialog.getByRole('button', { name: /Close|Not now|Dismiss/ }).first().click() })
  await context.route('https://api.github.com/**', gh.route)
  await fakeAzure(context)
  await page.reload()
  await page.locator('.sidebar nav').waitFor()
  await navigate(page, /Streams$/)
  const mapping = page.locator('.connection-panel', { hasText: 'STEP 2' })
  const rowNamed = (name) => mapping.locator('tbody tr').filter({ has: page.locator('td:first-child strong', { hasText: new RegExp(`^${name}$`) }) })
  assert.equal(await rowNamed('Tool Validations · Validation Documents').count(), 1, 'the second row is named Validation Documents')

  // Add query on the Tool Validations row: Category asked, Tool List pre-selected (its name and columns say no documents).
  await rowNamed('Tool Validations').getByRole('button', { name: 'Add query' }).click()
  const form = page.getByRole('dialog', { name: 'New connection' })
  const category = form.locator('fieldset', { has: page.locator('legend', { hasText: /^Category$/ }) })
  await category.waitFor()
  assert.deepEqual([await category.getByRole('radio', { name: 'Tool List' }).isChecked(), await category.getByRole('radio', { name: 'Validation Documents' }).isChecked()], [true, false])
  assert.match(await text(category), /Pre-selected as the Tool List/)
  // A name with "docs": the pre-selection follows the automatic identification until the person picks.
  await form.getByLabel('Name', { exact: true }).fill('Tool Validations Signed docs')
  await form.getByLabel('View name (optional)').fill('Tool Validations Signed docs')
  await category.getByText(/Pre-selected by its name/).waitFor()
  assert.equal(await category.getByRole('radio', { name: 'Validation Documents' }).isChecked(), true)
  await category.getByRole('radio', { name: 'Tool List' }).check()
  await category.getByText('Chosen by you.').waitFor()
  await form.locator('label', { hasText: /^Server/ }).locator('select').selectOption('https://dev.azure.com/example')
  await form.locator('label', { hasText: /^Project/ }).locator('input').fill('DHP')
  await form.locator('label.query-field textarea').fill(toolsQuery)
  await shot(page, 'add-query-category', form)
  await form.getByRole('button', { name: 'Save and refresh data' }).click()
  await form.waitFor({ state: 'detached' })

  // The confirmed Tool List stays the Tool List although its name says docs: Validation Documents set to none.
  const panel = panelTitled(page, 'Tool Validations queries')
  const roleOf = (name) => panel.locator('tbody tr').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) }).locator('td').nth(1)
  await panel.locator('tbody tr', { hasText: 'Tool Validations Signed docs' }).locator('td').nth(2).getByText('3').waitFor()
  assert.equal(await text(roleOf('Tool Validations Signed docs')), 'Tool List')
  assert.equal(await panel.getByLabel('Validation Documents query').inputValue(), '@none')

  // Add query on the Validation Documents row: Validation Documents pre-selected by its name; Tool List not offered (held).
  await rowNamed('Tool Validations · Validation Documents').getByRole('button', { name: 'Add query' }).click()
  await category.waitFor()
  assert.equal(await category.getByRole('radio', { name: 'Validation Documents' }).isChecked(), true)
  assert.equal(await category.getByRole('radio', { name: 'Tool List' }).isDisabled(), true)
  assert.match(await text(category), /Tool Validations already has a Tool List query \(“Tool Validations Signed docs”\)/)
  await form.locator('label', { hasText: /^Server/ }).locator('select').selectOption('https://dev.azure.com/example')
  await form.locator('label', { hasText: /^Project/ }).locator('input').fill('DHP')
  await form.locator('label.query-field textarea').fill(documentsQuery)
  await form.getByRole('button', { name: 'Save and refresh data' }).click()
  await form.waitFor({ state: 'detached' })
  await panel.locator('tbody tr', { hasText: 'Tool Validations Signed documents' }).locator('td').nth(2).getByText('4').waitFor()
  assert.deepEqual([await text(roleOf('Tool Validations Signed docs')), await text(roleOf('Tool Validations Signed documents'))], ['Tool List', 'Validation Documents'])
  assert.equal(await panel.getByLabel('Validation Documents query').inputValue(), 'Tool Validations Signed documents')
  assert.match(await text(panel), /How they are told apart: chosen in Stream mapping → Tool Validations queries\./)
  await shot(page, 'tool-validations-queries-roles', panel)
  // Saved in the shared settings, with the planning data in the data repository (Save on the bar), as TC-TVL-18 does.
  await mapping.locator('.git-bar-dirty').getByRole('button', { name: /^Save to/ }).click()
  const settings = await until(() => { const data = gh.read('planning-data.json'); const value = data && JSON.parse(data).releaseSourceSettings?.toolValidations; return value?.documentsQuery === 'Tool Validations Signed documents' ? value : null }, 'the confirmed category saved to the data repository')
  assert.deepEqual(settings, { documentsQuery: 'Tool Validations Signed documents' })
  assert.deepEqual(errors, [])
  await context.close()
})
