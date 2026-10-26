import type { AzureWorkItem } from './domain'
import { capacityModel, defaultCapacitySettings, sharedTimeOf, type CapacitySettings, type Region, type ResourceRole } from './capacity.ts'
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
export interface PersonMonth { month: string; status: MonthStatus; person: string; region?: Region; role?: ResourceRole; plan: number; actual: number; capacity: number; absence: number; reserved: number; tasks: number; planLines: number; blankActuals: number; streams: StreamHours[] }
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

// Period: a year with any quarters and months of it (multi-select); nothing chosen = the whole year.
export interface Period { year: number; quarters: number[]; months: number[] }
export function periodMonths(period: Period) {
  const chosen = new Set(period.months.filter((month) => month >= 1 && month <= 12))
  for (const quarter of period.quarters) if (quarter >= 1 && quarter <= 4) for (let index = 0; index < 3; index += 1) chosen.add((quarter - 1) * 3 + 1 + index)
  const months = chosen.size ? [...chosen].sort((a, b) => a - b) : Array.from({ length: 12 }, (_, index) => index + 1)
  return months.map((month) => `${period.year}-${String(month).padStart(2, '0')}`)
}
export const quarterOf = (month: string) => Math.ceil(Number(month.slice(5)) / 3)

export function personMonths(source: AzureWorkItem[], months: string[], today: string, settings: CapacitySettings = defaultCapacitySettings): PersonMonth[] {
  const profiles = settings.profiles ?? {}
  const byId = new Map(source.map((item) => [item.id, item]))
  const epicOf = (item: AzureWorkItem) => { const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { if (current.workItemType === 'Epic') return current; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return undefined }
  const chainOf = (item: AzureWorkItem) => { const chain: AzureWorkItem[] = []; const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { chain.push(current); seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return chain }
  const rows: PersonMonth[] = []
  for (const month of months) {
    const model = capacityModel(source, month, settings)
    // Planned lines and blank actuals per person (month Tasks outside the absence Epic with an estimate).
    const lines = new Map<string, { planLines: number; blankActuals: number }>()
    for (const task of source) {
      if (!isMonthTask(task) || timeWritingMonth(task.title) !== month || task.state.trim().toLowerCase() === 'removed' || !(task.originalEstimate && task.originalEstimate > 0)) continue
      if (epicOf(task)?.id === settings.absenceEpicId || sharedTimeOf(task, chainOf(task), settings)) continue
      const entry = lines.get(task.assignedTo) ?? { planLines: 0, blankActuals: 0 }
      entry.planLines++; if (task.completedWork == null) entry.blankActuals++
      lines.set(task.assignedTo, entry)
    }
    for (const person of model.people) {
      if (person.name === 'Unassigned') continue
      const profile = profiles[person.name]
      rows.push({
        month, status: monthStatus(month, today), person: person.name, region: profile?.region, role: profile?.role,
        plan: round(person.planned), actual: round(person.work), capacity: round(person.available), absence: round(person.absence), reserved: round(person.reserved), tasks: person.tasks,
        planLines: lines.get(person.name)?.planLines ?? 0, blankActuals: lines.get(person.name)?.blankActuals ?? 0,
        streams: person.streams.map((stream) => ({ key: stream.key, title: stream.title, plan: round(stream.planned), actual: round(stream.work) })),
      })
    }
  }
  return rows
}

// Regions, roles and people narrow the people; streams narrow the hours to those Epics and the people to those with
// hours in them (their capacity is still counted whole).
export function applyFilter(rows: PersonMonth[], filter: DashboardFilter): PersonMonth[] {
  const has = <T,>(list: T[], value: T | undefined) => !list.length || (value != null && list.includes(value))
  return rows.filter((row) => has(filter.regions, row.region) && has(filter.roles, row.role) && has(filter.people, row.person))
    .flatMap((row) => {
      if (!filter.streams.length) return [row]
      const streams = row.streams.filter((entry) => filter.streams.includes(entry.key))
      return streams.length ? [{ ...row, plan: round(streams.reduce((sum, entry) => sum + entry.plan, 0)), actual: round(streams.reduce((sum, entry) => sum + entry.actual, 0)), streams }] : []
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

// One utilization model for the whole Dashboard, from Settings → Capacity: overloaded at or above `overloadedAt` %
// of capacity, spare below `availableBelow` %, balanced in between.
export interface Bands { overloadedAt: number; availableBelow: number }
export const defaultBands: Bands = { overloadedAt: 100, availableBelow: 80 }
export type Band = 'over' | 'balanced' | 'spare'
export function bandOf(utilization: number | null | undefined, bands: Bands = defaultBands): Band | null {
  if (utilization == null) return null
  return utilization >= bands.overloadedAt ? 'over' : utilization < bands.availableBelow ? 'spare' : 'balanced'
}
const utilOf = (hours: number, capacity: number) => capacity > 0 ? hours / capacity * 100 : null

// People whose planned utilization over the period reaches the overloaded threshold.
export function plannedOverload(rows: PersonMonth[], bands: Bands = defaultBands) {
  const people = groupBy(rows, (row) => row.person)
  return { over: people.filter((person) => bandOf(person.planUtil, bands) === 'over').map((person) => person.name), people: people.length }
}

// Persistent overload: at or above the overloaded threshold in at least `streak` consecutive elapsed months (missing
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
export function concentration(rows: PersonMonth[], measure: 'actual' | 'plan') {
  const people = groupBy(rows, (row) => row.person).sort((a, b) => b[measure] - a[measure])
  const all = totals(rows), top = people.slice(0, Math.ceil(people.length * 0.2))
  const hours = top.reduce((sum, person) => sum + person[measure], 0), capacity = top.reduce((sum, person) => sum + person.capacity, 0)
  const hoursShare = ratio(hours, all[measure]), capacityShare = ratio(capacity, all.capacity)
  return { top: top.map((person) => ({ name: person.name, hours: person[measure] })), of: people.length, hoursShare, capacityShare, alert: hoursShare != null && capacityShare != null && hoursShare - capacityShare >= 10 }
}

// Rebalancing within the same role and month: overload (plan above capacity) can only move to headroom of that role
// in that month. People without a role are left out.
// Overload (plan above capacity) can move only to headroom of the same role in the same month, and only in current or
// future months. People without a role (Settings → Resources) are left out of the moves — not listed as relief needs or
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
