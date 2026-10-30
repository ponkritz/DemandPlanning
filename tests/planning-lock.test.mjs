import test from 'node:test'
import assert from 'node:assert/strict'
import { actualsLocked, adhocAfterLock, planningLocked, setPlanningPeriods } from '../src/planningLock.ts'

const period = (month, extra = {}) => ({ month, planningDeadline: `${month}-05T23:59:59`, actualsDeadline: `${month}-05T23:59:59`, planningLocked: false, actualsLocked: false, updatedAt: '', updatedBy: '', ...extra })

test('planning lock: the 5th by default, the configured deadline or extension, or an explicit lock (TC-MON-08)', () => {
  assert.equal(planningLocked([], '2026-10', new Date('2026-10-05T12:00:00')), false)
  assert.equal(planningLocked([], '2026-10', new Date('2026-10-06T00:00:01')), true)
  assert.equal(planningLocked([period('2026-10', { planningExtendedUntil: '2026-10-12T23:59:59' })], '2026-10', new Date('2026-10-08T00:00:00')), false, 'extended')
  assert.equal(planningLocked([period('2026-10', { planningLocked: true })], '2026-10', new Date('2026-10-01T00:00:00')), true, 'locked in Settings')
  assert.equal(actualsLocked([], '2026-10', new Date('2026-11-05T12:00:00')), false, 'actuals lock on the next month’s deadline')
  assert.equal(actualsLocked([], '2026-10', new Date('2026-11-06T00:00:01')), true)
})

test('ad-hoc after the lock: the month of the Task title is checked against Settings’ periods (TC-MON-08)', () => {
  setPlanningPeriods([])
  assert.equal(adhocAfterLock('October 2026', new Date('2026-10-04T10:00:00')), false)
  assert.equal(adhocAfterLock('October 2026', new Date('2026-10-30T10:00:00')), true)
  setPlanningPeriods([period('2026-10', { planningExtendedUntil: '2026-10-31T23:59:59' })])
  assert.equal(adhocAfterLock('October 2026', new Date('2026-10-30T10:00:00')), false, 'an extension keeps it open')
  assert.equal(adhocAfterLock('not a month', new Date('2026-10-30T10:00:00')), false)
  setPlanningPeriods([])
})
