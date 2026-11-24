import test from 'node:test'
import assert from 'node:assert/strict'
import { cellProblem, moneyOf, parseOnDemandPage, rowError, rowId, serializeOnDemandPage, tableCsv } from '../src/onDemand.ts'
import { hashText, isSamplePage, numberRange, sampleFileName, samplePage, sampleRowCount, sampleRows, sampleSeedText, SampleWriteError } from '../src/sampleRows.ts'
import { dataModeKey, readDataMode } from '../src/useDataMode.ts'

const columns = [
  { id: 'c1', name: 'Topic', type: 'text', options: [], required: true },
  { id: 'c2', name: 'Details', type: 'longtext', options: [], required: false },
  { id: 'c3', name: 'Cost', type: 'number', options: [], required: false },
  { id: 'c4', name: 'Budget', type: 'currency', options: [], required: false, currency: 'USD' },
  { id: 'c5', name: 'Found on', type: 'date', options: [], required: false },
  { id: 'c6', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'], required: false },
  { id: 'c7', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon', 'Graz'], required: false },
  { id: 'c8', name: 'Hours', type: 'number', options: [], required: false },
  { id: 'c9', name: 'Yen', type: 'currency', options: [], required: false, currency: 'JPY' },
]
const page = { schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: '', keyPrefix: 'CONQ', columns, rows: [{ id: 'r1', seq: 1, key: 'CONQ-260101-AAA2', cells: { c1: 'Real row' } }], insights: [{ id: 'i1', title: 'Cost by category', type: 'bar', category: 'c6', second: '', measure: 'sum', value: 'c3', filters: [], sort: 'value' }] }
const now = new Date('2026-11-24T13:32:00Z')

test('OND-64: 50 sample rows from the page’s own columns — types, options, currency, dates of the last 12 months, IDs SAMPLE-0001… (TC-OND-51)', () => {
  const rows = sampleRows(page, now)
  assert.equal(rows.length, sampleRowCount)
  assert.equal(sampleRowCount, 50)
  const shown = samplePage(page, now)
  assert.equal(rowId(shown, shown.rows[0]), 'SAMPLE-0001')
  assert.equal(rowId(shown, shown.rows[49]), 'SAMPLE-0050')
  assert.ok(rows.every((row) => /^SAMPLE-\d{6}-[2-9A-HJKMNP-Z]{4}$/.test(row.key)), 'keys SAMPLE-…')
  assert.equal(new Set(rows.map((row) => row.key)).size, 50)
  assert.ok(rows.every((row) => row.addedBy && /\(sample\)$/.test(row.addedBy) && row.addedAt), 'added by / at filled')
  // Every value fits its column: no "not in the list", "not a number", "not a date" or "not an amount".
  for (const row of rows) { for (const column of columns) assert.equal(cellProblem(column, row.cells[column.id]), '', `${column.name}: ${JSON.stringify(row.cells[column.id])}`); assert.equal(rowError(columns, row.cells), '') }
  assert.ok(rows.every((row) => typeof row.cells.c1 === 'string' && row.cells.c1.length > 3), 'a required Text is always filled')
  const multi = rows.map((row) => row.cells.c7)
  assert.ok(multi.some((value) => value === undefined), 'some Multi-select values empty')
  assert.ok(multi.filter(Array.isArray).every((value) => value.length >= 1 && value.length <= 3 && value.every((entry) => columns[6].options.includes(entry))), 'Multi-select: 1–3 of its options')
  assert.ok(multi.some((value) => Array.isArray(value) && value.length > 1))
  assert.ok(rows.filter((row) => row.cells.c6).every((row) => columns[5].options.includes(row.cells.c6)))
  assert.deepEqual([...new Set(rows.flatMap((row) => row.cells.c4 ? [moneyOf(row.cells.c4, 'USD').currency] : []))], ['USD'], 'the column’s default currency')
  assert.ok(rows.filter((row) => row.cells.c9).every((row) => /^\d+ JPY$/.test(row.cells.c9)), 'JPY without decimals')
  const days = rows.flatMap((row) => row.cells.c5 ? [row.cells.c5] : [])
  assert.ok(days.length > 30 && days.every((day) => day <= '2026-11-24' && day > '2025-11-24'), 'dates within the last 12 months')
  const costs = rows.flatMap((row) => row.cells.c3 ? [Number(row.cells.c3)] : [])
  assert.ok(costs.every((value) => value >= 100 && value <= 25_000), 'a Cost in a money-like range')
  assert.deepEqual(numberRange('Hours'), { min: 1, max: 80, decimals: 1 })
  assert.deepEqual(numberRange('Pieces'), { min: 1, max: 50, decimals: 0 })
})

test('OND-64: the sample is deterministic for the column setup and new when a column or option changes (TC-OND-51)', () => {
  assert.deepEqual(sampleRows(page, now), sampleRows(page, now))
  assert.deepEqual(sampleRows({ ...page, rows: [], name: 'Renamed', insights: [] }, now), sampleRows(page, now), 'rows, name and charts do not change it')
  const changed = { ...page, columns: columns.map((column) => column.id === 'c6' ? { ...column, options: [...column.options, 'Label'] } : column) }
  assert.notEqual(sampleSeedText(changed), sampleSeedText(page))
  assert.notDeepEqual(sampleRows(changed, now), sampleRows(page, now), 'an added option gives a new sample')
  assert.notDeepEqual(sampleRows({ ...page, id: 'other' }, now), sampleRows(page, now), 'another page, another sample')
  assert.equal(hashText('abc'), hashText('abc'))
  // Cached: the same rows (identity) between renders of the same setup.
  assert.equal(samplePage(page, now).rows, samplePage({ ...page }, now).rows)
})

test('OND-66: a page in Sample is never written — the file writer refuses it; the page’s charts and colours are kept (TC-OND-52)', () => {
  const shown = samplePage({ ...page, storage: 'rows', lastSeq: 9 }, now)
  assert.equal(isSamplePage(shown), true)
  assert.equal(isSamplePage(page), false)
  assert.equal(shown.storage, undefined)
  assert.deepEqual(shown.insights, page.insights)
  assert.throws(() => serializeOnDemandPage(shown), /Sample data is shown for CoNQ: nothing is saved to Git/)
  assert.throws(() => serializeOnDemandPage(shown, { fill: false }), /nothing is saved/)
  assert.doesNotThrow(() => parseOnDemandPage(serializeOnDemandPage(page)))
  assert.match(new SampleWriteError('CoNQ').message, /Switch to Live/)
  // The real rows are untouched.
  assert.equal(page.rows.length, 1)
})

test('OND-63, OND-67: the choice per page is read back strictly; exports of sample rows are marked (TC-OND-53)', () => {
  assert.equal(dataModeKey('conq'), 'data-mode:conq')
  assert.equal(readDataMode('sample'), 'sample')
  assert.equal(readDataMode('live'), 'live')
  assert.equal(readDataMode('SAMPLE'), undefined)
  assert.equal(readDataMode({ mode: 'sample' }), undefined)
  assert.equal(sampleFileName('CoNQ', true), 'Sample-CoNQ')
  assert.equal(sampleFileName('CoNQ', false), 'CoNQ')
  const csv = tableCsv(samplePage(page, now))
  assert.match(csv.split('\r\n')[1], /^SAMPLE-0001,SAMPLE-000001-/)
})
