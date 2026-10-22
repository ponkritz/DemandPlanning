import type { AzureWorkItem } from './domain'
import { isMonthTask, timeWritingMonth, workingDays } from './azureInsights.ts'
import { isMine, type Me } from './myWork.ts'

// Capacity model for the selected month. Source rows are the Tasks whose title starts or ends with the month and year
// ("October 2026 | …", any delimiter), under any story; absence is everything under the
// configured absence Epic, where each person has a Feature for PTO / Sick Leave / Unplanned Leave.
export interface CapacitySettings { absenceEpicId: number; hoursPerDay: number; overloadedAt: number; availableBelow: number; profiles?: Record<string, ResourceProfile> }
export const defaultCapacitySettings: CapacitySettings = { absenceEpicId: 37778, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80 }
export type LoadStatus = 'Overloaded' | 'Balanced' | 'Has capacity' | 'No bookings'
export type AbsenceKind = 'PTO' | 'Sick Leave' | 'Unplanned Leave' | 'Public holiday' | 'Other absence'
export const absenceKinds: AbsenceKind[] = ['PTO', 'Sick Leave', 'Unplanned Leave', 'Public holiday', 'Other absence']

// Resource profile kept with the shared app data and keyed by the Azure Assigned To display name. Region decides
// which regional holidays apply; role and reporting line describe the team structure.
export const regions = ['India', 'Netherlands', 'US'] as const
export type Region = typeof regions[number]
export const resourceRoles = ['QE', 'QMS', 'CAPA', 'Lead', 'Manager'] as const
export type ResourceRole = typeof resourceRoles[number]
export interface ResourceProfile { region?: Region; role?: ResourceRole; reportsTo?: string; peopleManager?: boolean }

export function normalizeProfiles(value: unknown): Record<string, ResourceProfile> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, ResourceProfile> = {}
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!name.trim() || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const input = raw as Record<string, unknown>
    const profile: ResourceProfile = {}
    if (regions.includes(input.region as Region)) profile.region = input.region as Region
    if (resourceRoles.includes(input.role as ResourceRole)) profile.role = input.role as ResourceRole
    if (typeof input.reportsTo === 'string' && input.reportsTo.trim() && input.reportsTo !== name) profile.reportsTo = input.reportsTo
    if (input.peopleManager === true) profile.peopleManager = true
    if (Object.keys(profile).length) result[name] = profile
  }
  return result
}

// A Feature under the absence Epic whose title names holidays and a region (e.g. "Public Holidays - India") holds
// that region's holidays; its month Tasks apply to everyone mapped to the region instead of to the assignee.
export function holidayRegion(title: string): Region | null {
  if (!/\bholidays?\b/i.test(title)) return null
  if (/\bindia\b/i.test(title) || /\bIN\b/.test(title)) return 'India'
  if (/\b(netherlands|holland|dutch)\b/i.test(title) || /\bNL\b/.test(title)) return 'Netherlands'
  if (/\b(united states|usa)\b/i.test(title) || /\bUS\b/.test(title)) return 'US'
  return null
}

export interface StreamLoad { key: string; epic?: AzureWorkItem; title: string; work: number; planned: number; tasks: number }
export interface PersonLoad {
  name: string; funded: number; absence: number; absenceByKind: Record<AbsenceKind, number>; available: number
  work: number; planned: number; utilization: number | null; plannedUtilization: number | null; status: LoadStatus; tasks: number; streams: StreamLoad[]
}
export interface StreamSummary extends StreamLoad { people: number; features: number; share: number | null }

type ThresholdKey = 'absenceEpicId' | 'hoursPerDay' | 'overloadedAt' | 'availableBelow'
export function normalizeCapacitySettings(value: unknown): CapacitySettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Record<ThresholdKey, unknown>>
  const number = (key: ThresholdKey, min: number) => { const candidate = Number(input[key]); return Number.isFinite(candidate) && candidate >= min ? candidate : defaultCapacitySettings[key] }
  const settings = { absenceEpicId: Math.trunc(number('absenceEpicId', 1)), hoursPerDay: number('hoursPerDay', 0.25), overloadedAt: number('overloadedAt', 1), availableBelow: number('availableBelow', 0) }
  return settings.availableBelow < settings.overloadedAt ? settings : { ...settings, availableBelow: defaultCapacitySettings.availableBelow, overloadedAt: defaultCapacitySettings.overloadedAt }
}

// Settings the capacity model reads from the shared app data: thresholds plus each person's resource profile.
export function capacityContext(state: { capacitySettings?: unknown; resourceProfiles?: unknown }): CapacitySettings {
  return { ...normalizeCapacitySettings(state.capacitySettings), profiles: normalizeProfiles(state.resourceProfiles) }
}

export function absenceKind(titles: string[]): AbsenceKind {
  const text = titles.join(' ').toLowerCase()
  if (/\bunplanned\b|\bemergency\b/.test(text)) return 'Unplanned Leave'
  if (/\bsick\b|\bmedical\b/.test(text)) return 'Sick Leave'
  if (/\bpto\b|\bvacation\b|\bholiday\b|\bannual leave\b|\bplanned leave\b/.test(text)) return 'PTO'
  return 'Other absence'
}

export function loadStatus(utilization: number | null, settings: CapacitySettings): LoadStatus {
  if (utilization == null) return 'No bookings'
  if (utilization >= settings.overloadedAt) return 'Overloaded'
  if (utilization < settings.availableBelow) return 'Has capacity'
  return 'Balanced'
}

const hours = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
const percent = (numerator: number, denominator: number) => denominator > 0 ? Math.round(numerator / denominator * 10000) / 100 : null

export function capacityModel(source: AzureWorkItem[], month: string, settings: CapacitySettings = defaultCapacitySettings) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.')
  const items = [...new Map(source.filter(item => item.state.trim().toLowerCase() !== 'removed').map(item => [item.key, item])).values()]
  const byId = new Map(items.map(item => [item.id, item]))
  const ancestors = (item: AzureWorkItem) => {
    const chain: AzureWorkItem[] = []; const seen = new Set<number>([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId)
    while (current && !seen.has(current.id)) { chain.push(current); seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) }
    return chain
  }
  const monthlyTasks = items.filter(item => isMonthTask(item) && timeWritingMonth(item.title) === month)
  const funded = workingDays(month) * settings.hoursPerDay
  const people = new Map<string, PersonLoad & { streamMap: Map<string, StreamLoad> }>()
  const streams = new Map<string, StreamSummary & { names: Set<string>; featureKeys: Set<string> }>()
  const emptyKinds = (): Record<AbsenceKind, number> => ({ 'PTO': 0, 'Sick Leave': 0, 'Unplanned Leave': 0, 'Public holiday': 0, 'Other absence': 0 })
  const holidayHours = new Map<Region, number>()
  for (const task of monthlyTasks) {
    const chain = ancestors(task)
    const epic = chain.find(item => item.workItemType === 'Epic')
    const feature = chain.find(item => item.workItemType === 'Feature')
    const region = epic?.id === settings.absenceEpicId && feature ? holidayRegion(feature.title) : null
    if (region) { holidayHours.set(region, (holidayHours.get(region) ?? 0) + (hours(task.completedWork) || hours(task.originalEstimate) || settings.hoursPerDay)); continue }
    const name = task.assignedTo || feature?.assignedTo || 'Unassigned'
    const person = people.get(name) ?? { name, funded, absence: 0, absenceByKind: emptyKinds(), available: funded, work: 0, planned: 0, utilization: null, plannedUtilization: null, status: 'No bookings' as LoadStatus, tasks: 0, streams: [], streamMap: new Map() }
    people.set(name, person)
    const work = hours(task.completedWork), planned = hours(task.originalEstimate)
    if (epic?.id === settings.absenceEpicId) {
      const kind = absenceKind([task.title, ...chain.map(item => item.title)])
      person.absence += work; person.absenceByKind[kind] += work
      continue
    }
    person.work += work; person.planned += planned; person.tasks += 1
    const key = epic?.key ?? 'unmapped', title = epic?.title ?? 'No Epic path'
    const personStream = person.streamMap.get(key) ?? { key, epic, title, work: 0, planned: 0, tasks: 0 }
    personStream.work += work; personStream.planned += planned; personStream.tasks += 1; person.streamMap.set(key, personStream)
    const stream = streams.get(key) ?? { key, epic, title, work: 0, planned: 0, tasks: 0, people: 0, features: 0, share: null, names: new Set<string>(), featureKeys: new Set<string>() }
    stream.work += work; stream.planned += planned; stream.tasks += 1; stream.names.add(name); if (feature) stream.featureKeys.add(feature.key); streams.set(key, stream)
  }
  const profiles = settings.profiles ?? {}
  for (const person of people.values()) {
    const region = profiles[person.name]?.region, holiday = region ? holidayHours.get(region) ?? 0 : 0
    if (holiday) { person.absence += holiday; person.absenceByKind['Public holiday'] += holiday }
  }
  const holidays = [...holidayHours].map(([region, total]) => ({ region, hours: total, people: [...people.values()].filter(person => profiles[person.name]?.region === region).length }))
  const totalWork = [...streams.values()].reduce((sum, stream) => sum + stream.work, 0)
  const personList: PersonLoad[] = [...people.values()].map(person => {
    const available = Math.max(0, person.funded - person.absence)
    const utilization = person.tasks ? percent(person.work, available) : null
    const { streamMap, ...rest } = person
    return { ...rest, available, utilization, plannedUtilization: person.tasks ? percent(person.planned, available) : null, status: loadStatus(utilization, settings), streams: [...streamMap.values()].sort((a, b) => b.work - a.work) }
  }).sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1) || a.name.localeCompare(b.name))
  const streamList: StreamSummary[] = [...streams.values()].map(({ names, featureKeys, ...stream }) => ({ ...stream, people: names.size, features: featureKeys.size, share: percent(stream.work, totalWork) })).sort((a, b) => b.work - a.work)
  const totals = { funded: funded * personList.length, absence: personList.reduce((sum, person) => sum + person.absence, 0), work: totalWork, planned: personList.reduce((sum, person) => sum + person.planned, 0) }
  const available = Math.max(0, totals.funded - totals.absence)
  const absenceByKind = personList.reduce((kinds, person) => { for (const kind of absenceKinds) kinds[kind] += person.absenceByKind[kind]; return kinds }, emptyKinds())
  return {
    month, settings, workingDays: workingDays(month), fundedPerPerson: funded, monthlyTasks, people: personList, streams: streamList, holidays,
    totals: { ...totals, available, absenceByKind, utilization: personList.some(person => person.tasks) ? percent(totals.work, available) : null },
    counts: { overloaded: personList.filter(person => person.status === 'Overloaded').length, balanced: personList.filter(person => person.status === 'Balanced').length, hasCapacity: personList.filter(person => person.status === 'Has capacity').length, noBookings: personList.filter(person => person.status === 'No bookings').length },
  }
}
export type CapacityModel = ReturnType<typeof capacityModel>

// Funded, available and actual hours per month for the trend chart; months without any Time Writing Task are gaps.
export interface MonthlyHours { month: string; funded: number | null; available: number | null; actual: number | null; planned: number | null; utilization: number | null; plannedUtilization: number | null; absence: number; people: number; workingDays: number; streams: { key: string; title: string; work: number; planned: number }[]; byPerson: { name: string; utilization: number | null; work: number; available: number; status: LoadStatus }[] }
export function monthlyHours(source: AzureWorkItem[], endMonth: string, span = 12, settings: CapacitySettings = defaultCapacitySettings): MonthlyHours[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) throw new Error('Choose a valid month.')
  return Array.from({ length: span }, (_, index) => {
    const date = new Date(`${endMonth}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - (span - 1 - index))
    const month = date.toISOString().slice(0, 7)
    const model = capacityModel(source, month, settings)
    const booked = model.people.some((person) => person.tasks)
    return {
      month, funded: model.people.length ? model.totals.funded : null, available: model.people.length ? model.totals.available : null, actual: booked ? model.totals.work : null, planned: booked ? model.totals.planned : null,
      utilization: booked ? model.totals.utilization : null, plannedUtilization: booked ? percent(model.totals.planned, model.totals.available) : null,
      absence: model.totals.absence, people: model.people.length, workingDays: model.workingDays,
      streams: model.streams.map((stream) => ({ key: stream.key, title: stream.title, work: stream.work, planned: stream.planned })),
      byPerson: model.people.map((person) => ({ name: person.name, utilization: person.utilization, work: person.work, available: person.available, status: person.status })),
    }
  })
}

// Problem analysis over a window of months: hours of overrun (Completed Work above a positive Original Estimate)
// and ad-hoc hours (Tasks tagged "ad-hoc"), each grouped by Feature and by Epic, for Pareto charts. Absence is excluded.
export interface ProblemItem { key: string; title: string; work: number; colorKey: string; group: string; tasks: number }
export interface ProblemSet { feature: ProblemItem[]; epic: ProblemItem[]; total: number; tasks: number }
export function problemBreakdown(source: AzureWorkItem[], months: string[], settings: CapacitySettings = defaultCapacitySettings) {
  const monthSet = new Set(months)
  const items = [...new Map(source.filter((item) => item.state.trim().toLowerCase() !== 'removed').map((item) => [item.key, item])).values()]
  const byId = new Map(items.map((item) => [item.id, item]))
  const tasks = items.filter((item) => isMonthTask(item) && monthSet.has(timeWritingMonth(item.title) ?? ''))
  const chainOf = (item: AzureWorkItem) => {
    const chain: AzureWorkItem[] = []; const seen = new Set<number>([item.id]); let current = item.parentId == null ? undefined : byId.get(item.parentId)
    while (current && !seen.has(current.id)) { chain.push(current); seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) }
    return chain
  }
  type Bucket = { feature: Map<string, ProblemItem>; epic: Map<string, ProblemItem>; total: number; tasks: number }
  const bucket = (): Bucket => ({ feature: new Map(), epic: new Map(), total: 0, tasks: 0 })
  const overrun = bucket(), adhoc = bucket()
  let booked = 0
  const add = (target: Bucket, epic: AzureWorkItem | undefined, feature: AzureWorkItem | undefined, amount: number) => {
    target.total += amount; target.tasks += 1
    const epicKey = epic?.key ?? 'unmapped', epicTitle = epic?.title ?? 'No Epic path'
    const groups: Array<[Map<string, ProblemItem>, string, string]> = [[target.feature, feature?.key ?? `${epicKey}/no-feature`, feature?.title ?? `${epicTitle} (no Feature)`], [target.epic, epicKey, epicTitle]]
    for (const [map, key, title] of groups) { const entry = map.get(key) ?? { key, title, work: 0, colorKey: epicKey, group: epicTitle, tasks: 0 }; entry.work += amount; entry.tasks += 1; map.set(key, entry) }
  }
  for (const task of tasks) {
    const chain = chainOf(task), epic = chain.find((item) => item.workItemType === 'Epic'), feature = chain.find((item) => item.workItemType === 'Feature')
    if (epic?.id === settings.absenceEpicId) continue
    const work = hours(task.completedWork)
    booked += work
    if (typeof task.originalEstimate === 'number' && task.originalEstimate > 0 && work > task.originalEstimate) add(overrun, epic, feature, work - task.originalEstimate)
    if (work > 0 && (task.tags ?? '').split(';').some((tag) => tag.trim().toLowerCase() === 'ad-hoc')) add(adhoc, epic, feature, work)
  }
  const sorted = (map: Map<string, ProblemItem>) => [...map.values()].sort((a, b) => b.work - a.work || a.title.localeCompare(b.title))
  const finish = (target: Bucket): ProblemSet => ({ feature: sorted(target.feature), epic: sorted(target.epic), total: target.total, tasks: target.tasks })
  return { overrun: finish(overrun), adhoc: { ...finish(adhoc), share: booked > 0 ? percent(adhoc.total, booked) : null }, booked }
}

// Resource list derived from Azure: everyone who appears as Assigned To on a Time Writing Task (absence included),
// with the months they booked in, booked and absence hours, their main streams and their load in the selected month.
export interface AzureResource { name: string; firstMonth: string; lastMonth: string; months: number; tasks: number; work: number; absence: number; streams: string[]; status: LoadStatus; utilization: number | null }
export function azureResources(source: AzureWorkItem[], month: string, settings: CapacitySettings = defaultCapacitySettings): AzureResource[] {
  const months = [...new Set(source.filter((item) => item.workItemType === 'Task').map((item) => timeWritingMonth(item.title)).filter((value): value is string => !!value))].sort()
  const people = new Map<string, Omit<AzureResource, 'streams'> & { streamHours: Map<string, number> }>()
  for (const key of months) {
    for (const person of capacityModel(source, key, settings).people) {
      if (person.name === 'Unassigned') continue
      const entry = people.get(person.name) ?? { name: person.name, firstMonth: key, lastMonth: key, months: 0, tasks: 0, work: 0, absence: 0, status: 'No bookings' as LoadStatus, utilization: null, streamHours: new Map<string, number>() }
      entry.lastMonth = key; entry.months += 1; entry.tasks += person.tasks; entry.work += person.work; entry.absence += person.absence
      for (const stream of person.streams) entry.streamHours.set(stream.title, (entry.streamHours.get(stream.title) ?? 0) + stream.work)
      if (key === month) { entry.status = person.status; entry.utilization = person.utilization }
      people.set(person.name, entry)
    }
  }
  return [...people.values()].map(({ streamHours, ...person }) => ({ ...person, streams: [...streamHours].filter(([, work]) => work > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([title]) => title) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// One person's slice of the backlog for the Individual Overview: every Epic, Feature and Story stays (for hierarchy),
// but only Tasks assigned to that person, plus regional holiday Tasks, which are unassigned and apply by region.
export function itemsForPerson(source: AzureWorkItem[], person: Me, settings: CapacitySettings = defaultCapacitySettings) {
  const byId = new Map(source.map((item) => [item.id, item]))
  const holiday = (task: AzureWorkItem) => {
    let current = task.parentId == null ? undefined : byId.get(task.parentId), feature: AzureWorkItem | undefined
    const seen = new Set<number>([task.id])
    while (current && !seen.has(current.id)) {
      seen.add(current.id)
      if (current.workItemType === 'Feature') feature = current
      if (current.workItemType === 'Epic') return current.id === settings.absenceEpicId && feature != null && holidayRegion(feature.title) != null
      current = current.parentId == null ? undefined : byId.get(current.parentId)
    }
    return false
  }
  return source.filter((item) => item.workItemType !== 'Task' || isMine(item, person) || holiday(item))
}
