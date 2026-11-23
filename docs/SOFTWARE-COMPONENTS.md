# I&D Quality Demand Planning — Software Components

| | |
|---|---|
| Document | SC-DPH-001 |
| Part of | [VALIDATION-PACKAGE.md](VALIDATION-PACKAGE.md) |
| Status | As-built inventory of the build that shows it; updated in the same pull request as the code |

This document lists every software component of the system: the in-house source files (§1, the software items of IEC 62304 §5.3 and §5.4), the third-party software (§2, SOUP in the sense of IEC 62304 §5.3.3 and §8.1.2) and the runtime platforms (§3). §4 records the known vulnerabilities of the third-party components and how they are handled. The requirement areas are the ID prefixes of [REQUIREMENTS-SPECIFICATION.md](REQUIREMENTS-SPECIFICATION.md) (OVR rows carry IDs `OV-NN`); [TRACEABILITY-MATRIX.md](TRACEABILITY-MATRIX.md) §7 resolves them to system requirements. Image assets in `src/assets/` (hero.png, react.svg, vite.svg) are not code and are not listed; `tests/*.html` preview pages are not test files.

## 1. In-house components


### 1.1 Application shell and pages

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| main | `src/main.tsx` | Entry point: applies the remembered theme before first paint, then renders App inside StrictMode and the ErrorBoundary. | UI |
| App | `src/App.tsx` | App shell: sidebar (foldable to icons), header, month picker and page routing; loads shared setup from Git at start, removes duplicate connections, fetches cloud connections, saves on-prem fetches to Git. | NAV, CON, FET, GIT, OND, PGB, DSH |
| index | `src/index.css` | Global styles and colour tokens for light and dark themes. | UI |
| App | `src/App.css` | Layout styles for the shell, sidebar, top bar, panels, tables, forms, modals and responsive breakpoints. | UI |
| fresh | `src/fresh.css` | Final "fresh look" style layer (white sidebar, soft canvas, borderless cards) built on the index.css tokens. | UI |
| theme | `src/theme.ts` | Theme preference (system/light/dark): parse, cycle, resolve against prefers-color-scheme, apply and store per browser; `?theme=` support. | UI |
| headerSlot | `src/headerSlot.ts` | React context for a header slot that pages can fill (e.g. the Team / Individual switch). | NAV |
| monthTaskAction | `src/monthTaskAction.ts` | ＋ Time Writing Task on a Feature or Story row: this month's Task under its Feature by the Bulk actions rules (BKL-22); a month already there (BKL-35); Time Writing titles brought in line after a save (BKL-36); Add n months as a background job (BKL-37). | BKL, ATM |
| workEmail | `src/workEmail.ts` | Your work email as its own setting on the computer: read, save, and the one-time take-over from the Time Writing connection (CON-82). | CON, ATM |
| settingsTabs | `src/settingsTabs.ts` | The Settings pages (menu order, shared ones), the remembered page and the remembered section of each page (SET-14). | SET, CON, NAV |
| index | `src/docs/index.ts` | Bundles docs/*.md at build time into the list of project documents shown on the Documentation page. | DOC |
| registry | `src/pages/registry.ts` | Single source of page ids, labels, icons, sidebar groups, header text and month-picker use. | NAV, OND |
| types | `src/pages/types.ts` | `PageProps` shared by pages: the app store, the selected month and its setter. | — |
| AdminPage | `src/pages/AdminPage.tsx` | Settings pages (one per menu entry, SET-14), with sections for Azure DevOps connections, Git storage, Access, Feature setup, capacity/absence, periods, resources, master data and audit. | SET, CON, GIT, SNP, CAP |
| BacklogHealthPage | `src/pages/BacklogHealthPage.tsx` | Backlog Health: open work in ended Sprints, Features without DoD and unassigned work, with person filter, chosen columns, sorting and CSV. | CON |
| BaselinesPage | `src/pages/BaselinesPage.tsx` | Baselines: estimation rules editor, release baselines vs booked hours, and the monthly Time Writing task plan check. | BAS, GIT |
| BoardPage | `src/pages/BoardPage.tsx` | Backlogs / Release Details: editable Time Writing tree, read-only query views and every Azure stream's Release page (UI-STANDARDS §10, QV-62: source bar, counts, Releases | Source data tabs), the CP release report and the DP table with DDT month filter, board match and bulk selection. | CON, FET, QV, ATM, STR |
| SprintCheckPage | `src/pages/SprintCheckPage.tsx` | Sprint check (formerly Bulk actions): move my User Stories from past Sprints to the current PI + Sprint, and the state checks of my Features and User Stories as a backlog tree (expand, set my New User Story Active). | ATM, CON |
| DashboardPage | `src/pages/DashboardPage.tsx` | Dashboard: demand vs capacity for a period and filters — utilization, overload, rebalancing, trends, Epic mix, insights and releases. | OVR, CAP |
| DocsPage | `src/pages/DocsPage.tsx` | Documentation page: reads the bundled project documents in-app, remembers the chosen one, keeps document and anchor links in the page. | DOC |
| MyActivitiesPage | `src/pages/MyActivitiesPage.tsx` | Time Writing (My Work): the person's month — this month's activities with planned and actual hours, Features still to add, a new activity under a stream and Feature (a new Feature through FeatureEditor), progress and the deadline. | ACT, ATM, MON |
| PlanningOverviewPage | `src/pages/PlanningOverviewPage.tsx` | Planning Overview (Testing, Admin only): filters, four tiles, workload and capacity chart, exception queue, delivery health per Epic. | OVW |
| CapacityActualPage | `src/pages/CapacityActualPage.tsx` | Capacity vs Actual (Testing, Admin only): filters, four tiles, 12-month chart, by person, hours by Epic. | CVA |
| MyWorkPage | `src/pages/MyWorkPage.tsx` | My Tasks [Board]: my pending Azure DevOps items, resolve/close them, and create a Feature under an Epic with its stories and task. | ATM, CON |
| BritePage | `src/pages/BritePage.tsx` | BRITE placeholder at the root of Release Details, until its exports and rules are known (CON-84). | CON |
| PiReviewPage | `src/pages/PiReviewPage.tsx` | PI Review placeholder page (planned PI summary). | NAV |
| PulseCheckPage | `src/pages/PulseCheckPage.tsx` | Pulse Check: last month's and this month's releases per stream, Supported Releases, Windchill exports, analysis and ongoing activities. | OVR, NAV, QV |
| HomePage | `src/pages/HomePage.tsx` | Home, the start page: a tile per area with links to its pages and a search (NAV-42…44). | NAV |
| MyDashboardPage | `src/pages/MyDashboardPage.tsx` | My dashboard: the person's hours against capacity, open work, streams and releases for the header month; the start page. | MYD |
| SignedByMe | `src/components/SignedByMe.tsx` | My dashboard → Signed by me: the period (from–to months, quick picks), releases and documents per stream and in total, and the documents behind them (MYD-13). | MYD |
| mySignatures | `src/mySignatures.ts` | The documents a person signed as Author, Reviewer or Approver in the Azure DevOps views and Windchill exports, their dates and the counts per period (MYD-13). | MYD |
| PersonalLayout | `src/components/PersonalLayout.tsx` | Customize a page's sections (show, hide, order, reset, default for everyone) and the menu (pin, hide). | MYD |
| QeMappingPage | `src/pages/QeMappingPage.tsx` | QE Mapping: upload Excel/CSV, edit cells/rows/columns, filter and group, then save to Git or export. | QEM |
| OnDemandPage | `src/pages/OnDemandPage.tsx` | On-Demand page (CoNQ and the pages added): the work table; a row opened in the row drawer (its ID, key, who added it, the values with the column descriptions and the History; Edit in place with the Long text and Currency fields; ‹ ›; asks before unsaved edits are dropped); every change saved to Git at once as a Background job (a row, Remove row after a pop-up, the Columns pop-up with types, options, default currency and descriptions, Rename page, the Insights changes) with the save state and Retry; add / remove a page. | OND, CON, PGB, DSH |
| OnDemandInsights | `src/pages/OnDemandInsights.tsx` | The Insights tab of an On-Demand page: the list of charts and tables, ＋ Add chart / table and Edit pop-up with a live preview, reorder and remove, read only without the setup right; the filter row above the charts (period, the owners' filters, Reset filters, the viewer's choice remembered) and the owners' Filters… pop-up. | OND, CON, CHT |
| PagesMenuPage | `src/pages/PagesMenuPage.tsx` | Admin → Pages & menu (page builder): your rights here, the menu groups and the added pages as lists in the shared table with their row actions (add a page to a group, edit, reorder, remove), the group and page pop-ups and the remove confirmations; every button the viewer may not use disabled with the reason. | PGB, CON, DSH |
| CustomDashboardPage | `src/pages/CustomDashboardPage.tsx` | An On-Demand Dashboard page (page builder): the filter row (Year / Quarter / Month, the owners' filters, Reset filters), the KPI tiles, the tabs and the chart and table panels over table pages; the viewer's tab, period and filters remembered per person; Arrange blocks, Tabs and filters, rename and remove the page; the builder buttons disabled with the reason. | DSH, PGB, CON, CHT |
| KpiTrackerPage | `src/pages/KpiTrackerPage.tsx` | KPI tracker page: the Git copy or a live read in the desktop app, sheet choice, table, save to Git for admins. | KPT |
| DpBulkCreate | `src/components/DpBulkCreate.tsx` | DP Create Features dialog: the plan per selected release, PI / Sprint, creation as a background job. | DPF |
| FormulaBar | `src/components/FormulaBar.tsx` | The fx bar of a calculation profile: typed formula, insert buttons, check as typed. | CAP |
| ContentBulkCreate | `src/components/ContentBulkCreate.tsx` | Content Create Features pop-up: one person for all, the plan, PI / Sprint, creation as a background job. | CNB |
| NamingPatternsPanel | `src/components/NamingPatternsPanel.tsx` | Settings → Stream mapping → Release naming patterns: edit, try a Title, apply, reset. | QV |
| FeatureEpicsPanel | `src/components/FeatureEpicsPanel.tsx` | Settings → Stream mapping → Epics to match Features in: per stream, the QMS-0025 Epics its releases are matched in (QV-57). | QV, SET |
| ReleaseCounts | `src/components/ReleaseCounts.tsx` | Completed / Supported release counts of CP, DP and IOCC with entered placeholders, and the Admin entry of those counts (QV-58). | QV, SET |
| BulkEpicsPanel | `src/components/BulkEpicsPanel.tsx` | Settings → Stream mapping → Bulk creation Epics: shared and personal Epic per stream (QV-59). | QV, SET |
| IoccBulkCreate | `src/components/IoccBulkCreate.tsx` | Create Features for the selected IOCC releases by the DP rules (QV-59). | QV |
| ZoomControl | `src/components/ZoomControl.tsx` | The desktop app's zoom control: − / % / +, Auto, Ctrl keys. | UI |
| LookAndFeel | `src/components/LookAndFeel.tsx` | Look & feel tabs: Page layout (margins and border), Theme and zoom, Start view and menu. | SET, NAV |
| SnapshotsPage | `src/pages/SnapshotsPage.tsx` | Snapshots: LTE / PI Review snapshots saved to Git and their history, browser storage and backup recovery, legacy snapshot records. | SNP, STO |

### 1.2 UI components

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| AccessPanel | `src/components/AccessPanel.tsx` | Settings → Access: shows roles and per-role rights; editable and saved to Git (access.json) only by a role that may manage access. | CON |
| PageDialogs | `src/components/PageDialogs.tsx` | The page builder's pop-ups: ＋ Add page (type, name, description, icon, menu group or a new group, page co-owners), Edit the page (name, type, icon, group, co-owners) and Add / Edit a group (name, accepts added pages, co-owners); the page name field with its clash (PGB-16) and the co-owners picked from a list (PGB-18). | PGB, DSH |
| PageGitNotice | `src/components/PageGitNotice.tsx` | The page's "Newer data in Git" notice: what changed, who saved it and when, Load the newer data, the pop-up asking first when edits would be dropped (GIT-18, GIT-20). | GIT |
| DashboardBlocks | `src/components/DashboardBlocks.tsx` | An On-Demand Dashboard's blocks: the KPI tile, a chart or summary table in its panel (the On-Demand insight charts reused unchanged, data labels on to start; the summary table in the shared table, largest first, first 10 rows, Show all, Export) and the block pop-up with its live preview. With the chart options (Display fieldset, colours, width). | DSH, OND, CHT |
| AssigneeConfirm | `src/components/AssigneeConfirm.tsx` | Confirmation before creating work items: what is created and to whom it is assigned; never blank. | CON, ATM |
| AzureConnections | `src/components/AzureConnections.tsx` | Settings → Azure DevOps connection setup: servers, presets, add/clone/edit connections, PATs, stream mapping of the built-in and custom streams (admins: saved to Git on every change, Save stream mapping to Git) and duplicate clean-up. | CON, STR |
| CustomStreamsPanel | `src/components/CustomStreamsPanel.tsx` | Settings → Streams → Custom streams: ＋ Add stream… (name, source, release rule, fuzzy matching, earlier names, Epics), Edit / rename and Remove (asks first) saved to custom-streams.json in Git; disabled with the reason without “Change the stream mapping”. | STR |
| RemovedConnections | `src/components/RemovedConnections.tsx` | Settings → Streams → Removed connections: connections dropped from the shared setup in Git, found in its history and restored (CON-99). | CON |
| AzureViewsGit | `src/components/AzureViewsGit.tsx` | Settings panel to save Azure DevOps connection definitions to Git and restore them elsewhere, never writing PATs; Back up and clean up (download / dated Git backup, remove all with a reset marker). | CON, GIT |
| AzureWorkItemTree | `src/components/AzureWorkItemTree.tsx` | Expandable Epic → Feature → Story → Task tree with Feature creation and child completion; read-only for other connections. | CON, ATM |
| BacklogTable | `src/components/BacklogTable.tsx` | Paged backlog table of the work-item tree with level filter and per-browser column chooser. | CON |
| BaselineRulesEditor | `src/components/BaselineRulesEditor.tsx` | Editor for per-stream estimation rules (hours per unit × units formula, optional max), draft then save. | BAS |
| BrandMark | `src/components/BrandMark.tsx` | SVG app mark: planning calendar with a quality shield and check. | UI |
| BuildStatus | `src/components/BuildStatus.tsx` | Build status display and, in the desktop app, check/download/verify/start the published desktop installer. | UPD, DSK |
| Clock | `src/components/Clock.tsx` | Header clock in the viewer's time zone and the theme toggle button. | NAV, UI |
| DataStatus | `src/components/DataStatus.tsx` | Header data-status chip with ⟳ Time Writing and Refresh (FET-22), and the data notices shown once under the header. | FET, NAV |
| DesktopDownload | `src/components/DesktopDownload.tsx` | Sidebar entry and dialog to download the desktop app; hidden inside the desktop app. | DSK |
| CpReportView | `src/components/CpReportView.tsx` | Release Details → CP: the Releases table of the month's releases (the counts are the page's, QV-62) with names, evidence, QMS-0025 match and Create Feature, shared activity, data issues and the evidence CSV. | QV |
| DpBoardColumn | `src/components/DpBoardColumn.tsx` | DP table and Windchill releases cell showing the matching QMS-0025 Feature/User Story, or Create Feature when nothing matches. | QV |
| DpMonthCounts | `src/components/DpMonthCounts.tsx` | Table of a month's DP Supported Releases with milestones passed (DT, SFV, PRD, RPE) and dates (DP page, folded under its counts; Pulse Check). | QV, OVR |
| ErrorBoundary | `src/components/ErrorBoundary.tsx` | Catches render errors in a view and shows what failed with a way back instead of a blank app. | UI |
| FeatureEditor | `src/components/FeatureEditor.tsx` | The one New Feature form (BKL-26): add a Feature under an Epic or complete a Feature's children (its Epic's stories none ticked, BKL-38), used by Backlogs, My Tasks [Board], Release Details and Time Writing; the Parent Epic starts blank. | ATM, CON, BKL, ACT |
| MonthTasksDialog | `src/components/MonthTasksDialog.tsx` | ＋ Time Writing Task: the months (header month first, ＋ Add month) and the hours of each (BKL-34); Assigned to and the warning on a month that already has a Task (BKL-35). | BKL |
| JobsIndicator | `src/components/JobsIndicator.tsx` | Top-bar list of the background jobs: running count, results, Clear finished; asks before leaving the page while one runs. | NAV |
| ProfileMenu | `src/components/ProfileMenu.tsx` | The profile button at the top right and its menu: My settings, Classic / Tile view, View as…, Search settings, Customize menu (NAV-48). | NAV |
| CloseItemsDialog | `src/components/CloseItemsDialog.tsx` | The Close pop-up: tick boxes, #ID links, owners, the hours confirmation (BKL-39). | BKL, ACT |
| MonthlyPackPanel | `src/components/MonthlyPackPanel.tsx` | Pulse Check → Monthly pack: the two slides as boxes with generated lines and the month's text, Save to Git, copy, Download .pptx. | PCK |
| HistoryPanel | `src/components/HistoryPanel.tsx` | Settings → Historical hours: upload the planning workbook, check names and stream Epics, save to or remove from Git. | HIS |
| ViewAsDialog | `src/components/ViewAsDialog.tsx` | View as: choose a person or a role to view the app as, read only. | CON |
| MonthlyPackSetupPanel | `src/components/MonthlyPackSetupPanel.tsx` | Settings → Monthly pack: slide lines (streams, Epics) and KPI rows (Epic, metric), saved to Git. | PCK |
| GapsPanel | `src/components/GapsPanel.tsx` | Lists items the page did not pick up for the month and why. | MON, TWN |
| GitStorage | `src/components/GitStorage.tsx` | Settings panel for the Git data file location and token, plus a Git sync bar. | GIT |
| Markdown | `src/components/Markdown.tsx` | Renders parsed Markdown blocks as React elements; internal links via callback, external https in new tab. | DOC |
| MonthOverview | `src/components/MonthOverview.tsx` | "This month" overview sections: capacity model and metrics for a month. | OVR, CAP |
| CalculationProfilesPanel | `src/components/CalculationProfilesPanel.tsx` | Settings → Capacity & periods → Calculation profiles: list with formulas, copy, edit, delete and make default (CAP-41, CAP-42). | CAP, SET |
| BucketRulesPanel | `src/components/BucketRulesPanel.tsx` | Settings → Capacity & periods → Bucket rules: the words and tags, edit with a check against the month, built-in words (CAP-46). | CAP, SET |
| InsightThresholdsPanel | `src/components/InsightThresholdsPanel.tsx` | Settings → Capacity & periods → Insight thresholds: edit with ranges and built-in values (CAP-47). | CAP, SET |
| CapacityRolesPanel | `src/components/CapacityRolesPanel.tsx` | Settings → People & access → Capacity roles: team roles and app access roles counted for capacity (CAP-50). | CAP, SET |
| MultiSelect | `src/components/MultiSelect.tsx` | Multi-value checkbox filter button ("All", one value or "n selected"); optional type-to-filter and options disabled with the reason (the co-owner list, PGB-18). | OVR, UI, PGB |
| PersonPicker | `src/components/PersonPicker.tsx` | Typeable person list with "me" first and keyboard selection. | ATM, UI |
| SearchSelect | `src/components/SearchSelect.tsx` | Drop-down list you can type into to search it (label and hint), with keyboard selection; the Feature list of Time Writing. | ACT, UI |
| QueryView | `src/components/QueryView.tsx` | Read-only query results view: summary strip, query columns, sorting, filters, search and CSV export. | QV |
| WorkItemEditor | `src/components/WorkItemEditor.tsx` | Edit form for a Feature, User Story or Task (Backlogs, My Tasks [Board]): fresh read, changed fields only, locks, Discussion; saves as a background job. | BKL, ATM |
| StoryEditor | `src/components/StoryEditor.tsx` | New User Story form under a Feature (Backlogs, My Tasks [Board]), laid out like New Feature with the Azure DevOps story fields and an optional comment; adds the story with addUserStory (BKL-27), as a background job. | BKL, ATM |
| ReleaseFeatureEditor | `src/components/ReleaseFeatureEditor.tsx` | Create Feature button from Release Details, pre-filling the default Feature form from the release. | QV |
| ReleaseQuadrants | `src/components/ReleaseQuadrants.tsx` | Releases summary lines, the Supported summary next to them (DP Supported Releases, S&S IT export releases of the month), and a 2×2 quadrant per stream with documents approved in the month and totals. | OVR, QV |
| ReleasePage | `src/components/ReleasePage.tsx` | The shared parts of every stream's Release page (UI-STANDARDS §10): the source bar with Show: {month} / All months, ↻ and ⋯, and the counts Releases in the month, Completed, Supported (each optional, QV-64) with ⓘ What was counted (QV-62). | QV |
| matchedFeatureColumns | `src/components/matchedFeatureColumns.tsx` | The Time Writing Feature, Planned (h) and Booked (h) columns of a release matched on QMS-0025 (DP, CP, S&S IT, ECP; QV-65): the matched Feature with its match % and the hours of its Time Writing Tasks. | QV |
| ReleaseView | `src/components/ReleaseView.tsx` | Release source view: releases derived from document paths or Titles (per stream rule), with the Time Writing Feature match and hours and the QMS-0025 match column with Create Feature (QV-46). | QV, STR |
| ResultTabs | `src/components/ResultTabs.tsx` | The two tabs of a Release page, Releases | Source data (n): the Releases table and the raw query or imported rows, the choice kept per page in the browser tab (QV-47). | QV |
| ViewActions | `src/components/ViewActions.tsx` | The compact actions of a Release page's source bar: the main action as a small ↻ icon button with its name as tooltip, the others in a ⋯ menu (QV-48). | QV |
| DataTable | `src/components/DataTable.tsx` | The one table component (UI-07…13): an ⓘ hint next to a heading (OND-25), an export value apart from the sort value (OND-23), resize, move by dragging a heading or ↑ ↓ in the Columns list, choose columns, Wrap text, Compact / Comfortable, Reset layout, sort, expandable, grouped and tree rows, a totals row that follows the columns, rows that open on a click or Enter / Space (OND-27), and one Export offering Excel or CSV. | UI, QV, CON, OND |
| tableDesign | `src/components/tableDesign.ts` | The React context that hands the shared table design default to every DataTable (UI-12). | UI |
| TableDefaultsPanel | `src/components/TableDefaultsPanel.tsx` | Settings → Table defaults: the shared, audited design default of every table (UI-12) and of chart data labels (UI-17). | UI, SET |
| chartLabels (component) | `src/components/chartLabels.tsx` | The Data labels box and the X / Y axis names of a chart (UI-17). | UI |
| chartLabels | `src/chartLabels.ts` | Chart data labels: each chart's own choice kept per computer, else the shared default (UI-17). | UI |
| useStreamEpics | `src/useStreamEpics.ts` | The shared release-source settings in a React context and the hook giving a stream's Epics for the board match (QV-57). | QV, STR |
| useCan | `src/useCan.ts` | The viewer's permissions in a React context, for the controls deep in the page tree (bulk create, QE Mapping, Monthly pack text, shared Feature setup, export) (CON-94); nothing allowed without a provider (CON-101). | CON |
| myViews | `src/myViews.ts` | My views: the servers with a PAT, a new view checked (no stream names, no duplicates), and the app data without My views' data for backups (SET-17). | SET |
| epicSetup | `src/epicSetup.ts` | The Epic setup file (fields, value lists, title pattern), the Title and Description of a new Feature from its fields, Block / Warn, bulk creation and Copy to Epics (EPS-01…05). | EPS |
| useEpicSetup | `src/useEpicSetup.ts` | The shared Epic setup from Git (epic-setup.json), its cached copy and draft, and the context for New Feature and bulk creation (EPS-01). | EPS |
| EpicSetupPanel | `src/components/EpicSetupPanel.tsx` | Admin → Epic setup: Feature fields per Epic, title pattern and preview, Copy to Epics, and the value lists (EPS-01, EPS-05). | EPS |
| myNamingPatterns | `src/myNamingPatterns.ts` | My own release naming patterns for IOCC, Content and Tool Validations, kept on this computer, and the version that redraws the figures (QV-60). | QV |
| adminOverview | `src/adminOverview.ts` | The Admin Overview's health items, the Feature setup gaps (ADM-05) and the settings search index (ADM-01, ADM-03). | ADM |
| usageCounts | `src/usageCounts.ts` | My page usage: opt-in page-opening counts in this browser's local storage, read safely, deleted when turned off (NAV-45). | NAV |
| onPremValues | `src/onPremValues.ts` | The values of an on-prem field in the fetched data, for the drop-down of an Epic setup field (EPS-06). | EPS |
| QePick | `src/components/QePick.tsx` | The person drop-down of a release in the bulk Create Features pop-ups (DPF-06). | DPF |
| EpicFeatureEditor | `src/components/EpicFeatureEditor.tsx` | Admin → Epic & Feature setup → Setup per Epic: the Epic list, the preview and the four sections with Customize switches, the Complete children setting (BKL-38), my own version, one Save (CON-97). | CON, EPS, BKL |
| StoryTemplatesPanel | `src/components/StoryTemplatesPanel.tsx` | Admin → Epic & Feature setup → User Story templates: the shared library with Epic and Release Classification tags (STT-01). | STT |
| AdminOverview | `src/components/AdminOverview.tsx` | Admin → Overview: setup health with links, unsaved shared changes with Save to Git, latest changes (ADM-01, ADM-02). | ADM |
| UsagePanel | `src/components/UsagePanel.tsx` | My settings → My page usage: the opt-in tick, the counts most used first, Start again from zero (NAV-45). | NAV |
| SettingsSearch | `src/components/SettingsSearch.tsx` | The Search settings pop-up (Ctrl K) (ADM-03). | ADM |
| MyViewsPanel | `src/components/MyViewsPanel.tsx` | My settings → My views: list, add, fetch and remove your own read-only views (SET-17). | SET |
| ScopeChip | `src/components/ScopeChip.tsx` | The chip saying whom a setting affects: only you, this computer, everyone, or the Tool Owner (SET-16). | SET |
| bulkEpics | `src/bulkEpics.ts` | The bulk creation Epic per stream: built in, shared, personal (QV-59). | QV |
| useDataLabels | `src/useDataLabels.ts` | The hook a chart uses for its Data labels switch (UI-17). | UI |
| ScopeSwitch | `src/components/ScopeSwitch.tsx` | Team / Individual toggle with person picker, in the header or page top. | MON, OVR |
| SectionTabs | `src/components/SectionTabs.tsx` | The section row of a Settings page: one section at a time, the last one remembered per page (SET-14). | SET, NAV |
| SetupGuide | `src/components/SetupGuide.tsx` | "Get started" pop-up listing setup steps with live status, fields to enter the Git token, PAT and work email right there (NAV-38), the email detected from the token (NAV-39) and buttons to the right place. | NAV |
| SharedTimePanel | `src/components/SharedTimePanel.tsx` | Settings → Capacity: map Epics/Features as regional holidays or common activities applied to people in scope. | CAP, SET |
| TeamFilterBar | `src/components/TeamFilterBar.tsx` | Region switch and role multi-select filter for team views. | OVR |
| WindchillReleasesPanel | `src/components/WindchillReleasesPanel.tsx` | Lists a Windchill export's unique releases from Location or document names (source and columns chosen), filtered to the header month (Show in the page's source bar), columns in the UI-STANDARDS §10 order, sortable, with draggable widths and a QMS-0025 match column with Create Feature; the unique locations, CSV exports and Save locations to Git. | CON, QV |
| WindchillSettingsPanel | `src/components/WindchillSettingsPanel.tsx` | Windchill host and service path setup with connection test and sign-in (browser or desktop). | CON |
| WindchillViews | `src/components/WindchillViews.tsx` | Windchill views settings, the Windchill export page as a Release page (UI-STANDARDS §10, QV-62) and import of results saved or copied from the browser. | CON |
| WorkloadCharts | `src/components/WorkloadCharts.tsx` | SVG charts: utilization, Epic mix, Epic bullet, Pareto, utilization heatmap and donut; the shared chart frame (legend, Data labels, Table / Chart) and tooltip used by the On-Demand insights. | OVR, OND |
| InsightCharts | `src/components/InsightCharts.tsx` | On-Demand insights and Dashboard charts drawn: bar (horizontal or vertical columns, stacked), line over time, pie / donut, Pareto (columns, cumulative share on a 0–100% axis, 80% line), KPI tile and the summary (pivot) table, in the chart frame, with Top N, running total, percent, target line, colours pinned per value and the read-only drill-down pop-up of the rows behind a bar, slice or point. | OND, DSH, CHT |
| ChartOptionsFields | `src/components/ChartOptionsFields.tsx` | The Display fieldset of the chart pop-ups (Insights and Dashboard block): orientation, Group dates by, Show (Top N), Running total, Percent of total, target line, width and colour pins, only the options of the chosen type, disabled with the reason where the measure does not fit. | CHT, OND, DSH |
| columnWidths | `src/components/columnWidths.tsx` | `useColumnWidths` hook: draggable table column widths kept per table in this browser. | UI |
| ui | `src/components/ui.tsx` | Shared UI primitives: Page, Panel, TablePanel, Metrics, Pill, Notice, EmptyState, Modal, Drawer (one record from the right, OND-27), Info, SettingsSummary. | UI, OND |

### 1.3 Domain logic and calculations

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| access | `src/access.ts` | Role-based access policy (access.json): roles, areas, actions, parsing/serialising and rights per person email. | CON |
| menuLayout | `src/menuLayout.ts` | Page builder model: page types (Table, Table + Insights, Dashboard), the built-in and custom menu groups, the menu layout file menu-layout.json (parse, validate, serialise, merge by group and page with co-owners as sets), placing, moving, reordering and removing pages and groups, and the rights of the Tool Owner, group and page co-owners (fail closed, with the reasons). | PGB, CON, GIT, DSH |
| dashboardPages | `src/dashboardPages.ts` | On-Demand Dashboard model: block types, the data sources (table pages as saved in Git), the file dashboards/<page-id>.json (parse, validate with dropped-block messages, caps, serialise, merge by block, tab and filter), the period and filter-row narrowing, KPI values and summary rows on the On-Demand aggregation. Pareto blocks; block options and colour pins validated and merged. | DSH, GIT, CHT |
| azureHierarchy | `src/azureHierarchy.ts` | Builds the filtered Epic→Task work-item tree with ancestor context, missing-parent and cycle handling. | CON |
| azureInsights | `src/azureInsights.ts` | Time Writing month-task detection, month story plans, working days, Azure insights and Time Writing gaps. | MON, TWN, CAP |
| backlogHealth | `src/backlogHealth.ts` | Backlog Health lists (older-Sprint work, Features without DoD, unassigned), columns and CSV. | CON |
| backlogView | `src/backlogView.ts` | Backlog table columns, normalisation, plain-text rendering and visible row flattening. | CON |
| backlogViews | `src/backlogViews.ts` | Azure DevOps menu entries: the editable Time Writing backlog and read-only views, remembered tab. | NAV, CON, STR |
| baseline | `src/baseline.ts` | Per-stream estimation rules, dated release scopes and release baseline vs actual rows. | BAS |
| capacity | `src/capacity.ts` | Capacity model: month tasks, absence, shared time, regions/roles, per-person and per-stream load and status. | CAP, SET |
| calculationProfiles | `src/calculationProfiles.ts` | Calculation profiles (CAP-41, CAP-42): bucket treatment, plan source, capacity base, built-in Current (v4) and Old Calculation, the default profile, the formula in words; locked figures (CAP-43) and their normaliser. | CAP |
| bucketRules | `src/bucketRules.ts` | Bucket rules (CAP-46): the words and tags for absence kinds, training and other NPRA, built-in defaults, normaliser and matching. | CAP |
| businessTime | `src/businessTime.ts` | Business time is UTC (NAV-51): today, the month of a date, the month Task month label and the end of a lock day, all in UTC; plain dates never shift. | NAV, MON, ATM, BKL, QV |
| insightThresholds | `src/insightThresholds.ts` | Insight thresholds (CAP-47): fields, ranges, built-in values and normaliser. | CAP, OVR |
| chartUtils | `src/chartUtils.ts` | Chart helpers: month labels, ticks, bar/column/arc geometry, Epic colours, Pareto series, label wrapping. | OVR |
| csv | `src/csv.ts` | CSV cell escaping with spreadsheet-formula injection guard. | CON |
| dashboard | `src/dashboard.ts` | Person-month records (plan, actual, capacity) with filters, periods, totals, overload, concentration and rebalancing. | OVR, CAP |
| planningOverview | `src/planningOverview.ts` | The Planning Overview's figures: person-months filtered by region, Epic and owner, delivery by Target date, baseline and capacity exceptions, health per Epic. | OVW, CAP, BAS |
| capacityActual | `src/capacityActual.ts` | Capacity vs Actual figures: person-months filtered by region, owner and Epic, tiles, status bands, hours per Epic. | CVA, CAP |
| domain | `src/domain.ts` | Core TypeScript types: AppState, activities, efforts, baselines, periods, snapshots, Azure work items, release plans. | — |
| cpReporting | `src/cpReporting.ts` | CP release reporting: Release containers of the release-folder tree, QA/QE signatures from the approver slots, monthly Supported / Completed, shared containers, data issues and release names from CP_Releases. | QV |
| dpBoardMatch | `src/dpBoardMatch.ts` | Fuzzy match of DP rows and Windchill (S&S IT) releases to QMS-0025 Features/User Stories by name and version; DP and Windchill Feature title builders. | QV |
| dpMilestones | `src/dpMilestones.ts` | DP milestone fields, DDT month, Completed and unique Supported Releases counts per month. | QV, OVR |
| ioccMilestones | `src/ioccMilestones.ts` | IOCC document type from the Title (Release Plan, Release Notes, Verification Report), the release a document belongs to, and the unique Completed and Supported Releases signed in a month. | QV |
| nestedGroups | `src/nestedGroups.ts` | Nested grouping of a list by several levels, with a unique key per group path (IOCC releases). | QV |
| dpReleases | `src/dpReleases.ts` | DP releases from Pedestal Release items dated by matching DHFI documents (exact version). | QV |
| featureSetup | `src/featureSetup.ts` | Per-Epic Feature setup (stories, Time Writing story, task defaults), placeholders, shared/personal layers, parse/serialise; Complete children per Epic (BKL-38). | CON, BKL |
| homeTiles | `src/homeTiles.ts` | The Home tiles and links: types and the search over them (NAV-43, NAV-44); the tile / classic view choice (NAV-46). | NAV |
| fetchOrder | `src/fetchOrder.ts` | What Refresh fetches and in which order: the Time Writing connection first, then the read-only ones (FET-22). | FET |
| featureMonths | `src/featureMonths.ts` | The Time Writing months of a new Feature from its Start date and Target date (BKL-31, BKL-32). | BKL |
| format | `src/format.ts` | Display formatting: hours, percent, dates in viewer time zone (display only; business months in businessTime), month names, relative time. | UI |
| packInputs | `src/packInputs.ts` | The Monthly pack's inputs for a month (streams' releases and supported counts, utilisation), shared by the pack tab and the Insights workspace. | PCK, WSP |
| insights | `src/insights.ts` | Dashboard insights: month forecast, plan accuracy, stream momentum, resilience, anomalies and health score. | OVR |
| markdown | `src/markdown.ts` | Small Markdown parser to plain data (headings with GitHub anchors, lists, tables, inline) and link targets. | DOC |
| closeChain | `src/closeChain.ts` | After a close: the follow-up question and the staged closing of the related User Stories or Feature, each write read back; Close Features on Time Writing (only the person's own items, children first). | ATM, ACT |
| closeList | `src/closeList.ts` | The Close pop-up's rows: the open items under a Feature or the last User Story, default ticks, tick rules, children-first closing (BKL-39). | BKL, ACT |
| closedHistory | `src/closedHistory.ts` | The close date of a finished item without one: from its history (updates), read once per version and kept in this browser (FET-24). | FET |
| workStates | `src/workStates.ts` | The one list of finished states: Closed, Resolved, Completed, Done (FET-23). | FET |
| myWork | `src/myWork.ts` | "Me" matching, pending work, month-task and move candidates, state checks and next states, Feature children, the Time Writing order by Feature number (ACT-21). | ATM, ACT |
| pulseCheck | `src/pulseCheck.ts` | Pulse Check: previous month, release comparison, work flow opened/closed and ongoing work. | OVR |
| pulsePeriods | `src/pulsePeriods.ts` | Pulse Check over calendar quarters, half-years and years: periods, the period before, releases once per period, work opened and closed. | QV, MYD |
| personalViews | `src/personalViews.ts` | Personal views file: path per person, validated parse, defaults merge, section order. | MYD |
| usePersonalViews | `src/usePersonalViews.ts` | Personal views state: browser cache, Git per person with retry, admin defaults, filters per page. | MYD, GIT |
| history | `src/history.ts` | Historical hours: workbook sheet and rows, name matching, validated Git file, merge into the report items before the cut-off. | HIS |
| useHistory | `src/useHistory.ts` | Historical hours state: read from Git, save (conflict retried once) and remove. | HIS, GIT |
| viewAs | `src/viewAs.ts` | View as: who may use it, the rights of the viewed person or role, the people to choose from, the read-only write guard. | CON |
| qeMapping | `src/qeMapping.ts` | QE Mapping table model: sheets with stable column/row ids, edits, filter, group, CSV, Git file parse/serialise. | QEM |
| onDemand | `src/onDemand.ts` | On-Demand page model: columns (Text, Long text, Number, Currency, Date, Dropdown, Multi-select, each with an optional description) and rows with stable ids, keys, sequential IDs, who added them and their update log, value checks and type changes that keep values, the Git file parse / validate / serialise and the merge of two saves. | OND, CHT |
| rowFiles | `src/rowFiles.ts` | Row files of a table page: the paths (a row key as a file name only when it is a key), page.json, a row file, counter.json and the marker left for older apps, the page assembled from its files, the files of a conversion, a page change as files, the field-by-field merge of two saves of a row (OND-31…OND-34, OND-39). | OND |
| rowLocks | `src/rowLocks.ts` | Row locks: the lock file, take / take over / held, the inactivity timeout and its warning, the heartbeat, the shared timeout setting (row-locks.json), the drafts kept a day in this browser and restored over the row as it is now (OND-35…OND-37). | OND |
| onDemandInsights | `src/onDemandInsights.ts` | On-Demand insights: the columns each part may use, reference checks (broken insights), the aggregation of rows (count / sum / average, a Currency column one currency at a time, Multi-select per value, months, "(none)", "Other", totals) and the filters, and their wording. Chart options: date grouping (day, ISO week, month, quarter, year), Min / Max / Distinct count, Top N limits, running total, percent, Pareto shares, KPI and the rows behind a chart (drill-down). | OND, CHT |
| insightFilters | `src/insightFilters.ts` | The Insights tab's filter row (OND-50…56): the columns it can use, the owners' setup checked against the page's columns (removed or changed columns left out with a note), the viewer's choice (read back from personal views), the rows kept (period on a Date column as the Dashboard's, values, months, contains, number range, a Currency amount in one chosen currency — OND-57…60) and the line naming the choice; the currency it picks for the charts. | OND |
| kpiTracker | `src/kpiTracker.ts` | KPI tracker model: link check, workbook to text sheets within limits, Git file parse/serialise, sheet table. | KPT |
| dpBulk | `src/dpBulk.ts` | DP releases: release type from x.y.z.a, QE from the QE Mapping, possible QEs, bulk Create Features plan. | DPF |
| formula | `src/formula.ts` | Typed utilization formula: tokenizer and parser (figures, operators, MAX/MIN/ROUND/IF), check as typed, starting formula from the ticks. | CAP |
| contentBulk | `src/contentBulk.ts` | Content bulk Features: Epic, DoD, classification and estimate; plan per release; people on the board and the chosen email. | CNB |
| namingPatterns | `src/namingPatterns.ts` | Release naming patterns: compile a wildcard pattern safely, match a Title, built-in Content and IOCC patterns, read from the shared settings. | QV |
| desktopZoom | `src/desktopZoom.ts` | Desktop zoom: Auto fit, steps and limits, the setting kept per computer. | UI |
| pageLayout | `src/pageLayout.ts` | Page margins (top, right, bottom, left) and border: defaults, limits, kept per computer, applied as CSS variables (NAV-50). | NAV |
| queryView | `src/queryView.ts` | Query-view layout from WIQL SELECT/ORDER BY (flat and tree / links queries), field resolution, cell formatting, sorting, summary, CSV, column order. | QV |
| releaseOverview | `src/releaseOverview.ts` | Releases with documents approved in the month per stream (CP from QA/QE signatures, cpReporting), with counts and totals. | OVR, QV, STR |
| releasePath | `src/releasePath.ts` | Reads release name and number from Area/Iteration Paths; DP, IOCC and Tool Validations (one entry per tool) stream rules. | QV |
| rules | `src/rules.ts` | Period lock rules, demand classification, baseline lookup, variance flag and capacity utilization. | SET, BAS |
| setupGuide | `src/setupGuide.ts` | "Get started" setup steps with live status and required-step logic. | NAV |
| streams | `src/streams.ts` | Release stream definitions and data sets, the built-in and custom streams (allStreams), name matching (longest name wins) and connection/export lookup per stream. | QV, OVR, STR |
| customStreams | `src/customStreams.ts` | Custom streams file (custom-streams.json): the offered release rules, validation of each stream (unknown rule, CP, built-in names refused), add / rename / remove, parse and serialize. | STR |
| viewSources | `src/viewSources.ts` | Picks the saved fetch snapshot for a read-only connection, with legacy shared release snapshot rule. | QV, FET |
| windchillReleases | `src/windchillReleases.ts` | Unique releases of a Windchill export from the Location column (deepest folder with a version) or the document names (clubbed names included); unique locations; the windchill-locations analysis file. | CON |
| xlsx | `src/xlsx.ts` | Library-free .xlsx zip reader/writer and CSV reader with inflate size limit; the writer writes numbers and real dates (a serial with a date format, UI-11). | QEM, UI |
| tableDefaults | `src/tableDefaults.ts` | The table design default (UI-07…12): the shared setting and its check, the per-table layout kept in the browser, column order and sort helpers, and dates exported as real date-times (Excel serial, CSV yyyy-mm-dd hh:mm:ss). | UI |
| monthlyPack | `src/monthlyPack.ts` | Monthly pack: setup and month files, Epic counts, releases and supported counts per slide line, YoY, capacity lines, slide boxes and copy text. | PCK |
| pptx | `src/pptx.ts` | Library-free .pptx writer: 16:9 slides with a title and boxes of bullet lines, on the xlsx zip writer. | PCK |

### 1.4 Data, storage and sync

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| store | `src/store.ts` | `useAppStore`: app state with IndexedDB persistence and audit. | STO |
| browserState | `src/browserState.ts` | IndexedDB state repository: validation, legacy migration, backup validation and ordered serialized writes. | STO |
| gitStorage | `src/gitStorage.ts` | GitHub-repo planning data file: config/token, serialise/parse, read/write/delete with conflict detection, folder listing. | GIT |
| gitSaveQueue | `src/gitSaveQueue.ts` | Queued saves to the shared Git files that are merged, not refused: the save time stamp, per-file merge (history rows, default views pages, KPI tracker sheets, backup connections), read-merge-write with bounded retries, the newest-wins template write and the per-file queue. | GIT, HIS, MYD, KPT, CON, PCK |
| gitTrees | `src/gitTrees.ts` | GitHub's Git Data API for row-file pages: a folder's entries by its tree, many row files read in batches (GraphQL, REST when refused), a commit of many files on the branch's latest commit without force (conversion, many-row changes, deleting a page), a branch made from the data branch (the locks) (OND-31…OND-35). | OND, GIT |
| rowPageGit | `src/rowPageGit.ts` | Reading and writing a page of row files and its locks: the page read with only changed rows, the next ID from counter.json (version-checked, retried), a new row created never replacing one, the conversion and many-row changes as one commit, removing a page's folder; locks taken, refused, taken over, renewed and released (OND-31…OND-38). | OND, GIT |
| gitWatch | `src/gitWatch.ts` | Refresh while open: versions of the shared files read or saved, this window's own versions and saves on their way (KB-82), folders to list, the files newer in Git, their names, and the pages that use each file (GIT-18, GIT-19). | GIT, DSH |
| pageEdits | `src/pageEdits.ts` | What the page in use holds unsaved (a row being edited, a pop-up, a draft), so Load the newer data asks first (GIT-20). | GIT, OND |
| pageNames | `src/pageNames.ts` | Page names compared as read (case, spaces, NFKC), the clash with another page in the menu, the duplicates already in Git and their menu labels (PGB-15…PGB-17). | PGB |
| usePageNames | `src/usePageNames.ts` | The page names of the menu and the people for the co-owner list as React contexts, and the name clash of a typed name (PGB-15, PGB-16, PGB-18). | PGB |
| ownerPeople | `src/ownerPeople.ts` | The people co-owners are picked from and the options of the co-owner list: owners not in it kept and marked, no work email disabled, at most 50 (PGB-18). | PGB |
| gitSnapshots | `src/gitSnapshots.ts` | On-prem read-only view fetches saved to Git (azure-data/) without PATs; parse, digest, apply. | GIT, FET |
| cloudSnapshots | `src/cloudSnapshots.ts` | Frozen whitelisted snapshot files saved to the Git data repository (lte-snapshots/) as new files with read-back verification; listing history. | SNP |
| viewDefinitions | `src/viewDefinitions.ts` | Azure connection definitions file in Git: serialise/parse, restore with PAT rules, sync (the stream mapping enforced), pending admin changes, duplicates. | CON, GIT |
| download | `src/download.ts` | File downloads: effort CSV, state JSON backup, CSV, JSON, Markdown, XLSX and PPTX. | STO, CON, PCK |
| seed | `src/seed.ts` | Initial synthetic AppState (people, activities, efforts, baselines, periods). | SMP |
| sampleData | `src/sampleData.ts` | Deterministic synthetic Azure-shaped dataset, profiles and release scopes for sample mode. | SMP |

### 1.5 Integrations

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| azureDevOps | `src/azureDevOps.ts` | Azure DevOps writes: constrained Feature / Story / Task creation, the Time Writing and release hierarchies, updates, edits and comments; re-exports azureClient and azureRead, so it stays the one import for the rest of the app. | CON, FET, ATM, MON, IF |
| azureClient | `src/azureClient.ts` | Azure DevOps request client: connection settings and URL normalising, the transport (fetch or the desktop proxy), api-version negotiation, the write guards (roles, sample mode, dev.azure.com only) and the constrained request bodies. | CON, FET, SMP |
| azureRead | `src/azureRead.ts` | Azure DevOps reads: iterations, the WIQL backlog fetch, work-item mapping (with Successor / Predecessor IDs from Dependency links, CON-81), field names and team members. | CON, IF |
| pptxTemplate | `src/pptxTemplate.ts` | Fills the team's PowerPoint template (kept in Storage) with the Monthly pack: Performance Pulse and 2x2 boxes found by label and position, status colours, KPI rows, shrink to fit; checks an uploaded template. | PCK |
| workItemEdit | `src/workItemEdit.ts` | The fields an edit may change, their checks, the revision-tested JSON patch, rich text as editable text, the Feature DoD split and the edit locks. | BKL |
| planningLock | `src/planningLock.ts` | The planning / actuals lock rule of a month (deadline, extension, explicit lock) shared by the Monthly page and the Task creation paths, and whether a new month Task is ad-hoc. | MON |
| backgroundJobs | `src/backgroundJobs.ts` | Background jobs of a page load: runs long Azure DevOps writes off the form, one per key, with progress and the result, and records an instant result as a finished entry (QV-63); nothing stored. | NAV, BKL, ATM, MON, QV |
| azureCredentials | `src/azureCredentials.ts` | Browser-local PATs per server and connection profiles (role, view name, show in menu, shared from Git); never in app data. | CON |
| connectionPresets | `src/connectionPresets.ts` | Pre-filled team connection presets and dismissed-preset storage. | CON |
| releaseSource | `src/releaseSource.ts` | Read-only release source: paged flat WIQL queries and tree / direct-links (WorkItemLinks) queries, approval month, completed releases and the month's release count, fuzzy Feature name matching, Features' Time Writing hours. | QV |
| windchill | `src/windchill.ts` | Windchill host/service path settings, normalisation and browser storage. | CON |
| windchillBridge | `src/windchillBridge.ts` | Bookmarklet bridge to run Windchill searches in a signed-in Windchill tab and return verified results. | CON |
| windchillBrowser | `src/windchillBrowser.ts` | Windchill test and query from the browser with its own sign-in (CORS, read-only GETs). | CON |
| windchillExport | `src/windchillExport.ts` | Parses Windchill CSV/tab-separated exports into columns and rows. | CON |
| windchillSnapshots | `src/windchillSnapshots.ts` | Windchill view results saved to Git (windchill-data/) without credentials; parse, apply, digest. | CON, GIT |
| windchillViews | `src/windchillViews.ts` | Windchill view definitions, OData query/search URL building, page parsing and browser storage. | CON |
| appUpdate | `src/appUpdate.ts` | Web update: build-info validation, cache-busting URLs, latest-build check and reload guard. | UPD |
| desktopDownloads | `src/desktopDownloads.ts` | Fixed desktop installer download links and OS detection. | DSK |

### 1.6 React hooks

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| useAccess | `src/useAccess.ts` | Access policy from Git, cached in this browser, and the viewer's rights; read-only until a policy is loaded, Manage access alone when Git storage has no access.json (CON-101). | CON |
| useAzureWorkspace | `src/useAzureWorkspace.ts` | Azure connections state: fetch, save, preview, sample data, Git-backed on-prem data and fetch listeners. | CON, FET, SMP |
| useDpBoardColumn | `src/useDpBoardColumn.tsx` | DP table "QMS-0025 match" column with search/export text and Create Feature. | QV |
| useFeatureSetup | `src/useFeatureSetup.ts` | Shared and personal Feature setup from Git, cached locally, saved with a writable token. | CON |
| useGitStorage | `src/useGitStorage.ts` | Git storage state: load/save planning data, views file, access, Feature setup, QE Mapping and Windchill files, including the windchill-analysis locations file; the save queue of the merged shared files (GIT-17). | GIT, CON, QEM, OND, DSH |
| useMyWork | `src/useMyWork.ts` | Who "me" is: Time Writing connection email plus a remembered display name. | ATM |
| useNow | `src/useNow.ts` | Date that re-renders on an interval for clock and freshness labels. | NAV |
| usePersonScope | `src/usePersonScope.ts` | Team / Individual scope and team filter, remembered per page. | MON, OVR |
| useQeMapping | `src/useQeMapping.ts` | QE Mapping table from Git, cached locally, saved with a writable token. | QEM |
| useCustomStreams | `src/useCustomStreams.ts` | Custom streams from Git (custom-streams.json), the last good file cached locally and made the app's streams; saved with a writable token, a concurrent change refused. | STR |
| useOnDemand | `src/useOnDemand.ts` | The On-Demand pages from Git (on-demand/ folder — one file each, or a folder of row files, OND-31), the pages without their hidden rows for everyone else (OND-39), new pages read when the menu layout changes (GIT-21), the row lock timeout (OND-36), the conversion (OND-32), cached locally, CoNQ while none exists; each change saved at once as a queued merged save applied to the page as last read from Git, changes kept after a failed save (Retry, Discard), and removal. | OND |
| useRowLocks | `src/useRowLocks.ts` | The row locks of the page of row files in use: listed on open, when a row's drawer opens and on the open-app check; this window's lock taken, renewed and released (also when the page closes); an owner's release of a stuck lock; the row drafts in this browser (OND-35…OND-38). | OND |
| useMenuLayout | `src/useMenuLayout.ts` | The menu layout from Git (menu-layout.json), cached locally, saved with the queued, merged saves; creating a page (its file, then its place in the menu and a new group). | PGB, GIT |
| useDashboardPage | `src/useDashboardPage.ts` | An On-Demand Dashboard's definition from Git (dashboards/<page-id>.json), cached locally, refused or partly dropped with the reasons, saved with the queued, merged saves. | DSH, GIT |
| useMonthlyPack | `src/useMonthlyPack.ts` | Monthly pack setup (cached locally) and the month's text from Git, saved with a writable token. | PCK |
| useWindchill | `src/useWindchill.ts` | Windchill views: searches, fetching via desktop/browser/bridge, importing results; each fetch and import a Background jobs entry (QV-63). | CON, QV |
| useWindchillReading | `src/useWindchillReading.ts` | How a Windchill export's releases are read (Read from, name / Location column) and the releases read, held by the export's page so that its counts follow its Releases table (QV-64). | CON, QV |

### 1.7 Desktop shell (Electron)

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| main | `electron/main.cjs` | Electron main process: window, IPC handlers for Azure DevOps proxy, Windchill test/query/sign-in, the KPI tracker's SharePoint read/sign-in/sign-out, zoom (get, set, keys), app reload and desktop update. | DSK, CON, UPD, NFR, KPT, UI |
| sharepoint-file | `electron/sharepoint-file.cjs` | KPI tracker: SharePoint link check, REST content address, read-only GET of the .xlsx with sign-in detection. | KPT, IF |
| preload | `electron/preload.cjs` | Exposes azureDevOps, windchill, sharePointFile, desktopZoom, appUpdates and desktopUpdate IPC APIs to the renderer. | DSK, KPT, UI |
| azure-devops | `electron/azure-devops.cjs` | Desktop Azure DevOps proxy: validated requests, writes only to dev.azure.com, constrained payload builders. | DSK, IF, NFR |
| desktop-update | `electron/desktop-update.cjs` | Desktop self-update from the desktop-latest release: manifest check, download, SHA-256 verify, start installer. | DSK |
| windchill | `electron/windchill.cjs` | Desktop Windchill read-only connection test with SSO and sign-in-window cookies. | CON, DSK |

### 1.8 Build, release and CI

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| desktop-manifest | `scripts/desktop-manifest.cjs` | Merges one platform's installer into latest.json on the desktop-latest release with per-platform build numbers. | CI, DSK |
| traceability | `scripts/traceability.mjs` | Generates docs/TRACEABILITY-MATRIX.md from the documents and checks the trace (`--check`). | DOC, CI |
| swbom | `scripts/swbom.mjs` | Generates the Software Bill of Materials (docs/SWBOM.md, docs/swbom.cdx.json) from pnpm-lock.yaml and checks it (`--check`). | CI |
| release-changes | `scripts/release-changes.mjs` | Change notes in docs/changes/: checks them (`--check`, `--pr-check`) and, in the release commit after a merge, turns them into the new version, its RELEASE-NOTES.md entry with the PR numbers, and removes them (`--apply`). | CI |
| release-entry | `scripts/release-entry.mjs` | Prints one version's RELEASE-NOTES.md entry, the notes of that version's tagged GitHub release. | CI |
| verify-version | `scripts/verify-version.mjs` | Checks package.json version is x.y.z and matches a vX.Y.Z release tag. | CI |
| vite.config | `vite.config.ts` | Vite build: React plugin, version check, build metadata (__APP_BUILD__, build-info.json, meta tag), the Content-Security-Policy of the built page (NFR-09). | CI, UPD, NFR |
| index | `index.html` | HTML entry page with favicon, title and root element loading src/main.tsx. | — |
| build-and-deploy | `.github/workflows/build-and-deploy.yml` | CI: the release commit after a merge (CI-11); E2E also on a 4x slower CPU (CI-12); change-note check, lint, version check, test, build; package/publish Windows and macOS installers; build and deploy web app to GitHub Pages. | CI |
| dependabot | `.github/dependabot.yml` | Weekly update pull requests for the GitHub Actions pinned to commit SHAs in the workflow (KB-08). | CI |
| buildInfo | `src/buildInfo.ts` | Exposes the build metadata injected by Vite as `appBuild`. | UPD |

### 1.9 Automated tests

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| traceability.test | `tests/traceability.test.mjs` | Validation Package consistency: requirement levels, test-case and UAT traces, component list, the matrix current on main. | DOC, CI |
| swbom.test | `tests/swbom.test.mjs` | The SWBOM lists exactly the lockfile's components with scope, licence and hash; lockfile key parsing. | CI |
| release-notes.test | `tests/release-notes.test.mjs` | The newest release-notes version is the package version; versions unique, descending, each with an entry; the release job tags each version and takes its notes from its entry. | CI |
| release-changes.test | `tests/release-changes.test.mjs` | Change notes are valid; the next version from the highest bump; the entry with PR numbers at the top; the release-commit job installs nothing and every build uses its commit. | CI |
| e2e-slow.test | `tests/e2e-slow.test.mjs` | The slow-machine E2E job: 4x CPU throttling, read-only token, the release commit; the helper throttles every page (TC-CI-08). | CI |
| validation-package.test | `tests/validation-package.test.mjs` | Validation Package documents: required sections, unique IDs, mitigations and DFMEA controls traced to existing requirements. | DOC |
| access.test | `tests/access.test.mjs` | Access policy: no policy = read-only and the first-file bootstrap (CON-101), role union, file round trip, refusing writes for roles without Azure changes. | CON |
| app-update.test | `tests/app-update.test.mjs` | Build metadata validation, cache-busting URLs, update checks and reload blocking, release version check. | UPD, CI |
| azure-devops.test | `tests/azure-devops.test.mjs` | PAT persistence/profiles, work-item mapping, tree, backlog view, constrained writes and Feature DoD templates. | CON, FET, ATM, MON |
| pptx-template.test | `tests/pptx-template.test.mjs` | Filling a synthetic template (labels, KPI rows, status, footer kept, file properties), template checks, shrink to fit, the pack's fill. | PCK |
| work-item-edit.test | `tests/work-item-edit.test.mjs` | Edit checks and patch, locks, revision conflict, Monthly lock rules on Task hours, Discussion, both transports. | BKL |
| planning-lock.test | `tests/planning-lock.test.mjs` | Planning / actuals lock rule and the ad-hoc check for a new month Task. | MON |
| background-jobs.test | `tests/background-jobs.test.mjs` | Background jobs: progress, result, failure, one job per key, Clear finished, recorded results. | NAV, QV |
| azure-insights.test | `tests/azure-insights.test.mjs` | Month Task plan/actual mapping, Time Writing stories, NPRA reporting and utilization. | MON, TWN, CAP |
| backlog-health.test | `tests/backlog-health.test.mjs` | Backlog Health lists, columns, plain-text descriptions and CSV. | CON |
| baseline.test | `tests/baseline.test.mjs` | Baseline formula, caps, normalisation, release rows and sample scopes. | BAS, SMP |
| browser-state.test | `tests/browser-state.test.mjs` | IndexedDB persistence, legacy migration, failure safety and ordered saves. | STO, NFR |
| business-time.test | `tests/business-time.test.mjs` | Business time in UTC: helpers, month / Sprint / lock boundaries, and the same results with TZ far from UTC (TC-NAV-51). | NAV, MON, ATM, QV |
| capacity.test | `tests/capacity.test.mjs` | Capacity model: absence, streams, thresholds, shared time and holidays. | CAP |
| calculation-profiles.test | `tests/calculation-profiles.test.mjs` | Calculation profiles (built-ins, custom profiles, default, normaliser) and Lock figures (CAP-41…43). | CAP |
| bucket-rules.test | `tests/bucket-rules.test.mjs` | Bucket rules: built-in words, custom rules moving Tasks between buckets, the normaliser (CAP-46). | CAP |
| insight-thresholds.test | `tests/insight-thresholds.test.mjs` | Insight thresholds moving each insight, and the normaliser (CAP-47). | CAP, OVR |
| people-access.test | `tests/people-access.test.mjs` | People & access: work email on the profile, capacity roles and who is counted (CAP-49, CAP-50). | CAP |
| my-views.test | `tests/my-views.test.mjs` | My views and the Admin / My settings pages and redirects (TC-SET-06, TC-SET-07). | SET |
| epic-setup.test | `tests/epic-setup.test.mjs` | Epic setup: file cleaning, Title / Description from the fields, Block and Warn, bulk creation and Copy to Epics (TC-EPS-02, TC-EPS-03). | EPS |
| feature-setup-inheritance.test | `tests/feature-setup-inheritance.test.mjs` | Feature setup layers per field and the All Epics defaults (TC-CON-59). | CON |
| my-naming-patterns.test | `tests/my-naming-patterns.test.mjs` | My naming patterns: the streams allowed, kept locally, used before the shared ones (TC-QV-41). | QV |
| admin-overview.test | `tests/admin-overview.test.mjs` | Admin overview checks, Feature setup gaps and settings search (TC-ADM-01, TC-ADM-03). | ADM |
| usage-counts.test | `tests/usage-counts.test.mjs` | My page usage: off by default, counts only when on, deleted when off, tampered entries read safely (TC-NAV-45). | NAV |
| onprem-values.test | `tests/onprem-values.test.mjs` | On-prem field values for the Feature field drop-down (TC-EPS-05). | EPS |
| cloud-snapshots.test | `tests/cloud-snapshots.test.mjs` | Snapshot freezing, folder safety, verified upload, failures and history listing. | SNP |
| connections.test | `tests/connections.test.mjs` | Connection URLs, roles, paged queries, on-prem servers, presets, desktop downloads and menu views. | CON, FET, DSK |
| dashboard.test | `tests/dashboard.test.mjs` | Periods, person-month records, overload, concentration, rebalancing and bands. | OVR |
| desktop-update.test | `tests/desktop-update.test.mjs` | Desktop update manifest, build comparison, verified download and per-platform manifest merge. | DSK, CI |
| cp-reporting.test | `tests/cp-reporting.test.mjs` | CP release reporting: containers, signatures, slots, months, Supported / Completed, shared work, data issues, names and the Create Feature title. | QV |
| dp-board-match.test | `tests/dp-board-match.test.mjs` | DP row, Windchill release and Release Details release (IOCC, Content, Tool Validations) to QMS-0025 matching thresholds and Create Feature titles. | QV |
| dp-milestones.test | `tests/dp-milestones.test.mjs` | DP Completed/Supported Release counts, DDT month and milestone names. | QV |
| dp-releases.test | `tests/dp-releases.test.mjs` | Pedestal fields and titles, DHFI matching and dating, DP releases and fuzzy match. | QV |
| feature-setup.test | `tests/feature-setup.test.mjs` | Feature setup paths, layer choice, publish, built-ins, copy and shared listing. | CON |
| feature-months.test | `tests/feature-months.test.mjs` | Start date and Target date months, the Start Date field on web and desktop, the later month Tasks with their hours (TC-BKL-20, TC-BKL-21). | BKL |
| class-sets.test | `tests/class-sets.test.mjs` | Sets per Release Classification value, the Epic's value list, the bulk set choice and the per-row classification (TC-DPF-06, TC-DPF-07). | DPF, EPS |
| story-templates.test | `tests/story-templates.test.mjs` | User Story templates: cleaning, tags, linked stories and where they are used (TC-STT-01, TC-STT-02). | STT |
| bundle-split.test | `tests/bundle-split.test.mjs` | Pages load on demand; the documents only with the Documentation page (TC-PERF-01). | NFR |
| sample-guard.test | `tests/sample-guard.test.mjs` | Every write to Azure DevOps refused while the synthetic sample is loaded (TC-SMP-02). | SMP |
| csp.test | `tests/csp.test.mjs` | The Content-Security-Policy of the built page (TC-CSP-01). | NFR |
| removed-connections.test | `tests/removed-connections.test.mjs` | Merging the shared connections, finding removed ones in the Git history, the read-only history calls (TC-CON-61). | CON |
| format.test | `tests/format.test.mjs` | Formatting helpers and page registry consistency. | UI, NAV |
| home-tiles.test | `tests/home-tiles.test.mjs` | Home: the tile and link search, the Home page entry (TC-NAV-42). | NAV |
| app-frame.test | `tests/app-frame.test.mjs` | The app frame: My dashboard always you, the Refresh order (TC-NAV-47, TC-FET-10). | NAV, FET |
| close-list.test | `tests/close-list.test.mjs` | The Close pop-up's rows, ticks and closing order (TC-BKL-28); Close Tasks and the early-close removal of later months (TC-BKL-31, TC-BKL-32). | BKL |
| closed-history.test | `tests/closed-history.test.mjs` | Finished states, the close date from State Change Date or history, the desktop history read (TC-FET-11). | FET |
| hours-active.test | `tests/hours-active.test.mjs` | Hours make the month Time Writing Task and its story Active, reopening Closed ones (TC-BKL-30). | BKL |
| git-snapshots.test | `tests/git-snapshots.test.mjs` | On-prem view snapshots via Git: no PATs, digests, helpers and validation. | GIT, FET |
| git-storage.test | `tests/git-storage.test.mjs` | Git config, planning data round trip, read/write/conflict/write-check/delete. | GIT |
| git-save-queue.test | `tests/git-save-queue.test.mjs` | Queued, merged saves: time stamps, merge by key, two saves in time order, conflict re-read and merge, bounded retries and Retry, newest template kept. | GIT, HIS, MYD, KPT, PCK |
| git-watch.test | `tests/git-watch.test.mjs` | Files changed in Git since they were read here; their names; this window's own saves never newer (KB-82); the pages each file is shown on. | GIT |
| insights.test | `tests/insights.test.mjs` | Forecast, plan accuracy, momentum, resilience, anomalies and health score. | OVR |
| markdown.test | `tests/markdown.test.mjs` | Markdown anchors, tables, lists, paragraphs, inline and link targets. | DOC |
| monthly-hours.test | `tests/monthly-hours.test.mjs` | Monthly hours series, Epic colours and chart geometry (Pareto, donut). | CAP, OVR, MON |
| my-work.test | `tests/my-work.test.mjs` | My pending work, month-task and move candidates, constrained updates and desktop proxy limits, the ad-hoc tag on a new month Task, the New User Story fields. | ATM, MON, BKL |
| planning-overview.test | `tests/planning-overview.test.mjs` | Planning Overview figures: delivery, exceptions, filters (TC-OVW-01, TC-OVW-02). | OVW |
| capacity-actual.test | `tests/capacity-actual.test.mjs` | Capacity vs Actual figures and filters (TC-CVA-01, TC-CVA-02). | CVA |
| pulse-check.test | `tests/pulse-check.test.mjs` | Previous month, release comparison, work flow and ongoing activities. | OVR |
| personal-views.test | `tests/personal-views.test.mjs` | Personal views: file path per person, validated parse, defaults merge, section order and moves. | MYD |
| history.test | `tests/history.test.mjs` | Historical hours: sheet and rows, skipped reasons, name matching, Git file shapes, cut-off and merge into the reports. | HIS |
| view-as.test | `tests/view-as.test.mjs` | View as: Admin only, rights of a person or role, people list, writes refused while on. | CON |
| resources.test | `tests/resources.test.mjs` | Resources: everyone listed (Time Writing, assignees, history, team, added), team members read from Azure DevOps (browser and desktop proxy). | CAP |
| nested-groups.test | `tests/nested-groups.test.mjs` | Nested grouping: levels, order, blank last, unique keys. | QV |
| monthly-pack.test | `tests/monthly-pack.test.mjs` | Monthly pack files, Epic counts, lines, YoY, slide text and the .pptx writer. | PCK |
| qe-mapping.test | `tests/qe-mapping.test.mjs` | xlsx/CSV read/write and QE Mapping editing and Git file handling. | QEM |
| on-demand.test | `tests/on-demand.test.mjs` | On-Demand pages: the Git file validated, rows, column type changes and option renames that keep values, the merge of two saves, the On-Demand rights and older access.json files (TC-OND-02…06). | OND, CON |
| on-demand-rows.test | `tests/on-demand-rows.test.mjs` | On-Demand row details: sequential IDs (order, never changing, unique after a merge clash, older rows numbered), who added a row and when, the update log and its merge, Long text and Currency values, Currency in the insights (one currency at a time), column descriptions (TC-OND-16…20). | OND |
| on-demand-row-save.test | `tests/on-demand-row-save.test.mjs` | On-Demand row saved at once from the drawer: the change applied to the page as last read from Git with its commit message (add / update / remove), two rows saved one after the other merged from the version they were made from (unique IDs, logs kept, KB-80), a removal against a later change (TC-OND-22). | OND, GIT |
| row-files.test | `tests/row-files.test.mjs` | Row files against a fake GitHub: conversion round trip, rows given keys and IDs, row keys as file names, the next ID under two clients, a key clash, the field-by-field merge, a many-row change as one commit, reading only changed rows, the load time of 500 and 2,000 rows, hidden and deleted rows (TC-OND-26…TC-OND-29, TC-OND-34). | OND |
| row-locks.test | `tests/row-locks.test.mjs` | Row locks with a fake clock and a fake GitHub: take, refuse, expire, take over (one winner), renew, release, the lock branch and its folder fallback, the timeout and warning, the setting, drafts kept a day and restored (TC-OND-30…TC-OND-32). | OND, GIT |
| page-hide.test | `tests/page-hide.test.mjs` | Hiding and showing a page in the menu layout (kept by edits and moves, merged), who may hide and who may delete (PGB-19, PGB-20), the pages read and dropped when the menu layout changes (GIT-21) (TC-PGB-15, TC-GIT-13). | PGB, GIT |
| on-demand-insights.test | `tests/on-demand-insights.test.mjs` | On-Demand insights: count, sum, average, stacking and pivot totals, months, Multi-select per value, filters, "(none)" and "Other", broken references, the insights in the page file and their merge (TC-OND-09…12, TC-OND-14). | OND |
| insight-filters.test | `tests/insight-filters.test.mjs` | The Insights filter row: `insightFilters` in the page file (written only when set, validated, merged as one entry, a page without it unchanged), the rows kept by the period and each kind of filter, on top of a chart's own filters with the same drill-down rows, the viewer's remembered choice (TC-OND-41…44), and a Currency filter in one currency with its validation and the charts' currency (TC-OND-46…48). | OND |
| page-builder.test | `tests/page-builder.test.mjs` | Page builder: the menu layout file validated, written and merged (co-owners as sets), the groups and the order of pages, group rules, the rights of the Tool Owner, a group co-owner, a page co-owner and nobody, “Manage pages and menu groups” for older access.json files, CoNQ migrated in place (TC-PGB-02…08). | PGB, CON, DSH |
| dashboard-pages.test | `tests/dashboard-pages.test.mjs` | On-Demand Dashboard pages: the page type, the file validated, written and merged, the period and filter row, KPI values, charts and summary tables (one currency at a time, largest first, neutralised CSV), the block editor's checks, the table pages as the only data source and the build right (TC-DSH-02…09). | DSH, PGB |
| chart-options.test | `tests/chart-options.test.mjs` | Chart options: an insight without options aggregates and is written exactly as before (hashes against the code before), date grouping incl. ISO weeks, Top N + Other, running total, percent, Min / Max / Distinct count, KPI, Pareto shares, the rows behind a chart, the options and colours validated, written and merged in page and dashboard files (TC-CHT-03…11). | CHT, OND, DSH |
| kpi-tracker.test | `tests/kpi-tracker.test.mjs` | SharePoint link and read (one GET, sign-in detection), the Git copy and its limits, sheet tables. | KPT, IF |
| dp-bulk.test | `tests/dp-bulk.test.mjs` | DP release type and sets, QE match, possible QEs, bulk plan. | DPF |
| formula.test | `tests/formula.test.mjs` | Typed formula: evaluation, functions, blank on / 0, error messages. | CAP |
| content-bulk.test | `tests/content-bulk.test.mjs` | Content bulk plan, people and the chosen email. | CNB |
| naming-patterns.test | `tests/naming-patterns.test.mjs` | Naming patterns: matching, checks, shared settings, Content and IOCC grouping. | QV |
| feature-epics.test | `tests/feature-epics.test.mjs` | Epics to match Features in: shared setting checked and kept in Git, board match limited to the chosen Epics (TC-QV-38). | QV |
| release-counts.test | `tests/release-counts.test.mjs` | Entered release counts: checks, use while a stream has no data, Pulse Check and Monthly pack (TC-QV-39). | QV |
| bulk-epics.test | `tests/bulk-epics.test.mjs` | Bulk creation Epics (mine / shared / built in) and the IOCC bulk plan (TC-QV-40). | QV |
| desktop-zoom.test | `tests/desktop-zoom.test.mjs` | Desktop zoom: Auto fit, steps, limits, kept setting. | UI |
| my-signatures.test | `tests/my-signatures.test.mjs` | Signed by me: signature fields, name matching, signature dates, per-stream counts in a period, Windchill exports (TC-MYD-06). | MYD |
| close-feature.test | `tests/close-feature.test.mjs` | Close Features: only my items, children first, others' open work keeps parents open, failure handling. | ACT |
| table-defaults.test | `tests/table-defaults.test.mjs` | The table design default: shared setting check, column layout and moves, and dates in Excel / CSV exports read back (TC-UI-04, TC-UI-05). | UI |
| page-layout.test | `tests/page-layout.test.mjs` | Page margins: defaults, limits, saved and applied (TC-NAV-50). | NAV |
| chart-labels.test | `tests/chart-labels.test.mjs` | Chart data labels: shared default, per-chart choice, stored values checked (TC-UI-10). | UI |
| query-view.test | `tests/query-view.test.mjs` | Query layout, field resolution, sorting, summary, CSV and column order. | QV |
| release-overview.test | `tests/release-overview.test.mjs` | Releases per stream approved in the month for Overview and Pulse Check. | OVR |
| release-source.test | `tests/release-source.test.mjs` | Release-source WIQL paging, tree / links queries, path parsing, register and approval dates, Feature hours and month release counts. | QV, CON |
| sample-data.test | `tests/sample-data.test.mjs` | Synthetic sample is deterministic and exercises every model. | SMP |
| setup-guide.test | `tests/setup-guide.test.mjs` | Get started step statuses for new, partly and fully set-up users. | NAV |
| streams.test | `tests/streams.test.mjs` | Stream definitions, DP/IOCC/Tool Validations rules, fuzzy Feature match and Pulse Check streams. | QV, OVR |
| custom-streams.test | `tests/custom-streams.test.mjs` | Custom streams: the file read from Git (validation, refused entries), add / rename / remove, allStreams and the longest-name match, a custom “Like IOCC” stream reading documents into releases, custom Windchill streams. | STR |
| theme.test | `tests/theme.test.mjs` | Theme preference parsing/cycling/`?theme=` and relative freshness labels. | UI |
| work-email.test | `tests/work-email.test.mjs` | The work email setting: saved and read on its own, unchanged by Git syncs and connection edits, taken over once from the Time Writing connection only after the shared-email clean-up. | CON |
| view-definitions.test | `tests/view-definitions.test.mjs` | Views file in Git, restore PAT rules, Git setup sync (stream mapping enforced), pending admin changes and Time Writing promotion. | CON, GIT |
| view-sources.test | `tests/view-sources.test.mjs` | Each view shows its own fetch; legacy shared snapshot rule. | QV, FET |
| windchill-bridge.test | `tests/windchill-bridge.test.mjs` | Windchill bookmarklet and result verification. | CON |
| windchill-browser.test | `tests/windchill-browser.test.mjs` | Windchill test and search from the web app with browser sign-in. | CON |
| windchill-export.test | `tests/windchill-export.test.mjs` | Windchill CSV export parsing. | CON |
| windchill-releases.test | `tests/windchill-releases.test.mjs` | Release extraction from document names, unique and clubbed releases, the month counts. | CON, QV |
| windchill-views.test | `tests/windchill-views.test.mjs` | Windchill OData queries, desktop query paging, Git results and browser route. | CON |
| windchill.test | `tests/windchill.test.mjs` | Windchill host normalisation and desktop connection test. | CON, DSK |

### 1.10 End-to-end tests (Playwright)

The end-to-end suite (`pnpm test:e2e`, after `pnpm build:web`) drives the built web app in Chromium, exactly as a user would, with no network: the synthetic sample and fixtures in `e2e/fixtures` provide the data. Each scenario names the UAT test case it automates.

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| helpers | `e2e/helpers.mjs` | Starts `vite preview` on a free port, opens Chromium pages with clean storage, records page errors, throttles the CPU when `E2E_CPU_SLOWDOWN` is set (CI-12), shared actions (navigate — waiting for the page's code —, load sample, reload with the sample kept), a cached roles file for scenarios that change something (CON-101). | CI |
| shell.e2e | `e2e/shell.e2e.mjs` | Sidebar groups and footer, header and month picker, Get started pop-up, synthetic sample, theme toggle, phone width, Force Update dialog, Git storage form defaults, refresh while open (TC-GIT-08), KPI tracker hidden from the menu (TC-KPT-01), typed formula (TC-CAP-27), release naming patterns (TC-QV-37), desktop zoom (TC-UI-07), manager not on the board (TC-GIT-06, TC-SET-05, TC-NAV-01, 03, 31, 33, TC-UI-01, TC-SMP-01, TC-UPD-02); Removed connections restored from the Git history (TC-CON-61); the sample reset asks first and is recorded (TC-SMP-02). | NAV, UI, SMP, UPD |
| documents-and-data.e2e | `e2e/documents-and-data.e2e.mjs` | Documentation tabs, links and download; Windchill export releases from names and from Location with the locations CSV; "＋ ECP" import named after the stream with the ECP CSV and the common Release name / Release columns, an ECP setup at the 3rd folder with the type-2 CSV (TC-CON-53, 54, 55); the table default on the Windchill raw data — move, hide, density, Excel export with dates, Settings → Table defaults (TC-UI-04, 05); My Work tree, Backlog Health and Baselines on the default (TC-UI-06); neutralised CSV; JSON backup without credentials (TC-DOC-01, 02, TC-CON-39, 40, 37, TC-STO-04, TC-INS-01); Windchill releases' QMS-0025 match column (TC-QV-23); auto-fit tables and Wrap text (TC-CON-42); the DP Supported Releases list in Pulse Check folded until Show list (TC-QV-17); every Release page (DP, IOCC, Content, S&S IT) with the source bar, counts, Releases | Source data tabs and the common columns in order (TC-QV-43). | DOC, CON, STO, NFR, QV |
| backlog.e2e | `e2e/backlog.e2e.mjs` | New User Story form from a Feature row of the Backlogs (TC-BKL-10); the Edit form from Feature, User Story and Task rows (TC-BKL-11); New Feature sections, Start date and the Time Writing months with hours per month (TC-BKL-19, TC-BKL-21); DoD and User Stories per Release Classification value (TC-DPF-06); User Story templates (TC-STT-01). | CI, BKL |
| monthly-pack.e2e | `e2e/monthly-pack.e2e.mjs` | Monthly pack tab with the synthetic sample, the .pptx download and the setup tab (TC-PCK-04). | CI |
| on-demand.e2e | `e2e/on-demand.e2e.mjs` | On-Demand → CoNQ against a mocked GitHub: columns with options saved at once, a row added in the row drawer and saved to on-demand/conq.json, reading it back (TC-OND-01, TC-OND-24); read only without the rights (TC-OND-07); Insights — a bar chart and a summary table, each saved at once in the page file, and read back (TC-OND-09); Insights read only and a broken chart (TC-OND-13); row details — Long text and Currency columns with descriptions, the row ID given in the row's save, who added it and when, an edit in History and in the file (TC-OND-16). | OND, CON |
| row-drawer.e2e | `e2e/row-drawer.e2e.mjs` | On-Demand row drawer against a mocked GitHub: a CoNQ row opened from the right with its values, descriptions and History, ‹ ›, Edit with the ask before leaving unsaved edits, Save to Git writing the row and its log entry at once, Escape and the focus back on the row, Enter on a row, ＋ Add row getting its ID in its save (TC-OND-21, TC-OND-25); read only without the right, Edit and Remove row disabled with the reason, a click beside it closing it (TC-OND-23). | OND, CON |
| custom-streams.e2e | `e2e/custom-streams.e2e.mjs` | Custom streams against a mocked GitHub and Azure DevOps: the Tool Owner adds “Labeling” (Like Content), maps its connection and opens its Release page with the §10 parts (TC-STR-06); a viewer without the right sees ＋ Add stream… disabled with the reason (TC-STR-07). | STR |
| page-builder.e2e | `e2e/page-builder.e2e.mjs` | Page builder against a mocked GitHub: a Tool Owner adds the group Quality with a Table page, names a group co-owner, sets the page up and adds a row (TC-PGB-01); the group co-owner adds a page but cannot change the group (TC-PGB-09); no ownership — everything disabled with the reason (TC-PGB-10); a page name already in the menu refused at the field (TC-PGB-12); duplicates in Git kept and listed, co-owners from a list (TC-PGB-13, TC-PGB-14). | PGB |
| page-notices.e2e | `e2e/page-notices.e2e.mjs` | Newer data in Git per page against a mocked GitHub: no notice after the user's own save; a commit to CoNQ shows on CoNQ only, with who and when; Load the newer data shows the new row without reloading the app (TC-GIT-11, TC-GIT-12). | GIT |
| row-locks.e2e | `e2e/row-locks.e2e.mjs` | Row files and row locks with several people on one mocked GitHub: convert as Tool Owner, "Being edited by" and Edit disabled, rows added at the same moment with distinct IDs, the timeout with the browser clock moved on, the draft restored, a co-owner releasing a stuck lock (TC-OND-33); hide / show / delete a row (TC-OND-34); hide / show a page and the Tool Owner's delete (TC-PGB-15); a page added by someone else appearing without a reload (TC-GIT-13). | OND, PGB, GIT |
| fakeGitHub | `e2e/fakeGitHub.mjs` | A small GitHub in the test process for the unit tests (as a fetch) and the E2E scenarios (as a route): branches of text files, the contents API, refs, commits, trees and blobs with real git ids, GraphQL blob batches, a commit list per file. | OND, GIT |
| dashboard-pages.e2e | `e2e/dashboard-pages.e2e.mjs` | On-Demand Dashboard pages against a mocked GitHub: a Tool Owner adds an On-Demand Dashboard, adds a KPI tile, a bar chart and a summary table over a table page and filters it by period, remembered after a reload (TC-DSH-01); a viewer without the right sees every builder button disabled with the reason (TC-DSH-09). | DSH |
| chart-options.e2e | `e2e/chart-options.e2e.mjs` | Chart options against a mocked GitHub: the owner makes a Pareto and a stacked horizontal bar with Top 5 + Other, a target line and a pinned colour, drills into a bar, a stack and “Other” and sets the widths (TC-CHT-01); a viewer sees them and a Dashboard Pareto read only and drills into them (TC-CHT-02). | CHT |
| insights-filters.e2e | `e2e/insights-filters.e2e.mjs` | The Insights filter row against a mocked GitHub: the owner sets up a period and a Category filter with Filters… (saved to Git), the viewer narrows every chart, a Table view and a drill-down to a quarter and a value, the choice kept after a reload, Reset filters (TC-OND-40); a viewer without the setup right sees Filters… disabled with the reason and uses the row (TC-OND-45); the owner adds a Currency filter and the viewer picks EUR 100–500, a chart and its drill-down following, kept after a reload (TC-OND-46). | OND |

## 2. Third-party components (SOUP)

Direct dependencies from `package.json`, with the exact version resolved by `pnpm-lock.yaml` (the lockfile pins every transitive package too, each listed with licence, hash and scope in the generated [SWBOM.md](SWBOM.md), listed by `pnpm list --depth Infinity`). **Runtime** components ship inside the web bundle or the desktop app; **build** components run only on the developer's machine and in CI. Versions are updated by the daily vulnerability check (§4) within their semver ranges; a major update is a reviewed change.

| Component | Version | Licence | Use | Purpose in this system | Failure effect if it misbehaves |
|---|---|---|---|---|---|
| react | 19.3.1 | MIT | runtime | UI rendering library. | The app does not render; caught by the ErrorBoundary and by every L3 test. |
| react-dom | 19.3.1 | MIT | runtime | React DOM renderer. | As react. |
| electron | 44.10.1 | MIT | runtime (desktop) | Desktop shell: Chromium and Node.js runtime, IPC, window. Bundles its own Chromium and Node versions. | Desktop app fails to start or a sandbox weakness; web app unaffected. |
| vite | 8.3.5 | MIT | build | Bundler and dev server; emits `build-info.json`. | Build fails in CI (no release). |
| @vitejs/plugin-react | 6.1.2 | MIT | build | React fast-refresh and JSX transform for Vite. | Build fails in CI. |
| typescript | 6.0.3 | Apache-2.0 | build | Type checking (`tsc -b`). | Type errors go unnoticed; lint and tests still run. |
| oxlint | 1.90.0 | MIT | build | Static analysis (`pnpm lint`). | Lint findings go unnoticed. |
| electron-builder | 26.18.0 | MIT | build | Packages the NSIS installer and the macOS disk image. | No installer is produced; CI fails. |
| playwright | 1.56.1 | Apache-2.0 | test | Drives Chromium for the end-to-end suite (`pnpm test:e2e`); the browser is installed by `playwright install chromium`. | End-to-end tests cannot run; unit tests and the build are unaffected. |
| fake-indexeddb | 6.2.7 | Apache-2.0 | test | IndexedDB in Node for the storage tests. | Storage tests cannot run. |
| @types/node, @types/react, @types/react-dom | 24.19.2, 19.3.0, 19.3.0 | MIT | build | Type definitions. | Type checking only. |
| concurrently, cross-env, wait-on | 10.0.6, 10.1.0, 9.5.1 | MIT | development | Run the desktop app against the dev server (`pnpm dev:desktop`). | Developer convenience only; not in CI or releases. |

The app has **no other runtime dependency**: CSV, Markdown and .xlsx handling (`src/csv.ts`, `src/markdown.ts`, `src/xlsx.ts`) are in-house, which keeps the attack surface and the SOUP list small.

## 3. Platforms and services

| Component | Version | Role |
|---|---|---|
| Node.js | 24 in CI (`actions/setup-node@v4`, `node-version: 24`); 22.12 or later required by Electron 44 | Runs the tests, the build and the desktop main process. |
| pnpm | 11.19.0 (`packageManager` field; `pnpm/action-setup@v4`) | Package manager with a frozen lockfile in CI. |
| GitHub Actions | `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v5`, each pinned to the commit SHA of that tag (updated by Dependabot) | CI/CD (`.github/workflows/build-and-deploy.yml`): Windows validate and package, end-to-end tests (runner pinned to `ubuntu-24.04`: Playwright 1.56 has no Chromium for Ubuntu 26.04), macOS package, publish `desktop-latest`, build and deploy GitHub Pages. |
| GitHub Pages | — | Hosts the web app (static files only). |
| GitHub Releases `desktop-latest` | — | Hosts the installers, SHA256SUMS and `latest.json` for the desktop updater. |
| Browsers | Latest Chrome / Edge (Windows), Chrome / Safari (macOS) per TEST-PLAN.md §3 | Web app runtime; IndexedDB and localStorage. |
| Azure DevOps Services / Server | REST API 7.1 (fallback 6.0, 5.0 on-premises) | Work items source; writes to Services only. |
| GitHub repository contents API | v3 | Private data repository (planning data, setup, exports). |
| Microsoft Graph | — | *(Not used: the SharePoint storage is in the backlog.)* |

## 4. Known vulnerabilities in third-party components

**Audit of this build** (`pnpm audit --json` on `pnpm-lock.yaml` at the Validation Package pull request, 27 October 2026): **0 advisories** at every severity over 370 resolved packages. The audit is repeated every day by the scheduled vulnerability check, which updates dependencies within their semver ranges, adds `pnpm.overrides` for transitive findings, runs a secret scan and opens a pull request; CI installs with `--frozen-lockfile`, so no unreviewed version reaches a build.

| Component | Advisory | Severity | Affected / fixed version | Handling | Status |
|---|---|---|---|---|---|
| minimatch (build time only, via electron-builder) | GHSA-g3hv-75wg-m249 — denial of service via globparts amplification | Moderate | < 11.0.1 / 11.0.1 | 31 October 2026: the 10.x copy used by app-builder-lib is overridden to ^11.0.1 (`minimatch@10` in `pnpm-workspace.yaml`, same `Minimatch` export). The 3.x, 5.x and 9.x copies (glob 7, @electron/asar, dir-compare, filelist, @electron/universal) have no patched release in their line, and 11.x changes their API; they only match the app's own packaging globs on the build machine, never user input. Accepted — KB-16. | Open — accepted until electron-builder updates (re-checked 1 November 2026: still no patched release in the 3.x, 5.x and 9.x lines) |

Advisories found later are listed here with the GHSA / CVE identifier that `pnpm audit` prints, the affected and fixed versions, and the handling (update, override, or accepted with the reason and the KB number in [KNOWN-ISSUES.md](KNOWN-ISSUES.md)). Vulnerabilities that are not dependency advisories — findings of the code analysis and penetration test — are in [SECURITY-ASSESSMENT.md](SECURITY-ASSESSMENT.md) §2.2.

**Component-level security notes** (not advisories, from the assessment):

- Electron 44.10.1 bundles its own Chromium and Node.js; the main window runs with context isolation, sandbox and no Node integration (DSK-02). Updating Electron is the way to take Chromium security fixes; the daily check updates it within the 44.x range, a major update is a reviewed change.
- @azure/msal-browser 5.27.0 keeps the Entra session in `sessionStorage`; the requested Graph scope is broader than needed (SECURITY-ASSESSMENT.md PT-13).
- react / react-dom 19.3.1 neutralise `javascript:` URLs in `href` and escape text content; the app uses no `dangerouslySetInnerHTML`.
