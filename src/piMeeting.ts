// PIR-40…PIR-47 The PI Review Meeting presentation: "Conduct PI Meeting" on PI Review builds ONE self-contained, offline
// HTML file of slides for the chosen PI — a frozen snapshot of the reviews (the latest review of each Feature's
// Discussion for the PI — PIR-49: the newest comment headed "Feature Review for <the PI>" — on or after "PI Review starts
// from", PIR-33) at the moment it is built. Pure: the Features, their
// Discussions, the form setup, the start date, who built it and when are passed in; nothing here touches the DOM, Git or
// the network.
//
// Safe content (PIR-43): every value goes through `text()` — e-mail addresses and identity ids are taken out and the
// rest HTML-escaped — so comment text from Azure DevOps can never become markup or script. The file holds display
// names only (no e-mails, identity ids or PATs: the builder is never given a connection or a token). Its
// Content-Security-Policy is the one of the interactive HTML file (OND-94, `publishCsp`): only its own script and its
// own styles, by their SHA-256 hashes, and no request of any kind.
//
// Easy to change (PIR-41): each slide type is one small function (`slideMakers`) and the order is one list
// (`slideOrder`), so the product owner's later wishes change slides and order cheaply.
import { inlineScript, inlineStyle, publishCsp, sha256Base64 } from './standaloneHtml.ts'
import { commentsFrom, isNoneText, latestReviewFor, moveLabel, reviewModeLabel, reviewSplit, type Discussion, type MoveValue, type ReviewMode, type SplitFrom } from './piReview.ts'
import { customFields, type PiFormSetup } from './piReviewSetup.ts'
import { piText } from './piReviewPost.ts'
import { piName } from './myWork.ts'
import { formatDate, formatDateTime } from './format.ts'
import { shownDateOf } from './azureDevOps.ts'
import type { AzureWorkItem } from './domain'
import { displayName, lines, plural, text } from './piMeetingText.ts'
import { cellOf, clampClass, columnGap, columns, columnWidth, contentWidth, fixed, flowSlides, gap, headLine, maxClamp, padBottom, padTop, padX, paragraph, pointList, pointsOf, rowLine, section, sectionOf, slideHeight, slideWidth, table, tileHeight, tiles, titleAttr, titleCut, titleFont, titleLineHeight, titleLines, widthStyle, wrapLines, type Block } from './piMeetingLayout.ts'
import { epicRank, ownerOfEpic, showsOwners } from './piMeetingData.ts'
import { isAdhocTask } from './workItemEdit.ts'
import { defaultMeetingSettings, fillPlaceholders, teamLabel, type MeetingSettings, type PresentingTeam } from './piMeetingSettings.ts'
import { accentOf, completionSlides, execStyle, executiveSlides, hoursSlides, longRunningSlides, piTrendSlides, releaseSlides, repeatSlides, topicSlides, trendSlides, utilizationSlides } from './piMeetingExec.ts'
import type { MeetingExec } from './piMeetingData.ts'
export { displayName, scrub, text } from './piMeetingText.ts'
export { isMeetingPath, maxMeetingBytes, meetingBuiltOf, meetingBytes, meetingFileName, meetingFolder, meetingPath, meetingsFolder, meetingStamp, piSlug } from './piMeetingFile.ts'

// ---- the snapshot ----
// PIR-42: a Feature as the meeting shows it. status — reviewed: its Discussion was read and has a review for the PI
// (PIR-49: a comment headed "Feature Review for <the PI>") on or after the start date (the latest one is the review);
// none: read, no such comment (a comment without the heading is no review, PIR-50); unread: not read (e.g. sample data, no
// PAT); error: the read failed (error says why).
export type MeetingStatus = 'reviewed' | 'none' | 'unread' | 'error'
export interface MeetingReview {
  author: string; date: string; from: SplitFrom; learnings: string; struggles: string; move: string; moveValue?: MoveValue; movePi: string
  mode: string; reviewMode?: ReviewMode; remarks: string; fields: { label: string; text: string }[]; text: string
}
// PIR-51: closedDate, createdDate and adhoc (tagged ad-hoc) for the executive slides.
export interface MeetingFeature { id: number; title: string; epic: string; epicId?: number; assignedTo: string; state: string; closedDate?: string; createdDate?: string; adhoc?: boolean; status: MeetingStatus; error?: string; review?: MeetingReview }
// pi: "PI 26.4"; builtAt: the build's date and time as shown (the builder's clock and time zone); builtBy: a display name;
// start: "PI Review starts from" (YYYY-MM-DD).
// PIR-51…PIR-62: exec — the executive figures worked out at build time (piMeetingData.ts); settings — the Meeting
// presentation settings (title slide, footer, colours, Epic order; the defaults without them); team — {team} when the
// settings name no team.
// PIR-68: owners — the display name of each Epic's Product Owner (Setup per Epic, EPS-11) by Epic ID, never an email;
// streamOwners — per release stream, the Product Owners of its Epics. Without them (none set) no Product Owner column.
export interface Meeting { pi: string; builtAt: string; builtBy: string; start: string; features: MeetingFeature[]; exec?: MeetingExec; settings?: MeetingSettings; team?: string; owners?: Record<string, string>; streamOwners?: Record<string, string> }


export const meetingName = 'PI Review Meeting'
export const meetingPi = (path: string) => piText(piName(path)) || piName(path).trim() || 'PI'
export const meetingTitle = (pi: string) => `${meetingName} — ${pi}`

// PIR-42: the Features of the PI with their review, taken from the Discussions read (only the comments on or after the
// start date count — applied here again, whatever the Discussion was read with). PIR-49: pi — the PI of the meeting
// ("PI 26.4"); only a review headed for it counts.
export function meetingFeatures(rows: readonly { item: AzureWorkItem; epic?: AzureWorkItem }[], discussionOf: (key: string) => Discussion | undefined, setup: PiFormSetup, start: string, pi: string): MeetingFeature[] {
  return rows.map(({ item, epic }) => {
    const base = { id: item.id, title: item.title, epic: epic ? epic.title || `#${epic.id}` : '', ...(epic ? { epicId: epic.id } : {}), assignedTo: item.assignedTo, state: item.state, ...(item.closedDate ? { closedDate: item.closedDate } : {}), ...(item.createdDate ? { createdDate: item.createdDate } : {}), ...(isAdhocTask(item.tags ?? '') ? { adhoc: true } : {}) }
    const entry = discussionOf(item.key)
    if (entry?.state === 'error') return { ...base, status: 'error', error: entry.error }
    if (entry?.state !== 'done') return { ...base, status: 'unread' }
    const comment = latestReviewFor(commentsFrom(entry.comments, start).comments, pi)
    if (!comment) return { ...base, status: 'none' }
    const split = reviewSplit(comment.text, setup)
    const review: MeetingReview = {
      author: comment.author, date: formatDateTime(shownDateOf(comment)), from: split.from,
      learnings: split.learnings ?? '', struggles: split.struggles ?? '', move: moveLabel(split), ...(split.moveValue ? { moveValue: split.moveValue } : {}), movePi: split.movePi ?? '',
      mode: reviewModeLabel(split), ...(split.reviewMode ? { reviewMode: split.reviewMode } : {}), remarks: split.remarks ?? '',
      fields: customFields(setup).map((field) => ({ label: field.label, text: split.extra?.[field.id] ?? '' })).filter((field) => field.text), text: comment.text,
    }
    return { ...base, status: 'reviewed', review }
  })
}

// ---- the slides ----
export type SlideKind = 'title' | 'agenda' | 'summary' | 'summary-epics' | 'executive' | 'completion' | 'pi-trend' | 'repeat' | 'topics' | 'releases' | 'hours' | 'utilization' | 'trends' | 'long-running' | 'team' | 'discuss' | 'reviewed' | 'not-reviewed' | 'learnings' | 'struggles'
export interface Slide { kind: SlideKind; eyebrow: string; title: string; body: string }
// PIR-41: the order of the slides — one list (product owner, 25 Nov 2026: Summary first, then the Features to discuss in
// the meeting, then all other Features, then the Themes). PIR-51…PIR-57 (product owner, 26 Nov 2026): the executive slides
// after the Summary and before Discuss during Meeting. PIR-86…PIR-89 (product owner, 27 Nov 2026): with presenting teams,
// the Agenda after the Title, and the team sections ('team': each team's divider, then its Discuss during Meeting and
// reviewed Features; then Other Features) after the executive slides, in place of the PI-wide Discuss and reviewed
// slides. Without teams both are empty: the deck as before.
export const slideOrder: readonly SlideKind[] = ['title', 'agenda', 'summary', 'summary-epics', 'executive', 'completion', 'pi-trend', 'repeat', 'topics', 'releases', 'hours', 'utilization', 'trends', 'long-running', 'team', 'discuss', 'reviewed', 'not-reviewed', 'learnings', 'struggles']
const isDiscuss = (feature: MeetingFeature) => feature.review?.reviewMode === 'Discuss during Meeting'
const reviewed = (meeting: Meeting) => meeting.features.filter((feature) => feature.status === 'reviewed')
const notReviewed = (meeting: Meeting) => meeting.features.filter((feature) => feature.status !== 'reviewed')
const noEpic = 'No Epic'
const epicName = (feature: MeetingFeature) => feature.epic || noEpic
// PIR-62: by Epic in the chosen order (Epic ID ascending by default, or most Features first; "No Epic" last), then by ID.
const epicOrderOf = (meeting: Meeting) => { const rank = epicRank(meeting.features, (meeting.settings ?? defaultMeetingSettings()).epicOrder); return (a: MeetingFeature, b: MeetingFeature) => rank(a) - rank(b) || a.id - b.id }

interface Counts { features: number; reviewed: number; none: number; unread: number; yes: number; no: number; partly: number; noMove: number; discuss: number; offline: number; noMode: number; nextPis: Map<string, number> }
export function meetingCounts(features: readonly MeetingFeature[]): Counts {
  const counts: Counts = { features: features.length, reviewed: 0, none: 0, unread: 0, yes: 0, no: 0, partly: 0, noMove: 0, discuss: 0, offline: 0, noMode: 0, nextPis: new Map() }
  for (const feature of features) {
    const review = feature.review
    if (feature.status !== 'reviewed' || !review) { if (feature.status === 'none') counts.none += 1; else counts.unread += 1; continue }
    counts.reviewed += 1
    if (review.moveValue === 'Yes') { counts.yes += 1; const next = review.movePi || 'the next PI (not named)'; counts.nextPis.set(next, (counts.nextPis.get(next) ?? 0) + 1) } else if (review.moveValue === 'No') counts.no += 1; else if (review.moveValue === 'Partly') counts.partly += 1; else counts.noMove += 1
    if (review.reviewMode === 'Discuss during Meeting') counts.discuss += 1; else if (review.reviewMode === 'Offline Review') counts.offline += 1; else counts.noMode += 1
  }
  return counts
}

// PIR-58: the values of the placeholders {PI} {date} {time} {builtBy} {team} — the date and time as built (builtAt is
// "26 Nov 2026, 14:30 CET"), the builder's display name, the team of the settings (else the meeting's).
export function meetingValues(meeting: Meeting) {
  const at = meeting.builtAt.indexOf(', ')
  return { pi: meeting.pi, date: at < 0 ? meeting.builtAt : meeting.builtAt.slice(0, at), time: at < 0 ? '' : meeting.builtAt.slice(at + 2), builtBy: displayName(meeting.builtBy), team: (meeting.settings?.team || meeting.team || '').trim() }
}
const settingsOf = (meeting: Meeting) => meeting.settings ?? defaultMeetingSettings()
// PIR-58: the title slide from the template — Title and Subtitle with the placeholders filled (then escaped).
export const meetingSlideTitle = (meeting: Meeting) => fillPlaceholders(settingsOf(meeting).title, meetingValues(meeting)) || meetingTitle(meeting.pi)
export const meetingFooter = (meeting: Meeting) => fillPlaceholders(settingsOf(meeting).footer, meetingValues(meeting))
// PIR-64: the title slide fits its canvas — the title at most 3 lines, the subtitle 2, each paragraph clamped (the full
// text in a title).
const titleSlide = (meeting: Meeting): Slide[] => {
  const unread = meeting.features.filter((feature) => feature.status === 'unread' || feature.status === 'error').length
  const subtitle = fillPlaceholders(settingsOf(meeting).subtitle, meetingValues(meeting))
  const clamped = (className: string, value: string, max: number, font: number) => { const need = wrapLines(value, contentWidth, font), shown = Math.min(max, need); return `<p class="${className}${className ? ' ' : ''}${clampClass(shown)}"${titleAttr(value, need > shown)}>${text(value)}</p>` }
  return [{ kind: 'title', eyebrow: 'PI REVIEW', title: meetingSlideTitle(meeting), body: `${subtitle ? clamped('lead subtitle', subtitle, 2, 20) : ''}
${clamped('', `A snapshot of the PI reviews at that moment: it does not update. Only the comments headed “Feature Review for ${meeting.pi}” and written on or after ${formatDate(meeting.start)} (when PI Review starts) count.`, 3, 15)}${unread ? clamped('warning', `${plural(unread, 'Discussion was', 'Discussions were')} not read when it was built: ${unread === 1 ? 'that Feature is' : 'those Features are'} listed as not reviewed.`, 2, 15) : ''}
${clamped('muted', 'Keys: → or Space next, ← back, Home first, End last, O the slide overview. Print: one 16:9 slide a page.', 2, 15)}` }]
}
const summarySlide = (meeting: Meeting): Slide[] => {
  const counts = meetingCounts(meeting.features)
  const next = [...counts.nextPis].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([pi, count]) => `${count} to ${pi}`).join(', ')
  return flowSlides('summary', 'SUMMARY', 'Summary', [tiles([
    { label: 'Features in the PI', value: String(counts.features) },
    { label: 'Reviewed', value: String(counts.reviewed), detail: `${counts.none + counts.unread} not reviewed${counts.unread ? ` (${counts.unread} Discussion${counts.unread === 1 ? '' : 's'} not read)` : ''}` },
    { label: 'Move to next PI: Yes', value: String(counts.yes), detail: next || 'none moves' },
    { label: 'Move to next PI: No', value: String(counts.no), detail: `${counts.partly ? `${counts.partly} partly` : ''}${counts.partly && counts.noMove ? ', ' : ''}${counts.noMove ? `${counts.noMove} not given` : ''}` },
    { label: 'Discuss during Meeting', value: String(counts.discuss), detail: 'one slide each, next' },
    { label: 'Offline Review', value: String(counts.offline), detail: counts.noMode ? `${counts.noMode} not given` : '' },
  ]), ...(counts.reviewed ? [] : [paragraph('muted', `No Feature has a review on or after ${formatDate(meeting.start)}.`)])])
}
const epicSlides = (meeting: Meeting): Slide[] => {
  const groups = new Map<string, MeetingFeature[]>()
  for (const feature of [...meeting.features].sort(epicOrderOf(meeting))) groups.set(epicName(feature), [...(groups.get(epicName(feature)) ?? []), feature])
  if (groups.size < 2) return []
  const rows = [...groups].map(([epic, features]) => ({ epic, owner: ownerOfEpic(meeting, features[0].epicId), counts: meetingCounts(features) }))
  // PIR-68: with Product Owners set, their column after the Epic (the widths still add up to the slide's).
  const po = showsOwners(meeting)
  const heads = [{ label: 'Epic', width: po ? 22 : 30 }, ...(po ? [{ label: 'Product Owner', width: 15 }] : []), ...['Features', 'Reviewed', 'Not reviewed', 'Move: Yes', 'Move: No', 'Discuss', 'Offline'].map((label) => ({ label, width: po ? 9 : 10, num: true }))]
  return flowSlides('summary-epics', 'SUMMARY', 'Summary by Epic', [table({ label: 'Summary by Epic', columns: heads, rows: rows.map(({ epic, owner, counts }) => [cellOf(epic), ...(po ? [cellOf(owner || '—')] : []), ...[counts.features, counts.reviewed, counts.none + counts.unread, counts.yes, counts.no, counts.discuss, counts.offline].map((value) => cellOf(value))]) })])
}
// PIR-44: one Feature's review — ID, Title, Epic, Assigned to, State; Learnings and Struggles; Move to next PI with the
// reason; the Review meeting advice, Additional Remarks and the fields added in PI Review Setup; when and by whom.
// PIR-65: as blocks — a long review runs on to "(n of N)" slides, Learnings and Struggles side by side on each.
const factWidth = (count: number) => (contentWidth - 32 * (count - 1)) / count
function facts(list: { label: string; value: string }[], className: string, max: number): Block {
  const width = factWidth(list.length)
  let most = 1
  const html = list.map(({ label, value }) => { const shown = value || '—', need = wrapLines(shown, width, 15), use = Math.min(max, need); most = Math.max(most, use); return `<div><dt>${text(label)}</dt><dd class="${clampClass(use)}"${titleAttr(shown, need > use)}>${text(shown)}</dd></div>` }).join('')
  return fixed(`<dl class="${className}">${html}</dl>`, 16 + 20 * most)
}
function featureBlocks(feature: MeetingFeature, owner = ''): Block[] {
  const review = feature.review!
  const suggested = review.from === 'Keywords'
  const full = (label: string, value: string) => section(sectionOf(label, lines(value), contentWidth))
  return [
    facts([{ label: 'Epic', value: feature.epic || noEpic }, ...(owner ? [{ label: 'Product Owner', value: owner }] : []), { label: 'Assigned to', value: displayName(feature.assignedTo || 'Unassigned') }, { label: 'State', value: feature.state }], 'facts', 1),
    ...(suggested ? [paragraph('muted', 'Suggested from keywords: the comment has no headings.')] : []),
    ...(review.from === 'None' ? [full('Comment', review.text)] : [
      columns(sectionOf('Learnings', lines(review.learnings), columnWidth), sectionOf('Struggles', lines(review.struggles), columnWidth), suggested ? 'suggested' : ''),
      facts([{ label: 'Move to next PI', value: review.move }, { label: 'Review meeting', value: review.mode }], 'facts wide', 2),
      ...(review.remarks ? [full('Additional Remarks', review.remarks)] : []),
      ...review.fields.map((field) => full(field.label, field.text)),
    ]),
    paragraph('byline', `Review by ${displayName(review.author)}, ${review.date}`, { font: 14, lineHeight: 20, max: 1 }),
  ]
}
const featureSlides = (kind: SlideKind, eyebrow: string, owner = '') => (feature: MeetingFeature): Slide[] => flowSlides(kind, eyebrow, `#${feature.id} ${feature.title}`, featureBlocks(feature, owner))
const discussOf = (meeting: Meeting): Slide[] => {
  const features = reviewed(meeting).filter(isDiscuss).sort(epicOrderOf(meeting))
  return features.flatMap((feature, at) => featureSlides('discuss', `DISCUSS DURING MEETING · ${at + 1} OF ${features.length}`, ownerOfEpic(meeting, feature.epicId))(feature))
}
const reviewedOf = (meeting: Meeting): Slide[] => {
  const features = reviewed(meeting).filter((feature) => !isDiscuss(feature)).sort(epicOrderOf(meeting))
  const perEpic = new Map<string, number>()
  for (const feature of features) perEpic.set(epicName(feature), (perEpic.get(epicName(feature)) ?? 0) + 1)
  const seen = new Map<string, number>()
  // PIR-68: the Epic heading (the eyebrow) names the Epic's Product Owner too.
  return features.flatMap((feature) => { const epic = epicName(feature), at = (seen.get(epic) ?? 0) + 1, owner = ownerOfEpic(meeting, feature.epicId); seen.set(epic, at); return featureSlides('reviewed', `REVIEWED · ${epic.toUpperCase()}${owner ? ` · PO ${owner.toUpperCase()}` : ''} · ${at} OF ${perEpic.get(epic)}`, owner)(feature) })
}
// ---- PIR-86…PIR-89: the presenting teams ----
// A team section: a presenting team (none: Other Features) and its Features of the PI.
export interface TeamSection { team?: PresentingTeam; features: MeetingFeature[] }
// PIR-86, PIR-88: the sections in the teams' order — a Feature belongs to the team of its Epic (an Epic is in one team
// only); the Features of no team's Epic (and those without an Epic) in a last "Other Features" section, only if any. No
// teams: no sections.
export function teamSections(meeting: Meeting): TeamSection[] {
  const teams = settingsOf(meeting).teams
  if (!teams.length) return []
  const teamOf = new Map<number, number>()
  teams.forEach((team, at) => { for (const epic of team.epics) if (!teamOf.has(epic)) teamOf.set(epic, at) })
  const sections: TeamSection[] = teams.map((team) => ({ team, features: [] })), other: MeetingFeature[] = []
  for (const feature of meeting.features) { const at = feature.epicId != null ? teamOf.get(feature.epicId) : undefined; if (at === undefined) other.push(feature); else sections[at].features.push(feature) }
  return other.length ? [...sections, { features: other }] : sections
}
// PIR-87: the Agenda slide — the sentence of the template (placeholders filled, then escaped) and the presenting teams as a
// bulleted list in their order, "Name (SHORT)" with a short name. Many teams run on to "Agenda (n of N)".
const agendaSlides = (meeting: Meeting): Slide[] => {
  const settings = settingsOf(meeting)
  if (!settings.teams.length) return []
  const sentence = fillPlaceholders(settings.agenda, meetingValues(meeting))
  return flowSlides('agenda', 'AGENDA', 'Agenda', [...(sentence ? [paragraph('big', sentence, { font: 20, lineHeight: 28, max: 3 })] : []), pointList(pointsOf(settings.teams.map((team) => ({ text: teamLabel(team) })), contentWidth - 28), 'agenda')])
}
// An Epic as the divider names it: its title from the PI's Features ("Tools (#100)"), else "Epic #100".
const epicLabel = (meeting: Meeting, id: number) => { const title = meeting.features.find((feature) => feature.epicId === id)?.epic; return title ? `${title} (#${id})` : `Epic #${id}` }
// PIR-88: a team's divider — its name, short name, the number of its Features in the PI (reviewed, to discuss, offline)
// and its Epics; then its Features with their reviews by the slide functions of the whole PI (Discuss during Meeting,
// then the reviewed Features by Epic) given only the team's Features, the eyebrow naming the team. Its Features not
// reviewed stay in the one "Features not reviewed" list (PIR-60 links to it).
function sectionSlides(meeting: Meeting, section: TeamSection, at: number, teams: number): Slide[] {
  const { team, features } = section, counts = meetingCounts(features)
  const notReviewed = counts.none + counts.unread
  const divider = flowSlides('team', team ? `PRESENTING TEAM · ${at + 1} OF ${teams}` : 'OTHER FEATURES', team ? team.name : 'Other Features', [
    ...(team?.short ? [paragraph('big', team.short, { font: 20, lineHeight: 28, max: 1 })] : []),
    tiles([
      { label: 'Features in the PI', value: String(counts.features) },
      { label: 'Reviewed', value: String(counts.reviewed), detail: notReviewed ? `${notReviewed} not reviewed — in “Features not reviewed”` : features.length ? 'every Feature' : '' },
      { label: 'Discuss during Meeting', value: String(counts.discuss), detail: counts.discuss ? 'one slide each, next' : '' },
      { label: 'Offline Review', value: String(counts.offline), detail: counts.noMode ? `${counts.noMode} not given` : '' },
    ]),
    team ? paragraph('muted', `Epics: ${team.epics.map((id) => epicLabel(meeting, id)).join(', ')}`, { max: 3 }) : paragraph('muted', 'The Features of the PI whose Epic belongs to no presenting team, and those without an Epic.'),
    ...(features.length ? [] : [paragraph('muted', 'No Feature of the PI is under these Epics.')]),
  ])
  const scoped: Meeting = { ...meeting, features }, prefix = (team ? team.short || team.name : 'Other Features').toUpperCase()
  return [...divider, ...[...discussOf(scoped), ...reviewedOf(scoped)].map((slide) => ({ ...slide, eyebrow: `${prefix} · ${slide.eyebrow}` }))]
}
const teamSlides = (meeting: Meeting): Slide[] => { const sections = teamSections(meeting), teams = settingsOf(meeting).teams.length; return sections.flatMap((section, at) => sectionSlides(meeting, section, at, teams)) }
const withoutTeams = (make: (meeting: Meeting) => Slide[]) => (meeting: Meeting): Slide[] => settingsOf(meeting).teams.length ? [] : make(meeting)
const why = (feature: MeetingFeature, start: string) => feature.status === 'none' ? `No review headed for this PI since ${formatDate(start)}` : feature.status === 'error' ? 'The Discussion could not be read' : 'The Discussion was not read'
const notReviewedSlides = (meeting: Meeting): Slide[] => {
  const features = notReviewed(meeting).sort(epicOrderOf(meeting)), po = showsOwners(meeting)
  if (!features.length) return [{ kind: 'not-reviewed', eyebrow: 'NOT REVIEWED', title: 'Features not reviewed', body: '<p>None: every Feature of the PI has a review.</p>' }]
  return flowSlides('not-reviewed', `NOT REVIEWED · ${plural(features.length, 'FEATURE')}`, 'Features not reviewed', [table({ label: 'Features not reviewed',
    columns: po ? [{ label: 'ID', width: 8, num: true }, { label: 'Title', width: 28 }, { label: 'Epic', width: 16 }, { label: 'Product Owner', width: 14 }, { label: 'Assigned to', width: 14 }, { label: 'Why', width: 20 }] : [{ label: 'ID', width: 8, num: true }, { label: 'Title', width: 34 }, { label: 'Epic', width: 20 }, { label: 'Assigned to', width: 16 }, { label: 'Why', width: 22 }],
    rows: features.map((feature) => [cellOf(feature.id), cellOf(feature.title), cellOf(epicName(feature)), ...(po ? [cellOf(ownerOfEpic(meeting, feature.epicId) || '—')] : []), cellOf(displayName(feature.assignedTo || 'Unassigned')), cellOf(why(feature, meeting.start))]) })])
}
// PIR-45: the Themes — every Learning, then every Struggle, each with its Feature ID; a "None" answer is left out.
export function themeItems(meeting: Meeting, which: 'learnings' | 'struggles'): { id: number; text: string; suggested: boolean }[] {
  return reviewed(meeting).sort((a, b) => a.id - b.id).flatMap((feature) => lines(feature.review![which]).filter((line) => !isNoneText(line)).map((line) => ({ id: feature.id, text: line, suggested: feature.review!.from === 'Keywords' })))
}
const themeSlides = (which: 'learnings' | 'struggles', label: string) => (meeting: Meeting): Slide[] => {
  const items = themeItems(meeting, which)
  if (!items.length) return [{ kind: which, eyebrow: 'THEMES', title: label, body: `<p class="muted">${text(`No ${label.toLowerCase()} were written.`)}</p>` }]
  // PIR-65: each point a row; a long point runs on (its next lines without the Feature ID), the list over "(n of N)".
  return flowSlides(which, `THEMES · ${plural(items.length, label.slice(0, -1).toUpperCase(), label.toUpperCase())}`, label, [pointList(pointsOf(items.map((item) => ({ text: item.text, prefix: `<span class="fid">#${item.id}</span>`, ...(item.suggested ? { suffix: '<small class="muted">(suggested)</small>', suffixText: '(suggested)' } : {}) })), contentWidth - 72))])
}
export const slideMakers: Record<SlideKind, (meeting: Meeting) => Slide[]> = {
  title: titleSlide, agenda: agendaSlides, summary: summarySlide, 'summary-epics': epicSlides,
  executive: executiveSlides, completion: completionSlides, 'pi-trend': piTrendSlides, repeat: repeatSlides, topics: topicSlides,
  releases: releaseSlides, hours: hoursSlides, utilization: utilizationSlides, trends: trendSlides, 'long-running': longRunningSlides,
  // PIR-88: with presenting teams, Discuss during Meeting and the reviewed Features are shown in the team sections.
  team: teamSlides, discuss: withoutTeams(discussOf), reviewed: withoutTeams(reviewedOf),
  'not-reviewed': notReviewedSlides, learnings: themeSlides('learnings', 'Learnings'), struggles: themeSlides('struggles', 'Struggles'),
}
export const meetingSlides = (meeting: Meeting): Slide[] => slideOrder.flatMap((kind) => slideMakers[kind](meeting))

// ---- the file ----
// PIR-46: the navigation — ← / →, Space, Page Up / Down, Home / End, O (or the button) for the slide overview, Escape
// closes it; printing shows every slide, one a page. Without JavaScript every slide shows, one after another.
// PIR-64: the slide is a 1280 × 720 canvas; the script only scales it to the window (--scale, letterboxed and centred,
// set through the CSS object model, which the file's policy allows) — nothing reflows when the window changes.
export const meetingScript = `(function () {
  var doc = document, root = doc.documentElement
  var slides = Array.prototype.slice.call(doc.querySelectorAll('.slide'))
  var overview = doc.getElementById('overview'), counter = doc.getElementById('counter')
  var prev = doc.getElementById('prev'), next = doc.getElementById('next'), toggle = doc.getElementById('toggle'), print = doc.getElementById('print')
  var at = 0
  function fit() { root.style.setProperty('--scale', String(Math.min(window.innerWidth / ${slideWidth}, window.innerHeight / ${slideHeight}))) }
  fit()
  window.addEventListener('resize', fit)
  root.classList.add('js')
  function show(index) {
    at = Math.max(0, Math.min(slides.length - 1, index))
    for (var i = 0; i < slides.length; i++) { slides[i].classList.toggle('current', i === at); if (i === at) slides[i].removeAttribute('aria-hidden'); else slides[i].setAttribute('aria-hidden', 'true') }
    counter.textContent = (at + 1) + ' / ' + slides.length
    prev.disabled = at === 0
    next.disabled = at === slides.length - 1
    try { history.replaceState(null, '', '#' + (at + 1)) } catch (error) { /* file: without history */ }
  }
  function open(on) {
    overview.hidden = !on
    toggle.setAttribute('aria-expanded', on ? 'true' : 'false')
    var items = overview.querySelectorAll('button[data-slide]')
    for (var k = 0; k < items.length; k++) { if (k === at) items[k].setAttribute('aria-current', 'true'); else items[k].removeAttribute('aria-current') }
    if (on && items[at]) items[at].focus()
    if (!on) toggle.focus()
  }
  prev.addEventListener('click', function () { show(at - 1) })
  next.addEventListener('click', function () { show(at + 1) })
  toggle.addEventListener('click', function () { open(overview.hidden) })
  print.addEventListener('click', function () { window.print() })
  overview.addEventListener('click', function (event) { var target = event.target.closest('button[data-slide]'); if (target) { show(Number(target.getAttribute('data-slide'))); open(false) } })
  // PIR-60: a number that opens another slide (the first slide of that kind).
  doc.addEventListener('click', function (event) {
    var go = event.target.closest && event.target.closest('button[data-goto]')
    if (go) { for (var j = 0; j < slides.length; j++) if (slides[j].classList.contains('slide-' + go.getAttribute('data-goto'))) { show(j); break } return }
    // PIR-62: a sortable table — its header buttons sort it (ascending, then descending), aria-sort on the header.
    var button = event.target.closest && event.target.closest('table.sortable th button.sort')
    if (!button) return
    var th = button.parentNode, table = th.closest('table'), body = table.tBodies[0], col = Number(button.getAttribute('data-col'))
    var order = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending'
    var heads = table.querySelectorAll('thead th')
    for (var h = 0; h < heads.length; h++) heads[h].setAttribute('aria-sort', 'none')
    th.setAttribute('aria-sort', order)
    var rows = Array.prototype.slice.call(body.rows)
    function key(row) { var cell = row.cells[col]; if (!cell) return ''; var value = cell.getAttribute('data-value'); if (value !== null && value !== '' && !isNaN(Number(value))) return Number(value); return value !== null ? value : cell.textContent.trim() }
    rows.sort(function (a, b) { var x = key(a), y = key(b), result = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }); return order === 'ascending' ? result : -result })
    for (var r = 0; r < rows.length; r++) body.appendChild(rows[r])
  })
  doc.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    var key = event.key, onButton = event.target && event.target.tagName === 'BUTTON'
    if (key === 'Escape' && !overview.hidden) { event.preventDefault(); open(false); return }
    if (key === 'o' || key === 'O') { event.preventDefault(); open(overview.hidden); return }
    if (!overview.hidden || (onButton && (key === ' ' || key === 'Enter'))) return
    if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') show(at + 1)
    else if (key === 'ArrowLeft' || key === 'PageUp') show(at - 1)
    else if (key === 'Home') show(0)
    else if (key === 'End') show(slides.length - 1)
    else return
    event.preventDefault()
  })
  var first = Number((location.hash || '').slice(1))
  show(first >= 1 ? first - 1 : 0)
})()
`
// PIR-64…PIR-67: the styles. Every size is fixed in px on the 1280 × 720 canvas (piMeetingLayout.ts counts with the same
// numbers); a clamped text (class "c lN") shows at most N lines of its line height (--lh). Print: one 16:9 page a slide,
// the colours kept.
export const meetingStyle = `*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html{color-scheme:light}
body{margin:0;font:15px/21px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;--lh:21px;color:#1b2430;background:#e9edf2}
.slide{position:relative;display:flex;flex-direction:column;width:${slideWidth}px;height:${slideHeight}px;margin:0 auto 16px;padding:${padTop}px ${padX}px ${padBottom}px;overflow:hidden;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.js body{overflow:hidden;background:#2f3640}
.js main{position:fixed;inset:0;overflow:hidden}
.js .slide{display:none;margin:0}
.js .slide.current{display:flex;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--scale,1));box-shadow:none}
.slide header{flex:none;margin:0 0 14px}
.eyebrow{margin:0 0 4px;font-size:12px;line-height:16px;letter-spacing:.08em;font-weight:600;color:#56657a;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
h1,h2{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
h1{margin:96px 0 18px;font-size:44px;line-height:52px;max-height:156px;-webkit-line-clamp:3;color:#0b5394}
h2{margin:0;font-size:${titleFont}px;line-height:${titleLineHeight}px;color:#0b5394}
.t1 h2{-webkit-line-clamp:1;max-height:${titleLineHeight}px}
.t2 h2{-webkit-line-clamp:2;max-height:${2 * titleLineHeight}px}
h3{margin:0 0 4px;font-size:13px;line-height:18px;text-transform:uppercase;letter-spacing:.05em;color:#56657a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
h3 small{font-size:11px;text-transform:none;letter-spacing:0}
.slide .body{flex:1 1 0;min-height:0;display:flex;flex-direction:column;gap:${gap}px;overflow:hidden}
.body>*{flex:none;margin:0}
.slide footer{flex:none;display:flex;gap:24px;height:32px;margin-top:8px;padding-top:8px;border-top:1px solid #e3e7ec;font-size:12px;line-height:16px;color:#6b778a;white-space:nowrap;overflow:hidden}
.footer-text{min-width:0;max-width:680px;overflow:hidden;text-overflow:ellipsis}
.slide-number{flex:none}
.c{display:-webkit-box;-webkit-box-orient:vertical;box-sizing:content-box;overflow:hidden;overflow-wrap:anywhere;line-height:var(--lh);max-height:calc(var(--lh) * var(--n))}
${Array.from({ length: maxClamp }, (_, at) => `.l${at + 1}{--n:${at + 1};-webkit-line-clamp:${at + 1}}`).join('')}
p{margin:0}
.lead{font-size:20px}
.subtitle{font-size:20px;--lh:28px}
.muted{color:#6b778a}
.warning{padding:8px 12px;border-left:4px solid #c27c0e;background:#fff6e5}
.missing{padding:8px 12px;border-left:4px solid #8a96a8;background:#f2f5f8}
.missing strong{font-size:20px;vertical-align:top;margin-right:6px}
.note,.rule{font-size:13px;--lh:18px;color:#56657a}
.rule{font-weight:600}
.byline{font-size:14px;--lh:20px;color:#56657a}
.tiles{display:grid;grid-auto-rows:${tileHeight}px;gap:${gap}px;margin:0}
.tiles.n1{grid-template-columns:minmax(0,1fr)}.tiles.n2{grid-template-columns:repeat(2,minmax(0,1fr))}.tiles.n3{grid-template-columns:repeat(3,minmax(0,1fr))}.tiles.n4{grid-template-columns:repeat(4,minmax(0,1fr))}
.tile{height:${tileHeight}px;overflow:hidden;padding:10px 16px;border:1px solid #d5dbe3;border-radius:8px;background:#f7f9fb}
.tile dt{font-size:13px;--lh:18px;color:#56657a}
.tile dd{margin:2px 0 0}
.tile strong{display:block;font-size:30px;line-height:36px;color:#1b2430;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile small{font-size:12px;--lh:16px;color:#56657a}
table.t{width:100%;table-layout:fixed;border-collapse:collapse;font-size:14px;line-height:${rowLine}px}
table.t th,table.t td{padding:5px 8px;border-bottom:1px solid #e3e7ec;text-align:left;vertical-align:top;--lh:${rowLine}px}
table.t thead th{padding:6px 8px;font-size:12px;line-height:${headLine}px;--lh:${headLine}px;font-weight:600;color:#56657a;background:#f2f5f8}
table.t tbody th{font-weight:600}
table.t .num{text-align:right}
.num{font-variant-numeric:tabular-nums}
${widthStyle()}
.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 32px;margin:0}
.facts.wide{grid-template-columns:repeat(2,minmax(0,1fr))}
.facts dt{margin:0 0 2px;font-size:11px;line-height:14px;text-transform:uppercase;letter-spacing:.05em;color:#56657a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.facts dd{margin:0;font-weight:600;--lh:20px}
.columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 ${columnGap}px;align-items:start}
.suggested p,.suggested li{font-style:italic}
.part{margin:0}
.part p{margin:0 0 3px}
.part ul{margin:0;padding-left:20px}
.part li{margin:0 0 3px}
.part li.more,.themes li.more{list-style:none}
.themes{margin:0;padding:0;list-style:none}
.themes li{padding:5px 0;border-bottom:1px solid #e3e7ec}
.fid{display:inline-block;min-width:64px;font-weight:700;color:#0b5394}
.big{font-size:20px;--lh:28px}
.agenda{margin:0;padding:0 0 0 28px;list-style:disc}
.agenda li{padding:5px 0;font-size:15px}
.agenda li.more{list-style:none}
.controls{display:none}
.js .controls{display:flex;position:fixed;right:12px;bottom:12px;z-index:2;gap:6px;align-items:center;padding:4px;border:1px solid #d5dbe3;border-radius:8px;background:rgba(255,255,255,.94);box-shadow:0 2px 8px rgba(0,0,0,.18)}
.controls button,#overview button{font:inherit;padding:6px 12px;border:1px solid #c4ccd6;border-radius:6px;background:#fff;color:#1b2430;cursor:pointer}
.controls button:disabled{opacity:.45;cursor:default}
.controls button:focus-visible,#overview button:focus-visible{outline:2px solid #0b5394;outline-offset:2px}
#counter{min-width:64px;text-align:center;font-variant-numeric:tabular-nums}
#overview{position:fixed;inset:0;z-index:3;overflow:auto;padding:24px 32px;background:rgba(233,237,242,.98)}
#overview[hidden]{display:none}
#overview h2{margin-bottom:16px;display:block}
#overview ol{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin:0;padding:0;list-style:none}
#overview button{display:flex;flex-direction:column;gap:6px;width:100%;aspect-ratio:16/9;padding:10px 12px;overflow:hidden;text-align:left;border-top:4px solid #0b5394;box-shadow:0 1px 3px rgba(0,0,0,.12)}
#overview button[aria-current="true"]{outline:2px solid #0b5394}
#overview .n{display:block;font-size:12px;color:#56657a}
#overview .t{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;font-weight:600;color:#0b5394}
@page{size:${slideWidth}px ${slideHeight}px;margin:0}
@media print{html,body,.js body{margin:0;background:#fff;overflow:visible}.js main{position:static;overflow:visible}.slide,.js .slide,.js .slide.current{display:flex;position:relative;left:auto;top:auto;transform:none;margin:0;box-shadow:none;break-inside:avoid;break-after:page;page-break-after:always}.slide:last-of-type{break-after:auto;page-break-after:auto}.controls,.js .controls,#overview{display:none}}
`
// PIR-43: the whole file. One self-contained HTML file: the slides (every value through text()), the navigation script
// and the styles inline, the Content-Security-Policy of the interactive HTML file (no request of any kind).
export async function buildMeetingHtml(meeting: Meeting): Promise<string> {
  const slides = meetingSlides(meeting), title = meetingTitle(meeting.pi), total = slides.length
  // PIR-59: the accent colour (validated) in place of the built-in blue; a dark title slide when chosen.
  const accent = accentOf(meeting.settings), dark = settingsOf(meeting).titleTheme === 'dark'
  const script = inlineScript(meetingScript), style = inlineStyle(`${meetingStyle.replaceAll('#0b5394', accent)}${execStyle(accent)}`)
  // PIR-58: the footer text of the template on every slide, with the slide number n / N.
  const footer = meetingFooter(meeting)
  const [scriptHash, styleHash] = await Promise.all([sha256Base64(script), sha256Base64(style)])
  // PIR-64: the title clamped to the lines it was counted with (the full title in the header's title when cut).
  const sections = slides.map((slide, at) => `<section class="slide slide-${slide.kind}${slide.kind === 'title' && dark ? ' dark' : ''}" id="slide-${at + 1}" aria-roledescription="slide" aria-label="${at + 1} of ${total}: ${text(slide.title)}">
<header class="t${slide.kind === 'title' ? 3 : titleLines(slide.title)}"${titleAttr(slide.title, slide.kind === 'title' ? wrapLines(slide.title, contentWidth, 44) > 3 : titleCut(slide.title))}><p class="eyebrow">${text(slide.eyebrow)}</p>${slide.kind === 'title' ? `<h1>${text(slide.title)}</h1>` : `<h2>${text(slide.title)}</h2>`}</header>
<div class="body">${slide.body}</div>
<footer><span class="footer-text">${text(footer)}</span><span class="slide-number">${at + 1} / ${total}</span></footer>
</section>`).join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${publishCsp(scriptHash, styleHash)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="Demand Planning Hub — PI Review Meeting">
<title>${text(title)} · ${text(meeting.builtAt)}</title>
<style>${style}</style>
</head>
<body>
<main>
${sections}
</main>
<nav id="overview" hidden aria-label="Slide overview"><h2>Slides</h2><ol>${slides.map((slide, at) => `<li><button type="button" data-slide="${at}"><span class="n">${at + 1}</span><span class="t">${text(slide.title)}</span></button></li>`).join('')}</ol></nav>
<div class="controls" role="toolbar" aria-label="Slides"><button type="button" id="prev" aria-label="Previous slide">‹</button><span id="counter" aria-live="polite">1 / ${total}</span><button type="button" id="next" aria-label="Next slide">›</button><button type="button" id="toggle" aria-expanded="false" aria-controls="overview">Overview</button><button type="button" id="print">Print</button></div>
<script>${script}</script>
</body>
</html>
`
}

// PIR-47: a file of this app version — it starts with exactly the head written above, and its policy allows only this
// version's navigation script (by its hash) — so a file changed in Git cannot run code of its own when it is opened from
// the app. Anything else is only downloaded.
export async function isMeetingHtml(html: string): Promise<boolean> {
  const hash = await sha256Base64(inlineScript(meetingScript))
  const head = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'sha256-`
  return html.startsWith(head) && /^[A-Za-z0-9+/]{43}='; img-src data:; base-uri 'none'; form-action 'none'">\n/.test(html.slice(head.length))
}

// PIR-47: why the copy cannot be saved to Git ('' when it can): View as, the roles not loaded, sample data, no Git
// storage, a read-only token. The download is never blocked by any of these.
export interface MeetingSaveState { viewingAs: string; rolesMissing: boolean; isSample: boolean; connected: boolean; readOnly: boolean }
export function meetingSaveBlock(state: MeetingSaveState): string {
  if (state.viewingAs) return `Viewing as ${state.viewingAs}: the meeting is downloaded only, not saved to Git.`
  if (state.rolesMissing) return 'The roles file is not loaded yet: the meeting is downloaded only, not saved to Git.'
  if (state.isSample) return 'Synthetic sample data is loaded: the meeting is downloaded only, not saved to Git.'
  if (!state.connected) return 'Git storage is not connected (Admin → Data & history): the meeting is downloaded only.'
  if (state.readOnly) return 'Your Git token can read but not save: the meeting is downloaded only.'
  return ''
}
// PIR-40: who sees Conduct PI Meeting — the PI Review leads and the PI Review Setup holders.
export const canConductMeeting = (can: (action: 'pireview.post' | 'pireview.setup') => boolean) => can('pireview.post') || can('pireview.setup')
