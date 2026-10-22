# Demand Planning Hub — Test Plan

| | |
|---|---|
| Document | TP-DPH-001 |
| Tests | [REQUIREMENTS-SPECIFICATION.md](REQUIREMENTS-SPECIFICATION.md) (SRS-DPH-001) |
| Product version | v1.2.2; record the build number under test in every result |
| Status | For review |

## 1. Purpose and scope

This plan verifies every requirement in SRS-DPH-001 and covers all of its use cases. The coverage includes the negative cases and boundary values of each acceptance criterion. It defines:

- the test levels;
- the test data;
- the test cases (§6), each traced to requirement IDs;
- the coverage matrix (§7), which shows that every requirement has at least one test case.

Out of scope:

- load testing beyond NFR-02;
- penetration testing;
- validation of Azure DevOps process rules (which states a process allows).

## 2. Test levels

| Level | What | How | Evidence |
|---|---|---|---|
| L1 Unit | Pure functions (month detection, capacity, baselines, query layout, validation, storage, updater) | `pnpm test` (Node test runner, `tests/*.test.mjs`) | CI log of the build under test |
| L2 Static | Types, lint, version | `pnpm lint`, `tsc -b`, `scripts/verify-version.mjs` | CI log |
| L3 System (manual) | UI behaviour in the browser and the desktop app, against TD-01…TD-06 | Steps in §6 | Result table (§8) plus screenshots |
| L4 Acceptance (UAT) | Use cases performed by non-developer users | Selected §6 cases marked **UAT** | Signed UAT record |

A requirement whose verification method is T is satisfied by an L1 test where §7 names one. Otherwise an L3 case satisfies it. Requirements with method D are satisfied by L3 cases, and those with method I by inspection cases (prefix `TC-INS`).

## 3. Environments

| ID | Environment |
|---|---|
| ENV-W | Latest Chrome or Edge on Windows 11, app at the GitHub Pages URL |
| ENV-M | Latest Chrome or Safari on macOS, app at the GitHub Pages URL |
| ENV-DW | Desktop app (Windows) installed from `desktop-latest` |
| ENV-DM | Desktop app (macOS) installed from `desktop-latest` |
| ENV-L | Local `pnpm preview` build, for destructive storage tests |

For every L3 test, start from a clean browser profile unless the case says otherwise.

## 4. Test data

| ID | Data | Contents |
|---|---|---|
| TD-01 | Synthetic sample | "Load synthetic sample" (deterministic): 6 people, 9 Epics, 14 Features, absence Epic 37778, holidays for India, Netherlands and US, DHFI release documents, 5 release scopes |
| TD-02 | Azure DevOps test project | A project with a team backlog containing the fixture items in TD-02a. Use a PAT with Work Items Read & Write. |
| TD-03 | Git test repository | A private repository with an empty branch `main`, plus a fine-grained token with Contents: Read and write |
| TD-04 | SharePoint test site | A test site and an SPA app registration, where available. Otherwise mark SNP cases "Not run — no environment". |
| TD-05 | Backup files | (a) a valid export; (b) `[]`; (c) schemaVersion 2; (d) `people` not an array; (e) an Azure item without `title`; (f) a file over 200 MB |
| TD-06 | Desktop releases | Two consecutive `desktop-latest` builds (N installed, N+1 published) |

**TD-02a fixture items.** "Me" is the tester's email.

| Ref | Type | Title | Parent | Assigned | Notes |
|---|---|---|---|---|---|
| E1 | Epic | DP | — | — | stream with a baseline rule |
| F1 | Feature | DP \| Core \| v5.1 | E1 | Me | pending |
| S1 | User Story | anything random | F1 | Me | holds T1 |
| T1 | Task | October 2026 \| DP | S1 | Me | OE 10, CW 4 |
| T2 | Task | DP - Oct 2026 | S1 | Me | trailing month |
| T3 | Task | 2026-10 · numeric | S1 | Other person | |
| T4 | Task | Notes for October 2026 review | S1 | Me | month in the middle: not counted |
| T5 | Task | Octopus 2026 | S1 | Me | not a month |
| S2 | User Story | DP \| Core \| v5.1 - Time Writing | F1 | Me | empty Time Writing story |
| T6 | Task | General admin | S2 | Me | no month |
| T7 | Task | November 2026 \| orphan | — | Me | no Feature |
| S3 | User Story | Past sprint story | F1 | Me | iteration = a past Sprint |
| S4 | User Story | Future sprint story | F1 | Me | iteration = a future Sprint |
| S5 | User Story | PI only story | F1 | Me | iteration = PI (undated) |
| A1 | Epic | Absence & Leave (id = absence Epic) | — | — | |
| AF | Feature | Public Holidays - India | A1 | — | holds a story with "October 2026 \| Gandhi Jayanti" CW 8 |

## 5. Entry and exit criteria

**Entry**

- CI is green on the commit under test.
- The build number is recorded.
- TD-01 is available. TD-02 is available for the Azure cases.

**Exit**

- Every Must requirement has a passing test case.
- No open defect of severity Critical or High.
- Every failed Should or Could case has a logged defect or an accepted deviation.
- §8 is completed, with the build number.

**Severity scale**

- **Critical**: data loss, or an unintended Azure DevOps write.
- **High**: a Must requirement fails.
- **Medium**: a Should requirement fails.
- **Low**: a Could requirement fails, or a cosmetic issue.

## 6. Test cases

Format:

- **Req**: the requirements covered.
- **Pre**: preconditions.
- **Steps**: numbered actions.
- **Expected**: the acceptance criteria. Every bullet must hold for a Pass.

Cases marked **UAT** are also run in acceptance testing.

### 6.1 Navigation and layout

**TC-NAV-01 Sidebar groups and order** — Req NAV-01…04, NAV-07 — **UAT**
- Pre: TD-01 loaded.
- Steps:
  1. Open the app.
  2. Read the sidebar top to bottom.
- Expected:
  - The groups read "Overview", "My Work", "Azure DevOps", "Data & governance", in that order.
  - "My Work" holds "Assigned to Me", "Bulk actions", then "Monthly Time Writing".
  - "Data & governance" holds "Baselines", "Snapshots", "Settings", "Documentation".
  - No "Work items", "Feature milestones" or "Migration" entry exists.
  - Azure DevOps views are separate entries, with no tab row on their pages.

**TC-NAV-02 Azure DevOps group follows the views** — Req NAV-05, NAV-06, CON-10…12
- Pre: Clean profile.
- Steps:
  1. With no connection and no data, open the app.
  2. Add a time-tracking connection with Show in menu off.
  3. Add a backlog-view connection "Digital Platform" with Show in menu on.
  4. Set its View name to "DP view".
- Expected:
  - Step 1: "Azure DevOps" lists "QMS-0025".
  - Step 2: the group is hidden (no views).
  - Step 3: it lists "Digital Platform" only.
  - Step 4: it lists "DP view".

**TC-NAV-03 Header content and month picker** — Req NAV-08…12
- Pre: TD-01 loaded.
- Steps:
  1. Visit every page.
  2. Note the header items.
  3. On Overview, type `2026-13` and then `2026-09` in the month picker.
- Expected:
  - The header shows only the title, the Team/Individual switch (Overview and Monthly only), the data chip with ↻, the month picker (on Overview, Monthly, Baselines, Snapshots and Settings only; not on Documentation), and the theme toggle.
  - Hovering the title shows the page description.
  - No page repeats a header inside its content.
  - `2026-13` is not accepted. `2026-09` updates the page.
  - On first load the month is the current India month.

**TC-NAV-04 Notices once, below the header** — Req NAV-13, FET-12…14
- Pre: Clean profile.
- Steps:
  1. Open Overview, then Monthly, then a Settings section.
- Expected:
  - "No source data loaded yet." appears once, below the header, on each page, and nowhere else on the page.
  - The chip reads "No data".

**TC-NAV-05 Sidebar footer** — Req NAV-14, NAV-15
- Steps:
  1. Read the sidebar footer.
  2. Make a change, such as saving capacity settings.
- Expected:
  - The footer shows "v1.2.2", "Build {n} · ID {id}", and the build time.
  - The storage label changes to "◌ Saving locally" and then to "○ Local IndexedDB".

**TC-NAV-06 Modal above content** — Req NAV-16 — **UAT**
- Steps:
  1. Open "↻ Force Update".
  2. Scroll the mouse wheel.
  3. Repeat with "⬇ Desktop app" and the connection Remove confirmation.
- Expected:
  - No card, chart or sticky header is drawn over the dialog.
  - The page behind does not scroll.
  - Closing the dialog restores scrolling.

### 6.2 Connections

**TC-CON-01 Form fields per role** — Req CON-01…03
- Steps:
  1. Open Settings.
  2. Choose "＋ Add connection".
  3. Switch "Used for" through all five roles.
- Expected:
  - The section is first, with id `settings-connections`.
  - Team appears only for Time Writing and Backlog view. Feature creator email appears only for Time Writing.
  - Show in menu turns on for Time Writing and Backlog view, and off for the other three roles.

**TC-CON-02 Validation messages** — Req CON-04…08
- Steps: save the form, each time with:
  - (a) an empty name;
  - (b) Time Writing with no team and no query;
  - (c) Backlog view with no team and no query;
  - (d) API version `7`;
  - (e) a new connection with no PAT;
  - (f) Server URL `http://tfs.local/tfs`;
  - (g) a valid on-prem server and collection.
- Expected:
  - (a)–(e) show the exact messages of CON-04…07, and nothing is saved.
  - (f) is rejected as not https.
  - (g) is saved with base URL "server/collection" and marked "On-prem" (CON-19).

**TC-CON-03 Save and refresh** — Req CON-09, FET-01, FET-04 — **UAT**
- Pre: TD-02.
- Steps:
  1. Add the Time Writing connection with a team.
  2. Press "Save and refresh data".
- Expected:
  - The connection appears with status "Fetching…" and then "Fetched".
  - The data chip shows "{n} items · just now".
  - The audit shows "Sync".
  - Reloading the browser keeps the items.

**TC-CON-04 Edit keeps the PAT** — Req CON-07, CON-14
- Steps:
  1. Edit a saved connection.
  2. Change only the View name and save.
- Expected:
  - The save succeeds without re-entering the PAT.
  - A Fetch afterwards succeeds.

**TC-CON-05 Remove and Test** — Req CON-14…16
- Steps:
  1. Press Test.
  2. Press Remove and cancel.
  3. Press Remove and confirm.
- Expected:
  - Test reports "Connection works: {project} is reachable with this PAT."
  - Cancel keeps the connection.
  - The confirmation text matches CON-15.
  - Confirming removes the connection and its view.

**TC-CON-06 Menu label and presets** — Req CON-13, CON-17
- Steps:
  1. Read the connection table.
  2. Dismiss a preset and reload.
- Expected:
  - Each row reads "In menu as "…"" or "Hidden from menu (backend only)".
  - The dismissed preset stays hidden after the reload.

**TC-CON-07 Clone a connection** — Req CON-20
- Steps:
  1. Press Clone on a saved on-prem connection.
  2. Change only the project, leave the PAT empty, and save.
- Expected:
  - The form is titled "Clone of "{name}"", with all fields copied and the name ending "(copy)".
  - The PAT label says the original's PAT will be used.
  - After saving, both connections are listed. The clone has the new project and fetches with the original's PAT, and the original is unchanged.

**TC-CON-08 Windchill host setup and connection test** — Req CON-21, CON-22 — L1 `windchill.test.mjs` (host/path rules, one GET, messages for 401, 3xx and network errors); browser check: http host rejected, page address saved as its origin and kept after reload, Test connection disabled on the web.

**TC-CON-09 Views in Git** — Req CON-23, CON-24 — L1 `view-definitions.test.mjs` (no PAT in the file, stable order, wrong files rejected, PAT order on restore, others untouched, file next to the data file); browser check with a mocked GitHub: Save writes azure-views.json without the PAT.

**TC-CON-10 On-prem view data through Git** — Req CON-25, CON-26 — L1 `git-snapshots.test.mjs` (only on-prem read-only views, no PAT in the file, digest ignores fetch times, newer-only apply, raw read and version id for large files); browser checks with a mocked GitHub: a simulated desktop fetch commits azure-data/dp.json once and reports “Unchanged” on an identical fetch; the web app with no connections loads the view from Git, shows “(desktop app, via Git)”, and Refresh says there is no PAT.

**TC-CON-11 Windchill views** — Req CON-27, CON-28 — L1 `windchill-views.test.mjs` (filter rows → OData query with escaped values and dates, validation, nested cells; desktop query paging on the same host only, errors with Windchill's message, sign-in redirect; Git snapshot without credentials, newer-only apply); browser check with a simulated desktop bridge: a view created in Settings appears under Windchill in the menu, Fetch sends `DocMgmt/Documents?$filter=startswith(Number,'DHF') and State/Value eq 'RELEASED'&$select=Number,Name,State` and shows the two results.

**TC-CON-12 Windchill sign-in window (desktop)** — Req CON-29 — L1 `windchill.test.mjs` (a login page or 401 sets the sign-in flag; Settings path in the hints) and `windchill-views.test.mjs` (a search answered with a web page reports the sign-in hint). Live result: the company sign-in refuses the app's window ("sensitive data"); setup hidden since build 144.

**TC-CON-13 Windchill search opened in the browser and imported** — Req CON-30 — L1 `windchill-views.test.mjs` (search address, result list with BOM and nulls, next-page link kept only on the same https service, web page / domain list / Windchill error reported); browser check: a sign-in page is rejected, page 1 shows Open next page, page 2 adds to 2 results.

**TC-CON-14 Windchill from the browser itself** — Req CON-31 — L1 `windchill-browser.test.mjs` (credentials sent, domain list, CORS/network failure message, sign-in page, 401, paging, OData error). Live result: blocked by CORS on the company Windchill.

**TC-CON-15 Windchill tab bookmark** — Req CON-32 — L1 `windchill-bridge.test.mjs` (one-line bookmark bound to the app origin, result checks: one-time code, known views only); browser check with a cross-origin fake Windchill: the tab returns 2 rows over 2 pages. Live result: bookmarks with code are blocked by browser policy.

**TC-CON-16 Release Details menu and Windchill exports** — Req CON-33, CON-36 — L1 `connections.test.mjs` (on-prem views marked), `windchill-export.test.mjs` (header below a title line, quoted cells, comma / semicolon / tab, repeated column names, Excel / HTML / empty files reported); browser checks: the menu shows I&D Board (QMS-0025, Scrum Master) and Release Details (DP, CP, Import Windchill export); a CSV becomes a page with the file's columns; Settings has no Windchill sections; with a mocked GitHub, Load all exports from Git adds the export and Load from Git loads a newer version or says it is the latest. **UAT**

**TC-CON-17 Load from Git, fetch fallback and the shared connection setup** — Req CON-34 — L1 `view-definitions.test.mjs` (missing connections added with the same-server PAT or view only, unchanged ones follow Git, ones changed here kept, restore makes them follow again); browser check with a mocked GitHub and an unreachable server: a fresh browser gets CP and DP from Git, Fetch without a PAT says "loaded the data saved to Git (fetched …)". **UAT**

**TC-CON-18 Baselines read-only with a read-only Git token** — Req CON-35 — L1 `git-storage.test.mjs` (no push permission, read-only fine-grained token (403 on an empty write), writable (422), unknown; the probe carries no content); browser check with a mocked GitHub: 403 shows the view-only bar and greyed-out rules without Save; 422 stays editable. **UAT**

**TC-CON-19 Duplicate Time Writing connections** — Req CON-39 — browser check with a mocked GitHub: two QMS-0025 connections show the warning; Keep … remove the other leaves QMS-0025 and DP and writes azure-views.json without the duplicate. **UAT**

**TC-CON-22 Backlog view as Time Writing; removals from Git** — Req CON-46, CON-47 — L1 `view-definitions.test.mjs` (promote: role, PAT kept, creator email and view name taken over, old one removed; sync: a connection removed in Git and unchanged here is removed once, changed here is kept, an empty file removes nothing), `git-storage.test.mjs` (delete reads the current version, one commit, missing file is not an error); browser check with GitHub and Azure DevOps mocked: a Time Writing connection with a failing PAT and a backlog view of the same project and team → the notice names both; Use as Time Writing → confirmation, azure-views.json written with only the backlog connection as Time Writing, azure-data/tw.json deleted, the fetch uses the backlog connection's PAT, one QMS-0025 entry in the menu. **UAT**

**TC-CON-20 Bulk move states and person search** — Req CON-37 — L1 `my-work.test.mjs` (New only, Active only, both; other pending states left alone); browser check on sample data: the person box lists everyone on click, "ch" narrows to Chen Wei and Enter picks him; ✕ returns to me.

**TC-CON-21 Overview by region and roles** — Req CON-38 — L1 `capacity.test.mjs` (no filter = everyone; each region gives exactly its people; several roles; region and roles together; same holidays as the team view); browser check on sample data: India gives 2 people, India · QE + Lead gives 1 and the headline follows. **UAT**

**TC-SCR-01 Backlog Health** — Req CON-40 — L1 `backlog-health.test.mjs` (ended vs running Sprint; no Sprint dates = nothing listed; DoD in the Description, not "Dodo"; open vs closed Features; unassigned with its Epic / Feature / User Story / Task, paths, state, Created By (mapped from System.CreatedBy) and Created On in the table and CSV; nothing under the absence Epic; CSV quoting, parent and List column); browser check on sample data: tabs with counts, Export CSV downloads the shown list, Export all lists adds a List column. Live check needed: the older-Sprints list with the team's real Sprint dates. **UAT**

**TC-SCR-02 Backlog Health columns, Description and person filter** — Req CON-48 — L1 `backlog-health.test.mjs` (columns and order of the Older Sprints / Unassigned CSV; Updated By mapped from System.ChangedBy; Description as plain text and its CSV column only when asked; the people of a row: Assigned To, or Created By and Updated By for unassigned work); browser check with Azure DevOps mocked: Older Sprints and Unassigned show the ten columns, Features without DoD shows the Description, the person box lists the people of the tab and narrows the rows (Ben → his 3 items in older Sprints, Ana → her Feature, Chen → the Task he updated); the box reopens on a second click after a pick. **UAT**

**TC-SCR-03 Backlog Health columns, sorting, State and Iteration filters** — Req CON-49 — L1 `backlog-health.test.mjs` (unknown and repeated columns dropped, ID kept; default columns; CSV follows the chosen columns: Epic, Sprint end, Parent, Tags, Description as plain text, URL last); browser check with Azure DevOps mocked: Columns → untick Created By / Updated By, add Epic, move Assigned To first → Apply changes the table; Assigned To header sorts Ana, Ana, Ben… then Ben… first, a third click restores the order; State "New" leaves one row; the Iteration list holds the tab's iterations; Unassigned keeps its own columns; after a reload the chosen columns are still there. **UAT**

**TC-ACC-02 New work is always assigned; creating for others** — Req CON-50, CON-51 — L1 `my-work.test.mjs` (the month story and task carry the assignee; ＋ User Story / ＋ Task go under the right parent type with the chosen email and iteration; no assignee → refused in the browser transport before sending and in the Windows app request builder; people to choose: everyone with an email, a shared name shows the email), `azure-devops.test.mjs` (every item of a new Feature hierarchy is assigned), `access.test.mjs` (Scrum Master has the right, Team Member not); browser check with Azure DevOps mocked: ＋ User Story on a Feature → the picker starts on the Feature's assignee, choosing Ben creates the story assigned to ben@x.com. **UAT**

**TC-OV-11 Overview dashboard** — Req OV-11 — L1 `dashboard.test.mjs` (periods: quarters and months of a year, none = whole year; month status; multi-select filters; person-month plan, actual, capacity, region and role, plan lines and blank actuals; filters incl. stream; planned and persistent overload; concentration; rebalancing receivers only in current or future months; streams; month-on-month change by role and stream); browser check on sample data: all eight tabs render without errors; the KPI arrows are red above and green below 100%; ticking Roles QE and Lead shows "2 selected" and narrows the scope line; Q2 adds April–June; Whole year shows the year. **UAT**

**TC-NAV-21 Pulse Check ongoing activities** — Req NAV-20 — L1 `pulse-check.test.mjs` (in-progress Features and User Stories per stream, booked hours this month, overdue; absence and finished items left out); browser check: tabs Releases (last month), Last month, Ongoing activities, Current month releases. **UAT**

**TC-NAV-22 Default streams and stream rules** — Req NAV-22, NAV-23 — L1 `streams.test.mjs` (stream order and sources; connection and export found by name; DP and IOCC release rules; fuzzy match percentages and the threshold; Pulse Check lists the five Azure streams in order with not-set-up ones); browser check on sample data: Release Details lists DP, CP, IOCC, Content, Tool Validations and S&S IT; a not-set-up stream opens Settings, whose Default streams Set up pre-fills the name and role; Pulse Check → Current month releases shows the five Azure streams in order. **UAT**

**TC-NAV-20 Pulse Check: Release Details and Last month** — Req NAV-20 — L1 `release-overview.test.mjs` (only the given Release Details views, each shown even when not fetched; a release source outside Release Details left out), `pulse-check.test.mjs` (previous month across the year; releases compared per stream; Features and User Stories opened and closed per Epic, absence and Removed left out, narrowed to a person); browser check on sample data: the tabs Releases and Last month; Last month shows the utilization metrics, Releases vs the selected month, Work closed and opened, the Overview month panels and the gaps for the previous month. **UAT**

**TC-CON-25 Configurable Time Writing story** — Req CON-57 — L1 `azure-devops.test.mjs` (a setup file without it keeps “{feature} - Time Writing”; a configured title, Area Path, Iteration Path and assignee are used and the month Task goes under that story). **UAT**

**TC-NAV-17 Menu groups and collapsing** — Req NAV-17, NAV-18, OV-10 — L1 `format.test.mjs` (Data Insights holds Overview, Pulse Check, PI Review; My Work order Assigned to Me, Monthly Time Writing, Bulk actions); browser check on sample data: the menu shows the five headings; Pulse Check shows the month's releases (Overview keeps This month and Trends); collapsing My Work and Windchill exports hides them and stays so after a reload; at 900 px width every page is still reachable. **UAT**

**TC-CON-23 Feature setup per Epic** — Req CON-52, CON-53 — L1 `azure-devops.test.mjs` (placeholders, plain text, unknown braces kept, missing values; the file is parsed and written clean; a Feature from its Epic setup gets the chosen stories, the Time Writing story and the Task with title, Original Estimate, Area Path, Iteration Path and assignee; completing again creates nothing; a placeholder the title cannot fill stops it); browser check with GitHub and Azure DevOps mocked: Settings → Feature setup, add “US 1 ({service})” and “US 4”, Original Estimate 6 → preview shows “US 1 (Service)”; Save to Git writes feature-setup.json; ＋ Feature under that Epic with “CP | Care Pathways | v3.1” lists “US 1 (Care Pathways)” and “US 4” ticked, the Task “October 2026 | CP | Care Pathways | v3.1” with 6 h, and no PU / Full Release choice. **UAT**

**TC-ATM-06 State checks and Feature states** — Req CON-54, ATM-06 — L1 `my-work.test.mjs` (all stories Closed → close the Feature, Removed ignored; all Tasks Closed → close the story; Active Feature without an Active story, or without stories → flagged; Closed Features, other people's work and the absence Epic left out; Feature New → Set to Active, Active → Close, other states → none; other types → Close); browser check with Azure DevOps mocked: Bulk actions for Ben lists his two Active Features without User Stories with a link to Azure DevOps; Assigned to Me shows Close Feature for Active Features. **UAT**

**TC-CON-24 Load everything from Git; roles by the connection email; QE Mapping** — Req CON-55, CON-41, NAV-19 — browser check with GitHub mocked: Settings → Storage → Load everything from Git reads planning-data.json, azure-views.json, azure-data, windchill-data, access.json and feature-setup.json once each and lists what was loaded; Settings → Access says "You are me@x.com (the email on your Time Writing connection)"; QE Mapping appears under Data & governance with its planned notice. **UAT**

**TC-ACC-01 Roles and access** — Req CON-41, CON-42, CON-43, CON-44 — L1 `access.test.mjs` (no policy = no restrictions; union of roles; default role for unknown or unlisted email; no default role = nothing; Backlog Health only for its roles; unknown roles, areas, actions and invalid emails dropped; broken file refused; the editor cannot remove their own "manage access"; a role without "change work items" is refused before anything is sent while reads still work); browser check with mocked GitHub and Azure DevOps: email shown from the connection's email field, Set up roles → add a member, tick Scrum Master → Save to Git commits access.json once; with a cached Team Member policy the menu has no Backlog Health, Bulk actions, Release Details, Baselines or Snapshots and Settings shows only Azure DevOps, Storage and Access. **UAT**

**TC-NAV-12 Freshness in the viewer's time zone** — Req NAV-12 — L1 `format.test.mjs` and `app-update.test.mjs` (the same instant in Asia/Kolkata, America/New_York and UTC; local "today"); browser check in America/New_York: a fetch at 09:00 UTC shows "05:00 AM EDT".

**TC-OV-10 Releases summary, tracking Feature and local approval dates** — Req QV-18, QV-19, OV-10 — L1 `release-overview.test.mjs`, `format.test.mjs`, `release-source.test.mjs` (the same UTC instant is 30 September in New York and 1 October in India); browser check in Asia/Kolkata with CP, DP and IOCC loaded from Git: October shows three stream quadrants and the total (3 releases, 4 documents); September shows the CP release approved 29 Sep 18:30 UTC as “September 30, 2026”, in both the quadrant and the CP view.

**TC-INS-01 Credentials storage** — Req CON-18, STO-09, NFR-05, NFR-07
- Steps:
  1. Inspect `azureCredentials.ts`, `gitStorage.ts` and `domain.ts` (AppState).
  2. Export a JSON backup and search it for the PAT and the Git token.
  3. Check the PAT fields' input types.
  4. Search the repository for tokens.
- Expected:
  - The PAT exists only in localStorage `demand-planning-azure-connection-profiles-v1`.
  - The backup contains neither token.
  - PAT inputs are `type="password"`.
  - No secret is in the repository.

### 6.3 Fetch and auto-save

**TC-FET-01 Query fetch with parents** — Req FET-02, FET-03
- L1: `connections.test.mjs` (query paging, parent backfill), `azure-devops.test.mjs` (batches of 200, no partial import).
- L3:
  - Steps: set a query selecting only T1 and fetch.
  - Expected: T1, S1, F1 and E1 are saved.

**TC-FET-02 Empty result is not auto-saved** — Req FET-05, FET-06, FET-13 — **UAT**
- Pre: TD-02 fetched.
- Steps:
  1. Change the query to one that returns nothing.
  2. Fetch.
  3. Press Discard.
  4. Fetch again and press "Save preview — replace Azure cache".
- Expected:
  - Step 2: the saved items are unchanged, the FET-05 message shows, and the chip reads "Unsaved result".
  - Step 3: "Preview discarded. Previously saved work items are unchanged."
  - Step 4: the cache is now empty and the audit shows "Sync".
  - Changing the connection before step 4 gives the FET-06 message instead.

**TC-FET-03 Read-only and release sources stored** — Req FET-07, FET-08
- Steps:
  1. Fetch a backlog-view and a release-source connection.
  2. Reload.
- Expected:
  - Each view shows its items and its fetch time after the reload.
  - The Settings "Fetched read-only sources" table lists the backlog view.

**TC-FET-04 Fetch all and ↻** — Req FET-09…11
- Steps:
  1. With 3 connections, press ↻ in the header.
  2. Press it again while busy.
- Expected:
  - The connections are fetched one after another, with their status shown.
  - ↻ is disabled while busy.
  - A second Time Writing fetch is refused (L1).

**TC-FET-05 Fetch failure keeps data** — Req FET-15, FET-17
- Steps: set an invalid PAT and fetch.
- Expected:
  - The error ends with "Previously loaded data has been retained."
  - The item count is unchanged.
  - The Azure DevOps project history shows no change (FET-17).

**TC-FET-06 Unscoped cache hidden** — Req FET-16
- L1: `azure-devops.test.mjs` (scoped cache, no project fallback).

**TC-FET-08 Cloud fetch at start** — Req FET-20, CON-45 — browser check with Azure DevOps mocked: with a cloud Time Writing connection and an on-prem connection, opening the app sends the cloud fetch once and nothing to the on-prem server; a rejected PAT shows the usual error and keeps the saved data. Settings shows one tab at a time, the shared tabs only with "manage shared settings", and reopens on the last tab; "Fetch work items from Azure DevOps →" opens the Azure DevOps tab. Live check needed: the QMS-0025 data refreshes after Force Update. **UAT**

**TC-FET-07 Query fields and names** — Req FET-18, FET-19, QV-04
- L1: `query-view.test.mjs` (`pickFields`, `columnName`).
- L3:
  - Steps: a query selecting `[Microsoft.VSTS.Common.Priority]`.
  - Expected: the column heading is "Priority", and identity fields show display names.

### 6.4 Time Writing naming

**TC-TWN-01 Month detection table** — Req TWN-01…06 — L1 `azure-insights.test.mjs`, `monthly-hours.test.mjs`. Plus L3 with TD-02a: T1, T2 and T3 count for October 2026; T4 and T5 do not.

| Title | Expected month |
|---|---|
| `October 2026 \| DP` | 2026-10 |
| `Oct 2026 - DP` / `oct.2026_DP` / `OCT2026 DP` | 2026-10 |
| `Sept 2026 \| x` | 2026-09 |
| `2026-10 \| x` / `2026/10 x` / `2026.1 x` | 2026-10 / 2026-10 / 2026-01 |
| `DP \| October 2026` / `DP - Oct 2026)` / `DP 2026-10` | 2026-10 |
| `May 2026 \| DP \| June 2026` | 2026-05 (leading wins) |
| `Notes for October 2026 review` | none |
| `Octopus 2026` / `Mayday 2026` | none |
| `2026-13 x` / `202610 x` | none |

**TC-TWN-02 Feature and Epic from the chain** — Req TWN-07, TWN-08
- Steps: open Monthly for October 2026 (TD-02a).
- Expected:
  - T1 is shown under Epic DP and Feature F1 ("DP | Core | v5.1"); the story's name plays no part.
  - S2 counts as a Time Writing story by its title.

**TC-TWN-03 Story placement plan** — Req TWN-09 — L1 `monthly-hours.test.mjs` (month-task placement).

| Case | Expected |
|---|---|
| My October Task exists under any story | exists (reuse) |
| Only S2 (exact "{Feature} - Time Writing") | use S2 |
| Two exact stories | conflict |
| One story holding my month Tasks, no exact | use it |
| Two stories holding my month Tasks | conflict |
| One Time Writing story only | use it |
| Several Time Writing stories, none of the above | conflict |
| No story | create |

### 6.5 Monthly Time Writing

**TC-MON-01 Scope switch** — Req MON-01…03, MON-19 — **UAT**
- Steps:
  1. Open Monthly with Me set.
  2. Switch to Team.
  3. Reload.
  4. Clear Me (no creator email) and choose Individual with no person.
- Expected:
  - Individual is the default, showing only my Tasks (T1, T2).
  - Team shows T3 too.
  - The choice survives the reload.
  - Step 4 shows the MON-03 notice and no rows.
  - The gaps panel lists only my stories in Individual mode.

**TC-MON-02 Metrics and table** — Req MON-04, MON-05, MON-08
- Expected:
  - The four metrics show for the month.
  - The columns are as in MON-05, and the links open the Azure items.
  - The planning and actuals pills show.

**TC-MON-03 Lock boundaries** — Req MON-06, MON-07, MON-09, MON-10. L1 for the rule, plus L3 with the system clock or the period settings:

| Situation | Planning (OE) | Actuals (CW) |
|---|---|---|
| Before M-05 23:59:59, no record | open | open |
| At M-05 23:59:59 exactly | locked | open |
| After M-05, extension M-10, now M-07 | open | open |
| Explicit planning lock, before M-05 | locked | open |
| Explicit lock + active extension | locked (see OI-03) | — |
| At (M+1)-05 23:59:59, no record for M+1 | locked | locked |
| Task tagged ad-hoc, planning open | disabled | open |

**TC-MON-04 Staging, validation and save** — Req MON-11…14, MON-16, MON-17 — **UAT**
- Steps:
  1. Change T1's CW to 6. "Staged changes" becomes 1.
  2. Press "Discard staged changes": the value reverts.
  3. Stage CW `-1` and save.
  4. Stage CW `abc` and save.
  5. Stage CW 6 and save.
  6. With a PAT removed, check the button.
- Expected:
  - Steps 3 and 4 show the MON-12 message, and Azure is unchanged.
  - Step 5 shows "Saving and refreshing…". Azure T1 then shows CW 6 and only CW changed in its history. The data refreshes, and staged returns to 0.
  - In step 6 the button is disabled.

**TC-MON-05 Locked-field rejection** — Req MON-13
- Steps:
  1. Stage OE on a Task while planning is open.
  2. Lock planning in Settings.
  3. Save.
- Expected: the MON-13 message shows, and no Task is written.

**TC-MON-06 Ad-hoc tagging** — Req MON-15
- Pre: Planning locked. Under S1 there is a Task "October 2026 | ad-hoc test" with no Original Estimate.
- Steps: stage CW 2 and save.
- Expected:
  - Azure adds the tag `ad-hoc`.
  - The row's tag shows "ad-hoc", and its OE input is disabled.

**TC-MON-07 Gaps panel** — Req MON-18
- Expected (TD-02a, October 2026):
  - (a) S2 is listed as a Time Writing story with no October Task.
  - (b) T6 is listed under "without a month in the title", and so are T4 and T5, because S1 is a Time Writing story.
  - (c) A November case (T7) appears when November is selected, with "parent: none".
  - The title shows the total count.

### 6.6 Assigned to Me

**TC-ATM-01 Identity and matching** — Req ATM-01…03
- L1: `my-work.test.mjs`.
- L3 steps:
  1. With no creator email and no chosen name, open the page.
  2. Choose a person.
  3. Reload.
- Expected:
  - Step 1 shows "Who are you in Azure DevOps?".
  - Step 2 shows their work, and the choice survives the reload.
  - Email match takes precedence over name match (L1).

**TC-ATM-02 Pending list** — Req ATM-04, ATM-05
- Expected:
  - Closed, Resolved and Done items, Epics and absence items are absent.
  - The list opens on the Feature chip and is always in ascending ID order, on every chip.
  - The type chips filter the list and show counts.
  - The bulk panels are not on this page. "Bulk actions →" on the month-tasks metric opens the Bulk actions page, whose lists are also in ascending ID order.

**TC-ATM-07 Search all assigned work and Info** — Req ATM-15, ATM-16
- L1: `my-work.test.mjs` (blank search shows everything; ID with or without #; Feature title, Epic, Iteration Path, type and state match; every word must match).
- Browser check on sample data: on the Feature chip, typing "task" lists the Tasks (all types searched, no chip highlighted, "N of M match, all types"); Esc clears it and the Feature chip applies again; a search with no match says “Nothing matches … in any type”. Hovering "ⓘ Info" shows the list rules; moving away hides them.

**TC-ATM-03 Close an item** — Req ATM-06 — **UAT**
- Steps:
  1. Press Close User Story on a Story (on a New Feature: Set Feature to Active, then Close Feature).
  2. Cancel at the confirmation.
  3. Repeat and confirm.
- Expected:
  - Cancel writes nothing.
  - Confirm writes only State, after which the item leaves the list on refresh.
  - A state the process rejects shows Azure's error.

**TC-ATM-04 Current Sprint and move** — Req ATM-07…09, OI-08 — **UAT**
- Pre: TD-02a with S3 (past), S4 (future) and S5 (PI only).
- Steps:
  1. Press "Find current Sprint".
  2. Choose the target.
  3. Untick nothing and press Move.
- Expected:
  - Only S3 is offered. S4, S5, Features and Tasks are not.
  - After confirmation only S3's Iteration Path changes, and the result shows "1 moved".
  - With no dated current Sprint, the ATM-07 message shows.

**TC-ATM-05 Month tasks** — Req ATM-10…12, TWN-09 — **UAT**
- Pre: F1 has no Task of mine for the current month. Remove T1 and T2 for this case, or run it in a later month.
- Steps:
  1. Press Create.
  2. Press it again.
  3. Clear the creator email and try.
- Expected:
  - Step 1 creates one Task "{Month YYYY} | {F1 title}" assigned to Me, under the story chosen by TWN-09 (S2 here), and creates no new story.
  - Step 2 shows status "Has task", and the button creates nothing.
  - Two exact stories show "Choose story", with the checkbox disabled.
  - Step 3 shows the ATM-12 message.

**TC-ATM-06 Blocked writes** — Req ATM-13, ATM-14
- Steps: load TD-01, then open the page.
- Expected:
  - The notice "Synthetic sample data is loaded: changes to Azure DevOps are disabled." shows.
  - Set, Find current Sprint, Move and Create are disabled.
  - At most 8 result notices are kept.

### 6.7 Time Writing backlog

**TC-BKL-01 Tree** — Req BKL-01…03, BKL-12
- Expected:
  - An Epic → Feature → Story → Task tree with the heading "QMS-0025" (or the View name).
  - Removed items are absent.
  - A changed column preference survives a reload.
  - "Source details and dates" lists at most 100 rows and searches by ID, title, type and state.

**TC-BKL-02 Create Feature hierarchy** — Req BKL-04…09, BKL-11 — **UAT**
- Steps:
  1. Choose Add Feature under E1 and enter title `DP Core` (invalid).
  2. Enter `DP | Core | v5.2` and choose PU.
  3. Load the schedule and pick the current Sprint.
  4. Create.
- Expected:
  - Step 1 shows the BKL-04 message.
  - The PU description and SFV, DT and IQOQ stories are offered. Full Release offers PRD as well.
  - Without a creator email, the BKL-09 message shows.
  - With a schedule that is no longer current, the BKL-08 message shows and nothing is written.
  - Success creates the Feature (assigned to the creator email), the selected milestone stories titled "SFV : Review of Deliverables (Core 5.2)" and so on, the Time Writing story, and the month Task. All are verified, and the BKL-11 message shows.

**TC-BKL-03 Complete children** — Req BKL-10
- Steps: on a Feature missing its Time Writing story, choose "Complete Feature children".
- Expected: only the missing items are created, and the Feature is not recreated.

### 6.8 Query views and Releases

**TC-QV-01 View header and first fetch** — Req QV-01, QV-02
- Expected:
  - Before the fetch: ""{name}" has not been fetched yet." with the read-only statement.
  - After the fetch: org/project, count and fetch time. The button reads "Refresh from Azure".

**TC-QV-02 Columns and order** — Req QV-03, QV-05 — L1 `query-view.test.mjs`.

| Query | Columns | Initial order |
|---|---|---|
| `SELECT [System.Id] FROM WorkItems WHERE …` | ID, Work Item Type, Title, State, Assigned To, Iteration Path | as returned |
| `SELECT [System.Id],[System.Title],[System.State] … ORDER BY [System.State] DESC, [System.Id]` | ID, Title, State | State descending, then ID ascending |

- L3 steps: click Title twice.
- Expected: the order is ascending, then descending, with empty values last. `aria-sort` follows the order.

**TC-QV-03 Summary, filters, search, CSV, limit** — Req QV-06…10
- Expected:
  - The chips count by State and Type, and the people are listed.
  - Overdue counts only open items with a target date before today.
  - "changed in 7 days" counts by changed date.
  - Clicking a chip filters, and clicking it again clears.
  - Search matches any shown column.
  - The CSV holds the filtered rows, with values containing `,` or `"` quoted.
  - More than 500 rows shows the limit note.

**TC-QV-04 Read-only isolation** — Req QV-11
- Steps:
  1. Fetch a backlog view that contains a Month Task assigned to Me.
  2. Open Overview, Monthly and Assigned to Me.
- Expected: that Task appears on none of them.

**TC-QV-05 Releases, Name/Release columns and month filter** — Req QV-12…17 — per-view snapshots: `view-sources.test.mjs`; month: `viewMonthOf` (approval date in India time, else approval-date field, else Changed Date); browser check: picker shown on read-only views and not on QMS-0025, “All months” shows every item — L1 `release-source.test.mjs` (incl. planned/booked hours per release: month Tasks only, Removed excluded, no double counting), `query-view.test.mjs`.
- L3 steps:
  1. Open the release-source view (TD-01).
  2. Open another read-only view whose items have "…\Name\Release x.y.z" in their Area or Iteration Path.
- Expected:
  - The release-source view is one page with no tabs. The Releases list is flat (no stream grouping), with Name, Release, approved date, documents, and "Tracked · n" or "Not tracked". The documents table is below it.
  - Expanding a release lists its documents.
  - DP | Dose Planning | v4.2 in the sample backlog tracks Dose Planning · 4.2, and v4.2 does not track 4.20.
  - Both views show the Name and Release columns after the ID. QMS-0025 shows neither.

### 6.9 Overview and capacity

**TC-OVR-01 Scope and tabs** — Req OVR-01…04 — **UAT**
- Expected:
  - The default is Team, and the choice is remembered.
  - Individual with no person shows "Choose whose overview to show.".
  - The tabs "This month · {Month}" and "Trends" are remembered.
  - The metrics show utilization, Overloaded, Has capacity and Absence.

**TC-OVR-02 This month content** — Req OVR-05
- Expected:
  - All the panels of OVR-05 are present for TD-01.
  - The matrix shows at most 8 streams plus Other.
  - "How utilization is calculated" is collapsed by default.

**TC-OVR-03 Trends content** — Req OVR-06…08
- Steps:
  1. Switch between 6 and 12 months.
  2. Click a month bar.
- Expected:
  - All the charts of OVR-06 render.
  - Epic colours are unchanged between 6 and 12 months.
  - The click changes the header month.

**TC-CAP-01 Capacity calculation** — Req CAP-01…09, OVR-09 — L1 `capacity.test.mjs`, `monthly-hours.test.mjs`, `azure-insights.test.mjs`. Plus L3 analysis (A) with one person in October 2026:
- 22 working days × 8 = 176 h funded.
- An India holiday of 8 h gives 168 h available.
- 84 h booked gives utilization 50%, status "Has capacity".

Boundary table (defaults 100 / 80):

| Utilization | Status |
|---|---|
| none (no bookings) | No bookings |
| 79.9% | Has capacity |
| 80% | Balanced |
| 99.9% | Balanced |
| 100% | Overloaded |

Expected (L3): an India holiday applies only to people mapped to India, and a person without a region is listed in the Resources warning.

### 6.10 Baselines

**TC-BAS-01 Release rows and calculation** — Req BAS-01…04 — L1 `baseline.test.mjs`.
- Worked example (A): CP rule 2 h × (14 + 11 × assets). With 10 assets: 2 × (14 + 110) = 248 h. With max 200, the result is 200 h, shown as "capped from 248h".
- Expected (L3, TD-01):
  - The CP v3.1 row shows growth from the 8-asset version to the 10-asset version.
  - Variance = actual − baseline.

**TC-BAS-02 Scope form** — Req BAS-05…07
- Steps:
  1. Open Set scope on a CP release (driver: assets).
  2. Leave the assets count empty.
  3. Enter 10 and save.
  4. Re-baseline with the same values.
- Expected:
  - Step 2: save is disabled, and no release type field is shown.
  - Step 3: the form shows "2h × (14 + 11 × assets) = 124 units × 2h = 248h", a version is added, and the audit shows "Baseline".
  - Step 4: the BAS-07 warning shows, saving is allowed, and the audit shows "Re-baseline".

**TC-BAS-03 Rules editor** — Req BAS-08…10
- Steps:
  1. Check that every stream row has the same fields (hours per unit, fixed units per release, driver, units per driver, maximum).
  2. Add a duplicate stream and a negative hours value, and set DP's hours per unit to 0.
  3. Save.
  4. Press "Load example values".
- Expected:
  - Step 2: a warning names DP as having no hours per unit.
  - Step 3: the duplicate stream is dropped and the negative value becomes 0, the audit shows "Update"/"BaselineRules", and "Estimation rules saved." shows.
  - Step 4: the draft changes, but nothing is saved until "Save rules".
  - A rule saved earlier with release types (old DP) reads as 0h per document after the upgrade (L1 `baseline.test.mjs`).

**TC-BAS-04 Task plan check** — Req BAS-11

| OE | CW | Flag |
|---|---|---|
| 10 | 12.5 | none (exactly +25%) |
| 10 | 12.6 | ">25%" |
| 0 | 5 | none |
| 10 | 5 | none (underrun; OI-07) |

### 6.11 Git storage

**TC-GIT-01 Config validation** — Req GIT-01 — L1 `git-storage.test.mjs`.
- L3 expected:
  - `my org` is rejected (owner).
  - `a..b` is rejected (branch).
  - `data.txt` is rejected (path).
  - `repo.git` is accepted as `repo`.

**TC-GIT-02 Connect, create, save, load** — Req GIT-02…04, GIT-06, GIT-08, GIT-12 — **UAT**
- Pre: TD-03.
- Steps:
  1. Connect with "Remember" ticked.
  2. Change a resource region.
  3. Enter a description and Save to Git.
  4. Reload the browser.
- Expected:
  - Step 1 shows "{path} does not exist yet …".
  - Step 2 shows "Unsaved changes — not yet in Git".
  - Step 3 creates a commit with the description, and the file is in the GIT-03 format.
  - Step 4 auto-loads the file, and the status reads "Synced".
  - Without "Remember", the token is absent after a browser restart.

**TC-GIT-03 Conflict and errors** — Req GIT-05, GIT-07, GIT-11
- Steps:
  1. Edit the file in GitHub, then save from the app.
  2. Replace the file with invalid JSON and load.
  3. Use a revoked token.
- Expected:
  - Step 1 gives the GIT-07 message and status "Conflict".
  - Step 2 gives the not-valid-JSON message, and nothing is loaded.
  - Step 3 gives the 401 message.

**TC-GIT-04 Sample block and disconnect** — Req GIT-09, GIT-10
- Expected:
  - With TD-01 loaded, Save to Git is refused with the sample message.
  - Disconnect removes both localStorage keys, and the repository is unchanged.

### 6.12 SharePoint and snapshots (requires TD-04)

**TC-SNP-01 Connect and central save** — Req SNP-01…03
- Expected:
  - Saving without a client ID gives "Application (client) ID is required."
  - Connecting to an empty site offers "Initialize central data".
  - A change is saved after about 900 ms, with "Saved to SharePoint at …".
  - A save after a concurrent change gives the SNP-03 message.

**TC-SNP-02 Snapshot upload** — Req SNP-04…07 — L1 `cloud-snapshots.test.mjs`.
- Expected (L3):
  - The buttons are disabled when disconnected.
  - An LTE snapshot creates "{month}-LTE-{id}.json" in "…/Snapshots".
  - Success is reported only after the read-back.
  - The file contains exactly the SNP-05 data fields.

**TC-SNP-03 History** — Req SNP-08
- Expected:
  - Only matching files are listed, newest first.
  - A non-matching file placed in the folder is not listed.

**TC-SNP-04 Exports** — Req SNP-09, STO-06
- Expected:
  - The CSV downloads as `demand-planning-{month}.csv`.
  - The JSON downloads as `demand-planning-backup-YYYY-MM-DD.json`.

### 6.13 Settings

**TC-SET-01 Sections and capacity** — Req SET-01…04
- Steps:
  1. Use each section link.
  2. Set capacity below % to 120 with overloaded at 100, and save.
  3. Set valid values and save.
- Expected:
  - Each link scrolls to its section.
  - Step 2 stores 80 and 100 (OI-05).
  - Step 3 writes the audit "Update"/"CapacitySettings".

**TC-SET-02 Period control** — Req SET-05, SET-06, OI-01, OI-02
- Steps:
  1. Lock and unlock planning with a reason.
  2. Set Extend until.
- Expected:
  - Each toggle is audited, with the reason as the detail.
  - The extension is stored as the chosen date at 23:59:59.
  - The Monthly page reflects it per TC-MON-03.

**TC-SET-03 Resources** — Req SET-07…09, CAP-09
- Steps:
  1. Set a region, role and manager.
  2. Make A report to B and B report to A.
- Expected:
  - Each change is audited.
  - A person cannot be chosen as their own manager.
  - The circular message lists A and B.
  - The holiday notice lists the regional holidays.

**TC-SET-04 Master data, audit, reset** — Req SET-10…12, OI-06, OI-09
- Expected:
  - An added value appears with "Active".
  - Audit shows the 8 most recent entries.
  - Reset replaces the data (run on ENV-L only).

### 6.14 Storage and recovery (ENV-L)

**TC-STO-01 Save and load order** — Req STO-01, STO-02, NFR-02 — L1 `browser-state.test.mjs`. Plus a manual check with `tests/browser-storage-preview.html` (14,000 records).

**TC-STO-02 Read failure never seeds** — Req STO-03 — L1 `browser-state.test.mjs`.
- L3 steps: block IndexedDB in site settings and reload.
- Expected: the STO-03 message and the retry button show, and no seed data replaces anything.

**TC-STO-03 Save failure** — Req STO-04, STO-05
- Steps:
  1. Simulate a quota failure with DevTools storage override.
  2. Make a change.
  3. Close the tab while saving.
- Expected:
  - The global error shows with both buttons.
  - The browser warns before leaving the page.

**TC-STO-04 Restore validation** — Req STO-07, STO-08 — L1 `browser-state.test.mjs`.
- L3: restore each file in TD-05.
- Expected:
  - (a) restores after the checkbox is ticked.
  - (b)–(f) are each rejected with the message of STO-07, and the data is unchanged.
  - Restore is refused while SharePoint is connected.

### 6.15 Web update

**TC-UPD-01 Build metadata** — Req UPD-01, CI-05 — L1 `app-update.test.mjs`.
- Inspection: `dist/build-info.json` and the `<meta name="app-build-id">` tag exist after the build.

**TC-UPD-02 Force Update flow** — Req UPD-02…06 — **UAT**
- Steps:
  1. Open Force Update while a fetch runs.
  2. Leave a preview unsaved.
  3. Export, then tick the acknowledgement.
  4. Press "Force reload now".
- Expected:
  - The block reasons appear in the UPD-03 order.
  - After the reload the build number equals the deployed one.
  - IndexedDB data, connections and column preferences are retained.
- L1 covers the propagating-HTML refusal and the fetch options.

### 6.16 Desktop app

**TC-DSK-01 Download dialog** — Req DSK-01
- Expected:
  - The dialog offers both installers, with the detected OS marked "Recommended for this computer".
  - The links point to `desktop-latest`.
  - Inside the desktop app, the button shows only "Desktop app".

**TC-INS-02 Window hardening and IPC** — Req DSK-02, DSK-03, NFR-06
- Inspect `electron/main.cjs`.
- Expected: the webPreferences values, the window-open handler, `trustedSender` on every IPC handler, and the window size and minimum size.

**TC-DSK-02 Proxy constraints** — Req DSK-04…06, IF-02, NFR-03…05 — L1 `azure-devops.test.mjs`, `connections.test.mjs`, `my-work.test.mjs`.
- Expected:
  - An unknown operation gives "Only read operations are supported."
  - An effort write rejects fields other than OE, CW and Tags.
  - A 3xx gives the sign-in message.
  - A 400 version error falls back to 6.0 and then 5.0.
  - The PAT is replaced by "[redacted]".
- L3 on ENV-DW against an on-prem server where available (OI-13).

**TC-DSK-03 Self-update** — Req DSK-07…10 — **UAT** — L1 `desktop-update.test.mjs` (manifest validation, build comparison, checksum mismatch deletes the file).
- Pre: TD-06.
- Steps:
  1. Start build N.
  2. Wait 5 s.
  3. Press Later and restart.
  4. Open Force Update and download and install.
- Expected:
  - The "Update available" notice appears.
  - After Later, it stays hidden until N+2 is published.
  - The download completes, and on Windows the installer starts and the app closes (on macOS the dmg opens).
  - After installing, "Up to date: build N+1 …" shows.

### 6.17 Sample data

**TC-SMP-01 Load sample** — Req SMP-01…04, FET-14 — L1 `sample-data.test.mjs`.
- Steps:
  1. From an empty state, press "Load synthetic sample".
  2. Repeat from Settings with real data saved, and cancel.
- Expected:
  - The SMP-01 message and the audit "Load sample" appear.
  - The SMP-03 banner shows, and the chip reads "Sample data".
  - Cancelling keeps the real data.
  - The Azure DevOps project shows no requests or changes.

### 6.18 Documentation

**TC-DOC-01 Documents and rendering** — Req DOC-01…03, DOC-05 — **UAT** — L1 `markdown.test.mjs` (every document in `docs/` is bundled and parses; anchors, tables, nested lists, inline formatting; link schemes).
- Steps:
  1. Open Documentation.
  2. Open each tab.
- Expected:
  - There are six tabs, matching the files in `docs/`.
  - Headings, tables, nested lists, bold text and code display formatted, with no raw Markdown characters such as `|---|` or `**`.
  - The panel shows "docs/{file} · this build".
  - Inspection: the Markdown component builds React elements and does not use `dangerouslySetInnerHTML`.

**TC-DOC-02 Links, sections and download** — Req DOC-04, DOC-06…08
- Steps:
  1. In Requirements, click the "TEST-PLAN.md §7" link.
  2. Click a section in "On this page".
  3. Press "Download .md".
  4. Reload the page.
- Expected:
  - Step 1 opens the Test plan at "7. Requirements coverage matrix".
  - Step 2 scrolls to that section.
  - Step 3 downloads a file with the document's file name and identical content.
  - After step 4 the last document opened is still shown.

### 6.19 User interface

**TC-UI-01 Theme** — Req UI-01, UI-02 — L1 `theme.test.mjs`.
- L3 steps:
  1. Click the toggle three times.
  2. Load `?theme=dark` and then reload without the parameter.
- Expected:
  - The theme cycles Auto ◐, Light ☀, Dark ☾.
  - The choice is kept after a reload, with no flash of the wrong theme.
  - The parameter's theme is kept after the reload.

**TC-INS-03 Accessibility markup** — Req UI-03, UI-04
- Inspect the components.
- Expected:
  - Icon-only buttons (↻, theme) have `aria-label`.
  - The tabs use `role="tab"` and `aria-selected`.
  - Sortable headings have `aria-sort`.

### 6.20 CI and deployment

**TC-INS-04 Workflow** — Req CI-01…04, NFR-01, IF-01, IF-03, IF-04
- Inspect `.github/workflows/build-and-deploy.yml` and the source.
- Expected: the jobs and triggers match CI-01…04, and no server component exists.

**TC-CI-01 Deployed build** — Req CI-03, CI-04
- After a merge to main:
  - the Pages site's `build-info.json` buildNumber equals the run number;
  - `desktop-latest/latest.json` has the same buildNumber;
  - its SHA-256 values equal SHA256SUMS.

## 7. Requirements coverage matrix

| Requirement | Test cases |
|---|---|
| NAV-01…04 | TC-NAV-01 |
| NAV-05, NAV-06 | TC-NAV-02 |
| NAV-07 | TC-NAV-01 |
| NAV-08…12 | TC-NAV-03 |
| NAV-13 | TC-NAV-04 |
| NAV-14, NAV-15 | TC-NAV-05 |
| NAV-16 | TC-NAV-06 |
| CON-01…03 | TC-CON-01 |
| CON-04…08, CON-19 | TC-CON-02 |
| CON-09 | TC-CON-03 |
| CON-10…12 | TC-NAV-02 |
| CON-13, CON-17 | TC-CON-06 |
| CON-14…16 | TC-CON-04, TC-CON-05 |
| CON-18 | TC-INS-01 |
| CON-20 | TC-CON-07 |
| CON-21, CON-22 | TC-CON-08 |
| CON-23, CON-24 | TC-CON-09 |
| CON-25, CON-26 | TC-CON-10 |
| CON-27, CON-28 | TC-CON-11 |
| CON-29 | TC-CON-12 |
| CON-30 | TC-CON-13 |
| CON-31 | TC-CON-14 |
| CON-32 | TC-CON-15 |
| CON-33, CON-36 | TC-CON-16 |
| CON-34 | TC-CON-17 |
| CON-35 | TC-CON-18 |
| CON-37 | TC-CON-20 |
| CON-38 | TC-CON-21 |
| CON-39 | TC-CON-19 |
| CON-40 | TC-SCR-01 |
| FET-01, FET-04 | TC-CON-03 |
| FET-02, FET-03 | TC-FET-01 |
| FET-05, FET-06, FET-13 | TC-FET-02 |
| FET-07, FET-08 | TC-FET-03 |
| FET-09…11 | TC-FET-04 |
| FET-12, FET-14 | TC-NAV-04, TC-SMP-01 |
| FET-15, FET-17 | TC-FET-05 |
| FET-16 | TC-FET-06 |
| FET-18, FET-19 | TC-FET-07 |
| TWN-01…06 | TC-TWN-01 |
| TWN-07, TWN-08 | TC-TWN-02 |
| TWN-09 | TC-TWN-03, TC-ATM-05 |
| MON-01…03, MON-19 | TC-MON-01 |
| MON-04, MON-05, MON-08 | TC-MON-02 |
| MON-06, MON-07, MON-09, MON-10 | TC-MON-03 |
| MON-11, MON-12, MON-14, MON-16, MON-17 | TC-MON-04 |
| MON-13 | TC-MON-05 |
| MON-15 | TC-MON-06 |
| MON-18 | TC-MON-07 |
| ATM-01…03 | TC-ATM-01 |
| ATM-04, ATM-05 | TC-ATM-02 |
| ATM-06 | TC-ATM-03 |
| ATM-07…09 | TC-ATM-04 |
| ATM-10…12 | TC-ATM-05 |
| ATM-13, ATM-14 | TC-ATM-06 |
| ATM-15, ATM-16 | TC-ATM-07 |
| BKL-01…03, BKL-12 | TC-BKL-01 |
| BKL-04…09, BKL-11 | TC-BKL-02 |
| BKL-10 | TC-BKL-03 |
| QV-01, QV-02 | TC-QV-01 |
| QV-03, QV-05 | TC-QV-02 |
| QV-04 | TC-FET-07 |
| QV-06…10 | TC-QV-03 |
| QV-11 | TC-QV-04 |
| QV-12…17 | TC-QV-05 |
| OVR-01…04 | TC-OVR-01 |
| OVR-05 | TC-OVR-02 |
| OVR-06…08 | TC-OVR-03 |
| OVR-09, CAP-01…09 | TC-CAP-01 |
| BAS-01…04 | TC-BAS-01 |
| BAS-05…07 | TC-BAS-02 |
| BAS-08…10 | TC-BAS-03 |
| BAS-11 | TC-BAS-04 |
| GIT-01 | TC-GIT-01 |
| GIT-02…04, GIT-06, GIT-08, GIT-12 | TC-GIT-02 |
| GIT-05, GIT-07, GIT-11 | TC-GIT-03 |
| GIT-09, GIT-10 | TC-GIT-04 |
| SNP-01…03 | TC-SNP-01 |
| SNP-04…07 | TC-SNP-02 |
| SNP-08 | TC-SNP-03 |
| SNP-09 | TC-SNP-04 |
| SET-01…04 | TC-SET-01 |
| SET-05, SET-06 | TC-SET-02 |
| SET-07…09 | TC-SET-03 |
| SET-10…12 | TC-SET-04 |
| STO-01, STO-02 | TC-STO-01 |
| STO-03 | TC-STO-02 |
| STO-04, STO-05 | TC-STO-03 |
| STO-06 | TC-SNP-04 |
| STO-07, STO-08 | TC-STO-04 |
| STO-09 | TC-INS-01 |
| UPD-01 | TC-UPD-01 |
| UPD-02…06 | TC-UPD-02 |
| DSK-01 | TC-DSK-01 |
| DSK-02, DSK-03 | TC-INS-02 |
| DSK-04…06 | TC-DSK-02 |
| DSK-07…10 | TC-DSK-03 |
| SMP-01…04 | TC-SMP-01 |
| DOC-01…03, DOC-05 | TC-DOC-01 |
| DOC-04, DOC-06…08 | TC-DOC-02 |
| UI-01, UI-02 | TC-UI-01 |
| UI-03, UI-04 | TC-INS-03 |
| CI-01…04 | TC-INS-04, TC-CI-01 |
| CI-05 | TC-UPD-01 |
| NFR-01 | TC-INS-04 |
| NFR-02 | TC-STO-01 |
| NFR-03…05 | TC-DSK-02, TC-INS-01 |
| NFR-06 | TC-INS-02 |
| NFR-07 | TC-INS-01 |
| IF-01, IF-03, IF-04 | TC-INS-04 |
| IF-02 | TC-DSK-02 |

### Use-case coverage

| Use case | Test cases |
|---|---|
| UC-01 | TC-NAV-01…06, TC-UI-01 |
| UC-02 | TC-CON-01…07, TC-CON-17…19, TC-NAV-02 |
| UC-03 | TC-CON-03, TC-FET-01…06 |
| UC-04 | TC-TWN-01, TC-TWN-02, TC-MON-01…06 |
| UC-05 | TC-MON-07 |
| UC-06 | TC-ATM-01…06, TC-TWN-03, TC-CON-20 |
| UC-07 | TC-BKL-01…03 |
| UC-08 | TC-QV-01…05, TC-FET-07, TC-CON-08, TC-CON-11…16 |
| UC-09 | TC-OVR-01, TC-OVR-02, TC-CAP-01, TC-CON-21 |
| UC-10 | TC-OVR-03 |
| UC-11 | TC-BAS-01…04 |
| UC-12 | TC-GIT-01…04 |
| UC-13 | TC-SNP-01…03 |
| UC-14 | TC-SET-01…04 |
| UC-15 | TC-STO-01…04, TC-SNP-04 |
| UC-16 | TC-UPD-01, TC-UPD-02 |
| UC-17 | TC-DSK-01…03, TC-INS-02 |
| UC-18 | TC-SMP-01, TC-ATM-06, TC-GIT-04 |
| UC-19 | TC-INS-04, TC-CI-01 |
| UC-20 | TC-DOC-01, TC-DOC-02 |
| UC-21 | TC-SCR-01 |

## 8. Result record

Copy this table for each test run. Status is one of Pass, Fail, Blocked or Not run. Every Fail needs a defect ID.

| Test case | Build | Env | Tester | Date | Status | Defect / note |
|---|---|---|---|---|---|---|
| TC-… | | | | | | |
