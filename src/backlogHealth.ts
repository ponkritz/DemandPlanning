import type { AzureWorkItem } from './domain'
import { isPastSprint, isPending, type DatedIteration } from './myWork.ts'

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

// CSV of the rows (quoted, comma-separated, CRLF), with the parent's title for context.
export function healthCsv(rows: AzureWorkItem[], all: AzureWorkItem[], iterations: DatedIteration[], list = '') {
  const byId = new Map(all.map((item) => [item.id, item]))
  const quote = (value: unknown) => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }
  const header = [...(list ? ['List'] : []), 'ID', 'Type', 'Title', 'State', 'Assigned To', 'Iteration', 'Sprint end', 'Parent', 'URL']
  return [header, ...rows.map((item) => [...(list ? [list] : []), item.id, item.workItemType, item.title, item.state, item.assignedTo, item.iterationPath, sprintEnd(item, iterations), item.parentId != null ? `#${item.parentId} ${byId.get(item.parentId)?.title ?? ''}`.trim() : '', item.url])].map((row) => row.map(quote).join(',')).join('\r\n')
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

// Unassigned list as CSV: the hierarchy columns, then where the item sits and who created it when.
export function unassignedCsv(rows: AzureWorkItem[], all: AzureWorkItem[]) {
  const byId = new Map(all.map((item) => [item.id, item]))
  const quote = (value: unknown) => { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }
  const label = (item?: AzureWorkItem) => item ? `#${item.id} ${item.title}` : ''
  const header = ['ID', 'Type', 'Epic', 'Feature', 'User Story', 'Task', 'Area Path', 'Iteration Path', 'State', 'Created By', 'Created On', 'URL']
  return [header, ...rows.map((item) => { const level = hierarchyOf(item, byId); return [item.id, item.workItemType, label(level.Epic), label(level.Feature), label(level['User Story']), label(level.Task), item.areaPath, item.iterationPath, item.state, item.createdBy ?? '', item.createdDate?.slice(0, 10) ?? '', item.url] })].map((row) => row.map(quote).join(',')).join('\r\n')
}
