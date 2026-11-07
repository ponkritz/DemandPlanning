import { useEffect, useState, useSyncExternalStore } from 'react'
import { isRunning, runInBackground, subscribeJobs } from '../backgroundJobs'
import { addTask, addUserStory, currentIterationPairs, ensureAbsenceStoryMonthTask, ensureMonthTask, ensureStoryMonthTask, futureIterationPairs, readAzureIterations, updateAzureTimeWritingEffort, type AzureIteration } from '../azureDevOps'
import { azureInsights, isTimeWritingStory, timeWritingMonth } from '../azureInsights'
import { capacityContext } from '../capacity'
import { FeatureEditor } from '../components/FeatureEditor'
import { PersonPicker } from '../components/PersonPicker'
import { SearchSelect } from '../components/SearchSelect'
import { EmptyState, Metric, Metrics, Page } from '../components/ui'
import { personMonths, totals } from '../dashboard'
import type { AzureWorkItem } from '../domain'
import { setupHours, type FeatureSetups } from '../featureSetup'
import { formatDate, formatHours, monthName, todayIso } from '../format'
import { absenceStoryType, assignablePeople, isMine, leaveTaskCandidates, monthTaskCandidates, type MonthTaskCandidate } from '../myWork'
import { actualsLockDate, actualsLocked as isActualsLocked, planLockDate, planningLocked as isPlanningLocked } from '../planningLock'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import { useNow } from '../useNow'
import type { PageProps } from './types'

// My Activities (ACT-02…ACT-07): one page for a person's month — this month's activities with their planned and actual
// hours (the ones still to add ticked, like copying last month's), a new activity under a stream and Feature, and the
// month's progress with the deadline. Every write uses the existing month-task rules (no duplicates, the lock days, the
// person's own stories) and goes to Azure DevOps only.

type Hours = { planned?: string; actual?: string }
type Row = {
  key: string
  title: string
  stream: string
  kind: 'work' | 'leave' | 'training'
  task?: AzureWorkItem
  candidate?: MonthTaskCandidate
  // The item the row's ID links to in Azure DevOps (its Feature, or a leave / training story).
  link?: AzureWorkItem
}
const hoursText = (value?: number) => value == null ? '' : String(value)
const validHours = (text: string) => text.trim() === '' || (Number.isFinite(Number(text)) && Number(text) >= 0 && Number(text) <= 1000)
const adhocTask = (task: AzureWorkItem) => task.tags.split(';').some((tag) => tag.trim().toLowerCase() === 'ad-hoc')

export function MyActivitiesPage({ azure, store, my, month, assign, featureSetup, onOpen }: { azure: AzureWorkspace; store: PageProps['store']; my: MyWork; month: string; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null; onOpen: (page: 'mywork' | 'bulk') => void }) {
  const now = useNow(60000)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [hours, setHours] = useState<Record<string, Hours>>({})
  const [stream, setStream] = useState('')
  const [featureId, setFeatureId] = useState('')
  const [newHours, setNewHours] = useState<Hours>({})
  // Add a new activity adds a Time Writing task, or a User Story (title, description, an optional first comment).
  const [addKind, setAddKind] = useState<'task' | 'story' | 'work' | 'feature'>('task')
  // ACT-17: a work Task (not Time Writing) under one of the Feature's User Stories.
  const [storyId, setStoryId] = useState('')
  // A new Feature (ACT-12, BKL-26): the same New Feature form as everywhere, for the month and person shown.
  const [featureOpen, setFeatureOpen] = useState(false)
  const [story, setStory] = useState({ title: '', description: '', comment: '' })
  // BKL-27: the story's Sprint — the current one preselected, changeable to another current or future one.
  const [iterations, setIterations] = useState<AzureIteration[] | null>(null)
  const [sprint, setSprint] = useState('')
  const storyPairs = iterations ? [...currentIterationPairs(iterations), ...futureIterationPairs(iterations)] : []
  useEffect(() => {
    if ((addKind !== 'story' && addKind !== 'work') || iterations || !azure.config || !azure.pat.trim() || azure.isSample) return
    let live = true
    readAzureIterations(azure.config, azure.pat).then((list) => { if (!live) return; setIterations(list); const current = currentIterationPairs(list); if (current.length === 1) setSprint(current[0].sprint.path) }, () => { if (live) setIterations([]) })
    return () => { live = false }
  }, [addKind, iterations, azure.config, azure.pat, azure.isSample])
  // Suggestions by the Feature's state (ACT-09): Active, New or both.
  const [suggestState, setSuggestState] = useState<'both' | 'active' | 'new'>('both')
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const saving = useSyncExternalStore(subscribeJobs, () => isRunning('activities:save'))
  const label = monthName(month)
  const locks = capacityContext(store.state)
  const absenceEpicId = locks.absenceEpicId
  const planLocked = isPlanningLocked(locks, month, now), actualLocked = isActualsLocked(locks, month, now)
  // ACT-14: the person whose activities are shown — me, or someone chosen at the top right. Work added for someone
  // else is assigned to them, and only by people allowed to create work for others (as in Bulk actions).
  const self = !my.chosenName || Boolean(my.me.email) || !(assign?.me || azure.creatorEmail).trim()
  const otherEmail = self ? '' : assignablePeople(azure.items).find((person) => person.name === my.me.name)?.email ?? ''
  const assignee = (self ? assign?.me || azure.creatorEmail : assign?.canChoose ? otherEmail : '').trim().toLowerCase()
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: nothing is saved to Azure DevOps.' : !azure.config || !azure.pat.trim() ? 'Connect the Time Writing connection (with its PAT) to save to Azure DevOps.' : !self && !assign?.canChoose ? `You are viewing ${my.me.name}'s activities: saving for another person needs the right to create work for others.` : !self && !assignee ? `No work email is known for ${my.me.name}, so nothing can be assigned to them.` : !assignee ? 'Set your work email (Settings → Azure DevOps) so new tasks are assigned to you.' : ''

  // The parent chain of an item, nearest first.
  const byId = new Map(azure.items.map((item) => [item.id, item]))
  const chainOf = (item: AzureWorkItem) => { const chain: AzureWorkItem[] = []; for (let next = item.parentId == null ? undefined : byId.get(item.parentId); next && chain.length < 6; next = next.parentId == null ? undefined : byId.get(next.parentId)) chain.push(next); return chain }
  const featureOf = (item: AzureWorkItem) => item.workItemType === 'Feature' ? item : chainOf(item).find((entry) => entry.workItemType === 'Feature')
  const epicOf = (item: AzureWorkItem) => item.workItemType === 'Epic' ? item : chainOf(item).find((entry) => entry.workItemType === 'Epic')
  const kindOf = (item: AzureWorkItem): Row['kind'] => epicOf(item)?.id !== absenceEpicId ? 'work' : [item, ...chainOf(item)].some((entry) => entry.workItemType === 'User Story' && absenceStoryType(entry) === 'Training') || absenceStoryType(item) === 'Training' ? 'training' : 'leave'

  // This month's tasks of mine, then the Features still without one (work ticked, leave and training not).
  const mine = my.known ? azure.items.filter((item) => item.workItemType === 'Task' && item.state.trim().toLowerCase() !== 'removed' && isMine(item, my.me) && timeWritingMonth(item.title) === month) : []
  const existing: Row[] = mine.map((task) => { const feature = featureOf(task); return { key: `task:${task.id}`, title: feature?.title ?? task.title, stream: epicOf(task)?.title ?? 'No stream', kind: kindOf(task), task, link: feature ?? task } })
  const work = my.known ? monthTaskCandidates(azure.items, my.me, label, absenceEpicId) : []
  const leave = my.known ? leaveTaskCandidates(azure.items, my.me, label, absenceEpicId) : []
  const toAdd: Row[] = [...work, ...leave].filter((row) => row.status === 'needs-task' || row.status === 'needs-story').map((row) => ({
    key: row.story ? `story:${row.story.id}` : row.kind ? `feature:${row.feature.id}:${row.kind}` : `feature:${row.feature.id}`,
    title: row.leave ? row.story?.title ?? row.storyTitle : row.feature.title,
    link: row.story ?? row.feature,
    stream: epicOf(row.feature)?.title ?? 'No stream',
    kind: !row.leave ? 'work' : row.kind === 'Training' ? 'training' : 'leave',
    candidate: row,
  }))
  const conflicts = work.filter((row) => row.status === 'conflict')
  // Nothing is chosen for the person (ACT-03): Features without a task are only suggested; Add puts one in the list.
  const isTicked = (row: Row) => ticked[row.key] ?? false
  const valueOf = (row: Row, field: keyof Hours) => hours[row.key]?.[field] ?? (row.task ? hoursText(field === 'planned' ? row.task.originalEstimate : row.task.completedWork) : '')
  const setValue = (row: Row, field: keyof Hours, text: string) => setHours((current) => ({ ...current, [row.key]: { ...current[row.key], [field]: text } }))
  const changedExisting = existing.filter((row) => (['planned', 'actual'] as const).some((field) => hours[row.key]?.[field] != null && hours[row.key]![field] !== hoursText(field === 'planned' ? row.task!.originalEstimate : row.task!.completedWork)))
  const chosenNew = toAdd.filter(isTicked)
  const pendingCount = changedExisting.length + chosenNew.length

  // Progress: a work or training activity counts as updated once it has actual hours; leave counts once it exists.
  const tracked = [...existing, ...toAdd.filter((row) => row.kind === 'work')]
  const updated = existing.filter((row) => (row.task!.completedWork ?? 0) > 0 || row.kind === 'leave').length
  const percent = tracked.length ? Math.round((updated / tracked.length) * 100) : 0
  const planDay = planLockDate(locks, month), actualsDay = actualsLockDate(locks, month)
  const deadline = planLocked ? actualsDay : planDay
  const daysLeft = Math.ceil((new Date(`${deadline}T23:59:59`).getTime() - now.getTime()) / 86400000)
  // KPI cards (ACT-11): the figures of Monthly Time Writing for the person (their month Tasks), their capacity as on
  // My dashboard, and the monthly update.
  const kpiItems = my.known ? azure.items.filter((item) => item.workItemType !== 'Task' || isMine(item, my.me)) : []
  const kpi = azureInsights(kpiItems, month, todayIso())
  const personName = my.me.name ?? ''
  const capacity = personName ? totals(personMonths(azure.items, [month], todayIso(), locks).filter((row) => row.person === personName)).capacity : null
  const unsaved = pendingCount + Object.keys(newHours).filter((key) => newHours[key as keyof Hours]?.trim()).length
  // A small share of capacity next to the planned and actual hours (ACT-11).
  const pctOf = (hours: number | null, whole: number | null) => whole && hours != null ? <span className="act-pct" title="Share of your capacity">{Math.round(hours / whole * 100)}%</span> : null

  // Add a new activity: a stream (Epic) and a pending Feature under it; mine first.
  // Streams are the Active Epics (the absence Epic has its own list).
  const epics = azure.items.filter((item) => item.workItemType === 'Epic' && item.id !== absenceEpicId && item.state.trim().toLowerCase() === 'active').sort((a, b) => a.title.localeCompare(b.title))
  // Features in state Active or New under an Active Epic; the chosen Epic narrows them, and picking a Feature first fills in its Epic (ACT-04).
  const epicIds = new Set(epics.map((epic) => epic.id))
  // Only the person's own Features (ACT-04): assigned to them, or holding a User Story or Task of theirs; typed text
  // narrows them by ID, title or Epic.
  const ownFeatureIds = new Set(my.known ? azure.items.flatMap((item) => isMine(item, my.me) ? [featureOf(item)?.id].filter((id): id is number => id != null) : []) : [])
  const features = azure.items.filter((item) => item.workItemType === 'Feature' && ownFeatureIds.has(item.id) && ['active', 'new'].includes(item.state.trim().toLowerCase()) && epicIds.has(epicOf(item)?.id ?? -1) && (!stream || epicOf(item)?.id === Number(stream))).sort((a, b) => a.title.localeCompare(b.title))
  const chosenFeature = azure.items.find((item) => item.workItemType === 'Feature' && item.id === Number(featureId) && ownFeatureIds.has(item.id))
  // My month Task already under the chosen Feature: its hours are shown and what is entered replaces them.
  const existingTask = chosenFeature ? mine.find((task) => featureOf(task)?.id === chosenFeature.id) : undefined
  const newValue = (field: keyof Hours) => newHours[field] ?? (existingTask ? hoursText(field === 'planned' ? existingTask.originalEstimate : existingTask.completedWork) : '')

  const checkHours = (entries: Hours[]) => {
    for (const entry of entries) {
      if (!validHours(entry.planned ?? '') || !validHours(entry.actual ?? '')) return 'Hours must be numbers from 0 to 1,000.'
      if (planLocked && entry.planned?.trim()) return `Planning for ${label} is locked: only actual hours can be entered.`
      if (actualLocked && entry.actual?.trim()) return `Actuals for ${label} are locked.`
    }
    return ''
  }
  const effortOf = (entry: Hours) => ({ plan: entry.planned?.trim() ? Number(entry.planned) : undefined, actual: entry.actual?.trim() ? Number(entry.actual) : undefined })

  function saveAll() {
    if (blocked) { setMessage({ tone: 'info', text: blocked }); return }
    const problem = checkHours([...changedExisting.map((row) => ({ planned: hours[row.key]?.planned !== hoursText(row.task!.originalEstimate) ? hours[row.key]?.planned : undefined, actual: hours[row.key]?.actual !== hoursText(row.task!.completedWork) ? hours[row.key]?.actual : undefined })), ...chosenNew.map((row) => hours[row.key] ?? {})])
    if (problem) { setMessage({ tone: 'error', text: problem }); return }
    const config = azure.config!, pat = azure.pat
    const edits = hours, chosen = chosenNew, changed = changedExisting
    const started = runInBackground('activities:save', `Save ${chosen.length + changed.length} activit${chosen.length + changed.length === 1 ? 'y' : 'ies'} for ${label}`, async (progress) => {
      const failed: string[] = []
      let created = 0, saved = 0
      for (const [index, row] of chosen.entries()) {
        progress(`Adding ${index + 1} of ${chosen.length}…`)
        try {
          const candidate = row.candidate!
          // BKL-28: the Epic setup's default hours on a new Task, unless planned hours are typed (or planning is locked).
          const typed = edits[row.key]?.planned?.trim(), hours = typed || planLocked ? undefined : setupHours(featureSetup, epicOf(candidate.feature)?.id)
          const result = candidate.story ? await ensureStoryMonthTask(config, pat, candidate.story.id, assignee, label, undefined, planLocked, hours)
            : candidate.leave && candidate.kind ? await ensureAbsenceStoryMonthTask(config, pat, candidate.feature.id, candidate.kind, candidate.storyTitle, absenceStoryType, assignee, label, undefined, planLocked)
            : await ensureMonthTask(config, pat, candidate.feature.id, assignee, label, undefined, planLocked, hours)
          const effort = effortOf(edits[row.key] ?? {})
          if (effort.plan != null || effort.actual != null) await updateAzureTimeWritingEffort(config, pat, result.task.id, effort.plan, effort.actual)
          created += 1
        } catch (failure) { failed.push(`${row.title}: ${failure instanceof Error ? failure.message : 'failed'}`) }
      }
      for (const [index, row] of changed.entries()) {
        progress(`Saving hours ${index + 1} of ${changed.length}…`)
        const task = row.task!, edit = edits[row.key] ?? {}
        const plan = edit.planned != null && edit.planned !== hoursText(task.originalEstimate) ? Number(edit.planned) : undefined
        const actual = edit.actual != null && edit.actual !== hoursText(task.completedWork) ? Number(edit.actual) : undefined
        try { await azure.saveTimeWritingEffort(task.id, plan, actual, planLocked && !adhocTask(task) && task.originalEstimate == null && actual != null); saved += 1 }
        catch (failure) { failed.push(`#${task.id}: ${failure instanceof Error ? failure.message : 'failed'}`) }
      }
      setHours({}); setTicked({})
      progress('Refreshing your work…')
      await azure.refresh()
      const text = `${created} activit${created === 1 ? 'y' : 'ies'} added, ${saved} updated for ${label}.${failed.length ? ` ${failed.length} failed — ${failed.join(' · ')}` : ''}`
      setMessage({ tone: failed.length ? 'error' : 'success', text })
      return { text, failed: failed.length > 0 }
    })
    if (!started) setMessage({ tone: 'info', text: 'Your activities are already being saved (see the top bar).' })
  }

  // ACT-17: the work Task's parent — the chosen Feature's open User Stories (not its Time Writing story), the person's first.
  const taskStories = chosenFeature ? azure.items.filter((item) => item.workItemType === 'User Story' && item.parentId === chosenFeature.id && !isTimeWritingStory(item) && !['closed', 'removed'].includes(item.state.trim().toLowerCase()))
    .sort((a, b) => Number(isMine(b, my.me)) - Number(isMine(a, my.me)) || a.title.localeCompare(b.title)) : []
  const chosenStory = taskStories.find((item) => String(item.id) === storyId)
  function saveWorkTask() {
    if (blocked) { setMessage({ tone: 'info', text: blocked }); return }
    if (!chosenStory) { setMessage({ tone: 'error', text: 'Choose the User Story the Task goes under.' }); return }
    const title = story.title.trim()
    if (!title || title.length > 255) { setMessage({ tone: 'error', text: 'Enter a Task title of 1–255 characters.' }); return }
    if (!sprint) { setMessage({ tone: 'error', text: 'Choose the Sprint for the Task.' }); return }
    const config = azure.config!, pat = azure.pat, parent = chosenStory, chosenSprint = sprint, entry = { title, description: story.description.trim(), comment: story.comment.trim() }
    const started = runInBackground('activities:save', `New Task “${title}”`, async (progress) => {
      try {
        progress('Creating the Task…')
        const { task, commentError } = await addTask(config, pat, { storyId: parent.id, title: entry.title, description: entry.description, iterationPath: chosenSprint, assignedTo: assignee, comment: entry.comment })
        const note = commentError ? ` The comment could not be added: ${commentError}` : ''
        setStory({ title: '', description: '', comment: '' }); setStoryId('')
        await azure.refresh()
        const text = `Task #${task.id} “${task.title}” added under ${parent.title}${entry.comment && !note ? ', with your comment' : ''}.${note}`
        setMessage({ tone: note ? 'error' : 'success', text })
        return { text, failed: Boolean(note) }
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : 'The Task could not be added.'
        setMessage({ tone: 'error', text })
        return { text, failed: true }
      }
    })
    if (!started) setMessage({ tone: 'info', text: 'Your activities are already being saved (see the top bar).' })
  }
  function saveStory() {
    if (blocked) { setMessage({ tone: 'info', text: blocked }); return }
    if (!chosenFeature) return
    const title = story.title.trim()
    if (!title || title.length > 255) { setMessage({ tone: 'error', text: 'Enter a User Story title of 1–255 characters.' }); return }
    if (!sprint) { setMessage({ tone: 'error', text: 'Choose the Sprint for the User Story.' }); return }
    const config = azure.config!, pat = azure.pat, feature = chosenFeature, chosenSprint = sprint, entry = { title, description: story.description.trim(), comment: story.comment.trim() }
    const started = runInBackground('activities:save', `New User Story “${title}”`, async (progress) => {
      try {
        // BKL-27: the shared User Story rules — the Sprint chosen (checked fresh), the Feature's Area Path, the comment.
        progress('Creating the User Story…')
        const { story: created, commentError } = await addUserStory(config, pat, { parentId: feature.id, title: entry.title, description: entry.description, acceptanceCriteria: '', iterationPath: chosenSprint, assignedTo: assignee, comment: entry.comment })
        const note = commentError ? ` The comment could not be added: ${commentError}` : ''
        setStory({ title: '', description: '', comment: '' })
        await azure.refresh()
        const text = `User Story #${created.id} “${created.title}” added under ${feature.title}${entry.comment && !note ? ', with your comment' : ''}.${note}`
        setMessage({ tone: note ? 'error' : 'success', text })
        return { text, failed: Boolean(note) }
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : 'The User Story could not be added.'
        setMessage({ tone: 'error', text })
        return { text, failed: true }
      }
    })
    if (!started) setMessage({ tone: 'info', text: 'Your activities are already being saved (see the top bar).' })
  }



  function saveNew() {
    if (blocked) { setMessage({ tone: 'info', text: blocked }); return }
    if (!chosenFeature) return
    // Only what differs from the existing task is sent (an unchanged planned value is not a change after the plan lock).
    const changedOnly = (field: keyof Hours) => { const value = newValue(field); return existingTask && value === hoursText(field === 'planned' ? existingTask.originalEstimate : existingTask.completedWork) ? undefined : value }
    const entryToSave: Hours = { planned: changedOnly('planned'), actual: changedOnly('actual') }
    const problem = checkHours([entryToSave])
    if (problem) { setMessage({ tone: 'error', text: problem }); return }
    const config = azure.config!, pat = azure.pat, feature = chosenFeature, entry = entryToSave
    const started = runInBackground('activities:save', `Add ${feature.title} for ${label}`, async (progress) => {
      try {
        progress('Adding the month task…')
        const result = await ensureMonthTask(config, pat, feature.id, assignee, label, undefined, planLocked, entry.planned?.trim() || planLocked ? undefined : setupHours(featureSetup, epicOf(feature)?.id))
        const effort = effortOf(entry)
        if (effort.plan != null || effort.actual != null) await updateAzureTimeWritingEffort(config, pat, result.task.id, effort.plan, effort.actual)
        setNewHours({}); setFeatureId('')
        await azure.refresh()
        const text = result.status === 'exists' ? `${feature.title} already had its ${label} task; its hours were updated.` : `${feature.title} added for ${label}.`
        setMessage({ tone: 'success', text })
        return { text }
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : 'The activity could not be added.'
        setMessage({ tone: 'error', text })
        return { text, failed: true }
      }
    })
    if (!started) setMessage({ tone: 'info', text: 'Your activities are already being saved (see the top bar).' })
  }

  if (!azure.items.length) return <Page><EmptyState title="No work items yet" detail="Fetch your Time Writing data from Azure DevOps (Settings → Azure DevOps), or load the synthetic sample, to see your activities." /></Page>

  const kindPill = (kind: Row['kind']) => kind === 'work' ? null : <span className={`act-kind act-${kind}`}>{kind === 'training' ? 'Training' : 'Leave'}</span>
  const hourInput = (row: Row, field: keyof Hours, disabled: boolean) => <input className="act-hours" aria-label={`${field === 'planned' ? 'Planned' : 'Actual'} hours for ${row.title}`} inputMode="decimal" placeholder="0" disabled={disabled || saving} value={valueOf(row, field)} onChange={(event) => setValue(row, field, event.target.value)} />
  const leaveRows = toAdd.filter((row) => row.kind !== 'work')
  const suggestions = toAdd.filter((row) => row.kind === 'work' && !isTicked(row) && (suggestState === 'both' || row.candidate!.feature.state.trim().toLowerCase() === suggestState))
  // The Azure DevOps ID, opening the item in a new tab.
  const idLink = (item?: AzureWorkItem) => item && item.id > 0 ? <a className="act-id" href={item.url} target="_blank" rel="noreferrer" title={`Open #${item.id} in Azure DevOps`}>#{item.id}</a> : null
  const chosenEpic = epics.find((epic) => epic.id === Number(stream))

  return <Page className="activities-page">
    <header className="act-header">
      <div><h2>Add activities</h2><p>Record your activities for {label}. Copy your recurring activities or add a new one.</p></div>
      <label className="act-person">Activities of<PersonPicker label="Activities of" value={my.chosenName} people={my.people} onChange={my.setName} meLabel={assign?.me || azure.creatorEmail ? 'Me' : 'Choose a person…'} /></label>
    </header>
    {!self && my.known && <div className="act-message act-info" role="status">Showing {my.me.name}'s activities. {assignee ? `What you save here is written for ${my.me.name} (assigned to them).` : 'Saving is not available for another person here.'} Choose “Me” to go back.</div>}
    {message && <div className={`act-message act-${message.tone}`} role="status">{message.text}<button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setMessage(null)}>×</button></div>}
    {!my.known ? <EmptyState title="Who are you in Azure DevOps?" detail="Set your work email in Settings → Azure DevOps, or choose your name above, to see your activities." /> : <>
    {/* One row of equal tiles (ACT-11, ACT-05): the hours, the tasks, the monthly update and the last day. */}
    <div className="act-top">
    <Metrics>
      <Metric label="Capacity" value={capacity == null ? '—' : `${formatHours(capacity)}h`} hint={capacity == null ? 'Your name is not known yet' : 'Working days less absence'} />
      <Metric label="Planned hours" value={<>{formatHours(kpi.plan.value)}{pctOf(kpi.plan.value, capacity)}</>} hint="Original Estimate · % of capacity" />
      <Metric label="Actual hours" value={<>{formatHours(kpi.actual.value)}{pctOf(kpi.actual.value, capacity)}</>} hint={`Completed Work${kpi.plan.value ? ` · ${Math.round((kpi.actual.value ?? 0) / kpi.plan.value * 100)}% of plan` : ''}`} />
      <Metric label="Tasks" value={kpi.monthlyTasks.length} hint={`Your ${label} Time Writing Tasks`} />
      <article className="act-summary act-tile-update" aria-labelledby="act-progress">
        <span id="act-progress">Monthly update</span>
        <div className="act-ring-row">
          <div className="act-ring" style={{ ['--pct' as string]: `${percent}` }} role="img" aria-label={`${percent}% of activities updated`}><span>{percent}%</span></div>
          <small><b>{updated} of {tracked.length}</b> activities updated · {Math.max(tracked.length - updated, 0)} remaining</small>
        </div>
      </article>
      <article className={`act-tile-deadline${daysLeft <= 3 ? ' act-urgent' : ''}`}>
        <span>{planLocked ? 'Actuals' : 'Plan'}: last day</span>
        <strong>{formatDate(deadline)}</strong>
        <small>{daysLeft > 1 ? `${daysLeft} days left` : daysLeft === 1 ? 'Last day tomorrow' : daysLeft === 0 ? 'Today is the last day' : 'Locked'}{!planLocked ? ` · actuals until ${formatDate(actualsDay)}` : ''}</small>
      </article>
      {unsaved > 0 && <Metric label="Unsaved changes" value={unsaved} hint="Saved with Save" tone="negative" />}
    </Metrics>
    </div>
    <div className="act-grid">
      <div className="act-main">
      <section className="act-card" aria-labelledby="act-copy">
        <div className="act-card-head"><h3 id="act-copy">Your activities for {label}</h3><button type="button" className="act-primary act-save-top" disabled={!pendingCount || saving} onClick={saveAll}>{saving ? 'Saving…' : pendingCount ? `Save ${pendingCount} activit${pendingCount === 1 ? 'y' : 'ies'}` : 'Nothing to save'}</button></div>
        <p className="act-sub">Your {label} tasks with their hours. Activities you add from the suggestions appear here until you save; enter or change hours and save once.</p>
        <table className="act-table">
          <thead><tr><th aria-label="Add" /><th className="act-stream">Epic</th><th>Activity</th><th>Planned</th><th>Actual</th></tr></thead>
          <tbody>
            {existing.map((row) => <tr key={row.key}>
              <td><span className="act-done" title="Already added for this month" aria-label="Added">✓</span></td>
              <td className="act-stream">{row.stream}</td>
              <td><strong>{idLink(row.link)}{row.title}</strong>{kindPill(row.kind)}<small><span className="act-stream-inline">{row.stream} · </span>Added{adhocTask(row.task!) ? ' · ad-hoc' : ''}</small></td>
              <td>{hourInput(row, 'planned', planLocked || adhocTask(row.task!))}</td>
              <td>{hourInput(row, 'actual', actualLocked)}</td>
            </tr>)}
            {toAdd.filter((row) => row.kind === 'work' && isTicked(row)).map((row) => <tr key={row.key}>
              <td><input type="checkbox" aria-label={`Add ${row.title}`} checked={isTicked(row)} disabled={saving} onChange={(event) => setTicked((current) => ({ ...current, [row.key]: event.target.checked }))} /></td>
              <td className="act-stream">{row.stream}</td>
              <td><strong>{idLink(row.link)}{row.title}</strong><small><span className="act-stream-inline">{row.stream} · </span>{row.candidate!.status === 'needs-story' ? 'New story and task' : 'New task'}{row.candidate!.shared ? ` · shared with ${row.candidate!.shared.owner}` : ''}</small></td>
              <td>{hourInput(row, 'planned', planLocked || !isTicked(row))}</td>
              <td>{hourInput(row, 'actual', actualLocked || !isTicked(row))}</td>
            </tr>)}
          </tbody>
        </table>
        {!existing.length && !toAdd.some((row) => row.kind === 'work' && isTicked(row)) && <p className="act-sub">No {label} tasks yet. Add one from the suggestions or with Add a new activity.</p>}
        {conflicts.length > 0 && <p className="act-sub">{conflicts.length} Feature{conflicts.length === 1 ? ' has' : 's have'} more than one possible story: <button type="button" className="act-link" onClick={() => onOpen('bulk')}>choose in Sprint check</button>.</p>}
        {leaveRows.length > 0 && <details className="act-leave">
          <summary>Leave and training <small>— tick only what you take in {label}</small></summary>
          <table className="act-table"><tbody>
            {leaveRows.map((row) => <tr key={row.key} className={isTicked(row) ? '' : 'act-off'}>
              <td><input type="checkbox" aria-label={`Add ${row.title}`} checked={isTicked(row)} disabled={saving} onChange={(event) => setTicked((current) => ({ ...current, [row.key]: event.target.checked }))} /></td>
              <td><strong>{idLink(row.link)}{row.title}</strong>{kindPill(row.kind)}<small>{row.candidate!.story ? 'New task' : 'New story and task'}</small></td>
              <td>{hourInput(row, 'planned', planLocked || !isTicked(row))}</td>
              <td>{hourInput(row, 'actual', actualLocked || !isTicked(row))}</td>
            </tr>)}
          </tbody></table>
        </details>}
      </section>
      {toAdd.some((row) => row.kind === 'work' && !isTicked(row)) && <section className="act-card act-block" aria-labelledby="act-suggest">
            <h3 id="act-suggest">Suggested missing items <small className="muted">({suggestions.length})</small></h3>
            <p className="act-sub">Your open Features without a {label} task. Nothing is added until you choose Add and then Save.</p>
            <div className="act-suggest-bar">
              <div className="ovw-chips" role="group" aria-label="Feature state">{(['active', 'new', 'both'] as const).map((value) => <button key={value} type="button" aria-pressed={suggestState === value} className={suggestState === value ? 'active' : ''} onClick={() => setSuggestState(value)}>{value === 'both' ? 'Both' : value === 'active' ? 'Active' : 'New'}</button>)}</div>
              <button type="button" className="act-ghost" disabled={!suggestions.length || saving} onClick={() => setTicked((current) => ({ ...current, ...Object.fromEntries(suggestions.map((row) => [row.key, true])) }))}>Add all ({suggestions.length})</button>
            </div>
            {suggestions.length ? <div className="act-suggest-list">{suggestions.map((row) => <div className="act-suggest" key={row.key}><div><strong>{idLink(row.link)}{row.title}</strong><small>{row.stream} · {row.candidate!.feature.state}{row.candidate!.status === 'needs-story' ? ' · new story and task' : ' · new task'}</small></div><button type="button" className="act-ghost" disabled={saving} onClick={() => setTicked((current) => ({ ...current, [row.key]: true }))}>Add</button></div>)}</div> : <p className="act-sub">No {suggestState === 'new' ? 'New' : 'Active'} Features to suggest.</p>}
      </section>}
      </div>

      <div className="act-side">

        <section className="act-card" aria-labelledby="act-new">
          <h3 id="act-new">Add a new activity</h3>
          <div className="segmented" role="radiogroup" aria-label="What to add">
            <label className={addKind === 'task' ? 'active' : undefined}><input type="radio" name="act-add-kind" checked={addKind === 'task'} onChange={() => setAddKind('task')} />Time Writing task</label>
            <label className={addKind === 'story' ? 'active' : undefined}><input type="radio" name="act-add-kind" checked={addKind === 'story'} onChange={() => setAddKind('story')} />User Story</label>
            <label className={addKind === 'work' ? 'active' : undefined}><input type="radio" name="act-add-kind" checked={addKind === 'work'} onChange={() => setAddKind('work')} />Task</label>
            <label className={addKind === 'feature' ? 'active' : undefined}><input type="radio" name="act-add-kind" checked={addKind === 'feature'} onChange={() => setAddKind('feature')} />Feature</label>
          </div>
          <p className="act-sub">{addKind === 'feature' ? <>Creates a Feature with the same form and rules as New Feature on every page: the Epic's Feature setup, the Epic's Area Path, the current PI (changeable), its User Stories in the Sprint, and your {label} Time Writing story and Task.</> : addKind === 'work' ? <>Adds a Task (not a Time Writing task) under one of the Feature's User Stories by the same rules as a User Story: assigned to you, in the story's Area Path and the Sprint you choose (the current one preselected) — with a description and, if you write one, a first comment in its Discussion.</> : addKind === 'task' ? <>Adds your {label} Time Writing task under a Feature — in your Time Writing user story there, which is created when you have none — so you can book hours on it.</> : <>Adds a User Story under a Feature by the same rules as New User Story everywhere: assigned to you, in the Feature's Area Path and the Sprint you choose (the current one preselected) — with a description and, if you write one, a first comment in its Discussion.</>}</p>
          <div className="act-form">
            {addKind !== 'feature' && <label>Epic<select value={stream} onChange={(event) => { setStream(event.target.value); setFeatureId('') }}><option value="">All Epics</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>#{epic.id} {epic.title}</option>)}</select>{chosenEpic && <span className="act-open">{idLink(chosenEpic)} {chosenEpic.title} ↗</span>}</label>}
            {addKind !== 'feature' && <div className="act-field"><span id="act-feature-label">Feature</span><SearchSelect label="Feature" value={featureId} placeholder={features.length ? 'Choose or type to search your Features (ID, title, Epic)' : 'No Active or New Features of yours here'} empty="No Feature of yours matches"
              options={features.map((feature) => ({ value: String(feature.id), label: `#${feature.id} ${feature.title}`, hint: epicOf(feature)?.title }))}
              onChange={(id) => { setFeatureId(id); const own = epicOf(features.find((feature) => feature.id === Number(id))!); if (own) setStream(String(own.id)) }} />{chosenFeature && <span className="act-open">{idLink(chosenFeature)} {chosenFeature.title} ↗</span>}</div>}
            {addKind === 'feature' ? <>
              <p className="act-hint">The New Feature form opens with {self ? 'you' : my.me.name} as the assignee and {label} as the Time Writing month. It applies the Epic's Feature setup (title fields, DoD, User Stories, Time Writing story and Task), else the built-in rules.</p>
              <button type="button" className="act-primary" disabled={Boolean(blocked) || !azure.config} title={blocked || undefined} onClick={() => setFeatureOpen(true)}>Open New Feature</button>
            </> : addKind === 'story' || addKind === 'work' ? <>
              {addKind === 'work' && <label>User Story<select value={storyId} onChange={(event) => setStoryId(event.target.value)} disabled={!chosenFeature}><option value="">{!chosenFeature ? 'Choose a Feature first' : taskStories.length ? 'Choose a User Story' : 'No open User Story under this Feature'}</option>{taskStories.map((item) => <option key={item.id} value={item.id}>#{item.id} {item.title}</option>)}</select></label>}
              <label>Title<input value={story.title} maxLength={255} placeholder={addKind === 'work' ? 'What needs to be done' : 'What the story is about'} onChange={(event) => setStory((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Description<textarea value={story.description} rows={4} placeholder="What needs to be done, and why" onChange={(event) => setStory((current) => ({ ...current, description: event.target.value }))} /></label>
              <label>Sprint<select value={sprint} onChange={(event) => setSprint(event.target.value)} disabled={!storyPairs.length}><option value="">{iterations == null ? (blocked ? 'Not available' : 'Loading the schedule…') : storyPairs.length ? 'Choose a Sprint' : 'No current or future Sprint'}</option>{storyPairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.pi.name} → {pair.sprint.name}</option>)}</select></label>
              <label>Comment <small className="muted">(optional, added to its Discussion)</small><textarea value={story.comment} rows={3} onChange={(event) => setStory((current) => ({ ...current, comment: event.target.value }))} /></label>
              {addKind === 'work' ? <button type="button" className="act-primary" disabled={!chosenStory || !story.title.trim() || !sprint || saving} onClick={saveWorkTask}>Add Task</button>
                : <button type="button" className="act-primary" disabled={!chosenFeature || !story.title.trim() || !sprint || saving} onClick={saveStory}>Add User Story</button>}
            </> : <>
            <label>Reporting period<input value={label} readOnly /></label>
            <div className="act-pair">
              <label>Planned hours<input inputMode="decimal" placeholder="0" disabled={planLocked} value={newValue('planned')} onChange={(event) => setNewHours((current) => ({ ...current, planned: event.target.value }))} /></label>
              <label>Actual hours<input inputMode="decimal" placeholder="0" disabled={actualLocked} value={newValue('actual')} onChange={(event) => setNewHours((current) => ({ ...current, actual: event.target.value }))} /></label>
            </div>
            {existingTask && <p className="act-hint">You already have this task for {label} (#{existingTask.id}). Its hours are shown above; what you save replaces them — nothing is added up, and no second task is created.</p>}
            {planLocked && <p className="act-hint">Planning for {label} is locked: a new task is tagged ad-hoc and takes actual hours only.</p>}
            <button type="button" className="act-primary" disabled={!chosenFeature || saving} onClick={saveNew}>Save activity</button>
            </>}
            {addKind !== 'feature' && <p className="act-sub">Feature not listed? <button type="button" className="act-link" onClick={() => setAddKind('feature')}>Create a new Feature</button></p>}
          </div>
        </section>
      </div>
    </div></>}
    {featureOpen && azure.config && (chosenEpic ?? epics[0]) && <FeatureEditor mode={{ parent: (chosenEpic ?? epics[0])! }} month={label} items={azure.items} config={azure.config} savedPat={azure.pat} me={assignee} canChoose={self && Boolean(assign?.canChoose)} featureSetup={featureSetup} onSavePat={azure.rememberPat} onCreated={azure.featureCreated} onClose={() => setFeatureOpen(false)}
      onDone={(done) => { setFeatureOpen(false); setMessage({ tone: 'success', text: `Feature #${done.feature.id} “${done.feature.title}”: ${done.text}` }); void azure.refresh() }}
      onPartial={(text) => { setFeatureOpen(false); setMessage({ tone: 'error', text }); void azure.refresh() }} />}
  </Page>
}
