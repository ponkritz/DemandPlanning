import type { PeriodControl } from './domain.ts'
import type { MonthLock } from './capacity.ts'
import { timeWritingMonth } from './azureInsights.ts'
import { endOfUtcDay } from './businessTime.ts'

// Month locks (MON-06, MON-07, MON-21…MON-24): every month M has its own plan lock date and actuals lock date — by
// default the plan lock day of M (5th) and the actuals lock day of M+1 (4th), both set in Admin → Capacity & time &
// periods — and Settings can move either date for one month or lock it early. The day itself is still open; the lock
// starts at the end of that day in UTC (NAV-51), the same moment for every viewer. Everything is kept with the capacity settings in Git, so
// every computer sees the same locks, and each is worked out from the current time, so a new month starts open. The
// Monthly Time Writing page and the Task creation paths (New Feature, Complete children, Bulk actions month Tasks, the
// Edit form) share these rules: a Time Writing Task created after planning has locked is tagged ad-hoc.
export interface LockSettings { planLockDay?: number; actualsLockDay?: number; monthLocks?: Record<string, MonthLock> }
export const defaultPlanLockDay = 5
export const defaultActualsLockDay = 4
const pad = (value: number) => String(value).padStart(2, '0')
export const nextMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7) }
export const planLockDate = (settings: LockSettings, month: string) => settings.monthLocks?.[month]?.planOn ?? `${month}-${pad(settings.planLockDay ?? defaultPlanLockDay)}`
export const actualsLockDate = (settings: LockSettings, month: string) => settings.monthLocks?.[month]?.actualsOn ?? `${nextMonth(month)}-${pad(settings.actualsLockDay ?? defaultActualsLockDay)}`
// The lock starts when the lock day ends (UTC, NAV-51).
const endOfDay = endOfUtcDay
export function planningLocked(settings: LockSettings, month: string, now = new Date()) {
  return Boolean(settings.monthLocks?.[month]?.planLocked) || now > endOfDay(planLockDate(settings, month))
}
export function actualsLocked(settings: LockSettings, month: string, now = new Date()) {
  return Boolean(settings.monthLocks?.[month]?.actualsLocked) || now > endOfDay(actualsLockDate(settings, month))
}

// The lock settings of Settings, kept current by the App, so the creation paths outside the Monthly page can check them.
let current: LockSettings = {}
export const setLockSettings = (next: LockSettings) => { current = next }
export const planningLockedNow = (month: string, now = new Date()) => planningLocked(current, month, now)
// A month Task title's month ("October 2026") is locked for planning now: a new Task for it is tagged ad-hoc.
export const adhocAfterLock = (monthLabel: string, now = new Date()) => { const month = timeWritingMonth(monthLabel); return Boolean(month && planningLockedNow(month, now)) }
export const actualsLockedNow = (month: string, now = new Date()) => actualsLocked(current, month, now)

// Validate period records from existing DemandPlanning backups.
export function defaultPeriod(month: string): PeriodControl {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.')
  return { controlVersion: 2, month, planningDeadline: `${month}-05T23:59:59.999`, actualsDeadline: `${nextMonth(month)}-05T23:59:59.999`, planningLocked: false, actualsLocked: false, updatedAt: '', updatedBy: '' }
}
export function normalizePeriods(value: unknown): PeriodControl[] {
  if (!Array.isArray(value)) throw new Error('Period controls must be a list of monthly records.')
  const months = new Set<string>()
  return value.map((entry): PeriodControl => {
    if (!entry || typeof entry !== 'object' || typeof entry.month !== 'string' || months.has(entry.month)) throw new Error('Period controls contain an invalid or duplicate month.')
    const defaults = defaultPeriod(entry.month); months.add(entry.month)
    const result: PeriodControl = { ...defaults, planningLocked: entry.planningLocked === true, actualsLocked: entry.actualsLocked === true, updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '', updatedBy: typeof entry.updatedBy === 'string' ? entry.updatedBy : '' }
    for (const key of ['planningDeadline', 'actualsDeadline', 'planningExtendedUntil', 'actualsExtendedUntil'] as const) {
      if (entry[key] == null || entry[key] === '') continue
      if (typeof entry[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(entry[key]) || !Number.isFinite(Date.parse(entry[key]))) throw new Error(`Invalid ${key} for ${entry.month}.`)
      result[key] = entry[key]
    }
    if (entry.controlVersion !== 2 && result.actualsDeadline.slice(0, 10) === `${entry.month}-05`) result.actualsDeadline = defaults.actualsDeadline
    for (const key of ['planningOverride', 'actualsOverride'] as const) if (entry[key] === 'locked' || entry[key] === 'unlocked') result[key] = entry[key]
    if (typeof entry.extensionReason === 'string') result.extensionReason = entry.extensionReason
    return result
  }).sort((a, b) => a.month.localeCompare(b.month))
}
