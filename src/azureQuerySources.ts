import type { Area } from './access.ts'
import type { AppState } from './domain'
import { loadAzureConnectionProfile, loadServerPat, serverKey, type AzureConnectionProfileSummary } from './azureCredentials.ts'
import { projectApiBase, requestAzure, type AzureConfig, type AzureTransport } from './azureClient.ts'
import { datasetPage, missingDataset, type Dataset } from './dashboardPages.ts'
import { cellValue, columnName, defaultViewColumns, htmlToText, queryLayout } from './queryView.ts'
import { allStreams, defaultStreams, profilesForStream, toolQueries, toolRoleLabel } from './streams.ts'
import { viewSource } from './viewSources.ts'
import { serverKeyOf, serverLabel, type AzureQueryRef } from './azureQueryRef.ts'
import type { OnDemandColumn, OnDemandRow, OnDemandType } from './onDemand.ts'

// DSH-17…DSH-23 Azure DevOps queries as data sources of the dashboards' blocks, with all their columns as fields:
// (a) the queries the app already reads — each Release Details stream's query (Stream mapping), the Tool Validations
//     Tool List and Validation Documents queries, and the viewer's own My views — from the data the app has fetched
//     (state.azureSources: no read of their own), one source per query, named by its stream, tab or view;
// (b) any other saved query a Dashboard page's builders add by its reference (src/azureQueryRef.ts), read on demand from
//     Azure DevOps with each viewer's own PAT (read only: the saved query by id, the field list and the work items).
// A query's fields get chart types from Azure DevOps' field types (or, for (a), from the reference names and values):
// numbers, dates, picklists and identities as Dropdown-like categories, tags as Multi-select, identities by display
// name — never an email. At most 5,000 rows and 30 columns; a capped source says so wherever its rows are shown or
// exported. Kept free of React (tests/azure-query-sources.test.mjs).

export const maxQueryRows = 5000, maxQueryColumns = 30
export type QueryFieldType = 'text' | 'category' | 'multi' | 'date' | 'number'
export interface QueryField { ref: string; name: string; type: QueryFieldType }
// A field as Azure DevOps lists it (GET _apis/wit/fields).
export interface AzureFieldInfo { referenceName: string; name?: string; type?: string; isPicklist?: boolean; isIdentity?: boolean }
export type QueryValue = string | number | boolean | null | undefined | Record<string, unknown>
export interface QueryItem { id: number; url?: string; values: Record<string, QueryValue> }
// A query's result as the sources build it: the fields (capped), the items (capped), whether more were returned.
export interface QueryResult { columns: { ref: string; name: string }[]; items: QueryItem[]; more: boolean; info?: Record<string, AzureFieldInfo>; readAt?: string }

// ---- field types ----
const lower = (ref: string) => ref.toLowerCase()
const isTags = (ref: string) => lower(ref) === 'system.tags' || /\.tags$/i.test(ref)
const categoryRefs = new Set(['system.state', 'system.reason', 'system.workitemtype', 'system.assignedto', 'system.createdby', 'system.changedby', 'system.areapath', 'system.iterationpath', 'system.teamproject', 'system.boardcolumn', 'system.boardlane',
  'microsoft.vsts.common.priority', 'microsoft.vsts.common.severity', 'microsoft.vsts.common.activity', 'microsoft.vsts.common.valuearea', 'microsoft.vsts.common.risk', 'microsoft.vsts.common.closedby', 'microsoft.vsts.common.resolvedby', 'microsoft.vsts.common.activatedby', 'microsoft.vsts.common.statechangedby'])
const textRefs = new Set(['system.id', 'system.title', 'system.description', 'system.history', 'microsoft.vsts.common.acceptancecriteria', 'links.successor', 'links.predecessor', 'system.parent'])
const isoDate = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/
const isIdentityObject = (value: QueryValue) => Boolean(value && typeof value === 'object' && ('displayName' in value || 'uniqueName' in value))
function fromValues(values: QueryValue[]): QueryFieldType {
  const filled = values.filter((value) => value != null && value !== '')
  if (!filled.length) return 'text'
  if (filled.some(isIdentityObject)) return 'category'
  if (filled.every((value) => typeof value === 'string' && isoDate.test(value))) return 'date'
  if (filled.every((value) => typeof value === 'number' && Number.isFinite(value))) return 'number'
  if (filled.every((value) => typeof value === 'boolean')) return 'category'
  const texts = filled.map((value) => String(value).trim())
  const distinct = new Set(texts).size
  return distinct <= 40 && distinct < texts.length && texts.every((value) => value.length <= 120) ? 'category' : 'text'
}
// The chart type of a query column: Azure DevOps' own field type when known (b), else by the reference name and the values (a).
export function fieldTypeOf(ref: string, info: AzureFieldInfo | undefined, values: QueryValue[] = []): QueryFieldType {
  if (isTags(ref)) return 'multi'
  if (textRefs.has(lower(ref))) return 'text'
  const type = info?.type?.toLowerCase() ?? ''
  if (info?.isIdentity || type === 'identity') return 'category'
  if (info?.isPicklist || type.startsWith('picklist')) return 'category'
  if (type === 'datetime') return 'date'
  if (type === 'integer' || type === 'double') return 'number'
  if (type === 'boolean' || type === 'treepath') return 'category'
  if (type === 'html' || type === 'plaintext' || type === 'history' || type === 'guid') return 'text'
  if (categoryRefs.has(lower(ref))) return 'category'
  if (type === 'string') { const found = fromValues(values); return found === 'category' ? 'category' : 'text' }
  return fromValues(values)
}

// Identities by their display name, never an email: an identity's displayName; "Name <name@company.com>" → "Name"; an
// email on its own → the part before @.
const emailIn = /<[^<>\s@]+@[^<>\s@]+>/g, bareEmail = /\b([^\s@<>"',;]+)@[^\s@<>"',;]+\.[^\s@<>"',;]+\b/g
export const withoutEmails = (text: string) => text.replace(emailIn, '').replace(bareEmail, '$1').replace(/\s+/g, ' ').trim()
export function personName(value: QueryValue): string {
  if (value && typeof value === 'object') {
    const named = value as { displayName?: unknown; uniqueName?: unknown }
    return withoutEmails(typeof named.displayName === 'string' && named.displayName.trim() ? named.displayName : typeof named.uniqueName === 'string' ? named.uniqueName : '')
  }
  return value == null ? '' : withoutEmails(String(value))
}
const round = (value: number) => Math.round(value * 100) / 100
function cellOf(value: QueryValue, type: QueryFieldType): string | string[] {
  if (value == null || value === '') return type === 'multi' ? [] : ''
  if (type === 'multi') return [...new Set(String(personName(value)).split(';').map((tag) => tag.trim()).filter(Boolean))]
  if (type === 'date') return typeof value === 'string' && isoDate.test(value) ? value.slice(0, 10) : ''
  if (type === 'number') { const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '')); return Number.isFinite(number) ? String(round(number)) : '' }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return personName(value).slice(0, 200)
  const text = String(value)
  return withoutEmails(/<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i.test(text) ? htmlToText(text) : text).slice(0, type === 'category' ? 200 : 500)
}
// A field id a dashboard block can keep (letters, digits, _ and -, at most 40), the same for every viewer: the reference
// name with dots as _, a long one shortened with a hash of the full name.
export function fieldIdOf(ref: string) {
  const safe = `q_${ref.replace(/[^\w-]/g, '_')}`
  if (safe.length <= 40) return safe
  let hash = 0
  for (const char of ref) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `${safe.slice(0, 33)}_${hash.toString(36).padStart(6, '0').slice(-6)}`
}
const typeOf: Record<QueryFieldType, OnDemandType> = { text: 'text', category: 'dropdown', multi: 'multi', date: 'date', number: 'number' }
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
const plural = (count: number, word: string) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`

// The fields of a result: its columns in the query's order (each once), at most 30.
export function queryFields(result: Pick<QueryResult, 'columns' | 'items' | 'info'>): { fields: QueryField[]; dropped: number } {
  const seen = new Set<string>()
  const columns = (result.columns.length ? result.columns : defaultViewColumns.map((ref) => ({ ref, name: columnName(ref) }))).filter((column) => { const key = lower(column.ref); if (!column.ref || seen.has(key)) return false; seen.add(key); return true })
  const info = new Map(Object.entries(result.info ?? {}).map(([ref, entry]) => [lower(ref), entry]))
  const fields = columns.slice(0, maxQueryColumns).map((column): QueryField => ({ ref: column.ref, name: (column.name || info.get(lower(column.ref))?.name || columnName(column.ref)).slice(0, 80), type: fieldTypeOf(column.ref, info.get(lower(column.ref)), result.items.slice(0, 500).map((item) => item.values[column.ref])) }))
  return { fields, dropped: Math.max(0, columns.length - maxQueryColumns) }
}
// The cap message, or '' when nothing was left out — shown on the block, in its ⓘ, its Rows behind and every export.
export function capText(more: boolean, rows: number, droppedColumns: number) {
  const parts = [more ? `only the first ${plural(rows, 'row')} are read (the query returns more)` : '', droppedColumns ? `only the first ${maxQueryColumns} columns are used (${plural(droppedColumns, 'more column')} left out)` : '']
  const text = parts.filter(Boolean).join('; ')
  return text ? `Capped: ${text} — the figures are not complete. Narrow the query in Azure DevOps.` : ''
}
// A result as a dataset in the shape of an On-Demand page, so the dashboard blocks, filters and drill-down apply unchanged.
export function queryDataset(key: string, name: string, kind: string, note: string, result: QueryResult): Dataset {
  const { fields, dropped } = queryFields(result)
  const items = result.items.slice(0, maxQueryRows)
  const more = result.more || result.items.length > maxQueryRows
  const rows: OnDemandRow[] = items.map((item, index) => ({ id: `r${index + 1}`, key: `#${item.id}`, ...(item.url && /^https:\/\//.test(item.url) ? { link: item.url } : {}), cells: Object.fromEntries(fields.map((field) => [fieldIdOf(field.ref), lower(field.ref) === 'system.id' ? String(item.id) : cellOf(item.values[field.ref], field.type)])) }))
  const columns: OnDemandColumn[] = fields.map((field) => {
    const id = fieldIdOf(field.ref), type = typeOf[field.type]
    const options = type === 'dropdown' || type === 'multi' ? [...new Set(rows.flatMap((row) => { const value = row.cells[id]; return (Array.isArray(value) ? value : [value ?? '']).map((entry) => String(entry).trim()).filter(Boolean) }))].sort(byText) : []
    return { id, name: field.name, type, options, required: false }
  })
  const capped = capText(more, items.length, dropped)
  return { key, name, kind, note: `${note} (${plural(rows.length, 'row')}${more ? ', capped' : ''}).`, page: datasetPage(key.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 40), name, columns, rows), ...(capped ? { capped } : {}), ...(result.readAt ? { readAt: result.readAt } : {}) }
}

// ---- (a) the queries the app already reads ----
export const viewSourcePrefix = 'azv:', mineSourcePrefix = 'azm:'
export type ConnectionGroup = 'stream' | 'tools' | 'mine'
export interface ConnectionSource { key: string; name: string; kind: string; group: ConnectionGroup; profile: AzureConnectionProfileSummary; area?: Area }
export const streamKind = 'Release Details stream query', toolKind = 'Tool Validations query', mineKind = 'My view'
// The sources, in the order of the streams (Release Details), then the Tool Validations tabs, then the viewer's own My views.
export function connectionSources(profiles: AzureConnectionProfileSummary[], toolSetting?: string): ConnectionSource[] {
  const out: ConnectionSource[] = []
  const toolStream = defaultStreams.find((stream) => stream.rule === 'tool')
  const tools = toolStream ? toolQueries(toolStream, profiles, toolSetting) : { all: [] as AzureConnectionProfileSummary[] }
  const toolIds = new Set(tools.all.map((profile) => profile.id))
  for (const stream of allStreams()) {
    if (stream.source !== 'azure' || stream === toolStream) continue
    const own = profilesForStream(stream, profiles).filter((profile) => !toolIds.has(profile.id))
    for (const profile of own) out.push({ key: `${viewSourcePrefix}${profile.id}`, name: own.length > 1 ? profile.viewName || profile.reason : stream.name, kind: streamKind, group: 'stream', profile, area: 'release' })
  }
  if (toolStream) {
    const pairs: [AzureConnectionProfileSummary | undefined, string][] = [['tools' in tools ? tools.tools : undefined, toolRoleLabel.tools], ['documents' in tools ? tools.documents : undefined, toolRoleLabel.documents]]
    for (const [profile, tab] of pairs) if (profile) out.push({ key: `${viewSourcePrefix}${profile.id}`, name: `${toolStream.name} · ${tab}`, kind: toolKind, group: 'tools', profile, area: 'release' })
  }
  for (const profile of profiles.filter((entry) => entry.mine).sort((a, b) => byText(a.viewName || a.reason, b.viewName || b.reason))) out.push({ key: `${mineSourcePrefix}${profile.id}`, name: profile.viewName || profile.reason, kind: mineKind, group: 'mine', profile })
  return out
}
export const notAvailableForRole = 'Not available for your role.'
export interface ConnectionInput {
  profiles: AzureConnectionProfileSummary[]
  state: Pick<AppState, 'azureSources' | 'releaseSource'>
  sees: (area: Area) => boolean
  viewingAs?: boolean // View as: My views (this browser's own) are not shown for someone else
  toolSetting?: string
}
export interface ConnectionEntry { dataset: Dataset; load?: 'azure' }
const blocked = (key: string, name: string, kind: string, problem: string): Dataset => ({ ...missingDataset(key, problem), name, kind })
// Each (a) source as the viewer gets it: the area right of the page it belongs to (Release Details for the streams and
// Tool Validations, CON-94), only the owner's own browser for My views, "fetch first" before its data is here; else
// its fetched rows (worked out only when wanted).
export function connectionDatasets(input: ConnectionInput, wanted: (key: string) => boolean = () => true): ConnectionEntry[] {
  const releaseCount = input.profiles.filter((profile) => profile.role === 'release-source').length
  return connectionSources(input.profiles, input.toolSetting).map((source): ConnectionEntry => {
    if (source.area && !input.sees(source.area)) return { dataset: blocked(source.key, source.name, source.kind, notAvailableForRole) }
    if (source.group === 'mine' && input.viewingAs) return { dataset: blocked(source.key, source.name, source.kind, 'Not shown while viewing as someone else: a My view is its owner’s own.') }
    const data = viewSource(input.state, source.profile.id, source.profile.role, source.profile.query, releaseCount)
    if (!data) return { dataset: blocked(source.key, source.name, source.kind, `Not fetched yet: fetch ${source.name} from Azure DevOps (↻ Refresh on the top bar) to see this.`), load: 'azure' }
    const columns = 'columns' in data && data.columns?.length ? data.columns : queryLayout(source.profile.query || data.query).columns.map((ref) => ({ ref, name: columnName(ref) }))
    const items = wanted(source.key) ? data.items.slice(0, maxQueryRows + 1).map((item): QueryItem => ({ id: item.id, url: item.url, values: Object.fromEntries(columns.map((column) => [column.ref, cellValue(item, column.ref) as QueryValue])) })) : []
    const fetched = data.fetchedAt ? ` fetched ${data.fetchedAt.slice(0, 16).replace('T', ' ')} UTC` : ''
    const note = source.group === 'mine' ? `Your own My view ${source.name} — only you see it — as last fetched${fetched}` : `The ${source.kind === streamKind ? 'Release Details query' : 'query'} ${source.name} as the app last fetched it${fetched}`
    return { dataset: queryDataset(source.key, source.name, source.kind, note, { columns, items, more: data.items.length > maxQueryRows, readAt: data.fetchedAt }) }
  })
}
// A block's (a) source that is not among the viewer's: a My view of someone else, or a connection removed.
export function missingConnection(key: string): Dataset {
  return key.startsWith(mineSourcePrefix) ? blocked(key, 'My view', mineKind, 'This is someone else’s own My view: only its owner sees it (My views stay on their owner’s computer).')
    : blocked(key, 'Azure DevOps query', streamKind, 'This Azure DevOps query is no longer a connection of the app (removed in Stream mapping).')
}
export const isConnectionSource = (key: string) => key.startsWith(viewSourcePrefix) || key.startsWith(mineSourcePrefix)

// ---- (b) saved queries, read with the viewer's own PAT ----
// The connection a reference is read with: on dev.azure.com the organization, on premises the collection URL as base.
export function queryConfig(ref: Pick<AzureQueryRef, 'server' | 'project'>): AzureConfig {
  const url = new URL(ref.server)
  const parts = url.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part))
  if (url.hostname === 'dev.azure.com') return { organization: parts[0] ?? '', project: ref.project, team: ref.project }
  return { organization: parts.at(-1) ?? url.hostname, project: ref.project, team: ref.project, baseUrl: ref.server }
}
// The viewer's PAT for the server (one PAT per server, kept in this browser or desktop app only), else a connection's own PAT.
export function patForServer(server: string, profiles: AzureConnectionProfileSummary[] = [], storage: Pick<Storage, 'getItem'> = globalThis.localStorage): string {
  const key = serverKeyOf(server)
  try {
    const own = loadServerPat(key, storage)
    if (own) return own
    for (const profile of profiles) if (serverKey(profile) === key) { const token = loadAzureConnectionProfile(profile.id, storage)?.token; if (token) return token }
  } catch { /* no storage: no PAT */ }
  return ''
}
// Why a (b) source is not read for this viewer ('' when it is).
export function queryReadReason(ref: Pick<AzureQueryRef, 'server'>, pat: string, viewingAs = false): string {
  if (viewingAs) return 'Not read while viewing as someone else: an Azure query is read with each viewer’s own PAT.'
  if (!pat.trim()) return `Add your PAT for ${serverLabel(ref.server)} in My settings → Servers and PATs to see this: an Azure query is read with each viewer’s own PAT, and you have none for that server here.`
  return ''
}
// The reason shown when Azure DevOps refused or could not answer: its message, never the PAT.
export const queryFailure = (failure: unknown, pat: string) => `Azure DevOps did not return the query with your PAT: ${(failure instanceof Error ? failure.message : String(failure)).replaceAll(pat.trim() || '\u0000', '[redacted]').slice(0, 400)}`

// The saved query read: the query by id (its ids and columns, at most 5,001 ids so a capped result is known), the
// project's field list (types and names; without it the types come from the values) and the work items in batches of
// 200. Read only; nothing is written to Azure DevOps.
export async function readSavedQuery(ref: AzureQueryRef, pat: string, transport: AzureTransport = requestAzure, now: () => string = () => new Date().toISOString()): Promise<QueryResult> {
  if (!pat.trim()) throw new Error('No PAT for this server.')
  const config = queryConfig(ref)
  const request = (operation: 'saved-query' | 'fields' | 'items', extra: Record<string, unknown> = {}) => transport({ ...config, pat: pat.trim(), operation, ...extra })
  const result = await request('saved-query', { queryId: ref.queryId }) as { columns?: { referenceName?: unknown; name?: unknown }[]; workItems?: { id?: unknown }[]; workItemRelations?: { source?: { id?: unknown } | null; target?: { id?: unknown } | null }[] }
  if (!Array.isArray(result?.workItems) && !Array.isArray(result?.workItemRelations)) throw new Error('The saved query returned no work-item list. Check the query in Azure DevOps.')
  const listed = Array.isArray(result.workItems) ? result.workItems.map((entry) => entry.id) : (result.workItemRelations ?? []).flatMap((link) => [link.source?.id, link.target?.id]).filter((id) => id != null)
  const ids = [...new Set(listed)]
  if (ids.some((id) => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)) throw new Error('Unexpected query response. Nothing was read.')
  const more = ids.length > maxQueryRows
  const wantedIds = (ids as number[]).slice(0, maxQueryRows)
  const columns = (result.columns ?? []).flatMap((column) => typeof column.referenceName === 'string' && /^[\w.@-]{1,128}$/.test(column.referenceName) ? [{ ref: column.referenceName, name: typeof column.name === 'string' ? column.name.slice(0, 80) : '' }] : [])
  let info: Record<string, AzureFieldInfo> = {}
  try {
    const fields = await request('fields') as { value?: AzureFieldInfo[] }
    info = Object.fromEntries((fields.value ?? []).filter((field) => typeof field?.referenceName === 'string').map((field) => [field.referenceName, { referenceName: field.referenceName, ...(typeof field.name === 'string' ? { name: field.name } : {}), ...(typeof field.type === 'string' ? { type: field.type } : {}), ...(field.isPicklist === true ? { isPicklist: true } : {}), ...(field.isIdentity === true ? { isIdentity: true } : {}) }]))
  } catch { info = {} }
  const refs = (columns.length ? columns : defaultViewColumns.map((ref) => ({ ref, name: '' }))).slice(0, maxQueryColumns).map((column) => column.ref)
  const base = projectApiBase(config)
  const items: QueryItem[] = []
  for (let at = 0; at < wantedIds.length; at += 200) {
    const batch = wantedIds.slice(at, at + 200)
    const read = await request('items', { ids: batch }) as { value?: { id?: unknown; fields?: Record<string, unknown> }[] }
    if (!Array.isArray(read?.value)) throw new Error('Some work items could not be read. Nothing was shown.')
    const byId = new Map(read.value.filter((entry) => typeof entry?.id === 'number').map((entry) => [entry.id as number, entry.fields ?? {}]))
    for (const id of batch) {
      const fields = byId.get(id)
      if (!fields) continue // deleted or not readable since the query ran
      const byLower = new Map(Object.keys(fields).map((key) => [key.toLowerCase(), key]))
      items.push({ id, url: `${base}/_workitems/edit/${id}`, values: Object.fromEntries(refs.map((ref) => [ref, (lower(ref) === 'system.id' ? id : fields[ref] ?? fields[byLower.get(lower(ref)) ?? '']) as QueryValue])) })
    }
  }
  return { columns, items, more, info, readAt: now() }
}

// The saved queries of a project (Shared Queries and the viewer's My Queries, two folder levels deep), for the picker.
export interface SavedQueryEntry { id: string; name: string; path: string }
export async function listSavedQueries(config: Pick<AzureQueryRef, 'server' | 'project'>, pat: string, transport: AzureTransport = requestAzure): Promise<SavedQueryEntry[]> {
  const result = await transport({ ...queryConfig(config), pat: pat.trim(), operation: 'saved-queries' }) as { value?: unknown[] }
  const out: SavedQueryEntry[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const entry = node as { id?: unknown; name?: unknown; path?: unknown; isFolder?: unknown; children?: unknown[] }
    if (entry.isFolder !== true && typeof entry.id === 'string' && /^[0-9a-f-]{36}$/i.test(entry.id) && typeof entry.name === 'string') out.push({ id: entry.id.toLowerCase(), name: entry.name.slice(0, 200), path: typeof entry.path === 'string' ? entry.path.slice(0, 400) : entry.name })
    for (const child of Array.isArray(entry.children) ? entry.children : []) visit(child)
  }
  for (const node of Array.isArray(result?.value) ? result.value : []) visit(node)
  return out.sort((a, b) => byText(a.path, b.path)).slice(0, 1000)
}
