import { useEffect, useState } from 'react'
import { viewNameOf, type AzureConnectionProfileSummary } from '../azureCredentials'
import type { RemovalMode } from '../viewDefinitions'
import type { GitStorage } from '../useGitStorage'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { Modal, Notice } from './ui'
import { isOtherView, otherViewsPath } from '../otherViews'

// CON-109, CON-110 (Admin → Data & sharing → Other views, ⋯ of a shared view): the Tool Owner removes — or deletes, with
// its data files in Git — a shared view for everyone. Who it affects: everyone who uses the shared setup in this
// repository; the app cannot know how many people that is (anyone with Git storage connected to it), so it says so.
// The view's definition is backed up in Git first (never a PAT), so Removed connections can restore it (CON-112).

export function RemoveViewForEveryone({ view, mode, git, azure, onClose, onDone }: { view: AzureConnectionProfileSummary; mode: RemovalMode; git: GitStorage; azure: AzureWorkspace; onClose: () => void; onDone: (result: { tone: 'success' | 'warning'; text: string }) => void }) {
  const name = viewNameOf(view)
  const [files, setFiles] = useState<string[] | null>(mode === 'delete' ? null : [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (mode !== 'delete') return
    let live = true
    git.viewDataFiles(view.id).then((found) => { if (live) setFiles(found) }).catch((failure) => { if (live) { setFiles([]); setError(`The data files in Git could not be listed: ${failure instanceof Error ? failure.message : String(failure)}`) } })
    return () => { live = false }
  }, [git, mode, view.id])
  const repository = git.config ? `${git.config.owner}/${git.config.repo}` : 'the data repository'
  const verb = mode === 'delete' ? 'Delete' : 'Remove'

  async function run() {
    setBusy(true); setError('')
    try {
      const result = await git.removeViewForEveryone(view, mode, azure.creatorEmail)
      azure.removeConnection(view.id)
      // CON-124: one of the Tool Owner's own Other views also leaves their file in Git.
      if (isOtherView(view) && otherViewsPath(azure.creatorEmail)) await git.saveOwnOtherViews(azure.creatorEmail, [view.id], `Remove Other view for everyone: ${name}`).catch(() => undefined)
      onDone({ tone: 'success', text: `“${name}” ${mode === 'delete' ? 'deleted' : 'removed'} for everyone: it is no longer in the shared setup in Git, and every browser and desktop app removes it at its next start. Backup: ${result.backup}.${mode === 'delete' ? ` ${result.deleted.length ? `Deleted in Git: ${result.deleted.join(', ')}.` : 'It had no data files in Git.'}` : ''} Restore it in Admin → Streams → Removed connections.` })
    } catch (failure) {
      setError(`Not ${mode === 'delete' ? 'deleted' : 'removed'} for everyone: ${failure instanceof Error ? failure.message : String(failure)} Nothing was removed here; try again.`)
      setBusy(false)
    }
  }

  return <Modal title={`${verb} “${name}” for everyone?`} eyebrow="SETTINGS · SHARED SETUP" onClose={() => { if (!busy) onClose() }}>
    <form className="remove-for-everyone" onSubmit={(event) => { event.preventDefault(); void run() }}>
      <p>This affects <strong>everyone who uses the shared setup in Git ({repository})</strong> — the app cannot tell how many people that is. At their next start every browser and desktop app removes “{name}” with its saved data, also where someone changed it.</p>
      <ul>
        <li>The shared setup in Git (azure-views.json) no longer lists it, and it is marked removed (azure-views-removed.json).</li>
        <li>A backup of its definition — never a PAT — is saved to Git (azure-views-backups/). <strong>Admin → Streams → Removed connections</strong> can restore it for everyone.</li>
        <li>Each person's own views (My views) and their PATs are not touched.</li>
      </ul>
      {mode === 'delete' && (files === null ? <p className="muted" role="status">Looking for its data files in Git…</p>
        : files.length ? <><p>These files are <strong>deleted in Git</strong> (their history stays in GitHub):</p><ul className="remove-for-everyone-files">{files.map((path) => <li key={path}><code>{path}</code></li>)}</ul></>
        : <p>It has no data files in Git, so no file is deleted.</p>)}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="danger-button" disabled={busy || files === null}>{busy ? `${mode === 'delete' ? 'Deleting' : 'Removing'}…` : `${verb} for everyone`}</button></div>
    </form>
  </Modal>
}
