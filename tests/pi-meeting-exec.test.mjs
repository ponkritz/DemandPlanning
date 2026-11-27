import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMeetingHtml, isMeetingHtml, meetingFeatures, meetingSlides, slideOrder } from '../src/piMeeting.ts'
import { allocation, carriedForward, carryStreak, closedInPi, epicGroups, hoursAndUtilization, longRunning, meetingExec, piMonths, piReleases, piSpanOf, spikeFactor, trendOf } from '../src/piMeetingData.ts'
import { addMonths, colourProblem, contrastRatio, defaultMeetingSettings, fillPlaceholders, isLongRunning, meetingSettingsChanges, meetingSettingsProblems, oldPiLimitsNote, parseMeetingSettings, sameMeetingSettings, serializeMeetingSettings } from '../src/piMeetingSettings.ts'
import { builtInFormSetup, mergePiFormText, parsePiFormSetup, serializePiFormSetup } from '../src/piReviewSetup.ts'
import { executiveLines, topicItems } from '../src/piMeetingExec.ts'
import { personMonths, totals } from '../src/dashboard.ts'
import { adhocTag } from '../src/workItemEdit.ts'

// PIR-64: the slide markup without its clamp wrappers ("c lN" boxes that hold each text to its counted lines), so the
// content can be read as before.
const plain = (html) => html.replace(/<(div|span) class="c l\d+"(?: title="[^"]*")?>([\s\S]*?)<\/\1>(?=<\/t[dh]>|<\/li>|<span class="arrow")/g, '$2').replace(/ class="c l\d+"(?: title="[^"]*")?/g, '').replace(/ class="([^"]*?) c l\d+"(?: title="[^"]*")?/g, ' class="$1"')
const slidesOf = (meeting) => meetingSlides(meeting).map((slide) => ({ ...slide, body: plain(slide.body) }))
// PIR-51…PIR-62: the executive slides of the PI Review Meeting on one fixed, synthetic dataset — PI 26.4 runs 7 Sep to
// 29 Nov 2026 in three Sprints; PI 26.3 before it is dated by its Sprints only.
const setup = builtInFormSetup(), start = '2026-09-01', today = '2026-11-26'
const node = (path, start, end) => ({ name: path.split('\\').at(-1), path: `\\Project\\Iteration\\${path}`, ...(start ? { attributes: { startDate: `${start}T00:00:00Z`, finishDate: `${end}T00:00:00Z` } } : {}) })
const iterations = [
  node('PI 26.3'), node('PI 26.3\\Sprint 1', '2026-06-08', '2026-07-05'), node('PI 26.3\\Sprint 2', '2026-07-06', '2026-08-02'), node('PI 26.3\\Sprint 3', '2026-08-03', '2026-09-06'),
  node('PI 26.4', '2026-09-07', '2026-11-29'), node('PI 26.4\\Sprint 1', '2026-09-07', '2026-10-04'), node('PI 26.4\\Sprint 2', '2026-10-05', '2026-11-01'), node('PI 26.4\\Sprint 3', '2026-11-02', '2026-11-29'),
]
const base = { organization: 'o', project: 'p', assignedTo: 'Rita Gomez', areaPath: 'p', tags: '', url: '', syncedAt: '' }
const wi = (id, workItemType, title, extra = {}) => ({ ...base, key: `o/p/${id}`, id, workItemType, title, state: 'Active', iterationPath: 'p', ...extra })
const tools = wi(100, 'Epic', 'Tools'), audits = wi(110, 'Epic', 'Audits')
const feature = (id, epic, extra = {}) => wi(id, 'Feature', `Feature ${id}`, { parentId: epic.id, iterationPath: 'p\\PI 26.4', createdDate: '2026-08-01T00:00:00Z', ...extra })
const pi = [
  feature(201, tools, { state: 'Closed', closedDate: '2026-10-10T08:00:00Z', tags: `${adhocTag}; x` }),
  feature(202, audits, { state: 'Closed', closedDate: '2026-09-06T23:00:00Z' }), // the day before the PI
  feature(203, audits, { state: 'Done', closedDate: '2026-11-29T22:00:00Z' }), // the PI's last day
  feature(204, tools), feature(205, tools),
  feature(206, audits, { state: 'Closed', closedDate: '2026-11-30T01:00:00Z' }), // the day after
  feature(207, tools, { tags: 'Ad-Hoc', createdDate: '2026-10-20T00:00:00Z' }),
  feature(208, audits), feature(209, audits),
]
const rows = pi.map((item) => ({ item, epic: item.parentId === 100 ? tools : audits }))
const headed = (forPi, move, extra = '') => `Feature Review for ${forPi}\nLearnings of ${forPi}:\n- calibrate first\nStruggles of ${forPi}:\n- vendor late\nWhether the feature needs to be shifted to PI 27.1 : ${move}\nAdvise to discuss the Feature during the Review meeting: ${extra || 'Offline Review'}`
const comment = (id, date, text, author = 'Rita Gomez <rita.gomez@example.com>') => ({ id, date, text, author })
const done = (comments) => ({ state: 'done', comments, capped: false, readAt: '2026-11-26T10:00:00Z' })
const discussions = {
  'o/p/201': done([comment(1, '2026-11-01T09:00:00Z', headed('PI 26.4', 'No', 'Discuss during Meeting'), 'Ken Ito <ken.ito@example.com>')]),
  'o/p/203': done([comment(2, '2026-11-02T09:00:00Z', headed('PI 26.4', 'No'))]),
  'o/p/204': done([comment(3, '2026-09-02T09:00:00Z', headed('PI 26.3', 'Yes')), comment(4, '2026-11-03T09:00:00Z', headed('PI 26.4', 'Yes'))]),
  'o/p/205': done([comment(5, '2026-11-04T09:00:00Z', headed('PI 26.4', 'Yes'))]),
  // Only a comment without the heading: no review, so not carried forward (PIR-49).
  'o/p/207': done([comment(6, '2026-11-05T09:00:00Z', headed('PI 26.4', 'Yes').replace('Feature Review for PI 26.4\n', ''))]),
}
const features = meetingFeatures(rows, (key) => discussions[key], setup, start, 'PI 26.4')
const { span } = piSpanOf(iterations, 'PI 26.4')

// Time Writing: Tools 40 / 40 / 160 h, Audits 20 h a month, in Sep, Oct, Nov 2026.
const capacity = { absenceEpicId: 999, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80, npraHoursPerMonth: 0, defaultJoinedOn: '2026-01-01' }
let next = 1000
const task = (month, parent, hours, who = 'Rita Gomez') => wi(next++, 'Task', `${month} | Time Writing`, { parentId: parent.id, assignedTo: who, originalEstimate: hours, completedWork: hours })
const items = [tools, audits, ...pi,
  task('September 2026', pi[3], 40), task('October 2026', pi[3], 40), task('November 2026', pi[3], 160, 'Ken Ito'),
  task('September 2026', pi[7], 20), task('October 2026', pi[7], 20), task('November 2026', pi[7], 20),
  // PIR-57, PIR-85: long-running candidates — 300 (Tools, a year old), 301 (Audits, 4.4 months; Audits' own limit is 3
  // months), 303 (Tools, 4.4 months, below the default 6), 302 (Tools, closed).
  feature(300, tools, { createdDate: '2025-12-01T00:00:00Z', iterationPath: 'p' }), feature(301, audits, { createdDate: '2026-07-15T00:00:00Z', iterationPath: 'p' }),
  feature(302, tools, { createdDate: '2025-01-01T00:00:00Z', state: 'Closed', iterationPath: 'p' }), feature(303, tools, { createdDate: '2026-07-15T00:00:00Z', iterationPath: 'p' }),
]
const settings = { ...defaultMeetingSettings(), streams: ['DP', 'IOCC'], longRunningMonths: { 110: 3 } }
const execOf = (extra = {}) => meetingExec({
  pi: 'PI 26.4', features, iterations, items, capacity, today, start, setup, settings, pis: ['p\\PI 26.4', 'p\\PI 26.3'],
  previousFeatures: [{ id: 150, title: 'Old', epic: 'Tools', epicId: 100, state: 'Closed', closedDate: '2026-07-01', status: 'reviewed', review: { moveValue: 'Yes', movePi: 'PI 26.4' } }, { id: 151, title: 'Older', epic: 'Tools', epicId: 100, state: 'Active', adhoc: true, status: 'unread' }],
  discussionOf: (entry) => discussions[`o/p/${entry.id}`], streamEpics: { DP: [100], IOCC: [110] }, moveOf: () => 'No',
  releases: [{ stream: 'DP', releases: [{ key: 'a', release: '1.0', date: '2026-09-07', month: '2026-09' }, { key: 'b', release: '1.1', date: '2026-09-06', month: '2026-09' }, { key: 'c', release: '2.0.1', month: '2026-10' }, { key: 'a', release: '1.0', date: '2026-10-01', month: '2026-10' }], classify: (release) => release.endsWith('.0') ? 'Major' : release.split('.').length === 3 ? 'MLD' : '' }, { stream: 'IOCC', why: 'No Release Details data: not fetched yet.', releases: [] }],
  ...extra,
})
const meetingOf = (extra = {}) => ({ pi: 'PI 26.4', builtAt: '26 Nov 2026, 14:30 CET', builtBy: 'Rita Gomez <rita.gomez@example.com>', start, features, settings, exec: execOf(), team: 'Quality', ...extra })

test('PIR-51: Closed in the PI is Closed / Done with the Closed Date inside the PI’s dates (both ends); carried forward from the headed review only; the ad-hoc tag counted (TC-PIR-52)', () => {
  assert.deepEqual(span, { start: '2026-09-07', end: '2026-11-29', sprints: [{ name: 'Sprint 1', start: '2026-09-07', end: '2026-10-04' }, { name: 'Sprint 2', start: '2026-10-05', end: '2026-11-01' }, { name: 'Sprint 3', start: '2026-11-02', end: '2026-11-29' }] })
  assert.deepEqual(features.filter((entry) => closedInPi(entry, span)).map((entry) => entry.id), [201, 203])
  assert.equal(closedInPi({ state: 'Active', closedDate: '2026-10-01' }, span), false, 'not Closed / Done')
  assert.equal(closedInPi({ state: 'Closed' }, span), false, 'no Closed Date')
  assert.equal(closedInPi({ state: 'Closed', closedDate: '2026-10-01' }, undefined), false, 'no PI dates')
  assert.deepEqual(features.filter(carriedForward).map((entry) => entry.id), [204, 205], '207 has Move = Yes without the heading: no review')
  assert.deepEqual(features.filter((entry) => entry.adhoc).map((entry) => entry.id), [201, 207], 'the app’s ad-hoc tag, any letter case')
  const lines = executiveLines(meetingOf())
  assert.deepEqual(lines.map((line) => [line.group.name, line.features, line.closed, line.carried, line.adhoc]), [['Tools', 4, 1, 2, 2], ['Audits', 5, 1, 0, 0]], 'Epic ID order: Tools #100 before Audits #110')
  // PI dates: from the Sprints when the PI has none; the reason when there are none.
  assert.deepEqual(piSpanOf(iterations, 'PI 26.3').span, { start: '2026-06-08', end: '2026-09-06', sprints: piSpanOf(iterations, 'PI 26.3').span.sprints })
  assert.match(piSpanOf(null, 'PI 26.4').why, /iterations were not read/)
  assert.match(piSpanOf([node('PI 26.4')], 'PI 26.4').why, /no start and finish dates/)
  // A month belongs to the PI that holds its 15th day.
  assert.deepEqual(piMonths(span), ['2026-09', '2026-10', '2026-11'])
  assert.deepEqual(piMonths(piSpanOf(iterations, 'PI 26.3').span), ['2026-06', '2026-07', '2026-08'])
})

test('PIR-62: the Epics in the chosen order — Epic ID ascending by default, or most Features first; No Epic last (TC-PIR-53)', () => {
  const list = [...features, { id: 1, title: 'Loose', epic: '', state: 'Active', status: 'none' }]
  assert.deepEqual(epicGroups(list, 'id').map((group) => group.name), ['Tools', 'Audits', 'No Epic'])
  assert.deepEqual(epicGroups(list, 'features').map((group) => `${group.name} ${group.features.length}`), ['Audits 5', 'Tools 4', 'No Epic 1'])
  const byFeatures = slidesOf(meetingOf({ settings: { ...settings, epicOrder: 'features' } }))
  assert.match(byFeatures.find((slide) => slide.kind === 'executive').body, /Audits[\s\S]*Tools/)
  assert.match(slidesOf(meetingOf()).find((slide) => slide.kind === 'executive').body, /<td>Tools<\/td>[\s\S]*<td>Audits<\/td>/)
})

test('PIR-55: hours per Epic are the Dashboard’s actuals; Allocation % adds up to 100; Utilization is the Dashboard’s actual ÷ capacity (TC-PIR-54)', () => {
  const { hours, utilization } = hoursAndUtilization(items, piMonths(span), today, capacity)
  assert.deepEqual(hours.byEpic.map((entry) => [entry.title, entry.epicId, entry.hours, entry.share]), [['Tools', 100, 240, 80], ['Audits', 110, 60, 20]])
  assert.equal(hours.total, 300)
  assert.deepEqual(hours.byMonth.map((entry) => entry.total), [60, 60, 180])
  const dashboard = totals(personMonths(items, piMonths(span), today, capacity))
  assert.equal(utilization.percent, dashboard.actualUtil, 'the Dashboard’s figure')
  assert.equal(utilization.capacity, dashboard.capacity)
  assert.equal(utilization.actual, dashboard.actual)
  for (const shares of [allocation([1, 1, 1]), allocation([2, 3, 5.5, 0.1]), allocation([7])]) assert.equal(Math.round(shares.reduce((sum, value) => sum + value, 0) * 10), 1000, String(shares))
  assert.deepEqual(allocation([1, 1, 1]), [33.4, 33.3, 33.3])
  assert.deepEqual(allocation([0, 0]), [0, 0])
  // No Time Writing data, no PI dates: the reason, no figure.
  assert.match(hoursAndUtilization(items, ['2027-03'], today, capacity).hours.why, /No Time Writing data for Mar 2027/)
  assert.match(hoursAndUtilization(items, [], today, capacity).utilization.why, /PI’s months are not known/)
})

test('PIR-56: a spike is a point above 1.5 × the PI’s average — one constant; the peak is the highest point (TC-PIR-55)', () => {
  assert.equal(spikeFactor, 1.5)
  const trend = trendOf('Hours', 'h', [10, 10, 10, 40].map((value, at) => ({ label: `M${at}`, value, detail: '' })))
  assert.deepEqual([trend.average, trend.peak, trend.spikes], [17.5, 3, [3]])
  assert.deepEqual(trendOf('x', '', [10, 15].map((value) => ({ label: '', value, detail: '' }))).spikes, [], '15 is not above 1.5 × 12.5')
  assert.deepEqual(trendOf('x', '', [15, 10, 5].map((value) => ({ label: '', value, detail: '' }))).spikes, [], 'exactly 1.5 × the average is no spike')
  assert.equal(trendOf('x', '', [0, 0].map((value) => ({ label: '', value, detail: '' }))).peak, undefined, 'no peak at zero')
  const exec = execOf()
  assert.equal(exec.trendsBy, 'sprint')
  const [hours, closed, adhoc] = exec.trends
  assert.deepEqual(hours.points.map((point) => point.value), [60, 60, 180])
  assert.deepEqual([hours.peak, hours.spikes], [2, [2]])
  assert.equal(hours.points[2].detail, 'Tools 160 h, Audits 20 h', 'the top contributors of the spike')
  assert.deepEqual(closed.points.map((point) => point.value), [0, 1, 1], '201 in Sprint 2, 203 in Sprint 3')
  assert.deepEqual(adhoc.points.map((point) => point.value), [0, 1, 0], '207 created in Sprint 2; 201 before the PI')
  const slides = slidesOf(meetingOf()).filter((slide) => slide.kind === 'trends')
  assert.deepEqual(slides.map((slide) => slide.title), ['Actual hours (team, by month)', 'Features closed (by sprint)', 'Ad-hoc Features added (by sprint)'])
  assert.match(slides[0].body, /Rule: a spike is a point above 1\.5 × the PI’s average \(average 100 h; spike above 150 h\)\. Peak: Nov 2026, 180 h\./)
  assert.match(slides[0].body, /<text x="[\d.]+" y="[\d.]+" text-anchor="middle" class="label">Sep 2026<\/text>/)
  assert.match(slides[0].body, /<svg class="chart"[^>]*role="img"/)
  assert.match(slides[0].body, /Peak 180 h/)
})

test('PIR-52, PIR-53: PI-over-PI from the same data; repeat carry-overs from headed reviews in a row (TC-PIR-56)', () => {
  const exec = execOf()
  assert.equal(exec.previous.pi, 'PI 26.3')
  assert.deepEqual([exec.previous.closed, exec.previous.carried, exec.previous.adhoc], [1, 1, 1])
  assert.match(exec.previous.why.carried, /1 Discussion was not read/)
  assert.deepEqual(exec.streaks.map((entry) => [entry.id, entry.pis]), [[204, ['PI 26.4', 'PI 26.3']]])
  assert.deepEqual(carryStreak(discussions['o/p/205'], setup, start, ['PI 26.4', 'PI 26.3']), ['PI 26.4'])
  assert.deepEqual(carryStreak(undefined, setup, start, ['PI 26.4']), [], 'not read')
  // Before PI Review starts there are no headed reviews: carried forward says why.
  assert.match(execOf({ start: '2026-09-10' }).previous.why.carried, /ended before PI Review starts/)
  assert.match(execOf({ pis: ['p\\PI 26.4'] }).previousWhy, /No earlier PI/)
  const body = slidesOf(meetingOf()).find((slide) => slide.kind === 'pi-trend').body
  assert.match(body, /Features closed in the PI<\/th><td class="num">1<\/td><td class="num">2<\/td><td><span class="up">▲ 1<\/span>/)
  assert.match(body, /Carried forward<\/th><td class="num">1<\/td><td class="num">2<\/td><td><span class="up">▲ 1<\/span> <span class="spike-tag">spike<\/span>/)
  assert.match(slidesOf(meetingOf()).find((slide) => slide.kind === 'repeat').body, /PI 26\.3 → PI 26\.4/)
})

test('PIR-54: releases of the ticked streams inside the PI’s dates, each once, with their Release Classification counts (TC-PIR-57)', () => {
  const [dp, iocc] = execOf().releases
  assert.deepEqual(dp, { stream: 'DP', releases: 2, classes: [['Major', 1], ['MLD', 1]], unclassified: 0, why: '', classWhy: '' })
  assert.equal(iocc.releases, null)
  assert.match(iocc.why, /not fetched yet/)
  assert.match(piReleases([{ stream: 'X', releases: [{ key: 'a', release: '1', month: '2026-09' }] }], span, piMonths(span), '')[0].classWhy, /No Release Classification/)
  assert.match(piReleases([{ stream: 'X', releases: [] }], undefined, [], 'No PI dates.')[0].why, /No PI dates/)
  const none = slidesOf(meetingOf({ exec: execOf({ settings: { ...settings, streams: [] } }) })).find((slide) => slide.kind === 'releases').body
  assert.match(none, /No release-based streams chosen/)
  const body = slidesOf(meetingOf()).find((slide) => slide.kind === 'releases').body
  assert.match(body, /<td>DP<\/td><td class="num" data-value="2">2<\/td><td>Major 1 · MLD 1<\/td>/)
  assert.match(body, /<td>IOCC<\/td><td class="num" data-value="-1">— <small class="muted">No Release Details data: not fetched yet\.<\/small>/)
})

test('PIR-57, PIR-85: long-running Features of the ticked streams — N months per Epic (default 6), age in months, years and PIs, oldest first (TC-PIR-58, TC-PIR-85)', () => {
  const long = execOf().long
  assert.equal(long.piDays, 84)
  assert.deepEqual(long.rows.map((row) => [row.id, row.epic, row.threshold, row.months, row.years, row.pis, row.streams]), [[300, 'Tools', 6, 11.8, 1, 4.3, ['DP']], [301, 'Audits', 3, 4.4, 0.4, 1.6, ['IOCC']], [208, 'Audits', 3, 3.8, 0.3, 1.4, ['IOCC']], [209, 'Audits', 3, 3.8, 0.3, 1.4, ['IOCC']]])
  assert.ok(!long.rows.some((row) => row.id === 303), '4.4 months is not more than the default 6')
  assert.deepEqual(long.byStream, [{ stream: 'DP', count: 1, why: '' }, { stream: 'IOCC', count: 3, why: '' }])
  const without = longRunning({ items, streamEpics: { DP: [] }, streams: ['DP'], settings, span, spanWhy: '', today, moveOf: () => '' })
  assert.match(without.byStream[0].why, /No Epics are mapped to DP/)
  // PIR-85: which Features run long does not depend on the PI's dates; only the age in PIs is then "—".
  const undated = longRunning({ items, streamEpics: { DP: [100] }, streams: ['DP'], settings, spanWhy: 'The PI’s dates are not known.', today, moveOf: () => '' })
  assert.equal(undated.why, '')
  assert.deepEqual(undated.rows.map((row) => [row.id, row.pis]), [[300, null]])
  assert.match(longRunning({ items, streamEpics: {}, streams: [], settings, today, spanWhy: '', moveOf: () => '' }).why, /No release-based streams chosen/)
  const body = slidesOf(meetingOf()).find((slide) => slide.kind === 'long-running').body
  assert.match(body, /Not Closed \/ Done and created more than N months ago \(N per Epic, set in PI setup\)\. Age from the Created Date to the build, in months · years · PIs \(one PI = 84 days, the length of PI 26\.4\)\./)
  assert.match(body, /<th[^>]*>.*Limit/)
  assert.match(body, /<td class="num" data-value="300">300<\/td><td>Feature 300<\/td><td>Tools<\/td><td>Active<\/td><td>2025-12-01<\/td><td class="num" data-value="360">11\.8 · 1 · 4\.3<\/td><td class="num" data-value="6">6 months<\/td><td>No<\/td>/)
  assert.match(body, /<td class="num" data-value="3">3 months<\/td>/)
  const undatedBody = slidesOf(meetingOf({ exec: { ...execOf(), long: undated } })).find((slide) => slide.kind === 'long-running').body
  assert.match(undatedBody, /11\.8 · 1 · —/)
  assert.match(undatedBody, /PIs —: the dates of PI 26\.4 are not known/)
})

test('PIR-85: the month boundary — created + N calendar months before the build day; exactly N months is not long-running, one day more is (TC-PIR-85)', () => {
  assert.equal(addMonths('2026-05-20', 6), '2026-11-20')
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28', 'the month’s last day when it is shorter')
  assert.equal(addMonths('2027-08-31', 6), '2028-02-29', 'a leap year')
  assert.equal(addMonths('2026-11-15', 14), '2028-01-15')
  assert.equal(isLongRunning('2026-05-20', 6, '2026-11-20'), false, 'exactly 6 months')
  assert.equal(isLongRunning('2026-05-20', 6, '2026-11-21'), true, 'one day more')
  // Through longRunning: Tools (default 6) and Audits (own 3 and 12), today 2026-11-26.
  const at = (id, epic, created) => feature(id, epic, { createdDate: `${created}T23:30:00Z`, iterationPath: 'p' })
  const world = [tools, audits, at(401, tools, '2026-05-26'), at(402, tools, '2026-05-25'), at(403, audits, '2026-08-26'), at(404, audits, '2026-08-25')]
  const run = (own) => longRunning({ items: world, streamEpics: { DP: [100, 110] }, streams: ['DP'], settings: { ...defaultMeetingSettings(), longRunningMonths: own }, span, spanWhy: '', today, moveOf: () => '' }).rows.map((row) => [row.id, row.threshold])
  assert.deepEqual(run({}), [[402, 6]], 'the default 6: 401 is exactly 6 months old, 402 one day more; Audits’ Features are 3 months old')
  assert.deepEqual(run({ 110: 3 }), [[402, 6], [404, 3]], 'Audits’ own 3 months: 403 exactly, 404 one day more')
  assert.deepEqual(run({ 110: 12, 100: 1 }), [[402, 1], [401, 1]], 'per Epic: Tools 1, Audits 12')
})

test('PIR-85: settings — default 6 months, months written under their own keys, an older file with PI values loads with the defaults and the note (TC-PIR-86)', () => {
  const defaults = defaultMeetingSettings()
  assert.equal(defaults.longRunningMonthsDefault, 6)
  assert.deepEqual(defaults.longRunningMonths, {})
  // Written under the new keys only; the file stays schema 2.
  const saved = serializePiFormSetup({ ...builtInFormSetup(), meeting: { ...defaults, longRunningMonthsDefault: 9, longRunningMonths: { 110: 12 } } })
  assert.match(saved, /"schema": 2/)
  assert.deepEqual(JSON.parse(saved).meeting, { longRunningMonthsDefault: 9, longRunningMonths: { 110: 12 } })
  assert.doesNotMatch(saved, /"longRunning"|"longRunningDefault"/)
  assert.deepEqual(parsePiFormSetup(saved).meeting, { ...defaults, longRunningMonthsDefault: 9, longRunningMonths: { 110: 12 } })
  assert.throws(() => parsePiFormSetup(saved.replace('"110": 12', '"110": 121')), /Long-running after \(months\), Epic #110: a whole number from 1 to 120/)
  // An older file (PIR-57: PIs) loads: the PI values are not converted — the defaults apply and the note is set.
  const older = JSON.stringify({ schema: 2, kind: builtInFormSetup().kind, fields: builtInFormSetup().fields, meeting: { streams: ['DP'], longRunningDefault: 3, longRunning: { 110: 1 }, accent: '#1b5e20' } })
  const loaded = parsePiFormSetup(older).meeting
  assert.deepEqual(loaded, { ...defaults, streams: ['DP'], accent: '#1b5e20', oldPiLimits: true })
  assert.match(oldPiLimitsNote, /now in months \(default 6\).*set them again/)
  // Even an old value the new rules would refuse still loads (it is not read).
  assert.equal(parseMeetingSettings({ longRunningDefault: 400 }).oldPiLimits, true)
  // Saving drops the old keys and writes the new ones only; the note is gone after the save.
  const resaved = serializePiFormSetup({ ...builtInFormSetup(), meeting: { ...loaded, oldPiLimits: undefined, longRunningMonths: { 110: 4 } } })
  assert.deepEqual(JSON.parse(resaved).meeting, { streams: ['DP'], longRunningMonths: { 110: 4 }, accent: '#1b5e20' })
  assert.equal(parsePiFormSetup(resaved).meeting.oldPiLimits, undefined)
  // Clearing the old values is a change on its own (Save to Git is offered), and two files differ by it.
  assert.deepEqual(meetingSettingsChanges(loaded, { ...loaded, oldPiLimits: undefined }), ['long-running after (months)'])
  assert.equal(sameMeetingSettings(loaded, { ...loaded, oldPiLimits: undefined }), false)
})

test('PIR-51: topics for discussion — every point of a Discuss during Meeting review with who raised it (display name) and when (TC-PIR-52)', () => {
  assert.deepEqual(topicItems(meetingOf()).map((item) => `${item.id} ${item.point}: ${item.text} — ${item.by}`), ['201 Learning: calibrate first — Ken Ito', '201 Struggle: vendor late — Ken Ito'])
})

test('PIR-58, PIR-59: the settings — defaults, strict reading, old files load, placeholders filled, contrast refused (TC-PIR-59)', () => {
  const defaults = defaultMeetingSettings()
  assert.deepEqual(parseMeetingSettings(undefined), defaults)
  assert.equal(defaults.longRunningMonthsDefault, 6)
  assert.deepEqual(defaults.streams, [])
  assert.equal(defaults.epicOrder, 'id')
  assert.equal(serializeMeetingSettings(defaults), undefined, 'the defaults are not written')
  // An older file (schema 1, no meeting settings) still loads, with the defaults; it is written back as schema 1.
  const old = serializePiFormSetup(builtInFormSetup())
  assert.match(old, /"schema": 1/)
  assert.equal(parsePiFormSetup(old).meeting, undefined)
  // Settings make it schema 2, and they read back the same.
  const saved = serializePiFormSetup({ ...builtInFormSetup(), meeting: { ...defaults, streams: ['DP'], longRunningMonths: { 110: 3 }, accent: '#1b5e20', titleTheme: 'dark', footer: 'Confidential · {team} · PI {PI}' } })
  assert.match(saved, /"schema": 2/)
  assert.deepEqual(parsePiFormSetup(saved).meeting, { ...defaults, streams: ['DP'], longRunningMonths: { 110: 3 }, accent: '#1b5e20', titleTheme: 'dark', footer: 'Confidential · {team} · PI {PI}' })
  assert.throws(() => parsePiFormSetup(old.replace('"fields"', '"meeting": {}, "fields"')), /schema 1 file has no meeting settings/)
  assert.throws(() => parsePiFormSetup(old.replace('"schema": 1', '"schema": 3')), /schema 1 or 2/)
  assert.throws(() => parsePiFormSetup(saved.replace('#1b5e20', 'red')), /not a colour written #rrggbb/)
  assert.throws(() => parsePiFormSetup(saved.replace('"110": 3', '"110": 0')), /Epic #110: a whole number from 1 to 120/)
  // A merge keeps the side that changed the meeting settings.
  const merged = parsePiFormSetup(mergePiFormText(old, saved, old, false))
  assert.equal(merged.meeting.accent, '#1b5e20')
  // Placeholders: {PI} is the PI's number; unknown ones refused.
  assert.equal(fillPlaceholders('PI Review Meeting — PI {PI} · {team} · {date} {time} by {builtBy}', { pi: 'PI 26.4', date: '26 Nov 2026', time: '14:30 CET', builtBy: 'Rita Gomez', team: 'Quality' }), 'PI Review Meeting — PI 26.4 · Quality · 26 Nov 2026 14:30 CET by Rita Gomez')
  assert.match(meetingSettingsProblems({ ...defaults, footer: 'PI {pi} {owner}' }).join(' '), /\{pi\}, \{owner\} is not a placeholder/)
  // WCAG AA: 4.5:1 against white, the light and the dark title slide alike.
  assert.ok(contrastRatio('#0b5394', '#ffffff') >= 4.5)
  assert.equal(colourProblem('#0b5394', 'dark'), '')
  assert.match(colourProblem('#f2a600', 'light'), /contrast with white is 2\.\d\d:1, below the 4\.5:1 of WCAG AA/)
  assert.match(colourProblem('#f2a600', 'dark'), /the white title on the dark title slide/)
})

test('PIR-58, PIR-60, PIR-62: the file — the executive slides in order, the template escaped, the footer with n / N, sortable tables, no request (TC-PIR-60)', async () => {
  assert.deepEqual(slideOrder.slice(4, 14), ['executive', 'completion', 'pi-trend', 'repeat', 'topics', 'releases', 'hours', 'utilization', 'trends', 'long-running'])
  const hostile = { ...settings, title: '<script>alert(1)</script> {PI}', subtitle: '"</p><img src=x onerror=alert(2)> {builtBy}', footer: 'Confidential · {team} · PI {PI}', team: '<b>Q&A</b>', accent: '#1b5e20', titleTheme: 'dark' }
  const meeting = meetingOf({ settings: hostile })
  const html = await buildMeetingHtml(meeting)
  assert.ok(html.includes('<h1>&lt;script&gt;alert(1)&lt;/script&gt; 26.4</h1>'))
  assert.ok(html.includes('&quot;&lt;/p&gt;&lt;img src=x onerror=alert(2)&gt; Rita Gomez'))
  assert.equal(html.match(/<script/gi).length, 1)
  assert.doesNotMatch(html, /https?:|url\(|@import|@example\.com/i)
  const tags = html.match(/<[a-z][^<>]*>/gi).map((tag) => tag.replace(/"[^"]*"/g, '""'))
  assert.deepEqual(tags.filter((tag) => /^<(?:img|iframe|object|embed|link|form|base|a)\b|\son[a-z]+=|\s(?:src|href|action|style)=/i.test(tag)), [], 'no markup from the data, no inline style or event attribute')
  const slides = slidesOf(meeting), total = slides.length
  const footers = [...html.matchAll(/<footer><span class="footer-text">([^<]*)<\/span><span class="slide-number">(\d+) \/ (\d+)<\/span><\/footer>/g)]
  assert.equal(footers.length, total)
  assert.deepEqual(footers.map((found) => found[1])[0], 'Confidential · &lt;b&gt;Q&amp;A&lt;/b&gt; · PI 26.4')
  assert.deepEqual(footers.map((found) => `${found[2]}/${found[3]}`), slides.map((_, at) => `${at + 1}/${total}`))
  assert.match(html, /<section class="slide slide-title dark"/)
  assert.match(html, /\.slide-title\.dark\{background:#1b5e20;color:#fff\}/)
  assert.doesNotMatch(html, /#0b5394/, 'the accent colour replaces the built-in blue')
  // The executive slides come after the Summary and before Discuss during Meeting.
  const kinds = [...new Set(slides.map((slide) => slide.kind))]
  assert.deepEqual(kinds, ['title', 'summary', 'summary-epics', 'executive', 'completion', 'pi-trend', 'repeat', 'topics', 'releases', 'hours', 'utilization', 'trends', 'long-running', 'discuss', 'reviewed', 'not-reviewed', 'learnings', 'struggles'])
  // Sortable headers: buttons with aria-sort on the header; the script sorts by data-value, else the text.
  assert.match(plain(html), /<th scope="col" aria-sort="none"><button type="button" class="sort" data-col="0">Epic<span class="arrow" aria-hidden="true"><\/span><\/button><\/th>/)
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1]
  for (const part of ["'aria-sort'", "'ascending'", "'descending'", 'data-value', 'data-goto']) assert.ok(script.includes(part), part)
  // Review completion links its Not reviewed number to the list.
  assert.match(slides.find((slide) => slide.kind === 'completion').body, /<button type="button" class="goto" data-goto="not-reviewed">4<\/button>/)
  assert.equal(await isMeetingHtml(html), true, 'a file of this version, whatever the colours')
  // Without the executive figures every new slide says why, never a number.
  const bare = slidesOf({ ...meetingOf(), exec: undefined })
  for (const kind of ['pi-trend', 'repeat', 'releases', 'hours', 'utilization', 'trends', 'long-running']) assert.match(bare.find((slide) => slide.kind === kind).body, /class="missing"><strong>—<\/strong> <span>Not worked out/, kind)
})
