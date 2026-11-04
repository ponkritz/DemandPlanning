import test from 'node:test'
import assert from 'node:assert/strict'
import { actualsLocked, adhocAfterLock, defaultPeriod, normalizePeriods, planningLocked, replacePeriod, setPlanningPeriods } from '../src/planningLock.ts'

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

test('selected month owns both controls; following month settings never leak into its Actuals (TC-SET-02)', () => {
  const october = { ...defaultPeriod('2026-10'), actualsDeadline: '2026-11-12T23:59:59.999' }
  const november = { ...defaultPeriod('2026-11'), actualsLocked: true }
  assert.equal(actualsLocked([october, november], '2026-10', new Date('2026-11-09T12:00:00')), false)
  assert.equal(actualsLocked([october, november], '2026-11', new Date('2026-11-09T12:00:00')), true)
  assert.equal(actualsLocked([october], '2026-10', new Date('2026-11-13T00:00:00')), true)
  assert.equal(defaultPeriod('2026-12').actualsDeadline, '2027-01-05T23:59:59.999')
  assert.equal(planningLocked([], '2026-10', new Date('2026-10-05T23:59:59.998')), false)
  assert.equal(planningLocked([], '2026-10', new Date('2026-10-06T00:00:00')), true)
})

test('manual unlock overrides expired dates independently, and Automatic restores the schedule (TC-SET-02)', () => {
  const old = defaultPeriod('2026-10'), now = new Date('2026-12-10T12:00:00')
  const unlocked = { ...old, planningOverride: 'unlocked', actualsOverride: 'locked' }
  assert.equal(planningLocked([unlocked], old.month, now), false)
  assert.equal(actualsLocked([unlocked], old.month, now), true)
  assert.equal(planningLocked([old], old.month, now), true)
  const actualOpen = { ...old, planningOverride: 'locked', actualsOverride: 'unlocked' }
  assert.equal(planningLocked([actualOpen], old.month, now), true)
  assert.equal(actualsLocked([actualOpen], old.month, now), false)
})

test('legacy periods upgrade safely; malformed and duplicate month records are rejected (TC-SET-02)', () => {
  const normalized = normalizePeriods([period('2026-10')])
  assert.equal(normalized[0].actualsDeadline, '2026-11-05T23:59:59.999')
  assert.deepEqual(normalizePeriods(normalized), normalized, 'migration is idempotent')
  assert.equal(normalizePeriods([{ ...period('2026-10'), actualsDeadline: '2026-11-19T23:59:59Z' }])[0].actualsDeadline, '2026-11-19T23:59:59Z', 'custom dates retained')
  for (const invalid of [null, [period('bad')], [period('2026-10'), period('2026-10')], [{ ...period('2026-10'), actualsDeadline: 'not a date' }]]) assert.throws(() => normalizePeriods(invalid))
})

test('month save preserves other months, with explicit detection of concurrent edits (TC-SET-02)', () => {
  const october = defaultPeriod('2026-10'), november = defaultPeriod('2026-11')
  const changed = { ...october, planningOverride: 'unlocked', extensionReason: 'Operational extension' }
  const merged = replacePeriod([november, october], changed, october)
  assert.deepEqual(merged.find((entry) => entry.month === november.month), november)
  assert.equal(merged.find((entry) => entry.month === october.month).planningOverride, 'unlocked')
  assert.throws(() => replacePeriod(merged, october, october), /changed since/)
  assert.throws(() => replacePeriod([november], changed, october), /changed since/, 'deletion also conflicts')
  assert.equal(replacePeriod([october], november).length, 2, 'a new month can be saved directly')
})
