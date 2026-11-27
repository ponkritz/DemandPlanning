import { useState } from 'react'
import { queryFromUrl, serverKeyOf, serverLabel } from './azureQueryRef'
import { listSavedQueries, patForServer, queryFailure, queryReadReason, type SavedQueryEntry } from './azureQuerySources'
import type { AzureConnectionProfileSummary } from './azureCredentials'
import type { QueryConnection } from './components/AzureQueryDialogs'

// DSH-18, PGB-23: the query picker, shared by Add Azure query… and Add page (Table (Query)) — a connection the app knows
// and one of its project's saved queries listed with the viewer's own PAT, or the query's pasted address (only a server
// the app already reads), and a name. target: the chosen server · project · query id (null until one is chosen);
// missing: what is still to choose ('' when the choice is complete).
export interface QueryPickerOptions { connections: QueryConnection[]; servers: string[]; profiles: AzureConnectionProfileSummary[]; viewingAs?: boolean }
export function useAzureQueryPicker({ connections, servers, profiles, viewingAs = false }: QueryPickerOptions, { nameLabel = 'Name', nameHelp = 'How the data source is listed in the block pop-up (at most 80 characters).', radioName = 'dsh-query-how', onEdit = () => undefined }: { nameLabel?: string; nameHelp?: string; radioName?: string; onEdit?: () => void } = {}) {
  const [how, setHow] = useState<'pick' | 'url'>(connections.length ? 'pick' : 'url')
  const [connection, setConnection] = useState(0)
  const [listed, setListed] = useState<{ key: string; entries?: SavedQueryEntry[]; error?: string } | null>(null)
  const [picked, setPicked] = useState('')
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
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
  const missing = !target ? (how === 'pick' ? 'Choose a saved query.' : typeof parsed === 'string' ? parsed : 'Paste the query’s address.') : !name.trim() ? `Enter a ${nameLabel === 'Name' ? 'name for the data source' : nameLabel.toLowerCase()}.` : ''
  const fields = <>
    <fieldset className="od-filters"><legend>The query</legend>
      <div className="pgb-kind"><label className="check"><input type="radio" name={radioName} checked={how === 'pick'} disabled={!connections.length} onChange={() => { setHow('pick'); onEdit() }} />Pick a saved query of a connection</label></div>
      <div className="pgb-kind"><label className="check"><input type="radio" name={radioName} checked={how === 'url'} onChange={() => { setHow('url'); onEdit() }} />Paste the query’s address</label></div>
    </fieldset>
    {how === 'pick' ? <>
      <label>Connection
        <select value={connection} onChange={(event) => { setConnection(Number(event.target.value)); setPicked(''); onEdit() }}>
          {connections.map((entry, at) => <option key={`${entry.server}|${entry.project}`} value={at}>{serverLabel(entry.server)} · {entry.project}</option>)}
        </select>
        <small>The servers and projects of the app’s connections. Their saved queries are listed with your own PAT.</small>
      </label>
      {listReason ? <p className="dsh-query-why"><small className="muted">{listReason}</small></p> : !entries ? <div className="button-row"><button type="button" className="ghost" disabled={listed?.key === listKey && !listError} onClick={() => void load()}>{listed?.key === listKey && !listError ? 'Listing the saved queries…' : 'List the saved queries'}</button>{listError && <span className="muted">{listError}</span>}</div>
        : <label>Saved query
          <select value={picked} onChange={(event) => { const id = event.target.value; setPicked(id); const found = entries.find((entry) => entry.id === id); if (found && !name.trim()) setName(found.name.slice(0, 80)); onEdit() }}>
            <option value="">— Choose —</option>
            {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.path}</option>)}
          </select>
          <small>{entries.length ? 'Pick a query under Shared Queries: one under My Queries is yours only, so the other viewers would see “no access”.' : 'This project has no saved queries you can read (two folder levels are listed): paste a query’s address instead.'}</small>
        </label>}
    </> : <label>Query address
      <input type="url" value={url} placeholder="https://dev.azure.com/<organization>/<project>/_queries/query/<id>/" onChange={(event) => { setUrl(event.target.value); onEdit() }} />
      <small>{parsed && typeof parsed !== 'string' ? `${serverLabel(parsed.server)} · ${parsed.project} · query ${parsed.queryId}` : 'Open the saved query in Azure DevOps and copy the address from the browser. Only servers the app already reads are accepted.'}</small>
    </label>}
    <label>{nameLabel}
      <input value={name} maxLength={80} onChange={(event) => { setName(event.target.value); onEdit() }} />
      <small>{nameHelp}</small>
    </label>
  </>
  return { fields, target, name, missing }
}
