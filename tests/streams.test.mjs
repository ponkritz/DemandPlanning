import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultStreams, profileForStream, streamOfProfile, exportForStream, sameStream } from '../src/streams.ts'
import { dpRelease, ioccRelease, releaseFor } from '../src/releasePath.ts'
import { matchScore, releaseRegister, normalizeReleaseSourceSettings, releaseFeatureTitle } from '../src/releaseSource.ts'
import { defaultStreamReleases } from '../src/releaseOverview.ts'

const doc = (id, areaPath, iterationPath, title = `Doc ${id}`, approvalDate = '2026-10-05T10:00:00Z') => ({ key: `o/p/${id}`, id, title, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath, iterationPath, tags: '', url: '', organization: 'o', project: 'p', syncedAt: '', approvalDate })
const feature = (id, title) => ({ key: `o/q/${id}`, id, title, workItemType: 'Feature', state: 'Active', assignedTo: '', areaPath: 'Q', iterationPath: 'Q', tags: '', url: '', organization: 'o', project: 'q', syncedAt: '' })

test('default streams in order; connections and exports found by name', () => {
  assert.deepEqual(defaultStreams.map((stream) => `${stream.name}:${stream.source}`), ['DP:azure', 'CP:azure', 'IOCC:azure', 'Content:azure', 'Tool Validations:azure', 'S&S IT:windchill'])
  const profiles = [{ id: 'tw', reason: 'QMS-0025', role: 'time-tracking' }, { id: 'a', reason: 'Dose planning (DP)', viewName: 'DP', role: 'reference' }, { id: 'b', reason: 'tool validations', role: 'release-source' }]
  assert.equal(profileForStream(defaultStreams[0], profiles).id, 'a')
  assert.equal(profileForStream(defaultStreams[4], profiles).id, 'b', 'name match ignores case and spaces')
  assert.equal(profileForStream(defaultStreams[1], profiles), undefined)
  assert.equal(streamOfProfile(profiles[0]), undefined, 'the Time Writing connection is never a stream')
  assert.equal(exportForStream(defaultStreams[5], [{ name: 'S & S IT', exportFile: 'x.csv' }]).name, 'S & S IT')
  assert.ok(sameStream('S&S IT', 'ss it'))
  assert.equal(profileForStream(defaultStreams[2], [{ id: 'i', reason: 'IOCC_Completed', viewName: 'IOCC [Completed Releases]', role: 'release-source' }]).id, 'i', 'a name starting with the stream as whole words')
  assert.equal(profileForStream(defaultStreams[1], [{ id: 'c', reason: 'CPx', viewName: 'CPx view', role: 'release-source' }]), undefined, 'not a different word')
})

test('DP: name from the Area Path, number from the Iteration Path; IOCC: group after IOCC, name from the Title', () => {
  assert.deepEqual(dpRelease(doc(1, 'DHP\\DoseNav', 'DHP\\2.1.0\\Sprint 3')), { name: 'DoseNav', release: '2.1.0' })
  assert.deepEqual(dpRelease(doc(1, 'DHP\\DoseNav', 'DHP\\Release 2.1\\Sprint 3')), { name: 'DoseNav', release: '2.1' })
  assert.deepEqual(ioccRelease(doc(2, 'DHP\\IOCC\\Mobile\\Docs', '', 'IOCC Mobile Release 2.3.1 - Notes')), { group: 'Mobile', name: 'IOCC Mobile - Notes', release: '2.3.1' })
  assert.deepEqual(ioccRelease(doc(2, 'DHP\\IOCC\\Core', '', 'Patient Monitor v1.4')), { group: 'Core', name: 'Patient Monitor', release: '1.4' })
  assert.deepEqual(ioccRelease(doc(2, 'DHP\\IOCC\\Core', '', 'Patient Monitor Spring')), { group: 'Core', name: 'Patient Monitor Spring', release: '' })
  assert.equal(ioccRelease(doc(2, 'DHP\\Other', '', 'x 1.0')), undefined, 'outside IOCC')
  assert.deepEqual(releaseFor(doc(3, 'DHP\\Care\\Release 3.1', ''), 'path'), { name: 'Care', release: '3.1' })
  assert.equal(releaseFeatureTitle('IOCC', 'Core Patient Monitor', ''), 'IOCC | Core Patient Monitor')
})

test('fuzzy Feature match: a percentage; the best Feature counts at the threshold', () => {
  assert.equal(matchScore('DP | DoseNav | v2.1.0', 'DoseNav', '2.1.0'), 100)
  assert.equal(matchScore('DP | Dose Nav | v2.1', 'DoseNav', '2.1.0'), 100, 'spacing and trailing zeros do not matter')
  assert.ok(matchScore('DP | DoseNav | v2.0', 'DoseNav', '2.1.0') < 80, 'another version stays below the threshold')
  assert.equal(matchScore('CP | Care Pathways | v3.1', 'DoseNav', '2.1.0'), 0)
  assert.ok(matchScore('Project_Name_3.0.0', 'RSGAMS', '3.0.0.2') < 10, 'a shared version alone is no match')
  assert.ok(matchScore('DP | RSGAMS | v3.0.0.2', 'RSGAMS', '3.0.0.2') === 100)
  assert.ok(matchScore('Project_Name_3.0.0', 'Project', '3.0.0.2') < 50, 'common words such as Project or Release do not make a match')
  assert.ok(matchScore('Project_Name_3.0.0', '3.0', '3.0.0.2') < 50, 'numbers in the name do not make a match')
  const backlog = [feature(10, 'DP | Dose Nav | v2.1'), feature(11, 'DP | DoseNav | v2.0')]
  const [entry] = releaseRegister([doc(1, 'DHP\\DoseNav', 'DHP\\2.1.0\\Sprint 3')], backlog, { rule: 'dp', fuzzy: true, threshold: 80 })
  assert.deepEqual([entry.match.feature.id, entry.match.score, entry.tracked, entry.features.map((item) => item.id)], [10, 100, true, [10]])
  const [low] = releaseRegister([doc(1, 'DHP\\DoseNav', 'DHP\\3.0\\Sprint 3')], backlog, { rule: 'dp', fuzzy: true, threshold: 80 })
  assert.equal(low.tracked, false); assert.ok(low.match.score < 80)
  assert.deepEqual(normalizeReleaseSourceSettings({ matchThreshold: 70 }), { matchThreshold: 70 })
  assert.deepEqual(normalizeReleaseSourceSettings({ matchThreshold: 0 }), {})
})

test('Pulse Check streams: the five Azure streams in order, not-set-up ones listed, each read with its rule', () => {
  const source = (connectionId, items) => ({ connectionId, name: connectionId, role: 'reference', organization: 'o', project: 'p', query: 'q', fetchedAt: '2026-10-20T00:00:00Z', items })
  const state = { azureSources: [source('dp', [doc(1, 'DHP\\DoseNav', 'DHP\\2.1.0\\S1')]), source('io', [doc(2, 'DHP\\IOCC\\Core', '', 'Patient Monitor v1.4')])] }
  const profiles = [{ id: 'dp', reason: 'DP', role: 'reference' }, { id: 'io', reason: 'IOCC', role: 'reference' }, { id: 'ped', reason: 'Releases (Pedestal)', role: 'release-source' }]
  const streams = defaultStreamReleases(state, profiles, '2026-10', 'UTC')
  assert.deepEqual(streams.map((stream) => [stream.name, Boolean(stream.notSetUp), stream.releases.map((entry) => `${entry.type ? `[${entry.type}] ` : ''}${entry.name} ${entry.release}`)]), [['DP', false, ['DoseNav 2.1.0']], ['CP', true, []], ['IOCC', false, ['[Core] Patient Monitor 1.4']], ['Content', true, []], ['Tool Validations', true, []]])
})
