import test from 'node:test'
import assert from 'node:assert/strict'
import { applyColumns, columnDrafts, conqPage, mergeOnDemandText, parseInsights, parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { aggregate, blankInsight, filterText, insightError, insightProblems, insightRules, insightSubject, monthLabel, noneKey, otherKey, withType } from '../src/onDemandInsights.ts'

const columns = [
  { id: 'c1', name: 'Topic', type: 'text', options: [], required: false },
  { id: 'c2', name: 'Cost', type: 'number', options: [], required: false },
  { id: 'c3', name: 'Found on', type: 'date', options: [], required: false },
  { id: 'c4', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'], required: false },
  { id: 'c5', name: 'Sites', type: 'multi', options: ['Berlin', 'Leeds', 'Lyon'], required: false },
]
const rows = [
  { id: 'r1', key: 'CONQ-260101-AAA2', seq: 1, cells: { c1: 'Label', c2: '100', c3: '2026-01-10', c4: 'Rework', c5: ['Berlin', 'Lyon'] } },
  { id: 'r2', key: 'CONQ-260101-AAA3', seq: 2, cells: { c1: 'Late', c2: '50', c3: '2026-01-20', c4: 'Scrap', c5: ['Leeds'] } },
  { id: 'r3', key: 'CONQ-260101-AAA4', seq: 3, cells: { c1: 'Seal', c2: '30', c3: '2026-03-05', c4: 'Rework', c5: ['Berlin'] } },
  { id: 'r4', key: 'CONQ-260101-AAA5', seq: 4, cells: { c1: 'Odd', c3: 'soon', c4: 'Retired option' } }, // no cost, not a date, not in the list, no site
  { id: 'r5', key: 'CONQ-260101-AAA6', seq: 5, cells: { c2: '20', c4: 'Complaint', c5: ['Lyon', 'Gone'] } },
]
const page = () => ({ ...conqPage(), columns: structuredClone(columns), rows: structuredClone(rows) })
const insight = (fields) => ({ ...blankInsight(page(), 'i1'), title: 'T', ...fields })
const labels = (data) => data.categories.map((bucket) => bucket.label)

test('OND-13: Count, Sum and Average by a Dropdown — largest first, “(none)” for a value not in the list or empty, rows without a number left out (TC-OND-10)', () => {
  const count = aggregate(page(), insight({ category: 'c4' }))
  assert.deepEqual(labels(count), ['Rework', 'Scrap', 'Complaint', '(none)'], 'largest first; ties in option order; (none) last')
  assert.deepEqual(count.values.map((row) => row[0]), [2, 1, 1, 1])
  assert.equal(count.total, 5)
  const sum = aggregate(page(), insight({ category: 'c4', measure: 'sum', value: 'c2' }))
  assert.deepEqual(labels(sum), ['Rework', 'Scrap', 'Complaint'])
  assert.deepEqual(sum.values.map((row) => row[0]), [130, 50, 20])
  assert.equal(sum.total, 200)
  assert.deepEqual([sum.rows.all, sum.rows.used, sum.rows.noNumber], [5, 4, 1])
  const average = aggregate(page(), insight({ category: 'c4', measure: 'average', value: 'c2', sort: 'label' }))
  assert.deepEqual(labels(average), ['Scrap', 'Rework', 'Complaint'], 'sort by label: the option order')
  assert.deepEqual(average.values.map((row) => row[0]), [50, 65, 20])
  assert.equal(average.total, 50)
})

test('OND-13: a Multi-select row counts once in each of its values; totals take each row once; a value not in the list goes to “(none)” (TC-OND-10)', () => {
  const data = aggregate(page(), insight({ category: 'c5', sort: 'label' }))
  assert.deepEqual(labels(data), ['Berlin', 'Leeds', 'Lyon', '(none)'])
  assert.deepEqual(data.values.map((row) => row[0]), [2, 1, 2, 2], 'r5 counts in Lyon and in (none) for “Gone”; r4 has no site')
  assert.equal(data.total, 5, 'the total counts each row once')
  assert.equal(data.rows.multi, true)
  const sum = aggregate(page(), insight({ category: 'c5', measure: 'sum', value: 'c2' }))
  assert.deepEqual(sum.categories.map((bucket, index) => [bucket.label, sum.values[index][0]]), [['Berlin', 130], ['Lyon', 120], ['Leeds', 50], ['(none)', 20]])
  assert.equal(sum.total, 200)
  assert.match(insightRules(page(), insight({ category: 'c5' })).join(' '), /counts once in each of them/)
})

test('OND-13: stacking by a second field and the pivot totals — cells per category × series, totals per row, per column and overall (TC-OND-10)', () => {
  const data = aggregate(page(), insight({ type: 'table', category: 'c4', second: 'c5', measure: 'sum', value: 'c2', sort: 'label' }))
  assert.deepEqual(labels(data), ['Scrap', 'Rework', 'Complaint'])
  assert.deepEqual(data.series.map((bucket) => bucket.label), ['Berlin', 'Leeds', 'Lyon', '(none)'])
  assert.deepEqual(data.values, [[0, 50, 0, 0], [130, 0, 100, 0], [0, 0, 20, 20]])
  assert.deepEqual(data.categoryTotals, [50, 130, 20], 'each row once per category')
  assert.deepEqual(data.seriesTotals, [130, 50, 120, 20])
  assert.equal(data.total, 200)
  // Average in a pivot: the average of the rows of each cell, each total over its rows.
  const average = aggregate(page(), insight({ type: 'table', category: 'c4', second: 'c5', measure: 'average', value: 'c2', sort: 'label' }))
  assert.deepEqual(average.values[1], [65, null, 100, null])
  assert.deepEqual(average.categoryTotals, [50, 65, 20])
})

test('OND-13: a Date column in months — a line over time fills every month from the first to the last and leaves rows without a date out (TC-OND-10)', () => {
  const data = aggregate(page(), insight({ type: 'line', category: 'c3', measure: 'sum', value: 'c2' }))
  assert.deepEqual(data.categories.map((bucket) => bucket.key), ['2026-01', '2026-02', '2026-03'])
  assert.deepEqual(labels(data), ['Jan 2026', 'Feb 2026', 'Mar 2026'])
  assert.deepEqual(data.values.map((row) => row[0]), [150, 0, 30])
  assert.equal(data.rows.noDate, 1, 'r5 has a cost but no date')
  const average = aggregate(page(), insight({ type: 'line', category: 'c3', measure: 'average', value: 'c2' }))
  assert.deepEqual(average.values.map((row) => row[0]), [75, null, 30], 'a month without rows has no average')
  const bars = aggregate(page(), insight({ type: 'bar', category: 'c3', sort: 'label' }))
  assert.deepEqual(labels(bars), ['Jan 2026', 'Mar 2026', '(none)'], 'a bar by Date groups by month; no date: (none)')
  assert.equal(monthLabel('2026-11'), 'Nov 2026')
})

test('OND-14: filters — a Dropdown / Multi-select value set (with “(none)”) and a Date range from / to month, all applied, stated under the title (TC-OND-10)', () => {
  const p = page()
  const byValue = aggregate(p, insight({ category: 'c4', filters: [{ column: 'c5', values: ['Lyon'] }] }))
  assert.equal(byValue.rows.matched, 2, 'r1 and r5 have Lyon')
  const withNone = aggregate(p, insight({ category: 'c4', filters: [{ column: 'c4', values: [noneKey, 'Scrap'] }] }))
  assert.deepEqual(labels(withNone), ['Scrap', '(none)'])
  const range = aggregate(p, insight({ category: 'c4', filters: [{ column: 'c3', from: '2026-02', to: '2026-03' }] }))
  assert.equal(range.rows.matched, 1, 'only r3; rows without a date fail a date filter')
  const open = aggregate(p, insight({ category: 'c4', filters: [{ column: 'c3', to: '2026-01' }, { column: 'c4', values: ['Rework'] }] }))
  assert.equal(open.rows.matched, 1, 'both filters apply')
  assert.equal(filterText(p, insight({ filters: [{ column: 'c4', values: ['Scrap', noneKey] }, { column: 'c3', from: '2026-01', to: '2026-06' }] })), 'Category: Scrap, (none) · Found on: Jan 2026 – Jun 2026')
  assert.equal(filterText(p, insight({})), 'All rows')
  assert.equal(insightSubject(p, insight({ type: 'bar', category: 'c4', second: 'c5', measure: 'sum', value: 'c2' })), 'Sum of Cost by Category, stacked by Sites')
})

test('OND-12: a pie keeps the 5 largest categories and puts the rest, with “(none)”, in “Other”; stacks keep 5 series (TC-OND-14)', () => {
  const many = { ...page(), columns: [...structuredClone(columns), { id: 'c6', name: 'Line', type: 'text', options: [], required: false }], rows: ['A', 'A', 'A', 'B', 'B', 'C', 'D', 'E', 'F', 'G', ''].map((value, index) => ({ id: `x${index}`, cells: value ? { c6: value, c2: '1' } : { c2: '1' } })) }
  const pie = aggregate(many, insight({ type: 'pie', category: 'c6' }), { maxCategories: 5 })
  assert.deepEqual(labels(pie), ['A', 'B', 'C', 'D', 'E', 'Other'])
  assert.equal(pie.categories.at(-1).key, otherKey)
  assert.deepEqual(pie.values.map((row) => row[0]), [3, 2, 1, 1, 1, 3], 'F, G and the empty row in Other')
  const few = aggregate(page(), insight({ type: 'pie', category: 'c4' }), { maxCategories: 5 })
  assert.equal(few.categories.some((bucket) => bucket.key === otherKey), false, 'no Other with 5 or fewer')
})

test('OND-17: a removed column, a changed type or a forbidden combination shows a clear message instead of a chart; a renamed column is followed (TC-OND-12)', () => {
  const p = page()
  const bar = insight({ category: 'c4', second: 'c5', measure: 'sum', value: 'c2', filters: [{ column: 'c3', from: '2026-01' }] })
  assert.deepEqual(insightProblems(p, bar), [])
  const drafts = columnDrafts(p.columns)
  drafts[3].name = 'Kind' // rename Category
  const renamed = applyColumns(p, drafts)
  assert.deepEqual(insightProblems(renamed, bar), [])
  assert.equal(insightSubject(renamed, bar), 'Sum of Cost by Kind, stacked by Sites')
  const removed = applyColumns(p, drafts.filter((draft) => draft.id !== 'c2' && draft.id !== 'c3'))
  assert.deepEqual(insightProblems(removed, bar), ['The column for the sum is no longer on the page (removed).', 'A filter’s column is no longer on the page (removed).'])
  const retyped = applyColumns(p, drafts.map((draft) => draft.id === 'c5' ? { ...draft, type: 'text' } : draft))
  assert.deepEqual(insightProblems(retyped, bar), ['“Sites” for the stacks is now a Text column; it needs Dropdown or Multi-select.'])
  assert.match(insightProblems(p, insight({ type: 'pie', category: 'c4', measure: 'average', value: 'c2' })).join(' '), /pie shows shares/)
  assert.match(insightProblems(p, insight({ type: 'bar', category: 'c4', second: 'c5', measure: 'average', value: 'c2' })).join(' '), /cannot be stacked/)
  assert.match(insightProblems(p, insight({ type: 'line', category: 'c4' })).join(' '), /“Category” for the months is now a Dropdown column; it needs Date/)
  assert.equal(insightError(p, insight({ title: ' ' })), 'Give the chart or table a title.')
  const empty = aggregate(removed, bar)
  assert.deepEqual(empty.categories.length >= 0, true, 'aggregate does not fail on a broken insight')
  // Changing the type in the pop-up keeps what fits.
  assert.deepEqual([withType(p, bar, 'line').category, withType(p, bar, 'line').second, withType(p, bar, 'line').sort], ['c3', 'c5', 'label'])
  assert.deepEqual([withType(p, insight({ measure: 'average', value: 'c2' }), 'pie').measure, withType(p, bar, 'pie').second], ['sum', ''])
})

test('OND-16: insights in the page file — written only when there are, validated on read (unknown types and bad ids dropped, broken references kept), merged by id (TC-OND-11)', () => {
  const p = page()
  assert.equal(serializeOnDemandPage(p).includes('"insights"'), false, 'a page without insights is written as before')
  const withInsights = { ...p, insights: [insight({ id: 'i1', title: 'Cost by category', category: 'c4', measure: 'sum', value: 'c2', filters: [{ column: 'c3', from: '2026-01' }] }), insight({ id: 'i2', title: 'Pivot', type: 'table', category: 'c4', second: 'c5' })] }
  const text = serializeOnDemandPage(withInsights)
  assert.deepEqual(parseOnDemandPage(text, 'conq'), withInsights, 'round trip')
  assert.deepEqual(JSON.parse(text).insights[0], { id: 'i1', title: 'Cost by category', type: 'bar', category: 'c4', measure: 'sum', value: 'c2', filters: [{ column: 'c3', from: '2026-01' }], sort: 'value' })
  const read = parseInsights([
    { id: 'a', title: '  Spaced   title ', type: 'pie', category: 'c4', second: 'c5', measure: 'average', value: 'c2', sort: 'label' },
    { id: 'b', title: 'Radar', type: 'radar', category: 'c4' }, // unknown type: dropped
    { id: 'a', title: 'twice', type: 'bar' }, { id: '../x', type: 'bar' }, null, 'text',
    { id: 'c', type: 'line', category: 'gone', measure: 'median', value: 'c2', sort: 'value', filters: [{ column: 'c4', values: ['Scrap', 3, ''] }, { column: 'c3', from: '2026-13', to: '2026-05' }, { column: 'c4' }, { values: ['x'] }] },
  ])
  assert.deepEqual(read, [
    { id: 'a', title: 'Spaced title', type: 'pie', category: 'c4', second: '', measure: 'average', value: 'c2', filters: [], sort: 'label' },
    { id: 'c', title: 'Untitled', type: 'line', category: 'gone', second: '', measure: 'count', value: '', filters: [{ column: 'c4', values: ['Scrap', ''] }, { column: 'c3', to: '2026-05' }], sort: 'label' },
  ])
  assert.match(insightProblems(p, read[1]).join(' '), /no longer on the page/, 'a bad reference is kept and shown as broken')
  assert.deepEqual(parseInsights('nope'), [])
  // Merge: by id, the later save wins for an insight both changed; added on both sides kept; a removal stays.
  const base = serializeOnDemandPage(withInsights)
  const mine = serializeOnDemandPage({ ...withInsights, insights: [{ ...withInsights.insights[0], title: 'Mine' }, withInsights.insights[1], insight({ id: 'i3', title: 'Added by me' })] })
  const theirs = serializeOnDemandPage({ ...withInsights, insights: [{ ...withInsights.insights[0], title: 'Theirs' }, insight({ id: 'i4', title: 'Added by them' })] })
  const merged = parseOnDemandPage(mergeOnDemandText(base, mine, theirs, true), 'conq')
  assert.deepEqual(merged.insights.map((entry) => [entry.id, entry.title]), [['i1', 'Mine'], ['i3', 'Added by me'], ['i4', 'Added by them']], 'i2 removed by them and not changed by me stays removed')
  const theirsLater = parseOnDemandPage(mergeOnDemandText(base, mine, theirs, false), 'conq')
  assert.equal(theirsLater.insights.find((entry) => entry.id === 'i1').title, 'Theirs')
  // A save of the rows only keeps the insights someone else added meanwhile.
  const rowsOnly = serializeOnDemandPage({ ...withInsights, rows: withInsights.rows.slice(1) })
  const added = serializeOnDemandPage({ ...withInsights, insights: [...withInsights.insights, insight({ id: 'i5', title: 'New' })] })
  assert.deepEqual(parseOnDemandPage(mergeOnDemandText(base, rowsOnly, added, true), 'conq').insights.map((entry) => entry.id), ['i1', 'i2', 'i5'])
})
