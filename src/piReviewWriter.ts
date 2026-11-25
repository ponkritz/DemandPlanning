import { useContext, useState } from 'react'
import { runInBackground, recordJob } from './backgroundJobs'
import { featurePi, nextPiOf, ownReviewOf, piText, postReview, prefilledOtherPi, readDiscussionInto, reviewPeriodOf, updateReview, reviewFormFrom, reviewSummary, type NextPi, type ReviewForm, type ReviewViewer } from './piReviewPost'
import { discussionOf, latestComment, piLabel, piOptions, reviewSplit, setDiscussion } from './piReview'
import { ReviewEnvContext, type ReviewEnv } from './reviewEnv'
import { ReadOnlyContext, useCan } from './useCan'
import type { AzureIteration, WorkItemComment } from './azureDevOps'
import type { AzureWorkItem } from './domain'
import { builtInFormSetup, builtInSetup, type PiFormSetup } from './piReviewSetup'
import { notBeforeStart, piCutoff, reviewStartOf } from './piReviewStart'

// PIR-13, PIR-17, PIR-18: writing a PI review from any page — the viewer's rights, the form a Feature starts from, the
// post with its audit, and the Write review… state with its Background jobs entry. The form itself: pages/PiReviewForm.
// CON-113, PIR-13: the viewer as the review rights see them (useCan, the roles file, View as, the connection).
export function useReviewViewer(): ReviewViewer & { env: ReviewEnv | null } {
  const env = useContext(ReviewEnvContext), can = useCan(), readOnly = useContext(ReadOnlyContext)
  return { env, can, readOnly, viewingAs: env?.viewingAs ?? '', email: env?.email ?? '', isSample: env?.isSample ?? false, config: env?.config ?? null, pat: env?.pat ?? '' }
}

// PIR-13: the review being written — the Feature, its PI, the form it starts from, the comment it was prefilled from.
// PIR-19: setup — the form setup it is written with (kept while the pop-up is open).
// PIR-25: next — the next PI (by today's PI, PIR-25) and where it came from (the Azure DevOps iteration dates or a
// fallback); moveNote — the full source note (the ⓘ of Moves to); moveShort — the one line under Moves to; moveWarn —
// a fallback was used (the line is a warning).
// PIR-26: prefilledOther — the PI the prefilled review was written for when it does not count for the reviewed PI
// ("PI 2026.3", "another PI"); '' otherwise.
// PIR-34: editing — Edit review…: the viewer's own review comment the save replaces (its ID and date); failed — why the
// last save did not go through (the pop-up then offers "Post as a new review instead").
export type Writing = { item: AzureWorkItem; pi: string; initial: ReviewForm; prefilledFrom?: WorkItemComment; prefilledOther?: string; partly: boolean; setup: PiFormSetup; next: NextPi; moveNote: string; moveShort: string; moveWarn: boolean; editing?: { commentId: number; date: string; failed?: string } }
// PIR-25: the Azure DevOps iterations the next PI is worked out from — the list (null when not read or not readable)
// and whether they are still being read.
export type PiIterations = { list: AzureIteration[] | null; reading?: boolean }
// PIR-19: the form setup in use (the built-in form without a provider or a file).
export const formSetupOf = (env: ReviewEnv | null | undefined) => env?.formSetup ?? builtInSetup

// PIR-13: the form as it starts for a Feature — prefilled from its latest review comment (split by headings) when its
// Discussion was read; the reviewed PI is pi, else the Feature's own PI. Moves to — PIR-25: the PI after today's PI by the
// Azure DevOps iteration dates (not after the reviewed PI) when they give one, else a fallback said so; a Moves to taken from the latest
// review says so. today: the date the next PI is worked out for (the caller's clock; nextPiOf has none).
// PIR-34: from — the comment to start from (Edit review…: the viewer's own review) instead of the latest one.
export function startForm(item: AzureWorkItem, pi: string, items: AzureWorkItem[], setup: PiFormSetup = builtInFormSetup(), iterations: PiIterations = { list: null }, today: Date = new Date(), from?: WorkItemComment): Writing {
  const reviewed = pi || featurePi(item.iterationPath) || ''
  const entry = discussionOf(item.key)
  const comment = from ?? (entry?.state === 'done' ? latestComment(entry.comments) : undefined)
  const split = comment ? reviewSplit(comment.text, setup) : undefined
  const headings = split?.from === 'Headings'
  const options = piOptions(iterations.list ?? [], items)
  const next = notBeforeStart(nextPiOf(reviewed, iterations.list, options, { reading: iterations.reading, today }), piCutoff(reviewStartOf(setup), iterations.list, options))
  // PIR-28: the headings name the reviewed PI ("Learnings of PI 26.4:").
  const initial = { ...reviewFormFrom(split, next.pi, setup), reviewedPi: piText(piLabel(reviewed)) }
  // PIR-26: the latest review is still the prefill; when it does not count for the reviewed PI, the form says so.
  const prefilledOther = headings && comment ? prefilledOtherPi(comment, split, item, reviewed, iterations) : ''
  const fromComment = headings && Boolean(split?.movePi) && initial.movePi !== next.pi
  const moveNote = fromComment ? `As in the latest review comment; the next PI ${next.source === 'dates' ? 'by the Azure DevOps iteration dates' : 'by a fallback'} is ${next.pi || 'not known'}. ${next.note}`.trim() : next.note
  const moveShort = fromComment ? `As in the latest review comment (the next PI is ${next.pi || 'not known'}).` : next.short
  return { item, pi: reviewed, initial, ...(headings && comment ? { prefilledFrom: comment } : {}), ...(prefilledOther ? { prefilledOther } : {}), partly: headings && split?.moveValue === 'Partly', setup, next, moveNote, moveShort, moveWarn: !fromComment && next.missing }
}

// PIR-13, PIR-14: post the review and record it — the audit entry (as other Azure DevOps writes) and, for the Discussion
// in PI Review's memory, a fresh read later. Returns the new comment's ID.
// PIR-34: Edit review… — replace the viewer's own review comment and record it (the audit entry "Edit PI review").
export async function editAndAudit(env: ReviewEnv, item: AzureWorkItem, commentId: number, form: ReviewForm, text: string, pi: string) {
  if (!env.config) throw new Error('Connect the Time Writing connection (with its PAT) to edit a review.')
  const id = await updateReview(env.config, env.pat, item, commentId, text)
  env.addAudit({ actor: 'u-owner', action: 'Edit PI review', entity: 'AzureDevOps Feature', entityId: String(item.id), detail: `PI review comment ${id} in the Discussion of Feature #${item.id} edited${pi ? ` (${piLabel(pi)})` : ''}: ${reviewSummary(form)}.` })
  return id
}
export async function postAndAudit(env: ReviewEnv, item: AzureWorkItem, form: ReviewForm, text: string, pi: string) {
  if (!env.config) throw new Error('Connect the Time Writing connection (with its PAT) to post a review.')
  const id = await postReview(env.config, env.pat, item, text)
  env.addAudit({ actor: 'u-owner', action: 'Post PI review', entity: 'AzureDevOps Feature', entityId: String(item.id), detail: `PI review comment ${id} added to the Discussion of Feature #${item.id}${pi ? ` (${piLabel(pi)})` : ''}: ${reviewSummary(form)}.` })
  return id
}

// PIR-13: Write review… — start (reads the Discussion first when not read in this page load, to prefill), post (a
// Background jobs entry "Post review · #id": post, audit, read the Discussion again so the tables show the new values),
// cancel.
// PIR-25: iterations — the page's Azure DevOps iterations (usePiChoice), for the next PI by its dates.
export function useReviewWriter(pi: string, iterations: PiIterations = { list: null }) {
  const env = useContext(ReviewEnvContext)
  const [writing, setWriting] = useState<Writing | null>(null)
  async function start(item: AzureWorkItem) {
    if (!env?.config) return
    if (discussionOf(item.key)?.state !== 'done') await readDiscussionInto(env.config, env.pat, item).catch(() => { /* shown in the table and the drawer */ })
    setWriting(startForm(item, pi, env.items, formSetupOf(env), iterations))
  }
  // PIR-34: Edit review… — the form prefilled from the viewer's own review comment; saving replaces that comment.
  function startEdit(item: AzureWorkItem, comment: WorkItemComment) {
    if (!env?.config) return
    setWriting({ ...startForm(item, pi, env.items, formSetupOf(env), iterations, new Date(), comment), editing: { commentId: comment.id, date: comment.date } })
  }
  // PIR-34: save an edit — a Background jobs entry "Edit review · #id": update the comment, audit, read the Discussion
  // again; a failed edit opens the pop-up again with what was typed, the error and "Post as a new review instead".
  function saveEdit(current: Writing, form: ReviewForm, text: string) {
    if (!env?.config || !current.editing) return
    const { item, pi: reviewed } = current, commentId = current.editing.commentId, config = env.config
    setWriting(null)
    const started = runInBackground(`pireview:edit:${item.key}`, `Edit review · #${item.id}`, async (progress) => {
      progress(`Saving the edited review of #${item.id}…`)
      try { await editAndAudit(env, item, commentId, form, text, reviewed) }
      catch (failure) {
        const message = failure instanceof Error ? failure.message : 'unknown error'
        setWriting({ ...current, initial: form, editing: { ...current.editing!, failed: message } })
        return { text: `The review of #${item.id} was not edited: ${message} The form is open again: try again, or post it as a new review instead.`, failed: true }
      }
      progress(`Reading the Discussion of #${item.id} again…`)
      try { await readDiscussionInto(config, env.pat, item) } catch (failure) { return { text: `Edited the review of #${item.id}, but the Discussion could not be read again: ${failure instanceof Error ? failure.message : 'unknown error'}`, failed: true } }
      return { text: `Edited the review of #${item.id} and read back: ${reviewSummary(form)}.`, failed: false }
    })
    if (!started) recordJob(`pireview:edit:${item.key}:busy`, `Edit review · #${item.id}`, { text: `The review of #${item.id} is being saved already: wait for it. Nothing else was changed.`, failed: true })
  }
  // PIR-13: post (a new comment) — or, for Edit review… (PIR-34), save the edit.
  function post(form: ReviewForm, text: string) {
    if (!writing) return
    if (writing.editing) saveEdit(writing, form, text)
    else postNew(form, text)
  }
  // PIR-34: "Post as a new review instead" after a failed edit — the same form posted as a new comment.
  function postNew(form: ReviewForm, text: string) {
    if (!env?.config || !writing) return
    const { item, pi: reviewed } = writing, config = env.config
    setWriting(null)
    const started = runInBackground(`pireview:post:${item.key}`, `Post review · #${item.id}`, async (progress) => {
      progress(`Posting the review of #${item.id}…`)
      await postAndAudit(env, item, form, text, reviewed)
      progress(`Reading the Discussion of #${item.id} again…`)
      try { await readDiscussionInto(config, env.pat, item) } catch (failure) { return { text: `Posted to the Discussion of #${item.id}, but it could not be read again: ${failure instanceof Error ? failure.message : 'unknown error'} Use ↻ Read again in the Feature.`, failed: true } }
      return { text: `Posted to the Discussion of #${item.id} and read back: ${reviewSummary(form)}.`, failed: false }
    })
    if (!started) recordJob(`pireview:post:${item.key}:busy`, `Post review · #${item.id}`, { text: `A review of #${item.id} is being posted already: wait for it, then write again if needed. Nothing else was posted.`, failed: true })
  }
  return { writing, start, startEdit, post, postNew, cancel: () => setWriting(null) }
}

// PIR-34: Edit review… on PI Review and My PI Review — the viewer's own review of a Feature that counts for the chosen PI
// (ownReviewOf), by the viewer's work email, else their display name; none while the iterations are read, and none
// when `others` (a lead showing another person's Features in My PI Review).
export function useOwnReview(pi: string, iterations: PiIterations & { problem?: string }, { others = false, me }: { others?: boolean; me?: { email?: string; name?: string } } = {}) {
  const env = useContext(ReviewEnvContext)
  const viewer = { email: me?.email || env?.email || '', name: me?.name || env?.name || '' }
  const period = iterations.reading ? null : reviewPeriodOf(pi, iterations.list, { problem: iterations.problem })
  return (item: AzureWorkItem) => {
    if (others) return undefined
    const entry = discussionOf(item.key)
    return ownReviewOf(entry?.state === 'done' ? entry.comments : undefined, item, period, viewer, formSetupOf(env))
  }
}

// PIR-18: forget a Feature's Discussion read in this page load after a review was posted from elsewhere (the Close
// pop-up), so PI Review reads it again.
export const forgetDiscussion = (item: Pick<AzureWorkItem, 'key'>) => { if (discussionOf(item.key)) setDiscussion(item.key, undefined) }
