# Epics to match Features in

[Back to Settings](../admin.md)

## Default design

A stream selector, selected Epic count, and a search by Epic ID or title. Selected Epic IDs sort first. No selection means whole board; unmapped or unfetched IDs are reported separately.

## Behavior and storage

DP, CP, IOCC and Content can restrict Feature and User Story matching to selected QMS-0025 Epic trees. The matching scope affects the Board match and existing-work checks, including bulk create’s exact match guard. Windchill and Tool Validations retain whole-board matching. Edits need `streams.options`, update `releaseSourceSettings.featureEpics`, record a planning audit and require Save to Git for other users to receive them.

## Implementation

- [`components/FeatureEpicsPanel.tsx`](../../../src/components/FeatureEpicsPanel.tsx)
- [`releaseSource.ts`](../../../src/releaseSource.ts)
- [`releaseOverview.ts`](../../../src/releaseOverview.ts)
- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
