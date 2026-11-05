import type { AzureWorkItem } from './domain'
import type { ReleaseStream } from './releaseOverview.ts'
import { flowTypes, workFlow, type FlowCount, type FlowStream, type FlowType } from './pulseCheck.ts'

// Pulse Check over a longer period (QV-50): calendar quarters (Q1 = Jan–Mar), half-years (H1 = Jan–Jun) and years, each
// compared with the previous period of the same length. A month stays the Pulse Check of one month.
export type PeriodKind = 'month' | 'quarter' | 'half' | 'year'
export const periodKinds: [PeriodKind, string][] = [['month', 'Month'], ['quarter', 'Quarter'], ['half', 'Half-year'], ['year', 'Year']]
export interface PulsePeriod { kind: PeriodKind; key: string; label: string; months: string[] }

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const length: Record<PeriodKind, number> = { month: 1, quarter: 3, half: 6, year: 12 }
const pad = (value: number) => String(value).padStart(2, '0')

// The period of a kind that holds the month ("2026-08" → Q3 2026, H2 2026, 2026).
export function periodContaining(kind: PeriodKind, month: string): PulsePeriod {
  const [year, number] = month.split('-').map(Number)
  const size = length[kind], index = Math.floor((number - 1) / size), first = index * size + 1
  const months = Array.from({ length: size }, (_, offset) => `${year}-${pad(first + offset)}`)
  const label = kind === 'month' ? `${monthNames[number - 1]} ${year}` : kind === 'quarter' ? `Q${index + 1} ${year}` : kind === 'half' ? `H${index + 1} ${year}` : String(year)
  const key = kind === 'month' ? month : kind === 'quarter' ? `${year}-Q${index + 1}` : kind === 'half' ? `${year}-H${index + 1}` : String(year)
  return { kind, key, label, months }
}
const monthBefore = (month: string) => { const [year, number] = month.split('-').map(Number); return number === 1 ? `${year - 1}-12` : `${year}-${pad(number - 1)}` }
// The period of the same length just before (Q1 2027 → Q4 2026).
export const previousPeriod = (period: PulsePeriod) => periodContaining(period.kind, monthBefore(period.months[0]))
// The latest periods up to the one that holds the month, newest first.
export function recentPeriods(kind: PeriodKind, month: string, count = 8): PulsePeriod[] {
  const list = [periodContaining(kind, month)]
  while (list.length < count) list.push(previousPeriod(list[list.length - 1]))
  return list
}

// A stream's releases over the months of a period: each release once, however many months it shows in (the same name
// and number, or for DP the same Supported Release); documents add up.
export interface PeriodStream { name: string; releases: string[]; documents: number; supported?: string[] }
const releaseLabel = (release: { type?: string; name: string; release: string }) => [release.type, release.name, release.release].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
export function periodStreams(perMonth: ReleaseStream[][], extra: { name: string; releases: string[] }[][] = []): PeriodStream[] {
  type Found = { releases: Map<string, string>; documents: number; supported?: Map<string, string> }
  const streams = new Map<string, Found>()
  const entry = (name: string): Found => { const found: Found = streams.get(name) ?? { releases: new Map<string, string>(), documents: 0 }; streams.set(name, found); return found }
  for (const month of perMonth) for (const stream of month) {
    const found = entry(stream.name)
    for (const release of stream.releases) { const label = releaseLabel(release); if (label && !found.releases.has(label.toLowerCase())) found.releases.set(label.toLowerCase(), label) }
    found.documents += stream.documents
    if (stream.supportedEntries) { found.supported ??= new Map(); for (const supported of stream.supportedEntries) found.supported.set(supported.key, supported.label) }
  }
  for (const month of extra) for (const line of month) { const found = entry(line.name); for (const label of line.releases) if (label.trim() && !found.releases.has(label.trim().toLowerCase())) found.releases.set(label.trim().toLowerCase(), label.trim()) }
  return [...streams].map(([name, found]) => ({ name, releases: [...found.releases.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), documents: found.documents, ...(found.supported ? { supported: [...found.supported.values()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) } : {}) }))
}
export interface PeriodChange { name: string; releases: number; previousReleases: number; documents: number; previousDocuments: number; supported?: number; previousSupported?: number; list: string[] }
// Each stream of either period, in the order of the current period's streams, then any only in the previous one.
export function periodComparison(current: PeriodStream[], previous: PeriodStream[]): PeriodChange[] {
  const names = [...new Set([...current, ...previous].map((stream) => stream.name))]
  return names.map((name) => {
    const now = current.find((stream) => stream.name === name), before = previous.find((stream) => stream.name === name)
    const supported = now?.supported || before?.supported ? { supported: now?.supported?.length ?? 0, previousSupported: before?.supported?.length ?? 0 } : {}
    return { name, releases: now?.releases.length ?? 0, previousReleases: before?.releases.length ?? 0, documents: now?.documents ?? 0, previousDocuments: before?.documents ?? 0, ...supported, list: now?.releases ?? [] }
  })
}

// Features and User Stories opened and closed over the months of a period, per stream (workFlow summed month by month).
export function periodWorkFlow(source: AzureWorkItem[], months: string[], absenceEpicId?: number, include?: (item: AzureWorkItem) => boolean) {
  const streams = new Map<string, FlowStream>()
  for (const month of months) for (const stream of workFlow(source, month, absenceEpicId, undefined, include).streams) {
    const found = streams.get(stream.key) ?? { ...stream, counts: { 'Feature': { created: 0, closed: 0 }, 'User Story': { created: 0, closed: 0 } } }
    for (const type of flowTypes) { found.counts[type].created += stream.counts[type].created; found.counts[type].closed += stream.counts[type].closed }
    streams.set(stream.key, found)
  }
  const sum = (type: FlowType, kind: keyof FlowCount) => [...streams.values()].reduce((total, stream) => total + stream.counts[type][kind], 0)
  const totals = Object.fromEntries(flowTypes.map((type) => [type, { created: sum(type, 'created'), closed: sum(type, 'closed') }])) as Record<FlowType, FlowCount>
  const weight = (stream: FlowStream) => flowTypes.reduce((total, type) => total + stream.counts[type].created + stream.counts[type].closed, 0)
  return { streams: [...streams.values()].sort((a, b) => weight(b) - weight(a) || a.title.localeCompare(b.title)), totals }
}
