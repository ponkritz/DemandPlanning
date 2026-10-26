import type { FeatureSetups } from '../featureSetup'
import { useState } from 'react'
import { EmptyState, Page, Panel, Pill, Info } from '../components/ui'
import { AzureWorkItemTree } from '../components/AzureWorkItemTree'
import { QueryView } from '../components/QueryView'
import { ReleaseView } from '../components/ReleaseView'
import { DpMonthCounts } from '../components/DpMonthCounts'
import { useDpBoardColumn } from '../useDpBoardColumn'
import type { AzureWorkItem } from '../domain'
import { ddtMonthOf, dpMilestoneNames, dpMilestones } from '../dpMilestones'
import { formatDate, formatDateTime, monthName } from '../format'
import { approvalDateFrom, viewMonthOf } from '../releaseSource'
import { viewSource } from '../viewSources'
import { listAzureConnectionProfiles } from '../azureCredentials'
import { connectionConfig, type AzureWorkspace } from '../useAzureWorkspace'
import { loadAzureConnectionProfile } from '../azureCredentials'
import type { BacklogView } from '../backlogViews'
import type { AzureConfig } from '../azureDevOps'
import type { PageProps } from './types'
import type { GitStorage } from '../useGitStorage'
import { columnName, queryLayout, type QueryColumn, type QueryOrder } from '../queryView'
import { defaultMatchThreshold, streamOfProfile } from '../streams'
import { normalizeReleaseSourceSettings } from '../releaseSource'

// One page for all configured Azure DevOps views (each its own entry in the sidebar): the Time Writing backlog
// (QMS-0025) as an editable tree, and every other shown connection as a read-only query view.
export function BoardPage({ azure, store, current, month, git, onOpenConnection, assign, featureSetup }: { azure: AzureWorkspace; store: PageProps['store']; current: BacklogView; month: string; git?: GitStorage; onOpenConnection: () => void; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null }) {
  const { items, config, preview, pat, featureCreated, rememberPat } = azure
  const [filter, setFilter] = useState('')
  if (current.readOnly) return <ReadOnlyView key={current.id} id={current.id} name={current.name} role={current.role} azure={azure} store={store} month={month} gitNote={git?.snapshotNotes[current.id]} onOpenConnection={onOpenConnection} assign={assign} featureSetup={featureSetup} />
  const activeItems = items.filter((item) => item.state.trim().toLowerCase() !== 'removed')
  const shown = activeItems.filter((item) => `${item.id} ${item.title} ${item.workItemType} ${item.state}`.toLowerCase().includes(filter.toLowerCase()))
  const counts = new Map<string, number>()
  for (const item of activeItems) counts.set(item.workItemType || 'Unknown', (counts.get(item.workItemType || 'Unknown') ?? 0) + 1)

  return <Page className="backlog-page">
    {config ? <Panel className="connection-panel backlog-panel"><AzureWorkItemTree items={items} config={config} tabs={<div className="backlog-tab">{current.name}</div>} onCreated={featureCreated} savedPat={pat} creatorEmail={azure.creatorEmail} onSavePat={rememberPat} assign={assign} featureSetup={featureSetup} /></Panel> : <Panel><EmptyState title="Configure a valid Azure DevOps project to use Backlogs." /><button className="primary" onClick={onOpenConnection}>Open connection settings</button></Panel>}
    <details className="source-details"><summary>Source details and dates ({items.length} items)</summary>
      <Panel className="connection-panel" title={preview ? 'Work-item preview' : 'Saved work items'} detail={`${items.length} items · ${preview ? `Scope: ${preview.areaPaths.join(', ')}` : 'Refresh source data from connection settings.'}`} action={<input aria-label="Search work-item details" className="search" placeholder="Search ID, title, type or state" value={filter} onChange={(event) => setFilter(event.target.value)} />}>
        <div className="button-row">{[...counts].map(([type, count]) => <Pill key={type} tone="info">{type}: {count}</Pill>)}</div>
        <p className="info-line"><Info label="About this list">Only verified team-backlog records are shown. Missing target/closure dates stay blank. Saving a fresh scoped result replaces the Azure cache; no Azure source records or demand-planning data are deleted.</Info></p>
        {shown.length > 0 ? <div className="azure-table"><table><thead><tr><th>ID / Title</th><th>Type / State</th><th>Assigned to</th><th>Iteration / Parent</th><th>Target / Closed</th><th>Last fetched</th></tr></thead><tbody>{shown.slice(0, 100).map((item) => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a><strong>{item.title}</strong></td><td>{item.workItemType}<small>{item.state}</small></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.iterationPath}<small>{item.parentId ? `Parent #${item.parentId}` : 'No parent supplied'}</small></td><td>{formatDate(item.targetDate, 'No target date')}<small>{formatDate(item.closedDate, 'No closed date')}</small></td><td>{formatDateTime(item.syncedAt)}</td></tr>)}</tbody></table><p className="muted">Showing {Math.min(shown.length, 100)} of {shown.length} matching work items.</p></div> : <EmptyState title={items.length ? 'No matching work items.' : 'No work items loaded yet.'} />}
      </Panel>
    </details>
  </Page>
}

// A Backlog view connection: its last fetched snapshot as the same expandable tree, read only.
const noItems: AzureWorkItem[] = []
function ReadOnlyView({ id, name, role, azure, store, month, gitNote, onOpenConnection, assign, featureSetup }: { featureSetup?: FeatureSetups | null; id: string; name: string; role: BacklogView['role']; azure: AzureWorkspace; store: PageProps['store']; month: string; gitNote?: { tone: string; text: string }; onOpenConnection: () => void; assign?: { me: string; canChoose: boolean } }) {
  const [allMonths, setAllMonths] = useState(false)
  // Every connection's fetch is stored on its own (by connection ID).
  const status = azure.connectionStatus[id]
  const profile = loadAzureConnectionProfile(id)
  const source = viewSource(store.state, id, role, profile?.query, listAzureConnectionProfiles().filter((entry) => entry.role === 'release-source').length)
  // A default stream (DP, CP, IOCC, …) reads its releases with its own rule; DP and IOCC match Features fuzzily.
  const stream = profile ? streamOfProfile({ viewName: profile.viewName, reason: profile.reason, role }) : undefined
  const threshold = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).matchThreshold ?? defaultMatchThreshold
  let config: AzureConfig | null = null
  try { config = profile ? connectionConfig(profile) : null } catch { config = null }
  const busy = status?.state === 'busy'
  // Columns saved with the fetch; a snapshot fetched before columns were stored, or with another query than the
  // connection has now, shows the current query's columns until a refresh loads their values.
  const current = profile?.query ? queryLayout(profile.query) : null
  const stale = Boolean(source && current && (!source.columns?.length || source.query.trim() !== profile!.query!.trim()))
  const columns: QueryColumn[] | undefined = stale && current ? current.columns.map((ref) => ({ ref, name: columnName(ref) })) : source?.columns
  const orderBy: QueryOrder[] | undefined = stale && current ? current.orderBy : source?.orderBy
  // Month filter (header month picker): items approved in the month, else changed in it; "All months" turns it off.
  // DP: the month is the DDT Date's (dpMilestones); other views: Author Approval Date, else Changed Date.
  const isDp = stream?.rule === 'dp'
  const items = source ? allMonths ? source.items : source.items.filter((item) => (isDp ? ddtMonthOf(item) : viewMonthOf(item)) === month) : noItems
  // DP rows matched to the QMS-0025 board (Feature / User Story by SourceProgram + Title), with Create Feature.
  const boardColumn = useDpBoardColumn(isDp ? items : noItems, azure, threshold, assign, featureSetup)
  // Items without an approval date fall back to their Changed Date for the month filter; say how many.
  const undated = source ? source.items.filter((item) => isDp ? !ddtMonthOf(item) : !(item.approvalDate ?? approvalDateFrom(item.fields ?? {}))).length : 0
  // On-prem views with Git storage: Load from Git too; a fetch that cannot run falls back to it.
  const refresh = <span className="button-row"><button className="primary" disabled={busy} onClick={() => void azure.fetchConnection(id)}>{busy ? (status?.message || 'Fetching…') : source ? 'Refresh from Azure' : 'Fetch from Azure'}</button>{azure.canLoadFromGit(id) && <button className="ghost" disabled={busy} onClick={() => void azure.loadFromGit(id)}>Load from Git</button>}</span>
  // Information about the view sits behind the ⓘ next to its name, not as banners; only errors and warnings stay on the page.
  const notes = [
    source && isDp ? `Month filter: by DDT Date in your time zone.${undated > 0 ? ` ${undated} of ${source.items.length} releases have no DDT Date and show only with “All months”.` : ''}` : '',
    source && !isDp && undated > 0 ? `Month filter: by Author Approval Date in your time zone. ${undated} of ${source.items.length} items have no approval date${role === 'release-source' ? '' : ' in the query’s columns'}, so their Changed Date is used.` : '',
    isDp ? dpMilestones.map(([milestone]) => `${dpMilestoneNames[milestone].short} = ${dpMilestoneNames[milestone].long} (${milestone})`).join(' · ') : '',
    status?.state === 'ok' && status.message.includes('Git') ? status.message : '',
    !azure.isSample && gitNote && gitNote.tone !== 'error' ? gitNote.text : '',
  ].filter(Boolean)
  return <Page className="backlog-page">
    <Panel className="connection-panel backlog-panel">
      <div className="view-source-bar"><div><strong>{name}</strong><span className="muted"> · {config ? `${config.organization} / ${config.project}` : 'connection not found'}{source ? ` · ${allMonths ? source.items.length : `${items.length} of ${source.items.length}`} items${allMonths ? '' : ` in ${monthName(month)}`} · fetched ${formatDateTime(source.fetchedAt)}${'fromGit' in source && source.fromGit ? ' (desktop app, via Git)' : ''}` : ''}</span>{profile?.query ? <small className="muted"> · query</small> : config?.team ? <small className="muted"> · team {config.team}</small> : null}{notes.length > 0 && <Info>{notes.map((note) => <p key={note}>{note}</p>)}</Info>}</div><div className="button-row">{source && <label className="check"><input type="checkbox" checked={allMonths} onChange={(event) => setAllMonths(event.target.checked)} />All months</label>}{refresh}<button className="ghost" onClick={onOpenConnection}>Connection settings</button></div></div>
      {status?.state === 'error' && <div className="notice error" role="alert">{status.message}</div>}
      {!azure.isSample && gitNote?.tone === 'error' && <div className="notice error" role="alert">{gitNote.text}</div>}
      {stale && !busy && <div className="notice warning" role="status">The saved data was fetched with different columns than the connection's query now has. Refresh from Azure to load every column's values.</div>}
      {source && config && !items.length && source.items.length ? isDp ? <><DpMonthCounts items={source.items} month={month} /><EmptyState title={`No release has its DDT Date in ${monthName(month)}.`} detail="Pick another month in the header, or tick “All months”. The counts above still include milestones Done in the month." /></> : <EmptyState title={`No items in ${monthName(month)}.`} detail={`${source.items.length} items have an approval date (else a changed date) in other months. Pick another month in the header, or tick “All months”.`} />
        : source && config ? isDp ? <><DpMonthCounts items={source.items} month={month} /><QueryView name={name} items={items} columns={columns} orderBy={orderBy} unresolved={stale ? current?.unresolved : source.unresolved} queryOnly choose extra={boardColumn} /></> : role === 'release-source' || stream ? <ReleaseView name={name} items={items} backlog={azure.items} azure={azure} assign={assign} featureSetup={featureSetup} rule={stream?.rule} fuzzy={stream?.fuzzy} threshold={threshold} columns={columns} orderBy={orderBy} unresolved={stale ? current?.unresolved : source.unresolved} /> : <QueryView name={name} items={items} columns={columns} orderBy={orderBy} unresolved={stale ? current?.unresolved : source.unresolved} />
        : <><EmptyState title={config ? `“${name}” has not been fetched yet.` : `The connection for “${name}” is not saved in this browser.`} detail={config ? 'Fetch it read-only; nothing is written to Azure DevOps. Its items stay on this page and are not counted in Overview, Monthly Time Writing or Assigned to Me.' : 'Add it again in Settings → Azure DevOps.'} /></>}
    </Panel>
  </Page>
}
