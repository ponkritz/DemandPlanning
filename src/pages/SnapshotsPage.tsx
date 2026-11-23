import { useEffect, useState } from 'react'
import { DataTable } from '../components/DataTable'
import { EmptyState, Notice, Page, Panel, Pill, TablePanel } from '../components/ui'
import { exportEffortCsv, exportStateJson } from '../download'
import type { PageProps } from './types'
import type { GitStorage } from '../useGitStorage'
import type { CloudSnapshotFile } from '../cloudSnapshots'
import type { AppState } from '../domain'
import { validateBackup } from '../browserState'

// SNP-04…09: LTE / PI Review snapshots are saved as files in the Git data repository (lte-snapshots/); SharePoint is in
// the backlog.
export function SnapshotsPage({ store, month, git, who }: PageProps & { git: GitStorage; who: string }) {
  const [backup, setBackup] = useState<AppState | null>(null)
  const [backupName, setBackupName] = useState('')
  const [restoreMessage, setRestoreMessage] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [files, setFiles] = useState<CloudSnapshotFile[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const connected = git.connected && !git.isSample
  const writable = connected && !git.readOnly
  const { listSnapshots } = git
  useEffect(() => {
    let active = true
    if (connected) void listSnapshots().then(items => { if (active) setFiles(items) }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Unable to load snapshot history.') })
    return () => { active = false }
  }, [connected, listSnapshots])
  // A snapshot being written: the page warns before it is closed.
  useEffect(() => {
    if (!busy) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])
  async function refreshHistory() {
    setBusy(true)
    try { setFiles(await listSnapshots()) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load snapshot history.') }
    finally { setBusy(false) }
  }
  async function inspectBackup(file?: File) {
    setBackup(null); setConfirmed(false); setRestoreMessage('')
    if (!file) return
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error('Backup exceeds the 200 MB restore limit.')
      setBackup(validateBackup(JSON.parse(await file.text()))); setBackupName(file.name)
    } catch (error) { setRestoreMessage(error instanceof Error ? error.message : 'Unable to read backup.') }
  }
  function restore() {
    if (!backup || !confirmed) return
    try { store.restoreBackup(backup); setBackup(null); setConfirmed(false); setRestoreMessage('Backup loaded into the app. Wait for the browser save confirmation below before closing.') }
    catch (error) { setRestoreMessage(error instanceof Error ? error.message : 'Unable to restore backup.') }
  }
  async function create(type: 'LTE'|'PI Review'|'Monthly Pack') {
    setBusy(true); setMessage('Saving the snapshot to Git…')
    try {
      const file = await git.saveSnapshot(type, month, who)
      setFiles(current => [file, ...current.filter(item => item.name !== file.name)])
      setMessage(`Saved to Git and read back: ${file.name}. Nothing was kept in the browser.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Saving to Git failed. Nothing was kept in the browser.') }
    finally { setBusy(false) }
  }
  return <Page>
    <Notice><strong>Snapshot destination: Git</strong><p>{connected ? `${git.config?.owner}/${git.config?.repo} → ${git.config?.path.includes('/') ? git.config.path.slice(0, git.config.path.lastIndexOf('/') + 1) : ''}lte-snapshots/ — one commit per snapshot.` : git.isSample ? 'Synthetic sample data is loaded: snapshots are not saved to Git.' : 'Connect Git storage under Admin → Data & sharing → Git storage to save snapshots. Nothing is kept in the browser.'}</p><p>Captures the app dataset currently loaded, including saved Azure work items, plus month, author and build identity. Fetch/save your latest source data first. This does not refresh Azure automatically.</p></Notice>
    {message && <Notice>{message}</Notice>}
    <div className="snapshot-actions"><Panel><Pill tone="info">LTE</Pill><h3>LTE monthly snapshot</h3><p>Preserve planning, capacity and release data for the selected month.</p><button className="primary" disabled={!writable || busy} onClick={() => void create('LTE')}>{busy ? 'Please wait…' : 'Save snapshot to Git'}</button></Panel><Panel><Pill tone="warning">PI review</Pill><h3>Learnings &amp; struggles</h3><p>Preserve lessons, obstacles and discussion inputs.</p><button className="primary" disabled={!writable || busy} onClick={() => void create('PI Review')}>Save PI snapshot to Git</button></Panel><Panel><Pill tone="neutral">Export</Pill><h3>Portable data</h3><p>Optional CSV analysis and downloaded JSON backup. These are separate from the snapshots in Git.</p><div className="button-row"><button className="ghost" onClick={() => exportEffortCsv(store.state, month)}>CSV</button><button className="ghost" onClick={() => exportStateJson(store.state)}>JSON</button></div></Panel></div>
    <Panel className="connection-panel" title="Browser storage & backup recovery" info="IndexedDB stores the app data in this browser. This is not team-shared storage. PATs are excluded from JSON backups." action={<Pill tone={store.cache.status === 'saved' ? 'open' : store.cache.status === 'error' ? 'danger' : 'neutral'}>{store.cache.status}</Pill>}>
      <p role="status">{store.cache.message}</p>
      <div className="button-row"><button className="ghost" onClick={() => exportStateJson(store.state)}>Export current JSON backup</button><button className="ghost" onClick={store.retrySave}>Retry browser save</button></div>
      <label>Choose a Demand Planning JSON backup<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void inspectBackup(file) }} /></label>
      {backup && <Notice tone="warning"><p>{backupName}: {backup.activities.length} activities · {backup.efforts.length} monthly efforts · {backup.azureWorkItems?.length ?? 0} Azure work items.</p><p>Restore replaces the current app dataset. Azure DevOps itself is not modified. Export your current data first.</p><label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I have backed up current data and want to replace it with this backup.</label><div className="button-row"><button className="primary" disabled={!confirmed} onClick={restore}>Restore this backup</button><button className="ghost" onClick={() => setBackup(null)}>Cancel</button></div></Notice>}
      {restoreMessage && <Notice>{restoreMessage}</Notice>}
    </Panel>
    <TablePanel title="Snapshot history in Git" detail={connected ? `${files.length} snapshot file${files.length === 1 ? '' : 's'}` : 'Connect Git storage to load the snapshot history.'} action={<button className="ghost" disabled={!connected || busy} onClick={() => void refreshHistory()}>Refresh history</button>} empty={files.length ? undefined : connected ? 'No snapshot files in Git yet.' : 'Connect Git storage to load the snapshot history.'}>
      <DataTable id="snapshots:git" rows={files} rowKey={(file) => file.name} exportName="Snapshot history" defaultSort={{ id: 'month', desc: true }} columns={[
        { id: 'file', label: 'Snapshot file', value: (file) => file.name, render: (file) => <a href={file.webUrl} target="_blank" rel="noreferrer">{file.name}</a> },
        { id: 'month', label: 'Month', firstSortDesc: true, value: (file) => file.month },
        { id: 'type', label: 'Type', value: (file) => file.type },
        { id: 'storage', label: 'Storage', value: () => 'Git' },
      ]} />
    </TablePanel>
    {store.state.snapshots.length > 0 && <Panel title="Legacy snapshot records" info="These older records were never saved as snapshot files. They are retained in app data; nothing was converted or deleted automatically.">{store.state.snapshots.map(item => <p key={item.id}>{item.title} · {item.createdAt} · Legacy / unverified</p>)}</Panel>}
    {!store.state.snapshots.length && !files.length && !connected && <EmptyState title="No snapshots yet." detail="Connect Git storage to save LTE or PI Review snapshots." />}
    <Notice>Snapshots are JSON evidence files, not rendered slides. Native PPT, PDF and PNG report rendering remains planned. The Git repository's access and history apply; snapshots are not immutable validated records.</Notice>
  </Page>
}
