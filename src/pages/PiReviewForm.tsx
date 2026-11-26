import { shownDateOf } from '../azureDevOps'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Info, Modal, Notice, WriteBlocked } from '../components/ui'
import { formatDateTime } from '../format'
import { buildReviewComment, fieldValue, moveDefaultNote, noneChoice, reviewBlocks, reviewFormProblems, reviewSummary, withFieldValue, withNoTexts, type ReviewBlock, type ReviewForm, type ReviewMove } from '../piReviewPost'
import { reviewFooter } from '../piReview'
import { piLabel } from '../piReview'
import { builtInFormSetup, listHelp, type PiFormField, type PiFormSetup } from '../piReviewSetup'
import type { BulkWriting, Writing } from '../piReviewWriter'

// PIR-13, PIR-14: the review fields (one column, UI-STANDARDS §3) and the Preview of the exact comment. Move to next PI:
// Yes / No only, No pre-selected; with Yes, the PI it moves to and an optional reason (hidden with No: kept as typed, the
// reason posted only with Yes). The Review meeting advice has no default.
// optionalTexts (PIR-18, the Close pop-up): Learnings and Struggles marked (optional).
// PIR-19, PIR-20: the fields, their order, labels, help, required and defaults are those of the form setup in use; a
// paragraph is a text area, a choice a segmented control (one option to pick), Move to next PI keeps its Moves to and
// Reason.
// PIR-32 (product owner, 25 Nov 2026: "Minimize the text … Keep the form clean"): the help of the fields, the default
// (Move pre-selected No — the No itself stays visible, checked, UI-STANDARDS §12) and `about` (what posting does) are in
// one "ⓘ How to fill in" above the fields; the Preview's explanation in its ⓘ; labels, the Partly hint, errors and the
// read-back problems stay visible.
// PIR-25: moveNote — where Moves to came from (today's PI by the Azure DevOps iteration dates, a fallback or the latest
// review), in the ⓘ beside it; moveShort — one line under it; moveWarn — a fallback was used, so the line is a warning.
export function ReviewFields({ form, onChange, pi, partly, optionalTexts = false, idPrefix = 'review', setup = builtInFormSetup(), moveNote = '', moveShort = '', moveWarn = false, about }: { form: ReviewForm; onChange: (form: ReviewForm) => void; pi: string; partly: boolean; optionalTexts?: boolean; idPrefix?: string; setup?: PiFormSetup; moveNote?: string; moveShort?: string; moveWarn?: boolean; about?: ReactNode }) {
  const set = <K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) => onChange({ ...form, [key]: value })
  const paragraph = (key: string, label: string, required: boolean, value: string, onText: (text: string) => void, rows = 3, disabled = false) =>
    <label key={key}>{label}<textarea rows={rows} required={required} disabled={disabled} value={value} onChange={(event) => onText(event.target.value)} /></label>
  // PIR-27: "No learnings or struggles" — before the first of the two fields, not pre-ticked; ticked it writes "None" in
  // them and disables their text boxes, unticked it restores what was typed.
  const none = noneChoice(setup)
  const noneTicked = Boolean(form.noTexts)
  const noneBox = none && <div key="no-texts" className="pir-review-none"><label className="checkbox-label"><input type="checkbox" checked={noneTicked} onChange={(event) => onChange(withNoTexts(form, setup, event.target.checked))} />{none.label}</label></div>
  const firstNone = setup.fields.find((field) => none?.fields.includes(field.id as 'learnings'))?.id
  const choice = (name: string, options: readonly string[], value: string, required: boolean, onPick: (value: string) => void) =>
    <div className="segmented" role="radiogroup" aria-label={name}>{options.map((option) => <label key={option} className={value === option ? 'active' : undefined}><input type="radio" name={`${idPrefix}-${name}`} required={required} checked={value === option} onChange={() => onPick(option)} />{option}</label>)}</div>
  // PIR-18: in the Close pop-up every paragraph is optional.
  const optional = (field: PiFormField) => field.type === 'longtext' ? !field.required || optionalTexts : !field.required
  const labelOf = (field: PiFormField) => `${field.label}${optional(field) ? ' (optional)' : ''}`
  const helpOf = (field: PiFormField) => field.help || (field.id === 'learnings' || field.id === 'struggles' ? listHelp : '')
  const fieldNode = (field: PiFormField) => {
    if (field.id === 'move') return <fieldset key="move" className="plain-fieldset pir-review-move">
      <legend>{field.label}</legend>
      {choice('Move to next PI', ['Yes', 'No'], form.move, true, (value) => set('move', value as ReviewMove))}
      {partly && <small className="muted">The latest review said Partly: choose Yes or No{field.defaultValue ? ` (${field.defaultValue} is pre-selected)` : ''}.</small>}
      {form.move === 'Yes' && <>
        <div className="pir-moves-to">
          <label>Moves to<input value={form.movePi} required onChange={(event) => set('movePi', event.target.value)} /></label>
          <small className={moveWarn ? 'pir-next-pi pir-next-pi-warn' : 'pir-next-pi muted'}>{moveShort || 'The next PI.'} <Info iconOnly label="Where the next PI comes from"><p>The PI after today’s PI{pi ? ` (the Feature’s PI is ${piLabel(pi)})` : ''}.</p>{moveNote && <p className="pir-next-pi-note">{moveNote}</p>}<p>Change it if needed.</p></Info></small>
        </div>
        {paragraph('moveReason', 'Reason (optional)', false, form.moveReason, (text) => set('moveReason', text), 2)}
      </>}
    </fieldset>
    if (field.type === 'dropdown') return <fieldset key={field.id} className="plain-fieldset">
      <legend>{labelOf(field)}</legend>
      {choice(field.id === 'review' ? 'Review meeting' : field.label, field.options, fieldValue(form, field.id), !optional(field), (value) => onChange(withFieldValue(form, field.id, value)))}
    </fieldset>
    const disabled = noneTicked && Boolean(none?.fields.includes(field.id as 'learnings'))
    return paragraph(field.id, labelOf(field), !optional(field), fieldValue(form, field.id), (text) => onChange(withFieldValue(form, field.id, text)), field.id === 'remarks' ? 2 : 3, disabled)
  }
  const helps = [
    ...setup.fields.flatMap((field) => field.id === 'move' ? [[field.label, [moveDefaultNote(setup), 'With Yes, Moves to (the next PI) and the Reason — why it moves, or what is left — are asked; with No they are hidden and the reason is not posted.', field.help].filter(Boolean).join(' ')] as const] : helpOf(field) ? [[field.label, helpOf(field)] as const] : []),
    ...(none ? [[none.label, none.help] as const] : []),
  ]
  return <div className="pir-review-columns">
    <div className="pir-review-fields">
      <div className="pir-review-help"><Info label="How to fill in">{about && <p>{about}</p>}<ul>{helps.map(([label, help]) => <li key={label}><strong>{label}</strong>: {help}</li>)}</ul></Info></div>
      {setup.fields.flatMap((field) => field.id === firstNone ? [noneBox, fieldNode(field)] : [fieldNode(field)])}
    </div>
    <section className="pir-review-preview" aria-label="Preview">
      <h3>Preview <Info iconOnly label="About the preview">The comment posted, as you, to the Feature’s Discussion in Azure DevOps, as it will look there: a bulleted list, each paragraph’s lines as bullets under its heading (what you type is sent as text: &lt;, &gt; and &amp; shown as typed). The last line marks it as posted from this app; PI Review ignores it.</Info></h3>
      <ReviewPreview blocks={reviewBlocks(form, setup)} />
    </section>
  </div>
}

// PIR-14: the Preview — the same blocks the comment's HTML is built from (reviewCommentHtml), rendered as elements (the
// texts as text, never as HTML), so it looks as the comment will in Azure DevOps.
export function ReviewPreview({ blocks }: { blocks: readonly ReviewBlock[] }) {
  return <div className="pir-review-comment">
    {blocks.length > 0 && <ul>{blocks.map((block, index) => <li key={index}>{block.text}{block.items?.length ? block.numbered ? <ol>{block.items.map((item, at) => <li key={at}>{item}</li>)}</ol> : <ul>{block.items.map((item, at) => <li key={at}>{item}</li>)}</ul> : null}</li>)}</ul>}
    <p>{reviewFooter}</p>
  </div>
}

// PIR-13, PIR-32: what posting does — in the form's ⓘ.
export const postingNote = 'Posting adds a new comment to the Feature’s Discussion; PI Review reads the newest, so a correction is posted as a new review.'

// PIR-13, PIR-34: the review action of a Feature (a table row, the drawer's footer) — **Edit review…** when the viewer's
// own review counts for the chosen PI (own), else **Review…** (PIR-39: "Instead of Write Review, Just 'Review' is enough"); one button, disabled with the reason.
export function ReviewAction({ item, own, why, primary = false, onWrite, onEdit }: { item: Pick<Writing['item'], 'id'>; own?: { comment: { date: string } }; why: string; primary?: boolean; onWrite: () => void; onEdit: () => void }) {
  const className = primary ? 'primary' : 'ghost'
  return own
    ? <button type="button" className={className} disabled={Boolean(why)} title={why || `Edit your review of Feature #${item.id} (${formatDateTime(shownDateOf(own.comment))})`} aria-label={`Edit review of Feature ${item.id}`} onClick={onEdit}>Edit review…</button>
    : <button type="button" className={className} disabled={Boolean(why)} title={why || `Review Feature #${item.id}: write its PI review`} aria-label={`Review Feature ${item.id}`} onClick={onWrite}>Review…</button>
}

// PIR-34: what saving an edit does — in the form's ⓘ.
export const editingNote = 'Saving replaces your review comment in the Feature’s Discussion (Azure DevOps marks it edited; its date stays, so it still counts for the same PI).'

// PIR-13: the "Write review" pop-up (UI-STANDARDS §3, §4): the fields and the Preview; Cancel and **Post to Azure
// DevOps**, disabled with the reason; Post opens the confirmation pop-up naming the Feature, then onPost.
// PIR-34: with writing.editing, the "Edit review" pop-up — prefilled from the viewer's own review comment; **Save to Azure
// DevOps** replaces that comment (onPost); after a failed save the error and **Post as a new review instead** (onPostNew).
export function ReviewDialog({ writing, blocked, onPost, onPostNew, onClose }: { writing: Writing; blocked: string; onPost: (form: ReviewForm, text: string) => void; onPostNew?: (form: ReviewForm, text: string) => void; onClose: () => void }) {
  const { item: feature, pi, prefilledFrom, prefilledOther, partly, setup, moveNote, moveShort, moveWarn, editing } = writing
  const [form, setForm] = useState(writing.initial)
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState<'' | 'save' | 'new'>('')
  const problems = reviewFormProblems(form, { setup })
  const why = blocked || (tried && problems.length ? 'Fix the fields above first.' : '')
  function submit(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (blocked || problems.length) return
    setConfirming('save')
  }
  const asNew = () => { setTried(true); if (!blocked && !problems.length) setConfirming('new') }
  const editingThis = Boolean(editing) && confirming !== 'new'
  return <Modal title={editing ? `Edit review of Feature #${feature.id}` : `Review of Feature #${feature.id}`} eyebrow="PI REVIEW · AZURE DEVOPS WRITE" wide onClose={onClose}>
    <form className="pir-review-form" onSubmit={submit} noValidate>
      <p className="pir-title"><strong>{feature.title}</strong> <span className="muted">· {pi ? piLabel(pi) : 'no PI'} · Assigned to {feature.assignedTo || 'nobody'}</span></p>
      {editing ? <p className="muted pir-review-note">Editing your review comment of {formatDateTime(editing.date)}.</p>
        : prefilledFrom && <p className="muted pir-review-note">Prefilled from the latest review comment ({prefilledFrom.author}, {formatDateTime(prefilledFrom.date)}){prefilledOther ? `, written for ${prefilledOther}: check it before posting` : ''}.</p>}
      <ReviewFields form={form} onChange={setForm} pi={pi} partly={partly} setup={setup} moveNote={moveNote} moveShort={moveShort} moveWarn={moveWarn} about={editing ? editingNote : postingNote} />
      {tried && problems.length > 0 && <Notice tone="error">{problems.join(' ')}</Notice>}
      {editing?.failed && <Notice tone="error">The review was not edited: {editing.failed} Try again, or post it as a new review instead (PI Review reads the newest comment).</Notice>}
      <div className="modal-actions"><WriteBlocked reason={why} /><button type="button" className="ghost" onClick={onClose}>Cancel</button>{editing?.failed && onPostNew && <button type="button" className="ghost" disabled={Boolean(blocked)} onClick={asNew}>Post as a new review instead</button>}<button type="submit" className="primary" disabled={Boolean(blocked)} title={blocked || undefined}>{editing ? 'Save to Azure DevOps' : 'Post to Azure DevOps'}</button></div>
    </form>
    {confirming && <Modal title={editingThis ? `Save the edited review of Feature #${feature.id}?` : `Post the review to Feature #${feature.id}?`} eyebrow="PI REVIEW · AZURE DEVOPS WRITE" onClose={() => setConfirming('')}>
      {editingThis ? <p>Your review comment of {formatDateTime(editing!.date)} in the Discussion of Feature #{feature.id} “{feature.title}” is replaced in Azure DevOps, as you (your PAT): <strong>{reviewSummary(form)}</strong>.</p>
        : <p>A new comment is added to the Discussion of Feature #{feature.id} “{feature.title}” in Azure DevOps, as you (your PAT): <strong>{reviewSummary(form)}</strong>.</p>}
      <p className="muted">{editingThis ? 'Azure DevOps marks it edited; its date stays, so it still counts for the same PI.' : 'It cannot be deleted from this app; to correct it, write the review again — the newest comment counts.'}</p>
      <div className="modal-actions"><button type="button" className="ghost" onClick={() => setConfirming('')}>Cancel</button><button type="button" className="primary" onClick={() => { const text = buildReviewComment(form, setup); setConfirming(''); if (editingThis) onPost(form, text); else (editing ? onPostNew ?? onPost : onPost)(form, text) }}>{editingThis ? `Save review to #${feature.id}` : `Post review to #${feature.id}`}</button></div>
    </Modal>}
  </Modal>
}

// PIR-36: the review written once for several Features (My PI Review, "Update review for {n}…"): a full-size pop-up
// (UI-STANDARDS §4, a bulk action) naming each Feature and what the post does to it — a new comment, or my review of the
// chosen PI (its date) replaced — and saying how many are replaced; the same fields, form setup, Moves to and Preview as
// the single form (ReviewFields), the comment the same for every Feature. Post opens the confirmation naming the
// counts; Post review to {n} Features hands it to the background job (PIR-37) and closes. problem (Features in
// different PIs) and blocked disable Post with the reason.
export function BulkReviewDialog({ writing, blocked, onPost, onClose }: { writing: BulkWriting; blocked: string; onPost: (form: ReviewForm, text: string) => void; onClose: () => void }) {
  const { targets, pi, setup, moveNote, moveShort, moveWarn, problem } = writing
  const [form, setForm] = useState(writing.initial)
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const sent = useRef(false) // PIR-37: one post per pop-up, however often the button is pressed
  const problems = reviewFormProblems(form, { setup })
  const stop = blocked || problem
  const why = stop || (tried && problems.length ? 'Fix the fields above first.' : '')
  const replaced = targets.filter((target) => target.replace)
  const fresh = targets.length - replaced.length
  const features = (count: number) => `${count} Feature${count === 1 ? '' : 's'}`
  const ids = (list: typeof targets) => list.map(({ item }) => `#${item.id}`).join(', ')
  function submit(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (stop || problems.length) return
    setConfirming(true)
  }
  return <Modal title={`Review of ${features(targets.length)}`} eyebrow="PI REVIEW · AZURE DEVOPS WRITE" full onClose={onClose}>
    <form className="pir-review-form pir-bulk-form" onSubmit={submit} noValidate>
      <div className="modal-scroll pir-bulk-scroll">
        <p className="pir-review-note">The same review is posted to each Feature below{pi ? ` (${piLabel(pi)})` : ''}, as you (your PAT). <strong>{replaced.length ? `${features(replaced.length)} already ${replaced.length === 1 ? 'has' : 'have'} your review of this PI: it is replaced.` : 'None has your review of this PI yet: each gets a new comment.'}</strong></p>
        <div className="azure-table pir-bulk-list"><table aria-label="Features to review">
          <thead><tr><th scope="col">ID</th><th scope="col">Title</th><th scope="col">State</th><th scope="col">Posting</th></tr></thead>
          <tbody>{targets.map(({ item, replace }) => <tr key={item.key}>
            <td className="nowrap">#{item.id}</td><td>{item.title}</td><td>{item.state}</td>
            <td>{replace ? <span className="warning-text">Replaces your review of {formatDateTime(replace.date)}</span> : 'New comment'}</td>
          </tr>)}</tbody>
        </table></div>
        <ReviewFields form={form} onChange={setForm} pi={pi} partly={false} setup={setup} moveNote={moveNote} moveShort={moveShort} moveWarn={moveWarn} idPrefix="bulk-review" about={`${bulkNote} ${editingNote}`} />
        {tried && problems.length > 0 && <Notice tone="error">{problems.join(' ')}</Notice>}
      </div>
      <div className="modal-actions"><WriteBlocked reason={why} /><button type="button" className="ghost" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={Boolean(stop)} title={stop || undefined}>Post to {features(targets.length)}</button></div>
    </form>
    {confirming && <Modal title={`Post the review to ${features(targets.length)}?`} eyebrow="PI REVIEW · AZURE DEVOPS WRITE" onClose={() => setConfirming(false)}>
      <p>In Azure DevOps, as you (your PAT): <strong>{reviewSummary(form)}</strong>.</p>
      <ul>
        {fresh > 0 && <li>A new comment in the Discussion of {features(fresh)}: {ids(targets.filter((target) => !target.replace))}.</li>}
        {replaced.length > 0 && <li>Your review comment replaced on {features(replaced.length)}: {ids(replaced)}.</li>}
      </ul>
      <p className="muted">It runs in the background (the top bar), one Feature after another; a Feature that fails does not stop the others. A new comment cannot be deleted from this app.</p>
      <div className="modal-actions"><WriteBlocked reason={stop} /><button type="button" className="ghost" onClick={() => setConfirming(false)}>Cancel</button><button type="button" className="primary" disabled={Boolean(stop)} onClick={() => { if (sent.current || stop || problems.length) return; sent.current = true; const text = buildReviewComment(form, setup); setConfirming(false); onPost(form, text) }}>Post review to {features(targets.length)}</button></div>
    </Modal>}
  </Modal>
}
// PIR-36: what posting for several Features does — in the form's ⓘ.
export const bulkNote = 'The same review goes to every Feature listed: a new comment where you have no review of this PI yet.'
