import { useCallback, useEffect, useState } from 'react'
import { DataTable, type DataColumn } from '../components/DataTable'
import { EmptyState, Notice, Page, Panel } from '../components/ui'
import type { GitStorage } from '../useGitStorage'
import { readXlsx } from '../xlsx'
import { formatDateTime } from '../format'
import { checkTrackerUrl, parseTracker, serializeTracker, sheetTable, trackerFromWorkbook, type KpiTracker } from '../kpiTracker'

// KPI tracker (KPT-01…KPT-05): the team's KPI tracker workbook from SharePoint, read only. The page shows the copy kept
// in Git (kpi-tracker.json); in the desktop app it reads the file live from SharePoint, and a read by a role with
// Manage shared settings (and a Git token that can write) replaces the Git copy. Nothing is ever written to SharePoint.
type Source = { tracker: KpiTracker; from: 'git' | 'live'; saved?: boolean }

export function KpiTrackerPage({ git, canManage, who }: { git: GitStorage; canManage: boolean; who: string }) {
  const [shown, setShown] = useState<Source | null>(null)
  const [gitState, setGitState] = useState<{ loaded: boolean; error: string }>({ loaded: false, error: '' })
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'warning' | 'error'; text: string; signIn?: boolean } | null>(null)
  const [sheetIndex, setSheetIndex] = useState(0)
  const desktop = Boolean(window.sharePointFile)
  const { readKpiTracker, connected } = git

  const loadGit = useCallback(async () => {
    if (!connected) { setGitState({ loaded: true, error: '' }); return }
    try {
      const read = await readKpiTracker()
      const tracker = read.text == null ? null : parseTracker(read.text)
      if (tracker) { setShown((current) => current?.from === 'live' ? current : { tracker, from: 'git' }); setLink((current) => current || tracker.fileUrl) }
      setGitState({ loaded: true, error: '' })
    } catch (failure) { setGitState({ loaded: true, error: failure instanceof Error ? failure.message : String(failure) }) }
  }, [connected, readKpiTracker])
  useEffect(() => { if (git.status !== 'loading') void Promise.resolve().then(loadGit) }, [git.status, loadGit])

  const canSave = canManage && connected && !git.readOnly && !git.isSample
  async function read(action: 'read' | 'signIn') {
    if (!window.sharePointFile) return
    let fileUrl = ''
    try { fileUrl = checkTrackerUrl(link) } catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }); return }
    setBusy(true); setNotice({ tone: 'info', text: action === 'signIn' ? 'Complete the sign-in in the window that opened…' : 'Reading the file from SharePoint…' })
    try {
      const result = await window.sharePointFile[action]({ fileUrl })
      if (!result.ok || !result.bytes) { setNotice({ tone: 'error', text: result.message, signIn: result.signIn }); return }
      const tracker = trackerFromWorkbook(await readXlsx(result.bytes), { fileUrl, fileName: result.name ?? 'KPI tracker.xlsx', readAt: new Date().toISOString(), readBy: who, modified: result.modified })
      if (!tracker.sheets.length) { setNotice({ tone: 'warning', text: `${tracker.fileName} has no sheet with data.` }); return }
      let saved = false, note = ''
      if (canSave) {
        try { await git.writeKpiTracker(serializeTracker(tracker), `KPI tracker read from SharePoint (${tracker.fileName})`); saved = true }
        catch (failure) { note = ` Not saved to Git: ${failure instanceof Error ? failure.message : String(failure)}` }
      }
      setShown({ tracker, from: 'live', saved }); setSheetIndex(0)
      setNotice({ tone: note ? 'warning' : 'success', text: `${result.message}${saved ? ' Saved to Git: everyone sees this copy.' : canSave ? '' : ' Shown here only (saving to Git needs Manage shared settings and a Git token that can write).'}${note}${tracker.truncated ? ' The workbook is larger than the limits (20 sheets, 2,000 rows, 100 columns): the rest is not shown.' : ''}` })
    } catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
    finally { setBusy(false) }
  }
  async function signOut() {
    if (!window.sharePointFile) return
    try { await window.sharePointFile.signOut(); setNotice({ tone: 'info', text: 'Signed out of SharePoint in the desktop app.' }) }
    catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }) }
  }

  const tracker = shown?.tracker
  const sheet = tracker?.sheets[Math.min(sheetIndex, (tracker?.sheets.length ?? 1) - 1)]
  const table = sheet ? sheetTable(sheet) : null
  const columns: DataColumn<{ id: string; cells: string[] }>[] = (table?.headers ?? []).map((header, at) => ({ id: `c${at}`, label: header, value: (row) => row.cells[at] }))
  const rows = (table?.rows ?? []).map((cells, at) => ({ id: String(at), cells }))
  const sourceLine = !tracker ? '' : shown?.from === 'live'
    ? `Read live from SharePoint at ${formatDateTime(tracker.readAt)}${shown.saved ? ' and saved to Git' : ' (not saved to Git)'}.`
    : `Showing the copy saved in Git: read from SharePoint at ${formatDateTime(tracker.readAt)}${tracker.readBy ? ` by ${tracker.readBy}` : ''}.`

  return <Page className="kpi-tracker" intro="The team's KPI tracker from SharePoint, read only. The copy saved in Git is shown when SharePoint cannot be reached.">
    <Panel eyebrow="SOURCE" title="KPI tracker in SharePoint" info="Read only: the desktop app downloads the Excel file from SharePoint (a GET request) with your company sign-in; nothing is written to SharePoint. Each read by a role with Manage shared settings replaces the copy in Git, which everyone sees — also in the browser and when SharePoint is not reachable.">
      {tracker && <p className="muted" role="status">{sourceLine}{tracker.modified ? ` File last changed in SharePoint: ${tracker.modified}.` : ''} {git.kpiTrackerHistory && <a href={git.kpiTrackerHistory} target="_blank" rel="noreferrer">History in GitHub</a>}</p>}
      {desktop ? <div className="form-row">
        <label>SharePoint link to the Excel file<input aria-label="SharePoint link to the KPI tracker" value={link} placeholder="https://<company>.sharepoint.com/sites/<site>/Shared Documents/KPI tracker.xlsx" onChange={(event) => setLink(event.target.value)} disabled={busy} /></label>
        <div className="button-row">
          <button type="button" className="primary" disabled={busy || !link.trim()} onClick={() => void read('read')}>{canSave ? 'Read from SharePoint and save to Git' : 'Read live from SharePoint'}</button>
          <button type="button" className={notice?.signIn ? 'primary' : 'ghost'} disabled={busy || !link.trim()} onClick={() => void read('signIn')}>Sign in to SharePoint</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => void signOut()}>Sign out</button>
        </div>
      </div> : <Notice tone="info">Reading the file live from SharePoint needs the desktop app (it signs in with your company account). Here the page shows the copy saved in Git.</Notice>}
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {!connected && <Notice tone="warning">Connect Git storage (Admin → Data & sharing) to see the copy saved in Git{desktop ? ' and to save the reads' : ''}.</Notice>}
      {gitState.error && <Notice tone="error">{gitState.error}</Notice>}
    </Panel>
    {!tracker ? (gitState.loaded && <EmptyState title="No KPI tracker yet." detail={desktop && canManage ? 'Paste the SharePoint link of the Excel file and read it: it is then saved to Git for everyone.' : 'An admin reads it from SharePoint in the desktop app; it then shows here for everyone.'} />)
      : <Panel eyebrow="KPI TRACKER" title={tracker.fileName || 'KPI tracker'} action={tracker.sheets.length > 1 ? <label className="dash-select">Sheet<select aria-label="Sheet" value={Math.min(sheetIndex, tracker.sheets.length - 1)} onChange={(event) => setSheetIndex(Number(event.target.value))}>{tracker.sheets.map((entry, at) => <option key={entry.name + at} value={at}>{entry.name}</option>)}</select></label> : undefined}>
        {rows.length ? <DataTable id={`kpi-tracker:${sheet?.name ?? ''}`} columns={columns} rows={rows} rowKey={(row) => row.id} exportName={`KPI tracker ${sheet?.name ?? ''}`.trim()} status={`${rows.length} rows · sheet ${sheet?.name}`} limit={500} />
          : <EmptyState title="This sheet has no rows under its header." detail="Choose another sheet." />}
      </Panel>}
  </Page>
}
