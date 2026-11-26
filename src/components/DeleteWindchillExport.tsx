import { useEffect, useState } from 'react'
import type { GitStorage } from '../useGitStorage'
import type { WindchillWorkspace } from '../useWindchill'
import type { WindchillView } from '../windchillViews'
import { exportDeletedText } from '../viewPageActions'
import { Modal, Notice } from './ui'

// CON-118: Delete this export… on a Windchill export's page under Other views. The pop-up names the export and its
// file and lists what is deleted: its results and setup here, and its files in Git (windchill-data, windchill-analysis),
// deleted in ONE commit whose history stays in GitHub. Git first: only when that commit is made (or there is nothing
// in Git) is the export removed here, with the existing removal (useWindchill.removeView), so a failure leaves it as it was.
export function DeleteWindchillExport({ view, windchill, git, onClose, onDone }: { view: WindchillView; windchill: WindchillWorkspace; git: GitStorage; onClose: () => void; onDone: (text: string) => void }) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    git.windchillExportFiles(view.id).then((found) => { if (live) setFiles(found) }).catch((failure) => { if (live) setError(`Its files in Git could not be listed: ${failure instanceof Error ? failure.message : String(failure)} Nothing was deleted; try again.`) })
    return () => { live = false }
  }, [git, view.id])
  const source = windchill.sources.find((entry) => entry.viewId === view.id)
  const repository = git.config ? `${git.config.owner}/${git.config.repo}` : 'the data repository'

  async function run() {
    setBusy(true); setError('')
    try {
      const result = await git.deleteWindchillExport(view.id, view.name)
      windchill.removeView(view.id)
      onDone(exportDeletedText(view.name, result.deleted))
    } catch (failure) {
      setError(`Not deleted: ${failure instanceof Error ? failure.message : String(failure)} Nothing was deleted here; try again.`)
      setBusy(false)
    }
  }

  return <Modal title={`Delete the export “${view.name}”?`} eyebrow="WINDCHILL EXPORT · SHARED IN GIT" onClose={() => { if (!busy) onClose() }}>
    <form className="delete-windchill-export" onSubmit={(event) => { event.preventDefault(); void run() }}>
      <p>The Windchill export <strong>“{view.name}”</strong> (imported from <code>{view.exportFile}</code>{source ? `, ${source.rows.length} row${source.rows.length === 1 ? '' : 's'}` : ''}) is deleted:</p>
      <ul>
        <li>here: its page under <strong>Other views</strong>, its setup and its imported rows;</li>
        <li>in Git ({repository}), in one commit — its history stays in GitHub — so it is no longer loaded by a browser or desktop app that does not have it yet.</li>
      </ul>
      {files === null ? (error ? null : <p className="muted" role="status">Looking for its files in Git…</p>)
        : files.length ? <><p>These files are <strong>deleted in Git</strong>:</p><ul className="delete-export-files">{files.map((path) => <li key={path}><code>{path}</code></li>)}</ul></>
        : <p>It has no files in Git, so only this app's copy is deleted.</p>}
      <p>Other browsers that already have it keep their copy until it is deleted there. Release Details streams, Windchill searches and Azure DevOps are not touched. To get it back, import the export file again.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="danger-button" disabled={busy || files === null}>{busy ? 'Deleting…' : 'Delete export'}</button></div>
    </form>
  </Modal>
}
