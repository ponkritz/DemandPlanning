import test from 'node:test'
import assert from 'node:assert/strict'
import { actualsLockDate, actualsLocked, adhocAfterLock, planLockDate, planningLocked, setLockSettings } from '../src/planningLock.ts'
import { normalizeCapacitySettings } from '../src/capacity.ts'
import { parsePlanning, planningData, serializePlanning } from '../src/gitStorage.ts'

test('month locks: by default November planning locks after 5 November and November actuals after 4 December (MON-06, MON-07, MON-21)', () => {
  const none = {}
  assert.deepEqual([planLockDate(none, '2026-11'), actualsLockDate(none, '2026-11')], ['2026-11-05', '2026-12-04'])
  assert.equal(planningLocked(none, '2026-11', new Date('2026-11-05T23:00:00')), false, 'the lock day itself is open')
  assert.equal(planningLocked(none, '2026-11', new Date('2026-11-06T00:00:01')), true)
  assert.equal(actualsLocked(none, '2026-11', new Date('2026-12-04T12:00:00')), false)
  assert.equal(actualsLocked(none, '2026-11', new Date('2026-12-05T00:00:01')), true)
  assert.equal(actualsLocked(none, '2026-12', new Date('2026-12-31T12:00:00')), false, 'December actuals: open until 4 January')
  assert.equal(actualsLockDate(none, '2026-12'), '2027-01-04', 'across the year end')
})

test('month locks reset when the month rolls over: the new month starts open, the old one stays locked (MON-22)', () => {
  const settings = { monthLocks: { '2026-10': { planLocked: true, actualsLocked: true } } }
  const firstOfNovember = new Date('2026-11-01T09:00:00')
  assert.equal(planningLocked(settings, '2026-10', firstOfNovember), true)
  assert.equal(planningLocked(settings, '2026-11', firstOfNovember), false, 'November planning open: October\'s lock is October\'s only')
  assert.equal(actualsLocked(settings, '2026-11', firstOfNovember), false)
})

test('month locks: each month can have its own dates, a default day from Settings, or lock early (MON-23)', () => {
  const settings = { planLockDay: 3, actualsLockDay: 2, monthLocks: { '2026-11': { planOn: '2026-11-12', actualsOn: '2026-12-09' }, '2026-12': { planLocked: true } } }
  assert.deepEqual([planLockDate(settings, '2026-11'), actualsLockDate(settings, '2026-11')], ['2026-11-12', '2026-12-09'], 'November: its own dates')
  assert.deepEqual([planLockDate(settings, '2027-01'), actualsLockDate(settings, '2027-01')], ['2027-01-03', '2027-02-02'], 'January: the default days')
  assert.equal(planningLocked(settings, '2026-11', new Date('2026-11-10T10:00:00')), false, 'reopened by a later date')
  assert.equal(planningLocked(settings, '2026-12', new Date('2026-12-01T10:00:00')), true, 'locked early')
})

test('month locks are kept with the capacity settings in the Git planning data; bad values are dropped (MON-24)', () => {
  const settings = normalizeCapacitySettings({ planLockDay: 5, actualsLockDay: 40, monthLocks: { '2026-11': { planOn: '2026-11-07', actualsLocked: true, reason: 'Release week', updatedBy: 'lead@example.com' }, '2026-13': { planLocked: true }, '2026-12': { planOn: 'soon' } } })
  assert.equal(settings.planLockDay, 5)
  assert.equal(settings.actualsLockDay, undefined, 'a day above 28 is dropped (the default 4 applies)')
  assert.deepEqual(Object.keys(settings.monthLocks), ['2026-11'], 'an invalid month or date is dropped')
  const back = parsePlanning(serializePlanning(planningData({ capacitySettings: settings })))
  assert.deepEqual(back.capacitySettings.monthLocks['2026-11'], { planOn: '2026-11-07', actualsLocked: true, reason: 'Release week', updatedBy: 'lead@example.com' })
  assert.equal(back.capacitySettings.planLockDay, 5)
})

test('ad-hoc after the lock: the month of the Task title is checked against the month locks in force (TC-MON-08)', () => {
  setLockSettings({})
  assert.equal(adhocAfterLock('October 2026', new Date('2026-10-04T10:00:00')), false)
  assert.equal(adhocAfterLock('October 2026', new Date('2026-10-30T10:00:00')), true)
  assert.equal(adhocAfterLock('November 2026', new Date('2026-11-02T10:00:00')), false, 'a new month is open')
  setLockSettings({ monthLocks: { '2026-10': { planOn: '2026-10-31' } } })
  assert.equal(adhocAfterLock('October 2026', new Date('2026-10-30T10:00:00')), false, 'a later date keeps it open')
  assert.equal(adhocAfterLock('not a month', new Date('2026-10-30T10:00:00')), false)
  setLockSettings({})
})
