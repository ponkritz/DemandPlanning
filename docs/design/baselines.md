# Baselines

**Route** `baselines` · Data & governance · Header month enabled for the Task plan check. Release baselines cover all months.

## Default design

The page shows Git sync or a view-only notice, four portfolio metrics, Release baselines table, Estimation rules editor, then monthly Task plan-check metrics and table. Release columns include Stream, Release, Scope, Baseline, Actual, Variance and Scope growth. An eligible row exposes **Set scope** or **Re-baseline**, with version history available for rescoped releases. Common DataTable controls handle table preferences and exports.

## Implementation logic

1. A release is a Feature directly under an Epic whose title matches the configured rule's stream case-insensitively. Removed records are omitted. The stored scope matches stream and exact Feature title, so renaming a Feature affects matching.
2. The formula is `hoursPerUnit × (baseUnits + unitsPerDriver × driverCount)`, with optional maximum. Fixed-unit-only rules omit the driver. A missing required count is indicated. The editor normalizes legacy formats. Example rules can populate a missing rules array and should be distinguished from configured rules.
3. Each dated scope appends to history. The earliest and latest scope are evaluated using the current rule. Growth is latest baseline minus first baseline. Variance is booked actual minus current baseline. Actuals are nonnegative Completed Work summed from qualifying descendant Tasks across all months, including month-named Tasks or Tasks directly under a Time Writing story. Totals on the four release cards include only releases with current scope for summed baseline, actual and growth.
4. For the header month, the Task table groups relevant child Tasks by Epic/Time Writing context. Original Estimate and Completed Work come from Tasks. Variance requires both fields. The signal requires positive Original Estimate and Completed Work strictly above 125% of the estimate. This Task-estimate check is distinct from release-scope overrun.

## Permissions and persistence

The `baselines.edit` right and Git read-only status control editing. Saving rules or scope updates app state and adds an audit record. The Git sync action shares the planning configuration if connected and writable. The page does not update Azure Task effort.

## Code and verification

[View](../../src/pages/BaselinesPage.tsx) · [Rules and Task rollup](../../src/baseline.ts) · [Rules editor](../../src/components/BaselineRulesEditor.tsx) · [Selected-month insight model](../../src/azureInsights.ts) · [Git sync](../../src/useGitStorage.ts) · [Tests](../../tests/baseline.test.mjs)
