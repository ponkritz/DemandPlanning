import { useState } from 'react'
import { formatDateTime } from '../format'
import { Modal, Notice } from './ui'

// GIT-18: newer data in Git for the page in use — a warning about the data shown, so it stays on the page (UI-STANDARDS
// §8), never in Background jobs. It names each newer file, who saved it and when (from its latest commit), and offers
// Load the newer data, which reads only this page's files again (a full reload only where nothing else can load one).
// When the page holds edits that loading drops, a pop-up names them and asks first (§4).
export interface PageChange { path: string; label: string; by?: string; at?: string; otherWindow?: boolean }
const whoSaved = (change: Pick<PageChange, 'by' | 'at' | 'otherWindow'>) => change.otherWindow ? 'saved by you in another window of this browser' : `saved by ${change.by || 'someone else'}${change.at ? ` on ${formatDateTime(change.at)}` : ''}`

export function PageGitNotice({ page, changes, unsaved, fullReload, onLoad }: { page: string; changes: PageChange[]; unsaved: string[]; fullReload: boolean; onLoad: () => Promise<void> }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!changes.length) return null
  const load = async () => {
    setAsking(false); setBusy(true); setError('')
    try { await onLoad() } catch (failure) { setError(`The newer data was not loaded: ${failure instanceof Error ? failure.message : String(failure)}`) } finally { setBusy(false) }
  }
  return <Notice tone="warning" className="git-update-banner page-git-notice">
    <p><strong>Newer data in Git</strong> for {page}: {changes.map((change, index) => <span key={change.path}>{index ? '; ' : ''}{change.label} — {whoSaved(change)}</span>)}.{fullReload ? ' Loading it reloads the app.' : ''}{unsaved.length ? ' Loading it drops what you have not saved here.' : ''}</p>
    {error && <p role="alert">{error}</p>}
    <div className="button-row"><button type="button" className="primary" disabled={busy} onClick={() => { if (unsaved.length) setAsking(true); else void load() }}>{busy ? 'Loading the newer data…' : 'Load the newer data'}</button></div>
    {asking && <Modal eyebrow="GIT · NEWER DATA" title="Load the newer data?" onClose={() => setAsking(false)}>
      <form onSubmit={(event) => { event.preventDefault(); void load() }}>
        <p>Loading the newer data of {page} from Git drops what is not saved to Git here:</p>
        <ul>{unsaved.map((entry) => <li key={entry}>{entry}</li>)}</ul>
        <p className="muted">Keep them by saving them first: a save is merged with the newer data where the page allows it.</p>
        <div className="modal-actions"><button type="button" className="ghost" onClick={() => setAsking(false)}>Cancel</button><button className="primary">Load the newer data</button></div>
      </form>
    </Modal>}
  </Notice>
}
