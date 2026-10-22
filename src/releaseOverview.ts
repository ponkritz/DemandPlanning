import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'
import { releaseOf } from './releasePath.ts'
import { releaseRegister, viewMonthOf } from './releaseSource.ts'
import { viewSource } from './viewSources.ts'

// Overview "Releases this month": for each read-only view whose documents carry releases in their paths (DP, CP,
// IOCC, …), the releases with documents approved (else changed) in the month, in the viewer's time zone — the same
// month rule as the views — with the document count; plus the totals across streams.
export interface StreamRelease { name: string; release: string; documents: number; approvalDate?: string }
export interface StreamDocument { id: number; title: string; url: string; release: string; approvalDate?: string }
export interface ReleaseStream { id: string; name: string; fetchedAt: string; releases: StreamRelease[]; documents: number; titles: StreamDocument[] }

// only: the views to show (Pulse Check: the Release Details views), each even before it is fetched or when its paths
// carry no release; without it, every view whose documents carry releases.
export function releaseStreams(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[], month: string, timeZone?: string, only?: string[]): ReleaseStream[] {
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  const streams: ReleaseStream[] = []
  for (const profile of profiles) {
    if (profile.role === 'time-tracking' || (only && !only.includes(profile.id))) continue
    const source = viewSource(state, profile.id, profile.role, profile.query, releaseConnections)
    if (!only && (!source || !source.items.some((item) => releaseOf(item)))) continue
    const inMonth = (source?.items ?? []).filter((item) => viewMonthOf(item, timeZone) === month)
    const releases = releaseRegister(inMonth, []).map(({ name, release, documents, approvalDate }) => ({ name, release, documents, ...(approvalDate ? { approvalDate } : {}) }))
    // The month's documents of a release, by the query's Title, oldest approval first.
    const titles = inMonth.flatMap((item) => { const found = releaseOf(item); return found ? [{ id: item.id, title: item.title, url: item.url, release: `${found.name} ${found.release}`, ...(item.approvalDate ? { approvalDate: item.approvalDate } : {}) }] : [] })
      .sort((a, b) => (a.approvalDate ?? '').localeCompare(b.approvalDate ?? '') || a.id - b.id)
    streams.push({ id: profile.id, name: profile.viewName || profile.reason, fetchedAt: source?.fetchedAt ?? '', releases, documents: releases.reduce((sum, entry) => sum + entry.documents, 0), titles })
  }
  return streams.sort((a, b) => a.name.localeCompare(b.name))
}
