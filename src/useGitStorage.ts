import { useCallback, useEffect, useRef, useState } from 'react'
import type { useAppStore } from './store'
import { canWrite, deleteFile, fileSha, forgetGitStorage, GitConflictError, historyUrl, listFolder, loadGitConfig, loadGitToken, planningData, readPlanningFile, readRawFile, readTextFile, saveGitConfig, saveGitToken, serializePlanning, siblingConfig, validateGitConfig, writePlanningFile, writeTextFile, type GitConfig } from './gitStorage'
import { applySnapshots, parseSnapshot, serializeSnapshot, snapshotDigest, snapshotFile, snapshotFileName, snapshotFolder, type SnapshotFile, type ViewSnapshot } from './gitSnapshots'
import { formatDateTime } from './format'
import { applyWindchillSnapshots, parseWindchillSnapshot, windchillDigest, windchillFolder, windchillSnapshotFile, type WindchillSnapshotFile, type WindchillSource } from './windchillSnapshots'
import { loadWindchillViews, saveWindchillViews, type WindchillView } from './windchillViews'
import { loadAzureConnectionProfile, saveAzureConnectionProfile, type AzureConnectionProfileSummary, listAzureConnectionProfiles } from './azureCredentials'
import { parseViews, syncViewsFromGit, connectionKey } from './viewDefinitions'
import { personalSetupPath } from './featureSetup'

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
  // The pending write check, for saves queued before it has answered (null: the check itself failed).
  const writeCheck = useRef<Promise<boolean | null>>(Promise.resolve(null))
  useEffect(() => {
    if (!config || !token) return
    let active = true
    const key = `${config.owner}/${config.repo}|${token}`
    const check = canWrite(config, token).then((value) => value, () => null)
    writeCheck.current = check
    void check.then((value) => { if (active) setWritable({ key, value }) })
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
      store.update((draft) => { draft.baselineRules = data.baselineRules; draft.releaseScopes = data.releaseScopes; draft.resourceProfiles = data.resourceProfiles; if (data.capacitySettings) draft.capacitySettings = data.capacitySettings; return draft })
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
    // A connection removed in Git goes with its data here, as a connection removed in Settings does.
    if (result.removedIds.length) store.update((draft) => { if (draft.azureSources?.some((source) => result.removedIds.includes(source.connectionId))) draft.azureSources = draft.azureSources.filter((source) => !result.removedIds.includes(source.connectionId)); return draft })
    const parts = [result.added.length && `${result.added.length} added (${result.added.join(', ')})`, result.updated.length && `${result.updated.length} updated (${result.updated.join(', ')})`, result.kept.length && `kept as changed here: ${result.kept.join(', ')}`, result.removed.length && `${result.removed.length} removed as in Git (${result.removed.join(', ')})`].filter(Boolean)
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

  // Access roles (access.json): read by everyone with Git storage; saved only with a token that can write. The version
  // read is required to save, so a concurrent change is refused rather than overwritten.
  const accessConfig = config ? siblingConfig(config, 'access.json') : null
  const readAccess = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return readTextFile(siblingConfig(config, 'access.json'), token)
  }, [config, token])
  // The per-Epic Feature setup (feature-setup.json): the same rules as the access file.
  const readFeatureSetup = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return readTextFile(siblingConfig(config, 'feature-setup.json'), token)
  }, [config, token])
  async function writeFeatureSetup(text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return writeTextFile(siblingConfig(config, 'feature-setup.json'), token, text, sha, commitMessage)
  }
  // The QE Mapping table (qe-mapping.json): read and saved like the shared Feature setup.
  const readQeMapping = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return readTextFile(siblingConfig(config, 'qe-mapping.json'), token)
  }, [config, token])
  async function writeQeMapping(text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return writeTextFile(siblingConfig(config, 'qe-mapping.json'), token, text, sha, commitMessage)
  }
  // A person's own Feature setup (feature-setup/<email>.json): read and saved like the shared one.
  const readPersonalFeatureSetup = useCallback(async (email: string) => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const path = personalSetupPath(email)
    if (!path) throw new Error('Set your email on the Time Writing connection to keep your own Feature setup.')
    return readTextFile(siblingConfig(config, path), token)
  }, [config, token])
  async function writePersonalFeatureSetup(email: string, text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const path = personalSetupPath(email)
    if (!path) throw new Error('Set your email on the Time Writing connection to keep your own Feature setup.')
    return writeTextFile(siblingConfig(config, path), token, text, sha, commitMessage)
  }
  async function writeAccess(text: string, sha: string | null, commitMessage: string) {
    if (!accessConfig || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return writeTextFile(accessConfig, token, text, sha, commitMessage)
  }

  // Removes the data saved to Git for connections that no longer exist (azure-data/<connection>.json); returns how many.
  async function removeSnapshots(ids: string[], commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    let removed = 0
    for (const id of ids) if (await deleteFile(siblingConfig(config, `${snapshotFolder}/${snapshotFileName(id)}`), token, commitMessage)) removed += 1
    return removed
  }

  // On-prem view snapshots (azure-data/<connection>.json): the desktop app commits each fetch whose data changed;
  // the web app loads them. Per view, the last result is kept so the next fetch can say what happened.
  const [snapshotNotes, setSnapshotNotes] = useState<Record<string, { tone: 'success' | 'error' | 'info'; text: string }>>({})
  const digestKey = 'demand-planning-git-snapshot-digests-v1'
  const note = (id: string, tone: 'success' | 'error' | 'info', text: string) => setSnapshotNotes((current) => ({ ...current, [id]: { tone, text } }))
  // Every fresh fetch of an on-prem view is saved to Git, also when the data is unchanged (its fetch time is new); the
  // commit message says when only the fetch time changed. Saves run one after another, wait for the token's write check
  // (a read-only token saves nothing, with one note instead of a failed commit), and a save that loses a race with
  // another commit re-reads the file and tries once more; any other failure is reported at once.
  const pushQueue = useRef<Promise<void>>(Promise.resolve())
  function pushSnapshot(profile: AzureConnectionProfileSummary, source: ViewSnapshot) {
    const run = pushQueue.current.then(() => pushSnapshotNow(profile, source))
    pushQueue.current = run.catch(() => undefined)
    return run
  }
  async function pushSnapshotNow(profile: AzureConnectionProfileSummary, source: ViewSnapshot) {
    if (!config || !token || isSample) return
    const target = siblingConfig(config, `${snapshotFolder}/${snapshotFileName(profile.id)}`)
    try {
      if ((await writeCheck.current) === false) { note(profile.id, 'info', 'Not saved to Git: the Git token here is read-only.'); return }
      const digest = await snapshotDigest(source)
      let digests: Record<string, string> = {}
      try { digests = JSON.parse(localStorage.getItem(digestKey) ?? '{}') as Record<string, string> } catch { digests = {} }
      const unchanged = digests[profile.id] === digest
      note(profile.id, 'info', 'Saving to Git…')
      const message = `${profile.viewName || profile.reason}: ${source.items.length} items fetched ${formatDateTime(source.fetchedAt)}${unchanged ? ' (data unchanged)' : ''}`
      const text = serializeSnapshot(snapshotFile(profile, source))
      try { await writeTextFile(target, token, text, await fileSha(target, token), message) }
      catch (error) { if (!(error instanceof GitConflictError)) throw error; await writeTextFile(target, token, text, await fileSha(target, token), message) }
      try { localStorage.setItem(digestKey, JSON.stringify({ ...digests, [profile.id]: digest })) } catch { /* only used for the commit message */ }
      note(profile.id, 'success', `Saved to Git (${target.path})${unchanged ? ' — data unchanged, fetch time updated' : ''}.`)
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
    // A file whose connection duplicates one already here (same server, project, role and query) is skipped.
    for (const file of files) if (!loadAzureConnectionProfile(file.connection.id) && !listAzureConnectionProfiles().some((profile) => connectionKey(profile) === connectionKey(file.connection))) { try { saveAzureConnectionProfile({ ...file.connection, token: '' }); added += 1 } catch { failed.push(snapshotFileName(file.connection.id)) } }
    const usable = files.filter((file) => loadAzureConnectionProfile(file.connection.id))
    const { applied } = applySnapshots(store.state.azureSources, usable)
    store.update((draft) => { draft.azureSources = applySnapshots(draft.azureSources, usable).sources; return draft })
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
  // One Windchill export (or view) from Git: Load from Git on its page. Null when Git has none; the results here are
  // replaced only by newer ones, and an export not set up here is added.
  async function pullWindchillOne(viewId: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const text = await readRawFile(siblingConfig(config, `${windchillFolder}/${viewId}.json`), token)
    if (!text) return null
    const file = parseWindchillSnapshot(text)
    if (file.view.id !== viewId) throw new Error(`${viewId}.json in Git belongs to another export.`)
    const views = loadWindchillViews()
    if (!views.some((view) => view.id === viewId)) { try { saveWindchillViews([...views, file.view]) } catch { /* shown for this session only */ } }
    const applied = applyWindchillSnapshots(store.state.windchillSources, [file]).applied.length > 0
    if (applied) store.update((draft) => { draft.windchillSources = applyWindchillSnapshots(draft.windchillSources, [file]).sources; return draft })
    return { applied, fetchedAt: file.source.fetchedAt }
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

  return { config, connected, readOnly, status, message, dirty, commitUrl, history: config ? historyUrl(config) : '', isSample, load: () => load(), connect, save, disconnect, viewsPath: viewsConfig?.path ?? '', viewsHistory: viewsConfig ? historyUrl(viewsConfig) : '', readViews, writeViews, syncViews, accessScope: accessConfig && token ? `${accessConfig.owner}/${accessConfig.repo}@${accessConfig.branch}:${accessConfig.path}` : '', accessPath: accessConfig?.path ?? '', accessHistory: accessConfig ? historyUrl(accessConfig) : '', readAccess, writeAccess, readFeatureSetup, writeFeatureSetup, readPersonalFeatureSetup, writePersonalFeatureSetup, featureSetupHistory: config ? historyUrl(siblingConfig(config, 'feature-setup.json')) : '', readQeMapping, writeQeMapping, qeMappingHistory: config ? historyUrl(siblingConfig(config, 'qe-mapping.json')) : '', removeSnapshots, viewsSync, snapshotNotes, pushSnapshot, pullSnapshot, pullSnapshots, pushWindchill, pullWindchill, pullWindchillOne, snapshotsHistory: config ? historyUrl(siblingConfig(config, snapshotFolder)) : '' }
}
export type GitStorage = ReturnType<typeof useGitStorage>
