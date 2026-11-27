// PIR-51…PIR-57 The executive figures of the PI Review Meeting (product owner, 26 Nov 2026), worked out at build time
// from the data the app already holds: the PI's dates (the iterations), the Features and their reviews (PIR-49: only a
// comment headed "Feature Review for <PI>" counts), the Time Writing month Tasks (hours and utilization through the
// Dashboard's own functions, dashboard.ts personMonths / totals — so the meeting always agrees with the Dashboard), the
// releases of the streams ticked in the Meeting presentation settings and the Features of those streams' Epics. A
// figure that cannot be worked out carries the reason (`why`) and the slide shows "—" with it; nothing is invented.
// Pure: the inputs are passed in; nothing here touches the DOM, Git or the network.
import { personMonths, totals } from './dashboard.ts'
import { defaultCapacitySettings, type CapacitySettings } from './capacity.ts'
import { commentsFrom, latestReviewFor, reviewSplit, type Discussion } from './piReview.ts'
import { piName } from './myWork.ts'
import { isLongRunning, longRunningOf, type EpicOrder, type MeetingSettings } from './piMeetingSettings.ts'
import type { PiFormSetup } from './piReviewSetup.ts'
import type { AzureIteration } from './azureRead.ts'
import type { AzureWorkItem } from './domain'

// The Feature as the executive slides need it (a subset of MeetingFeature, piMeeting.ts).
export interface ExecFeature { id: number; title: string; epic: string; epicId?: number; state: string; closedDate?: string; createdDate?: string; adhoc?: boolean; status: string; review?: { moveValue?: string; movePi: string } }

// ---- the PI's dates ----
// start / end: YYYY-MM-DD (UTC days, both included); sprints: the PI's dated child iterations, in date order.
export interface PiSpan { start: string; end: string; sprints: { name: string; start: string; end: string }[] }
const day = (value: string | undefined) => { const found = value?.slice(0, 10); return found && /^\d{4}-\d{2}-\d{2}$/.test(found) ? found : undefined }
const lower = (value: string) => value.trim().toLowerCase()
// The PI's dates from the iteration tree: its own start and finish, else the first Sprint's start and the last Sprint's
// finish. why: the reason when they cannot be read.
export function piSpanOf(iterations: readonly AzureIteration[] | null | undefined, pi: string): { span?: PiSpan; why: string } {
  if (!iterations?.length) return { why: 'The PI’s dates are not known: the iterations were not read from Azure DevOps.' }
  const name = lower(piName(pi))
  const nodes = iterations.filter((iteration) => lower(iteration.name || piName(iteration.path)) === name)
  if (!nodes.length) return { why: `The PI’s dates are not known: ${piName(pi)} is not in the iterations read.` }
  const under = (child: string) => nodes.some((node) => lower(child).startsWith(`${lower(node.path)}\\`))
  const sprints = iterations.filter((iteration) => under(iteration.path) && day(iteration.attributes?.startDate) && day(iteration.attributes?.finishDate))
    .map((iteration) => ({ name: iteration.name || piName(iteration.path), start: day(iteration.attributes!.startDate)!, end: day(iteration.attributes!.finishDate)! }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
  const own = nodes.find((node) => day(node.attributes?.startDate) && day(node.attributes?.finishDate))
  const start = own ? day(own.attributes!.startDate)! : sprints[0]?.start
  const end = own ? day(own.attributes!.finishDate)! : sprints.reduce<string | undefined>((last, sprint) => !last || sprint.end > last ? sprint.end : last, undefined)
  if (!start || !end || end < start) return { why: `The PI’s dates are not known: ${piName(pi)} and its Sprints have no start and finish dates in Azure DevOps.` }
  return { span: { start, end, sprints }, why: '' }
}
export const inSpan = (span: Pick<PiSpan, 'start' | 'end'>, date: string | undefined) => { const at = day(date); return Boolean(at && span.start <= at && at <= span.end) }
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000
export const spanDays = (span: Pick<PiSpan, 'start' | 'end'>) => dayNumber(span.end) - dayNumber(span.start) + 1
// PIR-55: the PI's months — each month belongs to the PI that holds its 15th day, so a month is counted for one PI only.
export function piMonths(span: Pick<PiSpan, 'start' | 'end'>): string[] {
  const months: string[] = []
  const at = new Date(`${span.start.slice(0, 7)}-01T00:00:00Z`)
  while (at.toISOString().slice(0, 7) <= span.end.slice(0, 7)) {
    const month = at.toISOString().slice(0, 7)
    if (inSpan(span, `${month}-15`)) months.push(month)
    at.setUTCMonth(at.getUTCMonth() + 1)
  }
  return months
}
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (month: string) => `${monthNames[Number(month.slice(5, 7)) - 1] ?? month.slice(5, 7)} ${month.slice(0, 4)}`

// ---- the Features: closed, carried forward, ad-hoc ----
export const isClosedState = (state: string) => ['closed', 'done'].includes(lower(state))
// PIR-51: Closed in the PI — state Closed or Done AND the Closed Date inside the PI's dates.
export const closedInPi = (feature: Pick<ExecFeature, 'state' | 'closedDate'>, span: Pick<PiSpan, 'start' | 'end'> | undefined) => Boolean(span && isClosedState(feature.state) && inSpan(span, feature.closedDate))
// PIR-51: Carried forward — the latest review headed for the PI says Move to next PI = Yes.
export const carriedForward = (feature: Pick<ExecFeature, 'status' | 'review'>) => feature.status === 'reviewed' && feature.review?.moveValue === 'Yes'

// ---- the Epics, in the chosen order (PIR-62) ----
export const noEpic = 'No Epic'
export interface EpicGroup<T> { key: string; name: string; epicId?: number; features: T[] }
// order id: by Epic ID ascending; features: most Features first (then by Epic ID). No Epic is always last.
export function epicGroups<T extends Pick<ExecFeature, 'epic' | 'epicId' | 'id'>>(features: readonly T[], order: EpicOrder): EpicGroup<T>[] {
  const groups = new Map<string, EpicGroup<T>>()
  for (const feature of [...features].sort((a, b) => a.id - b.id)) {
    const key = feature.epicId != null ? `#${feature.epicId}` : feature.epic ? `name:${feature.epic}` : ''
    const group = groups.get(key) ?? { key, name: feature.epic || noEpic, ...(feature.epicId != null ? { epicId: feature.epicId } : {}), features: [] }
    group.features.push(feature); groups.set(key, group)
  }
  const byId = (a: EpicGroup<T>, b: EpicGroup<T>) => (a.key ? 0 : 1) - (b.key ? 0 : 1) || (a.epicId ?? Infinity) - (b.epicId ?? Infinity) || a.name.localeCompare(b.name)
  return [...groups.values()].sort((a, b) => order === 'features' ? (a.key ? 0 : 1) - (b.key ? 0 : 1) || b.features.length - a.features.length || byId(a, b) : byId(a, b))
}
// An Epic's place in the chosen order, for lists ordered by Epic (No Epic last).
export function epicRank<T extends Pick<ExecFeature, 'epic' | 'epicId' | 'id'>>(features: readonly T[], order: EpicOrder) {
  const rank = new Map(epicGroups(features, order).map((group, at) => [group.key, at]))
  return (feature: Pick<ExecFeature, 'epic' | 'epicId'>) => rank.get(feature.epicId != null ? `#${feature.epicId}` : feature.epic ? `name:${feature.epic}` : '') ?? Infinity
}

// PIR-68: the Product Owner shown for an Epic ('' when none; display names only, set when the meeting is built from the
// Epic setup) and whether the meeting shows the Product Owner column at all (some Epic has one).
export const ownerOfEpic = (meeting: { owners?: Record<string, string> }, epicId: number | undefined) => epicId == null ? '' : meeting.owners?.[String(epicId)] ?? ''
export const showsOwners = (meeting: { owners?: Record<string, string> }) => Object.keys(meeting.owners ?? {}).length > 0

// ---- PIR-53: repeat carry-overs ----
// The PIs a Feature was carried forward in, one after another, back from the meeting's PI: the latest review headed for
// each PI says Move to next PI = Yes. pis: the meeting's PI first, then the earlier ones, newest first.
export function carryStreak(discussion: Discussion | undefined, setup: PiFormSetup, start: string, pis: readonly string[]): string[] {
  if (discussion?.state !== 'done') return []
  const comments = commentsFrom(discussion.comments, start).comments
  const streak: string[] = []
  for (const pi of pis) {
    const review = latestReviewFor(comments, pi)
    if (!review || reviewSplit(review.text, setup).moveValue !== 'Yes') break
    streak.push(pi)
  }
  return streak
}

// ---- PIR-55: hours per Epic and utilization, through the Dashboard's functions ----
export interface EpicHours { key: string; title: string; epicId?: number; hours: number; share: number }
export interface HoursFigures { months: string[]; total: number; byEpic: EpicHours[]; byMonth: { month: string; total: number; byEpic: { title: string; hours: number }[] }[]; why: string }
export interface UtilizationFigures { months: string[]; actual: number; capacity: number; percent: number | null; byMonth: { month: string; actual: number; capacity: number; percent: number | null }[]; people: number; why: string }
const round = (value: number) => Math.round(value * 100) / 100
// Allocation %: an Epic's share of all Epic hours, to one decimal; the shares are adjusted (largest remainder) so they
// add up to exactly 100.
export function allocation(hours: readonly number[]): number[] {
  const total = hours.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return hours.map(() => 0)
  const raw = hours.map((value) => value / total * 1000), floors = raw.map(Math.floor)
  let left = 1000 - floors.reduce((sum, value) => sum + value, 0)
  for (const at of raw.map((value, index) => ({ index, rest: value - floors[index] })).sort((a, b) => b.rest - a.rest || a.index - b.index).map((entry) => entry.index)) { if (left <= 0) break; floors[at] += 1; left -= 1 }
  return floors.map((value) => value / 10)
}
export function hoursAndUtilization(items: AzureWorkItem[], months: string[], today: string, settings: CapacitySettings = defaultCapacitySettings): { hours: HoursFigures; utilization: UtilizationFigures } {
  const empty = (why: string) => ({ hours: { months, total: 0, byEpic: [], byMonth: [], why }, utilization: { months, actual: 0, capacity: 0, percent: null, byMonth: [], people: 0, why } })
  if (!months.length) return empty('The PI’s months are not known (no PI dates).')
  const rows = personMonths(items, months, today, settings)
  if (!rows.length) return empty(`No Time Writing data for ${months.map(monthLabel).join(', ')}.`)
  const byKey = new Map(items.map((item) => [item.key, item]))
  const epics = new Map<string, { key: string; title: string; epicId?: number; hours: number }>()
  const byMonth = months.map((month) => {
    const streams = new Map<string, number>()
    for (const row of rows.filter((entry) => entry.month === month)) for (const stream of row.streams) {
      const item = byKey.get(stream.key)
      const entry = epics.get(stream.key) ?? { key: stream.key, title: stream.key === 'unmapped' ? noEpic : stream.title || item?.title || stream.key, ...(item?.workItemType === 'Epic' ? { epicId: item.id } : {}), hours: 0 }
      entry.hours += stream.actual; epics.set(stream.key, entry)
      streams.set(entry.title, (streams.get(entry.title) ?? 0) + stream.actual)
    }
    const list = [...streams].map(([title, hours]) => ({ title, hours: round(hours) })).filter((entry) => entry.hours > 0).sort((a, b) => b.hours - a.hours || a.title.localeCompare(b.title))
    return { month, total: round(list.reduce((sum, entry) => sum + entry.hours, 0)), byEpic: list }
  })
  const list = [...epics.values()].filter((entry) => entry.hours > 0)
  const shares = allocation(list.map((entry) => entry.hours))
  const byEpic = list.map((entry, at) => ({ ...entry, hours: round(entry.hours), share: shares[at] }))
  const total = round(byEpic.reduce((sum, entry) => sum + entry.hours, 0))
  const team = totals(rows)
  const utilization: UtilizationFigures = {
    months, actual: team.actual, capacity: team.capacity, percent: team.actualUtil, people: team.people,
    byMonth: months.map((month) => { const figures = totals(rows.filter((row) => row.month === month)); return { month, actual: figures.actual, capacity: figures.capacity, percent: figures.actualUtil } }),
    why: team.capacity > 0 ? '' : 'No available capacity for the PI’s months (no working days or everyone absent).',
  }
  return { hours: { months, total, byEpic, byMonth, why: total > 0 ? '' : `No hours booked on an Epic in ${months.map(monthLabel).join(', ')}.` }, utilization }
}

// ---- PIR-56: trends, peaks and spikes ----
// A spike: a point above spikeFactor × the average of its measure over the PI (one constant, stated on the slide).
export const spikeFactor = 1.5
export interface TrendPoint { label: string; value: number; detail: string }
export interface Trend { measure: string; unit: string; points: TrendPoint[]; average: number; peak?: number; spikes: number[]; why: string }
export function trendOf(measure: string, unit: string, points: TrendPoint[], why = ''): Trend {
  if (why || !points.length) return { measure, unit, points, average: 0, spikes: [], why: why || 'No points.' }
  const average = round(points.reduce((sum, point) => sum + point.value, 0) / points.length)
  const max = Math.max(...points.map((point) => point.value))
  const peak = max > 0 ? points.findIndex((point) => point.value === max) : undefined
  const spikes = average > 0 ? points.flatMap((point, at) => point.value > spikeFactor * average ? [at] : []) : []
  return { measure, unit, points, average, ...(peak != null ? { peak } : {}), spikes, why: '' }
}
export interface Bucket { label: string; start: string; end: string }
// The buckets of the PI: its Sprints, else its months.
export function piBuckets(span: PiSpan): { by: 'sprint' | 'month'; buckets: Bucket[] } {
  if (span.sprints.length) return { by: 'sprint', buckets: span.sprints.map((sprint) => ({ label: sprint.name, start: sprint.start, end: sprint.end })) }
  const months: Bucket[] = []
  const at = new Date(`${span.start.slice(0, 7)}-01T00:00:00Z`)
  while (at.toISOString().slice(0, 7) <= span.end.slice(0, 7)) {
    const month = at.toISOString().slice(0, 7)
    at.setUTCMonth(at.getUTCMonth() + 1)
    const last = new Date(at.getTime() - 86_400_000).toISOString().slice(0, 10)
    months.push({ label: monthLabel(month), start: `${month}-01` < span.start ? span.start : `${month}-01`, end: last > span.end ? span.end : last })
  }
  return { by: 'month', buckets: months }
}
const top = (counts: Map<string, number>, unit = '') => [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([name, value]) => `${name} ${round(value).toLocaleString('en')}${unit}`).join(', ')
export function meetingTrends(features: readonly ExecFeature[], span: PiSpan | undefined, spanWhy: string, hours: HoursFigures): { by: string; trends: Trend[] } {
  const hourPoints = hours.byMonth.map((entry) => ({ label: monthLabel(entry.month), value: entry.total, detail: top(new Map(entry.byEpic.map((epic) => [epic.title, epic.hours])), ' h') }))
  const hourTrend = trendOf('Actual hours (team, by month)', 'h', hourPoints, hours.why)
  if (!span) return { by: '', trends: [hourTrend, trendOf('Features closed', '', [], spanWhy), trendOf('Ad-hoc Features added', '', [], spanWhy)] }
  const { by, buckets } = piBuckets(span)
  const count = (pick: (feature: ExecFeature) => string | undefined, keep: (feature: ExecFeature) => boolean) => buckets.map((bucket) => {
    const inside = features.filter((feature) => keep(feature) && inSpan(bucket, pick(feature)))
    const epics = new Map<string, number>()
    for (const feature of inside) epics.set(feature.epic || noEpic, (epics.get(feature.epic || noEpic) ?? 0) + 1)
    return { label: bucket.label, value: inside.length, detail: top(epics) }
  })
  return { by, trends: [
    hourTrend,
    trendOf(`Features closed (by ${by})`, '', count((feature) => feature.closedDate, (feature) => closedInPi(feature, span))),
    trendOf(`Ad-hoc Features added (by ${by})`, '', count((feature) => feature.createdDate, (feature) => Boolean(feature.adhoc))),
  ] }
}

// ---- PIR-54: releases of the ticked streams ----
export interface StreamReleases { stream: string; releases: number | null; classes: [string, number][]; unclassified: number; why: string; classWhy: string }
export interface ReleaseInput { stream: string; why?: string; releases: { key: string; release: string; date?: string; month: string }[]; classify?: (release: string) => string; classWhy?: string }
// The releases of each stream with a date inside the PI (a release without a date: its month is one of the PI's months),
// each once, and their Release Classification counts.
export function piReleases(inputs: readonly ReleaseInput[], span: PiSpan | undefined, months: readonly string[], spanWhy: string): StreamReleases[] {
  return inputs.map((input) => {
    if (input.why || !span) return { stream: input.stream, releases: null, classes: [], unclassified: 0, why: input.why || spanWhy, classWhy: '' }
    const seen = new Map<string, string>()
    for (const release of input.releases) if (release.date ? inSpan(span, release.date) : months.includes(release.month)) if (!seen.has(release.key)) seen.set(release.key, release.release)
    const counts = new Map<string, number>()
    let unclassified = 0
    if (input.classify) for (const release of seen.values()) { const value = input.classify(release); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); else unclassified += 1 }
    return { stream: input.stream, releases: seen.size, classes: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), unclassified: input.classify ? unclassified : seen.size, why: '', classWhy: input.classify ? '' : input.classWhy || 'No Release Classification is set up for this stream’s Epic.' }
  })
}

// ---- PIR-57, PIR-85: long-running Features of the ticked streams ----
export interface LongRunning { id: number; title: string; epic: string; epicId?: number; state: string; created: string; streams: string[]; days: number; months: number; years: number; pis: number | null; threshold: number; move: string }
export interface LongRunningFigures { rows: LongRunning[]; byStream: { stream: string; count: number; why: string }[]; piDays: number | null; why: string }
const closedOrRemoved = (state: string) => isClosedState(state) || lower(state) === 'removed'
// Features under the Epics of the ticked streams, not Closed / Done (nor Removed), whose Created Date plus N calendar
// months is before the build day (PIR-85; N months per Epic, else the default 6; exactly N months is not yet). Age from
// the Created Date to the build day, in months (30.44 days), years (365.25 days) and PIs (the meeting PI's length in
// days; "—" when the PI's dates are not known — which Features run long does not depend on them). Oldest first.
export function longRunning(input: { items: readonly AzureWorkItem[]; streamEpics: Record<string, number[]>; streams: readonly string[]; settings: Pick<MeetingSettings, 'longRunningMonths' | 'longRunningMonthsDefault'>; span?: PiSpan; spanWhy: string; today: string; moveOf: (item: AzureWorkItem) => string }): LongRunningFigures {
  if (!input.streams.length) return { rows: [], byStream: [], piDays: null, why: 'No release-based streams chosen (Admin → Feature & PI setup → PI Review form → Meeting presentation).' }
  const piDays = input.span ? spanDays(input.span) : null
  const byId = new Map(input.items.map((item) => [item.id, item]))
  const epicOfItem = (item: AzureWorkItem) => { const seen = new Set<number>(); for (let at = item.parentId == null ? undefined : byId.get(item.parentId); at && !seen.has(at.id); at = at.parentId == null ? undefined : byId.get(at.parentId)) { if (at.workItemType === 'Epic') return at; seen.add(at.id) } return undefined }
  const found = new Map<number, LongRunning>()
  const byStream = input.streams.map((stream) => {
    const epics = input.streamEpics[stream] ?? []
    if (!epics.length) return { stream, count: 0, why: `No Epics are mapped to ${stream} (Admin → Streams → Stream mapping).` }
    let count = 0
    for (const item of input.items) {
      if (item.workItemType !== 'Feature' || closedOrRemoved(item.state)) continue
      const epic = epicOfItem(item)
      if (!epic || !epics.includes(epic.id)) continue
      const created = day(item.createdDate)
      if (!created) continue
      const days = Math.max(0, dayNumber(input.today) - dayNumber(created))
      const pis = piDays ? Math.round(days / piDays * 10) / 10 : null, threshold = longRunningOf(input.settings, epic.id)
      if (!isLongRunning(created, threshold, input.today)) continue
      count += 1
      const known = found.get(item.id)
      if (known) { known.streams.push(stream); continue }
      found.set(item.id, { id: item.id, title: item.title, epic: epic.title || `#${epic.id}`, epicId: epic.id, state: item.state, created, streams: [stream], days, months: Math.round(days / 30.44 * 10) / 10, years: Math.round(days / 365.25 * 10) / 10, pis, threshold, move: input.moveOf(item) })
    }
    return { stream, count, why: '' }
  })
  return { rows: [...found.values()].sort((a, b) => b.days - a.days || a.id - b.id), byStream, piDays, why: '' }
}

// ---- the whole set ----
export interface PreviousPi { pi: string; closed: number | null; carried: number | null; adhoc: number; hours: number | null; why: { closed: string; carried: string; hours: string } }
export interface MeetingExec {
  span?: PiSpan; spanWhy: string
  previous?: PreviousPi; previousWhy: string
  streaks: { id: number; title: string; epic: string; epicId?: number; pis: string[] }[]; streakWhy: string
  hours: HoursFigures; utilization: UtilizationFigures
  trendsBy: string; trends: Trend[]
  releases: StreamReleases[]; releasesWhy: string
  long: LongRunningFigures
}
export interface ExecInput {
  pi: string; features: readonly ExecFeature[]
  iterations: readonly AzureIteration[] | null | undefined
  items: AzureWorkItem[]; capacity?: CapacitySettings; today: string; start: string
  setup: PiFormSetup; settings: MeetingSettings
  // The PIs newest first (the meeting's PI among them), for the previous PI and the repeat carry-overs.
  pis: readonly string[]
  previousFeatures?: readonly ExecFeature[]
  discussionOf: (feature: ExecFeature) => Discussion | undefined
  releases: readonly ReleaseInput[]
  streamEpics: Record<string, number[]>
  moveOf: (item: AzureWorkItem) => string
}
const samePiName = (a: string, b: string) => lower(piName(a)) === lower(piName(b))
export function meetingExec(input: ExecInput): MeetingExec {
  const { span, why: spanWhy } = piSpanOf(input.iterations, input.pi)
  const months = span ? piMonths(span) : []
  const figures = hoursAndUtilization(input.items, months, input.today, input.capacity)
  const { by, trends } = meetingTrends(input.features, span, spanWhy, figures.hours)
  // PIR-52: the previous PI, worked out the same way from the same data.
  const at = input.pis.findIndex((pi) => samePiName(pi, input.pi))
  const older = at >= 0 ? input.pis.slice(at + 1) : []
  let previous: PreviousPi | undefined, previousWhy = ''
  if (at < 0 || !older.length) previousWhy = 'No earlier PI is known in the iterations or the fetched data.'
  else {
    const pi = piName(older[0]), features = input.previousFeatures ?? []
    const before = piSpanOf(input.iterations, pi)
    const beforeMonths = before.span ? piMonths(before.span) : []
    const beforeHours = hoursAndUtilization(input.items, beforeMonths, input.today, input.capacity).hours
    const tooEarly = Boolean(before.span && before.span.end < input.start)
    const unread = features.filter((feature) => feature.status === 'unread' || feature.status === 'error').length
    previous = {
      pi, adhoc: features.filter((feature) => feature.adhoc).length,
      closed: before.span ? features.filter((feature) => closedInPi(feature, before.span)).length : null,
      carried: tooEarly || !features.length ? null : features.filter(carriedForward).length,
      hours: beforeHours.why ? null : beforeHours.total,
      why: { closed: before.why, carried: tooEarly ? `${pi} ended before PI Review starts: it has no headed reviews.` : !features.length ? `No Features in ${pi}.` : unread ? `${unread} Discussion${unread === 1 ? ' was' : 's were'} not read: counted as not carried forward.` : '', hours: beforeHours.why },
    }
  }
  // PIR-53: Features carried forward in two or more PIs in a row (back from the meeting's PI).
  const chain = at >= 0 ? input.pis.slice(at).map((pi) => piName(pi)) : [input.pi]
  const streaks = input.features.filter(carriedForward).map((feature) => ({ id: feature.id, title: feature.title, epic: feature.epic || noEpic, ...(feature.epicId != null ? { epicId: feature.epicId } : {}), pis: carryStreak(input.discussionOf(feature), input.setup, input.start, chain) })).filter((entry) => entry.pis.length >= 2)
  const releases = input.settings.streams.length ? piReleases(input.releases, span, months, spanWhy) : []
  return {
    ...(span ? { span } : {}), spanWhy, ...(previous ? { previous } : {}), previousWhy,
    streaks, streakWhy: chain.length < 2 ? 'No earlier PI is known, so a carry-over cannot repeat yet.' : '',
    hours: figures.hours, utilization: figures.utilization, trendsBy: by, trends,
    releases, releasesWhy: input.settings.streams.length ? '' : 'No release-based streams chosen',
    long: longRunning({ items: input.items, streamEpics: input.streamEpics, streams: input.settings.streams, settings: input.settings, span, spanWhy, today: input.today, moveOf: input.moveOf }),
  }
}
