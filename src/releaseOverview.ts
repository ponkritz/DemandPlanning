import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { releaseFor, releaseOf } from './releasePath.ts'
import { defaultStreams, profileForStream, streamOfProfile, type ReleaseRule } from './streams.ts'
import { releaseRegister, viewMonthOf } from './releaseSource.ts'
import { viewSource } from './viewSources.ts'
import { dpDataSets, dpReleases } from './dpReleases.ts'
import type { AzureWorkItem } from './domain'

// Pulse Check needs no Feature match: one shared empty backlog keeps dpReleases' cache hitting.
const noBacklog: AzureWorkItem[] = []

// Overview "Releases this month": for each read-only view whose documents carry releases in their paths (DP, CP,
// IOCC, …), the releases with documents approved (else changed) in the month, in the viewer's time zone — the same
// month rule as the views — with the document count; plus the totals across streams.
export interface StreamRelease { type?: string; name: string; release: string; documents: number; approvalDate?: string }
export interface StreamDocument { id: number; title: string; url: string; release: string; approvalDate?: string }
export interface ReleaseStream { id: string; name: string; fetchedAt: string; releases: StreamRelease[]; documents: number; titles: StreamDocument[]; notSetUp?: boolean }

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

// DP with the DHFI data set mapped: the Pedestal Releases whose DHFI documents are dated in the month (dpReleases).
function dpStream(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string): ReleaseStream | undefined {
  const sets = dpDataSets(state, profiles)
  if (!sets.dhfiProfile) return undefined
  const inMonth = dpReleases(sets.pedestal, sets.dhfi, noBacklog, {}, timeZone).filter((release) => release.month === month)
  const releases = inMonth.map(({ name, release, documents, approvalDate }) => ({ name, release, documents, ...(approvalDate ? { approvalDate } : {}) }))
  const titles = inMonth.flatMap((entry) => entry.items.map((item) => ({ id: item.id, title: item.title, url: item.url, release: [entry.name, entry.release].filter(Boolean).join(' '), ...(item.approvalDate ? { approvalDate: item.approvalDate } : {}) })))
    .sort((a, b) => (a.approvalDate ?? '').localeCompare(b.approvalDate ?? '') || a.id - b.id)
  const fetchedAt = [sets.pedestalSource?.fetchedAt, sets.dhfiSource?.fetchedAt].filter(Boolean).sort()[0] ?? ''
  return { id: sets.pedestalProfile?.id ?? sets.dhfiProfile.id, name: 'DP', fetchedAt, releases, documents: releases.reduce((sum, entry) => sum + entry.documents, 0), titles }
}

// Pulse Check: the default Azure streams in their order (DP, CP, IOCC, Content, Tool Validations), each from the
// connection named like it, also before it is fetched; a stream without a connection is listed as not set up.
export function defaultStreamReleases(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string): ReleaseStream[] {
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  return defaultStreams.filter((stream) => stream.source === 'azure').map((stream) => {
    const profile = profileForStream(stream, profiles)
    const combined = stream.rule === 'dp' ? dpStream(state, profiles, month, timeZone) : undefined
    if (combined) return combined
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
// month counted as Pulse Check counts it (releases with documents approved, else changed, in the month; DP from the
// Pedestal and DHFI data sets when they are mapped). Streams that are not set up are listed with no counts.
export interface StreamCounts { id: string; name: string; notSetUp: boolean; months: { month: string; releases: number; documents: number }[]; releases: number; documents: number }
export function streamCounts(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], months: string[], timeZone?: string): StreamCounts[] {
  const perMonth = months.map((month) => defaultStreamReleases(state, profiles, month, timeZone))
  return (perMonth[0] ?? defaultStreamReleases(state, profiles, months[0] ?? '', timeZone)).map((stream, index) => {
    const entries = months.map((month, at) => { const found = perMonth[at][index]; return { month, releases: found?.releases.length ?? 0, documents: found?.documents ?? 0 } })
    return { id: stream.id, name: stream.name, notSetUp: Boolean(stream.notSetUp), months: entries, releases: entries.reduce((sum, entry) => sum + entry.releases, 0), documents: entries.reduce((sum, entry) => sum + entry.documents, 0) }
  })
}
