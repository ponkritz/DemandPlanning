import type { Action } from './access.ts'
// Settings is a menu group of its own: one page per area (formerly the tabs of one Settings page), each split into
// sections shown one at a time (SET-14). The last page and the last section of each page are remembered here.
// SET-15: the group is headed Admin and holds the shared setup; My settings (what each person sets for themselves)
// opens from the person's name in the sidebar. Older page keys ('access', 'tables', 'history') are still accepted.
export type SettingsTab = 'home' | 'my' | 'look' | 'epics' | 'connections' | 'options' | 'storage' | 'access' | 'capacity' | 'resources' | 'masters' | 'audit' | 'features' | 'pack' | 'tables' | 'history' | 'pages' | 'pireview'
export const settingsTabKey = 'demand-planning-settings-tab-v1'
export const settingsSectionKey = 'demand-planning-settings-section-v1'

// The Admin pages in menu order; needs: shown only to people allowed at least one of these permissions (CON-94).
export const settingsPages: { key: SettingsTab; label: string; needs?: Action[] }[] = [
  { key: 'home', label: 'Overview' }, { key: 'connections', label: 'Streams' }, { key: 'options', label: 'Stream options' }, { key: 'epics', label: 'Epic & Feature setup' },
  // PIR-29: PI Review Setup — the PI Review form setup on a page of its own, shown only to the holders of "PI Review: set
  // up the review form" (CON-114: Scrum Master and Tool Owner by default), so a Scrum Master reaches it in the menu.
  { key: 'pireview', label: 'PI Review Setup', needs: ['pireview.setup'] },
  { key: 'resources', label: 'People & roles' }, { key: 'capacity', label: 'Capacity & time', needs: ['capacity.settings', 'capacity.rules', 'capacity.time', 'capacity.periods', 'capacity.history'] },
  { key: 'pack', label: 'Reports', needs: ['pack.setup'] }, { key: 'storage', label: 'Data & sharing' },
  // PGB-12: Pages & menu — shown to everyone: who may change what is shown there, disabled with the reason.
  { key: 'pages', label: 'Pages & menu' },
  { key: 'audit', label: 'History', needs: ['storage.shared'] },
]
export const mySettingsLabel = 'My settings'
// SET-18: Look & feel — the settings of how the app looks, one page with a tab each (opened from the profile menu).
export const lookLabel = 'Look & feel'
export const settingsPagesFor = (can: (action: Action) => boolean) => settingsPages.filter((page) => !page.needs || page.needs.some(can))
// CON-94, PIR-29: the Admin page shown for the one asked (a remembered tab, a link): a page the viewer may not see opens
// Streams instead — the content, the header and the newer-data notices alike. My settings and Look & feel are everyone's.
export const shownSettingsTab = (tab: SettingsTab, can: (action: Action) => boolean): SettingsTab => {
  const asked = resolveSettings(tab).tab
  return asked === 'my' || asked === 'look' || settingsPagesFor(can).some((page) => page.key === asked) ? asked : 'connections'
}

// SET-15: where an older page or section now lives (links, the Get started steps and remembered choices keep working).
const moved: Record<string, { tab: SettingsTab; section?: string }> = {
  // EPS-01: the Epic setup replaces Master data.
  masters: { tab: 'epics', section: 'setup' },
  // EPS-08: Epic setup and Feature setup are one page.
  features: { tab: 'epics', section: 'setup' },
  // CON-97: one editor per Epic replaces the separate sections.
  'epics:all': { tab: 'epics', section: 'setup' }, 'epics:fields': { tab: 'epics', section: 'setup' }, 'epics:feature': { tab: 'epics', section: 'setup' },
  // PIR-29: the PI Review form, formerly a section of Epic & Feature setup, is a page of its own.
  'epics:pireview': { tab: 'pireview' },
  access: { tab: 'resources', section: 'rights' }, tables: { tab: 'look', section: 'tables' }, 'pack:tables': { tab: 'look', section: 'tables' }, history: { tab: 'capacity', section: 'history' },
  'connections:email': { tab: 'my', section: 'email' }, 'connections:servers': { tab: 'my', section: 'servers' },
  'connections:views': { tab: 'storage', section: 'views' }, 'connections:sources': { tab: 'storage', section: 'sources' }, 'connections:sample': { tab: 'storage', section: 'sample' },
}
export function resolveSettings(tab: SettingsTab, section?: string): { tab: SettingsTab; section?: string } {
  return (section ? moved[`${tab}:${section}`] : undefined) ?? moved[tab] ?? { tab, ...(section ? { section } : {}) }
}
export const settingsLabel = (key: SettingsTab) => { const tab = resolveSettings(key).tab; return tab === 'my' ? mySettingsLabel : tab === 'look' ? lookLabel : settingsPages.find((page) => page.key === tab)?.label ?? 'Settings' }

export function readSettingsTab(): SettingsTab {
  try { const stored = localStorage.getItem(settingsTabKey) as SettingsTab | null, saved = stored ? resolveSettings(stored).tab : null; return saved === 'my' || saved === 'look' || settingsPages.some((page) => page.key === saved) ? saved as SettingsTab : 'connections' } catch { return 'connections' }
}
export function saveSettingsTab(key: SettingsTab) { try { localStorage.setItem(settingsTabKey, key) } catch { /* not remembered */ } }

// The section last shown on each page ({ page: section }).
export function readSettingsSections(): Partial<Record<SettingsTab, string>> {
  try { const raw = JSON.parse(localStorage.getItem(settingsSectionKey) ?? '{}') as unknown; return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Partial<Record<SettingsTab, string>> : {} } catch { return {} }
}
export function saveSettingsSection(page: SettingsTab, section: string) {
  try { localStorage.setItem(settingsSectionKey, JSON.stringify({ ...readSettingsSections(), [page]: section })) } catch { /* not remembered */ }
}
// The section shown: the one asked for when it exists, else the one remembered, else the first.
export function pickSection(sections: string[], wanted?: string) {
  return wanted && sections.includes(wanted) ? wanted : sections[0] ?? ''
}
