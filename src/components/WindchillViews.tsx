import { useState } from 'react'
import { windchillOps, windchillCell, type WindchillFilter, type WindchillView } from '../windchillViews'
import { formatDateTime } from '../format'
import { downloadCsv } from '../download'
import type { WindchillWorkspace } from '../useWindchill'
import type { GitStorage } from '../useGitStorage'
import { EmptyState, Notice, Panel, Pill } from './ui'

const blank = (): WindchillView => ({ id: crypto.randomUUID().replaceAll('-', ''), name: '', entitySet: '', filters: [{ field: '', op: 'eq', value: '' }], columns: [], showInMenu: true })

// Opens the view's search in the browser, where the company sign-in works, and imports the results saved (Ctrl+S) or
// copied from there; a next page from Windchill is added the same way.
function WindchillImport({ view, windchill }: { view: WindchillView; windchill: WindchillWorkspace }) {
  const [error, setError] = useState('')
  const source = windchill.sources.find((entry) => entry.viewId === view.id), url = windchill.searchUrl(view.id)
  const take = (text: string, nextPage: boolean) => { setError(''); windchill.importView(view.id, text, nextPage) }
  const file = (nextPage: boolean) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (chosen) void chosen.text().then((text) => take(text, nextPage), () => setError('The file could not be read.'))
  }
  const paste = (nextPage: boolean) => {
    if (!navigator.clipboard?.readText) { setError('Pasting is not available here; save the page and import the file.'); return }
    void navigator.clipboard.readText().then((text) => take(text, nextPage), () => setError('The clipboard could not be read; allow it, or save the page and import the file.'))
  }
  const steps = (nextPage: boolean, href: string) => <>
    {href ? <a className="ghost" href={href} target="_blank" rel="noreferrer">{nextPage ? 'Open next page' : 'Open in browser'}</a> : <button type="button" className="ghost" disabled title="Set the Windchill host in Settings first">Open in browser</button>}
    <label className="ghost">{nextPage ? 'Import next page' : 'Import file'}<input type="file" accept=".json,.txt,application/json,text/plain" onChange={file(nextPage)} /></label>
    <button type="button" className="ghost" onClick={() => paste(nextPage)}>{nextPage ? 'Paste next page' : 'Paste results'}</button>
  </>
  return <div className="windchill-import">{!window.windchill && <button type="button" className="ghost" disabled={!url} title={url ? undefined : 'Set the Windchill host in Settings first'} onClick={() => windchill.fetchViaTab([view.id])}>Fetch via Windchill tab</button>}{steps(false, url)}{source?.next && steps(true, source.next)}{error && <small className="negative">{error}</small>}</div>
}

// Settings: the Windchill views — object type, filter rows and columns — with Fetch, Open in browser and Import.
export function WindchillViewsPanel({ windchill }: { windchill: WindchillWorkspace }) {
  const [form, setForm] = useState<(WindchillView & { columnsText: string }) | null>(null)
  const [error, setError] = useState('')
  const edit = (view: WindchillView) => { setError(''); setForm({ ...view, filters: view.filters.length ? view.filters : [{ field: '', op: 'eq', value: '' }], columnsText: view.columns.join(', ') }) }
  const setFilter = (index: number, patch: Partial<WindchillFilter>) => setForm((current) => current && { ...current, filters: current.filters.map((filter, position) => position === index ? { ...filter, ...patch } : filter) })
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    try { windchill.saveView({ ...form, columns: form.columnsText.split(',') }); setForm(null); setError('') } catch (failure) { setError(failure instanceof Error ? failure.message : 'The view could not be saved.') }
  }
  return <Panel className="connection-panel" eyebrow="WINDCHILL" title="Windchill views" detail="Each view is one search: an object type, filter rows and the columns to show. Open in browser runs it where your company sign-in works; save the results (Ctrl+S) or copy them, then Import file or Paste results. Fetch runs it directly, from the browser with your Windchill sign-in there or from the desktop app, where Windchill allows that. With Git storage connected the results are also saved to Git for the web app." action={<button type="button" className="primary" onClick={() => edit(blank())}>＋ New view</button>}>
    {windchill.views.length ? <div className="azure-table"><table><thead><tr><th>View</th><th>Object type</th><th>Filters</th><th>Results</th><th /></tr></thead><tbody>{windchill.views.map((view) => {
      const source = windchill.sources.find((entry) => entry.viewId === view.id), status = windchill.status[view.id]
      return <tr key={view.id}><td><strong>{view.name}</strong>{!view.showInMenu && <small>not in menu</small>}</td><td>{view.entitySet}</td><td>{view.filters.map((filter) => `${filter.field} ${windchillOps.find((entry) => entry.op === filter.op)?.label} ${filter.value}`).join(' · ') || '—'}</td>
        <td>{source ? `${source.rows.length} · ${formatDateTime(source.fetchedAt)}${source.fromGit ? ' (via Git)' : ''}` : '—'}{status && <small className={status.state === 'error' ? 'negative' : ''}>{status.message}</small>}<WindchillImport view={view} windchill={windchill} /></td>
        <td><div className="button-row"><button type="button" className="ghost" disabled={status?.state === 'busy'} onClick={() => void windchill.fetchView(view.id)}>{status?.state === 'busy' ? 'Searching…' : 'Fetch'}</button><button type="button" className="ghost" onClick={() => edit(view)}>Edit</button><button type="button" className="text-button" onClick={() => { if (window.confirm(`Remove the Windchill view “${view.name}” and its saved results from this app?`)) windchill.removeView(view.id) }}>Remove</button></div></td></tr>
    })}</tbody></table></div> : !form && <EmptyState title="No Windchill views yet." detail="Add one: e.g. Documents (v7/DocMgmt/Documents — domains and versions are listed by Test connection) where Number starts with DHF and State/Value equals RELEASED, showing Number, Name, Version, State/Value." />}
    {form && <form className="connection-form windchill-form" onSubmit={save}>
      <label>View name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Released DHF documents" /></label>
      <label>Object type<input required value={form.entitySet} onChange={(event) => setForm({ ...form, entitySet: event.target.value })} placeholder="e.g. v7/DocMgmt/Documents or v7/ProdMgmt/Parts" /></label>
      <div className="wide-field windchill-filters"><span className="field-label">Filters (all must match)</span>
        {form.filters.map((filter, index) => <div key={index} className="windchill-filter">
          <input aria-label={`Field ${index + 1}`} value={filter.field} onChange={(event) => setFilter(index, { field: event.target.value })} placeholder="Field, e.g. Number" />
          <select aria-label={`Condition ${index + 1}`} value={filter.op} onChange={(event) => setFilter(index, { op: event.target.value as WindchillFilter['op'] })}>{windchillOps.map((entry) => <option key={entry.op} value={entry.op}>{entry.label}</option>)}</select>
          <input aria-label={`Value ${index + 1}`} value={filter.value} onChange={(event) => setFilter(index, { value: event.target.value })} placeholder="Value; dates as YYYY-MM-DD" />
          <button type="button" className="text-button" aria-label={`Remove filter ${index + 1}`} onClick={() => setForm({ ...form, filters: form.filters.filter((_, position) => position !== index) })}>✕</button>
        </div>)}
        <button type="button" className="ghost" onClick={() => setForm({ ...form, filters: [...form.filters, { field: '', op: 'eq', value: '' }] })}>＋ Add filter</button>
      </div>
      <label className="wide-field">Columns (comma-separated)<input required value={form.columnsText} onChange={(event) => setForm({ ...form, columnsText: event.target.value })} placeholder="e.g. Number, Name, Version, State/Value, LastModified" /></label>
      <label className="check"><input type="checkbox" checked={form.showInMenu} onChange={(event) => setForm({ ...form, showInMenu: event.target.checked })} />Show in the menu</label>
      <div className="connection-actions"><button className="primary">Save view</button><button type="button" className="ghost" onClick={() => { setForm(null); setError('') }}>Cancel</button></div>
    </form>}
    {error && <Notice tone="error">{error}</Notice>}
  </Panel>
}

// A Windchill view page: its last results with the chosen columns; search and CSV export; Fetch, or results opened in
// the browser and imported.
export function WindchillPage({ view, windchill, git, gitNote }: { view: WindchillView; windchill: WindchillWorkspace; git?: GitStorage; gitNote?: { tone: string; text: string } }) {
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [fromGit, setFromGit] = useState<{ tone: 'info' | 'success' | 'error'; text: string } | null>(null)
  // Load from Git: the results saved to Git (from this or another computer), like the on-prem views.
  async function loadFromGit() {
    if (!git) return
    setFromGit({ tone: 'info', text: 'Loading from Git…' })
    try {
      const result = await git.pullWindchillOne(view.id)
      windchill.reload()
      setFromGit(!result ? { tone: 'error', text: 'Git has no saved results for this export yet (they are saved at each import with Git storage connected).' } : { tone: 'success', text: result.applied ? `Loaded the results saved to Git (${formatDateTime(result.fetchedAt)}).` : `The results here are already the latest in Git (${formatDateTime(result.fetchedAt)}).` })
    } catch (failure) { setFromGit({ tone: 'error', text: `Load from Git failed: ${failure instanceof Error ? failure.message : String(failure)}` }) }
  }
  const source = windchill.sources.find((entry) => entry.viewId === view.id), status = windchill.status[view.id]
  const columns = source?.columns.length ? source.columns : view.columns
  const rows = (source?.rows ?? []).filter((row) => !search.trim() || columns.some((column) => windchillCell(row, column).toLowerCase().includes(search.trim().toLowerCase())))
  const csv = () => [columns.join(','), ...rows.map((row) => columns.map((column) => { const value = windchillCell(row, column); return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value }).join(','))].join('\r\n')
  return <Panel className="connection-panel backlog-panel">
    <div className="view-source-bar"><div><strong>{view.name}</strong><span className="muted"> · {view.exportFile ? `Windchill export ${view.exportFile}` : view.entitySet}{source ? ` · ${source.rows.length} results · ${view.exportFile ? 'imported' : 'fetched'} ${formatDateTime(source.fetchedAt)}${source.fromGit ? ' (desktop app, via Git)' : ''}` : ''}</span></div>
      <div className="button-row">{view.exportFile ? <ExportFileButton label="Import newer export" onFile={(text, file) => windchill.importExport(text, file, '', view.id)} onError={setError} /> : <button className="primary" disabled={status?.state === 'busy'} onClick={() => void windchill.fetchView(view.id)}>{status?.state === 'busy' ? 'Searching…' : source ? 'Refresh from Windchill' : 'Fetch from Windchill'}</button>}
        {git?.connected && <button type="button" className="ghost" disabled={fromGit?.text === 'Loading from Git…'} onClick={() => void loadFromGit()}>Load from Git</button>}
        {view.exportFile && <button type="button" className="text-button" onClick={() => { if (window.confirm(`Remove the Windchill export “${view.name}” from this app?`)) windchill.removeView(view.id) }}>Remove</button>}</div></div>
    {!view.exportFile && <WindchillImport view={view} windchill={windchill} />}
    {error && <Notice tone="error">{error}</Notice>}
    {fromGit && <Notice tone={fromGit.tone}>{fromGit.text}</Notice>}
    {status && <Notice tone={status.state === 'error' ? 'error' : status.state === 'busy' ? 'info' : 'success'}>{status.message}</Notice>}
    {gitNote && <div className={`notice ${gitNote.tone}`} role="status">{gitNote.text}</div>}
    {!source ? <EmptyState title={`“${view.name}” has not been fetched yet.`} detail="Fetch it from Windchill, or Open in browser, save the results (Ctrl+S) or copy them, then Import file or Paste results. Results saved to Git from another computer also appear here." />
      : <div className="query-view">
        <div className="query-toolbar"><input className="search" aria-label={`Search ${view.name}`} placeholder="Search all columns" value={search} onChange={(event) => setSearch(event.target.value)} /><span className="muted">{rows.length} of {source.rows.length}</span>{!view.exportFile && <Pill tone="info">{view.filters.length} filter{view.filters.length === 1 ? '' : 's'}</Pill>}<button type="button" className="ghost" onClick={() => downloadCsv(csv(), `${view.name.replace(/[^\w-]+/g, '-')}.csv`)}>Export CSV</button></div>
        <div className="azure-table query-table"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.slice(0, 1000).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{windchillCell(row, column)}</td>)}</tr>)}</tbody></table></div>
        {rows.length > 1000 && <p className="muted">Showing the first 1000 of {rows.length}; search to narrow, or export CSV for all.</p>}
      </div>}
  </Panel>
}

// Chooses an export file and hands its text on; a file that is not an export is reported.
function ExportFileButton({ label, onFile, onError }: { label: string; onFile: (text: string, fileName: string) => void; onError: (message: string) => void }) {
  return <label className="primary file-button">{label}<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    void file.text().then((text) => { onError(''); try { onFile(text, file.name) } catch (failure) { onError(failure instanceof Error ? failure.message : String(failure)) } }, () => onError('The file could not be read.'))
  }} /></label>
}

// Release Details → Import Windchill export: a search run in Windchill and exported as CSV becomes a page here.
export function WindchillExportImport({ windchill, git, onImported }: { windchill: WindchillWorkspace; git?: GitStorage; onImported: (id: string) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [fromGit, setFromGit] = useState<{ tone: 'info' | 'success' | 'warning' | 'error'; text: string } | null>(null)
  // Restore every export saved to Git (e.g. on a new computer): missing ones are added, newer results replace older.
  async function loadAll() {
    if (!git) return
    setFromGit({ tone: 'info', text: 'Loading from Git…' })
    try {
      const result = await git.pullWindchill()
      windchill.reload()
      setFromGit({ tone: result.failed.length ? 'warning' : result.files ? 'success' : 'info', text: result.files ? `${result.files} export${result.files === 1 ? '' : 's'} in Git; ${result.applied.length ? `newer results loaded for ${result.applied.join(', ')}` : 'the results here are already up to date'}.${result.added ? ` ${result.added} added to Release Details.` : ''}${result.failed.length ? ` Not readable: ${result.failed.join(', ')}.` : ''}` : 'No Windchill exports saved in Git yet.' })
    } catch (failure) { setFromGit({ tone: 'error', text: `Load from Git failed: ${failure instanceof Error ? failure.message : String(failure)}` }) }
  }
  return <Panel className="connection-panel" eyebrow="RELEASE DETAILS" title="Import a Windchill export" detail="In Windchill, run your search (e.g. a saved search), export the result list to a CSV file, then import it here. The columns are kept as in the file; with Git storage connected the export is also saved to Git for the web app.">
    <div className="connection-form">
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. GSS_BST released documents (default: the file name)" /></label>
      <div className="connection-actions"><ExportFileButton label="Choose CSV export…" onFile={(text, file) => { onImported(windchill.importExport(text, file, name)); setName('') }} onError={setError} />{git?.connected && <button type="button" className="ghost" disabled={fromGit?.text === 'Loading from Git…'} onClick={() => void loadAll()}>Load all exports from Git</button>}</div>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {fromGit && <Notice tone={fromGit.tone}>{fromGit.text}</Notice>}
    <p className="muted">CSV or tab-separated text. Excel files: open them and save as CSV first.</p>
  </Panel>
}
