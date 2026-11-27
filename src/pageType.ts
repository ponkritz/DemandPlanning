import type { PageKind } from './menuLayout.ts'
import { parseQueryRef, queryRefOut, type AzureQueryRef } from './azureQueryRef.ts'

// PGB-22…PGB-28 The page type as four tick boxes — Table (Build your own), Table (Query), Insights, Dashboard — and the
// table's source. Only these combinations are a page type: Dashboard alone; one table source alone (Table); one table
// source with Insights (Table + Insights: the Insights read the same rows). The menu layout keeps the type as before
// (PageKind: 'table' | 'table-insights' | 'dashboard', menu-layout.json), so older builds and files keep working; the
// table's source is kept in the page's own file (on-demand/<page-id>.json, `source`) — absent: the team's own rows (Build
// your own), so every page from before is unchanged. A Table (Query) page keeps only the query's reference (server,
// project, query id, name — src/azureQueryRef.ts), never a PAT, never rows. Kept free of React (tests/page-type.test.mjs).

export type TypeTick = 'own' | 'query' | 'insights' | 'dashboard'
export type TypeTicks = Record<TypeTick, boolean>
export type TableSource = 'own' | 'query'
export const typeTicks: { key: TypeTick; label: string; detail: string }[] = [
  { key: 'own', label: 'Table (Build your own)', detail: 'A table the team sets up itself: columns, rows, search, export.' },
  { key: 'query', label: 'Table (Query)', detail: 'The rows and columns of a saved Azure DevOps query, read live with each viewer’s own PAT; read only.' },
  { key: 'insights', label: 'Insights', detail: 'An Insights tab of charts and summary tables over the same rows as the table.' },
  { key: 'dashboard', label: 'Dashboard', detail: 'Read only: KPI tiles, charts and summary tables over the rows of table pages, with a period filter.' },
]
const labelOf = (key: TypeTick) => typeTicks.find((entry) => entry.key === key)?.label ?? key
export const noTicks = (): TypeTicks => ({ own: false, query: false, insights: false, dashboard: false })
// PGB-22, UI-STANDARDS §12: Add page starts as today's default, a Table of the team's own rows (own and safe).
export const defaultTicks = (): TypeTicks => ({ ...noTicks(), own: true })

// The type a set of ticks makes, or why it is not one (every one of the 16 sets is one or the other).
export type PageType = { kind: PageKind; source: TableSource }
export const chooseType = 'Choose a page type.'
export function pageTypeOf(ticks: TypeTicks): PageType | string {
  const sources = (['own', 'query'] as const).filter((key) => ticks[key])
  if (ticks.dashboard) return sources.length || ticks.insights ? 'A Dashboard stands alone: untick the other choices, or untick Dashboard.' : { kind: 'dashboard', source: 'own' }
  if (sources.length > 1) return 'A table has one source: tick Table (Build your own) or Table (Query), not both.'
  if (!sources.length) return ticks.insights ? 'Insights reads a table’s rows: tick Table (Build your own) or Table (Query) as well.' : chooseType
  return { kind: ticks.insights ? 'table-insights' : 'table', source: sources[0] }
}
// The ticks of a page type (Edit page starts from the page as it is).
export const ticksOf = (kind: PageKind, source: TableSource): TypeTicks => kind === 'dashboard' ? { ...noTicks(), dashboard: true } : { ...noTicks(), [source]: true, insights: kind === 'table-insights' }

// PGB-26: Edit page — a page keeps its family (DSH-01) and its table's source: only Insights can be switched.
export type TypeLock = { family: 'dashboard' } | { family: 'table'; source: TableSource }
const sourceWords: Record<TableSource, string> = { own: 'the team’s own rows (Build your own)', query: 'a saved Azure DevOps query' }
export const fixedSourceReason = (source: TableSource) => `The table’s rows come from ${sourceWords[source]}; add a new page for the other source.`
export const fixedSourceText = 'The table’s source is fixed once the page is added.'
export const dashboardLockReason = 'An On-Demand Dashboard stays a dashboard: it holds blocks, not rows. Add a Table page instead.'
export const tableLockReason = 'A table page cannot become an On-Demand Dashboard: its rows would be hidden. Add an On-Demand Dashboard page instead.'
// Why a tick box cannot be changed now ('' when it can): ticking it would make a combination that is not a type, or
// Edit page fixes it. Unticking is always allowed in Add page (the main button then says what is missing).
export function tickReason(ticks: TypeTicks, key: TypeTick, lock?: TypeLock): string {
  if (lock?.family === 'dashboard') return dashboardLockReason
  if (lock?.family === 'table') {
    if (key === 'dashboard') return tableLockReason
    if (key === lock.source) return fixedSourceText
    if (key === 'own' || key === 'query') return fixedSourceReason(lock.source)
  }
  if (ticks[key]) return ''
  if (key === 'dashboard') { const others = (['own', 'query', 'insights'] as const).filter((other) => ticks[other]); return others.length ? `A Dashboard stands alone: untick ${others.map(labelOf).join(' and ')} first.` : '' }
  if (ticks.dashboard) return 'A Dashboard stands alone: untick Dashboard first.'
  if (key === 'own' && ticks.query) return 'A table has one source: untick Table (Query) first.'
  if (key === 'query' && ticks.own) return 'A table has one source: untick Table (Build your own) first.'
  return ''
}
// The page type in words, as the form shows it.
export function typeText(type: PageType): string {
  if (type.kind === 'dashboard') return 'On-Demand Dashboard · KPI tiles, charts and tables over table pages'
  return `${type.kind === 'table-insights' ? 'Table + Insights' : 'Table'} · ${type.source === 'query' ? 'rows from an Azure DevOps query' : 'rows the team adds itself'}`
}

// ---- the table's source in the page file (PGB-23, PGB-27) ----
// source: { kind: 'query', query: AzureQueryRef } — a Table (Query) page; absent — Build your own. Anything else that is
// present (another kind, a query reference that is not valid, not an object) is kept as an invalid source: the page is
// shown read only with the reason and its rows are never edited (a save would otherwise turn it into a Build your own
// page). What is written back is only `kind` (a short word) and the five keys of the reference as text — nothing else of
// a crafted file is carried into the app or back to Git (SM-356).
export type PageSource = { kind: 'query'; query: AzureQueryRef } | { kind: 'invalid'; problem: string; keep: { kind: string; query?: Record<string, string> } }
const refKeys = ['id', 'name', 'server', 'project', 'queryId'] as const
const shortText = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : ''
export function parsePageSource(raw: unknown): PageSource | undefined {
  if (raw === undefined || raw === null) return undefined
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
  if (item?.kind === 'own') return undefined
  const kind = item && typeof item.kind === 'string' && /^[a-z][a-z-]{0,19}$/.test(item.kind) ? item.kind : 'invalid'
  const query = item?.query && typeof item.query === 'object' && !Array.isArray(item.query) ? item.query as Record<string, unknown> : null
  const keep = { kind, ...(query ? { query: Object.fromEntries(refKeys.flatMap((key) => typeof query[key] === 'string' ? [[key, shortText(query[key], 2048)]] : [])) } : {}) }
  if (!item) return { kind: 'invalid', problem: 'The table’s source in the page file is not readable.', keep }
  if (item.kind !== 'query') return { kind: 'invalid', problem: `The table’s source “${kind}” is not known to this version of the app: update the app.`, keep }
  const ref = parseQueryRef(item.query)
  if (typeof ref === 'string') return { kind: 'invalid', problem: `The table’s query reference is not valid — ${ref.replace(/: left out\.$/, '').replace('of the dashboard', 'of the page')}.`, keep }
  return { kind: 'query', query: ref }
}
// What is written to the page file: the reference's five keys, or the invalid source as it was kept; nothing for Build
// your own.
export function pageSourceOut(source: PageSource | undefined): { source: unknown } | Record<string, never> {
  if (!source) return {}
  return { source: source.kind === 'query' ? { kind: 'query', query: queryRefOut(source.query) } : source.keep }
}
export const tableSourceOf = (source: PageSource | undefined): TableSource => source ? 'query' : 'own'
export const isQueryPage = (page: { source?: PageSource }) => Boolean(page.source)
// Why a query page's rows are not read: an invalid source.
export const sourceProblem = (source: PageSource | undefined) => source?.kind === 'invalid' ? source.problem : ''

// PGB-22, PGB-23: what Add page creates — the type for the menu layout and the source for the page file; refused when
// the ticks are not a type or a Table (Query) has no reference (createPage never writes another combination).
export function newPageType(ticks: TypeTicks, query: AzureQueryRef | null): { kind: PageKind; source?: PageSource } | string {
  const type = pageTypeOf(ticks)
  if (typeof type === 'string') return type
  if (type.kind === 'dashboard' || type.source === 'own') return { kind: type.kind }
  if (!query) return 'Choose the saved query of the table.'
  const ref = parseQueryRef(query)
  if (typeof ref === 'string') return ref.replace(/: left out\.$/, '.')
  return { kind: type.kind, source: { kind: 'query', query: ref } }
}
// PGB-26: what Edit page saves — the type from the ticks, the source never changed.
export function editedKind(ticks: TypeTicks, lock: TypeLock): { kind: PageKind } | { problem: string } {
  if (lock.family === 'dashboard') return { kind: 'dashboard' }
  const type = pageTypeOf({ ...ticks, own: lock.source === 'own', query: lock.source === 'query', dashboard: false })
  return typeof type === 'string' ? { problem: type } : { kind: type.kind }
}
