import test from 'node:test'
import assert from 'node:assert/strict'
import { saveAzureConnectionProfile, loadAzureConnectionProfile, listAzureConnectionProfiles } from '../src/azureCredentials.ts'
import { saveServerPat, loadServerPat } from '../src/azureCredentials.ts'
import { gitSyncedIds, duplicateOf } from '../src/viewDefinitions.ts'
import { viewsFile, serializeViews, parseViews, restoreViews, serverKey, syncViewsFromGit, markViewsSynced, markPendingShare, promoteToTimeWriting } from '../src/viewDefinitions.ts'
import { siblingConfig, readTextFile, writeTextFile } from '../src/gitStorage.ts'

const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) } }
const dp = { id: 'dp', url: 'https://ads.corp.example/tfs/Coll/DHFI', baseUrl: 'https://ads.corp.example/tfs', reason: 'DP', viewName: 'Digital Platform', role: 'backlog-view', query: 'SELECT [System.Id] FROM WorkItems WHERE [System.AreaPath] UNDER \'DHFI\\DP\'', showInMenu: true }

test('views file: connections without PATs, stable order; parsing rejects other files', () => {
  const storage = memory()
  saveAzureConnectionProfile({ ...dp, token: 'secret-pat' }, storage)
  saveAzureConnectionProfile({ id: 'cp', url: 'https://dev.azure.com/org/CP', reason: 'CP', role: 'backlog-view', query: 'SELECT [System.Id] FROM WorkItems WHERE x = 1', token: 'cloud-pat' }, storage)
  const text = serializeViews(viewsFile(listAzureConnectionProfiles(storage)))
  assert.equal(text.includes('secret-pat') || text.includes('cloud-pat') || text.includes('token'), false, 'no PAT in the file')
  assert.deepEqual(parseViews(text).map((view) => view.id), ['cp', 'dp'])
  assert.equal(parseViews(text).find((view) => view.id === 'dp').query, dp.query)
  assert.equal(serializeViews(viewsFile(listAzureConnectionProfiles(storage))), text, 'same data, same text')
  assert.throws(() => parseViews('{"schema":1,"baselineRules":[]}'), /not a Demand Planning views file/)
  assert.throws(() => parseViews('nope'), /not valid JSON/)
  assert.equal(serverKey(dp), 'https://ads.corp.example/tfs'); assert.equal(serverKey({ url: 'https://dev.azure.com/Org/CP' }), 'https://dev.azure.com/org')
})

test('restore: keeps the PAT here, else the entered PAT, else one for the same server; reports the rest', () => {
  const views = [dp, { ...dp, id: 'iocc', reason: 'IOCC', viewName: 'IOCC' }, { id: 'cloud', url: 'https://dev.azure.com/other/X', reason: 'Cloud X' }]
  const fresh = memory()
  saveAzureConnectionProfile({ id: 'qms', url: 'https://ads.corp.example/tfs/Coll/QMS', baseUrl: 'https://ads.corp.example/tfs', reason: 'QMS', token: 'onprem-pat' }, fresh)
  const first = restoreViews(views, null, fresh)
  assert.deepEqual(first, { added: ['Digital Platform', 'IOCC', 'Cloud X'], updated: [], skipped: [], noPat: ['Cloud X'] })
  assert.equal(loadAzureConnectionProfile('cloud', fresh).token, '', 'restored without a PAT: view only')
  assert.equal(loadAzureConnectionProfile('dp', fresh).token, 'onprem-pat', 'PAT of a connection to the same server')
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('dp', fresh), token: 'own-pat' }, fresh)
  const second = restoreViews(views, { pat: 'entered-pat', server: 'https://dev.azure.com/other' }, fresh)
  assert.deepEqual(second, { added: [], updated: ['Digital Platform', 'IOCC', 'Cloud X'], skipped: [], noPat: [] })
  assert.equal(loadAzureConnectionProfile('dp', fresh).token, 'own-pat', 'an existing connection keeps its PAT')
  assert.equal(loadAzureConnectionProfile('cloud', fresh).token, 'entered-pat', 'a view-only connection gets the entered PAT')
  assert.equal(loadAzureConnectionProfile('qms', fresh).token, 'own-pat', 'one PAT per server: a new PAT on one connection is the PAT of every connection on that server')
  // The server holds the PAT; a restore (also the sync at every start) leaves no copy on the connections, so removing it removes it.
  const stored = JSON.parse(fresh.getItem('demand-planning-azure-connection-profiles-v1'))
  assert.deepEqual(stored.filter((profile) => profile.baseUrl).map((profile) => profile.token), ['', '', ''], 'no on-prem connection keeps a copy of the server PAT')
  saveServerPat(serverKey(dp), '', fresh)
  assert.deepEqual(['dp', 'iocc', 'qms'].map((id) => loadAzureConnectionProfile(id, fresh).token), ['', '', ''], 'removing the server PAT removes it from every connection, after any number of restores')
})

test('views file sits next to the data file and is committed with the loaded version', async () => {
  const config = { owner: 'me', repo: 'data', branch: 'main', path: 'team/planning-data.json' }
  assert.equal(siblingConfig(config, 'azure-views.json').path, 'team/azure-views.json')
  assert.equal(siblingConfig({ ...config, path: 'planning-data.json' }, 'azure-views.json').path, 'azure-views.json')
  const calls = []
  const fetchImpl = async (url, init = {}) => { calls.push([init.method ?? 'GET', url, init.body ? JSON.parse(init.body).sha : undefined]); return init.method === 'PUT' ? Response.json({ content: { sha: 'new' }, commit: { html_url: 'c' } }) : new Response('', { status: url.includes('/branches/') ? 200 : 404 }) }
  const target = siblingConfig(config, 'azure-views.json')
  assert.deepEqual(await readTextFile(target, 't', fetchImpl), { text: null, sha: null })
  assert.deepEqual(await writeTextFile(target, 't', 'x', 'old', 'msg', fetchImpl), { sha: 'new', commitUrl: 'c' })
  const put = calls.find((call) => call[0] === 'PUT')
  assert.match(put[1], /contents\/team\/azure-views\.json$/); assert.equal(put[2], 'old')
})

test('Git connection setup is the default: added and followed; the stream mapping is enforced, other views kept when changed here; PATs kept (TC-CON-47)', async () => {
  const storage = memory()
  const cp = { ...dp, id: 'cp', reason: 'CP', viewName: 'CP', query: 'SELECT 1' }
  saveAzureConnectionProfile({ ...dp, token: 'my-pat' }, storage)
  // First start: dp is the same as in Git; cp is new and gets the PAT of the same server.
  assert.deepEqual(syncViewsFromGit([dp, cp], storage), { added: ['CP'], updated: [], kept: [], noPat: [], removed: [], removedIds: [], enforced: [], emailCleared: false })
  assert.equal(loadAzureConnectionProfile('cp', storage).token, 'my-pat')
  // Git changes cp's query; it was not changed here, so it follows Git (PAT kept).
  const cp2 = { ...cp, query: 'SELECT 2' }
  assert.deepEqual(syncViewsFromGit([dp, cp2], storage), { added: [], updated: ['CP'], kept: [], noPat: [], removed: [], removedIds: [], enforced: [], emailCleared: false })
  assert.equal(loadAzureConnectionProfile('cp', storage).query, 'SELECT 2')
  assert.equal(loadAzureConnectionProfile('cp', storage).token, 'my-pat')
  // The user changes cp (a stream connection) here; the admin's stream mapping in Git is enforced at the next sync (CON-79).
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('cp', storage), query: 'SELECT mine' }, storage)
  assert.deepEqual(syncViewsFromGit([dp, { ...cp, query: 'SELECT 3' }], storage), { added: [], updated: ['CP'], kept: [], noPat: [], removed: [], removedIds: [], enforced: ['CP'], emailCleared: false })
  assert.equal(loadAzureConnectionProfile('cp', storage).query, 'SELECT 3')
  assert.equal(loadAzureConnectionProfile('cp', storage).token, 'my-pat', 'the PAT stays')
  // An admin's change that could not be saved to Git yet is kept until it is.
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('cp', storage), query: 'SELECT admin' }, storage)
  markPendingShare(['cp'], true, storage)
  assert.deepEqual(syncViewsFromGit([dp, { ...cp, query: 'SELECT 3' }], storage).kept, ['CP'])
  assert.equal(loadAzureConnectionProfile('cp', storage).query, 'SELECT admin')
  markPendingShare(['cp'], false, storage)
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('cp', storage), query: 'SELECT 3' }, storage)
  markViewsSynced([dp, { ...cp, query: 'SELECT 3' }], storage)
  // After Restore from Git (or saving to Git) the connection follows Git again.
  restoreViews([{ ...cp, query: 'SELECT 3' }], null, storage); markViewsSynced([{ ...cp, query: 'SELECT 3' }], storage)
  assert.deepEqual(syncViewsFromGit([dp, { ...cp, query: 'SELECT 4' }], storage).updated, ['CP'])
  // Set up here before (never synced) and different from Git: a stream connection (DP) follows Git; any other view
  // is kept; one not in Git is untouched.
  const other = memory()
  const pedestalHistory = { id: 'ph', url: 'https://ads.corp.example/tfs/Coll/DHP', baseUrl: 'https://ads.corp.example/tfs', reason: 'Release history', role: 'reference', query: 'SELECT 9' }
  saveAzureConnectionProfile({ ...dp, query: 'SELECT local', token: 'x' }, other)
  saveAzureConnectionProfile({ ...pedestalHistory, query: 'SELECT mine', token: 'x' }, other)
  saveAzureConnectionProfile({ id: 'own', url: 'https://dev.azure.com/o/P', reason: 'Own', token: 'y' }, other)
  assert.deepEqual(syncViewsFromGit([dp, pedestalHistory], other), { added: [], updated: ['Digital Platform'], kept: ['Release history'], noPat: [], removed: [], removedIds: [], enforced: ['Digital Platform'], emailCleared: false })
  assert.equal(loadAzureConnectionProfile('dp', other).query, dp.query)
  assert.ok(loadAzureConnectionProfile('own', other))
  // The shared connection of a stream is the one Release Details uses, before one set up only here.
  const { defaultStreams, profileForStream } = await import('../src/streams.ts')
  saveAzureConnectionProfile({ id: 'mydp', url: dp.url, baseUrl: dp.baseUrl, reason: 'DP mine', role: 'release-source', token: 'x' }, other)
  const ordered = [listAzureConnectionProfiles(other).find((profile) => profile.id === 'mydp'), ...listAzureConnectionProfiles(other).filter((profile) => profile.id !== 'mydp')]
  assert.equal(profileForStream(defaultStreams.find((stream) => stream.name === 'DP'), ordered).id, 'dp', 'the connection from Git wins over one set up here')
  // A user without any connection gets them all, view only until a PAT is added.
  assert.deepEqual(syncViewsFromGit([dp, cp], memory()), { added: ['Digital Platform', 'CP'], updated: [], kept: [], noPat: ['Digital Platform', 'CP'], removed: [], removedIds: [], enforced: [], emailCleared: false })
})

test('Git setup: a connection removed in Git is removed here unless changed here; an empty file removes nothing', () => {
  const storage = memory()
  const tw = { id: 'tw', url: 'https://dev.azure.com/org/Proj/Team', reason: 'QMS-0025', role: 'time-tracking' }
  const bl = { id: 'bl', url: 'https://dev.azure.com/org/Proj/Team', reason: 'Backlog', role: 'backlog-view' }
  const mine = { id: 'mine', url: 'https://dev.azure.com/org/Proj/Other', reason: 'Mine', role: 'reference' }
  syncViewsFromGit([tw, bl, mine], storage)
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('mine', storage), reason: 'Mine (changed here)' }, storage)
  assert.deepEqual(syncViewsFromGit([], storage).removed, [], 'a file without connections removes nothing')
  const result = syncViewsFromGit([{ ...bl, role: 'time-tracking' }], storage)
  assert.deepEqual(result.removed, ['QMS-0025'])
  assert.deepEqual(result.removedIds, ['tw'], 'the IDs let the app drop the removed connections’ data too')
  assert.deepEqual(listAzureConnectionProfiles(storage).map((entry) => [entry.id, entry.role]).sort(), [['bl', 'time-tracking'], ['mine', 'reference']], 'changed here: kept')
  assert.deepEqual(syncViewsFromGit([{ ...bl, role: 'time-tracking' }], storage).removed, [], 'removed once')
})

test('use a backlog view as Time Writing: it takes over, keeps the creator email, the old one is removed', () => {
  const storage = memory()
  saveAzureConnectionProfile({ id: 'tw', url: 'https://dev.azure.com/org/Proj/Team', reason: 'QMS-0025', viewName: 'QMS-0025', role: 'time-tracking', creatorEmail: 'me@example.com', token: 'old-pat' }, storage)
  saveAzureConnectionProfile({ id: 'bl', url: 'https://dev.azure.com/org/Proj/Team', reason: 'Backlog', role: 'backlog-view', showInMenu: true, token: 'working-pat' }, storage)
  const replaced = promoteToTimeWriting('bl', storage)
  assert.deepEqual(replaced.map((entry) => entry.id), ['tw'])
  const now = loadAzureConnectionProfile('bl', storage)
  assert.equal(now.role, 'time-tracking'); assert.equal(now.token, 'working-pat'); assert.equal(now.creatorEmail, 'me@example.com'); assert.equal(now.viewName, 'QMS-0025')
  assert.equal(loadAzureConnectionProfile('tw', storage), null)
  assert.throws(() => promoteToTimeWriting('missing', storage), /not found/)
})

import { duplicateConnections, removeDuplicateConnections, connectionKey } from '../src/viewDefinitions.ts'
import { connectionPresets } from '../src/connectionPresets.ts'
test('duplicate connections: same server, project, role and query; the shared ID is kept; Git does not add them back', () => {
  const store = memory()
  const base = 'https://tfsapac04.ta.philips.com/tfs/DHPCollection'
  const dp = connectionPresets.find((preset) => preset.key === 'dp-completed')
  assert.equal(dp.id, '93b332d0c3f8465488790b222f294b29', 'presets carry the ID of the shared setup')
  saveAzureConnectionProfile({ id: 'copy1', url: `${base}/DHP.Vault`, baseUrl: base, reason: 'DP_Completed', viewName: 'DP [Completed Releases]', role: 'release-source', query: dp.query, token: 'p' }, store)
  saveAzureConnectionProfile({ id: dp.id, url: `${base}/DHP.Vault`, baseUrl: base, reason: 'DP_Completed', viewName: 'DP [Completed Releases]', role: 'release-source', query: `  ${dp.query}\n`, token: '' }, store)
  saveAzureConnectionProfile({ id: 'cp', url: `${base}/DHP.Vault`, baseUrl: base, reason: 'CP', role: 'release-source', query: 'SELECT [System.Id] FROM WorkItems WHERE x = 2', token: '' }, store)
  assert.deepEqual(duplicateConnections(listAzureConnectionProfiles(store), [dp.id]).map((profile) => profile.id), ['copy1'], 'whitespace in the query does not matter; another query is not a duplicate')
  assert.deepEqual(removeDuplicateConnections([dp.id], store).map((profile) => profile.id), ['copy1'])
  assert.deepEqual(listAzureConnectionProfiles(store).map((profile) => profile.id).sort(), [dp.id, 'cp'].sort())
  const again = syncViewsFromGit([{ id: 'copy1', url: `${base}/DHP.Vault`, baseUrl: base, reason: 'DP_Completed', role: 'release-source', query: dp.query }], store)
  assert.equal(listAzureConnectionProfiles(store).some((profile) => profile.id === 'copy1'), false, 'a duplicate in Git is not added again')
  assert.deepEqual(again.added, [])
  assert.equal(connectionKey({ url: `${base}/DHP.Vault`, baseUrl: base, role: 'release-source', query: 'A  B' }), connectionKey({ url: `${base}/DHP.Vault/`, baseUrl: `${base}/`, role: 'release-source', query: 'a b' }))
})

test('duplicates: the copy from Git is kept over a preset copy and a local one; saving a duplicate is refused', () => {
  const store = memory()
  const base = 'https://tfsapac04.ta.philips.com/tfs/DHPCollection'
  const view = (id, query = 'SELECT [System.Id] FROM WorkItems WHERE x = 1') => ({ id, url: `${base}/DHP.Vault`, baseUrl: base, reason: `View ${id}`, role: 'reference', query })
  // Only "fromgit" came from the shared setup; "local" and "preset" (a preset's ID) were saved here later, as earlier
  // versions allowed (a sync never adds a Git copy of a connection already here, and saving a duplicate is refused now).
  syncViewsFromGit([view('fromgit')], store)
  assert.deepEqual(gitSyncedIds(store), ['fromgit'])
  saveAzureConnectionProfile({ ...view('local'), token: 'p' }, store)
  saveAzureConnectionProfile({ ...view('preset'), token: '' }, store)
  const preferred = [...gitSyncedIds(store), 'preset']
  assert.deepEqual(duplicateConnections(listAzureConnectionProfiles(store), preferred).map((profile) => profile.id).sort(), ['local', 'preset'], 'the Git copy is kept, the preset and local copies go')
  assert.deepEqual(duplicateConnections(listAzureConnectionProfiles(store), ['preset']).map((profile) => profile.id).sort(), ['fromgit', 'local'], 'without a Git copy the preset copy is kept')
  assert.equal(duplicateOf(view('new'), listAzureConnectionProfiles(store))?.id, 'fromgit', 'a new connection with the same server, project, role and query duplicates a saved one')
  assert.equal(duplicateOf(view('fromgit'), listAzureConnectionProfiles(store))?.id, 'local', 'editing one that still matches another is a duplicate too')
  assert.equal(duplicateOf(view('new', 'SELECT [System.Id] FROM WorkItems WHERE x = 2'), listAzureConnectionProfiles(store)), undefined, 'another query is not')
  assert.equal(duplicateOf({ ...view('tw'), role: 'time-tracking' }, listAzureConnectionProfiles(store)), undefined, 'Time Writing connections are handled apart')
})

test('restore: a view moved to another host in Git never carries the old server PAT to the new host', () => {
  const storage = memory()
  saveAzureConnectionProfile({ ...dp, token: 'onprem-pat' }, storage)
  const moved = { ...dp, url: 'https://evil.example/tfs/Coll/DHFI', baseUrl: 'https://evil.example/tfs' }
  const result = restoreViews([moved], null, storage)
  assert.deepEqual(result, { added: [], updated: ['Digital Platform'], skipped: [], noPat: ['Digital Platform'] })
  assert.equal(loadAzureConnectionProfile('dp', storage).token, '', 'the moved connection has no PAT')
  assert.equal(loadServerPat('https://evil.example/tfs', storage), '', 'the new host got no PAT')
  assert.equal(loadServerPat(serverKey(dp), storage), 'onprem-pat', 'the old server keeps its PAT')
  restoreViews([moved], { pat: 'typed-for-new-host', server: 'https://evil.example/tfs' }, storage)
  assert.equal(loadServerPat('https://evil.example/tfs', storage), 'typed-for-new-host', 'a PAT entered for the restore applies to the new host')
})

test('the work email is personal: never written to Git, ignored in the file, kept here; an inherited one is cleared once (TC-CON-48)', async () => {
  const { sharedEmails, clearSharedEmail } = await import('../src/viewDefinitions.ts')
  const tw = { id: 'tw', url: 'https://dev.azure.com/org/QMS', reason: 'Time Writing', viewName: 'QMS-0025', role: 'time-tracking', showInMenu: true, creatorEmail: 'admin@example.com' }
  // Written: no email in the shared file.
  const text = serializeViews(viewsFile([tw]))
  assert.doesNotMatch(text, /creatorEmail|admin@example\.com/)
  // An older file that still carries the admin's email: parsing drops it, and a new user gets no email from it.
  const old = JSON.stringify({ schema: 1, kind: 'azure-devops-views', views: [tw] })
  assert.equal(parseViews(old)[0].creatorEmail, undefined)
  assert.deepEqual(sharedEmails(old), ['admin@example.com'])
  const fresh = memory()
  saveServerPat(serverKey(tw), 'new-user-pat', fresh)
  const first = syncViewsFromGit(parseViews(old), fresh, sharedEmails(old))
  assert.deepEqual(first.added, ['QMS-0025'])
  assert.equal(loadAzureConnectionProfile('tw', fresh).creatorEmail, undefined, 'a new user is asked for their own email')
  // The user's own email stays when Git updates the connection.
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('tw', fresh), creatorEmail: 'user@example.com' }, fresh)
  syncViewsFromGit(parseViews(JSON.stringify({ schema: 1, kind: 'azure-devops-views', views: [{ ...tw, viewName: 'QMS-0025 board' }] })), fresh, ['admin@example.com'])
  assert.equal(loadAzureConnectionProfile('tw', fresh).creatorEmail, 'user@example.com')
  // A user who already received the admin's email from Git loses it once; their own email afterwards is never touched.
  const affected = memory()
  saveAzureConnectionProfile({ ...tw, token: 'pat' }, affected)
  markViewsSynced([tw], affected)
  assert.equal(clearSharedEmail(['admin@example.com'], affected), true)
  assert.equal(loadAzureConnectionProfile('tw', affected).creatorEmail, undefined)
  assert.equal(loadAzureConnectionProfile('tw', affected).token, 'pat', 'the PAT stays')
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('tw', affected), creatorEmail: 'admin@example.com' }, affected)
  assert.equal(clearSharedEmail(['admin@example.com'], affected), false, 'only once: the admin entering their own email again keeps it')
  assert.equal(loadAzureConnectionProfile('tw', affected).creatorEmail, 'admin@example.com')
  // A connection set up only here (not from Git) is never touched.
  const own = memory()
  saveAzureConnectionProfile({ ...tw, id: 'mine', token: 'pat' }, own)
  assert.equal(clearSharedEmail(['admin@example.com'], own), false)
  assert.equal(loadAzureConnectionProfile('mine', own).creatorEmail, 'admin@example.com')
})

import { applyViewsReset, markResetApplied, parseViewsReset, removeAllConnections, resetPending, serializeViewsReset, viewsBackupName } from '../src/viewDefinitions.ts'
test('back up and clean up: every connection removed, PATs kept per server, the reset applied once per computer (TC-CON-56)', () => {
  // The backup name is dated (UTC, no colons) and the backup holds no PAT.
  assert.equal(viewsBackupName(new Date('2026-11-02T17:05:09.123Z')), 'azure-views-2026-11-02T17-05-09Z.json')
  const admin = memory()
  saveAzureConnectionProfile({ ...dp, token: 'onprem-pat' }, admin)
  saveAzureConnectionProfile({ id: 'tw', url: 'https://dev.azure.com/org/QMS', reason: 'QMS-0025', role: 'time-tracking', token: 'cloud-pat' }, admin)
  const backup = serializeViews(viewsFile(listAzureConnectionProfiles(admin)))
  assert.equal(/onprem-pat|cloud-pat/.test(backup), false, 'no PAT in the backup')
  assert.deepEqual(parseViews(backup).map((view) => view.id), ['dp', 'tw'], 'the backup restores every connection')
  // The admin's clean-up: all gone; a PAT that was only on a connection is now its server's.
  assert.deepEqual(removeAllConnections(admin).map((view) => view.id).sort(), ['dp', 'tw'])
  assert.equal(listAzureConnectionProfiles(admin).length, 0)
  assert.equal(loadServerPat(serverKey(dp), admin), 'onprem-pat')
  assert.equal(loadServerPat('https://dev.azure.com/org', admin), 'cloud-pat')
  const resetAt = '2026-11-02T17:05:09.123Z'
  markResetApplied(resetAt, admin)
  assert.equal(applyViewsReset(resetAt, admin), null, 'the admin does not apply its own clean-up again')
  // The marker in Git: only a valid one counts.
  assert.equal(parseViewsReset(serializeViewsReset(resetAt)), resetAt)
  assert.equal(parseViewsReset('{"schema":1,"kind":"azure-views-reset","resetAt":"soon"}'), null)
  assert.equal(parseViewsReset('nope'), null); assert.equal(parseViewsReset(null), null)
  // Another computer, with a connection it changed itself: removed at its next start, once; later connections stay.
  const user = memory()
  saveAzureConnectionProfile({ ...dp, query: 'SELECT [System.Id] FROM WorkItems WHERE mine = 1', token: 'user-pat' }, user)
  markViewsSynced([dp], user)
  assert.equal(resetPending(resetAt, user), true, 'its old views are not saved back to Git before the reset')
  assert.deepEqual(applyViewsReset(resetAt, user).map((view) => view.id), ['dp'])
  assert.equal(listAzureConnectionProfiles(user).length, 0)
  assert.equal(resetPending(resetAt, user), false)
  saveAzureConnectionProfile({ ...dp, id: 'dp-new', token: '' }, user)
  assert.equal(applyViewsReset(resetAt, user), null, 'the same reset is not applied twice')
  assert.deepEqual(listAzureConnectionProfiles(user).map((view) => view.id), ['dp-new'])
  assert.equal(loadAzureConnectionProfile('dp-new', user).token, 'user-pat', 'the server PAT serves the new connection')
  assert.equal(resetPending(null, user), false, 'no marker in Git: nothing pending')
  // A later clean-up applies even when the earlier marker carried a future time (an admin's wrong clock).
  markResetApplied('2999-01-01T00:00:00.000Z', user)
  assert.equal(resetPending('2026-11-03T09:00:00.000Z', user), true)
  assert.deepEqual(applyViewsReset('2026-11-03T09:00:00.000Z', user).map((view) => view.id), ['dp-new'])
})

import * as viewDefinitions from '../src/viewDefinitions.ts'
import { readFileSync } from 'node:fs'
// GIT-26 (KB-92): after Git storage points to another repository, the first sync changes nothing here: it adds what is
// new, removes and replaces nothing (connections and PATs stay), applies no clean-up marker and says what differs.
test('GIT-26: the first sync from another repository removes no connection or PAT, applies no clean-up, and says what differs (TC-GIT-19)', () => {
  const { compareViewsWithGit, repositoryChanged, markViewsRepository, repositoryChangeNote, applyViewsReset, serializeViewsReset, parseViewsReset } = viewDefinitions
  const storage = memory()
  const cp = { id: 'cp', url: 'https://dev.azure.com/example-org/CP', reason: 'CP', viewName: 'CP', role: 'backlog-view', query: 'SELECT 1' }
  const tw = { id: 'tw', url: 'https://dev.azure.com/example-org/TW', reason: 'TW', viewName: 'Time Writing', role: 'time-tracking' }
  const qms = { id: 'qms', url: 'https://dev.azure.com/example-org/QMS', reason: 'QMS', viewName: 'QMS', role: 'backlog-view', query: 'SELECT 3' }
  saveAzureConnectionProfile({ ...dp, token: 'synthetic-onprem-pat' }, storage)
  saveAzureConnectionProfile({ ...cp, token: 'synthetic-cloud-pat' }, storage)
  saveAzureConnectionProfile({ ...tw, token: 'synthetic-cloud-pat' }, storage)
  // Synced with the old repository: all three came from its setup.
  syncViewsFromGit([dp, cp, tw], storage)
  const old = 'acme/old-data@main:azure-views.json', moved = 'example-org/new-data@main:azure-views.json'
  // A browser from before this check (no repository remembered) with connections from Git counts as a change.
  assert.equal(repositoryChanged(old, storage), true)
  markViewsRepository(old, storage)
  assert.equal(repositoryChanged(old, storage), false)
  assert.equal(repositoryChanged(moved, storage), true)
  assert.equal(repositoryChanged(moved, memory()), false, 'a new browser without connections from Git: an ordinary first sync')
  // The new repository lists other IDs: qms is new, cp differs, dp and tw are not there.
  const cpThere = { ...cp, query: 'SELECT 2' }
  const result = compareViewsWithGit([cpThere, qms], storage)
  assert.deepEqual([result.added, result.removed, result.removedIds, result.updated, result.onlyHere, result.differ, result.repositoryChanged], [['QMS'], [], [], [], ['Digital Platform', 'Time Writing'], ['CP'], true])
  assert.deepEqual(listAzureConnectionProfiles(storage).map((view) => view.id).sort(), ['cp', 'dp', 'qms', 'tw'], 'every connection here is kept')
  assert.equal(loadAzureConnectionProfile('cp', storage).query, 'SELECT 1', 'a connection that differs is kept as it is here')
  assert.equal(loadAzureConnectionProfile('dp', storage).token, 'synthetic-onprem-pat', 'PATs kept')
  assert.equal(loadAzureConnectionProfile('tw', storage).token, 'synthetic-cloud-pat')
  assert.equal(loadAzureConnectionProfile('qms', storage).token, 'synthetic-cloud-pat', 'the added one gets the PAT of its server')
  // Later syncs with the new repository never remove what came from the old one (its baseline is gone).
  markViewsRepository(moved, storage)
  const next = syncViewsFromGit([cpThere, qms], storage)
  assert.deepEqual([next.removed, next.added], [[], []])
  assert.deepEqual(listAzureConnectionProfiles(storage).map((view) => view.id).sort(), ['cp', 'dp', 'qms', 'tw'])
  // A clean-up marker found in the new repository is not applied by the first sync (the hook marks it as seen).
  const resetAt = parseViewsReset(serializeViewsReset('2026-11-20T08:00:00Z'))
  viewDefinitions.markResetApplied(resetAt, storage)
  assert.equal(applyViewsReset(resetAt, storage), null)
  assert.equal(listAzureConnectionProfiles(storage).length, 4)
  const note = repositoryChangeNote('example-org/new-data', result, true)
  assert.match(note, /another repository \(example-org\/new-data\)\. The connection setup there has 1 connection that was not here \(added: QMS\) and lacks 2 that are here \(kept here: Digital Platform, Time Writing\); 1 connection differs from here \(kept as here: CP\)\./)
  assert.match(note, /clean-up \(azure-views-reset\.json\) was not applied here/)
  assert.match(note, /Nothing here was removed or replaced, and your PATs are kept/)
  assert.match(repositoryChangeNote('example-org/new-data', null, false), /It has no connection setup yet; the connections here are kept\./)
  // An empty setup in the new repository: nothing removed, nothing of the old baseline left.
  const empty = memory()
  saveAzureConnectionProfile({ ...cp, token: 'synthetic-cloud-pat' }, empty)
  syncViewsFromGit([cp], empty)
  assert.deepEqual(compareViewsWithGit([], empty).onlyHere, ['CP'])
  assert.deepEqual(syncViewsFromGit([qms], empty).removed, [], 'the old baseline does not remove cp later')
})
test('GIT-26: a shared view with the same ID cannot replace or reclassify a personal view (TC-GIT-19)', () => {
  const storage = memory()
  const personal = { ...dp, id: 'personal', role: 'reference', reason: 'My private query', viewName: 'My private query', mine: true, token: 'synthetic-local-pat' }
  const shared = { ...dp, id: personal.id, reason: 'CP', viewName: 'CP', query: 'SELECT 2' }
  saveAzureConnectionProfile(personal, storage)
  const before = loadAzureConnectionProfile(personal.id, storage)
  assert.deepEqual(viewDefinitions.compareViewsWithGit([shared], storage).differ, ['CP'])
  assert.deepEqual(syncViewsFromGit([shared], storage).kept, ['CP'])
  assert.deepEqual(restoreViews([shared], 'synthetic-other-pat', storage).skipped, ['CP'])
  assert.deepEqual(loadAzureConnectionProfile(personal.id, storage), before)
  assert.equal(gitSyncedIds(storage).includes(personal.id), false)
  assert.deepEqual(viewsFile(listAzureConnectionProfiles(storage)).views, [])
})

test('GIT-26: the start sync checks for a repository change before any clean-up marker is applied; a failed sync is shown (TC-GIT-19)', () => {
  const hook = readFileSync(new URL('../src/useGitStorage.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const sync = hook.slice(hook.indexOf('async function syncViewsNow'), hook.indexOf('async function shareViews'))
  assert.ok(sync.indexOf('repositoryChanged(repository)') > 0 && sync.indexOf('repositoryChanged(repository)') < sync.indexOf('applyViewsReset('), 'the change is checked before the clean-up')
  assert.match(sync, /compareViewsWithGit\(views\)/)
  assert.match(hook, /The connections were not synced from Git: .* The connections and PATs here are kept\./)
})

test('AR-005: a PAT typed for a restore is used and saved only for the one server it was entered for (TC-CON-100)', async () => {
  const { viewServers } = await import('../src/viewDefinitions.ts')
  const storage = memory()
  const a = { id: 'a', url: 'https://alpha.example/tfs/Coll/A', baseUrl: 'https://alpha.example/tfs', reason: 'A', role: 'reference' }
  const b = { id: 'b', url: 'https://beta.example/tfs/Coll/B', baseUrl: 'https://beta.example/tfs', reason: 'B', role: 'reference' }
  assert.deepEqual(viewServers([b, a, { ...a, id: 'a2' }]), ['https://alpha.example/tfs', 'https://beta.example/tfs'], 'the servers of the file, once each')
  const result = restoreViews([a, b], { pat: 'alpha-pat', server: 'https://alpha.example/tfs' }, storage)
  assert.deepEqual(result.noPat, ['B'], 'the view on the other server says it has no PAT')
  assert.equal(loadServerPat('https://alpha.example/tfs', storage), 'alpha-pat', 'saved as the chosen server\'s PAT')
  assert.equal(loadServerPat('https://beta.example/tfs', storage), '', 'never stored for the other server')
  assert.equal(loadAzureConnectionProfile('b', storage).token, '', 'and never sent with its connection')
  assert.equal(JSON.parse(storage.getItem('demand-planning-azure-connection-profiles-v1')).find((profile) => profile.id === 'b').token, '', 'no copy on the other server\'s connection')
  // No server chosen: the typed PAT goes nowhere.
  const none = memory()
  assert.deepEqual(restoreViews([a, b], { pat: 'alpha-pat', server: '' }, none).noPat, ['A', 'B'])
  assert.equal(loadServerPat('https://alpha.example/tfs', none) + loadServerPat('https://beta.example/tfs', none), '')
})

test('AR-006: an edited or cloned connection keeps its PAT only on the same server (TC-CON-101)', async () => {
  const { tokenOnServer } = await import('../src/azureCredentials.ts')
  const old = { url: 'https://alpha.example/tfs/Coll/A', baseUrl: 'https://alpha.example/tfs', token: 'alpha-pat' }
  assert.equal(tokenOnServer(old, 'https://alpha.example/tfs'), 'alpha-pat', 'same server: the PAT stays')
  assert.equal(tokenOnServer(old, 'HTTPS://ALPHA.example/tfs'), 'alpha-pat', 'case is ignored')
  assert.equal(tokenOnServer(old, 'https://beta.example/tfs'), '', 'another server: no PAT')
  assert.equal(tokenOnServer({ url: 'https://dev.azure.com/orga/P', token: 'cloud-pat' }, 'https://dev.azure.com/orgb'), '', 'another cloud organisation: no PAT')
  assert.equal(tokenOnServer(null, 'https://alpha.example/tfs'), '')
  assert.equal(tokenOnServer(old, ''), '', 'no server: no PAT')
  const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/useAzureWorkspace.ts', import.meta.url), 'utf8'))
  assert.match(source, /const token = input\.pat\.trim\(\) \|\| \(serverPat \? '' : tokenOnServer\(existing, key\)\)/, 'saveConnection takes the old PAT only through tokenOnServer')
  assert.doesNotMatch(source, /existing\?\.token \?\? ''/, 'never the old connection\'s PAT as it is')
})
