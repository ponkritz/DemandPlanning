import type { PeriodControl } from './domain.ts'
import { timeWritingMonth } from './azureInsights.ts'

// A month's planning locks after its deadline (default: the 5th, 23:59:59), unless Settings extends it; Settings can
// also lock it explicitly. The Monthly Time Writing page and the Task creation paths (New Feature, Complete children,
// Bulk actions month Tasks) share this rule: a Time Writing Task created after planning has locked is tagged ad-hoc.
export const nextMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7) }
export const isLocked = (deadline: string | undefined, explicit: boolean | undefined, extension: string | undefined, now: Date, override?: 'locked' | 'unlocked') => override === 'unlocked' ? false : override === 'locked' || Boolean(explicit || (deadline && now >= new Date(extension || deadline)))
export function defaultPeriod(month: string): PeriodControl {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.')
  return { controlVersion: 2, month, planningDeadline: `${month}-05T23:59:59.999`, actualsDeadline: `${nextMonth(month)}-05T23:59:59.999`, planningLocked: false, actualsLocked: false, updatedAt: '', updatedBy: '' }
}

// Version 2 owns both controls on the work month. Old Settings used the same-month 5th for Actuals by mistake.
export function normalizePeriods(value: unknown): PeriodControl[] {
  if (!Array.isArray(value)) throw new Error('Period controls must be a list of monthly records.')
  const months = new Set<string>()
  return value.map((entry): PeriodControl => {
    if (!entry || typeof entry !== 'object' || typeof entry.month !== 'string' || months.has(entry.month)) throw new Error('Period controls contain an invalid or duplicate month.')
    const defaults = defaultPeriod(entry.month)
    months.add(entry.month)
    const result: PeriodControl = { ...defaults, planningLocked: entry.planningLocked === true, actualsLocked: entry.actualsLocked === true, updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '', updatedBy: typeof entry.updatedBy === 'string' ? entry.updatedBy : '' }
    for (const key of ['planningDeadline', 'actualsDeadline', 'planningExtendedUntil', 'actualsExtendedUntil'] as const) {
      if (entry[key] == null || entry[key] === '') continue
      if (typeof entry[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(entry[key]) || !Number.isFinite(Date.parse(entry[key]))) throw new Error(`Invalid ${key} for ${entry.month}.`)
      result[key] = entry[key]
    }
    if (entry.controlVersion !== 2 && result.actualsDeadline.slice(0, 10) === `${entry.month}-05`) result.actualsDeadline = defaults.actualsDeadline
    for (const key of ['planningOverride', 'actualsOverride'] as const) {
      if (entry[key] != null && !['locked', 'unlocked'].includes(entry[key])) throw new Error(`Invalid ${key} for ${entry.month}.`)
      if (entry[key]) result[key] = entry[key]
    }
    if (typeof entry.extensionReason === 'string') result.extensionReason = entry.extensionReason
    return result
  }).sort((a, b) => a.month.localeCompare(b.month))
}
export const periodFor = (periods: PeriodControl[], month: string) => normalizePeriods(periods.filter((period) => period.month === month))[0] ?? defaultPeriod(month)

// A save updates one month only; a concurrent edit of that month must be reloaded rather than overwritten.
export function replacePeriod(periods: PeriodControl[], next: PeriodControl, expected?: PeriodControl) {
  const normalized = normalizePeriods(periods)
  const current = normalized.find((period) => period.month === next.month)
  const original = expected ? normalizePeriods([expected])[0] : undefined
  if (JSON.stringify(current) !== JSON.stringify(original)) throw new Error(`${next.month} period controls changed since they were loaded. Reload shared controls before saving.`)
  return normalizePeriods([...normalized.filter((period) => period.month !== next.month), next])
}
export function planningLocked(periods: PeriodControl[], month: string, now = new Date()) {
  const period = periodFor(periods, month)
  return isLocked(period.planningDeadline, period.planningLocked, period.planningExtendedUntil, now, period.planningOverride)
}
export function actualsLocked(periods: PeriodControl[], month: string, now = new Date()) {
  const period = periodFor(periods, month)
  return isLocked(period.actualsDeadline, period.actualsLocked, period.actualsExtendedUntil, now, period.actualsOverride)
}

// The periods of Settings, kept current by the App, so the creation paths outside the Monthly page can check the lock.
let periods: PeriodControl[] = []
export const setPlanningPeriods = (next: PeriodControl[]) => { periods = next }
export const planningLockedNow = (month: string, now = new Date()) => planningLocked(periods, month, now)
// A month Task title's month ("October 2026") is locked for planning now: a new Task for it is tagged ad-hoc.
export const adhocAfterLock = (monthLabel: string, now = new Date()) => { const month = timeWritingMonth(monthLabel); return Boolean(month && planningLockedNow(month, now)) }
export const actualsLockedNow = (month: string, now = new Date()) => actualsLocked(periods, month, now)
