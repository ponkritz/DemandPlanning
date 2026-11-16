import { absenceKinds, loadStatus, sharedTimeScopeLabel, sharedTimeScopes, standardHoursTotal, type AbsenceKind, type CapacitySettings, type LoadStatus, type PersonLoad, type SharedTimeScope, type StreamLoad } from './capacity.ts'

// CAP-41…43: calculation profiles. A profile says, for each bucket of hours, whether it counts as utilized, comes off
// the capacity or is ignored; which hours the plan uses; and how the capacity is built. The default profile drives every
// utilization figure in the app. Built-in profiles reproduce today's formula ("Current (v4)") and the Old Calculation.

export type BucketKey = 'work' | 'absence' | 'training' | 'npraOther' | 'common'
export const bucketKeys: BucketKey[] = ['work', 'absence', 'training', 'npraOther', 'common']
export const bucketLabel: Record<BucketKey, string> = { work: 'Project work', absence: 'Absence', training: 'Training', npraOther: 'Other NPRA', common: 'Common activities' }
// CAP-52: the names of the figures (cards, columns, formula), set per calculation profile — built-in profiles included —
// in Settings → Capacity & periods → Calculation profiles; without names of its own a profile uses these.
export type TermKey = 'utilization' | 'funded' | 'absence' | 'npra' | 'available' | 'work'
export const termKeys: TermKey[] = ['utilization', 'funded', 'absence', 'npra', 'available', 'work']
export const defaultTerms: Record<TermKey, string> = { utilization: 'Utilization', funded: 'Funded Hours', absence: 'Absence', npra: 'NPRA Hours', available: 'Available hours', work: 'Project work' }
export const termMeaning: Record<TermKey, string> = { utilization: 'Total actual ÷ available hours', funded: 'Working days × funded hours per day', absence: 'Holiday + PTO (all leave)', npra: 'Tagged NPRA hours (training included)', available: 'Funded hours − absence', work: 'Booked project hours' }
const termText = /^[\p{L}\p{N}][\p{L}\p{N} ()&/+.%-]{0,39}$/u
export type ProfileTerms = Record<string, Partial<Record<TermKey, string>>>
// Read from the shared app data: profile ids checked, names 1–40 characters (letters, digits, spaces and ( ) & / + . % -),
// a name equal to the built-in one is not stored. Undefined when nothing is left.
export function normalizeProfileTerms(value: unknown): ProfileTerms | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const result: ProfileTerms = {}
  for (const [id, raw] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
    if (!/^[a-z0-9-]{1,60}$/.test(id) || !raw || typeof raw !== 'object') continue
    const terms = Object.fromEntries(termKeys.flatMap((key) => { const name = typeof (raw as Record<string, unknown>)[key] === 'string' ? ((raw as Record<string, string>)[key]).trim().replace(/\s+/g, ' ') : ''; return name && termText.test(name) && name !== defaultTerms[key] ? [[key, name]] : [] }))
    if (Object.keys(terms).length) result[id] = terms
  }
  return Object.keys(result).length ? result : undefined
}
export const termsOf = (settings: { profileTerms?: ProfileTerms }, profileId: string): Record<TermKey, string> => ({ ...defaultTerms, ...settings.profileTerms?.[profileId] })
// The one-line formula under each card, in the profile's own capacity base and names.
export function termHints(profile: CalculationProfile, settings: CapacitySettings): Record<'utilization' | 'funded' | 'absence' | 'npra', string> {
  const terms = termsOf(settings, profile.id)
  return {
    utilization: `[Total actual ÷ ${terms.available}]`,
    funded: profile.capacityBase === 'fixed' ? `[${profile.fixedHours ?? 0}h a month, pro rata to the days employed]` : `[Working days × Funded hrs per day (${settings.hoursPerDay}h)]`,
    absence: `[${kindOrder.filter((kind) => absenceKindsOf(profile).includes(kind)).map((kind) => kindShort[kind]).join(' + ') || 'nothing'}]`,
    npra: `[${npraPartsOf(profile).length === 2 ? 'Tagged NPRA hours, training included' : npraPartsOf(profile)[0] === 'npra' ? 'Tagged NPRA hours' : npraPartsOf(profile)[0] === 'training' ? 'Training hours' : 'nothing'}]`,
  }
}
export type Treatment = 'count' | 'deduct' | 'ignore'
export const treatments: Treatment[] = ['count', 'deduct', 'ignore']
export const treatmentLabel: Record<Treatment, string> = { count: 'Count as utilized', deduct: 'Deduct from capacity', ignore: 'Ignore' }
export type PlannedSource = 'estimate' | 'estimateElseCompleted' | 'completed'
export const plannedSources: PlannedSource[] = ['estimate', 'estimateElseCompleted', 'completed']
export const plannedSourceLabel: Record<PlannedSource, string> = { estimate: 'Original Estimate', estimateElseCompleted: 'Original Estimate, else Completed Work', completed: 'Completed Work' }
export type CapacityBase = 'workingDays' | 'fixed'

export interface CalculationProfile {
  id: string; name: string; builtIn?: boolean
  // CAP-53: a built-in profile changed in Settings (its stored version replaces the built-in one until reset).
  edited?: boolean
  treatment: Record<BucketKey, Treatment>
  plannedSource: Record<BucketKey, PlannedSource>
  capacityBase: CapacityBase; fixedHours?: number; minusStandardHours: boolean
  excludedGroups: SharedTimeScope[]; statusFrom: 'actual' | 'planned'
  // CAP-52: the leave kinds in the profile's Absence (the others are ignored, not deducted) and what its NPRA Hours
  // include; undefined = all of them (the figures before v7.1.0).
  absenceKinds?: AbsenceKind[]; npraIncludes?: NpraPart[]
}
export type NpraPart = 'npra' | 'training'
export const npraParts: NpraPart[] = ['npra', 'training']
export const npraPartLabel: Record<NpraPart, string> = { npra: 'NPRA-tagged hours', training: 'Training (tagged Training, or training under the absence Epic)' }
const kindShort: Record<AbsenceKind, string> = { 'Public holiday': 'Holiday', 'PTO': 'PTO', 'Sick Leave': 'Sick', 'Unplanned Leave': 'Unplanned', 'Other absence': 'Other' }
const kindOrder: AbsenceKind[] = ['Public holiday', 'PTO', 'Sick Leave', 'Unplanned Leave', 'Other absence']
export const absenceKindsOf = (profile: Pick<CalculationProfile, 'absenceKinds'>): AbsenceKind[] => profile.absenceKinds ?? [...absenceKinds]
export const npraPartsOf = (profile: Pick<CalculationProfile, 'npraIncludes'>): NpraPart[] => profile.npraIncludes ?? [...npraParts]

// The hours of one bucket for one person: the plan in each source, the recorded hours, the hours that come off the
// capacity when the bucket is deducted (as recorded today: Completed Work; imported and shared holidays and activities:
// Original Estimate when nothing is recorded) and the number of the person's own Tasks in it.
export interface BucketHours { estimate: number; completed: number; estimateElseCompleted: number; deducted: number; tasks: number }
export interface CalcInputs { own: Record<BucketKey, BucketHours>; shared: Partial<Record<SharedTimeScope, Partial<Record<BucketKey, BucketHours>>>>; absenceByKind: Partial<Record<AbsenceKind, BucketHours>> }
export const emptyBucket = (): BucketHours => ({ estimate: 0, completed: 0, estimateElseCompleted: 0, deducted: 0, tasks: 0 })
export const emptyCalcInputs = (): CalcInputs => ({ own: { work: emptyBucket(), absence: emptyBucket(), training: emptyBucket(), npraOther: emptyBucket(), common: emptyBucket() }, shared: {}, absenceByKind: {} })
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
// CAP-53: a stored profile with a built-in id is the edited version of that built-in profile; it keeps the built-in's
// place and id (so the default and the Old Calculation tab still find it) and is marked edited.
const builtInIds = new Set([currentProfileId, oldProfileId])
export const allProfiles = (settings: CapacitySettings): CalculationProfile[] => {
  const stored = settings.calculationProfiles ?? []
  return [...builtInProfiles(settings).map((profile) => { const edited = stored.find((entry) => entry.id === profile.id); return edited ? { ...edited, builtIn: true, edited: true } : profile }), ...stored.filter((entry) => !builtInIds.has(entry.id))]
}
export function defaultProfile(settings: CapacitySettings): CalculationProfile {
  const profiles = allProfiles(settings)
  return profiles.find((profile) => profile.id === settings.defaultProfileId) ?? profiles[0]
}

// CAP-44: the settings a page computes with when an Admin views it with another profile: that profile as the
// default, else the shared settings unchanged. Nothing is saved.
export const withViewedProfile = (settings: CapacitySettings, id: string): CapacitySettings => id && allProfiles(settings).some((profile) => profile.id === id) ? { ...settings, defaultProfileId: id } : settings

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => allowed.includes(value as T) ? value as T : fallback
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
// The leave kinds and NPRA parts of a profile read from the shared app data: known values only, stored only when not
// every one is chosen.
function kindsAndParts(entry: Record<string, unknown>): Pick<CalculationProfile, 'absenceKinds' | 'npraIncludes'> {
  const kinds = Array.isArray(entry.absenceKinds) ? absenceKinds.filter((kind) => (entry.absenceKinds as unknown[]).includes(kind)) : [...absenceKinds]
  const parts = Array.isArray(entry.npraIncludes) ? npraParts.filter((part) => (entry.npraIncludes as unknown[]).includes(part)) : [...npraParts]
  return { ...(kinds.length < absenceKinds.length ? { absenceKinds: kinds } : {}), ...(parts.length < npraParts.length ? { npraIncludes: parts } : {}) }
}
// Custom profiles read from the shared app data: at most 20, ids unique and not a built-in's, every field checked; at
// least one bucket must count, else the profile is dropped.
export function normalizeCalculationProfiles(value: unknown): CalculationProfile[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
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
    return [{ id, name: text(entry.name, 80) || 'Profile', treatment, plannedSource, capacityBase, ...(capacityBase === 'fixed' ? { fixedHours: fixed } : {}), minusStandardHours: entry.minusStandardHours === true, excludedGroups: sharedTimeScopes.filter((scope) => groups.includes(scope)), statusFrom: pick(entry.statusFrom, ['actual', 'planned'] as const, 'actual') , ...kindsAndParts(entry) }]
  })
}

const round = (value: number) => Math.round(value * 100) / 100
const percent = (numerator: number, denominator: number) => denominator > 0 ? Math.round(numerator / denominator * 10000) / 100 : null

// The figures of one person under a profile. Capacity = base (working days employed × hours per day, or the fixed
// hours pro rata to the days employed) − Standard Hours (when the profile says so) − the deducted buckets, never below
// 0. Utilized = the counted buckets' recorded hours (Completed Work); planned = their plan in the profile's source.
// A group left out (All, All-<Region>) leaves every bucket. Utilization is blank when nothing counted is booked.
export function applyProfile(person: Pick<PersonLoad, 'funded' | 'employedDays'> & Partial<Pick<PersonLoad, 'absenceByKind' | 'training' | 'npraOther'>>, calc: CalcInputs, profile: CalculationProfile, settings: CapacitySettings, workingDays: number) {
  // CAP-52: only the profile's leave kinds make up its absence; shared holidays are the Public holiday kind.
  const kinds = absenceKindsOf(profile), allKinds = kinds.length === absenceKinds.length
  const totalOf = (key: BucketKey): BucketHours => {
    let sum = { ...calc.own[key] }
    if (key === 'absence' && !allKinds) { sum = emptyBucket(); for (const kind of kinds) { const part = calc.absenceByKind[kind]; if (part) addHours(sum, part) } }
    for (const scope of sharedTimeScopes) { const part = calc.shared[scope]?.[key]; if (part && !profile.excludedGroups.includes(scope) && (key !== 'absence' || kinds.includes('Public holiday'))) addHours(sum, part) }
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
  // The profile's Absence and NPRA Hours figures (CAP-52).
  const figures = { ...(person.absenceByKind ? { absence: round(kinds.reduce((sum, kind) => sum + (person.absenceByKind![kind] ?? 0), 0)) } : {}), ...(person.training != null && person.npraOther != null ? { npra: round((npraPartsOf(profile).includes('training') ? person.training : 0) + (npraPartsOf(profile).includes('npra') ? person.npraOther : 0)) } : {}) }
  return { ...figures, available, utilized, utilizedPlanned, utilization, plannedUtilization, status, npraDeducted: (profile.treatment.training === 'deduct' ? parts.training.deducted : 0) + (profile.treatment.npraOther === 'deduct' ? parts.npraOther.deducted : 0) }
}

// CAP-54: the utilization formula as Top ÷ Bottom, in the profile's names: Top = the counted figures (Total actual),
// Bottom = Funded Hours − the deducted figures (and Standard Hours when the profile takes them off).
export function formulaParts(profile: CalculationProfile, settings: CapacitySettings) {
  const terms = termsOf(settings, profile.id)
  const name = (key: BucketKey) => key === 'work' ? terms.work : key === 'absence' ? terms.absence : bucketLabel[key]
  const top = bucketKeys.filter((key) => profile.treatment[key] === 'count').map(name)
  const bottom = [...bucketKeys.filter((key) => profile.treatment[key] === 'deduct').map(name), ...(profile.minusStandardHours ? ['Standard Hours'] : [])]
  return { utilization: terms.utilization, top, base: terms.funded, bottom }
}
export function formulaSentence(profile: CalculationProfile, settings: CapacitySettings) {
  const { utilization, top, base, bottom } = formulaParts(profile, settings)
  return `${utilization} = (${top.join(' + ') || 'nothing'}) ÷ (${[base, ...bottom].join(' − ')}) × 100`
}

// The formula of a profile in words, shown with every figure it produces.
export function profileFormula(profile: CalculationProfile, settings: CapacitySettings) {
  const terms = termsOf(settings, profile.id)
  const name = (key: BucketKey) => key === 'work' ? terms.work : key === 'absence' ? terms.absence : bucketLabel[key]
  const labels = (treatment: Treatment) => bucketKeys.filter((key) => profile.treatment[key] === treatment).map(name)
  const base = profile.capacityBase === 'fixed' ? `${terms.funded} (${profile.fixedHours ?? 0}h a month, pro rata to the days employed)` : `${terms.funded} (working days employed × Funded hours per day, ${settings.hoursPerDay}h)`
  const available = [base, ...(profile.minusStandardHours ? [`Standard Hours (${standardHoursTotal(settings.standardHours)}h)`] : []), ...labels('deduct').map((label) => /hours$/i.test(label) ? label : `${label} hours`)].join(' − ')
  const sources = bucketKeys.filter((key) => profile.treatment[key] === 'count' && profile.plannedSource[key] !== 'estimate').map((key) => `${name(key)}: ${plannedSourceLabel[profile.plannedSource[key]]}`)
  const ignored = labels('ignore'), groups = profile.excludedGroups.map(sharedTimeScopeLabel)
  const kinds = absenceKindsOf(profile), parts = npraPartsOf(profile)
  const definitions = `${kinds.length < absenceKinds.length ? ` ${terms.absence} = ${kindOrder.filter((kind) => kinds.includes(kind)).join(' + ') || 'nothing'} (other leave ignored).` : ''}${parts.length < npraParts.length ? ` ${terms.npra} = ${parts.map((part) => part === 'npra' ? 'NPRA-tagged hours' : 'Training').join(' + ') || 'nothing'}.` : ''}`
  return `Profile “${profile.name}”: Actual utilization = Total actual ÷ ${terms.available}; Planned utilization = Total planned ÷ ${terms.available}. Total actual = ${labels('count').join(' + ')} (Completed Work); Total planned = the same from Original Estimate${sources.length ? ` (${sources.join('; ')})` : ''}. ${terms.available} = ${available} (never below 0 per person).${ignored.length ? ` Ignored: ${ignored.join(', ')}.` : ''}${groups.length ? ` Groups left out: ${groups.join(', ')}.` : ''} Status from the ${profile.statusFrom === 'planned' ? 'planned' : 'actual'} utilization.${definitions}`
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
