import test from 'node:test'
import assert from 'node:assert/strict'
import { adminHealth, searchSettings, settingsIndex } from '../src/adminOverview.ts'
import { settingsPages } from '../src/settingsTabs.ts'

const facts = { policy: true, toolOwner: true, epicSetups: 1, sharedFeatureSetups: 2, ioccBulkEpic: true, unsaved: false, gitConnected: true, gitReadOnly: false }

test('Admin overview: open Get started steps and shared-setup checks, required first, each with its fix (ADM-01, TC-ADM-01)', () => {
  assert.deepEqual(adminHealth([], facts), [])
  const steps = [{ id: 'pat', title: 'PAT', why: 'needed', how: [], state: 'todo', required: true, tab: 'connections', section: 'servers' }, { id: 'streams', title: 'Streams', why: 'optional', how: [], state: 'todo', required: false, tab: 'connections', section: 'mapping' }, { id: 'git', title: 'Git', why: '', how: [], state: 'done', required: true }]
  const items = adminHealth(steps, { ...facts, policy: true, toolOwner: false, unsaved: true, ioccBulkEpic: false, epicSetups: 0 })
  assert.deepEqual(items.map((item) => [item.id, item.tone]), [['step:pat', 'todo'], ['unsaved', 'warn'], ['toolowner', 'warn'], ['step:streams', 'info'], ['iocc-epic', 'info'], ['epic-setup', 'info']])
  assert.deepEqual(items.find((item) => item.id === 'iocc-epic').fix, { tab: 'options', section: 'bulk', label: 'Bulk creation Epics' })
  assert.deepEqual(items[0].fix, { tab: 'connections', section: 'servers', label: 'Open' })
  assert.ok(adminHealth([], { ...facts, policy: false }).some((item) => item.id === 'access'), 'no access roles yet')
})

test('Search settings: by name or what it affects, every page reachable (ADM-03, TC-ADM-01)', () => {
  assert.equal(searchSettings('pat')[0].label, 'Servers and PATs')
  assert.equal(searchSettings('IOCC bulk')[0].label, 'Bulk creation Epics')
  assert.ok(searchSettings('master data').some((entry) => entry.label === 'Value lists'), 'old names still find the new place')
  assert.deepEqual(searchSettings('zzz'), [])
  assert.equal(searchSettings('').length, settingsIndex.length)
  for (const page of settingsPages) assert.ok(settingsIndex.some((entry) => entry.tab === page.key), `${page.label} is in the index`)
})

test('ADM-05: bulk creation Epics without a shared Feature setup, and shared setups without a Feature DoD (TC-ADM-03)', async () => {
  const { setupGaps } = await import('../src/adminOverview.ts')
  const setup = (epicId, featureDoD, extra = {}) => ({ epicId, epicTitle: '', featureDoD, stories: [], timeWritingStory: { title: '{feature} - Time Writing', description: '', assignedTo: '', areaPath: '', iterationPath: '' }, task: { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' }, ...extra })
  const shared = { schema: 1, kind: 'feature-setup', epics: [setup(13946, 'DoD'), setup(5, ''), setup(6, '', { inherits: ['featureDoD'] })] }
  assert.deepEqual(setupGaps(shared, [{ stream: 'DP', epicId: 13946 }, { stream: 'IOCC', epicId: 77 }, { stream: 'IOCC', epicId: undefined }]), { bulkWithoutSetup: [{ stream: 'IOCC', epicId: 77 }], withoutDoD: [5, 6] }, 'an unset bulk Epic is reported by its own check')
  const withDefaults = { ...shared, defaults: { featureDoD: 'All Epics DoD' } }
  assert.deepEqual(setupGaps(withDefaults, [{ stream: 'IOCC', epicId: 77 }]), { bulkWithoutSetup: [], withoutDoD: [5] }, 'All Epics gives a setup and a DoD to whoever inherits it; an own empty DoD stays empty')
  assert.deepEqual(setupGaps(null, [{ stream: 'DP', epicId: 13946 }]), { bulkWithoutSetup: [{ stream: 'DP', epicId: 13946 }], withoutDoD: [] })
  const items = adminHealth([], { ...facts, bulkWithoutSetup: [{ stream: 'IOCC', epicId: 77 }], withoutDoD: [5, 6] })
  assert.deepEqual(items.map((item) => [item.id, item.tone]), [['bulk-setup:IOCC', 'warn'], ['no-dod', 'warn']])
  assert.match(items[0].title, /IOCC bulk creation Epic #77 has no Feature setup/); assert.match(items[1].title, /#5, #6/)
  assert.deepEqual(items[1].fix, { tab: 'epics', section: 'setup', label: 'Feature setup' })
})
