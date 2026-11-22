# Release counts

[Back to Settings](../admin.md)

## Default design

Stream defaults to the first configured count stream (CP, DP, IOCC); the local month starts from the shell’s report month. Completed and Supported can each be blank or whole numbers 0 to 10,000. Existing entries are listed newest month first.

## Behavior and storage

Edits use `release.counts`. Records are indexed by stream and month in `releaseSourceSettings.countOverrides` and audited. Save to Git distributes the changes. The reporting model uses entered values while stream data for that month is unavailable, labels the fallback, and uses actual fetched counts when available; an empty entry with no source data yields a placeholder.

## Implementation

- [`components/ReleaseCounts.tsx`](../../../src/components/ReleaseCounts.tsx)
- [`releaseSource.ts`](../../../src/releaseSource.ts)
- [`releaseOverview.ts`](../../../src/releaseOverview.ts)
- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
