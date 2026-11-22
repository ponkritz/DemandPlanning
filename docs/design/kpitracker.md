# KPI tracker

**Route** `kpitracker` · Data Insights · Marked hidden in the current navigation registry.

## Default design and behavior

The source panel shows where the workbook came from, read time, optional last-modified value, and a link to the shared Git history. The first sheet is selected. A sheet selector appears when there is more than one. The shared DataTable derives its column labels from the sheet and displays up to 500 rows at once with the named table export. Separate states cover no workbook, an empty sheet, disconnected Git, and read or parse errors.

## Implementation logic

1. When Git storage is available, load sibling file `kpi-tracker.json` and initialize the SharePoint URL from its metadata. A subsequent Git load leaves an already loaded live workbook visible.
2. The desktop preload exposes the read, sign-in and sign-out actions. The app validates the SharePoint workbook URL, downloads the file via the desktop bridge, reads workbook sheets with `readXlsx`, and normalizes them into a tracker. Limits are 20 sheets, 2,000 rows per sheet, 100 columns and 1,000 characters per cell. A first non-empty row becomes the header, with empty/duplicate names normalized.
3. A live desktop read can update the Git copy with **Manage shared settings**, a connected writable Git token, and sample mode off. A Git save error preserves the live display and reports the failure. Browser users use the shared copy. SharePoint is read-only for this feature.

## Code

[View](../../src/pages/KpiTrackerPage.tsx) · [Workbook limits and schema](../../src/kpiTracker.ts) · [Excel parser](../../src/xlsx.ts) · [Git storage hook](../../src/useGitStorage.ts) · [Navigation](../../src/pages/registry.ts) · [Desktop entry](../../electron/main.cjs)
