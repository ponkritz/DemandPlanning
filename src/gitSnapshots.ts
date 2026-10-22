import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { cleanView } from './viewDefinitions.ts'

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
  if (!file || file.schema !== 1 || file.kind !== kind || !file.connection || typeof file.connection.id !== 'string' || !source || source.connectionId !== file.connection.id || !Array.isArray(source.items) || typeof source.fetchedAt !== 'string') throw new Error('A file in azure-data is not a Demand Planning view snapshot.')
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
export function applySnapshots(sources: ViewSnapshot[] | undefined, files: SnapshotFile[]) {
  const next = [...(sources ?? [])]
  const applied: string[] = []
  for (const file of files) {
    const index = next.findIndex((entry) => entry.connectionId === file.source.connectionId)
    if (index >= 0 && Date.parse(next[index].fetchedAt) >= Date.parse(file.source.fetchedAt)) continue
    const entry = { ...file.source, fromGit: true }
    if (index >= 0) next[index] = entry; else next.push(entry)
    applied.push(file.connection.viewName || file.connection.reason)
  }
  return { sources: next, applied }
}
