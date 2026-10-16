import { useMemo, useState } from 'react'
import { Heading, Panel, Pill } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'

export function ActivitiesPage({ azure }: { azure: AzureWorkspace }) {
  const [search, setSearch] = useState('')
  const rows = useMemo(() => azure.items.filter(item => `${item.id} ${item.title} ${item.workItemType} ${item.state}`.toLowerCase().includes(search.toLowerCase())), [azure.items, search])
  return <section className="content"><Heading eyebrow="AZURE DEVOPS" title="Work items" detail="The same selected-team backlog used across the application." />
    <Panel className="table-panel"><div className="panel-heading"><input className="search" placeholder="Search work items" value={search} onChange={event => setSearch(event.target.value)} /><span className="record-count">{rows.length} items</span></div><table><thead><tr><th>Work item</th><th>Type</th><th>State</th><th>Assigned to</th><th>Iteration</th><th>Dates</th></tr></thead><tbody>{rows.slice(0, 200).map(item => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a></td><td>{item.workItemType}</td><td><Pill tone="info">{item.state}</Pill></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.iterationPath || '—'}</td><td>{item.targetDate?.slice(0,10) ?? '—'}<small>{item.closedDate?.slice(0,10) ?? ''}</small></td></tr>)}</tbody></table>{!rows.length && <p className="empty-state">Refresh Azure DevOps to load work items.</p>}</Panel>
  </section>
}
