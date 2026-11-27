# Load from Git

[Back to Settings](../admin.md)

## Default design

**Load everything from Git** on **Data & history → Git storage** starts a full workspace background job. A Stream mapping change from another device opens **Load latest Release Details**, which loads only the connection mapping. The forced reload dialog closes while its job runs. The app runs one load at a time. Synthetic sample disables both actions.

## Behavior and storage

The full load reads planning data, the Stream mapping and the active work email’s Other views, on-prem snapshots, Windchill exports, access roles, and Feature setup. The forced Release Details load reads the Stream mapping and the connection definitions it depends on. Background jobs shows progress and results. If the forced load fails, its dialog returns with each failed part, Git storage settings, and Retry. When every failure is a GitHub server outage or a network request with no response, **Continue without loading** is available for that session. The app asks again at the next start.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`App.tsx`](../../../src/App.tsx)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`useAccess.ts`](../../../src/useAccess.ts)
- [`useFeatureSetup.ts`](../../../src/useFeatureSetup.ts)
- [`gitSnapshots.ts`](../../../src/gitSnapshots.ts)
- [`windchillSnapshots.ts`](../../../src/windchillSnapshots.ts)
