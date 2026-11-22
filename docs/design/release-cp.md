# Release Details — CP

## Default design

The selected month opens the CP report with support/completion counts, release rows and click-through signature evidence. Shared activity and data issues are shown separately. The second tab exposes the raw work-item query. The report offers an evidence CSV and a link or action for the mapped Time Writing Feature.

## Logic and implementation

[cpReporting.ts](../../src/cpReporting.ts) walks the release-folder tree to the closest Release ancestor. Signature evidence requires a named qualifying QA/QE approver, a matching function and a usable approval date. Signature month governs counting. Each eligible Release container counts once as Supported in a month with evidence. Completion requires a signature on main Release Notes in the Reports folder. The report flags completion in multiple months and separates excluded shared containers. Missing links, malformed tree relations and unusable evidence contribute issue details.

The optional CP Releases result enriches display names through version matching and its Content field. Missing or conflicting names surface in the report, independent of the container IDs used for counts. [releaseOverview.ts](../../src/releaseOverview.ts) and [BoardPage.tsx](../../src/pages/BoardPage.tsx) supply report inputs. [CpReportView.tsx](../../src/components/CpReportView.tsx) renders results and export. The report can open a Feature creation action on the Time Writing connection. [Stored WIQL](../CP_Release_Folder%20Query.wiql), [implementation brief](../CP_Release_Reporting_Implementation.md).
