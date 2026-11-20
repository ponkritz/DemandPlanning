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
