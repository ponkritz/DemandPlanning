import { listJobs, runInBackground, subscribeJobs } from '../backgroundJobs'
import { useState, useSyncExternalStore } from 'react'
import { EmptyState, Notice, Page, Panel, Pill } from '../components/ui'
import { currentIterationPairs, readAzureIterations, updateAzureWorkItem, type AzureIteration } from '../azureDevOps'
import { capacityContext } from '../capacity'
import { canActivateHere, isMine, moveCandidates, stateCheckChildren, nextStateFor, stateChecks, type MoveStates, type StateCheck } from '../myWork'
import { activateFeatureOf, closeRelated } from '../closeChain'
import { closeChosen, closeTree, storyCloseRows, type CloseRow, type closeSelection } from '../closeList'
import { CloseItemsDialog } from '../components/CloseItemsDialog'
type CloseSelection = ReturnType<typeof closeSelection>
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { PageProps } from './types'

type Log = { tone: 'success' | 'error' | 'info'; text: string }
type Pair = { pi: AzureIteration; sprint: AzureIteration }
const shortPath = (path: string) => path.split('\\').slice(1).join(' › ') || path

// Sprint check (ATM-07…ATM-09, ATM-20; formerly Bulk actions): move my pending User Stories from past Sprints to the current
// one, and the state checks of my Features and User Stories. Each asks for confirmation; after it the data is refreshed.
// Month Time Writing tasks are added on Time Writing.
// assign: who is creating (their email) and whether they may assign new work to someone else.
// The item's number as a link to it in Azure DevOps (new tab); plain text when no address is known.
function ItemLink({ item }: { item: Pick<AzureWorkItem, 'id' | 'url' | 'workItemType' | 'title'> }) {
  return item.url ? <a className="item-link" href={item.url} target="_blank" rel="noreferrer" title={`Open ${item.workItemType} #${item.id} in Azure DevOps`}>#{item.id}</a> : <>#{item.id}</>
}

// ATM-29: the backlog tree's look — a ⌄ / › toggle, the type icon and the linked title, indented by depth.
function TreeTitle({ item, depth, toggle }: { item: AzureWorkItem; depth: number; toggle?: { open: boolean; onClick: () => void } }) {
  return <div className="backlog-title" style={{ paddingLeft: depth * 20 }}>
    {toggle ? <button type="button" className="tree-toggle" aria-label={`${toggle.open ? 'Collapse' : 'Expand'} ${item.workItemType} ${item.id}`} aria-expanded={toggle.open} onClick={toggle.onClick}>{toggle.open ? '⌄' : '›'}</button> : <span className="tree-toggle" />}
    <span className={`backlog-type-icon backlog-type-${item.workItemType.toLowerCase().replaceAll(' ', '-')}`} aria-hidden="true">{item.workItemType === 'Feature' ? '♜' : item.workItemType === 'Task' ? '☑' : '▣'}</span>
    <a href={item.url} target="_blank" rel="noreferrer" title={item.title}>{item.title}</a>
  </div>
}
const StateDot = ({ state }: { state: string }) => <span className="backlog-state"><i className={`state-dot state-${state.toLowerCase().replaceAll(' ', '-')}`} />{state}</span>

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
  // ATM-29: State checks as a backlog tree — each row expands to the items below it.
  const [open, setOpen] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setOpen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
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
    'feature-old-pi': (check) => `The Feature is in ${shortPath(check.item.iterationPath) || 'no PI'} but its Active User Stor${check.children.length === 1 ? 'y is' : 'ies are'} in ${shortPath(check.targetPi ?? '')}: move the Feature to that PI.`,
    'feature-needs-active-story': (check) => check.children.length ? `The Feature is Active but none of its ${check.children.length} User Stor${check.children.length === 1 ? 'y is' : 'ies are'} Active: set at least one to Active.` : 'The Feature is Active but has no User Story: add one and set it to Active.',
  }
  // BKL-39: closing a Feature or User Story here opens the same pop-up as My Tasks [Board].
  const [closeAsk, setCloseAsk] = useState<{ item: AzureWorkItem; rows: CloseRow[] } | null>(null)
  async function closeSelected(item: AzureWorkItem, selection: CloseSelection) {
    setCloseAsk(null)
    if (blocked || !config) return
    setBusy(`check-${item.id}`)
    try {
      const result = await closeChosen(config, pat, selection)
      if (result.closed.length) { azure.applyWorkItems(result.closed, 'State check', result.closed.map((entry) => `#${entry.id} → ${entry.state}`).join(', ')); note({ tone: 'success', text: `Closed ${result.closed.map((entry) => `#${entry.id}`).join(', ')}.` }) }
      for (const text of [...result.failed, ...result.skipped]) note({ tone: result.failed.includes(text) ? 'error' : 'info', text })
      note({ tone: 'info', text: 'Refreshing data…' }); await azure.refresh()
    } finally { setBusy('') }
  }
  async function applyState(item: AzureWorkItem, state: string) {
    if (state === 'Closed' && (item.workItemType === 'Feature' || item.workItemType === 'User Story')) {
      const rows = item.workItemType === 'Feature' ? closeTree(azure.items, item, my.me) : storyCloseRows(azure.items, item, my.me)
      if (rows.length) { setCloseAsk({ item, rows }); return }
    }
    if (blocked || !config || !window.confirm(`Set ${item.workItemType} #${item.id} “${item.title}” to ${state} in Azure DevOps?`)) return
    setBusy(`check-${item.id}`)
    try {
      const updated = await updateAzureWorkItem(config, pat, item.id, { state }); azure.applyWorkItems([updated], 'State check', `#${item.id} ${item.state} → ${updated.state}`); note({ tone: 'success', text: `#${item.id} is now ${updated.state}.` })
      // ATM-28: a User Story set Active makes its New Feature Active too.
      if (state === 'Active' && updated.workItemType === 'User Story') { const feature = await activateFeatureOf(config, pat, azure.items, updated); if (feature) { azure.applyWorkItems([feature], 'State check', `#${feature.id} → ${feature.state}`); note({ tone: 'success', text: `Feature #${feature.id} is now ${feature.state} too.` }) } }
      // Closing the last open User Story offers to close its Feature too (closeChain).
      if (state === 'Closed') { const result = await closeRelated(config, pat, azure.items, updated, (question) => window.confirm(question)); if (result.closed.length) { azure.applyWorkItems(result.closed, 'State check', result.closed.map((entry) => `#${entry.id} → ${entry.state}`).join(', ')); note({ tone: 'success', text: `Also closed ${result.closed.map((entry) => `#${entry.id}`).join(', ')}.` }) } for (const text of [...result.skipped, ...result.failed]) note({ tone: result.failed.includes(text) ? 'error' : 'info', text }) }
      note({ tone: 'info', text: 'Refreshing data…' }); await azure.refresh()
    }
    catch (failure) { note({ tone: 'error', text: `#${item.id}: ${failure instanceof Error ? failure.message : 'update failed'}` }) }
    finally { setBusy('') }
  }
  // ATM-30: move a Feature to the PI of its Active User Stories (Iteration Path only; the state stays).
  async function moveToPi(item: AzureWorkItem, pi: string) {
    if (blocked || !config || !window.confirm(`Move Feature #${item.id} “${item.title}” to ${pi} in Azure DevOps?`)) return
    setBusy(`check-${item.id}`)
    try {
      const updated = await updateAzureWorkItem(config, pat, item.id, { iterationPath: pi }); azure.applyWorkItems([updated], 'State check', `#${item.id} ${item.iterationPath} → ${updated.iterationPath}`); note({ tone: 'success', text: `#${item.id} is now in ${shortPath(updated.iterationPath)}.` })
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
    </section>
    {!my.known ? <EmptyState title="Who are you in Azure DevOps?" detail="Set the Feature creator email on your Time Writing connection, or choose your name with Person at the top right." />
      : <>
        {blocked && <Notice tone="warning">{blocked}</Notice>}
        {log.map((entry, index) => <Notice key={index} tone={entry.tone}>{entry.text}</Notice>)}
        <div className="sprint-full">
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
        <Panel className="action-card state-checks" eyebrow="CHECK" title="State checks" info="Your Features and User Stories whose state does not match their children: all User Stories Closed → close the Feature; all Tasks Closed → close the User Story; an Active Feature needs at least one Active User Story; an Active Feature still in an older PI than its Active User Stories is moved to their PI. A Feature is closed only from Active.">
          {checks.length ? <div className="backlog-table-scroll"><table className="backlog-table state-tree" aria-label="State checks">
            <thead><tr><th style={{ width: 70 }}>ID</th><th>Title</th><th style={{ width: 110 }}>State</th><th style={{ width: 150 }}>Assigned To</th><th>Check</th><th style={{ width: 200 }} aria-label="Action" /></tr></thead>
            <tbody>{checks.map((check) => {
              const item = check.item, expanded = open.has(item.id)
              const below = stateCheckChildren(azure.items, item)
              const next = check.kind === 'feature-needs-active-story' || check.kind === 'feature-old-pi' ? null : nextStateFor(item, azure.items)
              const saving = busy === `check-${item.id}`
              return [<tr key={`${check.kind}-${item.id}`} className="state-tree-row">
                <td><ItemLink item={item} /></td>
                <td><TreeTitle item={item} depth={0} toggle={below.length ? { open: expanded, onClick: () => toggle(item.id) } : undefined} /></td>
                <td><StateDot state={item.state} /></td>
                <td>{item.assignedTo || 'Unassigned'}</td>
                <td><span className={`state-check-text${check.kind === 'feature-needs-active-story' ? ' warning-text' : ''}`}>{checkText[check.kind](check)}</span></td>
                <td>{check.kind === 'feature-old-pi' && check.targetPi ? <button type="button" className="backlog-action" disabled={Boolean(blocked) || saving} onClick={() => void moveToPi(item, check.targetPi!)}>{saving ? 'Saving…' : `Move Feature to ${shortPath(check.targetPi)}`}</button>
                  : next ? <button type="button" className="backlog-action" disabled={(Boolean(blocked) && !(azure.isSample && next.state === 'Closed' && (item.workItemType === 'Feature' || item.workItemType === 'User Story'))) || saving} onClick={() => void applyState(item, next.state)}>{saving ? 'Saving…' : next.label}</button>
                  : check.kind === 'feature-needs-active-story' && below.length ? <button type="button" className="backlog-action" aria-expanded={expanded} onClick={() => toggle(item.id)}>{expanded ? 'Hide User Stories' : 'Choose a User Story'}</button>
                  : <a href={item.url} target="_blank" rel="noreferrer">Open in Azure DevOps</a>}</td>
              </tr>, ...(expanded ? below.map((child) => {
                const mine = isMine(child, my.me), childSaving = busy === `check-${child.id}`
                const activate = canActivateHere(child, my.me)
                return <tr key={`${check.kind}-${item.id}-${child.id}`} className="state-tree-child">
                  <td><ItemLink item={child} /></td>
                  <td><TreeTitle item={child} depth={1} /></td>
                  <td><StateDot state={child.state} /></td>
                  <td>{child.assignedTo || 'Unassigned'}</td>
                  <td className="muted">{child.workItemType === 'User Story' && child.state.trim().toLowerCase() === 'new' && !mine ? 'Not yours: set it Active in Azure DevOps or ask its owner.' : ''}</td>
                  <td>{activate && <button type="button" className="backlog-action" disabled={Boolean(blocked) || childSaving} onClick={() => void applyState(child, 'Active')}>{childSaving ? 'Saving…' : 'Set User Story to Active'}</button>}</td>
                </tr>
              }) : [])]
            })}</tbody>
          </table></div> : <EmptyState title="Nothing to fix." detail="Every Feature and User Story matches the state of its children." />}
        </Panel>
      </>}
    {closeAsk && <CloseItemsDialog title={`Close ${closeAsk.item.workItemType} #${closeAsk.item.id}`} intro={closeAsk.rows.length > 1 ? (closeAsk.item.workItemType === 'Feature' ? 'Everything still open under the Feature is listed.' : 'This is the last open User Story of its Feature: the Feature, its Time Writing story and Tasks are listed too.') + ' Tick what to close; children close first.' : 'Close this item in Azure DevOps?'} rows={closeAsk.rows} asked={closeAsk.item.id} blocked={blocked || undefined} onConfirm={(selection) => void closeSelected(closeAsk.item, selection)} onClose={() => setCloseAsk(null)} />}
  </Page>
}
