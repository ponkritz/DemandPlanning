import test from 'node:test'
import assert from 'node:assert/strict'
import { onPremValues } from '../src/onPremValues.ts'

test('On-prem field drop-down: the distinct values of the field across the fetched on-prem data, sorted, case ignored (EPS-06, TC-EPS-05)', () => {
  const sources = [
    { items: [{ fields: { 'Custom.Program': 'Dose Planning' } }, { fields: { 'custom.program': 'dose planning' } }, { fields: { 'Custom.Program': 'Atlas 10' } }, { fields: {} }] },
    { items: [{ fields: { 'Custom.Program': 'Atlas 9' } }, { fields: { 'Custom.Program': '  ' } }, { fields: { Other: 'x' } }] },
  ]
  assert.deepEqual(onPremValues(sources, 'Custom.Program'), ['Atlas 9', 'Atlas 10', 'Dose Planning'])
  assert.equal(onPremValues(sources, 'custom.PROGRAM'), onPremValues(sources, 'Custom.Program'), 'the field name in any case, worked out once')
  assert.deepEqual(onPremValues(sources, 'Custom.Nothing'), [])
  assert.deepEqual(onPremValues(sources, ' '), [])
  assert.deepEqual(onPremValues([], 'Custom.Program'), [], 'nothing fetched: no values (the field stays a text box)')
})
