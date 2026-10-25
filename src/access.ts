// Role-based access: which menu areas each role sees and which actions it may take, and which roles each person
// (by the email of their Azure DevOps PAT) has. The policy is access.json in the Git data repository, next to the
// planning data, so only people who can write to that repository can change it. Without the file, everyone has every
// right (the app works as before). This decides what the app shows; Azure DevOps and GitHub still decide what each
// person's own tokens can read and change.
export const roles = ['Admin', 'Product Owner', 'People Manager', 'Scrum Master', 'Team Member'] as const
export type Role = typeof roles[number]

export const areas = [
  { key: 'overview', label: 'Data Insights (Dashboard, Pulse Check, PI Review)' },
  { key: 'mywork', label: 'Assigned to Me' },
  { key: 'bulk', label: 'Bulk actions' },
  { key: 'monthly', label: 'Monthly Time Writing' },
  { key: 'board', label: 'I&D Board backlogs' },
  { key: 'health', label: 'Backlog Health' },
  { key: 'release', label: 'Release Details (on-prem views, Windchill exports)' },
  { key: 'baselines', label: 'Baselines' },
  { key: 'qemapping', label: 'QE Mapping' },
  { key: 'snapshots', label: 'Snapshots' },
  { key: 'docs', label: 'Documentation' },
] as const
export type Area = typeof areas[number]['key']

export const actions = [
  { key: 'azure.write', label: 'Change work items in Azure DevOps (My Work, Bulk actions, Monthly, new Features)' },
  { key: 'azure.createForOthers', label: 'Create work items for other people (choose who they are assigned to)' },
  { key: 'baselines.edit', label: 'Edit baselines (rules and release scope)' },
  { key: 'windchill.import', label: 'Import Windchill exports' },
  { key: 'settings.manage', label: 'Manage shared settings (capacity, resources, master data, shared connection setup)' },
  { key: 'access.manage', label: 'Manage access (roles and members)' },
] as const
export type Action = typeof actions[number]['key']

export interface RoleRights { areas: Area[]; actions: Action[] }
export interface AccessPolicy { schema: 1; defaultRole: Role | null; roles: Record<Role, RoleRights>; members: Record<string, Role[]> }
export interface Rights { areas: Set<Area>; actions: Set<Action>; roles: Role[]; restricted: boolean }

const allAreas = areas.map((entry) => entry.key) as Area[]
const allActions = actions.map((entry) => entry.key) as Action[]
const myWork: Area[] = ['mywork', 'bulk', 'monthly']

export const accessFile = 'access.json'
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
export const normalEmail = (value: string) => value.trim().toLowerCase()

// The starting matrix (editable in Settings → Access): Backlog Health only for Scrum Masters, Product Owners and Admins.
export function defaultPolicy(adminEmail = ''): AccessPolicy {
  return {
    schema: 1,
    defaultRole: 'Team Member',
    roles: {
      'Admin': { areas: [...allAreas], actions: [...allActions] },
      'Product Owner': { areas: ['overview', 'board', 'health', 'release', 'baselines', 'qemapping', 'docs'], actions: ['azure.write', 'azure.createForOthers', 'baselines.edit'] },
      'People Manager': { areas: ['overview', ...myWork, 'board', 'release', 'baselines', 'qemapping', 'snapshots', 'docs'], actions: ['azure.write', 'azure.createForOthers', 'baselines.edit'] },
      'Scrum Master': { areas: ['overview', ...myWork, 'board', 'health', 'release', 'docs'], actions: ['azure.write', 'azure.createForOthers'] },
      'Team Member': { areas: ['overview', ...myWork, 'board', 'release', 'docs'], actions: ['azure.write'] },
    },
    members: isEmail(adminEmail) ? { [normalEmail(adminEmail)]: ['Admin'] } : {},
  }
}

const pick = <T extends string>(value: unknown, allowed: readonly T[]) => Array.isArray(value) ? allowed.filter((entry) => value.includes(entry)) : []

// Reads access.json: unknown roles, areas, actions and invalid emails are dropped; a role missing from the file has no
// rights. Throws on anything that is not an access policy, so a broken file is reported rather than ignored.
export function parseAccess(text: string): AccessPolicy {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error(`${accessFile} is not valid JSON.`) }
  const input = raw as Partial<Record<keyof AccessPolicy, unknown>> | null
  if (!input || typeof input !== 'object' || input.schema !== 1 || !input.roles || typeof input.roles !== 'object' || !input.members || typeof input.members !== 'object') throw new Error(`${accessFile} is not an access file (schema 1 with roles and members).`)
  const rolesIn = input.roles as Record<string, Partial<Record<keyof RoleRights, unknown>> | undefined>
  const members: Record<string, Role[]> = {}
  for (const [email, value] of Object.entries(input.members as Record<string, unknown>)) {
    const assigned = pick(value, roles)
    if (isEmail(email) && assigned.length) members[normalEmail(email)] = [...new Set([...(members[normalEmail(email)] ?? []), ...assigned])]
  }
  return {
    schema: 1,
    defaultRole: roles.includes(input.defaultRole as Role) ? input.defaultRole as Role : null,
    roles: Object.fromEntries(roles.map((role) => [role, { areas: pick(rolesIn[role]?.areas, allAreas), actions: pick(rolesIn[role]?.actions, allActions) }])) as Record<Role, RoleRights>,
    members,
  }
}

export function serializeAccess(policy: AccessPolicy) {
  const members = Object.fromEntries(Object.entries(policy.members).filter(([email, assigned]) => isEmail(email) && assigned.length).sort(([a], [b]) => a.localeCompare(b)).map(([email, assigned]) => [normalEmail(email), roles.filter((role) => assigned.includes(role))]))
  return `${JSON.stringify({ schema: 1, defaultRole: policy.defaultRole, roles: Object.fromEntries(roles.map((role) => [role, { areas: allAreas.filter((area) => policy.roles[role].areas.includes(area)), actions: allActions.filter((action) => policy.roles[role].actions.includes(action)) }])), members }, null, 2)}\n`
}

// A person's rights: the union of their roles, or the default role when their email is not listed (or not known yet).
// No policy = no restrictions.
export function rightsFor(policy: AccessPolicy | null, email: string): Rights {
  if (!policy) return { areas: new Set(allAreas), actions: new Set(allActions), roles: [], restricted: false }
  const listed = email ? policy.members[normalEmail(email)] ?? [] : []
  const assigned = listed.length ? listed : policy.defaultRole ? [policy.defaultRole] : []
  return {
    areas: new Set(assigned.flatMap((role) => policy.roles[role].areas)),
    actions: new Set(assigned.flatMap((role) => policy.roles[role].actions)),
    roles: assigned,
    restricted: true,
  }
}

// A policy may not lock its editor out: the person saving it must keep a role that can manage access.
export function keepsManager(policy: AccessPolicy, email: string) {
  return Boolean(email) && rightsFor(policy, email).actions.has('access.manage')
}
