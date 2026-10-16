import { useState } from 'react'
import { fetchAzureWorkItems, mergeAzureWorkItems, parseAzureProjectUrl, type AzureFetchResult } from '../azureDevOps'
import type { PageProps } from './types'
import { Heading, Panel, Pill } from '../components/ui'

const defaultUrl = 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics'

export function AzureDevOpsPage({ store }: PageProps) {
  const [projectUrl, setProjectUrl] = useState(defaultUrl)
  const [team, setTeam] = useState('InD Quality')
  const [pat, setPat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<AzureFetchResult | null>(null)
  const saved = store.state.azureWorkItems ?? []
  const [filter, setFilter] = useState('')
  const items = preview?.items ?? saved
  const shown = items.filter((item) => `${item.id} ${item.title} ${item.workItemType} ${item.state}`.toLowerCase().includes(filter.toLowerCase()))
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.workItemType || 'Unknown', (counts.get(item.workItemType || 'Unknown') ?? 0) + 1)

  async function fetchPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setPreview(null); setBusy(true)
    const token = pat
    setPat('')
    try {
      const config = parseAzureProjectUrl(projectUrl)
      const result = await fetchAzureWorkItems({ ...config, team: team.trim() || config.team }, token)
      setPreview(result)
      setMessage(`${result.items.length} work items fetched. Review the preview, then save it to the app.`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to fetch Azure DevOps data.') }
    finally { setBusy(false) }
  }

  function savePreview() {
    if (!preview) return
    const incoming = preview.items
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems(draft.azureWorkItems ?? [], incoming)
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Sync', entity: 'AzureDevOps', entityId: 'work-items', detail: `Saved ${incoming.length} work items; matched by organization, project and ID.` })
      return draft
    })
    setPreview(null); setMessage(`${incoming.length} work items saved. Refreshing the same IDs updates existing records. Azure DevOps was not modified.`)
  }

  return <section className="content"><Heading eyebrow="SOURCE CONNECTION" title="Azure DevOps" detail="Read team work items into Demand Planning using a short-lived PAT." />
    <Panel className="connection-panel"><div className="panel-heading"><div><h2>Connect work-item data</h2><p className="muted">Fetch the team's configured area paths and work items, including Epics, Features and Bugs. Preview before saving.</p></div><Pill tone={busy ? 'info' : saved.length ? 'open' : 'neutral'}>{busy ? 'Fetching…' : saved.length ? 'Saved data available' : 'Not connected'}</Pill></div>
      <form className="azure-form" onSubmit={fetchPreview}>
        <label>Azure DevOps project or backlog URL<input type="url" required disabled={busy} value={projectUrl} onChange={(event) => { setProjectUrl(event.target.value); setPreview(null) }} /></label>
        <div className="form-row"><label>Team<input required disabled={busy} value={team} onChange={(event) => { setTeam(event.target.value); setPreview(null) }} /></label><label>Personal access token (Work Items: Read)<input type="password" required autoComplete="off" disabled={busy} value={pat} onChange={(event) => setPat(event.target.value)} placeholder="Paste locally; cleared when fetching" /></label></div>
        <div className="button-row"><button className="primary" disabled={busy}>{busy ? 'Fetching team work items…' : 'Fetch preview'}</button>{preview && <><button type="button" className="primary" disabled={!preview.items.length} onClick={savePreview}>Save {preview.items.length} work items</button><button type="button" className="ghost" onClick={() => { setPreview(null); setMessage('Preview discarded. Previously saved work items are unchanged.') }}>Discard preview</button></>}</div>
      </form>
      <p className="muted">Use an organization-scoped PAT with Work Items → Read and a short expiry. The token is used for this fetch only; it is excluded from backups and app storage. No GitHub secret is needed.</p>
      {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}
    </Panel>
    <Panel className="connection-panel"><div className="panel-heading"><div><h2>{preview ? 'Work-item preview' : 'Saved Azure DevOps work items'}</h2><p className="muted">{items.length} items · {preview ? `Scope: ${preview.areaPaths.join(', ')}` : 'Fetch again to refresh source data.'}</p></div><input aria-label="Search Azure work items" className="search" placeholder="Search ID, title, type or state" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
      <div className="button-row">{[...counts].map(([type, count]) => <Pill key={type} tone="info">{type}: {count}</Pill>)}</div>
      <p className="muted">Release counts, custom milestones and YoY closure trends need confirmed field mapping. Missing target/closure dates stay blank. Items no longer returned remain in saved history until reviewed.</p>
      {shown.length > 0 ? <div className="azure-table"><table><thead><tr><th>ID / Title</th><th>Type / State</th><th>Assigned to</th><th>Iteration / Parent</th><th>Target / Closed</th><th>Last fetched</th></tr></thead><tbody>{shown.slice(0, 100).map((item) => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a><strong>{item.title}</strong></td><td>{item.workItemType}<small>{item.state}</small></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.iterationPath}<small>{item.parentId ? `Parent #${item.parentId}` : 'No parent supplied'}</small></td><td>{item.targetDate?.slice(0, 10) ?? 'No target date'}<small>{item.closedDate?.slice(0, 10) ?? 'No closed date'}</small></td><td>{new Date(item.syncedAt).toLocaleString()}</td></tr>)}</tbody></table><p className="muted">Showing {Math.min(shown.length, 100)} of {shown.length} matching work items.</p></div> : <p className="empty-state">{items.length ? 'No matching work items.' : 'No Azure DevOps work items loaded yet.'}</p>}
    </Panel>
  </section>
}
