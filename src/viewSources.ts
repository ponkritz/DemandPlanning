import type { AppState } from './domain'
import { defaultReleaseQuery } from './releaseSource.ts'

type Source = NonNullable<AppState['azureSources']>[number] | NonNullable<AppState['releaseSource']>

// The saved fetch of one read-only connection. Every connection has its own snapshot (by connection ID). Release
// sources fetched before that were kept in one shared snapshot; it is shown only for the connection whose query it
// was fetched with (or when there is a single release source), never for the others.
export function viewSource(state: Pick<AppState, 'azureSources' | 'releaseSource'>, id: string, role: string | undefined, query: string | undefined, releaseConnections: number): Source | undefined {
  const own = (state.azureSources ?? []).find((entry) => entry.connectionId === id)
  if (own) return own
  const legacy = state.releaseSource
  if (role !== 'release-source' || !legacy) return undefined
  return releaseConnections <= 1 || legacy.query.trim() === (query?.trim() || defaultReleaseQuery).trim() ? legacy : undefined
}
