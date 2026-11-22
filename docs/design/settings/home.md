# Admin Overview

[Back to Settings](../admin.md)

## Default design

Setup status and the most important configuration tasks. The page shows open setup steps, shared setup warnings, a Git save bar when applicable, and recent local changes. Required tasks sort ahead of warnings and optional checks. Each fix button navigates to the relevant setting.

## Behavior and storage

The overview combines the shell’s `setupSteps` with facts from the Git connection, access policy, Epic settings and bulk Epic assignments. `setupGaps` resolves effective shared Feature setup (including All Epics) for DP/IOCC targets and flags shared configurations with no resolved Definition of Done. Other checks cover unsaved planning data, read-only Git, missing policy or Tool Owner, and unmapped IOCC target. Opening a check changes navigation. Saving shared planning data happens through the Git bar.

## Implementation

- [`components/AdminOverview.tsx`](../../../src/components/AdminOverview.tsx)
- [`adminOverview.ts`](../../../src/adminOverview.ts)
- [`setupGuide.ts`](../../../src/setupGuide.ts)
