import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanOptions, cleanTemplate, insightKindOf, mergeOnDemandText, narrativeError, parseInsights, parseNarrative, parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { chartData, insightError, insightProblems, withType } from '../src/onDemandInsights.ts'
import { fillTemplate, narrativeFacts, narrativeInfo, narrativeLines, periodBefore, placeholderValues, ruleMatches } from '../src/narratives.ts'
import { blockError, narrowRows, parseDashboard, serializeDashboard, withBlockType } from '../src/dashboardPages.ts'
import { narrowInsightRows, resolveFilterSetup } from '../src/insightFilters.ts'
import { embedJson } from '../src/standaloneHtml.ts'

// CHT-60…CHT-69 Narratives: the automatic sentences (currency, filters, the previous period, empty data), the rules
// (order, modes, Else), the placeholders (text only), the validation of the stored field and its merge.

const columns = [
  { id: 'c1', name: 'Department', type: 'dropdown', options: ['Post-Production', 'Assembly', 'Design', 'Supplier', '{total}'], required: false },
  { id: 'c2', name: 'Cost', type: 'currency', options: [], required: false, currency: 'EUR' },
  { id: 'c3', name: 'Found on', type: 'date', options: [], required: false },
]
// EUR: Q4 2026 Post-Production 12,000 + 8,000, Design 5,000 (25,000); Q3 2026 Assembly 12,000, Post-Production 6,000,
// Design 2,000 (20,000) — 45,000 across 6 rows; one row of 500 USD.
const rows = [
  ['Post-Production', '12000 EUR', '2026-10-05'], ['Post-Production', '8000 EUR', '2026-11-10'], ['Design', '5000 EUR', '2026-11-20'],
  ['Assembly', '12000 EUR', '2026-08-01'], ['Post-Production', '6000 EUR', '2026-09-15'], ['Design', '2000 EUR', '2026-07-03'], ['Supplier', '500 USD', '2026-09-01'],
].map(([c1, c2, c3], index) => ({ id: `r${index + 1}`, seq: index + 1, cells: { c1, c2, c3 } }))
const page = (list = rows) => ({ schema: 1, kind: 'on-demand-page', id: 'conq', name: 'CoNQ', description: '', keyPrefix: 'CONQ', columns: structuredClone(columns), rows: structuredClone(list), insights: [] })
const narrative = (extra = {}) => ({ id: 'n1', title: 'CoNQ summary', type: 'narrative', category: 'c1', second: '', measure: 'sum', value: 'c2', filters: [], sort: 'value', narrative: { auto: ['total', 'top'], rules: [], ...extra } })
const texts = (result) => result.lines.map((line) => line.text)

test('CHT-61: the total, the highest and lowest category with its share — a Currency measure in one currency (TC-CHT-50)', () => {
  const insight = narrative({ auto: ['total', 'top', 'bottom'] })
  assert.deepEqual(texts(narrativeLines(page(), insight)), [
    'Sum of Cost: 45,000 EUR across 6 rows.',
    'Highest Department: Post-Production with 26,000 EUR (57.8% of the total).',
    'Lowest Department: Design with 7,000 EUR (15.6% of the total).',
  ])
  // OND-24: another currency is shown on its own, never added to the euros.
  assert.deepEqual(texts(narrativeLines(page(), insight, { currency: 'USD' })), ['Sum of Cost: 500 USD across 1 row.', 'Highest Department: Supplier with 500 USD (100% of the total).'])
  // Count of rows: the rows in words; an Average has no share of a total.
  assert.deepEqual(texts(narrativeLines(page(), { ...insight, measure: 'count', value: '' })).slice(0, 2), ['7 rows counted.', 'Highest Department: Post-Production with 3 (42.9% of the total).'])
  assert.equal(texts(narrativeLines(page(), { ...insight, measure: 'average' }))[1], 'Highest Department: Assembly with 12,000 EUR.')
  // Every line of an automatic sentence is Info.
  assert.ok(narrativeLines(page(), insight).lines.every((line) => line.tone === 'info' && line.from === 'auto'))
})

test('CHT-61: its own filters and the filter row narrow the sentences; no row counted is “nothing to report” (TC-CHT-50)', () => {
  const own = { ...narrative(), filters: [{ column: 'c1', values: ['Design'] }] }
  assert.deepEqual(texts(narrativeLines(page(), own)), ['Sum of Cost: 7,000 EUR across 2 rows.', 'Highest Department: Design with 7,000 EUR (100% of the total).'])
  // The filter row of the Insights tab (OND-54): Department = Assembly.
  const setup = resolveFilterSetup({ ...page(), insightFilters: { fields: ['c1'] } })
  const narrowed = narrowInsightRows(page(), setup, { period: { years: [], quarters: [], months: [] }, fields: { c1: { values: ['Assembly'] } } }, 2026)
  assert.deepEqual(texts(narrativeLines(narrowed.page, narrative())), ['Sum of Cost: 12,000 EUR across 1 row.', 'Highest Department: Assembly with 12,000 EUR (100% of the total).'])
  // Empty data: no sentence, no rule, no Else.
  const everything = narrative({ auto: ['total', 'top', 'bottom', 'change', 'threshold', 'mover'], period: 'c3', threshold: { op: 'above', value: 1 }, rules: [{ metric: 'total', op: 'le', value: 0, template: 'Nothing spent', tone: 'good' }], otherwise: 'Else' })
  assert.deepEqual(narrativeLines(page([]), everything).lines, [])
  assert.deepEqual(narrativeLines(page(), { ...everything, filters: [{ column: 'c1', values: ['(none)'] }] }).lines, [])
  // ⓘ and the row count read the narrative as a KPI (every matched row once).
  assert.equal(chartData(page(), narrative()).rows.used, 6)
})

test('CHT-62: the change against the previous period (month, quarter, year) — counted outside the period chosen (TC-CHT-51)', () => {
  assert.deepEqual(periodBefore('2026-Q1', 'quarter'), { key: '2025-Q4', label: 'Q4 2025' })
  assert.deepEqual(periodBefore('2026-01', 'month'), { key: '2025-12', label: 'Dec 2025' })
  assert.deepEqual(periodBefore('2026', 'year'), { key: '2025', label: '2025' })
  const insight = narrative({ auto: ['change', 'mover'], period: 'c3', grain: 'quarter' })
  assert.deepEqual(texts(narrativeLines(page(), insight)), [
    'Q4 2026: 25,000 EUR, up 25% vs Q3 2026 (20,000 EUR).',
    'Biggest mover from Q3 2026 to Q4 2026: Post-Production, up 14,000 EUR (+233.3%).',
  ])
  // The filter row keeps Q4 only: the previous quarter comes from its rows without the period (InsightNarrowed.base).
  const setup = resolveFilterSetup({ ...page(), insightFilters: { period: 'c3', fields: [] } })
  const q4 = narrowInsightRows(page(), setup, { period: { years: [2026], quarters: ['2026-Q4'], months: [] }, fields: {} }, 2026)
  assert.equal(q4.page.rows.length, 3)
  assert.equal(texts(narrativeLines(q4.page, insight, { compare: q4.base }))[0], 'Q4 2026: 25,000 EUR, up 25% vs Q3 2026 (20,000 EUR).')
  assert.equal(texts(narrativeLines(q4.page, insight))[0], 'Q4 2026: 25,000 EUR; nothing in Q3 2026 to compare with.')
  // By month: Nov 2026 13,000 against Oct 2026 12,000; down and unchanged in words.
  assert.equal(texts(narrativeLines(page(), narrative({ auto: ['change'], period: 'c3' })))[0], 'Nov 2026: 13,000 EUR, up 8.3% vs Oct 2026 (12,000 EUR).')
  const down = page(rows.slice(0, 1).concat([{ id: 'x', seq: 9, cells: { c1: 'Design', c2: '24000 EUR', c3: '2026-09-02' } }]))
  assert.equal(texts(narrativeLines(down, narrative({ auto: ['change'], period: 'c3', grain: 'quarter' })))[0], 'Q4 2026: 12,000 EUR, down 50% vs Q3 2026 (24,000 EUR).')
  // A Dashboard block: the rows of the period, and those of the filter row without it (Narrowed.base).
  const dataset = { key: 'page:conq', name: 'CoNQ', page: page() }
  const block = { id: 'b1', title: 'Summary', type: 'narrative', source: 'page:conq', category: 'c1', second: '', measure: 'sum', value: 'c2', filters: [], sort: 'value', period: 'c3', tab: '', narrative: insight.narrative }
  const narrowedBlock = narrowRows(dataset, block, ['2026-10', '2026-11', '2026-12'])
  assert.equal(narrowedBlock.page.rows.length, 3)
  assert.equal(narrowedBlock.base.rows.length, 7)
})

test('CHT-61: above / below a threshold — the Group by values, or the total without one (TC-CHT-50)', () => {
  assert.deepEqual(texts(narrativeLines(page(), narrative({ auto: ['threshold'], threshold: { op: 'above', value: 10000 } }))), ['2 of 3 Department values above 10,000 EUR: Post-Production, Assembly.'])
  assert.deepEqual(texts(narrativeLines(page(), narrative({ auto: ['threshold'], threshold: { op: 'below', value: 1000 } }))), ['0 of 3 Department values below 1,000 EUR.'])
  assert.deepEqual(texts(narrativeLines(page(), { ...narrative({ auto: ['threshold'], threshold: { op: 'above', value: 50000 } }), category: '' })), ['Sum of Cost, 45,000 EUR, is not above 50,000 EUR.'])
})

test('CHT-63: rules in order — every rule that matches or only the first, and the Else sentence (TC-CHT-52)', () => {
  const rules = [
    { metric: 'total', op: 'gt', value: 20000, template: 'CoNQ cost above budget: {value}', tone: 'warning' },
    { metric: 'share', op: 'ge', value: 50, template: '{top} holds {share} of the cost', tone: 'bad' },
    { metric: 'count', op: 'lt', value: 3, template: 'Few findings', tone: 'good' },
    { metric: 'top', op: 'is_top', value: 'post-production', template: 'Top again: {top} ({top_value})', tone: 'info' },
    { metric: 'change', op: 'changed', value: 20, template: 'Moved {change} in {period}', tone: 'warning' },
  ]
  const all = narrativeLines(page(), narrative({ auto: [], rules, period: 'c3', grain: 'quarter', otherwise: 'All quiet' }))
  assert.deepEqual(all.lines, [
    { tone: 'warning', text: 'CoNQ cost above budget: 45,000 EUR', from: 'rule' },
    { tone: 'bad', text: 'Post-Production holds 57.8% of the cost', from: 'rule' },
    { tone: 'info', text: 'Top again: Post-Production (26,000 EUR)', from: 'rule' },
    { tone: 'warning', text: 'Moved +25% in Q4 2026', from: 'rule' },
  ])
  const first = narrativeLines(page(), narrative({ auto: ['total'], rules, mode: 'first', period: 'c3', grain: 'quarter' }))
  assert.deepEqual(texts(first), ['Sum of Cost: 45,000 EUR across 6 rows.', 'CoNQ cost above budget: 45,000 EUR'])
  // No rule matches: the Else sentence (Info), its placeholders filled.
  const quiet = narrativeLines(page(), narrative({ auto: [], rules: [rules[2]], otherwise: 'Nothing unusual: {total} in {count} rows' }))
  assert.deepEqual(quiet.lines, [{ tone: 'info', text: 'Nothing unusual: 45,000 EUR in 6 rows', from: 'else' }])
  // The comparisons: = and ≤ / ≥ on the value itself; no number (no Group by, no period) never matches.
  const facts = narrativeFacts(page(), { ...narrative(), category: '' })
  assert.equal(ruleMatches({ metric: 'total', op: 'eq', value: 45000 }, facts), true)
  assert.equal(ruleMatches({ metric: 'total', op: 'ge', value: 45000 }, facts), true)
  assert.equal(ruleMatches({ metric: 'total', op: 'gt', value: 45000 }, facts), false)
  assert.equal(ruleMatches({ metric: 'total', op: 'le', value: 45000.0000001 }, facts), true)
  assert.equal(ruleMatches({ metric: 'share', op: 'gt', value: 0 }, facts), false)
  assert.equal(ruleMatches({ metric: 'change', op: 'changed', value: 0 }, facts), false)
  assert.equal(ruleMatches({ metric: 'top', op: 'is_top', value: 'Design' }, facts), false)
})

test('CHT-64: placeholders are replaced by text in one pass — markup stays text, unknown ones are dropped when stored (TC-CHT-53)', () => {
  const facts = narrativeFacts(page(), narrative({ period: 'c3', grain: 'quarter' }))
  const values = placeholderValues(facts, { metric: 'total', op: 'gt' })
  assert.deepEqual(values, { value: '45,000 EUR', total: '45,000 EUR', top: 'Post-Production', top_value: '26,000 EUR', share: '57.8%', change: '+25%', period: 'Q4 2026', count: '6', category: 'Department' })
  // A category named "{total}" is not expanded again; unknown braces in a template are left as typed at fill time.
  const odd = page([{ id: 'x', seq: 1, cells: { c1: '{total}', c2: '10 EUR', c3: '2026-01-01' } }])
  assert.equal(fillTemplate('Top: {top}, {unknown}', placeholderValues(narrativeFacts(odd, narrative()))), 'Top: {total}, {unknown}')
  // Stored: plain text — tags and control characters out, unknown placeholders dropped, at most 300 characters.
  assert.equal(cleanTemplate('<b>Cost</b> <script>alert(1)</script>is {value}\u0007 {evil} {top}'), 'Cost alert(1)is {value} {top}')
  assert.equal(cleanTemplate('Cost < 5 and > 2'), 'Cost < 5 and > 2')
  assert.equal(cleanTemplate('x'.repeat(400)).length, 300)
  // In the interactive HTML file (OND-94) a narrative's templates travel as data: the embedded JSON has no "<", ">" or "&"
  // that could end the data block, and the viewer draws the sentences with React as text (as in the app).
  const embedded = embedJson({ template: '<img src=x onerror=alert(1)> & more </script>' })
  assert.doesNotMatch(embedded, /[<>&]/)
  assert.deepEqual(JSON.parse(embedded), { template: '<img src=x onerror=alert(1)> & more </script>' })
})

test('CHT-68: the narrative field validated when read and written in a fixed order; older fields unchanged (TC-CHT-54)', () => {
  const raw = { auto: ['total', 'sparkle', 'top'], period: 'c3', grain: 'decade', threshold: { op: 'sideways', value: '5' }, mode: 'random', otherwise: '<p>Else</p>',
    rules: [
      { metric: 'total', op: 'gt', value: '20000', template: 'Above {value} {nope}', tone: 'warning' },
      { metric: 'total', op: 'between', value: 1, template: 'Dropped: unknown operator' },
      { metric: 'top', op: 'gt', value: 1, template: 'Dropped: top is not a number' },
      { metric: 'total', op: 'lt', value: 'many', template: 'Dropped: no number' },
      { metric: 'count', op: 'ge', value: 2, template: '   ' },
      { metric: 'whatever', op: 'changed', value: -10, template: 'Changed', tone: 'loud' },
      { op: 'is_top', value: '  Design ', template: 'Design leads' },
    ] }
  assert.deepEqual(parseNarrative(raw), { auto: ['total', 'top'], period: 'c3', threshold: { op: 'above', value: 5 }, otherwise: 'Else', rules: [
    { metric: 'total', op: 'gt', value: 20000, template: 'Above {value}', tone: 'warning' },
    { metric: 'change', op: 'changed', value: 10, template: 'Changed', tone: 'info' },
    { metric: 'top', op: 'is_top', value: 'Design', template: 'Design leads', tone: 'info' },
  ] })
  assert.equal(parseNarrative({ rules: Array.from({ length: 30 }, () => ({ metric: 'count', op: 'gt', value: 1, template: 'x' })) }).rules.length, 20)
  assert.deepEqual(parseNarrative('not an object'), { auto: [], rules: [] })
  // In the page file: the type, its Group by (optional) and the narrative; a chart's options it does not take dropped.
  const [read] = parseInsights([{ ...narrative({ grain: 'year', mode: 'first' }), second: 'c1', options: { orientation: 'vertical', height: 'large', dateGroup: 'year', size: 'full', grid: { x: 0, y: 0, w: 2, h: 1 } } }])
  assert.equal(read.type, 'narrative')
  assert.equal(read.second, '')
  assert.deepEqual(read.options, { size: 'full', grid: { x: 0, y: 0, w: 4, h: 4 } }, 'sized as a summary table: at least 4 × 4, no height preset')
  assert.equal(insightKindOf('narrative'), 'table')
  assert.deepEqual(cleanOptions('narrative', 'sum', { top: 5, percent: true, target: { value: 1, label: '' } }), undefined)
  const text = serializeOnDemandPage({ ...page(), insights: [read] })
  const stored = JSON.parse(text).insights[0]
  assert.deepEqual(Object.keys(stored.narrative), ['auto', 'grain', 'rules', 'mode'])
  assert.deepEqual(parseOnDemandPage(text).insights[0], read, 'read back as written')
  // An insight of another type carries no narrative field.
  const [bar] = parseInsights([{ id: 'b', title: 'Bar', type: 'bar', category: 'c1', measure: 'count', sort: 'value', narrative: { auto: ['total'] } }])
  assert.equal('narrative' in bar, false)
  assert.equal(JSON.stringify(serializeOnDemandPage({ ...page(), insights: [bar] })).includes('narrative'), false)
})

test('CHT-68: merged per insight (GIT-17) and as a Dashboard block; an older type list drops the block (LIM-50) (TC-CHT-54)', () => {
  const base = serializeOnDemandPage({ ...page(), insights: [narrative()] })
  const mine = serializeOnDemandPage({ ...page(), insights: [narrative({ rules: [{ metric: 'total', op: 'gt', value: 1, template: 'Mine', tone: 'good' }] })] })
  const theirs = serializeOnDemandPage({ ...page(), insights: [narrative(), { id: 'i2', title: 'Rows', type: 'kpi', category: '', second: '', measure: 'count', value: '', filters: [], sort: 'value' }] })
  const merged = parseOnDemandPage(mergeOnDemandText(base, mine, theirs, true))
  assert.deepEqual(merged.insights.map((entry) => entry.id), ['n1', 'i2'])
  assert.equal(merged.insights[0].narrative.rules[0].template, 'Mine')
  // The Dashboard block: validated, written and read back the same way; an unknown type is dropped with a message.
  const file = JSON.stringify({ schema: 1, kind: 'dashboard', id: 'd', tabs: [], filters: [], blocks: [
    { id: 'b1', title: 'Summary', type: 'narrative', source: 'page:conq', category: 'c1', measure: 'sum', value: 'c2', sort: 'label', narrative: { auto: ['total'], rules: [{ metric: 'total', op: 'gt', value: 5, template: '<b>Hi</b> {value}', tone: 'bad' }] } },
    { id: 'b2', title: 'Future', type: 'story', source: 'page:conq' },
  ] })
  const { dashboard, dropped } = parseDashboard(file)
  assert.equal(dashboard.blocks.length, 1)
  assert.match(dropped[0], /unknown type \(story\)/)
  assert.deepEqual(dashboard.blocks[0].narrative, { auto: ['total'], rules: [{ metric: 'total', op: 'gt', value: 5, template: 'Hi {value}', tone: 'bad' }] })
  assert.equal(dashboard.blocks[0].sort, 'value')
  assert.deepEqual(parseDashboard(serializeDashboard(dashboard)).dashboard, dashboard)
})

test('CHT-66: the pop-up’s checks — sentences and rules that need a Group by or a period, a number, a sentence (TC-CHT-55)', () => {
  assert.equal(narrativeError({ auto: ['top'], rules: [] }, false), 'Highest, lowest and biggest mover need a Group by column.')
  assert.equal(narrativeError({ auto: ['change'], rules: [] }, true), 'The change against the previous period needs the Date column of the period.')
  assert.equal(narrativeError({ auto: ['threshold'], threshold: { op: 'above', value: Number.NaN }, rules: [] }, true), 'Give the threshold a number, or untick “Above / below a threshold”.')
  assert.equal(narrativeError({ auto: [], rules: [{ metric: 'total', op: 'gt', value: '', template: 'x', tone: 'info' }] }, true), 'Rule 1 needs a number to compare with.')
  assert.equal(narrativeError({ auto: [], rules: [{ metric: 'total', op: 'gt', value: '3', template: ' <b></b> ', tone: 'info' }] }, true), 'Rule 1 has no sentence: write the sentence to show, or remove the rule.')
  assert.equal(narrativeError({ auto: [], rules: [{ metric: 'share', op: 'gt', value: 3, template: 'x', tone: 'info' }] }, false), 'Rule 1 looks at the top category: choose a Group by column first.')
  assert.equal(narrativeError({ auto: [], rules: [{ metric: 'change', op: 'changed', value: 3, template: 'x', tone: 'info' }] }, true), 'Rule 1 looks at the change against the previous period: choose the Date column of the period first.')
  assert.equal(narrativeError({ auto: ['total', 'top'], rules: [] }, true), '')
  // With the columns: a Group by or period column removed or of the wrong type is reported as for a chart (OND-17).
  assert.deepEqual(insightProblems(page(), narrative({ period: 'c1' })), ['“Department” for the period is now a Dropdown column; it needs Date.'])
  assert.deepEqual(insightProblems(page(), { ...narrative(), category: 'gone' }), ['The column for Group by is no longer on the page (removed).'])
  assert.equal(insightError(page(), { ...narrative(), title: 'x', category: '' }), 'Highest, lowest and biggest mover need a Group by column.')
  assert.equal(insightError(page(), { ...narrative({ auto: ['total'] }), title: 'x', category: '' }), '')
  // The type switch keeps the measure and adds (or removes) the narrative.
  const switched = withType(page(), { id: 'i', title: 'T', type: 'bar', category: 'c1', second: '', measure: 'sum', value: 'c2', filters: [], sort: 'label' }, 'narrative')
  assert.deepEqual([switched.type, switched.sort, switched.narrative], ['narrative', 'value', { auto: ['total', 'top'], rules: [] }])
  assert.equal('narrative' in withType(page(), switched, 'bar'), false)
  const dataset = { key: 'page:conq', name: 'CoNQ', page: page() }
  const block = withBlockType(dataset, { id: 'b1', title: 'S', type: 'bar', source: 'page:conq', category: 'c1', second: '', measure: 'sum', value: 'c2', filters: [], sort: 'value', period: '', tab: '' }, 'narrative')
  assert.deepEqual(block.narrative, { auto: ['total', 'top'], rules: [] })
  assert.equal(blockError(dataset, { ...block, narrative: { auto: ['mover'], rules: [] } }), 'The change against the previous period needs the Date column of the period.')
  // ⓘ lists the sentences, every rule in words and the mode.
  const info = narrativeInfo(page(), narrative({ period: 'c3', grain: 'quarter', mode: 'first', rules: [{ metric: 'total', op: 'gt', value: 20000, template: 'CoNQ cost above budget: {value}', tone: 'warning' }, { metric: 'top', op: 'is_top', value: 'Design', template: 'Design leads', tone: 'bad' }] }))
  assert.deepEqual(info.slice(0, 4), [
    'Sentences: Total, Highest category; the period: quarter of Found on.',
    'Rule 1. If Sum of Cost > 20,000: “CoNQ cost above budget: {value}” (Warning).',
    'Rule 2. If the top category is “Design”: “Design leads” (Bad).',
    'Only the first rule that matches is shown.',
  ])
})
