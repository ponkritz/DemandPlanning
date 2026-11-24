import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultStatusFilter, emptyFilters, filterPeople, filtersChanged, formError, formOf, missingOf, patchProfiles, personStatus, profilePatch, sameRoles, setRolesFor, statusText } from '../src/people.ts'
import { defaultPolicy } from '../src/access.ts'

const format = (day) => day
const entry = (name, profile = {}, extra = {}) => ({ name, profile, roles: [], status: personStatus(profile, extra.inAzure ?? true), ...extra })

test('CAP-58: a person\'s Status — Not part of the team, Not in Azure DevOps, Left on, Active since (TC-CAP-30)', () => {
  assert.equal(personStatus({ removed: true, leftOn: '2026-10-31' }, true), 'not-team', 'removed comes first')
  assert.equal(personStatus({ removed: true }, false), 'not-team')
  assert.equal(personStatus({ leftOn: '2026-10-31' }, false), 'not-in-azure')
  assert.equal(personStatus({ leftOn: '2026-10-31' }, true), 'left')
  assert.equal(personStatus(undefined, true), 'active')
  assert.equal(statusText('active', { joinedOn: '2026-03-01' }, '2026-05-01', '2026-11-24', format), 'Active since 2026-03-01')
  assert.equal(statusText('active', {}, '2026-05-01', '2026-11-24', format), 'Active since 2026-05-01', 'the default Time tracking started applies')
  assert.equal(statusText('active', {}, undefined, '2026-11-24', format), 'Active')
  assert.equal(statusText('left', { leftOn: '2026-10-31' }, undefined, '2026-11-24', format), 'Left on 2026-10-31')
  // A Left on date still to come (or today, the last day worked) is Active until then (product owner, 24 Nov 2026).
  assert.equal(personStatus({ leftOn: '2026-12-31' }, true, '2026-11-24'), 'active', 'leaving later: Active until then')
  assert.equal(personStatus({ leftOn: '2026-11-24' }, true, '2026-11-24'), 'active', 'the last day is still worked')
  assert.equal(personStatus({ leftOn: '2026-11-23' }, true, '2026-11-24'), 'left', 'the day after: Left')
  assert.equal(statusText('active', { joinedOn: '2025-03-01', leftOn: '2026-12-31' }, undefined, '2026-11-24', format), 'Active since 2025-03-01 · leaves on 2026-12-31', 'a date still to come')
  assert.equal(statusText('not-team', {}, undefined, '2026-11-24', format), 'Not part of the team')
  assert.equal(statusText('not-in-azure', {}, undefined, '2026-11-24', format), 'Not in Azure DevOps')
})

test('CAP-58: the filters — nothing ticked is all, Status starts on Active and Left, "Not set" and "Default role" match empty values (TC-CAP-30)', () => {
  const people = [
    entry('Ana', { region: 'India', role: 'QE' }, { roles: ['Admin'], email: 'ana@example.com' }),
    entry('Ben', { region: 'US', role: 'Lead', leftOn: '2026-10-31' }),
    entry('Cleo', { removed: true }),
    entry('Dev', {}, { inAzure: false }),
  ]
  const names = (filters) => filterPeople(people, { ...emptyFilters, ...filters }).map((person) => person.name)
  assert.deepEqual(defaultStatusFilter, ['active', 'left'])
  assert.deepEqual(names({}), ['Ana', 'Ben'], 'the default shows the people in or once in the team')
  assert.deepEqual(names({ status: [] }), ['Ana', 'Ben', 'Cleo', 'Dev'], 'nothing ticked: everyone')
  assert.deepEqual(names({ status: ['not-team', 'not-in-azure'] }), ['Cleo', 'Dev'], 'the old separate lists, one click away')
  assert.deepEqual(names({ status: [], regions: [''] }), ['Cleo', 'Dev'], 'Region: Not set')
  assert.deepEqual(names({ regions: ['US'] }), ['Ben'])
  assert.deepEqual(names({ roles: ['QE', 'Lead'] }), ['Ana', 'Ben'])
  assert.deepEqual(names({ access: ['Admin'] }), ['Ana'])
  assert.deepEqual(names({ access: [''] }), ['Ben'], 'Access role: Default role = no role of their own')
  assert.deepEqual(names({ text: 'ANA example' }), ['Ana'], 'search: every word in the name or email')
  assert.equal(filtersChanged(emptyFilters), false)
  assert.equal(filtersChanged({ ...emptyFilters, status: ['active'] }), true)
  assert.equal(filtersChanged({ ...emptyFilters, status: ['left', 'active'] }), false, 'the default in any order')
  assert.deepEqual(missingOf(people[1]), ['email in Azure DevOps', 'reports to', 'app access role'])
})

test('CAP-59: the drawer saves only what changed — profile fields as a patch, the app access roles apart (TC-CAP-31)', () => {
  const ana = entry('Ana', { region: 'India', role: 'QE', reportsTo: 'Ben', joinedOn: '2026-03-01' }, { roles: ['Team Member'], email: 'ana@example.com' })
  const form = formOf(ana)
  assert.deepEqual(profilePatch(ana, form), {}, 'nothing changed')
  assert.deepEqual(profilePatch(ana, { ...form, region: 'US', peopleManager: true, reportsTo: ' Maria Lopez ', joinedOn: '' }), { region: 'US', peopleManager: true, reportsTo: 'Maria Lopez', joinedOn: undefined })
  assert.deepEqual(profilePatch(ana, { ...form, role: '', reportsTo: 'Ana' }), { role: undefined }, 'nobody reports to themselves')
  assert.equal(sameRoles(['Admin', 'Team Member'], ['Team Member', 'Admin']), true)
  assert.equal(sameRoles(form.roles, ['Admin']), false)
  assert.equal(formError({ ...form, leftOn: '2026-02-01' }), 'Left on cannot be before Time tracking started.')
  assert.equal(formError({ ...form, leftOn: '2026-03-01' }), '', 'the same day is allowed (both days worked)')
})

test('CAP-60: one change for several people merges into their profiles; one access save sets exactly the roles chosen (TC-CAP-32)', () => {
  const profiles = { Ana: { region: 'India', role: 'QE', joinedOn: '2026-03-01' }, Ben: { role: 'Lead', removed: true } }
  const next = patchProfiles(profiles, ['Ana', 'Ben', 'Cleo'], { region: 'US' })
  assert.deepEqual(next, { Ana: { region: 'US', role: 'QE', joinedOn: '2026-03-01' }, Ben: { region: 'US', role: 'Lead', removed: true }, Cleo: { region: 'US' } }, 'only the region changes; everything else is kept')
  assert.deepEqual(patchProfiles(next, ['Ana'], { region: undefined, leftOn: '2026-11-30' }).Ana, { role: 'QE', joinedOn: '2026-03-01', leftOn: '2026-11-30' }, 'undefined clears a field')
  assert.deepEqual(profiles.Ana.region, 'India', 'the profiles given are not changed')
  const policy = defaultPolicy('lead@example.com')
  policy.members['ana@example.com'] = ['Team Member']
  policy.members['ben@example.com'] = ['Scrum Master']
  const result = setRolesFor(policy, [{ name: 'Ana', email: 'Ana@Example.com' }, { name: 'Ben', email: 'ben@example.com' }, { name: 'Cleo' }], ['Team Member', 'Product Owner'])
  assert.deepEqual(result.changed, ['Ana', 'Ben'])
  assert.deepEqual(result.skipped, ['Cleo'], 'no email: skipped and named')
  assert.deepEqual(result.policy.members['ana@example.com'], ['Product Owner', 'Team Member'], 'in the matrix order')
  assert.deepEqual(result.policy.members['ben@example.com'], ['Product Owner', 'Team Member'])
  assert.deepEqual(policy.members['ben@example.com'], ['Scrum Master'], 'the policy given is not changed')
  const cleared = setRolesFor(result.policy, [{ name: 'Ana', email: 'ana@example.com' }], [])
  assert.equal('ana@example.com' in cleared.policy.members, false, 'no role: the default role applies')
  assert.deepEqual(setRolesFor(result.policy, [{ name: 'Ana', email: 'ana@example.com' }], ['Team Member', 'Product Owner']).changed, [], 'nothing to save when the roles are the same')
})
