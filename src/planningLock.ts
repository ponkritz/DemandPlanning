import type { PeriodControl } from './domain.ts'
import { timeWritingMonth } from './azureInsights.ts'

// A month's planning locks after its deadline (default: the 5th, 23:59:59), unless Settings extends it; Settings can
// also lock it explicitly. The Monthly Time Writing page and the Task creation paths (New Feature, Complete children,
// Bulk actions month Tasks) share this rule: a Time Writing Task created after planning has locked is tagged ad-hoc.
export const nextMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7) }
export const isLocked = (deadline: string | undefined, explicit: boolean | undefined, extension: string | undefined, now: Date) => Boolean(explicit || (deadline && now >= new Date(extension || deadline)))
export function planningLocked(periods: PeriodControl[], month: string, now = new Date()) {
  const period = periods.find((item) => item.month === month)
  return isLocked(period?.planningDeadline ?? `${month}-05T23:59:59`, period?.planningLocked, period?.planningExtendedUntil, now)
}
export function actualsLocked(periods: PeriodControl[], month: string, now = new Date()) {
  const period = periods.find((item) => item.month === nextMonth(month))
  return isLocked(period?.actualsDeadline ?? `${nextMonth(month)}-05T23:59:59`, period?.actualsLocked, period?.actualsExtendedUntil, now)
}

// The periods of Settings, kept current by the App, so the creation paths outside the Monthly page can check the lock.
let periods: PeriodControl[] = []
export const setPlanningPeriods = (next: PeriodControl[]) => { periods = next }
export const planningLockedNow = (month: string, now = new Date()) => planningLocked(periods, month, now)
// A month Task title's month ("October 2026") is locked for planning now: a new Task for it is tagged ad-hoc.
export const adhocAfterLock = (monthLabel: string, now = new Date()) => { const month = timeWritingMonth(monthLabel); return Boolean(month && planningLockedNow(month, now)) }
