import { useCallback, useEffect, useState } from 'react'
import { conqPage, onDemandPath, parseOnDemandPage, serializeOnDemandPage, sortPages, type OnDemandPage } from './onDemand'
import type { GitStorage } from './useGitStorage'

// OND-02, OND-08: the On-Demand pages from Git (one file each in on-demand/), read when Git is connected; the pages last
// read are kept in this browser so the menu and the pages show while Git is not connected. While the folder holds no
// page, CoNQ is offered (not yet in Git: its first Save to Git creates it). Unsaved changes are drafts per page, kept
// while the viewer moves between pages, until Save to Git or Discard.
const cacheKey = 'demand-planning-on-demand-v1'
function cached(): OnDemandPage[] | null {
  try { const list = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as unknown; return Array.isArray(list) ? list.flatMap((text) => { try { return typeof text === 'string' ? [parseOnDemandPage(text)] : [] } catch { return [] } }) : null } catch { return null }
}
function remember(pages: OnDemandPage[]) { try { localStorage.setItem(cacheKey, JSON.stringify(pages.map((page) => serializeOnDemandPage(page, { fill: false })))) } catch { /* too large or blocked: this visit only */ } }

interface State { scope: string; pages: OnDemandPage[]; inGit: string[]; errors: string[]; loaded: boolean }

export function useOnDemand(git: GitStorage) {
  const scope = git.accessScope
  const { listOnDemand, readOnDemand } = git
  const [state, setState] = useState<State>(() => { const pages = cached(); return { scope: '', pages: pages ?? [], inGit: pages?.map((page) => page.id) ?? [], errors: [], loaded: false } })
  const [drafts, setDrafts] = useState<Record<string, OnDemandPage>>({})
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const ids = await listOnDemand()
      const pages: OnDemandPage[] = [], errors: string[] = []
      for (const id of ids) {
        try { const read = await readOnDemand(id); if (read.text != null) pages.push(parseOnDemandPage(read.text, id)) }
        catch (failure) { errors.push(`${onDemandPath(id)}: ${failure instanceof Error ? failure.message : String(failure)}`) }
      }
      if (!errors.length) remember(pages)
      setState({ scope, pages: sortPages(pages), inGit: pages.map((page) => page.id), errors, loaded: true })
    } catch (failure) { setState((current) => ({ ...current, scope, loaded: true, errors: [failure instanceof Error ? failure.message : String(failure)] })) }
  }, [scope, listOnDemand, readOnDemand])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope

  // CoNQ while there is no page yet (in Git, or last read here); every page with its draft applied.
  const saved = state.pages.length ? state.pages : [conqPage()]
  const pages = sortPages([...saved.map((page) => drafts[page.id] ?? page), ...Object.values(drafts).filter((draft) => !saved.some((page) => page.id === draft.id))])
  const setDraft = (id: string, page: OnDemandPage | null) => setDrafts((current) => { const next = { ...current }; if (page) next[id] = page; else delete next[id]; return next })
  const put = (page: OnDemandPage) => setState((current) => { const list = sortPages([...current.pages.filter((entry) => entry.id !== page.id), page]); remember(list); return { ...current, pages: list, inGit: [...new Set([...current.inGit, page.id])] } })

  // Save to Git (queued, merged): the page as saved — merged with what others saved meanwhile — replaces the draft.
  async function save(page: OnDemandPage, message: string) {
    const result = await git.writeOnDemand(page.id, serializeOnDemandPage(page), message || `On-Demand ${page.name}: update`)
    const merged = parseOnDemandPage(result.text, page.id)
    put(merged); setDraft(page.id, null)
    return { ...result, page: merged }
  }
  async function remove(id: string, message: string) {
    if (state.inGit.includes(id)) await git.removeOnDemand(id, message)
    setDraft(id, null)
    setState((current) => { const list = current.pages.filter((page) => page.id !== id); remember(list); return { ...current, pages: list, inGit: current.inGit.filter((entry) => entry !== id) } })
  }
  return {
    pages, drafts, setDraft, save, remove, reload: load,
    stored: (id: string) => saved.find((page) => page.id === id) ?? null,
    inGit: (id: string) => state.inGit.includes(id),
    loaded: fresh && state.loaded, errors: fresh ? state.errors : [],
    history: git.onDemandHistory,
    queue: (id: string) => git.queueState(onDemandPath(id)),
    retry: (id: string) => git.retryQueued(onDemandPath(id)),
  }
}
export type OnDemandStore = ReturnType<typeof useOnDemand>
