import type { AzureWorkItem } from './domain'
import type { CapacitySettings, Region } from './capacity.ts'
import { applyFilter, monthRange, noFilter, personMonths, totals, type PersonMonth } from './dashboard.ts'

// Capacity vs Actual (CVA-01…CVA-06): what the team had (capacity after absence) against what it booked (actual
// hours), for the month and the 11 before — tiles, a trend, each person and where the hours went. Read only.

export interface CvaFilter { region: string; epic: string; owner: string }
export const allCva: CvaFilter = { region: '', epic: '', owner: '' }
export type Band = 'Over' | 'On track' | 'Under' | 'No capacity'
export interface PersonRow { person: string; region: string; role: string; capacity: number; actual: number; plan: number; absence: number; used: number | null; band: Band }
const pct = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 1000) / 10 : null
const round = (value: number) => Math.round(value * 100) / 100

export function bandFor(used: number | null, settings: Pick<CapacitySettings, 'overloadedAt' | 'availableBelow'>): Band {
  if (used == null) return 'No capacity'
  if (used > settings.overloadedAt) return 'Over'
  if (used < settings.availableBelow) return 'Under'
  return 'On track'
}

export function capacityVsActual(input: { items: AzureWorkItem[]; month: string; today: string; settings: CapacitySettings }, filter: CvaFilter = allCva) {
  const { items, month, today, settings } = input
  const months = monthRange(month, 12)
  const rows = personMonths(items, months, today, settings)
  const epics = items.filter((item) => item.workItemType === 'Epic' && item.id !== settings.absenceEpicId && item.state.trim().toLowerCase() === 'active').sort((a, b) => a.title.localeCompare(b.title))
  const options = { regions: [...new Set(rows.map((row) => row.region).filter(Boolean))].sort() as Region[], epics, owners: [...new Set(rows.filter((row) => row.capacity || row.actual).map((row) => row.person))].sort() }
  // The Epic filter narrows the actual (and planned) hours to that stream; capacity stays the people's own.
  const epic = epics.find((entry) => entry.key === filter.epic)
  const scoped: PersonMonth[] = applyFilter(rows, { ...noFilter, regions: filter.region ? [filter.region as Region] : [], people: filter.owner ? [filter.owner] : [] })
  const hoursOf = (row: PersonMonth) => epic ? row.streams.filter((stream) => stream.key === epic.key) : row.streams
  const actualOf = (row: PersonMonth) => epic ? round(hoursOf(row).reduce((sum, stream) => sum + stream.actual, 0)) : row.actual
  const planOf = (row: PersonMonth) => epic ? round(hoursOf(row).reduce((sum, stream) => sum + stream.plan, 0)) : row.plan

  const trend = months.map((entry) => {
    const monthRows = scoped.filter((row) => row.month === entry)
    const capacity = totals(monthRows).capacity, actual = round(monthRows.reduce((sum, row) => sum + actualOf(row), 0))
    return { month: entry, capacity, actual, used: pct(actual, capacity) }
  })
  const now = trend[trend.length - 1], before = trend[trend.length - 2]

  const people: PersonRow[] = scoped.filter((row) => row.month === month && (row.capacity > 0 || actualOf(row) > 0)).map((row) => {
    const actual = actualOf(row), used = pct(actual, row.capacity)
    return { person: row.person, region: row.region ?? '', role: row.role ?? '', capacity: row.capacity, actual, plan: planOf(row), absence: row.absence, used, band: bandFor(used, settings) }
  }).sort((a, b) => (b.used ?? -1) - (a.used ?? -1) || a.person.localeCompare(b.person))

  // Where the actual hours went this month, per Epic (stream), largest first.
  const byEpic = new Map<string, { title: string; actual: number }>()
  for (const row of scoped.filter((entry) => entry.month === month)) for (const stream of hoursOf(row)) {
    const entry = byEpic.get(stream.key) ?? { title: stream.title, actual: 0 }
    entry.actual = round(entry.actual + stream.actual); byEpic.set(stream.key, entry)
  }
  const streams = [...byEpic.values()].filter((entry) => entry.actual > 0).sort((a, b) => b.actual - a.actual)

  const count = (band: Band) => people.filter((row) => row.band === band).length
  return {
    months, options, trend, people, streams,
    tiles: {
      capacity: { now: now.capacity, before: before?.capacity ?? null },
      actual: { now: now.actual, before: before?.actual ?? null },
      used: { now: now.used, before: before?.used ?? null },
      headroom: { now: round(now.capacity - now.actual), before: before ? round(before.capacity - before.actual) : null },
    },
    bands: { over: count('Over'), onTrack: count('On track'), under: count('Under') },
  }
}
export type CapacityVsActual = ReturnType<typeof capacityVsActual>
