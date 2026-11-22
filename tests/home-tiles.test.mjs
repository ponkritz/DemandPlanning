import test from 'node:test'
import assert from 'node:assert/strict'
import { filterTiles, loadStartView, saveStartView, startPageOf, startViewKey, visibleTiles } from '../src/homeTiles.ts'
import { pageMeta } from '../src/pages/registry.ts'

const noop = () => {}
const link = (label, note) => ({ key: label, label, icon: '·', open: noop, ...(note ? { note } : {}) })
const tiles = [
  { key: 'release', title: 'Release Details', detail: 'The releases of each stream.', tone: 'lemon', open: noop, links: [link('DP'), link('IOCC'), link('Content', 'not set up yet')] },
  { key: 'admin', title: 'Admin', detail: 'Streams and Epic & Feature setup.', tone: 'sky', open: noop, links: [link('Overview'), link('People & roles')] },
]

test('NAV-43: a search keeps a matching tile whole, else only its matching links; nothing left out without a match (TC-NAV-42)', () => {
  assert.equal(filterTiles(tiles, '  '), tiles, 'no search: every tile')
  assert.deepEqual(filterTiles(tiles, 'release').map((tile) => [tile.key, tile.links.length]), [['release', 3]], 'the title matches: all its links')
  assert.deepEqual(filterTiles(tiles, 'iocc').map((tile) => [tile.key, tile.links.map((item) => item.label)]), [['release', ['IOCC']]], 'only the matching link')
  assert.deepEqual(filterTiles(tiles, 'not set').map((tile) => tile.links.map((item) => item.label)), [['Content']], 'a link’s note is searched too')
  assert.deepEqual(filterTiles(tiles, 'epic setup').map((tile) => tile.key), ['admin'], 'every word, in the description')
  assert.deepEqual(filterTiles(tiles, 'roles people').map((tile) => tile.links.map((item) => item.label)), [['People & roles']])
  assert.deepEqual(filterTiles(tiles, 'windchill'), [])
  assert.deepEqual(visibleTiles([tiles[0], null, tiles[1]]).map((tile) => tile.key), ['release', 'admin'], 'an area the person cannot open is dropped')
})

test('NAV-42: Home is a page of its own, open to everyone, without a month', () => {
  assert.deepEqual([pageMeta('home').label, pageMeta('home').group, pageMeta('home').usesMonth], ['Home', 'Home', false])
})

test('NAV-46: the tile view opens on Home, the classic view on My dashboard; the choice is kept in this browser (TC-NAV-46)', () => {
  const store = new Map()
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  assert.equal(loadStartView(storage), 'tiles', 'the tile view by default')
  assert.equal(startPageOf('tiles'), 'home')
  assert.equal(saveStartView('classic', storage), 'classic')
  assert.equal(store.get(startViewKey), 'classic')
  assert.equal(loadStartView(storage), 'classic')
  assert.equal(startPageOf('classic'), 'mydash')
  store.set(startViewKey, 'something else')
  assert.equal(loadStartView(storage), 'tiles', 'anything else is the tile view')
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(loadStartView(broken), 'tiles', 'storage blocked: the tile view')
  assert.equal(saveStartView('classic', broken), 'classic', 'the choice still applies for this page load')
})
