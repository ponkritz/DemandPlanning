import { useMemo, useRef, useState } from 'react'
import { EmptyState, Modal, Notice, Page, Panel } from '../components/ui'
import { downloadCsv, downloadXlsx } from '../download'
import { addColumn, addRow, deleteColumn, deleteRows, filterRows, fromWorkbook, groupRows, moveColumn, renameColumn, replaceSheet, setCell, tableCsv, tableRows, type QeMappingFile, type QeRow, type QeSheet } from '../qeMapping'
import type { QeMappingStore } from '../useQeMapping'
import type { GitStorage } from '../useGitStorage'
import { readCsv, readXlsx, writeXlsx } from '../xlsx'
import { formatDateTime } from '../format'

// QE Mapping: upload the existing Excel (or CSV) and keep it as it is — every sheet a tab, its first row the
// columns — then filter, edit cells, add / delete rows and columns, hide, move and group columns here. Changes are a
// draft until Save to Git (qe-mapping.json, shared with everyone); anyone whose Git token can save may change it.
// Hidden columns are this viewer's own (kept in this browser); grouping and filters are for this visit.
const hiddenKey = 'demand-planning-qe-hidden-v1'
function loadHidden(): Record<string, string[]> { try { const value = JSON.parse(localStorage.getItem(hiddenKey) ?? '{}'); return value && typeof value === 'object' ? value : {} } catch { return {} } }
const pageSize = 300

export function QeMappingPage({ git, store }: { git: GitStorage; store: QeMappingStore }) {
  const [draft, setDraft] = useState<QeMappingFile | null>(null)
  const [sheetId, setSheetId] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showFilters, setShowFilters] = useState(false)
  const [groupBy, setGroupBy] = useState('')
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [editing, setEditing] = useState<{ row: string; column: string; value: string } | null>(null)
  const [dialog, setDialog] = useState<{ mode: 'add' | 'rename'; id?: string; name: string; error?: string } | null>(null)
  const [menu, setMenu] = useState('')
  const [picking, setPicking] = useState(false)
  const [hiddenBySheet, setHiddenBySheet] = useState(loadHidden)
  const [limit, setLimit] = useState(pageSize)
  const [commit, setCommit] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error' | 'info'; text: string; url?: string } | null>(null)
  const upload = useRef<HTMLInputElement>(null)

  const editable = git.connected && !git.readOnly && !git.isSample
  const file = draft ?? store.file
  const sheet = file?.sheets.find((entry) => entry.id === sheetId) ?? file?.sheets[0]
  const hidden = useMemo(() => sheet ? hiddenBySheet[sheet.id] ?? [] : [], [sheet, hiddenBySheet])
  const columns = useMemo(() => sheet ? sheet.columns.filter((column) => !hidden.includes(column.id)) : [], [sheet, hidden])
  const rows = useMemo(() => sheet ? filterRows(sheet, search, filters, columns) : [], [sheet, search, filters, columns])
  const groups = useMemo(() => groupBy && sheet?.columns.some((column) => column.id === groupBy) ? groupRows(rows, groupBy) : null, [rows, groupBy, sheet])

  const change = (update: (current: QeSheet) => QeSheet) => { if (!file || !sheet) return; setDraft(replaceSheet(file, update(sheet))); setResult(null) }
  const setHidden = (ids: string[]) => { if (!sheet) return; const next = { ...hiddenBySheet, [sheet.id]: ids }; setHiddenBySheet(next); try { localStorage.setItem(hiddenKey, JSON.stringify(next)) } catch { /* this visit only */ } }
  const pickSheet = (id: string) => { setSheetId(id); setSearch(''); setFilters({}); setGroupBy(''); setSelected([]); setEditing(null); setLimit(pageSize); setMenu('') }

  async function onUpload(chosen: File | undefined) {
    if (!chosen) return
    setResult(null)
    try {
      const name = chosen.name.toLowerCase()
      if (name.endsWith('.xls')) throw new Error('Old .xls files cannot be read. Open the file in Excel and save it as .xlsx (Excel Workbook) or CSV, then upload that.')
      const sheets = name.endsWith('.csv') ? [{ name: chosen.name.replace(/\.csv$/i, ''), rows: readCsv(await chosen.text()) }] : await readXlsx(new Uint8Array(await chosen.arrayBuffer()))
      const next = fromWorkbook(sheets, chosen.name)
      if (file && !window.confirm(`Replace the whole QE Mapping (${file.sheets.length} tab${file.sheets.length === 1 ? '' : 's'}) with “${chosen.name}” (${next.sheets.length} tab${next.sheets.length === 1 ? '' : 's'})? It is saved for everyone only when you press Save to Git.`)) return
      setDraft(next); pickSheet(next.sheets[0].id)
      setResult({ tone: 'info', text: `“${chosen.name}” read as it is: ${next.sheets.map((entry) => `${entry.name} (${entry.rows.length} rows, ${entry.columns.length} columns)`).join(', ')}. Review it, then Save to Git.` })
    } catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { if (upload.current) upload.current.value = '' }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    setBusy(true)
    try { const saved = await store.save(draft, commit.trim() || `Update the QE Mapping${draft.source ? ` (${draft.source.fileName})` : ''}`); setDraft(null); setCommit(''); setResult({ tone: 'success', text: 'QE Mapping saved to Git.', url: saved.commitUrl }) }
    catch (failure) { setResult({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  function commitEdit() { if (!editing) return; const { row, column, value } = editing; setEditing(null); const current = sheet?.rows.find((entry) => entry.id === row)?.cells[column] ?? ''; if (value !== current) change((entry) => setCell(entry, row, column, value)) }
  function submitDialog(event: React.FormEvent) {
    event.preventDefault()
    if (!dialog || !sheet) return
    try { const next = dialog.mode === 'add' ? addColumn(sheet, dialog.name) : renameColumn(sheet, dialog.id!, dialog.name); change(() => next); setDialog(null) }
    catch (failure) { setDialog({ ...dialog, error: failure instanceof Error ? failure.message : String(failure) }) }
  }
  const removeColumn = (id: string) => { const column = sheet?.columns.find((entry) => entry.id === id); if (!column || !window.confirm(`Delete the column “${column.name}” and its values in every row? Saved for everyone with Save to Git.`)) return; change((entry) => deleteColumn(entry, id)); if (groupBy === id) setGroupBy(''); setMenu('') }
  const removeRows = () => { if (!selected.length || !window.confirm(`Delete ${selected.length} row${selected.length === 1 ? '' : 's'}? Saved for everyone with Save to Git.`)) return; change((entry) => deleteRows(entry, selected)); setSelected([]) }
  // A new row comes first; the search and filters are cleared so it is in view.
  const newRow = () => { change((entry) => addRow(entry).sheet); setSearch(''); setFilters({}) }
  const exportCsv = () => sheet && downloadCsv(tableCsv(columns, rows), `${(sheet.name || 'qe-mapping').replace(/[^\w-]+/g, '-')}.csv`)
  const exportXlsx = () => file && downloadXlsx(writeXlsx(file.sheets.map((entry) => ({ name: entry.name, rows: tableRows(entry.columns, entry.rows) }))), `${(file.source?.fileName.replace(/\.\w+$/, '') || 'qe-mapping')}.xlsx`)

  const cell = (row: QeRow, columnId: string) => editable && editing?.row === row.id && editing.column === columnId
    ? <input autoFocus aria-label="Edit cell" value={editing.value} onChange={(event) => setEditing({ ...editing, value: event.target.value })} onBlur={commitEdit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitEdit() } if (event.key === 'Escape') setEditing(null) }} />
    : <span className={editable ? 'qe-cell-editable' : undefined} onClick={() => { if (editable) setEditing({ row: row.id, column: columnId, value: row.cells[columnId] ?? '' }) }} title={editable ? 'Click to edit' : undefined}>{row.cells[columnId] ?? ''}</span>
  const rowLine = (row: QeRow) => <tr key={row.id} className={selected.includes(row.id) ? 'qe-row-selected' : undefined}>
    {editable && <td className="qe-select"><input type="checkbox" aria-label="Select row" checked={selected.includes(row.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} /></td>}
    {columns.map((column) => <td key={column.id}>{cell(row, column.id)}</td>)}
  </tr>
  let shown = 0
  const limited = (list: QeRow[]) => { const take = Math.max(0, Math.min(list.length, limit - shown)); shown += take; return list.slice(0, take) }

  return <Page className="qe-mapping-page" intro="The QE Mapping as uploaded from Excel, shared through Git. Filter, edit cells, add or delete rows and columns, hide, move and group columns."
    actions={<>{editable && <><input ref={upload} type="file" accept=".xlsx,.csv,.xls" hidden onChange={(event) => void onUpload(event.target.files?.[0])} /><button type="button" className="primary" onClick={() => upload.current?.click()}>{file ? 'Upload a new Excel…' : 'Upload Excel…'}</button></>}{file && <><button type="button" className="ghost" onClick={exportXlsx} title="Every tab with all its columns and rows">Export Excel</button><button type="button" className="ghost" onClick={exportCsv} title="This tab: the shown columns and the filtered rows">Export CSV</button></>}{git.connected && <button type="button" className="ghost" onClick={() => { if (draft && !window.confirm('Discard the unsaved changes?')) return; setDraft(null); setResult(null); void store.reload() }}>Reload from Git</button>}</>}>
    {!git.connected && <Notice tone="info">Connect Git storage (Settings → Storage) to upload and edit the QE Mapping; it is shared with everyone through Git.{store.file ? ' The mapping last loaded in this browser is shown.' : ''}</Notice>}
    {git.connected && git.readOnly && <Notice tone="info">View only: your Git token can read but not save.</Notice>}
    {git.isSample && <Notice tone="warning">Synthetic sample data is loaded: the QE Mapping cannot be changed.</Notice>}
    {store.error && <Notice tone="error">QE Mapping: {store.error}</Notice>}
    {result && <Notice tone={result.tone}>{result.text}{result.url && <> <a href={result.url} target="_blank" rel="noreferrer">View commit</a></>}</Notice>}
    {!file || !sheet ? <Panel><EmptyState title={git.connected && !store.loaded ? 'Loading the QE Mapping from Git…' : 'No QE Mapping yet.'} detail={editable ? 'Upload the existing Excel (.xlsx) or a CSV: every sheet becomes a tab and its first row the columns, as they are. Then edit it here and Save to Git.' : 'Someone who can save to Git uploads the Excel here.'} /></Panel> : <Panel className="qe-panel">
      {file.sheets.length > 1 && <div className="segmented qe-tabs" role="tablist" aria-label="Sheets">{file.sheets.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={entry.id === sheet.id} aria-pressed={entry.id === sheet.id} onClick={() => pickSheet(entry.id)}>{entry.name} <small>{entry.rows.length}</small></button>)}</div>}
      <div className="query-toolbar qe-toolbar">
        <input className="search" aria-label="Search the QE Mapping" placeholder="Search all shown columns" value={search} onChange={(event) => { setSearch(event.target.value); setLimit(pageSize) }} />
        <button type="button" className="ghost" aria-pressed={showFilters} onClick={() => { setShowFilters(!showFilters); if (showFilters) setFilters({}) }}>{showFilters ? 'Hide filters' : 'Filter by column'}</button>
        <label className="inline-select">Group by<select value={groupBy} onChange={(event) => { setGroupBy(event.target.value); setCollapsed([]) }}><option value="">No grouping</option>{sheet.columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
        <button type="button" className="ghost" aria-expanded={picking} onClick={() => setPicking(!picking)}>Columns ({columns.length} of {sheet.columns.length})</button>
        {editable && <><button type="button" className="ghost" onClick={newRow}>＋ Add row</button><button type="button" className="ghost" onClick={() => setDialog({ mode: 'add', name: '' })}>＋ Add column</button>{selected.length > 0 && <button type="button" className="ghost danger-text" onClick={removeRows}>Delete {selected.length} row{selected.length === 1 ? '' : 's'}</button>}</>}
        <span className="muted">{rows.length} of {sheet.rows.length} rows{search || Object.values(filters).some(Boolean) ? ' · filtered' : ''}</span>
      </div>
      {picking && <fieldset className="column-chooser"><legend>Columns — tick the ones to show (your own choice, kept in this browser)</legend>
        <div className="button-row"><button type="button" className="text-button" onClick={() => setHidden([])}>Show all</button></div>
        <div className="column-chooser-list">{sheet.columns.map((column) => <label key={column.id} className="check"><input type="checkbox" checked={!hidden.includes(column.id)} disabled={!hidden.includes(column.id) && columns.length < 2} onChange={(event) => setHidden(event.target.checked ? hidden.filter((id) => id !== column.id) : [...hidden, column.id])} />{column.name}</label>)}</div>
      </fieldset>}
      {file.source && <p className="muted qe-source">From “{file.source.fileName}”{file.source.uploadedAt ? `, uploaded ${formatDateTime(file.source.uploadedAt)}` : ''}{store.history ? <> · <a href={store.history} target="_blank" rel="noreferrer">History in GitHub</a></> : null}</p>}
      <div className="azure-table qe-table"><table>
        <thead><tr>{editable && <th className="qe-select"><input type="checkbox" aria-label="Select all shown rows" checked={rows.length > 0 && rows.every((row) => selected.includes(row.id))} onChange={(event) => setSelected(event.target.checked ? rows.map((row) => row.id) : [])} /></th>}
          {columns.map((column, index) => <th key={column.id}><div className="qe-head"><span>{column.name}</span><button type="button" className="qe-menu-button" aria-label={`Column menu: ${column.name}`} aria-expanded={menu === column.id} onClick={() => setMenu(menu === column.id ? '' : column.id)}>▾</button></div>
            {menu === column.id && <div className="qe-menu" role="menu">
              {editable && <button type="button" role="menuitem" onClick={() => { setDialog({ mode: 'rename', id: column.id, name: column.name }); setMenu('') }}>Rename…</button>}
              <button type="button" role="menuitem" disabled={columns.length < 2} onClick={() => { setHidden([...hidden, column.id]); setMenu('') }}>Hide</button>
              {editable && <><button type="button" role="menuitem" disabled={index === 0} onClick={() => { change((entry) => moveColumn(entry, column.id, -1)); setMenu('') }}>Move left</button><button type="button" role="menuitem" disabled={index === columns.length - 1} onClick={() => { change((entry) => moveColumn(entry, column.id, 1)); setMenu('') }}>Move right</button></>}
              <button type="button" role="menuitem" onClick={() => { setGroupBy(groupBy === column.id ? '' : column.id); setCollapsed([]); setMenu('') }}>{groupBy === column.id ? 'Ungroup' : 'Group by this'}</button>
              {editable && <button type="button" role="menuitem" className="danger-text" onClick={() => removeColumn(column.id)}>Delete column…</button>}
            </div>}
          </th>)}</tr>
          {showFilters && <tr className="qe-filters">{editable && <th />}{columns.map((column) => <th key={column.id}><input aria-label={`Filter ${column.name}`} placeholder="Filter…" value={filters[column.id] ?? ''} onChange={(event) => { setFilters({ ...filters, [column.id]: event.target.value }); setLimit(pageSize) }} /></th>)}</tr>}
        </thead>
        <tbody>
          {groups ? groups.flatMap((group) => { const open = !collapsed.includes(group.value); return [<tr key={`g:${group.value}`} className="qe-group"><td colSpan={columns.length + (editable ? 1 : 0)}><button type="button" className="text-button" aria-expanded={open} onClick={() => setCollapsed((current) => open ? [...current, group.value] : current.filter((value) => value !== group.value))}>{open ? '▾' : '▸'} {sheet.columns.find((column) => column.id === groupBy)?.name}: {group.value || '(blank)'}</button> <span className="muted">{group.rows.length}</span></td></tr>, ...(open ? limited(group.rows).map(rowLine) : [])] }) : limited(rows).map(rowLine)}
          {!rows.length && <tr><td colSpan={columns.length + (editable ? 1 : 0)} className="muted">{sheet.rows.length ? 'No row matches the search or filters.' : 'No rows yet.'}</td></tr>}
        </tbody>
      </table></div>
      {rows.length > limit && <div className="button-row"><button type="button" className="ghost" onClick={() => setLimit(limit + pageSize)}>Show {Math.min(pageSize, rows.length - limit)} more</button><span className="muted">Showing {limit} of {rows.length} rows; search or filter to narrow.</span></div>}
      {editable && draft && <form className="git-bar git-bar-dirty" onSubmit={save}>
        <span><strong>Unsaved QE Mapping</strong> — not yet in Git</span>
        <input aria-label="Change description" value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="Describe the change" />
        <button type="button" className="ghost" disabled={busy} onClick={() => { if (!window.confirm('Discard the unsaved changes?')) return; setDraft(null); setResult(null) }}>Discard</button>
        <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save to Git'}</button>
      </form>}
    </Panel>}
    {dialog && <Modal title={dialog.mode === 'add' ? 'Add a column' : 'Rename the column'} eyebrow={`QE MAPPING · ${sheet?.name ?? ''}`} form onClose={() => setDialog(null)}>
      <form onSubmit={submitDialog}>
        <label>Column name<input autoFocus required maxLength={120} value={dialog.name} onChange={(event) => setDialog({ ...dialog, name: event.target.value, error: undefined })} /></label>
        {dialog.error && <Notice tone="error">{dialog.error}</Notice>}
        <div className="modal-actions"><button type="button" className="ghost" onClick={() => setDialog(null)}>Cancel</button><button className="primary">{dialog.mode === 'add' ? 'Add column' : 'Rename'}</button></div>
      </form>
    </Modal>}
  </Page>
}
