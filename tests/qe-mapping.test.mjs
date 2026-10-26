import test from 'node:test'
import assert from 'node:assert/strict'
import zlib from 'node:zlib'
import { readXlsx, writeXlsx, readCsv, excelDate, sheetName } from '../src/xlsx.ts'
import { addColumn, addRow, deleteColumn, deleteRows, filterRows, fromWorkbook, groupRows, moveColumn, parseQeMapping, renameColumn, serializeQeMapping, setCell, sheetFromRows, tableCsv, qeMappingMaxBytes } from '../src/qeMapping.ts'

// A zip with deflated entries, as Excel writes it.
function deflatedZip(files) {
  const parts = [], central = []
  let offset = 0
  for (const [name, text] of files) {
    const nameBytes = Buffer.from(name), data = Buffer.from(text), packed = zlib.deflateRawSync(data), crc = zlib.crc32(data)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8); local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26)
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42)
    parts.push(local, nameBytes, packed); central.push(entry, nameBytes)
    offset += 30 + nameBytes.length + packed.length
  }
  const size = central.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...parts, ...central, end]))
}

const excelLike = deflatedZip([
  ['[Content_Types].xml', '<Types/>'],
  ['xl/workbook.xml', '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><sheets><sheet name="Mapping" sheetId="1" r:id="rId1"/><sheet name="Owners &amp; Leads" sheetId="2" r:id="rId2"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>'],
  ['xl/sharedStrings.xml', '<sst><si><t>Process</t></si><si><t>QE Owner</t></si><si><t>Due</t></si><si><r><t>Design</t></r><r><t xml:space="preserve"> Review</t></r></si><si><t>A &lt;B&gt; &amp; C</t></si><si><t>Name</t></si></sst>'],
  ['xl/styles.xml', '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="2"/></cellXfs></styleSheet>'],
  ['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c><c r="C2" t="s"><v>2</v></c><c r="D2"><v>7</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" t="inlineStr"><is><t>Ana</t></is></c><c r="C3" s="1"><v>46321</v></c><c r="D3" s="2"><v>0.30000000000000004</v></c></row><row r="4"/><row r="5"><c r="A5" t="s"><v>4</v></c><c r="C5" t="b"><v>1</v></c><c r="E5" t="str"><f>A1</f><v>calc</v></c></row></sheetData></worksheet>'],
  ['xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>5</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Ben</t></is></c></row></sheetData></worksheet>'],
])

test('reads an Excel workbook as it is: every sheet, shared / rich / inline strings, dates, numbers, booleans, formulas', async () => {
  const sheets = await readXlsx(excelLike)
  assert.deepEqual(sheets.map((sheet) => sheet.name), ['Mapping', 'Owners & Leads'])
  assert.deepEqual(sheets[0].rows, [[], ['Process', 'QE Owner', 'Due', '7'], ['Design Review', 'Ana', '2026-10-26', '0.3'], [], ['A <B> & C', '', 'TRUE', '', 'calc']])
  assert.deepEqual(sheets[1].rows, [['Name'], ['Ben']])
  await assert.rejects(readXlsx(new Uint8Array([1, 2, 3, 4])), /not an Excel \(\.xlsx\) file/)
})

test('writes a workbook that reads back the same, sheet names made valid and unique', async () => {
  const written = writeXlsx([{ name: 'Map: QE/1', rows: [['Process', 'Owner'], ['Design & <Review>', ''], ['', 'Ben "B"']] }, { name: 'Map: QE/1', rows: [['X']] }])
  const back = await readXlsx(written)
  assert.deepEqual(back.map((sheet) => sheet.name), ['Map  QE 1', 'Map  QE 1 (2)'])
  assert.deepEqual(back[0].rows, [['Process', 'Owner'], ['Design & <Review>'], ['', 'Ben "B"']])
  assert.equal(sheetName('a'.repeat(40), new Set()).length, 31)
  assert.equal(excelDate(46321), '2026-10-26')
  assert.equal(excelDate(46321.5), '2026-10-26 12:00')
})

test('reads CSV with commas, semicolons or tabs, quotes and line breaks in fields', () => {
  assert.deepEqual(readCsv('﻿A,B\r\n"x, y","he said ""hi"""\r\n3,\n'), [['A', 'B'], ['x, y', 'he said "hi"'], ['3', '']])
  assert.deepEqual(readCsv('A;B\n1;2'), [['A', 'B'], ['1', '2']])
  assert.deepEqual(readCsv('A\tB\n"multi\nline"\t2'), [['A', 'B'], ['multi\nline', '2']])
})

test('a sheet becomes a table as it is: header from the first non-empty row, names made unique, empty rows and columns dropped', async () => {
  const file = fromWorkbook(await readXlsx(excelLike), 'qe.xlsx', '2026-10-26T00:00:00Z')
  const [mapping, owners] = file.sheets
  assert.deepEqual(mapping.columns.map((column) => column.name), ['Process', 'QE Owner', 'Due', '7', 'Column 5'])
  assert.deepEqual(mapping.rows.map((row) => row.cells), [{ c1: 'Design Review', c2: 'Ana', c3: '2026-10-26', c4: '0.3' }, { c1: 'A <B> & C', c3: 'TRUE', c5: 'calc' }])
  assert.deepEqual(owners.columns, [{ id: 'c1', name: 'Name' }])
  assert.deepEqual(file.source, { fileName: 'qe.xlsx', uploadedAt: '2026-10-26T00:00:00Z' })
  assert.deepEqual(sheetFromRows('S', [['A', 'a', ''], ['1', '2', '']]).columns.map((column) => column.name), ['A', 'a (2)'])
  assert.throws(() => fromWorkbook([{ name: 'Empty', rows: [[], ['']] }], 'x.xlsx'), /every sheet is empty/)
})

test('editing: cells, rows and columns keep their ids; filter, group and export', () => {
  let sheet = sheetFromRows('Map', [['Process', 'Owner', 'Area'], ['Design', 'Ana', 'DP'], ['Test', 'Ben', 'CP'], ['Audit', '', 'DP']])
  sheet = setCell(sheet, 'r3', 'c2', 'Cid')
  const added = addRow(sheet, { c1: 'New' }); sheet = added.sheet
  assert.equal(added.id, 'r4'); assert.equal(sheet.rows[0].id, 'r4', 'a new row comes first')
  sheet = deleteRows(sheet, ['r2'])
  sheet = addColumn(sheet, 'Status'); assert.throws(() => addColumn(sheet, ' status '), /already a column/)
  sheet = renameColumn(sheet, 'c2', 'QE Owner'); assert.throws(() => renameColumn(sheet, 'c2', ''), /name/)
  sheet = moveColumn(sheet, 'c4', -1)
  assert.deepEqual(sheet.columns.map((column) => `${column.id}:${column.name}`), ['c1:Process', 'c2:QE Owner', 'c4:Status', 'c3:Area'])
  sheet = setCell(sheet, 'r1', 'c4', 'Open')
  assert.deepEqual(sheet.rows.map((row) => row.cells), [{ c1: 'New' }, { c1: 'Design', c2: 'Ana', c3: 'DP', c4: 'Open' }, { c1: 'Audit', c2: 'Cid', c3: 'DP' }])
  assert.deepEqual(filterRows(sheet, 'dp').map((row) => row.id), ['r1', 'r3'])
  assert.deepEqual(filterRows(sheet, '', { c2: 'ci' }).map((row) => row.id), ['r3'])
  assert.deepEqual(groupRows(sheet.rows, 'c3').map((group) => [group.value, group.rows.length]), [['DP', 2], ['', 1]])
  assert.equal(tableCsv(sheet.columns.slice(0, 2), sheet.rows.slice(1)), 'Process,QE Owner\r\nDesign,Ana\r\nAudit,Cid')
  sheet = deleteColumn(sheet, 'c3')
  assert.equal(sheet.rows[1].cells.c3, undefined, 'its values go with it')
  assert.equal(setCell(sheet, 'r1', 'c4', '').rows[1].cells.c4, undefined, 'an emptied cell is removed')
})

test('the Git file: round trip, unknown cells dropped, broken files refused, too large refused', () => {
  const file = { schema: 1, kind: 'qe-mapping', source: { fileName: 'qe.xlsx', uploadedAt: '2026-10-26' }, sheets: [{ id: 's1', name: 'Map', columns: [{ id: 'c1', name: 'Process' }], rows: [{ id: 'r1', cells: { c1: 'Design', c9: 'orphan' } }] }] }
  const parsed = parseQeMapping(JSON.stringify(file))
  assert.deepEqual(parsed.sheets[0].rows, [{ id: 'r1', cells: { c1: 'Design' } }])
  assert.deepEqual(parseQeMapping(serializeQeMapping(parsed)), parsed)
  assert.throws(() => parseQeMapping('{'), /not valid JSON/)
  assert.throws(() => parseQeMapping('{"kind":"other"}'), /not a QE Mapping file/)
  const big = { ...parsed, sheets: [{ ...parsed.sheets[0], rows: Array.from({ length: 20000 }, (_, i) => ({ id: `r${i}`, cells: { c1: 'x'.repeat(50) } })) }] }
  assert.ok(JSON.stringify(big).length > qeMappingMaxBytes)
  assert.throws(() => serializeQeMapping(big), /too large to save to Git/)
})
