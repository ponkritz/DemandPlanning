# Requirements Specification

## Functional requirements

1. Maintain activities with dates, status, process owner, QE, band, complexity and source.
2. Record monthly planned and actual hours, notes, learnings and struggles.
3. Freeze planning and actuals independently by month.
4. Permit Owner/Admin/Process Owner extensions with reason and audit evidence.
5. Classify work introduced after planning closure as ad-hoc for that month only.
6. Manage effective-dated baselines in the UI and flag absolute variance above 25% without blocking entry.
7. Calculate resource capacity and utilization.
8. Import historical activity/effort records from the workbook source structure with validation and reconciliation.
9. Stage TFS, Windchill and manual release milestones with release type, features, bugs, planned/actual closure and YoY analytics.
10. Generate on-demand LTE and PI Review snapshots and export CSV, Excel, PDF, image and two-slide PowerPoint outputs in phases.
11. Administer all dropdown masters and active/inactive values.
12. Enforce Owner, Admin, Process Owner, Contributor and Viewer roles.
13. Provide traceable AI insights in a later governed phase.

## Non-functional requirements

- Support 25 concurrent team users with normal monthly volumes.
- Central production persistence in SharePoint Lists; local storage is development-only.
- Microsoft identity authentication with no embedded client secret.
- Audit configuration, role, lock, exception, migration and material data changes.
- Responsive desktop-first UI with accessible labels and keyboard controls.
- No production data, tokens or employee details in Git.
- Recoverable releases with documented rollback and schema versioning.

## Proposed SharePoint entities

- Activities
- Monthly Effort Updates
- Baselines
- Period Controls
- Releases
- Masters
- Role Assignments
- Snapshots
- Audit Events
- Migration Batches and Migration Errors

## Acceptance boundary for Release 1

Release 1 is accepted when the local executable demonstrates the complete workflow using synthetic data, all lock/ad-hoc/baseline rules pass verification, migration can be rehearsed, and production prerequisites are documented. Live multi-user SharePoint operation is accepted only after the Entra/SharePoint adapter is deployed and UAT completed.
