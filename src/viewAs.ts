import { normalEmail, rightsFor, type AccessPolicy, type Rights, type Role } from './access.ts'
import type { AzureWorkItem } from './domain'

// View as (CON-89…CON-92): an Admin sees the app as a person — their roles' menu and pages, their My dashboard,
// Assigned to Me and Monthly — or as a role alone, read-only. Kept for this page load only; nothing is stored, and no
// change reaches Azure DevOps or Git storage while it is on.
export type ViewAs = { kind: 'person'; name: string; email?: string } | { kind: 'role'; role: Role }

// Only people holding the Admin role in the access policy (a policy must exist: without one nothing is restricted).
export const canViewAs = (rights: Rights) => rights.restricted && rights.roles.includes('Admin')

export function viewAsRights(policy: AccessPolicy | null, viewAs: ViewAs): Rights {
  if (viewAs.kind === 'person') return rightsFor(policy, viewAs.email ?? '')
  if (!policy) return rightsFor(null, '')
  const rights = policy.roles[viewAs.role]
  return { areas: new Set(rights.areas), actions: new Set(rights.actions), roles: [viewAs.role], restricted: true }
}

export const viewAsLabel = (viewAs: ViewAs) => viewAs.kind === 'role' ? `the role ${viewAs.role}` : viewAs.name || viewAs.email || 'a person'

// The people to choose from: everyone Assigned To work in the fetched data (with their Azure email when known), and
// everyone named in the access policy by email.
export function viewAsPeople(items: Pick<AzureWorkItem, 'assignedTo' | 'assignedToEmail'>[], policy: AccessPolicy | null) {
  const byEmail = new Map<string, { name: string; email?: string }>(), byName = new Map<string, { name: string; email?: string }>()
  for (const item of items) {
    const name = item.assignedTo.trim(), email = item.assignedToEmail ? normalEmail(item.assignedToEmail) : ''
    if (!name) continue
    if (email) { if (!byEmail.has(email)) byEmail.set(email, { name, email }) } else if (!byName.has(name)) byName.set(name, { name })
  }
  for (const email of Object.keys(policy?.members ?? {})) if (!byEmail.has(email)) byEmail.set(email, { name: email, email })
  const named = new Set([...byEmail.values()].map((entry) => entry.name))
  return [...byEmail.values(), ...[...byName.values()].filter((entry) => !named.has(entry.name))].sort((a, b) => a.name.localeCompare(b.name))
}

// The read-only guard: while a View as is on, every write to Azure DevOps or Git storage is refused with this reason.
let viewing = ''
export function setViewAsGuard(label: string) { viewing = label }
export const viewingAs = () => viewing
export function assertNotViewingAs() {
  if (viewing) throw new Error(`Read only while viewing as ${viewing}: nothing is saved to Azure DevOps or Git. Exit View as to make changes.`)
}
