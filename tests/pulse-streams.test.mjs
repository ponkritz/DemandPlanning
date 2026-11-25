import test from 'node:test'
import assert from 'node:assert/strict'
import { chosenOf, countedOnly, isCounted, notCounted, notCountedNote, pulseStreamsKey, readPulseStreams, streamNames, withChosen } from '../src/pulseStreams.ts'
import { periodComparison } from '../src/pulsePeriods.ts'
import { parseViews, serializeViews, withDefaultEntries, withDefaults, emptyViews } from '../src/personalViews.ts'

test('QV-66: the streams not counted — names compared case-insensitively, unknown names ignored, a new stream counted (TC-QV-47)', () => {
  const excluded = ['s&s it', 'Retired stream']
  const names = ['DP', 'CP', 'S&S IT', 'ECP Project A', 'New custom']
  assert.equal(isCounted(excluded, 'S&S IT'), false)
  assert.equal(isCounted(excluded, ' S&S it '), false)
  assert.equal(isCounted(excluded, 'DP'), true)
  assert.equal(isCounted(excluded, 'New custom'), true, 'a stream added later is counted')
  assert.deepEqual(notCounted(excluded, names), ['S&S IT'], 'in the stream’s own spelling; the unknown name is ignored')
  assert.equal(notCountedNote(excluded, names), 'Not counted (Streams filter): S&S IT.')
  assert.equal(notCountedNote([], names), '')
  assert.deepEqual(streamNames(['DP', 'CP'], ['cp', 'S&S IT'], [' DP ', '']), ['DP', 'CP', 'S&S IT'], 'each stream once, first spelling kept')
  assert.deepEqual(countedOnly([{ name: 'DP' }, { name: 'S&S IT' }], excluded), [{ name: 'DP' }])
})

test('QV-66: the filter keeps names not offered now when another stream is ticked, and reads only known shapes (TC-QV-47)', () => {
  const names = ['DP', 'CP', 'S&S IT']
  const excluded = ['CP', 'Custom not read yet']
  assert.deepEqual(chosenOf(excluded, names), ['CP'])
  assert.deepEqual(withChosen(excluded, names, ['CP', 'S&S IT']).excluded, ['CP', 'S&S IT', 'Custom not read yet'])
  assert.deepEqual(withChosen(excluded, names, []).excluded, ['Custom not read yet'], 'unticking CP keeps the unknown one')
  assert.equal(readPulseStreams(undefined), undefined)
  assert.equal(readPulseStreams({ excluded: 'CP' }), undefined)
  assert.deepEqual(readPulseStreams({ excluded: ['CP', 'cp', 3, '', ' DP ', 'x'.repeat(300)] }).excluded, ['CP', 'DP', 'x'.repeat(120)])
  assert.equal(readPulseStreams({ excluded: Array.from({ length: 500 }, (_, i) => `S${i}`) }).excluded.length, 200)
})

test('QV-66: a period’s total and Change leave out the streams not counted in both periods (TC-QV-47)', () => {
  const stream = (name, releases) => ({ name, releases: releases.map(String), documents: 0 })
  const rows = periodComparison([stream('DP', [1, 2, 3]), stream('S&S IT', [1, 2, 3, 4, 5])], [stream('DP', [1]), stream('S&S IT', [1, 2])])
  const shown = countedOnly(rows, ['s&s it'])
  assert.equal(rows.length, 2, 'the stream stays in the table')
  assert.deepEqual([shown.reduce((sum, row) => sum + row.releases, 0), shown.reduce((sum, row) => sum + row.previousReleases, 0)], [3, 1], 'like with like: +2, not +5')
})

test('QV-67: the team default and each person’s own choice are entries of the views files; own wins, removing it uses the team default (TC-QV-48)', () => {
  const defaults = withDefaultEntries(emptyViews(), { [pulseStreamsKey]: { excluded: ['ECP Project A'] }, [`by:${pulseStreamsKey}`]: { by: 'owner@example.com', at: '2026-11-24T10:00:00.000Z' } })
  const readBack = parseViews(serializeViews(defaults))
  assert.deepEqual(readPulseStreams(readBack.filters[pulseStreamsKey]), { excluded: ['ECP Project A'] })
  assert.deepEqual(readPulseStreams(withDefaults(emptyViews(), readBack).filters[pulseStreamsKey]).excluded, ['ECP Project A'], 'without an own choice: the team default')
  const mine = { ...emptyViews(), filters: { [pulseStreamsKey]: { excluded: [] } } }
  assert.deepEqual(readPulseStreams(withDefaults(mine, readBack).filters[pulseStreamsKey]).excluded, [], 'my own choice (count every stream) wins')
})
