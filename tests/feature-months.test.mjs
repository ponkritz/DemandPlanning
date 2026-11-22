import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { featureMonths, isFutureMonth, monthKeyOfDate, monthKeyOfLabel, monthLabelOfKey } from '../src/featureMonths.ts'
import { addMonthTasks, featurePatch, createAzureFeature, HierarchyCreationError } from '../src/azureDevOps.ts'

const require = createRequire(import.meta.url)
const { azureFeatureRequest } = require('../electron/azure-devops.cjs')
const config = { organization: 'example-org', project: 'Quality', team: 'Team A' }
const pat = 'synthetic-test-token'
const now = { formMonth: 'November 2026', currentMonth: 'November 2026' }

test('month helpers read and write "Month YYYY" and ISO dates', () => {
  assert.equal(monthKeyOfDate('2026-12-05'), '2026-12')
  assert.equal(monthKeyOfDate('2026-13-01'), undefined)
  assert.equal(monthKeyOfDate('Dec 2026'), undefined)
  assert.equal(monthKeyOfLabel('December 2026'), '2026-12')
  assert.equal(monthLabelOfKey('2027-01'), 'January 2027')
  assert.equal(isFutureMonth('December 2026', 'November 2026'), true)
  assert.equal(isFutureMonth('November 2026', 'November 2026'), false)
})

test('Start Date in a future month: Time Writing starts in that month, not this one (TC-BKL-20)', () => {
  assert.deepEqual(featureMonths({ ...now, startDate: '2026-12-01' }), ['December 2026'], 'a December release asks for December only, no November Task')
  assert.deepEqual(featureMonths({ ...now }), ['November 2026'], 'no Start Date: today')
  assert.deepEqual(featureMonths({ ...now, startDate: '2026-09-15' }), ['November 2026'], 'a past Start Date starts in the current month')
  assert.deepEqual(featureMonths({ formMonth: 'October 2026', currentMonth: 'November 2026' }), ['October 2026'], 'without a Start Date the month the form was opened for is kept (Time Writing page)')
  assert.throws(() => featureMonths({ ...now, startDate: 'soon' }), /Start Date/)
})

test('Target date: one Task for every month from the start up to it, no limit (TC-BKL-21)', () => {
  assert.deepEqual(featureMonths({ ...now, startDate: '2026-11-03', targetDate: '2027-01-31' }), ['November 2026', 'December 2026', 'January 2027'])
  assert.deepEqual(featureMonths({ ...now, targetDate: '2027-01-10' }), ['November 2026', 'December 2026', 'January 2027'], 'no Start Date = today')
  assert.deepEqual(featureMonths({ ...now, startDate: '2026-12-01', targetDate: '2027-02-01' }), ['December 2026', 'January 2027', 'February 2027'])
  assert.deepEqual(featureMonths({ ...now, targetDate: '2026-10-01' }), ['November 2026'], 'a Target date already past: the start month only')
  assert.equal(featureMonths({ ...now, targetDate: '2029-10-01' }).length, 36, 'no limit on the number of months')
  assert.throws(() => featureMonths({ ...now, startDate: '2027-01-10', targetDate: '2026-12-01' }), /before the Start Date/)
})

test('the Start Date goes to the Feature’s Start Date field, the same on web and desktop (TC-BKL-20)', () => {
  const feature = { parentId: 10, title: 'Example | Service | 1.0', description: 'Feature DoD: x', acceptanceCriteria: '', areaPath: 'Quality\\A', assignedTo: 'a@example.invalid', startDate: '2026-12-01', targetDate: '2027-01-31' }
  const patch = featurePatch(config, feature)
  assert.deepEqual(patch.find((op) => op.path === '/fields/Microsoft.VSTS.Scheduling.StartDate'), { op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.StartDate', value: '2026-12-01T00:00:00Z' })
  const input = { ...config, pat, baseUrl: 'https://dev.azure.com/example-org', operation: 'create-feature', validateOnly: true, feature }
  assert.deepEqual(JSON.parse(azureFeatureRequest(input).options.body), patch)
  assert.throws(() => azureFeatureRequest({ ...input, feature: { ...feature, startDate: '01/12/2026' } }), /start date/)
  assert.throws(() => azureFeatureRequest({ ...input, operation: 'create-child', workItemType: 'Task', feature: { ...feature, title: 'December 2026 | x' } }), /start date/, 'only a Feature takes a Start Date')
  assert.equal(featurePatch(config, { ...feature, startDate: undefined }).some((op) => op.path.endsWith('StartDate')), false, 'no Start Date: the field is not written')
})

test('createAzureFeature refuses a malformed Start Date before any write', async () => {
  let calls = 0
  await assert.rejects(createAzureFeature(config, pat, { parentId: 10, title: 'T', description: 'Feature DoD: x', acceptanceCriteria: '', assignedTo: 'a@example.invalid', startDate: 'next month' }, async () => { calls++; return {} }), /Invalid start date/)
  assert.equal(calls, 0)
})

const raw = (id, fields) => ({ id, fields: { 'System.TeamProject': 'Quality', 'System.State': 'Active', 'System.AreaPath': 'Quality\\A', 'System.IterationPath': 'Quality', ...fields } })
function fakeAzure(world, failOn) {
  let next = 100
  const calls = []
  const transport = async (request) => {
    calls.push(request)
    if (request.operation === 'items') return { value: request.ids.map((id) => world.get(id)).filter(Boolean) }
    if (request.operation === 'query') { const parent = Number(/\[System\.Parent\] = (\d+)/.exec(request.query)[1]); return { workItems: [...world.values()].filter((entry) => entry.fields['System.Parent'] === parent).map((entry) => ({ id: entry.id })) } }
    if (request.operation === 'create-child') {
      if (failOn && request.feature.title.startsWith(failOn)) throw new Error(`refused ${failOn}`)
      if (request.validateOnly) return {}
      const id = ++next, f = request.feature
      world.set(id, raw(id, { 'System.WorkItemType': request.workItemType, 'System.Title': f.title, 'System.Parent': f.parentId, 'System.AreaPath': f.areaPath, 'System.IterationPath': f.iterationPath, 'System.AssignedTo': { uniqueName: f.assignedTo }, ...(f.adhoc ? { 'System.Tags': 'ad-hoc' } : {}) }))
      return { id }
    }
    if (request.operation === 'update-time-writing-effort') {
      const entry = world.get(request.workItemId)
      if (request.planHours != null) entry.fields['Microsoft.VSTS.Scheduling.OriginalEstimate'] = request.planHours
      if (request.actualHours != null) entry.fields['Microsoft.VSTS.Scheduling.CompletedWork'] = request.actualHours
      return entry
    }
    throw new Error(`unexpected ${request.operation}`)
  }
  return { transport, calls }
}

test('addMonthTasks adds one Task per later month with the hours typed for it, else the setup default (TC-BKL-21)', async () => {
  const world = new Map([
    [2, raw(2, { 'System.WorkItemType': 'Feature', 'System.Title': 'IOCC | Core | 5.2' })],
    [3, raw(3, { 'System.WorkItemType': 'User Story', 'System.Title': 'IOCC | Core | 5.2 - Time Writing', 'System.Parent': 2, 'System.AssignedTo': { uniqueName: 'ana@x.com' } })],
  ])
  const { transport } = fakeAzure(world)
  const steps = []
  const items = await addMonthTasks(config, pat, 2, 'ana@x.com', [{ month: 'December 2026', originalEstimate: 20 }, { month: 'January 2027' }], 8, transport, (text) => steps.push(text))
  assert.deepEqual(items.map((item) => [item.title, item.parentId, item.originalEstimate, item.assignedToEmail]), [['December 2026 | IOCC | Core | 5.2', 3, 20, 'ana@x.com'], ['January 2027 | IOCC | Core | 5.2', 3, 8, 'ana@x.com']], 'under the existing Time Writing story; typed hours, else the setup default')
  assert.deepEqual(steps, ['Adding the December 2026 Task…', 'Adding the January 2027 Task…'])
  const again = await addMonthTasks(config, pat, 2, 'ana@x.com', [{ month: 'December 2026', completedWork: 3 }], undefined, transport)
  assert.deepEqual([again.length, again[0].id, again[0].completedWork], [1, items[0].id, 3], 'an existing month Task is reused, not duplicated')
})

test('addMonthTasks stops at the first failure and reports what it made', async () => {
  const world = new Map([[2, raw(2, { 'System.WorkItemType': 'Feature', 'System.Title': 'F' })], [3, raw(3, { 'System.WorkItemType': 'User Story', 'System.Title': 'F - Time Writing', 'System.Parent': 2, 'System.AssignedTo': { uniqueName: 'ana@x.com' } })]])
  const { transport } = fakeAzure(world, 'January 2027')
  await assert.rejects(addMonthTasks(config, pat, 2, 'ana@x.com', [{ month: 'December 2026' }, { month: 'January 2027' }, { month: 'February 2027' }], undefined, transport), (failure) => failure instanceof HierarchyCreationError && failure.createdItems.length === 1 && failure.createdItems[0].title === 'December 2026 | F' && /refused January 2027/.test(failure.message))
})

test('BKL-34: ＋ Time Writing Task for several months — each with its hours, from a User Story row to its Feature (TC-BKL-23)', async () => {
  const { addMonthTasksFor } = await import('../src/monthTaskAction.ts')
  const world = new Map([
    [2, raw(2, { 'System.WorkItemType': 'Feature', 'System.Title': 'DP | Core | 5.2' })],
    [3, raw(3, { 'System.WorkItemType': 'User Story', 'System.Title': 'DP | Core | 5.2 - Time Writing', 'System.Parent': 2, 'System.AssignedTo': { uniqueName: 'ana@x.com' } })],
  ])
  const { transport } = fakeAzure(world)
  const items = [{ id: 1, workItemType: 'Epic', title: 'E', state: 'Active' }, { id: 2, workItemType: 'Feature', title: 'DP | Core | 5.2', parentId: 1, state: 'Active' }, { id: 5, workItemType: 'User Story', title: 'Review', parentId: 2, state: 'Active' }]
  const steps = []
  const done = await addMonthTasksFor(config, pat, items, items[2], 'ana@x.com', [{ month: 'December 2026', originalEstimate: 10 }, { month: 'January 2027' }], null, (text) => steps.push(text), transport)
  assert.equal(done.feature.id, 2, 'a User Story row works on the Feature above it')
  assert.match(done.text, /December 2026, January 2027 under “DP \| Core \| 5\.2”/)
  assert.deepEqual(done.changed.map((entry) => [entry.title, entry.originalEstimate]), [['December 2026 | DP | Core | 5.2', 10], ['January 2027 | DP | Core | 5.2', undefined]])
  assert.deepEqual(steps, ['Adding the December 2026 Task…', 'Adding the January 2027 Task…'])
  await assert.rejects(addMonthTasksFor(config, pat, items, items[0], 'ana@x.com', [{ month: 'December 2026' }]), /no Feature above it/)
  await assert.rejects(addMonthTasksFor(config, pat, items, items[1], 'ana@x.com', []), /at least one month/)
})

test('BKL-35: Time Writing Tasks for the chosen person — an unassigned story is assigned to them; a month they already have is warned about, never duplicated (TC-BKL-24)', async () => {
  const { addMonthTasksFor, existingMonthTasks, existingMonthNotice, overrideConfirmText } = await import('../src/monthTaskAction.ts')
  const world = new Map([
    [2, raw(2, { 'System.WorkItemType': 'Feature', 'System.Title': 'DP | Core | 5.2' })],
    [3, { ...raw(3, { 'System.WorkItemType': 'User Story', 'System.Title': 'DP | Core | 5.2 - Time Writing', 'System.Parent': 2 }), rev: 4 }],
  ])
  const base = fakeAzure(world)
  const edits = []
  const transport = async (request) => {
    if (request.operation !== 'edit-work-item') return base.transport(request)
    edits.push(request)
    const entry = world.get(request.workItemId)
    assert.equal(request.rev, entry.rev, 'the story is changed at the revision just read')
    entry.fields['System.AssignedTo'] = { uniqueName: request.edit.assignedTo }
    return {}
  }
  const items = [{ id: 1, workItemType: 'Epic', title: 'E', state: 'Active' }, { id: 2, workItemType: 'Feature', title: 'DP | Core | 5.2', parentId: 1, state: 'Active' }]
  const done = await addMonthTasksFor(config, pat, items, items[1], 'ben@x.com', [{ month: 'December 2026' }], null, undefined, transport)
  assert.deepEqual(edits.map((edit) => [edit.workItemId, edit.edit]), [[3, { assignedTo: 'ben@x.com' }]], 'the unassigned Time Writing story is assigned to the chosen person')
  assert.deepEqual(done.changed.map((entry) => [entry.workItemType, entry.assignedToEmail]), [['User Story', 'ben@x.com'], ['Task', 'ben@x.com']], 'the Task and its story are the chosen person’s')
  // Another person's story is never reassigned: Ana's Task goes under the one Time Writing story (BKL-28), which stays Ben's.
  const anas = await addMonthTasksFor(config, pat, items, items[1], 'ana@x.com', [{ month: 'December 2026' }], null, undefined, transport)
  assert.equal(edits.length, 1, 'Ben’s story stays Ben’s')
  assert.deepEqual(anas.changed.map((entry) => [entry.workItemType, entry.assignedToEmail, entry.parentId]), [['Task', 'ana@x.com', 3]])

  const task = { id: 9, workItemType: 'Task', title: 'December 2026 | DP | Core | 5.2', parentId: 3, state: 'Active', assignedToEmail: 'ben@x.com', originalEstimate: 12, completedWork: 4 }
  const all = [...items, { id: 3, workItemType: 'User Story', title: 'DP | Core | 5.2 - Time Writing', parentId: 2, state: 'Active' }, task, { ...task, id: 10, title: 'January 2027 | DP | Core | 5.2', state: 'Removed' }]
  assert.deepEqual([...existingMonthTasks(all, all[1], 'Ben@x.com').keys()], ['2026-12'], 'the person’s live month Tasks under the Feature, by month')
  assert.equal(existingMonthTasks(all, all[1], 'ana@x.com').size, 0, 'another person’s Task is not theirs')
  assert.equal(existingMonthNotice('December 2026', task, ''), 'There is already a Time Writing Task for December 2026 (#9, Original Estimate 12 h, Completed Work 4 h). No second Task is created: the hours you type here will override its hours.')
  assert.match(existingMonthNotice('December 2026', task, 'Ben Okafor'), /\(#9, .*\) for Ben Okafor\./)
  const confirm = overrideConfirmText([{ label: 'December 2026', task, typed: true }, { label: 'January 2027', task: { ...task, id: 11, originalEstimate: undefined, completedWork: undefined }, typed: false }])
  assert.match(confirm, /These months already have a Time Writing Task/)
  assert.match(confirm, /December 2026: Task #9 .* will be overridden/)
  assert.match(confirm, /January 2027: Task #11 \(no hours yet\) — no hours typed, it stays as it is/)
  assert.match(confirm, /No second Task is created\. Continue\?$/)
})

test('BKL-36: a renamed Feature’s Time Writing story and month Tasks take its new name — everyone’s; leave, holidays and own titles are left alone (TC-BKL-25)', async () => {
  const { staleTimeWritingTitles, syncTimeWritingTitles } = await import('../src/azureDevOps.ts')
  const { syncTitlesAfterSave } = await import('../src/monthTaskAction.ts')
  const task = (id, title, state = 'Active') => ({ id, title, state, workItemType: 'Task' })
  const story = (id, title, tasks, state = 'Active') => ({ story: { id, title, state }, tasks })
  assert.deepEqual(staleTimeWritingTitles('DP | Core | 5.3', [story(3, 'DP | Core | 5.2 - Time Writing', [task(4, 'November 2026 | DP | Core | 5.2'), task(5, 'December 2026 | DP | Core | 5.2'), task(6, 'October 2026 | DP | Core | 5.2', 'Removed')])]).map((entry) => [entry.id, entry.title]),
    [[3, 'DP | Core | 5.3 - Time Writing'], [4, 'November 2026 | DP | Core | 5.3'], [5, 'December 2026 | DP | Core | 5.3']], 'the story and its live month Tasks, whoever they belong to')
  assert.deepEqual(staleTimeWritingTitles('DP | Core | 5.3', [story(3, 'DP | Core | 5.3 - Time Writing', [task(4, 'November 2026 | DP | Core | 5.3')])]), [], 'already in line: nothing')
  assert.deepEqual(staleTimeWritingTitles('Ana Costa - Absence', [story(3, 'Ana Costa - Time Writing', [task(4, 'November 2026 | Ana Costa - PTO'), task(5, 'November 2026 | Ana Costa - Sick Leave')])]), [], 'leave: the Tasks are named after the leave kind, not the story')
  assert.deepEqual(staleTimeWritingTitles('Public Holidays - Pune', [story(3, 'Public Holidays - India - Time Writing', [task(4, 'November 2026 | Diwali')])]), [], 'holidays: Tasks named after the holiday')
  assert.deepEqual(staleTimeWritingTitles('New name', [story(3, 'Old name - Time Writing', [])]), [], 'no month Task: not known to be made from the Feature')
  assert.deepEqual(staleTimeWritingTitles('New name', [story(3, 'Old name - Time Writing', [task(4, 'November 2026 | Old name'), task(5, 'December 2026 | Something else')])]), [], 'mixed names: left alone')
  assert.deepEqual(staleTimeWritingTitles('New name', [story(3, 'Ana’s hours', [task(4, 'November 2026 | Old name')])]), [], 'a story titled by a person is left alone')
  assert.deepEqual(staleTimeWritingTitles('New name', [story(3, 'Old name - Time Writing', [task(4, 'November 2026 | Old name')], 'Removed')]), [], 'a removed story is left alone')
  assert.deepEqual(staleTimeWritingTitles('x'.repeat(250), [story(3, 'Old - Time Writing', [task(4, 'November 2026 | Old')])]), [], 'a title too long for Azure DevOps: left alone')

  const world = new Map([
    [2, raw(2, { 'System.WorkItemType': 'Feature', 'System.Title': 'DP | Core | 5.3' })],
    [3, { ...raw(3, { 'System.WorkItemType': 'User Story', 'System.Title': 'DP | Core | 5.2 - Time Writing', 'System.Parent': 2, 'System.AssignedTo': { uniqueName: 'ana@x.com' } }), rev: 2 }],
    [4, { ...raw(4, { 'System.WorkItemType': 'Task', 'System.Title': 'November 2026 | DP | Core | 5.2', 'System.Parent': 3, 'System.AssignedTo': { uniqueName: 'ben@x.com' } }), rev: 7 }],
    [5, { ...raw(5, { 'System.WorkItemType': 'User Story', 'System.Title': 'Review', 'System.Parent': 2 }), rev: 1 }],
  ])
  const base = fakeAzure(world)
  const edits = []
  const transport = async (request) => {
    if (request.operation !== 'edit-work-item') return base.transport(request)
    const entry = world.get(request.workItemId)
    assert.equal(request.rev, entry.rev, 'each rename at the revision just read')
    edits.push([request.workItemId, request.edit])
    entry.fields['System.Title'] = request.edit.title
    return {}
  }
  const renamed = await syncTimeWritingTitles(config, pat, 2, transport)
  assert.deepEqual(edits, [[3, { title: 'DP | Core | 5.3 - Time Writing' }], [4, { title: 'November 2026 | DP | Core | 5.3' }]], 'only the title is sent; the Review story is not touched')
  assert.deepEqual(renamed.map((entry) => entry.title), ['DP | Core | 5.3 - Time Writing', 'November 2026 | DP | Core | 5.3'])
  assert.deepEqual(await syncTimeWritingTitles(config, pat, 2, transport), [], 'running again changes nothing')

  // After a save: found from the saved Task up to its Feature; silently; a failure only adds a note.
  world.get(2).fields['System.Title'] = 'DP | Core | 6.0'
  const items = [{ id: 2, workItemType: 'Feature', title: 'DP | Core | 6.0', state: 'Active' }, { id: 3, workItemType: 'User Story', title: 'DP | Core | 5.3 - Time Writing', parentId: 2, state: 'Active' }]
  const saved = { id: 4, workItemType: 'Task', title: 'November 2026 | DP | Core | 5.3', parentId: 3, state: 'Active' }
  const after = await syncTitlesAfterSave(config, pat, items, saved, transport)
  assert.equal(after.renamed.length, 2); assert.match(after.note, /Time Writing titles updated to the Feature name \(2\)/)
  const broken = await syncTitlesAfterSave(config, pat, items, saved, async () => { throw new Error('offline') })
  assert.deepEqual([broken.renamed, broken.note], [[], ' Time Writing titles not updated: offline.'])
  assert.deepEqual(await syncTitlesAfterSave(config, pat, [], { id: 9, workItemType: 'Task', title: 'x', state: 'Active' }, transport), { renamed: [], note: '' }, 'no Feature above: nothing to do')
})

test('BKL-37: ＋ Time Writing Task runs as a background job — progress and result in the top bar; one at a time per Feature and person; Tasks made before a failure are kept (TC-BKL-26)', async () => {
  const { startMonthTasksJob } = await import('../src/monthTaskAction.ts')
  const { listJobs, resetJobs, isRunning } = await import('../src/backgroundJobs.ts')
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  const until = async (check) => { for (let i = 0; i < 200 && !check(); i += 1) await settle() }
  resetJobs()
  const world = new Map([[2, raw(2, { 'System.WorkItemType': 'Feature', 'System.Title': 'DP | Core | 5.2' })]])
  const items = [{ id: 1, workItemType: 'Epic', title: 'E', state: 'Active' }, { id: 2, workItemType: 'Feature', title: 'DP | Core | 5.2', parentId: 1, state: 'Active' }]
  const done = [], failed = []
  const { transport } = fakeAzure(world)
  const input = { config, pat, items, item: items[1], assignee: 'Ana@x.com', entries: [{ month: 'December 2026' }, { month: 'January 2027' }], transport, onDone: (text, changed) => done.push([text, changed.length]), onFailed: (text, changed) => failed.push([text, changed.map((entry) => entry.title)]) }
  assert.equal(startMonthTasksJob(input), true)
  assert.equal(isRunning('month-tasks:2:ana@x.com'), true, 'one job per Feature and person')
  assert.equal(startMonthTasksJob(input), false, 'a second Add while it runs does not start another')
  assert.equal(listJobs()[0].label, 'Time Writing Tasks December 2026, January 2027 · #2')
  await until(() => listJobs()[0].state !== 'running')
  assert.deepEqual([listJobs()[0].state, done.length, done[0][1]], ['done', 1, 3], 'story and two Tasks; the page gets them')
  assert.match(listJobs()[0].detail, /December 2026, January 2027 under “DP \| Core \| 5\.2” ready/)

  // A failure part-way: the job says what failed and what was made; the page still gets what was made.
  const partial = fakeAzure(new Map([[2, raw(2, { 'System.WorkItemType': 'Feature', 'System.Title': 'DP | Core | 5.2' })]]), 'January 2027')
  assert.equal(startMonthTasksJob({ ...input, transport: partial.transport }), true)
  await until(() => listJobs()[0].state !== 'running')
  assert.equal(listJobs()[0].state, 'error')
  assert.match(listJobs()[0].detail, /refused January 2027\. Made before it stopped: #\d+, #\d+\./)
  assert.deepEqual(failed, [[listJobs()[0].detail, ['DP | Core | 5.2 - Time Writing', 'December 2026 | DP | Core | 5.2']]])
  resetJobs()
})
