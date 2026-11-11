import { loadStatus, sharedTimeScopeLabel, sharedTimeScopes, standardHoursTotal, type AbsenceKind, type CapacitySettings, type LoadStatus, type PersonLoad, type SharedTimeScope, type StreamLoad } from './capacity.ts'

// CAP-41…43: calculation profiles. A profile says, for each bucket of hours, whether it counts as utilized, comes off
// the capacity or is ignored; which hours the plan uses; and how the capacity is built. The default profile drives every
// utilization figure in the app. Built-in profiles reproduce today's formula ("Current (v4)") and the Old Calculation.

export type BucketKey = 'work' | 'absence' | 'training' | 'npraOther' | 'common'
export const bucketKeys: BucketKey[] = ['work', 'absence', 'training', 'npraOther', 'common']
export const bucketLabel: Record<BucketKey, string> = { work: 'Project work', absence: 'Absence', training: 'Training', npraOther: 'Other NPRA', common: 'Common activities' }
export type Treatment = 'count' | 'deduct' | 'ignore'
export const treatments: Treatment[] = ['count', 'deduct', 'ignore']
export const treatmentLabel: Record<Treatment, string> = { count: 'Count as utilized', deduct: 'Deduct from capacity', ignore: 'Ignore' }
export type PlannedSource = 'estimate' | 'estimateElseCompleted' | 'completed'
export const plannedSources: PlannedSource[] = ['estimate', 'estimateElseCompleted', 'completed']
export const plannedSourceLabel: Record<PlannedSource, string> = { estimate: 'Original Estimate', estimateElseCompleted: 'Original Estimate, else Completed Work', completed: 'Completed Work' }
export type CapacityBase = 'workingDays' | 'fixed'

export interface CalculationProfile {
  id: string; name: string; builtIn?: boolean
  treatment: Record<BucketKey, Treatment>
  plannedSource: Record<BucketKey, PlannedSource>
  capacityBase: CapacityBase; fixedHours?: number; minusStandardHours: boolean
  excludedGroups: SharedTimeScope[]; statusFrom: 'actual' | 'planned'
}

// The hours of one bucket for one person: the plan in each source, the recorded hours, the hours that come off the
// capacity when the bucket is deducted (as recorded today: Completed Work; imported and shared holidays and activities:
// Original Estimate when nothing is recorded) and the number of the person's own Tasks in it.
export interface BucketHours { estimate: number; completed: number; estimateElseCompleted: number; deducted: number; tasks: number }
export interface CalcInputs { own: Record<BucketKey, BucketHours>; shared: Partial<Record<SharedTimeScope, Partial<Record<BucketKey, BucketHours>>>> }
export const emptyBucket = (): BucketHours => ({ estimate: 0, completed: 0, estimateElseCompleted: 0, deducted: 0, tasks: 0 })
export const emptyCalcInputs = (): CalcInputs => ({ own: { work: emptyBucket(), absence: emptyBucket(), training: emptyBucket(), npraOther: emptyBucket(), common: emptyBucket() }, shared: {} })
export function addHours(target: BucketHours, add: Partial<BucketHours>) { for (const key of Object.keys(add) as (keyof BucketHours)[]) target[key] += add[key] ?? 0 }

export const currentProfileId = 'current-v4', oldProfileId = 'old-calculation'
const all = <T,>(value: T): Record<BucketKey, T> => ({ work: value, absence: value, training: value, npraOther: value, common: value })
export function builtInProfiles(settings: Pick<CapacitySettings, 'oldCalcExcludedScopes'>): CalculationProfile[] {
  return [
    { id: currentProfileId, name: 'Current (v4)', builtIn: true, treatment: { ...all<Treatment>('count'), absence: 'deduct' }, plannedSource: all<PlannedSource>('estimate'), capacityBase: 'workingDays', minusStandardHours: false, excludedGroups: [], statusFrom: 'actual' },
    // The Old Calculation tab's groups (CAP-37) apply to this profile too.
    { id: oldProfileId, name: 'Old Calculation', builtIn: true, treatment: all<Treatment>('count'), plannedSource: { ...all<PlannedSource>('estimate'), absence: 'estimateElseCompleted' }, capacityBase: 'workingDays', minusStandardHours: true, excludedGroups: [...(settings.oldCalcExcludedScopes ?? [])], statusFrom: 'planned' },
  ]
}
export const allProfiles = (settings: CapacitySettings) => [...builtInProfiles(settings), ...(settings.calculationProfiles ?? [])]
export function defaultProfile(settings: CapacitySettings): CalculationProfile {
  const profiles = allProfiles(settings)
  return profiles.find((profile) => profile.id === settings.defaultProfileId) ?? profiles[0]
}

// CAP-44: the settings a page computes with when an Admin views it with another profile: that profile as the
// default, else the shared settings unchanged. Nothing is saved.
export const withViewedProfile = (settings: CapacitySettings, id: string): CapacitySettings => id && allProfiles(settings).some((profile) => profile.id === id) ? { ...settings, defaultProfileId: id } : settings

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
// Custom profiles read from the shared app data: at most 20, ids unique and not a built-in's, every field checked; at
// least one bucket must count, else the profile is dropped.
export function normalizeCalculationProfiles(value: unknown): CalculationProfile[] {
  if (!Array.isArray(value)) return []
  const seen = new Set([currentProfileId, oldProfileId])
  return value.slice(0, 20).flatMap((raw) => {
    const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const id = text(entry.id, 60)
    if (!/^[a-z0-9-]{1,60}$/.test(id) || seen.has(id)) return []
    const treatmentIn = (entry.treatment && typeof entry.treatment === 'object' ? entry.treatment : {}) as Record<string, unknown>
    const sourceIn = (entry.plannedSource && typeof entry.plannedSource === 'object' ? entry.plannedSource : {}) as Record<string, unknown>
    const treatment = Object.fromEntries(bucketKeys.map((key) => [key, pick(treatmentIn[key], treatments, 'ignore')])) as Record<BucketKey, Treatment>
    if (!bucketKeys.some((key) => treatment[key] === 'count')) return []
    const plannedSource = Object.fromEntries(bucketKeys.map((key) => [key, pick(sourceIn[key], plannedSources, 'estimate')])) as Record<BucketKey, PlannedSource>
    const capacityBase = pick(entry.capacityBase, ['workingDays', 'fixed'] as const, 'workingDays')
    const fixed = Number(entry.fixedHours)
    if (capacityBase === 'fixed' && !(Number.isFinite(fixed) && fixed > 0 && fixed <= 744)) return []
    const groups = Array.isArray(entry.excludedGroups) ? entry.excludedGroups : []
    seen.add(id)
    return [{ id, name: text(entry.name, 80) || 'Profile', treatment, plannedSource, capacityBase, ...(capacityBase === 'fixed' ? { fixedHours: fixed } : {}), minusStandardHours: entry.minusStandardHours === true, excludedGroups: sharedTimeScopes.filter((scope) => groups.includes(scope)), statusFrom: pick(entry.statusFrom, ['actual', 'planned'] as const, 'actual') }]
  })
}

const round = (value: number) => Math.round(value * 100) / 100
const percent = (numerator: number, denominator: number) => denominator > 0 ? Math.round(numerator / denominator * 10000) / 100 : null

// The figures of one person under a profile. Capacity = base (working days employed × hours per day, or the fixed
// hours pro rata to the days employed) − Standard Hours (when the profile says so) − the deducted buckets, never below
// 0. Utilized = the counted buckets' recorded hours (Completed Work); planned = their plan in the profile's source.
// A group left out (All, All-<Region>) leaves every bucket. Utilization is blank when nothing counted is booked.
export function applyProfile(person: Pick<PersonLoad, 'funded' | 'employedDays'>, calc: CalcInputs, profile: CalculationProfile, settings: CapacitySettings, workingDays: number) {
  const totalOf = (key: BucketKey): BucketHours => {
    const sum = { ...calc.own[key] }
    for (const scope of sharedTimeScopes) { const part = calc.shared[scope]?.[key]; if (part && !profile.excludedGroups.includes(scope)) addHours(sum, part) }
    return sum
  }
  const base = profile.capacityBase === 'fixed' && profile.fixedHours ? round(profile.fixedHours * (workingDays > 0 ? person.employedDays / workingDays : 0)) : person.funded
  let deducted = 0, utilized = 0, utilizedPlanned = 0, booked = false
  const parts = {} as Record<BucketKey, BucketHours>
  for (const key of bucketKeys) {
    const hours = parts[key] = totalOf(key)
    if (profile.treatment[key] === 'deduct') deducted += hours.deducted
    if (profile.treatment[key] === 'count') {
      utilized += hours.completed; utilizedPlanned += hours[profile.plannedSource[key]]
      if (hours.tasks > 0 || hours.estimate > 0 || hours.completed > 0) booked = true
    }
  }
  const available = Math.max(0, base - (profile.minusStandardHours ? standardHoursTotal(settings.standardHours) : 0) - deducted)
  const utilization = booked ? percent(utilized, available) : null, plannedUtilization = booked ? percent(utilizedPlanned, available) : null
  const status: LoadStatus = loadStatus(profile.statusFrom === 'planned' ? plannedUtilization : utilization, settings)
  return { available, utilized, utilizedPlanned, utilization, plannedUtilization, status, npraDeducted: (profile.treatment.training === 'deduct' ? parts.training.deducted : 0) + (profile.treatment.npraOther === 'deduct' ? parts.npraOther.deducted : 0) }
}

// The formula of a profile in words, shown with every figure it produces.
export function profileFormula(profile: CalculationProfile, settings: CapacitySettings) {
  const labels = (treatment: Treatment) => bucketKeys.filter((key) => profile.treatment[key] === treatment).map((key) => bucketLabel[key])
  const base = profile.capacityBase === 'fixed' ? `Contractual hours (${profile.fixedHours ?? 0}h a month, pro rata to the days employed)` : `Contractual hours (working days employed × Working hours per day, ${settings.hoursPerDay}h)`
  const available = [base, ...(profile.minusStandardHours ? [`Standard Hours (${standardHoursTotal(settings.standardHours)}h)`] : []), ...labels('deduct').map((label) => `${label} hours`)].join(' − ')
  const sources = bucketKeys.filter((key) => profile.treatment[key] === 'count' && profile.plannedSource[key] !== 'estimate').map((key) => `${bucketLabel[key]}: ${plannedSourceLabel[profile.plannedSource[key]]}`)
  const ignored = labels('ignore'), groups = profile.excludedGroups.map(sharedTimeScopeLabel)
  return `Profile “${profile.name}”: Actual utilization = Total actual ÷ Available hours; Planned utilization = Total planned ÷ Available hours. Total actual = ${labels('count').join(' + ')} (Completed Work); Total planned = the same from Original Estimate${sources.length ? ` (${sources.join('; ')})` : ''}. Available hours = ${available} (never below 0 per person).${ignored.length ? ` Ignored: ${ignored.join(', ')}.` : ''}${groups.length ? ` Groups left out: ${groups.join(', ')}.` : ''} Status from the ${profile.statusFrom === 'planned' ? 'planned' : 'actual'} utilization.`
}

// CAP-43 Lock figures: the person figures of a month as presented, kept in the shared app data so that later changes
// (to the profile, the settings or the Azure DevOps data) leave them as they were. Unlocking keeps the entry as history.
export type LockedPerson = Omit<PersonLoad, 'streams'> & { streams: Omit<StreamLoad, 'epic'>[] }
export interface FigureLock { lockedOn: string; lockedBy: string; profileName: string; formula: string; people: LockedPerson[]; unlockedOn?: string; unlockedBy?: string; unlockReason?: string }
export const activeFigureLock = (settings: Pick<CapacitySettings, 'figureLocks'>, month: string) => { const last = settings.figureLocks?.[month]?.at(-1); return last && !last.unlockedOn ? last : undefined }
export function lockedPeople(people: PersonLoad[]): LockedPerson[] {
  return people.map(({ streams, ...person }) => ({ ...person, absenceByKind: { ...person.absenceByKind }, sharedByScope: JSON.parse(JSON.stringify(person.sharedByScope)), streams: streams.map(({ epic: _epic, ...stream }) => stream) }))
}

const numberKeys = ['employedDays', 'funded', 'absence', 'reserved', 'available', 'npra', 'npraPlanned', 'npraTasks', 'npraAllowance', 'npraOver', 'npraDeducted', 'training', 'trainingPlanned', 'npraOther', 'npraOtherPlanned', 'reservedPlanned', 'reservedActual', 'utilized', 'utilizedPlanned', 'work', 'planned', 'tasks', 'allPlanned', 'allActual'] as const
const statuses: LoadStatus[] = ['Overloaded', 'Balanced', 'Has capacity', 'No bookings']
const kinds: AbsenceKind[] = ['PTO', 'Sick Leave', 'Unplanned Leave', 'Public holiday', 'Other absence']
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0 }
const nullableNum = (value: unknown) => value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null
function normalizeLockedPerson(raw: unknown): LockedPerson | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const name = text(entry.name, 200)
  if (!name) return null
  const kindsIn = (entry.absenceByKind && typeof entry.absenceByKind === 'object' ? entry.absenceByKind : {}) as Record<string, unknown>
  const scopesIn = (entry.sharedByScope && typeof entry.sharedByScope === 'object' ? entry.sharedByScope : {}) as Record<string, { planned?: unknown; actual?: unknown } | undefined>
  const streams = (Array.isArray(entry.streams) ? entry.streams : []).slice(0, 100).flatMap((stream: unknown) => { const s = (stream && typeof stream === 'object' ? stream : {}) as Record<string, unknown>; const key = text(s.key, 200); return key ? [{ key, title: text(s.title, 300), work: num(s.work), planned: num(s.planned), tasks: num(s.tasks) }] : [] })
  return {
    name, ...Object.fromEntries(numberKeys.map((key) => [key, num(entry[key])])) as Record<typeof numberKeys[number], number>,
    utilization: nullableNum(entry.utilization), plannedUtilization: nullableNum(entry.plannedUtilization), status: pick(entry.status, statuses, 'No bookings'),
    absenceByKind: Object.fromEntries(kinds.map((kind) => [kind, num(kindsIn[kind])])) as Record<AbsenceKind, number>,
    sharedByScope: Object.fromEntries(sharedTimeScopes.flatMap((scope) => scopesIn[scope] && typeof scopesIn[scope] === 'object' ? [[scope, { planned: num(scopesIn[scope]!.planned), actual: num(scopesIn[scope]!.actual) }]] : [])),
    streams,
  }
}
// Locks read from the shared app data: valid months only, at most 5 entries per month (the latest last), 500 people each.
export function normalizeFigureLocks(value: unknown): Record<string, FigureLock[]> {
  const result: Record<string, FigureLock[]> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  for (const [month, list] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Array.isArray(list)) continue
    const locks = list.slice(-5).flatMap((raw: unknown) => {
      const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      const lockedOn = text(entry.lockedOn, 40)
      if (!lockedOn || !Array.isArray(entry.people)) return []
      const unlockedOn = text(entry.unlockedOn, 40)
      return [{ lockedOn, lockedBy: text(entry.lockedBy, 200), profileName: text(entry.profileName, 80), formula: text(entry.formula, 2000), people: entry.people.slice(0, 500).map(normalizeLockedPerson).filter((person): person is LockedPerson => person != null), ...(unlockedOn ? { unlockedOn, unlockedBy: text(entry.unlockedBy, 200), unlockReason: text(entry.unlockReason, 500) } : {}) }]
    })
    if (locks.length) result[month] = locks
  }
  return result
}
