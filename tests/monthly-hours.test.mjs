import test from 'node:test'
import assert from 'node:assert/strict'
import { monthlyHours, capacityModel } from '../src/capacity.ts'
import { sampleDataset } from '../src/sampleData.ts'

test('monthly hours series spans the requested months and matches the capacity model per month', () => {
  const { items } = sampleDataset({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const series = monthlyHours(items, '2026-10', 12)
  assert.equal(series.length, 12); assert.equal(series[0].month, '2025-11'); assert.equal(series.at(-1).month, '2026-10')
  const october = capacityModel(items, '2026-10')
  assert.deepEqual([series.at(-1).funded, series.at(-1).available, series.at(-1).actual], [october.totals.funded, october.totals.available, october.totals.work])
  assert.ok(series.slice(0, 6).every((point) => point.actual == null && point.funded == null), 'months without tasks are gaps')
  assert.ok(series.slice(6).every((point) => point.actual != null && point.funded >= point.available && point.available >= point.actual * 0.5))
  assert.throws(() => monthlyHours(items, '2026-13'))
  assert.equal(monthlyHours(items, '2026-10', 6).length, 6)
})

import { epicColors, niceTicks, columnPath, barPath } from '../src/chartUtils.ts'
test('monthly series carries utilization and per-Epic hours that reconcile with the totals', () => {
  const { items } = sampleDataset({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const october = monthlyHours(items, '2026-10', 12).at(-1)
  assert.equal(october.utilization, capacityModel(items, '2026-10').totals.utilization)
  assert.ok(Math.abs(october.plannedUtilization - october.planned / october.available * 100) < 0.01)
  assert.ok(Math.abs(october.streams.reduce((sum, stream) => sum + stream.work, 0) - october.actual) < 0.001, 'Epic hours add up to booked hours')
  assert.equal(monthlyHours(items, '2026-10', 12)[0].utilization, null)
})
test('Epic colours: top five by booked hours keep slots 1–5, the rest fold into Other', () => {
  const series = [{ streams: [{ key: 'a', title: 'A', work: 10, planned: 0 }, { key: 'b', title: 'B', work: 50, planned: 0 }] }, { streams: ['c', 'd', 'e', 'f', 'g'].map((key, index) => ({ key, title: key.toUpperCase(), work: 20 - index, planned: 0 })) }]
  const colors = epicColors(series)
  assert.deepEqual(colors.top.map((entry) => entry.key), ['b', 'c', 'd', 'e', 'f'])
  assert.equal(colors.colorOf('b'), 'var(--viz-series-1)'); assert.equal(colors.colorOf('a'), 'var(--viz-other)'); assert.equal(colors.isTop('g'), false)
  assert.deepEqual(epicColors([]).top, [])
})
test('chart geometry helpers', () => {
  assert.deepEqual(niceTicks(964), [0, 250, 500, 750, 1000]); assert.deepEqual(niceTicks(117.3), [0, 50, 100, 150]); assert.deepEqual(niceTicks(0), [0, 1])
  assert.equal(columnPath(0, 0, 10, 0), ''); assert.match(columnPath(10, 20, 24, 100), /^M10,120V24Q10,20 14,20H30Q34,20 34,24V120Z$/)
  assert.match(barPath(0, 0, 50, 16), /^M0,0H46Q50,0 50,4V12Q50,16 46,16H0Z$/)
})

import { paretoSeries, arcPath } from '../src/chartUtils.ts'
test('Pareto marks the vital few up to the item that first reaches the threshold', () => {
  const data = paretoSeries([{ key: 'a', title: 'A', work: 10 }, { key: 'b', title: 'B', work: 50 }, { key: 'c', title: 'C', work: 30 }, { key: 'z', title: 'Z', work: 0 }, { key: 'd', title: 'D', work: 10 }])
  assert.deepEqual(data.map((item) => item.key), ['b', 'c', 'a', 'd'], 'sorted by hours, zero-hour items dropped')
  assert.deepEqual(data.map((item) => item.cumulative), [50, 80, 90, 100]); assert.deepEqual(data.map((item) => item.vital), [true, true, false, false])
  assert.deepEqual(paretoSeries([{ key: 'x', title: 'X', work: 5 }]).map((item) => [item.share, item.cumulative, item.vital]), [[100, 100, true]])
  assert.deepEqual(paretoSeries([]), [])
})
test('donut arc geometry', () => {
  assert.equal(arcPath(0, 0, 5, 10, 0, 0), '')
  assert.match(arcPath(100, 100, 60, 90, -Math.PI / 2, 0), /^M100\.00,10\.00A90,90 0 0 1 190\.00,100\.00L160\.00,100\.00A60,60 0 0 0 100\.00,40\.00Z$/)
  assert.match(arcPath(100, 100, 60, 90, 0, Math.PI * 2), /^M100,10A90,90 0 1 1 100,190/, 'a full turn draws a ring')
})

import { problemBreakdown } from '../src/capacity.ts'
import { shortFeatureTitle, wrapLabel } from '../src/chartUtils.ts'
test('problem breakdown: overrun only above a positive estimate, ad-hoc by tag, absence excluded, grouped by Feature and Epic', () => {
  const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: 'A', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '' }
  const item = (id, extra) => ({ ...base, key: `o/p/${id}`, id, title: `Item ${id}`, workItemType: 'User Story', ...extra })
  const items = [
    item(1, { workItemType: 'Epic', title: 'CP' }), item(2, { workItemType: 'Feature', parentId: 1, title: 'CP | Care | v1' }), item(3, { parentId: 2, title: 'CP | Care | v1 - Time Writing' }),
    item(4, { workItemType: 'Task', parentId: 3, title: 'October 2026 | a', originalEstimate: 10, completedWork: 16 }),
    item(5, { workItemType: 'Task', parentId: 3, title: 'October 2026 | b', originalEstimate: 10, completedWork: 8 }),
    item(6, { workItemType: 'Task', parentId: 3, title: 'October 2026 | c', completedWork: 5, tags: 'urgent; ad-hoc' }),
    item(7, { workItemType: 'Task', parentId: 3, title: 'September 2026 | d', originalEstimate: 1, completedWork: 50 }),
    item(37778, { workItemType: 'Epic', title: 'Absence' }), item(8, { workItemType: 'Feature', parentId: 37778, title: 'A - Absence' }), item(9, { parentId: 8, title: 'A - Time Writing' }),
    item(10, { workItemType: 'Task', parentId: 9, title: 'October 2026 | PTO', originalEstimate: 1, completedWork: 40, tags: 'ad-hoc' }),
  ]
  const result = problemBreakdown(items, ['2026-10'])
  assert.equal(result.overrun.total, 6); assert.equal(result.overrun.tasks, 1)
  assert.deepEqual(result.overrun.feature.map((entry) => [entry.title, entry.work, entry.colorKey, entry.group]), [['CP | Care | v1', 6, 'o/p/1', 'CP']])
  assert.deepEqual(result.adhoc.epic.map((entry) => [entry.title, entry.work]), [['CP', 5]]); assert.equal(result.booked, 29); assert.equal(result.adhoc.share, 17.24)
  assert.equal(problemBreakdown(items, ['2026-09', '2026-10']).overrun.total, 55, 'the window includes September')
})
test('label helpers', () => {
  assert.equal(shortFeatureTitle('CP | Care Pathways | v3.1'), 'Care Pathways v3.1'); assert.equal(shortFeatureTitle('No pipes'), 'No pipes')
  assert.deepEqual(wrapLabel('Care Pathways v3.1', 10), ['Care Path…', 'v3.1'])
  assert.notDeepEqual(wrapLabel('Care Pathways v3.1', 10), wrapLabel('Care Pathways v3.2', 10))
  assert.deepEqual(wrapLabel('Remote Diagnostics v1.6', 12), ['Remote Diag…', 'v1.6'])
  assert.deepEqual(wrapLabel('Field Actions', 12), ['Field', 'Actions'])
  assert.deepEqual(wrapLabel('DP', 12), ['DP'])
})
test('sample has unplanned work spread across several streams, enough for a Pareto', () => {
  const { items } = sampleDataset({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const months = monthlyHours(items, '2026-10', 6).map((point) => point.month)
  const problems = problemBreakdown(items, months)
  assert.ok(problems.adhoc.epic.length >= 3, `ad-hoc Epics: ${problems.adhoc.epic.length}`); assert.ok(problems.overrun.feature.length >= 3)
  assert.ok(problems.adhoc.share > 0 && problems.adhoc.share < 25)
})

import { azureResources } from '../src/capacity.ts'
test('resource list comes from Azure assignees and reconciles with the monthly capacity model', () => {
  const { items } = sampleDataset({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const resources = azureResources(items, '2026-10')
  const series = monthlyHours(items, '2026-10', 12)
  const october = capacityModel(items, '2026-10')
  assert.deepEqual(resources.map((person) => person.name), october.people.map((person) => person.name).sort())
  assert.equal(resources.reduce((sum, person) => sum + person.work, 0), series.reduce((sum, point) => sum + (point.actual ?? 0), 0))
  assert.equal(resources.reduce((sum, person) => sum + person.absence, 0), series.reduce((sum, point) => sum + point.absence, 0))
  for (const person of resources) {
    const model = october.people.find((entry) => entry.name === person.name)
    assert.equal(person.status, model.status); assert.equal(person.utilization, model.utilization)
    assert.ok(person.firstMonth <= person.lastMonth && person.months >= 1 && person.streams.length >= 1)
  }
  assert.deepEqual(azureResources([], '2026-10'), [])
})

import { timeWritingMonth, isTimeWritingStory, timeWritingGaps } from '../src/azureInsights.ts'
test('Time Writing naming: month prefixes and story titles are matched tolerantly', () => {
  for (const title of ['October 2026 | DP', 'Oct 2026 - DP', 'october-2026: DP', 'OCT 2026 – DP', '2026-10 | DP', '2026/10 - DP', 'Oct, 2026 | DP', 'October 2026 / DP', 'October 2026 > DP', 'Oct. 2026 DP', 'October 2026', '[October 2026'.slice(1)]) assert.equal(timeWritingMonth(title), '2026-10', title)
  assert.equal(timeWritingMonth('Sept 2026 | x'), '2026-09')
  for (const title of ['DP | October 2026', 'DP - Oct 2026', 'DP Oct. 2026', 'DP v4 (October 2026)', 'DP 2026-10', 'DP | Oct, 2026', 'DP v4 - october-2026']) assert.equal(timeWritingMonth(title), '2026-10', title)
  assert.equal(timeWritingMonth('November 2026 | DP | Oct 2026'), '2026-11', 'a leading month wins')
  for (const title of ['Release Octopus 2026', 'DP Mayday 2026', 'DP October 20261', 'DP 2026-13', 'Review October 2026 plan']) assert.equal(timeWritingMonth(title), undefined, title)
  for (const title of ['DP | Dose Planning | v4.2', 'Review October 2026 | x', '2026 | x', 'October 26 | x', 'Octopus 2026 | x', 'October 20261 | x', '2026-13 | x']) assert.equal(timeWritingMonth(title), undefined, title)
  for (const title of ['DP | Dose Planning | v4.2 - Time Writing', 'Time Writing - DP', 'DP Time writing', 'TimeWriting Q4', 'Time-Writing']) assert.equal(isTimeWritingStory({ workItemType: 'User Story', title }), true, title)
  assert.equal(isTimeWritingStory({ workItemType: 'User Story', title: 'Writing time estimates' }), false)
  assert.equal(isTimeWritingStory({ workItemType: 'Task', title: 'Time Writing' }), false)
})

test('Time Writing gaps: stories without the month task, tasks without a month, month tasks without a Feature', () => {
  const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '' }
  const at = (id, workItemType, title, parentId, extra = {}) => ({ ...base, key: `o/p/${id}`, id, workItemType, title, parentId, ...extra })
  const items = [
    at(20, 'Feature', 'DP | v4'), at(1, 'User Story', 'Time Writing - DP', 20), at(2, 'Task', 'October 2026 | DP', 1),
    at(3, 'User Story', 'CP hours', 20), at(4, 'Task', 'September 2026 | CP', 3), at(5, 'Task', 'Weekly support', 3),
    at(6, 'User Story', 'SFV review'), at(7, 'Task', 'Oct 2026 - SFV', 6),
    at(8, 'User Story', 'QMS - Time Writing', undefined, { state: 'Closed' }),
    at(9, 'User Story', 'Milestone: design review', 20), at(10, 'Task', 'Prepare slides', 9),
  ]
  const gaps = timeWritingGaps(items, '2026-10')
  assert.deepEqual(gaps.storiesWithoutTask.map((item) => item.id), [3], 'any story holding month tasks counts; closed and milestone stories are not flagged')
  assert.deepEqual(gaps.tasksWithoutMonth.map((item) => item.id), [5])
  assert.deepEqual(gaps.tasksWithoutFeature.map(({ task, parent }) => [task.id, parent.id]), [[7, 6]])
})

import { azureInsights, planMonthStory } from '../src/azureInsights.ts'
test('Time Writing is found from the month Task, whatever the story is called', () => {
  const base = { organization: 'o', project: 'p', state: 'Active', assignedTo: 'Asha', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '' }
  const at = (id, workItemType, title, parentId, extra = {}) => ({ ...base, key: `o/p/${id}`, id, workItemType, title, parentId, ...extra })
  const items = [
    at(1, 'Epic', 'DP'), at(2, 'Feature', 'DP | v4', 1),
    at(3, 'User Story', 'Hours for v4', 2), at(4, 'Task', 'Oct-2026 DP v4', 3, { originalEstimate: 10, completedWork: 12 }),
    at(5, 'User Story', 'Design review', 2), at(6, 'Task', 'Prepare slides', 5, { completedWork: 99 }),
    at(7, 'Task', 'October 2026: support', 2, { completedWork: 3 }),
  ]
  const insight = azureInsights(items, '2026-10', '2026-10-20')
  assert.deepEqual(insight.monthlyTasks.map((item) => item.id).sort(), [4, 7])
  assert.equal(insight.actual.value, 15)
  assert.deepEqual(insight.epicBreakdown.map((group) => [group.epic?.title, group.tasks]), [['DP', 2]])
  const model = capacityModel(items, '2026-10')
  assert.equal(model.people.find((person) => person.name === 'Asha').work, 15, 'non-month tasks under other stories are not booked hours')
})

test('Month task placement: reuse any month task of mine, otherwise the right story, never a duplicate', () => {
  const at = (id, workItemType, title, extra = {}) => ({ id, workItemType, title, state: 'Active', assignedTo: 'Asha', ...extra })
  const mine = (item) => item.assignedTo === 'Asha'
  const random = { story: at(3, 'User Story', 'Hours for v4'), tasks: [at(4, 'Task', 'Sep 2026 - v4')] }
  const milestone = { story: at(5, 'User Story', 'Design review'), tasks: [at(6, 'Task', 'Prepare slides')] }
  assert.deepEqual(planMonthStory([random, milestone], [], '2026-10', 'DP | v4 - Time Writing', mine), { status: 'use', story: random.story })
  const done = { story: random.story, tasks: [...random.tasks, at(7, 'Task', 'Oct. 2026 / v4')] }
  assert.equal(planMonthStory([done], [], '2026-10', 'DP | v4 - Time Writing', mine).status, 'exists')
  assert.equal(planMonthStory([milestone], [], '2026-10', 'DP | v4 - Time Writing', mine).status, 'create', 'a milestone story is never used')
  const other = { story: at(8, 'User Story', 'Ben hours'), tasks: [at(9, 'Task', 'Sep 2026 | v4', { assignedTo: 'Ben' })] }
  assert.equal(planMonthStory([random, other], [], '2026-10', 'DP | v4 - Time Writing', mine).status, 'use', 'the story holding my tasks wins')
  const third = { story: at(10, 'User Story', 'More hours'), tasks: [at(11, 'Task', 'Aug 2026 | v4', { assignedTo: 'Ben' })] }
  assert.equal(planMonthStory([other, third], [], '2026-10', 'DP | v4 - Time Writing', mine).status, 'conflict')
  assert.equal(planMonthStory([], [at(12, 'Task', 'October 2026 | v4')], '2026-10', 'x', mine).status, 'exists', 'a month task directly under the Feature counts')
})
