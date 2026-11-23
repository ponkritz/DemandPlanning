import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cleanOptions, mergeOnDemandText, parseColors, parseInsights, parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { aggregate, bucketsOf, chartData, drillRows, insightError, insightProblems, insightRules, kpiData, limitsFor, measureColumns, measuresFor, otherKey, periodAfter, periodOf, valueText, withType } from '../src/onDemandInsights.ts'
import { blockData, mergeDashboardText, parseDashboard, serializeDashboard, withBlockType } from '../src/dashboardPages.ts'

// CHT-01…CHT-12 Chart options: the aggregation behind every option, the file fields and what an insight without them
// gives (identical to the aggregation before chart options: hashes taken from the code of v9.12.0 + DSH).

const columns = [
  { id: 'c1', name: 'Topic', type: 'text', options: [], required: false },
  { id: 'c2', name: 'Cost', type: 'number', options: [], required: false },
  { id: 'c3', name: 'Found on', type: 'date', options: [], required: false },
  { id: 'c4', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint', 'Label', 'Seal', 'Late', 'Damage'], required: false },
  { id: 'c5', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon'], required: false },
  { id: 'c6', name: 'Amount', type: 'currency', options: [], required: false, currency: 'EUR' },
]
const cats = ['Rework', 'Scrap', 'Complaint', 'Label', 'Seal', 'Late', 'Damage', 'Gone', '']
const rows = Array.from({ length: 30 }, (_, i) => ({ id: `r${i + 1}`, seq: i + 1, cells: {
  c1: `T${i % 4}`, ...(i % 7 ? { c2: String((i * 37) % 500) } : {}), c3: i % 11 ? `2025-${String(1 + (i * 5) % 12).padStart(2, '0')}-${String(1 + i % 27).padStart(2, '0')}` : 'later',
  ...(cats[i % 9] ? { c4: cats[i % 9] } : {}), c5: [['Berlin'], ['Leeds', 'Lyon'], [], ['Lyon', 'Gone']][i % 4], c6: `${(i * 13) % 300} ${i % 3 ? 'EUR' : 'USD'}` } }))
const page = () => ({ schema: 1, kind: 'on-demand-page', id: 'p', name: 'P', description: '', keyPrefix: 'P', columns: structuredClone(columns), rows: structuredClone(rows), insights: [] })
const base = { id: 'i', title: 'T', second: '', measure: 'count', value: '', filters: [], sort: 'value' }
const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex').slice(0, 16)
const without = ({ unit: _unit, ...rest }) => rest
// A small page for the option arithmetic: Sum of Cost by Category (Rework 60, Scrap 30, Complaint 10) and dates.
const small = () => ({ ...page(), rows: [
  { id: 'a', seq: 1, cells: { c4: 'Rework', c2: '40', c3: '2026-01-01', c5: ['Berlin'] } },
  { id: 'b', seq: 2, cells: { c4: 'Rework', c2: '20', c3: '2026-01-05', c5: ['Leeds'] } },
  { id: 'c', seq: 3, cells: { c4: 'Scrap', c2: '30', c3: '2026-04-02', c5: ['Berlin'] } },
  { id: 'd', seq: 4, cells: { c4: 'Complaint', c2: '10', c3: '2027-01-01', c5: ['Lyon'] } },
] })
const ins = (fields) => ({ ...base, type: 'bar', category: 'c4', ...fields })

test('CHT-13, compatibility: an insight without the new fields aggregates exactly as before, and its file is written byte for byte as before (TC-CHT-03)', () => {
  const cases = [
    { ...base, type: 'bar', category: 'c4' },
    { ...base, type: 'bar', category: 'c4', second: 'c5', measure: 'sum', value: 'c2' },
    { ...base, type: 'bar', category: 'c1', measure: 'average', value: 'c2', sort: 'label' },
    { ...base, type: 'bar', category: 'c3', measure: 'sum', value: 'c6' },
    { ...base, type: 'line', category: 'c3', second: 'c4', sort: 'label' },
    { ...base, type: 'line', category: 'c3', measure: 'average', value: 'c2', sort: 'label', filters: [{ column: 'c4', values: ['Rework', 'Scrap'] }] },
    { ...base, type: 'pie', category: 'c4', measure: 'sum', value: 'c2' },
    { ...base, type: 'pie', category: 'c5' },
    { ...base, type: 'table', category: 'c4', second: 'c5' },
    { ...base, type: 'table', category: 'c3', second: 'c1', measure: 'sum', value: 'c6', filters: [{ column: 'c3', from: '2025-03', to: '2025-10' }] },
  ]
  const before = ['bf43c278386d20ad', '144c8f30152c5cc8', '345eb8d11d1a3543', '7c6f2047fb610d7e', '3c29a05bfb039b4a', '48c5ba22ed9ad590', '006f91cb93fc01f1', '0dbb1d3636b464d9', '22541c417f1f9f76', '66ad074745447db5']
  assert.deepEqual(cases.map((insight) => hash(without(chartData(page(), insight)))), before, 'the charts (chartData with the type’s usual limits)')
  // The dashboard blocks draw the same data from the same fields.
  assert.equal(hash(without(blockData(page(), { ...cases[1], source: 'page:p', period: '', tab: '' }))), before[1])
  const file = serializeOnDemandPage(parseOnDemandPage(JSON.stringify({ ...page(), insights: cases.map((entry, index) => ({ ...entry, id: `i${index}` })) }), 'p'), { fill: false })
  assert.equal(hash(file), 'b5ec87a13ea7c1c0', 'no options, no colours: the file as before')
  assert.equal(/"options": \{|"colors"/.test(file), false, 'no options object (a column\'s option list is an array), no colours')
})

test('CHT-03: dates grouped by day, ISO week (Monday, week 1 holds the first Thursday), month, quarter or year; a line fills every period (TC-CHT-04)', () => {
  assert.deepEqual(periodOf('2026-01-01', 'week'), { key: '2026-W01', label: 'W01 2026' }, '1 Jan 2026 is a Thursday')
  assert.equal(periodOf('2027-01-01', 'week').key, '2026-W53', 'a Friday 1 Jan belongs to the last week of the year before')
  assert.equal(periodOf('2024-12-30', 'week').key, '2025-W01', 'a Monday 30 Dec can start week 1 of the next year')
  assert.equal(periodOf('2026-01-04', 'week').key, '2026-W01', 'Sunday ends the week')
  assert.equal(periodOf('2026-01-05', 'week').key, '2026-W02', 'Monday starts the next')
  assert.deepEqual(periodOf('2026-05-17', 'day'), { key: '2026-05-17', label: '17 May 2026' })
  assert.deepEqual(periodOf('2026-05-17', 'quarter'), { key: '2026-Q2', label: 'Q2 2026' })
  assert.deepEqual(periodOf('2026-05-17', 'year'), { key: '2026', label: '2026' })
  assert.deepEqual(periodOf('2026-05-17'), { key: '2026-05', label: 'May 2026' }, 'month as before')
  assert.equal(periodAfter('2026-W53', 'week').key, '2027-W01')
  assert.equal(periodAfter('2026-12-31', 'day').key, '2027-01-01')
  assert.equal(periodAfter('2026-Q4', 'quarter').key, '2027-Q1')
  assert.equal(bucketsOf(columns[2], '2026-02-29', 'week')[0].key, '', 'not a date: “(none)”')
  const quarters = aggregate(small(), ins({ type: 'line', category: 'c3', measure: 'sum', value: 'c2', sort: 'label', options: { dateGroup: 'quarter' } }), limitsFor({ type: 'line' }))
  assert.deepEqual(quarters.categories.map((bucket) => bucket.label), ['Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2027'], 'every quarter, also those without rows')
  assert.deepEqual(quarters.values.map((row) => row[0]), [60, 30, 0, 0, 10])
  const weeks = aggregate(small(), ins({ category: 'c3', options: { dateGroup: 'week' }, sort: 'label' }))
  assert.deepEqual(weeks.categories.map((bucket) => bucket.label), ['W01 2026', 'W02 2026', 'W14 2026', 'W53 2026'])
  assert.match(insightRules(small(), ins({ category: 'c3', options: { dateGroup: 'week' } })).join(' '), /grouped by ISO week \(Monday to Sunday/)
})

test('CHT-04: Top N + “Other” — the N largest by the measure, the rest summed as “Other”, last; “all” shows every category (TC-CHT-05)', () => {
  const top2 = chartData(small(), ins({ measure: 'sum', value: 'c2', options: { top: 2 } }))
  assert.deepEqual(top2.categories.map((bucket) => bucket.label), ['Rework', 'Scrap', 'Other'])
  assert.deepEqual(top2.values.map((row) => row[0]), [60, 30, 10])
  assert.equal(top2.categories[2].key, otherKey)
  const pie = chartData(page(), { ...base, type: 'pie', category: 'c4', options: { top: 'all' } })
  assert.equal(pie.categories.some((bucket) => bucket.key === otherKey), false, 'all: no “Other”')
  assert.deepEqual(limitsFor({ type: 'pie' }), { maxCategories: 5 }, 'as before without a choice')
  assert.deepEqual(limitsFor({ type: 'bar', options: { top: 10 } }), { maxCategories: 10, maxSeries: 5 })
  assert.deepEqual(limitsFor({ type: 'table', options: { top: 3 } }), { maxCategories: 3 })
})

test('CHT-05, CHT-06: running total along the categories, and values as a share of the total (TC-CHT-06)', () => {
  const running = chartData(small(), ins({ measure: 'sum', value: 'c2', options: { cumulative: true } }))
  assert.deepEqual(running.values.map((row) => row[0]), [60, 90, 100])
  assert.deepEqual(running.categoryTotals, [60, 90, 100])
  const line = chartData(small(), ins({ type: 'line', category: 'c3', measure: 'sum', value: 'c2', sort: 'label', options: { dateGroup: 'year', cumulative: true } }))
  assert.deepEqual(line.values.map((row) => row[0]), [90, 100])
  const percent = chartData(small(), ins({ second: 'c5', options: { percent: true } }))
  assert.equal(percent.unit, '%')
  assert.deepEqual(percent.categoryTotals, [50, 25, 25])
  assert.deepEqual(percent.values[0], [25, 25, 0], 'Rework: Berlin 1 of 4 rows, Leeds 1 of 4')
  assert.equal(percent.total, 100)
  assert.equal(valueText(small(), ins({ options: { percent: true, cumulative: true } })), 'Count of rows — running total, % of total')
  // Both need a measure that adds up: dropped for an average when read and when the measure changes.
  assert.equal(cleanOptions('bar', 'average', { cumulative: true, percent: true }), undefined)
  const changed = withType(small(), ins({ options: { cumulative: true, size: 'full' }, measure: 'average', value: 'c2' }), 'bar')
  assert.deepEqual(changed.options, { size: 'full' })
})

test('CHT-07, CHT-02: Minimum, Maximum and Distinct count, and a KPI — per category and over all rows (TC-CHT-07)', () => {
  const max = chartData(small(), ins({ measure: 'max', value: 'c2' }))
  assert.deepEqual(max.values.map((row) => row[0]), [40, 30, 10])
  assert.equal(max.total, 40)
  const min = chartData(small(), ins({ measure: 'min', value: 'c2', sort: 'label' }))
  assert.deepEqual(min.categories.map((bucket) => bucket.label), ['Scrap', 'Rework', 'Complaint'])
  assert.deepEqual(min.values.map((row) => row[0]), [30, 20, 10])
  assert.equal(min.total, 10)
  const distinct = chartData(small(), ins({ measure: 'distinct', value: 'c5' }))
  assert.deepEqual(distinct.values.map((row) => row[0]), [2, 1, 1], 'Rework: Berlin and Leeds')
  assert.equal(distinct.total, 3, 'Berlin, Leeds, Lyon over all rows')
  assert.equal(kpiData(small(), { ...base, type: 'kpi', category: '', measure: 'max', value: 'c2' }).total, 40)
  assert.deepEqual(measureColumns(small(), 'distinct').map((column) => column.id), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
  assert.deepEqual(measureColumns(small(), 'max').map((column) => column.id), ['c2', 'c6'])
  assert.deepEqual(measuresFor('pareto').map((measure) => measure.key), ['count', 'sum'])
  assert.match(insightProblems(small(), ins({ measure: 'max', value: 'c2', second: 'c5' }))[0], /a maximum cannot be stacked/)
  assert.match(insightProblems(small(), ins({ measure: 'max', value: 'c4' }))[0], /“Category” for the maximum is now a Dropdown column; it needs Number or Currency\./)
})

test('CHT-12: a Pareto — largest first, “Other” last, each share and the cumulative share up to 100% (TC-CHT-08)', () => {
  const data = chartData(small(), { ...base, type: 'pareto', category: 'c4', measure: 'sum', value: 'c2', sort: 'label', options: { top: 1 } })
  assert.deepEqual(data.categories.map((bucket) => bucket.label), ['Rework', 'Other'], 'Top 1 + Other; a Pareto is always largest first')
  assert.deepEqual(data.shares, [60, 40])
  assert.deepEqual(data.cumulative, [60, 100])
  assert.match(insightProblems(small(), { ...base, type: 'pareto', category: 'c4', measure: 'average', value: 'c2' }).join(' '), /A Pareto adds its categories up to 100%/)
  assert.deepEqual(withType(small(), ins({ measure: 'average', value: 'c2', second: 'c5' }), 'pareto'), { ...ins({ measure: 'sum', value: 'c2' }), type: 'pareto', second: '' }, 'no stack; an average becomes a sum')
})

test('CHT-10: the rows behind a bar, a stack, “Other” and a period are exactly the rows counted there (TC-CHT-09)', () => {
  const insight = ins({ measure: 'sum', value: 'c2', second: 'c5', options: { top: 1 } })
  const data = chartData(small(), insight)
  assert.deepEqual(drillRows(small(), insight, data, 0).map((row) => row.id), ['a', 'b'])
  assert.deepEqual(drillRows(small(), insight, data, 0, data.series.findIndex((bucket) => bucket.key === 'Leeds')).map((row) => row.id), ['b'])
  assert.deepEqual(drillRows(small(), insight, data, 1).map((row) => row.id), ['c', 'd'], '“Other”: the rows summed into it')
  const weeks = { ...base, type: 'line', category: 'c3', sort: 'label', options: { dateGroup: 'week' } }
  const byWeek = chartData(small(), weeks)
  assert.deepEqual(drillRows(small(), weeks, byWeek, byWeek.categories.findIndex((bucket) => bucket.key === '2026-W01')).map((row) => row.id), ['a'])
  assert.deepEqual(drillRows(small(), weeks, byWeek, 99), [])
})

test('CHT-08, CHT-09, CHT-13: options and colour pins are validated when read, written only when set, kept by the merge (TC-CHT-10)', () => {
  const [parsed] = parseInsights([{ id: 'i1', title: 'T', type: 'bar', category: 'c4', measure: 'sum', value: 'c2', sort: 'value', options: { orientation: 'vertical', dateGroup: 'fortnight', top: 500, cumulative: 'yes', percent: true, target: { value: 1200.5, label: '  Budget  for   2026 and beyond the next fifty characters' }, size: 'huge', extra: 1 } }])
  assert.deepEqual(parsed.options, { orientation: 'vertical', top: 50, percent: true, target: { value: 1200.5, label: 'Budget for 2026 and beyond the next fift' } }, 'unknown values dropped, Top N clamped, the label capped')
  assert.equal(parseInsights([{ id: 'i1', title: 'T', type: 'line', category: 'c3', measure: 'count', sort: 'label', options: { orientation: 'vertical', top: 5, target: { value: 'x' } } }])[0].options, undefined, 'options a type does not take, and a target that is not a number, are dropped')
  assert.equal(parseInsights([{ id: 'i1', title: 'T', type: 'radar', category: 'c4' }]).length, 0, 'an unknown type is dropped as before')
  assert.equal(parseInsights([{ id: 'k', title: 'K', type: 'kpi', category: 'c4', second: 'c5', measure: 'distinct', value: 'c5' }])[0].category, '', 'a KPI has no category')
  assert.deepEqual(parseColors({ Berlin: 3, Leeds: 0, Lyon: 6, ' Scrap ': 2.5, Rework: '1', Label: 5 }), { Berlin: 3, Label: 5 }, 'only the palette colours 1…5')
  assert.equal(parseColors([1, 2]), undefined)
  const file = { ...page(), rows: [], colors: { Berlin: 2, '': 1 }, insights: [{ ...ins({ options: { top: 5, size: 'full' } }), id: 'i1' }] }
  const text = serializeOnDemandPage(parseOnDemandPage(JSON.stringify(file), 'p'), { fill: false })
  const again = parseOnDemandPage(text, 'p')
  assert.deepEqual(again.colors, { Berlin: 2 })
  assert.deepEqual(again.insights[0].options, { top: 5, size: 'full' })
  assert.equal(serializeOnDemandPage(again, { fill: false }), text, 'round trip')
  // Colour pins are one entry in the merge: the later save's where both changed them; one save's change is kept.
  const baseText = serializeOnDemandPage({ ...again, colors: undefined }, { fill: false })
  const mine = serializeOnDemandPage({ ...again, colors: { Berlin: 4 } }, { fill: false })
  assert.deepEqual(parseOnDemandPage(mergeOnDemandText(baseText, mine, baseText, false), 'p').colors, { Berlin: 4 })
  assert.equal(insightError(small(), { ...ins({ options: { target: { value: Number.NaN, label: '' } } }) }), 'The target line needs a number.')
})

test('CHT-01, CHT-12, CHT-13: dashboard blocks take the same options — validated, written only when set, Pareto blocks, colours merged (TC-CHT-11)', () => {
  const raw = JSON.stringify({ schema: 1, kind: 'dashboard', id: 'd', tabs: [], filters: [], colors: { Scrap: 1, Bad: 9 }, blocks: [
    { id: 'b1', title: 'Pareto', type: 'pareto', source: 'page:p', category: 'c4', second: 'c5', measure: 'sum', value: 'c2', sort: 'label', options: { top: 3, size: 'full', target: { value: 5, label: '' } } },
    { id: 'b2', title: 'KPI', type: 'kpi', source: 'page:p', measure: 'min', value: 'c2', sort: 'value', options: { size: 'full' } },
    { id: 'b3', title: 'Old', type: 'bar', source: 'page:p', category: 'c4', measure: 'count', sort: 'value' },
  ] })
  const { dashboard, dropped } = parseDashboard(raw, 'd')
  assert.deepEqual(dropped, [])
  assert.deepEqual(dashboard.colors, { Scrap: 1 })
  assert.deepEqual([dashboard.blocks[0].second, dashboard.blocks[0].sort, dashboard.blocks[0].options], ['', 'value', { top: 3, size: 'full', target: { value: 5, label: '' } }])
  assert.equal(dashboard.blocks[1].measure, 'min')
  assert.equal(dashboard.blocks[1].options, undefined, 'a KPI tile takes no options')
  const text = serializeDashboard(dashboard)
  assert.equal(JSON.parse(text).blocks[2].options, undefined, 'a block without options is written as before')
  assert.equal(serializeDashboard(parseDashboard(text, 'd').dashboard), text)
  const plain = serializeDashboard({ ...dashboard, colors: undefined })
  assert.equal(/"colors"/.test(plain), false)
  assert.deepEqual(parseDashboard(mergeDashboardText(plain, plain, text, true), 'd').dashboard.colors, { Scrap: 1 }, 'their colours kept when mine did not change them')
  const dataset = { key: 'page:p', name: 'P', page: small() }
  const bar = withBlockType(dataset, { ...dashboard.blocks[0], type: 'pareto' }, 'bar')
  assert.deepEqual(bar.options, { top: 3, size: 'full', target: { value: 5, label: '' } })
  assert.equal(withBlockType(dataset, dashboard.blocks[0], 'kpi').options, undefined)
})
