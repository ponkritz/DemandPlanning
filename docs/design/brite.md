# BRITE

**Route** `brite` · Release Details · Header month hidden.

## Default design and current behavior

The page renders “BRITE is not set up yet” through the shared EmptyState component. It identifies the outstanding inputs for a release view: source export or query, release name and number fields, and the date field for assigning releases to a month. The page accepts no props and renders no table, filter, export or configuration form. It contributes no counts to Pulse Check or the Monthly pack.

## Code

[View](../../src/pages/BritePage.tsx) · [Navigation](../../src/pages/registry.ts) · [Configured release streams](../../src/streams.ts)
