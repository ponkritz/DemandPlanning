import { csvCell, csvSafe } from './csv.ts'
import { capLog, cellText, hasOptions, isEmpty, maxLongValue, maxRows, maxValue, moneyOf, newId, rowError, rowId, upsertRow, valuesOf, type OnDemandColumn, type OnDemandPage, type OnDemandRow, type OnDemandValue } from './onDemand.ts'
import { columnLetter, inlineList, readCsv, readXlsx, sheetName, sheetRef, type WorkbookSheet, type XlsxCell, type XlsxSheet, type XlsxValidation } from './xlsx.ts'

// OND-103…OND-108 Bulk upload on the On-Demand table pages (CoNQ, every Table and Table + Insights page): an Excel
// template of the page with data validation for its columns, filled in Excel and uploaded in one go — rows with a Row ID
// update that row, rows without one are added — after a preview "N added · N updated · N unchanged · N with errors".

// ---- limits (OND-107) ----
// The file: at most 10 MB and as many data rows as a page may hold (5,000, OND-08); one upload adds or updates at most
// 2,000 rows (a template with every row of a large page can be uploaded with a few changed), and the page may not grow
// beyond its 5,000 rows. The reader's own limits stay (100 MB unpacked, Excel's sheet size, KB-04).
export const maxUploadBytes = 10 * 1024 * 1024
export const maxUploadRows = maxRows
export const maxUploadChanges = 2000
// The preview lists the first rows of the file; the error report holds all of them.
export const previewRowCount = 50

export const rowIdHeader = 'Row ID'
// OND-104: several values of a Multi-select in one cell, separated by a semicolon (Excel's list validation takes one).
export const multiSeparator = ';'
const fmt = (n: number) => n.toLocaleString('en-US')
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`

// ---- the template (OND-103, OND-104) ----
const isDateText = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const isNumberText = (value: string) => value.trim() !== '' && Number.isFinite(Number(value))
// A cell of the template as Excel should hold it: a Number as a number, a Date as a real date, a Multi-select as its
// values separated by "; ", the rest as text (a Currency as "1200.5 EUR").
function templateCell(column: OnDemandColumn, value: OnDemandValue | undefined): XlsxCell {
  const text = cellText(value)
  if (!text) return ''
  if (column.type === 'number' && isNumberText(text)) return Number(text)
  if (column.type === 'date' && isDateText(text)) { const [y, m, d] = text.split('-').map(Number); return { date: new Date(y, m - 1, d), time: false } }
  if (column.type === 'multi') return valuesOf(value).join(`${multiSeparator} `)
  return text
}
const typeHint = (column: OnDemandColumn): string => {
  switch (column.type) {
    // LST-10: a built-in list column offers the list's values as the list is now.
    case 'dropdown': return column.list ? 'Choose one value of the built-in list.' : 'Choose one value of the list.'
    case 'multi': return `One or more values of the ${column.list ? 'built-in ' : ''}list; separate several values with ${multiSeparator} (e.g. A${multiSeparator} B).`
    case 'number': return 'A number.'
    case 'currency': return `An amount, optionally with its currency code, e.g. 1200.50 ${column.currency ?? 'EUR'}.`
    case 'date': return 'A date, e.g. 2026-11-25.'
    case 'longtext': return `Text, up to ${fmt(maxLongValue)} characters.`
    default: return `Text, up to ${fmt(maxValue)} characters.`
  }
}
const prompt = (column: OnDemandColumn) => `${column.required ? 'Required. ' : ''}${typeHint(column)}${column.description ? ` ${column.description}` : ''}`
// Control characters (below a space, and DEL) are left out of a file name.
const printable = (text: string) => [...text].filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('')
export const templateFileName = (page: Pick<OnDemandPage, 'name'>) => `${printable(page.name).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'page'} - upload template.xlsx`

// The workbook: one sheet named after the page — Row ID first (grey, not to be edited), then the page's columns in order
// (a required one on a light fill), the header kept in view — and, when a list is too long for Excel's inline list (255
// characters) or an option holds a comma, a hidden sheet "Lists" with those columns' options, referenced as a range.
// rows: the rows to prefill (with their IDs), or none for an empty template. The validation covers the rows written and
// at least the 2,000 below the header that one upload may change.
export function templateWorkbook(page: OnDemandPage, rows: OnDemandRow[] = []): XlsxSheet[] {
  const used = new Set<string>()
  const dataName = sheetName(page.name, used)
  const listsName = sheetName('Lists', used)
  const last = Math.max(rows.length, maxUploadChanges) + 1
  const range = (c: number) => `${columnLetter(c)}2:${columnLetter(c)}${last}`
  const lists: string[][] = []
  const validations: XlsxValidation[] = [
    { sqref: 'A1', type: 'none', promptTitle: rowIdHeader, prompt: 'Do not edit. Filled: the upload updates that row. Empty: the upload adds a new row. Delete a row here to leave it unchanged.' },
    { sqref: `A2:A${last}`, type: 'none', promptTitle: rowIdHeader, prompt: 'Do not edit: it finds the row to update. Leave it empty on a new row.' },
  ]
  page.columns.forEach((column, index) => {
    const c = index + 1, title = column.name
    validations.push({ sqref: `${columnLetter(c)}1`, type: 'none', promptTitle: title, prompt: prompt(column) })
    const common = { sqref: range(c), promptTitle: title, prompt: prompt(column), errorTitle: title }
    if (hasOptions(column.type) && column.options.length) {
      const inline = inlineList(column.options)
      let source: string | undefined
      if (!inline) { lists.push([column.name, ...column.options]); const at = columnLetter(lists.length - 1); source = `${sheetRef(listsName)}!$${at}$2:$${at}$${column.options.length + 1}` }
      // Multi-select: the list offers the options, any text is accepted (several values separated by ;).
      validations.push({ ...common, type: 'list', ...(source ? { source } : { items: column.options }), strict: column.type === 'dropdown', error: `Choose a value of the list of ${column.name}.` })
    } else if (column.type === 'date') validations.push({ ...common, type: 'date', operator: 'between', formula1: 1, formula2: 2958465, error: 'Enter a date, e.g. 2026-11-25.' })
    else if (column.type === 'number') validations.push({ ...common, type: 'decimal', operator: 'between', formula1: -1e15, formula2: 1e15, error: 'Enter a number.' })
    else if (column.type === 'text' || column.type === 'longtext') { const max = column.type === 'text' ? maxValue : maxLongValue; validations.push({ ...common, type: 'textLength', operator: 'lessThanOrEqual', formula1: max, error: `At most ${fmt(max)} characters.` }) }
    else validations.push({ ...common, type: 'none' })
  })
  const header = [rowIdHeader, ...page.columns.map((column) => column.name)]
  const data: XlsxSheet = {
    name: dataName, freeze: true,
    widths: [14, ...page.columns.map((column) => column.type === 'longtext' ? 50 : Math.max(12, Math.min(40, column.name.length + 4)))],
    headerMarks: ['muted', ...page.columns.map((column) => column.required ? 'required' as const : '' as const)],
    rows: [header, ...rows.map((row) => [rowId(page, row) || row.key || '', ...page.columns.map((column) => templateCell(column, row.cells[column.id]))])],
    validations,
  }
  if (!lists.length) return [data]
  const height = Math.max(...lists.map((list) => list.length))
  return [data, { name: listsName, hidden: true, rows: Array.from({ length: height }, (_, r) => lists.map((list) => list[r] ?? '')) }]
}

// ---- reading the file (OND-105) ----
// The file is refused before it is read when it is not .xlsx or .csv, or larger than 10 MB.
export function fileError(file: { name: string; size: number }): string {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xls')) return 'Old .xls files cannot be read. Open the file in Excel and save it as .xlsx (Excel Workbook), then upload that.'
  if (!name.endsWith('.xlsx') && !name.endsWith('.csv')) return 'Choose an Excel (.xlsx) or CSV file — the template from ⋯ → Download Excel template….'
  if (file.size > maxUploadBytes) return `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB; an upload takes at most ${maxUploadBytes / 1024 / 1024} MB. Keep only the rows to add or change and upload it again.`
  return ''
}
// OND-105, OND-136: a chosen file read in the browser (nothing is sent anywhere): refused before it is read when it is not
// .xlsx or .csv or too large (OND-107), a CSV as one sheet named after the file. Throws with the reason.
export async function readSheets(file: File): Promise<WorkbookSheet[]> {
  const refused = fileError(file)
  if (refused) throw new Error(refused)
  const sheets = file.name.toLowerCase().endsWith('.csv') ? [{ name: file.name.replace(/\.csv$/i, ''), rows: readCsv(await file.text()) }] : await readXlsx(new Uint8Array(await file.arrayBuffer()))
  if (!sheets.length) throw new Error('No sheets were found in this file.')
  return sheets
}
export const uploadAccept = '.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv'
// The file's name as it is written in History and the commit: its base name, without control characters, at most 120.
export const uploadName = (name: string) => printable(name.split(/[\\/]/).pop() ?? '').trim().slice(0, 120) || 'upload'

// A header as it is compared: upper and lower case and every space ignored.
export const headerKey = (name: string) => name.toLowerCase().replace(/\s+/g, '')
const idKeys = new Set([headerKey(rowIdHeader), 'id'])
export interface HeaderMatch {
  idIndex: number
  // The file's column index of each matched page column, in the file's order.
  columns: { index: number; column: OnDemandColumn }[]
  ignored: string[]; duplicates: string[]; missingRequired: string[]
}
// OND-105: the header row matched to the page's columns by name (case and spaces ignored); "Row ID" (or "ID") finds the
// row to update. A header that is no column of the page is ignored and listed; a column named twice is read from its
// first place; required columns missing from the file are listed (rows added without them have errors).
export function matchHeader(page: Pick<OnDemandPage, 'columns'>, header: string[]): HeaderMatch {
  const byKey = new Map(page.columns.map((column) => [headerKey(column.name), column]))
  const match: HeaderMatch = { idIndex: -1, columns: [], ignored: [], duplicates: [], missingRequired: [] }
  const seen = new Set<string>()
  header.forEach((raw, index) => {
    const name = raw.trim(), key = headerKey(name)
    if (!key) return
    if (seen.has(key)) { match.duplicates.push(name); return }
    seen.add(key)
    const column = byKey.get(key)
    if (column) match.columns.push({ index, column })
    else if (idKeys.has(key) && match.idIndex < 0) match.idIndex = index
    else match.ignored.push(name)
  })
  match.missingRequired = page.columns.filter((column) => column.required && !match.columns.some((entry) => entry.column.id === column.id)).map((column) => column.name)
  return match
}
// The sheet to read: the one named after the page, else the one whose header row matches most of the page's columns
// (the hidden Lists sheet never does), else the first.
export function pickSheet(page: Pick<OnDemandPage, 'name' | 'columns'>, sheets: WorkbookSheet[]): WorkbookSheet | undefined {
  const named = sheetName(page.name, new Set()).toLowerCase()
  const exact = sheets.find((sheet) => sheet.name.toLowerCase() === named || sheet.name.toLowerCase() === page.name.toLowerCase())
  if (exact) return exact
  const score = (sheet: WorkbookSheet) => matchHeader(page, sheet.rows.find((row) => row.some((cell) => cell.trim())) ?? []).columns.length
  return [...sheets].sort((a, b) => score(b) - score(a))[0]
}

// ---- one cell (OND-105, OND-108) ----
// OND-108: a Text or Long text value that a spreadsheet would run as a formula (=, +, -, @, a tab or a carriage return
// first, + / - not a plain number) is stored with an apostrophe first — the rule of every CSV export (csvSafe) — so it
// stays text wherever the rows go next. Values are never evaluated: the reader takes a formula cell's last result only.
export const neutralise = csvSafe
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const option = (column: OnDemandColumn, value: string) => column.options.find((entry) => sameText(entry, value))
export interface ParsedCell { value: OnDemandValue; error?: string; neutralised?: boolean }
// A cell of the file as its column keeps it: an option in its own spelling (case and surrounding spaces ignored), a
// Multi-select split at ";" (or at "," when that gives only options, as the table's export writes it), a number, a date
// as YYYY-MM-DD (an Excel date, or text), an amount with its currency, text cut at nothing — too long is an error.
export function parseCell(column: OnDemandColumn, raw: string): ParsedCell {
  const text = raw.trim()
  if (!text) return column.required ? { value: '', error: `“${column.name}” is required` } : { value: '' }
  switch (column.type) {
    case 'dropdown': { const found = option(column, text); return found ? { value: found } : { value: text, error: `“${text}” is not an option of ${column.name}` } }
    case 'multi': {
      const whole = option(column, text)
      if (whole) return { value: [whole] }
      const split = (pattern: RegExp) => text.split(pattern).map((entry) => entry.trim()).filter(Boolean)
      for (const parts of [split(/;/), split(/[;,]/)]) if (parts.every((entry) => option(column, entry))) return { value: [...new Set(parts.map((entry) => option(column, entry)!))] }
      const unknown = split(/;/).filter((entry) => !option(column, entry))
      return { value: text, error: `${unknown.map((entry) => `“${entry}”`).join(', ')} ${unknown.length === 1 ? 'is not an option' : 'are not options'} of ${column.name} (separate several values with ${multiSeparator})` }
    }
    case 'number': return isNumberText(text) ? { value: String(Number(text)) } : { value: text, error: `“${column.name}” is not a number: “${text.slice(0, 40)}”` }
    case 'date': { const day = /^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.exec(text)?.[1]; return day && isDateText(day) ? { value: day } : { value: text, error: `“${column.name}” is not a date (YYYY-MM-DD): “${text.slice(0, 40)}”` } }
    case 'currency': { const money = moneyOf(text, column.currency); return money ? { value: `${money.amount} ${money.currency}` } : { value: text, error: `“${column.name}” is not an amount (e.g. 1200.50 ${column.currency ?? 'EUR'}): “${text.slice(0, 40)}”` } }
    default: {
      const max = column.type === 'longtext' ? maxLongValue : maxValue
      if (text.length > max) return { value: text, error: `“${column.name}” is longer than ${fmt(max)} characters` }
      const safe = neutralise(text)
      return safe === text ? { value: text } : { value: safe, neutralised: true }
    }
  }
}
// The same value as the row holds already (a number or an amount compared by value, a list in its order).
function sameValue(column: OnDemandColumn, before: OnDemandValue | undefined, after: OnDemandValue) {
  if (isEmpty(before) && isEmpty(after)) return true
  if (column.type === 'number') { const a = cellText(before), b = cellText(after); return isNumberText(a) && isNumberText(b) ? Number(a) === Number(b) : a === b }
  if (column.type === 'currency') { const a = moneyOf(before, column.currency), b = moneyOf(after, column.currency); return a && b ? a.amount === b.amount && a.currency === b.currency : cellText(before) === cellText(after) }
  return valuesOf(before).join('\u0000') === valuesOf(after).join('\u0000')
}

// ---- the plan (OND-105, OND-106) ----
export interface PlannedRow {
  line: number; action: 'add' | 'update'
  // The row's id (an update) and its ID as shown.
  id: string; label: string
  // The values of the file's columns (an empty value clears the cell).
  cells: Record<string, OnDemandValue>
  changes: { column: string; from: string; to: string }[]
}
export interface UploadError { line: number; rowId: string; message: string }
export interface UploadPlan {
  sheet: string
  added: PlannedRow[]; updated: PlannedRow[]; unchanged: number; errors: UploadError[]
  // Rows to update that someone else is editing (row locks, OND-35): skipped and counted.
  locked: number
  // Text values stored with an apostrophe first (OND-108).
  neutralised: number
  header: HeaderMatch
  // The rows of the file in order, for the preview: what happens to each.
  lines: { line: number; rowId: string; outcome: 'add' | 'update' | 'unchanged' | 'error' | 'locked'; text: string }[]
  // Why nothing can be saved ('' when the valid rows can).
  refused: string
}
// What the upload would do: each data row of the sheet (the header is its first row with a value; empty rows are left
// out) is checked — its Row ID found among the page's rows (also hidden ones; one not found is an error, "Row not found",
// never added), every value parsed for its column, required values present, the row as a whole as the drawer checks it
// (OND-04) — and becomes an add, an update, unchanged or an error. A Row ID twice in the file is an error the second time.
export function planUpload(page: OnDemandPage, sheet: WorkbookSheet, { locked = new Set<string>() }: { locked?: Set<string> } = {}): UploadPlan {
  const start = sheet.rows.findIndex((row) => row.some((cell) => (cell ?? '').trim()))
  const header = matchHeader(page, start < 0 ? [] : sheet.rows[start])
  const plan: UploadPlan = { sheet: sheet.name, added: [], updated: [], unchanged: 0, errors: [], locked: 0, neutralised: 0, header, lines: [], refused: '' }
  if (start < 0) { plan.refused = 'The file is empty.'; return plan }
  if (!header.columns.length) { plan.refused = `No column of ${page.name} was found in the first row of “${sheet.name}”: it needs the page’s column names (${page.columns.slice(0, 5).map((column) => column.name).join(', ')}${page.columns.length > 5 ? ' …' : ''}). Download the template from ⋯ → Download Excel template….`; return plan }
  const data = sheet.rows.slice(start + 1).map((cells, offset) => ({ cells, line: start + offset + 2 })).filter(({ cells }) => cells.some((cell) => (cell ?? '').trim()))
  if (data.length > maxUploadRows) { plan.refused = `The file has ${fmt(data.length)} rows; an upload reads at most ${fmt(maxUploadRows)}. Keep only the rows to add or change.`; return plan }
  const byId = new Map<string, OnDemandRow>()
  for (const row of page.rows) { const id = rowId(page, row); if (id) byId.set(id.toUpperCase(), row); if (row.key) byId.set(row.key.toUpperCase(), row) }
  const seen = new Set<string>()
  for (const { cells, line } of data) {
    const given = header.idIndex >= 0 ? (cells[header.idIndex] ?? '').trim() : ''
    const fail = (message: string) => { plan.errors.push({ line, rowId: given, message }); plan.lines.push({ line, rowId: given, outcome: 'error', text: message }) }
    const existing = given ? byId.get(given.toUpperCase()) : undefined
    if (given && !existing) { fail(`Row not found: ${given.slice(0, 40)} is not a row of ${page.name} (deleted, or a Row ID of another page). Clear the Row ID to add it as a new row.`); continue }
    if (existing) { if (seen.has(existing.id)) { fail(`${given} is in the file twice: only its first row is used.`); continue } seen.add(existing.id) }
    const values: Record<string, OnDemandValue> = {}
    const problems: string[] = []
    let neutralised = 0
    for (const { index, column } of header.columns) {
      const raw = cells[index] ?? ''
      // A value the row holds already, exactly as the template wrote it, is kept as it is (also one "not in the list").
      const before = existing?.cells[column.id]
      if (existing && (raw.trim() === cellText(before).trim() || (column.type === 'multi' && raw.trim() === valuesOf(before).join(`${multiSeparator} `)))) { if (before !== undefined) values[column.id] = before; else values[column.id] = ''; continue }
      const parsed = parseCell(column, raw)
      if (parsed.error) problems.push(parsed.error)
      if (parsed.neutralised) neutralised++
      values[column.id] = parsed.value
    }
    if (!existing) for (const name of header.missingRequired) problems.push(`“${name}” is required (the column is not in the file)`)
    if (problems.length) { fail(`${problems.join('; ')}.`); continue }
    const label = existing ? rowId(page, existing) || existing.key || given : 'New row'
    if (existing) {
      const changes = header.columns.filter(({ column }) => !sameValue(column, existing.cells[column.id], values[column.id])).map(({ column }) => ({ column: column.name, from: cellText(existing.cells[column.id]), to: cellText(values[column.id]) }))
      if (!changes.length) { plan.unchanged++; plan.lines.push({ line, rowId: label, outcome: 'unchanged', text: 'No change' }); continue }
      const merged = { ...existing.cells, ...Object.fromEntries(changes.map((change) => { const column = page.columns.find((entry) => entry.name === change.column)!; return [column.id, values[column.id]] })) }
      const whole = rowError(page.columns, merged)
      if (whole) { fail(whole); continue }
      if (existing.key && locked.has(existing.key)) { plan.locked++; plan.lines.push({ line, rowId: label, outcome: 'locked', text: 'Skipped: someone else is editing this row' }); continue }
      plan.neutralised += neutralised
      const changed = Object.fromEntries(changes.map((change) => { const column = page.columns.find((entry) => entry.name === change.column)!; return [column.id, values[column.id]] }))
      plan.updated.push({ line, action: 'update', id: existing.id, label, cells: changed, changes })
      plan.lines.push({ line, rowId: label, outcome: 'update', text: changes.map((change) => `${change.column}: ${change.from || '(empty)'} → ${change.to || '(empty)'}`).join('; ') })
    } else {
      const whole = rowError(page.columns, values)
      if (whole) { fail(whole); continue }
      plan.neutralised += neutralised
      const changes = header.columns.filter(({ column }) => !isEmpty(values[column.id])).map(({ column }) => ({ column: column.name, from: '', to: cellText(values[column.id]) }))
      plan.added.push({ line, action: 'add', id: '', label, cells: values, changes })
      plan.lines.push({ line, rowId: '', outcome: 'add', text: changes.map((change) => `${change.column}: ${change.to}`).join('; ') })
    }
  }
  const changing = plan.added.length + plan.updated.length
  if (changing > maxUploadChanges) plan.refused = `${fmt(changing)} rows would be added or updated; one upload changes at most ${fmt(maxUploadChanges)}. Split the file and upload the parts one after another.`
  else if (page.rows.length + plan.added.length > maxRows) plan.refused = `${page.name} would have ${fmt(page.rows.length + plan.added.length)} rows; a page holds at most ${fmt(maxRows)}.`
  return plan
}
// "2 added · 1 updated · 0 unchanged · 1 with errors"
export const planSummary = (plan: Pick<UploadPlan, 'added' | 'updated' | 'unchanged' | 'errors'>) => `${fmt(plan.added.length)} added · ${fmt(plan.updated.length)} updated · ${fmt(plan.unchanged)} unchanged · ${fmt(plan.errors.length)} with errors`

// OND-105: the error report — every row with an error: its line in the file, its Row ID and what is wrong (CSV, each
// cell made safe for a spreadsheet as every export is).
export const errorReportCsv = (plan: Pick<UploadPlan, 'errors' | 'sheet'>) => [['Line', rowIdHeader, 'Error'], ...plan.errors.map((error) => [error.line, error.rowId, error.message])].map((row) => row.map(csvCell).join(',')).join('\r\n')

// ---- saving (OND-106) ----
export interface UploadEdit { by?: string; fileName: string; locked?: Set<string>; random?: () => number; now?: () => number }
export interface UploadDone { page: OnDemandPage; added: number; updated: number; locked: number; missing: number }
// The page with the upload done, applied to the page as it is in Git when the save is made (GIT-17): each update to the
// row with that id (hidden rows too) — only the file's columns change — and each add as a new row; every added or
// changed row gets its update-log entry (OND-21) with the comment "Bulk upload from {file}". A row deleted meanwhile is
// skipped (missing), a row someone else is editing now is skipped (locked); a row the save finds unchanged writes nothing.
export function applyUpload(page: OnDemandPage, plan: Pick<UploadPlan, 'added' | 'updated'>, edit: UploadEdit): UploadDone {
  const { random = Math.random, now = Date.now, locked = new Set<string>() } = edit
  const comment = `Bulk upload from ${uploadName(edit.fileName)}`.slice(0, 500)
  const done: UploadDone = { page, added: 0, updated: 0, locked: 0, missing: 0 }
  const tag = (next: OnDemandPage, id: string) => ({ ...next, rows: next.rows.map((row) => { if (row.id !== id || !row.log?.length) return row; const log = [...row.log]; log[log.length - 1] = { ...log[log.length - 1], comment }; return { ...row, log: capLog(log) } }) })
  let current = page
  for (const planned of plan.updated) {
    const row = current.rows.find((entry) => entry.id === planned.id)
    if (!row) { done.missing++; continue }
    if (row.key && locked.has(row.key)) { done.locked++; continue }
    const next = upsertRow(current, { id: row.id, ...(row.key ? { key: row.key } : {}), cells: { ...row.cells, ...planned.cells } }, { by: edit.by, random, now })
    if (next === current) continue
    current = tag(next, row.id); done.updated++
  }
  for (const planned of plan.added) {
    const id = newId('r', random, now)
    current = tag(upsertRow(current, { id, cells: planned.cells }, { by: edit.by, random, now }), id); done.added++
  }
  done.page = current
  return done
}
// OND-141: columns — the new columns added in the same save ("; 2 columns added").
export const uploadCommit = (page: Pick<OnDemandPage, 'name'>, fileName: string, plan: Pick<UploadPlan, 'added' | 'updated'>, columns = 0) => `${page.name}: bulk upload from ${uploadName(fileName)} (${plural(plan.added.length, 'row')} added, ${plural(plan.updated.length, 'row')} updated${columns ? `; ${plural(columns, 'column')} added` : ''})`
export const uploadResult = (done: Omit<UploadDone, 'page'>, errors: number) => [
  `${plural(done.added, 'row')} added, ${plural(done.updated, 'row')} updated`,
  done.locked ? `${plural(done.locked, 'row')} being edited by someone else skipped` : '',
  done.missing ? `${plural(done.missing, 'row')} deleted meanwhile skipped` : '',
  errors ? `${plural(errors, 'row')} with errors not saved` : '',
].filter(Boolean).join('; ')
