import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GitQueueError } from './gitSaveQueue'
import { conqPage, onDemandPath, pageListChange, withoutHidden, parseOnDemandPage, serializeOnDemandPage, sortPages, type OnDemandPage } from './onDemand'
import { headOf, pageFolder, rowPageQueue } from './rowFiles'
import { SampleWriteError, samplePage } from './sampleRows'
import { defaultLockSettings, parseLockSettings, serializeLockSettings, type LockSettings } from './rowLocks'
import type { GitStorage } from './useGitStorage'
import { attachLists, resolveLists, type CatalogEntry } from './sharedLists'

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
// A page too large for the file (a row-file page of many rows, OND-31) is kept as last read when it fits, else not kept.
function remember(pages: OnDemandPage[]) { try { localStorage.setItem(cacheKey, JSON.stringify(pages.flatMap((page) => { try { return [serializeOnDemandPage(page, { fill: false })] } catch { return [] } }))) } catch { /* too large or blocked: this visit only */ } }

interface State { scope: string; pages: OnDemandPage[]; inGit: string[]; errors: string[]; loaded: boolean }
type Change = (page: OnDemandPage) => OnDemandPage
type Saved = { sha: string; commitUrl: string; merged: boolean; unchanged: boolean; keptNewer: boolean; text: string; page: OnDemandPage }
// saving: on its way; queued: kept in the GIT-17 queue after the retries (its Retry); failed: not queued (Retry, Discard).
interface Kept { id: number; label: string; message: string; change: Change; state: 'saving' | 'queued' | 'failed'; error: string }
let keptIds = 0
const without = <T,>(record: Record<string, T>, id: string) => { const next = { ...record }; delete next[id]; return next }
const messageOf = (failure: unknown) => failure instanceof Error ? failure.message : String(failure)

// OND-63…OND-66: isSample(id) — the viewer looks at the page in Sample (useDataMode): every list of pages given out here
// (pages, full, stored: the Data tab, the Insights and the dashboards) has the page with its sample rows, and every save
// of that page is refused (SampleWriteError) before anything is sent to Git.
// LST-08, LST-09: lists — the built-in lists in use: every page given out shows its built-in list columns with the lists'
// items (renamed people by their key); a change is made on the page from Git with only the items attached, so a save
// writes what was changed and nothing the lists changed meanwhile.
export function useOnDemand(git: GitStorage, isSample: (id: string) => boolean = () => false, lists: CatalogEntry[] = []) {
  const catalog = useMemo(() => new Map(lists.map((entry) => [entry.ref, entry])), [lists])
  const scope = git.accessScope
  const { listOnDemand, readOnDemand, readRowPage, readLockSettings } = git
  // OND-36: the inactivity timeout of row locks (row-locks.json), read with the pages.
  const [lockSettings, setLockSettings] = useState<LockSettings>(defaultLockSettings)
  // OND-31: a page read from its file or, converted, from its folder of row files.
  const readPage = useCallback(async (id: string, rows: boolean): Promise<OnDemandPage | null> => {
    if (rows) { const page = await readRowPage(id); if (page) return page }
    const read = await readOnDemand(id)
    return read.text == null ? null : parseOnDemandPage(read.text, id)
  }, [readRowPage, readOnDemand])
  const [state, setState] = useState<State>(() => { const pages = cached(); return { scope: '', pages: pages ?? [], inGit: pages?.map((page) => page.id) ?? [], errors: [], loaded: false } })
  // OND-28: changes whose save failed before it was queued, per page, applied in order on top of the page from Git.
  const [kept, setKept] = useState<Record<string, Kept[]>>({})
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const ids = await listOnDemand()
      const pages: OnDemandPage[] = [], errors: string[] = []
      for (const { id, rows } of ids) {
        try { const page = await readPage(id, rows); if (page) pages.push(page) }
        catch (failure) { errors.push(`${rows ? `${pageFolder(id)}/` : onDemandPath(id)}: ${messageOf(failure)}`) }
      }
      try { setLockSettings(parseLockSettings((await readLockSettings()).text)) } catch { /* the timeout as before */ }
      if (!errors.length) remember(pages)
      setState({ scope, pages: sortPages(pages), inGit: pages.map((page) => page.id), errors, loaded: true })
    } catch (failure) { setState((current) => ({ ...current, scope, loaded: true, errors: [messageOf(failure)] })) }
  }, [scope, listOnDemand, readPage, readLockSettings])
  // GIT-18: one page read again from Git (Load the newer data on its notice) — the others stay as they are; a page
  // removed in Git leaves the list.
  const loadPage = useCallback(async (id: string) => {
    if (!scope) return
    // A page converted meanwhile (its file now the marker) is read from its folder.
    const page = await readRowPage(id) ?? await readPage(id, false)
    setState((current) => {
      const list = sortPages([...current.pages.filter((entry) => entry.id !== id), ...(page ? [page] : [])])
      remember(list)
      return { ...current, scope, pages: list, inGit: page ? [...new Set([...current.inGit, id])] : current.inGit.filter((entry) => entry !== id), loaded: true }
    })
    return page
  }, [scope, readRowPage, readPage])
  // GIT-21: the pages added or deleted by someone else since the folder was read — only pages not known here are read
  // (the others stay as they are); a deleted page leaves the list unless keep(id) (the page in use with unsaved edits).
  const known = useRef<string[]>([])
  useEffect(() => { known.current = state.inGit })
  const loadNew = useCallback(async (keep: (id: string) => boolean = () => false) => {
    if (!scope) return { added: [] as string[], removed: [] as string[] }
    const change = pageListChange(known.current, await listOnDemand(), keep)
    const added: OnDemandPage[] = []
    for (const { id, rows } of change.read) {
      try { const page = await readPage(id, rows); if (page) added.push(page) } catch { /* read with ↻ Reload from Git, which names the error */ }
    }
    const removed = change.dropped
    if (!added.length && !removed.length) return { added: [], removed: [] }
    setState((current) => {
      const list = sortPages([...current.pages.filter((page) => !removed.includes(page.id) && !added.some((entry) => entry.id === page.id)), ...added])
      remember(list)
      return { ...current, pages: list, inGit: [...new Set([...current.inGit.filter((id) => !removed.includes(id)), ...added.map((page) => page.id)])] }
    })
    return { added: added.map((page) => page.id), removed }
  }, [scope, listOnDemand, readPage])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope

  // CoNQ while there is no page yet (in Git, or last read here); every page with its pending changes applied.
  const saved = state.pages.length ? state.pages : [conqPage()]
  // The pages as last read from or saved to Git, also between a save and the next render: a change is built from them.
  const stored = useRef(saved)
  useEffect(() => { stored.current = saved })
  const apply = (page: OnDemandPage) => (kept[page.id] ?? []).reduce((current, entry) => { try { return entry.change(current) } catch { return current } }, page)
  // OND-39: everyone gets the pages without their hidden rows (table, Insights, exports, dashboards); the table page
  // asks for the full page (full) to list them with Show hidden rows.
  const shown = (page: OnDemandPage) => isSample(page.id) ? samplePage(page) : page
  const allPages = sortPages(saved.map(apply)).map(shown).map((page) => resolveLists(page, catalog))
  const pages = allPages.map(withoutHidden)
  const refuse = (id: string) => { if (isSample(id)) throw new SampleWriteError(stored.current.find((page) => page.id === id)?.name ?? id) }
  const put = (page: OnDemandPage) => {
    stored.current = sortPages([...stored.current.filter((entry) => entry.id !== page.id), page])
    setState((current) => { const list = sortPages([...current.pages.filter((entry) => entry.id !== page.id), page]); remember(list); return { ...current, pages: list, inGit: [...new Set([...current.inGit, page.id])] } })
  }

  // Save to Git (queued, merged): the page as saved — merged with what others saved meanwhile — becomes the page shown.
  async function save(page: OnDemandPage, message: string): Promise<Saved> {
    refuse(page.id)
    // OND-33: a row-file page saves its name and description (page.json) — never its rows from this copy.
    const known = stored.current.find((entry) => entry.id === page.id)
    if (known?.storage === 'rows') return update(page.id, (base) => ({ ...base, ...headOf(page), colors: page.colors }), message)
    const result = await git.writeOnDemand(page.id, serializeOnDemandPage(page), message || `On-Demand ${page.name}: update`)
    const merged = parseOnDemandPage(result.text, page.id)
    put(merged)
    return { ...result, page: merged }
  }
  // OND-28: one change saved at once — applied to the page as last read from or saved to Git (never on top of a pending
  // change). keep (a label): the change is shown applied while it is saved and kept when its save fails.
  async function update(id: string, change: Change, message: string, { keep = '' }: { keep?: string } = {}): Promise<Saved> {
    refuse(id)
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
    const withLists: Change = (page) => change(attachLists(page, catalog))
    try { const saved = base.storage === 'rows' ? await saveRows(base, withLists, message) : await save(withLists(base), message); if (keep) mark(null); return saved }
    catch (failure) { if (keep) mark(failure instanceof GitQueueError ? 'queued' : 'failed', messageOf(failure)); throw failure }
  }
  // OND-33: a row-file page's change written as its files (git.saveRowPage); the page read again becomes the page shown.
  async function saveRows(base: OnDemandPage, change: Change, message: string): Promise<Saved> {
    const result = await git.saveRowPage(base.id, base, change, message || `On-Demand ${base.name}: update`)
    put(result.page)
    return { ...result, sha: result.sha ?? '', text: '' }
  }
  const isRows = (id: string) => stored.current.find((page) => page.id === id)?.storage === 'rows'
  const queueKey = (id: string) => isRows(id) ? rowPageQueue(id) : onDemandPath(id)
  // Retry: the saves of the page kept in the GIT-17 queue, then its pending changes, each applied to the latest page.
  async function retry(id: string) {
    refuse(id)
    const results = await git.retryQueued(queueKey(id)) as ({ text?: string; page?: OnDemandPage } | undefined)[]
    const last = [...results].reverse().find((result) => typeof result?.text === 'string' || result?.page)
    if (last?.page) put(last.page)
    else if (last?.text) put(parseOnDemandPage(last.text, id))
    let failed = results.some((result) => result === undefined)
    const pending = (kept[id] ?? []).filter((entry) => entry.state === 'failed')
    setKept((current) => { const list = (current[id] ?? []).filter((entry) => entry.state === 'saving' || (entry.state === 'queued' && failed)); return list.length ? { ...current, [id]: list } : without(current, id) })
    for (const entry of pending) { try { await update(id, entry.change, entry.message, { keep: entry.label }) } catch { failed = true } }
    if (failed) throw new Error('The save failed again; the change is kept: choose Retry.')
  }
  async function remove(id: string, message: string) {
    refuse(id)
    if (state.inGit.includes(id)) { if (isRows(id)) await git.removeRowPageGit(id, message); else await git.removeOnDemand(id, message) }
    setKept((current) => without(current, id))
    setState((current) => { const list = current.pages.filter((page) => page.id !== id); remember(list); return { ...current, pages: list, inGit: current.inGit.filter((entry) => entry !== id) } })
  }
  return {
    pages, save, update, retry, remove, reload: load, reloadPage: loadPage, loadNew,
    // OND-32: Convert to row files (Tool Owner) — one commit; the page shown is read from its folder.
    convert: async (id: string) => { refuse(id); const result = await git.convertOnDemand(id); put(result.page); return result },
    // OND-36: the inactivity timeout, and its change (Admin, Tool Owner).
    lockSettings, saveLockSettings: async (next: LockSettings, message: string) => { const result = await git.writeLockSettings(serializeLockSettings(next), message); setLockSettings(parseLockSettings(result.text)); return result },
    reloadLockSettings: async () => setLockSettings(parseLockSettings((await readLockSettings()).text)),
    full: (id: string) => allPages.find((page) => page.id === id) ?? null,
    stored: (id: string) => { const found = saved.find((page) => page.id === id); return found ? attachLists(shown(found), catalog) : null },
    isSample,
    // OND-28: the pending changes of a page (saves that failed before they were queued), and Discard.
    pending: (id: string) => (kept[id] ?? []).filter((entry) => entry.state === 'failed').map(({ label, error }) => ({ label, error })),
    discard: (id: string) => setKept((current) => { const list = (current[id] ?? []).filter((entry) => entry.state !== 'failed'); return list.length ? { ...current, [id]: list } : without(current, id) }),
    inGit: (id: string) => state.inGit.includes(id),
    loaded: fresh && state.loaded, errors: fresh ? state.errors : [],
    history: (id: string) => isRows(id) ? git.onDemandHistory(id).replace(/\.json$/, '') : git.onDemandHistory(id),
    queue: (id: string) => git.queueState(queueKey(id)),
  }
}
export type OnDemandStore = ReturnType<typeof useOnDemand>
