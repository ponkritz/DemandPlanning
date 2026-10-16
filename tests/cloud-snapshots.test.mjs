import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { freezeSnapshot, snapshotFolder, uploadSnapshot, listSnapshots } from '../src/cloudSnapshots.ts'

const state = { schemaVersion: 1, people: [], activities: [{ id: 'a' }], efforts: [{ month: '2026-10', actualHours: 5 }], baselines: [], periods: [], releases: [], audits: [], masters: [], snapshots: [{ payload: 'previous large payload' }], pat: 'must-not-copy', connection: { token: 'secret' } }
const capture = () => freezeSnapshot(state, 'LTE', '2026-10', 'tester@example.test', { version: '0.3.0' })

test('snapshot freezes source data and excludes history/connection secrets', () => {
  const item = capture()
  assert.equal(item.createdBy, 'tester@example.test')
  state.efforts[0].actualHours = 7
  assert.equal(item.data.efforts[0].actualHours, 5)
  assert.equal(item.data.snapshots, undefined)
  assert.equal(item.data.pat, undefined)
  assert.equal(item.data.connection, undefined)
  assert.notEqual(item.id, capture().id)
  assert.throws(() => freezeSnapshot(state, 'LTE', '2026-13', 'x', {}))
})

test('snapshot folder follows configured state folder and rejects traversal', () => {
  assert.equal(snapshotFolder('Demand Planning MVP/state.json'), 'Demand Planning MVP/Snapshots')
  assert.equal(snapshotFolder('state.json'), 'Snapshots')
  for (const path of ['', '../state.json', 'a/./state.json', 'a\\state.json', 'a?x/state.json']) assert.throws(() => snapshotFolder(path))
})

test('upload reports success only after exact read-back, using unique paths and no browser writes', async () => {
  const calls = []; let body
  const file = { id: 'file1', name: 'saved.json', webUrl: 'https://example.test/saved.json' }
  const request = async (path, options) => {
    calls.push({ path, options })
    if (options.method === 'PUT') { body = options.body; return Response.json(file) }
    return new Response(body)
  }
  assert.deepEqual(await uploadSnapshot(request, 'Demand Planning/Snapshots', capture()), file)
  assert.match(calls[0].path, /Demand%20Planning\/Snapshots\/2026-10-LTE-/)
  assert.match(calls[0].path, /conflictBehavior=fail/)
  assert.equal(calls[1].path, '/items/file1/content')
  assert.equal(calls[1].options.cache, 'no-store')
})

test('upload failures, denial, missing receipts and mismatched read-back never report success', async () => {
  for (const status of [401, 403, 409, 500]) {
    await assert.rejects(uploadSnapshot(async () => new Response('', { status }), 'Snapshots', capture()), /upload failed/)
  }
  await assert.rejects(uploadSnapshot(async () => { throw Error('offline') }, 'Snapshots', capture()), /offline/)
  await assert.rejects(uploadSnapshot(async () => Response.json({}), 'Snapshots', capture()), /Refresh history/)
  await assert.rejects(uploadSnapshot(async (path, options) => options.method === 'PUT' ? Response.json({ id: 'x' }) : new Response('{}'), 'Snapshots', capture()), /read-back verification failed/)
})

test('shared history handles pagination, empty folder, errors and excludes unrelated files', async () => {
  let count = 0
  const files = await listSnapshots(async () => ++count === 1 ? Response.json({ value: [{ id: 'a', name: '2026-10-LTE-abc.json', file: {}, createdDateTime: '2026-10-01' }, { name: 'other.json', file: {} }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' }) : Response.json({ value: [{ id: 'b', name: '2026-10-PI-Review-def.json', file: {}, createdDateTime: '2026-10-02' }] }), 'Snapshots')
  assert.deepEqual(files.map(x => x.id), ['b', 'a'])
  assert.equal(count, 2)
  assert.deepEqual(await listSnapshots(async () => new Response('', { status: 404 }), 'Snapshots'), [])
  await assert.rejects(listSnapshots(async () => new Response('', { status: 403 }), 'Snapshots'), /history/)
})

test('UI disables disconnected writes and store does not persist snapshot payloads in app state', () => {
  const ui = readFileSync(new URL('../src/pages/SnapshotsPage.tsx', import.meta.url), 'utf8')
  assert.match(ui, /disabled=\{!connected \|\| busy\}/)
  assert.doesNotMatch(ui, /snapshots\.unshift/)
  const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const method = source.slice(source.indexOf('async function saveSnapshot'), source.indexOf('const listSnapshots'))
  assert.match(method, /await target.saveSnapshot/)
  assert.doesNotMatch(method, /setState|localStorage|writer\.current/)
})
