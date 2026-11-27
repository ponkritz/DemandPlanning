import { headerKey, planUpload, rowIdHeader, multiSeparator, type UploadPlan } from './bulkUpload.ts'
import { applyColumns, columnDrafts, columnsError, currencyCodes, defaultCurrency, hasOptions, maxColumns, maxOptions, newId, type ColumnDraft, type OnDemandPage, type OnDemandType } from './onDemand.ts'
import { columnLetter, type WorkbookSheet } from './xlsx.ts'

// OND-136…OND-142 Start a Table (Build your own) from a file: the columns of a page made from the header of an .xlsx or
// CSV file, each with a suggested type the person confirms or changes, and the file's rows checked and saved with them in
// one change — on a new page (Add page → Start from a file, or Start from a file… on a page without columns) and, for the
// columns a page does not have yet, in Upload Excel… (ticked ones are added). The reading, limits, cell checks, formula
// neutralising and the save are those of the bulk upload (src/bulkUpload.ts, OND-105…OND-108). Kept free of React
// (tests/start-from-file.test.mjs).

// ---- the suggestion (OND-137) ----
// Dropdown: the filled cells of a column hold at most this many different values (case and surrounding spaces ignored)
// and each value repeats — on average twice or more (different values ≤ half the filled cells).
export const dropdownMaxValues = 10
// Long text: a value longer than this many characters, or one with a line break.
export const longTextFrom = 255
// A pop-up with more columns than this opens full size (UI-STANDARDS §4: a long list).
export const fullSizeFrom = 12

// A number as the suggestion takes it: digits with an optional minus and decimals, no leading zero ("0123" is a code,
// kept as Text), no thousands separators, no exponent or hexadecimal.
const numberPattern = /^-?(0|[1-9]\d*)(\.\d+)?$/
// A date as the reader gives an Excel date (YYYY-MM-DD, with the time when it has one) or as text in that form.
const datePattern = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/
const isDate = (value: string) => { const match = datePattern.exec(value); if (!match) return false; const day = `${match[1]}-${match[2]}-${match[3]}`; const parsed = new Date(`${day}T00:00:00Z`); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day }
// An amount with a currency code of the app's list (EUR, USD …), e.g. "1200.50 EUR"; an amount alone is allowed in a
// column where at least one value has its code.
const moneyPattern = /^(-?\d+(?:\.\d+)?)(?:\s+([A-Za-z]{3}))?$/
const codeOf = (value: string) => moneyPattern.exec(value)?.[2]?.toUpperCase()

export interface Suggestion { type: OnDemandType; options: string[]; currency?: string }
const filled = (values: string[]) => values.map((value) => (value ?? '').trim()).filter(Boolean)
// The different values of a column, each in its first spelling (case and surrounding spaces ignored), in file order; a
// Multi-select's cells split at ";" (OND-104). At most the options a column may have (OND-05).
export function optionsFrom(values: string[], type: OnDemandType = 'dropdown'): string[] {
  const seen = new Map<string, string>()
  for (const value of filled(values)) for (const part of type === 'multi' ? value.split(multiSeparator).map((entry) => entry.trim()).filter(Boolean) : [value]) {
    const name = part.replace(/\s+/g, ' ').slice(0, 120), key = name.toLowerCase()
    if (!seen.has(key)) seen.set(key, name)
  }
  return [...seen.values()].slice(0, maxOptions)
}
// OND-137: the type suggested for a column from its values — the first that fits every filled cell of: Number, Date
// (an Excel date or YYYY-MM-DD), Currency (amounts, at least one with a code of the app's list; the most used code is the
// column's default), then Long text (a value over 255 characters or with a line break), Dropdown (few values that repeat,
// see dropdownMaxValues; its options the values) — else Text. A column without values is Text; mixed values are Text (or
// a Dropdown when they are few and repeat). Multi-select is never suggested (the person may choose it).
export function suggestType(values: string[]): Suggestion {
  const cells = filled(values)
  if (!cells.length) return { type: 'text', options: [] }
  if (cells.every((value) => numberPattern.test(value))) return { type: 'number', options: [] }
  if (cells.every(isDate)) return { type: 'date', options: [] }
  const codes = cells.map(codeOf)
  if (cells.every((value) => moneyPattern.test(value)) && codes.some(Boolean) && codes.every((code) => !code || currencyCodes.includes(code))) {
    const counts = new Map<string, number>()
    for (const code of codes) if (code) counts.set(code, (counts.get(code) ?? 0) + 1)
    const currency = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? defaultCurrency
    return { type: 'currency', options: [], currency }
  }
  if (cells.some((value) => value.length > longTextFrom || /[\r\n]/.test(value))) return { type: 'longtext', options: [] }
  const options = optionsFrom(cells)
  if (options.length <= dropdownMaxValues && options.length * 2 <= cells.length) return { type: 'dropdown', options }
  return { type: 'text', options: [] }
}

// ---- the file's columns (OND-136) ----
export interface FileColumn {
  // The column's place in the file (0 = A), its header as written (a column without a header: "Column C") and its values.
  index: number; name: string; values: string[]
}
export interface FileColumns { header: number; columns: FileColumn[]; rows: number; rowIdLeftOut: boolean; refused: string }
// The header is the sheet's first row with a value (as the upload reads it); a column with neither a header nor a value
// is left out; a column without a header but with values is named after its letter ("Column C"); a name used twice (case
// and spaces ignored) gets " (2)", " (3)" …; a "Row ID" column is left out (a new page has no rows to update, OND-105).
// More columns than a page may have (60) is refused with the reason.
export function fileColumns(sheet: WorkbookSheet): FileColumns {
  const start = sheet.rows.findIndex((row) => row.some((cell) => (cell ?? '').trim()))
  if (start < 0) return { header: -1, columns: [], rows: 0, rowIdLeftOut: false, refused: 'The file is empty.' }
  const data = sheet.rows.slice(start + 1).filter((row) => row.some((cell) => (cell ?? '').trim()))
  const width = Math.max(sheet.rows[start].length, ...data.map((row) => row.length))
  const used = new Set<string>()
  const columns: FileColumn[] = []
  let rowIdLeftOut = false
  for (let index = 0; index < width; index++) {
    const header = (sheet.rows[start][index] ?? '').trim().replace(/\s+/g, ' ').slice(0, 120)
    const values = data.map((row) => row[index] ?? '')
    if (!header && !values.some((value) => value.trim())) continue
    if (headerKey(header) === headerKey(rowIdHeader)) { rowIdLeftOut = true; continue }
    const base = header || `Column ${columnLetter(index)}`
    let name = base
    for (let n = 2; used.has(headerKey(name)); n++) name = `${base.slice(0, 114)} (${n})`
    used.add(headerKey(name))
    columns.push({ index, name, values })
  }
  const refused = !columns.length ? 'The file has no columns to start from.' : columns.length > maxColumns ? `The file has ${columns.length} columns; a page has at most ${maxColumns}. Keep only the columns the page needs and choose the file again.` : ''
  return { header: start, columns, rows: data.length, rowIdLeftOut, refused }
}

// ---- the person's choices (OND-137) ----
export interface StartDraft { id: string; index: number; name: string; type: OnDemandType; required: boolean; options: string[]; currency?: string; sample: string }
// Each column of the file as a draft: its name, the suggested type (and options or currency), not required, a sample
// value (the first filled cell, at most 60 characters). id: the new column's id, made once so the preview and the save agree.
export function startDrafts(columns: FileColumn[], id: () => string = () => newId('c')): StartDraft[] {
  return columns.map((column) => {
    const suggestion = suggestType(column.values)
    const sample = filled(column.values)[0] ?? ''
    return { id: id(), index: column.index, name: column.name, type: suggestion.type, required: false, options: suggestion.options, ...(suggestion.currency ? { currency: suggestion.currency } : {}), sample: sample.length > 60 ? `${sample.slice(0, 59)}…` : sample }
  })
}
// The draft with another type: a Dropdown or Multi-select takes its options from the column's values, a Currency the most
// used code (else EUR).
export function retype(draft: StartDraft, type: OnDemandType, values: string[]): StartDraft {
  const suggestion = suggestType(values)
  return { ...draft, type, options: hasOptions(type) ? optionsFrom(values, type) : [], ...(type === 'currency' ? { currency: suggestion.type === 'currency' ? suggestion.currency : draft.currency ?? defaultCurrency } : {}) }
}
const asColumnDraft = (draft: StartDraft): ColumnDraft => ({ id: draft.id, name: draft.name, type: draft.type, required: draft.required, options: draft.options.map((label) => ({ label })), ...(draft.type === 'currency' ? { currency: draft.currency ?? defaultCurrency } : {}) })
// What is wrong with the columns as chosen ('' when they can be saved): the checks of Set up columns (OND-05) over the
// page's columns and the new ones together, and "Row ID", which the template and the upload keep for the row's ID.
export function startError(page: Pick<OnDemandPage, 'columns'>, drafts: StartDraft[]): string {
  const reserved = drafts.find((draft) => headerKey(draft.name) === headerKey(rowIdHeader))
  if (reserved) return `“${rowIdHeader}” is kept for the row’s ID in the template and the upload: give the column another name.`
  return columnsError([...columnDrafts(page.columns), ...drafts.map(asColumnDraft)])
}
// The page with the new columns added after its own (OND-142: the columns as they are in Git when the save runs). A
// new column whose name the page has meanwhile is refused with the reason (nothing saved).
export function withNewColumns(page: OnDemandPage, drafts: StartDraft[]): OnDemandPage {
  if (!drafts.length) return page
  const taken = drafts.find((draft) => page.columns.some((column) => headerKey(column.name) === headerKey(draft.name)))
  if (taken) throw new Error(`${page.name} has a column “${taken.name}” already (added meanwhile). Close the pop-up and choose the file again.`)
  return applyColumns(page, [...columnDrafts(page.columns), ...drafts.map(asColumnDraft)])
}
// The sheet with the new columns' names in their places of the header (renamed ones as the person named them), so the
// upload's header match (OND-105) finds them.
export function renamedSheet(sheet: WorkbookSheet, header: number, drafts: StartDraft[]): WorkbookSheet {
  if (header < 0 || !drafts.length) return sheet
  const row = [...sheet.rows[header]]
  for (const draft of drafts) { while (row.length <= draft.index) row.push(''); row[draft.index] = draft.name }
  return { ...sheet, rows: sheet.rows.map((cells, index) => index === header ? row : cells) }
}
// OND-138, OND-140: what saving would do — the page with the new columns, the sheet renamed and the upload's plan over it
// (every row checked for the columns as chosen; on a new page every row is added).
export function planWithColumns(page: OnDemandPage, sheet: WorkbookSheet, header: number, drafts: StartDraft[], options: { locked?: Set<string> } = {}): UploadPlan {
  return planUpload(withNewColumns(page, drafts), renamedSheet(sheet, header, drafts), options)
}
// The header index of each column the page does not have (Upload Excel…, OND-140), in the file's order; a "Row ID" or
// "ID" that finds the rows is never one of them.
export function unknownColumns(page: Pick<OnDemandPage, 'columns'>, sheet: WorkbookSheet): FileColumn[] {
  const start = sheet.rows.findIndex((row) => row.some((cell) => (cell ?? '').trim()))
  if (start < 0) return []
  const known = new Set(page.columns.map((column) => headerKey(column.name)))
  const data = sheet.rows.slice(start + 1).filter((row) => row.some((cell) => (cell ?? '').trim()))
  const seen = new Set<string>()
  let idSeen = false
  return sheet.rows[start].flatMap((raw, index) => {
    const name = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 120), key = headerKey(name)
    if (!key || seen.has(key)) return []
    seen.add(key)
    if (known.has(key)) return []
    if (!idSeen && (key === headerKey(rowIdHeader) || key === 'id')) { idSeen = true; return [] }
    return [{ index, name, values: data.map((row) => row[index] ?? '') }]
  })
}
// The first row with a value: the header the upload reads (OND-105).
export const headerRow = (sheet: WorkbookSheet) => sheet.rows.findIndex((row) => row.some((cell) => (cell ?? '').trim()))

// What a draft's type takes from the values: a Dropdown's or Multi-select's options, a Currency's default code.
export const typeDetail = (draft: StartDraft) => draft.type === 'dropdown' || draft.type === 'multi' ? `${draft.options.length} option${draft.options.length === 1 ? '' : 's'} from the values${draft.options.length ? `: ${draft.options.slice(0, 5).join(', ')}${draft.options.length > 5 ? ' …' : ''}` : ''}` : draft.type === 'currency' ? `Default currency ${draft.currency ?? 'EUR'}` : ''

// The commit of a start (OND-138): "{page}: start from {file} (n columns, m rows added)".
export const startCommit = (page: Pick<OnDemandPage, 'name'>, fileName: string, columns: number, rows: number) => `${page.name}: start from ${fileName} (${columns} column${columns === 1 ? '' : 's'}, ${rows} row${rows === 1 ? '' : 's'} added)`
