import { forgetAzureConnectionProfile, listAzureConnectionProfiles, loadAzureConnectionProfile, saveAzureConnectionProfile, serverKey, type AzureConnectionProfileSummary } from './azureCredentials.ts'
export { serverKey }

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
// Git; connections changed here are kept as they are. A connection that came from Git, was removed there and was not
// changed here is removed here too (never when the file lists no connections). The PAT handling is as for a restore.
const baselineKey = 'demand-planning-views-git-baseline-v1'
const fingerprint = (view: AzureConnectionProfileSummary) => JSON.stringify(clean(view))
function readBaseline(storage: Pick<Storage, 'getItem'>): Record<string, string> {
  try { const raw = JSON.parse(storage.getItem(baselineKey) ?? '{}') as unknown; return raw && typeof raw === 'object' ? raw as Record<string, string> : {} } catch { return {} }
}
// After saving to or restoring from Git, these connections match Git.
export function markViewsSynced(views: AzureConnectionProfileSummary[], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  try { storage.setItem(baselineKey, JSON.stringify({ ...readBaseline(storage), ...Object.fromEntries(views.map((view) => [view.id, fingerprint(view)])) })) } catch { /* next sync compares again */ }
}
export interface SyncResult { added: string[]; updated: string[]; kept: string[]; noPat: string[]; removed: string[]; removedIds: string[] }
export function syncViewsFromGit(views: AzureConnectionProfileSummary[], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): SyncResult {
  const result: SyncResult = { added: [], updated: [], kept: [], noPat: [], removed: [], removedIds: [] }
  const baseline = readBaseline(storage)
  const follow: AzureConnectionProfileSummary[] = [], synced: AzureConnectionProfileSummary[] = []
  for (const view of views) {
    const local = listAzureConnectionProfiles(storage).find((entry) => entry.id === view.id)
    // A view in Git that duplicates another connection here (same server, project, role and query) is not added again.
    if (!local && view.role !== 'time-tracking' && listAzureConnectionProfiles(storage).some((entry) => connectionKey(entry) === connectionKey(view))) { result.kept.push(view.viewName || view.reason); continue }
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
  const gone: string[] = []
  if (views.length) for (const [id, print] of Object.entries(baseline)) {
    if (views.some((view) => view.id === id)) continue
    gone.push(id)
    const local = listAzureConnectionProfiles(storage).find((entry) => entry.id === id)
    if (local && fingerprint(local) === print) { try { forgetAzureConnectionProfile(id, storage); result.removed.push(local.viewName || local.reason); result.removedIds.push(id) } catch { /* kept */ } }
  }
  markViewsSynced(synced, storage)
  if (gone.length) { try { const next = readBaseline(storage); for (const id of gone) delete next[id]; storage.setItem(baselineKey, JSON.stringify(next)) } catch { /* compared again next time */ } }
  return result
}

// Makes a connection the only Time Writing connection: it becomes Time Writing (shown in the menu, keeping the creator
// email and view name of the one it replaces when it has none), and the other Time Writing connections are removed
// here. Returns the removed ones. The caller updates the shared setup in Git.
export function promoteToTimeWriting(id: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const profile = loadAzureConnectionProfile(id, storage)
  if (!profile) throw new Error('Connection not found in this browser.')
  const replaced = listAzureConnectionProfiles(storage).filter((entry) => entry.role === 'time-tracking' && entry.id !== id)
  const previous = replaced[0]
  saveAzureConnectionProfile({ ...profile, role: 'time-tracking', showInMenu: true, ...(profile.creatorEmail || !previous?.creatorEmail ? {} : { creatorEmail: previous.creatorEmail }), ...(profile.viewName || !previous?.viewName ? {} : { viewName: previous.viewName }) }, storage)
  for (const entry of replaced) forgetAzureConnectionProfile(entry.id, storage)
  return replaced
}

// The IDs of the connections that came from the shared setup in Git (synced at some start): the copies to keep when
// a duplicate is removed, so the shared ID never gives way to a copy made here.
export function gitSyncedIds(storage: Pick<Storage, 'getItem'> = localStorage) { return Object.keys(readBaseline(storage)) }

// Two connections are the same when they read the same server, project (and team), role and query; then only one is
// kept — the one with an ID from the shared setup in Git, else from a preset (preferred, in that order), else the
// first — so no view is fetched, listed or matched twice. Saving a connection that would duplicate another is refused.
const sameQuery = (query?: string) => (query ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
export function connectionKey(view: Pick<AzureConnectionProfileSummary, 'url' | 'baseUrl' | 'role' | 'query'>) {
  const path = (() => { try { return decodeURIComponent(new URL(view.url).pathname).replace(/\/_backlogs\/.*$/, '').replace(/\/+$/, '').toLowerCase() } catch { return view.url.toLowerCase() } })()
  return [serverKey(view), path, view.role, sameQuery(view.query)].join('|')
}
export function duplicateConnections(profiles: AzureConnectionProfileSummary[], preferred: string[] = []) {
  const rank = (id: string) => { const at = preferred.indexOf(id); return at < 0 ? preferred.length : at }
  const groups = new Map<string, AzureConnectionProfileSummary[]>()
  for (const profile of profiles) { if (profile.role === 'time-tracking') continue; const key = connectionKey(profile); groups.set(key, [...(groups.get(key) ?? []), profile]) }
  const remove: AzureConnectionProfileSummary[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const keep = [...group].sort((a, b) => rank(a.id) - rank(b.id))[0]
    remove.push(...group.filter((profile) => profile !== keep))
  }
  return remove
}
// The saved connection a new or edited one would duplicate (same server, project, role and query), if any.
export function duplicateOf(view: Pick<AzureConnectionProfileSummary, 'url' | 'baseUrl' | 'role' | 'query'> & { id?: string }, profiles: AzureConnectionProfileSummary[]) {
  if (view.role === 'time-tracking') return undefined
  const key = connectionKey(view)
  return profiles.find((profile) => profile.id !== view.id && profile.role !== 'time-tracking' && connectionKey(profile) === key)
}
export function removeDuplicateConnections(preferred: string[] = [], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const remove = duplicateConnections(listAzureConnectionProfiles(storage), preferred)
  for (const profile of remove) { try { forgetAzureConnectionProfile(profile.id, storage) } catch { /* kept */ } }
  return remove
}
