import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultPolicy, rightsFor } from '../src/access.ts'
import { assertNotViewingAs, canViewAs, setViewAsGuard, viewAsLabel, viewAsPeople, viewAsRights } from '../src/viewAs.ts'
import { writeTextFile } from '../src/gitStorage.ts'

// Synthetic people and emails only.
const policy = { ...defaultPolicy('lead@example.com'), members: { 'lead@example.com': ['Admin'], 'pm@example.com': ['People Manager'], 'sm@example.com': ['Scrum Master'] } }

test('View as: only the Admin role may use it, and only with an access policy (CON-89)', () => {
  assert.equal(canViewAs(rightsFor(policy, 'lead@example.com')), true)
  assert.equal(canViewAs(rightsFor(policy, 'pm@example.com')), false, 'People Manager: no')
  assert.equal(canViewAs(rightsFor(null, 'lead@example.com')), false, 'no policy: nobody (nothing is restricted anyway)')
})

test('View as: a person gets the roles of their work email (else the default role); a role gets that role only (CON-90, CON-91)', () => {
  const asPm = viewAsRights(policy, { kind: 'person', name: 'Pat Manager', email: 'pm@example.com' })
  assert.deepEqual([asPm.roles, asPm.areas.has('insights'), asPm.actions.has('access.manage')], [['People Manager'], true, false])
  const unknown = viewAsRights(policy, { kind: 'person', name: 'New Starter' })
  assert.deepEqual(unknown.roles, ['Team Member'], 'no email known: the default role')
  const asRole = viewAsRights(policy, { kind: 'role', role: 'Scrum Master' })
  assert.deepEqual([asRole.roles, asRole.areas.has('insights'), asRole.areas.has('health')], [['Scrum Master'], false, true])
  assert.equal(viewAsLabel({ kind: 'role', role: 'Scrum Master' }), 'the role Scrum Master')
  assert.equal(viewAsLabel({ kind: 'person', name: 'Pat Manager', email: 'pm@example.com' }), 'Pat Manager')
  const people = viewAsPeople([{ assignedTo: 'Pat Manager', assignedToEmail: 'PM@example.com' }, { assignedTo: 'Ex Colleague' }, { assignedTo: '' }], policy)
  assert.deepEqual(people.map((entry) => [entry.name, entry.email]), [['Ex Colleague', undefined], ['lead@example.com', 'lead@example.com'], ['Pat Manager', 'pm@example.com'], ['sm@example.com', 'sm@example.com']])
})

test('View as is read only: writes to Git storage and Azure DevOps are refused while it is on (CON-92)', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; return new Response('{}', { status: 200 }) }
  const config = { owner: 'o', repo: 'r', branch: 'main', path: 'data.json' }
  setViewAsGuard('Pat Manager')
  try {
    assert.throws(() => assertNotViewingAs(), /Read only while viewing as Pat Manager/)
    await assert.rejects(writeTextFile(config, 'token', 'text', null, 'message', fetchImpl), /Read only while viewing as Pat Manager/)
    assert.equal(calls, 0, 'nothing was sent')
  } finally { setViewAsGuard('') }
  assert.doesNotThrow(() => assertNotViewingAs(), 'after Exit, writes work again')
})
