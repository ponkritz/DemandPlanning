import { useEffect, useRef, useState } from 'react'
import type { MonthlyHours } from './capacity'

// Shared chart helpers: month labels, clean ticks, mark geometry and stable Epic colours.
export const shortMonth = (month: string) => new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(`${month}-01T00:00:00`))
export const longMonth = (month: string) => new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`))
export const monthTick = (month: string, index: number) => `${shortMonth(month)}${month.endsWith('-01') || index === 0 ? ` ’${month.slice(2, 4)}` : ''}`
export const compactNumber = (value: number) => value >= 1000 ? `${Number((value / 1000).toFixed(value >= 10000 ? 0 : 1))}K` : String(Math.round(value))

export function niceTicks(max: number, count = 4) {
  if (!(max > 0)) return [0, 1]
  const raw = max / count, power = 10 ** Math.floor(Math.log10(raw)), candidates = [1, 2, 2.5, 5, 10].map((step) => step * power)
  const step = candidates.find((candidate) => candidate >= raw) ?? candidates[candidates.length - 1]
  return Array.from({ length: Math.ceil(max / step - 1e-9) + 1 }, (_, index) => Number((index * step).toFixed(6)))
}

// Column: 4px rounded data-end on top, square at the baseline.
export function columnPath(x: number, y: number, width: number, height: number, radius = 4) {
  if (!(height > 0) || !(width > 0)) return ''
  const r = Math.min(radius, width / 2, height)
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`
}

// Horizontal bar: square at the left baseline, 4px rounded data-end on the right.
export function barPath(x: number, y: number, width: number, height: number, radius = 4) {
  if (!(height > 0) || !(width > 0)) return ''
  const r = Math.min(radius, height / 2, width)
  return `M${x},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height - r}Q${x + width},${y + height} ${x + width - r},${y + height}H${x}Z`
}

// Render charts at their real pixel width so text never scales with the container.
export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    // A collapsed or mid-transition layout can report a near-zero width; keep the last good width instead of locking onto it.
    const update = () => { const measured = Math.round(element.getBoundingClientRect().width); if (measured >= 200) setWidth(measured) }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

// Epic colours follow the entity: the five Epics with the most booked hours over the window keep slots 1–5
// (validated light and dark); every other Epic folds into a neutral "Other". Never a generated sixth hue.
export const epicSlots = ['var(--viz-series-1)', 'var(--viz-series-2)', 'var(--viz-series-3)', 'var(--viz-series-4)', 'var(--viz-series-5)'] as const
export const otherColor = 'var(--viz-other)'
export interface EpicColors { top: { key: string; title: string; color: string }[]; other: string; colorOf: (key: string) => string; isTop: (key: string) => boolean }

export function epicColors(series: Pick<MonthlyHours, 'streams'>[]): EpicColors {
  const totals = new Map<string, { key: string; title: string; work: number }>()
  for (const point of series) for (const stream of point.streams) {
    const entry = totals.get(stream.key) ?? { key: stream.key, title: stream.title, work: 0 }
    entry.work += stream.work
    totals.set(stream.key, entry)
  }
  const top = [...totals.values()].filter((entry) => entry.work > 0).sort((a, b) => b.work - a.work || a.title.localeCompare(b.title)).slice(0, epicSlots.length)
    .map((entry, index) => ({ key: entry.key, title: entry.title, color: epicSlots[index] }))
  const byKey = new Map(top.map((entry) => [entry.key, entry.color]))
  return { top, other: otherColor, colorOf: (key) => byKey.get(key) ?? otherColor, isTop: (key) => byKey.has(key) }
}

// Pareto: Epics sorted by booked hours with share and running cumulative %; the "vital few" are every item up to
// and including the one whose cumulative share first reaches the threshold.
export function paretoSeries<T extends { key: string; title: string; work: number }>(streams: T[], threshold = 80) {
  const items = streams.filter((stream) => stream.work > 0).sort((a, b) => b.work - a.work || a.title.localeCompare(b.title))
  const total = items.reduce((sum, item) => sum + item.work, 0)
  let running = 0, reached = false
  return items.map((item) => {
    running += item.work
    const share = total ? item.work / total * 100 : 0, cumulative = total ? running / total * 100 : 0
    const vital = !reached
    if (cumulative >= threshold - 1e-9) reached = true
    return { ...item, share, cumulative, vital }
  })
}

// Donut segment between two angles (radians, 0 = 3 o'clock); a full turn draws a ring (use fill-rule evenodd).
export function arcPath(cx: number, cy: number, inner: number, outer: number, start: number, end: number) {
  const sweep = end - start
  if (!(sweep > 0)) return ''
  if (sweep >= Math.PI * 2 - 1e-6) return `M${cx},${cy - outer}A${outer},${outer} 0 1 1 ${cx},${cy + outer}A${outer},${outer} 0 1 1 ${cx},${cy - outer}ZM${cx},${cy - inner}A${inner},${inner} 0 1 0 ${cx},${cy + inner}A${inner},${inner} 0 1 0 ${cx},${cy - inner}Z`
  const point = (radius: number, angle: number) => `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`
  const large = sweep > Math.PI ? 1 : 0
  return `M${point(outer, start)}A${outer},${outer} 0 ${large} 1 ${point(outer, end)}L${point(inner, end)}A${inner},${inner} 0 ${large} 0 ${point(inner, start)}Z`
}

// "Program | Service | vRelease" → "Service vRelease" (the Epic is already carried by colour and tooltip).
export function shortFeatureTitle(title: string) {
  const parts = title.split('|').map((part) => part.trim()).filter(Boolean)
  return parts.length >= 2 ? parts.slice(1).join(' ') : title
}

// Wrap an axis label onto at most two lines of maxChars. When it doesn't fit, the last word (usually the release
// version) keeps line two so sibling releases stay distinguishable, and the rest is shortened with an ellipsis.
export function wrapLabel(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const cut = (line: string) => line.length > maxChars ? line.slice(0, Math.max(1, maxChars - 1)).trimEnd() + '…' : line
  const lines: string[] = []
  for (const word of words) {
    const last = lines[lines.length - 1]
    if (last != null && (last + ' ' + word).length <= maxChars) lines[lines.length - 1] = last + ' ' + word
    else lines.push(word)
  }
  if (lines.length <= 2 && lines.every((line) => line.length <= maxChars)) return lines
  if (words.length < 2) return [cut(text)]
  return [cut(words.slice(0, -1).join(' ')), cut(words[words.length - 1])]
}
