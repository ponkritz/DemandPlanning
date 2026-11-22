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
