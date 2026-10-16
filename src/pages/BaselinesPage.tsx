import { useState } from 'react'
import { Heading, Panel, Pill } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights } from '../azureInsights'

const value = (number: number | null) => number == null ? '—' : Number(number.toFixed(2)).toLocaleString()
export function BaselinesPage({ azure, month }: { azure: AzureWorkspace; month: string }) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const data = azureInsights(azure.items, month, today)
  return <section className="content"><Heading eyebrow="AZURE DEVOPS" title="Plan comparison" detail="Original Estimate and Completed Work are read only from the selected month Time Writing Task; no separate local baseline is applied." />
    <Panel className="table-panel"><table><thead><tr><th>Epic</th><th>Time Writing Task</th><th>Original Estimate</th><th>Completed Work</th><th>Variance</th><th>Signal</th></tr></thead><tbody>{data.epicBreakdown.flatMap(group => data.monthlyTasks.filter(task => group.stories.some(story => story.id === task.parentId)).map(task => { const variance = task.originalEstimate == null || task.completedWork == null ? null : task.completedWork - task.originalEstimate; const flagged = task.originalEstimate != null && task.originalEstimate > 0 && task.completedWork != null && task.completedWork > task.originalEstimate * 1.25; return <tr key={task.key}><td>{group.epic?.title ?? 'No Epic path'}</td><td><a href={task.url} target="_blank" rel="noreferrer">#{task.id} {task.title}</a></td><td>{value(task.originalEstimate ?? null)}</td><td>{value(task.completedWork ?? null)}</td><td>{value(variance)}</td><td><Pill tone={flagged ? 'warning' : 'neutral'}>{flagged ? '>25%' : '—'}</Pill></td></tr> }))}</tbody></table>{!data.monthlyTasks.length && <p className="empty-state">No selected-month Time Writing Tasks.</p>}</Panel>
  </section>
}
