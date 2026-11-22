# Stream mapping

[Back to Settings](../admin.md)

## Default design

Table of connection sources, release rules, query, status and per-row setup, fetch or edit actions; separate Removed connections and Release naming patterns panels. Existing PATs can set up eligible preset rows in one pass. Fuzzy match defaults to 80%.

## Behavior and storage

Time Writing supplies the team backlog. Azure stream configuration feeds DP, CP, IOCC, Content and Tool Validations. DP has Pedestal and DHFI data sets; S&S IT uses the corresponding Windchill export. Profiles are mapped by stream or data-set identity. Stream mapping uses the Tool Owner governance permission and, until an owner exists, the manager fallback. Time Writing has its own edit affordance. Sharing merges sanitized connection definitions into `azure-views.json`. Removed connections searches up to 30 versions and restores eligible local definitions; sharing a restore needs appropriate rights and a writable Git token. The threshold and shared naming rules use planning data and are published through Git storage.

## Implementation

- [`components/AzureConnections.tsx`](../../../src/components/AzureConnections.tsx)
- [`components/RemovedConnections.tsx`](../../../src/components/RemovedConnections.tsx)
- [`components/NamingPatternsPanel.tsx`](../../../src/components/NamingPatternsPanel.tsx)
- [`streams.ts`](../../../src/streams.ts)
- [`viewDefinitions.ts`](../../../src/viewDefinitions.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`releaseSource.ts`](../../../src/releaseSource.ts)
- [`access.ts`](../../../src/access.ts)
