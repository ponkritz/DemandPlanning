import test from 'node:test'
import assert from 'node:assert/strict'
import { viewSource } from '../src/viewSources.ts'

const snap = (query, n) => ({ organization: 'o', project: 'p', query, fetchedAt: '2026-10-20T00:00:00Z', items: Array.from({ length: n }, (_, i) => ({ id: i })) })

test('each view shows its own fetch; the old shared release snapshot only for the query it was fetched with', () => {
  const state = { azureSources: [{ connectionId: 'dp', role: 'release-source', ...snap('DP query', 3) }, { connectionId: 'cp', role: 'release-source', ...snap('CP query', 5) }] }
  assert.equal(viewSource(state, 'dp', 'release-source', 'DP query', 3).items.length, 3)
  assert.equal(viewSource(state, 'cp', 'release-source', 'CP query', 3).items.length, 5)
  assert.equal(viewSource(state, 'iocc', 'release-source', 'IOCC query', 3), undefined, 'not fetched yet: nothing, not another view’s data')
  const legacy = { releaseSource: snap('IOCC query', 7) }
  assert.equal(viewSource(legacy, 'iocc', 'release-source', 'IOCC query', 3).items.length, 7)
  assert.equal(viewSource(legacy, 'dp', 'release-source', 'DP query', 3), undefined, 'the shared snapshot is not shown for a view with another query')
  assert.equal(viewSource(legacy, 'only', 'release-source', 'Other', 1).items.length, 7, 'a single release source keeps its old snapshot')
  assert.equal(viewSource(legacy, 'x', 'backlog-view', 'IOCC query', 3), undefined)
})
