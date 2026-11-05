// Settings is a menu group of its own: one page per area (formerly the tabs of one Settings page), each split into
// sections shown one at a time (SET-14). The last page and the last section of each page are remembered here.
export type SettingsTab = 'connections' | 'storage' | 'access' | 'capacity' | 'resources' | 'masters' | 'audit' | 'features' | 'pack' | 'tables' | 'history'
export const settingsTabKey = 'demand-planning-settings-tab-v1'
export const settingsSectionKey = 'demand-planning-settings-section-v1'

// The pages in menu order; shared: only for roles with "Manage shared settings".
export const settingsPages: { key: SettingsTab; label: string; shared?: boolean }[] = [
  { key: 'connections', label: 'Azure DevOps' }, { key: 'storage', label: 'Storage' }, { key: 'access', label: 'Access' }, { key: 'features', label: 'Feature setup' },
  { key: 'capacity', label: 'Capacity & periods', shared: true }, { key: 'resources', label: 'Resources', shared: true }, { key: 'masters', label: 'Master data', shared: true },
  { key: 'pack', label: 'Monthly pack', shared: true }, { key: 'tables', label: 'Table defaults', shared: true }, { key: 'history', label: 'Historical hours', shared: true }, { key: 'audit', label: 'Audit', shared: true },
]
export const settingsPagesFor = (canManage: boolean) => settingsPages.filter((page) => canManage || !page.shared)
export const settingsLabel = (key: SettingsTab) => settingsPages.find((page) => page.key === key)?.label ?? 'Settings'

export function readSettingsTab(): SettingsTab {
  try { const saved = localStorage.getItem(settingsTabKey); return settingsPages.some((page) => page.key === saved) ? saved as SettingsTab : 'connections' } catch { return 'connections' }
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
