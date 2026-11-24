import test from 'node:test'
import assert from 'node:assert/strict'
import { barLabelAt, chartKind, cleanElements, contentsFor, dataTableModel, defaultContent, defaultGridlines, defaultLegend, defaultPosition, fitText, inside, keepApart, labelNumber, labelPercent, labelPositions, labelText, linearTrend, lineLabelAt, minorTicks, pieLabels, resolveElements, trendLines, trendName, withElement } from '../src/chartElements.ts'
import { cleanOptions, parseInsights, parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { parseDashboard, serializeDashboard } from '../src/dashboardPages.ts'

// CHT-26…CHT-39 Excel-style chart elements (defaults, validation, label positions, trendline maths, data table) and the
// KPI card view option.

const kinds = ['bar', 'column', 'pareto', 'line', 'pie']

test('CHT-35: without elements every chart resolves to what it drew before — and a file without them is written byte for byte as before (TC-CHT-22)', () => {
  assert.equal(chartKind('bar'), 'bar'); assert.equal(chartKind('bar', 'vertical'), 'column'); assert.equal(chartKind('kpi'), null); assert.equal(chartKind('table'), null)
  for (const kind of kinds) {
    const el = resolveElements(kind, undefined)
    assert.equal(el.plain, true, `${kind}: labels as before`)
    assert.deepEqual([el.title, el.axisX, el.axisY, el.titleX, el.titleY, el.dataTable, el.trendline, el.labels], [true, true, true, true, true, false, false, undefined])
    assert.equal(el.legend, kind === 'pie' ? 'right' : 'top')
    assert.deepEqual(Object.entries(el.grid).filter(([, on]) => on).map(([key]) => key), kind === 'bar' ? ['majorV'] : kind === 'pie' ? [] : ['majorH'])
  }
  assert.equal(resolveElements('bar', undefined, { stacked: true }).position, 'center', 'stacked: segment labels centred, as before')
  assert.equal(resolveElements('bar', undefined).position, 'outsideEnd')
  assert.equal(resolveElements('line', undefined).position, 'above')
  assert.equal(resolveElements('pie', undefined).position, 'center')
  assert.deepEqual(resolveElements('pie', undefined).content, ['percent'])
  assert.deepEqual(resolveElements('column', undefined, { percent: true }).content, ['percent'], 'Percent of total showed the share')
  // An insight without elements keeps its options and file exactly.
  const columns = [{ id: 'c1', name: 'Topic', type: 'dropdown', options: ['A', 'B'], required: false }]
  const page = { schema: 1, kind: 'on-demand-page', id: 'p', name: 'P', description: '', keyPrefix: 'P', columns, rows: [], insights: [{ id: 'i1', title: 'T', type: 'bar', category: 'c1', second: '', measure: 'count', value: '', filters: [], sort: 'value', options: { top: 5 } }] }
  const text = serializeOnDemandPage(page)
  assert.equal(text.includes('elements'), false)
  assert.equal(serializeOnDemandPage(parseOnDemandPage(text, 'p')), text)
  // Elements set to their defaults are not written either.
  assert.equal(cleanElements('bar', undefined, { legend: 'top', position: 'outsideEnd', gridlines: ['majorV'], content: ['value'] }), undefined)
  assert.equal(cleanElements('pie', undefined, { legend: 'right', position: 'center', content: ['percent'] }), undefined)
  assert.deepEqual(cleanOptions('bar', 'count', { elements: {} }), undefined)
})

test('CHT-35: options.elements is validated when read — unknown keys and values dropped, elements the type does not take dropped (TC-CHT-23)', () => {
  const raw = { title: false, axisX: false, axisY: 'no', titleX: false, labels: true, position: 'bestFit', content: ['category', 'percent', 'value', 'html'], decimals: 3, code: true, dataTable: true, gridlines: ['majorH', 'minorV', 'bogus'], legend: 'right', trendline: 'poly', extra: '<b>' }
  assert.deepEqual(cleanElements('bar', undefined, raw), { title: false, axisX: false, titleX: false, labels: true, content: ['category', 'value'], code: true, dataTable: true, gridlines: ['majorH', 'minorV'], legend: 'right' })
  assert.deepEqual(cleanElements('pie', undefined, { ...raw, position: 'bestFit', trendline: 'linear', legend: 'bottom' }), { title: false, labels: true, position: 'bestFit', content: ['category', 'value', 'percent'], code: true, legend: 'bottom' }, 'a pie has no axes, gridlines, data table or trendline')
  assert.deepEqual(cleanElements('line', undefined, { position: 'right', trendline: 'linear', decimals: 1 }), { position: 'right', trendline: 'linear', decimals: 1 })
  assert.equal(cleanElements('pareto', undefined, { trendline: 'linear' }), undefined, 'no trendline on a Pareto')
  assert.equal(cleanElements('kpi', undefined, { legend: 'left' }), undefined)
  assert.equal(cleanElements('table', undefined, { dataTable: true }), undefined)
  assert.equal(cleanElements('bar', undefined, 'legend'), undefined)
  assert.equal(cleanElements('bar', undefined, ['legend']), undefined)
  // Percentage only for a pie or with Percent of total.
  assert.deepEqual(contentsFor('bar'), ['series', 'category', 'value'], 'Excel’s order')
  assert.deepEqual(contentsFor('line', true), ['series', 'category', 'value', 'percent'])
  assert.deepEqual(cleanElements('bar', { percent: true }, { content: ['value', 'percent'] }), { content: ['value', 'percent'] })
  assert.deepEqual(cleanElements('bar', undefined, { content: ['percent'] }), undefined)
  // Through cleanOptions (the page and dashboard files): the orientation counts; written only when set.
  assert.deepEqual(cleanOptions('bar', 'count', { orientation: 'vertical', elements: { gridlines: ['majorH'], legend: 'bottom' } }), { orientation: 'vertical', elements: { legend: 'bottom' } })
  assert.deepEqual(cleanOptions('bar', 'count', { elements: { gridlines: ['majorH'] } }), { elements: { gridlines: ['majorH'] } }, 'horizontal bars had vertical gridlines')
  const columns = [{ id: 'c1', name: 'Topic', type: 'dropdown', options: ['A'], required: false }]
  const [read] = parseInsights([{ id: 'i1', title: 'T', type: 'pie', category: 'c1', measure: 'count', sort: 'value', options: { elements: { legend: 'none', position: 'outsideEnd', content: ['value', 'percent'], foo: 1 } } }], columns)
  assert.deepEqual(read.options, { elements: { legend: 'none', position: 'outsideEnd', content: ['value', 'percent'] } })
  // A dashboard block keeps them too.
  const { dashboard } = parseDashboard(JSON.stringify({ schema: 1, kind: 'dashboard', id: 'd', tabs: [], filters: [], blocks: [{ id: 'b1', title: 'B', type: 'bar', source: 'page:p', category: 'c1', measure: 'count', sort: 'value', options: { elements: { trendline: 'linear', dataTable: true, nope: true } } }] }), 'd')
  assert.deepEqual(dashboard.blocks[0].options, { elements: { trendline: 'linear', dataTable: true } })
  assert.deepEqual(JSON.parse(serializeDashboard(dashboard)).blocks[0].options, { elements: { dataTable: true, trendline: 'linear' } })
  // The pop-up's change helper: one key at a time, cleaned the same way.
  assert.deepEqual(withElement('bar', undefined, { legend: 'left' }, 'legend', 'top'), undefined)
  assert.deepEqual(withElement('bar', undefined, undefined, 'trendline', 'linear'), { trendline: 'linear' })
})

test('CHT-28: label positions per type (Excel’s lists), the stacked fallback and the label text (TC-CHT-24)', () => {
  assert.deepEqual(labelPositions('bar'), ['center', 'insideEnd', 'insideBase', 'outsideEnd'])
  assert.deepEqual(labelPositions('column', true), ['center', 'insideEnd', 'insideBase'])
  assert.deepEqual(labelPositions('line'), ['center', 'left', 'right', 'above', 'below'])
  assert.deepEqual(labelPositions('pie'), ['center', 'insideEnd', 'outsideEnd', 'bestFit'])
  assert.equal(resolveElements('bar', { position: 'outsideEnd' }, { stacked: true }).position, 'center', 'no Outside End on a stack')
  assert.equal(resolveElements('bar', { position: 'insideBase' }).plain, false)
  assert.equal(defaultPosition('pie'), 'center'); assert.deepEqual(defaultContent('pie'), ['percent']); assert.deepEqual(defaultGridlines('line'), ['majorH']); assert.equal(defaultLegend('pie'), 'right')
  // Along a bar from base 0 to end 100 px, a 30 px label.
  assert.equal(barLabelAt('center', 0, 100, 30), 50)
  assert.equal(barLabelAt('insideEnd', 0, 100, 30), 81)
  assert.equal(barLabelAt('insideBase', 0, 100, 30), 19)
  assert.equal(barLabelAt('outsideEnd', 0, 100, 30, 40), 119)
  assert.equal(barLabelAt('outsideEnd', 0, 100, 30, 20), null, 'no room after the end: left out')
  assert.equal(barLabelAt('center', 0, 20, 30), null, 'too short for the label: left out')
  assert.equal(barLabelAt('insideEnd', 100, 0, 30), 19, 'a negative bar runs the other way')
  // Line labels beside their point.
  assert.deepEqual(lineLabelAt('right', 100, 50, 30, 12), { x: 108, y: 44, width: 30, height: 12 })
  assert.deepEqual(lineLabelAt('left', 100, 50, 30, 12), { x: 62, y: 44, width: 30, height: 12 })
  assert.deepEqual(lineLabelAt('below', 100, 50, 30, 12), { x: 85, y: 58, width: 30, height: 12 })
  // Text and number format.
  assert.equal(labelText({ value: '1,950', percent: '43%', category: 'Rework' }, ['category', 'value', 'percent']), 'Rework, 1,950, 43%')
  const short = (value) => value >= 10000 ? `${value / 1000}K` : String(value)
  assert.equal(labelNumber(12500, { short }), '12.5K', 'automatic: as before')
  assert.equal(labelNumber(12500, { decimals: 0, short }), '12,500')
  assert.equal(labelNumber(1950.5, { decimals: 2, code: true, currency: 'EUR', short }), '1,950.50 EUR')
  assert.equal(labelNumber(1950, { code: true, currency: '', short }), '1950', 'no currency: no code')
  assert.equal(labelPercent(43.333, undefined, 0), '43%')
  assert.equal(labelPercent(43.333, 1, 0), '43.3%')
})

test('CHT-29: labels never overlap or leave the chart; pie Best Fit moves small slices outside with leader lines (TC-CHT-25)', () => {
  const boxes = [{ x: 0, y: 0, width: 30, height: 12, id: 'a' }, { x: 20, y: 5, width: 30, height: 12, id: 'b' }, { x: 40, y: 0, width: 30, height: 12, id: 'c' }]
  assert.deepEqual(keepApart(boxes).map((box) => box.id), ['a', 'c'])
  assert.equal(inside({ x: 290, y: 0, width: 20, height: 10 }, 300, 100), false)
  assert.deepEqual(fitText('Rework, 1,950', 100, 1), ['Rework, 1,950'])
  assert.deepEqual(fitText('Rework, 1,950', 60, 2), ['Rework,', '1,950'])
  assert.equal(fitText('Rework, 1,950', 30, 2), null, 'a number is never cut: left out')
  // A big slice (70%) and two small ones (5% each) of a donut 60…92 px.
  const turn = Math.PI * 2, start = -Math.PI / 2
  const slices = [[0, 0.7], [0.7, 0.75], [0.75, 0.8], [0.8, 1]].map(([from, to]) => ({ start: start + from * turn, end: start + to * turn, width: 40, lines: 1 }))
  const fit = pieLabels(slices, 'bestFit', 60, 92)
  assert.deepEqual(fit.labels.map((label) => label.outside), [false, true, true, false])
  assert.ok(fit.labels[1].leader && fit.labels[2].leader, 'leader lines to the small slices')
  assert.ok(Math.abs(fit.labels[1].y - fit.labels[2].y) >= 12, 'the outside labels moved apart')
  assert.ok(fit.bounds.left < -92, 'the drawing grows to hold them')
  const out = pieLabels(slices, 'outsideEnd', 60, 92)
  assert.equal(out.labels.every((label) => label.outside), true)
  const centred = pieLabels(slices, 'center', 60, 92)
  assert.deepEqual(centred.labels.map((label) => Boolean(label.hidden)), [false, true, true, false], 'Center: a label that does not fit its slice is left out')
  assert.deepEqual(centred.bounds, { left: -92, right: 92, top: -92, bottom: 92 })
})

test('CHT-31, CHT-33: minor gridlines and the least-squares trendline per series (TC-CHT-26)', () => {
  assert.deepEqual(minorTicks([0, 10]), [2, 4, 6, 8])
  assert.deepEqual(minorTicks([0, 5, 10], 2), [2.5, 7.5])
  const fit = linearTrend([2, 4, 6, 8])
  assert.deepEqual([fit.slope, fit.intercept, fit.at(4)], [2, 2, 10])
  const noisy = linearTrend([1, 3, 2, 5])
  assert.equal(Number(noisy.slope.toFixed(6)), 1.1); assert.equal(Number(noisy.intercept.toFixed(6)), 1.1)
  const gaps = linearTrend([null, 3, null, 7])
  assert.deepEqual([gaps.slope, gaps.intercept], [2, 1], 'points without a value left out')
  assert.equal(linearTrend([5]), null); assert.equal(linearTrend([null, null]), null)
  assert.deepEqual(trendLines([[1, 10], [2, 10], [3, 10]], 2), [{ col: 0, from: 1, to: 3 }, { col: 1, from: 10, to: 10 }])
  assert.equal(trendName('Sum of Cost (EUR)'), 'Linear (Sum of Cost (EUR))')
})

test('CHT-30: the data table — one column per category, one row per series in the chart’s number format, a Pareto’s cumulative share (TC-CHT-27)', () => {
  const model = dataTableModel({ categories: ['Rework', 'Scrap'], series: ['Berlin', 'Leeds'], values: [[1200, null], [400, 600]], format: (value) => value == null ? '—' : value.toLocaleString('en') })
  assert.deepEqual(model, { categories: ['Rework', 'Scrap'], rows: [{ name: 'Berlin', key: 0, cells: ['1,200', '400'] }, { name: 'Leeds', key: 1, cells: ['—', '600'] }] })
  const pareto = dataTableModel({ categories: ['A', 'B'], series: ['Count of rows'], values: [[3], [1]], format: String, cumulative: [75, 100] })
  assert.deepEqual(pareto.rows[1], { name: 'Cumulative share (%)', key: null, cells: ['75.0%', '100.0%'] })
})

test('CHT-36, CHT-37: a KPI is a card unless its owners show it as a panel — options.view validated, only for a KPI (TC-CHT-28)', () => {
  assert.deepEqual(cleanOptions('kpi', 'count', { view: 'panel' }), { view: 'panel' })
  assert.equal(cleanOptions('kpi', 'count', { view: 'card' }), undefined, 'card is the default: not written')
  assert.equal(cleanOptions('bar', 'count', { view: 'panel' }), undefined)
  assert.equal(cleanOptions('kpi', 'count', { view: '<x>' }), undefined)
})
