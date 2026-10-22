import type { AzureWorkItem } from './domain'
import { planMonthStory, timeWritingMonth, timeWritingStoryIds } from './azureInsights.ts'

// "Me" is matched by Azure email (Assigned To unique name) when known, otherwise by display name.
export interface Me { email?: string; name?: string }
const finished = new Set(['closed', 'resolved', 'done', 'completed', 'removed', 'cut'])
export const isPending = (item: Pick<AzureWorkItem, 'state'>) => !finished.has(item.state.trim().toLowerCase())
export function isMine(item: Pick<AzureWorkItem, 'assignedTo' | 'assignedToEmail'>, me: Me) {
  const email = me.email?.trim().toLowerCase(), name = me.name?.trim().toLowerCase()
  if (email && item.assignedToEmail) return item.assignedToEmail === email
  return Boolean(name && item.assignedTo.trim().toLowerCase() === name)
}

export const workTypes = ['Feature', 'User Story', 'Bug', 'Task'] as const
// The states offered for finishing an item. Azure DevOps rejects a state the item's process does not allow
// (for example Resolved on an Agile Task); the error is shown as returned.
export const finishStates: Record<string, string[]> = { Feature: ['Resolved', 'Closed'], 'User Story': ['Resolved', 'Closed'], Bug: ['Resolved', 'Closed'], Task: ['Closed'] }

function ancestry(items: AzureWorkItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]))
  return (item: AzureWorkItem) => {
    const chain: AzureWorkItem[] = []; const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId)
    while (current && !seen.has(current.id)) { chain.push(current); seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) }
    return chain
  }
}

// Pending (not finished) items assigned to me, excluding absence, grouped by type and ordered Feature → Story → Bug → Task, oldest first.
export function myPendingWork(items: AzureWorkItem[], me: Me, absenceEpicId?: number) {
  const chainOf = ancestry(items)
  const pending = items.filter((item) => isPending(item) && isMine(item, me) && item.workItemType !== 'Epic').map((item) => {
    const chain = chainOf(item)
    if (absenceEpicId != null && chain.some((entry) => entry.workItemType === 'Epic' && entry.id === absenceEpicId)) return null
    return { item, feature: chain.find((entry) => entry.workItemType === 'Feature'), epic: chain.find((entry) => entry.workItemType === 'Epic') }
  }).filter((row): row is NonNullable<typeof row> => row != null)
  const rank = (type: string) => { const index = (workTypes as readonly string[]).indexOf(type); return index < 0 ? workTypes.length : index }
  return pending.sort((a, b) => rank(a.item.workItemType) - rank(b.item.workItemType) || a.item.id - b.item.id)
}

// Features that need my month Time Writing task: pending, outside the absence Epic, and either assigned to me or
// holding a pending item of mine. Status comes from the cached backlog; creation re-checks Azure before writing.
export interface MonthTaskCandidate { feature: AzureWorkItem; storyTitle: string; taskTitle: string; status: 'exists' | 'needs-task' | 'needs-story' | 'conflict' }
export function monthTaskCandidates(items: AzureWorkItem[], me: Me, monthLabel: string, absenceEpicId?: number): MonthTaskCandidate[] {
  const chainOf = ancestry(items)
  const inAbsence = (item: AzureWorkItem) => absenceEpicId != null && chainOf(item).some((entry) => entry.workItemType === 'Epic' && entry.id === absenceEpicId)
  const storyIds = timeWritingStoryIds(items), month = timeWritingMonth(monthLabel) ?? ''
  const featureIds = new Set<number>()
  for (const item of items) {
    if (!isPending(item) || !isMine(item, me) || inAbsence(item) || storyIds.has(item.id) || timeWritingMonth(item.title)) continue
    if (item.workItemType === 'Feature') featureIds.add(item.id)
    else { const feature = chainOf(item).find((entry) => entry.workItemType === 'Feature'); if (feature && isPending(feature)) featureIds.add(feature.id) }
  }
  const childrenOf = (id: number) => items.filter((item) => item.parentId === id)
  return items.filter((item) => featureIds.has(item.id)).sort((a, b) => a.title.localeCompare(b.title)).map((feature) => {
    const storyTitle = `${feature.title.trim()} - Time Writing`, taskTitle = `${monthLabel} | ${feature.title.trim()}`
    const children = childrenOf(feature.id)
    const plan = planMonthStory(children.filter((item) => item.workItemType === 'User Story').map((story) => ({ story, tasks: childrenOf(story.id) })), children.filter((item) => item.workItemType === 'Task'), month, storyTitle, (task) => isMine(task, me))
    const status = plan.status === 'exists' ? 'exists' as const : plan.status === 'use' ? 'needs-task' as const : plan.status === 'create' ? 'needs-story' as const : 'conflict' as const
    return { feature, storyTitle: plan.status === 'use' ? plan.story.title : storyTitle, taskTitle, status }
  })
}

// Dated iterations from Azure (path + start/finish), as read for the Sprint picker.
export interface DatedIteration { path: string; attributes?: { startDate?: string; finishDate?: string } }
const indiaToday = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
// A Sprint is past when its finish date is before today (India time). Undated or unknown iterations are not past.
export function isPastSprint(path: string, iterations: DatedIteration[], date = new Date()) {
  const sprint = iterations.find((item) => item.path.trim().toLowerCase() === path.trim().toLowerCase())
  const finish = sprint?.attributes?.finishDate?.slice(0, 10)
  return Boolean(finish && /^\d{4}-\d{2}-\d{2}$/.test(finish) && finish < indiaToday(date))
}

// Move to the current Sprint applies only to my pending User Stories sitting in a past Sprint. Stories already in the
// current or a future Sprint, in an undated iteration (e.g. only the PI) and all other work item types are left alone.
// states: which of them to move — New, Active, or both (other pending states are left alone).
export type MoveStates = 'new' | 'active' | 'both'
export const matchesMoveStates = (state: string, states: MoveStates) => { const value = state.trim().toLowerCase(); return states === 'both' ? value === 'new' || value === 'active' : value === states }
export function moveCandidates(items: AzureWorkItem[], me: Me, target: string, iterations: DatedIteration[], absenceEpicId?: number, date = new Date(), states: MoveStates = 'both') {
  return myPendingWork(items, me, absenceEpicId).filter(({ item }) => item.workItemType === 'User Story' && matchesMoveStates(item.state, states) && item.iterationPath.trim().toLowerCase() !== target.trim().toLowerCase() && isPastSprint(item.iterationPath, iterations, date))
}
