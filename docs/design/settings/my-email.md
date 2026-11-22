# Your work email

[Back to Settings](../admin.md)

## Default design

Entered via My settings. The form displays the current effective personal email, permits save or clear, and shows a result message.

## Behavior and storage

Uses the Azure workspace creator-email setter and browser identity store. The email is trimmed and normalized. It drives the effective access policy and current-person views, and is the default creator/assignee identity used by creation flows. The shared Azure views configuration omits personal emails. Git synchronization keeps the local email.

## Implementation

- [`components/AzureConnections.tsx`](../../../src/components/AzureConnections.tsx)
- [`useAzureWorkspace.ts`](../../../src/useAzureWorkspace.ts)
- [`azureCredentials.ts`](../../../src/azureCredentials.ts)
- [`useAccess.ts`](../../../src/useAccess.ts)
- [`viewDefinitions.ts`](../../../src/viewDefinitions.ts)
