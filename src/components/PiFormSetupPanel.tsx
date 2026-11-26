import { useState } from 'react'
import { Modal, Notice, Panel, SaveQueueStatus, SettingsSummary, WriteBlocked } from './ui'
import { formatDate, formatDateTime } from '../format'
import { reviewStartOf } from '../piReviewStart'
import { emptyReviewForm, formSetupProblems, reviewBlocks, withFieldValue, type ReviewForm } from '../piReviewPost'
import { ReviewPreview } from '../pages/PiReviewForm'
import { headingText, piPlaceholder, reviewedPiPlaceholder } from '../piReview'
import { defaultReviewStart, isReviewStartDay, builtInFields, fieldDrafts, fieldsOf, isBuiltInField, isChoice, maxFormFields, newFieldId, piFieldTypes, piFormFile, setupChanges, setupGearLabel, showsSetupGear, type PiFormField, type PiFormSetup } from '../piReviewSetup'
import { typeLabel, type ColumnDraft } from '../onDemand'
import { ColumnListEditor } from './ColumnListEditor'
import type { PiFormStore } from '../usePiFormSetup'
import { useReviewViewer } from '../piReviewWriter'

// PIR-19…PIR-22, PIR-29, PIR-31: the panel of Admin → PI Review Setup (PiReviewSetupPage), shown to the holders of "PI Review: set
// up the review form" (Scrum Master and Tool Owner by default, CON-114). It shows the fields of the form in use — the
// order, labels, the headings written in the comment, types, options, required and defaults — as a summary
// (UI-STANDARDS §3); **Edit form…** opens the editor in a pop-up, disabled with the reason in View as, with the sample,
// without Git, while the file is read or when it could not be used (PIR-31).
// Save to Git runs the checks (headings, limits, the read-back of a review written with the form) first.
const yesNo = (value: boolean) => value ? 'Yes' : 'No'

export function PiFormSetupPanel({ store, block, by }: { store: PiFormStore; block: string; by: string }) {
  const [editing, setEditing] = useState(false)
  const setup = store.setup
  return <Panel className="admin-section pir-setup" eyebrow="PI REVIEW" title="PI Review form" info={<>
    <p>The fields of <strong>Review…</strong> (PI Review, My PI Review and the Close pop-up) and the heading each writes in the Feature’s Discussion comment. PI Review splits the comments by these headings — and still by the built-in ones and the team’s earlier formats, so older reviews keep their columns. A field you add is a column of its own in PI Review.</p>
    <p><strong>Move to next PI</strong> keeps its behaviour: Yes / No, the PI it moves to ({piPlaceholder} in its heading) and the reason; it can be relabelled, not removed. {reviewedPiPlaceholder} in a heading is the reviewed PI (the PI chosen on the page; in the Close pop-up the Feature’s PI), e.g. “Learnings of {reviewedPiPlaceholder}” is written “Learnings of PI 26.4:” — or “Learnings:” when no PI is known. Shared in Git as {piFormFile}; without the file the built-in form is used.</p>
  </>}>
    {store.error && <Notice tone="warning">{piFormFile} could not be used, so the form stays as it was{store.file ? '' : ' (the built-in form)'}: {store.error}</Notice>}
    <SettingsSummary rows={[
      ['Form in use', store.file ? `Set up in Git (${piFormFile})` : 'The built-in form (no setup saved in Git yet)'],
      ['Fields', `${setup.fields.length} of at most ${maxFormFields}`],
      ...(store.file?.changedAt ? [['Last changed', `${formatDateTime(store.file.changedAt)}${store.file.changedBy ? ` by ${store.file.changedBy}` : ''}`] as [string, string]] : []),
    ]} />
    <div className="azure-table"><table aria-label="Fields of the PI Review form" className="pir-setup-table">
      <thead><tr><th>Field</th><th>Heading in the comment</th><th>Type</th><th>Options</th><th>Required</th><th>Default</th></tr></thead>
      <tbody>{setup.fields.map((field) => <tr key={field.id}>
        <td><strong>{field.label}</strong>{field.help && <small className="muted">{field.help}</small>}{isBuiltInField(field.id) ? null : <small className="muted">Added field</small>}</td>
        <td><code>{field.heading}{isChoice(field) ? ' :' : ':'}</code></td>
        <td>{typeLabel(field.type)}</td>
        <td>{isChoice(field) ? field.options.join(' · ') : '—'}</td>
        <td>{yesNo(field.required)}</td>
        <td>{field.defaultValue || '—'}</td>
      </tr>)}</tbody>
    </table></div>
    <div className="button-row"><button type="button" className="ghost" disabled={Boolean(block)} title={block || undefined} onClick={() => setEditing(true)}>Edit form…</button><WriteBlocked reason={block} /></div>
    <SaveQueueStatus state={store.queue} onRetry={() => void store.retry()} />
    {editing && <PiFormEditor setup={setup} by={by} blocked={block} onSave={async (next, message) => { await store.save(next, message); setEditing(false) }} onClose={() => setEditing(false)} />}
  </Panel>
}

// PIR-30: ⚙ in the page header of My PI Review and PI Review — opens Admin → PI Review Setup; shown when that page is in
// the viewer's menu, i.e. to the holders of "PI Review: set up the review form" (showsSetupGear; in View as those of the
// viewed role). The icon of "open the setup of this page" (UI-STANDARDS §6): aria-label and title name the page.
export function PiSetupGear() {
  const viewer = useReviewViewer()
  const open = viewer.env?.openFormSetup
  if (!open || !showsSetupGear(viewer)) return null
  return <button type="button" className="ghost pir-setup-gear" aria-label={setupGearLabel} title={setupGearLabel} onClick={open}><span aria-hidden="true">⚙</span></button>
}

// The comment a review written with this form gives — each paragraph as a placeholder, each choice its default (else its
// first option), Move to next PI as pre-selected.
function sampleComment(setup: PiFormSetup) {
  let form: ReviewForm = { ...emptyReviewForm('PI 26.5', setup), reviewedPi: 'PI 26.4' }
  for (const field of setup.fields) {
    if (field.id === 'move') { if (!form.move) form = { ...form, move: 'No' }; continue }
    form = withFieldValue(form, field.id, isChoice(field) ? field.defaultValue || field.options[0] || '' : `(${field.label.toLowerCase()} as written)`)
  }
  return reviewBlocks(form, setup)
}

// PIR-22: the editor — the shared column-list editor of the On-Demand pages (OND-05: name, type, Required, ↑ ↓ ✕, the
// help as its description, the options of a Dropdown), with the heading written in the comment and the default of each
// field in its slot; the comment a review written with it gives beside it; Save to Git with the checks.
function PiFormEditor({ setup, by, blocked, onSave, onClose }: { setup: PiFormSetup; by: string; blocked: string; onSave: (next: PiFormSetup, message: string) => Promise<void>; onClose: () => void }) {
  const extrasOf = (fields: PiFormField[]) => Object.fromEntries(fields.map((field) => [field.id, { heading: field.heading, defaultValue: field.defaultValue }]))
  const [drafts, setDrafts] = useState<ColumnDraft[]>(() => fieldDrafts(setup.fields))
  const [extras, setExtras] = useState<Record<string, { heading: string; defaultValue: string }>>(() => extrasOf(setup.fields))
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const draft: PiFormSetup = { ...setup, fields: fieldsOf(drafts, extras) }
  const problems = formSetupProblems(draft)
  const changes = setupChanges(setup, draft)
  const setExtra = (id: string, change: Partial<{ heading: string; defaultValue: string }>) => { setExtras((current) => ({ ...current, [id]: { ...(current[id] ?? { heading: '', defaultValue: '' }), ...change } })); setFailure('') }
  function useBuiltIn() { const fields = builtInFields(); setDrafts(fieldDrafts(fields)); setExtras(extrasOf(fields)) }
  async function save() {
    setTried(true); setFailure('')
    if (blocked || problems.length || !changes.length) return
    setBusy(true)
    try { await onSave({ ...draft, changedAt: `${new Date().toISOString().slice(0, 19)}Z`, ...(by ? { changedBy: by } : {}) }, `PI Review form: ${changes.join(', ')}`) }
    catch (error) { setFailure(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  const why = blocked || (busy ? 'Saving to Git…' : !changes.length ? 'Nothing changed yet.' : tried && problems.length ? 'Fix the problems above first.' : '')
  return <Modal title="Edit the PI Review form" eyebrow="SETTINGS · PI REVIEW FORM" wide onClose={() => { if (!busy) onClose() }}>
    <div className="pir-setup-editor">
      <section className="pir-setup-list" aria-label="Fields">
        <h3>Fields ({drafts.length} of {maxFormFields})</h3>
        <ColumnListEditor drafts={drafts} onChange={(next) => { setDrafts(next); setFailure('') }} types={piFieldTypes} words={fieldWords} max={maxFormFields}
          newDraft={() => ({ id: newFieldId(drafts.map((entry) => entry.id)), name: '', type: 'longtext', required: false, options: [], description: '', isNew: true })}
          lock={(entry) => entry.id === 'move' ? { name: true, type: true, remove: true, options: true, required: true, why: 'Move to next PI keeps its special behaviour (Yes / No, the PI it moves to, the reason): its heading, default and help can be changed.' } : isBuiltInField(entry.id) ? { type: true, why: 'A built-in field keeps its type.' } : undefined}
          description={{ label: 'Help text (optional)', aria: (index) => `Field ${index + 1} help text`, max: 200, help: 'Shown under the field in the review form.' }}
          extra={(entry, index) => { const extra = extras[entry.id] ?? { heading: '', defaultValue: '' }; const field = draft.fields.find((item) => item.id === entry.id); return <div className="form-row pir-setup-extra">
            <label>Heading in the comment<input aria-label={`Field ${index + 1} heading`} required maxLength={100} value={extra.heading} onChange={(event) => setExtra(entry.id, { heading: event.target.value })} /><small>{entry.id === 'move' ? `Written as “${extra.heading.replace(piPlaceholder, 'PI 26.5')} : Yes - reason”; ${piPlaceholder} is where the PI it moves to is written.` : `Written as “${headingText(extra.heading || '…', 'PI 26.4')}${entry.type === 'dropdown' ? ' : …' : ':'}” at the start of a line; PI Review reads the field by it. ${reviewedPiPlaceholder} (once at most) is where the reviewed PI is written.`}</small></label>
            {entry.type === 'dropdown' && <label>Default<select aria-label={`Field ${index + 1} default`} value={field?.defaultValue ?? ''} onChange={(event) => setExtra(entry.id, { defaultValue: event.target.value })}><option value="">None — the person chooses</option>{(field?.options ?? []).filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}</select><small>Pre-selected in the form and its Preview (UI-STANDARDS §12).</small></label>}
          </div> }}
          addNote={<button type="button" className="ghost" onClick={useBuiltIn}>Use the built-in form</button>} />
      </section>
      <section className="pir-review-preview" aria-label="Comment preview">
        <h3>Comment preview</h3>
        <ReviewPreview blocks={sampleComment(draft)} />
        <small className="muted">A review written with this form, as it is posted to the Feature’s Discussion. Reviews written before keep their columns: PI Review reads the built-in headings too.</small>
      </section>
    </div>
    {tried && problems.length > 0 && <Notice tone="error">{problems.join(' ')}</Notice>}
    {failure && <Notice tone="error">Not saved: {failure}</Notice>}
    <div className="modal-actions"><WriteBlocked reason={why} /><button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={Boolean(blocked) || busy} onClick={() => void save()}>Save to Git</button></div>
  </Modal>
}
const fieldWords = { one: 'field', One: 'Field', many: 'fields' }

// PIR-33: "PI Review starts from" — a shared date in the PI Review form setup (pi-review-form.json, reviewStart; 21 Sep
// 2026 when not set): PIs that ended before it are not offered in PI Review and My PI Review, comments before it are
// ignored. Shown as a summary with Edit… (UI-STANDARDS §3), saved to Git with the form; the same rights and reasons as
// Edit form… (PIR-31).
export function ReviewStartPanel({ store, block, by }: { store: PiFormStore; block: string; by: string }) {
  const [editing, setEditing] = useState(false)
  const start = reviewStartOf(store.setup)
  const set = Boolean(store.setup.reviewStart)
  return <Panel className="admin-section pir-start" eyebrow="PI REVIEW" title="PI Review starts from" info={<>
    <p>The first day PI Review looks at. The PI list of <strong>PI Review</strong> and <strong>My PI Review</strong> leaves out the PIs that ended before it (by their dates in Azure DevOps; a PI without dates by its number), and a remembered PI before it falls back to the current PI. Comments in a Feature’s Discussion written before it are ignored: <strong>↻ Read all Discussions</strong> and a Feature’s Discussion keep only the later ones, and the latest review, the Reviewed status and the review form’s prefill use only those. The next PI is never suggested before it.</p>
    <p>Shared with everyone in Git, in {piFormFile}; without a date there, {formatDate(defaultReviewStart)} applies.</p>
  </>}>
    <SettingsSummary rows={[['PI Review starts from', `${formatDate(start)}${set ? '' : ' (the default)'}`]]} />
    <div className="button-row"><button type="button" className="ghost" disabled={Boolean(block)} title={block || undefined} onClick={() => setEditing(true)}>Edit start date…</button><WriteBlocked reason={block} /></div>
    {editing && <ReviewStartEditor start={start} blocked={block} onSave={async (day) => {
      await store.save({ ...store.setup, reviewStart: day, changedAt: `${new Date().toISOString().slice(0, 19)}Z`, ...(by ? { changedBy: by } : {}) }, `PI Review starts from ${day}`)
      setEditing(false)
    }} onClose={() => setEditing(false)} />}
  </Panel>
}

function ReviewStartEditor({ start, blocked, onSave, onClose }: { start: string; blocked: string; onSave: (day: string) => Promise<void>; onClose: () => void }) {
  const [day, setDay] = useState(start)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const valid = isReviewStartDay(day)
  const why = blocked || (busy ? 'Saving to Git…' : !valid ? 'Enter a date (2000–2099).' : day === start ? 'Nothing changed yet.' : '')
  async function save() {
    if (why) return
    setBusy(true); setFailure('')
    try { await onSave(day) } catch (error) { setFailure(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  return <Modal title="PI Review starts from" eyebrow="SETTINGS · PI REVIEW" onClose={() => { if (!busy) onClose() }}>
    <label>PI Review starts from<input type="date" aria-label="PI Review starts from" required value={day} onChange={(event) => { setDay(event.target.value); setFailure('') }} /><small>PIs that ended before this day are not offered; comments written before it are ignored.</small></label>
    {failure && <Notice tone="error">Not saved: {failure}</Notice>}
    <div className="modal-actions"><WriteBlocked reason={why} /><button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary" disabled={Boolean(why)} onClick={() => void save()}>Save to Git</button></div>
  </Modal>
}
