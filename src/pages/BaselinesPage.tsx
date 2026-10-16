import { useState } from 'react'
import { Heading, Panel, Pill } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights } from '../azureInsights'

const value = (number: number | null) => number == null ? '—' : Number(number.toFixed(2)).toLocaleString()
export function BaselinesPage({ azure, month }: { azure: AzureWorkspace; month: string }) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const data = azureInsights(azure.items, month, today)
  return <section className="content"><Heading eyebrow="AZURE DEVOPS" title="Plan comparison" detail="Original Estimate is the current source-plan value; no separate local baseline is applied." />
    <Panel className="table-panel"><table><thead><tr><th>Epic</th><th>Time Writing story</th><th>Original Estimate</th><th>Completed Work</th><th>Variance</th><th>Signal</th></tr></thead><tbody>{data.epicBreakdown.flatMap(group => group.stories.map(story => { const variance = story.originalEstimate == null || story.completedWork == null ? null : story.completedWork - story.originalEstimate; const flagged = story.originalEstimate != null && story.originalEstimate > 0 && story.completedWork != null && story.completedWork > story.originalEstimate * 1.25; return <tr key={story.key}><td>{group.epic?.title ?? 'No Epic path'}</td><td><a href={story.url} target="_blank" rel="noreferrer">#{story.id} {story.title}</a></td><td>{value(story.originalEstimate ?? null)}</td><td>{value(story.completedWork ?? null)}</td><td>{value(variance)}</td><td><Pill tone={flagged ? 'warning' : 'neutral'}>{flagged ? '>25%' : '—'}</Pill></td></tr> }))}</tbody></table>{!data.storiesForMonth.length && <p className="empty-state">No selected-month Time Writing data.</p>}</Panel>
  </section>
}
