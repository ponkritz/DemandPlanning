import type { AzureWorkItem } from './domain'
import { isMonthTask, isTimeWritingStory, timeWritingMonth } from './azureInsights.ts'
import { actualsLocked, type LockSettings } from './planningLock.ts'
import { isFinishedState } from './workStates.ts'
import { collectionUrl, isCloudBase, type AzureConfig } from './azureClient.ts'

// ACT-24…ACT-27: the automatic State rules of a month Time Writing Task (a "Month Task") — pure, so that the save on
// Time Writing, the Edit form and the background check at start (ACT-26) all follow one rule.
// - Hours (Original Estimate or Completed Work above 0) set a **New** Month Task Active, then its Time Writing story
//   when New, then the story's Feature when New (ACT-24, ACT-25). Only New moves forward: an item that is Resolved,
//   Closed, Completed or Done is never reopened, a Removed one stays Removed, any other state is left alone.
// - A Month Task that is not Closed is set to Closed when the Actuals of its month are locked (the lock day has ended,
//   midnight UTC, or the month was locked early: the same rule as the Time Writing page) or when its Feature is
//   finished (Resolved, Closed, Completed or Done) (ACT-26). Its Time Writing story follows once every Task under it is
//   Closed, when the story is the person's own (ACT-27). A Feature is never closed automatically.
// - The background check only ever looks at the person's **own** Month Tasks: assigned to their work email.
// The State names are the ones the app writes everywhere (Agile: New → Active → Closed).

export type TargetState = 'Active' | 'Closed'
export type SkipReason = 'not-month-task' | 'not-own' | 'no-hours' | 'already' | 'finished' | 'removed' | 'not-new'
export interface StateStep {
  item: AzureWorkItem
  // The States written in order (a New User Story goes New → Active → Closed).
  states: TargetState[]
  to: TargetState
  why: string
  // Steps (by item id) that must have succeeded first: a story is closed only after its Tasks, a Feature made Active
  // only after its story.
  needs: number[]
}
export interface StateSkip { item: AzureWorkItem; reason: SkipReason; text: string }
export interface StatePlan { steps: StateStep[]; skipped: StateSkip[] }

const stateOf = (item: Pick<AzureWorkItem, 'state'>) => item.state.trim().toLowerCase()
const sameScope = (a: AzureWorkItem, b: AzureWorkItem) => a.organization === b.organization && a.project === b.project
export const hasHours = (task: Pick<AzureWorkItem, 'originalEstimate' | 'completedWork'>) => (task.originalEstimate ?? 0) > 0 || (task.completedWork ?? 0) > 0
// Own = assigned to the person's work email (never matched by display name: an automatic write needs the exact person).
export const isOwnTask = (item: Pick<AzureWorkItem, 'assignedToEmail'>, email: string) => { const who = email.trim().toLowerCase(); return Boolean(who) && (item.assignedToEmail ?? '').trim().toLowerCase() === who }
export const stateLabel = (item: AzureWorkItem) => item.workItemType === 'Task' ? 'Task' : isTimeWritingStory(item) ? 'Time Writing story' : item.workItemType

// Why an item is not moved forward to Active (null: it is New and may be).
function notNew(item: AzureWorkItem): StateSkip | null {
  const state = stateOf(item)
  if (state === 'new') return null
  if (state === 'active') return { item, reason: 'already', text: '' }
  if (state === 'removed') return { item, reason: 'removed', text: `${stateLabel(item)} #${item.id} is Removed and stays Removed.` }
  if (isFinishedState(state)) return { item, reason: 'finished', text: `${stateLabel(item)} #${item.id} is ${item.state} and is not reopened.` }
  return { item, reason: 'not-new', text: '' }
}

// The Time Writing story above a Month Task, and the Feature above that story (same organization and project).
export function storyOf(items: AzureWorkItem[], task: AzureWorkItem) {
  return task.parentId == null ? undefined : items.find((item) => item.id === task.parentId && sameScope(item, task) && isTimeWritingStory(item))
}
export function featureAbove(items: AzureWorkItem[], item: AzureWorkItem) {
  const byId = new Map(items.filter((entry) => sameScope(entry, item)).map((entry) => [entry.id, entry])), seen = new Set<number>([item.id])
  for (let up = item.parentId == null ? undefined : byId.get(item.parentId); up && !seen.has(up.id); up = up.parentId == null ? undefined : byId.get(up.parentId)) { if (up.workItemType === 'Feature') return up; seen.add(up.id) }
  return undefined
}

// ACT-24, ACT-25: hours on a Month Task — Task, then its Time Writing story, then the story's Feature, each New → Active.
export function activationPlan(items: AzureWorkItem[], task: AzureWorkItem): StatePlan {
  const plan: StatePlan = { steps: [], skipped: [] }
  if (!isMonthTask(task)) { plan.skipped.push({ item: task, reason: 'not-month-task', text: '' }); return plan }
  if (!hasHours(task)) { plan.skipped.push({ item: task, reason: 'no-hours', text: '' }); return plan }
  const taskSkip = notNew(task)
  if (taskSkip) plan.skipped.push(taskSkip)
  else plan.steps.push({ item: task, states: ['Active'], to: 'Active', why: `${stateLabel(task)} #${task.id} set to Active (New before), because hours were entered.`, needs: [] })
  // A finished or Removed Task does not move its story or Feature.
  if (taskSkip && taskSkip.reason !== 'already' && taskSkip.reason !== 'not-new') return plan
  const story = storyOf(items, task)
  if (!story) return plan
  const storySkip = notNew(story)
  if (storySkip) plan.skipped.push(storySkip)
  else plan.steps.push({ item: story, states: ['Active'], to: 'Active', why: `Time Writing story #${story.id} set to Active (New before), because hours were entered.`, needs: taskSkip ? [] : [task.id] })
  if (storySkip && storySkip.reason !== 'already') return plan
  const feature = story.parentId == null ? undefined : items.find((item) => item.id === story.parentId && item.workItemType === 'Feature' && sameScope(item, story))
  if (!feature) return plan
  const featureSkip = notNew(feature)
  if (featureSkip) plan.skipped.push(featureSkip)
  else plan.steps.push({ item: feature, states: ['Active'], to: 'Active', why: `Feature #${feature.id} set to Active (New before), because its Time Writing story is Active.`, needs: storySkip ? [] : [story.id] })
  return plan
}

// ACT-26: why a Month Task is due to be Closed now ('' when it is not).
export function closeReason(items: AzureWorkItem[], task: AzureWorkItem, locks: LockSettings, now: Date) {
  const month = timeWritingMonth(task.title)
  if (!month) return ''
  if (actualsLocked(locks, month, now)) return `the Actuals of ${month} are locked`
  const feature = featureAbove(items, task)
  if (feature && isFinishedState(feature.state)) return `its Feature #${feature.id} is ${feature.state}`
  return ''
}

// ACT-26, ACT-27: the background check of the person's own Month Tasks (assigned to their work email). Closing comes
// first (a Task due to close is not made Active); a Task with hours that is still New is made Active as above.
export function ownMonthTaskPlan(items: AzureWorkItem[], email: string, locks: LockSettings, now: Date): StatePlan {
  const plan: StatePlan = { steps: [], skipped: [] }
  const planned = new Set<number>()
  const add = (step: StateStep) => { if (planned.has(step.item.id)) return; planned.add(step.item.id); plan.steps.push(step) }
  const closing: AzureWorkItem[] = []
  for (const task of items.filter(isMonthTask).sort((a, b) => a.id - b.id)) {
    if (!isOwnTask(task, email)) { plan.skipped.push({ item: task, reason: 'not-own', text: '' }); continue }
    const state = stateOf(task)
    if (state === 'removed') { plan.skipped.push({ item: task, reason: 'removed', text: '' }); continue }
    const reason = closeReason(items, task, locks, now)
    if (reason) {
      if (state === 'closed') { plan.skipped.push({ item: task, reason: 'already', text: '' }); continue }
      add({ item: task, states: ['Closed'], to: 'Closed', why: `Task #${task.id} set to Closed (${task.state} before), because ${reason}.`, needs: [] })
      closing.push(task)
      continue
    }
    const activation = activationPlan(items, task)
    for (const step of activation.steps) add(step)
    plan.skipped.push(...activation.skipped.filter((entry) => entry.reason !== 'already'))
  }
  // ACT-27: the person's own Time Writing story is closed once every Task under it (Removed ones aside) is Closed.
  const closed = new Set(closing.map((task) => task.id))
  const stories = [...new Map(closing.flatMap((task) => { const story = storyOf(items, task); return story ? [[story.id, story] as const] : [] })).values()].sort((a, b) => a.id - b.id)
  for (const story of stories) {
    const state = stateOf(story)
    if (!isOwnTask(story, email) || planned.has(story.id) || state === 'removed' || isFinishedState(state)) continue
    const tasks = items.filter((item) => item.parentId === story.id && sameScope(item, story) && stateOf(item) !== 'removed')
    if (!tasks.every((item) => stateOf(item) === 'closed' || closed.has(item.id))) continue
    add({ item: story, states: state === 'new' ? ['Active', 'Closed'] : ['Closed'], to: 'Closed', why: `Time Writing story #${story.id} set to Closed (${story.state} before), because all its Tasks are Closed.`, needs: tasks.filter((item) => closed.has(item.id)).map((item) => item.id) })
  }
  return plan
}

// The ids whose current State must be read again before the plan is written: the steps' items and, for a story to
// close, every Task under it.
export const planReads = (items: AzureWorkItem[], plan: StatePlan) => [...new Set(plan.steps.flatMap((step) => [step.item.id, ...(step.to === 'Closed' && step.item.workItemType !== 'Task' ? items.filter((item) => item.parentId === step.item.id && sameScope(item, step.item)).map((item) => item.id) : [])]))]

// ACT-23: "Features Working on" on Time Writing — the number of distinct Features that hold one of the person's Month
// Tasks of the month (Removed Tasks and Tasks with no Feature above them are not counted).
export function featuresWorkingOn(items: AzureWorkItem[], tasks: AzureWorkItem[]) {
  return new Set(tasks.filter((task) => stateOf(task) !== 'removed').flatMap((task) => { const feature = featureAbove(items, task); return feature ? [feature.key] : [] })).size
}

// ACT-26: why the background check does not run now ('' when it may): never with the synthetic sample, in View as,
// without the right to change a State, without a PAT or a work email, on an on-premises server (read-only), or before
// the Time Writing fetch and the lock settings are in.
export interface MonthTaskStatesGuard { config: AzureConfig | null; pat: string; email: string; fetched: string; busy: boolean; isSample: boolean; viewingAs: boolean; canWrite: boolean; locksLoaded: boolean }
export function monthTaskStatesBlocked(env: MonthTaskStatesGuard) {
  if (env.isSample) return 'sample'
  if (env.viewingAs) return 'view-as'
  if (!env.canWrite) return 'no-right'
  if (!env.config || !env.pat.trim() || !env.email.trim()) return 'not-connected'
  try { if (!isCloudBase(collectionUrl(env.config))) return 'on-premises' } catch { return 'on-premises' }
  if (!env.fetched || env.busy || !env.locksLoaded) return 'not-ready'
  return ''
}
