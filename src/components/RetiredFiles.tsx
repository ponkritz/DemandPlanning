import { useEffect, useState } from 'react'
import { downloadJson } from '../download'
import { retiredCopyName, retiredDeleteBlock, retiredDeleteMessage, retiredFiles, retiredNotice, staleQeLine, type RetiredFile } from '../retiredData'
import type { GitStorage } from '../useGitStorage'
import { Modal, Notice, Panel, WriteBlocked } from './ui'

// GIT-28: Admin → Data & sharing → Shared setup in Git — a one-time notice for each shared file the app no longer uses
// (qe-mapping.json since QE Mapping was removed), shown only while the file is in Git: Download a copy first, then a
// confirmation pop-up, then one commit that deletes the file at the version downloaded. Blocked in View as, with the
// synthetic sample and with a read-only Git token. Its history stays in GitHub.
// toolOwner: the viewer holds the Tool Owner role; staleQeEpics: the bulk Epics still on the old QE Mapping columns only.
export function RetiredFilesPanel({ git, viewingAs, toolOwner, staleQeEpics = [] }: { git: GitStorage; viewingAs: boolean; toolOwner: boolean; staleQeEpics?: string[] }) {
  const [present, setPresent] = useState<RetiredFile[]>([])
  const [done, setDone] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null)
  const { connected, retiredFileSha } = git
  useEffect(() => {
    if (!connected) return
    let live = true
    void Promise.all(retiredFiles.map(async (file) => ((await retiredFileSha(file.name).catch(() => null)) ? [file] : []))).then((found) => { if (live) setPresent(found.flat()) })
    return () => { live = false }
  }, [connected, retiredFileSha])
  const shown = connected ? present : []
  if (!shown.length && !done) return null
  return <Panel className="connection-panel admin-section" eyebrow="GIT" title="Data no longer used" info={<ul><li>Shared files in the Git data repository that no page of this app reads any more. Delete each one once; its history stays in GitHub.</li><li>Download a copy first; the delete is one commit of the file as downloaded (if someone changed it since, nothing is deleted).</li></ul>}>
    {done && <Notice tone={done.tone}>{done.text}</Notice>}
    {shown.map((file) => <RetiredFileNotice key={file.name} file={file} git={git} viewingAs={viewingAs} toolOwner={toolOwner} staleQeEpics={file.name === 'qe-mapping.json' ? staleQeEpics : []} onDeleted={(text) => { setPresent((current) => current.filter((entry) => entry.name !== file.name)); setDone({ tone: 'success', text }) }} />)}
  </Panel>
}

function RetiredFileNotice({ file, git, viewingAs, toolOwner, staleQeEpics, onDeleted }: { file: RetiredFile; git: GitStorage; viewingAs: boolean; toolOwner: boolean; staleQeEpics: string[]; onDeleted: (text: string) => void }) {
  // The version downloaded: the delete is of that version only.
  const [copy, setCopy] = useState<{ sha: string; name: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [asking, setAsking] = useState(false)
  const reason = retiredDeleteBlock({ connected: git.connected, viewingAs, isSample: git.isSample, readOnly: git.readOnly, toolOwner, downloaded: Boolean(copy) })
  async function download() {
    setBusy('copy'); setError('')
    try {
      const read = await git.readRetiredFile(file.name)
      if (read.text == null || !read.sha) { setError(`${file.name} is no longer in Git.`); return }
      const name = retiredCopyName(file, new Date())
      downloadJson(read.text, name)
      setCopy({ sha: read.sha, name })
    } catch (failure) { setError(`No copy was downloaded: ${failure instanceof Error ? failure.message : String(failure)}`) }
    finally { setBusy('') }
  }
  async function remove() {
    if (!copy) return
    setBusy('delete'); setError('')
    try {
      const deleted = await git.deleteRetiredFile(file.name, copy.sha, retiredDeleteMessage(file))
      if (!deleted) { setAsking(false); setCopy(null); setError(`${file.name} changed in Git (or is gone) since the copy was downloaded: nothing was deleted. Download a copy again.`); return }
      setAsking(false)
      onDeleted(`${file.name} was deleted from Git in one commit (your copy: ${copy.name}). Its history stays in GitHub.`)
    } catch (failure) { setError(`Nothing was deleted: ${failure instanceof Error ? failure.message : String(failure)}`) }
    finally { setBusy('') }
  }
  return <div className="retired-file" data-file={file.name}>
    <Notice tone="warning"><strong>{retiredNotice(file)}</strong> — the {file.label} page was removed from the app. Older app versions that still show {file.label} will find no file and offer an empty {file.label}.</Notice>
    {error && <Notice tone="error">{error}</Notice>}
    <div className="button-row">
      <button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => void download()}>{busy === 'copy' ? 'Downloading…' : copy ? 'Download a copy again' : 'Download a copy'}</button>
      <button type="button" className="danger-button" style={{ marginTop: 0 }} disabled={Boolean(busy) || Boolean(reason)} title={reason || undefined} onClick={() => setAsking(true)}>Delete it from Git…</button>
      <WriteBlocked reason={reason} />
    </div>
    {asking && copy && <Modal eyebrow="GIT · SHARED SETUP" title={`Delete ${file.name} from Git`} onClose={() => { if (!busy) setAsking(false) }}>
      <form onSubmit={(event) => { event.preventDefault(); void remove() }}>
        <p>One commit deletes <strong>{file.name}</strong> from the Git data repository (“{retiredDeleteMessage(file)}”). No page of this app reads it any more; its history stays in GitHub, and your copy is <strong>{copy.name}</strong>.</p>
        {staleQeEpics.length > 0 && <Notice tone="warning">{staleQeLine(staleQeEpics)}</Notice>}
        <p className="muted">Older app versions that still show {file.label} will find no file and offer an empty {file.label}.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="modal-actions"><button type="button" className="ghost" disabled={Boolean(busy)} onClick={() => setAsking(false)}>Cancel</button><button className="danger-button" disabled={Boolean(busy)}>{busy === 'delete' ? 'Deleting…' : 'Delete from Git'}</button></div>
      </form>
    </Modal>}
  </div>
}
