import type { Action } from './access.ts'
// Settings is a menu group of its own: one page per area (formerly the tabs of one Settings page), each split into
// sections shown one at a time (SET-14). The last page and the last section of each page are remembered here.
export type SettingsTab = 'connections' | 'storage' | 'access' | 'capacity' | 'resources' | 'masters' | 'audit' | 'features' | 'pack' | 'tables' | 'history'
export const settingsTabKey = 'demand-planning-settings-tab-v1'
export const settingsSectionKey = 'demand-planning-settings-section-v1'

// The pages in menu order; needs: shown only to people allowed at least one of these permissions (CON-94).
export const settingsPages: { key: SettingsTab; label: string; needs?: Action[] }[] = [
  { key: 'connections', label: 'Azure DevOps' }, { key: 'storage', label: 'Storage' }, { key: 'features', label: 'Feature setup' },
  { key: 'capacity', label: 'Capacity & periods', needs: ['capacity.settings', 'capacity.rules', 'capacity.time', 'capacity.periods'] }, { key: 'resources', label: 'People & access' }, { key: 'masters', label: 'Master data', needs: ['storage.shared'] },
  { key: 'pack', label: 'Monthly pack', needs: ['pack.setup'] }, { key: 'tables', label: 'Table defaults', needs: ['layout.defaults'] }, { key: 'history', label: 'Historical hours', needs: ['capacity.history'] }, { key: 'audit', label: 'Audit', needs: ['storage.shared'] },
]
export const settingsPagesFor = (can: (action: Action) => boolean) => settingsPages.filter((page) => !page.needs || page.needs.some(can))
// CAP-49: Access is part of People & access; an old link to it opens that page.
export const settingsLabel = (key: SettingsTab) => settingsPages.find((page) => page.key === (key === 'access' ? 'resources' : key))?.label ?? 'Settings'

export function readSettingsTab(): SettingsTab {
  try { const stored = localStorage.getItem(settingsTabKey), saved = stored === 'access' ? 'resources' : stored; return settingsPages.some((page) => page.key === saved) ? saved as SettingsTab : 'connections' } catch { return 'connections' }
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
