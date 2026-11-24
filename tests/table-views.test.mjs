import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseTableView, fitTableView, newerForEveryone, parseTableView, readOwnView, shareableView, startOwnView, writeOwnView } from '../src/tableViews.ts'
import { emptyViews, parseViewMeta, parseViews, serializeViews, viewEntryKey, viewMetaKey, withDefaultEntries, withDefaults } from '../src/personalViews.ts'
import { mergeViewsDefaultsText } from '../src/gitSaveQueue.ts'
import { orderedIds } from '../src/tableDefaults.ts'
import { readPeopleFilters, emptyFilters } from '../src/people.ts'

const memory = (entries = {}) => { const map = new Map(Object.entries(entries)); return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) } }
const everyone = { order: ['c', 'a', 'b'], hidden: ['b'], widths: { a: 180 }, wrap: true, density: 'compact', sort: { id: 'c', desc: true } }

test('views for everyone: own view > view for everyone > the table’s built-in view (TC-UI-13)', () => {
  assert.deepEqual(chooseTableView(undefined, undefined), { view: {}, source: 'table' }, 'nothing saved: the built-in view')
  assert.deepEqual(chooseTableView(undefined, everyone), { view: everyone, source: 'everyone' }, 'first time: the view for everyone')
  const own = { order: ['a', 'b', 'c'] }
  assert.deepEqual(chooseTableView(own, everyone), { view: own, source: 'own' }, 'my own changes win')
  // The first change starts my own view from the view for everyone (with its time), so I keep the rest of it.
  const started = startOwnView(everyone, '2026-11-24T10:00:00.000Z', { density: 'comfortable' })
  assert.deepEqual(started, { ...everyone, density: 'comfortable', base: '2026-11-24T10:00:00.000Z' })
  assert.deepEqual(startOwnView(undefined, undefined, { wrap: false }), { wrap: false }, 'without a view for everyone: only the change')
  assert.equal(newerForEveryone(started, '2026-11-24T10:00:00.000Z'), false, 'the same view for everyone: nothing new')
  assert.equal(newerForEveryone(started, '2026-11-25T08:00:00.000Z'), true, 'saved again later: "A new view for everyone is available"')
  assert.equal(newerForEveryone({ wrap: true }, '2026-11-25T08:00:00.000Z'), true, 'an own view from before any view for everyone')
  assert.equal(newerForEveryone(undefined, '2026-11-25T08:00:00.000Z'), false, 'no own view: the new one simply applies')
  assert.deepEqual(shareableView(started), { ...everyone, density: 'comfortable' }, 'the own-view mark is not saved for everyone')
})

test('views for everyone: columns that no longer exist are ignored, new ones come at the end shown; sort kept (TC-UI-14)', () => {
  const fitted = fitTableView({ ...everyone, order: ['c', 'gone', 'a'], hidden: ['gone', 'b'], widths: { a: 180, gone: 90 } }, ['a', 'b', 'c', 'new'])
  assert.deepEqual(fitted.order, ['c', 'a'])
  assert.deepEqual(fitted.hidden, ['b'])
  assert.deepEqual(fitted.widths, { a: 180 })
  assert.deepEqual(fitted.sort, { id: 'c', desc: true }, 'the sort column and direction stay')
  assert.deepEqual(orderedIds(['a', 'b', 'c', 'new'], fitted.order), ['c', 'a', 'b', 'new'], 'columns not in the view at the end')
  assert.equal(fitted.hidden.includes('new'), false, 'a new column is shown')
  assert.equal(fitTableView({ sort: { id: 'gone', desc: false } }, ['a']).sort, undefined, 'a sort on a removed column falls back to the table’s default sort')
})

test('views for everyone: only known shapes are read; the own view in the browser folds in the earlier width and wrap entries (TC-UI-14)', () => {
  assert.equal(parseTableView(null), undefined)
  assert.equal(parseTableView({ base: '2026-11-24T10:00:00.000Z' }), undefined, 'nothing but the mark: no view')
  assert.deepEqual(parseTableView({ order: ['a', 1, 'a', 'b'], hidden: 'x', widths: { a: 10, b: 99999, c: 'wide' }, wrap: 'yes', density: 'tiny', sort: { id: 'a', desc: 'yes' } }), { order: ['a', 'b'], widths: { a: 48, b: 2000 }, sort: { id: 'a', desc: false } })
  const storage = memory({ 'demand-planning-table-layout-v1:t': JSON.stringify({ order: ['b', 'a'] }), 'demand-planning-column-widths-v1:table:t': JSON.stringify({ a: 150 }), 'demand-planning-table-wrap-v1:table:t': '1' })
  assert.deepEqual(readOwnView('t', storage), { order: ['b', 'a'], widths: { a: 150 }, wrap: true })
  writeOwnView('t', { order: ['a', 'b'], sort: { id: 'a', desc: true } }, storage)
  assert.deepEqual(JSON.parse(storage.map.get('demand-planning-table-layout-v1:t')), { order: ['a', 'b'], sort: { id: 'a', desc: true } })
  assert.equal(storage.map.has('demand-planning-column-widths-v1:table:t'), false, 'the earlier entries are folded in')
  writeOwnView('t', undefined, storage)
  assert.equal(readOwnView('t', storage), undefined, 'Use the view for everyone / Reset layout: no own view left')
  assert.equal(readOwnView('none', memory()), undefined)
})

test('views for everyone: saved and cleared in the shared views defaults with who and when; merged per entry (TC-UI-15)', () => {
  const key = viewEntryKey('table', 'conq:data table/€')
  assert.match(key, /^[\w:.-]{1,80}$/)
  const long = viewEntryKey('table', `on-demand:${'x'.repeat(120)}`), other = viewEntryKey('table', `on-demand:${'x'.repeat(119)}y`)
  assert.equal(long.length, 80); assert.notEqual(long, other, 'two long ids stay apart')
  assert.match(viewMetaKey(long), /^by:[\w:.-]{1,77}$/)
  const meta = { by: 'owner@example.com', at: '2026-11-24T10:00:00.000Z' }
  let defaults = withDefaultEntries(emptyViews(), { [key]: everyone, [viewMetaKey(key)]: meta, 'bad key!': 1 })
  defaults = parseViews(serializeViews(defaults))
  assert.deepEqual(defaults.filters[key], everyone)
  assert.deepEqual(parseViewMeta(defaults.filters[viewMetaKey(key)]), meta)
  assert.equal('bad key!' in defaults.filters, false)
  assert.equal(parseViewMeta({ by: 'x', at: 'yesterday' }), undefined)
  // A viewer who never changed the table: the view for everyone; one with their own: theirs (personal views precedence).
  assert.deepEqual(withDefaults(emptyViews(), defaults).filters[key], everyone)
  // Clear the view for everyone removes both entries; a view for everyone of another table saved meanwhile is kept (GIT-17).
  const cleared = withDefaultEntries(defaults, { [key]: undefined, [viewMetaKey(key)]: undefined })
  assert.deepEqual(Object.keys(cleared.filters), [])
  const theirs = withDefaultEntries(defaults, { 'table:people': { order: ['email'] } })
  const merged = JSON.parse(mergeViewsDefaultsText(serializeViews(defaults), serializeViews(cleared), serializeViews(theirs), true))
  assert.deepEqual(Object.keys(merged.filters), ['table:people'], 'my clear and their save both survive')
})

test('views for everyone: People filters read back only in known shapes (TC-UI-17)', () => {
  assert.equal(readPeopleFilters('x'), undefined)
  assert.deepEqual(readPeopleFilters({ regions: ['EMEA', 3], status: ['active'], text: 7 }), { regions: ['EMEA'], roles: [], access: [], status: ['active'], text: '' })
  assert.deepEqual(readPeopleFilters({}).status, emptyFilters.status, 'no status: the built-in start')
})
