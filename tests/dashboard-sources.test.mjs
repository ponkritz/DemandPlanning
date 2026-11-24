import test from 'node:test'
import assert from 'node:assert/strict'
import { azureWorkFields, azureWorkRows, azureWorkSource, capacityFields, capacityRows, capacitySource, enteredRelease, entryOf, fieldsDataset, headingMonth, historyRows, historySource, kindOfKey, kpiRows, kpiSource, mySourcePattern, releaseCountsOf, releaseFields, releaseRows, releasesSource, sourceEntries, sourceKinds } from '../src/dashboardSources.ts'
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
  assert.deepEqual(sourceKinds.map((kind) => kind.id), ['page', 'hours', 'azure', 'releases', 'capacity', 'qe', 'kpi', 'history', 'windchill'])
  for (const kind of sourceKinds) assert.ok(kind.areas.length && kind.label && kind.describe, kind.id)
  for (const key of ['page:conq', hoursSource, azureWorkSource, releasesSource, capacitySource, kpiSource, historySource, 'qe:s1', 'windchill:abc123']) assert.ok(mySourcePattern.test(key), key)
  for (const key of ['other:x', 'page:Bad Id', 'qe:', 'azure:all']) assert.equal(mySourcePattern.test(key), false, key)
  assert.deepEqual(['page:x', hoursSource, 'qe:s1', 'windchill:w', capacitySource].map(kindOfKey), ['page', 'hours', 'qe', 'windchill', 'capacity'])
  for (const fields of [azureWorkFields, capacityFields]) assert.equal(new Set(fields.map((field) => field.id)).size, fields.length, 'unique field ids')
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
