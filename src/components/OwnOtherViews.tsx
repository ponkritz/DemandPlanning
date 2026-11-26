import { useCallback, useEffect, useState } from 'react'
import { splitAzureUrl, viewNameOf, type AzureConnectionProfileSummary } from '../azureCredentials'
import { assignBlocked, normalOwner, otherViewsPath, unassignedOtherViewsPath, unassignedVisible } from '../otherViews'
import type { GitStorage } from '../useGitStorage'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { EmptyState, Modal, Notice, Panel, WriteBlocked } from './ui'

// CON-120…CON-124: each person's Other views are their own (other-views/<email>.json in Git); the views found in the
// older shared setup wait in the unassigned list (other-views/unassigned.json) until an admin assigns each one.

const roleText: Record<string, string> = { 'time-tracking': 'Time Writing', 'release-source': 'Releases · DHFI', documents: 'Documents · Vault', reference: 'Reference', 'backlog-view': 'Backlog view' }
const where = (view: AzureConnectionProfileSummary) => { const parts = splitAzureUrl(view.url, view.baseUrl); return `${parts.baseUrl.replace(/^https:\/\//, '')} · ${parts.project}${parts.team ? ` · team ${parts.team}` : ''}` }

// CON-124: Remove one of my Other views — here, from my file in Git and, by a removal marker (CON-110), on every other
// computer that still has it (an older app never writes it back). Its data file in Git stays.
export function RemoveOwnOtherView({ view, git, azure, onClose, onDone }: { view: AzureConnectionProfileSummary; git?: GitStorage; azure: AzureWorkspace; onClose: () => void; onDone: (result: { tone: 'success' | 'warning'; text: string }) => void }) {
  const name = viewNameOf(view)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const email = azure.creatorEmail
  const toGit = Boolean(git?.connected && !git.readOnly && !azure.isSample && otherViewsPath(email))
  async function run() {
    setBusy(true); setError('')
    if (!toGit || !git) {
      azure.removeConnection(view.id)
      onDone({ tone: git?.connected ? 'warning' : 'success', text: `“${name}” removed from this computer.${git?.connected ? ` It is still in your Other views in Git (${!otherViewsPath(email) ? 'set your work email in My settings' : 'your Git token cannot save'}), so it comes back at the next start until it is removed there.` : ''}` })
      return
    }
    try {
      await git.removeViewForEveryone(view, 'remove', email)
      azure.removeConnection(view.id)
      await git.saveOwnOtherViews(email, [view.id], `Remove my Other view: ${name}`)
      onDone({ tone: 'success', text: `“${name}” removed from your Other views here and in Git (${otherViewsPath(email)}); your other computers remove it at their next start. Its data file in Git is kept.` })
    } catch (failure) {
      setError(`Not removed: ${failure instanceof Error ? failure.message : String(failure)} Try again.`)
      setBusy(false)
    }
  }
  return <Modal title={`Remove “${name}”?`} eyebrow="OTHER VIEWS · YOURS IN GIT" onClose={() => { if (!busy) onClose() }}>
    <form className="remove-own-view" onSubmit={(event) => { event.preventDefault(); void run() }}>
      <p>“{name}” ({where(view)}) is one of <strong>your</strong> Other views: nobody else sees it.</p>
      <ul>
        <li>It is removed here and from your Other views in Git{toGit ? <> (<code>{otherViewsPath(email)}</code>)</> : ' when you can save to Git'}.</li>
        <li>It is marked removed (azure-views-removed.json), so your other computers — and older versions of the app — drop it at their next start.</li>
        <li>Its saved data in Git is kept; your PATs are not touched.</li>
      </ul>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Removing…' : 'Remove'}</button></div>
    </form>
  </Modal>
}

// CON-122, CON-123: Admin → Data & sharing → Other views — the unassigned list, for admins only (Shared setup in Git).
// Each view is assigned to a person by their work email: it moves into their file and only they see it from then on.
export function UnassignedOtherViews({ git, azure, admin, viewingAs, people }: { git?: GitStorage; azure: AzureWorkspace; admin: boolean; viewingAs: boolean; people: string[] }) {
  const [list, setList] = useState<{ views: AzureConnectionProfileSummary[]; error: string; loaded: boolean }>({ views: [], error: '', loaded: false })
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<{ view: AzureConnectionProfileSummary; email: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const readUnassigned = git?.readUnassignedViews
  const connected = Boolean(git?.connected)
  const load = useCallback(async () => {
    if (!readUnassigned || !connected) return
    try { const file = await readUnassigned(); setList({ views: file.views, error: '', loaded: true }) } catch (failure) { setList({ views: [], error: failure instanceof Error ? failure.message : String(failure), loaded: true }) }
  }, [readUnassigned, connected])
  const visible = admin && !viewingAs
  useEffect(() => { if (visible) void Promise.resolve().then(load) }, [visible, load])
  if (!visible) return null
  const blocked = assignBlocked({ admin, viewingAs, git, isSample: azure.isSample })
  const views = unassignedVisible(list.views, { admin, viewingAs })
  async function assign() {
    if (!confirm || !git) return
    setBusy(true); setError('')
    try {
      await git.assignOtherView(confirm.view.id, confirm.email, azure.creatorEmail)
      setDone(`“${viewNameOf(confirm.view)}” assigned to ${confirm.email} (${otherViewsPath(confirm.email)}): from their next start only they see it.`)
      setConfirm(null); setBusy(false)
      await load()
      // Assigned to me: it joins my Other views now.
      if (normalOwner(confirm.email) === normalOwner(azure.creatorEmail)) { await git.syncViews(azure.creatorEmail).catch(() => null); azure.reloadConnectionProfiles() }
    } catch (failure) { setError(`Not assigned: ${failure instanceof Error ? failure.message : String(failure)} Nothing was changed for this view; try again.`); setBusy(false) }
  }
  return <Panel className="connection-panel unassigned-other-views" eyebrow="ADMIN" title="Unassigned Other views" info={`Other views from the older shared setup that nobody owns yet (${unassignedOtherViewsPath}). Only admins see them. Assign each one to the person who uses it: it moves into their own Other views in Git and only they see it from then on.`}
    action={<button type="button" className="ghost" onClick={() => void load()}>↻ Reload</button>}>
    {blocked && views.length > 0 && <WriteBlocked reason={`Assign: ${blocked}`} />}
    {list.error && <Notice tone="error">The unassigned Other views were not read from Git: {list.error}</Notice>}
    {done && <Notice tone="success">{done}</Notice>}
    {views.length ? <div className="azure-table"><table className="unassigned-table"><thead><tr><th>View</th><th>Used for</th><th>Server · project</th><th>Query</th><th>Assign to</th></tr></thead><tbody>{views.map((view) => {
      const email = picked[view.id] ?? '', valid = Boolean(normalOwner(email))
      return <tr key={view.id}>
        <td><strong>{viewNameOf(view)}</strong>{view.viewName && view.viewName !== view.reason && <small>{view.reason}</small>}</td>
        <td>{roleText[view.role] ?? view.role}</td>
        <td><small className="plain">{where(view)}</small></td>
        <td>{view.query ? <span className="query-chip" title={view.query}>Custom query</span> : <small>Default</small>}</td>
        <td><div className="inline-form nowrap"><input type="email" list="unassigned-people" aria-label={`Assign ${viewNameOf(view)} to (work email)`} placeholder="name@company.com" value={email} disabled={Boolean(blocked)} title={blocked || undefined} onChange={(event) => setPicked((current) => ({ ...current, [view.id]: event.target.value }))} /><button type="button" className="primary" disabled={Boolean(blocked) || !valid} title={blocked || (valid ? undefined : 'Enter the person’s work email')} onClick={() => { setError(''); setConfirm({ view, email: normalOwner(email) }) }}>Assign…</button></div></td>
      </tr>
    })}</tbody></table><datalist id="unassigned-people">{people.map((person) => <option key={person} value={person} />)}</datalist></div>
      : list.loaded && !list.error ? <EmptyState title="No unassigned Other views." detail="Every Other view belongs to a person." /> : null}
    {confirm && <Modal title={`Assign “${viewNameOf(confirm.view)}” to ${confirm.email}?`} eyebrow="OTHER VIEWS · SHARED IN GIT" onClose={() => { if (!busy) setConfirm(null) }}>
      <form className="assign-other-view" onSubmit={(event) => { event.preventDefault(); void assign() }}>
        <p>“{viewNameOf(confirm.view)}” ({where(confirm.view)}) moves into the Other views of <strong>{confirm.email}</strong> in Git (<code>{otherViewsPath(confirm.email)}</code>) and leaves the unassigned list.</p>
        <ul><li>From their next start only {confirm.email} sees it, under Other views; nobody else does.</li><li>No PAT is written; they fetch it with their own PAT for its server.</li></ul>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Assigning…' : 'Assign'}</button></div>
      </form>
    </Modal>}
  </Panel>
}
