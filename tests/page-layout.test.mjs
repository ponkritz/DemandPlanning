import test from 'node:test'
import assert from 'node:assert/strict'
import { applyPageLayout, clampMargin, defaultPageLayout, loadPageLayout, normalizePageLayout, pageLayoutKey, savePageLayout } from '../src/pageLayout.ts'

const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), data } }

test('NAV-50: the page margins default to 10 / 20 / 10 / 20 px with a border (TC-NAV-50)', () => {
  assert.deepEqual(defaultPageLayout, { top: 10, right: 20, bottom: 10, left: 20, border: true })
  assert.deepEqual(loadPageLayout(memory()), defaultPageLayout, 'nothing saved: the defaults')
})

test('NAV-50: each side is kept between 0 and 64 px; anything else falls back to its default (TC-NAV-50)', () => {
  assert.equal(clampMargin(12.4, 10), 12)
  assert.equal(clampMargin(-5, 10), 0)
  assert.equal(clampMargin(500, 10), 64)
  assert.equal(clampMargin('abc', 20), 20)
  assert.equal(clampMargin('', 20), 20)
  assert.deepEqual(normalizePageLayout({ top: 0, right: '30', bottom: null, left: 99, border: false }), { top: 0, right: 30, bottom: 10, left: 64, border: false })
  assert.deepEqual(normalizePageLayout('nonsense'), defaultPageLayout)
})

test('NAV-50: a saved layout is read back; a broken saved value gives the defaults (TC-NAV-50)', () => {
  const storage = memory()
  assert.deepEqual(savePageLayout({ top: 4, right: 8, bottom: 12, left: 16, border: false }, storage), { top: 4, right: 8, bottom: 12, left: 16, border: false })
  assert.deepEqual(loadPageLayout(storage), { top: 4, right: 8, bottom: 12, left: 16, border: false })
  storage.data.set(pageLayoutKey, '{broken')
  assert.deepEqual(loadPageLayout(storage), defaultPageLayout)
})

test('NAV-50: applying sets one CSS variable per side and turns the border off only when asked (TC-NAV-50)', () => {
  const values = new Map(), attributes = new Map()
  const root = { style: { setProperty: (key, value) => values.set(key, value) }, setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key) }
  applyPageLayout({ top: 6, right: 24, bottom: 8, left: 24, border: false }, root)
  assert.deepEqual([...values], [['--page-m-top', '6px'], ['--page-m-right', '24px'], ['--page-m-bottom', '8px'], ['--page-m-left', '24px']])
  assert.equal(attributes.get('data-page-border'), 'off')
  applyPageLayout(defaultPageLayout, root)
  assert.equal(attributes.has('data-page-border'), false)
})
