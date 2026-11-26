import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dpCreateLines, dpFormPrefill, dpMilestoneOf, dpStorySprints, storySprintText, withStorySprints } from '../src/dpCreatePlan.ts'
import { dpBulkDateDefaults } from '../src/dpBulkDates.ts'
import { sprintOfDay } from '../src/azureRead.ts'
import { cleanSetup, parseFeatureSetup, serializeFeatureSetup } from '../src/featureSetup.ts'
import { createFeatureWithMonthTasks } from '../src/azureDevOps.ts'

// DPF-17 (the single New Feature form from a DP release follows the DP bulk rules) and EPS-10 (a User Story's Sprint
// from a DP milestone date). TC-DPF-17, TC-DPF-18, TC-EPS-08. Synthetic data only.
const release = (id, fields) => ({ id, title: `${fields['Custom.PsName'] ?? 'Release'} ${fields['Custom.Release'] ?? ''}`.trim(), workItemType: 'Release', state: 'Active', fields: { 'Custom.SourceProgram': 'Imaging', ...fields } })
const epic = { id: 100, key: 'tw:100', title: 'DP releases', workItemType: 'Epic', state: 'Active', assignedTo: '', assignedToEmail: '', fields: {} }
const qeTask = { id: 300, key: 'tw:300', title: 'Old month | Admin', workItemType: 'Task', state: 'Active', assignedTo: 'Rita Gomez', assignedToEmail: 'rita.gomez@example.com', fields: {} }
const board = [epic, qeTask]
const context = { epicId: 100, setup: cleanSetup({ epicId: 100, featureDoD: 'DT is finished.', stories: [{ title: 'SFV : Review', sprintFrom: 'DRfHDate' }] }), qe: { rows: [{ product: 'Viewer', qe: 'Rita Gomez' }] }, classes: { values: [], fieldIndex: -1, label: 'Release Classification', rules: [] }, dateColumns: dpBulkDateDefaults }
const options = { board, featureMatch: () => undefined, fromStart: false, currentMonth: 'November 2026' }

test('DPF-17: the New Feature form from a DP release is prefilled by the bulk plan — Epic, title, QE, Start and Target dates; a prefixed field is read; a missing date is left empty with a short note (TC-DPF-17)', () => {
  const both = release(501, { 'Custom.PsName': 'Viewer', 'Custom.Release': '4.2', 'Custom.DRPEDate': '2026-12-01T00:00:00Z', 'Custom.DDTDate': '2027-02-15T00:00:00Z' })
  const [line] = dpCreateLines([both], context, options)
  const prefill = dpFormPrefill(line, context, board)
  assert.equal(prefill.epic?.id, 100, 'the DP bulk creation Epic is the parent')
  assert.equal(prefill.epicNote, '')
  assert.equal(prefill.title, 'Imaging | Viewer | 4.2', 'the title bulk gives')
  assert.deepEqual([prefill.email, prefill.qe], ['rita.gomez@example.com', 'Rita Gomez'], 'the QE from the QE page')
  assert.deepEqual([prefill.start, prefill.target, prefill.startNote, prefill.targetNote], ['2026-12-01', '2027-02-15', '', ''], 'Custom.DRPEDate and Custom.DDTDate: prefix allowed, UTC days')
  assert.deepEqual([prefill.startLabel, prefill.targetLabel], ['DRPE Date', 'DDT Date'])
  const missing = dpFormPrefill(dpCreateLines([release(502, { 'Custom.PsName': 'Lab', 'Custom.Release': '3.0', DRPEDate: '2026-12-02' })], context, options)[0], context, board)
  assert.deepEqual([missing.start, missing.target, missing.targetNote], ['2026-12-02', '', 'No DDT Date on this release'])
  assert.match(missing.qeNote, /No QE on the QE page for this product: assigned to you unless you choose/)
  const local = dpFormPrefill(dpCreateLines([release(503, { 'Custom.PsName': 'Viewer', DRPEDate: '3/15/2027' })], context, options)[0], context, board)
  assert.deepEqual([local.start, local.startNote], ['', 'DRPE Date “3/15/2027” is not a date'], 'ISO only')
  // Start after Target: both prefilled; the form's own check (featureMonths, min on Target) says what is wrong.
  const late = dpFormPrefill(dpCreateLines([release(504, { 'Custom.PsName': 'Viewer', DRPEDate: '2027-05-01', DDTDate: '2027-03-01' })], context, options)[0], context, board)
  assert.deepEqual([late.start, late.target], ['2027-05-01', '2027-03-01'])
  // No DP bulk Epic set, or not on the board: no parent, and the note says why.
  assert.match(dpFormPrefill(line, { ...context, epicId: 0 }, board).epicNote, /No DP bulk creation Epic is set/)
  assert.match(dpFormPrefill(line, { ...context, epicId: 999 }, board).epicNote, /#999 is not on the loaded QMS-0025 board/)
  // A 100 % match: the form warns as bulk skips it.
  const hit = { item: { ...epic, id: 700, workItemType: 'Feature' }, score: 100 }
  assert.match(dpFormPrefill(dpCreateLines([both], context, { ...options, featureMatch: () => hit })[0], context, board).warning, /Feature #700 on QMS-0025 matches this release 100%: bulk creation skips it/)
})

test('DPF-18: one set of rules — bulk and the single form use the same plan module, and no second copy of the date rules exists (TC-DPF-18)', () => {
  const bulk = readFileSync(new URL('../src/components/DpBulkCreate.tsx', import.meta.url), 'utf8')
  const single = readFileSync(new URL('../src/components/ReleaseFeatureEditor.tsx', import.meta.url), 'utf8')
  const form = readFileSync(new URL('../src/components/FeatureEditor.tsx', import.meta.url), 'utf8')
  for (const source of [bulk, single]) { assert.match(source, /useDpCreateContext\(/); assert.match(source, /dpCreateLines\(/) }
  assert.match(form, /dpTaskMonths\(fromStart/, 'the form’s months by the bulk rule')
  assert.match(form, /dpStorySprints\(/)
  assert.doesNotMatch(form + single, /utcDay\(|Date\.UTC\(/, 'the dates are parsed only by dpBulkDates')
  const column = readFileSync(new URL('../src/components/DpBoardColumn.tsx', import.meta.url), 'utf8')
  assert.match(column, /dpRow=\{row\}/, 'only the DP table passes a DP row')
})

// A tree: PI 2026.4 (Sprints 1–3) and PI 2027.1 (Sprint 1), today 25 Nov 2026 (UTC).
const it = (path, start, finish) => ({ name: path.split('\\').at(-1), path: `Quality\\${path}`, attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${finish}T00:00:00Z` } })
const tree = [it('PI 2026.4', '2026-10-01', '2026-12-31'), it('PI 2026.4\\Sprint 1', '2026-10-01', '2026-10-28'), it('PI 2026.4\\Sprint 2', '2026-10-29', '2026-11-25'), it('PI 2026.4\\Sprint 3', '2026-11-26', '2026-12-23'), { name: 'PI 2027.1', path: 'Quality\\PI 2027.1' }, it('PI 2027.1\\Sprint 1', '2027-01-06', '2027-02-02')]
const now = new Date('2026-11-25T12:00:00Z')

test('EPS-10: the Sprint of a milestone date — the current or future Sprint holding it (UTC days, both ends), in any PI; none in a gap; a finished Sprint is never used (TC-EPS-08)', () => {
  const name = (day) => { const found = sprintOfDay(tree, day, now); return found.sprint?.path ?? (found.past ? `past ${found.past.name}` : 'none') }
  assert.equal(name('2026-11-30'), 'Quality\\PI 2026.4\\Sprint 3', 'inside')
  assert.equal(name('2026-11-26'), 'Quality\\PI 2026.4\\Sprint 3', 'its first day')
  assert.equal(name('2026-12-23'), 'Quality\\PI 2026.4\\Sprint 3', 'its last day')
  assert.equal(name('2026-11-25'), 'Quality\\PI 2026.4\\Sprint 2', 'the current Sprint, on its last day')
  assert.equal(name('2027-01-10'), 'Quality\\PI 2027.1\\Sprint 1', 'a later PI')
  assert.equal(name('2026-12-28'), 'none', 'between Sprints')
  assert.equal(name('2026-10-12'), 'past Sprint 1', 'a finished Sprint: not used')
})

test('EPS-10: each story’s Sprint from its “Sprint from” date of the DP release (prefix allowed); else the default Sprint with the reason (TC-EPS-08)', () => {
  const row = release(505, { 'Custom.DRfHDate': '2026-11-30T00:00:00Z', 'Custom.DRPCDate': '2026-10-12T00:00:00Z', 'Custom.DRPEDate': 'TBD' })
  const stories = [{ title: 'SFV : Review', description: '', sprintFrom: 'DRfHDate' }, { title: 'PRD : Review', description: '', sprintFrom: 'DRPCDate' }, { title: 'Own', description: '' }, { title: 'DT : Review', description: '', sprintFrom: 'DDTDate' }, { title: 'RPE', description: '', sprintFrom: 'DRPEDate' }, { title: 'Gap', description: '', sprintFrom: 'Custom.DDTDate' }]
  const sprints = dpStorySprints(stories, row, tree, now)
  assert.deepEqual(sprints.map((entry) => entry.path), ['Quality\\PI 2026.4\\Sprint 3', '', '', '', '', ''])
  assert.deepEqual(sprints.map((entry) => entry.note), ['', 'PRD 12 Oct 2026 is in a past Sprint — default Sprint', '', 'DT: no DDT Date — default Sprint', 'RPE: DRPE Date “TBD” is not a date — default Sprint', 'DT: no DDT Date — default Sprint'])
  assert.equal(dpStorySprints(stories.slice(0, 1), release(506, { DRfHDate: '2026-12-28' }), tree, now)[0].note, 'SFV 28 Dec 2026: no Sprint holds it — default Sprint')
  assert.equal(dpStorySprints(stories.slice(0, 1), row, [], now)[0].note, 'SFV 30 Nov 2026: the Sprint schedule is not loaded — default Sprint')
  assert.equal(storySprintText(sprints), 'SFV → Sprint 3 · PRD → default Sprint · DT → default Sprint · RPE → default Sprint · DT → default Sprint')
  assert.deepEqual(withStorySprints(stories, sprints).map((story) => story.iterationPath), ['Quality\\PI 2026.4\\Sprint 3', undefined, undefined, undefined, undefined, undefined], 'only a found Sprint is set')
  assert.deepEqual(['DRPEDate', 'DRPCDate', 'Custom.DRfHDate', 'DDTDate', 'CreatedDate'].map(dpMilestoneOf), ['RPE', 'PRD', 'SFV', 'DT', 'Created Date'])
})

test('EPS-10: “Sprint from” is kept by the strict reader (field name, by its last part); an older setup without it is None (TC-EPS-08)', () => {
  const setup = cleanSetup({ epicId: 100, featureDoD: 'x', stories: [{ title: 'A', sprintFrom: 'Custom.DRfHDate' }, { title: 'B', sprintFrom: 'bad name!' }, { title: 'C' }], classSets: { Major: { featureDoD: '', stories: [{ title: 'D', sprintFrom: 'DDTDate' }] } } })
  assert.deepEqual(setup.stories.map((story) => story.sprintFrom), ['DRfHDate', undefined, undefined])
  assert.equal(setup.classSets.Major.stories[0].sprintFrom, 'DDTDate', 'per Release Classification set too')
  assert.equal('sprintFrom' in setup.stories[2], false, 'an older setup: no field')
  const file = parseFeatureSetup(serializeFeatureSetup({ schema: 1, kind: 'feature-setup', epics: [setup] }))
  assert.equal(file.epics[0].stories[0].sprintFrom, 'DRfHDate', 'kept through Save and Load')
})

test('EPS-10: a story with a Sprint is created in it; the others in the Sprint chosen; the Feature keeps its PI (TC-EPS-08)', async () => {
  const world = new Map([[10, { id: 10, fields: { 'System.Title': 'DP releases', 'System.WorkItemType': 'Epic', 'System.AreaPath': 'Quality\\DP', 'System.IterationPath': 'Quality', 'System.TeamProject': 'Quality' } }]])
  let next = 100
  const created = []
  const transport = async (request) => {
    if (request.operation === 'items') return { value: request.ids.map((id) => world.get(id)).filter(Boolean) }
    if (request.operation === 'iterations') return { value: [{ name: 'PI 2026.4', path: 'Quality\\PI 2026.4' }] }
    if (request.operation === 'query') { const parent = Number(/\[System\.Parent\] = (\d+)/.exec(request.query)[1]); return { workItems: [...world.values()].filter((entry) => entry.fields['System.Parent'] === parent).map((entry) => ({ id: entry.id })) } }
    if (request.operation === 'create-feature' || request.operation === 'create-child') {
      if (request.validateOnly) return {}
      const f = request.feature, id = ++next
      const item = { id, fields: { 'System.Title': f.title, 'System.WorkItemType': request.operation === 'create-feature' ? 'Feature' : request.workItemType, 'System.State': 'New', 'System.Parent': f.parentId, 'System.AreaPath': f.areaPath, 'System.IterationPath': f.iterationPath || 'Quality', 'System.TeamProject': 'Quality', 'System.AssignedTo': { uniqueName: f.assignedTo } } }
      world.set(id, item); created.push({ type: item.fields['System.WorkItemType'], title: f.title, iterationPath: f.iterationPath })
      return item
    }
    throw new Error(`unexpected ${request.operation}`)
  }
  const feature = { parentId: 10, title: 'Imaging | Viewer | 4.2', description: 'Feature DoD: DT done.', acceptanceCriteria: '', iterationPath: 'Quality\\PI 2026.4', storyIterationPath: 'Quality\\PI 2026.4\\Sprint 2', assignedTo: 'qe@example.com' }
  const stories = withStorySprints([{ title: 'SFV : Review', description: '' }, { title: 'PRD : Review', description: '' }], [{ sprintFrom: 'DRfHDate', path: 'Quality\\PI 2026.4\\Sprint 3', sprint: 'Sprint 3', note: '' }, { sprintFrom: 'DRPCDate', path: '', sprint: '', note: 'x' }])
  await createFeatureWithMonthTasks({ organization: 'example-org', project: 'Quality', team: 'Team A' }, 'synthetic-test-token', feature, { stories, reviewStory: false, task: { title: '{month} | {feature}', description: '', assignedTo: '', areaPath: '', iterationPath: '' } }, ['November 2026'], () => false, transport)
  const path = (title) => created.find((entry) => entry.title === title)?.iterationPath
  assert.equal(path('SFV : Review'), 'Quality\\PI 2026.4\\Sprint 3', 'its milestone’s Sprint')
  assert.equal(path('PRD : Review'), 'Quality\\PI 2026.4\\Sprint 2', 'the Sprint chosen')
  assert.equal(created.find((entry) => entry.type === 'Feature').iterationPath, 'Quality\\PI 2026.4', 'the Feature keeps its PI')
})
