// PI Review (PIR-01…PIR-15): the PIs to choose from and the default one, the Features of a PI, the Discussions of
// those Features read from Azure DevOps and their latest comment split by its headings (or, without one, suggested by
// keywords) — kept in this page load's memory only (nothing is written to Git or IndexedDB; the only write to Azure
// DevOps is a review posted as a new comment, piReviewPost.ts, PIR-13).
import { currentIterationPairs, type AzureIteration } from './azureRead.ts'
import { laterPi, piName, piPathOf } from './myWork.ts'
import type { AzureWorkItem } from './domain'
import type { WorkItemComment } from './azureDevOps.ts'
import type { PiFormSetup } from './piReviewSetup.ts'

const lower = (value: string) => value.toLowerCase()
const isRemoved = (item: Pick<AzureWorkItem, 'state'>) => item.state.trim().toLowerCase() === 'removed'
export const samePi = (a: string | undefined, b: string | undefined) => Boolean(a && b && lower(a) === lower(b))
export const piLabel = (path: string) => piName(path)

// PIR-02: the PIs of the Time Writing connection's iteration tree and of the fetched QMS-0025 items (so the list works
// offline), merged ignoring letter case (the iteration tree's spelling first) and sorted newest first.
export function piOptions(iterations: AzureIteration[], items: Pick<AzureWorkItem, 'iterationPath'>[]): string[] {
  const found = new Map<string, string>()
  for (const path of [...iterations.map((iteration) => iteration.path), ...items.map((item) => item.iterationPath)]) {
    const pi = piPathOf(path)
    if (pi && !found.has(lower(pi))) found.set(lower(pi), pi)
  }
  return [...found.values()].sort((a, b) => laterPi(a, b) ? -1 : laterPi(b, a) ? 1 : a.localeCompare(b))
}

// PIR-02: the PI chosen when the page opens. The current PI by the Sprint dates (UTC, currentIterationPairs); two
// current PIs (overlapping) choose nothing; without the iterations (not read, or no dates covering today) the latest PI
// with Features, saying so.
export type PiDefault = { pi: string; why: 'current' | 'fallback'; note: string } | { pi: ''; why: 'overlap' | 'none'; note: string }
export function defaultPi(iterations: AzureIteration[] | null, items: Pick<AzureWorkItem, 'iterationPath' | 'workItemType' | 'state'>[], now = new Date(), readProblem = ''): PiDefault {
  if (iterations) {
    const current = new Map<string, string>()
    for (const pair of currentIterationPairs(iterations, now)) { const pi = piPathOf(pair.sprint.path) ?? piPathOf(pair.pi.path) ?? pair.pi.path; current.set(lower(pi), pi) }
    if (current.size === 1) return { pi: [...current.values()][0], why: 'current', note: '' }
    if (current.size > 1) return { pi: '', why: 'overlap', note: `${current.size} PIs are current at the same time (${[...current.values()].map(piLabel).join(', ')}): choose the PI to review.` }
  }
  const withFeatures = piOptions([], items.filter((item) => item.workItemType === 'Feature' && !isRemoved(item)))
  const reason = iterations ? 'No PI has Sprint dates covering today' : `The PIs could not be read from Azure DevOps${readProblem ? ` (${readProblem.replace(/\.$/, '')})` : ''}`
  if (!withFeatures.length) return { pi: '', why: 'none', note: `${reason}, and no fetched Feature is in a PI: choose a PI.` }
  return { pi: withFeatures[0], why: 'fallback', note: `${reason}: showing the latest PI with Features, ${piLabel(withFeatures[0])}.` }
}

// The Feature's Epic: the nearest Epic above it in the fetched data.
export function epicOf(items: AzureWorkItem[], item: AzureWorkItem, byId = new Map(items.map((entry) => [entry.id, entry]))) {
  const seen = new Set<number>()
  for (let current = item.parentId == null ? undefined : byId.get(item.parentId); current && !seen.has(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId)) {
    if (current.workItemType === 'Epic') return current
    seen.add(current.id)
  }
  return undefined
}

// PIR-03: the Features of a PI — a Feature whose Iteration Path is in the PI (ignoring letter case); with
// withStories also a Feature with a User Story (not Removed) in the PI. Removed Features and those under the absence
// Epic are left out (as the state checks do). Sorted by ID.
export function piFeatures(items: AzureWorkItem[], pi: string, { absenceEpicId, withStories = false }: { absenceEpicId?: number; withStories?: boolean } = {}): AzureWorkItem[] {
  if (!pi) return []
  const byId = new Map(items.map((item) => [item.id, item]))
  const underAbsence = (item: AzureWorkItem) => { if (absenceEpicId == null) return false; const seen = new Set<number>(); for (let current: AzureWorkItem | undefined = item; current && !seen.has(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId)) { if (current.id === absenceEpicId) return true; seen.add(current.id) } return false }
  const inPi = (item: AzureWorkItem) => samePi(piPathOf(item.iterationPath), pi)
  const storyFeatures = new Set(withStories ? items.filter((item) => item.workItemType === 'User Story' && !isRemoved(item) && item.parentId != null && inPi(item)).map((item) => item.parentId!) : [])
  return items.filter((item) => item.workItemType === 'Feature' && !isRemoved(item) && !underAbsence(item) && (inPi(item) || storyFeatures.has(item.id))).sort((a, b) => a.id - b.id)
}

// The Discussions read so far, by work item key, for this page load only (PIR-05, PIR-06): never stored.
export type Discussion = { state: 'loading' } | { state: 'done'; comments: WorkItemComment[]; capped: boolean; readAt: string } | { state: 'error'; error: string }
const discussions = new Map<string, Discussion>()
const listeners = new Set<() => void>()
let version = 0
export const discussionOf = (key: string) => discussions.get(key)
export const discussionsVersion = () => version
export function subscribeDiscussions(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function setDiscussion(key: string, value: Discussion | undefined) { if (value) discussions.set(key, value); else discussions.delete(key); version += 1; for (const listener of listeners) listener() }
export function clearDiscussions() { discussions.clear(); version += 1; for (const listener of listeners) listener() }

// PIR-06: read the Discussions of several Features, `concurrency` (3) at a time. When Azure DevOps asks to slow down
// (429, rateWait gives the Retry-After seconds) the read waits (at most 60 s) and tries that Feature once more; a second
// 429 stops the whole read, the rest left unread for the next run. A rejected PAT or refused access stops it too; any
// other error is kept for that Feature and the read goes on. Each result is handed over as it comes (kept by the caller).
export interface BulkReadResult { read: number; failed: number; unread: number[]; stopped: '' | 'rate-limit' | 'access' }
export async function readDiscussions<T>(ids: number[], read: (id: number) => Promise<T>, { concurrency = 3, rateWait, sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), onResult, onError, onProgress, maxWaitSeconds = 60 }: {
  concurrency?: number; rateWait: (failure: unknown) => number | null; sleep?: (ms: number) => Promise<void>
  onResult?: (id: number, value: T) => void; onError?: (id: number, failure: unknown) => void; onProgress?: (done: number, total: number) => void; maxWaitSeconds?: number
}): Promise<BulkReadResult> {
  const queue = [...ids], unread: number[] = []
  let done = 0, failed = 0, stopped: BulkReadResult['stopped'] = ''
  const accessProblem = (failure: unknown) => /PAT (was )?rejected|Access denied/i.test(failure instanceof Error ? failure.message : String(failure))
  async function worker() {
    while (queue.length && !stopped) {
      const id = queue.shift()!
      for (let attempt = 0; ; attempt += 1) {
        try { const value = await read(id); done += 1; onResult?.(id, value); break }
        catch (failure) {
          const wait = rateWait(failure)
          if (wait != null && attempt === 0 && !stopped) { await sleep(Math.min(Math.max(wait, 1), maxWaitSeconds) * 1000); if (!stopped) continue }
          if (wait != null || stopped) { stopped ||= 'rate-limit'; unread.push(id); break }
          if (accessProblem(failure)) { stopped = 'access'; unread.push(id); onError?.(id, failure); break }
          done += 1; failed += 1; onError?.(id, failure); break
        }
      }
      onProgress?.(done, ids.length)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, ids.length)) }, worker))
  return { read: done - failed, failed, unread: [...unread, ...queue].sort((a, b) => a - b), stopped }
}

// PIR-07: the latest comment of a Discussion — the newest by its date and time (an unreadable date counts as oldest; at
// the same time the higher comment ID), whoever wrote it.
export function latestComment(comments: WorkItemComment[]): WorkItemComment | undefined {
  const time = (comment: WorkItemComment) => { const value = Date.parse(comment.date); return Number.isFinite(value) ? value : -Infinity }
  let newest: WorkItemComment | undefined
  for (const comment of comments) if (!newest || time(comment) > time(newest) || (time(comment) === time(newest) && comment.id > newest.id)) newest = comment
  return newest
}

// PIR-08: a review comment split by its headings — Struggles, Learnings and Move to next PI, or one of their synonyms
// (headingWords). A heading counts only
//  (a) at the start of a line, after an optional bullet (- * • +), number (1. or 1)) or #, and optional bold (** __),
//      followed by a colon, a dash (- – —) and a space, or the end of the line; or
//  (b) anywhere in a line, not inside a word, when a colon follows it directly ("Struggles: … Learnings: … Move to next
//      PI: Yes"), or — for Struggle(s), Learning(s), Lesson(s) and Lessons learnt / learned only — a dash and a space
//      ("… a learning – book the rig early"); the line-start-only words (Next PI, Next time, Improve, Went well) never
//      count inside a line, so "planned for next PI: …" is no heading.
// Letter case is ignored; a "?" after the heading is allowed. A heading word in a sentence without a colon or a dash is
// not taken. Each section runs to the next heading or the end of the comment, its lines trimmed, a leading bullet
// (- * •) and empty lines dropped (line breaks kept); text before the first heading belongs to no section; a heading
// given twice (or two synonyms of one) has its texts joined. No heading: an empty result (see reviewSplit for the
// keyword fallback, PIR-11).
export type MoveValue = 'Yes' | 'No' | 'Partly'
// PIR-15: the advice whether to discuss the Feature during the Review meeting, normalized.
export const reviewModes = ['Discuss during Meeting', 'Offline Review'] as const
export type ReviewMode = typeof reviewModes[number]
// PIR-11: where the columns come from — the headings, the keywords (suggested) or nothing.
export type SplitFrom = 'Headings' | 'Keywords' | 'None'
// PIR-15: review (the Review meeting advice as written) with reviewMode (normalized), remarks (Additional Remarks).
// PIR-20: extra — the texts of the fields added in the PI Review form setup (by field id), read by their configured headings.
export interface ReviewSplit { struggles?: string; learnings?: string; move?: string; moveValue?: MoveValue; moveRest?: string; movePi?: string; review?: string; reviewMode?: ReviewMode; remarks?: string; extra?: Record<string, string>; from?: SplitFrom }
export type BuiltInSection = 'struggles' | 'learnings' | 'move' | 'review' | 'remarks'
const builtInSections: readonly string[] = ['struggles', 'learnings', 'move', 'review', 'remarks']
// A section is a built-in one or the id of a field added in the form setup (PIR-20).
type Section = string
// PIR-11: the sections the keyword fallback suggests.
type KeywordSection = 'struggles' | 'learnings' | 'move'
const gap = String.raw`[ \t]+`
// PIR-12: "of the Feature" after a heading word ("Learnings of the Feature", "Struggles of this feature").
const of = String.raw`(?:[ \t]+(?:of|for)[ \t]+(?:the|this)[ \t]+feature)?`
// PIR-12: the PI named in a Move heading ("… shifted to PI 26.4"), any number, so every review's next PI is read.
const piNumber = String.raw`pi(?:[ \t]*\d+(?:\.\d+)*)?`
// The heading words of each section, as regular expressions (longer forms first). `inline`: also counts inside a line
// with a colon; `dash`: also inside a line with a dash and a space.
const headingWords: { section: Section; pattern: string; inline: boolean; dash?: boolean }[] = [
  { section: 'struggles', pattern: `struggles?${of}`, inline: true, dash: true },
  { section: 'struggles', pattern: `what${gap}(?:didn['’]?t|did${gap}not)${gap}go${gap}well`, inline: true },
  { section: 'struggles', pattern: `what${gap}went${gap}wrong`, inline: true },
  { section: 'struggles', pattern: 'challenges?|issues?|problems?|blockers?|impediments?|risks?', inline: true },
  { section: 'struggles', pattern: `pain${gap}points?`, inline: true },
  { section: 'learnings', pattern: `(?:lessons?${gap}learn(?:t|ed)|lessons?|learnings?)${of}`, inline: true, dash: true },
  { section: 'learnings', pattern: String.raw`take[ \t-]?aways?|what${gap}went${gap}well|improvements?`, inline: true },
  { section: 'learnings', pattern: `went${gap}well|improve|next${gap}time`, inline: false },
  { section: 'move', pattern: `move[sd]?${gap}to${gap}(?:the${gap})?next${gap}pi|moving${gap}to${gap}(?:the${gap})?next${gap}pi|continue[sd]?${gap}in${gap}(?:the${gap})?next${gap}pi`, inline: true },
  { section: 'move', pattern: String.raw`spill[ \t-]?overs?|carry[ \t-]?overs?`, inline: true },
  // PIR-12: "Whether the feature needs to be (be) shifted to PI 26.4" (moved / carried over / pushed; "does the feature
  // need to be …"), the PI any number.
  { section: 'move', pattern: `(?:whether${gap}|does${gap})?(?:the${gap}|this${gap})?feature${gap}needs?${gap}to${gap}(?:be${gap})+(?:shifted|moved|carried(?:${gap}over)?|pushed|spilled(?:${gap}over)?)${gap}(?:to|into)${gap}(?:the${gap}next${gap})?${piNumber}`, inline: true },
  { section: 'move', pattern: `next${gap}pi`, inline: false },
  // PIR-15: "Advise to discuss the Feature during the Review meeting" (Advice / Advised; "in the Review meeting"), and
  // at a line start only the short forms "Review meeting", "Discuss in (the) meeting", "Review mode".
  { section: 'review', pattern: `advi[sc]e[sd]?${gap}to${gap}discuss(?:${gap}(?:the|this)${gap}feature)?(?:${gap}(?:during|in|at)${gap}(?:the${gap})?review${gap}meeting)?`, inline: true },
  { section: 'review', pattern: `review${gap}meeting|discuss(?:ed)?${gap}(?:in|during)${gap}(?:the${gap})?(?:review${gap})?meeting|review${gap}mode`, inline: false },
  // PIR-15: "Additional Remarks (If Any)", "Additional comments"; at a line start also "Remarks".
  { section: 'remarks', pattern: String.raw`additional${gap}(?:remarks?|comments?)(?:${gap}\(if${gap}any\))?`, inline: true },
  { section: 'remarks', pattern: String.raw`remarks?(?:${gap}\(if${gap}any\))?`, inline: false },
]
type HeadingWord = { section: Section; pattern: string; inline: boolean; dash?: boolean }
const bold = String.raw`(?:\*\*|__)?`
// PIR-12: the Move question at the start of a line answered on the same line after a space ("… shifted to PI 26.4 Yes,
// docs pending") — only when the answer starts with yes / no / partly / partially.
const moveQuestion = headingWords.find((word) => word.pattern.includes('whether'))!.pattern
const moveQuestionLine = new RegExp(String.raw`^[ \t]*(?:[-*•+]|\d{1,2}[.)]|#{1,6})?[ \t]*${bold}(${moveQuestion})[ \t]*\??[ \t]*${bold}[ \t]+(?=(?:yes|no|partly|partially)(?![\p{L}\p{N}]))`, 'gimu')
// PIR-19, PIR-20: the patterns of one list of heading words — the built-in ones (PIR-08, PIR-12, PIR-15), after the
// headings of the PI Review form setup when one is in use (so a configured heading wins where both would match).
interface HeadingPatterns { line: RegExp; inline: RegExp; dash: RegExp; tests: { section: Section; test: RegExp }[] }
function patternsOf(words: HeadingWord[]): HeadingPatterns {
  const names = (pick: (word: HeadingWord) => boolean | undefined) => `(${words.filter(pick).map((word) => word.pattern).join('|')})`
  return {
    line: new RegExp(String.raw`^[ \t]*(?:[-*•+]|\d{1,2}[.)]|#{1,6})?[ \t]*${bold}${names(() => true)}[ \t]*\??[ \t]*${bold}[ \t]*(?:(?::|[\-–—](?=[ \t]|\r?\n|$))[ \t]*${bold}|(?=\r?\n|$))`, 'gimu'),
    inline: new RegExp(String.raw`(?<![\p{L}\p{N}])${bold}${names((word) => word.inline)}[ \t]*\??[ \t]*${bold}[ \t]*:[ \t]*${bold}`, 'giu'),
    dash: new RegExp(String.raw`(?<![\p{L}\p{N}])${bold}${names((word) => word.dash)}[ \t]*\??[ \t]*${bold}[ \t]*[\-–—][ \t]+${bold}`, 'giu'),
    tests: words.map((word) => ({ section: word.section, test: new RegExp(`^(?:${word.pattern})$`, 'iu') })),
  }
}
const builtInPatterns = patternsOf(headingWords)
// PIR-21: the built-in section a heading text is read as on its own ("Issues" → struggles), or undefined — the form
// setup refuses a heading that older reviews already use for another field.
export function builtInSectionOf(heading: string): BuiltInSection | undefined {
  const name = heading.trim().replace(/[ \t]*\?$/, '')
  return builtInPatterns.tests.find((entry) => entry.test.test(name))?.section as BuiltInSection | undefined
}
// PIR-19: a configured heading as a pattern — its words matched as written (letter case ignored, any spaces between
// them); "{PI}" in the Move heading stands for the PI ("PI 26.5", "the next PI").
export const piPlaceholder = '{PI}'
export function headingPattern(heading: string): string {
  const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, `['’]`))
  const parts = heading.trim().split(piPlaceholder)
  return parts.flatMap((part, index) => [...words(part), ...(index < parts.length - 1 ? [`(?:the${gap}next${gap})?${piNumber}`] : [])]).join(gap)
}
// The patterns for a form setup, made once per set of headings.
const setupPatterns = new Map<string, HeadingPatterns>()
function patternsFor(setup: PiFormSetup | undefined): HeadingPatterns {
  if (!setup) return builtInPatterns
  const configured: HeadingWord[] = setup.fields.filter((field) => field.heading.trim()).map((field) => ({ section: field.id, pattern: headingPattern(field.heading), inline: true }))
  const key = JSON.stringify(configured)
  let found = setupPatterns.get(key)
  if (!found) { found = patternsOf([...configured, ...headingWords]); if (setupPatterns.size > 20) setupPatterns.clear(); setupPatterns.set(key, found) }
  return found
}
const tidy = (text: string) => text.split(/\r?\n/).map((line) => line.trim().replace(/^(?:[-*•]|\d{1,2}[.)])\s+/, '')).filter(Boolean).join('\n')
// The Move value: the text starts with yes / y, no / n or partly / partially / partial (any case), followed by the end,
// a space or punctuation (so "N/A", "Not decided" and "Nothing" give no value).
const moveStart = /^(yes|y|no|n|partly|partially|partial)(?=$|[\s.,;:!)—–-])[\s.,;:!)—–-]*/i
const moveValueOf = (word: string): MoveValue => word.toLowerCase().startsWith('y') ? 'Yes' : word.toLowerCase().startsWith('p') ? 'Partly' : 'No'
// PIR-15: the Review meeting advice normalized — "Discuss during Meeting" (also "discuss …", "in the meeting", "meeting",
// "yes") or "Offline Review" (also "offline …", "no"); otherwise none (shown as written).
export function reviewModeOf(text: string | undefined): ReviewMode | undefined {
  const value = (text ?? '').trim().toLowerCase()
  if (/^(?:discuss|(?:in|during)\s+(?:the\s+)?(?:review\s+)?meeting|meeting|yes)(?![\p{L}\p{N}])/u.test(value)) return 'Discuss during Meeting'
  if (/^(?:offline|no)(?![\p{L}\p{N}])/u.test(value)) return 'Offline Review'
  return undefined
}
// PIR-14: the footer line of a review posted from this app ("— posted from Demand Planning (PI Review)"); dropped before
// the comment is split, so it never lands in a section.
export const reviewFooter = '— posted from Demand Planning (PI Review)'
const footerLine = /^[ \t]*[—–-]+[ \t]*posted[ \t]+from[ \t]+demand[ \t]+planning\b[^\n]*$/gimu
export const withoutFooter = (text: string) => text.replace(footerLine, '')
// PIR-14: a section's lines as the split gives them back (trimmed, a leading bullet or number dropped, no empty lines).
export const tidyReviewText = (text: string) => tidy(text)
function byHeadings(text: string, setup?: PiFormSetup): { split: ReviewSplit; found: boolean } {
  text = withoutFooter(text)
  const patterns = patternsFor(setup)
  const sectionOf = (name: string): Section => patterns.tests.find((entry) => entry.test.test(name))?.section ?? 'struggles'
  const found = new Map<number, { section: Section; start: number; end: number; pi?: string }>()
  for (const pattern of [patterns.line, moveQuestionLine, patterns.inline, patterns.dash]) {
    pattern.lastIndex = 0
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const at = match.index + match[0].toLowerCase().indexOf(match[1].toLowerCase())
      if (!found.has(at)) found.set(at, { section: sectionOf(match[1]), start: match.index, end: match.index + match[0].length, pi: /\bpi[ \t]*(\d+(?:\.\d+)*)/i.exec(match[1])?.[1] })
    }
  }
  // A heading inside another (e.g. "went well" in "What went well:") is dropped: the first, longest one counts.
  const headings: { section: Section; start: number; end: number; pi?: string }[] = []
  for (const heading of [...found.values()].sort((a, b) => a.start - b.start || b.end - a.end)) if (!headings.length || heading.start >= headings[headings.length - 1].end) headings.push(heading)
  const split: ReviewSplit = {}
  headings.forEach((heading, index) => {
    const body = tidy(text.slice(heading.end, headings[index + 1]?.start ?? text.length))
    // PIR-20: a field added in the form setup has its text under extra, by its id.
    if (body && builtInSections.includes(heading.section)) { const section = heading.section as BuiltInSection; split[section] = split[section] ? `${split[section]}\n${body}` : body }
    else if (body) { const extra = split.extra ??= {}; extra[heading.section] = extra[heading.section] ? `${extra[heading.section]}\n${body}` : body }
    if (heading.section === 'move' && heading.pi) split.movePi = `PI ${heading.pi}`
  })
  if (split.move) {
    const match = moveStart.exec(split.move)
    if (match) { split.moveValue = moveValueOf(match[1]); split.moveRest = split.move.slice(match[0].length).trim() }
  }
  const mode = reviewModeOf(split.review)
  if (mode) split.reviewMode = mode
  return { split, found: headings.length > 0 }
}
// setup (PIR-19): the PI Review form setup in use — its headings are read besides the built-in ones.
export function splitReviewComment(text: string | undefined, setup?: PiFormSetup): ReviewSplit {
  return text ? byHeadings(text, setup).split : {}
}

// PIR-11: the keywords that suggest a column when the comment has no heading at all — built in, one list to change
// later. Matched case-insensitively as whole words (a single word also with a plural "s" / "es"); a trailing * matches
// any ending ("escalat*": escalate, escalated, escalation); a space matches any spaces; ' matches ' and ’.
export const reviewKeywords: Record<KeywordSection, readonly string[]> = {
  struggles: ['blocked', 'blocker', 'delay', 'delayed', 'issue', 'problem', 'risk', 'escalat*', 'dependency', 'dependencies', 'waiting', 'rework', 'missed', 'slipped', 'could not', "couldn't", 'unable', 'late', 'impediment', 'struggle*', 'challeng*'],
  learnings: ['learned', 'learnt', 'lesson', 'next time', 'improve*', 'went well', 'worked well', 'better to', 'recommend', 'should have', 'takeaway', 'learning'],
  move: ['carry over', 'carryover', 'next PI', 'spill*', 'move to', 'moving to', 'continue in'],
}
const keywordSource = (keyword: string) => {
  const wild = keyword.endsWith('*'), word = (wild ? keyword.slice(0, -1) : keyword).trim()
  const body = word.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, `['’]`)).join(String.raw`[ \t]+`)
  return `${body}${wild ? String.raw`[\p{L}\p{N}]*` : /\s/.test(word) ? '' : '(?:s|es)?'}`
}
const sections: KeywordSection[] = ['struggles', 'learnings', 'move']
const keywordPatterns = new Map(sections.map((section) => [section, new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${reviewKeywords[section].map(keywordSource).join('|')})(?![\p{L}\p{N}])`, 'giu')]))
// A negation just before the keyword (at most two words between): "no blocker", "no major issues", "not blocked",
// "wasn't late" are not taken.
const negated = /(?:^|[^\p{L}\p{N}'’])(?:no|not|never|without|none|nor|\p{L}+n['’]t)(?:[ \t]+[\p{L}\p{N}'’-]+){0,2}[ \t]+$/iu
// The sentences of a comment: by line, then after ". ! ?" and a space; a leading bullet dropped.
export const reviewSentences = (text: string) => text.split(/\r?\n/).flatMap((line) => line.trim().replace(/^[-*•]\s+/, '').split(/(?<=[.!?])[ \t]+(?=\S)/)).map((sentence) => sentence.trim()).filter(Boolean)
// The Move value of a suggested Move sentence: only when, after the move phrase (and "over", "to", "the", "next PI"),
// it says yes, no, partly or partially followed by punctuation or the end ("Spill over to next PI — partly, the docs").
const keywordMoveValue = /^(?:[ \t]+(?:over|to|into|in|the|next|pi))*[ \t]*[:,\-–—]?[ \t]*(yes|no|partly|partially)[ \t]*(?:$|[.,;:!—–-])[ \t.,;:!—–-]*/i
function keywordIn(section: KeywordSection, sentence: string) {
  const pattern = keywordPatterns.get(section)!
  pattern.lastIndex = 0
  for (let match = pattern.exec(sentence); match; match = pattern.exec(sentence)) if (!negated.test(sentence.slice(0, match.index))) return match
  return null
}
// PIR-11: the keyword fallback — each sentence goes to every column whose keyword it holds (not negated), its sentences
// joined with line breaks. The Move value only when there is one Move sentence and it says so right after the phrase.
export function splitByKeywords(text: string | undefined): ReviewSplit {
  if (!text) return {}
  const split: ReviewSplit = {}
  const moves: { sentence: string; end: number }[] = []
  for (const sentence of reviewSentences(text)) {
    for (const section of sections) {
      const match = keywordIn(section, sentence)
      if (!match) continue
      split[section] = split[section] ? `${split[section]}\n${sentence}` : sentence
      if (section === 'move') moves.push({ sentence, end: match.index + match[0].length })
    }
  }
  if (moves.length === 1) {
    const { sentence, end } = moves[0]
    const value = keywordMoveValue.exec(sentence.slice(end))
    if (value) { split.moveValue = moveValueOf(value[1]); split.moveRest = sentence.slice(end + value[0].length).trim() }
  }
  return split
}
// PIR-08, PIR-11: the split shown — by the headings when the comment has at least one; otherwise suggested from the
// keywords; "None" when neither fills a column.
export function reviewSplit(text: string | undefined, setup?: PiFormSetup): ReviewSplit & { from: SplitFrom } {
  if (!text) return { from: 'None' }
  const headings = byHeadings(text, setup)
  if (headings.found) return { ...headings.split, from: 'Headings' }
  const suggested = splitByKeywords(text)
  return { ...suggested, from: suggested.struggles || suggested.learnings || suggested.move ? 'Keywords' : 'None' }
}
// PIR-08: Move to next PI as shown — "Yes — waiting for vendor" with a value, otherwise the text as written.
// PIR-12: the PI the comment names ("… shifted to PI 26.4") follows as " · to PI 26.4".
export const moveLabel = (split: ReviewSplit) => { const base = split.moveValue ? `${split.moveValue}${split.moveRest ? ` — ${split.moveRest}` : ''}` : split.move ?? ''; return base && split.movePi ? `${base} · to ${split.movePi}` : base }
// PIR-15: the Review meeting advice as shown — the normalized value, otherwise the text as written.
export const reviewModeLabel = (split: ReviewSplit) => split.reviewMode ?? split.review ?? ''
// PIR-09: one line for a table cell — the line breaks as " · ".
export const oneLine = (text: string | undefined) => (text ?? '').split(/\n+/).map((line) => line.trim()).filter(Boolean).join(' · ')
