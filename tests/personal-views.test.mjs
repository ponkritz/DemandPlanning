import test from 'node:test'
import assert from 'node:assert/strict'
import { arrangeSections, emptyViews, moveSection, parseViews, personalViewsPath, serializeViews, withDefaults } from '../src/personalViews.ts'

test('personal views: a file per person, only known shapes kept, defaults under my own changes (MYD-06…MYD-09, TC-MYD-03)', () => {
  assert.equal(personalViewsPath(' Ana.Costa@Example.com '), 'personal-views/ana.costa@example.com.json')
  assert.equal(personalViewsPath('not an email'), '', 'no file without a work email')
  const mine = { ...emptyViews(), sections: { mydash: { order: ['work', 'hours'], hidden: ['streams'] } }, filters: { pulse: { kind: 'quarter', key: '2026-Q3' } } }
  assert.deepEqual(parseViews(serializeViews(mine)), mine, 'round trip')
  // Planted or broken input: unknown shapes, odd ids and huge filters are dropped; a non-views file reads as empty.
  const planted = parseViews(JSON.stringify({ schema: 1, kind: 'personal-views', sections: { 'mydash': { order: ['hours', '<script>', 7], hidden: 'all' }, 'bad key!': { order: ['x'] } }, menu: { pinned: ['pulse', null], hidden: [] }, filters: { big: 'x'.repeat(30000), ok: { a: 1 } } }))
  assert.deepEqual(planted.sections, { mydash: { order: ['hours'], hidden: [] } })
  assert.deepEqual(planted.menu, { pinned: ['pulse'], hidden: [] })
  assert.deepEqual(planted.filters, { ok: { a: 1 } })
  assert.deepEqual(parseViews('{"schema":1,"kind":"other"}'), emptyViews()); assert.deepEqual(parseViews('nope'), emptyViews())
  // The admin's defaults apply to pages I did not change, and to the menu when I set nothing.
  const defaults = { ...emptyViews(), sections: { mydash: { order: ['streams'], hidden: [] }, overview: { order: ['delivery'], hidden: ['forecast'] } }, menu: { pinned: ['pulse'], hidden: [] } }
  const merged = withDefaults(mine, defaults)
  assert.deepEqual(merged.sections.mydash, mine.sections.mydash, 'my page wins')
  assert.deepEqual(merged.sections.overview, defaults.sections.overview, 'other pages follow the default')
  assert.deepEqual(merged.menu.pinned, ['pulse'])
  assert.deepEqual(withDefaults({ ...mine, menu: { pinned: [], hidden: ['docs'] } }, defaults).menu, { pinned: [], hidden: ['docs'] }, 'my menu wins once set')
})

test('sections in my order: removed sections dropped, new ones placed after their neighbour, hidden apart (MYD-06, TC-MYD-03)', () => {
  const available = ['hours', 'work', 'streams']
  assert.deepEqual(arrangeSections(available, undefined), { order: available, shown: available, hidden: [] })
  assert.deepEqual(arrangeSections(available, { order: ['streams', 'hours', 'gone'], hidden: ['hours'] }), { order: ['streams', 'hours', 'work'], shown: ['streams', 'work'], hidden: ['hours'] }, 'a new section comes after the one before it on the page')
  assert.deepEqual(arrangeSections(['new', ...available], { order: ['work', 'hours', 'streams'], hidden: [] }).order, ['new', 'work', 'hours', 'streams'], 'a new first section goes first')
  assert.deepEqual(moveSection(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b'])
  assert.deepEqual(moveSection(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c'], 'no move past the ends')
})
