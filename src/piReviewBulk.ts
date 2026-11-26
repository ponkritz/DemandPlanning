import { shownDateOf, type WorkItemComment } from './azureDevOps.ts'
// PIR-36, PIR-37: one PI review for several Features at once (My PI Review) — which ticked Features can take it, what
// happens to each (a new comment, or my own review of the chosen PI replaced, as Write review… and Edit review… do), and
// the one background job that writes them one after another, a failure on one not stopping the others.
import type { AzureWorkItem } from './domain'
import { piLabel, piOptions, type Discussion } from './piReview.ts'
import { featurePi, nextPiOf, piText, reviewFormFrom, type NextPi, type ReviewForm } from './piReviewPost.ts'
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
export type BulkOutcome = { item: Pick<AzureWorkItem, 'id' | 'key'>; result: 'posted' | 'replaced' | 'failed'; reason?: string; note?: string }

// PIR-36: why a Feature's row cannot be ticked ('' when it can) — the rights and the page's reasons of Write review…
// (reviewPostBlock: View as, sample data, read-only token or roles file, no PAT, an on-premises server, not the
// assignee without the lead right, CON-113), a review of it being written already, and — so that "replace mine" is
// decided on what Azure DevOps holds — the PI dates and its Discussion still being read, or the Discussion not readable.
export function bulkBlock(postBlock: string, { discussion, periodKnown, busy = '' }: { discussion: Discussion | undefined; periodKnown: boolean; busy?: string }): string {
  if (postBlock) return postBlock
  if (busy) return busy
  if (!periodKnown) return 'The PI dates are still being read from Azure DevOps: wait a moment.'
  if (!discussion || discussion.state === 'loading') return 'Its Discussion is still being read from Azure DevOps.'
  if (discussion.state === 'error') return `Its Discussion could not be read (${(discussion.error || 'unknown error').replace(/\.$/, '')}), so whether your review is there is not known.`
  if (discussion.capped) return 'Its Discussion could not be read in full, so whether your review is there is not known.'
  return ''
}

// PIR-36: the review written once for several Features — the targets (each with my review to replace, if any), the
// reviewed PI they share, and the form as the single form starts it for a Feature without a review (the form setup's
// defaults, Moves to by the same next-PI rule): never prefilled from one Feature's comment. problem: the Features are
// not in one PI (one form, one comment).
export type BulkWriting = { targets: BulkTarget[]; pi: string; initial: ReviewForm; setup: PiFormSetup; next: NextPi; moveNote: string; moveShort: string; moveWarn: boolean; problem: string }
export function startBulkForm(targets: BulkTarget[], pi: string, items: AzureWorkItem[], setup: PiFormSetup = builtInFormSetup(), iterations: PiIterations = { list: null }, today: Date = new Date()): BulkWriting {
  const reviewed = targets.map(({ item }) => ({ id: item.id, pi: reviewedPiOf(item, pi) }))
  const shared = reviewed[0]?.pi ?? pi
  const next = nextPiFor(shared, items, setup, iterations, today)
  return { targets, pi: shared, initial: { ...reviewFormFrom(undefined, next.pi, setup), reviewedPi: piText(piLabel(shared)) }, setup, next, moveNote: next.note, moveShort: next.short, moveWarn: next.missing, problem: samePiProblem(reviewed) }
}

// PIR-36: the ticked Features as targets — each with my own review of the chosen PI to replace, if it has one.
export function bulkTargets<T extends AzureWorkItem>(items: readonly T[], own: (item: T) => { comment: { id: number; date: string } } | undefined): BulkTarget[] {
  return items.map((item) => { const mine = own(item); return mine ? { item, replace: { commentId: mine.comment.id, date: shownDateOf(mine.comment) } } : { item } })
}

// PIR-36: the reviewed PI of every target must be the same (one form, one comment): '' when it is, else the problem.
export function samePiProblem(reviewed: readonly { id: number; pi: string }[]): string {
  const pis = [...new Set(reviewed.map((entry) => entry.pi.toLowerCase()))]
  if (pis.length <= 1) return ''
  return `The ticked Features are in different PIs (${[...new Set(reviewed.map((entry) => piLabel(entry.pi)))].join(', ')}): write one review per PI.`
}

// PIR-37: the writes of one Feature, given by the caller (the review writer: the person's PAT, the audit) — busy: a
// reason it is being written right now (a single Write or Edit review of it running); ownNow: read its Discussion again
// and return my own review comment of the chosen PI as Azure DevOps holds it now (undefined: none); post / edit: the
// Write review… and Edit review… writes with their audit; reread: the same read again after a post (the table's
// refresh).
export interface BulkWrites {
  busy?: (item: AzureWorkItem) => string
  ownNow: (item: AzureWorkItem) => Promise<Pick<WorkItemComment, 'id' | 'date' | 'updated'> | undefined>
  post: (item: AzureWorkItem) => Promise<unknown>
  edit: (item: AzureWorkItem, commentId: number) => Promise<unknown>
  reread: (item: AzureWorkItem) => Promise<void>
}
const failureText = (failure: unknown) => (failure instanceof Error ? failure.message : 'unknown error').trim().replace(/([^.!?])$/, '$1.')

// PIR-37: write the review to each target, one after another. Before each write the Discussion is read again: a target
// to replace is edited only when my review there is still that same comment, a target without one is posted only when
// I still have none (else it fails, nothing written: posted or changed since the pop-up opened). A failure on one
// Feature never stops the others. progress names the Feature being written, "n of N".
export async function runBulkReview(targets: readonly BulkTarget[], writes: BulkWrites, progress: (text: string) => void = () => undefined): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = []
  for (const [index, target] of targets.entries()) {
    const { item } = target, step = `${index + 1} of ${targets.length}`
    const fail = (reason: string) => { outcomes.push({ item, result: 'failed', reason }) }
    const busy = writes.busy?.(item) ?? ''
    if (busy) { fail(busy); continue }
    progress(`${step}: reading the Discussion of #${item.id}…`)
    let now: Awaited<ReturnType<BulkWrites['ownNow']>>
    try { now = await writes.ownNow(item) } catch (failure) { fail(`Its Discussion could not be read: ${failureText(failure)} Nothing was posted.`); continue }
    if (target.replace && now?.id !== target.replace.commentId) { fail(now ? 'Your review of this PI is another comment now (changed in Azure DevOps since the pop-up opened). Nothing was changed: write it again.' : 'Your review of this PI is no longer in its Discussion. Nothing was posted: write it again.'); continue }
    if (target.replace && now && shownDateOf(now) !== target.replace.date) { fail('Your review was edited in Azure DevOps since the pop-up opened. Nothing was changed: open it again.'); continue }
    if (!target.replace && now) { fail('It has your review of this PI now (posted since the pop-up opened). Nothing was posted: use Edit review… to change it.'); continue }
    progress(`${step}: ${target.replace ? 'replacing your review' : 'posting the review'} of #${item.id}…`)
    try {
      if (target.replace) await writes.edit(item, target.replace.commentId)
      else await writes.post(item)
    } catch (failure) { fail(failureText(failure)); continue }
    const result = target.replace ? 'replaced' as const : 'posted' as const
    progress(`${step}: reading the Discussion of #${item.id} again…`)
    try { await writes.reread(item); outcomes.push({ item, result }) } catch (failure) { outcomes.push({ item, result, note: `the Discussion could not be read again (${failureText(failure).replace(/\.$/, '')}): use ↻ Read again` }) }
  }
  return outcomes
}

// PIR-37: the job's last line — what was posted, replaced and failed (with each reason); failed when any did.
export function bulkSummary(outcomes: readonly BulkOutcome[]): { text: string; failed: boolean } {
  const ids = (result: BulkOutcome['result']) => outcomes.filter((entry) => entry.result === result).map((entry) => `#${entry.item.id}`)
  const posted = ids('posted'), replaced = ids('replaced'), failed = outcomes.filter((entry) => entry.result === 'failed')
  const part = (label: string, list: string[]) => `${label} ${list.length}${list.length ? ` (${list.join(', ')})` : ''}`
  const notes = outcomes.filter((entry) => entry.note).map((entry) => `#${entry.item.id}: ${entry.note}.`)
  const reasons = failed.map((entry) => `#${entry.item.id}: ${entry.reason}`)
  return { text: [`${part('Posted', posted)} · ${part('Replaced', replaced)} · ${part('Failed', failed.map((entry) => `#${entry.item.id}`))}.`, ...reasons, ...notes].join(' '), failed: failed.length > 0 || notes.length > 0 }
}

// PIR-37: the Features in a running bulk job (their row actions and tick boxes wait for it).
const inJob = new Set<string>()
export const inBulkJob = (key: string) => inJob.has(key)
export const markBulk = (keys: readonly string[], on: boolean) => { for (const key of keys) { if (on) inJob.add(key); else inJob.delete(key) } }
