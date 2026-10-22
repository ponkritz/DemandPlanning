import test from 'node:test'
import assert from 'node:assert/strict'
import { saveAzureConnectionProfile, loadAzureConnectionProfile, listAzureConnectionProfiles } from '../src/azureCredentials.ts'
import { viewsFile, serializeViews, parseViews, restoreViews, serverKey, syncViewsFromGit, markViewsSynced } from '../src/viewDefinitions.ts'
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
  assert.equal(loadAzureConnectionProfile('qms', fresh).token, 'onprem-pat', 'connections not in the file are untouched')
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
  assert.deepEqual(syncViewsFromGit([dp, cp], storage), { added: ['CP'], updated: [], kept: [], noPat: [] })
  assert.equal(loadAzureConnectionProfile('cp', storage).token, 'my-pat')
  // Git changes cp's query; it was not changed here, so it follows Git (PAT kept).
  const cp2 = { ...cp, query: 'SELECT 2' }
  assert.deepEqual(syncViewsFromGit([dp, cp2], storage), { added: [], updated: ['CP'], kept: [], noPat: [] })
  assert.equal(loadAzureConnectionProfile('cp', storage).query, 'SELECT 2')
  assert.equal(loadAzureConnectionProfile('cp', storage).token, 'my-pat')
  // The user changes cp here; a later Git change does not overwrite it.
  saveAzureConnectionProfile({ ...loadAzureConnectionProfile('cp', storage), query: 'SELECT mine' }, storage)
  assert.deepEqual(syncViewsFromGit([dp, { ...cp, query: 'SELECT 3' }], storage), { added: [], updated: [], kept: ['CP'], noPat: [] })
  assert.equal(loadAzureConnectionProfile('cp', storage).query, 'SELECT mine')
  // After Restore from Git (or saving to Git) the connection follows Git again.
  restoreViews([{ ...cp, query: 'SELECT 3' }], '', storage); markViewsSynced([{ ...cp, query: 'SELECT 3' }], storage)
  assert.deepEqual(syncViewsFromGit([dp, { ...cp, query: 'SELECT 4' }], storage).updated, ['CP'])
  // A connection set up here before (never synced) and different from Git is kept; one not in Git is untouched.
  const other = memory()
  saveAzureConnectionProfile({ ...dp, query: 'SELECT local', token: 'x' }, other)
  saveAzureConnectionProfile({ id: 'own', url: 'https://dev.azure.com/o/P', reason: 'Own', token: 'y' }, other)
  assert.deepEqual(syncViewsFromGit([dp], other), { added: [], updated: [], kept: ['Digital Platform'], noPat: [] })
  assert.ok(loadAzureConnectionProfile('own', other))
  // A user without any connection gets them all, view only until a PAT is added.
  assert.deepEqual(syncViewsFromGit([dp, cp], memory()), { added: ['Digital Platform', 'CP'], updated: [], kept: [], noPat: ['Digital Platform', 'CP'] })
})
