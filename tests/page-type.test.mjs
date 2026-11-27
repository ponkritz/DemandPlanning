import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseType, defaultTicks, editedKind, fixedSourceReason, fixedSourceText, newPageType, noTicks, pageSourceOut, pageTypeOf, parsePageSource, sourceProblem, tableLockReason, dashboardLockReason, tickReason, ticksOf, typeText, typeTicks } from '../src/pageType.ts'
import { emptyPage, mergeOnDemandText, parseOnDemandPage, serializeOnDemandPage } from '../src/onDemand.ts'
import { dataSources } from '../src/dashboardPages.ts'

const ref = { id: 'q1', name: 'Open defects', server: 'https://dev.azure.com/example', project: 'DHP', queryId: '0f8a3c1e-2b4d-4e6f-8a9b-1c2d3e4f5a6b' }
const keys = ['own', 'query', 'insights', 'dashboard']
const ticks = (...on) => ({ ...noTicks(), ...Object.fromEntries(on.map((key) => [key, true])) })

test('PGB-22: the four tick boxes in order, Table (Build your own) ticked by default', () => {
  assert.deepEqual(typeTicks.map((tick) => tick.label), ['Table (Build your own)', 'Table (Query)', 'Insights', 'Dashboard'])
  assert.deepEqual(defaultTicks(), ticks('own'))
  assert.deepEqual(pageTypeOf(defaultTicks()), { kind: 'table', source: 'own' })
})

test('PGB-22: every one of the 16 combinations of the four ticks is a page type or says why not (TC-PGB-17)', () => {
  const expected = {
    '': chooseType,
    own: { kind: 'table', source: 'own' },
    query: { kind: 'table', source: 'query' },
    'own+query': 'A table has one source: tick Table (Build your own) or Table (Query), not both.',
    insights: 'Insights reads a table’s rows: tick Table (Build your own) or Table (Query) as well.',
    'own+insights': { kind: 'table-insights', source: 'own' },
    'query+insights': { kind: 'table-insights', source: 'query' },
    'own+query+insights': 'A table has one source: tick Table (Build your own) or Table (Query), not both.',
    dashboard: { kind: 'dashboard', source: 'own' },
  }
  let valid = 0
  for (let mask = 0; mask < 16; mask++) {
    const on = keys.filter((_, at) => mask & (1 << at))
    const result = pageTypeOf(ticks(...on))
    const name = on.join('+')
    if (name in expected) assert.deepEqual(result, expected[name], name || 'nothing')
    else assert.equal(result, 'A Dashboard stands alone: untick the other choices, or untick Dashboard.', name)
    if (typeof result !== 'string') valid++
  }
  assert.equal(valid, 5, 'Dashboard; Table of either source; Table + Insights of either source')
  assert.equal(typeText({ kind: 'table-insights', source: 'query' }), 'Table + Insights · rows from an Azure DevOps query')
  assert.equal(typeText({ kind: 'table', source: 'own' }), 'Table · rows the team adds itself')
  assert.match(typeText({ kind: 'dashboard', source: 'own' }), /^On-Demand Dashboard · /)
})

test('PGB-22: a tick that would make a combination that is not a type is disabled with its reason; unticking is free (TC-PGB-17)', () => {
  // From every set that can be reached by ticking only enabled boxes, no tick of an enabled box leads to an invalid
  // combination other than "nothing yet" / "Insights alone" (reached only by unticking).
  for (let mask = 0; mask < 16; mask++) {
    const set = ticks(...keys.filter((_, at) => mask & (1 << at)))
    for (const key of keys) {
      const reason = tickReason(set, key)
      if (set[key]) { assert.equal(reason, '', `unticking ${key} is always allowed`); continue }
      if (typeof pageTypeOf(set) === 'string' && !['', 'insights'].includes(keys.filter((k) => set[k]).join('+'))) continue
      const next = pageTypeOf({ ...set, [key]: true })
      if (reason) assert.equal(typeof next, 'string', `${key} disabled only when it makes an invalid type`)
      else assert.ok(typeof next !== 'string' || next.startsWith('Insights reads'), `${key} enabled → a type (${next})`)
    }
  }
  assert.equal(tickReason(ticks('own'), 'query'), 'A table has one source: untick Table (Build your own) first.')
  assert.equal(tickReason(ticks('query', 'insights'), 'own'), 'A table has one source: untick Table (Query) first.')
  assert.equal(tickReason(ticks('own', 'insights'), 'dashboard'), 'A Dashboard stands alone: untick Table (Build your own) and Insights first.')
  assert.equal(tickReason(ticks('dashboard'), 'insights'), 'A Dashboard stands alone: untick Dashboard first.')
  assert.equal(tickReason(noTicks(), 'insights'), '', 'Insights can be ticked first; the main button then asks for a table source')
})

test('PGB-26: Edit page — the family and the table source are fixed, only Insights switches (TC-PGB-19)', () => {
  const lock = { family: 'table', source: 'query' }
  const set = ticksOf('table', 'query')
  assert.deepEqual(set, ticks('query'))
  assert.equal(tickReason(set, 'own', lock), fixedSourceReason('query'))
  assert.equal(fixedSourceReason('query'), 'The table’s rows come from a saved Azure DevOps query; add a new page for the other source.')
  assert.equal(tickReason(set, 'query', lock), fixedSourceText, 'the own source cannot be unticked either')
  assert.equal(tickReason(set, 'dashboard', lock), tableLockReason)
  assert.equal(tickReason(set, 'insights', lock), '')
  assert.deepEqual(editedKind({ ...set, insights: true }, lock), { kind: 'table-insights' })
  assert.deepEqual(editedKind({ ...noTicks(), dashboard: true, own: true }, lock), { kind: 'table' }, 'a forged tick changes nothing: the source and family stay')
  const own = { family: 'table', source: 'own' }
  assert.equal(tickReason(ticksOf('table-insights', 'own'), 'query', own), 'The table’s rows come from the team’s own rows (Build your own); add a new page for the other source.')
  assert.deepEqual(editedKind(ticksOf('table-insights', 'own'), own), { kind: 'table-insights' })
  const dash = { family: 'dashboard' }
  for (const key of keys) assert.equal(tickReason(ticksOf('dashboard', 'own'), key, dash), dashboardLockReason)
  assert.deepEqual(editedKind(ticks('own'), dash), { kind: 'dashboard' })
})

test('PGB-22, PGB-23: what Add page creates — a Table (Query) needs its reference; no other combination is created (TC-PGB-17, TC-PGB-18)', () => {
  assert.deepEqual(newPageType(ticks('own', 'insights'), null), { kind: 'table-insights' })
  assert.deepEqual(newPageType(ticks('dashboard'), ref), { kind: 'dashboard' }, 'a Dashboard never gets a source')
  assert.equal(newPageType(ticks('query'), null), 'Choose the saved query of the table.')
  assert.deepEqual(newPageType(ticks('query', 'insights'), { ...ref, pat: 'secret' }), { kind: 'table-insights', source: { kind: 'query', query: ref } })
  assert.equal(newPageType(ticks('query', 'dashboard'), ref), 'A Dashboard stands alone: untick the other choices, or untick Dashboard.')
  assert.match(newPageType(ticks('query'), { ...ref, server: 'http://dev.azure.com/example' }), /no valid https server\.$/)
})

test('PGB-27: the table source is validated when read — absent is Build your own, a bad one is kept read only with its reason (TC-PGB-20)', () => {
  for (const raw of [undefined, null, { kind: 'own' }]) assert.equal(parsePageSource(raw), undefined)
  assert.deepEqual(parsePageSource({ kind: 'query', query: { ...ref, pat: 'secret', rows: [1] }, extra: 'x' }), { kind: 'query', query: ref }, 'only the five keys')
  const bad = parsePageSource({ kind: 'query', query: { ...ref, queryId: 'not-a-guid', token: 'secret' } })
  assert.equal(bad.kind, 'invalid')
  assert.equal(sourceProblem(bad), 'The table’s query reference is not valid — The Azure query “Open defects” has no valid query id.')
  assert.deepEqual(pageSourceOut(bad), { source: { kind: 'query', query: { id: 'q1', name: 'Open defects', server: ref.server, project: 'DHP', queryId: 'not-a-guid' } } }, 'written back without the token')
  assert.equal(sourceProblem(parsePageSource({ kind: 'release' })), 'The table’s source “release” is not known to this version of the app: update the app.')
  assert.equal(sourceProblem(parsePageSource('query')), 'The table’s source in the page file is not readable.')
  assert.equal(sourceProblem(parsePageSource([1])), 'The table’s source in the page file is not readable.')
  assert.deepEqual(pageSourceOut(parsePageSource('query')), { source: { kind: 'invalid' } }, 'still a source: the page never turns into an editable table')
  assert.deepEqual(pageSourceOut(undefined), {})
})

test('PGB-23, PGB-27: page files — without a source unchanged; a query page keeps only its reference and insights, never rows (TC-PGB-18, TC-PGB-20)', () => {
  // Backward compatibility: a page file from before reads and writes exactly as before.
  const old = serializeOnDemandPage(parseOnDemandPage(JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'audits', name: 'Audits', description: '', keyPrefix: 'AUD', columns: [{ id: 'c1', name: 'Topic', type: 'text' }], rows: [{ id: 'r1', key: 'AUD-261127-K7Q2', seq: 1, cells: { c1: 'Seal' } }] }), 'audits'))
  assert.equal(parseOnDemandPage(old, 'audits').source, undefined)
  assert.equal(old.includes('source'), false)
  assert.equal(serializeOnDemandPage(parseOnDemandPage(old, 'audits')), old)
  // A query page: rows or columns in a crafted file are dropped, never written back.
  const crafted = JSON.stringify({ schema: 1, kind: 'on-demand-page', id: 'defects', name: 'Defects', description: '', keyPrefix: 'DEF', columns: [{ id: 'c1', name: 'Title', type: 'text' }], rows: [{ id: 'r1', cells: { c1: 'Seal leaks' } }], source: { kind: 'query', query: { ...ref, pat: 'test-pat' } }, insights: [{ id: 'i1', title: 'By state', type: 'bar', category: 'q_System_State', second: '', measure: 'count', filters: [], sort: 'value' }] })
  const page = parseOnDemandPage(crafted, 'defects')
  assert.deepEqual([page.columns, page.rows, page.source], [[], [], { kind: 'query', query: ref }])
  const text = serializeOnDemandPage({ ...page, rows: [{ id: 'r9', cells: { q_System_Title: 'Label faded' } }] })
  for (const word of ['test-pat', 'Seal leaks', 'Label faded']) assert.equal(text.includes(word), false, word)
  const written = JSON.parse(text)
  assert.deepEqual([written.columns, written.rows, written.source, written.insights.map((entry) => entry.category)], [[], [], { kind: 'query', query: ref }, ['q_System_State']])
  // Created by Add page with its source; merged, the source stays.
  const created = emptyPage('defects', 'Defects', '', { kind: 'query', query: ref })
  const base = serializeOnDemandPage(created)
  const mine = serializeOnDemandPage({ ...created, insights: page.insights })
  const theirs = serializeOnDemandPage({ ...created, name: 'Open defects' })
  const merged = parseOnDemandPage(mergeOnDemandText(base, mine, theirs, true), 'defects')
  assert.deepEqual([merged.name, merged.insights.length, merged.source], ['Open defects', 1, { kind: 'query', query: ref }])
  // A malformed source does not throw: the page reads, with the reason.
  const broken = parseOnDemandPage(JSON.stringify({ ...JSON.parse(crafted), source: { kind: 'query', query: 'nope' } }), 'defects')
  assert.equal(broken.source.kind, 'invalid')
  assert.equal(broken.rows.length, 0)
})

test('PGB-24: a Table (Query) page is not offered as a dashboard data source (it holds no rows in Git) (TC-PGB-18)', () => {
  const own = emptyPage('audits', 'Audits'), query = emptyPage('defects', 'Defects', '', { kind: 'query', query: ref })
  assert.deepEqual(dataSources([own, query], (id) => [own, query].find((page) => page.id === id), () => false, '').map((entry) => entry.name), ['Audits'])
})
