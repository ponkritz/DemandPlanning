import test from 'node:test'
import assert from 'node:assert/strict'
import { delivery, planningOverview, previousMonth } from '../src/planningOverview.ts'
import { defaultCapacitySettings } from '../src/capacity.ts'

const item = (id, workItemType, title, extra = {}) => ({ key: `o/p/${id}`, id, workItemType, title, state: 'Active', assignedTo: '', organization: 'o', project: 'p', areaPath: '', iterationPath: '', tags: '', url: `https://dev.azure.com/o/p/_workitems/edit/${id}`, syncedAt: '', ...extra })
const settings = { ...defaultCapacitySettings, absenceEpicId: 900, overloadedAt: 100, profiles: { Ana: { region: 'India' }, Ben: { region: 'US' } } }
const items = [
  item(1, 'Epic', 'Alpha'), item(2, 'Epic', 'Beta'), item(900, 'Epic', 'Absence'), item(3, 'Epic', 'Old', { state: 'Closed' }),
  item(10, 'Feature', 'Alpha 1.0', { parentId: 1, assignedTo: 'Ana', targetDate: '2026-11-03T00:00:00Z', state: 'Closed' }),
  item(11, 'Feature', 'Alpha 2.0', { parentId: 1, assignedTo: 'Ana', targetDate: '2026-11-02T00:00:00Z' }),
  item(12, 'Feature', 'Beta 1.0', { parentId: 2, assignedTo: 'Ben', targetDate: '2026-11-25T00:00:00Z' }),
  item(13, 'Feature', 'Beta 2.0', { parentId: 2, assignedTo: 'Ben', targetDate: '2027-02-10T00:00:00Z' }),
  item(14, 'Feature', 'Leave', { parentId: 900, assignedTo: 'Ana', targetDate: '2026-11-10T00:00:00Z' }),
  item(20, 'User Story', 'Alpha 1.0 - Time Writing', { parentId: 10, assignedTo: 'Ana' }),
  item(21, 'Task', 'November 2026 | Alpha 1.0', { parentId: 20, assignedTo: 'Ana', originalEstimate: 200, completedWork: 150 }),
  item(22, 'User Story', 'Beta 1.0 - Time Writing', { parentId: 12, assignedTo: 'Ben' }),
  item(23, 'Task', 'November 2026 | Beta 1.0', { parentId: 22, assignedTo: 'Ben', originalEstimate: 40, completedWork: 90 }),
]
const rules = [{ stream: 'Beta', hoursPerUnit: 10, baseUnits: 1, driver: 'documents', unitsPerDriver: 1 }]
const scopes = [{ release: 'Beta 1.0', stream: 'Beta', history: [{ at: '2026-10-01', drivers: { documents: 4 } }] }]
const input = { items, month: '2026-11', today: '2026-11-06', settings, rules, scopes }

test('Planning Overview: delivery by Target date — done, overdue, open; the absence Epic left out (TC-OVW-01)', () => {
  assert.equal(previousMonth('2026-01'), '2025-12')
  const model = planningOverview(input)
  assert.deepEqual(model.tiles.delivery.now, { due: 3, completed: 1, atRisk: 1, overdue: 1, rate: 33.3 }, 'Alpha 1.0 done, Alpha 2.0 past its date, Beta 1.0 ahead; Leave not counted')
  assert.deepEqual(delivery([], '2026-11-06', new Set(['2026-11'])).rate, null)
  assert.deepEqual(model.options.epics.map((epic) => epic.title), ['Alpha', 'Beta'], 'Active Epics only, without the absence Epic')
  assert.deepEqual(model.timeline.map((entry) => [entry.epic.title, entry.completed, entry.atRisk, entry.overdue]), [['Alpha', 1, 0, 1], ['Beta', 0, 2, 0]], 'next six months from November: Beta 2.0 in February counts; equal totals by name')
})

test('Planning Overview: exceptions — over 25% baseline, missing baseline, capacity risk; filters narrow them (TC-OVW-02)', () => {
  const model = planningOverview(input)
  const kinds = model.exceptions.map((entry) => [entry.kind, entry.item?.id ?? entry.owner, entry.impact])
  assert.deepEqual(kinds.filter(([kind]) => kind === 'over-baseline'), [['over-baseline', 12, '+80%']], 'Beta 1.0: 90h against a 50h baseline (1 base + 4 documents, 10h each)')
  assert.deepEqual(kinds.filter(([kind]) => kind === 'missing-baseline'), [['missing-baseline', 13, 'N/A']], 'Beta 2.0 has a rule but no scope')
  assert.equal(model.tiles.baseline.over, 1)
  assert.ok(model.exceptions.some((entry) => entry.kind === 'capacity-risk' && entry.owner === 'Ana'), 'Ana planned 200h, over her capacity')
  const india = planningOverview(input, { region: 'India', epic: '', owner: '' })
  assert.ok(india.exceptions.every((entry) => entry.region === 'India' || entry.owner === 'Ana'), 'region filter')
  assert.equal(india.tiles.delivery.now.due, 2, 'only Ana\'s Features')
  const alpha = planningOverview(input, { region: '', epic: 'o/p/1', owner: '' })
  assert.equal(alpha.trend.at(-1).plan, 200, 'Epic filter keeps that stream\'s hours only')
  assert.equal(alpha.trend.length, 12)
})
