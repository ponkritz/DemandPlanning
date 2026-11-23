import test from 'node:test'
import assert from 'node:assert/strict'
import { addGroup, addPageReason, builtInGroups, emptyLayout, groupReason, groupsForAdding, kindOf, menuGroups, mergeMenuLayoutText, mergeOwners, moveGroup, movePage, moveReason, ownersInput, pageMenuReason, pageRights, pagesOfGroup, parseMenuLayout, placePage, placementOf, readOnlyMenuReason, removeGroup, removeGroupReason, removePlacement, renameGroup, serializeMenuLayout, setGroupSettings } from '../src/menuLayout.ts'
import { canManagePages, defaultPolicy, parseAccess, rightsFor, serializeAccess } from '../src/access.ts'
import { conqPage, emptyPage, parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { fileLabel } from '../src/gitWatch.ts'

const owner = 'tool.owner@example.com', groupOwner = 'group.lead@example.com', pageOwner = 'page.keeper@example.com', nobody = 'someone@example.com'
const pages = [conqPage(), emptyPage('supplier-issues', 'Supplier issues'), emptyPage('audit-log', 'Audit log')]
function layout() {
  let next = emptyLayout()
  const quality = addGroup(next, 'Quality', { owners: [groupOwner] })
  next = placePage(quality.layout, 'supplier-issues', { type: 'table', group: quality.id, icon: '⚑', owners: [pageOwner] }, pages.map((page) => page.id))
  return { layout: next, quality: quality.id }
}

test('PGB-03: the menu layout file is validated when read — bad groups, ids, emails and icons dropped, a file that is not a layout refused — and written in a stable order (TC-PGB-02)', () => {
  const file = parseMenuLayout(JSON.stringify({ schema: 1, kind: 'menu-layout',
    groups: { 'g-quality': { name: '  Quality  ', order: 2, acceptsPages: true, owners: ['Group.Lead@Example.com', 'not an email', 'group.lead@example.com'] }, 'g-nameless': { order: 1 }, 'bad id': { name: 'X' }, 'on-demand': { acceptsPages: false, owners: [] }, 'data-insights': { acceptsPages: true, owners: [owner] } },
    pages: { 'supplier-issues': { type: 'table', group: 'g-quality', order: 1, icon: '⚑', owners: [pageOwner] }, 'Bad Id': { type: 'table' }, odd: { type: 'release-stream', group: 'g-gone', icon: '🙂', order: -4 } } }))
  assert.deepEqual(Object.keys(file.groups).sort(), ['data-insights', 'g-quality', 'on-demand'])
  assert.deepEqual(file.groups['g-quality'], { name: 'Quality', order: 2, acceptsPages: true, owners: [groupOwner] }, 'emails lower case, each once; not an email dropped')
  assert.equal(file.groups['on-demand'].acceptsPages, false)
  assert.deepEqual(Object.keys(file.pages).sort(), ['odd', 'supplier-issues'])
  assert.deepEqual(file.pages.odd, { type: 'release-stream', group: 'g-gone', order: 0, icon: '▦', owners: [] }, 'a later kind kept as written, an unknown icon the default')
  assert.equal(kindOf(file, 'odd'), 'table-insights', 'shown as Table + Insights by this build')
  assert.equal(placementOf(file, 'odd').group, 'on-demand', 'a group that no longer exists falls back to On-Demand')
  for (const bad of ['not json', '[]', JSON.stringify({ schema: 2, kind: 'menu-layout' }), JSON.stringify({ schema: 1, kind: 'on-demand-page' })]) assert.throws(() => parseMenuLayout(bad), /menu-layout\.json is not/)
  const text = serializeMenuLayout(file)
  assert.equal(serializeMenuLayout(parseMenuLayout(text)), text, 'written and read back unchanged')
  assert.deepEqual(Object.keys(JSON.parse(text).groups), ['data-insights', 'g-quality', 'on-demand'], 'groups in id order')
  assert.equal(JSON.parse(text).groups['on-demand'].name, undefined, 'a built-in group keeps no name')
  assert.equal(fileLabel('data/menu-layout.json', 'data/planning-data.json'), 'Pages & menu')
})

test('PGB-02, PGB-04: the menu groups — built-in ones in menu order (Settings not configurable, On-Demand accepting pages by default), then custom ones by their order; pages of a group by order then name (TC-PGB-03)', () => {
  const groups = menuGroups(emptyLayout())
  assert.deepEqual(groups.map((group) => group.name), ['Data Insights', 'My Work', 'Testing', 'I&D Board', 'Release Details', 'Other views', 'On-Demand', 'Data & governance'])
  assert.deepEqual(groups.filter((group) => group.acceptsPages).map((group) => group.id), ['on-demand'])
  assert.equal(builtInGroups.some((group) => group.name === 'Settings'), false)
  let { layout: next, quality } = layout()
  const second = addGroup(next, 'Audits'); next = second.layout
  assert.deepEqual(menuGroups(next).slice(-2).map((group) => group.name), ['Quality', 'Audits'])
  next = moveGroup(next, second.id, -1)
  assert.deepEqual(menuGroups(next).slice(-2).map((group) => group.name), ['Audits', 'Quality'], 'reordered')
  assert.deepEqual(pagesOfGroup(next, pages, quality).map((page) => page.id), ['supplier-issues'])
  assert.deepEqual(pagesOfGroup(next, pages, 'on-demand').map((page) => page.name), ['Audit log', 'CoNQ'], 'unplaced pages in name order')
  next = placePage(next, 'conq', { group: quality }, pages.map((page) => page.id))
  assert.deepEqual(pagesOfGroup(next, pages, quality).map((page) => page.id), ['supplier-issues', 'conq'], 'a page moved in goes last')
  next = movePage(next, pages, 'conq', -1)
  assert.deepEqual(pagesOfGroup(next, pages, quality).map((page) => page.id), ['conq', 'supplier-issues'])
  assert.equal(placementOf(next, 'conq').type, 'table-insights', 'moving keeps the type')
})

test('PGB-06: groups — a name is required and unique (built-in names too), a built-in group is only configured, a custom group is removed only when empty (TC-PGB-04)', () => {
  const { layout: next, quality } = layout()
  assert.throws(() => addGroup(next, ' '), /Give the group a name/)
  assert.throws(() => addGroup(next, 'quality'), /already a group named “quality”/)
  assert.throws(() => addGroup(next, 'On-Demand'), /already a group named/)
  assert.throws(() => renameGroup(next, 'on-demand', 'Other'), /built-in group cannot be renamed/)
  assert.equal(menuGroups(renameGroup(next, quality, 'Quality pages')).at(-1).name, 'Quality pages')
  const ids = pages.map((page) => page.id)
  assert.match(removeGroupReason(next, quality, ids), /Move or remove its 1 page first/)
  assert.throws(() => removeGroup(next, quality, ids), /only an empty group/)
  assert.match(removeGroupReason(next, 'on-demand', ids), /built-in group cannot be removed/)
  const emptied = removePlacement(next, 'supplier-issues')
  assert.equal(removeGroupReason(emptied, quality, ids), '')
  assert.equal(menuGroups(removeGroup(emptied, quality, ids)).some((group) => group.id === quality), false)
  const configured = setGroupSettings(next, 'data-insights', { acceptsPages: true, owners: ['A@Example.com'] })
  assert.deepEqual(menuGroups(configured).find((group) => group.id === 'data-insights'), { id: 'data-insights', name: 'Data Insights', builtIn: true, order: 0, acceptsPages: true, owners: ['a@example.com'] })
  assert.deepEqual(ownersInput('a@example.com, b@example.com\nnope'), { owners: ['a@example.com', 'b@example.com'], invalid: ['nope'] })
})

test('PGB-08…PGB-11: rights — Tool Owner, group co-owner, page co-owner and nobody for each action; the role-wide On-Demand rights still apply; fail closed (TC-PGB-05)', () => {
  const { layout: next, quality } = layout()
  const none = () => false
  const viewer = (email, manager = false, can = none) => ({ email, can, readOnly: false, manager })
  const tool = viewer(owner, true), lead = viewer(groupOwner), keeper = viewer(pageOwner), other = viewer(nobody)
  // Groups and their settings: Tool Owner only.
  assert.equal(groupReason(tool), '')
  for (const person of [lead, keeper, other]) assert.match(groupReason(person), /Only a Tool Owner \(“Manage pages and menu groups”\)/)
  // Adding a page to Quality: Tool Owner and the group co-owner.
  assert.equal(addPageReason(tool, next, quality), '')
  assert.equal(addPageReason(lead, next, quality), '')
  for (const person of [keeper, other]) assert.equal(addPageReason(person, next, quality), 'Only a Tool Owner or a co-owner of the group “Quality” can add pages to it.')
  assert.equal(addPageReason(tool, next, 'data-insights'), '“Data Insights” does not accept added pages. A Tool Owner can turn this on in Admin → Pages & menu.')
  assert.deepEqual(groupsForAdding(lead, next).map((group) => group.name), ['Quality'])
  assert.deepEqual(groupsForAdding(other, next), [])
  // Rename, reorder, remove a page and name its co-owners: Tool Owner and the group co-owner.
  for (const person of [tool, lead]) assert.equal(pageMenuReason(person, next, 'supplier-issues'), '')
  for (const person of [keeper, other]) assert.match(pageMenuReason(person, next, 'supplier-issues'), /Only a Tool Owner or a co-owner of the group “Quality”/)
  // Moving: the Tool Owner anywhere that accepts pages; a group co-owner within the groups they co-own.
  assert.equal(moveReason(tool, next, 'supplier-issues', 'on-demand'), '')
  assert.match(moveReason(lead, next, 'supplier-issues', 'on-demand'), /Only a Tool Owner can move a page to another group/)
  assert.equal(moveReason(lead, next, 'supplier-issues', quality), '')
  assert.match(moveReason(tool, next, 'supplier-issues', 'testing'), /does not accept added pages/)
  // Set up the page and edit its rows: page co-owner and group co-owner; Tool Owner and nobody without the role rights.
  assert.deepEqual(pageRights(keeper, next, 'supplier-issues'), { setup: true, rows: true, owner: true })
  assert.deepEqual(pageRights(lead, next, 'supplier-issues'), { setup: true, rows: true, owner: true })
  assert.deepEqual(pageRights(other, next, 'supplier-issues'), { setup: false, rows: false, owner: false })
  assert.deepEqual(pageRights(keeper, next, 'conq'), { setup: false, rows: false, owner: false }, 'a page co-owner holds only their page')
  assert.deepEqual(pageRights(lead, next, 'conq'), { setup: false, rows: false, owner: false }, 'a group co-owner holds only their group')
  // CON-103 keeps working as role-wide rights across all pages.
  const setupRole = viewer(nobody, false, (action) => action === 'ondemand.setup')
  assert.deepEqual(pageRights(setupRole, next, 'supplier-issues'), { setup: true, rows: false, owner: false })
  assert.equal(addPageReason(setupRole, next, 'on-demand'), '', 'the setup right adds pages to On-Demand, as before')
  assert.match(addPageReason(setupRole, next, quality), /Only a Tool Owner or a co-owner/)
  assert.equal(pageMenuReason(setupRole, next, 'conq'), '')
  // A group that stops accepting added pages: its co-owners hold nothing until it is on again.
  const closed = setGroupSettings(next, quality, { acceptsPages: false, owners: [groupOwner] })
  assert.deepEqual(pageRights(lead, closed, 'supplier-issues'), { setup: false, rows: false, owner: false })
  assert.deepEqual(pageRights(keeper, closed, 'supplier-issues'), { setup: true, rows: true, owner: true }, 'a page co-owner keeps their page')
  // Fail closed (CON-101): no roles file, nothing — not even for owners.
  const readOnly = { email: groupOwner, can: () => true, readOnly: true, manager: true }
  assert.deepEqual(pageRights(readOnly, next, 'supplier-issues'), { setup: false, rows: false, owner: false })
  for (const reason of [groupReason(readOnly), addPageReason(readOnly, next, quality), pageMenuReason(readOnly, next, 'supplier-issues'), moveReason(readOnly, next, 'supplier-issues', 'on-demand')]) assert.equal(reason, readOnlyMenuReason)
  // Without a work email nobody is an owner.
  assert.deepEqual(pageRights(viewer(''), next, 'supplier-issues'), { setup: false, rows: false, owner: false })
})

test('CON-106: “Manage pages and menu groups” — Tool Owner only in the starting matrix and for an access.json written before permissions 5; while no Tool Owner exists, those who manage access (TC-PGB-06)', () => {
  const policy = defaultPolicy('lead@example.com')
  assert.ok(policy.roles['Tool Owner'].actions.includes('pages.manage'))
  for (const role of ['Admin', 'Product Owner', 'People Manager', 'Scrum Master', 'Team Member']) assert.ok(!policy.roles[role].actions.includes('pages.manage'), `${role} has no pages.manage`)
  assert.match(serializeAccess(policy), /"permissions": 5/)
  // A file written with permissions 4: a listed Tool Owner gets it, nobody else.
  const v4 = JSON.parse(serializeAccess(policy)); v4.permissions = 4
  for (const rights of Object.values(v4.roles)) rights.actions = rights.actions.filter((key) => key !== 'pages.manage')
  const read = parseAccess(JSON.stringify(v4))
  assert.ok(read.roles['Tool Owner'].actions.includes('pages.manage'))
  for (const role of ['Admin', 'Product Owner', 'People Manager', 'Scrum Master', 'Team Member']) assert.ok(!read.roles[role].actions.includes('pages.manage'), role)
  // Saved again (permissions 5), Not set stays Not set.
  read.roles['Tool Owner'].actions = read.roles['Tool Owner'].actions.filter((key) => key !== 'pages.manage')
  assert.ok(!parseAccess(serializeAccess(read)).roles['Tool Owner'].actions.includes('pages.manage'))
  // An older file without the Tool Owner role: that role gets every right (CON-93); no other role gets it.
  const old = parseAccess(JSON.stringify({ schema: 1, defaultRole: null, roles: { Admin: { areas: [], actions: ['settings.manage', 'access.manage'] } }, members: {} }))
  assert.ok(old.roles['Tool Owner'].actions.includes('pages.manage') && !old.roles.Admin.actions.includes('pages.manage'))
  // canManagePages: the holder; while no Tool Owner exists, whoever manages access; nobody without a policy.
  policy.members['owner@example.com'] = ['Tool Owner']
  assert.equal(canManagePages(policy, rightsFor(policy, 'owner@example.com')), true)
  assert.equal(canManagePages(policy, rightsFor(policy, 'lead@example.com')), false, 'Admin does not while a Tool Owner exists')
  delete policy.members['owner@example.com']
  assert.equal(canManagePages(policy, rightsFor(policy, 'lead@example.com')), true, 'no Tool Owner yet: the Admin who manages access')
  assert.equal(canManagePages(null, rightsFor(null, 'lead@example.com', true)), false)
})

test('PGB-13: CoNQ migrates in place — without a placement it is a Table + Insights page in On-Demand, its file untouched; a group removed elsewhere sends its pages back to On-Demand (TC-PGB-07)', () => {
  const conq = { ...conqPage(), columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap'], required: false }], rows: [{ id: 'r1', key: 'CONQ-261102-AAA2', seq: 1, cells: { c1: 'Scrap' } }], insights: [{ id: 'i1', title: 'By category', type: 'bar', category: 'c1', second: '', measure: 'count', value: '', filters: [], sort: 'value' }] }
  const text = serializeOnDemandPage(conq)
  for (const menu of [emptyLayout(), parseMenuLayout(JSON.stringify({ schema: 1, kind: 'menu-layout', groups: {}, pages: {} }))]) {
    assert.deepEqual(placementOf(menu, 'conq'), { type: 'table-insights', group: 'on-demand', order: Number.MAX_SAFE_INTEGER, icon: '▦', owners: [], placed: false })
    assert.equal(kindOf(menu, 'conq'), 'table-insights')
  }
  assert.equal(serializeOnDemandPage(parseOnDemandPage(text, 'conq')), text, 'the page file, its keys, IDs and insights unchanged')
  // Placed in a group that is later removed (by another save): back in On-Demand, type and owners kept.
  const { layout: next, quality } = layout()
  const gone = { ...next, groups: Object.fromEntries(Object.entries(next.groups).filter(([id]) => id !== quality)) }
  assert.deepEqual([placementOf(gone, 'supplier-issues').group, placementOf(gone, 'supplier-issues').type, placementOf(gone, 'supplier-issues').owners], ['on-demand', 'table', [pageOwner]])
})

test('PGB-03, GIT-17: two saves of the menu layout are merged by group and page — fields three ways, the later save where both changed, co-owners as sets with removals kept (TC-PGB-08)', () => {
  const { layout: base, quality } = layout()
  const baseText = serializeMenuLayout(base)
  // Mine: a new group, Quality renamed, a co-owner added to Quality. Theirs: Quality reordered, another co-owner added
  // and the first one removed, the page's icon changed.
  let mine = addGroup(base, 'Audits').layout
  mine = renameGroup(mine, quality, 'Quality pages')
  mine = setGroupSettings(mine, quality, { acceptsPages: true, owners: [groupOwner, 'mine@example.com'] })
  let theirs = setGroupSettings(base, quality, { acceptsPages: true, owners: ['theirs@example.com'] })
  theirs = { ...theirs, groups: { ...theirs.groups, [quality]: { ...theirs.groups[quality], order: 7 } } }
  theirs = placePage(theirs, 'supplier-issues', { icon: '★' })
  const merged = parseMenuLayout(mergeMenuLayoutText(baseText, serializeMenuLayout(mine), serializeMenuLayout(theirs), true))
  assert.equal(merged.groups[quality].name, 'Quality pages', 'mine changed the name')
  assert.equal(merged.groups[quality].order, 7, 'theirs changed the order')
  assert.deepEqual(merged.groups[quality].owners.sort(), ['mine@example.com', 'theirs@example.com'], 'both added; the one theirs removed stays removed')
  assert.ok(Object.values(merged.groups).some((group) => group.name === 'Audits'), 'my new group kept')
  assert.equal(merged.pages['supplier-issues'].icon, '★')
  // Both changed the same field: the later save wins.
  const a = placePage(base, 'supplier-issues', { icon: '◎' }), b = placePage(base, 'supplier-issues', { icon: '◇' })
  assert.equal(parseMenuLayout(mergeMenuLayoutText(baseText, serializeMenuLayout(a), serializeMenuLayout(b), true)).pages['supplier-issues'].icon, '◎')
  assert.equal(parseMenuLayout(mergeMenuLayoutText(baseText, serializeMenuLayout(a), serializeMenuLayout(b), false)).pages['supplier-issues'].icon, '◇')
  // One removed a page's placement, the other changed it: the later save wins; removed and untouched: removed.
  const removed = removePlacement(base, 'supplier-issues')
  assert.equal(parseMenuLayout(mergeMenuLayoutText(baseText, serializeMenuLayout(removed), serializeMenuLayout(a), true)).pages['supplier-issues'], undefined)
  assert.equal(parseMenuLayout(mergeMenuLayoutText(baseText, serializeMenuLayout(removed), serializeMenuLayout(a), false)).pages['supplier-issues'].icon, '◎')
  assert.equal(parseMenuLayout(mergeMenuLayoutText(baseText, serializeMenuLayout(removed), baseText, false)).pages['supplier-issues'], undefined)
  // Without a base (never read here): every entry of both stays, owners united.
  const noBase = parseMenuLayout(mergeMenuLayoutText(null, serializeMenuLayout(mine), serializeMenuLayout(theirs), true))
  assert.deepEqual(noBase.groups[quality].owners.sort(), [groupOwner, 'mine@example.com', 'theirs@example.com'].sort())
  assert.deepEqual(mergeOwners(['a@x.com', 'b@x.com'], ['a@x.com', 'c@x.com'], ['a@x.com', 'b@x.com', 'd@x.com']), ['a@x.com', 'd@x.com', 'c@x.com'])
  // A side that is not a layout: my text is written as it is.
  assert.equal(mergeMenuLayoutText(baseText, serializeMenuLayout(mine), 'broken', true), serializeMenuLayout(mine))
})
