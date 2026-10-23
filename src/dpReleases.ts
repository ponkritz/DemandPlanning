import type { AppState, AzureWorkItem } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { approvalDateFrom, approvalMonthOf, attachFeatures, normalizeVersion, type RegisterOptions, type ReleaseEntry } from './releaseSource.ts'
import { profileForDataSet } from './streams.ts'
import { viewSource } from './viewSources.ts'

// DP releases combine two data sets: the Release work items of the DHP release register (Pedestal) are the releases;
// the DHFI documents give each its date. A Pedestal Release's Title names the release and its version ("RSGMS
// 3.0.0.2"); the DHFI list is searched for documents whose Title names both, ignoring spaces and punctuation inside
// words ("RS GMS", "RS-GMS" and "RSGMS" are the same), with the exact version (2.1 = 2.1.0, never 2.10). The latest
// Author Approval Date (else Closed Date) of those documents is the release's date and puts it in a month. Pedestal
// Releases without a DHFI document (or without a dated one) have no month and are listed apart as "No DHFI yet".
// Each release is matched to a QMS-0025 Feature fuzzily, like every DP release (releaseSource.matchScore).

// The Pedestal fields shown, by their name in the query; the reference name may carry any prefix (Custom., Philips., …).
export const pedestalFields = ['SourceProgram', 'PsName', 'Release', 'ReleaseIntent', 'Year', 'PI', 'VerificationDeviation', 'IsDesignReview', 'DRPEDate', 'DRPEStatus', 'DRPCDate', 'DRPCStatus', 'DRfHDate', 'DRfHStatus', 'DDTDate', 'DDTStatus'] as const
export type PedestalField = typeof pedestalFields[number]
export const designReviews = [['DRPE', 'DRPEDate', 'DRPEStatus'], ['DRPC', 'DRPCDate', 'DRPCStatus'], ['DRfH', 'DRfHDate', 'DRfHStatus'], ['DDT', 'DDTDate', 'DDTStatus']] as const

export function fieldOf(item: Pick<AzureWorkItem, 'fields'>, name: string) {
  const fields = item.fields ?? {}
  const wanted = name.toLowerCase()
  const key = Object.keys(fields).find((ref) => ref.toLowerCase() === wanted || ref.toLowerCase().endsWith(`.${wanted}`))
  const value = key ? fields[key] : undefined
  return value == null || value === '' ? undefined : String(value)
}

export interface PedestalRelease { item: AzureWorkItem; values: Partial<Record<PedestalField, string>> }
export const isPedestalRelease = (item: AzureWorkItem) => item.workItemType.trim().toLowerCase() === 'release' && item.state.trim().toLowerCase() !== 'removed'
export function pedestalRelease(item: AzureWorkItem): PedestalRelease {
  return { item, values: Object.fromEntries(pedestalFields.flatMap((name) => { const value = fieldOf(item, name); return value ? [[name, value]] : [] })) }
}

// The Pedestal Release work items among the fetched views (the DHP release register, a reference connection), except
// the view itself; each work item once. The query names its columns by display name ([PI], [DRPEDate], …): each value is
// also kept under its column's name, so it is found whatever reference name Azure DevOps gives the field.
export function pedestalItems(sources: { connectionId?: string; items: AzureWorkItem[]; columns?: { ref: string; name: string }[] }[] | undefined, except?: string) {
  const seen = new Set<string>()
  return (sources ?? []).filter((source) => source.connectionId !== except).flatMap((source) => source.items.filter((item) => isPedestalRelease(item) && !seen.has(item.key) && seen.add(item.key)).map((item) => {
    const named = (source.columns ?? []).flatMap(({ ref, name }) => name && name !== ref && item.fields?.[ref] != null ? [[name, item.fields[ref]]] : [])
    return named.length ? { ...item, fields: { ...Object.fromEntries(named), ...item.fields } } : item
  }))
}

// The release named by a Pedestal Release's Title: the version marked "v" or "Release", else the first version in it
// ("RSGMS 3.0.0.2", "Viewer v2.1 (PI 26.3)" → 3.0.0.2, 2.1), and the words before it as the name; a Title without a
// version is a release without a number.
const versionIn = /(?:^|[^\d.])(?:v\.?\s*|rel(?:ease)?\s*[-_:.]?\s*)?(\d+(?:\.\d+)+)(?![\d.]*\d)/gi
export function titleRelease(title: string): { name: string; release: string } {
  const text = title.replace(/\s+/g, ' ').trim()
  const matches = [...text.matchAll(versionIn)]
  const found = matches.find((match) => /(?:\bv\.?|\brel)/i.test(match[0])) ?? matches[0]
  if (!found) return { name: text, release: '' }
  const index = text.indexOf(found[1], found.index)
  const before = text.slice(0, index).replace(/(?:\bv\.?|\brel(?:ease)?)\s*[-_:.]?\s*$/i, '').replace(/\s*[|:_–-]\s*$/, '').trim()
  const after = text.slice(index + found[1].length).replace(/^\s*[|:_–-]\s*/, '').trim()
  return { name: before || after || text, release: found[1] }
}

// Whether a document Title names a release: its name ignoring spaces and punctuation inside words, and its exact
// version (none wanted: the Title has no other version).
const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '')
export function namesRelease(title: string, name: string, release: string) {
  const wanted = squash(name)
  if (!wanted || !squash(title).includes(wanted)) return false
  const version = normalizeVersion(release)
  const found = [...title.matchAll(versionIn)].map((match) => normalizeVersion(match[1]))
  return version ? found.includes(version) : true
}

// A DHFI document's date: Author Approval Date (any approval-date field), else Closed Date.
export const dhfiDateOf = (item: Pick<AzureWorkItem, 'approvalDate' | 'closedDate' | 'fields'>) => item.approvalDate ?? approvalDateFrom(item.fields ?? {}) ?? item.closedDate
// The DHFI list indexed once: each document's squashed Title and versions, and the documents by version, so a release
// with a version checks only the documents carrying it.
export interface DhfiIndex { all: { item: AzureWorkItem; flat: string }[]; byVersion: Map<string, { item: AzureWorkItem; flat: string }[]> }
export function indexDhfi(dhfi: AzureWorkItem[]): DhfiIndex {
  const all = dhfi.map((item) => ({ item, flat: squash(item.title) }))
  const byVersion = new Map<string, { item: AzureWorkItem; flat: string }[]>()
  all.forEach((entry, index) => { for (const version of new Set([...dhfi[index].title.matchAll(versionIn)].map((match) => normalizeVersion(match[1])))) { const list = byVersion.get(version) ?? []; list.push(entry); byVersion.set(version, list) } })
  return { all, byVersion }
}
export function dhfiFor(name: string, release: string, dhfi: AzureWorkItem[] | DhfiIndex) {
  const index = Array.isArray(dhfi) ? indexDhfi(dhfi) : dhfi
  const wanted = squash(name)
  if (!wanted) return []
  const version = normalizeVersion(release)
  return (version ? index.byVersion.get(version) ?? [] : index.all).filter((entry) => entry.flat.includes(wanted)).map((entry) => entry.item)
}

export interface DpRelease extends ReleaseEntry { pedestal: PedestalRelease; month?: string }
// All Pedestal Releases, each with its DHFI documents, date and month, and its Feature match; by name, newest release first.
// The last results are kept: the pages and Pulse Check ask for the same inputs on every render.
const recent: { pedestal: AzureWorkItem[]; dhfi: AzureWorkItem[]; backlog: AzureWorkItem[]; threshold: number | undefined; timeZone: string | undefined; result: DpRelease[] }[] = []
export function dpReleases(pedestal: AzureWorkItem[], dhfi: AzureWorkItem[], backlog: AzureWorkItem[], options: Omit<RegisterOptions, 'rule' | 'fuzzy'> = {}, timeZone?: string): DpRelease[] {
  const hit = recent.find((entry) => entry.pedestal === pedestal && entry.dhfi === dhfi && entry.backlog === backlog && entry.threshold === options.threshold && entry.timeZone === timeZone)
  if (hit) return hit.result
  const result = computeDpReleases(pedestal, dhfi, backlog, options, timeZone)
  recent.unshift({ pedestal, dhfi, backlog, threshold: options.threshold, timeZone, result }); recent.splice(6)
  return result
}
function computeDpReleases(pedestal: AzureWorkItem[], dhfi: AzureWorkItem[], backlog: AzureWorkItem[], options: Omit<RegisterOptions, 'rule' | 'fuzzy'>, timeZone?: string): DpRelease[] {
  const index = indexDhfi(dhfi)
  const entries: DpRelease[] = pedestal.filter(isPedestalRelease).map((item) => {
    const { name, release } = titleRelease(item.title)
    const items = dhfiFor(name, release, index)
    const approvalDate = items.map(dhfiDateOf).filter((date): date is string => Boolean(date)).sort().at(-1)
    const month = approvalMonthOf(approvalDate, timeZone)
    return { key: `pedestal:${item.id}`, name, release, documents: items.length, items, tracked: false, trackedBy: [], features: [], planned: 0, booked: 0, hourTasks: 0, pedestal: pedestalRelease(item), ...(approvalDate ? { approvalDate, approvalMonth: month } : {}), ...(month ? { month } : {}) }
  })
  return attachFeatures(entries, backlog, { ...options, fuzzy: true }) as DpRelease[]
}

// Pedestal items are derived once per fetched source, so the same array comes back while the data is unchanged.
const pedestalBySource = new WeakMap<object, AzureWorkItem[]>()
function pedestalOf(source: Parameters<typeof pedestalItems>[0] extends (infer T)[] | undefined ? T : never) {
  const cached = pedestalBySource.get(source)
  if (cached) return cached
  const items = pedestalItems([source]); pedestalBySource.set(source, items); return items
}
const none: AzureWorkItem[] = []

// The DP data sets among the fetched views: the Pedestal register and the DHFI documents (Settings → Stream mapping).
export function dpDataSets(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[]) {
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  const dhfiProfile = profileForDataSet('DHFI', profiles), pedestalProfile = profileForDataSet('Pedestal', profiles)
  const sourceOf = (profile: AzureConnectionProfileSummary | undefined) => profile ? viewSource(state, profile.id, profile.role, profile.query, releaseConnections) : undefined
  const dhfiSource = sourceOf(dhfiProfile), pedestalSource = sourceOf(pedestalProfile)
  return { dhfiProfile, pedestalProfile, dhfiSource, pedestalSource, dhfi: dhfiSource?.items ?? none, pedestal: pedestalSource ? pedestalOf(pedestalSource) : none }
}
