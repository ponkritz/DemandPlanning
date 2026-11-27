import { useCallback, useEffect, useState } from 'react'
import { GitConflictError } from '../gitStorage'
import { roles, type Role } from '../access'
import { myViewServers } from '../myViews'
import { assignBlocked } from '../otherViews'
import { emptyStarters, newStarterId, parseStarters, roleStartersPath, serializeStarters, starterProblem, withStarter, withoutStarter, type StarterView, type StartersFile } from '../roleStarters'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { GitStorage } from '../useGitStorage'
import { EmptyState, Modal, Notice, Panel, Pill, WriteBlocked } from './ui'

// SET-21, SET-22: Admin → Data & history → Other views → Starter views per role. Admins ("Shared setup in Git",
// storage.shared — Tool Owner and Admin by default) define read-only views for access roles; everyone whose roles include
// one gets a copy among their own My views (SET-23). Saved to Git (other-views/role-starters.json), never a PAT.
type Draft = { id?: string; name: string; server: string; project: string; query: string; roles: Role[] }
const emptyDraft = (): Draft => ({ name: '', server: '', project: '', query: '', roles: [] })

export function RoleStarterViewsPanel({ git, azure, admin, viewingAs }: { git?: GitStorage; azure: AzureWorkspace; admin: boolean; viewingAs: boolean }) {
  const [state, setState] = useState<{ file: StartersFile; sha: string | null; error: string; loaded: boolean }>({ file: emptyStarters(), sha: null, error: '', loaded: false })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [removing, setRemoving] = useState<StarterView | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState('')
  const read = git?.readRoleStarters
  const connected = Boolean(git?.connected)
  const load = useCallback(async () => {
    if (!read || !connected) return
    try { const file = await read(); setState({ file: parseStarters(file.text), sha: file.sha, error: '', loaded: true }) } catch (failure) { setState((current) => ({ ...current, error: failure instanceof Error ? failure.message : String(failure), loaded: true })) }
  }, [read, connected])
  const visible = admin && !viewingAs
  useEffect(() => { if (visible) void Promise.resolve().then(load) }, [visible, load])
  if (!visible) return null
  const blocked = assignBlocked({ admin, viewingAs, git, isSample: azure.isSample }).replace('assign Other views', 'set up starter views').replace('nothing can be assigned', 'starter views cannot be saved')
  // Every server of the connections here (a starter view is fetched with each person's own PAT for its server).
  const servers = myViewServers(azure.connectionProfiles, () => true)
  async function save(next: StartersFile, message: string, text: string) {
    if (!git) return false
    setBusy(true); setProblem('')
    try {
      const saved = await git.writeRoleStarters(serializeStarters(next), state.sha, message)
      setState({ file: next, sha: saved.sha, error: '', loaded: true }); setDone(text); return true
    } catch (failure) {
      setProblem(failure instanceof GitConflictError ? `${roleStartersPath} was changed in Git since it was loaded. Reload it and make your change again.` : `Not saved: ${failure instanceof Error ? failure.message : String(failure)}`)
      return false
    } finally { setBusy(false) }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    const server = servers.find((entry) => entry.key === draft.server)
    const view: StarterView = { id: draft.id ?? newStarterId(), name: draft.name, server: server?.base ?? '', onPrem: Boolean(server?.onPrem), project: draft.project, query: draft.query, roles: draft.roles, by: azure.creatorEmail, at: new Date().toISOString() }
    const reason = starterProblem(view, state.file.views)
    if (reason) { setProblem(reason); return }
    void save(withStarter(state.file, view), `${draft.id ? 'Change' : 'Add'} starter view ${view.name.trim()} for ${view.roles.join(', ')}`, `“${view.name.trim()}” saved for ${view.roles.join(', ')}: people with ${view.roles.length === 1 ? 'that role' : 'those roles'} get a copy in their My views at their next start.`).then((ok) => { if (ok) setDraft(null) })
  }
  const keyOf = (view: StarterView) => servers.find((entry) => entry.base.toLowerCase() === view.server.toLowerCase())?.key ?? ''
  return <Panel className="connection-panel role-starter-views" eyebrow="ADMIN" title="Starter views per role" info={`Read-only views each access role starts with. Everyone whose roles include one gets a copy among their own My views (My settings → My views) at their next start, once on each computer; from then on the copy is theirs: they keep, delete or add their own. A change here later does not change copies already made. Saved for everyone in Git (${roleStartersPath}); no PAT is saved — each person fetches with their own PAT for the server.`}
    action={<div className="button-row"><button type="button" className="ghost" onClick={() => void load()}>↻ Reload</button><button type="button" className="primary" disabled={Boolean(blocked)} title={blocked || undefined} onClick={() => { setProblem(''); setDone(''); setDraft(emptyDraft()) }}>＋ Add starter view</button></div>}>
    {blocked && <WriteBlocked reason={`Starter views: ${blocked}`} />}
    {state.error && <Notice tone="error">The starter views were not read from Git: {state.error}</Notice>}
    {done && <Notice tone="success">{done}</Notice>}
    {problem && !draft && <Notice tone="error">{problem}</Notice>}
    {state.file.views.length ? <div className="azure-table"><table className="starter-table"><thead><tr><th>View</th><th>Server · project</th><th>Query</th><th>Roles</th><th /></tr></thead><tbody>{state.file.views.map((view) => <tr key={view.id}>
      <td><strong>{view.name}</strong></td>
      <td><small className="plain">{view.server.replace(/^https:\/\//, '')} · {view.project}</small>{view.onPrem && <Pill tone="info">On-prem</Pill>}</td>
      <td><span className="query-chip" title={view.query}>Query</span></td>
      <td>{view.roles.map((role) => <Pill key={role} tone="neutral">{role}</Pill>)}</td>
      <td><div className="button-row nowrap"><button type="button" className="ghost" disabled={Boolean(blocked)} title={blocked || undefined} onClick={() => { setProblem(''); setDone(''); setDraft({ id: view.id, name: view.name, server: keyOf(view), project: view.project, query: view.query, roles: view.roles }) }}>Edit</button><button type="button" className="text-button danger-text" disabled={Boolean(blocked)} title={blocked || undefined} onClick={() => { setProblem(''); setRemoving(view) }}>Remove…</button></div></td>
    </tr>)}</tbody></table></div> : state.loaded && !state.error ? <EmptyState title="No starter views yet." detail="Add one: everyone with its roles gets a copy in their My views." /> : null}
    {draft && <Modal title={draft.id ? `Edit starter view “${draft.name}”` : 'New starter view'} eyebrow="SETTINGS · SHARED IN GIT" wide onClose={() => { if (!busy) setDraft(null) }}>
      <form className="connection-form starter-form" aria-label="Starter view" onSubmit={submit}>
        <div className="form-row">
          <label>Name<input value={draft.name} maxLength={80} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Open bugs of my team" /></label>
          <label>Server<select value={draft.server} onChange={(event) => setDraft({ ...draft, server: event.target.value })}><option value="">Choose a server…</option>{servers.map((server) => <option key={server.key} value={server.key}>{server.base.replace('https://', '')}{server.onPrem ? ' (on-prem, read-only)' : ''}</option>)}</select></label>
          <label>Project<input value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })} /></label>
        </div>
        <label>Query (WIQL)<textarea rows={3} value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} placeholder="SELECT [System.Id] FROM WorkItems WHERE …" /></label>
        <fieldset className="starter-roles"><legend>For these access roles</legend>{roles.map((role) => <label key={role} className="check"><input type="checkbox" checked={draft.roles.includes(role)} onChange={(event) => setDraft({ ...draft, roles: event.target.checked ? roles.filter((entry) => entry === role || draft.roles.includes(entry)) : draft.roles.filter((entry) => entry !== role) })} />{role}</label>)}</fieldset>
        {draft.id && <p className="muted">People who already have a copy keep theirs as it is; the change reaches only those who get it for the first time.</p>}
        {problem && <Notice tone="error">{problem}</Notice>}
        <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setDraft(null)}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving to Git…' : 'Save to Git'}</button></div>
      </form>
    </Modal>}
    {removing && <Modal title={`Remove starter view “${removing.name}”?`} eyebrow="SETTINGS · SHARED IN GIT" onClose={() => { if (!busy) setRemoving(null) }}>
      <form onSubmit={(event) => { event.preventDefault(); void save(withoutStarter(state.file, removing.id), `Remove starter view ${removing.name}`, `“${removing.name}” removed: nobody gets it from now on. The copies people already have stay theirs.`).then((ok) => { if (ok) setRemoving(null) }) }}>
        <p>Nobody with {removing.roles.join(', ')} gets “{removing.name}” from now on. The copies people already have in their My views stay theirs.</p>
        {problem && <Notice tone="error">{problem}</Notice>}
        <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="danger-button" disabled={busy}>{busy ? 'Removing…' : 'Remove'}</button></div>
      </form>
    </Modal>}
  </Panel>
}
