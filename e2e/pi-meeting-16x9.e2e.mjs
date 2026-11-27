import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { buildMeetingHtml, meetingSlides } from '../src/piMeeting.ts'
import { trendOf } from '../src/piMeetingData.ts'
import { defaultMeetingSettings } from '../src/piMeetingSettings.ts'

// TC-PIR-64 (PIR-64…PIR-67): every slide of the PI Review Meeting is a fixed 16:9 page. A meeting large enough to need
// splitting — 24 Epics with long names, 72 Features with long titles, long reviews and topics, 36 long-running rows, 25
// repeat carry-overs — is built in Node and opened as the downloaded file. At 1366 × 768 and 1920 × 1200 every slide is
// 16:9 (±0.5 %), letterboxed inside the window, nothing inside it reaches outside its box, nothing is cut by its body,
// and the layout is the same at both sizes (scaled, not reflowed). The overview shows 16:9 thumbnails. Printed to PDF:
// one 16:9 page a slide. Synthetic data only; every step waits for what it needs, never for a time.
let browser
before(async () => { browser = await chromium.launch() })
after(async () => { await browser.close() })
const shots = process.env.PI_16X9_SHOTS

const words = 'calibrate the rig before the audit window and book the vendor slot early so that the fixture library stays in step with the supplier pack while the lab keeps its own schedule for the qualification runs'.split(' ')
const prose = (count, seed) => Array.from({ length: count }, (_, at) => words[(at * 7 + seed) % words.length]).join(' ')
const sentence = (count, seed) => { const value = prose(count, seed); return `${value[0].toUpperCase()}${value.slice(1)}.` }
const epics = Array.from({ length: 24 }, (_, at) => ({ id: 100 + at, title: `Epic ${at + 1} — quality engineering for the laboratory automation platform roll-out wave ${at + 1}` }))
const date = '02 Oct 2026, 09:00 CET'
function featureOf(at) {
  const epic = epics[at % epics.length], id = 1000 + at
  const base = { id, title: `${sentence(22, at)} (Feature ${id})`, epic: epic.title, epicId: epic.id, assignedTo: at % 3 ? 'Rita Gomez' : 'Ken Ito', state: at % 5 ? 'Active' : 'Closed', ...(at % 5 ? {} : { closedDate: '2026-10-20T10:00:00Z' }), createdDate: at < 36 ? '2025-01-10T08:00:00Z' : '2026-08-01T08:00:00Z', ...(at % 7 ? {} : { adhoc: true }) }
  if (at >= 54) return { ...base, status: at % 2 ? 'none' : 'unread' }
  const discuss = at < 18
  // Feature 1000: a very long review (it runs on over several slides); the others two to four long points.
  const points = (seed) => Array.from({ length: at === 0 ? 14 : 2 + (at % 3) }, (_, line) => `- ${sentence(at === 0 ? 60 : 18 + line * 6, seed + line)}`).join('\n')
  return { ...base, status: 'reviewed', review: {
    author: 'Rita Gomez', date, from: 'Headings', learnings: points(at), struggles: points(at + 3),
    move: at % 4 ? 'No' : `Yes — ${sentence(16, at)} · to PI 27.1`, moveValue: at % 4 ? 'No' : 'Yes', movePi: at % 4 ? '' : 'PI 27.1',
    mode: discuss ? 'Discuss during Meeting' : 'Offline Review', reviewMode: discuss ? 'Discuss during Meeting' : 'Offline Review',
    remarks: discuss ? `${sentence(40, at + 5)}\n${sentence(30, at + 9)}` : '', fields: at % 6 ? [] : [{ label: 'Risks and dependencies', text: sentence(50, at + 2) }], text: '',
  } }
}
const features = Array.from({ length: 72 }, (_, at) => featureOf(at))
const months = ['2026-09', '2026-10', '2026-11']
const byEpic = epics.map((epic, at) => ({ key: `#${epic.id}`, title: epic.title, epicId: epic.id, hours: 40 + at * 7, share: 0 }))
const total = byEpic.reduce((sum, entry) => sum + entry.hours, 0)
for (const entry of byEpic) entry.share = Math.round(entry.hours / total * 1000) / 10
const points = (values, labels) => values.map((value, at) => ({ label: labels[at], value, detail: at === values.length - 1 ? epics.slice(0, 6).map((epic) => `${epic.title} ${value / 6} h`).join(', ') : '' }))
const exec = {
  span: { start: '2026-09-07', end: '2026-11-29', sprints: [] }, spanWhy: '',
  previous: { pi: 'PI 26.3', closed: 3, carried: 4, adhoc: 1, hours: 900, why: { closed: '', carried: sentence(30, 3), hours: '' } }, previousWhy: '',
  streaks: Array.from({ length: 25 }, (_, at) => ({ id: 1000 + at, title: features[at].title, epic: features[at].epic, epicId: features[at].epicId, pis: ['PI 26.4', 'PI 26.3', ...(at % 2 ? ['PI 26.2'] : [])] })), streakWhy: '',
  hours: { months, total, byEpic, byMonth: months.map((month) => ({ month, total: total / 3, byEpic: [] })), why: '' },
  utilization: { months, actual: 1800, capacity: 2400, percent: 75, byMonth: months.map((month, at) => ({ month, actual: 600, capacity: 800, percent: 70 + at * 5 })), people: 12, why: '' },
  trendsBy: 'sprint', trends: [
    trendOf('Actual hours (team, by month)', 'h', points([600, 620, 1800], ['Sep 2026', 'Oct 2026', 'Nov 2026'])),
    trendOf('Features closed (by sprint)', '', points([1, 2, 1, 3, 2, 9], ['Sprint 1 of the platform roll-out', 'Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5', 'Sprint 6'])),
  ],
  releases: ['DP', 'IOCC', 'Platform', 'Lab systems', 'Supplier portal', 'Fixtures'].map((stream, at) => ({ stream, releases: at === 2 ? null : 3 + at, classes: [['Major', 1], ['Minor', 2 + at], ['MLD', at]], unclassified: at, why: at === 2 ? `No Release Details data: ${sentence(20, at)}` : '', classWhy: '' })), releasesWhy: '',
  long: { rows: Array.from({ length: 36 }, (_, at) => ({ id: 1000 + at, title: features[at].title, epic: features[at].epic, epicId: features[at].epicId, state: 'Active', created: '2025-01-10', streams: ['DP'], days: 680 - at, months: 22.3, years: 1.9, pis: 8.1, threshold: 6, move: at % 4 ? 'No' : 'Yes' })), byStream: [{ stream: 'DP', count: 36, why: '' }, { stream: 'IOCC', count: 0, why: sentence(14, 1) }], piDays: 84, why: '' },
}
const meeting = { pi: 'PI 26.4', builtAt: '26 Nov 2026, 14:30 CET', builtBy: 'Rita Gomez', start: '2026-09-01', features, exec, team: 'Quality',
  settings: { ...defaultMeetingSettings(), subtitle: `${sentence(40, 2)} {team} · {date}`, footer: `Confidential · {team} · PI {PI} · ${sentence(30, 4)}` } }

async function openFile(html, viewport) {
  const dir = mkdtempSync(join(tmpdir(), 'dph-16x9-'))
  const path = join(dir, 'PI-Review-Meeting-PI-26.4.html')
  writeFileSync(path, html)
  const context = await browser.newContext({ viewport, ...(shots ? { deviceScaleFactor: 2 } : {}) })
  const requests = [], problems = []
  await context.route(/^(?!file:)/, (route) => { requests.push(route.request().url()); return route.abort() })
  const file = await context.newPage()
  const slowdown = Number(process.env.E2E_CPU_SLOWDOWN ?? 1)
  if (slowdown > 1) await (await context.newCDPSession(file)).send('Emulation.setCPUThrottlingRate', { rate: slowdown })
  file.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') problems.push(message.text()) })
  file.on('pageerror', (error) => problems.push(error.message))
  await file.goto(pathToFileURL(path).href)
  await file.locator('html.js').waitFor({ state: 'attached' })
  return { file, requests, problems, close: async () => { await context.close(); rmSync(dir, { recursive: true, force: true }) } }
}

// The current slide measured in the page: its box, the window, every element that reaches outside the box, whether its
// body or the slide scrolls, and the layout before scaling (the offset sizes of the body's blocks).
const measure = (file) => file.locator('.slide.current').evaluate((slide) => {
  const box = slide.getBoundingClientRect(), out = []
  for (const element of slide.querySelectorAll('*')) {
    const rect = element.getBoundingClientRect()
    if (!rect.width && !rect.height) continue
    if (rect.left < box.left - 1 || rect.top < box.top - 1 || rect.right > box.right + 1 || rect.bottom > box.bottom + 1) out.push(`${element.tagName.toLowerCase()}.${element.className?.baseVal ?? element.className} ${Math.round(rect.top - box.top)}..${Math.round(rect.bottom - box.top)} of ${Math.round(box.height)}`)
  }
  const body = slide.querySelector('.body')
  return { width: box.width, height: box.height, left: box.left, top: box.top, right: box.right, bottom: box.bottom, window: [innerWidth, innerHeight], out,
    scroll: [slide.scrollWidth - slide.clientWidth, slide.scrollHeight - slide.clientHeight, body.scrollWidth - body.clientWidth, body.scrollHeight - body.clientHeight],
    layout: [slide.offsetWidth, slide.offsetHeight, ...[...body.children].map((child) => `${child.offsetWidth}x${child.offsetHeight}`)].join(' '), title: slide.querySelector('h1, h2').textContent }
})

test('TC-PIR-64: every slide is a 16:9 page — at two window sizes nothing leaves the slide, long lists and reviews run on, the overview shows 16:9 thumbnails, and the PDF has one 16:9 page a slide', async () => {
  const slides = meetingSlides(meeting)
  // The dataset needs splitting: the long lists and the long review run on to "(n of N)" slides.
  for (const title of ['Summary by Epic', 'Executive summary', 'Review completion per Epic', 'Repeat carry-overs', 'Topics for discussion', 'Hours per Epic', 'Long-running Features', 'Features not reviewed', 'Learnings', 'Struggles', `#1000 ${features[0].title}`]) assert.ok(slides.some((slide) => slide.title === `${title} (2 of ${slides.filter((entry) => entry.title.startsWith(`${title} (`)).length})`), `${title} runs on`)
  const html = await buildMeetingHtml(meeting)
  const layouts = []
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1200 }]) {
    const { file, requests, problems, close } = await openFile(html, viewport)
    const total = await file.locator('.slide').count()
    assert.equal(total, slides.length)
    const seen = []
    for (let at = 0; at < total; at += 1) {
      if (at) { await file.keyboard.press('ArrowRight'); await file.locator('#counter', { hasText: `${at + 1} / ${total}` }).waitFor() }
      const found = await measure(file)
      const where = `slide ${at + 1} "${found.title}" at ${viewport.width}×${viewport.height}`
      assert.ok(Math.abs(found.width / found.height / (16 / 9) - 1) <= 0.005, `${where}: ${found.width}×${found.height} is not 16:9`)
      assert.ok(found.left >= -0.5 && found.top >= -0.5 && found.right <= found.window[0] + 0.5 && found.bottom <= found.window[1] + 0.5, `${where}: the slide is not inside the window`)
      assert.ok(Math.abs(found.left + found.right - found.window[0]) <= 1 && Math.abs(found.top + found.bottom - found.window[1]) <= 1, `${where}: the slide is not centred`)
      assert.ok(Math.abs(found.width - found.window[0]) <= 1 || Math.abs(found.height - found.window[1]) <= 1, `${where}: the slide does not fill the window (letterboxed)`)
      assert.deepEqual(found.out, [], `${where}: outside the slide`)
      assert.deepEqual(found.scroll, [0, 0, 0, 0], `${where}: the slide or its body overflows`)
      seen.push(found.layout)
      if (shots && viewport.width === 1366) {
        mkdirSync(shots, { recursive: true })
        const name = at === 0 ? 'title' : found.title.startsWith('Long-running Features (1') ? 'dense-table' : found.title.startsWith('Hours per Epic') && !seen.some((entry, index) => index < at && slides[index].title.startsWith('Hours per Epic')) ? 'chart' : found.title.startsWith('Actual hours') ? 'line-chart' : found.title === `#1000 ${features[0].title} (1 of ${slides.filter((entry) => entry.title.startsWith('#1000 ')).length})` ? 'feature' : found.title.startsWith('Learnings (1 ') ? 'learnings' : ''
        if (name) await file.screenshot({ path: `${shots}/pi-16x9-${name}.png` })
      }
    }
    layouts.push(seen)
    // The overview: a 16:9 thumbnail for every slide.
    await file.keyboard.press('Home')
    await file.locator('#counter', { hasText: `1 / ${total}` }).waitFor()
    await file.keyboard.press('o')
    const overview = file.getByRole('navigation', { name: 'Slide overview' })
    await overview.waitFor()
    const thumbs = await overview.locator('button[data-slide]').evaluateAll((buttons) => buttons.map((button) => { const rect = button.getBoundingClientRect(); return rect.width / rect.height }))
    assert.equal(thumbs.length, total)
    for (const ratio of thumbs) assert.ok(Math.abs(ratio / (16 / 9) - 1) <= 0.01, `thumbnail ${ratio}`)
    if (shots && viewport.width === 1366) await file.screenshot({ path: `${shots}/pi-16x9-overview.png` })
    await file.keyboard.press('Escape')
    await overview.waitFor({ state: 'hidden' })
    if (viewport.width === 1366) {
      // Print to PDF: one page a slide, each page 16:9 (1280 × 720 CSS px = 960 × 540 pt), no page split inside a slide.
      await file.emulateMedia({ media: 'print' })
      assert.equal(await file.locator('.slide').first().evaluate((element) => getComputedStyle(element).breakAfter), 'page')
      const pdf = (await file.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1')
      const pages = [...pdf.matchAll(/\/Type\s*\/Page\b(?!s)/g)].length
      assert.equal(pages, total, 'one PDF page a slide')
      const boxes = [...new Set([...pdf.matchAll(/\/MediaBox\s*\[\s*([\d.\s]+)\]/g)].map((found) => found[1].trim().split(/\s+/).map(Number).join(' ')))]
      assert.equal(boxes.length, 1, `one page size: ${boxes}`)
      const [x0, y0, x1, y1] = boxes[0].split(' ').map(Number)
      assert.ok(Math.abs((x1 - x0) / (y1 - y0) / (16 / 9) - 1) <= 0.005, `the PDF page ${boxes[0]} is 16:9`)
    }
    assert.deepEqual(requests, [], 'no request leaves the file')
    assert.deepEqual(problems, [], 'no error and no policy report (the scaling uses the CSS object model)')
    await close()
  }
  // Scaled, not reflowed: the same blocks, the same sizes, at both window sizes.
  assert.deepEqual(layouts[1], layouts[0])
})
