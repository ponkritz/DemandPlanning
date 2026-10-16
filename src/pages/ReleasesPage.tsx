import { Heading, Panel, Pill } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights, indiaMonth } from '../azureInsights'

export function ReleasesPage({ azure, month }: { azure: AzureWorkspace; month: string }) {
  const data = azureInsights(azure.items, month, new Date().toISOString().slice(0, 10))
  const features = data.features.filter(item => indiaMonth(item.closedDate) === month || item.targetDate?.startsWith(month))
  return <section className="content"><Heading eyebrow="AZURE DEVOPS" title="Feature milestones" detail="Feature dates and states from the same Azure backlog source." />
    <div className="metric-grid compact"><article><span>Features</span><strong>{features.length}</strong><small>Targeted or closed in {month}</small></article><article><span>Closed</span><strong>{data.closures.length}</strong><small>Closed/Done/Completed</small></article><article><span>Overdue</span><strong>{data.overdue.filter(item => item.workItemType === 'Feature').length}</strong><small>Open with elapsed target</small></article></div>
    <Panel className="table-panel"><table><thead><tr><th>Feature</th><th>State</th><th>Assigned to</th><th>Target date</th><th>Closed date</th><th>Iteration</th></tr></thead><tbody>{features.map(item => <tr key={item.key}><td><a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a></td><td><Pill tone="info">{item.state}</Pill></td><td>{item.assignedTo || 'Unassigned'}</td><td>{item.targetDate?.slice(0,10) ?? '—'}</td><td>{item.closedDate?.slice(0,10) ?? '—'}</td><td>{item.iterationPath || '—'}</td></tr>)}</tbody></table>{!features.length && <p className="empty-state">No Feature dates match {month}.</p>}</Panel>
  </section>
}
