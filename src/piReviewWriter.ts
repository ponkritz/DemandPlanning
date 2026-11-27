import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { isRunning, runInBackground, recordJob } from './backgroundJobs'
import { discussionReading, ownReviewOf, piText, postReview, prefilledOtherPi, readDiscussionInto, reviewPageBlock, reviewPeriodOf, reviewPostBlock, updateReview, reviewFormFrom, reviewSummary, type NextPi, type ReviewFeature, type ReviewForm, type ReviewViewer } from './piReviewPost'
import { featureOwner } from './epicOwners'
import { useEpicSetupFile } from './useEpicSetup'
import { discussionOf, discussionsFrom, discussionsVersion, latestComment, piLabel, readDiscussions, reviewComments, reviewSplit, setDiscussion, subscribeDiscussions, type BulkReadResult } from './piReview'
import { rateLimitWait, shownDateOf, type AzureConfig } from './azureDevOps'
import { ReviewEnvContext, type ReviewEnv } from './reviewEnv'
import { ReadOnlyContext, useCan } from './useCan'
import type { WorkItemComment } from './azureDevOps'
import type { AzureWorkItem } from './domain'
import { builtInFormSetup, builtInSetup, type PiFormSetup } from './piReviewSetup'
import { bulkSummary, failedJobs, markBulk, nextPiFor, ownReviewIn, reviewedPiOf, rowStartOf, runBulkReview, startBulkForm, type BulkJob, type BulkOutcome, type BulkWriting, type PiIterations } from './piReviewBulk'
export type { BulkWriting, PiIterations } from './piReviewBulk'
import { oldFormatForm, oldFormatOf } from './piReviewOldFormat'

// PIR-13, PIR-17, PIR-18: writing a PI review from any page — the viewer's rights, the form a Feature starts from, the
// post with its audit, and the Write review… state with its Background jobs entry. The form itself: pages/PiReviewForm.
// CON-113, PIR-13: the viewer as the review rights see them (useCan, the roles file, View as, the connection).
// PIR-70: epicOwnerOf — the Product Owner of a Feature's Epic, from the fetched items and the shared Epic setup (EPS-11).
export function useReviewViewer(): ReviewViewer & { env: ReviewEnv | null } {
  const env = useContext(ReviewEnvContext), can = useCan(), readOnly = useContext(ReadOnlyContext), epicFile = useEpicSetupFile()
  const items = env?.items
  const epicOwnerOf = useMemo(() => { const list = items ?? [], byId = new Map(list.map((item) => [item.id, item])); return (feature: ReviewFeature) => featureOwner(epicFile, list, feature.id != null ? byId.get(feature.id) ?? (feature.workItemType ? feature as AzureWorkItem : undefined) : undefined, byId) }, [items, epicFile])
  return { env, can, readOnly, viewingAs: env?.viewingAs ?? '', email: env?.email ?? '', isSample: env?.isSample ?? false, config: env?.config ?? null, pat: env?.pat ?? '', epicOwnerOf }
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
// PIR-76 (temporary, LIM-235): converting — Convert… of an old-format comment: the PIs the reviewed PI is chosen from;
// saving is the edit of that comment (editing), audited as converted.
export type Writing = { item: AzureWorkItem; pi: string; initial: ReviewForm; prefilledFrom?: WorkItemComment; prefilledOther?: string; partly: boolean; setup: PiFormSetup; next: NextPi; moveNote: string; moveShort: string; moveWarn: boolean; editing?: { commentId: number; date: string; failed?: string }; converting?: { options: string[] } }
// PIR-25: PiIterations — the Azure DevOps iterations the next PI is worked out from (piReviewBulk).
// PIR-19: the form setup in use (the built-in form without a provider or a file).
export const formSetupOf = (env: ReviewEnv | null | undefined) => env?.formSetup ?? builtInSetup

// PIR-13: the form as it starts for a Feature — prefilled from its latest review comment (PIR-49: the newest comment
// headed "Feature Review for PI …", any PI; split by headings) when its
// Discussion was read; the reviewed PI is pi, else the Feature's own PI. Moves to — PIR-25: the PI after today's PI by the
// Azure DevOps iteration dates (not after the reviewed PI) when they give one, else a fallback said so; a Moves to taken from the latest
// review says so. today: the date the next PI is worked out for (the caller's clock; nextPiOf has none).
// PIR-34: from — the comment to start from (Edit review…: the viewer's own review) instead of the latest one.
export function startForm(item: AzureWorkItem, pi: string, items: AzureWorkItem[], setup: PiFormSetup = builtInFormSetup(), iterations: PiIterations = { list: null }, today: Date = new Date(), from?: WorkItemComment): Writing {
  const reviewed = reviewedPiOf(item, pi)
  const entry = discussionOf(item.key)
  const comment = from ?? (entry?.state === 'done' ? latestComment(reviewComments(entry.comments)) : undefined)
  const split = comment ? reviewSplit(comment.text, setup) : undefined
  const headings = split?.from === 'Headings'
  const next = nextPiFor(reviewed, items, setup, iterations, today)
  // PIR-28: the headings name the reviewed PI ("Learnings of PI 26.4:").
  const initial = { ...reviewFormFrom(split, next.pi, setup), reviewedPi: piText(piLabel(reviewed)) }
  // PIR-26, PIR-49: the latest review is still the prefill; when its heading names another PI, the form says so.
  const prefilledOther = headings && comment ? prefilledOtherPi(split, reviewed) : ''
  const fromComment = headings && Boolean(split?.movePi) && initial.movePi !== next.pi
  const moveNote = fromComment ? `As in the latest review comment; the next PI ${next.source === 'dates' ? 'by the Azure DevOps iteration dates' : 'by a fallback'} is ${next.pi || 'not known'}. ${next.note}`.trim() : next.note
  const moveShort = fromComment ? `As in the latest review comment (the next PI is ${next.pi || 'not known'}).` : next.short
  return { item, pi: reviewed, initial, ...(headings && comment ? { prefilledFrom: comment } : {}), ...(prefilledOther ? { prefilledOther } : {}), partly: headings && split?.moveValue === 'Partly', setup, next, moveNote, moveShort, moveWarn: !fromComment && next.missing }
}

// PIR-13, PIR-14: post the review and record it — the audit entry (as other Azure DevOps writes) and, for the Discussion
// in PI Review's memory, a fresh read later. Returns the new comment's ID.
// PIR-34: Edit review… — replace the viewer's own review comment and record it (the audit entry "Edit PI review").
// PIR-76: converted — an old-format comment replaced in the review format ("Convert PI review (old format)").
export async function editAndAudit(env: ReviewEnv, item: AzureWorkItem, commentId: number, form: ReviewForm, text: string, pi: string, converted = false) {
  if (!env.config) throw new Error('Connect the Time Writing connection (with its PAT) to edit a review.')
  const id = await updateReview(env.config, env.pat, item, commentId, text)
  env.addAudit({ actor: 'u-owner', action: converted ? 'Convert PI review (old format)' : 'Edit PI review', entity: 'AzureDevOps Feature', entityId: String(item.id), detail: `${converted ? 'Old-format comment' : 'PI review comment'} ${id} in the Discussion of Feature #${item.id} ${converted ? 'converted to the review format' : 'edited'}${pi ? ` (${piLabel(pi)})` : ''}: ${reviewSummary(form)}.` })
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
    setWriting({ ...startForm(item, pi, env.items, formSetupOf(env), iterations, new Date(), comment), editing: { commentId: comment.id, date: shownDateOf(comment) } })
  }
  // PIR-76 (temporary, LIM-235): Convert… — the form prefilled from an old-format comment of mine (oldFormatForm), the
  // reviewed PI chosen in the form (default the page's PI); saving replaces that comment (the edit of Edit review…).
  function startConvert(item: AzureWorkItem, comment: WorkItemComment, options: string[]) {
    if (!env?.config) return
    const old = oldFormatOf(comment.text)
    if (!old) return
    const base = startForm(item, pi, env.items, formSetupOf(env), iterations, new Date(), comment)
    setWriting({ ...base, initial: oldFormatForm(old, base.initial, base.setup), partly: old.moveValue === 'Partly', editing: { commentId: comment.id, date: shownDateOf(comment) }, converting: { options } })
  }
  // PIR-34: save an edit — a Background jobs entry "Edit review · #id": update the comment, audit, read the Discussion
  // again; a failed edit opens the pop-up again with what was typed, the error and "Post as a new review instead".
  // PIR-76: a conversion is saved the same way, for the reviewed PI chosen in the form.
  function saveEdit(current: Writing, form: ReviewForm, text: string) {
    if (!env?.config || !current.editing) return
    const { item } = current, commentId = current.editing.commentId, config = env.config, converted = Boolean(current.converting)
    const reviewed = converted ? form.reviewedPi || current.pi : current.pi
    setWriting(null)
    const started = runInBackground(`pireview:edit:${item.key}`, converted ? `Convert review · #${item.id}` : `Edit review · #${item.id}`, async (progress) => {
      progress(`Saving the ${converted ? 'converted' : 'edited'} review of #${item.id}…`)
      try { await editAndAudit(env, item, commentId, form, text, reviewed, converted) }
      catch (failure) {
        const message = failure instanceof Error ? failure.message : 'unknown error'
        setWriting({ ...current, initial: form, editing: { ...current.editing!, failed: message } })
        return { text: `The review of #${item.id} was not edited: ${message} The form is open again: try again, or post it as a new review instead.`, failed: true }
      }
      progress(`Reading the Discussion of #${item.id} again…`)
      try { await readDiscussionInto(config, env.pat, item, { fresh: true }) } catch (failure) { return { text: `Edited the review of #${item.id}, but the Discussion could not be read again: ${failure instanceof Error ? failure.message : 'unknown error'}`, failed: true } }
      return { text: `${converted ? 'Converted the old-format comment' : 'Edited the review'} of #${item.id} and read back: ${reviewSummary(form)}.`, failed: false }
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
      try { await readDiscussionInto(config, env.pat, item, { fresh: true }) } catch (failure) { return { text: `Posted to the Discussion of #${item.id}, but it could not be read again: ${failure instanceof Error ? failure.message : 'unknown error'} Use ↻ Read again in the Feature.`, failed: true } }
      return { text: `Posted to the Discussion of #${item.id} and read back: ${reviewSummary(form)}.`, failed: false }
    })
    if (!started) recordJob(`pireview:post:${item.key}:busy`, `Post review · #${item.id}`, { text: `A review of #${item.id} is being posted already: wait for it, then write again if needed. Nothing else was posted.`, failed: true })
  }
  return { writing, start, startEdit, startConvert, post, postNew, cancel: () => setWriting(null) }
}

// PIR-34: Edit review… on PI Review and My PI Review — the viewer's own review of a Feature for the chosen PI
// (ownReviewOf; PIR-49: headed "Feature Review for <the chosen PI>"), by the viewer's work email, else their display
// name; none when `others` (a lead showing another person's Features in My PI Review).
export function useOwnReview(pi: string, { others = false, me }: { others?: boolean; me?: { email?: string; name?: string } } = {}) {
  const env = useContext(ReviewEnvContext)
  const viewer = { email: me?.email || env?.email || '', name: me?.name || env?.name || '' }
  const period = reviewPeriodOf(pi)
  return (item: AzureWorkItem) => {
    if (others) return undefined
    const entry = discussionOf(item.key)
    return ownReviewOf(entry?.state === 'done' ? entry.comments : undefined, period, viewer, formSetupOf(env))
  }
}

// PIR-18: forget a Feature's Discussion read in this page load after a review was posted from elsewhere (the Close
// pop-up), so PI Review reads it again.
export const forgetDiscussion = (item: Pick<AzureWorkItem, 'key'>) => { if (discussionOf(item.key)) setDiscussion(item.key, undefined) }

// PIR-17, PIR-35: read the Discussions of the given Features (My PI Review: the Features shown; PI Review: my own Features
// of the chosen PI) that are not read yet in this page load — 3 at a time, waiting when Azure DevOps asks to slow down
// (readDiscussions, PIR-06), only the comments on or after "PI Review starts from" (PIR-33) — once per Feature list, and
// again when that date changed. Nothing is read while blocked. Returns how many of them are still to be read while that
// read runs (0: none), for the page's status line.
const running = new Set<string>(), runningListeners = new Set<() => void>()
let runningVersion = 0
const setRunning = (key: string, on: boolean) => { if (on) running.add(key); else running.delete(key); runningVersion += 1; for (const listener of runningListeners) listener() }
const subscribeRunning = (listener: () => void) => { runningListeners.add(listener); return () => { runningListeners.delete(listener) } }
// KB-140: the Feature lists whose automatic read has finished (in this page load), so a page can offer Retry for a
// Discussion it left unread (a read stopped by a second 429 or a refused PAT).
const settled = new Set<string>()
export function useDiscussionsRead(config: AzureConfig | null, pat: string, features: readonly AzureWorkItem[], blocked: string, onDone?: (result: BulkReadResult, count: number) => void) {
  return useDiscussionsReadState(config, pat, features, blocked, onDone).pending
}
// pending: as useDiscussionsRead; settled — the read of this list has finished (nothing is read for it now).
export function useDiscussionsReadState(config: AzureConfig | null, pat: string, features: readonly AzureWorkItem[], blocked: string, onDone?: (result: BulkReadResult, count: number) => void) {
  useSyncExternalStore(subscribeDiscussions, discussionsVersion)
  useSyncExternalStore(subscribeRunning, () => runningVersion)
  const readKey = useRef('')
  const listKey = features.length ? `${discussionsFrom()}|${features.map((item) => item.key).join(',')}` : ''
  useEffect(() => {
    if (blocked || !config || !listKey || readKey.current === listKey) return
    readKey.current = listKey
    // KB-140: a Discussion shown as being read while no read of it is under way (its read was dropped) is read again.
    const targets = features.filter((item) => { const entry = discussionOf(item.key); return !entry || (entry.state === 'loading' && !discussionReading(item)) })
    if (!targets.length) return
    const byId = new Map(targets.map((item) => [item.id, item]))
    setRunning(listKey, true)
    void readDiscussions(targets.map((item) => item.id), (id) => readDiscussionInto(config, pat, byId.get(id)!), { rateWait: rateLimitWait }).then((result) => { settled.add(listKey); setRunning(listKey, false); onDone?.(result, targets.length) })
  }, [listKey, blocked, config, pat, features]) // eslint-disable-line react-hooks/exhaustive-deps
  const done = !blocked && Boolean(listKey) && settled.has(listKey) && !running.has(listKey)
  if (blocked || !running.has(listKey)) return { pending: 0, settled: done }
  return { pending: features.filter((item) => { const state = discussionOf(item.key)?.state; return state !== 'done' && state !== 'error' }).length, settled: false }
}

// PIR-37: Post for several Features — ONE Background jobs entry "PI review for {n} Features": per Feature the Discussion
// read again, then a new comment (postAndAudit, as Write review…) or my review replaced (editAndAudit, as Edit review…),
// then read again so the table shows it; a failure on one never stops the others; the job ends with what was posted,
// replaced and failed, with the reasons. One bulk job at a time (no double post); a Feature whose single post or edit is
// running fails with that reason. me / others / iterations: as useOwnReview.
// KB-155, PIR-80: start — the pop-up reads the ticked Features' Discussions again first (3 at a time, waiting when
// Azure DevOps asks to slow down, as the page's read) and decides which get my review replaced from what Azure DevOps
// holds then — not from the Discussions as read when the page opened, which may be older than a review written or
// deleted since (in Azure DevOps, another tab): those made the job refuse the Feature. opening: the Features being
// read for the pop-up (null when none).
// PIR-83: each row starts from that Feature's review (rowStartOf: mine, else the latest of the PI, else my old-format
// comment, else the defaults). PIR-84: post — the rows to write (each its own review) 3 at a time with the rate-limit
// handling of the reads; skipped: the rows not written (Unchanged, Blocked), named in the result; Retry failed in the
// finished entry runs the failed rows again with the same values, as a new job.
export function useBulkReview(pi: string, iterations: PiIterations & { problem?: string }, { others = false, me }: { others?: boolean; me?: { email?: string; name?: string } } = {}) {
  const writer = useReviewViewer(), { env } = writer
  const [writing, setWriting] = useState<BulkWriting | null>(null)
  const [opening, setOpening] = useState<AzureWorkItem[] | null>(null)
  const viewerOf = (current: ReviewEnv) => ({ email: me?.email || current.email || '', name: me?.name || current.name || '' })
  async function start(items: AzureWorkItem[]) {
    if (!env?.config || !items.length || opening || reviewPageBlock(writer)) return
    const config = env.config, byId = new Map(items.map((item) => [item.id, item]))
    setOpening(items)
    try { await readDiscussions(items.map((item) => item.id), (id) => readDiscussionInto(config, env.pat, byId.get(id)!, { fresh: true }), { rateWait: rateLimitWait }) } finally { setOpening(null) }
    const setup = formSetupOf(env), viewer = viewerOf(env)
    setWriting(startBulkForm(items.map((item) => ({ item })), pi, env.items, setup, iterations, new Date(), (item, movePi) => rowStartOf(discussionOf(item.key), reviewedPiOf(item, pi), viewer, setup, movePi, others)))
  }
  function run(jobs: readonly BulkJob[], skipped: readonly BulkOutcome[], reviewed: string, setup: PiFormSetup) {
    if (!env?.config || !jobs.length || reviewPageBlock(writer)) return
    const config = env.config, viewer = viewerOf(env)
    const label = `PI review for ${jobs.length} Feature${jobs.length === 1 ? '' : 's'}`
    const keys = jobs.map(({ target }) => target.item.key)
    const started = runInBackground('pireview:bulk', label, async (progress) => {
      markBulk(keys, true)
      try {
        const outcomes = await runBulkReview(jobs, {
          busy: (item) => reviewPostBlock(writer, item) || (isRunning(`pireview:post:${item.key}`) || isRunning(`pireview:edit:${item.key}`) ? `A review of #${item.id} is being written already (see the top bar). Nothing was posted to it here.` : ''),
          ownNow: async (item) => {
            await readDiscussionInto(config, env.pat, item, { fresh: true })
            const entry = discussionOf(item.key)
            if (entry?.state !== 'done' || entry.capped) throw new Error('The complete Discussion is unavailable.')
            return ownReviewIn(entry, reviewed, viewer, setup, others)?.comment
          },
          post: (item, form, text) => postAndAudit(env, item, form, text, reviewed),
          edit: (item, commentId, form, text) => editAndAudit(env, item, commentId, form, text, reviewed),
          reread: (item) => readDiscussionInto(config, env.pat, item, { fresh: true }),
        }, progress, { rateWait: rateLimitWait })
        const again = failedJobs(jobs, outcomes)
        return { ...bulkSummary([...outcomes, ...skipped]), ...(again.length ? { action: { label: `Retry failed (${again.length})`, run: () => run(again, [], reviewed, setup) } } : {}) }
      } finally { markBulk(keys, false) }
    })
    if (!started) recordJob('pireview:bulk:busy', label, { text: 'A PI review for several Features is being posted already: wait for it to finish, then write again. Nothing was posted.', failed: true })
  }
  function post(jobs: readonly BulkJob[], skipped: readonly BulkOutcome[] = []) {
    if (!writing || writing.problem) return
    const { pi: reviewed, setup } = writing
    setWriting(null)
    run(jobs, skipped, reviewed, setup)
  }
  return { writing, opening, start, post, cancel: () => setWriting(null) }
}
