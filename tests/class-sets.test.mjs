import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkSetFor, chooseSetup, classKindOf, cleanSetup, dpReleaseTypeDefaults, parseFeatureSetup, serializeFeatureSetup, setForClass } from '../src/featureSetup.ts'
import { builtinClassifications, classificationFromType, classificationOf, withEpicFields } from '../src/epicSetup.ts'
import { releaseClassifications } from '../src/azureDevOps.ts'
import { bulkPlan, ioccPlan } from '../src/dpBulk.ts'

const stories = (...titles) => titles.map((title) => ({ title, description: '' }))
const epic = (extra = {}) => cleanSetup({ epicId: 500, epicTitle: 'Tools', featureDoD: 'Epic DoD', stories: stories('Epic story'), ...extra })

test('DPF-07: an Epic keeps a DoD and User Stories per Release Classification value, cleaned and saved (TC-DPF-06)', () => {
  const setup = epic({ classSets: { ' Hotfix ': { featureDoD: ' Hotfix DoD ', stories: [{ title: 'Smoke test' }, { title: '' }] }, hotfix: { featureDoD: 'dup', stories: [] }, '': { featureDoD: 'x' }, Bad: 'nope' } })
  assert.deepEqual(setup.classSets, { Hotfix: { featureDoD: 'Hotfix DoD', stories: stories('Smoke test') } }, 'trimmed; a duplicate (any case), an empty name and a malformed set are dropped')
  const file = { schema: 1, kind: 'feature-setup', epics: [setup] }
  assert.deepEqual(parseFeatureSetup(serializeFeatureSetup(file)).epics[0].classSets, setup.classSets, 'kept through Save and Load')
  assert.equal(epic({ classSets: {} }).classSets, undefined)
})

test('DPF-07: the value chosen picks its own set, else the old Release / PU set, else the Epic default (TC-DPF-06)', () => {
  const setup = epic({ classSets: { Hotfix: { featureDoD: 'Hotfix DoD', stories: stories('Smoke test') }, Patch: { featureDoD: '', stories: stories('Patch check') } } })
  assert.deepEqual(setForClass(setup, 'hotfix'), { featureDoD: 'Hotfix DoD', stories: stories('Smoke test'), from: 'value' }, 'any case')
  assert.equal(setForClass(setup, 'Patch').featureDoD, 'Epic DoD', 'an empty DoD in the set uses the Epic’s')
  assert.equal(setForClass(setup, 'Major'), undefined, 'a value without a set: the Epic default')
  assert.equal(setForClass(setup, ''), undefined)
  const legacy = epic({ releaseTypes: { release: { featureDoD: 'R', stories: [{ title: 'PRD' }] }, pu: { featureDoD: 'P', stories: [{ title: 'DT' }] } } })
  assert.equal(setForClass(legacy, 'Minor').featureDoD, 'R'); assert.equal(setForClass(legacy, 'Service Pack').featureDoD, 'P'); assert.equal(setForClass(legacy, 'Hotfix'), undefined)
  assert.deepEqual(['Major', 'minor', 'MLD', 'Platform Update', 'Service Pack', 'Hotfix'].map(classKindOf), ['release', 'release', 'pu', 'pu', 'pu', undefined])
})

test('DPF-07: bulk sets — the value’s set, else the old set of the number’s type, else the Epic’s own, built-ins only without a setup', () => {
  const setup = epic({ classSets: { Hotfix: { featureDoD: 'Hotfix DoD', stories: stories('Smoke test') } } })
  assert.equal(bulkSetFor(setup, 'Hotfix', 'pu').featureDoD, 'Hotfix DoD')
  assert.deepEqual(bulkSetFor(setup, '', 'pu'), { featureDoD: 'Epic DoD', stories: stories('Epic story') }, 'no DP built-ins once the Epic has a setup')
  assert.deepEqual(bulkSetFor(undefined, '', 'pu'), dpReleaseTypeDefaults.pu)
  assert.equal(bulkSetFor(undefined, '', undefined), undefined)
})

test('DPF-07: my own version without sets per value uses the shared ones', () => {
  const shared = { schema: 1, kind: 'feature-setup', epics: [epic({ classSets: { Hotfix: { featureDoD: 'H', stories: [] } } })] }
  const personal = { schema: 1, kind: 'feature-setup', epics: [cleanSetup({ epicId: 500, featureDoD: 'Mine', stories: [] })] }
  assert.equal(setForClass(chooseSetup({ shared, personal }, 500).setup, 'Hotfix').featureDoD, 'H')
})

test('DPF-07: an Epic’s Release Classification values come from its own List field, else the built-in picker', () => {
  assert.deepEqual(builtinClassifications, [...releaseClassifications], 'the same built-in values as New Feature')
  const file = { schema: 1, kind: 'epic-setup', lists: [{ id: 'rc', name: 'RC', values: ['Major', 'Hotfix'] }], epics: [{ epicId: 500, epicTitle: 'Tools', fields: [{ label: 'Program', type: 'text', ifEmpty: 'optional', into: 'title' }, { label: 'Release Classification', type: 'list', list: 'rc', ifEmpty: 'block', into: 'description' }] }] }
  assert.deepEqual(classificationOf(file, 500), { values: ['Major', 'Hotfix'], fieldIndex: 1, label: 'Release Classification' })
  assert.deepEqual(classificationOf(file, 9), { values: builtinClassifications, fieldIndex: -1, label: 'Release Classification' })
  assert.equal(classificationFromType(['Major', 'Hotfix'], 'Major'), 'Major'); assert.equal(classificationFromType(['Major', 'Hotfix'], 'MLD'), '')
  const lines = withEpicFields([{ title: 'T' }], file.epics[0], () => [], { index: 1, of: () => 'Hotfix' })
  assert.deepEqual([lines[0].fieldLines, lines[0].skip], [['Release Classification : Hotfix'], undefined], 'the value picked on the row fills the Epic’s field (a Block field no longer skips it)')
})

test('DPF-08: bulk rows — the classification prefilled from the release number, picked per row, and it picks the set (TC-DPF-07)', () => {
  const setup = epic({ qeColumns: { matchColumn: 'Product', qeColumn: 'QE' }, classSets: { Hotfix: { featureDoD: 'Hotfix DoD', stories: stories('Smoke test') } } })
  const row = (id, release) => ({ key: `dp/${id}`, id, title: `Dose ${release}`, workItemType: 'Release', state: 'Active', fields: { 'Custom.PsName': 'Dose', 'Custom.Release': release, 'Custom.SourceProgram': 'DP' } })
  const options = { setup, qeMapping: null, board: [], featureMatch: () => undefined, classValues: ['Major', 'Hotfix'] }
  const plan = bulkPlan([row(1, '5.0.0.0'), row(2, '5.2.1.3'), row(3, 'R1')], { ...options, classes: { 3: 'Hotfix' } })
  assert.deepEqual(plan.map((line) => [line.classification, line.set?.featureDoD ?? '', /no release type/.test(line.skip)]), [['Major', 'Epic DoD', false], ['', 'Epic DoD', false], ['Hotfix', 'Hotfix DoD', false]], 'Major is in the list; Platform Update is not; R1 is created once a value is chosen')
  assert.match(bulkPlan([row(3, 'R1')], options)[0].skip, /choose its Release Classification/)
  assert.equal(bulkPlan([row(1, '5.0.0.0')], { ...options, classes: { 1: 'Hotfix' } })[0].set.featureDoD, 'Hotfix DoD', 'the pick replaces the prefilled value')
  const release = (name, number) => ({ key: `${name} ${number}`, name, release: number, documents: 1, items: [], tracked: false, trackedBy: [], features: [] })
  const iocc = ioccPlan([release('CT', '2.0.0.0'), release('CT', 'beta')], { setup, qeMapping: null, board: [], epicId: 500, featureTitle: () => 't', featureMatch: () => undefined, classValues: ['Major', 'Hotfix'], classes: { 'CT beta': 'Hotfix' } })
  assert.deepEqual(iocc.map((line) => [line.classification, line.set?.featureDoD]), [['Major', 'Epic DoD'], ['Hotfix', 'Hotfix DoD']])
})
