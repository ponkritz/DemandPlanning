import type { AppState, AzureWorkItem } from './domain'

// A saved Azure DevOps work item as the views expect it: an integer ID and the text fields every item carries.
const itemTextFields = ['key', 'organization', 'project', 'title', 'state', 'workItemType', 'assignedTo', 'areaPath', 'iterationPath', 'tags', 'url', 'syncedAt']
export function validAzureWorkItem(value: unknown): value is AzureWorkItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return Number.isSafeInteger(item.id) && itemTextFields.every((key) => typeof item[key] === 'string')
}
export const validFetchedAt = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))

export const legacyStateKey = 'demand-planning-mvp-v1'
const databaseName = 'demand-planning-data-v1'
const storeName = 'snapshots'
const stateKey = 'current'
export interface StateRepository { read: () => Promise<unknown>; write: (state: AppState) => Promise<void> }

export function validateBackup(value: unknown): AppState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Not a Demand Planning JSON backup.')
  const state = value as AppState
  if (state.schemaVersion !== 1 || !['people', 'activities', 'efforts', 'baselines', 'periods', 'releases', 'audits', 'snapshots', 'masters'].every((key) => Array.isArray((value as Record<string, unknown>)[key])) || (state.azureWorkItems !== undefined && !Array.isArray(state.azureWorkItems)) || (state.capacitySettings !== undefined && (!state.capacitySettings || typeof state.capacitySettings !== 'object' || Array.isArray(state.capacitySettings))) || (state.releaseSource !== undefined && (!state.releaseSource || typeof state.releaseSource !== 'object' || !Array.isArray(state.releaseSource.items))) || (state.releasePlans !== undefined && !Array.isArray(state.releasePlans)) || (state.baselineRules !== undefined && !Array.isArray(state.baselineRules)) || (state.azureSources !== undefined && !Array.isArray(state.azureSources)) || (state.releaseScopes !== undefined && !Array.isArray(state.releaseScopes)) || (state.resourceProfiles !== undefined && (!state.resourceProfiles || typeof state.resourceProfiles !== 'object' || Array.isArray(state.resourceProfiles)))) throw new Error('Backup schema is invalid or unsupported. Existing data has not been replaced.')
  // Reject malformed records before they reach views or are persisted as a restored backup.
  for (const key of ['people', 'activities', 'efforts', 'baselines', 'periods', 'releases', 'audits', 'snapshots', 'masters', 'azureWorkItems'] as const) {
    if ((state[key] ?? []).some((item) => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error(`Invalid ${key} records in backup.`)
  }
  if (state.azureWorkItems?.some((item) => !validAzureWorkItem(item))) throw new Error('Invalid Azure work items in backup.')
  // View data: each source names its connection, carries a fetch time and holds valid work items only.
  if (state.azureSources?.some((source) => !source || typeof source !== 'object' || typeof source.connectionId !== 'string' || !validFetchedAt(source.fetchedAt) || !Array.isArray(source.items) || source.items.some((item) => !validAzureWorkItem(item)))) throw new Error('Invalid Azure view data in backup.')
  return state
}

function openDatabase(factory: IDBFactory | undefined): Promise<IDBDatabase> {
  if (!factory) return Promise.reject(new Error('IndexedDB is unavailable. Check browser privacy or organization storage policies.'))
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 1)
    let finished = false
    const fail = (error: Error) => { if (!finished) { finished = true; clearTimeout(timeout); reject(error) } }
    const timeout = setTimeout(() => fail(new Error('Browser database timed out. Close other app tabs and retry; do not clear browser data.')), 15000)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName) }
    request.onerror = () => fail(request.error ?? new Error('Browser database could not be opened.'))
    request.onblocked = () => fail(new Error('Browser database is blocked by another app tab. Close that other tab and retry.'))
    request.onsuccess = () => {
      const db = request.result
      if (finished) { db.close(); return }
      finished = true; clearTimeout(timeout)
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

export function indexedStateRepository(factory: IDBFactory | undefined = globalThis.indexedDB): StateRepository {
  async function access(mode: IDBTransactionMode, state?: AppState) {
    const db = await openDatabase(factory)
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode)
        const store = transaction.objectStore(storeName)
        const request = mode === 'readwrite' ? store.put(state, stateKey) : store.get(stateKey)
        let result: unknown
        request.onsuccess = () => { result = request.result }
        // Request success alone is not a committed save: resolve only after transaction completion.
        transaction.oncomplete = () => resolve(result)
        transaction.onabort = () => reject(transaction.error ?? new Error('Browser save was aborted.'))
        transaction.onerror = () => reject(transaction.error ?? new Error('Browser database operation failed.'))
      })
    } finally { db.close() }
  }
  return { read: () => access('readonly'), write: async (state) => { await access('readwrite', state) } }
}

export async function loadBrowserState(repository: StateRepository, legacyStorage: Pick<Storage, 'getItem'>, seed: AppState) {
  // Never fall back to a seed on a failed database read: that could overwrite unread saved data.
  const saved = await repository.read()
  if (saved !== undefined) return { state: validateBackup(saved), source: 'indexeddb' as const }
  const legacy = legacyStorage.getItem(legacyStateKey)
  if (legacy !== null) {
    const state = validateBackup(JSON.parse(legacy))
    await repository.write(state)
    // Keep the legacy snapshot as a rollback copy; no localStorage.removeItem / clear.
    return { state, source: 'migrated' as const }
  }
  return { state: structuredClone(seed), source: 'new' as const }
}

export function createStateWriter(repository: StateRepository) {
  let tail: Promise<void> = Promise.resolve()
  return (state: AppState) => {
    const snapshot = structuredClone(state)
    const next = tail.catch(() => undefined).then(() => repository.write(snapshot))
    tail = next
    return next
  }
}
