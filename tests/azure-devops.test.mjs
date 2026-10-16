import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { parseAzureProjectUrl, fetchAzureWorkItems, mergeAzureWorkItems, buildWorkItemQuery, createAzureFeature, featurePatch, featureDescription, releaseHierarchyTitles, currentIndiaMonth, createAzureReleaseHierarchy, completeReleaseHierarchy, HierarchyCreationError, readAzureIterations, projectIterationPaths, currentIterationPairs, readAzureCreator, mapAzureWorkItem, savedBacklogItems, sameAzureScope, updateAzureTimeWritingEffort } from '../src/azureDevOps.ts'
import { buildWorkItemTree } from '../src/azureHierarchy.ts'
import { loadAzurePat, saveAzurePat, forgetAzurePat, listAzurePatProfiles, loadAzurePatProfile, saveAzurePatProfile, forgetAzurePatProfile, listAzureConnectionProfiles, loadAzureConnectionProfile, saveAzureConnectionProfile, forgetAzureConnectionProfile } from '../src/azureCredentials.ts'
import { normalizeBacklogColumns, defaultBacklogColumns, plainAzureText, visibleBacklogRows } from '../src/backlogView.ts'

const require = createRequire(import.meta.url)
const { azureReadRequest, azureFeatureRequest } = require('../electron/azure-devops.cjs')
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
  assert.deepEqual(listAzureConnectionProfiles(storage), [{ id: first.id, url: first.url, reason: first.reason }, { id: second.id, url: second.url, reason: second.reason }])
  assert.equal(JSON.stringify(listAzureConnectionProfiles(storage)).includes('token'), false)
  assert.deepEqual(loadAzureConnectionProfile(second.id, storage), second)
  forgetAzureConnectionProfile(first.id, storage)
  assert.deepEqual(listAzureConnectionProfiles(storage), [{ id: second.id, url: second.url, reason: second.reason }])
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

const feature = { parentId: 10, title: 'Example | Service | v1.0', description: 'Example <text>\nNext line', acceptanceCriteria: 'Meets example criteria', assignedTo: 'example@example.invalid', targetDate: '2026-10-30' }

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
    if (request.operation === 'identity') return { authenticatedUser: { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', providerDisplayName: 'Synthetic Creator' } }
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
      const item = { id: nextId++, fields: { 'System.Title': source.title, 'System.WorkItemType': request.operation === 'create-feature' ? 'Feature' : request.workItemType, 'System.State': 'New', 'System.Parent': source.parentId, 'System.AreaPath': source.areaPath, 'System.IterationPath': source.iterationPath || config.project, 'System.TeamProject': config.project, ...(source.assignedTo ? { 'System.AssignedTo': { id: source.assignedTo, displayName: 'Synthetic Creator' } } : {}) } }
      records.set(item.id, item); writes.push(item)
      return item
    }
    throw new Error(`Unexpected test operation: ${request.operation}`)
  }
  return { transport, records, writes, failOn: (title) => { failureTitle = title } }
}

test('release naming and India month rollover implement the final task-title correction', () => {
  const pu = releaseHierarchyTitles('Example | Service | v1.0', 'PU', 'October 2026')
  assert.deepEqual(pu.reviews.map((item) => item.milestone), ['SFV', 'DT', 'IQOQ'])
  assert.equal(pu.reviews[0].title, 'SFV : Review of Deliverables (Service 1.0)')
  assert.equal(pu.timeWriting, 'Example | Service | v1.0 - Time Writing')
  assert.equal(pu.task, 'October 2026 | Example | Service | v1.0')
  assert.deepEqual(releaseHierarchyTitles('Example | Service | v1.0', 'Release', 'October 2026').reviews.map((item) => item.milestone), ['PRD', 'SFV', 'DT', 'IQOQ'])
  assert.equal(currentIndiaMonth(new Date('2026-10-31T18:29:00Z')), 'October 2026')
  assert.equal(currentIndiaMonth(new Date('2026-10-31T18:30:00Z')), 'November 2026')
})

for (const [kind, milestones, expectedStories] of [['PU', undefined, 4], ['Release', undefined, 5], ['PU', [], 1], ['Release', [], 1], ['Release', ['PRD', 'IQOQ'], 3]]) {
  test(`${kind} with ${milestones === undefined ? 'all' : milestones.length} milestones always creates Time Writing and the month task`, async () => {
    const server = fakeHierarchyServer()
    const result = await createAzureReleaseHierarchy(config, pat, { ...feature, iterationPath: 'Current PI' }, kind, milestones, 'October 2026', server.transport)
    const stories = result.items.filter((item) => item.workItemType === 'User Story')
    assert.equal(stories.length, expectedStories)
    const timeWriting = stories.find((item) => item.title.endsWith(' - Time Writing'))
    assert.ok(timeWriting)
    assert.equal(timeWriting.parentId, result.feature.id)
    const tasks = result.items.filter((item) => item.workItemType === 'Task')
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].parentId, timeWriting.id)
    assert.equal(tasks[0].title, 'October 2026 | Example | Service | v1.0')
    assert.equal(tasks[0].iterationPath, config.project)
    for (const story of stories) {
      assert.equal(story.iterationPath, 'Quality Project\\Current PI')
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
  assert.equal(result.items.length, 6)
  assert.equal(server.writes.filter((item) => item.fields['System.WorkItemType'] === 'Feature').length, 1)
  assert.equal(server.writes.length, 6)
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

test('overlapping branches stay ambiguous unless configured team Sprint narrows them', () => {
  const attributes = { startDate: '2026-10-01T00:00:00Z', finishDate: '2026-10-31T00:00:00Z' }
  const values = ['A', 'B'].flatMap((branch) => [{ name: branch, path: `Project\\${branch}`, attributes }, { name: 'Sprint', path: `Project\\${branch}\\Sprint`, attributes }])
  const date = new Date('2026-10-16T12:00:00Z')
  assert.equal(currentIterationPairs(values, date).length, 2)
  values[3].teamConfigured = true
  assert.equal(currentIterationPairs(values, date)[0].pi.name, 'B')
  assert.equal(currentIterationPairs(values, date).length, 1)
})

test('new Feature is assigned to PAT owner, all stories to Sprint, and task remains project-root', async () => {
  const server = fakeHierarchyServer()
  const result = await createAzureReleaseHierarchy(config, pat, { ...feature, iterationPath: 'Quality Project\\PI A', storyIterationPath: 'Quality Project\\PI A\\Sprint 1', assignToCreator: true, assignedTo: 'not-the-creator@example.test' }, 'PU', undefined, 'October 2026', server.transport)
  assert.equal(result.feature.iterationPath, 'Quality Project\\PI A')
  assert.equal(server.records.get(result.feature.id).fields['System.AssignedTo'].id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  assert.ok(result.items.filter((item) => item.workItemType === 'User Story').every((item) => item.iterationPath === 'Quality Project\\PI A\\Sprint 1'))
  assert.equal(result.items.find((item) => item.workItemType === 'Task').iterationPath, config.project)
  const writes = server.writes.length
  await completeReleaseHierarchy(config, pat, result.feature.id, 'PU', undefined, 'October 2026', server.transport, 'Quality Project\\PI A\\Sprint 1')
  assert.equal(server.writes.length, writes)
})

test('identity failures stop before writes; desktop identity URL stays fixed to organization', async () => {
  await assert.rejects(readAzureCreator(config, pat, async () => ({ authenticatedUser: {} })), /identify the PAT owner/)
  const server = fakeHierarchyServer()
  await assert.rejects(createAzureFeature(config, pat, { ...feature, assignToCreator: true }, async (request) => request.operation === 'identity' ? {} : server.transport(request)), /PAT owner/)
  assert.equal(server.writes.length, 0)
  const request = azureReadRequest({ ...config, pat, operation: 'identity' })
  assert.equal(request.url, 'https://dev.azure.com/example-org/_apis/connectionData?api-version=7.1-preview.1')
  assert.equal(request.options.method, 'GET')
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
