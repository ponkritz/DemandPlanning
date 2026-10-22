# UAT Plan

## Participants

- Application Owner
- One Admin or Process Owner
- Three to five QE Contributors across Junior/Senior bands
- One dashboard-only stakeholder

## One-week UAT sequence

The scenarios are the test cases marked **UAT** in [TEST-PLAN.md](TEST-PLAN.md).

| Day | Focus | Test cases |
|---|---|---|
| 1 | Install and open (web and desktop), navigation, connections, fetch and auto-save | TC-NAV-01, TC-NAV-06, TC-CON-03, TC-FET-02, TC-DSK-03 |
| 2 | Monthly Time Writing: scope, locks, staging and save | TC-MON-01, TC-MON-04 |
| 3 | Assigned to Me: finish, move to the current Sprint, month tasks; Feature creation | TC-ATM-03, TC-ATM-04, TC-ATM-05, TC-BKL-02 |
| 4 | Overview (This month, Trends), baselines, Git storage | TC-OVR-01, TC-GIT-02 |
| 5 | Force Update, backup and restore, snapshots (where SharePoint is available), Documentation | TC-UPD-02, TC-STO-04, TC-SNP-02, TC-DOC-01 |

## Entry criteria

- Verified Release 1 build and SHA-256 checksum
- Synthetic or approved masked test dataset
- Named UAT users
- Known limitations and issue log

## Exit criteria

- No open critical/high defects
- All core scenarios passed by at least one non-developer user
- Owner signs off lock behaviour, audit evidence and the open issues in SRS §6
- Support owner, rollback route and production prerequisites confirmed

## Feedback record

Each issue should capture scenario, expected/actual result, screenshot, severity, user role, month and build version. Enhancements that do not block Release 1 move to the phased backlog.
