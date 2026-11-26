import { normalizeBaseUrl } from './azureClient.ts'

// DSH-18, DSH-19 A saved Azure DevOps query as a data source of an On-Demand Dashboard: only its reference is kept in the
// dashboard's file in Git (dashboards/<page>.json, `queries`) — the server (an organization on dev.azure.com or an
// on-premises collection), the project, the query's id and the name the owners gave it. Never a PAT, never rows, never
// the query text: each viewer reads the query from Azure DevOps with their own PAT (src/azureQuerySources.ts). The
// reader keeps only these five keys, so a crafted file cannot carry anything else into the app.

export interface AzureQueryRef { id: string; name: string; server: string; project: string; queryId: string }
export const maxQueryRefs = 10, maxQueryName = 80, maxProject = 128
export const queryIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const refIdPattern = /^[A-Za-z0-9][\w-]{0,39}$/
export const querySourcePrefix = 'azq:'
export const querySource = (id: string) => `${querySourcePrefix}${id}`
export const queryOfSource = (source: string) => source.startsWith(querySourcePrefix) ? source.slice(querySourcePrefix.length) : ''
export const serverLabel = (server: string) => server.replace(/^https:\/\//, '')
// The server as one PAT is kept for it (azureCredentials serverKey): the organization or collection URL in lower case.
export const serverKeyOf = (server: string) => server.replace(/\/+$/, '').toLowerCase()
const cleanText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''

// One stored reference, or why it is not one.
export function parseQueryRef(raw: unknown): AzureQueryRef | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'An Azure query of the dashboard is not a reference: left out.'
  const entry = raw as Record<string, unknown>
  const name = cleanText(entry.name, maxQueryName)
  const label = name ? `The Azure query “${name}”` : 'An Azure query of the dashboard'
  if (typeof entry.id !== 'string' || !refIdPattern.test(entry.id)) return `${label} has no valid id: left out.`
  if (!name) return `${label} has no name: left out.`
  if (typeof entry.queryId !== 'string' || !queryIdPattern.test(entry.queryId)) return `${label} has no valid query id: left out.`
  const project = cleanText(entry.project, maxProject)
  if (!project || /[/\\?#]/.test(project)) return `${label} has no valid project: left out.`
  let server = ''
  try { server = typeof entry.server === 'string' && entry.server.length <= 2048 ? normalizeBaseUrl(entry.server) : '' } catch { server = '' }
  if (!server) return `${label} has no valid https server: left out.`
  return { id: entry.id, name, server, project, queryId: entry.queryId.toLowerCase() }
}
// The `queries` of a dashboard file: valid references only (ids and names unique), at most 10.
export function parseQueryRefs(raw: unknown): { refs: AzureQueryRef[]; dropped: string[] } {
  const dropped: string[] = [], refs: AzureQueryRef[] = []
  for (const entry of Array.isArray(raw) ? raw : []) {
    const ref = parseQueryRef(entry)
    if (typeof ref === 'string') { dropped.push(ref); continue }
    if (refs.some((other) => other.id === ref.id || other.name.toLowerCase() === ref.name.toLowerCase())) { dropped.push(`The Azure query “${ref.name}” is listed twice: the second one was left out.`); continue }
    refs.push(ref)
  }
  if (refs.length > maxQueryRefs) dropped.push(`Only the first ${maxQueryRefs} Azure queries are used.`)
  return { refs: refs.slice(0, maxQueryRefs), dropped }
}
// What is written to Git: these five keys and nothing else.
export const queryRefOut = ({ id, name, server, project, queryId }: AzureQueryRef): AzureQueryRef => ({ id, name, server, project, queryId })

// A query's URL as Azure DevOps shows it — …/<project>/_queries/query/<id>/ (or query-edit, or ?id= / ?qid= of older
// servers) — as its server, project and id. The server must be one the app knows (a connection's server), so a pasted
// address never sends a viewer's PAT anywhere new: a PAT is only ever sent to the server it is kept for.
export function queryFromUrl(text: string, knownServers: string[]): { server: string; project: string; queryId: string } | string {
  let url: URL
  try { url = new URL(text.trim()) } catch { return 'Paste the query’s address from Azure DevOps (it starts with https://).' }
  if (url.protocol !== 'https:' || url.username || url.password) return 'Use an https address without a user name or password.'
  const parts = url.pathname.split('/').filter(Boolean).map((part) => { try { return decodeURIComponent(part) } catch { return part } })
  const at = parts.findIndex((part) => part.toLowerCase() === '_queries' || part.toLowerCase() === '_workitems')
  if (at < 1) return 'This is not the address of a saved query: open the query in Azure DevOps and copy the address (…/_queries/query/<id>/).'
  const fromPath = parts.slice(at + 1).find((part) => queryIdPattern.test(part))
  const fromSearch = [url.searchParams.get('id'), url.searchParams.get('qid')].find((value) => value && queryIdPattern.test(value))
  const queryId = (fromPath ?? fromSearch ?? '').toLowerCase()
  if (!queryId) return 'The address has no saved query id: save the query in Azure DevOps (a new, unsaved query has none) and copy its address.'
  const project = parts[at - 1]
  const server = `${url.origin}${parts.slice(0, at - 1).map((part) => `/${encodeURIComponent(part)}`).join('')}`
  let normalized = ''
  try { normalized = normalizeBaseUrl(server) } catch { normalized = '' }
  if (!normalized || (url.hostname === 'dev.azure.com' && at !== 2)) return 'The address does not name an organization (or collection) and a project.'
  const known = knownServers.find((entry) => serverKeyOf(entry) === serverKeyOf(normalized))
  if (!known) return `The app has no connection on ${serverLabel(normalized)}: an Azure query is read only from a server the app already reads (Admin → Streams, or My settings → Servers and PATs).`
  return { server: known.replace(/\/+$/, ''), project, queryId }
}

// A new reference, or why not: a name (unique on the dashboard), a server, project and id, at most 10 per dashboard.
export function newQueryRef(input: { name: string; server: string; project: string; queryId: string }, refs: AzureQueryRef[], id: string): AzureQueryRef | string {
  const name = cleanText(input.name, 200)
  if (!name) return 'Enter a name for the data source.'
  if (name.length > maxQueryName) return `Use a name of at most ${maxQueryName} characters.`
  if (refs.length >= maxQueryRefs) return `A dashboard reads at most ${maxQueryRefs} Azure queries: remove one first.`
  if (refs.some((ref) => ref.name.toLowerCase() === name.toLowerCase())) return `The dashboard already has a data source named “${name}”.`
  const parsed = parseQueryRef({ id, name, server: input.server, project: input.project, queryId: input.queryId })
  if (typeof parsed === 'string') return parsed.replace(/: left out\.$/, '.')
  const same = refs.find((ref) => serverKeyOf(ref.server) === serverKeyOf(parsed.server) && ref.project.toLowerCase() === parsed.project.toLowerCase() && ref.queryId === parsed.queryId)
  if (same) return `This query is already a data source of the dashboard (“${same.name}”).`
  return parsed
}
