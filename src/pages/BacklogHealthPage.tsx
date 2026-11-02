import { useEffect, useState, type ReactNode } from 'react'
import { DataTable } from '../components/DataTable'
import { EmptyState, Metric, Metrics, Notice, Page, Pill, TablePanel, type Tone } from '../components/ui'
import { readAzureIterations, type AzureIteration } from '../azureDevOps'
import { defaultHealthColumns, descriptionText, featuresWithoutDoD, healthColumnLabel, healthColumns, healthCsv, healthValue, hierarchyOf, normalizeHealthColumns, olderSprintItems, peopleOf, sprintEnd, unassignedItems, type HealthColumn, type HealthList } from '../backlogHealth'
import { PersonPicker } from '../components/PersonPicker'
import { downloadCsv } from '../download'
import { formatDate, todayIso } from '../format'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { capacityContext } from '../capacity'
import type { PageProps } from './types'

type List = HealthList
// Chosen columns per tab, in this browser.
const columnsKey = (list: List) => `demand-planning-health-columns:${list}`
const loadColumns = (list: List) => { try { const saved = localStorage.getItem(columnsKey(list)); return normalizeHealthColumns(saved ? JSON.parse(saved) : null, list) } catch { return [...defaultHealthColumns[list]] } }
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
  const [person, setPerson] = useState('')
  const [iteration, setIteration] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  // The list's own columns (chosen before the table default) start shown; the table's Columns list changes them now.
  const [columnsByList] = useState<Record<List, HealthColumn[]>>(() => ({ sprints: loadColumns('sprints'), dod: loadColumns('dod'), unassigned: loadColumns('unassigned') }))
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
  // Person filter: Assigned To, or for unassigned work Created By / Updated By ('' = everyone).
  const unassigned = list === 'unassigned'
  const people = [...new Set(rows[list].flatMap((item) => peopleOf(item, unassigned)))].sort((a, b) => a.localeCompare(b))
  const who = people.includes(person) ? person : ''
  // Iteration filter: the iteration paths of the tab's rows ('' = all).
  const iterationPaths = [...new Set(rows[list].map((item) => item.iterationPath))].sort((a, b) => a.localeCompare(b))
  const sprint = iterationPaths.includes(iteration) ? iteration : ''
  // State filter: the states of the tab's rows ('' = all).
  const states = [...new Set(rows[list].map((item) => item.state))].sort((a, b) => a.localeCompare(b))
  const inState = states.includes(stateFilter) ? stateFilter : ''
  const shown = rows[list].filter((item) => shownTypes.includes(item.workItemType) && (!who || peopleOf(item, unassigned).includes(who)) && (!sprint || item.iterationPath === sprint) && (!inState || item.state === inState) && (!text || `${item.id} ${item.title} ${item.assignedTo} ${item.iterationPath}`.toLowerCase().includes(text)))
  const byId = new Map(azure.items.map((item) => [item.id, item]))
  const current = lists.find((entry) => entry.key === list)!
  const columns = columnsByList[list]
  // One cell: links for the item and its parents, short paths, state pills, local dates, plain-text descriptions.
  function cell(column: HealthColumn, item: AzureWorkItem): ReactNode {
    const none = <span className="muted">—</span>
    const link = (entry?: AzureWorkItem) => entry ? <a href={entry.url} target="_blank" rel="noreferrer">#{entry.id} {entry.title}</a> : none
    switch (column) {
      case 'id': return <a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a>
      case 'areaPath': case 'iterationPath': return shortPath(item[column]) || none
      case 'state': return <Pill tone={stateTone(item.state)}>{item.state}</Pill>
      case 'assignedTo': return item.assignedTo || <span className="muted">Unassigned</span>
      case 'createdDate': case 'changedDate': return item[column] ? formatDate(item[column]) : none
      case 'sprintEnd': { const end = sprintEnd(item, dated); return end ? <>{end}<small>{end < todayIso() ? 'ended' : 'ends'}</small></> : none }
      case 'parent': return item.parentId != null ? byId.get(item.parentId) ? link(byId.get(item.parentId)) : `#${item.parentId}` : none
      case 'epic': return link(hierarchyOf(item, byId).Epic)
      case 'feature': return link(hierarchyOf(item, byId).Feature)
      case 'story': return link(hierarchyOf(item, byId)['User Story'])
      case 'description': { const text = descriptionText(item); return text ? <span title={text}>{text.length > 240 ? `${text.slice(0, 240)}…` : text}</span> : <span className="muted">No description</span> }
      default: return healthValue(column, item, byId, dated) || none
    }
  }
  const exportAll = () => downloadCsv(lists.map((entry, index) => { const csv = healthCsv(rows[entry.key], azure.items, dated, entry.label, true); return index ? csv.split('\r\n').slice(1).join('\r\n') : csv }).filter(Boolean).join('\r\n'), `backlog-health-${todayIso()}.csv`)

  if (!azure.items.length) return <Page><EmptyState title="No backlog loaded yet." detail="Fetch the Time Writing (QMS-0025) connection first; this view reads its Features, User Stories and Tasks for everyone." /></Page>
  return <Page>
    <Metrics>
      {lists.map((entry) => <Metric key={entry.key} label={entry.label} value={entry.key === 'sprints' && !iterations ? '—' : rows[entry.key].length} hint={entry.key === 'sprints' ? 'Open Features, Stories and Tasks in Sprints that have ended' : entry.key === 'dod' ? `${openOnly ? 'Open ' : ''}Features whose Description does not mention “DoD”` : 'Open Features, Stories and Tasks without an assignee'} tone={(entry.key !== 'sprints' || iterations) && rows[entry.key].length ? 'negative' : undefined} />)}
    </Metrics>
    <div className="overview-tabs" role="tablist" aria-label="Backlog Health lists">{lists.map((entry) => <button key={entry.key} type="button" role="tab" aria-selected={list === entry.key} className={`backlog-tab${list === entry.key ? ' active' : ''}`} onClick={() => setList(entry.key)}>{entry.label} ({entry.key === 'sprints' && !iterations ? '…' : rows[entry.key].length})</button>)}</div>
    {list !== 'dod' && rows[list].length > 0 && rows[list].every((item) => !item.changedBy) && <Notice tone="info">Created By and Updated By come with the next refresh from Azure DevOps (↻ at the top); data fetched before this build does not have them.</Notice>}
    {list === 'sprints' && !canRead && <Notice tone="warning">Sprint dates are read from Azure DevOps: connect the Time Writing connection with its PAT (sample data has no Sprint dates).</Notice>}
    {list === 'sprints' && iterationError && <Notice tone="error">{iterationError}</Notice>}
    <div className="query-toolbar">
      <input className="search" aria-label="Search the list" placeholder="Search ID, title, person, iteration" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="view-switch" role="group" aria-label="Work item types"><div className="segmented">{types.map((type) => <button key={type} type="button" aria-pressed={shownTypes.includes(type)} onClick={() => setShownTypes((current) => current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type])}>{type}</button>)}</div></div>
      <label className="inline-select">State<select aria-label="State" value={inState} onChange={(event) => setStateFilter(event.target.value)}><option value="">All states</option>{states.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="inline-select">Iteration<select aria-label="Iteration Path" value={sprint} onChange={(event) => setIteration(event.target.value)}><option value="">All iterations</option>{iterationPaths.map((path) => <option key={path} value={path}>{shortPath(path)}</option>)}</select></label>
      <PersonPicker value={who} people={people} onChange={setPerson} meLabel="Everyone" label={unassigned ? 'Created or updated by' : 'Assigned to'} />
      {list === 'dod' && <label className="check"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} />Open Features only</label>}
      <span className="muted">{shown.length} of {rows[list].length}</span>
      <button type="button" className="ghost" onClick={exportAll}>Export all lists</button>
    </div>
    <TablePanel title={current.label} count={`${shown.length} items`} empty={shown.length ? undefined : list === 'sprints' && !iterations ? 'Waiting for the Sprint dates from Azure DevOps.' : 'Nothing here.'}>
      {/* UI-07: each list on the table default — its columns (the list's own first, the others ticked on in Columns), sort, layout and one Export. */}
      <DataTable key={list} id={`health:${list}`} rows={shown} rowKey={(item) => item.key} exportName={`${current.file}-${todayIso()}`} columns={[...columns, ...healthColumns.map((column) => column.id).filter((id) => !columns.includes(id))].map((column) => ({
        id: column, label: healthColumnLabel(column), defaultHidden: !columns.includes(column), fixed: column === 'id', firstSortDesc: column === 'createdDate' || column === 'changedDate',
        value: (item: AzureWorkItem) => column === 'id' ? item.id : column === 'createdDate' ? item.createdDate ?? '' : column === 'changedDate' ? item.changedDate ?? '' : column === 'description' ? descriptionText(item) : healthValue(column, item, byId, dated),
        render: (item: AzureWorkItem) => cell(column, item), className: column === 'description' ? 'description-cell' : undefined,
      }))} />
    </TablePanel>
  </Page>
}
