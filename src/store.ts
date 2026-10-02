import { useEffect, useState } from 'react'
import type { AppState, AuditEvent } from './domain'
import { seedState } from './seed'

const STORAGE_KEY = 'demand-planning-mvp-v1'

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

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

  return { state, setState, update, addAudit, reset }
}
