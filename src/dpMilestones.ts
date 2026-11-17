import type { AzureWorkItem } from './domain'
import { fieldOf } from './dpReleases.ts'
import { approvalMonthOf } from './releaseSource.ts'

// DP from its own query (Release work items with the milestone fields DRPE / DRPC / DRfH / DDT, each a Date and a
// Status): the DP page shows the releases whose DDT Date is in the month, and two counts for the month —
// Completed Releases: the releases whose DDT is Done with its DDT Date in the month;
// Supported Releases: the releases with at least one milestone (DDT, DRfH, DRPC, DRPE) Done with its own Date in the
// month — each release once, however many of its milestones fell in the month. A release is its PsName + Release
// (two rows naming the same release count once), else its work item.
// Field names may carry a prefix (Custom.DDTDate); "Done" is matched ignoring case and spaces; months are in the
// viewer's time zone, as everywhere else.
export const dpMilestones = [['DDT', 'DDTDate', 'DDTStatus'], ['DRfH', 'DRfHDate', 'DRfHStatus'], ['DRPC', 'DRPCDate', 'DRPCStatus'], ['DRPE', 'DRPEDate', 'DRPEStatus']] as const
export type DpMilestone = typeof dpMilestones[number][0]
// What the DP team calls each milestone (the field names stay DDT / DRfH / DRPC / DRPE).
export const dpMilestoneNames: Record<DpMilestone, { short: string; long: string }> = {
  DDT: { short: 'DT', long: 'Design Transfer' },
  DRfH: { short: 'SFV', long: 'Start of Verification / Start of Hardening' },
  DRPC: { short: 'PRD', long: 'PRD Milestone' },
  DRPE: { short: 'RPE', long: 'Release Planning Event' },
}
export const dpMilestoneLabel = (milestone: DpMilestone) => dpMilestoneNames[milestone].short
export interface CountedMilestone { item: AzureWorkItem; milestone: DpMilestone; date: string; status: string }

export const ddtMonthOf = (item: Pick<AzureWorkItem, 'fields'>, timeZone?: string) => approvalMonthOf(fieldOf(item, 'DDTDate'), timeZone)
const isDone = (status: string | undefined) => (status ?? '').trim().toLowerCase() === 'done'

export interface SupportedRelease { key: string; item: AzureWorkItem; name: string; release: string; milestones: CountedMilestone[]; date: string }
export const dpReleaseKey = (item: AzureWorkItem) => { const { name, release } = dpReleaseName(item); return fieldOf(item, 'PsName') && release ? `${name}\u0000${release}`.toLowerCase() : `#${item.id}` }
// The milestones counted, one entry per release (its milestones in date order, the latest date), in date order.
export function uniqueReleases(entries: CountedMilestone[]): SupportedRelease[] {
  const byKey = new Map<string, SupportedRelease>()
  for (const entry of entries) {
    const key = dpReleaseKey(entry.item), found = byKey.get(key)
    if (found) { found.milestones.push(entry); if (entry.date > found.date) found.date = entry.date; continue }
    byKey.set(key, { key, item: entry.item, ...dpReleaseName(entry.item), milestones: [entry], date: entry.date })
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.item.id - b.item.id)
}
// Every milestone Done, with its month, read once per data set and time zone; each month then only picks its own (KB-27).
const doneCache = new WeakMap<object, Map<string, (CountedMilestone & { month?: string })[]>>()
function doneMilestones(items: AzureWorkItem[], timeZone?: string) {
  let byZone = doneCache.get(items)
  if (!byZone) { byZone = new Map(); doneCache.set(items, byZone) }
  let done = byZone.get(timeZone ?? '')
  if (!done) {
    done = []
    for (const item of items) for (const [milestone, dateField, statusField] of dpMilestones) {
      const date = fieldOf(item, dateField), status = fieldOf(item, statusField)
      if (date && isDone(status)) done.push({ item, milestone, date, status: status!, month: approvalMonthOf(date, timeZone) })
    }
    byZone.set(timeZone ?? '', done)
  }
  return done
}
export function dpMonthCounts(items: AzureWorkItem[], month: string, timeZone?: string) {
  const supported: CountedMilestone[] = doneMilestones(items, timeZone).filter((entry) => entry.month === month).map(({ item, milestone, date, status }) => ({ item, milestone, date, status }))
  supported.sort((a, b) => a.date.localeCompare(b.date) || a.item.id - b.item.id)
  // milestones: every milestone Done in the month; completed / supported: the unique releases behind them.
  const completed = uniqueReleases(supported.filter((entry) => entry.milestone === 'DDT'))
  const byMilestone = Object.fromEntries(dpMilestones.map(([milestone]) => [milestone, supported.filter((entry) => entry.milestone === milestone).length])) as Record<DpMilestone, number>
  return { completed, supported: uniqueReleases(supported), milestones: supported, byMilestone }
}

// QV-53: why a DP release is listed and counted in a month, for the DP table — the month of its DDT Date (what the list
// filters on) and each milestone's month and status ("✓" when Done with a date, so it counts as Supported that month).
const shortMonth = (month: string) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
// QV-54: a release without a DDT Date is listed in the months of its planned milestones — status Planned or
// ToBePlanned (case and spaces ignored) with a date — but never counted (Supported and Completed need Done).
const isPlanned = (status: string | undefined) => ['planned', 'tobeplanned'].includes((status ?? '').replace(/\s+/g, '').toLowerCase())
export function dpPlannedMilestones(item: Pick<AzureWorkItem, 'fields'>, timeZone?: string) {
  if (ddtMonthOf(item, timeZone)) return []
  return dpMilestones.flatMap(([milestone, dateField, statusField]) => {
    const status = fieldOf(item, statusField)?.trim(), month = approvalMonthOf(fieldOf(item, dateField), timeZone)
    return month && isPlanned(status) ? [{ milestone, month, status: status! }] : []
  })
}
// Whether the DP list shows a release in the month: its DDT Date's month, else a planned milestone's month.
export function dpListedIn(item: Pick<AzureWorkItem, 'fields'>, month: string, timeZone?: string) {
  const ddt = ddtMonthOf(item, timeZone)
  return ddt ? ddt === month : dpPlannedMilestones(item, timeZone).some((entry) => entry.month === month)
}
export function dpMonthText(item: Pick<AzureWorkItem, 'fields'>, timeZone?: string) {
  const month = ddtMonthOf(item, timeZone)
  if (month) return shortMonth(month)
  const planned = dpPlannedMilestones(item, timeZone)
  return planned.length ? `${planned.map((entry) => `${shortMonth(entry.month)} (${dpMilestoneLabel(entry.milestone)} ${entry.status})`).join(', ')} · planned, not counted` : 'No DDT Date'
}
export function dpMilestoneText(item: Pick<AzureWorkItem, 'fields'>, timeZone?: string) {
  return dpMilestones.map(([milestone, dateField, statusField]) => {
    const date = fieldOf(item, dateField), status = fieldOf(item, statusField)?.trim(), month = approvalMonthOf(date, timeZone)
    return `${dpMilestoneLabel(milestone)}: ${month ? shortMonth(month) : 'no date'}${status ? ` ${status}` : ' (no status)'}${month && isDone(status) ? ' ✓' : ''}`
  }).join(' · ')
}

// The release a DP row stands for: its PsName (else Title) and Release field.
export const dpReleaseName = (item: AzureWorkItem) => ({ name: fieldOf(item, 'PsName') ?? item.title, release: fieldOf(item, 'Release') ?? '' })
