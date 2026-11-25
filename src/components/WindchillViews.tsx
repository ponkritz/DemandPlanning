import { useRef, useState, useSyncExternalStore } from 'react'
import { isRunning, recordJob, runInBackground, subscribeJobs } from '../backgroundJobs'
import { projectLevels, windchillOps, windchillCell, type WindchillFilter, type WindchillLogic, type WindchillView } from '../windchillViews'
import { streamNamed, windchillOptionsForView } from '../streams'
import { ResultTabs } from './ResultTabs'
import { DataTable, type DataColumn } from './DataTable'
import { releasesInMonth, windchillDateValue } from '../windchillReleases'
import { PeriodSelect, ReleaseCounts, ReleaseSourceBar, type ReleaseScope } from './ReleasePage'
import { formatDateTime, monthName } from '../format'
import type { WindchillWorkspace } from '../useWindchill'
import type { GitStorage } from '../useGitStorage'
import { EmptyState, Notice, Page, Panel, Pill, TablePanel } from './ui'
import { WindchillReleasesPanel, type ReleaseBoard } from './WindchillReleasesPanel'
import { useWindchillReading } from '../useWindchillReading'

const blank = (): WindchillView => ({ id: crypto.randomUUID().replaceAll('-', ''), name: '', entitySet: '', filters: [{ field: '', op: 'eq', value: '' }], columns: [], showInMenu: true })

// Opens the view's search in the browser, where the company sign-in works, and imports the results saved (Ctrl+S) or
// copied from there; a next page from Windchill is added the same way. QV-63: a file or clipboard that cannot be read
// is a Background jobs entry, like the import's result.
function WindchillImport({ view, windchill }: { view: WindchillView; windchill: WindchillWorkspace }) {
  const source = windchill.sources.find((entry) => entry.viewId === view.id), url = windchill.searchUrl(view.id)
  const setError = (text: string) => { recordJob(`windchill:${view.id}`, `Import Windchill results · ${view.name}`, { text, failed: true }) }
  const take = (text: string, nextPage: boolean) => windchill.importView(view.id, text, nextPage)
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
  return <div className="windchill-import">{!window.windchill && <button type="button" className="ghost" disabled={!url} title={url ? undefined : 'Set the Windchill host in Settings first'} onClick={() => windchill.fetchViaTab([view.id])}>Fetch via Windchill tab</button>}{steps(false, url)}{source?.next && steps(true, source.next)}</div>
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
  return <Panel className="connection-panel" eyebrow="WINDCHILL" title="Windchill views" info="Each view is one search: an object type, filter rows and the columns to show. Open in browser runs it where your company sign-in works; save the results (Ctrl+S) or copy them, then Import file or Paste results. Fetch runs it directly, from the browser with your Windchill sign-in there or from the desktop app, where Windchill allows that. With Git storage connected the results are also saved to Git for the web app." action={<button type="button" className="primary" onClick={() => edit(blank())}>＋ New view</button>}>
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

// A Windchill view page (S&S IT, ECP and every other export or search): its Release page with the parts of
// UI-STANDARDS §10 (QV-62) — the source bar (Show: {month} / All months, ↻ and ⋯; QV-70: the export file or object
// type and when imported or fetched as the first line of ⋯), the counts (QV-64: Releases in the month and Supported, as Pulse Check counts the
// Windchill streams; no Completed), the Releases | Source data tabs and the Releases table. QV-63: the results of ↻,
// Import, Load from Git and Save to Git are Background jobs entries; the page keeps only warnings about its data.
export function WindchillPage({ view, windchill, git, gitNote, month, board }: { view: WindchillView; windchill: WindchillWorkspace; git?: GitStorage; gitNote?: { tone: string; text: string }; month?: string; board?: ReleaseBoard }) {
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<ReleaseScope>('month')
  const gitKey = `windchill-git:${view.id}`
  const loading = useSyncExternalStore(subscribeJobs, () => isRunning(gitKey))
  // Load from Git: the results saved to Git (from this or another computer), like the on-prem views.
  function loadFromGit() {
    if (!git) return
    runInBackground(gitKey, `Load from Git · ${view.name}`, async (progress) => {
      progress('Loading from Git…')
      try {
        const result = await git.pullWindchillOne(view.id)
        windchill.reload()
        return !result ? { text: 'Git has no saved results for this export yet (they are saved at each import with Git storage connected).', failed: true } : { text: result.applied ? `Loaded the results saved to Git (${formatDateTime(result.fetchedAt)}).` : `The results here are already the latest in Git (${formatDateTime(result.fetchedAt)}).` }
      } catch (failure) { return { text: `Load from Git failed: ${failure instanceof Error ? failure.message : String(failure)}`, failed: true } }
    })
  }
  const source = windchill.sources.find((entry) => entry.viewId === view.id), status = windchill.status[view.id]
  const columns = source?.columns.length ? source.columns : view.columns
  const reading = useWindchillReading(view, source?.rows ?? noRows, columns)
  const rows = (source?.rows ?? []).filter((row) => !search.trim() || columns.some((column) => windchillCell(row, column).toLowerCase().includes(search.trim().toLowerCase())))
  // UI-07…12: the raw rows follow the table default; a date written by Windchill ("27-Oct-2026 09:15") is exported as a date-time.
  const rawColumns: DataColumn<Record<string, unknown>>[] = columns.map((column) => ({ id: column, label: column, value: (row) => windchillDateValue(windchillCell(row, column)), render: (row) => windchillCell(row, column) }))
  // QV-48: a small main action (↻ import a newer file, or refresh a search) and the rest in a ⋯ menu.
  const importError = (text: string) => { if (text) recordJob(`windchill:${view.id}`, `Import Windchill export · ${view.name}`, { text, failed: true }) }
  const primary = view.exportFile ? <ExportFileButton label="↻" title="Import newer export" className="primary" onFile={(text, file) => windchill.importExport(text, file, '', view.id)} onError={importError} />
    : <button type="button" className="primary" aria-label={source ? 'Refresh from Windchill' : 'Fetch from Windchill'} title={source ? 'Refresh from Windchill' : 'Fetch from Windchill'} disabled={status?.state === 'busy'} onClick={() => void windchill.fetchView(view.id)}>↻{status?.state === 'busy' ? <small>Searching…</small> : null}</button>
  // CON-108: ⋯ → Upload latest export… replaces this page's results with a newer export file (the same as ↻), named so
  // it is found; the page, its name and its setup (Standard / ECP) stay.
  const uploadInput = useRef<HTMLInputElement>(null)
  const upload = view.exportFile ? <input ref={uploadInput} type="file" hidden aria-label={`Upload latest export: ${view.name}`} accept=".csv,.txt,text/csv,text/plain" onChange={(event) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    void file.text().then((text) => { try { windchill.importExport(text, file.name, '', view.id) } catch (failure) { importError(failure instanceof Error ? failure.message : String(failure)) } }, () => importError('The file could not be read.'))
  }} /> : null
  const menu = [...(view.exportFile ? [{ key: 'upload', label: 'Upload latest export…', onClick: () => uploadInput.current?.click() }] : []), ...(git?.connected ? [{ key: 'git', label: 'Load from Git', disabled: loading, onClick: loadFromGit }] : []), ...(view.exportFile ? [{ key: 'remove', label: 'Remove this export…', danger: true, onClick: () => { if (window.confirm(`Remove the Windchill export “${view.name}” from this app?`)) windchill.removeView(view.id) } }] : [])]
  // (2) QV-64: the releases (ECP: projects) with a document dated in the header month, as the Releases table lists
  // them; Supported counts the same releases, as Pulse Check's Supported line does for a Windchill stream. Completed is
  // left out: an export has no completion event (no signature, milestone or Release Notes rule), only document dates.
  const { result } = reading, project = Boolean(windchillOptionsForView(view).project), noun = project ? 'project' : 'release'
  const inMonth = month && source ? releasesInMonth(result.releases, month).length : 0
  const dated = Boolean(result.dateColumn)
  const counted = (hint: string) => dated ? { value: inMonth, hint } : { value: '—', hint: 'No date column in the export' }
  const counts = source && month ? <ReleaseCounts month={month}
    releases={counted(`The ${noun}s the Releases table lists for the month`)}
    supported={counted(`Each ${noun} with a document dated in the month, as Pulse Check counts it`)}
    counted={<ul><li><strong>Releases in {monthName(month)}</strong>: the {noun}s the Releases table lists for the month — each {noun} with at least one document whose {result.dateColumn ? `“${result.dateColumn}”` : 'date'} is in the month (UTC), read from the {result.source === 'location' ? 'Location' : 'document names'} as chosen under Read from.</li><li><strong>Supported</strong>: the same {noun}s — Pulse Check and the Monthly pack count every {noun} of a Windchill stream with a document dated in the month as supported (with Read from on Automatic).</li><li><strong>Completed</strong> is not counted: the export has no completion event (no signature, milestone or Release Notes rule), only the documents' dates.</li>{!dated && <li>The export has no date column (a column named like Last Modified, Modified, Released or Date), so nothing can be counted for a month.</li>}</ul>} /> : null
  // ⋯ → About this source… (QV-70): the Git copy of the results (saved, unchanged); a failed save to Git stays on the page as a warning.
  const about = gitNote && gitNote.tone !== 'error' ? <p>{gitNote.text}</p> : undefined
  return <Page className="release-page">
    <ReleaseSourceBar name={view.name} source={view.exportFile ? `Windchill export ${view.exportFile}` : view.entitySet}
      fetched={source ? `${source.rows.length} results · ${view.exportFile ? 'imported' : 'fetched'} ${formatDateTime(source.fetchedAt)}${source.fromGit ? ' (desktop app, via Git)' : ''}` : undefined}
      about={about} period={source && month ? <PeriodSelect month={month} value={scope} onChange={setScope} /> : undefined} primary={primary} menu={menu}>
      {upload}
      {!view.exportFile && <WindchillImport view={view} windchill={windchill} />}
      {/* Warnings about the data shown (§8): the last fetch failed, so the results are older; the Git copy is not saved. */}
      {source && status?.state === 'error' && <Notice tone="warning">Not refreshed: {status.message} The results shown are from {formatDateTime(source.fetchedAt)}.</Notice>}
      {gitNote?.tone === 'error' && <Notice tone="warning">{gitNote.text}</Notice>}
    </ReleaseSourceBar>
    {counts}
    {!source ? <Panel><EmptyState title={`“${view.name}” has not been fetched yet.`} detail="Fetch it from Windchill, or Open in browser, save the results (Ctrl+S) or copy them, then Import file or Paste results. Results saved to Git from another computer also appear here." /></Panel>
      // QV-47: the consolidation (the releases; ECP's projects) and the source data (the imported rows) are two tabs of the page.
      : <ResultTabs id={`wc:${view.id}`} rawCount={source.rows.length} main={<WindchillReleasesPanel view={view} rows={source.rows} columns={columns} git={git} month={month} scope={scope} board={board} reading={reading} onSetup={view.exportFile ? (setup) => windchill.setSetup(view.id, setup) : undefined} />} raw={<TablePanel><DataTable id={`wc:${view.id}`} columns={rawColumns} rows={rows} rowKey={(_, index) => String(index)} exportName={view.name} limit={1000}
        toolbar={<>{!view.exportFile && <Pill tone="info">{view.filters.length} filter{view.filters.length === 1 ? '' : 's'}</Pill>}<input className="search" aria-label={`Search ${view.name}`} placeholder="Search all columns" value={search} onChange={(event) => setSearch(event.target.value)} /></>}
        status={`${rows.length} of ${source.rows.length}`} /></TablePanel>} />}
  </Page>
}
const noRows: Record<string, unknown>[] = []

// Chooses an export file and hands its text on; a file that is not an export is reported.
function ExportFileButton({ label, onFile, onError, title, className = 'primary file-button' }: { label: string; onFile: (text: string, fileName: string) => void; onError: (message: string) => void; title?: string; className?: string }) {
  return <label className={className} title={title} aria-label={title}>{label}<input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(event) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    void file.text().then((text) => { onError(''); try { onFile(text, file.name) } catch (failure) { onError(failure instanceof Error ? failure.message : String(failure)) } }, () => onError('The file could not be read.'))
  }} /></label>
}

// Release Details → Import Windchill export: a search run in Windchill and exported as CSV becomes a page here.
// Opened from a stream not imported yet ("＋ ECP"), the Name is that stream's, so the export becomes its page (CON-85).
// The Logic dropdown (CON-87): Standard reads releases (S&S IT's rules); ECP reads projects "<number> <name>" from the
// Location folder chosen under "Project details at" (2nd, 3rd…); several ECP exports each get their own name.
export function WindchillExportImport({ windchill, git, onImported, stream = '' }: { windchill: WindchillWorkspace; git?: GitStorage; onImported: (id: string) => void; stream?: string }) {
  // ECP and a custom stream "Like ECP" (STR-03) start on the ECP logic.
  const [name, setName] = useState(stream)
  const [logic, setLogic] = useState<WindchillLogic>(streamNamed(stream)?.project ? 'ecp' : 'standard')
  const [projectLevel, setProjectLevel] = useState(2)
  const [error, setErrorText] = useState('')
  // An import that fails stays in the form above its button until fixed (§8) and is a Background jobs entry too.
  const setError = (text: string) => { setErrorText(text); if (text) recordJob('windchill-import', `Import Windchill export · ${name.trim() || stream || 'new export'}`, { text, failed: true }) }
  const loading = useSyncExternalStore(subscribeJobs, () => isRunning('windchill-git:all'))
  // Restore every export saved to Git (e.g. on a new computer): missing ones are added, newer results replace older.
  // QV-63: a Background job; its result names what was loaded.
  function loadAll() {
    if (!git) return
    runInBackground('windchill-git:all', 'Load all Windchill exports from Git', async (progress) => {
      progress('Loading from Git…')
      try {
        const result = await git.pullWindchill()
        windchill.reload()
        return { failed: result.failed.length > 0, text: result.files ? `${result.files} export${result.files === 1 ? '' : 's'} in Git; ${result.applied.length ? `newer results loaded for ${result.applied.join(', ')}` : 'the results here are already up to date'}.${result.added ? ` ${result.added} added to Release Details.` : ''}${result.failed.length ? ` Not readable: ${result.failed.join(', ')}.` : ''}` : 'No Windchill exports saved in Git yet.' }
      } catch (failure) { return { text: `Load from Git failed: ${failure instanceof Error ? failure.message : String(failure)}`, failed: true } }
    })
  }
  return <Panel className="connection-panel" eyebrow="RELEASE DETAILS" title={stream ? `Import the ${stream} export` : 'Import a Windchill export'} info="In Windchill, run your search (e.g. a saved search), export the result list to a CSV file, then import it here. The columns are kept as in the file; with Git storage connected the export is also saved to Git for the web app.">
    <div className="connection-form">
      <label>Logic<select value={logic} onChange={(event) => setLogic(event.target.value as WindchillLogic)}><option value="standard">Standard (releases, e.g. S&amp;S IT)</option><option value="ecp">ECP setup (projects)</option></select></label>
      {logic === 'ecp' && <label>Project details at<select value={projectLevel} onChange={(event) => setProjectLevel(Number(event.target.value))}>{projectLevels.map((level) => <option key={level} value={level}>{level}{level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'} folder of the Location</option>)}</select></label>}
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder={logic === 'ecp' ? 'e.g. ECP - Type 1' : 'e.g. GSS_BST released documents (default: the file name)'} /></label>
      <div className="connection-actions"><ExportFileButton label="Choose CSV export…" onFile={(text, file) => { onImported(windchill.importExport(text, file, name, undefined, { logic, ...(logic === 'ecp' ? { projectLevel } : {}) })); setName(stream) }} onError={setError} />{git?.connected && <button type="button" className="ghost" disabled={loading} onClick={loadAll}>Load all exports from Git</button>}{loading && <small className="muted" role="status">Loading from Git… (Background jobs)</small>}</div>
    </div>
    {error && <Notice tone="error">{error}</Notice>}
    {logic === 'ecp' ? <p className="muted">ECP: each project is the Location's {projectLevel}{projectLevel === 2 ? 'nd' : projectLevel === 3 ? 'rd' : 'th'} folder, "Project number Project name" (e.g. Parent folder/123456 Patient Monitor/Phase), with every document under it. Each ECP export is listed on its own under Windchill exports, in Pulse Check and in the Monthly pack — name it after its type, e.g. "ECP - Type 1".</p>
      : stream && <p className="muted">Saved as <strong>{name.trim() || stream}</strong>: keep the name starting with “{stream}” so that the export is the {stream} page, Pulse Check and Monthly pack use it.</p>}
    <p className="muted">CSV or tab-separated text. Excel files: open them and save as CSV first.</p>
  </Panel>
}
