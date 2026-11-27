import { useState } from 'react'
import { Modal, Notice } from './ui'
import { maxQueryRefs, newQueryRef, querySource, serverLabel, type AzureQueryRef } from '../azureQueryRef'
import { useAzureQueryPicker } from '../useAzureQueryPicker'
import type { AzureConnectionProfileSummary } from '../azureCredentials'
import type { DashboardBlock, ViewerFilter } from '../dashboardPages'

// DSH-18 The builders' pop-ups for a dashboard's saved Azure queries: Add Azure query… (a connection the app knows and
// one of its project's saved queries, or the query's pasted address, and a name) and Remove Azure query… (one that no
// block or filter reads). Only the reference is saved — never a PAT, never rows.
export interface QueryConnection { server: string; project: string }

const addNote = 'Only the reference is saved in the dashboard’s file in Git — server, project, query id and name; never a PAT, never rows. Each viewer reads the query from Azure DevOps with their own PAT when the dashboard opens; a viewer without a PAT for the server, or without access to the query, sees the reason instead. Reads only: nothing is written to Azure DevOps.'

export function AddAzureQueryDialog({ refs, connections, servers, profiles, viewingAs = false, newId, onCancel, onSave }: { refs: AzureQueryRef[]; connections: QueryConnection[]; servers: string[]; profiles: AzureConnectionProfileSummary[]; viewingAs?: boolean; newId: () => string; onCancel: () => void; onSave: (ref: AzureQueryRef) => Promise<void> }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const picker = useAzureQueryPicker({ connections, servers, profiles, viewingAs }, { onEdit: () => setError('') })
  const { target, name } = picker
  const missing = refs.length >= maxQueryRefs ? `A dashboard reads at most ${maxQueryRefs} Azure queries: remove one first.` : picker.missing
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (missing || !target) { setError(missing); return }
    const ref = newQueryRef({ name, ...target }, refs, newId())
    if (typeof ref === 'string') { setError(ref); return }
    setBusy(true); setError('')
    try { await onSave(ref) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  return <Modal eyebrow="DASHBOARD · DATA SOURCE" title="Add an Azure DevOps query" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)} className="pgb-form dsh-query-form" noValidate>
      {picker.fields}
      <p className="dsh-query-note"><small className="muted">{addNote}</small></p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">{missing && !error && <span className="muted">{missing}</span>}<button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy || Boolean(missing)}>{busy ? 'Saving to Git…' : 'Add data source'}</button></div>
    </form>
  </Modal>
}

// A saved query is removed only when no block or filter reads it (they would lose their data source).
export function RemoveAzureQueryDialog({ refs, blocks, filters, onCancel, onRemove }: { refs: AzureQueryRef[]; blocks: DashboardBlock[]; filters: ViewerFilter[]; onCancel: () => void; onRemove: (ref: AzureQueryRef) => Promise<void> }) {
  const [chosen, setChosen] = useState(refs[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = refs.find((entry) => entry.id === chosen)
  const users = ref ? [...blocks.filter((block) => block.source === querySource(ref.id)).map((block) => block.title), ...filters.filter((filter) => filter.source === querySource(ref.id)).map(() => 'a filter of the filter row')] : []
  const reason = !ref ? 'Choose the query.' : users.length ? `${ref.name} is read by ${users.join(', ')}: change or remove ${users.length === 1 ? 'it' : 'them'} first.` : ''
  return <Modal eyebrow="DASHBOARD · DATA SOURCE" title="Remove an Azure DevOps query" onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); if (!ref || reason) return; setBusy(true); setError(''); void onRemove(ref).catch((failure: unknown) => { setBusy(false); setError(failure instanceof Error ? failure.message : String(failure)) }) }}>
      <label>Query
        <select value={chosen} onChange={(event) => setChosen(event.target.value)}>
          {refs.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({serverLabel(entry.server)} · {entry.project})</option>)}
        </select>
      </label>
      <p>The reference is removed from the dashboard’s file in Git for everyone; the query in Azure DevOps is not changed.</p>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions">{reason && <span className="muted">{reason}</span>}<button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="danger-button" disabled={busy || Boolean(reason)}>{busy ? 'Removing…' : 'Remove data source'}</button></div>
    </form>
  </Modal>
}
