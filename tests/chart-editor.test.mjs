import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { coloredColumnOf, editorCounts, editorTabsFor, filterError, firstErrorTab, splitProblems } from '../src/chartEditor.ts'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const chart = (change = {}) => ({ id: 'i1', title: 'Cost', type: 'bar', category: 'c1', second: '', measure: 'count', value: '', filters: [], sort: 'value', ...change })

test('CHT-70: the chart editor shows only the tabs the type takes — Narrative instead of Format and Elements, no Elements for a KPI or table, no Format for a Dashboard KPI (TC-CHT-58)', () => {
  assert.deepEqual(editorTabsFor('bar'), ['data', 'filters', 'format', 'elements'])
  assert.deepEqual(editorTabsFor('line'), ['data', 'filters', 'format', 'elements'])
  assert.deepEqual(editorTabsFor('pie'), ['data', 'filters', 'format', 'elements'])
  assert.deepEqual(editorTabsFor('pareto'), ['data', 'filters', 'format', 'elements'])
  assert.deepEqual(editorTabsFor('table'), ['data', 'filters', 'format'])
  assert.deepEqual(editorTabsFor('kpi'), ['data', 'filters', 'format'])
  assert.deepEqual(editorTabsFor('kpi', 'dashboard'), ['data', 'filters'])
  assert.deepEqual(editorTabsFor('narrative'), ['data', 'filters', 'narrative'])
  assert.deepEqual(editorTabsFor('narrative', 'dashboard'), ['data', 'filters', 'narrative'])
})

test('CHT-71: each tab counts its settings changed from the defaults; a chart as it was made counts none (TC-CHT-58)', () => {
  assert.deepEqual(editorCounts(chart(), undefined), { data: 0, filters: 0, format: 0, elements: 0, narrative: 0 })
  const filtered = chart({ filters: [{ column: 'c1', values: ['A'] }, { column: 'c4', from: '2026-01' }] })
  assert.equal(editorCounts(filtered, undefined).filters, 2)
  const formatted = chart({ second: 'c2', options: { orientation: 'vertical', grouping: 'grouped', target: { value: 10, label: '' }, size: 'full' } })
  assert.equal(editorCounts(formatted, undefined).format, 4, 'orientation, series, target line and the width')
  assert.equal(editorCounts(formatted, { Berlin: 2 }, ['Berlin', 'Leeds']).format, 5, 'a colour pin on a value the chart shows')
  assert.equal(editorCounts(formatted, { Paris: 2 }, ['Berlin', 'Leeds']).format, 4, 'a pin on a value it does not show is not counted')
  const elements = chart({ options: { elements: { legend: 'bottom', labels: true }, xTitle: 'Category' } })
  assert.equal(editorCounts(elements, undefined).elements, 3)
  assert.equal(editorCounts(elements, undefined).format, 0)
  assert.equal(editorCounts(chart({ type: 'kpi', options: { view: 'panel' } }), undefined).format, 1)
  const story = chart({ type: 'narrative', category: '', narrative: { auto: ['total', 'top'], rules: [{ metric: 'total', op: 'gt', value: 1, template: 'x', tone: 'info' }], period: 'c4' } })
  assert.deepEqual(editorCounts(story, undefined), { data: 0, filters: 0, format: 0, elements: 0, narrative: 2 }, 'a new narrative’s sentences count nothing; a rule and the period')
  assert.equal(editorCounts(chart({ type: 'narrative', narrative: { auto: ['total', 'change'], rules: [] } }), undefined).narrative, 2, 'Highest category unticked, Change ticked')
  assert.equal(coloredColumnOf({ type: 'pie', category: 'c1', second: '' }), 'c1')
  assert.equal(coloredColumnOf({ type: 'bar', category: 'c1', second: 'c2' }), 'c2')
  assert.equal(coloredColumnOf({ type: 'table', category: 'c1', second: 'c2' }), '')
})

test('CHT-72: an error belongs to its tab — the filters to Filters, the rest of the columns to Data — and Save opens the first tab with one (TC-CHT-58)', () => {
  assert.deepEqual(splitProblems(['The column for the categories is no longer on the page (removed).', 'A filter’s column is no longer on the page (removed).'], ['The column for the categories is no longer on the page (removed).']),
    { data: 'The column for the categories is no longer on the page (removed).', filters: 'A filter’s column is no longer on the page (removed).' })
  assert.deepEqual(splitProblems([], []), { data: '', filters: '' })
  const name = (id) => ({ c1: 'Category' })[id] ?? '?'
  assert.equal(filterError([{ column: 'c1' }], name), 'The filter on “Category” has nothing chosen: tick a value or give a month, or remove it.')
  assert.equal(filterError([{ column: 'c4', from: '2026-05', to: '2026-01' }], name), 'A date filter ends before it starts: check From and To.')
  assert.equal(filterError([{ column: 'c1', values: ['A'] }], name), '')
  assert.equal(firstErrorTab(['data', 'filters', 'format', 'elements'], { filters: 'x', format: 'y' }), 'filters')
  assert.equal(firstErrorTab(['data', 'filters', 'format'], { data: '', filters: '' }), undefined)
})

test('CHT-70, CHT-73: both chart pop-ups use the one tab component — a tablist with the arrow keys — the preview beside it and the buttons under it (TC-CHT-58)', () => {
  const tabs = read('src/components/EditorTabs.tsx')
  assert.match(tabs, /role="tablist"/)
  assert.match(tabs, /ArrowRight/)
  assert.match(tabs, /ArrowLeft/)
  assert.match(tabs, /tabIndex=\{active \? 0 : -1\}/, 'one tab in the Tab order')
  for (const file of ['src/pages/OnDemandInsights.tsx', 'src/components/DashboardBlocks.tsx']) {
    const source = read(file)
    assert.match(source, /<EditorTabs /, file)
    assert.match(source, /role="tabpanel"/, file)
    assert.match(source, /className="od-editor-footer"/, file)
    assert.doesNotMatch(source, /role="tablist"/, `${file} builds no tabs of its own`)
  }
  const css = read('src/fresh.css')
  assert.match(css, /\.od-insight-form>\.od-insight-editor\{[^}]*overflow:auto/, 'the form and preview scroll, the buttons stay')
  assert.match(css, /\.overview-tabs\.editor-tabs\{[^}]*overflow-x:auto/, 'the tab row scrolls sideways on a phone')
})
