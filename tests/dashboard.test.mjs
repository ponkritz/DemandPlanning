import test from 'node:test'
import assert from 'node:assert/strict'
import { personMonths, applyFilter, totals, plannedOverload, persistentOverload, concentration, rebalancing, streamTotals, change, byRole, byStream, periodMonths, quarterOf, monthStatus, noFilter } from '../src/dashboard.ts'

const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: '', areaPath: 'p', iterationPath: 'p', tags: '', url: '', syncedAt: '' }
let next = 1
const item = (workItemType, title, extra = {}) => { const id = next++; return { ...base, key: `o/p/${id}`, id, workItemType, title, ...extra } }
const settings = { absenceEpicId: 999, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80, profiles: { Ana: { region: 'India', role: 'QE' }, Ben: { region: 'India', role: 'QE' }, Cy: { region: 'US', role: 'QMS' } } }
const cp = item('Epic', 'CP'), dp = item('Epic', 'DP')
const f1 = item('Feature', 'CP | A | v1', { parentId: cp.id }), f2 = item('Feature', 'DP | B | v2', { parentId: dp.id })
const s1 = item('User Story', 'CP | A | v1 - Time Writing', { parentId: f1.id }), s2 = item('User Story', 'DP | B | v2 - Time Writing', { parentId: f2.id })
const task = (month, who, story, plan, actual) => item('Task', `${month} | x`, { parentId: story.id, assignedTo: who, originalEstimate: plan, ...(actual == null ? {} : { completedWork: actual }) })
// July–September 2026 have 23, 21 and 22 working days → 184h, 168h, 176h capacity per person.
const items = [cp, dp, f1, f2, s1, s2,
  task('July 2026', 'Ana', s1, 200, 190), task('August 2026', 'Ana', s1, 180, 170), task('September 2026', 'Ana', s1, 200, 180),
  task('July 2026', 'Ben', s1, 100, 90), task('August 2026', 'Ben', s2, 60, 60), task('September 2026', 'Ben', s2, 80, 40),
  task('September 2026', 'Cy', s2, 100), task('October 2026', 'Ana', s1, 150, 20), task('October 2026', 'Ben', s2, 20, 5)]
const months = ['2026-07', '2026-08', '2026-09', '2026-10']
const rows = personMonths(items, months, '2026-10-22', settings)

test('periods: a year with any quarters and months (none = whole year); month status against today', () => {
  assert.deepEqual(periodMonths({ year: 2026, quarters: [1], months: [] }), ['2026-01', '2026-02', '2026-03'])
  assert.deepEqual(periodMonths({ year: 2026, quarters: [4], months: [2, 11] }), ['2026-02', '2026-10', '2026-11', '2026-12'], 'quarters and months combine, without duplicates, in order')
  assert.equal(periodMonths({ year: 2025, quarters: [], months: [] }).length, 12)
  assert.equal(quarterOf('2026-08'), 3)
  assert.deepEqual(['2026-09', '2026-10', '2026-11'].map((month) => monthStatus(month, '2026-10-22')), ['elapsed', 'partial', 'future'])
})

test('person-month records: plan, actual, capacity, region and role, lines and blank actuals', () => {
  const ana = rows.find((row) => row.person === 'Ana' && row.month === '2026-07')
  assert.deepEqual([ana.plan, ana.actual, ana.capacity, ana.region, ana.role, ana.status], [200, 190, 184, 'India', 'QE', 'elapsed'])
  const cy = rows.find((row) => row.person === 'Cy')
  assert.deepEqual([cy.planLines, cy.blankActuals, cy.actual], [1, 1, 0])
  const all = totals(rows)
  assert.equal(all.plan, 1090); assert.equal(all.people, 3)
  assert.equal(totals(applyFilter(rows, { ...noFilter, roles: ['QMS'] })).plan, 100)
  assert.equal(totals(applyFilter(rows, { ...noFilter, streams: [String(dp.key)] })).plan, 260, 'a stream keeps only its hours')
  assert.equal(totals(applyFilter(rows, { ...noFilter, streams: [String(dp.key), String(cp.key)] })).plan, 1090, 'several streams add up')
  assert.equal(totals(applyFilter(rows, { ...noFilter, people: ['Ben', 'Cy'] })).people, 2, 'several people')
})

test('overload, persistent overload, concentration and rebalancing within role and month', () => {
  assert.deepEqual(plannedOverload(rows).over, ['Ana'])
  assert.deepEqual(persistentOverload(rows, months, 'plan'), ['Ana'], 'three elapsed months above capacity')
  assert.deepEqual(persistentOverload(rows, months, 'actual'), ['Ana'])
  const top = concentration(rows, 'plan')
  assert.deepEqual(top.top.map((person) => person.name), ['Ana']); assert.equal(top.of, 3)
  const moves = rebalancing(rows)
  assert.ok(moves.overload > 0)
  assert.ok(moves.receivers.every((entry) => entry.month >= '2026-10'), 'only current or future months can receive work')
})

test('streams and month-on-month change', () => {
  assert.deepEqual(streamTotals(rows).map((stream) => [stream.title, stream.plan]), [['CP', 830], ['DP', 260]])
  const roles = change(rows, '2026-08', '2026-09', byRole)
  assert.deepEqual(roles.find((row) => row.name === 'QE'), { name: 'QE', previous: 230, current: 220, change: -10, percent: -4.3 })
  assert.equal(roles.find((row) => row.name === 'QMS').previous, undefined)
  assert.equal(change(rows, '2026-08', '2026-09', byStream).find((row) => row.name === 'DP').change, -20)
})

test('rebalancing leaves people without a role out of the relief and receiver lists, and counts them apart', () => {
  const row = (person, role, plan, capacity, status = 'current') => ({ month: '2026-10', status, person, role, plan, actual: 0, capacity, absence: 0, tasks: 1, planLines: 1, blankActuals: 0, streams: [] })
  const moves = rebalancing([row('Ana', 'QE', 200, 160), row('Ben', 'QE', 100, 160), row('Dee', undefined, 220, 160), row('Eve', undefined, 100, 160)])
  assert.deepEqual(moves.needs.map((entry) => entry.person), ['Ana'], 'Dee has no role: not a relief need the rule could move')
  assert.deepEqual(moves.receivers.map((entry) => entry.person), ['Ben'], 'Eve has no role: not a receiver')
  assert.deepEqual([moves.overload, moves.headroom, moves.movable, moves.shortfall], [100, 120, 40, 60], 'gross overload and headroom count everyone; only the QE overload can move')
  assert.deepEqual(moves.unmapped, { people: 2, overload: 60, headroom: 60 })
  assert.deepEqual(rebalancing([row('Ana', 'QE', 200, 160)]).unmapped, { people: 0, overload: 0, headroom: 0 })
})
