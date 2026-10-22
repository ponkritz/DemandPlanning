// Windchill connection setup: the host and service path the Windchill views search. Saved in this browser only, like
// the Azure DevOps connections; no password is stored — the login is the browser's own Windchill sign-in (or the
// desktop app's).
export type WindchillLogin = 'sso'
export interface WindchillSettings { host: string; servicePath: string; login: WindchillLogin; objectType: string; filter: string; fields: string }
export const defaultWindchillSettings: WindchillSettings = { host: '', servicePath: '/Windchill/servlet/odata', login: 'sso', objectType: '', filter: '', fields: '' }
const storageKey = 'demand-planning-windchill-settings-v1'

// "plm.example.com", "https://plm.example.com/" or a pasted Windchill page address → "https://plm.example.com".
export function normalizeWindchillHost(value: string) {
  const text = value.trim()
  if (!text) return ''
  let url: URL
  try { url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`) } catch { throw new Error('Enter the Windchill host, e.g. plm.example.com.') }
  if (url.protocol !== 'https:') throw new Error('The Windchill host must use https.')
  if (url.username || url.password) throw new Error('Do not put a user name or password in the host.')
  return url.origin
}

export function normalizeServicePath(value: string) {
  const path = `/${value.trim().replace(/^\/+|\/+$/g, '')}`
  if (!/^\/Windchill\/[\w./-]*$/i.test(path) || path.includes('..')) throw new Error('The service path must start with /Windchill/, e.g. /Windchill/servlet/odata.')
  return path
}

export function normalizeWindchillSettings(value: Partial<WindchillSettings> | null | undefined): WindchillSettings {
  const text = (entry: unknown) => typeof entry === 'string' ? entry.trim() : ''
  let host = '', servicePath = defaultWindchillSettings.servicePath
  try { host = normalizeWindchillHost(text(value?.host)) } catch { host = '' }
  try { servicePath = text(value?.servicePath) ? normalizeServicePath(text(value?.servicePath)) : servicePath } catch { /* default */ }
  return { host, servicePath, login: 'sso', objectType: text(value?.objectType), filter: text(value?.filter), fields: text(value?.fields) }
}

export const windchillServiceUrl = (settings: WindchillSettings) => settings.host ? `${settings.host}${settings.servicePath}` : ''

export function loadWindchillSettings(): WindchillSettings {
  try { const saved = localStorage.getItem(storageKey); return saved ? normalizeWindchillSettings(JSON.parse(saved)) : defaultWindchillSettings } catch { return defaultWindchillSettings }
}
export function saveWindchillSettings(settings: WindchillSettings) {
  localStorage.setItem(storageKey, JSON.stringify(settings))
}

export interface WindchillTestResult { ok: boolean; status: number; message: string; services: string[]; signIn?: boolean }
declare global { interface Window { windchill?: { test: (request: { host: string; servicePath: string }) => Promise<WindchillTestResult>; query?: (request: { host: string; servicePath: string; path: string }) => Promise<{ rows: Record<string, unknown>[] }>; signIn?: (request: { host: string; servicePath: string }) => Promise<WindchillTestResult>; signOut?: () => Promise<{ ok: boolean }> } } }
