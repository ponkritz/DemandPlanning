import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { parseAzureProjectUrl, fetchAzureWorkItems, mergeAzureWorkItems, buildWorkItemQuery } from '../src/azureDevOps.ts'

const require = createRequire(import.meta.url)
const { azureReadRequest } = require('../electron/azure-devops.cjs')
const config = { organization: 'example-org', project: 'Quality Project', team: 'Team A' }
const pat = 'synthetic-test-token'

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
