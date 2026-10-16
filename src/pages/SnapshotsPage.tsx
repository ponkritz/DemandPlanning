import { Heading, Panel, Pill } from '../components/ui'
import { exportEffortCsv, exportStateJson } from '../download'
import type { PageProps } from './types'
import { useState } from 'react'
import type { AppState } from '../domain'
import { validateBackup } from '../browserState'

export function SnapshotsPage({ store, month }: PageProps) {
  const [backup, setBackup] = useState<AppState | null>(null)
  const [backupName, setBackupName] = useState('')
  const [restoreMessage, setRestoreMessage] = useState('')
  const [confirmed, setConfirmed] = useState(false)
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
  function create(type: 'LTE'|'PI Review'|'Monthly Pack') { const efforts = store.state.efforts.filter(x => x.month === month); const payload = JSON.stringify({ planned:efforts.reduce((s,x)=>s+(x.plannedHours??0),0), actual:efforts.reduce((s,x)=>s+(x.actualHours??0),0), adHoc:efforts.filter(x=>x.classification==='Ad-hoc').length, learnings:efforts.map(x=>x.learnings).filter(Boolean), struggles:efforts.map(x=>x.struggles).filter(Boolean) }); store.update((draft) => { draft.snapshots.unshift({ id:crypto.randomUUID(), title:`${type} — ${month}`, type, month, createdAt:new Date().toISOString(), createdBy:'u-owner', payload }); return draft }) }
  return <section className="content"><Heading eyebrow="EXECUTIVE COMMUNICATION" title="Snapshots and exports" detail="Freeze the current view and prepare reusable evidence for LTE and PI Review." /><div className="snapshot-actions"><Panel><Pill tone="info">2 slides</Pill><h3>LTE monthly snapshot</h3><p>Plan vs actual, capacity, ad-hoc demand and release closure.</p><button className="primary" onClick={() => create('LTE')}>Create snapshot</button></Panel><Panel><Pill tone="warning">PI review</Pill><h3>Learnings & struggles</h3><p>Aggregates monthly lessons, obstacles and discussion topics.</p><button className="primary" onClick={() => create('PI Review')}>Create snapshot</button></Panel><Panel><Pill tone="neutral">Export</Pill><h3>Portable data</h3><p>CSV for analysis and JSON for a complete local development backup.</p><div className="button-row"><button className="ghost" onClick={() => exportEffortCsv(store.state, month)}>CSV</button><button className="ghost" onClick={() => exportStateJson(store.state)}>JSON</button></div></Panel></div>
    <Panel className="connection-panel"><div className="panel-heading"><div><h2>Browser storage &amp; backup recovery</h2><p className="muted">IndexedDB stores the app data in this browser. This is not team-shared storage. PATs are excluded from JSON backups.</p></div><Pill tone={store.cache.status === 'saved' ? 'open' : store.cache.status === 'error' ? 'danger' : 'neutral'}>{store.cache.status}</Pill></div><p role="status">{store.cache.message}</p><div className="button-row"><button className="ghost" onClick={() => exportStateJson(store.state)}>Export current JSON backup</button><button className="ghost" onClick={store.retrySave}>Retry browser save</button></div><label>Choose a Demand Planning JSON backup<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void inspectBackup(file) }} /></label>
      {backup && <div className="notice"><p>{backupName}: {backup.activities.length} activities · {backup.efforts.length} monthly efforts · {backup.azureWorkItems?.length ?? 0} Azure work items.</p><p>Restore replaces the current app dataset. Azure DevOps itself is not modified. Export your current data first. Disconnect SharePoint before restoring locally.</p><label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I have backed up current data and want to replace it with this backup.</label><div className="button-row"><button className="primary" disabled={!confirmed || store.connection.mode !== 'local'} onClick={restore}>Restore this backup</button><button className="ghost" onClick={() => setBackup(null)}>Cancel</button></div></div>}
      {restoreMessage && <p role="status">{restoreMessage}</p>}
    </Panel>
    <Panel className="table-panel"><div className="panel-heading"><h2>Snapshot history</h2><span className="record-count">{store.state.snapshots.length} frozen views</span></div><table><thead><tr><th>Snapshot</th><th>Type</th><th>Month</th><th>Created</th><th>Owner</th></tr></thead><tbody>{store.state.snapshots.map(x => <tr key={x.id}><td><strong>{x.title}</strong></td><td>{x.type}</td><td>{x.month}</td><td>{new Date(x.createdAt).toLocaleString()}</td><td>{store.state.people.find(p => p.id === x.createdBy)?.name ?? x.createdBy}</td></tr>)}</tbody></table></Panel><div className="notice"><strong>Planned next:</strong> native PPT, PDF and PNG rendering after the reporting layout is approved. Current snapshots preserve the exact input state.</div></section>
}
