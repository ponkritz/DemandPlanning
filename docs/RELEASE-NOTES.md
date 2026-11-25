# Release notes

Version history of the I&D Quality Demand Planning app, newest first. Every merged change bumps the version in `package.json` and adds its entry here, in the same pull request (CI-09; [CONFIGURATION-MANAGEMENT.md](CONFIGURATION-MANAGEMENT.md) §4): **major** for a change that breaks existing data, shared setup files or the way users work; **minor** for a new or changed feature; **patch** for a fix, a dependency update or documentation only. `pnpm test` fails when the newest version here is not the version in `package.json`. CI tags each version `vX.Y.Z` on its merge commit and publishes its GitHub release with the installers and this entry (CI-10); the build number of a version is the CI build of that merge (shown in the app under Force Update, and in `latest.json`). Open bugs and accepted limitations of every version are in [KNOWN-ISSUES.md](KNOWN-ISSUES.md); the third-party components of every version are in [SWBOM.md](SWBOM.md).

## v5.5.0 — 2026-11-25

**Added**
- **My PI Review** — choose a PI, filter Features by person where allowed, and post a review to Azure DevOps. A review can also be added when closing a Feature. The next PI is suggested from Azure DevOps iteration dates (PIR-13…PIR-18, PIR-24, PIR-25, CON-113).
- **PI Review form setup** — authorized users can configure the shared form’s fields, options, defaults, and validation. PI Review also recognizes more comment headings and suggests sections from keywords when a comment has no headings (PIR-08…PIR-12, PIR-19…PIR-23, CON-114).
- **On-Demand table uploads** — download an Excel template with data validation, then preview an Excel or CSV upload and save its valid rows to Git (OND-103…OND-108).

**Updated**
- **Shared views** — Tool Owners can remove a shared view for everyone or delete it with its saved data. Removed connections can be restored, and personal views and PATs are preserved (CON-109…CON-112).

Synced Test2 through commit `e3a82b7`.

## v5.4.0 — 2026-11-25

**Added**
- **Replace values in a column** — preview and save a bulk replacement in QE Mapping or an On-Demand table. On-Demand replacements skip hidden and locked rows and record each change in row history (QEM-13, OND-21, OND-100…OND-102).

**Updated**
- **PI Review** — see each Feature’s latest comment and its date, Struggles, Learnings, and Move to Next PI in the table or drawer. These fields are read from Azure DevOps Discussions (PIR-07…PIR-10).

Synced Test2 through commit `24333e0`.

## v5.3.0 — 2026-11-25

**Added**
- **Tool Validations reporting** — browse the master and expiry lists, Tool List [TFS], Validation Documents [TFS], and custom tabs. Review due-date highlights and the current month’s status. Pulse Check, the Monthly Pack and dashboard sources use the shared validation data (TVL-01…TVL-36, MYD-15, QV-64).
- **Pulse Check reporting** — exclude selected streams from the Pulse Check totals and view cumulative completed releases by stream in the Year view (QV-66…QV-69, MYD-25).
- **Release Classification rules** — set classification rules based on the release number for bulk Feature creation (DPF-10…DPF-12).
- **PI Review** — select a PI, filter its Features and read their Azure DevOps Discussions individually or in a background job (PIR-01…PIR-06).

**Updated**
- **Release Details** — browse one alphabetical list, switch between Selected month and All months including on CP, and open source details from the page menu. Upload newer CSV exports from a Windchill page’s menu (NAV-52, QV-70…QV-72, CON-108).
- **Bulk Feature creation** — use shared mapped Epics for DP, IOCC and Content (QV-59, DPF-04, CNB-01, ADM-05).
- **Git storage** — load the active settings in Change connection, distinguish an unreadable repository from missing files, and preserve connections and PATs during the first sync after a repository switch (GIT-13, GIT-24…GIT-26).

Synced Test2 through commit `60e2518`.

## v5.2.0 — 2026-11-24

**Added**
- **Interactive HTML publishing** — export an offline copy of a table or dashboard with the selected rows, charts, KPIs and drill-down. The destination and schedule remain scoped to the publisher, repository configuration and page. Scheduled publishing checks current authorization and live data (OND-73, OND-76, OND-78, OND-79, OND-90…OND-99).
- **Personal dashboards and shared table defaults** — customize dashboard blocks and allow authorized users to publish default views for their team (MYD-14…MYD-24, UI-20…UI-23, BKL-47).
- **User guide** — open illustrated instructions and short clips made with synthetic data, alongside design documents and private tool validation downloads (DOC-12…DOC-16).

**Updated**
- **People and chart tools** — edit person profiles and access roles in the People view, arrange KPI cards with charts and add rule-based narratives (CAP-58…CAP-62, CHT-51…CHT-69).
- **Git storage** — new connections start with the updated team data repository. Existing connections can switch after confirmation (GIT-13, GIT-24).

Synced Test2 through commit `2abd8ba`. DemandPlanning release numbering is managed by its release workflow.

## v5.1.0 — 2026-11-24

**Added**
- Resize and arrange charts, choose grouped bars or KPI cards, and customize labels, colours, legends, and axes (CHT-15…50).
- Preview table pages with generated sample data, export selected charts to PDF, and publish or schedule standalone HTML to a chosen local file (OND-63…80).
- Manage dashboard view and edit permissions by role, and identify changes made by app users in verified private Git repositories (DSH-14…16, GIT-22…23).

## v5.0.0 — 2026-11-23

**Added**
- Filter On-Demand charts by period and configured fields, with viewer-specific selections and currency filtering (OND-50…60).
- Save table pages as one file per row, lock rows while editing, and hide or show pages and rows (OND-31…40, PGB-19…20, GIT-21).

**Changed**
- GitHub must confirm private storage before row data, locks, or viewer filter settings are written (OND-08, OND-31, OND-35, OND-55).
- Update all clients before converting existing table pages to row files. Conversion changes the saved format (OND-32).

## v4.3.0 — 2026-11-23

**Added**
- Show newer Git data on the affected page and reload that page from its notice (GIT-18…20).
- Enforce unique page names and improve the co-owner picker (PGB-15…18).

## v4.2.0 — 2026-11-23

**Added**
- Configure chart labels, colours, drill-down details and Pareto charts across supported views (CHT-01…14).
- Open On-Demand rows in a details drawer. Saving a row or editing page settings queues the change directly in Git (OND-27…30).

**Fixed**
- Capture the merge base when a save is queued so later edits and retries preserve changes made in the meantime (GIT-17, KB-80).

## v4.1.0 — 2026-11-23

**Added**
- Build and co-own Table or Table + Insights pages in menu groups, with Git-backed settings and rows (PGB-01…14, OND-01…26, CON-103, CON-106).
- Configure custom release streams and use consistent Release page counts, effort views and job feedback (STR-01…07, QV-62…65).
- Build On-Demand Dashboards with KPI tiles, charts and summary tables sourced from saved table pages (DSH-01…12).

**Changed**
- Assign multiple roles and explain restricted hours and move fields in Azure work item forms (CON-104, CON-105).
- Verify that Git storage is private before saving On-Demand pages, dashboards, or Page Builder menu settings, which can include work email addresses or filter values (OND-08, PGB-03, DSH-08).

## v4.0.0 — 2026-11-23

**Fixed**
- **QMS-0025 board: no extra page scrolling on Windows** — the board table no longer stops at 240 px (now 120 px, about three rows), and any page overflow the measurement misses is taken off the table, so the page does not scroll by a few pixels (BKL-45, KB-74).

TC-BKL-34.

- Removed a legacy dashboard containing embedded planning data from the public repository tree and recorded the code-review follow-up in the project backlog.

- Sync Test2's layout, Board filters, Team Overview, close workflow and Azure write-action handling (NAV-50, NAV-51, BKL-40…47, OV-15, CON-102).
- Store LTE and PI Review snapshots in the configured Git data repository (SNP-04…08). The desktop KPI tracker retains its SharePoint workbook reader.

## v3.21.0 — 2026-11-22

**Added**
- **Design documents** — browse, follow links and download the bundled as-built designs for app views, Settings, shared table defaults, runtime architecture and the module catalog from Documentation (DOC-13).

## v3.20.1 — 2026-11-22

**Fixed**
- **Desktop build** — restored the Git-storage interfaces used by shared Azure views, Epic setup, month controls and the Tool Validation Package, so clean macOS and Windows builds compile successfully.

CI-10, CI-11, CON-98, CON-99, EPS-04, MON-24.

## v3.20.0 — 2026-11-22

**Added**
- **Close confirmation** — closing a Feature or User Story now opens a focused confirmation dialog that clearly lists the selected work before the change is sent to Azure DevOps.

BKL-39.

## v3.19.0 — 2026-11-22

**Added**
- **Home navigation and activity controls** — imported the latest upstream Home tiles, profile controls, Time Writing task creation, background task action and usage views into DemandPlanning.

**Changed**
- **Safety and delivery controls** — added lazy page loading, sample-data write safeguards, content security policy coverage, removed-connection handling and the updated verification workflow.

NAV-48, NAV-49, ACT-20, ACT-22, SMP-01, CI-09, CI-11.

## v3.18.0 — 2026-11-20

**Imported upstream — tagged User Story templates**

- Added managed User Story templates that can be tagged to Epics and Release Classifications.
- Linked matching templates directly into the Feature setup and bulk creation flows.
- Retained DemandPlanning-specific storage, validation package, and release behavior.

## v3.17.0 — 2026-11-20

**Imported upstream — date-driven Feature planning and classification sets**

- Added Start Date planning and month Task generation up to a Feature's Target Date.
- Added DoD and User Story templates specific to each Release Classification, including bulk rows.
- Included the latest Azure DevOps and usability corrections while retaining DemandPlanning-specific storage and deployment behavior.

## v3.16.0 — 2026-11-20

**Imported upstream — Epic setup and personalised administration**

- Replaced fragmented Feature setup with a single Epic and Feature setup experience, including controlled inheritance and customization.
- Added Admin overview, settings search, personal views, and personal naming patterns.
- Added bulk QE selection, current on-prem field choices, and IOCC bulk-creation fixes.
- Included current dependency and security maintenance while retaining DemandPlanning-specific Git storage and release behavior.

## v3.15.0 — 2026-11-19

**Imported upstream — permissions, bulk creation, and release placeholders**

- Added the Tool Owner role and Allow/Deny/Not-set permission matrix for controlled access.
- Added IOCC bulk Feature creation and shared or personal bulk-creation Epic selection.
- Added entered CP, DP, and IOCC release-count placeholders when source data is unavailable.
- Retained DemandPlanning-specific Git storage, validation package, and web/Windows deployment behavior.

## v3.14.0 — 2026-11-19

**Imported upstream — stream Feature Epic mapping**

- Added shared settings to choose the Epic or Epics used when matching Features for DP, CP, IOCC, and Content streams.
- Matching and release views use the configured stream Epic set consistently.
- Retained DemandPlanning-specific Git storage, validation package, and web/Windows deployment behavior.

## v3.13.0 — 2026-11-19

**Imported upstream — personal release signatures and capacity clarity**

- My dashboard can show releases and documents signed by the current user in a selected period.
- Capacity uses only the configured team role, never app-access or people-manager permissions, and explains why a user is not counted.
- Added full-width PI checking in Sprint Check and refined New Activity as a pop-up.
- Retained DemandPlanning-specific storage, validation package, and web/Windows deployment behavior.

## v3.12.0 — 2026-11-19

**Imported upstream — Time Writing, Sprint Check and charts**

- Renamed the My Activities view to Time Writing and the Assigned to Me board view to My Tasks.
- Added a compact, icon-capable side menu, feature-closing workflow, and fuller Sprint Check with State fixes.
- Added chart axis names and configurable data labels, with shared display defaults.
- Included Electron 44.11.4 security maintenance while retaining DemandPlanning-specific storage, validation, and deployment behavior.

## v3.11.0 — 2026-11-18

**Imported upstream — desktop zoom controls**

- Added desktop zoom in/out controls and automatic fit-to-window scaling.
- Users can disable automatic scaling and retain their selected desktop zoom level.
- Retained DemandPlanning's controlled validation package, Git-backed planning storage, and web/Windows release pipeline.

## v3.10.0 — 2026-11-18

**Imported upstream — formula profiles, naming rules and Content bulk creation**

- Calculation profiles now support typed Excel-style utilization formulae with validation and a formula bar.
- Added editable naming patterns for Content and IOCC releases, used consistently in release views and reporting.
- Added bulk Feature creation for Content releases under Epic 22919; full (100%) matches are excluded from bulk selection.
- DP Supported reporting now includes only configured releases; included current dependency/security maintenance.

## v3.9.0 — 2026-11-17

**Imported upstream — DP bulk Feature creation**

- DP release records now expose Release Type, QE and candidate QEs.
- Added bulk Feature creation from the Epic 13946 setup, using the configured DP mapping and selected release rows.
- Retained DemandPlanning’s Git-backed storage, validation package, controlled documentation and web/Windows release pipeline.

## v3.8.0 — 2026-11-17

**Imported upstream — DP milestone planning visibility**

- DP releases without a DDT date are now shown in the months of their planned milestones, visibly excluded from completed-release counts.
- KPI Tracker remains available only through its direct route, rather than appearing in the main navigation.
- Retained DemandPlanning’s controlled document package, shared Git planning storage and web/Windows release pipeline.

## v3.7.0 — 2026-11-17

**Imported upstream — KPI Tracker and improved DP release details**

- Added a KPI Tracker that can read a SharePoint Excel workbook through the desktop bridge and store a controlled Git copy for shared reporting.
- DP tables now include Month & Year and Milestones columns; release records consistently expose the improved detail.
- Retained DemandPlanning’s Tool Validation Package, Git-backed planning storage, controlled document exports and web/Windows release pipeline.

## v3.6.0 — 2026-11-16

**Imported upstream — shared settings, calculation flexibility and reporting detail**

- Shared Git planning storage now detects changes made by other users while the app is open, and shares table defaults and release-match settings.
- Calculation profiles can be edited and reset to their built-in definitions, including a Top ÷ Bottom utilization formula builder.
- Monthly Pack now includes Projects & Services capabilities, supports long multi-line bullets, and counts capabilities in Key Takeaways.
- Content release naming now consistently follows the release Title; retained Tool Validation Package, shared storage controls and release pipeline.

## v3.5.0 — 2026-11-16

**Imported upstream — profile-based capacity inputs and people synchronization**

- People & Access can now retrieve display names and work-email values from Azure DevOps for consistent resource mapping.
- Calculation profiles now contain dedicated Funded Hours, Absence and NPRA settings; capacity cards and profile configuration are clearer and more focused.
- Included current upstream dependency/security maintenance while retaining DemandPlanning’s Tool Validation Package, Git-backed storage and web/Windows delivery.

## v3.4.0 — 2026-11-15

**Imported upstream — progressive Feature setup and Monthly Pack editing**

- Simplified Feature creation to a single progressive page: each section unlocks when its preceding details are complete.
- Added a **+** action below every Monthly Pack bullet to insert a new bullet directly in context.
- Included current dependency and security maintenance while retaining DemandPlanning’s Tool Validation Package, shared Git storage and web/Windows release pipeline.

## v3.3.0 — 2026-11-12

**Imported upstream — people, access and guided Feature creation**

- Consolidated people, access and capacity roles into a clearer Admin experience, including resource mapping and the choice to remove a person from capacity.
- Redesigned New Feature creation into four guided steps: Feature details, DoD, optional User Stories, and month estimates.
- Included current upstream security/dependency maintenance (Electron, Vite, React plugin, indexedDB test support and oxlint), while retaining DemandPlanning’s Tool Validation Package, shared Git storage and release pipeline.

## v3.2.0 — 2026-11-11

**Imported upstream — configurable calculations and insight controls**

- Added calculation profiles, including selectable funded working hours per day and a locked-figures snapshot for consistent month-level reporting.
- Added Admin-managed **Bucket rules** and **Insight thresholds**, with validation to prevent duplicate names and values.
- Improved utilization and workload calculations, including unplanned absence, and clarified labels across the dashboard and Pulse Check.
- Included upstream security/dependency maintenance while retaining DemandPlanning’s Tool Validation Package, shared Git storage and web/Windows delivery.

## v3.1.0 — 2026-11-08

**Imported upstream — capacity and workload improvements**

- Added **Team overview → Old Calculation** for a selected month: net capacity, plan, actuals, availability and utilisation by person, with a team total.
- Admins can set a shared **Standard Hours** breakdown and choose which shared-time groups count in the calculation; removed people are excluded from capacity and team totals.
- Added My Activities support for normal work Tasks, and clearer first-start guidance when an Azure DevOps fetch fails.
- Retained DemandPlanning’s Tool Validation Package, Git-backed planning/lock storage, web and Windows deployment, and private credential safeguards.

## v3.0.0 — 2026-11-07

**Imported upstream — major workflow change**
- Synced Test2 revision b75d753: standardised Feature, User Story and Time Writing Task creation so every entry point follows the same Epic setup, Area and Iteration rules.
- Added state propagation, streamlined My Activities, and a guided setup that can suggest the signed-in work email and links users to the token-creation pages.
- Included upstream dependency/security maintenance (MSAL 5.28.0, Vite 8.3.6 and undici 7.30.2), while retaining DemandPlanning’s web/Windows deployment, private Tool Validation Package and local credential protections.

## v2.0.0 — 2026-11-06

**Imported upstream — major workflow change**
- Synced Test2 revision 8497791: replaced the former Monthly Time Writing and Bulk Actions surfaces with My Activities, Sprint Check, Capacity vs Actual and Planning Overview.
- My Activities consolidates personal activity planning and reporting; the new views provide sprint hygiene and testing-focused capacity/delivery analysis.
- Retained DemandPlanning’s web/Windows deployment pipeline, private Tool Validation Package, browser-safe credentials and published-version safeguards.

## v1.11.0 — 2026-11-06

**Imported upstream**
- Synced Test2 revision 48be88a: training and leave are distinguished from the User Story or Task tags, including historical-hour imports; missing leave/training stories can be added through the monthly workflow.
- Included the upstream Personalize and View-as usability refinements, strengthened work-item field handling, and the associated validation, DFMEA, security and known-issue updates.
- Retained DemandPlanning release identity, browser/Windows deployment, private Tool Validation Package support and current monthly-lock safeguards.

## v1.10.1 — 2026-11-06

**Fixed**
- Made the browser end-to-end fixture helper platform-safe: Windows file URLs are now converted to native paths before Playwright uploads fixtures.

## v1.10.0 — 2026-11-06

**Imported upstream**
- Synced Test2 revision 01930cf: Plan and Actual lock dates now belong to the selected month in shared capacity settings, including defaults, independent early locks and audited reasons. The lock state refreshes across pages as time passes.
- Historical planning-workbook imports keep all rows while the selected cut-off is applied immediately, so moving the cut-off later includes the earlier month without a re-upload.
- Included upstream security/package maintenance, including the minimatch v9 override.
- Retained DemandPlanning's release identity, Windows/web deployment, private Tool Validation Package downloads and destination safeguards.

## v1.9.0 — 2026-11-06

**Imported upstream**
- Synced Test2 revision dd689e8: Admins can safely inspect the app as another person or role in a read-only session; all write paths are blocked while viewing as another identity.
- Resources can include Azure DevOps team members, assigned people, historical-hours people and manually added people, so mapping can be completed before time is recorded.
- Historical-workbook imports now accept the Epic/Feature number formats Excel commonly writes and identify unreadable values.
- Retained DemandPlanning's release identity, Windows/web deployment, private Tool Validation Package downloads and selected-month Plan/Actual lock persistence.

## v1.8.0 — 2026-11-06

**Imported upstream**
- Synced Test2 revision aa897ce: historical hours can be imported from the planning workbook into the private Git data repository and used in reporting before the Azure DevOps cut-off; group rows, holidays, leave and training are handled per the source data.
- Team and release reporting now treat a release as present in every month containing a dated source document; Pulse Check avoids unnecessary recalculation, and the navigation offers Expand all / Collapse all.
- Retained DemandPlanning's release identity, Windows/web deployment, selected-month Plan/Actual locks, private Tool Validation Package downloads and existing data safeguards.

## v1.7.0 — 2026-11-05

**Imported upstream**
- Synced Test2 revision e26eeb5: My dashboard as the start page; Team overview with six headline tiles and grouped analysis; personal sections, menu pins and saved filters in Git; Team insights access defaults; and calendar Quarter, Half-year and Year periods in Pulse Check. The retired hidden Insights workspace is removed.
- Imported release-title changes (no generated v prefix, existing titles still match), CP PF1.0/PF2.0 title parsing, and the dependency updates including Electron 44.10.2 and oxlint 1.91.0.
- Retained DemandPlanning's version history, destination deployment identity, private validation downloads, selected-month lock persistence and the Excel reader fix. macOS packaging remains disabled.

## v1.6.2 — 2026-11-04

**Fixed**
- Plan and Actual controls now belong to the selected work month. Defaults are the 5th of that month for Plan and the 5th of the following month for Actuals. Dates, independent Automatic/Locked/Unlocked modes and a required reason are saved explicitly, including months without an existing record.
- Save month controls persists to the configured private Git planning file when connected, with conflict detection for that month and preservation of other shared settings. Without Git, controls persist locally with a warning. Existing files without periods remain compatible; legacy same-month default Actuals dates are corrected.
- Manual Unlock now reopens entry after a deadline. Open Monthly and Task editor forms re-evaluate locks as time passes; staged saves recheck the current lock. No Azure hierarchy tagging or Access redesign is included in this fix.

## v1.6.1 — 2026-11-04

**Changed**
- Synced Test2 revision 45924db: updated build-time `@vitejs/plugin-react` from 6.1.2 to 6.2.1 and its lockfile, including semver 7.8.6. Destination version history, private validation document downloads, Excel reader fix and deployment settings are retained.

## v1.6.0 — 2026-11-03

**Added**
- Documentation → Tool Validation Package: browse, search, refresh and download the private repository's process references, blank templates, draft records and supporting registers in their existing formats, in Web and Windows Desktop. Uses Settings → Storage → Git storage; a PAT with Contents: Read on the private repository is sufficient.
- Files are retrieved on demand using authenticated GitHub API requests, including binary documents above 1 MB. Package contents and PATs are not bundled into the public app or saved in its data exports. Downloads do not indicate validation approval or execution.

## v1.5.1 — 2026-11-02

**Imported upstream**
- Synced Test2 revision e4700b5: connection backup/cleanup controls, blank Parent Epic on new Features, hardened imported links/rich text/Excel limits, and SHA-pinned GitHub Actions with Dependabot. Destination version and Windows-only deployment settings are retained.
- Synced Test2 revision 52c87da: editing a stream mapping opens its connection dialog; associated tests and documentation updated.
- Force-synced Test2 revision 6c94c9f, replacing the earlier table wrapper with its rebuilt table design and shared Table defaults settings. Destination release identity and deployment settings are retained.
- Synced Test2 revision caf75cb: multiple configurable ECP exports, QE Mapping add-row dialog with resource selection, consolidation/raw-data tabs and compact Release Details actions. Destination table controls, styling, version and release settings are preserved.

**Fixed**
- Table controls follow the app's existing theme, button shapes, spacing and menu styling. Resize guides appear on hover or focus; density stays consistent with existing tables.

## v1.5.0 — 2026-11-02

**Added**
- Shared table default across data views: adjustable widths, drag-and-drop and keyboard column ordering, selective columns, wrap text, Compact / Comfortable density and CSV / Excel export of displayed rows and selected columns. View preferences are saved per browser and table; Reset view restores defaults.

## v1.4.1 — 2026-11-02

**Changed**
- ECP's release table and its CSV name the columns **Project No** and **Project Name** instead of Release and Release name (CON-86, TC-CON-54).

### Imported upstream v1.14.0 — 2026-11-02

**Changed**
- **QRE is renamed ECP** (menu, Pulse Check, Monthly pack, Create Feature "ECP | …"); an export imported earlier as "QRE" shows as ECP (CON-83, CON-85).
- ECP reads a Location as "Parent folder/Project number Project name/Phase/…": the release is the **second folder**, shown as "<number> <name>" (e.g. "123456 Patient Monitor"), with every document under it; a leading "/" does not count, and a number that is not "PJ-…" is kept as written, never "v<number>" (CON-83, TC-CON-51).

### Imported upstream v1.13.1 — 2026-11-02

**Fixed**
- The QRE export did not reach the QRE page when its file was not called "QRE…": "＋ QRE" (and "＋ S&S IT") now import the file named after the stream, so it becomes that stream's page, Pulse Check and Monthly pack source (CON-85, TC-CON-53, KB-23).

### Imported upstream v1.13.0 — 2026-11-02

**Changed**
- **QRE**: a release is now the Location folder at index 2 whatever its name, and every document anywhere under it counts to it; a "PJ-<number> <name>" folder is still split into number and name. Folders deeper down are no longer read as projects of their own (CON-83, TC-CON-51).

### Imported upstream v1.12.1 — 2026-11-02

**Fixed**
- Leave in Bulk actions still showed "Choose story" when your leave Feature holds one story of yours per leave type (PTO, Sick Leave, Unplanned Leave): each open story of yours is now its own Leave row ("Your name › PTO"), and ticking it creates that month's Task under that story, never duplicated (ATM-26, TC-ATM-18, KB-22).

### Imported upstream v1.12.0 — 2026-11-02

**Added**
- **QRE** joins the default streams under Release Details → Windchill exports: each release is a project "PJ-<number> <name>" read from the Location path at index 2, otherwise read like S&S IT (month, Pulse Check, Monthly pack, QMS-0025 match, Create Feature "QRE | PJ-1234 Name") (CON-83, TC-CON-51).
- **BRITE** has a place at the root of Release Details, not set up yet (CON-84, TC-CON-52).

**Fixed**
- Leave in Bulk actions showed "Choose story" on a shared leave Feature where everyone keeps a story of the same title: your month Task now goes under your own story there (any title), else a new one of yours — never under a colleague's (ATM-25, TC-ATM-17, KB-21).

### Imported upstream v1.11.0 — 2026-11-02

**Added**
- Bulk actions lists your leave Features (PTO, Sick Leave, Unplanned Leave) in a separate **Leave** list, unticked and never counted as missing; tick the leave you take that month (ATM-24, TC-ATM-16).
- **＋ Time Writing Task** on every Feature and User Story row of the QMS-0025 backlog and of Assigned to Me adds this month's Task for you under that Feature, by the Bulk actions rules (BKL-22, TC-BKL-12).

**Changed**
- The QMS-0025 backlog opens filtered to you (Assigned to me ✕), with the items above and below yours; clear it to see everyone's until the next start (BKL-21, TC-BKL-12).

### Imported upstream v1.10.0 — 2026-11-02

**Changed**
- The Absence Epic is now **Team Holidays and Training** (same ID). Training under it — a Task, Story or Feature titled with "Training", such as each person's *Training - Time Writing* story — counts as NPRA, not absence; PTO, Sick Leave, Unplanned Leave and the common holidays stay absence. Bulk actions and Assigned to Me offer the month Task for your own Training story. Settings names the Epic accordingly (CAP-16, TC-CAP-06).

### Imported upstream v1.9.0 — 2026-11-02

**Fixed**
- The work email was lost after an app update (Force Update): the app read it from the first saved connection instead of the Time Writing one and then saved the empty value back (KB-20).

**Changed**
- Your work email is now a setting of its own: Settings → Azure DevOps → **Your work email**, the first section. It is not part of the Time Writing connection or the stream mapping, and updates, Git syncs and connection edits do not change it; the Time Writing connection form no longer asks for it. On the first start the email already on your Time Writing connection is taken over (CON-82, TC-CON-50; DFMEA DF-43; SECURITY-ASSESSMENT SM-22).

### Imported upstream v1.8.0 — 2026-11-02

**Changed**
- Time Writing prompts in Bulk actions and Assigned to Me now cover every Feature where you have a User Story in your name — in any state but Removed, your own Time Writing story included — as well as the Features assigned to you; before, only open stories that were not Time Writing stories counted, so Features shared with a colleague could be missed. On a shared Feature, each person's month Task goes under their own Time Writing story, never under the other person's (ATM-23, TC-ATM-15).

### Imported upstream v1.7.0 — 2026-11-02

**Changed**
- Settings is now its own menu group with one page per area (Azure DevOps, Storage, Access, Feature setup, and for shared roles Capacity & periods, Resources, Master data, Monthly pack, Audit) instead of tabs on one page; the header names the page. Long pages are split into sections shown one at a time — Azure DevOps: Servers and PATs, Stream mapping, Other views, Read-only sources, Synthetic sample; Storage: Git storage, Load from Git, Shared setup in Git, SharePoint; Capacity & periods: Capacity and absence, Holidays and common activities, Period control. The last page and section are remembered, and Get started and the menu's ＋ entries open the section they are about (SET-14, NAV-17, TC-SET-06; NAV-04 retired).

### Imported upstream v1.6.0 — 2026-11-02

**Added**
- Successor and Predecessor IDs: work items read from Azure DevOps keep the IDs of their Successor and Predecessor links (Dependency link type). A view of its own — a connection that is not a stream or a stream's data set, such as an on-prem release query — shows them as **Successor ID** and **Predecessor ID** columns, sortable, searchable and in the CSV. Stream views are unchanged (CON-81, TC-CON-49).

### Imported upstream v1.5.1 — 2026-11-02

**Fixed**
- New users got the admin's work email pre-filled on their Time Writing connection, and with it the admin's access role and "my" work (KB-19). The work email is now personal: it is never written to the shared connection setup in Git, an email in an older file is ignored, a sync keeps the email entered on the computer, and an email inherited from the file is cleared once so each user enters their own (CON-80, TC-CON-48; DFMEA DF-43; SECURITY-ASSESSMENT SM-22).

### Imported upstream v1.5.0 — 2026-11-02

**Added**
- Create Feature on every stream: the IOCC, Content and Tool Validations release tables now end with the same **QMS-0025 match** column as DP, CP and S&S IT — the matched Feature / User Story, else the closest item and **Create Feature** on every release without a Feature, titled "{stream} | {release name} | v{release}" (QV-46, TC-QV-26). Before, these streams offered it only on releases that were not tracked or matched below the threshold.

**Changed**
- The Time Writing Feature column of those tables keeps its match and hours but no longer has its own Create Feature button (one per release, in the new column).

### Imported upstream v1.4.2 — 2026-11-02

**Changed**
- Daily package update: Electron 44.10.0 → 44.10.1 (desktop runtime, patch release); tslib no longer needed in the lockfile. SWBOM regenerated (CI-08).

**Security**
- `pnpm audit`: 1 moderate finding before and after — GHSA-g3hv-75wg-m249 in the build-time minimatch 3.x, 5.x and 9.x copies of electron-builder, which have no patched release in their lines (accepted, KB-16); not shipped. Secret scan of tracked files and history: clean.

### Earlier v1.4.1 entry — 2026-11-01

**Changed**
- Pulse Check: the DP **Supported Releases** list under the release quadrants is folded by default, showing only its title and count; **Show list** opens it when needed and the app remembers the choice per viewer (QV-32, TC-QV-17).

## v1.4.0 — 2026-11-01

**Added**
- Automatic tagging: every merge to main that passes the Windows, macOS and end-to-end builds is tagged `vX.Y.Z` by CI and gets its own GitHub release with both installers, their checksums and its entry from these release notes; nobody tags by hand (CI-10, `scripts/release-entry.mjs`).

**Changed**
- CONFIGURATION-MANAGEMENT.md §2, §4, §5 and §7, README and CLAUDE.md: tagging is done by CI, not after the merge by hand.

**Known issues**
- v1.3.0 (commit `503232d`) has no tag: it was merged before tagging was automatic, and the tag could not be pushed from the development session (LIM-13).

## v1.3.0 — 2026-11-01

**Added**
- Release notes with a version history, and a configuration management plan ([CONFIGURATION-MANAGEMENT.md](CONFIGURATION-MANAGEMENT.md)); every merged change now bumps the version and adds its entry here (CI-09).
- The stream mapping set by an admin in the shared setup in Git (DP, CP, IOCC, Content, Tool Validations and DP's data sets) is enforced for every user at their next start; an admin's change is saved to Git on every Save or Set up, with **Save stream mapping to Git** to write it again (CON-79, #178).

**Changed**
- DEVELOPMENT-PROCESS.md §8 (configuration management) now points to the configuration management plan; CLAUDE.md asks for the version bump and the release-notes entry in every pull request.

## Before v1.3.0 — 17 October to 1 November 2026

Versions 1.0.0 (17 October 2026) to 1.2.2 were released without individual notes; their changes are in the Git history and the merged pull requests up to #177. The main features of that period:

- **Planning and time writing:** Monthly Time Writing with planning and actuals locks, ad-hoc tagging after the planning lock, Assigned to Me, Bulk actions (month Tasks up to the Target date, move to the current Sprint, state checks), shared-activity month Tasks, New Feature / New User Story / Edit work item forms with Discussion, background jobs.
- **Capacity and insights:** capacity model with joining and leaving dates, Dashboard, Pulse Check, Monthly pack (.pptx in the team template), Backlog Health.
- **Release details:** DP from its own query with DDT month counts and the QMS-0025 match; IOCC, Tool Validations and Windchill (S&S IT) release counting; CP release reporting from QA/QE signatures in the release-folder tree query; tree and direct-links queries; Create Feature from every release view.
- **Settings and sharing:** servers with one PAT each, stream mapping, access roles, Feature setup per Epic, shared setup in Git, QE Mapping.
- **Validation Package:** three-level requirements, generated traceability matrix, test, UAT and verification plans, DFMEA, security assessment, known issues, software components and SWBOM, development process, E2E suite, daily dependency and secret check.
