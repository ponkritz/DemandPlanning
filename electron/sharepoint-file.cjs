// KPT-02: reads one Excel file from SharePoint, read only, for the KPI tracker. The desktop app downloads it with a GET
// through SharePoint's REST API (…/_api/web/GetFileByServerRelativeUrl('<path>')/$value) in its own sign-in session:
// the company's Microsoft sign-in is completed in the app's sign-in window, whose cookies the download then uses — no
// app registration (tenant / client ID) and no password in the app. Nothing is ever written to SharePoint.

const maxBytes = 20 * 1024 * 1024

// The file's link as SharePoint gives it ("Copy path", or a "/:x:/r/" link): https only, no user name or password, a
// site under /sites/ or /teams/, an .xlsx file. The query (?d=…&web=1) is dropped.
function sharePointFileUrl(request) {
  let url
  try { url = new URL(String(request?.fileUrl ?? '').trim()) } catch { throw new Error('Paste the link of the Excel file in SharePoint (Copy path or Copy link).') }
  if (url.protocol !== 'https:') throw new Error('The SharePoint link must start with https://.')
  if (url.username || url.password) throw new Error('The SharePoint link must not contain a user name or password.')
  let path = url.pathname.replace(/^\/:[a-z]:\/[a-z]\//i, '/')
  try { path = decodeURIComponent(path) } catch { throw new Error('The SharePoint link is not a valid address.') }
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 3 || !/^(sites|teams)$/i.test(parts[0]) || parts.some((part) => part === '..' || part === '.')) throw new Error('The link must point to a file in a SharePoint site (…/sites/<site>/…/<file>.xlsx).')
  if (!/\.xlsx$/i.test(parts[parts.length - 1])) throw new Error('The KPI tracker must be an .xlsx file.')
  return { origin: url.origin, host: url.host, site: `/${parts[0]}/${parts[1]}`, path: `/${parts.join('/')}`, name: parts[parts.length - 1] }
}

// The REST address of the file's content: the server-relative path, each segment encoded, quotes doubled.
function fileContentUrl(file) {
  const encoded = file.path.split('/').map((part) => encodeURIComponent(part).replace(/'/g, "''")).join('/')
  return `${file.origin}${file.site.split('/').map(encodeURIComponent).join('/')}/_api/web/GetFileByServerRelativeUrl('${encoded}')/$value`
}

// One GET; the answer is the workbook's bytes, or a message that says what to do (sign in, check the link).
async function readSharePointFile(request, fetch) {
  const file = sharePointFileUrl(request)
  let response
  try { response = await fetch(fileContentUrl(file), { method: 'GET', headers: { Accept: 'application/octet-stream' }, redirect: 'follow' }) }
  catch (error) { return { ok: false, status: 0, message: `Could not reach ${file.host}: ${error instanceof Error ? error.message : 'network error'}. Check the VPN and proxy.` } }
  let finalHost = file.host
  try { if (response.url) finalHost = new URL(response.url).host } catch { /* keep the requested host */ }
  if (finalHost.toLowerCase() !== file.host.toLowerCase()) return { ok: false, status: response.status, signIn: true, message: `SharePoint sent the app to a sign-in page on ${finalHost}. Click Sign in to SharePoint, complete the login in the window, then read again.` }
  if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, signIn: true, message: `SharePoint refused access (status ${response.status}). Click Sign in to SharePoint; if it still fails, check that you can open the file in SharePoint.` }
  if (response.status === 404) return { ok: false, status: 404, message: `${file.name} was not found at that link. Copy the link again from SharePoint (Copy path).` }
  if (!response.ok) return { ok: false, status: response.status, message: `SharePoint answered with status ${response.status}.` }
  const length = Number(response.headers?.get?.('content-length') ?? 0)
  if (length > maxBytes) return { ok: false, status: response.status, message: `${file.name} is larger than 20 MB.` }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > maxBytes) return { ok: false, status: response.status, message: `${file.name} is larger than 20 MB.` }
  // An .xlsx file is a zip (it starts with "PK"); anything else is a page (often a sign-in page), not the workbook.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { ok: false, status: response.status, signIn: true, message: 'SharePoint did not return the Excel file (probably a sign-in page). Click Sign in to SharePoint, then read again.' }
  const modified = response.headers?.get?.('last-modified') ?? ''
  return { ok: true, status: response.status, message: `Read ${file.name} from SharePoint.`, name: file.name, modified, bytes }
}

module.exports = { sharePointFileUrl, fileContentUrl, readSharePointFile, maxBytes }
