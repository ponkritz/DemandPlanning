import test from 'node:test'
import assert from 'node:assert/strict'
import { parseThemePreference, nextThemePreference, resolveTheme, readThemePreference, themeStorageKey } from '../src/theme.ts'
import { relativeTime } from '../src/format.ts'

const memory = () => { const store = new Map(); return { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), store } }
test('theme preference parses, cycles and resolves against the system setting', () => {
  assert.equal(parseThemePreference('dark'), 'dark'); assert.equal(parseThemePreference('purple'), 'system'); assert.equal(parseThemePreference(null), 'system')
  assert.equal(nextThemePreference('system'), 'light'); assert.equal(nextThemePreference('light'), 'dark'); assert.equal(nextThemePreference('dark'), 'system')
  assert.equal(resolveTheme('system', true), 'dark'); assert.equal(resolveTheme('system', false), 'light'); assert.equal(resolveTheme('light', true), 'light')
})
test('?theme= applies once and is remembered; otherwise the stored preference is used', () => {
  const storage = memory()
  assert.equal(readThemePreference('?theme=dark', storage), 'dark'); assert.equal(storage.store.get(themeStorageKey), 'dark')
  assert.equal(readThemePreference('', storage), 'dark')
  assert.equal(readThemePreference('?theme=nonsense', storage), 'system')
  assert.equal(readThemePreference('', { getItem: () => { throw new Error('blocked') }, setItem: () => {} }), 'system')
})
test('relative freshness labels', () => {
  const now = new Date('2026-10-16T22:00:00Z')
  assert.equal(relativeTime(undefined, now), '—'); assert.equal(relativeTime('nope', now, 'never'), 'never')
  assert.equal(relativeTime('2026-10-16T21:59:40Z', now), 'just now'); assert.equal(relativeTime('2026-10-16T21:58:50Z', now), '1 min ago')
  assert.equal(relativeTime('2026-10-16T21:35:00Z', now), '25 min ago'); assert.equal(relativeTime('2026-10-16T19:00:00Z', now), '3 h ago')
  assert.equal(relativeTime('2026-10-15T21:00:00Z', now), '1 day ago'); assert.equal(relativeTime('2026-10-13T21:00:00Z', now), '3 days ago')
  assert.equal(relativeTime('2026-09-01T21:00:00Z', now), new Date('2026-09-01T21:00:00Z').toLocaleDateString())
})
