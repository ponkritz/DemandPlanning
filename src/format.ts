// Display formatting shared by every page. Keep values as data; these only render them.
export function formatHours(value: number | null | undefined) { return value == null ? '—' : Number(value.toFixed(2)).toLocaleString() }
export function formatPercent(value: number | null | undefined, digits = 1) { return value == null ? '—' : `${value.toFixed(digits)}%` }
// Long date in the viewer's time zone, e.g. "30 September 2026". Azure DevOps dates (Author Approval Date, Target
// Date, …) are stored in UTC, so the local calendar date can differ from the UTC one; this is the date the month
// filters and counts use. A plain YYYY-MM-DD is shown as that calendar date. timeZone is for tests only.
export function formatDate(value: string | undefined, fallback = '—', timeZone?: string) {
  if (!value) return fallback
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (!plain && !Number.isFinite(Date.parse(value))) return value.slice(0, 10)
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', ...(plain ? { timeZone: 'UTC' } : timeZone ? { timeZone } : {}) }).format(new Date(plain ? `${value}T00:00:00Z` : value))
}
// Date and time in the viewer's own time zone, with the zone shown (e.g. "20 Oct 2026, 21:05 CEST"): used for when
// data was fetched or saved. timeZone is for tests only.
export function formatDateTime(value: string | undefined, fallback = '—', timeZone?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return fallback
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(value))
}
export function monthName(month: string) { return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`)) }
// Today's date (YYYY-MM-DD) in the viewer's time zone.
export function todayIso(now = new Date(), timeZone?: string) { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(now) }
export function localTimeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time' } catch { return 'Local time' } }
export function timeZoneLabel(date = new Date()) {
  try { return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? localTimeZone() } catch { return localTimeZone() }
}
// "just now", "5 min ago", "3 h ago", "2 days ago"; falls back to the absolute local date beyond a week.
export function relativeTime(value: string | undefined, now: Date = new Date(), fallback = '—') {
  if (!value || !Number.isFinite(Date.parse(value))) return fallback
  const seconds = Math.round((now.getTime() - Date.parse(value)) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 90) return '1 min ago'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(value).toLocaleDateString()
}
