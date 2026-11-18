import test from 'node:test'
import assert from 'node:assert/strict'
import { checkFormula, evaluateFormula, formulaFromParts } from '../src/formula.ts'

test('CAP-55: a typed formula reads like Excel — figures in brackets, + - * / ( ), MAX, MIN, ROUND, IF; blank on / 0', () => {
  const values = { 'Project work': 112, Training: 8, 'Other NPRA': 6, 'Common activities': 10, 'Funded Hours': 160, Absence: 16 }
  const v4 = '=([Project work] + [Training] + [Other NPRA] + [Common activities]) / ([Funded Hours] - [Absence]) * 100'
  assert.equal(Math.round(evaluateFormula(v4, values).value * 100) / 100, 94.44)
  assert.deepEqual(evaluateFormula(v4, values).used, ['Project work', 'Training', 'Other NPRA', 'Common activities', 'Funded Hours', 'Absence'])
  assert.equal(evaluateFormula('[project work] / 2', values).value, 56, 'figure names ignore case; "=" is optional')
  assert.equal(evaluateFormula('=MIN([Project work], 100) + MAX(1, 2) - ROUND(2.345, 2)', values).value, 100 + 2 - 2.35)
  assert.equal(evaluateFormula('=IF([Absence] > 20, 0, [Training])', values).value, 8)
  assert.equal(evaluateFormula('=-[Training] * 2', values).value, -16)
  assert.equal(evaluateFormula('=[Training] / ([Funded Hours] - 160)', values).value, null, 'dividing by 0 is blank')
  assert.equal(evaluateFormula('=[Standard Hours] + 1', values).value, null, 'a figure without a value is blank')
})

test('CAP-55: a formula that does not read says why', () => {
  const error = (text) => { const check = checkFormula(text); return check.ok ? '' : check.error }
  assert.match(error('=[Project wrk] / 2'), /\[Project wrk\] is not a figure/)
  assert.match(error('=([Absence] + 1'), /A \( is not closed/)
  assert.match(error('=[Absence])'), /A \) has no opening/)
  assert.match(error('=IF([Absence] > 0, 1)'), /IF needs 3 parts/)
  assert.match(error('=SUM([Absence], 1)'), /SUM is not a known function/)
  assert.match(error('=100'), /at least one figure/)
  assert.match(error('=[Absence] $ 2'), /“\$” is not allowed/)
  assert.match(error('='), /Type a formula/)
  assert.match(error('=' + '[Absence]+'.repeat(120) + '1'), /longer than 1000/)
  assert.deepEqual(checkFormula('=[Absence] * 2'), { ok: true, used: ['Absence'] })
  assert.equal(formulaFromParts(['Project work', 'Training'], ['Absence'], true), '=([Project work] + [Training]) / ([Funded Hours] - [Standard Hours] - [Absence]) * 100', 'the ticks as a starting formula')
})
