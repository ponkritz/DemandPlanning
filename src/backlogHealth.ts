import { csvCell } from './csv.ts'
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
  const quote = csvCell
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

// Columns a Backlog Health tab can show, in the order chosen per tab (saved in this browser). ID is always shown; the
// CSV of a tab has the shown columns plus the URL. Values are full (paths, dates as YYYY-MM-DD).
export const healthColumns = [
  { id: 'id', label: 'ID' },
  { id: 'type', label: 'Work Item Type' },
  { id: 'title', label: 'Title' },
  { id: 'areaPath', label: 'Area Path' },
  { id: 'iterationPath', label: 'Iteration Path' },
  { id: 'state', label: 'State' },
  { id: 'assignedTo', label: 'Assigned To' },
  { id: 'createdBy', label: 'Created By' },
  { id: 'changedBy', label: 'Updated By' },
  { id: 'createdDate', label: 'Created On' },
  { id: 'changedDate', label: 'Updated On' },
  { id: 'sprintEnd', label: 'Sprint end' },
  { id: 'parent', label: 'Parent' },
  { id: 'epic', label: 'Epic' },
  { id: 'feature', label: 'Feature' },
  { id: 'story', label: 'User Story' },
  { id: 'tags', label: 'Tags' },
  { id: 'description', label: 'Description' },
] as const
export type HealthColumn = typeof healthColumns[number]['id']
export type HealthList = 'sprints' | 'dod' | 'unassigned'
const itemColumns: HealthColumn[] = ['id', 'type', 'title', 'areaPath', 'iterationPath', 'state', 'assignedTo', 'createdBy', 'changedBy', 'createdDate', 'changedDate']
export const defaultHealthColumns: Record<HealthList, HealthColumn[]> = { sprints: itemColumns, unassigned: itemColumns, dod: ['id', 'title', 'type', 'state', 'assignedTo', 'iterationPath', 'parent', 'description'] }
export const healthColumnLabel = (id: HealthColumn) => healthColumns.find((column) => column.id === id)!.label

// Known columns only, no repeats, ID always (first unless placed elsewhere); anything else falls back to the default.
export function normalizeHealthColumns(value: unknown, list: HealthList): HealthColumn[] {
  if (!Array.isArray(value)) return [...defaultHealthColumns[list]]
  const known = new Set<string>(healthColumns.map((column) => column.id))
  const picked = [...new Set(value.filter((id): id is HealthColumn => typeof id === 'string' && known.has(id)))]
  return picked.includes('id') ? picked : ['id', ...picked]
}

export function healthValue(column: HealthColumn, item: AzureWorkItem, byId: Map<number, AzureWorkItem>, iterations: DatedIteration[]): string {
  const label = (entry?: AzureWorkItem) => entry ? `#${entry.id} ${entry.title}` : ''
  switch (column) {
    case 'id': return String(item.id)
    case 'type': return item.workItemType
    case 'title': return item.title
    case 'areaPath': return item.areaPath
    case 'iterationPath': return item.iterationPath
    case 'state': return item.state
    case 'assignedTo': return item.assignedTo
    case 'createdBy': return item.createdBy ?? ''
    case 'changedBy': return item.changedBy ?? ''
    case 'createdDate': return item.createdDate?.slice(0, 10) ?? ''
    case 'changedDate': return item.changedDate?.slice(0, 10) ?? ''
    case 'sprintEnd': return sprintEnd(item, iterations)
    case 'parent': return item.parentId != null ? label(byId.get(item.parentId)) || `#${item.parentId}` : ''
    case 'epic': return label(hierarchyOf(item, byId).Epic)
    case 'feature': return label(hierarchyOf(item, byId).Feature)
    case 'story': return label(hierarchyOf(item, byId)['User Story'])
    case 'tags': return item.tags
    case 'description': return descriptionText(item)
  }
}

export function columnsCsv(rows: AzureWorkItem[], columns: HealthColumn[], all: AzureWorkItem[], iterations: DatedIteration[]) {
  const byId = new Map(all.map((item) => [item.id, item]))
  const quote = csvCell
  return [[...columns.map(healthColumnLabel), 'URL'], ...rows.map((item) => [...columns.map((column) => healthValue(column, item, byId, iterations)), item.url])].map((row) => row.map(quote).join(',')).join('\r\n')
}
