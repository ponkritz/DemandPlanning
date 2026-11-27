import type { Action } from './access.ts'
import { adminSections, type AdminTab } from './settingsTabs.ts'
import type { Scope } from './components/ScopeChip'

// SET-32…SET-36: the settings of a page, in a pop-up on the page itself (⚙ in its page actions). Each page lists the
// Admin sections that shape it; the pop-up shows them as tabs with the SAME panels as Admin (AdminPage renders them,
// `only`), saved the same way (Git, the same rights, the same Git bar). The ⚙ is shown only to people who hold a right
// to change at least one of them (in View as: the viewed person's or role's rights, as the menu and the ⚙ PI Review
// Setup); a tab only to the people who may change it. Personal settings (My templates, My bulk creation Epics) stay
// in My settings / Admin.
export type SettingsPage = 'activities' | 'mywork' | 'release' | 'mydash' | 'overview' | 'pulse'
export interface PageSetting { tab: AdminTab; section: string; label: string; scope: Scope; change: Action[] }
// The rights that CHANGE a section (shared settings only): the section's own permissions in Admin, except where Admin
// shows the section to everyone (read only) or for a personal part — Setup per Epic: the shared Feature and Epic setup
// (not "Create work items", which keeps the person's own version); Stream mapping: the mapping (Tool Owner, CON-93) or
// the Epics to match Features in; Release counts: "Enter release counts"; User Story templates: "Edit Epic setup value
// lists and User Story templates".
const change: Record<string, Action[]> = {
  'connections:mapping': ['streams.manage', 'streams.options'],
  'connections:counts': ['release.counts'],
  'epics:setup': ['setup.feature', 'setup.epic'],
  'epics:templates': ['setup.values'],
  'capacity:capacity': ['capacity.settings', 'people.capacityRoles'],
  'capacity:profiles': ['capacity.settings'],
  'capacity:classification': ['capacity.rules', 'capacity.time'],
  'capacity:thresholds': ['capacity.rules'],
  'capacity:locks': ['capacity.periods'],
  'pages:pack': ['pack.setup'],
  'pages:tables': ['layout.defaults'],
}
export const changeRights = (tab: AdminTab, section: string): Action[] => change[`${tab}:${section}`] ?? []
const of = (tab: AdminTab, section: string, label?: string): PageSetting => {
  const entry = adminSections[tab].find((item) => item.key === section)
  if (!entry) throw new Error(`No Admin section ${tab}:${section}`)
  return { tab, section, label: label ?? entry.label, scope: entry.scope, change: changeRights(tab, section) }
}
// SET-33: the sections of each page, in this order.
const timeWork = () => [of('capacity', 'locks'), of('capacity', 'classification'), of('capacity', 'capacity'), of('epics', 'setup'), of('epics', 'templates')]
const insights = () => [of('capacity', 'capacity'), of('capacity', 'thresholds'), of('capacity', 'profiles'), of('pages', 'tables')]
export const releaseClassLabel = 'Release Classification'
export const pageSettingsTable: Record<SettingsPage, PageSetting[]> = {
  // SET-36: Time Writing's ⚙ (inside its "last day" tile) opens only the Month locks — the period locks of its month.
  activities: [of('capacity', 'locks')],
  mywork: timeWork(),
  // A Release Details page: its stream's row of Stream mapping, its Release counts (CP, DP, IOCC) and the Release
  // Classification of its bulk creation Epic (Setup per Epic opened on that Epic; DP, IOCC, Content).
  release: [of('connections', 'mapping'), of('connections', 'counts'), of('epics', 'setup', releaseClassLabel)],
  mydash: insights(),
  overview: insights(),
  pulse: [of('pages', 'pack'), of('pages', 'tables')],
}
// The streams with Release counts (releaseSource.ts countStreams) and with a bulk creation Epic (BulkStream).
export const countedStreams: readonly string[] = ['CP', 'DP', 'IOCC']
export const bulkStreams: readonly string[] = ['DP', 'IOCC', 'Content']

// SET-32, SET-34: the sections of a page the person may change (none: no ⚙). A Release Details page needs its stream.
export function pageSettingsFor(page: SettingsPage, can: (action: Action) => boolean, stream?: string): PageSetting[] {
  if (page === 'release' && !stream) return []
  return pageSettingsTable[page].filter((entry) => {
    if (page === 'release' && entry.section === 'counts' && !countedStreams.includes(stream!)) return false
    if (page === 'release' && entry.section === 'setup' && !bulkStreams.includes(stream!)) return false
    return entry.change.some(can)
  })
}
export const showsPageSettings = (page: SettingsPage, can: (action: Action) => boolean, stream?: string) => pageSettingsFor(page, can, stream).length > 0
// UI-STANDARDS §6: the accessible name and title of the ⚙ and the pop-up.
export const pageSettingsLabel = (pageName: string) => `Settings for ${pageName}`
// The app page a settings list belongs to (a Release Details page is a read-only stream view or a Windchill export).
export function settingsPageOf(page: string, releaseStream?: string): SettingsPage | null {
  if (page === 'activities' || page === 'mywork' || page === 'mydash' || page === 'overview' || page === 'pulse') return page
  if ((page === 'board' || page === 'windchill') && releaseStream) return 'release'
  return null
}
