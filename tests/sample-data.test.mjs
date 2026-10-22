import test from 'node:test'
import assert from 'node:assert/strict'
import { sampleDataset } from '../src/sampleData.ts'
import { capacityModel } from '../src/capacity.ts'
import { azureInsights } from '../src/azureInsights.ts'
import { releaseRegister, completedReleases } from '../src/releaseSource.ts'

const config = { organization: 'Org', project: 'Quality', team: 'InD Quality' }

test('the synthetic sample is deterministic and exercises every model the pages use', () => {
  const first = sampleDataset(config, '2026-10'), second = sampleDataset(config, '2026-10')
  assert.deepEqual(first.items.map((item) => [item.id, item.originalEstimate, item.completedWork]), second.items.map((item) => [item.id, item.originalEstimate, item.completedWork]))
  assert.equal(new Set(first.items.map((item) => item.key)).size, first.items.length, 'keys are unique')
  assert.ok(first.items.some((item) => item.id === 37778 && item.workItemType === 'Epic'), 'absence Epic uses the default id')
  const capacity = capacityModel(first.items, '2026-10')
  assert.equal(capacity.people.length, 6); assert.ok(capacity.streams.length >= 5)
  assert.ok(capacity.totals.absence > 0); assert.ok(capacity.counts.overloaded + capacity.counts.hasCapacity + capacity.counts.balanced === 6)
  const insights = azureInsights(first.items, '2026-10', '2026-10-17')
  assert.ok(insights.monthlyTasks.length > 10); assert.ok(insights.trend.every((point) => point.plan.value != null)); assert.ok(insights.closures.length > 0)
  const register = releaseRegister(first.releaseSource.items, first.items)
  assert.deepEqual([...new Set(register.map((release) => release.name))].sort(), ['Care Pathways', 'Clinical Library', 'Dose Planning', 'Operations Console'], 'only the releasing products appear in the release source')
  assert.equal(completedReleases(register, '2026-10').length, 4, 'one release per releasing product is approved in the selected month')
  assert.equal(first.releasePlans.length, 6); assert.ok(first.releasePlans.every((plan) => plan.sample && plan.milestones.DT))
  assert.deepEqual([...new Set(first.items.filter((item) => item.workItemType === 'Epic').map((item) => item.title))].filter((title) => title !== 'Absence & Leave'), ['DP', 'CP', 'Serviceability', 'Content', 'IOCC', 'ECP 1', 'ECP 2', 'QMS', 'CAPA']); assert.ok(register.some((release) => release.tracked) && register.some((release) => !release.tracked))
  assert.equal(first.scope.itemKeys.length, first.items.length)
})
