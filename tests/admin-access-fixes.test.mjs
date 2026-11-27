import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { accessChangeProblem, canManagePages, canManageStreams, defaultPolicy, parseAccess, rightsFor, serializeAccess, setCell, toolOwnerChange, toolOwnerExists, withMemberRoles } from '../src/access.ts'
import { accessConflictText, assertCanManageStreams, saveAccessChecked, setStreamsGuard, streamsBlockedText } from '../src/accessSave.ts'
import { readTextFile, writeTextFile } from '../src/gitStorage.ts'
import { setRolesFor } from '../src/people.ts'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'

// CON-130…CON-135 (TC-CON-90…TC-CON-95): the Admin access fixes of the 2026-11-26 independent review — AR-001 (the
// stream mapping guarded inside Git storage), AR-002 (no lost update of access.json), AR-003 (one rule on every save of
// access.json), AR-004 (Deny counts for the Tool Owner), AR-010 (bulk pop-ups start with nothing chosen), AR-011 (app
// access of emails not in Azure DevOps). Synthetic emails only.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const team = () => {
  const policy = defaultPolicy('admin@example.com')
  policy.members['owner@example.com'] = ['Tool Owner', 'Team Member']
  return policy
}
const stub = () => { const calls = []; return { calls, write: async (text, sha, message) => { calls.push({ text, sha, message }); return { sha: `sha-${calls.length}`, commitUrl: '' } } } }

test('CON-130: a Deny of “Change the stream mapping” counts — holders come from effective rights (AR-004, TC-CON-90)', () => {
  const before = team()
  assert.equal(toolOwnerExists(before), true)
  const after = structuredClone(before)
  setCell(after.roles['Team Member'], 'streams.manage', 'deny')
  assert.equal(rightsFor(after, 'owner@example.com').actions.has('streams.manage'), false, 'the denial strips it from the Tool Owner')
  assert.equal(toolOwnerExists(after), false, 'nobody holds the stream mapping any more')
  assert.match(toolOwnerChange(before, after, 'admin@example.com'), /Only a Tool Owner/, 'an Admin may not deny it under the Tool Owner')
  assert.match(toolOwnerChange(before, after, 'owner@example.com'), /Keep at least one Tool Owner/, 'nor the Tool Owner, who would leave no holder')
  // A file that already has the denial: the access managers may change the stream mapping, so nobody is locked out.
  assert.equal(canManageStreams(after, rightsFor(after, 'admin@example.com')), true)
  const pages = structuredClone(after); setCell(pages.roles.Admin, 'pages.manage', 'unset')
  assert.equal(canManagePages(pages, rightsFor(pages, 'admin@example.com')), true, 'canManagePages follows the same rule')
  assert.equal(canManagePages(before, rightsFor(before, 'admin@example.com')), false, 'with a real Tool Owner, the Admin may not')
  // The default role: a denial on it also counts.
  const everyone = defaultPolicy('admin@example.com'); everyone.defaultRole = 'Tool Owner'
  assert.equal(toolOwnerExists(everyone), true)
  setCell(everyone.roles['Tool Owner'], 'streams.manage', 'deny')
  assert.equal(toolOwnerExists(everyone), false)
})

test('CON-131: one rule on every save of access.json — the Tool Owner rule and Manage access kept (AR-003, TC-CON-91)', async () => {
  const before = team()
  // People drawer / bulk Set access role…: an Admin who is not the Tool Owner makes themselves Tool Owner.
  const self = setRolesFor(before, [{ name: 'Ada Admin', email: 'admin@example.com' }], ['Tool Owner', 'Admin']).policy
  assert.match(accessChangeProblem(before, self, 'admin@example.com'), /^Not saved: Only a Tool Owner/)
  // …or removes the last Tool Owner.
  const gone = setRolesFor(before, [{ name: 'Olli Owner', email: 'owner@example.com' }], ['Team Member']).policy
  assert.match(accessChangeProblem(before, gone, 'admin@example.com'), /^Not saved: Only a Tool Owner/)
  assert.match(accessChangeProblem(before, gone, 'owner@example.com'), /Keep at least one Tool Owner/)
  // Manage access kept.
  const locked = withMemberRoles(before, 'admin@example.com', ['Team Member'])
  assert.match(accessChangeProblem(before, locked, 'admin@example.com'), /admin@example\.com would lose “Manage access”/)
  assert.match(accessChangeProblem(before, locked, ''), /no email is set/)
  assert.equal(accessChangeProblem(before, withMemberRoles(before, 'sm@example.com', ['Scrum Master']), 'admin@example.com'), '', 'an ordinary change is saved')

  // saveAccessChecked refuses before anything is written.
  const git = stub()
  await assert.rejects(saveAccessChecked(git.write, { policy: before, sha: 'v1' }, self, 'admin@example.com', 'x'), /Only a Tool Owner/)
  assert.equal(git.calls.length, 0, 'nothing written')
  await saveAccessChecked(git.write, { policy: before, sha: 'v1' }, withMemberRoles(before, 'sm@example.com', ['Scrum Master']), 'admin@example.com', 'Access: sm')
  assert.equal(git.calls.length, 1)

  // Every writer of access.json goes through useAccess.save → saveAccessChecked; the copies of the checks are gone.
  const writers = readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter((file) => /\.tsx?$/.test(file) && /\bwriteAccess\b/.test(read(`src/${file}`)))
  assert.deepEqual(writers.map((file) => file.replaceAll('\\', '/')).sort(), ['useAccess.ts', 'useGitStorage.ts'], 'only useAccess (through saveAccessChecked) uses the write')
  assert.match(read('src/useAccess.ts'), /saveAccessChecked\(git\.writeAccess, base, policy, email, message\)/)
  for (const file of ['src/pages/AdminPage.tsx', 'src/components/AccessPanel.tsx']) {
    assert.doesNotMatch(read(file), /keepsManager\(|toolOwnerChange\(/, `${file} has no check of its own`)
    assert.match(read(file), /access\.save\(/)
  }
})

test('CON-132: a Role rights draft is written over the version it was made from; a newer file is never lost (AR-002, TC-CON-92)', async () => {
  const gh = fakeGitHub({ files: { 'access.json': serializeAccess(team()) } })
  const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'access.json' }
  const write = (text, sha, message) => writeTextFile(config, 't', text, sha, message, gh.fetch)
  // A opens a draft from version 1.
  const v1 = await readTextFile(config, 't', gh.fetch)
  const base = { policy: parseAccess(v1.text), sha: v1.sha }
  const draft = withMemberRoles(base.policy, 'pm@example.com', ['People Manager'])
  // B saves a newer access.json; A's app reloads it quietly.
  await write(serializeAccess(withMemberRoles(base.policy, 'po@example.com', ['Product Owner'])), v1.sha, 'B')
  // A saves the old-based draft: refused with the clear text, B's change stays.
  await assert.rejects(saveAccessChecked(write, base, draft, 'admin@example.com', 'A'), (failure) => failure.message === accessConflictText)
  assert.match(accessConflictText, /Your change is kept here/)
  const now = parseAccess(gh.read('access.json'))
  assert.deepEqual([now.members['po@example.com'], now.members['pm@example.com']], [['Product Owner'], undefined])
  // From the newer version the same change saves.
  const v2 = await readTextFile(config, 't', gh.fetch)
  await saveAccessChecked(write, { policy: parseAccess(v2.text), sha: v2.sha }, withMemberRoles(parseAccess(v2.text), 'pm@example.com', ['People Manager']), 'admin@example.com', 'A again')
  assert.deepEqual(parseAccess(gh.read('access.json')).members['pm@example.com'], ['People Manager'])
  // Role rights keeps the draft's base and passes it; the draft is kept on a failed save.
  const panel = read('src/components/AccessPanel.tsx')
  assert.match(panel, /setDraftBase\(\{ policy: access\.policy, sha: access\.sha \}\)/)
  assert.ok(panel.includes("access.save(draft, commit.trim() || 'Update access roles', draftBase ?? undefined)"))
  assert.match(panel, /Someone else saved .* after you started these changes/)
})

test('CON-133: the shared stream mapping is guarded inside Git storage and the Other views paths are gated (AR-001, TC-CON-93)', () => {
  setStreamsGuard(false)
  assert.throws(() => assertCanManageStreams(), (failure) => failure.message === streamsBlockedText)
  setStreamsGuard(true)
  assert.doesNotThrow(() => assertCanManageStreams())
  setStreamsGuard(false)
  const git = read('src/useGitStorage.ts')
  for (const name of ['shareViews', 'removeSnapshots']) {
    const body = git.slice(git.indexOf(`async function ${name}(`), git.indexOf('\n  }\n', git.indexOf(`async function ${name}(`)))
    assert.match(body, /assertCanManageStreams\(\)/, `${name} checks the right itself`)
  }
  assert.match(read('src/useAccess.ts'), /setStreamsGuard\(streamsAllowed\)/)
  const connections = read('src/components/AzureConnections.tsx')
  assert.match(connections, /canManage = false, canManageStreams = false, canEnterCounts = false/, 'the prop defaults fail closed')
  for (const name of ['switchTimeWriting', 'removeDuplicates']) {
    const body = connections.slice(connections.indexOf(`async function ${name}(`), connections.indexOf('\n  }\n', connections.indexOf(`async function ${name}(`)))
    assert.match(body, /if \(streamsBlocked\)/, `${name} is gated on canManageStreams`)
  }
  assert.match(connections, /Boolean\(streamsBlocked\)\} title=\{streamsBlocked \|\| undefined\} onClick=\{\(\) => void switchTimeWriting\(profile\)\}>Use as Time Writing/)
  const admin = read('src/pages/AdminPage.tsx')
  const sections = admin.match(/<AzureConnections [^>]*\/>/g)
  assert.ok(sections.length >= 3 && sections.every((tag) => tag.includes('canManageStreams={access.canManageStreams}')), 'every section is passed the right (SET-26: the Admin sections through one helper)')
})

test('CON-134: app access of emails not in Azure DevOps is listed under Role rights, removed or given through the guarded save (AR-011, TC-CON-94)', async () => {
  const before = team()
  before.members['left@example.com'] = ['Admin']
  const git = stub()
  // Remove: the leaver's Admin goes; the default role then applies.
  const removed = withMemberRoles(before, 'left@example.com', [])
  await saveAccessChecked(git.write, { policy: before, sha: 'v1' }, removed, 'admin@example.com', 'Access: remove left@example.com')
  assert.equal(JSON.parse(git.calls[0].text).members['left@example.com'], undefined)
  assert.deepEqual(rightsFor(parseAccess(git.calls[0].text), 'left@example.com').roles, ['Team Member'])
  // Give access by email goes through the same rule: an Admin cannot give Tool Owner.
  await assert.rejects(saveAccessChecked(git.write, { policy: before, sha: 'v1' }, withMemberRoles(before, 'new@example.com', ['Tool Owner']), 'admin@example.com', 'x'), /Only a Tool Owner/)
  await saveAccessChecked(git.write, { policy: before, sha: 'v1' }, withMemberRoles(before, 'contractor@example.com', ['Team Member']), 'admin@example.com', 'x')
  assert.deepEqual(JSON.parse(git.calls[1].text).members['contractor@example.com'], ['Team Member'])
  const panel = read('src/components/AccessPanel.tsx')
  assert.doesNotMatch(panel, /membersInPeople/, 'the dead Members editor is gone')
  assert.match(panel, /<h3>Access for emails not in Azure DevOps<\/h3>/)
  assert.match(panel, /withMemberRoles\(access\.policy!, removing\[0\], \[\]\)/)
  assert.match(panel, /<Modal eyebrow="ROLE RIGHTS · APP ACCESS" title=\{`Remove access of \$\{email\}`\}/)
  assert.match(read('src/pages/AdminPage.tsx'), /<AccessPanel access=\{access\} git=\{git\} people=\{people\} accessOnly=\{accessOnly\} \/>/)
  assert.match(read('src/components/PeoplePanel.tsx'), /Role rights → Access for emails not in Azure DevOps/)
})

test('CON-135: the bulk Set region / role / access role pop-ups start with nothing chosen; clearing is its own choice (AR-010, TC-CON-95)', () => {
  const panel = read('src/components/PeoplePanel.tsx')
  const dialog = panel.slice(panel.indexOf('function BulkDialog('), panel.indexOf('// CAP-61'))
  assert.match(dialog, /const \[value, setValue\] = useState\(''\)/)
  assert.match(dialog, /<option value="" disabled>Choose…<\/option>/, 'nothing chosen at first')
  assert.match(dialog, /<option value=\{clearValue\}>\(none\) — clear<\/option>/)
  assert.match(dialog, /disabled=\{busy \|\| Boolean\(missing\)\}/, 'Save disabled until a value is picked')
  assert.match(dialog, /if \(clearing && !confirming\) \{ setConfirming\(true\); return \}/, 'clearing asks to confirm')
  assert.doesNotMatch(dialog, /<option value="">Not set<\/option>/)
})
