import test from 'node:test'
import assert from 'node:assert/strict'
import { anomalies, monthForecast, planAccuracy, resilience, streamMomentum } from '../src/insights.ts'
import { concentration, defaultBands } from '../src/dashboard.ts'
import { normalizeCapacitySettings } from '../src/capacity.ts'
import { defaultInsightThresholds, normalizeInsightThresholds } from '../src/insightThresholds.ts'

const row = (person, month, plan, actual, extra = {}) => ({ month, status: month < '2026-10' ? 'elapsed' : month === '2026-10' ? 'partial' : 'future', person, role: 'QE', plan, actual, capacity: 160, absence: 0, tasks: 1, planLines: 4, blankActuals: 0, streams: [{ key: 'cp', title: 'CP', plan, actual }], ...extra })
const bands = (change) => ({ ...defaultBands, thresholds: { ...defaultInsightThresholds, ...change } })

test('CAP-47: each insight threshold moves its insight; the built-in values give the results as before', () => {
  // Forecast: 12% ahead at month end — ahead with ±10%, on track with ±15%.
  const forecast = [row('Ana', '2026-10', 100, 112)]
  assert.equal(monthForecast(forecast, '2026-10', '2026-10-31').people[0].status, 'ahead')
  assert.equal(monthForecast(forecast, '2026-10', '2026-10-31', bands({ forecastOnTrack: 15 })).people[0].status, 'on-track')
  // Plan accuracy: error and bias 18% — uneven with 15% / 20%; reliable at 20%; over-runs at a bias limit of 15%.
  const months = [row('Ben', '2026-07', 100, 118), row('Ben', '2026-08', 100, 118)]
  assert.equal(planAccuracy(months).team.verdict, 'uneven')
  assert.equal(planAccuracy(months, bands({ accuracyReliable: 20 })).team.verdict, 'reliable')
  assert.equal(planAccuracy(months, bands({ accuracyBias: 15 })).team.verdict, 'over-runs')
  // Resilience: Ana carries 85% of the stream — a single point at 80%, not at 90%.
  const shared = [row('Ana', '2026-08', 85, 85), row('Ben', '2026-08', 15, 15)]
  assert.equal(resilience(shared).streams[0].singlePoint, true)
  assert.equal(resilience(shared, bands({ resilienceSinglePoint: 90 })).streams[0].singlePoint, false)
  assert.equal(resilience(shared, bands({ resilienceSpecialist: 100 })).people.every((person) => !person.specialist), false, 'everyone is 100% on one stream')
  // Unusual months: a 40% spike is not unusual at 50%, is at 30%; three months needed by default, four asked.
  const history = [row('Cy', '2026-05', 100, 100), row('Cy', '2026-06', 100, 100), row('Cy', '2026-07', 100, 140)]
  assert.deepEqual(anomalies(history), [])
  assert.equal(anomalies(history, bands({ unusualChange: 30 })).length, 1)
  assert.deepEqual(anomalies(history, bands({ unusualChange: 30, unusualMinMonths: 4 })), [])
  // Momentum: windows of 1 month compare August with July.
  const trend = [row('Di', '2026-07', 50, 50), row('Di', '2026-08', 100, 100)]
  assert.equal(streamMomentum(trend, ['2026-07', '2026-08'], bands({ momentumMonths: 1 })).streams[0].trend, 'rising')
  assert.equal(streamMomentum(trend, ['2026-07', '2026-08'], bands({ momentumMonths: 1, momentumChange: 150 })).streams[0].trend, 'steady')
  // Concentration: the top 20% of 5 people is 1 person, the top 40% is 2.
  const five = ['A', 'B', 'C', 'D', 'E'].map((name, at) => row(name, '2026-08', 10, 10 * (at + 1)))
  assert.equal(concentration(five, 'actual').top.length, 1)
  assert.equal(concentration(five, 'actual', bands({ concentrationTop: 40 })).top.length, 2)
})

test('CAP-47: insight thresholds read from Git are checked; the built-in values are not stored', () => {
  assert.equal(normalizeInsightThresholds({ ...defaultInsightThresholds }), undefined)
  assert.equal(normalizeInsightThresholds('x'), undefined)
  const read = normalizeInsightThresholds({ forecastOnTrack: 12, accuracyReliable: 0, momentumMonths: 2.5, unusualMinMonths: 4, healthGreen: '80', healthAmber: 'x', persistentMonths: 99 })
  assert.deepEqual(read, { ...defaultInsightThresholds, forecastOnTrack: 12, unusualMinMonths: 4, healthGreen: 80 }, 'out of range, not whole months or not numbers take the built-in value')
  assert.deepEqual([normalizeInsightThresholds({ healthGreen: 40, healthAmber: 60 })], [undefined], 'amber at or above green: both back to the built-in values')
  assert.equal(normalizeCapacitySettings({ insightThresholds: { forecastOnTrack: 12 } }).insightThresholds.forecastOnTrack, 12)
  assert.equal('insightThresholds' in normalizeCapacitySettings({}), false)
})
