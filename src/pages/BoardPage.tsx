import { useState } from 'react'
import { Heading, Panel, Pill } from '../components/ui'
import { AzureWorkItemTree } from '../components/AzureWorkItemTree'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { bulkCreateMonthlyTimeWritingTasks, HierarchyCreationError, monthLabelFromKey } from '../azureDevOps'

export function BoardPage({ azure, month, onOpenConnection }: { azure: AzureWorkspace; month: string; onOpenConnection: () => void }) {
  const { items, config, preview, busy, pat, featureCreated, rememberPat, savePreview, refresh, lastRefreshed, error, needsScopedRefresh } = azure
  const [filter, setFilter] = useState('')
  const [taskMonth, setTaskMonth] = useState(month)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')
  const activeItems = items.filter((item) => item.state.trim().toLowerCase() !== 'removed')
  const shown = activeItems.filter((item) => `${item.id} ${item.title} ${item.workItemType} ${item.state}`.toLowerCase().includes(filter.toLowerCase()))
  const counts = new Map<string, number>()
  for (const item of activeItems) counts.set(item.workItemType || 'Unknown', (counts.get(item.workItemType || 'Unknown') ?? 0) + 1)
  const byId = new Map(activeItems.map(item => [item.id, item]))
  const timeWritingStories = activeItems.filter(item => item.workItemType === 'User Story' && /\s*-\s*time\s*writ(?:ing|ting)\s*$/i.test(item.title) && item.parentId != null && byId.get(item.parentId)?.workItemType === 'Feature' && byId.get(item.parentId)?.state.trim().toLowerCase() === 'active')
  async function addMonthlyTasks() {
    if (!config || bulkBusy) return
    setBulkBusy(true); setBulkMessage('')
    try {
      const tasks = await bulkCreateMonthlyTimeWritingTasks(config, pat, activeItems, monthLabelFromKey(taskMonth), azure.creatorEmail)
      featureCreated(tasks)
      setBulkMessage(`Verified ${tasks.length} Time Writing Task${tasks.length === 1 ? '' : 's'} for ${monthLabelFromKey(taskMonth)}. Existing matching Tasks were retained without duplication.`)
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'Unable to add monthly Time Writing Tasks.'
      if (failure instanceof HierarchyCreationError && failure.createdItems.length) { featureCreated(failure.createdItems); setBulkMessage(`${failure.createdItems.length} Task(s) were created before the operation stopped: ${detail}`) }
      else setBulkMessage(detail)
    } finally { setBulkBusy(false) }
  }

  return <section className="content backlog-page"><Heading eyebrow="WORK ITEM MANAGEMENT" title="Backlogs" detail="Plan and track your team’s work in an expandable backlog." action={<div className="button-row"><button className="primary" disabled={busy || !config || !pat} onClick={() => void refresh()}>{busy ? 'Refreshing…' : 'Refresh from Azure'}</button><button className="ghost" onClick={onOpenConnection}>Connection settings</button></div>} />
    <p className="muted">{lastRefreshed ? `Last successful refresh: ${new Date(lastRefreshed).toLocaleString()}.` : 'Saved data is a snapshot, not a live subscription.'} Refresh reads current source data; Save fetched work items retains it in the app.</p>
    {error && <div className="notice error" role="alert">{error} Previously loaded data has been retained.</div>}
    {busy && <div className="notice" role="status">Fetching work items… Backlogs will update when the preview is ready.</div>}
    {needsScopedRefresh && !preview && <div className="notice">Previous cached work items have no verified scope for this team backlog and are hidden. Refresh from Azure, then save the scoped result to replace the old Azure cache. Other app data is unchanged.</div>}
    {preview && <div className="notice board-preview"><span>Showing {preview.items.length} records from {preview.scope.team}'s Epic backlog hierarchy only. Saving replaces the old Azure cache, including out-of-scope records. Export a JSON backup first if you need that old cache.</span><button className="primary" onClick={savePreview}>Save team backlog — replace Azure cache</button></div>}
    {config && <Panel className="connection-panel"><div className="panel-heading"><div><p className="eyebrow">BULK TIME WRITING</p><h2>Add monthly Tasks</h2><p className="muted">Creates or verifies one Task only for Time Writing User Stories beneath Active Features. Existing matching Tasks are never duplicated.</p></div><div className="button-row"><label>Month<input type="month" value={taskMonth} onChange={event => setTaskMonth(event.target.value)} disabled={bulkBusy} /></label><button className="primary" disabled={bulkBusy || !pat.trim() || !timeWritingStories.length} onClick={() => void addMonthlyTasks()}>{bulkBusy ? 'Adding Tasks…' : `Add ${timeWritingStories.length} Time Writing Tasks`}</button></div></div>{bulkMessage && <div className={bulkMessage.includes('stopped:') ? 'notice error' : 'notice'} role="status">{bulkMessage}</div>}{!timeWritingStories.length && <p className="muted">No Time Writing User Stories under Active Features are currently loaded. Refresh and save the Azure backlog first.</p>}</Panel>}
    {config ? <Panel className="connection-panel backlog-panel"><AzureWorkItemTree items={items} config={config} onCreated={featureCreated} savedPat={pat} creatorEmail={azure.creatorEmail} onSavePat={rememberPat} /></Panel> : <Panel><p>Configure a valid Azure DevOps project to use Backlogs.</p><button className="primary" onClick={onOpenConnection}>Open connection settings</button></Panel>}
    {!items.length && !busy && <div className="notice">No source data loaded yet. <button className="text-button" onClick={onOpenConnection}>Fetch work items from Azure DevOps →</button></div>}
    <details className="source-details"><summary>Source details and dates ({items.length} items)</summary>
      <Panel className="connection-panel"><div className="panel-heading"><div><h2>{preview ? 'Work-item preview' : 'Saved work items'}</h2><p className="muted">{items.length} items · {preview ? `Scope: ${preview.areaPaths.join(', ')}` : 'Refresh source data from connection settings.'}</p></div><input aria-label="Search work-item details" className="search" placeholder="Search ID, title, type or state" value={filter} onChange={(event) => setFilter(event.target.value)} /></div>
        <div className="button-row">{[...counts].map(([type, count]) => <Pill key={type} tone="info">{type}: {count}</Pill>)}</div>
        <p className="muted">Only verified team-backlog records are shown. Missing target/closure dates stay blank. Saving a fresh scoped result replaces the Azure cache; no Azure source records or demand-planning data are deleted.</p>
        {shown.length > 0 ? <div className="azure-table"><table><thead><tr><th>ID / Title</th><th>Type / State</th><th>Assigned to</th><th>Iteration / Parent</th><th>Target / Closed</th><th>Last fetched</th></tr></thead><tbody>{shown.slice(0, 100).map((item) => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a><strong>{item.title}</strong></td><td>{item.workItemType}<small>{item.state}</small></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.iterationPath}<small>{item.parentId ? `Parent #${item.parentId}` : 'No parent supplied'}</small></td><td>{item.targetDate?.slice(0, 10) ?? 'No target date'}<small>{item.closedDate?.slice(0, 10) ?? 'No closed date'}</small></td><td>{new Date(item.syncedAt).toLocaleString()}</td></tr>)}</tbody></table><p className="muted">Showing {Math.min(shown.length, 100)} of {shown.length} matching work items.</p></div> : <p className="empty-state">{items.length ? 'No matching work items.' : 'No work items loaded yet.'}</p>}
      </Panel>
    </details>
  </section>
}
