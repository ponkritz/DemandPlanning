import type { Page } from '../App'
import { useState } from 'react'
import { Panel, Pill } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights } from '../azureInsights'

const value = (number: number | null) => number == null ? '—' : Number(number.toFixed(2)).toLocaleString()
export function DashboardPage({ month, azure, navigate }: { month: string; azure: AzureWorkspace; navigate: (page: Page) => void }) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const data = azureInsights(azure.items, month, today)
  return <section className="content">
    <div className="panel-heading"><div><h2>Demand overview</h2><p className="muted">{month} · {azure.config?.team ?? 'Azure DevOps'} backlog</p></div><div className="button-row"><button className="primary" disabled={azure.busy || !azure.config || !azure.pat.trim()} onClick={() => void azure.refresh()}>{azure.busy ? 'Refreshing…' : 'Refresh'}</button><button className="ghost" onClick={() => navigate('board')}>Backlogs</button></div></div>
    {azure.preview && <div className="notice">Fetched {azure.preview.items.length} records. <button className="text-button" onClick={azure.savePreview}>Save to app</button></div>}
    {!data.items.length && <div className="notice">No Azure backlog data available. Configure Azure DevOps and refresh.</div>}
    <div className="metric-grid compact"><article><span>Plan</span><strong>{value(data.plan.value)}</strong><small>Original Estimate · {data.plan.count}/{data.plan.total}</small></article><article><span>Actual</span><strong>{value(data.actual.value)}</strong><small>Completed Work · {data.actual.count}/{data.actual.total}</small></article><article><span>NPRA hours</span><strong>{value(data.npra.value)}</strong><small>{data.npra.count}/{data.npra.total} tagged Features</small></article><article><span>Utilization</span><strong>{data.utilization == null ? '—' : `${data.utilization.toFixed(1)}%`}</strong><small>{data.workingDays} working days · {data.capacity}h base</small></article></div>
    <div className="dashboard-grid">
      <Panel className="table-panel"><div className="panel-heading"><div><h2>Plan vs Actual by Epic</h2><p className="muted">Only stories with a “{monthName(month)} | …” child task.</p></div><Pill tone="info">{data.storiesForMonth.length} stories</Pill></div><table><thead><tr><th>Epic</th><th>Stories</th><th>Month tasks</th><th>Plan</th><th>Actual</th><th>NPRA</th></tr></thead><tbody>{data.epicBreakdown.map(group => <tr key={group.epic?.key ?? 'unmapped'}><td>{group.epic ? <a href={group.epic.url} target="_blank" rel="noreferrer">#{group.epic.id} {group.epic.title}</a> : 'No Epic path'}</td><td>{group.stories.length}</td><td>{group.tasks}</td><td>{value(group.plan.value)}</td><td>{value(group.actual.value)}</td><td>{value(group.npra.value)}</td></tr>)}</tbody></table>{!data.epicBreakdown.length && <p className="empty-state">No Time Writing entries for this month.</p>}</Panel>
      <Panel><h2>Utilization basis</h2><p>{data.workingDays} weekdays × 8h = {data.dayCapacity}h per assigned resource.</p><p>{data.resources.length} assigned resources · {value(data.npra.value)} NPRA hours · {data.available}h adjusted capacity.</p><p>Formula: base capacity ÷ (base capacity − NPRA hours) × 100.</p>{data.unassignedNpRA.length > 0 && <p className="notice">{data.unassignedNpRA.length} NPRA Feature(s) are unassigned; included in total but cannot be allocated to a person.</p>}<button className="text-button" onClick={() => navigate('monthly')}>Open monthly detail →</button></Panel>
    </div>
  </section>
}
function monthName(month: string) { return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`)) }
