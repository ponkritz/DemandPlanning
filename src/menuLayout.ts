import { isEmail, normalEmail, type Action } from './access.ts'
import { merge3 } from './gitSaveQueue.ts'
import { pageGroups } from './pages/registry.ts'

// PGB-01…PGB-14 Page builder: pages a Tool Owner (or a group's co-owner) adds without a release of the tool, each of a
// page type, placed in any menu group that accepts added pages or in a group of their own. The menu layout is one shared
// file in the Git data repository, menu-layout.json next to the planning data (not in on-demand/, where every file is a
// page): the custom groups (name, order), each group's settings (accepts added pages, co-owners — built-in groups too)
// and each page's placement (group, order, icon, type, co-owners). The pages' tables stay in on-demand/<page-id>.json.

// PGB-01: the page types: Table, Table + Insights and (DSH-01) On-Demand Dashboard; a Release page for a new stream is a later kind
// (a new key here, its own page component), so a file naming a kind this build does not know keeps it as written and
// shows the page as Table + Insights.
export type PageKind = 'table' | 'table-insights' | 'dashboard'
export const pageKinds: { key: PageKind; label: string; detail: string }[] = [
  { key: 'table', label: 'Table', detail: 'A table the team sets up itself: columns, rows, search, export.' },
  { key: 'table-insights', label: 'Table + Insights', detail: 'The same table with an Insights tab of charts and summary tables from its rows.' },
  { key: 'dashboard', label: 'On-Demand Dashboard', detail: 'Read only: KPI tiles, charts and summary tables over the rows of table pages, with a period filter.' },
]
export const kindLabel = (kind: string) => pageKinds.find((entry) => entry.key === kind)?.label ?? 'Table + Insights'
export const defaultKind: PageKind = 'table-insights'

// PGB-05: a small fixed set of icons (one symbol each, as the built-in pages have).
export const pageIcons: { icon: string; label: string }[] = [
  { icon: '▦', label: 'Table' }, { icon: '▤', label: 'List' }, { icon: '◫', label: 'Board' }, { icon: '◉', label: 'Target' },
  { icon: '◇', label: 'Diamond' }, { icon: '◈', label: 'Gem' }, { icon: '◎', label: 'Ring' }, { icon: '◔', label: 'Gauge' },
  { icon: '⚑', label: 'Flag' }, { icon: '★', label: 'Star' }, { icon: '✎', label: 'Pencil' }, { icon: '☰', label: 'Lines' },
]
export const defaultIcon = '▦'

export const menuLayoutFile = 'menu-layout.json'
export const onDemandGroup = 'on-demand'
export const maxGroups = 30, maxOwners = 50, maxGroupName = 40, maxLayoutPages = 300
const slug = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
// The built-in groups of the menu (Settings aside: the Admin pages are not configurable), by a fixed id.
export const builtInGroups = pageGroups.filter((name) => name !== 'Settings').map((name) => ({ id: slug(name), name: name as string }))
export const builtInGroupOf = (name: string) => builtInGroups.find((group) => group.name === name)?.id ?? ''
const customIdPattern = /^g-[a-z0-9][a-z0-9-]{0,37}$/
const pageIdPattern = /^[a-z0-9][a-z0-9-]{0,39}$/

// What the file keeps. A built-in group has no name or order (the menu fixes them); a custom one has both.
export interface GroupSettings { name?: string; order?: number; acceptsPages: boolean; owners: string[] }
// PGB-19: hidden — the page is hidden from the menu, Home and search for everyone (its files stay in Git).
// TVL-25: ownersFromList — the co-owners of the page that were written there from the Tool Validations list's co-owners
// (the page is a tab of Tool Validations), a subset of owners; the others were added by hand. Only these are removed again
// when they leave the list.
export interface Placement { type: string; group: string; order: number; icon: string; owners: string[]; hidden?: boolean; ownersFromList?: string[] }
export interface MenuLayout { schema: 1; kind: 'menu-layout'; groups: Record<string, GroupSettings>; pages: Record<string, Placement> }
export const emptyLayout = (): MenuLayout => ({ schema: 1, kind: 'menu-layout', groups: {}, pages: {} })

// A group as the menu shows it.
export interface MenuGroup { id: string; name: string; builtIn: boolean; order: number; acceptsPages: boolean; owners: string[] }

const cleanName = (name: string, max = maxGroupName) => name.trim().replace(/\s+/g, ' ').slice(0, max)
// PGB-08: co-owners are work emails, lower case, each once, at most 50.
export function ownersOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\s,;]+/) : []
  return [...new Set(list.filter((entry): entry is string => typeof entry === 'string' && isEmail(entry)).map(normalEmail))].slice(0, maxOwners)
}
// The emails typed in a co-owners field, with the ones that are not emails named (PGB-08).
export function ownersInput(text: string): { owners: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean)
  const invalid = parts.filter((part) => !isEmail(part))
  return { owners: ownersOf(parts), invalid }
}
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100000, Math.round(value))) : undefined

// ---- the file (PGB-03) ----
// Read and validated: anything that is not a menu layout is refused (shown as an error, the last layout kept); unknown
// groups, bad ids and emails are dropped; a custom group without a name is dropped; a page's unknown icon becomes the
// default; its type is kept as written (a later kind) and shown as Table + Insights by this build.
export function parseMenuLayout(raw: string): MenuLayout {
  let data: unknown
  try { data = JSON.parse(raw) } catch { throw new Error(`${menuLayoutFile} is not valid JSON.`) }
  const file = data as Partial<Record<keyof MenuLayout, unknown>> | null
  if (!file || typeof file !== 'object' || Array.isArray(file) || file.kind !== 'menu-layout' || file.schema !== 1) throw new Error(`${menuLayoutFile} is not a menu layout (schema 1, kind menu-layout).`)
  const record = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Record<string, unknown> | null> : {}
  const groups: Record<string, GroupSettings> = {}
  for (const [id, entry] of Object.entries(record(file.groups))) {
    if (!entry || typeof entry !== 'object') continue
    const builtIn = builtInGroups.some((group) => group.id === id)
    if (!builtIn && !customIdPattern.test(id)) continue
    const name = typeof entry.name === 'string' ? cleanName(entry.name) : ''
    if (!builtIn && !name) continue
    if (!builtIn && Object.values(groups).filter((group) => group.name != null).length >= maxGroups) continue
    groups[id] = { ...(builtIn ? {} : { name, order: number(entry.order) ?? 0 }), acceptsPages: builtIn ? entry.acceptsPages === true || (entry.acceptsPages == null && id === onDemandGroup) : entry.acceptsPages !== false, owners: ownersOf(entry.owners) }
  }
  const pages: Record<string, Placement> = {}
  for (const [id, entry] of Object.entries(record(file.pages))) {
    if (!entry || typeof entry !== 'object' || !pageIdPattern.test(id) || Object.keys(pages).length >= maxLayoutPages) continue
    const type = typeof entry.type === 'string' && /^[a-z][a-z-]{0,29}$/.test(entry.type) ? entry.type : defaultKind
    const group = typeof entry.group === 'string' && (customIdPattern.test(entry.group) || builtInGroups.some((item) => item.id === entry.group)) ? entry.group : onDemandGroup
    const icon = pageIcons.some((item) => item.icon === entry.icon) ? entry.icon as string : defaultIcon
    const owners = ownersOf(entry.owners)
    pages[id] = { type, group, order: number(entry.order) ?? 0, icon, owners, ...(entry.hidden === true ? { hidden: true } : {}), ...fromList(owners, entry.ownersFromList) }
  }
  return { schema: 1, kind: 'menu-layout', groups, pages }
}
// TVL-25: the owners written from the Tool Validations list — only those still among the page's owners, written only when
// there are some (a layout without them stays byte for byte as before).
function fromList(owners: string[], value: unknown): { ownersFromList?: string[] } {
  const listed = ownersOf(value).filter((email) => owners.includes(email))
  return listed.length ? { ownersFromList: listed } : {}
}
// Groups and pages in id order, so two saves of the same layout are the same text.
export function serializeMenuLayout(layout: MenuLayout) {
  const sortedKeys = <T>(entries: Record<string, T>) => Object.fromEntries(Object.keys(entries).sort().map((key) => [key, entries[key]]))
  const groups = sortedKeys(Object.fromEntries(Object.entries(layout.groups).map(([id, group]) => [id, { ...(group.name != null ? { name: group.name, order: group.order ?? 0 } : {}), acceptsPages: group.acceptsPages, owners: group.owners }])))
  const pages = sortedKeys(Object.fromEntries(Object.entries(layout.pages).map(([id, page]) => [id, { type: page.type, group: page.group, order: page.order, icon: page.icon, owners: page.owners, ...(page.hidden ? { hidden: true } : {}), ...fromList(page.owners, page.ownersFromList) }])))
  return `${JSON.stringify({ schema: 1, kind: 'menu-layout', groups, pages }, null, 2)}\n`
}

// ---- reading the layout (PGB-02, PGB-04) ----
const builtInSettings = (layout: MenuLayout, id: string): GroupSettings => layout.groups[id] ?? { acceptsPages: id === onDemandGroup, owners: [] }
// Every group of the menu in menu order: the built-in ones as the menu has them, then the custom ones by their order.
export function menuGroups(layout: MenuLayout): MenuGroup[] {
  const builtIn = builtInGroups.map((group, index) => { const settings = builtInSettings(layout, group.id); return { id: group.id, name: group.name, builtIn: true, order: index, acceptsPages: settings.acceptsPages, owners: settings.owners } })
  const custom = Object.entries(layout.groups).filter(([id, group]) => customIdPattern.test(id) && group.name).map(([id, group]) => ({ id, name: group.name!, builtIn: false, order: group.order ?? 0, acceptsPages: group.acceptsPages, owners: group.owners }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  return [...builtIn, ...custom]
}
export const findGroup = (layout: MenuLayout, id: string) => menuGroups(layout).find((group) => group.id === id)
// PGB-04: a page's placement; a page without one (CoNQ and the pages added before the page builder) is a Table + Insights
// page in On-Demand, in name order after the placed ones. A page whose group no longer exists falls back to On-Demand.
export function placementOf(layout: MenuLayout, pageId: string): Placement & { placed: boolean } {
  const placed = layout.pages[pageId]
  const base = placed ?? { type: defaultKind, group: onDemandGroup, order: Number.MAX_SAFE_INTEGER, icon: defaultIcon, owners: [] }
  return { ...base, group: findGroup(layout, base.group) ? base.group : onDemandGroup, placed: Boolean(placed) }
}
export const kindOf = (layout: MenuLayout, pageId: string): PageKind => { const type = placementOf(layout, pageId).type; return type === 'table' || type === 'dashboard' ? type : 'table-insights' }
// DSH-01: an On-Demand Dashboard page holds no rows; it is never a data source of another dashboard.
export const isDashboard = (layout: MenuLayout, pageId: string) => layout.pages[pageId]?.type === 'dashboard'
// The pages of a group in menu order: by their order, then by name.
export function pagesOfGroup<T extends { id: string; name: string }>(layout: MenuLayout, pages: T[], groupId: string): T[] {
  return pages.filter((page) => placementOf(layout, page.id).group === groupId)
    .sort((a, b) => placementOf(layout, a.id).order - placementOf(layout, b.id).order || a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id))
}

// ---- changing the layout (PGB-05…PGB-07) ----
const names = (layout: MenuLayout) => menuGroups(layout).map((group) => group.name.toLowerCase())
export function groupNameError(layout: MenuLayout, name: string, except = '') {
  const value = cleanName(name)
  if (!value) return 'Give the group a name.'
  if (menuGroups(layout).some((group) => group.id !== except && group.name.toLowerCase() === value.toLowerCase())) return `There is already a group named “${value}”.`
  if (name.trim().length > maxGroupName) return `A group name has at most ${maxGroupName} characters.`
  return ''
}
export function addGroup(layout: MenuLayout, name: string, settings: Partial<GroupSettings> = {}): { layout: MenuLayout; id: string } {
  const problem = groupNameError(layout, name)
  if (problem) throw new Error(problem)
  if (menuGroups(layout).filter((group) => !group.builtIn).length >= maxGroups) throw new Error(`At most ${maxGroups} groups of your own.`)
  const base = `g-${slug(name).slice(0, 30) || 'group'}`
  let id = base
  for (let n = 2; layout.groups[id] || names(layout).includes(id); n++) id = `${base}-${n}`
  const order = Math.max(0, ...menuGroups(layout).filter((group) => !group.builtIn).map((group) => group.order)) + 1
  return { id, layout: { ...layout, groups: { ...layout.groups, [id]: { name: cleanName(name), order, acceptsPages: settings.acceptsPages ?? true, owners: ownersOf(settings.owners ?? []) } } } }
}
export function renameGroup(layout: MenuLayout, id: string, name: string): MenuLayout {
  const group = layout.groups[id]
  if (!group?.name) throw new Error('A built-in group cannot be renamed.')
  const problem = groupNameError(layout, name, id)
  if (problem) throw new Error(problem)
  return { ...layout, groups: { ...layout.groups, [id]: { ...group, name: cleanName(name) } } }
}
export function setGroupSettings(layout: MenuLayout, id: string, settings: { acceptsPages: boolean; owners: string[] }): MenuLayout {
  const group = findGroup(layout, id)
  if (!group) throw new Error('That group is no longer in the menu.')
  const current = layout.groups[id] ?? { acceptsPages: group.acceptsPages, owners: group.owners }
  return { ...layout, groups: { ...layout.groups, [id]: { ...current, acceptsPages: settings.acceptsPages, owners: ownersOf(settings.owners) } } }
}
// Custom groups move among themselves (↑ ↓); their orders are written 1…n.
export function moveGroup(layout: MenuLayout, id: string, by: -1 | 1): MenuLayout {
  const custom = menuGroups(layout).filter((group) => !group.builtIn).map((group) => group.id)
  const from = custom.indexOf(id), to = from + by
  if (from < 0 || to < 0 || to >= custom.length) return layout
  const order = [...custom]; order.splice(from, 1); order.splice(to, 0, id)
  return { ...layout, groups: { ...layout.groups, ...Object.fromEntries(order.map((key, index) => [key, { ...layout.groups[key], order: index + 1 }])) } }
}
// PGB-06: only an empty custom group can be removed (its pages moved or removed first).
export function removeGroupReason(layout: MenuLayout, id: string, pageIds: string[]) {
  const group = findGroup(layout, id)
  if (!group) return 'That group is no longer in the menu.'
  if (group.builtIn) return 'A built-in group cannot be removed; it can only be configured.'
  const held = pageIds.filter((page) => placementOf(layout, page).group === id).length
  return held ? `Move or remove its ${held} page${held === 1 ? '' : 's'} first: only an empty group can be removed.` : ''
}
export function removeGroup(layout: MenuLayout, id: string, pageIds: string[]): MenuLayout {
  const problem = removeGroupReason(layout, id, pageIds)
  if (problem) throw new Error(problem)
  const groups = { ...layout.groups }; delete groups[id]
  return { ...layout, groups }
}
// A page placed in a group: last in it unless an order is given.
export function placePage(layout: MenuLayout, pageId: string, placement: Partial<Placement>, pageIds: string[] = []): MenuLayout {
  const current = placementOf(layout, pageId)
  const group = placement.group ?? current.group
  if (!findGroup(layout, group)) throw new Error('That group is no longer in the menu.')
  const moved = group !== current.group || !current.placed
  const others = pageIds.filter((id) => id !== pageId && placementOf(layout, id).group === group).map((id) => placementOf(layout, id).order).filter((order) => order < Number.MAX_SAFE_INTEGER)
  const order = placement.order ?? (moved ? Math.max(0, ...others) + 1 : current.order)
  const owners = ownersOf(placement.owners ?? current.owners)
  return { ...layout, pages: { ...layout.pages, [pageId]: { type: placement.type ?? current.type, group, order, icon: placement.icon ?? current.icon, owners, ...((placement.hidden ?? current.hidden) ? { hidden: true } : {}), ...fromList(owners, placement.ownersFromList ?? current.ownersFromList) } } }
}
// Reorder within a group (↑ ↓): the group's pages get orders 1…n, so pages never placed before are placed too.
export function movePage<T extends { id: string; name: string }>(layout: MenuLayout, pages: T[], pageId: string, by: -1 | 1): MenuLayout {
  const group = placementOf(layout, pageId).group
  const ids = pagesOfGroup(layout, pages, group).map((page) => page.id)
  const from = ids.indexOf(pageId), to = from + by
  if (from < 0 || to < 0 || to >= ids.length) return layout
  ids.splice(from, 1); ids.splice(to, 0, pageId)
  return { ...layout, pages: { ...layout.pages, ...Object.fromEntries(ids.map((id, index) => { const current = placementOf(layout, id); return [id, { type: current.type, group, order: index + 1, icon: current.icon, owners: current.owners, ...(current.hidden ? { hidden: true } : {}), ...fromList(current.owners, current.ownersFromList) }] })) } }
}
// PGB-19: hide or show a page (a field of its placement, merged like the others, GIT-17).
export const setHidden = (layout: MenuLayout, pageId: string, hidden: boolean, pageIds: string[] = []): MenuLayout => placePage(layout, pageId, { hidden }, pageIds)
export const isHidden = (layout: MenuLayout, pageId: string) => layout.pages[pageId]?.hidden === true
// TVL-25: the co-owners of the Tool Validations list written to a page that is one of its tabs. The owners added by hand
// (those not in ownersFromList) are never touched; the owners this sync wrote before and that left the list are removed;
// the list's co-owners not yet on the page are added and remembered in ownersFromList. An owner who was on the page by
// hand before the list named them stays an owner added by hand. listOwners [] takes back every owner the list wrote (the
// page is no longer a tab). A page without a placement is left as it is.
export function withListOwners(layout: MenuLayout, pageId: string, listOwners: string[]): MenuLayout {
  const current = layout.pages[pageId]
  if (!current) return layout
  const before = current.ownersFromList ?? []
  const byHand = current.owners.filter((email) => !before.includes(email))
  const wanted = ownersOf(listOwners).filter((email) => !byHand.includes(email))
  const owners = ownersOf([...current.owners.filter((email) => byHand.includes(email) || wanted.includes(email)), ...wanted])
  const next: Placement = { ...current, owners }
  delete next.ownersFromList
  Object.assign(next, fromList(owners, wanted))
  return { ...layout, pages: { ...layout.pages, [pageId]: next } }
}
export function removePlacement(layout: MenuLayout, pageId: string): MenuLayout {
  if (!layout.pages[pageId]) return layout
  const pages = { ...layout.pages }; delete pages[pageId]
  return { ...layout, pages }
}

// Where a Git change of the menu cannot be made (the same reasons as on the pages, OND-07), PGB-12.
export function gitReasonOf(git: { connected: boolean; readOnly: boolean; isSample: boolean }) {
  return !git.connected ? 'Connect Git storage (Admin → Data & history) to change the pages and the menu; they are shared through Git.' : git.readOnly ? 'View only: your Git token can read but not save.' : git.isSample ? 'Synthetic sample data is loaded. Saving to Git is disabled.' : ''
}

// ---- rights (PGB-08…PGB-11) ----
// The viewer as the rights see them: their work email (the one on the Time Writing connection, CON-82), their role
// permissions, whether the roles file is loaded (CON-101) and whether they manage pages and menu groups (CON-106).
// viewingAs (OND-102): View as is on — read only, nothing is saved.
export interface Viewer { email: string; can: (action: Action) => boolean; readOnly: boolean; manager: boolean; viewingAs?: boolean }
export const readOnlyMenuReason = 'Read only: the access roles are not loaded yet, so nothing can be changed in the menu.'
export const managerOnlyReason = 'Only a Tool Owner (“Manage pages and menu groups”) can create, rename, reorder, configure or remove menu groups. An Admin can change this in Admin → People & access → Role rights.'
// A group co-owner holds their group only while it accepts added pages.
export function isGroupOwner(layout: MenuLayout, groupId: string, email: string) {
  const group = findGroup(layout, groupId)
  return Boolean(email && group?.acceptsPages && group.owners.includes(normalEmail(email)))
}
export const isPageOwner = (layout: MenuLayout, pageId: string, email: string) => Boolean(email && layout.pages[pageId]?.owners.includes(normalEmail(email)))
// Groups and their settings: Tool Owner only.
export const groupReason = (viewer: Viewer) => viewer.readOnly ? readOnlyMenuReason : viewer.manager ? '' : managerOnlyReason
// Adding a page to a group: the group accepts added pages, and the viewer is a Tool Owner or one of its co-owners.
export function addPageReason(viewer: Viewer, layout: MenuLayout, groupId: string) {
  if (viewer.readOnly) return readOnlyMenuReason
  const group = findGroup(layout, groupId)
  if (!group) return 'That group is no longer in the menu.'
  if (!group.acceptsPages) return `“${group.name}” does not accept added pages. A Tool Owner can turn this on in Admin → Pages & reports → Menu groups & pages.`
  return viewer.manager || isGroupOwner(layout, groupId, viewer.email) || setupInOnDemand(viewer, groupId) ? '' : `Only a Tool Owner or a co-owner of the group “${group.name}”${groupId === onDemandGroup ? ' (or a role allowed “Set up On-Demand pages”)' : ''} can add pages to it.`
}
// CON-103 kept: a role allowed "Set up On-Demand pages" adds, renames, reorders and removes the pages of the On-Demand
// group, as before the page builder (OND-10).
const setupInOnDemand = (viewer: Viewer, groupId: string) => groupId === onDemandGroup && viewer.can('ondemand.setup')
// The groups the viewer may add a page to.
export const groupsForAdding = (viewer: Viewer, layout: MenuLayout) => menuGroups(layout).filter((group) => !addPageReason(viewer, layout, group.id))
// A page in the menu — rename, reorder, its co-owners: a Tool Owner or a co-owner of the page's group (PGB-20: deleting
// is the Tool Owner's only, deleteReason).
export function pageMenuReason(viewer: Viewer, layout: MenuLayout, pageId: string) {
  if (viewer.readOnly) return readOnlyMenuReason
  const groupId = placementOf(layout, pageId).group, group = findGroup(layout, groupId)
  return viewer.manager || isGroupOwner(layout, groupId, viewer.email) || setupInOnDemand(viewer, groupId) ? '' : `Only a Tool Owner or a co-owner of the group “${group?.name ?? 'On-Demand'}”${groupId === onDemandGroup ? ' (or a role allowed “Set up On-Demand pages”)' : ''} can change this page in the menu.`
}
// PGB-19: hiding and showing a page — a Tool Owner, a co-owner of the page or of its group (while it accepts pages), or
// in On-Demand a role allowed "Set up On-Demand pages". Fail closed without the roles file.
export function hideReason(viewer: Viewer, layout: MenuLayout, pageId: string) {
  if (viewer.readOnly) return readOnlyMenuReason
  const groupId = placementOf(layout, pageId).group, group = findGroup(layout, groupId)
  return viewer.manager || isGroupOwner(layout, groupId, viewer.email) || isPageOwner(layout, pageId, viewer.email) || setupInOnDemand(viewer, groupId) ? '' : `Only a Tool Owner or a co-owner of this page or of the group “${group?.name ?? 'On-Demand'}”${groupId === onDemandGroup ? ' (or a role allowed “Set up On-Demand pages”)' : ''} can hide or show this page.`
}
// PGB-20: deleting a page (its files in Git) — the Tool Owner only; everyone else hides it.
export const deleteReason = (viewer: Viewer) => viewer.readOnly ? readOnlyMenuReason : viewer.manager ? '' : 'Only a Tool Owner (“Manage pages and menu groups”) can delete a page. Hide it instead: it leaves the menu for everyone and its data stays in Git.'
// Moving a page to another group: into a group that accepts added pages; a Tool Owner anywhere, a group co-owner only
// between groups they co-own.
export function moveReason(viewer: Viewer, layout: MenuLayout, pageId: string, toGroup: string) {
  const from = placementOf(layout, pageId).group
  if (from === toGroup) return pageMenuReason(viewer, layout, pageId)
  if (viewer.readOnly) return readOnlyMenuReason
  const target = findGroup(layout, toGroup)
  if (!target) return 'That group is no longer in the menu.'
  if (!target.acceptsPages) return `“${target.name}” does not accept added pages.`
  if (viewer.manager) return ''
  const holds = (groupId: string) => isGroupOwner(layout, groupId, viewer.email) || setupInOnDemand(viewer, groupId)
  return holds(from) && holds(toGroup) ? '' : 'Only a Tool Owner can move a page to another group; a group co-owner moves pages within their own group.'
}
// Setting up a page (columns, options, prefix, insights) and editing its rows: the role-wide right (CON-103), or a
// co-owner of the page or of its group. Fail closed: nothing without the roles file.
export function pageRights(viewer: Viewer, layout: MenuLayout, pageId: string) {
  if (viewer.readOnly) return { setup: false, rows: false, owner: false }
  const owner = isPageOwner(layout, pageId, viewer.email) || isGroupOwner(layout, placementOf(layout, pageId).group, viewer.email)
  return { setup: viewer.can('ondemand.setup') || owner, rows: viewer.can('ondemand.edit') || owner, owner }
}
// CON-107, DSH-09: building an On-Demand Dashboard (blocks, tabs, filters, copying blocks to it) — the role right "Build
// On-Demand Dashboards" (every dashboard), or a co-owner of the page or of its group. "Set up On-Demand pages" does not
// give it (it keeps the table pages). Fail closed: nothing without the roles file (CON-101).
export function canBuildDashboard(viewer: Viewer, layout: MenuLayout, pageId: string) {
  if (viewer.readOnly) return false
  return viewer.can('dashboards.build') || isPageOwner(layout, pageId, viewer.email) || isGroupOwner(layout, placementOf(layout, pageId).group, viewer.email)
}

// ---- merging two saves (PGB-03, GIT-17) ----
// Groups and pages are merged by id. Each field of an entry three ways: a field only one save changed takes that change;
// one both changed takes the later save's. The co-owners are merged as sets: an email either save added stays, an email
// either save removed (that the other left as it was) goes. An entry one save removed and the other changed: the later
// save wins, as for the On-Demand pages (OND-09); removed by one and untouched by the other: removed. Without a base (the
// file never read here) every entry of both stays.
export function mergeOwners(base: string[] | undefined, mine: string[], theirs: string[]) {
  if (!base) return [...new Set([...theirs, ...mine])]
  return [...new Set([...theirs, ...mine])].filter((email) => !base.includes(email) || (mine.includes(email) && theirs.includes(email)))
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
// TVL-25: the owners written from the Tool Validations list are merged as sets too (the parser keeps only those still
// among the merged owners).
type Listed = { ownersFromList?: string[] }
function listed(b: Listed | undefined, m: Listed, t: Listed): Listed {
  const merged = mergeOwners(b ? b.ownersFromList ?? [] : undefined, m.ownersFromList ?? [], t.ownersFromList ?? [])
  return merged.length ? { ownersFromList: merged } : {}
}
function mergeEntries<T extends { owners: string[] }>(base: Record<string, T> | null, mine: Record<string, T>, theirs: Record<string, T>, mineLater: boolean): Record<string, T> {
  const ids = [...new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base ?? {})])]
  return Object.fromEntries(ids.flatMap((id): [string, T][] => {
    const b = base?.[id], m = mine[id], t = theirs[id]
    if (!base) return m || t ? [[id, (m && t ? { ...(mineLater ? t : m), ...(mineLater ? m : t), owners: mergeOwners(undefined, m.owners, t.owners), ...listed(undefined, m as Listed, t as Listed) } : m ?? t) as T]] : []
    if (!m || !t) {
      const kept = m ?? t
      if (!kept) return []
      if (!b) return [[id, kept]]
      // One save removed it: removed, unless the other changed it and is the later one.
      const changed = !same(kept, b), keptIsMine = Boolean(m)
      return changed && keptIsMine === mineLater ? [[id, kept]] : []
    }
    const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(m), ...Object.keys(t)])].filter((key) => key !== 'owners' && key !== 'ownersFromList')
    const merged = Object.fromEntries(keys.flatMap((key) => { const value = merge3((b as Record<string, unknown> | undefined)?.[key], (m as Record<string, unknown>)[key], (t as Record<string, unknown>)[key], mineLater); return value === undefined ? [] : [[key, value]] }))
    return [[id, { ...merged, owners: mergeOwners(b?.owners, m.owners, t.owners), ...listed(b as Listed | undefined, m as Listed, t as Listed) } as unknown as T]]
  }))
}
export function mergeMenuLayoutText(baseText: string | null, mineText: string, theirsText: string, mineLater: boolean): string {
  const read = (raw: string | null) => { if (!raw) return null; try { return parseMenuLayout(raw) } catch { return null } }
  const mine = read(mineText), theirs = read(theirsText), base = read(baseText)
  if (!mine || !theirs) return mineText
  const groups = mergeEntries(base?.groups ?? null, mine.groups, theirs.groups, mineLater)
  const pages = mergeEntries(base?.pages ?? null, mine.pages, theirs.pages, mineLater)
  // Read back through the parser: every rule of the file applies to the merged result.
  return serializeMenuLayout(parseMenuLayout(JSON.stringify({ schema: 1, kind: 'menu-layout', groups, pages })))
}
