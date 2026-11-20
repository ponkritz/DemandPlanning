import test from 'node:test'
import assert from 'node:assert/strict'
import { loadMyNamingPatterns, myPatternsFor, myPatternsVersion, setMyNamingPatterns } from '../src/myNamingPatterns.ts'
import { streamPatterns } from '../src/releaseSource.ts'

const memory = (initial = {}) => { const data = new Map(Object.entries(initial)); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) } }

test('My naming patterns: IOCC, Content and Tool Validations only, kept here, used for me instead of the shared ones (QV-60, TC-QV-41)', () => {
  const storage = memory({ 'demand-planning-my-naming-patterns-v1': JSON.stringify({ Content: [{ label: '', pattern: 'MY_{*}' }], DP: [{ label: '', pattern: '{*}' }], IOCC: [{ label: '', pattern: '((' }] }) })
  loadMyNamingPatterns(storage)
  assert.deepEqual(myPatternsFor('Content'), [{ label: '', pattern: 'MY_{*}' }])
  assert.equal(myPatternsFor('DP'), undefined, 'never DP or CP')
  const shared = { namingPatterns: { Content: [{ label: '', pattern: 'SHARED_{*}' }], 'Tool Validations': [{ label: 'TV', pattern: 'TV {*}' }] } }
  assert.deepEqual(streamPatterns(shared, 'Content'), [{ label: '', pattern: 'MY_{*}' }], 'mine wins where I set it')
  assert.deepEqual(streamPatterns(shared, 'Tool Validations'), [{ label: 'TV', pattern: 'TV {*}' }], 'the shared ones elsewhere')
  const before = myPatternsVersion()
  setMyNamingPatterns('Tool Validations', [{ label: ' Mine ', pattern: ' TOOL {*} ' }], storage)
  assert.ok(myPatternsVersion() > before, 'a change is a new version (the figures are worked out again)')
  assert.deepEqual(streamPatterns(shared, 'Tool Validations'), [{ label: 'Mine', pattern: 'TOOL {*}' }])
  assert.deepEqual(JSON.parse(storage.getItem('demand-planning-my-naming-patterns-v1'))['Tool Validations'], [{ label: 'Mine', pattern: 'TOOL {*}' }])
  setMyNamingPatterns('Content', undefined, storage)
  assert.deepEqual(streamPatterns(shared, 'Content'), [{ label: '', pattern: 'SHARED_{*}' }], 'back to the shared ones')
  assert.throws(() => setMyNamingPatterns('CP', [{ label: '', pattern: '{*}' }], storage), /IOCC, Content and Tool Validations only/)
  setMyNamingPatterns('Tool Validations', undefined, storage)
})
