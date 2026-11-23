import test from 'node:test'
import assert from 'node:assert/strict'
import { addGroup, deleteReason, emptyLayout, hideReason, isHidden, mergeMenuLayoutText, movePage, parseMenuLayout, placePage, serializeMenuLayout, setHidden } from '../src/menuLayout.ts'
import { pageListChange } from '../src/onDemand.ts'

// PGB-19, PGB-20: hiding a page (shared, in menu-layout.json) instead of removing it; deleting is the Tool Owner's only.
// GIT-21: a newer menu layout makes the app read the pages it does not know and drop the ones deleted.
const none = () => false
const viewer = (email, manager = false, can = none) => ({ email, can, readOnly: false, manager })

function layout() {
  const { layout: withGroup, id } = addGroup(emptyLayout(), 'Quality', { owners: ['lead@example.com'] })
  return { id, layout: placePage(placePage(withGroup, 'supplier-issues', { type: 'table', group: id, owners: ['keeper@example.com'] }), 'conq', {}) }
}

test('PGB-19: a page is hidden and shown for everyone — a flag of its placement, kept by moves and edits, merged like its other fields (TC-PGB-15)', () => {
  const { layout: base } = layout()
  const hidden = setHidden(base, 'supplier-issues', true)
  assert.equal(isHidden(hidden, 'supplier-issues'), true)
  assert.equal(isHidden(hidden, 'conq'), false)
  const text = serializeMenuLayout(hidden)
  assert.equal(isHidden(parseMenuLayout(text), 'supplier-issues'), true)
  assert.ok(!serializeMenuLayout(base).includes('hidden'), 'a layout without hidden pages is written as before')
  assert.equal(isHidden(placePage(hidden, 'supplier-issues', { icon: '★' }), 'supplier-issues'), true, 'an edit keeps it hidden')
  assert.equal(isHidden(movePage(hidden, [{ id: 'supplier-issues', name: 'Supplier issues' }], 'supplier-issues', 1), 'supplier-issues'), true)
  assert.equal(isHidden(setHidden(hidden, 'supplier-issues', false), 'supplier-issues'), false)
  // One person hides it while another changes its icon: both stay.
  const mine = serializeMenuLayout(hidden), theirs = serializeMenuLayout(placePage(base, 'supplier-issues', { icon: '★' }))
  const merged = parseMenuLayout(mergeMenuLayoutText(serializeMenuLayout(base), mine, theirs, true))
  assert.equal(merged.pages['supplier-issues'].hidden, true)
  assert.equal(merged.pages['supplier-issues'].icon, '★')
})

test('PGB-19, PGB-20: who may hide and show (Tool Owner, page and group co-owners, Set up On-Demand pages in On-Demand) and who may delete (Tool Owner only) (TC-PGB-15)', () => {
  const { layout: base } = layout()
  const tool = viewer('owner@example.com', true), lead = viewer('lead@example.com'), keeper = viewer('keeper@example.com'), other = viewer('nobody@example.com')
  const setup = viewer('nobody@example.com', false, (action) => action === 'ondemand.setup')
  for (const who of [tool, lead, keeper]) assert.equal(hideReason(who, base, 'supplier-issues'), '')
  assert.match(hideReason(other, base, 'supplier-issues'), /Only a Tool Owner or a co-owner of this page or of the group “Quality” can hide or show this page/)
  assert.equal(hideReason(setup, base, 'conq'), '', 'in On-Demand the setup right hides and shows')
  assert.notEqual(hideReason(setup, base, 'supplier-issues'), '')
  assert.equal(deleteReason(tool), '')
  for (const who of [lead, keeper, setup, other]) assert.match(deleteReason(who), /Only a Tool Owner .* can delete a page\. Hide it instead/)
  // Fail closed without the roles file.
  assert.match(hideReason({ ...tool, readOnly: true }, base, 'conq'), /Read only/)
  assert.match(deleteReason({ ...tool, readOnly: true }), /Read only/)
})

test('GIT-21: with a newer menu layout only the pages not known here are read; a deleted one is dropped unless it is open with unsaved edits (TC-GIT-13)', () => {
  const listed = [{ id: 'conq', rows: true }, { id: 'supplier-issues', rows: false }, { id: 'audits', rows: false }]
  assert.deepEqual(pageListChange(['conq', 'supplier-issues', 'old'], listed), { read: [{ id: 'audits', rows: false }], dropped: ['old'] })
  assert.deepEqual(pageListChange(['conq', 'supplier-issues', 'old'], listed, (id) => id === 'old'), { read: [{ id: 'audits', rows: false }], dropped: [] })
  assert.deepEqual(pageListChange(['conq', 'supplier-issues', 'audits'], listed), { read: [], dropped: [] })
})
