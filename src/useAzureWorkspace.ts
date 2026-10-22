import { useRef, useState } from 'react'
import { fetchAzureWorkItems, isCloudBase, mapAzureWorkItem, mergeAzureWorkItems, parseAzureProjectUrl, readFieldNames, savedBacklogItems, sameAzureScope, updateAzureTimeWritingEffort, type AzureFetchResult, type AzureConfig } from './azureDevOps'
import type { PageProps } from './pages/types'
import type { AzureWorkItem } from './domain'
import { loadAzurePat, saveAzurePat, forgetAzurePat, listAzureConnectionProfiles, loadAzureConnectionProfile, saveAzureConnectionProfile, forgetAzureConnectionProfile, composeAzureUrl, collectionUrlFrom, type AzureConnectionProfile, type AzureConnectionProfileSummary, type AzureConnectionRole } from './azureCredentials'
import { approvalDateFrom, defaultReleaseQuery, fetchReleaseSource, normalizeReleaseSourceSettings, projectQuery, releaseQueryWhere, runWorkItemQuery, withAncestors } from './releaseSource'
import { sampleDataset, sampleProfiles, sampleReleaseScopes } from './sampleData'
import { indiaMonth } from './azureInsights'
import { columnName, pickFields, queryLayout } from './queryView'
import { promoteToTimeWriting } from './viewDefinitions'

const defaultUrl = 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics'
const defaultConfig = parseAzureProjectUrl(defaultUrl)
// A saved connection as an Azure config: its project URL read against its own base URL (cloud or on-prem collection).
export function connectionConfig(profile: Pick<AzureConnectionProfile, 'url' | 'baseUrl' | 'apiVersion'>): AzureConfig {
  return { ...parseAzureProjectUrl(profile.url, profile.baseUrl), ...(profile.apiVersion ? { apiVersion: profile.apiVersion } : {}) }
}

// Query views keep the query's selected columns (named as Azure DevOps names them) and its sort order.
// Columns of a query view: the query's SELECT list resolved against the project's field list (display names for
// headings), its ORDER BY, and any SELECT entries that are not fields of this project.
async function viewLayout(config: AzureConfig, pat: string, query: string) {
  const names = await readFieldNames(config, pat)
  const { columns, orderBy, unresolved } = queryLayout(query, names)
  return { columns: columns.map((ref) => ({ ref, name: columnName(ref, names) })), orderBy, ...(unresolved.length ? { unresolved } : {}) }
}
const withQueryFields = (config: AzureConfig, refs: string[]) =>
  (item: { id: number; fields: Record<string, unknown>; relations?: { rel: string; url: string }[] }) => { const mapped = { ...mapAzureWorkItem(item, config), fields: pickFields(item.fields, refs) }; const approvalDate = approvalDateFrom(item.fields); return approvalDate ? { ...mapped, approvalDate } : mapped }
const refsOf = (layout: { columns: { ref: string }[] }) => layout.columns.map((column) => column.ref)

export interface ConnectionStatus { state: 'busy' | 'ok' | 'error'; message: string; at?: string }
// cloneOf: the connection this one was cloned from; its saved PAT is used when no new PAT is entered.
export interface ConnectionInput { id?: string; cloneOf?: string; name: string; viewName: string; showInMenu: boolean; role: AzureConnectionRole; serverUrl: string; organization: string; project: string; team: string; pat: string; query: string; creatorEmail: string; apiVersion: string }

// Kept at the app level so navigation between connection settings and Board preserves a fetched preview.
// onFetched: told about every saved read-only fetch (the app saves on-prem ones to Git from the desktop app).
export type FetchListener = (profile: AzureConnectionProfileSummary, source: NonNullable<PageProps['store']['state']['azureSources']>[number]) => void
// gitData: a view's data saved to Git (on-prem views, Git storage connected): Load from Git, and the fallback when a
// fetch fails or this browser has no PAT. load returns what it did, or null when Git has nothing for the view.
export interface GitDataSource { available: (id: string) => boolean; load: (id: string) => Promise<string | null> }
export function useAzureWorkspace(store: PageProps['store'], onFetched?: { current: FetchListener | undefined }, gitData?: { current: GitDataSource | undefined }) {
  const [projectUrl, setProjectUrl] = useState(defaultUrl)
  const [team, setTeam] = useState('InD Quality')
  const [connectionProfiles, setConnectionProfiles] = useState<AzureConnectionProfileSummary[]>(() => listAzureConnectionProfiles())
  const [activeConnectionProfileId, setActiveConnectionProfileId] = useState(() => listAzureConnectionProfiles()[0]?.id ?? '')
  const [pat, setPat] = useState(() => { const first = listAzureConnectionProfiles()[0]?.id; return first ? loadAzureConnectionProfile(first)?.token ?? '' : loadAzurePat(defaultConfig) })
  const [creatorEmail, setCreatorEmail] = useState(() => { const first = listAzureConnectionProfiles()[0]?.id; return first ? loadAzureConnectionProfile(first)?.creatorEmail ?? '' : '' })
  const [role, setRole] = useState<AzureConnectionRole>(() => listAzureConnectionProfiles()[0]?.role ?? 'time-tracking')
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatus>>({})
  const [server, setServer] = useState<Pick<AzureConfig, 'baseUrl' | 'apiVersion'>>(() => { const first = listAzureConnectionProfiles()[0]; return first ? { baseUrl: first.baseUrl, apiVersion: first.apiVersion } : {} })
  const [busy, setBusy] = useState(false)
  const fetching = useRef(false)
  const [lastRefreshed, setLastRefreshed] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<AzureFetchResult | null>(null)
  let config: AzureConfig | null
  try { const parsed = connectionConfig({ url: projectUrl, ...server }); config = { ...parsed, team: parsed.team || team.trim() } } catch { config = null }
  const saved = savedBacklogItems(store.state.azureWorkItems ?? [], store.state.azureBacklogScope, config)
  const items = preview && sameAzureScope(preview.scope, config) ? preview.items : saved
  const needsScopedRefresh = Boolean((store.state.azureWorkItems?.length ?? 0) && !sameAzureScope(store.state.azureBacklogScope, config))
  const isSample = Boolean(!preview && store.state.azureBacklogScope?.sample && sameAzureScope(store.state.azureBacklogScope, config))

  // Synthetic dataset for demonstrations: replaces the Azure cache and the release source; never touches Azure DevOps.
  function loadSampleData() {
    if (!config) { setError('Enter a valid Azure DevOps project URL first.'); return }
    const sampleMonth = indiaMonth(new Date().toISOString())!
    const sample = sampleDataset(config, sampleMonth)
    setPreview(null); setLastRefreshed('')
    store.update((draft) => {
      draft.azureWorkItems = sample.items; draft.azureBacklogScope = { ...sample.scope, sample: true }; draft.releaseSource = sample.releaseSource
      draft.releasePlans = [...(draft.releasePlans ?? []).filter((plan) => !plan.sample), ...sample.releasePlans]
      // Sample team structure fills only people who have no profile yet, so real mappings are never overwritten.
      draft.resourceProfiles = { ...sampleProfiles, ...(draft.resourceProfiles ?? {}) }
      // Sample release scopes are added only for releases that have none yet.
      draft.releaseScopes = [...(draft.releaseScopes ?? []), ...sampleReleaseScopes(sampleMonth).filter((scope) => !(draft.releaseScopes ?? []).some((existing) => existing.release === scope.release))]
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: sample.scope.fetchedAt, actor: 'u-owner', action: 'Load sample', entity: 'AzureDevOps', entityId: 'sample', detail: `${sample.items.length} synthetic work items and ${sample.releaseSource.items.length} sample release documents loaded. Nothing was read from or written to Azure DevOps.` })
      return draft
    })
    setMessage(`Synthetic sample dataset loaded: ${sample.items.length} work items and ${sample.releaseSource.items.length} release documents. Refresh from Azure replaces it with real data.`); setError('')
  }

  function changeProjectUrl(next: string) {
    setProjectUrl(next); setPreview(null); setServer({})
    try { const parsed = parseAzureProjectUrl(next); if (parsed.team) setTeam(parsed.team); setActiveConnectionProfileId(''); setPat(loadAzurePat(parsed)) } catch { setPat(''); setActiveConnectionProfileId('') }
  }

  async function fetchPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await refresh()
  }

  async function refresh() {
    if (activeConnectionProfileId && connectionProfiles.some((profile) => profile.id === activeConnectionProfileId && profile.role === 'time-tracking')) { await fetchConnection(activeConnectionProfileId); return }
    if (fetching.current) return
    fetching.current = true; setError(''); setMessage(''); setBusy(true)
    try {
      const parsed = connectionConfig({ url: projectUrl, ...server })
      let tokenWarning = ''
      try {
        const reason = connectionProfiles.find((profile) => profile.id === activeConnectionProfileId)?.reason
        if (activeConnectionProfileId && reason) saveAzureConnectionProfile({ ...loadAzureConnectionProfile(activeConnectionProfileId), id: activeConnectionProfileId, url: projectUrl, reason, creatorEmail, role, token: pat, ...server })
        else saveAzurePat(parsed, pat)
      } catch { tokenWarning = ' PAT could not be saved in this browser; the current-session token was used for fetching.' }
      const result = await fetchAzureWorkItems({ ...parsed, team: parsed.team || team.trim() }, pat)
      const kept = autoSave(result)
      setLastRefreshed(new Date().toISOString())
      setMessage(`${kept || `${result.items.length} work items fetched from ${result.scope.team}'s Epic backlog and saved.`}${tokenWarning}`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to fetch Azure DevOps data.') }
    finally { fetching.current = false; setBusy(false) }
  }

  function rememberPat(value = pat) {
    if (!config) { setError('Enter a valid Azure DevOps project URL first.'); return }
    setPat(value.trim()); setError('')
    try {
      const reason = connectionProfiles.find((profile) => profile.id === activeConnectionProfileId)?.reason
      if (activeConnectionProfileId && reason) saveAzureConnectionProfile({ ...loadAzureConnectionProfile(activeConnectionProfileId), id: activeConnectionProfileId, url: projectUrl, reason, creatorEmail, role, token: value, ...server })
      else saveAzurePat(config, value)
      setMessage(activeConnectionProfileId ? `Azure DevOps configuration “${reason}” updated on this browser.` : 'PAT saved on this browser for this organization and project.')
    }
    catch { setMessage('PAT is available for this session but could not be saved in browser settings. Fetching is still available; do not clear browser data.') }
  }

  function forgetPat() {
    if (config) forgetAzurePat(config)
    setPat(''); setMessage('Saved PAT removed from this browser. The token itself has not been revoked in Azure DevOps.'); setError('')
  }

  function selectConnectionProfile(id: string) {
    const profile = id ? loadAzureConnectionProfile(id) : null
    if (!profile) { setActiveConnectionProfileId(''); setError(''); return }
    setProjectUrl(profile.url); setPreview(null); setActiveConnectionProfileId(id); setPat(profile.token); setCreatorEmail(profile.creatorEmail?.trim() ?? ''); setRole(profile.role ?? 'time-tracking'); setError('')
    setServer({ baseUrl: profile.baseUrl, apiVersion: profile.apiVersion })
    try { setTeam(connectionConfig(profile).team) } catch { /* saved profile validation already prevents this */ }
  }

  function saveConnectionProfile(reason: string, email = creatorEmail, value = pat, nextRole: AzureConnectionRole = role) {
    connectionConfig({ url: projectUrl, ...server })
    const cleanReason = reason.trim()
    if (!cleanReason) throw new Error('Enter a reason for this Azure DevOps configuration.')
    const cleanEmail = email.trim().toLowerCase()
    if (nextRole === 'time-tracking' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Enter the Azure DevOps email that should be assigned to newly created Features.')
    const id = activeConnectionProfileId || crypto.randomUUID().replaceAll('-', '')
    saveAzureConnectionProfile({ ...(activeConnectionProfileId ? loadAzureConnectionProfile(activeConnectionProfileId) : {}), id, url: projectUrl, reason: cleanReason, creatorEmail: cleanEmail, role: nextRole, token: value, ...server })
    const profiles = listAzureConnectionProfiles()
    setConnectionProfiles(profiles); setActiveConnectionProfileId(id); setPat(value.trim()); setCreatorEmail(cleanEmail); setRole(nextRole)
    setMessage(`Azure DevOps configuration “${cleanReason}” saved on this browser.`); setError('')
  }

  function forgetConnectionProfile() {
    if (activeConnectionProfileId) removeConnection(activeConnectionProfileId)
  }

  function featureCreated(incoming: AzureWorkItem[]) {
    setPreview((current) => {
      if (!current) return current
      const items = mergeAzureWorkItems(current.items, incoming)
      return { ...current, items, scope: { ...current.scope, itemKeys: items.map((item) => item.key) } }
    })
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems(draft.azureWorkItems ?? [], incoming)
      if (draft.azureBacklogScope && sameAzureScope(draft.azureBacklogScope, config)) draft.azureBacklogScope.itemKeys = [...new Set([...draft.azureBacklogScope.itemKeys, ...incoming.map((item) => item.key)])]
      const feature = incoming.find((item) => item.workItemType === 'Feature')
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Save verified hierarchy', entity: 'AzureDevOps Feature', entityId: String(feature?.id ?? ''), detail: `${incoming.length} verified source records saved for Feature #${feature?.id ?? 'unknown'}. Check the operation result for completion status.` })
      return draft
    })
  }

  // Merges work items that were changed or created in Azure (and verified) into the preview and the saved cache.
  function applyWorkItems(incoming: AzureWorkItem[], action: string, detail: string) {
    if (!incoming.length) return
    setPreview((current) => current ? { ...current, items: mergeAzureWorkItems(current.items, incoming), scope: { ...current.scope, itemKeys: [...new Set([...current.scope.itemKeys, ...incoming.map((item) => item.key)])] } } : current)
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems(draft.azureWorkItems ?? [], incoming)
      if (draft.azureBacklogScope && sameAzureScope(draft.azureBacklogScope, config)) draft.azureBacklogScope.itemKeys = [...new Set([...draft.azureBacklogScope.itemKeys, ...incoming.map((item) => item.key)])]
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action, entity: 'AzureDevOps work item', entityId: incoming.map((item) => `#${item.id}`).join(', ').slice(0, 200), detail })
      return draft
    })
  }

  async function saveTimeWritingEffort(workItemId: number, planHours: number | undefined, actualHours: number | undefined, markAdhoc = false) {
    if (!config) throw new Error('Configure a valid Azure DevOps project first.')
    const updated = await updateAzureTimeWritingEffort(config, pat, workItemId, planHours, actualHours, markAdhoc)
    setPreview((current) => current ? { ...current, items: mergeAzureWorkItems(current.items, [updated]), scope: { ...current.scope, itemKeys: [...new Set([...current.scope.itemKeys, updated.key])] } } : current)
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems(draft.azureWorkItems ?? [], [updated])
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update Azure effort', entity: 'AzureDevOps Time Writing Task', entityId: String(updated.id), detail: `Updated Original Estimate to ${planHours ?? 'unchanged'}h and Completed Work to ${actualHours ?? 'unchanged'}h on Azure DevOps Task #${updated.id}${markAdhoc ? '; tagged ad-hoc' : ''}.` })
      return draft
    })
    setMessage(`Azure DevOps Task #${updated.id} saved and verified.`); setError('')
    return updated
  }

  // Connection sets: base URL + project (+ team), PAT, optional query and what the data is used for.
  function saveConnection(input: ConnectionInput) {
    const name = input.name.trim()
    if (!name) throw new Error('Give the connection a name, e.g. "Time Writing" or "DHFI releases".')
    const base = collectionUrlFrom(input.serverUrl, input.organization), apiVersion = input.apiVersion.trim()
    const url = composeAzureUrl(base, input.project, input.team)
    if (apiVersion && !/^\d{1,2}\.\d(-preview(\.\d)?)?$/.test(apiVersion)) throw new Error('API version looks like 7.1, 6.0 or 5.0.')
    const existing = input.id ? loadAzureConnectionProfile(input.id) : input.cloneOf ? loadAzureConnectionProfile(input.cloneOf) : null
    const token = input.pat.trim() || existing?.token || ''
    if (!token) throw new Error('Enter the PAT for this connection.')
    const query = input.query.trim()
    if (query) releaseQueryWhere(query)
    if (input.role === 'time-tracking' && !input.team.trim() && !query) throw new Error('A Time Writing connection needs a team (its Epic backlog is read) or a query.')
    if (input.role === 'backlog-view' && !input.team.trim() && !query) throw new Error('A backlog view needs a team (its Epic backlog is shown) or a query.')
    const email = input.creatorEmail.trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid Feature creator email, or leave it empty.')
    const id = input.id || crypto.randomUUID().replaceAll('-', '')
    saveAzureConnectionProfile({ id, url, reason: name, role: input.role, ...(input.viewName.trim() ? { viewName: input.viewName.trim() } : {}), showInMenu: input.showInMenu, token, ...(email ? { creatorEmail: email } : {}), ...(query ? { query } : {}), ...(isCloudBase(base) ? {} : { baseUrl: base }), ...(apiVersion ? { apiVersion } : {}) })
    const profiles = listAzureConnectionProfiles()
    setConnectionProfiles(profiles)
    if (input.role === 'time-tracking' && (id === activeConnectionProfileId || !profiles.some((profile) => profile.id === activeConnectionProfileId && profile.role === 'time-tracking'))) selectConnectionProfile(id)
    setMessage(`Connection “${name}” saved in this browser.`); setError('')
    return id
  }

  function removeConnection(id: string) {
    const name = connectionProfiles.find((profile) => profile.id === id)?.reason ?? 'Connection'
    forgetAzureConnectionProfile(id)
    const profiles = listAzureConnectionProfiles()
    setConnectionProfiles(profiles)
    if (id === activeConnectionProfileId) { const next = profiles.find((profile) => profile.role === 'time-tracking'); if (next) selectConnectionProfile(next.id); else { setActiveConnectionProfileId(''); setPat('') } }
    store.update((draft) => { if (draft.azureSources?.some((source) => source.connectionId === id)) draft.azureSources = draft.azureSources.filter((source) => source.connectionId !== id); return draft })
    setMessage(`${name} removed from this browser. Its PAT was not revoked in Azure DevOps.`); setError('')
  }

  // Fetches one connection read-only. Time Writing goes to the preview (review, then save); the release source,
  // document and reference connections are stored with the app data straight away. Nothing is written to Azure.
  // Only one Time Writing fetch runs at a time: a second request (↻, Fetch, Fetch all, the fetch at start, Use as Time
  // Writing) joins the one already running and gets its result, instead of failing.
  const timeWritingRun = useRef<Promise<boolean> | null>(null)
  function fetchConnection(id: string): Promise<boolean> {
    if ((loadAzureConnectionProfile(id)?.role ?? 'time-tracking') !== 'time-tracking') return fetchConnectionNow(id)
    if (timeWritingRun.current) return timeWritingRun.current
    const run = fetchConnectionNow(id).finally(() => { if (timeWritingRun.current === run) timeWritingRun.current = null })
    timeWritingRun.current = run
    return run
  }
  async function fetchConnectionNow(id: string): Promise<boolean> {
    const profile = loadAzureConnectionProfile(id)
    const summary = connectionProfiles.find((entry) => entry.id === id)
    if (!profile) { setConnectionStatus((current) => ({ ...current, [id]: { state: 'error', message: 'Saved connection not found in this browser.' } })); return false }
    const role = profile.role ?? 'time-tracking'
    if (!profile.token.trim()) {
      if (await fallBackToGit(id, 'No PAT in this browser')) return false
      setConnectionStatus((current) => ({ ...current, [id]: { state: 'error', message: 'No PAT in this browser: this view shows the data the desktop app saved to Git. Add the PAT in Settings to fetch here.' } })); return false
    }
    setConnectionStatus((current) => ({ ...current, [id]: { state: 'busy', message: 'Fetching…' } }))
    try {
      const parsed = connectionConfig(profile)
      const query = profile.query?.trim() ?? ''
      let done = ''
      const notify = (source: Parameters<FetchListener>[1]) => { const listed = listAzureConnectionProfiles().find((entry) => entry.id === id); if (listed) onFetched?.current?.(listed, source) }
      if (role === 'time-tracking') {
        fetching.current = true; setBusy(true)
        try {
          selectConnectionProfile(id)
          let result: AzureFetchResult
          if (query) {
            const items = (await withAncestors(parsed, profile.token, await runWorkItemQuery(parsed, profile.token, query))).filter((item) => item.state.trim().toLowerCase() !== 'removed')
            const asOf = new Date().toISOString(), areaPaths = [...new Set(items.map((item) => item.areaPath))].sort()
            result = { items, areaPaths, asOf, scope: { organization: parsed.organization, project: parsed.project, team: parsed.team, itemKeys: items.map((item) => item.key), areaPaths, fetchedAt: asOf } }
          } else result = await fetchAzureWorkItems(parsed, profile.token)
          const kept = autoSave(result); setLastRefreshed(new Date().toISOString())
          done = kept || `${result.items.length} work items fetched and saved`
        } finally { fetching.current = false; setBusy(false) }
      } else if (role === 'release-source') {
        const layout = await viewLayout(parsed, profile.token, query || defaultReleaseQuery)
        const fetched = await fetchReleaseSource(parsed, profile.token, query || defaultReleaseQuery, undefined, normalizeReleaseSourceSettings(store.state.releaseSourceSettings), refsOf(layout))
        const snapshot = { ...fetched, ...layout }
        // Each release source keeps its own snapshot; the old shared one is dropped so it is never shown for another view.
        const entry = { connectionId: id, name: profile.reason, role: 'release-source' as const, ...snapshot }
        store.update((draft) => {
          draft.azureSources = [...(draft.azureSources ?? []).filter((source) => source.connectionId !== id), entry]
          delete draft.releaseSource
          draft.audits.unshift({ id: crypto.randomUUID(), timestamp: snapshot.fetchedAt, actor: 'u-owner', action: 'Sync', entity: 'ReleaseSource', entityId: `${parsed.organization}/${parsed.project}`, detail: `${snapshot.items.length} release documents fetched read-only from “${profile.reason}”` })
          return draft
        })
        done = `${snapshot.items.length} release documents saved`
        notify(entry)
      } else if (role === 'backlog-view') {
        // Read-only backlog view: the query's results with its selected columns, or the team's Epic backlog.
        const layout = await viewLayout(parsed, profile.token, query)
        const items = query ? await runWorkItemQuery(parsed, profile.token, query, undefined, withQueryFields(parsed, refsOf(layout))) : (await fetchAzureWorkItems(parsed, profile.token)).items
        const fetchedAt = new Date().toISOString()
        const entry = { connectionId: id, name: profile.reason, role, organization: parsed.organization, project: parsed.project, query: query || `Team backlog: ${parsed.team}`, fetchedAt, items, ...layout }
        store.update((draft) => {
          draft.azureSources = [...(draft.azureSources ?? []).filter((source) => source.connectionId !== id), entry]
          draft.audits.unshift({ id: crypto.randomUUID(), timestamp: fetchedAt, actor: 'u-owner', action: 'Sync', entity: 'AzureSource', entityId: `${parsed.organization}/${parsed.project}`, detail: `${items.length} work items fetched read-only for backlog view “${profile.reason}”` })
          return draft
        })
        done = `${items.length} work items saved`
        notify(entry)
      } else {
        const layout = await viewLayout(parsed, profile.token, query || projectQuery)
        const items = await runWorkItemQuery(parsed, profile.token, query || projectQuery, undefined, withQueryFields(parsed, refsOf(layout)))
        const fetchedAt = new Date().toISOString()
        const entry = { connectionId: id, name: profile.reason, role: role === 'documents' ? 'documents' as const : 'reference' as const, organization: parsed.organization, project: parsed.project, query: query || projectQuery, fetchedAt, items, ...layout }
        store.update((draft) => {
          draft.azureSources = [...(draft.azureSources ?? []).filter((source) => source.connectionId !== id), entry]
          draft.audits.unshift({ id: crypto.randomUUID(), timestamp: fetchedAt, actor: 'u-owner', action: 'Sync', entity: 'AzureSource', entityId: `${parsed.organization}/${parsed.project}`, detail: `${items.length} work items fetched read-only from “${profile.reason}”` })
          return draft
        })
        done = `${items.length} work items saved`
        notify(entry)
      }
      setConnectionStatus((current) => ({ ...current, [id]: { state: 'ok', message: done, at: new Date().toISOString() } }))
      return true
    } catch (failure) {
      const text = failure instanceof Error ? failure.message : 'Unable to fetch this connection.'
      if (await fallBackToGit(id, `Fetch failed (${text})`)) return false
      setConnectionStatus((current) => ({ ...current, [id]: { state: 'error', message: text } }))
      setError(`${summary?.reason ?? profile.reason}: ${text}`)
      return false
    }
  }

  // Load from Git: the view's data saved to Git by the desktop app. Also the fallback when a fetch cannot run.
  async function loadFromGit(id: string, reason = '') {
    const source = gitData?.current
    if (!source?.available(id)) { setConnectionStatus((current) => ({ ...current, [id]: { state: 'error', message: 'Load from Git needs Git storage connected (Settings → Storage) and an on-prem view.' } })); return false }
    setConnectionStatus((current) => ({ ...current, [id]: { state: 'busy', message: 'Loading from Git…' } }))
    try {
      const done = await source.load(id)
      if (!done) { setConnectionStatus((current) => ({ ...current, [id]: { state: 'error', message: `${reason ? `${reason}; ` : ''}Git has no saved data for this view yet (the desktop app saves it at each fetch).` } })); return false }
      setConnectionStatus((current) => ({ ...current, [id]: { state: 'ok', message: `${reason ? `${reason}; ` : ''}${done}`, at: new Date().toISOString() } }))
      return true
    } catch (failure) {
      setConnectionStatus((current) => ({ ...current, [id]: { state: 'error', message: `${reason ? `${reason}; ` : ''}Load from Git failed: ${failure instanceof Error ? failure.message : String(failure)}` } }))
      return false
    }
  }
  const fallBackToGit = (id: string, reason: string) => gitData?.current?.available(id) ? loadFromGit(id, reason) : Promise.resolve(false)
  const canLoadFromGit = (id: string) => Boolean(gitData?.current?.available(id))

  // Checks address, collection, project, PAT and API version with an empty query; reads nothing, writes nothing.
  async function testConnection(id: string) {
    const profile = loadAzureConnectionProfile(id)
    if (!profile) return
    setConnectionStatus((current) => ({ ...current, [id]: { state: 'busy', message: 'Testing…' } }))
    try {
      const config = connectionConfig(profile)
      await runWorkItemQuery(config, profile.token, 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Id] < 1')
      setConnectionStatus((current) => ({ ...current, [id]: { state: 'ok', message: `Connection works: ${config.project} is reachable with this PAT.`, at: new Date().toISOString() } }))
    } catch (failure) {
      setConnectionStatus((current) => ({ ...current, [id]: { state: 'error', message: failure instanceof Error ? failure.message : 'Connection test failed.' } }))
    }
  }

  // The Time Writing connection in use: the active one while it exists, else the first.
  const activeTimeWriting = () => connectionProfiles.find((entry) => entry.id === activeConnectionProfileId && entry.role === 'time-tracking')?.id ?? connectionProfiles.find((entry) => entry.role === 'time-tracking')?.id

  // Fetches the active Time Writing connection and every read-only connection, one after another.
  async function fetchAll() {
    setError(''); setMessage('')
    const targets = connectionProfiles.filter((profile) => profile.role !== 'time-tracking' || profile.id === activeTimeWriting())
    let ok = 0
    for (const profile of targets) if (await fetchConnection(profile.id)) ok += 1
    setMessage(`${ok} of ${targets.length} connection${targets.length === 1 ? '' : 's'} fetched and saved.`)
  }

  // At start: the cloud (Azure DevOps Services) connections of fetchAll that have a PAT here are fetched again, so the
  // app opens on current data. On-prem connections are left to their own Fetch (VPN) or the data in Git.
  async function fetchCloud() {
    const timeWriting = activeTimeWriting()
    const cloud = (baseUrl?: string) => { try { return !baseUrl || isCloudBase(baseUrl) } catch { return false } }
    const targets = connectionProfiles.filter((profile) => (profile.role !== 'time-tracking' || profile.id === timeWriting) && cloud(profile.baseUrl) && loadAzureConnectionProfile(profile.id)?.token?.trim())
    for (const profile of targets) await fetchConnection(profile.id)
    return targets.length
  }

  // Writes a fetched Time Writing result to the app cache, replacing the previous Azure cache for that scope.
  function storeFetched(result: AzureFetchResult, how: string) {
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems([], result.items)
      draft.azureBacklogScope = structuredClone(result.scope)
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Sync', entity: 'AzureDevOps', entityId: 'work-items', detail: `${how}: replaced Azure cache with ${result.items.length} records from ${result.scope.team || result.scope.project}. Other app data and Azure source records were not changed.` })
      return draft
    })
    setPreview(null)
  }

  // Refreshed data is saved straight away. Only an empty result never replaces saved work items silently: it is
  // shown as a preview to save or discard, so a wrong team or query cannot wipe the cache.
  function autoSave(result: AzureFetchResult) {
    if (!result.items.length && (store.state.azureWorkItems?.length ?? 0)) {
      setPreview(result)
      return 'Azure returned no work items, so the saved data was kept. Check the team or query; save the empty preview only if that is expected.'
    }
    storeFetched(result, 'Refresh (saved automatically)')
    return ''
  }

  function savePreview() {
    if (!preview) return
    if (!sameAzureScope(preview.scope, config)) { setError('The source changed after fetching. Refresh the selected backlog before saving.'); return }
    storeFetched(preview, 'Saved preview')
    setMessage(`${preview.items.length} team-backlog records saved. Old out-of-scope cached records were replaced; Azure DevOps and demand-planning data were not modified.`)
  }

  // After the connections changed outside this hook (Git sync): the active Time Writing connection is kept if it still
  // exists, else the first Time Writing connection becomes active.
  function reloadConnectionProfiles() {
    const profiles = listAzureConnectionProfiles()
    setConnectionProfiles(profiles)
    if (!profiles.some((profile) => profile.id === activeConnectionProfileId && profile.role === 'time-tracking')) { const next = profiles.find((profile) => profile.role === 'time-tracking'); if (next) selectConnectionProfile(next.id) }
  }

  // Makes a connection (e.g. a backlog view of the same project that loads) the only Time Writing connection; the
  // replaced ones are removed here. Its separate view data is dropped: it is fetched as Time Writing from now on.
  function makeTimeWriting(id: string) {
    const replaced = promoteToTimeWriting(id)
    store.update((draft) => { draft.azureSources = (draft.azureSources ?? []).filter((source) => source.connectionId !== id && !replaced.some((entry) => entry.id === source.connectionId)); return draft })
    setConnectionProfiles(listAzureConnectionProfiles()); selectConnectionProfile(id)
    return replaced
  }

  return { reloadConnectionProfiles, makeTimeWriting, projectUrl, changeProjectUrl, team, setTeam, pat, setPat, creatorEmail, setCreatorEmail, role, setRole, connectionStatus, saveConnection, removeConnection, fetchConnection, loadFromGit: (id: string) => loadFromGit(id), canLoadFromGit, fetchAll, fetchCloud, testConnection, applyWorkItems, isSample, loadSampleData, connectionProfiles, activeConnectionProfileId, selectConnectionProfile, saveConnectionProfile, forgetConnectionProfile, busy, error, setError, message, setMessage, preview, setPreview, saved, items, config, needsScopedRefresh, fetchPreview, refresh, lastRefreshed, rememberPat, forgetPat, featureCreated, savePreview, saveTimeWritingEffort }
}

export type AzureWorkspace = ReturnType<typeof useAzureWorkspace>
