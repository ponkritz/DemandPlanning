import test from 'node:test'
import assert from 'node:assert/strict'
import { composeAzureUrl, splitAzureUrl, saveAzureConnectionProfile, listAzureConnectionProfiles, loadAzureConnectionProfile } from '../src/azureCredentials.ts'
import { runWorkItemQuery, withAncestors, projectQuery, defaultReleaseQuery, releaseQueryWhere } from '../src/releaseSource.ts'
import { parseAzureProjectUrl } from '../src/azureDevOps.ts'

const memory = () => { const store = new Map(); return { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) } }

test('base URL + project (+ team) compose to a project URL and split back', () => {
  const url = composeAzureUrl('https://dev.azure.com/ALMP-ORG-MSTP01/', 'Patient Safety and Quality', 'InD Quality')
  assert.equal(url, 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics')
  assert.deepEqual(parseAzureProjectUrl(url), { organization: 'ALMP-ORG-MSTP01', project: 'Patient Safety and Quality', team: 'InD Quality' })
  assert.deepEqual(splitAzureUrl(url), { baseUrl: 'https://dev.azure.com/ALMP-ORG-MSTP01', project: 'Patient Safety and Quality', team: 'InD Quality' })
  assert.equal(composeAzureUrl('https://dev.azure.com/org/Some/Project/Path', 'DHFI'), 'https://dev.azure.com/org/DHFI', 'a pasted project URL keeps only the organization')
  assert.throws(() => composeAzureUrl('http://tfs.example.com/tfs/Coll', 'P'), /https/)
  assert.throws(() => composeAzureUrl('https://user:pw@dev.azure.com/org', 'P'), /https/)
  assert.throws(() => composeAzureUrl('https://dev.azure.com/', 'P'), /organization/)
  assert.throws(() => composeAzureUrl('https://dev.azure.com/org', ' '), /project/)
})

test('any number of connection sets, each with its own role and optional query', () => {
  const storage = memory()
  const sets = [
    { id: 'tw', url: composeAzureUrl('https://dev.azure.com/org', 'Quality', 'Team A'), reason: 'Time Writing', role: 'time-tracking', token: 'a' },
    { id: 'dhfi', url: composeAzureUrl('https://dev.azure.com/org', 'DHFI'), reason: 'DHFI releases', role: 'release-source', query: defaultReleaseQuery, token: 'b' },
    { id: 'vault', url: composeAzureUrl('https://dev.azure.com/org', 'Vault'), reason: 'Vault', role: 'documents', query: "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Document'", token: 'c' },
    { id: 'ref', url: composeAzureUrl('https://dev.azure.com/other', 'Ops'), reason: 'Ops reference', role: 'reference', token: 'd' },
  ]
  for (const set of sets) saveAzureConnectionProfile(set, storage)
  assert.deepEqual(listAzureConnectionProfiles(storage).map((profile) => [profile.id, profile.role, Boolean(profile.query)]), [['tw', 'time-tracking', false], ['dhfi', 'release-source', true], ['vault', 'documents', true], ['ref', 'reference', false]])
  assert.equal(listAzureConnectionProfiles(storage).some((profile) => 'token' in profile), false, 'the list never exposes PATs')
  assert.equal(loadAzureConnectionProfile('vault', storage).token, 'c')
  assert.throws(() => saveAzureConnectionProfile({ ...sets[0], id: 'big', query: 'x'.repeat(50001) }, storage))
  assert.equal(releaseQueryWhere(projectQuery), "[System.TeamProject] = @project AND [System.State] <> 'Removed'")
})

const raw = (id, parent, type = 'Task') => ({ id, fields: { 'System.Title': `Item ${id}`, 'System.WorkItemType': type, 'System.State': 'Active', 'System.TeamProject': 'Quality', ...(parent ? { 'System.Parent': parent } : {}) } })

test('a query is paged by id and read in batches; parents the query missed are added', async () => {
  const config = { organization: 'org', project: 'Quality', team: '' }
  const calls = []
  const world = new Map([[1, raw(1, null, 'Epic')], [2, raw(2, 1, 'Feature')], [3, raw(3, 2, 'User Story')], [10, raw(10, 3)], [11, raw(11, 3)]])
  const transport = async (request) => {
    calls.push(request.operation)
    assert.equal(request.team, 'Quality', 'team falls back to the project for the proxy')
    if (request.operation === 'query') { assert.match(request.query, /^SELECT \[System\.Id\] FROM WorkItems WHERE /); const after = Number(/> (\d+) ORDER/.exec(request.query)[1]); return { workItems: after === 0 ? [{ id: 10 }, { id: 11 }] : [] } }
    return { value: request.ids.map((id) => world.get(id)) }
  }
  const tasks = await runWorkItemQuery(config, 'pat', "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Task'", transport)
  assert.deepEqual(tasks.map((item) => item.id), [10, 11])
  const all = await withAncestors(config, 'pat', tasks, transport)
  assert.deepEqual(all.map((item) => [item.id, item.workItemType]), [[10, 'Task'], [11, 'Task'], [3, 'User Story'], [2, 'Feature'], [1, 'Epic']])
  await assert.rejects(runWorkItemQuery(config, '', projectQuery, transport), /PAT/)
})

import { normalizeBaseUrl, collectionUrl, projectApiBase, apiVersionOf, sameAzureScope, mapAzureWorkItem, requestAzure } from '../src/azureDevOps.ts'
test('on-premises Azure DevOps Server: collection base URL, project and team', () => {
  const base = 'https://tfs.example.com/tfs/DefaultCollection/'
  assert.equal(normalizeBaseUrl(base), 'https://tfs.example.com/tfs/DefaultCollection')
  const url = composeAzureUrl(base, 'Quality Hub', 'Team A')
  assert.equal(url, 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub/_backlogs/backlog/Team%20A/Epics')
  const config = parseAzureProjectUrl(url, base)
  assert.deepEqual(config, { organization: 'DefaultCollection', project: 'Quality Hub', team: 'Team A', baseUrl: 'https://tfs.example.com/tfs/DefaultCollection' })
  assert.deepEqual(splitAzureUrl(url, base), { baseUrl: 'https://tfs.example.com/tfs/DefaultCollection', project: 'Quality Hub', team: 'Team A' })
  assert.equal(projectApiBase(config), 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub')
  assert.equal(mapAzureWorkItem({ id: 7, fields: { 'System.Title': 'x' } }, config).url, 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub/_workitems/edit/7')
  assert.throws(() => parseAzureProjectUrl('https://other.example.com/tfs/DefaultCollection/Quality', base), /does not belong/)
  assert.equal(collectionUrl({ organization: 'org' }), 'https://dev.azure.com/org', 'no base URL means Azure DevOps Services')
  assert.equal(sameAzureScope(config, { ...config, baseUrl: 'https://tfs2.example.com/tfs/DefaultCollection' }), false, 'same names on another server are a different scope')
  assert.equal(sameAzureScope({ organization: 'org', project: 'P', team: 'T' }, { organization: 'org', project: 'P', team: 'T', baseUrl: 'https://dev.azure.com/org' }), true)
  assert.equal(apiVersionOf({}), '7.1'); assert.equal(apiVersionOf({ apiVersion: '6.0' }), '6.0'); assert.equal(apiVersionOf({ apiVersion: '7.1; drop' }), '7.1')
})

test('on-prem connection sets are saved with their base URL and API version', () => {
  const storage = memory()
  const base = 'https://tfs.example.com/tfs/DefaultCollection'
  saveAzureConnectionProfile({ id: 'onprem', url: composeAzureUrl(base, 'Vault'), baseUrl: base, apiVersion: '6.0', reason: 'Vault on-prem', role: 'documents', token: 't' }, storage)
  assert.deepEqual(listAzureConnectionProfiles(storage)[0], { id: 'onprem', url: 'https://tfs.example.com/tfs/DefaultCollection/Vault', reason: 'Vault on-prem', role: 'documents', baseUrl: base, apiVersion: '6.0' })
  assert.throws(() => saveAzureConnectionProfile({ id: 'x', url: 'https://tfs.example.com/other/Vault', baseUrl: base, reason: 'r', token: 't' }, storage), 'project URL must sit under the base URL')
  assert.throws(() => saveAzureConnectionProfile({ id: 'y', url: 'https://tfs.example.com/tfs/DefaultCollection/V', reason: 'r', token: 't' }, storage), 'a non-cloud URL needs its base URL')
})

test('browser requests go to the configured server with its API version', async () => {
  const calls = []
  globalThis.window ??= {}
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ workItems: [] }) } }
  await requestAzure({ organization: 'DefaultCollection', project: 'Quality', team: 'Quality', baseUrl: 'https://tfs.example.com/tfs/DefaultCollection', apiVersion: '6.0', pat: 'p', operation: 'query', query: 'SELECT [System.Id] FROM WorkItems WHERE [System.Id] > 0' })
  assert.equal(calls[0].url, 'https://tfs.example.com/tfs/DefaultCollection/Quality/_apis/wit/wiql?api-version=6.0&$top=1000')
})

import { createRequire } from 'node:module'
test('Windows app proxy: on-prem collection base URL and API version; plain http refused', () => {
  const { azureReadRequest, azureTimeWritingEffortRequest } = createRequire(import.meta.url)('../electron/azure-devops.cjs')
  const onPrem = { organization: 'DefaultCollection', project: 'Quality Hub', team: 'Team A', pat: 'p', baseUrl: 'https://tfs.example.com/tfs/DefaultCollection', apiVersion: '6.0' }
  assert.equal(azureReadRequest({ ...onPrem, operation: 'areas' }).url, 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub/Team%20A/_apis/work/teamsettings/teamfieldvalues?api-version=6.0')
  assert.equal(azureTimeWritingEffortRequest({ ...onPrem, operation: 'update-time-writing-effort', workItemId: 5, planHours: 8 }).url, 'https://tfs.example.com/tfs/DefaultCollection/Quality%20Hub/_apis/wit/workitems/5?api-version=6.0')
  assert.equal(azureReadRequest({ organization: 'org', project: 'P', team: 'T', pat: 'p', operation: 'areas' }).url, 'https://dev.azure.com/org/P/T/_apis/work/teamsettings/teamfieldvalues?api-version=7.1')
  assert.throws(() => azureReadRequest({ ...onPrem, operation: 'areas', baseUrl: 'http://tfs.example.com/tfs/DefaultCollection' }), /https/)
  assert.equal(azureReadRequest({ ...onPrem, operation: 'areas', apiVersion: '7.1&evil=1' }).url.endsWith('api-version=7.1'), true)
})

import { collectionUrlFrom, splitCollectionUrl } from '../src/azureCredentials.ts'
test('server URL + organization/collection + project, as in other Azure DevOps tools', () => {
  const collection = collectionUrlFrom('https://tfsapac04.ta.philips.com/tfs', 'DHPCollection')
  assert.equal(collection, 'https://tfsapac04.ta.philips.com/tfs/DHPCollection')
  assert.equal(composeAzureUrl(collection, 'DHP'), 'https://tfsapac04.ta.philips.com/tfs/DHPCollection/DHP')
  assert.deepEqual(parseAzureProjectUrl(composeAzureUrl(collection, 'DHP'), collection), { organization: 'DHPCollection', project: 'DHP', team: '', baseUrl: collection })
  assert.equal(collectionUrlFrom('https://tfsapac04.ta.philips.com/tfs/DHPCollection/', 'DHPCollection'), collection, 'collection pasted into the server URL is not doubled')
  assert.equal(collectionUrlFrom('', 'ALMP-ORG-MSTP01'), 'https://dev.azure.com/ALMP-ORG-MSTP01', 'empty server URL = Azure DevOps Services')
  assert.equal(collectionUrlFrom('https://dev.azure.com/whatever', 'org'), 'https://dev.azure.com/org')
  assert.throws(() => collectionUrlFrom('https://tfs.example.com/tfs', ''), /collection/)
  assert.throws(() => collectionUrlFrom('https://tfs.example.com/tfs', 'a/b'), /collection/)
  assert.deepEqual(splitCollectionUrl(collection), { serverUrl: 'https://tfsapac04.ta.philips.com/tfs', organization: 'DHPCollection' })
  assert.deepEqual(splitCollectionUrl('https://dev.azure.com/org'), { serverUrl: '', organization: 'org' })
})

import { versionsToTry } from '../src/azureDevOps.ts'
test('older Azure DevOps Server: api-version falls back 7.1 → 6.0 and is remembered', async () => {
  globalThis.window ??= {}
  const seen = []
  globalThis.fetch = async (url) => {
    seen.push(new URL(url).searchParams.get('api-version'))
    const version = new URL(url).searchParams.get('api-version')
    if (version === '7.1') return new Response(JSON.stringify({ message: 'The requested REST API version of 7.1 is out of range for this server.' }), { status: 400, headers: { 'content-type': 'application/json' } })
    return new Response(JSON.stringify({ workItems: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const config = { organization: 'OldCollection', project: 'P', team: 'P', baseUrl: 'https://tfs-old.example.com/tfs/OldCollection' }
  await requestAzure({ ...config, pat: 'p', operation: 'query', query: 'SELECT [System.Id] FROM WorkItems WHERE [System.Id] < 1' })
  assert.deepEqual(seen, ['7.1', '6.0'])
  assert.deepEqual(versionsToTry(config), ['6.0'], 'the working version is reused for this collection')
  assert.deepEqual(versionsToTry({ ...config, apiVersion: '5.0' }), ['5.0'], 'an explicit version is never overridden')
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'TF401232: Work item 5 does not exist.' }), { status: 400, headers: { 'content-type': 'application/json' } })
  await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'query', query: 'SELECT [System.Id] FROM WorkItems WHERE [System.Id] < 1' }), /TF401232/, 'other 400s are reported with the server message')
  globalThis.fetch = async () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
  await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'query', query: 'SELECT [System.Id] FROM WorkItems WHERE [System.Id] < 1' }), /tfs-old\.example\.com\/tfs\/OldCollection\/P/)
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(requestAzure({ ...config, pat: 'p', operation: 'query', query: 'SELECT [System.Id] FROM WorkItems WHERE [System.Id] < 1' }), /Windows app/)
})

test('Windows app proxy: version fallback, redirects refused, certificate errors explained', async () => {
  const { requestAzureDevOps } = createRequire(import.meta.url)('../electron/azure-devops.cjs')
  const input = { organization: 'DHPCollection', project: 'DHP', team: 'DHP', pat: 'p', operation: 'query', query: 'SELECT [System.Id] FROM WorkItems WHERE [System.Id] < 1', baseUrl: 'https://tfsapac04.ta.philips.com/tfs/DHPCollection' }
  const urls = []
  const result = await requestAzureDevOps(input, async (url, options) => {
    urls.push(url); assert.equal(options.redirect, 'manual')
    return url.includes('api-version=7.1') ? new Response('{"message":"VssVersionOutOfRangeException: The requested REST API version 7.1 is out of range"}', { status: 400 }) : new Response('{"workItems":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
  assert.deepEqual(result, { workItems: [] })
  assert.deepEqual(urls.map((url) => new URL(url).pathname + '?' + new URL(url).searchParams.get('api-version')), ['/tfs/DHPCollection/DHP/_apis/wit/wiql?7.1', '/tfs/DHPCollection/DHP/_apis/wit/wiql?6.0'])
  await assert.rejects(requestAzureDevOps({ ...input, project: 'Other' }, async () => new Response('', { status: 302, headers: { location: 'https://login' } })), /redirected/)
  await assert.rejects(requestAzureDevOps({ ...input, project: 'Other2' }, async () => { const error = new TypeError('fetch failed'); error.cause = { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' }; throw error }), /certificate/)
})

import { connectionPresets, pendingPresets, presetProjectUrl } from '../src/connectionPresets.ts'
test('pre-filled connections: DHP on-prem and the cloud Time Writing project, until saved or dismissed', () => {
  const dhp = connectionPresets.find((preset) => preset.key === 'dhp-on-prem')
  assert.equal(presetProjectUrl(dhp), 'https://tfsapac04.ta.philips.com/tfs/DHPCollection/DHP')
  assert.deepEqual(pendingPresets([], []).map((preset) => preset.key), ['time-writing-cloud', 'dhp-on-prem'])
  assert.deepEqual(pendingPresets([{ url: 'https://tfsapac04.ta.philips.com/tfs/DHPCollection/DHP' }], []).map((preset) => preset.key), ['time-writing-cloud'], 'saved → no longer offered')
  assert.deepEqual(pendingPresets([{ url: 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics' }], ['dhp-on-prem']), [], 'saved with a team URL, or dismissed')
})

import { detectOs, desktopDownloads } from '../src/desktopDownloads.ts'
test('desktop download: fixed links to the rolling release, OS detection', () => {
  assert.equal(desktopDownloads.windows, 'https://github.com/neurolooom-eng/Test2/releases/download/desktop-latest/Demand-Planning-Hub-Setup.exe')
  assert.equal(desktopDownloads.mac, 'https://github.com/neurolooom-eng/Test2/releases/download/desktop-latest/Demand-Planning-Hub-mac.dmg')
  assert.equal(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'windows')
  assert.equal(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)'), 'mac')
  assert.equal(detectOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'other')
})

import { backlogViews, timeWritingView } from '../src/backlogViews.ts'
import { showsInMenu, viewNameOf } from '../src/azureCredentials.ts'
test('Azure DevOps menu: connections marked Show in menu, named by View name, backend-only ones hidden', () => {
  const profiles = [
    { id: 'tw1', reason: 'Old TW', role: 'time-tracking' },
    { id: 'tw2', reason: 'Time Writing', viewName: 'QMS-0025', role: 'time-tracking' },
    { id: 'dp', reason: 'DP backlog', viewName: 'Digital Platform', role: 'backlog-view' },
    { id: 'ref', reason: 'DHP', role: 'reference' },
    { id: 'rel', reason: 'DHFI', role: 'release-source', showInMenu: true, baseUrl: 'https://tfs.example.com/tfs/DHPCollection' },
    { id: 'cp', reason: 'Clinical Platform', role: 'backlog-view', showInMenu: false },
  ]
  assert.deepEqual(backlogViews(profiles, 'tw2'), [
    { id: 'tw2', name: 'QMS-0025', readOnly: false, role: 'time-tracking', onPrem: false },
    { id: 'dp', name: 'Digital Platform', readOnly: true, role: 'backlog-view', onPrem: false },
    { id: 'rel', name: 'DHFI', readOnly: true, role: 'release-source', onPrem: true },
  ], 'reference is hidden by default; a backlog view can be hidden; any source can be shown; on-prem views are marked (Release Details)')
  assert.equal(backlogViews(profiles, 'missing')[0].id, 'tw1', 'falls back to the first Time Writing connection')
  assert.equal(backlogViews(profiles, 'missing')[0].name, 'QMS-0025', 'a Time Writing connection without a View name is named QMS-0025')
  assert.deepEqual(backlogViews([{ ...profiles[1], showInMenu: false }], 'tw2'), [], 'the Time Writing backlog can be hidden too')
  assert.equal(timeWritingView([{ ...profiles[1], showInMenu: false }], 'tw2').name, 'QMS-0025', 'links to the backlog keep its name')
  assert.deepEqual(backlogViews([], ''), [{ id: 'time-writing', name: 'QMS-0025', readOnly: false, role: 'time-tracking', onPrem: false }], 'without a Time Writing connection the backlog is still reachable, as QMS-0025')
})

test('View name and Show in menu are saved with the connection', () => {
  const store = memory()
  saveAzureConnectionProfile({ id: 'v1', url: composeAzureUrl('https://dev.azure.com/org', 'Quality', 'T'), reason: 'DP backlog', role: 'backlog-view', viewName: '  Digital Platform ', showInMenu: false, token: 'x' }, store)
  const [summary] = listAzureConnectionProfiles(store)
  assert.equal(summary.viewName, 'Digital Platform'); assert.equal(summary.showInMenu, false)
  assert.equal(viewNameOf(summary), 'Digital Platform'); assert.equal(showsInMenu(summary), false)
  assert.equal(viewNameOf({ reason: 'DHFI' }), 'DHFI'); assert.equal(showsInMenu({ role: 'reference' }), false); assert.equal(showsInMenu({ role: 'backlog-view' }), true)
})
