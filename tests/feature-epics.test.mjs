import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFeatureEpics, normalizeReleaseSourceSettings, streamEpics } from '../src/releaseSource.ts'
import { dpBoardCandidates } from '../src/dpBoardMatch.ts'
import { planningData, parsePlanning, serializePlanning } from '../src/gitStorage.ts'

const base = { organization: 'org', project: 'Quality', state: 'Active', assignedTo: '', areaPath: 'Q', iterationPath: 'Q', tags: '', url: '', syncedAt: '' }
const item = (id, workItemType, title, extra = {}) => ({ ...base, key: `k${id}`, id, workItemType, title, ...extra })

test('QV-57: per stream, the Epics a release is matched in — checked when read, shared in Git (TC-QV-38)', () => {
  assert.deepEqual(normalizeFeatureEpics({ DP: [12, '13', 12, -1, 'x'], ' CP ': [], '': [1], content: [5], 'Tool Validations': [7], ECP: [8] }), { DP: [12, 13], Content: [5] }, 'DP, CP, IOCC and Content only; IDs only, no duplicates; an empty list is the whole board')
  assert.equal(normalizeFeatureEpics([1, 2]), undefined)
  const settings = normalizeReleaseSourceSettings({ featureEpics: { DP: [12] }, matchThreshold: 80 })
  assert.deepEqual(streamEpics(settings, 'DP'), [12])
  assert.deepEqual(streamEpics(settings, 'dp'), [12], 'stream name, letter case ignored')
  assert.deepEqual(streamEpics(settings, 'CP'), [], 'none chosen: the whole board')
  const text = serializePlanning(planningData({ baselineRules: [], releaseScopes: [], resourceProfiles: {}, releaseSourceSettings: settings }))
  assert.deepEqual(parsePlanning(text).releaseSourceSettings.featureEpics, { DP: [12] }, 'kept in planning-data.json')
})

test('QV-57: the board match searches only the Features and User Stories under the chosen Epics (TC-QV-38)', () => {
  const board = [
    item(1, 'Epic', 'DP releases'), item(2, 'Epic', 'Other work'),
    item(10, 'Feature', 'DP | Dose Planning | v4.2', { parentId: 1 }), item(11, 'User Story', 'SFV', { parentId: 10 }),
    item(20, 'Feature', 'DP | Dose Planning | v4.2 copy', { parentId: 2 }),
    item(30, 'Feature', 'No Epic above'),
  ]
  assert.deepEqual(dpBoardCandidates(board).map((entry) => entry.item.id), [10, 11, 20, 30], 'no Epics chosen: the whole board')
  assert.deepEqual(dpBoardCandidates(board, [1]).map((entry) => entry.item.id), [10, 11], 'only under Epic 1')
})
