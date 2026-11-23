import { useEffect, useRef, useState } from 'react'
import type { AppState, AuditEvent } from './domain'
import { seedState } from './seed'
import { loadBrowserState, indexedStateRepository, createStateWriter, validateBackup } from './browserState'

// The app data is kept in this browser (IndexedDB). What the team shares lives in the Git data repository (Git storage);
// the SharePoint central storage is in the backlog (it was not functional).
export function useAppStore() {
  const [state, setState] = useState<AppState>(() => structuredClone(seedState))
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [cache, setCache] = useState<{ status: 'loading' | 'saving' | 'saved' | 'error'; message: string }>({ status: 'loading', message: 'Opening browser database…' })
  const writer = useRef(createStateWriter(indexedStateRepository()))
  const pendingSave = useRef(false)

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

  function update(mutator: (draft: AppState) => AppState) {
    setState((current) => mutator(structuredClone(current)))
  }

  function addAudit(event: Omit<AuditEvent, 'id' | 'timestamp'>) {
    update((draft) => {
      draft.audits.unshift({ ...event, id: crypto.randomUUID(), timestamp: new Date().toISOString() })
      return draft
    })
  }

  // OI-09: the reset is recorded in the History of the new state (who reset it and when).
  function reset() {
    const next = structuredClone(seedState)
    next.audits.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor: 'u-owner', action: 'Reset', entity: 'Planning data', entityId: 'all', detail: 'Planning data reset to the synthetic MVP data in this browser' })
    setState(next)
  }

  function restoreBackup(value: unknown) {
    setState(structuredClone(validateBackup(value)))
  }

  return { state, setState, update, addAudit, reset, ready, loadError, cache, retryLoad: () => { setLoadError(''); setLoadAttempt((value) => value + 1) }, retrySave: () => setSaveAttempt((value) => value + 1), restoreBackup, hasPendingSave: () => pendingSave.current }
}

function friendlyError(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Unknown error.'
}
