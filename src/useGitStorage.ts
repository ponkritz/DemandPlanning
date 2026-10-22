import { useCallback, useEffect, useRef, useState } from 'react'
import type { useAppStore } from './store'
import { canWrite, fileSha, forgetGitStorage, GitConflictError, historyUrl, listFolder, loadGitConfig, loadGitToken, planningData, readPlanningFile, readRawFile, readTextFile, saveGitConfig, saveGitToken, serializePlanning, siblingConfig, validateGitConfig, writePlanningFile, writeTextFile, type GitConfig } from './gitStorage'
import { applySnapshots, parseSnapshot, serializeSnapshot, snapshotDigest, snapshotFile, snapshotFileName, snapshotFolder, type SnapshotFile, type ViewSnapshot } from './gitSnapshots'
import { formatDateTime } from './format'
import { applyWindchillSnapshots, parseWindchillSnapshot, windchillDigest, windchillFolder, windchillSnapshotFile, type WindchillSnapshotFile, type WindchillSource } from './windchillSnapshots'
import { loadWindchillViews, saveWindchillViews, type WindchillView } from './windchillViews'
import { loadAzureConnectionProfile, saveAzureConnectionProfile, type AzureConnectionProfileSummary } from './azureCredentials'
import { parseViews, syncViewsFromGit } from './viewDefinitions'

export type GitStatus = 'off' | 'loading' | 'synced' | 'empty' | 'saving' | 'error' | 'conflict'

// Keeps baseline rules, release scopes and the resource mapping in a GitHub data file. Loads it on start when a
// repository and token are configured in this browser; saving is an explicit commit with a message.
export function useGitStorage(store: ReturnType<typeof useAppStore>, isSample: boolean) {
  const [config, setConfig] = useState<GitConfig | null>(() => loadGitConfig())
  const [token, setToken] = useState(() => loadGitToken())
  const [status, setStatus] = useState<GitStatus>(() => loadGitConfig() && loadGitToken() ? 'loading' : 'off')
  const [message, setMessage] = useState('')
  const [commitUrl, setCommitUrl] = useState('')
  const [synced, setSynced] = useState<string | null>(null)
  const sha = useRef<string | null>(null)
  const started = useRef(false)
  const current = serializePlanning(planningData(store.state))
  const connected = Boolean(config && token)
  // A read-only token (e.g. the viewers' shared token): baselines are shown but not edited here.
  const accessKey = config && token ? `${config.owner}/${config.repo}|${token}` : ''
  const [writable, setWritable] = useState<{ key: string; value: boolean | null }>({ key: '', value: null })
  useEffect(() => {
    if (!config || !token) return
    let active = true
    const key = `${config.owner}/${config.repo}|${token}`
    canWrite(config, token).then((value) => { if (active) setWritable({ key, value }) }, () => { if (active) setWritable({ key, value: null }) })
    return () => { active = false }
  }, [config, token])
  const readOnly = connected && writable.key === accessKey && writable.value === false
  const dirty = connected && synced != null && current !== synced

  const load = useCallback(async (target = config, key = token) => {
    if (!target || !key) return
    setStatus('loading'); setMessage(`Loading ${target.path} from ${target.owner}/${target.repo}…`)
    try {
      const file = await readPlanningFile(target, key)
      sha.current = file.sha
      if (!file.data) { setSynced(''); setStatus('empty'); setMessage(`${target.path} does not exist yet in ${target.owner}/${target.repo}. Save to create it from the data in this app.`); return }
      const data = file.data
      store.update((draft) => { draft.baselineRules = data.baselineRules; draft.releaseScopes = data.releaseScopes; draft.resourceProfiles = data.resourceProfiles; return draft })
      setSynced(serializePlanning(data)); setCommitUrl(historyUrl(target)); setStatus('synced'); setMessage(`Loaded from ${target.owner}/${target.repo} · ${target.path}`)
    } catch (error) { setStatus('error'); setMessage(error instanceof Error ? error.message : String(error)) }
  }, [config, token, store])

  useEffect(() => {
    if (started.current || !store.ready || !config || !token) return
    started.current = true
    void load()
  }, [store.ready, config, token, load])

  async function connect(input: Partial<Record<keyof GitConfig, unknown>>, nextToken: string, remember: boolean) {
    let target: GitConfig
    try { target = validateGitConfig(input) } catch (error) { setStatus('error'); setMessage(error instanceof Error ? error.message : String(error)); return }
    const key = nextToken.trim() || token
    if (!key) { setStatus('error'); setMessage('Enter a GitHub token with Contents: Read and write on the data repository.'); return }
    try { saveGitConfig(target); if (remember) saveGitToken(key) } catch { /* storage unavailable: keep for this session only */ }
    setConfig(target); setToken(key)
    await load(target, key)
  }

  async function save(commitMessage: string) {
    if (!config || !token) return
    if (isSample) { setStatus('error'); setMessage('Synthetic sample data is loaded. Saving to Git is disabled so sample mappings never reach the shared file.'); return }
    setStatus('saving'); setMessage('Saving to Git…')
    try {
      const data = planningData(store.state)
      const result = await writePlanningFile(config, token, data, sha.current, commitMessage)
      sha.current = result.sha
      setSynced(serializePlanning(data)); setCommitUrl(result.commitUrl); setStatus('synced'); setMessage(`Saved to ${config.owner}/${config.repo} · ${config.path}`)
    } catch (error) {
      setStatus(error instanceof GitConflictError ? 'conflict' : 'error'); setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  // The Azure DevOps views file (next to the data file): read the current version, then commit the new text.
  const viewsConfig = config ? siblingConfig(config, 'azure-views.json') : null
  async function readViews() {
    if (!viewsConfig || !token) throw new Error('Connect Git storage first.')
    return readTextFile(viewsConfig, token)
  }
  // At start: the shared connection setup in Git becomes this browser's default (connections changed here are kept).
  const [viewsSync, setViewsSync] = useState('')
  async function syncViews() {
    const file = await readViews()
    if (file.text == null) return null
    const result = syncViewsFromGit(parseViews(file.text))
    const parts = [result.added.length && `${result.added.length} added (${result.added.join(', ')})`, result.updated.length && `${result.updated.length} updated (${result.updated.join(', ')})`, result.kept.length && `kept as changed here: ${result.kept.join(', ')}`].filter(Boolean)
    setViewsSync(parts.length ? `Connections from Git: ${parts.join('; ')}.${result.noPat.length ? ` No PAT here yet for ${result.noPat.join(', ')}: they show the data saved to Git; add a PAT in Settings to fetch.` : ''}` : 'Connections are the same as in Git.')
    return result
  }
  async function writeViews(text: string, commitMessage: string) {
    if (!viewsConfig || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const current = await readTextFile(viewsConfig, token)
    if (current.text === text) return { changed: false, commitUrl: historyUrl(viewsConfig) }
    return { changed: true, ...(await writeTextFile(viewsConfig, token, text, current.sha, commitMessage)) }
  }

  // On-prem view snapshots (azure-data/<connection>.json): the desktop app commits each fetch whose data changed;
  // the web app loads them. Per view, the last result is kept so the next fetch can say what happened.
  const [snapshotNotes, setSnapshotNotes] = useState<Record<string, { tone: 'success' | 'error' | 'info'; text: string }>>({})
  const digestKey = 'demand-planning-git-snapshot-digests-v1'
  const note = (id: string, tone: 'success' | 'error' | 'info', text: string) => setSnapshotNotes((current) => ({ ...current, [id]: { tone, text } }))
  async function pushSnapshot(profile: AzureConnectionProfileSummary, source: ViewSnapshot) {
    if (!config || !token || isSample) return
    const target = siblingConfig(config, `${snapshotFolder}/${snapshotFileName(profile.id)}`)
    try {
      const digest = await snapshotDigest(source)
      let digests: Record<string, string> = {}
      try { digests = JSON.parse(localStorage.getItem(digestKey) ?? '{}') as Record<string, string> } catch { digests = {} }
      if (digests[profile.id] === digest) { note(profile.id, 'info', 'Unchanged since the last save to Git.'); return }
      note(profile.id, 'info', 'Saving to Git…')
      const sha = await fileSha(target, token)
      await writeTextFile(target, token, serializeSnapshot(snapshotFile(profile, source)), sha, `${profile.viewName || profile.reason}: ${source.items.length} items fetched ${formatDateTime(source.fetchedAt)}`)
      try { localStorage.setItem(digestKey, JSON.stringify({ ...digests, [profile.id]: digest })) } catch { /* next fetch commits again */ }
      note(profile.id, 'success', `Saved to Git (${target.path}).`)
    } catch (error) { note(profile.id, 'error', `Not saved to Git: ${error instanceof Error ? error.message : String(error)}`) }
  }
  async function pullSnapshots() {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const folder = siblingConfig(config, snapshotFolder)
    const entries = (await listFolder(folder, token)).filter((entry) => entry.name.endsWith('.json'))
    const files: SnapshotFile[] = []
    const failed: string[] = []
    for (const entry of entries) {
      try { const text = await readRawFile({ ...config, path: entry.path }, token); if (text) files.push(parseSnapshot(text)) } catch { failed.push(entry.name) }
    }
    // Connections not set up in this browser are added without a PAT, to show the data (fetching needs a PAT).
    let added = 0
    for (const file of files) if (!loadAzureConnectionProfile(file.connection.id)) { try { saveAzureConnectionProfile({ ...file.connection, token: '' }); added += 1 } catch { failed.push(snapshotFileName(file.connection.id)) } }
    const { applied } = applySnapshots(store.state.azureSources, files)
    store.update((draft) => { draft.azureSources = applySnapshots(draft.azureSources, files).sources; return draft })
    return { files: files.length, applied, added, failed }
  }

  // One on-prem view's data from Git (Load from Git, or the fallback when a fetch cannot run): null when Git has
  // none; the data here is replaced only by a newer fetch.
  async function pullSnapshot(connectionId: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const text = await readRawFile(siblingConfig(config, `${snapshotFolder}/${snapshotFileName(connectionId)}`), token)
    if (!text) return null
    const file = parseSnapshot(text)
    if (file.connection.id !== connectionId) throw new Error(`${snapshotFileName(connectionId)} in Git belongs to another view.`)
    const applied = applySnapshots(store.state.azureSources, [file]).applied.length > 0
    if (applied) store.update((draft) => { draft.azureSources = applySnapshots(draft.azureSources, [file]).sources; return draft })
    return { applied, fetchedAt: file.source.fetchedAt }
  }

  // Windchill views: the same, in windchill-data/<view>.json.
  async function pushWindchill(view: WindchillView, source: WindchillSource) {
    const id = `wc:${view.id}`
    if (!config || !token || isSample) return
    const target = siblingConfig(config, `${windchillFolder}/${view.id}.json`)
    try {
      const digest = await windchillDigest(source)
      let digests: Record<string, string> = {}
      try { digests = JSON.parse(localStorage.getItem(digestKey) ?? '{}') as Record<string, string> } catch { digests = {} }
      if (digests[id] === digest) { note(id, 'info', 'Unchanged since the last save to Git.'); return }
      note(id, 'info', 'Saving to Git…')
      const sha = await fileSha(target, token)
      await writeTextFile(target, token, `${JSON.stringify(windchillSnapshotFile(view, source))}\n`, sha, `Windchill ${view.name}: ${source.rows.length} results fetched ${formatDateTime(source.fetchedAt)}`)
      try { localStorage.setItem(digestKey, JSON.stringify({ ...digests, [id]: digest })) } catch { /* next fetch commits again */ }
      note(id, 'success', `Saved to Git (${target.path}).`)
    } catch (error) { note(id, 'error', `Not saved to Git: ${error instanceof Error ? error.message : String(error)}`) }
  }
  async function pullWindchill() {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const entries = (await listFolder(siblingConfig(config, windchillFolder), token)).filter((entry) => entry.name.endsWith('.json'))
    const files: WindchillSnapshotFile[] = [], failed: string[] = []
    for (const entry of entries) { try { const text = await readRawFile({ ...config, path: entry.path }, token); if (text) files.push(parseWindchillSnapshot(text)) } catch { failed.push(entry.name) } }
    // Views not set up in this browser are added, to show their results.
    const views = loadWindchillViews(), known = new Set(views.map((view) => view.id))
    const added = files.filter((file) => !known.has(file.view.id)).map((file) => file.view)
    if (added.length) { try { saveWindchillViews([...views, ...added]) } catch { /* shown for this session only */ } }
    const { applied } = applyWindchillSnapshots(store.state.windchillSources, files)
    store.update((draft) => { draft.windchillSources = applyWindchillSnapshots(draft.windchillSources, files).sources; return draft })
    return { files: files.length, applied, added: added.length, failed }
  }

  function disconnect() {
    try { forgetGitStorage() } catch { /* nothing stored */ }
    setConfig(null); setToken(''); setSynced(null); setStatus('off'); setMessage('Git storage disconnected in this browser. The data stays in the app and in the repository.'); sha.current = null
  }

  return { config, connected, readOnly, status, message, dirty, commitUrl, history: config ? historyUrl(config) : '', isSample, load: () => load(), connect, save, disconnect, viewsPath: viewsConfig?.path ?? '', viewsHistory: viewsConfig ? historyUrl(viewsConfig) : '', readViews, writeViews, syncViews, viewsSync, snapshotNotes, pushSnapshot, pullSnapshot, pullSnapshots, pushWindchill, pullWindchill, snapshotsHistory: config ? historyUrl(siblingConfig(config, snapshotFolder)) : '' }
}
export type GitStorage = ReturnType<typeof useGitStorage>
