import { useState, type FormEvent, type ReactNode } from 'react'
import { Info, Modal, Notice, WriteBlocked } from '../components/ui'
import { formatDateTime } from '../format'
import { buildReviewComment, fieldValue, moveDefaultNote, noneChoice, reviewBlocks, reviewFormProblems, reviewSummary, withFieldValue, withNoTexts, type ReviewBlock, type ReviewForm, type ReviewMove } from '../piReviewPost'
import { reviewFooter } from '../piReview'
import { piLabel } from '../piReview'
import { builtInFormSetup, listHelp, type PiFormField, type PiFormSetup } from '../piReviewSetup'
import type { Writing } from '../piReviewWriter'

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

// PIR-13: the "Write review" pop-up (UI-STANDARDS §3, §4): the fields and the Preview; Cancel and **Post to Azure
// DevOps**, disabled with the reason; Post opens the confirmation pop-up naming the Feature, then onPost.
export function ReviewDialog({ writing, blocked, onPost, onClose }: { writing: Writing; blocked: string; onPost: (form: ReviewForm, text: string) => void; onClose: () => void }) {
  const { item: feature, pi, prefilledFrom, prefilledOther, partly, setup, moveNote, moveShort, moveWarn } = writing
  const [form, setForm] = useState(writing.initial)
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const problems = reviewFormProblems(form, { setup })
  const why = blocked || (tried && problems.length ? 'Fix the fields above first.' : '')
  function submit(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (blocked || problems.length) return
    setConfirming(true)
  }
  return <Modal title={`Review of Feature #${feature.id}`} eyebrow="PI REVIEW · AZURE DEVOPS WRITE" wide onClose={onClose}>
    <form className="pir-review-form" onSubmit={submit} noValidate>
      <p className="pir-title"><strong>{feature.title}</strong> <span className="muted">· {pi ? piLabel(pi) : 'no PI'} · Assigned to {feature.assignedTo || 'nobody'}</span></p>
      {prefilledFrom && <p className="muted pir-review-note">Prefilled from the latest review comment ({prefilledFrom.author}, {formatDateTime(prefilledFrom.date)}){prefilledOther ? `, written for ${prefilledOther}: check it before posting` : ''}.</p>}
      <ReviewFields form={form} onChange={setForm} pi={pi} partly={partly} setup={setup} moveNote={moveNote} moveShort={moveShort} moveWarn={moveWarn} about={postingNote} />
      {tried && problems.length > 0 && <Notice tone="error">{problems.join(' ')}</Notice>}
      <div className="modal-actions"><WriteBlocked reason={why} /><button type="button" className="ghost" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={Boolean(blocked)} title={blocked || undefined}>Post to Azure DevOps</button></div>
    </form>
    {confirming && <Modal title={`Post the review to Feature #${feature.id}?`} eyebrow="PI REVIEW · AZURE DEVOPS WRITE" onClose={() => setConfirming(false)}>
      <p>A new comment is added to the Discussion of Feature #{feature.id} “{feature.title}” in Azure DevOps, as you (your PAT): <strong>{reviewSummary(form)}</strong>.</p>
      <p className="muted">It cannot be deleted from this app; to correct it, write the review again — the newest comment counts.</p>
      <div className="modal-actions"><button type="button" className="ghost" onClick={() => setConfirming(false)}>Cancel</button><button type="button" className="primary" onClick={() => { setConfirming(false); onPost(form, buildReviewComment(form, setup)) }}>Post review to #{feature.id}</button></div>
    </Modal>}
  </Modal>
}
