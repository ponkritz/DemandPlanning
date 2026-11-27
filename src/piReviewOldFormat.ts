// PI Review, old-format comments (PIR-75…PIR-78, temporary — LIM-235): a few people wrote their PI review before the
// heading "Feature Review for PI …" existed (PIR-48), as "Struggles / Learnings / Moving to next PI". Such a comment
// is NOT a review (PIR-49, PIR-50 stay strict): it is only found, flagged "Old format — convert" and, by its author,
// converted — the review form prefilled from it, saved as an edit of that same comment in the app's format.
// One switch for the whole mechanism: set oldFormatSearch to false (or remove this file and its callers) when everyone
// has converted.
import { reviewHeadingIn } from './piReview.ts'
import { isOwnComment, reviewPageBlock, reviewPostBlock, type ReviewFeature, type ReviewForm, type ReviewViewer } from './piReviewPost.ts'
import { fieldOf, type PiFormSetup } from './piReviewSetup.ts'
import { commentText } from './workItemEdit.ts'
import type { WorkItemComment } from './azureDevOps.ts'

// PIR-78 (product owner, 26 Nov 2026: "for the time being"): the temporary mechanism is on while this is true.
export const oldFormatSearch = true
export const oldFormatLabel = 'Old format — convert'
export const oldFormatNote = 'Old format: written as “Struggles / Learnings / Moving to next PI” without the heading “Feature Review for PI …”, so it does not count as a PI review. Its author can Convert… it: the review form opens prefilled from it, and saving replaces that comment in the review format (headed “Feature Review for” the PI chosen), so it then counts. Temporary, until every old-format review is converted.'

export type OldSection = 'struggles' | 'learnings' | 'move'
type Section = OldSection | 'remarks'
// PIR-75: the section headings — Struggle(s), Learning(s), Move / Moving / Moved to (the) next PI, and, for the text that
// goes to Additional Remarks, (Additional) Remarks / Comments / Notes; an optional "of / for (the) PI 26.4" after them.
const words: { section: Section; pattern: string }[] = [
  { section: 'struggles', pattern: 'struggles?' },
  { section: 'learnings', pattern: 'learnings?' },
  { section: 'move', pattern: String.raw`(?:move[sd]?|moving)[ \t]+to[ \t]+(?:the[ \t]+)?next[ \t]+pi` },
  { section: 'remarks', pattern: String.raw`(?:additional[ \t]+)?(?:remarks?|comments?|notes?)` },
]
const ofPi = String.raw`(?:[ \t]+(?:of|for|in)[ \t]+(?:the[ \t]+)?pi[ \t]*[._-]?[ \t]*\d+(?:\.\d+)*)?`
const bold = String.raw`(?:\*\*|__)?`
const names = `(${words.map((word) => word.pattern).join('|')})`
// At the start of a line (after a bullet, number or #, and bold): followed by a colon, a dash and a space, or the end of
// the line. Inside a line (not inside a word): followed by a colon only — Remarks, Comments and Notes never inside a line.
const atLineStart = new RegExp(String.raw`^[ \t]*(?:[-*•+▪◦]|\d{1,2}[.)]|#{1,6})?[ \t]*${bold}[ \t]*${names}${ofPi}[ \t]*\??[ \t]*${bold}[ \t]*(?:(?::|[\-–—](?=[ \t]|$))[ \t]*${bold}|$)`, 'gimu')
const insideLine = new RegExp(String.raw`(?<![\p{L}\p{N}])${bold}(${words.filter((word) => word.section !== 'remarks').map((word) => word.pattern).join('|')})${ofPi}[ \t]*\??[ \t]*${bold}[ \t]*:[ \t]*${bold}`, 'giu')
const tests = words.map((word) => ({ section: word.section, test: new RegExp(`^(?:${word.pattern})$`, 'iu') }))
const sectionOf = (name: string): Section => tests.find((entry) => entry.test.test(name.replace(/[ \t]+/g, ' ')))?.section ?? 'remarks'

// PIR-81: a line that says whether the Feature moves to the next PI — Yes ("needs to be shifted / moved / carried forward /
// pushed / spills over to PI.27.1 / to the next PI") or No ("not / will not / no need to be shifted …", "no shift"); the
// target PI in any form (PI 27.1, PI.27.1, PI-2027.1). Only a whole sentence about moving counts, never a mere mention.
const moveVerb = String.raw`(?:shift(?:ed|ing)?|mov(?:e|ed|ing)|carr(?:y|ied|ying)[ \t]+(?:forward|over)|push(?:ed)?|spill(?:s|ed)?[ \t]+over|roll(?:ed)?[ \t]+over)`
const moveTarget = String.raw`(?:to|into)[ \t]+(?:the[ \t]+)?(?:next[ \t]+pi\b|pi[ \t]*[._-]?[ \t]*\d+(?:\.\d+)+)`
const moveNo = new RegExp(String.raw`\b(?:not|never|no[ \t]+need[ \t]+to|won'?t|will[ \t]+not|does[ \t]+not[ \t]+need[ \t]+to|doesn'?t[ \t]+need[ \t]+to)[ \t]+(?:be[ \t]+)?${moveVerb}\b|\bno[ \t]+(?:shift|move|carry[ \t]*over|spill[ \t]*over)\b`, 'iu')
const moveYes = new RegExp(String.raw`\b${moveVerb}[ \t]+${moveTarget}`, 'iu')
export function moveSentenceOf(line: string): { value: 'Yes' | 'No'; text: string } | undefined {
  const text = line.trim()
  if (!text || text.length > 400) return undefined
  if (moveNo.test(text)) return { value: 'No', text }
  if (moveYes.test(text)) return { value: 'Yes', text }
  return undefined
}

// The comment as plain lines: Azure DevOps HTML (<div>, <p>, <br>, <li>, <b>, entities) as text (commentText), Unicode
// and non-breaking spaces as spaces, zero-width marks dropped, runs of spaces collapsed.
const looksHtml = (text: string) => /<\/?[a-z][^>]*>|&(?:nbsp|amp|lt|gt|#\d+|#x[0-9a-f]+);/i.test(text)
export function plainLines(text: string): string {
  return (looksHtml(text) ? commentText(text) : text).normalize('NFKC').replace(/[​-‍⁠﻿­]/g, '').replace(/[  -   　]/g, ' ')
    .split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, ' ').trim()).join('\n')
}

// PIR-75, PIR-76: what an old-format comment says — the text under each heading (lines trimmed, a leading bullet or
// number dropped, empty lines dropped), the Move answer (Yes / No / Partly, and the rest as its reason), and the rest —
// text before the first heading and under Remarks / Comments / Notes — for Additional Remarks.
export type OldFormat = { sections: OldSection[]; struggles: string; learnings: string; move: string; moveValue?: 'Yes' | 'No' | 'Partly'; moveReason: string; remarks: string }
const tidy = (text: string) => text.split('\n').map((line) => line.trim().replace(/^(?:[-*•+▪◦]|\d{1,2}[.)])[ \t]+/, '')).filter(Boolean).join('\n')
const moveStart = /^(yes|y|no|n|partly|partially|partial)(?=$|[\s.,;:!)—–-])[\s.,;:!)—–-]*/i
const cache = new Map<string, OldFormat | null>()
// PIR-75: a Discussion comment is in the old format when it does NOT start with the review heading ("Feature Review for
// PI …", PIR-49) and has at least two of the headings Struggles, Learnings and Moving to next PI (any order, letter case,
// singular or plural, Move / Moving / Moved, an optional colon or "of PI 26.4"); undefined otherwise.
export function oldFormatOf(text: string | undefined): OldFormat | undefined {
  if (!text?.trim()) return undefined
  const known = cache.get(text)
  if (known !== undefined) return known ?? undefined
  const found = reviewHeadingIn(text) ? null : parse(plainLines(text))
  if (cache.size > 2000) cache.clear()
  cache.set(text, found)
  return found ?? undefined
}
function parse(text: string): OldFormat | null {
  const hits = new Map<number, { section: Section; start: number; end: number }>()
  for (const pattern of [atLineStart, insideLine]) {
    pattern.lastIndex = 0
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (!match[0]) { pattern.lastIndex += 1; continue }
      const at = match.index + match[0].toLowerCase().indexOf(match[1].toLowerCase())
      if (!hits.has(at)) hits.set(at, { section: sectionOf(match[1]), start: match.index, end: match.index + match[0].length })
    }
  }
  const headings: { section: Section; start: number; end: number }[] = []
  for (const hit of [...hits.values()].sort((a, b) => a.start - b.start || b.end - a.end)) if (!headings.length || hit.start >= headings[headings.length - 1].end) headings.push(hit)
  if (!headings.length) return null
  const parts: Record<Section, string[]> = { struggles: [], learnings: [], move: [], remarks: [] }
  const before = tidy(text.slice(0, headings[0].start))
  if (before) parts.remarks.push(before)
  headings.forEach((heading, index) => { const body = tidy(text.slice(heading.end, headings[index + 1]?.start ?? text.length)); if (body) parts[heading.section].push(body) })
  // PIR-81: a sentence that says the Feature moves — "Feature needs to be shifted to PI.27.1", "to be moved to the next PI",
  // "carried forward to PI 27.1", "will not be shifted" — is the Move answer wherever it stands (also without a Moving to
  // next PI heading, then it counts as that section); it is taken out of the section it was written under.
  let sentence: { value: 'Yes' | 'No'; text: string } | undefined
  for (const section of ['struggles', 'learnings', 'remarks'] as const) {
    parts[section] = parts[section].map((body) => body.split('\n').filter((line) => {
      const found = moveSentenceOf(line)
      if (!found) return true
      sentence ??= found
      return false
    }).join('\n').trim()).filter(Boolean)
  }
  const sections = (['struggles', 'learnings', 'move'] as const).filter((section) => headings.some((heading) => heading.section === section) || (section === 'move' && Boolean(sentence)))
  if (sections.length < 2) return null
  if (sentence && !parts.move.length) parts.move.push(`${sentence.value} — ${sentence.text}`)
  const move = parts.move.join('\n')
  const answer = moveStart.exec(move)
  const moveValue = answer ? (answer[1].toLowerCase().startsWith('y') ? 'Yes' : answer[1].toLowerCase().startsWith('p') ? 'Partly' : 'No') : undefined
  return { sections, struggles: parts.struggles.join('\n'), learnings: parts.learnings.join('\n'), move, ...(moveValue ? { moveValue } : {}), moveReason: answer ? move.slice(answer[0].length).trim() : move, remarks: parts.remarks.join('\n') }
}
export const isOldFormat = (comment: Pick<WorkItemComment, 'text'>) => Boolean(oldFormatOf(comment.text))
// PIR-75: the old-format comments of a Discussion, newest first.
export const oldFormatComments = <T extends Pick<WorkItemComment, 'text' | 'date' | 'id'>>(comments: readonly T[] | undefined): T[] =>
  oldFormatSearch && comments ? comments.filter(isOldFormat).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id) : []

// PIR-76: the form prefilled from an old-format comment — Struggles, Learnings, Move to next PI (Yes / No; Partly or no
// answer leaves it to choose) and its reason mapped to the form's fields; the rest to Additional Remarks. With No, the
// reason (not posted with No, PIR-13) is kept in Additional Remarks as "Why it does not move: …". A text whose field is
// not in the form setup in use goes to Additional Remarks too (to Learnings when the setup has no Additional Remarks).
export function oldFormatForm(old: OldFormat, base: ReviewForm, setup: PiFormSetup): ReviewForm {
  const has = (id: string) => Boolean(fieldOf(setup, id))
  const rest: string[] = []
  const form: ReviewForm = { ...base }
  delete form.noTexts
  for (const [id, text, label] of [['struggles', old.struggles, 'Struggles'], ['learnings', old.learnings, 'Learnings']] as const) {
    if (has(id)) form[id] = text
    else if (text) rest.push(`${label} — ${text}`)
  }
  form.move = old.moveValue === 'Yes' || old.moveValue === 'No' ? old.moveValue : ''
  form.moveReason = old.moveValue === 'Yes' ? old.moveReason : ''
  if (old.moveValue !== 'Yes' && old.moveReason) rest.push(old.moveValue === 'No' ? `Why it does not move — ${old.moveReason}` : `${old.moveValue ? `${old.moveValue} — ` : ''}${old.moveReason}`)
  const remarks = [old.remarks, ...rest].filter(Boolean).join('\n')
  if (has('remarks')) form.remarks = remarks
  else if (remarks) form.learnings = [form.learnings, remarks].filter(Boolean).join('\n')
  return form
}

// PIR-77: who may convert an old-format comment ('' when the viewer may) — only its author (Azure DevOps lets only the
// author edit a comment); then the page's reasons (View as, sample data, no PAT, on premises) and the review rights of
// the Feature (CON-113; PIR-70: also the Product Owner of its Epic — My Epics on My PI Review), as Edit review….
export function convertBlock(viewer: ReviewViewer, feature: ReviewFeature, comment: Pick<WorkItemComment, 'author' | 'authorEmail'>, me: { email?: string; name?: string }): string {
  if (!isOwnComment(comment, me)) return `Only ${comment.author.trim() || 'its author'} can convert their comment: Azure DevOps lets only the author edit a comment.`
  return reviewPageBlock(viewer) || reviewPostBlock(viewer, feature)
}
// PIR-77: the comment Convert… works on for a Feature — the viewer's newest old-format comment, else the newest one (its
// author named in the reason); undefined without one.
export function convertTargetOf<T extends Pick<WorkItemComment, 'text' | 'date' | 'id' | 'author' | 'authorEmail'>>(comments: readonly T[] | undefined, me: { email?: string; name?: string }): T | undefined {
  const old = oldFormatComments(comments)
  return old.find((comment) => isOwnComment(comment, me)) ?? old[0]
}

// PIR-78: Search — the comments of the Discussions read whose text holds every word typed (letter case ignored), newest
// first, each with its Feature; at most `limit`.
export type SearchHit<T> = { item: T; comment: WorkItemComment; old: boolean }
export function searchComments<T>(entries: readonly { item: T; comments: readonly WorkItemComment[] }[], query: string, limit = 500): { hits: SearchHit<T>[]; more: boolean } {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return { hits: [], more: false }
  const hits: SearchHit<T>[] = []
  for (const { item, comments } of entries) for (const comment of comments) {
    const text = `${comment.text}\n${comment.author}`.toLowerCase()
    if (terms.every((term) => text.includes(term))) hits.push({ item, comment, old: isOldFormat(comment) })
  }
  hits.sort((a, b) => b.comment.date.localeCompare(a.comment.date) || b.comment.id - a.comment.id)
  return { hits: hits.slice(0, limit), more: hits.length > limit }
}
