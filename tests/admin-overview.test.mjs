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
