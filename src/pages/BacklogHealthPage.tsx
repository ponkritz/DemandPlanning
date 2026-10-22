import { useEffect, useState } from 'react'
import { EmptyState, Metric, Metrics, Notice, Page, Pill, TablePanel, type Tone } from '../components/ui'
import { readAzureIterations, type AzureIteration } from '../azureDevOps'
import { featuresWithoutDoD, hierarchyOf, olderSprintItems, healthCsv, sprintEnd, unassignedCsv, unassignedItems } from '../backlogHealth'
import { downloadCsv } from '../download'
import { formatDate, todayIso } from '../format'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { capacityContext } from '../capacity'
import type { PageProps } from './types'

type List = 'sprints' | 'dod' | 'unassigned'
const lists: { key: List; label: string; file: string }[] = [
  { key: 'sprints', label: 'In older Sprints', file: 'older-sprints' },
  { key: 'dod', label: 'Features without DoD', file: 'features-without-dod' },
  { key: 'unassigned', label: 'Unassigned', file: 'unassigned' },
]
const types = ['Feature', 'User Story', 'Task'] as const
const stateTone = (state: string): Tone => /new|proposed|to do/i.test(state) ? 'info' : /active|in progress|committed|doing/i.test(state) ? 'open' : 'neutral'
const shortPath = (path: string) => path.split('\\').slice(1).join(' › ') || path

// Backlog Health: what the Scrum Master needs from the Time Writing backlog, for everyone: open Features, User Stories and Tasks left in Sprints
// that have ended, Features whose Description has no DoD, and open work nobody is assigned to; each list as CSV.
export function BacklogHealthPage({ azure, store }: { azure: AzureWorkspace; store: PageProps['store'] }) {
  const { config, pat } = azure
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  const [iterations, setIterations] = useState<AzureIteration[] | null>(null)
  const [iterationError, setIterationError] = useState('')
  const [list, setList] = useState<List>('sprints')
  const [shownTypes, setShownTypes] = useState<string[]>([...types])
  const [search, setSearch] = useState('')
  const [openOnly, setOpenOnly] = useState(true)
  const canRead = Boolean(config && pat.trim() && !azure.isSample)
  // Sprint dates come from the team's iterations in Azure DevOps (read once per visit).
  useEffect(() => {
    if (!canRead || !config) return
    let active = true
    readAzureIterations(config, pat).then((all) => { if (active) { setIterations(all); setIterationError('') } }, (failure) => { if (active) setIterationError(failure instanceof Error ? failure.message : 'Could not read the Sprint dates.') })
    return () => { active = false }
  }, [canRead, config, pat])
  const dated = iterations ?? []
  const rows: Record<List, AzureWorkItem[]> = { sprints: olderSprintItems(azure.items, dated, undefined, absenceEpicId), dod: featuresWithoutDoD(azure.items, openOnly, absenceEpicId), unassigned: unassignedItems(azure.items, absenceEpicId) }
  const text = search.trim().toLowerCase()
  const shown = rows[list].filter((item) => shownTypes.includes(item.workItemType) && (!text || `${item.id} ${item.title} ${item.assignedTo} ${item.iterationPath}`.toLowerCase().includes(text)))
  const byId = new Map(azure.items.map((item) => [item.id, item]))
  const current = lists.find((entry) => entry.key === list)!
  const exportList = () => downloadCsv(list === 'unassigned' ? unassignedCsv(shown, azure.items) : healthCsv(shown, azure.items, dated), `${current.file}-${todayIso()}.csv`)
  const exportAll = () => downloadCsv(lists.map((entry, index) => { const csv = healthCsv(rows[entry.key], azure.items, dated, entry.label); return index ? csv.split('\r\n').slice(1).join('\r\n') : csv }).filter(Boolean).join('\r\n'), `backlog-health-${todayIso()}.csv`)

  if (!azure.items.length) return <Page><EmptyState title="No backlog loaded yet." detail="Fetch the Time Writing (QMS-0025) connection first; this view reads its Features, User Stories and Tasks for everyone." /></Page>
  return <Page>
    <Metrics>
      {lists.map((entry) => <Metric key={entry.key} label={entry.label} value={entry.key === 'sprints' && !iterations ? '—' : rows[entry.key].length} hint={entry.key === 'sprints' ? 'Open Features, Stories and Tasks in Sprints that have ended' : entry.key === 'dod' ? `${openOnly ? 'Open ' : ''}Features whose Description does not mention “DoD”` : 'Open Features, Stories and Tasks without an assignee'} tone={(entry.key !== 'sprints' || iterations) && rows[entry.key].length ? 'negative' : undefined} />)}
    </Metrics>
    <div className="overview-tabs" role="tablist" aria-label="Backlog Health lists">{lists.map((entry) => <button key={entry.key} type="button" role="tab" aria-selected={list === entry.key} className={`backlog-tab${list === entry.key ? ' active' : ''}`} onClick={() => setList(entry.key)}>{entry.label} ({entry.key === 'sprints' && !iterations ? '…' : rows[entry.key].length})</button>)}</div>
    {list === 'unassigned' && rows.unassigned.length > 0 && rows.unassigned.every((item) => !item.createdBy) && <Notice tone="info">Created By comes with the next refresh from Azure DevOps (↻ at the top); data fetched before this build does not have it.</Notice>}
    {list === 'sprints' && !canRead && <Notice tone="warning">Sprint dates are read from Azure DevOps: connect the Time Writing connection with its PAT (sample data has no Sprint dates).</Notice>}
    {list === 'sprints' && iterationError && <Notice tone="error">{iterationError}</Notice>}
    <div className="query-toolbar">
      <input className="search" aria-label="Search the list" placeholder="Search ID, title, person, iteration" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="view-switch" role="group" aria-label="Work item types"><div className="segmented">{types.map((type) => <button key={type} type="button" aria-pressed={shownTypes.includes(type)} onClick={() => setShownTypes((current) => current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type])}>{type}</button>)}</div></div>
      {list === 'dod' && <label className="check"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />Open Features only</label>}
      <span className="muted">{shown.length} of {rows[list].length}</span>
      <button type="button" className="ghost" disabled={!shown.length} onClick={exportList}>Export CSV</button>
      <button type="button" className="ghost" onClick={exportAll}>Export all lists</button>
    </div>
    <TablePanel title={current.label} count={`${shown.length} items`} empty={shown.length ? undefined : list === 'sprints' && !iterations ? 'Waiting for the Sprint dates from Azure DevOps.' : 'Nothing here.'}>
      {list === 'unassigned' ? <table><thead><tr><th>Epic</th><th>Feature</th><th>User Story</th><th>Task</th><th>Area Path</th><th>Iteration Path</th><th>State</th><th>Created By</th><th>Created On</th></tr></thead><tbody>{shown.map((item) => {
        const level = hierarchyOf(item, byId), cell = (item?: AzureWorkItem) => item ? <a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a> : <span className="muted">—</span>
        return <tr key={item.key}>
          <td>{cell(level.Epic)}</td><td>{cell(level.Feature)}</td><td>{cell(level['User Story'])}</td><td>{cell(level.Task)}</td>
          <td>{shortPath(item.areaPath)}</td><td>{shortPath(item.iterationPath)}</td>
          <td><Pill tone={stateTone(item.state)}>{item.state}</Pill></td>
          <td>{item.createdBy || <span className="muted">—</span>}</td><td>{item.createdDate ? formatDate(item.createdDate) : <span className="muted">—</span>}</td>
        </tr>
      })}</tbody></table>
      : <table><thead><tr><th>Work item</th><th>Type</th><th>State</th><th>Assigned to</th><th>Iteration</th><th>Parent</th></tr></thead><tbody>{shown.map((item) => {
        const parent = item.parentId != null ? byId.get(item.parentId) : undefined, end = sprintEnd(item, dated)
        return <tr key={item.key}>
          <td><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a></td>
          <td>{item.workItemType}</td>
          <td><Pill tone={stateTone(item.state)}>{item.state}</Pill></td>
          <td>{item.assignedTo || <span className="muted">Unassigned</span>}</td>
          <td>{shortPath(item.iterationPath)}{end && <small>{end < todayIso() ? 'ended' : 'ends'} {end}</small>}</td>
          <td>{parent ? <a href={parent.url} target="_blank" rel="noreferrer">#{parent.id} {parent.title}</a> : item.parentId != null ? `#${item.parentId}` : '—'}</td>
        </tr>
      })}</tbody></table>}
    </TablePanel>
  </Page>
}
