import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { listAzureConnectionProfiles, loadAzureConnectionProfile, loadServerPat, saveAzureConnectionProfile } from '../src/azureCredentials.ts'
import { applyViewRemovals, compareViewsWithGit, markRemovalsApplied, markViewsSynced, mergeViews, notRemoved, parseViewRemovals, parseViews, removalBlocked, removalNotice, removalsPending, removedFromGit, serializeViewRemovals, serverKey, syncViewsFromGit, withRemoval, withoutRemoval } from '../src/viewDefinitions.ts'
import { clearRemovalInGit, readRemovals, removeViewInGit, viewDataFiles } from '../src/viewRemoval.ts'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'
import { privateGitWrites } from '../src/gitStorage.ts'

// CON-109…CON-112 (TC-CON-68, TC-CON-69): the Tool Owner removes or deletes a shared view for everyone. Synthetic data only.
const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) } }
const view = (id, viewName, extra = {}) => ({ id, reason: viewName, viewName, role: 'reference', url: 'https://tfs.example.invalid/Coll/Project', baseUrl: 'https://tfs.example.invalid/Coll', query: `SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '${viewName}'`, ...extra })
const pedestal = view('pedestal-x', 'Pedestal X'), audit = view('audit-y', 'Audit Y')
const repo = 'example/storage@main:azure-views.json'
const removal = (target, at = '2026-11-25T09:00:00.000Z', mode = 'remove') => ({ id: target.id, name: target.viewName, by: 'owner@example.com', at, mode, backup: `azure-views-backups/azure-views-x-removed-${target.id}.json`, view: target })

test('CON-111: a removal marker is applied once — the shared view goes (also when changed here), My views and PATs stay (TC-CON-68)', () => {
  const storage = memory()
  saveAzureConnectionProfile({ ...pedestal, query: 'SELECT [System.Id] FROM WorkItems WHERE changed = 1', token: 'synthetic-view-pat' }, storage)
  saveAzureConnectionProfile({ ...audit, token: '' }, storage)
  saveAzureConnectionProfile({ ...view('pedestal-x-mine', 'My Pedestal'), mine: true, token: '' }, storage)
  markViewsSynced([pedestal, audit], storage)
  const markers = parseViewRemovals(serializeViewRemovals([removal(pedestal), removal(view('mine-only', 'Not here'))]))
  assert.equal(markers.length, 2)
  assert.equal(JSON.stringify(markers).includes('synthetic-view-pat'), false, 'no PAT in the marker')
  const gone = applyViewRemovals(markers, repo, storage)
  assert.deepEqual(gone.map((entry) => entry.id), ['pedestal-x'], 'removed although it was changed here')
  assert.deepEqual(listAzureConnectionProfiles(storage).map((entry) => entry.id).sort(), ['audit-y', 'pedestal-x-mine'], 'the other shared view and My view stay')
  assert.equal(loadServerPat(serverKey(pedestal), storage), 'synthetic-view-pat', 'a PAT saved only on the view becomes its server PAT')
  assert.equal(loadAzureConnectionProfile('audit-y', storage).token, 'synthetic-view-pat', 'and serves the views on that server')
  assert.match(removalNotice(gone), /^The Tool Owner removed 1 shared view: Pedestal X\. .*My views.*PATs are kept\.$/)
  assert.deepEqual(removalsPending(markers, repo, storage), [], 'recorded as applied')
  // Set up again here by the person afterwards: the same marker does not remove it again.
  saveAzureConnectionProfile({ ...pedestal, token: '' }, storage)
  assert.deepEqual(applyViewRemovals(markers, repo, storage), [])
  assert.ok(loadAzureConnectionProfile('pedestal-x', storage))
  // A new marker (removed again later) applies; a marker of another repository is separate.
  assert.deepEqual(applyViewRemovals([removal(pedestal, '2026-11-26T09:00:00.000Z')], repo, storage).map((entry) => entry.id), ['pedestal-x'])
  assert.equal(removalsPending(markers, 'other/repo@main:azure-views.json', storage).length, 2)
  // A personal view is never removed, even with a marker for its id.
  assert.deepEqual(applyViewRemovals([removal({ ...view('pedestal-x-mine', 'My Pedestal'), mine: true })], repo, storage), [])
  assert.ok(loadAzureConnectionProfile('pedestal-x-mine', storage))
})

test('CON-110: Git wins for a removed view — not added from Git, not merged back by a computer that still has it (TC-CON-68)', () => {
  const markers = [removal(pedestal)]
  assert.deepEqual(notRemoved([pedestal, audit], markers).map((entry) => entry.id), ['audit-y'])
  assert.deepEqual(mergeViews([audit], [pedestal, audit], markers.map((entry) => entry.id)).map((entry) => entry.id), ['audit-y'], 'a stale copy is not written back')
  const storage = memory()
  syncViewsFromGit(notRemoved([pedestal, audit], markers), storage)
  assert.deepEqual(listAzureConnectionProfiles(storage).map((entry) => entry.id), ['audit-y'])
  // Malformed files and entries count as no marker.
  assert.deepEqual(parseViewRemovals('nope'), []); assert.deepEqual(parseViewRemovals(null), [])
  assert.deepEqual(parseViewRemovals('{"schema":1,"kind":"azure-views-removed","removed":[{"id":"../x","at":"2026-11-25T09:00:00Z"},{"id":"ok","at":"soon"}]}'), [])
  // Fail closed: who may remove for everyone.
  const git = { connected: true, readOnly: false, isSample: false }
  assert.equal(removalBlocked({ allowed: true, viewingAs: false, git, isSample: false }), '')
  assert.match(removalBlocked({ allowed: false, viewingAs: false, git, isSample: false }), /Only the Tool Owner/)
  assert.match(removalBlocked({ allowed: true, viewingAs: true, git, isSample: false }), /View as/)
  assert.match(removalBlocked({ allowed: true, viewingAs: false, git: undefined, isSample: false }), /Connect Git storage/)
  assert.match(removalBlocked({ allowed: true, viewingAs: false, git: { ...git, readOnly: true }, isSample: false }), /read-only/)
  assert.match(removalBlocked({ allowed: true, viewingAs: false, git, isSample: true }), /synthetic sample/)
})

test('GIT-26: the first sync from another repository removes nothing for a removal marker there and marks it as seen (TC-CON-68)', () => {
  const storage = memory()
  saveAzureConnectionProfile({ ...pedestal, token: 'synthetic-view-pat' }, storage)
  markViewsSynced([pedestal], storage)
  const markers = [removal(pedestal), removal(audit)]
  // The hook's first sync from another repository: the removed views are not added, the markers are only recorded.
  const result = compareViewsWithGit(notRemoved([audit], markers), storage)
  markRemovalsApplied(markers, repo, storage)
  assert.deepEqual([result.added, result.removed], [[], []])
  assert.deepEqual(applyViewRemovals(markers, repo, storage), [], 'not applied later either')
  assert.deepEqual(listAzureConnectionProfiles(storage).map((entry) => entry.id), ['pedestal-x'], 'kept with its PAT')
  assert.equal(loadAzureConnectionProfile('pedestal-x', storage).token, 'synthetic-view-pat')
  const hook = readFileSync(new URL('../src/useGitStorage.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const sync = hook.slice(hook.indexOf('async function syncViewsNow'), hook.indexOf('async function shareViews'))
  const changed = sync.slice(sync.indexOf('if (repositoryChanged(repository))'), sync.indexOf('const reset = applyViewsReset'))
  assert.match(changed, /markRemovalsApplied\(removals, repository\)/)
  assert.doesNotMatch(changed, /applyViewRemovals/, 'the first sync from another repository never removes')
  assert.ok(sync.indexOf('applyViewRemovals(removals, repository)') > sync.indexOf('const reset = applyViewsReset'))
})

test('CON-109, CON-110, CON-112: Remove and Delete for everyone in Git — backup, marker, setup without it, data files deleted; Restore clears the marker (TC-CON-68, TC-CON-69)', async () => {
  const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
  const setup = { schema: 1, kind: 'azure-devops-views', views: [audit, pedestal] }
  const snapshot = (target) => JSON.stringify({ schema: 1, kind: 'azure-view-snapshot', connection: target, source: { connectionId: target.id, fetchedAt: '2026-11-24T08:00:00.000Z', items: [] } })
  const gh = fakeGitHub({ files: { 'azure-views.json': JSON.stringify(setup), 'azure-data/pedestal-x.json': snapshot(pedestal), 'azure-data/audit-y.json': snapshot(audit) } })
  const at = new Date('2026-11-25T09:00:00.000Z')
  // Delete lists the data files that exist, then deletes exactly those.
  assert.deepEqual(await viewDataFiles(config, 't', 'pedestal-x', gh.fetch), ['azure-data/pedestal-x.json'])
  assert.deepEqual(await viewDataFiles(config, 't', 'nothing-here', gh.fetch), [])
  const done = await removeViewInGit(config, 't', { ...pedestal, token: 'synthetic-view-pat' }, 'delete', 'owner@example.com', gh.fetch, at)
  assert.deepEqual(done.deleted, ['azure-data/pedestal-x.json'])
  assert.equal(gh.read('azure-data/pedestal-x.json'), null, 'its data file is deleted')
  assert.ok(gh.read('azure-data/audit-y.json'), 'the other view keeps its data')
  assert.deepEqual(parseViews(gh.read('azure-views.json')).map((entry) => entry.id), ['audit-y'], 'the shared setup no longer lists it')
  assert.equal(done.backup, 'azure-views-backups/azure-views-2026-11-25T09-00-00Z-removed-pedestal-x.json')
  assert.deepEqual(parseViews(gh.read(done.backup)).map((entry) => entry.id), ['pedestal-x'], 'the backup restores it')
  for (const path of ['azure-views.json', done.backup, 'azure-views-removed.json']) assert.equal(gh.read(path).includes('synthetic-view-pat'), false, `no PAT in ${path}`)
  const { removals } = await readRemovals(config, 't', gh.fetch)
  assert.deepEqual(removals.map((entry) => [entry.id, entry.mode, entry.by, entry.at, entry.files]), [['pedestal-x', 'delete', 'owner@example.com', at.toISOString(), ['azure-data/pedestal-x.json']]])
  // Remove (not Delete) keeps the data files.
  await removeViewInGit(config, 't', audit, 'remove', 'owner@example.com', gh.fetch, at)
  assert.ok(gh.read('azure-data/audit-y.json'), 'Remove keeps its data in Git')
  assert.deepEqual(parseViews(gh.read('azure-views.json')), [])
  assert.equal((await readRemovals(config, 't', gh.fetch)).removals.length, 2)
  await assert.rejects(removeViewInGit(config, 't', { ...audit, mine: true }, 'remove', '', gh.fetch), /personal view/)
  // Removed connections lists the removed views first, from their marker; Restore takes the marker away.
  const rows = removedFromGit([], [], [], (await readRemovals(config, 't', gh.fetch)).removals)
  assert.deepEqual(rows.map((row) => [row.view.id, row.message]), [['audit-y', 'Removed for everyone by owner@example.com'], ['pedestal-x', 'Deleted for everyone by owner@example.com']])
  assert.equal(await clearRemovalInGit(config, 't', 'pedestal-x', 'Pedestal X', gh.fetch), true)
  assert.equal(await clearRemovalInGit(config, 't', 'pedestal-x', 'Pedestal X', gh.fetch), false, 'nothing to clear twice')
  assert.deepEqual((await readRemovals(config, 't', gh.fetch)).removals.map((entry) => entry.id), ['audit-y'])
  // A browser that applied the marker gets the restored view back at its next sync.
  const storage = memory()
  markRemovalsApplied([removal(pedestal)], repo, storage)
  syncViewsFromGit(notRemoved([pedestal], (await readRemovals(config, 't', gh.fetch)).removals), storage)
  assert.deepEqual(listAzureConnectionProfiles(storage).map((entry) => entry.id), ['pedestal-x'])
  assert.deepEqual(withoutRemoval(withRemoval([], removal(pedestal)), 'pedestal-x'), [])
})

test('TC-CON-68: shared view removal refuses a repository whose privacy cannot be verified', async () => {
  const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
  const setup = JSON.stringify({ schema: 1, kind: 'azure-devops-views', views: [pedestal] })
  const gh = fakeGitHub({ files: { 'azure-views.json': setup } })
  for (const metadata of [Response.json({ visibility: 'public' }), Response.json({ visibility: 'internal', private: true }), Response.json({}, { status: 403 })]) {
    const send = privateGitWrites(config, 't', (url, init) => url === 'https://api.github.com/repos/example/storage' ? Promise.resolve(metadata) : gh.fetch(url, init))
    await assert.rejects(removeViewInGit(config, 't', pedestal, 'remove', 'owner@example.com', send), /private Git data repository/)
    assert.equal(gh.read('azure-views.json'), setup)
    assert.equal(gh.read('azure-views-removed.json'), null)
  }
})
