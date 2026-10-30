import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { parseAzureProjectUrl, fetchAzureWorkItems, mergeAzureWorkItems, buildWorkItemQuery, createAzureFeature, featurePatch, featureDescription, withFeatureDoD, releaseClassifications, releaseHierarchyTitles, currentIndiaMonth, createAzureReleaseHierarchy, completeReleaseHierarchy, HierarchyCreationError, readAzureIterations, projectIterationPaths, currentIterationPairs, futureIterationPairs, mapAzureWorkItem, savedBacklogItems, sameAzureScope, updateAzureTimeWritingEffort } from '../src/azureDevOps.ts'
import { buildWorkItemTree } from '../src/azureHierarchy.ts'
import { loadAzurePat, saveAzurePat, forgetAzurePat, listAzurePatProfiles, loadAzurePatProfile, saveAzurePatProfile, forgetAzurePatProfile, listAzureConnectionProfiles, loadAzureConnectionProfile, saveAzureConnectionProfile, forgetAzureConnectionProfile } from '../src/azureCredentials.ts'
import { normalizeBacklogColumns, defaultBacklogColumns, plainAzureText, visibleBacklogRows } from '../src/backlogView.ts'

const require = createRequire(import.meta.url)
const { azureReadRequest, azureFeatureRequest, assertWritableBase: proxyWritableBase, requestAzureDevOps } = require('../electron/azure-devops.cjs')
const config = { organization: 'example-org', project: 'Quality Project', team: 'Team A' }
const pat = 'synthetic-test-token'

test('browser PAT persistence is scoped to organization/project and can be forgotten independently', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  saveAzurePat(config, ` ${pat} `, storage)
  assert.equal(loadAzurePat(config, storage), pat)
  assert.equal(loadAzurePat({ ...config, project: 'Another Project' }, storage), '')
  assert.equal(loadAzurePat({ ...config, organization: 'another-org' }, storage), '')
  assert.equal(loadAzurePat({ ...config, project: config.project.toUpperCase() }, storage), pat)
  const unrelatedBackup = { schemaVersion: 1, azureWorkItems: [] }
  assert.equal(JSON.stringify(unrelatedBackup).includes(pat), false)
  forgetAzurePat(config, storage)
  assert.equal(loadAzurePat(config, storage), '')
  assert.throws(() => saveAzurePat(config, ' ', storage), /Enter a PAT/)
})

test('named PAT profiles stay scoped, reveal only purpose summaries and do not overwrite each other', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  saveAzurePatProfile(config, { id: 'backlog-read', purpose: 'Backlog Read', token: 'read-token' }, storage)
  saveAzurePatProfile(config, { id: 'write', purpose: 'Work Item Write', token: 'write-token' }, storage)
  assert.deepEqual(listAzurePatProfiles(config, storage), [{ id: 'backlog-read', purpose: 'Backlog Read' }, { id: 'write', purpose: 'Work Item Write' }])
  assert.equal(JSON.stringify(listAzurePatProfiles(config, storage)).includes('token'), false)
  assert.equal(loadAzurePatProfile(config, 'backlog-read', storage), 'read-token')
  assert.equal(loadAzurePatProfile(config, 'write', storage), 'write-token')
  saveAzurePatProfile(config, { id: 'write', purpose: 'Work Item Write', token: 'replaced-write-token' }, storage)
  assert.equal(listAzurePatProfiles(config, storage).length, 2)
  assert.equal(loadAzurePatProfile(config, 'write', storage), 'replaced-write-token')
  assert.equal(listAzurePatProfiles({ ...config, project: 'Other' }, storage).length, 0)
  forgetAzurePatProfile(config, 'backlog-read', storage)
  assert.deepEqual(listAzurePatProfiles(config, storage), [{ id: 'write', purpose: 'Work Item Write' }])
})

test('ADS configurations retain URL, reason and PAT as one selectable browser-local set', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
  const first = { id: 'quality-read', url: 'https://dev.azure.com/example-org/Quality%20Project/_backlogs/backlog/Team%20A/Epics', reason: 'Quality backlog read', token: 'quality-read-token' }
  const second = { id: 'release-write', url: 'https://dev.azure.com/another-org/Release%20Project/_backlogs/backlog/Release%20Team/Epics', reason: 'Release work-item write', token: 'release-write-token' }
  saveAzureConnectionProfile(first, storage); saveAzureConnectionProfile(second, storage)
  assert.deepEqual(listAzureConnectionProfiles(storage), [{ id: first.id, url: first.url, reason: first.reason, role: 'time-tracking' }, { id: second.id, url: second.url, reason: second.reason, role: 'time-tracking' }])
  assert.equal(JSON.stringify(listAzureConnectionProfiles(storage)).includes('token'), false)
  assert.deepEqual(loadAzureConnectionProfile(second.id, storage), second)
  forgetAzureConnectionProfile(first.id, storage)
  assert.deepEqual(listAzureConnectionProfiles(storage), [{ id: second.id, url: second.url, reason: second.reason, role: 'time-tracking' }])
})

test('ADS configuration retains the creator email separately from its PAT', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const profile = { id: 'write', url: 'https://dev.azure.com/example-org/Quality%20Project/_backlogs/backlog/Team%20A/Epics', reason: 'Feature write', creatorEmail: 'creator@example.test', token: 'write-token' }
  saveAzureConnectionProfile(profile, storage)
  assert.deepEqual(listAzureConnectionProfiles(storage), [{ id: profile.id, url: profile.url, reason: profile.reason, role: 'time-tracking', creatorEmail: profile.creatorEmail }])
  assert.equal(loadAzureConnectionProfile(profile.id, storage)?.creatorEmail, profile.creatorEmail)
  assert.equal(JSON.stringify(listAzureConnectionProfiles(storage)).includes('token'), false)
})

test('monthly effort writes only both scheduling fields on a verified month Task', async () => {
  const parent = { id: 40, fields: { 'System.Title': 'Program | Service | v1.0 - Time Writing', 'System.WorkItemType': 'User Story', 'System.TeamProject': config.project } }
  const record = { id: 41, fields: { 'System.Title': 'October 2026 | Program | Service | v1.0', 'System.WorkItemType': 'Task', 'System.Parent': 40, 'System.State': 'Active', 'System.TeamProject': config.project, 'System.AreaPath': 'Quality', 'System.IterationPath': config.project, 'Microsoft.VSTS.Scheduling.OriginalEstimate': 4, 'Microsoft.VSTS.Scheduling.CompletedWork': 2 } }
  let write
  const updated = await updateAzureTimeWritingEffort(config, pat, 41, 8, 6, false, async (request) => {
    if (request.operation === 'items') return { value: request.ids[0] === 40 ? [parent] : [record] }
    assert.equal(request.operation, 'update-time-writing-effort')
    write = request
    return { ...record, fields: { ...record.fields, 'Microsoft.VSTS.Scheduling.OriginalEstimate': 8, 'Microsoft.VSTS.Scheduling.CompletedWork': 6 } }
  })
  assert.equal(write.planHours, 8)
  assert.equal(write.actualHours, 6)
  assert.equal(updated.originalEstimate, 8)
  assert.equal(updated.completedWork, 6)
  await assert.rejects(updateAzureTimeWritingEffort(config, pat, 41, -1, 2, false, async () => ({})), /Original Estimate/)
  await assert.rejects(updateAzureTimeWritingEffort(config, pat, 41, 1, 2, false, async (request) => request.operation === 'items' ? { value: [{ ...record, fields: { ...record.fields, 'System.Title': 'Regular Task' } }] } : ({})), /Only a month-named/)
})

test('PU and Release descriptions follow the agreed DoD templates', () => {
  assert.equal(featureDescription('PU'), 'Feature DoD: DT finished. This is a PU release.')
  assert.equal(featureDescription('Release'), 'Feature DoD: IQOQ finished and Checklist uploaded into the Feature.')
})

test('backlog URL resolves organization, decoded project and team; rejects other hosts', () => {
  assert.deepEqual(parseAzureProjectUrl('https://dev.azure.com/example-org/Quality%20Project/_backlogs/backlog/Team%20A/Epics'), config)
  assert.throws(() => parseAzureProjectUrl('https://example.com/org/project'))
  assert.throws(() => parseAzureProjectUrl('https://dev.azure.com@other.example/org/project'))
})

test('team query honors exact and child-area settings, escapes literals and uses ID paging', () => {
  const query = buildWorkItemQuery("Quality's", [{ value: 'Quality\\Team A', includeChildren: true }, { value: "Quality\\Team B's", includeChildren: false }], 1000)
  assert.match(query, /\[System.TeamProject\] = 'Quality''s'/)
  assert.ok(query.includes("[System.AreaPath] UNDER 'Quality\\Team A'"))
  assert.ok(query.includes("[System.AreaPath] = 'Quality\\Team B''s'"))
  assert.match(query, /\[System.Id\] > 1000 ORDER BY/)
  assert.throws(() => buildWorkItemQuery('Quality', [], 0))
})

test('fetch batches at 200, follows all ID pages and stores no token or invented dates', async () => {
  const batches = []
  let page = 0
  const result = await fetchAzureWorkItems(config, pat, async (request) => {
    if (request.operation === 'areas') return { field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality\\Team A', includeChildren: true }] }
    if (request.operation === 'backlog-epics') return { workItems: [{ target: { id: 1 } }] }
    if (request.operation === 'query') {
      assert.ok(request.query.includes('[System.Parent] IN ('), 'Every traversal query must be constrained to known parents')
      assert.ok(request.query.includes("[System.State] <> 'Removed'"))
      if (!request.query.includes('[System.Parent] IN (1)')) return { workItems: [] }
      page++
      return { workItems: page === 1 ? Array.from({ length: 201 }, (_, i) => ({ id: i + 2 })) : page === 2 ? [{ id: 203 }] : [] }
    }
    batches.push(request.ids.length)
    return { value: request.ids.map((id) => ({ id, fields: { 'System.Title': `Sample ${id}`, 'System.WorkItemType': id === 1 ? 'Epic' : 'Feature', 'System.State': 'Active', 'System.AssignedTo': { displayName: 'Example QE' }, 'System.Parent': id === 1 ? undefined : 1 } })) }
  })
  assert.deepEqual(batches, [1, 200, 1, 1])
  assert.equal(result.items.length, 203)
  assert.equal(result.items[1].parentId, 1)
  assert.equal(result.items[0].closedDate, undefined)
  assert.equal(result.items[0].targetDate, undefined)
  assert.equal(JSON.stringify(result).includes(pat), false)
  const refreshed = { ...result.items[0], state: 'Closed' }
  const merged = mergeAzureWorkItems(result.items, [refreshed])
  assert.equal(merged.length, 203)
  assert.equal(merged[0].state, 'Closed')
})

test('incomplete batch aborts rather than publishing a misleading partial import', async () => {
  await assert.rejects(fetchAzureWorkItems(config, pat, async (request) => {
    if (request.operation === 'areas') return { field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality', includeChildren: true }] }
    if (request.operation === 'backlog-epics') return { workItems: [{ target: { id: 1 } }, { target: { id: 2 } }] }
    if (request.operation === 'query') return { workItems: [{ id: 1 }, { id: 2 }] }
    return { value: [{ id: 1, fields: {} }] }
  }), /Some work items could not be read/)
})

test('legacy all-project flag cannot widen the actual team Epic backlog fetch', async () => {
  const result = await fetchAzureWorkItems({ ...config, includeProjectEpics: true }, pat, async (request) => {
    if (request.operation === 'areas') return { field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality\\Team A', includeChildren: true }] }
    if (request.operation === 'backlog-epics') return { workItems: [{ target: { id: 1 } }, { target: { id: 1 } }] }
    if (request.operation === 'query') {
      assert.ok(request.query.includes('[System.Parent] IN (1)'))
      assert.equal(request.query.includes("[System.WorkItemType] = 'Epic'"), false)
      return { workItems: [] }
    }
    return { value: request.ids.map((id) => ({ id, fields: { 'System.WorkItemType': 'Epic', 'System.Title': `Example Epic ${id}` } })) }
  })
  assert.equal(result.items.length, 1)
  assert.deepEqual(result.scope.itemKeys, result.items.map((item) => item.key))
  assert.equal(result.scope.team, config.team)
})

test('empty or inaccessible team backlog never falls back to a project query', async () => {
  const transport = async (request) => {
    if (request.operation === 'areas') return { field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality', includeChildren: true }] }
    if (request.operation === 'backlog-epics') return { workItems: [] }
    throw new Error('No other operation should run for an empty backlog')
  }
  assert.deepEqual((await fetchAzureWorkItems(config, pat, transport)).items, [])
  await assert.rejects(fetchAzureWorkItems(config, pat, async (request) => request.operation === 'backlog-epics' ? {} : transport(request)), /No project-wide fallback/)
})

test('saved cache displays only exact verified team membership and hides legacy unscoped data', () => {
  const items = [1, 2, 3].map((id) => mapAzureWorkItem({ id, fields: { 'System.State': 'Active' } }, config))
  const scope = { ...config, itemKeys: [items[0].key, items[1].key], areaPaths: ['Quality'], fetchedAt: '2026-10-16T00:00:00Z' }
  assert.deepEqual(savedBacklogItems(items, undefined, config), [])
  assert.deepEqual(savedBacklogItems(items, scope, { ...config, team: 'Other team' }), [])
  assert.deepEqual(savedBacklogItems(items, scope, config).map((item) => item.id), [1, 2])
  assert.equal(sameAzureScope(scope, { ...config, team: config.team.toUpperCase() }), true)
})

test('desktop backlog endpoint is fixed to selected team and uses GET', () => {
  const request = azureReadRequest({ ...config, pat, operation: 'backlog-epics' })
  assert.equal(request.url, 'https://dev.azure.com/example-org/Quality%20Project/Team%20A/_apis/work/backlogs/Microsoft.EpicCategory/workItems?api-version=7.1')
  assert.equal(request.options.method, 'GET')
  assert.equal(request.options.body, undefined)
})

test('fetch follows only actual backlog Epic descendants, excluding unrelated same-area items and Removed records', async () => {
  const records = [
    [10, 'Epic', 'Active', undefined], [20, 'Feature', 'New', 10], [21, 'Feature', 'Removed', 10],
    [30, 'User Story', 'Active', 20], [40, 'Task', 'Closed', 30],
    [99, 'Epic', 'Active', undefined], [100, 'Feature', 'Active', 99],
  ].map(([id, type, state, parent]) => ({ id, fields: { 'System.Title': `Example ${id}`, 'System.WorkItemType': type, 'System.State': state, 'System.Parent': parent, 'System.TeamProject': config.project, 'System.AreaPath': 'Quality\\Team A' } }))
  const result = await fetchAzureWorkItems(config, pat, async (request) => {
    if (request.operation === 'areas') return { field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality\\Team A', includeChildren: true }] }
    if (request.operation === 'backlog-epics') return { workItems: [{ target: { id: 10 } }] }
    if (request.operation === 'items') return { value: records.filter((item) => request.ids.includes(item.id)) }
    const parents = request.query.match(/\[System.Parent\] IN \(([\d,]+)\)/)[1].split(',').map(Number)
    const after = Number(request.query.match(/\[System.Id\] > (\d+)/)[1])
    return { workItems: records.filter((item) => parents.includes(item.fields['System.Parent']) && item.id > after && item.fields['System.State'] !== 'Removed').map((item) => ({ id: item.id })) }
  })
  assert.deepEqual(result.items.map((item) => item.id), [10, 20, 30, 40])
  assert.ok(result.scope.itemKeys.every((key) => !key.endsWith('/99') && !key.endsWith('/100')))
})

test('desktop bridge constrains credentials to Azure DevOps and rejects writes and oversized batches', () => {
  const read = azureReadRequest({ ...config, pat, operation: 'areas' })
  assert.equal(new URL(read.url).hostname, 'dev.azure.com')
  assert.equal(read.options.redirect, 'error')
  assert.equal(read.options.method, 'GET')
  assert.equal(read.url.includes(pat), false)
  assert.throws(() => azureReadRequest({ ...config, pat, operation: 'delete' }))
  assert.throws(() => azureReadRequest({ ...config, pat, operation: 'items', ids: Array(201).fill(1) }))
  assert.throws(() => azureReadRequest({ ...config, pat, operation: 'query', query: 'DELETE FROM WorkItems' }))
})

const feature = { parentId: 10, title: 'Example | Service | v1.0', description: 'Feature DoD: Example <text>\nNext line', acceptanceCriteria: 'Meets example criteria', assignedTo: 'example@example.invalid', targetDate: '2026-10-30' }

test('Feature creation validates first, links to Epic, then verifies persisted parent', async () => {
  const operations = []
  const created = await createAzureFeature(config, pat, feature, async (request) => {
    operations.push(request)
    if (request.operation === 'items' && request.ids[0] === 10) return { value: [{ id: 10, fields: { 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality\\Team A', 'System.TeamProject': config.project } }] }
    if (request.operation === 'create-feature') return { id: request.validateOnly ? 0 : 11, fields: {} }
    return { value: [{ id: 11, fields: { 'System.Title': feature.title, 'System.WorkItemType': 'Feature', 'System.State': 'New', 'System.AreaPath': 'Quality\\Team A' }, relations: [{ rel: 'System.LinkTypes.Hierarchy-Reverse', url: 'https://dev.azure.com/example-org/_apis/wit/workItems/10' }] }] }
  })
  assert.deepEqual(operations.map((request) => [request.operation, request.validateOnly]), [['items', undefined], ['create-feature', true], ['create-feature', false], ['items', undefined]])
  assert.equal(operations[1].feature.areaPath, 'Quality\\Team A')
  assert.equal(created.parentId, 10)
  assert.equal(created.id, 11)
  assert.equal(JSON.stringify(created).includes(pat), false)
})

test('wrong parent type and failed project validation prevent Feature creation', async () => {
  await assert.rejects(createAzureFeature(config, pat, feature, async () => ({ value: [{ id: 10, fields: { 'System.WorkItemType': 'Task' } }] })), /not an accessible Epic/)
  let persisted = false
  await assert.rejects(createAzureFeature(config, pat, feature, async (request) => {
    if (request.operation === 'items') return { value: [{ id: 10, fields: { 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality' } }] }
    if (request.validateOnly) throw new Error('Required custom field is missing')
    persisted = true
  }), /Required custom field/)
  assert.equal(persisted, false)
})

test('explicit area override and named iteration resolve before creation and verify after saving', async () => {
  let sent
  const chosen = { ...feature, areaPath: 'Quality\\Configuration', iterationPath: 'Current PI' }
  const created = await createAzureFeature(config, pat, chosen, async (request) => {
    if (request.operation === 'items' && request.ids[0] === 10) return { value: [{ id: 10, fields: { 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality\\Team A' } }] }
    if (request.operation === 'iterations') return { value: [{ name: 'Current PI', path: 'Quality\\PI 2026.4' }] }
    if (request.operation === 'create-feature') { sent = request.feature; return { id: 11 } }
    return { value: [{ id: 11, fields: { 'System.WorkItemType': 'Feature', 'System.Parent': 10, 'System.AreaPath': chosen.areaPath, 'System.IterationPath': 'Quality\\PI 2026.4' } }] }
  })
  assert.equal(sent.areaPath, chosen.areaPath)
  assert.equal(sent.iterationPath, 'Quality\\PI 2026.4')
  assert.equal(created.iterationPath, 'Quality\\PI 2026.4')
  let wrote = false
  await assert.rejects(createAzureFeature(config, pat, chosen, async (request) => {
    if (request.operation === 'items') return { value: [{ id: 10, fields: { 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality' } }] }
    if (request.operation === 'iterations') return { value: [] }
    if (request.operation === 'iteration-tree') return { name: config.project, children: [] }
    wrote = true
  }), /not found in team or project iterations/)
  assert.equal(wrote, false)
})

test('project iteration tree removes the internal Iteration segment and keeps nested paths', () => {
  assert.deepEqual(projectIterationPaths({ name: 'Quality Project', path: '\\Quality Project\\Iteration', children: [
    { name: 'Current PI', path: '\\Quality Project\\Iteration\\Current PI', children: [{ name: 'Sprint 1', path: '\\Quality Project\\Iteration\\Current PI\\Sprint 1' }] },
  ] }), [
    { name: 'Quality Project', path: 'Quality Project' },
    { name: 'Current PI', path: 'Quality Project\\Current PI' },
    { name: 'Sprint 1', path: 'Quality Project\\Current PI\\Sprint 1' },
  ])
})

test('Current PI can resolve from project configuration when absent from team iterations', async () => {
  let payload
  const result = await createAzureFeature(config, pat, { ...feature, iterationPath: 'Current PI' }, async (request) => {
    if (request.operation === 'items' && request.ids[0] === 10) return { value: [{ id: 10, fields: { 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality' } }] }
    if (request.operation === 'iterations') return { value: [] }
    if (request.operation === 'iteration-tree') return { name: config.project, path: '\\Quality Project\\Iteration', children: [{ name: 'Current PI', path: '\\Quality Project\\Iteration\\Current PI' }] }
    if (request.operation === 'create-feature') { payload = request.feature; return { id: 11 } }
    return { value: [{ id: 11, fields: { 'System.WorkItemType': 'Feature', 'System.Parent': 10, 'System.AreaPath': 'Quality', 'System.IterationPath': 'Quality Project\\Current PI' } }] }
  })
  assert.equal(payload.iterationPath, 'Quality Project\\Current PI')
  assert.equal(result.iterationPath, 'Quality Project\\Current PI')
})

test('team and project iteration choices deduplicate paths; ambiguous names stop before writes', async () => {
  const transport = async (request) => {
    if (request.operation === 'iterations') return { value: [{ name: 'PI', path: 'Quality Project\\A\\PI' }] }
    if (request.operation === 'iteration-tree') return { name: config.project, children: [{ name: 'A', children: [{ name: 'PI' }] }, { name: 'B', children: [{ name: 'PI' }] }] }
    if (request.operation === 'items') return { value: [{ id: 10, fields: { 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality' } }] }
    throw new Error('No creation should happen')
  }
  const choices = await readAzureIterations(config, pat, transport)
  assert.equal(choices.filter((item) => item.path === 'Quality Project\\A\\PI').length, 1)
  await assert.rejects(createAzureFeature(config, pat, { ...feature, iterationPath: 'PI' }, transport), /is ambiguous/)
  const request = azureReadRequest({ ...config, pat, operation: 'iteration-tree' })
  assert.ok(request.url.includes('/_apis/wit/classificationnodes/iterations?'))
  assert.ok(request.url.includes('$depth=10'))
  assert.equal(request.options.method, 'GET')
})

test('uncertain verification reports the created ID without retrying a write', async () => {
  let writes = 0
  await assert.rejects(createAzureFeature(config, pat, feature, async (request) => {
    if (request.operation === 'items' && request.ids[0] === 10) return { value: [{ id: 10, fields: { 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality' } }] }
    if (request.operation === 'create-feature') { if (!request.validateOnly) writes++; return { id: 11, fields: {} } }
    throw new Error('Read-back failed')
  }), /Feature #11 was created/)
  assert.equal(writes, 1)
})

test('web and desktop Feature payloads match, escape HTML, and never bypass project rules', () => {
  const input = { ...config, pat, operation: 'create-feature', validateOnly: true, feature: { ...feature, areaPath: 'Quality\\Team A' } }
  const request = azureFeatureRequest(input)
  assert.deepEqual(JSON.parse(request.options.body), featurePatch(config, input.feature))
  assert.match(request.url, /validateOnly=true/)
  assert.equal(request.options.headers['Content-Type'], 'application/json-patch+json')
  assert.equal(request.url.includes('bypassRules'), false)
  assert.equal(request.options.body.includes('&lt;text&gt;<br>'), true)
  const link = JSON.parse(request.options.body).find((field) => field.path === '/relations/-')
  assert.equal(link.value.rel, 'System.LinkTypes.Hierarchy-Reverse')
  assert.match(link.value.url, /\/workItems\/10$/)
  assert.throws(() => azureFeatureRequest({ ...input, feature: { ...input.feature, parentId: -1 } }))
  assert.throws(() => azureFeatureRequest({ ...input, validateOnly: undefined }))
})

function treeItem(id, type, state, parentId) {
  return { key: `example-org/quality project/${id}`, id, organization: config.organization, project: config.project, title: `Sample ${id}`, workItemType: type, state, parentId, assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '' }
}

test('tree preserves four real levels; Active filter keeps Closed parents as context', () => {
  const data = [treeItem(1, 'Epic', 'Closed'), treeItem(2, 'Feature', 'New', 1), treeItem(3, 'User Story', 'Closed', 2), treeItem(4, 'Task', 'Active', 3), treeItem(5, 'Feature', 'Closed', 1)]
  const all = buildWorkItemTree(data, 'All', '')
  assert.equal(all[0].children[0].children[0].children[0].item.id, 4)
  assert.equal(all[0].children.length, 2)
  const active = buildWorkItemTree(data, 'Active', '')
  assert.equal(active[0].context, true)
  assert.equal(active[0].children.length, 1)
  assert.equal(active[0].children[0].children[0].children[0].context, false)
  assert.equal(buildWorkItemTree(data, 'New', '')[0].children[0].item.id, 2)
  assert.equal(buildWorkItemTree(data, 'All', 'unmatched').length, 0)
})

test('missing parents and malformed cycles remain visible without infinite traversal', () => {
  const orphan = buildWorkItemTree([treeItem(5, 'Feature', 'Active', 99)], 'All', '')
  assert.equal(orphan[0].parentMissing, true)
  const cycle = buildWorkItemTree([treeItem(1, 'Feature', 'New', 2), treeItem(2, 'Task', 'Active', 1)], 'All', '')
  assert.equal(cycle.length, 2)
  assert.equal(cycle[0].children.length, 0)
})

function fakeHierarchyServer() {
  const records = new Map([[10, { id: 10, fields: { 'System.Title': 'Example Epic', 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality Project\\Example Team', 'System.IterationPath': 'Quality Project\\Current PI', 'System.TeamProject': config.project } }]])
  let nextId = 11
  let failureTitle = ''
  const writes = []
  const transport = async (request) => {
    if (request.operation === 'items') return { value: request.ids.map((id) => records.get(id)).filter(Boolean) }
    if (request.operation === 'iterations') return { value: [{ name: 'Current PI', path: 'Quality Project\\Current PI' }] }
    if (request.operation === 'query') {
      const match = /\[System.Parent\] = (\d+)/.exec(request.query)
      assert.ok(match, 'Child lookup must be scoped to a specific parent')
      return { workItems: [...records.values()].filter((item) => item.fields['System.Parent'] === Number(match[1])).map((item) => ({ id: item.id })) }
    }
    if (request.operation === 'create-feature' || request.operation === 'create-child') {
      if (request.feature.title === failureTitle) throw new Error('Synthetic project validation failure')
      if (request.validateOnly) return { id: 0, fields: {} }
      const source = request.feature
      assert.match(String(source.assignedTo ?? ''), /@/, 'every created item is assigned')
      const item = { id: nextId++, fields: { 'System.Title': source.title, 'System.WorkItemType': request.operation === 'create-feature' ? 'Feature' : request.workItemType, 'System.State': 'New', 'System.Parent': source.parentId, 'System.AreaPath': source.areaPath, 'System.IterationPath': source.iterationPath || config.project, 'System.TeamProject': config.project, ...(source.assignedTo ? { 'System.AssignedTo': { id: source.assignedTo, uniqueName: source.assignedTo, displayName: 'Synthetic Creator' } } : {}), ...(source.adhoc ? { 'System.Tags': 'ad-hoc' } : {}) } }
      records.set(item.id, item); writes.push(item)
      return item
    }
    if (request.operation === 'update-time-writing-effort') { const item = records.get(request.workItemId); if (request.planHours != null) item.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] = request.planHours; if (request.actualHours != null) item.fields['Microsoft.VSTS.Scheduling.CompletedWork'] = request.actualHours; return item }
    throw new Error(`Unexpected test operation: ${request.operation}`)
  }
  return { transport, records, writes, failOn: (title) => { failureTitle = title } }
}

test('release naming and India month rollover implement the final task-title correction', () => {
  const pu = releaseHierarchyTitles('Example | Service | v1.0', 'PU', 'October 2026')
  assert.deepEqual(pu.reviews.map((item) => item.milestone), ['SFV', 'DT', 'IQOQ'])
  assert.equal(pu.reviews[0].title, 'SFV : Review of Deliverables (Service 1.0)')
  assert.equal(pu.review, 'Review of Deliverables - Example | Service | v1.0')
  assert.equal(pu.timeWriting, 'Example | Service | v1.0 - Time Writing')
  assert.equal(pu.task, 'October 2026 | Example | Service | v1.0')
  assert.deepEqual(releaseHierarchyTitles('Example | Service | v1.0', 'Release', 'October 2026').reviews.map((item) => item.milestone), ['PRD', 'SFV', 'DT', 'IQOQ'])
  assert.equal(currentIndiaMonth(new Date('2026-10-31T18:29:00Z')), 'October 2026')
  assert.equal(currentIndiaMonth(new Date('2026-10-31T18:30:00Z')), 'November 2026')
})

for (const [kind, milestones, expectedStories] of [['PU', undefined, 5], ['Release', undefined, 6], ['PU', [], 2], ['Release', [], 2], ['Release', ['PRD', 'IQOQ'], 4]]) {
  test(`${kind} with ${milestones === undefined ? 'all' : milestones.length} milestones always creates Time Writing and the month task`, async () => {
    const server = fakeHierarchyServer()
    const result = await createAzureReleaseHierarchy(config, pat, { ...feature, iterationPath: 'Current PI' }, kind, milestones, 'October 2026', server.transport)
    const stories = result.items.filter((item) => item.workItemType === 'User Story')
    assert.equal(stories.length, expectedStories)
    const timeWriting = stories.find((item) => item.title.endsWith(' - Time Writing'))
    assert.ok(timeWriting)
    assert.equal(timeWriting.parentId, result.feature.id)
    const review = stories.find((item) => item.title === 'Review of Deliverables - Example | Service | v1.0')
    assert.ok(review, 'the built-in Review of Deliverables story is always created')
    assert.equal(review.iterationPath, 'Quality Project\\Current PI', 'in the Sprint chosen (here the Feature iteration)')
    const tasks = result.items.filter((item) => item.workItemType === 'Task')
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].parentId, timeWriting.id)
    assert.equal(tasks[0].title, 'October 2026 | Example | Service | v1.0')
    assert.equal(tasks[0].iterationPath, config.project)
    for (const story of stories) {
      assert.equal(story.iterationPath, story.id === timeWriting.id ? config.project : 'Quality Project\\Current PI', 'the Time Writing story sits at the project root, not in a PI or Sprint')
      assert.equal(story.areaPath, result.feature.areaPath)
    }
    const writesBefore = server.writes.length
    await completeReleaseHierarchy(config, pat, result.feature.id, kind, milestones, 'October 2026', server.transport)
    assert.equal(server.writes.length, writesBefore, 'Completing the same hierarchy must reuse existing children')
    await completeReleaseHierarchy(config, pat, result.feature.id, kind, milestones, 'November 2026', server.transport)
    assert.equal(server.writes.length, writesBefore + 1, 'Next month adds one task without duplicating stories')
  })
}

test('partial hierarchy retains known IDs and completion creates only missing children', async () => {
  const server = fakeHierarchyServer()
  server.failOn('DT : Review of Deliverables (Service 1.0)')
  let failed
  try { await createAzureReleaseHierarchy(config, pat, { ...feature, iterationPath: 'Current PI' }, 'PU', undefined, 'October 2026', server.transport) }
  catch (error) { failed = error }
  assert.ok(failed instanceof HierarchyCreationError)
  assert.equal(failed.createdItems.filter((item) => item.workItemType === 'Feature').length, 1)
  assert.equal(failed.createdItems.filter((item) => item.workItemType === 'User Story').length, 1)
  const root = failed.createdItems.find((item) => item.workItemType === 'Feature')
  server.failOn('')
  const result = await completeReleaseHierarchy(config, pat, root.id, 'PU', undefined, 'October 2026', server.transport)
  assert.equal(result.items.length, 7)
  assert.equal(server.writes.filter((item) => item.fields['System.WorkItemType'] === 'Feature').length, 1)
  assert.equal(server.writes.length, 7)
})

test('desktop child requests permit only User Story/Task and retain hierarchy relation', () => {
  for (const type of ['User Story', 'Task']) {
    const request = azureFeatureRequest({ ...config, pat, operation: 'create-child', workItemType: type, validateOnly: true, feature: { ...feature, areaPath: 'Quality Project', iterationPath: 'Quality Project' } })
    assert.ok(request.url.includes(`$${encodeURIComponent(type)}?`))
    assert.ok(JSON.parse(request.options.body).some((operation) => operation.path === '/relations/-' && operation.value.rel === 'System.LinkTypes.Hierarchy-Reverse'))
  }
  assert.throws(() => azureFeatureRequest({ ...config, pat, operation: 'create-child', workItemType: 'Epic', validateOnly: false, feature: { ...feature, areaPath: 'Quality' } }))
})

test('multi-select state filters include both New and Active, with ancestor context and explicit none', () => {
  const data = [treeItem(1, 'Epic', 'Closed'), treeItem(2, 'Feature', 'New', 1), treeItem(3, 'User Story', 'Active', 2), treeItem(4, 'Task', 'Closed', 3)]
  const roots = buildWorkItemTree(data, ['New', 'Active'], '')
  assert.equal(roots[0].context, true)
  assert.equal(roots[0].children[0].context, false)
  assert.equal(roots[0].children[0].children[0].item.id, 3)
  assert.equal(roots[0].children[0].children[0].children.length, 0)
  assert.deepEqual(buildWorkItemTree(data, [], ''), [])
  assert.equal(buildWorkItemTree(data, ['All'], '')[0].children[0].children[0].children.length, 1)
})

test('current dates resolve PI and nested Sprint with inclusive India-day boundaries', () => {
  const iterations = projectIterationPaths({ name: 'Quality Project', children: [{ name: 'PI A', attributes: { startDate: '2026-10-01T00:00:00Z', finishDate: '2026-12-31T00:00:00Z' }, children: [{ name: 'Sprint 1', attributes: { startDate: '2026-10-01T00:00:00Z', finishDate: '2026-10-16T00:00:00Z' } }, { name: 'Sprint 2', attributes: { startDate: '2026-10-17T00:00:00Z', finishDate: '2026-10-30T00:00:00Z' } }] }] })
  assert.equal(currentIterationPairs(iterations, new Date('2026-10-16T18:29:59Z'))[0].sprint.name, 'Sprint 1')
  assert.equal(currentIterationPairs(iterations, new Date('2026-10-16T18:30:00Z'))[0].sprint.name, 'Sprint 2')
  assert.equal(currentIterationPairs(iterations, new Date('2027-01-01T00:00:00Z')).length, 0)
  assert.equal(currentIterationPairs([{ name: 'No dates', path: 'Quality Project\\Unknown' }]).length, 0)
})

test('a dated Sprint resolves its PI parent even when Azure has no PI date range', () => {
  const iterations = projectIterationPaths({ name: 'Quality Project', children: [{ name: 'PI 2026.4', children: [{ name: 'Sprint 7', attributes: { startDate: '2026-10-17T00:00:00Z', finishDate: '2026-10-30T00:00:00Z' } }] }] })
  const pair = currentIterationPairs(iterations, new Date('2026-10-17T12:00:00Z'))
  assert.equal(pair.length, 1)
  assert.equal(pair[0].pi.name, 'PI 2026.4')
  assert.equal(pair[0].sprint.name, 'Sprint 7')
})

test('future PI and Sprint pairs are available alongside the current schedule', () => {
  const iterations = projectIterationPaths({ name: 'Quality Project', children: [{ name: 'PI 2026.4', children: [{ name: 'Sprint 7', attributes: { startDate: '2026-10-17T00:00:00Z', finishDate: '2026-10-30T00:00:00Z' } }, { name: 'Sprint 8', attributes: { startDate: '2026-10-31T00:00:00Z', finishDate: '2026-11-13T00:00:00Z' } }] }, { name: 'PI 2027.1', children: [{ name: 'Sprint 1', attributes: { startDate: '2027-01-01T00:00:00Z', finishDate: '2027-01-14T00:00:00Z' } }] }] })
  const date = new Date('2026-10-17T12:00:00Z')
  assert.equal(currentIterationPairs(iterations, date)[0].sprint.name, 'Sprint 7')
  assert.deepEqual(futureIterationPairs(iterations, date).map((pair) => `${pair.pi.name}/${pair.sprint.name}`), ['PI 2026.4/Sprint 8', 'PI 2027.1/Sprint 1'])
})

test('overlapping branches stay ambiguous unless configured team Sprint narrows them', () => {
  const attributes = { startDate: '2026-10-01T00:00:00Z', finishDate: '2026-10-31T00:00:00Z' }
  const values = ['A', 'B'].flatMap((branch) => [{ name: branch, path: `Project\\${branch}`, attributes }, { name: 'Sprint', path: `Project\\${branch}\\Sprint`, attributes }])
  const date = new Date('2026-10-16T12:00:00Z')
  assert.equal(currentIterationPairs(values, date).length, 2)
  values[3].teamConfigured = true
  assert.equal(currentIterationPairs(values, date)[0].pi.name, 'B')
  assert.equal(currentIterationPairs(values, date).length, 1)
})

test('new Feature is assigned to the configured creator email, review stories to the Sprint, the Time Writing story and task to the project root', async () => {
  const server = fakeHierarchyServer()
  const result = await createAzureReleaseHierarchy(config, pat, { ...feature, iterationPath: 'Quality Project\\PI A', storyIterationPath: 'Quality Project\\PI A\\Sprint 1', assignedTo: 'creator@example.test' }, 'PU', undefined, 'October 2026', server.transport)
  assert.equal(result.feature.iterationPath, 'Quality Project\\PI A')
  assert.equal(server.records.get(result.feature.id).fields['System.AssignedTo'].id, 'creator@example.test')
  const timeWritingStory = result.items.find((item) => item.workItemType === 'User Story' && item.title.endsWith('- Time Writing'))
  assert.equal(timeWritingStory.iterationPath, config.project, 'not the Sprint, PI or a year')
  assert.ok(result.items.filter((item) => item.workItemType === 'User Story' && item !== timeWritingStory).every((item) => item.iterationPath === 'Quality Project\\PI A\\Sprint 1'))
  assert.equal(result.items.find((item) => item.workItemType === 'Task').iterationPath, config.project)
  const writes = server.writes.length
  await completeReleaseHierarchy(config, pat, result.feature.id, 'PU', undefined, 'October 2026', server.transport, 'Quality Project\\PI A\\Sprint 1')
  assert.equal(server.writes.length, writes)
})

test('a missing configured creator email stops Feature creation before writes', async () => {
  const server = fakeHierarchyServer()
  await assert.rejects(createAzureFeature(config, pat, { ...feature, assignedTo: '' }, server.transport), /creator email/)
  await assert.rejects(createAzureFeature(config, pat, { ...feature, assignToCreator: true }, server.transport), /creator email/)
  assert.equal(server.writes.length, 0)
})

test('Removed records never appear, even as parent context or under All', () => {
  const items = [treeItem(1, 'Epic', ' removed '), treeItem(2, 'Feature', 'New', 1), treeItem(3, 'User Story', 'Removed', 2), treeItem(4, 'Task', 'Active', 3)]
  const rows = visibleBacklogRows(buildWorkItemTree(items, ['All'], ''), new Set(), true, false)
  assert.deepEqual(rows.map((row) => row.node.item.id), [2, 4])
  assert.ok(rows.every((row) => row.node.parentMissing))
  assert.deepEqual(visibleBacklogRows(buildWorkItemTree(items, ['Removed'], ''), new Set(), true, false), [])
})

test('backlog column preferences preserve order, reject unknowns, and always keep Title', () => {
  assert.deepEqual(normalizeBacklogColumns(null), defaultBacklogColumns)
  assert.deepEqual(normalizeBacklogColumns(['state', 'title', 'id', 'id', 'invalid']), ['state', 'title', 'id'])
  assert.deepEqual(normalizeBacklogColumns(['assignedTo']), ['title', 'assignedTo'])
  assert.deepEqual(normalizeBacklogColumns([]), ['title'])
})

test('backlog rows expand real hierarchy and level selection promotes Features without duplicates', () => {
  const tree = buildWorkItemTree([treeItem(1, 'Epic', 'Active'), treeItem(2, 'Feature', 'Active', 1), treeItem(3, 'User Story', 'Active', 2), treeItem(4, 'Task', 'Active', 3)], ['All'], '')
  assert.deepEqual(visibleBacklogRows(tree, new Set(), false, false).map((row) => row.node.item.id), [1])
  const rows = visibleBacklogRows(tree, new Set([tree[0].item.key]), false, false)
  assert.deepEqual(rows.map((row) => [row.node.item.id, row.depth, row.order]), [[1, 0, 1], [2, 1, 0]])
  assert.deepEqual(visibleBacklogRows(tree, new Set(), false, false, 'Feature').map((row) => [row.node.item.id, row.depth]), [[2, 0]])
  assert.deepEqual(visibleBacklogRows(tree, new Set(), true, false).map((row) => row.depth), [0, 1, 2, 3])
  assert.deepEqual(visibleBacklogRows(tree, new Set(), false, true).map((row) => row.depth), [0, 1, 2, 3])
})

test('backlog source maps real descriptions and numeric story points without inventing missing values', () => {
  const mapped = mapAzureWorkItem({ id: 1, fields: { 'System.Description': '<p>Planning &amp; delivery</p>', 'Microsoft.VSTS.Scheduling.StoryPoints': 0 } }, config)
  assert.equal(mapped.description, '<p>Planning &amp; delivery</p>')
  assert.equal(mapped.storyPoints, 0)
  assert.equal(mapAzureWorkItem({ id: 2, fields: {} }, config).storyPoints, undefined)
  assert.equal(mapAzureWorkItem({ id: 2, fields: { 'Microsoft.VSTS.Scheduling.StoryPoints': '5' } }, config).storyPoints, undefined)
  assert.equal(plainAzureText('<script>alert(1)</script><p>A &amp; B&nbsp; &#x41; &#66;</p>'), 'A & B A B')
  assert.equal(plainAzureText('<img src=x onerror=alert(1)>safe'), 'safe')
})

import { createFeatureFromSetup, completeFeatureFromSetup } from '../src/azureDevOps.ts'
import { fillTitle, missingValues, titleValues, parseFeatureSetup, serializeFeatureSetup, setupFor } from '../src/featureSetup.ts'

test('Feature setup: placeholders, plain text, and a clean shared file', () => {
  const values = titleValues('CP | Care Pathways | v3.1', 'October 2026')
  assert.equal(fillTitle('SFV : Review of Deliverables ({service} {version})', values), 'SFV : Review of Deliverables (Care Pathways 3.1)')
  assert.equal(fillTitle('{MONTH} | {feature}', values), 'October 2026 | CP | Care Pathways | v3.1')
  assert.equal(fillTitle('Plain text {unknown}', values), 'Plain text {unknown}', 'other braces are kept as typed')
  assert.deepEqual(missingValues('{service} review', titleValues('No parts here', 'October 2026')), ['service'])
  const file = parseFeatureSetup(JSON.stringify({ schema: 1, kind: 'feature-setup', epics: [
    { epicId: 20, epicTitle: 'B', stories: [{ title: 'US 1' }, { title: '' }], task: { title: '', originalEstimate: 8, assignedTo: 'Not an email', areaPath: 'Q\\Area' } },
    { epicId: 'x', stories: [] },
    { epicId: 10, stories: [{ title: 'US 5', description: 'd' }], task: { assignedTo: 'Ana@X.com', originalEstimate: -1 } },
  ] }))
  assert.deepEqual(file.epics.map((entry) => entry.epicId), [10, 20])
  assert.deepEqual(setupFor(file, 20).stories, [{ title: 'US 1', description: '' }], 'blank titles dropped')
  assert.deepEqual(setupFor(file, 20).task, { title: '{month} | {feature}', description: '', originalEstimate: 8, assignedTo: '', areaPath: 'Q\\Area', iterationPath: '' })
  assert.equal(setupFor(file, 10).task.assignedTo, 'ana@x.com'); assert.equal(setupFor(file, 10).task.originalEstimate, undefined)
  assert.deepEqual(parseFeatureSetup(serializeFeatureSetup(file)), file)
  assert.throws(() => parseFeatureSetup('{"schema":1}'), /not a Feature setup file/)
  assert.deepEqual(JSON.parse(serializeFeatureSetup({ schema: 1, kind: 'feature-setup', epics: [{ epicId: 5, epicTitle: ' E ', stories: [{ title: ' ', description: '' }, { title: ' US ', description: '' }], task: { title: '', description: '', assignedTo: '', areaPath: '', iterationPath: '' } }] })).epics[0].stories, [{ title: 'US', description: '' }], 'saved without blank stories')
})

test('a Feature from its Epic setup: chosen stories, Time Writing story, Task defaults; completing adds nothing twice', async () => {
  const server = fakeHierarchyServer()
  const setup = { stories: [{ title: 'US 1 ({service})', description: 'First' }, { title: 'US 3', description: '' }], task: { title: '{month} | {feature}', description: 'Book here', originalEstimate: 6, assignedTo: 'lead@example.test', areaPath: 'Quality Project\\Time', iterationPath: 'Quality Project\\Current PI' } }
  const result = await createFeatureFromSetup(config, pat, { ...feature, iterationPath: 'Current PI' }, setup, 'October 2026', server.transport)
  const stories = result.items.filter((item) => item.workItemType === 'User Story')
  assert.deepEqual(stories.map((item) => item.title), ['US 1 (Service)', 'US 3', 'Review of Deliverables - Example | Service | v1.0', 'Example | Service | v1.0 - Time Writing'], 'the built-in Review of Deliverables story after the optional ones')
  const task = result.items.find((item) => item.workItemType === 'Task')
  assert.deepEqual([task.title, task.originalEstimate, task.areaPath, task.iterationPath, task.assignedToEmail], ['October 2026 | Example | Service | v1.0', 6, 'Quality Project\\Time', 'Quality Project\\Current PI', 'lead@example.test'])
  const created = server.writes.filter((item) => item.fields['System.WorkItemType'] === 'User Story')
  assert.ok(created.every((item) => item.fields['System.AssignedTo'].uniqueName === feature.assignedTo), 'stories go to the Feature assignee')
  const before = server.writes.length
  await completeFeatureFromSetup(config, pat, result.feature.id, setup, 'October 2026', server.transport)
  assert.equal(server.writes.length, before, 'nothing is created twice')
  await assert.rejects(completeFeatureFromSetup(config, pat, result.feature.id, { ...setup, stories: [{ title: '{program} only', description: '' }] }, 'October 2026', async (request) => request.operation === 'items' ? { value: [{ id: result.feature.id, fields: { 'System.Title': 'No parts', 'System.WorkItemType': 'Feature', 'System.TeamProject': config.project, 'System.AssignedTo': { uniqueName: 'a@b.co' } } }] } : server.transport(request)), /does not provide/)
})

test('a Feature from a setup with title fields: the typed values fill {Field} placeholders, also with a blank field', async () => {
  const server = fakeHierarchyServer()
  const titleFields = [{ label: 'Platform', source: '' }, { label: 'Release Name', source: '' }, { label: 'Number', source: '' }]
  const setup = { stories: [{ title: '{Platform} review ({number})', description: '' }], titleFields, fieldValues: ['CP 2', '', '4.1'], task: { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' } }
  const result = await createFeatureFromSetup(config, pat, { ...feature, title: 'CP 2 | 4.1', iterationPath: 'Current PI' }, setup, 'October 2026', server.transport)
  assert.ok(result.items.some((item) => item.title === 'CP 2 review (4.1)'), 'typed values used, though the title has fewer parts')
  const without = { ...setup, fieldValues: undefined }
  await completeFeatureFromSetup(config, pat, result.feature.id, without, 'October 2026', server.transport).then(() => assert.fail('expected a refusal'), (failure) => assert.match(failure.message, /Platform \| Release Name \| Number/))
})

test('Feature setup: the Time Writing User Story is configurable per Epic (title, Description, Assigned to, Area and Iteration Path)', async () => {
  const old = parseFeatureSetup(JSON.stringify({ schema: 1, kind: 'feature-setup', epics: [{ epicId: 1, stories: [] }] }))
  assert.deepEqual(setupFor(old, 1).timeWritingStory, { title: '{feature} - Time Writing', description: '', assignedTo: '', areaPath: '', iterationPath: '' }, 'files without it keep the built-in story')
  const server = fakeHierarchyServer()
  const timeWritingStory = { title: 'Time Writing | {service}', description: 'Hours', assignedTo: 'lead@example.test', areaPath: 'Quality Project\\Time', iterationPath: 'Quality Project\\Current PI\\Sprint 9' }
  const result = await createFeatureFromSetup(config, pat, { ...feature, iterationPath: 'Current PI' }, { stories: [], timeWritingStory, task: { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' } }, 'October 2026', server.transport)
  const story = result.items.find((item) => item.title === 'Time Writing | Service')
  assert.deepEqual([story.title, story.areaPath, story.iterationPath, story.assignedToEmail], ['Time Writing | Service', 'Quality Project\\Time', 'Quality Project\\Current PI\\Sprint 9', 'lead@example.test'])
  const task = result.items.find((item) => item.workItemType === 'Task')
  assert.equal(task.parentId, story.id, 'the month Task goes under the configured story')
  assert.equal(task.assignedToEmail, feature.assignedTo, 'the Task still defaults to the Feature assignee')
})

test('the Time Writing story without set paths: the project root iteration (no PI, Sprint or year) and the Feature area; an existing one is reused wherever it is', async () => {
  const server = fakeHierarchyServer()
  const plain = { title: '{feature} - Time Writing', description: '', assignedTo: '', areaPath: '', iterationPath: '' }
  const task = { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' }
  const result = await createFeatureFromSetup(config, pat, { ...feature, iterationPath: 'Current PI', storyIterationPath: 'Quality Project\\Current PI\\Sprint 4' }, { stories: [{ title: 'Review', description: '' }], timeWritingStory: plain, task }, 'October 2026', server.transport)
  const story = result.items.find((item) => item.title.endsWith('- Time Writing')), review = result.items.find((item) => item.title === 'Review')
  assert.equal(story.iterationPath, config.project)
  assert.equal(story.areaPath, result.feature.areaPath)
  assert.equal(review.iterationPath, 'Quality Project\\Current PI\\Sprint 4', 'optional stories still go to the chosen Sprint')
  assert.equal(result.items.find((item) => item.title === 'Review of Deliverables - Example | Service | v1.0').iterationPath, 'Quality Project\\Current PI\\Sprint 4', 'the built-in Review of Deliverables story goes to the chosen Sprint too')
  // Unticked, the built-in story is not created, on either path.
  const without = await createFeatureFromSetup(config, pat, { ...feature, title: 'Other | Service | v2.0', iterationPath: 'Current PI' }, { stories: [], reviewStory: false, timeWritingStory: plain, task }, 'October 2026', server.transport)
  assert.deepEqual(without.items.filter((item) => item.workItemType === 'User Story').map((item) => item.title), ['Other | Service | v2.0 - Time Writing'], 'setup path: only the Time Writing story')
  const builtin = await createAzureReleaseHierarchy(config, pat, { ...feature, title: 'Third | Service | v3.0', iterationPath: 'Current PI' }, 'PU', [], 'October 2026', server.transport, false)
  assert.deepEqual(builtin.items.filter((item) => item.workItemType === 'User Story').map((item) => item.title), ['Third | Service | v3.0 - Time Writing'], 'built-in path: only the Time Writing story')
  // A Time Writing story created earlier in a Sprint is used as it is, not refused or duplicated.
  server.records.get(story.id).fields['System.IterationPath'] = 'Quality Project\\Old PI\\Sprint 1'
  const writes = server.writes.length
  const again = await completeFeatureFromSetup(config, pat, result.feature.id, { stories: [], timeWritingStory: plain, task }, 'October 2026', server.transport)
  assert.equal(again.items.find((item) => item.title.endsWith('- Time Writing')).id, story.id)
  assert.equal(server.writes.length, writes, 'nothing new was written')
})

import { assertWritableBase } from '../src/azureDevOps.ts'
test('writes go to dev.azure.com only: on-premises servers are read-only in the web app and in the desktop proxy', async () => {
  const onPrem = { organization: 'DHPCollection', project: 'DHP', team: 'Team', baseUrl: 'https://tfs.example.invalid/tfs/DHPCollection' }
  for (const operation of ['create-feature', 'create-child', 'update-time-writing-effort', 'update-work-item']) {
    assert.throws(() => assertWritableBase(onPrem, operation), /read-only/)
    assert.throws(() => proxyWritableBase({ ...onPrem, operation }), /read-only/)
    assert.doesNotThrow(() => assertWritableBase(config, operation))
  }
  for (const operation of ['query', 'items', 'fields']) { assert.doesNotThrow(() => assertWritableBase(onPrem, operation)); assert.doesNotThrow(() => proxyWritableBase({ ...onPrem, operation })) }
  // Reads still reach the on-prem server; a write never does: no fetch is made.
  const calls = []
  const fetchStub = async (url) => { calls.push(url); return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ value: [] }) } }
  await requestAzureDevOps({ ...onPrem, pat, operation: 'fields' }, fetchStub)
  assert.equal(calls.length, 1)
  await assert.rejects(requestAzureDevOps({ ...onPrem, pat, operation: 'update-work-item', workItemId: 5, state: 'Closed' }, fetchStub), /read-only/)
  await assert.rejects(requestAzureDevOps({ ...onPrem, pat, operation: 'create-feature', validateOnly: true, feature: { ...feature, areaPath: 'DHP' } }, fetchStub), /read-only/)
  assert.equal(calls.length, 1, 'nothing was sent for the writes')
})

test('the Feature DoD is mandatory: composed into the Description, and creation is refused without one', async () => {
  assert.equal(withFeatureDoD('IQOQ finished', 'Scope: X'), 'Feature DoD: IQOQ finished\n\nScope: X')
  assert.equal(withFeatureDoD('feature dod:  DT finished '), 'Feature DoD: DT finished', 'a typed prefix is not doubled')
  assert.throws(() => withFeatureDoD('  '), /Feature DoD/)
  assert.throws(() => withFeatureDoD('Feature DoD:'), /Feature DoD/)
  const requests = [], transport = async (request) => { requests.push(request); throw new Error('nothing may be sent') }
  await assert.rejects(createAzureFeature(config, pat, { ...feature, description: 'Release scope only' }, transport), /Feature DoD/)
  await assert.rejects(createAzureFeature(config, pat, { ...feature, description: '<p>Feature DoD: </p>' }, transport), /Feature DoD/)
  assert.equal(requests.length, 0, 'refused before anything is sent')
})

test('Release Classification: optional, always written below the Feature DoD in the Description', () => {
  assert.deepEqual([...releaseClassifications], ['Major', 'Minor', 'MLD', 'Platform Update', 'Service Pack'])
  assert.equal(withFeatureDoD('DT finished', 'Scope: X', 'Major'), 'Feature DoD: DT finished\n\nRelease Classification : Major\n\nScope: X')
  assert.equal(withFeatureDoD('DT finished', '', 'Service Pack'), 'Feature DoD: DT finished\n\nRelease Classification : Service Pack')
  assert.equal(withFeatureDoD('DT finished', 'Scope: X', ''), 'Feature DoD: DT finished\n\nRelease Classification :\n\nScope: X', 'left blank, the line is still captured')
  assert.equal(withFeatureDoD('DT finished', 'Scope: X'), 'Feature DoD: DT finished\n\nScope: X', 'callers without the field are unchanged')
  assert.throws(() => withFeatureDoD(' ', '', 'Major'), /Feature DoD/)
  assert.equal(withFeatureDoD('DT finished', 'Scope: X', 'Major', ['Platform : CP 2', 'Number :']), 'Feature DoD: DT finished\n\nRelease Classification : Major\n\nPlatform : CP 2\n\nNumber :\n\nScope: X', 'the Epic setup title fields follow it')
})

test('after the planning lock, a new Time Writing Task (and only the Task) is created with the ad-hoc tag (TC-MON-08)', async () => {
  const patch = featurePatch(config, { parentId: 1, title: 'Task', description: '', acceptanceCriteria: '', areaPath: 'A', adhoc: true })
  assert.deepEqual(patch.at(-1), { op: 'add', path: '/fields/System.Tags', value: 'ad-hoc' })
  assert.ok(!featurePatch(config, { parentId: 1, title: 'Task', description: '', acceptanceCriteria: '', areaPath: 'A' }).some((entry) => entry.path === '/fields/System.Tags'), 'no tag before the lock')
  const server = fakeHierarchyServer()
  const result = await createAzureReleaseHierarchy(config, pat, { ...feature, title: 'Late | Service | v1.0', iterationPath: 'Current PI' }, 'PU', [], 'October 2026', server.transport, true, true)
  const tagged = result.items.filter((item) => item.tags.includes('ad-hoc')).map((item) => item.workItemType)
  assert.deepEqual(tagged, ['Task'], 'the Feature and the User Stories are not tagged')
  const setup = { stories: [], timeWritingStory: { title: '{feature} - Time Writing', description: '', assignedTo: '', areaPath: '', iterationPath: '' }, task: { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' } }
  const fromSetup = await createFeatureFromSetup(config, pat, { ...feature, title: 'Setup | Service | v2.0', iterationPath: 'Current PI' }, setup, 'October 2026', server.transport, true)
  assert.deepEqual(fromSetup.items.filter((item) => item.tags.includes('ad-hoc')).map((item) => item.workItemType), ['Task'])
  // Complete children again: the existing Task is reused as it is (nothing new is created or tagged).
  const before = server.writes.length
  await completeFeatureFromSetup(config, pat, fromSetup.feature.id, setup, 'October 2026', server.transport, undefined, undefined, true)
  assert.equal(server.writes.length, before)
  const open = await createAzureReleaseHierarchy(config, pat, { ...feature, title: 'Open | Service | v1.0', iterationPath: 'Current PI' }, 'PU', [], 'October 2026', server.transport)
  assert.ok(open.items.every((item) => !item.tags.includes('ad-hoc')), 'planning open: no tag')
})
