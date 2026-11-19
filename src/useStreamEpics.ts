import { createContext, useContext } from 'react'
import { normalizeReleaseSourceSettings, streamEpics } from './releaseSource'
import { bulkEpicFor, loadMyBulkEpics, type BulkStream } from './bulkEpics'
import { defaultStreams, namesStream } from './streams'

// QV-57: the shared release-source settings, provided once by the app, so that every board match (release tables,
// DP, CP, Windchill releases) searches only the Epics chosen for its stream.
export const ReleaseSettingsContext = createContext<unknown>(undefined)
// The Epics of a stream, by its name or a view name that names it ([] = the whole board).
export function useStreamEpics(name: string) {
  const settings = useContext(ReleaseSettingsContext)
  const stream = defaultStreams.find((entry) => namesStream(name, entry.name))?.name ?? name
  return streamEpics(settings, stream)
}

// QV-59: the Epic a stream's bulk Feature creation works under (mine, else shared, else built in), and where it comes from.
export function useBulkEpic(stream: BulkStream) {
  const settings = useContext(ReleaseSettingsContext)
  return bulkEpicFor(stream, normalizeReleaseSourceSettings(settings).bulkEpics, loadMyBulkEpics())
}
