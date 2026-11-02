import { useState } from 'react'
import { DataTable } from '../components/DataTable'
import { PersonPicker } from '../components/PersonPicker'
import { addMonthTask } from '../monthTaskAction'
import { EmptyState, Metric, Metrics, Notice, Page, Pill, TablePanel, type Tone } from '../components/ui'
import { currentIndiaMonth, updateAzureWorkItem } from '../azureDevOps'
import { capacityContext } from '../capacity'
import { featureChildren, hasOptionalStories, isMine, matchesWork, monthTaskCandidates, nextStateFor, workTypes } from '../myWork'
import { closeRelated, type FollowUpResult } from '../closeChain'
import { formatHours } from '../format'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { PageProps } from './types'
import { FeatureEditor, type FeatureEditorMode } from '../components/FeatureEditor'
import { StoryEditor } from '../components/StoryEditor'
import { WorkItemEditor } from '../components/WorkItemEditor'
import type { FeatureSetups } from '../featureSetup'

type Log = { tone: 'success' | 'error' | 'info'; text: string }
const stateTone = (state: string): Tone => /new|proposed|to do/i.test(state) ? 'info' : /active|in progress|committed|doing/i.test(state) ? 'open' : 'neutral'
const shortPath = (path: string) => path.split('\\').slice(1).join(' › ') || path

export function MyWorkPage({ azure, store, my, onOpenBulk, assign, featureSetup }: { azure: AzureWorkspace; store: PageProps['store']; my: MyWork; onOpenBulk: () => void; assign?: { me: string; canChoose: boolean }; featureSetup?: FeatureSetups | null }) {
  const [busy, setBusy] = useState('')
  const [log, setLog] = useState<Log[]>([])
  // Opens on Features; the list is always in ascending ID order.
  const [typeFilter, setTypeFilter] = useState('Feature')
  // The search looks through all types at once; the type chips apply again when it is cleared.
  const [search, setSearch] = useState('')
  const searching = Boolean(search.trim())
  // Features opened to show their User Stories, Bugs and Tasks (everyone's), reset by a refresh of the list.
  const [expanded, setExpanded] = useState<string[]>([])
  // New Feature (under an Epic, with its children) and Complete Feature children, with the board's editor.
  const [editor, setEditor] = useState<FeatureEditorMode | null>(null)
  // ＋ User Story under a Feature (the New User Story form).
  const [storyOf, setStoryOf] = useState<AzureWorkItem | null>(null)
  // Edit a Feature, User Story or Task.
  const [editing, setEditing] = useState<AzureWorkItem | null>(null)
  const epics = azure.items.filter((item) => item.workItemType === 'Epic' && item.state.trim().toLowerCase() !== 'removed').sort((a, b) => a.id - b.id)
  const meEmail = (assign?.me || azure.creatorEmail).trim().toLowerCase()
  const toggle = (key: string) => setExpanded((current) => current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key])
  const { config, pat } = azure
  const month = currentIndiaMonth()
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: changes to Azure DevOps are disabled.' : !config || !pat.trim() ? 'Connect the Time Writing connection (with its PAT) to change items in Azure DevOps.' : ''
  const pending = my.pending
  const found = searching ? pending.filter((row) => matchesWork(row, search)) : pending
  const shown = (searching || typeFilter === 'All' ? found : found.filter(({ item }) => (typeFilter === 'Other' ? !(workTypes as readonly string[]).includes(item.workItemType) : item.workItemType === typeFilter))).toSorted((a, b) => a.item.id - b.item.id)
  const counts = Object.fromEntries(workTypes.map((type) => [type, pending.filter(({ item }) => item.workItemType === type).length])) as Record<string, number>
  const candidates = my.known ? monthTaskCandidates(azure.items, my.me, month, absenceEpicId) : []
  const missing = candidates.filter((row) => row.status === 'needs-task' || row.status === 'needs-story')
  const sharedMissing = missing.filter((row) => row.shared)
  const note = (entry: Log) => setLog((current) => [entry, ...current].slice(0, 8))
  const noteFollowUp = (result: FollowUpResult, apply: (closed: AzureWorkItem[]) => void) => {
    if (result.closed.length) { apply(result.closed); note({ tone: 'success', text: `Also closed ${result.closed.map((entry) => `#${entry.id}`).join(', ')}.` }) }
    else if (result.follow && !result.confirmed && !result.skipped.length) note({ tone: 'info', text: result.follow.kind === 'stories' ? 'Its User Stories were left open.' : 'The Feature was left open.' })
    for (const text of [...result.skipped, ...result.failed]) note({ tone: result.failed.includes(text) ? 'error' : 'info', text })
  }

  async function finish(item: AzureWorkItem, state: string) {
    if (blocked || !config) return
    if (!window.confirm(`${state === 'Active' ? 'Set' : 'Close'} ${item.workItemType} #${item.id} “${item.title}”${state === 'Active' ? ' to Active' : ''}? Its State is set to ${state} in Azure DevOps.`)) return
    setBusy(`state-${item.id}`)
    // After every save the whole backlog is refreshed from Azure (and saved locally), so all pages show current data.
    try {
      const updated = await updateAzureWorkItem(config, pat, item.id, { state }); azure.applyWorkItems([updated], 'Close item', `#${item.id} ${item.state} → ${updated.state}`); note({ tone: 'success', text: `#${item.id} is now ${updated.state}.` })
      // Closing a Feature offers to close its open User Stories; closing the last open User Story offers to close the Feature.
      if (state === 'Closed') noteFollowUp(await closeRelated(config, pat, azure.items, updated, (question) => window.confirm(question)), (closed) => azure.applyWorkItems(closed, 'Close item', closed.map((entry) => `#${entry.id} → ${entry.state}`).join(', ')))
      note({ tone: 'info', text: 'Refreshing data…' }); await azure.refresh()
    }
    catch (failure) { note({ tone: 'error', text: `#${item.id}: ${failure instanceof Error ? failure.message : 'update failed'}` }) }
    finally { setBusy('') }
  }

  return <Page>
    <section className="me-bar">
      <div><span className="eyebrow">WORK ASSIGNED TO</span><strong>{my.me.name ?? my.me.email ?? 'Not set'}</strong>{my.me.email && <small>{my.me.email}</small>}</div>
      <label>Show work for<PersonPicker label="Show work for" value={my.chosenName} people={my.people} onChange={my.setName} meLabel={my.me.email ? 'Me (connection email)' : 'Choose a person…'} /></label>
    </section>
    {!my.known ? <EmptyState title="Who are you in Azure DevOps?" detail="Set the Feature creator email on your Time Writing connection, or choose your name above." />
      : <>
        <Metrics>
          <Metric label="Pending work" value={pending.length} hint="New or active items assigned to you" />
          <Metric label="Features" value={counts.Feature ?? 0} hint={`${counts['User Story'] ?? 0} stories · ${counts.Bug ?? 0} bugs`} />
          <Metric label="Tasks" value={counts.Task ?? 0} hint="Including Time Writing tasks" />
          <Metric label={`${month} tasks missing`} value={missing.length} hint={<>{candidates.length - missing.length} of {candidates.length} Features covered · <button type="button" className="text-button" onClick={onOpenBulk}>Bulk actions →</button></>} tone={missing.length ? 'negative' : undefined} />
        </Metrics>
        {sharedMissing.length > 0 && <Notice tone="info">You work on {sharedMissing.length} shared Feature{sharedMissing.length === 1 ? '' : 's'} owned by someone else without your {month} task: {sharedMissing.map((row) => `${row.feature.id} (owner ${row.shared!.owner})`).join(', ')}. <button type="button" className="text-button" onClick={onOpenBulk}>Add in Bulk actions →</button></Notice>}
        {blocked && <Notice tone="warning">{blocked}</Notice>}
        {log.map((entry, index) => <Notice key={index} tone={entry.tone}>{entry.text}</Notice>)}
        <TablePanel title="Pending work" info={<ul>
          <li>New and active items assigned to the person shown (matched by email, else by name), always in ascending ID order. Epics and work under the absence Epic are left out.</li>
          <li>Search looks through every type at once: ID (with or without #), title, type, state, Feature, Epic, Area Path, Iteration Path and tags. Every word must match, in any order and case. Esc or a type chip clears it.</li>
          <li>▸ on a Feature opens what is directly under it (its User Stories, and any Bugs or Tasks placed straight under it); ▸ on a User Story then opens its Tasks. Everyone's items are shown, whoever they are assigned to, in ascending ID order (Removed items left out). Tasks show planned and recorded hours. Items of yours that are New or Active keep their Close action; other people's show Not mine.</li>
          <li>＋ New Feature creates a Feature under an Epic with its User Stories and this month's Time Writing task, as on the QMS-0025 board; Complete children appears only on a Feature with no optional User Story yet (the Time Writing story does not count) and adds what is missing. Both ask for the PAT and refresh the data afterwards.</li>
          <li>Close &lt;type&gt; sets the State to Closed. A Feature or User Story in New offers Set … to Active; only an Active one can be closed (other states say Set to Active first). Only the State is written, after confirmation, then the data is refreshed.</li>
          <li>Azure DevOps refuses a change its process does not allow; the error is shown.</li>
        </ul>} count={`${shown.length} of ${pending.length}`}
          action={<div className="chip-row"><button type="button" className="primary" disabled={Boolean(blocked) || !epics.length} title={epics.length ? 'Create a Feature under an Epic with its User Stories and Time Writing task' : 'No Epic in the Time Writing backlog yet'} onClick={() => setEditor({ parent: epics[0] })}>＋ New Feature</button>{['All', ...workTypes, 'Other'].map((type) => <button type="button" key={type} className={`chip ${!searching && typeFilter === type ? 'chip-on' : ''}`} onClick={() => { setTypeFilter(type); setSearch('') }}>{type}{type !== 'All' && type !== 'Other' ? ` ${counts[type] ?? 0}` : ''}</button>)}</div>}
          empty={shown.length ? undefined : searching ? `Nothing matches “${search.trim()}” in any type.` : pending.length ? 'Nothing of this type.' : 'No pending work assigned to you.'}>
          <div className="query-toolbar my-work-search"><input type="search" className="search" aria-label="Search all assigned work" placeholder="Search all types (ID, title, state, Feature, path…)" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearch('') }} />{searching && <span className="muted">{shown.length} of {pending.length} match, all types</span>}</div>
          {/* UI-07: the work list on the table default; a Feature opens its children as rows of the same table. */}
          {shown.length > 0 && (() => {
            const monthButton = (entry: AzureWorkItem) => (entry.workItemType === 'Feature' || entry.workItemType === 'User Story') && config && meEmail ? <button type="button" className="text-button" disabled={Boolean(blocked) || busy.startsWith('month-')} title="Add this month's Time Writing Task for you under this Feature (or the Feature above this Story)" onClick={() => { setBusy(`month-${entry.id}`); void addMonthTask(config, pat, azure.items, entry, meEmail).then((done) => { azure.applyWorkItems(done.changed, 'Add Time Writing Task', done.text); setLog((current) => [{ tone: 'success', text: done.text }, ...current]) }, (failure) => setLog((current) => [{ tone: 'error', text: failure instanceof Error ? failure.message : String(failure) }, ...current])).finally(() => setBusy('')) }}>{busy === `month-${entry.id}` ? 'Adding…' : '＋ Time Writing Task'}</button> : null
            const editButton = (entry: AzureWorkItem) => ['Feature', 'User Story', 'Task'].includes(entry.workItemType) ? <button type="button" className="text-button" disabled={Boolean(blocked)} title={`Edit ${entry.workItemType} #${entry.id}`} onClick={() => setEditing(entry)}>Edit</button> : null
            const action = (entry: AzureWorkItem) => { const next = nextStateFor(entry); return next ? <button type="button" className="ghost" disabled={Boolean(blocked) || busy === `state-${entry.id}`} onClick={() => void finish(entry, next.state)}>{busy === `state-${entry.id}` ? 'Saving…' : next.label}</button> : <small className="muted" title="Only an Active Feature or User Story can be closed">Set to Active first</small> }
            type WorkRow = { item: AzureWorkItem; feature?: AzureWorkItem; depth: 0 | 1 | 2; below: AzureWorkItem[]; top: AzureWorkItem }
            const topRows: WorkRow[] = shown.map(({ item, feature }) => ({ item, feature, depth: 0, below: [], top: item }))
            const childrenOf = (row: WorkRow): WorkRow[] => {
              if (row.depth === 0) return expanded.includes(row.item.key) && row.item.workItemType === 'Feature' ? featureChildren(azure.items, row.item).map((child) => ({ item: child.item, depth: 1, below: child.children, top: row.item })) : []
              if (row.depth === 1) return expanded.includes(row.item.key) ? row.below.map((grandchild) => ({ item: grandchild, depth: 2, below: [], top: row.top })) : []
              return []
            }
            const itemCell = (row: WorkRow) => {
              if (row.depth === 0) { const item = row.item, children = item.workItemType === 'Feature' ? featureChildren(azure.items, item) : [], open = expanded.includes(item.key), count = children.length; return <>{children.length ? <button type="button" className="tree-toggle work-toggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} Feature #${item.id}: ${count} child items`} title={`${count} ${count === 1 ? 'item' : 'items'} directly under this Feature`} onClick={() => toggle(item.key)}>{open ? '▾' : '▸'}</button> : item.workItemType === 'Feature' ? <span className="work-toggle work-toggle-empty" title="No User Stories or Tasks under this Feature" aria-hidden="true">·</span> : null}<span className={`type-dot type-${item.workItemType.replace(/\s/g, '').toLowerCase()}`} aria-hidden="true" /><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a> <strong className="inline">{item.title}</strong><small>{item.workItemType}{children.length ? ` · ${count} ${count === 1 ? 'item' : 'items'}` : ''}</small></> }
              const entry = row.item, below = row.below
              return <><span className="work-indent" aria-hidden="true" />{below.length ? <button type="button" className="tree-toggle work-toggle" aria-expanded={expanded.includes(entry.key)} aria-label={`${expanded.includes(entry.key) ? 'Collapse' : 'Expand'} ${entry.workItemType} #${entry.id}: ${below.length} ${below.length === 1 ? 'item' : 'items'}`} onClick={() => toggle(entry.key)}>{expanded.includes(entry.key) ? '▾' : '▸'}</button> : <span className="work-toggle work-toggle-empty" aria-hidden="true" />}<span className={`type-dot type-${entry.workItemType.replace(/\s/g, '').toLowerCase()}`} aria-hidden="true" /><a href={entry.url} target="_blank" rel="noreferrer">#{entry.id}</a> <strong className="inline">{entry.title}</strong><small>{entry.workItemType}{below.length ? ` · ${below.length} ${below.length === 1 ? (below[0].workItemType === 'Task' ? 'Task' : 'item') : (below.every((task) => task.workItemType === 'Task') ? 'Tasks' : 'items')}` : ''}{entry.assignedTo ? ` · ${entry.assignedTo}` : ' · Unassigned'}{entry.workItemType === 'Task' && (entry.originalEstimate != null || entry.completedWork != null) ? ` · ${formatHours(entry.originalEstimate ?? 0)}h planned, ${formatHours(entry.completedWork ?? 0)}h recorded` : ''}</small></>
            }
            return <DataTable id="my-work" className="work-table" rows={topRows} rowKey={(row) => row.item.key} exportName="Assigned to me" subRows={childrenOf}
              rowClassName={(row) => row.depth ? `work-child work-depth-${row.depth}${expanded.includes(row.item.key) ? ' work-open' : ''}` : expanded.includes(row.item.key) ? 'work-open' : undefined}
              columns={[
                { id: 'item', label: 'Item', value: (row) => `#${row.item.id} ${row.item.title}`, render: itemCell },
                { id: 'type', label: 'Type', value: (row) => row.item.workItemType, defaultHidden: true },
                { id: 'state', label: 'State', value: (row) => row.item.state, render: (row) => <Pill tone={stateTone(row.item.state)}>{row.item.state}</Pill> },
                { id: 'feature', label: 'Feature', value: (row) => row.depth ? row.top.title : row.feature && row.feature.id !== row.item.id ? row.feature.title : '', render: (row) => row.depth ? <small className="plain">{row.top.title}</small> : row.feature && row.feature.id !== row.item.id ? <small className="plain">{row.feature.title}</small> : '—' },
                { id: 'iteration', label: 'Iteration', value: (row) => shortPath(row.item.iterationPath), render: (row) => <small className="plain">{shortPath(row.item.iterationPath)}</small> },
                { id: 'action', label: 'Action', sortable: false, export: false, render: (row) => { if (row.depth === 0) { const item = row.item; return <>{action(item)}{item.workItemType === 'Feature' && !hasOptionalStories(azure.items, item) && <button type="button" className="text-button" disabled={Boolean(blocked)} title="Add the missing User Stories and this month's Time Writing task under this Feature" onClick={() => setEditor({ resume: item })}>Complete children</button>}{editButton(item)}{monthButton(item)}{item.workItemType === 'Feature' && <button type="button" className="text-button" disabled={Boolean(blocked)} title="Create a User Story under this Feature" onClick={() => setStoryOf(item)}>＋ User Story</button>}</> } const entry = row.item; return <>{isMine(entry, my.me) && nextStateFor(entry) && /new|active/i.test(entry.state) ? action(entry) : <small className="muted">{isMine(entry, my.me) ? '—' : 'Not mine'}</small>}{editButton(entry)}{monthButton(entry)}</> } },
              ]} />
          })()}
        </TablePanel>
        {editing && config && <WorkItemEditor item={editing} items={azure.items} config={config} savedPat={pat} me={meEmail} canChoose={Boolean(assign?.canChoose)} onSavePat={azure.rememberPat} onUpdated={azure.featureCreated} onClose={() => setEditing(null)}
          onDone={(text) => { note({ tone: 'success', text }); void azure.refresh() }} onFailed={(text) => note({ tone: 'error', text })} />}
        {storyOf && config && <StoryEditor feature={storyOf} items={azure.items} config={config} savedPat={pat} me={meEmail} canChoose={Boolean(assign?.canChoose)} onSavePat={azure.rememberPat} onCreated={azure.featureCreated} onClose={() => setStoryOf(null)}
          onDone={(done) => { note({ tone: 'success', text: `User Story #${done.story.id} “${done.story.title}” ${done.text}` }); void azure.refresh() }} onFailed={(text) => note({ tone: 'error', text })} />}
        {editor && config && <FeatureEditor mode={editor} items={azure.items} config={config} savedPat={pat} me={meEmail} canChoose={Boolean(assign?.canChoose)} featureSetup={featureSetup} onSavePat={azure.rememberPat} onCreated={azure.featureCreated} onClose={() => setEditor(null)}
          onDone={(done) => { setEditor(null); note({ tone: 'success', text: `${done.feature.workItemType} #${done.feature.id} “${done.feature.title}”: ${done.text}` }); void azure.refresh() }}
          onPartial={(text) => { setEditor(null); note({ tone: 'error', text }); void azure.refresh() }} />}
      </>}
  </Page>
}
