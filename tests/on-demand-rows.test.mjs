import test from 'node:test'
import assert from 'node:assert/strict'
import { applyColumns, capLog, cellProblem, cellSortValue, columnDrafts, columnEffects, columnsError, conqPage, displayText, filterRows, formatMoney, lastUpdate, maxLog, mergeOnDemandText, moneyOf, parseOnDemandPage, rowError, rowId, serializeOnDemandPage, tableCsv, upsertRow, withRowNumbers } from '../src/onDemand.ts'
import { aggregate, blankInsight, currencyText, insightProblems, insightRules, measureText, valueColumns } from '../src/onDemandInsights.ts'

// OND-19…OND-25: row IDs, who added a row and when, the update log, Long text, Currency and column descriptions.
const columns = [
  { id: 'c1', name: 'Topic', type: 'text', options: [], required: false },
  { id: 'c2', name: 'Cost', type: 'currency', options: [], required: false, currency: 'EUR', description: 'Cost in the supplier’s currency, without VAT.' },
  { id: 'c3', name: 'Details', type: 'longtext', options: [], required: false },
  { id: 'c4', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework'], required: false },
]
const page = (rows = []) => ({ ...conqPage(), columns: structuredClone(columns), rows })
const clock = (iso) => () => Date.parse(iso)
const ana = 'ana@example.com', ben = 'ben@example.com'

test('OND-19: a readable sequential ID per page — given on Save to Git in row order, never changed, the next free number; rows from before numbered (TC-OND-16)', () => {
  let file = page()
  file = upsertRow(file, { id: 'r1', cells: { c1: 'One' } }, { by: ana })
  file = upsertRow(file, { id: 'r2', cells: { c1: 'Two' } }, { by: ana })
  assert.equal(file.rows[0].seq, undefined, 'no number before Save to Git (shown “on save”)')
  assert.equal(rowId(file, file.rows[0]), '')
  const saved = parseOnDemandPage(serializeOnDemandPage(file), 'conq')
  assert.deepEqual(saved.rows.map((row) => rowId(saved, row)), ['CONQ-0001', 'CONQ-0002'])
  // A third row: the highest + 1; removing a row never gives its number again; the others never change.
  const third = upsertRow({ ...saved, rows: saved.rows.slice(1) }, { id: 'r3', cells: { c1: 'Three' } }, { by: ben })
  const again = parseOnDemandPage(serializeOnDemandPage(third), 'conq')
  assert.deepEqual(again.rows.map((row) => [row.id, row.seq]), [['r2', 2], ['r3', 3]])
  assert.equal(parseOnDemandPage(serializeOnDemandPage(again), 'conq').rows[0].seq, 2, 'a number never changes')
  // Rows from before IDs get theirs on the next save, in page order, after the numbers already there.
  const old = withRowNumbers({ ...page(), rows: [{ id: 'a', cells: {} }, { id: 'b', seq: 7, cells: {} }, { id: 'c', cells: {} }] })
  assert.deepEqual(old.rows.map((row) => row.seq), [8, 7, 9])
  assert.equal(rowId(page(), { seq: 12345 }), 'CONQ-12345', 'more digits when needed')
  assert.deepEqual(filterRows(again, 'conq-0003').map((row) => row.id), ['r3'], 'search finds the ID')
  // Bad and repeated numbers in a file are dropped on reading.
  const dup = parseOnDemandPage(JSON.stringify({ kind: 'on-demand-page', id: 'conq', name: 'CoNQ', columns, rows: [{ id: 'a', seq: 4, cells: {} }, { id: 'b', seq: 4, cells: {} }, { id: 'c', seq: 1.5, cells: {} }, { id: 'd', seq: '2', cells: {} }] }), 'conq')
  assert.deepEqual(dup.rows.map((row) => row.seq), [4, undefined, undefined, undefined])
})

test('OND-19: two people add rows at the same time and save on their own — the numbers stay unique after the merge; a number already in Git never changes (TC-OND-16)', () => {
  const base = serializeOnDemandPage(page([{ id: 'r1', seq: 1, cells: { c1: 'Old' } }]))
  const start = parseOnDemandPage(base, 'conq')
  // Both give their new row number 2 (forced clash): theirs is in Git first.
  const theirs = serializeOnDemandPage(upsertRow(start, { id: 'rT', cells: { c1: 'Theirs' } }, { by: ben }))
  const mine = serializeOnDemandPage(upsertRow(start, { id: 'rM', cells: { c1: 'Mine' } }, { by: ana }))
  assert.equal(JSON.parse(theirs).rows[1].seq, 2); assert.equal(JSON.parse(mine).rows[1].seq, 2)
  const merged = parseOnDemandPage(mergeOnDemandText(base, mine, theirs, true), 'conq')
  assert.deepEqual(merged.rows.map((row) => [row.id, row.seq]), [['r1', 1], ['rT', 2], ['rM', 3]], 'theirs keeps 2, mine gets the next free one')
  // Without the merge rule, a file that still holds a number twice: the second row loses it and is numbered on save.
  const clash = JSON.stringify({ kind: 'on-demand-page', id: 'conq', name: 'CoNQ', columns, rows: [{ id: 'x', seq: 2, cells: {} }, { id: 'y', seq: 2, cells: {} }] })
  const fixed = parseOnDemandPage(serializeOnDemandPage(parseOnDemandPage(clash, 'conq')), 'conq')
  assert.deepEqual(fixed.rows.map((row) => row.seq), [2, 3])
})

test('OND-20, OND-21: who added a row and when, set once; every saved edit logged with who, when and what changed (old → new) (TC-OND-17)', () => {
  let file = upsertRow(page(), { id: 'r1', cells: { c1: 'Seal', c2: '100 EUR' } }, { by: ' Ana@Example.com ', now: clock('2026-11-23T08:00:00Z') })
  const row = () => file.rows[0]
  assert.equal(row().addedBy, 'Ana@Example.com'); assert.equal(row().addedAt, '2026-11-23T08:00:00.000Z')
  assert.deepEqual(row().log.map((entry) => [entry.added, entry.at, entry.changes.map((change) => change.column)]), [[true, '2026-11-23T08:00:00.000Z', ['c1', 'c2']]])
  file = upsertRow(file, { id: 'r1', cells: { c1: 'Seal ring', c2: '100 EUR', c4: 'Scrap' } }, { by: ben, now: clock('2026-11-24T09:30:00Z') })
  assert.equal(row().addedBy, 'Ana@Example.com', 'added by never changes'); assert.equal(row().addedAt, '2026-11-23T08:00:00.000Z')
  const last = row().log.at(-1)
  assert.deepEqual([last.by, last.at, last.added, last.comment, last.changes], [ben, '2026-11-24T09:30:00.000Z', undefined, undefined, [{ column: 'c1', from: 'Seal', to: 'Seal ring' }, { column: 'c4', from: '', to: 'Scrap' }]])
  assert.deepEqual(lastUpdate(row()), { by: ben, at: '2026-11-24T09:30:00.000Z' })
  assert.equal(upsertRow(file, { id: 'r1', cells: row().cells }, { by: ben }), file, 'Save without a change: nothing logged')
  // Saved and read back: the log, who and when are in the file; export has Added / Last updated, not the log.
  const text = serializeOnDemandPage(file)
  assert.deepEqual(parseOnDemandPage(text, 'conq').rows[0].log, row().log)
  assert.equal(tableCsv(parseOnDemandPage(text, 'conq')).split('\r\n')[1], 'CONQ-0001,' + row().key + ',Seal ring,100.00 EUR,,Scrap,Ana@Example.com,2026-11-23T08:00:00.000Z,ben@example.com,2026-11-24T09:30:00.000Z')
  // The log keeps the last 100 entries; a long value is cut to 500 characters.
  for (let n = 0; n < maxLog + 5; n++) file = upsertRow(file, { id: 'r1', cells: { c1: `v${n}`, c3: 'x'.repeat(800) } }, { by: ana, now: clock(`2026-12-01T00:${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}Z`) })
  assert.equal(row().log.length, maxLog)
  assert.equal(row().log.at(-1).changes[0].to, `v${maxLog + 4}`)
  assert.equal(upsertRow(page(), { id: 'z', cells: { c3: 'x'.repeat(800) } }).rows[0].log[0].changes[0].to.length, 500, 'a value in the log is cut to 500 characters')
  assert.match(upsertRow(page(), { id: 'z', cells: { c3: 'x'.repeat(800) } }).rows[0].log[0].changes[0].to, /…$/)
  // A row from before: added by / on empty ("—"), no log; its first change starts it.
  const old = upsertRow(page([{ id: 'o', cells: { c1: 'Old' } }]), { id: 'o', cells: { c1: 'Older' } }, { by: ana })
  assert.deepEqual([old.rows[0].addedBy, old.rows[0].addedAt, old.rows[0].log.length], [undefined, undefined, 1])
  // A comment in a file (written by hand or another build) is read and kept; bad entries are dropped.
  const read = parseOnDemandPage(JSON.stringify({ kind: 'on-demand-page', id: 'conq', name: 'CoNQ', columns, rows: [{ id: 'r1', addedBy: 42, addedAt: 'yesterday', log: [
    { id: 'l1', at: '2026-11-23T08:00:00Z', by: ana, comment: 'Checked', changes: [{ column: 'c1', from: 'a', to: 'b' }, { column: '../x' }] },
    { id: 'l1', at: '2026-11-23T09:00:00Z', by: ana, changes: [] }, { id: 'l2', at: 'soon', by: ana, changes: [] }, null,
  ], cells: {} }] }), 'conq')
  assert.deepEqual(read.rows[0], { id: 'r1', addedBy: '42', log: [{ id: 'l1', at: '2026-11-23T08:00:00.000Z', by: ana, comment: 'Checked', changes: [{ column: 'c1', from: 'a', to: 'b' }] }], cells: {} })
  // Changing the columns keeps each row's key, ID, who added it and its log.
  const keyed = parseOnDemandPage(text, 'conq')
  const drafts = columnDrafts(keyed.columns); drafts[0].name = 'Subject'
  const applied = applyColumns(keyed, drafts)
  assert.deepEqual([applied.rows[0].key, applied.rows[0].seq, applied.rows[0].addedBy, applied.rows[0].log.length], [keyed.rows[0].key, 1, 'Ana@Example.com', 2])
})

test('OND-21: two saves of the same row — the later save wins for the values, the logs are merged so no entry is lost (TC-OND-17)', () => {
  const start = upsertRow(page(), { id: 'r1', cells: { c1: 'Seal' } }, { by: ana, now: clock('2026-11-23T08:00:00Z') })
  const base = serializeOnDemandPage(start)
  const read = parseOnDemandPage(base, 'conq')
  const theirs = serializeOnDemandPage(upsertRow(read, { id: 'r1', cells: { c1: 'Seal (theirs)' } }, { by: ben, now: clock('2026-11-23T09:00:00Z') }))
  const mine = serializeOnDemandPage(upsertRow(read, { id: 'r1', cells: { c1: 'Seal (mine)', c4: 'Rework' } }, { by: ana, now: clock('2026-11-23T10:00:00Z') }))
  for (const mineLater of [true, false]) {
    const merged = parseOnDemandPage(mergeOnDemandText(base, mine, theirs, mineLater), 'conq').rows[0]
    assert.equal(merged.cells.c1, mineLater ? 'Seal (mine)' : 'Seal (theirs)', 'the later save wins for the values')
    assert.deepEqual(merged.log.map((entry) => [entry.by, entry.at]), [[ana, '2026-11-23T08:00:00.000Z'], [ben, '2026-11-23T09:00:00.000Z'], [ana, '2026-11-23T10:00:00.000Z']], 'both entries kept, in time order')
    assert.deepEqual([merged.seq, merged.addedBy, merged.addedAt], [1, ana, '2026-11-23T08:00:00.000Z'])
  }
  assert.deepEqual(capLog([{ id: 'b', at: '2026-01-02T00:00:00.000Z' }, { id: 'a', at: '2026-01-01T00:00:00.000Z' }]).map((entry) => entry.id), ['a', 'b'])
})

test('OND-22, OND-23: Long text and Currency — kept, validated, shown and sorted; a type change keeps the values (TC-OND-18)', () => {
  const [, cost, details] = columns
  // Long text: up to 10,000 characters, kept with its line breaks.
  const long = upsertRow(page(), { id: 'r1', cells: { c3: `Line 1\nLine 2 ${'x'.repeat(12000)}` } }, { by: ana })
  assert.equal(long.rows[0].cells.c3.length, 10000)
  assert.match(long.rows[0].cells.c3, /^Line 1\nLine 2/)
  assert.equal(parseOnDemandPage(serializeOnDemandPage(long), 'conq').rows[0].cells.c3.length, 10000, 'read back in full')
  assert.equal(cellProblem(details, 'x'.repeat(9000)), '')
  // Long text made Text: kept in full, marked.
  assert.equal(cellProblem({ ...details, type: 'text' }, 'x'.repeat(3000)), 'longer than a Text')
  // Currency: an amount and an ISO code; without a code the column's default.
  assert.deepEqual(moneyOf('1200.5 usd'), { amount: 1200.5, currency: 'USD' })
  assert.deepEqual(moneyOf('80', 'GBP'), { amount: 80, currency: 'GBP' })
  assert.equal(moneyOf('12 euros'), null)
  assert.equal(formatMoney({ amount: 1200, currency: 'EUR' }), '1,200.00 EUR')
  assert.equal(formatMoney({ amount: 1200, currency: 'JPY' }), '1,200 JPY')
  assert.equal(displayText(cost, '1200'), '1,200.00 EUR')
  assert.equal(cellSortValue(cost, '1200.5 USD'), 1200.5)
  assert.equal(cellProblem(cost, 'a lot'), 'not an amount')
  assert.match(rowError(columns, { c2: 'a lot' }), /“Cost” is not an amount/)
  const added = upsertRow(page(), { id: 'r1', cells: { c2: '0099.50 CHF' } }, { by: ana })
  assert.equal(added.rows[0].cells.c2, '99.5 CHF', 'kept as amount and code')
  // The column default: a 3-letter code; kept in the file; an unknown one read back as EUR.
  assert.match(columnsError([{ id: 'x', name: 'Cost', type: 'currency', required: false, options: [], currency: 'EU' }]), /3-letter code/)
  assert.equal(columnsError([{ id: 'x', name: 'Cost', type: 'currency', required: false, options: [], currency: 'thb' }]), '')
  assert.equal(JSON.parse(serializeOnDemandPage(page())).columns[1].currency, 'EUR')
  assert.equal(parseOnDemandPage(JSON.stringify({ kind: 'on-demand-page', id: 'x', columns: [{ id: 'c', name: 'C', type: 'currency', currency: 'nope' }], rows: [] }), 'x').columns[0].currency, 'EUR')
  // A type change to and from Currency keeps the values and says so first (OND-06).
  const file = page([{ id: 'r1', cells: { c1: '250', c2: '1200 EUR' } }, { id: 'r2', cells: { c1: 'n/a' } }])
  const drafts = columnDrafts(file.columns); drafts[0].type = 'currency'; drafts[0].currency = 'USD'; drafts[1].type = 'number'
  assert.deepEqual(columnEffects(file, drafts), [
    '“Topic” changes from Text to Currency: its 2 values are kept; 1 does not fit and is shown as “not an amount” until changed.',
    '“Cost” changes from Currency to Number: its 1 value is kept; 1 does not fit and is shown as “not a number” until changed.',
  ])
  const applied = applyColumns(file, drafts)
  assert.equal(displayText(applied.columns[0], applied.rows[0].cells.c1), '250.00 USD')
  assert.equal(applied.rows[0].cells.c2, '1200 EUR')
})

test('OND-24: Sum and Average of a Currency column — one total per currency, never converted; the line says which currencies were found (TC-OND-19)', () => {
  const file = page([
    { id: 'r1', cells: { c2: '100 EUR', c4: 'Scrap' } },
    { id: 'r2', cells: { c2: '50', c4: 'Rework' } }, // the column's default: EUR
    { id: 'r3', cells: { c2: '70 USD', c4: 'Scrap' } },
    { id: 'r4', cells: { c2: '30 EUR', c4: 'Scrap' } },
    { id: 'r5', cells: { c4: 'Rework' } },
  ])
  assert.deepEqual(valueColumns(file).map((column) => column.id), ['c2'])
  const insight = { ...blankInsight(file, 'i1'), title: 'Cost', category: 'c4', measure: 'sum', value: 'c2' }
  assert.deepEqual(insightProblems(file, insight), [])
  const eur = aggregate(file, insight)
  assert.equal(eur.currency, 'EUR', 'the currency of most rows first')
  assert.deepEqual(eur.currencies, [{ code: 'EUR', rows: 3 }, { code: 'USD', rows: 1 }])
  assert.deepEqual(eur.categories.map((bucket, index) => [bucket.label, eur.values[index][0]]), [['Scrap', 130], ['Rework', 50]])
  assert.equal(eur.total, 180, 'only EUR added up')
  assert.deepEqual([eur.rows.used, eur.rows.otherCurrency, eur.rows.noNumber], [3, 1, 1])
  const usd = aggregate(file, insight, { currency: 'USD' })
  assert.deepEqual([usd.currency, usd.total, usd.rows.otherCurrency], ['USD', 70, 3])
  assert.equal(measureText(file, insight, 'USD'), 'Sum of Cost (USD)')
  assert.equal(currencyText(eur), 'Currencies found: EUR (3 rows), USD (1 row); shown: EUR — amounts in different currencies are not added up.')
  assert.equal(currencyText(aggregate(page([{ id: 'r1', cells: { c2: '5', c4: 'Scrap' } }]), insight)), 'Currency: EUR (1 row).')
  assert.equal(aggregate(file, { ...insight, measure: 'count', value: '' }).total, 5, 'Count is not split by currency')
  assert.match(insightRules(file, insight).join(' '), /never converted or added up across currencies/)
})

test('OND-25: a column description — kept in the file, set in Set up columns…, capped at 300 characters (TC-OND-20)', () => {
  const file = page()
  const text = serializeOnDemandPage(file)
  assert.equal(JSON.parse(text).columns[1].description, 'Cost in the supplier’s currency, without VAT.')
  assert.equal(JSON.parse(text).columns[0].description, undefined, 'none written when empty')
  assert.deepEqual(parseOnDemandPage(text, 'conq').columns, file.columns, 'round trip')
  const drafts = columnDrafts(file.columns)
  assert.equal(drafts[1].description, 'Cost in the supplier’s currency, without VAT.')
  drafts[0].description = '  What   went wrong, in a few words. '
  drafts[1].description = ''
  const applied = applyColumns(file, drafts)
  assert.equal(applied.columns[0].description, 'What went wrong, in a few words.')
  assert.equal('description' in applied.columns[1], false)
  drafts[0].description = 'x'.repeat(301)
  assert.match(columnsError(drafts), /description of “Topic” is longer than 300 characters/)
  assert.equal(parseOnDemandPage(JSON.stringify({ kind: 'on-demand-page', id: 'x', columns: [{ id: 'c', name: 'C', type: 'text', description: 'y'.repeat(400) }], rows: [] }), 'x').columns[0].description.length, 300)
})
