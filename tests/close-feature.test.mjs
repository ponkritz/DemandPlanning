import test from 'node:test'
import assert from 'node:assert/strict'
import { closeFeatureItems, featureClosePlan, featureCloseQuestion } from '../src/closeChain.ts'

const base = { organization: 'org', project: 'Quality', state: 'Active', assignedTo: '', areaPath: 'Quality\\A', iterationPath: 'Quality', tags: '', url: '', syncedAt: '' }
const item = (id, workItemType, title, extra = {}) => ({ ...base, key: `org/quality/${id}`, id, workItemType, title, ...extra })
const me = { email: 'ana@x.com', name: 'Ana Costa' }
const ana = { assignedTo: 'Ana Costa', assignedToEmail: 'ana@x.com' }, ben = { assignedTo: 'Ben Okafor', assignedToEmail: 'ben@x.com' }
const config = { organization: 'org', project: 'Quality', baseUrl: 'https://dev.azure.com' }

test('ACT-18: Close Feature closes only my open items, children first; the Feature too when nothing else is open (TC-ACT-14)', () => {
  const items = [
    item(2, 'Feature', 'CP | Care', { ...ana }),
    item(3, 'User Story', 'CP | Care - Time Writing', { parentId: 2, ...ana }),
    item(4, 'Task', 'November 2026 | CP | Care', { parentId: 3, ...ana }),
    item(5, 'User Story', 'SFV review', { parentId: 2, ...ana, state: 'New' }),
    item(6, 'Task', 'Old month', { parentId: 3, ...ana, state: 'Closed' }),
    item(7, 'Task', 'Removed', { parentId: 5, ...ben, state: 'Removed' }),
  ]
  const plan = featureClosePlan(items, 2, me)
  assert.deepEqual(plan.close.map((entry) => entry.id), [4, 3, 5, 2], 'Task before its story, the Feature last; closed and removed items left alone')
  assert.deepEqual(plan.kept, [])
  assert.match(featureCloseQuestion(plan), /set 4 of your items to Closed/)
  assert.equal(featureClosePlan(items, 3, me), null, 'only a Feature')
})

test('ACT-18: open work of others keeps their story and the Feature open; a Feature of someone else is never closed (TC-ACT-14)', () => {
  const items = [
    item(2, 'Feature', 'CP | Care', { ...ana }),
    item(3, 'User Story', 'CP | Care - Time Writing', { parentId: 2, ...ana }),
    item(4, 'Task', 'November 2026 | CP | Care', { parentId: 3, ...ana }),
    item(8, 'Task', 'November 2026 | CP | Care', { parentId: 3, ...ben }),
    item(5, 'User Story', 'SFV review', { parentId: 2, ...ben }),
    item(9, 'Task', 'Review', { parentId: 5, ...ana }),
  ]
  const plan = featureClosePlan(items, 2, me)
  assert.deepEqual(plan.close.map((entry) => entry.id), [4, 9], 'only my Tasks')
  assert.deepEqual(plan.kept.map((entry) => entry.item.id), [3, 2], 'my story and Feature stay open because of Ben\'s open work')
  assert.match(plan.kept[0].reason, /#8/)
  const theirs = featureClosePlan([item(2, 'Feature', 'CP', { ...ben }), item(4, 'Task', 'T', { parentId: 2, ...ana })], 2, me)
  assert.deepEqual(theirs.close.map((entry) => entry.id), [4])
  assert.match(theirs.kept[0].reason, /assigned to Ben Okafor/)
})

test('ACT-18: closing runs New → Active → Closed for stories and Features; a failure keeps everything above it open (TC-ACT-14)', async () => {
  const items = [
    item(2, 'Feature', 'CP | Care', { ...ana, state: 'New' }),
    item(3, 'User Story', 'TW', { parentId: 2, ...ana, state: 'New' }),
    item(4, 'Task', 'November 2026 | CP | Care', { parentId: 3, ...ana }),
    item(5, 'User Story', 'Other', { parentId: 2, ...ana }),
  ]
  const writes = []
  const write = async (_config, _pat, id, update) => { writes.push(`${id}:${update.state}`); return { ...items.find((entry) => entry.id === id), state: update.state } }
  const done = await closeFeatureItems(config, 'pat', featureClosePlan(items, 2, me), write)
  assert.deepEqual(writes, ['4:Closed', '3:Active', '3:Closed', '5:Closed', '2:Active', '2:Closed'])
  assert.deepEqual(done.closed.map((entry) => entry.state), ['Closed', 'Closed', 'Closed', 'Closed'])
  writes.length = 0
  const failing = async (_config, _pat, id, update) => { if (id === 4) throw new Error('denied'); writes.push(`${id}:${update.state}`); return { ...items.find((entry) => entry.id === id), state: update.state } }
  const partial = await closeFeatureItems(config, 'pat', featureClosePlan(items, 2, me), failing)
  assert.deepEqual(writes, ['5:Closed'], 'the story above the failed Task and the Feature are not written')
  assert.deepEqual(partial.failed, ['#4: denied'])
  assert.equal(partial.skipped.length, 2)
})
