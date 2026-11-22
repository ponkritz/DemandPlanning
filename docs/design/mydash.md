# My dashboard

**Route** `mydash` · Data Insights · Header month enabled. The app passes the signed-in user's own work context into this route. It resolves the configured work email and associated assignee names. An unresolved identity shows a setup prompt.

## Default design

The page identifies the user and selected month, then renders five ordered sections. The layout control can hide or reorder them and allow authorized users to set defaults.

| Section | Default content |
|---|---|
| My hours | Planned, Recorded, Utilization, Overrun / ad-hoc, six-month table newest first |
| My open work | Open Feature and User Story counts, Tasks/Bugs, ready-to-close and missing active stories, navigation links |
| My streams and releases | Planned/recorded hours by Epic and owned Features due in the selected month |
| Release counts | Stream release totals for the selected month |
| Signed by me | Totals, counts per stream and expandable document details for the last 12 months by default, with month range and preset controls |

## Implementation logic

- `personMonths` builds capacity rows for the six months ending at the header month. `myNames` matches all known assignee names for the user's identity. The view sums the matching rows, prefers actual utilization when present, and shows the capacity model's exclusion reason if the user was not counted. Plan comes from Azure Task Original Estimate and recorded hours from Task Completed Work.
- Overrun is the positive Task-level difference above estimates. Ad-hoc comes from tagged Task hours. Streams appear when selected-month planned or recorded effort is positive. Feature due list uses ownership and Target Date month, includes open and closed Features, and sorts ascending by target date.
- Pending work and readiness checks come from the matching user context and shared `myWork` rule set. Navigation opens Time Writing, My Tasks, or Sprint check. Work item links open Azure DevOps.
- Release counts come from stream datasets and the release counting model, independent of the signed-in user's ownership filter. Signed by me detects author/reviewer/approver name fields in configured Azure or Windchill data, matches aliases or email, and uses the matching signature date with document-level date fallback. A source without signature fields is shown as missing coverage. Signed records without any date are counted separately. The signed document detail table has no export action.
- The page performs no Azure work-item edits. Layout preferences use personal views. Shared layout defaults use the configured Git storage and the layout-default permission.

## Code and verification

[View](../../src/pages/MyDashboardPage.tsx) · [Identity and checks](../../src/myWork.ts) · [Capacity](../../src/capacity.ts) · [Aggregations](../../src/dashboard.ts) · [Signatures](../../src/mySignatures.ts) · [Signed by me UI](../../src/components/SignedByMe.tsx) · [Release counts](../../src/components/ReleaseCounts.tsx) · [Layout store](../../src/usePersonalViews.ts) · [Signature tests](../../tests/my-signatures.test.mjs)
