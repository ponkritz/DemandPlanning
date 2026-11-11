import test from 'node:test'
import assert from 'node:assert/strict'
import { capacityModel, defaultCapacitySettings, normalizeCapacitySettings, oldCalculation } from '../src/capacity.ts'
import { allProfiles, defaultProfile, lockedPeople, profileFormula, withViewedProfile } from '../src/calculationProfiles.ts'

const item = (id, extra = {}) => ({ key: `org/project/${id}`, id, title: 'Release - Time Writing', workItemType: 'User Story', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'project', syncedAt: '', ...extra })
// Ana: work 160 h (plan 120), PTO 16 + sick 8 without an estimate; Ben: work 50 h (plan 60). October 2026: 22 days × 8 h.
const backlog = [
  item(1, { workItemType: 'Epic', title: 'Stream A' }), item(2, { workItemType: 'Epic', title: 'Stream B' }), item(900, { workItemType: 'Epic', title: 'Absence' }),
  item(10, { workItemType: 'Feature', parentId: 1, title: 'Release 1' }), item(11, { workItemType: 'Feature', parentId: 2, title: 'Release 2' }),
  item(20, { parentId: 10 }), item(21, { parentId: 11 }),
  item(30, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Release 1', assignedTo: 'Ana', originalEstimate: 100, completedWork: 120 }),
  item(31, { workItemType: 'Task', parentId: 21, title: 'October 2026 | Release 2', assignedTo: 'Ana', originalEstimate: 20, completedWork: 40 }),
  item(32, { workItemType: 'Task', parentId: 21, title: 'October 2026 | Release 2', assignedTo: 'Ben', originalEstimate: 60, completedWork: 50 }),
  item(40, { workItemType: 'Feature', parentId: 900, title: 'Ana - PTO', assignedTo: 'Ana' }), item(41, { parentId: 40, title: 'Ana - Time Writing' }),
  item(42, { workItemType: 'Task', parentId: 41, title: 'October 2026 | Ana - PTO', assignedTo: 'Ana', completedWork: 16 }),
  item(43, { workItemType: 'Task', parentId: 41, title: 'October 2026 | Ana - Sick leave', assignedTo: 'Ana', completedWork: 8 }),
]
const withNpra = [...backlog,
  item(12, { workItemType: 'Feature', parentId: 2, title: 'Trainings', tags: 'NPRA Hours; Training' }), item(22, { parentId: 12 }),
  item(60, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Stand-ups', assignedTo: 'Ana', tags: 'npra', originalEstimate: 10, completedWork: 12 }),
  item(61, { workItemType: 'Task', parentId: 22, title: 'October 2026 | White belt', assignedTo: 'Ben', originalEstimate: 20, completedWork: 30 }),
]
const settings = { ...defaultCapacitySettings, npraHoursPerMonth: 0, absenceEpicId: 900 }
const person = (model, name) => model.people.find((entry) => entry.name === name)
const figures = (entry) => [entry.available, entry.utilized, entry.utilizedPlanned, entry.utilization, entry.plannedUtilization, entry.status]
const finance = { id: 'finance', name: 'Finance view', treatment: { work: 'count', absence: 'ignore', training: 'deduct', npraOther: 'count', common: 'ignore' }, plannedSource: { work: 'completed' }, capacityBase: 'fixed', fixedHours: 160, minusStandardHours: true, statusFrom: 'planned' }

test('CAP-41/42: the default profile is "Current (v4)" (CAP-38) until another one is chosen', () => {
  const model = capacityModel(backlog, '2026-10', settings)
  assert.deepEqual(allProfiles(settings).map((profile) => [profile.id, profile.name, profile.builtIn]), [['current-v4', 'Current (v4)', true], ['old-calculation', 'Old Calculation', true]])
  assert.equal(model.profile.name, 'Current (v4)')
  assert.deepEqual(figures(person(model, 'Ana')), [152, 160, 120, 105.26, 78.95, 'Overloaded'])
  assert.match(model.profile.formula, /Actual utilization = Total actual ÷ Available hours; Planned utilization = Total planned ÷ Available hours\. Total actual = Project work \+ Training \+ Other NPRA \+ Common activities \(Completed Work\).*Available hours = Contractual hours \(working days employed × Working hours per day, 8h\) − Absence hours/)
})

test('CAP-41: the built-in "Old Calculation" profile gives the Old Calculation figures; status from the plan', () => {
  const chosen = normalizeCapacitySettings({ ...settings, defaultProfileId: 'old-calculation' })
  assert.equal(chosen.defaultProfileId, 'old-calculation')
  const model = capacityModel(backlog, '2026-10', chosen)
  const old = oldCalculation(capacityModel(backlog, '2026-10', settings)).rows
  for (const row of old) {
    const entry = person(model, row.name)
    assert.deepEqual([entry.available, entry.utilizedPlanned, entry.utilized, entry.plannedUtilization, entry.utilization, entry.status], [row.netCapacity, row.planned, row.actual, row.plannedUtilization, row.actualUtilization, row.status], row.name)
  }
  // Ana: 176 − 32 Standard Hours = 144; plan 120 + 24 absence (no estimate: Completed Work); recorded 160 + 24.
  assert.deepEqual(figures(person(model, 'Ana')), [144, 184, 144, 127.78, 100, 'Overloaded'])
})

test('CAP-41: a custom profile — fixed base, Standard Hours, a deducted, counted and ignored bucket, plan source, status from the plan', () => {
  const custom = normalizeCapacitySettings({ ...settings, calculationProfiles: [finance], defaultProfileId: 'finance' })
  const model = capacityModel(withNpra, '2026-10', custom)
  // Ana: 160 − 32 = 128 (absence ignored); recorded 160 work + 12 other NPRA; plan 160 (work: Completed Work) + 10.
  assert.deepEqual(figures(person(model, 'Ana')), [128, 172, 170, 134.38, 132.81, 'Overloaded'])
  // Ben: 160 − 32 − 30 h training deducted = 98; recorded 50 work; plan 50 (Completed Work).
  assert.deepEqual(figures(person(model, 'Ben')), [98, 50, 50, 51.02, 51.02, 'Has capacity'])
  assert.deepEqual([model.totals.available, model.totals.utilized], [226, 222])
  assert.equal(model.profile.name, 'Finance view')
  assert.equal(profileFormula(defaultProfile(custom), custom), 'Profile “Finance view”: Actual utilization = Total actual ÷ Available hours; Planned utilization = Total planned ÷ Available hours. Total actual = Project work + Other NPRA (Completed Work); Total planned = the same from Original Estimate (Project work: Completed Work). Available hours = Contractual hours (160h a month, pro rata to the days employed) − Standard Hours (32h) − Training hours (never below 0 per person). Ignored: Absence, Common activities. Status from the planned utilization.')
  // The fixed hours are pro rata to the days employed: Ben joins on 16 October (11 of 22 working days): 80 − 32 − 30.
  const joined = capacityModel(withNpra, '2026-10', { ...custom, profiles: { Ben: { joinedOn: '2026-10-16' } } })
  assert.equal(person(joined, 'Ben').available, 18)
})

test('CAP-41: a shared-time group left out of a profile leaves every bucket', () => {
  const holiday = [item(70, { workItemType: 'Feature', parentId: 900, title: 'Holidays' }), item(71, { parentId: 70, title: 'Holidays - Time Writing' }), item(72, { workItemType: 'Task', parentId: 71, title: 'October 2026 | Diwali', originalEstimate: 8, completedWork: 8 })]
  const base = { ...settings, sharedTime: [{ id: 70, kind: 'holiday', scope: 'India' }] }
  const v4copy = { ...allProfiles(settings)[0], id: 'no-india', name: 'Without India holidays', builtIn: undefined, excludedGroups: ['India'] }
  const run = (extra) => person(capacityModel([...backlog, ...holiday], '2026-10', { ...normalizeCapacitySettings({ ...base, ...extra }), profiles: { Ana: { region: 'India' } } }), 'Ana').available
  assert.equal(run({}), 144, 'v4: 176 − 24 absence − 8 India holiday')
  assert.equal(run({ calculationProfiles: [v4copy], defaultProfileId: 'no-india' }), 152)
})

test('CAP-41: profiles read from Git are checked; unknown defaults fall back to "Current (v4)"', () => {
  const read = normalizeCapacitySettings({ calculationProfiles: [
    { ...finance, id: 'current-v4' }, { ...finance, id: 'Bad Id' }, { id: 'none', treatment: { absence: 'deduct' } }, { ...finance, id: 'zero', fixedHours: 0 },
    { id: 'ok', name: '  Mine  ', treatment: { work: 'count', absence: 'bogus' }, plannedSource: { work: 'nope' }, excludedGroups: ['US', 'Mars'], statusFrom: 'x', minusStandardHours: 'yes' }, { ...finance, id: 'ok' },
  ], defaultProfileId: 'ok' })
  assert.deepEqual(read.calculationProfiles, [{ id: 'ok', name: 'Mine', treatment: { work: 'count', absence: 'ignore', training: 'ignore', npraOther: 'ignore', common: 'ignore' }, plannedSource: { work: 'estimate', absence: 'estimate', training: 'estimate', npraOther: 'estimate', common: 'estimate' }, capacityBase: 'workingDays', minusStandardHours: false, excludedGroups: ['US'], statusFrom: 'actual' }])
  assert.equal(read.defaultProfileId, 'ok')
  assert.equal('defaultProfileId' in normalizeCapacitySettings({ defaultProfileId: 'missing' }), false)
  assert.equal('defaultProfileId' in normalizeCapacitySettings({ defaultProfileId: 'current-v4' }), false, 'the built-in default needs no entry')
  assert.equal('calculationProfiles' in normalizeCapacitySettings({}), false)
})

test('CAP-43: locked figures stay as locked when the data, the settings or the profile change; unlocking shows the live figures', () => {
  const before = capacityModel(backlog, '2026-10', settings)
  const lock = { lockedOn: '2026-11-09T10:00:00.000Z', lockedBy: 'Admin One', profileName: before.profile.name, formula: before.profile.formula, people: lockedPeople(before.people) }
  const locked = normalizeCapacitySettings(JSON.parse(JSON.stringify({ ...settings, figureLocks: { '2026-10': [lock] } })))
  const later = [...backlog, item(80, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Release 1', assignedTo: 'Ana', originalEstimate: 50, completedWork: 100 })]
  const after = capacityModel(later, '2026-10', { ...locked, hoursPerDay: 7, defaultProfileId: 'old-calculation' })
  assert.deepEqual(after.people.map(figures), before.people.map(figures))
  assert.deepEqual([after.totals.available, after.totals.utilized, after.totals.utilization], [before.totals.available, before.totals.utilized, before.totals.utilization])
  assert.deepEqual(after.locked, { lockedOn: lock.lockedOn, lockedBy: 'Admin One', profileName: 'Current (v4)' })
  assert.equal(after.profile.name, 'Current (v4)', 'the profile it was locked with')
  assert.equal(capacityModel(later, '2026-09', locked).locked, undefined, 'other months stay live')
  const unlocked = normalizeCapacitySettings({ ...locked, figureLocks: { '2026-10': [{ ...lock, unlockedOn: '2026-11-10T09:00:00.000Z', unlockedBy: 'Admin One', unlockReason: 'Late PTO booked' }] } })
  assert.equal(unlocked.figureLocks['2026-10'][0].unlockReason, 'Late PTO booked', 'kept as history')
  const live = capacityModel(later, '2026-10', unlocked)
  assert.equal(live.locked, undefined)
  assert.equal(person(live, 'Ana').utilized, 260)
})

test('CAP-43: locked figures read from Git are checked', () => {
  const read = normalizeCapacitySettings({ figureLocks: {
    'bad': [{ lockedOn: 'x', people: [] }], '2026-09': 'nope', '2026-08': [{ people: [] }],
    '2026-10': [...Array.from({ length: 6 }, (_, at) => ({ lockedOn: `2026-11-0${at + 1}`, lockedBy: 'A', people: [] })), { lockedOn: '2026-11-09', lockedBy: 'B'.repeat(300), profileName: 'P', formula: 'f', people: [{ name: '' }, { name: 'Ana', funded: 'abc', utilization: 'x', status: 'Super', absenceByKind: { PTO: 8, Mars: 1 }, sharedByScope: { Mars: { planned: 1 }, US: { planned: 2, actual: 'y' } }, streams: [{ key: 'k', title: 't', work: 5, epic: { id: 1 } }, {}] }] }],
  } })
  assert.deepEqual(Object.keys(read.figureLocks), ['2026-10'])
  assert.equal(read.figureLocks['2026-10'].length, 5, 'the latest five per month')
  const last = read.figureLocks['2026-10'].at(-1)
  assert.equal(last.lockedBy.length, 200)
  assert.equal(last.people.length, 1)
  const [ana] = last.people
  assert.deepEqual([ana.name, ana.funded, ana.utilization, ana.status, ana.absenceByKind.PTO, 'Mars' in ana.absenceByKind], ['Ana', 0, null, 'No bookings', 8, false])
  assert.deepEqual(ana.sharedByScope, { US: { planned: 2, actual: 0 } })
  assert.deepEqual(ana.streams, [{ key: 'k', title: 't', work: 5, planned: 0, tasks: 0 }])
})

test('CAP-44: viewing a page with another profile changes only the settings that page computes with', () => {
  const shared = normalizeCapacitySettings({ ...settings, calculationProfiles: [finance] })
  const viewed = withViewedProfile(shared, 'old-calculation')
  assert.equal(defaultProfile(viewed).name, 'Old Calculation')
  assert.equal(defaultProfile(shared).name, 'Current (v4)', 'the shared settings are not changed')
  assert.deepEqual(figures(person(capacityModel(backlog, '2026-10', viewed), 'Ana')), [144, 184, 144, 127.78, 100, 'Overloaded'])
  assert.equal(withViewedProfile(shared, ''), shared, 'no choice: the default')
  assert.equal(withViewedProfile(shared, 'missing'), shared, 'an unknown profile: the default')
  assert.equal(defaultProfile(withViewedProfile(shared, 'finance')).name, 'Finance view')
  // A locked month keeps its locked figures whatever profile is viewed.
  const before = capacityModel(backlog, '2026-10', settings)
  const locked = normalizeCapacitySettings({ ...shared, figureLocks: { '2026-10': [{ lockedOn: '2026-11-09T10:00:00Z', lockedBy: 'A', profileName: 'Current (v4)', formula: 'f', people: lockedPeople(before.people) }] } })
  assert.deepEqual(capacityModel(backlog, '2026-10', withViewedProfile(locked, 'old-calculation')).people.map(figures), before.people.map(figures))
})
