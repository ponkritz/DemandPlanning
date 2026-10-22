import { useState } from 'react'
import { EmptyState, Notice, Panel, Pill, type Tone, Info } from './ui'
import { formatDateTime } from '../format'
import { defaultShowInMenu, listAzureConnectionProfiles, loadAzureConnectionProfile, showsInMenu, splitAzureUrl, viewNameOf, splitCollectionUrl, type AzureConnectionProfileSummary, type AzureConnectionRole } from '../azureCredentials'
import { defaultReleaseQuery, projectQuery } from '../releaseSource'
import type { AzureWorkspace, ConnectionInput } from '../useAzureWorkspace'
import { loadDismissedPresets, pendingPresets, saveDismissedPresets } from '../connectionPresets'
import { timeWritingView } from '../backlogViews'
import { viewSource } from '../viewSources'
import type { PageProps } from '../pages/types'
import type { GitStorage } from '../useGitStorage'
import { markViewsSynced, serializeViews, viewsFile } from '../viewDefinitions'

const roleLabel: Record<AzureConnectionRole, string> = { 'time-tracking': 'Time Writing (read & write)', 'release-source': 'Releases · DHFI (read only)', documents: 'Documents · Vault (read only)', reference: 'Reference (read only)', 'backlog-view': 'Backlog view (read only)' }
const roleUse: Record<AzureConnectionRole, string> = {
  'time-tracking': 'Feeds the Overview, Monthly Time Writing and Baselines. Without a query the team’s Epic backlog is read; with a query its results plus their parents are read. Refreshed data is saved automatically. One Time Writing connection is active at a time.',
  'release-source': 'Approved documents whose Area Path carries the release identifier; can be shown in the Azure DevOps menu as a read-only view.',
  documents: 'Document source such as Vault; fetched read-only and kept for document counts per release.',
  reference: 'Any other read-only data: fetched and listed with its count.',
  'backlog-view': 'Shown as its own view in the Azure DevOps menu (Epic → Feature → User Story → Task), read only. Without a query the team’s Epic backlog is read; with a query its results plus their parents. Not counted in Overview, Monthly Time Writing or Assigned to Me.',
}
const queryPlaceholder: Record<AzureConnectionRole, string> = { 'time-tracking': 'Optional. Leave empty to read the team Epic backlog.', 'release-source': defaultReleaseQuery, documents: projectQuery, reference: projectQuery, 'backlog-view': 'Optional. Leave empty to read the team Epic backlog.' }
const empty = (role: AzureConnectionRole = 'time-tracking'): ConnectionInput => ({ name: '', viewName: '', showInMenu: defaultShowInMenu(role), role, serverUrl: '', organization: '', project: '', team: '', pat: '', query: '', creatorEmail: '', apiVersion: '' })

// Azure DevOps connection setup, shown as the first section of Settings.
export function AzureConnections({ azure, store, git, onOpenBoard }: { azure: AzureWorkspace; store: PageProps['store']; git?: GitStorage; onOpenBoard: () => void }) {
  const { connectionProfiles, connectionStatus, activeConnectionProfileId, busy } = azure
  const [form, setForm] = useState<ConnectionInput | null>(null)
  const [formError, setFormError] = useState('')
  const [cleanup, setCleanup] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null)
  const [fetchingAll, setFetchingAll] = useState(false)
  const [dismissed, setDismissed] = useState(loadDismissedPresets)
  const presets = pendingPresets(connectionProfiles, dismissed)
  const sources = store.state.azureSources ?? []

  const formFrom = (profile: AzureConnectionProfileSummary): ConnectionInput => {
    const parts = splitAzureUrl(profile.url, profile.baseUrl)
    const { serverUrl, organization } = splitCollectionUrl(parts.baseUrl)
    return { id: profile.id, name: profile.reason, viewName: profile.viewName ?? '', showInMenu: showsInMenu(profile), role: profile.role, serverUrl, organization, project: parts.project, team: parts.team, pat: '', query: profile.query ?? '', creatorEmail: profile.creatorEmail ?? '', apiVersion: profile.apiVersion ?? '' }
  }
  function edit(profile: AzureConnectionProfileSummary) { setFormError(''); setForm(formFrom(profile)) }
  // Clone: a new connection with every setting of this one (server, project, team, query, role, menu) and its saved
  // PAT, so only what differs (query, project, …) needs changing. Saving creates it; the original is unchanged.
  function clone(profile: AzureConnectionProfileSummary) {
    const copy = formFrom(profile)
    setFormError(''); setForm({ ...copy, id: undefined, cloneOf: profile.id, name: `${profile.reason} (copy)`, viewName: profile.viewName ? `${profile.viewName} (copy)` : '' })
  }
  const clonedFrom = form?.cloneOf ? connectionProfiles.find((profile) => profile.id === form.cloneOf)?.reason : undefined
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    // Save also refreshes: the connection is fetched right away and its data saved locally.
    let id: string
    try { id = azure.saveConnection(form); setForm(null); setFormError('') } catch (failure) { setFormError(failure instanceof Error ? failure.message : 'Unable to save the connection.'); return }
    void azure.fetchConnection(id)
  }
  const lastFetch = (profile: AzureConnectionProfileSummary) => {
    if (profile.role === 'time-tracking') return profile.id === activeConnectionProfileId && azure.saved.length ? `${azure.saved.length} saved work items` : ''
    const source = viewSource(store.state, profile.id, profile.role, profile.query, azure.connectionProfiles.filter((entry) => entry.role === 'release-source').length)
    return source ? `${source.items.length} ${profile.role === 'release-source' ? 'documents' : 'work items'} · ${formatDateTime(source.fetchedAt)}` : ''
  }
  const statusTone = (profile: AzureConnectionProfileSummary): [Tone, string] => {
    const status = connectionStatus[profile.id]
    if (status?.state === 'busy') return ['info', 'Fetching…']
    if (status?.state === 'error') return ['danger', 'Failed']
    if (status?.state === 'ok') return ['open', status.message.startsWith('Connection works') ? 'Connected' : 'Fetched']
    return lastFetch(profile) ? ['open', 'Data saved'] : ['neutral', 'Not fetched']
  }

  // Only one Time Writing connection is used (the active one); extra ones are duplicates. Clean up keeps the active one
  // and removes the others here and, with a Git token that can save, from the shared connection setup in Git too
  // (otherwise the setup in Git would add them back at the next start).
  const timeWriting = connectionProfiles.filter((profile) => profile.role === 'time-tracking')
  const keep = timeWriting.find((profile) => profile.id === activeConnectionProfileId) ?? timeWriting[0]
  const extras = timeWriting.filter((profile) => profile.id !== keep?.id)
  // A backlog view of the same project and team as Time Writing reads the same work items: it can take over as the
  // Time Writing connection (e.g. when it loads and Time Writing does not). The replaced connection is removed here,
  // from the shared setup in Git and with its data in Git, so it does not come back for anyone.
  const sameBacklog = (profile: AzureConnectionProfileSummary) => {
    if (!keep || profile.role !== 'backlog-view' || profile.query) return false
    const a = splitAzureUrl(profile.url, profile.baseUrl), b = splitAzureUrl(keep.url, keep.baseUrl)
    return [a.baseUrl, a.project, a.team].join('|').toLowerCase() === [b.baseUrl, b.project, b.team].join('|').toLowerCase()
  }
  const twins = connectionProfiles.filter(sameBacklog)
  async function switchTimeWriting(profile: AzureConnectionProfileSummary) {
    const toGit = Boolean(git?.connected && !git.readOnly && !azure.isSample)
    const replacing = timeWriting.filter((entry) => entry.id !== profile.id).map((entry) => `“${entry.reason}”`).join(', ')
    if (!window.confirm(`Use “${profile.reason}” as the Time Writing connection${replacing ? ` and remove ${replacing}` : ''}?${toGit ? ' The connection setup in Git is updated and data saved to Git for the removed connection is deleted, so it does not come back for anyone.' : ''} Its PAT is not revoked in Azure DevOps.`)) return
    const replaced = azure.makeTimeWriting(profile.id)
    const names = replaced.map((entry) => entry.reason).join(', ')
    let text = `“${profile.reason}” is now the Time Writing connection${names ? `; removed ${names}` : ''}.`, tone: 'success' | 'warning' = 'success'
    if (toGit && git) {
      try {
        const list = listAzureConnectionProfiles()
        await git.writeViews(serializeViews(viewsFile(list)), `Use ${profile.reason} as the Time Writing connection${names ? `; remove ${names}` : ''}`)
        markViewsSynced(list)
        const deleted = await git.removeSnapshots([profile.id, ...replaced.map((entry) => entry.id)], `Remove data of replaced connection${names ? ` ${names}` : ''}`)
        text += ` The connection setup in Git is updated${deleted ? ` and ${deleted} data file${deleted === 1 ? '' : 's'} removed` : ''}.`
      } catch (failure) { tone = 'warning'; text += ` Git was not updated (${failure instanceof Error ? failure.message : String(failure)}); the old connection may come back at the next start.` }
    } else if (git?.connected) { tone = 'warning'; text += ' Your Git token cannot save, so the connection setup in Git still has the old connection; someone with write access needs to do this too.' }
    setCleanup({ tone, text })
    void azure.fetchConnection(profile.id)
  }
  async function removeDuplicates() {
    if (!keep || !extras.length) return
    const names = extras.map((profile) => profile.reason).join(', '), toGit = Boolean(git?.connected && !git.readOnly && !azure.isSample)
    if (!window.confirm(`Keep “${keep.reason}” as the only Time Writing connection and remove ${extras.length}: ${names}?${toGit ? ' The connection setup in Git is updated too, so they do not come back for anyone.' : ''} Their PATs are not revoked in Azure DevOps.`)) return
    for (const profile of extras) azure.removeConnection(profile.id)
    if (!toGit || !git) { setCleanup({ tone: git?.connected ? 'warning' : 'success', text: `Removed ${names}.${git?.connected ? ' They are still in the connection setup in Git (your Git token cannot save), so they come back at the next start until someone with write access removes them there.' : ''}` }); return }
    try {
      await git.writeViews(serializeViews(viewsFile(listAzureConnectionProfiles())), `Remove duplicate Time Writing connection${extras.length === 1 ? '' : 's'}: ${names}`)
      markViewsSynced(listAzureConnectionProfiles())
      setCleanup({ tone: 'success', text: `Removed ${names} here and from the connection setup in Git.` })
    } catch (failure) { setCleanup({ tone: 'warning', text: `Removed ${names} here, but Git was not updated (${failure instanceof Error ? failure.message : String(failure)}); they may come back at the next start.` }) }
  }

  return <section id="settings-connections" className="settings-section">
    <div className="settings-section-heading"><div><p className="eyebrow">SETTINGS</p><h2>Azure DevOps <Info>Each connection is one set: base URL (Azure DevOps Services or an on-prem Azure DevOps Server collection), project, PAT and an optional query, plus what its data is used for. Add as many as you need; Fetch all reads every connection read-only, one after another. PATs stay in this browser and are excluded from backups, SharePoint and Git.</Info></h2></div><button className="primary" onClick={onOpenBoard}>Open {timeWritingView(connectionProfiles, activeConnectionProfileId).name} →</button></div>
    <Panel className="connection-panel" eyebrow="AZURE DEVOPS" title="Connections" info="Every connection is saved as soon as it is fetched (an empty Time Writing result never replaces saved data without asking). Nothing is written to Azure DevOps when fetching."
      action={<div className="button-row"><button type="button" className="ghost" onClick={() => { setFormError(''); setForm(empty(connectionProfiles.some((profile) => profile.role === 'time-tracking') ? 'reference' : 'time-tracking')) }}>＋ Add connection</button><button type="button" className="primary" disabled={!connectionProfiles.length || fetchingAll || busy} onClick={() => { setFetchingAll(true); void azure.fetchAll().finally(() => setFetchingAll(false)) }}>{fetchingAll ? 'Fetching all…' : 'Fetch all'}</button></div>}>
      {presets.length > 0 && <div className="preset-list">{presets.map((preset) => <div className="preset-row" key={preset.key}>
        <div><strong>{preset.name}</strong><small>{preset.serverUrl ? `${preset.serverUrl.replace('https://', '')}/${preset.organization}` : `dev.azure.com/${preset.organization}`} · {preset.project}{preset.team ? ` · team ${preset.team}` : ''}</small></div>
        <Pill tone="warning">Needs PAT</Pill>
        <div className="button-row nowrap"><button type="button" className="primary" onClick={() => { setFormError(''); setForm({ ...preset, pat: '' }) }}>Set up</button><button type="button" className="text-button" onClick={() => { const next = [...dismissed, preset.key]; setDismissed(next); saveDismissedPresets(next) }}>Dismiss</button></div>
      </div>)}</div>}
      {extras.length > 0 && keep && <Notice tone="warning">{timeWriting.length} Time Writing (QMS-0025) connections: only “{keep.reason}” is used; {extras.map((profile) => `“${profile.reason}”`).join(', ')} {extras.length === 1 ? 'is a duplicate' : 'are duplicates'}. <button type="button" className="text-button" onClick={() => void removeDuplicates()}>Keep “{keep.reason}”, remove the other{extras.length === 1 ? '' : 's'}</button></Notice>}
      {keep && twins.map((profile) => <Notice key={profile.id} tone="warning">“{profile.reason}” reads the same backlog as the Time Writing connection “{keep.reason}”. If “{profile.reason}” loads and “{keep.reason}” does not, <button type="button" className="text-button" onClick={() => void switchTimeWriting(profile)}>use “{profile.reason}” as Time Writing and remove “{keep.reason}”</button>.</Notice>)}
      {cleanup && <Notice tone={cleanup.tone}>{cleanup.text}</Notice>}
      {connectionProfiles.length ? <div className="azure-table"><table className="connection-table"><thead><tr><th>Connection</th><th>Used for</th><th>Organization / project</th><th>Query</th><th>Status</th><th /></tr></thead><tbody>{connectionProfiles.map((profile) => {
        const parts = splitAzureUrl(profile.url, profile.baseUrl), [tone, label] = statusTone(profile), status = connectionStatus[profile.id]
        const active = profile.role === 'time-tracking' && profile.id === activeConnectionProfileId
        return <tr key={profile.id}>
          <td><strong>{profile.reason}</strong>{active && <small>Active Time Writing source</small>}<small>{showsInMenu(profile) ? `In menu as “${viewNameOf(profile)}”` : 'Hidden from menu (backend only)'}</small></td>
          <td>{roleLabel[profile.role]}</td>
          <td>{parts.baseUrl.replace('https://', '')}{profile.baseUrl && <Pill tone="info">On-prem</Pill>}<small>{parts.project}{parts.team ? ` · team ${parts.team}` : ''}{profile.apiVersion ? ` · API ${profile.apiVersion}` : ''}</small></td>
          <td>{profile.query ? <span className="query-chip" title={profile.query}>Custom query</span> : <small>{profile.role === 'time-tracking' || profile.role === 'backlog-view' ? 'Team Epic backlog' : 'Default'}</small>}</td>
          <td><Pill tone={tone}>{label}</Pill><small>{status?.message ?? lastFetch(profile)}</small></td>
          <td><div className="button-row nowrap"><button type="button" className="ghost" disabled={status?.state === 'busy' || fetchingAll} onClick={() => void azure.fetchConnection(profile.id)}>Fetch</button><button type="button" className="ghost" disabled={status?.state === 'busy' || fetchingAll} onClick={() => void azure.testConnection(profile.id)}>Test</button>{profile.role === 'backlog-view' && <button type="button" className="ghost" disabled={status?.state === 'busy' || fetchingAll || busy} onClick={() => void switchTimeWriting(profile)}>Use as Time Writing</button>}<button type="button" className="ghost" onClick={() => edit(profile)}>Edit</button><button type="button" className="ghost" title="New connection with the same settings and PAT" onClick={() => clone(profile)}>Clone</button><button type="button" className="text-button" onClick={() => { if (window.confirm(`Remove “${profile.reason}” from this browser? Its PAT is not revoked in Azure DevOps.`)) azure.removeConnection(profile.id) }}>Remove</button></div></td>
        </tr>
      })}</tbody></table></div>
        : presets.length ? null : <EmptyState title="No connections yet." detail="Add your Time Writing project first, then the DHFI release source and any other read-only sources." />}
      {form && <form className="connection-editor" onSubmit={submit}>
        <h3>{form.id ? `Edit “${connectionProfiles.find((profile) => profile.id === form.id)?.reason ?? form.name}”` : clonedFrom ? `Clone of “${clonedFrom}”` : 'New connection'}</h3>{clonedFrom ? <Notice>All settings and the PAT of “{clonedFrom}” are copied. Change the name and what differs (query, project, team, …), then Save and refresh data. “{clonedFrom}” itself is not changed.</Notice> : !form.id && form.organization && <Notice>Pre-filled settings: enter your PAT, change anything else if needed, then Save and Test.</Notice>}
        <div className="connection-form">
          <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. QMS-0025, Digital Platform, DHFI releases" /></label>
          <label>View name (optional)<input value={form.viewName} maxLength={80} onChange={(event) => setForm({ ...form, viewName: event.target.value })} placeholder={form.name.trim() || 'Same as the connection name'} /><small>Name in the Azure DevOps menu and on its tab, e.g. QMS-0025.</small></label>
          <label className="checkbox-label menu-toggle"><input type="checkbox" checked={form.showInMenu} onChange={(event) => setForm({ ...form, showInMenu: event.target.checked })} />Show in menu<small>Off: used only in the background (data, releases, documents), not listed as a view.</small></label>
          <label>Used for<select value={form.role} onChange={(event) => { const role = event.target.value as AzureConnectionRole; setForm({ ...form, role, showInMenu: defaultShowInMenu(role) }) }}>{(Object.keys(roleLabel) as AzureConnectionRole[]).map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}</select></label>
          <label>Server URL (on-prem only)<input type="url" value={form.serverUrl} onChange={(event) => setForm({ ...form, serverUrl: event.target.value })} placeholder="Empty for dev.azure.com · e.g. https://tfs.company.com/tfs" /><small>Leave empty for Azure DevOps Services. On-prem: the server address without the collection.</small></label>
          <label>Organization / collection<input required value={form.organization} onChange={(event) => setForm({ ...form, organization: event.target.value })} placeholder={form.serverUrl.trim() ? 'e.g. DHPCollection' : 'Azure DevOps organization'} /><small>{form.serverUrl.trim() ? 'On-prem this is the collection name.' : 'The name after dev.azure.com/.'}</small></label>
          <label>Project<input required value={form.project} onChange={(event) => setForm({ ...form, project: event.target.value })} placeholder="Project name" /></label>
          {(form.role === 'time-tracking' || form.role === 'backlog-view') && <label>Team{form.query.trim() ? ' (optional with a query)' : ''}<input value={form.team} onChange={(event) => setForm({ ...form, team: event.target.value })} placeholder="Team whose Epic backlog is read" /></label>}
          <label>API version (optional)<input value={form.apiVersion} onChange={(event) => setForm({ ...form, apiVersion: event.target.value })} placeholder="Automatic" /><small>Leave empty to detect it: 7.1, then 6.0 and 5.0 for older Azure DevOps Server.</small></label>
          <label>PAT{form.id ? ' (leave empty to keep the saved one)' : clonedFrom ? ` (leave empty to use the PAT of “${clonedFrom}”)` : ''}<input type="password" autoComplete="off" required={form.id ? !loadAzureConnectionProfile(form.id) : !(form.cloneOf && loadAzureConnectionProfile(form.cloneOf))} value={form.pat} onChange={(event) => setForm({ ...form, pat: event.target.value })} placeholder={form.role === 'time-tracking' ? 'Work Items (Read & Write)' : 'Work Items (Read)'} /></label>
          {form.role === 'time-tracking' && <label>Feature creator email (optional)<input type="email" value={form.creatorEmail} onChange={(event) => setForm({ ...form, creatorEmail: event.target.value })} placeholder="Assigned to Features created from the app" /></label>}
          <label className="query-field">Query (optional, WIQL)<textarea rows={4} spellCheck={false} value={form.query} onChange={(event) => setForm({ ...form, query: event.target.value })} placeholder={queryPlaceholder[form.role]} /><small>A flat query: SELECT … FROM WorkItems WHERE …. Only the WHERE clause is used; results are read in pages. {form.role === 'time-tracking' || form.role === 'backlog-view' ? '' : 'Empty uses the default shown.'}</small></label>
        </div>
        <Notice>{roleUse[form.role]}</Notice>
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="button-row"><button className="primary">Save and refresh data</button><button type="button" className="ghost" onClick={() => setForm(null)}>Cancel</button></div>
      </form>}
    </Panel>
    {sources.length > 0 && <Panel className="connection-panel" eyebrow="READ ONLY" title="Fetched read-only sources" info="Snapshots from document and reference connections, stored with the app data.">
      <div className="azure-table"><table><thead><tr><th>Connection</th><th>Project</th><th>Work items</th><th>By type</th><th>Fetched</th></tr></thead><tbody>{sources.map((source) => {
        const types = Object.entries(source.items.reduce<Record<string, number>>((counts, item) => { counts[item.workItemType] = (counts[item.workItemType] ?? 0) + 1; return counts }, {})).sort((a, b) => b[1] - a[1])
        return <tr key={source.connectionId}><td><strong>{source.name}</strong><small>{roleLabel[source.role]}</small></td><td>{source.organization} / {source.project}</td><td>{source.items.length}</td><td>{types.slice(0, 4).map(([type, count]) => `${type} ${count}`).join(' · ') || '—'}</td><td>{formatDateTime(source.fetchedAt)}</td></tr>
      })}</tbody></table></div>
    </Panel>}
    <Panel className="connection-panel" eyebrow="DEMO" title="Synthetic sample" info="Replaces the cached Time Writing data and release source with a generated dataset, without reading from or writing to Azure DevOps.">
      <div className="button-row"><button type="button" className="ghost" disabled={busy} onClick={() => { if (azure.saved.length && !azure.isSample && !window.confirm('Replace the saved Azure cache with a synthetic sample dataset? Export a JSON backup first if you need the current data.')) return; azure.loadSampleData() }}>Load synthetic sample dataset</button></div>
    </Panel>
  </section>
}
