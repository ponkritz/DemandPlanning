import test from 'node:test'
import assert from 'node:assert/strict'
import { completeness, cumulative, delta, exceptionQueue, insightCards, monthUtilization, planUtilOf, questions, signedText, timelineHealth } from '../src/workspace.ts'

const bands = { overloadedAt: 100, availableBelow: 80 }
const row = (person, month, plan, capacity, extra = {}) => ({ month, status: 'elapsed', person, plan, actual: plan * 0.9, capacity, absence: 0, reserved: 0, tasks: 3, planLines: 3, blankActuals: 0, streams: [{ key: 'e1', title: 'DP', plan, actual: plan * 0.9 }], ...extra })
const item = (id, type, state, extra = {}) => ({ key: `o/p/${id}`, id, organization: 'o', project: 'p', title: `Item ${id}`, workItemType: type, state, assignedTo: 'Ana', areaPath: 'P', iterationPath: 'P', tags: '', url: `https://x/${id}`, syncedAt: '', ...extra })
const feature = (id, extra = {}) => item(id, 'Feature', 'Active', { title: `Release ${id}`, ...extra })
const baseline = (id, total, actual, extra = {}) => ({ stream: 'DP', feature: feature(id), rule: {}, scope: total == null ? undefined : { release: `Release ${id}`, stream: 'DP', history: [] }, current: total == null ? undefined : { total, units: 1, uncapped: total, capped: false, missing: [] }, actual, variance: null, growth: null, ...extra })

test('KPI helpers: deltas, signed text, month utilization and data completeness (WSP-01, WSP-02)', () => {
  assert.deepEqual(delta(78.4, 72.1), { value: 78.4, previous: 72.1, delta: 6.3 })
  assert.deepEqual(delta(null, 5).delta, null)
  assert.deepEqual([signedText(6.3, ' pp'), signedText(-2), signedText(0), signedText(null)], ['+6.3 pp', '−2', '0', '—'])
  const rows = [row('Ana', '2026-10', 120, 150), row('Ben', '2026-10', 170, 150, { blankActuals: 2, region: 'India', role: 'QE' }), row('Ana', '2026-09', 100, 150), row('Cy', '2026-11', 50, 150, { status: 'future', blankActuals: 3 })]
  const now = monthUtilization(rows, '2026-10')
  assert.deepEqual([now.plan, now.people, now.planHours, now.capacity], [96.7, 2, 290, 300])
  assert.equal(planUtilOf(rows[1]), 113.3)
  assert.deepEqual(completeness(rows, '2026-10'), { percent: 66.7, planLines: 6, blankActuals: 2, unmapped: ['Ana'] }, 'the share of planned Tasks with actuals; people without region or role listed')
  assert.deepEqual(completeness(rows, '2026-11').percent, null, 'a future month has nothing to record yet')
  assert.deepEqual(cumulative([1, 0, 2, 3]), [1, 1, 3, 6])
})

test('exception queue: over baseline, missing baseline and capacity risk, high first then by impact (WSP-03)', () => {
  const baselines = [baseline(1, 100, 160), baseline(2, 100, 110), baseline(3, null, 40), baseline(4, null, 10, { feature: feature(4, { state: 'Closed' }) }), baseline(5, 100, 130)]
  const rows = [row('Ana', '2026-10', 125, 100, { region: 'US' }), row('Ben', '2026-10', 95, 100), row('Cy', '2026-10', 105, 100), row('Ana', '2026-09', 130, 100)]
  const queue = exceptionQueue({ baselines, rows, month: '2026-10', bands, regionOf: (person) => person === 'Ana' ? 'US' : undefined })
  assert.deepEqual(queue.map((entry) => [entry.kind, entry.title, entry.impact, entry.severity, entry.region]), [
    ['over-baseline', 'Release 1', '+60%', 'high', 'US'], ['capacity-risk', 'Ana', '125% planned', 'high', 'US'],
    ['over-baseline', 'Release 5', '+30%', 'medium', 'US'], ['capacity-risk', 'Cy', '105% planned', 'medium', ''], ['missing-baseline', 'Release 3', 'n/a', 'medium', 'US'],
  ], 'within 25% (Release 2) and a closed release without scope (Release 4) are not exceptions; Ben at 95% is not a capacity risk')
  assert.equal(queue.find((entry) => entry.kind === 'capacity-risk').stream, 'DP', 'the stream with most planned hours')
  assert.equal(exceptionQueue({ baselines: [], rows, month: '2026-09', bands }).length, 1, 'the month decides the capacity rows')
})

test('timeline health: Features with a Target Date in the window per Epic — completed, overdue, at risk, planned (WSP-04)', () => {
  const items = [
    item(1, 'Epic', 'Active', { title: 'DP' }), item(2, 'Epic', 'Active', { title: 'CP' }),
    feature(10, { parentId: 1, targetDate: '2026-10-05T00:00:00Z' }), feature(11, { parentId: 1, targetDate: '2026-11-10T00:00:00Z' }), feature(12, { parentId: 1, targetDate: '2026-10-20T00:00:00Z', state: 'Closed' }),
    feature(13, { parentId: 2, targetDate: '2027-03-01T00:00:00Z' }), feature(14, { parentId: 2, targetDate: '2027-05-01T00:00:00Z' }), feature(15, { parentId: 2, targetDate: '2026-09-30T00:00:00Z' }),
    feature(16, { parentId: 2, targetDate: '2026-12-01T00:00:00Z', state: 'Removed' }), feature(17, { parentId: 2 }), item(18, 'User Story', 'Active', { parentId: 10, targetDate: '2026-10-29T00:00:00Z' }),
  ]
  const timeline = timelineHealth(items, '2026-10-28')
  assert.deepEqual([timeline.from, timeline.to], ['2026-10-01', '2027-04-28'])
  assert.deepEqual(timeline.streams, [{ name: 'DP', planned: 3, completed: 1, atRisk: 1, overdue: 1 }, { name: 'CP', planned: 1, completed: 0, atRisk: 0, overdue: 0 }], 'outside the window, Removed, without a date and User Stories left out')
  assert.deepEqual(timeline.totals, { name: 'All streams', planned: 4, completed: 1, atRisk: 1, overdue: 1 })
  assert.deepEqual(timeline.features.map((entry) => [entry.feature.id, entry.status]), [[10, 'overdue'], [12, 'completed'], [11, 'at-risk'], [13, 'planned']], 'sorted by date')
})

test('insight cards: each rule names its evidence, tone and pack line (WSP-05)', () => {
  const rows = [
    row('Ana', '2026-10', 125, 100, { blankActuals: 2 }), row('Ben', '2026-10', 80, 100), row('Ana', '2026-09', 110, 100), row('Ben', '2026-09', 90, 100), row('Ana', '2025-10', 70, 100),
    row('Ana', '2026-08', 100, 100, { streams: [{ key: 'e2', title: 'Content', plan: 100, actual: 90 }] }),
  ]
  const baselines = [baseline(1, 100, 160), baseline(2, 100, 110)]
  const snapshot = (month, dp, cp) => ({ month, streams: [{ name: 'DP', releases: dp }, { name: 'CP', releases: cp }, { name: 'IOCC', releases: 0, notSetUp: true }] })
  const timeline = timelineHealth([item(1, 'Epic', 'Active', { title: 'DP' }), feature(10, { parentId: 1, targetDate: '2026-10-05T00:00:00Z' }), feature(11, { parentId: 1, targetDate: '2026-11-10T00:00:00Z' })], '2026-10-28')
  const cards = insightCards({ month: '2026-10', rows, bands, baselines, releases: { now: snapshot('2026-10', 3, 1), previous: snapshot('2026-09', 2, 2), lastYear: snapshot('2025-10', 1, 0) }, timeline, filters: 'Filters: none' })
  assert.deepEqual(cards.map((card) => [card.id, card.tone]), [['utilization', 'danger'], ['overload', 'danger'], ['incomplete', 'warning'], ['baseline', 'danger'], ['releases', 'ok'], ['resilience', 'warning'], ['timeline', 'danger']])
  const by = (id) => cards.find((card) => card.id === id)
  assert.match(by('utilization').text, /^Planned utilization is 102\.5% in Oct 2026, \+2\.5 pp versus Sep 2026, \+32\.5 pp versus Oct 2025; 205h planned against 200h capacity for 2 people\./)
  assert.deepEqual(by('utilization').bars.map((bar) => bar.text), ['70.0%', '100.0%', '102.5%'], 'last year, previous month, this month')
  assert.deepEqual(by('overload').evidence.rows.map((entry) => entry[0]), ['Ana'])
  assert.match(by('incomplete').text, /2 of 6 planned Tasks in Oct 2026 have no Completed Work yet \(66\.7% complete\): Ana 2\/3/)
  assert.deepEqual(by('baseline').evidence.rows, [['Release 1', 'DP', '100', '160', '+60%', 'Ana']])
  assert.equal(by('releases').text, '4 completed in Oct 2026 against 4 in Sep 2026 and 1 in Oct 2025: DP 3, CP 1.')
  assert.deepEqual(by('releases').evidence.columns, ['Stream', 'Oct 2026', 'Sep 2026', 'Oct 2025'])
  assert.equal(by('releases').evidence.rows[2][1], 'not set up')
  assert.match(by('resilience').text, /^Content \(Ana 100%\)/, 'Content rests on Ana; DP is shared by Ana and Ben (last year left out)')
  assert.match(by('timeline').text, /1 of 2 Features on the timeline is open past the target date and 1 is open with a target date within 30 days: Release 10 \(2026-10-05\)\./)
  for (const card of cards) { assert.ok(card.packLine.length > 0, `${card.id} has a pack line`); assert.ok(card.quality.startsWith('Checked: '), card.id) }
  const empty = insightCards({ month: '2026-12', rows: [], bands, baselines: [], releases: { now: snapshot('2026-12', 0, 0), previous: snapshot('2026-11', 0, 0) }, timeline: timelineHealth([], '2026-12-01'), filters: 'Filters: none' })
  assert.deepEqual(empty.map((card) => [card.id, card.tone]), [['utilization', 'info'], ['baseline', 'info'], ['releases', 'ok']], 'cards without data say so or are left out')
  assert.ok(questions.every((question) => /^(queue|queue:over-baseline|card:\w+|timeline)$/.test(question.target)))
})
