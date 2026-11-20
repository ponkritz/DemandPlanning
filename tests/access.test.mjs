import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultPolicy, parseAccess, serializeAccess, rightsFor, keepsManager } from '../src/access.ts'
import { requestAzure, guardAzureWrites, writePermissions } from '../src/azureDevOps.ts'
import { cellOf, setCell, explainAccess } from '../src/access.ts'
import { settingsPagesFor } from '../src/settingsTabs.ts'
import { canViewAs, viewAsRights } from '../src/viewAs.ts'

test('access: no policy means no restrictions; members get the union of their roles, others the default role', () => {
  const open = rightsFor(null, 'anyone@example.com')
  assert.equal(open.restricted, false)
  assert.ok(open.areas.has('health') && open.actions.has('access.manage'))

  const policy = defaultPolicy('Lead@Example.com')
  policy.members['sm@example.com'] = ['Scrum Master']
  policy.members['pm@example.com'] = ['People Manager', 'Product Owner']
  const admin = rightsFor(policy, 'lead@example.com')
  assert.ok(admin.actions.has('access.manage') && admin.areas.has('health'), 'the first saver is Admin (email lower-cased)')
  const sm = rightsFor(policy, 'SM@example.com')
  assert.ok(sm.areas.has('health'), 'Scrum Master sees Backlog Health')
  assert.ok(!sm.actions.has('baselines.edit'))
  assert.ok(sm.actions.has('azure.createForOthers'), 'Scrum Masters may create work for others')
  const member = rightsFor(policy, 'someone@example.com')
  assert.deepEqual(member.roles, ['Team Member'])
  assert.ok(!member.areas.has('health'), 'only the roles given Backlog Health see it')
  assert.ok(member.areas.has('mywork') && member.actions.has('azure.write'))
  assert.ok(!member.actions.has('azure.createForOthers'), 'Team Members create work for themselves only')
  const both = rightsFor(policy, 'pm@example.com')
  assert.ok(both.areas.has('health') && both.areas.has('snapshots') && both.actions.has('baselines.edit'), 'union of People Manager and Product Owner')
  assert.deepEqual(rightsFor(policy, '').roles, ['Team Member'], 'unknown identity: default role')
  policy.defaultRole = null
  assert.equal(rightsFor(policy, 'someone@example.com').areas.size, 0, 'no default role: nothing but Settings')
})

test('access file: round trip, unknown entries dropped, broken files refused, editor cannot lock themselves out', () => {
  const policy = defaultPolicy('lead@example.com')
  policy.members['sm@example.com'] = ['Scrum Master']
  assert.deepEqual(parseAccess(serializeAccess(policy)), policy)
  const parsed = parseAccess(JSON.stringify({ schema: 1, defaultRole: 'Guest', roles: { 'Scrum Master': { areas: ['health', 'nope'], actions: ['delete-all', 'azure.write'] } }, members: { 'not-an-email': ['Admin'], 'A@B.com': ['Scrum Master', 'Wizard'] } }))
  assert.equal(parsed.defaultRole, null)
  // An older file (no split permissions): azure.write brings the work-item permissions it covered, and the actions the
  // app did not check before are allowed (CON-94).
  assert.deepEqual(parsed.roles['Scrum Master'], { areas: ['health'], actions: ['azure.write', 'work.edit', 'work.state', 'work.move', 'work.hours', 'work.comment', 'work.bulk', 'qemapping.edit', 'data.export', 'setup.feature', 'pack.text'] })
  assert.deepEqual(parsed.roles.Admin, { areas: [], actions: ['qemapping.edit', 'data.export', 'setup.feature', 'pack.text'] }, 'a role missing from an older file keeps only what the app did not check then')
  assert.deepEqual(parsed.members, { 'a@b.com': ['Scrum Master'] })
  assert.throws(() => parseAccess('{'), /not valid JSON/)
  assert.throws(() => parseAccess('{"schema":2,"roles":{},"members":{}}'), /not an access file/)
  assert.ok(keepsManager(policy, 'lead@example.com'))
  assert.ok(!keepsManager(policy, 'sm@example.com'))
  assert.ok(!keepsManager(policy, ''), 'an unknown editor cannot save')
})

test('a role without Azure changes: write requests are refused before anything is sent', async () => {
  const sent = []
  const original = globalThis.fetch
  globalThis.window = {}
  globalThis.fetch = async (url) => { sent.push(url); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    guardAzureWrites(() => false)
    await assert.rejects(requestAzure({ organization: 'o', project: 'p', team: 't', pat: 'x', operation: 'update-work-item', workItemId: 1, state: 'Closed' }), /role does not allow this change/)
    assert.equal(sent.length, 0)
    await requestAzure({ organization: 'o', project: 'p', team: 't', pat: 'x', operation: 'fields' })
    assert.equal(sent.length, 1, 'reads still work')
  } finally { guardAzureWrites(() => true); delete globalThis.window; globalThis.fetch = original }
})

test('Team insights: My dashboard for every role, the team insights for Tool Owner, Admin and People Manager; older files keep them for those three (MYD-05, TC-MYD-02)', () => {
  const policy = defaultPolicy('admin@example.com')
  for (const role of Object.keys(policy.roles)) assert.ok(policy.roles[role].areas.includes('overview'), `${role} sees My dashboard`)
  assert.deepEqual(Object.keys(policy.roles).filter((role) => policy.roles[role].areas.includes('insights')), ['Tool Owner', 'Admin', 'People Manager'])
  // A file written before the area existed: Admin and People Manager get it, the others do not.
  const old = JSON.parse(serializeAccess(policy))
  for (const role of Object.keys(old.roles)) old.roles[role].areas = old.roles[role].areas.filter((area) => area !== 'insights')
  const migrated = parseAccess(JSON.stringify(old))
  assert.deepEqual(Object.keys(migrated.roles).filter((role) => migrated.roles[role].areas.includes('insights')), ['Tool Owner', 'Admin', 'People Manager'])
  // Once a file lists the area anywhere, it is taken as written: an admin who removed it from People Manager keeps that.
  const chosen = JSON.parse(serializeAccess(policy)); chosen.roles['People Manager'].areas = chosen.roles['People Manager'].areas.filter((area) => area !== 'insights')
  assert.equal(parseAccess(JSON.stringify(chosen)).roles['People Manager'].areas.includes('insights'), false)
  assert.equal(rightsFor(parseAccess(serializeAccess(policy)), 'someone@example.com').areas.has('insights'), false, 'the default role (Team Member) sees My dashboard only')
})

test('CON-93: the Tool Owner role alone changes the stream mapping; while none exists, those who manage access may; only a Tool Owner changes who holds it (TC-CON-57)', async () => {
  const { canManageStreams, toolOwnerExists, toolOwnerChange } = await import('../src/access.ts')
  const policy = defaultPolicy('admin@example.com')
  assert.equal(policy.roles['Tool Owner'].actions.includes('streams.manage'), true)
  assert.equal(policy.roles.Admin.actions.includes('streams.manage'), false, 'Admins no longer change the stream mapping')
  assert.equal(canManageStreams(null, { actions: new Set() }), true, 'no access file: no restrictions, as before')
  assert.equal(toolOwnerExists(policy), false)
  assert.equal(canManageStreams(policy, rightsFor(policy, 'admin@example.com')), true, 'no Tool Owner yet: the access manager may, so nobody is locked out')
  const owned = { ...policy, members: { ...policy.members, 'owner@example.com': ['Tool Owner'] } }
  assert.equal(toolOwnerExists(owned), true)
  assert.equal(canManageStreams(owned, rightsFor(owned, 'admin@example.com')), false, 'with a Tool Owner, an Admin may not')
  assert.equal(canManageStreams(owned, rightsFor(owned, 'owner@example.com')), true)
  assert.equal(canManageStreams(owned, rightsFor(owned, 'someone@example.com')), false)
  assert.equal(toolOwnerChange(policy, owned, 'admin@example.com'), '', 'the first Tool Owner is set by the access manager')
  const another = { ...owned, members: { ...owned.members, 'new@example.com': ['Tool Owner'] } }
  assert.match(toolOwnerChange(owned, another, 'admin@example.com'), /Only a Tool Owner/)
  assert.equal(toolOwnerChange(owned, another, 'owner@example.com'), '')
  const none = { ...owned, members: { 'admin@example.com': ['Admin'] } }
  assert.match(toolOwnerChange(owned, none, 'owner@example.com'), /Keep at least one Tool Owner/)
  const teamOnly = { ...owned, members: { ...owned.members, 'tm@example.com': ['Team Member'] } }
  assert.equal(toolOwnerChange(owned, teamOnly, 'admin@example.com'), '', 'other changes stay with the access manager')
  const old = JSON.parse(serializeAccess(policy)); delete old.roles['Tool Owner']
  assert.equal(parseAccess(JSON.stringify(old)).roles['Tool Owner'].actions.includes('streams.manage'), true, 'a file from before the role gives the Tool Owner every right')
})

test('CON-94: every permission is Allow, Deny or Not set per role; a denial wins; older files keep what they allowed; Check access explains (TC-CON-58)', async () => {
  // Migration: a file written before the split keeps every person's rights.
  const old = parseAccess(JSON.stringify({ schema: 1, defaultRole: 'Team Member', roles: {
    'Admin': { areas: ['overview'], actions: ['azure.write', 'azure.createForOthers', 'settings.manage', 'access.manage'] },
    'Team Member': { areas: ['overview'], actions: [] },
  }, members: { 'lead@example.com': ['Admin'] } }))
  const admin = rightsFor(old, 'lead@example.com'), member = rightsFor(old, 'x@example.com')
  for (const key of ['capacity.periods', 'people.edit', 'release.counts', 'streams.options', 'layout.defaults', 'pack.setup', 'access.viewAs', 'work.state', 'work.bulk']) assert.ok(admin.actions.has(key), `Admin keeps ${key}`)
  assert.ok(!admin.actions.has('streams.manage'), 'the stream mapping stays with the Tool Owner')
  assert.ok(!member.actions.has('work.edit') && !member.actions.has('capacity.settings'), 'no Azure changes before: none now')
  assert.ok(member.actions.has('data.export') && member.actions.has('qemapping.edit'), 'what had no check stays allowed')
  // A file written with the split permissions is read as it is (no migration).
  const split = parseAccess(JSON.stringify({ schema: 1, defaultRole: 'Team Member', roles: { 'Team Member': { areas: [], actions: ['work.hours'] } }, members: {} }))
  assert.deepEqual([...rightsFor(split, '').actions], ['work.hours'])
  // A file saved by this version is never migrated again, even when its roles list old keys only.
  const saved = defaultPolicy('lead@example.com'); saved.roles['Team Member'].actions = ['azure.write']
  for (const rights of Object.values(saved.roles)) if (rights !== saved.roles['Team Member']) rights.actions = []
  assert.match(serializeAccess(saved), /"permissions": ?3/)
  assert.deepEqual(parseAccess(serializeAccess(saved)).roles['Team Member'].actions, ['azure.write'], 'Not set stays Not set')

  // Deny wins over another role's allow, for actions and areas alike; it round-trips through the file.
  const policy = defaultPolicy('lead@example.com')
  policy.members['pm@example.com'] = ['People Manager', 'Team Member']
  assert.ok(rightsFor(policy, 'pm@example.com').actions.has('data.export'))
  setCell(policy.roles['Team Member'], 'data.export', 'deny')
  setCell(policy.roles['Team Member'], 'snapshots', 'deny')
  assert.equal(cellOf(policy.roles['Team Member'], 'data.export'), 'deny')
  const pm = rightsFor(policy, 'pm@example.com')
  assert.ok(!pm.actions.has('data.export') && !pm.areas.has('snapshots'), 'denied by Team Member although People Manager allows')
  assert.deepEqual(parseAccess(serializeAccess(policy)), policy, 'deny is saved and read back')
  const answer = explainAccess(policy, 'pm@example.com', 'data.export')
  assert.deepEqual({ allowed: answer.allowed, allowedBy: answer.allowedBy, deniedBy: answer.deniedBy }, { allowed: false, allowedBy: ['People Manager'], deniedBy: ['Team Member'] })
  setCell(policy.roles['Team Member'], 'data.export', 'unset')
  assert.equal(cellOf(policy.roles['Team Member'], 'data.export'), 'unset')
  assert.ok(explainAccess(policy, 'pm@example.com', 'data.export').allowed, 'Not set: another role may allow it')
  setCell(policy.roles['Team Member'], 'snapshots', 'unset')
  assert.equal(policy.roles['Team Member'].deny, undefined, 'no empty deny list is kept')
  assert.equal(explainAccess(null, 'a@b.com', 'access.manage').allowed, true, 'no policy: everything allowed')
  // Denying Manage access to yourself is refused like removing it.
  setCell(policy.roles.Admin, 'access.manage', 'deny')
  assert.ok(!keepsManager(policy, 'lead@example.com'))

  // Settings pages and View as follow their own permissions.
  const pages = (rights) => settingsPagesFor((key) => rights.actions.has(key)).map((page) => page.key)
  const smOnly = defaultPolicy('lead@example.com'); smOnly.members['sm@example.com'] = ['Scrum Master']
  assert.deepEqual(pages(rightsFor(smOnly, 'sm@example.com')), ['home', 'connections', 'options', 'epics', 'resources', 'storage'])
  setCell(smOnly.roles['Scrum Master'], 'capacity.periods', 'allow')
  assert.ok(pages(rightsFor(smOnly, 'sm@example.com')).includes('capacity'), 'one capacity permission opens the page')
  assert.ok(canViewAs(rightsFor(smOnly, 'lead@example.com')) && !canViewAs(rightsFor(smOnly, 'sm@example.com')))
  setCell(smOnly.roles['Scrum Master'], 'release', 'deny')
  assert.ok(!viewAsRights(smOnly, { kind: 'role', role: 'Scrum Master' }).areas.has('release'), 'View as a role honours its denials')

  // Each Azure DevOps change needs its own permission; nothing is sent without it.
  assert.deepEqual(writePermissions({ operation: 'update-work-item', state: 'Closed' }), ['work.state'])
  assert.deepEqual(writePermissions({ operation: 'update-work-item', iterationPath: 'P\\S1' }), ['work.move'])
  assert.deepEqual(writePermissions({ operation: 'update-work-item', state: 'Active', iterationPath: 'P\\S1' }), ['work.state', 'work.move'])
  assert.deepEqual(writePermissions({ operation: 'update-time-writing-effort' }), ['work.hours'])
  assert.deepEqual(writePermissions({ operation: 'add-comment' }), ['work.comment'])
  assert.deepEqual(writePermissions({ operation: 'edit-work-item' }), ['work.edit'])
  assert.deepEqual(writePermissions({ operation: 'create-child' }), ['azure.write'])
  assert.deepEqual(writePermissions({ operation: 'items' }), [])
  const sent = []
  const original = globalThis.fetch
  globalThis.window = {}
  globalThis.fetch = async (url) => { sent.push(url); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) }
  try {
    guardAzureWrites((permission) => permission === 'work.hours')
    await assert.rejects(requestAzure({ organization: 'o', project: 'p', team: 't', pat: 'x', operation: 'update-work-item', workItemId: 1, state: 'Closed' }), /does not allow this change/)
    await assert.rejects(requestAzure({ organization: 'o', project: 'p', team: 't', pat: 'x', operation: 'add-comment', workItemId: 1, comment: 'hi' }), /does not allow this change/)
    assert.equal(sent.length, 0, 'refused before anything is sent')
  } finally { guardAzureWrites(() => true); delete globalThis.window; globalThis.fetch = original }
})

test('EPS-04: Edit Epic setup and its value lists — Tool Owner, Admin (and Scrum Master for the fields) by default; a file of v7.27 gets them as in the starting matrix (TC-EPS-04)', () => {
  const policy = defaultPolicy('lead@example.com')
  policy.members['sm@example.com'] = ['Scrum Master']
  const sm = rightsFor(policy, 'sm@example.com'), admin = rightsFor(policy, 'lead@example.com'), member = rightsFor(policy, 'x@example.com')
  assert.ok(sm.actions.has('setup.epic') && !sm.actions.has('setup.values'))
  assert.ok(admin.actions.has('setup.epic') && admin.actions.has('setup.values'))
  assert.ok(!member.actions.has('setup.epic') && !member.actions.has('setup.values'))
  // A file saved by v7.27 (permissions 2) knew neither permission: they start as in the matrix above.
  const v2 = JSON.parse(serializeAccess(defaultPolicy('lead@example.com')))
  v2.permissions = 2
  for (const rights of Object.values(v2.roles)) rights.actions = rights.actions.filter((key) => key !== 'setup.epic' && key !== 'setup.values')
  v2.roles['Scrum Master'].actions = ['work.hours']
  const read = parseAccess(JSON.stringify(v2))
  assert.ok(read.roles.Admin.actions.includes('setup.values') && read.roles['Scrum Master'].actions.includes('setup.epic'))
  assert.ok(!read.roles['Scrum Master'].actions.includes('setup.feature'), 'other permissions of the file are kept as saved')
  // Saved again (permissions 3), a permission set to Not set stays so.
  read.roles['Scrum Master'].actions = ['work.hours']
  assert.deepEqual(parseAccess(serializeAccess(read)).roles['Scrum Master'].actions, ['work.hours'])
  // An older file (before the split): the holders of the old shared settings right get both.
  const old = parseAccess(JSON.stringify({ schema: 1, defaultRole: null, roles: { Admin: { areas: [], actions: ['settings.manage'] }, 'Scrum Master': { areas: [], actions: [] } }, members: {} }))
  assert.ok(old.roles.Admin.actions.includes('setup.epic') && old.roles.Admin.actions.includes('setup.values'))
  assert.ok(!old.roles['Scrum Master'].actions.includes('setup.epic'))
})
