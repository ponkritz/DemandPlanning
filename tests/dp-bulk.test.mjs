import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkPlan, dpReleaseType, emailFor, possibleQes, qeFor } from '../src/dpBulk.ts'
import { cleanSetup, dpReleaseTypeDefaults, releaseTypesOf } from '../src/featureSetup.ts'

const row = (id, psName, release, assignedTo = '', program = 'DP') => ({ key: `dp/${id}`, id, title: `${psName} ${release}`, workItemType: 'Release', state: 'Active', assignedTo, fields: { 'Custom.PsName': psName, 'Custom.Release': release, 'Custom.SourceProgram': program } })

test('DPF-01: the release type from x.y.z.a — Major and Minor are a Release, MLD and Platform Update a PU', () => {
  assert.deepEqual(dpReleaseType('5.0.0.0'), { type: 'Major', kind: 'release' })
  assert.deepEqual(dpReleaseType('v5.2'), { type: 'Minor', kind: 'release' }, 'missing parts are 0, a "v" is ignored')
  assert.deepEqual(dpReleaseType('5.2.1.0'), { type: 'MLD', kind: 'pu' })
  assert.deepEqual(dpReleaseType('5.2.1.3'), { type: 'Platform Update', kind: 'pu' })
  assert.deepEqual(dpReleaseType('5.0.0.4'), { type: 'Platform Update', kind: 'pu' })
  assert.equal(dpReleaseType('R12'), null); assert.equal(dpReleaseType(''), null); assert.equal(dpReleaseType('1.2.3.4.5'), null)
})

test('DPF-01: Epic 13946 sets — Release: PRD, SFV, DT, IQ/OQ and the IQ/OQ DoD; PU: SFV, DT, IQ/OQ and the DT DoD; kept in the setup', () => {
  assert.deepEqual(dpReleaseTypeDefaults.release.stories.map((story) => story.title.split(' :')[0]), ['PRD', 'SFV', 'DT', 'IQ/OQ'])
  assert.deepEqual(dpReleaseTypeDefaults.pu.stories.map((story) => story.title.split(' :')[0]), ['SFV', 'DT', 'IQ/OQ'])
  assert.equal(dpReleaseTypeDefaults.release.featureDoD, 'IQ/OQ is complete and Checklist is uploaded into the feature.')
  assert.equal(dpReleaseTypeDefaults.pu.featureDoD, 'DT is finished.')
  const setup = cleanSetup({ epicId: 13946, featureDoD: 'x', releaseTypes: { pu: { featureDoD: 'DT done', stories: [{ title: 'DT : Review' }, { title: '' }] } }, qeColumns: { matchColumn: 'Product', qeColumn: 'QE Name' } })
  assert.equal(setup.releaseTypes.pu.featureDoD, 'DT done'); assert.deepEqual(setup.releaseTypes.pu.stories.map((story) => story.title), ['DT : Review'])
  assert.equal(setup.releaseTypes.release.featureDoD, dpReleaseTypeDefaults.release.featureDoD, 'a missing type keeps the built-in values')
  assert.deepEqual(setup.qeColumns, { matchColumn: 'Product', qeColumn: 'QE Name' })
  assert.equal(cleanSetup({ epicId: 13946, featureDoD: 'x', qeColumns: { matchColumn: 'Product' } }).qeColumns, undefined, 'both columns are needed')
  assert.equal(releaseTypesOf(undefined), dpReleaseTypeDefaults)
})

const mapping = { schema: 1, kind: 'qe-mapping', sheets: [{ id: 's', name: 'Map', columns: [{ id: 'a', name: 'Platform / Product' }, { id: 'b', name: 'QE Name' }], rows: [
  { id: '1', cells: { a: 'Dose Planning', b: 'Asha Rao' } }, { id: '2', cells: { a: 'Treatment Planning System', b: 'Ben Ito' } }, { id: '3', cells: { a: 'Other', b: '' } }] }] }
const columns = { matchColumn: 'platform/product', qeColumn: 'qe name' }

test('DPF-02: the QE comes from the QE Mapping row naming the product (PsName, else Program); columns chosen in the setup', () => {
  assert.deepEqual(qeFor(row(1, 'Dose Planning', '5.0.0.0'), mapping, columns), { product: 'Dose Planning', qe: 'Asha Rao' }, 'exact, columns matched ignoring case and punctuation')
  assert.equal(qeFor(row(2, 'Planning System', '1.0'), mapping, columns).qe, 'Ben Ito', 'whole words inside the mapped name')
  assert.equal(qeFor(row(3, 'Unknown', '1.0', '', 'Dose Planning'), mapping, columns).qe, 'Asha Rao', 'else the Program')
  assert.equal(qeFor(row(4, 'Unknown', '1.0', '', 'X'), mapping, columns), null)
  assert.equal(qeFor(row(1, 'Dose Planning', '1.0'), mapping, undefined), null, 'no columns set')
  assert.equal(qeFor(row(1, 'Dose Planning', '1.0'), mapping, { matchColumn: 'Nope', qeColumn: 'QE Name' }), null)
})

test('DPF-03: possible QEs are the people on the earlier releases of the product, newest first, without the QE and the release\'s own assignee', () => {
  const rows = [row(10, 'Dose Planning', '5.2.0.0', 'Cara Lim <cara@x.com>'), row(11, 'Dose Planning', '5.1.0.0', 'Asha Rao'), row(12, 'Dose Planning', '5.0.0.0', 'Dev Shah'), row(13, 'Dose Planning', '4.9.0.0', 'Cara Lim'), row(14, 'Dose Planning', '6.0.0.0', 'Eve Ng'), row(15, 'Other', '1.0', 'Finn Ola')]
  assert.deepEqual(possibleQes(rows[0], rows, 'Asha Rao'), ['Dev Shah'], 'later releases, other products, the QE and the own assignee are left out')
  assert.deepEqual(possibleQes(row(16, 'Dose Planning', '7.0.0.0', 'Zoe'), rows, 'Asha Rao'), ['Eve Ng', 'Cara Lim', 'Dev Shah'])
})

test('DPF-04: the bulk plan — title, type, QE with email, or why a release is skipped', () => {
  const board = [{ id: 1, assignedTo: 'Asha Rao <asha@x.com>', assignedToEmail: 'asha@x.com' }]
  assert.equal(emailFor('asha rao', board), 'asha@x.com'); assert.equal(emailFor('ben@x.com', board), 'ben@x.com'); assert.equal(emailFor('Nobody', board), '')
  const setup = cleanSetup({ epicId: 13946, featureDoD: 'x', qeColumns: columns })
  const rows = [row(1, 'Dose Planning', '5.2.1.3'), row(2, 'Dose Planning', 'R1'), row(3, 'Treatment Planning System', '2.0'), row(4, 'Nothing', '1.0'), row(5, 'Dose Planning', '6.0')]
  const plan = bulkPlan(rows, { setup, qeMapping: mapping, board, hasFeature: (item) => item.id === 5 })
  assert.deepEqual(plan.map((line) => [line.type ?? '', line.qe, line.email, line.skip.split(' (')[0]]), [
    ['Platform Update', 'Asha Rao', 'asha@x.com', ''],
    ['', 'Asha Rao', 'asha@x.com', 'no release type from the version “R1”'],
    ['Major', 'Ben Ito', '', 'no email found for Ben Ito'],
    ['Major', '', '', 'no QE in the QE Mapping for this product'],
    ['Major', 'Asha Rao', 'asha@x.com', 'already has a Feature on QMS-0025'],
  ])
  assert.equal(plan[0].title, 'DP | Dose Planning | 5.2.1.3'); assert.equal(plan[0].set.featureDoD, 'DT is finished.')
  assert.match(bulkPlan([rows[0]], { setup: cleanSetup({ epicId: 13946, featureDoD: 'x' }), qeMapping: mapping, board, hasFeature: () => false })[0].skip, /QE Mapping columns are not set/)
})
