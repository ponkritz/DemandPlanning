// Theme preference: 'system' follows prefers-color-scheme; 'light' / 'dark' pin it. Stored per browser only.
export type ThemePreference = 'system' | 'light' | 'dark'
export const themeStorageKey = 'demand-planning-theme'
const preferences: ThemePreference[] = ['system', 'light', 'dark']

export function parseThemePreference(value: unknown): ThemePreference {
  return typeof value === 'string' && preferences.includes(value as ThemePreference) ? (value as ThemePreference) : 'system'
}

export function nextThemePreference(current: ThemePreference): ThemePreference {
  return preferences[(preferences.indexOf(current) + 1) % preferences.length]
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}

export function readThemePreference(search = window.location.search, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): ThemePreference {
  // ?theme=dark|light|system applies once and is remembered, so a link can open the app in a given theme.
  const fromUrl = new URLSearchParams(search).get('theme')
  if (fromUrl) { const parsed = parseThemePreference(fromUrl); try { storage.setItem(themeStorageKey, parsed) } catch { /* theme is a convenience; storage may be unavailable */ } return parsed }
  try { return parseThemePreference(storage.getItem(themeStorageKey)) } catch { return 'system' }
}

export function applyTheme(preference: ThemePreference, root: HTMLElement = document.documentElement) {
  if (preference === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', preference)
}

export function storeThemePreference(preference: ThemePreference, storage: Pick<Storage, 'setItem'> = localStorage) {
  try { storage.setItem(themeStorageKey, preference) } catch { /* theme is a convenience; storage may be unavailable */ }
}
