# Bulk creation Epics

[Back to Settings](../admin.md)

## Default design

Displays DP, IOCC and Content with typed Epic ID inputs for personal and shared targets. The effective column resolves the title against fetched team Epics and labels unknown IDs. Built-in targets are DP #13946 and Content #22919; IOCC requires configuration.

## Behavior and storage

`bulkEpicFor` resolves personal first, then shared, then built-in. Personal choices are browser-local; shared edits require `streams.options` and are persisted with planning data on Save to Git. The effective Epic feeds each bulk creator’s Feature setup lookup, which supplies applicable DoD and User Story defaults. Lack of required setup can cause candidate rows to be skipped.

## Implementation

- [`components/BulkEpicsPanel.tsx`](../../../src/components/BulkEpicsPanel.tsx)
- [`bulkEpics.ts`](../../../src/bulkEpics.ts)
- [`components/DpBulkCreate.tsx`](../../../src/components/DpBulkCreate.tsx)
- [`components/IoccBulkCreate.tsx`](../../../src/components/IoccBulkCreate.tsx)
- [`components/ContentBulkCreate.tsx`](../../../src/components/ContentBulkCreate.tsx)
- [`featureSetup.ts`](../../../src/featureSetup.ts)
