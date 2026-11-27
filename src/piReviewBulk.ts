import { shownDateOf, type WorkItemComment } from './azureDevOps.ts'
// PIR-36, PIR-37: one PI review for several Features at once (My PI Review) — which ticked Features can take it, what
// happens to each (a new comment, or my own review of the chosen PI replaced, as Write review… and Edit review… do), and
// the one background job that writes them, a failure on one not stopping the others.
// PIR-82…PIR-84: the per-Feature grid — the paragraphs once for all, Move to next PI, Reason and the choices per Feature,
// each row started from that Feature's review; the preview (Post / Replace / Unchanged / Blocked); the writes 3 at a
// time with Retry failed.
import type { AzureWorkItem } from './domain'
import { latestReviewFor, piLabel, piOptions, readDiscussions, reviewSplit, type Discussion } from './piReview.ts'
import { buildReviewComment, featurePi, fieldValue, isOwnComment, nextPiOf, ownReviewOf, piText, reviewFormFrom, reviewFormProblems, reviewPeriodOf, withFieldValue, type NextPi, type ReviewForm, type ReviewMove } from './piReviewPost.ts'
import { oldFormatComments, oldFormatForm, oldFormatOf } from './piReviewOldFormat.ts'
import { commentText } from './workItemEdit.ts'
import { builtInFormSetup, type PiFormSetup } from './piReviewSetup.ts'
import { notBeforeStart, piCutoff, reviewStartOf } from './piReviewStart.ts'
import type { AzureIteration } from './azureRead.ts'

// PIR-25: the Azure DevOps iterations the next PI is worked out from — the list (null when not read or not readable)
// and whether they are still being read.
export type PiIterations = { list: AzureIteration[] | null; reading?: boolean }
// PIR-13: the reviewed PI of a Feature — the chosen PI, else its own. PIR-25, PIR-33: its next PI (Moves to), by today's
// PI, never before "PI Review starts from" — the one rule of the single form (startForm) and the bulk form.
export const reviewedPiOf = (item: Pick<AzureWorkItem, 'iterationPath'>, pi: string) => pi || featurePi(item.iterationPath) || ''
export function nextPiFor(reviewed: string, items: AzureWorkItem[], setup: PiFormSetup, iterations: PiIterations, today: Date): NextPi {
  const options = piOptions(iterations.list ?? [], items)
  return notBeforeStart(nextPiOf(reviewed, iterations.list, options, { reading: iterations.reading, today }), piCutoff(reviewStartOf(setup), iterations.list, options))
}

// PIR-36: a ticked Feature and what the post does to it — replace: my own review comment of the chosen PI (useOwnReview,
// PIR-34) fixed when the pop-up opened; without it a new comment is posted.
export type BulkTarget = { item: AzureWorkItem; replace?: { commentId: number; date: string } }
// PIR-37: how one Feature ended — posted (a new comment), replaced (my review edited) or failed, with the reason; note:
// the write went through but the Discussion could not be read again.
// PIR-84: unchanged (the comment equals my review: not written) and blocked (not written, with the reason) too.
export type BulkOutcome = { item: Pick<AzureWorkItem, 'id' | 'key'>; result: 'posted' | 'replaced' | 'unchanged' | 'blocked' | 'failed'; reason?: string; note?: string }

// PIR-36: why a Feature's row cannot be ticked ('' when it can) — the rights and the page's reasons of Write review…
// (reviewPostBlock: View as, sample data, read-only token or roles file, no PAT, an on-premises server, not the
// assignee without the lead right, CON-113), a review of it being written already, and — so that "replace mine" is
// decided on what Azure DevOps holds — its Discussion still being read, or not readable. (PIR-49: which review is mine
// for the PI goes by its heading, so the PI dates are no longer waited for.)
export function bulkBlock(postBlock: string, { discussion, busy = '' }: { discussion: Discussion | undefined; busy?: string }): string {
  if (postBlock) return postBlock
  if (busy) return busy
  if (!discussion || discussion.state === 'loading') return 'Its Discussion is still being read from Azure DevOps.'
  if (discussion.state === 'error') return `Its Discussion could not be read (${(discussion.error || 'unknown error').replace(/\.$/, '')}), so whether your review is there is not known.`
  if (discussion.capped) return 'Its Discussion could not be read in full, so whether your review is there is not known.'
  return ''
}

// PIR-36, PIR-82: the review written for several Features — the targets (each with my review to replace, if any), the
// reviewed PI they share, the form as the single form starts it for a Feature without a review (the form setup's
// defaults, Moves to by the same next-PI rule), and — PIR-82…PIR-84 — one row per Feature, started from its own review
// (rowStartOf, given by the caller), with the shared paragraphs once for all. problem: the Features are not in one PI
// (one comment heading).
export type BulkWriting = { targets: BulkTarget[]; rows: BulkRow[]; shared: BulkShared; pi: string; initial: ReviewForm; setup: PiFormSetup; next: NextPi; moveNote: string; moveShort: string; moveWarn: boolean; problem: string }
export function startBulkForm(targets: BulkTarget[], pi: string, items: AzureWorkItem[], setup: PiFormSetup = builtInFormSetup(), iterations: PiIterations = { list: null }, today: Date = new Date(), startOf?: (item: AzureWorkItem, movePi: string) => RowStart): BulkWriting {
  const reviewed = targets.map(({ item }) => ({ id: item.id, pi: reviewedPiOf(item, pi) }))
  const shared = reviewed[0]?.pi ?? pi
  const next = nextPiFor(shared, items, setup, iterations, today)
  const initial: ReviewForm = { ...reviewFormFrom(undefined, next.pi, setup), reviewedPi: piText(piLabel(shared)) }
  const rows = targets.map((target): BulkRow => {
    const start: RowStart = startOf?.(target.item, next.pi) ?? { from: 'none', form: initial }
    const row: BulkTarget = start.mine ? { item: target.item, replace: { commentId: start.mine.id, date: start.mine.date } } : startOf ? { item: target.item } : target
    return { target: row, start, values: rowValuesOf(start.form, setup) }
  })
  return { targets: rows.map((row) => row.target), rows, shared: sharedStart(rows, setup, initial), pi: shared, initial, setup, next, moveNote: next.note, moveShort: next.short, moveWarn: next.missing, problem: samePiProblem(reviewed) }
}

// KB-155, PIR-80: my own review of the reviewed PI in a Discussion as read (ownReviewOf: my newest comment headed for that
// PI, "PI 26.4" and "PI 2026.4" alike, mine by email, else by name) — undefined when the Discussion is not read, or for
// a lead showing another person (others). The one comparison of the pop-up (which Features get their review replaced)
// and of the job's check before each write, so the two cannot disagree on the same Discussion.
export function ownReviewIn(discussion: Discussion | undefined, reviewed: string, viewer: { email?: string; name?: string }, setup?: PiFormSetup, others = false) {
  if (others || discussion?.state !== 'done') return undefined
  return ownReviewOf(discussion.comments, reviewPeriodOf(reviewed), viewer, setup)
}

// PIR-82: which fields the pop-up asks once for all — the paragraphs (Learnings, Struggles, Additional Remarks and the
// paragraphs added in the form setup) — and which per Feature: Move to next PI (with Moves to and Reason) and every
// choice (the Review meeting advice "Discuss during Meeting / Offline Review" and the choices added in the form setup).
export const sharedFieldsOf = (setup: PiFormSetup) => setup.fields.filter((field) => field.type === 'longtext')
export const rowChoicesOf = (setup: PiFormSetup) => setup.fields.filter((field) => field.id !== 'move' && field.type === 'dropdown')

// PIR-83: where a Feature's row starts — mine: my own review of the PI (ownReviewIn, PIR-80: saving replaces it);
// other: the Feature's latest review of the PI by someone else (latestReviewFor; saving posts my own, theirs stays);
// old: my old-format comment (PIR-75, its values as Convert… reads them, oldFormatForm; saving posts a new headed review,
// PIR-50, and the old comment stays — bulk does not convert); none: the form setup's defaults. comment: the comment it
// starts from; mine: my review's ID, date and text (for Unchanged).
export type RowStartFrom = 'mine' | 'other' | 'old' | 'none'
export type RowStart = { from: RowStartFrom; form: ReviewForm; comment?: { id: number; author: string; date: string }; mine?: { id: number; date: string; text: string } }
export function rowStartOf(discussion: Discussion | undefined, reviewed: string, viewer: { email?: string; name?: string }, setup: PiFormSetup, movePi: string, others = false): RowStart {
  const base: ReviewForm = { ...reviewFormFrom(undefined, movePi, setup), reviewedPi: piText(piLabel(reviewed)) }
  const comments = discussion?.state === 'done' ? discussion.comments : []
  const mine = ownReviewIn(discussion, reviewed, viewer, setup, others)?.comment
  const headed = mine ?? latestReviewFor(comments, reviewed)
  if (headed) {
    const comment = { id: headed.id, author: headed.author, date: shownDateOf(headed) }
    return { from: mine ? 'mine' : 'other', form: { ...reviewFormFrom(reviewSplit(headed.text, setup), movePi, setup), reviewedPi: base.reviewedPi }, comment, ...(mine ? { mine: { id: mine.id, date: comment.date, text: mine.text } } : {}) }
  }
  const old = others ? undefined : oldFormatComments(comments).find((entry) => isOwnComment(entry, viewer))
  const parsed = old ? oldFormatOf(old.text) : undefined
  if (old && parsed) return { from: 'old', form: oldFormatForm(parsed, base, setup), comment: { id: old.id, author: old.author, date: shownDateOf(old) } }
  return { from: 'none', form: base }
}

// PIR-82: a row's own answers — Move to next PI, Moves to, Reason and each choice (by field id).
export type RowValues = { move: ReviewMove | ''; movePi: string; moveReason: string; choices: Record<string, string> }
export type BulkRow = { target: BulkTarget; start: RowStart; values: RowValues }
export const rowValuesOf = (form: ReviewForm, setup: PiFormSetup): RowValues => ({ move: form.move, movePi: form.movePi, moveReason: form.moveReason, choices: Object.fromEntries(rowChoicesOf(setup).map((field) => [field.id, fieldValue(form, field.id)])) })

// PIR-83: the shared paragraphs — their text (form, with "No learnings or struggles", PIR-27) and per field whether each
// Feature keeps its own text ('own') or the shared text is used ('shared'). 'own' is the default when any ticked
// Feature starts from a review or comment; a Feature without its own text takes the shared text either way.
export type SharedMode = 'own' | 'shared'
export type BulkShared = { form: ReviewForm; modes: Record<string, SharedMode> }
export function sharedStart(rows: readonly BulkRow[], setup: PiFormSetup, initial: ReviewForm): BulkShared {
  const any = rows.some((row) => row.start.from !== 'none')
  return { form: initial, modes: Object.fromEntries(sharedFieldsOf(setup).map((field) => [field.id, any ? 'own' : 'shared'])) }
}
// PIR-83: how many rows have their own text in a shared field (the rest take the shared text).
export const ownTextCount = (rows: readonly Pick<BulkRow, 'start'>[], id: string) => rows.filter((row) => fieldValue(row.start.form, id).trim()).length

// PIR-82, PIR-83: the review one row posts — its shared paragraphs (its own text, or the shared text), its own Move to
// next PI, Moves to, Reason and choices, headed for the shared reviewed PI.
export function composeRow(row: Pick<BulkRow, 'start' | 'values'>, shared: BulkShared, setup: PiFormSetup): ReviewForm {
  let form: ReviewForm = { ...row.start.form }
  delete form.noTexts
  for (const field of sharedFieldsOf(setup)) {
    const own = fieldValue(row.start.form, field.id)
    form = withFieldValue(form, field.id, shared.modes[field.id] === 'own' && own.trim() ? own : fieldValue(shared.form, field.id))
  }
  form = { ...form, move: row.values.move, movePi: row.values.movePi, moveReason: row.values.moveReason, reviewedPi: shared.form.reviewedPi }
  for (const field of rowChoicesOf(setup)) form = withFieldValue(form, field.id, row.values.choices[field.id] ?? '')
  return form
}

// PIR-82: a row's problems — the single form's checks (PIR-13) and, in the grid, a Reason with Yes (why it moves, or what
// is left: the product owner's "Per-Feature reason is part of every option").
export function rowProblems(form: ReviewForm, setup: PiFormSetup): string[] {
  const problems = reviewFormProblems(form, { setup })
  // PIR-82 (product owner): the Reason is optional with Yes, as in the single form and the Close pop-up (PIR-13, PIR-18).
  return problems
}

// PIR-84: the comment a row would post equals my review there (as Azure DevOps holds it, read as plain text; spaces and
// line breaks ignored) — then nothing is written to it.
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim()
export const sameReviewText = (html: string, stored: string) => tidy(commentText(html)) === tidy(stored)

// PIR-84: the preview of a row before saving — post: a new comment (no review of mine for the PI; with my old-format
// comment it stays, oldFormatStays); replace: my review edited; unchanged: the comment equals my review (skipped);
// blocked: it cannot be written (the reason: bulkBlock / reviewPostBlock). form / text: what it posts; problems: what to
// fix before saving (none for an unchanged or blocked row: it is not written).
export type RowKind = 'post' | 'replace' | 'unchanged' | 'blocked'
export type RowResult = { kind: RowKind; form: ReviewForm; text: string; problems: string[]; reason: string }
export const oldFormatStays = 'New (old-format comment stays — use Convert… to replace it)'
export function rowResultOf(row: BulkRow, shared: BulkShared, setup: PiFormSetup, block = ''): RowResult {
  const form = composeRow(row, shared, setup), text = buildReviewComment(form, setup)
  const kind: RowKind = block ? 'blocked' : !row.target.replace ? 'post' : row.start.mine && sameReviewText(text, row.start.mine.text) ? 'unchanged' : 'replace'
  return { kind, form, text, problems: kind === 'post' || kind === 'replace' ? rowProblems(form, setup) : [], reason: block }
}

// PIR-36: the ticked Features as targets — each with my own review of the chosen PI to replace, if it has one.
export function bulkTargets<T extends AzureWorkItem>(items: readonly T[], own: (item: T) => { comment: { id: number; date: string } } | undefined): BulkTarget[] {
  return items.map((item) => { const mine = own(item); return mine ? { item, replace: { commentId: mine.comment.id, date: shownDateOf(mine.comment) } } : { item } })
}

// PIR-36: the reviewed PI of every target must be the same (one heading): '' when it is, else the problem.
export function samePiProblem(reviewed: readonly { id: number; pi: string }[]): string {
  const pis = [...new Set(reviewed.map((entry) => entry.pi.toLowerCase()))]
  if (pis.length <= 1) return ''
  return `The ticked Features are in different PIs (${[...new Set(reviewed.map((entry) => piLabel(entry.pi)))].join(', ')}): write one review per PI.`
}

// PIR-37: the writes of one Feature, given by the caller (the review writer: the person's PAT, the audit) — busy: a
// reason it is being written right now (a single Write or Edit review of it running); ownNow: read its Discussion again
// and return my own review comment of the chosen PI as Azure DevOps holds it now (undefined: none); post / edit: the
// Write review… and Edit review… writes with their audit, PIR-82: each with its row's own form and comment; reread: the
// same read again after a write (the table's refresh).
export interface BulkWrites {
  busy?: (item: AzureWorkItem) => string
  ownNow: (item: AzureWorkItem) => Promise<Pick<WorkItemComment, 'id' | 'date' | 'updated'> | undefined>
  post: (item: AzureWorkItem, form: ReviewForm, text: string) => Promise<unknown>
  edit: (item: AzureWorkItem, commentId: number, form: ReviewForm, text: string) => Promise<unknown>
  reread: (item: AzureWorkItem) => Promise<void>
}
// PIR-84: one row to write — its target (new, or my review to replace) and its own review.
export type BulkJob = { target: BulkTarget; form: ReviewForm; text: string }
const failureText = (failure: unknown) => (failure instanceof Error ? failure.message : 'unknown error').trim().replace(/([^.!?])$/, '$1.')
const accessProblem = (failure: unknown) => /PAT (was )?rejected|Access denied/i.test(failure instanceof Error ? failure.message : String(failure))

// PIR-37, PIR-84: write each row's review — 3 at a time (the worker of readDiscussions, PIR-06: when Azure DevOps asks to
// slow down, 429, a row waits for Retry-After and is tried once more; a second 429, a rejected PAT or refused access
// stops the run, the rows not written failing with the reason). Before each write the Discussion is read again: a row to
// replace is edited only when my review there is still that same comment, a new row is posted only when I still have
// none (else it fails, nothing written: posted or changed since the pop-up opened). A failure on one Feature never stops
// the others. The outcomes come in the rows' order; progress says "n of N done" and what is being written.
export async function runBulkReview(jobs: readonly BulkJob[], writes: BulkWrites, progress: (text: string) => void = () => undefined, { concurrency = 3, rateWait = () => null, sleep }: { concurrency?: number; rateWait?: (failure: unknown) => number | null; sleep?: (ms: number) => Promise<void> } = {}): Promise<BulkOutcome[]> {
  const byId = new Map(jobs.map((job) => [job.target.item.id, job])), outcomes = new Map<number, BulkOutcome>()
  let done = 0
  const line = (text: string) => progress(`${done} of ${jobs.length} done · ${text}`)
  const passOn = (failure: unknown) => rateWait(failure) != null || accessProblem(failure)
  async function one(id: number) {
    const { target, form, text } = byId.get(id)!, { item } = target
    const fail = (reason: string) => { outcomes.set(id, { item, result: 'failed', reason }) }
    const busy = writes.busy?.(item) ?? ''
    if (busy) { fail(busy); return }
    line(`reading the Discussion of #${id}…`)
    let now: Awaited<ReturnType<BulkWrites['ownNow']>>
    try { now = await writes.ownNow(item) } catch (failure) { if (passOn(failure)) throw failure; fail(`Its Discussion could not be read: ${failureText(failure)} Nothing was posted.`); return }
    // KB-155: the pop-up read the Discussions when it opened (PIR-80), so these remain only for a change in Azure DevOps
    // while it was open — each says what to do.
    if (target.replace && now?.id !== target.replace.commentId) { fail(now ? `Your review of this PI was changed in Azure DevOps after the pop-up opened (it is another comment now). Nothing was changed: tick #${id} again and use Update review… to replace it.` : `Your review of this PI was deleted in Azure DevOps after the pop-up opened (it is no longer in its Discussion). Nothing was posted: tick #${id} again and use Update review… to post it as a new comment.`); return }
    if (target.replace && now && shownDateOf(now) !== target.replace.date) { fail('Your review was edited in Azure DevOps since the pop-up opened. Nothing was changed: open it again.'); return }
    if (!target.replace && now) { fail(`Your review of this PI was posted in Azure DevOps after the pop-up opened (it has your review of this PI now). Nothing was posted: tick #${id} again and use Update review… to replace it.`); return }
    line(`${target.replace ? 'replacing your review' : 'posting the review'} of #${id}…`)
    try {
      if (target.replace) await writes.edit(item, target.replace.commentId, form, text)
      else await writes.post(item, form, text)
    } catch (failure) { if (passOn(failure)) throw failure; fail(failureText(failure)); return }
    const result = target.replace ? 'replaced' as const : 'posted' as const
    line(`reading the Discussion of #${id} again…`)
    try { await writes.reread(item); outcomes.set(id, { item, result }) } catch (failure) { outcomes.set(id, { item, result, note: `the Discussion could not be read again (${failureText(failure).replace(/\.$/, '')}): use ↻ Read again` }) }
  }
  const run = await readDiscussions([...byId.keys()], one, { concurrency, rateWait, ...(sleep ? { sleep } : {}), onError: (id, failure) => { outcomes.set(id, { item: byId.get(id)!.target.item, result: 'failed', reason: failureText(failure) }) }, onProgress: (count) => { done = count } })
  const stopped = run.stopped === 'rate-limit' ? 'Not written: Azure DevOps asked to slow down (429) again, so the run stopped. Use Retry failed in a minute.' : 'Not written: the run stopped because Azure DevOps refused the PAT or the access. Check the PAT, then use Retry failed.'
  return jobs.map(({ target: { item } }) => outcomes.get(item.id) ?? { item, result: 'failed', reason: stopped })
}
// PIR-84: Retry failed — the rows that failed, with the same values (their target and comment).
export const failedJobs = (jobs: readonly BulkJob[], outcomes: readonly BulkOutcome[]) => jobs.filter((job) => outcomes.some((entry) => entry.item.id === job.target.item.id && entry.result === 'failed'))

// PIR-37, PIR-84: the job's last line — what was posted, replaced, left unchanged or blocked (not written) and failed
// (with each reason); failed when any did.
export function bulkSummary(outcomes: readonly BulkOutcome[]): { text: string; failed: boolean } {
  const ids = (list: readonly BulkOutcome[]) => list.map((entry) => `#${entry.item.id}`)
  const of = (result: BulkOutcome['result']) => outcomes.filter((entry) => entry.result === result)
  const posted = of('posted'), replaced = of('replaced'), unchanged = of('unchanged'), blocked = of('blocked'), failed = of('failed')
  const part = (label: string, list: readonly BulkOutcome[]) => `${label} ${list.length}${list.length ? ` (${ids(list).join(', ')})` : ''}`
  const notes = outcomes.filter((entry) => entry.note).map((entry) => `#${entry.item.id}: ${entry.note}.`)
  const reasons = [...blocked, ...failed].map((entry) => `#${entry.item.id}: ${entry.reason}`)
  const parts = [part('Posted', posted), part('Replaced', replaced), ...(unchanged.length ? [`${part('Unchanged', unchanged)} not written`] : []), ...(blocked.length ? [part('Blocked', blocked)] : []), part('Failed', failed)]
  return { text: [`${parts.join(' · ')}.`, ...reasons, ...notes].join(' '), failed: failed.length > 0 || notes.length > 0 }
}

// PIR-37: the Features in a running bulk job (their row actions and tick boxes wait for it).
const inJob = new Set<string>()
export const inBulkJob = (key: string) => inJob.has(key)
export const markBulk = (keys: readonly string[], on: boolean) => { for (const key of keys) { if (on) inJob.add(key); else inJob.delete(key) } }
