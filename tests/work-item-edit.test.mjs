import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { editLocks, editPatch, editProblem, editableText, joinDoD, splitDoD, statesFor } from '../src/workItemEdit.ts'
import { addComment, editWorkItem, readComments, readWorkItemForEdit, requestAzure } from '../src/azureDevOps.ts'

const config = { organization: 'org', project: 'Quality', team: 'T' }
const open = { planningLocked: () => false, actualsLocked: () => false }
function fakeAzure(world) {
  const calls = []
  const transport = async (request) => {
    calls.push(request)
    if (request.operation === 'items') return { value: request.ids.map((id) => world.get(id)).filter(Boolean) }
    if (request.operation === 'edit-work-item') {
      const entry = world.get(request.workItemId)
      if (entry.rev !== request.rev) throw new Error('412')
      for (const op of editPatch(request.edit, request.rev).slice(1)) { const field = op.path.replace('/fields/', ''); if (op.op === 'remove') delete entry.fields[field]; else entry.fields[field] = field === 'System.AssignedTo' ? { displayName: op.value, uniqueName: op.value } : op.value }
      entry.rev += 1
      return entry
    }
    if (request.operation === 'comments') return { comments: [{ id: 1, text: 'First<br>line two', createdBy: { displayName: 'Ana' }, createdDate: '2026-10-01T10:00:00Z' }, { id: 2, text: '<p>Newer &amp; better</p>', createdBy: { displayName: 'Ben' }, createdDate: '2026-10-02T10:00:00Z' }, { id: 3, text: 'gone', isDeleted: true }] }
    if (request.operation === 'add-comment') return { id: 9, text: request.comment, createdBy: { displayName: 'Ana' }, createdDate: '2026-10-03T10:00:00Z' }
    throw new Error(`unexpected ${request.operation}`)
  }
  return { transport, calls }
}
const raw = (id, rev, fields) => ({ id, rev, fields: { 'System.TeamProject': 'Quality', 'System.State': 'Active', 'System.AreaPath': 'Quality\\QMS-0025', 'System.IterationPath': 'Quality\\PI 26.4\\Sprint 1', 'System.Parent': 1, ...fields } })

test('edit values: only the listed fields, checked; the patch tests the revision first and sends text as HTML text (TC-BKL-11)', () => {
  assert.equal(editProblem({}), 'Nothing to change.')
  assert.equal(editProblem({ areaPath: 'X' }), 'Only the listed fields can be changed.')
  assert.match(editProblem({ priority: 9 }), /Priority/)
  assert.match(editProblem({ assignedTo: 'nobody' }), /email/)
  assert.match(editProblem({ completedWork: -1 }), /Completed Work/)
  assert.equal(editProblem({ title: 'New', description: 'a <b>b</b>', risk: '' }), '')
  const patch = editPatch({ title: ' T ', description: 'a <b>\nc', risk: '', targetDate: '' }, 7)
  assert.deepEqual(patch[0], { op: 'test', path: '/rev', value: 7 })
  assert.deepEqual(patch.slice(1), [{ op: 'add', path: '/fields/System.Title', value: 'T' }, { op: 'add', path: '/fields/System.Description', value: 'a &lt;b&gt;<br>c' }, { op: 'remove', path: '/fields/Microsoft.VSTS.Common.Risk' }, { op: 'remove', path: '/fields/Microsoft.VSTS.Scheduling.TargetDate' }])
  assert.ok(!patch.some((op) => /AreaPath|Parent|WorkItemType|relations/.test(op.path)), 'never the Area Path, parent or type')
  assert.equal(editableText('<div>Feature DoD: DT done</div><div>Release Classification : Major</div><p>Line<br>two &amp; more</p>'), 'Feature DoD: DT done\n\nRelease Classification : Major\n\nLine\ntwo & more')
  assert.deepEqual(splitDoD('Feature DoD: DT done\n\nRest\n\nMore'), { dod: 'DT done', rest: 'Rest\n\nMore' })
  assert.equal(joinDoD('IQOQ done', 'Rest'), 'Feature DoD: IQOQ done\n\nRest')
  assert.deepEqual(editLocks({ workItemType: 'Task', title: 'October 2026 | CP | Care | v1' }), { monthTask: '2026-10', timeWritingStory: false, iterationLocked: true })
  assert.equal(editLocks({ workItemType: 'User Story', title: 'CP | Care | v1 - Time Writing' }).iterationLocked, true)
  assert.equal(editLocks({ workItemType: 'User Story', title: 'DT review' }).iterationLocked, false)
  assert.deepEqual(statesFor('Task'), ['New', 'Active', 'Closed'])
})

test('editWorkItem: a fresh revision only; locks on Time Writing placement, month in the title and the Feature DoD; verified after saving (TC-BKL-11)', async () => {
  const world = new Map([
    [10, raw(10, 3, { 'System.WorkItemType': 'Feature', 'System.Title': 'CP | Care | v1', 'System.Description': 'Feature DoD: DT done' })],
    [11, raw(11, 5, { 'System.WorkItemType': 'User Story', 'System.Title': 'DT review', 'System.Parent': 10 })],
    [12, raw(12, 2, { 'System.WorkItemType': 'User Story', 'System.Title': 'CP | Care | v1 - Time Writing', 'System.IterationPath': 'Quality' })],
    [13, raw(13, 4, { 'System.WorkItemType': 'Task', 'System.Title': 'October 2026 | CP | Care | v1', 'System.IterationPath': 'Quality', 'System.Tags': '' })],
  ])
  const { transport, calls } = fakeAzure(world)
  const story = await editWorkItem(config, 'pat', 11, 5, { title: 'DT review (updated)', iterationPath: 'Quality\\PI 26.4\\Sprint 2', storyPoints: 3, priority: 1, state: 'Resolved', assignedTo: 'Ben@X.com', acceptanceCriteria: 'Signed' }, open, transport)
  assert.deepEqual([story.title, story.iterationPath, story.storyPoints, story.state, story.assignedToEmail, story.areaPath, story.parentId], ['DT review (updated)', 'Quality\\PI 26.4\\Sprint 2', 3, 'Resolved', 'ben@x.com', 'Quality\\QMS-0025', 10])
  await assert.rejects(editWorkItem(config, 'pat', 11, 5, { title: 'again' }, open, transport), /changed in Azure DevOps since you opened it/, 'the revision moved on: nothing is sent')
  await assert.rejects(editWorkItem(config, 'pat', 12, 2, { iterationPath: 'Quality\\PI 26.4\\Sprint 1' }, open, transport), /stays at Quality/)
  await assert.rejects(editWorkItem(config, 'pat', 13, 4, { title: 'November 2026 | CP | Care | v1' }, open, transport), /keeps its month/)
  await assert.rejects(editWorkItem(config, 'pat', 10, 3, { description: 'No definition here' }, open, transport), /Feature DoD/)
  await assert.rejects(editWorkItem(config, 'pat', 10, 3, { storyPoints: 2 }, open, transport), /User Story only/)
  await assert.rejects(editWorkItem(config, 'pat', 11, 6, { targetDate: '2026-12-01' }, open, transport), /Feature only/)
  const feature = await editWorkItem(config, 'pat', 10, 3, { description: 'Feature DoD: IQOQ done\n\nMore', targetDate: '2026-12-01', iterationPath: 'Quality\\PI 27.1' }, open, transport)
  assert.deepEqual([feature.targetDate, feature.iterationPath], ['2026-12-01T00:00:00Z', 'Quality\\PI 27.1'])
  assert.equal(calls.filter((call) => call.operation === 'edit-work-item').length, 2, 'refused edits send nothing')
})

test('editWorkItem: a month Task follows the Monthly lock rules; late Completed Work without an estimate tags it ad-hoc (TC-BKL-11)', async () => {
  const task = () => raw(13, 4, { 'System.WorkItemType': 'Task', 'System.Title': 'October 2026 | CP | Care | v1', 'System.IterationPath': 'Quality', 'System.Tags': 'Keep' })
  const locked = { planningLocked: () => true, actualsLocked: () => false }
  let { transport } = fakeAzure(new Map([[13, task()]]))
  await assert.rejects(editWorkItem(config, 'pat', 13, 4, { originalEstimate: 8 }, locked, transport), /Original Estimate .* locked/)
  const late = await editWorkItem(config, 'pat', 13, 4, { completedWork: 2 }, locked, transport)
  assert.deepEqual([late.completedWork, late.tags], [2, 'Keep; ad-hoc'])
  ;({ transport } = fakeAzure(new Map([[13, task()]])))
  await assert.rejects(editWorkItem(config, 'pat', 13, 4, { completedWork: 2 }, { planningLocked: () => false, actualsLocked: () => true }, transport), /actuals have locked/)
  const fine = await editWorkItem(config, 'pat', 13, 4, { originalEstimate: 8, completedWork: 1 }, open, transport)
  assert.deepEqual([fine.originalEstimate, fine.completedWork, fine.tags], [8, 1, 'Keep'], 'planning open: no tag')
})

test('Discussion: comments newest first as text, deleted ones left out; a comment is added as text; read for edit carries the revision (TC-BKL-11)', async () => {
  const world = new Map([[11, raw(11, 5, { 'System.WorkItemType': 'User Story', 'System.Title': 'DT review', 'System.Description': '<p>Why</p>', 'Microsoft.VSTS.Common.Priority': 2, 'Microsoft.VSTS.Common.ValueArea': 'Business' })]])
  const { transport, calls } = fakeAzure(world)
  assert.deepEqual((await readComments(config, 'pat', 11, transport)).map((comment) => [comment.id, comment.author, comment.text]), [[2, 'Ben', 'Newer & better'], [1, 'Ana', 'First\nline two']])
  const added = await addComment(config, 'pat', 11, '  Looks good  ', transport)
  assert.equal(added.id, 9)
  assert.equal(calls.at(-1).comment, 'Looks good')
  await assert.rejects(addComment(config, 'pat', 11, '   ', transport), /Enter a comment/)
  const fresh = await readWorkItemForEdit(config, 'pat', 11, transport)
  assert.deepEqual([fresh.rev, fresh.description, fresh.priority, fresh.valueArea], [5, 'Why', 2, 'Business'])
})

test('both transports: the edit and comment requests are constrained; writes go to dev.azure.com only (TC-BKL-11)', async () => {
  const { azureEditRequest, azureCommentsRequest, assertWritableBase } = createRequire(import.meta.url)('../electron/azure-devops.cjs')
  const base = { ...config, pat: 'p', workItemId: 11 }
  const request = azureEditRequest({ ...base, operation: 'edit-work-item', rev: 5, edit: { title: 'T', risk: '' } })
  assert.equal(request.options.method, 'PATCH')
  assert.match(request.url, /_apis\/wit\/workitems\/11\?/)
  assert.deepEqual(JSON.parse(request.options.body), editPatch({ title: 'T', risk: '' }, 5), 'the same patch as the web app')
  assert.throws(() => azureEditRequest({ ...base, operation: 'edit-work-item', rev: 5, edit: { areaPath: 'X' } }), /Only the listed fields/)
  assert.throws(() => azureEditRequest({ ...base, operation: 'edit-work-item', edit: { title: 'T' } }), /revision/)
  assert.throws(() => azureEditRequest({ ...base, operation: 'edit-work-item', rev: 5, edit: { priority: 7 } }), /Priority/)
  const comment = azureCommentsRequest({ ...base, operation: 'add-comment', comment: 'a <b>' })
  assert.match(comment.url, /workItems\/11\/comments\?api-version=7\.1-preview\.4$/)
  assert.deepEqual(JSON.parse(comment.options.body), { text: 'a &lt;b&gt;' })
  assert.equal(azureCommentsRequest({ ...base, operation: 'comments' }).options.method, 'GET')
  assert.throws(() => assertWritableBase({ ...base, operation: 'edit-work-item', baseUrl: 'https://tfs.corp.example/tfs/Coll' }), /dev\.azure\.com\) only/)
  assert.throws(() => assertWritableBase({ ...base, operation: 'add-comment', baseUrl: 'https://tfs.corp.example/tfs/Coll' }), /dev\.azure\.com\) only/)
  globalThis.window = {}
  try {
    await assert.rejects(requestAzure({ ...base, operation: 'edit-work-item', rev: 5, edit: { areaPath: 'X' } }), /Only the listed fields/)
    await assert.rejects(requestAzure({ ...base, operation: 'add-comment', comment: ' ' }), /Enter a comment/)
    await assert.rejects(requestAzure({ ...base, operation: 'edit-work-item', rev: 5, baseUrl: 'https://tfs.corp.example/tfs/Coll', edit: { title: 'T' } }), /dev\.azure\.com\) only/)
  } finally { delete globalThis.window }
})
