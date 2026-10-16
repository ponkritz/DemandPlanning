import { useRef, useState } from 'react'
import { fetchAzureWorkItems, mergeAzureWorkItems, parseAzureProjectUrl, savedBacklogItems, sameAzureScope, updateAzureTimeWritingEffort, type AzureFetchResult, type AzureConfig } from './azureDevOps'
import type { PageProps } from './pages/types'
import type { AzureWorkItem } from './domain'
import { loadAzurePat, saveAzurePat, forgetAzurePat, listAzurePatProfiles, loadAzurePatProfile, saveAzurePatProfile, forgetAzurePatProfile, type AzurePatProfileSummary } from './azureCredentials'

const defaultUrl = 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics'
const defaultConfig = parseAzureProjectUrl(defaultUrl)

// Kept at the app level so navigation between connection settings and Board preserves a fetched preview.
export function useAzureWorkspace(store: PageProps['store']) {
  const [projectUrl, setProjectUrl] = useState(defaultUrl)
  const [team, setTeam] = useState('InD Quality')
  const [patProfiles, setPatProfiles] = useState<AzurePatProfileSummary[]>(() => listAzurePatProfiles(defaultConfig))
  const [activePatProfileId, setActivePatProfileId] = useState(() => listAzurePatProfiles(defaultConfig)[0]?.id ?? '')
  const [pat, setPat] = useState(() => { const first = listAzurePatProfiles(defaultConfig)[0]?.id; return first ? loadAzurePatProfile(defaultConfig, first) : loadAzurePat(defaultConfig) })
  const [busy, setBusy] = useState(false)
  const fetching = useRef(false)
  const [lastRefreshed, setLastRefreshed] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<AzureFetchResult | null>(null)
  let config: AzureConfig | null
  try { const parsed = parseAzureProjectUrl(projectUrl); config = { ...parsed, team: parsed.team || team.trim() } } catch { config = null }
  const saved = savedBacklogItems(store.state.azureWorkItems ?? [], store.state.azureBacklogScope, config)
  const items = preview && sameAzureScope(preview.scope, config) ? preview.items : saved
  const needsScopedRefresh = Boolean((store.state.azureWorkItems?.length ?? 0) && !sameAzureScope(store.state.azureBacklogScope, config))

  function changeProjectUrl(next: string) {
    setProjectUrl(next); setPreview(null)
    try { const parsed = parseAzureProjectUrl(next); if (parsed.team) setTeam(parsed.team); const profiles = listAzurePatProfiles(parsed); setPatProfiles(profiles); const selected = profiles[0]?.id ?? ''; setActivePatProfileId(selected); setPat(selected ? loadAzurePatProfile(parsed, selected) : loadAzurePat(parsed)) } catch { setPat(''); setPatProfiles([]); setActivePatProfileId('') }
  }

  async function fetchPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await refresh()
  }

  async function refresh() {
    if (fetching.current) return
    fetching.current = true; setError(''); setMessage(''); setBusy(true)
    try {
      const parsed = parseAzureProjectUrl(projectUrl)
      let tokenWarning = ''
      try {
        const purpose = patProfiles.find((profile) => profile.id === activePatProfileId)?.purpose
        if (activePatProfileId && purpose) saveAzurePatProfile(parsed, { id: activePatProfileId, purpose, token: pat })
        else saveAzurePat(parsed, pat)
      } catch { tokenWarning = ' PAT could not be saved in this browser; the current-session token was used for fetching.' }
      const result = await fetchAzureWorkItems({ ...parsed, team: parsed.team || team.trim() }, pat)
      setPreview(result)
      setLastRefreshed(new Date().toISOString())
      setMessage(`${result.items.length} work items fetched from ${result.scope.team}'s Epic backlog only. Saving replaces the previous Azure cache with this scope.${tokenWarning}`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to fetch Azure DevOps data.') }
    finally { fetching.current = false; setBusy(false) }
  }

  function rememberPat(value = pat) {
    if (!config) { setError('Enter a valid Azure DevOps project URL first.'); return }
    setPat(value.trim()); setError('')
    try {
      const purpose = patProfiles.find((profile) => profile.id === activePatProfileId)?.purpose
      if (activePatProfileId && purpose) saveAzurePatProfile(config, { id: activePatProfileId, purpose, token: value })
      else saveAzurePat(config, value)
      setMessage(activePatProfileId ? `PAT profile “${purpose}” updated on this browser.` : 'PAT saved on this browser for this organization and project.')
    }
    catch { setMessage('PAT is available for this session but could not be saved in browser settings. Fetching is still available; do not clear browser data.') }
  }

  function forgetPat() {
    if (config) forgetAzurePat(config)
    setPat(''); setMessage('Saved PAT removed from this browser. The token itself has not been revoked in Azure DevOps.'); setError('')
  }

  function selectPatProfile(id: string) {
    if (!config) return
    setActivePatProfileId(id); setPat(id ? loadAzurePatProfile(config, id) : loadAzurePat(config)); setError('')
  }

  function savePatProfile(purpose: string, value = pat) {
    if (!config) throw new Error('Enter a valid Azure DevOps project URL first.')
    const cleanPurpose = purpose.trim()
    if (!cleanPurpose) throw new Error('Enter a purpose for this PAT profile.')
    const id = activePatProfileId || crypto.randomUUID().replaceAll('-', '')
    saveAzurePatProfile(config, { id, purpose: cleanPurpose, token: value })
    const profiles = listAzurePatProfiles(config); setPatProfiles(profiles); setActivePatProfileId(id); setPat(value.trim()); setMessage(`PAT profile “${cleanPurpose}” saved on this browser.`); setError('')
  }

  function forgetPatProfile() {
    if (!config || !activePatProfileId) return
    forgetAzurePatProfile(config, activePatProfileId); const profiles = listAzurePatProfiles(config); const next = profiles[0]?.id ?? ''; setPatProfiles(profiles); setActivePatProfileId(next); setPat(next ? loadAzurePatProfile(config, next) : ''); setMessage('PAT profile removed from this browser. The Azure DevOps token itself was not revoked.'); setError('')
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

  async function saveTimeWritingEffort(workItemId: number, planHours: number, actualHours: number) {
    if (!config) throw new Error('Configure a valid Azure DevOps project first.')
    const updated = await updateAzureTimeWritingEffort(config, pat, workItemId, planHours, actualHours)
    setPreview((current) => current ? { ...current, items: mergeAzureWorkItems(current.items, [updated]), scope: { ...current.scope, itemKeys: [...new Set([...current.scope.itemKeys, updated.key])] } } : current)
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems(draft.azureWorkItems ?? [], [updated])
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Update Azure effort', entity: 'AzureDevOps Time Writing', entityId: String(updated.id), detail: `Updated Plan to ${planHours}h and Actual to ${actualHours}h on Azure DevOps work item #${updated.id}.` })
      return draft
    })
    setMessage(`Plan and Actual saved to Azure DevOps work item #${updated.id}.`); setError('')
    return updated
  }

  function savePreview() {
    if (!preview) return
    if (!sameAzureScope(preview.scope, config)) { setError('The source changed after fetching. Refresh the selected backlog before saving.'); return }
    const incoming = preview.items
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems([], incoming)
      draft.azureBacklogScope = structuredClone(preview.scope)
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Sync', entity: 'AzureDevOps', entityId: 'work-items', detail: `Replaced Azure cache with ${incoming.length} records from ${preview.scope.team}'s Epic backlog hierarchy only. Other app data and Azure source records were not changed.` })
      return draft
    })
    setPreview(null); setMessage(`${incoming.length} team-backlog records loaded into the app cache. Check browser save status for persistence. Old out-of-scope cached records were replaced; Azure DevOps and demand-planning data were not modified.`)
  }

  return { projectUrl, changeProjectUrl, team, setTeam, pat, setPat, patProfiles, activePatProfileId, selectPatProfile, savePatProfile, forgetPatProfile, busy, error, setError, message, setMessage, preview, setPreview, saved, items, config, needsScopedRefresh, fetchPreview, refresh, lastRefreshed, rememberPat, forgetPat, featureCreated, savePreview, saveTimeWritingEffort }
}

export type AzureWorkspace = ReturnType<typeof useAzureWorkspace>
