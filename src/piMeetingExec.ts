// PIR-51…PIR-57, PIR-62 The executive slides of the PI Review Meeting (product owner, 26 Nov 2026) — each one small slide
// maker in the one slideOrder list of piMeeting.ts: Executive summary, Review completion, PI-over-PI trend, Repeat
// carry-overs, Topics for discussion, Releases in the PI, Hours per Epic, Utilization, Trends / peaks / spikes and
// Long-running Features. The figures come from piMeetingData.ts (worked out when the meeting is built); a figure that
// cannot be worked out shows "—" with the reason. Charts are inline SVG drawn here (no library, no request), in light,
// print-friendly colours, each with a table of the same numbers; every value goes through text().
// PIR-64…PIR-66: every slide is a 16:9 canvas — each maker gives blocks (piMeetingLayout.ts) that run on to "(n of N)"
// slides; the charts are drawn at the canvas width in CSS px (a viewBox of the same size, so 1 unit = 1 px).
import { carriedForward, closedInPi, epicGroups, monthLabel, ownerOfEpic, showsOwners, spikeFactor, type EpicGroup, type MeetingExec, type Trend } from './piMeetingData.ts'
import { defaultMeetingSettings, isHexColour, monthsLabel, type MeetingSettings } from './piMeetingSettings.ts'
import { displayName, lines, plural, text } from './piMeetingText.ts'
import { charWidth, cellOf, contentWidth, fixed, flowSlides, paragraph, table, tiles, type Block, type Cell, type Column, type Tile } from './piMeetingLayout.ts'
import { isNoneText } from './piReview.ts'
import type { Meeting, MeetingFeature, Slide, SlideKind } from './piMeeting.ts'

// Light, print-friendly series colours (validated categorical slots 1 and 2, a neutral grey for "other").
export const chartColours = { closed: '#257de0', carried: '#f47230', other: '#c4ccd6', bar: '#257de0', line: '#257de0', spike: '#c62828', grid: '#e3e7ec', axis: '#8a96a8' }
const settingsOf = (meeting: Meeting): MeetingSettings => meeting.settings ?? defaultMeetingSettings()
const noData = 'Not worked out: the executive figures were not given to this meeting.'
const execOf = (meeting: Meeting): MeetingExec | undefined => meeting.exec
const number = (value: number, digits = 0) => value.toLocaleString('en', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
const hours = (value: number) => `${number(value, 1)} h`
const percent = (value: number | null) => value == null ? '—' : `${number(value, 1)} %`
const clip = (value: string, max: number) => [...value].length > max ? `${[...value].slice(0, Math.max(1, max - 1)).join('')}…` : value
// How many characters of 12 px chart text fit in `width` px (the same generous width as the layout).
const fits = (width: number) => Math.max(3, Math.floor(width / (12 * charWidth)))

// PIR-61: "—" with the reason, for a value that cannot be worked out (never an invented figure); at most 3 lines.
export const missingBlock = (why: string) => paragraph('missing', `—— ${why}`, { html: `<strong>—</strong> <span>${text(why)}</span>`, padding: 16 })
const note = (value: string) => paragraph('note', value, { font: 13, lineHeight: 18, max: 3 })
const single = (kind: SlideKind, eyebrow: string, title: string, blocks: Block[]): Slide[] => flowSlides(kind, eyebrow, title, blocks)

// ---- inline SVG charts, as wide as the canvas ----
const W = contentWidth
const legendHeight = 24
function legendSvg(series: { name: string; colour: string }[]) {
  let x = 0
  return series.map((entry) => { const at = x; x += 18 + [...entry.name].length * 12 * charWidth + 22; return `<rect x="${at}" y="5" width="12" height="12" rx="2" fill="${entry.colour}"></rect><text x="${at + 18}" y="15" class="label">${text(entry.name)}</text>` }).join('')
}
// Horizontal bars, one row a label: stacked parts (series) or one value. 2px gaps between parts; the total at the end.
// PIR-66: split by bars — as many as fit on the slide, the next ones on the next (the same scale on every part).
export const barRow = 28
export function barChart(label: string, rows: { label: string; parts: number[]; total?: string }[], series: { name: string; colour: string }[]): Block {
  const left = 300, right = 170, area = W - left - right, legend = series.length > 1 ? legendHeight : 0
  const max = Math.max(1, ...rows.map((entry) => entry.parts.reduce((sum, value) => sum + value, 0)))
  const draw = (part: typeof rows) => {
    const height = legend + part.length * barRow + 6
    const bars = part.map((entry, at) => {
      const y = legend + 2 + at * barRow
      let x = left
      const parts = entry.parts.map((value, index) => {
        if (value <= 0) return ''
        const width = Math.max(2, value / max * area - 2)
        const rect = `<rect x="${x.toFixed(1)}" y="${y + 5}" width="${width.toFixed(1)}" height="18" rx="3" fill="${series[index]?.colour ?? chartColours.bar}"><title>${text(`${entry.label}: ${series[index]?.name ?? ''} ${number(value, 1)}`)}</title></rect>`
        x += width + 2
        return rect
      }).join('')
      const sum = entry.parts.reduce((total, value) => total + value, 0)
      return `<text x="${left - 8}" y="${y + 19}" text-anchor="end" class="label">${text(clip(entry.label, fits(left - 12)))}<title>${text(entry.label)}</title></text>${parts}<text x="${(x + 4).toFixed(1)}" y="${y + 19}" class="value">${text(clip(entry.total ?? number(sum, 1), fits(right - 8)))}</text>`
    }).join('')
    return { html: `<figure class="chart"><svg class="chart" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${text(label)}">${legend ? legendSvg(series) : ''}<line x1="${left}" y1="${legend}" x2="${left}" y2="${height}" stroke="${chartColours.axis}" stroke-width="1"></line>${bars}</svg></figure>`, height }
  }
  const from = (start: number): Block => ({
    take(room, alone) {
      let count = Math.min(rows.length - start, Math.floor((room - legend - 6) / barRow))
      if (count < 1) { if (!alone) return {}; count = 1 }
      return { piece: draw(rows.slice(start, start + count)), ...(start + count < rows.length ? { rest: from(start + count) } : {}) }
    },
  })
  return from(0)
}
// A line chart of a trend: the points, the peak labelled, the spikes marked, and the spike line (spikeFactor × average).
export const lineHeight = 240
export function lineChart(trend: Trend): Block {
  const left = 56, right = 64, top = 30, bottom = 44, height = lineHeight, plotW = W - left - right, plotH = height - top - bottom
  const values = trend.points.map((point) => point.value)
  const limit = spikeFactor * trend.average
  const max = Math.max(1, ...values, limit) * 1.1
  const x = (at: number) => left + (trend.points.length === 1 ? plotW / 2 : at / (trend.points.length - 1) * plotW)
  const y = (value: number) => top + plotH - value / max * plotH
  const path = trend.points.map((point, at) => `${x(at).toFixed(1)},${y(point.value).toFixed(1)}`).join(' ')
  const unit = trend.unit ? ` ${trend.unit}` : ''
  const room = fits(trend.points.length > 1 ? plotW / (trend.points.length - 1) - 8 : plotW)
  const marks = trend.points.map((point, at) => {
    const spike = trend.spikes.includes(at), peak = trend.peak === at
    const dot = spike ? `<circle cx="${x(at).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="7" fill="${chartColours.spike}" stroke="#ffffff" stroke-width="2"><title>${text(`${point.label}: ${number(point.value, 1)}${unit} — spike`)}</title></circle>` : `<circle cx="${x(at).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="4" fill="${chartColours.line}" stroke="#ffffff" stroke-width="2"><title>${text(`${point.label}: ${number(point.value, 1)}${unit}`)}</title></circle>`
    const tag = peak ? `<text x="${x(at).toFixed(1)}" y="${(y(point.value) - 12).toFixed(1)}" text-anchor="middle" class="value">${text(`Peak ${number(point.value, 1)}${unit}`)}</text>` : ''
    return `${dot}${tag}<text x="${x(at).toFixed(1)}" y="${height - 22}" text-anchor="middle" class="label">${text(clip(point.label, Math.min(14, room)))}</text>`
  }).join('')
  const spikeLine = trend.average > 0 ? `<line x1="${left}" y1="${y(limit).toFixed(1)}" x2="${W - right}" y2="${y(limit).toFixed(1)}" stroke="${chartColours.spike}" stroke-width="1" stroke-dasharray="4 4"></line><text x="${left + 4}" y="${(y(limit) - 4).toFixed(1)}" class="label">${text(`${spikeFactor} × average = ${number(limit, 1)}${unit}`)}</text>` : ''
  return fixed(`<figure class="chart"><svg class="chart" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${text(`${trend.measure}: line chart`)}"><line x1="${left}" y1="${top + plotH}" x2="${W - right}" y2="${top + plotH}" stroke="${chartColours.axis}" stroke-width="1"></line><text x="${left - 8}" y="${top + plotH + 4}" text-anchor="end" class="label">0</text><text x="${left - 8}" y="${top + 4}" text-anchor="end" class="label">${text(number(max, 0))}</text>${spikeLine}<polyline points="${path}" fill="none" stroke="${chartColours.line}" stroke-width="2"></polyline>${marks}</svg></figure>`, height)
}

// ---- the Epics in the chosen order ----
const groupsOf = (meeting: Meeting) => epicGroups(meeting.features, settingsOf(meeting).epicOrder)
const orderNote = (meeting: Meeting) => `Epics by ${settingsOf(meeting).epicOrder === 'features' ? 'number of Features (most first)' : 'Epic ID'}; click a column header to re-sort.`
const html = (value: string, plain: string, sort?: number | string): Cell => ({ html: value, plain, ...(sort != null ? { value: sort } : {}) })
const sortable = (label: string, columns: Column[], rows: Cell[][], foot = ''): Block => table({ label, columns, rows, sortable: true, ...(foot ? { foot } : {}) })
// PIR-68: the Product Owner column of a per-Epic table (display names only; "—" for an Epic without one) — only when the
// meeting has Product Owners; the other columns then give it their share (the widths still add up to 100).
const ownerColumn: Column = { label: 'Product Owner', width: 16 }
const ownerCell = (meeting: Meeting, epicId: number | undefined) => cellOf(ownerOfEpic(meeting, epicId) || '—')

// PIR-51: Executive summary — per Epic: Features, Closed in the PI, Carried forward, Ad-hoc; a stacked bar per Epic.
interface EpicLine { group: EpicGroup<MeetingFeature>; features: number; closed: number | null; carried: number; adhoc: number }
export function executiveLines(meeting: Meeting): EpicLine[] {
  const span = execOf(meeting)?.span
  return groupsOf(meeting).map((group) => ({ group, features: group.features.length, closed: span ? group.features.filter((feature) => closedInPi(feature, span)).length : null, carried: group.features.filter(carriedForward).length, adhoc: group.features.filter((feature) => feature.adhoc).length }))
}
export function executiveSlides(meeting: Meeting): Slide[] {
  const exec = execOf(meeting), list = executiveLines(meeting)
  const sum = (pick: (line: EpicLine) => number) => list.reduce((total, line) => total + pick(line), 0)
  const closedTotal = exec?.span ? sum((line) => line.closed ?? 0) : null
  const next = new Map<string, number>()
  for (const feature of meeting.features.filter(carriedForward)) { const pi = feature.review?.movePi || 'the next PI (not named)'; next.set(pi, (next.get(pi) ?? 0) + 1) }
  const nextText = [...next].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([pi, count]) => `${count} to ${pi}`).join(', ')
  const why = !exec ? noData : exec.span ? '' : exec.spanWhy
  const head = tiles([{ label: 'Features in the PI', value: number(meeting.features.length) }, { label: 'Closed in the PI', value: closedTotal == null ? '—' : number(closedTotal), detail: closedTotal == null ? why : 'Closed / Done with the Closed Date in the PI' }, { label: 'Carried forward', value: number(sum((line) => line.carried)), detail: nextText || 'Move to next PI = Yes: none' }, { label: 'Ad-hoc Features covered', value: number(sum((line) => line.adhoc)), detail: 'tagged ad-hoc' }])
  if (!list.length) return single('executive', 'EXECUTIVE SUMMARY', 'Executive summary', [head, ...(why ? [missingBlock(`Closed in the PI: ${why}`)] : []), paragraph('muted', 'No Features in the PI.')])
  const chart = barChart('Features per Epic: closed in the PI, carried forward, other', list.map((line) => { const closed = line.closed ?? 0, carried = line.group.features.filter((feature) => carriedForward(feature) && !(line.closed != null && closedInPi(feature, exec?.span))).length; return { label: line.group.name, parts: [closed, carried, Math.max(0, line.features - closed - carried)], total: `${line.features}` } }), [{ name: 'Closed in the PI', colour: chartColours.closed }, { name: 'Carried forward', colour: chartColours.carried }, { name: 'Other', colour: chartColours.other }])
  const po = showsOwners(meeting)
  const rows = sortable('Executive summary per Epic', [{ label: 'Epic', width: po ? 28 : 40 }, ...(po ? [ownerColumn] : []), { label: 'Epic ID', width: po ? 8 : 12, num: true }, { label: 'Features', width: po ? 10 : 12, num: true }, { label: 'Closed in the PI', width: po ? 14 : 12, num: true }, { label: 'Carried forward', width: po ? 12 : 12, num: true }, { label: 'Ad-hoc', width: po ? 12 : 12, num: true }],
    list.map((line) => [cellOf(line.group.name), ...(po ? [ownerCell(meeting, line.group.epicId)] : []), cellOf(line.group.epicId != null ? `#${line.group.epicId}` : '—', line.group.epicId ?? Number.MAX_SAFE_INTEGER), cellOf(line.features), line.closed == null ? cellOf('—', -1) : cellOf(line.closed), cellOf(line.carried), cellOf(line.adhoc)]),
    `<tr><th scope="row">All Epics</th>${po ? '<td></td>' : ''}<td></td><td class="num">${list.reduce((total, line) => total + line.features, 0)}</td><td class="num">${closedTotal == null ? '—' : closedTotal}</td><td class="num">${sum((line) => line.carried)}</td><td class="num">${sum((line) => line.adhoc)}</td></tr>`)
  return single('executive', 'EXECUTIVE SUMMARY', 'Executive summary', [head, ...(why ? [missingBlock(`Closed in the PI: ${why}`)] : []), chart, rows, note(`${orderNote(meeting)} A Feature both closed and carried forward counts as closed in the chart. Carried forward: the latest review headed for ${meeting.pi} says Move to next PI = Yes.`)])
}

// PIR-60: Review completion per Epic — % reviewed (a review headed for the PI), the not reviewed count linking to the
// Features not reviewed slide.
export function completionSlides(meeting: Meeting): Slide[] {
  const groups = groupsOf(meeting)
  const reviewedOf = (group: EpicGroup<MeetingFeature>) => group.features.filter((feature) => feature.status === 'reviewed').length
  const share = (done: number, all: number) => all ? Math.round(done / all * 1000) / 10 : 0
  const total = meeting.features.length, done = meeting.features.filter((feature) => feature.status === 'reviewed').length, po = showsOwners(meeting)
  const goto = (count: number) => count ? `<button type="button" class="goto" data-goto="not-reviewed">${text(count)}</button>` : '0'
  const head = tiles([{ label: 'Reviewed', value: `${number(share(done, total), 1)} %`, detail: `${done} of ${total} Features have a review headed for ${meeting.pi}` }, { label: 'Not reviewed', value: number(total - done), detail: 'listed on “Features not reviewed”' }])
  if (!groups.length) return single('completion', 'REVIEW COMPLETION', 'Review completion per Epic', [head, paragraph('muted', 'No Features in the PI.')])
  return single('completion', 'REVIEW COMPLETION', 'Review completion per Epic', [head,
    barChart('Share of Features reviewed per Epic (%)', groups.map((group) => ({ label: group.name, parts: [share(reviewedOf(group), group.features.length)], total: `${number(share(reviewedOf(group), group.features.length), 1)} %` })), [{ name: 'Reviewed %', colour: chartColours.bar }]),
    sortable('Review completion per Epic', [{ label: 'Epic', width: po ? 32 : 44 }, ...(po ? [ownerColumn] : []), { label: 'Features', width: po ? 13 : 14, num: true }, { label: 'Reviewed', width: po ? 13 : 14, num: true }, { label: 'Reviewed %', width: po ? 13 : 14, num: true }, { label: 'Not reviewed', width: po ? 13 : 14, num: true }],
      groups.map((group) => { const count = reviewedOf(group), left = group.features.length - count; return [cellOf(group.name), ...(po ? [ownerCell(meeting, group.epicId)] : []), cellOf(group.features.length), cellOf(count), cellOf(`${number(share(count, group.features.length), 1)} %`, share(count, group.features.length)), html(goto(left), String(left), left)] })),
    note(`${orderNote(meeting)} A Not reviewed number opens the list of the Features not reviewed.`)])
}

// PIR-52: PI-over-PI trend — closed, carried forward, ad-hoc and hours vs the previous PI, worked out the same way.
export function piTrendSlides(meeting: Meeting): Slide[] {
  const exec = execOf(meeting)
  if (!exec) return single('pi-trend', 'PI-OVER-PI TREND', 'PI-over-PI trend', [missingBlock(noData)])
  const list = executiveLines(meeting)
  const now = { closed: exec.span ? list.reduce((sum, line) => sum + (line.closed ?? 0), 0) : null, carried: list.reduce((sum, line) => sum + line.carried, 0), adhoc: list.reduce((sum, line) => sum + line.adhoc, 0), hours: exec.hours.why ? null : exec.hours.total }
  const before = exec.previous
  if (!before) return single('pi-trend', 'PI-OVER-PI TREND', 'PI-over-PI trend', [missingBlock(`No previous PI to compare with: ${exec.previousWhy}`)])
  const row = (label: string, current: number | null, previous: number | null, why: string, format: (value: number) => string = (value) => number(value)): Cell[] => {
    const change = current == null || previous == null ? '' : current > previous ? `<span class="up">▲ ${text(format(current - previous))}</span>` : current < previous ? `<span class="down">▼ ${text(format(previous - current))}</span>` : '<span class="same">= no change</span>'
    const changeText = current == null || previous == null ? '' : current > previous ? `▲ ${format(current - previous)}` : current < previous ? `▼ ${format(previous - current)}` : '= no change'
    const spike = current != null && previous != null && previous > 0 && current > spikeFactor * previous
    return [{ html: text(label), plain: label, head: true }, cellOf(previous == null ? '—' : format(previous)), cellOf(current == null ? '—' : format(current)),
      html(`${change}${spike ? ' <span class="spike-tag">spike</span>' : ''}${why ? ` <small class="muted">${text(why)}</small>` : ''}`, `${changeText}${spike ? ' spike' : ''}${why ? ` ${why}` : ''}`)]
  }
  return single('pi-trend', 'PI-OVER-PI TREND', `PI-over-PI trend: ${before.pi} → ${meeting.pi}`, [table({ label: 'PI-over-PI trend', columns: [{ label: 'Measure', width: 26 }, { label: before.pi, width: 14, num: true }, { label: meeting.pi, width: 14, num: true }, { label: 'Change', width: 46, lines: 3 }], rows: [
    row('Features closed in the PI', now.closed, before.closed, now.closed == null ? exec.spanWhy : before.why.closed),
    row('Carried forward', now.carried, before.carried, before.why.carried),
    row('Ad-hoc Features', now.adhoc, before.adhoc, ''),
    row('Actual hours', now.hours, before.hours, now.hours == null ? exec.hours.why : before.why.hours, hours),
  ] }), note(`${before.pi} is worked out the same way from the same data: its Features, its dates, its reviews (headed for ${before.pi}) and its Time Writing months. A spike: this PI above ${spikeFactor} × the previous PI.`)])
}

// PIR-53: Repeat carry-overs — carried forward in two or more PIs in a row: a risk.
export function repeatSlides(meeting: Meeting): Slide[] {
  const exec = execOf(meeting)
  if (!exec) return single('repeat', 'RISK', 'Repeat carry-overs', [missingBlock(noData)])
  if (!exec.streaks.length) return single('repeat', 'RISK', 'Repeat carry-overs', [exec.streakWhy ? missingBlock(exec.streakWhy) : paragraph('', 'None: no Feature was carried forward in two or more PIs in a row.')])
  const rows = [...exec.streaks].sort((a, b) => b.pis.length - a.pis.length || a.id - b.id)
  return single('repeat', `RISK · ${plural(rows.length, 'FEATURE')}`, 'Repeat carry-overs', [paragraph('warning', 'Risk: these Features were carried forward (Move to next PI = Yes) in two or more PIs in a row.', { padding: 16, max: 2 }),
    showsOwners(meeting) ? sortable('Repeat carry-overs', [{ label: 'ID', width: 8, num: true }, { label: 'Title', width: 28 }, { label: 'Epic', width: 14 }, { ...ownerColumn, width: 14 }, { label: 'PIs in a row', width: 10, num: true }, { label: 'Carried forward in', width: 26 }], rows.map((entry) => [cellOf(entry.id), cellOf(entry.title), cellOf(entry.epic), ownerCell(meeting, entry.epicId), cellOf(entry.pis.length), cellOf([...entry.pis].reverse().join(' → '))]))
      : sortable('Repeat carry-overs', [{ label: 'ID', width: 8, num: true }, { label: 'Title', width: 34 }, { label: 'Epic', width: 18 }, { label: 'PIs in a row', width: 10, num: true }, { label: 'Carried forward in', width: 30 }], rows.map((entry) => [cellOf(entry.id), cellOf(entry.title), cellOf(entry.epic), cellOf(entry.pis.length), cellOf([...entry.pis].reverse().join(' → '))]))])
}

// PIR-60: Topics for discussion — each point (Learnings, Struggles, Additional Remarks lines) of the Features marked
// "Discuss during Meeting", with who raised it (the review's author, display name only) and when.
export function topicItems(meeting: Meeting) {
  const order = new Map(groupsOf(meeting).map((group, at) => [group.key, at]))
  const keyOf = (feature: MeetingFeature) => feature.epicId != null ? `#${feature.epicId}` : feature.epic ? `name:${feature.epic}` : ''
  return meeting.features.filter((feature) => feature.status === 'reviewed' && feature.review?.reviewMode === 'Discuss during Meeting')
    .sort((a, b) => (order.get(keyOf(a)) ?? 0) - (order.get(keyOf(b)) ?? 0) || a.id - b.id)
    .flatMap((feature) => (['learnings', 'struggles', 'remarks'] as const).flatMap((which) => lines(feature.review![which]).filter((line) => !isNoneText(line)).map((line) => ({ id: feature.id, title: feature.title, point: which === 'learnings' ? 'Learning' : which === 'struggles' ? 'Struggle' : 'Remark', text: line, by: displayName(feature.review!.author), when: feature.review!.date }))))
}
export function topicSlides(meeting: Meeting): Slide[] {
  const items = topicItems(meeting)
  if (!items.length) return single('topics', 'TOPICS FOR DISCUSSION', 'Topics for discussion', [paragraph('muted', 'No point was raised in a review marked “Discuss during Meeting”.')])
  return single('topics', `TOPICS FOR DISCUSSION · ${plural(items.length, 'POINT')}`, 'Topics for discussion', [sortable('Topics for discussion', [{ label: 'Feature', width: 26 }, { label: 'Point', width: 9 }, { label: 'Raised', width: 37, lines: 3 }, { label: 'By', width: 12 }, { label: 'When', width: 16 }],
    items.map((item) => [html(`<span class="fid">#${item.id}</span> ${text(item.title)}`, `#${item.id}xxx ${item.title}`, item.id), cellOf(item.point), cellOf(item.text), cellOf(item.by), cellOf(item.when)]))])
}

// PIR-54: Releases in the PI — per ticked stream the releases and their Release Classification counts.
export function releaseSlides(meeting: Meeting): Slide[] {
  const exec = execOf(meeting)
  if (!exec) return single('releases', 'RELEASES', 'Releases in the PI', [missingBlock(noData)])
  if (!exec.releases.length) return single('releases', 'RELEASES', 'Releases in the PI', [paragraph('', `${exec.releasesWhy || 'No release-based streams chosen'}.`), paragraph('muted', 'The streams are ticked in Admin → Feature & PI setup → PI Review form → Meeting presentation.')])
  const known = exec.releases.filter((entry) => entry.releases != null)
  // PIR-68: a stream's Product Owners — those of its Epics (Admin → Streams → Bulk creation, a custom stream's Epics).
  const streamPo = exec.releases.some((entry) => meeting.streamOwners?.[entry.stream])
  const total = known.reduce((sum, entry) => sum + (entry.releases ?? 0), 0)
  const classes = (entry: MeetingExec['releases'][number]) => entry.releases == null ? '—' : entry.classWhy ? `— (${entry.classWhy})` : [...entry.classes.map(([name, count]) => `${name} ${count}`), ...(entry.unclassified ? [`not classified ${entry.unclassified}`] : [])].join(' · ') || '—'
  const head: Tile[] = [{ label: 'Releases in the PI', value: known.length ? number(total) : '—', detail: exec.span ? `${exec.span.start} – ${exec.span.end}` : exec.spanWhy }, { label: 'Streams', value: number(exec.releases.length), detail: exec.releases.map((entry) => entry.stream).join(', ') }]
  return single('releases', 'RELEASES', 'Releases in the PI', [tiles(head),
    ...(known.length ? [barChart('Releases per stream', known.map((entry) => ({ label: entry.stream, parts: [entry.releases ?? 0], total: number(entry.releases ?? 0) })), [{ name: 'Releases', colour: chartColours.bar }])] : []),
    sortable('Releases per stream', [{ label: 'Stream', width: streamPo ? 20 : 25 }, ...(streamPo ? [{ label: 'Product Owner', width: 18 }] : []), { label: 'Releases', width: 12, num: true }, { label: 'Release Classification', width: streamPo ? 50 : 63 }], exec.releases.map((entry) => [cellOf(entry.stream), ...(streamPo ? [cellOf(meeting.streamOwners?.[entry.stream] || '—')] : []), entry.releases == null ? html(`— <small class="muted">${text(entry.why)}</small>`, `— ${entry.why}`, -1) : cellOf(entry.releases), cellOf(classes(entry))])),
    note('Counted from the Release Details data of each stream: a release with its date (approval, else the stream’s own completion date) inside the PI’s dates, each once.')])
}

// PIR-55: Hours per Epic — actual hours (Completed Work of the month Tasks in the PI's months, by the Feature's Epic) and
// the Allocation %; Utilization — actual ÷ available capacity, the Dashboard's formula.
export function hoursSlides(meeting: Meeting): Slide[] {
  const exec = execOf(meeting)
  if (!exec) return single('hours', 'HOURS', 'Hours per Epic', [missingBlock(noData)])
  const figures = exec.hours
  if (figures.why) return single('hours', 'HOURS', 'Hours per Epic', [missingBlock(figures.why)])
  const featureCount = new Map(groupsOf(meeting).map((group) => [group.epicId, group.features.length]))
  const order = settingsOf(meeting).epicOrder, po = showsOwners(meeting)
  const list = [...figures.byEpic].sort((a, b) => (a.key === 'unmapped' ? 1 : 0) - (b.key === 'unmapped' ? 1 : 0) || (order === 'features' ? (featureCount.get(b.epicId) ?? 0) - (featureCount.get(a.epicId) ?? 0) : 0) || (a.epicId ?? Infinity) - (b.epicId ?? Infinity) || a.title.localeCompare(b.title))
  return single('hours', `HOURS · ${figures.months.map(monthLabel).join(', ').toUpperCase()}`, 'Hours per Epic', [tiles([{ label: 'Actual hours', value: hours(figures.total), detail: 'booked on Epics in the PI’s months' }, { label: 'Epics', value: number(list.length), detail: 'with hours' }]),
    barChart('Actual hours per Epic', list.map((entry) => ({ label: entry.title, parts: [entry.hours], total: `${hours(entry.hours)} · ${number(entry.share, 1)} %` })), [{ name: 'Actual hours', colour: chartColours.bar }]),
    sortable('Hours per Epic', [{ label: 'Epic', width: po ? 32 : 46 }, ...(po ? [{ ...ownerColumn, width: 18 }] : []), { label: 'Epic ID', width: po ? 14 : 18, num: true }, { label: 'Actual hours', width: 18, num: true }, { label: 'Allocation %', width: 18, num: true }], list.map((entry) => [cellOf(entry.title), ...(po ? [ownerCell(meeting, entry.epicId)] : []), cellOf(entry.epicId != null ? `#${entry.epicId}` : '—', entry.epicId ?? Number.MAX_SAFE_INTEGER), cellOf(hours(entry.hours), entry.hours), cellOf(`${number(entry.share, 1)} %`, entry.share)]), `<tr><th scope="row">All Epics</th>${po ? '<td></td>' : ''}<td></td><td class="num">${text(hours(figures.total))}</td><td class="num">100 %</td></tr>`),
    note('Actuals only: the Completed Work of the Time Writing month Tasks in the PI’s months (a month belongs to the PI that holds its 15th day), by the Feature’s Epic, as Team overview counts them. Allocation % = the Epic’s hours ÷ the hours of all Epics.')])
}
export function utilizationSlides(meeting: Meeting): Slide[] {
  const exec = execOf(meeting)
  if (!exec) return single('utilization', 'UTILIZATION', 'Utilization', [missingBlock(noData)])
  const figures = exec.utilization
  if (figures.why && !figures.byMonth.length) return single('utilization', 'UTILIZATION', 'Utilization', [missingBlock(figures.why)])
  return single('utilization', 'UTILIZATION', 'Utilization', [tiles([{ label: 'Team utilization', value: percent(figures.percent), detail: figures.why || `${hours(figures.actual)} actual ÷ ${hours(figures.capacity)} available` }, { label: 'People', value: number(figures.people), detail: 'with Time Writing in the PI’s months' }]),
    barChart('Utilization per month (%)', figures.byMonth.map((entry) => ({ label: monthLabel(entry.month), parts: [entry.percent ?? 0], total: percent(entry.percent) })), [{ name: 'Utilization %', colour: chartColours.bar }]),
    sortable('Utilization per month', [{ label: 'Month', width: 34 }, { label: 'Actual hours', width: 22, num: true }, { label: 'Available capacity', width: 22, num: true }, { label: 'Utilization', width: 22, num: true }], figures.byMonth.map((entry) => [cellOf(monthLabel(entry.month), entry.month), cellOf(hours(entry.actual), entry.actual), cellOf(hours(entry.capacity), entry.capacity), cellOf(percent(entry.percent), entry.percent ?? -1)])),
    note('The Dashboard’s formula: actual (utilized) hours ÷ available capacity (contractual hours less absence) for the PI’s months, the team as a whole.')])
}

// PIR-56: Trends, peaks and spikes — one slide per measure: the line, the peak labelled, the spikes marked and listed.
export function trendSlides(meeting: Meeting): Slide[] {
  const exec = execOf(meeting)
  if (!exec) return single('trends', 'TRENDS, PEAKS AND SPIKES', 'Trends, peaks and spikes', [missingBlock(noData)])
  return exec.trends.flatMap((trend) => {
    const unit = trend.unit ? ` ${trend.unit}` : ''
    if (trend.why) return single('trends', 'TRENDS, PEAKS AND SPIKES', trend.measure, [missingBlock(trend.why)])
    const spikes = trend.spikes.map((at) => trend.points[at])
    return single('trends', 'TRENDS, PEAKS AND SPIKES', trend.measure, [lineChart(trend), paragraph('rule', `Rule: a spike is a point above ${spikeFactor} × the PI’s average (average ${number(trend.average, 1)}${unit}; spike above ${number(spikeFactor * trend.average, 1)}${unit}).${trend.peak != null ? ` Peak: ${trend.points[trend.peak].label}, ${number(trend.points[trend.peak].value, 1)}${unit}.` : ''}`, { font: 13, lineHeight: 18, max: 3 }),
      spikes.length ? table({ label: 'Spikes', columns: [{ label: 'Spike', width: 20 }, { label: 'Value', width: 15, num: true }, { label: 'Top contributors', width: 65 }], rows: spikes.map((point) => [cellOf(point.label), cellOf(`${number(point.value, 1)}${unit}`), cellOf(point.detail || '—')]) }) : paragraph('muted', 'No spike in this PI.')])
  })
}

// PIR-57, PIR-85: Long-running Features of the ticked streams — oldest first, each with its Epic's limit in months.
export function longRunningSlides(meeting: Meeting): Slide[] {
  const exec = execOf(meeting)
  if (!exec) return single('long-running', 'LONG-RUNNING', 'Long-running Features', [missingBlock(noData)])
  const figures = exec.long
  if (figures.why) return single('long-running', 'LONG-RUNNING', 'Long-running Features', [missingBlock(figures.why)])
  const counts = sortable('Long-running Features by stream', [{ label: 'Stream', width: 70 }, { label: 'Long-running', width: 30, num: true }], figures.byStream.map((entry) => [cellOf(entry.stream), entry.why ? html(`— <small class="muted">${text(entry.why)}</small>`, `— ${entry.why}`, -1) : cellOf(entry.count)]))
  const head = note(`Not Closed / Done and created more than N months ago (N per Epic, set in PI setup). Age from the Created Date to the build, in months · years · PIs (${figures.piDays ? `one PI = ${figures.piDays} days, the length of ${meeting.pi}` : `PIs —: the dates of ${meeting.pi} are not known`}).`)
  if (!figures.rows.length) return single('long-running', 'LONG-RUNNING', 'Long-running Features', [counts, head, paragraph('', 'None: no open Feature of these streams is older than its limit.')])
  const po = showsOwners(meeting)
  return single('long-running', `LONG-RUNNING · ${plural(figures.rows.length, 'FEATURE')}`, 'Long-running Features', [counts, head, sortable('Long-running Features, oldest first', [{ label: 'ID', width: 7, num: true }, { label: 'Title', width: po ? 19 : 25 }, { label: 'Epic', width: po ? 11 : 13 }, ...(po ? [{ ...ownerColumn, width: 12 }] : []), { label: 'State', width: 8 }, { label: 'Created', width: 10 }, { label: 'Age (months · years · PIs)', width: po ? 12 : 14, num: true }, { label: 'Limit', width: 9, num: true }, { label: 'Move to next PI', width: po ? 12 : 14 }],
    figures.rows.map((entry) => [cellOf(entry.id), cellOf(entry.title), cellOf(entry.epic), ...(po ? [ownerCell(meeting, entry.epicId)] : []), cellOf(entry.state), cellOf(entry.created), cellOf(`${number(entry.months, 1)} · ${number(entry.years, 1)} · ${entry.pis == null ? '—' : number(entry.pis, 1)}`, entry.days), cellOf(monthsLabel(entry.threshold), entry.threshold), cellOf(entry.move || '—')]))])
}

// The accent colour of the file (validated; the default otherwise).
export const accentOf = (settings: MeetingSettings | undefined) => settings && isHexColour(settings.accent) ? settings.accent.toLowerCase() : defaultMeetingSettings().accent
// Executive slides' styles (the charts, the sortable headers, the dark title slide); `accent` set per build.
// PIR-67: the dark title slide keeps its colours in print too (print-color-adjust: exact).
export const execStyle = (accent: string) => `.slide-title.dark{background:${accent};color:#fff}
.slide-title.dark h1,.slide-title.dark .eyebrow,.slide-title.dark .muted,.slide-title.dark footer{color:#fff}
.slide-title.dark footer{border-top-color:rgba(255,255,255,.4)}
figure.chart{margin:0}
svg.chart{display:block}
svg.chart .label{font-size:12px;fill:#3b4757}
svg.chart .value{font-size:12px;font-weight:600;fill:#1b2430}
.up{color:#1b5e20;font-weight:600}.down{color:#b71c1c;font-weight:600}.same{color:#56657a}
.spike-tag{display:inline-block;padding:0 6px;border-radius:8px;line-height:17px;background:#fdecea;color:#b71c1c;font-size:12px;font-weight:700}
th button.sort{all:unset;cursor:pointer;display:inline-flex;gap:4px;align-items:flex-start;max-width:100%;vertical-align:top}
th button.sort:focus-visible{outline:2px solid ${accent};outline-offset:2px}
th[aria-sort="ascending"] .arrow::after{content:"▲"}
th[aria-sort="descending"] .arrow::after{content:"▼"}
button.goto{font:inherit;line-height:17px;padding:0 8px;border:1px solid #c4ccd6;border-radius:6px;background:#fff;color:${accent};cursor:pointer;text-decoration:underline;vertical-align:top}
button.goto:focus-visible{outline:2px solid ${accent};outline-offset:2px}
table.t tfoot th,table.t tfoot td{font-weight:700;border-top:2px solid #c4ccd6}
@media print{th button.sort .arrow{display:none}}
`
