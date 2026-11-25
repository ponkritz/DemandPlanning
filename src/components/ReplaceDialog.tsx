import { useId, useMemo, useState, type ReactNode } from 'react'
import { Modal, Notice } from './ui'
import type { ReplacePlan, ValueCount } from '../replaceValues'

// QEM-13, OND-100…OND-102 Replace… (UI-STANDARDS §3, §4): one value of one column replaced by another in every row that
// holds it, after a preview. Column: the table's columns (preselected when the page knows which one is meant). Find: the
// column's values with how many rows hold each, or another value typed. Replace with: free text with the column's values
// as suggestions. The preview says how many rows change and lists the first ten (row, old value → new value), and the
// rows left as they are (locked by someone else, hidden). Replace (primary) saves at once; Cancel closes.
export interface ReplaceColumn { id: string; name: string }
const other = '\u0000other'
const previewRows = 10

export function ReplaceDialog({ eyebrow, columns, initialColumn = '', values, suggestions, plan, check = () => '', note, onReplace, onCancel }: {
  eyebrow: string
  columns: ReplaceColumn[]
  initialColumn?: string
  values: (columnId: string) => ValueCount[]
  suggestions: (columnId: string) => string[]
  plan: (columnId: string, find: string, to: string) => ReplacePlan
  check?: (columnId: string, find: string, to: string) => string
  note?: ReactNode
  onReplace: (columnId: string, find: string, to: string) => Promise<void>
  onCancel: () => void
}) {
  const [column, setColumn] = useState(columns.some((entry) => entry.id === initialColumn) ? initialColumn : '')
  const [choice, setChoice] = useState('')
  const [typed, setTyped] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listId = useId()
  const counts = useMemo(() => column ? values(column) : [], [column, values])
  const find = choice === other ? typed : choice
  const result = useMemo(() => column && find.trim() && to.trim() ? plan(column, find, to) : null, [column, find, to, plan])
  const problem = column && find.trim() && to.trim() ? check(column, find, to) : ''
  const name = columns.find((entry) => entry.id === column)?.name ?? ''
  const why = !column ? 'Choose a column.' : !find.trim() ? 'Choose or type the value to find.' : !to.trim() ? 'Type the new value.' : problem ? '' : result && !result.changes.length ? 'No row changes.' : ''
  const n = result?.changes.length ?? 0

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (why || problem || !n || busy) return
    setBusy(true); setError('')
    try { await onReplace(column, find, to) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }

  return <Modal title="Replace a value" eyebrow={eyebrow} form onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)} className="replace-form" aria-label="Replace a value">
      <label>Column
        <select autoFocus required aria-label="Column" value={column} onChange={(event) => { setColumn(event.target.value); setChoice(''); setTyped(''); setError('') }}>
          <option value="">— Choose a column —</option>
          {columns.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      <label>Find
        <select required aria-label="Find" disabled={!column} value={choice} onChange={(event) => { setChoice(event.target.value); setError('') }}>
          <option value="">{column ? '— Choose a value —' : '— Choose a column first —'}</option>
          {counts.map((entry) => <option key={entry.value} value={entry.value}>{entry.value} ({entry.count} row{entry.count === 1 ? '' : 's'})</option>)}
          {column && <option value={other}>Another value (type it)…</option>}
        </select>
        <small>The whole cell must be this value; upper and lower case and spaces around it do not matter.</small>
      </label>
      {choice === other && <label>Value to find<input required aria-label="Value to find" maxLength={2000} value={typed} onChange={(event) => setTyped(event.target.value)} /></label>}
      <label>Replace with
        <input required aria-label="Replace with" disabled={!column} list={listId} maxLength={2000} value={to} onChange={(event) => { setTo(event.target.value); setError('') }} />
        <datalist id={listId}>{(column ? suggestions(column) : []).map((value) => <option key={value} value={value} />)}</datalist>
      </label>
      {result && !problem && <div className="replace-preview" role="status" aria-label="Preview">
        <p><strong>{n} row{n === 1 ? '' : 's'} will change</strong>{n ? <> — {name}: “{find.trim()}” → “{to.trim()}”</> : null}</p>
        {n > 0 && <div className="replace-rows"><table>
          <thead><tr><th>Row</th><th>Old value</th><th>New value</th></tr></thead>
          <tbody>{result.changes.slice(0, previewRows).map((change) => <tr key={change.id}><td>{change.label}</td><td>{change.from}</td><td>{change.to}</td></tr>)}</tbody>
        </table></div>}
        {n > previewRows && <p className="muted">Showing the first {previewRows} of {n} rows.</p>}
        {result.locked > 0 && <p className="muted">{result.locked} matching row{result.locked === 1 ? ' is' : 's are'} being edited by someone else and {result.locked === 1 ? 'is' : 'are'} skipped.</p>}
        {result.hidden > 0 && <p className="muted">{result.hidden} matching hidden row{result.hidden === 1 ? '' : 's'} {result.hidden === 1 ? 'is' : 'are'} left as {result.hidden === 1 ? 'it is' : 'they are'}.</p>}
      </div>}
      {note}
      {(problem || error) && <Notice tone="error">{problem || error}</Notice>}
      <div className="modal-actions">
        {why && <small className="muted write-blocked" role="note">{why}</small>}
        <button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={busy || Boolean(why || problem) || !n}>{busy ? 'Replacing…' : 'Replace'}</button>
      </div>
    </form>
  </Modal>
}
