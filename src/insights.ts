import type { PersonMonth } from './dashboard.ts'
import { bandOf, defaultBands, groupBy, type Bands } from './dashboard.ts'

// Dashboard insights computed from the person-month rows (dashboard.ts): what the Time Writing data says beyond the
// totals — where the current month is heading, how reliable plans are, which streams gain or lose effort, where the
// team depends on one person, which months look unusual, and one health score that sums it up. Every rule is stated
// next to its function and repeated in the Dashboard's Info texts; thresholds are deliberately simple and documented.

const round = (value: number) => Math.round(value * 100) / 100
const pct = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 }

// Share of a month's weekdays (Mon–Fri) that have passed by today, the day itself included; 1 for a past month, 0 for a
// future one. Holidays and absence are already netted out of capacity, so weekdays are enough for a run rate.
export function elapsedShare(month: string, today: string) {
  if (today.slice(0, 7) > month) return 1
  if (today.slice(0, 7) < month) return 0
  const [year, index] = month.split('-').map(Number), last = new Date(Date.UTC(year, index, 0)).getUTCDate(), day = Number(today.slice(8, 10))
  const weekday = (date: number) => { const value = new Date(Date.UTC(year, index - 1, date)).getUTCDay(); return value > 0 && value < 6 }
  const all = Array.from({ length: last }, (_, offset) => offset + 1).filter(weekday)
  const gone = all.filter((date) => date <= day)
  return all.length ? gone.length / all.length : 1
}

// Month-end forecast for one month (meant for the current, partial month): the actual hours so far, scaled by the
// share of the month's weekdays gone, project where each person lands. On track = within ±10% of the plan; ahead and
// behind are beyond that; over capacity = the projection reaches the overloaded threshold (Settings → Capacity);
// no data = nothing recorded yet.
export type ForecastStatus = 'ahead' | 'on-track' | 'behind' | 'over-capacity' | 'no-data'
export interface Forecast { person: string; role?: string; plan: number; capacity: number; actual: number; projected: number; vsPlan: number; status: ForecastStatus }
export function monthForecast(rows: PersonMonth[], month: string, today: string, bands: Bands = defaultBands) {
  const share = elapsedShare(month, today)
  const people: Forecast[] = rows.filter((row) => row.month === month).map((row) => {
    const projected = share > 0 ? round(row.actual / share) : 0
    const vsPlan = round(projected - row.plan)
    const status: ForecastStatus = row.actual <= 0 ? 'no-data' : row.capacity > 0 && bandOf(projected / row.capacity * 100, bands) === 'over' ? 'over-capacity' : row.plan > 0 && Math.abs(vsPlan) / row.plan <= 0.1 ? 'on-track' : vsPlan > 0 ? 'ahead' : 'behind'
    return { person: row.person, role: row.role, plan: row.plan, capacity: row.capacity, actual: row.actual, projected, vsPlan, status }
  }).sort((a, b) => Math.abs(b.vsPlan) - Math.abs(a.vsPlan))
  const plan = people.reduce((sum, entry) => sum + entry.plan, 0), projected = people.reduce((sum, entry) => sum + entry.projected, 0), actual = people.reduce((sum, entry) => sum + entry.actual, 0)
  const counts = Object.fromEntries((['ahead', 'on-track', 'behind', 'over-capacity', 'no-data'] as ForecastStatus[]).map((status) => [status, people.filter((entry) => entry.status === status).length])) as Record<ForecastStatus, number>
  return { month, share: Math.round(share * 100), plan: round(plan), actual: round(actual), projected: round(projected), vsPlan: round(projected - plan), people, counts }
}

// Plan accuracy over the elapsed months: per person the error (sum of |actual − plan| over sum of plan, in %) and the
// bias (actual − plan over plan, in %: negative = less recorded than planned, positive = more). Verdicts: reliable at
// an error of 15% or less; under-records at a bias of −20% or lower; over-runs at +20% or higher; else uneven.
export type AccuracyVerdict = 'reliable' | 'under-records' | 'over-runs' | 'uneven' | 'no-plan'
export interface Accuracy { person: string; role?: string; months: number; plan: number; actual: number; error: number | null; bias: number | null; verdict: AccuracyVerdict }
function accuracyOf(rows: PersonMonth[]) {
  const plan = rows.reduce((sum, row) => sum + row.plan, 0), actual = rows.reduce((sum, row) => sum + row.actual, 0)
  const error = pct(rows.reduce((sum, row) => sum + Math.abs(row.actual - row.plan), 0), plan), bias = pct(actual - plan, plan)
  const verdict: AccuracyVerdict = error == null || bias == null ? 'no-plan' : error <= 15 ? 'reliable' : bias <= -20 ? 'under-records' : bias >= 20 ? 'over-runs' : 'uneven'
  return { plan: round(plan), actual: round(actual), error, bias, verdict }
}
export function planAccuracy(rows: PersonMonth[]) {
  const elapsed = rows.filter((row) => row.status === 'elapsed' && (row.plan > 0 || row.actual > 0))
  const people: Accuracy[] = groupBy(elapsed, (row) => row.person).map((group) => ({ person: group.name, role: group.rows[0]?.role, months: group.rows.length, ...accuracyOf(group.rows) }))
    .sort((a, b) => (b.error ?? -1) - (a.error ?? -1))
  const byMonth = groupBy(elapsed, (row) => row.month).map((group) => ({ month: group.name, ...accuracyOf(group.rows) })).sort((a, b) => a.month.localeCompare(b.month))
  return { team: accuracyOf(elapsed), people, byMonth, months: new Set(elapsed.map((row) => row.month)).size }
}

// Stream momentum: for each stream (Epic), the average actual hours per month over the latest up to 3 elapsed months
// against the up to 3 before them, and its share of all actual hours in each window. Rising / falling at a change of
// 20% or more (and at least 8 hours); new = hours only in the recent window; steady otherwise.
export type Momentum = 'rising' | 'falling' | 'steady' | 'new' | 'gone'
export interface StreamMomentum { key: string; title: string; recent: number; earlier: number; change: number | null; shareRecent: number | null; shareEarlier: number | null; trend: Momentum; people: number }
export function streamMomentum(rows: PersonMonth[], months: string[]): { streams: StreamMomentum[]; recentMonths: string[]; earlierMonths: string[] } {
  const elapsed = months.filter((month) => rows.some((row) => row.month === month && row.status === 'elapsed'))
  const recentMonths = elapsed.slice(-3), earlierMonths = elapsed.slice(Math.max(0, elapsed.length - 6), Math.max(0, elapsed.length - 3))
  const window = (set: string[]) => {
    const totals = new Map<string, { title: string; actual: number; people: Set<string> }>()
    let all = 0
    for (const row of rows.filter((entry) => set.includes(entry.month))) for (const stream of row.streams) {
      const entry = totals.get(stream.key) ?? { title: stream.title, actual: 0, people: new Set<string>() }
      entry.actual += stream.actual; if (stream.actual > 0) entry.people.add(row.person); totals.set(stream.key, entry); all += stream.actual
    }
    return { totals, all, months: Math.max(1, set.length) }
  }
  const recent = window(recentMonths), earlier = window(earlierMonths)
  const keys = new Set([...recent.totals.keys(), ...earlier.totals.keys()])
  const streams: StreamMomentum[] = [...keys].map((key) => {
    const now = recent.totals.get(key), before = earlier.totals.get(key)
    const recentAvg = round((now?.actual ?? 0) / recent.months), earlierAvg = round((before?.actual ?? 0) / earlier.months)
    const change = earlierMonths.length && earlierAvg > 0 ? pct(recentAvg - earlierAvg, earlierAvg) : null
    const trend: Momentum = !earlierMonths.length ? 'steady' : earlierAvg === 0 && recentAvg > 0 ? 'new' : recentAvg === 0 && earlierAvg > 0 ? 'gone' : change != null && Math.abs(recentAvg - earlierAvg) >= 8 && change >= 20 ? 'rising' : change != null && Math.abs(recentAvg - earlierAvg) >= 8 && change <= -20 ? 'falling' : 'steady'
    return { key, title: now?.title ?? before?.title ?? key, recent: recentAvg, earlier: earlierAvg, change, shareRecent: pct(now?.actual ?? 0, recent.all), shareEarlier: earlierMonths.length ? pct(before?.actual ?? 0, earlier.all) : null, trend, people: now?.people.size ?? 0 }
  }).sort((a, b) => b.recent - a.recent)
  return { streams, recentMonths, earlierMonths }
}

// Resilience: over the elapsed months, a stream rests on one person when that person recorded 80% or more of its
// hours (a single point of failure); a person is a specialist when 90% or more of their hours went to one stream.
export interface StreamResilience { key: string; title: string; actual: number; people: number; top: string; topShare: number; singlePoint: boolean }
export interface PersonFocus { person: string; role?: string; actual: number; streams: number; main: string; mainShare: number; specialist: boolean }
export function resilience(rows: PersonMonth[]) {
  const elapsed = rows.filter((row) => row.status === 'elapsed')
  const byStream = new Map<string, { title: string; actual: number; perPerson: Map<string, number> }>()
  const byPerson = new Map<string, { role?: string; actual: number; perStream: Map<string, { title: string; actual: number }> }>()
  for (const row of elapsed) for (const stream of row.streams) {
    if (stream.actual <= 0) continue
    const entry = byStream.get(stream.key) ?? { title: stream.title, actual: 0, perPerson: new Map<string, number>() }
    entry.actual += stream.actual; entry.perPerson.set(row.person, (entry.perPerson.get(row.person) ?? 0) + stream.actual); byStream.set(stream.key, entry)
    const person = byPerson.get(row.person) ?? { role: row.role, actual: 0, perStream: new Map<string, { title: string; actual: number }>() }
    person.actual += stream.actual; const own = person.perStream.get(stream.key) ?? { title: stream.title, actual: 0 }; own.actual += stream.actual; person.perStream.set(stream.key, own); byPerson.set(row.person, person)
  }
  const streams: StreamResilience[] = [...byStream].map(([key, entry]) => {
    const [top, hours] = [...entry.perPerson].sort((a, b) => b[1] - a[1])[0]
    const topShare = pct(hours, entry.actual) ?? 0
    return { key, title: entry.title, actual: round(entry.actual), people: entry.perPerson.size, top, topShare, singlePoint: topShare >= 80 }
  }).sort((a, b) => b.topShare - a.topShare || b.actual - a.actual)
  const people: PersonFocus[] = [...byPerson].map(([person, entry]) => {
    const [, main] = [...entry.perStream].sort((a, b) => b[1].actual - a[1].actual)[0]
    const mainShare = pct(main.actual, entry.actual) ?? 0
    return { person, role: entry.role, actual: round(entry.actual), streams: entry.perStream.size, main: main.title, mainShare, specialist: mainShare >= 90 }
  }).sort((a, b) => b.mainShare - a.mainShare)
  return { streams, people, singlePoints: streams.filter((stream) => stream.singlePoint).length, specialists: people.filter((person) => person.specialist).length }
}

// Unusual months: a person's recorded hours in an elapsed month that differ from the median of their other elapsed
// months by 50% or more and by at least 8 hours; needs at least 3 elapsed months with data for that person.
export interface Anomaly { person: string; month: string; actual: number; typical: number; change: number; kind: 'spike' | 'drop' }
export function anomalies(rows: PersonMonth[]): Anomaly[] {
  const found: Anomaly[] = []
  for (const group of groupBy(rows.filter((row) => row.status === 'elapsed'), (row) => row.person)) {
    if (group.rows.length < 3) continue
    for (const row of group.rows) {
      const typical = median(group.rows.filter((other) => other !== row).map((other) => other.actual))
      if (typical <= 0 && row.actual <= 0) continue
      const change = typical > 0 ? pct(row.actual - typical, typical) : 100
      if (change == null || Math.abs(row.actual - typical) < 8 || Math.abs(change) < 50) continue
      found.push({ person: row.person, month: row.month, actual: row.actual, typical: round(typical), change, kind: change > 0 ? 'spike' : 'drop' })
    }
  }
  return found.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
}

// Health score, 0–100 per month and overall: the average of the components that have data.
// - Balance: share of people whose planned utilization is in the balanced band (Settings → Capacity: at least
//   availableBelow %, below overloadedAt %).
// - Recording (elapsed months): share of planned month Tasks with a recorded actual.
// - Resilience: share of streams not resting on one person (elapsed months, see resilience()).
export interface Health { month?: string; balance: number | null; recording: number | null; resilience: number | null; score: number | null }
function healthOf(rows: PersonMonth[], streams: StreamResilience[], bands: Bands): Omit<Health, 'month'> {
  const planned = rows.filter((row) => row.capacity > 0 && row.plan > 0)
  const balance = planned.length ? pct(planned.filter((row) => bandOf(row.plan / row.capacity * 100, bands) === 'balanced').length, planned.length) : null
  const elapsed = rows.filter((row) => row.status === 'elapsed')
  const lines = elapsed.reduce((sum, row) => sum + row.planLines, 0)
  const recording = lines ? pct(lines - elapsed.reduce((sum, row) => sum + row.blankActuals, 0), lines) : null
  const strength = streams.length ? pct(streams.filter((stream) => !stream.singlePoint).length, streams.length) : null
  const parts = [balance, recording, strength].filter((value): value is number => value != null)
  return { balance, recording, resilience: strength, score: parts.length ? Math.round(parts.reduce((sum, value) => sum + value, 0) / parts.length) : null }
}
export function healthScore(rows: PersonMonth[], months: string[], bands: Bands = defaultBands): { overall: Health; byMonth: Health[] } {
  const overall = healthOf(rows, resilience(rows).streams, bands)
  const byMonth = months.map((month) => { const entries = rows.filter((row) => row.month === month); return { month, ...healthOf(entries, resilience(entries).streams, bands) } })
  return { overall, byMonth }
}
