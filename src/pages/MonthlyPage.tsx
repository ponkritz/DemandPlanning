import { useState } from 'react'
import { Heading, Panel, Pill } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights } from '../azureInsights'
import type { PageProps } from './types'

const value = (number: number | null) => number == null ? '—' : Number(number.toFixed(2)).toLocaleString()
type Edit = { originalEstimate?: string; completedWork?: string }
const nextMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7) }
const locked = (deadline: string | undefined, explicit: boolean | undefined, extension: string | undefined, now: Date) => Boolean(explicit || (deadline && now >= new Date(extension || deadline)))
const adhoc = (tags: string) => tags.split(';').some(tag => tag.trim().toLowerCase() === 'ad-hoc')

export function MonthlyPage({ azure, month, store }: { azure: AzureWorkspace; month: string; store: PageProps['store'] }) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [now] = useState(() => new Date())
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [saving, setSaving] = useState(false)
  const data = azureInsights(azure.items, month, today)
  const planningPeriod = store.state.periods.find(item => item.month === month)
  const actualPeriod = store.state.periods.find(item => item.month === nextMonth(month))
  const planningLocked = locked(planningPeriod?.planningDeadline ?? `${month}-05T23:59:59`, planningPeriod?.planningLocked, planningPeriod?.planningExtendedUntil, now)
  const actualsLocked = locked(actualPeriod?.actualsDeadline ?? `${nextMonth(month)}-05T23:59:59`, actualPeriod?.actualsLocked, actualPeriod?.actualsExtendedUntil, now)
  const change = (id: number, field: keyof Edit, fieldValue: string) => setEdits(current => ({ ...current, [id]: { ...current[id], [field]: fieldValue } }))
  const editValue = (task: typeof data.monthlyTasks[number], field: keyof Edit) => edits[task.id]?.[field] ?? (field === 'originalEstimate' ? task.originalEstimate == null ? '' : String(task.originalEstimate) : task.completedWork == null ? '' : String(task.completedWork))
  const saveAll = async () => {
    const changed = data.monthlyTasks.filter(task => edits[task.id] && Object.values(edits[task.id]).some(item => item !== undefined))
    if (!changed.length) return
    for (const task of changed) {
      const edit = edits[task.id], isAdhoc = adhoc(task.tags)
      const planChanged = edit.originalEstimate != null && edit.originalEstimate !== (task.originalEstimate == null ? '' : String(task.originalEstimate))
      const actualChanged = edit.completedWork != null && edit.completedWork !== (task.completedWork == null ? '' : String(task.completedWork))
      if ((planChanged && (planningLocked || isAdhoc)) || (actualChanged && actualsLocked)) { azure.setError('A staged change is in a locked field. Unlock the period in Administration before saving.'); return }
      for (const item of [planChanged ? edit.originalEstimate : undefined, actualChanged ? edit.completedWork : undefined]) if (item != null && (!item.trim() || !Number.isFinite(Number(item)) || Number(item) < 0)) { azure.setError('Original Estimate and Completed Work must be non-negative numbers.'); return }
    }
    setSaving(true)
    try {
      for (const task of changed) {
        const edit = edits[task.id], isAdhoc = adhoc(task.tags)
        const planChanged = edit.originalEstimate != null && edit.originalEstimate !== (task.originalEstimate == null ? '' : String(task.originalEstimate))
        const actualChanged = edit.completedWork != null && edit.completedWork !== (task.completedWork == null ? '' : String(task.completedWork))
        await azure.saveTimeWritingEffort(task.id, planChanged ? Number(edit.originalEstimate) : undefined, actualChanged ? Number(edit.completedWork) : undefined, planningLocked && !isAdhoc && task.originalEstimate == null && actualChanged)
      }
      setEdits({})
    } catch (failure) { azure.setError(failure instanceof Error ? failure.message : 'Unable to save staged Azure fields.') } finally { setSaving(false) }
  }
  return <section className="content"><Heading eyebrow="AZURE DEVOPS" title="Monthly Time Writing" detail="Selected-month Tasks are the source for Azure Original Estimate and Completed Work." />
    <div className="metric-grid compact"><article><span>Tasks</span><strong>{data.monthlyTasks.length}</strong><small>Matched to selected month</small></article><article><span>Original Estimate</span><strong>{value(data.plan.value)}</strong><small>Azure DevOps Task field</small></article><article><span>Completed Work</span><strong>{value(data.actual.value)}</strong><small>Azure DevOps Task field</small></article><article><span>Staged changes</span><strong>{Object.keys(edits).length}</strong><small>Save all in one Azure operation</small></article></div>
    <div className="button-row"><Pill tone={planningLocked ? 'locked' : 'open'}>Planning {planningLocked ? 'locked' : 'open'}</Pill><Pill tone={actualsLocked ? 'locked' : 'open'}>Actuals {actualsLocked ? 'locked' : 'open'}</Pill><button className="primary" disabled={saving || !Object.keys(edits).length || !azure.pat.trim()} onClick={() => void saveAll()}>{saving ? 'Saving staged changes…' : `Save ${Object.keys(edits).length} staged task(s) to Azure`}</button><button className="ghost" disabled={saving || !Object.keys(edits).length} onClick={() => setEdits({})}>Discard staged changes</button></div>
    <p className="muted">Planning locks after its configured deadline (default: 5th). Actuals for this month lock on the next month’s configured deadline (default: 5th). Administration can lock, unlock, or extend them separately. A Task first receiving Completed Work after planning has locked is tagged <code>ad-hoc</code>.</p>
    {azure.error && <div className="notice error" role="alert">{azure.error}</div>}{azure.message && <div className="notice" role="status">{azure.message}</div>}
    <Panel className="table-panel"><table><thead><tr><th>Epic</th><th>Time Writing User Story</th><th>Month Task</th><th>State</th><th>Original Estimate</th><th>Completed Work</th><th>Tags</th></tr></thead><tbody>{data.epicBreakdown.flatMap(group => data.monthlyTasks.filter(task => group.stories.some(story => story.id === task.parentId)).map(task => { const story = group.stories.find(item => item.id === task.parentId), isAdhoc = adhoc(task.tags); return <tr key={task.key}><td>{group.epic ? <a href={group.epic.url} target="_blank" rel="noreferrer">#{group.epic.id} {group.epic.title}</a> : 'No Epic path'}</td><td>{story ? <a href={story.url} target="_blank" rel="noreferrer">#{story.id} {story.title}</a> : 'No parent story'}</td><td><a href={task.url} target="_blank" rel="noreferrer">#{task.id} {task.title}</a></td><td><Pill tone="info">{task.state}</Pill></td><td><input aria-label={`Original Estimate for ${task.id}`} disabled={planningLocked || isAdhoc || saving} inputMode="decimal" value={editValue(task, 'originalEstimate')} onChange={event => change(task.id, 'originalEstimate', event.target.value)} /></td><td><input aria-label={`Completed Work for ${task.id}`} disabled={actualsLocked || saving} inputMode="decimal" value={editValue(task, 'completedWork')} onChange={event => change(task.id, 'completedWork', event.target.value)} /></td><td>{isAdhoc ? <Pill tone="warning">ad-hoc</Pill> : task.tags || '—'}</td></tr> }))}</tbody></table>{!azure.pat.trim() && data.monthlyTasks.length > 0 && <p className="muted">Select an ADS configuration whose PAT has Work Items (Read &amp; Write) to save staged Azure fields.</p>}{!data.monthlyTasks.length && <p className="empty-state">No Time Writing Tasks have a title for {month}.</p>}</Panel>
  </section>
}
