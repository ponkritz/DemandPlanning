import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMeetingHtml, canConductMeeting, displayName, isMeetingHtml, isMeetingPath, maxMeetingBytes, meetingBuiltOf, meetingCounts, meetingFeatures, meetingFileName, meetingFolder, meetingPath, meetingPi, meetingSaveBlock, meetingSlides, meetingTitle, scrub, slideMakers, slideOrder, themeItems } from '../src/piMeeting.ts'
import { builtInFormSetup } from '../src/piReviewSetup.ts'
import { sha256Base64, inlineScript } from '../src/standaloneHtml.ts'

// PIR-64: the slide markup without its clamp wrappers ("c lN" boxes that hold each text to its counted lines), so the
// content can be read as before.
const plain = (html) => html.replace(/<(div|span) class="c l\d+"(?: title="[^"]*")?>([\s\S]*?)<\/\1>(?=<\/t[dh]>|<\/li>|<span class="arrow")/g, '$2').replace(/ class="c l\d+"(?: title="[^"]*")?/g, '').replace(/ class="([^"]*?) c l\d+"(?: title="[^"]*")?/g, ' class="$1"')
const slidesOf = (meeting) => meetingSlides(meeting).map((slide) => ({ ...slide, body: plain(slide.body) }))
// The PI Review Meeting presentation (PIR-40…PIR-47; TC-PIR-42…TC-PIR-45). Synthetic data only.
const feature = (id, title, epicId, assignedTo = 'Rita Gomez', state = 'Active') => ({ key: `example/project/${id}`, id, title, workItemType: 'Feature', state, assignedTo, assignedToEmail: `${assignedTo.split(' ')[0].toLowerCase()}@example.com`, iterationPath: 'Project\\PI 26.4', parentId: epicId })
const epic = (id, title) => ({ key: `example/project/${id}`, id, title, workItemType: 'Epic', state: 'Active', assignedTo: '', iterationPath: 'Project' })
const review = ({ learnings = '- book the rig early', struggles = '- vendor late', move = 'No', mode = 'Offline Review', remarks = '' } = {}) => `Feature Review for PI 26.4\nLearnings of PI 26.4:\n${learnings}\nStruggles of PI 26.4:\n${struggles}\nWhether the feature needs to be shifted to PI 27.1 : ${move}\nAdvise to discuss the Feature during the Review meeting: ${mode}${remarks ? `\nAdditional Remarks:\n${remarks}` : ''}`
const comment = (id, date, text, author = 'Rita Gomez') => ({ id, date, text, author, authorEmail: 'rita.gomez@example.com' })
const done = (comments) => ({ state: 'done', comments, capped: false, readAt: '2026-11-26T10:00:00Z' })
const tools = epic(100, 'Tools'), audit = epic(110, 'Audits')
const rows = [
  { item: feature(201, 'Lab rig upgrade', 100), epic: tools },
  { item: feature(202, 'Supplier audit pack', 110, 'Ken Ito'), epic: audit },
  { item: feature(203, 'Fixture library', 100), epic: tools },
  { item: feature(204, 'Calibration plan', 110), epic: audit },
  { item: feature(205, 'Old review only', 100), epic: tools },
  { item: feature(206, 'Read failed', 110), epic: audit },
  { item: feature(207, 'Without Epic') },
]
const discussions = {
  'example/project/201': done([comment(1, '2026-10-02T09:00:00Z', review({ mode: 'Discuss during Meeting', move: 'Yes — waiting for the vendor', remarks: 'Needs a decision' }))]),
  'example/project/202': done([comment(2, '2026-10-05T09:00:00Z', review({ learnings: 'None', struggles: '- audit late' }), 'Ken Ito <ken.ito@example.com>')]),
  'example/project/203': done([comment(3, '2026-10-06T09:00:00Z', review({ learnings: '- reuse fixtures', mode: 'Discuss during Meeting' }))]),
  'example/project/204': done([comment(4, '2026-10-07T09:00:00Z', 'Feature Review for PI 26.4\nWe were blocked by the lab. Next time we book early.')]),
  // Only a comment before the start date: not reviewed.
  'example/project/205': done([comment(5, '2026-09-01T09:00:00Z', review({ learnings: '- an old learning' }))]),
  'example/project/206': { state: 'error', error: 'Azure DevOps answered 500.' },
}
const setup = builtInFormSetup(), start = '2026-09-21'
const meetingOf = (overrides = {}) => ({ pi: 'PI 26.4', builtAt: '26 Nov 2026, 14:30 CET', builtBy: 'Rita Gomez', start, features: meetingFeatures(rows, (key) => discussions[key], setup, start, 'PI 26.4'), ...overrides })

test('PIR-42: the snapshot — each Feature reviewed or not by its latest comment on or after the start date; the counts of the Summary (TC-PIR-42)', () => {
  const meeting = meetingOf()
  const status = Object.fromEntries(meeting.features.map((entry) => [entry.id, entry.status]))
  assert.deepEqual(status, { 201: 'reviewed', 202: 'reviewed', 203: 'reviewed', 204: 'reviewed', 205: 'none', 206: 'error', 207: 'unread' })
  const first = meeting.features[0].review
  assert.equal(first.reviewMode, 'Discuss during Meeting')
  assert.equal(first.moveValue, 'Yes')
  assert.match(first.move, /^Yes — waiting for the vendor/)
  assert.equal(first.remarks, 'Needs a decision')
  assert.equal(meeting.features[3].review.from, 'Keywords')
  const counts = meetingCounts(meeting.features)
  assert.deepEqual({ ...counts, nextPis: [...counts.nextPis] }, { features: 7, reviewed: 4, none: 1, unread: 2, yes: 1, no: 2, partly: 0, noMove: 1, discuss: 2, offline: 1, noMode: 1, nextPis: [['PI 27.1', 1]] })
  // Another start date: the same Discussions, read again with it.
  assert.equal(meetingFeatures(rows, (key) => discussions[key], setup, '2026-08-01', 'PI 26.4')[4].status, 'reviewed')
  assert.equal(meetingFeatures(rows, (key) => discussions[key], setup, '2026-10-06', 'PI 26.4')[0].status, 'none')
  // PIR-49: only a comment headed "Feature Review for PI 26.4" is a review of PI 26.4 — not one headed for PI 26.5, not
  // one without the heading (an older review).
  const only = (text) => meetingFeatures([rows[0]], () => done([comment(1, '2026-10-02T09:00:00Z', text)]), setup, start, 'PI 26.4')[0].status
  assert.equal(only(review()), 'reviewed')
  assert.equal(only(review().replace('PI 26.4\n', 'PI 26.5\n')), 'none')
  assert.equal(only(review().replace('Feature Review for PI 26.4\n', '')), 'none')
  assert.equal(meetingFeatures([rows[0]], (key) => discussions[key], setup, start, 'PI 26.5')[0].status, 'none')
})

test('PIR-41: the slides come in one fixed order — Title, Summary, Discuss during Meeting one per Feature, the other reviewed Features by Epic, the Not reviewed list, Learnings, then Struggles (TC-PIR-43)', () => {
  // PIR-51…PIR-57: the executive slides after the Summary, before Discuss during Meeting.
  const executive = ['executive', 'completion', 'pi-trend', 'repeat', 'topics', 'releases', 'hours', 'utilization', 'trends', 'long-running']
  // PIR-86…PIR-89: 'agenda' and 'team' (the team sections) are empty without presenting teams (TC-PIR-91).
  assert.deepEqual(slideOrder, ['title', 'agenda', 'summary', 'summary-epics', ...executive, 'team', 'discuss', 'reviewed', 'not-reviewed', 'learnings', 'struggles'])
  assert.deepEqual(Object.keys(slideMakers).sort(), [...slideOrder].sort(), 'each slide type is one function')
  const slides = slidesOf(meetingOf()).filter((slide) => !executive.includes(slide.kind))
  assert.deepEqual(slides.map((slide) => `${slide.kind}: ${slide.title}`), [
    'title: PI Review Meeting — PI 26.4', 'summary: Summary', 'summary-epics: Summary by Epic',
    'discuss: #201 Lab rig upgrade', 'discuss: #203 Fixture library',
    'reviewed: #202 Supplier audit pack', 'reviewed: #204 Calibration plan',
    'not-reviewed: Features not reviewed', 'learnings: Learnings', 'struggles: Struggles',
  ])
  // Grouped by Epic in the chosen order (PIR-62: Epic ID by default — Tools #100 before Audits #110), No Epic last; the
  // eyebrow names the Epic and the place in it.
  assert.equal(slides[5].eyebrow, 'REVIEWED · AUDITS · 1 OF 2')
  assert.equal(slides[4].eyebrow, 'DISCUSS DURING MEETING · 2 OF 2')
  // The Not reviewed list names each Feature and why, No Epic last.
  assert.match(slides[7].body, /205<\/td><td>Old review only<\/td><td>Tools<\/td><td>Rita Gomez<\/td><td>No review headed for this PI since /)
  assert.match(slides[7].body, /206<\/td>.*The Discussion could not be read/)
  assert.match(slides[7].body, /207<\/td><td>Without Epic<\/td><td>No Epic<\/td>.*The Discussion was not read/)
  // A Feature slide: its facts, Learnings and Struggles, Move with the reason, the advice, Additional Remarks, the byline.
  const rig = slides[3].body
  for (const part of ['<dt>Epic</dt><dd>Tools</dd>', '<dt>Assigned to</dt><dd>Rita Gomez</dd>', '<dt>State</dt><dd>Active</dd>', '<h3>Learnings</h3><p>book the rig early</p>', '<h3>Struggles</h3><p>vendor late</p>', '<dt>Review meeting</dt><dd>Discuss during Meeting</dd>', '<h3>Additional Remarks</h3><p>Needs a decision</p>', 'Review by Rita Gomez, ']) assert.ok(rig.includes(part), part)
  assert.match(rig, /<dt>Move to next PI<\/dt><dd>Yes — waiting for the vendor/)
  // The Themes: each line with its Feature ID, "None" left out, a keyword guess marked.
  assert.deepEqual(themeItems(meetingOf(), 'learnings').map((item) => `#${item.id} ${item.text}${item.suggested ? ' (suggested)' : ''}`), ['#201 book the rig early', '#203 reuse fixtures', '#204 Next time we book early. (suggested)'])
  assert.deepEqual(themeItems(meetingOf(), 'struggles').map((item) => `#${item.id} ${item.text}`), ['#201 vendor late', '#202 audit late', '#203 vendor late', '#204 We were blocked by the lab.'])
  // Without any review: the title, the summary, one Not reviewed list and the empty Themes — still in order.
  const none = slidesOf(meetingOf({ features: meetingFeatures(rows, () => undefined, setup, start, 'PI 26.4') }))
  assert.deepEqual(none.map((slide) => slide.kind), ['title', 'summary', 'summary-epics', ...executive, 'not-reviewed', 'learnings', 'struggles'])
  assert.match(none[0].body, /7 Discussions were not read when it was built/)
})

test('PIR-45, PIR-65: long lists run over several slides — as many rows as fit on the 16:9 slide (TC-PIR-64)', () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ item: feature(300 + index, `Feature ${index}`, 100), epic: tools }))
  const discussed = Object.fromEntries(many.map(({ item }) => [item.key, done([comment(item.id, '2026-10-02T09:00:00Z', review({ learnings: `- learning ${item.id}`, struggles: 'None' }))])]))
  const slides = slidesOf(meetingOf({ features: meetingFeatures(many, (key) => discussed[key], setup, start, 'PI 26.4') }))
  // A one-line point is 32 px (21 px line, 5 px above and below, a 1 px rule); the body of a slide with a one-line title
  // is 564 px: 17 points a slide.
  const learnings = slides.filter((slide) => slide.kind === 'learnings')
  assert.deepEqual(learnings.map((slide) => slide.title), ['Learnings (1 of 2)', 'Learnings (2 of 2)'])
  assert.deepEqual(learnings.map((slide) => slide.body.match(/<li/g).length), [17, 13])
  // A one-line row is 30 px (19 px line, 5 px above and below, a 1 px rule), the header row 29 px: 17 rows a slide.
  const unread = slidesOf(meetingOf({ features: meetingFeatures(many, () => undefined, setup, start, 'PI 26.4') })).filter((slide) => slide.kind === 'not-reviewed')
  assert.deepEqual(unread.map((slide) => slide.title), ['Features not reviewed (1 of 2)', 'Features not reviewed (2 of 2)'])
  assert.deepEqual(unread.map((slide) => slide.body.match(/<tr>/g).length - 1), [17, 13])
})

test('PIR-43: every value is escaped — a comment with <script> and "</script>" stays text; no e-mail, identity id or external address in the file; the policy blocks every request (TC-PIR-44)', async () => {
  const hostile = '<script>alert(1)</script> and "</script><img src=x onerror=alert(2)>" & \'quotes\''
  const evil = [{ item: { ...feature(201, `Rig ${hostile}`, 100, 'Rita Gomez <rita.gomez@example.com>'), state: '<b>Active</b>' }, epic: epic(100, `Tools ${hostile}`) }]
  const text = review({ learnings: `- ${hostile}`, struggles: '- mail ken.ito@example.com or @<8f1c2d3e-0a1b-4c5d-9e8f-001122334455>', mode: 'Discuss during Meeting', remarks: hostile })
  const meeting = meetingOf({ pi: 'PI 26.4 <i>', builtBy: 'Rita Gomez <rita.gomez@example.com>', features: meetingFeatures(evil, () => done([comment(1, '2026-10-02T09:00:00Z', text, `Ken <ken.ito@example.com>`)]), setup, start, 'PI 26.4') })
  const html = await buildMeetingHtml(meeting)
  // Exactly one script element — the navigation — and no markup from the data.
  assert.equal(html.match(/<script/gi).length, 1)
  assert.equal(html.match(/<\/script>/gi).length, 1)
  const tags = html.match(/<[a-z][^<>]*>/gi)
  assert.deepEqual(tags.map((tag) => tag.replace(/"[^"]*"/g, `""`)).filter((tag) => /^<(?:img|b|i|a|iframe|object|embed|link|form|base|math)\b|\son[a-z]+=|\s(?:src|href|action|poster|srcset|style)=/i.test(tag)), [])
  // PIR-51: the only SVG is the file's own charts (role="img", drawn by the builder), never markup from the data.
  assert.ok(tags.filter((tag) => /^<svg\b/i.test(tag)).every((tag) => /^<svg class="(?:chart|key)"/.test(tag)))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; and &quot;&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt;&quot; &amp; &#39;quotes&#39;'))
  // Display names only: no e-mail address, no identity id.
  assert.doesNotMatch(html, /@example\.com|8f1c2d3e-0a1b/)
  assert.match(html, /mail \[email\] or \[id\]/)
  assert.match(html, /Built 26 Nov 2026, 14:30 CET by Rita Gomez</)
  assert.match(html, /Review by Ken, /)
  // No external address and nothing that loads: no http(s), no src, href, link, iframe, object or url().
  assert.doesNotMatch(html, /https?:|url\(|@import/i)
  // The policy of the interactive HTML file: only this script and these styles, by hash; nothing else.
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)[1]
  assert.match(csp, /^default-src 'none'; script-src 'sha256-[A-Za-z0-9+/]{43}='; style-src 'sha256-[A-Za-z0-9+/]{43}='; img-src data:; base-uri 'none'; form-action 'none'$/)
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1], style = /<style>([\s\S]*?)<\/style>/.exec(html)[1]
  assert.ok(csp.includes(`'sha256-${await sha256Base64(script)}'`) && csp.includes(`'sha256-${await sha256Base64(style)}'`))
  assert.equal(script, inlineScript(script))
  // The title carries the PI, the build date and time; the keyboard and print are part of the file.
  assert.match(html, /<title>PI Review Meeting — PI 26.4 &lt;i&gt; · 26 Nov 2026, 14:30 CET<\/title>/)
  for (const key of ["'ArrowRight'", "'ArrowLeft'", "'Home'", "'End'", "'Escape'"]) assert.ok(script.includes(key), key)
  assert.match(style, /@page\{size:1280px 720px;margin:0\}/)
  assert.match(style, /@media print\{[^@]*\.slide,\.js \.slide,\.js \.slide\.current\{[^}]*break-inside:avoid;break-after:page/)
  // A file of this version is recognised; a changed one is not (Open refuses it).
  assert.equal(await isMeetingHtml(html), true)
  assert.equal(await isMeetingHtml(html.replace("script-src 'sha256-", "script-src 'unsafe-inline' 'sha256-")), false)
  assert.equal(await isMeetingHtml(`<!-- -->${html}`), false)
  assert.equal(await isMeetingHtml(html.replace(script, 'alert(1)').replace(/script-src 'sha256-[^']+'/, `script-src 'sha256-${await sha256Base64('alert(1)')}'`)), false)
})

test('PIR-43: names and text are cleaned of e-mail addresses and identity ids', () => {
  assert.equal(displayName('Rita Gomez <rita.gomez@example.com>'), 'Rita Gomez')
  assert.equal(displayName('rita.gomez@example.com'), 'Unknown')
  assert.equal(displayName(''), 'Unknown')
  assert.equal(scrub('ask @<0a1b2c3d-1111-2222-3333-444455556666> or a.b@example.org'), 'ask [id] or [email]')
})

test('PIR-47: the file path in the Git data repository, and only such paths (TC-PIR-45)', () => {
  const at = new Date(2026, 10, 26, 9, 5)
  assert.equal(meetingPi('Project\\PI 26.4'), 'PI 26.4')
  assert.equal(meetingPi('Project\\PI 2026.4'), 'PI 2026.4')
  assert.equal(meetingTitle('PI 26.4'), 'PI Review Meeting — PI 26.4')
  assert.equal(meetingFolder('PI 26.4'), 'pi-review/meetings/PI-26.4')
  assert.equal(meetingPath('PI 26.4', at), 'pi-review/meetings/PI-26.4/PI-Review-Meeting-PI-26.4-2026-11-26-0905.html')
  assert.equal(meetingFileName('PI 26.4', at, ['PI-Review-Meeting-PI-26.4-2026-11-26-0905.html']), 'PI-Review-Meeting-PI-26.4-2026-11-26-0905-2.html')
  assert.equal(meetingBuiltOf('pi-review/meetings/PI-26.4/PI-Review-Meeting-PI-26.4-2026-11-26-0905.html'), '2026-11-26 09:05')
  for (const path of ['pi-review/meetings/PI-26.4/PI-Review-Meeting-PI-26.4-2026-11-26-0905.html', 'pi-review/meetings/PI-26.4/PI-Review-Meeting-PI-26.4-2026-11-26-0905-2.html', meetingPath('Release 7 / Q3', at)]) assert.equal(isMeetingPath(path), true, path)
  for (const path of ['pi-review/meetings/PI-26.4/../../access.json', 'pi-review/meetings/PI-26.4/PI-Review-Meeting-PI-26.5-2026-11-26-0905.html', 'pi-review/meetings/PI-26.4/notes.html', 'planning-data.json', 'pi-review/meetings/PI-26.4/PI-Review-Meeting-PI-26.4-2026-11-26-0905.js', 'x/pi-review/meetings/PI-26.4/PI-Review-Meeting-PI-26.4-2026-11-26-0905.html']) assert.equal(isMeetingPath(path), false, path)
  assert.equal(maxMeetingBytes, 5 * 1024 * 1024)
})

test('PIR-40, PIR-47: who sees Conduct PI Meeting, and why the Git copy is not saved — the download never blocked (TC-PIR-42)', () => {
  assert.equal(canConductMeeting((action) => action === 'pireview.post'), true)
  assert.equal(canConductMeeting((action) => action === 'pireview.setup'), true)
  assert.equal(canConductMeeting(() => false), false)
  const ok = { viewingAs: '', rolesMissing: false, isSample: false, connected: true, readOnly: false }
  assert.equal(meetingSaveBlock(ok), '')
  assert.equal(meetingSaveBlock({ ...ok, viewingAs: 'Ken Ito' }), 'Viewing as Ken Ito: the meeting is downloaded only, not saved to Git.')
  assert.equal(meetingSaveBlock({ ...ok, isSample: true }), 'Synthetic sample data is loaded: the meeting is downloaded only, not saved to Git.')
  assert.equal(meetingSaveBlock({ ...ok, connected: false }), 'Git storage is not connected (Admin → Data & history): the meeting is downloaded only.')
  assert.equal(meetingSaveBlock({ ...ok, readOnly: true }), 'Your Git token can read but not save: the meeting is downloaded only.')
  assert.equal(meetingSaveBlock({ ...ok, rolesMissing: true }), 'The roles file is not loaded yet: the meeting is downloaded only, not saved to Git.')
})
