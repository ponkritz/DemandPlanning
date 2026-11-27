import { useMemo, useState } from 'react'
import { Modal, Notice, WriteBlocked } from './ui'
import { downloadCsv, downloadXlsx } from '../download'
import { errorReportCsv, maxUploadBytes, maxUploadChanges, maxUploadRows, multiSeparator, pickSheet, planSummary, previewRowCount, readSheets, rowIdHeader, templateFileName, templateWorkbook, uploadAccept, uploadName, type UploadPlan } from '../bulkUpload'
import { writeXlsx, type WorkbookSheet } from '../xlsx'
import { onDemandTypes, type OnDemandPage, type OnDemandRow, type OnDemandType } from '../onDemand'
import { headerRow, planWithColumns, retype, startDrafts, startError, typeDetail, unknownColumns, type StartDraft } from '../startFromFile'

const fmt = (n: number) => n.toLocaleString('en-US')

// OND-103 Download Excel template… (UI-STANDARDS §4): a small pop-up with the two choices — the template with the rows
// the table shows now (their Row IDs, to update them) or an empty one (to add rows) — then Cancel and Download template.
// The rows shown are preselected when there are any (§12: one sensible value), the empty template otherwise.
export function TemplateDialog({ eyebrow, page, shown, onCancel }: { eyebrow: string; page: OnDemandPage; shown: OnDemandRow[]; onCancel: () => void }) {
  const [filled, setFilled] = useState(shown.length > 0)
  const download = (event: React.FormEvent) => {
    event.preventDefault()
    downloadXlsx(writeXlsx(templateWorkbook(page, filled ? shown : [])), templateFileName(page))
    onCancel()
  }
  return <Modal eyebrow={eyebrow} title="Download Excel template" onClose={onCancel}>
    <form className="pgb-form bulk-template-form" onSubmit={download} aria-label="Download Excel template">
      <fieldset className="pgb-kinds"><legend>Template</legend>
        <div className="pgb-kind"><label className="check"><input type="radio" name="bulk-template" disabled={!shown.length} checked={filled} onChange={() => setFilled(true)} aria-describedby="bulk-template-rows" />With the {fmt(shown.length)} row{shown.length === 1 ? '' : 's'} shown</label><small id="bulk-template-rows">{shown.length ? 'The rows the table shows now (its search and Show hidden rows apply), each with its Row ID: change values to update them, add rows below without a Row ID.' : 'The table shows no rows.'}</small></div>
        <div className="pgb-kind"><label className="check"><input type="radio" name="bulk-template" checked={!filled} onChange={() => setFilled(false)} aria-describedby="bulk-template-empty" />Empty template</label><small id="bulk-template-empty">Only the header row: every row you fill is added as a new row.</small></div>
      </fieldset>
      <p className="muted">One sheet, {page.name}, with the page’s columns in order and drop-down lists, date and number checks from the column types; required columns are highlighted. Keep the first column, <strong>{rowIdHeader}</strong>, as it is: it finds the row to update. In a Multi-select cell separate several values with {multiSeparator}. Upload the filled file with ⋯ → Upload Excel….</p>
      <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary">Download template</button></div>
    </form>
  </Modal>
}

// OND-105, OND-138: the preview of an upload — "N added · N updated · N unchanged · N with errors", the file and sheet,
// what was ignored or is missing, the rows skipped as locked, formula text made safe, the first rows (errors first) with
// what happens to each, and the error report. Shared by Upload Excel… and Start from a file… (start: a new page's
// columns, so no word about Row IDs).
export function PlanPreview({ plan, fileName, page, start = false }: { plan: UploadPlan; fileName: string; page: Pick<OnDemandPage, 'name'>; start?: boolean }) {
  // The rows with errors first (they need a look), then the others, each in file order.
  const shown = [...plan.lines.filter((line) => line.outcome === 'error'), ...plan.lines.filter((line) => line.outcome !== 'error')].slice(0, previewRowCount)
  const outcome = { add: 'Add', update: 'Update', unchanged: 'Unchanged', error: 'Error', locked: 'Skipped' } as const
  return <div className="replace-preview bulk-preview" role="status" aria-label="Preview">
    <p><strong>{planSummary(plan)}</strong> <span className="muted">— {uploadName(fileName)}, sheet “{plan.sheet}”</span></p>
    {plan.refused && <Notice tone="error">{plan.refused}</Notice>}
    {plan.header.ignored.length > 0 && <p className="muted">Ignored column{plan.header.ignored.length === 1 ? '' : 's'} (not a column of {page.name}): {plan.header.ignored.map((name) => `“${name}”`).join(', ')}.</p>}
    {plan.header.duplicates.length > 0 && <p className="muted">Named twice, read from its first place: {plan.header.duplicates.map((name) => `“${name}”`).join(', ')}.</p>}
    {plan.header.missingRequired.length > 0 && <p className="muted">Required column{plan.header.missingRequired.length === 1 ? '' : 's'} not in the file: {plan.header.missingRequired.map((name) => `“${name}”`).join(', ')} — rows to add need {plan.header.missingRequired.length === 1 ? 'it' : 'them'}; updated rows keep their value.</p>}
    {plan.header.idIndex < 0 && !plan.refused && !start && <p className="muted">The file has no {rowIdHeader} column: every row is added as a new row.</p>}
    {plan.locked > 0 && <p className="muted">{fmt(plan.locked)} row{plan.locked === 1 ? ' is' : 's are'} being edited by someone else and {plan.locked === 1 ? 'is' : 'are'} skipped.</p>}
    {plan.neutralised > 0 && <p className="muted">{fmt(plan.neutralised)} text value{plan.neutralised === 1 ? '' : 's'} starting with =, +, - or @ {plan.neutralised === 1 ? 'is' : 'are'} stored with an apostrophe first, so no spreadsheet runs {plan.neutralised === 1 ? 'it' : 'them'} as a formula.</p>}
    {shown.length > 0 && <div className="replace-rows bulk-rows"><table>
      <colgroup><col className="bulk-col-line" /><col className="bulk-col-id" /><col className="bulk-col-result" /><col /></colgroup>
      <thead><tr><th className="num">Line</th><th>{rowIdHeader}</th><th>Result</th><th>Values or error</th></tr></thead>
      <tbody>{shown.map((line) => <tr key={line.line} className={line.outcome === 'error' ? 'bulk-error' : undefined}><td className="num">{line.line}</td><td>{line.rowId || <span className="muted">new</span>}</td><td>{outcome[line.outcome]}</td><td>{line.text}</td></tr>)}</tbody>
    </table></div>}
    {plan.lines.length > shown.length && <p className="muted">Showing the first {shown.length} of {fmt(plan.lines.length)} rows.</p>}
    {plan.errors.length > 0 && <p className="bulk-errors-line">{fmt(plan.errors.length)} row{plan.errors.length === 1 ? ' has' : 's have'} errors and {plan.errors.length === 1 ? 'is' : 'are'} not saved — fix {plan.errors.length === 1 ? 'it' : 'them'} in the file and upload it again.{' '}
      <button type="button" className="ghost" onClick={() => downloadCsv(errorReportCsv(plan), `${uploadName(fileName).replace(/\.\w+$/, '')} - errors.csv`)}>Download error report (CSV)</button></p>}
  </div>
}

// OND-137: the type of a column read from a file — the page's own column types (no built-in list).
export function TypeSelect({ label, value, onChange, disabled = false }: { label: string; value: OnDemandType; onChange: (type: OnDemandType) => void; disabled?: boolean }) {
  return <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as OnDemandType)}>{onDemandTypes.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select>
}
// OND-105, OND-106 Upload Excel… (UI-STANDARDS §3, §4): choose the file, read it here (nothing is sent anywhere), and see
// the preview — "N added · N updated · N unchanged · N with errors", what was ignored or is missing, the first rows with
// what happens to each — before anything is saved. Save to Git saves only the valid rows (the pop-up says so); the rows
// with errors are listed and can be downloaded as a CSV report. Cancel closes without saving.
// OND-140, OND-141: the file's columns that the page does not have are listed, each with a tick box (unticked, UI-STANDARDS
// §12: a change for everyone) and its suggested type; ticked ones are added as new columns in the same save and their
// values imported. setupReason: why the viewer cannot add columns (the right of Set up columns) — the tick boxes are then
// disabled with it as visible text and the columns stay ignored.
export function UploadDialog({ eyebrow, page, locked, rowFiles, setupReason, onSave, onCancel }: { eyebrow: string; page: OnDemandPage; locked: Set<string>; rowFiles: boolean; setupReason: string; onSave: (plan: UploadPlan, fileName: string, columns: StartDraft[]) => Promise<void>; onCancel: () => void }) {
  const [read, setRead] = useState<{ name: string; sheet: WorkbookSheet } | null>(null)
  const [reading, setReading] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // OND-140: the file's columns the page does not have, as drafts (suggested type, not required), and the ticked ones.
  const [choices, setChoices] = useState<StartDraft[]>([])
  const [ticked, setTicked] = useState<Set<number>>(() => new Set())
  const unknown = useMemo(() => read ? unknownColumns(page, read.sheet) : [], [read, page])
  const chosen = useMemo(() => setupReason ? [] : choices.filter((draft) => ticked.has(draft.index) && unknown.some((column) => column.index === draft.index)), [choices, ticked, unknown, setupReason])
  const columnsProblem = chosen.length ? startError(page, chosen) : ''
  // The plan follows the page as it is now (a save by someone else, a row lock taken meanwhile).
  const planned = useMemo(() => {
    if (!read) return null
    try { return planWithColumns(page, read.sheet, headerRow(read.sheet), columnsProblem ? [] : chosen, { locked }) } catch (failure) { return failure instanceof Error ? failure.message : String(failure) }
  }, [read, page, locked, chosen, columnsProblem])
  const plan = typeof planned === 'string' ? null : planned
  async function choose(file: File | undefined) {
    setRead(null); setError(''); setChoices([]); setTicked(new Set())
    if (!file) return
    setReading(file.name)
    try {
      const sheet = pickSheet(page, await readSheets(file))
      if (!sheet) throw new Error('No sheets were found in this file.')
      setRead({ name: file.name, sheet })
      setChoices(startDrafts(unknownColumns(page, sheet)))
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setReading('') }
  }
  const valid = plan ? plan.added.length + plan.updated.length : 0
  const why = !read ? 'Choose the filled template.' : typeof planned === 'string' ? planned : columnsProblem || (plan?.refused ? '' : !valid ? 'Nothing to save: no row is added or changed.' : '')
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!plan || !read || why || plan.refused || busy) return
    setBusy(true); setError('')
    try { await onSave(plan, read.name, chosen) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  const edit = (index: number, change: (draft: StartDraft) => StartDraft) => setChoices((list) => list.map((draft) => draft.index === index ? change(draft) : draft))
  const tick = (index: number, on: boolean) => setTicked((set) => { const next = new Set(set); if (on) next.add(index); else next.delete(index); return next })
  return <Modal eyebrow={eyebrow} title="Upload Excel" wide onClose={() => { if (!busy) onCancel() }}>
    <form className="replace-form bulk-upload-form" onSubmit={(event) => void save(event)} aria-label="Upload Excel">
      <label>Excel or CSV file
        <input type="file" autoFocus accept={uploadAccept} aria-label="Excel or CSV file" disabled={busy} onChange={(event) => void choose(event.target.files?.[0])} />
        <small>The template from ⋯ → Download Excel template…, filled in. Rows with a {rowIdHeader} update that row; rows without one are added. At most {maxUploadBytes / 1024 / 1024} MB and {fmt(maxUploadRows)} rows; one upload adds or updates up to {fmt(maxUploadChanges)} rows.</small>
      </label>
      {reading && <p className="muted" role="status">Reading {reading}…</p>}
      {read && choices.length > 0 && <fieldset className="bulk-new-columns" aria-label={`Columns not on ${page.name}`}><legend>Columns not on {page.name}</legend>
        <WriteBlocked reason={setupReason ? `${setupReason} Without it these columns are ignored.` : ''} />
        {!setupReason && <small className="muted">Tick a column to add it to {page.name} with its values, in the same save; unticked columns are ignored. Change types, options and order later with Set up columns…</small>}
        {choices.map((draft) => {
          const values = unknown.find((column) => column.index === draft.index)?.values ?? []
          return <div key={draft.index} className="bulk-new-column">
            <label className="check"><input type="checkbox" disabled={Boolean(setupReason) || busy} checked={!setupReason && ticked.has(draft.index)} onChange={(event) => tick(draft.index, event.target.checked)} />Add “{draft.name}” as a new column</label>
            <TypeSelect label={`Type of ${draft.name}`} value={draft.type} disabled={Boolean(setupReason) || busy} onChange={(type) => edit(draft.index, (entry) => retype(entry, type, values))} />
            <small className="muted">{[typeDetail(draft), draft.sample ? `e.g. ${draft.sample}` : 'No values'].filter(Boolean).join(' · ')}</small>
          </div>
        })}
      </fieldset>}
      {read && typeof planned === 'string' && <Notice tone="error">{planned}</Notice>}
      {plan && read && <PlanPreview plan={plan} fileName={read.name} page={page} />}
      {plan && !plan.refused && valid > 0 && <p className="muted">Only the {fmt(valid)} valid row{valid === 1 ? ' is' : 's are'} saved to Git{chosen.length && !columnsProblem ? `, with the ${chosen.length} new column${chosen.length === 1 ? '' : 's'}` : ''}{rowFiles ? ', every changed row file in one commit' : ''}{plan.errors.length ? `; the ${fmt(plan.errors.length)} with errors are left out` : ''}. Each added or updated row gets an entry “Bulk upload from {uploadName(read!.name)}” in its History.</p>}
      {columnsProblem && <Notice tone="error">{columnsProblem}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">
        {why && <small className="muted write-blocked" role="note">{why}</small>}
        <button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={busy || Boolean(why || plan?.refused)}>{busy ? 'Saving to Git…' : 'Save to Git'}</button>
      </div>
    </form>
  </Modal>
}
