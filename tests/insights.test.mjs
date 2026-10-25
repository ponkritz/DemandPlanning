import test from 'node:test'
import assert from 'node:assert/strict'
import { anomalies, elapsedShare, healthScore, monthForecast, planAccuracy, resilience, streamMomentum } from '../src/insights.ts'

const row = (person, month, plan, actual, extra = {}) => ({ month, status: month < '2026-10' ? 'elapsed' : month === '2026-10' ? 'partial' : 'future', person, role: 'QE', plan, actual, capacity: 160, absence: 0, tasks: 1, planLines: 4, blankActuals: 0, streams: [{ key: 'cp', title: 'CP', plan, actual }], ...extra })

test('elapsed share counts the weekdays gone, today included; past months are whole, future ones empty', () => {
  assert.equal(elapsedShare('2026-10', '2026-10-01'), 1 / 22, 'October 2026 has 22 weekdays; the 1st is a Thursday')
  assert.equal(elapsedShare('2026-10', '2026-10-04'), 2 / 22, 'a Sunday counts the weekdays before it')
  assert.equal(elapsedShare('2026-10', '2026-10-31'), 1)
  assert.equal(elapsedShare('2026-09', '2026-10-15'), 1)
  assert.equal(elapsedShare('2026-11', '2026-10-15'), 0)
})

test('month-end forecast projects the run rate and classifies people against plan and capacity', () => {
  // 2026-10-16 (Friday): 12 of 22 weekdays gone.
  const rows = [row('Ana', '2026-10', 160, 80), row('Ben', '2026-10', 160, 60), row('Cy', '2026-10', 100, 100), row('Dee', '2026-10', 120, 0)]
  const forecast = monthForecast(rows, '2026-10', '2026-10-16')
  assert.equal(forecast.share, 55)
  const by = Object.fromEntries(forecast.people.map((entry) => [entry.person, entry]))
  assert.deepEqual([by.Ana.projected, by.Ana.status], [146.67, 'on-track'], '80h in 12 of 22 weekdays → 146.67h: within 10% of 160h')
  assert.deepEqual([by.Ben.projected, by.Ben.status], [110, 'behind'])
  assert.deepEqual([by.Cy.projected, by.Cy.status], [183.33, 'over-capacity'], 'above the 160h capacity')
  assert.equal(by.Dee.status, 'no-data')
  assert.deepEqual(forecast.counts, { ahead: 0, 'on-track': 1, behind: 1, 'over-capacity': 1, 'no-data': 1 })
  assert.equal(monthForecast([row('Ana', '2026-09', 160, 150)], '2026-09', '2026-10-16').people[0].projected, 150, 'a past month projects its actual')
})

test('plan accuracy: error and bias per person over elapsed months, with verdicts', () => {
  const rows = [row('Ana', '2026-07', 100, 95), row('Ana', '2026-08', 100, 110), row('Ben', '2026-07', 100, 60), row('Ben', '2026-08', 100, 70), row('Cy', '2026-07', 100, 140), row('Dee', '2026-07', 100, 70), row('Dee', '2026-08', 100, 130), row('Eve', '2026-10', 100, 10)]
  const accuracy = planAccuracy(rows)
  const by = Object.fromEntries(accuracy.people.map((entry) => [entry.person, entry]))
  assert.deepEqual([by.Ana.error, by.Ana.bias, by.Ana.verdict], [7.5, 2.5, 'reliable'])
  assert.deepEqual([by.Ben.error, by.Ben.bias, by.Ben.verdict], [35, -35, 'under-records'])
  assert.deepEqual([by.Cy.error, by.Cy.bias, by.Cy.verdict], [40, 40, 'over-runs'])
  assert.deepEqual([by.Dee.error, by.Dee.bias, by.Dee.verdict], [30, 0, 'uneven'], 'large swings that cancel out are uneven, not reliable')
  assert.equal(by.Eve, undefined, 'the partial month does not count')
  assert.equal(accuracy.months, 2)
  assert.deepEqual(accuracy.byMonth.map((entry) => entry.month), ['2026-07', '2026-08'])
})

test('stream momentum compares the latest elapsed months with the ones before', () => {
  const stream = (key, plan, actual) => ({ key, title: key.toUpperCase(), plan, actual })
  const rows = []
  for (const month of ['2026-04', '2026-05', '2026-06']) rows.push(row('Ana', month, 100, 100, { streams: [stream('cp', 50, 50), stream('dp', 50, 50)] }))
  for (const month of ['2026-07', '2026-08', '2026-09']) rows.push(row('Ana', month, 100, 100, { streams: [stream('cp', 20, 20), stream('dp', 60, 60), stream('new', 20, 20)] }))
  rows.push(row('Ana', '2026-10', 100, 30, { streams: [stream('cp', 100, 30)] }))
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
  const result = streamMomentum(rows, months)
  assert.deepEqual([result.recentMonths, result.earlierMonths], [['2026-07', '2026-08', '2026-09'], ['2026-04', '2026-05', '2026-06']], 'the partial month is left out')
  const by = Object.fromEntries(result.streams.map((entry) => [entry.key, entry]))
  assert.deepEqual([by.cp.recent, by.cp.earlier, by.cp.change, by.cp.trend], [20, 50, -60, 'falling'])
  assert.deepEqual([by.dp.change, by.dp.trend, by.dp.shareRecent, by.dp.shareEarlier], [20, 'rising', 60, 50])
  assert.equal(by.new.trend, 'new')
  assert.equal(streamMomentum(rows.slice(0, 2), ['2026-04', '2026-05']).streams[0].trend, 'steady', 'without earlier months there is no trend')
})

test('resilience finds streams resting on one person and specialists', () => {
  const stream = (key, actual) => ({ key, title: key.toUpperCase(), plan: actual, actual })
  const rows = [
    row('Ana', '2026-08', 100, 100, { streams: [stream('cp', 90), stream('dp', 10)] }),
    row('Ben', '2026-08', 100, 100, { streams: [stream('cp', 10), stream('dp', 90)] }),
    row('Cy', '2026-08', 100, 100, { streams: [stream('iocc', 100)] }),
    row('Dee', '2026-10', 100, 50, { streams: [stream('iocc', 50)] }),
  ]
  const result = resilience(rows)
  const streams = Object.fromEntries(result.streams.map((entry) => [entry.key, entry]))
  assert.deepEqual([streams.cp.top, streams.cp.topShare, streams.cp.singlePoint], ['Ana', 90, true])
  assert.deepEqual([streams.iocc.people, streams.iocc.singlePoint], [1, true], 'the partial month does not count')
  assert.equal(result.singlePoints, 3)
  const people = Object.fromEntries(result.people.map((entry) => [entry.person, entry]))
  assert.deepEqual([people.Ana.main, people.Ana.mainShare, people.Ana.specialist], ['CP', 90, true])
  assert.equal(people.Cy.specialist, true)
  assert.equal(result.specialists, 3)
})

test('unusual months: a spike or drop against the median of the other elapsed months', () => {
  const rows = [row('Ana', '2026-06', 100, 100), row('Ana', '2026-07', 100, 100), row('Ana', '2026-08', 100, 20), row('Ana', '2026-09', 100, 100), row('Ben', '2026-08', 100, 10), row('Ben', '2026-09', 100, 100)]
  const found = anomalies(rows)
  assert.deepEqual(found.map((entry) => [entry.person, entry.month, entry.kind, entry.change]), [['Ana', '2026-08', 'drop', -80]])
  assert.equal(found.some((entry) => entry.person === 'Ben'), false, 'fewer than 3 elapsed months')
  assert.deepEqual(anomalies([row('Ana', '2026-06', 100, 100), row('Ana', '2026-07', 100, 100), row('Ana', '2026-08', 100, 95)]), [], 'a 5% difference is not unusual')
})

test('health score averages the components that have data', () => {
  const rows = [row('Ana', '2026-08', 150, 150), row('Ben', '2026-08', 200, 150, { blankActuals: 2 }), row('Cy', '2026-08', 40, 30, { streams: [{ key: 'dp', title: 'DP', plan: 40, actual: 30 }] })]
  const health = healthScore(rows, ['2026-08'])
  assert.equal(health.overall.balance, 33.3, 'only Ana (93.8%) is planned in the 80–100% band of 160h; Ben is over, Cy spare')
  assert.equal(health.overall.recording, 83.3, '10 of 12 planned Tasks have an actual')
  assert.equal(health.overall.resilience, 50, 'CP is shared by Ana and Ben (50% each); DP rests on Cy alone')
  assert.equal(health.overall.score, 56, 'round((33.3 + 83.3 + 50) / 3)')
  assert.equal(healthScore([], ['2026-08']).overall.score, null)
})

test('the Settings bands decide what counts as over capacity and balanced', () => {
  const rows = [row('Ana', '2026-08', 150, 150), row('Ben', '2026-08', 100, 100), row('Cy', '2026-08', 176, 170)]
  const strict = { overloadedAt: 90, availableBelow: 70 }
  assert.equal(healthScore(rows, ['2026-08']).overall.balance, 33.3, 'default bands 80–100%: only Ana (93.8%) is balanced')
  assert.equal(healthScore(rows, ['2026-08'], strict).overall.balance, 0, 'at 70–90% nobody is balanced: Ana and Cy are over, Ben (62.5%) spare')
  const forecast = monthForecast([row('Cy', '2026-10', 100, 100)], '2026-10', '2026-10-16', strict)
  assert.equal(forecast.people[0].status, 'over-capacity', '183h projected is above 90% of 160h')
  assert.equal(monthForecast([row('Ben', '2026-10', 100, 80)], '2026-10', '2026-10-16', strict).people[0].status, 'over-capacity', '146.7h ≥ 144h (90% of 160h)')
  assert.equal(monthForecast([row('Ben', '2026-10', 100, 80)], '2026-10', '2026-10-16').people[0].status, 'ahead', 'at the default 100% the same projection is only more than planned')
})
