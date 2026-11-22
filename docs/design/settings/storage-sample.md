# Synthetic sample

[Back to Settings](../admin.md)

## Default design

Load synthetic sample dataset is an explicit action, disabled during a fetch. Existing live cached work requires confirmation before replacement. The action needs a valid project URL to scope the generated work.

## Behavior and storage

The sample covers backlog, release and report views. The workspace replaces cached work items and the release source, and supplements local planning data with sample plans, profiles and scopes. It keeps connection definitions and records an audit event. The Azure write guard and Git write controls check the sample flag. Refresh from Azure replaces cached work with real data.

## Implementation

- [`components/AzureConnections.tsx`](../../../src/components/AzureConnections.tsx)
- [`useAzureWorkspace.ts`](../../../src/useAzureWorkspace.ts)
- [`sampleData.ts`](../../../src/sampleData.ts)
- [`azureClient.ts`](../../../src/azureClient.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
