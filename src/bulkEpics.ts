// QV-59: the Epic each stream's bulk Feature creation works under — chosen per user (this browser) over a shared
// default (the shared settings in Git) over the built-in one (DP 13946, Content 22919; IOCC has none built in). The
// Feature setup of that Epic (personal or shared, CON-63) gives the DoD, release type sets, User Stories and QE Mapping
// columns.
export const bulkStreams = ['DP', 'IOCC', 'Content'] as const
export type BulkStream = typeof bulkStreams[number]
export const builtInBulkEpics: Partial<Record<BulkStream, number>> = { DP: 13946, Content: 22919 }
export function normalizeBulkEpics(value: unknown): Partial<Record<BulkStream, number>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result: Partial<Record<BulkStream, number>> = {}
  for (const [stream, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = bulkStreams.find((entry) => entry.toLowerCase() === stream.trim().toLowerCase())
    const id = Number(raw)
    if (name && Number.isSafeInteger(id) && id > 0) result[name] = id
  }
  return Object.keys(result).length ? result : undefined
}
export type BulkEpicSource = 'mine' | 'shared' | 'built-in' | 'none'
export function bulkEpicFor(stream: BulkStream, shared: Partial<Record<BulkStream, number>> | undefined, mine: Partial<Record<BulkStream, number>> | undefined): { epicId?: number; source: BulkEpicSource } {
  if (mine?.[stream]) return { epicId: mine[stream], source: 'mine' }
  if (shared?.[stream]) return { epicId: shared[stream], source: 'shared' }
  if (builtInBulkEpics[stream]) return { epicId: builtInBulkEpics[stream], source: 'built-in' }
  return { source: 'none' }
}
const mineKey = 'demand-planning-bulk-epics-v1'
export function loadMyBulkEpics(storage: Pick<Storage, 'getItem'> = localStorage) { try { return normalizeBulkEpics(JSON.parse(storage.getItem(mineKey) ?? 'null')) ?? {} } catch { return {} } }
export function saveMyBulkEpics(value: Partial<Record<BulkStream, number>>, storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage) {
  try { const clean = normalizeBulkEpics(value); if (clean) storage.setItem(mineKey, JSON.stringify(clean)); else storage.removeItem(mineKey) } catch { /* this visit only */ }
}
