import { useState } from 'react'
import { EmptyState, Notice, Page, Panel, Pill } from '../components/ui'
import { currentIndiaMonth, currentIterationPairs, ensureMonthTask, readAzureIterations, updateAzureWorkItem, type AzureIteration } from '../azureDevOps'
import { capacityContext } from '../capacity'
import { monthTaskCandidates, moveCandidates } from '../myWork'
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
export function BulkActionsPage({ azure, store, my }: { azure: AzureWorkspace; store: PageProps['store']; my: MyWork }) {
  const [busy, setBusy] = useState('')
  const [log, setLog] = useState<Log[]>([])
  const [pairs, setPairs] = useState<Pair[] | null>(null)
  const [target, setTarget] = useState('')
  const [skipMove, setSkipMove] = useState<Set<number>>(new Set())
  const [iterations, setIterations] = useState<AzureIteration[]>([])
  const [skipTask, setSkipTask] = useState<Set<number>>(new Set())
  const { config, pat } = azure
  const month = currentIndiaMonth()
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: changes to Azure DevOps are disabled.' : !config || !pat.trim() ? 'Connect the Time Writing connection (with its PAT) to change items in Azure DevOps.' : ''
  // Both lists in ascending ID order.
  const toMove = (target ? moveCandidates(azure.items, my.me, target, iterations, absenceEpicId) : []).toSorted((a, b) => a.item.id - b.item.id)
  const candidates = (my.known ? monthTaskCandidates(azure.items, my.me, month, absenceEpicId) : []).toSorted((a, b) => a.feature.id - b.feature.id)
  const missing = candidates.filter((row) => row.status === 'needs-task' || row.status === 'needs-story')
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
    setBusy('move')
    const updated: AzureWorkItem[] = [], failed: string[] = []
    for (const { item } of rows) {
      try { updated.push(await updateAzureWorkItem(config, pat, item.id, { iterationPath: target })) } catch (failure) { failed.push(`#${item.id}: ${failure instanceof Error ? failure.message : 'failed'}`) }
    }
    azure.applyWorkItems(updated, 'Move to current sprint', `${updated.length} item(s) moved to ${target}`)
    note({ tone: failed.length ? 'error' : 'success', text: `${updated.length} moved to ${shortPath(target)}.${failed.length ? ` ${failed.length} failed — ${failed.join(' · ')}` : ''}` })
    if (updated.length) await azure.refresh()
    setBusy('')
  }

  async function createTasks() {
    if (blocked || !config) return
    if (!my.me.email) { note({ tone: 'error', text: 'Month tasks are created for you only: set your Azure DevOps email as the Feature creator email on the Time Writing connection and show your own work.' }); return }
    const rows = missing.filter((row) => !skipTask.has(row.feature.id))
    if (!rows.length || !window.confirm(`Create “${month}” Time Writing tasks for ${rows.length} Feature${rows.length === 1 ? '' : 's'}, assigned to ${my.me.email}? Existing tasks are re-checked in Azure DevOps and never duplicated.`)) return
    setBusy('tasks')
    const changed: AzureWorkItem[] = [], failed: string[] = []
    let created = 0, existed = 0
    for (const row of rows) {
      try {
        const result = await ensureMonthTask(config, pat, row.feature.id, my.me.email, month)
        changed.push(result.task, ...(result.storyCreated ? [result.story] : []))
        if (result.status === 'created') created += 1; else existed += 1
      } catch (failure) { failed.push(`#${row.feature.id}: ${failure instanceof Error ? failure.message : 'failed'}`) }
    }
    azure.applyWorkItems(changed, 'Create month tasks', `${created} ${month} Time Writing task(s) created, ${existed} already existed`)
    note({ tone: failed.length ? 'error' : 'success', text: `${created} task${created === 1 ? '' : 's'} created${existed ? `, ${existed} already existed (not duplicated)` : ''}.${failed.length ? ` ${failed.length} failed — ${failed.join(' · ')}` : ''}` })
    if (changed.length) await azure.refresh()
    setBusy('')
  }

  return <Page>
    <section className="me-bar">
      <div><span className="eyebrow">WORK ASSIGNED TO</span><strong>{my.me.name ?? my.me.email ?? 'Not set'}</strong>{my.me.email && <small>{my.me.email}</small>}</div>
      <label>Show work for<select value={my.chosenName} onChange={(event) => my.setName(event.target.value)}><option value="">{my.me.email ? 'Me (connection email)' : 'Choose a person…'}</option>{my.people.map((person) => <option key={person}>{person}</option>)}</select></label>
    </section>
    {!my.known ? <EmptyState title="Who are you in Azure DevOps?" detail="Set the Feature creator email on your Time Writing connection, or choose your name above." />
      : <>
        {blocked && <Notice tone="warning">{blocked}</Notice>}
        {log.map((entry, index) => <Notice key={index} tone={entry.tone}>{entry.text}</Notice>)}
        <div className="action-grid">
          <Panel className="action-card" eyebrow="BULK" title="Move to current PI + Sprint" detail="Finds today’s Sprint (and its PI) from the team’s iteration dates, then moves your pending User Stories that are still in a past Sprint. Stories already in the current or a future Sprint, and Features and Tasks, are not touched.">
            {!pairs ? <button type="button" className="primary" disabled={Boolean(blocked) || busy === 'sprint'} onClick={() => void findSprint()}>{busy === 'sprint' ? 'Reading iterations…' : 'Find current Sprint'}</button>
              : !pairs.length ? <EmptyState title="No current Sprint found." detail="Check the team’s iteration dates in Azure DevOps." />
                : <>
                  <label>Target<select value={target} onChange={(event) => { setTarget(event.target.value); setSkipMove(new Set()) }}>{pairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.pi.name} › {pair.sprint.name} ({pair.sprint.attributes?.startDate?.slice(0, 10)} – {pair.sprint.attributes?.finishDate?.slice(0, 10)})</option>)}</select></label>
                  {toMove.length ? <ul className="pick-list">{toMove.map(({ item }) => <li key={item.id}><label className="check"><input type="checkbox" checked={!skipMove.has(item.id)} onChange={(event) => setSkipMove((current) => { const next = new Set(current); if (event.target.checked) next.delete(item.id); else next.add(item.id); return next })} /><Pill>{item.workItemType}</Pill>#{item.id} {item.title}<small>{shortPath(item.iterationPath)}</small></label></li>)}</ul> : <p className="muted">All your pending items are already in this Sprint.</p>}
                  <div className="button-row"><button type="button" className="primary" disabled={Boolean(blocked) || busy === 'move' || !toMove.some(({ item }) => !skipMove.has(item.id))} onClick={() => void moveAll()}>{busy === 'move' ? 'Moving…' : ((count) => `Move ${count} item${count === 1 ? '' : 's'}`)(toMove.filter(({ item }) => !skipMove.has(item.id)).length)}</button></div>
                </>}
          </Panel>
          <Panel className="action-card" eyebrow="BULK" title={`${month} Time Writing tasks`} detail="For each of your pending Features (or Features holding your pending work): adds “<Feature> - Time Writing” if missing and a “<Month> | <Feature>” Task assigned to you. Azure is re-checked first, so nothing is duplicated.">
            {candidates.length ? <ul className="pick-list">{candidates.map((row) => <li key={row.feature.id}><label className="check"><input type="checkbox" disabled={row.status === 'exists' || row.status === 'conflict'} checked={(row.status === 'needs-task' || row.status === 'needs-story') && !skipTask.has(row.feature.id)} onChange={(event) => setSkipTask((current) => { const next = new Set(current); if (event.target.checked) next.delete(row.feature.id); else next.add(row.feature.id); return next })} /><Pill tone={statusTone[row.status]}>{statusLabel[row.status]}</Pill>#{row.feature.id} {row.feature.title}</label></li>)}</ul> : <p className="muted">No pending Features for you.</p>}
            <div className="button-row"><button type="button" className="primary" disabled={Boolean(blocked) || busy === 'tasks' || !missing.some((row) => !skipTask.has(row.feature.id))} onClick={() => void createTasks()}>{busy === 'tasks' ? 'Creating…' : ((count) => `Create ${count} task${count === 1 ? '' : 's'}`)(missing.filter((row) => !skipTask.has(row.feature.id)).length)}</button></div>
          </Panel>
        </div>
      </>}
  </Page>
}
