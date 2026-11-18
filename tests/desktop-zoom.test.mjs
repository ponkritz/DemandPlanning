import test from 'node:test'
import assert from 'node:assert/strict'
import { autoZoom, clampZoom, defaultZoom, loadZoom, saveZoom, stepZoom } from '../src/desktopZoom.ts'

test('UI-14: Auto zoom fits the 1440 × 880 layout into the window, 67%–100% in 5% steps; − / + in 10% steps, 50%–200%', () => {
  assert.equal(autoZoom(1920, 1080), 1, 'room enough: never zoomed in')
  assert.equal(autoZoom(1366, 768), 0.85, 'a 1366 × 768 laptop: the height decides')
  assert.equal(autoZoom(1280, 720), 0.8)
  assert.equal(autoZoom(800, 500), 0.67, 'never below 67%')
  assert.equal(autoZoom(0, 700), 1)
  assert.equal(stepZoom(1, 1), 1.1); assert.equal(stepZoom(0.85, -1), 0.8, 'back on the 10% grid'); assert.equal(stepZoom(0.5, -1), 0.5); assert.equal(stepZoom(2, 1), 2)
  assert.equal(clampZoom(Number.NaN), 1); assert.equal(clampZoom(3), 2)
})

test('UI-14: the zoom setting is kept per computer — Auto on by default, a hand-set zoom turns it off', () => {
  const store = new Map()
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  assert.deepEqual(loadZoom(storage), defaultZoom)
  saveZoom({ auto: false, factor: 0.9 }, storage)
  assert.deepEqual(loadZoom(storage), { auto: false, factor: 0.9 })
  store.set('demand-planning-desktop-zoom-v1', '{bad')
  assert.deepEqual(loadZoom(storage), defaultZoom)
})
