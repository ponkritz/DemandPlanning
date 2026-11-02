import { csvCell } from './csv.ts'
import type { XlsxCell } from './xlsx.ts'

// The design default of every table (UI-07…12): what a table offers and how it starts. One shared setting
// (Settings → Table defaults, saved with the shared app data); every table built on DataTable reads it, so a change
// here changes them all. Each viewer's own choices per table — widths, column order, hidden columns, wrap, density —
// are kept in their browser.
export type TableDensity = 'compact' | 'comfortable'
export type ExportFormat = 'xlsx' | 'csv'
export const excelDateFormats = ['yyyy-mm-dd hh:mm', 'dd-mmm-yyyy hh:mm', 'dd/mm/yyyy hh:mm', 'mm/dd/yyyy hh:mm'] as const
export type ExcelDateFormat = typeof excelDateFormats[number]
export interface TableDefaults {
  resize: boolean // drag a heading's edge to size a column
  reorder: boolean // drag a heading, or ↑ ↓ in the Columns list, to move a column
  chooseColumns: boolean // tick columns on or off in the Columns list
  wrapToggle: boolean // offer Wrap text
  densityToggle: boolean // offer Compact / Comfortable
  exportFormats: ExportFormat[] // the formats Export offers (none: no Export)
  defaultDensity: TableDensity
  defaultWrap: boolean
  excelDateFormat: ExcelDateFormat // how dates are shown in an Excel export (they are real date-times either way)
}
export const tableDefaults: TableDefaults = { resize: true, reorder: true, chooseColumns: true, wrapToggle: true, densityToggle: true, exportFormats: ['xlsx', 'csv'], defaultDensity: 'comfortable', defaultWrap: false, excelDateFormat: 'yyyy-mm-dd hh:mm' }

// Only known values are kept (a shared setting read from Git is checked like any other input).
export function normalizeTableDefaults(raw: unknown): TableDefaults {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const flag = (key: keyof TableDefaults) => typeof value[key] === 'boolean' ? value[key] as boolean : tableDefaults[key] as boolean
  const formats = Array.isArray(value.exportFormats) ? [...new Set(value.exportFormats.filter((entry): entry is ExportFormat => entry === 'xlsx' || entry === 'csv'))] : tableDefaults.exportFormats
  return {
    resize: flag('resize'), reorder: flag('reorder'), chooseColumns: flag('chooseColumns'), wrapToggle: flag('wrapToggle'), densityToggle: flag('densityToggle'), defaultWrap: flag('defaultWrap'),
    exportFormats: formats,
    defaultDensity: value.defaultDensity === 'compact' || value.defaultDensity === 'comfortable' ? value.defaultDensity : tableDefaults.defaultDensity,
    excelDateFormat: (excelDateFormats as readonly string[]).includes(value.excelDateFormat as string) ? value.excelDateFormat as ExcelDateFormat : tableDefaults.excelDateFormat,
  }
}

// A cell's value for sorting and export: text, a number, a date, or empty.
export type CellValue = string | number | Date | null | undefined
// ISO dates as Azure DevOps and the app write them ("2026-10-03", "2026-10-03T09:15:00Z", "2026-10-03 09:15").
const isoDate = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
export function asDate(value: CellValue): { date: Date; time: boolean } | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : { date: value, time: true }
  if (typeof value !== 'string') return undefined
  const match = isoDate.exec(value.trim())
  if (!match) return undefined
  const [, y, m, d, hh, mm, ss, zone] = match
  // With a zone (Azure's UTC times) the viewer's local time; without one, the wall-clock time as written.
  const date = zone ? new Date(value.trim()) : new Date(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0), Number(ss ?? 0))
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 1900 || date.getFullYear() > 9999) return undefined
  return { date, time: hh != null }
}
const pad = (value: number) => String(value).padStart(2, '0')
// A date as Excel reads it from a CSV file as a date-time: "2026-10-03 09:15:00" (date only: "2026-10-03").
export const csvDate = ({ date, time }: { date: Date; time: boolean }) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}${time ? ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` : ''}`

export const exportText = (value: CellValue) => { const date = asDate(value); return date ? csvDate(date) : value == null ? '' : String(value) }
export function exportCell(value: CellValue): XlsxCell {
  if (typeof value === 'number') return Number.isFinite(value) ? value : ''
  const date = asDate(value)
  if (date) return date
  return value == null ? '' : String(value)
}
// The CSV of the shown columns and rows: headings, then each cell formula-safe (CON-69) with dates as date-times.
export const tableCsv = (headings: string[], rows: CellValue[][]) => [headings.map(csvCell).join(','), ...rows.map((row) => row.map((value) => csvCell(exportText(value))).join(','))].join('\r\n')
export const tableSheet = (headings: string[], rows: CellValue[][]): XlsxCell[][] => [headings, ...rows.map((row) => row.map(exportCell))]

// The per-table choices of this viewer, by table id.
export interface TableLayout { order?: string[]; hidden?: string[]; density?: TableDensity }
const layoutKey = (id: string) => `demand-planning-table-layout-v1:${id}`
export function readLayout(id: string, storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): TableLayout {
  try {
    const raw = JSON.parse(storage?.getItem(layoutKey(id)) ?? '{}') as Record<string, unknown>
    const list = (entry: unknown) => Array.isArray(entry) ? entry.filter((item): item is string => typeof item === 'string') : undefined
    return { order: list(raw.order), hidden: list(raw.hidden), density: raw.density === 'compact' || raw.density === 'comfortable' ? raw.density : undefined }
  } catch { return {} }
}
export function saveLayout(id: string, layout: TableLayout, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) { try { storage?.setItem(layoutKey(id), JSON.stringify(layout)) } catch { /* this visit only */ } }

// The columns in the viewer's order: their saved order first, then any column not in it (a new one) at the end.
export function orderedIds(ids: string[], order: string[] = []) {
  const known = order.filter((id, index) => ids.includes(id) && order.indexOf(id) === index)
  return [...known, ...ids.filter((id) => !known.includes(id))]
}
export const moveId = (ids: string[], id: string, by: number) => { const from = ids.indexOf(id), to = from + by; if (from < 0 || to < 0 || to >= ids.length) return ids; const next = [...ids]; next.splice(from, 1); next.splice(to, 0, id); return next }
export const moveIdTo = (ids: string[], id: string, target: string) => { const from = ids.indexOf(id), to = ids.indexOf(target); if (from < 0 || to < 0 || from === to) return ids; const next = [...ids]; next.splice(from, 1); next.splice(to, 0, id); return next }
export function compareCells(a: CellValue, b: CellValue) {
  const empty = (value: CellValue) => value == null || value === ''
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1
  const da = asDate(a), db = asDate(b)
  if (da && db) return da.date.getTime() - db.date.getTime()
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}
