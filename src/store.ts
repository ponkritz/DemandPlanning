import { useEffect, useRef, useState } from 'react'
import type { AppState, AuditEvent } from './domain'
import { seedState } from './seed'
import { SharePointStateClient, defaultSharePointConfig, type SharePointConfig } from './sharepoint'

const STORAGE_KEY = 'demand-planning-mvp-v1'
const CONFIG_KEY = 'demand-planning-sharepoint-config-v1'

export interface ConnectionState {
  mode: 'local' | 'sharepoint' | 'empty'
  status: 'idle' | 'connecting' | 'synced' | 'saving' | 'error' | 'conflict'
  account?: string
  siteId?: string
  message?: string
}

function loadState(): AppState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as AppState
  } catch {
    // A damaged development cache falls back to safe synthetic seed data.
  }
  return structuredClone(seedState)
}

export function useAppStore() {
  const [state, setState] = useState<AppState>(loadState)
  const [connection, setConnection] = useState<ConnectionState>({ mode: 'local', status: 'idle', message: 'Data is stored only in this browser.' })
  const client = useRef<SharePointStateClient | null>(null)
  const etag = useRef<string | null>(null)
  const skipNextSave = useRef(false)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    if (connection.mode !== 'sharepoint' || !client.current) return
    if (skipNextSave.current) { skipNextSave.current = false; return }
    const timer = window.setTimeout(async () => {
      setConnection((current) => ({ ...current, status: 'saving', message: 'Saving changes to SharePoint…' }))
      try {
        etag.current = await client.current!.save(state, etag.current)
        setConnection((current) => ({ ...current, status: 'synced', message: `Saved to SharePoint at ${new Date().toLocaleTimeString()}.` }))
      } catch (error) {
        const conflict = error instanceof Error && error.message === 'SYNC_CONFLICT'
        setConnection((current) => ({ ...current, status: conflict ? 'conflict' : 'error', message: conflict ? 'Another user updated the central data. Pull the latest version before editing again.' : friendlyError(error) }))
      }
    }, 900)
    return () => window.clearTimeout(timer)
  }, [state, connection.mode])

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

  return { state, setState, update, addAudit, reset, connection, connectSharePoint, initializeSharePoint, pullSharePoint, disconnectSharePoint, getSavedSharePointConfig }
}

function friendlyError(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unable to connect to SharePoint.'
}
