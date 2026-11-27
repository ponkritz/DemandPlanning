import type { AzureWorkItem } from './domain.ts'
import { mergeAzureWorkItems, readAzureWorkItems, updateAzureWorkItem, type AzureConfig } from './azureDevOps.ts'
import { runInBackground } from './backgroundJobs.ts'
import { activationPlan, ownMonthTaskPlan, planReads, stateLabel, type StatePlan, type StateStep } from './monthTaskStates.ts'
import type { LockSettings } from './planningLock.ts'
import { closeFollowUp, closeStates, followUpQuestion, isMine, isPending, type CloseFollowUp, type Me } from './myWork.ts'

// ATM-28: a User Story set to Active makes its Feature Active when the Feature is still New (no question asked: the
// Feature's work has started). Returns the updated Feature, or null when nothing had to change.
export async function activateFeatureOf(config: AzureConfig, pat: string, items: AzureWorkItem[], story: AzureWorkItem, write: (config: AzureConfig, pat: string, id: number, update: { state: string }) => Promise<AzureWorkItem> = updateAzureWorkItem): Promise<AzureWorkItem | null> {
  if (story.workItemType !== 'User Story' || story.state.trim().toLowerCase() !== 'active' || story.parentId == null) return null
  const feature = items.find((item) => item.id === story.parentId && item.workItemType === 'Feature' && item.organization === story.organization && item.project === story.project)
  if (!feature || feature.state.trim().toLowerCase() !== 'new') return null
  return write(config, pat, feature.id, { state: 'Active' })
}

// After an item is closed from My Tasks [Board] or a state check: ask the follow-up question (closeFollowUp) and, when
// confirmed, close the related items one by one in the staged order (New → Active → Closed), each write read back as
// usual. Items in a state that cannot be closed are reported, not written. Nothing is written without the confirmation.
export interface FollowUpResult { follow: CloseFollowUp; confirmed: boolean; closed: AzureWorkItem[]; skipped: string[]; failed: string[] }
export async function closeRelated(config: AzureConfig, pat: string, items: AzureWorkItem[], closed: AzureWorkItem, confirm: (question: string) => boolean, write: (config: AzureConfig, pat: string, id: number, update: { state: string }) => Promise<AzureWorkItem> = updateAzureWorkItem): Promise<FollowUpResult> {
  const follow = closeFollowUp(items, closed)
  const result: FollowUpResult = { follow, confirmed: false, closed: [], skipped: [], failed: [] }
  if (!follow) return result
  const targets = follow.kind === 'stories' ? follow.stories : [follow.feature]
  const closable = targets.filter((item) => closeStates(item).length)
  for (const item of targets.filter((item) => !closeStates(item).length)) result.skipped.push(`#${item.id} is ${item.state} and cannot be closed from here`)
  if (!closable.length) return result
  if (!confirm(followUpQuestion(follow))) return result
  result.confirmed = true
  for (const item of closable) {
    try { let updated = item; for (const state of closeStates(item)) updated = await write(config, pat, item.id, { state }); result.closed.push(updated) }
    catch (failure) { result.failed.push(`#${item.id}: ${failure instanceof Error ? failure.message : 'update failed'}`) }
  }
  return result
}

// ACT-18: Close Feature on Time Writing — the person's own open items under a Feature (Tasks, User Stories and the
// Feature itself), closed bottom-up. Only the person's items are closed; one is left open while open work of someone
// else is below it (so a Feature with other people's open work stays open), or when its state cannot be closed from
// here. The month Time Writing Task is closed with the rest, which makes its hours read-only on Time Writing.
export interface FeatureClosePlan { feature: AzureWorkItem; close: AzureWorkItem[]; kept: { item: AzureWorkItem; reason: string }[]; parentOf: Map<number, number> }
export function featureClosePlan(items: AzureWorkItem[], featureId: number, me: Me): FeatureClosePlan | null {
  const feature = items.find((item) => item.id === featureId && item.workItemType === 'Feature')
  if (!feature) return null
  const live = items.filter((item) => item.organization === feature.organization && item.project === feature.project && item.state.trim().toLowerCase() !== 'removed')
  const children = new Map<number, AzureWorkItem[]>()
  for (const item of live) if (item.parentId != null) children.set(item.parentId, [...(children.get(item.parentId) ?? []), item])
  const plan: FeatureClosePlan = { feature, close: [], kept: [], parentOf: new Map(live.flatMap((item) => item.parentId == null ? [] : [[item.id, item.parentId] as [number, number]])) }
  const seen = new Set<number>()
  // Whether the item is finished once the plan has run (closed already, or closed by it); children first.
  const visit = (item: AzureWorkItem): boolean => {
    if (seen.has(item.id)) return !isPending(item)
    seen.add(item.id)
    const below = (children.get(item.id) ?? []).sort((a, b) => a.id - b.id)
    const results = below.map(visit)
    if (!isPending(item)) return true
    if (!isMine(item, me)) return false
    const blockers = below.filter((child, index) => !results[index] && isPending(child))
    if (blockers.length) { plan.kept.push({ item, reason: `open work of others below it: ${blockers.map((child) => `#${child.id}`).join(', ')}` }); return false }
    if (!closeStates(item).length) { plan.kept.push({ item, reason: `${item.state} cannot be closed from here` }); return false }
    plan.close.push(item)
    return true
  }
  const finished = visit(feature)
  if (!finished && isPending(feature) && !isMine(feature, me) && !plan.kept.some((entry) => entry.item.id === feature.id)) plan.kept.push({ item: feature, reason: `assigned to ${feature.assignedTo || 'nobody'}: only your items are closed` })
  return plan
}
export function featureCloseQuestion(plan: FeatureClosePlan) {
  const lines = plan.close.map((item) => `#${item.id} ${item.workItemType} “${item.title}” (${item.state})`)
  const kept = plan.kept.map((entry) => `#${entry.item.id} ${entry.item.workItemType} stays open — ${entry.reason}`)
  return `Close Feature #${plan.feature.id} “${plan.feature.title}”: set ${plan.close.length} of your item${plan.close.length === 1 ? '' : 's'} to Closed in Azure DevOps? Closed Time Writing Tasks become read-only.\n${lines.join('\n')}${kept.length ? `\n\n${kept.join('\n')}` : ''}`
}
// Runs the plan in its order (children before parents); an item whose child failed is not written.
export async function closeFeatureItems(config: AzureConfig, pat: string, plan: FeatureClosePlan, write: (config: AzureConfig, pat: string, id: number, update: { state: string }) => Promise<AzureWorkItem> = updateAzureWorkItem, progress?: (text: string) => void) {
  const closed: AzureWorkItem[] = [], failed: string[] = [], skipped: string[] = []
  const bad = new Set<number>()
  for (const [index, item] of plan.close.entries()) {
    progress?.(`Closing ${index + 1} of ${plan.close.length}…`)
    if (bad.has(item.id)) { skipped.push(`#${item.id} left open: an item below it could not be closed`); markUp(item); continue }
    try { let updated = item; for (const state of closeStates(item)) updated = await write(config, pat, item.id, { state }); closed.push(updated) }
    catch (failure) { failed.push(`#${item.id}: ${failure instanceof Error ? failure.message : 'update failed'}`); markUp(item) }
  }
  function markUp(item: AzureWorkItem) { for (let parent = plan.parentOf.get(item.id); parent != null && !bad.has(parent) && parent !== item.id; parent = plan.parentOf.get(parent)) bad.add(parent) }
  return { closed, failed, skipped }
}

// BKL-41, ACT-24, ACT-25: hours entered on a month Time Writing Task (Original Estimate or Completed Work above 0) make
// the Task, its Time Writing story and the story's Feature Active — each only when it is still New (activationPlan):
// a Resolved or Closed one is never reopened and a Removed one stays Removed (both named in the notes, so the person is
// told). Only items still New are written.
export interface HoursActivation { activated: AzureWorkItem[]; notes: string[]; failed: string[] }
export type StateWrite = (config: AzureConfig, pat: string, id: number, update: { state: string }) => Promise<AzureWorkItem>
export async function activateAfterHours(config: AzureConfig, pat: string, items: AzureWorkItem[], task: AzureWorkItem, write: StateWrite = updateAzureWorkItem): Promise<HoursActivation> {
  const plan = activationPlan(items, task)
  const run = await runStatePlan(config, pat, plan, write)
  return { activated: run.changed, notes: [...plan.skipped.map((entry) => entry.text).filter(Boolean), ...run.notes], failed: run.failed }
}

// Writes a plan's steps in order, each State read back (updateAzureWorkItem); a step whose needed step failed is not
// written. Failures are reported, never thrown.
export async function runStatePlan(config: AzureConfig, pat: string, plan: StatePlan, write: StateWrite = updateAzureWorkItem, progress?: (text: string) => void) {
  const changed: AzureWorkItem[] = [], notes: string[] = [], failed: string[] = []
  const bad = new Set<number>()
  for (const [index, step] of plan.steps.entries()) {
    progress?.(`Updating ${index + 1} of ${plan.steps.length}…`)
    const label = `${stateLabel(step.item)} #${step.item.id}`
    if (step.needs.some((id) => bad.has(id))) { bad.add(step.item.id); failed.push(`${label} not set to ${step.to}: an item below it could not be changed`); continue }
    try { let updated = step.item; for (const state of step.states) updated = await write(config, pat, step.item.id, { state }); changed.push(updated); notes.push(step.why) }
    catch (failure) { bad.add(step.item.id); failed.push(`${label} not set to ${step.to}: ${failure instanceof Error ? failure.message : 'update failed'}`) }
  }
  return { changed, notes, failed }
}

// ACT-26: the check of the person's own Month Tasks, as a background job (Jobs done) once the app has fetched the Time
// Writing connection. The States are read again from Azure DevOps first and the plan made again on them, so an item
// that changed meanwhile is not written from an old copy. Returns whether a job started (one at a time; none when
// nothing is due).
export const monthTaskStatesJobKey = 'time-writing:month-task-states'
export interface MonthTaskStatesInput { config: AzureConfig; pat: string; items: AzureWorkItem[]; email: string; locks: LockSettings; now?: () => Date; onChanged: (changed: AzureWorkItem[]) => void; read?: (config: AzureConfig, pat: string, ids: number[]) => Promise<AzureWorkItem[]>; write?: StateWrite; run?: typeof runInBackground; filter?: (step: StateStep) => boolean; onPlanned?: (steps: StateStep[]) => void }
export function startMonthTaskStatesJob(input: MonthTaskStatesInput) {
  const now = input.now ?? (() => new Date())
  const planOf = (items: AzureWorkItem[]) => { const plan = ownMonthTaskPlan(items, input.email, input.locks, now()); return { ...plan, steps: plan.steps.filter(input.filter ?? (() => true)) } }
  const first = planOf(input.items)
  if (!first.steps.length) return false
  const started = (input.run ?? runInBackground)(monthTaskStatesJobKey, 'Month Task states', async (progress) => {
    progress('Reading the current States…')
    const fresh = await (input.read ?? readAzureWorkItems)(input.config, input.pat, planReads(input.items, first))
    // Only what was due on the copy and is still due on the current States is written.
    const due = new Set(first.steps.map((step) => `${step.item.id}:${step.to}`)), again = ownMonthTaskPlan(mergeAzureWorkItems(input.items, fresh), input.email, input.locks, now())
    const plan = { ...again, steps: again.steps.filter((step) => due.has(`${step.item.id}:${step.to}`)) }
    if (!plan.steps.length) { if (fresh.length) input.onChanged(fresh); return { text: 'Your Month Tasks are up to date: nothing to change.' } }
    const run = await runStatePlan(input.config, input.pat, plan, input.write ?? updateAzureWorkItem, progress)
    input.onChanged([...fresh, ...run.changed])
    const text = `${run.changed.length} of ${plan.steps.length} item${plan.steps.length === 1 ? '' : 's'} updated.${run.notes.map((note) => ` ${note}`).join('')}${run.failed.length ? ` ${run.failed.length} not done — ${run.failed.join(' · ')}` : ''}`
    return { text, failed: run.failed.length > 0 }
  })
  if (started) input.onPlanned?.(first.steps)
  return started
}
