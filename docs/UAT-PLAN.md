# UAT Plan

## Participants

- Application Owner
- One Admin or Process Owner
- Three to five QE Contributors across Junior/Senior bands
- One dashboard-only stakeholder

## One-week UAT sequence

| Day | Focus |
|---|---|
| 1 | Install/open, navigation, roles, masters and activity creation |
| 2 | Monthly planning, baselines, capacity and 25% flags |
| 3 | Planning freeze, ad-hoc work, actuals deadline and exception handling |
| 4 | Historical migration rehearsal and source-to-target reconciliation |
| 5 | Release data, dashboard insights, LTE/PI snapshot and exports |

## Entry criteria

- Verified Release 1 build and SHA-256 checksum
- Synthetic or approved masked test dataset
- Named UAT users and role matrix
- Known limitations and issue log

## Exit criteria

- No open critical/high defects
- All core scenarios passed by at least one non-developer user
- Migration totals reconciled and exceptions accepted
- Owner signs off roles, lock behavior and audit evidence
- Support owner, rollback route and production prerequisites confirmed

## Feedback record

Each issue should capture scenario, expected/actual result, screenshot, severity, user role, month and build version. Enhancements that do not block Release 1 move to the phased backlog.
