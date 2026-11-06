# Release notes

Version history of the I&D Quality Demand Planning app, newest first. Every merged change bumps the version in `package.json` and adds its entry here, in the same pull request (CI-09; [CONFIGURATION-MANAGEMENT.md](CONFIGURATION-MANAGEMENT.md) §4): **major** for a change that breaks existing data, shared setup files or the way users work; **minor** for a new or changed feature; **patch** for a fix, a dependency update or documentation only. `pnpm test` fails when the newest version here is not the version in `package.json`. CI tags each version `vX.Y.Z` on its merge commit and publishes its GitHub release with the installers and this entry (CI-10); the build number of a version is the CI build of that merge (shown in the app under Force Update, and in `latest.json`). Open bugs and accepted limitations of every version are in [KNOWN-ISSUES.md](KNOWN-ISSUES.md); the third-party components of every version are in [SWBOM.md](SWBOM.md).

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
