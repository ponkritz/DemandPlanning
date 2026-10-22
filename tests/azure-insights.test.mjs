import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { azureInsights, timeWritingMonth, indiaMonth } from '../src/azureInsights.ts'
import { mapAzureWorkItem } from '../src/azureDevOps.ts'

const item = (id, extra = {}) => ({ key: `org/project/${id}`, id, title: 'Release - Time Writing', workItemType: 'User Story', state: 'Active', assignedTo: 'QE', ...extra })
test('month Task Original Estimate maps to Plan and Completed Work to Actual without child double-counting', () => {
  const story = item(1)
  const task = item(2, { workItemType: 'Task', parentId: 1, title: 'October 2026 | Release', originalEstimate: 8, completedWork: 11 })
  const data = azureInsights([story, story, task, item(3, { title: 'Other story', originalEstimate: 1000, completedWork: 999 })], '2026-10', '2026-10-17')
  assert.equal(data.plan.value, 8); assert.equal(data.actual.value, 11); assert.equal(data.variance, 3)
  assert.equal(data.flags.length, 1)
  assert.equal(data.trend.at(-1).plan.value, 8); assert.equal(data.trend.at(-1).actual.value, 11)
  assert.equal(data.resources[0].actual.value, 11)
})
test('Task fields remain the sole monthly source when User Story fields are blank', () => {
  const data = azureInsights([item(1), item(2, { title: 'October 2026 | Release', workItemType: 'Task', parentId: 1, originalEstimate: 20, completedWork: 0 })], '2026-10', '2026-10-17')
  assert.equal(data.plan.value, 20); assert.equal(data.actual.value, 0); assert.equal(data.variance, -20)
  assert.equal(data.trend.at(-1).actual.value, 0)
  assert.equal(data.plan.count, 1); assert.equal(data.plan.total, 1)
})
test('month-named Tasks contribute monthly trend under any parent; excludes Removed and tasks without a month', () => {
  const data = azureInsights([item(1), item(2, { state: 'Removed', originalEstimate: 1000 }), item(3, { title: 'October 2026 | Other', workItemType: 'Task', parentId: 77, completedWork: 99 }), item(4, { title: 'No month', workItemType: 'Task', parentId: 1, completedWork: 30 }), item(5, { title: 'Unrelated', workItemType: 'Task', parentId: 78, completedWork: 7 })], '2026-10', '2026-10-17')
  assert.equal(data.timeWritingStories.length, 1); assert.equal(data.trend.at(-1).actual.value, 99); assert.equal(data.unmappedTasks, 1)
  assert.equal(timeWritingMonth('october 2026 | Release'), '2026-10')
  assert.equal(timeWritingMonth('Release October 2026'), '2026-10', 'month and year may also end the title')
  assert.equal(timeWritingMonth('Release October 2026 plan'), undefined, 'a month in the middle is not used')
})
test('Time Writing stories are filtered by selected-month child task and roll up to their Epic', () => {
  const epic = item(10, { workItemType: 'Epic', title: 'Epic A' })
  const feature = item(11, { workItemType: 'Feature', title: 'Feature A', parentId: 10 })
  const october = item(12, { parentId: 11 })
  const november = item(13, { parentId: 11, title: 'November 2026 | Release', originalEstimate: 20, completedWork: 10 })
  const octoberTask = item(14, { workItemType: 'Task', parentId: 12, title: 'October 2026 | Release', originalEstimate: 10, completedWork: 7 })
  const novemberTask = item(15, { workItemType: 'Task', parentId: 13, title: 'November 2026 | Release' })
  const data = azureInsights([epic, feature, october, november, octoberTask, novemberTask], '2026-10', '2026-10-17')
  assert.deepEqual(data.storiesForMonth.map(row => row.id), [12])
  assert.equal(data.plan.value, 10); assert.equal(data.actual.value, 7)
  assert.equal(data.epicBreakdown.length, 1); assert.equal(data.epicBreakdown[0].epic.id, 10)
  assert.equal(data.epicBreakdown[0].tasks, 1)
})
test('NPRA remains separately reported and does not reduce utilization capacity', () => {
  const epic = item(10, { workItemType: 'Epic', title: 'Epic A' })
  const feature = item(11, { workItemType: 'Feature', title: 'NPRA Feature', parentId: 10, assignedTo: 'QE', tags: 'Release; NPRA Hours', originalEstimate: 16 })
  const story = item(12, { parentId: 11 })
  const task = item(13, { workItemType: 'Task', parentId: 12, title: 'October 2026 | Release', originalEstimate: 10, completedWork: 5 })
  const data = azureInsights([epic, feature, story, task], '2026-10', '2026-10-17')
  assert.equal(data.workingDays, 22); assert.equal(data.dayCapacity, 176); assert.equal(data.capacity, 176)
  assert.equal(data.npra.value, 16); assert.equal(data.available, 5); assert.equal(data.utilization, 3520)
  assert.equal(data.epicBreakdown[0].npra.value, 16); assert.equal(data.resources[0].utilization, 3520)
})
test('NPRA remains exact-tagged and does not change the new utilization calculation', () => {
  const feature = item(1, { workItemType: 'Feature', tags: 'Not NPRA Hours', originalEstimate: 999 })
  const story = item(2, { parentId: 1 })
  const task = item(3, { workItemType: 'Task', parentId: 2, title: 'October 2026 | Release', originalEstimate: 1, completedWork: 1 })
  assert.equal(azureInsights([feature, story, task], '2026-10', '2026-10-17').npra.value, null)
  const before = azureInsights([feature, story, task], '2026-10', '2026-10-17').utilization
  feature.tags = 'NPRA Hours'; feature.originalEstimate = 176
  assert.equal(azureInsights([feature, story, task], '2026-10', '2026-10-17').utilization, before)
})
test('utilization uses funded month hours over all Actuals less Absence Actuals under Epic 37778', () => {
  const absenceEpic = item(37778, { workItemType: 'Epic', title: 'Absence' })
  const absenceFeature = item(2, { workItemType: 'Feature', parentId: 37778 })
  const absenceStory = item(3, { parentId: 2 })
  const absenceTask = item(4, { workItemType: 'Task', parentId: 3, title: 'October 2026 | Absence', completedWork: 16 })
  const fundedEpic = item(10, { workItemType: 'Epic', title: 'Funded' })
  const fundedFeature = item(11, { workItemType: 'Feature', parentId: 10 })
  const fundedStory = item(12, { parentId: 11 })
  const fundedTask = item(13, { workItemType: 'Task', parentId: 12, title: 'October 2026 | Funded', completedWork: 80 })
  const data = azureInsights([absenceEpic, absenceFeature, absenceStory, absenceTask, fundedEpic, fundedFeature, fundedStory, fundedTask], '2026-10', '2026-10-17')
  assert.equal(data.dayCapacity, 176)
  assert.equal(data.actual.value, 96)
  assert.equal(data.absence.value, 16)
  assert.equal(data.available, 80)
  assert.equal(data.utilization, 220)
})
test('closures use India month and completed state; overdue excludes completed items and today', () => {
  const data = azureInsights([item(1, { workItemType: 'Feature', state: 'Closed', closedDate: '2026-09-30T20:00:00Z', targetDate: '2026-10-01' }), item(2, { workItemType: 'Feature', state: 'Active', closedDate: '2026-10-01', targetDate: '2026-10-16' }), item(3, { targetDate: '2026-10-17' })], '2026-10', '2026-10-17')
  assert.equal(data.closures.length, 1); assert.equal(data.overdue.length, 1)
  assert.equal(indiaMonth('2026-12-31T20:00:00Z'), '2027-01')
  assert.throws(() => azureInsights([], '', '2026-10-17'))
})
test('source maps numeric scheduling fields preserving zero and rejecting string/negative/nonfinite estimates', () => {
  const config = { organization: 'org', project: 'project', team: 'team' }
  const row = mapAzureWorkItem({ id: 1, fields: { 'Microsoft.VSTS.Scheduling.OriginalEstimate': 0, 'Microsoft.VSTS.Scheduling.CompletedWork': 12, 'Microsoft.VSTS.Scheduling.RemainingWork': 3, 'System.CreatedDate': '2026-10-01' } }, config)
  assert.equal(row.originalEstimate, 0); assert.equal(row.completedWork, 12); assert.equal(row.remainingWork, 3); assert.equal(row.createdDate, '2026-10-01')
  for (const bad of ['20', -1, Infinity]) assert.equal(mapAzureWorkItem({ id: 1, fields: { 'Microsoft.VSTS.Scheduling.OriginalEstimate': bad } }, config).originalEstimate, undefined)
})
test('dashboard consumes shared Azure workspace only and removes sample/local metrics and assumed capacity', () => {
  const source = readFileSync(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8')
  assert.match(source, /personMonths\(azure\.items, months, today, settings\)/, 'the dashboard reads the shared Azure Time Writing items')
  assert.match(source, /const chartItems = filtered \? azure\.items\.filter\(/, 'charts: the shared items, narrowed to the filtered people')
  assert.doesNotMatch(source, /store\.state\.(?!capacitySettings)|capacityUtilization|\['May',64/)
})
