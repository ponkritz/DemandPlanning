import type { AzureWorkItem } from './domain'
import { isPastSprint, isPending, type DatedIteration } from './myWork.ts'
import { plainAzureText } from './backlogView.ts'

// Backlog Health (what the Scrum Master needs) over the Time Writing backlog (all people): open work left in Sprints that have ended, Features
// without a Definition of Done (their Description does not mention "DoD"), and open work nobody is assigned to.
// Work under the absence Epic (PTO, sick leave, holidays) is left out of every list.
const tracked = new Set(['Feature', 'User Story', 'Task'])
const byType = (a: AzureWorkItem, b: AzureWorkItem) => [...tracked].indexOf(a.workItemType) - [...tracked].indexOf(b.workItemType) || a.id - b.id

function underEpic(items: AzureWorkItem[], epicId?: number) {
  const byId = new Map(items.map((item) => [item.id, item]))
  return (item: AzureWorkItem) => {
    if (epicId == null) return false
    const seen = new Set<number>()
    for (let current: AzureWorkItem | undefined = item; current && !seen.has(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId)) {
      if (current.id === epicId) return true
      seen.add(current.id)
    }
    return false
  }
}

export function olderSprintItems(items: AzureWorkItem[], iterations: DatedIteration[], date = new Date(), absenceEpicId?: number) {
  const absence = underEpic(items, absenceEpicId)
  return items.filter((item) => tracked.has(item.workItemType) && isPending(item) && !absence(item) && isPastSprint(item.iterationPath, iterations, date)).sort(byType)
}

// "DoD" as a word anywhere in the Description (HTML tags ignored), e.g. "Feature DoD: IQOQ finished …".
export const hasDoD = (item: Pick<AzureWorkItem, 'description'>) => /\bDoD\b/i.test((item.description ?? '').replace(/<[^>]*>/g, ' '))
export function featuresWithoutDoD(items: AzureWorkItem[], openOnly = true, absenceEpicId?: number) {
  const absence = underEpic(items, absenceEpicId)
  return items.filter((item) => item.workItemType === 'Feature' && (!openOnly || isPending(item)) && !absence(item) && !hasDoD(item)).sort(byType)
}

export function unassignedItems(items: AzureWorkItem[], absenceEpicId?: number) {
  const absence = underEpic(items, absenceEpicId)
  return items.filter((item) => tracked.has(item.workItemType) && isPending(item) && !absence(item) && !item.assignedTo.trim()).sort(byType)
}

// The Sprint's finish date for a row, when known.
export const sprintEnd = (item: Pick<AzureWorkItem, 'iterationPath'>, iterations: DatedIteration[]) => iterations.find((entry) => entry.path.trim().toLowerCase() === item.iterationPath.trim().toLowerCase())?.attributes?.finishDate?.slice(0, 10) ?? ''

// The Description as plain text (HTML removed), as shown for Features without DoD.
export const descriptionText = (item: Pick<AzureWorkItem, 'description'>) => plainAzureText(item.description ?? '')

// The people a row can be filtered by: who it is assigned to, or for unassigned work who created and last updated it.
export const peopleOf = (item: AzureWorkItem, unassigned = false) => (unassigned ? [item.createdBy, item.changedBy] : [item.assignedTo]).filter((name): name is string => Boolean(name?.trim()))

// CSV of the rows (quoted, comma-separated, CRLF), with the parent's title for context, and the Description if asked.
export function healthCsv(rows: AzureWorkItem[], all: AzureWorkItem[], iterations: DatedIteration[], list = '', description = false) {
  const byId = new Map(all.map((item) => [item.id, item]))
  const quote = (value: unknown) => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }
  const header = [...(list ? ['List'] : []), 'ID', 'Type', 'Title', 'State', 'Assigned To', 'Iteration', 'Sprint end', 'Parent', 'URL', ...(description ? ['Description'] : [])]
  return [header, ...rows.map((item) => [...(list ? [list] : []), item.id, item.workItemType, item.title, item.state, item.assignedTo, item.iterationPath, sprintEnd(item, iterations), item.parentId != null ? `#${item.parentId} ${byId.get(item.parentId)?.title ?? ''}`.trim() : '', item.url, ...(description ? [descriptionText(item)] : [])])].map((row) => row.map(quote).join(',')).join('\r\n')
}

// The Epic, Feature, User Story and Task an item belongs to (the item itself at its own level), following parents.
export function hierarchyOf(item: AzureWorkItem, byId: Map<number, AzureWorkItem>) {
  const levels: Partial<Record<'Epic' | 'Feature' | 'User Story' | 'Task', AzureWorkItem>> = {}
  const seen = new Set<number>()
  for (let current: AzureWorkItem | undefined = item; current && !seen.has(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId)) {
    seen.add(current.id)
    const type = current.workItemType as keyof typeof levels
    if (['Epic', 'Feature', 'User Story', 'Task'].includes(type) && !levels[type]) levels[type] = current
  }
  return levels
}

// Older Sprints and Unassigned as CSV: the item, where it sits, its state, who created and who last updated it, and when.
export const itemHeader = ['ID', 'Work Item Type', 'Title', 'Area Path', 'Iteration Path', 'State', 'Created By', 'Updated By', 'Created On', 'Updated On', 'URL']
export function itemCsv(rows: AzureWorkItem[]) {
  const quote = (value: unknown) => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }
  return [itemHeader, ...rows.map((item) => [item.id, item.workItemType, item.title, item.areaPath, item.iterationPath, item.state, item.createdBy ?? '', item.changedBy ?? '', item.createdDate?.slice(0, 10) ?? '', item.changedDate?.slice(0, 10) ?? '', item.url])].map((row) => row.map(quote).join(',')).join('\r\n')
}
