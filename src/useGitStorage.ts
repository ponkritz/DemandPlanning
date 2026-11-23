import { listValidationDocuments as listPackage, readValidationDocument as readPackage } from './toolValidation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { useAppStore } from './store'
import { privateGitWrites, canWrite, deleteFile, fileCommits, fileSha, lastCommit, readTextAt, forgetGitStorage, GitConflictError, historyUrl, listFolder, loadGitConfig, loadGitToken, planningData, readBinaryFile, readPlanningFile, readRawFile, readTextFile, saveGitConfig, saveGitToken, serializePlanning, siblingConfig, validateGitConfig, writePlanningFile, writeTextFile, type GitConfig } from './gitStorage'
import { historyPath } from './history'
import { packTemplateFile } from './pptxTemplate'
import { applySnapshots, parseSnapshot, serializeSnapshot, snapshotDigest, snapshotFile, snapshotFileName, snapshotFolder, type SnapshotFile, type ViewSnapshot } from './gitSnapshots'
import { formatDateTime } from './format'
import { applyWindchillSnapshots, parseWindchillSnapshot, windchillDigest, windchillFolder, windchillSnapshotFile, type WindchillSnapshotFile, type WindchillSource } from './windchillSnapshots'
import { loadWindchillViews, saveWindchillViews, type WindchillView } from './windchillViews'
import { windchillAnalysisFolder } from './windchillReleases'
import { loadAzureConnectionProfile, saveAzureConnectionProfile, type AzureConnectionProfileSummary, listAzureConnectionProfiles } from './azureCredentials'
import { applyViewsReset, resetPending, parseViews, parseViewsReset, serializeViews, serializeViewsReset, sharedEmails, syncViewsFromGit, connectionKey, viewsBackupFolder, viewsFile, viewsResetPath, mergeViews, removedFromGit, type GitVersion } from './viewDefinitions'
import { personalSetupPath } from './featureSetup'
import { personalViewsPath, viewsDefaultsPath } from './personalViews'
import { kpiTrackerFile } from './kpiTracker'
import { customStreamsFile } from './customStreams'
import { mergeOnDemandText, onDemandFolder, onDemandPath, pageIdOfFile, pageIdPattern, type OnDemandPage } from './onDemand'
import { listEntries } from './gitStorage'
import { branchExists, ensureBranch } from './gitTrees'
import { commitPageChange, convertPage, createRowFile, dropLock, keepLock, loadRowPage, readLocks, removeRowPage, takeLock, takeRowNumber, type HeldLock, type RowPageRead } from './rowPageGit'
import { diffPages, mergeRowText, pageJsonPath, rowFilePath, rowMessage, rowPageQueue, rowsFolder, serializeHead, serializeRow } from './rowFiles'
import { lockBranch, lockSettingsFile, mergeLockSettingsText, type RowLock } from './rowLocks'
import { menuLayoutFile, mergeMenuLayoutText } from './menuLayout'
import { dashboardPath, mergeDashboardText } from './dashboardPages'
import { freezeSnapshot, listSnapshots as listLteSnapshots, uploadSnapshot } from './cloudSnapshots'
import { appBuild } from './buildInfo'
import type { Snapshot } from './domain'
import { mergeHistoryText, mergeKpiTrackerText, mergeViewsBackupText, mergeViewsDefaultsText, saveStamp, SaveQueue, stampMessage, type QueuedOutcome, writeQueuedBinary, writeQueuedText, type Merge, type QueueState } from './gitSaveQueue'
import { beginSave, emptyWatch, endSave, fileLabel, newerFiles, rememberOwn, watchedFolders, watchFocusGapMs, watchIntervalMs, type FolderEntry, type RemoteChange, type WatchState } from './gitWatch'

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
  // GIT-15: the version of every shared file read or written here, to notice what others save while the app is open;
  // GIT-18 (KB-82): with the versions this window saved (and the ones they replaced) and the saves on their way.
  const watch = useRef<WatchState>(emptyWatch())
  // Newer versions in Git not loaded here yet (path → who and when), shown on the pages that use them (GIT-18);
  // reading or saving a file drops it.
  const [remote, setRemote] = useState<Record<string, RemoteChange>>({})
  // GIT-17: the text last read or written here per file: the base a queued save is merged from.
  const seenText = useRef<Record<string, string | null>>({})
  const forget = (path: string) => setRemote((current) => path in current ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== path)) : current)
  const remember = (path: string, version: string | null) => { watch.current.seen[path] = version; forget(path) }
  // A version saved here: this window's own (GIT-18), also announced to the other windows of this browser.
  const rememberSaved = (path: string, version: string | null, replaced?: string | null) => { rememberOwn(watch.current, path, version, replaced); forget(path); announce(path, version) }
  async function trackRead(target: GitConfig, key: string) { const read = await readTextFile(target, key); remember(target.path, read.sha); seenText.current[target.path] = read.text; return read }
  // GIT-18: a file with a save of this window on its way is left to the next check.
  async function saving<T>(path: string, run: () => Promise<T>): Promise<T> { beginSave(watch.current, path); try { return await run() } finally { endSave(watch.current, path) } }
  // GIT-18: the versions saved in the other windows of this browser (same repository), so their notice says so.
  const scopeKey = config ? `${config.owner}/${config.repo}@${config.branch}` : ''
  const otherWindows = useRef<Record<string, (string | null)[]>>({})
  const channel = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (!scopeKey || typeof BroadcastChannel === 'undefined') return
    const opened = new BroadcastChannel('demand-planning-git-saves-v1')
    opened.onmessage = (event: MessageEvent<{ scope?: unknown; path?: unknown; sha?: unknown }>) => {
      const { scope, path, sha } = event.data ?? {}
      if (scope !== scopeKey || typeof path !== 'string' || !(typeof sha === 'string' || sha === null)) return
      otherWindows.current[path] = [...(otherWindows.current[path] ?? []), sha].slice(-20)
    }
    channel.current = opened
    return () => { opened.close(); channel.current = null }
  }, [scopeKey])
  function announce(path: string, version: string | null) { try { channel.current?.postMessage({ scope: scopeKey, path, sha: version }) } catch { /* another window says "someone else" */ } }
  // GIT-17: saves to the shared files that are merged rather than refused, queued per file in the order of their time.
  const queue = useRef(new SaveQueue())
  const [queueStates, setQueueStates] = useState<Record<string, QueueState>>({})
  const queued = useRef(new Set<string>())
  useEffect(() => queue.current.subscribe(() => setQueueStates(Object.fromEntries([...queued.current].map((path) => [path, queue.current.state(path)])))), [])
  function queueText(target: GitConfig, key: string, text: string, commitMessage: string, merge: Merge, fetchImpl: typeof fetch = fetch) {
    const at = saveStamp()
    queued.current.add(target.path)
    // KB-80: the base is the version the change was made from — the one read or written here when it is queued — so
    // a save queued behind another save of this browser, or retried after later saves, is merged, never written over them.
    const base = seenText.current[target.path] ?? null
    return saving(target.path, () => queue.current.enqueue(target.path, at, () => saving(target.path, async () => {
      const result = await writeQueuedText(target, key, { text, base, at, message: commitMessage, merge }, fetchImpl)
      rememberSaved(target.path, result.sha, result.replaced); seenText.current[target.path] = result.text
      return { sha: result.sha ?? '', commitUrl: result.commitUrl || historyUrl(target), merged: result.merged, unchanged: result.unchanged, keptNewer: false, text: result.text }
    })))
  }
  const queueState = (file: string): QueueState => (config ? queueStates[siblingConfig(config, file).path] : undefined) ?? { waiting: 0, failed: 0, error: '' }
  const retryQueued = (file: string) => config ? queue.current.retry(siblingConfig(config, file).path) : Promise.resolve([])
  async function trackWrite(target: GitConfig, key: string, text: string, version: string | null, commitMessage: string, send: typeof fetch = fetch) { return saving(target.path, async () => { const written = await writeTextFile(target, key, text, version, commitMessage, send); rememberSaved(target.path, written.sha, version); seenText.current[target.path] = text; return written }) }
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

  // quiet (GIT-15): a refresh while the app is open, without the loading state that makes other areas read again.
  const load = useCallback(async (target = config, key = token, quiet = false) => {
    if (!target || !key) return
    if (!quiet) { setStatus('loading'); setMessage(`Loading ${target.path} from ${target.owner}/${target.repo}…`) }
    try {
      const file = await readPlanningFile(target, key)
      sha.current = file.sha; remember(target.path, file.sha)
      if (!file.data) { setSynced(''); setStatus('empty'); setMessage(`${target.path} does not exist yet in ${target.owner}/${target.repo}. Save to create it from the data in this app.`); return }
      const data = file.data
      store.update((draft) => { draft.baselineRules = data.baselineRules; draft.releaseScopes = data.releaseScopes; draft.resourceProfiles = data.resourceProfiles; if (data.capacitySettings) draft.capacitySettings = data.capacitySettings; draft.setupLinks = data.setupLinks; if (data.tableDefaults) draft.tableDefaults = data.tableDefaults; if (data.releaseSourceSettings) draft.releaseSourceSettings = data.releaseSourceSettings; return draft })
      setSynced(serializePlanning(data)); setCommitUrl(historyUrl(target)); setStatus('synced'); setMessage(`Loaded from ${target.owner}/${target.repo} · ${target.path}`)
    } catch (error) { setStatus('error'); setMessage(error instanceof Error ? error.message : String(error)) }
  }, [config, token, store])

  useEffect(() => {
    if (started.current || !store.ready || !config || !token) return
    started.current = true
    void load()
  }, [store.ready, config, token, load])

  // GIT-15: every 5 minutes, and when the window comes back (at most once a minute), the folders of the shared files
  // are listed (no contents). Newer planning data is loaded at once unless this browser has unsaved changes to it;
  // GIT-18: every other newer file (and planning data with unsaved changes) is remembered with who saved it and when,
  // and shown on the pages that use it (App, PageGitNotice) — never a version this window saved itself (KB-82).
  const lastCheck = useRef(0)
  // OND-35: each check counted, so the row locks of the page in use are listed again on the same tick (no polling of their own).
  const [watchTick, setWatchTick] = useState(0)
  const latest = useRef({ dirty: false, status: 'off' as GitStatus })
  const checkForUpdates = useRef<() => Promise<void>>(async () => {})
  useEffect(() => { latest.current = { dirty, status } })
  useEffect(() => { checkForUpdates.current = async () => {
    if (!config || !token || isSample || document.visibilityState === 'hidden' || ['loading', 'saving'].includes(latest.current.status)) return
    lastCheck.current = Date.now()
    const tracked = { ...watch.current.seen }
    if (!Object.keys(tracked).length) return
    const listings: Record<string, FolderEntry[]> = {}
    for (const folder of watchedFolders(tracked)) {
      // OND-31: with the folders inside (a row-file page's rows folder is remembered by its version).
      try { listings[folder] = (await listEntries({ ...config, path: folder }, token)).map(({ path, sha: version }) => ({ path, sha: version })) } catch { /* tried again at the next check */ }
    }
    setWatchTick((count) => count + 1)
    // A file read or saved here during the check is left to the next one.
    const unchangedHere = (path: string) => watch.current.seen[path] === tracked[path]
    const changed = newerFiles(watch.current, listings).filter((entry) => unchangedHere(entry.path))
    if (!changed.length) return
    let others = changed
    if (changed.some((entry) => entry.path === config.path) && !latest.current.dirty) {
      others = changed.filter((entry) => entry.path !== config.path)
      await load(config, token, true)
      setMessage(`Updated from Git at ${formatDateTime(new Date().toISOString())}: newer planning data saved by someone else was loaded.`)
    }
    const found: RemoteChange[] = []
    for (const entry of others) {
      const otherWindow = (otherWindows.current[entry.path] ?? []).includes(entry.sha)
      const commit = otherWindow ? null : await lastCommit({ ...config, path: entry.path }, token)
      found.push({ ...entry, ...(commit?.by ? { by: commit.by } : {}), ...(commit?.at ? { at: commit.at } : {}), ...(otherWindow ? { otherWindow } : {}) })
    }
    // Set only for files still not read or saved here (a save that ended meanwhile has cleared them).
    setRemote((current) => ({ ...current, ...Object.fromEntries(found.filter((entry) => unchangedHere(entry.path) && !watch.current.busy[entry.path]).map((entry) => [entry.path, entry])) }))
  } })
  useEffect(() => {
    if (!config || !token || isSample) return
    lastCheck.current = Date.now()
    const run = () => { void checkForUpdates.current() }
    const timer = window.setInterval(run, watchIntervalMs)
    const back = () => { if (document.visibilityState !== 'hidden' && Date.now() - lastCheck.current >= watchFocusGapMs) run() }
    window.addEventListener('focus', back); document.addEventListener('visibilitychange', back)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', back); document.removeEventListener('visibilitychange', back) }
  }, [config, token, isSample])
  const remoteChanges = config ? Object.keys(remote).sort().map((path) => ({ ...remote[path], label: fileLabel(path, config.path), planning: path === config.path })) : []

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
      const replaced = sha.current
      const result = await saving(config.path, () => writePlanningFile(config, token, data, replaced, commitMessage))
      sha.current = result.sha; rememberSaved(config.path, result.sha, replaced)
      setSynced(serializePlanning(data)); setCommitUrl(result.commitUrl); setStatus('synced'); setMessage(`Saved to ${config.owner}/${config.repo} · ${config.path}`)
    } catch (error) {
      setStatus(error instanceof GitConflictError ? 'conflict' : 'error'); setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function listValidationDocuments() {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return listPackage(config, token)
  }
  async function readValidationDocument(path: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return readPackage(config, token, path)
  }

  // The Azure DevOps views file (next to the data file): read the current version, then commit the new text.
  const viewsConfig = config ? siblingConfig(config, 'azure-views.json') : null
  async function readViews() {
    if (!viewsConfig || !token) throw new Error('Connect Git storage first.')
    return trackRead(viewsConfig, token)
  }
  // At start: the shared connection setup in Git becomes this browser's default (connections changed here are kept).
  const [viewsSync, setViewsSync] = useState('')
  async function syncViews() {
    // A clean-up by an admin (CON-88) not applied here yet: every connection here goes first, with its data.
    const reset = config && token ? applyViewsReset(parseViewsReset((await readTextFile(siblingConfig(config, viewsResetPath), token)).text)) : null
    if (reset?.length) { const ids = reset.map((profile) => profile.id); store.update((draft) => { draft.azureSources = (draft.azureSources ?? []).filter((source) => !ids.includes(source.connectionId)); return draft }) }
    const resetNote = reset?.length ? `Your admin cleaned up the connections: ${reset.length} removed here (${reset.map((profile) => profile.viewName || profile.reason).join(', ')}); your PATs are kept per server. ` : ''
    if (resetNote) setViewsSync(resetNote)
    const file = await readViews()
    if (file.text == null) return null
    const result = syncViewsFromGit(parseViews(file.text), localStorage, sharedEmails(file.text))
    // A connection removed in Git goes with its data here, as a connection removed in Settings does.
    if (result.removedIds.length) store.update((draft) => { if (draft.azureSources?.some((source) => result.removedIds.includes(source.connectionId))) draft.azureSources = draft.azureSources.filter((source) => !result.removedIds.includes(source.connectionId)); return draft })
    const parts = [result.added.length && `${result.added.length} added (${result.added.join(', ')})`, result.updated.length && `${result.updated.length} updated (${result.updated.join(', ')})`, result.enforced.length && `stream mapping set by your admin applied: ${result.enforced.join(', ')}`, result.kept.length && `kept as changed here: ${result.kept.join(', ')}`, result.removed.length && `${result.removed.length} removed as in Git (${result.removed.join(', ')})`].filter(Boolean)
    setViewsSync(resetNote + (result.emailCleared ? 'Your Time Writing connection had another person\'s email from the shared setup; it was removed — enter your own work email in My settings → Servers and PATs. ' : '') + (parts.length ? `Connections from Git: ${parts.join('; ')}.${result.noPat.length ? ` No PAT here yet for ${result.noPat.join(', ')}: they show the data saved to Git; add a PAT in Settings to fetch.` : ''}` : 'Connections are the same as in Git.'))
    return result
  }
  // CON-98: shares this computer's connections by merging them into the setup in Git (never dropping one only because
  // it is not here); `removed` names the ones to take out. Returns the views now in Git.
  async function shareViews(here: AzureConnectionProfileSummary[], commitMessage: string, removed: string[] = []) {
    if (!viewsConfig || !token) throw new Error('Connect Git storage first.')
    const current = await trackRead(viewsConfig, token)
    const inGit = current.text ? parseViews(current.text) : []
    const merged = mergeViews(inGit, here, removed)
    const result = await writeViews(serializeViews(viewsFile(merged)), commitMessage)
    return { ...result, views: merged }
  }
  // CON-99: connections in older versions of the shared setup that are neither in it now nor here (read only).
  async function removedViews(here: AzureConnectionProfileSummary[], count = 30) {
    if (!viewsConfig || !token) throw new Error('Connect Git storage first.')
    const current = await trackRead(viewsConfig, token)
    const inGit = current.text ? parseViews(current.text) : []
    const versions: GitVersion[] = []
    for (const commit of await fileCommits(viewsConfig, token, count)) {
      const text = await readTextAt(viewsConfig, token, commit.sha)
      if (!text) continue
      try { versions.push({ ...commit, views: parseViews(text) }) } catch { /* an unreadable version is skipped */ }
    }
    return removedFromGit(versions, inGit, here)
  }
  async function writeViews(text: string, commitMessage: string) {
    if (!viewsConfig || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const current = await trackRead(viewsConfig, token)
    if (current.text === text) return { changed: false, commitUrl: historyUrl(viewsConfig) }
    return { changed: true, ...(await trackWrite(viewsConfig, token, text, current.sha, commitMessage)) }
  }

  // Back up and clean up (CON-88). backupViews: the connection setup as it is now, as a new dated file in
  // azure-views-backups/ (never a PAT). resetViews: announces the clean-up to every computer (azure-views-reset.json),
  // empties the shared setup (azure-views.json) and removes every on-prem view's data (azure-data/).
  async function backupViews(text: string, name: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const target = siblingConfig(config, `${viewsBackupFolder}/${name}`)
    return { path: target.path, ...(await queueText(target, token, text, commitMessage, mergeViewsBackupText)) }
  }
  async function resetViews(resetAt: string, commitMessage: string) {
    if (!config || !token || !viewsConfig) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const marker = siblingConfig(config, viewsResetPath)
    await writeTextFile(marker, token, serializeViewsReset(resetAt), await fileSha(marker, token), commitMessage)
    await writeViews(serializeViews(viewsFile([])), commitMessage)
    let removed = 0
    for (const entry of (await listFolder(siblingConfig(config, snapshotFolder), token)).filter((item) => item.name.endsWith('.json'))) {
      if (await deleteFile({ ...config, path: entry.path }, token, commitMessage)) removed += 1
    }
    try { localStorage.removeItem(digestKey) } catch { /* only used for commit messages */ }
    return { dataFiles: removed }
  }

  // Access roles (access.json): read by everyone with Git storage; saved only with a token that can write. The version
  // read is required to save, so a concurrent change is refused rather than overwritten.
  const accessConfig = config ? siblingConfig(config, 'access.json') : null
  const readAccess = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, 'access.json'), token)
  }, [config, token])
  // The per-Epic Feature setup (feature-setup.json): the same rules as the access file.
  const readFeatureSetup = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, 'feature-setup.json'), token)
  }, [config, token])
  async function writeFeatureSetup(text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return trackWrite(siblingConfig(config, 'feature-setup.json'), token, text, sha, commitMessage)
  }
  // EPS-01: the Epic setup (epic-setup.json): the same rules as the shared Feature setup.
  const readEpicSetup = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, 'epic-setup.json'), token)
  }, [config, token])
  async function writeEpicSetup(text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return trackWrite(siblingConfig(config, 'epic-setup.json'), token, text, sha, commitMessage)
  }
  // The QE Mapping table (qe-mapping.json): read and saved like the shared Feature setup.
  const readQeMapping = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, 'qe-mapping.json'), token)
  }, [config, token])
  async function writeQeMapping(text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return trackWrite(siblingConfig(config, 'qe-mapping.json'), token, text, sha, commitMessage)
  }
  // STR-01: the custom streams (custom-streams.json, next to the stream mapping): read by everyone with Git storage,
  // saved by the Tool Owner with a token that can write; the version read is required, so a concurrent change is refused.
  const readCustomStreams = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, customStreamsFile), token)
  }, [config, token])
  async function writeCustomStreams(text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return trackWrite(siblingConfig(config, customStreamsFile), token, text, sha, commitMessage)
  }
  // KPT-03: the KPI tracker's copy (kpi-tracker.json), read by everyone with Git storage, saved with a token that can write.
  const readKpiTracker = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, kpiTrackerFile), token)
  }, [config, token])
  async function writeKpiTracker(text: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return queueText(siblingConfig(config, kpiTrackerFile), token, text, commitMessage, mergeKpiTrackerText)
  }
  // OND-08, OND-09: the On-Demand pages, one file each in on-demand/ (the menu lists the folder). Read by everyone with
  // Git storage; saved with a token that can write, queued and merged with what others saved meanwhile (GIT-17);
  // a removed page's file is deleted (its history stays in GitHub). Never with the synthetic sample.
  // OND-31: a page is either its file on-demand/<id>.json or, converted to row files, its folder on-demand/<id>/ (the
  // file then holds only the marker and is not read).
  const listOnDemand = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const entries = await listEntries(siblingConfig(config, onDemandFolder), token)
    const folders = new Set(entries.filter((entry) => entry.type === 'dir' && pageIdPattern.test(entry.name)).map((entry) => entry.name))
    const files = entries.flatMap((entry) => { const id = entry.type === 'file' ? pageIdOfFile(entry.name) : null; return id ? [id] : [] })
    return [...new Set([...files, ...folders])].sort().map((id) => ({ id, rows: folders.has(id) }))
  }, [config, token])
  const readOnDemand = useCallback(async (id: string) => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, onDemandPath(id)), token)
  }, [config, token])
  async function writeOnDemand(id: string, text: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return queueText(siblingConfig(config, onDemandPath(id)), token, text, commitMessage, mergeOnDemandText, privateGitWrites(config, token))
  }
  async function removeOnDemand(id: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const target = siblingConfig(config, onDemandPath(id))
    queued.current.add(target.path)
    const replaced = watch.current.seen[target.path]
    const removed = await saving(target.path, () => queue.current.enqueue(target.path, saveStamp(), () => deleteFile(target, token, commitMessage)))
    rememberSaved(target.path, null, replaced); seenText.current[target.path] = null
    return removed
  }
  // ---- OND-31…OND-35: row-file pages ----
  // Row texts by their version (blob sha), kept for this visit: a page read again fetches only the rows that changed.
  const rowTexts = useRef(new Map<string, string>())
  const full = (path: string) => config ? siblingConfig(config, path).path : path
  // A row-file page as read: page.json and the rows folder are watched by their versions (GIT-18), each row's text is the
  // base its next save is merged from (GIT-17). The row files themselves are not listed by the watcher.
  function noteRowPage(id: string, read: RowPageRead) {
    remember(full(pageJsonPath(id)), read.headSha); seenText.current[full(pageJsonPath(id))] = read.headText
    remember(full(rowsFolder(id)), read.rowsSha)
    for (const [name, row] of Object.entries(read.rows)) seenText.current[full(`${rowsFolder(id)}/${name}`)] = row.text
  }
  const notePage = useRef(noteRowPage)
  useEffect(() => { notePage.current = noteRowPage })
  const readRowPage = useCallback(async (id: string) => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const read = await loadRowPage(config, token, id, rowTexts.current)
    if (read) notePage.current(id, read)
    return read?.page ?? null
  }, [config, token])
  // OND-33: one change of a row-file page, queued in the page's own queue (GIT-17) and written as what it is: a new row's
  // file (its ID taken from counter.json), a changed row's file (merged field by field with a save made meanwhile), a
  // removed row's file deleted, page.json (name, columns, charts; merged as OND-09), or — for a change that touches many
  // rows at once — one commit of all its files. The page is then read again (only the changed rows) and returned.
  async function saveRowPage(id: string, base: OnDemandPage, change: (page: OnDemandPage) => OnDemandPage, message: string): Promise<QueuedOutcome & { page: OnDemandPage }> {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const target = config, key = full(rowPageQueue(id))
    const send = privateGitWrites(target, token)
    queued.current.add(key)
    const at = saveStamp()
    const next = change(base)
    const diff = diffPages(base, next)
    const rowsChanged = diff.added.length + diff.updated.length + diff.removed.length
    const rowTarget = (row: { key?: string }) => siblingConfig(target, rowFilePath(id, row.key ?? ''))
    // The base each file's change was made from (KB-80), taken now.
    const single = !diff.head && rowsChanged === 1 ? diff.updated[0] ?? diff.removed[0] ?? null : null
    const singleBase = single?.key ? seenText.current[rowTarget(single).path] ?? null : null
    const headBase = seenText.current[full(pageJsonPath(id))] ?? null
    return saving(full(pageJsonPath(id)), () => saving(full(rowsFolder(id)), () => queue.current.enqueue(key, at, async () => {
      let outcome: QueuedOutcome = { sha: '', commitUrl: '', merged: false, unchanged: false, keptNewer: false }
      if (!diff.head && !rowsChanged) outcome = { ...outcome, unchanged: true }
      else if (!diff.head && rowsChanged === 1 && diff.added.length === 1) {
        const atLeast = base.rows.reduce((max, row) => Math.max(max, row.seq ?? 0), 0) + 1
        const seq = await takeRowNumber(target, token, base, atLeast, send)
        const created = await createRowFile(target, token, base, { ...diff.added[0], seq }, (row) => rowMessage(base, row, 'add'), at, send)
        seenText.current[rowTarget(created.row).path] = created.text
        outcome = { ...outcome, sha: created.sha, commitUrl: created.commitUrl }
      } else if (single && diff.updated.length === 1) {
        const result = await writeQueuedText(rowTarget(single), token, { text: serializeRow(single), base: singleBase, at, message, merge: mergeRowText }, send)
        seenText.current[rowTarget(single).path] = result.text
        outcome = { sha: result.sha ?? '', commitUrl: result.commitUrl || historyUrl(rowTarget(single)), merged: result.merged, unchanged: result.unchanged, keptNewer: false }
      } else if (single && diff.removed.length === 1) {
        if (single.key) await deleteFile(rowTarget(single), token, stampMessage(message, at), send)
      } else if (diff.head && !rowsChanged) {
        const head = siblingConfig(target, pageJsonPath(id))
        const result = await writeQueuedText(head, token, { text: serializeHead(next), base: headBase, at, message, merge: mergeOnDemandText }, send)
        outcome = { sha: result.sha ?? '', commitUrl: result.commitUrl || historyUrl(head), merged: result.merged, unchanged: result.unchanged, keptNewer: false }
      } else {
        const done = await commitPageChange(target, token, id, change, stampMessage(message, at), rowTexts.current, send)
        outcome = { ...outcome, sha: done.commit, commitUrl: done.commitUrl }
      }
      const read = await loadRowPage(target, token, id, rowTexts.current)
      if (!read) throw new Error(`${pageJsonPath(id)} is no longer in Git.`)
      noteRowPage(id, read)
      return { ...outcome, page: read.page }
    })))
  }
  // OND-32: Convert to row files (Tool Owner): one commit; the page is then read from its folder.
  async function convertOnDemand(id: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const target = config, file = full(onDemandPath(id))
    const done = await saving(file, () => saving(full(pageJsonPath(id)), () => saving(full(rowsFolder(id)), async () => {
      const result = await convertPage(target, token, id, (page) => `${page.name}: convert to one file per row (${page.rows.length} row${page.rows.length === 1 ? '' : 's'})`, privateGitWrites(target, token))
      const read = await loadRowPage(target, token, id, rowTexts.current)
      if (read) noteRowPage(id, read)
      return { ...result, page: read?.page ?? result.page }
    })))
    // The single file now holds the marker: no longer watched.
    delete watch.current.seen[file]; forget(file); delete seenText.current[file]
    return done
  }
  async function removeRowPageGit(id: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const target = config
    await saving(full(pageJsonPath(id)), () => saving(full(rowsFolder(id)), () => removeRowPage(target, token, id, commitMessage, privateGitWrites(target, token))))
    for (const path of [full(pageJsonPath(id)), full(rowsFolder(id))]) { delete watch.current.seen[path]; forget(path) }
  }
  // OND-35: the locks — on the branch `locks` (made from the data branch on the first Edit), else in the folder locks/ of
  // the data branch when the repository refuses the branch (lockFallback: the page says so).
  const lockMode = useRef<{ scope: string; mode: 'branch' | 'folder' } | null>(null)
  const [lockFallback, setLockFallback] = useState(false)
  const lockCache = useRef(new Map<string, RowLock | null>())
  async function lockConfig(create: boolean): Promise<GitConfig> {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const known = lockMode.current?.scope === scopeKey ? lockMode.current.mode : null
    if (known) return known === 'branch' ? { ...config, branch: lockBranch } : config
    if (!create) {
      if (!await branchExists(config, token, lockBranch)) return config
      lockMode.current = { scope: scopeKey, mode: 'branch' }
      return { ...config, branch: lockBranch }
    }
    const made = await ensureBranch(config, token, lockBranch, privateGitWrites(config, token))
    lockMode.current = { scope: scopeKey, mode: made === 'refused' ? 'folder' : 'branch' }
    setLockFallback(made === 'refused')
    return made === 'refused' ? config : { ...config, branch: lockBranch }
  }
  const listLocks = async (pageId: string) => { if (!config || !token || isSample) return {}; return readLocks(await lockConfig(false), token, pageId, lockCache.current) }
  const acquireLock = async (pageId: string, rowKey: string, who: { by: string; name: string; session: string }, timeoutMs: number) => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return takeLock(await lockConfig(true), token, pageId, rowKey, who, Date.now(), timeoutMs, privateGitWrites(config, token))
  }
  const renewRowLock = async (pageId: string, rowKey: string, held: HeldLock, timeoutMs: number) => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return keepLock(await lockConfig(true), token, pageId, rowKey, held, Date.now(), timeoutMs, privateGitWrites(config, token))
  }
  const releaseRowLock = async (pageId: string, rowKey: string, sha: string, message: string, keepalive = false) => {
    if (!config || !token) return false
    return dropLock(await lockConfig(false), token, pageId, rowKey, sha, message, privateGitWrites(config, token), keepalive)
  }
  // OND-36: the inactivity timeout, a shared setting next to the planning data (Admin and Tool Owner change it).
  const trackReadRef = useRef(trackRead)
  useEffect(() => { trackReadRef.current = trackRead })
  const readLockSettings = useCallback(async () => {
    if (!config || !token) return { text: null, sha: null }
    return trackReadRef.current(siblingConfig(config, lockSettingsFile), token)
  }, [config, token])
  async function writeLockSettings(text: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return queueText(siblingConfig(config, lockSettingsFile), token, text, commitMessage, mergeLockSettingsText, privateGitWrites(config, token))
  }

  // PGB-03: the menu layout (menu-layout.json next to the planning data): custom groups, group settings and the added
  // pages' placement. Read by everyone with Git storage; saved queued and merged by group and page (GIT-17).
  const readMenuLayout = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, menuLayoutFile), token)
  }, [config, token])
  async function writeMenuLayout(text: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return queueText(siblingConfig(config, menuLayoutFile), token, text, commitMessage, mergeMenuLayoutText, privateGitWrites(config, token))
  }
  // DSH-08: a Dashboard page's definition (dashboards/<page-id>.json, next to the page's own file): read by everyone with
  // Git storage; saved queued and merged by block, tab and filter (GIT-17); deleted with the page.
  const readDashboard = useCallback(async (id: string) => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, dashboardPath(id)), token)
  }, [config, token])
  async function writeDashboard(id: string, text: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return queueText(siblingConfig(config, dashboardPath(id)), token, text, commitMessage, mergeDashboardText, privateGitWrites(config, token))
  }
  async function removeDashboard(id: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const target = siblingConfig(config, dashboardPath(id))
    const read = await trackRead(target, token)
    if (read.text == null) return false
    queued.current.add(target.path)
    await saving(target.path, () => queue.current.enqueue(target.path, saveStamp(), () => deleteFile(target, token, commitMessage)))
    rememberSaved(target.path, null, read.sha); seenText.current[target.path] = null
    return true
  }
  // SNP-04…08: LTE / PI Review snapshots as new files in lte-snapshots/ of the Git data repository (SharePoint is in the
  // backlog). Only with a token that can write, never with the synthetic sample; nothing is kept in the browser.
  async function saveSnapshot(type: Snapshot['type'], month: string, createdBy: string) {
    if (!config || !token) throw new Error('Connect Git storage first (Admin → Data & sharing → Git storage). Snapshots are not kept in the browser.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Snapshots are not saved to Git.')
    if ((await writeCheck.current) === false) throw new Error('Your Git token can read but not save, so the snapshot was not saved.')
    return uploadSnapshot(config, token, freezeSnapshot(store.state, type, month, createdBy, appBuild))
  }
  const listSnapshots = useCallback(async () => (config && token ? listLteSnapshots(config, token) : []), [config, token])
  // Historical hours (HIS-04): the imported history (history-hours.json), read by everyone, saved or removed by roles
  // with Manage shared settings (checked on the page).
  const readHistory = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, historyPath), token)
  }, [config, token])
  async function writeHistory(text: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return queueText(siblingConfig(config, historyPath), token, text, commitMessage, mergeHistoryText)
  }
  // The planning workbooks kept in the data repository (HIS-11): .xlsx files in its folder and in history/, read for the
  // import without downloading them first.
  const dataFolder = () => config ? siblingConfig(config, '').path.replace(/\/$/, '') : ''
  async function listWorkbooks() {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const base = dataFolder()
    const folders = [base, base ? `${base}/history` : 'history']
    const found = (await Promise.all(folders.map((path) => listFolder({ ...config, path }, token)))).flat()
    return found.filter((entry) => /\.xlsx$/i.test(entry.name)).map((entry) => ({ name: entry.name, path: entry.path }))
  }
  async function readWorkbook(path: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const base = dataFolder()
    if (!/\.xlsx$/i.test(path) || path.includes('..') || (base && !path.startsWith(`${base}/`))) throw new Error('Not a workbook of the data repository.')
    const bytes = await readBinaryFile({ ...config, path }, token)
    if (!bytes) throw new Error(`${path} was not found in the data repository.`)
    return bytes
  }
  async function removeHistory(commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const path = siblingConfig(config, historyPath).path, replaced = watch.current.seen[path]
    const removed = await saving(path, () => deleteFile(siblingConfig(config, historyPath), token, commitMessage)); rememberSaved(path, null, replaced); seenText.current[path] = null; return removed
  }
  // The Monthly pack: its shared setup (monthly-pack-setup.json) and a month's text (monthly-pack/<YYYY-MM>.json),
  // read and saved like the shared Feature setup.
  const packPath = (name: string) => { if (!/^(?:monthly-pack-setup\.json|monthly-pack\/\d{4}-(?:0[1-9]|1[0-2])\.json)$/.test(name)) throw new Error('Not a Monthly pack file.'); return name }
  const readMonthlyPack = useCallback(async (name: string) => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, packPath(name)), token)
  }, [config, token])
  async function writeMonthlyPack(name: string, text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return trackWrite(siblingConfig(config, packPath(name)), token, text, sha, commitMessage)
  }
  // The Monthly pack's PowerPoint template (monthly-pack-template.pptx): kept only in this private data repository,
  // never in the app's source; read when the pack is exported, replaced or removed from Admin → Reports → Monthly pack.
  const readPackTemplate = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return readBinaryFile(siblingConfig(config, packTemplateFile), token)
  }, [config, token])
  async function writePackTemplate(bytes: Uint8Array | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const target = siblingConfig(config, packTemplateFile), at = saveStamp()
    queued.current.add(target.path)
    const result = await queue.current.enqueue(target.path, at, () => writeQueuedBinary(target, token, { bytes, at, message: commitMessage }))
    return { ...result, commitUrl: result.commitUrl || historyUrl(target) }
  }
  // A person's own Feature setup (feature-setup/<email>.json): read and saved like the shared one.
  const readPersonalFeatureSetup = useCallback(async (email: string) => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const path = personalSetupPath(email)
    if (!path) throw new Error('Set your email on the Time Writing connection to keep your own Feature setup.')
    return trackRead(siblingConfig(config, path), token)
  }, [config, token])
  // Personal views (MYD-06…MYD-09): personal-views/<email>.json per person, personal-views-defaults.json for everyone.
  const readPersonalViews = useCallback(async (email: string) => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const path = personalViewsPath(email)
    if (!path) throw new Error('Set your work email to keep your own views.')
    return trackRead(siblingConfig(config, path), token)
  }, [config, token])
  async function writePersonalViews(email: string, text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const path = personalViewsPath(email)
    if (!path) throw new Error('Set your work email to keep your own views.')
    return trackWrite(siblingConfig(config, path), token, text, sha, commitMessage, privateGitWrites(config, token))
  }
  const readViewsDefaults = useCallback(async () => {
    if (!config || !token) throw new Error('Connect Git storage first.')
    return trackRead(siblingConfig(config, viewsDefaultsPath), token)
  }, [config, token])
  async function writeViewsDefaults(text: string, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return queueText(siblingConfig(config, viewsDefaultsPath), token, text, commitMessage, mergeViewsDefaultsText)
  }
  async function writePersonalFeatureSetup(email: string, text: string, sha: string | null, commitMessage: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    const path = personalSetupPath(email)
    if (!path) throw new Error('Set your email on the Time Writing connection to keep your own Feature setup.')
    return trackWrite(siblingConfig(config, path), token, text, sha, commitMessage)
  }
  async function writeAccess(text: string, sha: string | null, commitMessage: string) {
    if (!accessConfig || !token) throw new Error('Connect Git storage first.')
    if (isSample) throw new Error('Synthetic sample data is loaded. Saving to Git is disabled.')
    return trackWrite(accessConfig, token, text, sha, commitMessage)
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
    // SET-17: My views stay on this computer: their data is never saved to Git.
    if (!config || !token || isSample || profile.mine) return
    const target = siblingConfig(config, `${snapshotFolder}/${snapshotFileName(profile.id)}`)
    try {
      if ((await writeCheck.current) === false) { note(profile.id, 'info', 'Not saved to Git: the Git token here is read-only.'); return }
      // An admin cleaned up the connections after this computer started (CON-88): its old views are not saved back.
      if (resetPending(parseViewsReset((await readTextFile(siblingConfig(config, viewsResetPath), token)).text))) { note(profile.id, 'info', 'Not saved to Git: your admin cleaned up the connections. Restart the app to take the new setup.'); return }
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
    const queryOf = (id: string) => loadAzureConnectionProfile(id)?.query
    const { applied, otherQuery } = applySnapshots(store.state.azureSources, usable, queryOf)
    store.update((draft) => { draft.azureSources = applySnapshots(draft.azureSources, usable, queryOf).sources; return draft })
    return { files: files.length, applied, added, failed, otherQuery }
  }

  // One on-prem view's data from Git (Load from Git, or the fallback when a fetch cannot run): null when Git has
  // none; the data here is replaced only by a newer fetch.
  async function pullSnapshot(connectionId: string) {
    if (!config || !token) throw new Error('Connect Git storage first.')
    const text = await readRawFile(siblingConfig(config, `${snapshotFolder}/${snapshotFileName(connectionId)}`), token)
    if (!text) return null
    const file = parseSnapshot(text)
    if (file.connection.id !== connectionId) throw new Error(`${snapshotFileName(connectionId)} in Git belongs to another view.`)
    const queryOf = (id: string) => loadAzureConnectionProfile(id)?.query
    const result = applySnapshots(store.state.azureSources, [file], queryOf)
    const applied = result.applied.length > 0
    if (applied) store.update((draft) => { draft.azureSources = applySnapshots(draft.azureSources, [file], queryOf).sources; return draft })
    return { applied, fetchedAt: file.source.fetchedAt, otherQuery: result.otherQuery.length > 0 }
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
  // The Location analysis of an export (windchillLocationsFile) to windchill-analysis/<export>-locations.json.
  async function pushWindchillAnalysis(viewId: string, text: string, message: string): Promise<string> {
    if (!config || !token) throw new Error('Connect Git storage (Admin → Data & sharing) first.')
    if (isSample) throw new Error('Not saved while the sample data is shown.')
    const target = siblingConfig(config, `${windchillAnalysisFolder}/${viewId}-locations.json`)
    const sha = await fileSha(target, token)
    await writeTextFile(target, token, text, sha, message)
    return target.path
  }
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

  return { listValidationDocuments, readValidationDocument, queueState, retryQueued, saveSnapshot, listSnapshots, readPersonalViews, writePersonalViews, readViewsDefaults, writeViewsDefaults, backupViews, resetViews, readPackTemplate, writePackTemplate, packTemplateHistory: config ? historyUrl(siblingConfig(config, packTemplateFile)) : '', config, connected, readOnly, status, message, dirty, commitUrl, history: config ? historyUrl(config) : '', isSample, load: () => load(), connect, remoteChanges, save, disconnect, viewsPath: viewsConfig?.path ?? '', viewsHistory: viewsConfig ? historyUrl(viewsConfig) : '', readViews, writeViews, shareViews, removedViews, syncViews, pushWindchillAnalysis, accessScope: accessConfig && token ? `${accessConfig.owner}/${accessConfig.repo}@${accessConfig.branch}:${accessConfig.path}` : '', accessPath: accessConfig?.path ?? '', accessHistory: accessConfig ? historyUrl(accessConfig) : '', readAccess, writeAccess, readFeatureSetup, writeFeatureSetup, readEpicSetup, writeEpicSetup, epicSetupHistory: config ? historyUrl(siblingConfig(config, 'epic-setup.json')) : '', readPersonalFeatureSetup, writePersonalFeatureSetup, featureSetupHistory: config ? historyUrl(siblingConfig(config, 'feature-setup.json')) : '', readQeMapping, writeQeMapping, readCustomStreams, writeCustomStreams, customStreamsHistory: config ? historyUrl(siblingConfig(config, customStreamsFile)) : '', readKpiTracker, writeKpiTracker, kpiTrackerHistory: config ? historyUrl(siblingConfig(config, kpiTrackerFile)) : '', readHistory, writeHistory, removeHistory, listWorkbooks, readWorkbook, historyFileHistory: config ? historyUrl(siblingConfig(config, historyPath)) : '', readMonthlyPack, writeMonthlyPack, monthlyPackHistory: (name: string) => config ? historyUrl(siblingConfig(config, name)) : '', qeMappingHistory: config ? historyUrl(siblingConfig(config, 'qe-mapping.json')) : '', listOnDemand, readOnDemand, writeOnDemand, removeOnDemand, readRowPage, saveRowPage, convertOnDemand, removeRowPageGit, listLocks, acquireLock, renewRowLock, releaseRowLock, lockFallback, readLockSettings, writeLockSettings, watchTick, rowLocksHistory: config ? historyUrl(siblingConfig(config, lockSettingsFile)) : '', readMenuLayout, writeMenuLayout, readDashboard, writeDashboard, removeDashboard, dashboardHistory: (id: string) => config ? historyUrl(siblingConfig(config, dashboardPath(id))) : '', menuLayoutHistory: config ? historyUrl(siblingConfig(config, menuLayoutFile)) : '', onDemandHistory: (id: string) => config ? historyUrl(siblingConfig(config, onDemandPath(id))) : '', removeSnapshots, viewsSync, snapshotNotes, pushSnapshot, pullSnapshot, pullSnapshots, pushWindchill, pullWindchill, pullWindchillOne, snapshotsHistory: config ? historyUrl(siblingConfig(config, snapshotFolder)) : '' }
}
export type GitStorage = ReturnType<typeof useGitStorage>
