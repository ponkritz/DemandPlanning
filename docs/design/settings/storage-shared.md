# Shared setup in Git

[Back to Settings](../admin.md)

## Default design

Offers Save, Restore and load cached data for shared connections plus backup/cleanup tools. Restore can take an optional token for the device and asks for confirmation. Admins also see unassigned Other views and can assign each to a work email.

## Behavior and storage

The section needs `storage.shared`; updates require live mode, a writable token, and a verified private repository. `azure-views.json` keeps the Stream mapping. Existing Other views move to `other-views/unassigned.json` before their old definitions are removed. Assignment writes the destination person’s file before removing the unassigned entry. Shared connection definitions exclude PATs, and the cleanup flow retains them on-device.

## Implementation

- [`components/AzureViewsGit.tsx`](../../../src/components/AzureViewsGit.tsx)
- [`viewDefinitions.ts`](../../../src/viewDefinitions.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`gitSnapshots.ts`](../../../src/gitSnapshots.ts)
