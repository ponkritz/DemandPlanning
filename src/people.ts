import { normalizeProfiles, type Region, type ResourceProfile, type ResourceRole } from './capacity.ts'
import { normalEmail, roles as accessRoles, withMemberRoles, type AccessPolicy, type Role } from './access.ts'

// Admin → People & roles → People (CAP-58…CAP-62): the read-only list of people, its Status and filters, and the
// changes the drawer and the bulk edit make — profiles (planning data) and app access roles (access.json) — worked out
// here so that every save is one change of each file.

// CAP-58: where a person stands. Not part of the team (removed, CAP-33) first, then Not in Azure DevOps (settings kept
// for someone neither in the team nor Assigned To), then Left (a Left on date), else Active.
export type PersonStatus = 'active' | 'left' | 'not-team' | 'not-in-azure'
export const statusOptions: [PersonStatus, string][] = [['active', 'Active'], ['left', 'Left'], ['not-team', 'Not part of the team'], ['not-in-azure', 'Not in Azure DevOps']]
// The Status filter starts on the people who are or were in the team; the others are one click away.
export const defaultStatusFilter: PersonStatus[] = ['active', 'left']

// A person with a Left on date still to come (or today, their last day) is Active until then (product owner, 24 Nov 2026).
export function personStatus(profile: ResourceProfile | undefined, inAzure: boolean, today = ''): PersonStatus {
  if (profile?.removed) return 'not-team'
  if (!inAzure) return 'not-in-azure'
  if (profile?.leftOn && !(today && profile.leftOn >= today)) return 'left'
  return 'active'
}

// The Status column: "Active since {Time tracking started}" (the person's own date, else the default one, CAP-15),
// "Active" without a date, "… · leaves on {date}" while the Left on date is still to come, "Left on {date}", "Not part of the
// team", "Not in Azure DevOps".
export function statusText(status: PersonStatus, profile: ResourceProfile | undefined, defaultJoinedOn: string | undefined, today: string, format: (day: string) => string): string {
  if (status === 'not-team') return 'Not part of the team'
  if (status === 'not-in-azure') return 'Not in Azure DevOps'
  if (status === 'left' && profile?.leftOn) return `Left on ${format(profile.leftOn)}`
  const since = profile?.joinedOn ?? defaultJoinedOn
  const active = since ? `Active since ${format(since)}` : 'Active'
  return profile?.leftOn && profile.leftOn >= today ? `${active} · leaves on ${format(profile.leftOn)}` : active
}

export interface PersonEntry {
  name: string
  email?: string
  // The email is one saved in the profile before v7.0.0, not one Azure DevOps gives (CAP-51).
  emailSaved?: boolean
  roles: Role[]
  profile: ResourceProfile
  status: PersonStatus
  // The small line under the name: the months of Time Writing, or where the person comes from.
  note?: string
}

// '' in a filter's value means "Not set" (Region, Role) or "Default role" (Access role).
export interface PeopleFilters { regions: string[]; roles: string[]; access: string[]; status: string[]; text: string }
export const emptyFilters: PeopleFilters = { regions: [], roles: [], access: [], status: [...defaultStatusFilter], text: '' }
// UI-23: People filters remembered per person (personal views, key "people-filters") and as a view for everyone: only
// known shapes are kept (lists of text, the search at most 200 characters).
export const peopleFiltersKey = 'people-filters'
export function readPeopleFilters(raw: unknown): PeopleFilters | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const value = raw as Record<string, unknown>
  const texts = (entry: unknown, fallback: string[]) => Array.isArray(entry) ? [...new Set(entry.filter((item): item is string => typeof item === 'string' && item.length <= 100))].slice(0, 50) : fallback
  return { regions: texts(value.regions, []), roles: texts(value.roles, []), access: texts(value.access, []), status: texts(value.status, [...emptyFilters.status]), text: typeof value.text === 'string' ? value.text.slice(0, 200) : '' }
}
export const filtersChanged = (filters: PeopleFilters) => Boolean(filters.regions.length || filters.roles.length || filters.access.length || filters.text.trim() || filters.status.length !== defaultStatusFilter.length || filters.status.some((value) => !defaultStatusFilter.includes(value as PersonStatus)))

// Nothing ticked in a filter = all; the text matches the name or the email (every word).
export function filterPeople(entries: PersonEntry[], filters: PeopleFilters): PersonEntry[] {
  const words = filters.text.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const pick = (chosen: string[], value: string) => !chosen.length || chosen.includes(value)
  return entries.filter((entry) => pick(filters.status, entry.status)
    && pick(filters.regions, entry.profile.region ?? '')
    && pick(filters.roles, entry.profile.role ?? '')
    && (!filters.access.length || (entry.roles.length ? entry.roles.some((role) => filters.access.includes(role)) : filters.access.includes('')))
    && words.every((word) => `${entry.name} ${entry.email ?? ''}`.toLowerCase().includes(word)))
}

// What a person is still missing ("Mapping incomplete", CAP-49).
export function missingOf(entry: PersonEntry): string[] {
  const profile = entry.profile
  return [!entry.email && 'email in Azure DevOps', !profile.region && 'region', !profile.role && 'role', !profile.reportsTo && 'reports to', !entry.roles.length && 'app access role'].filter(Boolean) as string[]
}

// The fields of a person the drawer edits; joinedOn / leftOn '' = none.
export interface PersonForm { region: Region | ''; role: ResourceRole | ''; peopleManager: boolean; reportsTo: string; joinedOn: string; leftOn: string; roles: Role[] }
export const formOf = (entry: PersonEntry): PersonForm => ({ region: entry.profile.region ?? '', role: entry.profile.role ?? '', peopleManager: Boolean(entry.profile.peopleManager), reportsTo: entry.profile.reportsTo ?? '', joinedOn: entry.profile.joinedOn ?? '', leftOn: entry.profile.leftOn ?? '', roles: entry.roles })

// CAP-59: the profile fields the form changes (undefined clears one), and whether the app access roles changed.
export function profilePatch(entry: PersonEntry, form: PersonForm): Partial<ResourceProfile> {
  const before = formOf(entry), patch: Partial<ResourceProfile> = {}
  if (form.region !== before.region) patch.region = form.region || undefined
  if (form.role !== before.role) patch.role = form.role || undefined
  if (form.peopleManager !== before.peopleManager) patch.peopleManager = form.peopleManager || undefined
  const reportsTo = form.reportsTo.trim()
  if (reportsTo !== before.reportsTo && reportsTo !== entry.name) patch.reportsTo = reportsTo || undefined
  if (form.joinedOn !== before.joinedOn) patch.joinedOn = form.joinedOn || undefined
  if (form.leftOn !== before.leftOn) patch.leftOn = form.leftOn || undefined
  return patch
}
export const sameRoles = (a: readonly Role[], b: readonly Role[]) => a.length === b.length && a.every((role) => b.includes(role))
// A Left on before the Time tracking started is refused (the stored profile would drop it, CAP-14).
export const formError = (form: PersonForm) => form.joinedOn && form.leftOn && form.leftOn < form.joinedOn ? 'Left on cannot be before Time tracking started.' : ''

// The profiles after one change for several people (the drawer: one person; the bulk edit: everyone selected), merged
// into what is there: only the fields given change, undefined clears a field.
export function patchProfiles(profiles: Record<string, ResourceProfile>, names: readonly string[], patch: Partial<ResourceProfile>): Record<string, ResourceProfile> {
  const current = normalizeProfiles(profiles)
  const next: Record<string, unknown> = { ...current }
  for (const name of names) {
    const merged: Record<string, unknown> = { ...current[name], ...patch }
    for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
    next[name] = merged
  }
  return normalizeProfiles(next)
}

export const patchText = (patch: Partial<ResourceProfile>) => Object.entries(patch).map(([key, value]) => `${key} = ${value === undefined || value === '' ? 'cleared' : String(value)}`).join(', ')

// CAP-60: the app access roles of several people set in one policy — each person with an email gets exactly the roles
// chosen (none: no role of their own, so the default role); people without an email are skipped and named.
export function setRolesFor(policy: AccessPolicy, people: { name: string; email?: string }[], chosen: readonly Role[]): { policy: AccessPolicy; changed: string[]; skipped: string[] } {
  let next = policy
  const changed: string[] = [], skipped: string[] = []
  const ordered = accessRoles.filter((role) => chosen.includes(role))
  for (const person of people) {
    if (!person.email) { skipped.push(person.name); continue }
    const had = policy.members[normalEmail(person.email)] ?? []
    if (sameRoles(had, ordered)) continue
    next = withMemberRoles(next, person.email, ordered)
    changed.push(person.name)
  }
  return { policy: next, changed, skipped }
}
