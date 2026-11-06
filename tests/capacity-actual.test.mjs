import test from 'node:test'
import assert from 'node:assert/strict'
import { bandFor, capacityVsActual } from '../src/capacityActual.ts'
import { defaultCapacitySettings } from '../src/capacity.ts'

const item = (id, workItemType, title, extra = {}) => ({ key: `o/p/${id}`, id, workItemType, title, state: 'Active', assignedTo: '', organization: 'o', project: 'p', areaPath: '', iterationPath: '', tags: '', url: '', syncedAt: '', ...extra })
const settings = { ...defaultCapacitySettings, absenceEpicId: 900, overloadedAt: 100, availableBelow: 80, hoursPerDay: 8, defaultJoinedOn: '2026-01-01', profiles: { Ana: { region: 'India' }, Ben: { region: 'US' } } }
const items = [
  item(1, 'Epic', 'Alpha'), item(2, 'Epic', 'Beta'), item(900, 'Epic', 'Absence'),
  item(10, 'Feature', 'Alpha 1.0', { parentId: 1 }), item(11, 'Feature', 'Beta 1.0', { parentId: 2 }),
  item(20, 'User Story', 'Alpha 1.0 - Time Writing', { parentId: 10 }), item(21, 'User Story', 'Beta 1.0 - Time Writing', { parentId: 11 }),
  item(30, 'Task', 'November 2026 | Alpha 1.0', { parentId: 20, assignedTo: 'Ana', originalEstimate: 120, completedWork: 150 }),
  item(31, 'Task', 'November 2026 | Beta 1.0', { parentId: 21, assignedTo: 'Ana', originalEstimate: 40, completedWork: 50 }),
  item(32, 'Task', 'November 2026 | Beta 1.0', { parentId: 21, assignedTo: 'Ben', originalEstimate: 60, completedWork: 40 }),
  item(33, 'Task', 'October 2026 | Beta 1.0', { parentId: 21, assignedTo: 'Ben', completedWork: 100 }),
]
const input = { items, month: '2026-11', today: '2026-11-30', settings }

test('Capacity vs Actual: tiles, bands per person and hours by Epic (TC-CVA-01)', () => {
  assert.deepEqual([bandFor(null, settings), bandFor(120, settings), bandFor(90, settings), bandFor(50, settings)], ['No capacity', 'Over', 'On track', 'Under'])
  const model = capacityVsActual(input)
  assert.equal(model.trend.length, 12)
  const ana = model.people.find((row) => row.person === 'Ana'), ben = model.people.find((row) => row.person === 'Ben')
  assert.equal(ana.actual, 200)
  assert.equal(ben.actual, 40)
  assert.equal(model.tiles.actual.now, 240, 'Ana 150 + 50, Ben 40')
  assert.equal(model.tiles.actual.before, 100, 'October: Ben 100')
  assert.equal(model.tiles.headroom.now, Math.round((model.tiles.capacity.now - 240) * 100) / 100)
  assert.ok(ana.used > ben.used, 'sorted most used first')
  assert.deepEqual(model.people.map((row) => row.person), ['Ana', 'Ben'])
  assert.deepEqual(model.streams.map((row) => [row.title, row.actual]), [['Alpha', 150], ['Beta', 90]])
})

test('Capacity vs Actual: Region, Owner and Epic filters (TC-CVA-02)', () => {
  assert.deepEqual(capacityVsActual(input, { region: 'US', epic: '', owner: '' }).people.map((row) => row.person), ['Ben'])
  assert.deepEqual(capacityVsActual(input, { region: '', epic: '', owner: 'Ana' }).people.map((row) => row.person), ['Ana'])
  const beta = capacityVsActual(input, { region: '', epic: 'o/p/2', owner: '' })
  assert.equal(beta.tiles.actual.now, 90, 'only the Beta hours count as actual')
  assert.equal(beta.tiles.capacity.now, capacityVsActual(input).tiles.capacity.now, 'capacity stays the people\'s own')
  assert.deepEqual(beta.streams.map((row) => row.title), ['Beta'])
})
