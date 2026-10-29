import type { AzureWorkItem } from './domain.ts'
import { bandOf, totals, type Bands, type PersonMonth } from './dashboard.ts'
import type { ReleaseBaselineRow } from './baseline.ts'
import { isFinished, sameMonthLastYear } from './monthlyPack.ts'
import { previousMonth } from './pulseCheck.ts'
import { resilience } from './insights.ts'
import { formatHours, monthName } from './format.ts'

// Insights workspace (WSP): a separate page beside the Dashboard, built like the Overview and "AI Insights" mock-ups
// but from rules with evidence, not a language model. KPI tiles with their change against the previous month, the
// exception queue (releases over their baseline, releases without a baseline, people planned over capacity), the
// timeline health of the Features due in the coming months, and insight cards that each name their rule, their
// filters and the rows behind them — any card can be queued for the Monthly pack. The Dashboard is unchanged.

// ---- KPI deltas ----
export interface Delta { value: number | null; previous: number | null; delta: number | null }
export const delta = (value: number | null, previous: number | null): Delta => ({ value, previous, delta: value != null && previous != null ? Math.round((value - previous) * 10) / 10 : null })
export const signedText = (value: number | null, unit = '') => value == null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}${unit}`
const round1 = (value: number) => Math.round(value * 10) / 10
export const planUtilOf = (row: Pick<PersonMonth, 'plan' | 'capacity'>) => row.capacity > 0 ? round1(row.plan / row.capacity * 100) : null

export function monthUtilization(rows: PersonMonth[], month: string) {
  const entries = rows.filter((row) => row.month === month)
  const sum = totals(entries)
  return { plan: sum.planUtil, actual: sum.actualUtil, people: sum.people, planHours: sum.plan, actualHours: sum.actual, capacity: sum.capacity, status: entries[0]?.status }
}

// ---- Data completeness ----
// The share of the month's planned Tasks (Original Estimate > 0, outside absence, shared time and NPRA) that carry a
// recorded value; a future month has nothing to record yet. People without a region or role are listed as unmapped.
export interface Completeness { percent: number | null; planLines: number; blankActuals: number; unmapped: string[] }
export function completeness(rows: PersonMonth[], month: string): Completeness {
  const entries = rows.filter((row) => row.month === month)
  const recordable = entries.filter((row) => row.status !== 'future')
  const planLines = recordable.reduce((sum, row) => sum + row.planLines, 0), blankActuals = recordable.reduce((sum, row) => sum + row.blankActuals, 0)
  const unmapped = [...new Set(entries.filter((row) => !row.region || !row.role).map((row) => row.person))].sort((a, b) => a.localeCompare(b))
  return { percent: planLines ? round1((1 - blankActuals / planLines) * 100) : null, planLines, blankActuals, unmapped }
}

// ---- Exception queue ----
export type ExceptionKind = 'over-baseline' | 'missing-baseline' | 'capacity-risk'
export const exceptionKinds: Record<ExceptionKind, string> = { 'over-baseline': 'Over 25% baseline', 'missing-baseline': 'Missing baseline', 'capacity-risk': 'Capacity risk' }
export type Severity = 'high' | 'medium'
export interface ExceptionRow { key: string; kind: ExceptionKind; title: string; stream: string; region: string; owner: string; impact: string; impactValue: number | null; severity: Severity; targetDate?: string; url?: string }
export interface QueueInput { baselines: ReleaseBaselineRow[]; rows: PersonMonth[]; month: string; bands: Bands; threshold?: number; regionOf?: (person: string) => string | undefined }
const pctOver = (actual: number, baseline: number) => Math.round((actual / baseline - 1) * 100)
// Over 25% baseline: booked hours above the current baseline by more than the threshold (high at twice it). Missing
// baseline: an open Feature under a stream with a rule but no scope. Capacity risk: a person planned at or above the
// overloaded band in the month (high at 20 points above it). High first, then baseline, capacity, missing, then by impact.
export function exceptionQueue({ baselines, rows, month, bands, threshold = 25, regionOf = () => undefined }: QueueInput): ExceptionRow[] {
  const queue: ExceptionRow[] = []
  for (const row of baselines) {
    if (row.current && row.current.total > 0 && row.actual > row.current.total * (1 + threshold / 100)) {
      const over = pctOver(row.actual, row.current.total)
      queue.push({ key: `over:${row.feature.key}`, kind: 'over-baseline', title: row.feature.title, stream: row.stream, region: regionOf(row.feature.assignedTo) ?? '', owner: row.feature.assignedTo, impact: `+${over}%`, impactValue: over, severity: over >= threshold * 2 ? 'high' : 'medium', targetDate: row.feature.targetDate, url: row.feature.url })
    } else if (!row.scope && !isFinished(row.feature)) {
      queue.push({ key: `missing:${row.feature.key}`, kind: 'missing-baseline', title: row.feature.title, stream: row.stream, region: regionOf(row.feature.assignedTo) ?? '', owner: row.feature.assignedTo, impact: 'n/a', impactValue: null, severity: 'medium', targetDate: row.feature.targetDate, url: row.feature.url })
    }
  }
  for (const row of rows.filter((entry) => entry.month === month)) {
    const util = planUtilOf(row)
    if (util == null || bandOf(util, bands) !== 'over') continue
    const top = [...row.streams].sort((a, b) => b.plan - a.plan)[0]
    queue.push({ key: `capacity:${row.person}`, kind: 'capacity-risk', title: row.person, stream: top?.title ?? '—', region: row.region ?? '', owner: row.person, impact: `${util.toFixed(0)}% planned`, impactValue: util, severity: util >= bands.overloadedAt + 20 ? 'high' : 'medium' })
  }
  const rank: Record<Severity, number> = { high: 0, medium: 1 }, order: Record<ExceptionKind, number> = { 'over-baseline': 0, 'capacity-risk': 1, 'missing-baseline': 2 }
  return queue.sort((a, b) => rank[a.severity] - rank[b.severity] || order[a.kind] - order[b.kind] || (b.impactValue ?? -1) - (a.impactValue ?? -1) || a.title.localeCompare(b.title))
}

// ---- Timeline health ----
// Features (not Removed) with a Target Date from the first day of the current month to the horizon, per Epic:
// completed = finished state; overdue = open with the date gone; at risk = open and due within riskDays; the rest
// planned. Features without a date are not on the timeline.
export type TimelineStatus = 'completed' | 'overdue' | 'at-risk' | 'planned'
export interface TimelineFeature { feature: AzureWorkItem; stream: string; date: string; status: TimelineStatus }
export interface TimelineStream { name: string; planned: number; completed: number; atRisk: number; overdue: number }
export interface Timeline { streams: TimelineStream[]; totals: TimelineStream; features: TimelineFeature[]; from: string; to: string }
const addDays = (date: string, days: number) => { const at = new Date(`${date}T00:00:00Z`); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10) }
const addMonths = (date: string, months: number) => { const at = new Date(`${date}T00:00:00Z`); at.setUTCMonth(at.getUTCMonth() + months); return at.toISOString().slice(0, 10) }
export function timelineHealth(items: AzureWorkItem[], today: string, horizonMonths = 6, riskDays = 30): Timeline {
  const byId = new Map(items.map((item) => [item.id, item]))
  const epicOf = (item: AzureWorkItem) => { const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { if (current.workItemType === 'Epic') return current; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return undefined }
  const from = `${today.slice(0, 7)}-01`, to = addMonths(today, horizonMonths), risk = addDays(today, riskDays)
  const features: TimelineFeature[] = []
  for (const item of items) {
    if (item.workItemType !== 'Feature' || item.state.trim().toLowerCase() === 'removed' || !item.targetDate) continue
    const date = item.targetDate.slice(0, 10)
    if (date < from || date > to) continue
    const status: TimelineStatus = isFinished(item) ? 'completed' : date < today ? 'overdue' : date <= risk ? 'at-risk' : 'planned'
    features.push({ feature: item, stream: epicOf(item)?.title ?? 'No Epic', date, status })
  }
  features.sort((a, b) => a.date.localeCompare(b.date) || a.feature.title.localeCompare(b.feature.title))
  const empty = (name: string): TimelineStream => ({ name, planned: 0, completed: 0, atRisk: 0, overdue: 0 })
  const byStream = new Map<string, TimelineStream>()
  const count = (entry: TimelineStream, status: TimelineStatus) => { entry.planned++; if (status === 'completed') entry.completed++; else if (status === 'overdue') entry.overdue++; else if (status === 'at-risk') entry.atRisk++ }
  const sum = empty('All streams')
  for (const entry of features) { const stream = byStream.get(entry.stream) ?? empty(entry.stream); count(stream, entry.status); byStream.set(entry.stream, stream); count(sum, entry.status) }
  return { streams: [...byStream.values()].sort((a, b) => b.planned - a.planned || a.name.localeCompare(b.name)), totals: sum, features, from, to }
}

// ---- Cumulative releases, this year against the prior year ----
export const cumulative = (values: number[]) => values.reduce<number[]>((list, value) => [...list, (list[list.length - 1] ?? 0) + value], [])

// ---- Insight cards ----
export type InsightTone = 'ok' | 'warning' | 'danger' | 'info'
export interface Evidence { columns: string[]; rows: string[][] }
export interface InsightBar { label: string; value: number; text: string }
export interface InsightCard { id: string; tone: InsightTone; title: string; text: string; filters: string; quality: string; evidence: Evidence; barsTitle: string; bars: InsightBar[]; packLine: string }
export interface ReleaseSnapshot { month: string; streams: { name: string; releases: number; notSetUp?: boolean }[] }
export interface InsightInput { month: string; rows: PersonMonth[]; bands: Bands; baselines: ReleaseBaselineRow[]; releases: { now: ReleaseSnapshot; previous: ReleaseSnapshot; lastYear?: ReleaseSnapshot }; timeline: Timeline; filters: string; threshold?: number }
const short = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
const pct = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`
const plural = (count: number, noun: string, many = `${noun}s`) => `${count} ${count === 1 ? noun : many}`
const releasesOf = (snapshot: ReleaseSnapshot | undefined) => snapshot ? snapshot.streams.filter((stream) => !stream.notSetUp).reduce((sum, stream) => sum + stream.releases, 0) : null

export function insightCards(input: InsightInput): InsightCard[] {
  const { month, rows, bands, baselines, releases, timeline, filters, threshold = 25 } = input
  const previous = previousMonth(month), lastYear = sameMonthLastYear(month)
  const cards: InsightCard[] = []
  const inMonth = rows.filter((row) => row.month === month)
  const status = inMonth[0]?.status

  // Utilisation against the previous month and the same month last year.
  const now = monthUtilization(rows, month), before = monthUtilization(rows, previous), year = monthUtilization(rows, lastYear)
  if (now.plan == null) cards.push({ id: 'utilization', tone: 'info', title: `No Time Writing plan for ${monthName(month)}`, text: 'No planned hours are booked for the month with the current filters, so utilisation cannot be compared.', filters, quality: 'Checked: month Tasks with an Original Estimate', evidence: { columns: [], rows: [] }, barsTitle: '', bars: [], packLine: '' })
  else {
    const vsPrevious = delta(now.plan, before.plan).delta, vsYear = delta(now.plan, year.plan).delta
    const text = `Planned utilization is ${pct(now.plan)} in ${short(month)}${vsPrevious == null ? '' : `, ${signedText(vsPrevious, ' pp')} versus ${short(previous)}`}${vsYear == null ? '' : `, ${signedText(vsYear, ' pp')} versus ${short(lastYear)}`}; ${formatHours(now.planHours)}h planned against ${formatHours(now.capacity)}h capacity for ${plural(now.people, 'person', 'people')}.`
    const band = bandOf(now.plan, bands)
    cards.push({
      id: 'utilization', tone: band === 'over' ? 'danger' : band === 'spare' ? 'warning' : 'ok', title: `Planned utilization ${vsPrevious == null ? 'this month' : vsPrevious > 0 ? 'rose' : vsPrevious < 0 ? 'fell' : 'held'}${vsPrevious == null ? '' : ` ${Math.abs(vsPrevious)} pp versus the previous month`}`, text, filters,
      quality: `Checked: ${plural(now.people, 'person', 'people')}, ${formatHours(now.capacity)}h capacity, bands ${bands.availableBelow}–${bands.overloadedAt}% from Settings → Capacity`,
      evidence: { columns: ['Team member', 'Region', 'Role', 'Planned h', 'Capacity h', 'Planned utilization'], rows: [...inMonth].sort((a, b) => (planUtilOf(b) ?? -1) - (planUtilOf(a) ?? -1)).map((row) => [row.person, row.region ?? '—', row.role ?? '—', formatHours(row.plan), formatHours(row.capacity), pct(planUtilOf(row))]) },
      barsTitle: 'Planned utilization', bars: [[lastYear, year.plan], [previous, before.plan], [month, now.plan]].filter((entry): entry is [string, number] => entry[1] != null).map(([at, value]) => ({ label: short(at), value, text: pct(value) })),
      packLine: text,
    })
  }

  // People planned over capacity.
  const over = inMonth.filter((row) => { const util = planUtilOf(row); return util != null && bandOf(util, bands) === 'over' }).sort((a, b) => (planUtilOf(b) ?? 0) - (planUtilOf(a) ?? 0))
  if (inMonth.length) cards.push({
    id: 'overload', tone: over.length ? 'danger' : 'ok', title: over.length ? `${plural(over.length, 'team member')} planned over capacity` : 'No one is planned over capacity',
    text: over.length ? `${over.map((row) => `${row.person} (${pct(planUtilOf(row))})`).join(', ')} ${over.length === 1 ? 'is' : 'are'} planned at or above ${bands.overloadedAt}% of capacity in ${short(month)}.` : `Nobody is planned at or above ${bands.overloadedAt}% of capacity in ${short(month)} with the current filters.`,
    filters, quality: `Checked: ${plural(inMonth.length, 'person', 'people')} with a capacity in the month`,
    evidence: { columns: ['Team member', 'Region', 'Role', 'Planned h', 'Capacity h', 'Planned utilization', 'Main stream'], rows: over.map((row) => [row.person, row.region ?? '—', row.role ?? '—', formatHours(row.plan), formatHours(row.capacity), pct(planUtilOf(row)), [...row.streams].sort((a, b) => b.plan - a.plan)[0]?.title ?? '—']) },
    barsTitle: 'Planned utilization of the people over capacity', bars: over.slice(0, 6).map((row) => ({ label: row.person, value: planUtilOf(row) ?? 0, text: pct(planUtilOf(row)) })),
    packLine: over.length ? `Overload: ${over.map((row) => `${row.person} ${pct(planUtilOf(row))}`).join(', ')} planned over capacity in ${short(month)}.` : '',
  })

  // Recorded hours missing on planned Tasks (elapsed and partial months).
  if (status && status !== 'future') {
    const gaps = inMonth.filter((row) => row.blankActuals > 0).sort((a, b) => b.blankActuals - a.blankActuals)
    const done = completeness(rows, month)
    cards.push({
      id: 'incomplete', tone: gaps.length ? 'warning' : 'ok', title: gaps.length ? `Actual hours are incomplete for ${plural(gaps.length, 'team member')}` : 'Every planned Task of the month has recorded hours',
      text: gaps.length ? `${done.blankActuals} of ${done.planLines} planned Tasks in ${short(month)} have no Completed Work yet (${pct(done.percent)} complete): ${gaps.map((row) => `${row.person} ${row.blankActuals}/${row.planLines}`).join(', ')}. Missing actuals understate progress and the forecast.` : `All ${done.planLines} planned Tasks in ${short(month)} carry a recorded value.`,
      filters, quality: `Checked: ${done.planLines} month Tasks with an Original Estimate (absence, shared time and NPRA left out)`,
      evidence: { columns: ['Team member', 'Planned Tasks', 'Without actuals', 'Complete', 'Planned h', 'Recorded h'], rows: gaps.map((row) => [row.person, String(row.planLines), String(row.blankActuals), row.planLines ? `${Math.round((1 - row.blankActuals / row.planLines) * 100)}%` : '—', formatHours(row.plan), formatHours(row.actual)]) },
      barsTitle: 'Share of planned Tasks with actuals', bars: gaps.slice(0, 6).map((row) => ({ label: row.person, value: row.planLines ? Math.round((1 - row.blankActuals / row.planLines) * 100) : 0, text: row.planLines ? `${Math.round((1 - row.blankActuals / row.planLines) * 100)}%` : '—' })),
      packLine: gaps.length ? `Time Writing: actual hours incomplete for ${plural(gaps.length, 'team member')} in ${short(month)} (${pct(done.percent)} of planned Tasks recorded).` : '',
    })
  }

  // Releases over their baseline.
  const scoped = baselines.filter((row) => row.current && row.current.total > 0)
  const exceed = scoped.filter((row) => row.actual > row.current!.total * (1 + threshold / 100)).sort((a, b) => pctOver(b.actual, b.current!.total) - pctOver(a.actual, a.current!.total))
  cards.push({
    id: 'baseline', tone: !scoped.length ? 'info' : exceed.length ? 'danger' : 'ok', title: !scoped.length ? 'No release has a baseline scoped yet' : exceed.length ? `${plural(exceed.length, 'release')} exceed${exceed.length === 1 ? 's' : ''} the baseline by more than ${threshold}%` : `No release exceeds its baseline by more than ${threshold}%`,
    text: !scoped.length ? 'Baselines need estimation rules and a scope per release (Baselines page); until then booked hours cannot be compared.' : exceed.length ? `${exceed.map((row) => `${row.feature.title} (+${pctOver(row.actual, row.current!.total)}%)`).join(', ')}: booked hours above the baseline from the rules and the current scope, usually scope growth or rework.` : `All ${scoped.length} scoped releases are within ${threshold}% of their baseline.`,
    filters: 'Filters: none (baselines are per release)', quality: `Checked: ${scoped.length} scoped of ${baselines.length} releases under a rule`,
    evidence: { columns: ['Release', 'Stream', 'Baseline h', 'Booked h', 'Variance', 'Owner'], rows: exceed.map((row) => [row.feature.title, row.stream, formatHours(row.current!.total), formatHours(row.actual), `+${pctOver(row.actual, row.current!.total)}%`, row.feature.assignedTo || '—']) },
    barsTitle: 'Variance against the baseline', bars: exceed.slice(0, 6).map((row) => ({ label: row.feature.title, value: pctOver(row.actual, row.current!.total), text: `+${pctOver(row.actual, row.current!.total)}%` })),
    packLine: exceed.length ? `Baseline: ${plural(exceed.length, 'release')} over ${threshold}% above baseline (${exceed.map((row) => row.feature.title).join(', ')}).` : '',
  })

  // Releases completed against the previous month and the same month last year.
  const nowCount = releasesOf(releases.now) ?? 0, previousCount = releasesOf(releases.previous) ?? 0, yearCount = releasesOf(releases.lastYear)
  const streamsNow = releases.now.streams.filter((stream) => !stream.notSetUp)
  cards.push({
    id: 'releases', tone: nowCount >= previousCount ? 'ok' : 'warning', title: `${plural(nowCount, 'release')} completed in ${short(month)}`,
    text: `${nowCount} completed in ${short(month)} against ${previousCount} in ${short(previous)}${yearCount == null ? '' : ` and ${yearCount} in ${short(lastYear)}`}${streamsNow.length ? `: ${streamsNow.map((stream) => `${stream.name} ${stream.releases}`).join(', ')}` : ''}.`,
    filters: 'Filters: none (releases are per stream)', quality: `Checked: ${streamsNow.length} streams counted as in Pulse Check${releases.now.streams.length > streamsNow.length ? `, ${releases.now.streams.length - streamsNow.length} not set up` : ''}`,
    evidence: { columns: ['Stream', short(month), short(previous), ...(releases.lastYear ? [short(lastYear)] : [])], rows: releases.now.streams.map((stream) => [stream.name, stream.notSetUp ? 'not set up' : String(stream.releases), String(releases.previous.streams.find((entry) => entry.name === stream.name)?.releases ?? 0), ...(releases.lastYear ? [String(releases.lastYear.streams.find((entry) => entry.name === stream.name)?.releases ?? 0)] : [])]) },
    barsTitle: `Completed releases per stream, ${short(month)}`, bars: streamsNow.map((stream) => ({ label: stream.name, value: stream.releases, text: String(stream.releases) })),
    packLine: `Delivery: ${plural(nowCount, 'release')} completed in ${short(month)} (${short(previous)}: ${previousCount}${yearCount == null ? '' : `; ${short(lastYear)}: ${yearCount}`}).`,
  })

  // Streams resting on one person, over the elapsed months of the year to the month.
  const elapsed = rows.filter((row) => row.month <= month && row.month.slice(0, 4) === month.slice(0, 4) && row.status === 'elapsed')
  const strength = resilience(elapsed)
  if (strength.streams.length) {
    const single = strength.streams.filter((stream) => stream.singlePoint)
    cards.push({
      id: 'resilience', tone: single.length ? 'warning' : 'ok', title: single.length ? `${plural(single.length, 'stream')} rest${single.length === 1 ? 's' : ''} on one person` : 'No stream rests on one person',
      text: single.length ? `${single.map((stream) => `${stream.title} (${stream.top} ${stream.topShare}%)`).join(', ')}: one person recorded 80% or more of the stream's hours this year, so absence or attrition would stall it.` : 'Every stream with recorded hours this year has its hours spread over more than one person (nobody at 80% or more).',
      filters, quality: `Checked: ${strength.streams.length} streams with recorded hours in the elapsed months of ${month.slice(0, 4)}`,
      evidence: { columns: ['Stream', 'Recorded h', 'People', 'Main contributor', 'Share'], rows: strength.streams.map((stream) => [stream.title, formatHours(stream.actual), String(stream.people), stream.top, `${stream.topShare}%`]) },
      barsTitle: 'Share of the main contributor', bars: strength.streams.slice(0, 6).map((stream) => ({ label: stream.title, value: stream.topShare, text: `${stream.topShare}%` })),
      packLine: single.length ? `Resilience: ${single.map((stream) => `${stream.title} depends on ${stream.top}`).join(', ')}.` : '',
    })
  }

  // Features past or near their target date.
  const late = timeline.features.filter((entry) => entry.status === 'overdue'), soon = timeline.features.filter((entry) => entry.status === 'at-risk')
  if (timeline.features.length) cards.push({
    id: 'timeline', tone: late.length ? 'danger' : soon.length ? 'warning' : 'ok', title: late.length ? `${plural(late.length, 'Feature')} past the target date` : soon.length ? `${plural(soon.length, 'Feature')} due within 30 days` : 'No Feature is late or due within 30 days',
    text: `${late.length} of ${timeline.totals.planned} Features on the timeline ${late.length === 1 ? 'is' : 'are'} open past the target date and ${soon.length} ${soon.length === 1 ? 'is' : 'are'} open with a target date within 30 days${late.length ? `: ${late.map((entry) => `${entry.feature.title} (${entry.date})`).join(', ')}` : ''}.`,
    filters: 'Filters: none (timeline from Feature target dates)', quality: `Checked: ${timeline.totals.planned} Features with a Target Date from ${timeline.from} to ${timeline.to}`,
    evidence: { columns: ['Feature', 'Stream', 'Target date', 'State', 'Owner', 'Status'], rows: [...late, ...soon].map((entry) => [entry.feature.title, entry.stream, entry.date, entry.feature.state, entry.feature.assignedTo || '—', entry.status === 'overdue' ? 'Overdue' : 'At risk']) },
    barsTitle: 'Open Features late or due soon per stream', bars: timeline.streams.filter((stream) => stream.overdue + stream.atRisk > 0).slice(0, 6).map((stream) => ({ label: stream.name, value: stream.overdue + stream.atRisk, text: [stream.overdue && `${stream.overdue} overdue`, stream.atRisk && `${stream.atRisk} at risk`].filter(Boolean).join(', ') })),
    packLine: late.length || soon.length ? `Timeline: ${late.length} overdue, ${soon.length} due within 30 days (${[...late, ...soon].map((entry) => entry.feature.title).join(', ')}).` : '',
  })

  return cards
}

// The suggested questions of the mock-up answered by the sections that hold the evidence (no language model: the
// app runs without a backend and team data stays on the device).
export const questions: { id: string; text: string; target: 'queue' | 'queue:over-baseline' | 'card:utilization' | 'timeline' | 'card:incomplete' }[] = [
  { id: 'risks', text: 'What are the top risks to delivery?', target: 'queue' },
  { id: 'baseline', text: 'Which releases are most over baseline?', target: 'queue:over-baseline' },
  { id: 'utilization', text: 'How has utilization changed?', target: 'card:utilization' },
  { id: 'timeline', text: 'Which Features are at risk in the coming months?', target: 'timeline' },
  { id: 'actuals', text: 'Whose actual hours are incomplete?', target: 'card:incomplete' },
]
