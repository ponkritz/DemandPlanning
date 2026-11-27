import test from 'node:test'
import assert from 'node:assert/strict'
import { activationPlan, closeReason, featuresWorkingOn, isOwnTask, monthTaskStatesBlocked, ownMonthTaskPlan, planReads } from '../src/monthTaskStates.ts'
import { runStatePlan, startMonthTaskStatesJob } from '../src/closeChain.ts'

// ACT-23…ACT-27 (TC-ACT-18…TC-ACT-22): the automatic State rules of a month Time Writing Task.
const me = 'ana@example.com'
const base = { organization: 'org', project: 'Quality', areaPath: 'Quality', iterationPath: 'Quality', tags: '', url: '', syncedAt: '', assignedTo: 'Ana Costa', assignedToEmail: me }
const item = (id, workItemType, title, parentId, state, extra = {}) => ({ ...base, key: `org/quality/${id}`, id, workItemType, title, parentId, state, ...extra })
const world = (overrides = {}) => {
  const feature = item(10, 'Feature', 'DP | Core', 1, 'New', overrides.feature)
  const story = item(13, 'User Story', 'DP | Core - Time Writing', 10, 'New', overrides.story)
  const task = item(14, 'Task', 'November 2026 | DP | Core', 13, 'New', { originalEstimate: 8, ...overrides.task })
  return { feature, story, task, items: [item(1, 'Epic', 'Stream', undefined, 'Active'), feature, story, task] }
}
const steps = (plan) => plan.steps.map((step) => `${step.item.id}:${step.states.join('>')}`)
// Default locks: the actuals of a month lock at the end of the 4th of the next month (UTC).
const locks = {}
const at = (iso) => new Date(iso)

test('ACT-24, ACT-25: hours on a New Month Task make the Task, its Time Writing story and its Feature Active, in that order (TC-ACT-19)', () => {
  const { items, task } = world()
  const plan = activationPlan(items, task)
  assert.deepEqual(steps(plan), ['14:Active', '13:Active', '10:Active'])
  assert.deepEqual(plan.steps.map((step) => step.needs), [[], [14], [13]], 'a story waits for its Task, the Feature for its story')
  assert.match(plan.steps[2].why, /^Feature #10 set to Active \(New before\), because its Time Writing story is Active\.$/)
  // A story already Active still moves its New Feature; an Active Feature is left alone.
  const active = world({ task: { state: 'Active' }, story: { state: 'Active' } })
  assert.deepEqual(steps(activationPlan(active.items, active.task)), ['10:Active'])
  const all = world({ task: { state: 'Active' }, story: { state: 'Active' }, feature: { state: 'Active' } })
  assert.deepEqual(steps(activationPlan(all.items, all.task)), [])
})

test('ACT-24: only New moves forward — Closed or Resolved items are never reopened, Removed stays Removed, no hours or no Month Task changes nothing (TC-ACT-19)', () => {
  const closed = world({ task: { state: 'Closed', completedWork: 3 } })
  const plan = activationPlan(closed.items, closed.task)
  assert.deepEqual(steps(plan), [], 'a Closed Task is not reopened, and moves nothing above it')
  assert.deepEqual(plan.skipped.map((entry) => [entry.reason, entry.text]), [['finished', 'Task #14 is Closed and is not reopened.']])
  const resolved = world({ story: { state: 'Resolved' } })
  const second = activationPlan(resolved.items, resolved.task)
  assert.deepEqual(steps(second), ['14:Active'], 'the Resolved story is not reopened, so its Feature is not moved either')
  assert.equal(second.skipped[0].text, 'Time Writing story #13 is Resolved and is not reopened.')
  const doneFeature = world({ feature: { state: 'Done' } })
  assert.deepEqual(steps(activationPlan(doneFeature.items, doneFeature.task)), ['14:Active', '13:Active'], 'a Done Feature is never reopened')
  const removed = world({ task: { state: 'Removed' } })
  assert.equal(activationPlan(removed.items, removed.task).skipped[0].text, 'Task #14 is Removed and stays Removed.')
  const none = world({ task: { originalEstimate: 0, completedWork: 0 } })
  assert.deepEqual(activationPlan(none.items, none.task).skipped.map((entry) => entry.reason), ['no-hours'])
  const work = world({ task: { title: 'Write the report' } })
  assert.deepEqual(activationPlan(work.items, work.task).skipped.map((entry) => entry.reason), ['not-month-task'])
})

test('ACT-26: the Actuals lock ends at midnight UTC after the lock day — the 4th of the next month by default, a moved date, or an early lock (TC-ACT-20)', () => {
  const { items, task } = world()
  assert.equal(closeReason(items, task, locks, at('2026-12-04T23:59:59Z')), '', 'the lock day itself is still open, in every time zone')
  assert.equal(closeReason(items, task, locks, at('2026-12-05T00:00:01Z')), 'the Actuals of 2026-11 are locked')
  assert.equal(closeReason(items, task, { monthLocks: { '2026-11': { actualsOn: '2026-12-10' } } }, at('2026-12-06T12:00:00Z')), '', 'a lock date moved later in Settings is followed')
  assert.match(closeReason(items, task, { monthLocks: { '2026-11': { actualsLocked: true } } }, at('2026-11-20T12:00:00Z')), /locked/, 'a month locked early counts as locked')
  const finished = world({ feature: { state: 'Resolved' } })
  assert.equal(closeReason(finished.items, finished.task, locks, at('2026-11-20T12:00:00Z')), 'its Feature #10 is Resolved')
})

test('ACT-26, ACT-27: the check closes own Month Tasks of a locked month or a finished Feature, then their own Time Writing story when all its Tasks are Closed (TC-ACT-20, TC-ACT-21)', () => {
  const { items } = world({ task: { state: 'Active' }, story: { state: 'Active' }, feature: { state: 'Active' } })
  const plan = ownMonthTaskPlan(items, me, locks, at('2026-12-05T08:00:00Z'))
  assert.deepEqual(steps(plan), ['14:Closed', '13:Closed'])
  assert.match(plan.steps[0].why, /^Task #14 set to Closed \(Active before\), because the Actuals of 2026-11 are locked\.$/)
  assert.deepEqual(plan.steps[1].needs, [14])
  // A New story goes New → Active → Closed; a story with another open Task stays open; the Feature is never closed.
  const open = [...items.map((entry) => entry.id === 13 ? { ...entry, state: 'New' } : entry), item(15, 'Task', 'December 2026 | DP | Core', 13, 'Active')]
  assert.deepEqual(steps(ownMonthTaskPlan(open, me, locks, at('2026-12-05T08:00:00Z'))), ['14:Closed'])
  const newStory = items.map((entry) => entry.id === 13 ? { ...entry, state: 'New' } : entry)
  assert.deepEqual(steps(ownMonthTaskPlan(newStory, me, locks, at('2026-12-05T08:00:00Z'))), ['14:Closed', '13:Active>Closed'])
  // B3: a finished Feature closes the current month's Task too (before the lock).
  const done = world({ task: { state: 'Active' }, story: { state: 'Active' }, feature: { state: 'Closed' } })
  assert.deepEqual(steps(ownMonthTaskPlan(done.items, me, locks, at('2026-11-20T08:00:00Z'))), ['14:Closed', '13:Closed'])
  // An open month with hours: the New Task is made Active instead.
  const fresh = world()
  assert.deepEqual(steps(ownMonthTaskPlan(fresh.items, me, locks, at('2026-11-20T08:00:00Z'))), ['14:Active', '13:Active', '10:Active'])
  // Closed already: nothing to do.
  const already = world({ task: { state: 'Closed' }, story: { state: 'Closed' } })
  assert.deepEqual(steps(ownMonthTaskPlan(already.items, me, locks, at('2026-12-05T08:00:00Z'))), [])
  assert.deepEqual(planReads(newStory, ownMonthTaskPlan(newStory, me, locks, at('2026-12-05T08:00:00Z'))), [14, 13], 'the items and the story\'s Tasks are read again before writing')
})

test('ACT-26: only the person\'s own Month Tasks (by work email) — another person\'s Task and story are never written (TC-ACT-20)', () => {
  const other = { assignedTo: 'Ben Okafor', assignedToEmail: 'ben@example.com' }
  const { items } = world({ task: { state: 'Active', ...other }, story: { state: 'Active', ...other } })
  const plan = ownMonthTaskPlan(items, me, locks, at('2026-12-05T08:00:00Z'))
  assert.deepEqual(steps(plan), [])
  assert.deepEqual(plan.skipped.map((entry) => entry.reason), ['not-own'])
  // The same display name with another email is not "own"; without a work email nothing is own.
  assert.equal(isOwnTask({ assignedToEmail: 'ana.costa@other.example' }, me), false)
  assert.equal(isOwnTask({ assignedToEmail: me }, ''), false)
  assert.equal(isOwnTask({ assignedToEmail: 'ANA@example.com' }, me), true)
  // My Task under a story of someone else: the Task closes, the story is not mine and stays.
  const mixed = world({ task: { state: 'Active' }, story: { state: 'Active', ...other } })
  assert.deepEqual(steps(ownMonthTaskPlan(mixed.items, me, locks, at('2026-12-05T08:00:00Z'))), ['14:Closed'])
})

test('ACT-26: the job reads the States again, plans on them, writes only what is still due and reports each item; a failed Task keeps its story open (TC-ACT-20)', async () => {
  const { items } = world({ task: { state: 'Active' }, story: { state: 'Active' }, feature: { state: 'Active' } })
  const second = item(16, 'Task', 'October 2026 | DP | Core', 13, 'Active')
  const all = [...items, second]
  const writes = []
  let result
  const run = (_key, label, work) => { result = work(() => undefined).then((value) => ({ label, ...value })); return true }
  // Azure DevOps now says #16 is Closed already (someone closed it meanwhile).
  const read = async (_c, _p, ids) => { assert.deepEqual(ids, [14, 16, 13]); return [{ ...second, state: 'Closed' }] }
  const write = async (_c, _p, id, update) => { writes.push(`${id}:${update.state}`); if (id === 14) throw new Error('rule refused'); return item(id, 'Task', 'x', 13, update.state) }
  const planned = []
  const started = startMonthTaskStatesJob({ config: {}, pat: 'pat', items: all, email: me, locks, now: () => at('2026-12-05T08:00:00Z'), onChanged: () => undefined, read, write, run, filter: (step) => !planned.includes(step.item.id), onPlanned: (list) => planned.push(...list.map((step) => step.item.id)) })
  assert.equal(started, true)
  const done = await result
  assert.equal(done.label, 'Month Task states')
  assert.deepEqual(writes, ['14:Closed'], '#16 is not written again; the story waits for #14, which failed')
  assert.equal(done.failed, true)
  assert.match(done.text, /^0 of 2 items updated\. 2 not done — Task #14 not set to Closed: rule refused · Time Writing story #13 not set to Closed: an item below it could not be changed$/)
  assert.ok(planned.includes(14) && planned.includes(13), 'every planned step is remembered, so it is tried once per page load')
  // Nothing due: no job at all; a filter that drops the tried steps: no job either.
  assert.equal(startMonthTaskStatesJob({ config: {}, pat: 'pat', items: world({ task: { state: 'Closed' }, story: { state: 'Closed' } }).items, email: me, locks, now: () => at('2026-12-05T08:00:00Z'), onChanged: () => undefined, run: () => { throw new Error('no job') } }), false)
  assert.equal(startMonthTaskStatesJob({ config: {}, pat: 'pat', items: all, email: me, locks, now: () => at('2026-12-05T08:00:00Z'), onChanged: () => undefined, filter: () => false, run: () => { throw new Error('no job') } }), false)
})

test('ACT-24: a plan runs in order, each state written, and a failure is reported, not thrown (TC-ACT-19)', async () => {
  const { items, task } = world()
  const writes = []
  const run = await runStatePlan({}, 'pat', activationPlan(items, task), async (_c, _p, id, update) => { writes.push(`${id}:${update.state}`); return { id, state: update.state } })
  assert.deepEqual(writes, ['14:Active', '13:Active', '10:Active'])
  assert.equal(run.notes.length, 3)
  const failing = await runStatePlan({}, 'pat', activationPlan(items, task), async () => { throw new Error('State transition not allowed') })
  assert.deepEqual(failing.failed, ['Task #14 not set to Active: State transition not allowed', 'Time Writing story #13 not set to Active: an item below it could not be changed', 'Feature #10 not set to Active: an item below it could not be changed'])
})

test('ACT-23: Features Working on counts the distinct Features holding the person\'s Month Tasks of the month (TC-ACT-18)', () => {
  const { items, task } = world()
  const other = item(20, 'Feature', 'Lab', 1, 'Active'), otherStory = item(21, 'User Story', 'Lab - Time Writing', 20, 'Active')
  const tasks = [task, item(15, 'Task', 'November 2026 | DP | Core (second story)', 13, 'New'), item(22, 'Task', 'November 2026 | Lab', 21, 'New'), item(23, 'Task', 'November 2026 | Lab', 21, 'Removed'), item(24, 'Task', 'November 2026 | loose', undefined, 'New')]
  assert.equal(featuresWorkingOn([...items, other, otherStory, ...tasks], tasks), 2, 'two Tasks under DP | Core count once; Removed and Feature-less Tasks do not count')
  assert.equal(featuresWorkingOn(items, []), 0)
})

test('ACT-26: the check never runs with the sample, in View as, without the right, PAT or work email, on an on-premises server, or before the fetch and the lock settings (TC-ACT-20)', () => {
  const cloud = { organization: 'example', project: 'Quality', team: 'Team A' }
  const ready = { config: cloud, pat: 'x'.repeat(52), email: me, fetched: '2026-11-26T08:00:00Z', busy: false, isSample: false, viewingAs: false, canWrite: true, locksLoaded: true }
  assert.equal(monthTaskStatesBlocked(ready), '')
  assert.equal(monthTaskStatesBlocked({ ...ready, isSample: true }), 'sample')
  assert.equal(monthTaskStatesBlocked({ ...ready, viewingAs: true }), 'view-as')
  assert.equal(monthTaskStatesBlocked({ ...ready, canWrite: false }), 'no-right')
  assert.equal(monthTaskStatesBlocked({ ...ready, pat: ' ' }), 'not-connected')
  assert.equal(monthTaskStatesBlocked({ ...ready, email: '' }), 'not-connected')
  assert.equal(monthTaskStatesBlocked({ ...ready, config: { ...cloud, baseUrl: 'https://azure.example.com/tfs' } }), 'on-premises')
  assert.equal(monthTaskStatesBlocked({ ...ready, fetched: '' }), 'not-ready')
  assert.equal(monthTaskStatesBlocked({ ...ready, busy: true }), 'not-ready')
  assert.equal(monthTaskStatesBlocked({ ...ready, locksLoaded: false }), 'not-ready')
})
