import test from 'node:test'
import assert from 'node:assert/strict'
import { blockChartId, builtInCharts, chartSizeKey, insightChartId, pairFactory, parseChartSize, resolveChartSize, sizeFromOptions, sizeText, snapHeight, snapWidth, spanWidth, stackFactory, stepSize, withSizeOptions } from '../src/chartSize.ts'
import { packLayout } from '../src/chartGrid.ts'
import { cleanOptions, parseInsights, serializeOnDemandPage, parseOnDemandPage } from '../src/onDemand.ts'
import { emptyViews, parseViews, serializeViews, withDefaultEntry, withDefaults } from '../src/personalViews.ts'
import { autoAxisTitles } from '../src/onDemandInsights.ts'
import { fitLabel } from '../src/chartUtils.ts'

// CHT-15…CHT-24 Chart sizes (presets, the v10 values, precedence, validation, grid placement, the handle's keyboard and
// snapping), the label fitting behind KB-83 and the owner's axis titles.

test('CHT-15, CHT-16: the presets — ⅓ / ½ / ⅔ / Full and Small / Medium / Large, now in grid units; v10 half and full read as before (TC-CHT-13)', () => {
  assert.deepEqual(sizeFromOptions({ size: 'half' }), { w: 6 })
  assert.deepEqual(sizeFromOptions({ size: 'full' }), { w: 12 })
  assert.deepEqual(sizeFromOptions({ size: 'twothirds', height: 'large' }), { w: 8, h: 12 })
  assert.equal(sizeFromOptions(undefined), undefined, 'nothing set: the factory size')
  assert.equal(sizeText({ w: 8, h: 12 }), '8 × 12 (width ⅔, height Large)')
  // The grid: 12 columns of a 1200 px grid with 18 px gaps; ½ = 6 columns, as wide as 3 of 6 were.
  assert.equal(Math.round(spanWidth(6, 1200, 18)), 591)
  assert.equal(Math.round(spanWidth(12, 1200, 18)), 1200)
  // The options: a factory value is left out, so a chart nobody resized is written as before.
  assert.equal(withSizeOptions(undefined, { w: 6, h: 8 }), undefined)
  assert.deepEqual(withSizeOptions({ top: 5 }, { w: 4, h: 6 }), { top: 5, size: 'third', height: 'small' })
  assert.deepEqual(withSizeOptions({ top: 5, size: 'full', height: 'large' }, { w: 6, h: 8 }), { top: 5 })
  assert.deepEqual(withSizeOptions(undefined, { w: 6, h: 8 }, pairFactory, true), { size: 'half' }, 'a width picked in the pop-up is written as chosen (as v10)')
})

test('CHT-22, CHT-15, CHT-16: the size options are validated when read — unknown widths and heights dropped, no height for a KPI or a summary table (TC-CHT-14)', () => {
  assert.deepEqual(cleanOptions('bar', 'count', { size: 'third', height: 'large' }), { size: 'third', height: 'large' })
  assert.deepEqual(cleanOptions('bar', 'count', { size: 'huge', height: 'medium' }), undefined, 'unknown width, medium is the default')
  assert.deepEqual(cleanOptions('table', 'count', { size: 'twothirds', height: 'small' }), { size: 'twothirds' })
  assert.deepEqual(cleanOptions('kpi', 'count', { size: 'third', height: 'large' }), { size: 'third' })
  // A page with sizes keeps them through a save; one without is written byte for byte as before.
  const page = { schema: 1, kind: 'on-demand-page', id: 'p', name: 'P', description: '', keyPrefix: 'P', columns: [{ id: 'c1', name: 'Topic', type: 'text', options: [], required: false }], rows: [],
    insights: [{ id: 'i1', title: 'T', type: 'bar', category: 'c1', second: '', measure: 'count', value: '', filters: [], sort: 'value', options: { size: 'third', height: 'small' } }] }
  const again = parseOnDemandPage(serializeOnDemandPage(page), 'p')
  assert.deepEqual(again.insights[0].options, { size: 'third', height: 'small' })
  const [plain] = parseInsights([{ id: 'i2', title: 'U', type: 'bar', category: 'c1', measure: 'count', sort: 'value' }], page.columns)
  assert.equal(plain.options, undefined)
  // v10's own reading (its cleanOptions kept only 'half' and 'full'): ⅓ and ⅔ are dropped there — LIM-36.
  const v10 = (raw) => raw.size === 'half' || raw.size === 'full' ? { size: raw.size } : undefined
  assert.equal(v10({ size: 'third', height: 'large' }), undefined, 'an older app shows the chart at the default size')
})

test('CHT-18, CHT-19: precedence — the viewer’s own size, then the owner’s (or shared) default, then the factory size; stored sizes validated (TC-CHT-15)', () => {
  assert.deepEqual(resolveChartSize({ factory: pairFactory }), { size: pairFactory, source: 'factory', base: pairFactory })
  const owner = resolveChartSize({ owner: { w: 8 }, factory: pairFactory })
  assert.deepEqual([owner.size, owner.source], [{ w: 8, h: 8 }, 'owner'])
  const mine = resolveChartSize({ viewer: { w: 12, h: 12 }, owner: { w: 8 }, factory: pairFactory })
  assert.deepEqual([mine.size, mine.source, mine.base], [{ w: 12, h: 12 }, 'viewer', { w: 8, h: 8 }])
  assert.deepEqual(resolveChartSize({ viewer: { h: 6 }, factory: stackFactory }).size, { w: 12, h: 6 }, 'field by field')
  // A stored size: the presets of before (mapped) or grid units; unknown values dropped.
  assert.deepEqual(parseChartSize({ width: 'third', height: 'giant', extra: 1 }), { w: 4 })
  assert.deepEqual(parseChartSize({ width: 'half', height: 'small', w: 7, h: 9 }), { w: 7, h: 9 }, 'the grid units win over the presets written beside them')
  assert.equal(parseChartSize('full'), undefined); assert.equal(parseChartSize([]), undefined); assert.equal(parseChartSize({ width: 3 }), undefined)
  // Ids and their personal-views keys (the key pattern of personal views, at most 80 characters).
  assert.equal(chartSizeKey(insightChartId('conq', 'i1')), 'chart-size:ondemand:conq:i1')
  assert.equal(chartSizeKey(blockChartId('cost-dashboard', 'b1')), 'chart-size:dashboard:cost-dashboard:b1')
  assert.equal(chartSizeKey(builtInCharts.epicMix), 'chart-size:overview:epic-mix-by-month')
  assert.equal(chartSizeKey(insightChartId('a'.repeat(40), 'i'.repeat(14))).length <= 80, true)
  assert.equal(chartSizeKey('bad id!'), '')
  // The shared default of a built-in chart (Save size for everyone) is one entry of the views defaults; my own wins.
  const key = chartSizeKey(builtInCharts.overrun)
  const defaults = parseViews(serializeViews(withDefaultEntry(emptyViews(), key, { width: 'half', height: 'medium' })))
  assert.deepEqual(parseChartSize(defaults.filters[key]), { w: 6, h: 8 })
  const merged = withDefaults({ ...emptyViews(), filters: { [key]: { width: 'third' } } }, defaults)
  assert.deepEqual(merged.filters[key], { width: 'third' })
  assert.equal(parseChartSize(parseViews(serializeViews(withDefaultEntry(defaults, key, null))).filters[key]), undefined, 'null: the factory size again')
})

test('CHT-20: grid placement — a page nobody arranged is laid out as before: half-width charts two per row, a full-width one on its own row (TC-CHT-15)', () => {
  const entry = (id, w) => ({ id, kind: 'chart', size: { w, h: 8 } })
  assert.deepEqual(packLayout([entry('a', 6), entry('b', 12), entry('c', 6), entry('d', 6)]), { a: { x: 0, y: 0, w: 6, h: 8 }, b: { x: 0, y: 8, w: 12, h: 8 }, c: { x: 0, y: 16, w: 6, h: 8 }, d: { x: 6, y: 16, w: 6, h: 8 } })
  assert.deepEqual(Object.values(packLayout([entry('m', 12), entry('o', 12), entry('h', 12)])).map((box) => [box.x, box.y]), [[0, 0], [0, 8], [0, 16]], 'built-in charts: one under the other as before')
})

test('CHT-21, CHT-49: the handle — arrow keys step one column or row (clamped to the minimum and the grid), a drag snaps to whole columns and rows (TC-CHT-16)', () => {
  const at = { w: 6, h: 8 }
  assert.deepEqual(stepSize(at, 'ArrowRight'), { w: 7, h: 8 })
  assert.deepEqual(stepSize(at, 'ArrowLeft'), { w: 5, h: 8 })
  assert.deepEqual(stepSize(at, 'ArrowDown'), { w: 6, h: 9 })
  assert.deepEqual(stepSize(at, 'ArrowUp'), { w: 6, h: 7 })
  assert.deepEqual(stepSize({ w: 12, h: 30 }, 'ArrowRight'), { w: 12, h: 30 }, 'clamped to the grid')
  assert.deepEqual(stepSize({ w: 3, h: 5 }, 'ArrowLeft'), { w: 3, h: 5 }, 'a chart is at least 3 × 5')
  assert.deepEqual(stepSize({ w: 4, h: 4 }, 'ArrowUp', 'table'), { w: 4, h: 4 }, 'a summary table at least 4 × 4')
  assert.deepEqual(stepSize({ w: 6, h: 8 }, 'ArrowRight', 'chart', 6), { w: 8, h: 8 }, 'on the 6-column grid one column is two twelfths')
  assert.equal(stepSize(at, 'Tab'), null)
  // Snapping in a 1200 px grid of 12 columns (about 83 px each, 18 px gaps): to the nearest whole column.
  assert.equal(snapWidth(388, 1200, 18), 4)
  assert.equal(snapWidth(591, 1200, 18), 6)
  assert.equal(snapWidth(620, 1200, 18), 6)
  assert.equal(snapWidth(700, 1200, 18), 7)
  assert.equal(snapWidth(5000, 1200, 18), 12)
  assert.equal(snapWidth(591, 1200, 18, 6), 6, 'on 6 columns a drag snaps to two twelfths')
  // Heights: one row is 40 px and an 18 px gap — 8 rows dragged 120 px down are 10, 60 px up 7.
  assert.equal(snapHeight(8, 120), 10)
  assert.equal(snapHeight(8, -60), 7)
  assert.equal(snapHeight(8, 20), 8)
})

test('CHT-23 (KB-83): a label is wrapped by words into its space, cut with "…" only when it does not fit (TC-CHT-17)', () => {
  assert.deepEqual(fitLabel('Scrap', 14), { lines: ['Scrap'], cut: false }, 'a short label is as before')
  assert.deepEqual(fitLabel('Supplier delivered the wrong seal', 14), { lines: ['Supplier', 'delivered the…'], cut: true })
  assert.deepEqual(fitLabel('Supplier delivered the wrong seal', 14, 3), { lines: ['Supplier', 'delivered the', 'wrong seal'], cut: false })
  assert.deepEqual(fitLabel('Antidisestablishmentarianism', 10), { lines: ['Antidises…'], cut: true }, 'a word longer than the line is cut')
  assert.deepEqual(fitLabel('Sum of Cost (EUR)', 40, 1), { lines: ['Sum of Cost (EUR)'], cut: false })
  assert.deepEqual(fitLabel('A very long axis title that runs past the plot', 20, 1), { lines: ['A very long axis…'], cut: true })
  assert.deepEqual(fitLabel('  ', 10), { lines: [''], cut: false })
  for (const [text, chars, lines] of [['Rework at the Berlin site after a complaint', 12, 2], ['x'.repeat(80), 9, 3], ['a b c d e f g h', 3, 2]]) {
    const fit = fitLabel(text, chars, lines)
    assert.ok(fit.lines.length <= lines && fit.lines.every((line) => line.length <= chars), `${text}: ${JSON.stringify(fit)}`)
  }
})

test('CHT-24: the owner’s axis titles — validated, written only when set, only for charts with axes; the automatic ones as before (TC-CHT-18)', () => {
  assert.deepEqual(cleanOptions('bar', 'count', { xTitle: '  Cost   in EUR ', yTitle: '' }), { xTitle: 'Cost in EUR' })
  assert.deepEqual(cleanOptions('line', 'sum', { xTitle: 'x'.repeat(90), yTitle: 7 }), { xTitle: 'x'.repeat(60) })
  assert.equal(cleanOptions('pie', 'count', { xTitle: 'X', yTitle: 'Y' }), undefined, 'a pie has no axes')
  assert.equal(cleanOptions('kpi', 'count', { xTitle: 'X' }), undefined)
  assert.equal(cleanOptions('table', 'count', { yTitle: 'Y' }), undefined)
  const page = { columns: [{ id: 'c1', name: 'Category', type: 'dropdown', options: [] }, { id: 'c3', name: 'Cost (EUR)', type: 'number', options: [] }, { id: 'c4', name: 'Found on', type: 'date', options: [] }] }
  const base = { id: 'i', title: 'T', category: 'c1', second: '', measure: 'sum', value: 'c3', filters: [], sort: 'value' }
  assert.deepEqual(autoAxisTitles(page, { ...base, type: 'bar' }), { x: 'Sum of Cost (EUR)', y: 'Category' })
  assert.deepEqual(autoAxisTitles(page, { ...base, type: 'bar', options: { orientation: 'vertical' } }), { x: 'Category', y: 'Sum of Cost (EUR)' })
  assert.deepEqual(autoAxisTitles(page, { ...base, type: 'line', category: 'c4' }), { x: 'Month of Found on', y: 'Sum of Cost (EUR)' })
})
