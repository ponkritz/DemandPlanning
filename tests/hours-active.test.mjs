import test from 'node:test'
import assert from 'node:assert/strict'
import { activateAfterHours } from '../src/closeChain.ts'

const base = { organization: 'org', project: 'Quality', areaPath: 'Quality', iterationPath: 'Quality', tags: '', url: '', syncedAt: '', assignedTo: 'Ana Costa', assignedToEmail: 'ana@x.com' }
const item = (id, workItemType, title, parentId, state, extra = {}) => ({ ...base, key: `org/quality/${id}`, id, workItemType, title, parentId, state, ...extra })
const recorder = () => { const writes = []; return { writes, write: async (_c, _p, id, update) => { writes.push(`${id}:${update.state}`); return { id, state: update.state } } } }

test('BKL-41: hours on a month Task make the Task and its Time Writing story Active, and say so (TC-BKL-30)', async () => {
  const story = item(13, 'User Story', 'DP | Core | 5.2 - Time Writing', 10, 'New')
  const task = item(14, 'Task', 'November 2026 | DP | Core | 5.2', 13, 'New', { originalEstimate: 8 })
  const { writes, write } = recorder()
  const result = await activateAfterHours({}, 'pat', [story, task], task, write)
  assert.deepEqual(writes, ['14:Active', '13:Active'])
  assert.deepEqual(result.notes, ['Task #14 set to Active (New before), because hours were entered.', 'Time Writing story #13 set to Active (New before), because hours were entered.'])
})

test('BKL-41: a Closed Task or story is reopened to Active and named; Active ones are left alone; Removed stays Removed (TC-BKL-30)', async () => {
  const story = item(13, 'User Story', 'DP | Core | 5.2 - Time Writing', 10, 'Closed')
  const task = item(14, 'Task', 'November 2026 | DP | Core | 5.2', 13, 'Active', { completedWork: 2 })
  const { writes, write } = recorder()
  const result = await activateAfterHours({}, 'pat', [story, task], task, write)
  assert.deepEqual(writes, ['13:Active'], 'only the Closed story is written')
  assert.match(result.notes[0], /^Time Writing story #13 was Closed and is reopened to Active, because hours were entered\.$/)
  const removed = item(15, 'Task', 'November 2026 | X', 13, 'Removed', { completedWork: 2 })
  const second = recorder()
  const kept = await activateAfterHours({}, 'pat', [{ ...story, state: 'Active' }, removed], removed, second.write)
  assert.deepEqual(second.writes, [])
  assert.deepEqual(kept.notes, ['Task #15 is Removed and stays Removed.'])
})

test('BKL-41: nothing changes without hours, for a Task that is not a month Task, or under a story that is not Time Writing (TC-BKL-30)', async () => {
  const story = item(13, 'User Story', 'DT review', 10, 'New')
  const { writes, write } = recorder()
  await activateAfterHours({}, 'pat', [story], item(14, 'Task', 'November 2026 | DP', 13, 'New', { originalEstimate: 0, completedWork: 0 }), write)
  await activateAfterHours({}, 'pat', [story], item(16, 'Task', 'Write report', 13, 'New', { originalEstimate: 4 }), write)
  assert.deepEqual(writes, [], 'no hours, or not a month Task: nothing written')
  const result = await activateAfterHours({}, 'pat', [story], item(17, 'Task', 'November 2026 | DP', 13, 'Closed', { completedWork: 1 }), write)
  assert.deepEqual(writes, ['17:Active'], 'the Task is reopened; the parent story is not a Time Writing story, so it is left')
  assert.equal(result.notes.length, 1)
})

test('BKL-41: a failed write is reported, not thrown (TC-BKL-30)', async () => {
  const task = item(14, 'Task', 'November 2026 | DP', 13, 'Closed', { completedWork: 1 })
  const result = await activateAfterHours({}, 'pat', [], task, async () => { throw new Error('State transition not allowed') })
  assert.deepEqual(result.failed, ['Task #14 not set to Active: State transition not allowed'])
})
