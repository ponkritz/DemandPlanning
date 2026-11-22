# Other views

[Back to Settings](../admin.md)

## Default design

Shows saved non-personal connections outside the mapped streams. Rows expose the name, server/project, fetch status and available fetch/edit/clone/remove actions. A connection editor includes role, server, project, team or query, display name and whether to show it in the menu.

## Behavior and storage

Other views are identified after excluding profiles assigned to a stream or data set and excluding personal views. The editor validates server selection and connection uniqueness, persists the connection definition locally and refreshes the workspace. A selected server supplies its PAT. A cloud backlog view and on-prem read-only query can use the same shell while using their respective fetch transport. Shared publishing is available through Shared setup in Git under its own policy.

## Implementation

- [`components/AzureConnections.tsx`](../../../src/components/AzureConnections.tsx)
- [`azureCredentials.ts`](../../../src/azureCredentials.ts)
- [`useAzureWorkspace.ts`](../../../src/useAzureWorkspace.ts)
- [`backlogViews.ts`](../../../src/backlogViews.ts)
- [`releaseSource.ts`](../../../src/releaseSource.ts)
