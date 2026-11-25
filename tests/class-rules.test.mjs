import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanSetup } from '../src/featureSetup.ts'
import { classRuleProblems, classificationOf, cleanClassRules, detectClassification, parseEpicSetup, releasePartOf, serializeEpicSetup, toggleClassRule, usualClassRules } from '../src/epicSetup.ts'
import { bulkPlan, ioccPlan } from '../src/dpBulk.ts'

// DPF-10…DPF-12: the Release Classification detected from the release number by rules set per value on the Epic's
// Release Classification List field (synthetic data only).
const field = (extra = {}) => ({ label: 'Release Classification', type: 'list', list: 'rc', ifEmpty: 'block', into: 'description', ...extra })
const fileWith = (fields, values = ['Release', 'MLD', 'PU']) => ({ schema: 1, kind: 'epic-setup', lists: [{ id: 'rc', name: 'RC', values }], epics: [{ epicId: 500, epicTitle: 'Tools', fields }] })
const rules = [{ value: 'Release', parts: ['x.0', 'x.y'] }, { value: 'MLD', parts: ['x.y.z'] }, { value: 'PU', parts: ['x.y.z.w'] }]

test('DPF-10: the rules are read strictly and kept through Save and Load; a file without them reads as before (TC-DPF-09)', () => {
  const file = parseEpicSetup(JSON.stringify(fileWith([field({ classRules: rules })])))
  assert.deepEqual(file.epics[0].fields[0].classRules, rules)
  assert.deepEqual(parseEpicSetup(serializeEpicSetup(file)).epics[0].fields[0].classRules, rules, 'round trip')
  assert.match(serializeEpicSetup(file), /"classRules": \[/)
  const old = parseEpicSetup(JSON.stringify(fileWith([field()])))
  assert.equal(old.epics[0].fields[0].classRules, undefined, 'an older file has no rules')
  assert.equal(serializeEpicSetup(old).includes('classRules'), false, 'and none are written')
  // Malformed input: unknown parts, a part given twice (the first keeps it), a duplicate value (any case), an empty
  // value, a rule without parts, not an array.
  assert.deepEqual(cleanClassRules([{ value: ' Release ', parts: ['x.0', 'x.0', 'y', 3] }, { value: 'release', parts: ['x.y'] }, { value: 'MLD', parts: ['x.0', 'x.y.z'] }, { value: '', parts: ['x.y'] }, { value: 'PU', parts: [] }, { value: 'Hotfix', parts: 'x.y' }, null]), [{ value: 'Release', parts: ['x.0'] }, { value: 'MLD', parts: ['x.y.z'] }])
  assert.equal(cleanClassRules('x.0'), undefined)
  assert.equal(cleanClassRules([{ value: 'PU', parts: ['z'] }]), undefined)
  // Only on a known List field named Release Classification.
  assert.equal(parseEpicSetup(JSON.stringify(fileWith([field({ label: 'Program', classRules: rules })]))).epics[0].fields[0].classRules, undefined)
  assert.equal(parseEpicSetup(JSON.stringify(fileWith([field({ type: 'text', classRules: rules })]))).epics[0].fields[0].classRules, undefined)
  assert.deepEqual(classificationOf(file, 500).rules, rules, 'classificationOf gives the rules with the values')
})

test('DPF-10: a part may be given to one value only — named in the message; ticking and the usual rules (TC-DPF-09)', () => {
  assert.deepEqual(classRuleProblems(rules), [])
  assert.deepEqual(classRuleProblems([{ value: 'Release', parts: ['x.y'] }, { value: 'Minor', parts: ['x.y'] }]), ['x.y is given to Release and Minor: a part of the release number may decide one value only.'])
  let next = toggleClassRule([], 'MLD', 'x.y.z', true)
  next = toggleClassRule(next, 'Release', 'x.y', true)
  next = toggleClassRule(next, 'Release', 'x.0', true)
  assert.deepEqual(next, [{ value: 'MLD', parts: ['x.y.z'] }, { value: 'Release', parts: ['x.0', 'x.y'] }], 'parts in their order')
  assert.deepEqual(toggleClassRule(next, 'MLD', 'x.y.z', false), [{ value: 'Release', parts: ['x.0', 'x.y'] }], 'a value without parts has no rule')
  assert.deepEqual(usualClassRules(['major', 'Minor', 'MLD', 'Platform Update', 'Hotfix']), [{ value: 'major', parts: ['x.0'] }, { value: 'Minor', parts: ['x.y'] }, { value: 'MLD', parts: ['x.y.z'] }, { value: 'Platform Update', parts: ['x.y.z.w'] }])
  assert.deepEqual(usualClassRules(['Release', 'MLD', 'PU']), [{ value: 'MLD', parts: ['x.y.z'] }, { value: 'PU', parts: ['x.y.z.w'] }], 'only the values named so')
  assert.deepEqual(usualClassRules(['Release', 'Hotfix']), [])
})

test('DPF-11: the value detected from x.0, x.y, x.y.z and x.y.z.w; a leading v; not numeric gives none (TC-DPF-10)', () => {
  assert.deepEqual(['5', '5.0', '5.0.0', '5.0.0.0', '5.2', '5.2.0.0', '5.2.1', '5.2.1.0', '5.2.1.3', 'v5.2.1', 'V6.0', ' 7.1 ', 'R1', '5.2-beta', '1.2.3.4.5', ''].map(releasePartOf),
    ['x.0', 'x.0', 'x.0', 'x.0', 'x.y', 'x.y', 'x.y.z', 'x.y.z', 'x.y.z.w', 'x.y.z', 'x.0', 'x.y', null, null, null, null])
  const classes = { values: ['Release', 'MLD', 'PU'], rules }
  assert.deepEqual(['6.0', '5.2', '5.2.1', '5.2.1.3', 'v5.2.1', 'beta'].map((version) => detectClassification(classes, version)), ['Release', 'Release', 'MLD', 'PU', 'MLD', ''])
  assert.equal(detectClassification({ values: ['Release', 'MLD'], rules: [{ value: 'MLD', parts: ['x.y.z'] }] }, '5.2'), '', 'a part without a rule gives none')
  assert.equal(detectClassification({ values: ['Release'], rules: [{ value: 'Gone', parts: ['x.y'] }] }, '5.2'), '', 'a rule for a value no longer in the list gives none')
  assert.equal(detectClassification({ values: ['release'], rules: [{ value: 'Release', parts: ['x.y'] }] }, '5.2'), 'release', 'the list’s spelling')
})

test('DPF-11: without rules, today’s behaviour — the value named like the release type (TC-DPF-10)', () => {
  const classes = { values: ['Major', 'Minor', 'MLD', 'Platform Update', 'Hotfix'], rules: [] }
  assert.deepEqual(['5.0.0.0', '5.2', '5.2.1', '5.2.1.3', 'R1'].map((version) => detectClassification(classes, version)), ['Major', 'Minor', 'MLD', 'Platform Update', ''])
  assert.equal(detectClassification({ values: ['Release', 'PU'], rules: [] }, '5.2.1.3'), '', 'PU is not matched by name without rules (as before)')
})

test('DPF-11: DP and IOCC bulk rows are prefilled by the rules, the hint value kept, a pick still wins (TC-DPF-10)', () => {
  const setup = cleanSetup({ epicId: 500, epicTitle: 'Tools', featureDoD: 'Epic DoD', stories: [], classSets: { MLD: { featureDoD: 'MLD DoD', stories: [] } } })
  const row = (id, release) => ({ key: `dp/${id}`, id, title: `Dose ${release}`, workItemType: 'Release', state: 'Active', fields: { 'Custom.PsName': 'Dose Planning', 'Custom.Release': release, 'Custom.SourceProgram': 'DP' } })
  const options = { setup, qeMapping: null, board: [], featureMatch: () => undefined, classValues: ['Release', 'MLD', 'PU'], classRules: rules }
  const plan = bulkPlan([row(1, '6.0'), row(2, '5.2.1'), row(3, '5.2.1.3'), row(4, 'R1')], { ...options, classes: { 3: 'Release' } })
  assert.deepEqual(plan.map((line) => [line.name, line.version, line.detected, line.classification, line.set.featureDoD]), [
    ['Dose Planning', '6.0', 'Release', 'Release', 'Epic DoD'], ['Dose Planning', '5.2.1', 'MLD', 'MLD', 'MLD DoD'], ['Dose Planning', '5.2.1.3', 'PU', 'Release', 'Epic DoD'], ['Dose Planning', 'R1', '', '', 'Epic DoD']])
  const before = bulkPlan([row(1, '6.0')], { ...options, classRules: undefined, classValues: ['Major', 'MLD'] })
  assert.equal(before[0].classification, 'Major', 'no rules: matched by name, as before')
  const release = (name, number) => ({ key: `${name} ${number}`, name, release: number, documents: 1, items: [], tracked: false, trackedBy: [], features: [] })
  const iocc = ioccPlan([release('CT', '2.1.4'), release('CT', 'v3.0'), release('CT', 'beta')], { setup, qeMapping: null, board: [], epicId: 500, featureTitle: () => 't', featureMatch: () => undefined, classValues: ['Release', 'MLD', 'PU'], classRules: rules })
  assert.deepEqual(iocc.map((line) => [line.detected, line.classification, line.set.featureDoD]), [['MLD', 'MLD', 'MLD DoD'], ['Release', 'Release', 'Epic DoD'], ['', '', 'Epic DoD']])
})
