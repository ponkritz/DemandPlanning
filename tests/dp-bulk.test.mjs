import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkPlan, dpReleaseType, emailFor, pickQe, possibleQes, qeFor } from '../src/dpBulk.ts'
import { cleanSetup } from '../src/featureSetup.ts'

const row = (id, psName, release, assignedTo = '', program = 'DP') => ({ key: `dp/${id}`, id, title: `${psName} ${release}`, workItemType: 'Release', state: 'Active', assignedTo, fields: { 'Custom.PsName': psName, 'Custom.Release': release, 'Custom.SourceProgram': program } })

test('DPF-08: the type read from x.y.z.a (Major, Minor, MLD, Platform Update) only prefills a bulk row’s Release Classification', () => {
  assert.deepEqual(dpReleaseType('5.0.0.0'), { type: 'Major', kind: 'release' })
  assert.deepEqual(dpReleaseType('v5.2'), { type: 'Minor', kind: 'release' }, 'missing parts are 0, a "v" is ignored')
  assert.deepEqual(dpReleaseType('5.2.1.0'), { type: 'MLD', kind: 'pu' })
  assert.deepEqual(dpReleaseType('5.2.1.3'), { type: 'Platform Update', kind: 'pu' })
  assert.deepEqual(dpReleaseType('5.0.0.4'), { type: 'Platform Update', kind: 'pu' })
  assert.equal(dpReleaseType('R12'), null); assert.equal(dpReleaseType(''), null); assert.equal(dpReleaseType('1.2.3.4.5'), null)
})

test('DPF-09: no built-in Release / PU sets — the old ones are no longer read; the QE Mapping columns stay', () => {
  const setup = cleanSetup({ epicId: 13946, featureDoD: 'x', releaseTypes: { pu: { featureDoD: 'DT done', stories: [{ title: 'DT : Review' }] } }, qeColumns: { matchColumn: 'Product', qeColumn: 'QE Name' } })
  assert.equal(setup.releaseTypes, undefined, 'dropped on load, so the next save removes them from Git')
  assert.deepEqual(setup.qeColumns, { matchColumn: 'Product', qeColumn: 'QE Name' })
  assert.equal(cleanSetup({ epicId: 13946, featureDoD: 'x', qeColumns: { matchColumn: 'Product' } }).qeColumns, undefined, 'both columns are needed')
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

test('DPF-04 / BLK-01: the bulk plan — title, type, QE with email, or why a release is skipped; a 100% Feature match is never created', () => {
  const board = [{ id: 1, assignedTo: 'Asha Rao <asha@x.com>', assignedToEmail: 'asha@x.com' }]
  assert.equal(emailFor('asha rao', board), 'asha@x.com'); assert.equal(emailFor('ben@x.com', board), 'ben@x.com'); assert.equal(emailFor('Nobody', board), '')
  const setup = cleanSetup({ epicId: 13946, featureDoD: 'x', qeColumns: columns })
  const rows = [row(1, 'Dose Planning', '5.2.1.3'), row(2, 'Dose Planning', 'R1'), row(3, 'Treatment Planning System', '2.0'), row(4, 'Nothing', '1.0'), row(5, 'Dose Planning', '6.0')]
  const hits = { 5: { item: { id: 905 }, score: 100 }, 1: { item: { id: 901 }, score: 88 } }
  const plan = bulkPlan(rows, { setup, qeMapping: mapping, board, featureMatch: (item) => hits[item.id] })
  assert.deepEqual(plan.map((line) => [line.type ?? '', line.qe, line.email, line.skip.split(' (')[0]]), [
    ['Platform Update', 'Asha Rao', 'asha@x.com', ''],
    ['', 'Asha Rao', 'asha@x.com', ''],
    ['Major', 'Ben Ito', '', 'no email found for Ben Ito'],
    ['Major', '', '', 'no QE in the QE Mapping for this product'],
    ['Major', 'Asha Rao', 'asha@x.com', 'Feature #905 on QMS-0025 matches it 100%'],
  ])
  assert.equal(plan[0].title, 'DP | Dose Planning | 5.2.1.3'); assert.equal(plan[0].set.featureDoD, 'x', 'DPF-07: an Epic with a setup uses its own DoD, not DP’s hidden built-in set')
  assert.match(bulkPlan([rows[0]], { setup: undefined, qeMapping: mapping, board, featureMatch: () => undefined })[0].skip, /has no Feature setup/, 'DPF-09: no setup at all — skipped, no built-in set')
  assert.equal(plan[0].note, 'a similar Feature #901 (88%) exists', 'BLK-01: a match below 100% is named, the release is still created')
  assert.match(bulkPlan([rows[0]], { setup: cleanSetup({ epicId: 13946, featureDoD: 'x' }), qeMapping: mapping, board, featureMatch: () => undefined })[0].skip, /QE Mapping columns are not set/)
})

test('DPF-06: the QE picked in the pop-up replaces the QE Mapping\'s and lets a release without one be created; other reasons still skip it (TC-DPF-05)', () => {
  const board = [{ id: 1, assignedTo: 'Asha Rao <asha@x.com>', assignedToEmail: 'asha@x.com' }, { id: 2, assignedTo: 'Cara Lim <cara@x.com>', assignedToEmail: 'cara@x.com' }]
  const people = [{ name: 'Asha Rao', email: 'asha@x.com' }, { name: 'Cara Lim', email: 'cara@x.com' }]
  const setup = cleanSetup({ epicId: 13946, featureDoD: 'x', qeColumns: columns })
  const rows = [row(1, 'Dose Planning', '5.2.1.3'), row(2, 'Dose Planning', 'R1'), row(4, 'Nothing', '1.0')]
  const plan = bulkPlan(rows, { setup, qeMapping: mapping, board, featureMatch: () => undefined })
  const picked = pickQe(plan, { 1: 'cara@x.com', 2: 'cara@x.com', 4: 'CARA@x.com' }, (line) => String(line.row.id), people)
  assert.deepEqual(picked.map((line) => [line.qe, line.email, line.skip.split(' (')[0], line.picked]), [
    ['Cara Lim', 'cara@x.com', '', true],
    ['Cara Lim', 'cara@x.com', '', true],
    ['Cara Lim', 'cara@x.com', '', true],
  ], 'a release without a QE in the mapping is created for the person picked')
  assert.deepEqual(pickQe(plan, { 1: 'asha@x.com' }, (line) => String(line.row.id), people).map((line) => line.picked), [false, false, false], 'picking the mapped QE changes nothing')
})
