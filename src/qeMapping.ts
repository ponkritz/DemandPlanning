import type { WorkbookSheet } from './xlsx'
import { csvCell } from './csv.ts'

// QE Mapping: an uploaded Excel (or CSV) kept as it is — every sheet a tab, its first non-empty row the column names,
// every value text — then edited in the app (cells, rows, columns) and shared through Git as qe-mapping.json.
// Columns and rows have stable ids (c1, c2 … / r1, r2 …) so renaming or moving a column keeps its values.
export interface QeColumn { id: string; name: string }
export interface QeRow { id: string; cells: Record<string, string> }
export interface QeSheet { id: string; name: string; columns: QeColumn[]; rows: QeRow[] }
export interface QeMappingFile { schema: 1; kind: 'qe-mapping'; source?: { fileName: string; uploadedAt: string }; sheets: QeSheet[] }
export const qeMappingFile = 'qe-mapping.json'
// GitHub's contents API reads files up to 1 MB inline; stay below it.
export const qeMappingMaxBytes = 900_000

const nextId = (prefix: string, ids: string[]) => `${prefix}${ids.reduce((max, id) => Math.max(max, Number(id.slice(prefix.length)) || 0), 0) + 1}`

// One sheet of the workbook as a table: leading empty rows skipped, the first row the column names (an empty name
// becomes "Column N", a repeated one "Name (2)"), fully empty rows and trailing columns without name or value dropped.
export function sheetFromRows(name: string, rows: string[][], index = 0): QeSheet {
  const clean = rows.map((row) => row.map((value) => (value ?? '').toString()))
  const start = clean.findIndex((row) => row.some((value) => value.trim()))
  if (start < 0) return { id: `s${index + 1}`, name, columns: [], rows: [] }
  const header = clean[start], body = clean.slice(start + 1).filter((row) => row.some((value) => value.trim()))
  let width = Math.max(header.length, ...body.map((row) => row.length))
  while (width > 0 && !header[width - 1]?.trim() && body.every((row) => !row[width - 1]?.trim())) width--
  const seen = new Map<string, number>()
  const columns = Array.from({ length: width }, (_, i) => {
    const base = header[i]?.trim() || `Column ${i + 1}`, key = base.toLowerCase(), n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return { id: `c${i + 1}`, name: n > 1 ? `${base} (${n})` : base }
  })
  return { id: `s${index + 1}`, name, columns, rows: body.map((row, r) => ({ id: `r${r + 1}`, cells: Object.fromEntries(columns.flatMap((column, i) => row[i] ? [[column.id, row[i]]] : [])) })) }
}
export function fromWorkbook(sheets: WorkbookSheet[], fileName: string, uploadedAt = new Date().toISOString()): QeMappingFile {
  const tables = sheets.map((sheet, i) => sheetFromRows(sheet.name, sheet.rows, i)).filter((sheet) => sheet.columns.length)
  if (!tables.length) throw new Error('The file has no table: every sheet is empty.')
  return { schema: 1, kind: 'qe-mapping', source: { fileName, uploadedAt }, sheets: tables }
}

// ---- editing (each returns a new sheet) ----
export const setCell = (sheet: QeSheet, rowId: string, columnId: string, value: string): QeSheet => ({ ...sheet, rows: sheet.rows.map((row) => row.id !== rowId ? row : { ...row, cells: value === '' ? Object.fromEntries(Object.entries(row.cells).filter(([key]) => key !== columnId)) : { ...row.cells, [columnId]: value } }) })
export function addRow(sheet: QeSheet, cells: Record<string, string> = {}): { sheet: QeSheet; id: string } {
  const id = nextId('r', sheet.rows.map((row) => row.id))
  return { sheet: { ...sheet, rows: [{ id, cells }, ...sheet.rows] }, id }
}
export const deleteRows = (sheet: QeSheet, ids: string[]): QeSheet => ({ ...sheet, rows: sheet.rows.filter((row) => !ids.includes(row.id)) })
const cleanName = (name: string) => name.trim().slice(0, 120)
export function addColumn(sheet: QeSheet, name: string): QeSheet {
  const value = cleanName(name)
  if (!value) throw new Error('Give the column a name.')
  if (sheet.columns.some((column) => column.name.toLowerCase() === value.toLowerCase())) throw new Error(`There is already a column “${value}”.`)
  return { ...sheet, columns: [...sheet.columns, { id: nextId('c', sheet.columns.map((column) => column.id)), name: value }] }
}
export function renameColumn(sheet: QeSheet, id: string, name: string): QeSheet {
  const value = cleanName(name)
  if (!value) throw new Error('Give the column a name.')
  if (sheet.columns.some((column) => column.id !== id && column.name.toLowerCase() === value.toLowerCase())) throw new Error(`There is already a column “${value}”.`)
  return { ...sheet, columns: sheet.columns.map((column) => column.id === id ? { ...column, name: value } : column) }
}
export const deleteColumn = (sheet: QeSheet, id: string): QeSheet => ({ ...sheet, columns: sheet.columns.filter((column) => column.id !== id), rows: sheet.rows.map((row) => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).filter(([key]) => key !== id)) })) })
export function moveColumn(sheet: QeSheet, id: string, by: -1 | 1): QeSheet {
  const at = sheet.columns.findIndex((column) => column.id === id), to = at + by
  if (at < 0 || to < 0 || to >= sheet.columns.length) return sheet
  const columns = [...sheet.columns];[columns[at], columns[to]] = [columns[to], columns[at]]
  return { ...sheet, columns }
}
export const replaceSheet = (file: QeMappingFile, sheet: QeSheet): QeMappingFile => ({ ...file, sheets: file.sheets.map((entry) => entry.id === sheet.id ? sheet : entry) })

// ---- viewing ----
// Rows whose cells contain the search text in any shown column, and each column filter in its column (any case).
export function filterRows(sheet: QeSheet, search: string, filters: Record<string, string> = {}, columns = sheet.columns) {
  const text = search.trim().toLowerCase()
  const active = Object.entries(filters).map(([id, value]) => [id, value.trim().toLowerCase()] as const).filter(([, value]) => value)
  return sheet.rows.filter((row) => (!text || columns.some((column) => (row.cells[column.id] ?? '').toLowerCase().includes(text))) && active.every(([id, value]) => (row.cells[id] ?? '').toLowerCase().includes(value)))
}
// Rows grouped by one column's value (blank last), groups in natural order.
export function groupRows(rows: QeRow[], columnId: string) {
  const groups = new Map<string, QeRow[]>()
  for (const row of rows) { const key = row.cells[columnId] ?? ''; groups.set(key, [...(groups.get(key) ?? []), row]) }
  return [...groups.entries()].sort(([a], [b]) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).map(([value, items]) => ({ value, rows: items }))
}
// Nested grouping (QEM-11): the rows grouped by the first column, each group by the next, and so on. A group's key is
// its path of values, unique across levels, so that it can be collapsed on its own.
export interface QeGroup { key: string; columnId: string; value: string; depth: number; rows: QeRow[]; children: QeGroup[] }
export function groupTree(rows: QeRow[], columnIds: string[], path: string[] = []): QeGroup[] {
  const [first, ...rest] = columnIds
  if (!first) return []
  return groupRows(rows, first).map(({ value, rows: items }) => ({ key: JSON.stringify([...path, value]), columnId: first, value, depth: path.length, rows: items, children: groupTree(items, rest, [...path, value]) }))
}
export const groupKeys = (groups: QeGroup[]): string[] => groups.flatMap((group) => [group.key, ...groupKeys(group.children)])
export const tableRows = (columns: QeColumn[], rows: QeRow[]) => [columns.map((column) => column.name), ...rows.map((row) => columns.map((column) => row.cells[column.id] ?? ''))]
export const tableCsv = (columns: QeColumn[], rows: QeRow[]) => tableRows(columns, rows).map((row) => row.map(csvCell).join(',')).join('\r\n')

// ---- the Git file ----
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
export function parseQeMapping(raw: string): QeMappingFile {
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new Error(`${qeMappingFile} is not valid JSON.`) }
  const file = data as Partial<QeMappingFile> | null
  if (!file || file.kind !== 'qe-mapping' || !Array.isArray(file.sheets)) throw new Error(`${qeMappingFile} is not a QE Mapping file.`)
  const sheets = file.sheets.flatMap((sheet, index): QeSheet[] => {
    if (!sheet || !Array.isArray(sheet.columns) || !Array.isArray(sheet.rows)) return []
    const columns = sheet.columns.flatMap((column) => column && typeof column.id === 'string' && column.id ? [{ id: column.id, name: text(column.name, 120) || column.id }] : [])
    const ids = new Set(columns.map((column) => column.id))
    const rows = sheet.rows.flatMap((row) => row && typeof row.id === 'string' && row.id ? [{ id: row.id, cells: Object.fromEntries(Object.entries(row.cells ?? {}).flatMap(([key, value]) => ids.has(key) && text(value, 32000) ? [[key, text(value, 32000)]] : [])) }] : [])
    return [{ id: typeof sheet.id === 'string' && sheet.id ? sheet.id : `s${index + 1}`, name: text(sheet.name, 120) || `Sheet${index + 1}`, columns, rows }]
  })
  return { schema: 1, kind: 'qe-mapping', ...(file.source && typeof file.source.fileName === 'string' ? { source: { fileName: text(file.source.fileName, 255), uploadedAt: text(file.source.uploadedAt, 40) } } : {}), sheets }
}
export function serializeQeMapping(file: QeMappingFile) {
  const out = `${JSON.stringify({ schema: 1, kind: 'qe-mapping', ...(file.source ? { source: file.source } : {}), sheets: file.sheets }, null, 1)}\n`
  if (new TextEncoder().encode(out).length > qeMappingMaxBytes) throw new Error(`The QE Mapping is too large to save to Git (over ${Math.round(qeMappingMaxBytes / 1000)} KB). Remove rows or columns, or split the workbook.`)
  return out
}
