import { useState } from 'react'
import { PersonPicker } from '../components/PersonPicker'
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
          {shown.length > 0 && <table className="work-table"><thead><tr><th>Item</th><th>State</th><th>Feature</th><th>Iteration</th><th>Action</th></tr></thead><tbody>{shown.flatMap(({ item, feature }) => {
            const children = item.workItemType === 'Feature' ? featureChildren(azure.items, item) : []
            const open = expanded.includes(item.key)
            const count = children.length
            const action = (entry: AzureWorkItem) => { const next = nextStateFor(entry); return next ? <button type="button" className="ghost" disabled={Boolean(blocked) || busy === `state-${entry.id}`} onClick={() => void finish(entry, next.state)}>{busy === `state-${entry.id}` ? 'Saving…' : next.label}</button> : <small className="muted" title="Only an Active Feature or User Story can be closed">Set to Active first</small> }
            // One level at a time: the Feature opens its direct children; a child with work under it (a User Story's
            // Tasks) has its own ▸, so its Tasks show only when it is opened.
            const childRow = (entry: AzureWorkItem, depth: number, below: AzureWorkItem[] = []) => <tr key={entry.key} className={`work-child work-depth-${depth}${expanded.includes(entry.key) ? ' work-open' : ''}`}>
              <td><span className="work-indent" aria-hidden="true" />{below.length ? <button type="button" className="tree-toggle work-toggle" aria-expanded={expanded.includes(entry.key)} aria-label={`${expanded.includes(entry.key) ? 'Collapse' : 'Expand'} ${entry.workItemType} #${entry.id}: ${below.length} ${below.length === 1 ? 'item' : 'items'}`} onClick={() => toggle(entry.key)}>{expanded.includes(entry.key) ? '▾' : '▸'}</button> : <span className="work-toggle work-toggle-empty" aria-hidden="true" />}<span className={`type-dot type-${entry.workItemType.replace(/\s/g, '').toLowerCase()}`} aria-hidden="true" /><a href={entry.url} target="_blank" rel="noreferrer">#{entry.id}</a> <strong className="inline">{entry.title}</strong><small>{entry.workItemType}{below.length ? ` · ${below.length} ${below.length === 1 ? (below[0].workItemType === 'Task' ? 'Task' : 'item') : (below.every((task) => task.workItemType === 'Task') ? 'Tasks' : 'items')}` : ''}{entry.assignedTo ? ` · ${entry.assignedTo}` : ' · Unassigned'}{entry.workItemType === 'Task' && (entry.originalEstimate != null || entry.completedWork != null) ? ` · ${formatHours(entry.originalEstimate ?? 0)}h planned, ${formatHours(entry.completedWork ?? 0)}h recorded` : ''}</small></td>
              <td><Pill tone={stateTone(entry.state)}>{entry.state}</Pill></td>
              <td><small className="plain">{item.title}</small></td>
              <td><small className="plain">{shortPath(entry.iterationPath)}</small></td>
              <td>{isMine(entry, my.me) && nextStateFor(entry) && /new|active/i.test(entry.state) ? action(entry) : <small className="muted">{isMine(entry, my.me) ? '—' : 'Not mine'}</small>}</td>
            </tr>
            return [<tr key={item.key} className={open ? 'work-open' : undefined}>
              <td>{children.length ? <button type="button" className="tree-toggle work-toggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} Feature #${item.id}: ${count} child items`} title={`${count} ${count === 1 ? 'item' : 'items'} directly under this Feature`} onClick={() => toggle(item.key)}>{open ? '▾' : '▸'}</button> : item.workItemType === 'Feature' ? <span className="work-toggle work-toggle-empty" title="No User Stories or Tasks under this Feature" aria-hidden="true">·</span> : null}<span className={`type-dot type-${item.workItemType.replace(/\s/g, '').toLowerCase()}`} aria-hidden="true" /><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a> <strong className="inline">{item.title}</strong><small>{item.workItemType}{children.length ? ` · ${count} ${count === 1 ? 'item' : 'items'}` : ''}</small></td>
              <td><Pill tone={stateTone(item.state)}>{item.state}</Pill></td>
              <td>{feature && feature.id !== item.id ? <small className="plain">{feature.title}</small> : '—'}</td>
              <td><small className="plain">{shortPath(item.iterationPath)}</small></td>
              <td>{action(item)}{item.workItemType === 'Feature' && !hasOptionalStories(azure.items, item) && <button type="button" className="text-button" disabled={Boolean(blocked)} title="Add the missing User Stories and this month's Time Writing task under this Feature" onClick={() => setEditor({ resume: item })}>Complete children</button>}{item.workItemType === 'Feature' && <button type="button" className="text-button" disabled={Boolean(blocked)} title="Create a User Story under this Feature" onClick={() => setStoryOf(item)}>＋ User Story</button>}</td>
            </tr>, ...(open ? children.flatMap((child) => [childRow(child.item, 1, child.children), ...(expanded.includes(child.item.key) ? child.children.map((grandchild) => childRow(grandchild, 2)) : [])]) : [])]
          })}</tbody></table>}
        </TablePanel>
        {storyOf && config && <StoryEditor feature={storyOf} items={azure.items} config={config} savedPat={pat} me={meEmail} canChoose={Boolean(assign?.canChoose)} onSavePat={azure.rememberPat} onCreated={azure.featureCreated} onClose={() => setStoryOf(null)}
          onDone={(done) => { note({ tone: 'success', text: `User Story #${done.story.id} “${done.story.title}” ${done.text}` }); void azure.refresh() }} onFailed={(text) => note({ tone: 'error', text })} />}
        {editor && config && <FeatureEditor mode={editor} items={azure.items} config={config} savedPat={pat} me={meEmail} canChoose={Boolean(assign?.canChoose)} featureSetup={featureSetup} onSavePat={azure.rememberPat} onCreated={azure.featureCreated} onClose={() => setEditor(null)}
          onDone={(done) => { setEditor(null); note({ tone: 'success', text: `${done.feature.workItemType} #${done.feature.id} “${done.feature.title}”: ${done.text}` }); void azure.refresh() }}
          onPartial={(text) => { setEditor(null); note({ tone: 'error', text }); void azure.refresh() }} />}
      </>}
  </Page>
}
