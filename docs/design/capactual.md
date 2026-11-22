# Capacity vs Actual

**Route** `capactual` · Testing · Header month enabled. The Testing group is limited to Admin in the app shell.

## Default design

Region, Epic and Owner start at All. Headline cards show Capacity, Actual, Used and Headroom with comparison to the preceding month. A 12-month chart ends at the header month. The detail lists people with capacity, actual, plan, absence and utilization band, and charts the top ten Epics by actual hours. Chart data labels follow the shared chart default and can be toggled. Without source items, the page provides a fetch/sample empty state.

## Implementation logic

- `capacityVsActual` builds 12 months of person-months using the configured availability, profiles and Time Writing Task hours. Region and Owner narrow the person rows. A valid Epic selection narrows plan/actual to that Epic while retaining the person's own capacity. The Epic picker uses active non-absence Epics.
- The metric called **Used** is this view's `actual / capacity × 100`, rounded to one decimal and absent when capacity is zero. Headroom is capacity minus actual. Its percentages and headroom depend on the current Epic filter and this view's denominator. Over is strictly above the configured overload threshold, Under strictly below the available threshold, On track includes both boundary values, and No capacity applies when there is no percentage.
- The people list uses the selected month and includes positive capacity or actual. It sorts highest used percentage first, then name. Epic breakdown sums positive actual across the visible person-months and sorts descending. Previous-month comparison uses identical filters.
- The view computes from fetched or sample data. It has no edit, save, or dedicated export action.

## Code and verification

[View](../../src/pages/CapacityActualPage.tsx) · [Calculation model](../../src/capacityActual.ts) · [Person-month aggregation](../../src/dashboard.ts) · [Capacity rules](../../src/capacity.ts) · [Tests](../../tests/capacity-actual.test.mjs)
