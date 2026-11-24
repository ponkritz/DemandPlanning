import { useCallback, useEffect, useState } from 'react'
import { dashboardPath, emptyDashboard, parseDashboard, serializeDashboard, type Dashboard } from './dashboardPages'
import type { GitStorage } from './useGitStorage'

// DSH-08: a Dashboard page's definition from Git (dashboards/<page-id>.json), read when Git is connected; the one last
// read is kept in this browser so the dashboard shows while Git is not connected. A missing file is an empty dashboard
// (a new Dashboard page has none until its first block); a file that is not a dashboard is reported and the last one
// kept; blocks that could not be read are named (dropped). Every change of the owners is saved at once, queued and
// merged with what others saved meanwhile (GIT-17).
const cacheKey = (id: string) => `demand-planning-dashboard-page-v1:${id}`
export function cached(id: string): Dashboard | null { try { const text = localStorage.getItem(cacheKey(id)); return text ? parseDashboard(text, id).dashboard : null } catch { return null } }
function remember(dashboard: Dashboard) { try { localStorage.setItem(cacheKey(dashboard.id), serializeDashboard(dashboard)) } catch { /* this visit only */ } }

interface State { key: string; dashboard: Dashboard; inGit: boolean; error: string; dropped: string[]; loaded: boolean }

export function useDashboardPage(git: GitStorage, pageId: string) {
  const key = `${git.accessScope}|${pageId}`
  const { readDashboard } = git
  const [state, setState] = useState<State>(() => ({ key: '', dashboard: cached(pageId) ?? emptyDashboard(pageId), inGit: false, error: '', dropped: [], loaded: false }))
  const load = useCallback(async () => {
    if (!git.accessScope) return
    try {
      const read = await readDashboard(pageId)
      const parsed = read.text == null ? { dashboard: emptyDashboard(pageId), dropped: [] } : parseDashboard(read.text, pageId)
      remember(parsed.dashboard)
      setState({ key, dashboard: parsed.dashboard, inGit: read.text != null, error: '', dropped: parsed.dropped, loaded: true })
    } catch (failure) { setState((current) => ({ ...current, key, loaded: true, error: failure instanceof Error ? failure.message : String(failure) })) }
  }, [git.accessScope, readDashboard, pageId, key])
  const gitLoading = git.status === 'loading'
  useEffect(() => { if (git.accessScope && !gitLoading) void Promise.resolve().then(load) }, [git.accessScope, gitLoading, load])
  const fresh = state.key === key
  const dashboard = state.dashboard.id === pageId ? state.dashboard : cached(pageId) ?? emptyDashboard(pageId)

  // Saves the dashboard (queued, merged); the merged dashboard replaces the one here.
  async function save(next: Dashboard, message: string) {
    const result = await git.writeDashboard(pageId, serializeDashboard(next), message)
    const merged = parseDashboard(result.text, pageId)
    remember(merged.dashboard)
    setState((current) => ({ ...current, key, dashboard: merged.dashboard, inGit: true, error: '', dropped: merged.dropped }))
    return { ...result, dashboard: merged.dashboard }
  }
  return {
    dashboard, save, reload: load,
    loaded: fresh && state.loaded, error: fresh ? state.error : '', dropped: fresh ? state.dropped : [], inGit: fresh && state.inGit,
    path: dashboardPath(pageId), history: git.dashboardHistory(pageId),
    queue: git.queueState(dashboardPath(pageId)),
    retry: () => git.retryQueued(dashboardPath(pageId)),
  }
}
export type DashboardPageStore = ReturnType<typeof useDashboardPage>

// DSH-15: a change to another dashboard's file (Copy to…): read from Git, changed, saved with the queued, merged save
// (GIT-17); the merged result is kept in this browser as that page's last read dashboard.
export async function changeOtherDashboard(git: Pick<GitStorage, 'readDashboard' | 'writeDashboard'>, pageId: string, change: (dashboard: Dashboard) => Dashboard, message: string) {
  const read = await git.readDashboard(pageId)
  const current = read.text == null ? emptyDashboard(pageId) : parseDashboard(read.text, pageId).dashboard
  const result = await git.writeDashboard(pageId, serializeDashboard(change(current)), message)
  const merged = parseDashboard(result.text, pageId).dashboard
  remember(merged)
  return { ...result, dashboard: merged }
}
