import { useState } from 'react'
import { Metric, Metrics, Notice, Page, Panel, Pill, TablePanel } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import { azureInsights, timeWritingGaps } from '../azureInsights'
import { formatHours, monthName, todayIso } from '../format'
import type { PageProps } from './types'
import type { MyWork } from '../useMyWork'
import { isMine } from '../myWork'
import { usePersonScope } from '../usePersonScope'
import { ScopeSwitch } from '../components/ScopeSwitch'

type Edit = { originalEstimate?: string; completedWork?: string }
const nextMonth = (month: string) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 7) }
const locked = (deadline: string | undefined, explicit: boolean | undefined, extension: string | undefined, now: Date) => Boolean(explicit || (deadline && now >= new Date(extension || deadline)))
const adhoc = (tags: string) => tags.split(';').some(tag => tag.trim().toLowerCase() === 'ad-hoc')

export function MonthlyPage({ azure, month, store, my }: { azure: AzureWorkspace; month: string; store: PageProps['store']; my: MyWork }) {
  const [today] = useState(todayIso)
  const [now] = useState(() => new Date())
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [saving, setSaving] = useState(false)
  // Individual (default: me) shows only that person's Tasks; Team shows everyone's.
  const personScope = usePersonScope('demand-planning-monthly-view-v1', 'individual', my)
  const { scope } = personScope
  const items = scope ? azure.items.filter((item) => item.workItemType !== 'Task' || isMine(item, scope)) : personScope.individual ? [] : azure.items
  const data = azureInsights(items, month, today)
  const allGaps = timeWritingGaps(items, month)
  // For one person, a story counts as theirs when it holds one of their Tasks or is assigned to them.
  const gaps = scope ? { ...allGaps, storiesWithoutTask: allGaps.storiesWithoutTask.filter((story) => isMine(story, scope) || items.some((item) => item.parentId === story.id && item.workItemType === 'Task')) } : allGaps
  const planningPeriod = store.state.periods.find(item => item.month === month)
  const actualPeriod = store.state.periods.find(item => item.month === nextMonth(month))
  const planningLocked = locked(planningPeriod?.planningDeadline ?? `${month}-05T23:59:59`, planningPeriod?.planningLocked, planningPeriod?.planningExtendedUntil, now)
  const actualsLocked = locked(actualPeriod?.actualsDeadline ?? `${nextMonth(month)}-05T23:59:59`, actualPeriod?.actualsLocked, actualPeriod?.actualsExtendedUntil, now)
  const staged = Object.keys(edits).length
  // The Feature above each month Task, found through its parent links (the story between them can have any name).
  const byId = new Map(azure.items.map((item) => [item.id, item]))
  const featureOf = (id?: number) => { for (let item = id == null ? undefined : byId.get(id), depth = 0; item && depth < 6; item = item.parentId == null ? undefined : byId.get(item.parentId), depth += 1) if (item.workItemType === 'Feature') return item; return undefined }
  const change = (id: number, field: keyof Edit, fieldValue: string) => setEdits(current => ({ ...current, [id]: { ...current[id], [field]: fieldValue } }))
  const editValue = (task: typeof data.monthlyTasks[number], field: keyof Edit) => edits[task.id]?.[field] ?? (field === 'originalEstimate' ? task.originalEstimate == null ? '' : String(task.originalEstimate) : task.completedWork == null ? '' : String(task.completedWork))
  const saveAll = async () => {
    const changed = data.monthlyTasks.filter(task => edits[task.id] && Object.values(edits[task.id]).some(item => item !== undefined))
    if (!changed.length) return
    for (const task of changed) {
      const edit = edits[task.id], isAdhoc = adhoc(task.tags)
      const planChanged = edit.originalEstimate != null && edit.originalEstimate !== (task.originalEstimate == null ? '' : String(task.originalEstimate))
      const actualChanged = edit.completedWork != null && edit.completedWork !== (task.completedWork == null ? '' : String(task.completedWork))
      if ((planChanged && (planningLocked || isAdhoc)) || (actualChanged && actualsLocked)) { azure.setError('A staged change is in a locked field. Unlock the period in Settings before saving.'); return }
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
      // Save and refresh: re-read the whole backlog from Azure and save it locally.
      await azure.refresh()
    } catch (failure) { azure.setError(failure instanceof Error ? failure.message : 'Unable to save staged Azure fields.') } finally { setSaving(false) }
  }
  return <Page>
    <ScopeSwitch scope={personScope} label="Time writing for" />
    {personScope.individual && !scope && <Notice>Choose whose time writing to show, or set your Azure email on the Time Writing connection to make “Me” the default.</Notice>}
    <Metrics>
      <Metric label="Tasks" value={data.monthlyTasks.length} hint="Matched to the selected month" />
      <Metric label="Original Estimate" value={formatHours(data.plan.value)} hint="Azure DevOps Task field" />
      <Metric label="Completed Work" value={formatHours(data.actual.value)} hint="Azure DevOps Task field" />
      <Metric label="Staged changes" value={staged} hint="Saved in one Azure operation" />
    </Metrics>
    <TablePanel title="Time Writing Tasks" detail={<>Planning locks after its configured deadline (default: 5th). Actuals for this month lock on the next month’s configured deadline (default: 5th). Settings can lock, unlock or extend them separately. A Task first receiving Completed Work after planning has locked is tagged <code>ad-hoc</code>.</>} action={<><Pill tone={planningLocked ? 'locked' : 'open'}>Planning {planningLocked ? 'locked' : 'open'}</Pill><Pill tone={actualsLocked ? 'locked' : 'open'}>Actuals {actualsLocked ? 'locked' : 'open'}</Pill><button className="primary" disabled={saving || !staged || !azure.pat.trim()} onClick={() => void saveAll()}>{saving ? 'Saving and refreshing…' : `Save ${staged} staged task(s) and refresh`}</button><button className="ghost" disabled={saving || !staged} onClick={() => setEdits({})}>Discard staged changes</button></>} empty={data.monthlyTasks.length ? undefined : `No Time Writing Tasks have a title for ${month}.`}>
      <table><thead><tr><th>Epic</th><th>Feature</th><th>Month Task</th><th>State</th><th>Original Estimate</th><th>Completed Work</th><th>Tags</th></tr></thead><tbody>{data.epicBreakdown.flatMap(group => data.monthlyTasks.filter(task => group.stories.some(story => story.id === task.parentId)).map(task => { const feature = featureOf(task.parentId), isAdhoc = adhoc(task.tags); return <tr key={task.key}><td>{group.epic ? <a href={group.epic.url} target="_blank" rel="noreferrer">#{group.epic.id} {group.epic.title}</a> : 'No Epic path'}</td><td>{feature ? <a href={feature.url} target="_blank" rel="noreferrer">#{feature.id} {feature.title}</a> : 'No Feature'}</td><td><a href={task.url} target="_blank" rel="noreferrer">#{task.id} {task.title}</a></td><td><Pill tone="info">{task.state}</Pill></td><td><input aria-label={`Original Estimate for ${task.id}`} disabled={planningLocked || isAdhoc || saving} inputMode="decimal" value={editValue(task, 'originalEstimate')} onChange={event => change(task.id, 'originalEstimate', event.target.value)} /></td><td><input aria-label={`Completed Work for ${task.id}`} disabled={actualsLocked || saving} inputMode="decimal" value={editValue(task, 'completedWork')} onChange={event => change(task.id, 'completedWork', event.target.value)} /></td><td>{isAdhoc ? <Pill tone="warning">ad-hoc</Pill> : task.tags || '—'}</td></tr> }))}</tbody></table>
      {!azure.pat.trim() && data.monthlyTasks.length > 0 && <p className="muted">Select an ADS configuration whose PAT has Work Items (Read &amp; Write) to save staged Azure fields.</p>}
    </TablePanel>
    <GapsPanel gaps={gaps} month={month} />
  </Page>
}

// Lists what the page did not pick up for the month and why, so naming or hierarchy problems are visible.
function GapsPanel({ gaps, month }: { gaps: ReturnType<typeof timeWritingGaps>; month: string }) {
  const label = monthName(month)
  const total = gaps.storiesWithoutTask.length + gaps.tasksWithoutMonth.length + gaps.tasksWithoutFeature.length
  const link = (item: { id: number; title: string; url: string }) => <a href={item.url} target="_blank" rel="noreferrer">#{item.id} {item.title}</a>
  return <Panel className="admin-section gaps-panel" eyebrow="CHECK" title={total ? `Not picked up for ${label} (${total})` : `Everything picked up for ${label}`}
    detail={<>A Task is counted for the month when its title starts or ends with the month and year, with any delimiter (“{label} | …”, “… - {label.slice(0, 3)} {month.slice(0, 4)}”, …). The story above it can have any name; the Feature and Epic come from the parent links. Only items in the saved backlog are checked — the team’s Epic backlog and area paths, or a Time Writing connection’s query — so refresh from Azure and save the preview after adding items.</>}>
    {gaps.storiesWithoutTask.length > 0 && <details open><summary><Pill tone="warning">{gaps.storiesWithoutTask.length}</Pill> Time Writing stories with no {label} Task</summary><p className="muted">Open stories that held month Tasks before (or say “Time Writing”) but none for {label}. Add the month Task (Assigned to Me can create them for your Features), or close the story if it is finished.</p><ul>{gaps.storiesWithoutTask.slice(0, 60).map((story) => <li key={story.key}>{link(story)}{story.assignedTo && <small> · {story.assignedTo}</small>}</li>)}</ul></details>}
    {gaps.tasksWithoutMonth.length > 0 && <details open><summary><Pill tone="warning">{gaps.tasksWithoutMonth.length}</Pill> Tasks under a Time Writing story without a month in the title</summary><p className="muted">Not counted for any month. Start or end the title with the month and year, e.g. “{label} | …” or “… | {label}”.</p><ul>{gaps.tasksWithoutMonth.slice(0, 60).map((task) => <li key={task.key}>{link(task)}</li>)}</ul></details>}
    {gaps.tasksWithoutFeature.length > 0 && <details open><summary><Pill tone="warning">{gaps.tasksWithoutFeature.length}</Pill> {label} Tasks with no Feature above them</summary><p className="muted">Counted, but not attributed to a stream. Link them under a story or Feature of the right Epic.</p><ul>{gaps.tasksWithoutFeature.slice(0, 60).map(({ task, parent }) => <li key={task.key}>{link(task)}<small> · parent: {parent ? `#${parent.id} ${parent.title} (${parent.workItemType})` : task.parentId ? `#${task.parentId} (not in the saved data)` : 'none'}</small></li>)}</ul></details>}
  </Panel>
}
