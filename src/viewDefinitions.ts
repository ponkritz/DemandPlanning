import { listAzureConnectionProfiles, loadAzureConnectionProfile, saveAzureConnectionProfile, type AzureConnectionProfileSummary } from './azureCredentials.ts'

export { clean as cleanView }

// The Azure DevOps connections (views and their queries) kept in the Git data repository for safe keeping and to set
// up another computer: one JSON file next to the planning data. PATs are never written; on restore, a connection
// keeps the PAT it already has here, else uses the PAT entered for the restore, else one saved here for the same
// organisation or server.
export interface ViewsFile { schema: 1; kind: 'azure-devops-views'; views: AzureConnectionProfileSummary[] }
const kind = 'azure-devops-views'
const keys = ['id', 'reason', 'viewName', 'role', 'showInMenu', 'url', 'baseUrl', 'apiVersion', 'creatorEmail', 'query'] as const

// Same field order every time, so the file only changes when a connection does.
function clean(view: AzureConnectionProfileSummary): AzureConnectionProfileSummary {
  const out: Record<string, unknown> = {}
  for (const key of keys) if (view[key] !== undefined && view[key] !== '') out[key] = view[key]
  return out as unknown as AzureConnectionProfileSummary
}

export const viewsFile = (views: AzureConnectionProfileSummary[]): ViewsFile => ({ schema: 1, kind, views: views.map(clean).sort((a, b) => a.id.localeCompare(b.id)) })
export const serializeViews = (file: ViewsFile) => `${JSON.stringify(file, null, 2)}\n`

export function parseViews(text: string): AzureConnectionProfileSummary[] {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('The views file in Git is not valid JSON. Nothing was restored.') }
  const file = raw as Partial<ViewsFile>
  if (!file || file.schema !== 1 || file.kind !== kind || !Array.isArray(file.views)) throw new Error('The file in Git is not a Demand Planning views file. Nothing was restored.')
  return file.views.filter((view): view is AzureConnectionProfileSummary => Boolean(view && typeof view.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(view.id) && typeof view.url === 'string' && typeof view.reason === 'string' && view.reason.trim())).map(clean)
}

// Organisation (cloud) or server (on-prem) of a connection, to reuse a PAT saved here for the same place.
export function serverKey(view: Pick<AzureConnectionProfileSummary, 'url' | 'baseUrl'>) {
  if (view.baseUrl) return view.baseUrl.replace(/\/+$/, '').toLowerCase()
  try { const url = new URL(view.url); return `${url.origin}/${url.pathname.split('/').filter(Boolean)[0] ?? ''}`.toLowerCase() } catch { return '' }
}

export interface RestoreResult { added: string[]; updated: string[]; skipped: string[]; noPat: string[] }
export function restoreViews(views: AzureConnectionProfileSummary[], pat: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): RestoreResult {
  const result: RestoreResult = { added: [], updated: [], skipped: [], noPat: [] }
  const local = listAzureConnectionProfiles(storage)
  const tokenFor = (view: AzureConnectionProfileSummary) => {
    const existing = loadAzureConnectionProfile(view.id, storage)?.token
    if (existing) return existing
    if (pat.trim()) return pat.trim()
    const same = local.find((profile) => serverKey(profile) === serverKey(view))
    return same ? loadAzureConnectionProfile(same.id, storage)?.token ?? '' : ''
  }
  for (const view of views) {
    const token = tokenFor(view)
    const name = view.viewName || view.reason
    // Without a PAT the connection is still restored, to show the data saved to Git; fetching needs a PAT.
    if (!token) result.noPat.push(name)
    const existed = Boolean(loadAzureConnectionProfile(view.id, storage))
    try { saveAzureConnectionProfile({ ...view, token }, storage); (existed ? result.updated : result.added).push(name) } catch { result.skipped.push(name) }
  }
  return result
}

// The shared connection setup in Git is every user's default; a user may still change a connection here. At start
// (Git storage connected) connections missing here are added, and those not changed here since the last sync follow
// Git; connections changed here are kept as they are. Nothing is deleted. The PAT handling is as for a restore.
const baselineKey = 'demand-planning-views-git-baseline-v1'
const fingerprint = (view: AzureConnectionProfileSummary) => JSON.stringify(clean(view))
function readBaseline(storage: Pick<Storage, 'getItem'>): Record<string, string> {
  try { const raw = JSON.parse(storage.getItem(baselineKey) ?? '{}') as unknown; return raw && typeof raw === 'object' ? raw as Record<string, string> : {} } catch { return {} }
}
// After saving to or restoring from Git, these connections match Git.
export function markViewsSynced(views: AzureConnectionProfileSummary[], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  try { storage.setItem(baselineKey, JSON.stringify({ ...readBaseline(storage), ...Object.fromEntries(views.map((view) => [view.id, fingerprint(view)])) })) } catch { /* next sync compares again */ }
}
export interface SyncResult { added: string[]; updated: string[]; kept: string[]; noPat: string[] }
export function syncViewsFromGit(views: AzureConnectionProfileSummary[], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): SyncResult {
  const result: SyncResult = { added: [], updated: [], kept: [], noPat: [] }
  const baseline = readBaseline(storage)
  const follow: AzureConnectionProfileSummary[] = [], synced: AzureConnectionProfileSummary[] = []
  for (const view of views) {
    const local = listAzureConnectionProfiles(storage).find((entry) => entry.id === view.id)
    if (local && fingerprint(local) === fingerprint(view)) { synced.push(view); continue }
    if (local && baseline[view.id] !== fingerprint(local)) { result.kept.push(view.viewName || view.reason); continue }
    follow.push(view)
  }
  const restored = restoreViews(follow, '', storage)
  for (const view of follow) {
    const name = view.viewName || view.reason
    if (restored.added.includes(name)) result.added.push(name)
    else if (restored.updated.includes(name)) result.updated.push(name)
    if (!restored.skipped.includes(name)) synced.push(view)
  }
  result.noPat = restored.noPat
  markViewsSynced(synced, storage)
  return result
}
