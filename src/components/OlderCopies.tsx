import { useState } from 'react'
import { recordJob } from '../backgroundJobs'
import { Modal, Notice, WriteBlocked } from './ui'
import { gitReasonOf, type Viewer } from '../menuLayout'
import type { GitStorage } from '../useGitStorage'
import type { OnDemandStore } from '../useOnDemand'

// OND-123, OND-135: a page with two copies of its file (or of its Dashboard blocks file) in Git — the notice names them
// and the copy that is read (the newer, by latest commit); "Delete older copy…" (the Tool Owner, the right of Delete
// page) asks first in a pop-up listing exactly what is deleted and what stays, then deletes the older copies in one
// commit (their history stays in GitHub). Disabled, with the reason, for everyone else, without Git storage that can
// save, with the synthetic sample, in View as and while a save of the page is on its way.
function olderCopyReason(git: Pick<GitStorage, 'connected' | 'readOnly' | 'isSample' | 'queueState'>, viewer: Viewer, store: OnDemandStore, id: string) {
  const queue = store.queue(id)
  return gitReasonOf(git) || (viewer.viewingAs ? 'View as is on: nothing is saved or deleted.' : '') || (viewer.readOnly || !viewer.manager ? 'Only a Tool Owner (“Manage pages and menu groups”) deletes an older copy of a page’s file, as Delete page.' : '')
    || (queue.waiting > 0 || queue.failed > 0 ? 'A save of this page is still on its way (or waiting for Retry): delete the older copy once it is saved.' : '')
}
export function OlderCopies({ store, git, viewer, id, name }: { store: OnDemandStore; git: GitStorage; viewer: Viewer; id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const sets = store.copies(id)
  if (!sets.length) return null
  const reason = olderCopyReason(git, viewer, store, id)
  const older = sets.flatMap((set) => set.older)
  return <Notice tone="warning" className="od-file-copies">
    {name} has {older.length + sets.length} copies of {sets.length > 1 ? 'its files' : sets[0].folder === 'dashboards' ? 'its blocks file' : 'its file'} in Git: {sets.map((set) => `${set.keep} (newer, read and saved to) and ${set.older.join(', ')}`).join('; ')}.{' '}
    <span className="button-row"><button type="button" className="ghost" disabled={Boolean(reason)} title={reason || undefined} onClick={() => setOpen(true)}>Delete older copy…</button></span>
    <WriteBlocked reason={reason} />
    {open && <DeleteCopiesDialog name={name} sets={sets} onCancel={() => setOpen(false)} onDelete={async () => {
      const label = `Delete older copy · ${name}`
      try {
        const done = await store.deleteCopies(id)
        recordJob(`pages:${id}`, label, { text: `Deleted ${done.deleted.join(', ')} in one commit; its history stays in GitHub. — ${done.commitUrl}` })
        setOpen(false)
      } catch (failure) { recordJob(`pages:${id}`, label, { text: failure instanceof Error ? failure.message : String(failure), failed: true }); throw failure }
    }} />}
  </Notice>
}
function DeleteCopiesDialog({ name, sets, onCancel, onDelete }: { name: string; sets: ReturnType<OnDemandStore['copies']>; onCancel: () => void; onDelete: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const older = sets.flatMap((set) => set.older)
  const submit = async () => { setBusy(true); setError(''); try { await onDelete() } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) } }
  return <Modal eyebrow={`PAGES & MENU · ${name.toUpperCase()}`} title="Delete the older copy" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <p>Delete the older {older.length === 1 ? 'copy' : 'copies'} of <strong>{name}</strong> from Git, for everyone, in one commit? Its history stays in GitHub.</p>
      <h3>Deleted</h3>
      <ul className="od-copy-list">{older.map((path) => <li key={path}><code>{path}</code>{path.endsWith('/') ? ' (the folder with every file in it)' : ''}</li>)}</ul>
      <h3>Stays</h3>
      <ul className="od-copy-list">{sets.map((set) => <li key={set.keep}><code>{set.keep}</code> — the newer (latest commit), read and saved to</li>)}</ul>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Deleting…' : `Delete ${older.length === 1 ? 'older copy' : `${older.length} older copies`}`}</button></div>
    </form>
  </Modal>
}
