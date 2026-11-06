import { useState, useSyncExternalStore } from 'react'
import { isRunning, runInBackground, subscribeJobs } from '../backgroundJobs'
import { addComment, createAzureFeature, createUserStory, currentIterationPairs, ensureAbsenceStoryMonthTask, ensureMonthTask, ensureStoryMonthTask, readAzureIterations, updateAzureTimeWritingEffort, updateAzureWorkItem, withFeatureDoD, type AzureConfig } from '../azureDevOps'
import { azureInsights, timeWritingMonth } from '../azureInsights'
import { capacityContext } from '../capacity'
import { PersonPicker } from '../components/PersonPicker'
import { SearchSelect } from '../components/SearchSelect'
import { EmptyState, Metric, Metrics, Page } from '../components/ui'
import { personMonths, totals } from '../dashboard'
import type { AzureWorkItem } from '../domain'
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

export function MyActivitiesPage({ azure, store, my, month, assign, onOpen }: { azure: AzureWorkspace; store: PageProps['store']; my: MyWork; month: string; assign?: { me: string; canChoose: boolean }; onOpen: (page: 'mywork' | 'bulk') => void }) {
  const now = useNow(60000)
  const [ticked, setTicked] = useState<Record<string, boolean>>({})
  const [hours, setHours] = useState<Record<string, Hours>>({})
  const [stream, setStream] = useState('')
  const [featureId, setFeatureId] = useState('')
  const [newHours, setNewHours] = useState<Hours>({})
  // Add a new activity adds a Time Writing task, or a User Story (title, description, an optional first comment).
  const [addKind, setAddKind] = useState<'task' | 'story' | 'feature'>('task')
  // A new Feature (ACT-12): under the chosen Epic, assigned to the person, with its mandatory DoD.
  const [draft, setDraft] = useState({ title: '', dod: '', description: '', withTask: true, withStory: false, storyTitle: '', storyDescription: '', storyComment: '' })
  const [story, setStory] = useState({ title: '', description: '', comment: '' })
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
  // ACT-10: a month Task added under a Feature still in state New makes the Feature Active (work has started).
  const activated = new Set<number>()
  async function activateIfNew(config: AzureConfig, pat: string, feature: AzureWorkItem, failed: string[]) {
    if (feature.state.trim().toLowerCase() !== 'new' || activated.has(feature.id)) return
    activated.add(feature.id)
    try { await updateAzureWorkItem(config, pat, feature.id, { state: 'Active' }) } catch (failure) { failed.push(`#${feature.id} could not be set to Active: ${failure instanceof Error ? failure.message : 'failed'}`) }
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
          const result = candidate.story ? await ensureStoryMonthTask(config, pat, candidate.story.id, assignee, label, undefined, planLocked)
            : candidate.leave && candidate.kind ? await ensureAbsenceStoryMonthTask(config, pat, candidate.feature.id, candidate.kind, candidate.storyTitle, absenceStoryType, assignee, label, undefined, planLocked)
            : await ensureMonthTask(config, pat, candidate.feature.id, assignee, label, undefined, planLocked)
          const effort = effortOf(edits[row.key] ?? {})
          if (effort.plan != null || effort.actual != null) await updateAzureTimeWritingEffort(config, pat, result.task.id, effort.plan, effort.actual)
          if (result.status === 'created') await activateIfNew(config, pat, candidate.feature, failed)
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

  function saveStory() {
    if (blocked) { setMessage({ tone: 'info', text: blocked }); return }
    if (!chosenFeature) return
    const title = story.title.trim()
    if (!title || title.length > 255) { setMessage({ tone: 'error', text: 'Enter a User Story title of 1–255 characters.' }); return }
    const config = azure.config!, pat = azure.pat, feature = chosenFeature, entry = { title, description: story.description.trim(), comment: story.comment.trim() }
    const started = runInBackground('activities:save', `New User Story “${title}”`, async (progress) => {
      try {
        // The story goes into the current Sprint of the team (else the Feature's iteration), assigned to the person.
        progress('Reading the current Sprint…')
        const sprint = currentIterationPairs(await readAzureIterations(config, pat))[0]?.sprint.path || feature.iterationPath || config.project
        progress('Creating the User Story…')
        const created = await createUserStory(config, pat, { parentId: feature.id, title: entry.title, description: entry.description, acceptanceCriteria: '', iterationPath: sprint, assignedTo: assignee })
        let note = ''
        if (entry.comment) { try { progress('Adding the comment…'); await addComment(config, pat, created.id, entry.comment) } catch (failure) { note = ` The comment could not be added: ${failure instanceof Error ? failure.message : 'failed'}` } }
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

  function saveFeature() {
    if (blocked) { setMessage({ tone: 'info', text: blocked }); return }
    const epic = chosenEpic, title = draft.title.trim()
    if (!epic) { setMessage({ tone: 'error', text: 'Choose the Epic the Feature belongs to.' }); return }
    if (!title || title.length > 255) { setMessage({ tone: 'error', text: 'Enter a Feature title of 1–255 characters.' }); return }
    let description: string
    try { description = withFeatureDoD(draft.dod, draft.description) } catch (failure) { setMessage({ tone: 'error', text: failure instanceof Error ? failure.message : 'Enter the Feature DoD.' }); return }
    const entry: Hours = draft.withTask ? { planned: newHours.planned, actual: newHours.actual } : {}
    const problem = checkHours([entry])
    if (problem) { setMessage({ tone: 'error', text: problem }); return }
    const storyEntry = draft.withStory ? { title: draft.storyTitle.trim(), description: draft.storyDescription.trim(), comment: draft.storyComment.trim() } : null
    if (storyEntry && (!storyEntry.title || storyEntry.title.length > 255)) { setMessage({ tone: 'error', text: 'Enter a User Story title of 1–255 characters.' }); return }
    const config = azure.config!, pat = azure.pat, withTask = draft.withTask
    const started = runInBackground('activities:save', `New Feature “${title}”`, async (progress) => {
      try {
        // The Feature goes into the team's current PI (else Azure's default), assigned to the person.
        progress('Reading the current PI…')
        const current = currentIterationPairs(await readAzureIterations(config, pat))[0]
        const pi = current?.pi.path
        progress('Creating the Feature…')
        const feature = await createAzureFeature(config, pat, { parentId: epic.id, title, description, acceptanceCriteria: '', iterationPath: pi, assignedTo: assignee })
        const notes: string[] = []
        // ACT-13: a User Story under the new Feature, assigned to the person, in the current Sprint (else the PI).
        let storyNote = ''
        if (storyEntry) {
          try {
            progress('Creating the User Story…')
            const created = await createUserStory(config, pat, { parentId: feature.id, title: storyEntry.title, description: storyEntry.description, acceptanceCriteria: '', iterationPath: current?.sprint.path || pi || config.project, assignedTo: assignee })
            storyNote = ` User Story #${created.id} added under it.`
            if (storyEntry.comment) { try { await addComment(config, pat, created.id, storyEntry.comment) } catch (failure) { notes.push(`The comment could not be added: ${failure instanceof Error ? failure.message : 'failed'}`) } }
          } catch (failure) { notes.push(`The User Story could not be added: ${failure instanceof Error ? failure.message : 'failed'}`) }
        }
        if (withTask) {
          try {
            progress('Adding the month task…')
            const result = await ensureMonthTask(config, pat, feature.id, assignee, label, undefined, planLocked)
            const effort = effortOf(entry)
            if (effort.plan != null || effort.actual != null) await updateAzureTimeWritingEffort(config, pat, result.task.id, effort.plan, effort.actual)
            await activateIfNew(config, pat, feature, notes)
          } catch (failure) { notes.push(`The ${label} task could not be added: ${failure instanceof Error ? failure.message : 'failed'}`) }
        }
        setDraft({ title: '', dod: '', description: '', withTask: true, withStory: false, storyTitle: '', storyDescription: '', storyComment: '' }); setNewHours({})
        await azure.refresh()
        const text = `Feature #${feature.id} “${feature.title}” created under ${epic.title}${withTask && !notes.length ? `, with your ${label} task; it is now Active` : ''}.${storyNote}${notes.length ? ` ${notes.join(' ')}` : ''}`
        setMessage({ tone: notes.length ? 'error' : 'success', text })
        return { text, failed: notes.length > 0 }
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : 'The Feature could not be created.'
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
        const result = await ensureMonthTask(config, pat, feature.id, assignee, label, undefined, planLocked)
        const effort = effortOf(entry)
        if (effort.plan != null || effort.actual != null) await updateAzureTimeWritingEffort(config, pat, result.task.id, effort.plan, effort.actual)
        const activation: string[] = []
        if (result.status === 'created') await activateIfNew(config, pat, feature, activation)
        setNewHours({}); setFeatureId('')
        await azure.refresh()
        const text = (result.status === 'exists' ? `${feature.title} already had its ${label} task; its hours were updated.` : `${feature.title} added for ${label}${feature.state.trim().toLowerCase() === 'new' && !activation.length ? '; the Feature is now Active' : ''}.`) + (activation.length ? ` ${activation.join(' ')}` : '')
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
            <label className={addKind === 'feature' ? 'active' : undefined}><input type="radio" name="act-add-kind" checked={addKind === 'feature'} onChange={() => setAddKind('feature')} />Feature</label>
          </div>
          <p className="act-sub">{addKind === 'feature' ? <>Creates a Feature under an Active Epic, assigned to you, in the team's current PI — with its Feature DoD — and, if you keep it ticked, your {label} Time Writing task with its hours (the Feature is then Active).</> : addKind === 'task' ? <>Adds your {label} Time Writing task under a Feature — in your Time Writing user story there, which is created when you have none — so you can book hours on it.</> : <>Adds a User Story under a Feature, assigned to you, in the team's current Sprint — with a description and, if you write one, a first comment in its Discussion.</>}</p>
          <div className="act-form">
            <label>Epic<select value={stream} onChange={(event) => { setStream(event.target.value); setFeatureId('') }}><option value="">{addKind === 'feature' ? 'Choose an Active Epic' : 'All Epics'}</option>{epics.map((epic) => <option key={epic.id} value={epic.id}>#{epic.id} {epic.title}</option>)}</select>{chosenEpic && <span className="act-open">{idLink(chosenEpic)} {chosenEpic.title} ↗</span>}</label>
            {addKind !== 'feature' && <div className="act-field"><span id="act-feature-label">Feature</span><SearchSelect label="Feature" value={featureId} placeholder={features.length ? 'Choose or type to search your Features (ID, title, Epic)' : 'No Active or New Features of yours here'} empty="No Feature of yours matches"
              options={features.map((feature) => ({ value: String(feature.id), label: `#${feature.id} ${feature.title}`, hint: epicOf(feature)?.title }))}
              onChange={(id) => { setFeatureId(id); const own = epicOf(features.find((feature) => feature.id === Number(id))!); if (own) setStream(String(own.id)) }} />{chosenFeature && <span className="act-open">{idLink(chosenFeature)} {chosenFeature.title} ↗</span>}</div>}
            {addKind === 'feature' ? <>
              <label>Feature title<input value={draft.title} maxLength={255} placeholder="What the Feature delivers" onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Feature DoD <small className="muted">(required)</small><textarea value={draft.dod} rows={2} placeholder="When is this Feature done?" onChange={(event) => setDraft((current) => ({ ...current, dod: event.target.value }))} /></label>
              <label>Description <small className="muted">(optional)</small><textarea value={draft.description} rows={3} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className="act-check"><input type="checkbox" checked={draft.withTask} onChange={(event) => setDraft((current) => ({ ...current, withTask: event.target.checked }))} />Add my {label} Time Writing task</label>
              <label className="act-check"><input type="checkbox" checked={draft.withStory} onChange={(event) => setDraft((current) => ({ ...current, withStory: event.target.checked }))} />Add a User Story under it</label>
              {draft.withStory && <>
                <label>User Story title<input value={draft.storyTitle} maxLength={255} placeholder="What the story is about" onChange={(event) => setDraft((current) => ({ ...current, storyTitle: event.target.value }))} /></label>
                <label>User Story description<textarea value={draft.storyDescription} rows={3} placeholder="What needs to be done, and why" onChange={(event) => setDraft((current) => ({ ...current, storyDescription: event.target.value }))} /></label>
                <label>Comment <small className="muted">(optional, added to its Discussion)</small><textarea value={draft.storyComment} rows={2} onChange={(event) => setDraft((current) => ({ ...current, storyComment: event.target.value }))} /></label>
              </>}
              {draft.withTask && <div className="act-pair">
                <label>Planned hours<input inputMode="decimal" placeholder="0" disabled={planLocked} value={newHours.planned ?? ''} onChange={(event) => setNewHours((current) => ({ ...current, planned: event.target.value }))} /></label>
                <label>Actual hours<input inputMode="decimal" placeholder="0" disabled={actualLocked} value={newHours.actual ?? ''} onChange={(event) => setNewHours((current) => ({ ...current, actual: event.target.value }))} /></label>
              </div>}
              <button type="button" className="act-primary" disabled={!chosenEpic || !draft.title.trim() || !draft.dod.trim() || (draft.withStory && !draft.storyTitle.trim()) || saving} onClick={saveFeature}>Create Feature</button>
            </> : addKind === 'story' ? <>
              <label>Title<input value={story.title} maxLength={255} placeholder="What the story is about" onChange={(event) => setStory((current) => ({ ...current, title: event.target.value }))} /></label>
              <label>Description<textarea value={story.description} rows={4} placeholder="What needs to be done, and why" onChange={(event) => setStory((current) => ({ ...current, description: event.target.value }))} /></label>
              <label>Comment <small className="muted">(optional, added to its Discussion)</small><textarea value={story.comment} rows={3} onChange={(event) => setStory((current) => ({ ...current, comment: event.target.value }))} /></label>
              <button type="button" className="act-primary" disabled={!chosenFeature || !story.title.trim() || saving} onClick={saveStory}>Add User Story</button>
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
  </Page>
}
