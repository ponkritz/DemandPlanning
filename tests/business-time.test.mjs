import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { businessTimeZone, endOfUtcDay, utcDateOf, utcMonthKey, utcMonthLabel, utcToday } from '../src/businessTime.ts'
import { approvalMonthOf } from '../src/releaseSource.ts'
import { futureMonthTask, monthKeyNow } from '../src/closeList.ts'
import { isPastSprint } from '../src/myWork.ts'
import { actualsLocked, adhocAfterLock, planningLocked, setLockSettings } from '../src/planningLock.ts'
import { releaseMonth } from '../src/windchillReleases.ts'
import { closedMonthOf } from '../src/monthlyPack.ts'

// NAV-51 (owner decision 1, design defaults review): UTC decides every business boundary — the month of a date, the
// month of new month Tasks, the current Sprint and the lock moment — for every viewer; displayed times stay local.

test('NAV-51: the business helpers work in UTC; a plain date never shifts by a day (TC-NAV-51)', () => {
  assert.equal(businessTimeZone, 'UTC')
  assert.equal(utcToday(new Date('2026-11-30T23:30:00Z')), '2026-11-30')
  assert.equal(utcToday(new Date('2026-12-01T00:00:00Z')), '2026-12-01')
  assert.equal(utcMonthKey(new Date('2026-11-30T23:59:59.999Z')), '2026-11')
  assert.equal(utcMonthKey('2026-12-01T00:00:00Z'), '2026-12')
  assert.equal(utcMonthKey('2026-11-30T20:00:00-05:00'), '2026-12', 'an offset is read as the instant it names')
  assert.equal(utcMonthKey(Date.UTC(2026, 9, 31, 23, 0)), '2026-10')
  assert.equal(utcMonthKey('2026-11-01'), '2026-11'); assert.equal(utcMonthKey('2026-11'), '2026-11')
  assert.equal(utcMonthKey('not a date'), undefined)
  assert.match(utcMonthKey(), /^\d{4}-\d{2}$/)
  assert.equal(utcDateOf('2026-11-01'), '2026-11-01'); assert.equal(utcDateOf('2026-10-31T22:00:00Z'), '2026-10-31')
  assert.equal(utcDateOf(''), undefined); assert.equal(utcDateOf(undefined), undefined); assert.equal(utcDateOf('soon'), undefined)
  assert.equal(utcMonthLabel(new Date('2026-12-31T23:59:59Z')), 'December 2026')
  assert.equal(utcMonthLabel(new Date('2027-01-01T00:00:00Z')), 'January 2027')
  assert.equal(endOfUtcDay('2026-11-05').toISOString(), '2026-11-05T23:59:59.999Z')
})

test('NAV-51: months of dates, new month Tasks, the current Sprint and the locks change at midnight UTC (TC-NAV-51)', () => {
  // Month of a date: release filters, Pulse Check, closures, Windchill.
  assert.equal(approvalMonthOf('2026-10-31T23:30:00Z'), '2026-10')
  assert.equal(approvalMonthOf('2026-11-01T00:30:00Z'), '2026-11')
  assert.equal(closedMonthOf({ closedDate: '2026-10-31T22:00:00Z', state: 'Closed' }), '2026-10')
  assert.equal(releaseMonth({ latestAt: Date.UTC(2026, 9, 31, 23, 15) }), '2026-10')
  // Month of new month Tasks and "later months" of BKL-43.
  assert.equal(monthKeyNow(new Date('2026-10-31T23:59:00Z')), '2026-10')
  assert.equal(monthKeyNow(new Date('2026-11-01T00:00:00Z')), '2026-11')
  const task = { workItemType: 'Task', title: 'November 2026 | Work' }
  assert.equal(futureMonthTask(task, new Date('2026-10-31T23:59:00Z')), true)
  assert.equal(futureMonthTask(task, new Date('2026-11-01T00:00:00Z')), false)
  // Current Sprint: a Sprint finishing on the 16th is past from 17 October 00:00 UTC.
  const sprints = [{ path: 'P\\S1', attributes: { startDate: '2026-10-01T00:00:00Z', finishDate: '2026-10-16T00:00:00Z' } }]
  assert.equal(isPastSprint('P\\S1', sprints, new Date('2026-10-16T23:59:59Z')), false)
  assert.equal(isPastSprint('P\\S1', sprints, new Date('2026-10-17T00:00:00Z')), true)
  // Lock moment: the end of the lock day in UTC.
  assert.equal(planningLocked({}, '2026-11', new Date('2026-11-05T23:59:59Z')), false)
  assert.equal(planningLocked({}, '2026-11', new Date('2026-11-06T00:00:00Z')), true)
  assert.equal(actualsLocked({}, '2026-11', new Date('2026-12-04T23:59:59Z')), false)
  assert.equal(actualsLocked({}, '2026-11', new Date('2026-12-05T00:00:00Z')), true)
  setLockSettings({})
  assert.equal(adhocAfterLock('November 2026', new Date('2026-11-05T23:00:00Z')), false)
  assert.equal(adhocAfterLock('November 2026', new Date('2026-11-06T00:00:01Z')), true)
})

// The same checks in zones far from UTC: the results must not depend on the computer's time zone.
const probe = `
const t = await import(${JSON.stringify(new URL('../src/businessTime.ts', import.meta.url).href)})
const r = await import(${JSON.stringify(new URL('../src/releaseSource.ts', import.meta.url).href)})
const c = await import(${JSON.stringify(new URL('../src/closeList.ts', import.meta.url).href)})
const l = await import(${JSON.stringify(new URL('../src/planningLock.ts', import.meta.url).href)})
const w = await import(${JSON.stringify(new URL('../src/myWork.ts', import.meta.url).href)})
const sprints = [{ path: 'S', attributes: { startDate: '2026-10-01T00:00:00Z', finishDate: '2026-10-16T00:00:00Z' } }]
console.log(JSON.stringify({
  offset: new Date('2026-11-30T23:30:00Z').getTimezoneOffset(),
  today: t.utcToday(new Date('2026-11-30T23:30:00Z')),
  month: t.utcMonthKey(new Date('2026-11-30T23:30:00Z')),
  plain: [t.utcMonthKey('2026-11-01'), t.utcDateOf('2026-11-01'), r.approvalMonthOf('2026-11-01')],
  approval: [r.approvalMonthOf('2026-10-31T23:30:00Z'), r.approvalMonthOf('2026-11-01T00:30:00Z')],
  label: [t.utcMonthLabel(new Date('2026-10-31T23:59:00Z')), t.utcMonthLabel(new Date('2026-11-01T00:00:00Z'))],
  monthKeyNow: c.monthKeyNow(new Date('2026-10-31T23:59:00Z')),
  locked: [l.planningLocked({}, '2026-11', new Date('2026-11-05T23:59:59Z')), l.planningLocked({}, '2026-11', new Date('2026-11-06T00:00:00Z'))],
  past: [w.isPastSprint('S', sprints, new Date('2026-10-16T23:59:59Z')), w.isPastSprint('S', sprints, new Date('2026-10-17T00:00:00Z'))],
}))
`
for (const zone of ['Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata']) {
  test(`NAV-51: the same months, Sprint and locks with TZ=${zone} at month boundaries (TC-NAV-51)`, () => {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { env: { ...process.env, TZ: zone }, encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    const out = JSON.parse(run.stdout.trim().split('\n').at(-1))
    assert.notEqual(out.offset, 0, 'the child runs in a zone away from UTC')
    assert.deepEqual({ ...out, offset: undefined }, {
      offset: undefined, today: '2026-11-30', month: '2026-11', plain: ['2026-11', '2026-11-01', '2026-11'], approval: ['2026-10', '2026-11'],
      label: ['October 2026', 'November 2026'], monthKeyNow: '2026-10', locked: [false, true], past: [false, true],
    })
  })
}
