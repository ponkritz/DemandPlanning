import test from 'node:test'
import assert from 'node:assert/strict'
import { boardMatchText, dpBoardCandidates, dpBoardMatch, dpFeatureTitle, dpServiceOf, dpTitleScore, dpVersionOf } from '../src/dpBoardMatch.ts'

const row = (id, title, fields = {}) => ({ key: `dp/${id}`, id, title, workItemType: 'Release', state: 'Active', fields })
const board = (id, workItemType, title, state = 'Active') => ({ key: `b/${id}`, id, title, workItemType, state, url: `https://x/${id}` })
const items = [
  board(10, 'Feature', 'DP | RSGMS Viewer | v3.0.0.2'),
  board(11, 'User Story', 'RSGMS Viewer 3.0.0.2 verification'),
  board(15, 'Feature', 'DP | RSGMS Viewer | v3.1'),
  board(16, 'User Story', 'RSGMS Viewer verification'),
  board(12, 'User Story', 'Time Writing RSGMS Viewer'),
  board(13, 'Feature', 'Dose Planning Lite'),
  board(14, 'Feature', 'RSGMS Viewer old', 'Removed'),
  board(20, 'Feature', 'IntelliSpace | Portal Core'),
]
const candidates = dpBoardCandidates(items)

test('DP row → QMS-0025: SourceProgram + Title, or Title alone when the board title has no SourceProgram', () => {
  const match = dpBoardMatch(row(1, 'RSGMS Viewer 3.0.0.2', { 'Custom.SourceProgram': 'DHP' }), candidates)
  assert.equal(match.feature.item.id, 10); assert.ok(match.feature.score >= 80)
  assert.equal(match.story.item.id, 11, 'the Time Writing story and the removed Feature are not candidates')
  assert.equal(dpBoardMatch(row(2, 'Portal Core', { SourceProgram: 'IntelliSpace' }), candidates).feature.item.id, 20, 'with the SourceProgram in the board title')
  assert.match(boardMatchText(match), /^Feature 10 \(\d+%\); User Story 11 \(\d+%\)$/)
})

test('name and version must both match: another version or none on the board stays below 80%', () => {
  const v31 = dpBoardMatch(row(6, 'RSGMS Viewer 3.1'), candidates)
  assert.equal(v31.feature.item.id, 15, '3.1 finds the v3.1 Feature, not v3.0.0.2'); assert.equal(v31.story, undefined, 'the stories name no 3.1')
  const v4 = dpBoardMatch(row(7, 'RSGMS Viewer 4.0'), candidates)
  assert.equal(v4.feature, undefined); assert.equal(v4.story, undefined); assert.ok(v4.closest.score < 80)
  assert.equal(dpTitleScore('RSGMS Viewer verification', 'RSGMS Viewer 3.0.0.2'), 60, 'name only: 60%')
  assert.equal(dpVersionOf({ title: 'RSGMS Viewer v3.0.0.2', fields: {} }), '3.0.0.2')
  assert.equal(dpVersionOf({ title: 'RSGMS Viewer', fields: { 'Custom.Release': '2.1' } }), '2.1', 'else the Release field')
  assert.equal(dpBoardMatch(row(8, 'RSGMS Viewer', { Release: '3.0.0.2' }), candidates).feature.item.id, 10)
})

test('no match at 80%: the closest item is kept as a hint; nothing in common is no match', () => {
  const near = dpBoardMatch(row(3, 'Dose Planning Pro'), candidates)
  assert.equal(near.feature, undefined); assert.equal(near.closest.item.id, 13); assert.ok(near.closest.score < 80)
  assert.match(boardMatchText(near), /^No match \(closest Feature 13, \d+%\)$/)
  assert.deepEqual(dpBoardMatch(row(4, 'Cardio Suite'), candidates), {})
  assert.equal(boardMatchText({}), 'No match')
})

test('a new Feature title maps back when it holds the Title; the service part drops the version', () => {
  assert.equal(dpServiceOf(row(5, 'RSGMS Viewer v3.0.0.2')), 'RSGMS Viewer')
  assert.ok(dpTitleScore('DHP | RSGMS Viewer | v3.0.0.2', 'RSGMS Viewer 3.0.0.2', 'DHP') >= 80)
  assert.ok(dpTitleScore('DHP | Something else', 'RSGMS Viewer 3.0.0.2', 'DHP') < 80)
})

test('Create Feature from a DP row: Program (SourceProgram, else DP) | PsName | vRelease, falling back to the Title', () => {
  assert.equal(dpFeatureTitle(row(9, 'RSGMS Viewer 3.0.0.2', { 'Custom.SourceProgram': 'DHP', 'Custom.PsName': 'RSGMS', 'Custom.Release': '3.0.0.2' })), 'DHP | RSGMS | v3.0.0.2')
  assert.equal(dpFeatureTitle(row(10, 'Cardio Suite 2.1')), 'DP | Cardio Suite | v2.1', 'no SourceProgram, PsName or Release: DP and the Title')
})

test('a Title unlike the PsName: the search combines PsName and Release, so the Feature Create Feature made is found', () => {
  const release = row(30, 'RSGMS 3.0.0.2', { 'Custom.SourceProgram': 'ART-RSG', 'Custom.PsName': 'Remote Service GMS', 'Custom.Release': '3.0.0.2' })
  const made = dpBoardCandidates([board(40, 'Feature', dpFeatureTitle(release)), board(41, 'Feature', 'ART-RSG | Remote Service GMS | v3.1')])
  assert.deepEqual([dpBoardMatch(release, made).feature.item.id, dpBoardMatch(release, made).feature.score], [40, 100], 'the created title is a 100% match')
  const typed = dpBoardCandidates([board(42, 'Feature', 'Remote Service GMS v3.0.0.2'), board(43, 'Feature', 'Remote Service GMS v3.1')])
  assert.equal(dpBoardMatch(release, typed).feature.item.id, 42, 'PsName + Release without the program, not the other version')
  const otherRelease = row(31, 'Portal 2.0', { 'Custom.PsName': 'Portal Core', 'Custom.Release': '2.5' })
  assert.equal(dpBoardMatch(otherRelease, dpBoardCandidates([board(44, 'Feature', 'Portal Core | v2.5')])).feature.item.id, 44, 'the Release field’s version is tried, not only the Title’s')
})

test('Windchill release (S&S IT) → QMS-0025: the same search with the release name and number; Create Feature title (TC-QV-23)', async () => {
  const { windchillBoardMatch, windchillFeatureTitle } = await import('../src/dpBoardMatch.ts')
  const release = { name: 'Remote Diagnostics', release: '1.6', parts: [{ name: 'Remote Diagnostics', release: '1.6' }] }
  assert.equal(windchillFeatureTitle('S&S IT', release), 'S&S IT | Remote Diagnostics | v1.6')
  const ss = dpBoardCandidates([board(50, 'Feature', 'Remote Diagnostics v1.6'), board(51, 'Feature', 'S&S IT | Remote Diagnostics | v1.7'), board(52, 'User Story', 'Remote Diagnostics 1.6 validation')])
  const match = windchillBoardMatch(release, 'S&S IT', ss)
  assert.deepEqual([match.feature.item.id, match.story.item.id], [50, 52], 'name and number match without the stream; v1.7 is another release')
  const made = dpBoardCandidates([board(53, 'Feature', windchillFeatureTitle('S&S IT', release))])
  assert.equal(windchillBoardMatch(release, 'S&S IT', made).feature.score, 100, 'the title Create Feature gives is found')
  const clubbed = { name: 'CareLink R3.2_Remote Diagnostics 1.6', release: '3.2 + 1.6', parts: [{ name: 'CareLink', release: '3.2' }, { name: 'Remote Diagnostics', release: '1.6' }] }
  assert.equal(windchillBoardMatch(clubbed, 'S&S IT', ss).feature.item.id, 50, 'a clubbed release matches a Feature of one of its parts')
  assert.equal(windchillFeatureTitle('S&S IT', clubbed), 'S&S IT | CareLink R3.2_Remote Diagnostics 1.6', 'a clubbed release keeps its name, which holds the numbers')
  const none = windchillBoardMatch({ name: 'Unknown Tool', release: '9.9' }, 'S&S IT', ss)
  assert.deepEqual([none.feature, none.story], [undefined, undefined])
  assert.match(boardMatchText(none), /^No match/)
})
