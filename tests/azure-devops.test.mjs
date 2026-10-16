import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { parseAzureProjectUrl, fetchAzureWorkItems, mergeAzureWorkItems, buildWorkItemQuery, createAzureFeature, featurePatch, featureDescription, releaseHierarchyTitles, currentIndiaMonth, createAzureReleaseHierarchy, completeReleaseHierarchy, HierarchyCreationError } from '../src/azureDevOps.ts'
import { buildWorkItemTree } from '../src/azureHierarchy.ts'
import { loadAzurePat, saveAzurePat, forgetAzurePat } from '../src/azureCredentials.ts'

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
    if (request.operation === 'query') {
      page++
      return { workItems: page === 1 ? Array.from({ length: 201 }, (_, i) => ({ id: i + 1 })) : page === 2 ? [{ id: 202 }] : [], asOf: '2026-10-16T00:00:00Z' }
    }
    batches.push(request.ids.length)
    return { value: request.ids.map((id) => ({ id, fields: { 'System.Title': `Sample ${id}`, 'System.WorkItemType': id === 1 ? 'Epic' : 'Feature', 'System.State': 'Active', 'System.AssignedTo': { displayName: 'Example QE' }, 'System.Parent': id === 1 ? undefined : 1 } })) }
  })
  assert.deepEqual(batches, [200, 1, 1])
  assert.equal(result.items.length, 202)
  assert.equal(result.items[1].parentId, 1)
  assert.equal(result.items[0].closedDate, undefined)
  assert.equal(result.items[0].targetDate, undefined)
  assert.equal(JSON.stringify(result).includes(pat), false)
  const refreshed = { ...result.items[0], state: 'Closed' }
  const merged = mergeAzureWorkItems(result.items, [refreshed])
  assert.equal(merged.length, 202)
  assert.equal(merged[0].state, 'Closed')
})

test('incomplete batch aborts rather than publishing a misleading partial import', async () => {
  await assert.rejects(fetchAzureWorkItems(config, pat, async (request) => {
    if (request.operation === 'areas') return { field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality', includeChildren: true }] }
    if (request.operation === 'query') return { workItems: [{ id: 1 }, { id: 2 }] }
    return { value: [{ id: 1, fields: {} }] }
  }), /Some work items could not be read/)
})

test('all-project Epic option includes out-of-team Epics without duplicating team records', async () => {
  let teamPage = 0
  let epicPage = 0
  const result = await fetchAzureWorkItems({ ...config, includeProjectEpics: true }, pat, async (request) => {
    if (request.operation === 'areas') return { field: { referenceName: 'System.AreaPath' }, values: [{ value: 'Quality\\Team A', includeChildren: true }] }
    if (request.operation === 'query') {
      if (request.query.includes("[System.WorkItemType] = 'Epic'")) return { workItems: ++epicPage === 1 ? [{ id: 1 }, { id: 2 }] : [] }
      return { workItems: ++teamPage === 1 ? [{ id: 1 }] : [] }
    }
    return { value: request.ids.map((id) => ({ id, fields: { 'System.WorkItemType': 'Epic', 'System.Title': `Example Epic ${id}` } })) }
  })
  assert.equal(result.items.length, 2)
  assert.equal(new Set(result.items.map((item) => item.id)).size, 2)
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
    wrote = true
  }), /not found in team iterations/)
  assert.equal(wrote, false)
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
      const item = { id: nextId++, fields: { 'System.Title': source.title, 'System.WorkItemType': request.operation === 'create-feature' ? 'Feature' : request.workItemType, 'System.State': 'New', 'System.Parent': source.parentId, 'System.AreaPath': source.areaPath, 'System.IterationPath': source.iterationPath || config.project, 'System.TeamProject': config.project } }
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
