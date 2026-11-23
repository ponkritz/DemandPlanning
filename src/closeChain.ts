import type { AzureWorkItem } from './domain.ts'
import { isTimeWritingStory, timeWritingMonth } from './azureInsights.ts'
import { updateAzureWorkItem, type AzureConfig } from './azureDevOps.ts'
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

// BKL-41: hours entered on a month Time Writing Task (Original Estimate or Completed Work above 0) make the Task and its
// Time Writing story Active: New (or any other state) → Active, and a Closed one is reopened to Active — each named in
// the notes, so the person is told. A Removed item stays Removed (named too). Only items not yet Active are written.
export interface HoursActivation { activated: AzureWorkItem[]; notes: string[]; failed: string[] }
export async function activateAfterHours(config: AzureConfig, pat: string, items: AzureWorkItem[], task: AzureWorkItem, write: (config: AzureConfig, pat: string, id: number, update: { state: string }) => Promise<AzureWorkItem> = updateAzureWorkItem): Promise<HoursActivation> {
  const result: HoursActivation = { activated: [], notes: [], failed: [] }
  if (task.workItemType !== 'Task' || timeWritingMonth(task.title) == null) return result
  if (!((task.originalEstimate ?? 0) > 0 || (task.completedWork ?? 0) > 0)) return result
  const story = task.parentId == null ? undefined : items.find((item) => item.id === task.parentId && item.organization === task.organization && item.project === task.project && isTimeWritingStory(item))
  for (const [item, label] of [[task, 'Task'], [story, 'Time Writing story']] as const) {
    if (!item) continue
    const state = item.state.trim().toLowerCase()
    if (state === 'active') continue
    if (state === 'removed') { result.notes.push(`${label} #${item.id} is Removed and stays Removed.`); continue }
    try {
      const updated = await write(config, pat, item.id, { state: 'Active' })
      result.activated.push(updated)
      result.notes.push(state === 'closed' ? `${label} #${item.id} was Closed and is reopened to Active, because hours were entered.` : `${label} #${item.id} set to Active (${item.state} before), because hours were entered.`)
    } catch (failure) { result.failed.push(`${label} #${item.id} not set to Active: ${failure instanceof Error ? failure.message : 'update failed'}`) }
  }
  return result
}
