import { composeAzureUrl, listAzureConnectionProfiles, saveAzureConnectionProfile, type AzureConnectionProfile, type AzureConnectionProfileSummary } from './azureCredentials.ts'
import { roles, type Role } from './access.ts'
import { streamNamedBy } from './streams.ts'
import { duplicateOf } from './viewDefinitions.ts'

// SET-21…SET-25: starter views per access role (product owner, 2026-11-26: "I want to be able to Set-up Role Wise My
// Views for users … Users can still setup Custom Views, But let them start with what I set up as Admin / Tool Owner").
// An admin ("Shared setup in Git", storage.shared) defines read-only views — a name, a server, a project and a WIQL
// query, as a My view has (SET-17) — each for one or more access roles, kept for everyone in Git next to the Other views
// (other-views/role-starters.json; never a PAT or email of a connection). A person whose roles include a starter view gets
// a copy of it among their own My views once, on each computer (My views live in this browser or desktop app only); from
// then on the copy is theirs — they delete it like any My view and it does not come back, and they add their own. A
// change to a starter later does not change a copy already made (LIM-158); a starter added later arrives at the next
// start. Losing a role keeps the copies.
export const roleStartersPath = 'other-views/role-starters.json'
const kind = 'role-starter-views'
const idPattern = /^starter-[a-z0-9-]{1,60}$/
export interface StarterView { id: string; name: string; server: string; onPrem: boolean; project: string; query: string; roles: Role[]; by?: string; at?: string }
export interface StartersFile { schema: 1; kind: typeof kind; views: StarterView[] }
export const emptyStarters = (): StartersFile => ({ schema: 1, kind, views: [] })

const clean = (view: StarterView): StarterView => ({ id: view.id, name: view.name.trim(), server: view.server.trim().replace(/\/+$/, ''), onPrem: Boolean(view.onPrem), project: view.project.trim(), query: view.query.trim(), roles: roles.filter((role) => view.roles.includes(role)), ...(view.by ? { by: view.by.slice(0, 200) } : {}), ...(view.at ? { at: view.at } : {}) })

// Why a starter view cannot be saved, or ''. The same checks as a My view (SET-17): a name of at most 80 characters that
// names no stream, an https server, a project, a WIQL query, at least one role; names unique among the starters.
export function starterProblem(view: Pick<StarterView, 'id' | 'name' | 'server' | 'project' | 'query' | 'roles'>, others: StarterView[] = []) {
  const name = view.name.trim()
  if (!name) return 'Enter a name for the view.'
  if (name.length > 80) return 'Use a name of at most 80 characters.'
  const stream = streamNamedBy([name])
  if (stream) return `“${name}” names the stream ${stream.name}: a starter view never replaces a stream. Choose another name.`
  if (others.some((other) => other.id !== view.id && other.name.trim().toLowerCase() === name.toLowerCase())) return `A starter view named “${name}” already exists.`
  if (!/^https:\/\/[^\s/]+/.test(view.server.trim())) return 'Choose a server.'
  if (!view.project.trim()) return 'Enter the project.'
  if (!/^\s*select\b/i.test(view.query)) return 'Enter a WIQL query (it starts with SELECT).'
  if (view.query.length > 32000) return 'The query is too long.'
  if (!view.roles.length) return 'Choose at least one access role.'
  try { composeAzureUrl(view.server.trim(), view.project.trim()) } catch (error) { return error instanceof Error ? error.message : String(error) }
  return ''
}

// The file read from Git: a file that is not one is refused as a whole (nothing is copied); each view is checked on its
// own and a wrong one left out. Roles that do not exist are dropped.
export function parseStarters(text: string | null | undefined): StartersFile {
  if (text == null || !text.trim()) return emptyStarters()
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error(`${roleStartersPath} in Git is not valid JSON: no starter views were read.`) }
  const file = raw as Partial<StartersFile> | null
  if (!file || typeof file !== 'object' || file.schema !== 1 || file.kind !== kind || !Array.isArray(file.views)) throw new Error(`${roleStartersPath} in Git is not a starter views file (schema 1): no starter views were read.`)
  const views: StarterView[] = []
  for (const entry of file.views.slice(0, 200)) {
    const value = entry as Partial<StarterView> | null
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !idPattern.test(value.id) || views.some((view) => view.id === value.id)) continue
    const view: StarterView = { id: value.id, name: String(value.name ?? ''), server: String(value.server ?? ''), onPrem: value.onPrem === true, project: String(value.project ?? ''), query: String(value.query ?? ''), roles: Array.isArray(value.roles) ? roles.filter((role) => (value.roles as unknown[]).includes(role)) : [], ...(typeof value.by === 'string' ? { by: value.by } : {}), ...(typeof value.at === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value.at) ? { at: value.at } : {}) }
    if (!starterProblem(view, views)) views.push(clean(view))
  }
  return { schema: 1, kind, views }
}
export const serializeStarters = (file: StartersFile) => `${JSON.stringify({ schema: 1, kind, views: file.views.map(clean) } satisfies StartersFile, null, 2)}\n`
export const newStarterId = () => `starter-${crypto.randomUUID().slice(0, 12)}`
export const withStarter = (file: StartersFile, view: StarterView): StartersFile => ({ ...file, views: [...file.views.filter((entry) => entry.id !== view.id), clean(view)] })
export const withoutStarter = (file: StartersFile, id: string): StartersFile => ({ ...file, views: file.views.filter((entry) => entry.id !== id) })

// The starter views for a person's roles (their own roles, never a role viewed as).
export const startersFor = (file: StartersFile, mine: readonly Role[]) => file.views.filter((view) => view.roles.some((role) => mine.includes(role)))

// Which starter views this computer has already copied for a person, per repository: copied once, so one the person
// deleted does not come back.
const appliedKey = 'demand-planning-starter-views-applied-v1'
const scopeOf = (repository: string, email: string) => `${repository}|${email.trim().toLowerCase()}`
function readApplied(storage: Pick<Storage, 'getItem'>): Record<string, string[]> {
  try { const raw = JSON.parse(storage.getItem(appliedKey) ?? '{}') as unknown; return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, string[]> : {} } catch { return {} }
}
export const appliedStarters = (repository: string, email: string, storage: Pick<Storage, 'getItem'> = localStorage) => readApplied(storage)[scopeOf(repository, email)] ?? []

// The My view a starter view becomes (a copy: its own id, mine, no PAT — the server's PAT here is used).
export function starterCopy(view: StarterView): AzureConnectionProfile {
  return { id: `my-${view.id}`, url: composeAzureUrl(view.server, view.project), reason: view.name, viewName: view.name, role: 'reference', showInMenu: true, query: view.query, mine: true, token: '', ...(view.onPrem ? { baseUrl: view.server } : {}) }
}

// SET-23: copies each starter view of the person's roles not copied here before into their My views, and records it.
// A starter whose copy would duplicate a view here (same name, or same server, project and query) is recorded but not
// copied (the person already has it). Returns the names copied and those skipped as already here.
export interface StarterResult { copied: string[]; ids: string[]; already: string[] }
export function applyStarters(file: StartersFile, mine: readonly Role[], repository: string, email: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): StarterResult {
  const result: StarterResult = { copied: [], ids: [], already: [] }
  if (!repository || !email.trim()) return result
  const done = new Set(appliedStarters(repository, email, storage))
  const fresh = startersFor(file, mine).filter((view) => !done.has(view.id))
  if (!fresh.length) return result
  for (const view of fresh) {
    done.add(view.id)
    const profiles: AzureConnectionProfileSummary[] = listAzureConnectionProfiles(storage)
    let copy: AzureConnectionProfile
    try { copy = starterCopy(view) } catch { continue }
    if (profiles.some((profile) => profile.id === copy.id || (profile.viewName || profile.reason).trim().toLowerCase() === view.name.toLowerCase()) || duplicateOf({ ...copy, role: 'reference' }, profiles)) { result.already.push(view.name); continue }
    try { saveAzureConnectionProfile(copy, storage); result.copied.push(view.name); result.ids.push(copy.id) } catch { done.delete(view.id) }
  }
  const all = readApplied(storage)
  all[scopeOf(repository, email)] = [...done]
  try { storage.setItem(appliedKey, JSON.stringify(all)) } catch { /* copied again next start: the copies here are skipped as already here */ }
  return result
}

// Why this person gets no starter views now, or '' (shown on My settings → My views).
export function startersBlocked({ email, connected, isSample, viewingAs }: { email: string; connected: boolean; isSample: boolean; viewingAs: boolean }) {
  if (viewingAs) return 'Not while viewing as someone else.'
  if (isSample) return 'Not while the synthetic sample data is loaded.'
  if (!connected) return 'Your admin’s starter views come from Git: connect Git storage (Admin → Data & history).'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Your admin’s starter views for your role need your work email: set it under My settings → Your work email.'
  return ''
}
