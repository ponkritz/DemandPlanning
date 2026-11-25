// UI-24: where a wide table's sticky horizontal scroll bar goes. The bar is pinned to the bottom of the visible area —
// the top of the app's sticky footer, else the window's bottom edge, or a clipping panel's bottom edge when that is
// higher — while the table is wider than its box and the table's own bottom edge (with its own scroll bar) is below
// that line. Once the table's bottom comes into view the bar goes, so the table's own scroll bar takes over in the same
// place and there are never two. Pure, so it can be tested without a browser; the DOM side is StickyScrollbar.tsx.

export interface StickyBarInput {
  // The table's scroll box on screen (getBoundingClientRect) and its inner left edge (left + clientLeft).
  box: { top: number; bottom: number; left: number }
  scrollWidth: number
  clientWidth: number
  viewportHeight: number
  // The top edge of the app's sticky footer on screen; undefined when there is no footer or it does not stick (phones).
  footerTop?: number
  // The bottom edge of the nearest ancestor that clips the table (a panel with its own vertical scroll), if any.
  clipBottom?: number
  // How much of the table must show above the line before the bar is worth showing (its header row and a little).
  minShown?: number
}

export type StickyBar = { show: false } | { show: true; left: number; width: number; bottom: number }

export function stickyBarPlacement({ box, scrollWidth, clientWidth, viewportHeight, footerTop, clipBottom, minShown = 48 }: StickyBarInput): StickyBar {
  if (!(clientWidth > 0) || scrollWidth - clientWidth < 1) return { show: false }
  const line = Math.min(viewportHeight, footerTop ?? Infinity, clipBottom ?? Infinity)
  if (!(box.bottom > line + 0.5)) return { show: false } // the table's own bottom (and its scroll bar) is in view
  if (box.top + minShown > line) return { show: false } // the table has not scrolled into view yet
  return { show: true, left: box.left, width: clientWidth, bottom: Math.max(0, viewportHeight - line) }
}
