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
| App | `src/App.tsx` | App shell: sidebar, header, month picker and page routing; loads shared setup from Git at start, removes duplicate connections, fetches cloud connections, saves on-prem fetches to Git. | NAV, CON, FET, GIT |
| index | `src/index.css` | Global styles and colour tokens for light and dark themes. | UI |
| App | `src/App.css` | Layout styles for the shell, sidebar, top bar, panels, tables, forms, modals and responsive breakpoints. | UI |
| fresh | `src/fresh.css` | Final "fresh look" style layer (white sidebar, soft canvas, borderless cards) built on the index.css tokens. | UI |
| theme | `src/theme.ts` | Theme preference (system/light/dark): parse, cycle, resolve against prefers-color-scheme, apply and store per browser; `?theme=` support. | UI |
| headerSlot | `src/headerSlot.ts` | React context for a header slot that pages can fill (e.g. the Team / Individual switch). | NAV |
| settingsTabs | `src/settingsTabs.ts` | Settings tab identifiers, the remembered-tab storage key and the tab to open when Settings is opened from elsewhere. | SET, CON |
| index | `src/docs/index.ts` | Bundles docs/*.md at build time into the list of project documents shown on the Documentation page. | DOC |
| registry | `src/pages/registry.ts` | Single source of page ids, labels, icons, sidebar groups, header text and month-picker use. | NAV |
| types | `src/pages/types.ts` | `PageProps` shared by pages: the app store, the selected month and its setter. | — |
| AdminPage | `src/pages/AdminPage.tsx` | Settings page: tabs for Azure DevOps connections, Git and SharePoint storage, Access, Feature setup, capacity/absence, periods, resources, master data and audit. | SET, CON, GIT, SNP, CAP |
| BacklogHealthPage | `src/pages/BacklogHealthPage.tsx` | Backlog Health: open work in ended Sprints, Features without DoD and unassigned work, with person filter, chosen columns, sorting and CSV. | CON |
| BaselinesPage | `src/pages/BaselinesPage.tsx` | Baselines: estimation rules editor, release baselines vs booked hours, and the monthly Time Writing task plan check. | BAS, GIT |
| BoardPage | `src/pages/BoardPage.tsx` | Backlogs / Release Details: editable Time Writing tree, read-only query views, release views and the DP table with DDT month filter and board match. | CON, FET, QV, ATM |
| BulkActionsPage | `src/pages/BulkActionsPage.tsx` | Bulk actions: move my User Stories from past Sprints to the current PI + Sprint, state checks, and create this month's Time Writing story and task. | ATM, CON |
| DashboardPage | `src/pages/DashboardPage.tsx` | Dashboard: demand vs capacity for a period and filters — utilization, overload, rebalancing, trends, Epic mix, insights and releases. | OVR, CAP |
| DocsPage | `src/pages/DocsPage.tsx` | Documentation page: reads the bundled project documents in-app, remembers the chosen one, keeps document and anchor links in the page. | DOC |
| MonthlyPage | `src/pages/MonthlyPage.tsx` | Monthly Time Writing: the selected month's Time Writing Tasks (team or individual) with planned/completed hours and gaps. | MON, TWN |
| MyWorkPage | `src/pages/MyWorkPage.tsx` | Assigned to Me: my pending Azure DevOps items, resolve/close them, and create a Feature under an Epic with its stories and task. | ATM, CON |
| PiReviewPage | `src/pages/PiReviewPage.tsx` | PI Review placeholder page (planned PI summary). | NAV |
| WorkspacePage | `src/pages/WorkspacePage.tsx` | Insights workspace: KPI tiles, trend and cumulative releases charts, exception queue, timeline health, insight cards with evidence, the pack preview and the insights queue saved to the Monthly pack. | WSP |
| PulseCheckPage | `src/pages/PulseCheckPage.tsx` | Pulse Check: last month's and this month's releases per stream, Supported Releases, Windchill exports, analysis and ongoing activities. | OVR, NAV, QV |
| QeMappingPage | `src/pages/QeMappingPage.tsx` | QE Mapping: upload Excel/CSV, edit cells/rows/columns, filter and group, then save to Git or export. | QEM |
| SnapshotsPage | `src/pages/SnapshotsPage.tsx` | Snapshots: SharePoint snapshot history, browser storage and backup recovery, legacy snapshot records. | SNP, STO |

### 1.2 UI components

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| AccessPanel | `src/components/AccessPanel.tsx` | Settings → Access: shows roles and per-role rights; editable and saved to Git (access.json) only by a role that may manage access. | CON |
| AssigneeConfirm | `src/components/AssigneeConfirm.tsx` | Confirmation before creating work items: what is created and to whom it is assigned; never blank. | CON, ATM |
| AzureConnections | `src/components/AzureConnections.tsx` | Settings → Azure DevOps connection setup: servers, presets, add/clone/edit connections, PATs, stream mapping and duplicate clean-up. | CON |
| AzureViewsGit | `src/components/AzureViewsGit.tsx` | Settings panel to save Azure DevOps connection definitions to Git and restore them elsewhere, never writing PATs. | CON, GIT |
| AzureWorkItemTree | `src/components/AzureWorkItemTree.tsx` | Expandable Epic → Feature → Story → Task tree with Feature creation and child completion; read-only for other connections. | CON, ATM |
| BacklogTable | `src/components/BacklogTable.tsx` | Paged backlog table of the work-item tree with level filter and per-browser column chooser. | CON |
| BaselineRulesEditor | `src/components/BaselineRulesEditor.tsx` | Editor for per-stream estimation rules (hours per unit × units formula, optional max), draft then save. | BAS |
| BrandMark | `src/components/BrandMark.tsx` | SVG app mark: planning calendar with a quality shield and check. | UI |
| BuildStatus | `src/components/BuildStatus.tsx` | Build status display and, in the desktop app, check/download/verify/start the published desktop installer. | UPD, DSK |
| Clock | `src/components/Clock.tsx` | Header clock in the viewer's time zone and the theme toggle button. | NAV, UI |
| DataStatus | `src/components/DataStatus.tsx` | Header data-status chip with Refresh, and the data notices shown once under the header. | FET, NAV |
| DesktopDownload | `src/components/DesktopDownload.tsx` | Sidebar entry and dialog to download the desktop app; hidden inside the desktop app. | DSK |
| DpBoardColumn | `src/components/DpBoardColumn.tsx` | DP table cell showing the matching QMS-0025 Feature/User Story, or Create Feature when nothing matches. | QV |
| DpMonthCounts | `src/components/DpMonthCounts.tsx` | Table of a month's DP Supported Releases with milestones passed (DT, SFV, PRD, RPE) and dates. | QV, OVR |
| ErrorBoundary | `src/components/ErrorBoundary.tsx` | Catches render errors in a view and shows what failed with a way back instead of a blank app. | UI |
| FeatureEditor | `src/components/FeatureEditor.tsx` | Modal to add a Feature under an Epic or complete a Feature's children, shared by Backlogs and Assigned to Me. | ATM, CON |
| MonthlyPackPanel | `src/components/MonthlyPackPanel.tsx` | Pulse Check → Monthly pack: the two slides as boxes with generated lines and the month's text, Save to Git, copy, Download .pptx. | PCK |
| MonthlyPackSetupPanel | `src/components/MonthlyPackSetupPanel.tsx` | Settings → Monthly pack: slide lines (streams, Epics) and KPI rows (Epic, metric), saved to Git. | PCK |
| FeatureSetupPanel | `src/components/FeatureSetupPanel.tsx` | Settings → Feature setup: per-Epic optional stories, Time Writing story and month Task defaults, shared and personal layers. | CON |
| GapsPanel | `src/components/GapsPanel.tsx` | Lists items the page did not pick up for the month and why. | MON, TWN |
| GitStorage | `src/components/GitStorage.tsx` | Settings panel for the Git data file location and token, plus a Git sync bar. | GIT |
| Markdown | `src/components/Markdown.tsx` | Renders parsed Markdown blocks as React elements; internal links via callback, external https in new tab. | DOC |
| MonthOverview | `src/components/MonthOverview.tsx` | "This month" overview sections: capacity model and metrics for a month. | OVR, CAP |
| MultiSelect | `src/components/MultiSelect.tsx` | Multi-value checkbox filter button ("All", one value or "n selected"). | OVR, UI |
| PersonPicker | `src/components/PersonPicker.tsx` | Typeable person list with "me" first and keyboard selection. | ATM, UI |
| QueryView | `src/components/QueryView.tsx` | Read-only query results view: summary strip, query columns, sorting, filters, search and CSV export. | QV |
| ReleaseFeatureEditor | `src/components/ReleaseFeatureEditor.tsx` | Create Feature button from Release Details, pre-filling the default Feature form from the release. | QV |
| ReleaseQuadrants | `src/components/ReleaseQuadrants.tsx` | Releases summary lines, the Supported summary next to them (DP Supported Releases, S&S IT export releases of the month), and a 2×2 quadrant per stream with documents approved in the month and totals. | OVR, QV |
| ReleaseView | `src/components/ReleaseView.tsx` | Release source view: flat list of releases derived from document paths. | QV |
| ScopeSwitch | `src/components/ScopeSwitch.tsx` | Team / Individual toggle with person picker, in the header or page top. | MON, OVR |
| SetupGuide | `src/components/SetupGuide.tsx` | "Get started" pop-up listing setup steps with live status and buttons to the right place. | NAV |
| SharedTimePanel | `src/components/SharedTimePanel.tsx` | Settings → Capacity: map Epics/Features as regional holidays or common activities applied to people in scope. | CAP, SET |
| TeamFilterBar | `src/components/TeamFilterBar.tsx` | Region switch and role multi-select filter for team views. | OVR |
| WindchillReleasesPanel | `src/components/WindchillReleasesPanel.tsx` | Lists a Windchill export's unique releases from Location or document names (source and columns chosen), filtered to the header month, sortable, with draggable widths; the unique locations, CSV exports and Save locations to Git. | CON |
| WindchillSettingsPanel | `src/components/WindchillSettingsPanel.tsx` | Windchill host and service path setup with connection test and sign-in (browser or desktop). | CON |
| WindchillViews | `src/components/WindchillViews.tsx` | Windchill views settings, the Windchill export page and import of results saved or copied from the browser. | CON |
| WorkloadCharts | `src/components/WorkloadCharts.tsx` | SVG charts: utilization, Epic mix, Epic bullet, Pareto, utilization heatmap and donut. | OVR |
| columnWidths | `src/components/columnWidths.tsx` | `useColumnWidths` hook: draggable table column widths kept per table in this browser. | UI |
| ui | `src/components/ui.tsx` | Shared UI primitives: Page, Panel, TablePanel, Metrics, Pill, Notice, EmptyState, Modal, Info, SettingsSummary. | UI |

### 1.3 Domain logic and calculations

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| access | `src/access.ts` | Role-based access policy (access.json): roles, areas, actions, parsing/serialising and rights per person email. | CON |
| azureHierarchy | `src/azureHierarchy.ts` | Builds the filtered Epic→Task work-item tree with ancestor context, missing-parent and cycle handling. | CON |
| azureInsights | `src/azureInsights.ts` | Time Writing month-task detection, month story plans, working days, Azure insights and Time Writing gaps. | MON, TWN, CAP |
| backlogHealth | `src/backlogHealth.ts` | Backlog Health lists (older-Sprint work, Features without DoD, unassigned), columns and CSV. | CON |
| backlogView | `src/backlogView.ts` | Backlog table columns, normalisation, plain-text rendering and visible row flattening. | CON |
| backlogViews | `src/backlogViews.ts` | Azure DevOps menu entries: the editable Time Writing backlog and read-only views, remembered tab. | NAV, CON |
| baseline | `src/baseline.ts` | Per-stream estimation rules, dated release scopes and release baseline vs actual rows. | BAS |
| capacity | `src/capacity.ts` | Capacity model: month tasks, absence, shared time, regions/roles, per-person and per-stream load and status. | CAP, SET |
| chartUtils | `src/chartUtils.ts` | Chart helpers: month labels, ticks, bar/column/arc geometry, Epic colours, Pareto series, label wrapping. | OVR |
| csv | `src/csv.ts` | CSV cell escaping with spreadsheet-formula injection guard. | CON |
| dashboard | `src/dashboard.ts` | Person-month records (plan, actual, capacity) with filters, periods, totals, overload, concentration and rebalancing. | OVR, CAP |
| domain | `src/domain.ts` | Core TypeScript types: AppState, activities, efforts, baselines, periods, snapshots, Azure work items, release plans. | — |
| dpBoardMatch | `src/dpBoardMatch.ts` | Fuzzy match of DP rows to QMS-0025 Features/User Stories by name and version; DP Feature title builder. | QV |
| dpMilestones | `src/dpMilestones.ts` | DP milestone fields, DDT month, Completed and unique Supported Releases counts per month. | QV, OVR |
| ioccMilestones | `src/ioccMilestones.ts` | IOCC document type from the Title (Release Plan, Release Notes, Verification Report), the release a document belongs to, and the unique Completed and Supported Releases signed in a month. | QV |
| nestedGroups | `src/nestedGroups.ts` | Nested grouping of a list by several levels, with a unique key per group path (IOCC releases). | QV |
| dpReleases | `src/dpReleases.ts` | DP releases from Pedestal Release items dated by matching DHFI documents (exact version). | QV |
| featureSetup | `src/featureSetup.ts` | Per-Epic Feature setup (stories, Time Writing story, task defaults), placeholders, shared/personal layers, parse/serialise. | CON |
| format | `src/format.ts` | Display formatting: hours, percent, dates in viewer time zone, month names, relative time. | UI |
| workspace | `src/workspace.ts` | Insights workspace rules: KPI deltas, data completeness, exception queue, timeline health, cumulative sums, insight cards and the suggested questions. | WSP |
| packInputs | `src/packInputs.ts` | The Monthly pack's inputs for a month (streams' releases and supported counts, utilisation), shared by the pack tab and the Insights workspace. | PCK, WSP |
| insights | `src/insights.ts` | Dashboard insights: month forecast, plan accuracy, stream momentum, resilience, anomalies and health score. | OVR |
| markdown | `src/markdown.ts` | Small Markdown parser to plain data (headings with GitHub anchors, lists, tables, inline) and link targets. | DOC |
| myWork | `src/myWork.ts` | "Me" matching, pending work, month-task and move candidates, state checks and next states, Feature children. | ATM |
| pulseCheck | `src/pulseCheck.ts` | Pulse Check: previous month, release comparison, work flow opened/closed and ongoing work. | OVR |
| qeMapping | `src/qeMapping.ts` | QE Mapping table model: sheets with stable column/row ids, edits, filter, group, CSV, Git file parse/serialise. | QEM |
| queryView | `src/queryView.ts` | Query-view layout from WIQL SELECT/ORDER BY, field resolution, cell formatting, sorting, summary, CSV, column order. | QV |
| releaseOverview | `src/releaseOverview.ts` | Releases with documents approved in the month per stream, with counts and totals. | OVR |
| releasePath | `src/releasePath.ts` | Reads release name and number from Area/Iteration Paths; DP, IOCC and Tool Validations (one entry per tool) stream rules. | QV |
| rules | `src/rules.ts` | Period lock rules, demand classification, baseline lookup, variance flag and capacity utilization. | SET, BAS |
| setupGuide | `src/setupGuide.ts` | "Get started" setup steps with live status and required-step logic. | NAV |
| streams | `src/streams.ts` | Release stream definitions and data sets, name matching and connection/export lookup per stream. | QV, OVR |
| viewSources | `src/viewSources.ts` | Picks the saved fetch snapshot for a read-only connection, with legacy shared release snapshot rule. | QV, FET |
| windchillReleases | `src/windchillReleases.ts` | Unique releases of a Windchill export from the Location column (deepest folder with a version) or the document names (clubbed names included); unique locations; the windchill-locations analysis file. | CON |
| xlsx | `src/xlsx.ts` | Library-free .xlsx zip reader/writer and CSV reader with inflate size limit. | QEM |
| monthlyPack | `src/monthlyPack.ts` | Monthly pack: setup and month files, Epic counts, releases and supported counts per slide line, YoY, capacity lines, slide boxes and copy text. | PCK |
| pptx | `src/pptx.ts` | Library-free .pptx writer: 16:9 slides with a title and boxes of bullet lines, on the xlsx zip writer. | PCK |

### 1.4 Data, storage and sync

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| store | `src/store.ts` | `useAppStore`: app state with IndexedDB persistence, SharePoint connection/sync, snapshots and audit. | STO, SNP |
| browserState | `src/browserState.ts` | IndexedDB state repository: validation, legacy migration, backup validation and ordered serialized writes. | STO |
| gitStorage | `src/gitStorage.ts` | GitHub-repo planning data file: config/token, serialise/parse, read/write/delete with conflict detection, folder listing. | GIT |
| gitSnapshots | `src/gitSnapshots.ts` | On-prem read-only view fetches saved to Git (azure-data/) without PATs; parse, digest, apply. | GIT, FET |
| sharepoint | `src/sharepoint.ts` | SharePoint client via MSAL and Microsoft Graph for remote app state. | SNP |
| cloudSnapshots | `src/cloudSnapshots.ts` | Frozen whitelisted snapshot files uploaded to SharePoint with read-back verification; listing history. | SNP |
| viewDefinitions | `src/viewDefinitions.ts` | Azure connection definitions file in Git: serialise/parse, restore with PAT rules, sync, duplicates. | CON, GIT |
| download | `src/download.ts` | File downloads: effort CSV, state JSON backup, CSV, Markdown, XLSX and PPTX. | STO, CON, PCK |
| seed | `src/seed.ts` | Initial synthetic AppState (people, activities, efforts, baselines, periods). | SMP |
| sampleData | `src/sampleData.ts` | Deterministic synthetic Azure-shaped dataset, profiles and release scopes for sample mode. | SMP |

### 1.5 Integrations

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| azureDevOps | `src/azureDevOps.ts` | Azure DevOps REST client: URL normalising, iterations, WIQL fetch, work-item mapping, constrained Feature/Story/Task creation and updates. | CON, FET, ATM, MON, IF |
| azureCredentials | `src/azureCredentials.ts` | Browser-local PATs per server and connection profiles (role, view name, show in menu); never in app data. | CON |
| connectionPresets | `src/connectionPresets.ts` | Pre-filled team connection presets and dismissed-preset storage. | CON |
| releaseSource | `src/releaseSource.ts` | Read-only release source: paged WIQL queries, approval month, completed releases, fuzzy Feature name matching. | QV |
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
| useAccess | `src/useAccess.ts` | Access policy from Git, cached in this browser, and the viewer's rights. | CON |
| useAzureWorkspace | `src/useAzureWorkspace.ts` | Azure connections state: fetch, save, preview, sample data, Git-backed on-prem data and fetch listeners. | CON, FET, SMP |
| useDpBoardColumn | `src/useDpBoardColumn.tsx` | DP table "QMS-0025 match" column with search/export text and Create Feature. | QV |
| useFeatureSetup | `src/useFeatureSetup.ts` | Shared and personal Feature setup from Git, cached locally, saved with a writable token. | CON |
| useGitStorage | `src/useGitStorage.ts` | Git storage state: load/save planning data, views file, access, Feature setup, QE Mapping and Windchill files, including the windchill-analysis locations file. | GIT, CON, QEM |
| useMyWork | `src/useMyWork.ts` | Who "me" is: Time Writing connection email plus a remembered display name. | ATM |
| useNow | `src/useNow.ts` | Date that re-renders on an interval for clock and freshness labels. | NAV |
| usePersonScope | `src/usePersonScope.ts` | Team / Individual scope and team filter, remembered per page. | MON, OVR |
| useQeMapping | `src/useQeMapping.ts` | QE Mapping table from Git, cached locally, saved with a writable token. | QEM |
| useMonthlyPack | `src/useMonthlyPack.ts` | Monthly pack setup (cached locally) and the month's text from Git, saved with a writable token. | PCK |
| useWindchill | `src/useWindchill.ts` | Windchill views: searches, fetching via desktop/browser/bridge, importing results. | CON |

### 1.7 Desktop shell (Electron)

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| main | `electron/main.cjs` | Electron main process: window, IPC handlers for Azure DevOps proxy, Windchill test/query/sign-in, app reload and desktop update. | DSK, CON, UPD, NFR |
| preload | `electron/preload.cjs` | Exposes azureDevOps, windchill, appUpdates and desktopUpdate IPC APIs to the renderer. | DSK |
| azure-devops | `electron/azure-devops.cjs` | Desktop Azure DevOps proxy: validated requests, writes only to dev.azure.com, constrained payload builders. | DSK, IF, NFR |
| desktop-update | `electron/desktop-update.cjs` | Desktop self-update from the desktop-latest release: manifest check, download, SHA-256 verify, start installer. | DSK |
| windchill | `electron/windchill.cjs` | Desktop Windchill read-only connection test with SSO and sign-in-window cookies. | CON, DSK |

### 1.8 Build, release and CI

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| desktop-manifest | `scripts/desktop-manifest.cjs` | Merges one platform's installer into latest.json on the desktop-latest release with per-platform build numbers. | CI, DSK |
| traceability | `scripts/traceability.mjs` | Generates docs/TRACEABILITY-MATRIX.md from the documents and checks the trace (`--check`). | DOC, CI |
| verify-version | `scripts/verify-version.mjs` | Checks package.json version is x.y.z and matches a vX.Y.Z release tag. | CI |
| vite.config | `vite.config.ts` | Vite build: React plugin, version check, build metadata (__APP_BUILD__, build-info.json, meta tag). | CI, UPD |
| index | `index.html` | HTML entry page with favicon, title and root element loading src/main.tsx. | — |
| build-and-deploy | `.github/workflows/build-and-deploy.yml` | CI: lint, version check, test, build; package/publish Windows and macOS installers; build and deploy web app to GitHub Pages. | CI |
| buildInfo | `src/buildInfo.ts` | Exposes the build metadata injected by Vite as `appBuild`. | UPD |

### 1.9 Automated tests

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| traceability.test | `tests/traceability.test.mjs` | Validation Package consistency: requirement levels, test-case and UAT traces, component list, current matrix. | DOC, CI |
| validation-package.test | `tests/validation-package.test.mjs` | Validation Package documents: required sections, unique IDs, mitigations and DFMEA controls traced to existing requirements. | DOC |
| access.test | `tests/access.test.mjs` | Access policy: no-policy defaults, role union, file round trip, refusing writes for roles without Azure changes. | CON |
| app-update.test | `tests/app-update.test.mjs` | Build metadata validation, cache-busting URLs, update checks and reload blocking, release version check. | UPD, CI |
| azure-devops.test | `tests/azure-devops.test.mjs` | PAT persistence/profiles, work-item mapping, tree, backlog view, constrained writes and Feature DoD templates. | CON, FET, ATM, MON |
| azure-insights.test | `tests/azure-insights.test.mjs` | Month Task plan/actual mapping, Time Writing stories, NPRA reporting and utilization. | MON, TWN, CAP |
| backlog-health.test | `tests/backlog-health.test.mjs` | Backlog Health lists, columns, plain-text descriptions and CSV. | CON |
| baseline.test | `tests/baseline.test.mjs` | Baseline formula, caps, normalisation, release rows and sample scopes. | BAS, SMP |
| browser-state.test | `tests/browser-state.test.mjs` | IndexedDB persistence, legacy migration, failure safety and ordered saves. | STO, NFR |
| capacity.test | `tests/capacity.test.mjs` | Capacity model: absence, streams, thresholds, shared time and holidays. | CAP |
| cloud-snapshots.test | `tests/cloud-snapshots.test.mjs` | Snapshot freezing, folder safety, verified upload, failures and history listing. | SNP |
| connections.test | `tests/connections.test.mjs` | Connection URLs, roles, paged queries, on-prem servers, presets, desktop downloads and menu views. | CON, FET, DSK |
| workspace.test | `tests/workspace.test.mjs` | KPI helpers, data completeness, exception queue, timeline health and insight cards. | WSP |
| dashboard.test | `tests/dashboard.test.mjs` | Periods, person-month records, overload, concentration, rebalancing and bands. | OVR |
| desktop-update.test | `tests/desktop-update.test.mjs` | Desktop update manifest, build comparison, verified download and per-platform manifest merge. | DSK, CI |
| dp-board-match.test | `tests/dp-board-match.test.mjs` | DP row to QMS-0025 matching thresholds and Create Feature titles. | QV |
| dp-milestones.test | `tests/dp-milestones.test.mjs` | DP Completed/Supported Release counts, DDT month and milestone names. | QV |
| dp-releases.test | `tests/dp-releases.test.mjs` | Pedestal fields and titles, DHFI matching and dating, DP releases and fuzzy match. | QV |
| feature-setup.test | `tests/feature-setup.test.mjs` | Feature setup paths, layer choice, publish, built-ins, copy and shared listing. | CON |
| format.test | `tests/format.test.mjs` | Formatting helpers and page registry consistency. | UI, NAV |
| git-snapshots.test | `tests/git-snapshots.test.mjs` | On-prem view snapshots via Git: no PATs, digests, helpers and validation. | GIT, FET |
| git-storage.test | `tests/git-storage.test.mjs` | Git config, planning data round trip, read/write/conflict/write-check/delete. | GIT |
| insights.test | `tests/insights.test.mjs` | Forecast, plan accuracy, momentum, resilience, anomalies and health score. | OVR |
| markdown.test | `tests/markdown.test.mjs` | Markdown anchors, tables, lists, paragraphs, inline and link targets. | DOC |
| monthly-hours.test | `tests/monthly-hours.test.mjs` | Monthly hours series, Epic colours and chart geometry (Pareto, donut). | CAP, OVR, MON |
| my-work.test | `tests/my-work.test.mjs` | My pending work, month-task and move candidates, constrained updates and desktop proxy limits. | ATM |
| pulse-check.test | `tests/pulse-check.test.mjs` | Previous month, release comparison, work flow and ongoing activities. | OVR |
| nested-groups.test | `tests/nested-groups.test.mjs` | Nested grouping: levels, order, blank last, unique keys. | QV |
| monthly-pack.test | `tests/monthly-pack.test.mjs` | Monthly pack files, Epic counts, lines, YoY, slide text and the .pptx writer. | PCK |
| qe-mapping.test | `tests/qe-mapping.test.mjs` | xlsx/CSV read/write and QE Mapping editing and Git file handling. | QEM |
| query-view.test | `tests/query-view.test.mjs` | Query layout, field resolution, sorting, summary, CSV and column order. | QV |
| release-overview.test | `tests/release-overview.test.mjs` | Releases per stream approved in the month for Overview and Pulse Check. | OVR |
| release-source.test | `tests/release-source.test.mjs` | Release-source WIQL paging, path parsing, register and approval dates. | QV |
| sample-data.test | `tests/sample-data.test.mjs` | Synthetic sample is deterministic and exercises every model. | SMP |
| setup-guide.test | `tests/setup-guide.test.mjs` | Get started step statuses for new, partly and fully set-up users. | NAV |
| streams.test | `tests/streams.test.mjs` | Stream definitions, DP/IOCC path rules, fuzzy Feature match and Pulse Check streams. | QV, OVR |
| theme.test | `tests/theme.test.mjs` | Theme preference parsing/cycling/`?theme=` and relative freshness labels. | UI |
| view-definitions.test | `tests/view-definitions.test.mjs` | Views file in Git, restore PAT rules, Git setup sync and Time Writing promotion. | CON, GIT |
| view-sources.test | `tests/view-sources.test.mjs` | Each view shows its own fetch; legacy shared snapshot rule. | QV, FET |
| windchill-bridge.test | `tests/windchill-bridge.test.mjs` | Windchill bookmarklet and result verification. | CON |
| windchill-browser.test | `tests/windchill-browser.test.mjs` | Windchill test and search from the web app with browser sign-in. | CON |
| windchill-export.test | `tests/windchill-export.test.mjs` | Windchill CSV export parsing. | CON |
| windchill-releases.test | `tests/windchill-releases.test.mjs` | Release extraction from document names, unique and clubbed releases. | CON |
| windchill-views.test | `tests/windchill-views.test.mjs` | Windchill OData queries, desktop query paging, Git results and browser route. | CON |
| windchill.test | `tests/windchill.test.mjs` | Windchill host normalisation and desktop connection test. | CON, DSK |

### 1.10 End-to-end tests (Playwright)

The end-to-end suite (`pnpm test:e2e`, after `pnpm build:web`) drives the built web app in Chromium, exactly as a user would, with no network: the synthetic sample and fixtures in `e2e/fixtures` provide the data. Each scenario names the UAT test case it automates.

| Component | Path | Purpose | Requirement areas |
|---|---|---|---|
| helpers | `e2e/helpers.mjs` | Starts `vite preview` on a free port, opens Chromium pages with clean storage, records page errors, shared actions (navigate, load sample). | CI |
| shell.e2e | `e2e/shell.e2e.mjs` | Sidebar groups and footer, header and month picker, Get started pop-up, synthetic sample, theme toggle, phone width, Force Update dialog, Git storage form defaults, manager not on the board (TC-GIT-06, TC-SET-05, TC-NAV-01, 03, 31, 33, TC-UI-01, TC-SMP-01, TC-UPD-02). | NAV, UI, SMP, UPD |
| documents-and-data.e2e | `e2e/documents-and-data.e2e.mjs` | Documentation tabs, links and download; Windchill export releases from names and from Location with the locations CSV; neutralised CSV; JSON backup without credentials (TC-DOC-01, 02, TC-CON-39, 40, 37, TC-STO-04, TC-INS-01); auto-fit tables and Wrap text (TC-CON-42). | DOC, CON, STO, NFR |
| workspace.e2e | `e2e/workspace.e2e.mjs` | Insights workspace with the synthetic sample: tiles, queue, timeline, cards, pack queue and the unchanged Dashboard (TC-WSP-06). | CI |
| monthly-pack.e2e | `e2e/monthly-pack.e2e.mjs` | Monthly pack tab with the synthetic sample, the .pptx download and the setup tab (TC-PCK-04). | CI |

## 2. Third-party components (SOUP)

Direct dependencies from `package.json`, with the exact version resolved by `pnpm-lock.yaml` (the lockfile pins every transitive package too: 367 unique packages in all, listed by `pnpm list --depth Infinity`). **Runtime** components ship inside the web bundle or the desktop app; **build** components run only on the developer's machine and in CI. Versions are updated by the daily vulnerability check (§4) within their semver ranges; a major update is a reviewed change.

| Component | Version | Licence | Use | Purpose in this system | Failure effect if it misbehaves |
|---|---|---|---|---|---|
| react | 19.3.1 | MIT | runtime | UI rendering library. | The app does not render; caught by the ErrorBoundary and by every L3 test. |
| react-dom | 19.3.1 | MIT | runtime | React DOM renderer. | As react. |
| @azure/msal-browser | 5.26.0 | MIT | runtime (SharePoint only) | Microsoft Entra ID sign-in for the optional SharePoint storage (SNP). | SharePoint sign-in fails; local and Git storage are unaffected. |
| electron | 44.9.3 | MIT | runtime (desktop) | Desktop shell: Chromium and Node.js runtime, IPC, window. Bundles its own Chromium and Node versions. | Desktop app fails to start or a sandbox weakness; web app unaffected. |
| vite | 8.3.5 | MIT | build | Bundler and dev server; emits `build-info.json`. | Build fails in CI (no release). |
| @vitejs/plugin-react | 6.1.2 | MIT | build | React fast-refresh and JSX transform for Vite. | Build fails in CI. |
| typescript | 6.0.3 | Apache-2.0 | build | Type checking (`tsc -b`). | Type errors go unnoticed; lint and tests still run. |
| oxlint | 1.89.0 | MIT | build | Static analysis (`pnpm lint`). | Lint findings go unnoticed. |
| electron-builder | 26.18.0 | MIT | build | Packages the NSIS installer and the macOS disk image. | No installer is produced; CI fails. |
| playwright | 1.56.1 | Apache-2.0 | test | Drives Chromium for the end-to-end suite (`pnpm test:e2e`); the browser is installed by `playwright install chromium`. | End-to-end tests cannot run; unit tests and the build are unaffected. |
| fake-indexeddb | 6.2.6 | Apache-2.0 | test | IndexedDB in Node for the storage tests. | Storage tests cannot run. |
| @types/node, @types/react, @types/react-dom | 24.19.2, 19.3.0, 19.3.0 | MIT | build | Type definitions. | Type checking only. |
| concurrently, cross-env, wait-on | 10.0.6, 10.1.0, 9.5.1 | MIT | development | Run the desktop app against the dev server (`pnpm dev:desktop`). | Developer convenience only; not in CI or releases. |

The app has **no other runtime dependency**: CSV, Markdown and .xlsx handling (`src/csv.ts`, `src/markdown.ts`, `src/xlsx.ts`) are in-house, which keeps the attack surface and the SOUP list small.

## 3. Platforms and services

| Component | Version | Role |
|---|---|---|
| Node.js | 24 in CI (`actions/setup-node@v4`, `node-version: 24`); 22.12 or later required by Electron 44 | Runs the tests, the build and the desktop main process. |
| pnpm | 11.19.0 (`packageManager` field; `pnpm/action-setup@v4`) | Package manager with a frozen lockfile in CI. |
| GitHub Actions | `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v5` | CI/CD (`.github/workflows/build-and-deploy.yml`): Windows validate and package, end-to-end tests (runner pinned to `ubuntu-24.04`: Playwright 1.56 has no Chromium for Ubuntu 26.04), macOS package, publish `desktop-latest`, build and deploy GitHub Pages. |
| GitHub Pages | — | Hosts the web app (static files only). |
| GitHub Releases `desktop-latest` | — | Hosts the installers, SHA256SUMS and `latest.json` for the desktop updater. |
| Browsers | Latest Chrome / Edge (Windows), Chrome / Safari (macOS) per TEST-PLAN.md §3 | Web app runtime; IndexedDB and localStorage. |
| Azure DevOps Services / Server | REST API 7.1 (fallback 6.0, 5.0 on-premises) | Work items source; writes to Services only. |
| GitHub repository contents API | v3 | Private data repository (planning data, setup, exports). |
| Microsoft Graph | v1.0 | Optional SharePoint storage. |

## 4. Known vulnerabilities in third-party components

**Audit of this build** (`pnpm audit --json` on `pnpm-lock.yaml` at the Validation Package pull request, 27 October 2026): **0 advisories** at every severity over 370 resolved packages. The audit is repeated every day by the scheduled vulnerability check, which updates dependencies within their semver ranges, adds `pnpm.overrides` for transitive findings, runs a secret scan and opens a pull request; CI installs with `--frozen-lockfile`, so no unreviewed version reaches a build.

| Component | Advisory | Severity | Affected / fixed version | Handling | Status |
|---|---|---|---|---|---|
| — | No open advisory in the lockfile of this build | — | — | — | — |

Advisories found later are listed here with the GHSA / CVE identifier that `pnpm audit` prints, the affected and fixed versions, and the handling (update, override, or accepted with the reason and the KB number in [KNOWN-ISSUES.md](KNOWN-ISSUES.md)). Vulnerabilities that are not dependency advisories — findings of the code analysis and penetration test — are in [SECURITY-ASSESSMENT.md](SECURITY-ASSESSMENT.md) §2.2.

**Component-level security notes** (not advisories, from the assessment):

- Electron 44.9.3 bundles its own Chromium and Node.js; the main window runs with context isolation, sandbox and no Node integration (DSK-02). Updating Electron is the way to take Chromium security fixes; the daily check updates it within the 44.x range, a major update is a reviewed change.
- @azure/msal-browser 5.26.0 keeps the Entra session in `sessionStorage`; the requested Graph scope is broader than needed (SECURITY-ASSESSMENT.md PT-13).
- react / react-dom 19.3.1 neutralise `javascript:` URLs in `href` and escape text content; the app uses no `dangerouslySetInnerHTML`.
