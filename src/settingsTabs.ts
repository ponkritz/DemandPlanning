import type { Action } from './access.ts'
import type { Scope } from './components/ScopeChip'
// Settings is a menu group of its own: one page per area (formerly the tabs of one Settings page), each split into
// sections shown one at a time (SET-14). The last page and the last section of each page are remembered here.
// SET-15: the group is headed Admin and holds the shared setup; My settings (what each person sets for themselves)
// opens from the person's name in the sidebar.
// SET-26: Admin has seven pages — Overview, Streams, Feature & PI setup, People & access, Capacity & time, Pages &
// reports, Data & history. Every older page key ('options', 'pireview', 'pack', 'audit', 'access', 'tables', 'history'…)
// and every moved section is still accepted (SET-28: `moved` below).
export type AdminTab = 'home' | 'connections' | 'epics' | 'resources' | 'capacity' | 'pages' | 'storage'
export type LegacyTab = 'options' | 'pireview' | 'pack' | 'audit' | 'access' | 'masters' | 'features' | 'tables' | 'history'
export type SettingsTab = AdminTab | 'my' | 'look' | LegacyTab
export const settingsTabKey = 'demand-planning-settings-tab-v1'
export const settingsSectionKey = 'demand-planning-settings-section-v1'

// SET-26, SET-27: the sections of each Admin page in order, with whom a change affects (SET-16) and the permissions that
// show them (needs: at least one of them; none: everyone). The Overview is one page without sections.
export interface AdminSection { key: string; label: string; scope: Scope; needs?: Action[] }
export const adminSections: Record<AdminTab, AdminSection[]> = {
  home: [],
  connections: [
    // AR-051: one row per stream, with its Epics to match Features in (formerly Stream options).
    { key: 'mapping', label: 'Stream mapping', scope: 'tool-owner' },
    { key: 'counts', label: 'Release counts', scope: 'everyone' },
    // AR-114: the shared Epics only; each person's own ("Mine") is in My settings → My bulk creation Epics.
    { key: 'bulk', label: 'Bulk creation', scope: 'everyone', needs: ['streams.options'] },
  ],
  epics: [
    // Everyone who creates Features keeps their own version of the Feature setup here ("Use my own version").
    { key: 'setup', label: 'Setup per Epic', scope: 'both', needs: ['setup.feature', 'setup.epic', 'azure.write'] },
    // LST-03…LST-07: the Value lists and the Team lists from Azure DevOps in one tab (two files in Git, as before).
    // SET-31: Lists and User Story templates are shown to everyone, read only without the right (each with the reason).
    { key: 'lists', label: 'Lists', scope: 'everyone' },
    { key: 'templates', label: 'User Story templates', scope: 'everyone' },
    // PIR-29, PIR-33: the review start date and the PI Review form (formerly the page PI Review Setup).
    { key: 'pireview', label: 'PI Review form', scope: 'everyone', needs: ['pireview.setup'] },
  ],
  resources: [
    { key: 'people', label: 'People', scope: 'everyone', needs: ['people.edit'] },
    { key: 'tree', label: 'Team tree', scope: 'everyone', needs: ['people.edit'] },
    // SET-30: with "Access for emails not in Azure DevOps".
    { key: 'rights', label: 'Role rights', scope: 'everyone' },
  ],
  capacity: [
    // Capacity and absence, with the Capacity roles (formerly People & roles → Capacity roles).
    { key: 'capacity', label: 'Capacity', scope: 'everyone', needs: ['capacity.settings', 'people.capacityRoles'] },
    { key: 'profiles', label: 'Calculation profiles', scope: 'everyone', needs: ['capacity.settings'] },
    // Bucket rules and Holidays and common activities.
    { key: 'classification', label: 'Hour classification', scope: 'everyone', needs: ['capacity.rules', 'capacity.time'] },
    { key: 'thresholds', label: 'Thresholds', scope: 'everyone', needs: ['capacity.rules'] },
    // Formerly Period control.
    { key: 'locks', label: 'Month locks', scope: 'everyone', needs: ['capacity.periods'] },
  ],
  pages: [
    // PGB-12: shown to everyone; who may change what is shown there, disabled with the reason.
    { key: 'menu', label: 'Menu groups & pages', scope: 'everyone' },
    { key: 'pack', label: 'Monthly pack', scope: 'everyone', needs: ['pack.setup'] },
    // UI-12: formerly in Look & feel.
    { key: 'tables', label: 'Table & chart defaults', scope: 'everyone', needs: ['layout.defaults'] },
  ],
  storage: [
    { key: 'git', label: 'Git storage', scope: 'computer' },
    { key: 'views', label: 'Other views', scope: 'both' },
    // Formerly Shared setup in Git.
    { key: 'shared', label: 'Connections in Git', scope: 'tool-owner', needs: ['storage.shared'] },
    { key: 'history', label: 'Historical hours', scope: 'everyone', needs: ['capacity.history'] },
    // Formerly the page History.
    { key: 'changes', label: 'Changes', scope: 'everyone', needs: ['storage.shared'] },
    // Synthetic sample, with Reset synthetic MVP data (for the holders of storage.shared, as on History before).
    { key: 'sample', label: 'Demo data', scope: 'computer' },
  ],
}
const labels: Record<AdminTab, string> = { home: 'Overview', connections: 'Streams', epics: 'Feature & PI setup', resources: 'People & access', capacity: 'Capacity & time', pages: 'Pages & reports', storage: 'Data & history' }
// needs: the union of its sections' permissions; a page with a section for everyone (or no sections) is for everyone.
const unionOf = (sections: AdminSection[]): Action[] | undefined => !sections.length || sections.some((section) => !section.needs) ? undefined : [...new Set(sections.flatMap((section) => section.needs ?? []))]

// The Admin pages in menu order; needs: shown only to people allowed at least one of these permissions (CON-94, SET-27).
export const settingsPages: { key: AdminTab; label: string; needs?: Action[] }[] = (['home', 'connections', 'epics', 'resources', 'capacity', 'pages', 'storage'] as const)
  .map((key) => { const needs = unionOf(adminSections[key]); return { key, label: labels[key], ...(needs ? { needs } : {}) } })
export const mySettingsLabel = 'My settings'
// SET-18: Look & feel — the settings of how the app looks, one page with a tab each (opened from the profile menu).
export const lookLabel = 'Look & feel'
export const settingsPagesFor = (can: (action: Action) => boolean) => settingsPages.filter((page) => !page.needs || page.needs.some(can))
const isAdminTab = (tab: string): tab is AdminTab => tab in adminSections
// SET-27: a section is shown to the people allowed at least one of its permissions (My settings, Look & feel and
// sections not in the table: everyone).
export const sectionAllowed = (tab: SettingsTab, section: string | undefined, can: (action: Action) => boolean) => {
  const entry = section && isAdminTab(tab) ? adminSections[tab].find((item) => item.key === section) : undefined
  return !entry?.needs || entry.needs.some(can)
}
export const sectionsFor = (tab: AdminTab, can: (action: Action) => boolean) => adminSections[tab].filter((section) => sectionAllowed(tab, section.key, can))
// SET-26, CON-94: the Admin page shown for the one asked (a remembered tab, a link): a page the viewer may not see opens
// the Overview instead — the content, the header and the newer-data notices alike. My settings and Look & feel are everyone's.
export const shownSettingsTab = (tab: SettingsTab, can: (action: Action) => boolean): SettingsTab => {
  const asked = resolveSettings(tab).tab
  return asked === 'my' || asked === 'look' || settingsPagesFor(can).some((page) => page.key === asked) ? asked : 'home'
}

// SET-15, SET-28: where an older page or section now lives (links, the Get started steps, Search settings and remembered
// choices keep working). A section key is looked up first ('page:section'), then the page.
const moved: Record<string, { tab: SettingsTab; section?: string }> = {
  // EPS-01: the Epic setup replaces Master data.
  masters: { tab: 'epics', section: 'setup' },
  // EPS-08: Epic setup and Feature setup are one page.
  features: { tab: 'epics', section: 'setup' },
  // CON-97: one editor per Epic replaces the separate sections.
  'epics:all': { tab: 'epics', section: 'setup' }, 'epics:fields': { tab: 'epics', section: 'setup' }, 'epics:feature': { tab: 'epics', section: 'setup' },
  access: { tab: 'resources', section: 'rights' },
  'connections:email': { tab: 'my', section: 'email' }, 'connections:servers': { tab: 'my', section: 'servers' },
  // GIT-37: the Load from Git section is part of Git storage.
  'storage:load': { tab: 'storage', section: 'git' },
  'connections:views': { tab: 'storage', section: 'views' }, 'connections:sources': { tab: 'storage', section: 'views' }, 'connections:sample': { tab: 'storage', section: 'sample' },
  // SET-28 (11 pages → 7): Stream options is part of Streams.
  options: { tab: 'connections', section: 'mapping' }, 'options:epics': { tab: 'connections', section: 'mapping' },
  'options:counts': { tab: 'connections', section: 'counts' }, 'options:bulk': { tab: 'connections', section: 'bulk' },
  // PI Review Setup is the section PI Review form of Feature & PI setup.
  pireview: { tab: 'epics', section: 'pireview' },
  // Capacity roles moved from People & roles to Capacity & time → Capacity.
  'resources:capacity-roles': { tab: 'capacity', section: 'capacity' },
  // Capacity & time: five sections instead of seven; Historical hours moved to Data & history.
  'capacity:rules': { tab: 'capacity', section: 'classification' }, 'capacity:time': { tab: 'capacity', section: 'classification' },
  'capacity:insights': { tab: 'capacity', section: 'thresholds' }, 'capacity:period': { tab: 'capacity', section: 'locks' },
  'capacity:history': { tab: 'storage', section: 'history' }, history: { tab: 'storage', section: 'history' },
  // Reports and Table and chart defaults (Look & feel) are part of Pages & reports.
  pack: { tab: 'pages', section: 'pack' }, 'pack:pack': { tab: 'pages', section: 'pack' },
  tables: { tab: 'pages', section: 'tables' }, 'pack:tables': { tab: 'pages', section: 'tables' }, 'look:tables': { tab: 'pages', section: 'tables' },
  // Data & sharing → Read-only sources is gone (its By type is in the Other views row); Synthetic sample is Demo data.
  'storage:sources': { tab: 'storage', section: 'views' },
  // History is the section Changes of Data & history; its Reset is in Demo data.
  audit: { tab: 'storage', section: 'changes' },
}
export function resolveSettings(tab: SettingsTab, section?: string): { tab: SettingsTab; section?: string } {
  return (section ? moved[`${tab}:${section}`] : undefined) ?? moved[tab] ?? { tab, ...(section ? { section } : {}) }
}
export const settingsLabel = (key: SettingsTab) => { const tab = resolveSettings(key).tab; return tab === 'my' ? mySettingsLabel : tab === 'look' ? lookLabel : isAdminTab(tab) ? labels[tab] : 'Admin' }

export function readSettingsTab(): SettingsTab {
  try { const stored = localStorage.getItem(settingsTabKey) as SettingsTab | null, saved = stored ? resolveSettings(stored).tab : null; return saved === 'my' || saved === 'look' || settingsPages.some((page) => page.key === saved) ? saved as SettingsTab : 'home' } catch { return 'home' }
}
export function saveSettingsTab(key: SettingsTab) { try { localStorage.setItem(settingsTabKey, key) } catch { /* not remembered */ } }

// The section last shown on each page ({ page: section }).
export function readSettingsSections(): Partial<Record<SettingsTab, string>> {
  try { const raw = JSON.parse(localStorage.getItem(settingsSectionKey) ?? '{}') as unknown; return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Partial<Record<SettingsTab, string>> : {} } catch { return {} }
}
// SET-28: a section remembered before it moved opens where it lives now when that is still on this page.
export function rememberedSection(page: SettingsTab): string | undefined {
  const own = readSettingsSections()[page]
  if (!own) return undefined
  const now = resolveSettings(page, own)
  return now.tab === page ? now.section : undefined
}
export function saveSettingsSection(page: SettingsTab, section: string) {
  try { localStorage.setItem(settingsSectionKey, JSON.stringify({ ...readSettingsSections(), [page]: section })) } catch { /* not remembered */ }
}
// The section shown: the one asked for when it exists, else the one remembered, else the first.
export function pickSection(sections: string[], wanted?: string) {
  return wanted && sections.includes(wanted) ? wanted : sections[0] ?? ''
}
