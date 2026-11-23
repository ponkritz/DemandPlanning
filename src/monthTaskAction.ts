import type { AzureWorkItem } from './domain'
import { addMonthTasks, utcMonthLabel, ensureMonthTask, HierarchyCreationError, syncTimeWritingTitles, type AzureConfig, type AzureTransport } from './azureDevOps.ts'
import { runInBackground } from './backgroundJobs.ts'
import { setupHours, type FeatureSetups } from './featureSetup.ts'
import { adhocAfterLock } from './planningLock.ts'
import { featureOf } from './myWork.ts'
import { timeWritingMonth } from './azureInsights.ts'

// "＋ Time Writing Task" on a Feature or User Story row (BKL-22): this month's Task for the person, under the Feature
// (the row's own Feature, or the one above the Story), placed by the usual rules (planMonthStory: an existing Task of
// theirs is reused, their own Time Writing story first) — the same as Bulk actions, one Feature at a time. Leave and
// training under the Team Holidays and Training Epic work the same way. After the planning lock the new Task is ad-hoc.
// BKL-28: for the month selected in the header; a new Task gets the Epic setup's default hours.
export async function addMonthTask(config: AzureConfig, pat: string, items: AzureWorkItem[], item: AzureWorkItem, assignee: string, month = utcMonthLabel(), setups?: FeatureSetups | null) {
  const feature = featureOf(items, item)
  if (!feature) throw new Error(`#${item.id} has no Feature above it to hold a Time Writing Task.`)
  const byId = new Map(items.map((entry) => [entry.id, entry]))
  let epic: AzureWorkItem | undefined = feature
  for (let guard = 0; epic && epic.workItemType !== 'Epic' && guard < 6; guard += 1) epic = epic.parentId == null ? undefined : byId.get(epic.parentId)
  const result = await ensureMonthTask(config, pat, feature.id, assignee, month, undefined, adhocAfterLock(month), setupHours(setups, epic?.id))
  const text = result.status === 'created' ? `${month} Time Writing Task created under ${result.storyCreated ? 'a new' : 'the'} story “${result.story.title}”.` : `Your ${month} Time Writing Task under “${feature.title}” already exists.`
  return { result, feature, text, changed: [result.task, ...(result.storyCreated || result.storyAssigned ? [result.story] : [])] }
}

// BKL-34: "＋ Time Writing Task" for several months at once, each with its own hours (Original Estimate; Completed Work
// for a month not in the future), by the one Task rule (addMonthTasks → ensureMonthTask): an existing Task of the person
// is reused and gets the hours typed for it; a new one gets them, else the Epic setup's default; ad-hoc after the lock.
export interface MonthEntry { month: string; originalEstimate?: number; completedWork?: number }
export async function addMonthTasksFor(config: AzureConfig, pat: string, items: AzureWorkItem[], item: AzureWorkItem, assignee: string, entries: MonthEntry[], setups?: FeatureSetups | null, progress?: (text: string) => void, transport?: AzureTransport) {
  const feature = featureOf(items, item)
  if (!feature) throw new Error(`#${item.id} has no Feature above it to hold a Time Writing Task.`)
  if (!entries.length) throw new Error('Choose at least one month.')
  const byId = new Map(items.map((entry) => [entry.id, entry]))
  let epic: AzureWorkItem | undefined = feature
  for (let guard = 0; epic && epic.workItemType !== 'Epic' && guard < 6; guard += 1) epic = epic.parentId == null ? undefined : byId.get(epic.parentId)
  const changed = await addMonthTasks(config, pat, feature.id, assignee, entries.map((entry) => ({ ...entry, adhoc: adhocAfterLock(entry.month) })), setupHours(setups, epic?.id), transport, progress)
  const months = entries.map((entry) => entry.month)
  const text = `Time Writing Task${months.length === 1 ? '' : 's'} for ${months.join(', ')} under “${feature.title}” ready (an existing one is reused).`
  return { feature, changed, text }
}

// BKL-35: the person's month Tasks already under the Feature (any story), by month key "YYYY-MM" — what the pop-up
// warns about. A month listed there gets no second Task: the hours typed for it override the Task's hours.
export function existingMonthTasks(items: AzureWorkItem[], feature: AzureWorkItem | undefined, email: string) {
  const found = new Map<string, AzureWorkItem>()
  const who = email.trim().toLowerCase()
  if (!feature || !who) return found
  const byId = new Map(items.map((entry) => [entry.id, entry]))
  const under = (task: AzureWorkItem) => { let at: AzureWorkItem | undefined = task; for (let guard = 0; at && guard < 4; guard += 1) { if (at.id === feature.id) return true; at = at.parentId == null ? undefined : byId.get(at.parentId) } return false }
  for (const task of items) if (task.workItemType === 'Task' && task.assignedToEmail === who && task.state.toLowerCase() !== 'removed' && under(task)) { const key = timeWritingMonth(task.title); if (key) found.set(key, task) }
  return found
}

const hoursText = (task: AzureWorkItem) => [task.originalEstimate != null ? `Original Estimate ${task.originalEstimate} h` : '', task.completedWork != null ? `Completed Work ${task.completedWork} h` : ''].filter(Boolean).join(', ') || 'no hours yet'
// The warning on a month that already has a Task, and the confirmation before Add when any month has one.
export const existingMonthNotice = (label: string, task: AzureWorkItem, who: string) => `There is already a Time Writing Task for ${label} (#${task.id}, ${hoursText(task)})${who ? ` for ${who}` : ''}. No second Task is created: the hours you type here will override its hours.`
export function overrideConfirmText(months: { label: string; task: AzureWorkItem; typed: boolean }[]) {
  const lines = months.map(({ label, task, typed }) => `• ${label}: Task #${task.id} (${hoursText(task)})${typed ? ' — its hours will be overridden by the ones typed' : ' — no hours typed, it stays as it is'}`)
  return `${months.length === 1 ? 'This month already has' : 'These months already have'} a Time Writing Task:\n${lines.join('\n')}\n\nNo second Task is created. Continue?`
}

// BKL-36: after a Feature, a Time Writing story or a month Task is saved, the Feature's Time Writing titles are brought in
// line with its title, silently (no question asked). Never fails the save: a failure only adds a short note.
export async function syncTitlesAfterSave(config: AzureConfig, pat: string, items: AzureWorkItem[], saved: AzureWorkItem, transport?: AzureTransport): Promise<{ renamed: AzureWorkItem[]; note: string }> {
  const feature = featureOf([...items.filter((entry) => entry.id !== saved.id), saved], saved)
  if (!feature) return { renamed: [], note: '' }
  try {
    const renamed = await syncTimeWritingTitles(config, pat, feature.id, transport)
    return { renamed, note: renamed.length ? ` Time Writing titles updated to the Feature name (${renamed.length}).` : '' }
  } catch (failure) {
    return { renamed: [], note: ` Time Writing titles not updated: ${failure instanceof Error ? failure.message : 'failed'}.` }
  }
}

// BKL-37: "Add n months" runs as a background job like every other long Azure DevOps write (NAV-36): the pop-up closes
// at once and the top bar shows the job's progress and result. One job per Feature and person at a time; returns
// whether it started. Tasks made before a failure are still handed to onDone so the page shows them.
export function startMonthTasksJob(input: { config: AzureConfig; pat: string; items: AzureWorkItem[]; item: AzureWorkItem; assignee: string; entries: MonthEntry[]; setups?: FeatureSetups | null; onDone: (text: string, changed: AzureWorkItem[]) => void; onFailed?: (text: string, changed: AzureWorkItem[]) => void; transport?: AzureTransport }) {
  const feature = featureOf(input.items, input.item)
  const months = input.entries.map((entry) => entry.month)
  const label = `Time Writing Task${months.length === 1 ? '' : 's'} ${months.join(', ')} · ${feature ? `#${feature.id}` : `#${input.item.id}`}`
  return runInBackground(`month-tasks:${feature?.id ?? input.item.id}:${input.assignee.trim().toLowerCase()}`, label, async (progress) => {
    try {
      const done = await addMonthTasksFor(input.config, input.pat, input.items, input.item, input.assignee, input.entries, input.setups, progress, input.transport)
      input.onDone(done.text, done.changed)
      return { text: done.text }
    } catch (failure) {
      const made = failure instanceof HierarchyCreationError ? failure.createdItems : []
      const reason = (failure instanceof Error ? failure.message : 'The Time Writing Tasks could not be added').trim().replace(/([^.!?])$/, '$1.')
      const text = `${reason}${made.length ? ` Made before it stopped: ${made.map((entry) => `#${entry.id}`).join(', ')}.` : ''}`
      ;(input.onFailed ?? input.onDone)(text, made)
      return { text, failed: true }
    }
  })
}
