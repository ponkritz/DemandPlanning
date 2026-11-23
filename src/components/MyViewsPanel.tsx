import { useState } from 'react'
import { myViewServers, newMyView } from '../myViews'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { saveAzureConnectionProfile } from '../azureCredentials'
import { EmptyState, Notice, Panel, Pill } from './ui'

// SET-17 My settings → My views: a person's own read-only views on a server they already have a PAT for. Shown under
// Other views in the menu; kept on this computer only (never in Git or backups); never a stream.
export function MyViewsPanel({ azure }: { azure: AzureWorkspace }) {
  const profiles = azure.connectionProfiles
  const mine = profiles.filter((profile) => profile.mine)
  const servers = myViewServers(profiles)
  const [form, setForm] = useState({ name: '', server: '', project: '', query: '' })
  const [problem, setProblem] = useState('')
  const [done, setDone] = useState('')
  function add(event: React.FormEvent) {
    event.preventDefault()
    const view = newMyView({ ...form, server: servers.find((server) => server.key === form.server) }, profiles, `my-${crypto.randomUUID().slice(0, 12)}`)
    if (typeof view === 'string') { setProblem(view); setDone(''); return }
    try { saveAzureConnectionProfile(view) } catch (error) { setProblem(error instanceof Error ? error.message : String(error)); return }
    azure.reloadConnectionProfiles()
    setForm({ name: '', server: form.server, project: form.project, query: '' }); setProblem(''); setDone(`“${view.reason}” added under Other views in the menu. Fetching it…`)
    void azure.fetchConnection(view.id)
  }
  return <Panel className="connection-panel my-views" eyebrow="MY VIEWS" title="My views" info="Your own read-only views: a name, a server you already have a PAT for, a project and a WIQL query. They are listed under Other views in your menu, kept in this browser or desktop app only — never shared, never saved to Git or a backup — and never replace or change a stream (DP, CP, IOCC, Content, Tool Validations). Nothing is written to Azure DevOps.">
    {mine.length ? <div className="azure-table"><table className="connection-table"><thead><tr><th>View</th><th>Server / project</th><th>Status</th><th /></tr></thead><tbody>{mine.map((profile) => {
      const status = azure.connectionStatus[profile.id]
      return <tr key={profile.id}>
        <td><strong>{profile.viewName || profile.reason}</strong><span className="query-chip" title={profile.query}>Query</span></td>
        <td>{profile.url.replace('https://', '')}{profile.baseUrl && <Pill tone="info">On-prem</Pill>}</td>
        <td><small>{status?.message ?? 'Not fetched yet'}</small></td>
        <td><div className="button-row nowrap"><button type="button" className="ghost" disabled={status?.state === 'busy'} onClick={() => void azure.fetchConnection(profile.id)}>Fetch</button><button type="button" className="text-button" onClick={() => { if (window.confirm(`Remove your view “${profile.viewName || profile.reason}” from this computer?`)) { azure.removeConnection(profile.id); setDone('') } }}>Remove</button></div></td>
      </tr>
    })}</tbody></table></div> : <EmptyState title="No views of your own yet." detail="Add one below: it appears under Other views in your menu." />}
    {servers.length ? <form className="connection-form my-view-form" aria-label="Add my view" onSubmit={add}>
      <div className="form-row">
        <label>Name<input value={form.name} maxLength={80} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. My open bugs" /></label>
        <label>Server (with your PAT)<select value={form.server} onChange={(event) => setForm({ ...form, server: event.target.value })}><option value="">Choose a server…</option>{servers.map((server) => <option key={server.key} value={server.key}>{server.base.replace('https://', '')}{server.onPrem ? ' (on-prem, read-only)' : ''}</option>)}</select></label>
        <label>Project<input value={form.project} onChange={(event) => setForm({ ...form, project: event.target.value })} /></label>
      </div>
      <label>Query (WIQL)<textarea rows={3} value={form.query} onChange={(event) => setForm({ ...form, query: event.target.value })} placeholder="SELECT [System.Id] FROM WorkItems WHERE …" /></label>
      <div className="button-row"><button className="primary">Add my view</button></div>
    </form> : <Notice tone="info">Enter a PAT for a server first (My settings → Servers and PATs); My views use the server’s PAT.</Notice>}
    {problem && <Notice tone="error">{problem}</Notice>}
    {done && <Notice tone="success">{done}</Notice>}
  </Panel>
}
