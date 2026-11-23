import { useCallback, useEffect, useRef, useState } from 'react'
import type { OnDemandPage } from './onDemand'
import type { HeldLock } from './rowPageGit'
import { dropDraft, findDraft, keepDraft, minuteMs, pruneDrafts, type RowDraft, type RowLock } from './rowLocks'
import type { GitStorage } from './useGitStorage'

// OND-35…OND-38: the row locks of a row-file page in use — listed once when the page opens (one folder listing), again
// when the drawer opens a row and on the open-app check of GIT-18 (git.watchTick; no polling of their own) — and the
// lock of the row this window edits: taken on Edit, renewed while the person is active, released on Save, Cancel, close
// and timeout (and, best effort, when the page closes). Only for row-file pages; never with View as or a read-only token
// (the drawer's Edit is disabled then, so nothing here runs).
export interface RowLockApi {
  active: boolean
  locks: Record<string, HeldLock>
  error: string
  timeoutMs: number
  refresh: () => Promise<void>
  take: (rowKey: string) => Promise<{ ok: true } | { ok: false; holder: RowLock | null }>
  renew: (rowKey: string) => Promise<boolean>
  release: (rowKey: string, keepalive?: boolean) => Promise<void>
  releaseOther: (rowKey: string, held: HeldLock) => Promise<boolean>
  draft: { find: (rowKey: string) => RowDraft | null; keep: (rowKey: string, cells: RowDraft['cells'], base: RowDraft['base']) => void; drop: (rowKey: string) => void }
}
const session = Math.random().toString(36).slice(2, 12)
const storage = () => { try { return localStorage } catch { return null } }

export function useRowLocks(git: GitStorage, page: OnDemandPage | undefined, me: string, timeoutMinutes: number): RowLockApi {
  const active = Boolean(page?.storage === 'rows' && git.connected && !git.isSample)
  const pageId = page?.id ?? ''
  const [state, setState] = useState<{ page: string; locks: Record<string, HeldLock>; error: string }>({ page: '', locks: {}, error: '' })
  const gitRef = useRef(git)
  useEffect(() => { gitRef.current = git })
  // The lock this window holds, per row key (its version, to renew and release it).
  const mine = useRef<Record<string, HeldLock>>({})
  const timeoutMs = timeoutMinutes * minuteMs
  const refresh = useCallback(async () => {
    if (!active) return
    try { const locks = await gitRef.current.listLocks(pageId); setState({ page: pageId, locks, error: '' }) }
    catch (failure) { setState((current) => ({ ...current, page: pageId, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [active, pageId])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh, git.watchTick])
  // Drafts older than a day are deleted when a page with row locks opens.
  useEffect(() => { const store = storage(); if (active && store) pruneDrafts(store, Date.now()) }, [active])
  // Best effort: the locks this window holds are released when the page closes (the expiry covers a crash).
  useEffect(() => {
    if (!active) return
    const leave = () => { for (const [key, held] of Object.entries(mine.current)) void gitRef.current.releaseRowLock(pageId, key, held.sha, `Release the lock of ${key} of ${pageId} (page closed)`, true).catch(() => undefined) }
    window.addEventListener('pagehide', leave)
    return () => { window.removeEventListener('pagehide', leave) }
  }, [active, pageId])
  const who = { by: me, name: me, session }
  const draftKey = (rowKey: string) => ({ scope: git.accessScope, page: pageId, row: rowKey, by: me })
  return {
    active, timeoutMs, refresh,
    locks: state.page === pageId ? state.locks : {}, error: state.page === pageId ? state.error : '',
    take: async (rowKey) => {
      const result = await gitRef.current.acquireLock(pageId, rowKey, who, timeoutMs)
      if (result.ok) { mine.current[rowKey] = { lock: result.lock, sha: result.sha }; setState((current) => ({ ...current, locks: { ...current.locks, [rowKey]: { lock: result.lock, sha: result.sha } } })); return { ok: true } }
      if (result.lock) { const lock = result.lock; setState((current) => ({ ...current, locks: { ...current.locks, [rowKey]: { lock, sha: current.locks[rowKey]?.sha ?? '' } } })) }
      void refresh()
      return { ok: false, holder: result.lock }
    },
    renew: async (rowKey) => {
      const held = mine.current[rowKey]
      if (!held) return false
      const result = await gitRef.current.renewRowLock(pageId, rowKey, held, timeoutMs)
      if (result.ok) { mine.current[rowKey] = { lock: result.lock, sha: result.sha }; return true }
      delete mine.current[rowKey]; void refresh()
      return false
    },
    release: async (rowKey, keepalive = false) => {
      const held = mine.current[rowKey]
      if (!held) return
      delete mine.current[rowKey]
      setState((current) => { const locks = { ...current.locks }; delete locks[rowKey]; return { ...current, locks } })
      try { await gitRef.current.releaseRowLock(pageId, rowKey, held.sha, `Release the lock of ${rowKey} of ${pageId} (${me})`, keepalive) } catch { /* the expiry releases it */ }
    },
    releaseOther: async (rowKey, held) => {
      const done = await gitRef.current.releaseRowLock(pageId, rowKey, held.sha, `Release the lock of ${rowKey} of ${pageId} held by ${held.lock.by} (released by ${me})`)
      await refresh()
      return done
    },
    draft: {
      find: (rowKey) => { const store = storage(); return store ? findDraft(store, draftKey(rowKey), Date.now()) : null },
      keep: (rowKey, cells, base) => { const store = storage(); if (store) keepDraft(store, { ...draftKey(rowKey), at: new Date().toISOString(), cells, base }, Date.now()) },
      drop: (rowKey) => { const store = storage(); if (store) dropDraft(store, draftKey(rowKey), Date.now()) },
    },
  }
}
