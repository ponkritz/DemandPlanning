import type { AzureWorkItem } from './domain'

const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
export function timeWritingMonth(title: string): string | undefined {
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\s*\|/i.exec(title.trim())
  return match ? `${match[2]}-${String(months.findIndex(month => month.toLowerCase() === match[1].toLowerCase()) + 1).padStart(2, '0')}` : undefined
}
export function indiaMonth(date?: string) {
  if (!date || !Number.isFinite(Date.parse(date))) return undefined
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date(date))
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`
}
function total(items: AzureWorkItem[], field: 'originalEstimate'|'completedWork'|'remainingWork') {
  const values = items.map(item => item[field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  return { value: values.length ? values.reduce((a, b) => a + b, 0) : null, count: values.length, total: items.length }
}
export function azureInsights(source: AzureWorkItem[], month: string, today: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid dashboard month.')
  const items = [...new Map(source.filter(item => item.state.trim().toLowerCase() !== 'removed').map(item => [item.key, item])).values()]
  const features = items.filter(item => item.workItemType === 'Feature'), tasks = items.filter(item => item.workItemType === 'Task')
  const timeWritingStories = items.filter(item => item.workItemType === 'User Story' && /\s*-\s*time\s*writ(?:ing|ting)\s*$/i.test(item.title))
  const storyIds = new Set(timeWritingStories.map(item => item.id))
  const timeWritingTasks = tasks.filter(item => item.parentId != null && storyIds.has(item.parentId))
  const monthlyTasks = timeWritingTasks.filter(item => timeWritingMonth(item.title) === month)
  const storiesForMonth = timeWritingStories.filter(item => monthlyTasks.some(task => task.parentId === item.id))
  const plan = total(storiesForMonth, 'originalEstimate'), actual = total(storiesForMonth, 'completedWork')
  const paired = storiesForMonth.filter(item => item.originalEstimate != null && item.completedWork != null)
  const variance = paired.length ? paired.reduce((sum, item) => sum + item.completedWork! - item.originalEstimate!, 0) : null
  const closed = (item: AzureWorkItem) => ['closed', 'done', 'completed'].includes(item.state.trim().toLowerCase())
  const overdue = items.filter(item => !closed(item) && item.targetDate && item.targetDate.slice(0, 10) < today)
  const flags = paired.filter(item => item.originalEstimate! > 0 && item.completedWork! > item.originalEstimate! * 1.25)
  const closures = features.filter(item => closed(item) && indiaMonth(item.closedDate) === month)
  const priorClosures = features.filter(item => closed(item) && indiaMonth(item.closedDate) === `${Number(month.slice(0,4)) - 1}${month.slice(4)}`).length
  const resources = [...new Set(storiesForMonth.map(item => item.assignedTo || 'Unassigned'))].sort().map(name => {
    const owned = storiesForMonth.filter(item => (item.assignedTo || 'Unassigned') === name)
    return { name, plan: total(owned, 'originalEstimate'), actual: total(owned, 'completedWork'), count: owned.length }
  })
  const trend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 5 + index)
    const key = date.toISOString().slice(0, 7), rows = timeWritingTasks.filter(item => timeWritingMonth(item.title) === key)
    return { month: key, plan: total(rows, 'originalEstimate'), actual: total(rows, 'completedWork'), closures: features.filter(item => closed(item) && indiaMonth(item.closedDate) === key).length }
  })
  const byId = new Map(items.map(item => [item.id, item]))
  const epicOf = (item: AzureWorkItem) => {
    const seen = new Set<number>(); let current: AzureWorkItem | undefined = item
    while (current && !seen.has(current.id)) { if (current.workItemType === 'Epic') return current; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) }
    return undefined
  }
  const epicGroups = new Map<string, { epic?: AzureWorkItem; stories: AzureWorkItem[] }>()
  for (const story of storiesForMonth) { const epic = epicOf(story); const key = epic?.key ?? 'unmapped'; const group = epicGroups.get(key) ?? { epic, stories: [] }; group.stories.push(story); epicGroups.set(key, group) }
  const epicBreakdown = [...epicGroups.values()].map(group => ({ ...group, plan: total(group.stories, 'originalEstimate'), actual: total(group.stories, 'completedWork'), tasks: monthlyTasks.filter(task => group.stories.some(story => story.id === task.parentId)).length })).sort((a,b) => (b.actual.value ?? -1) - (a.actual.value ?? -1))
  return { items, features, tasks, timeWritingStories, storiesForMonth, timeWritingTasks, monthlyTasks, plan, actual, variance, paired, overdue, flags, closures, priorClosures, resources, trend, epicBreakdown, unmappedTasks: timeWritingTasks.filter(item => !timeWritingMonth(item.title)).length }
}
