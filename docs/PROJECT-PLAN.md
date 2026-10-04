# Project Plan

## Objective

Deliver a centrally governed demand-planning tool for 20–25 Quality Engineering users, replacing monthly spreadsheet handling while retaining a controlled migration route.

## Delivery plan

| Phase | Duration | Outcome |
|---|---:|---|
| Release 1 build | 3–5 working days | Desktop UI, activities, effort, baselines, locks, migration staging, dashboards and admin controls |
| Release 1 test | 5 working days | Functional test, migration rehearsal, role/lock checks and stakeholder review |
| Production connection | 3–5 working days after approvals | Entra authentication, SharePoint adapter and access groups |
| Reporting | 3–5 working days | Governed PDF/image/PPT monthly pack and snapshot evidence |
| Release integrations | 5–10 working days | Validated TFS/Windchill mappings and YoY release analytics |
| AI insights | 3–5 working days | Traceable summaries, anomaly prompts and insight review workflow |

The 3–5 day target is viable for a testable Release 1, not for every production integration. Approval lead time for identity, signing and distribution is outside development effort.

## Dependencies

- Entra public-client registration with delegated SharePoint/Graph permissions
- Confirmed SharePoint schemas and security groups
- Authoritative workbook and mapping sign-off
- TFS and Windchill export samples
- Philips code-signing and approved executable distribution route

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| In-house tool maintained by one person; departure creates continuity risk | Secondary maintainer, PR review, runbook, recorded handover, tagged releases and restore rehearsal |
| Source workbook ambiguity | Data-owner sign-off and repeatable staged migration with reconciliation totals |
| Users do not update regularly | Focused monthly workbench, reminders later, update completeness signals and short entry flow |
| Planning or actuals changed after deadline | Separate period locks, reasoned temporary extensions and immutable audit events |
| Unsigned executable is blocked | Enterprise signing certificate and software-center/approved SharePoint distribution |
| AI creates unsupported conclusions | Source-linked insights, human review, no automated control decisions |

## Operating ownership

- Application Owner: service continuity and access model
- Admin: configuration, roles and period controls
- Process Owner: master values, deadline exceptions and data quality
- Contributor: owned activities and monthly actuals
- Viewer: dashboards and exports
