import test from 'node:test'
import assert from 'node:assert/strict'
import { isMine, isPending, myPendingWork, monthTaskCandidates, moveCandidates } from '../src/myWork.ts'
import { ensureMonthTask, updateAzureWorkItem, workItemUpdatePatch } from '../src/azureDevOps.ts'
import { createRequire } from 'node:module'

const base = { organization: 'org', project: 'Quality', state: 'Active', assignedTo: '', areaPath: 'Quality\\A', iterationPath: 'Quality\\PI 2026.4\\Sprint 1', tags: '', url: '', syncedAt: '' }
const item = (id, workItemType, title, extra = {}) => ({ ...base, key: `org/quality/${id}`, id, workItemType, title, ...extra })
const me = { email: 'ana@x.com', name: 'Ana Costa' }
const ana = { assignedTo: 'Ana Costa', assignedToEmail: 'ana@x.com' }, ben = { assignedTo: 'Ben Okafor', assignedToEmail: 'ben@x.com' }
const items = [
  item(1, 'Epic', 'CP'), item(2, 'Feature', 'CP | Care Pathways | v3.1', { parentId: 1, ...ana }),
  item(3, 'User Story', 'CP | Care Pathways | v3.1 - Time Writing', { parentId: 2, ...ana }),
  item(4, 'Task', 'October 2026 | CP | Care Pathways | v3.1', { parentId: 3, ...ben }),
  item(5, 'User Story', 'SFV review', { parentId: 2, ...ana, state: 'New' }),
  item(6, 'Feature', 'DP | Dose Planning | v4.2', { parentId: 1, ...ben }), item(7, 'Task', 'Test DP', { parentId: 6, ...ana }),
  item(8, 'Feature', 'DP | Dose Planning | v4.1', { parentId: 1, ...ana, state: 'Closed' }),
  item(9, 'Bug', 'Crash', { parentId: 6, ...ana, state: 'Resolved' }),
  item(37778, 'Epic', 'Absence'), item(10, 'Feature', 'Ana Costa - Absence', { parentId: 37778, ...ana }),
]

test('mine and pending: email first, display name as fallback; finished states excluded', () => {
  assert.equal(isMine({ assignedTo: 'Ana Costa', assignedToEmail: 'ana@x.com' }, { email: 'ANA@x.com' }), true)
  assert.equal(isMine({ assignedTo: 'Ana Costa', assignedToEmail: 'other@x.com' }, me), false, 'email wins over a same display name')
  assert.equal(isMine({ assignedTo: 'Ana Costa' }, me), true, 'sample/cached items without email match by name')
  assert.equal(isMine({ assignedTo: '' }, {}), false)
  assert.deepEqual(['New', 'Active', 'Resolved', 'Closed', 'Done', 'Removed'].map((state) => isPending({ state })), [true, true, false, false, false, false])
  assert.deepEqual(myPendingWork(items, me).map(({ item }) => item.id), [2, 10, 3, 5, 7], 'Features first, then stories, then tasks; closed/resolved and other people excluded')
  assert.deepEqual(myPendingWork(items, me, 37778).map(({ item }) => item.id), [2, 3, 5, 7], 'absence items are not pending work')
  assert.equal(myPendingWork(items, me).find(({ item }) => item.id === 7).feature.id, 6)
})

test('month-task candidates: my pending Features or Features holding my pending work; never the absence Epic', () => {
  const rows = monthTaskCandidates(items, me, 'October 2026', 37778)
  assert.deepEqual(rows.map((row) => [row.feature.id, row.status]), [[2, 'needs-task'], [6, 'needs-story']], "Ben's task on #2 does not count as mine; #6 is Ben's Feature but holds my Task")
  const done = monthTaskCandidates([...items, item(11, 'Task', 'October 2026 | CP | Care Pathways | v3.1', { parentId: 3, ...ana })], me, 'October 2026', 37778)
  assert.equal(done.find((row) => row.feature.id === 2).status, 'exists')
  assert.equal(monthTaskCandidates([...items, item(12, 'User Story', 'CP | Care Pathways | v3.1 - Time Writing', { parentId: 2 })], me, 'October 2026', 37778).find((row) => row.feature.id === 2).status, 'conflict')
})

test('move candidates: only my pending User Stories in a past Sprint; current, future and undated left alone', () => {
  const sprint = (n, startDate, finishDate) => ({ path: `Quality\\PI 2026.4\\Sprint ${n}`, attributes: { startDate, finishDate } })
  const iterations = [sprint(1, '2026-09-28', '2026-10-09'), sprint(2, '2026-10-12', '2026-10-23'), sprint(3, '2026-10-26', '2026-11-06')]
  const target = 'Quality\\PI 2026.4\\Sprint 2', today = new Date('2026-10-20T06:00:00Z')
  const extra = [
    item(13, 'User Story', 'In current sprint', { ...ana, iterationPath: target }),
    item(14, 'User Story', 'In future sprint', { ...ana, iterationPath: 'Quality\\PI 2026.4\\Sprint 3' }),
    item(15, 'User Story', 'Only in the PI', { ...ana, iterationPath: 'Quality\\PI 2026.4' }),
    item(16, 'User Story', 'Ben in past sprint', { ...ben }),
  ]
  assert.deepEqual(moveCandidates([...items, ...extra], me, target, iterations, 37778, today).map(({ item }) => item.id), [3, 5], 'Features and Tasks are never moved; only stories in Sprint 1 (past)')
  assert.deepEqual(moveCandidates(items, me, target, [], 37778, today), [], 'without iteration dates nothing is treated as past')
})

const raw = (id, fields) => ({ id, fields: { 'System.TeamProject': 'Quality', 'System.State': 'Active', 'System.AreaPath': 'Quality\\A', 'System.IterationPath': 'Quality\\PI 2026.4\\Sprint 1', ...fields } })
function fakeAzure(world) {
  const calls = []
  let next = 100
  const transport = async (request) => {
    calls.push(request)
    if (request.operation === 'items') return { value: request.ids.map((id) => world.get(id)).filter(Boolean) }
    if (request.operation === 'query') { const parent = Number(/\[System\.Parent\] = (\d+)/.exec(request.query)[1]); return { workItems: [...world.values()].filter((entry) => entry.fields['System.Parent'] === parent).map((entry) => ({ id: entry.id })) } }
    if (request.operation === 'create-child') {
      if (request.validateOnly) return {}
      const id = ++next, f = request.feature
      world.set(id, raw(id, { 'System.WorkItemType': request.workItemType, 'System.Title': f.title, 'System.Parent': f.parentId, 'System.AreaPath': f.areaPath, 'System.IterationPath': f.iterationPath, ...(f.assignedTo ? { 'System.AssignedTo': { displayName: 'Ana Costa', uniqueName: f.assignedTo } } : {}) }))
      return { id }
    }
    if (request.operation === 'update-work-item') { const entry = world.get(request.workItemId); if (request.state) entry.fields['System.State'] = request.state; if (request.iterationPath) entry.fields['System.IterationPath'] = request.iterationPath; return {} }
    throw new Error(`unexpected ${request.operation}`)
  }
  return { transport, calls }
}

test('ensureMonthTask creates story and task once, then reuses them; another person\'s task is not mine', async () => {
  const config = { organization: 'org', project: 'Quality', team: 'T' }
  const world = new Map([[2, raw(2, { 'System.WorkItemType': 'Feature', 'System.Title': 'CP | Care Pathways | v3.1' })]])
  const { transport, calls } = fakeAzure(world)
  const first = await ensureMonthTask(config, 'pat', 2, 'Ana@x.com', 'October 2026', transport)
  assert.deepEqual([first.status, first.storyCreated, first.story.title, first.task.title, first.task.assignedToEmail, first.task.iterationPath], ['created', true, 'CP | Care Pathways | v3.1 - Time Writing', 'October 2026 | CP | Care Pathways | v3.1', 'ana@x.com', 'Quality'])
  const second = await ensureMonthTask(config, 'pat', 2, 'ana@x.com', 'October 2026', transport)
  assert.deepEqual([second.status, second.storyCreated, second.task.id], ['exists', false, first.task.id], 'running again creates nothing')
  assert.equal(calls.filter((call) => call.operation === 'create-child' && !call.validateOnly).length, 2)
  const bens = await ensureMonthTask(config, 'pat', 2, 'ben@x.com', 'October 2026', transport)
  assert.equal(bens.status, 'created', 'same title for another person is a separate task')
  await assert.rejects(ensureMonthTask(config, 'pat', 2, 'not-an-email', 'October 2026', transport), /email/)
})

test('updateAzureWorkItem sends only state / iteration, verifies by reading back', async () => {
  const config = { organization: 'org', project: 'Quality', team: 'T' }
  const world = new Map([[7, raw(7, { 'System.WorkItemType': 'Task', 'System.Title': 'Test DP' })]])
  const { transport, calls } = fakeAzure(world)
  const closed = await updateAzureWorkItem(config, 'pat', 7, { state: 'Closed' }, transport)
  assert.equal(closed.state, 'Closed')
  const moved = await updateAzureWorkItem(config, 'pat', 7, { iterationPath: 'Quality\\PI 2026.4\\Sprint 2' }, transport)
  assert.equal(moved.iterationPath, 'Quality\\PI 2026.4\\Sprint 2')
  assert.deepEqual(calls.filter((call) => call.operation === 'update-work-item').map((call) => [call.state, call.iterationPath]), [['Closed', undefined], [undefined, 'Quality\\PI 2026.4\\Sprint 2']])
  await assert.rejects(updateAzureWorkItem(config, 'pat', 7, {}, transport), /Nothing/)
  await assert.rejects(updateAzureWorkItem(config, 'pat', 7, { state: 'Closed"; DROP' }, transport), /Invalid state/)
  const stubborn = { transport: async (request) => request.operation === 'items' ? { value: [raw(7, { 'System.WorkItemType': 'Task', 'System.Title': 'x', 'System.State': 'Active' })] } : {} }
  await assert.rejects(updateAzureWorkItem(config, 'pat', 7, { state: 'Closed' }, stubborn.transport), /reports Active/)
  assert.deepEqual(workItemUpdatePatch({ state: 'Resolved', iterationPath: 'Q\\S' }), [{ op: 'add', path: '/fields/System.State', value: 'Resolved' }, { op: 'add', path: '/fields/System.IterationPath', value: 'Q\\S' }])
})

test('Windows app proxy: work-item update is limited to state and iteration path', () => {
  const { azureWorkItemUpdateRequest } = createRequire(import.meta.url)('../electron/azure-devops.cjs')
  const request = azureWorkItemUpdateRequest({ organization: 'org', project: 'Quality', team: 'T', pat: 'p', operation: 'update-work-item', workItemId: 7, state: 'Closed', iterationPath: 'Quality\\PI 2026.4\\Sprint 2', fields: { 'System.Title': 'hijack' } })
  assert.equal(request.url, 'https://dev.azure.com/org/Quality/_apis/wit/workitems/7?api-version=7.1')
  assert.equal(request.options.method, 'PATCH')
  assert.deepEqual(JSON.parse(request.options.body).map((op) => op.path), ['/fields/System.State', '/fields/System.IterationPath'])
  assert.throws(() => azureWorkItemUpdateRequest({ organization: 'org', project: 'Quality', team: 'T', pat: 'p', operation: 'update-work-item', workItemId: 7 }), /Nothing/)
  assert.throws(() => azureWorkItemUpdateRequest({ organization: 'org', project: 'Quality', team: 'T', pat: 'p', operation: 'update-work-item', workItemId: 0, state: 'Closed' }), /Invalid work item/)
})
