import test from 'node:test'
import assert from 'node:assert/strict'
import { stickyBarPlacement } from '../src/stickyScrollbar.ts'

// A 1440 × 900 window with a 41 px sticky footer (its top at 859) and a table 1120 px wide holding 2400 px of columns.
const wide = { scrollWidth: 2400, clientWidth: 1120, viewportHeight: 900, footerTop: 859 }

test('UI-24: the sticky scroll bar of a wide table sits right above the footer while the table’s bottom is out of view (TC-UI-19)', () => {
  assert.deepEqual(stickyBarPlacement({ ...wide, box: { top: 300, bottom: 2000, left: 276 } }), { show: true, left: 276, width: 1120, bottom: 41 }, 'above the footer, as wide as the table and in line with it')
  assert.deepEqual(stickyBarPlacement({ ...wide, box: { top: -900, bottom: 1200, left: 276 } }), { show: true, left: 276, width: 1120, bottom: 41 }, 'the table’s top scrolled away: still shown')
  assert.deepEqual(stickyBarPlacement({ ...wide, footerTop: 870, box: { top: 300, bottom: 2000, left: 276 } }), { show: true, left: 276, width: 1120, bottom: 30 }, 'the footer’s real height, not a fixed one')
})

test('UI-24: no sticky bar when the table fits, its bottom is in view or it has not scrolled into view yet; never two bars (TC-UI-19)', () => {
  assert.deepEqual(stickyBarPlacement({ ...wide, scrollWidth: 1120, box: { top: 300, bottom: 2000, left: 276 } }), { show: false }, 'the table fits its box')
  assert.deepEqual(stickyBarPlacement({ ...wide, scrollWidth: 1120.4, box: { top: 300, bottom: 2000, left: 276 } }), { show: false }, 'less than a pixel (zoom rounding) is not wider')
  assert.deepEqual(stickyBarPlacement({ ...wide, box: { top: 300, bottom: 859, left: 276 } }), { show: false }, 'the table’s bottom (with its own bar) right on the footer: its own bar shows')
  assert.deepEqual(stickyBarPlacement({ ...wide, box: { top: 300, bottom: 700, left: 276 } }), { show: false }, 'the table’s bottom in view')
  assert.deepEqual(stickyBarPlacement({ ...wide, box: { top: 830, bottom: 2000, left: 276 } }), { show: false }, 'only a sliver of the table above the footer')
  assert.deepEqual(stickyBarPlacement({ ...wide, box: { top: 1200, bottom: 2000, left: 276 } }), { show: false }, 'the table further down the page')
  assert.deepEqual(stickyBarPlacement({ ...wide, clientWidth: 0, box: { top: 300, bottom: 2000, left: 276 } }), { show: false }, 'a hidden table')
})

test('UI-24: without a sticky footer (none, or a phone where it scrolls with the page) the bar sits at the window’s bottom; a clipping panel’s edge wins when higher (TC-UI-19)', () => {
  assert.deepEqual(stickyBarPlacement({ ...wide, footerTop: undefined, box: { top: 300, bottom: 2000, left: 0 } }), { show: true, left: 0, width: 1120, bottom: 0 })
  assert.deepEqual(stickyBarPlacement({ ...wide, footerTop: undefined, box: { top: 300, bottom: 890, left: 0 } }), { show: false }, 'its bottom in view above the window’s edge')
  assert.deepEqual(stickyBarPlacement({ ...wide, clipBottom: 600, box: { top: 300, bottom: 2000, left: 276 } }), { show: true, left: 276, width: 1120, bottom: 300 }, 'a panel that scrolls the table')
  assert.deepEqual(stickyBarPlacement({ ...wide, clipBottom: 1500, box: { top: 300, bottom: 2000, left: 276 } }), { show: true, left: 276, width: 1120, bottom: 41 }, 'a panel taller than the window')
})
