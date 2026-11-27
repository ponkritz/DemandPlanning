import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMeetingHtml, meetingFeatures, meetingSlides, teamSections } from '../src/piMeeting.ts'
import { defaultAgenda, defaultMeetingSettings, meetingSettingsChanges, meetingSettingsProblems, parseMeetingSettings, presentingTeamsProblems, readPresentingTeams, sameMeetingSettings, serializeMeetingSettings, teamLabel, teamNotesNote, teamProblem } from '../src/piMeetingSettings.ts'
import { builtInFormSetup, parsePiFormSetup, serializePiFormSetup } from '../src/piReviewSetup.ts'

// The presenting teams of the PI Review Meeting (PIR-86…PIR-90; TC-PIR-87…TC-PIR-91). Synthetic data only: the teams
// "Platform Services (PLS)" and "Quality Tools (QTL)", the Epics Tools #100, Audits #110 and Plans #120.
const plain = (html) => html.replace(/ class="c l\d+"(?: title="[^"]*")?/g, '').replace(/ class="([^"]*?) c l\d+"(?: title="[^"]*")?/g, ' class="$1"').replace(/<div>([^<]*)<\/div>/g, '$1')
const feature = (id, title, epicId) => ({ key: `example/project/${id}`, id, title, workItemType: 'Feature', state: 'Active', assignedTo: 'Rita Gomez', iterationPath: 'Project\\PI 26.4', parentId: epicId })
const epic = (id, title) => ({ key: `example/project/${id}`, id, title, workItemType: 'Epic', state: 'Active', assignedTo: '', iterationPath: 'Project' })
const tools = epic(100, 'Tools'), audits = epic(110, 'Audits'), plans = epic(120, 'Plans')
const rows = [
  { item: feature(201, 'Lab rig upgrade', 100), epic: tools },
  { item: feature(202, 'Supplier audit pack', 110), epic: audits },
  { item: feature(203, 'Fixture library', 100), epic: tools },
  { item: feature(204, 'Calibration plan', 110), epic: audits },
  { item: feature(205, 'Not reviewed yet', 110), epic: audits },
  { item: feature(206, 'Capacity plan', 120), epic: plans },
  { item: feature(207, 'Without Epic') },
]
const review = (mode) => `Feature Review for PI 26.4\nLearnings of PI 26.4:\n- book the rig early\nStruggles of PI 26.4:\n- vendor late\nWhether the feature needs to be shifted to PI 27.1 : No\nAdvise to discuss the Feature during the Review meeting: ${mode}`
const done = (text) => ({ state: 'done', comments: [{ id: 1, date: '2026-10-02T09:00:00Z', text, author: 'Rita Gomez' }], capped: false, readAt: '2026-11-26T10:00:00Z' })
const discussions = {
  'example/project/201': done(review('Discuss during Meeting')), 'example/project/202': done(review('Offline Review')),
  'example/project/203': done(review('Offline Review')), 'example/project/204': done(review('Discuss during Meeting')),
  'example/project/205': done('Not a review'), 'example/project/206': done(review('Offline Review')),
}
const start = '2026-09-21'
const features = meetingFeatures(rows, (key) => discussions[key], builtInFormSetup(), start, 'PI 26.4')
const pls = { name: 'Platform Services', short: 'PLS', epics: [110] }, qtl = { name: 'Quality Tools', short: 'QTL', epics: [100] }
const meetingOf = (settings = {}) => ({ pi: 'PI 26.4', builtAt: '27 Nov 2026, 10:00 CET', builtBy: 'Rita Gomez', start, features, settings: { ...defaultMeetingSettings(), ...settings } })
const kinds = (slides) => slides.map((slide) => `${slide.kind}: ${slide.title}`)

test('PIR-86, PIR-88: a Feature belongs to the team of its Epic — the sections in the teams’ order, Other Features last and only if any (TC-PIR-87)', () => {
  const sections = teamSections(meetingOf({ teams: [pls, qtl] }))
  assert.deepEqual(sections.map((section) => [section.team?.name ?? 'Other Features', section.features.map((entry) => entry.id)]), [
    ['Platform Services', [202, 204, 205]], ['Quality Tools', [201, 203]], ['Other Features', [206, 207]],
  ])
  // Another order: the sections follow it.
  assert.deepEqual(teamSections(meetingOf({ teams: [qtl, pls] })).map((section) => section.team?.short ?? '—'), ['QTL', 'PLS', '—'])
  // Every Feature in a team: no Other Features section.
  assert.deepEqual(teamSections(meetingOf({ teams: [qtl, { ...pls, epics: [110, 120] }] })).map((section) => section.team?.short ?? '—'), ['QTL', 'PLS', '—'], '207 has no Epic')
  assert.deepEqual(teamSections({ ...meetingOf({ teams: [qtl, { ...pls, epics: [110, 120] }] }), features: features.filter((entry) => entry.id !== 207) }).map((section) => section.team?.short ?? '—'), ['QTL', 'PLS'])
  // A team whose Epics have no Feature in the PI still has its (empty) section.
  assert.deepEqual(teamSections(meetingOf({ teams: [{ name: 'Lab Systems', short: '', epics: [999] }] })).map((section) => section.features.length), [0, 7])
  // No teams: no sections.
  assert.deepEqual(teamSections(meetingOf()), [])

  // The slides: the executive slides stay before the sections; each section a divider, its Discuss during Meeting and its
  // reviewed Features (the PI-wide slide functions given the team's Features); one Features not reviewed list after them.
  const slides = meetingSlides(meetingOf({ teams: [pls, qtl] }))
  const shown = kinds(slides).filter((line) => /^(title|agenda|summary|team|discuss|reviewed|not-reviewed|learnings|struggles)/.test(line))
  assert.deepEqual(shown, [
    'title: PI Review Meeting — PI 26.4', 'agenda: Agenda', 'summary: Summary', 'summary-epics: Summary by Epic',
    'team: Platform Services', 'discuss: #204 Calibration plan', 'reviewed: #202 Supplier audit pack',
    'team: Quality Tools', 'discuss: #201 Lab rig upgrade', 'reviewed: #203 Fixture library',
    'team: Other Features', 'reviewed: #206 Capacity plan',
    'not-reviewed: Features not reviewed', 'learnings: Learnings', 'struggles: Struggles',
  ])
  const at = (title) => slides.findIndex((slide) => slide.title === title)
  assert.ok(at('Long-running Features') < at('Platform Services'), 'the executive slides come before the team sections')
  // The eyebrows name the team; the place counts within the team.
  assert.equal(slides[at('#204 Calibration plan')].eyebrow, 'PLS · DISCUSS DURING MEETING · 1 OF 1')
  assert.equal(slides[at('#202 Supplier audit pack')].eyebrow, 'PLS · REVIEWED · AUDITS · 1 OF 1')
  assert.equal(slides[at('#206 Capacity plan')].eyebrow, 'OTHER FEATURES · REVIEWED · PLANS · 1 OF 1')
  // The divider: the team's name and short name, the number of its Features in the PI, its Epics.
  const divider = slides[at('Platform Services')]
  assert.equal(divider.eyebrow, 'PRESENTING TEAM · 1 OF 2')
  const body = plain(divider.body)
  assert.match(body, /<p class="big">PLS<\/p>/)
  assert.match(body, /<dt>Features in the PI<\/dt><dd><strong>3<\/strong>/)
  assert.match(body, /<dt>Reviewed<\/dt><dd><strong>2<\/strong><small>1 not reviewed — in “Features not reviewed”<\/small>/)
  assert.match(body, /<dt>Discuss during Meeting<\/dt><dd><strong>1<\/strong>/)
  assert.match(body, /Epics: Audits \(#110\)/)
  assert.equal(slides[at('Other Features')].eyebrow, 'OTHER FEATURES')
  assert.match(plain(slides[at('Other Features')].body), /<dt>Features in the PI<\/dt><dd><strong>2<\/strong>/)
  // The not reviewed list still names every Feature not reviewed of the PI (205 of Platform Services, 207 of none).
  assert.match(plain(slides[at('Features not reviewed')].body), /205[\s\S]*207/)
})

test('PIR-87: the Agenda slide — the sentence with its placeholders, then the teams in order as "Name (SHORT)" (TC-PIR-88)', async () => {
  assert.equal(defaultAgenda, 'The following teams will present the Features they have been working on during PI {PI}')
  assert.equal(teamLabel(pls), 'Platform Services (PLS)')
  assert.equal(teamLabel({ name: 'Lab Systems', short: '' }), 'Lab Systems')
  const lab = { name: 'Lab Systems', short: '', epics: [120] }
  const agenda = meetingSlides(meetingOf({ teams: [qtl, lab, pls] })).find((slide) => slide.kind === 'agenda')
  assert.equal(agenda.eyebrow, 'AGENDA')
  assert.match(plain(agenda.body), /<p class="big">The following teams will present the Features they have been working on during PI 26\.4<\/p>/)
  assert.deepEqual([...plain(agenda.body).matchAll(/<li>([^<]*)<\/li>/g)].map((found) => found[1]), ['Quality Tools (QTL)', 'Lab Systems', 'Platform Services (PLS)'])
  // Every placeholder; the text escaped in the file.
  const custom = meetingSlides(meetingOf({ teams: [pls], agenda: '{team} — PI {PI} · {date} {time} by {builtBy}', team: 'Quality' })).find((slide) => slide.kind === 'agenda')
  assert.match(plain(custom.body), /<p class="big">Quality — PI 26\.4 · 27 Nov 2026 10:00 CET by Rita Gomez<\/p>/)
  const hostile = await buildMeetingHtml(meetingOf({ teams: [{ name: '<img src=x onerror=alert(1)>', short: 'X&Y', epics: [110] }], agenda: '<b>PI {PI}</b>' }))
  assert.ok(hostile.includes('&lt;b&gt;PI 26.4&lt;/b&gt;'))
  assert.ok(hostile.includes('&lt;img src=x onerror=alert(1)&gt; (X&amp;Y)'))
  assert.doesNotMatch(hostile, /<img|<b>/)
  // An empty sentence: only the list. Unknown placeholders are refused in the setting.
  assert.doesNotMatch(meetingSlides(meetingOf({ teams: [pls], agenda: '' })).find((slide) => slide.kind === 'agenda').body, /class="big/)
  assert.match(meetingSettingsProblems({ ...defaultMeetingSettings(), agenda: 'During {sprint}' }).join(' '), /Agenda sentence: \{sprint\} is not a placeholder/)
  // Many teams run on to a second slide, each within the 16:9 slide.
  const many = Array.from({ length: 20 }, (_, index) => ({ name: `Team ${index + 1} with a rather long name to fill the line`, short: `T${index + 1}`, epics: [1000 + index] }))
  const pages = meetingSlides(meetingOf({ teams: many })).filter((slide) => slide.kind === 'agenda')
  assert.ok(pages.length >= 2)
  assert.match(pages[0].title, /^Agenda \(1 of \d+\)$/)
})

test('PIR-86, PIR-90: the setting — written with the PI form setup (schema 2), read tolerantly: a malformed team is left out with a note, never refused (TC-PIR-89)', () => {
  const defaults = defaultMeetingSettings()
  assert.deepEqual(defaults.teams, [])
  // Written in order, "short" only when set; the default Agenda sentence not written.
  const saved = serializePiFormSetup({ ...builtInFormSetup(), meeting: { ...defaults, teams: [pls, { name: 'Lab Systems', short: '', epics: [120, 130] }] } })
  assert.match(saved, /"schema": 2/)
  assert.deepEqual(JSON.parse(saved).meeting, { teams: [{ name: 'Platform Services', short: 'PLS', epics: [110] }, { name: 'Lab Systems', epics: [120, 130] }] })
  assert.deepEqual(parsePiFormSetup(saved).meeting.teams, [pls, { name: 'Lab Systems', short: '', epics: [120, 130] }])
  assert.equal(parsePiFormSetup(saved).meeting.teamNotes, undefined)
  assert.deepEqual(serializeMeetingSettings({ ...defaults, agenda: 'Teams of PI {PI}' }), { agenda: 'Teams of PI {PI}' })
  // Without teams nothing is written: a file of the defaults stays schema 1.
  assert.match(serializePiFormSetup({ ...builtInFormSetup(), meeting: defaults }), /"schema": 1/)
  // Malformed entries are left out, each with why; the good ones stay in their order.
  const { teams, notes } = readPresentingTeams([
    pls, 'Quality Tools', { short: 'X', epics: [1] }, { name: 'Bad short', short: 5, epics: [1] }, { name: 'No Epics list' },
    { name: 'Empty', epics: [] }, { name: 'Text Epic', epics: ['100'] }, { name: 'Takes 110', epics: [110] }, { name: 'platform services', epics: [130] },
    { name: 'Twice', epics: [140, 140] }, { name: 'Brackets', short: '(B)', epics: [150] }, qtl,
  ])
  assert.deepEqual(teams, [pls, qtl])
  assert.deepEqual(notes, [
    'Presenting team 2: not a team — left out.', 'Presenting team 3: no name — left out.', 'Presenting team 4 (Bad short): the short name is not a text — left out.',
    'Presenting team 5 (No Epics list): no list of Epics — left out.', 'Presenting team 6: Empty: choose at least one Epic — left out.',
    'Presenting team 7: Text Epic: “NaN” is not an Epic ID — left out.', 'Presenting team 8: Takes 110: Epic #110 already belongs to another team (an Epic belongs to one team only) — left out.',
    'Presenting team 9: Team name “platform services” is used twice — left out.', 'Presenting team 10: Twice: an Epic is listed twice — left out.',
    'Presenting team 11: Brackets: the short name is one line of at most 12 characters, without { } ( ) — left out.',
  ])
  assert.deepEqual(readPresentingTeams({ name: 'Not a list' }), { teams: [], notes: ['Presenting teams: not a list — left out.'] })
  assert.equal(readPresentingTeams(Array.from({ length: 21 }, (_, index) => ({ name: `T${index}`, epics: [index + 1] }))).teams.length, 20)
  // Through the file: it loads (never refused), the note is set and shown, and the next save writes only the good teams.
  const broken = JSON.stringify({ schema: 2, kind: builtInFormSetup().kind, fields: builtInFormSetup().fields, meeting: { teams: [pls, { name: 'Takes 110', epics: [110] }, null], agenda: 'Bad {x}' } })
  const loaded = parsePiFormSetup(broken).meeting
  assert.deepEqual(loaded.teams, [pls])
  assert.equal(loaded.agenda, defaultAgenda)
  assert.equal(loaded.teamNotes.length, 3)
  assert.match(loaded.teamNotes[2], /^The Agenda sentence: Agenda sentence: \{x\} is not a placeholder .* — the default is used\.$/)
  assert.match(teamNotesNote(loaded.teamNotes), /^Not all of the presenting teams saved in Git can be used — the meeting leaves out: Presenting team 2: .* Save the presenting teams to write only the ones shown\.$/)
  assert.deepEqual(parseMeetingSettings({ teams: 'x', agenda: 7 }).teamNotes, ['Presenting teams: not a list — left out.', 'The Agenda sentence is not a text — the default is used.'])
  const resaved = serializePiFormSetup({ ...builtInFormSetup(), meeting: { ...loaded, teamNotes: undefined } })
  assert.deepEqual(JSON.parse(resaved).meeting, { teams: [{ name: 'Platform Services', short: 'PLS', epics: [110] }] })
  // Clearing the notes is a change of its own; two settings differ by it.
  assert.deepEqual(meetingSettingsChanges(loaded, { ...loaded, teamNotes: undefined }), ['presenting teams'])
  assert.equal(sameMeetingSettings(loaded, { ...loaded, teamNotes: undefined }), false)
  assert.deepEqual(meetingSettingsChanges(defaults, { ...defaults, teams: [pls] }), ['presenting teams'])
  // The editor's checks: one team (with the Epics and names of the others) and the whole list.
  assert.equal(teamProblem(pls), '')
  assert.equal(teamProblem({ ...pls, name: ' ' }), 'Team name: enter a name.')
  assert.match(teamProblem(qtl, new Set([100])), /Epic #100 already belongs to another team/)
  assert.match(teamProblem(qtl, new Set(), new Set(['quality tools'])), /is used twice/)
  assert.deepEqual(presentingTeamsProblems([pls, { ...qtl, epics: [110] }]), ['Quality Tools: Epic #110 already belongs to another team (an Epic belongs to one team only).'])
  assert.throws(() => parseMeetingSettings({ teams: [pls], accent: 'red' }), /Accent colour/, 'the other settings stay strict')
})

test('PIR-86, PIR-88: without presenting teams the deck is exactly as before — the same slides, no Agenda, no sections (TC-PIR-91)', async () => {
  const before = meetingSlides(meetingOf())
  assert.equal(before.some((slide) => slide.kind === 'agenda' || slide.kind === 'team'), false)
  // The settings of a file without teams, and an older file (no `teams`, no `agenda`), build the same slides.
  const older = parseMeetingSettings({ accent: '#1b5e20' })
  assert.deepEqual(older.teams, [])
  assert.deepEqual(meetingSlides({ ...meetingOf(), settings: older }).map((slide) => [slide.kind, slide.eyebrow, slide.title, slide.body]), meetingSlides({ ...meetingOf(), settings: { ...older, agenda: 'Changed {PI}' } }).map((slide) => [slide.kind, slide.eyebrow, slide.title, slide.body]))
  assert.deepEqual(kinds(before).filter((line) => /^(discuss|reviewed)/.test(line)), ['discuss: #201 Lab rig upgrade', 'discuss: #204 Calibration plan', 'reviewed: #203 Fixture library', 'reviewed: #202 Supplier audit pack', 'reviewed: #206 Capacity plan'])
  // No settings at all (an old caller): the same as the defaults.
  const bare = { ...meetingOf() }
  delete bare.settings
  assert.deepEqual(meetingSlides(bare), before)
  // With teams: the same slides plus the Agenda and the dividers, every Feature slide once (nothing lost, nothing twice).
  const withTeams = meetingSlides(meetingOf({ teams: [pls, qtl] }))
  const featureSlides = (slides) => slides.filter((slide) => slide.kind === 'discuss' || slide.kind === 'reviewed').map((slide) => slide.title).sort()
  assert.deepEqual(featureSlides(withTeams), featureSlides(before))
  assert.equal(withTeams.length, before.length + 1 + 3)
  assert.equal((await buildMeetingHtml(meetingOf())).includes('slide-agenda'), false)
})
