import { useState } from 'react'
import { fetchAzureWorkItems, mergeAzureWorkItems, parseAzureProjectUrl, type AzureFetchResult, type AzureConfig } from '../azureDevOps'
import type { PageProps } from './types'
import { Heading, Panel, Pill } from '../components/ui'
import { AzureWorkItemTree } from '../components/AzureWorkItemTree'
import type { AzureWorkItem } from '../domain'
import { loadAzurePat, saveAzurePat, forgetAzurePat } from '../azureCredentials'

const defaultUrl = 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics'

export function AzureDevOpsPage({ store }: PageProps) {
  const [projectUrl, setProjectUrl] = useState(defaultUrl)
  const [team, setTeam] = useState('InD Quality')
  const [includeProjectEpics, setIncludeProjectEpics] = useState(true)
  const [pat, setPat] = useState(() => loadAzurePat(parseAzureProjectUrl(defaultUrl)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<AzureFetchResult | null>(null)
  const saved = store.state.azureWorkItems ?? []
  const [filter, setFilter] = useState('')
  const items = preview?.items ?? saved
  let config: AzureConfig | null
  try { config = { ...parseAzureProjectUrl(projectUrl), team, includeProjectEpics } } catch { config = null }
  const shown = items.filter((item) => `${item.id} ${item.title} ${item.workItemType} ${item.state}`.toLowerCase().includes(filter.toLowerCase()))
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.workItemType || 'Unknown', (counts.get(item.workItemType || 'Unknown') ?? 0) + 1)

  async function fetchPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setPreview(null); setBusy(true)
    const token = pat
    try {
      const config = parseAzureProjectUrl(projectUrl)
      saveAzurePat(config, token)
      const result = await fetchAzureWorkItems({ ...config, team: team.trim() || config.team, includeProjectEpics }, token)
      setPreview(result)
      setMessage(`${result.items.length} work items fetched. Review the preview, then save it to the app.`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to fetch Azure DevOps data.') }
    finally { setBusy(false) }
  }

  function rememberPat(value = pat) {
    if (!config) { setError('Enter a valid Azure DevOps project URL first.'); return }
    saveAzurePat(config, value); setPat(value.trim()); setMessage('PAT saved on this browser for this organization and project.'); setError('')
  }

  function forgetPat() {
    if (config) forgetAzurePat(config)
    setPat(''); setMessage('Saved PAT removed from this browser. The token itself has not been revoked in Azure DevOps.'); setError('')
  }

  function featureCreated(items: AzureWorkItem[]) {
    setPreview((current) => current ? { ...current, items: mergeAzureWorkItems(current.items, items) } : current)
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems(draft.azureWorkItems ?? [], items)
      const feature = items.find((item) => item.workItemType === 'Feature')
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Save verified hierarchy', entity: 'AzureDevOps Feature', entityId: String(feature?.id ?? ''), detail: `${items.length} verified source records saved for Feature #${feature?.id ?? 'unknown'}. Check the operation result for completion status.` })
      return draft
    })
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

  return <section className="content"><Heading eyebrow="SOURCE CONNECTION" title="Azure DevOps" detail="Browse Epic hierarchies, filter states and create Features under a selected Epic." />
    <Panel className="connection-panel"><div className="panel-heading"><div><h2>Connect work-item data</h2><p className="muted">Fetch the team's configured area paths and work items, including Epics, Features and Bugs. Preview before saving.</p></div><Pill tone={busy ? 'info' : saved.length ? 'open' : 'neutral'}>{busy ? 'Fetching…' : saved.length ? 'Saved data available' : 'Not connected'}</Pill></div>
      <form className="azure-form" onSubmit={fetchPreview}>
        <label>Azure DevOps project or backlog URL<input type="url" required disabled={busy} value={projectUrl} onChange={(event) => { const next = event.target.value; setProjectUrl(next); setPreview(null); try { setPat(loadAzurePat(parseAzureProjectUrl(next))) } catch { setPat('') } }} /></label>
        <div className="form-row"><label>Team<input required disabled={busy} value={team} onChange={(event) => { setTeam(event.target.value); setPreview(null) }} /></label><label>Personal access token<input type="password" required autoComplete="off" disabled={busy} value={pat} onChange={(event) => setPat(event.target.value)} placeholder="Configure once on this browser" /></label></div>
        <div className="button-row"><button type="button" className="ghost" disabled={busy || !pat.trim()} onClick={() => { try { rememberPat() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save the PAT.') } }}>Save PAT on this browser</button><button type="button" className="ghost" disabled={busy} onClick={forgetPat}>Forget PAT</button></div>
        <label className="checkbox-label"><input type="checkbox" disabled={busy} checked={includeProjectEpics} onChange={(event) => { setIncludeProjectEpics(event.target.checked); setPreview(null) }} />Include all accessible project Epics (children are fetched from the selected team scope)</label>
        <div className="button-row"><button className="primary" disabled={busy}>{busy ? 'Fetching team work items…' : 'Fetch preview'}</button>{preview && <><button type="button" className="primary" disabled={!preview.items.length} onClick={savePreview}>Save {preview.items.length} work items</button><button type="button" className="ghost" onClick={() => { setPreview(null); setMessage('Preview discarded. Previously saved work items are unchanged.') }}>Discard preview</button></>}</div>
      </form>
      <p className="muted">Use Work Items → Read &amp; Write for creation. The PAT is saved separately in this browser profile for reuse, excluded from app backups, SharePoint sync and GitHub. Anyone with access to this profile can use it. Forget PAT removes the saved copy.</p>
      {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice" role="status">{message}</div>}
    </Panel>
    {config && <Panel className="connection-panel"><AzureWorkItemTree items={items} config={config} onCreated={featureCreated} savedPat={pat} onSavePat={rememberPat} /></Panel>}
    <details className="source-details"><summary>Source details and dates ({items.length} items)</summary>
    <Panel className="connection-panel"><div className="panel-heading"><div><h2>{preview ? 'Work-item preview' : 'Saved Azure DevOps work items'}</h2><p className="muted">{items.length} items · {preview ? `Scope: ${preview.areaPaths.join(', ')}` : 'Fetch again to refresh source data.'}</p></div><input aria-label="Search Azure work items" className="search" placeholder="Search ID, title, type or state" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
      <div className="button-row">{[...counts].map(([type, count]) => <Pill key={type} tone="info">{type}: {count}</Pill>)}</div>
      <p className="muted">Release counts, custom milestones and YoY closure trends need confirmed field mapping. Missing target/closure dates stay blank. Items no longer returned remain in saved history until reviewed.</p>
      {shown.length > 0 ? <div className="azure-table"><table><thead><tr><th>ID / Title</th><th>Type / State</th><th>Assigned to</th><th>Iteration / Parent</th><th>Target / Closed</th><th>Last fetched</th></tr></thead><tbody>{shown.slice(0, 100).map((item) => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a><strong>{item.title}</strong></td><td>{item.workItemType}<small>{item.state}</small></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.iterationPath}<small>{item.parentId ? `Parent #${item.parentId}` : 'No parent supplied'}</small></td><td>{item.targetDate?.slice(0, 10) ?? 'No target date'}<small>{item.closedDate?.slice(0, 10) ?? 'No closed date'}</small></td><td>{new Date(item.syncedAt).toLocaleString()}</td></tr>)}</tbody></table><p className="muted">Showing {Math.min(shown.length, 100)} of {shown.length} matching work items.</p></div> : <p className="empty-state">{items.length ? 'No matching work items.' : 'No Azure DevOps work items loaded yet.'}</p>}
    </Panel>
    </details>
  </section>
}
