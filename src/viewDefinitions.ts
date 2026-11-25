import { forgetAzureConnectionProfile, listAzureConnectionProfiles, loadAzureConnectionProfile, loadServerPat, saveAzureConnectionProfile, saveServerPat, serverKey, viewsBaselineKey, type AzureConnectionProfileSummary } from './azureCredentials.ts'
import { dataSetOfProfile, streamOfProfile } from './streams.ts'
export { serverKey }

export { clean as cleanView }

// The Azure DevOps connections (views and their queries) kept in the Git data repository for safe keeping and to set
// up another computer: one JSON file next to the planning data. PATs are never written; on restore, a connection
// keeps the PAT it already has here, else uses the PAT entered for the restore, else one saved here for the same
// organisation or server.
export interface ViewsFile { schema: 1; kind: 'azure-devops-views'; views: AzureConnectionProfileSummary[] }
const kind = 'azure-devops-views'
// The work email (creatorEmail) is personal — it names who "me" is (access role, My Work, the creator of new Features) —
// so it is never written to Git and an email found in the file is ignored (CON-80).
const keys = ['id', 'reason', 'viewName', 'role', 'showInMenu', 'url', 'baseUrl', 'apiVersion', 'query'] as const

// Same field order every time, so the file only changes when a connection does.
function clean(view: AzureConnectionProfileSummary): AzureConnectionProfileSummary {
  const out: Record<string, unknown> = {}
  for (const key of keys) if (view[key] !== undefined && view[key] !== '') out[key] = view[key]
  return out as unknown as AzureConnectionProfileSummary
}

export const viewsFile = (views: AzureConnectionProfileSummary[]): ViewsFile => ({ schema: 1, kind, views: views.filter((view) => !view.mine).map(clean).sort((a, b) => a.id.localeCompare(b.id)) })
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
    // The connection's own PAT follows it only while it stays on the same server: a view whose URL was moved to
    // another host in Git never carries the old server's PAT to the new one.
    const current = loadAzureConnectionProfile(view.id, storage)
    const existing = current && serverKey(current).toLowerCase() === serverKey(view).toLowerCase() ? current.token : ''
    if (existing) return existing
    if (pat.trim()) return pat.trim()
    const same = local.find((profile) => serverKey(profile) === serverKey(view))
    return same ? loadAzureConnectionProfile(same.id, storage)?.token ?? '' : ''
  }
  for (const view of views) {
    const name = view.viewName || view.reason
    const current = loadAzureConnectionProfile(view.id, storage)
    // Shared imports must never replace an existing personal connection with the same ID.
    if (current?.mine) { result.skipped.push(name); continue }
    const token = tokenFor(view)
    // Without a PAT the connection is still restored, to show the data saved to Git; fetching needs a PAT.
    if (!token) result.noPat.push(name)
    // The user's own email on this connection is kept; Git never sets one (CON-80).
    const email = current?.creatorEmail?.trim()
    try { saveAzureConnectionProfile({ ...view, token, ...(email ? { creatorEmail: email } : {}) }, storage); (current ? result.updated : result.added).push(name) } catch { result.skipped.push(name) }
  }
  return result
}

// The shared connection setup in Git is every user's default; a user may still change a connection here. At start
// (Git storage connected) connections missing here are added, and those not changed here since the last sync follow
// Git; connections changed here are kept as they are. A connection that came from Git, was removed there and was not
// changed here is removed here too (never when the file lists no connections). The PAT handling is as for a restore.
const baselineKey = viewsBaselineKey
// A stream connection an admin changed here but could not save to Git: kept here (not replaced by Git) until it is saved.
const pendingKey = 'demand-planning-views-pending-share-v1'
const readPending = (storage: Pick<Storage, 'getItem'>) => { try { const raw = JSON.parse(storage.getItem(pendingKey) ?? '[]') as unknown; return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []) } catch { return new Set<string>() } }
export function markPendingShare(ids: string[], pending: boolean, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const next = readPending(storage)
  for (const id of ids) { if (pending) next.add(id); else next.delete(id) }
  try { storage.setItem(pendingKey, JSON.stringify([...next])) } catch { /* compared again next time */ }
}
// The stream mapping (DP, CP, IOCC, Content, Tool Validations and DP's data sets) set by an admin in Git is enforced:
// a user's own change to one of these connections is replaced by Git at the next sync. Time Writing stays personal.
const enforced = (view: AzureConnectionProfileSummary) => view.role !== 'time-tracking' && Boolean(streamOfProfile(view) || dataSetOfProfile(view))
const fingerprint = (view: AzureConnectionProfileSummary) => JSON.stringify(clean(view))
function readBaseline(storage: Pick<Storage, 'getItem'>): Record<string, string> {
  try { const raw = JSON.parse(storage.getItem(baselineKey) ?? '{}') as unknown; return raw && typeof raw === 'object' ? raw as Record<string, string> : {} } catch { return {} }
}
// After saving to or restoring from Git, these connections match Git.
export function markViewsSynced(views: AzureConnectionProfileSummary[], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  try { storage.setItem(baselineKey, JSON.stringify({ ...readBaseline(storage), ...Object.fromEntries(views.map((view) => [view.id, fingerprint(view)])) })) } catch { /* next sync compares again */ }
}
// repositoryChanged (GIT-26): the first sync from a repository other than the one this browser last synced with.
// notHere: connections in Git that were not here (added); onlyHere: connections here that Git does not list (kept);
// differ: connections here that differ from Git's version (kept as they are here).
export interface SyncResult { added: string[]; updated: string[]; kept: string[]; noPat: string[]; removed: string[]; removedIds: string[]; enforced: string[]; emailCleared: boolean; repositoryChanged?: boolean; onlyHere?: string[]; differ?: string[] }

// The emails an older shared file in Git still carries (before CON-80 every connection's email was written to it).
export function sharedEmails(text: string): string[] {
  try { const file = JSON.parse(text) as Partial<ViewsFile>; return [...new Set((Array.isArray(file?.views) ? file.views : []).map((view) => typeof view?.creatorEmail === 'string' ? view.creatorEmail.trim().toLowerCase() : '').filter(Boolean))] } catch { return [] }
}
// Once per browser (CON-80): a Time Writing connection that came from Git with an email taken from the shared file
// (another person's, usually the admin's) loses it, so the app asks this user for their own work email.
const emailFixKey = 'demand-planning-shared-email-cleared-v1'
export function clearSharedEmail(emails: string[], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): boolean {
  try { if (storage.getItem(emailFixKey)) return false } catch { return false }
  const fromGit = new Set(Object.keys(readBaseline(storage)))
  let cleared = false
  if (emails.length) for (const profile of listAzureConnectionProfiles(storage)) {
    if (profile.role !== 'time-tracking' || !fromGit.has(profile.id) || !emails.includes(profile.creatorEmail?.trim().toLowerCase() ?? '')) continue
    const full = loadAzureConnectionProfile(profile.id, storage)
    if (!full) continue
    const { creatorEmail: _shared, ...rest } = full
    try { saveAzureConnectionProfile(rest, storage); cleared = true } catch { /* left as it is */ }
  }
  try { storage.setItem(emailFixKey, new Date().toISOString()) } catch { /* tried again next start */ }
  return cleared
}
// A PAT saved only on a connection that is removed stays in this browser as its server's PAT (as for a clean-up).
function keepServerPat(profile: AzureConnectionProfileSummary, storage: Pick<Storage, 'getItem' | 'setItem'>) {
  const full = loadAzureConnectionProfile(profile.id, storage), key = serverKey(profile)
  if (full?.token && key && !loadServerPat(key, storage)) { try { saveServerPat(key, full.token, storage) } catch { /* the PAT goes with the connection */ } }
}

// GIT-26 (KB-92): the repository (owner/repo@branch, folder of the planning data) this browser last synced its
// connections with. When Git storage points to another repository (Change connection, Switch, GIT-24) the connections
// here came from the old one: its baseline says nothing about the new repository's file, and a clean-up marker there
// was not meant for them. So the first sync from another repository changes nothing here and only adds what is new
// (compareViewsWithGit); unknown (a browser from before this check, with connections from Git) counts as another one.
const viewsRepoKey = 'demand-planning-views-repository-v1'
export function viewsRepository(storage: Pick<Storage, 'getItem'> = localStorage) { try { return storage.getItem(viewsRepoKey) ?? '' } catch { return '' } }
export function markViewsRepository(repository: string, storage: Pick<Storage, 'setItem'> = localStorage) { try { storage.setItem(viewsRepoKey, repository) } catch { /* compared again next time */ } }
export function repositoryChanged(repository: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  const last = viewsRepository(storage)
  if (last) return last !== repository
  return Object.keys(readBaseline(storage)).length > 0
}
// The first sync after a repository change: connections in Git that are not here (by ID or as a duplicate) are added;
// nothing here is removed or replaced, and no PAT is touched. The baseline then holds only the connections that match
// the new repository's setup, so a later sync never removes or replaces one that came from the old repository.
export function compareViewsWithGit(views: AzureConnectionProfileSummary[], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): SyncResult {
  const result: SyncResult = { added: [], updated: [], kept: [], noPat: [], removed: [], removedIds: [], enforced: [], emailCleared: false, repositoryChanged: true, onlyHere: [], differ: [] }
  const profiles = listAzureConnectionProfiles(storage)
  const here = profiles.filter((profile) => !profile.mine)
  const add: AzureConnectionProfileSummary[] = [], same: AzureConnectionProfileSummary[] = []
  for (const view of views) {
    const local = profiles.find((entry) => entry.id === view.id)
    if (local?.mine) { result.differ!.push(view.viewName || view.reason); continue }
    if (local) { if (fingerprint(local) === fingerprint(view)) same.push(view); else result.differ!.push(local.viewName || local.reason); continue }
    if (view.role !== 'time-tracking' && here.some((entry) => connectionKey(entry) === connectionKey(view))) { result.kept.push(view.viewName || view.reason); continue }
    add.push(view)
  }
  const keys = new Set(views.filter((view) => view.role !== 'time-tracking').map(connectionKey))
  result.onlyHere = here.filter((profile) => !views.some((view) => view.id === profile.id) && !(profile.role !== 'time-tracking' && keys.has(connectionKey(profile)))).map((profile) => profile.viewName || profile.reason)
  const restored = restoreViews(add, '', storage)
  for (const view of add) {
    const name = view.viewName || view.reason
    if (restored.added.includes(name)) { result.added.push(name); same.push(view) }
  }
  result.noPat = restored.noPat
  try { storage.setItem(baselineKey, JSON.stringify(Object.fromEntries(same.map((view) => [view.id, fingerprint(view)])))) } catch { /* compared again next time */ }
  return result
}
// The text shown after a first sync from another repository (GIT-26).
export function repositoryChangeNote(repository: string, result: SyncResult | null, resetSkipped: boolean) {
  const named = (names: string[]) => names.length ? `: ${names.join(', ')}` : ''
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
  const setup = !result ? 'It has no connection setup yet; the connections here are kept.'
    : `The connection setup there has ${plural(result.added.length, 'connection that was', 'connections that were')} not here (added${named(result.added)}) and lacks ${plural(result.onlyHere?.length ?? 0, 'that is', 'that are')} here (kept here${named(result.onlyHere ?? [])})${result.differ?.length ? `; ${plural(result.differ.length, 'connection differs', 'connections differ')} from here (kept as here${named(result.differ)})` : ''}.`
  return `Git storage now uses another repository (${repository}). ${setup}${resetSkipped ? ' Its connection clean-up (azure-views-reset.json) was not applied here.' : ''} Nothing here was removed or replaced, and your PATs are kept: Save connections to Git adds yours to the new repository, Restore from Git takes its version, and a connection you no longer need is removed in Settings. `
}

export function syncViewsFromGit(views: AzureConnectionProfileSummary[], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage, fileEmails: string[] = []): SyncResult {
  const result: SyncResult = { added: [], updated: [], kept: [], noPat: [], removed: [], removedIds: [], enforced: [], emailCleared: false }
  result.emailCleared = clearSharedEmail(fileEmails, storage)
  const baseline = readBaseline(storage), pending = readPending(storage)
  const follow: AzureConnectionProfileSummary[] = [], synced: AzureConnectionProfileSummary[] = []
  for (const view of views) {
    const local = listAzureConnectionProfiles(storage).find((entry) => entry.id === view.id)
    if (local?.mine) { result.kept.push(view.viewName || view.reason); continue }
    // A view in Git that duplicates another connection here (same server, project, role and query) is not added again.
    if (!local && view.role !== 'time-tracking' && listAzureConnectionProfiles(storage).some((entry) => connectionKey(entry) === connectionKey(view))) { result.kept.push(view.viewName || view.reason); continue }
    if (local && fingerprint(local) === fingerprint(view)) { synced.push(view); continue }
    if (local && baseline[view.id] !== fingerprint(local)) {
      if (enforced(view) && !pending.has(view.id)) { result.enforced.push(view.viewName || view.reason); follow.push(view); continue }
      result.kept.push(view.viewName || view.reason); continue
    }
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
    if (local && !local.mine && fingerprint(local) === print) { try { keepServerPat(local, storage); forgetAzureConnectionProfile(id, storage); result.removed.push(local.viewName || local.reason); result.removedIds.push(id) } catch { /* kept */ } }
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

// Back up and clean up the shared connection setup (CON-86). An admin backs up every connection (a download and a dated
// copy in Git, never a PAT), then removes them all here and in Git. Because the start sync never removes anything when
// Git lists no connections, and keeps a connection a user changed, the clean-up is announced by a reset marker in Git
// (azure-views-reset.json): at their next start every computer that has not applied that reset yet removes all its
// connections, then takes the connections now in Git. PATs are kept per server; a PAT saved only on a connection is
// moved to its server first.
export const viewsResetPath = 'azure-views-reset.json'
export const viewsBackupFolder = 'azure-views-backups'
const resetKind = 'azure-views-reset'
const resetSeenKey = 'demand-planning-views-reset-v1'
export const serializeViewsReset = (resetAt: string) => `${JSON.stringify({ schema: 1, kind: resetKind, resetAt }, null, 2)}\n`
export function parseViewsReset(text: string | null): string | null {
  if (!text) return null
  try {
    const raw = JSON.parse(text) as { schema?: unknown; kind?: unknown; resetAt?: unknown }
    return raw?.schema === 1 && raw.kind === resetKind && typeof raw.resetAt === 'string' && Number.isFinite(Date.parse(raw.resetAt)) ? raw.resetAt : null
  } catch { return null }
}
// The backup file name: azure-views-backups/azure-views-2026-11-02T17-05-00Z.json (UTC, no colons).
export const viewsBackupName = (at: Date) => `azure-views-${at.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')}.json`
export function removeAllConnections(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): AzureConnectionProfileSummary[] {
  // My views (SET-17) are not part of the shared setup: a reset keeps them.
  const removed = listAzureConnectionProfiles(storage).filter((profile) => !profile.mine)
  for (const profile of removed) {
    const full = loadAzureConnectionProfile(profile.id, storage)
    const key = serverKey(profile)
    if (full?.token && key && !loadServerPat(key, storage)) { try { saveServerPat(key, full.token, storage) } catch { /* the PAT goes with the connection */ } }
    try { forgetAzureConnectionProfile(profile.id, storage) } catch { /* kept */ }
  }
  try { storage.setItem(baselineKey, '{}'); storage.setItem(pendingKey, '[]') } catch { /* compared again next time */ }
  return removed
}
// This computer has applied the reset of resetAt (the admin's own clean-up, or a reset found in Git).
export function markResetApplied(resetAt: string, storage: Pick<Storage, 'setItem'> = localStorage) { try { storage.setItem(resetSeenKey, resetAt) } catch { /* applied again next start: removes only what came after */ } }
// A reset in Git this computer has not applied yet (it still has the connections from before the clean-up).
export function resetPending(resetAt: string | null, storage: Pick<Storage, 'getItem'> = localStorage) {
  if (!resetAt) return false
  let seen = ''
  try { seen = storage.getItem(resetSeenKey) ?? '' } catch { seen = '' }
  // Any reset not applied here yet, whatever its time: a marker dated in the future (a wrong clock) never blocks a later one.
  return seen !== resetAt
}
// At start: a reset in Git newer than the last one applied here removes every connection here. Returns the removed ones,
// or null when there is nothing to apply.
export function applyViewsReset(resetAt: string | null, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): AzureConnectionProfileSummary[] | null {
  if (!resetAt) return null
  if (!resetPending(resetAt, storage)) return null
  const removed = removeAllConnections(storage)
  markResetApplied(resetAt, storage)
  return removed
}

// CON-98: the shared connection setup in Git is merged, never overwritten by one computer's list: the connections in
// Git stay, those here replace theirs (same id) or are added, and only the ids named in `removed` (an explicit removal,
// e.g. the extra Time Writing connections or duplicates) leave Git. Personal views (mine) are never written.
export function mergeViews(inGit: AzureConnectionProfileSummary[], here: AzureConnectionProfileSummary[], removed: string[] = []): AzureConnectionProfileSummary[] {
  const gone = new Set(removed)
  const merged = new Map<string, AzureConnectionProfileSummary>()
  for (const view of inGit) if (!gone.has(view.id) && !view.mine) merged.set(view.id, view)
  for (const view of here) if (!gone.has(view.id) && !view.mine) merged.set(view.id, view)
  return [...merged.values()]
}

// CON-99: connections that were in an older version of the shared setup in Git but are neither in it now nor here —
// e.g. one dropped when another computer overwrote the file. Newest version first; each connection once, as it was in
// the newest version that had it; one duplicating a connection here (same server, project, role and query) is left out.
export interface GitVersion { sha: string; date: string; message: string; views: AzureConnectionProfileSummary[] }
// CON-112: the views the Tool Owner removed for everyone come first, from their removal marker (with who and when),
// whatever the age of the version that last had them.
export interface RemovedView { view: AzureConnectionProfileSummary; date: string; message: string; sha: string; removal?: ViewRemoval }
export function removedFromGit(versions: GitVersion[], current: AzureConnectionProfileSummary[], here: AzureConnectionProfileSummary[], removals: ViewRemoval[] = []): RemovedView[] {
  const present = new Set([...current, ...here].map((view) => view.id))
  const keys = new Set([...current, ...here].map(connectionKey))
  const found = new Map<string, RemovedView>()
  for (const removal of [...removals].sort((a, b) => b.at.localeCompare(a.at))) {
    if (!removal.view.url || present.has(removal.id) || keys.has(connectionKey(removal.view))) continue
    found.set(removal.id, { view: removal.view, date: removal.at, message: `${removal.mode === 'delete' ? 'Deleted' : 'Removed'} for everyone${removal.by ? ` by ${removal.by}` : ''}`, sha: '', removal })
  }
  for (const version of [...versions].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const view of version.views) {
      if (present.has(view.id) || found.has(view.id) || view.mine || keys.has(connectionKey(view))) continue
      found.set(view.id, { view, date: version.date, message: version.message, sha: version.sha })
    }
  }
  return [...found.values()]
}

// CON-109…CON-112: a shared view the Tool Owner removed (or deleted) for everyone. The removal markers are kept in a file
// of their own next to the shared setup (azure-views-removed.json), so an older app that rewrites azure-views.json
// never drops them. While a view is marked removed, Git's shared setup wins for it: it is left out of the setup read from
// Git, out of every save of the setup (CON-98 merge), out of the on-prem data loaded from Git and never saved back there.
// Each browser removes it here once (per repository and marker); My views (SET-17) and PATs are never touched.
export const viewsRemovedPath = 'azure-views-removed.json'
const removedKind = 'azure-views-removed'
export type RemovalMode = 'remove' | 'delete'
// view: the definition as it was (never a PAT or email); backup: its copy in azure-views-backups/; files: the data files
// deleted in Git (Delete only).
export interface ViewRemoval { id: string; name: string; by: string; at: string; mode: RemovalMode; backup: string; files?: string[]; view: AzureConnectionProfileSummary }
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/
export function parseViewRemovals(text: string | null): ViewRemoval[] {
  if (!text) return []
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return [] }
  const file = raw as { schema?: unknown; kind?: unknown; removed?: unknown }
  if (!file || file.schema !== 1 || file.kind !== removedKind || !Array.isArray(file.removed)) return []
  return file.removed.flatMap((entry): ViewRemoval[] => {
    const item = entry as Partial<ViewRemoval>
    if (!item || typeof item.id !== 'string' || !idPattern.test(item.id) || typeof item.at !== 'string' || !Number.isFinite(Date.parse(item.at))) return []
    const view = item.view && typeof item.view === 'object' && item.view.id === item.id && typeof item.view.url === 'string' ? clean(item.view) : { id: item.id, reason: typeof item.name === 'string' && item.name ? item.name : item.id, url: '', role: 'reference' as const }
    return [{ id: item.id, name: typeof item.name === 'string' && item.name ? item.name : item.id, by: typeof item.by === 'string' ? item.by : '', at: item.at, mode: item.mode === 'delete' ? 'delete' : 'remove', backup: typeof item.backup === 'string' ? item.backup : '', ...(Array.isArray(item.files) ? { files: item.files.filter((name): name is string => typeof name === 'string') } : {}), view }]
  })
}
export const serializeViewRemovals = (removals: ViewRemoval[]) => `${JSON.stringify({ schema: 1, kind: removedKind, removed: [...removals].sort((a, b) => a.id.localeCompare(b.id)).map((entry) => ({ ...entry, view: clean(entry.view) })) }, null, 2)}\n`
// The marker for a view, replacing an older one for the same view; and without it (Restore, CON-112).
export const withRemoval = (removals: ViewRemoval[], entry: ViewRemoval) => [...removals.filter((item) => item.id !== entry.id), { ...entry, view: clean(entry.view) }]
export const withoutRemoval = (removals: ViewRemoval[], id: string) => removals.filter((item) => item.id !== id)
// The views of the shared setup in Git that are not marked removed.
export const notRemoved = <T extends { id: string }>(views: T[], removals: ViewRemoval[]) => { const gone = new Set(removals.map((entry) => entry.id)); return views.filter((view) => !gone.has(view.id)) }
// The backup of one removed view: azure-views-backups/azure-views-<UTC time>-removed-<id>.json, in the views-file format.
export const removalBackupName = (id: string, at: Date) => viewsBackupName(at).replace(/\.json$/, `-removed-${id}.json`)

// Which markers this browser has applied, per repository (owner/repo@branch:path): `${id}@${at}`.
const removalsAppliedKey = 'demand-planning-views-removed-applied-v1'
function readApplied(storage: Pick<Storage, 'getItem'>): Record<string, string[]> {
  try { const raw = JSON.parse(storage.getItem(removalsAppliedKey) ?? '{}') as unknown; return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string[]> : {} } catch { return {} }
}
const removalKey = (entry: Pick<ViewRemoval, 'id' | 'at'>) => `${entry.id}@${entry.at}`
export function removalsPending(removals: ViewRemoval[], repository: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  const seen = new Set(readApplied(storage)[repository] ?? [])
  return removals.filter((entry) => !seen.has(removalKey(entry)))
}
export function markRemovalsApplied(removals: ViewRemoval[], repository: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  if (!removals.length) return
  const all = readApplied(storage)
  all[repository] = [...new Set([...(all[repository] ?? []), ...removals.map(removalKey)])]
  try { storage.setItem(removalsAppliedKey, JSON.stringify(all)) } catch { /* applied again next start: removes only what is still here */ }
}
// At start (not the first sync from another repository, GIT-26): every marker not applied here yet removes that shared
// view here — also when it was changed here — once. My views and PATs stay (a PAT saved only on the view becomes its
// server's PAT). Returns the views removed here (a marker for a view that is not here is only recorded).
export function applyViewRemovals(removals: ViewRemoval[], repository: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): AzureConnectionProfileSummary[] {
  const pending = removalsPending(removals, repository, storage)
  if (!pending.length) return []
  const ids = new Set(pending.map((entry) => entry.id))
  const removed: AzureConnectionProfileSummary[] = []
  for (const profile of listAzureConnectionProfiles(storage)) {
    if (!ids.has(profile.id) || profile.mine) continue
    try { keepServerPat(profile, storage); forgetAzureConnectionProfile(profile.id, storage); removed.push(profile) } catch { /* kept: tried again next start */ }
  }
  try { const next = readBaseline(storage); for (const id of ids) delete next[id]; storage.setItem(baselineKey, JSON.stringify(next)) } catch { /* compared again next time */ }
  markPendingShare([...ids], false, storage)
  markRemovalsApplied(pending, repository, storage)
  return removed
}
// CON-109: why the Tool Owner's Remove / Delete for everyone is not available, or '' (fail closed: no right, no removal).
export function removalBlocked({ allowed, viewingAs, git, isSample }: { allowed: boolean; viewingAs: boolean; git?: { connected: boolean; readOnly: boolean; isSample?: boolean }; isSample: boolean }) {
  if (viewingAs) return 'Not while viewing as someone else: View as is read-only.'
  if (!allowed) return 'Only the Tool Owner (“Change the stream mapping”) can remove a shared view for everyone.'
  if (!git?.connected) return 'Connect Git storage (Admin → Data & sharing) first: the shared setup is in Git.'
  if (git.readOnly) return 'Your Git token is read-only, so the shared setup in Git cannot be changed.'
  if (isSample || git.isSample) return 'Not while the synthetic sample data is loaded.'
  return ''
}
// The one-time notice after shared views were removed here.
export function removalNotice(removed: AzureConnectionProfileSummary[]) {
  if (!removed.length) return ''
  const one = removed.length === 1
  return `The Tool Owner removed ${removed.length} shared view${one ? '' : 's'}: ${removed.map((profile) => profile.viewName || profile.reason).join(', ')}. ${one ? 'It was' : 'They were'} removed here with ${one ? 'its' : 'their'} saved data; your own views (My views) and your PATs are kept.`
}
