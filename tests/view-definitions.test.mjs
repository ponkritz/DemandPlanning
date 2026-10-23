import test from 'node:test'
import assert from 'node:assert/strict'
import { saveAzureConnectionProfile, loadAzureConnectionProfile, listAzureConnectionProfiles } from '../src/azureCredentials.ts'
import { saveServerPat } from '../src/azureCredentials.ts'
import { gitSyncedIds, duplicateOf } from '../src/viewDefinitions.ts'
import { viewsFile, serializeViews, parseViews, restoreViews, serverKey, syncViewsFromGit, markViewsSynced, promoteToTimeWriting } from '../src/viewDefinitions.ts'
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
  const first = restoreViews(views, '', fresh)
  assert.deepEqual(first, { added: ['Digital Platform', 'IOCC', 'Cloud X'], updated: [], skipped: [], noPat: ['Cloud X'] })
  assert.equal(loadAzureConnectionProfile('cloud', fresh).token, '', 'restored without a PAT: view only')
  assert.equal(loadAzureConnectionProfile('dp', fresh).token, 'onprem-pat', 'PAT of a connection to the same server')
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('dp', fresh), token: 'own-pat' }, fresh)
  const second = restoreViews(views, 'entered-pat', fresh)
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
  const fetchImpl = async (url, init = {}) => { calls.push([init.method ?? 'GET', url, init.body ? JSON.parse(init.body).sha : undefined]); return init.method === 'PUT' ? Response.json({ content: { sha: 'new' }, commit: { html_url: 'c' } }) : new Response('', { status: 404 }) }
  const target = siblingConfig(config, 'azure-views.json')
  assert.deepEqual(await readTextFile(target, 't', fetchImpl), { text: null, sha: null })
  assert.deepEqual(await writeTextFile(target, 't', 'x', 'old', 'msg', fetchImpl), { sha: 'new', commitUrl: 'c' })
  assert.match(calls[1][1], /contents\/team\/azure-views\.json$/); assert.equal(calls[1][2], 'old')
})

test('Git connection setup is the default: added and followed, unless changed here; PATs kept', () => {
  const storage = memory()
  const cp = { ...dp, id: 'cp', reason: 'CP', viewName: 'CP', query: 'SELECT 1' }
  saveAzureConnectionProfile({ ...dp, token: 'my-pat' }, storage)
  // First start: dp is the same as in Git; cp is new and gets the PAT of the same server.
  assert.deepEqual(syncViewsFromGit([dp, cp], storage), { added: ['CP'], updated: [], kept: [], noPat: [], removed: [], removedIds: [] })
  assert.equal(loadAzureConnectionProfile('cp', storage).token, 'my-pat')
  // Git changes cp's query; it was not changed here, so it follows Git (PAT kept).
  const cp2 = { ...cp, query: 'SELECT 2' }
  assert.deepEqual(syncViewsFromGit([dp, cp2], storage), { added: [], updated: ['CP'], kept: [], noPat: [], removed: [], removedIds: [] })
  assert.equal(loadAzureConnectionProfile('cp', storage).query, 'SELECT 2')
  assert.equal(loadAzureConnectionProfile('cp', storage).token, 'my-pat')
  // The user changes cp here; a later Git change does not overwrite it.
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('cp', storage), query: 'SELECT mine' }, storage)
  assert.deepEqual(syncViewsFromGit([dp, { ...cp, query: 'SELECT 3' }], storage), { added: [], updated: [], kept: ['CP'], noPat: [], removed: [], removedIds: [] })
  assert.equal(loadAzureConnectionProfile('cp', storage).query, 'SELECT mine')
  // After Restore from Git (or saving to Git) the connection follows Git again.
  restoreViews([{ ...cp, query: 'SELECT 3' }], '', storage); markViewsSynced([{ ...cp, query: 'SELECT 3' }], storage)
  assert.deepEqual(syncViewsFromGit([dp, { ...cp, query: 'SELECT 4' }], storage).updated, ['CP'])
  // A connection set up here before (never synced) and different from Git is kept; one not in Git is untouched.
  const other = memory()
  saveAzureConnectionProfile({ ...dp, query: 'SELECT local', token: 'x' }, other)
  saveAzureConnectionProfile({ id: 'own', url: 'https://dev.azure.com/o/P', reason: 'Own', token: 'y' }, other)
  assert.deepEqual(syncViewsFromGit([dp], other), { added: [], updated: [], kept: ['Digital Platform'], noPat: [], removed: [], removedIds: [] })
  assert.ok(loadAzureConnectionProfile('own', other))
  // A user without any connection gets them all, view only until a PAT is added.
  assert.deepEqual(syncViewsFromGit([dp, cp], memory()), { added: ['Digital Platform', 'CP'], updated: [], kept: [], noPat: ['Digital Platform', 'CP'], removed: [], removedIds: [] })
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
