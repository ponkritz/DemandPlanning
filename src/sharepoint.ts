import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo } from '@azure/msal-browser'
import type { AppState } from './domain'

export interface SharePointConfig {
  tenantId: string
  clientId: string
  hostname: string
  sitePath: string
  stateFilePath: string
}

export const defaultSharePointConfig: SharePointConfig = {
  tenantId: '',
  clientId: '',
  hostname: 'share.philips.com',
  sitePath: '/sites/InDQuality',
  stateFilePath: 'Demand Planning MVP/demand-planning-state.json',
}

export interface RemoteState {
  state: AppState | null
  etag: string | null
  account: AccountInfo
  siteId: string
}

const scopes = ['User.Read', 'Sites.ReadWrite.All']
const graphRoot = 'https://graph.microsoft.com/v1.0'

export class SharePointStateClient {
  private app: PublicClientApplication
  private config: SharePointConfig
  private account: AccountInfo | null = null
  private siteId = ''

  constructor(config: SharePointConfig) {
    this.config = config
    const authorityTenant = config.tenantId.trim() || 'organizations'
    this.app = new PublicClientApplication({ auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${authorityTenant}`, redirectUri: window.location.href.split('#')[0] }, cache: { cacheLocation: 'sessionStorage' } })
  }

  async connect(): Promise<RemoteState> {
    await this.app.initialize()
    const existing = this.app.getAllAccounts()[0]
    this.account = existing ?? (await this.app.loginPopup({ scopes, prompt: 'select_account' })).account
    if (!this.account) throw new Error('Microsoft sign-in did not return an account.')
    const site = await this.graph(`/sites/${this.config.hostname}:${this.config.sitePath}`)
    this.siteId = site.id
    const remote = await this.load()
    return { ...remote, account: this.account, siteId: this.siteId }
  }

  async load(): Promise<{ state: AppState | null; etag: string | null }> {
    const itemPath = encodeGraphPath(this.config.stateFilePath)
    const metadata = await this.graph(`/sites/${this.siteId}/drive/root:/${itemPath}`, {}, true)
    if (!metadata) return { state: null, etag: null }
    const response = await this.authorizedFetch(`${graphRoot}/sites/${this.siteId}/drive/root:/${itemPath}:/content`)
    if (!response.ok) throw new Error(`Unable to download SharePoint data (${response.status}).`)
    const state = await response.json() as AppState
    if (!state.schemaVersion || !Array.isArray(state.activities) || !Array.isArray(state.efforts)) throw new Error('The central SharePoint data file has an unsupported structure.')
    return { state, etag: metadata.eTag ?? metadata.etag ?? null }
  }

  async save(state: AppState, etag: string | null): Promise<string> {
    if (!etag) await this.ensureParentFolders()
    const itemPath = encodeGraphPath(this.config.stateFilePath)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (etag) headers['If-Match'] = etag
    const response = await this.authorizedFetch(`${graphRoot}/sites/${this.siteId}/drive/root:/${itemPath}:/content`, { method: 'PUT', headers, body: JSON.stringify(state, null, 2) })
    if (response.status === 412) throw new Error('SYNC_CONFLICT')
    if (!response.ok) throw new Error(`Unable to save SharePoint data (${response.status}).`)
    const item = await response.json()
    return item.eTag ?? item.etag ?? ''
  }

  private async ensureParentFolders() {
    const folders = this.config.stateFilePath.split('/').slice(0, -1).filter(Boolean)
    let currentPath = ''
    for (const folder of folders) {
      const candidate = [currentPath, folder].filter(Boolean).join('/')
      const exists = await this.graph(`/sites/${this.siteId}/drive/root:/${encodeGraphPath(candidate)}`, {}, true)
      if (!exists) {
        const parent = currentPath ? `/sites/${this.siteId}/drive/root:/${encodeGraphPath(currentPath)}:/children` : `/sites/${this.siteId}/drive/root/children`
        await this.graph(parent, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: folder, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) })
      }
      currentPath = candidate
    }
  }

  private async graph(path: string, options: RequestInit = {}, allowNotFound = false) {
    const response = await this.authorizedFetch(`${graphRoot}${path}`, options)
    if (allowNotFound && response.status === 404) return null
    if (!response.ok) throw new Error(`Microsoft Graph request failed (${response.status}).`)
    return response.json()
  }

  private async authorizedFetch(url: string, options: RequestInit = {}) {
    if (!this.account) throw new Error('Microsoft account is not connected.')
    let token
    try { token = await this.app.acquireTokenSilent({ account: this.account, scopes }) }
    catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) throw error
      token = await this.app.acquireTokenPopup({ account: this.account, scopes })
    }
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${token.accessToken}`)
    return fetch(url, { ...options, headers })
  }
}

function encodeGraphPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}
