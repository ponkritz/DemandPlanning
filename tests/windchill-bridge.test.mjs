import test from 'node:test'
import assert from 'node:assert/strict'
import { windchillBookmarklet, parseBridgeResults, bridgeKey } from '../src/windchillBridge.ts'

test('Windchill tab bookmark: valid one-line script for this app only; results checked against the request', () => {
  const code = windchillBookmarklet('https://app.example.github.io')
  assert.ok(code.startsWith('javascript:(async()=>{'))
  assert.doesNotMatch(code, /[\n%#]/, 'no newlines, % or # (bookmark addresses decode them)')
  assert.doesNotThrow(() => new Function(code.slice('javascript:'.length)), 'the bookmark is valid JavaScript')
  assert.match(code, /const A="https:\/\/app\.example\.github\.io"/)
  const ok = { app: bridgeKey, type: 'results', nonce: 'n1', results: [{ id: 'a', rows: [{ Number: '1' }, null, [1]] }, { id: 'b', error: 'status 400' }, { id: 'x', rows: [] }, { id: 'a', rows: [] }] }
  assert.deepEqual(parseBridgeResults(ok, 'n1', ['a', 'b']), [{ id: 'a', rows: [{ Number: '1' }] }, { id: 'b', error: 'status 400' }], 'unknown views and repeats are ignored; rows must be objects')
  assert.equal(parseBridgeResults({ ...ok, nonce: 'other' }, 'n1', ['a']), null, 'another request code is ignored')
  assert.equal(parseBridgeResults({ ...ok, app: 'x' }, 'n1', ['a']), null)
  assert.deepEqual(parseBridgeResults({ ...ok, results: [{ id: 'a', rows: 'x' }] }, 'n1', ['a']), [{ id: 'a', error: 'The results from Windchill were not a list (or more than 20,000).' }])
})
