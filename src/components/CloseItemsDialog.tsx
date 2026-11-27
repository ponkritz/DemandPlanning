import { useState } from 'react'
import { closeSelection, defaultTicks, toggleTick, type CloseRow } from '../closeList'
import type { AzureWorkItem } from '../domain'
import { recordJob } from '../backgroundJobs'
import { buildReviewComment, reviewFormProblems, reviewPostBlock, reviewSummary, type ReviewForm } from '../piReviewPost'
import { piLabel } from '../piReview'
import { ReviewFields } from '../pages/PiReviewForm'
import { formSetupOf, forgetDiscussion, postAndAudit, startForm, useReviewViewer } from '../piReviewWriter'
import { Modal, Notice, WriteBlocked } from './ui'
import { usePiIterations } from '../pages/usePiChoice'

// BKL-39: the pop-up of Close Feature / Close User Story — every open item that would close, with a tick box (yours
// ticked, other people's not), its type, #ID (opens it in Azure DevOps), title, owner and state. Close shows how many
// are ticked; a month Time Writing Task among them asks first whether its hours are up to date. BKL-43: a later month's
// Time Writing Task under a Feature closed early is listed to be Removed with 0 h (ticked, whoever it belongs to).
// PIR-18: when exactly one Feature is ticked, its PI review is asked in the pop-up (Move to next PI pre-selected No, the
// Review meeting advice required, the texts optional) and posted first; the items close only once it is posted. A
// failed post closes nothing: the person chooses Close without the review, or Cancel. Without the right to post (or
// with several Features) the review is not asked and Close works as before.
// PIR-25: Moves to is the next PI by the Azure DevOps iteration dates (the iterations are read when the review is asked),
// else by the PI number, and says which.
export function CloseItemsDialog({ title, intro, rows, asked, blocked, onConfirm, onClose }: { title: string; intro: string; rows: CloseRow[]; asked?: number; blocked?: string; onConfirm: (items: ReturnType<typeof closeSelection>) => void; onClose: () => void }) {
  const [ticked, setTicked] = useState(() => defaultTicks(rows, asked))
  const [hoursDone, setHoursDone] = useState(false)
  const selection = closeSelection(rows, ticked)
  // PIR-18: the review of the one Feature ticked.
  const viewer = useReviewViewer()
  const features = selection.items.filter((item) => item.workItemType === 'Feature')
  const reviewed = features.length === 1 && viewer.env ? features[0] : undefined
  const reviewBlock = reviewed ? reviewPostBlock(viewer, reviewed) : ''
  const asking = Boolean(reviewed && !reviewBlock)
  // PIR-19: the form setup in use when the pop-up opened, kept while it is open.
  const [setup] = useState(() => formSetupOf(viewer.env))
  const [forms, setForms] = useState<Record<number, { form: ReviewForm; pi: string; partly: boolean; moveNote: string; moveShort: string; moveWarn: boolean; prefilledOther?: string }>>({})
  // PIR-25: the iterations for the next PI by its dates; until they are read (or when they cannot be), the PI number.
  const iterations = usePiIterations({ config: viewer.env?.config ?? null, pat: viewer.env?.pat ?? '', isSample: viewer.env?.isSample ?? false }, asking)
  const start = reviewed && viewer.env ? forms[reviewed.id] ?? (() => { const writing = startForm(reviewed, '', viewer.env!.items, setup, { list: iterations.list, reading: !iterations.done }); return { form: writing.initial, pi: writing.pi, partly: writing.partly, moveNote: writing.moveNote, moveShort: writing.moveShort, moveWarn: writing.moveWarn, prefilledOther: writing.prefilledOther } })() : undefined
  const problems = asking && start ? reviewFormProblems(start.form, { optionalTexts: true, setup, needsPi: false }) : []
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [postError, setPostError] = useState('')
  async function confirm() {
    if (!asking || !reviewed || !start || !viewer.env) { onConfirm(selection); return }
    setTried(true)
    if (problems.length) return
    setBusy(true); setPostError('')
    try {
      await postAndAudit(viewer.env, reviewed, start.form, buildReviewComment(start.form, setup), start.pi)
      forgetDiscussion(reviewed)
      recordJob(`pireview:post:${reviewed.key}`, `Post review · #${reviewed.id}`, { text: `Posted to the Discussion of #${reviewed.id} before closing it: ${reviewSummary(start.form)}.`, failed: false })
      onConfirm(selection)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'The review was not posted.'
      recordJob(`pireview:post:${reviewed.key}`, `Post review · #${reviewed.id}`, { text: `The review was not posted: ${message} Nothing was closed.`, failed: true })
      setPostError(message)
    } finally { setBusy(false) }
  }
  const owner = (item: AzureWorkItem) => item.assignedTo?.trim() || 'Unassigned'
  return <Modal title={title} eyebrow="AZURE DEVOPS WRITE" wide={asking} onClose={onClose}>
    <div className="close-items">
      <p className="muted">{intro}</p>
      <ul className="close-list" aria-label="Items to close">
        {rows.map((row) => <li key={row.item.id} style={{ paddingLeft: `${row.depth * 20}px` }} className={row.mine ? '' : 'close-other'}>
          <label className="checkbox-label"><input type="checkbox" aria-label={`Close #${row.item.id}`} checked={ticked.has(row.item.id)} onChange={(event) => setTicked(toggleTick(rows, ticked, row.item.id, event.target.checked))} />
            <span className="close-type">{row.timeWriting ? 'Time Writing story' : row.monthTask ? 'Time Writing Task' : row.item.workItemType}</span>
          </label>
          <a href={row.item.url} target="_blank" rel="noreferrer" className="close-id" title={`Open #${row.item.id} in Azure DevOps`}>#{row.item.id}</a>
          <span className="close-title">{row.item.title}</span>
          <small className="muted">{row.mine ? 'yours' : owner(row.item)} · {row.remove ? `${row.item.state} → Removed, 0 h (later month)` : row.item.state}</small>
        </li>)}
      </ul>
      {rows.some((row) => row.remove) && <p className="muted">The Feature closes before these months: their Time Writing Tasks (everyone’s, without Completed Work) are set to 0 h Original Estimate and Removed.</p>}
      {rows.some((row) => !row.mine && !row.remove) && <p className="muted">Other people’s items are not ticked: tick them only if you mean to close them. A parent closes only with everything open below it.</p>}
      {selection.needsHours && <label className="checkbox-label close-hours"><input type="checkbox" checked={hoursDone} onChange={(event) => setHoursDone(event.target.checked)} />I have updated the hours (Original Estimate and Completed Work) of the Time Writing Tasks being closed — they become read-only.</label>}
      {!selection.items.length && !selection.removals.length && <Notice tone="info">Tick what to close.</Notice>}
      {features.length > 1 && <p className="muted">{features.length} Features close: their PI reviews are not asked here — write them in PI Review or My PI Review.</p>}
      {reviewed && reviewBlock && <p className="muted">The PI review of Feature #{reviewed.id} is not asked: {reviewBlock}</p>}
      {asking && reviewed && start && <section className="close-review" aria-label="PI review">
        <h3>PI review of Feature #{reviewed.id}{start.pi ? ` · ${piLabel(start.pi)}` : ''}</h3>
        {start.prefilledOther && <p className="muted">Prefilled from the latest review comment, written for {start.prefilledOther}: check it before posting.</p>}
        <ReviewFields form={start.form} onChange={(form) => setForms({ ...forms, [reviewed.id]: { ...start, form } })} pi={start.pi} partly={start.partly} optionalTexts idPrefix="close-review" setup={setup} moveNote={start.moveNote} moveShort={start.moveShort} moveWarn={start.moveWarn} about={start.form.reviewedPi ? `Posted as a new comment in the Feature’s Discussion before the items close, headed “Feature Review for ${start.form.reviewedPi}” (it counts for that PI only).` : 'Posted as a new comment in the Feature’s Discussion before the items close. The Feature is in no PI with a number, so the comment has no “Feature Review for PI …” heading and counts as no PI review.'} />
        {tried && problems.length > 0 && <Notice tone="error">{problems.join(' ')}</Notice>}
      </section>}
      {blocked && <Notice tone="warning">{blocked}</Notice>}
      {postError && <Notice tone="error">The review was not posted: {postError} Nothing was closed. Close without the review, or Cancel and try again later.</Notice>}
      <div className="modal-actions">{busy && <WriteBlocked reason="Posting the review…" />}<button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button>
        {postError && <button type="button" className="ghost" disabled={busy} onClick={() => onConfirm(selection)}>Close without the review</button>}
        <button type="button" className="primary" disabled={busy || Boolean(blocked) || (!selection.items.length && !selection.removals.length) || (selection.needsHours && !hoursDone)} onClick={() => void confirm()}>{`${asking ? 'Post review and close' : 'Close'} ${selection.items.length} item${selection.items.length === 1 ? '' : 's'}${selection.removals.length ? `, remove ${selection.removals.length}` : ''}`}</button></div>
    </div>
  </Modal>
}
