import test from 'node:test'
import assert from 'node:assert/strict'
import { closeChosen, closeSelection, closeTree, defaultTicks, storyCloseRows, toggleTick } from '../src/closeList.ts'

const base = { organization: 'org', project: 'Quality', state: 'Active', areaPath: 'Quality', iterationPath: 'Quality', tags: '', url: 'https://dev.azure.com/org/Quality/_workitems/edit/1', syncedAt: '' }
const item = (id, workItemType, title, parentId, extra = {}) => ({ ...base, key: `org/quality/${id}`, id, workItemType, title, parentId, assignedTo: 'Ana Costa', assignedToEmail: 'ana@x.com', ...extra })
const me = { email: 'ana@x.com', name: 'Ana Costa' }
const ben = { assignedTo: 'Ben Okafor', assignedToEmail: 'ben@x.com' }
const world = () => [
  item(1, 'Epic', 'E'),
  item(10, 'Feature', 'DP | Core | 5.2', 1),
  item(11, 'User Story', 'DT review', 10),
  item(12, 'Task', 'Write report', 11),
  item(13, 'User Story', 'DP | Core | 5.2 - Time Writing', 10),
  item(14, 'Task', 'November 2026 | DP | Core | 5.2', 13),
  item(15, 'Task', 'November 2026 | DP | Core | 5.2', 13, ben),
  item(16, 'User Story', 'SFV review', 10, { state: 'Closed' }),
  item(17, 'Task', 'October 2026 | DP | Core | 5.2', 13, { state: 'Closed' }),
]

test('BKL-39: Close Feature lists everything open under it, parents before children; yours ticked, others’ not (TC-BKL-28)', () => {
  const items = world()
  const rows = closeTree(items, items[1], me)
  assert.deepEqual(rows.map((row) => [row.item.id, row.depth]), [[10, 0], [11, 1], [12, 2], [13, 1], [14, 2], [15, 2]], 'closed items (#16, #17) are not listed')
  assert.deepEqual(rows.filter((row) => row.timeWriting).map((row) => row.item.id), [13])
  assert.deepEqual(rows.filter((row) => row.monthTask).map((row) => row.item.id), [14, 15])
  const ticks = defaultTicks(rows)
  assert.deepEqual([...ticks].sort((a, b) => a - b), [11, 12, 14], 'Ben’s Task is not ticked, so the Time Writing story and the Feature above it are not either')
  const all = toggleTick(rows, ticks, 10, true)
  assert.deepEqual([...all].sort((a, b) => a - b), [10, 11, 12, 13, 14, 15], 'ticking the Feature ticks everything below it')
  const less = toggleTick(rows, all, 15, false)
  assert.deepEqual([...less].sort((a, b) => a - b), [11, 12, 14], 'unticking Ben’s Task unticks the story and the Feature above it')
  const selection = closeSelection(rows, all)
  assert.deepEqual(selection.items.map((entry) => entry.id), [12, 14, 15, 11, 13, 10], 'deepest first: Tasks, then stories, then the Feature')
  assert.equal(selection.needsHours, true, 'a month Time Writing Task is among them: hours are confirmed first')
  assert.equal(closeSelection(rows, new Set([11, 12])).needsHours, false)
})

test('BKL-39: Close User Story — the story alone, or with the Feature, Time Writing story and Tasks when it is the last open one (TC-BKL-28)', () => {
  const items = [...world(), item(18, 'User Story', 'IQOQ', 10)]
  assert.deepEqual(storyCloseRows(items, items.find((entry) => entry.id === 11), me).map((row) => row.item.id), [11], 'another User Story (#18) is still open: the story alone')
  const last = world()
  assert.deepEqual(storyCloseRows(last, last.find((entry) => entry.id === 11), me).map((row) => row.item.id), [10, 11, 12, 13, 14, 15], 'the last one (the Time Writing story does not count): the Feature with its Time Writing story and Tasks')
  const closedFeature = world().map((entry) => entry.id === 10 ? { ...entry, state: 'Closed' } : entry)
  assert.deepEqual(storyCloseRows(closedFeature, closedFeature.find((entry) => entry.id === 11), me).map((row) => row.item.id), [11], 'a closed Feature is not asked about')
  const rows = storyCloseRows(last, last.find((entry) => entry.id === 11), me)
  assert.ok(defaultTicks(rows, 11).has(11), 'the story asked about is ticked')
})

test('BKL-39: closing runs children first; a parent stays open when an item below it could not be closed (TC-BKL-28)', async () => {
  const items = world()
  const rows = closeTree(items, items[1], me)
  const selection = closeSelection(rows, new Set([10, 11, 12, 13, 14, 15]))
  const writes = []
  const write = async (config, pat, id, update) => { if (id === 15) throw new Error('refused'); writes.push([id, update.state]); return { ...items.find((entry) => entry.id === id), state: update.state } }
  const result = await closeChosen({}, 'pat', selection, write)
  assert.deepEqual(result.failed, ['#15: refused'])
  assert.deepEqual(result.closed.map((entry) => entry.id), [12, 14, 11], 'the Time Writing story and the Feature stay open above the failure')
  assert.deepEqual(result.skipped, ['#13 left open: an item below it could not be closed', '#10 left open: an item below it could not be closed'])
  assert.deepEqual(writes.map(([id]) => id), [12, 14, 11])
})

test('BKL-43: closing a Feature early lists its later months’ Time Writing Tasks to remove (everyone’s, ticked; not those with Completed Work) (TC-BKL-32)', async () => {
  const now = new Date('2026-11-23T10:00:00Z')
  const items = [...world(),
    item(20, 'Task', 'December 2026 | DP | Core | 5.2', 13),
    item(21, 'Task', 'January 2027 | DP | Core | 5.2', 13, { ...ben, state: 'New' }),
    item(22, 'Task', 'December 2026 | DP | Core | 5.2', 13, { ...ben, completedWork: 3 })]
  const rows = closeTree(items, items[1], me, 0, undefined, now)
  assert.deepEqual(rows.filter((row) => row.remove).map((row) => row.item.id), [20, 21], 'later months without Completed Work; this month (#14, #15) and #22 (3 h done) are closed as usual')
  const ticks = defaultTicks(rows)
  assert.ok(ticks.has(20) && ticks.has(21), 'ticked whoever they belong to')
  assert.ok(!ticks.has(22), 'Ben’s Task with hours is not ticked')
  const all = toggleTick(rows, ticks, 10, true)
  const selection = closeSelection(rows, all)
  assert.deepEqual(selection.removals.map((entry) => entry.id), [20, 21])
  assert.ok(!selection.items.some((entry) => [20, 21].includes(entry.id)), 'removed, not closed')
  const writes = []
  const write = async (_c, _p, id, update) => { writes.push(`${id}:${update.state}`); return { ...items.find((entry) => entry.id === id), state: update.state } }
  const zero = async (_c, _p, id) => { writes.push(`${id}:0h`); return { ...items.find((entry) => entry.id === id), originalEstimate: 0 } }
  const result = await closeChosen({}, 'pat', selection, write, undefined, zero)
  assert.deepEqual(writes.slice(0, 4), ['20:0h', '20:Removed', '21:0h', '21:Removed'], 'first 0 h, then Removed, before anything closes')
  assert.deepEqual(result.removed.map((entry) => entry.id), [20, 21])
  assert.ok(result.closed.some((entry) => entry.id === 10), 'then the Feature closes')
  assert.equal(closeTree(items, items[1], me, 0, undefined, new Date('2027-02-01T00:00:00Z')).some((row) => row.remove), false, 'nothing later once those months have come')
})

test('BKL-43: a later month that cannot be removed keeps its story and the Feature open (TC-BKL-32)', async () => {
  const now = new Date('2026-11-23T10:00:00Z')
  const items = [...world(), item(20, 'Task', 'December 2026 | DP | Core | 5.2', 13)]
  const rows = closeTree(items, items[1], me, 0, undefined, now)
  const selection = closeSelection(rows, toggleTick(rows, defaultTicks(rows), 10, true))
  const write = async (_c, _p, id, update) => ({ ...items.find((entry) => entry.id === id), state: update.state })
  const zero = async () => { throw new Error('refused') }
  const result = await closeChosen({}, 'pat', selection, write, undefined, zero)
  assert.match(result.failed.join(), /#20: refused/)
  assert.ok(!result.closed.some((entry) => [13, 10].includes(entry.id)), 'the Time Writing story and the Feature stay open')
})

test('BKL-42: Close Tasks lists the ticked Task alone, with the hours question; a User Story close removes later months only when it closes the Feature (TC-BKL-31)', () => {
  const items = [...world(), item(20, 'Task', 'December 2026 | DP | Core | 5.2', 13)]
  const rows = closeTree(items, items.find((entry) => entry.id === 14), me)
  assert.deepEqual(rows.map((row) => row.item.id), [14])
  assert.equal(rows[0].remove, undefined)
  assert.equal(closeSelection(rows, defaultTicks(rows)).needsHours, true, 'a month Task asks whether its hours are entered')
  assert.equal(closeTree(items, items.find((entry) => entry.id === 20), me)[0].remove, undefined, 'a Task closed on its own is closed, not removed')
  assert.equal(storyCloseRows([...items, item(18, 'User Story', 'IQOQ', 10)], items.find((entry) => entry.id === 11), me).some((row) => row.remove), false, 'not the last open story: nothing removed')
  assert.equal(storyCloseRows(items, items.find((entry) => entry.id === 11), me, new Date('2026-11-23T10:00:00Z')).filter((row) => row.remove).map((row) => row.item.id).join(), '20', 'the last open story closes the Feature: the later month is removed')
})
