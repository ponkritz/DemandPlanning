import test from 'node:test'
import assert from 'node:assert/strict'
import { asDate, csvDate, exportCell, moveId, moveIdTo, normalizeTableDefaults, orderedIds, readLayout, tableCsv, tableDefaults, compareCells } from '../src/tableDefaults.ts'
import { excelSerial, writeXlsx, readXlsx } from '../src/xlsx.ts'
import { windchillDateValue } from '../src/windchillReleases.ts'

test('table defaults: unknown values dropped, missing ones from the built-in default (TC-UI-04)', () => {
  assert.deepEqual(normalizeTableDefaults(undefined), tableDefaults)
  assert.deepEqual(normalizeTableDefaults({ resize: false, exportFormats: ['csv', 'pdf', 'csv'], defaultDensity: 'tiny', excelDateFormat: '=cmd' }), { ...tableDefaults, resize: false, exportFormats: ['csv'] })
  assert.deepEqual(normalizeTableDefaults({ exportFormats: [] }).exportFormats, [], 'no format: no Export')
  assert.equal(normalizeTableDefaults({ defaultDensity: 'compact' }).defaultDensity, 'compact')
})

test('column layout: saved order first, new columns where they stand; ↑ ↓ and drag moves (TC-UI-04)', () => {
  assert.deepEqual(orderedIds(['a', 'b', 'c'], ['c', 'a']), ['c', 'a', 'b'])
  assert.deepEqual(orderedIds(['a', 'b', 'c', 'd'], ['c', 'a', 'gone']), ['c', 'a', 'b', 'd'], 'a removed column is ignored, new ones come at the end')
  assert.deepEqual(moveId(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b'])
  assert.deepEqual(moveId(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c'], 'the first stays first')
  assert.deepEqual(moveIdTo(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a'], '1, 2, 3 → 2, 3, 1')
  const store = new Map([['demand-planning-table-layout-v1:x', JSON.stringify({ order: ['b', 1], hidden: 'a', density: 'tiny' })]])
  assert.deepEqual(readLayout('x', { getItem: (key) => store.get(key) ?? null }), { order: ['b'], hidden: undefined, density: undefined }, 'a broken layout is cleaned')
})

test('export: dates become real date-times in Excel and CSV; numbers stay numbers; formulas neutralised (TC-UI-05)', async () => {
  assert.deepEqual(asDate('2026-10-03'), { date: new Date(2026, 9, 3), time: false })
  assert.equal(asDate('2026-10-03T09:15:00Z').time, true)
  assert.equal(asDate('Release 2026-10'), undefined)
  assert.equal(csvDate({ date: new Date(2026, 9, 3, 9, 15, 7), time: true }), '2026-10-03 09:15:07')
  assert.equal(csvDate({ date: new Date(2026, 9, 3), time: false }), '2026-10-03')
  assert.equal(excelSerial(new Date(2026, 9, 3, 12, 0, 0)), 46298.5, '3 Oct 2026 noon is Excel serial 46298.5')
  assert.deepEqual(exportCell(4.5), 4.5)
  assert.deepEqual(exportCell('2026-10-03 09:15'), { date: new Date(2026, 9, 3, 9, 15), time: true })
  assert.equal(tableCsv(['Name', 'Changed'], [['=HYPERLINK("x")', '2026-10-03T09:15:00']]), 'Name,Changed\r\n"\'=HYPERLINK(""x"")",2026-10-03 09:15:00')
  const windchill = windchillDateValue('27-Oct-2026 09:15')
  assert.ok(windchill instanceof Date && windchill.getDate() === 27 && windchill.getHours() === 9, 'a Windchill date as its wall-clock time')
  assert.equal(windchillDateValue('Remote Diagnostics 1.6'), 'Remote Diagnostics 1.6')
  assert.ok(compareCells('2026-10-03', '2026-09-30') > 0 && compareCells('v10', 'v9') > 0 && compareCells('', 'a') > 0, 'dates by time, text naturally, empty last')
  // The workbook holds the date as a number with a date format (not text), so Excel can show it as a long date.
  const bytes = writeXlsx([{ name: 'Rows', rows: [['Name', 'Changed', 'Hours'], ['A', { date: new Date(2026, 9, 3, 12, 0, 0), time: true }, 4.5]] }], 'dd-mmm-yyyy hh:mm')
  const xml = new TextDecoder().decode(bytes)
  assert.ok(xml.includes('formatCode="dd-mmm-yyyy hh:mm"'), 'the chosen date format')
  assert.ok(xml.includes('s="2"><v>46298.5</v>'), 'the date as a serial with the date style')
  assert.ok(xml.includes('<v>4.5</v>'), 'a number as a number')
  const [sheet] = await readXlsx(bytes)
  assert.deepEqual(sheet.rows[0], ['Name', 'Changed', 'Hours'])
})
