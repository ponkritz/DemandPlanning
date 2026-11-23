import { useCallback, useEffect, useRef, useState } from 'react'
import { GitQueueError } from './gitSaveQueue'
import { conqPage, onDemandPath, parseOnDemandPage, serializeOnDemandPage, sortPages, type OnDemandPage } from './onDemand'
import type { GitStorage } from './useGitStorage'

// OND-02, OND-08: the On-Demand pages from Git (one file each in on-demand/), read when Git is connected; the pages last
// read are kept in this browser so the menu and the pages show while Git is not connected. While the folder holds no
// page, CoNQ is offered (not yet in Git: its first save creates it).
// OND-09, OND-28: every change is saved to Git at once, as a change of the page as last read from or saved to Git (a row
// added, changed or removed, the columns, the name, the insights), through the queued, merged save of GIT-17. A save
// that could not be written stays in the GIT-17 queue (Retry). A change made outside a form that waits for its save (an
// insight) is shown applied while it is saved; when its save fails before it was queued (e.g. no network) it is kept
// here as a pending change of the page — still shown, with Retry and Discard — so nothing is lost.
// Builds before this one kept unsaved changes in memory only, never in the browser's storage: nothing to migrate.
const cacheKey = 'demand-planning-on-demand-v1'
function cached(): OnDemandPage[] | null {
  try { const list = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as unknown; return Array.isArray(list) ? list.flatMap((text) => { try { return typeof text === 'string' ? [parseOnDemandPage(text)] : [] } catch { return [] } }) : null } catch { return null }
}
function remember(pages: OnDemandPage[]) { try { localStorage.setItem(cacheKey, JSON.stringify(pages.map((page) => serializeOnDemandPage(page, { fill: false })))) } catch { /* too large or blocked: this visit only */ } }

interface State { scope: string; pages: OnDemandPage[]; inGit: string[]; errors: string[]; loaded: boolean }
type Change = (page: OnDemandPage) => OnDemandPage
// saving: on its way; queued: kept in the GIT-17 queue after the retries (its Retry); failed: not queued (Retry, Discard).
interface Kept { id: number; label: string; message: string; change: Change; state: 'saving' | 'queued' | 'failed'; error: string }
let keptIds = 0
const without = <T,>(record: Record<string, T>, id: string) => { const next = { ...record }; delete next[id]; return next }
const messageOf = (failure: unknown) => failure instanceof Error ? failure.message : String(failure)

export function useOnDemand(git: GitStorage) {
  const scope = git.accessScope
  const { listOnDemand, readOnDemand } = git
  const [state, setState] = useState<State>(() => { const pages = cached(); return { scope: '', pages: pages ?? [], inGit: pages?.map((page) => page.id) ?? [], errors: [], loaded: false } })
  // OND-28: changes whose save failed before it was queued, per page, applied in order on top of the page from Git.
  const [kept, setKept] = useState<Record<string, Kept[]>>({})
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const ids = await listOnDemand()
      const pages: OnDemandPage[] = [], errors: string[] = []
      for (const id of ids) {
        try { const read = await readOnDemand(id); if (read.text != null) pages.push(parseOnDemandPage(read.text, id)) }
        catch (failure) { errors.push(`${onDemandPath(id)}: ${messageOf(failure)}`) }
      }
      if (!errors.length) remember(pages)
      setState({ scope, pages: sortPages(pages), inGit: pages.map((page) => page.id), errors, loaded: true })
    } catch (failure) { setState((current) => ({ ...current, scope, loaded: true, errors: [messageOf(failure)] })) }
  }, [scope, listOnDemand, readOnDemand])
  // GIT-18: one page read again from Git (Load the newer data on its notice) — the others stay as they are; a page
  // removed in Git leaves the list.
  const loadPage = useCallback(async (id: string) => {
    if (!scope) return
    const read = await readOnDemand(id)
    const page = read.text == null ? null : parseOnDemandPage(read.text, id)
    setState((current) => {
      const list = sortPages([...current.pages.filter((entry) => entry.id !== id), ...(page ? [page] : [])])
      remember(list)
      return { ...current, scope, pages: list, inGit: page ? [...new Set([...current.inGit, id])] : current.inGit.filter((entry) => entry !== id), loaded: true }
    })
  }, [scope, readOnDemand])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope

  // CoNQ while there is no page yet (in Git, or last read here); every page with its pending changes applied.
  const saved = state.pages.length ? state.pages : [conqPage()]
  // The pages as last read from or saved to Git, also between a save and the next render: a change is built from them.
  const stored = useRef(saved)
  useEffect(() => { stored.current = saved })
  const apply = (page: OnDemandPage) => (kept[page.id] ?? []).reduce((current, entry) => { try { return entry.change(current) } catch { return current } }, page)
  const pages = sortPages(saved.map(apply))
  const put = (page: OnDemandPage) => {
    stored.current = sortPages([...stored.current.filter((entry) => entry.id !== page.id), page])
    setState((current) => { const list = sortPages([...current.pages.filter((entry) => entry.id !== page.id), page]); remember(list); return { ...current, pages: list, inGit: [...new Set([...current.inGit, page.id])] } })
  }

  // Save to Git (queued, merged): the page as saved — merged with what others saved meanwhile — becomes the page shown.
  async function save(page: OnDemandPage, message: string) {
    const result = await git.writeOnDemand(page.id, serializeOnDemandPage(page), message || `On-Demand ${page.name}: update`)
    const merged = parseOnDemandPage(result.text, page.id)
    put(merged)
    return { ...result, page: merged }
  }
  // OND-28: one change saved at once — applied to the page as last read from or saved to Git (never on top of a pending
  // change). keep (a label): the change is shown applied while it is saved and kept when its save fails.
  async function update(id: string, change: Change, message: string, { keep = '' }: { keep?: string } = {}) {
    const base = stored.current.find((page) => page.id === id) ?? conqPage()
    const entry = keptIds++
    const mark = (state: Kept['state'] | null, error = '') => setKept((current) => {
      const list = current[id] ?? []
      const next = !state ? list.filter((item) => item.id !== entry)
        : list.some((item) => item.id === entry) ? list.map((item) => item.id === entry ? { ...item, state, error } : item)
        : [...list, { id: entry, label: keep, message, change, state, error }]
      return next.length ? { ...current, [id]: next } : without(current, id)
    })
    if (keep) mark('saving')
    try { const saved = await save(change(base), message); if (keep) mark(null); return saved }
    catch (failure) { if (keep) mark(failure instanceof GitQueueError ? 'queued' : 'failed', messageOf(failure)); throw failure }
  }
  // Retry: the saves of the page kept in the GIT-17 queue, then its pending changes, each applied to the latest page.
  async function retry(id: string) {
    const results = await git.retryQueued(onDemandPath(id)) as ({ text?: string } | undefined)[]
    const last = [...results].reverse().find((result) => typeof result?.text === 'string')
    if (last?.text) put(parseOnDemandPage(last.text, id))
    let failed = results.some((result) => result === undefined)
    const pending = (kept[id] ?? []).filter((entry) => entry.state === 'failed')
    setKept((current) => { const list = (current[id] ?? []).filter((entry) => entry.state === 'saving' || (entry.state === 'queued' && failed)); return list.length ? { ...current, [id]: list } : without(current, id) })
    for (const entry of pending) { try { await update(id, entry.change, entry.message, { keep: entry.label }) } catch { failed = true } }
    if (failed) throw new Error('The save failed again; the change is kept: choose Retry.')
  }
  async function remove(id: string, message: string) {
    if (state.inGit.includes(id)) await git.removeOnDemand(id, message)
    setKept((current) => without(current, id))
    setState((current) => { const list = current.pages.filter((page) => page.id !== id); remember(list); return { ...current, pages: list, inGit: current.inGit.filter((entry) => entry !== id) } })
  }
  return {
    pages, save, update, retry, remove, reload: load, reloadPage: loadPage,
    stored: (id: string) => saved.find((page) => page.id === id) ?? null,
    // OND-28: the pending changes of a page (saves that failed before they were queued), and Discard.
    pending: (id: string) => (kept[id] ?? []).filter((entry) => entry.state === 'failed').map(({ label, error }) => ({ label, error })),
    discard: (id: string) => setKept((current) => { const list = (current[id] ?? []).filter((entry) => entry.state !== 'failed'); return list.length ? { ...current, [id]: list } : without(current, id) }),
    inGit: (id: string) => state.inGit.includes(id),
    loaded: fresh && state.loaded, errors: fresh ? state.errors : [],
    history: git.onDemandHistory,
    queue: (id: string) => git.queueState(onDemandPath(id)),
  }
}
export type OnDemandStore = ReturnType<typeof useOnDemand>
