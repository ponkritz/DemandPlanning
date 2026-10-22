export interface BuildInfo { app: 'demandplanning'; formatVersion: 1; version: string; buildId: string; builtAt: string; revision: string; buildNumber?: number }
export function validateBuildInfo(value: unknown): BuildInfo {
  if (!value || typeof value !== 'object') throw new Error('Invalid build metadata.')
  const info = value as BuildInfo
  if (info.app !== 'demandplanning' || info.formatVersion !== 1 || typeof info.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(info.version) || typeof info.buildId !== 'string' || !/^[\w.-]{1,160}$/.test(info.buildId) || typeof info.builtAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(info.builtAt) || !Number.isFinite(Date.parse(info.builtAt)) || (info.buildNumber !== undefined && !(Number.isInteger(info.buildNumber) && info.buildNumber >= 0)) || typeof info.revision !== 'string' || !/^(unknown|[a-f\d]{7,40})$/i.test(info.revision)) throw new Error('Build metadata is invalid. Nothing was reloaded.')
  return info
}

// When a build was made, in the viewer's time zone (with the zone shown). timeZone is for tests only.
export function formatBuildDate(iso: string, timeZone?: string) {
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(iso))
}

export function updateUrls(href: string, nonce: string, buildId?: string) {
  const current = new URL(href)
  if (!['https:', 'http:'].includes(current.protocol)) throw new Error('Web updates require an HTTP(S) app URL.')
  const manifest = new URL('build-info.json', new URL('./', current))
  manifest.searchParams.set('_dp_refresh', nonce)
  const reload = new URL(current)
  reload.searchParams.set('_dp_refresh', nonce)
  if (buildId) reload.searchParams.set('_dp_build', buildId)
  return { manifest: manifest.href, reload: reload.href }
}

export async function readLatestBuild(href: string, request: typeof fetch = fetch, nonce = String(Date.now())) {
  const response = await request(updateUrls(href, nonce).manifest, { cache: 'no-store', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`Unable to check the deployed build (${response.status}). No data or browser storage was changed.`)
  return validateBuildInfo(await response.json())
}

export async function prepareWebReload(href: string, request: typeof fetch = fetch, nonce = String(Date.now())) {
  const latest = await readLatestBuild(href, request, nonce)
  const url = updateUrls(href, nonce, latest.buildId).reload
  const response = await request(url, { cache: 'no-store', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15000) })
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error('Could not retrieve the latest app HTML. Nothing was reloaded.')
  const html = await response.text()
  const buildId = /<meta\s+name="app-build-id"\s+content="([\w.-]+)"\s*\/?\s*>/i.exec(html)?.[1]
  if (buildId !== latest.buildId) throw new Error('The deployment is still propagating, or the server returned an older page. Please retry shortly. Nothing was reloaded.')
  return { url, latest }
}

export function reloadBlockReason({ pending, failed, busy, preview, exported, acknowledged }: { pending: boolean; failed: boolean; busy: boolean; preview: boolean; exported: boolean; acknowledged: boolean }) {
  if (busy) return 'Wait for the Azure fetch to finish before updating.'
  if (pending && !failed) return 'Wait for pending saves or SharePoint synchronization to finish.'
  if ((failed || preview) && !exported) return 'Export a JSON backup first to preserve in-memory data and the fetched preview.'
  if (!acknowledged) return 'Confirm that you have saved or backed up your work before reloading.'
  return ''
}
