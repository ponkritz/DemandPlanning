// Windchill connection test from the desktop app: one read-only GET of the configured host's service root
// (https, a path under /Windchill/), with the Windows single sign-on of Chromium's network stack and the cookies of
// the app's Windchill sign-in window; redirects on the same host are followed.
// Returns the status and the names of the services the server lists (signIn when a login page answered); nothing is
// written.
function windchillUrl(request) {
  if (!request || typeof request.host !== 'string' || typeof request.servicePath !== 'string') throw new Error('Enter the Windchill host first.')
  const host = new URL(request.host)
  if (host.protocol !== 'https:' || host.username || host.password || host.pathname !== '/' || host.search || host.hash) throw new Error('The Windchill host must be an https address with no path.')
  if (!/^\/Windchill\/[\w./-]*$/i.test(request.servicePath) || request.servicePath.includes('..')) throw new Error('The service path must start with /Windchill/.')
  return new URL(request.servicePath, host.origin)
}

async function testWindchill(request, fetch) {
  const url = windchillUrl(request)
  let response
  // Redirects are followed, as a browser does (Windchill redirects for sign-on or a trailing "/"); one that ends on
  // another host is a sign-in page the app cannot complete.
  try { response = await fetch(url.href, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'follow' }) }
  catch (error) { return { ok: false, status: 0, message: `Could not reach ${url.host}: ${error instanceof Error ? error.message : 'network error'}. Check the host name, VPN and proxy.`, services: [] } }
  let finalHost = url.host
  try { if (response.url) finalHost = new URL(response.url).host } catch { /* keep the requested host */ }
  if (finalHost.toLowerCase() !== url.host.toLowerCase()) return { ok: false, status: response.status, message: `Windchill sent the app to a sign-in page on ${finalHost}. Click Sign in to complete it in a window, then test again.`, services: [], signIn: true }
  if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, message: 'Windchill refused the single sign-on (status ' + response.status + '). Click Sign in to log in in a window, then test again.', services: [], signIn: true }
  if (!response.ok) return { ok: false, status: response.status, message: `Windchill answered with status ${response.status}. Check the service path (e.g. /Windchill/servlet/odata).`, services: [] }
  // Read as text, so a non-JSON answer can be described: an XML service list is accepted; anything else is reported
  // with its type, final address and page title (a sign-in page, or REST not enabled at this path).
  let text = ''
  try { text = await response.text() } catch { text = '' }
  let body
  try { body = JSON.parse(text) } catch {
    const collections = [...text.matchAll(/<collection[^>]*href="([^"]+)"/gi)].map((match) => match[1])
    if (collections.length) return { ok: true, status: response.status, message: `Connected (XML service list): ${collections.length} services listed.`, services: collections.slice(0, 100) }
    const type = (response.headers && typeof response.headers.get === 'function' && response.headers.get('content-type')) || 'unknown type'
    let where = url.pathname
    try { if (response.url) where = new URL(response.url).pathname } catch { /* keep the requested path */ }
    const title = (/<title[^>]*>([^<]{1,120})<\/title>/i.exec(text)?.[1] ?? '').trim()
    const login = /sign[\s-]?in|log[\s-]?in|password|saml|oauth/i.test(`${title} ${where}`)
    return { ok: false, status: response.status, message: `Windchill answered with ${type} from ${where}${title ? ` (page title “${title}”)` : ''}, not JSON. ${login ? 'This looks like a sign-in page: click Sign in to complete it in a window, then test again.' : 'The REST (OData) service may not be enabled at this path; check the address in a browser.'}`, services: [], ...(login ? { signIn: true } : {}) }
  }
  // Standard OData lists services under "value"; Windchill REST lists its domains as an array of { id, name, path }
  // with a versioned path (…/odata/v7/DocMgmt), shown here as "v7/DocMgmt" — the start of a view's object type.
  const base = url.href.replace(/\/+$/, '') + '/'
  const domain = (entry) => typeof entry?.path === 'string' && entry.path.startsWith(base) ? entry.path.slice(base.length).replace(/\/+$/, '') : entry?.id ?? entry?.name
  const services = (Array.isArray(body) ? body.map(domain) : Array.isArray(body?.value) ? body.value.map((entry) => entry?.name ?? entry?.url) : []).filter((name) => typeof name === 'string').slice(0, 100)
  return { ok: true, status: response.status, message: services.length ? `Connected: ${services.length} services listed.` : 'Connected, but no services were listed.', services }
}

// Runs one Windchill view read-only: GET <service root>/<Domain/Set>?$filter=…&$select=…, following the server's
// next-page links on the same host and service root (at most 100 pages / 20,000 rows). Nothing is written.
const signInHint = 'Click Sign in under Settings → Windchill host, then fetch again.'
const queryPattern = /^(v\d+\/)?[A-Za-z][A-Za-z0-9_]*\/[A-Za-z][A-Za-z0-9_]*(\?[^#\s]*)?$/
async function queryWindchill(request, fetch) {
  const root = windchillUrl(request)
  if (typeof request.path !== 'string' || !queryPattern.test(request.path) || request.path.includes('..')) throw new Error('The Windchill view has no valid object type.')
  const base = root.href.replace(/\/+$/, '')
  let next = `${base}/${request.path}`
  const rows = []
  for (let page = 0; next && page < 100; page += 1) {
    const url = new URL(next)
    if (url.origin !== root.origin || !url.pathname.toLowerCase().startsWith(root.pathname.replace(/\/+$/, '').toLowerCase() + '/')) throw new Error('Windchill returned a next page outside the service; stopped.')
    let response
    try { response = await fetch(url.href, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'follow' }) }
    catch (error) { throw new Error(`Could not reach ${root.host}: ${error instanceof Error ? error.message : 'network error'}. Check the host name, VPN and proxy.`) }
    let finalHost = root.host
    try { if (response.url) finalHost = new URL(response.url).host } catch { /* keep the requested host */ }
    if (finalHost.toLowerCase() !== root.host.toLowerCase()) throw new Error(`Windchill sent the app to a sign-in page on ${finalHost}. ${signInHint}`)
    if (response.status === 401 || response.status === 403) throw new Error(`Windchill refused the single sign-on (status ${response.status}). ${signInHint}`)
    if (!response.ok) {
      let detail = ''
      try { const body = await response.json(); detail = String(body?.error?.message ?? '') } catch { /* no JSON body */ }
      throw new Error(`Windchill answered with status ${response.status}${detail ? `: ${detail}` : ''}. Check the object type, field names and values.`)
    }
    const type = (response.headers && typeof response.headers.get === 'function' && response.headers.get('content-type')) || ''
    if (/html/i.test(type)) throw new Error(`Windchill answered with a web page, not results (a sign-in page). ${signInHint}`)
    const body = await response.json()
    if (!Array.isArray(body?.value)) throw new Error('Windchill answered without a list of results; check the object type.')
    rows.push(...body.value)
    if (rows.length > 20000) throw new Error('The search returned more than 20,000 results. Narrow the filters.')
    next = typeof body['@odata.nextLink'] === 'string' ? new URL(body['@odata.nextLink'], url).href : ''
  }
  return { rows }
}

module.exports = { windchillUrl, testWindchill, queryWindchill }
