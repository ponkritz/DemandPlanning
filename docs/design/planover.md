# Planning Overview

**Route** `planover` · Testing · Header month enabled. The Testing group is limited to Admin in the app shell.

## Default design

Month heading and a Monthly Pack shortcut precede Region, Epic and Owner filters, all initially unrestricted. Four cards summarize planned utilization, delivery, baseline flags and capacity risk. A 12-month planned/actual/capacity chart leads into the exception queue and next six months of delivery health. The exception type defaults to All. Filters and chart hover are local to the view. Without Azure work items, the page shows an empty state with refresh/sample guidance.

## Implementation logic

- `planningOverview` derives rows from Time Writing and the shared capacity settings. Hours filter by region, owner and selected stream. Delivery uses the owner assigned to the Feature, the owner profile region and the Feature's Epic ancestry. Removed Features and the absence Epic are excluded. Filter choices include Active non-absence Epics, profile regions and people with plan or actual hours.
- Delivery denominator is Features whose Target Date falls in the reporting month. Closed, Resolved, Done and Completed count as completed. Open Features with target before today are overdue, and other open Features are at risk. The completion percentage is complete/due and displays unavailable when nothing is due. The six-month window starts at the selected month and groups by Epic.
- Over-baseline exceptions require a positive estimate and cumulative actual strictly above 125% of the latest baseline. A missing-baseline exception requires an open Feature in a rule-covered stream with no baseline. Capacity risk requires positive capacity and month plan/capacity strictly greater than the configured overload threshold. The exception chips narrow the queue.
- Features open through Azure item links. The Monthly Pack action routes to its settings. The view performs no Azure updates and has no dedicated export.

## Code and verification

[View](../../src/pages/PlanningOverviewPage.tsx) · [Calculation model](../../src/planningOverview.ts) · [Hours aggregation](../../src/dashboard.ts) · [Baseline model](../../src/baseline.ts) · [Tests](../../tests/planning-overview.test.mjs)
