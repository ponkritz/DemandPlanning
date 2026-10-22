import type { AzureWorkItem } from './domain'

const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
const monthName = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const leadingNamed = new RegExp(`^(${monthName})\\.?[\\s,._/-]*(\\d{4})(?!\\d)`, 'i')
const trailingNamed = new RegExp(`(?:^|[^a-z])(${monthName})\\.?[\\s,._/-]*(\\d{4})[\\s.)\\]]*$`, 'i')
const leadingNumeric = /^(\d{4})[-/.](0?[1-9]|1[0-2])(?!\d)/
const trailingNumeric = /(?:^|\D)(\d{4})[-/.](0?[1-9]|1[0-2])[\s.)\]]*$/
const namedMonth = (match: RegExpExecArray) => `${match[2]}-${String(months.findIndex(month => month.slice(0, 3).toLowerCase() === match[1].slice(0, 3).toLowerCase()) + 1).padStart(2, '0')}`
// Month of a Time Writing Task from its title: the month and year either lead it ("October 2026 | DP", "Oct 2026 - …",
// "2026-10 | …") or end it ("DP | October 2026", "DP - Oct 2026", "DP 2026-10"), with any delimiter. A leading month
// wins when both are present. No fixed delimiter is required by Azure DevOps or by the app.
export function timeWritingMonth(title: string): string | undefined {
  const text = title.trim()
  const lead = leadingNamed.exec(text)
  if (lead) return namedMonth(lead)
  const leadNumber = leadingNumeric.exec(text)
  if (leadNumber) return `${leadNumber[1]}-${leadNumber[2].padStart(2, '0')}`
  const trail = trailingNamed.exec(text)
  if (trail) return namedMonth(trail)
  const trailNumber = trailingNumeric.exec(text)
  return trailNumber ? `${trailNumber[1]}-${trailNumber[2].padStart(2, '0')}` : undefined
}
// A User Story that names "Time Writing" anywhere in its title (e.g. "<Feature> - Time Writing", "Time Writing - DP").
export const isTimeWritingStory = (item: { workItemType: string; title: string }) => item.workItemType === 'User Story' && /\btime[\s_-]*writ(?:ing|ting)\b/i.test(item.title)
// Time Writing is recognised from the Task, not from its story: a Task whose title starts or ends with a month and year counts
// for that month wherever it sits, and its Feature and Epic come from the parent chain. Story titles are free text.
export const isMonthTask = (item: { workItemType: string; title: string }) => item.workItemType === 'Task' && timeWritingMonth(item.title) != null
// Time Writing stories: User Stories that hold a month Task, plus empty ones whose title says "Time Writing".
export function timeWritingStoryIds(items: Pick<AzureWorkItem, 'id' | 'workItemType' | 'title' | 'parentId'>[]) {
  const stories = new Map(items.filter(item => item.workItemType === 'User Story').map(item => [item.id, item]))
  const ids = new Set<number>()
  for (const item of items) if (isMonthTask(item) && item.parentId != null && stories.has(item.parentId)) ids.add(item.parentId)
  for (const story of stories.values()) if (isTimeWritingStory(story)) ids.add(story.id)
  return ids
}

// Where a person's month Task goes under a Feature: an existing Task of theirs for that month (any title or delimiter)
// is reused; otherwise the story titled exactly "<Feature> - Time Writing", else the story already holding their month
// Tasks, else the Feature's only Time Writing story; with none a story is created, and an unclear choice is a conflict.
export interface StoryChildren<T> { story: T; tasks: T[] }
export type MonthStoryPlan<T> = { status: 'exists'; task: T; story?: T } | { status: 'use'; story: T } | { status: 'create' } | { status: 'conflict'; stories: T[] }
export function planMonthStory<T extends Pick<AzureWorkItem, 'id' | 'workItemType' | 'title' | 'state'>>(stories: StoryChildren<T>[], featureTasks: T[], month: string, storyTitle: string, mine: (item: T) => boolean): MonthStoryPlan<T> {
  const live = (item: T) => item.state.trim().toLowerCase() !== 'removed'
  const own = (task: T) => live(task) && task.workItemType === 'Task' && mine(task) && timeWritingMonth(task.title) != null
  const open = stories.filter(entry => live(entry.story) && (isTimeWritingStory(entry.story) || entry.tasks.some(isMonthTask) || entry.story.title.trim().toLowerCase() === storyTitle.toLowerCase()))
  for (const entry of open) { const task = entry.tasks.find(item => own(item) && timeWritingMonth(item.title) === month); if (task) return { status: 'exists', task, story: entry.story } }
  const direct = featureTasks.find(item => own(item) && timeWritingMonth(item.title) === month)
  if (direct) return { status: 'exists', task: direct }
  const exact = open.filter(entry => entry.story.title.trim().toLowerCase() === storyTitle.toLowerCase())
  if (exact.length > 1) return { status: 'conflict', stories: exact.map(entry => entry.story) }
  if (exact.length) return { status: 'use', story: exact[0].story }
  const withMine = open.filter(entry => entry.tasks.some(own))
  if (withMine.length === 1) return { status: 'use', story: withMine[0].story }
  if (withMine.length > 1) return { status: 'conflict', stories: withMine.map(entry => entry.story) }
  if (open.length === 1) return { status: 'use', story: open[0].story }
  return open.length ? { status: 'conflict', stories: open.map(entry => entry.story) } : { status: 'create' }
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
  const storyIds = timeWritingStoryIds(items)
  const timeWritingStories = items.filter(item => storyIds.has(item.id))
  const timeWritingTasks = tasks.filter(item => isMonthTask(item) || (item.parentId != null && storyIds.has(item.parentId)))
  const monthlyTasks = timeWritingTasks.filter(item => timeWritingMonth(item.title) === month)
  // Parents of the month's Tasks: usually a story, sometimes the Feature itself.
  const storiesForMonth = items.filter(item => monthlyTasks.some(task => task.parentId === item.id))
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
  const featureOf = (item: AzureWorkItem) => item.workItemType === 'Feature' ? item : item.parentId == null ? undefined : byId.get(item.parentId)?.workItemType === 'Feature' ? byId.get(item.parentId) : undefined
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

// What needs attention for a month: open Time Writing stories without that month's Task, Tasks under a Time Writing
// story whose title has no month prefix (not counted), and month Tasks with no Feature above them (counted, but
// without a stream).
export function timeWritingGaps(source: AzureWorkItem[], month: string) {
  const items = source.filter(item => item.state.trim().toLowerCase() !== 'removed')
  const byId = new Map(items.map(item => [item.id, item]))
  const storyIds = timeWritingStoryIds(items), stories = items.filter(item => storyIds.has(item.id))
  const tasks = items.filter(item => item.workItemType === 'Task')
  const finished = (item: AzureWorkItem) => ['closed', 'done', 'completed', 'resolved'].includes(item.state.trim().toLowerCase())
  const hasFeature = (item: AzureWorkItem) => { const seen = new Set<number>(); let current = item.parentId == null ? undefined : byId.get(item.parentId); while (current && !seen.has(current.id)) { if (current.workItemType === 'Feature') return true; seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) } return false }
  return {
    storiesWithoutTask: stories.filter(story => !finished(story) && !tasks.some(task => task.parentId === story.id && timeWritingMonth(task.title) === month)),
    tasksWithoutMonth: tasks.filter(task => task.parentId != null && storyIds.has(task.parentId) && !timeWritingMonth(task.title)),
    tasksWithoutFeature: tasks.filter(task => timeWritingMonth(task.title) === month && !hasFeature(task)).map(task => ({ task, parent: task.parentId == null ? undefined : byId.get(task.parentId) })),
  }
}
