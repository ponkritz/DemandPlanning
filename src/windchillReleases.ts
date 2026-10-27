import { normalizeVersion } from './releaseSource.ts'
import { windchillCell } from './windchillViews.ts'

// Releases in a Windchill export: each document's Name holds the release name(s), the release number(s) and then the
// document name, with any delimiters ("Remote Diagnostics 1.6 Verification Report", "IntelliSpace Portal - v12.1 -
// Test Plan", "CareLink_R3.2_SRS"). A document can be "clubbed" over several releases, name + number pairs one after
// the other: "Service1_rel1.0_Service2_rel2.3_Test Plan" or "Viewer 1.6 & 1.7 SRS". Every version in the name ends a
// release: its name is the text since the previous version (or the start); a version with no name before it (the
// "& 1.7") takes the previous release's name; the text after the last version is the document name. A version is two
// or more numbers joined by dots (1.6, 12.1.0.3), optionally after "v", "ver", "version", "R", "Rel" or "Release"; a
// single number counts only after one of those words ("Release 5", "rel2"); a version in brackets ("(v2)") is the
// document's revision and is skipped. Delimiters around names and versions
// (space, - _ | / : ; , + & "and", brackets) are dropped. The unique releases are name + number, ignoring case and
// spaces in the name and trailing zero parts in the number (3.1 = 3.1.0).
export interface DocumentRelease { name: string; release: string; document: string }
export interface WindchillRelease { key: string; name: string; release: string; documents: { name: string; row: Record<string, unknown> }[]; latest: string }

const sep = String.raw`[\s_\-|/:;,+&([{]`
const prefix = String.raw`(?:v|ver\.?|version|r|rel\.?|release)[\s_.:-]*`
const versionToken = new RegExp(String.raw`(^|${sep}+)(?:${prefix})?(\d+(?:\.\d+)+)(?![\d.]*\d)|(^|${sep}+)${prefix}(\d+)(?![\d.])`, 'gi')
const trimSeparators = (text: string) => text.replace(/^(?:[\s_\-|/:;,.+&()[\]{}]|(?<![a-z0-9])and(?![a-z0-9]))+|(?:[\s_\-|/:;,.+&([{]|(?<![a-z0-9])and(?![a-z0-9]))+$/gi, '').replace(/\s+/g, ' ').trim()

// Every release a document name names, in order, with the document name (the text after the last version).
export function releasesFromDocumentName(text: string): DocumentRelease[] {
  const value = text.replace(/\s+/g, ' ').trim()
  const found: { name: string; release: string }[] = []
  let from = 0, end = 0
  for (const match of value.matchAll(versionToken)) {
    const lead = match[1] ?? match[3] ?? '', release = match[2] ?? match[4], at = match.index + lead.length
    // A version in brackets is the document's revision ("DHF Index (v2)"), not a release.
    if (/[([{]\s*$/.test(lead) && /^\s*[)\]}]/.test(value.slice(match.index + match[0].length))) continue
    const name = trimSeparators(value.slice(from, at)) || found.at(-1)?.name || ''
    if (name) found.push({ name, release })
    from = end = match.index + match[0].length
  }
  const document = trimSeparators(value.slice(end))
  return found.map((entry) => ({ ...entry, document }))
}
// The first release of a document name (kept for single-release callers).
export const releaseFromDocumentName = (text: string): DocumentRelease | undefined => releasesFromDocumentName(text)[0]

// The column holding the document names: "Name" if the export has it, else the first column whose name contains "name".
export function documentNameColumn(columns: string[]) {
  return columns.find((column) => column.trim().toLowerCase() === 'name') ?? columns.find((column) => /name/i.test(column) && !/organi[sz]ation|context|creator|modifier/i.test(column)) ?? columns[0] ?? ''
}
const dateColumn = (columns: string[]) => columns.find((column) => /last modified|modified|released|date/i.test(column))

export function windchillReleases(rows: Record<string, unknown>[], columns: string[], nameColumn = documentNameColumn(columns)) {
  const byKey = new Map<string, WindchillRelease>()
  const unmatched: string[] = []
  let clubbed = 0
  const date = dateColumn(columns)
  for (const row of rows) {
    const text = windchillCell(row, nameColumn)
    const found = releasesFromDocumentName(text)
    if (!found.length) { if (text.trim()) unmatched.push(text.trim()); continue }
    if (found.length > 1) clubbed += 1
    const when = date ? windchillCell(row, date) : ''
    // A clubbed document counts for each release it names (once per release).
    for (const release of found) {
      const key = `${release.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}\u0000${normalizeVersion(release.release)}`
      const entry = byKey.get(key) ?? { key, name: release.name, release: release.release, documents: [], latest: '' }
      if (entry.documents.some((doc) => doc.row === row)) continue
      entry.documents.push({ name: release.document || text, row })
      if (when > entry.latest) entry.latest = when
      byKey.set(key, entry)
    }
  }
  const releases = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || b.release.localeCompare(a.release, undefined, { numeric: true }))
  return { releases, unmatched, clubbed, nameColumn, dateColumn: date }
}
