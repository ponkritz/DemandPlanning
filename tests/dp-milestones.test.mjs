import test from 'node:test'
import assert from 'node:assert/strict'
import { dpMonthCounts, ddtMonthOf, dpReleaseName, uniqueReleases } from '../src/dpMilestones.ts'

const item = (id, fields) => ({ key: `dp/${id}`, id, title: `Release ${id}`, workItemType: 'Release', state: 'Active', fields })
const items = [
  item(1, { 'Custom.DDTDate': '2026-10-05T00:00:00Z', 'Custom.DDTStatus': 'Done', 'Custom.DRfHDate': '2026-10-02T00:00:00Z', 'Custom.DRfHStatus': 'done ', PsName: 'RSGMS', Release: '3.0.0.2' }),
  item(2, { DDTDate: '2026-10-20T00:00:00Z', DDTStatus: 'In Progress', DRPCDate: '2026-10-21T00:00:00Z', DRPCStatus: 'Done' }),
  item(3, { DDTDate: '2026-09-30T00:00:00Z', DDTStatus: 'Done', DRPEDate: '2026-10-01T00:00:00Z', DRPEStatus: 'Done' }),
  item(4, { DDTDate: '2026-10-31T22:00:00Z', DDTStatus: 'DONE' }),
  item(5, { DRfHDate: '2026-10-10T00:00:00Z', DRfHStatus: 'Not done' }),
]

test('DP counts for a month: Completed = releases with DDT Done in the month; Supported = unique releases with any milestone Done in the month', () => {
  const october = dpMonthCounts(items, '2026-10', 'UTC')
  assert.deepEqual(october.completed.map((entry) => entry.item.id), [1, 4])
  assert.deepEqual(october.milestones.map((entry) => `${entry.item.id}:${entry.milestone}`), ['3:DRPE', '1:DRfH', '1:DDT', '2:DRPC', '4:DDT'], 'five milestones Done in October')
  assert.deepEqual(october.supported.map((entry) => `${entry.item.id}:${entry.milestones.map((milestone) => milestone.milestone).join('+')}`), ['3:DRPE', '1:DRfH+DDT', '2:DRPC', '4:DDT'], 'four releases: #1 passed SFV and DT and counts once')
  assert.equal(october.supported.find((entry) => entry.item.id === 1).date, '2026-10-05T00:00:00Z', 'a release is dated by its latest milestone in the month')
  assert.deepEqual(october.byMilestone, { DDT: 2, DRfH: 1, DRPC: 1, DRPE: 1 })
  assert.deepEqual(dpMonthCounts(items, '2026-09', 'UTC').completed.map((entry) => entry.item.id), [3])
  // In India (UTC+5:30) the DDT of #4 (31 Oct 22:00 UTC) is already 1 November.
  assert.deepEqual(dpMonthCounts(items, '2026-10', 'Asia/Kolkata').completed.map((entry) => entry.item.id), [1])
})

test('the DP table month is the DDT Date month; a row without DDT Date has none; release name from PsName and Release', () => {
  assert.equal(ddtMonthOf(items[0], 'UTC'), '2026-10')
  assert.equal(ddtMonthOf(items[4], 'UTC'), undefined)
  assert.deepEqual(dpReleaseName(items[0]), { name: 'RSGMS', release: '3.0.0.2' })
  assert.deepEqual(dpReleaseName(items[1]), { name: 'Release 2', release: '' })
})

test('DP milestones carry the team names: DT, SFV, PRD, RPE', async () => {
  const { dpMilestoneNames, dpMilestoneLabel } = await import('../src/dpMilestones.ts')
  assert.deepEqual(Object.fromEntries(Object.entries(dpMilestoneNames).map(([key, value]) => [key, value.short])), { DDT: 'DT', DRfH: 'SFV', DRPC: 'PRD', DRPE: 'RPE' })
  assert.equal(dpMilestoneNames.DRfH.long, 'Start of Verification / Start of Hardening')
  assert.equal(dpMilestoneLabel('DRPE'), 'RPE')
})

test('Supported Releases are unique by PsName + Release: two rows of the same release count once; rows without them by work item', () => {
  const rows = [
    item(11, { PsName: 'RSGMS', Release: '3.0.0.2', DRfHDate: '2026-10-02T00:00:00Z', DRfHStatus: 'Done' }),
    item(12, { 'Custom.PsName': 'rsgms', 'Custom.Release': '3.0.0.2', DDTDate: '2026-10-09T00:00:00Z', DDTStatus: 'Done' }),
    item(13, { PsName: 'RSGMS', Release: '3.1', DRPCDate: '2026-10-03T00:00:00Z', DRPCStatus: 'Done' }),
    item(14, { DRPEDate: '2026-10-04T00:00:00Z', DRPEStatus: 'Done' }), item(15, { DRPEDate: '2026-10-05T00:00:00Z', DRPEStatus: 'Done' }),
  ]
  const counts = dpMonthCounts(rows, '2026-10', 'UTC')
  assert.equal(counts.milestones.length, 5); assert.equal(counts.supported.length, 4)
  assert.deepEqual(counts.supported.map((entry) => [entry.item.id, entry.release, entry.milestones.length]), [[13, '3.1', 1], [14, '', 1], [15, '', 1], [11, '3.0.0.2', 2]])
  assert.equal(counts.completed.length, 1)
  assert.deepEqual(uniqueReleases([]), [])
})
