import { useState } from 'react'
import { Heading, Panel, Pill } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights } from '../azureInsights'

const value = (number: number | null) => number == null ? '—' : Number(number.toFixed(2)).toLocaleString()
export function MonthlyPage({ azure, month }: { azure: AzureWorkspace; month: string }) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const data = azureInsights(azure.items, month, today)
  return <section className="content"><Heading eyebrow="AZURE DEVOPS" title="Monthly Time Writing" detail={`Time Writing stories selected by their ${month} child task.`} />
    <div className="metric-grid compact"><article><span>Stories</span><strong>{data.storiesForMonth.length}</strong><small>Matched to selected month</small></article><article><span>Plan</span><strong>{value(data.plan.value)}</strong><small>Story Original Estimate</small></article><article><span>Actual</span><strong>{value(data.actual.value)}</strong><small>Story Completed Work</small></article><article><span>Month tasks</span><strong>{data.monthlyTasks.length}</strong><small>Month-named child tasks</small></article></div>
    <Panel className="table-panel"><table><thead><tr><th>Epic</th><th>Time Writing story</th><th>State</th><th>Plan</th><th>Actual</th><th>Month tasks</th></tr></thead><tbody>{data.epicBreakdown.flatMap(group => group.stories.map(story => <tr key={story.key}><td>{group.epic ? <a href={group.epic.url} target="_blank" rel="noreferrer">#{group.epic.id} {group.epic.title}</a> : 'No Epic path'}</td><td><a href={story.url} target="_blank" rel="noreferrer">#{story.id} {story.title}</a></td><td><Pill tone="info">{story.state}</Pill></td><td>{value(story.originalEstimate ?? null)}</td><td>{value(story.completedWork ?? null)}</td><td>{data.monthlyTasks.filter(task => task.parentId === story.id).length}</td></tr>))}</tbody></table>{!data.storiesForMonth.length && <p className="empty-state">No Time Writing stories have a child task named for {month}.</p>}</Panel>
  </section>
}
