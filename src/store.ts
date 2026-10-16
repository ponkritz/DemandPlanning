import { useEffect, useRef, useState } from 'react'
import type { AppState, AuditEvent } from './domain'
import { seedState } from './seed'
import { SharePointStateClient, defaultSharePointConfig, type SharePointConfig } from './sharepoint'
import { loadBrowserState, indexedStateRepository, createStateWriter, validateBackup } from './browserState'

const CONFIG_KEY = 'demand-planning-sharepoint-config-v1'

export interface ConnectionState {
  mode: 'local' | 'sharepoint' | 'empty'
  status: 'idle' | 'connecting' | 'synced' | 'saving' | 'error' | 'conflict'
  account?: string
  siteId?: string
  message?: string
}

export function useAppStore() {
  const [state, setState] = useState<AppState>(() => structuredClone(seedState))
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [cache, setCache] = useState<{ status: 'loading' | 'saving' | 'saved' | 'error'; message: string }>({ status: 'loading', message: 'Opening browser database…' })
  const writer = useRef(createStateWriter(indexedStateRepository()))
  const pendingSave = useRef(false)
  const pendingRemoteSave = useRef(false)
  const [connection, setConnection] = useState<ConnectionState>({ mode: 'local', status: 'idle', message: 'Data is stored only in this browser.' })
  const client = useRef<SharePointStateClient | null>(null)
  const etag = useRef<string | null>(null)
  const skipNextSave = useRef(false)

  useEffect(() => {
    let active = true
    void loadBrowserState(indexedStateRepository(), { getItem: (key) => localStorage.getItem(key) }, seedState).then((loaded) => {
      if (!active) return
      setState(loaded.state); setReady(true); setLoadError('')
      setCache({ status: 'saved', message: loaded.source === 'migrated' ? 'Existing saved data migrated to IndexedDB. The old localStorage copy was retained.' : 'Browser database loaded.' })
    }).catch((error: unknown) => { if (active) setLoadError(`Saved data could not be loaded. Nothing was overwritten. ${friendlyError(error)}`) })
    return () => { active = false }
  }, [loadAttempt])

  useEffect(() => {
    if (!ready) return
    let active = true
    pendingSave.current = true
    const timer = window.setTimeout(() => {
      setCache({ status: 'saving', message: 'Saving to browser database…' })
      void writer.current(state).then(() => {
        if (active) { pendingSave.current = false; setCache({ status: 'saved', message: `Saved in this browser at ${new Date().toLocaleTimeString()}.` }) }
      }).catch(() => {
        if (active) setCache({ status: 'error', message: 'Browser database save failed. Current changes are in memory only; the last committed data is unchanged. Export a JSON backup before closing, then retry saving. Check available disk space or browser storage policies.' })
      })
    }, 200)
    return () => { active = false; window.clearTimeout(timer) }
  }, [state, ready, saveAttempt])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (pendingSave.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useEffect(() => {
    if (!ready) return
    if (connection.mode !== 'sharepoint' || !client.current) return
    if (skipNextSave.current) { skipNextSave.current = false; pendingRemoteSave.current = false; return }
    let active = true
    pendingRemoteSave.current = true
    const timer = window.setTimeout(async () => {
      setConnection((current) => ({ ...current, status: 'saving', message: 'Saving changes to SharePoint…' }))
      try {
        etag.current = await client.current!.save(state, etag.current)
        if (active) { pendingRemoteSave.current = false; setConnection((current) => ({ ...current, status: 'synced', message: `Saved to SharePoint at ${new Date().toLocaleTimeString()}.` })) }
      } catch (error) {
        const conflict = error instanceof Error && error.message === 'SYNC_CONFLICT'
        if (active) setConnection((current) => ({ ...current, status: conflict ? 'conflict' : 'error', message: conflict ? 'Another user updated the central data. Pull the latest version before editing again.' : friendlyError(error) }))
      }
    }, 900)
    return () => { active = false; window.clearTimeout(timer) }
  }, [state, ready, connection.mode])

  function update(mutator: (draft: AppState) => AppState) {
    setState((current) => mutator(structuredClone(current)))
  }

  function addAudit(event: Omit<AuditEvent, 'id' | 'timestamp'>) {
    update((draft) => {
      draft.audits.unshift({ ...event, id: crypto.randomUUID(), timestamp: new Date().toISOString() })
      return draft
    })
  }

  function reset() {
    setState(structuredClone(seedState))
  }

  async function connectSharePoint(config: SharePointConfig) {
    if (!config.clientId.trim()) throw new Error('Application (client) ID is required.')
    setConnection({ mode: 'local', status: 'connecting', message: 'Opening Microsoft sign-in…' })
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
      const nextClient = new SharePointStateClient(config)
      const remote = await nextClient.connect()
      client.current = nextClient
      etag.current = remote.etag
      if (!remote.state) {
        setConnection({ mode: 'empty', status: 'idle', account: remote.account.username, siteId: remote.siteId, message: 'Connected. No central data file exists yet; an Owner must initialize it.' })
        return
      }
      skipNextSave.current = true
      setState(remote.state)
      setConnection({ mode: 'sharepoint', status: 'synced', account: remote.account.username, siteId: remote.siteId, message: 'Live SharePoint data loaded.' })
    } catch (error) {
      setConnection({ mode: 'local', status: 'error', message: friendlyError(error) })
      throw error
    }
  }

  async function initializeSharePoint() {
    if (!client.current) throw new Error('Connect to SharePoint first.')
    etag.current = await client.current.save(state, null)
    setConnection((current) => ({ ...current, mode: 'sharepoint', status: 'synced', message: 'Central SharePoint data initialized.' }))
  }

  async function pullSharePoint() {
    if (!client.current) throw new Error('Connect to SharePoint first.')
    const remote = await client.current.load()
    if (!remote.state) throw new Error('No central SharePoint data exists.')
    etag.current = remote.etag
    skipNextSave.current = true
    setState(remote.state)
    setConnection((current) => ({ ...current, mode: 'sharepoint', status: 'synced', message: 'Latest SharePoint data loaded.' }))
  }

  function disconnectSharePoint() {
    client.current = null; etag.current = null
    setConnection({ mode: 'local', status: 'idle', message: 'Disconnected. Changes now stay in this browser.' })
  }

  function getSavedSharePointConfig(): SharePointConfig {
    try { return { ...defaultSharePointConfig, ...JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') } }
    catch { return defaultSharePointConfig }
  }

  function restoreBackup(value: unknown) {
    if (connection.mode !== 'local') throw new Error('Disconnect SharePoint before restoring a local backup. No central data was changed.')
    setState(structuredClone(validateBackup(value)))
  }

  return { state, setState, update, addAudit, reset, connection, connectSharePoint, initializeSharePoint, pullSharePoint, disconnectSharePoint, getSavedSharePointConfig, ready, loadError, cache, retryLoad: () => { setLoadError(''); setLoadAttempt((value) => value + 1) }, retrySave: () => setSaveAttempt((value) => value + 1), restoreBackup, hasPendingSave: () => pendingSave.current || (connection.mode === 'sharepoint' && pendingRemoteSave.current) }
}

function friendlyError(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unable to connect to SharePoint.'
}
