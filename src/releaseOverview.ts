import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { releaseFor, releaseOf } from './releasePath.ts'
import { defaultStreams, profileForStream, streamOfProfile, type ReleaseRule } from './streams.ts'
import { releaseRegister, viewMonthOf } from './releaseSource.ts'
import { viewSource } from './viewSources.ts'

// Overview "Releases this month": for each read-only view whose documents carry releases in their paths (DP, CP,
// IOCC, …), the releases with documents approved (else changed) in the month, in the viewer's time zone — the same
// month rule as the views — with the document count; plus the totals across streams.
export interface StreamRelease { name: string; release: string; documents: number; approvalDate?: string }
export interface StreamDocument { id: number; title: string; url: string; release: string; approvalDate?: string }
export interface ReleaseStream { id: string; name: string; fetchedAt: string; releases: StreamRelease[]; documents: number; titles: StreamDocument[]; notSetUp?: boolean }

// One view's releases in the month, read with its stream's rule (streams.ts; others use the general path rule).
function streamOf(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profile: AzureConnectionProfileSummary, releaseConnections: number, month: string, timeZone?: string, rule: ReleaseRule = 'path'): ReleaseStream {
  const source = viewSource(state, profile.id, profile.role, profile.query, releaseConnections)
  const inMonth = (source?.items ?? []).filter((item) => viewMonthOf(item, timeZone) === month)
  const label = (found: { group?: string; name: string; release: string }) => [found.group, found.name, found.release].filter(Boolean).join(' ')
  const releases = releaseRegister(inMonth, [], { rule }).map(({ group, name, release, documents, approvalDate }) => ({ name: group ? `${group} · ${name}` : name, release, documents, ...(approvalDate ? { approvalDate } : {}) }))
  // The month's documents of a release, by the query's Title, oldest approval first.
  const titles = inMonth.flatMap((item) => { const found = releaseFor(item, rule); return found ? [{ id: item.id, title: item.title, url: item.url, release: label(found), ...(item.approvalDate ? { approvalDate: item.approvalDate } : {}) }] : [] })
    .sort((a, b) => (a.approvalDate ?? '').localeCompare(b.approvalDate ?? '') || a.id - b.id)
  return { id: profile.id, name: profile.viewName || profile.reason, fetchedAt: source?.fetchedAt ?? '', releases, documents: releases.reduce((sum, entry) => sum + entry.documents, 0), titles }
}

// Pulse Check: the default Azure streams in their order (DP, CP, IOCC, Content, Tool Validations), each from the
// connection named like it, also before it is fetched; a stream without a connection is listed as not set up.
export function defaultStreamReleases(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string): ReleaseStream[] {
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  return defaultStreams.filter((stream) => stream.source === 'azure').map((stream) => {
    const profile = profileForStream(stream, profiles)
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
