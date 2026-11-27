import { isRunning, runInBackground } from './backgroundJobs.ts'
import { beginStreamsLoad, endStreamsLoad, markStreamsLoaded } from './streamsUpdate.ts'

// GIT-33…GIT-35, GIT-36…GIT-38: the two loads from Git, each a background job in the top bar's Background jobs (Jobs done)
// — running with the part being loaded, then done with what was loaded, or failed naming each part that failed — while
// the app can be used.
// - "Load latest Release Details" (mapping): the forced pop-up's load (GIT-36) — only the Stream mapping and its
//   companions: the connection setup (azure-views.json with its clean-up and removal markers and the person's Other
//   views, CON-120) and the custom streams (custom-streams.json). Not the planning data, roles, Feature setup, on-prem
//   view data or Windchill exports: the Release Details pages fetch their data as they always do.
// - "Load everything from Git" (everything): Admin → Data & history → Git storage (GIT-37) — everything shared in Git.
// One load at a time, of either kind (GIT-34, GIT-38): while one runs, neither starts (null). Both read the Streams file,
// so either records its version when every part loaded (markStreamsLoaded), and a write of this computer to the file
// during either counts as loaded (beginStreamsLoad, GIT-29).
export type LoadKind = 'mapping' | 'everything'
export const loadJobKeys: Record<LoadKind, string> = { mapping: 'git:load-release-details', everything: 'git:load-everything' }
export const loadJobLabels: Record<LoadKind, string> = { mapping: 'Load latest Release Details', everything: 'Load everything from Git' }
export const loadEverythingJobKey = loadJobKeys.everything
export const loadJobRunning = () => isRunning(loadJobKeys.mapping) || isRunning(loadJobKeys.everything)
export interface LoadResult { loaded: string[]; failed: string[] }
export type Load = (progress: (text: string) => void) => Promise<LoadResult>

export function loadJobText(result: LoadResult) {
  if (!result.failed.length) return `Loaded: ${result.loaded.join('; ') || 'nothing'}.`
  return `Not loaded — ${result.failed.join(' · ')}${result.loaded.length ? `. Loaded: ${result.loaded.join('; ')}.` : ''}`
}

// Starts the job of that kind; resolves with the load's result when it ends, or null when a load (of either kind) runs.
export function startLoadJob(kind: LoadKind, load: Load, repository: string, versionNow: () => string | null, run = runInBackground): Promise<LoadResult> | null {
  if (loadJobRunning()) return null
  let settle: (result: LoadResult) => void = () => undefined
  const done = new Promise<LoadResult>((resolve) => { settle = resolve })
  const started = run(loadJobKeys[kind], loadJobLabels[kind], async (progress) => {
    beginStreamsLoad(repository)
    let result: LoadResult
    try { result = await load(progress) } catch (failure) { result = { loaded: [], failed: [failure instanceof Error ? failure.message : String(failure)] } } finally { endStreamsLoad(repository) }
    if (!result.failed.length) markStreamsLoaded(repository, versionNow())
    settle(result)
    return { text: loadJobText(result), failed: result.failed.length > 0 }
  })
  return started ? done : null
}
