import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { releaseFor, releaseOf } from './releasePath.ts'
import { defaultStreams, profileForStream, profilesForStream, streamOfProfile, type ReleaseRule } from './streams.ts'
import { cpMonthReport, cpNameIndex, cpSignatures } from './cpReporting.ts'
import { releaseRegister, viewMonthOf } from './releaseSource.ts'
import { viewSource } from './viewSources.ts'
import { dpMilestoneLabel, dpMonthCounts, type SupportedRelease } from './dpMilestones.ts'
import { ioccDocumentNames, ioccMonthCounts } from './ioccMilestones.ts'

// Overview "Releases this month": for each read-only view whose documents carry releases in their paths (DP, CP,
// IOCC, …), the releases with documents approved (else changed) in the month, in the viewer's time zone — the same
// month rule as the views — with the document count; plus the totals across streams.
export interface StreamRelease { type?: string; name: string; release: string; documents: number; approvalDate?: string }
export interface StreamDocument { id: number; title: string; url: string; release: string; approvalDate?: string }
// supported: DP only — its releases are the Completed Releases and supported the Supported Releases (dpMilestones);
// DP counts no documents.
// supported: DP's Supported Releases (unique releases with a milestone Done in the month), supportedReleases their list,
// milestones the milestones Done behind them.
// supportedEntries: the Supported Releases of a stream counted like DP (DP, IOCC), each once: key and label.
export interface SupportedEntry { key: string; label: string }
export interface ReleaseStream { id: string; name: string; fetchedAt: string; releases: StreamRelease[]; documents: number; titles: StreamDocument[]; notSetUp?: boolean; supported?: number; supportedReleases?: SupportedRelease[]; supportedEntries?: SupportedEntry[]; milestones?: number }

// One view's releases in the month, read with its stream's rule (streams.ts; others use the general path rule).
function streamOf(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profile: AzureConnectionProfileSummary, releaseConnections: number, month: string, timeZone?: string, rule: ReleaseRule = 'path'): ReleaseStream {
  const source = viewSource(state, profile.id, profile.role, profile.query, releaseConnections)
  const inMonth = (source?.items ?? []).filter((item) => viewMonthOf(item, timeZone) === month)
  const label = (found: { group?: string; name: string; release: string }) => `${[found.name, found.release].filter(Boolean).join(' ')}${found.group ? ` (${found.group})` : ''}`
  const releases = releaseRegister(inMonth, [], { rule }).map(({ group, name, release, documents, approvalDate }) => ({ ...(group ? { type: group } : {}), name, release, documents, ...(approvalDate ? { approvalDate } : {}) }))
  // The month's documents of a release, by the query's Title, oldest approval first.
  const titles = inMonth.flatMap((item) => { const found = releaseFor(item, rule); return found ? [{ id: item.id, title: item.title, url: item.url, release: label(found), ...(item.approvalDate ? { approvalDate: item.approvalDate } : {}) }] : [] })
    .sort((a, b) => (a.approvalDate ?? '').localeCompare(b.approvalDate ?? '') || a.id - b.id)
  return { id: profile.id, name: profile.viewName || profile.reason, fetchedAt: source?.fetchedAt ?? '', releases, documents: releases.reduce((sum, entry) => sum + entry.documents, 0), titles }
}

// DP from its own query: Completed Releases = DT (DDT) Done in the month, Supported Releases = DT, SFV, PRD and RPE
// Done in the month (dpMilestones); the milestones counted are listed as its titles.
function dpStream(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profile: AzureConnectionProfileSummary, releaseConnections: number, month: string, timeZone?: string): ReleaseStream {
  const source = viewSource(state, profile.id, profile.role, profile.query, releaseConnections)
  const counts = dpMonthCounts(source?.items ?? [], month, timeZone)
  const releases = counts.completed.map(({ name, release, date }) => ({ name, release, documents: 0, approvalDate: date }))
  // One title per supported release, naming the milestones it passed in the month ("SFV · DT Done").
  const titles = counts.supported.map(({ item, name, release, milestones, date }) => ({ id: item.id, title: [name, release].filter(Boolean).join(' ') || item.title, url: item.url, release: `${milestones.map((entry) => dpMilestoneLabel(entry.milestone)).join(' · ')} Done`, approvalDate: date }))
  return { id: profile.id, name: 'DP', fetchedAt: source?.fetchedAt ?? '', releases, documents: 0, titles, supported: counts.supported.length, supportedReleases: counts.supported, supportedEntries: counts.supported.map((entry) => ({ key: entry.key, label: [entry.name, entry.release].filter(Boolean).join(' ') })), milestones: counts.milestones.length }
}

// IOCC from its own query (ioccMilestones): Completed Releases = Release Notes or Verification Report signed in the
// month, Supported Releases = Release Plan, Release Notes or Verification Report signed in the month — each release
// once; the signed documents are its titles.
function ioccStream(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profile: AzureConnectionProfileSummary, releaseConnections: number, month: string, timeZone?: string): ReleaseStream {
  const source = viewSource(state, profile.id, profile.role, profile.query, releaseConnections)
  const counts = ioccMonthCounts(source?.items ?? [], month, timeZone)
  const label = (entry: { group: string; name: string; release: string }) => `${[entry.name, entry.release].filter(Boolean).join(' ')}${entry.group ? ` (${entry.group})` : ''}`
  const releases = counts.completed.map((entry) => ({ ...(entry.group ? { type: entry.group } : {}), name: entry.name, release: entry.release, documents: entry.documents.length, approvalDate: entry.date }))
  const titles = counts.documents.map(({ item, document, date }) => ({ id: item.id, title: item.title, url: item.url, release: `${ioccDocumentNames[document]} signed`, approvalDate: date }))
  return { id: profile.id, name: 'IOCC', fetchedAt: source?.fetchedAt ?? '', releases, documents: counts.documents.length, titles, supported: counts.supported.length, supportedEntries: counts.supported.map((entry) => ({ key: entry.key, label: label(entry) })) }
}

// CP from its release-folder tree (cpReporting): Completed Releases = main Release Notes signed by QA/QE in the month,
// Supported Releases = any QA/QE-signed document under the release in the month — each Release container once,
// shared containers apart. Another CP connection (e.g. "CP Releases") gives the release names.
export function cpReportFor(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string) {
  const stream = defaultStreams.find((entry) => entry.rule === 'cp')!
  const tree = profileForStream(stream, profiles)
  if (!tree) return undefined
  const others = profilesForStream(stream, profiles).filter((profile) => profile.id !== tree.id)
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  const source = viewSource(state, tree.id, tree.role, tree.query, releaseConnections)
  const enrichment = others.map((profile) => viewSource(state, profile.id, profile.role, profile.query, releaseConnections)).find((entry) => entry && entry !== source)
  const report = cpMonthReport(cpSignatures(source?.items ?? [], source && 'columns' in source ? source.columns : undefined, undefined, timeZone), month, enrichment ? cpNameIndex(enrichment.items, 'columns' in enrichment ? enrichment.columns : undefined) : undefined)
  return { profile: tree, source, enrichment, report }
}
function cpStream(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string): ReleaseStream {
  const found = cpReportFor(state, profiles, month, timeZone)!
  const { report } = found
  const label = (row: (typeof report.rows)[number]) => row.name.displayLabel
  return {
    id: found.profile.id, name: 'CP', fetchedAt: found.source?.fetchedAt ?? '',
    releases: report.rows.filter((row) => row.completed).map((row) => ({ name: label(row), release: '', documents: row.signedDocuments, ...(row.releaseNotesDate ? { approvalDate: row.releaseNotesDate } : {}) })),
    documents: report.signedDocuments,
    titles: report.rows.map((row) => ({ id: row.container.id, title: label(row), url: row.container.url, release: `${row.completed ? 'Completed · ' : ''}${row.signedDocuments} QA/QE-signed document${row.signedDocuments === 1 ? '' : 's'}`, ...(row.signatures[0] ? { approvalDate: row.signatures.map((entry) => entry.date).sort()[0] } : {}) })),
    supported: report.supported, supportedEntries: report.rows.map((row) => ({ key: String(row.container.id), label: label(row) })),
  }
}

// Pulse Check: the default Azure streams in their order (DP, CP, IOCC, Content, Tool Validations), each from the
// connection named like it, also before it is fetched; a stream without a connection is listed as not set up.
export function defaultStreamReleases(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string): ReleaseStream[] {
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  return defaultStreams.filter((stream) => stream.source === 'azure').map((stream) => {
    const profile = profileForStream(stream, profiles)
    if (stream.rule === 'dp' && profile) return { ...dpStream(state, profile, releaseConnections, month, timeZone), name: stream.name }
    if (stream.rule === 'iocc' && profile) return { ...ioccStream(state, profile, releaseConnections, month, timeZone), name: stream.name }
    if (stream.rule === 'cp' && profile) return cpStream(state, profiles, month, timeZone)
    return profile ? { ...streamOf(state, profile, releaseConnections, month, timeZone, stream.rule), name: stream.name } : { id: `stream:${stream.name}`, name: stream.name, fetchedAt: '', releases: [], documents: 0, titles: [], notSetUp: true }
  })
}

// only: the views to show, each even before it is fetched or when its paths carry no release; without it, every
// view whose documents carry releases.
export function releaseStreams(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string, only?: string[]): ReleaseStream[] {
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  const streams: ReleaseStream[] = []
  for (const profile of profiles) {
    if (profile.role === 'time-tracking' || (only && !only.includes(profile.id))) continue
    const source = viewSource(state, profile.id, profile.role, profile.query, releaseConnections)
    if (!only && (!source || !source.items.some((item) => releaseOf(item)))) continue
    streams.push(streamOf(state, profile, releaseConnections, month, timeZone, streamOfProfile(profile)?.rule))
  }
  return streams.sort((a, b) => a.name.localeCompare(b.name))
}

// Dashboard: releases and documents per stream and month over a period — the default streams in their order, each
// month counted as Pulse Check counts it (releases with documents approved, else changed, in the month; DP: Completed
// and Supported Releases from its query). Streams that are not set up are listed with no counts.
export interface StreamCounts { id: string; name: string; notSetUp: boolean; months: { month: string; releases: number; documents: number; supported?: number }[]; releases: number; documents: number; supported?: number }
export function streamCounts(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], months: string[], timeZone?: string): StreamCounts[] {
  const perMonth = months.map((month) => defaultStreamReleases(state, profiles, month, timeZone))
  return (perMonth[0] ?? defaultStreamReleases(state, profiles, months[0] ?? '', timeZone)).map((stream, index) => {
    const entries = months.map((month, at) => { const found = perMonth[at][index]; return { month, releases: found?.releases.length ?? 0, documents: found?.documents ?? 0, ...(found?.supported != null ? { supported: found.supported } : {}) } })
    // DP: the period's Supported Releases are unique too — a release supported in two months counts once.
    const supported = stream.supported != null ? { supported: new Set(perMonth.flatMap((streams) => streams[index]?.supportedEntries?.map((entry) => entry.key) ?? [])).size } : {}
    return { id: stream.id, name: stream.name, notSetUp: Boolean(stream.notSetUp), months: entries, releases: entries.reduce((sum, entry) => sum + entry.releases, 0), documents: entries.reduce((sum, entry) => sum + entry.documents, 0), ...supported }
  })
}
