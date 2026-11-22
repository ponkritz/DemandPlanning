# PI Review

**Route** `pireview` · Data Insights · Header month hidden.

## Default design and current behavior

The page renders a shared EmptyState reading “PI Review is planned.” It describes the planned scope of Features and Stories planned vs closed, planned and booked hours per stream and person, and open work in the PI's Sprints. Its component has no props or state. There is no PI selector, aggregation, data read, persistence or export in this route. The Snapshots workflow is a separate view.

## Code

[View](../../src/pages/PiReviewPage.tsx) · [Navigation](../../src/pages/registry.ts)
