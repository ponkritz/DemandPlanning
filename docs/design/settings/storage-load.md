# Load from Git

[Back to Settings](../admin.md)

## Default design

Visible with Git configured. One action shows a busy state and then a summary listing loaded areas and errors by step. Synthetic sample disables the action.

## Behavior and storage

The shell runs six independent reads in order and keeps going when a step throws: planning data, connection metadata (then reload local profiles), on-prem view snapshots, Windchill exports (then reload views), access roles, and Feature setup. The view and export snapshot readers update only when an eligible newer copy is available. Some individual hooks record errors in their own status instead of throwing; check those status panels as well.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`App.tsx`](../../../src/App.tsx)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`useAccess.ts`](../../../src/useAccess.ts)
- [`useFeatureSetup.ts`](../../../src/useFeatureSetup.ts)
- [`gitSnapshots.ts`](../../../src/gitSnapshots.ts)
- [`windchillSnapshots.ts`](../../../src/windchillSnapshots.ts)
