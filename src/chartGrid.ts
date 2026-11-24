import { clampSize, gridColumns, minSize, type GridBox, type GridKind, type GridSize } from './chartSize.ts'

// CHT-43…CHT-50 The placement of chart panels on the chart grid, as a dashboard grid does it: each panel has a place
// (x, y) and a size (w × h) in grid units; panels never overlap and gaps close upward ("compaction"). Pure functions
// (tests/chart-grid.test.mjs); the React side is ChartGrid in src/components/ChartSize.tsx.
//
// Compaction: the panels are taken in reading order (by y, then x — a moved panel by where it was dropped) and each is
// put at its own columns, below the panels placed before it that it would overlap, then as high as it goes. A panel without a place (a chart added
// later, or every chart of a page nobody arranged) follows the others in the order of the page, left to right, like
// the flow of before; so a page nobody arranged is laid out exactly as before (two half-width charts per row).

// top (CHT-51): a KPI card — without a place it goes in the row(s) of cards above every other panel, as before.
export interface GridEntry { id: string; kind: GridKind; size: GridSize; box?: GridBox; top?: boolean }
// card (CHT-51): the box of a KPI card — the rows its cards take at the top (the "card band") are kept for cards: a chart
// below them never moves up beside them by compaction, only when the owners drop it there.
export type LayoutBox = GridBox & { card?: boolean }
export type Layout = Record<string, LayoutBox>
type Item = { id: string; x: number; key: number; w: number; h: number; card?: boolean }
export const overlaps = (a: GridBox, b: GridBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const bottomOf = (boxes: GridBox[]) => boxes.reduce((all, box) => Math.max(all, box.y + box.h), 0)

// Where a panel wanted at row `from` goes: below every placed panel it would overlap there, then up as far as it can
// without overlapping one (it never jumps over a panel above it, so the reading order is kept).
// `floor`: the first row it may take (below the cards of CHT-51).
function settle(placed: GridBox[], x: number, from: number, w: number, h: number, floor = 0): number {
  let y = Math.max(floor, Math.ceil(from))
  for (;;) {
    const hit = placed.filter((box) => overlaps(box, { x, y, w, h }))
    if (!hit.length) break
    y = Math.max(...hit.map((box) => box.y + box.h))
  }
  while (y > floor && !placed.some((box) => overlaps(box, { x, y: y - 1, w, h }))) y -= 1
  return y
}
// Compaction of panels with a wanted place (`key`: the row they sort by; x their column), in reading order.
// CHT-51: the card band — the rows of the KPI cards that start at the top, one under the other — takes no chart that
// wants a place below it (a chart dropped into it stays there).
export function compact(items: Item[], order: string[] = [], floor = 0): Layout {
  const rank = (id: string) => { const at = order.indexOf(id); return at < 0 ? order.length : at }
  const sorted = [...items].sort((a, b) => a.key - b.key || a.x - b.x || rank(a.id) - rank(b.id))
  // The band: the cards from the top down while they touch it; a chart that starts at or below the bottom of one of
  // them is "below the cards" and stays below the whole band.
  let band = 0, below = Infinity
  for (const item of sorted) if (item.card && item.key <= band) { band = Math.max(band, Math.ceil(item.key) + item.h); below = Math.min(below, Math.ceil(item.key) + item.h) }
  const placed: GridBox[] = []
  const out: Layout = {}
  for (const item of sorted) {
    const low = floor + (!item.card && band && item.key >= below ? band : 0)
    let box: LayoutBox = { x: item.x, y: settle(placed, item.x, item.key + floor, item.w, item.h, low), w: item.w, h: item.h }
    // A card of the band pushed down by a wider neighbour first tries the next free place to the right in its row.
    const row = Math.max(floor, Math.ceil(item.key))
    if (item.card && item.key < band && box.y > row) {
      for (let x = 0; x + item.w <= gridColumns; x += 1) {
        const probe = { x, y: row, w: item.w, h: item.h }
        if (x >= item.x && !placed.some((other) => overlaps(other, probe))) { box = probe; break }
      }
    }
    if (item.card) box.card = true
    placed.push(box); out[item.id] = box
  }
  return out
}
// The flow of before: each panel after the previous one, on the same row when it fits, else on the next free row.
function flow(entries: { id: string; w: number; h: number }[], placed: GridBox[], cols: number): Layout {
  const out: Layout = {}
  let row = bottomOf(placed), col = 0
  for (const entry of entries) {
    const w = Math.min(cols, entry.w)
    for (;;) {
      if (col + w > cols) { col = 0; row += 1; continue }
      const probe = { x: col, y: row, w, h: entry.h }
      if (placed.some((box) => overlaps(box, probe))) { col += 1; continue }
      placed.push(probe); out[entry.id] = probe; col += w; break
    }
  }
  return out
}

// A size on a grid of `cols` columns (12; 6 on a medium-wide screen: two of twelve each; 1 on a phone).
function onGrid(size: GridSize, kind: GridKind, cols: number): GridSize {
  if (cols === gridColumns) return clampSize(size, kind)
  const scale = gridColumns / cols
  return { w: Math.min(cols, Math.max(Math.ceil(minSize[kind].w / scale), Math.ceil(size.w / scale))), h: clampSize(size, kind).h }
}

// CHT-43, CHT-47: the layout of a grid's panels. `entries` in the page's order, each with its size (the viewer's own or
// the owner's) and the owner's place when set. Places are validated: clamped into the grid, overlaps resolved by
// compaction (so a file merged from two saves, or edited by hand, is drawn without overlaps). On a phone every panel is
// full width, one under the other in reading order.
export function packLayout(entries: GridEntry[], cols = gridColumns): Layout {
  const order = entries.map((entry) => entry.id)
  const sized = entries.map((entry) => ({ ...entry, size: onGrid(entry.size, entry.kind, cols) }))
  const scale = gridColumns / cols
  const placedItems = sized.filter((entry) => entry.box).map((entry) => {
    const box = entry.box!
    const x = Math.max(0, Math.min(cols - entry.size.w, Math.floor(box.x / scale)))
    return { id: entry.id, x, key: box.y, w: entry.size.w, h: entry.size.h, card: entry.top }
  })
  // CHT-51: KPI cards without a place first, in their own row(s) at the top; the arranged panels below them.
  const cards = Object.fromEntries(Object.entries(flow(sized.filter((entry) => !entry.box && entry.top).map((entry) => ({ id: entry.id, ...entry.size })), [], cols)).map(([id, box]) => [id, { ...box, card: true }]))
  const layout = { ...cards, ...compact(placedItems, order, layoutRows(cards)) }
  const rest = flow(sized.filter((entry) => !entry.box && !entry.top).map((entry) => ({ id: entry.id, ...entry.size })), Object.values(layout), cols)
  if (cols === 1) {
    // A phone: one column in the reading order of the full grid.
    const all = packLayout(entries)
    let y = 0
    const out: Layout = {}
    for (const id of [...order].sort((a, b) => all[a].y - all[b].y || all[a].x - all[b].x || order.indexOf(a) - order.indexOf(b))) { out[id] = { x: 0, y, w: 1, h: all[id].h }; y += all[id].h }
    return out
  }
  return { ...layout, ...rest }
}

// CHT-47: a panel moved to (x, y) — the others shift out of its way and every gap closes upward. Dropped on the top row
// of another panel it goes before that panel; lower down, after it.
export function movePanel(layout: Layout, id: string, x: number, y: number, cols = gridColumns): Layout {
  const box = layout[id]
  if (!box) return layout
  const items = Object.entries(layout).map(([key, entry]) => key === id
    ? { id: key, x: Math.max(0, Math.min(cols - entry.w, Math.round(x))), key: Math.max(0, y) - 0.5, w: entry.w, h: entry.h, card: entry.card }
    : { id: key, x: entry.x, key: entry.y, w: entry.w, h: entry.h, card: entry.card })
  return compact(items)
}
// CHT-47: the keyboard's move (Shift + arrows): ← / → one column; ↑ / ↓ past the panel above or below it (gaps close
// upward, so a panel moves down by going after the next one in its columns). Null for other keys; the same layout when
// it cannot move further.
export function stepMove(layout: Layout, id: string, key: string, cols = gridColumns): Layout | null {
  const box = layout[id]
  if (!box) return null
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const x = Math.max(0, Math.min(cols - box.w, box.x + (key === 'ArrowLeft' ? -1 : 1)))
    return x === box.x ? layout : movePanel(layout, id, x, box.y + 0.5, cols)
  }
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return null
  const sharing = (other: GridBox) => other.x < box.x + box.w && box.x < other.x + other.w
  const others = Object.entries(layout).filter(([key2, other]) => key2 !== id && sharing(other)).map(([, other]) => other)
  if (key === 'ArrowUp') {
    const above = others.filter((other) => other.y < box.y).sort((a, b) => b.y - a.y)[0]
    return above ? movePanel(layout, id, box.x, above.y, cols) : layout
  }
  const below = others.filter((other) => other.y > box.y || (other.y === box.y && other.x > box.x)).sort((a, b) => a.y - b.y)[0]
  return below ? compact(Object.entries(layout).map(([key2, entry]) => ({ id: key2, x: entry.x, key: key2 === id ? below.y + 0.5 : entry.y, w: entry.w, h: entry.h, card: entry.card }))) : layout
}
// CHT-43: a panel resized — the others below or beside it shift out of its way; gaps close upward.
export function resizePanel(layout: Layout, id: string, size: GridSize, cols = gridColumns): Layout {
  const box = layout[id]
  if (!box) return layout
  const w = Math.min(cols, size.w)
  const items = Object.entries(layout).map(([key, entry]) => key === id
    ? { id: key, x: Math.max(0, Math.min(cols - w, entry.x)), key: entry.y - 0.5, w, h: size.h, card: entry.card }
    : { id: key, x: entry.x, key: entry.y, w: entry.w, h: entry.h, card: entry.card })
  return compact(items)
}
// The panels whose place or size differs between two layouts (what an owner's change writes).
export const changedPanels = (before: Layout, after: Layout) => Object.keys(after).filter((id) => { const a = before[id], b = after[id]; return !a || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h })
export function layoutRows(layout: Layout) { return bottomOf(Object.values(layout)) }
// KB-89, CHT-55: the panels that start on the same grid row as `id` (the row it heads), it included.
export const rowOf = (layout: Layout, id: string) => { const box = layout[id]; return box ? Object.keys(layout).filter((key) => layout[key].y === box.y) : [] }
// KB-89, CHT-55: Match heights in this row — every panel starting on the row of `id` takes the tallest height among
// them (or `h` when given); the others shift out of the way, gaps close upward.
export function matchRowHeights(layout: Layout, id: string, h?: number): Layout {
  const row = rowOf(layout, id)
  if (!row.length) return layout
  const tallest = h ?? Math.max(...row.map((key) => layout[key].h))
  return compact(Object.entries(layout).map(([key, entry]) => ({ id: key, x: entry.x, key: entry.y, w: entry.w, h: row.includes(key) ? tallest : entry.h, card: entry.card })))
}
