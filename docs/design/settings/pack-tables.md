# Table and chart defaults

[Back to Settings](../admin.md)

## Default design

Shared defaults enable column resize, reorder and selection; wrap and density switches; and CSV and Excel export. Starting display is Comfortable with wrapping off; chart data labels are off. Excel date-time format starts at `yyyy-mm-dd hh:mm`.

## Behavior and storage

Opening the section needs `layout.defaults`. The panel updates normalized defaults in app state and can share them via Save to Git. Individual table layouts persist separately per table/browser, and chart-level label choices can override the shared starting setting. Exports preserve numeric cells and convert supported dates to dedicated Excel values or formatted CSV strings. Supported table implementations consume these defaults through shared components and hooks.

## Implementation

- [`components/TableDefaultsPanel.tsx`](../../../src/components/TableDefaultsPanel.tsx)
- [`tableDefaults.ts`](../../../src/tableDefaults.ts)
- [`components/DataTable.tsx`](../../../src/components/DataTable.tsx)
- [`useDataLabels.ts`](../../../src/useDataLabels.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
