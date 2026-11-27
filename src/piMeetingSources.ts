// PIR-54, PIR-57 Where the meeting's releases and long-running Features come from: the Release Details data of each
// stream ticked in the Meeting presentation settings (releaseOverview.ts defaultStreamReleases, month by month over the
// PI), the Release Classification of each release detected from its number by its stream's Epic (the stream's bulk
// creation Epic, else the first Epic mapped to the stream that has a Release Classification — epicSetup.ts), and the
// Epics mapped to each stream (Admin → Streams → Stream mapping; a custom stream's own Epics).
import { defaultStreamReleases } from './releaseOverview.ts'
import { allStreams, sameStream } from './streams.ts'
import { normalizeReleaseSourceSettings, streamEpics } from './releaseSource.ts'
import { bulkEpicFor, bulkStreams, loadMyBulkEpics, type BulkStream } from './bulkEpics.ts'
import { classificationOf, detectClassification, type EpicSetupFile } from './epicSetup.ts'
import type { ReleaseInput } from './piMeetingData.ts'
import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials.ts'

type ReleaseState = Pick<AppState, 'azureSources' | 'releaseSource'> & Partial<Pick<AppState, 'releaseSourceSettings'>>
// The Epics of each ticked stream ([] when none is mapped).
export function meetingStreamEpics(streams: readonly string[], settings: unknown): Record<string, number[]> {
  return Object.fromEntries(streams.map((name) => { const stream = allStreams().find((entry) => sameStream(entry.name, name)); return [name, stream?.custom ? stream.epics ?? [] : streamEpics(settings, stream?.name ?? name)] }))
}
// The months touching the PI's dates (a release is then kept when its own date is inside the PI).
export function monthsTouching(start: string, end: string): string[] {
  const months: string[] = []
  for (const at = new Date(`${start.slice(0, 7)}-01T00:00:00Z`); at.toISOString().slice(0, 7) <= end.slice(0, 7); at.setUTCMonth(at.getUTCMonth() + 1)) months.push(at.toISOString().slice(0, 7))
  return months
}
export function meetingReleaseInputs(streams: readonly string[], months: readonly string[], state: ReleaseState, profiles: AzureConnectionProfileSummary[], epicFile: EpicSetupFile | null): ReleaseInput[] {
  const perMonth = months.map((month) => ({ month, streams: defaultStreamReleases(state, profiles, month) }))
  const settings = normalizeReleaseSourceSettings(state.releaseSourceSettings)
  const epics = meetingStreamEpics(streams, state.releaseSourceSettings)
  return streams.map((name): ReleaseInput => {
    const stream = allStreams().find((entry) => sameStream(entry.name, name))
    if (!stream) return { stream: name, why: 'This stream is no longer set up (Admin → Streams).', releases: [] }
    if (stream.source !== 'azure') return { stream: name, why: 'Releases of Windchill exports are not read by the meeting (only the Azure DevOps streams).', releases: [] }
    const found = perMonth.map((entry) => ({ month: entry.month, stream: entry.streams.find((item) => sameStream(item.name, name)) }))
    const notSet = found.find((entry) => !entry.stream || entry.stream.notSetUp || entry.stream.noData || !entry.stream.fetchedAt)
    if (notSet) return { stream: name, why: `No Release Details data: ${notSet.stream?.noData || (notSet.stream && !notSet.stream.notSetUp ? 'not fetched yet' : 'no connection is set up for it')}.`, releases: [] }
    // The Epic whose Release Classification classifies the stream's releases.
    const bulk = (bulkStreams as readonly string[]).includes(stream.name) ? bulkEpicFor(stream.name as BulkStream, settings.bulkEpics, loadMyBulkEpics()).epicId : undefined
    const epicId = [bulk, ...(epics[name] ?? [])].find((id) => id != null && classificationOf(epicFile, id).values.length > 0)
    const classes = epicId != null ? classificationOf(epicFile, epicId) : undefined
    return {
      stream: name,
      releases: found.flatMap((entry) => entry.stream!.releases.map((release) => ({ key: [release.type ?? '', release.name, release.release].join('|').toLowerCase(), release: release.release, ...(release.approvalDate ? { date: release.approvalDate } : {}), month: entry.month }))),
      ...(classes ? { classify: (release: string) => detectClassification(classes, release) } : { classWhy: `No Epic of ${name} has a Release Classification list (Admin → Feature & PI setup).` }),
    }
  })
}
