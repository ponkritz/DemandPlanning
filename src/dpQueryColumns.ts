import type { AppState } from './domain'
import type { AzureConnectionProfileSummary } from './azureCredentials'
import { dpDateColumns } from './dpBulkDates'
import { queryLayout } from './queryView'
import { defaultStreams, profilesForStream } from './streams'
import { viewSource } from './viewSources'

// DPF-13, EPS-10: the date columns of the DP query offered in a setting — the DP bulk creation dates and a User Story's
// "Sprint from" — from the fetched data's columns, else the query's SELECT; the four DP milestones are always offered.
export function dpQueryDateColumns(state: Pick<AppState, 'azureSources' | 'releaseSource'>, profiles: AzureConnectionProfileSummary[]) {
  const dp = profilesForStream(defaultStreams.find((stream) => stream.rule === 'dp')!, profiles)[0]
  const releaseConnections = profiles.filter((profile) => profile.role === 'release-source').length
  const source = dp ? viewSource(state, dp.id, dp.role, dp.query, releaseConnections) : undefined
  const columns = source?.columns?.length ? source.columns : dp?.query ? queryLayout(dp.query).columns.map((ref) => ({ ref, name: ref })) : []
  return { options: dpDateColumns(columns), fetched: Boolean(source?.columns?.length) }
}
