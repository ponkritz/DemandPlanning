# Servers and PATs

[Back to Settings](../admin.md)

## Default design

Shows known Azure servers or collections, the views using each, and credential status with a password field. Add a server by entering server URL plus organization or collection. Existing server rows offer token save/removal.

## Behavior and storage

The normalized server/collection key scopes local PAT storage. Saving a token refreshes connection profiles, which resolve saved credentials per server; tokens stay in local browser or desktop storage. Cloud Azure DevOps and on-prem collection URLs use separate derived configuration. Azure DevOps permissions determine what a token can fetch or write and on-prem connections are read-only in this app.

## Implementation

- [`components/AzureConnections.tsx`](../../../src/components/AzureConnections.tsx)
- [`azureCredentials.ts`](../../../src/azureCredentials.ts)
- [`useAzureWorkspace.ts`](../../../src/useAzureWorkspace.ts)
- [`azureClient.ts`](../../../src/azureClient.ts)
