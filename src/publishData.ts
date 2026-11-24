import { periodMonths, periodOf, type Period } from './dashboard.ts'
import { narrowRows, pageDataset, pageSource, type Dashboard, type DashboardBlock, type Dataset, type ViewerFilter } from './dashboardPages.ts'
import { fieldText, narrowInsightRows, periodText, readChoice, resolveFilterSetup, type ViewerChoice } from './insightFilters.ts'
import { lastUpdate, withoutHidden, type ColorPins, type Insight, type InsightFilterSetup, type OnDemandColumn, type OnDemandPage, type OnDemandRow } from './onDemand.ts'
import { noneLabel } from './onDemandInsights.ts'

// OND-90…OND-99 Publish an interactive HTML dashboard: the data a published file holds — only the rows that pass the
// publisher's filters at publish time (a table page: the Insights filter row, OND-50…OND-60; an On-Demand Dashboard:
// its period and filter row, DSH-07, for each data source only the rows a block counts), never a hidden row (OND-39),
// with the page's or dashboard's definition (columns, charts / blocks, tabs, filters, sizes, colours) and who published
// it, when and with which filters. No token, no Git path, no address. Kept free of React and of the DOM so that every
// rule is tested on its own (tests/standalone-html.test.mjs); the viewer (src/standalone/) reads the same shapes.

export const publishedSchema = 1
// The id of the file's JSON data block (src/standaloneHtml.ts writes it, the viewer reads it).
export const dataElementId = 'dp-published'
// A row as published: its id, key and number, who added it and when, who changed it last and when, and its cells — no
// update log (old values), no hidden flag.
export interface PublishedRow { id: string; key?: string; seq?: number; addedBy?: string; addedAt?: string; updatedBy?: string; updatedAt?: string; cells: OnDemandRow['cells'] }
// A table page as published: all — its rows that are not hidden; rows — those that pass the cut.
export interface PublishedSource { id: string; name: string; description: string; keyPrefix: string; columns: OnDemandColumn[]; insights: Insight[]; insightFilters?: InsightFilterSetup; colors?: ColorPins; rows: PublishedRow[]; all: number }
export interface PublishedDashboard { tabs: Dashboard['tabs']; filters: ViewerFilter[]; blocks: DashboardBlock[]; colors?: ColorPins }
// by / at: "Published by {by} on {at}" (at in the publisher's time zone, OND-71); cut: the filters the data was cut
// with, one entry each ("Found on: Q3 2026", "Department: QRE"), empty = every row; rows / all: rows in the file and
// rows the page(s) have (not hidden); notes: what was left out and why.
export interface PublishedMeta { by: string; at: string; atIso: string; cut: string[]; rows: number; all: number; notes: string[]; scheduled?: boolean }
export interface PublishedFile { schema: 1; kind: 'table' | 'dashboard'; name: string; description: string; meta: PublishedMeta; sources: PublishedSource[]; dashboard?: PublishedDashboard; charts: boolean }

// What a publish is cut with: a table page's Insights filter row choice, or a dashboard's period and filter values.
export type PublishCut = { kind: 'table'; choice: ViewerChoice } | { kind: 'dashboard'; period: Period; choices: Record<string, string[]> }
const noPeriod = (): Period => ({ years: [], quarters: [], months: [] })
// A cut read back strictly (it is kept with a schedule in local storage, OND-96): anything not of the shape is dropped.
export function readCut(raw: unknown): PublishCut | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as { kind?: unknown; choice?: unknown; period?: unknown; choices?: unknown }
  if (value.kind === 'table') return { kind: 'table', choice: readChoice(value.choice) }
  if (value.kind !== 'dashboard') return undefined
  const choices: Record<string, string[]> = {}
  if (value.choices && typeof value.choices === 'object' && !Array.isArray(value.choices)) {
    for (const [id, list] of Object.entries(value.choices as Record<string, unknown>).slice(0, 20)) {
      if (!/^[\w-]{1,40}$/.test(id) || !Array.isArray(list)) continue
      const kept = [...new Set(list.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.slice(0, 120)))].slice(0, 200)
      if (kept.length) choices[id] = kept
    }
  }
  return { kind: 'dashboard', period: periodOf(value.period, noPeriod()), choices }
}

export function publishedRow(row: OnDemandRow): PublishedRow {
  const last = lastUpdate(row)
  const out: PublishedRow = { id: row.id, cells: row.cells }
  if (row.key) out.key = row.key
  if (row.seq) out.seq = row.seq
  if (row.addedBy) out.addedBy = row.addedBy
  if (row.addedAt) out.addedAt = row.addedAt
  if (last && (last.at !== row.addedAt || last.by !== (row.addedBy ?? ''))) { out.updatedBy = last.by; out.updatedAt = last.at }
  return out
}
function source(page: OnDemandPage, rows: OnDemandRow[], all: number, charts: boolean): PublishedSource {
  const out: PublishedSource = { id: page.id, name: page.name, description: page.description, keyPrefix: page.keyPrefix, columns: page.columns, insights: charts ? page.insights : [], rows: rows.map(publishedRow), all }
  if (charts && page.insightFilters) out.insightFilters = page.insightFilters
  if (page.colors) out.colors = page.colors
  return out
}
// The page the viewer's charts read: the published source as an On-Demand page (rows without log or hidden flag).
export function sourcePage(published: PublishedSource): OnDemandPage {
  return { schema: 1, kind: 'on-demand-page', id: published.id, name: published.name, description: published.description, keyPrefix: published.keyPrefix, columns: published.columns, insights: published.insights, ...(published.insightFilters ? { insightFilters: published.insightFilters } : {}), ...(published.colors ? { colors: published.colors } : {}),
    rows: published.rows.map((row) => ({ id: row.id, key: row.key, seq: row.seq, addedBy: row.addedBy, addedAt: row.addedAt, cells: row.cells })) }
}
export const sampleRefusal = (name: string) => `Sample data is shown for ${name}: switch to Live to publish.`
const rowsText = (count: number) => `${count} row${count === 1 ? '' : 's'}`

// OND-91 A table page: its rows that are not hidden and pass the publisher's Insights filter row (period and filters,
// as the charts count them, OND-54); a Table page (no Insights) or one without a filter row: every row not hidden.
export function cutTablePage(page: OnDemandPage, { kind, choice, publishedBy, now, at, scheduled = false, previouslyFullTable = false }: { kind: string; choice: ViewerChoice; publishedBy: string; now: Date; at: string; scheduled?: boolean; previouslyFullTable?: boolean }): PublishedFile {
  if (page.sample) throw new Error(sampleRefusal(page.name))
  const visible = withoutHidden(page)
  const charts = kind === 'table-insights'
  const currentYear = Number(now.toISOString().slice(0, 4))
  const setup = charts && !previouslyFullTable ? resolveFilterSetup(visible) : { fields: [], dropped: [] }
  const narrowed = narrowInsightRows(visible, setup, choice, currentYear)
  const cut = !narrowed.active ? [] : [
    setup.period && narrowed.months ? `${setup.period.name}: ${periodText(narrowed.months, currentYear, choice.period)}` : '',
    ...setup.fields.map((column) => fieldText(column, choice.fields[column.id], narrowed.currencies[column.id])),
  ].filter(Boolean)
  const notes = narrowed.noDate && setup.period ? [`${rowsText(narrowed.noDate)} without a date in ${setup.period.name} left out by the period.`] : []
  const rows = narrowed.page.rows
  return { schema: 1, kind: 'table', name: page.name, description: page.description, charts: charts && visible.insights.length > 0,
    meta: { by: publishedBy, at, atIso: now.toISOString(), cut, rows: rows.length, all: visible.rows.length, notes, ...(scheduled ? { scheduled } : {}) },
    sources: [source(visible, rows, visible.rows.length, charts)] }
}

// OND-92 The rows of one data source a dashboard counts: those that pass at least one block over it (its period
// column in the months, the filter row's values of that source). Used for the cut at publish time and in the viewer.
export function dashboardRows(blocks: DashboardBlock[], dataset: Dataset, months: string[] | null, filters: ViewerFilter[], choices: Record<string, string[]>): OnDemandRow[] {
  const kept = new Set<string>()
  for (const block of blocks) if (block.source === dataset.key) for (const row of narrowRows(dataset, block, months, filters, choices).page.rows) kept.add(row.id)
  return dataset.page.rows.filter((row) => kept.has(row.id))
}
// The dashboard's filter row as words: "Department: QRE, Scrap"; a column found in two sources says which.
export function dashboardFilterLabel(filter: ViewerFilter, filters: ViewerFilter[], sourceOf: (key: string) => { name: string; columns: OnDemandColumn[] } | undefined) {
  const found = sourceOf(filter.source)
  const name = found?.columns.find((column) => column.id === filter.column)?.name ?? '(removed column)'
  return filters.some((other) => other.column === filter.column && other.source !== filter.source) ? `${name} (${found?.name ?? '?'})` : name
}

// OND-92 An On-Demand Dashboard: for each table page a block reads, its rows that are not hidden and that a block
// counts with the publisher's period (nothing ticked: the current year, DSH-07) and filter values; blocks over the
// Time Writing hours or over a page that is gone are left out (named in the notes); a page in Sample refuses it.
export function cutDashboard({ name, description, dashboard, pageOf, period, choices, publishedBy, now, at, scheduled = false }: { name: string; description: string; dashboard: Dashboard; pageOf: (id: string) => OnDemandPage | null; period: Period; choices: Record<string, string[]>; publishedBy: string; now: Date; at: string; scheduled?: boolean }): PublishedFile {
  const notes: string[] = []
  const pages = new Map<string, OnDemandPage>()
  for (const block of dashboard.blocks) {
    const id = block.source.startsWith('page:') ? block.source.slice(5) : ''
    if (!id || pages.has(id)) continue
    const found = pageOf(id)
    if (found?.sample) throw new Error(sampleRefusal(found.name))
    if (found) pages.set(id, withoutHidden(found))
  }
  const blocks = dashboard.blocks.filter((block) => pages.has(block.source.slice(5)) && block.source.startsWith('page:'))
  const hours = dashboard.blocks.filter((block) => !block.source.startsWith('page:')).length
  if (hours) notes.push(`${hours} block${hours === 1 ? '' : 's'} over the Time Writing hours ${hours === 1 ? 'is' : 'are'} not published.`)
  const missing = dashboard.blocks.length - blocks.length - hours
  if (missing) notes.push(`${missing} block${missing === 1 ? '' : 's'} over a table page that is no longer there ${missing === 1 ? 'is' : 'are'} left out.`)
  const filters = dashboard.filters.filter((filter) => pages.has(filter.source.slice(5)) && filter.source.startsWith('page:'))
  const kept = Object.fromEntries(Object.entries(choices).filter(([id, list]) => list.length && filters.some((filter) => filter.id === id)))
  const currentYear = Number(now.toISOString().slice(0, 4))
  const months = periodMonths(period, currentYear)
  const sources: PublishedSource[] = []
  for (const page of pages.values()) {
    const dataset = pageDataset(page)
    sources.push(source(page, dashboardRows(blocks, dataset, months, filters, kept), page.rows.length, false))
  }
  const sourceOf = (key: string) => sources.find((entry) => pageSource(entry.id) === key)
  const cut = [
    blocks.some((block) => block.period) ? `Period: ${periodText(months, currentYear, period)}` : '',
    ...filters.filter((filter) => kept[filter.id]?.length).map((filter) => `${dashboardFilterLabel(filter, filters, sourceOf)}: ${kept[filter.id].map((value) => value || noneLabel).join(', ')}`),
  ].filter(Boolean)
  const out: PublishedDashboard = { tabs: dashboard.tabs, filters, blocks }
  if (dashboard.colors) out.colors = dashboard.colors
  return { schema: 1, kind: 'dashboard', name, description, charts: blocks.length > 0, dashboard: out, sources,
    meta: { by: publishedBy, at, atIso: now.toISOString(), cut, rows: sources.reduce((sum, entry) => sum + entry.rows.length, 0), all: sources.reduce((sum, entry) => sum + entry.all, 0), notes, ...(scheduled ? { scheduled } : {}) } }
}

// OND-93 The header's line: "Data published: Found on: Q3 2026 · Department: QRE · 34 of 120 rows".
export function cutLine(file: Pick<PublishedFile, 'meta'>) {
  const { cut, rows, all } = file.meta
  return `Data published: ${cut.length ? cut.join(' · ') : 'every row (no filter)'} · ${rows} of ${rowsText(all)}`
}
// The words of a cut for the publish pop-up (a schedule's saved filters, OND-96).
export const cutSummary = (file: Pick<PublishedFile, 'meta'>) => file.meta.cut.length ? file.meta.cut.join(' · ') : 'no filter (every row)'

// The viewer reads the data block back: a published file of this schema, else null (the viewer says it cannot show it).
export function readPublished(text: string | null | undefined): PublishedFile | null {
  try {
    const value = JSON.parse(text ?? 'null') as Partial<PublishedFile> | null
    if (!value || value.schema !== publishedSchema || (value.kind !== 'table' && value.kind !== 'dashboard') || !Array.isArray(value.sources) || !value.meta || typeof value.name !== 'string') return null
    if (value.kind === 'dashboard' && (!value.dashboard || !Array.isArray(value.dashboard.blocks))) return null
    return value as PublishedFile
  } catch { return null }
}
