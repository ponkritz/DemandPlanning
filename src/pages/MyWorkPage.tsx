import { useState } from 'react'
import { PersonPicker } from '../components/PersonPicker'
import { EmptyState, Metric, Metrics, Notice, Page, Pill, TablePanel, type Tone } from '../components/ui'
import { currentIndiaMonth, updateAzureWorkItem } from '../azureDevOps'
import { capacityContext } from '../capacity'
import { finishStates, monthTaskCandidates, workTypes } from '../myWork'
import type { AzureWorkItem } from '../domain'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { MyWork } from '../useMyWork'
import type { PageProps } from './types'

type Log = { tone: 'success' | 'error' | 'info'; text: string }
const stateTone = (state: string): Tone => /new|proposed|to do/i.test(state) ? 'info' : /active|in progress|committed|doing/i.test(state) ? 'open' : 'neutral'
const shortPath = (path: string) => path.split('\\').slice(1).join(' › ') || path

export function MyWorkPage({ azure, store, my, onOpenBulk }: { azure: AzureWorkspace; store: PageProps['store']; my: MyWork; onOpenBulk: () => void }) {
  const [busy, setBusy] = useState('')
  const [log, setLog] = useState<Log[]>([])
  // Opens on Features; the list is always in ascending ID order.
  const [typeFilter, setTypeFilter] = useState('Feature')
  const [choice, setChoice] = useState<Record<number, string>>({})
  const { config, pat } = azure
  const month = currentIndiaMonth()
  const absenceEpicId = capacityContext(store.state).absenceEpicId
  const blocked = azure.isSample ? 'Synthetic sample data is loaded: changes to Azure DevOps are disabled.' : !config || !pat.trim() ? 'Connect the Time Writing connection (with its PAT) to change items in Azure DevOps.' : ''
  const pending = my.pending
  const shown = (typeFilter === 'All' ? pending : pending.filter(({ item }) => (typeFilter === 'Other' ? !(workTypes as readonly string[]).includes(item.workItemType) : item.workItemType === typeFilter))).toSorted((a, b) => a.item.id - b.item.id)
  const counts = Object.fromEntries(workTypes.map((type) => [type, pending.filter(({ item }) => item.workItemType === type).length])) as Record<string, number>
  const candidates = my.known ? monthTaskCandidates(azure.items, my.me, month, absenceEpicId) : []
  const missing = candidates.filter((row) => row.status === 'needs-task' || row.status === 'needs-story')
  const note = (entry: Log) => setLog((current) => [entry, ...current].slice(0, 8))

  async function finish(item: AzureWorkItem, state: string) {
    if (blocked || !config) return
    if (!window.confirm(`Set #${item.id} “${item.title}” to ${state} in Azure DevOps?`)) return
    setBusy(`state-${item.id}`)
    // After every save the whole backlog is refreshed from Azure (and saved locally), so all pages show current data.
    try { const updated = await updateAzureWorkItem(config, pat, item.id, { state }); azure.applyWorkItems([updated], 'Set state', `#${item.id} ${item.state} → ${updated.state}`); note({ tone: 'success', text: `#${item.id} is now ${updated.state}. Refreshing data…` }); await azure.refresh() }
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
        <TablePanel title="Pending work" detail="New and active items assigned to you, in ascending ID order. Finish an item with Resolved or Closed; Azure DevOps refuses a state its process does not allow." count={`${shown.length} of ${pending.length}`}
          action={<div className="chip-row">{['All', ...workTypes, 'Other'].map((type) => <button type="button" key={type} className={`chip ${typeFilter === type ? 'chip-on' : ''}`} onClick={() => setTypeFilter(type)}>{type}{type !== 'All' && type !== 'Other' ? ` ${counts[type] ?? 0}` : ''}</button>)}</div>}
          empty={shown.length ? undefined : pending.length ? 'Nothing of this type.' : 'No pending work assigned to you.'}>
          {shown.length > 0 && <table className="work-table"><thead><tr><th>Item</th><th>State</th><th>Feature</th><th>Iteration</th><th>Finish</th></tr></thead><tbody>{shown.map(({ item, feature }) => {
            const states = finishStates[item.workItemType] ?? ['Closed'], selected = choice[item.id] ?? states[states.length - 1]
            return <tr key={item.key}>
              <td><span className={`type-dot type-${item.workItemType.replace(/\s/g, '').toLowerCase()}`} aria-hidden="true" /><a href={item.url} target="_blank" rel="noreferrer">#{item.id}</a> <strong className="inline">{item.title}</strong><small>{item.workItemType}</small></td>
              <td><Pill tone={stateTone(item.state)}>{item.state}</Pill></td>
              <td>{feature && feature.id !== item.id ? <small className="plain">{feature.title}</small> : '—'}</td>
              <td><small className="plain">{shortPath(item.iterationPath)}</small></td>
              <td><div className="button-row nowrap"><select aria-label={`New state for #${item.id}`} value={selected} onChange={(event) => setChoice({ ...choice, [item.id]: event.target.value })}>{states.map((state) => <option key={state}>{state}</option>)}</select><button type="button" className="ghost" disabled={Boolean(blocked) || busy === `state-${item.id}`} onClick={() => void finish(item, selected)}>{busy === `state-${item.id}` ? 'Saving…' : 'Set'}</button></div></td>
            </tr>
          })}</tbody></table>}
        </TablePanel>
      </>}
  </Page>
}
