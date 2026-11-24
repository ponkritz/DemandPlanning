import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanOptions, mergeOnDemandText, parseColors, parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { chartData, insightProblems, insightSubject, isGrouped } from '../src/onDemandInsights.ts'
import { parseDashboard, serializeDashboard } from '../src/dashboardPages.ts'
import { groupedRowHeight, groupedSlots, labelPositions, resolveElements, trendLines } from '../src/chartElements.ts'
import { chartBackground, contrast, contrastWarning, darkText, labelOn, lightText, lowContrast, normalizeHex, paletteHex, pinColor, pinHex } from '../src/chartColors.ts'

// CHT-40 grouped (clustered) bars and CHT-41 colour pins of any colour: the option and its checks, the layout maths of a
// group, the colour validation, the WCAG contrast check and the label colour on a coloured bar.

const columns = [
  { id: 'c2', name: 'Cost', type: 'number', options: [], required: false },
  { id: 'c4', name: 'Category', type: 'dropdown', options: ['Scrap', 'Rework', 'Complaint'], required: false },
  { id: 'c5', name: 'Site', type: 'dropdown', options: ['Berlin', 'Leeds', 'Lyon'], required: false },
]
const page = () => ({ schema: 1, kind: 'on-demand-page', id: 'p', name: 'P', description: '', keyPrefix: 'P', columns: structuredClone(columns), insights: [], rows: [
  { id: 'a', seq: 1, cells: { c4: 'Rework', c2: '40', c5: 'Berlin' } },
  { id: 'b', seq: 2, cells: { c4: 'Rework', c2: '20', c5: 'Berlin' } },
  { id: 'c', seq: 3, cells: { c4: 'Rework', c2: '90', c5: 'Leeds' } },
  { id: 'd', seq: 4, cells: { c4: 'Scrap', c2: '30', c5: 'Lyon' } },
] })
const bar = (fields) => ({ id: 'i', title: 'T', type: 'bar', category: 'c4', second: 'c5', measure: 'average', value: 'c2', filters: [], sort: 'label', ...fields })

test('CHT-40: grouped bars — the option validated, every measure allowed side by side, stacked still Count or Sum (TC-CHT-32)', () => {
  assert.deepEqual(cleanOptions('bar', 'average', { grouping: 'grouped' }), { grouping: 'grouped' })
  assert.deepEqual(cleanOptions('bar', 'count', { grouping: 'grouped', orientation: 'vertical' }), { orientation: 'vertical', grouping: 'grouped' })
  assert.equal(cleanOptions('bar', 'count', { grouping: 'stacked' }), undefined, 'stacked is the default: not written')
  assert.equal(cleanOptions('bar', 'count', { grouping: 'side' }), undefined, 'an unknown value dropped')
  assert.equal(cleanOptions('line', 'count', { grouping: 'grouped' }), undefined, 'only a bar chart')
  assert.equal(isGrouped(bar({ options: { grouping: 'grouped' } })), true)
  assert.equal(isGrouped(bar({ second: '', options: { grouping: 'grouped' } })), false, 'no second field: a single bar')
  // Stacked: an Average cannot be stacked (as before); grouped: Average, Minimum and Maximum are fine.
  assert.match(insightProblems(page(), bar())[0], /cannot be stacked.*Grouped \(side by side\)/)
  for (const measure of ['average', 'min', 'max', 'distinct', 'count', 'sum']) assert.deepEqual(insightProblems(page(), bar({ measure, value: measure === 'count' ? '' : 'c2', options: { grouping: 'grouped' } })), [], measure)
  // The values of each category × series: Rework — Berlin 30 (average of 40 and 20), Leeds 90; Scrap — Lyon 30.
  const data = chartData(page(), bar({ options: { grouping: 'grouped' } }))
  assert.deepEqual(data.series.map((ser) => ser.label), ['Berlin', 'Leeds', 'Lyon'])
  assert.deepEqual(data.values, [[null, null, 30], [30, 90, null]])
  assert.match(insightSubject(page(), bar({ options: { grouping: 'grouped' } })), /grouped by Site$/)
  // A grouped bar is not stacked: Excel's clustered positions, Outside End included; one trendline per series.
  assert.deepEqual(labelPositions('bar', false), ['center', 'insideEnd', 'insideBase', 'outsideEnd'])
  assert.equal(resolveElements('column', { position: 'outsideEnd' }, { stacked: false }).position, 'outsideEnd')
  assert.equal(resolveElements('column', { position: 'outsideEnd' }, { stacked: true }).position, 'center', 'stacked: as before')
  assert.deepEqual(trendLines([[1, 10], [2, 20], [3, 30]], 2).map((line) => [line.col, line.from, line.to]), [[0, 1, 3], [1, 10, 30]])
  // Written only when set, read back from the file; a dashboard block the same.
  const file = { ...page(), insights: [bar({ options: { grouping: 'grouped' } })] }
  assert.deepEqual(parseOnDemandPage(serializeOnDemandPage(file), 'p').insights[0].options, { grouping: 'grouped' })
  const block = { id: 'b1', title: 'G', type: 'bar', source: 'page:p', category: 'c4', second: 'c5', measure: 'average', value: 'c2', sort: 'value', options: { grouping: 'grouped' } }
  const { dashboard } = parseDashboard(JSON.stringify({ schema: 1, kind: 'dashboard', id: 'd', tabs: [], filters: [], blocks: [block] }), 'd')
  assert.deepEqual(dashboard.blocks[0].options, { grouping: 'grouped' })
  assert.match(serializeDashboard(dashboard), /"grouping": "grouped"/)
})

test('CHT-40: the layout of a group — bars side by side in the band, centred, never wider than the band (TC-CHT-32)', () => {
  const two = groupedSlots(100, 2, 40)
  assert.equal(two.gap, 2)
  assert.ok(Math.abs(two.size - 39) < 1e-9, `two bars of (80 − 2) / 2: ${two.size}`)
  assert.deepEqual(two.offsets.map((offset) => Number(offset.toFixed(3))), [-20.5, 20.5])
  // The thickness is capped: three bars of at most 18 px in a wide band.
  const capped = groupedSlots(300, 3, 18)
  assert.equal(capped.size, 18)
  assert.deepEqual(capped.offsets, [-20, 0, 20])
  // Many series in a narrow band: each bar at least 1 px, the group within 80% of the band.
  const tight = groupedSlots(20, 5, 40)
  assert.ok(tight.size >= 1 && tight.size * 5 + tight.gap * 4 <= 16 + 1e-9)
  const one = groupedSlots(50, 1, 40)
  assert.deepEqual([one.size, one.offsets], [40, [0]])
  // The row of grouped horizontal bars: today's 30 px for up to two series, taller with more; scaled by the height.
  assert.equal(groupedRowHeight(2), 30)
  assert.equal(groupedRowHeight(5), 50)
  assert.equal(groupedRowHeight(2, 1.5), 45)
})

test('CHT-41: colour pins — a palette colour 1…5 or #rrggbb, validated when read, merged as one entry; old pins as before (TC-CHT-33)', () => {
  assert.deepEqual(parseColors({ Berlin: 3, Leeds: '#1F77B4', Lyon: '#abc', Bad: 'red', Zero: 0, Six: 6, ' Spaced   out ': '#00ff00' }), { Berlin: 3, Leeds: '#1f77b4', 'Spaced out': '#00ff00' })
  assert.equal(parseColors({ X: 'javascript:alert(1)', Y: '#12345g' }), undefined)
  // The page file keeps both kinds; a page without pins is written as before.
  const file = { ...page(), colors: { Berlin: 2, Leeds: '#e377c2' } }
  assert.deepEqual(parseOnDemandPage(serializeOnDemandPage(file), 'p').colors, { Berlin: 2, Leeds: '#e377c2' })
  assert.doesNotMatch(serializeOnDemandPage(page()), /colors/)
  // GIT-17: the pins are one entry — the later save's where both changed them.
  const base = serializeOnDemandPage({ ...page(), colors: { Berlin: 1 } })
  const mine = serializeOnDemandPage({ ...page(), colors: { Berlin: '#112233' } })
  const theirs = serializeOnDemandPage({ ...page(), colors: { Berlin: 4 } })
  assert.deepEqual(parseOnDemandPage(mergeOnDemandText(base, mine, theirs, true), 'p').colors, { Berlin: '#112233' })
  assert.deepEqual(parseOnDemandPage(mergeOnDemandText(base, mine, theirs, false), 'p').colors, { Berlin: 4 })
  // Drawing: a palette pin is its token (it follows the theme), a hex pin itself.
  assert.equal(pinColor(3), 'var(--viz-series-3)')
  assert.equal(pinColor('#1f77b4'), '#1f77b4')
  assert.equal(pinHex(1, 'dark'), paletteHex.dark[0])
  assert.equal(pinHex('#1f77b4', 'dark'), '#1f77b4')
  // What a person types: #rgb and #rrggbb in any case, with or without "#"; nothing else.
  assert.equal(normalizeHex('#ABC'), '#aabbcc')
  assert.equal(normalizeHex(' 1f77b4 '), '#1f77b4')
  for (const bad of ['', '#12', '#1234', 'blue', '#ggg000', 'rgb(1,2,3)']) assert.equal(normalizeHex(bad), '', bad)
})

test('CHT-41: the WCAG non-text contrast check (3:1 against the chart background, light and dark) and the readable label colour (TC-CHT-33)', () => {
  assert.equal(Number(contrast('#ffffff', '#000000').toFixed(2)), 21)
  assert.equal(contrast('#777777', '#777777'), 1)
  // A pale yellow is low in the light theme, a near-black in the dark theme, a mid blue fine in both.
  assert.deepEqual(lowContrast('#ffff66').map((entry) => entry.theme), ['light'])
  assert.deepEqual(lowContrast('#202020').map((entry) => entry.theme), ['dark'])
  assert.deepEqual(lowContrast('#1f77b4'), [])
  assert.match(contrastWarning('#ffff66'), /^Low contrast against the chart background in the light theme \(1\.\d:1\); at least 3:1/)
  assert.equal(contrastWarning('#1f77b4'), '')
  assert.ok(contrast('#ffff66', chartBackground.light) < 3 && contrast('#ffff66', chartBackground.dark) >= 3)
  // A label on a pale bar is dark, on a dark bar white; on a palette token the chart's style applies (as before).
  assert.equal(labelOn('#ffff66'), darkText)
  assert.equal(labelOn('#0b3d91'), lightText)
  assert.equal(labelOn('var(--viz-series-1)'), '')
  // The better of the two text colours: 4.5:1 or more on pale and dark colours; a mid grey still gets the better one.
  for (const hex of ['#ffff66', '#0b3d91', '#e377c2', '#7f7f7f']) {
    const other = labelOn(hex) === darkText ? lightText : darkText
    assert.ok(contrast(hex, labelOn(hex)) >= contrast(hex, other), hex)
  }
  for (const hex of ['#ffff66', '#0b3d91', '#e377c2']) assert.ok(contrast(hex, labelOn(hex)) >= 4.5, `${hex}: readable label (${contrast(hex, labelOn(hex)).toFixed(2)})`)
})
