import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { listAzureConnectionProfiles, loadAzureConnectionProfile, loadServerPat, saveAzureConnectionProfile, serverKey } from '../src/azureCredentials.ts'
import { assignBlocked, assignOtherView, emptyUnassigned, forgetOtherViewsInBaseline, isOtherView, markOwnSynced, mergeOwnOtherViews, migrateOtherViews, otherViewsPath, ownSyncedIds, parseOwnOtherViews, parseUnassigned, serializeOwnOtherViews, serializeUnassigned, splitSetup, syncOwnOtherViews, unassignedVisible } from '../src/otherViews.ts'
import { assignOtherViewInGit, migrateOtherViewsInGit, readOwnOtherViews, readUnassigned, saveOwnOtherViewsInGit } from '../src/otherViewsGit.ts'
import { beginStreamsLoad, endStreamsLoad, loadedStreamsVersion, markOwnStreamsWrite, markStreamsLoaded, streamsUpdateDue } from '../src/streamsUpdate.ts'
import { markViewsSynced, parseViews } from '../src/viewDefinitions.ts'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'

// CON-119…CON-124, GIT-29…GIT-31, SET-20 (TC-CON-75…TC-CON-80, TC-GIT-24…TC-GIT-26): Other views per person in Git, the
// move of the older shared Other views to the unassigned list, an admin's Assign, and the forced Load everything from
// Git. Synthetic data only.
const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) } }
const base = 'https://tfs.example.invalid/Coll'
const view = (id, viewName, extra = {}) => ({ id, reason: viewName, viewName, role: 'reference', url: `${base}/Project`, baseUrl: base, query: `SELECT [System.Id] FROM WorkItems WHERE [System.Title] = '${viewName}'`, ...extra })
const supplier = view('supplier-x', 'Supplier X'), audit = view('audit-y', 'Audit Y'), kept = view('kept-z', 'Kept Z')
const dp = view('dp-stream', 'DP'), tw = { id: 'tw-1', reason: 'Time Writing', role: 'time-tracking', url: 'https://dev.azure.com/example/Project' }
const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
const repo = 'example/storage@main:azure-views.json'
const setupText = (views) => JSON.stringify({ schema: 1, kind: 'azure-devops-views', views })

test('CON-119: the Stream mapping stays in the shared setup; any other connection is an Other view; a person’s file is other-views/<email>.json (TC-CON-75)', () => {
  assert.equal(isOtherView(supplier), true)
  assert.equal(isOtherView(dp), false, 'a stream’s connection is the Stream mapping')
  assert.equal(isOtherView(tw), false, 'Time Writing is the Stream mapping')
  assert.equal(isOtherView({ ...supplier, mine: true }), false, 'My views are never Other views of the shared setup')
  assert.deepEqual(splitSetup([dp, supplier, tw]).other.map((entry) => entry.id), ['supplier-x'])
  assert.equal(otherViewsPath(' Ana.Lee@Example.com '), 'other-views/ana.lee@example.com.json')
  assert.equal(otherViewsPath('not an email'), '')
  assert.equal(otherViewsPath('a/../b@example.com'), 'other-views/a___b@example.com.json', 'no folder can be named')
  // The file never holds a PAT or a connection's work email; every view carries who added it.
  const text = serializeOwnOtherViews('ana@example.com', [{ ...supplier, token: 'synthetic-pat', creatorEmail: 'someone@example.com', createdBy: '' }])
  assert.equal(text.includes('synthetic-pat'), false)
  assert.equal(text.includes('someone@example.com'), false)
  const file = JSON.parse(text)
  assert.deepEqual([file.kind, file.owner, file.views[0].createdBy], ['other-views', 'ana@example.com', 'ana@example.com'])
  assert.deepEqual(parseOwnOtherViews(text, 'ana@example.com').map((entry) => [entry.id, entry.createdBy]), [['supplier-x', 'ana@example.com']])
  assert.throws(() => parseOwnOtherViews(text, 'other@example.com'), /belongs to a different owner/)
  assert.throws(() => parseOwnOtherViews(JSON.stringify({ ...file, owner: {} }), 'ana@example.com'), /belongs to a different owner/)
  assert.throws(() => parseOwnOtherViews('{"schema":1,"kind":"other"}', 'ana@example.com'), /not an Other views file/)
  assert.deepEqual(parseOwnOtherViews(null, 'ana@example.com'), [])
  // A save merges: views in the file stay (an admin may have assigned one), mine replace theirs, removed ones go.
  const merged = mergeOwnOtherViews(parseOwnOtherViews(text, 'ana@example.com'), [{ ...audit }, { ...supplier, query: 'SELECT 2' }, dp], 'ana@example.com', [])
  assert.deepEqual(merged.map((entry) => [entry.id, entry.query ?? '']), [['audit-y', audit.query], ['supplier-x', 'SELECT 2']], 'a stream’s connection never goes into the file')
  assert.deepEqual(mergeOwnOtherViews(merged, [], 'ana@example.com', ['audit-y']).map((entry) => entry.id), ['supplier-x'])
})

test('CON-120: this computer’s Other views follow the person’s file — added, kept when changed here, others’ and unassigned ones removed, new ones saved (TC-CON-76)', () => {
  const storage = memory()
  saveAzureConnectionProfile({ ...dp, token: '' }, storage)
  saveAzureConnectionProfile({ ...audit, token: 'synthetic-view-pat' }, storage) // came from the older shared setup: unassigned now
  saveAzureConnectionProfile({ ...view('new-here', 'New Here'), token: '' }, storage) // added on this computer, never in Git
  saveAzureConnectionProfile({ ...view('my-own', 'My Own'), mine: true, token: '' }, storage)
  const own = parseOwnOtherViews(serializeOwnOtherViews('ana@example.com', [{ ...supplier, createdBy: 'ana@example.com' }]), 'ana@example.com')
  const first = syncOwnOtherViews(own, new Set(['audit-y']), repo, storage)
  assert.deepEqual(first.added, ['Supplier X'])
  assert.deepEqual(first.removedIds, ['audit-y'], 'an unassigned view is not mine: it leaves this computer')
  assert.deepEqual(first.save.map((entry) => entry.id), ['new-here'], 'a view added here goes into my file')
  assert.deepEqual(listAzureConnectionProfiles(storage).map((entry) => entry.id).sort(), ['dp-stream', 'my-own', 'new-here', 'supplier-x'], 'the Stream mapping and My views stay')
  assert.equal(loadServerPat(serverKey(audit), storage), 'synthetic-view-pat', 'a PAT saved only on the removed view stays as its server’s')
  markOwnSynced(repo, [...own, view('new-here', 'New Here')], storage)
  assert.deepEqual(ownSyncedIds(repo, storage).sort(), ['new-here', 'supplier-x'])
  // Changed here since the last sync: kept and saved; removed from the file on another computer: removed here.
  saveAzureConnectionProfile({ ...supplier, query: 'SELECT [System.Id] FROM WorkItems WHERE changed = 1', token: '' }, storage)
  const second = syncOwnOtherViews(own, new Set(), repo, storage)
  assert.deepEqual(second.save.map((entry) => entry.id), ['supplier-x'])
  assert.deepEqual(second.removedIds, ['new-here'])
  assert.match(loadAzureConnectionProfile('supplier-x', storage).query, /changed = 1/)
  // The shared baseline stops tracking Other views, so the shared sync never removes one that left azure-views.json.
  markViewsSynced([dp, supplier], storage)
  forgetOtherViewsInBaseline('demand-planning-views-git-baseline-v1', storage)
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem('demand-planning-views-git-baseline-v1'))), ['dp-stream'])
})

test('CON-120: Other view sync preserves local My views and Stream mappings with the same ID (TC-CON-76)', () => {
  const storage = memory()
  saveAzureConnectionProfile({ ...supplier, mine: true, token: '' }, storage)
  saveAzureConnectionProfile({ ...tw, token: '' }, storage)
  const views = [
    { ...supplier, viewName: 'Incoming supplier', createdBy: 'ana@example.com' },
    { ...supplier, id: tw.id, viewName: 'Incoming stream collision', createdBy: 'ana@example.com' },
  ]
  const result = syncOwnOtherViews(views, new Set(), repo, storage)
  assert.deepEqual([result.updated, result.removedIds, result.save], [[], [], []])
  assert.equal(loadAzureConnectionProfile(supplier.id, storage).mine, true)
  assert.equal(loadAzureConnectionProfile(tw.id, storage).role, 'time-tracking')
  saveAzureConnectionProfile({ ...audit, token: '' }, storage)
  markOwnSynced(repo, [audit], storage)
  const switched = syncOwnOtherViews([{ ...kept, createdBy: 'ana@example.com' }], new Set([audit.id]), repo, storage, true)
  assert.deepEqual(switched.added, ['Kept Z'])
  assert.deepEqual(switched.removedIds, [], 'switching repository adds only')
  assert.ok(loadAzureConnectionProfile(audit.id, storage))
})

test('CON-120, CON-121, CON-122: Other-view writes and retries require verified private Git storage (TC-CON-76…78)', async () => {
  const shared = setupText([dp, supplier])
  const unassigned = serializeUnassigned({ ...emptyUnassigned(), views: [audit] })
  const gh = fakeGitHub({ files: { 'azure-views.json': shared, 'other-views/unassigned.json': unassigned } })
  let visibility = 'public'
  let submittedWrites = 0
  const send = (url, init) => {
    if (url === 'https://api.github.com/repos/example/storage') return Promise.resolve(Response.json({ visibility }))
    if (init?.method === 'PUT') {
      submittedWrites += 1
      if (submittedWrites === 1) {
        visibility = 'internal'
        return Promise.resolve(Response.json({ message: 'Conflict' }, { status: 409 }))
      }
    }
    return gh.fetch(url, init)
  }
  const refused = /private Git data repository/
  await assert.rejects(migrateOtherViewsInGit(config, 'synthetic', [], send), refused)
  await assert.rejects(saveOwnOtherViewsInGit(config, 'synthetic', 'ana@example.com', [supplier], [], 'Save Other views', send), refused)
  await assert.rejects(assignOtherViewInGit(config, 'synthetic', audit.id, 'ana@example.com', 'owner@example.com', send), refused)
  assert.equal(submittedWrites, 0)
  visibility = 'private'
  await assert.rejects(assignOtherViewInGit(config, 'synthetic', audit.id, 'ana@example.com', 'owner@example.com', send), refused)
  assert.equal(submittedWrites, 1, 'the write following a conflict rechecks repository visibility')
  assert.equal(gh.read('azure-views.json'), shared)
  assert.equal(gh.read('other-views/unassigned.json'), unassigned)
  assert.equal(gh.read('other-views/ana@example.com.json'), null)
})

test('CON-121: the move to the unassigned list keeps the Stream mapping, is idempotent and never takes back an assigned or removed view (TC-CON-77)', () => {
  const step = migrateOtherViews([dp, supplier, audit, tw], emptyUnassigned(), ['removed-one'])
  assert.deepEqual(step.setup.map((entry) => entry.id), ['dp-stream', 'tw-1'])
  assert.deepEqual(step.unassigned.views.map((entry) => entry.id), ['audit-y', 'supplier-x'])
  assert.deepEqual(step.moved.sort(), ['Audit Y', 'Supplier X'])
  const again = migrateOtherViews(step.setup, step.unassigned)
  assert.equal(again.setupChanged, false); assert.equal(again.unassignedChanged, false)
  // An older app writes the views back into azure-views.json: they are only taken out again — an assigned view, a view
  // still in the list and a view removed for everyone are not added twice.
  const assigned = { ...step.unassigned, views: step.unassigned.views.filter((entry) => entry.id !== 'audit-y'), assigned: [{ id: 'audit-y', at: '2026-11-25T09:00:00.000Z' }] }
  const back = migrateOtherViews([dp, supplier, audit, view('removed-one', 'Removed One')], assigned, ['removed-one'])
  assert.deepEqual(back.setup.map((entry) => entry.id), ['dp-stream'])
  assert.equal(back.unassignedChanged, false)
  assert.equal(back.setupChanged, true)
  const text = serializeUnassigned(step.unassigned)
  assert.deepEqual(parseUnassigned(text).views.map((entry) => entry.id), ['audit-y', 'supplier-x'])
  assert.throws(() => parseUnassigned('[1]'), /not an unassigned Other views file/)
})

test('CON-121: in Git — list first, then the setup; two computers moving at once end with one list (TC-CON-77)', async () => {
  const gh = fakeGitHub({ files: { 'azure-views.json': setupText([dp, supplier, audit, tw]) } })
  const [a, b] = await Promise.all([migrateOtherViewsInGit(config, 't', [], gh.fetch), migrateOtherViewsInGit(config, 't', [], gh.fetch)])
  assert.deepEqual(parseViews(gh.read('azure-views.json')).map((entry) => entry.id), ['dp-stream', 'tw-1'])
  assert.deepEqual((await readUnassigned(config, 't', gh.fetch)).views.map((entry) => entry.id), ['audit-y', 'supplier-x'])
  assert.deepEqual([...a.moved, ...b.moved].sort(), ['Audit Y', 'Supplier X'], 'each view moved once')
  assert.ok(a.after || b.after, 'a write recorded with its version')
  const again = await migrateOtherViewsInGit(config, 't', [], gh.fetch)
  assert.deepEqual([again.moved, again.after], [[], null], 'nothing more to move')
  // Without a setup file nothing is written.
  const empty = fakeGitHub({ files: {} })
  assert.deepEqual((await migrateOtherViewsInGit(config, 't', [], empty.fetch)).moved, [])
  assert.equal(empty.read('other-views/unassigned.json'), null)
})

test('CON-122, CON-123: an admin assigns a view to a person — into their file, out of the list; only admins see the list (TC-CON-78)', async () => {
  const list = { ...emptyUnassigned(), views: [supplier, audit] }
  const step = assignOtherView(list, [], 'supplier-x', 'Ben@Example.com', 'admin@example.com', '2026-11-25T10:00:00.000Z')
  assert.deepEqual(step.owner.map((entry) => [entry.id, entry.createdBy, entry.assignedBy]), [['supplier-x', 'ben@example.com', 'admin@example.com']])
  assert.deepEqual(step.unassigned.views.map((entry) => entry.id), ['audit-y'])
  assert.deepEqual(step.unassigned.assigned.map((entry) => entry.id), ['supplier-x'])
  assert.throws(() => assignOtherView(step.unassigned, [], 'supplier-x', 'ben@example.com', '', 'x'), /no longer unassigned/)
  assert.throws(() => assignOtherView(list, [], 'audit-y', 'nobody', '', 'x'), /work email/)
  assert.deepEqual(unassignedVisible([supplier], { admin: true, viewingAs: false }).length, 1)
  assert.deepEqual(unassignedVisible([supplier], { admin: false, viewingAs: false }), [], 'nobody else sees an unassigned view')
  assert.deepEqual(unassignedVisible([supplier], { admin: true, viewingAs: true }), [], 'not while viewing as someone else')
  assert.match(assignBlocked({ admin: false, viewingAs: false, git: { connected: true, readOnly: false }, isSample: false }), /Only admins/)
  assert.match(assignBlocked({ admin: true, viewingAs: false, git: { connected: true, readOnly: true }, isSample: false }), /read-only/)
  assert.equal(assignBlocked({ admin: true, viewingAs: false, git: { connected: true, readOnly: false }, isSample: false }), '')
  // In Git: the person's file first, then the list.
  const gh = fakeGitHub({ files: { 'other-views/unassigned.json': serializeUnassigned(list) } })
  const done = await assignOtherViewInGit(config, 't', 'audit-y', 'ben@example.com', 'admin@example.com', gh.fetch, new Date('2026-11-25T10:00:00.000Z'))
  assert.deepEqual(done.paths, ['other-views/ben@example.com.json', 'other-views/unassigned.json'])
  assert.deepEqual((await readOwnOtherViews(config, 't', 'ben@example.com', gh.fetch)).views.map((entry) => [entry.id, entry.createdBy, entry.assignedAt]), [['audit-y', 'ben@example.com', '2026-11-25T10:00:00.000Z']])
  assert.deepEqual((await readUnassigned(config, 't', gh.fetch)).views.map((entry) => entry.id), ['supplier-x'])
  // The person's own save keeps the assigned view and adds theirs.
  await saveOwnOtherViewsInGit(config, 't', 'ben@example.com', [kept], [], 'save', gh.fetch)
  assert.deepEqual((await readOwnOtherViews(config, 't', 'ben@example.com', gh.fetch)).views.map((entry) => entry.id), ['audit-y', 'kept-z'])
  assert.equal(gh.read('other-views/ana@example.com.json'), null, 'nobody else’s file is written')
})

test('GIT-29: the pop-up shows once per change of the Streams file per repository, and once for everyone after this release (TC-GIT-24)', () => {
  const storage = memory()
  const input = { connected: true, isSample: false, viewingAs: false, ready: true, repository: repo, version: 'sha-1', saving: false }
  assert.equal(streamsUpdateDue(input, storage), true, 'no record yet: once for everyone')
  markStreamsLoaded(repo, 'sha-1', storage)
  assert.equal(streamsUpdateDue(input, storage), false)
  assert.equal(streamsUpdateDue({ ...input, version: 'sha-2' }, storage), true, 'a new version in Git')
  assert.equal(streamsUpdateDue({ ...input, repository: 'other/repo@main:azure-views.json' }, storage), true, 'per repository')
  // This computer's own write over the version loaded here counts as loaded; over another version it does not.
  markOwnStreamsWrite(repo, 'sha-1', 'sha-2', storage)
  assert.equal(loadedStreamsVersion(repo, storage), 'sha-2')
  markOwnStreamsWrite(repo, 'sha-9', 'sha-3', storage)
  assert.equal(loadedStreamsVersion(repo, storage), 'sha-2')
  // A write of this computer while its forced load runs is part of the load — also on a first start without a record.
  const fresh = memory()
  markOwnStreamsWrite(repo, 'sha-1', 'sha-2', fresh)
  assert.equal(loadedStreamsVersion(repo, fresh), '', 'before any load: the pop-up still shows once')
  beginStreamsLoad(repo)
  markOwnStreamsWrite(repo, 'sha-1', 'sha-2', fresh)
  endStreamsLoad(repo)
  assert.equal(loadedStreamsVersion(repo, fresh), 'sha-2')
  markOwnStreamsWrite(repo, 'sha-2', 'sha-3', fresh)
  assert.equal(loadedStreamsVersion(repo, fresh), 'sha-3', 'right after the load: its own next write counts as loaded')
})

test('GIT-30, GIT-31: never in View as, with the sample, without Git, without the file, before the start sync or during an own save; never skipped — a failure shows the Git setup (TC-GIT-25, TC-GIT-26)', () => {
  const storage = memory()
  const input = { connected: true, isSample: false, viewingAs: false, ready: true, repository: repo, version: 'sha-1', saving: false }
  for (const [key, value] of [['connected', false], ['isSample', true], ['viewingAs', true], ['ready', false], ['saving', true], ['version', null], ['version', '']]) assert.equal(streamsUpdateDue({ ...input, [key]: value }, storage), false, `${key}: ${value}`)
  // The pop-up: blocking (no ×, Escape or click beside it), its one action Load everything; Continue only after a failure.
  const prompt = readFileSync(new URL('../src/components/StreamsUpdatePrompt.tsx', import.meta.url), 'utf8')
  assert.match(prompt, /<Modal [^>]*blocking/)
  assert.match(prompt, /\{outage && <button type="button" onClick=\{onContinue\}>Continue without loading<\/button>\}/, 'skipped only in a GitHub outage (GIT-32)')
  assert.match(prompt, /failedNow && <section className="streams-update-setup"[\s\S]*<GitConnectionForm git=\{git\}/, 'after a failure: the Git storage setup, the same form as the panel')
  const panel = readFileSync(new URL('../src/components/GitStorage.tsx', import.meta.url), 'utf8')
  assert.match(panel, /<GitConnectionForm git=\{git\}/, 'the Git storage panel uses the same form')
  // GIT-35: hidden while the load job runs (KB: it hid and came back on a slow computer), back in its failed state after.
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /!streamsSkipped && !loadRunning && \(streamsDue \|\| streamsRun\.failed\) && <StreamsUpdatePrompt/)
  const ui = readFileSync(new URL('../src/components/ui.tsx', import.meta.url), 'utf8')
  assert.match(ui, /\{!blocking && <button type="button" className="icon-button"/)
  assert.match(ui, /close\.current = blocking \? \(\) => undefined : onClose/)
})

test('GIT-32: Continue without loading only in a GitHub outage — every failure a server error or no answer (TC-GIT-27)', async () => {
  const { isGitOutage } = await import('../src/streamsUpdate.ts')
  assert.equal(isGitOutage(['Connection setup: GitHub could not read azure-views-reset.json (HTTP 500): Server Error.']), true)
  assert.equal(isGitOutage(['Planning data: GitHub could not be reached (network, VPN or proxy). (Browser: Failed to fetch)']), true)
  assert.equal(isGitOutage(['A: GitHub could not read x.json (HTTP 503).', 'B: Failed to fetch']), true)
  assert.equal(isGitOutage(['Connection setup: GitHub rejected the token. Create a fine-grained token …']), false, 'a token refused: fix the setup')
  assert.equal(isGitOutage(['A: (HTTP 502)', 'B: Repository o/r or branch main was not found, or the token cannot access it.']), false, 'one setup error: no skip')
  assert.equal(isGitOutage([]), false)
  assert.equal(isGitOutage(undefined), false)
})

test('GIT-33…GIT-35: Load everything as one background job — listed in Jobs done, one at a time, the version recorded only when every part loaded (TC-GIT-28, TC-GIT-29, TC-GIT-30)', async () => {
  const { listJobs, resetJobs } = await import('../src/backgroundJobs.ts')
  const { loadEverythingRunning, loadJobText, startLoadEverything } = await import('../src/loadEverythingJob.ts')
  resetJobs()
  const storage = memory()
  globalThis.localStorage = storage
  let release = () => undefined
  const gate = new Promise((resolve) => { release = resolve })
  const steps = []
  const first = startLoadEverything(async (progress) => { progress('Loading planning data…'); steps.push('load'); await gate; markOwnStreamsWrite(repo, 'sha-0', 'sha-own'); return { loaded: ['planning data', 'connection setup'], failed: [] } }, repo, () => 'sha-own')
  assert.ok(first, 'started')
  assert.equal(loadEverythingRunning(), true)
  assert.deepEqual(listJobs().map((job) => [job.label, job.state, job.detail]), [['Load everything from Git', 'running', 'Loading planning data…']])
  assert.equal(startLoadEverything(async () => ({ loaded: [], failed: [] }), repo, () => null), null, 'a second load while one runs starts nothing')
  assert.equal(listJobs().length, 1)
  release()
  assert.deepEqual(await first, { loaded: ['planning data', 'connection setup'], failed: [] })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(listJobs().map((job) => [job.state, job.detail]), [['done', 'Loaded: planning data; connection setup.']])
  assert.equal(loadedStreamsVersion(repo, storage), 'sha-own', 'recorded from the load — its own write during the load counted')
  // A failed part: the job fails naming it, nothing is recorded.
  const failed = await startLoadEverything(async () => ({ loaded: ['access roles'], failed: ['Connection setup: GitHub could not read azure-views-reset.json (HTTP 500)'] }), repo, () => 'sha-new')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(failed.failed.length, 1)
  assert.deepEqual(listJobs()[0].state, 'error')
  assert.match(listJobs()[0].detail, /^Not loaded — Connection setup: GitHub could not read azure-views-reset\.json \(HTTP 500\)\. Loaded: access roles\.$/)
  assert.equal(loadedStreamsVersion(repo, storage), 'sha-own')
  // A load that throws fails the job too.
  const thrown = await startLoadEverything(async () => { throw new Error('boom') }, repo, () => 'x')
  assert.deepEqual(thrown, { loaded: [], failed: ['boom'] })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(loadJobText({ loaded: [], failed: [] }), 'Loaded: nothing.')
  assert.equal(loadEverythingRunning(), false)
  assert.deepEqual(steps, ['load'])
  delete globalThis.localStorage
})
