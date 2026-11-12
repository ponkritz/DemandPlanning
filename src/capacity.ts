import type { AzureWorkItem } from './domain'
import { isMonthTask, timeWritingMonth, workingDays } from './azureInsights.ts'
import { isMine, type Me } from './myWork.ts'
import { absenceKindBy, defaultBucketRules, isNpraTaskBy, isTrainingTaggedBy, isTrainingWorkBy, normalizeBucketRules, rulesOf, type BucketRules } from './bucketRules.ts'
import { normalizeInsightThresholds, type InsightThresholds } from './insightThresholds.ts'
import { activeFigureLock, addHours, applyProfile, defaultProfile, emptyCalcInputs, normalizeCalculationProfiles, normalizeFigureLocks, profileFormula, type BucketHours, type BucketKey, type CalcInputs, type CalculationProfile, type FigureLock } from './calculationProfiles.ts'

// Capacity model for the selected month. Source rows are the Tasks whose title starts or ends with the month and year
// ("October 2026 | …", any delimiter), under any story; absence is everything under the
// configured absence Epic, where each person has a Feature for PTO / Sick Leave / Unplanned Leave.
// Shared time: an Epic or Feature (by ID) whose month Tasks apply to many people at once instead of to the assignee —
// regional or company holidays (absence) and common activities such as PI Planning or an audit (reserved time). The
// scope is everyone or the people mapped to one region (Settings → Resources). Hours per Task: Original Estimate, else
// Completed Work, else one working day.
export type SharedTimeKind = 'holiday' | 'activity'
export type SharedTimeScope = 'everyone' | Region
export interface SharedTimeRule { id: number; kind: SharedTimeKind; scope: SharedTimeScope; label?: string }
// NPRA (non-project related activities: internal meetings such as stand-ups, special projects and town halls, and
// trainings such as white belt, AI and Cornerstone): a Task is NPRA when it or an ancestor carries a tag starting with
// "NPRA" ("NPRA", "NPRA Hours", "NPRA - Training") or "Training" (CAP-32). The hours booked on NPRA Tasks come off the person's available
// hours (only what is booked, nothing is reserved up front) and are tracked against npraHoursPerMonth (20 by default),
// the maximum per person per month; hours over it are flagged. 0 tracks without a maximum.
// defaultJoinedOn: the Joined on of everyone without their own (YYYY-MM-DD; '' for none): months before it give them no
// capacity (CAP-15).
// Month locks (MON-06, MON-07, MON-21…MON-24): each month's plan and actuals lock dates (YYYY-MM-DD, the day itself still
// open), an early lock per month, and the reason and who changed it — kept with the capacity settings in Git.
// CAP-36: hours every person keeps for standard activities, deducted from the Old Calculation Net Capacity; the total
// is the sum of the breakup lines (one set for everyone and every month, shared in Git with the capacity settings).
export interface StandardHourLine { label: string; hours: number }
export const defaultStandardHours: StandardHourLine[] = [{ label: 'Standard hours', hours: 32 }]
export function normalizeStandardHours(value: unknown): StandardHourLine[] {
  if (!Array.isArray(value)) return defaultStandardHours.map((line) => ({ ...line }))
  return value.slice(0, 20).flatMap((raw) => {
    const entry = (raw && typeof raw === 'object' ? raw : {}) as { label?: unknown; hours?: unknown }
    const hours = Number(entry.hours)
    if (!Number.isFinite(hours) || hours < 0 || hours > 744) return []
    const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim().slice(0, 80) : 'Standard hours'
    return [{ label, hours: Math.round(hours * 100) / 100 }]
  })
}
export const standardHoursTotal = (lines: StandardHourLine[] | undefined) => Math.round((lines ?? defaultStandardHours).reduce((sum, line) => sum + line.hours, 0) * 100) / 100
export interface MonthLock { planOn?: string; actualsOn?: string; planLocked?: boolean; actualsLocked?: boolean; reason?: string; updatedAt?: string; updatedBy?: string }
export interface CapacitySettings { planLockDay?: number; actualsLockDay?: number; monthLocks?: Record<string, MonthLock>; absenceEpicId: number; hoursPerDay: number; overloadedAt: number; availableBelow: number; npraHoursPerMonth: number; defaultJoinedOn?: string; sharedTime?: SharedTimeRule[]; standardHours?: StandardHourLine[]; oldCalcExcludedScopes?: SharedTimeScope[]; profiles?: Record<string, ResourceProfile>
  // CAP-41/42: custom calculation profiles and the default profile's id; CAP-43: the locked figures per month.
  calculationProfiles?: CalculationProfile[]; defaultProfileId?: string; figureLocks?: Record<string, FigureLock[]>
  // CAP-46: the words and tags that decide absence kinds, training and other NPRA (built-in ones when unset).
  bucketRules?: BucketRules
  // CAP-47: the insight thresholds of Team overview (built-in values when unset).
  insightThresholds?: InsightThresholds
  // CAP-50: the team roles and app access roles left out of capacity (built-in: Lead, Manager; People Manager).
  capacityRoles?: CapacityRoles
  // CAP-50: each person's app access roles by email (from access.json at run time; never stored here).
  accessRoles?: Record<string, string[]> }
export interface CapacityRoles { excludedResourceRoles: ResourceRole[]; excludedAccessRoles: string[] }
export const defaultCapacitySettings: CapacitySettings = { absenceEpicId: 37778, hoursPerDay: 8, overloadedAt: 100, availableBelow: 80, npraHoursPerMonth: 20, defaultJoinedOn: '2026-05-01' }
// An NPRA Task: tagged itself, or under a tagged Story / Feature / Epic (the absence Epic and mapped shared time win).
// CAP-46: the tags come from the bucket rules (built-in: NPRA, Training).
export const isTrainingTagged = (task: AzureWorkItem, chain: AzureWorkItem[], rules: BucketRules = defaultBucketRules) => isTrainingTaggedBy(rules, task, chain)
export const isNpraTask = (task: AzureWorkItem, chain: AzureWorkItem[], rules: BucketRules = defaultBucketRules) => isNpraTaskBy(rules, task, chain)
export const regions = ['India', 'Netherlands', 'US'] as const
export type Region = typeof regions[number]
export type LoadStatus = 'Overloaded' | 'Balanced' | 'Has capacity' | 'No bookings'
export type AbsenceKind = 'PTO' | 'Sick Leave' | 'Unplanned Leave' | 'Public holiday' | 'Other absence'
export const absenceKinds: AbsenceKind[] = ['PTO', 'Sick Leave', 'Unplanned Leave', 'Public holiday', 'Other absence']

// Resource profile kept with the shared app data and keyed by the Azure Assigned To display name. Region decides
// which regional holidays apply; role and reporting line describe the team structure. joinedOn / leftOn (YYYY-MM-DD,
// both days worked) limit the person's funded hours to the working days they are employed: a month before joining or
// after leaving gives them no capacity and leaves them out of the head-count; a month they join or leave in is prorated.
export const resourceRoles = ['QE', 'QMS', 'CAPA', 'Lead', 'Manager'] as const
export type ResourceRole = typeof resourceRoles[number]
// removed (CAP-33): taken out of Settings → Resources and out of every capacity figure (their hours too); restorable.
// CAP-49: email links the person (Azure DevOps display name) to their app access (access.json is keyed by email).
export interface ResourceProfile { region?: Region; role?: ResourceRole; reportsTo?: string; peopleManager?: boolean; joinedOn?: string; leftOn?: string; listed?: 'team' | 'added'; removed?: boolean; email?: string }
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)

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
    if (isDay(input.joinedOn)) profile.joinedOn = input.joinedOn
    if (isDay(input.leftOn) && !(profile.joinedOn && input.leftOn < profile.joinedOn)) profile.leftOn = input.leftOn
    if (input.listed === 'team' || input.listed === 'added') profile.listed = input.listed
    if (input.removed === true) profile.removed = true
    if (typeof input.email === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(input.email.trim())) profile.email = input.email.trim().toLowerCase()
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

// Working days (Monday–Friday) of a month that fall within a person's employment, joining and leaving days included.
export function employedDays(month: string, profile?: Pick<ResourceProfile, 'joinedOn' | 'leftOn'>) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.')
  const [year, index] = month.split('-').map(Number), last = new Date(Date.UTC(year, index, 0)).getUTCDate()
  let days = 0
  for (let day = 1; day <= last; day += 1) {
    const weekday = new Date(Date.UTC(year, index - 1, day)).getUTCDay(), date = `${month}-${String(day).padStart(2, '0')}`
    if (weekday === 0 || weekday === 6 || (profile?.joinedOn && date < profile.joinedOn) || (profile?.leftOn && date > profile.leftOn)) continue
    days += 1
  }
  return days
}

export interface StreamLoad { key: string; epic?: AzureWorkItem; title: string; work: number; planned: number; tasks: number }
// npra: hours booked on NPRA Tasks; npraAllowance: the per-person allowance; npraOver: hours over it (0 within it);
// npraDeducted: what comes off the funded hours — the booked NPRA hours.
export interface PersonLoad {
  name: string; employedDays: number; funded: number; absence: number; absenceByKind: Record<AbsenceKind, number>; reserved: number; available: number
  npra: number; npraPlanned: number; npraTasks: number; npraAllowance: number; npraOver: number; npraDeducted: number
  // CAP-38: NPRA split into Trainings and Other NPRA; common activities planned / recorded; utilized = every hour that
  // counts as used (work + trainings + other NPRA + common activities). npra = training + npraOther; npraDeducted is 0.
  training: number; trainingPlanned: number; npraOther: number; npraOtherPlanned: number; reservedPlanned: number; reservedActual: number
  utilized: number; utilizedPlanned: number
  work: number; planned: number; utilization: number | null; plannedUtilization: number | null; status: LoadStatus; tasks: number; streams: StreamLoad[]
  // CAP-35 (Old Calculation): every hour of the person — work, absence, holidays, training, NPRA and the shared time
  // that applies to them — planned (Original Estimate) and actual (Completed Work).
  allPlanned: number; allActual: number
  // CAP-37: the shared time ('All' / 'All-<Region>') in allPlanned / allActual, by scope, so the Old Calculation can leave a group out.
  sharedByScope: Partial<Record<SharedTimeScope, { planned: number; actual: number }>>
}
export interface StreamSummary extends StreamLoad { people: number; features: number; share: number | null }

type ThresholdKey = 'absenceEpicId' | 'hoursPerDay' | 'overloadedAt' | 'availableBelow' | 'npraHoursPerMonth'
// The default Joined on: a valid day, '' when cleared, else the built-in default (1 May 2026).
const defaultJoinedOf = (value: unknown) => value === '' ? '' : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value) ? value : defaultCapacitySettings.defaultJoinedOn!
export function normalizeCapacitySettings(value: unknown): CapacitySettings {
  const input = (value && typeof value === 'object' ? value : {}) as Partial<Record<ThresholdKey, unknown>>
  const number = (key: ThresholdKey, min: number) => { const candidate = Number(input[key]); return Number.isFinite(candidate) && candidate >= min ? candidate : defaultCapacitySettings[key] }
  const sharedTime = normalizeSharedTime((value as { sharedTime?: unknown } | null)?.sharedTime)
  const settings = { absenceEpicId: Math.trunc(number('absenceEpicId', 1)), hoursPerDay: number('hoursPerDay', 0.25), overloadedAt: number('overloadedAt', 1), availableBelow: number('availableBelow', 0), npraHoursPerMonth: number('npraHoursPerMonth', 0), defaultJoinedOn: defaultJoinedOf((value as { defaultJoinedOn?: unknown } | null)?.defaultJoinedOn), ...(sharedTime.length ? { sharedTime } : {}) }
  const locks = normalizeLocks(value)
  // CAP-36: kept only once set (an empty breakup is 0 h); without one the default 32 h applies.
  const standard = (value as { standardHours?: unknown } | null)?.standardHours
  // CAP-37: the shared-time groups left out of the Old Calculation (kept only when some are).
  const excluded = (value as { oldCalcExcludedScopes?: unknown } | null)?.oldCalcExcludedScopes
  const oldCalcExcludedScopes = Array.isArray(excluded) ? sharedTimeScopes.filter((scope) => excluded.includes(scope)) : []
  // CAP-41…43: custom profiles, the default profile (a known id only) and the locked figures, each kept only once set.
  const raw = (value ?? {}) as { calculationProfiles?: unknown; defaultProfileId?: unknown; figureLocks?: unknown; bucketRules?: unknown; insightThresholds?: unknown; capacityRoles?: unknown }
  const capacityRoles = normalizeCapacityRoles(raw.capacityRoles)
  const insightThresholds = normalizeInsightThresholds(raw.insightThresholds)
  const bucketRules = normalizeBucketRules(raw.bucketRules)
  const calculationProfiles = normalizeCalculationProfiles(raw.calculationProfiles)
  const defaultProfileId = typeof raw.defaultProfileId === 'string' && ['current-v4', 'old-calculation', ...calculationProfiles.map((profile) => profile.id)].includes(raw.defaultProfileId) && raw.defaultProfileId !== 'current-v4' ? raw.defaultProfileId : undefined
  const figureLocks = normalizeFigureLocks(raw.figureLocks)
  const withLocks = { ...settings, ...locks, ...(Array.isArray(standard) ? { standardHours: normalizeStandardHours(standard) } : {}), ...(oldCalcExcludedScopes.length ? { oldCalcExcludedScopes } : {}), ...(calculationProfiles.length ? { calculationProfiles } : {}), ...(defaultProfileId ? { defaultProfileId } : {}), ...(Object.keys(figureLocks).length ? { figureLocks } : {}), ...(bucketRules ? { bucketRules } : {}), ...(insightThresholds ? { insightThresholds } : {}), ...(capacityRoles ? { capacityRoles } : {}) }
  return withLocks.availableBelow < withLocks.overloadedAt ? withLocks : { ...withLocks, availableBelow: defaultCapacitySettings.availableBelow, overloadedAt: defaultCapacitySettings.overloadedAt }
}
const lockDay = (value: unknown) => { const day = Number(value); return Number.isInteger(day) && day >= 1 && day <= 28 ? day : undefined }
const isLockDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
function normalizeLocks(value: unknown) {
  const input = (value && typeof value === 'object' ? value : {}) as { planLockDay?: unknown; actualsLockDay?: unknown; monthLocks?: unknown }
  const monthLocks: Record<string, MonthLock> = {}
  if (input.monthLocks && typeof input.monthLocks === 'object' && !Array.isArray(input.monthLocks)) for (const [month, raw] of Object.entries(input.monthLocks as Record<string, unknown>)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !raw || typeof raw !== 'object') continue
    const entry = raw as Record<string, unknown>, lock: MonthLock = {}
    if (isLockDate(entry.planOn)) lock.planOn = entry.planOn
    if (isLockDate(entry.actualsOn)) lock.actualsOn = entry.actualsOn
    if (entry.planLocked === true) lock.planLocked = true
    if (entry.actualsLocked === true) lock.actualsLocked = true
    if (typeof entry.reason === 'string' && entry.reason.trim()) lock.reason = entry.reason.trim().slice(0, 500)
    if (typeof entry.updatedAt === 'string') lock.updatedAt = entry.updatedAt.slice(0, 40)
    if (typeof entry.updatedBy === 'string') lock.updatedBy = entry.updatedBy.slice(0, 200)
    if (lock.planOn || lock.actualsOn || lock.planLocked || lock.actualsLocked) monthLocks[month] = lock
  }
  const planLockDay = lockDay(input.planLockDay), actualsLockDay = lockDay(input.actualsLockDay)
  return { ...(planLockDay ? { planLockDay } : {}), ...(actualsLockDay ? { actualsLockDay } : {}), ...(Object.keys(monthLocks).length ? { monthLocks } : {}) }
}

// Settings the capacity model reads from the shared app data: thresholds plus each person's resource profile.
// Mappings read from the shared app data: one per work item ID (the last one wins), with a valid kind and scope.
export function normalizeSharedTime(value: unknown): SharedTimeRule[] {
  if (!Array.isArray(value)) return []
  const rules = new Map<number, SharedTimeRule>()
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const input = raw as Record<string, unknown>
    const id = Number(input.id), kind = input.kind, scope = input.scope
    if (!Number.isSafeInteger(id) || id < 1 || (kind !== 'holiday' && kind !== 'activity') || !(scope === 'everyone' || regions.includes(scope as Region))) continue
    const label = typeof input.label === 'string' ? input.label.trim().slice(0, 120) : ''
    rules.set(id, { id, kind, scope: scope as SharedTimeScope, ...(label ? { label } : {}) })
  }
  return [...rules.values()]
}
// The shared-time rule of a month Task: the nearest of the Task and its ancestors (nearest first) that is mapped; else a
// Feature under the absence Epic named like "Public Holidays - India" counts as that region's holidays (kept from
// before the mapping existed). undefined: an ordinary Task of its assignee.
export function sharedTimeOf(task: AzureWorkItem, chain: AzureWorkItem[], settings: CapacitySettings): (SharedTimeRule & { source: AzureWorkItem }) | undefined {
  const rules = settings.sharedTime ?? []
  if (rules.length) for (const item of [task, ...chain]) { const rule = rules.find((entry) => entry.id === item.id); if (rule) return { ...rule, source: item } }
  const epic = chain.find((item) => item.workItemType === 'Epic'), feature = chain.find((item) => item.workItemType === 'Feature')
  const region = epic?.id === settings.absenceEpicId && feature ? holidayRegion(feature.title) : null
  return region && feature ? { id: feature.id, kind: 'holiday', scope: region, source: feature } : undefined
}
// The shared-time groups: 'All' (everyone) and 'All-<Region>'.
export const sharedTimeScopes: SharedTimeScope[] = ['everyone', ...regions]
export const sharedTimeScopeLabel = (scope: SharedTimeScope) => scope === 'everyone' ? 'All' : `All-${scope}`
export const inScope = (scope: SharedTimeScope, region: Region | undefined) => scope === 'everyone' || scope === region

// CAP-50: the app access roles by email, set by the app whenever access.json is loaded or saved, so every page counts
// capacity with the same roles.
let currentAccessRoles: Record<string, string[]> = {}
export function setAccessRoles(members: Record<string, string[]> | undefined) { currentAccessRoles = Object.fromEntries(Object.entries(members ?? {}).map(([email, list]) => [email.toLowerCase(), [...list]])) }
export function capacityContext(state: { capacitySettings?: unknown; resourceProfiles?: unknown }): CapacitySettings {
  return { ...normalizeCapacitySettings(state.capacitySettings), profiles: normalizeProfiles(state.resourceProfiles), accessRoles: currentAccessRoles }
}

// CAP-50: which roles count for capacity. Built-in: Lead and Manager (team roles) and People Manager (app access role, or
// the People manager tick in Resources) are left out. Stored only when it differs from the built-in choice.
export const accessRoleNames = ['Admin', 'Product Owner', 'People Manager', 'Scrum Master', 'Team Member'] as const
export const defaultCapacityRoles: CapacityRoles = { excludedResourceRoles: ['Lead', 'Manager'], excludedAccessRoles: ['People Manager'] }
export function normalizeCapacityRoles(value: unknown): CapacityRoles | undefined {
  if (!value || typeof value !== 'object') return undefined
  const input = value as { excludedResourceRoles?: unknown; excludedAccessRoles?: unknown }
  const pick = <T extends string>(list: unknown, allowed: readonly T[], fallback: T[]) => Array.isArray(list) ? allowed.filter((entry) => list.includes(entry)) : [...fallback]
  const roles = { excludedResourceRoles: pick(input.excludedResourceRoles, resourceRoles, defaultCapacityRoles.excludedResourceRoles), excludedAccessRoles: pick(input.excludedAccessRoles, accessRoleNames, defaultCapacityRoles.excludedAccessRoles as typeof accessRoleNames[number][]) as string[] }
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((entry) => b.includes(entry))
  return same(roles.excludedResourceRoles, defaultCapacityRoles.excludedResourceRoles) && same(roles.excludedAccessRoles, defaultCapacityRoles.excludedAccessRoles) ? undefined : roles
}
// Why a person is not counted for capacity because of a role (undefined when counted).
export function roleExclusion(name: string, settings: CapacitySettings): string | undefined {
  const roles = settings.capacityRoles ?? defaultCapacityRoles, profile = settings.profiles?.[name]
  if (profile?.role && roles.excludedResourceRoles.includes(profile.role)) return `team role ${profile.role}`
  if (profile?.peopleManager && roles.excludedAccessRoles.includes('People Manager')) return 'People manager'
  const access = profile?.email ? settings.accessRoles?.[profile.email] ?? [] : []
  const role = access.find((entry) => roles.excludedAccessRoles.includes(entry))
  return role ? `app role ${role}` : undefined
}

export const absenceKind = (titles: string[], rules: BucketRules = defaultBucketRules): AbsenceKind => absenceKindBy(rules, titles)

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
  const profiles = settings.profiles ?? {}
  const rules = rulesOf(settings)
  const outside = new Map<string, { name: string; tasks: number; hours: number; joinedOn?: string; leftOn?: string }>()
  const removedPeople = new Map<string, { name: string; tasks: number; hours: number }>()
  const notCounted = new Map<string, { name: string; tasks: number; hours: number; reason: string }>()
  // A person's own Joined on wins; without one, the default Joined on of the settings applies.
  const employmentOf = (name: string) => ({ joinedOn: profiles[name]?.joinedOn ?? (settings.defaultJoinedOn || undefined), leftOn: profiles[name]?.leftOn })
  // Settings read before the NPRA allowance existed (or built by hand) take the default allowance.
  const npraAllowance = typeof settings.npraHoursPerMonth === 'number' && Number.isFinite(settings.npraHoursPerMonth) && settings.npraHoursPerMonth >= 0 ? settings.npraHoursPerMonth : defaultCapacitySettings.npraHoursPerMonth
  const people = new Map<string, PersonLoad & { streamMap: Map<string, StreamLoad> }>()
  // CAP-41: the hours of each bucket per person, for the calculation profile.
  const calcs = new Map<string, CalcInputs>()
  const calcOf = (name: string) => { const found = calcs.get(name); if (found) return found; const made = emptyCalcInputs(); calcs.set(name, made); return made }
  const ownTask = (work: number, planned: number, deducted = work, tasks = 1): BucketHours => ({ estimate: planned, completed: work, estimateElseCompleted: planned || work, deducted, tasks })
  const streams = new Map<string, StreamSummary & { names: Set<string>; featureKeys: Set<string> }>()
  const emptyKinds = (): Record<AbsenceKind, number> => ({ 'PTO': 0, 'Sick Leave': 0, 'Unplanned Leave': 0, 'Public holiday': 0, 'Other absence': 0 })
  // Shared time (holidays, common activities): hours per mapped Epic / Feature, applied to the people in scope below.
  const shared = new Map<number | string, SharedTimeRule & { source: AzureWorkItem; hours: number; actual: number; tasks: number }>()
  for (const task of monthlyTasks) {
    const chain = ancestors(task)
    const epic = chain.find(item => item.workItemType === 'Epic')
    const feature = chain.find(item => item.workItemType === 'Feature')
    // An imported row for a group (HIS-13: "All", "All-BLR", "All-NL", "All-US") is shared time for that group: a
    // holiday under the absence Epic (or a mapped holiday Feature), else a common activity; trainings count as activity.
    const group = task.id < 0 && task.organization === 'history' ? /(?:^|;)\s*Shared:\s*(everyone|India|Netherlands|US)\s*(?:;|$)/.exec(task.tags)?.[1] as SharedTimeScope | undefined : undefined
    if (group) {
      const mapped = sharedTimeOf(task, chain, settings)
      const kind: SharedTimeKind = mapped?.kind ?? (epic?.id === settings.absenceEpicId && !isTrainingWorkBy(rules, task, chain) ? 'holiday' : 'activity')
      const id = feature?.id ?? task.id, key = `history:${id}:${group}`
      const entry = shared.get(key) ?? { id, kind, scope: group, source: feature ?? task, hours: 0, actual: 0, tasks: 0 }
      entry.hours += hours(task.completedWork) || hours(task.originalEstimate); entry.actual += hours(task.completedWork); entry.tasks += 1
      shared.set(key, entry); continue
    }
    const rule = sharedTimeOf(task, chain, settings)
    // An imported historical row (HIS-12) is one person's own hours: under a holiday or common-activity Feature it
    // counts for that person only, never added up and spread over everyone in scope like an Azure DevOps booking.
    const ownShare = rule && task.organization === 'history' && task.id < 0 ? rule : undefined
    if (rule && !ownShare) {
      const entry = shared.get(rule.id) ?? { ...rule, hours: 0, actual: 0, tasks: 0 }
      entry.hours += hours(task.originalEstimate) || hours(task.completedWork) || settings.hoursPerDay; entry.actual += hours(task.completedWork); entry.tasks += 1
      shared.set(rule.id, entry); continue
    }
    const name = task.assignedTo || feature?.assignedTo || 'Unassigned'
    // CAP-33: a person removed in Settings → Resources is not counted — no capacity, no hours; listed apart.
    if (profiles[name]?.removed) { const entry = removedPeople.get(name) ?? { name, tasks: 0, hours: 0 }; entry.tasks += 1; entry.hours += hours(task.completedWork); removedPeople.set(name, entry); continue }
    // CAP-50: a person in a role not counted for capacity (e.g. Lead, People Manager) is listed apart, hours too.
    const excludedBy = roleExclusion(name, settings)
    if (excludedBy) { const entry = notCounted.get(name) ?? { name, tasks: 0, hours: 0, reason: excludedBy }; entry.tasks += 1; entry.hours += hours(task.completedWork); notCounted.set(name, entry); continue }
    // Employed on no working day of the month (joined later or left earlier): no capacity, not counted; the hours
    // booked are listed apart (outsideEmployment) so they can be checked.
    const employment = employmentOf(name)
    const days = employedDays(month, employment)
    if (!days) { const entry = outside.get(name) ?? { name, tasks: 0, hours: 0, joinedOn: employment.joinedOn, leftOn: employment.leftOn }; entry.tasks += 1; entry.hours += hours(task.completedWork); outside.set(name, entry); continue }
    const personFunded = days * settings.hoursPerDay
    const person = people.get(name) ?? { name, employedDays: days, funded: personFunded, absence: 0, absenceByKind: emptyKinds(), available: personFunded, work: 0, planned: 0, utilization: null, plannedUtilization: null, status: 'No bookings' as LoadStatus, tasks: 0, streams: [], npra: 0, npraPlanned: 0, npraTasks: 0, npraAllowance, npraOver: 0, npraDeducted: 0, reserved: 0, allPlanned: 0, allActual: 0, sharedByScope: {}, training: 0, trainingPlanned: 0, npraOther: 0, npraOtherPlanned: 0, reservedPlanned: 0, reservedActual: 0, utilized: 0, utilizedPlanned: 0, streamMap: new Map() }
    people.set(name, person)
    const work = hours(task.completedWork), planned = hours(task.originalEstimate)
    person.allPlanned += planned; person.allActual += work
    if (ownShare) {
      const own = work || planned
      // CAP-40: a holiday with no Original Estimate counts its Completed Work as planned in the Old Calculation.
      if (ownShare.kind === 'holiday') { person.absence += own; person.absenceByKind['Public holiday'] += own; if (!planned) person.allPlanned += work } else { person.reserved += own; person.reservedPlanned += planned; person.reservedActual += work }
      addHours(calcOf(name).own[ownShare.kind === 'holiday' ? 'absence' : 'common'], ownTask(work, planned, own, 0))
      continue
    }
    // Team Holidays and Training (CAP-16): leave is absence; training is NPRA.
    const training = epic?.id === settings.absenceEpicId && isTrainingWorkBy(rules, task, chain)
    if (epic?.id === settings.absenceEpicId && !training) {
      const kind = absenceKind([task.title, ...chain.filter(item => item.workItemType !== 'Epic').map(item => item.title)], rules)
      person.absence += work; person.absenceByKind[kind] += work
      // CAP-40: absence with no Original Estimate counts its Completed Work as planned in the Old Calculation.
      if (!planned) person.allPlanned += work
      addHours(calcOf(name).own.absence, ownTask(work, planned))
      continue
    }
    if (training || isNpraTask(task, chain, rules)) {
      person.npra += work; person.npraPlanned += planned; person.npraTasks += 1
      // CAP-38: a training (under the absence Epic, or tagged Training on the Task or above it) vs any other NPRA.
      if (training || isTrainingTagged(task, chain, rules)) { person.training += work; person.trainingPlanned += planned; addHours(calcOf(name).own.training, ownTask(work, planned)) } else { person.npraOther += work; person.npraOtherPlanned += planned; addHours(calcOf(name).own.npraOther, ownTask(work, planned)) }
      continue
    }
    person.work += work; person.planned += planned; person.tasks += 1
    addHours(calcOf(name).own.work, ownTask(work, planned))
    const key = epic?.key ?? 'unmapped', title = epic?.title ?? 'No Epic path'
    const personStream = person.streamMap.get(key) ?? { key, epic, title, work: 0, planned: 0, tasks: 0 }
    personStream.work += work; personStream.planned += planned; personStream.tasks += 1; person.streamMap.set(key, personStream)
    const stream = streams.get(key) ?? { key, epic, title, work: 0, planned: 0, tasks: 0, people: 0, features: 0, share: null, names: new Set<string>(), featureKeys: new Set<string>() }
    stream.work += work; stream.planned += planned; stream.tasks += 1; stream.names.add(name); if (feature) stream.featureKeys.add(feature.key); streams.set(key, stream)
  }
  const sharedTime = [...shared.values()].map((entry) => {
    const inside = [...people.values()].filter((person) => inScope(entry.scope, profiles[person.name]?.region))
    for (const person of inside) {
      if (entry.kind === 'holiday') { person.absence += entry.hours; person.absenceByKind['Public holiday'] += entry.hours }
      else { person.reserved += entry.hours; person.reservedPlanned += entry.hours; person.reservedActual += entry.actual }
      person.allPlanned += entry.hours; person.allActual += entry.actual
      const byScope = person.sharedByScope[entry.scope] ?? { planned: 0, actual: 0 }
      byScope.planned += entry.hours; byScope.actual += entry.actual; person.sharedByScope[entry.scope] = byScope
      const calc = calcOf(person.name), bucket: BucketKey = entry.kind === 'holiday' ? 'absence' : 'common'
      const part = (calc.shared[entry.scope] ??= {})[bucket] ??= { estimate: 0, completed: 0, estimateElseCompleted: 0, deducted: 0, tasks: 0 }
      addHours(part, { estimate: entry.hours, completed: entry.actual, estimateElseCompleted: entry.hours, deducted: entry.hours })
    }
    const { source, actual: _actual, ...rule } = entry
    return { ...rule, title: rule.label || source.title, item: source, people: inside.length }
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title))
  // Regional holidays by region (kept for the Resources summary).
  const holidays = regions.map((region) => ({ region, hours: sharedTime.filter((entry) => entry.kind === 'holiday' && entry.scope === region).reduce((sum, entry) => sum + entry.hours, 0), people: [...people.values()].filter(person => profiles[person.name]?.region === region).length })).filter((entry) => entry.hours > 0)
  // CAP-38 / CAP-41: the figures come from the default calculation profile. Its built-in "Current (v4)" is the CAP-38
  // formula: Utilization = utilized hours ÷ (Contractual hours − Absence hours); Contractual = working days employed ×
  // hours per day (funded); Absence = PTO + Sick Leave + Unplanned Leave + Public holidays + Other absence; Trainings,
  // other NPRA and common activities count as utilized hours. The NPRA allowance is a check only.
  const profile = defaultProfile(settings)
  const livePeople: PersonLoad[] = [...people.values()].map(person => {
    const npraOver = person.npraAllowance > 0 ? Math.max(0, person.npra - person.npraAllowance) : 0
    const figures = applyProfile(person, calcs.get(person.name) ?? emptyCalcInputs(), profile, settings, workingDays(month))
    const { streamMap, ...rest } = person
    return { ...rest, npraOver, ...figures, streams: [...streamMap.values()].sort((a, b) => b.work - a.work) }
  })
  // CAP-43: a month whose figures are locked shows the person figures as they were locked.
  const lock = activeFigureLock(settings, month)
  const personList: PersonLoad[] = (lock ? lock.people.map((person) => ({ ...person, streams: person.streams.map((stream) => ({ ...stream })) })) : livePeople)
    .sort((a, b) => (b.utilization ?? -1) - (a.utilization ?? -1) || a.name.localeCompare(b.name))
  const totalWork = [...streams.values()].reduce((sum, stream) => sum + stream.work, 0)
  const streamList: StreamSummary[] = [...streams.values()].map(({ names, featureKeys, ...stream }) => ({ ...stream, people: names.size, features: featureKeys.size, share: percent(stream.work, totalWork) })).sort((a, b) => b.work - a.work)
  // The team figure adds up the people (each person's available hours already at least 0).
  type SumKey = 'funded' | 'absence' | 'reserved' | 'npra' | 'npraDeducted' | 'npraOver' | 'work' | 'planned' | 'available' | 'utilized' | 'utilizedPlanned' | 'training' | 'npraOther' | 'reservedActual' | 'reservedPlanned'
  const sum = (key: SumKey) => personList.reduce((total, person) => total + person[key], 0)
  const totals = { funded: sum('funded'), absence: sum('absence'), reserved: sum('reserved'), npra: sum('npra'), npraDeducted: sum('npraDeducted'), npraOver: sum('npraOver'), work: lock ? sum('work') : totalWork, planned: sum('planned') }
  const available = sum('available'), utilized = sum('utilized'), utilizedPlanned = sum('utilizedPlanned')
  const absenceByKind = personList.reduce((kinds, person) => { for (const kind of absenceKinds) kinds[kind] += person.absenceByKind[kind]; return kinds }, emptyKinds())
  return {
    month, settings, workingDays: workingDays(month), fundedPerPerson: funded, profile: lock ? { name: lock.profileName, formula: lock.formula } : { name: profile.name, formula: profileFormula(profile, settings) }, locked: lock ? { lockedOn: lock.lockedOn, lockedBy: lock.lockedBy, profileName: lock.profileName } : undefined, outsideEmployment: [...outside.values()], removed: [...removedPeople.values()], notCounted: [...notCounted.values()], prorated: personList.filter((person) => person.employedDays < workingDays(month)).map((person) => ({ name: person.name, days: person.employedDays, funded: person.funded })), monthlyTasks, people: personList, streams: streamList, holidays, sharedTime,
    totals: { ...totals, available, utilized, utilizedPlanned, training: sum('training'), npraOther: sum('npraOther'), reservedActual: sum('reservedActual'), reservedPlanned: sum('reservedPlanned'), absenceByKind, utilization: personList.some(person => person.utilization != null) ? percent(utilized, available) : null, plannedUtilization: personList.some(person => person.plannedUtilization != null) ? percent(utilizedPlanned, available) : null },
    counts: { npraOver: personList.filter(person => person.npraOver > 0).length, overloaded: personList.filter(person => person.status === 'Overloaded').length, balanced: personList.filter(person => person.status === 'Balanced').length, hasCapacity: personList.filter(person => person.status === 'Has capacity').length, noBookings: personList.filter(person => person.status === 'No bookings').length },
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
    const booked = model.people.some((person) => person.utilization != null)
    return {
      month, funded: model.people.length ? model.totals.funded : null, available: model.people.length ? model.totals.available : null, actual: booked ? model.totals.utilized : null, planned: booked ? model.totals.utilizedPlanned : null,
      utilization: booked ? model.totals.utilization : null, plannedUtilization: booked ? model.totals.plannedUtilization : null,
      absence: model.totals.absence, people: model.people.length, workingDays: model.workingDays,
      streams: model.streams.map((stream) => ({ key: stream.key, title: stream.title, work: stream.work, planned: stream.planned })),
      byPerson: model.people.map((person) => ({ name: person.name, utilization: person.utilization, work: person.utilized, available: person.available, status: person.status })),
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
    if (epic?.id === settings.absenceEpicId || isNpraTask(task, chain, rulesOf(settings))) continue
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
      entry.lastMonth = key; entry.months += 1; entry.tasks += person.tasks + person.npraTasks; entry.work += person.utilized; entry.absence += person.absence
      for (const stream of person.streams) entry.streamHours.set(stream.title, (entry.streamHours.get(stream.title) ?? 0) + stream.work)
      if (key === month) { entry.status = person.status; entry.utilization = person.utilization }
      people.set(person.name, entry)
    }
  }
  return [...people.values()].map(({ streamHours, ...person }) => ({ ...person, streams: [...streamHours].filter(([, work]) => work > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([title]) => title) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// One person's slice of the backlog for the Individual Overview: every Epic, Feature and Story stays (for hierarchy),
// but only Tasks assigned to that person, plus shared-time Tasks (holidays, common activities), which apply by scope.
// Scope of a shared-time Task (a holiday or common activity, see sharedTimeOf); undefined for any other item.
function holidayRegionOf(task: AzureWorkItem, byId: Map<number, AzureWorkItem>, settings: CapacitySettings) {
  const chain: AzureWorkItem[] = []; const seen = new Set<number>([task.id])
  let current = task.parentId == null ? undefined : byId.get(task.parentId)
  while (current && !seen.has(current.id)) { chain.push(current); seen.add(current.id); current = current.parentId == null ? undefined : byId.get(current.parentId) }
  return sharedTimeOf(task, chain, settings)?.scope
}

export function itemsForPerson(source: AzureWorkItem[], person: Me, settings: CapacitySettings = defaultCapacitySettings) {
  const byId = new Map(source.map((item) => [item.id, item]))
  return source.filter((item) => item.workItemType !== 'Task' || isMine(item, person) || holidayRegionOf(item, byId, settings) != null)
}

// The team narrowed to a region and to roles (none chosen = all): the Tasks of people whose profile (Settings →
// Resources) matches, and the public holidays of the chosen region. People without a profile drop out while a filter
// is on.
export interface TeamFilter { region?: Region; roles: ResourceRole[] }
export const teamFiltered = (filter: TeamFilter) => Boolean(filter.region || filter.roles.length)
// Whether a person (by display name) is in the filtered team: their profile matches the region and roles.
export function inTeam(name: string, filter: TeamFilter, settings: CapacitySettings = defaultCapacitySettings) {
  if (!teamFiltered(filter)) return true
  const profile = settings.profiles?.[name]
  return Boolean(profile) && (!filter.region || profile!.region === filter.region) && (!filter.roles.length || (profile!.role != null && filter.roles.includes(profile!.role)))
}
export function itemsForTeam(source: AzureWorkItem[], filter: TeamFilter, settings: CapacitySettings = defaultCapacitySettings) {
  if (!teamFiltered(filter)) return source
  const byId = new Map(source.map((item) => [item.id, item]))
  const matches = (name: string) => inTeam(name, filter, settings)
  return source.filter((item) => {
    if (item.workItemType !== 'Task') return true
    const holiday = holidayRegionOf(item, byId, settings)
    return holiday != null ? holiday === 'everyone' || !filter.region || holiday === filter.region : matches(item.assignedTo)
  })
}

// Settings → Resources (CAP-29…CAP-31): everyone whose region, role and dates can be set — the people with Time Writing
// (their figures), everyone else Assigned To fetched work, the people of the historical hours (leavers included), the
// Azure DevOps team members and people added by name (kept in their profile as listed), and anyone with a profile.
export type ResourceSource = 'time writing' | 'assigned' | 'history' | 'team' | 'added' | 'profile'
export interface ResourceRow extends AzureResource { sources: ResourceSource[] }
export function resourceRows(timeWriting: AzureResource[], assignees: string[], historyPeople: string[], profiles: Record<string, ResourceProfile>): ResourceRow[] {
  const rows = new Map<string, ResourceRow>(timeWriting.map((person) => [person.name, { ...person, sources: ['time writing'] }]))
  const add = (name: string, source: ResourceSource) => {
    const key = name.trim()
    if (!key || key === 'Unassigned') return
    const row = rows.get(key) ?? { name: key, firstMonth: '', lastMonth: '', months: 0, tasks: 0, work: 0, absence: 0, streams: [], status: 'No bookings' as LoadStatus, utilization: null, sources: [] }
    if (!row.sources.includes(source)) row.sources.push(source)
    rows.set(key, row)
  }
  for (const name of assignees) add(name, 'assigned')
  for (const name of historyPeople) add(name, 'history')
  for (const [name, profile] of Object.entries(profiles)) add(name, profile.listed === 'team' ? 'team' : profile.listed === 'added' ? 'added' : 'profile')
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// CAP-35 Old Calculation (Team overview tab): per person for one month, every hour counted against the full capacity.
// Net capacity = working days employed × funded hours per day; planned hours = all planned hours (work, absence,
// holidays, training, NPRA, shared time); available = net capacity − planned (negative when planned above capacity);
// status from the planned utilization in the Settings bands; actual hours = all hours recorded.
export interface OldCalculationRow { name: string; funded: number; netCapacity: number; planned: number; plannedUtilization: number | null; available: number; status: LoadStatus; actual: number; actualUtilization: number | null }
export function oldCalculation(model: CapacityModel): { rows: OldCalculationRow[]; standardHours: number; totals: Omit<OldCalculationRow, 'name' | 'status'> } {
  const round = (value: number) => Math.round(value * 100) / 100
  // CAP-36: Net Capacity = working days employed × funded hours per day − Standard Hours (never below 0).
  const standardHours = standardHoursTotal(model.settings.standardHours)
  const excluded = model.settings.oldCalcExcludedScopes ?? []
  const rows = model.people.filter((person) => person.name !== 'Unassigned').map((person) => {
    const net = Math.max(0, person.funded - standardHours)
    // CAP-37: a disabled group's shared hours leave both Planned and Actual Hours.
    const left = excluded.reduce((sum, scope) => ({ planned: sum.planned + (person.sharedByScope[scope]?.planned ?? 0), actual: sum.actual + (person.sharedByScope[scope]?.actual ?? 0) }), { planned: 0, actual: 0 })
    const planned = Math.max(0, person.allPlanned - left.planned), actual = Math.max(0, person.allActual - left.actual)
    const plannedUtilization = planned > 0 ? percent(planned, net) : null
    return { name: person.name, funded: round(person.funded), netCapacity: round(net), planned: round(planned), plannedUtilization, available: round(net - planned), status: loadStatus(plannedUtilization, model.settings), actual: round(actual), actualUtilization: actual > 0 ? percent(actual, net) : null }
  }).sort((a, b) => a.name.localeCompare(b.name))
  const sum = (key: 'funded' | 'netCapacity' | 'planned' | 'actual') => round(rows.reduce((total, row) => total + row[key], 0))
  const netCapacity = sum('netCapacity'), planned = sum('planned'), actual = sum('actual')
  return { rows, standardHours, totals: { funded: sum('funded'), netCapacity, planned, plannedUtilization: percent(planned, netCapacity), available: round(netCapacity - planned), actual, actualUtilization: percent(actual, netCapacity) } }
}
