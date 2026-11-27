import { csvCell } from './csv.ts'
import { merge3 } from './gitSaveQueue.ts'
import { blankNarrative, cleanOptions, hasOptions, measureKeys, moneyOf, narrativeError, narrativeOut, parseColors, parseNarrative, pivotLevels, pivotLevelsOut, valuesOf, type ChartOptions, type Narrative, type Insight, type InsightFilter, type InsightMeasure, type OnDemandColumn, type OnDemandPage, type OnDemandRow, type ColorPins } from './onDemand.ts'
import { parseQueryRefs, queryOfSource, queryRefOut, type AzureQueryRef } from './azureQueryRef.ts'
import { bucketsOf, categoryColumns, chartData, pivotColumnFields, pivotRowFields, dateGroupLabels, filterColumns, formatValue, grainOf, insightProblems, kpiData, measureText, noneKey, numberOf, otherKey, passesFilter, secondColumns, valueColumns, withType, type ChartData } from './onDemandInsights.ts'

// DSH-01…DSH-12 On-Demand Dashboard pages: a page type of the page builder (PGB-01) that is read only for everyone and
// built by its owners from blocks — KPI tiles, bar, line and pie charts and summary tables — over the rows of any table
// page (On-Demand, Table, Table + Insights). A block is an On-Demand insight (OND-11…OND-17)
// with a data source, the Date column the dashboard's period applies to and the tab it is on, so the aggregation, the
// currency rule and the charts are the On-Demand ones. The definition is one file per page in the Git data repository,
// dashboards/<page-id>.json, next to the page's own file (on-demand/<page-id>.json keeps its name and description).
// Kept free of React so that every rule is tested on its own (tests/dashboard-pages.test.mjs).

export type BlockType = 'kpi' | 'bar' | 'line' | 'pie' | 'table' | 'pareto' | 'narrative'
export const blockTypes: { key: BlockType; label: string; hint: string }[] = [
  { key: 'kpi', label: 'KPI tile', hint: 'One number: the count, sum or average of the rows, shown as a tile above the tabs.' },
  { key: 'bar', label: 'Bar chart', hint: 'A value per category, optionally stacked by a Dropdown or Multi-select.' },
  { key: 'line', label: 'Line chart', hint: 'A value per month of a Date column.' },
  { key: 'pie', label: 'Pie chart', hint: 'Each category’s share of the total; more than 5 categories: the 5 largest and “Other”.' },
  { key: 'pareto', label: 'Pareto chart', hint: 'Categories largest first as columns, the cumulative share (%) as a line on a 0–100% axis and an 80% line.' },
  { key: 'table', label: 'Pivot table', hint: 'Rows by up to 3 fields (largest first) and optional columns by up to 2, with subtotals and totals; groups open and close, a click lists the rows behind a number; the first 10 rows, Show all, Export.' },
  { key: 'narrative', label: 'Narrative (text)', hint: 'Sentences about the measure — the total, the highest and lowest, the change against the previous period — and rules of your own, as plain text (CHT-60).' },
]
export const blockTypeLabel = (type: BlockType) => blockTypes.find((entry) => entry.key === type)?.label ?? type
const blockTypeKeys = blockTypes.map((entry) => entry.key)

export interface DashboardBlock {
  id: string; title: string; type: BlockType
  source: string // 'page:<page id>' (DSH-04) or 'hours:time-writing' (DSH-16: the Time Writing hours)
  category: string; second: string; measure: InsightMeasure; value: string; filters: InsightFilter[]; sort: 'value' | 'label'
  period: string // the Date column the dashboard's period filters on; '' = not filtered by period
  tab: string // the tab the block is on (a KPI tile: the tab it opens); '' = the first tab
  options?: ChartOptions // CHT: the chart's display options, as an insight's
  narrative?: Narrative // CHT-60: a Narrative's sentences and rules, as an insight's
  hideStatus?: boolean // TVL-26: a block on the Tool Validations master list or expiry list without Status and Days left
  rows2?: string; rows3?: string; second2?: string // CHT-79: a Pivot table's nested rows and columns, as an insight's
}
export interface DashboardTab { id: string; name: string }
// A filter of the filter row: the viewer ticks values of a Dropdown / Multi-select column of one data source.
export interface ViewerFilter { id: string; source: string; column: string }
// colors (CHT-09): the dashboard's colour pins, a value's text → palette colour 1…5 or #rrggbb (CHT-41), used by every block's chart.
// queries (DSH-18): the saved Azure DevOps queries the owners added as data sources — references only (azureQueryRef.ts).
export interface Dashboard { schema: 1; kind: 'dashboard'; id: string; tabs: DashboardTab[]; filters: ViewerFilter[]; blocks: DashboardBlock[]; colors?: ColorPins; queries?: AzureQueryRef[] }

export const dashboardFolder = 'dashboards'
export const dashboardPath = (id: string) => `${dashboardFolder}/${id}.json`
export const maxBlocks = 40, maxTabs = 10, maxViewerFilters = 6, maxBlockFilters = 10, maxTitle = 120, maxTabName = 40
export const dashboardMaxBytes = 200_000
const idPattern = /^[A-Za-z0-9][\w-]{0,39}$/
const pageIdPattern = /^[a-z0-9][a-z0-9-]{0,39}$/
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
export const emptyDashboard = (id: string): Dashboard => ({ schema: 1, kind: 'dashboard', id, tabs: [], filters: [], blocks: [] })
export function dashId(prefix: 'b' | 't' | 'f', random: () => number = Math.random, now: () => number = Date.now) {
  return `${prefix}${now().toString(36)}${Math.floor(random() * 36 ** 5).toString(36).padStart(5, '0')}`
}
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''

// ---- data sources (DSH-03, DSH-04) ----
// A data source is a table page, named 'page:<page id>', (DSH-16) the Time Writing hours, 'hours:time-writing'
// (src/dashboardHours.ts), or (TVL-18) the Tool Validations master list 'tools:master' and expiry list 'tools:expiry'
// (src/dashboardSources.ts); the pattern is the one place where a kind of source is added. A file naming another kind is
// dropped block by block (DSH-08).
export const pageSource = (pageId: string) => `page:${pageId}`
export const hoursSource = 'hours:time-writing'
export const hoursSourceName = 'Time Writing hours'
// DSH-17, DSH-18: an Azure DevOps query the app reads ('azv:<connection id>', a My view 'azm:<connection id>') or a saved
// query the owners added to the dashboard ('azq:<reference id>').
export const sourcePattern = /^(page:[a-z0-9][a-z0-9-]{0,39}|hours:time-writing|tools:master|tools:expiry|azq:[A-Za-z0-9][\w-]{0,39}|azv:[A-Za-z0-9_-]{1,80}|azm:[A-Za-z0-9_-]{1,80})$/
// TVL-26: the Tool Validations sources and their expiry status fields (Status, Days left), which a block may leave out.
export const isToolSource = (source: string) => source === 'tools:master' || source === 'tools:expiry'
export const toolStatusColumns = ['tv-status', 'tv-days']
export const pageOfSource = (source: string) => source.startsWith('page:') ? source.slice(5) : ''

// A data source as the blocks see it: rows in the shape of an On-Demand page, so the On-Demand aggregation applies.
// kind: how the block editor names it ('table page' unless given); note: the line under the editor's Data source.
// statusDays (TVL-26): the team default window the Tool Validations sources' Status is worked out with.
// capped (DSH-21): why the rows are not complete (an Azure query over 5,000 rows or 30 columns); readAt: when they were read.
export interface Dataset { key: string; name: string; page: OnDemandPage; problem?: string; kind?: string; note?: string; statusDays?: number; capped?: string; readAt?: string }
const asPage = (id: string, name: string, columns: OnDemandColumn[], rows: OnDemandRow[]): OnDemandPage => ({ schema: 1, kind: 'on-demand-page', id, name, description: '', keyPrefix: 'DSH', columns, rows, insights: [] })
// A table page's rows as saved in Git (the viewer's unsaved changes are not shown).
export const pageDataset = (page: OnDemandPage): Dataset => ({ key: pageSource(page.id), name: page.name, page })
export const missingDataset = (source: string, problem: string): Dataset => ({ key: source, name: source === hoursSource ? hoursSourceName : pageOfSource(source), page: asPage('missing', '', [], []), problem, ...(source === hoursSource ? { kind: 'as in Team overview' } : {}) })
export const datasetPage = asPage
// DSH-03: the data sources offered — every table page as saved in Git, except dashboards and the page itself, by name.
// PGB-24 (LIM-253): a Table (Query) page holds no rows in Git — its query is added to a dashboard with ＋ Add Azure query….
export function dataSources(pages: OnDemandPage[], saved: (id: string) => OnDemandPage | null, isDashboard: (id: string) => boolean, self: string): Dataset[] {
  return pages.filter((page) => page.id !== self && !isDashboard(page.id) && !page.source).flatMap((page) => { const stored = saved(page.id); return stored ? [pageDataset(stored)] : [] })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))
}

// ---- the file (DSH-08) ----
// Read and validated: a file that is not a dashboard is refused whole (the dashboard last read is kept); a bad block is
// dropped with a message saying why (unknown type, bad id, repeated id, no title, unknown data source); at most 40
// blocks, 10 tabs and 6 filters; a reference to a column is kept as written and the block says when it no longer fits
// (as OND-17). expectedId: the file's name, which wins over the id inside.
export interface ParsedDashboard { dashboard: Dashboard; dropped: string[] }
const ref = (value: unknown) => typeof value === 'string' && idPattern.test(value) ? value : ''
// pattern: the data sources a block may name (MYD-15: My dashboard's registry passes its own, src/dashboardSources.ts).
export function parseDashboard(raw: string, expectedId?: string, pattern: RegExp = sourcePattern): ParsedDashboard {
  const where = expectedId ? dashboardPath(expectedId) : 'The dashboard'
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new Error(`${where} is not valid JSON.`) }
  const file = data as Partial<Record<keyof Dashboard, unknown>> | null
  if (!file || typeof file !== 'object' || Array.isArray(file) || file.kind !== 'dashboard' || file.schema !== 1 || !Array.isArray(file.blocks ?? [])) throw new Error(`${where} is not a dashboard (schema 1, kind dashboard).`)
  const id = expectedId ?? (typeof file.id === 'string' && pageIdPattern.test(file.id) ? file.id : '')
  if (!pageIdPattern.test(id)) throw new Error('The dashboard has no valid id.')
  const dropped: string[] = []
  const tabIds = new Set<string>()
  const tabs = (Array.isArray(file.tabs) ? file.tabs : []).flatMap((entry): DashboardTab[] => {
    const tab = entry as Partial<DashboardTab> | null
    const name = clean(tab?.name, maxTabName)
    if (!tab || !ref(tab.id) || tabIds.has(tab.id!) || !name) { dropped.push('A tab without a valid id or name was left out.'); return [] }
    tabIds.add(tab.id!); return [{ id: tab.id!, name }]
  })
  if (tabs.length > maxTabs) dropped.push(`Only the first ${maxTabs} tabs are shown.`)
  const keptTabs = tabs.slice(0, maxTabs)
  const filterIds = new Set<string>()
  const filters = (Array.isArray(file.filters) ? file.filters : []).flatMap((entry): ViewerFilter[] => {
    const filter = entry as Partial<ViewerFilter> | null
    if (!filter || !ref(filter.id) || filterIds.has(filter.id!) || typeof filter.source !== 'string' || !pattern.test(filter.source) || !ref(filter.column)) { dropped.push('A filter of the filter row without a valid id, data source or column was left out.'); return [] }
    filterIds.add(filter.id!); return [{ id: filter.id!, source: filter.source, column: filter.column! }]
  })
  if (filters.length > maxViewerFilters) dropped.push(`Only the first ${maxViewerFilters} filters are shown.`)
  const blockIds = new Set<string>()
  const blocks = ((file.blocks as unknown[] | undefined) ?? []).flatMap((entry, index): DashboardBlock[] => {
    const item = entry as Partial<Record<keyof DashboardBlock, unknown>> | null
    const label = item && typeof item.title === 'string' && item.title.trim() ? `“${clean(item.title, maxTitle)}”` : `Block ${index + 1}`
    if (!item || typeof item !== 'object') { dropped.push(`${label} is not a block: left out.`); return [] }
    if (!blockTypeKeys.includes(item.type as BlockType)) { dropped.push(`${label} has an unknown type (${String(item.type).slice(0, 20)}): left out.`); return [] }
    if (!ref(item.id) || blockIds.has(item.id as string)) { dropped.push(`${label} has no valid id, or the id of another block: left out.`); return [] }
    if (typeof item.source !== 'string' || !pattern.test(item.source)) { dropped.push(`${label} has no known data source: left out.`); return [] }
    const title = clean(item.title, maxTitle)
    if (!title) { dropped.push(`${label} has no title: left out.`); return [] }
    blockIds.add(item.id as string)
    const type = item.type as BlockType
    const measure: InsightMeasure = measureKeys.includes(item.measure as InsightMeasure) ? item.measure as InsightMeasure : 'count'
    const blockFilters = (Array.isArray(item.filters) ? item.filters : []).flatMap((raw): InsightFilter[] => {
      const filter = raw as Partial<Record<keyof InsightFilter, unknown>> | null
      const column = ref(filter?.column)
      if (!filter || !column) return []
      const values = Array.isArray(filter.values) ? [...new Set(filter.values.filter((value): value is string => typeof value === 'string').map((value) => value.trim().slice(0, 120)))].slice(0, 200) : undefined
      const from = typeof filter.from === 'string' && monthPattern.test(filter.from) ? filter.from : undefined
      const to = typeof filter.to === 'string' && monthPattern.test(filter.to) ? filter.to : undefined
      if (!values?.length && !from && !to) return []
      return [{ column, ...(values?.length ? { values } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }]
    }).slice(0, maxBlockFilters)
    const tab = ref(item.tab)
    // CHT: the display options validated as an insight's (a KPI tile takes none); unknown ones dropped.
    const options = type === 'kpi' ? undefined : cleanOptions(type, measure, item.options)
    return [{ id: item.id as string, title, type, source: item.source, category: type === 'kpi' ? '' : ref(item.category), second: type === 'kpi' || type === 'pie' || type === 'pareto' || type === 'narrative' ? '' : ref(item.second), measure, value: measure === 'count' ? '' : ref(item.value), filters: blockFilters,
      sort: type === 'line' ? 'label' : type === 'table' || type === 'kpi' || type === 'pareto' || type === 'narrative' ? 'value' : item.sort === 'label' ? 'label' : 'value', period: ref(item.period), tab: tab && tabIds.has(tab) ? tab : '', ...(options ? { options } : {}), ...(item.hideStatus === true && isToolSource(item.source) ? { hideStatus: true } : {}), ...(type === 'narrative' ? { narrative: parseNarrative((item as { narrative?: unknown }).narrative) } : {}), ...pivotLevels(type, item as Record<string, unknown>, ref) }]
  })
  if (blocks.length > maxBlocks) dropped.push(`Only the first ${maxBlocks} blocks are shown (${blocks.length} in the file).`)
  const colors = parseColors(file.colors)
  // DSH-18: the Azure query references (only server, project, query id and name are kept).
  const queries = parseQueryRefs(file.queries)
  dropped.push(...queries.dropped)
  return { dashboard: { schema: 1, kind: 'dashboard', id, tabs: keptTabs, filters: filters.slice(0, maxViewerFilters), blocks: blocks.slice(0, maxBlocks), ...(colors ? { colors } : {}), ...(queries.refs.length ? { queries: queries.refs } : {}) }, dropped }
}
// CHT: options and colours are written only when set, so a dashboard without them stays byte for byte as before.
// CHT-79: a Pivot table's nested fields after the field they follow, only when set (an older app drops them, LIM-104).
const blockOut = ({ id, title, type, source, category, second, measure, value, filters, sort, period, tab, options, narrative, hideStatus, rows2, rows3, second2 }: DashboardBlock) =>
  ({ id, title, type, source, ...(category ? { category } : {}), ...(second ? { second } : {}), ...pivotLevelsOut({ type, rows2: category ? rows2 : undefined, rows3, second2: second ? second2 : undefined }), measure, ...(value ? { value } : {}), ...(filters.length ? { filters } : {}), sort, ...(period ? { period } : {}), ...(tab ? { tab } : {}), ...(options && Object.keys(options).length ? { options } : {}), ...(type === 'narrative' ? { narrative: narrativeOut(narrative) } : {}), ...(hideStatus && isToolSource(source) ? { hideStatus: true } : {}) })
export function serializeDashboard(dashboard: Dashboard) {
  const out = `${JSON.stringify({ schema: 1, kind: 'dashboard', id: dashboard.id, tabs: dashboard.tabs.map(({ id, name }) => ({ id, name })), filters: dashboard.filters.map(({ id, source, column }) => ({ id, source, column })), blocks: dashboard.blocks.map(blockOut), ...(dashboard.colors && Object.keys(dashboard.colors).length ? { colors: dashboard.colors } : {}), ...(dashboard.queries?.length ? { queries: dashboard.queries.map(queryRefOut) } : {}) }, null, 1)}\n`
  if (new TextEncoder().encode(out).length > dashboardMaxBytes) throw new Error(`The dashboard is too large to save (over ${Math.round(dashboardMaxBytes / 1000)} KB). Remove blocks or filters.`)
  return out
}

// ---- merging two saves (DSH-08, GIT-17) ----
// Blocks, tabs and filters are merged by id; each field of an entry three ways (a field only one save changed takes that
// change, one both changed the later save's); an entry one save removed and the other changed: the later save wins
// (removed and untouched by the other: removed); added by either: kept. The order of each list follows the save that
// changed it (the later one when both did); entries the order does not name go last. Without a base (never read here),
// every entry of both saves stays.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
function later<T>(base: T | undefined, mine: T | undefined, theirs: T | undefined, mineLater: boolean): T | undefined {
  if (same(mine, base)) return theirs
  if (same(theirs, base)) return mine
  return mineLater ? mine : theirs
}
export function mergeById<T extends { id: string }>(base: T[] | null, mine: T[], theirs: T[], mineLater: boolean): T[] {
  const index = (list: T[] | null) => new Map((list ?? []).map((entry) => [entry.id, entry]))
  const b = index(base), m = index(mine), t = index(theirs)
  const ids = [...new Set([...theirs.map((entry) => entry.id), ...mine.map((entry) => entry.id)])]
  const merged = ids.flatMap((id): T[] => {
    const before = b.get(id), a = m.get(id), c = t.get(id)
    if (!base) return [(a && c ? (mineLater ? { ...c, ...a } : { ...a, ...c }) : a ?? c)!]
    if (!a || !c) {
      const kept = a ?? c!
      if (!before) return [kept]
      const changed = !same(kept, before), keptIsMine = Boolean(a)
      return changed && keptIsMine === mineLater ? [kept] : []
    }
    const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(a), ...Object.keys(c)])]
    return [Object.fromEntries(keys.flatMap((key) => { const value = merge3((before as Record<string, unknown> | undefined)?.[key], (a as Record<string, unknown>)[key], (c as Record<string, unknown>)[key], mineLater); return value === undefined ? [] : [[key, value]] })) as T]
  })
  const order = later(base?.map((entry) => entry.id), mine.map((entry) => entry.id), theirs.map((entry) => entry.id), mineLater) ?? mine.map((entry) => entry.id)
  // An entry the order does not name (kept from the other save) goes after the entry it followed there.
  const placed = order.filter((id) => merged.some((entry) => entry.id === id))
  for (const entry of merged) {
    if (placed.includes(entry.id)) continue
    const from = theirs.some((other) => other.id === entry.id) ? theirs : mine
    const before = from.slice(0, from.findIndex((other) => other.id === entry.id)).map((other) => other.id).reverse().find((id) => placed.includes(id))
    placed.splice(before ? placed.indexOf(before) + 1 : 0, 0, entry.id)
  }
  return placed.map((id) => merged.find((entry) => entry.id === id)!)
}
export function mergeDashboardText(baseText: string | null, mineText: string, theirsText: string, mineLater: boolean): string {
  const read = (raw: string | null) => { if (!raw) return null; try { return parseDashboard(raw).dashboard } catch { return null } }
  const mine = read(mineText), theirs = read(theirsText), base = read(baseText)
  if (!mine || !theirs) return mineText
  const tabs = mergeById(base?.tabs ?? null, mine.tabs, theirs.tabs, mineLater)
  const filters = mergeById(base?.filters ?? null, mine.filters, theirs.filters, mineLater)
  const blocks = mergeById(base?.blocks ?? null, mine.blocks, theirs.blocks, mineLater)
  // Read back through the parser: every rule of the file applies to the merged result (a tab removed by one save takes
  // the other's blocks on it to the first tab; the caps apply).
  // CHT-09: the colour pins are one entry, the later save's where both changed them.
  const colors = later(base?.colors, mine.colors, theirs.colors, mineLater)
  // DSH-18: the Azure query references merged by id, as the blocks.
  const queries = mergeById(base?.queries ?? (base ? [] : null), mine.queries ?? [], theirs.queries ?? [], mineLater)
  return serializeDashboard(parseDashboard(JSON.stringify({ schema: 1, kind: 'dashboard', id: mine.id, tabs, filters, blocks: blocks.map(blockOut), ...(colors ? { colors } : {}), ...(queries.length ? { queries: queries.map(queryRefOut) } : {}) }), mine.id).dashboard)
}

// ---- changing the dashboard (DSH-05, DSH-06) ----
export function upsertBlock(dashboard: Dashboard, block: DashboardBlock): Dashboard {
  const exists = dashboard.blocks.some((entry) => entry.id === block.id)
  if (!exists && dashboard.blocks.length >= maxBlocks) throw new Error(`A dashboard holds at most ${maxBlocks} blocks: remove one first.`)
  return { ...dashboard, blocks: exists ? dashboard.blocks.map((entry) => entry.id === block.id ? block : entry) : [...dashboard.blocks, block] }
}
export const removeBlock = (dashboard: Dashboard, id: string): Dashboard => ({ ...dashboard, blocks: dashboard.blocks.filter((entry) => entry.id !== id) })
export function moveBlock(dashboard: Dashboard, id: string, by: -1 | 1): Dashboard {
  const from = dashboard.blocks.findIndex((entry) => entry.id === id), to = from + by
  if (from < 0 || to < 0 || to >= dashboard.blocks.length) return dashboard
  const blocks = [...dashboard.blocks];[blocks[from], blocks[to]] = [blocks[to], blocks[from]]
  return { ...dashboard, blocks }
}
// Tabs: names unique (case-insensitive) and up to 40 characters; a removed tab's blocks go to the first tab.
export function tabsError(tabs: DashboardTab[]) {
  if (tabs.length > maxTabs) return `At most ${maxTabs} tabs.`
  const names = tabs.map((tab) => tab.name.trim().toLowerCase())
  if (names.some((name) => !name)) return 'Give every tab a name.'
  const twice = names.find((name, index) => names.indexOf(name) !== index)
  return twice ? `Two tabs are named “${tabs.find((tab) => tab.name.trim().toLowerCase() === twice)!.name.trim()}”.` : ''
}
export function setTabsAndFilters(dashboard: Dashboard, tabs: DashboardTab[], filters: ViewerFilter[]): Dashboard {
  const problem = tabsError(tabs)
  if (problem) throw new Error(problem)
  if (filters.length > maxViewerFilters) throw new Error(`At most ${maxViewerFilters} filters in the filter row.`)
  const kept = tabs.map((tab) => ({ id: tab.id, name: clean(tab.name, maxTabName) }))
  return { ...dashboard, tabs: kept, filters, blocks: dashboard.blocks.map((block) => block.tab && !kept.some((tab) => tab.id === block.tab) ? { ...block, tab: '' } : block) }
}

// ---- a block's fields (DSH-05) ----
export const asInsight = (block: DashboardBlock): Insight => ({ id: block.id, title: block.title, type: block.type, category: block.category, second: block.second, measure: block.measure, value: block.value, filters: block.filters, sort: block.type === 'table' ? 'value' : block.sort, ...(block.options ? { options: block.options } : {}), ...(block.narrative ? { narrative: block.narrative } : {}), ...(block.type === 'table' ? pivotLevelsOut(block) : {}) })
export const periodColumns = (page: OnDemandPage) => page.columns.filter((column) => column.type === 'date')
export function blankBlock(dataset: Dataset, id: string, type: BlockType = 'kpi', tab = ''): DashboardBlock {
  const page = dataset.page
  const chart = type === 'kpi' ? undefined : type
  // DSH-16: the Time Writing hours are measured in hours (Sum of the first hours column), never counted.
  const hours = dataset.key === hoursSource
  // TVL-18: a Tool Validations source counts every tool, whatever the period (its dates are validation and due dates);
  // a builder may still pick a Date column for the period.
  const timeless = dataset.key.startsWith('tools:')
  return { id, title: '', type, source: dataset.key, category: chart ? categoryColumns(page, chart)[0]?.id ?? '' : '', second: '', measure: hours ? 'sum' : 'count', value: hours ? valueColumns(page)[0]?.id ?? '' : '', filters: [], sort: type === 'line' ? 'label' : 'value', period: timeless ? '' : periodColumns(page)[0]?.id ?? '', tab, ...(type === 'narrative' ? { narrative: blankNarrative() } : {}) }
}
// TVL-26: the data source as a block sees it — for a block on a Tool Validations source with "Show expiry status" off,
// without the Status and Days left columns (not offered in the pop-up, not shown in the block, its table or drill-down);
// the rows keep their cells, so a filter of the filter row on Status still applies. Every other block: as it is.
const statusless = new WeakMap<Dataset, Dataset>()
export function blockDataset(dataset: Dataset, block: Pick<DashboardBlock, 'source' | 'hideStatus'>): Dataset {
  if (!block.hideStatus || !isToolSource(block.source) || dataset.problem) return dataset
  let hidden = statusless.get(dataset)
  if (!hidden) { hidden = { ...dataset, page: { ...dataset.page, columns: dataset.page.columns.filter((column) => !toolStatusColumns.includes(column.id)) } }; statusless.set(dataset, hidden) }
  return hidden
}
// The block with "Show expiry status" switched on or off: switched off, a field on Status or Days left is replaced by the
// first that fits (or cleared) and a filter on them removed.
export function withStatusShown(dataset: Dataset, block: DashboardBlock, shown: boolean): DashboardBlock {
  if (shown) { const out = { ...block }; delete out.hideStatus; return out }
  const hidden: DashboardBlock = { ...block, hideStatus: true, filters: block.filters.filter((filter) => !toolStatusColumns.includes(filter.column)) }
  const view = blockDataset(dataset, hidden)
  const gone = (id: string) => toolStatusColumns.includes(id)
  if (gone(hidden.second)) hidden.second = hidden.second2 && !gone(hidden.second2) ? hidden.second2 : ''
  if (hidden.second2 && (gone(hidden.second2) || hidden.second === hidden.second2)) delete hidden.second2
  if (hidden.rows3 && gone(hidden.rows3)) delete hidden.rows3
  if (hidden.rows2 && gone(hidden.rows2)) { if (hidden.rows3) hidden.rows2 = hidden.rows3; else delete hidden.rows2; delete hidden.rows3 }
  if (gone(hidden.period)) hidden.period = ''
  if (gone(hidden.value)) { hidden.measure = 'count'; hidden.value = '' }
  if (gone(hidden.category)) hidden.category = hidden.type === 'kpi' ? '' : hidden.type === 'narrative' ? '' : categoryColumns(view.page, hidden.type).find((column) => ![hidden.second, hidden.second2, hidden.rows2, hidden.rows3].includes(column.id))?.id ?? ''
  return hidden.type === 'kpi' ? hidden : withBlockType(view, hidden, hidden.type)
}
// The block after its type or data source changed: fields that no longer fit are cleared or replaced by the first that fits.
export function withBlockType(dataset: Dataset, block: DashboardBlock, type: BlockType): DashboardBlock {
  const page = dataset.page
  if (type === 'kpi') { const out: DashboardBlock = { ...block, type, category: '', second: '', sort: 'value' }; delete out.options; delete out.narrative; delete out.rows2; delete out.rows3; delete out.second2; return out }
  // The insight's rules (OND-15, CHT): fields that no longer fit cleared, the measure and the options made to fit.
  const next = withType(page, asInsight(block), type)
  const out: DashboardBlock = { ...block, type, category: next.category, second: next.second, measure: next.measure, value: next.value, sort: type === 'table' ? 'value' : next.sort }
  if (next.options) out.options = next.options
  else delete out.options
  if (next.narrative) out.narrative = next.narrative
  else delete out.narrative
  // CHT-79: the nested fields that still fit (withType keeps them only for a Pivot table).
  delete out.rows2; delete out.rows3; delete out.second2
  return { ...out, ...pivotLevelsOut(next) }
}
export function withSource(dataset: Dataset, block: DashboardBlock): DashboardBlock {
  const fresh = blankBlock(dataset, block.id, block.type, block.tab)
  if (dataset.key === hoursSource) return { ...fresh, ...(block.options ? { options: block.options } : {}), title: block.title, measure: block.measure === 'average' ? 'average' : 'sum' }
  return { ...fresh, ...(block.options ? { options: block.options } : {}), title: block.title, measure: block.measure !== 'count' && valueColumns(dataset.page).length ? block.measure : 'count', value: block.measure !== 'count' ? valueColumns(dataset.page)[0]?.id ?? '' : '' }
}

// Why a block cannot be shown with its data source as it is now — empty when it can (OND-17 for the columns, plus the
// data source and the period column).
export function blockProblems(dataset: Dataset, block: DashboardBlock): string[] {
  if (dataset.problem) return [dataset.problem]
  const page = dataset.page
  const problems: string[] = []
  if (block.type === 'kpi') {
    // A KPI tile has no category: only the measure and the filters are checked (as for an insight).
    const probe = insightProblems({ ...page, columns: [...page.columns, { id: 'dsh-all', name: 'All', type: 'text', options: [], required: false }] }, { ...asInsight(block), type: 'table', category: 'dsh-all', second: '' })
    problems.push(...probe)
  } else problems.push(...insightProblems(page, asInsight(block)))
  if (block.period) {
    const column = page.columns.find((entry) => entry.id === block.period)
    if (!column) problems.push('The Date column for the period is no longer on the page (removed).')
    else if (column.type !== 'date') problems.push(`“${column.name}” for the period is now a ${column.type} column; it needs a Date column.`)
  }
  return problems
}
export function blockError(dataset: Dataset, block: DashboardBlock): string {
  if (!block.title.trim()) return 'Give the block a title.'
  if (dataset.problem) return dataset.problem
  if (dataset.key === hoursSource && block.measure !== 'sum' && block.measure !== 'average') return 'Time Writing hours are measured as the Sum or Average of Planned hours or Booked hours: choose one of them.'
  if (block.type === 'line' && !categoryColumns(dataset.page, 'line').length) return 'A line chart needs a Date column in the data source.'
  if (block.type !== 'kpi' && block.type !== 'narrative' && !categoryColumns(dataset.page, block.type).length) return 'The data source has no column to group by (a Dropdown, Multi-select, Text or Date column).'
  if (block.type === 'narrative') { const problem = narrativeError(block.narrative, Boolean(block.category)); if (problem) return problem }
  const empty = block.filters.find((filter) => !filter.values?.length && !filter.from && !filter.to)
  if (empty) return `The filter on “${dataset.page.columns.find((column) => column.id === empty.column)?.name ?? '?'}” has nothing chosen: tick a value or give a month, or remove it.`
  if (block.filters.some((filter) => filter.from && filter.to && filter.from > filter.to)) return 'A date filter ends before it starts: check From and To.'
  return blockProblems(dataset, block)[0] ?? ''
}
export { filterColumns, valueColumns, categoryColumns, secondColumns }

// ---- the period and the filter row (DSH-07) ----
// The rows a block counts: those whose month in the block's Date column is one of the period's months (rows without a
// valid date are left out and counted), and those that pass the viewer's filters of the block's data source.
// base (CHT-62): the rows that pass the filter row without the period — a Narrative's previous period is counted in them.
export interface Narrowed { page: OnDemandPage; all: number; outside: number; noDate: number; filtered: number; byPeriod: boolean; base?: OnDemandPage }
export function narrowRows(dataset: Dataset, block: DashboardBlock, months: string[] | null, filters: ViewerFilter[] = [], chosen: Record<string, string[]> = {}): Narrowed {
  const page = dataset.page
  const periodColumn = block.period ? page.columns.find((column) => column.id === block.period && column.type === 'date') : undefined
  const wanted = months ? new Set(months) : null
  let outside = 0, noDate = 0, filtered = 0
  const active = filters.filter((filter) => filter.source === dataset.key && chosen[filter.id]?.length)
  const rows = page.rows.filter((row) => {
    if (periodColumn && wanted) {
      const [bucket] = bucketsOf(periodColumn, row.cells[periodColumn.id])
      if (!bucket || bucket.key === noneKey) { noDate++; return false }
      if (!wanted.has(bucket.key)) { outside++; return false }
    }
    for (const filter of active) {
      const column = page.columns.find((entry) => entry.id === filter.column)
      if (column && hasOptions(column.type) && !passesFilter(column, { column: column.id, values: chosen[filter.id] }, row)) { filtered++; return false }
    }
    return true
  })
  const byPeriod = Boolean(periodColumn && wanted)
  const base = byPeriod && block.type === 'narrative' ? { ...page, rows: page.rows.filter((row) => active.every((filter) => { const column = page.columns.find((entry) => entry.id === filter.column); return !column || !hasOptions(column.type) || passesFilter(column, { column: column.id, values: chosen[filter.id] }, row) })) } : undefined
  return { page: { ...page, rows }, all: page.rows.length, outside, noDate, filtered, byPeriod, ...(base ? { base } : {}) }
}

// ---- aggregation (DSH-05) ----
// A KPI tile: the measure over the rows (each row once), one currency at a time for a Currency column (OND-24).
export interface KpiValue { value: number | null; rows: number; used: number; currency: string; currencies: { code: string; rows: number }[]; otherCurrency: number; noNumber: number }
export function kpiValue(page: OnDemandPage, block: DashboardBlock, currency = ''): KpiValue {
  const data = kpiData(page, asInsight(block), currency)
  return { value: data.total, rows: data.rows.matched, used: data.rows.used, currency: data.currency, currencies: data.currencies, otherCurrency: data.rows.otherCurrency, noNumber: data.rows.noNumber }
}
// The limits of each type as the insights' (limitsFor: a pie 5 + Other, bars 20 and 5 stacks, lines 5, a table all, or
// the chosen Top N) and the chart options (CHT): the same data as an insight of the same fields.
export const blockData = (page: OnDemandPage, block: DashboardBlock, currency = ''): ChartData => chartData(page, asInsight(block), currency)
export const kpiText = (value: KpiValue) => value.value == null ? '—' : `${formatValue(value.value)}${value.currency ? ` ${value.currency}` : ''}`
// DSH-06: a summary table — one row per category, largest total first ("(none)" and "Other" last), the first 10
// shown unless Show all; the shared table exports every row through the neutralising CSV helper (csv.ts).
export const tableLimit = 10
export interface SummaryRow { key: string; label: string; values: (number | null)[]; total: number | null; rank: number }
export function summaryRows(data: ChartData): SummaryRow[] {
  const rank = (key: string) => key === otherKey ? 2 : key === noneKey ? 1 : 0
  return data.categories.map((cat, index) => ({ key: cat.key, label: cat.label, values: data.values[index], total: data.categoryTotals[index], rank: rank(cat.key) }))
    .sort((a, b) => a.rank - b.rank || (b.total ?? -Infinity) - (a.total ?? -Infinity) || a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }))
}
// DSH-14: the Total row goes with the export, after the rows (as the table shows it).
export const summaryCsv = (head: string[], rows: SummaryRow[], totals?: { values: (number | null)[]; total: number | null }) => [head, ...rows.map((row) => [row.label, ...(row.values.length > 1 ? row.values : []), row.total]), ...(totals ? [['Total', ...(totals.values.length > 1 ? totals.values : []), totals.total]] : [])].map((line) => line.map((value) => csvCell(value == null ? '' : typeof value === 'number' ? String(Number(value.toFixed(2))) : value)).join(',')).join('\r\n')
// DSH-14: the Total row's values as the shared table exports them (column ids of the summary table, numbers to 2 decimals).
const exported = (value: number | null) => value == null ? '' : Number(value.toFixed(2))
export function summaryExportTotals(data: ChartData, split: boolean): Record<string, number | string> {
  return { ...Object.fromEntries(split ? data.seriesTotals.map((value, at) => [`dsh-s${at}`, exported(value)]) : []), 'dsh-total': exported(data.total) }
}

// DSH-10: the empty state of a block, the same everywhere.
export const noData = { title: 'No data for this selection.', detail: 'Change the period or the filters above, or Reset filters (the current year, no filter).' }

// ---- words (DSH-05) ----
export function sourceName(datasets: Dataset[], source: string) {
  return datasets.find((entry) => entry.key === source)?.name || (source === hoursSource ? hoursSourceName : `the page ${pageOfSource(source)} (no longer there)`)
}
export function blockSubject(dataset: Dataset, block: DashboardBlock, currency = '') {
  const page = dataset.page
  const column = (id: string) => page.columns.find((entry) => entry.id === id)?.name ?? '(removed column)'
  const measure = measureText(page, asInsight(block), currency)
  if (block.type === 'kpi') return measure
  if (block.type === 'narrative' && !block.category) return measure
  // CHT-74: a Pivot table names its nested fields, outermost first.
  const by = block.type === 'line' ? `per ${dateGroupLabels[grainOf(asInsight(block))].unit} of ${column(block.category)}` : `by ${pivotRowFields(block).map(column).join(', then ') || column(block.category)}`
  const split = block.second ? `, ${block.type === 'table' ? 'columns by' : block.type === 'line' ? 'one line per' : block.options?.grouping === 'grouped' ? 'grouped by' : 'stacked by'} ${pivotColumnFields(block).map(column).join(', then ')}` : ''
  return `${measure} ${by}${split}`
}
export function periodNote(dataset: Dataset, block: DashboardBlock) {
  const column = dataset.page.columns.find((entry) => entry.id === block.period)
  return column ? `Period on ${column.name}` : 'Not filtered by the period (no Date column chosen)'
}
// A cell of a Currency or Number column (for a KPI's hint): used by tests and the editor's preview.
export const cellNumber = (column: OnDemandColumn, value: OnDemandRow['cells'][string] | undefined) => column.type === 'currency' ? moneyOf(value, column.currency)?.amount ?? null : numberOf(value)
export const cellValues = valuesOf

// ---- copying a block (DSH-15) ----
// A copy of a block on another dashboard (or this one): a new id, the same settings and data source. Its tab: the
// target's tab of the same name (case-insensitive) as the block's tab here; else the target's first tab, and the note
// says so. Throws when the target is full (40 blocks).
// DSH-18: a block over a saved Azure query takes the query's reference along (refs: the source dashboard's); a target with
// the same query (server, project, id) keeps its own and the block reads that one.
export function copyBlock(target: Dashboard, block: DashboardBlock, sourceTabs: DashboardTab[], id: string, targetName: string, same = false, refs: AzureQueryRef[] = []): { dashboard: Dashboard; block: DashboardBlock; note: string } {
  const tabName = (sourceTabs.find((tab) => tab.id === block.tab) ?? sourceTabs[0])?.name ?? ''
  const match = tabName ? target.tabs.find((tab) => tab.name.trim().toLowerCase() === tabName.trim().toLowerCase()) : undefined
  const tab = same ? block.tab : match && match.id !== target.tabs[0]?.id ? match.id : ''
  const title = same ? `${block.title} (copy)`.slice(0, maxTitle) : block.title
  const copy: DashboardBlock = { ...structuredClone(block), id, title, tab }
  const note = same || !tabName || match ? '' : target.tabs.length ? `${targetName} has no tab named “${tabName}”: the block is on its first tab, ${target.tabs[0].name}.` : `${targetName} has no tabs: the block is shown with all its blocks.`
  const ref = same ? undefined : refs.find((entry) => entry.id === queryOfSource(block.source))
  if (!ref) return { dashboard: upsertBlock(target, copy), block: copy, note }
  const own = target.queries ?? []
  const found = own.find((entry) => entry.server.toLowerCase() === ref.server.toLowerCase() && entry.project.toLowerCase() === ref.project.toLowerCase() && entry.queryId === ref.queryId)
  if (found) { copy.source = `azq:${found.id}`; return { dashboard: upsertBlock(target, copy), block: copy, note } }
  if (own.length >= 10) throw new Error(`${targetName} reads 10 Azure queries already: remove one there first.`)
  const taken = own.find((entry) => entry.id === ref.id || entry.name.toLowerCase() === ref.name.toLowerCase())
  const added: AzureQueryRef = taken ? { ...ref, id: `${ref.id}`.slice(0, 34) + id.slice(-5), name: `${ref.name} (copy)`.slice(0, 80) } : ref
  copy.source = `azq:${added.id}`
  return { dashboard: upsertBlock({ ...target, queries: [...own, added] }, copy), block: copy, note: [note, `The Azure query ${added.name} was added to ${targetName} as a data source.`].filter(Boolean).join(' ') }
}

// ---- rights (DSH-09, CON-107) ----
// The role right "Build On-Demand Dashboards" (every dashboard) or a co-owner of the page or of its group builds it
// (menuLayout.ts canBuildDashboard); "Set up On-Demand pages" no longer does. The menu reasons (rename, remove) are
// those of the page builder.
export const viewerKey = (pageId: string) => `dashboard-page:${pageId}`
