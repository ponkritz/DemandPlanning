import { useEffect, useState } from 'react'
import { EmptyState, Notice, Page, Panel, Pill, TablePanel } from '../components/ui'
import { exportEffortCsv, exportStateJson } from '../download'
import { formatDateTime } from '../format'
import type { PageProps } from './types'
import type { CloudSnapshotFile } from '../cloudSnapshots'
import type { AppState } from '../domain'
import { validateBackup } from '../browserState'

export function SnapshotsPage({ store, month }: PageProps) {
  const [backup, setBackup] = useState<AppState | null>(null)
  const [backupName, setBackupName] = useState('')
  const [restoreMessage, setRestoreMessage] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [files, setFiles] = useState<CloudSnapshotFile[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const connected = store.connection.mode === 'sharepoint' || store.connection.mode === 'empty'
  useEffect(() => {
    let active = true
    setFiles([])
    if (connected) void store.listSnapshots().then(items => { if (active) setFiles(items) }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Unable to load snapshot history.') })
    return () => { active = false }
    // Reload only when the authenticated destination changes, not on local data edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, store.connection.siteId, store.connection.account])
  async function refreshHistory() {
    setBusy(true)
    try { setFiles(await store.listSnapshots()) }
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
    setBusy(true); setMessage('Uploading snapshot to SharePoint…')
    try {
      const file = await store.saveSnapshot(type, month)
      setFiles(current => [file, ...current.filter(item => item.id !== file.id)])
      setMessage(`Saved and read-back verified in SharePoint: ${file.name}. No browser snapshot was created.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'SharePoint save failed. No browser snapshot was created.') }
    finally { setBusy(false) }
  }
  return <Page>
    <Notice><strong>Snapshot destination: SharePoint</strong><p>{connected ? `Default document library → ${store.getSavedSharePointConfig().stateFilePath.split('/').slice(0, -1).concat('Snapshots').join('/')}` : 'Connect under Settings → SharePoint connection to enable snapshots. No browser-only fallback.'}</p><p>Captures the app dataset currently loaded, including saved Azure work items, plus month, author and build identity. Fetch/save your latest source data first. This does not refresh Azure automatically.</p></Notice>
    {message && <Notice>{message}</Notice>}
    <div className="snapshot-actions"><Panel><Pill tone="info">LTE</Pill><h3>LTE monthly snapshot</h3><p>Preserve planning, capacity and release data for the selected month.</p><button className="primary" disabled={!connected || busy} onClick={() => void create('LTE')}>{busy ? 'Please wait…' : 'Save snapshot to SharePoint'}</button></Panel><Panel><Pill tone="warning">PI review</Pill><h3>Learnings &amp; struggles</h3><p>Preserve lessons, obstacles and discussion inputs.</p><button className="primary" disabled={!connected || busy} onClick={() => void create('PI Review')}>Save PI snapshot to SharePoint</button></Panel><Panel><Pill tone="neutral">Export</Pill><h3>Portable data</h3><p>Optional CSV analysis and downloaded JSON backup. These are separate from SharePoint snapshots.</p><div className="button-row"><button className="ghost" onClick={() => exportEffortCsv(store.state, month)}>CSV</button><button className="ghost" onClick={() => exportStateJson(store.state)}>JSON</button></div></Panel></div>
    <Panel className="connection-panel" title="Browser storage & backup recovery" detail="IndexedDB stores the app data in this browser. This is not team-shared storage. PATs are excluded from JSON backups." action={<Pill tone={store.cache.status === 'saved' ? 'open' : store.cache.status === 'error' ? 'danger' : 'neutral'}>{store.cache.status}</Pill>}>
      <p role="status">{store.cache.message}</p>
      <div className="button-row"><button className="ghost" onClick={() => exportStateJson(store.state)}>Export current JSON backup</button><button className="ghost" onClick={store.retrySave}>Retry browser save</button></div>
      <label>Choose a Demand Planning JSON backup<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void inspectBackup(file) }} /></label>
      {backup && <Notice tone="warning"><p>{backupName}: {backup.activities.length} activities · {backup.efforts.length} monthly efforts · {backup.azureWorkItems?.length ?? 0} Azure work items.</p><p>Restore replaces the current app dataset. Azure DevOps itself is not modified. Export your current data first. Disconnect SharePoint before restoring locally.</p><label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I have backed up current data and want to replace it with this backup.</label><div className="button-row"><button className="primary" disabled={!confirmed || store.connection.mode !== 'local'} onClick={restore}>Restore this backup</button><button className="ghost" onClick={() => setBackup(null)}>Cancel</button></div></Notice>}
      {restoreMessage && <Notice>{restoreMessage}</Notice>}
    </Panel>
    <TablePanel title="SharePoint snapshot history" detail={connected ? `${files.length} shared snapshot files` : 'Sign in to SharePoint to load shared history.'} action={<button className="ghost" disabled={!connected || busy} onClick={() => void refreshHistory()}>Refresh history</button>} empty={files.length ? undefined : connected ? 'No snapshot files in the shared folder yet.' : 'Connect to SharePoint to load shared history.'}>
      <table><thead><tr><th>Snapshot file</th><th>Created</th><th>Storage</th></tr></thead><tbody>{files.map(file => <tr key={file.id}><td>{file.webUrl?.startsWith('https://') ? <a href={file.webUrl} target="_blank" rel="noreferrer">{file.name}</a> : file.name}</td><td>{formatDateTime(file.createdDateTime, 'Confirmed this session')}</td><td>SharePoint</td></tr>)}</tbody></table>
    </TablePanel>
    {store.state.snapshots.length > 0 && <Panel title="Legacy snapshot records" detail="These older records have not been verified as SharePoint files. They are retained in app data; nothing was converted or deleted automatically.">{store.state.snapshots.map(item => <p key={item.id}>{item.title} · {item.createdAt} · Legacy / unverified</p>)}</Panel>}
    {!store.state.snapshots.length && !files.length && !connected && <EmptyState title="No snapshots yet." detail="Connect to SharePoint to save LTE or PI Review snapshots." />}
    <Notice>Snapshots are JSON evidence files, not rendered slides. Native PPT, PDF and PNG report rendering remains planned. SharePoint access and retention policies apply; snapshots are not immutable validated records.</Notice>
  </Page>
}
