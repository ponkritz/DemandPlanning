// Role-based access: which menu areas each role sees and which actions it may take, and which roles each person
// (by the email of their Azure DevOps PAT) has. The policy is access.json in the Git data repository, next to the
// planning data, so only people who can write to that repository can change it. CON-101 (fail closed): until a policy
// is loaded everyone is read-only — every menu area is shown, no action is allowed — except that, once Git storage
// confirmed that no access.json exists, the viewer may create the first one (access.manage only). This decides what
// the app shows; Azure DevOps and GitHub still decide what each person's own tokens can read and change.
// CON-93: Tool Owner — the only role that changes the stream mapping and its query logic (streams.manage).
export const roles = ['Tool Owner', 'Admin', 'Product Owner', 'People Manager', 'Scrum Master', 'Team Member'] as const
export type Role = typeof roles[number]

export const areas = [
  { key: 'overview', label: 'My dashboard' },
  // MYD-05: the team's insights for selected roles only (Dashboard, Pulse Check, PI Review); My dashboard is for everyone.
  { key: 'insights', label: 'Team insights (Team overview, Pulse Check, PI Review)' },
  { key: 'mywork', label: 'My Tasks [Board]' },
  { key: 'bulk', label: 'Sprint check' },
  { key: 'monthly', label: 'Time Writing' },
  { key: 'board', label: 'I&D Board backlogs' },
  { key: 'health', label: 'Backlog Health' },
  { key: 'release', label: 'Release Details (on-prem views, Windchill exports)' },
  { key: 'baselines', label: 'Baselines' },
  { key: 'qemapping', label: 'QE Mapping' },
  { key: 'snapshots', label: 'Snapshots' },
  { key: 'docs', label: 'Documentation' },
  // OND-01 (permissions 4): the On-Demand pages (CoNQ and the pages added there). A file older than permissions 4 shows
  // it to every role it lists, as the starting matrix does.
  { key: 'ondemand', label: 'On-Demand pages (CoNQ …)', since: 4 },
] as const
export type Area = typeof areas[number]['key']

// CON-94: every action is a permission of its own, in groups, each Allow, Deny or Not set per role. legacy: the action
// of access.json files written before CON-94 whose holders get this permission ('*': everyone, as the app had no
// check for it then), so nothing becomes more open or more closed than it was.
export const actionGroups = ['Work items in Azure DevOps', 'Release data', 'Streams', 'Setup', 'Capacity and time', 'People and access', 'Reports and sharing', 'On-Demand'] as const
export const actions = [
  { key: 'azure.write', group: 'Work items in Azure DevOps', label: 'Create Features, User Stories and Tasks', legacy: 'azure.write' },
  { key: 'azure.createForOthers', group: 'Work items in Azure DevOps', label: 'Assign new work to other people', legacy: 'azure.createForOthers' },
  { key: 'work.edit', group: 'Work items in Azure DevOps', label: 'Edit the fields of a work item', legacy: 'azure.write' },
  { key: 'work.state', group: 'Work items in Azure DevOps', label: 'Change the state (Active, Closed), Close Features', legacy: 'azure.write' },
  { key: 'work.move', group: 'Work items in Azure DevOps', label: 'Move to another Sprint or PI (Sprint check, PI check)', legacy: 'azure.write' },
  { key: 'work.hours', group: 'Work items in Azure DevOps', label: 'Enter planned and actual hours (Time Writing)', legacy: 'azure.write' },
  { key: 'work.comment', group: 'Work items in Azure DevOps', label: 'Add a comment', legacy: 'azure.write' },
  { key: 'work.bulk', group: 'Work items in Azure DevOps', label: 'Bulk create Features (DP, IOCC, Content)', legacy: 'azure.write' },
  { key: 'windchill.import', group: 'Release data', label: 'Import Windchill exports', legacy: 'windchill.import' },
  { key: 'release.counts', group: 'Release data', label: 'Enter release counts (placeholders for CP, DP, IOCC)', legacy: 'settings.manage' },
  { key: 'baselines.edit', group: 'Release data', label: 'Edit baselines (rules and release scope)', legacy: 'baselines.edit' },
  { key: 'qemapping.edit', group: 'Release data', label: 'Edit the QE Mapping', legacy: '*' },
  { key: 'data.export', group: 'Release data', label: 'Export tables (Excel, CSV)', legacy: '*' },
  { key: 'streams.manage', group: 'Streams', label: 'Change the stream mapping and its query logic: servers, projects and queries of the streams, their data sets, release naming (Tool Owner)', legacy: 'streams.manage' },
  { key: 'streams.options', group: 'Streams', label: 'Stream options: Epics to match Features in, shared bulk creation Epics', legacy: 'settings.manage' },
  { key: 'setup.feature', group: 'Setup', label: 'Edit the shared Feature setup', legacy: '*' },
  // EPS-04 (permissions 3): the Epic setup's fields and its value lists.
  { key: 'setup.epic', group: 'Setup', label: 'Edit the Epic setup (Feature fields per Epic, title pattern, Copy to Epics)', legacy: 'settings.manage', since: 3 },
  { key: 'setup.values', group: 'Setup', label: 'Edit Epic setup value lists and User Story templates', legacy: 'settings.manage', since: 3 },
  { key: 'capacity.settings', group: 'Capacity and time', label: 'Capacity and absence, calculation profiles', legacy: 'settings.manage' },
  { key: 'capacity.rules', group: 'Capacity and time', label: 'Bucket rules and insight thresholds', legacy: 'settings.manage' },
  { key: 'capacity.time', group: 'Capacity and time', label: 'Holidays and common activities', legacy: 'settings.manage' },
  { key: 'capacity.periods', group: 'Capacity and time', label: 'Period control and locking a month’s figures', legacy: 'settings.manage' },
  { key: 'capacity.history', group: 'Capacity and time', label: 'Import historical hours', legacy: 'settings.manage' },
  { key: 'people.edit', group: 'People and access', label: 'Edit people (region, team role, reports to, dates), remove and restore', legacy: 'settings.manage' },
  { key: 'people.capacityRoles', group: 'People and access', label: 'Capacity roles', legacy: 'settings.manage' },
  { key: 'access.manage', group: 'People and access', label: 'Edit roles and members (Role rights)', legacy: 'access.manage' },
  { key: 'access.viewAs', group: 'People and access', label: 'View as another person or role', legacy: 'access.manage' },
  { key: 'pack.text', group: 'Reports and sharing', label: 'Monthly pack: edit the text', legacy: '*' },
  { key: 'pack.setup', group: 'Reports and sharing', label: 'Monthly pack: setup (lines, KPIs)', legacy: 'settings.manage' },
  { key: 'layout.defaults', group: 'Reports and sharing', label: 'Table, chart and page defaults, Get started links', legacy: 'settings.manage' },
  { key: 'storage.shared', group: 'Reports and sharing', label: 'Shared setup in Git, master data, audit, KPI tracker', legacy: 'settings.manage' },
  // CON-103 (permissions 4): the On-Demand pages' setup and their rows — a group of their own, as they are their own
  // menu area and their own data (not release data). A file older than permissions 4 gives them as the starting matrix
  // does (Tool Owner and Admin) to the roles it lists; nobody had them before (no older permission covered them).
  { key: 'ondemand.setup', group: 'On-Demand', label: 'Set up On-Demand pages (pages, columns, options)', legacy: 'ondemand.setup', since: 4 },
  { key: 'ondemand.edit', group: 'On-Demand', label: 'Edit On-Demand data (rows)', legacy: 'ondemand.edit', since: 4 },
  // CON-106 (permissions 5): the page builder (PGB-08) — create, rename, reorder, configure and remove menu groups, add,
  // move and remove any added page and name co-owners. A file older than permissions 5 gives it as the starting matrix
  // does: to a listed Tool Owner only (a file without the Tool Owner role gives that role every right, CON-93).
  { key: 'pages.manage', group: 'On-Demand', label: 'Manage pages and menu groups (Tool Owner)', legacy: 'pages.manage', since: 5 },
] as const
export type Action = typeof actions[number]['key']

// deny (CON-94): the areas and actions a role denies; a denial wins over any other role's allow.
export type Permission = Area | Action
export interface RoleRights { areas: Area[]; actions: Action[]; deny?: Permission[] }
export interface AccessPolicy { schema: 1; defaultRole: Role | null; roles: Record<Role, RoleRights>; members: Record<string, Role[]> }
// restricted: a loaded policy decides the rights (false: no policy loaded, so the fail-closed rights apply).
export interface Rights { areas: Set<Area>; actions: Set<Action>; roles: Role[]; restricted: boolean }

const allAreas = areas.map((entry) => entry.key) as Area[]
const allActions = actions.map((entry) => entry.key) as Action[]
const myWork: Area[] = ['mywork', 'bulk', 'monthly']

export const accessFile = 'access.json'
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
export const normalEmail = (value: string) => value.trim().toLowerCase()

// The starting matrix (editable in Admin → People & roles → Role rights): Backlog Health only for Scrum Masters, Product Owners and Admins.
const workActions: Action[] = ['azure.write', 'work.edit', 'work.state', 'work.move', 'work.hours', 'work.comment']
export function defaultPolicy(adminEmail = ''): AccessPolicy {
  return inOrder({
    schema: 1,
    defaultRole: 'Team Member',
    roles: {
      'Tool Owner': { areas: [...allAreas], actions: [...allActions] },
      'Admin': { areas: [...allAreas], actions: allActions.filter((action) => action !== 'streams.manage' && action !== 'pages.manage') },
      // CON-94: the starting matrix; each cell can be set to Allow, Deny or Not set in Role rights.
      'Product Owner': { areas: ['overview', 'board', 'health', 'release', 'baselines', 'qemapping', 'docs', 'ondemand'], actions: [...workActions, 'work.bulk', 'azure.createForOthers', 'baselines.edit', 'qemapping.edit', 'data.export', 'pack.text'] },
      'People Manager': { areas: ['overview', 'insights', ...myWork, 'board', 'release', 'baselines', 'qemapping', 'snapshots', 'docs', 'ondemand'], actions: [...workActions, 'work.bulk', 'azure.createForOthers', 'baselines.edit', 'qemapping.edit', 'data.export', 'pack.text'] },
      'Scrum Master': { areas: ['overview', ...myWork, 'board', 'health', 'release', 'docs', 'ondemand'], actions: [...workActions, 'azure.createForOthers', 'data.export', 'setup.feature', 'setup.epic'] },
      'Team Member': { areas: ['overview', ...myWork, 'board', 'release', 'docs', 'ondemand'], actions: [...workActions, 'data.export'] },
    },
    members: isEmail(adminEmail) ? { [normalEmail(adminEmail)]: ['Admin'] } : {},
  })
}
// Every list in catalog order, as a file is read back.
const order = [...allAreas, ...allActions] as Permission[]
const sorted = <T extends Permission>(list: T[]) => order.filter((key) => list.includes(key as T)) as T[]
function inOrder(policy: AccessPolicy): AccessPolicy {
  for (const rights of Object.values(policy.roles)) { rights.areas = sorted(rights.areas); rights.actions = sorted(rights.actions); if (rights.deny) rights.deny = sorted(rights.deny) }
  return policy
}

const pick = <T extends string>(value: unknown, allowed: readonly T[]) => Array.isArray(value) ? allowed.filter((entry) => value.includes(entry)) : []
// The permissions that did not exist before CON-94 (their presence marks a file written with the split permissions).
const newKeys = new Set<Action>(['setup.epic', 'setup.values', 'work.edit', 'work.state', 'work.move', 'work.hours', 'work.comment', 'work.bulk', 'release.counts', 'qemapping.edit', 'data.export', 'streams.options', 'setup.feature', 'capacity.settings', 'capacity.rules', 'capacity.time', 'capacity.periods', 'capacity.history', 'people.edit', 'people.capacityRoles', 'access.viewAs', 'pack.text', 'pack.setup', 'layout.defaults', 'storage.shared', 'ondemand.setup', 'ondemand.edit', 'pages.manage'])

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
  // A file written before Team insights existed: the roles that saw the Data Insights then and lead people (Admin,
  // People Manager) keep the team's insights; every other role keeps My dashboard only.
  const before = !Object.values(rolesIn).some((role) => Array.isArray(role?.areas) && role.areas.includes('insights'))
  // CON-103: an area or action added with permissions 4 or later (since) starts as in the starting matrix for each role a
  // file older than it lists; a role missing from the file still has no rights.
  const version = Number((input as { permissions?: unknown }).permissions) || 0
  const starting = defaultPolicy()
  const sinceOf = (key: Permission) => ([...areas, ...actions].find((entry) => entry.key === key) as { since?: number } | undefined)?.since ?? 0
  const added = (key: Permission, role: Role) => sinceOf(key) >= 4 && sinceOf(key) > version && Boolean(rolesIn[role]) && (isArea(key) ? (starting.roles[role].areas as Permission[]) : (starting.roles[role].actions as Permission[])).includes(key)
  const areasOf = (role: Role) => { const listed = pick(rolesIn[role]?.areas, allAreas); const kept = before && listed.includes('overview') && (role === 'Tool Owner' || role === 'Admin' || role === 'People Manager') ? allAreas.filter((area) => listed.includes(area) || area === 'insights') : listed; return allAreas.filter((area) => kept.includes(area) || added(area, role)) }
  // CON-94: a file written before the permissions were split lists only the old actions: each new permission is
  // allowed where its old action was (or for everyone, where the app had no check), so nothing changes for anyone.
  // permissions: 2 or 3 marks a file saved with the split permissions (so a role left with old keys only is not
  // migrated again). A permission added after the file's version (since) starts as in the starting matrix.
  const split = version >= 2 || Object.values(rolesIn).some((role) => Array.isArray(role?.actions) && role.actions.some((key) => newKeys.has(key as Action)))
  const actionsOf = (raw: unknown, role: Role) => {
    const listed = Array.isArray(raw) ? raw as string[] : []
    if (split) return allActions.filter((key) => listed.includes(key) || added(key, role) || (version >= 2 && sinceOf(key) > version && starting.roles[role].actions.includes(key)))
    return allActions.filter((key) => { const legacy = actions.find((entry) => entry.key === key)!.legacy; return listed.includes(key) || added(key, role) || legacy === '*' || listed.includes(legacy) })
  }
  const denyOf = (raw: unknown): Partial<RoleRights> => { const denied = pick(raw, [...allAreas, ...allActions] as Permission[]); return denied.length ? { deny: denied } : {} }
  return {
    schema: 1,
    defaultRole: roles.includes(input.defaultRole as Role) ? input.defaultRole as Role : null,
    // CON-93: a file written before the Tool Owner role keeps its roles; Tool Owner gets every right until it is set.
    roles: Object.fromEntries(roles.map((role) => [role, role === 'Tool Owner' && !rolesIn[role] ? { areas: [...allAreas], actions: [...allActions] } : { areas: areasOf(role), actions: actionsOf(rolesIn[role]?.actions, role), ...denyOf(rolesIn[role]?.deny) }])) as Record<Role, RoleRights>,
    members,
  }
}

export function serializeAccess(policy: AccessPolicy) {
  const members = Object.fromEntries(Object.entries(policy.members).filter(([email, assigned]) => isEmail(email) && assigned.length).sort(([a], [b]) => a.localeCompare(b)).map(([email, assigned]) => [normalEmail(email), roles.filter((role) => assigned.includes(role))]))
  return `${JSON.stringify({ schema: 1, permissions: 5, defaultRole: policy.defaultRole, roles: Object.fromEntries(roles.map((role) => [role, { areas: allAreas.filter((area) => policy.roles[role].areas.includes(area)), actions: allActions.filter((action) => policy.roles[role].actions.includes(action)), ...(policy.roles[role].deny?.length ? { deny: ([...allAreas, ...allActions] as Permission[]).filter((key) => policy.roles[role].deny!.includes(key)) } : {}) }])), members }, null, 2)}\n`
}

// A person's rights: the union of their roles, or the default role when their email is not listed (or not known yet).
// CON-101: no policy = read-only (every menu area, no action); bootstrap (Git storage confirmed that there is no
// access.json yet) adds access.manage alone, so the first roles file can be set up.
export function rightsFor(policy: AccessPolicy | null, email: string, bootstrap = false): Rights {
  if (!policy) return { areas: new Set(allAreas), actions: new Set<Action>(bootstrap ? ['access.manage'] : []), roles: [], restricted: false }
  const listed = email ? policy.members[normalEmail(email)] ?? [] : []
  const assigned = listed.length ? listed : policy.defaultRole ? [policy.defaultRole] : []
  // CON-94: the union of the roles' allows, less anything any of them denies (a denial wins).
  const denied = new Set(assigned.flatMap((role) => policy.roles[role].deny ?? []))
  return {
    areas: new Set(assigned.flatMap((role) => policy.roles[role].areas).filter((area) => !denied.has(area))),
    actions: new Set(assigned.flatMap((role) => policy.roles[role].actions).filter((action) => !denied.has(action))),
    roles: assigned,
    restricted: true,
  }
}

// CON-102: why a button that starts a change in Azure DevOps is disabled — '' when nothing is missing. Read-only (no
// roles file loaded, CON-101) says so; otherwise it names the missing permissions and where an Admin changes them.
export const readOnlyReason = 'Read only: the access roles are not loaded yet, so nothing can be changed in Azure DevOps.'
// where: what cannot be changed (OND-07: the On-Demand pages are in Git, not in Azure DevOps).
export function writeBlockedReason(readOnly: boolean, missing: Action[], where = 'in Azure DevOps') {
  if (!missing.length) return ''
  if (readOnly) return where === 'in Azure DevOps' ? readOnlyReason : `Read only: the access roles are not loaded yet, so nothing can be changed ${where}.`
  const labels = [...new Set(missing)].map((key) => `“${actions.find((entry) => entry.key === key)?.label ?? key}”`)
  return `Your role does not allow ${labels.join(', ')}. An Admin can change this in Admin → People & roles → Role rights.`
}

// CON-94: one cell of the matrix — Allow, Deny or Not set — and changing it (an allow and a deny never coexist).
export type Cell = 'allow' | 'deny' | 'unset'
export const isArea = (key: Permission): key is Area => (allAreas as string[]).includes(key)
export function cellOf(rights: RoleRights, key: Permission): Cell {
  if (rights.deny?.includes(key)) return 'deny'
  return (isArea(key) ? (rights.areas as Permission[]) : (rights.actions as Permission[])).includes(key) ? 'allow' : 'unset'
}
export function setCell(rights: RoleRights, key: Permission, cell: Cell) {
  if (isArea(key)) rights.areas = sorted(rights.areas.filter((entry) => entry !== key).concat(cell === 'allow' ? [key] : []))
  else rights.actions = sorted(rights.actions.filter((entry) => entry !== key).concat(cell === 'allow' ? [key as Action] : []))
  const deny = sorted((rights.deny ?? []).filter((entry) => entry !== key).concat(cell === 'deny' ? [key] : []))
  if (deny.length) rights.deny = deny
  else delete rights.deny
}

// CON-94 "Check access": whether a person may do one thing, and which of their roles allow or deny it.
// CON-101: without a policy nothing is allowed (noPolicy), menu areas aside.
export function explainAccess(policy: AccessPolicy | null, email: string, key: Permission) {
  if (!policy) return { allowed: isArea(key), roles: [] as Role[], allowedBy: [] as Role[], deniedBy: [] as Role[], noPolicy: true }
  const { roles: assigned } = rightsFor(policy, email)
  const allowedBy = assigned.filter((role) => cellOf(policy.roles[role], key) === 'allow')
  const deniedBy = assigned.filter((role) => cellOf(policy.roles[role], key) === 'deny')
  return { allowed: allowedBy.length > 0 && deniedBy.length === 0, roles: assigned, allowedBy, deniedBy, noPolicy: false }
}

// CON-104: a person's roles set as a whole — any number of them, kept in the matrix's order; none removes the person
// (the default role then applies). Never one role in place of the others.
export function withMemberRoles(policy: AccessPolicy, email: string, chosen: readonly Role[]): AccessPolicy {
  const next = structuredClone(policy)
  const ordered = roles.filter((role) => chosen.includes(role))
  if (ordered.length) next.members[normalEmail(email)] = ordered; else delete next.members[normalEmail(email)]
  return next
}

// A policy may not lock its editor out: the person saving it must keep a role that can manage access.
export function keepsManager(policy: AccessPolicy, email: string) {
  return Boolean(email) && rightsFor(policy, email).actions.has('access.manage')
}

// CON-93: whether anyone holds the stream mapping (a listed member, or everyone through the default role, with
// streams.manage). Until someone does, the people who manage access may change it, so nobody is locked out.
export function toolOwnerExists(policy: AccessPolicy | null) {
  if (!policy) return false
  const holds = (role: Role) => policy.roles[role]?.actions.includes('streams.manage')
  return Object.values(policy.members).some((assigned) => assigned.some(holds)) || Boolean(policy.defaultRole && holds(policy.defaultRole))
}
// CON-106: pages and menu groups (PGB-08): the holders of "Manage pages and menu groups" — or, while no Tool Owner
// exists (CON-93), the people who manage access, so nobody is locked out. Without a policy nobody (CON-101).
export function canManagePages(policy: AccessPolicy | null, rights: Pick<Rights, 'actions'>) {
  if (!policy) return false
  return rights.actions.has('pages.manage') || (!toolOwnerExists(policy) && rights.actions.has('access.manage'))
}
// CON-101: without a policy nobody changes the stream mapping (fail closed).
export function canManageStreams(policy: AccessPolicy | null, rights: Pick<Rights, 'actions'>) {
  if (!policy) return false
  return rights.actions.has('streams.manage') || (!toolOwnerExists(policy) && rights.actions.has('access.manage'))
}
// CON-93: who holds the stream mapping (members with streams.manage, and the default role's) and whether a change to
// the policy touches it — only someone who may change the stream mapping may change who holds it, and a policy that
// had a holder must keep one.
const streamHolders = (policy: AccessPolicy) => JSON.stringify({ members: Object.entries(policy.members).filter(([, assigned]) => assigned.some((role) => policy.roles[role]?.actions.includes('streams.manage'))).map(([email]) => email).sort(), roles: roles.filter((role) => policy.roles[role]?.actions.includes('streams.manage')), defaultRole: policy.defaultRole && policy.roles[policy.defaultRole]?.actions.includes('streams.manage') ? policy.defaultRole : null })
export function toolOwnerChange(before: AccessPolicy | null, after: AccessPolicy, email: string): string {
  if (before && streamHolders(before) === streamHolders(after)) return ''
  if (before && !canManageStreams(before, rightsFor(before, email))) return 'Only a Tool Owner can change who holds the stream mapping (the Tool Owner role and “Change the stream mapping”).'
  if (toolOwnerExists(before) && !toolOwnerExists(after)) return 'Keep at least one Tool Owner: the stream mapping would have no owner.'
  return ''
}
