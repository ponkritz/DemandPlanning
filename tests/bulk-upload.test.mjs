import test from 'node:test'
import assert from 'node:assert/strict'
import { inlineList, maxListFormula, readCsv, readXlsx, sheetRef, unzip, writeXlsx } from '../src/xlsx.ts'
import { applyUpload, errorReportCsv, fileError, headerKey, matchHeader, maxUploadBytes, maxUploadChanges, maxUploadRows, neutralise, parseCell, pickSheet, planSummary, planUpload, templateFileName, templateWorkbook, uploadCommit, uploadName, uploadResult } from '../src/bulkUpload.ts'
import { parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { convertedFiles } from '../src/rowFiles.ts'
import { commitPageChange, loadRowPage } from '../src/rowPageGit.ts'
import { fakeGitHub } from '../e2e/fakeGitHub.mjs'

// OND-103…OND-108 Bulk upload on the On-Demand table pages: the template's data validations (xlsx), the header match,
// each cell checked, the add / update plan with Row IDs, row locks and limits, formula text neutralised, the save with a
// History entry per row (one commit on a page of row files). Synthetic data only.
const random = (() => { let seed = 7; return () => (seed = (seed * 16807) % 2147483647) / 2147483647 })()
const now = () => Date.UTC(2026, 10, 25, 9)
const text = (bytes) => new TextDecoder().decode(bytes)
const longOptions = Array.from({ length: 40 }, (_, i) => `Supplier example number ${i + 1}`)
const columns = [
  { id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Say "hi"'], required: true },
  { id: 'c2', name: 'Cost', type: 'number', options: [], required: false },
  { id: 'c3', name: 'Found on', type: 'date', options: [], required: false },
  { id: 'c4', name: 'Tags', type: 'multi', options: ['Alpha', 'Beta', 'Gamma, Delta'], required: false },
  { id: 'c5', name: 'Supplier', type: 'dropdown', options: longOptions, required: false },
  { id: 'c6', name: 'Note', type: 'text', options: [], required: false },
  { id: 'c7', name: 'Amount', type: 'currency', options: [], required: false, currency: 'EUR' },
]
const row = (seq, key, cells, extra = {}) => ({ id: `r${seq}`, key, seq, addedBy: 'ana@example.com', addedAt: '2026-11-20T08:00:00.000Z', cells, ...extra })
const page = () => parseOnDemandPage(JSON.stringify({
  schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: '', keyPrefix: 'CONQ', columns, insights: [],
  rows: [
    row(1, 'CONQ-261120-K7Q2', { c1: 'Scrap', c2: '10', c3: '2026-11-01', c4: ['Alpha', 'Beta'], c6: 'First' }),
    row(2, 'CONQ-261120-M3P4', { c1: 'Rework', c2: '20' }),
    row(3, 'CONQ-261120-N4Q5', { c1: 'Scrap', c6: 'Hidden one' }, { hidden: { by: 'ana@example.com', at: '2026-11-21T08:00:00.000Z' } }),
  ],
}), 'conq')
const sheetOf = (rows, name = 'CoNQ') => ({ name, rows })

// ---- xlsx: data validations, hidden sheets, escaping ----
test('OND-104: writeXlsx writes data validations — inline list, range list, date, decimal, text length, input messages — in the schema order (TC-OND-99)', async () => {
  const bytes = writeXlsx([
    { name: 'Data', freeze: true, widths: [14, 20], headerMarks: ['muted', 'required'], rows: [['Row ID', 'Category'], ['', 'Scrap']], validations: [
      { sqref: 'B2:B10', type: 'list', items: ['Scrap', 'Say "hi"'], promptTitle: 'Category', prompt: 'Choose <one> & only one', error: 'Not in the list' },
      { sqref: 'C2:C10', type: 'list', source: `${sheetRef('Lists')}!$A$2:$A$5`, strict: false },
      { sqref: 'D2:D10', type: 'date', operator: 'between', formula1: 1, formula2: 2958465 },
      { sqref: 'E2:E10', type: 'decimal', operator: 'between', formula1: -1e15, formula2: 1e15 },
      { sqref: 'F2:F10', type: 'textLength', operator: 'lessThanOrEqual', formula1: 2000 },
      { sqref: 'A1', type: 'none', promptTitle: 'Row ID', prompt: 'Do not edit.' },
      { sqref: 'G2:G10', type: 'list', items: [] },
    ] },
    { name: 'Lists', hidden: true, rows: [['Category'], ['A'], ['B']] },
  ])
  const files = await unzip(bytes)
  const sheet = text(files.get('xl/worksheets/sheet1.xml'))
  const order = ['<sheetViews>', '<cols>', '<sheetData>', '<dataValidations count="6">'].map((part) => sheet.indexOf(part))
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `parts in schema order: ${order}`)
  assert.match(sheet, /<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="|<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" error="Not in the list" promptTitle="Category" prompt="Choose &lt;one&gt; &amp; only one" sqref="B2:B10"><formula1>&quot;Scrap,Say &quot;&quot;hi&quot;&quot;&quot;<\/formula1><\/dataValidation>/)
  assert.match(sheet, /<dataValidation type="list" allowBlank="1" sqref="C2:C10"><formula1>'Lists'!\$A\$2:\$A\$5<\/formula1><\/dataValidation>/, 'a range list; not strict: no error message')
  assert.match(sheet, /<dataValidation type="date" allowBlank="1" showErrorMessage="1" sqref="D2:D10"><formula1>1<\/formula1><formula2>2958465<\/formula2><\/dataValidation>/)
  assert.match(sheet, /<dataValidation type="decimal" allowBlank="1" showErrorMessage="1" sqref="E2:E10"><formula1>-1000000000000000<\/formula1><formula2>1000000000000000<\/formula2>/)
  assert.match(sheet, /<dataValidation type="textLength" operator="lessThanOrEqual" allowBlank="1" showErrorMessage="1" sqref="F2:F10"><formula1>2000<\/formula1><\/dataValidation>/)
  assert.match(sheet, /<dataValidation allowBlank="1" showInputMessage="1" promptTitle="Row ID" prompt="Do not edit." sqref="A1"\/>/)
  assert.doesNotMatch(sheet, /G2:G10/, 'a list without items is left out')
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/)
  assert.match(sheet, /<c r="A1" t="inlineStr" s="5">/, 'Row ID header: muted')
  assert.match(sheet, /<c r="B1" t="inlineStr" s="4">/, 'a required header: highlighted')
  const workbook = text(files.get('xl/workbook.xml'))
  assert.match(workbook, /<sheet name="Lists" sheetId="2" state="hidden" r:id="rId2"\/>/)
  assert.doesNotMatch(workbook, /<sheet name="Data"[^>]*state=/)
  assert.match(text(files.get('xl/styles.xml')), /<cellXfs count="6">/)
  // Well-formed: every element opened is closed (a small check without an XML library).
  for (const [name, data] of files) if (name.endsWith('.xml')) assert.ok(wellFormed(text(data)), `${name} is well-formed`)
  // The reader still reads it, the hidden sheet included.
  const read = await readXlsx(bytes)
  assert.deepEqual(read.map((entry) => entry.name), ['Data', 'Lists'])
  assert.deepEqual(read[0].rows, [['Row ID', 'Category'], ['', 'Scrap']])
})
function wellFormed(xml) {
  const stack = []
  for (const match of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (match[3]) continue
    if (match[1]) { if (stack.pop() !== match[2]) return false } else stack.push(match[2])
  }
  return stack.length === 0
}

test('OND-104: an inline list doubles quotes; an item with a comma, a line break or a list over 255 characters needs the range form (TC-OND-99)', () => {
  assert.equal(inlineList(['A', 'B "x"']), '"A,B ""x"""')
  assert.equal(inlineList(['A', 'B, C']), null, 'a comma would split the item')
  assert.equal(inlineList(['A', 'B\nC']), null)
  assert.equal(inlineList([]), null)
  const long = Array.from({ length: 30 }, (_, i) => `Option ${i + 1}`)
  assert.ok(`"${long.join(',')}"`.length > maxListFormula)
  assert.equal(inlineList(long), null)
  assert.equal(sheetRef("It's"), "'It''s'")
})

test('OND-103, OND-104: the template — one sheet named after the page, Row ID first, the columns in order, a validation per column, long lists on a hidden Lists sheet (TC-OND-99)', async () => {
  const conq = page()
  const empty = templateWorkbook(conq)
  assert.equal(empty.length, 2, 'the page sheet and the hidden Lists sheet')
  const [data, lists] = empty
  assert.equal(data.name, 'CoNQ')
  assert.deepEqual(data.rows, [['Row ID', 'Category', 'Cost', 'Found on', 'Tags', 'Supplier', 'Note', 'Amount']])
  assert.deepEqual(data.headerMarks, ['muted', 'required', '', '', '', '', '', ''])
  assert.equal(lists.hidden, true)
  assert.deepEqual(lists.rows.slice(0, 3).map((entry) => entry.slice(0, 2)), [['Tags', 'Supplier'], ['Alpha', longOptions[0]], ['Beta', longOptions[1]]], 'Tags (an option with a comma) and Supplier (too long inline)')
  const rule = (ref) => data.validations.find((entry) => entry.sqref === ref)
  assert.deepEqual([rule('B2:B2001').type, rule('B2:B2001').items, rule('B2:B2001').strict], ['list', ['Scrap', 'Rework', 'Say "hi"'], true])
  assert.equal(rule('C2:C2001').type, 'decimal')
  assert.equal(rule('D2:D2001').type, 'date')
  assert.deepEqual([rule('E2:E2001').source, rule('E2:E2001').strict], ["'Lists'!$A$2:$A$4", false], 'Multi-select: the list is offered, any text accepted')
  assert.match(rule('E2:E2001').prompt, /separate several values with ;/)
  assert.equal(rule('F2:F2001').source, "'Lists'!$B$2:$B$41")
  assert.equal(rule('G2:G2001').type, 'textLength')
  assert.equal(rule('H2:H2001').type, 'none')
  assert.match(rule('B1').prompt, /^Required\./)
  assert.match(rule('A1').prompt, /Do not edit/)
  // With the rows shown: their IDs and values, a Multi-select joined with "; ", a Date as a real date.
  const filled = templateWorkbook(conq, conq.rows.slice(0, 2))
  assert.equal(filled[0].rows[1][0], 'CONQ-0001')
  assert.equal(filled[0].rows[1][2], 10)
  assert.ok(filled[0].rows[1][3].date instanceof Date)
  assert.equal(filled[0].rows[1][4], 'Alpha; Beta')
  // Written and read back: the cells come back as the upload reads them.
  const read = await readXlsx(writeXlsx(filled))
  assert.deepEqual(read[0].rows[1].slice(0, 5), ['CONQ-0001', 'Scrap', '10', '2026-11-01', 'Alpha; Beta'])
  const xml = text((await unzip(writeXlsx(filled))).get('xl/worksheets/sheet1.xml'))
  assert.match(xml, /<dataValidations count="16">/)
  assert.equal(templateFileName({ name: 'CoNQ / 2026' }), 'CoNQ 2026 - upload template.xlsx')
  // A page whose lists all fit inline has no Lists sheet.
  assert.equal(templateWorkbook({ ...conq, columns: columns.slice(0, 3) }).length, 1)
})

// ---- header ----
test('OND-105: the header row is matched by name ignoring case and spaces; unknown columns ignored, duplicates and missing required ones listed (TC-OND-100)', () => {
  assert.equal(headerKey(' Found  On '), 'foundon')
  const match = matchHeader(page(), ['row id', 'COST', 'found on', 'Comment', 'Cost', ''])
  assert.equal(match.idIndex, 0)
  assert.deepEqual(match.columns.map((entry) => [entry.index, entry.column.name]), [[1, 'Cost'], [2, 'Found on']])
  assert.deepEqual(match.ignored, ['Comment'])
  assert.deepEqual(match.duplicates, ['Cost'])
  assert.deepEqual(match.missingRequired, ['Category'])
  assert.equal(matchHeader(page(), ['ID', 'Category']).idIndex, 0, '"ID" (the table export) finds the row too')
  // The page's sheet is picked by its name, else by the best header match; the Lists sheet never.
  const sheets = [{ name: 'Lists', rows: [['Tags']] }, { name: 'Other', rows: [['Category', 'Cost']] }]
  assert.equal(pickSheet(page(), sheets).name, 'Other')
  assert.equal(pickSheet(page(), [...sheets, { name: 'conq', rows: [] }]).name, 'conq')
})

// ---- cells ----
test('OND-105: each cell is checked for its column — options in their spelling, Multi-select split at ;, numbers, dates, amounts, required, length (TC-OND-100)', () => {
  const [category, cost, found, tags, , note, amount] = page().columns
  assert.deepEqual(parseCell(category, ' scrap '), { value: 'Scrap' })
  assert.match(parseCell(category, 'Junk').error, /“Junk” is not an option of Category/)
  assert.match(parseCell(category, '').error, /“Category” is required/)
  assert.deepEqual(parseCell(tags, 'alpha; Beta;alpha'), { value: ['Alpha', 'Beta'] })
  assert.deepEqual(parseCell(tags, 'Gamma, Delta'), { value: ['Gamma, Delta'] }, 'an option with a comma, whole')
  assert.deepEqual(parseCell(tags, 'Alpha, Beta'), { value: ['Alpha', 'Beta'] }, 'the table export’s ", " when that gives only options')
  assert.match(parseCell(tags, 'Alpha; Zeta').error, /“Zeta” is not an option of Tags \(separate several values with ;\)/)
  assert.deepEqual(parseCell(cost, '1200.50'), { value: '1200.5' })
  assert.match(parseCell(cost, '12 EUR').error, /not a number/)
  assert.deepEqual(parseCell(found, '2026-11-25'), { value: '2026-11-25' })
  assert.deepEqual(parseCell(found, '2026-11-25 14:30'), { value: '2026-11-25' })
  assert.match(parseCell(found, '25.11.2026').error, /not a date \(YYYY-MM-DD\)/)
  assert.match(parseCell(found, '2026-02-30').error, /not a date/)
  assert.deepEqual(parseCell(amount, '1200.5 usd'), { value: '1200.5 USD' })
  assert.deepEqual(parseCell(amount, '99'), { value: '99 EUR' })
  assert.match(parseCell(amount, 'lots').error, /not an amount/)
  assert.match(parseCell(note, 'x'.repeat(2001)).error, /longer than 2,000 characters/)
})

test('OND-108: text a spreadsheet would run as a formula is stored with an apostrophe first, as every CSV export does (TC-OND-101)', () => {
  const note = page().columns[5]
  for (const raw of ['=HYPERLINK("http://example.com","x")', '+cmd', '-2+3', '@SUM(A1)']) assert.deepEqual(parseCell(note, raw), { value: `'${raw}`, neutralised: true }, raw)
  assert.deepEqual(parseCell(note, '-12.5'), { value: '-12.5' }, 'a plain number stays')
  assert.deepEqual(parseCell(note, 'Plain text'), { value: 'Plain text' })
  assert.equal(neutralise("'=already"), "'=already", 'idempotent')
  const plan = planUpload(page(), sheetOf([['Category', 'Note'], ['Scrap', '=1+1']]))
  assert.equal(plan.neutralised, 1)
  assert.equal(plan.added[0].cells.c6, "'=1+1")
})

// ---- the plan ----
test('OND-105, OND-106: the plan — rows with a Row ID update, rows without are added, unchanged counted, a Row ID not found is an error, locked rows skipped, hidden rows updated (TC-OND-100)', () => {
  const conq = page()
  const plan = planUpload(conq, sheetOf([
    [],
    ['Row ID', 'Category', 'Cost', 'Found on', 'Tags', 'Comment'],
    ['CONQ-0001', 'Scrap', '10', '2026-11-01', 'Alpha; Beta', 'ignored'],
    ['conq-0002', 'Rework', '25', '', '', ''],
    ['CONQ-261120-N4Q5', 'Rework', '', '', '', ''],
    ['', 'Rework', '5', '2026-11-24', 'Gamma, Delta', ''],
    ['', '', '', '', '', ''],
    ['', 'Junk', 'many', '', '', ''],
    ['CONQ-0099', 'Scrap', '', '', '', ''],
    ['CONQ-0002', 'Scrap', '', '', '', ''],
  ]), { locked: new Set() })
  assert.equal(planSummary(plan), '1 added · 2 updated · 1 unchanged · 3 with errors')
  assert.deepEqual(plan.updated.map((entry) => [entry.line, entry.label, entry.changes.map((change) => `${change.column}: ${change.from} → ${change.to}`)]), [
    [4, 'CONQ-0002', ['Cost: 20 → 25']],
    [5, 'CONQ-0003', ['Category: Scrap → Rework']],
  ], 'by readable ID or key, any case; a hidden row is updated by its ID')
  assert.deepEqual(plan.added.map((entry) => [entry.line, entry.cells]), [[6, { c1: 'Rework', c2: '5', c3: '2026-11-24', c4: ['Gamma, Delta'] }]])
  assert.deepEqual(plan.errors.map((error) => [error.line, error.rowId, error.message.slice(0, 40)]), [
    [8, '', '“Junk” is not an option of Category; “Co'],
    [9, 'CONQ-0099', 'Row not found: CONQ-0099 is not a row of'],
    [10, 'CONQ-0002', 'CONQ-0002 is in the file twice: only its'],
  ])
  assert.deepEqual(plan.header.ignored, ['Comment'])
  assert.equal(plan.refused, '')
  assert.deepEqual(plan.lines.map((line) => line.outcome), ['unchanged', 'update', 'update', 'add', 'error', 'error', 'error'])
  // A row someone else is editing is skipped and counted.
  const locked = planUpload(conq, sheetOf([['Row ID', 'Cost'], ['CONQ-0002', '30']]), { locked: new Set(['CONQ-261120-M3P4']) })
  assert.deepEqual([locked.updated.length, locked.locked, locked.lines[0].outcome], [0, 1, 'locked'])
  // A missing required column: rows to add are errors, updates keep the value.
  const missing = planUpload(conq, sheetOf([['Row ID', 'Cost'], ['CONQ-0002', '30'], ['', '40']]))
  assert.deepEqual([missing.updated.length, missing.errors.length], [1, 1])
  assert.match(missing.errors[0].message, /“Category” is required \(the column is not in the file\)/)
  // The error report lists every error row.
  assert.equal(errorReportCsv(plan).split('\r\n')[0], 'Line,Row ID,Error')
  assert.equal(errorReportCsv(plan).split('\r\n').length, 4)
  // No column of the page: refused.
  assert.match(planUpload(conq, sheetOf([['Foo', 'Bar'], ['1', '2']])).refused, /No column of CoNQ was found/)
  assert.match(planUpload(conq, sheetOf([])).refused, /empty/)
})

test('OND-107: the limits — 10 MB and .xlsx / .csv only before reading, 5,000 rows read, 2,000 added or updated, a page of at most 5,000 rows (TC-OND-102)', () => {
  assert.equal(fileError({ name: 'a.xlsx', size: maxUploadBytes }), '')
  assert.match(fileError({ name: 'a.xlsx', size: maxUploadBytes + 1 }), /at most 10 MB/)
  assert.match(fileError({ name: 'a.xls', size: 10 }), /Old \.xls/)
  assert.match(fileError({ name: 'a.pdf', size: 10 }), /Choose an Excel/)
  assert.equal(fileError({ name: 'A.CSV', size: 10 }), '')
  const rows = (n) => [['Category'], ...Array.from({ length: n }, () => ['Scrap'])]
  assert.match(planUpload(page(), sheetOf(rows(maxUploadRows + 1))).refused, /The file has 5,001 rows; an upload reads at most 5,000/)
  assert.match(planUpload(page(), sheetOf(rows(maxUploadChanges + 1))).refused, /2,001 rows would be added or updated; one upload changes at most 2,000/)
  assert.equal(planUpload(page(), sheetOf(rows(maxUploadChanges))).refused, '')
  const full = { ...page(), rows: Array.from({ length: 4999 }, (_, i) => ({ id: `x${i}`, cells: { c1: 'Scrap' } })) }
  assert.match(planUpload(full, sheetOf(rows(2))).refused, /would have 5,001 rows; a page holds at most 5,000/)
})

// ---- the save ----
test('OND-106: the save — updates and adds applied to the page as it is in Git, a History entry “Bulk upload from {file}” per row, locked and deleted rows skipped (TC-OND-100)', () => {
  const conq = page()
  const plan = planUpload(conq, sheetOf([['Row ID', 'Category', 'Cost'], ['CONQ-0001', 'Rework', '10'], ['CONQ-0002', 'Rework', '21'], ['CONQ-0003', 'Rework', ''], ['', 'Scrap', '7']]))
  assert.deepEqual([plan.updated.length, plan.added.length], [3, 1])
  // Meanwhile row 3 was deleted in Git and row 2 is being edited by someone.
  const base = { ...conq, rows: conq.rows.filter((entry) => entry.id !== 'r3') }
  const done = applyUpload(base, plan, { by: 'lead@example.com', fileName: 'C:\\fakepath\\CoNQ - upload template.xlsx', locked: new Set(['CONQ-261120-M3P4']), random, now })
  assert.deepEqual([done.added, done.updated, done.locked, done.missing], [1, 1, 1, 1])
  const first = done.page.rows.find((entry) => entry.id === 'r1')
  assert.equal(first.cells.c1, 'Rework')
  assert.equal(first.cells.c6, 'First', 'a column not in the file is kept')
  assert.deepEqual(first.log.at(-1), { id: first.log.at(-1).id, at: '2026-11-25T09:00:00.000Z', by: 'lead@example.com', comment: 'Bulk upload from CoNQ - upload template.xlsx', changes: [{ column: 'c1', from: 'Scrap', to: 'Rework' }] })
  const added = done.page.rows.at(-1)
  assert.deepEqual([added.cells, added.addedBy, added.log[0].added, added.log[0].comment], [{ c1: 'Scrap', c2: '7' }, 'lead@example.com', true, 'Bulk upload from CoNQ - upload template.xlsx'])
  assert.equal(done.page.rows.find((entry) => entry.id === 'r2').cells.c2, '20', 'the locked row is left')
  assert.equal(uploadCommit(conq, 'CoNQ - upload template.xlsx', plan), 'CoNQ: bulk upload from CoNQ - upload template.xlsx (1 row added, 3 rows updated)')
  assert.equal(uploadResult(done, 2), '1 row added, 1 row updated; 1 row being edited by someone else skipped; 1 row deleted meanwhile skipped; 2 rows with errors not saved')
  assert.equal(uploadName('../x\u0007y.csv'), 'xy.csv')
  // Saved and read again: the new row gets its ID, the comment stays.
  const stored = parseOnDemandPage(serializeOnDemandPage(done.page), 'conq')
  assert.equal(stored.rows.at(-1).seq, 3, 'the next free number')
  assert.equal(stored.rows.at(-1).log[0].comment, 'Bulk upload from CoNQ - upload template.xlsx')
})

test('OND-106: on a page of row files every added and changed row file is written in one commit, the new rows with the next IDs (TC-OND-100)', async () => {
  const { files } = convertedFiles(page())
  const gh = fakeGitHub({ files })
  const config = { owner: 'example', repo: 'storage', branch: 'main', path: 'planning-data.json' }
  const plan = planUpload(page(), sheetOf([['Row ID', 'Cost'], ['CONQ-0001', '11'], ['CONQ-0002', '22']]))
  const plan2 = planUpload(page(), sheetOf([['Category', 'Cost'], ['Scrap', '33'], ['Rework', '44']]))
  await commitPageChange(config, 't', 'conq', (base) => applyUpload(base, { updated: plan.updated, added: plan2.added }, { by: 'lead@example.com', fileName: 'upload.xlsx', random, now }).page, 'CoNQ: bulk upload', new Map(), gh.fetch)
  assert.equal(gh.writes.length, 1, 'one commit')
  assert.equal(gh.writes[0].paths.length, 5, 'two changed rows, two new rows and counter.json')
  const read = await loadRowPage(config, 't', 'conq', new Map(), gh.fetch)
  assert.deepEqual(read.page.rows.map((entry) => entry.cells.c2 ?? ''), ['11', '22', '', '33', '44'])
  assert.deepEqual(read.page.rows.map((entry) => entry.seq), [1, 2, 3, 4, 5], 'the new rows get the next IDs')
  assert.equal(new Set(read.page.rows.map((entry) => entry.key)).size, 5)
  assert.match(gh.read('on-demand/conq/counter.json'), /"next":6/)
  assert.deepEqual(read.page.rows.map((entry) => entry.log?.at(-1)?.comment ?? ''), ['Bulk upload from upload.xlsx', 'Bulk upload from upload.xlsx', '', 'Bulk upload from upload.xlsx', 'Bulk upload from upload.xlsx'])
})

test('OND-105: a CSV file is read the same way (TC-OND-100)', () => {
  const plan = planUpload(page(), sheetOf(readCsv('Row ID;Category;Cost\r\nCONQ-0002;Rework;99\r\n;Scrap;1\r\n'), 'upload'))
  assert.equal(planSummary(plan), '1 added · 1 updated · 0 unchanged · 0 with errors')
})
