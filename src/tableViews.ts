import type { TableDensity } from './tableDefaults.ts'
import { maxGroupLevels } from './tableGroups.ts'

// UI-20…UI-23 Save view for everyone: what a table looks like — column order, shown and hidden columns, widths, Wrap
// text, density and sort — as one view. Three views can apply, in this order: the viewer's own (kept per table in their
// browser, UI-08), the view a Tool Owner saved for everyone (the shared views defaults in Git, one entry per table) and
// the table's built-in default. A viewer who never changed a table sees the view for everyone, and a later one as soon
// as it is read; the first change a viewer makes starts their own view from the one they see, which they then keep.
export interface TableSort { id: string; desc: boolean }
export interface TableView {
  order?: string[]
  hidden?: string[]
  widths?: Record<string, number>
  wrap?: boolean
  density?: TableDensity
  sort?: TableSort
  // UI-25…UI-28 (tables with Group by and Filter by column): the columns grouped by, outermost first (up to 4; [] is
  // "no grouping", kept so that a person's own choice of none wins over the view for everyone); the column filters
  // (column id → text); and, in the view for everyone only, whether the groups start collapsed. A view saved before
  // these existed has none of them and keeps working.
  groupBy?: string[]
  filters?: Record<string, string>
  startCollapsed?: boolean
  // Own views only: the save time of the view for everyone the own view started from (a newer one is announced).
  base?: string
}
export type TableViewSource = 'own' | 'everyone' | 'table'

const maxColumns = 300
const idOk = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200
const list = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(idOk))].slice(0, maxColumns) : undefined
const minWidth = 48, maxWidth = 2000, maxFilter = 200

// Only known shapes are kept (a view read from Git or from the browser is checked like any other input); nothing set
// is no view at all.
export function parseTableView(raw: unknown): TableView | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const view: TableView = {}
  const order = list(value.order), hidden = list(value.hidden)
  if (order) view.order = order
  if (hidden) view.hidden = hidden
  if (value.widths && typeof value.widths === 'object' && !Array.isArray(value.widths)) {
    const widths = Object.fromEntries(Object.entries(value.widths as Record<string, unknown>).filter(([id, width]) => idOk(id) && typeof width === 'number' && Number.isFinite(width)).slice(0, maxColumns).map(([id, width]) => [id, Math.min(maxWidth, Math.max(minWidth, Math.round(width as number)))]))
    if (Object.keys(widths).length) view.widths = widths
  }
  if (typeof value.wrap === 'boolean') view.wrap = value.wrap
  if (value.density === 'compact' || value.density === 'comfortable') view.density = value.density
  const sort = value.sort as Record<string, unknown> | null | undefined
  if (sort && typeof sort === 'object' && idOk(sort.id)) view.sort = { id: sort.id, desc: sort.desc === true }
  const groupBy = list(value.groupBy)
  if (groupBy) view.groupBy = groupBy.slice(0, maxGroupLevels)
  if (value.filters && typeof value.filters === 'object' && !Array.isArray(value.filters)) {
    view.filters = Object.fromEntries(Object.entries(value.filters as Record<string, unknown>).filter(([id, text]) => idOk(id) && typeof text === 'string' && text.trim()).slice(0, maxColumns).map(([id, text]) => [id, (text as string).slice(0, maxFilter)]))
  }
  if (value.startCollapsed === true) view.startCollapsed = true
  if (typeof value.base === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value.base)) view.base = value.base
  return Object.keys(view).some((key) => key !== 'base') ? view : undefined
}

// The view that applies: the viewer's own, else the view for everyone, else the table's built-in one (nothing set).
// UI-28: an own view that has no grouping or column filters at all (saved before they existed) takes them from the view
// for everyone; "Start collapsed" always comes from the view for everyone (how the groups open is the viewer's, per visit).
export function chooseTableView(own: TableView | undefined, everyone: TableView | undefined): { view: TableView; source: TableViewSource } {
  if (own) {
    const view: TableView = { ...own }
    delete view.startCollapsed
    if (view.groupBy === undefined && everyone?.groupBy) view.groupBy = everyone.groupBy
    if (view.filters === undefined && everyone?.filters) view.filters = everyone.filters
    if (everyone?.startCollapsed) view.startCollapsed = true
    return { view, source: 'own' }
  }
  if (everyone) return { view: everyone, source: 'everyone' }
  return { view: {}, source: 'table' }
}

// UI-22: a view on today's columns — a column that no longer exists is ignored (in the order, hidden list, widths and
// sort); a column the view does not know comes at the end and is shown (DataTable's order puts it there).
export function fitTableView(view: TableView, columnIds: string[]): TableView {
  const known = new Set(columnIds)
  const fitted: TableView = { ...view }
  if (view.order) fitted.order = view.order.filter((id) => known.has(id))
  if (view.hidden) fitted.hidden = view.hidden.filter((id) => known.has(id))
  if (view.widths) fitted.widths = Object.fromEntries(Object.entries(view.widths).filter(([id]) => known.has(id)))
  if (view.sort && !known.has(view.sort.id)) delete fitted.sort
  if (view.groupBy) fitted.groupBy = view.groupBy.filter((id) => known.has(id))
  if (view.filters) fitted.filters = Object.fromEntries(Object.entries(view.filters).filter(([id]) => known.has(id)))
  return fitted
}

// The first change a viewer makes: their own view starts as the view they see (the one for everyone, with its time).
export const startOwnView = (everyone: TableView | undefined, everyoneAt: string | undefined, change: Partial<TableView>): TableView => {
  const start: TableView = { ...(everyone ?? {}) }
  delete start.startCollapsed
  if (everyoneAt) start.base = everyoneAt
  else delete start.base
  return { ...start, ...change }
}
// A view for everyone saved after the one an own view started from (or an own view older than any view for everyone).
export const newerForEveryone = (own: TableView | undefined, everyoneAt: string | undefined) => Boolean(own && everyoneAt && (!own.base || own.base < everyoneAt))
// The view as saved for everyone: without the own-view mark.
export function shareableView(view: TableView): TableView { const copy = { ...view }; delete copy.base; return copy }

// ---- The viewer's own view, kept in this browser --------------------------------------------------------------------
// One entry per table; before v10.6 the widths and Wrap text had entries of their own, which are read once and then
// folded into it.
const layoutKey = (id: string) => `demand-planning-table-layout-v1:${id}`
const legacyWidthsKey = (id: string) => `demand-planning-column-widths-v1:table:${id}`
const legacyWrapKey = (id: string) => `demand-planning-table-wrap-v1:table:${id}`
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const browser = (): Store | undefined => { try { return globalThis.localStorage } catch { return undefined } }

export function readOwnView(id: string, storage: Store | undefined = browser()): TableView | undefined {
  try {
    if (!storage) return undefined
    const raw = JSON.parse(storage.getItem(layoutKey(id)) ?? '{}') as Record<string, unknown>
    const merged: Record<string, unknown> = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {}
    if (merged.widths === undefined) { const widths = storage.getItem(legacyWidthsKey(id)); if (widths) merged.widths = JSON.parse(widths) as unknown }
    if (merged.wrap === undefined) { const wrap = storage.getItem(legacyWrapKey(id)); if (wrap === '1' || wrap === '0') merged.wrap = wrap === '1' }
    return parseTableView(merged)
  } catch { return undefined }
}
export function writeOwnView(id: string, view: TableView | undefined, storage: Store | undefined = browser()) {
  try {
    if (!storage) return
    const kept = view ? parseTableView(view) : undefined
    if (kept) storage.setItem(layoutKey(id), JSON.stringify(kept)); else storage.removeItem(layoutKey(id))
    storage.removeItem(legacyWidthsKey(id)); storage.removeItem(legacyWrapKey(id))
  } catch { /* this visit only */ }
}
