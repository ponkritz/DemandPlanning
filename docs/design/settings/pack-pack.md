# Monthly pack setup

[Back to Settings](../admin.md)

## Default design

Edits department title, slide display lines by stream/Epic, Capabilities bullet and KPI rows. The file control uploads/replaces or removes the private `.pptx` template and can show its Git history.

## Behavior and storage

The section needs `pack.setup`. Configuration is written to `monthly-pack-setup.json` with writable Git; a validated template up to 10 MB is stored separately as `monthly-pack-template.pptx`. KPI rows may read Epic metrics, monthly or yearly utilization, or values entered for the month. The Capabilities line lists unique Features under selected Epics with completed hours in the month. The Pulse Check export reads this setup and the month’s notes and figures.

## Implementation

- [`components/MonthlyPackSetupPanel.tsx`](../../../src/components/MonthlyPackSetupPanel.tsx)
- [`useMonthlyPack.ts`](../../../src/useMonthlyPack.ts)
- [`monthlyPack.ts`](../../../src/monthlyPack.ts)
- [`pptxTemplate.ts`](../../../src/pptxTemplate.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
