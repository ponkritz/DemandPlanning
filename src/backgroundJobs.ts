// Azure DevOps writes that take a while (New Feature, Bulk actions, Monthly Time Writing) run as background jobs: the
// form or page hands the work over and stays usable, and the top bar lists each job with its progress and result.
// Jobs live for this page load only (nothing is stored); while one runs, leaving the page asks first.
export type JobState = 'running' | 'done' | 'error'
export interface Job { id: number; key: string; label: string; state: JobState; detail: string; started: number; finished?: number }
// What the work reports: the result line, and whether it is a failure (partly done counts as a failure).
export interface JobResult { text: string; failed?: boolean }

let jobs: Job[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => { for (const listener of listeners) listener() }
const update = (id: number, change: Partial<Job>) => { jobs = jobs.map((job) => job.id === id ? { ...job, ...change } : job); emit() }

export const listJobs = () => jobs
export function subscribeJobs(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export const isRunning = (key: string) => jobs.some((job) => job.key === key && job.state === 'running')
export const runningCount = () => jobs.filter((job) => job.state === 'running').length

// Start a job unless one with the same key is still running (the same write twice); returns whether it started.
// The work gets a progress callback; its result (or the error it throws) becomes the job's last line.
export function runInBackground(key: string, label: string, work: (progress: (text: string) => void) => Promise<JobResult>, now = Date.now): boolean {
  if (isRunning(key)) return false
  const id = nextId++
  const job: Job = { id, key, label, state: 'running', detail: 'Starting…', started: now() }
  jobs = [job, ...jobs].slice(0, 20)
  emit()
  void (async () => {
    try {
      const result = await work((text) => update(id, { detail: text }))
      update(id, { state: result.failed ? 'error' : 'done', detail: result.text, finished: now() })
    } catch (failure) {
      update(id, { state: 'error', detail: failure instanceof Error ? failure.message : 'The job failed.', finished: now() })
    }
  })()
  return true
}
export function clearFinishedJobs() { jobs = jobs.filter((job) => job.state === 'running'); emit() }
// For tests: start from an empty list.
export function resetJobs() { jobs = []; nextId = 1; emit() }
