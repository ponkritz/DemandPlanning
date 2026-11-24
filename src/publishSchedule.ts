// OND-78, OND-79 Scheduled publish of a standalone HTML file: per page, Off / Daily / Weekly (a day) at a time, set by
// the Tool Owner or the page's co-owners and kept on this computer only (this browser's or the desktop app's local
// storage — never in Git). It runs only while the app is open; a run missed while the app was closed runs at the next
// start (once, however many were missed). Times are the computer's local time. Nothing here reads the clock itself.

export type ScheduleMode = 'off' | 'daily' | 'weekly'
export interface PublishSchedule { mode: ScheduleMode; day: number; time: string; setAt: string; lastRun?: string; lastOk?: boolean; lastText?: string }
export const scheduleKey = 'demand-planning-publish-schedule-v2'
export interface PublishScope { repository: string; publisher: string; pageId: string }

export function publishKey(repository: string, publisher: string, pageId: string): string | null {
  const email = publisher.trim().toLowerCase()
  if (!repository || repository.length > 1024 || !/^\S+$/.test(repository) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(pageId)) return null
  return JSON.stringify([repository, email, pageId])
}

export function parsePublishKey(key: string): PublishScope | null {
  try {
    const value: unknown = JSON.parse(key)
    if (!Array.isArray(value) || value.length !== 3 || typeof value[0] !== 'string' || typeof value[1] !== 'string' || typeof value[2] !== 'string') return null
    const [repository, publisher, pageId] = value
    return publishKey(repository, publisher, pageId) === key ? { repository, publisher, pageId } : null
  } catch { return null }
}
export const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/
const iso = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined
export const offSchedule = (now: Date): PublishSchedule => ({ mode: 'off', day: 1, time: '07:00', setAt: now.toISOString() })

// Legacy page-only keys cannot identify the source repository or publisher and are ignored.
export function parseSchedules(text: string | null): Record<string, PublishSchedule> {
  let raw: unknown
  try { raw = JSON.parse(text ?? '{}') } catch { return {} }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, PublishSchedule> = {}
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!parsePublishKey(id) || !value || typeof value !== 'object') continue
    const entry = value as Record<string, unknown>
    const mode = entry.mode === 'daily' || entry.mode === 'weekly' ? entry.mode : 'off'
    const setAt = iso(entry.setAt)
    if (!setAt || typeof entry.time !== 'string' || !timePattern.test(entry.time)) continue
    const day = Number.isInteger(entry.day) && (entry.day as number) >= 0 && (entry.day as number) <= 6 ? entry.day as number : 1
    out[id] = { mode, day, time: entry.time, setAt, ...(iso(entry.lastRun) ? { lastRun: iso(entry.lastRun) } : {}), ...(typeof entry.lastOk === 'boolean' ? { lastOk: entry.lastOk } : {}), ...(typeof entry.lastText === 'string' ? { lastText: entry.lastText.slice(0, 500) } : {}) }
  }
  return out
}

// The latest scheduled moment at or before now (local time), or null when off.
export function lastOccurrence(schedule: Pick<PublishSchedule, 'mode' | 'day' | 'time'>, now: Date): Date | null {
  const match = timePattern.exec(schedule.time)
  if (schedule.mode === 'off' || !match) return null
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(match[1]), Number(match[2]))
  if (schedule.mode === 'daily') { if (at > now) at.setDate(at.getDate() - 1); return at }
  at.setDate(at.getDate() - ((at.getDay() - schedule.day + 7) % 7))
  if (at > now) at.setDate(at.getDate() - 7)
  return at
}
// The next scheduled moment after now (local time), or null when off.
export function nextOccurrence(schedule: Pick<PublishSchedule, 'mode' | 'day' | 'time'>, now: Date): Date | null {
  const last = lastOccurrence(schedule, now)
  if (!last) return null
  const next = new Date(last)
  next.setDate(next.getDate() + (schedule.mode === 'daily' ? 1 : 7))
  return next
}
// Due: a scheduled moment has passed since the schedule was set and since the last run (a missed one included).
export function isDue(schedule: PublishSchedule, now: Date) {
  const last = lastOccurrence(schedule, now)
  if (!last || last.getTime() <= Date.parse(schedule.setAt)) return false
  return !schedule.lastRun || Date.parse(schedule.lastRun) < last.getTime()
}
export const scheduleText = (schedule: Pick<PublishSchedule, 'mode' | 'day' | 'time'>) => schedule.mode === 'off' ? 'Off' : schedule.mode === 'daily' ? `Daily at ${schedule.time}` : `Weekly on ${dayNames[schedule.day]} at ${schedule.time}`
