import { ReleaseQuadrants } from '../components/ReleaseQuadrants'
import { releaseStreams } from '../releaseOverview'
import { EmptyState, Page } from '../components/ui'
import type { AzureWorkspace } from '../useAzureWorkspace'
import type { PageProps } from './types'

// Pulse Check: the selected month's approved releases per stream (the release views' documents), moved from Overview.
export function PulseCheckPage({ month, azure, store }: { month: string; azure: AzureWorkspace; store: PageProps['store'] }) {
  const streams = releaseStreams(store.state, azure.connectionProfiles, month)
  return <Page>
    {streams.length ? <ReleaseQuadrants streams={streams} month={month} /> : <EmptyState title="No release views fetched yet." detail="Fetch the DP, CP and IOCC views (desktop app), or load their data from Git (Settings → Views in Git). A view counts when its documents carry “Release x.y.z” in their paths." />}
  </Page>
}
