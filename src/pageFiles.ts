import { pageIdPattern } from './onDemand.ts'

// OND-120…OND-131, OND-133 Page file names: an On-Demand page (Table, Table + Insights, Dashboard) created from this
// version on is kept in Git under a name people can read — the page's name, two hyphens and the page's id:
//   on-demand/Supplier issues--supplier-issues.json   a page kept in one file (OND-08)
//   on-demand/Supplier issues--supplier-issues/       a page kept as row files (OND-31)
//   on-demand/conq.json            the form before (the id alone): every page that existed before keeps it for good,
//                                  also when renamed (product owner, 25 Nov 2026: "Leave CoNQ, moving forward maintain
//                                  it", OND-133); only the title inside the file changes
// The id stays the page's identity (menu layout, locks, dashboards, views, Tool Validations tabs): the name part is only
// for reading. The id is everything after the first "--": the name part never holds "--" and never ends with "-"
// (pageFileName), and the app never makes an id with "--" (pageIdFor joins with one hyphen).

export const pageFilesFolder = 'on-demand'
// OND-134: the blocks of an On-Demand Dashboard (DSH-08) in dashboards/, named as the page's own file — "<name>--<id>.json"
// for a Dashboard page created from this version on, "<id>.json" for one from before (kept for good).
export const dashboardsFolder = 'dashboards'
export type PageFolder = typeof pageFilesFolder | typeof dashboardsFolder
export const nameSeparator = '--'
export const maxNameChars = 60, maxNameBytes = 120
// OND-121: written once with the first named file: an older app lists it as a page it cannot
// read ("on-demand/app-update-required.json … is not an On-Demand page"), the clearest sign it can give that it must be
// updated; this app reads its minVersion (OND-128). Never a page: its stem is not a page id this app gives.
export const updateMarkerStem = 'app-update-required'
export const updateMarkerPath = `${pageFilesFolder}/${updateMarkerStem}.json`

const reservedWindows = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i
// OND-120: the name part — NFC, the characters a file system or URL refuses (/ \ : * ? " < > | and control characters)
// made a hyphen, spaces collapsed and trimmed, "--" made "-", no dot, space or hyphen at either end, at most 60
// characters and 120 bytes (UTF-8; never half a character), a Windows device name (CON, NUL, COM1 …) prefixed with "_".
// Empty → "Page".
export function pageFileName(name: string): string {
  let out = String(name ?? '').normalize('NFC')
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
  const chars = Array.from(out)
  let bytes = 0, kept = 0
  for (const char of chars) { const size = new TextEncoder().encode(char).length; if (kept >= maxNameChars || bytes + size > maxNameBytes) break; bytes += size; kept++ }
  out = chars.slice(0, kept).join('').replace(/[\s.-]+$/g, '')
  if (reservedWindows.test(out)) out = `_${out}`
  return out || 'Page'
}
// The stem of a page's file or folder: "<name>--<id>".
export function pageStem(name: string, id: string): string {
  if (!pageIdPattern.test(id)) throw new Error(`Not a valid page id: ${id}`)
  return `${pageFileName(name)}${nameSeparator}${id}`
}
// OND-122: a stem read back — the old form (the id alone) or the new one (name, "--", id); null for anything else (no
// slash, no "..", nothing a page could not have written), so a file name in Git never points outside the folder.
export interface ParsedStem { id: string; named: boolean }
export function parseStem(stem: string): ParsedStem | null {
  if (typeof stem !== 'string' || !stem || stem.length > 220 || /[/\\]/.test(stem) || stem.includes('..') || stem === updateMarkerStem) return null
  const at = stem.indexOf(nameSeparator)
  if (at < 0) return pageIdPattern.test(stem) ? { id: stem, named: false } : null
  const name = stem.slice(0, at), id = stem.slice(at + nameSeparator.length)
  if (!name.trim() || !pageIdPattern.test(id)) return null
  return { id, named: true }
}
export const isStem = (stem: string) => parseStem(stem) != null
// The paths of a stem (validated: never a path outside on-demand/).
function checked(stem: string) { if (!isStem(stem)) throw new Error(`Not a valid page id or page file name: ${JSON.stringify(stem).slice(0, 80)}`); return stem }
export const stemFilePath = (stem: string, folder: PageFolder = pageFilesFolder) => `${folder}/${checked(stem)}.json`
export const stemFolderPath = (stem: string) => `${pageFilesFolder}/${checked(stem)}`
// The page id of a path in the data repository (a page file, a page folder or a file in it); null for anything else.
export function pageIdOfPath(path: string, folder: PageFolder = pageFilesFolder): { id: string; stem: string } | null {
  const match = (folder === dashboardsFolder ? /(?:^|\/)dashboards\/([^/]+?)\.json$/ : /(?:^|\/)on-demand\/([^/]+?)(?:\.json|\/page\.json|\/rows|\/counter\.json)?$/).exec(path)
  if (!match) return null
  const parsed = parseStem(match[1])
  return parsed ? { id: parsed.id, stem: match[1] } : null
}

// ---- the folder listed (OND-122, OND-123) ----
export interface FolderEntryLike { name: string; path?: string; sha: string; type: 'file' | 'dir' }
export interface PageEntry { id: string; stem: string; named: boolean; kind: 'file' | 'dir'; sha: string; path: string }
export function pageEntryOf(entry: FolderEntryLike, folder: PageFolder = pageFilesFolder): PageEntry | null {
  // OND-134: in dashboards/ only files are dashboards.
  if (folder === dashboardsFolder && entry.type !== 'file') return null
  const stem = entry.type === 'file' ? (/^(.+)\.json$/.exec(entry.name)?.[1] ?? '') : entry.name
  const parsed = parseStem(stem)
  if (!parsed) return null
  return { id: parsed.id, stem, named: parsed.named, kind: entry.type, sha: entry.sha, path: entry.type === 'file' ? `${folder}/${stem}.json` : `${folder}/${stem}` }
}
// Where a page is: its stem, row files or one file, and the other files or folders of the same id that are not read
// (an older copy: both forms present, or two names after a change made outside this app) — flagged on the page.
export interface PageLocation { id: string; stem: string; rows: boolean; path: string; others: string[] }
// OND-123: the entries of on-demand/ grouped by page id. A folder (row files) wins over files (the old-form file next
// to it is the marker of OND-32); a file whose version is a marker's (markerShas) is never a page. Two or more
// candidates: the newer wins — by the time of each one's latest commit (`dates`, path → ISO time), else the named form,
// else the name — and the rest are listed in `others`.
export function resolvePages(entries: FolderEntryLike[], markerShas: Set<string> = new Set(), dates: Record<string, string> = {}, folder: PageFolder = pageFilesFolder): PageLocation[] {
  const byId = new Map<string, PageEntry[]>()
  for (const entry of entries) {
    const page = pageEntryOf(entry, folder)
    if (!page || (page.kind === 'file' && markerShas.has(page.sha))) continue
    byId.set(page.id, [...(byId.get(page.id) ?? []), page])
  }
  const out: PageLocation[] = []
  for (const [id, list] of byId) {
    const dirs = list.filter((entry) => entry.kind === 'dir')
    const candidates = dirs.length ? dirs : list
    const ranked = [...candidates].sort((a, b) => (dates[b.path] ?? '').localeCompare(dates[a.path] ?? '') || Number(b.named) - Number(a.named) || a.stem.localeCompare(b.stem))
    const chosen = ranked[0]
    // An old-form file next to the chosen folder is the marker of OND-32: not another copy.
    const others = list.filter((entry) => entry !== chosen && !(dirs.length && entry.kind === 'file' && !entry.named)).map((entry) => entry.kind === 'dir' ? `${entry.path}/` : entry.path)
    out.push({ id, stem: chosen.stem, rows: chosen.kind === 'dir', path: chosen.kind === 'dir' ? `${chosen.path}/` : chosen.path, others })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}
// OND-134: the blocks file of a Dashboard page — where it is (listed), else named as the page's own file (its stem): a
// page created from this version on gets "dashboards/<name>--<id>.json", a page from before "dashboards/<id>.json".
export const dashboardFilePath = (pageStemOrId: string) => stemFilePath(pageStemOrId, dashboardsFolder)
// OND-135: the older copies of a page (its file or folder, and its dashboard's blocks file): what stays and what
// "Delete older copy…" deletes — exactly the copies the reader does not read (OND-123).
export interface CopySet { folder: PageFolder; keep: string; older: string[] }
export const copySets = (page: PageLocation | undefined, dashboard: PageLocation | undefined): CopySet[] => [
  ...(page?.others.length ? [{ folder: pageFilesFolder as PageFolder, keep: page.path, older: page.others }] : []),
  ...(dashboard?.others.length ? [{ folder: dashboardsFolder as PageFolder, keep: dashboard.path, older: dashboard.others }] : []),
]
// The ids that have more than one candidate, so their latest commits are read to choose the newer (OND-123).
export function contested(entries: FolderEntryLike[], markerShas: Set<string> = new Set(), folder: PageFolder = pageFilesFolder): string[] {
  const paths = new Map<string, PageEntry[]>()
  for (const entry of entries) { const page = pageEntryOf(entry, folder); if (page && !(page.kind === 'file' && markerShas.has(page.sha))) paths.set(page.id, [...(paths.get(page.id) ?? []), page]) }
  return [...paths].flatMap(([, list]) => { const dirs = list.filter((entry) => entry.kind === 'dir'); const candidates = dirs.length ? dirs : list; return candidates.length > 1 ? candidates.map((entry) => entry.path) : [] })
}

// ---- the update marker (OND-121, OND-128) ----
// The app reads its minVersion (OND-128); a marker of OND-32 (on-demand/<id>.json of a page converted to row files) is
// known by its version without reading it.
export const updateMarker = (minVersion: string) => `${JSON.stringify({ schema: 1, kind: 'on-demand-update-required', minVersion, note: 'The On-Demand pages in this folder are kept in files named after the page (Name--id.json). App versions before this one do not find them: update the app before editing pages.' }, null, 1)}\n`
export function markerVersion(text: string | null): string | null {
  if (!text) return null
  try { const value = JSON.parse(text) as { kind?: unknown; minVersion?: unknown }; return value.kind === 'on-demand-update-required' && typeof value.minVersion === 'string' && /^\d+\.\d+\.\d+$/.test(value.minVersion) ? value.minVersion : null } catch { return null }
}
export function olderThan(version: string, required: string): boolean {
  const a = version.split('.').map(Number), b = required.split('.').map(Number)
  for (let at = 0; at < 3; at++) { if ((a[at] || 0) !== (b[at] || 0)) return (a[at] || 0) < (b[at] || 0) }
  return false
}
// The version (blob sha) Git gives a text, to know a marker by its listing alone.
export async function gitBlobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text)
  const head = new TextEncoder().encode(`blob ${body.length}\0`)
  const all = new Uint8Array(head.length + body.length); all.set(head); all.set(body, head.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', all))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
