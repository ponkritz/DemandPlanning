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
export function dpMonthCounts(items: AzureWorkItem[], month: string, timeZone?: string) {
  const supported: CountedMilestone[] = []
  for (const item of items) for (const [milestone, dateField, statusField] of dpMilestones) {
    const date = fieldOf(item, dateField), status = fieldOf(item, statusField)
    if (date && isDone(status) && approvalMonthOf(date, timeZone) === month) supported.push({ item, milestone, date, status: status! })
  }
  supported.sort((a, b) => a.date.localeCompare(b.date) || a.item.id - b.item.id)
  // milestones: every milestone Done in the month; completed / supported: the unique releases behind them.
  const completed = uniqueReleases(supported.filter((entry) => entry.milestone === 'DDT'))
  const byMilestone = Object.fromEntries(dpMilestones.map(([milestone]) => [milestone, supported.filter((entry) => entry.milestone === milestone).length])) as Record<DpMilestone, number>
  return { completed, supported: uniqueReleases(supported), milestones: supported, byMilestone }
}

// The release a DP row stands for: its PsName (else Title) and Release field.
export const dpReleaseName = (item: AzureWorkItem) => ({ name: fieldOf(item, 'PsName') ?? item.title, release: fieldOf(item, 'Release') ?? '' })
