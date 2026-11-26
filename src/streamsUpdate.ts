// GIT-29…GIT-31: the forced "Load everything from Git". Whenever the shared Streams file (azure-views.json: the Stream
// mapping) in the Git data repository is a version this browser has not loaded with Load everything from Git, the app
// shows a blocking pop-up whose only action loads everything. What was loaded is recorded per repository by the
// file's version (its blob sha), so the pop-up shows once per change — and once for everyone after this release, as no
// browser has a record yet. A write of this computer to the file that replaced the version loaded here counts as
// loaded (it is this computer's own change); a write over a version not loaded here does not.
const loadedKey = 'demand-planning-streams-loaded-v1'
type StorageRW = Pick<Storage, 'getItem' | 'setItem'>
function readLoaded(storage: Pick<Storage, 'getItem'>): Record<string, string> {
  try { const raw = JSON.parse(storage.getItem(loadedKey) ?? '{}') as unknown; return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string> : {} } catch { return {} }
}
export const loadedStreamsVersion = (repository: string, storage: Pick<Storage, 'getItem'> = localStorage) => readLoaded(storage)[repository] ?? ''
export function markStreamsLoaded(repository: string, version: string | null, storage: StorageRW = localStorage) {
  if (!repository || !version) return
  try { storage.setItem(loadedKey, JSON.stringify({ ...readLoaded(storage), [repository]: version })) } catch { /* the pop-up shows again next start */ }
}
// The repositories whose forced load is running here: a write of this computer meanwhile (the move of CON-121 during
// the load's sync, the duplicate clean-up at start) is part of what is being loaded.
const loading = new Set<string>()
export function beginStreamsLoad(repository: string) { if (repository) loading.add(repository) }
export function endStreamsLoad(repository: string) { loading.delete(repository) }
// This computer's own write of the file (before → after): loaded when the version it replaced was the one loaded here,
// or while this computer's forced load is running.
export function markOwnStreamsWrite(repository: string, before: string | null, after: string | null, storage: StorageRW = localStorage) {
  if (!repository || !after) return
  if (loading.has(repository) || (before && loadedStreamsVersion(repository, storage) === before)) markStreamsLoaded(repository, after, storage)
}

export interface StreamsUpdateInput {
  connected: boolean
  isSample: boolean
  viewingAs: boolean
  // The start sync has read the shared setup (so a version is known and this computer's own move is done).
  ready: boolean
  repository: string
  // The file's version in Git as last read or found by the open-app check (GIT-18); '' or null when it is missing.
  version: string | null
  // A save of this computer to the file is on its way (its version is this computer's own).
  saving: boolean
}
// Whether the pop-up shows. Never in View as, with the synthetic sample, without Git storage, without the file, before
// the start sync or while this computer is saving the file. It can never be skipped (GIT-31).
export function streamsUpdateDue(input: StreamsUpdateInput, storage: Pick<Storage, 'getItem'> = localStorage) {
  if (!input.connected || input.isSample || input.viewingAs || !input.ready || input.saving || !input.repository || !input.version) return false
  return loadedStreamsVersion(input.repository, storage) !== input.version
}

// GIT-32: a failed load that is a GitHub outage — every failure is a server error (HTTP 500, 502, 503, 504) or no answer
// at all (network, VPN, proxy; the browser's own words, as GIT-27 tells them apart) — and not something the connection
// setup can fix (a token refused, a repository not found). Only then does the pop-up offer Continue without loading.
const outageText = /\(HTTP 50[0234]\)|failed to fetch|networkerror|load failed|network ?error|network request failed|could not be reached/i
export const isGitOutage = (failed: readonly string[] | undefined) => Boolean(failed?.length) && failed!.every((line) => outageText.test(line))
