import { useState } from 'react'
import { Heading, Panel, Pill } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights } from '../azureInsights'

const value = (number: number | null) => number == null ? '—' : Number(number.toFixed(2)).toLocaleString()
export function MonthlyPage({ azure, month }: { azure: AzureWorkspace; month: string }) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [editing, setEditing] = useState<number | null>(null)
  const [plan, setPlan] = useState('')
  const [actual, setActual] = useState('')
  const [saving, setSaving] = useState(false)
  const data = azureInsights(azure.items, month, today)
  const beginEdit = (story: typeof data.storiesForMonth[number]) => { setEditing(story.id); setPlan(story.originalEstimate == null ? '' : String(story.originalEstimate)); setActual(story.completedWork == null ? '' : String(story.completedWork)) }
  const save = async () => {
    const planHours = Number(plan), actualHours = Number(actual)
    if (editing == null || !plan.trim() || !actual.trim() || !Number.isFinite(planHours) || !Number.isFinite(actualHours) || planHours < 0 || actualHours < 0) { azure.setError('Enter non-negative Plan and Actual hours before saving.'); return }
    setSaving(true)
    try { await azure.saveTimeWritingEffort(editing, planHours, actualHours); setEditing(null) } catch (failure) { azure.setError(failure instanceof Error ? failure.message : 'Unable to save Plan and Actual.') } finally { setSaving(false) }
  }
  return <section className="content"><Heading eyebrow="AZURE DEVOPS" title="Monthly Time Writing" detail={`Time Writing stories selected by their ${month} child task.`} />
    <div className="metric-grid compact"><article><span>Stories</span><strong>{data.storiesForMonth.length}</strong><small>Matched to selected month</small></article><article><span>Plan</span><strong>{value(data.plan.value)}</strong><small>Story Original Estimate</small></article><article><span>Actual</span><strong>{value(data.actual.value)}</strong><small>Story Completed Work</small></article><article><span>Month tasks</span><strong>{data.monthlyTasks.length}</strong><small>Month-named child tasks</small></article></div>
    {azure.error && <div className="notice error" role="alert">{azure.error}</div>}{azure.message && <div className="notice" role="status">{azure.message}</div>}
    <Panel className="table-panel"><table><thead><tr><th>Epic</th><th>Time Writing story</th><th>State</th><th>Plan</th><th>Actual</th><th>Month tasks</th><th></th></tr></thead><tbody>{data.epicBreakdown.flatMap(group => group.stories.map(story => <tr key={story.key}><td>{group.epic ? <a href={group.epic.url} target="_blank" rel="noreferrer">#{group.epic.id} {group.epic.title}</a> : 'No Epic path'}</td><td><a href={story.url} target="_blank" rel="noreferrer">#{story.id} {story.title}</a></td><td><Pill tone="info">{story.state}</Pill></td><td>{editing === story.id ? <input aria-label="Plan hours" inputMode="decimal" value={plan} onChange={event => setPlan(event.target.value)} /> : value(story.originalEstimate ?? null)}</td><td>{editing === story.id ? <input aria-label="Actual hours" inputMode="decimal" value={actual} onChange={event => setActual(event.target.value)} /> : value(story.completedWork ?? null)}</td><td>{data.monthlyTasks.filter(task => task.parentId === story.id).length}</td><td>{editing === story.id ? <span className="button-row"><button className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save to Azure'}</button><button className="ghost" disabled={saving} onClick={() => setEditing(null)}>Cancel</button></span> : <button className="ghost" disabled={saving || !azure.pat.trim()} onClick={() => beginEdit(story)}>Edit Plan / Actual</button>}</td></tr>))}</tbody></table>{!azure.pat.trim() && data.storiesForMonth.length > 0 && <p className="muted">Select a Work Items (Read & Write) PAT profile in Connection settings to edit Plan and Actual.</p>}{!data.storiesForMonth.length && <p className="empty-state">No Time Writing stories have a child task named for {month}.</p>}</Panel>
  </section>
}
