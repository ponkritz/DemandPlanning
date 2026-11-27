import test from 'node:test'
import assert from 'node:assert/strict'
import { capacityModel, defaultCapacitySettings } from '../src/capacity.ts'
import { azureInsights } from '../src/azureInsights.ts'
import { capacityParts, capacityText, personMonths, totals } from '../src/dashboard.ts'

// CAP-63, CAP-64, ACT-28: November 2026 has 21 working days (168 h at 8 h a day). Asha (India) plans 88 h of PTO,
// India has a 16 h regional holiday and she plans 40 h of project work.
const item = (id, extra = {}) => ({ key: `org/project/${id}`, id, title: 'Story', workItemType: 'User Story', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'project', syncedAt: '', ...extra })
const absenceEpic = defaultCapacitySettings.absenceEpicId
const month = (leave = { originalEstimate: 88 }, holiday = { originalEstimate: 16 }, extra = []) => [
  item(absenceEpic, { workItemType: 'Epic', title: 'Team Holidays and Training' }),
  item(100, { workItemType: 'Feature', parentId: absenceEpic, title: 'Asha - Leave', assignedTo: 'Asha' }), item(101, { parentId: 100, title: 'Asha | PTO | Time Writing', assignedTo: 'Asha' }),
  item(102, { workItemType: 'Task', parentId: 101, title: 'November 2026 | Asha | PTO', assignedTo: 'Asha', ...leave }),
  item(110, { workItemType: 'Feature', parentId: absenceEpic, title: 'Public Holidays - India' }), item(111, { parentId: 110, title: 'Holidays - Time Writing' }),
  item(112, { workItemType: 'Task', parentId: 111, title: 'November 2026 | Diwali', ...holiday }),
  item(1, { workItemType: 'Epic', title: 'DP' }), item(10, { workItemType: 'Feature', parentId: 1, title: 'DP v4' }), item(11, { parentId: 10, title: 'DP v4 - Time Writing', assignedTo: 'Asha' }),
  item(12, { workItemType: 'Task', parentId: 11, title: 'November 2026 | DP v4', assignedTo: 'Asha', originalEstimate: 40 }),
  ...extra,
]
const settings = { ...defaultCapacitySettings, profiles: { Asha: { region: 'India' } } }
const asha = (items, own = settings) => capacityModel(items, '2026-11', own).people.find((person) => person.name === 'Asha')
const tiles = (items, own = settings) => {
  const rows = personMonths(items, ['2026-11'], '2026-11-26', own).filter((row) => row.person === 'Asha'), sum = totals(rows)
  const kpi = azureInsights(items.filter((entry) => entry.workItemType !== 'Task' || entry.assignedTo === 'Asha'), '2026-11', '2026-11-26', own)
  return { capacity: sum.capacity, plan: kpi.plan.value, actual: kpi.actual.value, percent: Math.round(kpi.plan.value / sum.capacity * 100), dashboardPlan: sum.plan, hint: capacityText(capacityParts(rows)) }
}

test('CAP-63, CAP-64, ACT-28: planned leave (Original Estimate only) comes off the capacity and stays out of Planned', () => {
  // Before v13: Capacity 152 h (168 − 16 holiday; the 88 h leave was taken off only once booked), Planned 128 h (88 leave + 40 work), 84 %.
  const figures = tiles(month())
  assert.deepEqual([figures.capacity, figures.plan, figures.percent], [64, 40, 63], 'Capacity 168 − 88 − 16 = 64 h; Planned 40 h; 40 ÷ 64 = 63 %')
  assert.equal(figures.dashboardPlan, 40, 'My dashboard / Dashboard: the same Planned')
  assert.equal(figures.hint, '168h contractual − 88h leave − 16h holiday')
  const person = asha(month())
  assert.deepEqual([person.funded, person.absence, person.absenceByKind.PTO, person.absenceByKind['Public holiday'], person.available], [168, 104, 88, 16, 64])
})

test('CAP-63: leave booked as Completed Work only deducts the same; with both fields Completed Work is used', () => {
  assert.equal(tiles(month({ completedWork: 88 })).capacity, 64, '88 h completed: 168 − 88 − 16')
  const both = tiles(month({ originalEstimate: 88, completedWork: 40 }))
  assert.equal(both.capacity, 112, 'actual if recorded: 168 − 40 − 16')
  assert.equal(both.hint, '168h contractual − 40h leave − 16h holiday')
  assert.equal(tiles(month({ originalEstimate: 88, completedWork: 0 })).capacity, 64, 'Completed Work 0 counts as not recorded: the plan applies')
})

test('CAP-63: a shared regional holiday deducts its actual if recorded, else its plan (name rule and Hour classification)', () => {
  assert.equal(asha(month({}, { originalEstimate: 16, completedWork: 8 })).absenceByKind['Public holiday'], 8, 'OE 16, CW 8: 8 h')
  assert.equal(asha(month({}, { originalEstimate: 16 })).absenceByKind['Public holiday'], 16, 'OE 16, no CW: 16 h')
  assert.equal(asha(month({}, {})).absenceByKind['Public holiday'], 8, 'no hours at all: one working day')
  const mapped = { ...settings, sharedTime: [{ id: 110, kind: 'holiday', scope: 'India' }] }
  assert.equal(asha(month({}, { originalEstimate: 16, completedWork: 8 }), mapped).absenceByKind['Public holiday'], 8, 'mapped in Hour classification: same rule')
  assert.equal(asha(month({}, { originalEstimate: 16 }), mapped).available, 168 - 16)
})

test('CAP-63: a common activity keeps its plan first; CAP-64: trainings and common activities stay in Planned', () => {
  const extra = [
    item(120, { workItemType: 'Feature', parentId: absenceEpic, title: 'Asha - Training', assignedTo: 'Asha' }), item(121, { parentId: 120, title: 'Asha | Training | Time Writing', assignedTo: 'Asha' }),
    item(122, { workItemType: 'Task', parentId: 121, title: 'November 2026 | Asha | Training', assignedTo: 'Asha', originalEstimate: 8 }),
    item(700, { workItemType: 'Epic', title: 'Common activities' }), item(701, { workItemType: 'Feature', parentId: 700, title: 'PI Planning' }), item(702, { parentId: 701, title: 'PI Planning - Time Writing' }),
    item(703, { workItemType: 'Task', parentId: 702, title: 'November 2026 | PI Planning', assignedTo: 'Asha', originalEstimate: 16, completedWork: 12 }),
  ]
  const own = { ...settings, sharedTime: [{ id: 700, kind: 'activity', scope: 'everyone' }] }
  const person = asha(month(undefined, undefined, extra), own)
  assert.deepEqual([person.reservedPlanned, person.reservedActual, person.available], [16, 12, 64], 'PI Planning: 16 h planned (Original Estimate first), 12 h recorded; not deducted')
  assert.equal(person.utilizedPlanned, 40 + 8 + 16, 'Planned on the Dashboard: work + training + common activity, no leave or holiday')
  const kpi = azureInsights(month(undefined, undefined, extra).filter((entry) => entry.workItemType !== 'Task' || entry.assignedTo === 'Asha'), '2026-11', '2026-11-26', own)
  assert.equal(kpi.plan.value, 40 + 8 + 16, 'Time Writing Planned: the training and the PI Planning Task stay in')
  assert.equal(kpi.allPlan.value, 40 + 8 + 16 + 88, 'every month Task (Baselines) still has the leave')
})

test('CAP-63: a typed formula reads Absence as deducted; the Old Calculation does not deduct it; a locked month keeps its figures', async () => {
  const { allProfiles, lockedPeople } = await import('../src/calculationProfiles.ts')
  const { normalizeCapacitySettings: normalize } = await import('../src/capacity.ts')
  const normalizeCapacitySettings = (value) => ({ ...normalize(value), profiles: settings.profiles })
  const v4 = allProfiles(settings)[0]
  const typed = normalizeCapacitySettings({ ...settings, calculationProfiles: [{ ...v4, formula: '=[Project work] / ([Funded Hours] - [Absence]) * 100' }] })
  assert.equal(asha(month(), typed).plannedUtilization, 62.5, 'typed: 40 ÷ (168 − 104) — [Absence] is what comes off the capacity')
  const old = normalizeCapacitySettings({ ...settings, defaultProfileId: 'old-calculation' })
  const { standardHoursTotal } = await import('../src/capacity.ts')
  assert.equal(asha(month(), old).available, 168 - standardHoursTotal(old.standardHours), 'Old Calculation counts absence as planned hours (CAP-35, CAP-40) instead of deducting it: only Standard Hours come off')
  // A month locked with the earlier figures keeps them (CAP-43): locked data is not recalculated.
  const before = { ...asha(month()), absence: 16, available: 152 }
  const locked = normalizeCapacitySettings({ ...settings, figureLocks: { '2026-11': [{ lockedOn: '2026-11-20T10:00:00Z', lockedBy: 'A', profileName: 'Current (v4)', formula: 'f', people: lockedPeople([before]) }] } })
  assert.equal(asha(month(), locked).available, 152)
})
