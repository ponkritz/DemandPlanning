import { normalizeBaseUrl, type AzureConfig } from './azureDevOps.ts'

// Credentials intentionally live outside AppState, exports, sync payloads and audit records.
const legacyKey = (config: AzureConfig) => `demand-planning-azure-pat:${encodeURIComponent(config.organization.toLowerCase())}:${encodeURIComponent(config.project.toLowerCase())}`
const profileKey = (config: AzureConfig) => `${legacyKey(config)}:profiles-v1`
export interface AzurePatProfile { id: string; purpose: string; token: string }
export interface AzurePatProfileSummary { id: string; purpose: string }
// What a connection's data is used for: the Time Writing backlog (read & write), the DHFI release documents,
// a document source such as Vault (read only, for document counts), reference data that is only fetched and listed, or a
// read-only backlog view shown as its own tab on the Backlogs page.
export type AzureConnectionRole = 'time-tracking' | 'release-source' | 'documents' | 'reference' | 'backlog-view'
export const azureConnectionRoles: AzureConnectionRole[] = ['time-tracking', 'backlog-view', 'release-source', 'documents', 'reference']
export interface AzureConnectionProfile { id: string; url: string; reason: string; creatorEmail?: string; role?: AzureConnectionRole; query?: string; baseUrl?: string; apiVersion?: string; viewName?: string; showInMenu?: boolean; token: string }
export interface AzureConnectionProfileSummary { id: string; url: string; reason: string; creatorEmail?: string; role: AzureConnectionRole; query?: string; baseUrl?: string; apiVersion?: string; viewName?: string; showInMenu?: boolean }
const connectionProfilesKey = 'demand-planning-azure-connection-profiles-v1'
const valid = (profile: unknown): profile is AzurePatProfile => Boolean(profile && typeof profile === 'object' && typeof (profile as AzurePatProfile).id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test((profile as AzurePatProfile).id) && typeof (profile as AzurePatProfile).purpose === 'string' && (profile as AzurePatProfile).purpose.trim().length > 0 && typeof (profile as AzurePatProfile).token === 'string' && (profile as AzurePatProfile).token.trim().length > 0)
const validConnection = (profile: unknown): profile is AzureConnectionProfile => {
  if (!profile || typeof profile !== 'object') return false
  const value = profile as AzureConnectionProfile
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id) || typeof value.url !== 'string' || typeof value.reason !== 'string' || !value.reason.trim() || typeof value.token !== 'string') return false
  try {
    const url = new URL(value.url)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    if (value.baseUrl != null) { const base = normalizeBaseUrl(value.baseUrl); if (!value.url.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return false }
    else if (url.hostname !== 'dev.azure.com') return false
  } catch { return false }
  if (value.apiVersion != null && (typeof value.apiVersion !== 'string' || !/^\d{1,2}\.\d(-preview(\.\d)?)?$/.test(value.apiVersion))) return false
  if (value.role != null && !azureConnectionRoles.includes(value.role)) return false
  if (value.query != null && (typeof value.query !== 'string' || value.query.length > 50000)) return false
  if ((value.viewName != null && (typeof value.viewName !== 'string' || value.viewName.length > 80)) || (value.showInMenu != null && typeof value.showInMenu !== 'boolean')) return false
  return value.creatorEmail == null || (typeof value.creatorEmail === 'string' && (!value.creatorEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.creatorEmail.trim())))
}

export function listAzureConnectionProfiles(storage: Pick<Storage, 'getItem'> = localStorage): AzureConnectionProfileSummary[] {
  try { const raw = JSON.parse(storage.getItem(connectionProfilesKey) ?? '[]'); return Array.isArray(raw) ? raw.filter(validConnection).map(({ id, url, reason, creatorEmail, role, query, baseUrl, apiVersion, viewName, showInMenu }) => ({ id, url, reason, role: role ?? 'time-tracking', ...(viewName?.trim() ? { viewName: viewName.trim() } : {}), ...(showInMenu != null ? { showInMenu } : {}), ...(creatorEmail?.trim() ? { creatorEmail: creatorEmail.trim() } : {}), ...(query?.trim() ? { query: query.trim() } : {}), ...(baseUrl ? { baseUrl } : {}), ...(apiVersion ? { apiVersion } : {}) })) : [] } catch { return [] }
}
// One PAT per server: an on-prem collection (its base URL) or a cloud organization (dev.azure.com/<org>). Every
// connection on the server uses it, so it is entered once; a connection's own PAT is only a fallback (older setups).
const serverPatsKey = 'demand-planning-server-pats-v1'
export function serverKey(view: Pick<AzureConnectionProfileSummary, 'url' | 'baseUrl'>) {
  if (view.baseUrl) return view.baseUrl.replace(/\/+$/, '').toLowerCase()
  try { const url = new URL(view.url); return `${url.origin}/${url.pathname.split('/').filter(Boolean)[0] ?? ''}`.toLowerCase() } catch { return '' }
}
const readServerPats = (storage: Pick<Storage, 'getItem'>): Record<string, string> => { try { const raw = JSON.parse(storage.getItem(serverPatsKey) ?? '{}'); return raw && typeof raw === 'object' && !Array.isArray(raw) ? Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim()))) : {} } catch { return {} } }
export function loadServerPat(key: string, storage: Pick<Storage, 'getItem'> = localStorage) { return readServerPats(storage)[key.toLowerCase()] ?? '' }
export function saveServerPat(key: string, token: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  if (!key) return
  const pats = readServerPats(storage), clean = token.trim(), previous = pats[key.toLowerCase()] ?? ''
  if (clean) pats[key.toLowerCase()] = clean; else delete pats[key.toLowerCase()]
  try { storage.setItem(serverPatsKey, JSON.stringify(pats)) } catch { throw new Error('This browser could not save the PAT. Check local storage availability.') }
  // The server holds the PAT: copies on its connections (the new PAT, or the removed one) are dropped, so removing
  // the server's PAT really removes it from this browser.
  dropConnectionTokens(storage, (profile) => serverKey(profile).toLowerCase() === key.toLowerCase() && (profile.token === clean || profile.token === previous))
}
function dropConnectionTokens(storage: Pick<Storage, 'getItem' | 'setItem'>, where: (profile: AzureConnectionProfile) => boolean) {
  try {
    const raw = JSON.parse(storage.getItem(connectionProfilesKey) ?? '[]')
    const profiles: AzureConnectionProfile[] = Array.isArray(raw) ? raw.filter(validConnection) : []
    if (!profiles.some((profile) => profile.token && where(profile))) return
    storage.setItem(connectionProfilesKey, JSON.stringify(profiles.map((profile) => profile.token && where(profile) ? { ...profile, token: '' } : profile)))
  } catch { /* the server PAT is saved; a stale copy is replaced at the next save */ }
}
// Servers added in Settings (Step 1) without a connection yet, so new queries can be created on them.
export interface KnownServer { serverUrl: string; organization: string }
const knownServersKey = 'demand-planning-servers-v1'
export function listKnownServers(storage: Pick<Storage, 'getItem'> = localStorage): KnownServer[] {
  try { const raw = JSON.parse(storage.getItem(knownServersKey) ?? '[]'); return Array.isArray(raw) ? raw.filter((entry): entry is KnownServer => Boolean(entry) && typeof entry.serverUrl === 'string' && typeof entry.organization === 'string' && Boolean(entry.organization.trim())) : [] } catch { return [] }
}
export function saveKnownServer(server: KnownServer, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const base = collectionUrlFrom(server.serverUrl, server.organization)
  const list = listKnownServers(storage).filter((entry) => { try { return collectionUrlFrom(entry.serverUrl, entry.organization).toLowerCase() !== base.toLowerCase() } catch { return false } })
  list.push({ serverUrl: server.serverUrl.trim(), organization: server.organization.trim() })
  try { storage.setItem(knownServersKey, JSON.stringify(list)) } catch { throw new Error('This browser could not save the server.') }
  return base
}
export function forgetKnownServer(base: string, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const list = listKnownServers(storage).filter((entry) => { try { return collectionUrlFrom(entry.serverUrl, entry.organization).toLowerCase() !== base.toLowerCase() } catch { return false } })
  try { storage.setItem(knownServersKey, JSON.stringify(list)) } catch { /* nothing to remove */ }
}
export function hasServerPat(key: string, storage: Pick<Storage, 'getItem'> = localStorage) { return Boolean(loadServerPat(key, storage)) }

export function loadAzureConnectionProfile(id: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(connectionProfilesKey) ?? '[]')
    const profile = Array.isArray(raw) ? raw.filter(validConnection).find(item => item.id === id) ?? null : null
    if (!profile) return null
    // The server's PAT wins; a PAT saved on the connection itself is used until one is set for the server.
    return { ...profile, token: loadServerPat(serverKey(profile), storage) || profile.token }
  } catch { return null }
}
export function saveAzureConnectionProfile(profile: AzureConnectionProfile, storage: Pick<Storage, 'getItem'|'setItem'> = localStorage) {
  if (!validConnection(profile)) throw new Error('Provide a valid Azure DevOps URL, reason, creator email and PAT.')
  // A PAT entered on a connection becomes its server's PAT, for every connection on that server; the connection itself
  // keeps no copy of the server's PAT (so a PAT removed from the server is gone), only a PAT of its own when the server has none.
  const serverPat = loadServerPat(serverKey(profile), storage)
  if (profile.token.trim() && profile.token.trim() !== serverPat) saveServerPat(serverKey(profile), profile.token, storage as Pick<Storage, 'getItem' | 'setItem'>)
  const token = profile.token.trim() && profile.token.trim() === serverPat ? '' : profile.token
  try { const raw = JSON.parse(storage.getItem(connectionProfilesKey) ?? '[]'); const profiles = Array.isArray(raw) ? raw.filter(validConnection).filter(item => item.id !== profile.id) : []; profiles.push({ ...profile, url: profile.url.trim(), reason: profile.reason.trim(), ...(profile.role ? { role: profile.role } : {}), ...(profile.creatorEmail?.trim() ? { creatorEmail: profile.creatorEmail.trim() } : {}), ...(profile.query?.trim() ? { query: profile.query.trim() } : {}), ...(profile.baseUrl ? { baseUrl: normalizeBaseUrl(profile.baseUrl) } : {}), ...(profile.apiVersion?.trim() ? { apiVersion: profile.apiVersion.trim() } : {}), viewName: profile.viewName?.trim() || undefined, token: token.trim() }); storage.setItem(connectionProfilesKey, JSON.stringify(profiles)) }
  catch { throw new Error('This browser could not save the Azure DevOps configuration. Check local storage availability.') }
}
// Shown in the Azure DevOps menu: the explicit choice, else on for Time Writing and backlog views, off for backend-only
// sources (releases, documents, reference). The view is named by its View name, else the connection name.
export const defaultShowInMenu = (role: AzureConnectionRole) => role === 'time-tracking' || role === 'backlog-view'
export const showsInMenu = (profile: Pick<AzureConnectionProfileSummary, 'role' | 'showInMenu'>) => profile.showInMenu ?? defaultShowInMenu(profile.role)
export const viewNameOf = (profile: Pick<AzureConnectionProfileSummary, 'reason' | 'viewName'>) => profile.viewName?.trim() || profile.reason
export function forgetAzureConnectionProfile(id: string, storage: Pick<Storage, 'getItem'|'setItem'> = localStorage) {
  try { const raw = JSON.parse(storage.getItem(connectionProfilesKey) ?? '[]'); const profiles = Array.isArray(raw) ? raw.filter(validConnection).filter(item => item.id !== id) : []; storage.setItem(connectionProfilesKey, JSON.stringify(profiles)) }
  catch { throw new Error('This browser could not remove the Azure DevOps configuration.') }
}

export function loadAzurePat(config: AzureConfig, storage: Pick<Storage, 'getItem'> = localStorage) { try { return storage.getItem(legacyKey(config)) ?? '' } catch { return '' } }
export function listAzurePatProfiles(config: AzureConfig, storage: Pick<Storage, 'getItem'> = localStorage): AzurePatProfileSummary[] {
  try { const raw = JSON.parse(storage.getItem(profileKey(config)) ?? '[]'); return Array.isArray(raw) ? raw.filter(valid).map(({ id, purpose }) => ({ id, purpose })) : [] } catch { return [] }
}
export function loadAzurePatProfile(config: AzureConfig, id: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  try { const raw = JSON.parse(storage.getItem(profileKey(config)) ?? '[]'); const profile = Array.isArray(raw) ? raw.filter(valid).find(item => item.id === id) : undefined; return profile?.token ?? '' } catch { return '' }
}
export function saveAzurePatProfile(config: AzureConfig, profile: AzurePatProfile, storage: Pick<Storage, 'getItem'|'setItem'> = localStorage) {
  if (!valid(profile)) throw new Error('Provide a valid profile name and PAT.')
  try { const raw = JSON.parse(storage.getItem(profileKey(config)) ?? '[]'); const profiles = Array.isArray(raw) ? raw.filter(valid).filter(item => item.id !== profile.id) : []; profiles.push({ ...profile, purpose: profile.purpose.trim(), token: profile.token.trim() }); storage.setItem(profileKey(config), JSON.stringify(profiles)) }
  catch { throw new Error('This browser could not save the PAT profile. Check local storage availability.') }
}
export function forgetAzurePatProfile(config: AzureConfig, id: string, storage: Pick<Storage, 'getItem'|'setItem'> = localStorage) {
  try { const raw = JSON.parse(storage.getItem(profileKey(config)) ?? '[]'); const profiles = Array.isArray(raw) ? raw.filter(valid).filter(item => item.id !== id) : []; storage.setItem(profileKey(config), JSON.stringify(profiles)) }
  catch { throw new Error('This browser could not remove the PAT profile.') }
}
// Backward-compatible helpers for one existing token. New UI saves named profiles.
export function saveAzurePat(config: AzureConfig, pat: string, storage: Pick<Storage, 'setItem'> = localStorage) { if (!pat.trim()) throw new Error('Enter a PAT before saving it.'); try { storage.setItem(legacyKey(config), pat.trim()) } catch { throw new Error('This browser could not save the PAT. Check local storage availability.') } }
export function forgetAzurePat(config: AzureConfig, storage: Pick<Storage, 'removeItem'> = localStorage) { storage.removeItem(legacyKey(config)) }

// A connection is entered as base URL + project (+ team); it is stored as one project URL plus the base URL, so an
// Azure DevOps Server collection (any https host and path) can be told apart from the project that follows it.
export function composeAzureUrl(baseUrl: string, project: string, team = '') {
  const base = normalizeBaseUrl(baseUrl)
  if (!project.trim()) throw new Error('Enter the Azure DevOps project name.')
  const url = `${base}/${encodeURIComponent(project.trim())}`
  return team.trim() ? `${url}/_backlogs/backlog/${encodeURIComponent(team.trim())}/Epics` : url
}
export function splitAzureUrl(value: string, baseUrl?: string) {
  try {
    const base = normalizeBaseUrl(baseUrl ?? value)
    const rest = value.slice(base.length).split(/[?#]/)[0].split('/').filter(Boolean).map(decodeURIComponent)
    const backlog = rest.indexOf('_backlogs')
    return { baseUrl: decodeURI(base), project: rest[0] ?? '', team: backlog >= 0 && rest[backlog + 1] === 'backlog' ? rest[backlog + 2] ?? '' : '' }
  } catch { return { baseUrl: '', project: '', team: '' } }
}

// Same shape as other Azure DevOps tools: an optional server URL (on-prem, e.g. https://tfs.company.com/tfs), the
// organization (on-prem: the collection, e.g. DHPCollection) and the project. Empty server URL = Azure DevOps Services.
export function collectionUrlFrom(serverUrl: string, organization: string) {
  const org = organization.trim()
  if (!org || /[/\\?#]/.test(org)) throw new Error(serverUrl.trim() ? 'Enter the collection name (organization), e.g. DefaultCollection.' : 'Enter the Azure DevOps organization name.')
  if (!serverUrl.trim()) return `https://dev.azure.com/${encodeURIComponent(org)}`
  const server = normalizeBaseUrl(serverUrl)
  if (new URL(server).hostname === 'dev.azure.com') return `https://dev.azure.com/${encodeURIComponent(org)}`
  // Tolerate the collection pasted into the server URL as well.
  return server.toLowerCase().endsWith(`/${encodeURIComponent(org).toLowerCase()}`) ? server : `${server}/${encodeURIComponent(org)}`
}
export function splitCollectionUrl(collection: string) {
  try {
    const url = new URL(normalizeBaseUrl(collection))
    const parts = url.pathname.split('/').filter(Boolean)
    if (url.hostname === 'dev.azure.com') return { serverUrl: '', organization: decodeURIComponent(parts[0] ?? '') }
    return { serverUrl: `${url.origin}${parts.slice(0, -1).map((part) => `/${part}`).join('')}`, organization: decodeURIComponent(parts.at(-1) ?? '') }
  } catch { return { serverUrl: '', organization: '' } }
}
