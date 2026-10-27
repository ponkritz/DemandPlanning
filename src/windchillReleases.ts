import { normalizeVersion } from './releaseSource.ts'
import { windchillCell } from './windchillViews.ts'

// Releases in a Windchill export. Preferred source: the **Location** column (the document's folder path), whose folder
// names follow a few fixed shapes — the release name and number in one folder ("/Products/Remote Diagnostics 1.6/DHF")
// or in two ("/Remote Diagnostics/1.6/") — so a release is read from the deepest folder that holds a version
// (releaseFromLocation). Fallback: the document Name, which holds the release name(s), the release number(s) and then the
// document name, with any delimiters ("Remote Diagnostics 1.6 Verification Report", "IntelliSpace Portal - v12.1 -
// Test Plan", "CareLink_R3.2_SRS"). A name or folder can be "clubbed" over several releases, name + number pairs one
// after the other: "Ser1 Rel1_Ser2 Rel2_Test Plan" or "Viewer 1.6 & 1.7 SRS". A clubbed name is ONE release, kept as
// written ("Ser1 Rel1_Ser2 Rel2", number "Rel1 + Rel2"), counted once; its parts are kept for information. Every
// version in the text ends a part: its name is the text since the previous version (or the start); a version with
// no name before it (the "& 1.7") takes the previous part's name; the text after the last version is the document name. A version is two
// or more numbers joined by dots (1.6, 12.1.0.3), optionally after "v", "ver", "version", "R", "Rel" or "Release"; a
// single number counts only after one of those words ("Release 5", "rel2"); a version in brackets ("(v2)") is the
// document's revision and is skipped. Delimiters around names and versions
// (space, - _ | / : ; , + & "and", brackets) are dropped. The unique releases are name + number, ignoring case and
// spaces in the name and trailing zero parts in the number (3.1 = 3.1.0).
export interface DocumentRelease { name: string; release: string; raw: string; document: string; span: string }
export interface ReleasePart { name: string; release: string; raw: string }
export interface WindchillRelease { key: string; name: string; release: string; clubbed: boolean; parts: ReleasePart[]; documents: { name: string; row: Record<string, unknown> }[]; latest: string; latestAt?: number; locations: string[] }
export type ReleaseSource = 'location' | 'name'
export interface LocationRelease { name: string; release: string; folder: string; clubbed: boolean; parts: ReleasePart[] }
export interface UniqueLocation { location: string; count: number; releases: LocationRelease[] }

const sep = String.raw`[\s_\-|/:;,+&([{]`
const prefix = String.raw`(?:v|ver\.?|version|r|rel\.?|release)[\s_.:-]*`
const versionToken = new RegExp(String.raw`(^|${sep}+)(?:${prefix})?(\d+(?:\.\d+)+)(?![\d.]*\d)|(^|${sep}+)${prefix}(\d+)(?![\d.])`, 'gi')
const trimSeparators = (text: string) => text.replace(/^(?:[\s_\-|/:;,.+&()[\]{}]|(?<![a-z0-9])and(?![a-z0-9]))+|(?:[\s_\-|/:;,.+&([{]|(?<![a-z0-9])and(?![a-z0-9]))+$/gi, '').replace(/\s+/g, ' ').trim()

// Every release a document name names, in order, with the document name (the text after the last version).
export function releasesFromDocumentName(text: string): DocumentRelease[] {
  const value = text.replace(/\s+/g, ' ').trim()
  const found: { name: string; release: string; raw: string }[] = []
  let from = 0, end = 0
  for (const match of value.matchAll(versionToken)) {
    const lead = match[1] ?? match[3] ?? '', release = match[2] ?? match[4], at = match.index + lead.length
    // The version as written (prefix included: "rel1", "R3.2", "v12.1"), kept as is for the Location source.
    const raw = match[0].slice(lead.length)
    // A version in brackets is the document's revision ("DHF Index (v2)"), not a release.
    if (/[([{]\s*$/.test(lead) && /^\s*[)\]}]/.test(value.slice(match.index + match[0].length))) continue
    const name = trimSeparators(value.slice(from, at)) || found.at(-1)?.name || ''
    if (name) found.push({ name, release, raw })
    from = end = match.index + match[0].length
  }
  const document = trimSeparators(value.slice(end))
  // span: the text up to the last version, as written — the identity of a clubbed name.
  const span = trimSeparators(value.slice(0, end))
  return found.map((entry) => ({ ...entry, document, span }))
}
// A clubbed text (several name + version parts) as one release, kept as written; a single part as itself.
export function oneRelease(parts: ReleasePart[], span: string): { name: string; release: string; raw: string; clubbed: boolean; parts: ReleasePart[] } | undefined {
  if (!parts.length) return undefined
  if (parts.length === 1) return { ...parts[0], clubbed: false, parts }
  return { name: span, release: parts.map((part) => part.release).join(' + '), raw: parts.map((part) => part.raw).join(' + '), clubbed: true, parts }
}
// The first release of a document name (kept for single-release callers).
export const releaseFromDocumentName = (text: string): DocumentRelease | undefined => releasesFromDocumentName(text)[0]

// The column holding the folder path: "Location" if the export has it, else the first column naming a location, folder or path.
export function locationColumn(columns: string[]) {
  return columns.find((column) => column.trim().toLowerCase() === 'location') ?? columns.find((column) => /location|folder|path/i.test(column))
}
const pureVersion = /^(?:v|ver\.?|version|r|rel\.?|release)?[\s_.:-]*(\d+(?:\.\d+)*)$/i
// The release a folder path names: from the deepest folder that holds a version — the name and version in one folder
// ("Remote Diagnostics 1.6"), a clubbed folder ("Ser1 Rel1_Ser2 Rel2", "Viewer 1.6 & 1.7": one release as written), or
// a folder that is only a version under the folder that is the name ("Remote Diagnostics/1.6", "CareLink/R3.2"). The
// folders after it (the document type, "DHF", "Test Reports") are ignored. The release number is kept exactly as the
// folder writes it ("R3.2", "rel1", "1.6.0"): different texts are different releases. Empty when no folder holds a version.
export function releasesFromLocation(location: string): LocationRelease[] {
  const folders = location.split(/[\\/]+/).map((folder) => folder.trim()).filter(Boolean)
  for (let index = folders.length - 1; index >= 0; index -= 1) {
    const folder = folders[index], path = folders.slice(0, index + 1).join('/')
    const bare = pureVersion.exec(folder)
    if (bare && /\d/.test(bare[1])) {
      const parent = folders[index - 1]
      if (parent && !pureVersion.test(parent) && !releasesFromDocumentName(parent).length) { const part = { name: trimSeparators(parent), release: folder, raw: folder }; return [{ ...part, folder: path, clubbed: false, parts: [part] }] }
      continue
    }
    const found = releasesFromDocumentName(folder)
    const one = oneRelease(found.map((entry) => ({ name: entry.name, release: entry.raw, raw: entry.raw })), found[0]?.span ?? folder)
    if (one) return [{ name: one.name, release: one.release, folder: path, clubbed: one.clubbed, parts: one.parts }]
  }
  return []
}
export const releaseFromLocation = (location: string): LocationRelease | undefined => releasesFromLocation(location)[0]
// Every distinct Location value with its document count and the release read from it, most documents first.
export function uniqueLocations(rows: Record<string, unknown>[], column: string): UniqueLocation[] {
  const counts = new Map<string, number>()
  for (const row of rows) { const location = windchillCell(row, column).trim(); if (location) counts.set(location, (counts.get(location) ?? 0) + 1) }
  return [...counts].map(([location, count]) => ({ location, count, releases: releasesFromLocation(location) })).sort((a, b) => b.count - a.count || a.location.localeCompare(b.location))
}

// The column holding the document names: "Name" if the export has it, else the first column whose name contains "name".
export function documentNameColumn(columns: string[]) {
  return columns.find((column) => column.trim().toLowerCase() === 'name') ?? columns.find((column) => /name/i.test(column) && !/organi[sz]ation|context|creator|modifier/i.test(column)) ?? columns[0] ?? ''
}
const dateColumn = (columns: string[]) => columns.find((column) => /last modified|modified|released|date/i.test(column))
const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
// A date as a Windchill export writes it, as a UTC timestamp: ISO (2026-10-01, 2026-10-01T09:15), day-month-year with
// the month as a word (27-Oct-2026, 27 Oct 2026 09:15, Oct 27, 2026), dotted (27.10.2026) or slashed (27/10/2026,
// 10/27/2026: the part above 12 is the day; when both could be the month, month/day/year is assumed), each with an
// optional time. Undefined when the text is not a date, so that it is never mistaken for one.
export function parseExportDate(text: string): number | undefined {
  const value = text.trim()
  if (!value) return undefined
  const time = (hours = '0', minutes = '0', seconds = '0') => [Number(hours), Number(minutes), Number(seconds)]
  const stamp = (year: number, month: number, day: number, parts: number[] = [0, 0, 0]) => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
    const at = Date.UTC(year, month - 1, day, ...parts)
    return new Date(at).getUTCDate() === day ? at : undefined
  }
  const clock = String.raw`(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(?:(AM|PM))?\s*(?:Z|UTC|[+-]\d{2}:?\d{2})?)?`
  const pm = (hours: string | undefined, marker: string | undefined) => { let h = Number(hours ?? 0); if (marker?.toUpperCase() === 'PM' && h < 12) h += 12; if (marker?.toUpperCase() === 'AM' && h === 12) h = 0; return String(h) }
  let m = new RegExp(String.raw`^(\d{4})-(\d{2})-(\d{2})${clock}$`, 'i').exec(value)
  if (m) return stamp(Number(m[1]), Number(m[2]), Number(m[3]), time(pm(m[4], m[7]), m[5], m[6]))
  m = new RegExp(String.raw`^(\d{1,2})[-\s.]([A-Za-z]{3})[A-Za-z]*[-\s.,]+(\d{4})${clock}$`, 'i').exec(value)
  if (m) { const month = monthNames.indexOf(m[2].toLowerCase()) + 1; return month ? stamp(Number(m[3]), month, Number(m[1]), time(pm(m[4], m[7]), m[5], m[6])) : undefined }
  m = new RegExp(String.raw`^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})${clock}$`, 'i').exec(value)
  if (m) { const month = monthNames.indexOf(m[1].toLowerCase()) + 1; return month ? stamp(Number(m[3]), month, Number(m[2]), time(pm(m[4], m[7]), m[5], m[6])) : undefined }
  m = new RegExp(String.raw`^(\d{1,2})\.(\d{1,2})\.(\d{4})${clock}$`, 'i').exec(value)
  if (m) return stamp(Number(m[3]), Number(m[2]), Number(m[1]), time(pm(m[4], m[7]), m[5], m[6]))
  m = new RegExp(String.raw`^(\d{1,2})/(\d{1,2})/(\d{4})${clock}$`, 'i').exec(value)
  if (m) { const a = Number(m[1]), b = Number(m[2]); const [month, day] = a > 12 ? [b, a] : [a, b]; return stamp(Number(m[3]), month, day, time(pm(m[4], m[7]), m[5], m[6])) }
  return undefined
}

export interface ReleaseOptions { source?: ReleaseSource | 'auto'; nameColumn?: string; locationColumn?: string }
// Unique releases of an export. Source 'location' reads the Location column, 'name' the document names, 'auto' (the
// default) Location when the export has such a column, else the names. A document counts once per release it names.
export function windchillReleases(rows: Record<string, unknown>[], columns: string[], options: ReleaseOptions | string = {}) {
  const chosen = typeof options === 'string' ? { nameColumn: options } : options
  const nameColumn = chosen.nameColumn || documentNameColumn(columns)
  const location = chosen.locationColumn || locationColumn(columns)
  const source: ReleaseSource = chosen.source === 'name' || (chosen.source !== 'location' && !location) ? 'name' : 'location'
  const byKey = new Map<string, WindchillRelease>()
  const unmatched: string[] = []
  const date = dateColumn(columns)
  for (const row of rows) {
    const text = windchillCell(row, nameColumn).trim()
    const folder = source === 'location' && location ? windchillCell(row, location).trim() : ''
    // From Location the number is kept as written (CON-72); from the names trailing zeros are ignored (CON-71).
    // A clubbed name or folder is one release (oneRelease), kept as written and counted once.
    const parsed = releasesFromDocumentName(text)
    const release = source === 'location'
      ? (([entry]) => entry && { ...entry, document: text, key: entry.release.toLowerCase() })(releasesFromLocation(folder))
      : (() => { const one = oneRelease(parsed, parsed[0]?.span ?? ''); return one && { ...one, document: parsed[0]?.document ?? '', key: one.clubbed ? one.release.toLowerCase() : normalizeVersion(one.release) } })()
    if (!release) { if (text || folder) unmatched.push(source === 'location' ? folder || text : text); continue }
    const when = date ? windchillCell(row, date) : ''
    {
      const key = `${release.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}\u0000${release.key}`
      const entry = byKey.get(key) ?? { key, name: release.name, release: release.release, clubbed: release.clubbed, parts: release.parts, documents: [], latest: '', locations: [] }
      if (entry.documents.some((doc) => doc.row === row)) continue
      entry.documents.push({ name: release.document || text, row })
      if (folder && !entry.locations.includes(folder)) entry.locations.push(folder)
      // The latest date by value; text that is not a date is compared as text, only among such texts.
      const at = parseExportDate(when)
      if (at !== undefined ? entry.latestAt === undefined || at > entry.latestAt : entry.latestAt === undefined && when > entry.latest) { entry.latest = when; entry.latestAt = at }
      byKey.set(key, entry)
    }
  }
  // Newest first by the latest date (releases without a readable date last), then by name and version.
  const releases = [...byKey.values()].sort((a, b) => (b.latestAt ?? -Infinity) - (a.latestAt ?? -Infinity) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || b.release.localeCompare(a.release, undefined, { numeric: true }))
  const clubbed = releases.filter((entry) => entry.clubbed).length
  const locations = source === 'location' && location ? uniqueLocations(rows, location) : []
  return { releases, unmatched, clubbed, nameColumn, locationColumn: location, source, locations, dateColumn: date }
}

// The month (YYYY-MM) of a release's latest date, from the parsed value; undefined when no date could be read.
export const releaseMonth = (entry: Pick<WindchillRelease, 'latestAt'>) => entry.latestAt === undefined ? undefined : new Date(entry.latestAt).toISOString().slice(0, 7)
// The releases whose latest date falls in the month (YYYY-MM), as chosen in the header month picker (CON-73).
export const releasesInMonth = <T extends Pick<WindchillRelease, 'latestAt'>>(releases: T[], month: string) => releases.filter((entry) => releaseMonth(entry) === month)

// The releases of a Windchill export with the latest date in the month, as "name number" texts for the Pulse Check
// Supported line (QV-33), newest first.
export const windchillSupported = (rows: Record<string, unknown>[], columns: string[], month: string) => releasesInMonth(windchillReleases(rows, columns).releases, month).map((entry) => `${entry.name} ${entry.release}`)

// The analysis file saved to the Git data repository (windchill-analysis/<export>-locations.json): every distinct
// Location with its document count and the release read from it, plus the unique releases — so that the folder
// naming can be studied and the parser checked against the real exports. No document contents, no credentials.
export interface WindchillLocationsFile { schema: 1; kind: 'windchill-locations'; viewId: string; export: string; column: string; generatedAt: string; documents: number; locations: UniqueLocation[]; releases: { name: string; release: string; documents: number; locations: string[] }[] }
export const windchillAnalysisFolder = 'windchill-analysis'
export function windchillLocationsFile(view: { id: string; name: string }, result: ReturnType<typeof windchillReleases>, documents: number, generatedAt = new Date().toISOString()): WindchillLocationsFile {
  return { schema: 1, kind: 'windchill-locations', viewId: view.id, export: view.name, column: result.locationColumn ?? '', generatedAt, documents, locations: result.locations, releases: result.releases.map((entry) => ({ name: entry.name, release: entry.release, documents: entry.documents.length, locations: entry.locations })) }
}
