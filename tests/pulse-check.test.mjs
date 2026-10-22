import test from 'node:test'
import assert from 'node:assert/strict'
import { previousMonth, releaseComparison, workFlow } from '../src/pulseCheck.ts'

const base = { organization: 'org', project: 'Quality', state: 'Active', assignedTo: 'Ana Costa', areaPath: 'Quality', iterationPath: 'Quality', tags: '', url: '', syncedAt: '' }
const item = (id, workItemType, extra = {}) => ({ ...base, key: `org/quality/${id}`, id, workItemType, title: `Item ${id}`, ...extra })

test('previous month: across the year boundary', () => {
  assert.equal(previousMonth('2026-10'), '2026-09')
  assert.equal(previousMonth('2026-01'), '2025-12')
})

test('releases compared: streams of either month, zero when missing', () => {
  const stream = (name, releases, documents) => ({ id: name, name, fetchedAt: '', releases: Array.from({ length: releases }, (_, i) => ({ name, release: `${i}`, documents: 1 })), documents, titles: [] })
  assert.deepEqual(releaseComparison([stream('DP', 2, 5)], [stream('CP', 1, 3), stream('DP', 1, 1)]), [
    { name: 'CP', releases: 0, documents: 0, previousReleases: 1, previousDocuments: 3 },
    { name: 'DP', releases: 2, documents: 5, previousReleases: 1, previousDocuments: 1 },
  ])
})

test('work flow: Features and User Stories opened and closed in the month, per Epic; absence, Removed and other months left out', () => {
  const items = [
    item(1, 'Epic', { title: 'CP' }), item(2, 'Epic', { title: 'Absence' }),
    item(10, 'Feature', { parentId: 1, createdDate: '2026-09-03T10:00:00Z' }),
    item(11, 'User Story', { parentId: 10, createdDate: '2026-08-01T10:00:00Z', state: 'Closed', closedDate: '2026-09-20T10:00:00Z' }),
    item(12, 'User Story', { parentId: 10, createdDate: '2026-09-05T10:00:00Z', state: 'Closed', closedDate: '2026-09-25T10:00:00Z' }),
    item(13, 'User Story', { parentId: 10, state: 'Done', changedDate: '2026-09-10T10:00:00Z', createdDate: '2026-07-01T00:00:00Z' }),
    item(14, 'User Story', { parentId: 10, state: 'Removed', createdDate: '2026-09-05T10:00:00Z' }),
    item(20, 'Feature', { parentId: 2, createdDate: '2026-09-01T10:00:00Z' }),
    item(30, 'Feature', { createdDate: '2026-09-02T10:00:00Z', assignedTo: 'Ben Okafor' }),
    item(31, 'Task', { parentId: 10, createdDate: '2026-09-02T10:00:00Z' }),
    item(40, 'Feature', { parentId: 1, createdDate: '2026-10-01T10:00:00Z' }),
  ]
  const flow = workFlow(items, '2026-09', 2, 'UTC')
  assert.deepEqual(flow.streams.map((stream) => [stream.title, stream.counts]), [
    ['CP', { 'Feature': { created: 1, closed: 0 }, 'User Story': { created: 1, closed: 3 } }],
    ['No Epic', { 'Feature': { created: 1, closed: 0 }, 'User Story': { created: 0, closed: 0 } }],
  ])
  assert.deepEqual(flow.totals, { 'Feature': { created: 2, closed: 0 }, 'User Story': { created: 1, closed: 3 } })
  assert.deepEqual(flow.items.map(({ item, change }) => `${change} ${item.id}`), ['closed 11', 'closed 12', 'closed 13', 'created 10', 'created 12', 'created 30'])
  assert.deepEqual(workFlow(items, '2026-09', 2, 'UTC', (entry) => entry.assignedTo === 'Ben Okafor').totals.Feature, { created: 1, closed: 0 }, 'include narrows to a person')
})
