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
| 1 | Install and open (web and desktop), Home and its tiles, navigation, connections, fetch and auto-save | TC-NAV-01, TC-NAV-06, TC-NAV-24, TC-CON-03, TC-FET-02, TC-FET-08, TC-DSK-03, TC-NAV-42 |
| 2 | Time Writing: the month's tasks, planned and actual hours, locks and save (replaces Monthly Time Writing) | TC-ACT-02, TC-ACT-03 |
| 3 | My Tasks [Board]: finish (Features and User Stories: New → Active → Closed), move to the current Sprint (Sprint check); New Feature and Complete children; Feature creation; a Feature with a Start date and Target date: one Time Writing Task per month, hours asked per month | TC-ATM-03, TC-ATM-04, TC-ATM-20, TC-ATM-11, TC-BKL-02, TC-BKL-21, TC-BKL-23 |
| 4 | Dashboard (period, filters, six tabs, Insights), baselines, Git storage | TC-OV-11, TC-OV-13, TC-OV-15, TC-NAV-20, TC-NAV-21, TC-GIT-02 |
| 5 | Force Update, backup and restore, snapshots to Git, Documentation and the Validation Package (traceability matrix, known issues, components, security assessment, DFMEA, development process) | TC-UPD-02, TC-STO-04, TC-SNP-02, TC-DOC-01, TC-DOC-03 |
| 6 | Sharing through Git (shared connection setup, Load from Git, read-only token), Release Details and Windchill exports, a custom stream added by the Tool Owner with its Release page, Overview by region and role, Backlog Health | TC-CON-16, TC-CON-17, TC-CON-18, TC-CON-19, TC-CON-21, TC-CON-22, TC-SCR-01, TC-CON-61, TC-STR-06 |
| 7 | Roles and access: set up roles, assign a Scrum Master by email, check what each role sees (two people on two browsers); read-only until the roles file is loaded (a new browser, a repository without access.json); Load everything from Git | TC-ACC-01, TC-CON-24, TC-CON-63 |
| 8 | Menu (Data Insights, collapsing), Backlog Health columns and filters, assigning new work to others, Feature setup per Epic (personal and shared), State checks and Feature states; New Feature: the built-in "Review of Deliverables - <Feature>" User Story, ticked by default, in the current Sprint; the New Feature form in the Azure DevOps layout (no PAT field with a saved token, children folded); a DoD and User Stories per Release Classification value; User Story templates (save, tag, pick, change once) | TC-NAV-17, TC-SCR-02, TC-SCR-03, TC-ACC-02, TC-CON-23, TC-CON-25, TC-CON-26, TC-CON-27, TC-ATM-08, TC-BKL-06, TC-BKL-07, TC-DPF-06, TC-STT-01 |
| 9 | Holidays and common activities (map PI Planning and regional holidays in Settings → Capacity); who counts in capacity and removing a person in Settings → Resources; the Team overview Old Calculation tab, its Standard Hours and shared-time groups; the utilization formula (utilized ÷ contractual − absence) on Pulse Check and Team overview; calculation profiles in Settings, Lock figures on Team overview → Utilization and the Profile picker on Team overview and Pulse Check (Admin); Bucket rules and Insight thresholds in Settings; People & access (add a person with every mapping, Remove: left or not in the team, Capacity roles); phones and tablets; Other views in the menu; default streams and stream rules; DP releases (Pedestal and DHFI) | TC-CAP-02, TC-CAP-09, TC-CAP-10, TC-CAP-11, TC-CAP-12, TC-CAP-13, TC-CAP-14, TC-CAP-16, TC-CAP-17, TC-CAP-18, TC-CAP-20, TC-CAP-21, TC-CAP-22, TC-GIT-05, TC-NAV-31, TC-NAV-32, TC-NAV-22, TC-NAV-25 |
| 10 | First-time setup: the Get started pop-up in a new browser (entering the Git token and PAT in it, the work email detected from the token), the required work email on Time Writing, the Settings editors as pop-ups; editing shared Feature setups in their list; the mandatory Feature DoD (creating a Feature and in the Feature setup); deleting a Feature setup; the Time Writing story at the project root (not in a Sprint); filling missing DoDs with the default; Release Details → DP as its query table with chosen columns | TC-NAV-33, TC-NAV-38, TC-NAV-39, TC-NAV-40, TC-NAV-41, TC-CON-28, TC-NAV-34, TC-CON-30, TC-BKL-04, TC-CON-31, TC-CON-32, TC-BKL-05, TC-CON-35, TC-QV-08 |
| 11 | QE Mapping: upload the existing Excel, edit, filter, group, add and delete rows and columns, Save to Git, export; DP Completed and Supported Releases (DDT month) on the DP page, in Pulse Check and on the Dashboard; DP rows matched to their QMS-0025 Feature / User Story, Create Feature for an unmatched one in the default Create Feature form, and the same match and Create Feature for S&S IT releases (TC-QV-23); CP releases supported and completed from QA/QE signatures in the release-folder tree, with names, evidence and the QMS-0025 match (TC-QV-25); NPRA: only booked hours deducted, tracked against the 20 h maximum per person, over it flagged, maximum set in Settings → Capacity; unique releases from the S&S IT Windchill export (Location column, document names as fallback), unique locations saved to the Git data repository; the export's releases for the header month, sorted and with dragged column widths; Pulse Check's Supported summary next to Releases (DP, Tool Validations as unique tools, S&S IT); Monthly pack: Pulse Check → Monthly pack for the month before the header month, the generated lines, typing and saving the month's text, Settings → Monthly pack, Download .pptx; the Team overview's six tiles open their tabs (Capacity and workload, Streams, Plan quality) and Delivery opens Pulse Check (TC-MYD-05); On-Demand → CoNQ: a Dropdown and a Multi-select column with their options, a row, Save to Git and the page on a second computer (TC-OND-01); CoNQ Insights: a bar chart of the cost by category and a summary table, Save to Git and both on a second computer (TC-OND-09); CoNQ row details: a Long text and a Currency column with descriptions, the row's ID CONQ-0001 on Save to Git, who added it and when, and an edit in its History (TC-OND-16); Page builder: as a Tool Owner a new group Quality with the Table page Supplier issues and a group co-owner, the co-owner adding a page there but not changing the group, and a person without ownership seeing it read only with the reasons (TC-PGB-01); On-Demand Dashboard pages: an On-Demand Dashboard with a KPI tile, a bar chart and a summary table over a table page, filtered by Year / Quarter / Month, remembered after a reload, read only for a colleague without the right (TC-DSH-01); Chart options: a Pareto and a stacked bar with Top 5 + Other, a target line and a pinned colour, a click on a bar listing the rows behind it, half and full width (TC-CHT-01); CoNQ row drawer: a click on a row opens it from the right with its values and History, Edit and Save to Git save the row to Git at once with a History entry, a new row gets its ID in its save, Escape closes it and the focus is back on the row, a colleague without the right sees Edit disabled with the reason (TC-OND-21); newer data in Git per page with two people: while one adds a CoNQ row, the other on Home sees nothing, on CoNQ sees the notice with who and when and loads the new row with Load the newer data, and never sees a notice after their own saves (TC-GIT-11) | TC-QEM-04, TC-QV-10, TC-QV-14, TC-QV-16, TC-CAP-03, TC-CON-39, TC-CON-40, TC-CON-41, TC-QV-18, TC-QV-19, TC-PCK-04, TC-MYD-05, TC-QV-23, TC-QV-25, TC-OND-01, TC-OND-09, TC-OND-16, TC-PGB-01, TC-DSH-01, TC-CHT-01, TC-OND-21, TC-GIT-11 |

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
