import type { InsightType } from './onDemand.ts'

// CHT-26…CHT-35 Chart elements, modelled on Excel's Chart Elements: chart title, axes, axis titles, data labels (on / off,
// position, contents, number format), data table, gridlines, legend and a linear trendline. The page owner (or the
// dashboard's builders) sets them for everyone as `options.elements` of an insight or block — written only when an
// element differs from its default, validated when read. Each default reproduces the chart as it was drawn before, so a
// chart without `elements` looks exactly as before. Kept free of React (tests/chart-elements.test.mjs).

export type ChartKind = 'bar' | 'column' | 'pareto' | 'line' | 'pie'
export type LabelPosition = 'center' | 'insideEnd' | 'insideBase' | 'outsideEnd' | 'left' | 'right' | 'above' | 'below' | 'bestFit'
export type LabelContent = 'value' | 'percent' | 'category' | 'series'
export type LegendPosition = 'none' | 'top' | 'bottom' | 'left' | 'right'
export type Gridline = 'majorH' | 'majorV' | 'minorH' | 'minorV'
export interface ChartElements {
  title?: false // the chart title (the panel's title) hidden — kept for screen readers and in the chart's accessible name
  axisX?: false // the horizontal axis (its tick or category labels) hidden
  axisY?: false // the vertical axis hidden
  titleX?: false // the horizontal axis title hidden
  titleY?: false // the vertical axis title hidden
  labels?: boolean // the owner's data labels: on or off for everyone (absent: each viewer's default); a viewer's own switch still wins
  position?: LabelPosition // where the data labels go (absent: as before)
  content?: LabelContent[] // what a label says, in Excel's order (series, category, value, percentage) (absent: the value; the percentage for a pie or Percent of total)
  decimals?: 0 | 1 | 2 // the number format: thousand separators and this many decimals (absent: as before, 12.3K)
  code?: true // the currency code after an amount
  dataTable?: true // the numbers in a table under the chart, with legend keys
  gridlines?: Gridline[] // the gridlines drawn (absent: as before — the major lines of the value axis)
  legend?: LegendPosition // where the legend goes (absent: as before — above the chart, beside a pie)
  trendline?: 'linear' // a least-squares straight line per series
}
// Excel's order, in the pop-up and in a label: Series name, Category name, Value, Percentage.
export const labelContents: LabelContent[] = ['series', 'category', 'value', 'percent']
export const gridlineKeys: Gridline[] = ['majorH', 'majorV', 'minorH', 'minorV']
export const legendPositions: LegendPosition[] = ['none', 'top', 'bottom', 'left', 'right']

// The kind of drawing an insight gets: horizontal bars, vertical columns, a Pareto, a line or a pie (none for a KPI or table).
export function chartKind(type: InsightType, orientation?: 'vertical'): ChartKind | null {
  if (type === 'bar') return orientation === 'vertical' ? 'column' : 'bar'
  return type === 'pareto' || type === 'line' || type === 'pie' ? type : null
}
const hasAxes = (kind: ChartKind) => kind !== 'pie'
// Excel's positions per chart type; a stacked bar or column has no Outside End (Excel does not offer it either).
export function labelPositions(kind: ChartKind, stacked = false): LabelPosition[] {
  if (kind === 'line') return ['center', 'left', 'right', 'above', 'below']
  if (kind === 'pie') return ['center', 'insideEnd', 'outsideEnd', 'bestFit']
  return stacked ? ['center', 'insideEnd', 'insideBase'] : ['center', 'insideEnd', 'insideBase', 'outsideEnd']
}
export const positionLabels: Record<LabelPosition, string> = { center: 'Center', insideEnd: 'Inside End', insideBase: 'Inside Base', outsideEnd: 'Outside End', left: 'Left', right: 'Right', above: 'Above', below: 'Below', bestFit: 'Best Fit' }
export const contentLabels: Record<LabelContent, string> = { value: 'Value', percent: 'Percentage', category: 'Category name', series: 'Series name' }
export const gridlineLabels: Record<Gridline, string> = { majorH: 'Major horizontal', majorV: 'Major vertical', minorH: 'Minor horizontal', minorV: 'Minor vertical' }
export const legendLabels: Record<LegendPosition, string> = { none: 'None', top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right' }
// Percentage is a share of a total: a pie's slices, or a chart with Percent of total.
export const contentsFor = (kind: ChartKind, percent = false): LabelContent[] => kind === 'pie' || (percent && (kind === 'bar' || kind === 'column' || kind === 'line')) ? labelContents : labelContents.filter((entry) => entry !== 'percent')
export const trendlineFor = (kind: ChartKind) => kind === 'bar' || kind === 'column' || kind === 'line'

// The defaults: what each chart drew before chart elements.
export const defaultPosition = (kind: ChartKind, stacked = false): LabelPosition => kind === 'line' ? 'above' : kind === 'pie' ? 'center' : stacked ? 'center' : 'outsideEnd'
export const defaultContent = (kind: ChartKind, percent = false): LabelContent[] => kind === 'pie' || (percent && kind !== 'pareto') ? ['percent'] : ['value']
export const defaultGridlines = (kind: ChartKind): Gridline[] => kind === 'bar' ? ['majorV'] : kind === 'pie' ? [] : ['majorH']
export const defaultLegend = (kind: ChartKind): LegendPosition => kind === 'pie' ? 'right' : 'top'

const same = <T>(a: T[], b: T[]) => a.length === b.length && a.every((entry, index) => entry === b[index])

// CHT-35: `options.elements` as read from a file or set in the pop-up — unknown keys and values dropped, an element the
// chart type does not take dropped, a value equal to its default left out; nothing left: undefined (not written).
export function cleanElements(type: InsightType, options: { orientation?: 'vertical'; percent?: true } | undefined, raw: unknown): ChartElements | undefined {
  const kind = chartKind(type, options?.orientation)
  if (!kind || !raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const item = raw as Record<string, unknown>
  const out: ChartElements = {}
  if (item.title === false) out.title = false
  if (hasAxes(kind)) for (const key of ['axisX', 'axisY', 'titleX', 'titleY'] as const) if (item[key] === false) out[key] = false
  if (typeof item.labels === 'boolean') out.labels = item.labels
  // The position is checked against the type's own list (stacking is not known here: a stacked chart draws Outside End
  // as Center, CHT-28); the default for an unstacked chart is left out.
  if (typeof item.position === 'string' && labelPositions(kind).includes(item.position as LabelPosition) && item.position !== defaultPosition(kind)) out.position = item.position as LabelPosition
  if (Array.isArray(item.content)) {
    const offered = contentsFor(kind, Boolean(options?.percent))
    const content = labelContents.filter((entry) => item.content && (item.content as unknown[]).includes(entry) && offered.includes(entry))
    if (content.length && !same(content, defaultContent(kind, Boolean(options?.percent)))) out.content = content
  }
  if (item.decimals === 0 || item.decimals === 1 || item.decimals === 2) out.decimals = item.decimals
  if (item.code === true) out.code = true
  if (hasAxes(kind)) {
    if (item.dataTable === true) out.dataTable = true
    if (Array.isArray(item.gridlines)) {
      const lines = gridlineKeys.filter((key) => (item.gridlines as unknown[]).includes(key))
      if (!same(lines, defaultGridlines(kind))) out.gridlines = lines
    }
  }
  if (typeof item.legend === 'string' && legendPositions.includes(item.legend as LegendPosition) && item.legend !== defaultLegend(kind)) out.legend = item.legend as LegendPosition
  if (item.trendline === 'linear' && trendlineFor(kind)) out.trendline = 'linear'
  return Object.keys(out).length ? out : undefined
}

// Every element resolved for drawing. `plain`: the data labels are drawn exactly as before (default position, contents
// and number format), so the old size rules (e.g. a stack's label only when it is wider than 34 px) apply unchanged.
export interface ResolvedElements {
  kind: ChartKind
  title: boolean; axisX: boolean; axisY: boolean; titleX: boolean; titleY: boolean
  labels: boolean | undefined; position: LabelPosition; content: LabelContent[]; decimals?: 0 | 1 | 2; code: boolean
  dataTable: boolean; grid: Record<Gridline, boolean>; legend: LegendPosition; trendline: boolean
  plain: boolean
}
export function resolveElements(kind: ChartKind, elements: ChartElements | undefined, { stacked = false, percent = false } = {}): ResolvedElements {
  const e = elements ?? {}
  // A stacked chart has no Outside End (Excel offers none): drawn at the centre.
  const position = e.position && labelPositions(kind, stacked).includes(e.position) ? e.position : e.position === 'outsideEnd' && stacked ? 'center' : defaultPosition(kind, stacked)
  const offered = contentsFor(kind, percent)
  const content = (e.content ?? defaultContent(kind, percent)).filter((entry) => offered.includes(entry))
  const lines = e.gridlines ?? defaultGridlines(kind)
  const plain = position === defaultPosition(kind, stacked) && same(content, defaultContent(kind, percent)) && e.decimals == null && !e.code
  return {
    kind, title: e.title !== false, axisX: e.axisX !== false, axisY: e.axisY !== false, titleX: e.titleX !== false, titleY: e.titleY !== false,
    labels: e.labels, position, content: content.length ? content : defaultContent(kind, percent), decimals: e.decimals, code: Boolean(e.code),
    dataTable: Boolean(e.dataTable) && hasAxes(kind), grid: Object.fromEntries(gridlineKeys.map((key) => [key, hasAxes(kind) && lines.includes(key)])) as Record<Gridline, boolean>,
    legend: e.legend ?? defaultLegend(kind), trendline: e.trendline === 'linear' && trendlineFor(kind), plain,
  }
}
// A change from the pop-up: the elements with one key set (undefined removes it), cleaned as when read.
export function withElement<K extends keyof ChartElements>(type: InsightType, options: { orientation?: 'vertical'; percent?: true } | undefined, elements: ChartElements | undefined, key: K, value: ChartElements[K] | undefined) {
  const next: Record<string, unknown> = { ...(elements ?? {}) }
  if (value === undefined) delete next[key]
  else next[key] = value
  return cleanElements(type, options, next)
}

// CHT-28: a number as the label shows it. Without a number format: as before (the chart's short form, e.g. 12.3K); with
// decimals: thousand separators and exactly that many decimals; with the currency code: "1,950.00 EUR".
export function labelNumber(value: number, { decimals, code, currency = '', short }: { decimals?: 0 | 1 | 2; code?: boolean; currency?: string; short: (value: number) => string }) {
  const text = decimals == null ? short(value) : value.toLocaleString('en', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return code && currency ? `${text} ${currency}` : text
}
export const labelPercent = (share: number, decimals: 0 | 1 | 2 | undefined, fallback: 0 | 1 | 2) => `${share.toLocaleString('en', { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: decimals ?? fallback })}%`
// The parts of one label, in the order of `content`, joined with ", " as Excel does.
export function labelText(parts: Partial<Record<LabelContent, string>>, content: LabelContent[]) {
  return content.map((entry) => parts[entry]).filter((part): part is string => Boolean(part)).join(', ')
}

// The width a label of the chart's 11 px type takes (the same estimate as the label wrapping, CHT-23).
export const textWidth = (text: string, perChar = 6.6) => Math.ceil(text.length * perChar)
// CHT-29: labels never overlap — each label box is kept unless it overlaps one kept before it (in the order given).
export interface Box { x: number; y: number; width: number; height: number }
export function keepApart<T extends Box>(boxes: T[], gap = 1): T[] {
  const kept: T[] = []
  for (const box of boxes) if (!kept.some((other) => box.x < other.x + other.width + gap && other.x < box.x + box.width + gap && box.y < other.y + other.height + gap && other.y < box.y + box.height + gap)) kept.push(box)
  return kept
}
// A label's text in at most `lines` lines of `maxWidth` px, wrapped by words; null when it does not fit — a number is
// never cut, so a label that does not fit is left out (the tooltip, Table view and data table still give the value).
export function fitText(text: string, maxWidth: number, lines = 1, perChar = 6.6): string[] | null {
  const chars = Math.floor(maxWidth / perChar)
  if (chars < 1) return null
  const out: string[] = []
  for (const word of text.split(' ')) {
    const last = out[out.length - 1]
    if (last != null && `${last} ${word}`.length <= chars) out[out.length - 1] = `${last} ${word}`
    else out.push(word)
  }
  return out.length <= lines && out.every((line) => line.length <= chars) ? out : null
}
// A category or series name inside a label: at most `chars` characters, else cut with "…" (the full name is in the
// tooltip and the Table view).
export const shortName = (name: string, chars = 18) => name.length > chars ? `${name.slice(0, chars - 1).trimEnd()}…` : name
// CHT-31: the minor gridlines of a value axis — four between each pair of major ticks (Excel's fifth of a major unit).
export function minorTicks(ticks: number[], parts = 5): number[] {
  const out: number[] = []
  for (let at = 1; at < ticks.length; at++) for (let part = 1; part < parts; part++) out.push(Number((ticks[at - 1] + (ticks[at] - ticks[at - 1]) * part / parts).toFixed(9)))
  return out
}
// A box inside the chart's box?
export const inside = (box: Box, width: number, height: number) => box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height

// CHT-28: where a bar or column label goes, along the bar from its base (`base`) to its end (`end`) in pixels; `room`:
// the space left after the end (Outside End). Returns the centre of the label along the bar, or null when it does not fit.
export function barLabelAt(position: LabelPosition, base: number, end: number, size: number, room = Infinity): number | null {
  const length = Math.abs(end - base), dir = end >= base ? 1 : -1
  const pad = 4
  if (position === 'outsideEnd') return room >= size + pad ? end + dir * (pad + size / 2) : null
  if (length < size + pad * 2) return null
  if (position === 'insideEnd') return end - dir * (pad + size / 2)
  if (position === 'insideBase') return base + dir * (pad + size / 2)
  return (base + end) / 2
}
// CHT-28: a line label beside its point.
export function lineLabelAt(position: LabelPosition, x: number, y: number, width: number, height: number): Box {
  if (position === 'left') return { x: x - 8 - width, y: y - height / 2, width, height }
  if (position === 'right') return { x: x + 8, y: y - height / 2, width, height }
  if (position === 'below') return { x: x - width / 2, y: y + 8, width, height }
  if (position === 'center') return { x: x - width / 2, y: y - height / 2, width, height }
  return { x: x - width / 2, y: y - 9 - height + 3, width, height }
}

// CHT-28: pie / donut labels. Center: in the middle of the ring; Inside End: near the outer edge; Outside End: outside
// the ring with a leader line; Best Fit: inside where the label fits in its slice, else outside with a leader line.
// Outside labels on each side are moved apart so they never overlap; the result holds each label's anchor point and
// the box the drawing needs (so the SVG can grow to keep every label inside it).
export interface PieSlice { start: number; end: number; width: number; lines: number }
export interface PieLabel { x: number; y: number; anchor: 'start' | 'middle' | 'end'; outside: boolean; hidden?: boolean; leader?: [number, number, number, number, number, number] }
export function pieLabels(slices: PieSlice[], position: LabelPosition, inner: number, outer: number, lineHeight = 12): { labels: PieLabel[]; bounds: { left: number; right: number; top: number; bottom: number } } {
  const ring = outer - inner, mid = (inner + outer) / 2
  const fitsInside = (slice: PieSlice, radius: number) => {
    const sweep = slice.end - slice.start
    const chord = sweep >= Math.PI ? radius * 2 : 2 * radius * Math.sin(sweep / 2)
    return slice.width + 4 <= chord && slice.lines * lineHeight <= ring + 6
  }
  const labels: PieLabel[] = slices.map((slice) => {
    const angle = (slice.start + slice.end) / 2
    if (position === 'center' || position === 'insideEnd' || (position === 'bestFit' && fitsInside(slice, mid))) {
      const radius = position === 'insideEnd' ? outer - Math.min(ring / 2, lineHeight) : mid
      // Center and Inside End keep a label inside its slice: one that does not fit there is left out.
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), anchor: 'middle', outside: false, ...(fitsInside(slice, radius) ? {} : { hidden: true }) }
    }
    const right = Math.cos(angle) >= 0
    return { x: (right ? 1 : -1) * (outer + 18), y: (outer + 10) * Math.sin(angle), anchor: right ? 'start' : 'end', outside: true }
  })
  // Move the outside labels of each side apart (top to bottom), then back up if the last ran too low.
  for (const right of [true, false]) {
    const side = labels.map((label, index) => ({ label, index })).filter(({ label }) => label.outside && (label.anchor === 'start') === right).sort((a, b) => a.label.y - b.label.y)
    for (let at = 1; at < side.length; at++) {
      const before = side[at - 1], here = side[at]
      const need = (slices[before.index].lines + slices[here.index].lines) * lineHeight / 2 + 2
      if (here.label.y - before.label.y < need) here.label.y = before.label.y + need
    }
  }
  for (const [index, label] of labels.entries()) {
    if (!label.outside) continue
    const angle = (slices[index].start + slices[index].end) / 2
    const ex = (outer + 2) * Math.cos(angle), ey = (outer + 2) * Math.sin(angle)
    const kx = (outer + 10) * Math.cos(angle)
    label.leader = [ex, ey, kx, label.y, label.x + (label.anchor === 'start' ? -3 : 3), label.y]
  }
  let left = -outer, right = outer, top = -outer, bottom = outer
  for (const [index, label] of labels.entries()) {
    if (!label.outside) continue
    const { width, lines } = slices[index]
    const half = lines * lineHeight / 2
    if (label.anchor === 'start') right = Math.max(right, label.x + width)
    else left = Math.min(left, label.x - width)
    top = Math.min(top, label.y - half - 2)
    bottom = Math.max(bottom, label.y + half + 2)
  }
  return { labels, bounds: { left, right, top, bottom } }
}

// CHT-33: a least-squares straight line through a series' points (x: the category's place 0, 1, 2 …; points without a
// value left out); null with fewer than two points. `at(x)` gives the line's value at a place.
export function linearTrend(values: (number | null | undefined)[]): { slope: number; intercept: number; at: (x: number) => number } | null {
  const points = values.map((value, x) => ({ x, y: value })).filter((point): point is { x: number; y: number } => point.y != null && Number.isFinite(point.y))
  if (points.length < 2) return null
  const n = points.length
  const mx = points.reduce((all, point) => all + point.x, 0) / n, my = points.reduce((all, point) => all + point.y, 0) / n
  const sxx = points.reduce((all, point) => all + (point.x - mx) ** 2, 0)
  if (!sxx) return null
  const slope = points.reduce((all, point) => all + (point.x - mx) * (point.y - my), 0) / sxx
  const intercept = my - slope * mx
  return { slope, intercept, at: (x: number) => intercept + slope * x }
}
// The trend lines of a chart's series (one per series; a stacked chart: each series' own values) from the first to the
// last category — and the values they reach, so the value axis can include them.
export function trendLines(values: (number | null)[][], seriesCount: number) {
  const last = values.length - 1
  return Array.from({ length: seriesCount }, (_, col) => {
    const fit = linearTrend(values.map((row) => row[col]))
    return fit ? { col, from: fit.at(0), to: fit.at(last) } : null
  }).filter((line): line is { col: number; from: number; to: number } => line != null)
}
export const trendName = (series: string) => `Linear (${series})`

// CHT-30: the data table under a chart — one column per category, one row per series (with its legend key), the
// numbers as the chart shows them; a Pareto adds the cumulative share.
export interface DataTableModel { categories: string[]; rows: { name: string; key: number | null; cells: string[] }[] }
export function dataTableModel({ categories, series, values, format, cumulative }: { categories: string[]; series: string[]; values: (number | null)[][]; format: (value: number | null) => string; cumulative?: number[] }): DataTableModel {
  const rows = series.map((name, col) => ({ name, key: col as number | null, cells: values.map((row) => format(row[col] ?? null)) }))
  if (cumulative) rows.push({ name: 'Cumulative share (%)', key: null, cells: cumulative.map((share) => `${share.toFixed(1)}%`) })
  return { categories, rows }
}

// CHT-40: grouped (clustered) bars — the bars of a category's series side by side in its band (`band` px: a row's height
// for horizontal bars, a column's width for vertical columns): the group takes at most 80% of the band, each bar at most
// `max` px thick with a 2 px gap (less when the band is tight). Returns each bar's thickness and its centre's offset from
// the band's centre, in the order of the series.
export function groupedSlots(band: number, series: number, max = 56): { size: number; gap: number; offsets: number[] } {
  const n = Math.max(1, Math.floor(series))
  const gap = n > 1 ? Math.min(2, band * 0.02) : 0
  const group = Math.min(Math.max(1, band * 0.8), max * n + gap * (n - 1))
  const size = Math.max(1, (group - gap * (n - 1)) / n)
  const used = size * n + gap * (n - 1)
  return { size, gap, offsets: Array.from({ length: n }, (_, index) => -used / 2 + index * (size + gap) + size / 2) }
}
// The row height of grouped horizontal bars: today's 30 px holds up to two bars; more series make the row taller so
// each bar stays at least 6 px thick (the panel's height factor, CHT-16, applied on top).
export const groupedRowHeight = (series: number, factor = 1) => Math.round(Math.max(30, 10 + 8 * Math.max(1, series)) * factor)
