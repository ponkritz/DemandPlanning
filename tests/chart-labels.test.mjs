import test from 'node:test'
import assert from 'node:assert/strict'
import { chartLabelsOn, readChartLabels, saveChartLabel } from '../src/chartLabels.ts'
import { normalizeTableDefaults, tableDefaults } from '../src/tableDefaults.ts'

const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } }

test('UI-17: data labels — off by default, the shared default from Table defaults, each chart\'s own choice wins (TC-UI-10)', () => {
  assert.equal(tableDefaults.chartDataLabels, false)
  assert.equal(normalizeTableDefaults({ chartDataLabels: true }).chartDataLabels, true)
  assert.equal(normalizeTableDefaults({ chartDataLabels: 'yes' }).chartDataLabels, false, 'only a true/false is kept')
  const storage = memory()
  assert.deepEqual(readChartLabels(storage), {})
  saveChartLabel('epic-mix', false, storage); saveChartLabel('pareto-overrun', true, storage)
  const own = readChartLabels(storage)
  assert.equal(chartLabelsOn(own, 'epic-mix', true), false, 'switched off on this chart')
  assert.equal(chartLabelsOn(own, 'pareto-overrun', false), true, 'switched on on this chart')
  assert.equal(chartLabelsOn(own, 'dashboard-demand', true), true, 'the shared default otherwise')
  storage.setItem('demand-planning-chart-labels-v1', '{"a":"x","b":true}')
  assert.deepEqual(readChartLabels(storage), { b: true }, 'only true/false values are read')
  storage.setItem('demand-planning-chart-labels-v1', 'not json')
  assert.deepEqual(readChartLabels(storage), {})
})
