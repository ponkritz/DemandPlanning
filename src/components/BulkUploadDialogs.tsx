import { useMemo, useState } from 'react'
import { Modal, Notice } from './ui'
import { downloadCsv, downloadXlsx } from '../download'
import { errorReportCsv, fileError, maxUploadBytes, maxUploadChanges, maxUploadRows, multiSeparator, pickSheet, planSummary, planUpload, previewRowCount, rowIdHeader, templateFileName, templateWorkbook, uploadName, type UploadPlan } from '../bulkUpload'
import { readCsv, readXlsx, writeXlsx, type WorkbookSheet } from '../xlsx'
import type { OnDemandPage, OnDemandRow } from '../onDemand'

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

// OND-105, OND-106 Upload Excel… (UI-STANDARDS §3, §4): choose the file, read it here (nothing is sent anywhere), and see
// the preview — "N added · N updated · N unchanged · N with errors", what was ignored or is missing, the first rows with
// what happens to each — before anything is saved. Save to Git saves only the valid rows (the pop-up says so); the rows
// with errors are listed and can be downloaded as a CSV report. Cancel closes without saving.
export function UploadDialog({ eyebrow, page, locked, rowFiles, onSave, onCancel }: { eyebrow: string; page: OnDemandPage; locked: Set<string>; rowFiles: boolean; onSave: (plan: UploadPlan, fileName: string) => Promise<void>; onCancel: () => void }) {
  const [read, setRead] = useState<{ name: string; sheet: WorkbookSheet } | null>(null)
  const [reading, setReading] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // The plan follows the page as it is now (a save by someone else, a row lock taken meanwhile).
  const plan = useMemo(() => read ? planUpload(page, read.sheet, { locked }) : null, [read, page, locked])
  async function choose(file: File | undefined) {
    setRead(null); setError('')
    if (!file) return
    const refused = fileError(file)
    if (refused) { setError(refused); return }
    setReading(file.name)
    try {
      const sheets = file.name.toLowerCase().endsWith('.csv') ? [{ name: file.name.replace(/\.csv$/i, ''), rows: readCsv(await file.text()) }] : await readXlsx(new Uint8Array(await file.arrayBuffer()))
      const sheet = pickSheet(page, sheets)
      if (!sheet) throw new Error('No sheets were found in this file.')
      setRead({ name: file.name, sheet })
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setReading('') }
  }
  const valid = plan ? plan.added.length + plan.updated.length : 0
  const why = !read ? 'Choose the filled template.' : plan?.refused ? '' : !valid ? 'Nothing to save: no row is added or changed.' : ''
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!plan || !read || why || plan.refused || busy) return
    setBusy(true); setError('')
    try { await onSave(plan, read.name) }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  // The rows with errors first (they need a look), then the others, each in file order.
  const shown = plan ? [...plan.lines.filter((line) => line.outcome === 'error'), ...plan.lines.filter((line) => line.outcome !== 'error')].slice(0, previewRowCount) : []
  const outcome = { add: 'Add', update: 'Update', unchanged: 'Unchanged', error: 'Error', locked: 'Skipped' } as const
  return <Modal eyebrow={eyebrow} title="Upload Excel" wide onClose={() => { if (!busy) onCancel() }}>
    <form className="replace-form bulk-upload-form" onSubmit={(event) => void save(event)} aria-label="Upload Excel">
      <label>Excel or CSV file
        <input type="file" autoFocus accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" aria-label="Excel or CSV file" disabled={busy} onChange={(event) => void choose(event.target.files?.[0])} />
        <small>The template from ⋯ → Download Excel template…, filled in. Rows with a {rowIdHeader} update that row; rows without one are added. At most {maxUploadBytes / 1024 / 1024} MB and {fmt(maxUploadRows)} rows; one upload adds or updates up to {fmt(maxUploadChanges)} rows.</small>
      </label>
      {reading && <p className="muted" role="status">Reading {reading}…</p>}
      {plan && read && <div className="replace-preview bulk-preview" role="status" aria-label="Preview">
        <p><strong>{planSummary(plan)}</strong> <span className="muted">— {uploadName(read.name)}, sheet “{plan.sheet}”</span></p>
        {plan.refused && <Notice tone="error">{plan.refused}</Notice>}
        {plan.header.ignored.length > 0 && <p className="muted">Ignored column{plan.header.ignored.length === 1 ? '' : 's'} (not a column of {page.name}): {plan.header.ignored.map((name) => `“${name}”`).join(', ')}.</p>}
        {plan.header.duplicates.length > 0 && <p className="muted">Named twice, read from its first place: {plan.header.duplicates.map((name) => `“${name}”`).join(', ')}.</p>}
        {plan.header.missingRequired.length > 0 && <p className="muted">Required column{plan.header.missingRequired.length === 1 ? '' : 's'} not in the file: {plan.header.missingRequired.map((name) => `“${name}”`).join(', ')} — rows to add need {plan.header.missingRequired.length === 1 ? 'it' : 'them'}; updated rows keep their value.</p>}
        {plan.header.idIndex < 0 && !plan.refused && <p className="muted">The file has no {rowIdHeader} column: every row is added as a new row.</p>}
        {plan.locked > 0 && <p className="muted">{fmt(plan.locked)} row{plan.locked === 1 ? ' is' : 's are'} being edited by someone else and {plan.locked === 1 ? 'is' : 'are'} skipped.</p>}
        {plan.neutralised > 0 && <p className="muted">{fmt(plan.neutralised)} text value{plan.neutralised === 1 ? '' : 's'} starting with =, +, - or @ {plan.neutralised === 1 ? 'is' : 'are'} stored with an apostrophe first, so no spreadsheet runs {plan.neutralised === 1 ? 'it' : 'them'} as a formula.</p>}
        {shown.length > 0 && <div className="replace-rows bulk-rows"><table>
          <colgroup><col className="bulk-col-line" /><col className="bulk-col-id" /><col className="bulk-col-result" /><col /></colgroup>
          <thead><tr><th className="num">Line</th><th>{rowIdHeader}</th><th>Result</th><th>Values or error</th></tr></thead>
          <tbody>{shown.map((line) => <tr key={line.line} className={line.outcome === 'error' ? 'bulk-error' : undefined}><td className="num">{line.line}</td><td>{line.rowId || <span className="muted">new</span>}</td><td>{outcome[line.outcome]}</td><td>{line.text}</td></tr>)}</tbody>
        </table></div>}
        {plan.lines.length > shown.length && <p className="muted">Showing the first {shown.length} of {fmt(plan.lines.length)} rows.</p>}
        {plan.errors.length > 0 && <p className="bulk-errors-line">{fmt(plan.errors.length)} row{plan.errors.length === 1 ? ' has' : 's have'} errors and {plan.errors.length === 1 ? 'is' : 'are'} not saved — fix {plan.errors.length === 1 ? 'it' : 'them'} in the file and upload it again.{' '}
          <button type="button" className="ghost" onClick={() => downloadCsv(errorReportCsv(plan), `${uploadName(read.name).replace(/\.\w+$/, '')} - errors.csv`)}>Download error report (CSV)</button></p>}
      </div>}
      {plan && !plan.refused && valid > 0 && <p className="muted">Only the {fmt(valid)} valid row{valid === 1 ? ' is' : 's are'} saved to Git{rowFiles ? ', every changed row file in one commit' : ''}{plan.errors.length ? `; the ${fmt(plan.errors.length)} with errors are left out` : ''}. Each added or updated row gets an entry “Bulk upload from {uploadName(read!.name)}” in its History.</p>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">
        {why && <small className="muted write-blocked" role="note">{why}</small>}
        <button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={busy || Boolean(why || plan?.refused)}>{busy ? 'Saving to Git…' : 'Save to Git'}</button>
      </div>
    </form>
  </Modal>
}
