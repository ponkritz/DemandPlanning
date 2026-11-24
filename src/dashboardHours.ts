import type { AzureWorkItem } from './domain'
import { isMonthTask, timeWritingMonth } from './azureInsights.ts'
import { rulesOf } from './bucketRules.ts'
import { defaultCapacitySettings, isNpraTask, regions, resourceRoles, sharedTimeOf, type CapacitySettings } from './capacity.ts'
import { personMonths } from './dashboard.ts'
import { datasetPage, hoursSource, hoursSourceName, missingDataset, type Dataset } from './dashboardPages.ts'
import type { OnDemandColumn, OnDemandRow } from './onDemand.ts'

// DSH-16 The Time Writing hours as a data source of the On-Demand Dashboard blocks: planned and booked hours by team
// member, region, role, stream (Epic), Feature and month, in the shape of a table page so the blocks aggregate them as
// any other source. The figures are Team overview's (dashboard.ts personMonths: the same month Tasks, people, regions,
// roles and calculation profile) — Team overview itself is not changed. Each row is one team member's hours in one
// month on one Feature of a stream; the hours of a stream that are on no Feature, and the person's other counted
// time (trainings, other NPRA, common activities — in Team overview's planned / actual but on no stream), are rows of
// their own, so the totals per person and month, and per stream, are exactly Team overview's. Viewing follows who may
// see Team overview (the menu area "Team insights", CON-94); anyone else sees "Not available for your role.".
// Kept free of React so that every rule is tested on its own (tests/dashboard-hours.test.mjs).

export const hoursColumns: OnDemandColumn[] = [
  { id: 'tw-person', name: 'Team member', type: 'dropdown', options: [], required: false },
  { id: 'tw-region', name: 'Region', type: 'dropdown', options: [...regions], required: false },
  { id: 'tw-role', name: 'Role', type: 'dropdown', options: [...resourceRoles], required: false },
  { id: 'tw-stream', name: 'Stream', type: 'dropdown', options: [], required: false },
  { id: 'tw-feature', name: 'Feature', type: 'text', options: [], required: false },
  { id: 'tw-month', name: 'Month', type: 'date', options: [], required: false },
  { id: 'tw-planned', name: 'Planned hours', type: 'number', options: [], required: false },
  { id: 'tw-booked', name: 'Booked hours', type: 'number', options: [], required: false },
]
export const otherTime = 'Other time (trainings, NPRA, activities)'
export const noFeature = '(no Feature)'
export const notAvailable = 'Not available for your role.'
export interface HoursLine { person: string; region?: string; role?: string; stream: string; feature: string; month: string; planned: number; booked: number }

// An imported row for a group (HIS-13) is shared time, as capacity.ts reads it.
const sharedGroup = /(?:^|;)\s*Shared:\s*(everyone|India|Netherlands|US)\s*(?:;|$)/
const round = (value: number) => Math.round(value * 100) / 100
const hours = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0

// The lines over the months: Team overview's person-month figures, the stream hours split by Feature.
export function hoursLines(items: AzureWorkItem[], months: string[], today: string, settings: CapacitySettings = defaultCapacitySettings): HoursLine[] {
  if (!months.length) return []
  const rows = personMonths(items, months, today, settings)
  if (!rows.length) return []
  // The month Tasks of project work (as capacity.ts counts them: not removed, not shared time, not under the absence
  // Epic, not NPRA or training) per month, person, stream and Feature.
  const live = items.filter((item) => item.state.trim().toLowerCase() !== 'removed')
  const byId = new Map(live.map((item) => [item.id, item]))
  const chainOf = (item: AzureWorkItem) => { const chain: AzureWorkItem[] = []; const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { chain.push(current); seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return chain }
  const wanted = new Set(months), rules = rulesOf(settings)
  const features = new Map<string, Map<string, { planned: number; booked: number }>>()
  for (const task of live) {
    if (!isMonthTask(task)) continue
    const month = timeWritingMonth(task.title)
    if (!month || !wanted.has(month)) continue
    const chain = chainOf(task)
    const epic = chain.find((item) => item.workItemType === 'Epic'), feature = chain.find((item) => item.workItemType === 'Feature')
    if ((task.id < 0 && task.organization === 'history' && sharedGroup.test(task.tags)) || sharedTimeOf(task, chain, settings) || epic?.id === settings.absenceEpicId || isNpraTask(task, chain, rules)) continue
    const person = task.assignedTo || feature?.assignedTo || 'Unassigned'
    const key = `${month}|${person}|${epic?.key ?? 'unmapped'}`
    const map = features.get(key) ?? new Map<string, { planned: number; booked: number }>()
    const title = feature?.title ?? noFeature
    const entry = map.get(title) ?? { planned: 0, booked: 0 }
    entry.planned += hours(task.originalEstimate); entry.booked += hours(task.completedWork)
    map.set(title, entry); features.set(key, map)
  }
  const lines: HoursLine[] = []
  for (const row of rows) {
    const base = { person: row.person, ...(row.region ? { region: row.region } : {}), ...(row.role ? { role: row.role } : {}), month: row.month }
    let streamPlanned = 0, streamBooked = 0
    for (const stream of row.streams) {
      streamPlanned += stream.plan; streamBooked += stream.actual
      let planned = 0, booked = 0
      for (const [feature, entry] of [...(features.get(`${row.month}|${row.person}|${stream.key}`) ?? new Map<string, { planned: number; booked: number }>())].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (feature === noFeature) continue
        planned += entry.planned; booked += entry.booked
        lines.push({ ...base, stream: stream.title, feature, planned: round(entry.planned), booked: round(entry.booked) })
      }
      // What Team overview counts on the stream beyond its Features' Tasks (and a figure lock's difference) — on no Feature.
      const restPlanned = round(stream.plan - planned), restBooked = round(stream.actual - booked)
      if (restPlanned || restBooked) lines.push({ ...base, stream: stream.title, feature: noFeature, planned: restPlanned, booked: restBooked })
    }
    const otherPlanned = round(row.plan - streamPlanned), otherBooked = round(row.actual - streamBooked)
    if (otherPlanned || otherBooked) lines.push({ ...base, stream: otherTime, feature: '', planned: otherPlanned, booked: otherBooked })
  }
  return lines
}

// The lines kept for the last items, months, day and settings asked for (a page draws the dashboard often; the figures
// only change with them).
let last: { items: AzureWorkItem[]; months: string; today: string; settings: CapacitySettings; lines: HoursLine[] } | null = null
export function hoursLinesCached(items: AzureWorkItem[], months: string[], today: string, settings: CapacitySettings): HoursLine[] {
  const key = months.join(',')
  if (last && last.items === items && last.months === key && last.today === today && last.settings === settings) return last.lines
  const lines = hoursLines(items, months, today, settings)
  last = { items, months: key, today, settings, lines }
  return lines
}

// The dataset of the blocks: the lines as rows of a table page (Month as the month's first day, so the period applies).
export function hoursDataset(lines: HoursLine[]): Dataset {
  const people = [...new Set(lines.map((line) => line.person))].sort((a, b) => a.localeCompare(b))
  const streams = [...new Set(lines.map((line) => line.stream))].filter((stream) => stream !== otherTime).sort((a, b) => a.localeCompare(b))
  const columns = hoursColumns.map((column) => column.id === 'tw-person' ? { ...column, options: people } : column.id === 'tw-stream' ? { ...column, options: [...streams, ...(lines.some((line) => line.stream === otherTime) ? [otherTime] : [])] } : column)
  const rows: OnDemandRow[] = lines.map((line, index) => ({ id: `tw${index + 1}`, cells: { 'tw-person': line.person, 'tw-region': line.region ?? '', 'tw-role': line.role ?? '', 'tw-stream': line.stream, 'tw-feature': line.feature, 'tw-month': `${line.month}-01`, 'tw-planned': String(line.planned), 'tw-booked': String(line.booked) } }))
  return { key: hoursSource, name: hoursSourceName, kind: 'as in Team overview', note: `Planned and booked hours of the Time Writing data as Team overview counts them, by team member, region, role, stream, Feature and month (${lines.length} line${lines.length === 1 ? '' : 's'} in the period). Measure: Sum or Average of Planned hours or Booked hours.`, page: datasetPage('time-writing-hours', hoursSourceName, columns, rows) }
}

// The data source as a viewer gets it: the hours, or "Not available for your role." for those who may not see Team overview.
export const hoursFor = (allowed: boolean, lines: HoursLine[]): Dataset => allowed ? hoursDataset(lines) : missingDataset(hoursSource, notAvailable)
