import { useContext, useState } from 'react'
import { runInBackground, recordJob } from './backgroundJobs'
import { featurePi, nextPiOf, piText, postReview, prefilledOtherPi, readDiscussionInto, reviewFormFrom, reviewSummary, type NextPi, type ReviewForm, type ReviewViewer } from './piReviewPost'
import { discussionOf, latestComment, piLabel, piOptions, reviewSplit, setDiscussion } from './piReview'
import { ReviewEnvContext, type ReviewEnv } from './reviewEnv'
import { ReadOnlyContext, useCan } from './useCan'
import type { AzureIteration, WorkItemComment } from './azureDevOps'
import type { AzureWorkItem } from './domain'
import { builtInFormSetup, builtInSetup, type PiFormSetup } from './piReviewSetup'

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
export type Writing = { item: AzureWorkItem; pi: string; initial: ReviewForm; prefilledFrom?: WorkItemComment; prefilledOther?: string; partly: boolean; setup: PiFormSetup; next: NextPi; moveNote: string; moveShort: string; moveWarn: boolean }
// PIR-25: the Azure DevOps iterations the next PI is worked out from — the list (null when not read or not readable)
// and whether they are still being read.
export type PiIterations = { list: AzureIteration[] | null; reading?: boolean }
// PIR-19: the form setup in use (the built-in form without a provider or a file).
export const formSetupOf = (env: ReviewEnv | null | undefined) => env?.formSetup ?? builtInSetup

// PIR-13: the form as it starts for a Feature — prefilled from its latest review comment (split by headings) when its
// Discussion was read; the reviewed PI is pi, else the Feature's own PI. Moves to — PIR-25: the PI after today's PI by the
// Azure DevOps iteration dates (not after the reviewed PI) when they give one, else a fallback said so; a Moves to taken from the latest
// review says so. today: the date the next PI is worked out for (the caller's clock; nextPiOf has none).
export function startForm(item: AzureWorkItem, pi: string, items: AzureWorkItem[], setup: PiFormSetup = builtInFormSetup(), iterations: PiIterations = { list: null }, today: Date = new Date()): Writing {
  const reviewed = pi || featurePi(item.iterationPath) || ''
  const entry = discussionOf(item.key)
  const comment = entry?.state === 'done' ? latestComment(entry.comments) : undefined
  const split = comment ? reviewSplit(comment.text, setup) : undefined
  const headings = split?.from === 'Headings'
  const next = nextPiOf(reviewed, iterations.list, piOptions(iterations.list ?? [], items), { reading: iterations.reading, today })
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
  function post(form: ReviewForm, text: string) {
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
  return { writing, start, post, cancel: () => setWriting(null) }
}

// PIR-18: forget a Feature's Discussion read in this page load after a review was posted from elsewhere (the Close
// pop-up), so PI Review reads it again.
export const forgetDiscussion = (item: Pick<AzureWorkItem, 'key'>) => { if (discussionOf(item.key)) setDiscussion(item.key, undefined) }
