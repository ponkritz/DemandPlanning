import test from 'node:test'
import assert from 'node:assert/strict'
import { bulkPlan, dpReleaseType, emailFor, pickQe, possibleQes, qeFor } from '../src/dpBulk.ts'
import { cleanSetup, parseFeatureSetup, serializeFeatureSetup } from '../src/featureSetup.ts'
import { needsQePage, oldQeColumnsHint, qeColumnChoices, qeSourceOf, resolveQePage } from '../src/qePage.ts'

const row = (id, psName, release, assignedTo = '', program = 'DP') => ({ key: `dp/${id}`, id, title: `${psName} ${release}`, workItemType: 'Release', state: 'Active', assignedTo, fields: { 'Custom.PsName': psName, 'Custom.Release': release, 'Custom.SourceProgram': program } })

test('DPF-08: the type read from x.y.z.a (Major, Minor, MLD, Platform Update) only prefills a bulk row’s Release Classification', () => {
  assert.deepEqual(dpReleaseType('5.0.0.0'), { type: 'Major', kind: 'release' })
  assert.deepEqual(dpReleaseType('v5.2'), { type: 'Minor', kind: 'release' }, 'missing parts are 0, a "v" is ignored')
  assert.deepEqual(dpReleaseType('5.2.1.0'), { type: 'MLD', kind: 'pu' })
  assert.deepEqual(dpReleaseType('5.2.1.3'), { type: 'Platform Update', kind: 'pu' })
  assert.deepEqual(dpReleaseType('5.0.0.4'), { type: 'Platform Update', kind: 'pu' })
  assert.equal(dpReleaseType('R12'), null); assert.equal(dpReleaseType(''), null); assert.equal(dpReleaseType('1.2.3.4.5'), null)
})

test('DPF-09: no built-in Release / PU sets — the old ones are no longer read; the QE Mapping columns of an older setup stay as written (EPS-09)', () => {
  const setup = cleanSetup({ epicId: 13946, featureDoD: 'x', releaseTypes: { pu: { featureDoD: 'DT done', stories: [{ title: 'DT : Review' }] } }, qeColumns: { matchColumn: 'Product', qeColumn: 'QE Name' } })
  assert.equal(setup.releaseTypes, undefined, 'dropped on load, so the next save removes them from Git')
  assert.deepEqual(setup.qeColumns, { matchColumn: 'Product', qeColumn: 'QE Name' })
  assert.equal(cleanSetup({ epicId: 13946, featureDoD: 'x', qeColumns: { matchColumn: 'Product' } }).qeColumns, undefined, 'both columns are needed')
})

// DPF-02: the QE page — an On-Demand Table page (here "Resource Mapping") with made-up rows; its columns by id.
const qePage = { schema: 1, kind: 'on-demand-page', id: 'resource-mapping', name: 'Resource Mapping', description: '', keyPrefix: 'RM', insights: [], columns: [
  { id: 'a', name: 'Platform / Product', type: 'text', options: [], required: false }, { id: 'b', name: 'QE Name', type: 'dropdown', options: ['Asha Rao', 'Ben Ito'], required: false }], rows: [
  { id: '1', cells: { a: 'Dose Planning', b: 'Asha Rao' } }, { id: '2', cells: { a: 'Treatment Planning System', b: 'Ben Ito' } }, { id: '3', cells: { a: 'Other', b: '' } }, { id: '4', hidden: { by: 'x', at: '2026-11-01' }, cells: { a: 'Hidden Product', b: 'Ben Ito' } }] }
const setting = { pageId: 'resource-mapping', matchColumn: 'a', qeColumn: 'b' }
const mapping = qeSourceOf(qePage, setting)

test('DPF-02: the QE comes from the QE page row naming the product (PsName, else Program); the page and its columns chosen in the setup by id (TC-DPF-02)', () => {
  assert.deepEqual(qeFor(row(1, 'Dose Planning', '5.0.0.0'), mapping), { product: 'Dose Planning', qe: 'Asha Rao' }, 'exact, ignoring case and punctuation')
  assert.equal(qeFor(row(2, 'Planning System', '1.0'), mapping).qe, 'Ben Ito', 'whole words inside the mapped name')
  assert.equal(qeFor(row(3, 'Unknown', '1.0', '', 'Dose Planning'), mapping).qe, 'Asha Rao', 'else the Program')
  assert.equal(qeFor(row(4, 'Unknown', '1.0', '', 'X'), mapping), null)
  assert.equal(qeFor(row(5, 'Hidden Product', '1.0'), mapping), null, 'a hidden row is not used')
  assert.deepEqual(qeSourceOf(qePage, undefined), { problem: 'not-set' }, 'no page set')
  assert.deepEqual(qeSourceOf(qePage, { ...setting, qeColumn: 'nope' }), { problem: 'not-set' }, 'a column no longer on the page')
  assert.deepEqual(qeSourceOf(null, setting), { problem: 'missing' }, 'the page is not there')
  assert.equal(qeFor(row(1, 'Dose Planning', '1.0'), { problem: 'not-set' }), null)
  // A rename keeps the choice: the columns are kept by id.
  const renamed = { ...qePage, columns: qePage.columns.map((column) => column.id === 'b' ? { ...column, name: 'Quality Engineer' } : column) }
  assert.equal(qeFor(row(1, 'Dose Planning', '1.0'), qeSourceOf(renamed, setting)).qe, 'Asha Rao')
  // LST: a Dropdown with a built-in list gives the display name the list has now (a renamed person by their key).
  const listed = { ...qePage, columns: [qePage.columns[0], { ...qePage.columns[1], list: 'team:qe', items: [{ id: 'id-asha', name: 'Asha R. (QE)' }] }], rows: [{ id: '1', refs: { b: ['id-asha'] }, cells: { a: 'Dose Planning', b: 'Asha Rao' } }] }
  assert.equal(qeFor(row(1, 'Dose Planning', '1.0'), qeSourceOf(listed, setting)).qe, 'Asha R. (QE)')
  assert.deepEqual(qeColumnChoices(listed).map((column) => column.id), ['a', 'b'], 'Text and Dropdown (also a built-in list) columns are offered for the QE')
})

test('EPS-09: the QE page is stored by id in the Epic setup; the page named Resource Mapping is the default; an older setup with only QE Mapping columns is kept and asks for the page, nothing guessed (TC-EPS-07)', () => {
  const file = parseFeatureSetup(JSON.stringify({ schema: 1, kind: 'feature-setup', epics: [
    { epicId: 13946, featureDoD: 'x', qePage: setting },
    { epicId: 21000, featureDoD: 'y', qeColumns: { matchColumn: 'Platform / Product', qeColumn: 'QE Name' } },
    { epicId: 21001, featureDoD: 'z', qePage: { pageId: 'Bad Id', matchColumn: 'a', qeColumn: 'b' } },
    { epicId: 21002, featureDoD: 'z', qePage: { pageId: 'resource-mapping', matchColumn: 'a' } },
  ] }))
  assert.deepEqual(file.epics[0].qePage, setting)
  assert.deepEqual([file.epics[2].qePage, file.epics[3].qePage], [undefined, undefined], 'a bad id or a missing column is not read')
  assert.deepEqual(parseFeatureSetup(serializeFeatureSetup(file)).epics[1].qeColumns, { matchColumn: 'Platform / Product', qeColumn: 'QE Name' }, 'qeColumns kept as written for older app versions')
  assert.equal(needsQePage(file.epics[1]), true); assert.equal(needsQePage(file.epics[0]), false)
  assert.equal(oldQeColumnsHint(file.epics[1].qeColumns), 'The old QE Mapping columns (“Platform / Product”, “QE Name”) need choosing again on the QE page.')
  const pages = [{ id: 'conq', name: 'CoNQ' }, { id: 'resource-mapping', name: ' resource  MAPPING ' }]
  assert.deepEqual(resolveQePage(undefined, pages), { setting: { pageId: 'resource-mapping', matchColumn: '', qeColumn: '' }, defaulted: true }, 'the default page, its columns still to choose')
  assert.deepEqual(qeSourceOf(qePage, resolveQePage(undefined, pages).setting), { problem: 'not-set' }, 'nothing is guessed')
  assert.deepEqual(resolveQePage(setting, []), { setting, defaulted: false })
  assert.deepEqual(resolveQePage(undefined, [{ id: 'conq', name: 'CoNQ' }]), { defaulted: false })
})

test('DPF-03: possible QEs are the people on the earlier releases of the product, newest first, without the QE and the release\'s own assignee', () => {
  const rows = [row(10, 'Dose Planning', '5.2.0.0', 'Cara Lim <cara@x.com>'), row(11, 'Dose Planning', '5.1.0.0', 'Asha Rao'), row(12, 'Dose Planning', '5.0.0.0', 'Dev Shah'), row(13, 'Dose Planning', '4.9.0.0', 'Cara Lim'), row(14, 'Dose Planning', '6.0.0.0', 'Eve Ng'), row(15, 'Other', '1.0', 'Finn Ola')]
  assert.deepEqual(possibleQes(rows[0], rows, 'Asha Rao'), ['Dev Shah'], 'later releases, other products, the QE and the own assignee are left out')
  assert.deepEqual(possibleQes(row(16, 'Dose Planning', '7.0.0.0', 'Zoe'), rows, 'Asha Rao'), ['Eve Ng', 'Cara Lim', 'Dev Shah'])
})

test('DPF-04 / BLK-01: the bulk plan — title, type, QE with email, or why a release is skipped; a 100% Feature match is never created', () => {
  const board = [{ id: 1, assignedTo: 'Asha Rao <asha@x.com>', assignedToEmail: 'asha@x.com' }]
  assert.equal(emailFor('asha rao', board), 'asha@x.com'); assert.equal(emailFor('ben@x.com', board), 'ben@x.com'); assert.equal(emailFor('Nobody', board), '')
  const setup = cleanSetup({ epicId: 13946, featureDoD: 'x', qePage: setting })
  const rows = [row(1, 'Dose Planning', '5.2.1.3'), row(2, 'Dose Planning', 'R1'), row(3, 'Treatment Planning System', '2.0'), row(4, 'Nothing', '1.0'), row(5, 'Dose Planning', '6.0')]
  const hits = { 5: { item: { id: 905 }, score: 100 }, 1: { item: { id: 901 }, score: 88 } }
  const plan = bulkPlan(rows, { setup, qe: mapping, board, featureMatch: (item) => hits[item.id] })
  assert.deepEqual(plan.map((line) => [line.type ?? '', line.qe, line.email, line.skip.split(' (')[0]]), [
    ['Platform Update', 'Asha Rao', 'asha@x.com', ''],
    ['', 'Asha Rao', 'asha@x.com', ''],
    ['Major', 'Ben Ito', '', 'no email found for Ben Ito'],
    ['Major', '', '', 'no QE on the QE page for this product'],
    ['Major', 'Asha Rao', 'asha@x.com', 'Feature #905 on QMS-0025 matches it 100%'],
  ])
  assert.equal(plan[0].title, 'DP | Dose Planning | 5.2.1.3'); assert.equal(plan[0].set.featureDoD, 'x', 'DPF-07: an Epic with a setup uses its own DoD, not DP’s hidden built-in set')
  assert.match(bulkPlan([rows[0]], { setup: undefined, qe: mapping, board, featureMatch: () => undefined })[0].skip, /has no Feature setup/, 'DPF-09: no setup at all — skipped, no built-in set')
  assert.equal(plan[0].note, 'a similar Feature #901 (88%) exists', 'BLK-01: a match below 100% is named, the release is still created')
  assert.match(bulkPlan([rows[0]], { setup: cleanSetup({ epicId: 13946, featureDoD: 'x' }), board, featureMatch: () => undefined })[0].skip, /the QE page columns are not set \(Feature setup of the bulk Epic\)/)
  assert.match(bulkPlan([rows[0]], { setup, qe: { problem: 'missing' }, board, featureMatch: () => undefined })[0].skip, /the QE page is not there or not loaded/)
})

test('DPF-06: the QE picked in the pop-up replaces the QE page\'s and lets a release without one be created; other reasons still skip it (TC-DPF-05)', () => {
  const board = [{ id: 1, assignedTo: 'Asha Rao <asha@x.com>', assignedToEmail: 'asha@x.com' }, { id: 2, assignedTo: 'Cara Lim <cara@x.com>', assignedToEmail: 'cara@x.com' }]
  const people = [{ name: 'Asha Rao', email: 'asha@x.com' }, { name: 'Cara Lim', email: 'cara@x.com' }]
  const setup = cleanSetup({ epicId: 13946, featureDoD: 'x', qePage: setting })
  const rows = [row(1, 'Dose Planning', '5.2.1.3'), row(2, 'Dose Planning', 'R1'), row(4, 'Nothing', '1.0')]
  const plan = bulkPlan(rows, { setup, qe: mapping, board, featureMatch: () => undefined })
  const picked = pickQe(plan, { 1: 'cara@x.com', 2: 'cara@x.com', 4: 'CARA@x.com' }, (line) => String(line.row.id), people)
  assert.deepEqual(picked.map((line) => [line.qe, line.email, line.skip.split(' (')[0], line.picked]), [
    ['Cara Lim', 'cara@x.com', '', true],
    ['Cara Lim', 'cara@x.com', '', true],
    ['Cara Lim', 'cara@x.com', '', true],
  ], 'a release without a QE in the mapping is created for the person picked')
  assert.deepEqual(pickQe(plan, { 1: 'asha@x.com' }, (line) => String(line.row.id), people).map((line) => line.picked), [false, false, false], 'picking the mapped QE changes nothing')
})
