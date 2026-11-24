import test from 'node:test'
import assert from 'node:assert/strict'
import { hoursColumns, hoursDataset, hoursFor, hoursLines, hoursLinesCached, noFeature, notAvailable, otherTime } from '../src/dashboardHours.ts'
import { applyFilter, personMonths, streamTotals, totals } from '../src/dashboard.ts'
import { blankBlock, blockData, blockError, hoursSource, kpiValue, narrowRows, parseDashboard, serializeDashboard, withSource, pageDataset } from '../src/dashboardPages.ts'

// DSH-16: the Time Writing hours as a data source of the dashboard blocks — Team overview's figures, split by Feature.
const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: '', areaPath: 'p', iterationPath: 'p', tags: '', url: '', syncedAt: '' }
let next = 1
const item = (workItemType, title, extra = {}) => { const id = next++; return { ...base, key: `o/p/${id}`, id, workItemType, title, ...extra } }
const settings = { absenceEpicId: 999, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80, npraHoursPerMonth: 0, profiles: { Ana: { region: 'India', role: 'QE' }, Ben: { region: 'US', role: 'QMS' } } }
const cp = item('Epic', 'CP'), dp = item('Epic', 'DP')
const f1 = item('Feature', 'CP | A | v1', { parentId: cp.id }), f2 = item('Feature', 'CP | B | v2', { parentId: cp.id }), f3 = item('Feature', 'DP | C | v3', { parentId: dp.id })
const story = (feature) => item('User Story', `${feature.title} - Time Writing`, { parentId: feature.id })
const s1 = story(f1), s2 = story(f2), s3 = story(f3)
const npra = item('Feature', 'NPRA | trainings', { parentId: cp.id, tags: 'NPRA Hours' }), sn = story(npra), loose = item('User Story', 'DP support', { parentId: dp.id })
const task = (month, who, parent, plan, actual) => item('Task', `${month} | x`, { parentId: parent.id, assignedTo: who, originalEstimate: plan, ...(actual == null ? {} : { completedWork: actual }) })
const items = [cp, dp, f1, f2, f3, s1, s2, s3, npra, sn, loose,
  task('July 2026', 'Ana', s1, 100, 90), task('July 2026', 'Ana', s2, 40, 30), task('July 2026', 'Ana', s3, 20, 25), task('July 2026', 'Ana', sn, 10, 8),
  task('August 2026', 'Ana', s1, 80, 60), task('August 2026', 'Ben', s3, 120, 100), task('August 2026', 'Ben', loose, 10, 10),
  task('September 2026', 'Ben', s3, 50)]
const months = ['2026-07', '2026-08', '2026-09']
const lines = hoursLines(items, months, '2026-09-15', settings)
const sum = (list, key) => Math.round(list.reduce((total, line) => total + line[key], 0) * 100) / 100

test('DSH-16: the Time Writing hours are Team overview’s figures by team member, region, role, stream, Feature and month — the totals unchanged (TC-DSH-16)', () => {
  const overview = personMonths(items, months, '2026-09-15', settings)
  const all = totals(applyFilter(overview, { regions: [], roles: [], people: [], streams: [] }))
  assert.equal(sum(lines, 'planned'), all.plan, 'planned hours: Team overview’s total')
  assert.equal(sum(lines, 'booked'), all.actual, 'booked hours: Team overview’s total')
  for (const row of overview) {
    const mine = lines.filter((line) => line.person === row.person && line.month === row.month)
    assert.equal(sum(mine, 'planned'), row.plan, `${row.person} ${row.month} planned`)
    assert.equal(sum(mine, 'booked'), row.actual, `${row.person} ${row.month} booked`)
  }
  for (const stream of streamTotals(overview)) assert.equal(sum(lines.filter((line) => line.stream === stream.title), 'planned'), stream.plan, `${stream.title} planned as Team overview’s Streams`)
  const july = lines.filter((line) => line.person === 'Ana' && line.month === '2026-07')
  assert.deepEqual(july.filter((line) => line.stream === 'CP').map((line) => [line.feature, line.planned, line.booked]), [['CP | A | v1', 100, 90], ['CP | B | v2', 40, 30]], 'the stream split by Feature')
  assert.deepEqual(july.find((line) => line.stream === otherTime), { person: 'Ana', region: 'India', role: 'QE', month: '2026-07', stream: otherTime, feature: '', planned: 10, booked: 8 }, 'NPRA is other time, on no stream')
  assert.ok(lines.some((line) => line.person === 'Ben' && line.month === '2026-08' && line.stream === 'DP' && line.feature === noFeature && line.planned === 10), 'hours on a stream without a Feature')
  assert.ok(lines.filter((line) => line.person === 'Ben').every((line) => line.region === 'US' && line.role === 'QMS'))
  assert.deepEqual(hoursLines(items, [], '2026-09-15', settings), [])
  assert.equal(hoursLinesCached(items, months, '2026-09-15', settings), hoursLinesCached(items, months, '2026-09-15', settings), 'kept while nothing changes')
})

test('DSH-16: the hours as a data source — Sum / Average of planned or booked hours, grouped by its fields, the period by month; not available without Team overview (TC-DSH-16)', () => {
  const dataset = hoursDataset(lines)
  assert.equal(dataset.key, hoursSource)
  assert.equal(dataset.name, 'Time Writing hours')
  assert.deepEqual(dataset.page.columns.map((column) => column.name), hoursColumns.map((column) => column.name))
  assert.deepEqual(dataset.page.columns.find((column) => column.id === 'tw-person').options, ['Ana', 'Ben'])
  // A new block over it measures hours (never a count) and its period is on Month.
  const kpi = blankBlock(dataset, 'b1', 'kpi')
  assert.deepEqual([kpi.measure, kpi.value, kpi.period], ['sum', 'tw-planned', 'tw-month'])
  assert.equal(blockError(dataset, { ...kpi, title: 'Planned' }), '')
  assert.match(blockError(dataset, { ...kpi, title: 'Planned', measure: 'count', value: '' }), /Sum or Average of Planned hours or Booked hours/)
  assert.deepEqual(withSource(dataset, { ...blankBlock(pageDataset({ schema: 1, kind: 'on-demand-page', id: 'x', name: 'X', description: '', keyPrefix: 'X', columns: [], rows: [], insights: [] }), 'b2', 'kpi'), title: 'T' }).measure, 'sum', 'switching to the hours: Sum')
  // The period keeps the months chosen.
  const august = narrowRows(dataset, kpi, ['2026-08'])
  assert.equal(kpiValue(august.page, kpi).value, sum(lines.filter((line) => line.month === '2026-08'), 'planned'))
  const booked = { ...kpi, value: 'tw-booked', measure: 'sum' }
  assert.equal(kpiValue(dataset.page, booked).value, sum(lines, 'booked'))
  // Grouped by team member / stream / Feature.
  const byPerson = blockData(dataset.page, { ...blankBlock(dataset, 'b3', 'table'), category: 'tw-person', value: 'tw-booked' })
  assert.deepEqual(byPerson.categories.map((cat, index) => [cat.label, byPerson.categoryTotals[index]]).sort(), [['Ana', sum(lines.filter((line) => line.person === 'Ana'), 'booked')], ['Ben', sum(lines.filter((line) => line.person === 'Ben'), 'booked')]])
  const average = blockData(dataset.page, { ...blankBlock(dataset, 'b4', 'bar'), category: 'tw-stream', measure: 'average', value: 'tw-planned' })
  assert.ok(average.categories.some((cat) => cat.label === otherTime))
  // A block over the hours is kept in the file; a viewer without Team overview gets "Not available for your role."
  const file = serializeDashboard({ schema: 1, kind: 'dashboard', id: 'quality', tabs: [], filters: [{ id: 'f1', source: hoursSource, column: 'tw-region' }], blocks: [{ ...kpi, title: 'Planned hours' }] })
  const read = parseDashboard(file, 'quality')
  assert.deepEqual([read.dropped, read.dashboard.blocks[0].source, read.dashboard.filters[0].source], [[], hoursSource, hoursSource])
  const hidden = hoursFor(false, lines)
  assert.equal(hidden.problem, notAvailable)
  assert.equal(hidden.page.rows.length, 0, 'no hours reach a viewer without the right')
  assert.equal(hidden.name, 'Time Writing hours')
  assert.equal(hoursFor(true, lines).page.rows.length, lines.length)
})
