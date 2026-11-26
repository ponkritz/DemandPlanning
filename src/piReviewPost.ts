// PI Review, the review form (PIR-13…PIR-15, CON-113): who may post a Feature's review, the next PI, the form's checks,
// the comment built from it in the standard format PI Review reads back (splitReviewComment), and the post itself — a
// new comment in the Feature's Discussion, written with the person's own PAT to dev.azure.com only.
import { isCloudBase, collectionUrl, requestAzure, type AzureConfig, type AzureTransport } from './azureClient.ts'
import { writeBlockedReason, type Action } from './access.ts'
import { isMine, piName, piPathOf, type Me } from './myWork.ts'
import { formatDate } from './format.ts'
import { commentText } from './workItemEdit.ts'
import { readDiscussion } from './azureDevOps.ts'
import { commentsFrom, discussionsFrom, headingText, piPlaceholder, reviewFooter, reviewSplit, reviewedPiPlaceholder, setDiscussion, tidyReviewText, type ReviewSplit } from './piReview.ts'
import { builtInFormSetup, fieldOf, setupProblems, type PiFormField, type PiFormSetup } from './piReviewSetup.ts'
import type { AzureWorkItem } from './domain'
import type { WorkItemComment } from './azureDevOps.ts'
import type { AzureIteration } from './azureRead.ts'

// PIR-13: the form. move: Yes or No only (an older comment's Partly is read, never offered), **No** pre-selected (the
// product owner's choice, UI-STANDARDS §12 exception of 2026-11-25); movePi: the PI it moves to. mode: the Review
// meeting advice (one of its options), no default. PIR-20: extra — the fields added in the form setup, by id.
// PIR-19: the defaults come from the form setup in use (the built-in form without one): Move = its default (No).
export type ReviewMove = 'Yes' | 'No'
// PIR-27: noTexts — "No learnings or struggles" is ticked; it holds what was typed before, restored when it is unticked.
// PIR-28: reviewedPi — the reviewed PI written in the headings with {REVIEWED PI} ("PI 26.4"; '' when not known).
export interface ReviewForm { learnings: string; struggles: string; move: ReviewMove | ''; moveReason: string; movePi: string; mode: string; remarks: string; extra?: Record<string, string>; noTexts?: Partial<Record<NoneField, string>>; reviewedPi?: string }
const choiceDefault = (field: PiFormField | undefined) => field?.type === 'dropdown' ? field.defaultValue : ''
export function emptyReviewForm(movePi = '', setup: PiFormSetup = builtInFormSetup()): ReviewForm {
  const move = choiceDefault(fieldOf(setup, 'move'))
  const extra = Object.fromEntries(setup.fields.filter((field) => !builtIn.has(field.id)).map((field) => [field.id, choiceDefault(field)]))
  return { learnings: '', struggles: '', move: move === 'Yes' || move === 'No' ? move : '', moveReason: '', movePi, mode: choiceDefault(fieldOf(setup, 'review')), remarks: '', ...(Object.keys(extra).length ? { extra } : {}) }
}
const builtIn = new Set(['learnings', 'struggles', 'move', 'review', 'remarks'])

// PIR-13: the PI written in the Move question — "PI" and its number ("PI 26.5", "PI 2026.5"); PIR-25: also read from
// "PI26.4", "PI-26.4", "PI.26.4", "PI_26.4" and "Program Increment 26.4", with any Unicode space (a non-breaking or
// narrow space), zero-width characters, full-width digits and other dot characters, and with text before or after it
// ("Release PI 25.1", "PI 25.1 (Jan–Mar)", "PI 25.1 - Q1": the number is kept); '' when the name has no PI number
// ("PI Planning", "PI Q4 2026", "API2").
export const tidyPiName = (name: string) => name.normalize('NFKC').replace(/[​-‍⁠﻿­]/g, '').replace(/[\s\p{Zs}]+/gu, ' ').replace(/[․﹒]/g, '.').trim()
const piPattern = /(?:^|[^\p{L}\p{N}])(?:pi|program ?increment)[ ._:-]*(\d+(?:\.\d+)*)(?![\p{L}\p{N}]|\.\d)/iu
export const piText = (name: string) => { const match = piPattern.exec(tidyPiName(name)); return match ? `PI ${match[1]}` : '' }
// PIR-25: a PI's number parts ("Q\\PI 26.4" → [26, 4]); null without a PI number. Compared with a two-digit year read
// as 20xx, so PI 26.4 and PI 2026.4 are the same PI and PI 26.4 comes before PI 2027.1.
export const piParts = (path: string) => { const text = piText(piName(path)); return text ? text.slice(3).split('.').map(Number) : null }
export const comparable = (parts: readonly number[]) => parts.length >= 2 && parts[0] < 100 ? [parts[0] + 2000, ...parts.slice(1)] : [...parts]
export function comparePiNumbers(a: readonly number[], b: readonly number[]): number {
  const x = comparable(a), y = comparable(b)
  for (let index = 0; index < Math.max(x.length, y.length); index++) { const diff = (x[index] ?? -1) - (y[index] ?? -1); if (diff) return diff }
  return 0
}
// PIR-25: the PIs in a year — the highest last number of any known "year.number" PI, at least 4 (PI x.1…x.4).
export const PIS_PER_YEAR_MIN = 4
export function pisPerYear(known: readonly string[]): number {
  return known.map(piParts).reduce((most, parts) => parts?.length === 2 ? Math.max(most, parts[1]) : most, PIS_PER_YEAR_MIN)
}
// PIR-13, PIR-25: the PI after the reviewed one by number — the next later PI in the PI list (by its numbers), else
// worked out from the reviewed PI's number: the last PI of its year (its last number the highest of pisPerYear) rolls
// over to the next year's first, keeping the year's digits ("PI 26.4" → "PI 27.1", "PI 2026.4" → "PI 2027.1"); any
// other adds one ("PI 26.2" → "PI 26.3"); as "PI <number>", '' when the reviewed PI has no number.
export function nextPi(reviewed: string, options: readonly string[]): string { return nextByNumber(reviewed, options).pi }
function nextByNumber(reviewed: string, options: readonly string[], known: readonly string[] = options): { pi: string; how: 'list' | 'rollover' | 'plus-one' | '' } {
  const own = piParts(reviewed)
  if (!own) return { pi: '', how: '' }
  const later = options.map((pi) => ({ pi, parts: piParts(pi) })).filter((entry): entry is { pi: string; parts: number[] } => entry.parts !== null && comparePiNumbers(entry.parts, own) > 0)
    .sort((a, b) => comparePiNumbers(a.parts, b.parts))[0]
  if (later) return { pi: piText(piName(later.pi)), how: 'list' }
  const last = own.length - 1
  if (own.length === 2 && own[1] >= pisPerYear([...known, reviewed])) return { pi: `PI ${String(own[0] + 1).padStart(String(own[0]).length, '0')}.1`, how: 'rollover' }
  return { pi: `PI ${own.map((part, index) => index === last ? part + 1 : part).join('.')}`, how: 'plus-one' }
}

// PIR-25 (product owner, 25 Nov 2026: the next PI is always based on today's date, not on the reviewed PI): the PI
// Moves to suggests, from the Azure DevOps iteration tree (every PI in it, future ones too):
//  1. today's PI — the dated PI whose period holds today (UTC; `today` is a parameter, no clock in here). A PI's period
//     is that of its PI-level iteration (the path ending at the PI segment, ATM-30; a year node above it, as in
//     "2026\PI 26.4", is not a PI), else the span of the dated iterations under it (teams often date only the Sprints);
//     the same PI in several subtrees (per team, area or spelling: PI 26.4 and PI 2026.4) is one PI, its periods merged
//     (earliest start, latest finish); a "PI 26.2.1"-style iteration is a Sprint of PI 26.2, never a PI of its own. The
//     next PI is the dated PI whose start is earliest after today's PI's start — the first one starting after it ends,
//     or, when the dates overlap, the overlapping one (the lower number on the same start). Without a later dated PI:
//     the next undated PI by number in the tree after today's PI, else its number rolled over (nextByNumber);
//  2. no dated PI holds today, or two do — the dates are missing, and the note says so and what was used: the next
//     undated PI by number in the tree after the latest dated PI that ended before today, else the number rollover from
//     it; with no such PI (an undated tree) or without the iterations (not read, still being read), the next PI by number
//     after the reviewed PI — the only PI then known — in the tree and the PI list, else its rollover.
// The reviewed PI never decides the next PI when a dated PI is known. `note` says which source was used (the form's ⓘ),
// `short` is the one line under Moves to, `missing` whether a fallback was used (a warning). PI names without a PI
// number ("PI Planning") are never chosen; the note names them (at most five, then "and n more").
export type NextPi = { pi: string; source: 'dates' | 'number'; note: string; short: string; missing: boolean }
type PiSpan = { path: string; start: string; finish: string }
const isoDay = (value: string | undefined) => { const day = value?.slice(0, 10) ?? ''; return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '' }
export function piDates(iterations: readonly AzureIteration[]): Map<string, PiSpan> {
  const own = new Map<string, PiSpan>(), span = new Map<string, PiSpan>()
  for (const iteration of iterations) {
    const pi = piPathOf(iteration.path), start = isoDay(iteration.attributes?.startDate), finish = isoDay(iteration.attributes?.finishDate)
    if (!pi || !start || !finish || finish < start) continue
    const key = pi.toLowerCase()
    if (key === iteration.path.toLowerCase()) { own.set(key, { path: iteration.path, start, finish }); continue }
    const seen = span.get(key)
    span.set(key, seen ? { path: seen.path, start: start < seen.start ? start : seen.start, finish: finish > seen.finish ? finish : seen.finish } : { path: pi, start, finish })
  }
  return new Map([...span, ...own])
}
// PIR-25: the PIs of the iteration tree by their number — one entry per PI number, its own dates (merged over the
// subtrees) winning over the span of the dated iterations under it; unnamed: the PI-level names without a PI number.
export type PiPeriod = { pi: string; parts: number[]; start: string; finish: string }
export function piPeriods(iterations: readonly AzureIteration[]): { dated: PiPeriod[]; undated: { pi: string; parts: number[] }[]; unnamed: string[] } {
  type When = { start: string; finish: string }
  type Entry = { pi: string; parts: number[]; own?: When; span?: When }
  const entries = new Map<string, Entry>(), unnamed: string[] = []
  const merge = (seen: When | undefined, start: string, finish: string): When => seen ? { start: start < seen.start ? start : seen.start, finish: finish > seen.finish ? finish : seen.finish } : { start, finish }
  for (const iteration of iterations) {
    const path = piPathOf(iteration.path)
    if (!path) continue
    const all = piParts(path)
    if (!all) { const name = tidyPiName(piName(path)); if (name) unnamed.push(name); continue }
    const sprintName = all.length > 2, parts = sprintName ? all.slice(0, 2) : all
    const key = comparable(parts).join('.')
    const entry = entries.get(key) ?? { pi: `PI ${parts.join('.')}`, parts }
    entries.set(key, entry)
    const start = isoDay(iteration.attributes?.startDate), finish = isoDay(iteration.attributes?.finishDate)
    if (!start || !finish || finish < start) continue
    if (!sprintName && path.toLowerCase() === iteration.path.toLowerCase()) entry.own = merge(entry.own, start, finish)
    else entry.span = merge(entry.span, start, finish)
  }
  const list = [...entries.values()]
  return {
    dated: list.flatMap((entry) => { const when = entry.own ?? entry.span; return when ? [{ pi: entry.pi, parts: entry.parts, ...when }] : [] }),
    undated: list.filter((entry) => !entry.own && !entry.span).map(({ pi, parts }) => ({ pi, parts })),
    unnamed: [...new Set(unnamed)],
  }
}
// PIR-25: the names left out — never one that has a PI number; each once; at most five, then "and n more".
export const LEFT_OUT_MAX = 5
export function leftOutNote(names: readonly string[]): string {
  const unique = [...new Map(names.map(tidyPiName).filter((name) => name && !piText(name)).map((name) => [name.toLowerCase(), name])).values()]
  if (!unique.length) return ''
  const more = unique.length - LEFT_OUT_MAX
  return ` Left out (no PI number in the name): ${unique.slice(0, LEFT_OUT_MAX).join(', ')}${more > 0 ? ` and ${more} more` : ''}.`
}
export function nextPiOf(reviewed: string, iterations: readonly AzureIteration[] | null | undefined, options: readonly string[], { reading = false, today }: { reading?: boolean; today: Date }): NextPi {
  const day = today.toISOString().slice(0, 10)
  const periods = iterations ? piPeriods(iterations) : { dated: [], undated: [], unnamed: [] }
  const optionPis = options.filter((pi) => (piParts(pi)?.length ?? 0) >= 1)
  const known = [...periods.dated.map((entry) => entry.pi), ...periods.undated.map((entry) => entry.pi), ...optionPis]
  const unnamed = [...periods.unnamed, ...options.map(piName)]
  const dated = new Set(periods.dated.map((entry) => comparable(entry.parts).join('.')))
  const undatedInTree = periods.undated.map((entry) => entry.pi)
  const reviewedPi = piText(piName(reviewed)) || piName(reviewed)
  const missingShort = 'PI dates missing in Azure DevOps — check this PI.'
  // The next PI by number after `from` among the undated candidates, else its rollover; said how.
  const byNumber = (from: string, candidates: readonly string[], inTree: boolean) => {
    const pool = candidates.filter((pi) => { const parts = piParts(pi); return parts && parts.length <= 2 && !dated.has(comparable(parts).join('.')) })
    const next = nextByNumber(from, pool, known)
    if (!next.pi) return null
    const fromPi = piText(piName(from))
    const how = next.how === 'list' ? (inTree || undatedInTree.some((pi) => piText(pi).toLowerCase() === next.pi.toLowerCase()) ? `${next.pi} is the next PI by number in the Azure DevOps iteration tree (it has no dates)` : `${next.pi} is the next PI by number in the PI list`)
      : next.how === 'rollover' ? `worked out from the PI number — ${fromPi} is the last PI of its year (${pisPerYear([...known, from])} a year), so the next is ${next.pi}`
        : `worked out from the PI number — the next after ${fromPi} is ${next.pi}`
    return { pi: next.pi, how }
  }
  const fromReviewed = (why: string, short: string): NextPi => {
    const found = reviewed ? byNumber(reviewed, [...undatedInTree, ...optionPis], false) : null
    if (!found) return { pi: '', source: 'number', note: why ? `${why}, and no PI is known to work it out from.${leftOutNote(unnamed)}` : '', short: why ? short : '', missing: Boolean(why) }
    return { pi: found.pi, source: 'number', note: `${why}. Used instead: ${reviewedPi}, the reviewed PI — ${found.how}.${leftOutNote(unnamed)}`, short, missing: true }
  }
  if (!iterations) return fromReviewed(reading ? 'The PI dates are still being read from Azure DevOps, so today’s PI is not known yet' : 'The PI dates are not read from Azure DevOps here, so today’s PI is not known', reading ? 'PI dates still being read — by the PI number for now.' : missingShort)
  const covering = periods.dated.filter((entry) => entry.start <= day && day <= entry.finish)
  if (covering.length === 1) {
    const current = covering[0]
    const where = `today (${formatDate(day)}) is in ${current.pi} (${formatDate(current.start)} – ${formatDate(current.finish)})`
    const next = periods.dated.filter((entry) => entry !== current && entry.start > current.start).sort((a, b) => a.start.localeCompare(b.start) || comparePiNumbers(a.parts, b.parts))[0]
    if (next) {
      const overlap = next.start <= current.finish ? ` while ${current.pi} runs until ${formatDate(current.finish)} (the PIs overlap)` : ''
      return { pi: next.pi, source: 'dates', note: `From Azure DevOps iteration dates: ${where}; the next PI is ${next.pi}, starting ${formatDate(next.start)}${overlap}.${leftOutNote(unnamed)}`, short: 'From the Azure DevOps dates.', missing: false }
    }
    const found = byNumber(current.pi, undatedInTree, true)!
    return { pi: found.pi, source: 'number', note: `From Azure DevOps iteration dates: ${where}, but no later PI has dates: ${found.how}.${leftOutNote(unnamed)}`, short: 'No later PI has dates in Azure DevOps — by the PI number; check it.', missing: true }
  }
  const why = covering.length > 1
    ? `The PI dates do not decide: ${covering.length} PIs have dates covering today (${formatDate(day)}) — ${covering.map((entry) => entry.pi).join(', ')}`
    : periods.dated.length ? `The PI dates are missing: no PI in Azure DevOps has dates covering today (${formatDate(day)})` : 'The PI dates are missing: no PI in the Azure DevOps iteration tree has dates'
  const ended = periods.dated.filter((entry) => entry.finish < day).sort((a, b) => b.finish.localeCompare(a.finish) || comparePiNumbers(b.parts, a.parts))[0]
  if (!ended) return fromReviewed(why, missingShort)
  const found = byNumber(ended.pi, undatedInTree, true)!
  return { pi: found.pi, source: 'number', note: `${why}. Used instead: ${ended.pi}, the latest PI that ended before today (${formatDate(ended.finish)}) — ${found.how}.${leftOutNote(unnamed)}`, short: missingShort, missing: true }
}

// PIR-24: who may show another person's Features in My PI Review — a lead with "PI Review: post the review of a
// Feature" (CON-113), who may also post their reviews; everyone else sees their own ('' when they may choose).
export function otherPersonBlock(viewer: Pick<ReviewViewer, 'can'>): string {
  return isReviewLead(viewer) ? '' : 'You see your own Features: showing another person’s needs “PI Review: post the review of a Feature” (a lead). An Admin can change this in Admin → People & roles → Role rights.'
}
// PIR-24: a person chosen by name (a Feature's Assigned To) — with their work email when a fetched item assigned to
// them carries one, so their Features are matched by email where it is known (isMine, as CON-113's assignee rule).
export function personOf(items: readonly Pick<AzureWorkItem, 'assignedTo' | 'assignedToEmail'>[], name: string): Me {
  const wanted = name.trim().toLowerCase()
  const email = items.find((item) => item.assignedTo.trim().toLowerCase() === wanted && item.assignedToEmail?.trim())?.assignedToEmail?.trim().toLowerCase()
  return { name: name.trim(), ...(email ? { email } : {}) }
}

// CON-113, PIR-13: who may post the review of a Feature — a lead ("PI Review: post the review of a Feature") on every
// Feature; the Feature's assignee (their work email is the Feature's Assigned To email) with "Add a comment".
export interface ReviewViewer { can: (action: Action) => boolean; readOnly: boolean; viewingAs: string; email: string; isSample: boolean; config: AzureConfig | null; pat: string }
const sameEmail = (a: string | undefined, b: string | undefined) => Boolean(a?.trim() && b?.trim() && a.trim().toLowerCase() === b.trim().toLowerCase())
export const isReviewLead = (viewer: Pick<ReviewViewer, 'can'>) => viewer.can('pireview.post')
export const isFeatureAssignee = (viewer: Pick<ReviewViewer, 'email'>, feature: Pick<AzureWorkItem, 'assignedToEmail'>) => sameEmail(viewer.email, feature.assignedToEmail)
// PIR-13: why nothing can be posted on this page ('' when posting may be possible): the roles not loaded, View as,
// sample data, no Time Writing connection or PAT, an on-premises server.
export function reviewPageBlock(viewer: ReviewViewer): string {
  if (viewer.readOnly) return writeBlockedReason(true, ['pireview.post'])
  if (viewer.viewingAs) return `Read only while viewing as ${viewer.viewingAs}: nothing is posted to Azure DevOps. Exit View as to post a review.`
  if (viewer.isSample) return 'Synthetic sample data is loaded: nothing is posted to Azure DevOps. Fetch your data first.'
  if (!viewer.config || !viewer.pat.trim()) return 'Connect the Time Writing connection (with its PAT) to post a review.'
  let cloud = false
  try { cloud = isCloudBase(collectionUrl(viewer.config)) } catch { cloud = false }
  if (!cloud) return 'Reviews are posted to Azure DevOps Services (dev.azure.com) only: this connection is on premises and read only.'
  return ''
}
// PIR-13: why this Feature's review cannot be posted ('' when it can): the page's reason, else the right.
export function reviewPostBlock(viewer: ReviewViewer, feature: Pick<AzureWorkItem, 'assignedTo' | 'assignedToEmail'>): string {
  const page = reviewPageBlock(viewer)
  if (page) return page
  if (isReviewLead(viewer)) return ''
  if (!isFeatureAssignee(viewer, feature)) return `Only the Feature’s assignee (${feature.assignedTo.trim() || 'nobody'}) or a lead with “PI Review: post the review of a Feature” can post its review${viewer.email ? '' : ' (enter your work email on the Time Writing connection: the assignee is matched by it)'}. An Admin can change this in Admin → People & roles → Role rights.`
  return viewer.can('work.comment') ? '' : writeBlockedReason(false, ['work.comment'])
}

// PIR-14: a paragraph as comment lines — each non-empty line trimmed; a line starting with a bullet (- * • + –) kept as a
// list item "- …", a numbered line (1. or 1)) kept as it is, any other line kept as a paragraph line.
export function reviewLines(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, ' ')).filter(Boolean).map((line) => line.replace(/^[-*•+–][ \t]*(?=\S)/, '- '))
}
// PIR-14: the Move question names the PI it moves to ("Whether the feature needs to be shifted to PI 26.5").
// PIR-19: the heading of the form setup in use, {PI} replaced by the PI.
export const moveQuestion = (pi: string, heading = `Whether the feature needs to be shifted to ${piPlaceholder}`) => heading.replace(piPlaceholder, piText(pi) || 'the next PI')
export const reviewQuestion = 'Advise to discuss the Feature during the Review meeting'
// PIR-13: the decision in words, for the audit, the confirmation and Background jobs — "Move to next PI Yes (to PI 26.5),
// Offline Review" (the advice left out when the form has none).
export const reviewSummary = (form: ReviewForm) => `Move to next PI ${form.move}${form.move === 'Yes' ? ` (to ${form.movePi.trim()})` : ''}${form.mode.trim() ? `, ${form.mode.trim()}` : ''}`
// PIR-13: what Move to next PI starts with, said in the form (UI-STANDARDS §12: a default that matters is visible).
// PIR-19: the default of the form setup in use (No in the built-in form).
export function moveDefaultNote(setup: PiFormSetup) {
  const value = fieldOf(setup, 'move')?.defaultValue
  return value ? `${fieldOf(setup, 'move')?.label || 'Move to next PI'} is pre-selected ${value}.` : ''
}

// PIR-20: the value of a field of the form (a built-in one by its key, an added one from extra).
export function fieldValue(form: ReviewForm, id: string): string {
  if (id === 'learnings' || id === 'struggles' || id === 'remarks' || id === 'moveReason') return form[id]
  if (id === 'move') return form.move
  if (id === 'review') return form.mode
  return form.extra?.[id] ?? ''
}
export function withFieldValue(form: ReviewForm, id: string, value: string): ReviewForm {
  if (id === 'learnings' || id === 'struggles' || id === 'remarks') return { ...form, [id]: value }
  if (id === 'move') return { ...form, move: value === 'Yes' || value === 'No' ? value : '' }
  if (id === 'review') return { ...form, mode: value }
  return { ...form, extra: { ...form.extra, [id]: value } }
}
// PIR-14: the comment posted — a nested bullet list (the product owner's layout, 25 Nov 2026: "Post it like this"):
// a paragraph field is a top-level bullet "{heading} :" with each line typed as a nested bullet under it (a leading
// "- ", "* " or "•" dropped; when a line is numbered — "1." or "2)" — the field's lines are a nested numbered list),
// left out when empty; a choice is one bullet "{heading} : {answer}" (left out when not answered); Move to next PI is
// its heading with the PI and the answer, its reason as nested bullets. The footer line follows the list as a paragraph;
// the split ignores it.
// PIR-19, PIR-20: the fields, their order and their headings are those of the form setup in use.
export interface ReviewBlock { text: string; items?: string[]; numbered?: boolean }
const markerless = (line: string, numbered: boolean) => line.replace(numbered ? /^(?:\d{1,2}[.)]|[-*•+–◦▪])[ \t]*(?=\S)/ : /^[-*•+–◦▪][ \t]*(?=\S)/, '')
const isNumbered = (line: string) => /^\d{1,2}[.)][ \t]+\S/.test(line)
// A paragraph as its nested items: each non-empty line, trimmed, spaces collapsed, its own marker dropped.
export function paragraphItems(text: string): { items: string[]; numbered: boolean } {
  const lines = text.split(/\r?\n/).map((line) => line.trim().replace(/\s+/g, ' ')).filter(Boolean)
  const numbered = lines.some(isNumbered)
  return { items: lines.map((line) => markerless(line, numbered)).filter(Boolean), numbered }
}
export function reviewBlocks(form: ReviewForm, setup: PiFormSetup = builtInFormSetup()): ReviewBlock[] {
  return setup.fields.flatMap((field): ReviewBlock[] => {
    if (field.id === 'move') {
      // PIR-13: the reason only with Yes (with No the Reason box is hidden; what was typed is kept, not posted).
      const reason = paragraphItems(form.move === 'Yes' ? form.moveReason : '')
      return [{ text: `${moveQuestion(form.movePi, field.heading)} : ${form.move}`, ...(reason.items.length ? reason : {}) }]
    }
    const value = fieldValue(form, field.id), heading = headingText(field.heading, piText(form.reviewedPi ?? ''))
    if (field.type === 'dropdown') return value.trim() ? [{ text: `${heading} : ${value.trim()}` }] : []
    // PIR-28: a paragraph's heading with no space before its colon, as the product owner writes it ("Learnings of PI 26.4:").
    const paragraph = paragraphItems(value)
    return paragraph.items.length ? [{ text: `${heading}:`, ...paragraph }] : []
  })
}
// PIR-14 (SM-183): the comment's HTML — the one place it is built: every text escaped (& < > " '), only the app's own
// <ul>, <ol>, <li> and <p> raw. The transport accepts nothing else (safeCommentHtml).
export const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
export function reviewCommentHtml(blocks: readonly ReviewBlock[]): string {
  const item = (block: ReviewBlock) => {
    const tag = block.numbered ? 'ol' : 'ul'
    return `<li>${escapeHtml(block.text)}${block.items?.length ? `<${tag}>${block.items.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</${tag}>` : ''}</li>`
  }
  return `${blocks.length ? `<ul>${blocks.map(item).join('')}</ul>` : ''}<p>${escapeHtml(reviewFooter)}</p>`
}
export const buildReviewComment = (form: ReviewForm, setup: PiFormSetup = builtInFormSetup()) => reviewCommentHtml(reviewBlocks(form, setup))

// PIR-14: the comment as PI Review will read it back — the HTML as it is posted, read as plain text the way the read path
// does (commentText) and split (reviewSplit).
export const readBackReview = (html: string, setup?: PiFormSetup): ReviewSplit => reviewSplit(commentText(html), setup)
// PIR-13: the form's problems, each naming its field — the required fields, the PI, the length, and any field PI Review
// would read back differently (a line that looks like a heading, e.g. "Issues: …").
export const maxReviewLength = 30_000
// optionalTexts (PIR-18, the Close flow): Learnings and Struggles — every paragraph — may stay empty.
// PIR-19…PIR-21: the fields of the form setup in use — its required fields and its choices — and the read-back of each.
export function reviewFormProblems(form: ReviewForm, { optionalTexts = false, setup = builtInFormSetup() }: { optionalTexts?: boolean; setup?: PiFormSetup } = {}): string[] {
  const problems: string[] = []
  for (const field of setup.fields) {
    const value = fieldValue(form, field.id).trim()
    if (field.id === 'move') {
      if (form.move !== 'Yes' && form.move !== 'No') problems.push(`Choose whether the Feature moves to the next PI (${field.label}): Yes or No.`)
      if (form.move === 'Yes' && !piText(form.movePi)) problems.push('Enter the PI it moves to as “PI” and its number, e.g. PI 26.5.')
    } else if (field.type === 'longtext') {
      if (field.required && !optionalTexts && !reviewLines(value).length) problems.push(`Enter the ${field.label} (write “None” when there are none).`)
    } else if (value && !field.options.includes(value)) problems.push(`Choose ${field.label}: ${field.options.join(' or ')}.`)
    else if (!value && field.required) problems.push(field.id === 'review' && field.label === 'Advise to discuss the Feature during the Review meeting?' ? 'Choose whether to discuss the Feature during the Review meeting or review it offline.' : `Choose ${field.label}: ${field.options.join(' or ')}.`)
  }
  if (problems.length) return problems
  const text = buildReviewComment(form, setup)
  if (text.length > maxReviewLength) return [`The review is too long (${text.length.toLocaleString()} characters; at most ${maxReviewLength.toLocaleString()}).`]
  const differs = readBackDiffers(form, setup, readBackReview(text, setup))
  if (differs.length) problems.push(`PI Review would read ${differs.join(', ')} back differently: a line looks like a heading (e.g. “Issues:”, “Next PI:” or “Remarks”). Reword that line, e.g. without the colon.`)
  return problems
}
// PIR-14, PIR-21: the fields the split reads back differently from what the form holds (by their labels).
// PIR-28: and the reviewed PI, when a heading written names it.
function readBackDiffers(form: ReviewForm, setup: PiFormSetup, back: ReviewSplit): string[] {
  const expected = (value: string) => tidyReviewText(paragraphItems(value).items.join('\n'))
  const writesPi = piText(form.reviewedPi ?? '') && setup.fields.some((field) => field.heading.includes(reviewedPiPlaceholder) && (field.type === 'dropdown' ? fieldValue(form, field.id).trim() : paragraphItems(fieldValue(form, field.id)).items.length))
  const piDiffers = writesPi && (back.reviewedPi ?? '').toLowerCase() !== piText(form.reviewedPi ?? '').toLowerCase()
  return [...setup.fields.filter((field) => {
    if (field.id === 'move') return back.moveValue !== form.move || (back.moveRest ?? '') !== expected(form.move === 'Yes' ? form.moveReason : '') || (back.movePi ?? '') !== piText(form.movePi)
    const value = fieldValue(form, field.id)
    const read = field.id === 'learnings' || field.id === 'struggles' || field.id === 'remarks' || field.id === 'review' ? back[field.id] ?? '' : back.extra?.[field.id] ?? ''
    return read !== (field.type === 'dropdown' ? value.trim() : expected(value))
  }).map((field) => field.id === 'move' ? 'Move to next PI' : field.id === 'review' && field.label === 'Advise to discuss the Feature during the Review meeting?' ? 'Review meeting' : field.label), ...(piDiffers ? ['the reviewed PI'] : [])]
}

// PIR-21: the read-back check of a form setup — a sample review with every field filled (each choice with each of its
// options in turn) is built, sent as Azure DevOps stores it and split again with the setup's headings: every field must
// come back as written. Together with setupProblems (the shape, empty, duplicate and colliding headings, the limits).
export function formSetupProblems(setup: PiFormSetup): string[] {
  const shape = setupProblems(setup)
  if (shape.length) return shape
  const rounds = Math.max(1, ...setup.fields.map((field) => field.type === 'dropdown' ? field.options.length : 1))
  const differs = new Set<string>()
  for (let round = 0; round < rounds; round += 1) {
    let form: ReviewForm = { ...emptyReviewForm('PI 26.5', setup), move: round % 2 ? 'Yes' : 'No', moveReason: round % 2 ? 'sample reason\n- second point' : '', reviewedPi: round % 2 ? '' : 'PI 26.4' }
    for (const [index, field] of setup.fields.entries()) {
      if (field.id === 'move') continue
      form = withFieldValue(form, field.id, field.type === 'dropdown' ? field.options[round % field.options.length] : `Sample answer ${index + 1}\n- sample point ${index + 1}`)
    }
    for (const field of readBackDiffers(form, setup, readBackReview(buildReviewComment(form, setup), setup))) differs.add(field)
  }
  // PIR-27: "No learnings or struggles" — the "None" it writes must come back as written too.
  if (noneFieldsOf(setup).length) {
    let form: ReviewForm = { ...emptyReviewForm('PI 26.5', setup), move: 'No', reviewedPi: 'PI 26.4' }
    for (const [index, field] of setup.fields.entries()) if (field.id !== 'move') form = withFieldValue(form, field.id, field.type === 'dropdown' ? field.options[0] : `Sample answer ${index + 1}`)
    const none = withNoTexts(form, setup, true)
    for (const field of readBackDiffers(none, setup, readBackReview(buildReviewComment(none, setup), setup))) differs.add(field)
  }
  return differs.size ? [`A review written with this form would not be read back as written: ${[...differs].join(', ')}. A heading probably contains or looks like another field's heading; change it.`] : []
}

// PIR-13: the form prefilled from the Feature's latest review comment split by its headings (a correction starts from
// what was posted); Partly (from an older comment) is not offered, so Move starts at No (the caller says so). Otherwise
// the empty form (Move No).
// PIR-19, PIR-20: only the fields of the form setup in use; a choice takes the answer written when it is one of its
// options (letter case ignored; the advice also by its normalized value), else its default.
export function reviewFormFrom(split: ReviewSplit | undefined, movePi: string, setup: PiFormSetup = builtInFormSetup()): ReviewForm {
  const empty = emptyReviewForm(movePi, setup)
  if (!split || split.from !== 'Headings') return empty
  const option = (field: PiFormField, ...written: (string | undefined)[]) => { for (const text of written) { const found = field.options.find((entry) => entry.toLowerCase() === (text ?? '').trim().toLowerCase()); if (found) return found } return field.defaultValue }
  let form: ReviewForm = { ...empty, move: split.moveValue === 'Yes' ? 'Yes' : 'No', moveReason: split.moveValue ? split.moveRest ?? '' : split.move ?? '', movePi: split.movePi ?? movePi }
  for (const field of setup.fields) {
    if (field.id === 'move') continue
    const written = field.id === 'learnings' || field.id === 'struggles' || field.id === 'remarks' || field.id === 'review' ? split[field.id] : split.extra?.[field.id]
    form = withFieldValue(form, field.id, field.type === 'dropdown' ? option(field, written, field.id === 'review' ? split.reviewMode : undefined) : written ?? '')
  }
  return form
}

// PIR-13: post the review as a new comment on the Feature (the add-comment write, with the Feature's Assigned To email
// for the rights check, CON-113). Returns the new comment's ID.
export async function postReview(config: AzureConfig, pat: string, feature: Pick<AzureWorkItem, 'id' | 'assignedToEmail'>, text: string, transport: AzureTransport = requestAzure): Promise<number> {
  if (!text.trim() || text.length > maxReviewLength) throw new Error('The review is empty or too long. Nothing was posted.')
  const response = await transport({ ...config, pat, operation: 'add-comment', workItemId: feature.id, comment: text, htmlComment: true, reviewOf: feature.assignedToEmail ?? '' }) as { id?: unknown }
  if (typeof response?.id !== 'number') throw new Error(`The review on #${feature.id} could not be confirmed. Check the Discussion in Azure DevOps before posting again.`)
  return response.id
}

// PIR-34: Edit review… — replace a review comment the viewer wrote (the Work Items Comments update, PATCH
// …/comments/{commentId}) with the form's new text, built and checked as a post (reviewCommentHtml, safeCommentHtml) and
// with the same rights (CON-113). Azure DevOps lets only the author edit a comment. Returns the comment's ID.
export async function updateReview(config: AzureConfig, pat: string, feature: Pick<AzureWorkItem, 'id' | 'assignedToEmail'>, commentId: number, text: string, transport: AzureTransport = requestAzure): Promise<number> {
  if (!text.trim() || text.length > maxReviewLength) throw new Error('The review is empty or too long. Nothing was changed.')
  const response = await transport({ ...config, pat, operation: 'update-comment', workItemId: feature.id, commentId, comment: text, htmlComment: true, reviewOf: feature.assignedToEmail ?? '' }) as { id?: unknown }
  if (typeof response?.id !== 'number') throw new Error(`The edit of the review on #${feature.id} could not be confirmed. Check the Discussion in Azure DevOps before trying again.`)
  return response.id
}
// PIR-34: a comment written by the viewer — by the author's email (its unique name) when Azure DevOps gave one and the
// viewer's work email is known, else by the display name (letter case and spaces ignored).
export function isOwnComment(comment: Pick<WorkItemComment, 'author' | 'authorEmail'>, me: { email?: string; name?: string }): boolean {
  const email = me.email?.trim().toLowerCase()
  if (comment.authorEmail && email) return comment.authorEmail.trim().toLowerCase() === email
  const name = me.name?.trim().replace(/\s+/g, ' ').toLowerCase()
  return Boolean(name) && comment.author.trim().replace(/\s+/g, ' ').toLowerCase() === name
}
// PIR-34: the review Edit review… edits — the viewer's own newest review comment (split by the review headings, the
// comments on or after "PI Review starts from" only, as read) when it counts for the chosen PI (PIR-26: `counts`);
// undefined otherwise (no own review, or the newest is for another PI: Write review… posts a new one).
export function editTargetOf(comments: readonly WorkItemComment[], me: { email?: string; name?: string }, counts: (review: { date: string; reviewedPi?: string }) => boolean, setup?: PiFormSetup): { comment: WorkItemComment; split: ReviewSplit } | undefined {
  const newest = [...comments].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  for (const comment of newest) {
    if (!isOwnComment(comment, me)) continue
    const split = reviewSplit(comment.text, setup)
    if (split.from !== 'Headings') continue
    return counts({ date: comment.date, reviewedPi: split.reviewedPi }) ? { comment, split } : undefined
  }
  return undefined
}

// PIR-34: the review Edit review… offers on a Feature, on PI Review and My PI Review alike — the viewer's own newest
// review comment of the Discussion as read (on or after "PI Review starts from"), when it counts for the chosen PI
// (PIR-26: its period, null while the iterations are read → none); undefined otherwise (Write review… is offered).
export function ownReviewOf(comments: readonly WorkItemComment[] | undefined, feature: Pick<AzureWorkItem, 'state' | 'closedDate'>, period: ReviewPeriod | null, me: { email?: string; name?: string }, setup?: PiFormSetup): { comment: WorkItemComment; split: ReviewSplit } | undefined {
  if (!comments || !period) return undefined
  return editTargetOf(comments, me, (review) => reviewCountOf(review, feature, period).counts, setup)
}

// PIR-05, PIR-13: read one Feature's Discussion into PI Review's memory (the error kept for the drawer and the table).
// PIR-35: a Discussion being read already (the automatic read of my own Features, the drawer, Read all, Write review…)
// is not requested again — the caller waits for the same read; fresh (after a post or an edit) always reads anew.
const reading = new Map<string, Promise<void>>()
export function readDiscussionInto(config: AzureConfig, pat: string, item: Pick<AzureWorkItem, 'key' | 'id'>, { fresh = false, transport = requestAzure }: { fresh?: boolean; transport?: AzureTransport } = {}): Promise<void> {
  const from = discussionsFrom(), key = `${item.key}|${from}`
  const running = fresh ? undefined : reading.get(key)
  if (running) return running
  setDiscussion(item.key, { state: 'loading' })
  // PIR-33: only the comments on or after "PI Review starts from" are kept.
  const read = (async () => {
    try { const read = await readDiscussion(config, pat, item.id, transport), kept = commentsFrom(read.comments, from); setDiscussion(item.key, { state: 'done', comments: kept.comments, capped: read.capped, readAt: new Date().toISOString(), from, ignored: kept.ignored }) }
    catch (failure) { setDiscussion(item.key, { state: 'error', error: failure instanceof Error ? failure.message : 'Could not read the Discussion.' }); throw failure }
  })()
  reading.set(key, read)
  const done = () => { if (reading.get(key) === read) reading.delete(key) }
  read.then(done, done)
  return read
}
// PIR-35: the Features of a list that are mine — Assigned To by my work email, else my display name (isMine, as My PI
// Review and PIR-24); none when nothing is known about me.
export function ownFeatures<T extends Pick<AzureWorkItem, 'assignedTo' | 'assignedToEmail'>>(items: readonly T[], me: Me | undefined): T[] {
  return me && (me.email?.trim() || me.name?.trim()) ? items.filter((item) => isMine(item, me)) : []
}
// PIR-17, PIR-35: why the Discussions are not read from Azure DevOps on this page ('' when they are) — the same reasons on
// PI Review and My PI Review. Reading is allowed on an on-premises server (only writes are dev.azure.com only).
export function discussionReadBlock({ isSample, config, pat }: { isSample: boolean; config: AzureConfig | null; pat: string }): string {
  return isSample ? 'Synthetic sample data is loaded: the Discussions are not read from Azure DevOps.' : !config || !pat.trim() ? 'Connect the Time Writing connection (with its PAT) to read the Discussions.' : ''
}
// PIR-35: why PI Review does not read my own Features' Discussions by itself when it opens ('' when it does): the page
// cannot read (discussionReadBlock), View as (the person viewed as cannot edit their review here: read only), or who I
// am is not known (no work email or name). The drawer and Read all Discussions stay as they are.
export function ownReadBlock(viewer: { isSample: boolean; config: AzureConfig | null; pat: string; viewingAs: string }, me: Me | undefined): string {
  const page = discussionReadBlock(viewer)
  if (page) return page
  if (viewer.viewingAs) return `Viewing as ${viewer.viewingAs}: your own Features’ Discussions are not read by themselves.`
  if (!me?.email?.trim() && !me?.name?.trim()) return 'Who you are in Azure DevOps is not known: enter your work email on the Time Writing connection.'
  return ''
}
// PIR-17: the PI of a Feature (its Iteration Path's PI part), for the Move question's next PI.
export { piPathOf as featurePi } from './myWork.ts'

// PIR-17: my latest review — the newest comment written by me (author = my name, ignoring case) split by headings.
export function myReviewOf(comments: WorkItemComment[], name: string | undefined, setup?: PiFormSetup): { comment: WorkItemComment; split: ReviewSplit } | undefined {
  const me = name?.trim().toLowerCase()
  if (!me) return undefined
  for (const comment of comments) { // newest first
    if (comment.author.trim().toLowerCase() !== me) continue
    const split = reviewSplit(comment.text, setup)
    if (split.from === 'Headings') return { comment, split }
  }
  return undefined
}

// PIR-27: "No learnings or struggles" — one tick box for the built-in Learnings and Struggles fields of the form setup in
// use (not pre-ticked, UI-STANDARDS §12). Ticked, it sets them to "None" (written "None" under their headings, read back
// as "None") and disables their text boxes; unticked, it restores what was typed before. With one of them removed from
// the setup it sets only the other, and its label says so; with both removed there is no tick box.
export type NoneField = 'learnings' | 'struggles'
export const noneText = 'None'
export const noneFieldsOf = (setup: PiFormSetup): PiFormField[] => setup.fields.filter((field) => (field.id === 'learnings' || field.id === 'struggles') && field.type === 'longtext')
const lowerFirst = (text: string) => /^\p{Lu}\p{Ll}/u.test(text) ? text[0].toLowerCase() + text.slice(1) : text
export function noneChoice(setup: PiFormSetup): { label: string; help: string; fields: NoneField[] } | null {
  const fields = noneFieldsOf(setup)
  if (!fields.length) return null
  const ids = fields.map((field) => field.id as NoneField)
  if (fields.length === 2) return { label: `No ${lowerFirst(fields[0].label)} or ${lowerFirst(fields[1].label)}`, help: `Sets ${fields[0].label} and ${fields[1].label} to “${noneText}”.`, fields: ids }
  const missing = fields[0].id === 'learnings' ? 'Struggles' : 'Learnings'
  return { label: `No ${lowerFirst(fields[0].label)} (sets only ${fields[0].label}: ${missing} is not in this form)`, help: `Sets ${fields[0].label} to “${noneText}”.`, fields: ids }
}
export function withNoTexts(form: ReviewForm, setup: PiFormSetup, ticked: boolean): ReviewForm {
  const choice = noneChoice(setup)
  if (!choice) return form
  if (ticked) {
    if (form.noTexts) return form
    const saved = Object.fromEntries(choice.fields.map((id) => [id, form[id]])) as Partial<Record<NoneField, string>>
    return { ...form, ...Object.fromEntries(choice.fields.map((id) => [id, noneText])), noTexts: saved }
  }
  if (!form.noTexts) return form
  const { noTexts, ...rest } = form
  return { ...rest, ...Object.fromEntries(choice.fields.map((id) => [id, noTexts[id] ?? ''])) }
}

// PIR-26: when a review counts as Reviewed (product owner, 25 Nov 2026: "Use the Chosen PI instead of Current PI") — a
// review comment counts when (a) its date lies in the date span of the PI chosen in the page's PI filter (its PI-level
// iteration's dates, else the span of its Sprints' dates — piDates, as PIR-25), or (b) the Feature is Closed now and
// the comment is dated on or after its Closed Date (the review asked when closing it, PIR-18, is posted just before the
// Feature closes, so the days are compared). Dates are compared as UTC days, as the PIs are. A review that meets neither
// is Not reviewed, named by the PI whose dates cover it ("another PI" when none does). When the chosen PI has no dates
// (or the iterations are not read) every review counts, as before, and `note` says so.
type DaySpan = { path: string; start: string; finish: string }
export type ReviewPeriod = { pi: string; start: string; finish: string; spans: DaySpan[]; note: '' } | { pi: string; start?: undefined; note: string }
export const utcDay = (value: string | undefined) => { const time = Date.parse(value ?? ''); return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '' }
export function reviewPeriodOf(pi: string, iterations: readonly AzureIteration[] | null | undefined, { reading = false, problem = '' }: { reading?: boolean; problem?: string } = {}): ReviewPeriod {
  const every = 'every review comment counts as Reviewed, whatever its date'
  if (!pi) return { pi, note: '' }
  const label = piName(pi)
  if (!iterations) return { pi, note: reading ? '' : `The PI dates could not be read from Azure DevOps${problem ? ` (${problem.replace(/\.$/, '')})` : ''}: ${every}.` }
  const dates = piDates(iterations)
  const own = dates.get(pi.toLowerCase()) ?? [...dates.values()].find((entry) => piName(entry.path).toLowerCase() === label.toLowerCase())
  if (!own) return { pi, note: `${label} has no dates in Azure DevOps (neither its own nor its Sprints’): ${every}.` }
  return { pi, start: own.start, finish: own.finish, spans: [...dates.values()], note: '' }
}
export type ReviewCount = { counts: true; why: 'heading' | 'pi' | 'closed' | 'any' } | { counts: false; why: 'other'; otherPi: string }
// PIR-28: a review whose heading names the reviewed PI ("Learnings of PI 26.4:") counts for that PI whatever its date,
// and not for another one (unless the closed-Feature rule applies); without a PI in its headings the dates decide.
export function reviewCountOf(review: { date: string; reviewedPi?: string }, feature: Pick<AzureWorkItem, 'state' | 'closedDate'>, period: ReviewPeriod): ReviewCount {
  const day = utcDay(review.date)
  const closed = feature.state.trim().toLowerCase() === 'closed' ? utcDay(feature.closedDate) : ''
  const named = piText(review.reviewedPi ?? '')
  if (named && period.pi) {
    if (named.toLowerCase() === piText(piName(period.pi)).toLowerCase()) return { counts: true, why: 'heading' }
    if (day && closed && day >= closed) return { counts: true, why: 'closed' }
    return { counts: false, why: 'other', otherPi: named }
  }
  if (period.start == null) return { counts: true, why: 'any' }
  if (day && period.start <= day && day <= period.finish) return { counts: true, why: 'pi' }
  if (day && closed && day >= closed) return { counts: true, why: 'closed' }
  const covering = day ? period.spans.filter((span) => span.start <= day && day <= span.finish && piText(piName(span.path))).sort((a, b) => b.start.localeCompare(a.start)) : []
  return { counts: false, why: 'other', otherPi: covering[0] ? piName(covering[0].path) : '' }
}
// PIR-26: the hint of a review that does not count — "Last review 12 June 2026 (PI 2026.3)" or "(another PI)".
export const otherPiHint = (date: string, count: ReviewCount) => count.counts ? '' : `Last review ${formatDate(date)} (${count.otherPi || 'another PI'})`
// PIR-26: Write review… is still prefilled from the latest review; when that review does not count for the reviewed PI,
// the PI it was written for ("PI 2026.3", "another PI") — '' when it counts, or while the iterations are read.
export function prefilledOtherPi(comment: Pick<WorkItemComment, 'date'>, split: Pick<ReviewSplit, 'reviewedPi'> | undefined, feature: Pick<AzureWorkItem, 'state' | 'closedDate'>, reviewed: string, iterations: { list: readonly AzureIteration[] | null; reading?: boolean }): string {
  if (iterations.reading) return ''
  const count = reviewCountOf({ date: comment.date, reviewedPi: split?.reviewedPi }, feature, reviewPeriodOf(reviewed, iterations.list))
  return count.counts ? '' : count.otherPi || 'another PI'
}
