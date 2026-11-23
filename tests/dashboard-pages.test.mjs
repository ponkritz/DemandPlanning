import test from 'node:test'
import assert from 'node:assert/strict'
import { blankBlock, blockError, blockProblems, blockData, emptyDashboard, kpiValue, maxBlocks, mergeDashboardText, moveBlock, narrowRows, noData, pageDataset, parseDashboard, removeBlock, serializeDashboard, setTabsAndFilters, summaryCsv, summaryRows, tabsError, upsertBlock, withBlockType, dataSources, sourcePattern, pageSource } from '../src/dashboardPages.ts'
import { emptyLayout, isDashboard, kindLabel, kindOf, pageKinds, pageRights, placePage } from '../src/menuLayout.ts'
import { periodMonths } from '../src/dashboard.ts'
import { fileLabel } from '../src/gitWatch.ts'

const issues = {
  schema: 1, kind: 'on-demand-page', id: 'supplier-issues', name: 'Supplier issues', description: '', keyPrefix: 'SUPPLIER', insights: [],
  columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Delay'], required: false }, { id: 'c2', name: 'Cost', type: 'currency', currency: 'EUR', options: [], required: false }, { id: 'c3', name: 'Found on', type: 'date', options: [], required: false }, { id: 'c4', name: 'Site', type: 'dropdown', options: ['India', 'US'], required: false }],
  rows: [
    { id: 'r1', cells: { c1: 'Scrap', c2: '1200 EUR', c3: '2026-02-10', c4: 'India' } },
    { id: 'r2', cells: { c1: 'Scrap', c2: '300 EUR', c3: '2026-05-03', c4: 'US' } },
    { id: 'r3', cells: { c1: 'Rework', c2: '450 EUR', c3: '2026-05-20', c4: 'India' } },
    { id: 'r4', cells: { c1: 'Delay', c2: '80 USD', c3: '2026-09-01', c4: 'US' } },
    { id: 'r5', cells: { c1: 'Rework', c2: '999 EUR', c3: '2025-11-15', c4: 'India' } },
    { id: 'r6', cells: { c1: 'Delay', c2: '50 EUR' } },
  ],
}
const data = pageDataset(issues)
const block = (change = {}) => ({ id: 'b1', title: 'Issues', type: 'kpi', source: 'page:supplier-issues', category: '', second: '', measure: 'count', value: '', filters: [], sort: 'value', period: 'c3', tab: '', ...change })
const file = (blocks, extra = {}) => JSON.stringify({ schema: 1, kind: 'dashboard', id: 'quality', tabs: [], filters: [], blocks, ...extra })

test('DSH-01: On-Demand Dashboard is a page type of the page builder; a dashboard page is never a data source (TC-DSH-02)', () => {
  assert.deepEqual(pageKinds.map((kind) => kind.label), ['Table', 'Table + Insights', 'On-Demand Dashboard'])
  const layout = placePage(emptyLayout(), 'quality', { type: 'dashboard', group: 'on-demand' })
  assert.equal(kindOf(layout, 'quality'), 'dashboard')
  assert.equal(kindLabel('dashboard'), 'On-Demand Dashboard')
  assert.equal(isDashboard(layout, 'quality'), true)
  assert.equal(isDashboard(layout, 'conq'), false)
  assert.equal(kindOf(placePage(emptyLayout(), 'odd', { type: 'release-stream' }), 'odd'), 'table-insights', 'a later kind is still shown as Table + Insights')
  assert.equal(fileLabel('data/dashboards/quality.json', 'data/planning-data.json'), 'Dashboard quality')
})

test('DSH-08: the dashboard file is validated when read — a file that is not a dashboard refused whole, bad blocks dropped with a message, caps (TC-DSH-03)', () => {
  for (const bad of ['not json', '[]', JSON.stringify({ schema: 1, kind: 'on-demand-page', blocks: [] }), JSON.stringify({ schema: 2, kind: 'dashboard', blocks: [] }), JSON.stringify({ schema: 1, kind: 'menu-layout' })]) assert.throws(() => parseDashboard(bad, 'quality'), /dashboards\/quality\.json is not/)
  const { dashboard, dropped } = parseDashboard(file([
    block(), block({ id: 'b2', type: 'gauge', title: 'Gauge' }), block({ id: 'b1', title: 'Twice' }), block({ id: 'b3', title: '  ' }), block({ id: 'b4', source: 'http://evil.example' }), block({ id: 'b6', title: 'Hours', source: 'tw:people' }),
    block({ id: 'b5', type: 'pie', title: 'Share', category: 'c4', second: 'c1', measure: 'average', value: 'c2', tab: 'gone' }),
  ], { tabs: [{ id: 't1', name: 'Overview' }, { id: 't1', name: 'Again' }], filters: [{ id: 'f1', source: 'page:supplier-issues', column: 'c4' }, { id: 'f2', source: 'tw:other', column: 'x' }] }), 'quality')
  assert.deepEqual(dashboard.blocks.map((entry) => entry.id), ['b1', 'b5'])
  assert.equal(dropped.length, 7, dropped.join(' | '))
  assert.match(dropped.join(' '), /“Gauge” has an unknown type \(gauge\): left out\./)
  assert.match(dropped.join(' '), /“Twice” has no valid id, or the id of another block/)
  assert.match(dropped.join(' '), /“Hours” has no known data source: left out\./, 'only table pages are data sources (DSH-04)')
  assert.deepEqual(dashboard.blocks[1], { id: 'b5', title: 'Share', type: 'pie', source: 'page:supplier-issues', category: 'c4', second: '', measure: 'average', value: 'c2', filters: [], sort: 'value', period: 'c3', tab: '' }, 'a pie has no second field; a tab that is not there is dropped')
  assert.deepEqual(dashboard.tabs, [{ id: 't1', name: 'Overview' }])
  assert.deepEqual(dashboard.filters, [{ id: 'f1', source: 'page:supplier-issues', column: 'c4' }])
  const many = parseDashboard(file(Array.from({ length: 45 }, (_, index) => block({ id: `b${index}` }))), 'quality')
  assert.equal(many.dashboard.blocks.length, maxBlocks)
  assert.match(many.dropped.join(' '), /Only the first 40 blocks are shown \(45 in the file\)/)
  const text = serializeDashboard(dashboard)
  assert.equal(serializeDashboard(parseDashboard(text, 'quality').dashboard), text, 'written and read back unchanged')
  assert.equal(parseDashboard(text, 'other').dashboard.id, 'other', 'the file name wins over the id inside')
  assert.throws(() => upsertBlock(many.dashboard, block({ id: 'new' })), /at most 40 blocks/)
})

test('DSH-08, GIT-17: two saves of a dashboard are merged by block — fields three ways, the later save where both changed, removal against change by time (TC-DSH-04)', () => {
  const base = serializeDashboard(parseDashboard(file([block(), block({ id: 'b2', title: 'Bars', type: 'bar', category: 'c1' }), block({ id: 'b3', title: 'Table', type: 'table', category: 'c1' })]), 'quality').dashboard)
  const read = (text) => parseDashboard(text, 'quality').dashboard
  const edit = (change) => serializeDashboard(change(read(base)))
  // Mine renames b1 and adds b4; theirs changes b1's measure and removes b3 (untouched here): both kept, b3 removed.
  const mine = edit((d) => upsertBlock({ ...d, blocks: d.blocks.map((entry) => entry.id === 'b1' ? { ...entry, title: 'All issues' } : entry) }, block({ id: 'b4', title: 'New' })))
  const theirs = edit((d) => removeBlock({ ...d, blocks: d.blocks.map((entry) => entry.id === 'b1' ? { ...entry, measure: 'sum', value: 'c2' } : entry) }, 'b3'))
  let merged = read(mergeDashboardText(base, mine, theirs, true))
  assert.deepEqual(merged.blocks.map((entry) => entry.id), ['b1', 'b2', 'b4'])
  assert.deepEqual([merged.blocks[0].title, merged.blocks[0].measure, merged.blocks[0].value], ['All issues', 'sum', 'c2'])
  // Both changed the same field: the later save wins.
  const a = edit((d) => ({ ...d, blocks: d.blocks.map((entry) => entry.id === 'b2' ? { ...entry, title: 'Mine' } : entry) }))
  const b = edit((d) => ({ ...d, blocks: d.blocks.map((entry) => entry.id === 'b2' ? { ...entry, title: 'Theirs' } : entry) }))
  assert.equal(read(mergeDashboardText(base, a, b, true)).blocks[1].title, 'Mine')
  assert.equal(read(mergeDashboardText(base, a, b, false)).blocks[1].title, 'Theirs')
  // Removed by one, changed by the other: the later save wins.
  const removed = edit((d) => removeBlock(d, 'b2'))
  assert.deepEqual(read(mergeDashboardText(base, removed, b, true)).blocks.map((entry) => entry.id), ['b1', 'b3'])
  assert.deepEqual(read(mergeDashboardText(base, removed, b, false)).blocks.map((entry) => entry.id), ['b1', 'b2', 'b3'])
  // The order follows the save that changed it; without a base every block of both stays.
  const moved = edit((d) => moveBlock(d, 'b3', -1))
  merged = read(mergeDashboardText(base, moved, theirs, true))
  assert.deepEqual(merged.blocks.map((entry) => entry.id), ['b1', 'b2'], 'b3 removed by theirs, only moved by mine (no field change): removed')
  assert.deepEqual(read(mergeDashboardText(null, mine, theirs, true)).blocks.map((entry) => entry.id).sort(), ['b1', 'b2', 'b3', 'b4'])
  // A tab removed by one save: the other's blocks on it go to the first tab.
  const tabbed = serializeDashboard(setTabsAndFilters(read(base), [{ id: 't1', name: 'One' }, { id: 't2', name: 'Two' }], []))
  const onTwo = serializeDashboard(upsertBlock(read(tabbed), { ...read(tabbed).blocks[1], tab: 't2' }))
  const noTwo = serializeDashboard(setTabsAndFilters(read(tabbed), [{ id: 't1', name: 'One' }], []))
  assert.equal(read(mergeDashboardText(tabbed, onTwo, noTwo, false)).blocks[1].tab, '')
  assert.equal(mergeDashboardText(base, 'not json', theirs, true), 'not json', 'an unreadable save is written as it is')
})

test('DSH-07: the period keeps the rows whose month is in it; rows without a date are counted apart; the filter row narrows its source (TC-DSH-05)', () => {
  const months = periodMonths({ years: [], quarters: [], months: [] }, 2026)
  assert.equal(months.length, 12, 'nothing ticked: the current year')
  let narrowed = narrowRows(data, block(), months)
  assert.deepEqual(narrowed.page.rows.map((row) => row.id), ['r1', 'r2', 'r3', 'r4'])
  assert.deepEqual([narrowed.all, narrowed.outside, narrowed.noDate, narrowed.byPeriod], [6, 1, 1, true])
  narrowed = narrowRows(data, block(), periodMonths({ years: [2026], quarters: ['2026-Q2'], months: [] }, 2026))
  assert.deepEqual(narrowed.page.rows.map((row) => row.id), ['r2', 'r3'])
  narrowed = narrowRows(data, block({ period: '' }), months)
  assert.equal(narrowed.page.rows.length, 6, 'a block without a period column is not filtered by the period')
  const filters = [{ id: 'f1', source: 'page:supplier-issues', column: 'c4' }, { id: 'f2', source: 'page:other-page', column: 'c4' }]
  narrowed = narrowRows(data, block(), months, filters, { f1: ['US'], f2: ['India'] })
  assert.deepEqual(narrowed.page.rows.map((row) => row.id), ['r2', 'r4'], 'only the filter of this source applies')
  assert.equal(narrowed.filtered, 2)
  assert.equal(noData.title, 'No data for this selection.')
})

test('DSH-05: KPI tiles, charts and summary tables aggregate as the On-Demand insights — one currency at a time, largest first (TC-DSH-06)', () => {
  const months = periodMonths({ years: [], quarters: [], months: [] }, 2026)
  const rows = narrowRows(data, block(), months).page
  assert.equal(kpiValue(rows, block()).value, 4)
  const cost = kpiValue(rows, block({ measure: 'sum', value: 'c2' }))
  assert.deepEqual([cost.value, cost.currency, cost.otherCurrency], [1950, 'EUR', 1], 'EUR (3 rows) first; the USD row is left out, not added')
  assert.equal(kpiValue(rows, block({ measure: 'sum', value: 'c2' }), 'USD').value, 80)
  assert.equal(kpiValue(rows, block({ measure: 'average', value: 'c2' })).value, 650)
  assert.equal(kpiValue({ ...rows, rows: [] }, block({ measure: 'average', value: 'c2' })).value, null)
  const table = block({ id: 't', type: 'table', category: 'c1', measure: 'sum', value: 'c2' })
  const result = blockData(rows, table)
  const lines = summaryRows(result)
  assert.deepEqual(lines.map((line) => [line.label, line.total]), [['Scrap', 1500], ['Rework', 450]])
  assert.equal(result.total, 1950)
  const csv = summaryCsv(['Category', 'Sum of Cost (EUR)'], [...lines, { key: 'x', label: '=HYPERLINK("x")', values: [1], total: 1, rank: 0 }])
  assert.match(csv, /^Category,Sum of Cost \(EUR\)\r\nScrap,1500\r\nRework,450\r\n"'=HYPERLINK\(""x""\)",1$/, 'a formula-like value is neutralised')
  const bars = blockData(rows, block({ id: 'bars', type: 'bar', category: 'c1' }))
  assert.deepEqual(bars.categories.map((cat) => cat.label), ['Scrap', 'Rework', 'Delay'], 'largest first, ties in option order')
})

test('DSH-05, DSH-06: the block editor — a blank block, a type change, the checks before Add block and broken references (TC-DSH-07)', () => {
  const fresh = blankBlock(data, 'b9', 'bar')
  assert.deepEqual([fresh.category, fresh.period, fresh.measure], ['c1', 'c3', 'count'], 'the first column that fits; the first Date column for the period')
  assert.equal(blockError(data, fresh), 'Give the block a title.')
  const line = withBlockType(data, { ...fresh, title: 'Per month' }, 'line')
  assert.deepEqual([line.category, line.sort], ['c3', 'label'])
  assert.equal(blockError(data, line), '')
  const kpi = withBlockType(data, line, 'kpi')
  assert.deepEqual([kpi.category, kpi.second], ['', ''])
  assert.equal(blockError(data, { ...kpi, filters: [{ column: 'c1' }] }), 'The filter on “Category” has nothing chosen: tick a value or give a month, or remove it.')
  assert.deepEqual(blockProblems(data, block({ measure: 'sum', value: 'gone', period: 'c1' })), ['The column for the sum is no longer on the page (removed).', '“Category” for the period is now a dropdown column; it needs a Date column.'])
  const missing = { key: 'page:gone', name: 'gone', page: { ...issues, columns: [], rows: [] }, problem: 'The table page “gone” is no longer there (removed), or you cannot see it.' }
  assert.deepEqual(blockProblems(missing, block({ source: 'page:gone' })), [missing.problem])
  assert.equal(tabsError([{ id: 't1', name: 'One' }, { id: 't2', name: ' one ' }]), 'Two tabs are named “One”.')
  assert.equal(tabsError([{ id: 't1', name: '' }]), 'Give every tab a name.')
  assert.deepEqual(emptyDashboard('x').blocks, [])
})

test('DSH-03, DSH-04: the data sources are the table pages as saved in Git — not dashboards, not the page itself, not unsaved changes (TC-DSH-08)', () => {
  const draft = { ...issues, rows: [] }
  const audit = { ...issues, id: 'audit-log', name: 'Audit log' }
  const quality = { ...issues, id: 'quality', name: 'Quality dashboard', columns: [], rows: [] }
  const unsaved = { ...issues, id: 'unsaved', name: 'Unsaved' }
  const saved = { 'supplier-issues': issues, 'audit-log': audit, quality }
  const sources = dataSources([draft, audit, quality, unsaved], (id) => saved[id] ?? null, (id) => id === 'quality', 'self')
  assert.deepEqual(sources.map((source) => [source.key, source.name]), [['page:audit-log', 'Audit log'], ['page:supplier-issues', 'Supplier issues']])
  assert.equal(sources[1].page.rows.length, 6, 'the rows as saved in Git, not the draft')
  assert.equal(sourcePattern.test('tw:people'), false)
  assert.equal(sourcePattern.test(pageSource('supplier-issues')), true)
  assert.deepEqual(dataSources([issues], (id) => saved[id], () => false, 'supplier-issues'), [], 'a page is not its own source')
})

test('DSH-09: whoever may set up the page builds its dashboard — fail closed without the roles file (TC-DSH-09)', () => {
  const layout = placePage(emptyLayout(), 'quality', { type: 'dashboard', group: 'on-demand', owners: ['page.keeper@example.com'] })
  const viewer = (email, actions = [], readOnly = false) => ({ email, can: (action) => actions.includes(action), readOnly, manager: false })
  assert.equal(pageRights(viewer('page.keeper@example.com'), layout, 'quality').setup, true)
  assert.equal(pageRights(viewer('someone@example.com'), layout, 'quality').setup, false)
  assert.equal(pageRights(viewer('someone@example.com', ['ondemand.setup']), layout, 'quality').setup, true)
  assert.equal(pageRights(viewer('page.keeper@example.com', ['ondemand.setup'], true), layout, 'quality').setup, false)
})
