import type { AzureConfig } from './azureDevOps'

// Credentials intentionally live outside AppState, exports, sync payloads and audit records.
const legacyKey = (config: AzureConfig) => `demand-planning-azure-pat:${encodeURIComponent(config.organization.toLowerCase())}:${encodeURIComponent(config.project.toLowerCase())}`
const profileKey = (config: AzureConfig) => `${legacyKey(config)}:profiles-v1`
export interface AzurePatProfile { id: string; purpose: string; token: string }
export interface AzurePatProfileSummary { id: string; purpose: string }
const valid = (profile: unknown): profile is AzurePatProfile => Boolean(profile && typeof profile === 'object' && typeof (profile as AzurePatProfile).id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test((profile as AzurePatProfile).id) && typeof (profile as AzurePatProfile).purpose === 'string' && (profile as AzurePatProfile).purpose.trim().length > 0 && typeof (profile as AzurePatProfile).token === 'string' && (profile as AzurePatProfile).token.trim().length > 0)

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
