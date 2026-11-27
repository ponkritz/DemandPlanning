import test from 'node:test'
import assert from 'node:assert/strict'
import { bodyRoom, cellOf, columns, columnWidth, contentWidth, fixed, flow, flowSlides, gap, pointList, pointsOf, sectionOf, slideHeight, slideWidth, splitText, table, titleLines, wrapLines } from '../src/piMeetingLayout.ts'
import { barChart, barRow } from '../src/piMeetingExec.ts'

// PIR-64…PIR-66 (TC-PIR-64): the 16:9 canvas and the limits a slide's content is split by, worked out when the file is
// built — never "N rows" or "about N characters". Synthetic data only.
const long = (count) => Array.from({ length: count }, (_, at) => ['calibrate', 'the', 'rig', 'before', 'audit'][at % 5]).join(' ')

test('PIR-64: the canvas is 1280 × 720 (16:9); the body is what the header and footer leave', () => {
  assert.equal(slideWidth / slideHeight, 16 / 9)
  assert.equal(contentWidth, 1184)
  // 720 − 28 (top) − 12 (bottom) − header (20 + 34 a title line + 14) − 40 (footer) − 8 (rounding).
  assert.equal(bodyRoom(1), 564)
  assert.equal(bodyRoom(2), 530)
  assert.equal(titleLines('Summary'), 1)
  assert.equal(titleLines(`#1 ${long(60)}`), 2, 'a long title takes two lines and no more (it is clamped)')
})

test('PIR-65: lines are counted word by word at a generous character width; a long text is cut into parts', () => {
  // 15 px type, 0.6 × 15 = 9 px a character: 100 px hold 11 characters.
  assert.equal(wrapLines('', 100, 15), 1)
  assert.equal(wrapLines('calibrate', 100, 15), 1)
  assert.equal(wrapLines('calibrate the rig', 100, 15), 2)
  assert.equal(wrapLines('x'.repeat(30), 100, 15), 3, 'a word longer than a line breaks anywhere')
  assert.equal(wrapLines('a\nb', 100, 15), 2)
  const parts = splitText(long(200), 300, 15, 3)
  assert.ok(parts.length > 1)
  for (const part of parts) assert.ok(wrapLines(part, 300, 15) <= 3, part)
  assert.equal(parts.join(' '), long(200), 'nothing is lost')
  assert.deepEqual(splitText('x'.repeat(100), 100, 15, 2).map((part) => part.length), [22, 22, 22, 22, 12])
})

test('PIR-65: a table runs on by rows — each part fits its room, the header on each, the total row with the last rows; a long cell is clamped with the full text in a title', () => {
  const rows = Array.from({ length: 40 }, (_, at) => [cellOf(at), cellOf(at % 3 ? `Feature ${at}` : long(80))])
  const block = table({ label: 'Rows', columns: [{ label: 'ID', width: 10, num: true }, { label: 'Title', width: 90 }], rows, foot: '<tr><th scope="row">All</th><td>40</td></tr>' })
  const pages = flow([block], bodyRoom(1))
  assert.ok(pages.length > 1)
  for (const page of pages) assert.ok(page.reduce((sum, piece) => sum + piece.height, 0) + gap * (page.length - 1) <= bodyRoom(1))
  assert.equal(pages.map((page) => page[0].html.match(/<tr>/g).length - 1).reduce((sum, count) => sum + count, 0) - 1, 40, 'every row once, plus the total row')
  assert.ok(pages.every((page) => page[0].html.includes('<thead>')))
  assert.deepEqual(pages.map((page) => page[0].html.includes('<tfoot>')), pages.map((_, at) => at === pages.length - 1))
  // A cell of 80 words in 90 % of the width: clamped to 2 lines, the full text in its title.
  assert.match(pages[0][0].html, new RegExp(`<div class="c l2" title="${long(80)}">`))
  // A one-line row is 30 px: 17 one-line rows under a one-line header (29 px) fill the 564 px body.
  const short = flow([table({ label: 'Short', columns: [{ label: 'ID', width: 100 }], rows: Array.from({ length: 30 }, (_, at) => [cellOf(at)]) })], bodyRoom(1))
  assert.deepEqual(short.map((page) => page[0].html.match(/<tr>/g).length - 1), [17, 13])
})

test('PIR-65, PIR-66: points, review columns and bar charts run on; blocks never take more than the body; one block per slide at least', () => {
  const points = pointsOf(Array.from({ length: 12 }, () => ({ text: long(200) })), contentWidth - 72)
  assert.ok(points.some((point) => point.more), 'a long point runs on in parts')
  assert.ok(points.every((point) => point.lines <= 6))
  const pages = flow([fixed('<dl></dl>', 112), pointList(points)], bodyRoom(1))
  for (const page of pages) assert.ok(page.reduce((sum, piece) => sum + piece.height, 0) + gap * (page.length - 1) <= bodyRoom(1))
  // Learnings | Struggles: both sides carry on together on the next slide, "(continued)".
  const left = sectionOf('Learnings', Array.from({ length: 10 }, () => long(60)), columnWidth), right = sectionOf('Struggles', ['short'], columnWidth)
  const review = flow([columns(left, right)], bodyRoom(2))
  assert.ok(review.length > 1)
  assert.match(review[1][0].html, /Learnings <small>\(continued\)<\/small>/)
  // A bar chart: as many 28 px bars as fit, the legend again on each part, the same scale.
  const chart = barChart('Bars', Array.from({ length: 40 }, (_, at) => ({ label: `Epic ${at}`, parts: [at + 1, 1], total: String(at + 2) })), [{ name: 'A', colour: '#257de0' }, { name: 'B', colour: '#f47230' }])
  const bars = flow([chart], bodyRoom(1))
  assert.deepEqual(bars.map((page) => (page[0].html.match(/<rect[^>]*height="18"/g) ?? []).length / 2), [19, 19, 2])
  assert.ok(bars.every((page) => page[0].height <= bodyRoom(1) && page[0].height === 24 + Math.round((page[0].height - 30) / barRow) * barRow + 6))
  // Slides of a kind: "(n of N)" titles, the same eyebrow.
  const slides = flowSlides('learnings', 'THEMES', 'Learnings', [pointList(points)])
  assert.deepEqual(slides.map((slide) => slide.title), slides.map((_, at) => `Learnings (${at + 1} of ${slides.length})`))
})
