import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { cleanView } from './viewDefinitions.ts'
import { validAzureWorkItem, validFetchedAt } from './browserState.ts'

// Fetches of the on-prem read-only views, saved by the desktop app to the Git data repository (one file per view in
// azure-data/, next to the planning data) so the web app, which cannot reach the on-prem servers, can show them.
// A file holds the connection settings (never a PAT) and the fetched snapshot.
export type ViewSnapshot = NonNullable<AppState['azureSources']>[number]
export interface SnapshotFile { schema: 1; kind: 'azure-view-snapshot'; connection: AzureConnectionProfileSummary; source: ViewSnapshot }
const kind = 'azure-view-snapshot'
export const snapshotFolder = 'azure-data'
export const snapshotFileName = (connectionId: string) => `${connectionId}.json`

// Only on-prem connections (a server address) other than Time Writing go through Git.
export const sharedThroughGit = (profile: Pick<AzureConnectionProfileSummary, 'baseUrl' | 'role'>) => Boolean(profile.baseUrl) && profile.role !== 'time-tracking'

export function snapshotFile(connection: AzureConnectionProfileSummary, source: ViewSnapshot): SnapshotFile {
  const { fromGit: _fromGit, ...rest } = source
  return { schema: 1, kind, connection: cleanView(connection), source: rest }
}
export const serializeSnapshot = (file: SnapshotFile) => `${JSON.stringify(file)}\n`

export function parseSnapshot(text: string): SnapshotFile {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('A view snapshot in Git is not valid JSON.') }
  const file = raw as Partial<SnapshotFile>
  const source = file?.source as Partial<ViewSnapshot> | undefined
  if (!file || file.schema !== 1 || file.kind !== kind || !file.connection || typeof file.connection.id !== 'string' || !source || source.connectionId !== file.connection.id || !Array.isArray(source.items) || !validFetchedAt(source.fetchedAt)) throw new Error('A file in azure-data is not a Demand Planning view snapshot.')
  // One malformed item would take the views down for everyone who loads the file: the whole file is refused.
  if (source.items.some((item) => !validAzureWorkItem(item))) throw new Error(`The view snapshot for “${file.connection.viewName || file.connection.reason || file.connection.id}” in Git holds invalid work items and was not loaded.`)
  return file as SnapshotFile
}

// What the data is, without when it was fetched: an unchanged result is not committed again.
export async function snapshotDigest(source: ViewSnapshot) {
  const { fetchedAt: _fetchedAt, fromGit: _fromGit, items, ...data } = source
  // Each item also carries its own fetch time (syncedAt); that does not count either.
  const bytes = new TextEncoder().encode(JSON.stringify({ ...data, items: items.map(({ syncedAt: _syncedAt, ...item }) => item) }))
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// Applies snapshots from Git to the app data: a view's snapshot is replaced only by a newer fetch.
// queryOf: the query each connection has here. A snapshot fetched with another query (e.g. by a desktop app that still
// follows an older shared setup) is never applied: it would bring back the data of the old query whatever the
// connection now says. Those are listed in otherQuery.
const sameQuery = (a: string | undefined, b: string | undefined) => (a ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === (b ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
export function applySnapshots(sources: ViewSnapshot[] | undefined, files: SnapshotFile[], queryOf?: (connectionId: string) => string | undefined) {
  const next = [...(sources ?? [])]
  const applied: string[] = [], otherQuery: string[] = []
  for (const file of files) {
    const query = queryOf?.(file.source.connectionId)
    if (query?.trim() && !sameQuery(query, file.source.query)) { otherQuery.push(file.connection.viewName || file.connection.reason); continue }
    const index = next.findIndex((entry) => entry.connectionId === file.source.connectionId)
    // A snapshot replaces a view's data only when it is newer; one without a readable fetch time never does, and
    // local data without one is replaced.
    const incoming = Date.parse(file.source.fetchedAt), local = index >= 0 ? Date.parse(next[index].fetchedAt) : Number.NaN
    if (!Number.isFinite(incoming) || (index >= 0 && Number.isFinite(local) && local >= incoming)) continue
    const entry = { ...file.source, fromGit: true }
    if (index >= 0) next[index] = entry; else next.push(entry)
    applied.push(file.connection.viewName || file.connection.reason)
  }
  return { sources: next, applied, otherQuery }
}
