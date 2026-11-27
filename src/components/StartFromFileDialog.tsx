import { useMemo, useState } from 'react'
import { DataTable, type DataColumn } from './DataTable'
import { Modal, Notice, WriteBlocked } from './ui'
import { PlanPreview, TypeSelect } from './BulkUploadDialogs'
import { maxUploadBytes, maxUploadRows, pickSheet, readSheets, uploadAccept, uploadName, type UploadPlan } from '../bulkUpload'
import { currencyCodes, type OnDemandPage } from '../onDemand'
import { fileColumns, fullSizeFrom, planWithColumns, retype, startDrafts, startError, typeDetail, type StartDraft } from '../startFromFile'
import { columnLetter, type WorkbookSheet } from '../xlsx'

const fmt = (n: number) => n.toLocaleString('en-US')
// A file read for Start from a file (in Add page or in this pop-up): its name and its sheets.
export interface StartFile { name: string; sheets: WorkbookSheet[] }

// OND-136…OND-139 Start from a file… (UI-STANDARDS §3, §4): a Table (Build your own) page without columns gets its columns
// from the header of an .xlsx or CSV file. The pop-up (wide; full size for more than 12 columns) lists each column of the
// file — where it is in the file, its name (editable), the suggested type (editable: the page's column types; a Dropdown's
// options taken from the values, a Currency's default code from them), Required (unticked) and a sample value — then the
// preview of the rows as Upload Excel… shows it, checked for the columns as chosen. Save to Git adds the columns and saves
// the valid rows as one change (the queued Git save, OND-28); rows with errors are never saved and the pop-up says how
// many are left out. file: the file chosen in Add page (read there), else the person chooses it here. reason: why the
// viewer cannot save (the right of Set up columns, OND-139) — Save to Git disabled with it as visible text.
export function StartFromFileDialog({ eyebrow, page, file: initial, reason, rowFiles, onSave, onCancel }: { eyebrow: string; page: OnDemandPage; file?: StartFile; reason: string; rowFiles: boolean; onSave: (drafts: StartDraft[], plan: UploadPlan, fileName: string) => Promise<void>; onCancel: () => void }) {
  const first = (read: StartFile | undefined) => { const sheet = read ? pickSheet(page, read.sheets) : undefined; return read && sheet ? { name: read.name, sheet } : null }
  const [read, setRead] = useState<{ name: string; sheet: WorkbookSheet } | null>(() => first(initial))
  const columns = useMemo(() => read ? fileColumns(read.sheet) : null, [read])
  const [drafts, setDrafts] = useState<StartDraft[]>(() => columns && !columns.refused ? startDrafts(columns.columns) : [])
  const [reading, setReading] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const problem = drafts.length ? startError(page, drafts) : ''
  const planned = useMemo(() => {
    if (!read || !columns || columns.refused || !drafts.length || problem) return null
    try { return planWithColumns(page, read.sheet, columns.header, drafts) } catch (failure) { return failure instanceof Error ? failure.message : String(failure) }
  }, [read, columns, drafts, page, problem])
  const plan = typeof planned === 'string' ? null : planned
  async function choose(chosen: File | undefined) {
    setRead(null); setDrafts([]); setError('')
    if (!chosen) return
    setReading(chosen.name)
    try {
      const next = first({ name: chosen.name, sheets: await readSheets(chosen) })
      if (!next) throw new Error('No sheets were found in this file.')
      const found = fileColumns(next.sheet)
      setRead(next); setDrafts(found.refused ? [] : startDrafts(found.columns))
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setReading('') }
  }
  const valid = plan ? plan.added.length : 0
  const why = reason ? '' : !read ? 'Choose an Excel (.xlsx) or CSV file.' : columns?.refused || problem || (typeof planned === 'string' ? planned : plan?.refused ? 'Nothing can be saved: see the reason above.' : '')
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!plan || !read || why || reason || busy) return
    setBusy(true); setError('')
    try { await onSave(drafts, plan, read.name) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  const valuesOf = (draft: StartDraft) => columns?.columns.find((column) => column.index === draft.index)?.values ?? []
  const edit = (id: string, change: Partial<StartDraft>) => setDrafts((list) => list.map((draft) => draft.id === id ? { ...draft, ...change } : draft))
  const table: DataColumn<StartDraft>[] = [
    { id: 'file', label: 'In file', sortable: false, value: (draft) => columnLetter(draft.index) },
    { id: 'name', label: 'Column name', sortable: false, render: (draft) => <input aria-label={`Name of column ${columnLetter(draft.index)}`} required maxLength={120} value={draft.name} disabled={busy} onChange={(event) => edit(draft.id, { name: event.target.value })} /> },
    { id: 'type', label: 'Type', sortable: false, render: (draft) => <div className="start-type">
      <TypeSelect label={`Type of column ${columnLetter(draft.index)}`} value={draft.type} disabled={busy} onChange={(type) => setDrafts((list) => list.map((entry) => entry.id === draft.id ? retype(entry, type, valuesOf(entry)) : entry))} />
      {draft.type === 'currency' && <select aria-label={`Default currency of column ${columnLetter(draft.index)}`} value={draft.currency ?? 'EUR'} disabled={busy} onChange={(event) => edit(draft.id, { currency: event.target.value })}>{[...new Set([draft.currency ?? 'EUR', ...currencyCodes])].map((code) => <option key={code} value={code}>{code}</option>)}</select>}
      {typeDetail(draft) && draft.type !== 'currency' && <small className="muted">{typeDetail(draft)}</small>}
    </div> },
    { id: 'required', label: 'Required', sortable: false, render: (draft) => <input type="checkbox" aria-label={`Column ${columnLetter(draft.index)} is required`} checked={draft.required} disabled={busy} onChange={(event) => edit(draft.id, { required: event.target.checked })} /> },
    { id: 'sample', label: 'Sample value', sortable: false, value: (draft) => draft.sample, render: (draft) => draft.sample || <span className="muted">No values</span> },
  ]
  return <Modal eyebrow={eyebrow} title="Start from a file" wide={drafts.length <= fullSizeFrom} full={drafts.length > fullSizeFrom} onClose={() => { if (!busy) onCancel() }}>
    <form className="replace-form bulk-upload-form start-file-form" onSubmit={(event) => void save(event)} aria-label="Start from a file">
      {!initial && <label>Excel or CSV file
        <input type="file" autoFocus accept={uploadAccept} aria-label="Excel or CSV file" disabled={busy} onChange={(event) => void choose(event.target.files?.[0])} />
        <small>Its first row with values names the columns; every row below it becomes a row of {page.name}. At most {maxUploadBytes / 1024 / 1024} MB and {fmt(maxUploadRows)} rows.</small>
      </label>}
      {reading && <p className="muted" role="status">Reading {reading}…</p>}
      <div className="modal-scroll">
        {columns?.refused && <Notice tone="error">{columns.refused}</Notice>}
        {read && drafts.length > 0 && <>
          <p className="muted">The columns of {uploadName(read.name)}, each with the type suggested from its values. Check and change the name, type and Required of each; the rows below are checked for the columns as you set them.{columns?.rowIdLeftOut ? ' The “Row ID” column is left out: a new page has no rows to update.' : ''}</p>
          <DataTable id="start-from-file:columns" columns={table} rows={drafts} rowKey={(draft) => draft.id} status={`${drafts.length} of ${drafts.length} column${drafts.length === 1 ? '' : 's'}`} empty="No columns in the file." />
        </>}
        {plan && read && <PlanPreview plan={plan} fileName={read.name} page={page} start />}
      </div>
      {plan && !plan.refused && <p className="muted">Save to Git adds the {drafts.length} column{drafts.length === 1 ? '' : 's'} to {page.name}{valid ? ` and saves the ${fmt(valid)} valid row${valid === 1 ? '' : 's'}` : ''} as one change{rowFiles ? ', every row file in one commit' : ''}{plan.errors.length ? `; the ${fmt(plan.errors.length)} row${plan.errors.length === 1 ? '' : 's'} with errors ${plan.errors.length === 1 ? 'is' : 'are'} left out` : ''}. Afterwards change the columns with Set up columns… (type, options, Required, order).</p>}
      {(problem || typeof planned === 'string') && <Notice tone="error">{problem || (typeof planned === 'string' ? planned : '')}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">
        <WriteBlocked reason={reason} />
        {why && <small className="muted write-blocked" role="note">{why}</small>}
        <button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={busy || Boolean(why || reason)}>{busy ? 'Saving to Git…' : 'Save to Git'}</button>
      </div>
    </form>
  </Modal>
}
