import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanOptions, conqPage, parseInsights, parseOnDemandPage, serializeOnDemandPage, mergeOnDemandText } from '../src/onDemand.ts'
import { blankInsight, insightProblems, insightRules, insightSubject, insightTypeLabel, isNestedPivot, ownValueName, valueText, pivotColumnFields, pivotRowFields, withPivotFields, withType } from '../src/onDemandInsights.ts'
import { cellWhere, drawnColumns, groupKeys, maxPivotCells, pivotCap, pivotData, pivotExport, pivotLines, pivotRows } from '../src/pivotTable.ts'
import { asInsight, blockTypeLabel, parseDashboard, serializeDashboard, withBlockType } from '../src/dashboardPages.ts'

// CHT-74…CHT-82 The nested Pivot table: synthetic rows only.
const columns = [
  { id: 'ep', name: 'Epic', type: 'dropdown', options: ['Alpha', 'Beta'], required: false },
  { id: 'fe', name: 'Feature', type: 'text', options: [], required: false },
  { id: 'st', name: 'State', type: 'dropdown', options: ['New', 'Active', 'Closed'], required: false },
  { id: 'sm', name: 'Stream', type: 'dropdown', options: ['S1', 'S2'], required: false },
  { id: 'dt', name: 'Start', type: 'date', options: [], required: false },
  { id: 'ef', name: 'Effort', type: 'number', options: [], required: false },
  { id: 'tm', name: 'Teams', type: 'multi', options: ['T1', 'T2'], required: false },
  { id: 'ow', name: 'Owner', type: 'text', options: [], required: false },
]
const rows = [
  { id: 'r1', cells: { ep: 'Alpha', fe: 'F1', st: 'New', sm: 'S1', dt: '2026-01-10', ef: '10', tm: ['T1', 'T2'], ow: 'Ann' } },
  { id: 'r2', cells: { ep: 'Alpha', fe: 'F1', st: 'Active', sm: 'S2', dt: '2026-02-03', ef: '20', tm: ['T1'], ow: 'Bob' } },
  { id: 'r3', cells: { ep: 'Alpha', fe: 'F2', st: 'Active', sm: 'S1', dt: '2026-01-25', ef: '30', tm: ['T2'], ow: 'Ann' } },
  { id: 'r4', cells: { ep: 'Beta', fe: 'F3', st: 'New', sm: 'S1', dt: '2026-02-14', ef: '40', tm: ['T1'], ow: 'Cy' } },
  { id: 'r5', cells: { ep: 'Beta', fe: 'F3', st: 'Closed', sm: 'S2', dt: '2026-04-02', ef: '5', tm: [], ow: 'Ann' } },
  { id: 'r6', cells: { ep: 'Beta', fe: 'F4', st: 'Closed' } }, // no stream, date, effort, team or owner
]
const page = () => ({ ...conqPage(), columns: structuredClone(columns), rows: structuredClone(rows) })
const pivot = (fields) => ({ ...blankInsight(page(), 'p1', 'table'), title: 'Pivot', category: 'ep', ...fields })
// The table as text: each line its labels and values (a group marked ▸), then the Total row.
const shape = (data, collapsed) => pivotLines(data, collapsed).map(({ node, group }) => `${group ? '▸ ' : ''}${node.labels.join(' / ')}: ${node.values.join(' ')}`)
const heads = (data) => data.columns.map((column) => column.kind === 'total' ? 'Total' : column.kind === 'subtotal' ? `${column.labels[0]} Σ` : column.labels.join('/'))

test('CHT-74, CHT-75: rows nested Epic → State with a subtotal on each group’s row, columns by Month, the grand totals (TC-CHT-60)', () => {
  const data = pivotData(page(), pivot({ rows2: 'st', second: 'dt' }))
  assert.deepEqual(heads(data), ['Jan 2026', 'Feb 2026', 'Apr 2026', '(none)', 'Total'], 'months in time order, (none) last, then Total')
  assert.deepEqual(shape(data), [
    '▸ Alpha: 2 1 0 0 3', 'Alpha / New: 1 0 0 0 1', 'Alpha / Active: 1 1 0 0 2',
    '▸ Beta: 0 1 1 1 3', 'Beta / New: 0 1 0 0 1', 'Beta / Closed: 0 0 1 1 2',
  ], 'inner rows in option order; a group’s numbers are its subtotals')
  assert.deepEqual(data.total, [2, 2, 1, 1, 6])
  assert.deepEqual(groupKeys(data.rows).length, 2)
  // Three row levels: Epic → Feature → State.
  const three = pivotData(page(), pivot({ rows2: 'fe', rows3: 'st' }))
  assert.deepEqual(shape(three), ['▸ Alpha: 3', '▸ Alpha / F1: 2', 'Alpha / F1 / New: 1', 'Alpha / F1 / Active: 1', '▸ Alpha / F2: 1', 'Alpha / F2 / Active: 1', '▸ Beta: 3', '▸ Beta / F3: 2', 'Beta / F3 / New: 1', 'Beta / F3 / Closed: 1', '▸ Beta / F4: 1', 'Beta / F4 / Closed: 1'])
  assert.equal(groupKeys(three.rows).length, 6, 'every group at every level')
})

test('CHT-74, CHT-75: columns nested Stream → Month — each outer column has its Subtotal column; values under two outer columns are two columns (TC-CHT-60)', () => {
  const data = pivotData(page(), pivot({ rows2: 'st', second: 'sm', second2: 'dt' }))
  assert.deepEqual(heads(data), ['S1/Jan 2026', 'S1/Feb 2026', 'S1 Σ', 'S2/Feb 2026', 'S2/Apr 2026', 'S2 Σ', '(none)/(none)', '(none) Σ', 'Total'])
  assert.deepEqual(data.head.map((group) => [group.label, group.span]), [['S1', 3], ['S2', 3], ['(none)', 2]])
  assert.deepEqual(shape(data)[0], '▸ Alpha: 2 0 2 1 0 1 0 0 3')
  assert.deepEqual(shape(data)[3], '▸ Beta: 0 1 1 0 1 1 1 1 3')
  assert.deepEqual(data.total, [2, 1, 3, 1, 1, 2, 1, 1, 6])
})

test('CHT-76: Average, Minimum, Maximum and Distinct count subtotals are measured over the group’s rows — never by adding or averaging the cells (TC-CHT-61)', () => {
  const average = pivotData(page(), pivot({ rows2: 'st', measure: 'average', value: 'ef' }))
  // Alpha: (10 + 20 + 30) / 3 = 20 (the average of its cells 10 and 25 would be 17.5); Beta: (40 + 5) / 2 = 22.5, first.
  assert.deepEqual(shape(average), ['▸ Beta: 22.5', 'Beta / New: 40', 'Beta / Closed: 5', '▸ Alpha: 20', 'Alpha / New: 10', 'Alpha / Active: 25'])
  assert.deepEqual(average.total, [21], '105 / 5 rows with a number')
  assert.equal(average.counted.noNumber, 1)
  const distinct = pivotData(page(), pivot({ rows2: 'st', second: 'sm', measure: 'distinct', value: 'ow' }))
  // Owners: Alpha {Ann, Bob}, Beta {Cy, Ann}; in all {Ann, Bob, Cy} = 3, not 2 + 2.
  assert.deepEqual(heads(distinct), ['S1', 'S2', '(none)', 'Total'])
  assert.deepEqual(shape(distinct), ['▸ Alpha: 1 1 0 2', 'Alpha / New: 1 0 0 1', 'Alpha / Active: 1 1 0 2', '▸ Beta: 1 1 0 2', 'Beta / New: 1 0 0 1', 'Beta / Closed: 0 1 0 1'])
  assert.deepEqual(distinct.total, [2, 2, 0, 3], 'S1 {Ann, Cy}, S2 {Bob, Ann}, all {Ann, Bob, Cy}')
  const min = pivotData(page(), pivot({ rows2: 'st', measure: 'min', value: 'ef' })), max = pivotData(page(), pivot({ rows2: 'st', measure: 'max', value: 'ef' }))
  assert.deepEqual([min.rows.map((node) => [node.labels[0], node.values[0]]), min.total], [[['Alpha', 10], ['Beta', 5]], [5]])
  assert.deepEqual([max.rows.map((node) => [node.labels[0], node.values[0]]), max.total], [[['Beta', 40], ['Alpha', 30]], [40]])
  assert.equal(max.rows[1].children.find((node) => node.labels[1] === 'Active').values[0], 30)
  const sum = pivotData(page(), pivot({ rows2: 'st', second: 'sm', measure: 'sum', value: 'ef' }))
  assert.deepEqual(heads(sum), ['S1', 'S2', 'Total'], 'the row without a number (and without a stream) is left out')
  assert.deepEqual(shape(sum)[0], '▸ Alpha: 40 20 60')
  assert.deepEqual(sum.total, [80, 25, 105])
  // An Average cell of a group without a number is empty (—), not 0.
  assert.equal(average.rows[0].children.find((node) => node.labels[1] === 'Closed').values[0], 5)
  const empty = pivotData(page(), pivot({ rows2: 'st', second: 'tm', measure: 'average', value: 'ef' }))
  assert.deepEqual(heads(empty), ['T1', 'T2', '(none)', 'Total'])
  assert.equal(empty.rows.find((node) => node.labels[0] === 'Alpha').values[2], null, 'Alpha has no row without a team')
})

test('CHT-76: a Multi-select field counts a row in each of its values; subtotals and totals take each row once (TC-CHT-62)', () => {
  const data = pivotData(page(), pivot({ rows2: 'st', second: 'tm' }))
  assert.deepEqual(heads(data), ['T1', 'T2', '(none)', 'Total'])
  assert.deepEqual(shape(data)[0], '▸ Alpha: 2 2 0 3', 'r1 is in T1 and T2; Alpha’s total takes it once')
  assert.equal(data.counted.multi, true)
  assert.deepEqual(data.total, [3, 2, 2, 6])
  // As a row field: a row under two values of the inner field is in both groups, once in the outer group.
  const rowsBy = pivotData(page(), pivot({ rows2: 'tm' }))
  assert.deepEqual(shape(rowsBy).slice(0, 3), ['▸ Alpha: 3', 'Alpha / T1: 2', 'Alpha / T2: 2'])
  assert.match(insightRules(page(), pivot({ rows2: 'tm' })).join(' '), /“Teams” is a Multi-select: a row with several values counts once in each of them/)
})

test('CHT-76: Date fields are grouped by the chosen grain, at every level (TC-CHT-63)', () => {
  const quarter = pivotData(page(), pivot({ rows2: 'st', second: 'sm', second2: 'dt', options: { dateGroup: 'quarter' } }))
  assert.deepEqual(heads(quarter), ['S1/Q1 2026', 'S1 Σ', 'S2/Q1 2026', 'S2/Q2 2026', 'S2 Σ', '(none)/(none)', '(none) Σ', 'Total'])
  const asRows = pivotData(page(), pivot({ category: 'dt', rows2: 'ep', options: { dateGroup: 'year' }, sort: 'label' }))
  assert.deepEqual(shape(asRows), ['▸ 2026: 5', '2026 / Alpha: 3', '2026 / Beta: 2', '▸ (none): 1', '(none) / Beta: 1'])
  assert.match(insightRules(page(), pivot({ rows2: 'st', second: 'dt', options: { dateGroup: 'quarter' } })).join(' '), /“Start” is grouped by quarter/)
})

test('CHT-75: Sort and Show apply to the outer rows; Percent of total to every number (TC-CHT-60)', () => {
  const label = pivotData(page(), pivot({ category: 'st', rows2: 'ep', sort: 'label' }))
  assert.deepEqual(label.rows.map((node) => node.labels[0]), ['New', 'Active', 'Closed'], 'the option order')
  const value = pivotData(page(), pivot({ category: 'st', rows2: 'ep' }))
  assert.deepEqual(value.rows.map((node) => node.labels[0]), ['New', 'Active', 'Closed'], 'largest first; ties (2 each) in option order')
  const top = pivotData(page(), pivot({ category: 'fe', rows2: 'st', options: { top: 2 } }))
  assert.deepEqual(top.rows.map((node) => node.labels[0]), ['F1', 'F3', 'Other'], 'the 2 largest, the rest as Other, last')
  assert.deepEqual(top.rows[2].values, [2])
  assert.deepEqual(pivotRows(page(), pivot({ category: 'fe', rows2: 'st', options: { top: 2 } }), top, [top.rows[2].path[0]], []).map((row) => row.id), ['r3', 'r6'])
  const percent = pivotData(page(), pivot({ rows2: 'st', second: 'sm', options: { percent: true } }))
  assert.equal(percent.unit, '%')
  assert.deepEqual(percent.total.map((value) => Math.round(value)), [50, 33, 17, 100])
})

test('CHT-80: the drill-down lists the rows behind a cell, a subtotal, an outer column’s subtotal and the total — every group filter applied (TC-CHT-64)', () => {
  const insight = pivot({ rows2: 'st', second: 'sm', second2: 'dt' })
  const data = pivotData(page(), insight)
  const alpha = data.rows[0], active = alpha.children[1]
  const ids = (rowPath, colPath) => pivotRows(page(), insight, data, rowPath, colPath).map((row) => row.id)
  assert.deepEqual(ids(alpha.path, []), ['r1', 'r2', 'r3'], 'a group’s subtotal in the Total column')
  assert.deepEqual(ids(active.path, ['S1', '2026-01']), ['r3'], 'a cell: Epic, State, Stream and Month')
  assert.deepEqual(ids(alpha.path, ['S1']), ['r1', 'r3'], 'an outer column’s Subtotal')
  assert.deepEqual(ids([], ['S2']), ['r2', 'r5'], 'the Total row under a column')
  assert.deepEqual(ids([], []), ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], 'the grand total')
  assert.equal(cellWhere(active, data.columns[0]), 'Alpha · Active · S1 · Jan 2026')
  assert.equal(cellWhere(null, data.columns[data.columns.length - 1]), 'Total')
  // A Multi-select cell: the rows with that value; the Average's drill-down leaves out rows without a number.
  const teams = pivot({ rows2: 'st', second: 'tm' })
  assert.deepEqual(pivotRows(page(), teams, pivotData(page(), teams), ['Alpha'], ['T2']).map((row) => row.id), ['r1', 'r3'])
  const average = pivot({ rows2: 'st', measure: 'average', value: 'ef' })
  assert.deepEqual(pivotRows(page(), average, pivotData(page(), average), ['Beta'], []).map((row) => row.id), ['r4', 'r5'])
})

test('CHT-77: collapsing a group hides its rows and keeps its subtotal line; Collapse all keeps the outer lines only; the first N outer rows (TC-CHT-65)', () => {
  const data = pivotData(page(), pivot({ rows2: 'fe', rows3: 'st' }))
  assert.deepEqual(shape(data, new Set(['Alpha'])).slice(0, 2), ['▸ Alpha: 3', '▸ Beta: 3'])
  assert.deepEqual(shape(data, new Set(['Beta\u0001F3'])).slice(6), ['▸ Beta: 3', '▸ Beta / F3: 2', '▸ Beta / F4: 1', 'Beta / F4 / Closed: 1'], 'an inner group closes on its own')
  assert.deepEqual(shape(data, new Set(groupKeys(data.rows))), ['▸ Alpha: 3', '▸ Beta: 3'])
  assert.equal(pivotLines(data, new Set(), 1).length, 6, 'the first outer row with everything inside it')
  assert.deepEqual(pivotLines(data, new Set(['Alpha'])).map((line) => line.open).slice(0, 2), [false, true])
})

test('CHT-81: at most 2,000 value cells and 200 value columns are drawn — the Total column always — and a cap is said (TC-CHT-66)', () => {
  assert.equal(maxPivotCells, 2000)
  assert.deepEqual(pivotCap(30, 10), { lines: 30, columns: 10, capped: false })
  assert.deepEqual(pivotCap(500, 10), { lines: 200, columns: 10, capped: true })
  assert.deepEqual(pivotCap(5, 450), { lines: 5, columns: 200, capped: true }, '200 columns × 5 lines = 1,000 cells')
  assert.deepEqual(pivotCap(50, 450), { lines: 10, columns: 200, capped: true })
  assert.deepEqual(pivotCap(3, 5000, 2000).lines, 3)
  const many = { ...page(), rows: Array.from({ length: 300 }, (_, index) => ({ id: `m${index}`, cells: { ep: index % 2 ? 'Alpha' : 'Beta', fe: `Feature ${index}`, st: 'New' } })) }
  const data = pivotData(many, pivot({ rows2: 'fe', second: 'fe' }))
  assert.equal(data.columns.length, 301)
  const kept = drawnColumns(data.columns, pivotCap(pivotLines(data).length, data.columns.length).columns)
  assert.equal(kept.length, 200)
  assert.equal(kept[kept.length - 1].kind, 'total', 'the Total column stays')
})

test('CHT-80: Export is a flat table — a column per row field, the Line (Subtotal / Total), the column combinations, the outer Subtotals and the Total (TC-CHT-67)', () => {
  const insight = pivot({ rows2: 'st', second: 'sm', second2: 'dt', measure: 'average', value: 'ef' })
  const out = pivotExport(page(), insight, pivotData(page(), insight))
  assert.deepEqual(out.head, ['Epic', 'State', 'Line', 'S1 · Jan 2026', 'S1 · Feb 2026', 'S1 · Subtotal', 'S2 · Feb 2026', 'S2 · Apr 2026', 'S2 · Subtotal', 'Total'])
  assert.deepEqual(out.rows[0], ['Beta', '', 'Subtotal', '', 40, 40, '', 5, 5, 22.5])
  assert.deepEqual(out.rows[1], ['Beta', 'New', '', '', 40, 40, '', '', '', 40])
  assert.deepEqual(out.rows[out.rows.length - 1], ['Total', '', 'Total', 20, 40, 26.67, 20, 5, 12.5, 21])
  assert.equal(out.rows.length, 7, 'two groups, four rows, the Total — whatever is closed on screen')
  // No column field: the measure is the value column; a date row field is named with its period.
  const plain = { ...pivot({ category: 'dt', rows2: 'ep' }) }
  assert.deepEqual(pivotExport(page(), plain, pivotData(page(), plain)).head, ['Start (month)', 'Epic', 'Line', 'Count of rows'])
})

test('CHT-79: the stored format — rows2, rows3 and second2 written only for a nested Pivot table, read back; an older file reads unchanged (TC-CHT-68)', () => {
  const base = { ...page(), insights: [pivot({ id: 'p1', rows2: 'st', rows3: 'fe', second: 'sm', second2: 'dt' }), { ...pivot({ id: 'p2', second: 'sm' }) }] }
  const text = serializeOnDemandPage(base)
  const file = JSON.parse(text)
  assert.deepEqual(Object.keys(file.insights[0]).filter((key) => /rows|second/.test(key)), ['second', 'rows2', 'rows3', 'second2'])
  assert.deepEqual(Object.keys(file.insights[1]).filter((key) => /rows|second/.test(key)), ['second'], 'a one-level table is written as before')
  const read = parseOnDemandPage(text, base.id)
  assert.deepEqual(pivotRowFields(read.insights[0]), ['ep', 'st', 'fe'])
  assert.deepEqual(pivotColumnFields(read.insights[0]), ['sm', 'dt'])
  assert.deepEqual(JSON.parse(serializeOnDemandPage(read)).insights, file.insights, 'read and written back unchanged')
  // An older file (category and second only) reads as the one-level table it was.
  const [old] = parseInsights([{ id: 'o1', title: 'Old', type: 'table', category: 'ep', second: 'sm', measure: 'count', sort: 'value' }])
  assert.equal(isNestedPivot(old), false)
  assert.deepEqual([old.rows2, old.rows3, old.second2], [undefined, undefined, undefined])
  // A level without the one before it, or on another type, is dropped; a bad id too.
  const [orphan, bar, bad] = parseInsights([
    { id: 'o2', title: 'Orphan', type: 'table', category: 'ep', rows3: 'st', second2: 'dt', measure: 'count', sort: 'value' },
    { id: 'o3', title: 'Bar', type: 'bar', category: 'ep', rows2: 'st', second2: 'dt', measure: 'count', sort: 'value' },
    { id: 'o4', title: 'Bad', type: 'table', category: 'ep', rows2: '../x', measure: 'count', sort: 'value' },
  ])
  assert.deepEqual([orphan.rows2, orphan.rows3, orphan.second2, bar.rows2, bar.second2, bad.rows2], [undefined, undefined, undefined, undefined, undefined, undefined])
  // The older app's reader (the fields it knew): the same file shows the outer row and column field; nothing else breaks.
  const older = ({ id, title, type, category, second, measure, sort }) => ({ id, title, type, category, second, measure, sort })
  assert.deepEqual(older(file.insights[0]), { id: 'p1', title: 'Pivot', type: 'table', category: 'ep', second: 'sm', measure: 'count', sort: 'value' })
  // Two saves of the same insight: as any insight, the later save's insight is kept whole — with its nested fields.
  const merged = parseOnDemandPage(mergeOnDemandText(text, serializeOnDemandPage({ ...read, insights: [read.insights[0], { ...read.insights[1], rows2: 'st' }] }), serializeOnDemandPage({ ...read, insights: [read.insights[0], { ...read.insights[1], title: 'Renamed' }] }), true), base.id)
  assert.deepEqual([merged.insights[1].title, merged.insights[1].rows2], ['Pivot', 'st'])
})

test('CHT-79: Dashboard blocks keep the nested fields the same way; asInsight carries them; an older dashboard reads unchanged (TC-CHT-68)', () => {
  const board = { schema: 1, kind: 'dashboard', id: 'qd', tabs: [], filters: [], blocks: [
    { id: 'b1', title: 'Nested', type: 'table', source: 'page:conq', category: 'ep', rows2: 'st', second: 'sm', second2: 'dt', measure: 'count', sort: 'value' },
    { id: 'b2', title: 'Old', type: 'table', source: 'page:conq', category: 'ep', second: 'sm', measure: 'count', sort: 'value' },
  ] }
  const { dashboard } = parseDashboard(JSON.stringify(board), 'qd')
  assert.deepEqual([dashboard.blocks[0].rows2, dashboard.blocks[0].second2], ['st', 'dt'])
  assert.equal(isNestedPivot(asInsight(dashboard.blocks[0])), true)
  assert.equal(isNestedPivot(asInsight(dashboard.blocks[1])), false)
  const text = serializeDashboard(dashboard)
  assert.deepEqual(Object.keys(JSON.parse(text).blocks[1]), ['id', 'title', 'type', 'source', 'category', 'second', 'measure', 'sort'], 'written as before')
  assert.equal(serializeDashboard(parseDashboard(text, 'qd').dashboard), text)
  // Another type drops them.
  const dataset = { key: 'page:conq', name: 'CoNQ', page: page() }
  const bar = withBlockType(dataset, dashboard.blocks[0], 'bar')
  assert.deepEqual([bar.rows2, bar.second2, bar.category, bar.second], [undefined, undefined, 'ep', 'sm'])
  const back = withBlockType(dataset, dashboard.blocks[0], 'table')
  assert.deepEqual([back.rows2, back.second2], ['st', 'dt'])
})

test('CHT-78, CHT-79: the fields — set outermost first, checked, kept when they fit, named in the subject; the type is called Pivot table (TC-CHT-69)', () => {
  assert.equal(insightTypeLabel('table'), 'Pivot table')
  assert.equal(blockTypeLabel('table'), 'Pivot table')
  const nested = withPivotFields(pivot({}), ['ep', 'fe', 'st'], ['sm', 'dt'])
  assert.deepEqual([nested.category, nested.rows2, nested.rows3, nested.second, nested.second2], ['ep', 'fe', 'st', 'sm', 'dt'])
  const fewer = withPivotFields(nested, ['st'], [])
  assert.deepEqual([fewer.category, fewer.rows2, fewer.rows3, fewer.second, fewer.second2], ['st', undefined, undefined, '', undefined])
  assert.equal(insightSubject(page(), nested), 'Count of rows by Epic, then Feature, then State, columns by Stream, then Start')
  assert.deepEqual(insightProblems(page(), nested), [])
  assert.deepEqual(insightProblems(page(), { ...nested, rows3: 'sm' }), ['The same column is used twice: choose another one, or none.'])
  assert.match(insightProblems(page(), { ...nested, rows2: 'ef' })[0], /“Effort” for the rows \(level 2\) is now a Number column/)
  assert.match(insightProblems(page(), { ...nested, second2: 'gone' })[0], /for the columns \(level 2\) is no longer on the page/)
  // Changing the type: a bar drops the nested fields; back to a Pivot table, nothing comes back from the bar.
  const bar = withType(page(), nested, 'bar')
  assert.deepEqual([bar.rows2, bar.rows3, bar.second2, bar.second], [undefined, undefined, undefined, 'sm'])
  const kept = withType(page(), nested, 'table')
  assert.deepEqual([kept.rows2, kept.rows3, kept.second2], ['fe', 'st', 'dt'])
  assert.match(insightRules(page(), nested).join(' '), /never made by adding up the cells/)
})

test('CHT-83: the value’s own name — the Value name, else the value axis title, else the measure — in every place the chart names its value (TC-CHT-72)', () => {
  const bar = (options) => ({ ...blankInsight(page(), 'b1', 'bar'), title: 'Services', category: 'ow', ...(options ? { options } : {}) })
  assert.equal(ownValueName(bar({ orientation: 'vertical', yTitle: 'Services' })), 'Services', 'columns: the Y axis title')
  assert.equal(ownValueName(bar({ xTitle: 'Services' })), 'Services', 'horizontal bars: the X axis title')
  assert.equal(ownValueName(bar({ yTitle: 'Owners' })), '', 'horizontal bars: Y names the categories, not the value')
  assert.equal(valueText(page(), bar({ orientation: 'vertical', yTitle: 'Services' })), 'Services')
  assert.equal(valueText(page(), bar({ valueName: 'Services', yTitle: 'Count' })), 'Services', 'the Value name first')
  assert.equal(valueText(page(), bar({ valueName: 'Services', percent: true })), 'Services — % of total')
  assert.equal(valueText(page(), bar()), 'Count of rows', 'none given: the measure')
  // Stored as an option: cleaned, at most 60 characters; not for a KPI.
  assert.deepEqual(cleanOptions('bar', 'count', { valueName: '  Services   delivered ' }), { valueName: 'Services delivered' })
  assert.equal(cleanOptions('kpi', 'count', { valueName: 'Services' }), undefined)
  assert.equal(cleanOptions('table', 'count', { valueName: 'x'.repeat(80) }).valueName.length, 60)
  // The Pivot table's measure heading and Export use it.
  const named = pivot({ rows2: 'st', options: { valueName: 'Services' } })
  assert.equal(pivotExport(page(), named, pivotData(page(), named)).head.at(-1), 'Services')
})
