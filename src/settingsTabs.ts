// Settings shows one tab at a time; the last one is remembered in this browser.
export type SettingsTab = 'connections' | 'storage' | 'access' | 'capacity' | 'resources' | 'masters' | 'audit' | 'features' | 'pack'
export const settingsTabKey = 'demand-planning-settings-tab-v1'
// Opening Settings from elsewhere on a given tab (e.g. the Azure DevOps connections).
export function settingsTabOnOpen(key: SettingsTab) { try { localStorage.setItem(settingsTabKey, key) } catch { /* opens on the last tab */ } }
