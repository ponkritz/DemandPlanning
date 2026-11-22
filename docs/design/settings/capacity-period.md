# Period control

[Back to Settings](../admin.md)

## Default design

For the month in the app header, displays independent Plan and Actual lock cards, open/locked status, last update dates and early-lock controls. Defaults are open through the 5th of the planning month and the 4th of the next month for actuals. Default day inputs accept 1–28. The initial reason is `Approved operational extension`.

## Behavior and storage

Requires `capacity.periods`. The active editor stores default days and per-month date/early-lock overrides in `capacitySettings`. The selected date stays open to end of local day. Lock now forces early closure, Undo early lock removes that override, and setting a later cutoff can reopen a date-locked month. Edits update the runtime lock model and audit immediately; use Save to Git to share them. The repository also contains a legacy `PeriodControls` component. Its wording about an actuals deadline on the 5th describes that legacy path; the Settings route uses the date-based model and locks at the start of the 5th by default.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`planningLock.ts`](../../../src/planningLock.ts)
- [`capacity.ts`](../../../src/capacity.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`components/PeriodControls.tsx`](../../../src/components/PeriodControls.tsx)
