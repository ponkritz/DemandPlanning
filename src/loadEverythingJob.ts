import { isRunning, runInBackground } from './backgroundJobs.ts'
import { beginStreamsLoad, endStreamsLoad, markStreamsLoaded } from './streamsUpdate.ts'

// GIT-33…GIT-35: Load everything from Git as a background job (product owner, 2026-11-26: "Make the Loading as a Backend
// Process.. move it into Jobs Done"). The forced pop-up (GIT-30) and Admin → Data & sharing → Load from Git start the
// same job; it is listed in the top bar's Background jobs (Jobs done) — running with the part being loaded, then done
// with what was loaded, or failed naming each part that failed — and the app can be used meanwhile. One load at a time:
// a second start while one runs starts nothing (null).
// While it runs, a write of this computer to the Streams file counts as loaded (beginStreamsLoad, GIT-29); when every part
// loaded, the version of the Streams file it read or wrote last is recorded (markStreamsLoaded), so the forced pop-up
// does not come back for it.
export const loadEverythingJobKey = 'git:load-everything'
export const loadEverythingRunning = () => isRunning(loadEverythingJobKey)
export interface LoadResult { loaded: string[]; failed: string[] }
export type Load = (progress: (text: string) => void) => Promise<LoadResult>

export function loadJobText(result: LoadResult) {
  if (!result.failed.length) return `Loaded: ${result.loaded.join('; ') || 'nothing'}.`
  return `Not loaded — ${result.failed.join(' · ')}${result.loaded.length ? `. Loaded: ${result.loaded.join('; ')}.` : ''}`
}

// Starts the job; resolves with the load's result when it ends, or null when a load is already running.
export function startLoadEverything(load: Load, repository: string, versionNow: () => string | null, run = runInBackground): Promise<LoadResult> | null {
  let settle: (result: LoadResult) => void = () => undefined
  const done = new Promise<LoadResult>((resolve) => { settle = resolve })
  const started = run(loadEverythingJobKey, 'Load everything from Git', async (progress) => {
    beginStreamsLoad(repository)
    let result: LoadResult
    try { result = await load(progress) } catch (failure) { result = { loaded: [], failed: [failure instanceof Error ? failure.message : String(failure)] } } finally { endStreamsLoad(repository) }
    if (!result.failed.length) markStreamsLoaded(repository, versionNow())
    settle(result)
    return { text: loadJobText(result), failed: result.failed.length > 0 }
  })
  return started ? done : null
}
