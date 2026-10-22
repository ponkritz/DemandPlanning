import { parseWindchillPage } from './windchillViews.ts'

// Windchill from the browser itself (web app), like the Azure DevOps cloud views: the browser's own Windchill sign-in
// is sent with the request. The browser hands the answer to this app only when Windchill allows the app's address
// (CORS with credentials); otherwise the request fails and the message says what to check. Read-only GETs.
export interface BrowserWindchillResult { ok: boolean; status: number; message: string; services: string[] }
type Fetch = (url: string, init: RequestInit) => Promise<Response>

function blocked(service: string, origin: string) {
  return `The browser could not read Windchill's answer. Open ${service} in a new tab: if it asks you to sign in, sign in and try again; if it shows JSON, Windchill does not allow requests from this app (${origin}) — the Windchill administrator would have to allow this address (CORS with credentials). Until then use Open in browser and Import.`
}

async function get(url: string, service: string, origin: string, fetcher: Fetch) {
  let response: Response
  try { response = await fetcher(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json' } }) }
  catch { throw new Error(blocked(service, origin)) }
  if (response.status === 401 || response.status === 403) throw new Error(`Windchill refused the request (status ${response.status}). Sign in to Windchill in this browser, then try again.`)
  const text = await response.text()
  if (!response.ok) {
    let detail = ''
    try { detail = String((JSON.parse(text) as { error?: { message?: unknown } }).error?.message ?? '') } catch { /* no JSON body */ }
    throw new Error(`Windchill answered with status ${response.status}${detail ? `: ${detail}` : ''}. Check the object type, field names and values.`)
  }
  if (text.trim().startsWith('<')) throw new Error(`Windchill answered with a web page (likely its sign-in). Sign in to Windchill in this browser (open ${service} in a new tab), then try again.`)
  return text
}

// Test: the service root lists the domains, e.g. [{ path: …/odata/v7/DocMgmt }] → "v7/DocMgmt".
export async function testWindchillInBrowser(service: string, fetcher: Fetch = fetch, origin = location.origin): Promise<BrowserWindchillResult> {
  try {
    const body = JSON.parse(await get(service, service, origin, fetcher)) as unknown
    const base = `${service.replace(/\/+$/, '')}/`
    const domain = (entry: { path?: unknown; id?: unknown; name?: unknown } | null) => typeof entry?.path === 'string' && entry.path.startsWith(base) ? entry.path.slice(base.length).replace(/\/+$/, '') : entry?.id ?? entry?.name
    const list = Array.isArray(body) ? body.map(domain) : Array.isArray((body as { value?: unknown })?.value) ? (body as { value: { name?: unknown; url?: unknown }[] }).value.map((entry) => entry?.name ?? entry?.url) : []
    const services = list.filter((name): name is string => typeof name === 'string').slice(0, 100)
    return { ok: true, status: 200, message: services.length ? `Connected from this browser: ${services.length} services listed.` : 'Connected from this browser, but no services were listed.', services }
  } catch (error) { return { ok: false, status: 0, message: error instanceof Error ? error.message : String(error), services: [] } }
}

// A view's search: follows Windchill's next-page links on the same service (at most 100 pages / 20,000 rows).
export async function queryWindchillInBrowser(service: string, path: string, fetcher: Fetch = fetch, origin = location.origin) {
  const rows: Record<string, unknown>[] = []
  let next = `${service.replace(/\/+$/, '')}/${path}`
  for (let page = 0; next && page < 100; page += 1) {
    const result = parseWindchillPage(await get(next, service, origin, fetcher), service)
    rows.push(...result.rows)
    if (rows.length > 20000) throw new Error('The search returned more than 20,000 results. Narrow the filters.')
    next = result.next
  }
  return { rows }
}
