import { listJobs, runInBackground, subscribeJobs } from '../backgroundJobs'
import { useState, useSyncExternalStore } from 'react'
import { PersonPicker } from '../components/PersonPicker'
import { AssigneeConfirm } from '../components/AssigneeConfirm'
import { EmptyState, Notice, Page, Panel, Pill } from '../components/ui'
import { currentIndiaMonth, currentIterationPairs, ensureMonthTask, readAzureIterations, updateAzureWorkItem, type AzureIteration } from '../azureDevOps'
import { capacityContext } from '../capacity'
import { adhocAfterLock } from '../planningLock'
import { assignablePeople, monthTaskCandidates, moveCandidates, nextStateFor, stateChecks, type MoveStates, type StateCheck } from '../myWork'
import { closeRelated } from '../closeChain'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { PageProps } from './types'

type Log = { tone: 'success' | 'error' | 'info'; text: string }
type Pair = { pi: AzureIteration; sprint: AzureIteration }
const shortPath = (path: string) => path.split('\\').slice(1).join(' › ') || path
const statusLabel = { exists: 'Has task', 'needs-task': 'Task missing', 'needs-story': 'Story + task missing', conflict: 'Choose story' } as const
const statusTone = { exists: 'open', 'needs-task': 'warning', 'needs-story': 'warning', conflict: 'danger' } as const

// Bulk changes to my work in Azure DevOps: move my pending User Stories from past Sprints to the current one, and add
// this month's Time Writing story + task for my Features. Each asks for confirmation; after it the data is refreshed.
// assign: who is creating (their email) and whether they may assign new work to someone else.
// The item's number as a link to it in Azure DevOps (new tab); plain text when no address is known.
function ItemLink({ item }: { item: Pick<AzureWorkItem, 'id' | 'url' | 'workItemType' | 'title'> }) {
  return item.url ? <a className="item-link" href={item.url} target="_blank" rel="noreferrer" title={`Open ${item.workItemType} #${item.id} in Azure DevOps`}>#{item.id}</a> : <>#{item.id}</>
}

export function BulkActionsPage({ azure, store, my, assign }: { azure: AzureWorkspace; store: PageProps['store']; my: MyWork; assign: { me: string; canChoose: boolean } }) {
  const [confirmTasks, setConfirmTasks] = useState(false)
  const [busy, setBusy] = useState('')
  // Move and month-task creation run as background jobs (top bar); their buttons wait while one runs.
  const jobs = useSyncExternalStore(subscribeJobs, listJobs)
  const moving = jobs.some((job) => job.key === 'bulk:move' && job.state === 'running'), creatingTasks = jobs.some((job) => job.key === 'bulk:tasks' && job.state === 'running')
  const [log, setLog] = useState<Log[]>([])
  const [pairs, setPairs] = useState<Pair[] | null>(null)
  const [target, setTarget] = useState('')
  const [skipMove, setSkipMove] = useState<Set<number>>(new Set())
  const [iterations, setIterations] = useState<AzureIteration[]>([])
  const [skipTask, setSkipTask] = useState<Set<number>>(new Set())
  const [moveStates, setMoveStates] = useState<MoveStates>('both')
  // The month-tasks list: show Features with a task, without one, or both; Select all / Deselect all act on the shown rows that can be created.
  const [taskFilter, setTaskFilter] = useState<'both' | 'with' | 'without'>('both')
  const { config, pat } = azure
  const month = currentIndiaMonth()
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: changes to Azure DevOps are disabled.' : !config || !pat.trim() ? 'Connect the Time Writing connection (with its PAT) to change items in Azure DevOps.' : ''
  // Both lists in ascending ID order.
  const toMove = (target ? moveCandidates(azure.items, my.me, target, iterations, absenceEpicId, undefined, moveStates) : []).toSorted((a, b) => a.item.id - b.item.id)
  const candidates = (my.known ? monthTaskCandidates(azure.items, my.me, month, absenceEpicId) : []).toSorted((a, b) => a.feature.id - b.feature.id)
  const missing = candidates.filter((row) => row.status === 'needs-task' || row.status === 'needs-story')
  const shownCandidates = candidates.filter((row) => taskFilter === 'both' || (taskFilter === 'with') === (row.status === 'exists'))
  const shownMissing = shownCandidates.filter((row) => row.status === 'needs-task' || row.status === 'needs-story')
  const selectShown = (on: boolean) => setSkipTask((current) => { const next = new Set(current); for (const row of shownMissing) { if (on) next.delete(row.feature.id); else next.add(row.feature.id) } return next })
  // State checks over the shown person's Features and User Stories (see stateChecks).
  const checks = my.known ? stateChecks(azure.items, my.me, absenceEpicId) : []
  const checkText: Record<StateCheck['kind'], (check: StateCheck) => string> = {
    'close-feature': (check) => `All ${check.children.length} User Stor${check.children.length === 1 ? 'y is' : 'ies are'} Closed: the Feature should be Closed too.`,
    'close-story': (check) => `All ${check.children.length} Task${check.children.length === 1 ? ' is' : 's are'} Closed: the User Story should be Closed too.`,
    'feature-needs-active-story': (check) => check.children.length ? `The Feature is Active but none of its ${check.children.length} User Stor${check.children.length === 1 ? 'y is' : 'ies are'} Active: set at least one to Active.` : 'The Feature is Active but has no User Story: add one and set it to Active.',
  }
  async function applyState(item: AzureWorkItem, state: string) {
    if (blocked || !config || !window.confirm(`Set ${item.workItemType} #${item.id} “${item.title}” to ${state} in Azure DevOps?`)) return
    setBusy(`check-${item.id}`)
    try {
      const updated = await updateAzureWorkItem(config, pat, item.id, { state }); azure.applyWorkItems([updated], 'State check', `#${item.id} ${item.state} → ${updated.state}`); note({ tone: 'success', text: `#${item.id} is now ${updated.state}.` })
      // Closing the last open User Story offers to close its Feature too (closeChain).
      if (state === 'Closed') { const result = await closeRelated(config, pat, azure.items, updated, (question) => window.confirm(question)); if (result.closed.length) { azure.applyWorkItems(result.closed, 'State check', result.closed.map((entry) => `#${entry.id} → ${entry.state}`).join(', ')); note({ tone: 'success', text: `Also closed ${result.closed.map((entry) => `#${entry.id}`).join(', ')}.` }) } for (const text of [...result.skipped, ...result.failed]) note({ tone: result.failed.includes(text) ? 'error' : 'info', text }) }
      note({ tone: 'info', text: 'Refreshing data…' }); await azure.refresh()
    }
    catch (failure) { note({ tone: 'error', text: `#${item.id}: ${failure instanceof Error ? failure.message : 'update failed'}` }) }
    finally { setBusy('') }
  }
  const note = (entry: Log) => setLog((current) => [entry, ...current].slice(0, 8))

  async function findSprint() {
    if (!config || !pat.trim()) return
    setBusy('sprint')
    try {
      const all = await readAzureIterations(config, pat)
      setIterations(all)
      const found = currentIterationPairs(all)
      setPairs(found); setTarget(found[0]?.sprint.path ?? ''); setSkipMove(new Set())
      if (!found.length) note({ tone: 'error', text: 'No current Sprint found: no team iteration with start and finish dates covering today under a PI.' })
    } catch (failure) { note({ tone: 'error', text: failure instanceof Error ? failure.message : 'Could not read iterations.' }) }
    finally { setBusy('') }
  }

  async function moveAll() {
    if (blocked || !config || !target) return
    const rows = toMove.filter(({ item }) => !skipMove.has(item.id))
    if (!rows.length || !window.confirm(`Move ${rows.length} item${rows.length === 1 ? '' : 's'} to ${shortPath(target)} in Azure DevOps?`)) return
    // A background job: the page stays usable; the top bar shows progress and the result.
    const started = runInBackground('bulk:move', `Move ${rows.length} item${rows.length === 1 ? '' : 's'} to ${shortPath(target)}`, async (progress) => {
      const updated: AzureWorkItem[] = [], failed: string[] = []
      for (const [index, { item }] of rows.entries()) {
        progress(`Moving ${index + 1} of ${rows.length}…`)
        try { updated.push(await updateAzureWorkItem(config, pat, item.id, { iterationPath: target })) } catch (failure) { failed.push(`#${item.id}: ${failure instanceof Error ? failure.message : 'failed'}`) }
      }
      azure.applyWorkItems(updated, 'Move to current sprint', `${updated.length} item(s) moved to ${target}`)
      const text = `${updated.length} moved to ${shortPath(target)}.${failed.length ? ` ${failed.length} failed — ${failed.join(' · ')}` : ''}`
      note({ tone: failed.length ? 'error' : 'success', text })
      if (updated.length) { progress('Refreshing the backlog…'); await azure.refresh() }
      return { text, failed: failed.length > 0 }
    })
    if (!started) note({ tone: 'info', text: 'A move is already running in the background (see the top bar).' })
  }

  // The month Tasks go to the person chosen in the confirmation (by default the person whose work is shown).
  const shownEmail = my.me.email ?? (my.me.name ? azure.items.find((item) => item.assignedTo === my.me.name && item.assignedToEmail)?.assignedToEmail : undefined) ?? ''
  async function createTasks(assignee: string) {
    if (blocked || !config) return
    const rows = missing.filter((row) => !skipTask.has(row.feature.id))
    if (!rows.length) return
    setConfirmTasks(false)
    const started = runInBackground('bulk:tasks', `Create ${month} Time Writing tasks (${rows.length})`, async (progress) => {
    const changed: AzureWorkItem[] = [], failed: string[] = []
    let created = 0, existed = 0
    // Planning of the month has locked: the new Tasks are tagged ad-hoc (existing ones are left as they are).
    const adhoc = adhocAfterLock(month)
    for (const [index, row] of rows.entries()) {
      progress(`Feature ${index + 1} of ${rows.length}…`)
      try {
        const result = await ensureMonthTask(config, pat, row.feature.id, assignee, month, undefined, adhoc)
        changed.push(result.task, ...(result.storyCreated ? [result.story] : []))
        if (result.status === 'created') created += 1; else existed += 1
      } catch (failure) { failed.push(`#${row.feature.id}: ${failure instanceof Error ? failure.message : 'failed'}`) }
    }
    azure.applyWorkItems(changed, 'Create month tasks', `${created} ${month} Time Writing task(s) created, ${existed} already existed`)
    const text = `${created} task${created === 1 ? '' : 's'} created${created && adhoc ? ' (tagged ad-hoc: planning is locked)' : ''}${existed ? `, ${existed} already existed (not duplicated)` : ''}.${failed.length ? ` ${failed.length} failed — ${failed.join(' · ')}` : ''}`
    note({ tone: failed.length ? 'error' : 'success', text })
    if (changed.length) { progress('Refreshing the backlog…'); await azure.refresh() }
    return { text, failed: failed.length > 0 }
    })
    if (!started) note({ tone: 'info', text: 'Month tasks are already being created in the background (see the top bar).' })
  }

  return <Page>
    <section className="me-bar">
      <div><span className="eyebrow">WORK ASSIGNED TO</span><strong>{my.me.name ?? my.me.email ?? 'Not set'}</strong>{my.me.email && <small>{my.me.email}</small>}</div>
      <label>Show work for<PersonPicker label="Show work for" value={my.chosenName} people={my.people} onChange={my.setName} meLabel={my.me.email ? 'Me (connection email)' : 'Choose a person…'} /></label>
    </section>
    {!my.known ? <EmptyState title="Who are you in Azure DevOps?" detail="Set the Feature creator email on your Time Writing connection, or choose your name above." />
      : <>
        {blocked && <Notice tone="warning">{blocked}</Notice>}
        {log.map((entry, index) => <Notice key={index} tone={entry.tone}>{entry.text}</Notice>)}
        <div className="action-grid">
          <Panel className="action-card" eyebrow="BULK" title="Move to current PI + Sprint" info="Finds today’s Sprint (and its PI) from the team’s iteration dates, then moves your User Stories in the chosen states (New, Active or both) that are still in a past Sprint. Stories already in the current or a future Sprint, and Features and Tasks, are not touched.">
            {!pairs ? <button type="button" className="primary" disabled={Boolean(blocked) || busy === 'sprint'} onClick={() => void findSprint()}>{busy === 'sprint' ? 'Reading iterations…' : 'Find current Sprint'}</button>
              : !pairs.length ? <EmptyState title="No current Sprint found." detail="Check the team’s iteration dates in Azure DevOps." />
                : <>
                  <div className="view-switch" role="group" aria-label="States to move"><span>States</span><div className="segmented">{([['new', 'New'], ['active', 'Active'], ['both', 'Both']] as const).map(([value, text]) => <button key={value} type="button" aria-pressed={moveStates === value} onClick={() => { setMoveStates(value); setSkipMove(new Set()) }}>{text}</button>)}</div></div>
                  <label>Target<select value={target} onChange={(event) => { setTarget(event.target.value); setSkipMove(new Set()) }}>{pairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.pi.name} › {pair.sprint.name} ({pair.sprint.attributes?.startDate?.slice(0, 10)} – {pair.sprint.attributes?.finishDate?.slice(0, 10)})</option>)}</select></label>
                  {toMove.length ? <ul className="pick-list">{toMove.map(({ item }) => <li key={item.id}><label className="check"><input type="checkbox" checked={!skipMove.has(item.id)} onChange={(event) => setSkipMove((current) => { const next = new Set(current); if (event.target.checked) next.delete(item.id); else next.add(item.id); return next })} /><Pill>{item.workItemType}</Pill><ItemLink item={item} /> {item.title}<small>{shortPath(item.iterationPath)}</small></label></li>)}</ul> : <p className="muted">All your pending items are already in this Sprint.</p>}
                  <div className="button-row"><button type="button" className="primary" disabled={Boolean(blocked) || moving || !toMove.some(({ item }) => !skipMove.has(item.id))} onClick={() => void moveAll()}>{moving ? 'Moving…' : ((count) => `Move ${count} item${count === 1 ? '' : 's'}`)(toMove.filter(({ item }) => !skipMove.has(item.id)).length)}</button></div>
                </>}
          </Panel>
          <Panel className="action-card" eyebrow="BULK" title={`${month} Time Writing tasks`} info="For each of your pending Features (or Features holding your pending work): adds “<Feature> - Time Writing” if missing and a “<Month> | <Feature>” Task assigned to you. Azure is re-checked first, so nothing is duplicated.">
            {candidates.length > 0 && <div className="pick-tools">
              <div className="view-switch" role="group" aria-label="Features to show"><span>Show</span><div className="segmented">{([['without', `Without task ${candidates.length - candidates.filter((row) => row.status === 'exists').length}`], ['with', `With task ${candidates.filter((row) => row.status === 'exists').length}`], ['both', `Both ${candidates.length}`]] as const).map(([value, text]) => <button key={value} type="button" aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)}>{text}</button>)}</div></div>
              <div className="button-row"><button type="button" className="ghost" disabled={!shownMissing.length || shownMissing.every((row) => !skipTask.has(row.feature.id))} onClick={() => selectShown(true)}>Select all</button><button type="button" className="ghost" disabled={!shownMissing.length || shownMissing.every((row) => skipTask.has(row.feature.id))} onClick={() => selectShown(false)}>Deselect all</button><small className="muted">{missing.filter((row) => !skipTask.has(row.feature.id)).length} of {missing.length} selected</small></div>
            </div>}
            {candidates.length ? shownCandidates.length ? <ul className="pick-list">{shownCandidates.map((row) => <li key={row.feature.id}><label className="check"><input type="checkbox" disabled={row.status === 'exists' || row.status === 'conflict'} checked={(row.status === 'needs-task' || row.status === 'needs-story') && !skipTask.has(row.feature.id)} onChange={(event) => setSkipTask((current) => { const next = new Set(current); if (event.target.checked) next.delete(row.feature.id); else next.add(row.feature.id); return next })} /><Pill tone={statusTone[row.status]}>{statusLabel[row.status]}</Pill><ItemLink item={row.feature} /> {row.feature.title}</label></li>)}</ul> : <p className="muted">{taskFilter === 'with' ? 'No Feature has its task yet.' : 'Every Feature has its task.'}</p> : <p className="muted">No pending Features for you.</p>}
            <div className="button-row"><button type="button" className="primary" disabled={Boolean(blocked) || creatingTasks || !missing.some((row) => !skipTask.has(row.feature.id))} onClick={() => setConfirmTasks(true)}>{creatingTasks ? 'Creating…' : ((count) => `Create ${count} task${count === 1 ? '' : 's'}`)(missing.filter((row) => !skipTask.has(row.feature.id)).length)}</button></div>
          </Panel>
        </div>
        <Panel className="action-card state-checks" eyebrow="CHECK" title="State checks" info="Your Features and User Stories whose state does not match their children: all User Stories Closed → close the Feature; all Tasks Closed → close the User Story; an Active Feature needs at least one Active User Story. A Feature is closed only from Active.">
          {checks.length ? <div className="azure-table"><table><thead><tr><th>Work item</th><th>State</th><th>Check</th><th /></tr></thead><tbody>{checks.map((check) => {
            const next = check.kind === 'feature-needs-active-story' ? null : nextStateFor(check.item)
            return <tr key={`${check.kind}-${check.item.id}`}>
              <td><ItemLink item={check.item} /> {check.item.title}<small>{check.item.workItemType}</small></td>
              <td><Pill tone={check.kind === 'feature-needs-active-story' ? 'warning' : 'danger'}>{check.item.state}</Pill></td>
              <td>{checkText[check.kind](check)}</td>
              <td>{next ? <button type="button" className="ghost" disabled={Boolean(blocked) || busy === `check-${check.item.id}`} onClick={() => void applyState(check.item, next.state)}>{busy === `check-${check.item.id}` ? 'Saving…' : next.label}</button> : check.kind === 'feature-needs-active-story' ? <a href={check.item.url} target="_blank" rel="noreferrer">Open in Azure DevOps</a> : null}</td>
            </tr>
          })}</tbody></table></div> : <EmptyState title="Nothing to fix." detail="Every Feature and User Story matches the state of its children." />}
        </Panel>
      </>}
    {confirmTasks && <AssigneeConfirm title={`Create ${month} Time Writing tasks`} people={assignablePeople(azure.items)} me={assign.me} initial={shownEmail} canChoose={assign.canChoose} busy={creatingTasks} confirmLabel="Create tasks"
      summary={<>Creates the “{month}” Time Writing Task (and the Time Writing User Story where missing) for {missing.filter((row) => !skipTask.has(row.feature.id)).length} Feature(s), assigned to the person below. Existing tasks of that person are re-checked in Azure DevOps and never duplicated.{adhocAfterLock(month) && <> Planning for {month} is locked: new Tasks are tagged <code>ad-hoc</code>.</>}</>}
      onCancel={() => setConfirmTasks(false)} onConfirm={(email) => void createTasks(email)} />}
  </Page>
}
