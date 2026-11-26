import { forgetAzureConnectionProfile, listAzureConnectionProfiles, loadAzureConnectionProfile, loadServerPat, saveServerPat, serverKey, type AzureConnectionProfileSummary } from './azureCredentials.ts'
import { dataSetOfProfile, streamOfProfile } from './streams.ts'
import { cleanView, restoreViews } from './viewDefinitions.ts'

// CON-119…CON-124: Other views belong to the person who added them. The shared connection setup (azure-views.json) keeps
// the Stream mapping only — Time Writing, the streams and their data sets —; each person's Other views (custom queries,
// backlog views, background sources) are kept in Git in a file of their own, other-views/<email>.json, which only that
// person's app reads and shows (an admin's Assign writes into it, CON-122). The Other views found in an older shared
// setup are moved to other-views/unassigned.json, which only admins see, until an admin assigns each one to a person.
// As custom-streams.json does, these files sit next to azure-views.json, so an older app that rewrites azure-views.json
// never drops them; a view it writes back there is moved again, or — when it was assigned already — only taken out.
// No PAT and no work email of a connection is ever written (cleanView); the owner's email is the file's name and owner.

export const otherViewsFolder = 'other-views'
export const unassignedOtherViewsPath = `${otherViewsFolder}/unassigned.json`
const ownKind = 'other-views'
const unassignedKind = 'other-views-unassigned'
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const stamp = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/

export const normalOwner = (email: string) => { const value = (email ?? '').trim().toLowerCase(); return emailPattern.test(value) && value.length <= 200 ? value : '' }
// The person's file, as personal-views/<email>.json is named (MYD-06): '' without a valid work email.
export function otherViewsPath(email: string) {
  const value = normalOwner(email)
  return value ? `${otherViewsFolder}/${value.replace(/[^a-z0-9._@+-]/g, '_').replace(/\.{2,}/g, '_')}.json` : ''
}

// The Stream mapping: what stays shared in azure-views.json for everyone. Any other connection is an Other view.
export const isStreamMapping = (view: Pick<AzureConnectionProfileSummary, 'id' | 'viewName' | 'reason' | 'role' | 'mine'>) => view.role === 'time-tracking' || Boolean(streamOfProfile(view) || dataSetOfProfile(view))
export const isOtherView = (view: AzureConnectionProfileSummary) => !view.mine && !isStreamMapping(view)
export function splitSetup<T extends AzureConnectionProfileSummary>(views: T[]) { return { mapping: views.filter((view) => !isOtherView(view)), other: views.filter(isOtherView) } }

// One Other view as kept in its owner's file: the definition (cleanView: never a PAT or email) and who added it.
// createdBy: the email of whoever added it — for a view an admin assigned, the person it was assigned to (assignedBy,
// assignedAt say by whom and when).
export interface OtherView extends AzureConnectionProfileSummary { createdBy: string; assignedBy?: string; assignedAt?: string }
export interface OwnOtherViewsFile { schema: 1; kind: typeof ownKind; owner: string; views: OtherView[] }
// assigned: the ids an admin has assigned (with when), so a view an older app writes back into azure-views.json is never
// taken into the unassigned list again.
export interface UnassignedFile { schema: 1; kind: typeof unassignedKind; views: AzureConnectionProfileSummary[]; assigned: { id: string; at: string }[] }

const validView = (view: unknown): view is AzureConnectionProfileSummary => {
  const value = view as AzureConnectionProfileSummary | null
  return Boolean(value && typeof value === 'object' && typeof value.id === 'string' && idPattern.test(value.id) && typeof value.url === 'string' && /^https:\/\//.test(value.url) && typeof value.reason === 'string' && value.reason.trim())
}
const byId = <T extends { id: string }>(views: T[]) => [...new Map(views.map((view) => [view.id, view])).values()].sort((a, b) => a.id.localeCompare(b.id))

// A person's file read from Git. Throws on a file that is not one (nothing is then changed here or in Git); views that
// are not valid are left out. Every view carries the owner as its creator when the file says nothing else.
export function parseOwnOtherViews(text: string | null | undefined, email: string): OtherView[] {
  if (text == null || !text.trim()) return []
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error(`${otherViewsPath(email) || 'Your Other views file'} in Git is not valid JSON: your Other views were not changed.`) }
  const file = raw as Partial<OwnOtherViewsFile> | null
  if (!file || typeof file !== 'object' || file.schema !== 1 || file.kind !== ownKind || !Array.isArray(file.views)) throw new Error(`${otherViewsPath(email) || 'Your Other views file'} in Git is not an Other views file (schema 1): your Other views were not changed.`)
  const owner = normalOwner(email)
  if (!owner || typeof file.owner !== 'string' || normalOwner(file.owner) !== owner) throw new Error('The Other views file in Git belongs to a different owner. Your Other views were not changed.')
  return byId(file.views.filter((view) => validView(view) && isOtherView(view)).map((view) => {
    const extra = view as Partial<OtherView>
    return { ...cleanView(view), createdBy: normalOwner(extra.createdBy ?? '') || owner, ...(typeof extra.assignedBy === 'string' && extra.assignedBy ? { assignedBy: extra.assignedBy.slice(0, 200) } : {}), ...(typeof extra.assignedAt === 'string' && stamp.test(extra.assignedAt) ? { assignedAt: extra.assignedAt } : {}) }
  }))
}
export function serializeOwnOtherViews(email: string, views: OtherView[]) {
  const owner = normalOwner(email)
  const file: OwnOtherViewsFile = { schema: 1, kind: ownKind, owner, views: byId(views.filter((view) => !view.mine)).map((view) => ({ ...cleanView(view), createdBy: normalOwner(view.createdBy) || owner, ...(view.assignedBy ? { assignedBy: view.assignedBy } : {}), ...(view.assignedAt ? { assignedAt: view.assignedAt } : {}) })) }
  return `${JSON.stringify(file, null, 2)}\n`
}
// This person's views merged into their file: the file's views stay (an admin may have assigned one meanwhile), those
// here replace theirs (same id) or are added, and only `removed` leave it.
export function mergeOwnOtherViews(inGit: OtherView[], here: AzureConnectionProfileSummary[], email: string, removed: string[] = []): OtherView[] {
  const gone = new Set(removed), owner = normalOwner(email)
  const merged = new Map<string, OtherView>()
  for (const view of inGit) if (!gone.has(view.id)) merged.set(view.id, view)
  for (const view of here) if (!gone.has(view.id) && isOtherView(view)) { const before = merged.get(view.id); merged.set(view.id, { ...cleanView(view), createdBy: before?.createdBy || owner, ...(before?.assignedBy ? { assignedBy: before.assignedBy } : {}), ...(before?.assignedAt ? { assignedAt: before.assignedAt } : {}) }) }
  return byId([...merged.values()])
}

export const emptyUnassigned = (): UnassignedFile => ({ schema: 1, kind: unassignedKind, views: [], assigned: [] })
export function parseUnassigned(text: string | null | undefined): UnassignedFile {
  if (text == null || !text.trim()) return emptyUnassigned()
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error(`${unassignedOtherViewsPath} in Git is not valid JSON: nothing was moved or assigned.`) }
  const file = raw as Partial<UnassignedFile> | null
  if (!file || typeof file !== 'object' || file.schema !== 1 || file.kind !== unassignedKind || !Array.isArray(file.views)) throw new Error(`${unassignedOtherViewsPath} in Git is not an unassigned Other views file (schema 1): nothing was moved or assigned.`)
  const assigned = (Array.isArray(file.assigned) ? file.assigned : []).filter((entry): entry is { id: string; at: string } => Boolean(entry && typeof entry.id === 'string' && idPattern.test(entry.id) && typeof entry.at === 'string'))
  const settled = new Set(assigned.map((entry) => entry.id))
  return { schema: 1, kind: unassignedKind, views: byId(file.views.filter(validView).map(cleanView)).filter((view) => !settled.has(view.id)), assigned: byId(assigned) }
}
export const serializeUnassigned = (file: UnassignedFile) => `${JSON.stringify({ schema: 1, kind: unassignedKind, views: byId(file.views).map(cleanView), assigned: byId(file.assigned) } satisfies UnassignedFile, null, 2)}\n`

// CON-121: the move of the Other views found in the shared setup (azure-views.json) to the unassigned list. A view that
// is already in the list, was assigned, or is marked removed for everyone (CON-110) is not added again; the shared setup
// keeps the Stream mapping only. Idempotent: moving the result again changes nothing.
export interface Migration { setup: AzureConnectionProfileSummary[]; unassigned: UnassignedFile; moved: string[]; setupChanged: boolean; unassignedChanged: boolean }
export function migrateOtherViews(setup: AzureConnectionProfileSummary[], unassigned: UnassignedFile, removedIds: string[] = []): Migration {
  const { mapping, other } = splitSetup(setup)
  const known = new Set([...unassigned.views.map((view) => view.id), ...unassigned.assigned.map((entry) => entry.id), ...removedIds])
  const added = other.filter((view) => !known.has(view.id))
  return { setup: mapping, unassigned: added.length ? { ...unassigned, views: byId([...unassigned.views, ...added.map(cleanView)]) } : unassigned, moved: added.map((view) => view.viewName || view.reason), setupChanged: other.length > 0, unassignedChanged: added.length > 0 }
}

// CON-122: an admin assigns an unassigned view to a person: it goes into their file (its creator: that person; by whom
// and when recorded) and leaves the list, its id recorded as assigned. Throws when it is not in the list or the email
// is not valid.
export function assignOtherView(unassigned: UnassignedFile, ownerViews: OtherView[], id: string, email: string, by: string, at: string): { unassigned: UnassignedFile; owner: OtherView[]; view: OtherView } {
  const owner = normalOwner(email)
  if (!owner) throw new Error('Enter the work email of the person to assign the view to.')
  const found = unassigned.views.find((view) => view.id === id)
  if (!found) throw new Error('This view is no longer unassigned: someone else assigned it meanwhile. Reload the list.')
  const view: OtherView = { ...cleanView(found), createdBy: owner, ...(by ? { assignedBy: by.trim().slice(0, 200) } : {}), assignedAt: at }
  return { view, owner: byId([...ownerViews.filter((entry) => entry.id !== id), view]), unassigned: { ...unassigned, views: unassigned.views.filter((entry) => entry.id !== id), assigned: byId([...unassigned.assigned.filter((entry) => entry.id !== id), { id, at }]) } }
}

// CON-123: who sees the unassigned list: admins (Shared setup in Git) only, never while viewing as someone else.
export const unassignedVisible = (views: AzureConnectionProfileSummary[], { admin, viewingAs }: { admin: boolean; viewingAs: boolean }) => admin && !viewingAs ? views : []
// Why an admin cannot assign now, or '' (fail closed: no right, no assign).
export function assignBlocked({ admin, viewingAs, git, isSample }: { admin: boolean; viewingAs: boolean; git?: { connected: boolean; readOnly: boolean; isSample?: boolean }; isSample: boolean }) {
  if (viewingAs) return 'Not while viewing as someone else: View as is read-only.'
  if (!admin) return 'Only admins (“Shared setup in Git”) can assign Other views.'
  if (!git?.connected) return 'Connect Git storage (Admin → Data & sharing) first: the Other views are in Git.'
  if (git.readOnly) return 'Your Git token is read-only, so nothing can be assigned.'
  if (isSample || git.isSample) return 'Not while the synthetic sample data is loaded.'
  return ''
}

// ---- This computer: the person's Other views follow their file ---------------------------------------------------
// Which Other views came from this person's file, per repository: id → fingerprint at the last sync or save.
const ownSyncedKey = 'demand-planning-own-other-views-v1'
const fingerprint = (view: AzureConnectionProfileSummary) => JSON.stringify(cleanView(view))
function readOwnSynced(storage: Pick<Storage, 'getItem'>): Record<string, Record<string, string>> {
  try { const raw = JSON.parse(storage.getItem(ownSyncedKey) ?? '{}') as unknown; return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, Record<string, string>> : {} } catch { return {} }
}
export function markOwnSynced(repository: string, views: AzureConnectionProfileSummary[], storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const all = readOwnSynced(storage)
  all[repository] = Object.fromEntries(views.map((view) => [view.id, fingerprint(view)]))
  try { storage.setItem(ownSyncedKey, JSON.stringify(all)) } catch { /* compared again next time */ }
}
export const ownSyncedIds = (repository: string, storage: Pick<Storage, 'getItem'> = localStorage) => Object.keys(readOwnSynced(storage)[repository] ?? {})

// CON-120: at start (and Load everything) this computer's Other views follow the person's file:
// - each view in the file is added or updated here (with its server's PAT; never one from Git), unless it was changed
//   here since the last sync — then this computer's version is kept and saved to the file (`save`);
// - an Other view here that is not in the file goes when it came from the file before (removed on another computer), or
//   when it is someone else's or unassigned (`notMine`: the Other views of the shared setup, the unassigned list and the
//   assigned ids) — also when it was changed here; its data here goes too (removedIds);
// - any other Other view here was added on this computer and never saved to Git: it is the person's and goes into
//   their file (`save`).
// My views (SET-17) and the Stream mapping are never touched; a PAT saved only on a removed view stays as its server's.
export interface OwnSyncResult { added: string[]; updated: string[]; removed: string[]; removedIds: string[]; save: AzureConnectionProfileSummary[]; noPat: string[] }
export function syncOwnOtherViews(own: OtherView[], notMine: Set<string>, repository: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage, addOnly = false): OwnSyncResult {
  const result: OwnSyncResult = { added: [], updated: [], removed: [], removedIds: [], save: [], noPat: [] }
  const synced = readOwnSynced(storage)[repository] ?? {}
  const local = listAzureConnectionProfiles(storage)
  const follow: AzureConnectionProfileSummary[] = []
  for (const view of own) {
    const here = local.find((entry) => entry.id === view.id)
    if (!isOtherView(view) || (here && (addOnly || !isOtherView(here)))) continue
    if (here && fingerprint(here) === fingerprint(view)) continue
    if (here && synced[view.id] && synced[view.id] !== fingerprint(here)) { result.save.push(here); continue }
    follow.push(cleanView(view))
  }
  const restored = restoreViews(follow, '', storage)
  for (const view of follow) {
    const name = view.viewName || view.reason
    if (restored.added.includes(name)) result.added.push(name)
    else if (restored.updated.includes(name)) result.updated.push(name)
  }
  result.noPat = restored.noPat
  if (addOnly) return result
  const mine = new Set(own.map((view) => view.id))
  for (const profile of listAzureConnectionProfiles(storage)) {
    if (!isOtherView(profile) || mine.has(profile.id)) continue
    if (synced[profile.id] || notMine.has(profile.id)) {
      const full = loadAzureConnectionProfile(profile.id, storage), key = serverKey(profile)
      if (full?.token && key && !loadServerPat(key, storage)) { try { saveServerPat(key, full.token, storage) } catch { /* the PAT goes with the view */ } }
      try { forgetAzureConnectionProfile(profile.id, storage); result.removed.push(profile.viewName || profile.reason); result.removedIds.push(profile.id) } catch { /* kept: tried again next start */ }
    } else result.save.push(profile)
  }
  return result
}
// The shared setup's baseline (CON-80 sync) stops tracking Other views: they follow the person's file from now on, so the
// shared sync never removes one here because it left azure-views.json (CON-121).
export function forgetOtherViewsInBaseline(baselineKey: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  let baseline: Record<string, string> = {}
  try { const raw = JSON.parse(storage.getItem(baselineKey) ?? '{}') as unknown; baseline = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string> : {} } catch { return }
  const others = new Set(listAzureConnectionProfiles(storage).filter(isOtherView).map((view) => view.id))
  const kept = Object.fromEntries(Object.entries(baseline).filter(([id]) => !others.has(id)))
  if (Object.keys(kept).length !== Object.keys(baseline).length) { try { storage.setItem(baselineKey, JSON.stringify(kept)) } catch { /* compared again next time */ } }
}
// The one-line summary of a sync, '' when nothing changed.
export function ownSyncNote(result: OwnSyncResult | null) {
  if (!result) return ''
  const parts = [result.added.length && `${result.added.length} added (${result.added.join(', ')})`, result.updated.length && `${result.updated.length} updated (${result.updated.join(', ')})`, result.removed.length && `${result.removed.length} removed here as not yours (${result.removed.join(', ')})`].filter(Boolean)
  return parts.length ? `Your Other views from Git: ${parts.join('; ')}. ` : ''
}
