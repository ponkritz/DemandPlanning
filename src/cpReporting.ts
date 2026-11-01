import type { AzureWorkItem } from './domain'
import { approvalMonthOf } from './releaseSource.ts'

// Clinical Platform (CP) release reporting (docs/CP_Release_Reporting_Implementation.md). The CP data set is the
// CP_Release_Folder tree query: Release containers, their folders and the documents under them, with the 20 (or more)
// approver slots. A release is a Release container, never a codename, version or title: each document belongs to its
// nearest Release ancestor (Parent → ID). For a month M:
// - Supported(M): the containers with at least one qualifying QA/QE signature in M on a document anywhere under them;
// - Completed(M): the containers whose main release-level Release Notes (Release → Reports/Report folder → Release
//   Notes document) has a qualifying QA/QE signature in M — a reporting convention, not proof the document set is complete.
// A qualifying signature: an Artifact or Document, a role on the QA/QE allowlist (trimmed, case ignored), a name and a
// valid date in the same slot. The current State and the Author Approval Date never filter. Shared containers
// (Clinical Platform Global) are reported apart. Names come from the optional CP_Releases data set (Content per
// Release version), never decide the counting, and conflicts stay visible. Completion history across snapshots is not
// kept yet: a reapproved Release Notes in a later month counts as completion again (KNOWN-ISSUES).

export interface CpReportingSettings { roles: string[]; excluded: Record<string, string>; zeroPad: boolean }
export const defaultCpReportingSettings: CpReportingSettings = {
  roles: ['QAQE for Software', 'Quality Engineer', 'QA', 'QE', 'QA/QE', 'QE Software'],
  excluded: { '614437': 'Clinical Platform Global: shared work across releases, reported separately' },
  zeroPad: true,
}

// A field by its display name (the query's column names), else by its reference name's last part.
export type FieldColumns = { ref: string; name: string }[] | undefined
const squash = (text: string) => text.toLowerCase().replace(/[\s_]+/g, '')
export function fieldReader(columns: FieldColumns) {
  const refs = new Map((columns ?? []).map((column) => [squash(column.name), column.ref]))
  return (item: Pick<AzureWorkItem, 'fields'>, name: string): string | undefined => {
    const fields = item.fields ?? {}
    const wanted = squash(name)
    const ref = refs.get(wanted) ?? Object.keys(fields).find((key) => squash(key) === wanted || squash(key).endsWith(`.${wanted}`))
    const value = ref ? fields[ref] : undefined
    return value == null || String(value).trim() === '' ? undefined : String(value).trim()
  }
}

const documentTypes = new Set(['artifact', 'document'])
const isDocument = (item: AzureWorkItem) => documentTypes.has(item.workItemType.trim().toLowerCase())
const isRelease = (item: AzureWorkItem) => item.workItemType.trim().toLowerCase() === 'release'
const normalRole = (role: string) => role.trim().replace(/\s+/g, ' ').toLowerCase()
const validDate = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value)) ? value : undefined

export interface CpSignature { releaseId: number; documentId: number; documentTitle: string; documentType: string; state: string; path: string[]; slot: number; name: string; role: string; date: string; month: string; authorApprovalDate?: string; mainReleaseNotes: boolean; url: string }
export interface CpIssue { kind: 'missing-parent' | 'cycle' | 'no-release' | 'slot-incomplete' | 'qaqe-on-other-type' | 'multiple-release-notes' | 'completion-conflict' | 'version-unavailable' | 'name-conflict'; ids: number[]; text: string }
export interface CpContainer { id: number; title: string; url: string; excluded?: string }

// The tree as read: containers, every document's container and path, the qualifying QA/QE signatures and the data issues.
export function cpSignatures(items: AzureWorkItem[], columns: FieldColumns, settings: CpReportingSettings = defaultCpReportingSettings, timeZone?: string) {
  const field = fieldReader(columns)
  const byId = new Map(items.map((item) => [item.id, item]))
  const roles = new Set(settings.roles.map(normalRole))
  const issues: CpIssue[] = []
  const containers = new Map<number, CpContainer>()
  for (const item of items) if (isRelease(item)) containers.set(item.id, { id: item.id, title: item.title, url: item.url, ...(settings.excluded[String(item.id)] ? { excluded: settings.excluded[String(item.id)] } : {}) })
  // Nearest Release ancestor, with the path of titles from it down to the item.
  const ancestry = (item: AzureWorkItem): { release?: AzureWorkItem; path: AzureWorkItem[]; problem?: 'missing-parent' | 'cycle' } => {
    const path: AzureWorkItem[] = [item], seen = new Set([item.id])
    let current = item
    while (!isRelease(current)) {
      if (current.parentId == null) return { path }
      const parent = byId.get(current.parentId)
      if (!parent) return { path, problem: 'missing-parent' }
      if (seen.has(parent.id)) return { path, problem: 'cycle' }
      seen.add(parent.id); path.unshift(parent); current = parent
    }
    return { release: current, path }
  }
  const slotsOf = (item: AzureWorkItem) => [...new Set(Object.keys(item.fields ?? {}).flatMap((key) => { const found = /approvername(\d+)$/i.exec(squash(key)); return found ? [Number(found[1])] : [] }).concat((columns ?? []).flatMap((column) => { const found = /^approvername(\d+)$/i.exec(squash(column.name)); return found ? [Number(found[1])] : [] })))].sort((a, b) => a - b)
  const signatures: CpSignature[] = []
  const missing: number[] = [], cycles: number[] = [], orphans: number[] = []
  for (const item of items) {
    if (isRelease(item)) continue
    const slots = slotsOf(item).map((slot) => ({ slot, name: field(item, `ApproverName${slot}`), role: field(item, `ApproverFunction${slot}`), rawDate: field(item, `ApproverApprovalDate${slot}`) }))
    const dated = slots.filter((entry) => entry.rawDate)
    for (const entry of dated) if (!entry.name || !entry.role || !validDate(entry.rawDate)) issues.push({ kind: 'slot-incomplete', ids: [item.id], text: `${item.workItemType} ${item.id} “${item.title}”: approver slot ${entry.slot} has a date but ${!validDate(entry.rawDate) ? 'the date cannot be read' : !entry.name ? 'no name' : 'no role'}.` })
    const qaqe = dated.filter((entry) => entry.name && entry.role && validDate(entry.rawDate) && roles.has(normalRole(entry.role)))
    if (!isDocument(item)) {
      if (qaqe.length && item.workItemType.trim().toLowerCase() !== 'artifact review') issues.push({ kind: 'qaqe-on-other-type', ids: [item.id], text: `${item.workItemType} ${item.id} “${item.title}” has a dated QA/QE approval; only Artifacts and Documents count.` })
      continue
    }
    const { release, path, problem } = ancestry(item)
    if (problem === 'missing-parent') { missing.push(item.id); continue }
    if (problem === 'cycle') { cycles.push(item.id); continue }
    if (!release) { orphans.push(item.id); continue }
    const type = field(item, 'Type') ?? ''
    // Main Release Notes: Release container → Reports (or Report) folder → the Release Notes document.
    const folder = path.length === 3 ? path[1] : undefined
    const mainReleaseNotes = type.trim().toLowerCase() === 'release notes' && Boolean(folder && /^reports?$/i.test(folder.title.trim()))
    const authorApprovalDate = field(item, 'Author Approval Date')
    for (const entry of qaqe) {
      const date = validDate(entry.rawDate)!
      signatures.push({ releaseId: release.id, documentId: item.id, documentTitle: item.title, documentType: type, state: item.state, path: path.map((step) => step.title), slot: entry.slot, name: entry.name!, role: entry.role!, date, month: approvalMonthOf(date, timeZone) ?? date.slice(0, 7), ...(authorApprovalDate ? { authorApprovalDate } : {}), mainReleaseNotes, url: item.url })
    }
  }
  if (missing.length) issues.push({ kind: 'missing-parent', ids: missing, text: `${missing.length} document${missing.length === 1 ? '' : 's'} with a Parent that is not in the data set; not counted: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ', …' : ''}.` })
  if (cycles.length) issues.push({ kind: 'cycle', ids: cycles, text: `${cycles.length} document${cycles.length === 1 ? '' : 's'} in a Parent loop; not counted: ${cycles.slice(0, 20).join(', ')}.` })
  if (orphans.length) issues.push({ kind: 'no-release', ids: orphans, text: `${orphans.length} document${orphans.length === 1 ? '' : 's'} without a Release container above them; not counted: ${orphans.slice(0, 20).join(', ')}${orphans.length > 20 ? ', …' : ''}.` })
  // Release Notes documents not in the main Reports folder, and containers with several main Release Notes.
  for (const container of containers.values()) {
    const notes = new Set(signatures.filter((entry) => entry.releaseId === container.id && entry.mainReleaseNotes).map((entry) => entry.documentId))
    if (notes.size > 1) issues.push({ kind: 'multiple-release-notes', ids: [container.id, ...notes], text: `Release ${container.id} “${container.title}” has ${notes.size} main Release Notes documents (${[...notes].join(', ')}); check which one closes the release.` })
  }
  return { containers, signatures, issues }
}

// Release version from the container title: a leading version after an optional "Release", else one right after
// "Clinical Platform"; never a version inside brackets or further in the title.
export function cpTitleVersion(title: string) {
  const text = title.trim()
  const leading = /^(?:Release\s+)?(\d+(?:\.\d+){1,3})(?![\d.])/i.exec(text)
  if (leading) return leading[1]
  const afterPlatform = /Clinical\s*Platform\s+(\d+(?:\.\d+){1,3})(?![\d.])/i.exec(text.replace(/\([^)]*\)/g, ' '))
  return afterPlatform?.[1]
}
export function cpVersionKey(version: string | undefined, zeroPad = true) {
  const text = version?.trim().replace(/^v/i, '') ?? ''
  if (!/^\d+(?:\.\d+){0,3}$/.test(text)) return undefined
  const parts = text.split('.').map((part) => String(Number(part)))
  while (zeroPad && parts.length < 4) parts.push('0')
  return parts.join('.')
}

export type CpNameStatus = 'resolved_from_content' | 'candidate_from_title' | 'name_unavailable' | 'conflicting_names' | 'version_unavailable' | 'enrichment_not_supplied'
export interface CpName { releaseContainerId: number; sourceTitle: string; rawVersion?: string; normalizedVersion?: string; name?: string; displayLabel: string; nameStatus: CpNameStatus; nameSource?: string; supportingCPReleaseIds: number[]; candidateNames: { name: string; ids: number[] }[]; warnings: string[] }
interface NameEntry { ids: number[]; blank: number; names: Map<string, { name: string; ids: number[] }> }
// Version → Content names of the CP_Releases data set, built once per import.
export function cpNameIndex(releases: AzureWorkItem[] | undefined, columns: FieldColumns, zeroPad = true) {
  if (!releases) return undefined
  const field = fieldReader(columns)
  const index = new Map<string, NameEntry>(), exceptions: number[] = []
  for (const row of releases) {
    // The Release field as written ("26.2.0.0"), else the first version in it ("v26.2 (Setebos)" → 26.2).
    const written = field(row, 'Release')
    const key = cpVersionKey(written, zeroPad) ?? cpVersionKey(/\d+(?:\.\d+){1,3}/.exec(written ?? '')?.[0], zeroPad)
    if (!key) { exceptions.push(row.id); continue }
    const entry = index.get(key) ?? { ids: [] as number[], blank: 0, names: new Map<string, { name: string; ids: number[] }>() }
    entry.ids.push(row.id)
    const content = field(row, 'Content')?.replace(/\s+/g, ' ')
    if (!content) entry.blank += 1
    else { const normal = content.toLowerCase(); const found = entry.names.get(normal) ?? { name: content, ids: [] }; found.ids.push(row.id); entry.names.set(normal, found) }
    index.set(key, entry)
  }
  const withContent = releases.filter((row) => field(row, 'Content')).length
  return { index, exceptions, records: releases.length, withContent, versions: [...index.values()].filter((entry) => entry.names.size).length }
}
// A candidate only from an explicit title shape: "Release <version> <Name> … Clinical Platform", <Name> a capitalised word.
const titleCandidate = (title: string) => /^\s*(?:Release\s+)?\d+(?:\.\d+){1,3}\s+([A-Z][a-z]{2,})\b(?=.*Clinical\s*Platform)/.exec(title)?.[1]
export function cpReleaseName(container: Pick<CpContainer, 'id' | 'title'>, names: ReturnType<typeof cpNameIndex>, zeroPad = true): CpName {
  const rawVersion = cpTitleVersion(container.title), normalizedVersion = cpVersionKey(rawVersion, zeroPad)
  const base = { releaseContainerId: container.id, sourceTitle: container.title, ...(rawVersion ? { rawVersion } : {}), ...(normalizedVersion ? { normalizedVersion } : {}), supportingCPReleaseIds: [] as number[], candidateNames: [] as { name: string; ids: number[] }[], warnings: [] as string[] }
  const fromTitle = titleCandidate(container.title)
  const candidate = (status: CpNameStatus, warnings: string[] = []): CpName => fromTitle && rawVersion ? { ...base, name: fromTitle, displayLabel: `${fromTitle} ${rawVersion}`, nameStatus: 'candidate_from_title', nameSource: 'container title (pending review)', warnings: [...warnings, `${status === 'enrichment_not_supplied' ? 'No CP_Releases data set' : 'No Content name'}; “${fromTitle}” is read from the title and needs review.`] } : { ...base, displayLabel: container.title, nameStatus: status, warnings }
  if (!rawVersion || !normalizedVersion) return { ...base, displayLabel: container.title, nameStatus: 'version_unavailable', warnings: ['The container title has no release version this report can read.'] }
  if (!names) return candidate('enrichment_not_supplied')
  const entry = names.index.get(normalizedVersion)
  if (!entry || !entry.names.size) return candidate('name_unavailable', entry ? [`${entry.blank} CP release record${entry.blank === 1 ? '' : 's'} for ${rawVersion} without Content.`] : [`No CP release record with Release ${normalizedVersion} (${names.records} records read, ${names.withContent} with Content).`])
  const candidates = [...entry.names.values()]
  if (candidates.length > 1) return { ...base, displayLabel: container.title, nameStatus: 'conflicting_names', supportingCPReleaseIds: entry.ids, candidateNames: candidates, warnings: [`Different names for ${rawVersion}: ${candidates.map((found) => found.name).join(', ')}.`] }
  const [only] = candidates
  const warnings = entry.blank ? [`${entry.blank} of ${entry.ids.length} CP release records for ${rawVersion} have no Content.`] : []
  if (fromTitle && fromTitle.toLowerCase() !== only.name.toLowerCase()) warnings.push(`The title suggests “${fromTitle}”, Content says “${only.name}”.`)
  return { ...base, name: only.name, displayLabel: `${only.name} ${rawVersion}`, nameStatus: 'resolved_from_content', nameSource: 'CP_Releases.Content', supportingCPReleaseIds: only.ids, candidateNames: [], warnings }
}

export interface CpReleaseRow { container: CpContainer; name: CpName; supported: boolean; completed: boolean; completionReview?: string; signedDocuments: number; releaseNotesDate?: string; signatures: CpSignature[] }
// The month's report: one row per container with QA/QE activity in the month (shared containers apart), the issues.
export function cpMonthReport(tree: ReturnType<typeof cpSignatures>, month: string, names?: ReturnType<typeof cpNameIndex>, settings: CpReportingSettings = defaultCpReportingSettings) {
  const inMonth = tree.signatures.filter((entry) => entry.month === month)
  const issues = [...tree.issues]
  if (names && !names.withContent) issues.push({ kind: 'name-conflict', ids: [], text: `The names connection has ${names.records} records but none with a Content value: check that its query returns the Content field.` })
  const rows: CpReleaseRow[] = []
  for (const releaseId of [...new Set(inMonth.map((entry) => entry.releaseId))]) {
    const container = tree.containers.get(releaseId)!
    const signatures = inMonth.filter((entry) => entry.releaseId === releaseId)
    const notes = signatures.filter((entry) => entry.mainReleaseNotes)
    // Main Release Notes signed by QA/QE in other months too: a completion month that needs review.
    const otherMonths = [...new Set(tree.signatures.filter((entry) => entry.releaseId === releaseId && entry.mainReleaseNotes && entry.month !== month).map((entry) => entry.month))]
    const completionReview = notes.length && otherMonths.length ? `The main Release Notes also has a QA/QE signature in ${otherMonths.sort().join(', ')}; check the completion month.` : undefined
    if (completionReview) issues.push({ kind: 'completion-conflict', ids: [releaseId], text: `Release ${releaseId} “${container.title}”: ${completionReview}` })
    const name = cpReleaseName(container, names, settings.zeroPad)
    if (name.nameStatus === 'conflicting_names') issues.push({ kind: 'name-conflict', ids: [releaseId, ...name.supportingCPReleaseIds], text: `Release ${releaseId} “${container.title}”: ${name.warnings[0]}` })
    if (name.nameStatus === 'version_unavailable') issues.push({ kind: 'version-unavailable', ids: [releaseId], text: `Release ${releaseId} “${container.title}”: no release version in the title.` })
    rows.push({ container, name, supported: true, completed: notes.length > 0, ...(completionReview ? { completionReview } : {}), signedDocuments: new Set(signatures.map((entry) => entry.documentId)).size, ...(notes.length ? { releaseNotesDate: notes.map((entry) => entry.date).sort()[0] } : {}), signatures })
  }
  rows.sort((a, b) => Number(b.completed) - Number(a.completed) || b.signedDocuments - a.signedDocuments || b.container.id - a.container.id)
  const counted = rows.filter((row) => !row.container.excluded), shared = rows.filter((row) => row.container.excluded)
  return { month, rows: counted, shared, ...(names ? { names: { records: names.records, withContent: names.withContent, versions: names.versions, unreadable: names.exceptions.length } } : {}), supported: counted.length, completed: counted.filter((row) => row.completed).length, signedDocuments: new Set(counted.flatMap((row) => row.signatures.map((entry) => entry.documentId))).size, issues }
}
export type CpMonthReport = ReturnType<typeof cpMonthReport>
