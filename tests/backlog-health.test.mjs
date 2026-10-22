import test from 'node:test'
import assert from 'node:assert/strict'
import { olderSprintItems, featuresWithoutDoD, unassignedItems, hasDoD, healthCsv, sprintEnd, hierarchyOf, itemCsv, descriptionText, peopleOf } from '../src/backlogHealth.ts'
import { mapAzureWorkItem } from '../src/azureDevOps.ts'

const base = { organization: 'org', project: 'Q', state: 'Active', assignedTo: 'Ana', areaPath: 'Q', iterationPath: 'Q\\PI 1\\Sprint 1', tags: '', url: 'u', syncedAt: '' }
const item = (id, workItemType, extra = {}) => ({ ...base, key: `org/q/${id}`, id, workItemType, title: `Item ${id}`, ...extra })
const iterations = [{ path: 'Q\\PI 1\\Sprint 1', attributes: { finishDate: '2026-10-09T00:00:00Z' } }, { path: 'Q\\PI 1\\Sprint 2', attributes: { finishDate: '2026-10-23T00:00:00Z' } }]
const today = new Date('2026-10-20T06:00:00Z')
const items = [
  item(1, 'Epic'),
  item(2, 'Feature', { description: '<p>Feature DoD: IQOQ finished</p>' }),
  item(3, 'Feature', { description: 'Release scope', assignedTo: '' }),
  item(4, 'User Story', { parentId: 2, title: 'Story, "quoted"' }),
  item(5, 'Task', { parentId: 4, state: 'Closed' }),
  item(6, 'Task', { parentId: 4, iterationPath: 'Q\\PI 1\\Sprint 2', assignedTo: '' }),
  item(7, 'Feature', { state: 'Closed', description: '' }),
  item(8, 'Bug'),
]

test('Backlog Health: open work in ended Sprints, Features without DoD, unassigned work', () => {
  assert.deepEqual(olderSprintItems(items, iterations, today).map((row) => row.id), [2, 3, 4], 'Features, Stories, Tasks only; open; Sprint ended (Sprint 2 still running)')
  assert.deepEqual(olderSprintItems(items, [], today), [], 'without Sprint dates nothing is old')
  assert.equal(hasDoD({ description: '<b>DoD</b>: done' }), true); assert.equal(hasDoD({ description: 'Dodo' }), false); assert.equal(hasDoD({}), false)
  assert.deepEqual(featuresWithoutDoD(items).map((row) => row.id), [3], 'open Features whose Description has no DoD')
  assert.deepEqual(featuresWithoutDoD(items, false).map((row) => row.id), [3, 7], 'including closed ones')
  assert.deepEqual(unassignedItems(items).map((row) => row.id), [3, 6])
  assert.equal(sprintEnd(items[3], iterations), '2026-10-09')
  const csv = healthCsv(olderSprintItems(items, iterations, today), items, iterations).split('\r\n')
  assert.equal(csv[0], 'ID,Type,Title,State,Assigned To,Iteration,Sprint end,Parent,URL')
  assert.equal(csv[3], '4,User Story,"Story, ""quoted""",Active,Ana,Q\\PI 1\\Sprint 1,2026-10-09,#2 Item 2,u', 'quoted cells; parent with its title')
  const absence = [...items, item(900, 'Epic'), item(901, 'Feature', { parentId: 900, description: '', assignedTo: '' }), item(902, 'Task', { parentId: 901 })]
  assert.deepEqual([featuresWithoutDoD(absence, true, 900), unassignedItems(absence, 900), olderSprintItems(absence, iterations, today, 900)].map((rows) => rows.map((row) => row.id)), [[3], [3, 6], [2, 3, 4]], 'nothing under the absence Epic')
  assert.match(healthCsv([items[2]], items, iterations, 'Unassigned'), /^List,ID,/, 'combined export has a List column')
})

test('Unassigned list: ID, type, title, paths, state, created and updated by and on', () => {
  const tree = [item(1, 'Epic', { title: 'Stream' }), item(2, 'Feature', { parentId: 1, title: 'Release' }), item(4, 'User Story', { parentId: 2, title: 'Story' }), item(6, 'Task', { parentId: 4, title: 'Task, one', assignedTo: '', createdBy: 'Ben Okafor', createdDate: '2026-10-01T08:00:00Z', areaPath: 'Q\\Team' })]
  const byId = new Map(tree.map((entry) => [entry.id, entry]))
  const level = hierarchyOf(tree[3], byId)
  assert.deepEqual([level.Epic?.id, level.Feature?.id, level['User Story']?.id, level.Task?.id], [1, 2, 4, 6])
  assert.deepEqual(Object.keys(hierarchyOf(tree[1], byId)).sort(), ['Epic', 'Feature'], 'a Feature has no story or task')
  const task = { ...tree[3], changedBy: 'Ana Costa', changedDate: '2026-10-20T09:00:00Z' }
  const csv = itemCsv([task]).split('\r\n')
  assert.equal(csv[0], 'ID,Work Item Type,Title,Area Path,Iteration Path,State,Created By,Updated By,Created On,Updated On,URL')
  assert.equal(csv[1], '6,Task,"Task, one",Q\\Team,Q\\PI 1\\Sprint 1,Active,Ben Okafor,Ana Costa,2026-10-01,2026-10-20,u')
  const config = { organization: 'org', project: 'Q', team: 'T' }
  assert.equal(mapAzureWorkItem({ id: 9, fields: { 'System.Title': 'x', 'System.CreatedBy': { displayName: 'Ana Costa', uniqueName: 'ana@x' } } }, config).createdBy, 'Ana Costa')
  assert.equal(mapAzureWorkItem({ id: 9, fields: { 'System.Title': 'x', 'System.ChangedBy': { displayName: 'Ben Okafor' } } }, config).changedBy, 'Ben Okafor')
  assert.equal(mapAzureWorkItem({ id: 9, fields: { 'System.Title': 'x' } }, config).createdBy, undefined)
})

test('Features without DoD: Description as plain text in the CSV; people to filter by', () => {
  const feature = item(3, 'Feature', { description: '<div>Release <b>scope</b> &amp; plan</div>', assignedTo: 'Ana' })
  assert.equal(descriptionText(feature), 'Release scope & plan')
  const csv = healthCsv([feature], [feature], iterations, '', true).split('\r\n')
  assert.ok(csv[0].endsWith(',URL,Description'))
  assert.ok(csv[1].endsWith(',u,Release scope & plan'))
  assert.ok(!healthCsv([feature], [feature], iterations).split('\r\n')[0].includes('Description'), 'without the option: no Description column')
  assert.deepEqual(peopleOf(feature), ['Ana'])
  assert.deepEqual(peopleOf({ ...feature, assignedTo: '', createdBy: 'Ben', changedBy: 'Chen' }, true), ['Ben', 'Chen'])
  assert.deepEqual(peopleOf({ ...feature, assignedTo: '' }), [])
})
