import test from 'node:test'
import assert from 'node:assert/strict'
import { copyEpicFields, epicFieldsFor, featureFromFields, listUsedBy, offList, parseEpicSetup, serializeEpicSetup, withEpicFields } from '../src/epicSetup.ts'

const file = {
  schema: 1, kind: 'epic-setup',
  lists: [{ id: 'platform', name: 'Platform', values: ['Platform 1.0', 'Platform 2.0', 'Platform 1.0', ' '] }, { name: 'No id' }, { id: 'BAD ID', name: 'x' }],
  epics: [
    { epicId: 22, epicTitle: 'CP', titlePattern: '{platform} | {release} | {feature}', fields: [
      { label: 'Platform', type: 'list', list: 'platform', ifEmpty: 'block', into: 'title', source: 'Custom.Platform' },
      { label: 'Release', type: 'text', ifEmpty: 'warn', into: 'both' },
      { label: 'Program', type: 'list', list: 'missing', ifEmpty: 'nonsense', into: 'nowhere' },
      { label: 'platform', type: 'text' }, { label: 'Feature' }, { label: '' },
    ] },
    { epicId: 'x' }, { epicId: 23, fields: [] },
  ],
}

test('Epic setup file: lists and fields cleaned, round trip stable (EPS-01, TC-EPS-02)', () => {
  const parsed = parseEpicSetup(JSON.stringify(file))
  assert.deepEqual(parsed.lists, [{ id: 'platform', name: 'Platform', values: ['Platform 1.0', 'Platform 2.0'] }, { id: 'no-id', name: 'No id', values: [] }])
  const cp = parsed.epics.find((entry) => entry.epicId === 22)
  assert.deepEqual(cp.fields.map((field) => [field.label, field.type, field.list, field.ifEmpty, field.into]), [
    ['Platform', 'list', 'platform', 'block', 'title'], ['Release', 'text', undefined, 'warn', 'both'], ['Program', 'text', undefined, 'optional', 'description'],
  ], 'unknown list → text, unknown options → defaults, duplicate / reserved / empty labels dropped')
  assert.deepEqual(parsed.epics.map((entry) => entry.epicId), [22, 23])
  assert.equal(epicFieldsFor(parsed, 23), undefined, 'an Epic without fields has no Epic setup')
  assert.equal(serializeEpicSetup(parseEpicSetup(serializeEpicSetup(parsed))), serializeEpicSetup(parsed))
  assert.throws(() => parseEpicSetup('{"schema":1,"kind":"feature-setup"}'), /not an Epic setup file/)
  assert.deepEqual(listUsedBy(parsed, 'platform'), [22])
})

test('Epic setup on a new Feature: Title by the pattern or the Title fields, Description lines, Block and Warn, list values (EPS-02, TC-EPS-02)', () => {
  const parsed = parseEpicSetup(JSON.stringify(file))
  const cp = epicFieldsFor(parsed, 22)
  const full = featureFromFields(cp, ['Platform 2.0', 'R5', 'P1'], 'Upgrade')
  assert.deepEqual(full, { title: 'Platform 2.0 | R5 | Upgrade', lines: ['Release : R5', 'Program : P1'], blocked: [], warned: [] })
  const empty = featureFromFields(cp, ['', '', ''], '')
  assert.deepEqual([empty.title, empty.blocked, empty.warned], ['', ['Platform'], ['Release']], 'empty parts of the pattern are dropped with their separators')
  assert.deepEqual(empty.lines, ['Release :', 'Program :'])
  const noPattern = featureFromFields({ ...cp, titlePattern: undefined }, ['Platform 1.0', 'R6', ''], 'typed')
  assert.equal(noPattern.title, 'Platform 1.0 | R6', 'the Title fields joined')
  assert.equal(featureFromFields({ epicId: 1, epicTitle: '', fields: [{ label: 'Program', type: 'text', ifEmpty: 'optional', into: 'description' }] }, ['P'], 'typed').title, 'typed', 'Description-only fields keep the typed title')
  assert.deepEqual(offList(cp, ['Platform 3.0', '', ''], parsed), ['Platform'])
})

test('Epic setup in bulk creation: Block skips, Warn creates and lists, values from the on-prem item, pattern title (EPS-03, TC-EPS-03)', () => {
  const cp = epicFieldsFor(parseEpicSetup(JSON.stringify(file)), 22)
  const plan = [{ title: 'CP 5.0', row: { fields: { 'Custom.Platform': 'Platform 1.0' } } }, { title: 'CP 6.0', row: { fields: {} } }, { title: 'CP 7.0', skip: 'already a Feature', row: { fields: { 'Custom.Platform': 'Platform 2.0' } } }]
  const lines = withEpicFields(plan, cp, (line) => [line.row])
  assert.equal(lines[0].title, 'Platform 1.0 | CP 5.0')
  assert.equal(lines[0].skip, undefined)
  assert.deepEqual(lines[0].warned, ['Release'])
  assert.deepEqual(lines[0].fieldLines, ['Release :', 'Program :'])
  assert.match(lines[1].skip, /empty Platform \(Epic setup of #22\)/)
  assert.equal(lines[2].skip, 'already a Feature', 'an earlier reason is kept')
  assert.deepEqual(withEpicFields(plan, undefined, (line) => [line.row]).map((line) => [line.title, line.fieldLines.length]), [['CP 5.0', 0], ['CP 6.0', 0], ['CP 7.0', 0]], 'no Epic setup: unchanged')
  assert.equal(withEpicFields(plan, { ...cp, titlePattern: undefined }, (line) => [line.row])[0].title, 'CP 5.0', 'without a pattern the stream title is kept')
})

test('Copy to Epics: the fields and pattern to the chosen Epics, replacing theirs (EPS-05, TC-EPS-03)', () => {
  const parsed = parseEpicSetup(JSON.stringify(file))
  const copied = copyEpicFields(parsed, 22, [{ id: 23, title: 'ECP 2' }, { id: 24, title: 'ECP 3' }, { id: 22, title: 'self' }])
  assert.deepEqual(copied.epics.map((entry) => [entry.epicId, entry.epicTitle, entry.fields.length, entry.titlePattern]).sort((a, b) => a[0] - b[0]), [[22, 'CP', 3, '{platform} | {release} | {feature}'], [23, 'ECP 2', 3, '{platform} | {release} | {feature}'], [24, 'ECP 3', 3, '{platform} | {release} | {feature}']])
  copied.epics.find((entry) => entry.epicId === 23).fields[0].label = 'Changed'
  assert.equal(copied.epics.find((entry) => entry.epicId === 22).fields[0].label, 'Platform', 'copies are independent')
  assert.equal(copyEpicFields(parsed, 99, [{ id: 23, title: '' }]), parsed, 'nothing to copy from')
})

