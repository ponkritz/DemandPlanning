import type { PulseFill } from './pptxTemplate.ts'
import type { AzureWorkItem } from './domain'
import { approvalMonthOf } from './releaseSource.ts'

// Monthly pack (PCK): the two Pulse Check slides — the 2x2 (Actions/Deliverables, Observations, Focus Areas,
// Support Requested) and the Performance Pulse (Summary, Key takeaways, Decision required, Risks, Leadership support,
// KPI Pulse) — for the month before the header month. Generated from the data the app has (releases per stream,
// utilisation, Epic counts); everything else is text typed per month and kept in Git. The setup (which streams and
// Epics feed each slide line, which Epic each KPI reads) is shared in Git as monthly-pack-setup.json; the month's
// text as monthly-pack/<month>.json.
export const monthlyPackSetupFile = 'monthly-pack-setup.json'
export const monthlyPackNotesPath = (month: string) => `monthly-pack/${month}.json`
export type KpiMetric = 'open' | 'closed-month' | 'closed-ytd' | 'percent-closed' | 'utilization-month' | 'utilization-ytd' | 'manual'
export const kpiMetrics: Record<KpiMetric, string> = {
  open: 'Open items under the Epic', 'closed-month': 'Items closed in the month under the Epic', 'closed-ytd': 'Items closed this year under the Epic',
  'percent-closed': 'Closed share of the items under the Epic', 'utilization-month': 'Actual utilisation of the month', 'utilization-ytd': 'Actual utilisation this year', manual: 'Typed per month',
}
export interface PackLine { id: string; label: string; streams: string[]; epicIds: number[] }
export interface KpiRow { id: string; label: string; epicId?: number; metric: KpiMetric }
// department: the name before "| Performance Pulse update" in the title of the exported template (PCK-08).
export interface MonthlyPackSetup { schema: 1; lines: PackLine[]; kpis: KpiRow[]; department?: string }
// The slide text typed per month; blank until typed (suggestions are a later step).
export const noteKeys = ['summary', 'overallStatus', 'keyTakeaways', 'nextSteps', 'decisionRequired', 'risks', 'mitigation', 'leadershipSupport', 'observations', 'focusAreas', 'supportRequested'] as const
export type NoteKey = typeof noteKeys[number]
export const noteLabels: Record<NoteKey, string> = {
  summary: 'Summary', overallStatus: 'Overall status', keyTakeaways: 'Key takeaways (added)', nextSteps: 'Key next steps', decisionRequired: 'Decision required', risks: 'Risks (added)',
  mitigation: 'Proposed mitigation', leadershipSupport: 'Leadership support requested', observations: 'Observations, challenges & risks (added)', focusAreas: 'Focus areas for next months', supportRequested: 'Support requested / topics to highlight (added)',
}
export interface MonthlyPackNotes { schema: 1; month: string; text: Partial<Record<NoteKey, string>>; kpiValues: Record<string, string> }

export const defaultPackSetup: MonthlyPackSetup = {
  schema: 1,
  lines: [
    { id: 'serviceability', label: 'Serviceability', streams: ['S&S IT'], epicIds: [] },
    { id: 'dp', label: 'Digital Platform', streams: ['DP'], epicIds: [] },
    { id: 'cp', label: 'Clinical Platform', streams: ['CP'], epicIds: [] },
    { id: 'iocc', label: 'IOCC', streams: ['IOCC'], epicIds: [] },
    { id: 'ppu', label: 'PPU', streams: [], epicIds: [] },
    { id: 'content', label: 'Content', streams: ['Content'], epicIds: [] },
    { id: 'tools', label: 'Tool validation', streams: ['Tool Validations'], epicIds: [] },
  ],
  kpis: [
    { id: 'util', label: 'Utilization (YTD)', metric: 'utilization-ytd' },
    { id: 'teds', label: 'TEDs Compliance', metric: 'manual' },
    { id: 'ai-prod', label: 'AI-augmented productivity (YTD)', metric: 'manual' },
    { id: 'ai-comp', label: 'AI-competence plan execution (YTD)', metric: 'manual' },
    { id: 'certs', label: 'Maintain active certifications', metric: 'manual' },
    { id: 'capa', label: 'Overall CAPA Health', metric: 'manual' },
  ],
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value : '').replace(/\r\n/g, '\n').slice(0, max)
const idOf = (value: unknown, fallback: string) => (typeof value === 'string' && /^[a-z0-9-]{1,40}$/i.test(value) ? value : fallback)
const ids = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((entry): entry is number => Number.isInteger(entry) && entry > 0))] : []
const names = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim()))] : []

export function parsePackSetup(input: string): MonthlyPackSetup {
  const value = JSON.parse(input) as Partial<MonthlyPackSetup>
  if (!value || typeof value !== 'object' || value.schema !== 1) throw new Error('monthly-pack-setup.json is not a schema 1 file.')
  const lines = (Array.isArray(value.lines) ? value.lines : []).map((line, index) => ({ id: idOf(line?.id, `line-${index + 1}`), label: text(line?.label, 80).trim() || `Line ${index + 1}`, streams: names(line?.streams), epicIds: ids(line?.epicIds) }))
  const kpis = (Array.isArray(value.kpis) ? value.kpis : []).map((row, index) => ({ id: idOf(row?.id, `kpi-${index + 1}`), label: text(row?.label, 80).trim() || `KPI ${index + 1}`, ...(Number.isInteger(row?.epicId) && row!.epicId! > 0 ? { epicId: row!.epicId } : {}), metric: (row?.metric && row.metric in kpiMetrics ? row.metric : 'manual') as KpiMetric }))
  const department = text((value as { department?: unknown }).department, 80).trim()
  return { schema: 1, lines: unique(lines), kpis: unique(kpis), ...(department ? { department } : {}) }
}
const unique = <T extends { id: string }>(list: T[]) => { const seen = new Set<string>(); return list.filter((entry) => !seen.has(entry.id) && seen.add(entry.id)) }
export const serializePackSetup = (setup: MonthlyPackSetup) => `${JSON.stringify(setup, null, 2)}\n`

export const emptyNotes = (month: string): MonthlyPackNotes => ({ schema: 1, month, text: {}, kpiValues: {} })
export function parsePackNotes(input: string, month: string): MonthlyPackNotes {
  const value = JSON.parse(input) as Partial<MonthlyPackNotes>
  if (!value || typeof value !== 'object' || value.schema !== 1) throw new Error(`${monthlyPackNotesPath(month)} is not a schema 1 file.`)
  const notes = emptyNotes(month)
  for (const key of noteKeys) { const entry = text((value.text as Record<string, unknown> | undefined)?.[key], 20000); if (entry.trim()) notes.text[key] = entry }
  for (const [key, entry] of Object.entries(value.kpiValues ?? {})) if (/^[a-z0-9-]{1,40}$/i.test(key) && typeof entry === 'string' && entry.trim()) notes.kpiValues[key] = entry.slice(0, 200)
  return notes
}
export const serializePackNotes = (notes: MonthlyPackNotes) => `${JSON.stringify({ schema: 1, month: notes.month, text: Object.fromEntries(noteKeys.filter((key) => notes.text[key]?.trim()).map((key) => [key, notes.text[key]])), kpiValues: notes.kpiValues }, null, 2)}\n`

// ---- Epic counts ----
const finished = new Set(['closed', 'done', 'completed', 'resolved'])
const removed = (item: AzureWorkItem) => item.state.trim().toLowerCase() === 'removed'
export const isFinished = (item: Pick<AzureWorkItem, 'state'>) => finished.has(item.state.trim().toLowerCase())
// Every item below the Epics (Features, User Stories, Bugs, …; Tasks and the Epics themselves left out).
export function epicDescendants(items: AzureWorkItem[], epicIds: number[]): AzureWorkItem[] {
  const byParent = new Map<number, AzureWorkItem[]>()
  for (const item of items) if (item.parentId != null) byParent.set(item.parentId, [...(byParent.get(item.parentId) ?? []), item])
  const found: AzureWorkItem[] = [], seen = new Set<number>()
  const walk = (id: number) => { for (const child of byParent.get(id) ?? []) { if (seen.has(child.id)) continue; seen.add(child.id); if (child.workItemType !== 'Task' && child.workItemType !== 'Epic' && !removed(child)) found.push(child); walk(child.id) } }
  for (const id of epicIds) walk(id)
  return found
}
export const closedMonthOf = (item: AzureWorkItem, timeZone?: string) => item.closedDate ? approvalMonthOf(item.closedDate, timeZone) : isFinished(item) ? approvalMonthOf(item.changedDate, timeZone) : undefined
export const yearMonths = (month: string) => Array.from({ length: Number(month.slice(5)) }, (_, index) => `${month.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`)
export const sameMonthLastYear = (month: string) => `${Number(month.slice(0, 4)) - 1}-${month.slice(5)}`
const pct = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`

export interface Utilization { month: number | null; ytd: number | null; qeMonth: number | null }
export function kpiValue(row: KpiRow, items: AzureWorkItem[], month: string, utilization: Utilization, typed: string | undefined, timeZone?: string): string {
  if (row.metric === 'manual') return typed ?? ''
  if (row.metric === 'utilization-month') return pct(utilization.month)
  if (row.metric === 'utilization-ytd') return pct(utilization.ytd)
  if (!row.epicId) return typed ?? ''
  const below = epicDescendants(items, [row.epicId])
  if (row.metric === 'open') return String(below.filter((item) => !isFinished(item)).length)
  if (row.metric === 'closed-month') return String(below.filter((item) => closedMonthOf(item, timeZone) === month).length)
  if (row.metric === 'closed-ytd') { const months = new Set(yearMonths(month)); return String(below.filter((item) => { const closed = closedMonthOf(item, timeZone); return closed != null && months.has(closed) }).length) }
  return below.length ? `${Math.round(below.filter(isFinished).length / below.length * 100)}%` : '—'
}

// ---- The pack ----
export interface StreamMonth { name: string; releases: string[]; supported: number }
export interface PackInputs { month: string; setup: MonthlyPackSetup; notes: MonthlyPackNotes; items: AzureWorkItem[]; streamsOf: (month: string) => StreamMonth[]; utilization: Utilization; timeZone?: string }
export interface PackLineResult { id: string; label: string; releases: string[]; supported: number; ytd: number; lastYtd: number; change: number | null }
export interface MonthlyPack { month: string; lines: PackLineResult[]; overall: { supported: number; ytd: number; lastYtd: number; change: number | null }; utilization: Utilization; kpis: { id: string; label: string; value: string; manual: boolean; computed: string; overridden: boolean }[]; notes: MonthlyPackNotes }

const change = (now: number, before: number) => before > 0 ? Math.round((now - before) / before * 1000) / 10 : null
export function buildMonthlyPack(input: PackInputs): MonthlyPack {
  const { month, setup, notes, items, streamsOf, timeZone } = input
  // Every KPI can be overridden for the month: a value typed for a calculated KPI wins over the calculation. A typed
  // utilisation ("87%", "87.5") also replaces the calculated one in the generated lines (Summary, Capacity, Risks).
  const typedOf = (row: KpiRow) => notes.kpiValues[row.id]?.trim() || undefined
  const percent = (text: string | undefined) => { const match = text ? /^\s*(-?\d+(?:\.\d+)?)\s*%?\s*$/.exec(text) : null; return match ? Number(match[1]) : undefined }
  const typedUtil = (metric: KpiMetric) => percent(setup.kpis.map((row) => row.metric === metric ? typedOf(row) : undefined).find(Boolean))
  const utilization: Utilization = { ...input.utilization, ...(typedUtil('utilization-month') != null ? { month: typedUtil('utilization-month')! } : {}), ...(typedUtil('utilization-ytd') != null ? { ytd: typedUtil('utilization-ytd')! } : {}) }
  const cache = new Map<string, StreamMonth[]>()
  const monthStreams = (at: string) => { if (!cache.has(at)) cache.set(at, streamsOf(at)); return cache.get(at)! }
  // Epic-mapped lines count the Features closed in the month under those Epics, like a release each.
  const epicLine = (line: PackLine, at: string) => line.epicIds.length ? epicDescendants(items, line.epicIds).filter((item) => item.workItemType === 'Feature' && closedMonthOf(item, timeZone) === at) : []
  const supportedOf = (line: PackLine, at: string) => monthStreams(at).filter((stream) => line.streams.includes(stream.name)).reduce((sum, stream) => sum + stream.supported, 0) + epicLine(line, at).length
  const thisYear = yearMonths(month), lastYear = yearMonths(sameMonthLastYear(month))
  const lines = setup.lines.map((line) => {
    const releases = [...monthStreams(month).filter((stream) => line.streams.includes(stream.name)).flatMap((stream) => stream.releases), ...epicLine(line, month).map((item) => item.title)]
    const ytd = thisYear.reduce((sum, at) => sum + supportedOf(line, at), 0), lastYtd = lastYear.reduce((sum, at) => sum + supportedOf(line, at), 0)
    return { id: line.id, label: line.label, releases, supported: supportedOf(line, month), ytd, lastYtd, change: change(ytd, lastYtd) }
  })
  const overall = { supported: lines.reduce((sum, line) => sum + line.supported, 0), ytd: lines.reduce((sum, line) => sum + line.ytd, 0), lastYtd: lines.reduce((sum, line) => sum + line.lastYtd, 0), change: null as number | null }
  overall.change = change(overall.ytd, overall.lastYtd)
  const kpis = setup.kpis.map((row) => {
    const manual = row.metric === 'manual' || (row.metric !== 'utilization-month' && row.metric !== 'utilization-ytd' && !row.epicId)
    const computed = manual ? '' : kpiValue(row, items, month, input.utilization, undefined, timeZone), typed = typedOf(row)
    return { id: row.id, label: row.label, value: typed ?? computed, manual, computed, overridden: !manual && typed != null }
  })
  return { month, lines, overall, utilization, kpis, notes }
}

// ---- Slide text ----
const signed = (value: number | null) => value == null ? 'n/a' : `${value > 0 ? '+' : ''}${value}%`
export function monthLabel(month: string) { return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) }
const short = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })
export interface SlideBox { key: string; title: string; lines: string[]; generated: string[]; note?: NoteKey }
export interface Slide { title: string; subtitle: string; boxes: SlideBox[] }

export function capacityLine(pack: MonthlyPack) {
  const { month, utilization: u } = pack
  if (u.month == null) return ''
  return `Capacity: ${pct(u.month)} utilization (${short(month)})${u.qeMonth != null ? ` – QE – ${pct(u.qeMonth)} (${short(month)})` : ''}`
}
export function yoyLine(pack: MonthlyPack) {
  const withData = pack.lines.filter((line) => line.lastYtd > 0 || line.ytd > 0)
  if (!withData.length || pack.overall.lastYtd === 0) return ''
  const parts = withData.filter((line) => line.change != null).map((line) => `${signed(line.change)} in ${line.label}`)
  return `YoY support change of ${signed(pack.overall.change)} overall${parts.length ? ` – with ${parts.join(', ')}` : ''} (${short(pack.month)} YTD vs. last year)`
}
export const supportedLine = (pack: MonthlyPack) => pack.lines.filter((line) => line.supported > 0).map((line) => `${line.label} = ${line.supported}`).join('; ')
const noteLines = (notes: MonthlyPackNotes, key: NoteKey) => (notes.text[key] ?? '').split('\n').map((line) => line.trim()).filter(Boolean)

export function packSlides(pack: MonthlyPack): Slide[] {
  const { notes } = pack
  const deliverables = pack.lines.filter((line) => line.releases.length).map((line) => `${line.label} - ${line.releases.join(', ')}`)
  const capacity = capacityLine(pack), yoy = yoyLine(pack), supported = supportedLine(pack)
  const box = (key: string, title: string, generated: string[], note?: NoteKey): SlideBox => ({ key, title, generated, lines: [...generated, ...(note ? noteLines(notes, note) : [])], note })
  return [
    { title: '2x2', subtitle: monthLabel(pack.month), boxes: [
      box('deliverables', 'Actions/Deliverables Realized', deliverables),
      box('observations', 'Observations, Challenges & Risks', capacity ? [capacity] : [], 'observations'),
      box('focus', 'Focus Areas for Next Months', [], 'focusAreas'),
      box('support', 'Support Requested / Topics to Highlight', capacity ? [`${capacity} – Stretched Resources.`] : [], 'supportRequested'),
    ] },
    { title: 'Performance Pulse update', subtitle: `${monthLabel(pack.month)} Update`, boxes: [
      box('summary', 'Summary', pack.utilization.month != null ? [`Actual utilization was ${pct(pack.utilization.month)} in ${monthLabel(pack.month)}.`] : [], 'summary'),
      box('status', 'Overall status', [], 'overallStatus'),
      box('takeaways', 'Key takeaways', [...(yoy ? [yoy] : []), ...(supported ? [`Supported: ${supported}`] : [])], 'keyTakeaways'),
      box('next', 'Key next steps', [], 'nextSteps'),
      box('decision', 'Decision required', [], 'decisionRequired'),
      box('risks', 'Risks', pack.utilization.month != null && pack.utilization.month >= 100 ? [`Overload: ${pct(pack.utilization.month)} actual utilization${pack.utilization.qeMonth != null ? ` (QE ${pct(pack.utilization.qeMonth)})` : ''}`] : [], 'risks'),
      box('mitigation', 'Proposed mitigation', [], 'mitigation'),
      box('leadership', 'Leadership support requested', [], 'leadershipSupport'),
      box('kpi', 'KPI Pulse', pack.kpis.map((row) => `${row.label}: ${row.value || '—'}`)),
    ] },
  ]
}
// What the exported template is filled with (pptxTemplate.ts): the Performance Pulse boxes and the 2x2 boxes, as the
// pack shows them. The overall status is the first line typed for it (On Track when blank).
export function packFill(pack: MonthlyPack, department = ''): PulseFill {
  const [grid, pulse] = packSlides(pack)
  const lines = (slide: Slide, key: string) => slide.boxes.find((box) => box.key === key)?.lines ?? []
  return {
    department, monthLine: pulse.subtitle, summary: lines(pulse, 'summary'), status: lines(pulse, 'status')[0] ?? 'On Track',
    takeaways: lines(pulse, 'takeaways'), nextSteps: lines(pulse, 'next'), decision: lines(pulse, 'decision'), risks: lines(pulse, 'risks'), mitigation: lines(pulse, 'mitigation'), leadership: lines(pulse, 'leadership'),
    kpis: pack.kpis.map((row) => ({ label: row.label, value: row.value || '—' })),
    twoByTwo: { deliverables: lines(grid, 'deliverables'), observations: lines(grid, 'observations'), focus: lines(grid, 'focus'), support: lines(grid, 'support') },
  }
}
export const slideText = (slide: Slide) => [`${slide.title} — ${slide.subtitle}`, ...slide.boxes.flatMap((box) => ['', box.title, ...box.lines.map((line) => `• ${line}`)])].join('\n')
