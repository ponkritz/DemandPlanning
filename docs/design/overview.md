# Team overview

**Route** `overview` · Data Insights · Own period selector. The default year and quarter come from the header month on first visit. The default tab is Overview, and filters start empty. Saved personal filters or the browser fallback can restore another selection.

## Default design

Region, Role, Team member and Stream multi-selects precede year, quarter and month controls. Quarters include their months, and removing every selection produces the whole year. The summary identifies the period, people, person-months, applied filters, locked figures and incomplete months. An empty selection result shows guidance. Six headline metrics lead to drill-down tabs.

| Tab | Content and rules |
|---|---|
| Overview | Planned utilization, actual utilization, elapsed actual vs plan, current projection vs plan, planned overload and unplanned capacity (capacity minus plan). Customizable summary sections hold the drill-down tiles, demand/capacity chart and findings. |
| Capacity and workload | Same-role, same-month rebalancing of current/future work. Repeated overload and hours concentration. Forecast, anomalies, plan/actual month and people heatmaps, consecutive recorded-month comparison, role and region splits. |
| Streams | Epic totals and owners, month mix, overrun and ad-hoc Pareto, momentum and resilience. Mix and Pareto have separate Task scoping and ignore the Stream filter. |
| Plan quality | Plan health, elapsed months' accuracy/bias, horizon and recording coverage. |
| Utilization | Month/person breakout from the active capacity profile with figure locks and profile terms. |
| Old Calculation | Original model using capacity after Standard Hours with configured shared time groups. Authorized users can change the component lines and exclusions. |
| Definitions | Active terms and formula, funded hours threshold and absence configuration. |

## Implementation logic

1. `periodMonths` expands the union of quarters and individual months for the year. `personMonths` builds rows from the Time Writing workspace and the capacity model. Region, role and person filter rows. Stream selection narrows effort to selected streams while retaining applicable person capacity. The utilization drill-down uses its own capacity table path. The Overview drill-down tiles are Utilization, Overload and headroom, Plan accuracy, Plan health, Delivery and Forecast.
2. The built-in **Current (v4)** profile uses working days employed × funded hours/day as contractual hours and deducts absence to get available hours. Utilization divides counted actual (work, training, other NPRA and common activities) by available hours. Plan uses the corresponding Task estimates. Profiles can change the buckets, terms or formula. A zero denominator produces an unavailable percentage. Aggregation uses sums of numerators and denominators.
3. Forecast extrapolates recorded effort by elapsed weekday share for the current month, including today. Accuracy uses the sum of absolute person-month deviations divided by total planned hours for elapsed rows with plan or actual. Bias is signed actual minus plan divided by plan. Health averages available components for load balance, actual-entry coverage and share of streams without a single point of failure. Missing or incomplete months have explicit display and coverage behavior.
4. Stream release counts, where displayed, are team-wide counts from release streams. They use the release counting rules and are separate from effort totals.

## Diagnostic defaults

| Analysis | Built-in rule |
|---|---|
| Forecast | Within ±10% of plan is on track. Reaching the overload band takes precedence. Zero recorded time is no data. |
| Accuracy | Up to 15% error is reliable. Otherwise bias at or below −20% is under-recording and bias at or above +20% is overrun. |
| Momentum | Compare average recorded hours across consecutive windows of up to three elapsed months each. Rising/falling requires both a 20% change and an 8-hour difference. |
| Resilience | One person recording at least 80% of a stream is a single point. At least 90% of a person's recorded effort in one stream is specialization. |
| Unusual months | At least three elapsed person-months, with at least 50% and 8 hours of difference from the median of that person's other elapsed months. |
| Health / overload | Green at 75 points, amber at 50. Three consecutive elapsed overloaded months by default. A missing month breaks the streak. |

These thresholds can be configured in Admin → Capacity & time. Team overview utilization bands include equality at the overload threshold.

## Permissions and persistence

The figure-lock permission enables an alternate viewing profile and lock/unlock actions. A lock captures computed monthly person figures, formula/profile and who/when, retaining up to five records per month. Unlock marks the active record with actor, date and reason. These stores update capacity settings and audit records. The alternate viewing profile itself is temporary. Standard Hours and shared-time group edits update capacity settings and can be shared through Git planning data. The page reads Azure work items and links to related pages. Most detailed tables use bespoke tab UI rather than the common export table.

## Code and verification

[View](../../src/pages/DashboardPage.tsx) · [Period/filter/rollup model](../../src/dashboard.ts) · [Capacity](../../src/capacity.ts) · [Profiles and frozen figures](../../src/calculationProfiles.ts) · [Analytics](../../src/insights.ts) · [Thresholds](../../src/insightThresholds.ts) · [Workload charts](../../src/components/WorkloadCharts.tsx) · [Dashboard tests](../../tests/dashboard.test.mjs)
