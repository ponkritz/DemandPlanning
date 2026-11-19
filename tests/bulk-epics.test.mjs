import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkEpicFor, loadMyBulkEpics, normalizeBulkEpics, saveMyBulkEpics } from '../src/bulkEpics.ts'
import { normalizeReleaseSourceSettings } from '../src/releaseSource.ts'
import { ioccPlan, qeForName } from '../src/dpBulk.ts'

const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) } }

test('QV-59: the bulk creation Epic per stream — mine over shared over built in; IOCC has none built in (TC-QV-40)', () => {
  assert.deepEqual(normalizeBulkEpics({ dp: '15000', IOCC: 0, Content: 'x', Other: 5 }), { DP: 15000 })
  assert.deepEqual(normalizeReleaseSourceSettings({ bulkEpics: { IOCC: 21000 } }).bulkEpics, { IOCC: 21000 }, 'shared in the planning data')
  assert.deepEqual(bulkEpicFor('DP', undefined, undefined), { epicId: 13946, source: 'built-in' })
  assert.deepEqual(bulkEpicFor('Content', undefined, undefined), { epicId: 22919, source: 'built-in' })
  assert.deepEqual(bulkEpicFor('IOCC', undefined, undefined), { source: 'none' })
  assert.deepEqual(bulkEpicFor('IOCC', { IOCC: 21000 }, undefined), { epicId: 21000, source: 'shared' })
  assert.deepEqual(bulkEpicFor('IOCC', { IOCC: 21000 }, { IOCC: 21001 }), { epicId: 21001, source: 'mine' })
  const storage = memory()
  saveMyBulkEpics({ IOCC: 21001 }, storage)
  assert.deepEqual(loadMyBulkEpics(storage), { IOCC: 21001 }, 'mine is kept in this browser')
  saveMyBulkEpics({}, storage)
  assert.deepEqual(loadMyBulkEpics(storage), {})
})

test('QV-59: IOCC releases in bulk by the DP rules — type from the number, set from the Epic setup, QE by the release name (TC-QV-40)', () => {
  const qeMapping = { sheets: [{ name: 'Map', columns: [{ id: 'a', name: 'Product' }, { id: 'b', name: 'QE' }], rows: [{ cells: { a: 'Spectral CT', b: 'Ana Costa' } }] }] }
  const setup = { epicId: 21000, qeColumns: { matchColumn: 'Product', qeColumn: 'QE' }, releaseTypes: { release: { featureDoD: 'IQ/OQ complete', stories: [{ title: 'PRD' }] }, pu: { featureDoD: 'DT finished', stories: [{ title: 'SFV' }] } } }
  assert.deepEqual(qeForName('spectral ct', qeMapping, setup.qeColumns), { product: 'Spectral CT', qe: 'Ana Costa' })
  const board = [{ id: 1, workItemType: 'Task', title: 't', assignedTo: 'Ana Costa', assignedToEmail: 'ana@x.com', state: 'Active' }]
  const release = (name, number) => ({ key: `${name} ${number}`, name, release: number, documents: 1, items: [], tracked: false, trackedBy: [], features: [] })
  const plan = ioccPlan([release('Spectral CT', '2.1.0.0'), release('Spectral CT', '2.1.0.3'), release('Spectral CT', 'beta'), release('Unknown tool', '1.0')], { setup, qeMapping, board, epicId: 21000, featureTitle: (entry) => `IOCC | ${entry.name} | ${entry.release}`, featureMatch: () => undefined })
  assert.deepEqual(plan.map((line) => [line.type ?? '', line.set?.featureDoD ?? '', line.qe, line.email, line.skip.split(' (')[0]]), [
    ['Minor', 'IQ/OQ complete', 'Ana Costa', 'ana@x.com', ''],
    ['Platform Update', 'DT finished', 'Ana Costa', 'ana@x.com', ''],
    ['', '', 'Ana Costa', 'ana@x.com', 'no release type from the release number “beta”'],
    ['Major', 'IQ/OQ complete', '', '', 'no QE in the QE Mapping for this release name'],
  ])
  assert.match(ioccPlan([release('Spectral CT', '2.1')], { setup, qeMapping, board, featureTitle: () => 't', featureMatch: () => undefined })[0].skip, /no IOCC bulk Epic is set/)
  assert.match(ioccPlan([release('Spectral CT', '2.1')], { setup, qeMapping, board, epicId: 21000, featureTitle: () => 't', featureMatch: () => ({ item: { id: 9 }, score: 100 }) })[0].skip, /matches it 100%/)
})
