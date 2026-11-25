// PI Review (PIR-01…PIR-10): the PIs to choose from and the default one, the Features of a PI, the Discussions of
// those Features read from Azure DevOps and their latest comment split by its headings — kept in this page load's
// memory only (nothing is written to Git, IndexedDB or Azure DevOps).
import { currentIterationPairs, type AzureIteration } from './azureRead.ts'
import { laterPi, piName, piPathOf } from './myWork.ts'
import type { AzureWorkItem } from './domain'
import type { WorkItemComment } from './azureDevOps.ts'

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

// PIR-08: a review comment split by its headings — Struggles, Learnings and Move to next PI. A heading counts only
//  (a) at the start of a line, after an optional bullet (- * • +), number (1. or 1)) or #, and optional bold (** __),
//      followed by a colon, a dash and a space, or the end of the line; or
//  (b) anywhere in a line when a colon follows it directly ("Struggles: … Learnings: … Move to next PI: Yes"), not
//      inside a word; the bare "Next PI" counts only at the start of a line (a), so "planned for next PI: …" is no heading.
// Letter case is ignored; singular and plural (Struggle(s), Learning(s)); Move / Moved / Moves to (the) next PI and
// Next PI; a "?" after the heading is allowed. A heading word in a sentence without a colon is not taken. Each section
// runs to the next heading or the end of the comment, its lines trimmed, a leading bullet (- * •) and empty lines
// dropped (line breaks kept);
// text before the first heading belongs to no section; a heading given twice has its texts joined. No heading: an
// empty result (the whole comment is shown only).
export type MoveValue = 'Yes' | 'No' | 'Partly'
export interface ReviewSplit { struggles?: string; learnings?: string; move?: string; moveValue?: MoveValue; moveRest?: string }
type Section = 'struggles' | 'learnings' | 'move'
const headingNames = String.raw`(struggles?|learnings?|move[sd]?[ \t]+to[ \t]+(?:the[ \t]+)?next[ \t]+pi|next[ \t]+pi)`
const bold = String.raw`(?:\*\*|__)?`
const lineHeading = new RegExp(String.raw`^[ \t]*(?:[-*•+]|\d{1,2}[.)]|#{1,6})?[ \t]*${bold}${headingNames}[ \t]*\??[ \t]*${bold}[ \t]*(?:(?::|[\-–—](?=[ \t]|\r?\n|$))[ \t]*${bold}|(?=\r?\n|$))`, 'gimu')
const inlineHeading = new RegExp(String.raw`(?<![\p{L}\p{N}])${bold}(struggles?|learnings?|move[sd]?[ \t]+to[ \t]+(?:the[ \t]+)?next[ \t]+pi)[ \t]*\??[ \t]*${bold}[ \t]*:[ \t]*${bold}`, 'giu')
const sectionOf = (name: string): Section => /^struggle/i.test(name) ? 'struggles' : /^learning/i.test(name) ? 'learnings' : 'move'
const tidy = (text: string) => text.split(/\r?\n/).map((line) => line.trim().replace(/^[-*•]\s+/, '')).filter(Boolean).join('\n')
// The Move value: the text starts with yes / y, no / n or partly / partially / partial (any case), followed by the end,
// a space or punctuation (so "N/A", "Not decided" and "Nothing" give no value).
const moveStart = /^(yes|y|no|n|partly|partially|partial)(?=$|[\s.,;:!)—–-])[\s.,;:!)—–-]*/i
export function splitReviewComment(text: string | undefined): ReviewSplit {
  if (!text) return {}
  const found = new Map<number, { section: Section; start: number; end: number }>()
  for (const pattern of [lineHeading, inlineHeading]) {
    pattern.lastIndex = 0
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const at = match.index + match[0].toLowerCase().indexOf(match[1].toLowerCase())
      if (!found.has(at)) found.set(at, { section: sectionOf(match[1]), start: match.index, end: match.index + match[0].length })
    }
  }
  const headings = [...found.values()].sort((a, b) => a.start - b.start)
  const split: ReviewSplit = {}
  headings.forEach((heading, index) => {
    const body = tidy(text.slice(heading.end, headings[index + 1]?.start ?? text.length))
    if (body) split[heading.section] = split[heading.section] ? `${split[heading.section]}\n${body}` : body
  })
  if (split.move) {
    const match = moveStart.exec(split.move)
    if (match) {
      const word = match[1].toLowerCase()
      split.moveValue = word.startsWith('y') ? 'Yes' : word.startsWith('p') ? 'Partly' : 'No'
      split.moveRest = split.move.slice(match[0].length).trim()
    }
  }
  return split
}
// PIR-08: Move to next PI as shown — "Yes — waiting for vendor" with a value, otherwise the text as written.
export const moveLabel = (split: ReviewSplit) => split.moveValue ? `${split.moveValue}${split.moveRest ? ` — ${split.moveRest}` : ''}` : split.move ?? ''
// PIR-09: one line for a table cell — the line breaks as " · ".
export const oneLine = (text: string | undefined) => (text ?? '').split(/\n+/).map((line) => line.trim()).filter(Boolean).join(' · ')
