import test from 'node:test'
import assert from 'node:assert/strict'
import { toolDatasets, toolExpirySource, toolFields, toolMasterSource, toolRows } from '../src/dashboardSources.ts'
import { parseToolValidations } from '../src/toolValidations.ts'
import { parseDashboard } from '../src/dashboardPages.ts'
import { azureWorkFields, azureWorkRows, azureWorkSource, completedFields, completedSource, capacityFields, capacityRows, capacitySource, enteredRelease, entryOf, fieldsDataset, headingMonth, historyRows, historySource, kindOfKey, kpiRows, kpiSource, mySourcePattern, releaseCountsOf, releaseFields, releaseRows, releasesSource, sourceEntries, sourceKinds } from '../src/dashboardSources.ts'
import { notAvailable } from '../src/dashboardHours.ts'
import { blankBlock, blockData, hoursSource, kpiValue, narrowRows } from '../src/dashboardPages.ts'
import { personMonths, totals } from '../src/dashboard.ts'
import { capacityContext } from '../src/capacity.ts'
import { sampleDataset, sampleProfiles } from '../src/sampleData.ts'
import { defaultStreamReleases } from '../src/releaseOverview.ts'

// MYD-15…MYD-22: My dashboard's data sources — one registry, each kind with its declared fields, the area its role
// needs, rows from data already loaded, and totals equal to the app's own pages.
const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: '', areaPath: 'p\\QE', iterationPath: 'p\\PI 2026.4\\Sprint 2', tags: '', url: 'https://dev.azure.com/o/p/_workitems/edit/1', syncedAt: '' }
let next = 1
const item = (workItemType, title, extra = {}) => { const id = next++; return { ...base, key: `o/p/${id}`, id, workItemType, title, url: `https://dev.azure.com/o/p/_workitems/edit/${id}`, ...extra } }
const epic = item('Epic', 'CP'), feature = item('Feature', 'CP | A | v1', { parentId: epic.id, assignedTo: 'Ana', assignedToEmail: 'ana@x.com', state: 'Closed', closedDate: '2026-08-02T10:00:00Z', createdDate: '2026-01-05T08:00:00Z', tags: 'QE; Release' })
const story = item('User Story', 'Review', { parentId: feature.id, assignedTo: 'Ben' })
const task = item('Task', 'August 2026 | x', { parentId: story.id, assignedTo: 'Ana', assignedToEmail: 'ana@x.com', originalEstimate: 8, completedWork: 6.5 })
const bug = item('Bug', 'A bug', { assignedTo: 'Ana' })
const history = { ...item('Task', 'July 2026 | old'), id: -5, organization: 'history' }
const items = [epic, feature, story, task, bug, history]
const everyone = () => true

test('MYD-15: the registry — every kind declares its fields and the area it needs; keys follow one pattern; a role without the area gets “Not available for your role.” and no rows (TC-MYD-08)', () => {
  assert.deepEqual(sourceKinds.map((kind) => kind.id), ['page', 'hours', 'azure', 'releases', 'completed', 'capacity', 'qe', 'kpi', 'history', 'tools', 'windchill'])
  for (const kind of sourceKinds) assert.ok(kind.areas.length && kind.label && kind.describe, kind.id)
  for (const key of ['page:conq', hoursSource, azureWorkSource, releasesSource, completedSource, capacitySource, kpiSource, historySource, 'qe:s1', 'windchill:abc123']) assert.ok(mySourcePattern.test(key), key)
  for (const key of ['other:x', 'page:Bad Id', 'qe:', 'azure:all']) assert.equal(mySourcePattern.test(key), false, key)
  assert.deepEqual(['page:x', hoursSource, 'qe:s1', 'windchill:w', capacitySource, completedSource, releasesSource].map(kindOfKey), ['page', 'hours', 'qe', 'windchill', 'capacity', 'completed', 'releases'])
  for (const fields of [azureWorkFields, capacityFields, completedFields]) assert.equal(new Set(fields.map((field) => field.id)).size, fields.length, 'unique field ids')
  // Fail closed: no area, no rows — and the hours / capacity are never worked out.
  let counted = 0
  const input = { sees: () => false, months: ['2026-08'], today: '2026-08-15', me: { name: 'Ana' }, items, settings: capacityContext({}), releases: { state: {}, profiles: [], streamsOf: () => { counted++; return [] } }, qe: { file: null, loaded: true }, kpi: undefined, history: { file: null, loaded: true, connected: true }, windchill: [], pages: [], hours: () => { counted++; return [] } }
  const entries = sourceEntries(input)
  assert.equal(counted, 0, 'nothing worked out for a role without the areas')
  for (const entry of entries) { assert.equal(entry.dataset.problem, notAvailable, entry.dataset.key); assert.equal(entry.dataset.page.rows.length, 0) }
  assert.equal(entryOf(entries, capacitySource, () => false).dataset.problem, notAvailable)
  // A key of a kind the role cannot see stays closed even when the rows were built for someone else.
  const built = sourceEntries({ ...input, sees: everyone })
  assert.equal(entryOf(built, azureWorkSource, (area) => area === 'insights').dataset.problem, notAvailable)
  assert.equal(entryOf(built, 'page:gone', everyone).dataset.problem, 'The table page “gone” is no longer there (removed), or you cannot see it.')
  // Data not loaded yet: the source says what to load, with the action.
  assert.deepEqual([entryOf(built, kpiSource, everyone).load, entryOf(built, kpiSource, everyone).dataset.problem], ['kpi', 'Load the KPI tracker to see this.'])
  assert.equal(entryOf(sourceEntries({ ...input, sees: everyone, qe: { file: null, loaded: false } }), 'qe:s1', everyone).load, 'qe')
  assert.equal(entryOf(sourceEntries({ ...input, sees: everyone, items: [] }), azureWorkSource, everyone).load, 'azure')
  // Only wanted sources work their rows out.
  const lazy = sourceEntries({ ...input, sees: everyone }, (key) => key === azureWorkSource)
  assert.ok(entryOf(lazy, azureWorkSource, everyone).dataset.page.rows.length > 0)
  assert.equal(entryOf(lazy, capacitySource, everyone).dataset.page.rows.length, 0)
})

test('MYD-16: Azure DevOps work — Features, User Stories and Tasks with their fields, #ID links; only my own for a role with My Tasks but not the backlogs (TC-MYD-08)', () => {
  const rows = azureWorkRows(items)
  assert.deepEqual(rows.map((row) => row.key), [`#${feature.id}`, `#${story.id}`, `#${task.id}`], 'no Epic, Bug or historical row')
  const [f, , t] = rows
  assert.deepEqual([f.cells['aw-type'], f.cells['aw-state'], f.cells['aw-epic'], f.cells['aw-feature'], f.cells['aw-pi'], f.cells['aw-sprint'], f.cells['aw-created'], f.cells['aw-closed'], f.cells['aw-tags']], ['Feature', 'Closed', 'CP', 'CP | A | v1', 'PI 2026.4', 'Sprint 2', '2026-01-05', '2026-08-02', ['QE', 'Release']])
  assert.deepEqual([t.cells['aw-estimate'], t.cells['aw-completed'], t.cells['aw-feature'], t.link], ['8', '6.5', 'CP | A | v1', task.url])
  const mine = azureWorkRows(items, { email: 'ana@x.com', name: 'Ana' })
  assert.deepEqual(mine.map((row) => row.key), [`#${feature.id}`, `#${task.id}`])
  // As a dataset: Count by State, Sum of Completed work — the On-Demand aggregation.
  const input = { sees: (area) => area === 'mywork', months: [], today: '2026-08-15', me: { email: 'ana@x.com', name: 'Ana' }, items, settings: capacityContext({}), releases: { state: {}, profiles: [], streamsOf: () => [] }, qe: { file: null, loaded: true }, kpi: null, history: { file: null, loaded: true, connected: false }, windchill: [], pages: [], hours: () => [] }
  const dataset = entryOf(sourceEntries(input), azureWorkSource, input.sees).dataset
  assert.match(dataset.note, /Your own Features/)
  const bar = { ...blankBlock(dataset, 'b1', 'bar'), category: 'aw-state', period: '' }
  const data = blockData(dataset.page, bar)
  assert.deepEqual(data.categories.map((cat, at) => [cat.label, data.categoryTotals[at]]).sort(), [['Active', 1], ['Closed', 1]])
  assert.equal(kpiValue(dataset.page, { ...blankBlock(dataset, 'b2', 'kpi'), measure: 'sum', value: 'aw-completed' }).value, 6.5)
  assert.equal(dataset.page.rows.find((row) => row.key === `#${task.id}`).link, task.url, 'a drill-down row links to the work item')
  assert.equal(fieldsDataset('azure:work', 'X', 'k', 'n', azureWorkFields, [{ key: '#1', link: 'javascript:alert(1)', cells: {} }]).page.rows[0].link, undefined, 'https links only')
})

test('MYD-17: Releases per stream — a row per release Pulse Check counts; Completed and Supported per stream and month equal Pulse Check’s, entered counts included (TC-MYD-08)', () => {
  const streams = {
    '2026-09': [
      { id: 'dp', name: 'DP', fetchedAt: 'x', releases: [{ name: 'DoseNav', release: '2.1', documents: 3, approvalDate: '2026-09-04T10:00:00Z' }, { name: 'Vista', release: '1.0', documents: 1 }], documents: 4, titles: [], supported: 3, supportedEntries: [{ key: 'a', label: 'DoseNav 2.1' }, { key: 'b', label: 'Vista 1.0' }, { key: 'c', label: 'Cora 3' }] },
      { id: 'content', name: 'Content', fetchedAt: 'x', releases: [{ type: 'Labels', name: 'Pack', release: 'R5', documents: 2 }], documents: 2, titles: [] },
    ],
    '2026-10': [{ id: 'dp', name: 'DP', fetchedAt: 'x', releases: [{ name: 'DoseNav', release: '2.2', documents: 2 }], documents: 2, titles: [], supported: 1, supportedEntries: [{ key: 'd', label: 'DoseNav 2.2' }] }],
  }
  const rows = releaseRows(['2026-09', '2026-10'], (month) => streams[month])
  const count = (stream, month, status) => rows.filter((row) => row.cells['rl-stream'] === stream && row.cells['rl-month'] === `${month}-01` && row.cells['rl-status'] === status).length
  for (const [month, list] of Object.entries(streams)) for (const stream of list) {
    const pulse = releaseCountsOf(stream)
    assert.equal(count(stream.name, month, 'Completed'), pulse.completed, `${stream.name} ${month} completed`)
    assert.equal(count(stream.name, month, 'Supported'), pulse.supported ?? 0, `${stream.name} ${month} supported`)
  }
  const dose = rows.find((row) => row.cells['rl-release'] === 'DoseNav 2.1' && row.cells['rl-status'] === 'Completed')
  assert.deepEqual([dose.cells['rl-approved'], dose.cells['rl-docs'], dose.cells['rl-source']], ['2026-09-04', '3', 'Data'])
  assert.equal(rows.find((row) => row.cells['rl-stream'] === 'Content').cells['rl-type'], 'Labels')
  // QV-58: a stream without data takes the counts an Admin entered — as that many rows, marked.
  const state = { azureSources: [], releaseSourceSettings: { countOverrides: { CP: { '2026-10': { completed: 3, supported: 5 } } } } }
  const real = (month) => defaultStreamReleases(state, [], month)
  const entered = releaseRows(['2026-10'], real)
  const cp = real('2026-10').find((stream) => stream.name === 'CP')
  assert.deepEqual([entered.filter((row) => row.cells['rl-stream'] === 'CP' && row.cells['rl-status'] === 'Completed').length, entered.filter((row) => row.cells['rl-stream'] === 'CP' && row.cells['rl-status'] === 'Supported').length], [releaseCountsOf(cp).completed, releaseCountsOf(cp).supported])
  assert.ok(entered.filter((row) => row.cells['rl-stream'] === 'CP').every((row) => row.cells['rl-release'] === enteredRelease && row.cells['rl-source'] === 'Entered by an Admin'))
  // A KPI of this month's releases: Count with the period on Month.
  const dataset = fieldsDataset(releasesSource, 'Releases per stream', 'as in Pulse Check', 'n', releaseFields, rows)
  const kpi = { ...blankBlock(dataset, 'k', 'kpi'), period: 'rl-month', filters: [{ column: 'rl-status', values: ['Completed'] }] }
  assert.equal(kpiValue(narrowRows(dataset, kpi, ['2026-09']).page, kpi).value, 3, 'DP 2 + Content 1 in September')
})

test('MYD-18: Capacity and utilization — Team overview’s figures per person and month; totals equal Team overview’s (TC-MYD-08)', () => {
  const sample = sampleDataset({ organization: 'o', project: 'p', team: 't' }, '2026-10')
  const settings = capacityContext({ resourceProfiles: sampleProfiles })
  const months = ['2026-08', '2026-09', '2026-10']
  const overview = personMonths(sample.items, months, '2026-10-15', settings)
  const rows = capacityRows(sample.items, months, '2026-10-15', settings)
  assert.equal(rows.length, overview.length)
  const sum = (list, id) => Math.round(list.reduce((total, row) => total + Number(row.cells[id] || 0), 0) * 100) / 100
  const all = totals(overview)
  assert.ok(all.capacity > 0 && all.plan > 0, 'the sample has capacity and plans')
  assert.deepEqual([sum(rows, 'cp-available'), sum(rows, 'cp-planned'), sum(rows, 'cp-actual'), sum(rows, 'cp-absence')], [all.capacity, all.plan, all.actual, all.absence], 'Team overview’s totals')
  for (const month of months) assert.equal(sum(rows.filter((row) => row.cells['cp-month'] === `${month}-01`), 'cp-planned'), totals(overview.filter((row) => row.month === month)).plan, month)
  const first = overview.find((row) => row.capacity > 0 && row.actual > 0), mine = rows.find((row) => row.cells['cp-person'] === first.person && row.cells['cp-month'] === `${first.month}-01`)
  assert.equal(Number(mine.cells['cp-util']), Math.round(first.actual / first.capacity * 1000) / 10, 'utilization as Team overview’s ratio')
  assert.deepEqual([mine.cells['cp-region'], mine.cells['cp-role']], [first.region ?? '', first.role ?? ''])
  // As a dataset: Sum of Available hours by month over the period.
  const input = { sees: (area) => area === 'insights', months, today: '2026-10-15', me: {}, items: sample.items, settings, releases: { state: {}, profiles: [], streamsOf: () => [] }, qe: { file: null, loaded: true }, kpi: null, history: { file: null, loaded: true, connected: false }, windchill: [], pages: [], hours: () => [] }
  const dataset = entryOf(sourceEntries(input), capacitySource, input.sees).dataset
  assert.equal(kpiValue(dataset.page, { ...blankBlock(dataset, 'k', 'kpi'), measure: 'sum', value: 'cp-available' }).value, all.capacity)
})

test('MYD-19…MYD-22: QE Mapping sheets, KPI tracker values, historical hours and Windchill exports as sources with their natural fields (TC-MYD-08)', () => {
  const qe = { schema: 1, kind: 'qe-mapping', sheets: [{ id: 's1', name: 'DP', columns: [{ id: 'c1', name: 'Product' }, { id: 'c2', name: 'QE name' }, { id: 'c3', name: 'Hours' }], rows: [{ id: 'r1', cells: { c1: 'DoseNav', c2: 'Ana', c3: '10' } }, { id: 'r2', cells: { c1: 'Vista', c2: 'Ana', c3: '4' } }, { id: 'r3', cells: { c1: 'Cora', c2: 'Ben' } }] }] }
  const tracker = { schema: 1, fileUrl: '', fileName: 'kpi.xlsx', readAt: '', readBy: '', sheets: [{ name: 'KPIs', rows: [['KPI', 'Jan 2026', '2026-02', 'Target', 'Note'], ['On-time releases', '90%', '95', '100', 'ok'], ['Escapes', '2', 'n/a', '0', ''], ['', '1', '1', '1', '']] }] }
  const historyFile = { schema: 1, kind: 'history-hours', cutoff: '2026-10', source: 'x', sheet: 'x', importedAt: '', importedBy: '', streamEpics: {}, people: { 'A. Costa': 'Ana' }, rows: [{ person: 'A. Costa', month: '2026-03', stream: 'CP', activity: 'Review', planned: 10, actual: 8, featureId: 12 }] }
  const windchill = [{ viewId: 'w-1', name: 'ECP docs', fetchedAt: '', columns: ['Number', 'State', 'Approved On'], rows: [{ Number: 'D-1', State: 'Released', 'Approved On': '2026-09-02T10:00:00Z' }, { Number: 'D-2', State: 'Released', 'Approved On': '2026-09-20' }, { Number: 'D-3', State: 'In Work', 'Approved On': null }] }]
  const input = { sees: everyone, months: [], today: '2026-10-15', me: {}, items: [], settings: capacityContext({}), releases: { state: {}, profiles: [], streamsOf: () => [] }, qe: { file: qe, loaded: true }, kpi: tracker, history: { file: historyFile, loaded: true, connected: true }, windchill, pages: [], hours: () => [] }
  const entries = sourceEntries(input)
  const qeSet = entryOf(entries, 'qe:s1', everyone).dataset
  assert.deepEqual(qeSet.page.columns.map((column) => [column.name, column.type]), [['Product', 'text'], ['QE name', 'dropdown'], ['Hours', 'number']])
  assert.equal(qeSet.name, 'QE Mapping')
  assert.equal(entryOf(entries, 'qe:s1', (area) => area !== 'qemapping').dataset.problem, notAvailable)
  // KPI tracker: every number, the month from the heading, percent signs read.
  assert.deepEqual([headingMonth('Jan 2026'), headingMonth('2026-02'), headingMonth('March-26'), headingMonth('03/2026'), headingMonth('Target')], ['2026-01', '2026-02', '2026-03', '2026-03', ''])
  const values = kpiRows(tracker)
  assert.deepEqual(values.map((row) => [row.cells['kp-kpi'], row.cells['kp-column'], row.cells['kp-month'], row.cells['kp-value']]), [['On-time releases', 'Jan 2026', '2026-01-01', '90'], ['On-time releases', '2026-02', '2026-02-01', '95'], ['On-time releases', 'Target', '', '100'], ['Escapes', 'Jan 2026', '2026-01-01', '2'], ['Escapes', 'Target', '', '0']])
  assert.equal(entryOf(entries, kpiSource, everyone).dataset.page.rows.length, 5)
  // Historical hours under the report name.
  assert.deepEqual(historyRows(historyFile)[0].cells, { 'hs-person': 'Ana', 'hs-month': '2026-03-01', 'hs-stream': 'CP', 'hs-activity': 'Review', 'hs-type': '', 'hs-tag': '', 'hs-feature': '12', 'hs-epic': '', 'hs-planned': '10', 'hs-actual': '8' })
  assert.equal(entryOf(sourceEntries({ ...input, history: { file: null, loaded: true, connected: false } }), historySource, everyone).dataset.problem, 'Connect Git storage to see the historical hours.')
  // Windchill: an export per source, its columns typed from the values.
  const export1 = entryOf(entries, 'windchill:w-1', everyone).dataset
  assert.deepEqual(export1.page.columns.map((column) => [column.name, column.type]), [['Number', 'text'], ['State', 'dropdown'], ['Approved On', 'date']])
  assert.deepEqual(export1.page.rows.map((row) => row.cells.wc2), ['2026-09-02', '2026-09-20', ''])
  assert.equal(entryOf(entries, 'windchill:w-1', (area) => area !== 'release').dataset.problem, notAvailable)
})

test('MYD-25: Completed releases per stream per month — the Month tabs’ counts by stream and month, Windchill exports included, Counted in Pulse Check per my filter; a line with Running total is the Year chart (TC-MYD-10)', async () => {
  const { completedOf, cumulativeYear } = await import('../src/cumulativeReleases.ts')
  const state = { azureSources: [], releaseSourceSettings: { countOverrides: { CP: { '2026-09': { completed: 2 }, '2026-10': { completed: 1 } } } } }
  const columns = ['Name', 'Location', 'Last Modified']
  const windchill = { views: [{ id: 'w1', name: 'S&S IT', exportFile: 'sns.csv', columns }], sources: [{ viewId: 'w1', columns, rows: [{ Name: 'SRS', Location: '/Products/Remote Diagnostics/1.7/DHF', 'Last Modified': '2026-10-03' }] }] }
  const months = ['2026-09', '2026-10', '2026-11', '2026-12']
  const input = { sees: (area) => area === 'release', months, today: '2026-11-24', me: { name: 'Ana' }, items: [], settings: capacityContext({}), releases: { state, profiles: [], streamsOf: (month) => defaultStreamReleases(state, [], month), windchill, excluded: ['S&S IT'] }, qe: { file: null, loaded: true }, kpi: null, history: { file: null, loaded: true, connected: false }, windchill: [], pages: [], hours: () => [] }
  const dataset = entryOf(sourceEntries(input), completedSource, input.sees).dataset
  assert.deepEqual(dataset.page.columns.map((column) => [column.name, column.type]), [['Stream', 'dropdown'], ['Month', 'date'], ['Completed releases', 'number'], ['Counted in Pulse Check', 'dropdown']])
  const cells = (stream, month) => dataset.page.rows.find((row) => row.cells['cr-stream'] === stream && row.cells['cr-month'] === `${month}-01`)?.cells
  for (const month of months.slice(0, 3)) for (const entry of completedOf(state, [], windchill, month)) assert.equal(cells(entry.name, month)['cr-completed'], String(entry.completed), `${entry.name} ${month}`)
  assert.equal(dataset.page.rows.some((row) => row.cells['cr-month'] === '2026-12-01'), false, 'no month after the current one')
  assert.deepEqual([cells('S&S IT', '2026-10')['cr-counted'], cells('CP', '2026-10')['cr-counted']], ['No', 'Yes'])
  // A line by Month with Running total, split by Stream: the Year chart's running totals.
  const line = { ...blankBlock(dataset, 'l1', 'line'), category: 'cr-month', second: 'cr-stream', measure: 'sum', value: 'cr-completed', period: '', options: { cumulative: true } }
  const data = blockData(dataset.page, line)
  const year = cumulativeYear(months, months.map((month) => month > '2026-11' ? [] : completedOf(state, [], windchill, month)), '2026-11-24')
  const cp = data.series.findIndex((ser) => ser.label === 'CP')
  assert.deepEqual(data.values.map((row) => row[cp]), year.streams.find((entry) => entry.name === 'CP').cumulative.slice(0, 3))
  // Fail closed: no Release Details and no Team insights, no rows.
  assert.equal(entryOf(sourceEntries({ ...input, sees: () => false }), completedSource, () => false).dataset.problem, notAvailable)
  assert.equal(entryOf(sourceEntries({ ...input, sees: (area) => area === 'insights' }), completedSource, (area) => area === 'insights').dataset.problem, undefined, 'Team insights sees it too')
})

test('TVL-18: the Tool Validations master list and expiry list as data sources — every tool with its dates, Status and Days left as the Expiry list counts them (team default window), the expiry list without OK; closed without Release Details; usable by My dashboard and the On-Demand Dashboards (TC-TVL-12)', () => {
  const at = '2026-01-05T10:00:00Z'
  const file = parseToolValidations(JSON.stringify({ schema: 1, kind: 'tool-validations', defaultDays: 30, owners: [], sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { periodUnit: 'months', confirmed: false } }, { id: 'register', kind: 'ondemand', name: 'Tool register', ref: 'tool-register', mapping: { periodUnit: 'months', confirmed: true, name: 'c-tool' } }],
    tools: [
      { name: 'LabVIEW', version: '2020', dueDate: '2026-08-05', sources: { stream: { inSource: true }, register: { inSource: false } }, addedAt: at },
      { name: 'Minitab', version: '21', validationDate: '2024-09-01', validityMonths: 24, sources: { stream: { inSource: false } }, addedAt: at },
      { name: 'Python', version: '3.11', sources: {}, addedAt: at },
      { name: 'JMP', version: '17', validationDate: '2026-07-01', validityMonths: 36, sources: { stream: { inSource: true } }, addedAt: at },
      { name: 'R', version: '4.3', validationDate: '2024-08-01', sources: {}, addedAt: at },
    ] })).file
  assert.equal(new Set(toolFields.map((field) => field.id)).size, toolFields.length, 'unique field ids')
  assert.deepEqual(toolFields.map((field) => field.name), ['Tool', 'Version', 'Validation date', 'Validity (months)', 'Due date', 'Due date from', 'Status', 'Days left', 'Sources', 'In source now'])
  const rows = toolRows(file, '2026-08-15')
  const byTool = Object.fromEntries(rows.map((row) => [row.cells['tv-tool'], row.cells]))
  assert.deepEqual([byTool.LabVIEW['tv-status'], byTool.LabVIEW['tv-days'], byTool.LabVIEW['tv-from'], byTool.LabVIEW['tv-sources'], byTool.LabVIEW['tv-state']], ['Overdue', '-10', 'from the source', ['Tool Validations', 'Tool register'], 'In source'])
  assert.deepEqual([byTool.Minitab['tv-status'], byTool.Minitab['tv-due'], byTool.Minitab['tv-days'], byTool.Minitab['tv-from'], byTool.Minitab['tv-state']], ['Due soon', '2026-09-01', '17', 'completion date + validity period', 'Not in source now'], 'due within the team default of 30 days; from the Tool Validations query: the completion date (TVL-29)')
  assert.deepEqual([byTool.Python['tv-status'], byTool.Python['tv-days'], byTool.Python['tv-due'], byTool.Python['tv-state']], ['No due date', '', '', 'Added by hand'])
  assert.deepEqual([byTool.JMP['tv-status'], byTool.JMP['tv-months']], ['OK', '36'], 'due later: OK')
  // TVL-06 (TC-TVL-20): only a validation date — due 24 months later (default), Validity (months) 24.
  assert.deepEqual([byTool.R['tv-status'], byTool.R['tv-due'], byTool.R['tv-days'], byTool.R['tv-from'], byTool.R['tv-months']], ['Overdue', '2026-08-01', '-14', 'validation date + 24 months (default)', '24'])
  assert.deepEqual([byTool.Python['tv-months'], byTool.LabVIEW['tv-months']], ['', ''], 'no default where it gives no due date (no dates; an explicit due date)')
  assert.deepEqual(toolRows(file, '2026-08-15', true).map((row) => row.cells['tv-tool']).sort(), ['LabVIEW', 'Minitab', 'Python', 'R'], 'the expiry list leaves OK out')
  // The datasets: blocked without Release Details or without Git; else rows in the shape of a table page.
  const input = { file, connected: true, loaded: true }
  const [master, expiry] = toolDatasets(input, true, '2026-08-15')
  assert.deepEqual([master.key, expiry.key, master.name, expiry.name], [toolMasterSource, toolExpirySource, 'Tool Validations master list', 'Tool Validations expiry list'])
  assert.deepEqual([master.page.rows.length, expiry.page.rows.length], [5, 4])
  assert.deepEqual(master.page.columns.find((column) => column.name === 'Status').options, ['Due soon', 'No due date', 'OK', 'Overdue'])
  assert.match(master.note, /team default window is 30 days/)
  for (const dataset of toolDatasets(input, false, '2026-08-15')) { assert.equal(dataset.problem, notAvailable); assert.equal(dataset.page.rows.length, 0) }
  assert.match(toolDatasets({ ...input, connected: false }, true, '2026-08-15')[0].problem, /^Connect Git storage/)
  assert.equal(toolDatasets(input, true, '2026-08-15', () => false)[0].page.rows.length, 0, 'rows only when wanted')
  // My dashboard: the registry offers both for a role with Release Details; the keys are valid block sources.
  const registry = { sees: (area) => area === 'release', months: [], today: '2026-08-15', me: { name: 'Ana' }, items: [], settings: capacityContext({}), releases: { state: {}, profiles: [], streamsOf: () => [] }, qe: { file: null, loaded: true }, kpi: undefined, history: { file: null, loaded: true, connected: true }, windchill: [], pages: [], hours: () => [], tools: input }
  assert.equal(entryOf(sourceEntries(registry), toolMasterSource, registry.sees).dataset.page.rows.length, 5)
  assert.equal(entryOf(sourceEntries(registry), toolExpirySource, () => false).dataset.problem, notAvailable, 'closed for a role without Release Details')
  for (const key of [toolMasterSource, toolExpirySource]) { assert.ok(mySourcePattern.test(key), key); assert.equal(kindOfKey(key), 'tools') }
  // An On-Demand Dashboard file may name them (DSH-08); a new block on them counts every tool (no period).
  const dashboard = parseDashboard(JSON.stringify({ schema: 1, kind: 'dashboard', id: 'tool-dash', tabs: [], filters: [], blocks: [{ id: 'b1', title: 'By status', type: 'bar', source: toolMasterSource, category: 'tv-status', second: '', measure: 'count', value: '', filters: [], sort: 'value', period: '' }] }), 'tool-dash')
  assert.deepEqual(dashboard.dashboard.blocks.map((entry) => entry.source), [toolMasterSource])
  assert.equal(blankBlock(master, 'b2', 'bar').period, '', 'no period column by default')
  assert.equal(narrowRows(master, blankBlock(master, 'b3', 'kpi'), ['2026-08']).page.rows.length, 5, 'every tool counted whatever the period')
})

test('TVL-26: “Show expiry status” off — a block on the master list or expiry list neither offers nor shows Status and Days left; fields on them replaced, their filters removed; kept in the dashboard file only when off (TC-TVL-23)', async () => {
  const { blockDataset, serializeDashboard, withStatusShown, isToolSource } = await import('../src/dashboardPages.ts')
  const file = parseToolValidations(JSON.stringify({ schema: 1, kind: 'tool-validations', defaultDays: 45, owners: [], sources: [{ id: 'stream', kind: 'stream', name: 'Tool Validations', mapping: { periodUnit: 'months', confirmed: false } }],
    tools: [{ name: 'LabVIEW', version: '2020', dueDate: '2026-08-05', sources: {}, addedAt: '2026-01-05T10:00:00Z' }, { name: 'JMP', version: '17', sources: {}, addedAt: '2026-01-05T10:00:00Z' }] })).file
  const [master, expiry] = toolDatasets({ file, connected: true, loaded: true }, true, '2026-08-15')
  assert.equal(master.statusDays, 45, 'the team default window the status is worked out with (shown in ⓘ)')
  assert.ok(isToolSource(master.key) && isToolSource(expiry.key) && !isToolSource('page:x'))
  const block = { ...blankBlock(master, 'b1', 'bar'), title: 'By status', category: 'tv-status', filters: [{ column: 'tv-status', values: ['Overdue'] }, { column: 'tv-tool', values: ['LabVIEW'] }] }
  assert.equal(blockDataset(master, block), master, 'shown by default: the source as it is')
  const off = withStatusShown(master, block, false)
  assert.equal(off.hideStatus, true)
  assert.notEqual(off.category, 'tv-status', 'the category on Status replaced')
  assert.deepEqual(off.filters, [{ column: 'tv-tool', values: ['LabVIEW'] }], 'the filter on Status removed')
  const seen = blockDataset(master, off)
  assert.deepEqual(seen.page.columns.map((column) => column.name).filter((name) => name === 'Status' || name === 'Days left'), [], 'not offered, not in the drill-down')
  assert.equal(seen.page.rows.length, 2, 'the same tools')
  assert.equal(blockDataset(master, off), seen, 'worked out once per dataset')
  const narrowed = narrowRows(seen, off, ['2026-08'])
  assert.ok(!narrowed.page.columns.some((column) => column.id === 'tv-days'))
  assert.equal(withStatusShown(master, off, true).hideStatus, undefined, 'switched on again')
  // A page source never hides anything; the file keeps hideStatus only for a Tool Validations block that has it on.
  assert.equal(blockDataset(master, { ...off, source: 'page:x' }), master)
  const out = JSON.parse(serializeDashboard({ schema: 1, kind: 'dashboard', id: 'tool-dash', tabs: [], filters: [], blocks: [off, { ...block, id: 'b2' }] }))
  assert.deepEqual(out.blocks.map((entry) => entry.hideStatus), [true, undefined])
  const read = parseDashboard(JSON.stringify({ ...out, blocks: [...out.blocks, { ...out.blocks[0], id: 'b3', source: 'page:x' }] }), 'tool-dash').dashboard.blocks
  assert.deepEqual(read.map((entry) => entry.hideStatus), [true, undefined, undefined], 'read back; ignored on a page source')
})
