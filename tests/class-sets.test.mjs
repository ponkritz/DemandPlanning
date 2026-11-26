import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkSetFor, chooseSetup, cleanSetup, parseFeatureSetup, serializeFeatureSetup, setForClass } from '../src/featureSetup.ts'
import { classificationFromType, classificationOf, withEpicFields } from '../src/epicSetup.ts'
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

test('DPF-07: the value chosen picks its own set, else the Epic default; old Release / PU sets are not used (TC-DPF-06)', () => {
  const setup = epic({ classSets: { Hotfix: { featureDoD: 'Hotfix DoD', stories: stories('Smoke test') }, Patch: { featureDoD: '', stories: stories('Patch check') } } })
  assert.deepEqual(setForClass(setup, 'hotfix'), { featureDoD: 'Hotfix DoD', stories: stories('Smoke test') }, 'any case')
  assert.equal(setForClass(setup, 'Patch').featureDoD, 'Epic DoD', 'an empty DoD in the set uses the Epic’s')
  assert.equal(setForClass(setup, 'Major'), undefined, 'a value without a set: the Epic default')
  assert.equal(setForClass(setup, ''), undefined)
  const legacy = epic({ releaseTypes: { release: { featureDoD: 'R', stories: [{ title: 'PRD' }] }, pu: { featureDoD: 'P', stories: [{ title: 'DT' }] } } })
  assert.equal(setForClass(legacy, 'Minor'), undefined, 'DPF-09: the old Release / PU sets are no longer used')
})

test('DPF-07, DPF-09: bulk sets — the value’s set, else the Epic’s own; nothing without a setup (no built-ins)', () => {
  const setup = epic({ classSets: { Hotfix: { featureDoD: 'Hotfix DoD', stories: stories('Smoke test') } } })
  assert.equal(bulkSetFor(setup, 'Hotfix').featureDoD, 'Hotfix DoD')
  assert.deepEqual(bulkSetFor(setup, ''), { featureDoD: 'Epic DoD', stories: stories('Epic story') })
  assert.equal(bulkSetFor(undefined, 'Major'), undefined, 'no built-in sets')
})

test('DPF-07: my own version without sets per value uses the shared ones', () => {
  const shared = { schema: 1, kind: 'feature-setup', epics: [epic({ classSets: { Hotfix: { featureDoD: 'H', stories: [] } } })] }
  const personal = { schema: 1, kind: 'feature-setup', epics: [cleanSetup({ epicId: 500, featureDoD: 'Mine', stories: [] })] }
  assert.equal(setForClass(chooseSetup({ shared, personal }, 500).setup, 'Hotfix').featureDoD, 'H')
})

test('DPF-07, DPF-09: an Epic’s Release Classification values come from its own List field only (no built-in values)', () => {
  const file = { schema: 1, kind: 'epic-setup', lists: [{ id: 'rc', name: 'RC', values: ['Major', 'Hotfix'] }], epics: [{ epicId: 500, epicTitle: 'Tools', fields: [{ label: 'Program', type: 'text', ifEmpty: 'optional', into: 'title' }, { label: 'Release Classification', type: 'list', list: 'rc', ifEmpty: 'block', into: 'description' }] }] }
  assert.deepEqual(classificationOf(file, 500), { values: ['Major', 'Hotfix'], fieldIndex: 1, label: 'Release Classification', rules: [] })
  assert.deepEqual(classificationOf(file, 9), { values: [], fieldIndex: -1, label: 'Release Classification', rules: [] })
  assert.equal(classificationFromType(['Major', 'Hotfix'], 'Major'), 'Major'); assert.equal(classificationFromType(['Major', 'Hotfix'], 'MLD'), '')
  const lines = withEpicFields([{ title: 'T' }], file.epics[0], () => [], { index: 1, of: () => 'Hotfix' })
  assert.deepEqual([lines[0].fieldLines, lines[0].skip], [['Release Classification : Hotfix'], undefined], 'the value picked on the row fills the Epic’s field (a Block field no longer skips it)')
})

test('DPF-08: bulk rows — the classification prefilled from the release number, picked per row, and it picks the set (TC-DPF-07)', () => {
  const setup = epic({ qeColumns: { matchColumn: 'Product', qeColumn: 'QE' }, classSets: { Hotfix: { featureDoD: 'Hotfix DoD', stories: stories('Smoke test') } } })
  const row = (id, release) => ({ key: `dp/${id}`, id, title: `Dose ${release}`, workItemType: 'Release', state: 'Active', fields: { 'Custom.PsName': 'Dose', 'Custom.Release': release, 'Custom.SourceProgram': 'DP' } })
  const options = { setup, board: [], featureMatch: () => undefined, classValues: ['Major', 'Hotfix'] }
  const plan = bulkPlan([row(1, '5.0.0.0'), row(2, '5.2.1.3'), row(3, 'R1')], { ...options, classes: { 3: 'Hotfix' } })
  assert.deepEqual(plan.map((line) => [line.classification, line.set?.featureDoD ?? '', /no release type/.test(line.skip)]), [['Major', 'Epic DoD', false], ['', 'Epic DoD', false], ['Hotfix', 'Hotfix DoD', false]], 'Major is in the list; Platform Update is not; R1 takes the value chosen')
  assert.deepEqual([bulkPlan([row(3, 'R1')], options)[0].classification, bulkPlan([row(3, 'R1')], options)[0].set.featureDoD], ['', 'Epic DoD'], 'no value: the Epic default, never skipped for a missing type')
  assert.equal(bulkPlan([row(1, '5.0.0.0')], { ...options, classes: { 1: 'Hotfix' } })[0].set.featureDoD, 'Hotfix DoD', 'the pick replaces the prefilled value')
  const release = (name, number) => ({ key: `${name} ${number}`, name, release: number, documents: 1, items: [], tracked: false, trackedBy: [], features: [] })
  const iocc = ioccPlan([release('CT', '2.0.0.0'), release('CT', 'beta')], { setup, board: [], epicId: 500, featureTitle: () => 't', featureMatch: () => undefined, classValues: ['Major', 'Hotfix'], classes: { 'CT beta': 'Hotfix' } })
  assert.deepEqual(iocc.map((line) => [line.classification, line.set?.featureDoD]), [['Major', 'Epic DoD'], ['Hotfix', 'Hotfix DoD']])
})
