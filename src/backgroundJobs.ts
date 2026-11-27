// Azure DevOps writes that take a while (New Feature, Bulk actions, Monthly Time Writing) run as background jobs: the
// form or page hands the work over and stays usable, and the top bar lists each job with its progress and result.
// UI-STANDARDS §8 (QV-63): the results of other actions (an import, Load from Git, Save to Git, Refresh) are entries
// of the same list — long work as a job, an instant result as a finished entry (recordJob) — not notices on the page.
// Jobs live for this page load only (nothing is stored); while one runs, leaving the page asks first.
export type JobState = 'running' | 'done' | 'error'
// PIR-84: action — a follow-up the finished job offers in the list (Retry failed), used once.
export interface JobAction { label: string; run: () => void }
export interface Job { id: number; key: string; label: string; state: JobState; detail: string; started: number; finished?: number; action?: JobAction }
// What the work reports: the result line, and whether it is a failure (partly done counts as a failure); action: a
// follow-up offered with the result (PIR-84: Retry failed).
export interface JobResult { text: string; failed?: boolean; action?: JobAction }

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
      update(id, { state: result.failed ? 'error' : 'done', detail: result.text, finished: now(), ...(result.action ? { action: result.action } : {}) })
    } catch (failure) {
      update(id, { state: 'error', detail: failure instanceof Error ? failure.message : 'The job failed.', finished: now() })
    }
  })()
  return true
}
// An instant result (an import, a check that failed before any work started) as a finished entry; returns its id.
export function recordJob(key: string, label: string, result: JobResult, now = Date.now): number {
  const id = nextId++, at = now()
  const job: Job = { id, key, label, state: result.failed ? 'error' : 'done', detail: result.text, started: at, finished: at }
  jobs = [job, ...jobs].slice(0, 20)
  emit()
  return id
}
// PIR-84: run a finished job's follow-up once — it is taken off the entry first, so a second press does nothing.
export function runJobAction(id: number) {
  const action = jobs.find((job) => job.id === id)?.action
  if (!action) return
  update(id, { action: undefined })
  action.run()
}
export function clearFinishedJobs() { jobs = jobs.filter((job) => job.state === 'running'); emit() }
// For tests: start from an empty list.
export function resetJobs() { jobs = []; nextId = 1; emit() }
