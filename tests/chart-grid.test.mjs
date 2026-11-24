import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanOptions, mergeOnDemandText, parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { mergeDashboardText, parseDashboard, serializeDashboard } from '../src/dashboardPages.ts'
import { cardFactory, clampSize, factoryOf, gridColsFor, heightFactorOf, heightRows, kindOf, nearestHeight, nearestWidth, parseChartSize, parseGridBox, presetSize, sizeFromOptions, storedSize, withGridBox, withSizeOptions } from '../src/chartSize.ts'
import { changedPanels, compact, matchRowHeights, movePanel, overlaps, packLayout, resizePanel, rowOf, stepMove } from '../src/chartGrid.ts'
import { menuPlace } from '../src/menuPlace.ts'

// CHT-43…CHT-50 The chart grid: the size mapping of the presets, the packing and compaction of panels, moving and
// resizing with the others shifting, the keyboard's move, the narrower grids, the file field `options.grid` (validated,
// merged per chart) and what an older app reads.

const entry = (id, w, h = 8, box, kind = 'chart') => ({ id, kind, size: { w, h }, ...(box ? { box } : {}) })
const noOverlap = (layout) => { const boxes = Object.values(layout); return boxes.every((a, i) => boxes.every((b, j) => i === j || !overlaps(a, b))) }

test('CHT-44, CHT-45: the presets map onto the grid and draw as before — ⅓ ½ ⅔ Full = 4 6 8 12 columns, Small Medium Large = today’s heights in rows (TC-CHT-34)', () => {
  assert.deepEqual(['third', 'half', 'twothirds', 'full'].map((width) => presetSize(width, 'medium').w), [4, 6, 8, 12])
  assert.deepEqual(['small', 'medium', 'large'].map((height) => presetSize('half', height).h), [6, 8, 12])
  assert.deepEqual(['small', 'medium', 'large'].map((height) => presetSize('half', height, 'pie').h), [5, 6, 9])
  // The drawing at the preset rows is exactly today's (¾, 1, 1½); in between and beyond in proportion.
  for (const kind of ['chart', 'pie']) assert.deepEqual(['small', 'medium', 'large'].map((height) => heightFactorOf(heightRows[kind][height], kind)), [0.75, 1, 1.5], kind)
  assert.equal(heightFactorOf(10), 1.25)
  assert.equal(heightFactorOf(4, 'table'), 1, 'a summary table takes the height of its content')
  // A chart nobody resized: half width, Medium — drawn at factor 1, as before.
  assert.deepEqual(factoryOf('chart'), { w: 6, h: 8 })
  assert.equal(heightFactorOf(factoryOf('chart').h), 1)
  assert.deepEqual(factoryOf('table'), { w: 6, h: 4 })
  // Back to the nearest preset (what an older app shows).
  assert.deepEqual([3, 5, 7, 9, 11].map(nearestWidth), ['third', 'half', 'twothirds', 'twothirds', 'full'], 'halfway: the larger')
  assert.deepEqual([5, 7, 9, 10, 20].map((h) => nearestHeight(h)), ['small', 'medium', 'medium', 'large', 'large'])
  // Minimums: a KPI panel 2 × 3, a chart 3 × 5, a summary table 4 × 4; at most 12 columns and 30 rows.
  assert.deepEqual(clampSize({ w: 1, h: 1 }, 'kpi'), { w: 2, h: 3 })
  assert.deepEqual(clampSize({ w: 1, h: 1 }, 'chart'), { w: 3, h: 5 })
  assert.deepEqual(clampSize({ w: 1, h: 1 }, 'table'), { w: 4, h: 4 })
  assert.deepEqual(clampSize({ w: 40, h: 99 }), { w: 12, h: 30 })
  assert.deepEqual([kindOf('pie'), kindOf('table'), kindOf('kpi'), kindOf('pareto')], ['pie', 'table', 'kpi', 'chart'])
  // The grid's columns by its width: 12; 6 on a medium-wide screen; 1 on a phone.
  assert.deepEqual([gridColsFor(1150, 1440), gridColsFor(760, 1024), gridColsFor(360, 390), gridColsFor(900, 700)], [12, 6, 1, 1])
})

test('CHT-43, CHT-47: packing — places kept, overlaps resolved by compaction, gaps closed upward, charts without a place after the others (TC-CHT-35)', () => {
  // Places as saved: two side by side, one under the first.
  const saved = packLayout([entry('a', 6, 8, { x: 0, y: 0, w: 6, h: 8 }), entry('b', 6, 8, { x: 6, y: 0, w: 6, h: 8 }), entry('c', 8, 6, { x: 0, y: 8, w: 8, h: 6 })])
  assert.deepEqual(saved, { a: { x: 0, y: 0, w: 6, h: 8 }, b: { x: 6, y: 0, w: 6, h: 8 }, c: { x: 0, y: 8, w: 8, h: 6 } })
  // A gap above closes; two panels on the same place (a merge, a hand edit) no longer overlap.
  const gap = packLayout([entry('a', 6, 8, { x: 0, y: 20, w: 6, h: 8 }), entry('b', 6, 8, { x: 0, y: 20, w: 6, h: 8 }), entry('c', 12, 8, { x: 0, y: 3, w: 12, h: 8 })])
  assert.deepEqual(gap, { c: { x: 0, y: 0, w: 12, h: 8 }, a: { x: 0, y: 8, w: 6, h: 8 }, b: { x: 0, y: 16, w: 6, h: 8 } })
  assert.ok(noOverlap(gap))
  // A chart added later (no place) goes after the arranged ones.
  const added = packLayout([entry('a', 6, 8, { x: 6, y: 0, w: 6, h: 8 }), entry('new', 6)])
  assert.deepEqual(added.new, { x: 0, y: 8, w: 6, h: 8 })
  // The viewer's own size on the owners' places: the others shift down, nothing overlaps.
  const viewer = packLayout([entry('a', 12, 8, { x: 0, y: 0, w: 6, h: 8 }), entry('b', 6, 8, { x: 6, y: 0, w: 6, h: 8 })])
  assert.deepEqual(viewer, { a: { x: 0, y: 0, w: 12, h: 8 }, b: { x: 6, y: 8, w: 6, h: 8 } })
  // A place out of the grid is clamped when read; anything else dropped.
  assert.deepEqual(parseGridBox({ x: 11, y: -4, w: 8, h: 2 }), { x: 4, y: 0, w: 8, h: 5 })
  assert.deepEqual(parseGridBox({ x: 2.4, y: 3.6, w: 40, h: 50 }), { x: 0, y: 4, w: 12, h: 30 })
  for (const bad of [null, 'x', [], { x: 0, y: 0, w: 4 }, { x: '1', y: 0, w: 4, h: 6 }, { x: 0, y: 0, w: 0, h: 6 }]) assert.equal(parseGridBox(bad), undefined)
})

test('CHT-46: the medium-wide grid (6 columns) and the phone (one column, in reading order) (TC-CHT-35)', () => {
  const entries = [entry('a', 4, 8, { x: 0, y: 0, w: 4, h: 8 }), entry('b', 8, 8, { x: 4, y: 0, w: 8, h: 8 }), entry('c', 12, 6, { x: 0, y: 8, w: 12, h: 6 })]
  assert.deepEqual(packLayout(entries, 6), { a: { x: 0, y: 0, w: 2, h: 8 }, b: { x: 2, y: 0, w: 4, h: 8 }, c: { x: 0, y: 8, w: 6, h: 6 } })
  const phone = packLayout([entry('b', 6, 8, { x: 6, y: 0, w: 6, h: 8 }), entry('a', 6, 8, { x: 0, y: 0, w: 6, h: 8 }), entry('c', 12)], 1)
  assert.deepEqual(Object.entries(phone).map(([id, box]) => [id, box.x, box.w]), [['a', 0, 1], ['b', 0, 1], ['c', 0, 1]], 'left before right, then below')
  assert.deepEqual([phone.a.y, phone.b.y, phone.c.y], [0, 8, 16])
})

test('CHT-47: moving — dropped on a place, the others shift out of the way and gaps close; the keyboard moves one column or past a neighbour (TC-CHT-35)', () => {
  const start = packLayout([entry('a', 6), entry('b', 6), entry('c', 12)])
  // c dropped on the top row: it goes first, a and b move under it.
  const top = movePanel(start, 'c', 0, 0)
  assert.deepEqual(top, { c: { x: 0, y: 0, w: 12, h: 8 }, a: { x: 0, y: 8, w: 6, h: 8 }, b: { x: 6, y: 8, w: 6, h: 8 } })
  assert.deepEqual(changedPanels(start, top).sort(), ['a', 'b', 'c'])
  // a dropped on b's place: b moves down out of its way (a's old place stays free until something closes it).
  const onto = movePanel(start, 'a', 6, 0)
  assert.deepEqual([onto.a, onto.b, onto.c], [{ x: 6, y: 0, w: 6, h: 8 }, { x: 6, y: 8, w: 6, h: 8 }, { x: 0, y: 8, w: 12, h: 8 }].slice(0, 2).concat([{ x: 0, y: 16, w: 12, h: 8 }]))
  // Far down into empty space: the gap closes upward.
  assert.deepEqual(movePanel(start, 'a', 0, 40).a, { x: 0, y: 16, w: 6, h: 8 })
  // Out of the grid: clamped.
  assert.equal(movePanel(start, 'a', 11, 0).a.x, 6)
  assert.ok(noOverlap(movePanel(start, 'b', 3, 4)))
  // The keyboard: → one column; ↓ past the panel under it; ↑ back above it; at the edge nothing moves.
  const narrow = packLayout([entry('a', 4), entry('b', 12)])
  assert.deepEqual(stepMove(narrow, 'a', 'ArrowRight').a, { x: 1, y: 0, w: 4, h: 8 })
  const down = stepMove(narrow, 'a', 'ArrowDown')
  assert.deepEqual([down.b.y, down.a.y], [0, 8])
  const up = stepMove(down, 'a', 'ArrowUp')
  assert.deepEqual([up.a.y, up.b.y], [0, 8])
  assert.equal(stepMove(narrow, 'a', 'ArrowLeft'), narrow, 'at the left edge')
  assert.equal(stepMove(narrow, 'a', 'ArrowUp'), narrow, 'at the top')
  assert.equal(stepMove(narrow, 'a', 'Enter'), null)
})

test('CHT-43, CHT-49: resizing — wider or taller, the others beside or below shift out of the way (TC-CHT-35)', () => {
  const start = packLayout([entry('a', 6), entry('b', 6), entry('c', 6)])
  const wide = resizePanel(start, 'a', { w: 8, h: 8 })
  assert.deepEqual(wide, { a: { x: 0, y: 0, w: 8, h: 8 }, b: { x: 6, y: 8, w: 6, h: 8 }, c: { x: 0, y: 8, w: 6, h: 8 } })
  assert.ok(noOverlap(wide))
  const tall = resizePanel(start, 'a', { w: 6, h: 12 })
  assert.deepEqual(tall.c, { x: 0, y: 12, w: 6, h: 8 })
  assert.deepEqual(compact([{ id: 'x', x: 0, key: 5, w: 6, h: 4 }]), { x: { x: 0, y: 0, w: 6, h: 4 } })
})

test('CHT-47, CHT-48, CHT-50: options.grid and a viewer’s size in grid units — written only when set, with the nearest presets for older apps; merged per chart (TC-CHT-36)', () => {
  // A chart nobody arranged keeps its preset fields only (as before); an arranged one gets its place.
  assert.equal(withSizeOptions(undefined, { w: 6, h: 8 }), undefined)
  assert.deepEqual(withGridBox(undefined, { x: 4, y: 8, w: 8, h: 6 }), { size: 'twothirds', height: 'small', grid: { x: 4, y: 8, w: 8, h: 6 } })
  assert.deepEqual(withGridBox({ top: 5 }, { x: 0, y: 0, w: 6, h: 8 }), { top: 5, grid: { x: 0, y: 0, w: 6, h: 8 } }, 'half and Medium: no preset field, as before')
  assert.deepEqual(withSizeOptions({ grid: { x: 6, y: 0, w: 6, h: 8 } }, { w: 5, h: 9 }), { grid: { x: 6, y: 0, w: 5, h: 9 } }, 'a size between the presets is kept in the grid')
  assert.deepEqual(cleanOptions('bar', 'count', { grid: { x: 2, y: 1, w: 5, h: 7 } }), { grid: { x: 2, y: 1, w: 5, h: 7 } })
  assert.deepEqual(cleanOptions('table', 'count', { grid: { x: 0, y: 0, w: 2, h: 2 } }), { grid: { x: 0, y: 0, w: 4, h: 4 } }, 'a summary table at least 4 × 4')
  assert.deepEqual(cleanOptions('kpi', 'count', { grid: { x: 0, y: 0, w: 1, h: 3 } }), { grid: { x: 0, y: 0, w: 2, h: 3 } }, 'a KPI card has a place on the grid since CHT-51, at least 2 × 3')
  assert.deepEqual(sizeFromOptions({ size: 'full', grid: { x: 0, y: 0, w: 7, h: 9 } }), { w: 7, h: 9 }, 'the grid wins over the presets beside it')
  // A viewer's size: stored as grid units and the nearest presets; read either way.
  assert.deepEqual(storedSize({ w: 7, h: 9 }), { width: 'twothirds', height: 'medium', w: 7, h: 9 })
  assert.deepEqual(parseChartSize(storedSize({ w: 7, h: 9 })), { w: 7, h: 9 })
  // An older app (before the grid) reads only `size` and `height`: the nearest presets of what was arranged.
  const v101 = (options) => ({ size: options.size ?? 'half', height: options.height ?? 'medium' })
  assert.deepEqual(v101(withGridBox(undefined, { x: 4, y: 0, w: 5, h: 9 })), { size: 'half', height: 'medium' })
  assert.deepEqual(v101(withGridBox(undefined, { x: 0, y: 0, w: 11, h: 13 })), { size: 'full', height: 'large' })
  // GIT-17: two saves at once — each chart's layout is the later save's where both changed it; the rest kept.
  const columns = [{ id: 'c1', name: 'Category', type: 'dropdown', options: ['A', 'B'], required: false }]
  const insight = (id, grid) => ({ id, title: id, type: 'bar', category: 'c1', second: '', measure: 'count', value: '', filters: [], sort: 'value', ...(grid ? { options: { grid } } : {}) })
  const file = (insights) => serializeOnDemandPage({ schema: 1, kind: 'on-demand-page', id: 'p', name: 'P', description: '', keyPrefix: 'P', columns, rows: [], insights })
  const base = file([insight('i1'), insight('i2')])
  const mine = file([insight('i1', { x: 6, y: 0, w: 6, h: 8 }), insight('i2', { x: 0, y: 0, w: 6, h: 8 })])
  const theirs = file([insight('i1', { x: 0, y: 0, w: 12, h: 6 }), insight('i2')])
  const merged = parseOnDemandPage(mergeOnDemandText(base, mine, theirs, true), 'p').insights
  assert.deepEqual(merged.map((entry) => entry.options?.grid), [{ x: 6, y: 0, w: 6, h: 8 }, { x: 0, y: 0, w: 6, h: 8 }])
  const older = parseOnDemandPage(mergeOnDemandText(base, mine, theirs, false), 'p').insights
  assert.deepEqual(older.map((entry) => entry.options?.grid), [{ x: 0, y: 0, w: 12, h: 6 }, { x: 0, y: 0, w: 6, h: 8 }], 'i1: theirs (later); i2: only mine changed it')
  // Drawn without overlaps whatever the merge gives (i2 and i1 both at the top left).
  const drawn = packLayout(older.map((entry) => ({ id: entry.id, kind: 'chart', size: { w: entry.options.grid.w, h: entry.options.grid.h }, box: entry.options.grid })))
  assert.ok(noOverlap(drawn))
  // A page without places is written byte for byte as before.
  assert.doesNotMatch(base, /"grid"/)
  // Dashboard blocks: the same field, merged block by block.
  const block = (id, grid) => ({ id, title: id, type: 'bar', source: 'page:p', category: 'c1', measure: 'count', sort: 'value', ...(grid ? { options: { grid } } : {}) })
  const dash = (blocks) => serializeDashboard(parseDashboard(JSON.stringify({ schema: 1, kind: 'dashboard', id: 'd', tabs: [], filters: [], blocks }), 'd').dashboard)
  const out = parseDashboard(mergeDashboardText(dash([block('b1'), block('b2')]), dash([block('b1', { x: 6, y: 0, w: 6, h: 8 }), block('b2')]), dash([block('b1'), block('b2', { x: 0, y: 0, w: 4, h: 5 })]), true), 'd').dashboard
  assert.deepEqual(out.blocks.map((entry) => entry.options?.grid), [{ x: 6, y: 0, w: 6, h: 8 }, { x: 0, y: 0, w: 4, h: 5 }])
})

test('CHT-51, CHT-52: KPI cards on the chart grid — 3 × 3 by default, in a row above the charts until moved, at least 2 × 3, written only when resized (TC-CHT-38)', () => {
  assert.deepEqual(cardFactory, { w: 3, h: 3 })
  assert.deepEqual(clampSize({ w: 1, h: 2 }, 'kpi'), { w: 2, h: 3 })
  // A page nobody arranged: the cards four to a row at the top, the charts under them two by two, as before.
  const card = (id, box) => ({ ...entry(id, 3, 3, box, 'kpi'), top: true })
  const plain = (layout) => Object.fromEntries(Object.entries(layout).map(([id, { x, y, w, h }]) => [id, { x, y, w, h }]))
  const fresh = plain(packLayout([card('k1'), card('k2'), entry('a', 6), entry('b', 6)]))
  assert.deepEqual(fresh, { k1: { x: 0, y: 0, w: 3, h: 3 }, k2: { x: 3, y: 0, w: 3, h: 3 }, a: { x: 0, y: 3, w: 6, h: 8 }, b: { x: 6, y: 3, w: 6, h: 8 } }, 'no chart beside the cards')
  const five = packLayout([1, 2, 3, 4, 5].map((n) => card(`k${n}`)))
  assert.deepEqual(five.k5, { x: 0, y: 3, w: 3, h: 3, card: true }, 'a fifth card wraps to a second row')
  // Charts arranged before the cards had a place (v10.3): the cards stay above them, the arranged layout below as it was.
  const arranged = plain(packLayout([card('k1'), entry('a', 6, 8, { x: 6, y: 0, w: 6, h: 8 }), entry('b', 6, 8, { x: 0, y: 0, w: 6, h: 8 })]))
  assert.deepEqual(arranged, { k1: { x: 0, y: 0, w: 3, h: 3 }, a: { x: 6, y: 3, w: 6, h: 8 }, b: { x: 0, y: 3, w: 6, h: 8 } })
  // Once arranged a card is a panel like the others: moved among the charts.
  const moved = packLayout([{ ...card('k1', { x: 6, y: 8, w: 4, h: 5 }), size: { w: 4, h: 5 } }, entry('a', 6, 8, { x: 0, y: 0, w: 6, h: 8 })])
  assert.deepEqual(plain(moved).k1, { x: 6, y: 0, w: 4, h: 5 }, 'gaps close upward')
  // The card band: once the cards have places, a chart below them does not move up beside them when another chart is
  // resized (compaction), only when the owners drop it there.
  const placed = packLayout([card('k1', { x: 0, y: 0, w: 3, h: 3 }), card('k2', { x: 3, y: 0, w: 3, h: 3 }), entry('a', 6, 8, { x: 0, y: 3, w: 6, h: 8 }), entry('b', 6, 8, { x: 6, y: 3, w: 6, h: 8 })])
  assert.deepEqual(placed.b, { x: 6, y: 3, w: 6, h: 8 }, 'read as saved')
  const taller = resizePanel(placed, 'a', { w: 6, h: 10 })
  assert.deepEqual([taller.a, taller.b], [{ x: 0, y: 3, w: 6, h: 10 }, { x: 6, y: 3, w: 6, h: 8 }])
  const dropped = movePanel(placed, 'b', 6, 0)
  assert.deepEqual(dropped.b, { x: 6, y: 0, w: 6, h: 8 }, 'dropped beside the cards: it stays')
  assert.deepEqual(resizePanel(dropped, 'a', { w: 6, h: 9 }).b, { x: 6, y: 0, w: 6, h: 8 })
  // A card made wider and taller pushes the next card to the right in its row; the charts stay below the cards.
  const wider = resizePanel(placed, 'k1', { w: 4, h: 4 })
  assert.deepEqual([wider.k1, wider.k2, wider.a, wider.b].map(({ x, y, w, h }) => ({ x, y, w, h })), [{ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 3, h: 3 }, { x: 0, y: 4, w: 6, h: 8 }, { x: 6, y: 4, w: 6, h: 8 }])
  // A viewer's own size for a card: wider and taller, the charts shift down.
  const viewer = plain(packLayout([{ ...card('k1'), size: { w: 6, h: 5 } }, card('k2'), entry('a', 6)]))
  assert.deepEqual([viewer.k1, viewer.k2, viewer.a], [{ x: 0, y: 0, w: 6, h: 5 }, { x: 6, y: 0, w: 3, h: 3 }, { x: 0, y: 5, w: 6, h: 8 }])
  // On a phone: full width, cards first.
  const phone = packLayout([card('k1'), entry('a', 6), card('k2')], 1)
  assert.deepEqual(Object.keys(phone).sort((x, y) => phone[x].y - phone[y].y), ['k1', 'k2', 'a'])
  // Written: nothing for the factory size; a card resized gets its place and size (no preset holds 3 columns × 5 rows).
  assert.equal(withSizeOptions(undefined, { w: 3, h: 3 }, cardFactory, false, 'kpi'), undefined)
  assert.deepEqual(withSizeOptions(undefined, { w: 3, h: 5 }, cardFactory, false, 'kpi'), { size: 'third', grid: { x: 0, y: 0, w: 3, h: 5 } })
  assert.deepEqual(sizeFromOptions({ size: 'third', grid: { x: 0, y: 0, w: 3, h: 5 } }, 'kpi'), { w: 3, h: 5 })
  assert.deepEqual(cleanOptions('kpi', 'count', { size: 'third', grid: { x: 0, y: 3, w: 3, h: 5 } }), { size: 'third', grid: { x: 0, y: 3, w: 3, h: 5 } })
})

test('KB-89, CHT-55: Match heights in this row — every panel starting on the row takes the tallest height; the rows below shift (TC-CHT-39)', () => {
  const layout = packLayout([entry('a', 6, 6), entry('b', 6, 10), entry('c', 12, 8)])
  assert.deepEqual(rowOf(layout, 'a').sort(), ['a', 'b'])
  const matched = matchRowHeights(layout, 'a')
  assert.deepEqual([matched.a, matched.b, matched.c], [{ x: 0, y: 0, w: 6, h: 10 }, { x: 6, y: 0, w: 6, h: 10 }, { x: 0, y: 10, w: 12, h: 8 }])
  assert.equal(matchRowHeights(layout, 'b', 7).a.h, 7, 'Size… with "Same height": the chosen height')
  assert.deepEqual(matchRowHeights(layout, 'c').c, layout.c, 'alone in its row: unchanged')
  assert.ok(noOverlap(matched))
})

test('KB-88: a ⋯ menu opens under its button, flips above near the bottom, stays inside the window (TC-CHT-40)', () => {
  const view = { width: 1440, height: 900 }
  const menu = { width: 200, height: 180 }
  assert.deepEqual(menuPlace({ top: 100, bottom: 130, left: 600, right: 630 }, menu, view), { top: 134, left: 430, maxHeight: 758, up: false })
  const low = menuPlace({ top: 800, bottom: 830, left: 600, right: 630 }, menu, view)
  assert.deepEqual([low.top, low.up], [800 - 4 - 180, true], 'above the button near the bottom')
  assert.equal(menuPlace({ top: 100, bottom: 130, left: 10, right: 40 }, menu, view).left, 10, 'left-aligned near the left edge')
  assert.equal(menuPlace({ top: 100, bottom: 130, left: 1420, right: 1450 }, menu, view).left, 1440 - 8 - 200, 'inside on the right')
  const tall = menuPlace({ top: 100, bottom: 130, left: 600, right: 630 }, { width: 200, height: 2000 }, view)
  assert.ok(tall.top >= 8 && tall.top + tall.maxHeight <= 900 - 8, 'a taller menu scrolls inside the window')
})
