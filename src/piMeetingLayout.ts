// PIR-64…PIR-67 Every slide of the PI Review Meeting is a fixed 16:9 page (product owner, 26 Nov 2026: "these
// presentations should be 16:9 ratio pages. All the charts and views should lie within that."). A slide is a canvas of
// 1280 × 720 CSS px (13.333 in × 7.5 in when printed); the file's script only scales it to the window, nothing reflows.
//
// The layout is worked out HERE, when the file is built, without measuring in a browser: every text has a fixed line
// height, and how many lines a text takes is estimated from its length at a generous character width (`charWidth` of the
// font size — wider than the fonts slides are shown in). Each text is then clamped to exactly the lines it was given
// (CSS line-clamp; the full text in a title), so no slide part can be taller than the height counted for it, whatever the
// font. A slide maker gives a list of blocks — fixed ones (tiles, a note, a line chart) and ones that split (a table by
// rows, a bar chart by bars, a list or a review section by its points; a long point by its lines) — and `flowSlides`
// pours them onto as many slides as they need, each "Title (n of N)". Pure: no DOM, no Git, no network.
import { text } from './piMeetingText.ts'
import type { Slide, SlideKind } from './piMeeting.ts'

// ---- the canvas ----
export const slideWidth = 1280, slideHeight = 720
export const padX = 48, padTop = 28, padBottom = 12
export const contentWidth = slideWidth - 2 * padX
// The footer: 8 px above it, 32 px high (its border, 8 px padding, one 16 px line).
export const footerHeight = 40
// The header: the eyebrow (one 16 px line and 4 px), the title (28 px type, 34 px lines, at most 2), 14 px below it.
export const titleLineHeight = 34, titleMaxLines = 2, titleFont = 28
export const headerHeight = (lines: number) => 20 + titleLineHeight * lines + 14
// Room left for nothing — rounding in the browser's table and line boxes — on every slide.
export const slack = 8
// The body: what is left of the 720 px between the header and the footer.
export const bodyRoom = (titleLines: number) => slideHeight - padTop - padBottom - headerHeight(titleLines) - footerHeight - slack
// The space between two blocks of a body (a flex column's gap).
export const gap = 12

// ---- text: how many lines ----
// A generous average character width, as a share of the font size: wider than the system fonts' average, so a text is
// given at least the lines it needs; the clamp catches the rest.
export const charWidth = 0.6
const perLine = (width: number, font: number) => Math.max(1, Math.floor(width / (font * charWidth)))
// The lines a text takes in a box `width` px wide at `font` px: word by word, a word longer than a line broken anywhere.
export function wrapLines(value: string, width: number, font: number): number {
  const per = perLine(width, font)
  let lines = 0
  for (const paragraph of String(value ?? '').split('\n')) {
    lines += 1
    let used = 0
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let length = [...word].length
      if (used && used + 1 + length <= per) { used += 1 + length; continue }
      if (used) { lines += 1; used = 0 }
      while (length > per) { lines += 1; length -= per }
      used = length
    }
  }
  return lines
}
// A text cut into parts of at most `max` lines each (the same wrapping as wrapLines), so a long point runs on.
export function splitText(value: string, width: number, font: number, max: number): string[] {
  const per = perLine(width, font), words = String(value ?? '').split(/\s+/).filter(Boolean), out: string[] = []
  let current: string[] = [], lines = 1, used = 0
  const flush = () => { if (current.length) out.push(current.join(' ')); current = []; lines = 1; used = 0 }
  for (let word of words) {
    for (;;) {
      const length = [...word].length
      if (!used) {
        if (length <= per) { current.push(word); used = length; break }
        // A word longer than a line: as many full lines of it as fit in this part.
        const room = (max - lines + 1) * per, piece = [...word].slice(0, room).join('')
        current.push(piece); word = [...word].slice(room).join('')
        if (!word) { lines += Math.ceil(piece.length / per) - 1; used = piece.length % per || per; break }
        flush(); continue
      }
      if (used + 1 + length <= per) { current.push(word); used += 1 + length; break }
      if (lines >= max) { flush(); continue }
      lines += 1; used = 0
    }
  }
  flush()
  return out.length ? out : ['']
}
// A box clamped to `lines` lines (its line height from the context: --lh), the full text in a title when it may be cut.
export const clampClass = (lines: number) => `c l${Math.max(1, Math.min(maxClamp, lines))}`
export const maxClamp = 12
export const titleAttr = (full: string, cut: boolean) => cut && full ? ` title="${text(full)}"` : ''

// The title of a slide: its lines (at most 2) — h2 is clamped to them, so the header is never taller than counted.
export const titleLines = (title: string) => Math.min(titleMaxLines, wrapLines(title, contentWidth, titleFont))
export const titleCut = (title: string) => wrapLines(title, contentWidth, titleFont) > titleMaxLines

// ---- blocks ----
export interface Piece { html: string; height: number }
// take(room, alone): the part of the block that fits in `room` px (alone: the first block of an empty slide — then at
// least one row is taken, as it fits no better on the next), and the rest for the next slide.
export interface Block { take(room: number, alone: boolean): { piece?: Piece; rest?: Block } }
export const fixed = (html: string, height: number): Block => ({ take: (room, alone) => height <= room || alone ? { piece: { html, height } } : {} })

// A paragraph clamped to at most `max` lines of `font` / `lineHeight` px; padding: its vertical padding and borders.
export function paragraph(className: string, value: string, opts: { font?: number; lineHeight?: number; max?: number; width?: number; padding?: number; html?: string } = {}): Block {
  const font = opts.font ?? 15, lineHeight = opts.lineHeight ?? 21, max = opts.max ?? 3, width = opts.width ?? contentWidth
  const need = wrapLines(value, width, font), lines = Math.min(max, need)
  return fixed(`<p class="${className ? `${className} ` : ''}${clampClass(lines)}"${titleAttr(value, need > lines)}>${opts.html ?? text(value)}</p>`, lines * lineHeight + (opts.padding ?? 0))
}

// Tiles: a row (or rows of three) of figures, each 112 px high, the detail clamped to two lines.
export const tileHeight = 112
export interface Tile { label: string; value: string; detail?: string }
export function tiles(list: readonly Tile[]): Block {
  const columns = list.length <= 4 ? Math.max(1, list.length) : 3, rows = Math.ceil(list.length / columns)
  const width = (contentWidth - gap * (columns - 1)) / columns - 34
  const html = `<dl class="tiles n${columns}">${list.map((entry) => { const detail = entry.detail ?? '', need = wrapLines(detail, width, 12); return `<div class="tile"><dt class="${clampClass(1)}"${titleAttr(entry.label, wrapLines(entry.label, width, 13) > 1)}>${text(entry.label)}</dt><dd><strong>${text(entry.value)}</strong>${detail ? `<small class="${clampClass(Math.min(2, need))}"${titleAttr(detail, need > 2)}>${text(detail)}</small>` : ''}</dd></div>` }).join('')}</dl>`
  return fixed(html, rows * tileHeight + (rows - 1) * gap)
}

// ---- tables ----
// A column: its share of the width (whole %), right-aligned numbers, the most lines a cell of it shows.
export interface Column { label: string; width: number; num?: boolean; lines?: number }
// A cell: its HTML (built from text() values) and its plain text (what is measured and put in the title when cut); value:
// the sort value; head: a row header (th scope="row").
export interface Cell { html: string; plain: string; value?: number | string; num?: boolean; head?: boolean }
export const cellOf = (value: string | number, sort?: number | string): Cell => ({ html: text(value), plain: String(value), ...(sort != null ? { value: sort } : typeof value === 'number' ? { value } : {}) })
// Table type: 14 px on 19 px lines, 5 px above and below, a 1 px rule — a row is 19 × lines + 11 px; the header row
// 12 px on 16 px lines (at most 2), 6 px above and below; the total row 33 px (its 2 px rule).
export const rowLine = 19, headLine = 16, footRow = 33, cellPadX = 16
const rowHeight = (lines: number) => rowLine * lines + 11
const headHeight = (lines: number) => headLine * lines + 13
export interface TableSpec { label: string; columns: Column[]; rows: Cell[][]; foot?: string; sortable?: boolean; className?: string }
export function table(spec: TableSpec): Block {
  const widthOf = (column: Column) => contentWidth * column.width / 100 - cellPadX
  const headLines = Math.max(1, ...spec.columns.map((column) => Math.min(2, wrapLines(`${column.label}${spec.sortable ? ' ▲' : ''}`, widthOf(column), 12))))
  const head = spec.columns.map((column, at) => {
    const need = wrapLines(`${column.label}${spec.sortable ? ' ▲' : ''}`, widthOf(column), 12), label = `<span class="${clampClass(Math.min(headLines, need))}"${titleAttr(column.label, need > headLines)}>${text(column.label)}</span>`
    return `<th scope="col"${column.num ? ' class="num"' : ''}${spec.sortable ? ' aria-sort="none"' : ''}>${spec.sortable ? `<button type="button" class="sort" data-col="${at}">${label}<span class="arrow" aria-hidden="true"></span></button>` : label}</th>`
  }).join('')
  const rows = spec.rows.map((cells) => {
    let lines = 1
    const html = cells.map((cell, at) => {
      const column = spec.columns[at] ?? { label: '', width: 10 }, max = column.lines ?? 2, need = wrapLines(cell.plain, widthOf(column), 14), shown = Math.min(max, need)
      lines = Math.max(lines, shown)
      const tag = cell.head ? 'th scope="row"' : 'td'
      return `<${tag}${column.num || cell.num ? ' class="num"' : ''}${cell.value != null ? ` data-value="${text(cell.value)}"` : ''}><div class="${clampClass(shown)}"${titleAttr(cell.plain, need > shown)}>${cell.html}</div></${cell.head ? 'th' : 'td'}>`
    }).join('')
    return { html: `<tr>${html}</tr>`, height: rowHeight(lines) }
  })
  const colgroup = `<colgroup>${spec.columns.map((column) => `<col class="w${Math.round(column.width)}">`).join('')}</colgroup>`
  const build = (part: typeof rows, foot: boolean): Piece => ({
    html: `<table class="t${spec.sortable ? ' sortable' : ''}${spec.className ? ` ${spec.className}` : ''}" aria-label="${text(spec.label)}">${colgroup}<thead><tr>${head}</tr></thead><tbody>\n${part.map((row) => row.html).join('\n')}\n</tbody>${foot && spec.foot ? `<tfoot>${spec.foot}</tfoot>` : ''}</table>`,
    height: headHeight(headLines) + part.reduce((sum, row) => sum + row.height, 0) + (foot && spec.foot ? footRow : 0) + 2,
  })
  const from = (start: number): Block => ({
    take(room, alone) {
      const left = rows.slice(start)
      let used = headHeight(headLines) + 2, count = 0
      while (count < left.length && used + left[count].height <= room) { used += left[count].height; count += 1 }
      // The total row goes with the last rows: one row less here when it does not fit after them.
      if (count === left.length && spec.foot && used + footRow > room) count -= 1
      if (count <= 0) { if (!alone) return {}; count = Math.min(1, left.length) }
      const last = start + count >= rows.length
      return { piece: build(left.slice(0, count), last), ...(last ? {} : { rest: from(start + count) }) }
    },
  })
  return from(0)
}

// ---- points: a list of lines (Themes) and the sections of a review ----
// A point: its HTML (with a prefix such as the Feature ID) and its parts — a long point runs on in parts of at most
// `pointMax` lines, the next parts without the prefix.
export const pointFont = 15, pointLine = 21, pointMax = 6
export interface Point { html: string; lines: number; more?: boolean }
export function pointsOf(items: readonly { text: string; prefix?: string; suffix?: string; suffixText?: string }[], width: number): Point[] {
  return items.flatMap((item) => {
    const parts = splitText(item.text, width, pointFont, pointMax)
    return parts.map((part, at) => {
      const last = at === parts.length - 1
      const lines = Math.min(maxClamp, wrapLines(last && item.suffixText ? `${part} ${item.suffixText}` : part, width, pointFont))
      return { html: `${at === 0 && item.prefix ? `${item.prefix} ` : ''}${text(part)}${last && item.suffix ? ` ${item.suffix}` : ''}`, lines, ...(at ? { more: true } : {}) }
    })
  })
}
// The Themes list: each point a row (5 px above and below, a 1 px rule).
export function pointList(points: readonly Point[], className = 'themes'): Block {
  const height = (point: Point) => point.lines * pointLine + 11
  const from = (start: number): Block => ({
    take(room, alone) {
      let used = 0, count = 0
      while (start + count < points.length && used + height(points[start + count]) <= room) { used += height(points[start + count]); count += 1 }
      if (!count) { if (!alone) return {}; count = 1; used = height(points[start]) }
      const part = points.slice(start, start + count)
      return { piece: { html: `<ul class="${className}">${part.map((point) => `<li${point.more ? ' class="more"' : ''}><div class="${clampClass(point.lines)}">${point.html}</div></li>`).join('')}</ul>`, height: used }, ...(start + count < points.length ? { rest: from(start + count) } : {}) }
    },
  })
  return from(0)
}

// A section of a review (Learnings, Struggles, Additional Remarks, a field of the form): its heading (13 px on 18 px
// lines and 4 px: 22 px), then its points (3 px apart) — one point a paragraph, more a list.
export const sectionHead = 22
export interface Section { label: string; points: Point[]; list: boolean; empty?: string }
export function sectionOf(label: string, all: readonly string[], width: number, empty = '—'): Section {
  const list = all.length > 1
  return { label, list, points: pointsOf(all.map((line) => ({ text: line })), list ? width - 20 : width), ...(all.length ? {} : { empty }) }
}
const pointHeight = (point: Point) => point.lines * pointLine + 3
const sectionHtml = (section: Section, points: readonly Point[], continued: boolean) => {
  const head = `<h3>${text(section.label)}${continued ? ' <small>(continued)</small>' : ''}</h3>`
  if (!points.length) return `<section class="part">${head}${section.empty ? `<p class="muted ${clampClass(1)}">${text(section.empty)}</p>` : ''}</section>`
  const shown = points.map((point) => `<div class="${clampClass(point.lines)}">${point.html}</div>`)
  return `<section class="part">${head}${section.list || points.length > 1 || points[0].more ? `<ul>${points.map((point, at) => `<li${point.more ? ' class="more"' : ''}>${shown[at]}</li>`).join('')}</ul>` : `<p class="${clampClass(points[0].lines)}">${points[0].html}</p>`}</section>`
}
// How many of the points fit in `room` px after the heading (at least one when `alone`).
function fitPoints(points: readonly Point[], room: number, alone: boolean) {
  let used = sectionHead, count = 0
  while (count < points.length && used + pointHeight(points[count]) <= room) { used += pointHeight(points[count]); count += 1 }
  if (!count && points.length && alone) { count = 1; used += pointHeight(points[0]) }
  return { count, used }
}
// One section across the width; its points run on to the next slide when they do not fit.
export function section(value: Section): Block {
  const from = (start: number): Block => ({
    take(room, alone) {
      const left = value.points.slice(start)
      if (!left.length) return sectionHead + pointLine + 3 <= room || alone ? { piece: { html: sectionHtml(value, [], start > 0), height: sectionHead + pointLine + 3 } } : {}
      const { count, used } = fitPoints(left, room, alone)
      if (!count) return {}
      return { piece: { html: sectionHtml(value, left.slice(0, count), start > 0), height: used }, ...(start + count < value.points.length ? { rest: from(start + count) } : {}) }
    },
  })
  return from(0)
}
// Two sections side by side (Learnings | Struggles), 24 px apart; each runs on by itself; the next slide carries on both.
export const columnGap = 24
export const columnWidth = (contentWidth - columnGap) / 2
export function columns(left: Section, right: Section, className = ''): Block {
  const from = (a: number, b: number): Block => ({
    take(room, alone) {
      const restA = left.points.slice(a), restB = right.points.slice(b)
      const fitA = restA.length ? fitPoints(restA, room, alone) : { count: 0, used: a ? 0 : sectionHead + pointLine + 3 }
      const fitB = restB.length ? fitPoints(restB, room, alone) : { count: 0, used: b ? 0 : sectionHead + pointLine + 3 }
      const progress = fitA.count + fitB.count
      if (!progress && (restA.length || restB.length)) return {}
      const height = Math.max(fitA.used, fitB.used)
      if (height > room && !alone) return {}
      const side = (value: Section, start: number, rest: Point[], count: number) => rest.length ? sectionHtml(value, rest.slice(0, count), start > 0) : start ? '<section class="part"></section>' : sectionHtml(value, [], false)
      const html = `<div class="columns${className ? ` ${className}` : ''}">${side(left, a, restA, fitA.count)}${side(right, b, restB, fitB.count)}</div>`
      const nextA = a + fitA.count, nextB = b + fitB.count
      return { piece: { html, height }, ...(nextA < left.points.length || nextB < right.points.length ? { rest: from(nextA, nextB) } : {}) }
    },
  })
  return from(0, 0)
}

// ---- the slides ----
// Pour the blocks onto slides: each slide holds what fits in its body; a block that splits runs on to the next.
export function flow(blocks: readonly Block[], room: number): Piece[][] {
  const pages: Piece[][] = [], queue = [...blocks]
  let page: Piece[] = [], left = room
  const next = () => { pages.push(page); page = []; left = room }
  while (queue.length) {
    const block = queue.shift()!
    const space = page.length ? left - gap : left
    const { piece, rest } = block.take(space, !page.length)
    if (!piece) { queue.unshift(block); next(); continue }
    page.push(piece)
    left = space - piece.height
    if (rest) { queue.unshift(rest); next() }
  }
  if (page.length || !pages.length) pages.push(page)
  return pages
}
const partOf = (title: string, at: number, of: number) => of > 1 ? `${title} (${at + 1} of ${of})` : title
// The slides of one kind: the title's lines counted with the longest "(n of N)" it may get.
export function flowSlides(kind: SlideKind, eyebrow: string, title: string, blocks: readonly Block[]): Slide[] {
  const room = bodyRoom(titleLines(`${title} (88 of 88)`))
  const pages = flow(blocks, room)
  return pages.map((pieces, at) => ({ kind, eyebrow, title: partOf(title, at, pages.length), body: pieces.map((piece) => piece.html).join('\n') }))
}

// The column widths used by tables (class "wN": N % of the width).
export const widthStyle = () => Array.from({ length: 100 }, (_, at) => `.w${at + 1}{width:${at + 1}%}`).join('')
