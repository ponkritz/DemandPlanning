import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Info, Modal, Notice, Pill, WriteBlocked } from '../components/ui'
import { formatDateTime } from '../format'
import { fieldValue, noneChoice, reviewBlocks, reviewHeadingFor, withFieldValue, withNoTexts, type ReviewMove } from '../piReviewPost'
import { piLabel } from '../piReview'
import { listHelp, type PiFormField } from '../piReviewSetup'
import { oldFormatStays, ownTextCount, rowChoicesOf, rowResultOf, sharedFieldsOf, type BulkJob, type BulkOutcome, type BulkRow, type BulkShared, type BulkWriting, type RowKind, type RowResult, type SharedMode } from '../piReviewBulk'
import { editingNote, ReviewPreview } from './PiReviewForm'

// PIR-36, PIR-82…PIR-84: the review for several Features (My PI Review, "Update review for {n}…") — a full-size pop-up
// (UI-STANDARDS §4, a bulk action): the paragraphs once for all (For all Features: each with "Keep each Feature's own" /
// "Use the shared text"), then the grid "Features to review" — one row per Feature with its own Move to next PI, Moves
// to, Reason (optional, as in the single form) and choices (the Review meeting advice), each row started from that Feature's review;
// the row "All Features" applies a value to every row (Apply to all) or fills the active row's value down; Ctrl+D in a
// cell copies the value of the row above. The Result column previews each row (Post / Replace / Unchanged / Blocked);
// the Preview shows the comment of the active row. Post to {n} Features checks the rows to write as the single form
// does, opens the confirmation naming them and hands them to the job (PIR-37, PIR-84): unchanged and blocked rows are
// not written. A deliberate UI-STANDARDS exception (§5): an editable hand-built table — DataTable has no editable cells.
type Column = 'move' | 'movePi' | 'moveReason' | `choice:${string}`
const valueOf = (row: BulkRow, column: Column) => column === 'move' || column === 'movePi' || column === 'moveReason' ? row.values[column] : row.values.choices[column.slice(7)] ?? ''
function withValue(row: BulkRow, column: Column, value: string): BulkRow {
  if (column === 'move') return { ...row, values: { ...row.values, move: value === 'Yes' || value === 'No' ? value as ReviewMove : '' } }
  if (column === 'movePi' || column === 'moveReason') return { ...row, values: { ...row.values, [column]: value } }
  return { ...row, values: { ...row.values, choices: { ...row.values.choices, [column.slice(7)]: value } } }
}
const kindLabel: Record<RowKind, string> = { post: 'Post', replace: 'Replace', unchanged: 'Unchanged', blocked: 'Blocked' }
const kindTone: Record<RowKind, 'open' | 'warning' | 'neutral' | 'danger'> = { post: 'open', replace: 'warning', unchanged: 'neutral', blocked: 'danger' }
function resultDetail(row: BulkRow, result: RowResult) {
  if (result.kind === 'blocked') return result.reason
  if (result.kind === 'unchanged') return 'Same as your review: not written.'
  if (result.kind === 'replace') return `Replaces your review of ${formatDateTime(row.target.replace!.date)}.`
  if (row.start.from === 'old') return `${oldFormatStays}.`
  if (row.start.from === 'other' && row.start.comment) return `New comment (${row.start.comment.author}’s review stays).`
  return 'New comment.'
}
function startText(row: BulkRow) {
  const { from, comment } = row.start
  if (from === 'none' || !comment) return 'Form defaults'
  const date = formatDateTime(comment.date)
  return from === 'mine' ? `Your review · ${date}` : from === 'old' ? `Your old-format comment · ${date}` : `${comment.author}’s review · ${date}`
}
const features = (count: number) => `${count} Feature${count === 1 ? '' : 's'}`
const ids = (list: readonly BulkRow[]) => list.map((row) => `#${row.target.item.id}`).join(', ')
// PIR-84: what saving does — in the pop-up's ⓘ.
export const bulkNote = 'Each Feature gets its own review, started from its review of this PI (yours, else the latest one, else your old-format comment): a new comment where you have no review of this PI yet, your review replaced where you have one, nothing written where the review would stay the same. The paragraphs are written once for all; Move to next PI, its Reason (required with Yes) and the Review meeting advice per Feature.'

export function BulkReviewDialog({ writing, blocked, blockOf, onPost, onClose }: { writing: BulkWriting; blocked: string; blockOf: (item: BulkRow['target']['item']) => string; onPost: (jobs: BulkJob[], skipped: BulkOutcome[]) => void; onClose: () => void }) {
  const { pi, setup, moveNote, moveShort, moveWarn, problem } = writing
  const [rows, setRows] = useState(writing.rows)
  const [shared, setShared] = useState<BulkShared>(writing.shared)
  const [all, setAll] = useState<Record<string, string>>({})
  const [active, setActive] = useState(0)
  const [tried, setTried] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const sent = useRef(false) // PIR-37: one post per pop-up, however often the button is pressed
  const sharedFields = sharedFieldsOf(setup), choices = rowChoicesOf(setup), move = setup.fields.find((field) => field.id === 'move')
  const results = rows.map((row) => rowResultOf(row, shared, setup, blockOf(row.target.item)))
  const pick = (kind: RowKind) => rows.filter((_, index) => results[index].kind === kind)
  const writes = rows.flatMap((row, index) => results[index].kind === 'post' || results[index].kind === 'replace' ? [{ row, result: results[index] }] : [])
  const problems = writes.flatMap(({ row, result }) => result.problems.map((text) => `#${row.target.item.id}: ${text}`))
  const stop = blocked || problem || (!writes.length ? 'Nothing to write: every review is unchanged or blocked.' : '')
  const why = stop || (tried && problems.length ? 'Fix the rows marked first.' : '')
  const setRow = (index: number, column: Column, value: string) => setRows((list) => list.map((row, at) => at === index ? withValue(row, column, value) : row))
  // PIR-82: Apply to all — the value of the row "All Features" in every row; Fill down — the active row's value in every
  // row below it; Ctrl+D in a cell — the value of the row above (as a spreadsheet's fill down).
  const applyAll = (column: Column) => { const value = all[column] ?? ''; setRows((list) => list.map((row) => withValue(row, column, value))) }
  const fillDown = (column: Column) => setRows((list) => list.map((row, at) => at > active ? withValue(row, column, valueOf(list[active], column)) : row))
  const fillKey = (index: number, column: Column) => (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'd' || index === 0) return
    event.preventDefault()
    setRows((list) => list.map((row, at) => at === index ? withValue(row, column, valueOf(list[index - 1], column)) : row))
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    setTried(true)
    if (stop || problems.length) return
    setConfirming(true)
  }
  function post() {
    if (sent.current) return
    sent.current = true
    setConfirming(false)
    onPost(writes.map(({ row, result }) => ({ target: row.target, form: result.form, text: result.text })),
      rows.flatMap((row, index): BulkOutcome[] => results[index].kind === 'unchanged' ? [{ item: row.target.item, result: 'unchanged' }] : results[index].kind === 'blocked' ? [{ item: row.target.item, result: 'blocked', reason: results[index].reason }] : []))
  }

  // PIR-83: the shared paragraphs — "No learnings or struggles" (PIR-27) and, per field, its text and whose text is used.
  const none = noneChoice(setup), noneTicked = Boolean(shared.form.noTexts)
  const anyStart = rows.some((row) => row.start.from !== 'none')
  const labelOf = (field: PiFormField) => `${field.label}${field.required ? '' : ' (optional)'}`
  const sharedNode = (field: PiFormField) => {
    const own = ownTextCount(rows, field.id), mode = own ? shared.modes[field.id] ?? 'shared' : 'shared', rest = mode === 'own' ? rows.length - own : rows.length
    const disabled = noneTicked && Boolean(none?.fields.includes(field.id as 'learnings'))
    const setMode = (value: SharedMode) => setShared({ ...shared, modes: { ...shared.modes, [field.id]: value } })
    return <div key={field.id} className="pir-bulk-shared-field">
      <label>{labelOf(field)}<textarea rows={field.id === 'remarks' ? 2 : 3} required={field.required && rest > 0} disabled={disabled} value={fieldValue(shared.form, field.id)} onChange={(event) => setShared({ ...shared, form: withFieldValue(shared.form, field.id, event.target.value) })} /></label>
      {anyStart && own > 0 && <div className="segmented" role="radiogroup" aria-label={`${field.label}: whose text`}>
        {([['own', 'Keep each Feature’s own'], ['shared', 'Use the shared text']] as [SharedMode, string][]).map(([key, label]) => <label key={key} className={mode === key ? 'active' : undefined}><input type="radio" name={`bulk-mode-${field.id}`} checked={mode === key} onChange={() => setMode(key)} />{label}</label>)}
      </div>}
      <small className="muted">{mode === 'own' ? `${features(own)} keep${own === 1 ? 's' : ''} ${own === 1 ? 'its' : 'their'} own ${field.label}; the text above goes to ${rest === 0 ? 'none' : rest === rows.length ? 'all' : `the other ${rest}`}.` : `The text above goes to all ${features(rows.length)}.`}</small>
    </div>
  }
  const firstNone = sharedFields.find((field) => none?.fields.includes(field.id as 'learnings'))?.id

  // PIR-82: the per-row columns — Move to next PI, Moves to, Reason, then each choice.
  const columns: { id: Column; label: string; title?: string }[] = [
    { id: 'move', label: move?.label || 'Move to next PI' }, { id: 'movePi', label: 'Moves to' }, { id: 'moveReason', label: 'Reason' },
    ...choices.map((field) => ({ id: `choice:${field.id}` as Column, label: field.id === 'review' && field.label === 'Advise to discuss the Feature during the Review meeting?' ? 'Review meeting' : field.label, title: field.label })),
  ]
  const optionsOf = (column: Column) => column === 'move' ? ['Yes', 'No'] : choices.find((field) => `choice:${field.id}` === column)?.options ?? []
  const allControl = (column: { id: Column; label: string }) => {
    const value = all[column.id] ?? '', set = (next: string) => setAll({ ...all, [column.id]: next })
    const control = column.id === 'movePi' ? <input aria-label={`${column.label} for all`} value={value} onChange={(event) => set(event.target.value)} />
      : column.id === 'moveReason' ? <textarea rows={1} aria-label={`${column.label} for all`} value={value} onChange={(event) => set(event.target.value)} />
      : <select aria-label={`${column.label} for all`} value={value} onChange={(event) => set(event.target.value)}><option value="">Choose…</option>{optionsOf(column.id).map((option) => <option key={option}>{option}</option>)}</select>
    return <td key={column.id}><div className="pir-bulk-all-cell">{control}<span className="button-row">
      <button type="button" className="ghost" aria-label={`Apply ${column.label} to all`} disabled={!value.trim()} onClick={() => applyAll(column.id)}>Apply to all</button>
      <button type="button" className="text-button" aria-label={`Fill down ${column.label} from #${rows[active]?.target.item.id}`} title={`Copy the ${column.label} of #${rows[active]?.target.item.id} (the active row) to the rows below it`} disabled={active >= rows.length - 1} onClick={() => fillDown(column.id)}>Fill down</button>
    </span></div></td>
  }
  const cell = (row: BulkRow, index: number, column: { id: Column; label: string }, result: RowResult) => {
    const id = row.target.item.id, value = valueOf(row, column.id), name = `${column.label} of #${id}`, onKeyDown = fillKey(index, column.id)
    if ((column.id === 'movePi' || column.id === 'moveReason') && row.values.move !== 'Yes') return <td key={column.id}><span className="muted">{column.id === 'moveReason' && row.values.moveReason.trim() ? 'Kept, not posted with No' : '—'}</span></td>
    if (column.id === 'movePi') return <td key={column.id}><input aria-label={name} value={value} required onKeyDown={onKeyDown} onChange={(event) => setRow(index, column.id, event.target.value)} /></td>
    if (column.id === 'moveReason') { const missing = tried && result.problems.some((text) => text.startsWith('Enter the Reason')); return <td key={column.id}><textarea rows={2} aria-label={name} required aria-invalid={missing || undefined} value={value} onKeyDown={onKeyDown} onChange={(event) => setRow(index, column.id, event.target.value)} /></td> }
    return <td key={column.id}><select aria-label={name} value={value} onKeyDown={onKeyDown} onChange={(event) => setRow(index, column.id, event.target.value)}>{!value && <option value="">Choose…</option>}{optionsOf(column.id).map((option) => <option key={option}>{option}</option>)}</select></td>
  }
  const current = rows[active], currentResult = results[active]
  const counts = [[pick('post').length, 'new'], [pick('replace').length, 'replaced'], [pick('unchanged').length, 'unchanged (not written)'], [pick('blocked').length, 'blocked']] as const

  return <Modal title={`Review of ${features(rows.length)}`} eyebrow="PI REVIEW · AZURE DEVOPS WRITE" full onClose={onClose}>
    <form className="pir-review-form pir-bulk-form" onSubmit={submit} noValidate>
      <div className="modal-scroll pir-bulk-scroll">
        <p className="pir-review-note">Each Feature below gets its own review{pi ? ` (${piLabel(pi)})` : ''}, as you (your PAT): <strong>{counts.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`).join(' · ')}</strong>. <Info iconOnly label="About the review for several Features"><p>{bulkNote}</p><p>{editingNote}</p><p>{moveNote}</p></Info></p>
        <section className="pir-bulk-shared" aria-label="For all Features">
          <h3>For all Features <Info iconOnly label="How to fill in the shared fields"><p>{listHelp}</p><p>Keep each Feature’s own: a Feature that starts from a review keeps its text; the text here goes to the Features without one. Use the shared text: the text here goes to every Feature.</p>{none && <p><strong>{none.label}</strong>: {none.help}</p>}</Info></h3>
          {sharedFields.flatMap((field) => field.id === firstNone && none ? [<label key="no-texts" className="checkbox-label"><input type="checkbox" checked={noneTicked} onChange={(event) => setShared({ ...shared, form: withNoTexts(shared.form, setup, event.target.checked) })} />{none.label}</label>, sharedNode(field)] : [sharedNode(field)])}
        </section>
        <small className={moveWarn ? 'pir-next-pi pir-next-pi-warn' : 'pir-next-pi muted'}>Moves to (with Yes): {moveShort || 'the next PI.'}</small>
        <div className="azure-table pir-bulk-grid"><table aria-label="Features to review">
          <thead>
            <tr><th scope="col">ID</th><th scope="col">Title</th><th scope="col">Starts from</th>{columns.map((column) => <th key={column.id} scope="col" title={column.title}>{column.label}</th>)}<th scope="col">Result</th></tr>
            <tr className="pir-bulk-all" aria-label="All Features"><th scope="row" colSpan={3}>All Features <small className="muted">Ctrl+D in a cell: the value of the row above</small></th>{columns.map(allControl)}<td /></tr>
          </thead>
          <tbody>{rows.map((row, index) => {
            const result = results[index], id = row.target.item.id
            return <tr key={row.target.item.key} data-row-key={row.target.item.key} className={index === active ? 'pir-bulk-active' : undefined} onFocus={() => setActive(index)} onClick={() => setActive(index)}>
              <td className="nowrap">#{id}</td><td>{row.target.item.title}</td><td className="muted">{startText(row)}</td>
              {columns.map((column) => cell(row, index, column, result))}
              <td className="pir-bulk-result"><Pill tone={kindTone[result.kind]}>{kindLabel[result.kind]}</Pill> <small>{resultDetail(row, result)}</small>{tried && result.problems.length > 0 && <small className="danger-text">{result.problems.join(' ')}</small>}</td>
            </tr>
          })}</tbody>
        </table></div>
        {current && currentResult && <section className="pir-review-preview pir-bulk-preview" aria-label="Preview">
          <h3>Preview of #{current.target.item.id} <Info iconOnly label="About the preview">The comment of the active row (click or focus a row), as it will look in Azure DevOps: the heading “Feature Review for” the reviewed PI first, then a bulleted list. The last line marks it as posted from this app.</Info></h3>
          <ReviewPreview heading={reviewHeadingFor(currentResult.form)} blocks={reviewBlocks(currentResult.form, setup)} />
        </section>}
        {tried && problems.length > 0 && <Notice tone="error">{problems.join(' ')}</Notice>}
      </div>
      <div className="modal-actions"><WriteBlocked reason={why} /><button type="button" className="ghost" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={Boolean(stop)} title={stop || undefined}>Post to {features(writes.length)}</button></div>
    </form>
    {confirming && <Modal title={`Post the review to ${features(writes.length)}?`} eyebrow="PI REVIEW · AZURE DEVOPS WRITE" onClose={() => setConfirming(false)}>
      <p>In Azure DevOps, as you (your PAT), each Feature with its own review:</p>
      <ul>
        {pick('post').length > 0 && <li>A new comment in the Discussion of {features(pick('post').length)}: {ids(pick('post'))}.</li>}
        {pick('replace').length > 0 && <li>Your review comment replaced on {features(pick('replace').length)}: {ids(pick('replace'))}.</li>}
        {pick('unchanged').length > 0 && <li>Not written (unchanged): {ids(pick('unchanged'))}.</li>}
        {pick('blocked').length > 0 && <li>Not written (blocked): {ids(pick('blocked'))}.</li>}
      </ul>
      <p className="muted">It runs in the background (the top bar), 3 Features at a time; a Feature that fails does not stop the others and can be retried (Retry failed). A new comment cannot be deleted from this app.</p>
      <div className="modal-actions"><button type="button" className="ghost" onClick={() => setConfirming(false)}>Cancel</button><button type="button" className="primary" onClick={post}>Post review to {features(writes.length)}</button></div>
    </Modal>}
  </Modal>
}
