import test from 'node:test'
import assert from 'node:assert/strict'
import { capacityContext, capacityModel, defaultCapacitySettings, normalizeCapacityRoles, normalizeCapacitySettings, normalizeProfiles, roleExclusion, setAccessRoles } from '../src/capacity.ts'
import { settingsLabel, settingsPages } from '../src/settingsTabs.ts'

const item = (id, extra = {}) => ({ key: `org/project/${id}`, id, title: 'Story', workItemType: 'User Story', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'project', syncedAt: '', ...extra })
const backlog = [
  item(1, { workItemType: 'Epic', title: 'Stream A' }), item(10, { workItemType: 'Feature', parentId: 1, title: 'Release 1' }), item(20, { parentId: 10 }),
  item(30, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Release 1', assignedTo: 'Ana', originalEstimate: 100, completedWork: 100 }),
  item(31, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Release 1', assignedTo: 'Lee', originalEstimate: 40, completedWork: 30 }),
  item(32, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Release 1', assignedTo: 'Pat', originalEstimate: 20, completedWork: 20 }),
]
const base = { ...defaultCapacitySettings, npraHoursPerMonth: 0, absenceEpicId: 900 }

test('CAP-49: a person\'s work email is kept with their profile (checked, lower case)', () => {
  const profiles = normalizeProfiles({ Ana: { email: ' Ana.B@Example.com ', region: 'India' }, Ben: { email: 'not an email' } })
  assert.deepEqual(profiles.Ana, { region: 'India', email: 'ana.b@example.com' })
  assert.equal('Ben' in profiles, false, 'nothing valid left for Ben')
  assert.equal(settingsPages.some((page) => page.key === 'access'), false, 'Access is part of People & access')
  assert.equal(settingsLabel('resources'), 'People & access')
  assert.equal(settingsLabel('access'), 'People & access', 'an old link to Access opens People & access')
})

test('CAP-50: Lead, Manager and People Manager are not counted for capacity by default; the roles are configurable', () => {
  const profiles = { Ana: { role: 'QE', email: 'ana@example.com' }, Lee: { role: 'Lead' }, Pat: { role: 'QE', email: 'pat@example.com' } }
  const settings = { ...base, profiles, accessRoles: { 'pat@example.com': ['People Manager'] } }
  assert.equal(roleExclusion('Ana', settings), undefined)
  assert.equal(roleExclusion('Lee', settings), 'team role Lead')
  assert.equal(roleExclusion('Pat', settings), 'app role People Manager')
  assert.equal(roleExclusion('Ana', { ...settings, profiles: { Ana: { role: 'QE', peopleManager: true } } }), 'People manager', 'the People manager tick counts as the People Manager role')
  const model = capacityModel(backlog, '2026-10', settings)
  assert.deepEqual(model.people.map((person) => person.name), ['Ana'])
  assert.deepEqual(model.notCounted, [{ name: 'Lee', tasks: 1, hours: 30, reason: 'team role Lead' }, { name: 'Pat', tasks: 1, hours: 20, reason: 'app role People Manager' }])
  assert.equal(model.totals.funded, 176, 'only Ana\'s contractual hours')
  // Counting Lead and People Manager again brings both back.
  const all = normalizeCapacitySettings({ ...base, capacityRoles: { excludedResourceRoles: [], excludedAccessRoles: [] } })
  assert.deepEqual(capacityModel(backlog, '2026-10', { ...all, profiles, accessRoles: settings.accessRoles }).people.map((person) => person.name).sort(), ['Ana', 'Lee', 'Pat'])
})

test('CAP-50: capacity roles read from Git are checked; the built-in choice is not stored; access roles come from access.json', () => {
  assert.equal(normalizeCapacityRoles({ excludedResourceRoles: ['Lead', 'Manager'], excludedAccessRoles: ['People Manager'] }), undefined)
  assert.equal(normalizeCapacityRoles('x'), undefined)
  assert.deepEqual(normalizeCapacityRoles({ excludedResourceRoles: ['Lead', 'Pilot'], excludedAccessRoles: ['Admin', 'Owner'] }), { excludedResourceRoles: ['Lead'], excludedAccessRoles: ['Admin'] })
  assert.equal('capacityRoles' in normalizeCapacitySettings({}), false)
  setAccessRoles({ 'Pat@Example.com': ['People Manager'] })
  assert.deepEqual(capacityContext({}).accessRoles, { 'pat@example.com': ['People Manager'] })
  setAccessRoles(undefined)
  assert.deepEqual(capacityContext({}).accessRoles, {})
})
