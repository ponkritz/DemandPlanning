# Load from Git

[Back to Settings](../admin.md)

## Default design

**Load everything from Git** starts one background job. A Stream mapping change from another device opens a blocking reload dialog, which closes when the load starts. The app remains usable during the job. Synthetic sample disables the action.

## Behavior and storage

The load reads planning data, the Stream mapping and the active work email’s Other views, on-prem snapshots, Windchill exports, access roles, and Feature setup. Background jobs shows progress and results. The forced dialog returns if the job fails and shows each failed part, Git storage settings, and Retry. When every failure is a GitHub server outage or a network request with no response, **Continue without loading** is available for that session. The app asks again at the next start.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`App.tsx`](../../../src/App.tsx)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`useAccess.ts`](../../../src/useAccess.ts)
- [`useFeatureSetup.ts`](../../../src/useFeatureSetup.ts)
- [`gitSnapshots.ts`](../../../src/gitSnapshots.ts)
- [`windchillSnapshots.ts`](../../../src/windchillSnapshots.ts)
