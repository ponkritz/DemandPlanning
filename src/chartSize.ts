// CHT-15…CHT-22, CHT-43…CHT-50 The size of a chart panel on the chart grid: a width in columns of a 12-column grid
// (2…12) and a height in rows of about 40 px. The presets of before map onto it — ⅓ / ½ / ⅔ / Full = 4 / 6 / 8 / 12
// columns, Small / Medium / Large = the row counts of today's heights — so a chart nobody resized looks as before.
// Three places set it, the first one found wins: the viewer's own size (personal views, else this browser), the owner's
// (the Insights chart or Dashboard block in Git; for a built-in chart the shared views defaults saved by a Tool Owner)
// and the chart's factory size. Pure functions only: the React side is src/components/ChartSize.tsx, the placement on
// the grid src/chartGrid.ts.

export type ChartWidth = 'third' | 'half' | 'twothirds' | 'full'
export type ChartHeight = 'small' | 'medium' | 'large'
// A size in grid units: w columns of 12, h rows.
export interface GridSize { w: number; h: number }
export type ChartSize = GridSize
export type SizeSource = 'viewer' | 'owner' | 'factory'
// What a panel holds: its minimum size and how its height relates to the drawing (CHT-45).
export type GridKind = 'chart' | 'pie' | 'table' | 'kpi'

export const gridColumns = 12
export const rowUnit = 40 // px of one row (the gap between rows comes on top)
export const gridGap = 18 // px between columns and rows
export const maxRows = 30

export const chartWidths: ChartWidth[] = ['third', 'half', 'twothirds', 'full']
export const chartHeights: ChartHeight[] = ['small', 'medium', 'large']
export const widthLabels: Record<ChartWidth, string> = { third: '⅓', half: '½', twothirds: '⅔', full: 'Full' }
export const widthNames: Record<ChartWidth, string> = { third: 'One third (⅓)', half: 'Half (½)', twothirds: 'Two thirds (⅔)', full: 'Full width' }
export const heightLabels: Record<ChartHeight, string> = { small: 'Small', medium: 'Medium', large: 'Large' }
// CHT-44: the columns of the 12-column grid each width preset takes.
export const widthCols: Record<ChartWidth, number> = { third: 4, half: 6, twothirds: 8, full: 12 }
// The chart's drawing height against today's (Medium) — the factors of CHT-16.
export const heightFactor: Record<ChartHeight, number> = { small: 0.75, medium: 1, large: 1.5 }
// CHT-44: the rows of each height preset — today's panel heights rounded up to whole rows (a column, line or bar chart
// about 420 px at Medium: 8 rows of 40 px and 7 gaps = 446 px; a donut beside its legend about 300 px: 6 rows).
export const heightRows: Record<GridKind, Record<ChartHeight, number>> = {
  chart: { small: 6, medium: 8, large: 12 },
  pie: { small: 5, medium: 6, large: 9 },
  table: { small: 4, medium: 4, large: 4 },
  kpi: { small: 3, medium: 3, large: 3 },
}
// CHT-45: the smallest size of each kind (a KPI 2 × 3, a chart 3 × 5, a summary table 4 × 4).
export const minSize: Record<GridKind, GridSize> = { kpi: { w: 2, h: 3 }, chart: { w: 3, h: 5 }, pie: { w: 3, h: 5 }, table: { w: 4, h: 4 } }
// Below this width (px) every chart is full width, nothing can be resized or moved (CHT-46).
export const narrowScreen = 720
// CHT-46: the columns of a chart grid at its width (px) on a screen of `screen` px: 12; 6 on a medium-wide screen
// (a grid under 880 px); 1 on a phone (a screen under 720 px or a grid under 560 px).
export const gridColsFor = (width: number, screen: number) => screen < narrowScreen || width < 560 ? 1 : width < 880 ? 6 : gridColumns
export const kindOf = (type: string): GridKind => type === 'pie' ? 'pie' : type === 'table' ? 'table' : type === 'kpi' ? 'kpi' : 'chart'

export const isWidth = (value: unknown): value is ChartWidth => typeof value === 'string' && (chartWidths as string[]).includes(value)
export const isHeight = (value: unknown): value is ChartHeight => typeof value === 'string' && (chartHeights as string[]).includes(value)
const int = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

// A size clamped to the grid and the kind's minimum.
export const clampSize = (size: GridSize, kind: GridKind = 'chart', cols = gridColumns): GridSize => ({ w: clamp(Math.round(size.w), Math.min(cols, minSize[kind].w), cols), h: clamp(Math.round(size.h), minSize[kind].h, maxRows) })
// The presets as grid units, and back (the nearest preset: what an older app shows, CHT-50).
export const presetSize = (width: ChartWidth, height: ChartHeight, kind: GridKind = 'chart'): GridSize => ({ w: widthCols[width], h: heightRows[kind][height] })
// A size halfway between two presets is named after the larger one.
export function nearestWidth(w: number): ChartWidth {
  let best: ChartWidth = 'half', distance = Infinity
  for (const width of chartWidths) { const off = Math.abs(widthCols[width] - w); if (off <= distance) { distance = off; best = width } }
  return best
}
export function nearestHeight(h: number, kind: GridKind = 'chart'): ChartHeight {
  let best: ChartHeight = 'medium', distance = Infinity
  for (const height of chartHeights) { const off = Math.abs(heightRows[kind][height] - h); if (off <= distance) { distance = off; best = height } }
  return best
}
// The preset a size is exactly (or none): to name it and to write it as before.
export const exactWidth = (w: number) => chartWidths.find((width) => widthCols[width] === w)
export const exactHeight = (h: number, kind: GridKind = 'chart') => chartHeights.find((height) => heightRows[kind][height] === h)

// CHT-45: the drawing's height factor for a panel of h rows — 0.75 / 1 / 1.5 at the Small / Medium / Large rows (as
// before), in between and beyond in proportion (a KPI or a summary table takes the height of its content: 1).
export function heightFactorOf(h: number, kind: GridKind = 'chart'): number {
  if (kind === 'table' || kind === 'kpi') return 1
  const rows = heightRows[kind]
  const points: [number, number][] = [[rows.small, heightFactor.small], [rows.medium, 1], [rows.large, heightFactor.large]]
  if (h <= rows.medium) { const [[r0, f0], [r1, f1]] = points; return Math.max(0.4, f0 + (h - r0) * (f1 - f0) / (r1 - r0)) }
  const [, [r1, f1], [r2, f2]] = points
  return f1 + (h - r1) * (f2 - f1) / (r2 - r1)
}

// A stored size (personal views, the shared defaults): grid units `w` / `h` (CHT-48) or the presets of before
// (`width` / `height`, mapped); only usable values are kept; nothing usable → undefined.
export function parseChartSize(raw: unknown, kind: GridKind = 'chart'): Partial<GridSize> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const item = raw as Record<string, unknown>
  const out: Partial<GridSize> = {}
  const w = int(item.w), h = int(item.h)
  if (w != null && w >= 1) out.w = clampSize({ w, h: minSize[kind].h }, kind).w
  else if (isWidth(item.width)) out.w = widthCols[item.width]
  if (h != null && h >= 1) out.h = clampSize({ w: minSize[kind].w, h }, kind).h
  else if (isHeight(item.height)) out.h = heightRows[kind][item.height]
  return out.w != null || out.h != null ? out : undefined
}
// What is stored for a viewer's size or a shared default: the grid units and the nearest presets (which an app before
// the grid reads, CHT-50).
export const storedSize = (size: GridSize, kind: GridKind = 'chart') => ({ width: nearestWidth(size.w), height: nearestHeight(size.h, kind), w: size.w, h: size.h })

// CHT-47: the owner's place on the grid, `options.grid` — x 0…11, y 0…500, w, h — validated: whole numbers, clamped
// to the grid (x + w ≤ 12) and the kind's minimum; anything else dropped.
export interface GridBox { x: number; y: number; w: number; h: number }
export function parseGridBox(raw: unknown, kind: GridKind = 'chart'): GridBox | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const item = raw as Record<string, unknown>
  const [x, y, w, h] = [int(item.x), int(item.y), int(item.w), int(item.h)]
  if (x == null || y == null || w == null || h == null || w < 1 || h < 1) return undefined
  const size = clampSize({ w, h }, kind)
  return { x: clamp(x, 0, gridColumns - size.w), y: clamp(y, 0, 500), ...size }
}

// The owner's size of an Insights chart or a Dashboard block from its display options: the grid (CHT-47) when set,
// else the presets (`size`, `height`; the v10 values 'half' and 'full' read as before).
export function sizeFromOptions(options: { size?: unknown; height?: unknown; grid?: unknown } | undefined, kind: GridKind = 'chart'): Partial<GridSize> | undefined {
  const box = parseGridBox(options?.grid, kind)
  if (box) return { w: box.w, h: box.h }
  const out: Partial<GridSize> = {}
  if (isWidth(options?.size)) out.w = widthCols[options.size]
  if (isHeight(options?.height) && kind !== 'table' && kind !== 'kpi') out.h = heightRows[kind][options.height]
  return out.w != null || out.h != null ? out : undefined
}
type SizeOptions = { size?: ChartWidth; height?: 'small' | 'large'; grid?: GridBox }
// The options with a size written back. Without a place on the grid a preset size is written as before (a factory
// value left out, so a chart nobody resized is written as before; keepWidth: a width chosen in the pop-up is written
// even when it is the factory one, as in v10). With a place (or a size between the presets) `grid` holds it and
// `size` / `height` the nearest presets for older apps (CHT-50).
export function withSizeOptions<T extends SizeOptions>(options: T | undefined, size: Partial<GridSize>, factory: GridSize = pairFactory, keepWidth = false, kind: GridKind = 'chart'): T | undefined {
  const out = { ...(options ?? {}) } as T
  const grid = parseGridBox(out.grid, kind)
  delete out.size; delete out.height; delete out.grid
  const w = size.w ?? factory.w, h = size.h ?? factory.h
  const exact = exactWidth(w) && (kind === 'table' || kind === 'kpi' || exactHeight(h, kind))
  if (grid || !exact) return withGridBox(out, { x: grid?.x ?? 0, y: grid?.y ?? 0, w, h }, kind)
  if (keepWidth || w !== factory.w) out.size = nearestWidth(w)
  const height = nearestHeight(h, kind)
  if (kind !== 'table' && kind !== 'kpi' && height !== 'medium') out.height = height
  return Object.keys(out).length ? out : undefined
}
// CHT-47, CHT-50: the options with the owner's place on the grid, and the nearest presets for older apps.
export function withGridBox<T extends SizeOptions>(options: T | undefined, box: GridBox, kind: GridKind = 'chart'): T | undefined {
  const out = { ...(options ?? {}) } as T
  delete out.size; delete out.height
  const clean = parseGridBox(box, kind)
  if (!clean) { delete out.grid; return Object.keys(out).length ? out : undefined }
  const width = nearestWidth(clean.w), height = nearestHeight(clean.h, kind)
  if (width !== 'half') out.size = width
  if (kind !== 'table' && kind !== 'kpi' && height !== 'medium') out.height = height
  out.grid = clean
  return out
}

// Precedence: the viewer's own size > the owner's (or shared) default > the factory size, field by field.
export function resolveChartSize({ viewer, owner, factory }: { viewer?: Partial<GridSize>; owner?: Partial<GridSize>; factory: GridSize }): { size: GridSize; source: SizeSource; base: GridSize } {
  const base: GridSize = { ...factory, ...(owner ?? {}) }
  if (viewer && (viewer.w != null || viewer.h != null)) return { size: { ...base, ...viewer }, source: 'viewer', base }
  return { size: base, source: owner && (owner.w != null || owner.h != null) ? 'owner' : 'factory', base }
}

export const sameSize = (a: GridSize, b: GridSize) => a.w === b.w && a.h === b.h
// CHT-44: the size as a short label ("8 × 6") and in words, naming the preset when it is one.
export const gridText = (size: GridSize) => `${size.w} × ${size.h}`
export function sizeText(size: GridSize, kind: GridKind = 'chart') {
  const width = exactWidth(size.w), height = exactHeight(size.h, kind)
  const words = kind === 'table' || kind === 'kpi' ? `${width ? `width ${widthLabels[width]}` : `${size.w} of 12 columns`}, ${size.h} rows` : width && height ? `width ${widthLabels[width]}, height ${heightLabels[height]}` : `${size.w} of 12 columns, ${size.h} rows`
  return `${gridText(size)} (${words})`
}

// CHT-49: the handle's keyboard — → / ← one column wider / narrower, ↓ / ↑ one row taller / lower, clamped to the kind's
// minimum and the grid; other keys null.
export function stepSize(size: GridSize, key: string, kind: GridKind = 'chart', cols = gridColumns): GridSize | null {
  const step: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] }
  const by = step[key]
  if (!by) return null
  const wide = cols === gridColumns ? 1 : gridColumns / cols
  return clampSize({ w: size.w + by[0] * wide, h: size.h + by[1] }, kind)
}

// The width of `span` columns of a grid `gridWidth` wide with `gap` between its `cols` columns.
export const spanWidth = (span: number, gridWidth: number, gap: number, cols = gridColumns) => span * ((gridWidth - (cols - 1) * gap) / cols) + (span - 1) * gap
// The height of `rows` rows.
export const spanHeight = (rows: number, unit = rowUnit, gap = gridGap) => rows * unit + (rows - 1) * gap
// CHT-49: a dragged width snapped to whole columns (in 12ths; on a 6-column grid to 2 at a time).
export function snapWidth(px: number, gridWidth: number, gap: number, cols = gridColumns): number {
  const column = (gridWidth - (cols - 1) * gap) / cols
  const span = Math.max(1, Math.min(cols, Math.round((px + gap) / (column + gap))))
  return span * (gridColumns / cols)
}
// A dragged height snapped to whole rows: `from` rows dragged `dy` px.
export const snapHeight = (from: number, dy: number, unit = rowUnit, gap = gridGap) => Math.max(1, from + Math.round(dy / (unit + gap)))

// The key of a chart's size in personal views (and the shared defaults): `chart-size:` and the chart's id.
export const chartSizeKey = (id: string) => { const key = `chart-size:${id}`; return /^[\w:.-]{1,80}$/.test(key) ? key : '' }
export const insightChartId = (pageId: string, insightId: string) => `ondemand:${pageId}:${insightId}`
export const blockChartId = (pageId: string, blockId: string) => `dashboard:${pageId}:${blockId}`
// The Insights tab and the Dashboard: half width, Medium when nothing is set (CHT-11); a built-in chart: full width.
export const pairFactory: GridSize = { w: 6, h: 8 }
export const stackFactory: GridSize = { w: 12, h: 8 }
export const factoryOf = (kind: GridKind, factory: GridSize = pairFactory): GridSize => ({ w: factory.w, h: kind === 'chart' ? factory.h : heightRows[kind].medium })
// CHT-19: the built-in charts in the shared chart frame, by stable id.
export const builtInCharts = {
  epicMix: 'overview:epic-mix-by-month',
  overrun: 'overview:overrun-hours',
  adhoc: 'overview:adhoc-hours',
} as const
