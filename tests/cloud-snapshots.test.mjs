import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { freezeSnapshot, snapshotFolder, uploadSnapshot, listSnapshots, maxSnapshotBytes } from '../src/cloudSnapshots.ts'

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

const config = { owner: 'acme', repo: 'DemandPlanningStorage', branch: 'main', path: 'data/planning-data.json' }

test('SNP-06: snapshots go to lte-snapshots/ beside the planning data in the Git data repository', () => {
  assert.equal(snapshotFolder, 'lte-snapshots')
  assert.equal(maxSnapshotBytes, 50 * 1024 * 1024)
})

test('SNP-06: a snapshot is a new file (no version id sent), read back and compared before success, nothing kept in the browser', async () => {
  const calls = []; let stored
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === 'PUT') { stored = Buffer.from(JSON.parse(options.body).content, 'base64').toString('utf8'); return Response.json({ content: { sha: 'abc123' }, commit: { html_url: 'https://github.com/x' } }) }
    return new Response(stored)
  }
  const item = capture()
  const file = await uploadSnapshot(config, 'token', item, fetchImpl)
  assert.match(calls[0].url, /\/repos\/acme\/DemandPlanningStorage\/contents\/data\/lte-snapshots\/2026-10-LTE-[\da-f-]+\.json$/)
  assert.equal(JSON.parse(calls[0].options.body).sha, undefined, 'a new file only: an existing file is never replaced')
  assert.match(JSON.parse(calls[0].options.body).message, /^LTE — 2026-10 snapshot$/)
  assert.equal(calls[1].options.headers.Accept, 'application/vnd.github.raw+json', 'read back raw (works above 1 MB)')
  assert.equal(file.id, 'abc123')
  assert.equal(file.month, '2026-10')
  assert.equal(file.type, 'LTE')
  assert.match(file.webUrl, /^https:\/\/github\.com\/acme\/DemandPlanningStorage\/blob\/main\/data\/lte-snapshots\/2026-10-LTE-/)
})

test('SNP-06: failures, an existing file and a mismatched read-back never report success', async () => {
  for (const status of [401, 403, 422, 500]) {
    await assert.rejects(uploadSnapshot(config, 'token', capture(), async () => new Response('{}', { status })))
  }
  await assert.rejects(uploadSnapshot(config, 'token', capture(), async () => { throw Error('offline') }), /offline/)
  await assert.rejects(uploadSnapshot(config, 'token', capture(), async (url, options = {}) => options.method === 'PUT' ? Response.json({ content: { sha: 'x' } }) : new Response('{}')), /reading it back did not match/)
})

test('SNP-08: history lists only snapshot files, newest month first; a missing folder is empty; errors are reported', async () => {
  const listing = [
    { type: 'file', name: '2026-09-LTE-aaa.json', path: 'data/lte-snapshots/2026-09-LTE-aaa.json', sha: '1' },
    { type: 'file', name: '2026-10-PI-Review-bbb.json', path: 'data/lte-snapshots/2026-10-PI-Review-bbb.json', sha: '2' },
    { type: 'file', name: 'notes.json', path: 'data/lte-snapshots/notes.json', sha: '3' },
    { type: 'dir', name: '2026-11-LTE-ccc.json', path: 'x', sha: '4' },
  ]
  const files = await listSnapshots(config, 'token', async () => Response.json(listing))
  assert.deepEqual(files.map((file) => [file.name, file.type]), [['2026-10-PI-Review-bbb.json', 'PI Review'], ['2026-09-LTE-aaa.json', 'LTE']])
  assert.deepEqual(await listSnapshots(config, 'token', async (url) => new Response('', { status: url.includes('/branches/') ? 200 : 404 })), [], 'a missing folder in a readable repository')
  await assert.rejects(listSnapshots(config, 'token', async () => new Response('{}', { status: 403 })))
})

test('SNP-04: the page saves only with Git connected and a token that can write; no SharePoint code is left', () => {
  const ui = readFileSync(new URL('../src/pages/SnapshotsPage.tsx', import.meta.url), 'utf8')
  assert.match(ui, /disabled=\{!writable \|\| busy\}/)
  assert.doesNotMatch(ui, /snapshots\.unshift/)
  const hook = readFileSync(new URL('../src/useGitStorage.ts', import.meta.url), 'utf8')
  const method = hook.slice(hook.indexOf('async function saveSnapshot'), hook.indexOf('const listSnapshots'))
  assert.match(method, /isSample/)
  assert.match(method, /writeCheck/)
  assert.doesNotMatch(method, /setState|localStorage|store\.update/)
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(store, /SharePointStateClient|connectSharePoint|initializeSharePoint/, 'the SharePoint central storage is removed (backlog)')
})

test('SNP-05 (owner decision 11): a snapshot holds all the data present at the moment, hours and release data included (TC-SNP-02)', async () => {
  const { snapshotDataKeys } = await import('../src/cloudSnapshots.ts')
  const full = { ...state, azureWorkItems: [{ id: 1, originalEstimate: 8, completedWork: 6 }], capacitySettings: { hoursPerDay: 8 }, resourceProfiles: { Ana: { region: 'India' } }, baselineRules: [{ id: 'r' }], releaseScopes: [{ id: 's' }], releaseSource: { items: [{ id: 9 }] }, releasePlans: [{ id: 'p' }], windchillSources: [{ viewId: 'w', rows: [{ Name: 'x' }] }], azureSources: [{ connectionId: 'c', items: [] }], tableDefaults: { density: 'compact' }, releaseSourceSettings: { matchThreshold: 80 } }
  const item = freezeSnapshot(full, 'LTE', '2026-10', 'tester@example.test', {})
  assert.equal(item.formatVersion, 2)
  for (const key of ['azureWorkItems', 'capacitySettings', 'resourceProfiles', 'baselineRules', 'releaseScopes', 'releaseSource', 'releasePlans', 'windchillSources', 'azureSources', 'tableDefaults', 'releaseSourceSettings', 'efforts', 'periods']) assert.ok(item.data[key] !== undefined, `${key} is in the snapshot`)
  assert.equal(item.data.azureWorkItems[0].completedWork, 6, 'the hours are there')
  assert.equal(item.data.snapshots, undefined, 'never earlier snapshots')
  assert.equal(item.data.pat, undefined, 'nothing outside the app data')
  assert.ok(!snapshotDataKeys.includes('snapshots'))
})
