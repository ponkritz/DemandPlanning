# My page usage

[Back to Settings](../admin.md)

## Default design

The count toggle defaults off. On, the page shows the number of openings, date counting began, and the most-opened pages first. Start again from zero clears the count while preserving opt-in.

## Behavior and storage

The shell records navigation through the usage helper. Counts and the opt-in flag stay in browser storage and are excluded from shared files and backups. Turning the toggle off deletes counts. Invalid persisted entries are normalized when read.

## Implementation

- [`components/UsagePanel.tsx`](../../../src/components/UsagePanel.tsx)
- [`usageCounts.ts`](../../../src/usageCounts.ts)
- [`App.tsx`](../../../src/App.tsx)
