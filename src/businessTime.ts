// Business time (NAV-51, owner decision 1 of the design defaults review): UTC decides every business boundary —
// which month a date or timestamp belongs to (header month, month filters and counts of every page), the month of new
// month Time Writing Tasks, which Sprint / PI is current and when a month's plan or actuals lock. One rule for every
// viewer, wherever they are. Times shown to the user (fetched at, saved at, history) stay in the viewer's own zone
// (format.ts). A plain date (YYYY-MM-DD, as Azure DevOps and the Settings store them) is its own calendar date and
// never shifts by a day.
export const businessTimeZone = 'UTC'

const plainDate = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const toDate = (value: Date | string | number) => value instanceof Date ? value : new Date(value)
const valid = (date: Date) => Number.isFinite(date.getTime())

/** Today's date (YYYY-MM-DD) in UTC. */
export function utcToday(now: Date = new Date()) { return now.toISOString().slice(0, 10) }

/** The UTC date (YYYY-MM-DD) of a timestamp; a plain date is returned as it is. Undefined when not a date. */
export function utcDateOf(value: Date | string | number | undefined): string | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'string') { const match = plainDate.exec(value.trim()); if (match?.[3]) return match[0]; if (!Number.isFinite(Date.parse(value))) return undefined }
  const date = toDate(value)
  return valid(date) ? date.toISOString().slice(0, 10) : undefined
}

/** The UTC month (YYYY-MM) of a timestamp, now by default; a plain date or month keeps its own month. */
export function utcMonthKey(value: Date | string | number = new Date()): string | undefined {
  if (typeof value === 'string') { const match = plainDate.exec(value.trim()); if (match) return `${match[1]}-${match[2]}` }
  return utcDateOf(value)?.slice(0, 7)
}

/** The current month as a month Task title names it ("November 2026"), in UTC. */
export function utcMonthLabel(now: Date = new Date()) {
  const key = utcMonthKey(now)!
  return `${monthNames[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
}

/** The moment a day (YYYY-MM-DD) ends in UTC: a lock on that day starts right after it. */
export function endOfUtcDay(date: string) { return new Date(`${date}T23:59:59.999Z`) }
