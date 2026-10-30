import test from 'node:test'
import assert from 'node:assert/strict'
import { snapshotFile, serializeSnapshot, parseSnapshot, snapshotDigest, applySnapshots, sharedThroughGit } from '../src/gitSnapshots.ts'
import { listFolder, readRawFile, fileSha } from '../src/gitStorage.ts'

const connection = { id: 'dp', url: 'https://ads.corp.example/tfs/Coll/DHFI', baseUrl: 'https://ads.corp.example/tfs', reason: 'DP', viewName: 'Digital Platform', role: 'release-source', query: 'SELECT [System.Id] FROM WorkItems WHERE x = 1' }
const item = (id, extra = {}) => ({ key: `coll/dhfi/${id}`, id, organization: 'Coll', project: 'DHFI', title: `Doc ${id}`, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath: 'DHFI', iterationPath: 'DHFI', tags: '', url: '', syncedAt: '2026-10-20T10:00:00Z', ...extra })
const source = (fetchedAt, n = 2) => ({ connectionId: 'dp', name: 'DP', role: 'release-source', organization: 'Coll', project: 'DHFI', query: connection.query, fetchedAt, items: Array.from({ length: n }, (_, id) => item(id)) })

test('only on-prem read-only views go through Git; the file has the settings and data, never a PAT', () => {
  assert.equal(sharedThroughGit(connection), true)
  assert.equal(sharedThroughGit({ ...connection, role: 'time-tracking' }), false, 'QMS-0025 Time Writing is fetched directly')
  assert.equal(sharedThroughGit({ ...connection, baseUrl: undefined }), false, 'cloud views are fetched directly')
  const text = serializeSnapshot(snapshotFile({ ...connection, token: 'pat' }, { ...source('2026-10-20T10:00:00Z'), fromGit: true }))
  assert.equal(text.includes('pat"') || text.includes('token') || text.includes('fromGit'), false)
  assert.equal(parseSnapshot(text).source.items.length, 2)
  assert.throws(() => parseSnapshot('{"schema":1,"kind":"azure-devops-views","views":[]}'), /not a Demand Planning view snapshot/)
})

test('an unchanged fetch has the same digest; a newer snapshot from Git replaces an older one only', async () => {
  assert.equal(await snapshotDigest(source('2026-10-20T10:00:00Z')), await snapshotDigest(source('2026-10-21T10:00:00Z')), 'fetch time does not count')
  const stamped = (at) => ({ ...source(at), items: [item(1, { syncedAt: at })] })
  assert.equal(await snapshotDigest(stamped('2026-10-20T10:00:00Z')), await snapshotDigest(stamped('2026-10-21T10:00:00Z')), 'nor each item’s own fetch time')
  assert.notEqual(await snapshotDigest(source('2026-10-20T10:00:00Z')), await snapshotDigest(source('2026-10-20T10:00:00Z', 3)))
  const file = parseSnapshot(serializeSnapshot(snapshotFile(connection, source('2026-10-20T10:00:00Z', 3))))
  const older = applySnapshots([source('2026-10-19T10:00:00Z', 1)], [file])
  assert.deepEqual([older.applied, older.sources[0].items.length, older.sources[0].fromGit], [['Digital Platform'], 3, true])
  const newer = applySnapshots([source('2026-10-21T10:00:00Z', 1)], [file])
  assert.deepEqual([newer.applied, newer.sources[0].items.length], [[], 1], 'a newer local fetch is kept')
  assert.equal(applySnapshots(undefined, [file]).sources.length, 1)
})

test('Git helpers: folder listing, raw read for large files, version id of any size', async () => {
  const config = { owner: 'me', repo: 'data', branch: 'main', path: 'azure-data' }
  const seen = []
  const fetchImpl = async (url, init = {}) => {
    seen.push(init.headers?.Accept)
    if (url.includes('/contents/azure-data?')) return Response.json([{ type: 'file', name: 'dp.json', path: 'azure-data/dp.json', sha: 'a' }, { type: 'dir', name: 'x', path: 'azure-data/x', sha: 'b' }])
    if (init.headers?.Accept === 'application/vnd.github.raw+json') return new Response('raw text')
    return Response.json({ sha: 'big', content: '', encoding: 'none' })
  }
  assert.deepEqual(await listFolder(config, 't', fetchImpl), [{ name: 'dp.json', path: 'azure-data/dp.json', sha: 'a' }])
  assert.equal(await readRawFile({ ...config, path: 'azure-data/dp.json' }, 't', fetchImpl), 'raw text')
  assert.equal(await fileSha({ ...config, path: 'azure-data/dp.json' }, 't', fetchImpl), 'big')
  assert.deepEqual(await listFolder(config, 't', async () => new Response('', { status: 404 })), [])
  assert.equal(await fileSha(config, 't', async () => new Response('', { status: 404 })), null)
})

test('a snapshot with invalid items or an unreadable fetch time is refused; unreadable local dates are replaced', () => {
  const text = (file) => serializeSnapshot(file)
  assert.throws(() => parseSnapshot(text({ ...snapshotFile(connection, source('2026-10-20T10:00:00Z')), source: { ...source('2026-10-20T10:00:00Z'), items: [null] } })), /invalid work items/)
  assert.throws(() => parseSnapshot(text({ ...snapshotFile(connection, source('2026-10-20T10:00:00Z')), source: { ...source('2026-10-20T10:00:00Z'), items: [{ id: 1 }] } })), /invalid work items/)
  assert.throws(() => parseSnapshot(text(snapshotFile(connection, source('yesterday')))), /not a Demand/)
  const file = parseSnapshot(text(snapshotFile(connection, source('2026-10-20T10:00:00Z', 3))))
  assert.deepEqual(applySnapshots([source('garbage', 1)], [file]).sources[0].items.length, 3, 'local data without a readable fetch time is replaced')
  assert.deepEqual(applySnapshots([source('2026-10-21T10:00:00Z', 1)], [{ ...file, source: { ...file.source, fetchedAt: 'garbage' } }]).applied, [], 'a snapshot without a readable fetch time never replaces data')
})

test('a snapshot fetched with another query than the connection has here is not applied (TC-CON-45)', () => {
  const file = parseSnapshot(serializeSnapshot(snapshotFile(connection, { ...source('2026-10-22T10:00:00Z', 3), query: 'SELECT [System.Id] FROM WorkItems WHERE old = 1' })))
  const result = applySnapshots([source('2026-10-20T10:00:00Z', 1)], [file], () => connection.query)
  assert.deepEqual([result.applied, result.otherQuery, result.sources[0].items.length], [[], ['Digital Platform'], 1], 'the newer old-query data does not replace the data here')
  const same = applySnapshots([source('2026-10-20T10:00:00Z', 1)], [parseSnapshot(serializeSnapshot(snapshotFile(connection, source('2026-10-22T10:00:00Z', 3))))], () => `  ${connection.query.toUpperCase()} `)
  assert.equal(same.sources[0].items.length, 3, 'the same query (spaces and letter case aside) is applied')
  assert.equal(applySnapshots(undefined, [file], () => undefined).sources.length, 1, 'a connection without a query takes the data')
})
