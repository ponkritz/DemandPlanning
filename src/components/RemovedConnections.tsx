import { useState } from 'react'
import { listAzureConnectionProfiles } from '../azureCredentials'
import { markViewsSynced, restoreViews, type RemovedView } from '../viewDefinitions'
import { formatDateTime } from '../format'
import type { GitStorage } from '../useGitStorage'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { Notice, Panel } from './ui'

// CON-99 Settings → Streams → Removed connections: finds connections that were in an older version of the shared
// connection setup in Git but are neither in it now nor here (e.g. dropped when another computer overwrote the file)
// and puts one back — here, and in Git for everyone when the person may change the stream mapping. Reads the file's
// history only; a PAT is never read from or written to Git (the server's PAT here is used).
export function RemovedConnections({ git, azure, canShare }: { git: GitStorage; azure: AzureWorkspace; canShare: boolean }) {
  const [rows, setRows] = useState<RemovedView[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ tone: 'success' | 'error' | 'warning' | 'info'; text: string } | null>(null)
  const share = canShare && git.connected && !git.readOnly && !azure.isSample

  async function look() {
    setBusy(true); setResult(null)
    try { setRows(await git.removedViews(listAzureConnectionProfiles())) }
    catch (failure) { setResult({ tone: 'error', text: `Could not read the history in Git: ${failure instanceof Error ? failure.message : String(failure)}` }) }
    finally { setBusy(false) }
  }
  async function restore(row: RemovedView) {
    const name = row.view.viewName || row.view.reason
    setBusy(true); setResult(null)
    try {
      // CON-112: a view the Tool Owner removed for everyone: its removal marker goes first, so the view comes back for
      // everyone at their next start; restored here only, it stays here (the marker counts as applied here).
      if (row.removal && share) await git.clearViewRemoval(row.view.id, name)
      else if (row.removal) git.keepRemovedHere(row.removal)
      const restored = restoreViews([row.view], '')
      azure.reloadConnectionProfiles()
      let text = `“${name}” is back here`
      if (share) {
        const list = listAzureConnectionProfiles()
        await git.shareViews(list, `Restore connection: ${name}`)
        markViewsSynced(list)
        text += ' and in the shared setup in Git for everyone'
      } else text += canShare ? ' only (connect Git storage with a token that can save to share it again)' : ' only (someone who may change the stream mapping can share it again)'
      text += restored.noPat.length ? '. Its server has no PAT here yet: add it in Servers and PATs, then Fetch.' : '; fetching it now.'
      if (!restored.noPat.length) void azure.fetchConnection(row.view.id)
      setRows((now) => (now ?? []).filter((entry) => entry.view.id !== row.view.id))
      setResult({ tone: restored.noPat.length ? 'warning' : 'success', text })
    } catch (failure) { setResult({ tone: 'error', text: `“${name}” could not be restored: ${failure instanceof Error ? failure.message : String(failure)}` }) }
    finally { setBusy(false) }
  }

  return <Panel className="connection-panel removed-connections" eyebrow="GIT HISTORY" title="Removed connections" info="Connections that were in an older version of the shared connection setup in Git but are no longer there nor here — for example one dropped when another computer saved its own list — and the views the Tool Owner removed or deleted for everyone (listed first, with who and when). Restore puts it back (with its query and settings, never a PAT); for a view removed for everyone it also takes the removal away, so it comes back for everyone at their next start. Nothing is changed until you press Restore.">
    {!git.connected ? <p className="muted">Connect Git storage (Admin → Data &amp; sharing) to look in its history.</p> : <>
      <div className="button-row"><button type="button" className="ghost" disabled={busy} onClick={() => void look()}>{busy && !rows ? 'Looking…' : rows ? 'Look again' : 'Look in Git history'}</button></div>
      {rows && (rows.length ? <div className="azure-table"><table>
        <thead><tr><th scope="col">Connection</th><th scope="col">Query</th><th scope="col">Last in Git</th><th scope="col" /></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.view.id}>
          <td><strong>{row.view.viewName || row.view.reason}</strong><br /><small className="muted">{row.view.reason}</small></td>
          <td><small className="muted">{row.view.query ? row.view.query.replace(/\s+/g, ' ').slice(0, 160) + (row.view.query.length > 160 ? '…' : '') : 'Team backlog'}</small></td>
          <td><small>{row.date ? formatDateTime(row.date) : '—'}</small><br /><small className="muted">{row.message}</small></td>
          <td><button type="button" className="primary" disabled={busy} onClick={() => void restore(row)}>Restore</button></td>
        </tr>)}</tbody>
      </table></div> : <p className="muted">Nothing found: every connection in the last 30 versions of the shared setup is still there or here.</p>)}
    </>}
    {result && <Notice tone={result.tone}>{result.text}</Notice>}
  </Panel>
}
