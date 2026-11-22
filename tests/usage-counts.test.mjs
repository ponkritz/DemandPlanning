import test from 'node:test'
import assert from 'node:assert/strict'
import { loadUsage, recordVisit, setUsageEnabled, usageKey, usageRows } from '../src/usageCounts.ts'

const memory = (initial = {}) => { const data = new Map(Object.entries(initial)); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), data } }

test('NAV-45: page usage is off until turned on; nothing is counted or stored while off (TC-NAV-45)', () => {
  const storage = memory()
  assert.deepEqual(loadUsage(storage), { enabled: false, counts: {} })
  recordVisit('board', storage)
  assert.equal(storage.data.size, 0, 'nothing written while off')
})

test('NAV-45: on, each opening of a page counts; off deletes the counts; most used first (TC-NAV-45)', () => {
  const storage = memory()
  assert.deepEqual(setUsageEnabled(true, storage, '2026-11-21'), { enabled: true, since: '2026-11-21', counts: {} })
  for (const page of ['board', 'mywork', 'board', 'admin', 'board']) recordVisit(page, storage)
  recordVisit('no-such-page', storage)
  const usage = loadUsage(storage)
  assert.deepEqual(usage.counts, { board: 3, mywork: 1, admin: 1 }, 'unknown pages are not counted')
  assert.deepEqual(usageRows(usage).map((row) => [row.id, row.count]), [['board', 3], ['mywork', 1], ['admin', 1]], 'ties by label: My Tasks [Board] before Settings')
  assert.equal(usageRows(usage)[0].label, 'Backlogs', 'shown with the menu label')
  assert.deepEqual(setUsageEnabled(true, storage, '2026-11-22').counts, {}, 'start again from zero')
  setUsageEnabled(false, storage)
  assert.equal(storage.getItem(usageKey), null, 'turning it off deletes the counts')
})

test('NAV-45: a tampered or broken entry is read safely (TC-NAV-45)', () => {
  assert.deepEqual(loadUsage(memory({ [usageKey]: '{not json' })), { enabled: false, counts: {} })
  assert.deepEqual(loadUsage(memory({ [usageKey]: JSON.stringify({ enabled: 'yes', counts: { board: 5 } }) })), { enabled: false, counts: {} })
  assert.deepEqual(loadUsage(memory({ [usageKey]: JSON.stringify({ enabled: true, since: '<b>', counts: { board: 2, admin: -1, mywork: 1.5, __proto__: 3, x: 4 } }) })), { enabled: true, counts: { board: 2 } })
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
  assert.deepEqual(loadUsage(broken), { enabled: false, counts: {} }); assert.doesNotThrow(() => setUsageEnabled(true, broken)); assert.doesNotThrow(() => recordVisit('board', broken))
})
