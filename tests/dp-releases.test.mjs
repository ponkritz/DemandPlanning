import test from 'node:test'
import assert from 'node:assert/strict'
import { dhfiDateOf, dhfiFor, dpReleases, fieldOf, indexDhfi, namesRelease, pedestalItems, titleRelease } from '../src/dpReleases.ts'
import { matchScore } from '../src/releaseSource.ts'

const release = (id, title, fields = {}, extra = {}) => ({ key: `org/dhp/${id}`, id, title, workItemType: 'Release', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'DHP', syncedAt: '', fields, ...extra })
const doc = (id, title, extra = {}) => ({ key: `org/vault/${id}`, id, title, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'DHP.Vault', syncedAt: '', ...extra })
const feature = (id, title) => ({ key: `org/qms/${id}`, id, title, workItemType: 'Feature', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'QMS', syncedAt: '' })

test('Pedestal fields are read by name whatever the reference prefix', () => {
  const item = release(1, 'x', { 'Custom.ReleaseIntent': 'Major', 'Philips.DRPEStatus': 'Done', 'PI': 3, 'Custom.Year': '' })
  assert.equal(fieldOf(item, 'ReleaseIntent'), 'Major')
  assert.equal(fieldOf(item, 'DRPEStatus'), 'Done')
  assert.equal(fieldOf(item, 'PI'), '3')
  assert.equal(fieldOf(item, 'Year'), undefined)
  assert.equal(fieldOf(item, 'Release'), undefined, 'ReleaseIntent is not Release')
})

test('a Pedestal Release Title names the release and its version', () => {
  assert.deepEqual(titleRelease('RSGMS 3.0.0.2'), { name: 'RSGMS', release: '3.0.0.2' })
  assert.deepEqual(titleRelease('Patient Monitor v2.1 (PI 26.3)'), { name: 'Patient Monitor', release: '2.1' }, 'the marked version counts, not the PI')
  assert.deepEqual(titleRelease('Viewer - Release 3.0'), { name: 'Viewer', release: '3.0' })
  assert.deepEqual(titleRelease('Dose Planning'), { name: 'Dose Planning', release: '' })
})

test('a DHFI document names a release ignoring spaces inside words, with the exact version', () => {
  assert.ok(namesRelease('DHFI RS GMS 3.0.0.2 Verification', 'RSGMS', '3.0.0.2'))
  assert.ok(namesRelease('RS-GMS v3.0.0.2', 'RS GMS', '3.0.0.2'))
  assert.ok(namesRelease('Patient Monitor 2.1.0 report', 'Patient Monitor', '2.1'))
  assert.ok(!namesRelease('Patient Monitor 2.10 report', 'Patient Monitor', '2.1'))
  assert.ok(!namesRelease('RSGMS 3.0.0.1', 'RSGMS', '3.0.0.2'))
  assert.ok(!namesRelease('Other 3.0.0.2', 'RSGMS', '3.0.0.2'))
  assert.deepEqual(dhfiFor('RSGMS', '3.0.0.2', [doc(1, 'RS GMS 3.0.0.2 DHF index'), doc(2, 'RSGMS 3.0.0.1')]).map((item) => item.id), [1])
})

test('a DHFI document is dated by its approval date, else its Closed Date', () => {
  assert.equal(dhfiDateOf(doc(1, 'x', { approvalDate: '2026-09-02T00:00:00Z', closedDate: '2026-09-09T00:00:00Z' })), '2026-09-02T00:00:00Z')
  assert.equal(dhfiDateOf(doc(1, 'x', { fields: { 'Custom.AuthorApprovalDate': '2026-09-03T00:00:00Z' } })), '2026-09-03T00:00:00Z')
  assert.equal(dhfiDateOf(doc(1, 'x', { closedDate: '2026-09-09T00:00:00Z' })), '2026-09-09T00:00:00Z')
  assert.equal(dhfiDateOf(doc(1, 'x')), undefined)
})

test('DP releases: every Pedestal Release, dated by its DHFI documents and matched to a Feature', () => {
  const pedestal = [release(100, 'RSGMS 3.0.0.2', { 'Custom.ReleaseIntent': 'Minor' }), release(101, 'Viewer 2.0'), release(102, 'Removed one 1.0', {}, { state: 'Removed' })]
  const dhfi = [doc(1, 'RS GMS 3.0.0.2 verification', { approvalDate: '2026-09-02T00:00:00Z' }), doc(2, 'RS GMS 3.0.0.2 index', { closedDate: '2026-10-05T00:00:00Z' }), doc(3, 'Viewer 2.0 plan')]
  const backlog = [feature(10, 'DP | RS GMS | v3.0.0.2'), feature(11, 'DP | RSGMS | v3.0.0.1')]
  const releases = dpReleases(pedestal, dhfi, backlog, { threshold: 80 }, 'UTC')
  assert.deepEqual(releases.map((entry) => [entry.name, entry.release, entry.documents, entry.month]), [['RSGMS', '3.0.0.2', 2, '2026-10'], ['Viewer', '2.0', 1, undefined]])
  const [rsgms, viewer] = releases
  assert.equal(rsgms.approvalDate, '2026-10-05T00:00:00Z', 'the latest dated document counts')
  assert.equal(rsgms.pedestal.values.ReleaseIntent, 'Minor')
  assert.deepEqual(rsgms.features.map((item) => item.id), [10], 'spacing inside the name does not matter; the other version does not count')
  assert.equal(rsgms.match.score, 100)
  assert.equal(viewer.month, undefined, 'a DHFI document without a date gives no month')
})

test('the fuzzy match ignores spacing inside words and never takes another version as the same release', () => {
  assert.ok(matchScore('DP | RS GMS Viewer | v3.0.0.2', 'RSGMS', '3.0.0.2') >= 95)
  assert.equal(matchScore('RS-GMS 3.0.0.2 release', 'RS GMS', '3.0.0.2'), 100)
  assert.ok(matchScore('DP | RSGMS | v3.0.0.1', 'RSGMS', '3.0.0.2') < 80, 'another patch version stays below the threshold')
  assert.ok(matchScore('DP | Project Name | v3.0.0', 'RSGAMS', '3.0.0.2') < 50)
  assert.ok(matchScore('DP | Dose Planning Lite | v2.0', 'Dose Planning', '2.0') < matchScore('DP | Dose Planning | v2.0', 'Dose Planning', '2.0'), 'the plain Feature wins over the Lite one')
  assert.ok(matchScore('Dose Planning | v2.1', 'Dose Planning Lite', '2.1') < 80, 'a Feature lacking a word of the name is not a match')
  assert.equal(matchScore('DP | PM | v2.0', 'PM', '2.0'), 100, 'a two-letter name matches as a whole part')
})

test('Pedestal items come from the fetched views, each once, with values under their column names', () => {
  const a = release(1, 'A 1.0', { 'Philips.ProgramIncrement': '26.3' }), other = { ...release(2, 'Doc'), workItemType: 'Document' }
  const items = pedestalItems([{ connectionId: 'dp', items: [release(9, 'own')] }, { connectionId: 'dhp', columns: [{ ref: 'Philips.ProgramIncrement', name: 'PI' }], items: [a, other] }, { connectionId: 'copy', items: [a] }], 'dp')
  assert.deepEqual(items.map((item) => item.id), [1])
  assert.equal(fieldOf(items[0], 'PI'), '26.3')
})

test('dpReleases returns the same result for the same inputs and indexes the DHFI list by version', () => {
  const pedestal = [release(1, 'RSGMS 3.0.0.2')], dhfi = [doc(1, 'RS GMS 3.0.0.2', { approvalDate: '2026-09-02T00:00:00Z' })], backlog = []
  const first = dpReleases(pedestal, dhfi, backlog, { threshold: 80 }, 'UTC')
  assert.equal(dpReleases(pedestal, dhfi, backlog, { threshold: 80 }, 'UTC'), first, 'cached')
  assert.notEqual(dpReleases(pedestal, [...dhfi], backlog, { threshold: 80 }, 'UTC'), first, 'new data, new result')
  const index = indexDhfi([doc(1, 'RS GMS 3.0.0.2 and 3.0.0.1'), doc(2, 'Plain report')])
  assert.deepEqual([...index.byVersion.keys()].sort(), ['3.0.0.1', '3.0.0.2'])
  assert.deepEqual(dhfiFor('RSGMS', '3.0.0.1', index).map((item) => item.id), [1])
  assert.deepEqual(dhfiFor('Plain', '', index).map((item) => item.id), [2], 'a release without a version scans every document')
})
