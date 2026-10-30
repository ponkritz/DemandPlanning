import test from 'node:test'
import assert from 'node:assert/strict'
import { capacityModel, absenceKind, loadStatus, normalizeCapacitySettings, defaultCapacitySettings, employedDays } from '../src/capacity.ts'

const item = (id, extra = {}) => ({ key: `org/project/${id}`, id, title: 'Release - Time Writing', workItemType: 'User Story', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'project', syncedAt: '', ...extra })
// Two streams (Epics 1 and 2) plus the absence Epic 900 with a per-person PTO / Sick Feature.
const backlog = [
  item(1, { workItemType: 'Epic', title: 'Stream A' }), item(2, { workItemType: 'Epic', title: 'Stream B' }), item(900, { workItemType: 'Epic', title: 'Absence' }),
  item(10, { workItemType: 'Feature', parentId: 1, title: 'Release 1' }), item(11, { workItemType: 'Feature', parentId: 2, title: 'Release 2' }),
  item(20, { parentId: 10 }), item(21, { parentId: 11 }),
  item(30, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Release 1', assignedTo: 'Ana', originalEstimate: 100, completedWork: 120 }),
  item(31, { workItemType: 'Task', parentId: 21, title: 'October 2026 | Release 2', assignedTo: 'Ana', originalEstimate: 20, completedWork: 40 }),
  item(32, { workItemType: 'Task', parentId: 21, title: 'October 2026 | Release 2', assignedTo: 'Ben', originalEstimate: 60, completedWork: 50 }),
  item(33, { workItemType: 'Task', parentId: 21, title: 'September 2026 | Release 2', assignedTo: 'Ben', completedWork: 999 }),
  item(40, { workItemType: 'Feature', parentId: 900, title: 'Ana - PTO', assignedTo: 'Ana' }), item(41, { parentId: 40, title: 'Ana - Time Writing' }),
  item(42, { workItemType: 'Task', parentId: 41, title: 'October 2026 | Ana - PTO', assignedTo: 'Ana', completedWork: 16 }),
  item(43, { workItemType: 'Task', parentId: 41, title: 'October 2026 | Ana - Sick leave', assignedTo: 'Ana', completedWork: 8 }),
  item(50, { workItemType: 'Task', parentId: 21, title: 'October 2026 | Removed', state: 'Removed', assignedTo: 'Ben', completedWork: 500 }),
]
const settings = { ...defaultCapacitySettings, npraHoursPerMonth: 0, absenceEpicId: 900 }

test('per-person load deducts absence from funded hours and classifies utilization', () => {
  const model = capacityModel(backlog, '2026-10', settings)
  assert.equal(model.workingDays, 22); assert.equal(model.fundedPerPerson, 176)
  const ana = model.people.find((person) => person.name === 'Ana'), ben = model.people.find((person) => person.name === 'Ben')
  assert.equal(ana.absence, 24); assert.equal(ana.absenceByKind.PTO, 16); assert.equal(ana.absenceByKind['Sick Leave'], 8)
  assert.equal(ana.available, 152); assert.equal(ana.work, 160); assert.equal(ana.planned, 120)
  assert.equal(ana.utilization, 105.26); assert.equal(ana.status, 'Overloaded')
  assert.equal(ben.absence, 0); assert.equal(ben.work, 50); assert.equal(ben.utilization, 28.41); assert.equal(ben.status, 'Has capacity')
  assert.equal(model.people[0].name, 'Ana', 'sorted by utilization descending')
  assert.deepEqual(model.counts, { npraOver: 0, overloaded: 1, balanced: 0, hasCapacity: 1, noBookings: 0 })
})
test('streams are Epics with hours, people and feature counts; absence is not a stream', () => {
  const model = capacityModel(backlog, '2026-10', settings)
  assert.deepEqual(model.streams.map((stream) => [stream.title, stream.work, stream.planned, stream.people, stream.features]), [['Stream A', 120, 100, 1, 1], ['Stream B', 90, 80, 2, 1]])
  assert.equal(model.streams[0].share, 57.14)
  const ana = model.people.find((person) => person.name === 'Ana')
  assert.deepEqual(ana.streams.map((stream) => [stream.title, stream.work]), [['Stream A', 120], ['Stream B', 40]])
  assert.equal(model.totals.work, 210); assert.equal(model.totals.absence, 24); assert.equal(model.totals.funded, 352); assert.equal(model.totals.available, 328)
  assert.equal(model.totals.utilization, 64.02)
})
test('absence kinds are read from task and ancestor titles', () => {
  assert.equal(absenceKind(['October 2026 | Ana', 'Ana - PTO']), 'PTO')
  assert.equal(absenceKind(['Vacation']), 'PTO'); assert.equal(absenceKind(['Sick day']), 'Sick Leave')
  assert.equal(absenceKind(['Unplanned leave', 'Ana - PTO']), 'Unplanned Leave'); assert.equal(absenceKind(['Something else']), 'Other absence')
})
test('status thresholds and settings normalisation', () => {
  assert.equal(loadStatus(null, defaultCapacitySettings), 'No bookings'); assert.equal(loadStatus(100, defaultCapacitySettings), 'Overloaded')
  assert.equal(loadStatus(79.9, defaultCapacitySettings), 'Has capacity'); assert.equal(loadStatus(80, defaultCapacitySettings), 'Balanced')
  assert.deepEqual(normalizeCapacitySettings(undefined), defaultCapacitySettings)
  assert.deepEqual(normalizeCapacitySettings({ absenceEpicId: '123', hoursPerDay: 7.5, overloadedAt: 110, availableBelow: 70 }), { absenceEpicId: 123, hoursPerDay: 7.5, overloadedAt: 110, availableBelow: 70, npraHoursPerMonth: 20, defaultJoinedOn: '2026-05-01' })
  assert.deepEqual(normalizeCapacitySettings({ overloadedAt: 50, availableBelow: 90 }), defaultCapacitySettings, 'inverted thresholds fall back')
  assert.throws(() => capacityModel([], '2026-13'))
})
test('people without month tasks are absent from the model and no-bookings only applies to absence-only people', () => {
  const model = capacityModel([item(900, { workItemType: 'Epic' }), item(40, { workItemType: 'Feature', parentId: 900, title: 'Cy - PTO' }), item(41, { parentId: 40, title: 'Cy - Time Writing' }), item(42, { workItemType: 'Task', parentId: 41, title: 'October 2026 | PTO', assignedTo: 'Cy', completedWork: 8 })], '2026-10', settings)
  assert.equal(model.people.length, 1); assert.equal(model.people[0].status, 'No bookings'); assert.equal(model.people[0].utilization, null); assert.equal(model.totals.utilization, null)
})

import { capacityContext, holidayRegion, normalizeProfiles } from '../src/capacity.ts'
import { sampleDataset as regionalSample, sampleProfiles } from '../src/sampleData.ts'
test('holiday Features are recognised by region name; person absence Features are not', () => {
  assert.equal(holidayRegion('Public Holidays - India'), 'India')
  assert.equal(holidayRegion('Regional holiday NL'), 'Netherlands')
  assert.equal(holidayRegion('Holidays - United States'), 'US')
  assert.equal(holidayRegion('US Holidays'), 'US')
  assert.equal(holidayRegion('Ana Costa - Absence'), null)
  assert.equal(holidayRegion('Holidays for us all'), null, 'lower-case "us" is not the US')
  assert.equal(holidayRegion('Public Holidays'), null, 'no region, no mapping')
})

test('resource profiles keep only known regions and roles, never self as manager', () => {
  assert.deepEqual(normalizeProfiles({ A: { region: 'India', role: 'QE', reportsTo: 'B', peopleManager: true }, B: { region: 'Mars', role: 'Pilot', reportsTo: 'B' }, '': { region: 'US' }, C: 'x' }), { A: { region: 'India', role: 'QE', reportsTo: 'B', peopleManager: true } })
  assert.deepEqual(normalizeProfiles(null), {})
  const settings = capacityContext({ capacitySettings: { hoursPerDay: 7 }, resourceProfiles: { A: { region: 'US' } } })
  assert.equal(settings.hoursPerDay, 7); assert.deepEqual(settings.profiles, { A: { region: 'US' } })
})

test('regional holidays apply to everyone mapped to the region, not to the assignee', () => {
  const { items } = regionalSample({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const without = capacityModel(items, '2026-10', { ...defaultCapacitySettings, npraHoursPerMonth: 0 })
  const withProfiles = capacityModel(items, '2026-10', capacityContext({ capacitySettings: { npraHoursPerMonth: 0 }, resourceProfiles: sampleProfiles }))
  // October in the sample has one India holiday (8h); India people are Chen Wei and Diya Sharma.
  assert.deepEqual(withProfiles.holidays, [{ region: 'India', hours: 8, people: 2 }])
  assert.equal(without.people.some((person) => person.name === 'Unassigned'), false, 'unassigned holiday Tasks do not create a person')
  for (const person of withProfiles.people) {
    const before = without.people.find((entry) => entry.name === person.name)
    const expected = sampleProfiles[person.name]?.region === 'India' ? 8 : 0
    assert.equal(person.absence - before.absence, expected, person.name)
    assert.equal(person.absenceByKind['Public holiday'], expected)
    assert.equal(person.available, Math.max(0, person.funded - person.absence - person.reserved - person.npraDeducted))
  }
  assert.equal(withProfiles.totals.absenceByKind['Public holiday'], 16)
  assert.equal(without.totals.absenceByKind['Public holiday'], 0, 'no region mapped, nothing applied')
})

import { itemsForPerson } from '../src/capacity.ts'
test('individual overview: only that person\'s Tasks, hierarchy kept, regional holidays still applied', () => {
  const { items } = regionalSample({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const settings = capacityContext({ resourceProfiles: sampleProfiles })
  const mine = itemsForPerson(items, { name: 'Chen Wei' }, settings)
  assert.ok(mine.filter((item) => item.workItemType === 'Task').every((task) => task.assignedTo === 'Chen Wei' || task.assignedTo === ''), 'only Chen\'s tasks plus unassigned holiday tasks')
  assert.equal(mine.filter((item) => item.workItemType !== 'Task').length, items.filter((item) => item.workItemType !== 'Task').length, 'all Epics, Features and Stories kept')
  const team = capacityModel(items, '2026-10', settings), alone = capacityModel(mine, '2026-10', settings)
  assert.deepEqual(alone.people.map((person) => person.name), ['Chen Wei'])
  const teamChen = team.people.find((person) => person.name === 'Chen Wei'), aloneChen = alone.people[0]
  assert.deepEqual([aloneChen.work, aloneChen.absence, aloneChen.utilization], [teamChen.work, teamChen.absence, teamChen.utilization], 'same numbers as in the team view, India holiday included')
  assert.equal(aloneChen.absenceByKind['Public holiday'], 8)
})

import { itemsForTeam } from '../src/capacity.ts'
test('team overview by region and roles: only matching people, the region\'s holidays; nothing chosen = everyone', () => {
  const { items } = regionalSample({ organization: 'Org', project: 'Quality', team: 'T' }, '2026-10')
  const settings = capacityContext({ resourceProfiles: sampleProfiles })
  assert.equal(itemsForTeam(items, { roles: [] }, settings), items, 'no filter: the whole team')
  const people = (filter) => capacityModel(itemsForTeam(items, filter, settings), '2026-10', settings).people.map((person) => person.name).sort()
  const everyone = capacityModel(items, '2026-10', settings).people.map((person) => person.name)
  const regionOf = (name) => sampleProfiles[name]?.region, roleOf = (name) => sampleProfiles[name]?.role
  for (const region of ['India', 'Netherlands', 'US']) assert.deepEqual(people({ region, roles: [] }), everyone.filter((name) => regionOf(name) === region).sort(), region)
  const roles = [...new Set(everyone.map(roleOf).filter(Boolean))].slice(0, 2)
  assert.deepEqual(people({ roles }), everyone.filter((name) => roles.includes(roleOf(name))).sort(), 'several roles at once')
  assert.deepEqual(people({ region: 'India', roles }), everyone.filter((name) => regionOf(name) === 'India' && roles.includes(roleOf(name))).sort(), 'region and roles together')
  const india = capacityModel(itemsForTeam(items, { region: 'India', roles: [] }, settings), '2026-10', settings)
  const indiaInTeam = capacityModel(items, '2026-10', settings).people.filter((person) => regionOf(person.name) === 'India')
  assert.deepEqual(india.people.map((person) => [person.name, person.absence]).sort(), indiaInTeam.map((person) => [person.name, person.absence]).sort(), 'same absence (holidays) as in the team view')
})

test('holidays and common activities: mapped Epics / Features apply their month Tasks to everyone in scope', async () => {
  const { normalizeSharedTime, sharedTimeOf, itemsForTeam } = await import('../src/capacity.ts')
  const events = [
    item(700, { workItemType: 'Epic', title: 'Common activities' }),
    item(701, { workItemType: 'Feature', parentId: 700, title: 'PI Planning' }), item(702, { parentId: 701, title: 'PI Planning - Time Writing' }),
    item(703, { workItemType: 'Task', parentId: 702, title: 'October 2026 | PI Planning', assignedTo: 'Ana', originalEstimate: 16, completedWork: 12 }),
    item(711, { workItemType: 'Feature', parentId: 700, title: 'Site audit NL' }), item(712, { parentId: 711, title: 'Audit - Time Writing' }),
    item(713, { workItemType: 'Task', parentId: 712, title: 'October 2026 | Site audit', assignedTo: 'Ben' }),
    item(60, { workItemType: 'Feature', parentId: 900, title: 'Public Holidays - India' }), item(61, { parentId: 60, title: 'Holidays - Time Writing' }),
    item(62, { workItemType: 'Task', parentId: 61, title: 'October 2026 | Diwali', originalEstimate: 8 }),
  ]
  const profiles = { Ana: { region: 'India' }, Ben: { region: 'Netherlands' } }
  const sharedTime = [{ id: 700, kind: 'activity', scope: 'everyone', label: 'Common activities' }, { id: 711, kind: 'activity', scope: 'Netherlands' }]
  const model = capacityModel([...backlog, ...events], '2026-10', { ...settings, sharedTime, profiles })
  const ana = model.people.find((person) => person.name === 'Ana'), ben = model.people.find((person) => person.name === 'Ben')
  assert.deepEqual([ana.reserved, ben.reserved], [16, 16 + 8], 'PI Planning (16h: Original Estimate first) for everyone; the NL audit (no hours: one working day) for Ben only, by the nearer mapping')
  assert.equal(ana.available, ana.funded - ana.absence - 16, 'reserved time lowers available capacity')
  assert.equal(ana.absenceByKind['Public holiday'], 8, 'the India holiday Feature still applies by its name')
  assert.equal(ben.absenceByKind['Public holiday'], 0)
  assert.equal(ana.work, 160, 'the PI Planning Task assigned to Ana is not her booked work')
  const summary = Object.fromEntries(model.sharedTime.map((entry) => [entry.id, [entry.kind, entry.scope, entry.hours, entry.people, entry.title]]))
  assert.deepEqual(summary, { 700: ['activity', 'everyone', 16, 2, 'Common activities'], 711: ['activity', 'Netherlands', 8, 1, 'Site audit NL'], 60: ['holiday', 'India', 8, 1, 'Public Holidays - India'] })
  assert.equal(model.totals.reserved, 40)
  // Mapping the holiday Feature explicitly replaces the name rule, without counting twice.
  const mapped = capacityModel([...backlog, ...events], '2026-10', { ...settings, profiles, sharedTime: [{ id: 60, kind: 'holiday', scope: 'everyone' }] })
  assert.deepEqual(Object.fromEntries(mapped.people.map((person) => [person.name, person.absenceByKind['Public holiday']])), { Ana: 8, Ben: 8 }, 'mapped for everyone: 8h each, not 16h for Ana')
  assert.deepEqual(mapped.sharedTime.map((entry) => entry.id), [60])
  // Saved settings keep only valid mappings, one per ID.
  assert.deepEqual(normalizeSharedTime([{ id: 5, kind: 'activity', scope: 'everyone' }, { id: 5, kind: 'holiday', scope: 'US', label: ' US ' }, { id: 0, kind: 'activity', scope: 'everyone' }, { id: 6, kind: 'party', scope: 'everyone' }, { id: 7, kind: 'holiday', scope: 'Mars' }]), [{ id: 5, kind: 'holiday', scope: 'US', label: 'US' }])
  assert.deepEqual(normalizeCapacitySettings({ ...settings, sharedTime }).sharedTime, sharedTime)
  assert.equal('sharedTime' in normalizeCapacitySettings(settings), false)
  // Region filters keep everyone's activities and the region's own ones.
  const byId = new Map([...backlog, ...events].map((entry) => [entry.id, entry]))
  const chain = (id) => { const out = []; let current = byId.get(byId.get(id).parentId); while (current) { out.push(current); current = byId.get(current.parentId) } return out }
  assert.equal(sharedTimeOf(byId.get(713), chain(713), { ...settings, sharedTime }).id, 711, 'the nearest mapping wins')
  const india = itemsForTeam([...backlog, ...events], { region: 'India', roles: [] }, { ...settings, sharedTime, profiles }).filter((entry) => entry.workItemType === 'Task').map((entry) => entry.id)
  assert.deepEqual([india.includes(703), india.includes(713), india.includes(62)], [true, false, true])
})

// NPRA: Tasks tagged NPRA (or under a tagged Feature) are not project work; only the booked NPRA hours come off the
// available hours, and they are tracked against the per-person maximum (hours over it are flagged).
test('NPRA: only booked hours are deducted; tracked against the per-person maximum, hours over it flagged', () => {
  const withNpra = [...backlog,
    item(12, { workItemType: 'Feature', parentId: 2, title: 'Trainings', tags: 'NPRA Hours; Training' }), item(22, { parentId: 12 }),
    item(60, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Stand-ups', assignedTo: 'Ana', tags: 'npra', originalEstimate: 10, completedWork: 12 }),
    item(61, { workItemType: 'Task', parentId: 22, title: 'October 2026 | White belt', assignedTo: 'Ben', originalEstimate: 20, completedWork: 30 }),
  ]
  const model = capacityModel(withNpra, '2026-10', { ...settings, npraHoursPerMonth: 20 })
  const ana = model.people.find((person) => person.name === 'Ana'), ben = model.people.find((person) => person.name === 'Ben')
  assert.deepEqual([ana.npra, ana.npraPlanned, ana.npraTasks, ana.npraAllowance, ana.npraOver, ana.npraDeducted], [12, 10, 1, 20, 0, 12], 'Ana: within the 20h maximum; only the 12h booked are deducted')
  assert.equal(ana.available, 176 - 24 - 12); assert.equal(ana.work, 160, 'NPRA hours are not project work')
  assert.deepEqual([ben.npra, ben.npraOver, ben.npraDeducted], [30, 10, 30], 'Ben: 10h over the maximum is flagged, the 30h booked come off the funded hours')
  assert.equal(ben.available, 176 - 30); assert.equal(ben.work, 50)
  assert.deepEqual([model.totals.npra, model.totals.npraDeducted, model.totals.npraOver, model.counts.npraOver], [42, 42, 10, 1])
  assert.equal(model.totals.available, 176 * 2 - 24 - 42)
  assert.ok(!model.streams.some((stream) => stream.title === 'Trainings'), 'NPRA is not a stream')
  const tracked = capacityModel(withNpra, '2026-10', { ...settings, npraHoursPerMonth: 0 })
  const anaTracked = tracked.people.find((person) => person.name === 'Ana')
  assert.deepEqual([anaTracked.npra, anaTracked.npraAllowance, anaTracked.npraOver, anaTracked.npraDeducted, anaTracked.available], [12, 0, 0, 12, 176 - 24 - 12], 'maximum 0: no maximum to exceed, booked NPRA hours still come off the available hours')
  assert.equal(capacityModel(withNpra, '2026-10', { absenceEpicId: 900, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80 }).people.find((person) => person.name === 'Ana').npraAllowance, 20, 'settings without the field take the default 20h')
  assert.equal(normalizeCapacitySettings({ npraHoursPerMonth: -5 }).npraHoursPerMonth, 20); assert.equal(normalizeCapacitySettings({ npraHoursPerMonth: 0 }).npraHoursPerMonth, 0)
})

test('NPRA: nobody is charged for NPRA they did not book', () => {
  const model = capacityModel(backlog, '2026-10', { ...settings, npraHoursPerMonth: 20 })
  for (const person of model.people) { assert.equal(person.npraDeducted, 0, person.name); assert.equal(person.available, person.funded - person.absence - person.reserved) }
  assert.equal(model.totals.npraDeducted, 0)
})

test('joined on / left on: funded hours for the working days employed; before joining or after leaving, not counted (TC-CAP-04)', () => {
  assert.equal(employedDays('2026-10'), 22)
  assert.equal(employedDays('2026-10', { leftOn: '2026-10-14' }), 10, 'Thu 1 – Wed 14 October: the leaving day is worked')
  assert.equal(employedDays('2026-10', { joinedOn: '2026-10-26' }), 5, 'Mon 26 – Fri 30')
  assert.equal(employedDays('2026-10', { joinedOn: '2026-10-05', leftOn: '2026-10-09' }), 5)
  assert.equal(employedDays('2026-10', { leftOn: '2026-09-30' }), 0)
  assert.deepEqual(normalizeProfiles({ Ana: { joinedOn: '2026-02-30', leftOn: 'soon' }, Ben: { joinedOn: '2026-10-10', leftOn: '2026-10-01' }, Chen: { leftOn: '2026-10-14' } }), { Ben: { joinedOn: '2026-10-10' }, Chen: { leftOn: '2026-10-14' } }, 'invalid dates and a leaving date before the joining date are dropped')
  const model = capacityModel(backlog, '2026-10', { ...settings, profiles: { Ben: { leftOn: '2026-10-14' }, Ana: { joinedOn: '2026-11-02' } } })
  assert.deepEqual(model.people.map((person) => [person.name, person.employedDays, person.funded, person.utilization]), [['Ben', 10, 80, 62.5]], 'Ben prorated; Ana joins in November, so not counted in October')
  assert.equal(model.totals.funded, 80)
  assert.deepEqual(model.prorated, [{ name: 'Ben', days: 10, funded: 80 }])
  assert.deepEqual(model.outsideEmployment, [{ name: 'Ana', tasks: 4, hours: 184, joinedOn: '2026-11-02', leftOn: undefined }], 'her October hours are listed to be checked')
  assert.equal(capacityModel(backlog, '2026-10', settings).totals.funded, 352, 'without dates everyone has the full month')
})

test('default Joined on (1 May 2026 unless changed): months before it give no capacity; a person’s own date wins; cleared means none (TC-CAP-05)', () => {
  assert.equal(normalizeCapacitySettings(undefined).defaultJoinedOn, '2026-05-01')
  assert.equal(normalizeCapacitySettings({ defaultJoinedOn: '' }).defaultJoinedOn, '', 'cleared stays cleared')
  assert.equal(normalizeCapacitySettings({ defaultJoinedOn: '2026-02-30' }).defaultJoinedOn, '2026-05-01', 'an invalid day falls back')
  const april = backlog.map((entry) => ({ ...entry, title: entry.title.replace('October 2026', 'April 2026') }))
  const before = capacityModel(april, '2026-04', settings)
  assert.deepEqual([before.people.length, before.totals.funded, before.outsideEmployment.map((person) => person.name).sort()], [0, 0, ['Ana', 'Ben']], 'April 2026: before the default joining date, nobody counts')
  const own = capacityModel(april, '2026-04', { ...settings, profiles: { Ben: { joinedOn: '2026-01-05' } } })
  assert.deepEqual(own.people.map((person) => [person.name, person.funded]), [['Ben', 176]], 'Ben’s own Joined on wins')
  assert.equal(capacityModel(april, '2026-04', { ...settings, defaultJoinedOn: '' }).people.length, 2, 'without a default everyone counts')
  assert.equal(capacityModel(backlog, '2026-10', settings).people.length, 2, 'from May 2026 on, everyone counts')
})
