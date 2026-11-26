import { useState } from 'react'
import { Modal, Notice } from './ui'
import { maxQueryRefs, newQueryRef, queryFromUrl, querySource, serverKeyOf, serverLabel, type AzureQueryRef } from '../azureQueryRef'
import { listSavedQueries, patForServer, queryFailure, queryReadReason, type SavedQueryEntry } from '../azureQuerySources'
import type { AzureConnectionProfileSummary } from '../azureCredentials'
import type { DashboardBlock, ViewerFilter } from '../dashboardPages'

// DSH-18 The builders' pop-ups for a dashboard's saved Azure queries: Add Azure query… (a connection the app knows and
// one of its project's saved queries, or the query's pasted address, and a name) and Remove Azure query… (one that no
// block or filter reads). Only the reference is saved — never a PAT, never rows.
export interface QueryConnection { server: string; project: string }

const addNote = 'Only the reference is saved in the dashboard’s file in Git — server, project, query id and name; never a PAT, never rows. Each viewer reads the query from Azure DevOps with their own PAT when the dashboard opens; a viewer without a PAT for the server, or without access to the query, sees the reason instead. Reads only: nothing is written to Azure DevOps.'

export function AddAzureQueryDialog({ refs, connections, servers, profiles, viewingAs = false, newId, onCancel, onSave }: { refs: AzureQueryRef[]; connections: QueryConnection[]; servers: string[]; profiles: AzureConnectionProfileSummary[]; viewingAs?: boolean; newId: () => string; onCancel: () => void; onSave: (ref: AzureQueryRef) => Promise<void> }) {
  const [how, setHow] = useState<'pick' | 'url'>(connections.length ? 'pick' : 'url')
  const [connection, setConnection] = useState(0)
  const [listed, setListed] = useState<{ key: string; entries?: SavedQueryEntry[]; error?: string } | null>(null)
  const [picked, setPicked] = useState('')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const chosen = connections[connection]
  const listKey = chosen ? `${serverKeyOf(chosen.server)}|${chosen.project}` : ''
  const pat = chosen ? patForServer(chosen.server, profiles) : ''
  const listReason = chosen ? queryReadReason(chosen, pat, viewingAs) : 'The app has no Azure DevOps connection yet: paste the query’s address instead.'
  const entries = listed?.key === listKey ? listed.entries : undefined
  const listError = listed?.key === listKey ? listed.error : undefined
  const parsed = how === 'url' && url.trim() ? queryFromUrl(url, servers) : null
  const load = async () => {
    if (!chosen || listReason) return
    setListed({ key: listKey })
    try { setListed({ key: listKey, entries: await listSavedQueries(chosen, pat) }) } catch (failure) { setListed({ key: listKey, error: queryFailure(failure, pat).replace('the query', 'the saved queries') }) }
  }
  const target = how === 'pick' ? (chosen && picked ? { server: chosen.server, project: chosen.project, queryId: picked } : null) : parsed && typeof parsed !== 'string' ? parsed : null
  const missing = refs.length >= maxQueryRefs ? `A dashboard reads at most ${maxQueryRefs} Azure queries: remove one first.` : !target ? (how === 'pick' ? 'Choose a saved query.' : typeof parsed === 'string' ? parsed : 'Paste the query’s address.') : !name.trim() ? 'Enter a name for the data source.' : ''
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
      <fieldset className="od-filters"><legend>The query</legend>
        <div className="pgb-kind"><label className="check"><input type="radio" name="dsh-query-how" checked={how === 'pick'} disabled={!connections.length} onChange={() => { setHow('pick'); setError('') }} />Pick a saved query of a connection</label></div>
        <div className="pgb-kind"><label className="check"><input type="radio" name="dsh-query-how" checked={how === 'url'} onChange={() => { setHow('url'); setError('') }} />Paste the query’s address</label></div>
      </fieldset>
      {how === 'pick' ? <>
        <label>Connection
          <select value={connection} onChange={(event) => { setConnection(Number(event.target.value)); setPicked(''); setError('') }}>
            {connections.map((entry, at) => <option key={`${entry.server}|${entry.project}`} value={at}>{serverLabel(entry.server)} · {entry.project}</option>)}
          </select>
          <small>The servers and projects of the app’s connections. Their saved queries are listed with your own PAT.</small>
        </label>
        {listReason ? <p className="dsh-query-why"><small className="muted">{listReason}</small></p> : !entries ? <div className="button-row"><button type="button" className="ghost" disabled={listed?.key === listKey && !listError} onClick={() => void load()}>{listed?.key === listKey && !listError ? 'Listing the saved queries…' : 'List the saved queries'}</button>{listError && <span className="muted">{listError}</span>}</div>
          : <label>Saved query
            <select value={picked} onChange={(event) => { const id = event.target.value; setPicked(id); const found = entries.find((entry) => entry.id === id); if (found && !name.trim()) setName(found.name.slice(0, 80)); setError('') }}>
              <option value="">— Choose —</option>
              {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.path}</option>)}
            </select>
            <small>{entries.length ? 'Pick a query under Shared Queries: one under My Queries is yours only, so the other viewers would see “no access”.' : 'This project has no saved queries you can read (two folder levels are listed): paste a query’s address instead.'}</small>
          </label>}
      </> : <label>Query address
        <input type="url" value={url} placeholder="https://dev.azure.com/<organization>/<project>/_queries/query/<id>/" onChange={(event) => { setUrl(event.target.value); setError('') }} />
        <small>{parsed && typeof parsed !== 'string' ? `${serverLabel(parsed.server)} · ${parsed.project} · query ${parsed.queryId}` : 'Open the saved query in Azure DevOps and copy the address from the browser. Only servers the app already reads are accepted.'}</small>
      </label>}
      <label>Name
        <input value={name} maxLength={80} onChange={(event) => { setName(event.target.value); setError('') }} />
        <small>How the data source is listed in the block pop-up (at most 80 characters).</small>
      </label>
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
