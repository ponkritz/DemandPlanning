import { EmptyState, Page } from '../components/ui'

// BRITE (CON-84): a place held at the root of Release Details. Its exports, their columns and the release rules are
// not known yet; until then it counts nothing and is not in Pulse Check or the Monthly pack.
export function BritePage() {
  return <Page>
    <EmptyState title="BRITE is not set up yet." detail="BRITE will list its releases here once its exports and their rules are known: which file or query to read, which column gives the release name and number, and which date decides the month. Until then BRITE counts nothing and is not part of Pulse Check or the Monthly pack." />
  </Page>
}
