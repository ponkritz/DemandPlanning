import test from 'node:test'
import assert from 'node:assert/strict'
import * as bulkEpics from '../src/bulkEpics.ts'
import { bulkEpicFor, bulkEpicMissing, loadMyBulkEpics, normalizeBulkEpics, saveMyBulkEpics, bulkSharedBlocked } from '../src/bulkEpics.ts'
import { normalizeReleaseSourceSettings } from '../src/releaseSource.ts'
import { ioccPlan, qeForName } from '../src/dpBulk.ts'
import { qeSourceOf } from '../src/qePage.ts'

const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) } }

test('QV-59: the bulk creation Epic per stream — mine over shared; none built in for any stream (TC-QV-40)', () => {
  assert.deepEqual(normalizeBulkEpics({ dp: '15000', IOCC: 0, Content: 'x', Other: 5 }), { DP: 15000 })
  assert.deepEqual(normalizeReleaseSourceSettings({ bulkEpics: { IOCC: 21000 } }).bulkEpics, { IOCC: 21000 }, 'shared in the planning data')
  for (const stream of ['DP', 'IOCC', 'Content']) assert.deepEqual(bulkEpicFor(stream, undefined, undefined), { source: 'none' }, `${stream}: no Epic built in`)
  assert.equal('builtInBulkEpics' in bulkEpics, false, 'the built-in Epic IDs are gone')
  assert.deepEqual(bulkEpicFor('DP', { DP: 15000 }, undefined), { epicId: 15000, source: 'shared' }, 'a shared mapping (in Git) is used')
  assert.deepEqual(bulkEpicFor('Content', normalizeReleaseSourceSettings({ bulkEpics: { Content: 16000 } }).bulkEpics, undefined), { epicId: 16000, source: 'shared' }, 'read back from the shared settings')
  assert.deepEqual(bulkEpicFor('DP', {}, { DP: 15001 }), { epicId: 15001, source: 'mine' })
  assert.deepEqual(bulkEpicFor('IOCC', { IOCC: 21000 }, undefined), { epicId: 21000, source: 'shared' })
  assert.deepEqual(bulkEpicFor('IOCC', { IOCC: 21000 }, { IOCC: 21001 }), { epicId: 21001, source: 'mine' })
  const storage = memory()
  saveMyBulkEpics({ IOCC: 21001 }, storage)
  assert.deepEqual(loadMyBulkEpics(storage), { IOCC: 21001 }, 'mine is kept in this browser')
  saveMyBulkEpics({}, storage)
  assert.deepEqual(loadMyBulkEpics(storage), {})
})

test('QV-59: without a mapped bulk creation Epic, Create Features says why and where to map it (TC-QV-40)', () => {
  assert.equal(bulkEpicMissing('DP'), 'No DP bulk creation Epic is set: map it in Admin → Streams → Bulk creation, or your own in My settings → My bulk creation Epics.')
  assert.match(bulkEpicMissing('Content'), /^No Content bulk creation Epic is set/)
  assert.match(bulkEpicMissing('IOCC'), /^No IOCC bulk creation Epic is set/)
})

test('QV-59: IOCC releases in bulk — the Epic setup’s DoD and stories (no Release / PU sets, DPF-09), QE by the release name from the QE page (TC-QV-40)', () => {
  const qe = qeSourceOf({ id: 'resource-mapping', columns: [{ id: 'a', name: 'Product', type: 'text', options: [] }, { id: 'b', name: 'QE', type: 'text', options: [] }], rows: [{ id: 'r1', cells: { a: 'Spectral CT', b: 'Ana Costa' } }] }, { pageId: 'resource-mapping', matchColumn: 'a', qeColumn: 'b' })
  const setup = { epicId: 21000, featureDoD: 'IOCC DoD', stories: [{ title: 'Review' }], qePage: { pageId: 'resource-mapping', matchColumn: 'a', qeColumn: 'b' } }
  assert.deepEqual(qeForName('spectral ct', qe), { product: 'Spectral CT', qe: 'Ana Costa' })
  const board = [{ id: 1, workItemType: 'Task', title: 't', assignedTo: 'Ana Costa', assignedToEmail: 'ana@x.com', state: 'Active' }]
  const release = (name, number) => ({ key: `${name} ${number}`, name, release: number, documents: 1, items: [], tracked: false, trackedBy: [], features: [] })
  const plan = ioccPlan([release('Spectral CT', '2.1.0.0'), release('Spectral CT', '2.1.0.3'), release('Spectral CT', 'beta'), release('Unknown tool', '1.0')], { setup, qe, board, epicId: 21000, featureTitle: (entry) => `IOCC | ${entry.name} | ${entry.release}`, featureMatch: () => undefined })
  assert.deepEqual(plan.map((line) => [line.type ?? '', line.set?.featureDoD ?? '', line.qe, line.email, line.skip.split(' (')[0]]), [
    ['Minor', 'IOCC DoD', 'Ana Costa', 'ana@x.com', ''],
    ['Platform Update', 'IOCC DoD', 'Ana Costa', 'ana@x.com', ''],
    ['', 'IOCC DoD', 'Ana Costa', 'ana@x.com', ''],
    ['Major', 'IOCC DoD', '', '', 'no QE on the QE page for this release name'],
  ])
  assert.match(ioccPlan([release('Spectral CT', '2.1')], { setup, qe, board, featureTitle: () => 't', featureMatch: () => undefined })[0].skip, /no IOCC bulk Epic is set/)
  assert.match(ioccPlan([release('Spectral CT', '2.1')], { setup, qe, board, epicId: 21000, featureTitle: () => 't', featureMatch: () => ({ item: { id: 9 }, score: 100 }) })[0].skip, /matches it 100%/)
})

test('QV-61: IOCC bulk creation uses the IOCC Epic\'s own Feature setup (DoD and User Stories); without a setup a release is skipped (TC-QV-42)', async () => {
  const qe = qeSourceOf({ id: 'resource-mapping', columns: [{ id: 'a', name: 'Product', type: 'text', options: [] }, { id: 'b', name: 'QE', type: 'text', options: [] }], rows: [{ id: 'r1', cells: { a: 'Spectral CT', b: 'Ana Costa' } }] }, { pageId: 'resource-mapping', matchColumn: 'a', qeColumn: 'b' })
  const own = { epicId: 21000, featureDoD: 'IOCC DoD', stories: [{ title: 'IOCC review', description: '' }], qePage: { pageId: 'resource-mapping', matchColumn: 'a', qeColumn: 'b' } }
  const board = [{ id: 1, workItemType: 'Task', title: 't', assignedTo: 'Ana Costa', assignedToEmail: 'ana@x.com', state: 'Active' }]
  const release = (number) => ({ key: number, name: 'Spectral CT', release: number, documents: 1, items: [], tracked: false, trackedBy: [], features: [] })
  const plan = ioccPlan([release('2.0.0.0'), release('2.1.0.3')], { setup: own, qe, board, epicId: 21000, featureTitle: () => 't', featureMatch: () => undefined })
  assert.deepEqual(plan.map((line) => [line.type, line.set.featureDoD, line.set.stories.map((story) => story.title)]), [['Major', 'IOCC DoD', ['IOCC review']], ['Platform Update', 'IOCC DoD', ['IOCC review']]])
  // DPF-09: no built-in Release / PU sets — without a setup a release is skipped and says why.
  const bare = ioccPlan([release('2.0.0.0')], { setup: undefined, qe, board, epicId: 21000, featureTitle: () => 't', featureMatch: () => undefined })
  assert.deepEqual([bare[0].set, bare[0].baseSkip], [undefined, 'the IOCC bulk Epic has no Feature setup (Admin → Feature & PI setup)'])
})

test('QV-59: a shared bulk creation Epic is saved straight to Git — only with a writable Git connection, else the reason (TC-QV-40)', () => {
  assert.equal(bulkSharedBlocked({ connected: true, readOnly: false, isSample: false }), '', 'connected and writable: Save to Git')
  assert.match(bulkSharedBlocked(undefined), /Connect Git storage first/)
  assert.match(bulkSharedBlocked({ connected: false, readOnly: false, isSample: false }), /Connect Git storage first/)
  assert.match(bulkSharedBlocked({ connected: true, readOnly: false, isSample: true }), /Synthetic sample data is loaded/)
  assert.match(bulkSharedBlocked({ connected: true, readOnly: true, isSample: false }), /can only read/)
})
