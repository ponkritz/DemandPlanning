# UAT Plan

## Participants

- Application Owner
- One Admin or Process Owner
- Three to five QE Contributors across Junior/Senior bands
- One dashboard-only stakeholder

## UAT sequence (eleven days)

The scenarios are the test cases marked **UAT** in [TEST-PLAN.md](TEST-PLAN.md). The repeatable ones are also automated in the end-to-end suite (`pnpm test:e2e`, SOFTWARE-COMPONENTS.md §1.10), which runs in CI on every change; the UAT days below are performed by the named users on the released build, scripted for the high-process-risk features (writes to Azure DevOps, credentials) and exploratory for the rest, as DEVELOPMENT-PROCESS.md §6 describes.

| Day | Focus | Test cases |
|---|---|---|
| 1 | Install and open (web and desktop), navigation, connections, fetch and auto-save | TC-NAV-01, TC-NAV-06, TC-NAV-24, TC-CON-03, TC-FET-02, TC-FET-08, TC-DSK-03 |
| 2 | Monthly Time Writing: scope, locks, staging and save | TC-MON-01, TC-MON-04 |
| 3 | Assigned to Me: finish (Features and User Stories: New → Active → Closed), move to the current Sprint, month tasks; New Feature and Complete children; Feature creation | TC-ATM-03, TC-ATM-04, TC-ATM-05, TC-ATM-11, TC-BKL-02 |
| 4 | Dashboard (period, filters, six tabs, Insights), baselines, Git storage | TC-OV-11, TC-OV-13, TC-NAV-20, TC-NAV-21, TC-GIT-02 |
| 5 | Force Update, backup and restore, snapshots (where SharePoint is available), Documentation and the Validation Package (traceability matrix, known issues, components, security assessment, DFMEA, development process) | TC-UPD-02, TC-STO-04, TC-SNP-02, TC-DOC-01, TC-DOC-03 |
| 6 | Sharing through Git (shared connection setup, Load from Git, read-only token), Release Details and Windchill exports, Overview by region and role, Backlog Health | TC-CON-16, TC-CON-17, TC-CON-18, TC-CON-19, TC-CON-21, TC-CON-22, TC-SCR-01 |
| 7 | Roles and access: set up roles, assign a Scrum Master by email, check what each role sees (two people on two browsers); Load everything from Git | TC-ACC-01, TC-CON-24 |
| 8 | Menu (Data Insights, collapsing), Backlog Health columns and filters, assigning new work to others, Feature setup per Epic (personal and shared), State checks and Feature states | TC-NAV-17, TC-SCR-02, TC-SCR-03, TC-ACC-02, TC-CON-23, TC-CON-25, TC-CON-26, TC-CON-27, TC-ATM-08 |
| 9 | Holidays and common activities (map PI Planning and regional holidays in Settings → Capacity); phones and tablets; Other views in the menu; default streams and stream rules; DP releases (Pedestal and DHFI) | TC-CAP-02, TC-GIT-05, TC-NAV-31, TC-NAV-32, TC-NAV-22, TC-NAV-25 |
| 10 | First-time setup: the Get started pop-up in a new browser, the required work email on Time Writing, the Settings editors as pop-ups; editing shared Feature setups in their list; the mandatory Feature DoD (creating a Feature and in the Feature setup); deleting a Feature setup; the Time Writing story at the project root (not in a Sprint); filling missing DoDs with the default; Release Details → DP as its query table with chosen columns | TC-NAV-33, TC-CON-28, TC-NAV-34, TC-CON-30, TC-BKL-04, TC-CON-31, TC-CON-32, TC-BKL-05, TC-CON-35, TC-QV-08 |
| 11 | QE Mapping: upload the existing Excel, edit, filter, group, add and delete rows and columns, Save to Git, export; DP Completed and Supported Releases (DDT month) on the DP page, in Pulse Check and on the Dashboard; DP rows matched to their QMS-0025 Feature / User Story, Create Feature for an unmatched one in the default Create Feature form; NPRA: only booked hours deducted, tracked against the 20 h maximum per person, over it flagged, maximum set in Settings → Capacity; unique releases from the S&S IT Windchill export (Location column, document names as fallback), unique locations saved to the Git data repository | TC-QEM-04, TC-QV-10, TC-QV-14, TC-QV-16, TC-CAP-03, TC-CON-39, TC-CON-40 |

## Entry criteria

- Verified Release 1 build and SHA-256 checksum
- Synthetic or approved masked test dataset
- Named UAT users
- Known limitations and issue log ([KNOWN-ISSUES.md](KNOWN-ISSUES.md))

## Exit criteria

- No open critical/high defects
- All core scenarios passed by at least one non-developer user
- Owner signs off lock behaviour, audit evidence and the open issues in KNOWN-ISSUES.md
- Support owner, rollback route and production prerequisites confirmed

## Feedback record

Each issue should capture scenario, expected/actual result, screenshot, severity, user role, month and build version. Enhancements that do not block Release 1 move to the phased backlog.
