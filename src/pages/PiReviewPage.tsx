import { EmptyState, Page } from '../components/ui'

// PI Review: planned. It will hold the PI summary for the PI Review (Features and Stories planned vs. closed, hours
// planned vs. booked per stream and person, open work in the PI's Sprints) and further details still to be defined.
export function PiReviewPage() {
  return <Page>
    <EmptyState title="PI Review is planned." detail="This page will hold the PI summary for the PI Review — Features and Stories planned vs. closed, hours planned vs. booked per stream and person, and open work in the PI’s Sprints — plus further details still to be defined." />
  </Page>
}
