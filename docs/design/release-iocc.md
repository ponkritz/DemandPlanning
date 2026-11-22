# Release Details — IOCC

## Default design

The release list is grouped by Type of Release, with optional nested grouping by Name and Release where grouping controls are displayed. Expanding a release reveals its documents. A second tab displays query output. The page shows matching work items and planned/booked Time Writing hours, count cards and authorized bulk creation controls.

## Logic and implementation

[releasePath.ts](../../src/releasePath.ts) first tries naming patterns. The fallback uses the Area Path segment after IOCC as the type and derives the name and version from the title after stripping recognized document terms. [ioccMilestones.ts](../../src/ioccMilestones.ts) deduplicates signed evidence by type, name and release. The selected month's approval dates on Release Notes and Verification Reports support completion. Release Plans also contribute to Supported. The generic list applies its approval-date filter with a Changed Date fallback. The count engine requires approval evidence.

[ReleaseView.tsx](../../src/components/ReleaseView.tsx) builds the displayed release and raw query tabs using [releaseSource.ts](../../src/releaseSource.ts). [IoccBulkCreate.tsx](../../src/components/IoccBulkCreate.tsx) uses the selected IOCC Epic's own Feature setup and skips releases without the required setup. It creates work in the Time Writing connection. [bulkEpics.ts](../../src/bulkEpics.ts) prioritizes personal, then shared Epic selection. Exports follow the individual table’s configuration.
