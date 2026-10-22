import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseStreams } from '../src/releaseOverview.ts'

const doc = (id, areaPath, approvalDate) => ({ key: `o/p/${id}`, id, title: `Doc ${id}`, workItemType: 'Document', state: 'Approved', assignedTo: '', areaPath, iterationPath: '', tags: '', url: '', organization: 'o', project: 'p', syncedAt: '', approvalDate })
const source = (connectionId, items) => ({ connectionId, name: connectionId, role: 'release-source', organization: 'o', project: 'p', query: 'q', fetchedAt: '2026-10-20T00:00:00Z', items })

test('Overview releases: per stream, releases with documents approved in the month (viewer time zone), with counts', () => {
  const state = { azureSources: [
    source('dp', [doc(1, 'DHFI\\Dose Planning\\Release 4.2', '2026-10-05T10:00:00Z'), doc(2, 'DHFI\\Dose Planning\\Release 4.2', '2026-10-06T10:00:00Z'), doc(3, 'DHFI\\Dose Planning\\Release 4.1', '2026-09-10T10:00:00Z')]),
    source('cp', [doc(4, 'DHFI\\Care Pathways\\Release 3.1', '2026-09-30T20:00:00Z')]),
    { ...source('ref', [doc(5, 'DHFI\\Team', '2026-10-01T00:00:00Z')]), role: 'reference' },
  ] }
  const profiles = [{ id: 'dp', reason: 'DP', viewName: 'Digital Platform', role: 'release-source' }, { id: 'cp', reason: 'CP', role: 'release-source' }, { id: 'ref', reason: 'Ref', role: 'reference' }, { id: 'tw', reason: 'QMS', role: 'time-tracking' }, { id: 'iocc', reason: 'IOCC', role: 'release-source' }]
  const utc = releaseStreams(state, profiles, '2026-10', 'UTC')
  assert.deepEqual(utc.map((stream) => [stream.name, stream.releases.map((entry) => `${entry.name} ${entry.release}×${entry.documents}`), stream.documents]), [['CP', [], 0], ['Digital Platform', ['Dose Planning 4.2×2'], 2]], 'views without releases in their paths and not-fetched views are left out')
  assert.deepEqual(utc.find((stream) => stream.name === 'Digital Platform').titles.map((doc) => [doc.title, doc.release]), [['Doc 1', 'Dose Planning 4.2'], ['Doc 2', 'Dose Planning 4.2']], 'the documents by their query Title, oldest first')
  const india = releaseStreams(state, profiles, '2026-10', 'Asia/Kolkata')
  assert.deepEqual(india.find((stream) => stream.name === 'CP').releases.map((entry) => entry.release), ['3.1'], 'late 30 Sep UTC is October in India')
})

test('Pulse Check releases: only the given (Release Details) views, each shown even when not fetched or without releases', () => {
  const state = { azureSources: [source('dp', [doc(1, 'DHFI\\Dose Planning\\Release 4.2', '2026-10-05T10:00:00Z')]), source('ped', [doc(2, 'DHFI\\Pedestal\\Release 1.0', '2026-10-05T10:00:00Z')]), source('ref', [doc(3, 'DHFI\\Team', '2026-10-01T00:00:00Z')])] }
  const profiles = [{ id: 'dp', reason: 'DP', role: 'release-source' }, { id: 'ped', reason: 'Releases (Pedestal)', role: 'release-source' }, { id: 'ref', reason: 'Ref', role: 'reference' }, { id: 'iocc', reason: 'IOCC', role: 'reference' }]
  const shown = releaseStreams(state, profiles, '2026-10', 'UTC', ['dp', 'ref', 'iocc'])
  assert.deepEqual(shown.map((stream) => [stream.name, stream.releases.length, stream.fetchedAt]), [['DP', 1, '2026-10-20T00:00:00Z'], ['IOCC', 0, ''], ['Ref', 0, '2026-10-20T00:00:00Z']], 'Pedestal (not under Release Details) is left out')
})
