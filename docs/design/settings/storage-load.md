# Load from Git

[Back to Settings](../admin.md)

## Default design

With Git connected, **Load everything from Git** shows progress and reports failures by step. Synthetic sample disables the action. A Stream mapping change from another device opens a blocking reload dialog.

## Behavior and storage

The load reads planning data, the Stream mapping and the active work email’s Other views, on-prem snapshots, Windchill exports, access roles, and Feature setup. On failure, the dialog shows each failed part, Git storage settings, and Retry. When every failure is a GitHub server outage or a network request with no response, **Continue without loading** is available for that session. The app asks again at the next start.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`App.tsx`](../../../src/App.tsx)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`useAccess.ts`](../../../src/useAccess.ts)
- [`useFeatureSetup.ts`](../../../src/useFeatureSetup.ts)
- [`gitSnapshots.ts`](../../../src/gitSnapshots.ts)
- [`windchillSnapshots.ts`](../../../src/windchillSnapshots.ts)
