import { useState } from 'react'
import { listAzureConnectionProfiles } from '../azureCredentials'
import { markViewsSynced, parseViews, restoreViews, serializeViews, viewsBackupFolder, viewsBackupName, viewsFile } from '../viewDefinitions'
import { downloadJson } from '../download'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { GitStorage } from '../useGitStorage'
import { Notice, Panel } from './ui'

// Settings: keep the Azure DevOps connections (view names, queries, URLs, roles) in the Git data repository and
// restore them on another computer. PATs are never written to Git.
export function AzureViewsGitPanel({ git, azure }: { git: GitStorage; azure: AzureWorkspace }) {
  const [busy, setBusy] = useState('')
  const [pat, setPat] = useState('')
  const [commit, setCommit] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info' | 'warning'; text: string } | null>(null)
  const count = azure.connectionProfiles.length

  async function save() {
    setBusy('save'); setNotice(null)
    try {
      const text = serializeViews(viewsFile(listAzureConnectionProfiles()))
      const result = await git.writeViews(text, commit || `Azure DevOps views: ${count} connection${count === 1 ? '' : 's'}`)
      markViewsSynced(listAzureConnectionProfiles())
      setCommit('')
      setNotice(result.changed ? { tone: 'success', text: `${count} connection${count === 1 ? '' : 's'} saved to ${git.viewsPath} (no PATs).` } : { tone: 'info', text: `${git.viewsPath} is already up to date.` })
    } catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not save the views to Git.' }) }
    finally { setBusy('') }
  }

  async function restore() {
    setBusy('restore'); setNotice(null)
    try {
      const file = await git.readViews()
      if (file.text == null) { setNotice({ tone: 'warning', text: `${git.viewsPath} does not exist in Git yet. Save the views first.` }); return }
      const views = parseViews(file.text)
      if (!window.confirm(`Restore ${views.length} connection${views.length === 1 ? '' : 's'} from Git? Connections with the same ID are overwritten (their PAT is kept); others here are not touched.`)) return
      const result = restoreViews(views, pat)
      markViewsSynced(views.filter((view) => !result.skipped.includes(view.viewName || view.reason)))
      azure.reloadConnectionProfiles(); setPat('')
      const parts = [result.added.length && `${result.added.length} added`, result.updated.length && `${result.updated.length} updated`].filter(Boolean).join(', ')
      setNotice({ tone: result.skipped.length || result.noPat.length ? 'warning' : 'success', text: `${parts || 'Nothing restored'}.${result.noPat.length ? ` No PAT here for: ${result.noPat.join(', ')} — they show the data saved to Git; enter a PAT and restore again to fetch them here.` : ''}${result.skipped.length ? ` Not restored: ${result.skipped.join(', ')}.` : ''}` })
    } catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not restore the views from Git.' }) }
    finally { setBusy('') }
  }

  async function loadData() {
    setBusy('data'); setNotice(null)
    try {
      const result = await git.pullSnapshots()
      azure.reloadConnectionProfiles()
      setNotice({ tone: result.failed.length ? 'warning' : result.files ? 'success' : 'info', text: result.files ? `${result.files} on-prem view${result.files === 1 ? '' : 's'} in Git; ${result.applied.length ? `newer data loaded for ${result.applied.join(', ')}` : 'the data here is already up to date'}.${result.added ? ` ${result.added} view${result.added === 1 ? '' : 's'} added (no PAT: view only).` : ''}${result.failed.length ? ` Could not read: ${result.failed.join(', ')}.` : ''}` : 'No on-prem view data in Git yet. Fetch the on-prem views in the desktop app (with Git storage connected there) to save them.' })
    } catch (failure) { setNotice({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not load the view data from Git.' }) }
    finally { setBusy('') }
  }

  // Back up and clean up (CON-88): a backup (download + dated copy in Git), then every connection removed here and from
  // the shared setup in Git; every other computer removes its connections at its next start. PATs stay per server.
  const backupText = () => serializeViews(viewsFile(listAzureConnectionProfiles()))
  function downloadBackup() {
    const name = viewsBackupName(new Date())
    downloadJson(backupText(), name)
    setNotice({ tone: 'success', text: `Backup of ${count} connection${count === 1 ? '' : 's'} downloaded as ${name} (no PATs).` })
  }
  async function cleanUp() {
    const list = listAzureConnectionProfiles()
    if (!window.confirm(`Back up and remove all ${list.length} connection${list.length === 1 ? '' : 's'}?\n\n1. A backup is downloaded and saved to Git (${viewsBackupFolder}/).\n2. Every connection and its saved data is removed here and from the shared setup in Git (azure-views.json and azure-data/). Every other computer removes its connections at its next start.\n3. PATs stay, per server.\n\nThen add the correct connections in Settings → Azure DevOps (Stream mapping, Other views).`)) return
    setBusy('clean'); setNotice(null)
    const at = new Date(), name = viewsBackupName(at), text = backupText()
    let backup = ''
    try {
      downloadJson(text, name)
      backup = (await git.backupViews(text, name, `Backup before clean-up: ${list.length} connection${list.length === 1 ? '' : 's'}`)).path
      const result = await git.resetViews(at.toISOString(), `Clean up the connections (backup: ${backup})`)
      const removed = azure.removeAllConnectionsHere(at.toISOString())
      setNotice({ tone: 'success', text: `Backed up to ${backup} and downloaded. Removed ${removed.length} connection${removed.length === 1 ? '' : 's'} here, emptied the shared setup in Git and removed ${result.dataFiles} on-prem data file${result.dataFiles === 1 ? '' : 's'}. Every other computer removes its connections at its next start. Add the correct connections now in Settings → Azure DevOps; each stream you set up is saved to Git, and “Save connections to Git” here saves the others.` })
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure)
      setNotice({ tone: 'error', text: backup ? `The clean-up stopped: ${reason}. The backup is in Git (${backup}) and downloaded; the connections here were not removed. Try again.` : `Nothing was removed: the backup could not be saved to Git (${reason}). The downloaded file has the connections.` })
    } finally { setBusy('') }
  }

  return <><Panel className="connection-panel admin-section" eyebrow="AZURE DEVOPS" title="Views in Git" info="On-prem views: each fetch in the desktop app is saved to the Git data repository, and the web app shows it — the web cannot reach on-prem servers. Also keep the Azure DevOps connections — view names, queries, project URLs, on-prem servers and roles — in the Git data repository, next to the planning data, and restore them on another computer. PATs are never written to Git: a restored connection keeps the PAT it has here, or uses the PAT entered below, or one saved here for the same organisation or server.">
    {!git.connected ? <Notice tone="warning">Connect Git storage above to save the views.</Notice> : <>
      <div className="connection-form">
        <label className="wide-field">Change description<input value={commit} onChange={(event) => setCommit(event.target.value)} placeholder="e.g. Add DP, CP and IOCC queries" /></label>
        <label className="wide-field">PAT for restored connections (optional)<input type="password" autoComplete="off" value={pat} onChange={(event) => setPat(event.target.value)} placeholder="Only needed for connections with no PAT in this browser" /></label>
        <div className="connection-actions"><button type="button" className="primary" disabled={Boolean(busy) || !count} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : `Save ${count} connection${count === 1 ? '' : 's'} to Git`}</button><button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void restore()}>{busy === 'restore' ? 'Restoring…' : 'Restore from Git'}</button><button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void loadData()}>{busy === 'data' ? 'Loading…' : 'Load on-prem data from Git'}</button></div>
      </div>
      <p className="muted">File: {git.viewsPath} · <a href={git.viewsHistory} target="_blank" rel="noreferrer">history in GitHub</a> · On-prem view data: azure-data/ · <a href={git.snapshotsHistory} target="_blank" rel="noreferrer">history</a>. {window.azureDevOps ? 'This desktop app saves each on-prem fetch there (only when the data changed).' : 'This web app loads it at start; the desktop app saves it at each on-prem fetch.'}</p>
    </>}
    {git.viewsSync && !notice && <Notice tone="info">{git.viewsSync} The connection setup in Git is the default for everyone; a connection you change here stays as you set it (Restore from Git brings it back to Git's version).</Notice>}
    {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
  </Panel>
  <Panel className="connection-panel admin-section" eyebrow="AZURE DEVOPS" title="Back up and clean up" info={<ul><li>Download a backup of every connection (names, servers, projects, queries, roles; never a PAT).</li><li>Back up and remove all: the backup is also saved to Git ({viewsBackupFolder}/), then every connection and its data is removed here and from the shared setup in Git, and every other computer removes its connections at its next start. PATs stay per server. Then add the correct connections again.</li></ul>}>
    <div className="button-row"><button type="button" className="ghost" disabled={Boolean(busy) || !count} onClick={downloadBackup}>Download backup</button><button type="button" className="danger-button" style={{ marginTop: 0 }} disabled={Boolean(busy) || !count || !git.connected || git.readOnly} title={!git.connected ? 'Connect Git storage first' : git.readOnly ? 'Your Git token is read-only' : undefined} onClick={() => void cleanUp()}>{busy === 'clean' ? 'Cleaning up…' : `Back up and remove all ${count} connection${count === 1 ? '' : 's'}…`}</button></div>
  </Panel></>
}
