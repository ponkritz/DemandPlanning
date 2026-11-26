import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { capText, connectionDatasets, connectionSources, fieldIdOf, fieldTypeOf, listSavedQueries, maxQueryColumns, maxQueryRows, missingConnection, patForServer, personName, queryConfig, queryDataset, queryFailure, queryReadReason, readSavedQuery, withoutEmails } from '../src/azureQuerySources.ts'
import { newQueryRef, parseQueryRefs, queryFromUrl } from '../src/azureQueryRef.ts'
import { blankBlock, blockData, copyBlock, emptyDashboard, mergeDashboardText, narrowRows, parseDashboard, serializeDashboard, sourcePattern } from '../src/dashboardPages.ts'
import { entryOf, mySourcePattern, sourceEntries } from '../src/dashboardSources.ts'
import { requestAzure } from '../src/azureClient.ts'
import { cutDashboard } from '../src/publishData.ts'

const require = createRequire(import.meta.url)
const { azureReadRequest } = require('../electron/azure-devops.cjs')

// DSH-17…DSH-23, MYD-26: Azure DevOps queries as data sources — the app's own queries (streams, Tool Validations, My
// views) from its fetched data, and saved queries the dashboard's builders add by reference, read with each viewer's PAT.
const server = 'https://dev.azure.com/example'
const queryId = '0f8a3c1e-2b4d-4e6f-8a9b-1c2d3e4f5a6b'
const ref = { id: 'q1', name: 'Open defects', server, project: 'DHP', queryId }
const identity = (name, email) => ({ displayName: name, uniqueName: email, id: 'x' })

test('DSH-20: the field types of a query — Azure DevOps types to chart types; tags Multi-select, identities and picklists Dropdown-like, the ID text (TC-DSH-20)', () => {
  const info = (type, extra = {}) => ({ referenceName: 'X.Y', type, ...extra })
  assert.equal(fieldTypeOf('System.AssignedTo', info('string', { isIdentity: true })), 'category')
  assert.equal(fieldTypeOf('Custom.Owner', info('identity')), 'category')
  assert.equal(fieldTypeOf('Microsoft.VSTS.Common.Severity', info('string', { isPicklist: true })), 'category')
  assert.equal(fieldTypeOf('Custom.Level', info('picklistInteger')), 'category')
  assert.equal(fieldTypeOf('Microsoft.VSTS.Scheduling.TargetDate', info('dateTime')), 'date')
  assert.equal(fieldTypeOf('Microsoft.VSTS.Scheduling.StoryPoints', info('double')), 'number')
  assert.equal(fieldTypeOf('Custom.Count', info('integer')), 'number')
  assert.equal(fieldTypeOf('System.Id', info('integer')), 'text', 'the ID is a key, not a number to add up')
  assert.equal(fieldTypeOf('System.Tags', info('plainText')), 'multi')
  assert.equal(fieldTypeOf('System.Description', info('html')), 'text')
  assert.equal(fieldTypeOf('Custom.Done', info('boolean')), 'category')
  assert.equal(fieldTypeOf('System.AreaPath', info('treePath')), 'category')
  // Without Azure's types (the app's own queries): by the reference name, else by the values.
  assert.equal(fieldTypeOf('System.State', undefined, ['Active', 'Closed']), 'category')
  assert.equal(fieldTypeOf('Custom.When', undefined, ['2026-10-01T00:00:00Z', '2026-11-02T10:00:00Z']), 'date')
  assert.equal(fieldTypeOf('Custom.Hours', undefined, [1, 2.5]), 'number')
  assert.equal(fieldTypeOf('Custom.Lab', undefined, ['Lab A', 'Lab B', 'Lab A']), 'category')
  assert.equal(fieldTypeOf('Custom.Note', undefined, ['one', 'two', 'three']), 'text')
  assert.equal(fieldTypeOf('Custom.Owner', undefined, [identity('Ana Costa', 'ana@example.com')]), 'category')
})

test('DSH-20: a query result as a source — all its columns as fields, identities by display name and never an email, tags as Multi-select, dates by day (TC-DSH-20)', () => {
  const result = {
    columns: [{ ref: 'System.Id', name: 'ID' }, { ref: 'System.Title', name: 'Title' }, { ref: 'System.AssignedTo', name: 'Assigned To' }, { ref: 'Custom.Contact', name: 'Contact' }, { ref: 'System.Tags', name: 'Tags' }, { ref: 'Microsoft.VSTS.Scheduling.TargetDate', name: 'Target Date' }, { ref: 'Microsoft.VSTS.Scheduling.StoryPoints', name: 'Story Points' }, { ref: 'Custom.Blocked', name: 'Blocked' }, { ref: 'System.Description', name: 'Description' }],
    info: { 'System.AssignedTo': { referenceName: 'System.AssignedTo', type: 'string', isIdentity: true }, 'Microsoft.VSTS.Scheduling.TargetDate': { referenceName: 'x', type: 'dateTime' }, 'Microsoft.VSTS.Scheduling.StoryPoints': { referenceName: 'x', type: 'double' }, 'Custom.Blocked': { referenceName: 'x', type: 'boolean' }, 'System.Description': { referenceName: 'x', type: 'html' } },
    items: [
      { id: 11, url: 'https://dev.azure.com/example/DHP/_workitems/edit/11', values: { 'System.Title': 'Fix A', 'System.AssignedTo': identity('Ana Costa', 'ana.costa@example.com'), 'Custom.Contact': 'Bo Li <bo.li@example.com>', 'System.Tags': 'QE; Release', 'Microsoft.VSTS.Scheduling.TargetDate': '2026-10-05T00:00:00Z', 'Microsoft.VSTS.Scheduling.StoryPoints': 3, 'Custom.Blocked': true, 'System.Description': '<p>Line <b>one</b></p><p>two</p>' } },
      { id: 12, url: 'javascript:alert(1)', values: { 'System.Title': 'Fix B', 'System.AssignedTo': { uniqueName: 'cy.dahl@example.com' }, 'Custom.Contact': 'cy.dahl@example.com', 'System.Tags': 'QE', 'Microsoft.VSTS.Scheduling.StoryPoints': 5, 'Custom.Blocked': false } },
    ],
    more: false, readAt: '2026-11-25T08:00:00Z',
  }
  const dataset = queryDataset('azq:q1', 'Open defects', 'Azure DevOps query', 'The saved query', result)
  assert.deepEqual(dataset.page.columns.map((column) => [column.name, column.type]), [['ID', 'text'], ['Title', 'text'], ['Assigned To', 'dropdown'], ['Contact', 'text'], ['Tags', 'multi'], ['Target Date', 'date'], ['Story Points', 'number'], ['Blocked', 'dropdown'], ['Description', 'text']])
  for (const column of dataset.page.columns) assert.match(column.id, /^[A-Za-z0-9][\w-]{0,39}$/, 'a field id a block can keep')
  const [a, b] = dataset.page.rows
  const cell = (row, ref) => row.cells[fieldIdOf(ref)]
  assert.deepEqual([cell(a, 'System.Id'), a.key, a.link, b.link], ['11', '#11', 'https://dev.azure.com/example/DHP/_workitems/edit/11', undefined])
  assert.deepEqual([cell(a, 'System.AssignedTo'), cell(b, 'System.AssignedTo'), cell(a, 'Custom.Contact'), cell(b, 'Custom.Contact')], ['Ana Costa', 'cy.dahl', 'Bo Li', 'cy.dahl'])
  assert.equal(JSON.stringify(dataset).includes('@example.com'), false, 'no email anywhere in the source')
  assert.deepEqual([cell(a, 'System.Tags'), cell(b, 'System.Tags')], [['QE', 'Release'], ['QE']])
  assert.deepEqual(dataset.page.columns.find((column) => column.name === 'Tags').options, ['QE', 'Release'])
  assert.deepEqual([cell(a, 'Microsoft.VSTS.Scheduling.TargetDate'), cell(b, 'Microsoft.VSTS.Scheduling.TargetDate'), cell(a, 'Microsoft.VSTS.Scheduling.StoryPoints'), cell(a, 'Custom.Blocked'), cell(b, 'Custom.Blocked'), cell(a, 'System.Description')], ['2026-10-05', '', '3', 'Yes', 'No', 'Line one · two'])
  assert.equal(dataset.readAt, '2026-11-25T08:00:00Z')
  assert.equal(dataset.capped, undefined)
  // A chart over its fields: Story Points summed by Assigned To; a Multi-select counts in each of its values.
  const bar = { ...blankBlock(dataset, 'b1', 'bar'), category: fieldIdOf('System.AssignedTo'), measure: 'sum', value: fieldIdOf('Microsoft.VSTS.Scheduling.StoryPoints') }
  const data = blockData(narrowRows(dataset, bar, null).page, bar)
  assert.deepEqual(data.categories.map((entry, at) => [entry.label, data.categoryTotals[at]]).sort(), [['Ana Costa', 3], ['cy.dahl', 5]])
  // Field ids: stable, ≤ 40 characters, different for different references.
  assert.equal(fieldIdOf('Microsoft.VSTS.Scheduling.OriginalEstimate'), fieldIdOf('Microsoft.VSTS.Scheduling.OriginalEstimate'))
  assert.ok(fieldIdOf('Microsoft.VSTS.Scheduling.OriginalEstimate').length <= 40)
  assert.notEqual(fieldIdOf('Custom.AVeryLongReferenceNameForAFieldNumberOne'), fieldIdOf('Custom.AVeryLongReferenceNameForAFieldNumberTwo'))
  assert.equal(personName({ displayName: 'Dee <dee@example.com>' }), 'Dee')
  assert.equal(withoutEmails('mail ana@example.com or bo@example.org'), 'mail ana or bo')
})

test('DSH-21: caps — at most 5,000 rows and 30 columns; a capped source says so (and is marked in its exports) (TC-DSH-21)', () => {
  const columns = Array.from({ length: 35 }, (_, at) => ({ ref: `Custom.F${at}`, name: `F${at}` }))
  const items = Array.from({ length: maxQueryRows + 1 }, (_, at) => ({ id: at + 1, values: { 'Custom.F0': 'x' } }))
  const dataset = queryDataset('azq:q1', 'Big', 'Azure DevOps query', 'Big query', { columns, items, more: false })
  assert.equal(dataset.page.rows.length, maxQueryRows)
  assert.equal(dataset.page.columns.length, maxQueryColumns)
  assert.equal(dataset.capped, 'Capped: only the first 5,000 rows are read (the query returns more); only the first 30 columns are used (5 more columns left out) — the figures are not complete. Narrow the query in Azure DevOps.')
  assert.match(dataset.note, /\(5,000 rows, capped\)\.$/)
  assert.equal(capText(false, 10, 0), '')
  assert.equal(queryDataset('azq:q1', 'Small', 'k', 'n', { columns: columns.slice(0, 3), items: items.slice(0, 3), more: false }).capped, undefined)
  // A read that returned more ids than the cap is capped although only 5,000 items were read.
  assert.match(queryDataset('azq:q1', 'Read', 'k', 'n', { columns: columns.slice(0, 2), items: items.slice(0, 10), more: true }).capped, /only the first 10 rows are read/)
})

// A fake Azure DevOps: the saved query by id, the field list and the batch read; every request recorded.
function fakeTransport({ ids = [11, 12], relations, columns = [{ referenceName: 'System.Id', name: 'ID' }, { referenceName: 'System.Title', name: 'Title' }, { referenceName: 'System.AssignedTo', name: 'Assigned To' }], fail } = {}) {
  const calls = []
  const transport = async (request) => {
    calls.push(request)
    if (fail) throw new Error(fail)
    if (request.operation === 'saved-query') return relations ? { queryType: 'tree', columns, workItemRelations: relations } : { queryType: 'flat', columns, workItems: ids.map((id) => ({ id })) }
    if (request.operation === 'fields') return { value: [{ referenceName: 'System.AssignedTo', name: 'Assigned To', type: 'string', isIdentity: true }] }
    if (request.operation === 'items') return { value: request.ids.map((id) => ({ id, fields: { 'System.Id': id, 'System.Title': `Item ${id}`, 'System.AssignedTo': identity('Ana Costa', 'ana@example.com') } })) }
    if (request.operation === 'saved-queries') return { value: [{ name: 'Shared Queries', isFolder: true, children: [{ id: queryId, name: 'Open defects', path: 'Shared Queries/Open defects' }, { name: 'QE', isFolder: true, children: [{ id: '1f8a3c1e-2b4d-4e6f-8a9b-1c2d3e4f5a6b', name: 'Mine', path: 'Shared Queries/QE/Mine' }] }] }] }
    throw new Error(`unexpected ${request.operation}`)
  }
  return { calls, transport }
}

test('DSH-19: a saved query is read by its id with the viewer’s PAT — reads only, items in batches of 200, capped at 5,000 rows (TC-DSH-19)', async () => {
  const fake = fakeTransport()
  const result = await readSavedQuery(ref, ' viewer-pat ', fake.transport, () => '2026-11-25T08:00:00Z')
  assert.deepEqual(fake.calls.map((call) => call.operation), ['saved-query', 'fields', 'items'])
  assert.deepEqual([fake.calls[0].queryId, fake.calls[0].organization, fake.calls[0].project, fake.calls[0].pat, fake.calls[0].baseUrl], [queryId, 'example', 'DHP', 'viewer-pat', undefined])
  assert.deepEqual(result.items.map((item) => [item.id, item.values['System.Title']]), [[11, 'Item 11'], [12, 'Item 12']])
  assert.equal(result.more, false)
  const dataset = queryDataset('azq:q1', 'Open defects', 'Azure DevOps query', 'n', result)
  assert.equal(dataset.page.columns.find((column) => column.name === 'Assigned To').type, 'dropdown')
  // Over the cap: 5,001 ids back — 5,000 read in 25 batches, the result marked capped.
  const big = fakeTransport({ ids: Array.from({ length: maxQueryRows + 1 }, (_, at) => at + 1) })
  const capped = await readSavedQuery(ref, 'pat', big.transport)
  assert.equal(capped.items.length, maxQueryRows)
  assert.equal(capped.more, true)
  assert.equal(big.calls.filter((call) => call.operation === 'items').length, 25)
  assert.ok(big.calls.every((call) => ['saved-query', 'fields', 'items'].includes(call.operation)), 'nothing but reads')
  // A tree query: the work items at either end of its links, each once.
  const tree = fakeTransport({ relations: [{ source: null, target: { id: 5 } }, { source: { id: 5 }, target: { id: 6 } }] })
  assert.deepEqual((await readSavedQuery(ref, 'pat', tree.transport)).items.map((item) => item.id), [5, 6])
  // On premises: the collection URL as base, the collection as organization.
  assert.deepEqual(queryConfig({ server: 'https://tfs.example.com/tfs/DefaultCollection', project: 'DHP' }), { organization: 'DefaultCollection', project: 'DHP', team: 'DHP', baseUrl: 'https://tfs.example.com/tfs/DefaultCollection' })
  // The PAT never appears in a reason.
  const failed = fakeTransport({ fail: 'Access denied for viewer-pat. Check project access.' })
  const error = await readSavedQuery(ref, 'viewer-pat', failed.transport).catch((failure) => queryFailure(failure, 'viewer-pat'))
  assert.equal(error, 'Azure DevOps did not return the query with your PAT: Access denied for [redacted]. Check project access.')
  await assert.rejects(readSavedQuery(ref, '  ', fake.transport), /No PAT/)
  // The picker's list of saved queries: the queries (not folders), by path.
  assert.deepEqual((await listSavedQueries(ref, 'pat', fake.transport)).map((entry) => entry.path), ['Shared Queries/Open defects', 'Shared Queries/QE/Mine'])
})

test('DSH-19, SM-200: the saved-query reads are guarded — a GUID id only, GET, in the web transport and in the desktop proxy (TC-DSH-19)', async () => {
  globalThis.window ??= {}
  await assert.rejects(requestAzure({ organization: 'example', project: 'DHP', team: 'DHP', pat: 'p', operation: 'saved-query', queryId: '../../_apis/wit/workitems/1' }), /Invalid saved query id/)
  await assert.rejects(requestAzure({ organization: 'example', project: 'DHP', team: 'DHP', pat: 'p', operation: 'items', ids: [1], queryId }), /Invalid saved query id/)
  const read = azureReadRequest({ organization: 'example', project: 'DHP', team: 'DHP', pat: 'p', operation: 'saved-query', queryId: queryId.toUpperCase() })
  assert.equal(read.url, `https://dev.azure.com/example/DHP/_apis/wit/wiql/${queryId}?api-version=7.1&$top=5001`)
  assert.equal(read.options.method, 'GET')
  assert.equal(read.options.body, undefined)
  assert.throws(() => azureReadRequest({ organization: 'example', project: 'DHP', team: 'DHP', pat: 'p', operation: 'saved-query', queryId: 'x/../y' }), /Invalid saved query id/)
  const list = azureReadRequest({ organization: 'DefaultCollection', project: 'DHP', team: 'DHP', pat: 'p', baseUrl: 'https://tfs.example.com/tfs/DefaultCollection', operation: 'saved-queries' })
  assert.deepEqual([list.url, list.options.method], ['https://tfs.example.com/tfs/DefaultCollection/DHP/_apis/wit/queries?api-version=7.1&$depth=2', 'GET'])
})

test('DSH-18: the stored reference — only server, project, query id and name in the dashboard file; never a PAT, never rows (TC-DSH-18)', () => {
  const raw = JSON.stringify({ schema: 1, kind: 'dashboard', id: 'quality', tabs: [], filters: [], blocks: [{ id: 'b1', title: 'Defects', type: 'kpi', source: 'azq:q1', measure: 'count', sort: 'value' }],
    queries: [{ ...ref, pat: 'secret-pat', token: 'secret', rows: [{ id: 1 }], wiql: 'SELECT …' }, { id: 'q2', name: 'Bad', server: 'http://dev.azure.com/example', project: 'DHP', queryId }, { id: 'q3', name: 'No id', server, project: 'DHP', queryId: 'abc' }, { ...ref, id: 'q4' }] })
  const parsed = parseDashboard(raw, 'quality')
  assert.deepEqual(parsed.dashboard.queries, [ref])
  assert.deepEqual(parsed.dropped, ['The Azure query “Bad” has no valid https server: left out.', 'The Azure query “No id” has no valid query id: left out.', 'The Azure query “Open defects” is listed twice: the second one was left out.'])
  const text = serializeDashboard(parsed.dashboard)
  assert.deepEqual(JSON.parse(text).queries, [{ id: 'q1', name: 'Open defects', server, project: 'DHP', queryId }])
  for (const word of ['secret', 'pat"', 'rows', 'wiql', 'token']) assert.equal(text.includes(word), false, word)
  assert.equal(serializeDashboard(emptyDashboard('quality')).includes('queries'), false, 'a dashboard without queries is written as before')
  assert.ok(sourcePattern.test('azq:q1') && sourcePattern.test('azv:conn-1') && sourcePattern.test('azm:view_2'))
  assert.equal(sourcePattern.test('azq:'), false)
  // Two saves adding a query each: both kept (merged by id).
  const base = serializeDashboard(emptyDashboard('quality'))
  const mine = serializeDashboard({ ...emptyDashboard('quality'), queries: [ref] }), theirs = serializeDashboard({ ...emptyDashboard('quality'), queries: [{ ...ref, id: 'q2', name: 'Other', queryId: '1f8a3c1e-2b4d-4e6f-8a9b-1c2d3e4f5a6b' }] })
  assert.deepEqual(JSON.parse(mergeDashboardText(base, mine, theirs, true)).queries.map((entry) => entry.id).sort(), ['q1', 'q2'])
  // Adding: a name, a unique query, at most 10.
  assert.equal(newQueryRef({ name: ' ', server, project: 'DHP', queryId }, [], 'q9'), 'Enter a name for the data source.')
  assert.equal(newQueryRef({ name: 'Again', server, project: 'dhp', queryId }, [ref], 'q9'), 'This query is already a data source of the dashboard (“Open defects”).')
  assert.equal(newQueryRef({ name: 'open DEFECTS', server, project: 'DHP', queryId: '1f8a3c1e-2b4d-4e6f-8a9b-1c2d3e4f5a6b' }, [ref], 'q9'), 'The dashboard already has a data source named “open DEFECTS”.')
  assert.match(newQueryRef({ name: 'Eleventh', server, project: 'DHP', queryId }, Array.from({ length: 10 }, (_, at) => ({ ...ref, id: `q${at}`, name: `Q${at}` })), 'q99'), /at most 10 Azure queries/)
  assert.deepEqual(newQueryRef({ name: 'Defects', server, project: 'DHP', queryId }, [], 'q9'), { id: 'q9', name: 'Defects', server, project: 'DHP', queryId })
  assert.deepEqual(parseQueryRefs('nope'), { refs: [], dropped: [] })
  // Copy to another dashboard: the reference goes along (DSH-15); a target with the same query keeps its own.
  const block = { id: 'b1', title: 'Defects', type: 'kpi', source: 'azq:q1', category: '', second: '', measure: 'count', value: '', filters: [], sort: 'value', period: '', tab: '' }
  const copied = copyBlock(emptyDashboard('other'), block, [], 'b2', 'Other', false, [ref])
  assert.deepEqual([copied.dashboard.queries, copied.block.source], [[ref], 'azq:q1'])
  assert.match(copied.note, /The Azure query Open defects was added to Other as a data source\./)
  const kept = copyBlock({ ...emptyDashboard('other'), queries: [{ ...ref, id: 'qx', name: 'Defects there' }] }, block, [], 'b3', 'Other', false, [ref])
  assert.deepEqual([kept.dashboard.queries.length, kept.block.source], [1, 'azq:qx'])
  // An interactive HTML file never carries an Azure query's rows (they are read with each viewer's PAT).
  const published = cutDashboard({ name: 'Q', description: '', dashboard: { ...emptyDashboard('quality'), queries: [ref], blocks: [block, { ...block, id: 'b2', source: 'azv:dp-1' }] }, pageOf: () => null, period: { years: [], quarters: [], months: [] }, choices: {}, publishedBy: 'Ana', now: new Date('2026-11-25T08:00:00Z'), at: 'now' })
  assert.deepEqual([published.dashboard.blocks.length, published.sources.length], [0, 0])
  assert.deepEqual(published.meta.notes, ['2 blocks over an Azure DevOps query are not published: its rows are read with each viewer’s own PAT.'])
  assert.equal(JSON.stringify(published).includes(queryId), false)
})

test('DSH-18: a query’s address — cloud and on premises; only a server the app already reads (TC-DSH-18)', () => {
  const known = [server, 'https://tfs.example.com/tfs/DefaultCollection']
  assert.deepEqual(queryFromUrl(`https://dev.azure.com/example/DHP/_queries/query/${queryId}/`, known), { server, project: 'DHP', queryId })
  assert.deepEqual(queryFromUrl(`https://dev.azure.com/example/My%20Project/_queries/query-edit/${queryId.toUpperCase()}/`, known), { server, project: 'My Project', queryId })
  assert.deepEqual(queryFromUrl(`https://tfs.example.com/tfs/DefaultCollection/DHP/_queries?id=${queryId}`, known), { server: 'https://tfs.example.com/tfs/DefaultCollection', project: 'DHP', queryId })
  assert.match(queryFromUrl(`https://dev.azure.com/other/DHP/_queries/query/${queryId}/`, known), /The app has no connection on dev\.azure\.com\/other/)
  assert.match(queryFromUrl(`https://evil.example.net/DHP/_queries/query/${queryId}/`, known), /no connection on evil\.example\.net/)
  assert.match(queryFromUrl('https://dev.azure.com/example/DHP/_queries/query/', known), /no saved query id/)
  assert.match(queryFromUrl('http://dev.azure.com/example/DHP/_queries/query/x', known), /https/)
  assert.match(queryFromUrl('not a url', known), /Paste the query’s address/)
})

// The app's own queries: a DP stream connection, the Tool Validations Tool List and Validation Documents queries and a My view.
const profile = (id, viewName, extra = {}) => ({ id, url: `${server}/DHP`, reason: viewName, viewName, role: 'reference', query: 'SELECT [System.Id], [System.Title], [System.State] FROM WorkItems', ...extra })
const profiles = [profile('dp-1', 'DP'), profile('tv-1', 'Tool Validations'), profile('tv-2', 'Tool Validations Signed documents'), profile('my-1', 'My open bugs', { mine: true })]
const snapshot = (connectionId, items) => ({ connectionId, name: connectionId, role: 'reference', organization: 'example', project: 'DHP', query: '', fetchedAt: '2026-11-24T07:00:00Z', columns: [{ ref: 'System.Id', name: 'ID' }, { ref: 'System.Title', name: 'Title' }, { ref: 'System.State', name: 'State' }], items })
const workItem = (id, title, state) => ({ key: `example/dhp/${id}`, id, organization: 'example', project: 'DHP', title, workItemType: 'Bug', state, assignedTo: '', areaPath: 'DHP', iterationPath: 'DHP', tags: '', url: `${server}/DHP/_workitems/edit/${id}`, syncedAt: '', fields: { 'System.Title': title, 'System.State': state } })
const state = { azureSources: [snapshot('dp-1', [workItem(1, 'DP 1.0', 'Approved'), workItem(2, 'DP 1.1', 'Approved')]), snapshot('my-1', [workItem(3, 'Bug', 'Active')])] }

test('DSH-17, MYD-26: the app’s own queries — one source per query, named by its stream, tab or view, from the fetched data (TC-DSH-17)', () => {
  assert.deepEqual(connectionSources(profiles).map((source) => [source.key, source.name, source.kind]), [
    ['azv:dp-1', 'DP', 'Release Details stream query'], ['azv:tv-1', 'Tool Validations · Tool List', 'Tool Validations query'],
    ['azv:tv-2', 'Tool Validations · Validation Documents', 'Tool Validations query'], ['azm:my-1', 'My open bugs', 'My view']])
  const entries = connectionDatasets({ profiles, state, sees: () => true })
  const dp = entries.find((entry) => entry.dataset.key === 'azv:dp-1').dataset
  assert.deepEqual(dp.page.columns.map((column) => [column.name, column.type]), [['ID', 'text'], ['Title', 'text'], ['State', 'dropdown']])
  assert.deepEqual(dp.page.rows.map((row) => row.key), ['#1', '#2'])
  assert.match(dp.note, /fetched 2026-11-24 07:00 UTC/)
  // Not fetched yet: what to do, and the app's own fetch.
  const tools = entries.find((entry) => entry.dataset.key === 'azv:tv-1')
  assert.deepEqual([tools.load, tools.dataset.problem], ['azure', 'Not fetched yet: fetch Tool Validations · Tool List from Azure DevOps (↻ Refresh on the top bar) to see this.'])
  // Only wanted sources work their rows out.
  assert.equal(connectionDatasets({ profiles, state, sees: () => true }, () => false).find((entry) => entry.dataset.key === 'azv:dp-1').dataset.page.rows.length, 0)
  // My dashboard: the same sources through the registry, its keys allowed.
  assert.ok(mySourcePattern.test('azv:dp-1') && mySourcePattern.test('azm:my-1'))
  const registry = sourceEntries({ sees: () => true, months: [], today: '2026-11-25', me: { name: 'Ana' }, items: [], settings: {}, releases: { state: {}, profiles: [], streamsOf: () => [] }, qe: { file: null, loaded: true }, kpi: null, history: { file: null, loaded: true, connected: false }, windchill: [], pages: [], hours: () => [], connections: { profiles, state } }, (key) => key === 'azm:my-1')
  assert.deepEqual(entryOf(registry, 'azm:my-1', () => false).dataset.page.rows.map((row) => row.key), ['#3'], 'a My view needs no area: it is the viewer’s own')
})

test('DSH-23, MYD-26: rights and why not — Release Details for the streams and Tool Validations, a My view its owner only; no PAT, viewing as (TC-DSH-23)', () => {
  const noRelease = connectionDatasets({ profiles, state, sees: (area) => area !== 'release' })
  for (const key of ['azv:dp-1', 'azv:tv-1', 'azv:tv-2']) { const dataset = noRelease.find((entry) => entry.dataset.key === key).dataset; assert.equal(dataset.problem, 'Not available for your role.', key); assert.equal(dataset.page.rows.length, 0) }
  assert.equal(noRelease.find((entry) => entry.dataset.key === 'azm:my-1').dataset.problem, undefined, 'a My view follows its owner, not an area')
  assert.equal(connectionDatasets({ profiles, state, sees: () => true, viewingAs: true }).find((entry) => entry.dataset.key === 'azm:my-1').dataset.problem, 'Not shown while viewing as someone else: a My view is its owner’s own.')
  // A block over someone else's My view (not in this browser) and over a removed connection.
  assert.equal(missingConnection('azm:theirs').problem, 'This is someone else’s own My view: only its owner sees it (My views stay on their owner’s computer).')
  assert.match(missingConnection('azv:gone').problem, /no longer a connection of the app/)
  assert.equal(entryOf([], 'azm:theirs', () => true).dataset.problem, missingConnection('azm:theirs').problem)
  // Saved queries: read with the viewer's own PAT — without one, or while viewing as someone else, the reason.
  assert.equal(queryReadReason(ref, ''), 'Add your PAT for dev.azure.com/example in My settings → Servers and PATs to see this: an Azure query is read with each viewer’s own PAT, and you have none for that server here.')
  assert.match(queryReadReason(ref, 'pat', true), /^Not read while viewing as someone else/)
  assert.equal(queryReadReason(ref, 'pat'), '')
  const storage = (values) => ({ getItem: (key) => values[key] ?? null })
  assert.equal(patForServer(server, [], storage({ 'demand-planning-server-pats-v1': JSON.stringify({ 'https://dev.azure.com/example': 'mine' }) })), 'mine')
  assert.equal(patForServer('https://dev.azure.com/other', [], storage({ 'demand-planning-server-pats-v1': JSON.stringify({ 'https://dev.azure.com/example': 'mine' }) })), '', 'a PAT only for its own server')
  assert.equal(patForServer(server, [], storage({})), '')
})
