import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { completedCount, defaultStreamReleases, type ReleaseStream } from './releaseOverview.ts'
import { windchillOptionsForView, windchillStreamExports } from './streams.ts'
import { windchillSupported } from './windchillReleases.ts'
import { isCounted } from './pulseStreams.ts'

// QV-68, MYD-25 Completed releases per stream and month, and their running total over a year — counted exactly as Pulse
// Check's Month tabs count them: an Azure stream's Releases count (completedCount: DP's Completed Releases, IOCC's
// Completed, CP's, Content's releases, Tool Validations' tools as QV-64, custom streams by their rule, and the counts an
// Admin entered for a month without data, QV-58), and a Windchill export's releases with a document dated in the month
// (its Supported line, QV-33). A month adds up the counts of its own Month tab, so a release counted in two months (a
// Windchill release with documents dated in both) counts in both — the Year row of the period table counts it once.
// Pure functions (tests/cumulative-releases.test.mjs).

export interface StreamMonthCount { name: string; completed: number }
// Windchill exports in the shape the Monthly pack reads (packInputs.ts WindchillData).
export interface WindchillInput { views: { id: string; name: string; exportFile?: string; columns: string[]; logic?: 'standard' | 'ecp'; projectLevel?: number }[]; sources: { viewId: string; columns: string[]; rows: Record<string, unknown>[] }[] }
type ReleaseState = Pick<AppState, 'azureSources' | 'releaseSource'> & Partial<Pick<AppState, 'releaseSourceSettings'>>

// The Windchill exports' releases of a month, one line per export (S&S IT, each ECP export, custom Windchill streams),
// exactly as Pulse Check's Supported summary lists them.
export function windchillLinesOf(windchill: WindchillInput, month: string): { name: string; releases: string[] }[] {
  return windchillStreamExports(windchill.views).map(({ name, view }) => {
    const source = view ? windchill.sources.find((entry) => entry.viewId === view.id) : undefined
    return { name, releases: source && view ? windchillSupported(source.rows, source.columns.length ? source.columns : view.columns, month, windchillOptionsForView(view)) : [] }
  })
}

// One month's Completed releases per stream from the month's streams and Windchill lines (the Month tab's numbers).
export const monthCounts = (streams: ReleaseStream[], windchill: { name: string; releases: string[] }[]): StreamMonthCount[] =>
  [...streams.map((stream) => ({ name: stream.name, completed: completedCount(stream) })), ...windchill.map((line) => ({ name: line.name, completed: line.releases.length }))]

// The same from the app's data: the default streams (built-in and custom, cached per month) and the Windchill exports.
export const completedOf = (state: ReleaseState, profiles: AzureConnectionProfileSummary[], windchill: WindchillInput, month: string): StreamMonthCount[] =>
  monthCounts(defaultStreamReleases(state, profiles, month), windchillLinesOf(windchill, month))

// The months of a calendar year, January to December.
export const yearMonthsOf = (year: string | number) => Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)

export interface CumulativeLine { name: string; monthly: (number | null)[]; cumulative: (number | null)[] }
export interface CumulativeYear {
  months: string[]
  elapsed: number // the months up to the current one: later months stay empty (null)
  streams: CumulativeLine[] // the counted streams, in the default order
  total: CumulativeLine // "All streams": each month's sum over the counted streams and its running total
  excluded: string[] // the streams the Streams filter leaves out (QV-66), in the streams' spelling
}

// The running totals of a year: months — January to December; perMonth[i] — the counts of months[i] (only the months up
// to today are read, so later ones may be empty); excluded — the Streams filter's list. A stream not counted has no line
// and stays out of the sums.
export function cumulativeYear(months: string[], perMonth: StreamMonthCount[][], today: string, excluded: string[] = []): CumulativeYear {
  const current = today.slice(0, 7)
  const elapsed = months.filter((month) => month <= current).length
  const names: string[] = []
  const seen = new Set<string>()
  for (const list of perMonth.slice(0, elapsed)) for (const entry of list) { const key = entry.name.trim().toLowerCase(); if (!seen.has(key)) { seen.add(key); names.push(entry.name) } }
  const counted = names.filter((name) => isCounted(excluded, name))
  const countOf = (index: number, name: string) => (perMonth[index] ?? []).filter((entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase()).reduce((sum, entry) => sum + entry.completed, 0)
  const lineOf = (name: string, monthly: number[]): CumulativeLine => {
    let running = 0
    return { name, monthly: months.map((_, index) => index < elapsed ? monthly[index] : null), cumulative: months.map((_, index) => { if (index >= elapsed) return null; running += monthly[index]; return running }) }
  }
  const streams = counted.map((name) => lineOf(name, months.map((_, index) => index < elapsed ? countOf(index, name) : 0)))
  const total = lineOf('All streams', months.map((_, index) => streams.reduce((sum, line) => sum + (line.monthly[index] ?? 0), 0)))
  return { months, elapsed, streams, total, excluded: names.filter((name) => !isCounted(excluded, name)) }
}

// QV-69 The panel's switches, remembered per person (personal views entry `pulse-cumulative`; in this browser without
// them): a line per stream (on), the All streams line (off) and the columns of each month's sum (on).
export const cumulativeViewKey = 'pulse-cumulative'
export interface CumulativeSwitches { streams: boolean; all: boolean; sums: boolean }
export const defaultSwitches: CumulativeSwitches = { streams: true, all: false, sums: true }
export function readSwitches(value: unknown): CumulativeSwitches | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const input = value as Record<string, unknown>
  const flag = (key: keyof CumulativeSwitches) => typeof input[key] === 'boolean' ? input[key] as boolean : defaultSwitches[key]
  return { streams: flag('streams'), all: flag('all'), sums: flag('sums') }
}

// MYD-25 The dashboard source's rows: one per stream and month of the period up to the current month (a month with none
// is a 0, so a line with Running total has every month), every stream (built-in, custom, each Windchill export), with
// whether the person's own Pulse Check Streams filter counts it.
export interface CompletedRow { stream: string; month: string; completed: number; counted: boolean }
export function completedRows(months: string[], countsOf: (month: string) => StreamMonthCount[], today: string, excluded: string[] = []): CompletedRow[] {
  const current = today.slice(0, 7)
  return months.filter((month) => month <= current).flatMap((month) => countsOf(month).map((entry) => ({ stream: entry.name, month, completed: entry.completed, counted: isCounted(excluded, entry.name) })))
}
