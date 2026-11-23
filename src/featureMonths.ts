// BKL-31, BKL-32: the months a new Feature gets a Time Writing Task for, from its Start Date and Target date.
// - Start: the Start Date's month, never before the current month (UTC, NAV-51); without a Start Date the month the form
//   was opened for (Time Writing: the month shown), else the current month — "today".
// - End: the Target date's month; without one (or one before the start month) the start month only.
// No limit on the number of months (the user's choice); the form shows every month before Save.

const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/

/** "2026-12-05" → "2026-12"; anything else → undefined. */
export function monthKeyOfDate(value: string): string | undefined {
  const match = isoDate.exec(value.trim())
  if (!match) return undefined
  const month = Number(match[2])
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : undefined
}

/** "December 2026" → "2026-12". */
export function monthKeyOfLabel(label: string): string | undefined {
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(label.trim())
  if (!match) return undefined
  const index = names.findIndex((name) => name.toLowerCase() === match[1].toLowerCase())
  return index < 0 ? undefined : `${match[2]}-${String(index + 1).padStart(2, '0')}`
}

/** "2026-12" → "December 2026" (the title form of a month Task, BKL-28). */
export function monthLabelOfKey(key: string): string {
  const [year, month] = key.split('-').map(Number)
  return `${names[month - 1]} ${year}`
}

const nextKey = (key: string) => {
  const [year, month] = key.split('-').map(Number)
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
}

export interface FeatureMonthsInput { startDate?: string; targetDate?: string; formMonth: string; currentMonth: string }

/** The Time Writing months of a new Feature, as "Month YYYY" labels in order. Throws on a Target date before the Start Date. */
export function featureMonths({ startDate = '', targetDate = '', formMonth, currentMonth }: FeatureMonthsInput): string[] {
  const start = startDate.trim(), target = targetDate.trim()
  if (start && !monthKeyOfDate(start)) throw new Error('Enter the Start Date as a date.')
  if (target && !monthKeyOfDate(target)) throw new Error('Enter the Target date as a date.')
  if (start && target && target < start) throw new Error('The Target date is before the Start Date.')
  const current = monthKeyOfLabel(currentMonth)
  const fallback = monthKeyOfLabel(formMonth) ?? current
  if (!fallback || !current) throw new Error('The current month could not be worked out.')
  const startKey = start ? monthKeyOfDate(start)! : fallback
  const first = start && startKey < current ? current : startKey
  const targetKey = target ? monthKeyOfDate(target)! : first
  const last = targetKey > first ? targetKey : first
  const months: string[] = []
  for (let key = first; key <= last; key = nextKey(key)) months.push(monthLabelOfKey(key))
  return months
}

/** True for a month after the current one: no Completed Work can be booked yet. */
export function isFutureMonth(label: string, currentMonth: string) {
  const key = monthKeyOfLabel(label), current = monthKeyOfLabel(currentMonth)
  return Boolean(key && current && key > current)
}
