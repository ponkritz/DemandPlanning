# Shared setup in Git

[Back to Settings](../admin.md)

## Default design

Offers Save, Restore and load cached data for shared connections plus backup/cleanup tools. Restore can take an optional token for the device and asks for confirmation.

## Behavior and storage

The section needs `storage.shared`; writing also needs writable Git and live mode. Save merges definitions into `azure-views.json`, preserving Git-only rows and excluding personal views, PATs and work emails. Restore keeps the device's eligible PAT or uses the supplied/server PAT; it may restore a definition without a token. Cleanup creates a dated backup and shared reset marker, clears shared definitions and on-prem cached files, and preserves per-server PATs and personal views. It is a multi-step operation and reports failures when a step fails.

## Implementation

- [`components/AzureViewsGit.tsx`](../../../src/components/AzureViewsGit.tsx)
- [`viewDefinitions.ts`](../../../src/viewDefinitions.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`gitSnapshots.ts`](../../../src/gitSnapshots.ts)
