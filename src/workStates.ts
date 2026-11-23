// Owner decision 10: a work item is **finished** when its State is Closed, Resolved, Completed or Done — one list for
// every page (Pulse Check, the Monthly pack, Planning Overview, Insights, My Tasks, query views). Removed and Cut are
// not finished: they are gone, and pages that list pending work leave them out separately.
export const finishedStates = ['closed', 'resolved', 'completed', 'done'] as const
const finished = new Set<string>(finishedStates)
export const isFinishedState = (state: string | undefined) => finished.has((state ?? '').trim().toLowerCase())
