import test from 'node:test'
import assert from 'node:assert/strict'
import { compilePattern, defaultNamingPatterns, matchPatterns, normalizeNamingPatterns, patternsFor } from '../src/namingPatterns.ts'
import { normalizeReleaseSourceSettings, releaseRegister, streamPatterns } from '../src/releaseSource.ts'
import { ioccMonthCounts } from '../src/ioccMilestones.ts'

test('QV-55: wildcard patterns — * any text, {…} the release name; Content up to _RELEASE, IOCC after Conformance Verification / Test Tools', () => {
  const content = defaultNamingPatterns.Content, iocc = defaultNamingPatterns.IOCC
  assert.deepEqual(matchPatterns('ABC_Labeling_RELEASE_IFU_v2', content), { group: '', name: 'ABC_Labeling_RELEASE', document: 'IFU_v2' }, 'the rest of the Title is the document')
  assert.equal(matchPatterns('abc_labeling_release', content).name, 'abc_labeling_release', 'case ignored; nothing after it')
  assert.equal(matchPatterns('Plain title', content), undefined, 'no pattern fits: the stream rule')
  assert.deepEqual(matchPatterns('Report - Conformance  Verification Spectral CT 2.1', iocc), { group: 'Conformance Verification', name: 'Spectral CT 2.1', document: 'Report - Conformance  Verification'.replace(/\s+/g, ' ') }, 'spaces match any spaces')
  assert.deepEqual(matchPatterns('Test Tools DoseSim', iocc), { group: 'Test Tools', name: 'DoseSim', document: 'Test Tools' })
  assert.equal(matchPatterns('Conformance Verification -', iocc), undefined, 'a name without letters or digits does not count')
  for (const bad of ['', '{*', '*x*', '{a}{b}', '{ }', 'x'.repeat(201)]) assert.ok('error' in compilePattern(bad), bad)
  assert.ok('regex' in compilePattern('*Release (v{*})'), 'brackets and dots are text')
  assert.equal(matchPatterns('Atlas Release (v2.1)', [{ label: '', pattern: '*Release (v{*})' }]).name, '2.1')
})

test('QV-55: patterns are shared settings — checked on read, per stream, built in when not saved; same list for the same settings', () => {
  const saved = normalizeNamingPatterns({ Content: [{ label: 'x', pattern: '{*}_DOC*' }, { pattern: '{broken' }], IOCC: [], ' ': [{ pattern: '{*}' }] })
  assert.deepEqual(saved, { Content: [{ label: 'x', pattern: '{*}_DOC*' }], IOCC: [] }, 'invalid ones dropped; an empty list turns a stream off')
  assert.equal(patternsFor(saved, 'IOCC').length, 0); assert.equal(patternsFor(undefined, 'IOCC'), defaultNamingPatterns.IOCC); assert.deepEqual(patternsFor(undefined, 'DP'), [])
  const settings = normalizeReleaseSourceSettings({ matchThreshold: 70, namingPatterns: { Content: [{ label: '', pattern: '{*}_DOC*' }] } })
  assert.deepEqual(settings.namingPatterns, { Content: [{ label: '', pattern: '{*}_DOC*' }] })
  assert.equal(streamPatterns(settings, 'Content'), streamPatterns(settings, 'Content'), 'cached per settings object')
  assert.equal(streamPatterns(undefined, 'Content'), defaultNamingPatterns.Content)
})

const doc = (id, title, extra = {}) => ({ key: `vault/${id}`, id, title, workItemType: 'Document', state: 'Approved', areaPath: 'Vault\\IOCC\\Platform', iterationPath: 'Vault', approvalDate: '2026-10-10T00:00:00Z', ...extra })

test('QV-55: Content documents are grouped under their release; IOCC by Conformance Verification and Test Tools names, others as before', () => {
  const content = releaseRegister([doc(1, 'ABC_Labeling_RELEASE_IFU_v2'), doc(2, 'ABC_Labeling_RELEASE_Leaflet'), doc(3, 'Stand-alone note')], [], { rule: 'title', patterns: defaultNamingPatterns.Content })
  assert.deepEqual(content.map((entry) => [entry.name, entry.documents]), [['ABC_Labeling_RELEASE', 2], ['Stand-alone note', 1]], 'two documents, one release; a Title without _RELEASE stays its own')
  const iocc = releaseRegister([doc(4, 'Conformance Verification Spectral CT 2.1'), doc(5, 'Report Conformance Verification Spectral CT 2.1'), doc(6, 'Test Tools DoseSim'), doc(7, 'Release Notes Console 2.3')], [], { rule: 'iocc', patterns: defaultNamingPatterns.IOCC })
  assert.deepEqual(iocc.map((entry) => [entry.group, entry.name, entry.release, entry.documents]).sort((a, b) => a[0].localeCompare(b[0])), [['Conformance Verification', 'Spectral CT 2.1', '', 2], ['Platform', 'Console', '2.3', 1], ['Test Tools', 'DoseSim', '', 1]])
  const counts = ioccMonthCounts([doc(8, 'Release Notes - Conformance Verification Spectral CT 2.1'), doc(9, 'Verification Report - Conformance Verification Spectral CT 2.1')], '2026-10', 'UTC', defaultNamingPatterns.IOCC)
  assert.deepEqual(counts.supported.map((entry) => [entry.group, entry.name, entry.documents.length]), [['Conformance Verification', 'Spectral CT 2.1', 2]], 'Pulse Check counts the release once')
})
