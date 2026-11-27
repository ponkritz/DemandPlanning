import test from 'node:test'
import assert from 'node:assert/strict'
import { readCsv, readXlsx, writeXlsx } from '../src/xlsx.ts'
import { applyUpload, maxUploadChanges, planSummary, uploadCommit } from '../src/bulkUpload.ts'
import { emptyPage, maxColumns, parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { dropdownMaxValues, fileColumns, fullSizeFrom, headerRow, longTextFrom, optionsFrom, planWithColumns, retype, startCommit, startDrafts, startError, suggestType, typeDetail, unknownColumns, withNewColumns } from '../src/startFromFile.ts'
import { convertedFiles } from '../src/rowFiles.ts'
import { commitPageChange, loadRowPage } from '../src/rowPageGit.ts'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'

// OND-136…OND-142 Start a Table (Build your own) from a file: the type suggested per column, the file's columns, the
// person's choices checked as Set up columns checks them, the rows planned and saved with the new columns in one change,
// and the columns of an upload that the page does not have. Synthetic data only.
const random = (() => { let seed = 11; return () => (seed = (seed * 16807) % 2147483647) / 2147483647 })()
const now = () => Date.UTC(2026, 10, 27, 9)
let counter = 0
const ids = () => `cnew${++counter}`
const sheetOf = (rows, name = 'Sheet1') => ({ name, rows })

// ---- the suggestion ----
test('OND-137: the suggested type — Number, Date, Currency, Long text, Dropdown, Text; empty cells ignored (TC-OND-139)', () => {
  assert.deepEqual(suggestType(['12', '', '-3.5', '  0  ', '1200']), { type: 'number', options: [] })
  assert.deepEqual(suggestType(['2026-11-02', '2026-02-28', '']), { type: 'date', options: [] })
  assert.deepEqual(suggestType(['2026-11-02 14:30', '2026-11-03']), { type: 'date', options: [] }, 'an Excel date with a time')
  assert.equal(suggestType(['2026-02-30']).type, 'text', 'not a real day')
  assert.deepEqual(suggestType(['1200.50 EUR', '80 usd', '15 EUR', '7']), { type: 'currency', options: [], currency: 'EUR' }, 'the most used code; an amount alone allowed')
  assert.equal(suggestType(['12 PCS', '3 PCS', '4 PCS']).type, 'text', 'PCS is not a currency code of the list')
  assert.equal(suggestType(['12 THB', '3 USD']).type, 'text', 'a code outside the list: Text (the person may choose Currency)')
  assert.deepEqual(suggestType(['Scrap', 'Rework', 'scrap ', 'Scrap', 'Rework', '']), { type: 'dropdown', options: ['Scrap', 'Rework'] }, 'options from the values in their first spelling')
  assert.equal(suggestType(['x'.repeat(longTextFrom + 1), 'short']).type, 'longtext')
  assert.equal(suggestType(['Line one\nLine two', 'short']).type, 'longtext')
  assert.equal(suggestType(['x'.repeat(longTextFrom)]).type, 'text', 'exactly the limit is Text')
  assert.deepEqual(suggestType(['', '  ']), { type: 'text', options: [] }, 'a column without values')
  assert.deepEqual(suggestType([]), { type: 'text', options: [] })
})

test('OND-137: mixed values, leading zeros and the Dropdown threshold (dropdownMaxValues) (TC-OND-139)', () => {
  assert.equal(suggestType(['12', 'many', '3', '4', '5']).type, 'text', 'numbers mixed with text')
  assert.equal(suggestType(['12', 'many', '12', 'many']).type, 'dropdown', 'mixed, but few and repeating')
  assert.equal(suggestType(['0123', '0456', '789']).type, 'text', 'a leading zero is a code, not a number')
  assert.equal(suggestType(['1,200', '300']).type, 'text', 'thousands separators are not read as a number')
  assert.equal(suggestType(['0x10', '1e3']).type, 'text')
  const values = (distinct, times) => Array.from({ length: distinct * times }, (_, i) => `Value ${i % distinct}`)
  assert.equal(dropdownMaxValues, 10)
  assert.equal(suggestType(values(dropdownMaxValues, 2)).type, 'dropdown', '10 values, each twice')
  assert.equal(suggestType(values(dropdownMaxValues + 1, 3)).type, 'text', '11 values are too many')
  assert.equal(suggestType(['A', 'B', 'A']).type, 'text', 'values that do not repeat enough')
  assert.equal(suggestType(['A', 'B', 'A', 'B']).type, 'dropdown')
  assert.deepEqual(optionsFrom(['A; B', 'b;C', ''], 'multi'), ['A', 'B', 'C'], 'a Multi-select splits at ;')
})

test('OND-137: Excel dates of an .xlsx file are suggested as Date (TC-OND-139)', async () => {
  const bytes = writeXlsx([{ name: 'Issues', rows: [['Found on', 'Cost'], [{ date: new Date(2026, 10, 2), time: false }, 10], [{ date: new Date(2026, 10, 3), time: false }, 20.5]] }])
  const [sheet] = await readXlsx(bytes)
  const drafts = startDrafts(fileColumns(sheet).columns, ids)
  assert.deepEqual(drafts.map((draft) => [draft.name, draft.type, draft.sample]), [['Found on', 'date', '2026-11-02'], ['Cost', 'number', '10']])
})

// ---- the file's columns ----
test('OND-136: the file’s columns — header the first row with values, unnamed and repeated headers, Row ID left out, at most 60 (TC-OND-138)', () => {
  const sheet = sheetOf([[], ['', ''], ['Category', 'Cost', '', 'category', 'Row ID', '', ''], ['Scrap', '10', 'x', 'a', 'SUP-0001', '', ''], ['', '', '', '', '', '', ''], ['Rework', '20', 'y', 'b', '', '', '']])
  const found = fileColumns(sheet)
  assert.equal(found.header, 2)
  assert.equal(found.rows, 2, 'empty rows are left out')
  assert.equal(found.rowIdLeftOut, true)
  assert.deepEqual(found.columns.map((column) => [column.index, column.name]), [[0, 'Category'], [1, 'Cost'], [2, 'Column C'], [3, 'category (2)']])
  assert.equal(found.refused, '')
  assert.equal(fileColumns(sheetOf([[], ['']])).refused, 'The file is empty.')
  const wide = sheetOf([Array.from({ length: maxColumns + 1 }, (_, i) => `C${i}`)])
  assert.match(fileColumns(wide).refused, /The file has 61 columns; a page has at most 60/)
  assert.equal(headerRow(sheet), 2)
  assert.equal(fullSizeFrom, 12)
})

test('OND-137: the drafts — suggested type, not required, a sample; another type takes options or a currency from the values; checked as Set up columns (TC-OND-139)', () => {
  const found = fileColumns(sheetOf([['Category', 'Amount', 'Note'], ['Scrap', '10 USD', '=SUM(A1)'], ['Rework', '20', ''], ['Scrap', '', 'ok'], ['Rework', '', '']]))
  const drafts = startDrafts(found.columns, ids)
  assert.deepEqual(drafts.map((draft) => [draft.name, draft.type, draft.required, draft.options, draft.currency ?? '', draft.sample]), [
    ['Category', 'dropdown', false, ['Scrap', 'Rework'], '', 'Scrap'],
    ['Amount', 'currency', false, [], 'USD', '10 USD'],
    ['Note', 'text', false, [], '', '=SUM(A1)'],
  ])
  assert.equal(typeDetail(drafts[0]), '2 options from the values: Scrap, Rework')
  assert.equal(typeDetail(drafts[1]), 'Default currency USD')
  const multi = retype(drafts[2], 'multi', found.columns[2].values)
  assert.deepEqual([multi.type, multi.options], ['multi', ['=SUM(A1)', 'ok']])
  assert.equal(retype(drafts[0], 'text', found.columns[0].values).options.length, 0)
  assert.equal(retype(drafts[2], 'currency', found.columns[2].values).currency, 'EUR')
  const page = emptyPage('issues', 'Issues')
  assert.equal(startError(page, drafts), '')
  assert.match(startError(page, [{ ...drafts[0], name: 'Row ID' }]), /“Row ID” is kept for the row’s ID/)
  assert.match(startError(page, [drafts[0], { ...drafts[1], name: 'category' }]), /two columns named/)
  assert.match(startError(page, [{ ...drafts[0], name: ' ' }]), /Every column needs a name/)
  assert.match(startError(page, [{ ...drafts[2], type: 'dropdown', options: [] }]), /add at least one option/)
})

// ---- the plan and the save ----
test('OND-138: a new page — the rows planned for the columns as chosen, errors counted and left out, formula text neutralised, the limits of an upload (TC-OND-140)', () => {
  const page = emptyPage('issues', 'Issues')
  const sheet = sheetOf([['Category', 'Cost', 'Note'], ['Scrap', '10', '=HYPERLINK("x")'], ['Rework', '20', 'fine'], ['Scrap', 'many', ''], ['Rework', '', '']])
  const found = fileColumns(sheet)
  const drafts = startDrafts(found.columns, ids)
  assert.deepEqual(drafts.map((draft) => draft.type), ['dropdown', 'text', 'text'], 'Cost has text in it, so Text')
  const asNumber = drafts.map((draft) => draft.name === 'Cost' ? retype(draft, 'number', []) : draft.name === 'Note' ? { ...draft, required: true } : draft)
  const plan = planWithColumns(page, sheet, found.header, asNumber)
  assert.equal(planSummary(plan), '2 added · 0 updated · 0 unchanged · 2 with errors')
  assert.deepEqual(plan.errors.map((error) => [error.line, error.message]), [[4, '“Cost” is not a number: “many”; “Note” is required.'], [5, '“Note” is required.']])
  assert.equal(plan.neutralised, 1)
  assert.equal(plan.added[0].cells[asNumber[2].id], '\'=HYPERLINK("x")')
  assert.equal(plan.header.ignored.length, 0)
  const many = sheetOf([['Category'], ...Array.from({ length: maxUploadChanges + 1 }, () => ['Scrap'])])
  assert.match(planWithColumns(page, many, 0, startDrafts(fileColumns(many).columns, ids)).refused, /2,001 rows would be added or updated/)
})

test('OND-138: Save to Git — the columns and the valid rows as one change, renamed columns, History “Bulk upload from {file}”, the commit (TC-OND-140)', () => {
  const page = emptyPage('issues', 'Issues')
  const sheet = sheetOf([['Category', 'Cost'], ['Scrap', '10'], ['Rework', '20'], ['Scrap', '5'], ['Rework', '']])
  const found = fileColumns(sheet)
  const drafts = startDrafts(found.columns, ids).map((draft) => draft.name === 'Cost' ? { ...draft, name: 'Cost (EUR)' } : draft)
  const plan = planWithColumns(page, sheet, found.header, drafts)
  assert.equal(planSummary(plan), '4 added · 0 updated · 0 unchanged · 0 with errors')
  const done = applyUpload(withNewColumns(page, drafts), plan, { by: 'lead@example.com', fileName: 'issues.xlsx', random, now })
  assert.deepEqual(done.page.columns.map((column) => [column.name, column.type, column.required, column.options]), [['Category', 'dropdown', false, ['Scrap', 'Rework']], ['Cost (EUR)', 'number', false, []]])
  assert.deepEqual(done.page.columns.map((column) => column.id), drafts.map((draft) => draft.id), 'the ids made once')
  assert.equal(done.added, 4)
  assert.deepEqual(done.page.rows.map((row) => [row.cells[drafts[0].id], row.cells[drafts[1].id] ?? '']), [['Scrap', '10'], ['Rework', '20'], ['Scrap', '5'], ['Rework', '']])
  assert.ok(done.page.rows.every((row) => row.addedBy === 'lead@example.com' && row.log[0].comment === 'Bulk upload from issues.xlsx'))
  assert.equal(startCommit(page, 'issues.xlsx', 2, 4), 'Issues: start from issues.xlsx (2 columns, 4 rows added)')
  const stored = parseOnDemandPage(serializeOnDemandPage(done.page), 'issues')
  assert.deepEqual(stored.rows.map((row) => row.seq), [1, 2, 3, 4], 'readable IDs on save')
  assert.equal(stored.columns.length, 2)
  // Someone set up a column of the same name meanwhile: refused, nothing saved.
  const meanwhile = { ...page, columns: [{ id: 'cx', name: 'category', type: 'text', options: [], required: false }] }
  assert.throws(() => withNewColumns(meanwhile, drafts), /has a column “Category” already/)
})

test('OND-138: a CSV file and a file with only a header (columns only) (TC-OND-140)', () => {
  const page = emptyPage('issues', 'Issues')
  const csv = sheetOf(readCsv('Supplier;Due\r\nExample Supplier 01;2026-12-01\r\nExample Supplier 02;2026-12-15\r\n'), 'issues')
  const found = fileColumns(csv)
  const drafts = startDrafts(found.columns, ids)
  assert.deepEqual(drafts.map((draft) => [draft.name, draft.type]), [['Supplier', 'text'], ['Due', 'date']])
  assert.equal(planSummary(planWithColumns(page, csv, found.header, drafts)), '2 added · 0 updated · 0 unchanged · 0 with errors')
  const header = sheetOf([['Supplier', 'Due']])
  const only = planWithColumns(page, header, 0, startDrafts(fileColumns(header).columns, ids))
  assert.equal(planSummary(only), '0 added · 0 updated · 0 unchanged · 0 with errors')
  assert.equal(only.refused, '')
})

// ---- Upload Excel… with columns the page does not have ----
const supplierPage = () => parseOnDemandPage(JSON.stringify({
  schema: 1, kind: 'on-demand-page', id: 'supplier-issues', name: 'Supplier issues', description: '', keyPrefix: 'SUP', insights: [],
  columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework'], required: true }, { id: 'c2', name: 'Cost', type: 'number', options: [], required: false }],
  rows: [
    { id: 'r1', key: 'SUP-261120-K7Q2', seq: 1, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:00:00.000Z', cells: { c1: 'Scrap', c2: '100' } },
    { id: 'r2', key: 'SUP-261120-M3P4', seq: 2, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:05:00.000Z', cells: { c1: 'Rework' } },
  ],
}), 'supplier-issues')

test('OND-140: the columns of an upload that the page does not have — listed with a suggested type; ticked ones added with their values, unticked ones ignored (TC-OND-141)', () => {
  const page = supplierPage()
  const sheet = sheetOf([['Row ID', 'Category', 'Cost', 'Comment', 'Priority', 'cost', 'ID'], ['SUP-0001', 'Scrap', '100', 'raised', 'High', '1', 'x'], ['SUP-0002', 'Rework', '', '', 'Low', '', 'y'], ['', 'Scrap', '5', 'new one', 'High', '', 'z'], ['', 'Rework', '6', '', 'Low', '', '']])
  const unknown = unknownColumns(page, sheet)
  assert.deepEqual(unknown.map((column) => [column.index, column.name]), [[3, 'Comment'], [4, 'Priority'], [6, 'ID']], 'a repeated name and the Row ID are not columns to add; a second ID column is')
  const drafts = startDrafts(unknown, ids)
  assert.deepEqual(drafts.map((draft) => draft.type), ['text', 'dropdown', 'text'])
  const without = planWithColumns(page, sheet, 0, [])
  assert.deepEqual(without.header.ignored, ['Comment', 'Priority', 'ID'])
  assert.equal(planSummary(without), '2 added · 0 updated · 2 unchanged · 0 with errors')
  const priority = drafts.filter((draft) => draft.name === 'Priority')
  const plan = planWithColumns(page, sheet, 0, priority)
  assert.deepEqual(plan.header.ignored, ['Comment', 'ID'], 'the ticked column is read, the others stay ignored')
  assert.equal(planSummary(plan), '2 added · 2 updated · 0 unchanged · 0 with errors')
  assert.equal(startError(page, priority), '')
  assert.match(startError(page, [{ ...priority[0], name: 'Cost' }]), /two columns named/)
  const done = applyUpload(withNewColumns(page, priority), plan, { by: 'lead@example.com', fileName: 'filled.xlsx', random, now })
  assert.deepEqual(done.page.columns.map((column) => [column.name, column.type, column.options]), [['Category', 'dropdown', ['Scrap', 'Rework']], ['Cost', 'number', []], ['Priority', 'dropdown', ['High', 'Low']]])
  assert.deepEqual(done.page.rows.map((row) => [row.seq ?? 0, row.cells.c1, row.cells.c2 ?? '', row.cells[priority[0].id] ?? '']), [[1, 'Scrap', '100', 'High'], [2, 'Rework', '', 'Low'], [0, 'Scrap', '5', 'High'], [0, 'Rework', '6', 'Low']])
  assert.equal(done.page.rows[0].log.at(-1).comment, 'Bulk upload from filled.xlsx')
  assert.equal(uploadCommit(page, 'filled.xlsx', plan, 1), 'Supplier issues: bulk upload from filled.xlsx (2 rows added, 2 rows updated; 1 column added)')
  assert.equal(uploadCommit(page, 'filled.xlsx', plan), 'Supplier issues: bulk upload from filled.xlsx (2 rows added, 2 rows updated)')
})

test('OND-140: on a page of row files the new columns and every changed row file are written in one commit (TC-OND-141)', async () => {
  const { files } = convertedFiles(supplierPage())
  const gh = fakeGitHub({ files })
  const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
  const sheet = sheetOf([['Row ID', 'Comment'], ['SUP-0001', 'first'], ['', 'added']])
  const drafts = startDrafts(unknownColumns(supplierPage(), sheet), ids)
  const plan = planWithColumns(supplierPage(), sheet, 0, drafts)
  assert.match(planSummary(plan), /0 added · 1 updated · 0 unchanged · 1 with errors/, 'a new row without its required Category')
  await commitPageChange(config, 't', 'supplier-issues', (base) => applyUpload(withNewColumns(base, drafts), plan, { by: 'lead@example.com', fileName: 'comments.xlsx', random, now }).page, 'Supplier issues: bulk upload', new Map(), gh.fetch)
  assert.equal(gh.writes.length, 1, 'one commit')
  const read = await loadRowPage(config, 't', 'supplier-issues', new Map(), gh.fetch)
  assert.deepEqual(read.page.columns.map((column) => column.name), ['Category', 'Cost', 'Comment'])
  assert.deepEqual(read.page.rows.map((row) => row.cells[drafts[0].id] ?? ''), ['first', ''])
})
