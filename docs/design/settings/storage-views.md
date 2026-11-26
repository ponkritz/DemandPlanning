# Other views

[Back to Settings](../admin.md)

## Default design

Shows the active work email’s Other views. Rows expose the name, server/project, fetch status and available fetch/edit/clone/remove actions. A connection editor includes role, server, project, team or query, display name and whether to show it in the menu.

## Behavior and storage

Other views sit outside the Stream mapping and the local, read-only My views. The app saves them in the creator’s private data repository file, `other-views/<work email>.json`, and loads that file for the active work email. Starting or loading from Git syncs definitions and keeps server PATs local. A save can wait locally until the user configures an email and a writable private repository. GitHub repository permissions govern direct access to the files.

## Implementation

- [`components/AzureConnections.tsx`](../../../src/components/AzureConnections.tsx)
- [`azureCredentials.ts`](../../../src/azureCredentials.ts)
- [`useAzureWorkspace.ts`](../../../src/useAzureWorkspace.ts)
- [`backlogViews.ts`](../../../src/backlogViews.ts)
- [`releaseSource.ts`](../../../src/releaseSource.ts)
