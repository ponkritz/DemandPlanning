import type { AppState, Snapshot } from './domain'

export interface CloudSnapshotFile { id: string; name: string; webUrl: string; createdDateTime?: string }
export type SnapshotRequest = (path: string, options?: RequestInit) => Promise<Response>

export function snapshotFolder(stateFilePath: string) {
  const parts = stateFilePath.split('/').filter(Boolean)
  if (!parts.length || parts.some(part => part === '.' || part === '..' || /[\\?#]/.test(part))) throw new Error('Invalid SharePoint data file path.')
  return [...parts.slice(0, -1), 'Snapshots'].join('/')
}

export function freezeSnapshot(state: AppState, type: Snapshot['type'], month: string, createdBy: string, build: unknown) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid snapshot month.')
  // Explicit data whitelist: no connection settings, authentication or recursive snapshot history.
  const { schemaVersion, people, activities, efforts, baselines, periods, releases, audits, masters, azureWorkItems, azureBacklogScope } = state
  return structuredClone({ format: 'demand-planning-snapshot', formatVersion: 1, id: crypto.randomUUID(),
    title: `${type} — ${month}`, type, month, createdAt: new Date().toISOString(), createdBy, build,
    data: { schemaVersion, people, activities, efforts, baselines, periods, releases, audits, masters, azureWorkItems, azureBacklogScope } })
}

export async function uploadSnapshot(request: SnapshotRequest, folder: string, snapshot: ReturnType<typeof freezeSnapshot>): Promise<CloudSnapshotFile> {
  const path = [...folder.split('/'), `${snapshot.month}-${snapshot.type.replaceAll(' ', '-')}-${snapshot.id}.json`].map(encodeURIComponent).join('/')
  const body = JSON.stringify(snapshot, null, 2)
  if (new Blob([body]).size > 200 * 1024 * 1024) throw new Error('Snapshot exceeds the 200 MB upload limit.')
  const response = await request(`/root:/${path}:/content?@microsoft.graph.conflictBehavior=fail`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
  if (!response.ok) throw new Error(`Snapshot upload failed (${response.status}). No browser snapshot was saved.`)
  const item = await response.json() as CloudSnapshotFile
  if (!item.id) throw new Error('SharePoint did not confirm a snapshot file ID. Refresh history before retrying.')
  const check = await request(`/items/${encodeURIComponent(item.id)}/content`, { cache: 'no-store' })
  if (!check.ok || await check.text() !== body) throw new Error('Snapshot may exist in SharePoint, but read-back verification failed. Refresh history before retrying. No browser snapshot was saved.')
  return item
}

export async function listSnapshots(request: SnapshotRequest, folder: string): Promise<CloudSnapshotFile[]> {
  const path = folder.split('/').map(encodeURIComponent).join('/')
  const files: CloudSnapshotFile[] = []
  let next = `/root:/${path}:/children?$select=id,name,webUrl,createdDateTime,file&$top=200`
  while (next) {
    const response = await request(next, { cache: 'no-store' })
    if (response.status === 404 && !files.length) return []
    if (!response.ok) throw new Error(`Unable to load SharePoint snapshot history (${response.status}).`)
    const page = await response.json()
    files.push(...(page.value ?? []).filter((item: { name: string; file?: unknown }) => item.file && /^\d{4}-\d{2}-(LTE|PI-Review|Monthly-Pack)-[\da-f-]+\.json$/.test(item.name)))
    next = page['@odata.nextLink'] ?? ''
  }
  return files.sort((a, b) => (b.createdDateTime ?? '').localeCompare(a.createdDateTime ?? ''))
}
