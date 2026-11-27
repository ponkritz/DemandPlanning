import { useEffect, useRef } from 'react'
import { startMonthTaskStatesJob } from './closeChain'
import type { AzureWorkItem } from './domain'
import { monthTaskStatesBlocked, type MonthTaskStatesGuard, type StateStep } from './monthTaskStates'
import type { LockSettings } from './planningLock'

// ACT-26: the background check of the signed-in person's own Month Tasks (Month Task states, in Jobs done) — after
// every fetch of the Time Writing connection and whenever the items change (e.g. a Feature closed on My Tasks), each
// item and State tried once per page load, so a refused write is not retried in a loop. Not while
// monthTaskStatesBlocked gives a reason (sample, View as, no right, no PAT or work email, on-premises, not loaded).
export interface MonthTaskStatesEnv extends MonthTaskStatesGuard {
  items: AzureWorkItem[]
  locks: LockSettings
  onChanged: (changed: AzureWorkItem[]) => void
}
const stepKey = (step: StateStep) => `${step.item.key}:${step.to}`
export function useMonthTaskStates(env: MonthTaskStatesEnv) {
  const tried = useRef(new Set<string>())
  const latest = useRef(env)
  useEffect(() => { latest.current = env })
  const blocked = monthTaskStatesBlocked(env)
  useEffect(() => {
    if (blocked) return
    const { config, pat, items, email, locks } = latest.current
    if (!config) return
    startMonthTaskStatesJob({ config, pat, items, email: email.trim().toLowerCase(), locks, onChanged: (changed) => latest.current.onChanged(changed), filter: (step) => !tried.current.has(stepKey(step)), onPlanned: (steps) => { for (const step of steps) tried.current.add(stepKey(step)) } })
  }, [blocked, env.items, env.locks, env.fetched])
}
