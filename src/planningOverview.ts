import type { AzureWorkItem } from './domain'
import { releaseBaselines, type BaselineRule, type ReleaseScope } from './baseline.ts'
import type { CapacitySettings, Region } from './capacity.ts'
import { applyFilter, monthRange, noFilter, personMonths, totals, type PersonMonth } from './dashboard.ts'

// Planning Overview (OVW-01…OVW-08): the team's month on one page — filters, four headline tiles against the month
// before, a 12-month workload against capacity, one exception queue and the delivery health per Epic for the next six
// months. Read only: every figure comes from the fetched Azure DevOps data, the capacity settings and the baselines.

export interface OverviewFilter { region: string; epic: string; owner: string }
export const allFilter: OverviewFilter = { region: '', epic: '', owner: '' }
export interface OverviewInput { items: AzureWorkItem[]; month: string; today: string; settings: CapacitySettings; rules: BaselineRule[]; scopes: ReleaseScope[] }
export type ExceptionKind = 'over-baseline' | 'missing-baseline' | 'capacity-risk'
export interface OverviewException { kind: ExceptionKind; item?: AzureWorkItem; title: string; epic: string; region: string; owner: string; impact: string; target?: string }
export interface DeliveryCounts { due: number; completed: number; atRisk: number; overdue: number; rate: number | null }
export interface EpicHealth { epic: AzureWorkItem; completed: number; atRisk: number; overdue: number; total: number }

const done = new Set(['closed', 'resolved', 'done', 'completed'])
export const isDone = (item: Pick<AzureWorkItem, 'state'>) => done.has(item.state.trim().toLowerCase())
const live = (item: AzureWorkItem) => item.state.trim().toLowerCase() !== 'removed'
const percent = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null
export const previousMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1); return date.toISOString().slice(0, 7) }
const addMonths = (month: string, count: number) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + count); return date.toISOString().slice(0, 7) }

// Delivery of Features against their Target date: done, overdue (open, date passed) or at risk (open, date still ahead).
export function delivery(features: AzureWorkItem[], today: string, months: Set<string>): DeliveryCounts {
  const due = features.filter((feature) => feature.targetDate && months.has(feature.targetDate.slice(0, 7)))
  const completed = due.filter(isDone).length
  const overdue = due.filter((feature) => !isDone(feature) && feature.targetDate!.slice(0, 10) < today).length
  return { due: due.length, completed, overdue, atRisk: due.length - completed - overdue, rate: percent(completed, due.length) }
}

export function planningOverview(input: OverviewInput, filter: OverviewFilter = allFilter) {
  const { items, month, today, settings } = input
  const profiles = settings.profiles ?? {}
  const byId = new Map(items.map((item) => [item.id, item]))
  const epicOf = (item: AzureWorkItem) => { let current: AzureWorkItem | undefined = item; for (let depth = 0; current && depth < 8; depth += 1, current = current.parentId == null ? undefined : byId.get(current.parentId)) if (current.workItemType === 'Epic') return current; return undefined }
  const regionOf = (person: string) => (profiles[person]?.region ?? '') as Region | ''

  // Choices for the filter bar: the regions in use, the Active Epics (not the absence Epic) and the people with hours.
  const months = monthRange(month, 12)
  const rows = personMonths(items, months, today, settings)
  const epics = items.filter((item) => item.workItemType === 'Epic' && item.id !== settings.absenceEpicId && item.state.trim().toLowerCase() === 'active').sort((a, b) => a.title.localeCompare(b.title))
  const owners = [...new Set(rows.filter((row) => row.plan || row.actual).map((row) => row.person))].sort()
  const options = { regions: [...new Set(Object.values(profiles).map((profile) => profile.region).filter(Boolean))].sort() as Region[], epics, owners }

  // Hours: the filter applied to the person-months (Epic = that stream's hours only).
  const epic = epics.find((entry) => entry.key === filter.epic)
  const filtered: PersonMonth[] = applyFilter(rows, { ...noFilter, regions: filter.region ? [filter.region as Region] : [], people: filter.owner ? [filter.owner] : [], streams: epic ? [epic.key] : [] })
  const trend = months.map((entry) => { const total = totals(filtered.filter((row) => row.month === entry)); return { month: entry, plan: total.plan, actual: total.actual, capacity: total.capacity, planUtil: total.planUtil } })
  const now = trend[trend.length - 1], before = trend[trend.length - 2]

  // Features in scope: not Removed, under an Epic other than the absence Epic, matching the filter by Epic, owner and region.
  const inScope = (feature: AzureWorkItem) => {
    const own = epicOf(feature)
    if (!own || own.id === settings.absenceEpicId) return false
    if (epic && own.id !== epic.id) return false
    if (filter.owner && feature.assignedTo !== filter.owner) return false
    if (filter.region && regionOf(feature.assignedTo) !== filter.region) return false
    return true
  }
  const features = items.filter((item) => item.workItemType === 'Feature' && live(item) && inScope(item))
  const deliveryNow = delivery(features, today, new Set([month]))
  const deliveryBefore = delivery(features, today, new Set([previousMonth(month)]))

  // Baselines: releases over their baseline by more than 25%, and open releases under a rule without one.
  const baselineRows = releaseBaselines(items, input.rules, input.scopes).filter((row) => inScope(row.feature))
  const over = baselineRows.filter((row) => row.current && row.current.total > 0 && row.actual > row.current.total * 1.25)
  const missing = baselineRows.filter((row) => !row.current && !isDone(row.feature))
  const current = filtered.filter((row) => row.month === month)
  const atRiskPeople = current.filter((row) => row.capacity > 0 && row.plan / row.capacity * 100 > settings.overloadedAt)

  const exceptions: OverviewException[] = [
    ...over.map((row) => ({ kind: 'over-baseline' as const, item: row.feature, title: row.feature.title, epic: epicOf(row.feature)?.title ?? row.stream, region: regionOf(row.feature.assignedTo), owner: row.feature.assignedTo || 'Unassigned', impact: `+${Math.round((row.actual / row.current!.total - 1) * 100)}%`, ...(row.feature.targetDate ? { target: row.feature.targetDate.slice(0, 10) } : {}) })),
    ...missing.map((row) => ({ kind: 'missing-baseline' as const, item: row.feature, title: row.feature.title, epic: epicOf(row.feature)?.title ?? row.stream, region: regionOf(row.feature.assignedTo), owner: row.feature.assignedTo || 'Unassigned', impact: 'N/A', ...(row.feature.targetDate ? { target: row.feature.targetDate.slice(0, 10) } : {}) })),
    ...atRiskPeople.map((row) => ({ kind: 'capacity-risk' as const, title: `${row.person}: planned ${Math.round(row.plan / row.capacity * 100)}% of capacity`, epic: row.streams.map((entry) => entry.title).slice(0, 2).join(', ') || '—', region: row.region ?? '', owner: row.person, impact: `+${Math.round(row.plan - row.capacity)}h` })),
  ]

  // Delivery health per Epic over the next six months (from the selected month): Features by their Target date.
  const window = new Set(Array.from({ length: 6 }, (_, index) => addMonths(month, index)))
  const health = new Map<number, EpicHealth>()
  for (const feature of features) {
    if (!feature.targetDate || !window.has(feature.targetDate.slice(0, 7))) continue
    const own = epicOf(feature)!
    const entry = health.get(own.id) ?? { epic: own, completed: 0, atRisk: 0, overdue: 0, total: 0 }
    if (isDone(feature)) entry.completed += 1
    else if (feature.targetDate.slice(0, 10) < today) entry.overdue += 1
    else entry.atRisk += 1
    entry.total += 1
    health.set(own.id, entry)
  }
  const timeline = [...health.values()].sort((a, b) => b.total - a.total || a.epic.title.localeCompare(b.epic.title))
  const timelineTotals = timeline.reduce((sum, entry) => ({ total: sum.total + entry.total, completed: sum.completed + entry.completed, atRisk: sum.atRisk + entry.atRisk, overdue: sum.overdue + entry.overdue }), { total: 0, completed: 0, atRisk: 0, overdue: 0 })

  return {
    months, options, trend,
    tiles: {
      utilization: { now: now.planUtil, before: before?.planUtil ?? null },
      delivery: { now: deliveryNow, before: deliveryBefore },
      baseline: { over: over.length, missing: missing.length },
      capacity: { atRisk: atRiskPeople.length, people: new Set(current.map((row) => row.person)).size },
    },
    exceptions, timeline, timelineTotals,
  }
}
export type PlanningOverview = ReturnType<typeof planningOverview>
