import type { AzureWorkItem } from './domain'
import { rulesOf } from './bucketRules.ts'
import { defaultInsightThresholds, type InsightThresholds } from './insightThresholds.ts'
import { capacityModel, defaultCapacitySettings, isNpraTask, sharedTimeOf, type CapacitySettings, type Region, type ResourceRole } from './capacity.ts'
import { isMonthTask, timeWritingMonth } from './azureInsights.ts'

// Overview dashboard: one record per person and month from the Time Writing data — planned hours (Original Estimate),
// actual hours (Completed Work) and capacity (working days × hours per day, less absence, holidays and common
// activities such as PI Planning, see capacity.ts sharedTimeOf) —
// filtered by region, role, person and stream, and the analyses built on them. Absence is never demand: it lowers
// capacity. Capacity is counted once per person and month.

export type MonthStatus = 'elapsed' | 'partial' | 'future'
// Every filter is multi-select; an empty list means all.
export interface DashboardFilter { regions: Region[]; roles: ResourceRole[]; people: string[]; streams: string[] }
export const noFilter: DashboardFilter = { regions: [], roles: [], people: [], streams: [] }
export interface StreamHours { key: string; title: string; plan: number; actual: number }
export interface PersonMonth { month: string; status: MonthStatus; person: string; region?: Region; role?: ResourceRole; plan: number; actual: number; capacity: number; absence: number; holiday: number; reserved: number; tasks: number; contractual: number; work: number; training: number; npraOther: number; activities: number; planLines: number; blankActuals: number; streams: StreamHours[] }
export interface Totals { plan: number; actual: number; capacity: number; absence: number; people: number; planUtil: number | null; actualUtil: number | null; gap: number; ratio: number | null }

const ratio = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null
const round = (value: number) => Math.round(value * 100) / 100

export function monthRange(end: string, span: number) {
  return Array.from({ length: span }, (_, index) => { const date = new Date(`${end}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - (span - 1 - index)); return date.toISOString().slice(0, 7) })
}
export function monthStatus(month: string, today: string): MonthStatus {
  const current = today.slice(0, 7)
  return month < current ? 'elapsed' : month === current ? 'partial' : 'future'
}

// Period (OV-15, OV-16): Year → Quarter → Month, a hierarchy of multi-selects. Quarters belong to a year ("2026-Q1")
// and months to a year ("2026-01"): the Quarter list offers the quarters of the chosen years, the Month list the months
// of the chosen quarters. Nothing ticked: Year = the current year; Quarter = every quarter of the chosen years; Month =
// every month of the chosen quarters. A choice outside the level above it is ignored (and dropped when that changes).
export interface Period { years: number[]; quarters: string[]; months: string[] }
const pad = (value: number) => String(value).padStart(2, '0')
const yearsIn = (values: unknown) => Array.isArray(values) ? [...new Set(values.filter((entry): entry is number => Number.isInteger(entry) && entry > 2000 && entry < 2100))].sort((a, b) => a - b) : []
const keysIn = (values: unknown, pattern: RegExp) => Array.isArray(values) ? [...new Set(values.filter((entry): entry is string => typeof entry === 'string' && pattern.test(entry)))].sort() : []
const quarterKey = /^\d{4}-Q[1-4]$/, monthKey = /^\d{4}-(0[1-9]|1[0-2])$/
export const quarterOfMonthKey = (month: string) => `${month.slice(0, 4)}-Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`
// The years that count: those chosen, else the current year.
export const periodYears = (period: Pick<Period, 'years'>, currentYear: number) => period.years.length ? yearsIn(period.years) : [currentYear]
// The quarters the Quarter list offers, and those that count (chosen within the years, else all of them).
export const offeredQuarters = (years: number[]) => years.flatMap((year) => [1, 2, 3, 4].map((quarter) => `${year}-Q${quarter}`))
export function periodQuarters(period: Pick<Period, 'years' | 'quarters'>, currentYear: number) {
  const offered = offeredQuarters(periodYears(period, currentYear))
  const chosen = period.quarters.filter((quarter) => offered.includes(quarter))
  return chosen.length ? chosen : offered
}
// The months the Month list offers (those of the counting quarters), and the months of the period.
export const offeredMonths = (quarters: string[]) => quarters.flatMap((quarter) => { const year = quarter.slice(0, 4), first = (Number(quarter.slice(6)) - 1) * 3 + 1; return [0, 1, 2].map((step) => `${year}-${pad(first + step)}`) }).sort()
export function periodMonths(period: Period, currentYear: number) {
  const offered = offeredMonths(periodQuarters(period, currentYear))
  const chosen = period.months.filter((month) => offered.includes(month))
  return chosen.length ? [...chosen].sort() : offered
}
// A choice made consistent after a level above changed: quarters outside the years and months outside the quarters go.
export function narrowPeriod(period: Period, currentYear: number): Period {
  const years = yearsIn(period.years)
  const quartersOffered = offeredQuarters(years.length ? years : [currentYear])
  const quarters = period.quarters.filter((quarter) => quartersOffered.includes(quarter))
  const monthsOffered = offeredMonths(quarters.length ? quarters : quartersOffered)
  return { years, quarters, months: period.months.filter((month) => monthsOffered.includes(month)) }
}
// A saved period in this format or an earlier one — { year, quarters: [1…4], months: [1…12] } (quarters and months
// added up), or { years, quarters: [1…4], months: [1…12] } — keeps its months.
export function periodOf(value: unknown, fallback: Period): Period {
  if (!value || typeof value !== 'object') return fallback
  const saved = value as { years?: unknown; year?: unknown; quarters?: unknown; months?: unknown }
  const numbers = (values: unknown, max: number) => Array.isArray(values) ? [...new Set(values.filter((entry): entry is number => Number.isInteger(entry) && entry >= 1 && entry <= max))].sort((a, b) => a - b) : []
  if (Array.isArray(saved.years) && (keysIn(saved.quarters, quarterKey).length || keysIn(saved.months, monthKey).length || (!numbers(saved.quarters, 4).length && !numbers(saved.months, 12).length))) {
    return { years: yearsIn(saved.years), quarters: keysIn(saved.quarters, quarterKey), months: keysIn(saved.months, monthKey) }
  }
  const years = Array.isArray(saved.years) ? yearsIn(saved.years) : yearsIn([Number(saved.year)])
  if (!years.length) return fallback
  const quarters = numbers(saved.quarters, 4), months = numbers(saved.months, 12)
  const old = !Array.isArray(saved.years) && months.length
  const chosen = old ? [...new Set([...months, ...quarters.flatMap((quarter) => [1, 2, 3].map((step) => (quarter - 1) * 3 + step))])].sort((a, b) => a - b) : months
  return {
    years,
    quarters: old ? [] : years.flatMap((year) => quarters.map((quarter) => `${year}-Q${quarter}`)),
    months: years.flatMap((year) => chosen.map((month) => `${year}-${pad(month)}`)),
  }
}
export const quarterOf = (month: string) => Math.ceil(Number(month.slice(5)) / 3)

export function personMonths(source: AzureWorkItem[], months: string[], today: string, settings: CapacitySettings = defaultCapacitySettings): PersonMonth[] {
  const profiles = settings.profiles ?? {}
  const byId = new Map(source.map((item) => [item.id, item]))
  const epicOf = (item: AzureWorkItem) => { const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { if (current.workItemType === 'Epic') return current; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return undefined }
  const chainOf = (item: AzureWorkItem) => { const chain: AzureWorkItem[] = []; const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { chain.push(current); seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return chain }
  // The month Tasks bucketed once (the Time Writing title regex is costly over a large board); every other item is
  // kept for each month, so the model and the lines see exactly what they saw before, with no Task of another month.
  const others: AzureWorkItem[] = [], byMonth = new Map<string, AzureWorkItem[]>()
  for (const item of source) {
    if (item.workItemType !== 'Task') { others.push(item); continue }
    const at = isMonthTask(item) ? timeWritingMonth(item.title) : undefined
    if (at != null) byMonth.set(at, [...(byMonth.get(at) ?? []), item])
  }
  const rows: PersonMonth[] = []
  for (const month of months) {
    const monthTasks = byMonth.get(month) ?? []
    const model = capacityModel([...others, ...monthTasks], month, settings)
    // Planned lines and blank actuals per person (month Tasks outside the absence Epic, shared time and NPRA, with an estimate).
    const lines = new Map<string, { planLines: number; blankActuals: number }>()
    for (const task of monthTasks) {
      if (task.state.trim().toLowerCase() === 'removed' || !(task.originalEstimate && task.originalEstimate > 0)) continue
      if (epicOf(task)?.id === settings.absenceEpicId || sharedTimeOf(task, chainOf(task), settings) || isNpraTask(task, chainOf(task), rulesOf(settings))) continue
      const entry = lines.get(task.assignedTo) ?? { planLines: 0, blankActuals: 0 }
      entry.planLines++; if (task.completedWork == null) entry.blankActuals++
      lines.set(task.assignedTo, entry)
    }
    for (const person of model.people) {
      if (person.name === 'Unassigned') continue
      const profile = profiles[person.name]
      rows.push({
        month, status: monthStatus(month, today), person: person.name, region: profile?.region, role: profile?.role,
        plan: round(person.utilizedPlanned), actual: round(person.utilized), capacity: round(person.available), absence: round(person.absence), holiday: round(person.absenceByKind['Public holiday'] ?? 0), reserved: round(person.reserved), tasks: person.tasks + person.npraTasks,
        // CAP-39: the CAP-38 split, for Workload by person.
        contractual: round(person.funded), work: round(person.work), training: round(person.training), npraOther: round(person.npraOther), activities: round(person.reservedActual),
        planLines: lines.get(person.name)?.planLines ?? 0, blankActuals: lines.get(person.name)?.blankActuals ?? 0,
        streams: person.streams.map((stream) => ({ key: stream.key, title: stream.title, plan: round(stream.planned), actual: round(stream.work) })),
      })
    }
  }
  return rows
}

// ACT-28: what the capacity of some person-months is made of — contractual hours less leave (every kind but public
// holidays) and holidays, each by its actual if recorded, else planned (CAP-63), and anything else the calculation
// profile takes off (Standard Hours, deducted buckets) — and the text for the Capacity tile, only the non-zero parts.
export function capacityParts(rows: PersonMonth[]) {
  const sum = (pick: (row: PersonMonth) => number) => round(rows.reduce((total, row) => total + pick(row), 0))
  const contractual = sum((row) => row.contractual), holiday = sum((row) => Math.min(row.holiday ?? 0, row.absence)), leave = sum((row) => row.absence - Math.min(row.holiday ?? 0, row.absence)), capacity = sum((row) => row.capacity)
  const other = Math.max(0, round(contractual - leave - holiday - capacity))
  return { contractual, leave, holiday, other, capacity }
}
export function capacityText(parts: ReturnType<typeof capacityParts>, hours: (value: number) => string = String) {
  return [`${hours(parts.contractual)}h contractual`, ...(parts.leave ? [`${hours(parts.leave)}h leave`] : []), ...(parts.holiday ? [`${hours(parts.holiday)}h holiday`] : []), ...(parts.other ? [`${hours(parts.other)}h other deductions`] : [])].join(' − ')
}
export const absenceRuleText = 'leave and holidays: actual if recorded, else planned'

// Regions, roles and people narrow the people; streams narrow the hours to those Epics and the people to those with
// hours in them (their capacity is still counted whole).
export function applyFilter(rows: PersonMonth[], filter: DashboardFilter): PersonMonth[] {
  const has = <T,>(list: T[], value: T | undefined) => !list.length || (value != null && list.includes(value))
  return rows.filter((row) => has(filter.regions, row.region) && has(filter.roles, row.role) && has(filter.people, row.person))
    .flatMap((row) => {
      if (!filter.streams.length) return [row]
      const streams = row.streams.filter((entry) => filter.streams.includes(entry.key))
      // A stream keeps only its project work: no trainings, other NPRA or common activities.
      const actual = round(streams.reduce((sum, entry) => sum + entry.actual, 0))
      return streams.length ? [{ ...row, plan: round(streams.reduce((sum, entry) => sum + entry.plan, 0)), actual, work: actual, training: 0, npraOther: 0, activities: 0, streams }] : []
    })
}

export function totals(rows: PersonMonth[]): Totals {
  const plan = round(rows.reduce((sum, row) => sum + row.plan, 0)), actual = round(rows.reduce((sum, row) => sum + row.actual, 0)), capacity = round(rows.reduce((sum, row) => sum + row.capacity, 0))
  return { plan, actual, capacity, absence: round(rows.reduce((sum, row) => sum + row.absence, 0)), people: new Set(rows.map((row) => row.person)).size, planUtil: ratio(plan, capacity), actualUtil: ratio(actual, capacity), gap: round(capacity - plan), ratio: ratio(actual, plan) }
}

export function groupBy<K extends string>(rows: PersonMonth[], key: (row: PersonMonth) => K) {
  const groups = new Map<K, PersonMonth[]>()
  for (const row of rows) { const value = key(row); groups.set(value, [...(groups.get(value) ?? []), row]) }
  return [...groups].map(([name, entries]) => ({ name, rows: entries, ...totals(entries) }))
}

// One utilization model for the whole Dashboard, from Admin → Capacity & time: overloaded strictly above `overloadedAt` %
// of capacity, spare below `availableBelow` %, balanced in between.
// CAP-47: the insight thresholds travel with the utilization bands (built-in values when absent).
export interface Bands { overloadedAt: number; availableBelow: number; thresholds?: InsightThresholds }
export const defaultBands: Bands = { overloadedAt: 100, availableBelow: 80 }
export type Band = 'over' | 'balanced' | 'spare'
export function bandOf(utilization: number | null | undefined, bands: Bands = defaultBands): Band | null {
  if (utilization == null) return null
  return utilization > bands.overloadedAt ? 'over' : utilization < bands.availableBelow ? 'spare' : 'balanced'
}
const utilOf = (hours: number, capacity: number) => capacity > 0 ? hours / capacity * 100 : null

// People whose planned utilization over the period reaches the overloaded threshold.
export function plannedOverload(rows: PersonMonth[], bands: Bands = defaultBands) {
  const people = groupBy(rows, (row) => row.person)
  return { over: people.filter((person) => bandOf(person.planUtil, bands) === 'over').map((person) => person.name), people: people.length }
}

// Persistent overload: strictly above the overloaded threshold in at least `streak` consecutive elapsed months (missing
// months break it).
export function persistentOverload(rows: PersonMonth[], months: string[], measure: 'actual' | 'plan', streak = 3, bands: Bands = defaultBands) {
  const elapsed = months.filter((month) => rows.some((row) => row.month === month && row.status === 'elapsed'))
  const names = [...new Set(rows.map((row) => row.person))].sort()
  return names.filter((name) => {
    let run = 0, best = 0
    for (const month of elapsed) {
      const row = rows.find((entry) => entry.person === name && entry.month === month)
      run = row && bandOf(utilOf(row[measure], row.capacity), bands) === 'over' ? run + 1 : 0
      best = Math.max(best, run)
    }
    return best >= streak
  })
}

// Concentration: the top 20% of people (rounded up) by hours, their share of the hours and of the capacity.
export function concentration(rows: PersonMonth[], measure: 'actual' | 'plan', bands: Bands = defaultBands) {
  const people = groupBy(rows, (row) => row.person).sort((a, b) => b[measure] - a[measure])
  const all = totals(rows), top = people.slice(0, Math.ceil(people.length * (bands.thresholds ?? defaultInsightThresholds).concentrationTop / 100))
  const hours = top.reduce((sum, person) => sum + person[measure], 0), capacity = top.reduce((sum, person) => sum + person.capacity, 0)
  const hoursShare = ratio(hours, all[measure]), capacityShare = ratio(capacity, all.capacity)
  return { top: top.map((person) => ({ name: person.name, hours: person[measure] })), of: people.length, hoursShare, capacityShare, alert: hoursShare != null && capacityShare != null && hoursShare - capacityShare >= 10 }
}

// Rebalancing within the same role and month: overload (plan above capacity) can only move to headroom of that role
// in that month. People without a role are left out.
// Overload (plan above capacity) can move only to headroom of the same role in the same month, and only in current or
// future months. People without a role (Admin → People & access → People) are left out of the moves — not listed as relief needs or
// receivers — and counted apart so the Overview can say so; gross overload and headroom still count everyone.
export function rebalancing(rows: PersonMonth[]) {
  let overload = 0, headroom = 0, movable = 0
  const receivers: { person: string; month: string; role?: string; region?: string; plan: number; headroom: number }[] = []
  const needs: { person: string; month: string; role?: string; region?: string; plan: number; capacity: number; need: number; actual: number }[] = []
  const unmapped = { people: new Set<string>(), overload: 0, headroom: 0 }
  for (const group of groupBy(rows, (row) => `${row.month}|${row.role ?? ''}`)) {
    const mapped = Boolean(group.rows[0]?.role)
    let over = 0, room = 0
    for (const row of group.rows) {
      const diff = row.plan - row.capacity
      if (diff > 0) { over += diff; if (mapped) needs.push({ person: row.person, month: row.month, role: row.role, region: row.region, plan: row.plan, capacity: row.capacity, need: round(diff), actual: row.actual }); else { unmapped.people.add(row.person); unmapped.overload += diff } }
      else if (diff < 0 && row.status !== 'elapsed') { room += -diff; if (mapped) receivers.push({ person: row.person, month: row.month, role: row.role, region: row.region, plan: row.plan, headroom: round(-diff) }); else { unmapped.people.add(row.person); unmapped.headroom += -diff } }
    }
    overload += over; headroom += room
    if (mapped) movable += Math.min(over, room)
  }
  return { overload: round(overload), headroom: round(headroom), movable: round(movable), shortfall: round(overload - movable), needs: needs.sort((a, b) => b.need - a.need), receivers: receivers.sort((a, b) => b.headroom - a.headroom), unmapped: { people: unmapped.people.size, overload: round(unmapped.overload), headroom: round(unmapped.headroom) } }
}

// Hours per Epic over the rows.
export function streamTotals(rows: PersonMonth[]) {
  const streams = new Map<string, StreamHours & { people: Set<string> }>()
  for (const row of rows) for (const stream of row.streams) {
    const entry = streams.get(stream.key) ?? { key: stream.key, title: stream.title, plan: 0, actual: 0, people: new Set<string>() }
    entry.plan += stream.plan; entry.actual += stream.actual; entry.people.add(row.person); streams.set(stream.key, entry)
  }
  const plan = [...streams.values()].reduce((sum, stream) => sum + stream.plan, 0)
  return [...streams.values()].map(({ people, ...stream }) => ({ ...stream, plan: round(stream.plan), actual: round(stream.actual), people: [...people].sort(), share: ratio(stream.plan, plan) })).sort((a, b) => b.plan - a.plan || a.title.localeCompare(b.title))
}

// Month-on-month change of actual hours by a dimension (role, stream, person, …); undefined = nothing that month.
export type Dimension = (row: PersonMonth) => { name: string; actual: number }[]
export const byRole: Dimension = (row) => [{ name: row.role ?? 'No role', actual: row.actual }]
export const byRegion: Dimension = (row) => [{ name: row.region ?? 'No region', actual: row.actual }]
export const byPerson: Dimension = (row) => [{ name: row.person, actual: row.actual }]
export const byStream: Dimension = (row) => row.streams.map((stream) => ({ name: stream.title, actual: stream.actual }))
export function change(rows: PersonMonth[], previous: string, current: string, dimension: Dimension) {
  const sum = (month: string) => { const map = new Map<string, number>(); for (const row of rows) if (row.month === month) for (const entry of dimension(row)) map.set(entry.name, (map.get(entry.name) ?? 0) + entry.actual); return map }
  const before = sum(previous), after = sum(current)
  return [...new Set([...before.keys(), ...after.keys()])].map((name) => {
    const a = before.get(name), b = after.get(name)
    return { name, previous: a == null ? undefined : round(a), current: b == null ? undefined : round(b), change: a != null && b != null ? round(b - a) : undefined, percent: a != null && b != null && a > 0 ? Math.round((b - a) / a * 1000) / 10 : undefined }
  }).sort((x, y) => Math.abs(y.change ?? 0) - Math.abs(x.change ?? 0) || x.name.localeCompare(y.name))
}
