import { useCallback, useEffect, useState } from 'react'
import { recordJob } from './backgroundJobs'
import { outcomeText } from './gitSaveQueue'
import { addGroup, emptyLayout, findGroup, kindLabel, menuLayoutFile, parseMenuLayout, placePage, serializeMenuLayout, type MenuLayout, type PageKind } from './menuLayout'
import { emptyPage, pageIdFor } from './onDemand'
import { updateMarkerStem } from './pageFiles'
import type { GitStorage } from './useGitStorage'
import type { OnDemandStore } from './useOnDemand'

// PGB-03: the menu layout from Git (menu-layout.json), read when Git is connected; the layout last read is kept in this
// browser so the menu keeps its groups while Git is not connected. A missing file is the empty layout (every page in
// On-Demand as before); a file that cannot be read is reported and the last layout kept. Every change is saved at
// once with the queued, merged save of GIT-17.
const cacheKey = 'demand-planning-menu-layout-v1'
function cached(): MenuLayout | null { try { const text = localStorage.getItem(cacheKey); return text ? parseMenuLayout(text) : null } catch { return null } }
function remember(layout: MenuLayout) { try { localStorage.setItem(cacheKey, serializeMenuLayout(layout)) } catch { /* this visit only */ } }

interface State { scope: string; layout: MenuLayout; inGit: boolean; error: string; loaded: boolean }

export function useMenuLayout(git: GitStorage) {
  const scope = git.accessScope
  const { readMenuLayout } = git
  const [state, setState] = useState<State>(() => ({ scope: '', layout: cached() ?? emptyLayout(), inGit: false, error: '', loaded: false }))
  const load = useCallback(async () => {
    if (!scope) return
    try {
      const read = await readMenuLayout()
      const layout = read.text == null ? emptyLayout() : parseMenuLayout(read.text)
      remember(layout)
      setState({ scope, layout, inGit: read.text != null, error: '', loaded: true })
    } catch (failure) { setState((current) => ({ ...current, scope, loaded: true, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [scope, readMenuLayout])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (scope && !gitLoading) void Promise.resolve().then(load) }, [scope, gitLoading, load])
  const fresh = state.scope === scope

  // Saves the layout (queued, merged with what others saved meanwhile); the merged layout replaces the one here.
  async function save(layout: MenuLayout, message: string) {
    const result = await git.writeMenuLayout(serializeMenuLayout(layout), message)
    const merged = parseMenuLayout(result.text)
    remember(merged)
    setState((current) => ({ ...current, layout: merged, inGit: true, error: '' }))
    return { ...result, layout: merged }
  }
  return {
    layout: state.layout, save, reload: load,
    loaded: fresh && state.loaded, error: fresh ? state.error : '', inGit: state.inGit,
    path: menuLayoutFile, history: git.menuLayoutHistory,
    queue: git.queueState(menuLayoutFile),
    retry: () => git.retryQueued(menuLayoutFile),
  }
}
export type MenuLayoutStore = ReturnType<typeof useMenuLayout>

// TVL-15: hidden — the page is placed hidden from the menu (a page that lives as a tab of Tool Validations).
// TVL-25: ownersFromList — the owners that come from the Tool Validations list's co-owners (a tab's page).
export interface NewPage { kind: PageKind; name: string; description: string; icon: string; group: string; newGroup: string | null; owners: string[]; hidden?: boolean; ownersFromList?: string[] }

// PGB-05: the blank page file is saved to Git at once (on-demand/<name>--<id>.json, OND-120; its id made from the name), then its place in
// the menu (menu-layout.json, with a new group when one was asked for) — two queued saves; then the page opens.
export async function createPage(store: OnDemandStore, menu: MenuLayoutStore, input: NewPage): Promise<string> {
  let layout: MenuLayout = menu.layout, group = input.group
  if (input.newGroup != null) { const added = addGroup(layout, input.newGroup); layout = added.layout; group = added.id }
  const groupName = findGroup(layout, group)?.name ?? group
  const id = pageIdFor(input.name, [...store.pages.map((page) => page.id), ...Object.keys(layout.pages), updateMarkerStem])
  const created = emptyPage(id, input.name, input.description)
  const saved = await store.save(created, `Pages & menu: add the ${kindLabel(input.kind)} page ${created.name} to ${groupName}`)
  layout = placePage(layout, id, { type: input.kind, group, icon: input.icon, owners: input.owners, ...(input.hidden ? { hidden: true } : {}), ...(input.ownersFromList?.length ? { ownersFromList: input.ownersFromList } : {}) }, store.pages.map((page) => page.id))
  const placed = await menu.save(layout, input.hidden ? `Pages & menu: place ${created.name} (a tab of Tool Validations, hidden from the menu)` : `Pages & menu: place ${created.name} in ${groupName}${input.newGroup != null ? ' (new group)' : ''}`)
  recordJob(`pages:${id}`, `Add page · ${created.name}`, { text: `${outcomeText(saved)} ${store.filePath(id)}; ${outcomeText(placed).toLowerCase()} ${menu.path}` })
  return id
}
