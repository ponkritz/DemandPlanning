import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCountOverrides, normalizeReleaseSourceSettings } from '../src/releaseSource.ts'
import { completedCount, defaultStreamReleases, supportedCount } from '../src/releaseOverview.ts'
import { releaseComparison } from '../src/pulseCheck.ts'
import { packStreamsOf } from '../src/packInputs.ts'

test('QV-58: entered release counts — CP, DP and IOCC only, months YYYY-MM, whole numbers (TC-QV-39)', () => {
  assert.deepEqual(normalizeCountOverrides({ cp: { '2026-10': { completed: 3, supported: '5' }, '2026-13': { completed: 1 }, '2026-09': { completed: -1, supported: 2.5 } }, Content: { '2026-10': { completed: 1 } }, DP: { '2026-10': {} } }), { CP: { '2026-10': { completed: 3, supported: 5 } } })
  assert.equal(normalizeCountOverrides('x'), undefined)
  assert.deepEqual(normalizeReleaseSourceSettings({ countOverrides: { IOCC: { '2026-11': { supported: 4 } } } }).countOverrides, { IOCC: { '2026-11': { supported: 4 } } })
})

test('QV-58: a stream without data takes the entered counts, marked; without them it is a placeholder; data always wins (TC-QV-39)', () => {
  const state = { azureSources: [], releaseSourceSettings: { countOverrides: { CP: { '2026-10': { completed: 3, supported: 5 } } } } }
  const streams = defaultStreamReleases(state, [], '2026-10')
  const cp = streams.find((stream) => stream.name === 'CP'), dp = streams.find((stream) => stream.name === 'DP'), content = streams.find((stream) => stream.name === 'Content')
  assert.equal(cp.noData, 'not set up')
  assert.deepEqual([completedCount(cp), supportedCount(cp)], [3, 5], 'entered counts used')
  assert.equal(dp.noData, 'not set up')
  assert.equal(dp.entered, undefined, 'no entered counts: a placeholder')
  assert.equal(content.noData, undefined, 'only CP, DP and IOCC take entered counts')
  assert.equal(completedCount({ releases: [{}, {}], entered: { completed: 9 }, noData: '' }), 2, 'with data, the data counts')
  const compared = releaseComparison(streams, defaultStreamReleases(state, [], '2026-09')).find((row) => row.name === 'CP')
  assert.deepEqual([compared.releases, compared.supported, compared.previousReleases], [3, 5, 0], 'Pulse Check compares the entered month')
  const pack = packStreamsOf(state, [], { views: [], sources: [] }, '2026-10').find((row) => row.name === 'CP')
  assert.deepEqual(pack, { name: 'CP', releases: ['3 completed releases (entered)'], supported: 5 }, 'the Monthly pack shows them as entered')
})
