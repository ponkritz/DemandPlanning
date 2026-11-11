import test from 'node:test'
import assert from 'node:assert/strict'
import { capacityModel, defaultCapacitySettings, normalizeCapacitySettings, absenceKind } from '../src/capacity.ts'
import { defaultBucketRules, normalizeBucketRules, normalizeWords, tagsHave, titleHas } from '../src/bucketRules.ts'

const item = (id, extra = {}) => ({ key: `org/project/${id}`, id, title: 'Story', workItemType: 'User Story', state: 'Active', assignedTo: '', areaPath: '', iterationPath: '', tags: '', url: '', organization: 'org', project: 'project', syncedAt: '', ...extra })
// Under the absence Epic 900: Ana's leave Feature with a "maternity" Task and a "Conference" Task; under Stream A an
// "Internal" tagged Task and normal work.
const backlog = [
  item(1, { workItemType: 'Epic', title: 'Stream A' }), item(900, { workItemType: 'Epic', title: 'Absence' }),
  item(10, { workItemType: 'Feature', parentId: 1, title: 'Release 1' }), item(20, { parentId: 10 }),
  item(30, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Release 1', assignedTo: 'Ana', originalEstimate: 100, completedWork: 100 }),
  item(31, { workItemType: 'Task', parentId: 20, title: 'October 2026 | Town hall', assignedTo: 'Ana', tags: 'Internal meeting', completedWork: 4 }),
  item(40, { workItemType: 'Feature', parentId: 900, title: 'Ana - Leave', assignedTo: 'Ana' }), item(41, { parentId: 40, title: 'Ana - Time Writing' }),
  item(42, { workItemType: 'Task', parentId: 41, title: 'October 2026 | Ana - Maternity', assignedTo: 'Ana', completedWork: 40 }),
  item(43, { workItemType: 'Task', parentId: 41, title: 'October 2026 | Ana - Conference', assignedTo: 'Ana', completedWork: 8 }),
  item(44, { workItemType: 'Task', parentId: 41, title: 'October 2026 | Ana - Sick leave', assignedTo: 'Ana', completedWork: 8 }),
]
const settings = { ...defaultCapacitySettings, npraHoursPerMonth: 0, absenceEpicId: 900 }
const ana = (extra) => capacityModel(backlog, '2026-10', { ...settings, ...extra }).people.find((person) => person.name === 'Ana')

test('CAP-46: the built-in rules are the words used before', () => {
  assert.equal(absenceKind(['October 2026 | Ana - PTO']), 'PTO')
  assert.equal(absenceKind(['Emergency', 'Sick']), 'Unplanned Leave', 'Unplanned is checked first')
  assert.equal(absenceKind(['Medical appointment']), 'Sick Leave')
  assert.equal(absenceKind(['Annual leave']), 'PTO')
  assert.equal(absenceKind(['Holidays']), 'Other absence', 'whole words only')
  assert.ok(tagsHave('NPRA Hours; Other', ['npra']) && !tagsHave('npras', ['npra']) && tagsHave(' Training ', ['training']))
  assert.ok(titleHas('Q4 Trainings', defaultBucketRules.trainingWords) && !titleHas('Pretraining', defaultBucketRules.trainingWords))
  const person = ana({})
  assert.deepEqual([person.absenceByKind['Other absence'], person.absenceByKind['Sick Leave'], person.training, person.npraOther, person.work], [48, 8, 0, 0, 104], 'maternity and conference are other absence; the tagged town hall is work')
})

test('CAP-46: custom rules move Tasks between Absence kinds, Training, Other NPRA and Project work', () => {
  const rules = normalizeCapacitySettings({ ...settings, bucketRules: { ...defaultBucketRules, ptoWords: [...defaultBucketRules.ptoWords, 'maternity'], trainingWords: ['training', 'conference'], npraTags: ['npra', 'internal'] } }).bucketRules
  const person = ana({ bucketRules: rules })
  assert.deepEqual([person.absenceByKind.PTO, person.absenceByKind['Other absence'], person.absence, person.training, person.npraOther, person.work], [40, 0, 48, 8, 4, 100])
  // With the CAP-38 profile Training and Other NPRA count as utilized, absence comes off: 176 − 48 = 128; 100 + 8 + 4 = 112.
  assert.deepEqual([person.available, person.utilized], [128, 112])
})

test('CAP-46: bucket rules read from Git are checked; the built-in ones are not stored', () => {
  assert.deepEqual(normalizeWords(' PTO , Annual  Leave,pto,<script>, -x, ok-word ,' + 'a'.repeat(41)), ['pto', 'annual leave', 'ok-word'])
  assert.deepEqual(normalizeWords(Array.from({ length: 30 }, (_, at) => `w${at}`)).length, 20)
  assert.equal(normalizeBucketRules({ ...defaultBucketRules }), undefined, 'the built-in rules need no entry')
  assert.equal(normalizeBucketRules('nope'), undefined)
  const read = normalizeBucketRules({ ptoWords: [], sickWords: ['ill'], npraTags: [], trainingTags: 'x' })
  assert.deepEqual(read, { ...defaultBucketRules, sickWords: ['ill'], npraTags: [], trainingTags: ['x'] }, 'an empty word list falls back; an empty tag list stays empty')
  assert.equal('bucketRules' in normalizeCapacitySettings({}), false)
  assert.deepEqual(normalizeCapacitySettings({ bucketRules: { sickWords: ['ill'] } }).bucketRules.sickWords, ['ill'])
})
