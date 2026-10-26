import type { AzureWorkItem } from './domain'
import { fieldOf } from './dpReleases.ts'
import { approvalMonthOf } from './releaseSource.ts'

// DP from its own query (Release work items with the milestone fields DRPE / DRPC / DRfH / DDT, each a Date and a
// Status): the DP page shows the releases whose DDT Date is in the month, and two counts for the month —
// Completed Releases: releases whose DDT is Done with its DDT Date in the month;
// Supported Releases: every milestone (DDT, DRfH, DRPC, DRPE) that is Done with its own Date in the month.
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

export function dpMonthCounts(items: AzureWorkItem[], month: string, timeZone?: string) {
  const supported: CountedMilestone[] = []
  for (const item of items) for (const [milestone, dateField, statusField] of dpMilestones) {
    const date = fieldOf(item, dateField), status = fieldOf(item, statusField)
    if (date && isDone(status) && approvalMonthOf(date, timeZone) === month) supported.push({ item, milestone, date, status: status! })
  }
  supported.sort((a, b) => a.date.localeCompare(b.date) || a.item.id - b.item.id)
  const completed = supported.filter((entry) => entry.milestone === 'DDT')
  const byMilestone = Object.fromEntries(dpMilestones.map(([milestone]) => [milestone, supported.filter((entry) => entry.milestone === milestone).length])) as Record<DpMilestone, number>
  return { completed, supported, byMilestone }
}

// The release a DP row stands for: its PsName (else Title) and Release field.
export const dpReleaseName = (item: AzureWorkItem) => ({ name: fieldOf(item, 'PsName') ?? item.title, release: fieldOf(item, 'Release') ?? '' })
