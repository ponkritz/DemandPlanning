import type { AzureWorkItem } from './domain'
import type { ReleaseStream } from './releaseOverview.ts'
import { approvalMonthOf } from './releaseSource.ts'

// Pulse Check → Last month: the month before the one picked in the header, compared with it.
export function previousMonth(month: string) {
  const [year, number] = month.split('-').map(Number)
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`
}

// Releases and documents per stream in the previous month next to the selected month (streams in either month).
export interface ReleaseChange { name: string; releases: number; documents: number; previousReleases: number; previousDocuments: number }
export function releaseComparison(current: ReleaseStream[], previous: ReleaseStream[]): ReleaseChange[] {
  const names = [...new Set([...current, ...previous].map((stream) => stream.name))].sort((a, b) => a.localeCompare(b))
  return names.map((name) => {
    const now = current.find((stream) => stream.name === name), before = previous.find((stream) => stream.name === name)
    return { name, releases: now?.releases.length ?? 0, documents: now?.documents ?? 0, previousReleases: before?.releases.length ?? 0, previousDocuments: before?.documents ?? 0 }
  })
}

// Features and User Stories created and closed in a month, per stream (the Epic above them), in the viewer's time
// zone. Closed = Closed Date in the month (an item in a finished state without one counts by its last change). Removed
// items and work under the absence Epic are left out.
const finished = new Set(['closed', 'done', 'completed', 'resolved'])
export const flowTypes = ['Feature', 'User Story'] as const
export type FlowType = typeof flowTypes[number]
export interface FlowCount { created: number; closed: number }
export interface FlowStream { key: string; title: string; epic?: AzureWorkItem; counts: Record<FlowType, FlowCount> }
export interface FlowItem { item: AzureWorkItem; stream: string; change: 'created' | 'closed' }
// include narrows the counted items (e.g. to one person or the filtered team); the Epic links still use every item.
export function workFlow(source: AzureWorkItem[], month: string, absenceEpicId?: number, timeZone?: string, include: (item: AzureWorkItem) => boolean = () => true) {
  const byId = new Map(source.map((item) => [item.id, item]))
  const epicOf = (item: AzureWorkItem) => { const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { if (current.workItemType === 'Epic') return current; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return undefined }
  const closedMonth = (item: AzureWorkItem) => item.closedDate ? approvalMonthOf(item.closedDate, timeZone) : finished.has(item.state.trim().toLowerCase()) ? approvalMonthOf(item.changedDate, timeZone) : undefined
  const streams = new Map<string, FlowStream>()
  const items: FlowItem[] = []
  for (const item of source) {
    if (!(flowTypes as readonly string[]).includes(item.workItemType) || item.state.trim().toLowerCase() === 'removed' || !include(item)) continue
    const epic = epicOf(item)
    if (absenceEpicId != null && epic?.id === absenceEpicId) continue
    const created = approvalMonthOf(item.createdDate, timeZone) === month, closed = closedMonth(item) === month
    if (!created && !closed) continue
    const key = epic ? String(epic.id) : 'none'
    const stream = streams.get(key) ?? { key, title: epic?.title ?? 'No Epic', ...(epic ? { epic } : {}), counts: { 'Feature': { created: 0, closed: 0 }, 'User Story': { created: 0, closed: 0 } } }
    streams.set(key, stream)
    const counts = stream.counts[item.workItemType as FlowType]
    if (created) { counts.created++; items.push({ item, stream: stream.title, change: 'created' }) }
    if (closed) { counts.closed++; items.push({ item, stream: stream.title, change: 'closed' }) }
  }
  const sum = (type: FlowType, kind: keyof FlowCount) => [...streams.values()].reduce((total, stream) => total + stream.counts[type][kind], 0)
  const totals = Object.fromEntries(flowTypes.map((type) => [type, { created: sum(type, 'created'), closed: sum(type, 'closed') }])) as Record<FlowType, FlowCount>
  const weight = (stream: FlowStream) => flowTypes.reduce((total, type) => total + stream.counts[type].created + stream.counts[type].closed, 0)
  return {
    streams: [...streams.values()].sort((a, b) => weight(b) - weight(a) || a.title.localeCompare(b.title)),
    totals,
    items: items.sort((a, b) => a.change.localeCompare(b.change) || a.item.id - b.item.id),
  }
}

// Ongoing activities: Features and User Stories in progress now (Active, In Progress, Committed, Doing), per stream,
// with the hours booked on them in the month (Completed Work of that month's Time Writing Tasks below them) and
// whether their Target Date has passed. Work under the absence Epic is left out.
const inProgress = /^(active|in progress|committed|doing)$/i
export interface OngoingItem { item: AzureWorkItem; stream: string; feature?: AzureWorkItem; booked: number; overdue: boolean }
export function ongoingWork(source: AzureWorkItem[], month: string, today: string, monthOf: (title: string) => string | undefined, absenceEpicId?: number) {
  const byId = new Map(source.map((item) => [item.id, item]))
  const chain = (item: AzureWorkItem) => { const list: AzureWorkItem[] = []; const seen = new Set([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { list.push(current); seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return list }
  const booked = new Map<number, number>()
  for (const task of source) {
    if (task.workItemType !== 'Task' || monthOf(task.title) !== month || !task.completedWork) continue
    for (const parent of chain(task)) booked.set(parent.id, (booked.get(parent.id) ?? 0) + task.completedWork)
  }
  const items: OngoingItem[] = []
  for (const item of source) {
    if (!(flowTypes as readonly string[]).includes(item.workItemType) || !inProgress.test(item.state.trim())) continue
    const parents = chain(item), epic = parents.find((entry) => entry.workItemType === 'Epic')
    if (absenceEpicId != null && epic?.id === absenceEpicId) continue
    items.push({ item, stream: epic?.title ?? 'No Epic', feature: parents.find((entry) => entry.workItemType === 'Feature'), booked: Math.round((booked.get(item.id) ?? 0) * 100) / 100, overdue: Boolean(item.targetDate && item.targetDate.slice(0, 10) < today) })
  }
  items.sort((a, b) => a.stream.localeCompare(b.stream) || (a.item.workItemType === b.item.workItemType ? 0 : a.item.workItemType === 'Feature' ? -1 : 1) || a.item.id - b.item.id)
  return { items, features: items.filter((entry) => entry.item.workItemType === 'Feature').length, stories: items.filter((entry) => entry.item.workItemType === 'User Story').length, people: new Set(items.map((entry) => entry.item.assignedTo).filter(Boolean)).size, overdue: items.filter((entry) => entry.overdue).length, streams: [...new Set(items.map((entry) => entry.stream))] }
}
