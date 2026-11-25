import { useState, type FormEvent } from 'react'
import { Modal, Notice, WriteBlocked } from '../components/ui'
import { formatDateTime } from '../format'
import { buildReviewComment, fieldValue, moveDefaultNote, reviewFormProblems, reviewSummary, withFieldValue, type ReviewForm, type ReviewMove } from '../piReviewPost'
import { piLabel } from '../piReview'
import { builtInFormSetup, listHelp, type PiFormField, type PiFormSetup } from '../piReviewSetup'
import type { Writing } from '../piReviewWriter'

// PIR-13, PIR-14: the review fields (one column, UI-STANDARDS §3) and the Preview of the exact comment. Move to next PI:
// Yes / No only, No pre-selected; the PI it moves to; an optional reason. The Review meeting advice has no default.
// optionalTexts (PIR-18, the Close pop-up): Learnings and Struggles marked (optional).
// PIR-19, PIR-20: the fields, their order, labels, help, required and defaults are those of the form setup in use; a
// paragraph is a text area, a choice a segmented control (one option to pick), Move to next PI keeps its Moves to and
// Reason.
// PIR-25: moveNote — where Moves to came from (the Azure DevOps iteration dates, the PI number or the latest review),
// shown under it.
export function ReviewFields({ form, onChange, pi, partly, optionalTexts = false, idPrefix = 'review', setup = builtInFormSetup(), moveNote = '' }: { form: ReviewForm; onChange: (form: ReviewForm) => void; pi: string; partly: boolean; optionalTexts?: boolean; idPrefix?: string; setup?: PiFormSetup; moveNote?: string }) {
  const set = <K extends keyof ReviewForm>(key: K, value: ReviewForm[K]) => onChange({ ...form, [key]: value })
  const paragraph = (key: string, label: string, help: string, required: boolean, value: string, onText: (text: string) => void, rows = 3) =>
    <label key={key}>{label}<textarea rows={rows} required={required} value={value} onChange={(event) => onText(event.target.value)} />{help && <small>{help}</small>}</label>
  const choice = (name: string, options: readonly string[], value: string, required: boolean, onPick: (value: string) => void) =>
    <div className="segmented" role="radiogroup" aria-label={name}>{options.map((option) => <label key={option} className={value === option ? 'active' : undefined}><input type="radio" name={`${idPrefix}-${name}`} required={required} checked={value === option} onChange={() => onPick(option)} />{option}</label>)}</div>
  // PIR-18: in the Close pop-up every paragraph is optional.
  const optional = (field: PiFormField) => field.type === 'longtext' ? !field.required || optionalTexts : !field.required
  const labelOf = (field: PiFormField) => `${field.label}${optional(field) ? ' (optional)' : ''}`
  const fieldNode = (field: PiFormField) => {
    if (field.id === 'move') return <fieldset key="move" className="plain-fieldset pir-review-move">
      <legend>{field.label}</legend>
      {choice('Move to next PI', ['Yes', 'No'], form.move, true, (value) => set('move', value as ReviewMove))}
      <small className="muted">{[partly ? `The latest review said Partly: choose Yes or No${field.defaultValue ? ` (${field.defaultValue} is pre-selected)` : ''}.` : moveDefaultNote(setup), field.help].filter(Boolean).join(' ')}</small>
      <label>Moves to<input value={form.movePi} required onChange={(event) => set('movePi', event.target.value)} /><small className="pir-next-pi">The next PI after {pi ? piLabel(pi) : 'the Feature’s PI'}. {moveNote ? `${moveNote} ` : ''}Change it if needed.</small></label>
      {paragraph('moveReason', 'Reason (optional)', 'Why it moves, or what is left.', false, form.moveReason, (text) => set('moveReason', text), 2)}
    </fieldset>
    if (field.type === 'dropdown') return <fieldset key={field.id} className="plain-fieldset">
      <legend>{labelOf(field)}</legend>
      {choice(field.id === 'review' ? 'Review meeting' : field.label, field.options, fieldValue(form, field.id), !optional(field), (value) => onChange(withFieldValue(form, field.id, value)))}
      {field.help && <small className="muted">{field.help}</small>}
    </fieldset>
    return paragraph(field.id, labelOf(field), field.help || (field.id === 'learnings' || field.id === 'struggles' ? listHelp : ''), !optional(field), fieldValue(form, field.id), (text) => onChange(withFieldValue(form, field.id, text)), field.id === 'remarks' ? 2 : 3)
  }
  return <div className="pir-review-columns">
    <div className="pir-review-fields">{setup.fields.map(fieldNode)}</div>
    <section className="pir-review-preview" aria-label="Preview">
      <h3>Preview</h3>
      <pre>{buildReviewComment(form, setup)}</pre>
      <small className="muted">The exact comment posted, as you, to the Feature’s Discussion in Azure DevOps: sent as text (&lt;, &gt; and &amp; shown as typed, line breaks kept). The last line marks it as posted from this app; PI Review ignores it.</small>
    </section>
  </div>
}

// PIR-13: the "Write review" pop-up (UI-STANDARDS §3, §4): the fields and the Preview; Cancel and **Post to Azure
// DevOps**, disabled with the reason; Post opens the confirmation pop-up naming the Feature, then onPost.
export function ReviewDialog({ writing, blocked, onPost, onClose }: { writing: Writing; blocked: string; onPost: (form: ReviewForm, text: string) => void; onClose: () => void }) {
  const { item: feature, pi, prefilledFrom, partly, setup, moveNote } = writing
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
      <p className="muted pir-review-note">{prefilledFrom ? `Prefilled from the latest review comment (${prefilledFrom.author}, ${formatDateTime(prefilledFrom.date)}). ` : ''}Posting adds a new comment to the Feature’s Discussion; PI Review reads the newest, so a correction is posted as a new review.</p>
      <ReviewFields form={form} onChange={setForm} pi={pi} partly={partly} setup={setup} moveNote={moveNote} />
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
