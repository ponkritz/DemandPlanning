// LST-01…LST-14 Built-in lists: shared lists of names that the On-Demand table pages use as the choices of a column
// ("Dropdown (built-in list)", "Multi-select (built-in list)"). Two kinds, one catalog:
//  - team lists — the members of an Azure DevOps team (display names and Azure DevOps identity ids — never emails), kept in the Git data repository as
//    shared-lists.json and refreshed from Azure DevOps on demand (read only, with the viewer's own PAT): the owner sees
//    who is added, removed and renamed (the same identity id) before saving;
//  - Value lists — the manual lists of the Epic setup (epic-setup.json, EPS-02), offered as they are.
// The file is stored like the other shared setup: queued and merged (GIT-17), read strictly, newer data loaded quietly.
import { mergeKeyed, type Merge } from './gitSaveQueue.ts'
import { normalizeBaseUrl, isCloudBase, type AzureConfig } from './azureClient.ts'
import { writeBlockedReason, type Action } from './access.ts'
import { currentValue, hasOptions, listKeyPattern, listRefPattern, newId, valuesOf, type ListItem, type OnDemandPage } from './onDemand.ts'
import type { ValueList } from './epicSetup.ts'
import type { MenuLayout } from './menuLayout.ts'

export const sharedListsFile = 'shared-lists.json'
export const sharedListsKind = 'shared-lists'
export const maxLists = 50, maxItems = 1000, maxListName = 60, maxLog = 50, maxLogNames = 20
export interface TeamSource { kind: 'azure-team'; server: string; project: string; team: string }
export type ListAction = 'created' | 'refreshed' | 'edited'
// LST-05: one entry of a list's log — who, when, what (created, refreshed, edited) and the names added, removed and
// renamed ("old → new"), each list cut to 20 names.
export interface ListLogEntry { id: string; at: string; by: string; action: ListAction; added: string[]; removed: string[]; renamed: string[]; note?: string }
export interface SharedList { id: string; name: string; source: TeamSource; items: ListItem[]; createdBy: string; createdAt: string; refreshedAt?: string; refreshedBy?: string; log: ListLogEntry[] }
export interface SharedListsFile { schema: 1; kind: typeof sharedListsKind; lists: SharedList[] }
export const emptySharedLists = (): SharedListsFile => ({ schema: 1, kind: sharedListsKind, lists: [] })
export const listIdPattern = /^[a-z0-9-]{1,60}$/
export const teamRef = (id: string) => `team:${id}`
export const valuesRef = (id: string) => `values:${id}`

// ---- the file: strict reader, writer, merge (LST-02) ----
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''
// LST-04: who created, refreshed or changed a list — a display name only; an email is never written ("someone").
const who = (value: unknown, none = 'unknown') => { const text = clean(value, 200); return !text ? none : text.includes('@') ? 'someone' : text }
const isoTime = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : ''
const byName = (a: ListItem, b: ListItem) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.id ?? '').localeCompare(b.id ?? '')
// LST-04: the items as kept — a name (text, 120) and the Azure DevOps identity id when it is one (a GUID, lower case), each
// id once (two people with the same name stay two), each name without an id once; anything else (an email included) is
// left out; sorted by name; at most 1,000.
export function cleanItems(list: unknown): ListItem[] {
  const out: ListItem[] = [], ids = new Set<string>(), names = new Set<string>()
  for (const raw of Array.isArray(list) ? list : []) {
    const item = record(raw), name = clean(item?.name, 120)
    if (!name) continue
    const id = typeof item?.id === 'string' && listKeyPattern.test(item.id.trim()) ? item.id.trim().toLowerCase() : ''
    if (id ? ids.has(id) : names.has(name.toLowerCase())) continue
    if (id) ids.add(id); else names.add(name.toLowerCase())
    out.push({ name, ...(id ? { id } : {}) })
  }
  return out.sort(byName).slice(0, maxItems)
}
const names = (value: unknown) => Array.isArray(value) ? value.map((entry) => clean(entry, 250)).filter(Boolean).slice(0, maxLogNames) : []
function parseLog(list: unknown): ListLogEntry[] {
  const seen = new Set<string>()
  return (Array.isArray(list) ? list : []).flatMap((raw): ListLogEntry[] => {
    const entry = record(raw), at = isoTime(entry?.at), id = clean(entry?.id, 40)
    const action = entry?.action === 'created' || entry?.action === 'refreshed' || entry?.action === 'edited' ? entry.action : null
    if (!entry || !id || !/^[A-Za-z0-9][\w-]{0,39}$/.test(id) || seen.has(id) || !at || !action) return []
    seen.add(id)
    const note = clean(entry.note, 200)
    return [{ id, at, by: who(entry.by), action, added: names(entry.added), removed: names(entry.removed), renamed: names(entry.renamed), ...(note ? { note } : {}) }]
  }).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).slice(-maxLog)
}
// LST-03: a team source — an https server (dev.azure.com/<organization> or an Azure DevOps Server collection), a project
// and a team; anything else is refused.
export function cleanSource(raw: unknown): TeamSource | null {
  const source = record(raw)
  if (!source || source.kind !== 'azure-team') return null
  let server = ''
  try { server = normalizeBaseUrl(clean(source.server, 300)) } catch { return null }
  const project = clean(source.project, 120), team = clean(source.team, 120)
  return project && team ? { kind: 'azure-team', server, project, team } : null
}
// The strict reader: anything that is not the file, a list without a valid id, name or source, or a list twice, is
// refused as a whole with the reason (the lists in use stay as they were); items, logs and texts are cleaned.
export function parseSharedLists(source: string): SharedListsFile {
  let raw: unknown
  try { raw = JSON.parse(source) } catch { throw new Error(`${sharedListsFile} is not valid JSON.`) }
  const input = record(raw)
  if (!input || input.schema !== 1 || input.kind !== sharedListsKind || !Array.isArray(input.lists)) throw new Error(`${sharedListsFile} is not a shared lists file (schema 1, kind “${sharedListsKind}”, lists).`)
  if (input.lists.length > maxLists) throw new Error(`${sharedListsFile} holds more than ${maxLists} lists.`)
  const ids = new Set<string>(), taken = new Set<string>()
  const lists = input.lists.map((entry, index): SharedList => {
    const list = record(entry)
    const id = typeof list?.id === 'string' ? list.id : '', name = clean(list?.name, maxListName), source = cleanSource(list?.source)
    if (!list || !listIdPattern.test(id)) throw new Error(`${sharedListsFile}: list ${index + 1} has no valid id.`)
    if (!name) throw new Error(`${sharedListsFile}: the list ${id} has no name.`)
    if (!source) throw new Error(`${sharedListsFile}: the list “${name}” has no valid source (an https Azure DevOps server, a project and a team).`)
    if (ids.has(id) || taken.has(name.toLowerCase())) throw new Error(`${sharedListsFile}: the list “${name}” is there twice.`)
    ids.add(id); taken.add(name.toLowerCase())
    const refreshedAt = isoTime(list.refreshedAt), refreshedBy = who(list.refreshedBy, '')
    return { id, name, source, items: cleanItems(list.items), createdBy: who(list.createdBy), createdAt: isoTime(list.createdAt) || new Date(0).toISOString(), ...(refreshedAt ? { refreshedAt, ...(refreshedBy ? { refreshedBy } : {}) } : {}), log: parseLog(list.log) }
  })
  return { schema: 1, kind: sharedListsKind, lists }
}
const listOut = ({ id, name, source, items, createdBy, createdAt, refreshedAt, refreshedBy, log }: SharedList) => ({ id, name, source: { kind: source.kind, server: source.server, project: source.project, team: source.team }, items: items.map(({ name: label, id: key }) => ({ name: label, ...(key ? { id: key } : {}) })), createdBy, createdAt, ...(refreshedAt ? { refreshedAt } : {}), ...(refreshedBy ? { refreshedBy } : {}), log: log.map(({ id: entry, at, by, action, added, removed, renamed, note }) => ({ id: entry, at, by, action, added, removed, renamed, ...(note ? { note } : {}) })) })
export function serializeSharedLists(file: SharedListsFile): string {
  const lists = [...file.lists].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id))
  const out = `${JSON.stringify({ schema: 1, kind: sharedListsKind, lists: lists.map(listOut) }, null, 1)}\n`
  parseSharedLists(out)
  return out
}
const safeParse = (text: string | null) => { if (!text) return null; try { return parseSharedLists(text) } catch { return null } }

const listsCacheKey = (scope: string) => `demand-planning-shared-lists-v2:${scope}`
export function readSharedListsCache(scope: string, storage?: Pick<Storage, 'getItem'>): SharedListsFile | null {
  if (!scope) return null
  try { return safeParse((storage ?? localStorage).getItem(listsCacheKey(scope))) } catch { return null }
}
export function writeSharedListsCache(scope: string, text: string | null, storage?: Pick<Storage, 'setItem' | 'removeItem'>) {
  if (!scope) return
  try {
    const target = storage ?? localStorage
    const key = listsCacheKey(scope)
    if (text == null) target.removeItem(key)
    else target.setItem(key, text)
  } catch { /* this visit only */ }
}

// GIT-17: two saves meanwhile — the lists by id (a list only one save changed takes that change; one both changed takes
// the later save's; a list one removed and the other changed: the change wins), and each list's log the union of both
// logs by entry id, so no refresh is lost from the log. A merge that is not a valid file keeps the later save.
export const mergeSharedListsText: Merge = (baseText, mineText, theirsText, mineLater) => {
  const base = safeParse(baseText), mine = safeParse(mineText), theirs = safeParse(theirsText)
  if (!mine || !theirs) return mineText
  const byId = (file: SharedListsFile | null) => file ? Object.fromEntries(file.lists.map((list) => [list.id, list])) : null
  const merged = mergeKeyed(byId(base), byId(mine)!, byId(theirs)!, mineLater)
  const logOf = (id: string) => { const all = [...(byId(theirs)![id]?.log ?? []), ...(byId(mine)![id]?.log ?? [])]; return all.filter((entry, index) => all.findIndex((other) => other.id === entry.id) === index).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).slice(-maxLog) }
  try { return serializeSharedLists({ schema: 1, kind: sharedListsKind, lists: Object.values(merged).map((list) => ({ ...list, log: logOf(list.id) })) }) } catch { return mineLater ? mineText : theirsText }
}

// ---- refresh: what changes (LST-06) ----
export interface ListDiff { added: ListItem[]; removed: ListItem[]; renamed: { from: string; to: string; id: string }[]; kept: number }
// The members read from Azure DevOps against the list: a person with an identity id is the same person by that id (a new
// name is a rename); without one, by name.
export function diffItems(before: ListItem[], after: ListItem[]): ListDiff {
  const keyOf = (item: ListItem) => item.id ? `i:${item.id.toLowerCase()}` : `n:${item.name.toLowerCase()}`
  const old = new Map(before.map((item) => [keyOf(item), item])), next = new Map(after.map((item) => [keyOf(item), item]))
  const diff: ListDiff = { added: [], removed: [], renamed: [], kept: 0 }
  for (const [key, item] of next) {
    const was = old.get(key)
    if (!was) diff.added.push(item)
    else if (was.name !== item.name) diff.renamed.push({ from: was.name, to: item.name, id: item.id ?? '' })
    else diff.kept++
  }
  for (const [key, item] of old) if (!next.has(key)) diff.removed.push(item)
  return { added: diff.added.sort(byName), removed: diff.removed.sort(byName), renamed: diff.renamed.sort((a, b) => a.to.localeCompare(b.to)), kept: diff.kept }
}
export const diffEmpty = (diff: ListDiff) => !diff.added.length && !diff.removed.length && !diff.renamed.length
export interface ListEdit { by: string; random?: () => number; now?: () => number }
const logEntry = (action: ListAction, diff: ListDiff | null, edit: ListEdit, note = ''): ListLogEntry => {
  const { random = Math.random, now = Date.now } = edit
  return { id: newId('l', random, now), at: new Date(now()).toISOString(), by: who(edit.by), action, added: (diff?.added ?? []).map((item) => item.name).slice(0, maxLogNames), removed: (diff?.removed ?? []).map((item) => item.name).slice(0, maxLogNames), renamed: (diff?.renamed ?? []).map((entry) => `${entry.from} → ${entry.to}`).slice(0, maxLogNames), ...(note ? { note: note.slice(0, 200) } : {}) }
}
// LST-06: the list with the members read — its items replaced, when and by whom, and one log entry.
export function refreshList(list: SharedList, members: ListItem[], edit: ListEdit): SharedList {
  const items = cleanItems(members)
  const entry = logEntry('refreshed', diffItems(list.items, items), edit)
  return { ...list, items, refreshedAt: entry.at, refreshedBy: entry.by, log: [...list.log, entry].slice(-maxLog) }
}
// A list id from its name: lower case, letters, digits and hyphens; a taken one gets -2, -3 …
export function newListId(name: string, taken: string[]) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'list'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}
// LST-03, LST-06: a new list from its name, source and the members read (its first log entry "created").
export function createList(file: SharedListsFile, input: { name: string; source: TeamSource; members: ListItem[] }, edit: ListEdit): SharedList {
  const name = clean(input.name, maxListName)
  const problem = listNameProblem(file, name)
  if (problem) throw new Error(problem)
  const items = cleanItems(input.members)
  const entry = logEntry('created', diffItems([], items), edit)
  return { id: newListId(name, file.lists.map((list) => list.id)), name, source: input.source, items, createdBy: entry.by, createdAt: entry.at, refreshedAt: entry.at, refreshedBy: entry.by, log: [entry] }
}
export function listNameProblem(file: SharedListsFile, name: string, id = '') {
  const value = clean(name, maxListName)
  if (!value) return 'Give the list a name.'
  if (file.lists.some((list) => list.id !== id && list.name.toLowerCase() === value.toLowerCase())) return `A list named “${value}” exists.`
  if (!id && file.lists.length >= maxLists) return `At most ${maxLists} lists.`
  return ''
}
// LST-07: a list renamed or given another source (a log entry "edited" names what changed; Refresh reads the new team).
export function editList(list: SharedList, change: { name: string; source: TeamSource }, edit: ListEdit): SharedList {
  const name = clean(change.name, maxListName)
  const what = [name !== list.name ? `renamed from “${list.name}”` : '', sourceLabel(change.source) !== sourceLabel(list.source) ? `source was ${sourceLabel(list.source)}` : ''].filter(Boolean).join('; ')
  if (!what) return list
  return { ...list, name, source: change.source, log: [...list.log, logEntry('edited', null, edit, what)].slice(-maxLog) }
}
export const upsertSharedList = (file: SharedListsFile, list: SharedList): SharedListsFile => ({ ...file, lists: [...file.lists.filter((entry) => entry.id !== list.id), list] })
export const sourceLabel = (source: TeamSource) => `${source.server.replace(/^https:\/\//, '')} · ${source.project} · ${source.team}`

// LST-06: the Azure DevOps connection a source is read with — the server's organization (dev.azure.com) or collection URL.
export function sourceConfig(source: TeamSource): AzureConfig {
  const server = normalizeBaseUrl(source.server)
  const segment = decodeURIComponent(new URL(server).pathname.split('/').filter(Boolean).at(-1) ?? '') || new URL(server).hostname
  return isCloudBase(server) ? { organization: segment, project: source.project, team: source.team } : { organization: segment, project: source.project, team: source.team, baseUrl: server }
}
// The key of the server's PAT in this browser (one PAT per server, azureCredentials.serverKey).
export const serverPatKey = (server: string) => server.replace(/\/+$/, '').toLowerCase()

// ---- the catalog: what a column can use (LST-08) ----
export interface CatalogEntry { ref: string; name: string; kind: 'team' | 'values'; items: ListItem[]; detail: string }
// LST-15: the names a column shows for a team list — the display name, and for two or more members with the same display
// name "Name (#3f2a)": the first 4 characters of their identity id (more when those are the same too), so each person has
// a choice of their own that does not change when the team changes (an opaque hint, no email). The label is what a row
// stores and shows; the key is the id.
export function labelledItems(items: ListItem[]): ListItem[] {
  const count = new Map<string, number>()
  for (const item of items) count.set(item.name.toLowerCase(), (count.get(item.name.toLowerCase()) ?? 0) + 1)
  return items.map((item) => {
    if ((count.get(item.name.toLowerCase()) ?? 0) < 2 || !item.id) return item
    const twins = items.filter((other) => other !== item && other.name.toLowerCase() === item.name.toLowerCase() && other.id).map((other) => other.id!.replace(/-/g, ''))
    const own = item.id.replace(/-/g, '')
    let size = 4
    while (size < own.length && twins.some((other) => other.slice(0, size) === own.slice(0, size))) size++
    return { ...item, name: `${item.name} (#${own.slice(0, size)})` }
  })
}
export function listCatalog(file: SharedListsFile | null, valueLists: ValueList[] = []): CatalogEntry[] {
  return [
    ...(file?.lists ?? []).map((list): CatalogEntry => ({ ref: teamRef(list.id), name: list.name, kind: 'team', items: labelledItems(list.items), detail: `Azure DevOps team ${list.source.team} · ${list.items.length} ${list.items.length === 1 ? 'person' : 'people'}` })),
    ...valueLists.map((list): CatalogEntry => ({ ref: valuesRef(list.id), name: list.name, kind: 'values', items: list.values.map((value) => ({ name: value })), detail: `Value list · ${list.values.length} ${list.values.length === 1 ? 'value' : 'values'}` })),
  ].filter((entry) => listRefPattern.test(entry.ref)).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.ref.localeCompare(b.ref))
}
// LST-08: the page with its built-in list columns' items attached (for a change: the keys of the values saved, LST-09) —
// nothing else of the page changes, so a save writes only what was changed.
export function attachLists(page: OnDemandPage, catalog: Map<string, CatalogEntry>): OnDemandPage {
  if (!page.columns.some((column) => column.list)) return page
  return { ...page, columns: page.columns.map((column) => { const entry = column.list && hasOptions(column.type) ? catalog.get(column.list) : undefined; return entry ? { ...column, items: entry.items } : column }) }
}
// LST-08, LST-09, LST-11: the page as shown — a built-in list column's choices are the list's names now (its options as
// last saved when the list is not found, marked), and each value with a key shows the name the list has now for it.
export function resolveLists(page: OnDemandPage, catalog: Map<string, CatalogEntry>): OnDemandPage {
  if (!page.columns.some((column) => column.list)) return page
  const columns = page.columns.map((column) => {
    if (!column.list || !hasOptions(column.type)) return column
    const entry = catalog.get(column.list)
    return entry ? { ...column, options: [...new Set(entry.items.map((item) => item.name))], items: entry.items } : { ...column, listMissing: true }
  })
  const listed = columns.filter((column) => column.items?.some((item) => item.id))
  const rows = listed.length ? page.rows.map((row) => {
    if (!row.refs) return row
    let cells = row.cells
    for (const column of listed) { const value = currentValue(column, row); if (value !== row.cells[column.id]) cells = { ...cells, [column.id]: value! } }
    return cells === row.cells ? row : { ...row, cells }
  }) : page.rows
  return { ...page, columns, rows }
}
// LST-13: the columns that use a list, on the pages read ("Page: Column").
export const listUsage = (pages: OnDemandPage[], ref: string) => pages.flatMap((page) => page.columns.filter((column) => column.list === ref).map((column) => `${page.name}: ${column.name}`))
// LST-11: how many values of a column the list no longer has (removed people, kept and marked).
export const notInList = (page: OnDemandPage, columnId: string) => { const column = page.columns.find((entry) => entry.id === columnId); return column ? page.rows.filter((row) => valuesOf(row.cells[columnId]).some((value) => !column.options.includes(value))).length : 0 }

// ---- who may change the lists (CON-115, LST-12) ----
// lists.manage (Tool Owner, Admin, Scrum Master by default) creates, refreshes, edits and removes every list; a co-owner
// of an On-Demand page or of a group that takes added pages (PGB-08, menu-layout.json) creates, refreshes and edits
// lists too — their pages need them — but does not remove one (it may be in use on pages they do not own).
export interface ListsViewer { email: string; viewingAs: string; readOnly: boolean; can: (action: Action) => boolean }
export interface ListsGit { connected: boolean; readOnly: boolean; isSample: boolean }
export function ownsAPage(layout: MenuLayout | null | undefined, email: string) {
  const me = email.trim().toLowerCase()
  if (!layout || !me) return false
  return Object.values(layout.pages).some((page) => page.owners.includes(me)) || Object.values(layout.groups).some((group) => group.acceptsPages && group.owners.includes(me))
}
function stateBlock(git: ListsGit, state: { loaded: boolean; error: string }) {
  if (git.isSample) return 'Synthetic sample data is loaded: the built-in lists are not saved to Git. Fetch your data first.'
  if (!git.connected) return 'Connect Git storage (Admin → Data & sharing) to change the built-in lists; they are shared through Git.'
  if (git.readOnly) return 'View only: your Git token can read but not save.'
  if (state.error) return `${sharedListsFile} could not be read from Git, so the lists cannot be changed here: ${state.error}`
  if (!state.loaded) return 'The built-in lists are still being read from Git.'
  return ''
}
// Why the viewer cannot create, refresh or edit lists ('' when they can).
export function listsBlock(viewer: ListsViewer, owner: boolean, git: ListsGit, state: { loaded: boolean; error: string }): string {
  if (viewer.viewingAs) return `Read only while viewing as ${viewer.viewingAs}: nothing is saved to Git. Exit View as to change the built-in lists.`
  if (viewer.readOnly) return writeBlockedReason(true, ['lists.manage'], 'in the built-in lists')
  if (!viewer.can('lists.manage') && !owner) return `${writeBlockedReason(false, ['lists.manage'])} Co-owners of an On-Demand page can create and refresh lists too.`
  return stateBlock(git, state)
}
// Why the viewer cannot remove a list ('' when they can): lists.manage only, and never a list a column uses.
export function removeListBlock(viewer: ListsViewer, git: ListsGit, state: { loaded: boolean; error: string }, usedBy: string[]): string {
  if (viewer.viewingAs) return `Read only while viewing as ${viewer.viewingAs}.`
  if (viewer.readOnly) return writeBlockedReason(true, ['lists.manage'], 'in the built-in lists')
  if (!viewer.can('lists.manage')) return `${writeBlockedReason(false, ['lists.manage'])} A page co-owner cannot remove a list: it may be used on other pages.`
  if (usedBy.length) return `Used by ${usedBy.join(', ')}: change ${usedBy.length === 1 ? 'that column' : 'those columns'} first.`
  return stateBlock(git, state)
}
