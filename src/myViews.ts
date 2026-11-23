import { composeAzureUrl, hasServerPat, listAzureConnectionProfiles, loadAzureConnectionProfile, serverKey, type AzureConnectionProfile, type AzureConnectionProfileSummary } from './azureCredentials.ts'
import { defaultStreams, namesStream } from './streams.ts'
import { duplicateOf } from './viewDefinitions.ts'
import type { AppState } from './domain'

// SET-17 My views: a person's own read-only views (a name, a server they already have a PAT for, a project and a
// query). Kept in this browser or desktop app only: never in the shared setup in Git, never a stream's connection
// (so the stream counts cannot change because of them), their data never saved to Git or a backup.

// The servers a view can use: those with a PAT here, from the saved connections (one entry per server).
export interface MyViewServer { key: string; base: string; onPrem: boolean }
// A connection's own PAT (older setups) counts as its server's until one is set for the server.
const hasPat = (key: string, profile: AzureConnectionProfileSummary) => hasServerPat(key) || Boolean(loadAzureConnectionProfile(profile.id)?.token)
export function myViewServers(profiles: AzureConnectionProfileSummary[], has: (key: string, profile: AzureConnectionProfileSummary) => boolean = hasPat): MyViewServer[] {
  const servers = new Map<string, MyViewServer>()
  for (const profile of profiles) {
    const key = serverKey(profile)
    if (!key || servers.has(key) || !has(key, profile)) continue
    const base = profile.baseUrl ? profile.baseUrl.replace(/\/+$/, '') : (() => { try { const url = new URL(profile.url); return `${url.origin}/${url.pathname.split('/').filter(Boolean)[0] ?? ''}` } catch { return '' } })()
    if (base) servers.set(key, { key, base, onPrem: Boolean(profile.baseUrl) })
  }
  return [...servers.values()].sort((a, b) => a.base.localeCompare(b.base))
}

export interface MyViewInput { name: string; server: MyViewServer | undefined; project: string; query: string }
// The connection for a new view, or why it cannot be added.
export function newMyView(input: MyViewInput, profiles: AzureConnectionProfileSummary[], id: string): AzureConnectionProfile | string {
  const name = input.name.trim(), project = input.project.trim(), query = input.query.trim()
  if (!name) return 'Enter a name for the view.'
  if (name.length > 80) return 'Use a name of at most 80 characters.'
  const stream = defaultStreams.find((entry) => namesStream(name, entry.name))
  if (stream) return `“${name}” names the stream ${stream.name}: My views never replace a stream. Choose another name.`
  if (profiles.some((profile) => (profile.viewName || profile.reason).trim().toLowerCase() === name.toLowerCase())) return `A view named “${name}” already exists.`
  if (!input.server) return 'Choose a server you have a PAT for (My settings → Servers and PATs).'
  if (!project) return 'Enter the project.'
  if (!/^\s*select\b/i.test(query)) return 'Enter a WIQL query (it starts with SELECT).'
  if (query.length > 32000) return 'The query is too long.'
  let url: string
  try { url = composeAzureUrl(input.server.base, project) } catch (error) { return error instanceof Error ? error.message : String(error) }
  const view: AzureConnectionProfile = { id, url, reason: name, viewName: name, role: 'reference', showInMenu: true, query, mine: true, token: '', ...(input.server.onPrem ? { baseUrl: input.server.base } : {}) }
  const same = duplicateOf({ ...view, role: 'reference' }, profiles)
  if (same) return `The view “${same.viewName || same.reason}” already reads this project with this query.`
  return view
}

// The app data without the data of My views: what is saved to a JSON backup.
export function withoutMyViews<T extends Pick<AppState, 'azureSources'>>(state: T, mine: Set<string> = myViewIds()): T {
  if (!mine.size || !state.azureSources?.some((source) => mine.has(source.connectionId))) return state
  return { ...state, azureSources: state.azureSources.filter((source) => !mine.has(source.connectionId)) }
}
export function myViewIds(storage: Pick<Storage, 'getItem'> = globalThis.localStorage) {
  try { return new Set(listAzureConnectionProfiles(storage).filter((profile) => profile.mine).map((profile) => profile.id)) } catch { return new Set<string>() }
}
