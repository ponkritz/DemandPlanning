import { listJobs, runInBackground, subscribeJobs } from '../backgroundJobs'
import { DataTable } from '../components/DataTable'
import { useState, useSyncExternalStore } from 'react'
import { PersonPicker } from '../components/PersonPicker'
import { EmptyState, Notice, Page, Panel, Pill } from '../components/ui'
import { currentIterationPairs, readAzureIterations, updateAzureWorkItem, type AzureIteration } from '../azureDevOps'
import { capacityContext } from '../capacity'
import { moveCandidates, nextStateFor, stateChecks, type MoveStates, type StateCheck } from '../myWork'
import { closeRelated } from '../closeChain'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { PageProps } from './types'

type Log = { tone: 'success' | 'error' | 'info'; text: string }
type Pair = { pi: AzureIteration; sprint: AzureIteration }
const shortPath = (path: string) => path.split('\\').slice(1).join(' › ') || path

// Sprint check (ATM-07…ATM-09, ATM-20; formerly Bulk actions): move my pending User Stories from past Sprints to the current
// one, and the state checks of my Features and User Stories. Each asks for confirmation; after it the data is refreshed.
// Month Time Writing tasks are added on My Activities.
// assign: who is creating (their email) and whether they may assign new work to someone else.
// The item's number as a link to it in Azure DevOps (new tab); plain text when no address is known.
function ItemLink({ item }: { item: Pick<AzureWorkItem, 'id' | 'url' | 'workItemType' | 'title'> }) {
  return item.url ? <a className="item-link" href={item.url} target="_blank" rel="noreferrer" title={`Open ${item.workItemType} #${item.id} in Azure DevOps`}>#{item.id}</a> : <>#{item.id}</>
}

export function SprintCheckPage({ azure, store, my }: { azure: AzureWorkspace; store: PageProps['store']; my: MyWork }) {
  const [busy, setBusy] = useState('')
  // Move runs as a background job (top bar); its button waits while one runs.
  const jobs = useSyncExternalStore(subscribeJobs, listJobs)
  const moving = jobs.some((job) => job.key === 'bulk:move' && job.state === 'running')
  const [log, setLog] = useState<Log[]>([])
  const [pairs, setPairs] = useState<Pair[] | null>(null)
  const [target, setTarget] = useState('')
  const [skipMove, setSkipMove] = useState<Set<number>>(new Set())
  const [iterations, setIterations] = useState<AzureIteration[]>([])
  const [moveStates, setMoveStates] = useState<MoveStates>('both')
  const { config, pat } = azure
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: changes to Azure DevOps are disabled.' : !config || !pat.trim() ? 'Connect the Time Writing connection (with its PAT) to change items in Azure DevOps.' : ''
  // Both lists in ascending ID order.
  const toMove = (target ? moveCandidates(azure.items, my.me, target, iterations, absenceEpicId, undefined, moveStates) : []).toSorted((a, b) => a.item.id - b.item.id)
  // State checks over the shown person's Features and User Stories (see stateChecks).
  const checks = my.known ? stateChecks(azure.items, my.me, absenceEpicId) : []
  const checkText: Record<StateCheck['kind'], (check: StateCheck) => string> = {
    'close-feature': (check) => `All ${check.children.length} User Stor${check.children.length === 1 ? 'y is' : 'ies are'} Closed: the Feature should be Closed too.`,
    'close-story': (check) => `All ${check.children.length} Task${check.children.length === 1 ? ' is' : 's are'} Closed: the User Story should be Closed too.`,
    'activate-feature': (check) => `${check.children.length} of its User Stor${check.children.length === 1 ? 'y is' : 'ies are'} Active: the Feature should be Active too.`,
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
          <Panel className="action-card" eyebrow="SPRINT" title="Move to current PI + Sprint" info="Finds today’s Sprint (and its PI) from the team’s iteration dates, then moves your User Stories in the chosen states (New, Active or both) that are still in a past Sprint. Stories already in the current or a future Sprint, and Features and Tasks, are not touched.">
            {!pairs ? <button type="button" className="primary" disabled={Boolean(blocked) || busy === 'sprint'} onClick={() => void findSprint()}>{busy === 'sprint' ? 'Reading iterations…' : 'Find current Sprint'}</button>
              : !pairs.length ? <EmptyState title="No current Sprint found." detail="Check the team’s iteration dates in Azure DevOps." />
                : <>
                  <div className="view-switch" role="group" aria-label="States to move"><span>States</span><div className="segmented">{([['new', 'New'], ['active', 'Active'], ['both', 'Both']] as const).map(([value, text]) => <button key={value} type="button" aria-pressed={moveStates === value} onClick={() => { setMoveStates(value); setSkipMove(new Set()) }}>{text}</button>)}</div></div>
                  <label>Target<select value={target} onChange={(event) => { setTarget(event.target.value); setSkipMove(new Set()) }}>{pairs.map((pair) => <option key={pair.sprint.path} value={pair.sprint.path}>{pair.pi.name} › {pair.sprint.name} ({pair.sprint.attributes?.startDate?.slice(0, 10)} – {pair.sprint.attributes?.finishDate?.slice(0, 10)})</option>)}</select></label>
                  {toMove.length ? <ul className="pick-list">{toMove.map(({ item }) => <li key={item.id}><label className="check"><input type="checkbox" checked={!skipMove.has(item.id)} onChange={(event) => setSkipMove((current) => { const next = new Set(current); if (event.target.checked) next.delete(item.id); else next.add(item.id); return next })} /><Pill>{item.workItemType}</Pill><ItemLink item={item} /> {item.title}<small>{shortPath(item.iterationPath)}</small></label></li>)}</ul> : <p className="muted">All your pending items are already in this Sprint.</p>}
                  <div className="button-row"><button type="button" className="primary" disabled={Boolean(blocked) || moving || !toMove.some(({ item }) => !skipMove.has(item.id))} onClick={() => void moveAll()}>{moving ? 'Moving…' : ((count) => `Move ${count} item${count === 1 ? '' : 's'}`)(toMove.filter(({ item }) => !skipMove.has(item.id)).length)}</button></div>
                </>}
          </Panel>
        </div>
        <Panel className="action-card state-checks" eyebrow="CHECK" title="State checks" info="Your Features and User Stories whose state does not match their children: all User Stories Closed → close the Feature; all Tasks Closed → close the User Story; an Active Feature needs at least one Active User Story. A Feature is closed only from Active.">
          {checks.length ? <DataTable id="bulk:state-checks" rows={checks} rowKey={(check) => `${check.kind}-${check.item.id}`} exportName="State checks" columns={[
            { id: 'item', label: 'Work item', value: (check) => `#${check.item.id} ${check.item.title}`, render: (check) => <><ItemLink item={check.item} /> {check.item.title}<small>{check.item.workItemType}</small></> },
            { id: 'state', label: 'State', value: (check) => check.item.state, render: (check) => <Pill tone={check.kind === 'feature-needs-active-story' ? 'warning' : 'danger'}>{check.item.state}</Pill> },
            { id: 'check', label: 'Check', value: (check) => String(checkText[check.kind](check)) },
            { id: 'action', label: '', sortable: false, export: false, render: (check) => { const next = check.kind === 'feature-needs-active-story' ? null : nextStateFor(check.item, azure.items); return next ? <button type="button" className="ghost" disabled={Boolean(blocked) || busy === `check-${check.item.id}`} onClick={() => void applyState(check.item, next.state)}>{busy === `check-${check.item.id}` ? 'Saving…' : next.label}</button> : check.kind === 'feature-needs-active-story' ? <a href={check.item.url} target="_blank" rel="noreferrer">Open in Azure DevOps</a> : null } },
          ]} /> : <EmptyState title="Nothing to fix." detail="Every Feature and User Story matches the state of its children." />}
        </Panel>
      </>}
  </Page>
}
