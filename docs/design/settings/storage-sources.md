# Read-only sources

[Back to Settings](../admin.md)

## Default design

Shown only when `azureSources` has data. Displays cached connection snapshots with connection, role, project, work-item total, four most common item types and fetch time. Refresh and connection controls live in the other connection sections.

## Behavior and storage

The route reads report/query snapshots from application state. The snapshot belongs to a specific connection and query, and the normal workspace fetch resolves its current source. Cached data survives in browser state. Eligible on-prem snapshots can be read from or synchronized with Git via the separate storage controls.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`components/AzureConnections.tsx`](../../../src/components/AzureConnections.tsx)
- [`useAzureWorkspace.ts`](../../../src/useAzureWorkspace.ts)
- [`viewSources.ts`](../../../src/viewSources.ts)
- [`gitSnapshots.ts`](../../../src/gitSnapshots.ts)
- [`browserState.ts`](../../../src/browserState.ts)
