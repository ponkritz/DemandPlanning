import type { AzureConfig } from './azureDevOps'

// Credentials intentionally live outside AppState, exports, sync payloads and audit records.
const key = (config: AzureConfig) => `demand-planning-azure-pat:${encodeURIComponent(config.organization.toLowerCase())}:${encodeURIComponent(config.project.toLowerCase())}`

export function loadAzurePat(config: AzureConfig, storage: Pick<Storage, 'getItem'> = localStorage) {
  try { return storage.getItem(key(config)) ?? '' } catch { return '' }
}

export function saveAzurePat(config: AzureConfig, pat: string, storage: Pick<Storage, 'setItem'> = localStorage) {
  if (!pat.trim()) throw new Error('Enter a PAT before saving it.')
  try { storage.setItem(key(config), pat.trim()) }
  catch { throw new Error('This browser could not save the PAT. Check local storage availability.') }
}

export function forgetAzurePat(config: AzureConfig, storage: Pick<Storage, 'removeItem'> = localStorage) {
  storage.removeItem(key(config))
}
