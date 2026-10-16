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
export function workingDays(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.')
  const [year, index] = month.split('-').map(Number), last = new Date(Date.UTC(year, index, 0)).getUTCDate()
  return Array.from({ length: last }, (_, day) => new Date(Date.UTC(year, index - 1, day + 1)).getUTCDay()).filter(day => day > 0 && day < 6).length
}
function hasTag(item: AzureWorkItem, tag: string) { return (item.tags ?? '').split(';').some(value => value.trim().toLowerCase() === tag.toLowerCase()) }
function total(items: AzureWorkItem[], field: 'originalEstimate'|'completedWork'|'remainingWork') {
  const values = items.map(item => item[field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  return { value: values.length ? values.reduce((a, b) => a + b, 0) : null, count: values.length, total: items.length }
}
function utilization(fundedHours: number, actualHoursLessAbsence: number | null) { return actualHoursLessAbsence != null && actualHoursLessAbsence > 0 && fundedHours > 0 ? Math.round(fundedHours / actualHoursLessAbsence * 1000000) / 10000 : null }
export function azureInsights(source: AzureWorkItem[], month: string, today: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid dashboard month.')
  const items = [...new Map(source.filter(item => item.state.trim().toLowerCase() !== 'removed').map(item => [item.key, item])).values()]
  const features = items.filter(item => item.workItemType === 'Feature'), tasks = items.filter(item => item.workItemType === 'Task')
  const timeWritingStories = items.filter(item => item.workItemType === 'User Story' && /\s*-\s*time\s*writ(?:ing|ting)\s*$/i.test(item.title))
  const storyIds = new Set(timeWritingStories.map(item => item.id))
  const timeWritingTasks = tasks.filter(item => item.parentId != null && storyIds.has(item.parentId))
  const monthlyTasks = timeWritingTasks.filter(item => timeWritingMonth(item.title) === month)
  const storiesForMonth = timeWritingStories.filter(item => monthlyTasks.some(task => task.parentId === item.id))
  const plan = total(monthlyTasks, 'originalEstimate'), actual = total(monthlyTasks, 'completedWork')
  const paired = monthlyTasks.filter(item => item.originalEstimate != null && item.completedWork != null)
  const variance = paired.length ? paired.reduce((sum, item) => sum + item.completedWork! - item.originalEstimate!, 0) : null
  const closed = (item: AzureWorkItem) => ['closed', 'done', 'completed'].includes(item.state.trim().toLowerCase())
  const overdue = items.filter(item => !closed(item) && item.targetDate && item.targetDate.slice(0, 10) < today)
  const flags = paired.filter(item => item.originalEstimate! > 0 && item.completedWork! > item.originalEstimate! * 1.25)
  const closures = features.filter(item => closed(item) && indiaMonth(item.closedDate) === month)
  const priorClosures = features.filter(item => closed(item) && indiaMonth(item.closedDate) === `${Number(month.slice(0,4)) - 1}${month.slice(4)}`).length
  const byId = new Map(items.map(item => [item.id, item]))
  const epicOf = (item: AzureWorkItem) => {
    const seen = new Set<number>(); let current: AzureWorkItem | undefined = item
    while (current && !seen.has(current.id)) { if (current.workItemType === 'Epic') return current; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) }
    return undefined
  }
  const featureOf = (item: AzureWorkItem) => item.parentId == null ? undefined : byId.get(item.parentId)?.workItemType === 'Feature' ? byId.get(item.parentId) : undefined
  const monthlyFeatures = [...new Map(storiesForMonth.map(featureOf).filter((item): item is AzureWorkItem => Boolean(item)).map(item => [item.key, item])).values()]
  const npraFeatures = monthlyFeatures.filter(item => hasTag(item, 'NPRA Hours'))
  const npra = total(npraFeatures, 'originalEstimate')
  const dayCount = workingDays(month), dayCapacity = dayCount * 8
  const absenceTasks = monthlyTasks.filter(item => epicOf(item)?.id === 37778)
  const absence = total(absenceTasks, 'completedWork')
  const actualLessAbsence = actual.value == null ? null : actual.value - (absence.value ?? 0)
  const resourceNames = [...new Set(monthlyTasks.map(item => item.assignedTo).filter(Boolean))].sort()
  const resources = resourceNames.map(name => {
    const owned = monthlyTasks.filter(item => item.assignedTo === name), absenceOwned = absenceTasks.filter(item => item.assignedTo === name)
    const actualOwned = total(owned, 'completedWork'), absenceHours = total(absenceOwned, 'completedWork')
    const denominator = actualOwned.value == null ? null : actualOwned.value - (absenceHours.value ?? 0)
    return { name, plan: total(owned, 'originalEstimate'), actual: actualOwned, count: owned.length, npra: total([], 'originalEstimate'), absence: absenceHours, capacity: dayCapacity, available: denominator, utilization: utilization(dayCapacity, denominator) }
  })
  const trend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 5 + index)
    const key = date.toISOString().slice(0, 7), rows = timeWritingTasks.filter(item => timeWritingMonth(item.title) === key)
    return { month: key, plan: total(rows, 'originalEstimate'), actual: total(rows, 'completedWork'), closures: features.filter(item => closed(item) && indiaMonth(item.closedDate) === key).length }
  })
  const epicGroups = new Map<string, { epic?: AzureWorkItem; stories: AzureWorkItem[] }>()
  for (const story of storiesForMonth) { const epic = epicOf(story); const key = epic?.key ?? 'unmapped'; const group = epicGroups.get(key) ?? { epic, stories: [] }; group.stories.push(story); epicGroups.set(key, group) }
  const epicBreakdown = [...epicGroups.values()].map(group => { const groupFeatures = [...new Map(group.stories.map(featureOf).filter((item): item is AzureWorkItem => Boolean(item)).map(item => [item.key, item])).values()]; const groupTasks = monthlyTasks.filter(task => group.stories.some(story => story.id === task.parentId)); return { ...group, plan: total(groupTasks, 'originalEstimate'), actual: total(groupTasks, 'completedWork'), npra: total(groupFeatures.filter(item => hasTag(item, 'NPRA Hours')), 'originalEstimate'), tasks: groupTasks.length } }).sort((a,b) => (b.actual.value ?? -1) - (a.actual.value ?? -1))
  const capacity = dayCapacity
  return { items, features, tasks, timeWritingStories, storiesForMonth, timeWritingTasks, monthlyTasks, plan, actual, variance, paired, overdue, flags, closures, priorClosures, resources, trend, epicBreakdown, npraFeatures, npra, absenceTasks, absence, workingDays: dayCount, dayCapacity, capacity, available: actualLessAbsence, utilization: utilization(dayCapacity, actualLessAbsence), unassignedNpRA: npraFeatures.filter(item => !item.assignedTo), unmappedTasks: timeWritingTasks.filter(item => !timeWritingMonth(item.title)).length }
}
