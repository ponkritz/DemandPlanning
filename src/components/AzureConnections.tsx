import { useState } from 'react'
import { EmptyState, Modal, Notice, Panel, Pill, type Tone, Info } from './ui'
import { formatDateTime } from '../format'
import { dataSetOfProfile, dataSets, defaultMatchThreshold, defaultStreams, namesStream, profileForDataSet, profileForStream, streamOfProfile } from '../streams'
import { normalizeReleaseSourceSettings } from '../releaseSource'
import { collectionUrlFrom, composeAzureUrl, forgetKnownServer, listKnownServers, loadServerPat, saveKnownServer, saveServerPat, serverKey, defaultShowInMenu, listAzureConnectionProfiles, loadAzureConnectionProfile, showsInMenu, splitAzureUrl, viewNameOf, splitCollectionUrl, type AzureConnectionProfileSummary, type AzureConnectionRole } from '../azureCredentials'
import { defaultReleaseQuery, projectQuery } from '../releaseSource'
import type { AzureWorkspace, ConnectionInput } from '../useAzureWorkspace'
import { isCloudBase } from '../azureDevOps'
import { connectionPresets, loadDismissedPresets, pendingPresets, saveDismissedPresets } from '../connectionPresets'
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
export function AzureConnections({ azure, store, git, onOpenBoard, canManage = true }: { azure: AzureWorkspace; store: PageProps['store']; git?: GitStorage; onOpenBoard: () => void; canManage?: boolean }) {
  const threshold = normalizeReleaseSourceSettings(store.state.releaseSourceSettings).matchThreshold ?? defaultMatchThreshold
  const { connectionProfiles, connectionStatus, activeConnectionProfileId, busy } = azure
  const [form, setForm] = useState<ConnectionInput | null>(null)
  const [formError, setFormError] = useState('')
  const [cleanup, setCleanup] = useState<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null)
  const [fetchingAll, setFetchingAll] = useState(false)
  const [dismissed, setDismissed] = useState(loadDismissedPresets)
  const presets = pendingPresets(connectionProfiles, dismissed)
  // Only the data of connections that exist here (data of a removed or duplicate connection is not listed).
  const sources = (store.state.azureSources ?? []).filter((source) => connectionProfiles.some((profile) => profile.id === source.connectionId))

  const [patDrafts, setPatDrafts] = useState<Record<string, string>>({})
  const [patNote, setPatNote] = useState<{ key: string; text: string } | null>(null)
  const [newServer, setNewServer] = useState<{ serverUrl: string; organization: string; pat: string; error?: string } | null>(null)
  // Where a preset or form points: its project URL and, on-prem, the collection base (the server's key).
  const placeOf = (input: Pick<ConnectionInput, 'serverUrl' | 'organization' | 'project'>) => { const base = collectionUrlFrom(input.serverUrl, input.organization); return { url: composeAzureUrl(base, input.project), ...(isCloudBase(base) ? {} : { baseUrl: base }) } }
  const hostLabel = (base: string) => base.replace(/^https:\/\//, '').replace(/\/tfs\//i, ' · ').replace(/^dev\.azure\.com\//, 'Cloud · ')
  const profilePat = (profile: AzureConnectionProfileSummary) => Boolean(loadAzureConnectionProfile(profile.id)?.token)
  const presetHasPat = (preset: Pick<ConnectionInput, 'serverUrl' | 'organization' | 'project'>) => Boolean(loadServerPat(serverKey(placeOf(preset))) || connectionProfiles.some((profile) => serverKey(profile) === serverKey(placeOf(preset)) && profilePat(profile)))
  const formServerKey = form ? (() => { try { return serverKey(placeOf({ ...form, project: form.project || 'x' })) } catch { return '' } })() : ''
  const formServerPat = (() => { try { return form ? presetHasPat(form) : false } catch { return false } })()
  // Servers: every server of a connection or a default, with its projects, what uses it and whether a PAT is saved.
  const servers = (() => {
    const map = new Map<string, { key: string; label: string; onPrem: boolean; cloud: boolean; serverUrl: string; organization: string; projects: Set<string>; uses: string[]; ids: string[]; hasPat: boolean; savedPat: boolean }>()
    const entry = (place: { url: string; baseUrl?: string }) => {
      const key = serverKey(place), parts = splitAzureUrl(place.url, place.baseUrl)
      const found = map.get(key) ?? { key, label: hostLabel(parts.baseUrl), onPrem: Boolean(place.baseUrl), cloud: !place.baseUrl, ...splitCollectionUrl(parts.baseUrl), projects: new Set<string>(), uses: [], ids: [], hasPat: false, savedPat: Boolean(loadServerPat(key)) }
      if (parts.project) found.projects.add(parts.project); map.set(key, found); return found
    }
    for (const profile of connectionProfiles) { const found = entry(profile); found.uses.push(viewNameOf(profile)); found.ids.push(profile.id); found.hasPat ||= found.savedPat || profilePat(profile) }
    for (const preset of connectionPresets) { const found = entry(placeOf(preset)); found.hasPat ||= found.savedPat }
    for (const known of listKnownServers()) { try { const base = collectionUrlFrom(known.serverUrl, known.organization); const found = entry({ url: base, ...(isCloudBase(base) ? {} : { baseUrl: base }) }); found.hasPat ||= found.savedPat } catch { /* skipped */ } }
    return [...map.values()].map((server) => ({ ...server, projects: [...server.projects] })).sort((a, b) => Number(a.onPrem) - Number(b.onPrem) || a.label.localeCompare(b.label))
  })()
  const presetFor = (name: string) => connectionPresets.find((preset) => preset.role !== 'time-tracking' && (namesStream(preset.viewName, name) || namesStream(preset.name, name)))
  const whereOf = (place: { url: string; baseUrl?: string }) => { const parts = splitAzureUrl(place.url, place.baseUrl); return `${hostLabel(parts.baseUrl)} · ${parts.project}${parts.team ? ` · team ${parts.team}` : ''}` }
  const timeWritingPreset = connectionPresets.find((preset) => preset.role === 'time-tracking')
  const activeTimeWriting = connectionProfiles.find((profile) => profile.id === activeConnectionProfileId && profile.role === 'time-tracking') ?? connectionProfiles.find((profile) => profile.role === 'time-tracking')
  const ruleLabel = { dp: 'DP: name from Area Path, number from Iteration Path; fuzzy match', iocc: 'IOCC: Type of Release from Area Path, name from Title; fuzzy match', path: '“Release x.y.z” path segment; exact match', tool: 'Tool Validations: one entry per tool (its Area Path folder, else the Title); exact match', asset: 'CP: release name and number from the asset Title ([Release name] [Release No] [Asset name]); fuzzy match' } as const
  // DP's data sets (Pedestal release register, DHFI documents) sit with the streams: mapped like them, hidden from the menu.
  const dataSetRule = { Pedestal: 'DP releases: every Release work item; Title names the release and version', DHFI: 'DP dates: documents whose Title names a Pedestal Release; Author Approval (else Closed) Date gives the month' } as Record<string, string>
  const mapping = [
    { name: 'Time Writing', timeWriting: true, windchill: false, profile: activeTimeWriting, preset: timeWritingPreset, rule: 'Team backlog (read & write)', where: activeTimeWriting ? whereOf(activeTimeWriting) : timeWritingPreset ? whereOf(placeOf(timeWritingPreset)) : '', query: activeTimeWriting?.query ?? '' },
    ...dataSets.map((set) => { const profile = profileForDataSet(set.name, connectionProfiles), preset = set.presetKey ? connectionPresets.find((entry) => entry.key === set.presetKey) : undefined; return { name: set.name, dataSet: true, timeWriting: false, windchill: false, profile, preset, rule: dataSetRule[set.name] ?? '', where: profile ? whereOf(profile) : preset ? whereOf(placeOf(preset)) : '', query: profile?.query ?? preset?.query ?? '' } }),
    ...defaultStreams.map((stream) => { const profile = profileForStream(stream, connectionProfiles), preset = stream.source === 'azure' ? presetFor(stream.name) : undefined; return { name: stream.name, timeWriting: false, windchill: stream.source === 'windchill', profile, preset, rule: stream.source === 'windchill' ? 'Windchill export' : ruleLabel[stream.rule], where: profile ? whereOf(profile) : preset ? whereOf(placeOf(preset)) : '', query: profile?.query ?? preset?.query ?? '' } }),
  ]
  const mapped = new Set(mapping.flatMap((row) => row.profile ? [row.profile.id] : []))
  const others = connectionProfiles.filter((profile) => !mapped.has(profile.id))
  const otherPresets = presets.filter((preset) => preset.role !== 'time-tracking' && !streamOfProfile({ viewName: preset.viewName, reason: preset.name, role: preset.role }) && !dataSets.some((set) => set.presetKey === preset.key))
  // Set up a default: saved and fetched right away when its server already has a PAT, otherwise the form asks for one.
  function setUpStream(preset: Omit<ConnectionInput, 'pat'>) {
    setFormError('')
    if (!presetHasPat(preset) || preset.role === 'time-tracking') { setForm({ ...preset, pat: '' }); return }
    try { const id = azure.saveConnection({ ...preset, pat: '' }); void azure.fetchConnection(id) } catch (failure) { setForm({ ...preset, pat: '' }); setFormError(failure instanceof Error ? failure.message : 'Unable to save the connection.') }
  }
  // Admins: a changed stream mapping goes to the shared setup in Git right away.
  async function shareMapping(name: string) {
    if (!canManage || !git?.connected || git.readOnly || azure.isSample) return
    try { const list = listAzureConnectionProfiles(); await git.writeViews(serializeViews(viewsFile(list)), `Stream mapping: ${name}`); markViewsSynced(list); setCleanup({ tone: 'success', text: `“${name}” saved to the shared setup in Git.` }) }
    catch (failure) { setCleanup({ tone: 'warning', text: `“${name}” saved here, but not to Git: ${failure instanceof Error ? failure.message : String(failure)}` }) }
  }

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
    const saved = listAzureConnectionProfiles().find((profile) => profile.id === id)
    if (saved && (saved.role === 'time-tracking' || streamOfProfile(saved) || dataSetOfProfile(saved))) void shareMapping(viewNameOf(saved))
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
    <Panel className="connection-panel" eyebrow="STEP 1" title="Servers and PATs" action={<button type="button" className="ghost" onClick={() => setNewServer({ serverUrl: '', organization: '', pat: '' })}>＋ Add server</button>} info={<ul><li>One PAT per server: an on-prem collection (e.g. tfsapac04 · DHPCollection, for DHP.Vault and DHP) or a cloud organization (dev.azure.com/ALMP-ORG-MSTP01). Every connection on the server uses it, so it is entered once.</li><li>PATs stay in this browser or desktop app only; they are never saved to Git, backups or SharePoint, and each user enters their own.</li></ul>}>
      <div className="azure-table"><table><thead><tr><th>Server</th><th>Projects</th><th>Used by</th><th>PAT</th><th /></tr></thead><tbody>
        {servers.map((server) => <tr key={server.key}>
          <td><strong>{server.label}</strong>{server.onPrem && <Pill tone="info">On-prem</Pill>}</td>
          <td><small className="plain">{server.projects.join(', ')}</small></td>
          <td><small className="plain">{server.uses.join(', ') || '—'}</small></td>
          <td>{server.hasPat ? <Pill tone="open">PAT saved</Pill> : <Pill tone="warning">No PAT</Pill>}</td>
          <td><form className="inline-form server-pat" onSubmit={(event) => { event.preventDefault(); const value = patDrafts[server.key]?.trim(); if (!value) return; saveServerPat(server.key, value); setPatDrafts((current) => ({ ...current, [server.key]: '' })); setPatNote({ key: server.key, text: `PAT saved for ${server.label}: ${server.uses.length ? `used by ${server.uses.length} connection${server.uses.length === 1 ? '' : 's'} on it` : 'used by every connection set up on it'}.` }); azure.reloadConnectionProfiles() }}>
            <input type="password" autoComplete="off" aria-label={`PAT for ${server.label}`} placeholder={server.hasPat ? 'Replace PAT' : server.cloud ? 'PAT · Work Items (Read & Write)' : 'PAT · Work Items (Read)'} value={patDrafts[server.key] ?? ''} onChange={(event) => setPatDrafts((current) => ({ ...current, [server.key]: event.target.value }))} />
            <button className="primary" disabled={!patDrafts[server.key]?.trim()}>Save PAT</button>
            {server.hasPat && server.ids.length > 0 && <button type="button" className="ghost" disabled={fetchingAll} onClick={() => { setFetchingAll(true); void (async () => { for (const id of server.ids) await azure.fetchConnection(id) })().finally(() => setFetchingAll(false)) }}>Fetch {server.ids.length}</button>}
            {!server.ids.length && !connectionPresets.some((preset) => { try { return serverKey(placeOf(preset)) === server.key } catch { return false } }) && <button type="button" className="text-button" onClick={() => { if (!window.confirm(`Remove ${server.label} and its PAT from this browser?`)) return; forgetKnownServer(collectionUrlFrom(server.serverUrl, server.organization)); saveServerPat(server.key, ''); azure.reloadConnectionProfiles(); setPatNote(null) }}>Remove server</button>}
            {server.savedPat && <button type="button" className="text-button" onClick={() => { if (!window.confirm(`Remove the PAT for ${server.label} from this browser? Connections on it cannot fetch until a PAT is entered again. It is not revoked in Azure DevOps.`)) return; saveServerPat(server.key, ''); azure.reloadConnectionProfiles(); setPatNote({ key: server.key, text: `PAT removed for ${server.label}.` }) }}>Remove</button>}
          </form>{patNote?.key === server.key && <small className="positive">{patNote.text}</small>}</td>
        </tr>)}
      </tbody></table></div>
      {newServer && <Modal title="Add server" eyebrow="AZURE DEVOPS · STEP 1" wide form onClose={() => setNewServer(null)}><form className="connection-editor" onSubmit={(event) => {
        event.preventDefault()
        try {
          if (!newServer.pat.trim()) throw new Error('Enter the PAT for this server.')
          const base = saveKnownServer({ serverUrl: newServer.serverUrl, organization: newServer.organization })
          saveServerPat(serverKey({ url: base, ...(isCloudBase(base) ? {} : { baseUrl: base }) }), newServer.pat)
          setNewServer(null); setPatNote({ key: serverKey({ url: base, ...(isCloudBase(base) ? {} : { baseUrl: base }) }), text: 'Server added with its PAT. New queries can now be created on it.' }); azure.reloadConnectionProfiles()
        } catch (failure) { setNewServer({ ...newServer, error: failure instanceof Error ? failure.message : String(failure) }) }
      }}>
        <div className="connection-form">
          <label>Server URL (on-prem only)<input type="url" value={newServer.serverUrl} onChange={(event) => setNewServer({ ...newServer, serverUrl: event.target.value })} placeholder="Empty for dev.azure.com · e.g. https://tfs.company.com/tfs" /><small>Leave empty for Azure DevOps Services (cloud).</small></label>
          <label>Organization / collection<input required value={newServer.organization} onChange={(event) => setNewServer({ ...newServer, organization: event.target.value })} placeholder={newServer.serverUrl.trim() ? 'e.g. DHPCollection' : 'Azure DevOps organization'} /></label>
          <label>PAT<input type="password" autoComplete="off" required value={newServer.pat} onChange={(event) => setNewServer({ ...newServer, pat: event.target.value })} placeholder="Work Items (Read), or Read & Write for Time Writing" /><small>Stays in this browser or desktop app; used by every connection on this server.</small></label>
        </div>
        {newServer.error && <Notice tone="error">{newServer.error}</Notice>}
        <div className="button-row"><button className="primary">Add server</button><button type="button" className="ghost" onClick={() => setNewServer(null)}>Cancel</button></div>
      </form></Modal>}
    </Panel>
    <Panel className="connection-panel" eyebrow="STEP 2" title="Stream mapping" info={<ul><li>Which server, project and query feed each stream. Time Writing (QMS-0025) is the team's backlog; DP, CP, IOCC, Content and Tool Validations are queries on the on-prem DHP.Vault project; S&amp;S IT comes from the Windchill export named like it (ECP will follow). Pedestal (the DHP release register) and DHFI are DP's two data sets: with both mapped, DP lists every Pedestal Release, dated by the DHFI documents whose Title names it.</li><li>Release rules: DP — name from the Area Path, number from the Iteration Path. IOCC — Type of Release from the Area Path segment after “IOCC”, name from the Title. Others — a “Release x.y.z” path segment. DP and IOCC are matched to QMS-0025 Features fuzzily; the best Feature counts at the threshold.</li><li>The mapping is shared with everyone through Git (azure-views.json); roles with “Manage shared settings” change it. Everyone else only enters their PAT per server.</li></ul>}
      action={<div className="button-row">{mapping.some((row) => !row.profile && row.preset && !row.timeWriting && presetHasPat(row.preset)) && <button type="button" className="primary" onClick={() => { for (const row of mapping) if (!row.profile && row.preset && !row.timeWriting && presetHasPat(row.preset)) setUpStream(row.preset) }}>Set up all with saved PATs</button>}<label className="inline-select">Fuzzy match threshold<input type="number" min={1} max={100} step={1} value={threshold} disabled={!canManage} aria-label="Fuzzy match threshold (%)" onChange={(event) => { const value = Math.round(Number(event.target.value)); if (value >= 1 && value <= 100) store.update((draft) => { draft.releaseSourceSettings = { ...normalizeReleaseSourceSettings(draft.releaseSourceSettings), matchThreshold: value }; return draft }) }} />%</label></div>}>
      {!canManage && <Notice tone="info">The stream mapping is managed by roles with “Manage shared settings” and comes from Git. Enter your PAT per server above.</Notice>}
      <div className="azure-table"><table><thead><tr><th>Stream</th><th>Server · project</th><th>Query</th><th>Rule</th><th>Status</th><th /></tr></thead><tbody>
        {mapping.map((row) => { const [tone, label] = row.profile ? statusTone(row.profile) : ['warning' as Tone, row.windchill ? 'Windchill export' : 'Not mapped']; const status = row.profile ? connectionStatus[row.profile.id] : undefined; return <tr key={row.name}>
          <td><strong>{row.name}</strong>{row.profile && <small>{viewNameOf(row.profile)}</small>}{row.timeWriting && row.profile && !row.profile.creatorEmail && <small className="warning-text">Work email missing: Edit to add it</small>}</td>
          <td>{row.windchill ? <small className="plain">Windchill export “{row.name}”</small> : row.where ? <small className="plain">{row.where}</small> : <span className="muted">—</span>}</td>
          <td>{row.windchill ? '—' : row.query ? <span className="query-chip" title={row.query}>Query</span> : row.timeWriting ? <small>Team Epic backlog</small> : <span className="muted">—</span>}</td>
          <td><small className="plain">{row.rule}</small></td>
          <td>{row.windchill ? <small className="muted">Import on the Windchill page</small> : <><Pill tone={tone}>{label}</Pill>{status?.message && <small>{status.message}</small>}</>}</td>
          <td><div className="button-row nowrap">
            {!row.windchill && !row.profile && row.preset && <button type="button" className="primary" onClick={() => setUpStream(row.preset!)}>Set up</button>}
            {!row.windchill && !row.profile && !row.preset && canManage && <button type="button" className="primary" onClick={() => { setFormError(''); setForm('dataSet' in row && row.dataSet ? { ...empty('reference'), name: row.name, viewName: row.name, showInMenu: false } : { ...empty('release-source'), name: row.name, viewName: row.name, showInMenu: true }) }}>Add query</button>}
            {row.profile && <button type="button" className="ghost" disabled={status?.state === 'busy' || fetchingAll} onClick={() => void azure.fetchConnection(row.profile!.id)}>Fetch</button>}
            {row.profile && (canManage || row.timeWriting) && <button type="button" className="ghost" onClick={() => edit(row.profile!)}>Edit</button>}
          </div></td>
        </tr> })}
      </tbody></table></div>
    </Panel>
    <Panel className="connection-panel" eyebrow="STEP 3" title="Other views" info="Any other Azure DevOps view: custom queries, backlog views and background sources such as the DHP release register (Pedestal). Each is saved as soon as it is fetched (an empty Time Writing result never replaces saved data without asking). Nothing is written to Azure DevOps when fetching. Connections on a server with a PAT need no PAT of their own."
      action={<div className="button-row"><button type="button" className="ghost" onClick={() => { setFormError(''); setForm(empty(connectionProfiles.some((profile) => profile.role === 'time-tracking') ? 'reference' : 'time-tracking')) }}>＋ Add connection</button><button type="button" className="primary" disabled={!connectionProfiles.length || fetchingAll || busy} onClick={() => { setFetchingAll(true); void azure.fetchAll().finally(() => setFetchingAll(false)) }}>{fetchingAll ? 'Fetching all…' : 'Fetch all'}</button></div>}>
      {otherPresets.length > 0 && <div className="preset-list">{otherPresets.map((preset) => <div className="preset-row" key={preset.key}>
        <div><strong>{preset.viewName || preset.name}</strong><small>{preset.serverUrl ? `${preset.serverUrl.replace('https://', '')}/${preset.organization}` : `dev.azure.com/${preset.organization}`} · {preset.project}{preset.team ? ` · team ${preset.team}` : ''}</small></div>
        <Pill tone={presetHasPat(preset) ? 'info' : 'warning'}>{presetHasPat(preset) ? 'PAT on server' : 'Needs PAT'}</Pill>
        <div className="button-row nowrap"><button type="button" className="primary" onClick={() => setUpStream(preset)}>Set up</button><button type="button" className="text-button" onClick={() => { const next = [...dismissed, preset.key]; setDismissed(next); saveDismissedPresets(next) }}>Dismiss</button></div>
      </div>)}</div>}
      {extras.length > 0 && keep && <Notice tone="warning">{timeWriting.length} Time Writing (QMS-0025) connections: only “{keep.reason}” is used; {extras.map((profile) => `“${profile.reason}”`).join(', ')} {extras.length === 1 ? 'is a duplicate' : 'are duplicates'}. <button type="button" className="text-button" onClick={() => void removeDuplicates()}>Keep “{keep.reason}”, remove the other{extras.length === 1 ? '' : 's'}</button></Notice>}
      {keep && twins.map((profile) => <Notice key={profile.id} tone="warning">“{profile.reason}” reads the same backlog as the Time Writing connection “{keep.reason}”. If “{profile.reason}” loads and “{keep.reason}” does not, <button type="button" className="text-button" onClick={() => void switchTimeWriting(profile)}>use “{profile.reason}” as Time Writing and remove “{keep.reason}”</button>.</Notice>)}
      {cleanup && <Notice tone={cleanup.tone}>{cleanup.text}</Notice>}
      {others.length ? <div className="azure-table"><table className="connection-table"><thead><tr><th>Connection</th><th>Used for</th><th>Organization / project</th><th>Query</th><th>Status</th><th /></tr></thead><tbody>{others.map((profile) => {
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
        : otherPresets.length ? null : <EmptyState title="No other views." detail="Time Writing and the streams are in the Stream mapping above; add any other view here." />}
      {form && <Modal title={form.id ? `Edit “${connectionProfiles.find((profile) => profile.id === form.id)?.reason ?? form.name}”` : clonedFrom ? `Clone of “${clonedFrom}”` : 'New connection'} eyebrow={`AZURE DEVOPS · ${roleLabel[form.role].toUpperCase()}`} wide form onClose={() => { setForm(null); setFormError('') }}><form className="connection-editor" onSubmit={submit}>
        {clonedFrom ? <Notice>All settings and the PAT of “{clonedFrom}” are copied. Change the name and what differs (query, project, team, …), then Save and refresh data. “{clonedFrom}” itself is not changed.</Notice> : !form.id && form.organization && <Notice>Pre-filled settings: enter your PAT, change anything else if needed, then Save and Test.</Notice>}
        <div className="connection-form">
          <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. QMS-0025, Digital Platform, DHFI releases" /></label>
          <label>View name (optional)<input value={form.viewName} maxLength={80} onChange={(event) => setForm({ ...form, viewName: event.target.value })} placeholder={form.name.trim() || 'Same as the connection name'} /><small>Name in the Azure DevOps menu and on its tab, e.g. QMS-0025.</small></label>
          <label className="checkbox-label menu-toggle"><input type="checkbox" checked={form.showInMenu} onChange={(event) => setForm({ ...form, showInMenu: event.target.checked })} />Show in menu<small>Off: used only in the background (data, releases, documents), not listed as a view.</small></label>
          <label>Used for<select value={form.role} onChange={(event) => { const role = event.target.value as AzureConnectionRole; setForm({ ...form, role, showInMenu: defaultShowInMenu(role) }) }}>{(Object.keys(roleLabel) as AzureConnectionRole[]).map((role) => <option key={role} value={role}>{roleLabel[role]}</option>)}</select></label>
          <label>Server<select required value={formServerKey} onChange={(event) => { const server = servers.find((entry) => entry.key === event.target.value); if (server) setForm({ ...form, serverUrl: server.serverUrl, organization: server.organization }) }}><option value="" disabled>Choose a server…</option>{servers.map((server) => <option key={server.key} value={server.key}>{server.label}{server.hasPat ? '' : ' (no PAT yet)'}</option>)}</select><small>Only servers from Step 1, so the right PAT is used. A new server is added in Step 1 with its PAT.</small></label>
          <label>Project<input required list="server-projects" value={form.project} onChange={(event) => setForm({ ...form, project: event.target.value })} placeholder="Project name" /><datalist id="server-projects">{(servers.find((server) => server.key === formServerKey)?.projects ?? []).map((project) => <option key={project} value={project} />)}</datalist></label>
          {(form.role === 'time-tracking' || form.role === 'backlog-view') && <label>Team{form.query.trim() ? ' (optional with a query)' : ''}<input value={form.team} onChange={(event) => setForm({ ...form, team: event.target.value })} placeholder="Team whose Epic backlog is read" /></label>}
          <label>API version (optional)<input value={form.apiVersion} onChange={(event) => setForm({ ...form, apiVersion: event.target.value })} placeholder="Automatic" /><small>Leave empty to detect it: 7.1, then 6.0 and 5.0 for older Azure DevOps Server.</small></label>
          <label>PAT for this server<input type="password" autoComplete="off" required={!formServerPat && (form.id ? !loadAzureConnectionProfile(form.id)?.token : !(form.cloneOf && loadAzureConnectionProfile(form.cloneOf)?.token))} value={form.pat} onChange={(event) => setForm({ ...form, pat: event.target.value })} placeholder={form.role === 'time-tracking' ? 'Work Items (Read & Write)' : 'Work Items (Read)'} /><small>{formServerPat ? 'Leave empty: the saved server PAT is used. ' : form.id ? 'Leave empty to keep the saved one. ' : clonedFrom ? `Leave empty to use the PAT of “${clonedFrom}”. ` : ''}One PAT per server: it is used by every connection on the same server.</small></label>
          {form.role === 'time-tracking' && <label>Your work email (required)<input type="email" required autoComplete="email" value={form.creatorEmail} onChange={(event) => setForm({ ...form, creatorEmail: event.target.value })} placeholder="name@company.com" /><small>As Azure DevOps shows it for you: finds your work (Assigned to me) and is assigned to the Features you create.</small></label>}
          <label className="query-field">Query (optional, WIQL)<textarea rows={4} spellCheck={false} value={form.query} onChange={(event) => setForm({ ...form, query: event.target.value })} placeholder={queryPlaceholder[form.role]} /><small>A flat query: SELECT … FROM WorkItems WHERE …. Only the WHERE clause is used; results are read in pages. {form.role === 'time-tracking' || form.role === 'backlog-view' ? '' : 'Empty uses the default shown.'}</small></label>
        </div>
        <Notice>{roleUse[form.role]}</Notice>
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="button-row"><button className="primary">Save and refresh data</button><button type="button" className="ghost" onClick={() => { setForm(null); setFormError('') }}>Cancel</button></div>
      </form></Modal>}
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
