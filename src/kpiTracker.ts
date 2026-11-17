import type { WorkbookSheet } from './xlsx'

// KPI tracker (KPT): the team's KPI tracker workbook in SharePoint, read only. The desktop app reads it live (KPT-02);
// every read by a role with Manage shared settings is kept in the Git data repository as kpi-tracker.json (KPT-03), so
// the page still shows the data when SharePoint cannot be reached, in the browser and for everyone else.

export const kpiTrackerFile = 'kpi-tracker.json'
export const kpiLimits = { sheets: 20, rows: 2000, columns: 100, cell: 1000 }

export interface KpiSheet { name: string; rows: string[][] }
export interface KpiTracker { schema: 1; fileUrl: string; fileName: string; readAt: string; readBy: string; modified?: string; truncated?: boolean; sheets: KpiSheet[] }
export interface SharePointFileResult { ok: boolean; status: number; message: string; signIn?: boolean; name?: string; modified?: string; bytes?: Uint8Array }

declare global { interface Window { sharePointFile?: { read: (request: { fileUrl: string }) => Promise<SharePointFileResult>; signIn: (request: { fileUrl: string }) => Promise<SharePointFileResult>; signOut: () => Promise<{ ok: boolean }> } } }

// The link as the page takes it (the desktop app checks it again): https, a SharePoint site path, an .xlsx file.
export function checkTrackerUrl(text: string): string {
  const value = text.trim()
  let url: URL
  try { url = new URL(value) } catch { throw new Error('Paste the link of the Excel file in SharePoint (Copy path or Copy link).') }
  if (url.protocol !== 'https:') throw new Error('The SharePoint link must start with https://.')
  if (url.username || url.password) throw new Error('The SharePoint link must not contain a user name or password.')
  let path = url.pathname.replace(/^\/:[a-z]:\/[a-z]\//i, '/')
  try { path = decodeURIComponent(path) } catch { throw new Error('The SharePoint link is not a valid address.') }
  if (!/^\/(sites|teams)\/[^/]+\/.+\.xlsx$/i.test(path) || path.split('/').some((part) => part === '..')) throw new Error('The link must point to an .xlsx file in a SharePoint site (…/sites/<site>/…/<file>.xlsx).')
  return value.length > 2000 ? value.slice(0, 2000) : value
}

// The workbook as kept: every sheet with something in it, trailing empty rows and columns dropped, within the limits
// (more is cut off and marked truncated). Cells are text, as the Excel reader gives them.
export function trackerFromWorkbook(sheets: WorkbookSheet[], meta: { fileUrl: string; fileName: string; readAt: string; readBy: string; modified?: string }): KpiTracker {
  let truncated = sheets.length > kpiLimits.sheets
  const kept = sheets.slice(0, kpiLimits.sheets).flatMap((sheet) => {
    let rows = sheet.rows.map((row) => row.map((cell) => String(cell ?? '')))
    while (rows.length && rows[rows.length - 1].every((cell) => !cell.trim())) rows.pop()
    if (!rows.length) return []
    const width = Math.max(...rows.map((row) => { let end = row.length; while (end && !row[end - 1].trim()) end--; return end }))
    if (rows.length > kpiLimits.rows || width > kpiLimits.columns) truncated = true
    rows = rows.slice(0, kpiLimits.rows).map((row) => Array.from({ length: Math.min(width, kpiLimits.columns) }, (_, at) => { const cell = row[at] ?? ''; if (cell.length > kpiLimits.cell) truncated = true; return cell.slice(0, kpiLimits.cell) }))
    return [{ name: String(sheet.name).slice(0, 100) || 'Sheet', rows }]
  })
  return { schema: 1, fileUrl: meta.fileUrl, fileName: meta.fileName.slice(0, 200), readAt: meta.readAt, readBy: meta.readBy.slice(0, 200), ...(meta.modified ? { modified: meta.modified.slice(0, 100) } : {}), ...(truncated ? { truncated: true } : {}), sheets: kept }
}

export const serializeTracker = (tracker: KpiTracker) => `${JSON.stringify(tracker)}\n`

// The Git copy, checked when read: a schema 1 file, its link checked, text cells within the limits.
export function parseTracker(text: string): KpiTracker {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error(`${kpiTrackerFile} is not valid JSON.`) }
  const input = raw as Record<string, unknown> | null
  if (!input || typeof input !== 'object' || input.schema !== 1 || !Array.isArray(input.sheets)) throw new Error(`${kpiTrackerFile} is not a KPI tracker file (schema 1).`)
  const textOf = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : ''
  let fileUrl = ''
  try { fileUrl = checkTrackerUrl(textOf(input.fileUrl, 2000)) } catch { fileUrl = '' }
  const sheets = input.sheets.slice(0, kpiLimits.sheets).flatMap((sheet: unknown) => {
    const entry = (sheet && typeof sheet === 'object' ? sheet : {}) as Record<string, unknown>
    const rows = (Array.isArray(entry.rows) ? entry.rows : []).slice(0, kpiLimits.rows).map((row: unknown) => (Array.isArray(row) ? row : []).slice(0, kpiLimits.columns).map((cell) => typeof cell === 'string' ? cell.slice(0, kpiLimits.cell) : cell == null ? '' : String(cell).slice(0, kpiLimits.cell)))
    return rows.length ? [{ name: textOf(entry.name, 100) || 'Sheet', rows }] : []
  })
  const modified = textOf(input.modified, 100)
  return { schema: 1, fileUrl, fileName: textOf(input.fileName, 200), readAt: textOf(input.readAt, 40), readBy: textOf(input.readBy, 200), ...(modified ? { modified } : {}), ...(input.truncated === true ? { truncated: true } : {}), sheets }
}

// A sheet as a table: the first row with text is the header (blank headings become "Column N", repeats get " (2)").
export function sheetTable(sheet: KpiSheet) {
  const start = sheet.rows.findIndex((row) => row.some((cell) => cell.trim()))
  if (start < 0) return { headers: [] as string[], rows: [] as string[][] }
  const width = Math.max(...sheet.rows.map((row) => row.length))
  const used = new Map<string, number>()
  const headers = Array.from({ length: width }, (_, at) => {
    const base = sheet.rows[start][at]?.trim() || `Column ${at + 1}`
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    return count > 1 ? `${base} (${count})` : base
  })
  const rows = sheet.rows.slice(start + 1).filter((row) => row.some((cell) => cell.trim())).map((row) => headers.map((_, at) => row[at] ?? ''))
  return { headers, rows }
}
