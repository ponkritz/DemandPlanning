import { useState } from 'react'
import { viewNameOf, type AzureConnectionProfileSummary } from '../azureCredentials'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { myViewDeletedText } from '../viewPageActions'
import { Modal, Notice } from './ui'

// SET-17, SET-19: the one deletion of a person's own view (My views), used by My settings → My views and by the view's
// own page (⋯ → Delete this view…). The pop-up names the view and what is deleted; only this browser or desktop app
// changes: never the shared setup in Git, another person's views, the server's PAT or Azure DevOps.
export function DeleteMyView({ view, azure, onClose, onDone }: { view: AzureConnectionProfileSummary; azure: AzureWorkspace; onClose: () => void; onDone: (text: string) => void }) {
  const name = viewNameOf(view)
  const [error, setError] = useState('')
  function run() {
    if (!view.mine) { setError('Only a view of your own (My views) can be deleted here.'); return }
    try { azure.removeConnection(view.id) } catch (failure) { setError(`Not deleted: ${failure instanceof Error ? failure.message : String(failure)}`); return }
    onDone(myViewDeletedText(name))
  }
  return <Modal title={`Delete your view “${name}”?`} eyebrow="MY VIEWS · THIS COMPUTER" onClose={onClose}>
    <form className="delete-my-view" onSubmit={(event) => { event.preventDefault(); run() }}>
      <p>Your own view <strong>“{name}”</strong> ({view.url.replace('https://', '')}) is deleted from this browser or desktop app:</p>
      <ul>
        <li>its definition — name, server, project and query — and the data fetched for it here;</li>
        <li>its entry under <strong>Other views</strong> in your menu.</li>
      </ul>
      <p>Only you are affected: the shared setup in Git and other people's views are not touched. Your server's PAT stays (Servers and PATs), and nothing is changed in Azure DevOps. It cannot be undone here; add it again in My settings → My views.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="danger-button">Delete view</button></div>
    </form>
  </Modal>
}
