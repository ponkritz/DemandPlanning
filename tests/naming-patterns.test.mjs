import test from 'node:test'
import assert from 'node:assert/strict'
import { compilePattern, defaultNamingPatterns, matchCompiled, matchPatterns, maxStars, normalizeNamingPatterns, patternsFor } from '../src/namingPatterns.ts'
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
  assert.ok('compiled' in compilePattern('*Release (v{*})'), 'brackets and dots are text')
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

// The former construction (one regex per pattern), kept here only to show the matcher gives the same results.
const escapeOld = (text) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
const literalOld = (text, lazy) => text.split('*').map((part) => escapeOld(part).replace(/\s+/g, '\\s+')).join(lazy ? '.*?' : '.*')
const regexOld = (pattern) => { const text = pattern.trim(), open = text.indexOf('{'), close = text.indexOf('}'); return new RegExp(`^\\s*${literalOld(text.slice(0, open), true)}(${literalOld(text.slice(open + 1, close), true)})${literalOld(text.slice(close + 1), false)}\\s*$`, 'i') }

test('AR-007: patterns match in linear time — 200 * on a 200-character Title under 50 ms; the same results as the former regex; at most 20 * (TC-CON-102)', () => {
  // Pathological: 200 stars against a Title of 200 characters that does not fit (the regex took seconds from 30 characters).
  const stars = { prefix: ['', ...Array(99).fill('a')], inside: ['', ...Array(49).fill('a')], suffix: [...Array(51).fill('a'), 'Z'] }
  const title = 'a'.repeat(200)
  const started = performance.now()
  assert.equal(matchCompiled(stars, title), undefined)
  assert.ok(performance.now() - started < 50, `took ${performance.now() - started} ms`)
  const twenty = `${'*a'.repeat(9)}{*a*}${'*a'.repeat(8)}*z`
  assert.ok('compiled' in compilePattern(twenty) && twenty.split('*').length - 1 === maxStars)
  const at = performance.now()
  assert.equal(matchPatterns('a '.repeat(100), [{ label: '', pattern: twenty }]), undefined)
  assert.ok(performance.now() - at < 50, 'the longest allowed pattern on a long Title')
  // Capped on save (the editor shows the error) and on read of the shared and personal files.
  assert.match(compilePattern(`{*}${'*'.repeat(maxStars)}`).error, /at most 20 \*/)
  assert.deepEqual(normalizeNamingPatterns({ Content: [{ label: '', pattern: `{*}${'*x'.repeat(maxStars)}` }, { label: '', pattern: '{*_RELEASE}*' }] }), { Content: [{ label: '', pattern: '{*_RELEASE}*' }] }, 'a pattern with too many * is dropped on read')
  // Normal patterns: the release name as before, also for spaces, case, brackets and several *.
  const patterns = ['{*_RELEASE}*', '*Conformance Verification {*}', '*Test Tools {*}', '*Release (v{*})', '{*} - *', '*{v*.*}*', 'A*{* *}*b', '{*} *', '*_{*}_*']
  const titles = ['ABC_Labeling_RELEASE_IFU_v2', 'Report - Conformance  Verification Spectral CT 2.1', 'test tools DoseSim', 'Atlas Release (v2.1)', 'Plan - Draft - 3', 'Notes v1.2 and v3.4 x', 'A x y z B', 'one two three', 'a_b_c_d', 'Plain title', '']
  let seed = 11
  const random = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
  const pick = (length, set) => Array.from({ length }, () => set[random(set.length)]).join('')
  for (let index = 0; index < 3000; index++) patterns.push(`${pick(random(5), 'aAb *_')}{${pick(1 + random(3), 'aAb *_')}}${pick(random(5), 'aAb *_')}`)
  for (let index = 0; index < 60; index++) titles.push(pick(random(12), 'aAbB _c'))
  let compared = 0
  for (const pattern of patterns) {
    const compiled = compilePattern(pattern)
    if ('error' in compiled) continue
    for (const raw of titles) {
      const text = raw.replace(/\s+/g, ' ').trim()
      const found = matchCompiled(compiled.compiled, text), old = regexOld(pattern).exec(text)
      assert.equal(found ? text.slice(found.start, found.end) : undefined, old?.[1], `${pattern} on "${text}"`)
      compared++
    }
  }
  assert.ok(compared > 10000)
})
