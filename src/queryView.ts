import { formatDate } from './format.ts'
import { csvCell } from './csv.ts'
import type { AzureWorkItem } from './domain'
import { releaseOf } from './releasePath.ts'

// Read-only views of a connection's query results: the columns are the query's own SELECT list, in its order, named
// as Azure DevOps names them; rows follow the query's ORDER BY. A query that selects only the ID (or a team backlog
// without a query) shows the default columns.
export interface QueryColumn { ref: string; name: string }
export interface QueryOrder { ref: string; desc: boolean }
export const defaultViewColumns = ['System.Id', 'System.WorkItemType', 'System.Title', 'System.State', 'System.AssignedTo', 'System.IterationPath']

// SELECT and ORDER BY entries are resolved against the project's field list (reference name → display name, read
// from the server): an entry may be a reference name in any letter case ("[system.title]"), a display name
// ("[Assigned To]") or written without brackets. Invisible characters picked up when a query is copied from mail or
// chat are ignored. Entries that resolve to nothing are reported, so the view can say which ones it could not show.
const invisible = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g
const refShape = /^[A-Za-z_]\w*(?:\.\w+)*$/
const splitList = (text: string) => text.split(',').map((part) => part.trim()).filter(Boolean)
const entryText = (part: string) => part.replace(/\s+(ASC|DESC)$/i, '').trim().replace(/^\[(.*)\]$/, '$1').trim()
// Common field names, used when the project's field list could not be read (e.g. an older server).
const commonNames: Record<string, string> = {
  id: 'System.Id', title: 'System.Title', state: 'System.State', reason: 'System.Reason', 'work item type': 'System.WorkItemType', 'assigned to': 'System.AssignedTo',
  'area path': 'System.AreaPath', 'iteration path': 'System.IterationPath', tags: 'System.Tags', 'changed date': 'System.ChangedDate', 'changed by': 'System.ChangedBy',
  'created date': 'System.CreatedDate', 'created by': 'System.CreatedBy', 'team project': 'System.TeamProject', description: 'System.Description', parent: 'System.Parent',
  priority: 'Microsoft.VSTS.Common.Priority', severity: 'Microsoft.VSTS.Common.Severity', 'closed date': 'Microsoft.VSTS.Common.ClosedDate', 'resolved date': 'Microsoft.VSTS.Common.ResolvedDate',
  'target date': 'Microsoft.VSTS.Scheduling.TargetDate', 'start date': 'Microsoft.VSTS.Scheduling.StartDate', 'original estimate': 'Microsoft.VSTS.Scheduling.OriginalEstimate',
  'completed work': 'Microsoft.VSTS.Scheduling.CompletedWork', 'remaining work': 'Microsoft.VSTS.Scheduling.RemainingWork', 'story points': 'Microsoft.VSTS.Scheduling.StoryPoints', effort: 'Microsoft.VSTS.Scheduling.Effort',
}
// An entry resolves, in order, to: a reference name of the project (any letter case), a field name of the project
// ("Title", "Assigned To"), a common field name, or — when it looks like one — a reference name as written.
function fieldResolver(names: Record<string, string>) {
  const byRef = new Map(Object.keys(names).map((ref) => [ref.toLowerCase(), ref]))
  const byName = new Map(Object.entries(names).map(([ref, name]) => [name.toLowerCase(), ref]))
  const common = (key: string) => commonNames[key] ? byRef.get(commonNames[key].toLowerCase()) ?? commonNames[key] : undefined
  // A bare name such as "SourceProgram" also finds the one field whose reference name ends with it
  // ("Custom.SourceProgram"); with none or several, it stays as written.
  const bySuffix = (key: string) => { const found = [...byRef.keys()].filter((ref) => ref.endsWith(`.${key}`)); return found.length === 1 ? byRef.get(found[0]) : undefined }
  return (part: string) => { const text = entryText(part); const key = text.toLowerCase(); return byRef.get(key) ?? byName.get(key) ?? common(key) ?? (key.includes('.') ? undefined : bySuffix(key)) ?? (refShape.test(text) ? text : undefined) }
}

export interface QueryLayout { columns: string[]; orderBy: QueryOrder[]; unresolved: string[] }
export function queryLayout(wiql?: string, names: Record<string, string> = {}): QueryLayout {
  const text = (wiql ?? '').replace(invisible, '').replace(/\s+/g, ' ').trim()
  const resolve = fieldResolver(names)
  const select = /^SELECT\s+(.+?)\s+FROM\s+WorkItem(?:s|Links)\b/i.exec(text)?.[1] ?? ''
  const entries = splitList(select)
  const unresolved = entries.filter((part) => !resolve(part)).map(entryText)
  const selected = [...new Set(entries.map(resolve).filter((ref): ref is string => Boolean(ref)))]
  const columns = selected.length > 1 || (selected.length === 1 && selected[0] !== 'System.Id') ? selected : defaultViewColumns
  // A tree / links query ends with MODE (…) after its ORDER BY.
  const order = /\sORDER\s+BY\s+(.+?)(?:\s+MODE\s*\([^)]*\))?$/i.exec(text)?.[1] ?? ''
  const orderBy = splitList(order).flatMap((part) => { const ref = resolve(part); return ref ? [{ ref, desc: /\bDESC$/i.test(part) }] : [] })
  return { columns, orderBy, unresolved }
}

// Field values kept for the view: identities become their display name, other values stay as Azure sends them.
export type FieldValue = string | number | boolean | null
export function pickFields(fields: Record<string, unknown>, refs: string[]): Record<string, FieldValue> {
  const picked: Record<string, FieldValue> = {}
  // Field keys come back in the server's spelling; a reference written in another letter case still finds its value.
  const byLower = new Map(Object.keys(fields).map((key) => [key.toLowerCase(), key]))
  // A column kept as a bare name ("SourceProgram") takes the one field whose reference name ends with it
  // ("Custom.SourceProgram"), e.g. when the project's field list could not be read.
  const suffixed = (ref: string) => { if (ref.includes('.')) return ''; const end = `.${ref.toLowerCase()}`; const found = [...byLower.keys()].filter((key) => key.endsWith(end)); return found.length === 1 ? byLower.get(found[0])! : '' }
  for (const ref of refs) {
    const value = fields[ref] ?? fields[byLower.get(ref.toLowerCase()) ?? ''] ?? fields[suffixed(ref)]
    if (value == null) continue
    if (typeof value === 'object') { const named = value as { displayName?: unknown; uniqueName?: unknown }; picked[ref] = typeof named.displayName === 'string' ? named.displayName : typeof named.uniqueName === 'string' ? named.uniqueName : JSON.stringify(value) }
    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') picked[ref] = value
  }
  return picked
}

// Standard fields come from the mapped work item, so cached items and team backlogs fill the default columns too.
const standard: Record<string, (item: AzureWorkItem) => FieldValue | undefined> = {
  'System.Id': (item) => item.id, 'System.Title': (item) => item.title, 'System.WorkItemType': (item) => item.workItemType,
  'System.State': (item) => item.state, 'System.AssignedTo': (item) => item.assignedTo, 'System.AreaPath': (item) => item.areaPath,
  'System.IterationPath': (item) => item.iterationPath, 'System.Tags': (item) => item.tags, 'System.ChangedDate': (item) => item.changedDate,
  'System.CreatedDate': (item) => item.createdDate, 'Microsoft.VSTS.Scheduling.TargetDate': (item) => item.targetDate, 'Microsoft.VSTS.Common.ClosedDate': (item) => item.closedDate,
}
// Virtual columns: the name and release read from the item's Area / Iteration Path (see releasePath).
export const releaseNameRef = '@Release.Name', releaseRef = '@Release'
standard[releaseNameRef] = (item) => releaseOf(item)?.name
standard[releaseRef] = (item) => releaseOf(item)?.release
// The view's columns with Name and Release added after the ID (or first) when any item has a release in its paths.
export function withReleaseColumns<T extends { ref: string }>(columns: T[], items: AzureWorkItem[], make: (ref: string) => T): T[] {
  if (!items.some((item) => releaseOf(item)) || columns.some((column) => column.ref === releaseRef)) return columns
  const at = columns.findIndex((column) => column.ref === 'System.Id') + 1
  return [...columns.slice(0, at), make(releaseNameRef), make(releaseRef), ...columns.slice(at)]
}
const standardByLower = new Map(Object.keys(standard).map((ref) => [ref.toLowerCase(), standard[ref]]))
export function cellValue(item: AzureWorkItem, ref: string): FieldValue | undefined {
  return item.fields?.[ref] ?? (standard[ref] ?? standardByLower.get(ref.toLowerCase()))?.(item)
}

const builtInNames: Record<string, string> = { [releaseNameRef]: 'Name', [releaseRef]: 'Release', 'System.Id': 'ID', 'System.WorkItemType': 'Work Item Type', 'System.AssignedTo': 'Assigned To', 'System.IterationPath': 'Iteration Path', 'System.AreaPath': 'Area Path', 'System.TeamProject': 'Team Project' }
// Column heading: Azure's field name when it was read, else a readable form of the reference name.
export function columnName(ref: string, names: Record<string, string> = {}) {
  return names[ref] ?? builtInNames[ref] ?? ref.split('.').pop()!.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
}

const isDate = (value: FieldValue | undefined): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
// Rich-text fields (Acceptance Criteria, Description, …) come as HTML: shown as their text, one line per paragraph,
// list item or line break joined with " · ", the tags removed and the entities decoded.
const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const looksLikeHtml = (value: string) => /<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i.test(value)
export function htmlToText(value: string) {
  return value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => { if (code[0] !== '#') return entities[code.toLowerCase()] ?? match; const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)); return Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match })
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ')
}
export function formatCell(value: FieldValue | undefined) {
  if (value == null || value === '') return ''
  if (isDate(value)) return formatDate(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string' && looksLikeHtml(value)) return htmlToText(value)
  return String(value)
}

const compare = (a: FieldValue | undefined, b: FieldValue | undefined) => {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1
  if (b == null || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}
export function sortItems(items: AzureWorkItem[], order: QueryOrder[]) {
  if (!order.length) return items
  return [...items].sort((a, b) => { for (const { ref, desc } of order) { const result = compare(cellValue(a, ref), cellValue(b, ref)); if (result) return desc ? -result : result } return 0 })
}

// Summary strip: counts by State, Work Item Type and Assigned To; overdue = open with a passed target date;
// changed in the last 7 days.
const closedStates = new Set(['closed', 'done', 'completed', 'resolved', 'removed', 'cut', 'approved'])
export function viewSummary(items: AzureWorkItem[], today: string) {
  const count = (key: (item: AzureWorkItem) => string) => [...items.reduce((map, item) => map.set(key(item) || '—', (map.get(key(item) || '—') ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10)
  return {
    total: items.length,
    byState: count((item) => item.state), byType: count((item) => item.workItemType), byPerson: count((item) => item.assignedTo || 'Unassigned'),
    overdue: items.filter((item) => item.targetDate && item.targetDate.slice(0, 10) < today && !closedStates.has(item.state.trim().toLowerCase())).length,
    changedThisWeek: items.filter((item) => item.changedDate && item.changedDate.slice(0, 10) >= weekAgo).length,
  }
}

// extra: a column that is not a field (DP: the board match, ref extraColumnRef), exported by its text where it stands.
export const extraColumnRef = '@extra'
export function viewCsv(items: AzureWorkItem[], columns: { ref: string; name: string }[], extra?: { text: (item: AzureWorkItem) => string }) {
  const text = (item: AzureWorkItem, ref: string) => ref === extraColumnRef ? extra?.text(item) ?? '' : formatCell(cellValue(item, ref))
  return [columns.map((column) => csvCell(column.name)).join(','), ...items.map((item) => columns.map((column) => csvCell(text(item, column.ref))).join(','))].join('\r\n')
}
// The column chooser of a query view: the columns not hidden, in the query's order (never none: with every column
// hidden, the first one stays), and the hidden ones remembered per view in this browser.
export const hiddenColumnsKey = (view: string) => `demand-planning-query-hidden-columns-v1:${view}`
export function visibleColumns<T extends { ref: string }>(columns: T[], hidden: string[]): T[] {
  const shown = columns.filter((column) => !hidden.includes(column.ref))
  return shown.length ? shown : columns.slice(0, 1)
}
// The column order of a query view, remembered per view in this browser: the saved order first; a column the saved
// order does not know (added to the query later) keeps its place after the column it follows in the query.
export const columnOrderKey = (view: string) => `demand-planning-query-column-order-v1:${view}`
export function orderColumns<T extends { ref: string }>(columns: T[], order: string[]): T[] {
  const byRef = new Map(columns.map((column) => [column.ref, column]))
  const result = [...new Set(order)].flatMap((ref) => byRef.get(ref) ?? [])
  columns.forEach((column, index) => {
    if (result.includes(column)) return
    const before = index > 0 ? result.indexOf(columns[index - 1]) : -1
    result.splice(before + 1, 0, column)
  })
  return result
}
// The order after moving one column to another's place (drag and drop) or one step left / right.
export function moveColumnTo(refs: string[], ref: string, target: string) {
  const from = refs.indexOf(ref), to = refs.indexOf(target)
  if (from < 0 || to < 0 || from === to) return refs
  const next = refs.filter((entry) => entry !== ref); next.splice(to, 0, ref); return next
}
export function moveColumnBy(refs: string[], ref: string, by: -1 | 1) {
  const at = refs.indexOf(ref), to = at + by
  return at < 0 || to < 0 || to >= refs.length ? refs : moveColumnTo(refs, ref, refs[to])
}
