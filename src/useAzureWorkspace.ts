import { useState } from 'react'
import { fetchAzureWorkItems, mergeAzureWorkItems, parseAzureProjectUrl, type AzureFetchResult, type AzureConfig } from './azureDevOps'
import type { PageProps } from './pages/types'
import type { AzureWorkItem } from './domain'
import { loadAzurePat, saveAzurePat, forgetAzurePat } from './azureCredentials'

const defaultUrl = 'https://dev.azure.com/ALMP-ORG-MSTP01/Patient%20Safety%20and%20Quality/_backlogs/backlog/InD%20Quality/Epics'

// Kept at the app level so navigation between connection settings and Board preserves a fetched preview.
export function useAzureWorkspace(store: PageProps['store']) {
  const [projectUrl, setProjectUrl] = useState(defaultUrl)
  const [team, setTeam] = useState('InD Quality')
  const [includeProjectEpics, setIncludeProjectEpics] = useState(true)
  const [pat, setPat] = useState(() => loadAzurePat(parseAzureProjectUrl(defaultUrl)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<AzureFetchResult | null>(null)
  const saved = store.state.azureWorkItems ?? []
  const items = preview?.items ?? saved
  let config: AzureConfig | null
  try { config = { ...parseAzureProjectUrl(projectUrl), team, includeProjectEpics } } catch { config = null }

  function changeProjectUrl(next: string) {
    setProjectUrl(next); setPreview(null)
    try { setPat(loadAzurePat(parseAzureProjectUrl(next))) } catch { setPat('') }
  }

  async function fetchPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage(''); setPreview(null); setBusy(true)
    try {
      const parsed = parseAzureProjectUrl(projectUrl)
      saveAzurePat(parsed, pat)
      const result = await fetchAzureWorkItems({ ...parsed, team: team.trim() || parsed.team, includeProjectEpics }, pat)
      setPreview(result)
      setMessage(`${result.items.length} work items fetched. Open Board to review the hierarchy and save the preview.`)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to fetch Azure DevOps data.') }
    finally { setBusy(false) }
  }

  function rememberPat(value = pat) {
    if (!config) { setError('Enter a valid Azure DevOps project URL first.'); return }
    saveAzurePat(config, value); setPat(value.trim()); setMessage('PAT saved on this browser for this organization and project.'); setError('')
  }

  function forgetPat() {
    if (config) forgetAzurePat(config)
    setPat(''); setMessage('Saved PAT removed from this browser. The token itself has not been revoked in Azure DevOps.'); setError('')
  }

  function featureCreated(incoming: AzureWorkItem[]) {
    setPreview((current) => current ? { ...current, items: mergeAzureWorkItems(current.items, incoming) } : current)
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems(draft.azureWorkItems ?? [], incoming)
      const feature = incoming.find((item) => item.workItemType === 'Feature')
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Save verified hierarchy', entity: 'AzureDevOps Feature', entityId: String(feature?.id ?? ''), detail: `${incoming.length} verified source records saved for Feature #${feature?.id ?? 'unknown'}. Check the operation result for completion status.` })
      return draft
    })
  }

  function savePreview() {
    if (!preview) return
    const incoming = preview.items
    store.update((draft) => {
      draft.azureWorkItems = mergeAzureWorkItems(draft.azureWorkItems ?? [], incoming)
      draft.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Sync', entity: 'AzureDevOps', entityId: 'work-items', detail: `Saved ${incoming.length} work items; matched by organization, project and ID.` })
      return draft
    })
    setPreview(null); setMessage(`${incoming.length} work items saved. Refreshing the same IDs updates existing records. Azure DevOps was not modified.`)
  }

  return { projectUrl, changeProjectUrl, team, setTeam, includeProjectEpics, setIncludeProjectEpics, pat, setPat, busy, error, setError, message, setMessage, preview, setPreview, saved, items, config, fetchPreview, rememberPat, forgetPat, featureCreated, savePreview }
}

export type AzureWorkspace = ReturnType<typeof useAzureWorkspace>
