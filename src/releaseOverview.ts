import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { releaseFor, releaseOf } from './releasePath.ts'
import { defaultStreams, profileForStream, streamOfProfile, type ReleaseRule } from './streams.ts'
import { releaseRegister, viewMonthOf } from './releaseSource.ts'
import { viewSource } from './viewSources.ts'
import { dpMilestoneLabel, dpMonthCounts, type SupportedRelease } from './dpMilestones.ts'

// Overview "Releases this month": for each read-only view whose documents carry releases in their paths (DP, CP,
// IOCC, …), the releases with documents approved (else changed) in the month, in the viewer's time zone — the same
// month rule as the views — with the document count; plus the totals across streams.
export interface StreamRelease { type?: string; name: string; release: string; documents: number; approvalDate?: string }
export interface StreamDocument { id: number; title: string; url: string; release: string; approvalDate?: string }
// supported: DP only — its releases are the Completed Releases and supported the Supported Releases (dpMilestones);
// DP counts no documents.
// supported: DP's Supported Releases (unique releases with a milestone Done in the month), supportedReleases their list,
// milestones the milestones Done behind them.
export interface ReleaseStream { id: string; name: string; fetchedAt: string; releases: StreamRelease[]; documents: number; titles: StreamDocument[]; notSetUp?: boolean; supported?: number; supportedReleases?: SupportedRelease[]; milestones?: number }

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
  return { id: profile.id, name: 'DP', fetchedAt: source?.fetchedAt ?? '', releases, documents: 0, titles, supported: counts.supported.length, supportedReleases: counts.supported, milestones: counts.milestones.length }
}

// Pulse Check: the default Azure streams in their order (DP, CP, IOCC, Content, Tool Validations), each from the
// connection named like it, also before it is fetched; a stream without a connection is listed as not set up.
export function defaultStreamReleases(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string): ReleaseStream[] {
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  return defaultStreams.filter((stream) => stream.source === 'azure').map((stream) => {
    const profile = profileForStream(stream, profiles)
    if (stream.rule === 'dp' && profile) return { ...dpStream(state, profile, releaseConnections, month, timeZone), name: stream.name }
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
    const supported = stream.supported != null ? { supported: new Set(perMonth.flatMap((streams) => streams[index]?.supportedReleases?.map((entry) => entry.key) ?? [])).size } : {}
    return { id: stream.id, name: stream.name, notSetUp: Boolean(stream.notSetUp), months: entries, releases: entries.reduce((sum, entry) => sum + entry.releases, 0), documents: entries.reduce((sum, entry) => sum + entry.documents, 0), ...supported }
  })
}
