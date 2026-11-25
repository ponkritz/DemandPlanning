# I&D Quality Demand Planning — Test Plan

| | |
|---|---|
| Document | TP-DPH-001 |
| Tests | [REQUIREMENTS-SPECIFICATION.md](REQUIREMENTS-SPECIFICATION.md) (SRS-DPH-001) |
| Product version | The version in `package.json` (newest entry of RELEASE-NOTES.md); record the version and build number under test in every result |
| Status | For review |

## 1. Purpose and scope

This plan verifies every requirement in SRS-DPH-001 and covers all of its use cases. The coverage includes the negative cases and boundary values of each acceptance criterion. It defines:

- the test levels;
- the test data;
- the test cases (§6), each traced to requirement IDs;
- the coverage matrix (§7), which shows that every requirement has at least one test case.

Out of scope:

- load testing beyond NFR-02;
- penetration testing (done separately: SECURITY-ASSESSMENT.md §2);
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
| TD-04 | Git data repository for snapshots | A private test repository with a fine-grained token (Contents: Read and write) for the snapshot cases; a read-only token for the disabled case. *(The SharePoint test site is no longer needed: SharePoint is in the backlog.)* |
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
  - "My Work" holds "My Tasks [Board]", "Bulk actions", then "Monthly Time Writing".
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

**TC-NAV-03 Header content and month picker** — Req NAV-08…11, NAV-35
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
  - On first load the month is the current UTC month (NAV-51).

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
  - The footer shows "v{version of package.json}", "Build {n} · ID {id}", and the build time.
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
  - Team appears only for Time Writing and Backlog view. "Your work email (required)" appears only for Time Writing.
  - Show in menu turns on for Time Writing and Backlog view, and off for the other three roles.

**TC-CON-02 Validation messages** — Req CON-04…08, CON-19
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

**TC-OV-11 Dashboard: period, filters and six tabs** — Req OV-11 — L1 `dashboard.test.mjs` (periods: Year, Quarter and Month, see TC-OV-15; month status against today; person-month plan, actual, capacity, region, role, plan lines and blank actuals; filters incl. stream; streams and month-on-month change); browser check on sample data at 1500 px and 390 px: the tabs Summary, Insights, Months, People, Streams and Definitions open without console errors or horizontal page scroll; Months switches Recorded / Planned and hides months without entries; People groups by person, role or region; Streams shows the Epic mix and the overrun and ad-hoc Pareto for the period; each tab shows an empty state when nothing is planned or recorded. **UAT**

**TC-OV-12 Rebalancing within role and month** — Req OV-12 — L1 `dashboard.test.mjs` ("overload, persistent overload, concentration and rebalancing within role and month"; "rebalancing leaves people without a role out of the relief and receiver lists, and counts them apart"); browser check: Summary → relief needs and receivers are full width, cut at 8 rows with "Show all (+N more)".

**TC-OV-13 Insights** — Req OV-13 — L1 `insights.test.mjs` (elapsed share; month-end forecast; plan accuracy; stream momentum; resilience; unusual months; health score); browser check: every Insights section has its Info text, and the Delivery section says the Dashboard filters do not apply there. **UAT**

**TC-OV-14 One utilization model from Settings** — Req OV-14 — L1 `dashboard.test.mjs` ("bandOf and plannedOverload follow the Settings thresholds"), `insights.test.mjs` ("the Settings bands decide what counts as over capacity and balanced"); browser check: with Settings → Capacity at 90 / 70, 92% shows ↑ red, 80% green and 65% ↓ blue on every tab, and differences in hours (+ / −) carry no colour.

**TC-OV-15 Team overview period: Year, Quarter and Month drop-downs** — Req OV-15, OV-16 — L1 `dashboard.test.mjs` ("periods: Year → Quarter → Month, a hierarchy of multi-selects; nothing ticked in Year = the current year (OV-15, OV-16, TC-OV-15)"; "a saved period loads in this format and the earlier ones, keeping its months (OV-15, OV-16, MYD-08, TC-OV-15)"); E2E `shell.e2e.mjs` ("TC-OV-15: Team overview — Year, Quarter and Month are the first drop-downs of the filter row; Month follows Quarter; no year = the current year; Reset filters restores the period"); browser check at 1440 px and 390 px: Year, Quarter and Month are the first three drop-downs of the one filter row and the row wraps without horizontal page scroll; Q1 limits Month to Jan–Mar; choosing Mar and then Q2 instead of Q1 drops Mar; Reset filters returns to the header month's year and quarter and is disabled again; Year with nothing ticked counts the current year; two years ticked offer "Q1 2025" … "Q4 2026" and "Jan 2025" … months, and choosing Q4 2025 + Q1 2026 counts exactly those six months; a period saved before this change still opens with the same months. **UAT**

**TC-NAV-21 Pulse Check ongoing activities** — Req NAV-20 — L1 `pulse-check.test.mjs` (in-progress Features and User Stories per stream, booked hours this month, overdue; absence and finished items left out); browser check: tabs Releases (last month), Last month, Ongoing activities, Current month releases. **UAT**

**TC-NAV-24 Servers, PATs and stream mapping** — Req NAV-24 — L1 `connections.test.mjs` (one PAT per server: another project on the same collection uses it, changing it changes it for all, other servers untouched, fallback to the connection's own PAT), `view-definitions.test.mjs`; browser check with Azure DevOps mocked: Settings lists the two servers; saving a PAT for the on-prem server marks it saved; Set up of IOCC and CP saves and fetches them without asking for a PAT, and no PAT is stored on the connections; Pedestal is under Other views. **UAT**

**TC-NAV-25 DP releases from Pedestal and DHFI** — Req NAV-25 — L1 `dp-releases.test.mjs` (Pedestal fields read by name; a Pedestal Release Title names the release and its version; a DHFI document is dated by its approval date, else its Closed Date; every Pedestal Release is listed, dated by its DHFI documents, with "No DHFI yet" for the rest). **UAT**

**TC-NAV-26 Fuzzy Feature match** — Req NAV-26 — L1 `dp-releases.test.mjs` ("the fuzzy match ignores spacing inside words and never takes another version as the same release"; "dpReleases returns the same result for the same inputs and indexes the DHFI list by version").

**TC-NAV-27 Writes go to dev.azure.com only** — Req NAV-27 — L1 `azure-devops.test.mjs` ("writes go to dev.azure.com only: on-premises servers are read-only in the web app and in the desktop proxy"; "desktop bridge constrains credentials to Azure DevOps and rejects writes and oversized batches").

**TC-NAV-28 One PAT per server** — Req NAV-28 — L1 `connections.test.mjs` ("one PAT per server …"; "a PAT copy left on a connection by an earlier version is dropped when the server PAT is saved, replaced or removed").

**TC-NAV-29 Git sync removals** — Req NAV-29 — L1 `view-definitions.test.mjs` ("Git setup: a connection removed in Git is removed here unless changed here; an empty file removes nothing"), `git-snapshots.test.mjs`.

**TC-NAV-30 Duplicate connections** — Req NAV-30 — L1 `view-definitions.test.mjs` ("duplicate connections: same server, project, role and query …"; "duplicates: the copy from Git is kept over a preset copy and a local one; saving a duplicate is refused").

**TC-NAV-31 Phones and tablets** — Req NAV-31 — browser check at 390 × 844 and 820 × 1180: the menu opens from ☰ as an off-canvas panel with a backdrop and closes on a page change; tablets show the narrow menu rail; Dashboard tabs scroll sideways; no page scrolls horizontally. **UAT**

**TC-NAV-32 Other views in the menu** — Req NAV-32, NAV-17 — L1 `connections.test.mjs` ("Other views: read-only views and Windchill exports that are not a default stream, from the cloud or on-prem"); browser check: add an on-prem connection named e.g. "Risk register" with Show in menu on: it appears under Other views (not under Release Details), opens its view, and the heading is highlighted while it is collapsed and the view is open; with Show in menu off it disappears, and the heading is hidden when empty. **UAT**

**TC-NAV-37 Expand all / Collapse all in the menu** — Req NAV-37, NAV-17 — E2E `shell.e2e.mjs` ("TC-NAV-37: Expand all and Collapse all open and close every menu heading, and are remembered"); browser check: with a page pinned, Collapse all closes every heading while the pinned page stays; Expand all opens them; at 900px the buttons are hidden; on a phone (off-canvas menu) they work.

**TC-NAV-33 Get started pop-up** — Req NAV-33 — L1 `setup-guide.test.mjs` ("release streams: DP's Pedestal and DHFI data sets count, and the missing ones are named"; "a first-time user: Git first, the rest waits for the step it depends on"; "partly set up: Git and the connection done, the PAT is next, then Fetch"; "fully set up: nothing required left; region and streams follow the facts and who may change them"); browser check: a new browser without data opens the pop-up by itself with "Connect the shared Git storage" as the next step and the PAT and fetch steps "After the step above"; "Open Storage settings" closes it and shows Settings → Storage; the top bar shows "Setup · 0/4" and reopens it; a reload opens it again; after "Don't show again automatically" a reload does not, the Setup button still does; at 390 × 844 nothing overflows. **UAT**

**TC-NAV-38 Enter the setup values in the Get started pop-up** — Req NAV-38, NAV-33 — E2E `shell.e2e.mjs` ("TC-NAV-33: a new browser gets the Get started pop-up; dismissing it keeps it closed after a reload": the GitHub token and Azure DevOps PAT fields (hidden input) and Your work email, marked autocomplete "email"; saving the email stores it in this browser and the field goes away) — **UAT**; browser check: in a new browser, paste the GitHub token in step 1 and press Connect & load — the shared setup loads and the step shows Done; click the work email field — the browser offers your saved email; choose it, then enter the Azure DevOps PAT in step 3 — both turn Done without opening Settings; a wrong token shows the refusal in the step.

**TC-NAV-39 Email read from the token; order of the setup steps** — Req NAV-39, NAV-33 — L1 `setup-guide.test.mjs` ("a first-time user: Git first, then the connection and token, then the email (read from the token), then Fetch", "NAV-39: the work email is read from the token owner's work items (@Me): Assigned To first, then Created By, then Changed By"); E2E `shell.e2e.mjs` ("TC-NAV-33: a new browser gets the Get started pop-up; dismissing it keeps it closed after a reload": the steps' order, the email waits for the token, Detect from my token after Save PAT) — **UAT**; browser check with a real token: in a new browser, connect Git, save your PAT, press Detect from my token — your name and work email appear with where they were read (Assigned To / Created By / Changed By); Save email; with a token of someone without any work item the step says the email could not be read.

**TC-NAV-40 A short Get started with Info and token links** — Req NAV-40, NAV-33 — L1 `setup-guide.test.mjs` ("NAV-40: the token links are https only, shared in the planning data and kept through a round trip"); E2E `shell.e2e.mjs` ("TC-NAV-33: a new browser gets the Get started pop-up; dismissing it keeps it closed after a reload": the short titles incl. TFS APAC settings [DP/CP/IOCC/Content], no how-to text on the page, the GitHub and Azure DevOps token links) — **UAT**; browser check: hover Info on a step — why and how show; as an Admin with Git open Token links (admin), set the TFS APAC link and save to Git — after reload in another browser step 6 shows Create a TFS APAC PAT with that link; an http link is not kept.

**TC-NAV-41 Get started opens when the fetch fails** — Req NAV-41 — L1 `setup-guide.test.mjs` ("NAV-41: a failed fetch reopens the token step (token problems) and the Fetch step (any problem)"); E2E `shell.e2e.mjs` ("TC-NAV-41: a fetch that fails shows the reason in Get started and opens the token step again": Azure DevOps answers 401) — **UAT**; browser check: with an expired or revoked PAT, open the app — Get started opens with Could not fetch from Azure DevOps and the token step; save a new PAT and Fetch now — the steps turn Done; with the network off (or VPN for on-prem) the reason says Azure DevOps could not be reached.

**TC-NAV-42 Home: tiles per area, links and search** — Req NAV-42, NAV-43, NAV-44 — **UAT** — L1 `home-tiles.test.mjs` ("NAV-43: a search keeps a matching tile whole, else only its matching links; nothing left out without a match (TC-NAV-42)", "NAV-42: Home is a page of its own, open to everyone, without a month"); E2E `shell.e2e.mjs` ("TC-NAV-42: Home is the start page — a tile per area with links to its pages, a search, and Home first in the menu": the start page and first menu entry, the tiles in order, six links and “+n more” showing the rest, a search keeping only matching links or whole matching tiles, nothing found, a tile opening its area and a link its page; "TC-NAV-01 / TC-NAV-17": the app opens on Home); browser check: dark mode and phone width; a role without Release Details sees no Release Details tile.

**TC-NAV-46 Tile view or classic view** — Req NAV-46, NAV-42 — L1 `home-tiles.test.mjs` ("NAV-46: the tile view opens on Home, the classic view on My dashboard; the choice is kept in this browser (TC-NAV-46)"); E2E `shell.e2e.mjs` ("TC-NAV-46: the menu switches between the tile view (opens on Home) and the classic view (opens on My dashboard, no Home); the choice is kept"); browser check: Classic view opens My dashboard and Home leaves the menu; a reload keeps it; Tile view brings Home back.

**TC-NAV-47 Person picker on the person-based pages** — Req NAV-47, MYD-01, ACT-14 — L1 `app-frame.test.mjs` ("NAV-47: My dashboard always shows you — your work email, else the name you chose before an email; never the Person picked on other pages (TC-NAV-47)"); E2E `shell.e2e.mjs` ("TC-NAV-48: the profile at the top right holds My settings, the view switch and the tools; the footer shows the version and ends the page without covering it; Person only on person-based pages", "TC-ACT-10: Time Writing can show another person, chosen at the top right"); browser check: Person in the top bar on Time Writing, My Tasks [Board] and Sprint check only; choosing someone changes those pages and not My dashboard.

**TC-NAV-48 Profile menu and footer** — Req NAV-48, NAV-49, NAV-15 — E2E `shell.e2e.mjs` ("TC-NAV-48: the profile at the top right holds My settings, the view switch and the tools; the footer shows the version and ends the page without covering it; Person only on person-based pages"); browser check: the profile button at the top right opens My settings, Classic / Tile view, View as… (Admin), Search settings, Customize menu, User guide; the footer shows only the desktop app download, “v{x.y.z} (Build n)” and Force Update, whose window shows the build ID, build time and where data is saved; scrolled to the end, the last row of a long table is fully visible above it; in Admin → Epic & Feature setup the Unsaved changes bar sits above the footer; every My settings section has the same width and starts under the tabs (KB-61).

**TC-NAV-51 Business time is UTC** — Req NAV-51, NAV-11, NAV-12, QV-18, MON-06, MON-07, ATM-08, BKL-43 — L1 `business-time.test.mjs` ("NAV-51: the business helpers work in UTC; a plain date never shifts by a day (TC-NAV-51)"; "NAV-51: months of dates, new month Tasks, the current Sprint and the locks change at midnight UTC (TC-NAV-51)"; "NAV-51: the same months, Sprint and locks with TZ=Pacific/Auckland / America/Los_Angeles / Asia/Kolkata at month boundaries (TC-NAV-51)"), `planning-lock.test.mjs`, `azure-devops.test.mjs` ("release naming and UTC month rollover …"; "current dates resolve PI and nested Sprint with inclusive UTC-day boundaries (NAV-51)"), `azure-insights.test.mjs`, `release-source.test.mjs`, `release-overview.test.mjs`; the whole unit suite also passes with `TZ=Pacific/Auckland` and `TZ=America/Los_Angeles`; E2E `backlog.e2e.mjs` (New Feature and ＋ Time Writing Task months are the UTC month); browser check with the computer set to America/New_York on the last day of a month after 19:00 (20:00 in winter): the header month is already the next month, a new month Task is titled for the next month, the Period control shows the month's plan locked from midnight UTC, and the fetched-at times in the header and the view bars still show local time (EST / EDT).

**TC-NAV-52 Release Details is one list, A–Z** — Req NAV-52, NAV-17, NAV-37, CON-84, CON-85, CON-87, STR-02 — L1 `custom-streams.test.mjs` ("NAV-52: Release Details is one list — every stream A–Z (case ignored), built-in and custom, Azure and Windchill alike; \"＋ ECP export\" after them (TC-NAV-52)"); E2E `shell.e2e.mjs` ("TC-NAV-52: Release Details is one list — BRITE, every stream A–Z, then Import Windchill export; no sub-headings, and old collapsed sub-lists are forgotten"); browser check at 1440 and 390 px: with two ECP exports and a custom stream "labeling", Release Details shows BRITE, then Content, CP, DP, ECP - Type 1, ECP - Type 2, IOCC, labeling, S&S IT, Tool Validations, then ＋ ECP export and Import Windchill export; no "Azure DevOps Server" or "Windchill exports" sub-heading; a stream not set up yet (＋) still opens Stream mapping or its import; the Home tile lists the streams in the same order.

**TC-NAV-50 Pages fill the width inside a border, with set margins** — Req NAV-50 — L1 `page-layout.test.mjs` ("NAV-50: the page margins default to 10 / 20 / 10 / 20 px with a border"; "NAV-50: each side is kept between 0 and 64 px; anything else falls back to its default"; "NAV-50: a saved layout is read back; a broken saved value gives the defaults"; "NAV-50: applying sets one CSS variable per side and turns the border off only when asked"); E2E `shell.e2e.mjs` ("TC-NAV-50: every page fills the width beside the menu inside a border, with the margins of Look & feel, also when the menu is folded"); browser check in the desktop app: fold the menu — the page widens; set Left to 40 — the gap grows at once.

**TC-NAV-45 My page usage** — Req NAV-45 — L1 `usage-counts.test.mjs` ("NAV-45: page usage is off until turned on; nothing is counted or stored while off (TC-NAV-45)"; "NAV-45: on, each opening of a page counts; off deletes the counts; most used first (TC-NAV-45)"; "NAV-45: a tampered or broken entry is read safely (TC-NAV-45)"); E2E `shell.e2e.mjs` ("TC-NAV-45: My page usage is off by default; turned on, it counts the pages opened in this browser; off deletes the counts"); inspection: an exported JSON backup and a Git snapshot contain no usage counts.

**TC-NAV-36 Background jobs** — Req NAV-36 — L1 `background-jobs.test.mjs` ("background jobs: run, report progress and the result; the same job is not started twice"; "… a failed result or a thrown error marks the job; Clear finished keeps the running ones"); browser check (QMS-0025 with a saved PAT): New Feature → Save closes the form at once and the top bar shows “⟳ 1 running” with its progress, then “✓ Jobs done” with “#id … Hierarchy complete”; the menu and other pages stay usable meanwhile; Bulk actions → Create month tasks and Move run the same way and their buttons wait while the job runs; Monthly Time Writing → Save leaves a failed Task staged; reloading while a job runs asks first.

**TC-NAV-34 Settings editors as pop-ups** — Req NAV-34 — browser check: Data & sharing shows the Git storage summary; "Connect Git storage…" opens a pop-up, a click beside them keeps them open, Cancel closes them; Settings → Azure DevOps: Edit on the Time Writing row and "＋ Add server" open pop-ups; Settings → Capacity & periods: "Edit capacity settings…" opens the form in a pop-up; "＋ Map an Epic or Feature…" maps #424242 and closes, the mapping's Edit opens "Change the mapping of #424242"; Settings → Feature setup: Go to Epic #13946 → the summary and "View setup…" (no Git) open "Shared Feature setup · Epic #13946", Close closes it; every pop-up form is one column (title, input, explanation per field) with Cancel then the main action at the bottom right; at 390 × 844 the connection pop-up fits without horizontal scrolling; no page errors. **UAT**

**TC-CON-28 Work email required for Time Writing** — Req CON-60, CON-02 — browser check: a saved Time Writing connection without an email shows "Work email missing: Edit to add it" in the Stream mapping; Edit → Save without the email is blocked ("Please fill out this field"); with me@company.com it saves, the pop-up closes, the connection stores the email and the hint disappears; in the form at 1300px the PAT and email titles are one line and the inputs of each row line up. **UAT**

**TC-CON-29 All shared Feature setups** — Req CON-61 — L1 `feature-setup.test.mjs` ("all shared setups: by Epic number, with stories, Time Writing story, Task and whether mine replaces it"); browser check with a shared setup of Epics #37810 (two stories, 8h estimate) and #13946 (no stories) in this browser and no Git: "All shared setups (2 Epics, as last loaded in this browser)" lists #13946 first with None, then #37810 with both stories in order and "8h estimate"; Open on #37810 shows "Shared Feature setup · Epic #37810 Digital Platform" with two User Story rows; no page errors.

**TC-CON-30 Edit shared setups in the list** — Req CON-62 — L1 `feature-setup.test.mjs` ("editing in the list: change one Epic in a copy, remove one, leave Epics without a setup alone"); browser check with GitHub mocked (writable token, feature-setup.json with #13946 and #37810, whose first story has a description): both rows offer Edit; on #37810 change story 1, add "IQOQ : Review" and move it up, set the Task title and estimate 6, Done → the row shows the new values and "Changed · not yet in Git"; Edit and Remove #13946 → one row left; Save to Git → one PUT of feature-setup.json "Update the shared Feature setup of Epics #37810, #13946" with only #37810, stories PRD (description kept), IQOQ, SFV, Task "{month} | {service}" 6h; "saved to Git (2 Epics)" with View commit; the bar disappears; no page errors. **UAT**

**TC-CON-31 Feature DoD in the Feature setup** — Req CON-63 — L1 `feature-setup.test.mjs` ("Feature DoD in a setup: kept through save, built-in defaults, and required for new or changed setups"); browser check with GitHub mocked (writable token; shared setups #13946 and #37810 without a DoD): the list's Feature DoD column shows "Missing"; Edit #37810 and change story 1 → Save to Git disabled with "The Feature DoD is mandatory: add it for Epic #37810 to save."; typing the DoD enables it; the commit holds the DoD; Go to Epic #50000 → Create setup… → add a story → Save disabled with the same message for #50000; with "DT finished." it saves, the pop-up closes and the summary reads DoD “DT finished.”. **UAT**

**TC-CON-32 Delete a Feature setup** — Req CON-64 — browser check (same mock): Delete on row #13946 (view mode) → one row left, saved with Save to Git in one commit with #37810 only; "Delete setup" next to Epic #50000's summary → confirmation → commit "Delete the shared Feature setup of Epic #50000" leaving only #37810. **UAT**

**TC-CON-33 Links in Bulk actions** — Req CON-65 — browser check with the synthetic sample: Bulk actions, choose a person with a pending Feature → its row in the Time Writing tasks shows "#100002" as a link to …/_workitems/edit/100002 (target _blank); clicking it opens a new tab and leaves the checkbox unchanged; State checks and Move to current PI + Sprint rows use the same link; no page errors.

**TC-CON-34 Time Writing story paths in the setup** — *(Retired — see TC-BKL-18)* Req CON-66 — L1 `feature-setup.test.mjs` (rows carry the story's Area and Iteration Path); browser check with GitHub mocked: the row of #37810 shows "Area: the Feature’s · Iteration: project root"; Edit → set Area Path "QMS\Quality Engineering" and Iteration Path "QMS" (with the DoD) → Save to Git → the saved story holds both and the row shows them; the setup pop-up's placeholders say "Empty: the Feature's Area Path" and "Empty: the project root … (no PI, Sprint or year)".

**TC-CON-35 Default Feature DoD for setups without one** — Req CON-67 — L1 `feature-setup.test.mjs` ("default Feature DoD for setups without one: Full Release with a PRD story, else PU; only missing ones are filled"); browser check with GitHub mocked (#13946 without stories, #37810 with PRD and SFV, both without DoD): the banner says "2 shared setups have no Feature DoD."; #37810 shows "Missing · Default: IQOQ finished and Checklist uploaded into the Feature."; Edit #13946 pre-fills "DT finished. This is a PU release."; "Fill missing DoDs with the default" marks both rows changed and removes the banner; Save to Git saves #13946 with the PU and #37810 with the Full Release DoD; "All fields…" has its tooltip. **UAT**

**TC-CON-36 A PAT never follows a connection to another host** — Req CON-68, NAV-28 — L1 `view-definitions.test.mjs` ("restore: a view moved to another host in Git never carries the old server PAT to the new host": the moved connection has no PAT and is reported under noPat, the old server keeps its PAT, the new host gets none, a PAT entered for the restore applies to the new host); browser check: edit `azure-views.json` in the data repo so one connection's URL points to another host, Load from Git → the connection shows "no PAT" and Settings → Azure DevOps → Servers and PATs lists no PAT for the new host.

**TC-CON-37 CSV formula cells neutralised** — Req CON-69 — L1 `windchill-views.test.mjs` ("CSV export neutralises formulas in the header row as well as in cells, and quotes column names (CON-69, PT-01)"), `query-view.test.mjs` ("CSV exports neutralise formula cells and keep numbers; a bad numeric entity stays as written": =HYPERLINK, @SUM, +cmd, -cmd get an apostrophe; -3, +1.5 and ordinary text do not; viewCsv), `qe-mapping.test.mjs` and `backlog-health.test.mjs` (their CSV cases still pass through the shared helper); browser check: a work item titled "=1+1" exports as '=1+1 and opens in Excel as text.

**TC-CON-38 No blank app on bad data; desktop navigation guards** — Req CON-70 — L1 `windchill-views.test.mjs` ("a Windchill snapshot from Git drops rows that are not plain objects instead of crashing the view (CON-70, PT-07)"), `query-view.test.mjs` (the entity &#1114112; stays as written, &#65; becomes A); browser check: a Description holding "&#1114112;" renders in the query view; the ErrorBoundary page (throw inside a page in dev) shows Reload and Try to continue; a QE Mapping upload of a zip bomb .xlsx is refused with "too large"; desktop: dragging a link onto the window opens it in the browser and the window keeps the app.

**TC-CON-39 Unique releases from a Windchill export** — Req CON-71 — L1 `windchill-releases.test.mjs` ("a document name splits at its first version: release name, release number, document name"; "clubbed names: every name + version pair is a part, whatever the delimiters; the rest is the document name"; "a clubbed name is one release, kept as written and counted once; a part written on its own is another release"; "export dates are read in the formats Windchill writes, and the list is newest first with unreadable dates last"; "unique releases from an export: name + number, case and trailing zeros ignored; documents and latest date kept"); browser check: import an S&S IT export with "Remote Diagnostics 1.6 Verification Report", "remote diagnostics 1.6.0 - Test Plan", "Remote Diagnostics 1.7 SRS", "CareLink_R3.2_SRS", "IntelliSpace Portal - v12.1 - Test Plan", "Service1_rel1_Service2_rel2_Test Plan" and "Quality Manual", Show → All months → Releases shows "5 releases · 6 of 7 documents · 1 clubbed" (Remote Diagnostics 1.6 with 2 documents; "Service1_rel1_Service2_rel2" as one clubbed release, number "1 + 2", with Test Plan), newest Last Modified first (the clubbed release on 2026-10-06, then IntelliSpace Portal 12.1, Remote Diagnostics 1.7, Remote Diagnostics 1.6, CareLink 3.2), "1 document without a release number in the name", Export releases CSV; Pulse Check → Windchill exports shows Releases 6; no page errors. **UAT**

**TC-CON-40 Unique releases from the Location column; locations saved to Git** — Req CON-72 — **UAT** — L1 `windchill-releases.test.mjs` ("Location: the release is read from the deepest folder that holds a version, in one folder or in name/version folders (CON-72)"; "Location source: unique releases and unique locations of an export, with the names as fallback"; "Location: a clubbed folder is one release counted once; numbers written differently stay different releases"); E2E `documents-and-data.e2e.mjs` ("TC-CON-40": an export with a Location column reads from Location, lists the unique locations and exports them); browser check with GitHub mocked (writable token): import an export with a Location column → the count ends "from Location"; "Read from" offers Automatic (Location), Location, Document name; the unique locations table shows each folder path, its document count and the release read from it; Save locations to Git → one PUT of `windchill-analysis/<id>-locations.json` with kind `windchill-locations`, the unique locations and releases, and no rows; "Saved to Git (…)" shown; with a read-only token the button is absent; switching to Document name gives the CON-71 result; no page errors.
- Steps:
  1. Import `e2e/fixtures/windchill-locations.csv` (7 documents; Locations such as `/Products/Remote Diagnostics 1.6/DHF`, `/Products/Remote Diagnostics/1.7/Design Inputs`, `/Products/CareLink/R3.2/DHF`, `/Quality/Manuals`).
  2. Read the Releases panel; open "unique locations"; press Export locations CSV.
  3. With Git storage connected (writable), press Save locations to Git; open the data repository.
  4. Switch "Read from" to Document name.
- Expected:
  - With Show → All months: "5 releases · 6 of 7 documents · from Location": CareLink R3.2 (the number as the folder writes it), IntelliSpace Portal 12.1, Remote Diagnostics 1.7, Remote Diagnostics 1.6 (2 documents, 1 location), Service1 1.0; "1 document without a release in the Location" lists `/Quality/Manuals`.
  - The unique locations table lists 6 folders with their counts and releases; the CSV has the same rows.
  - `windchill-analysis/<id>-locations.json` exists in the data repository with the unique locations and releases, and holds no document rows; the top-bar Background jobs entry "Save locations to Git · <export>" says "Saved to Git (windchill-analysis/<id>-locations.json)" (QV-63), not a notice on the page.
  - From Document name the result is the CON-71 one: with this fixture's plain names only the clubbed document counts, as one release ("1 release · 1 of 7 documents · 1 clubbed · from Document name").

**TC-CON-27 Map a Feature setup to an Epic** — Req CON-59 — L1 `feature-setup.test.mjs` ("built-in stories as a setup give exactly the titles of the built-in creation"; "copy a setup to another Epic: replaces the target, keeps the source, no-op without a source"); browser check with a writable Git store holding a personal setup of another Epic: My setup shows it with "applies now" on step 1; "Copy this setup to Epic #" 13946 → the four stories appear under #13946 and the panel says "changed here, not saved yet"; Save to Git commits `feature-setup/<email>.json` holding both Epics and the panel then marks My setup as applying to #13946; "Go to Epic #" another number with no setup offers the two built-in buttons. **UAT**

**TC-CON-26 Personal and shared Feature setup** — Req CON-58, CON-52 — L1 `feature-setup.test.mjs` (one file per email with unsafe characters and runs of dots replaced; my setup of an Epic wins for me, the shared one otherwise, and the form can switch; Enable for everyone replaces only that Epic, as a copy); browser check: Settings → Feature setup opens for every role; with an email on the Time Writing connection it shows My setup and Shared (everyone), else only Shared with a notice; "Start my own from the shared one", "Remove my setup" and "Enable for everyone" save to Git with a writable token. **UAT**

**TC-NAV-22 Default streams and stream rules** — Req NAV-22, NAV-23 — L1 `streams.test.mjs` (stream order and sources; connection and export found by name; DP and IOCC release rules; fuzzy match percentages and the threshold; Pulse Check lists the five Azure streams in order with not-set-up ones); browser check on sample data: Release Details lists DP, CP, IOCC, Content, Tool Validations and S&S IT; a not-set-up stream opens Settings, whose Default streams Set up pre-fills the name and role; Pulse Check → Current month releases shows the five Azure streams in order. **UAT**

**TC-NAV-20 Pulse Check: Release Details and Last month** — Req NAV-20 — L1 `release-overview.test.mjs` (only the given Release Details views, each shown even when not fetched; a release source outside Release Details left out), `pulse-check.test.mjs` (previous month across the year; releases compared per stream; Features and User Stories opened and closed per Epic, absence and Removed left out, narrowed to a person); browser check on sample data: the tabs Releases and Last month; Last month shows the utilization metrics, Releases vs the selected month, Work closed and opened, the Overview month panels and the gaps for the previous month. **UAT**

**TC-CON-25 Configurable Time Writing story** — Req CON-57 — L1 `azure-devops.test.mjs` (a setup file without it keeps “{feature} - Time Writing”; a configured title, Area Path, Iteration Path and assignee are used and the month Task goes under that story). **UAT**

**TC-NAV-17 Menu groups and collapsing** — Req NAV-17, NAV-18, OV-10 — L1 `format.test.mjs` (Data Insights holds Overview, Pulse Check, PI Review; My Work order My Tasks [Board], Monthly Time Writing, Bulk actions); browser check on sample data: the menu shows the five headings; Pulse Check shows the month's releases (Overview keeps This month and Trends); collapsing My Work and Release Details hides them and stays so after a reload; at 900 px width every page is still reachable. **UAT**

**TC-CON-23 Feature setup per Epic** — Req CON-52, CON-53 — L1 `azure-devops.test.mjs` (placeholders, plain text, unknown braces kept, missing values; the file is parsed and written clean; a Feature from its Epic setup gets the chosen stories, the Time Writing story and the Task with title, Original Estimate, Area Path, Iteration Path and assignee; completing again creates nothing; a placeholder the title cannot fill stops it); browser check with GitHub and Azure DevOps mocked: Settings → Feature setup, add “US 1 ({service})” and “US 4”, Original Estimate 6 → preview shows “US 1 (Service)”; Save to Git writes feature-setup.json; ＋ Feature under that Epic with “CP | Care Pathways | v3.1” lists “US 1 (Care Pathways)” and “US 4” ticked, the Task “October 2026 | CP | Care Pathways | v3.1” with 6 h, and no PU / Full Release choice. **UAT**

**TC-ATM-08 State checks and Feature / User Story states** — Req CON-54, ATM-06 — L1 `my-work.test.mjs` (all stories Closed → close the Feature, Removed ignored; all Tasks Closed → close the story; Active Feature without an Active story, or without stories → flagged; Closed Features, other people's work and the absence Epic left out; Feature New → Set to Active, Active → Close, other states → none; other types → Close); browser check with Azure DevOps mocked: Bulk actions for Ben lists his two Active Features without User Stories with a link to Azure DevOps; My Tasks [Board] shows Close Feature for Active Features. **UAT**

**TC-CON-24 Load everything from Git; roles by the connection email; QE Mapping** — Req CON-55, CON-41, NAV-19 — browser check with GitHub mocked: Settings → Storage → Load everything from Git reads planning-data.json, azure-views.json, azure-data, windchill-data, access.json and feature-setup.json once each and lists what was loaded; Settings → Access says "You are me@x.com (the email on your Time Writing connection)"; QE Mapping appears under Data & governance (its content: TC-QEM-04). **UAT**

**TC-ACC-01 Roles and access** — Req CON-41, CON-42, CON-43, CON-44 — L1 `access.test.mjs` (no policy = read-only, CON-101; union of roles; default role for unknown or unlisted email; no default role = nothing; Backlog Health only for its roles; unknown roles, areas, actions and invalid emails dropped; broken file refused; the editor cannot remove their own "manage access"; a role without "change work items" is refused before anything is sent while reads still work); browser check with mocked GitHub and Azure DevOps: email shown from the connection's email field, Set up roles → add a member, tick Scrum Master → Save to Git commits access.json once; with a cached Team Member policy the menu has no Backlog Health, Bulk actions, Release Details, Baselines or Snapshots and Settings shows only Azure DevOps, Storage and Access. **UAT**

**TC-ACC-03 Add members by name** — Req CON-74 — browser check with the Time Writing backlog loaded: Settings → Access → Choose a person lists the people Assigned To an item in QMS-0025 by name (members already listed left out; two people with the same name show their email); pick one and Add member adds their email with the everyone-else role; the table shows the name with the email under it, sorted by name; Other (enter an email)… shows the email field and adds a person not in the backlog; without the backlog loaded only the email field and the hint are shown.

**TC-ACC-04 View as a role** — Req CON-89, CON-91, CON-92 — E2E `shell.e2e.mjs` ("TC-ACC-04: an Admin views the app as a role, read only, and exits"); L1 `view-as.test.mjs` ("View as: only the Admin role may use it, and only with an access policy (CON-89)"); browser check with Git storage and access.json: a People Manager or Team Member has no View as…; an Admin views as Team Member — the menu loses Team insights, the banner says read only; Exit restores the Admin's menu; a reload ends View as.

**TC-ACC-05 View as a person, read only** — Req CON-90, CON-92 — L1 `view-as.test.mjs` ("View as: a person gets the roles of their work email (else the default role); a role gets that role only (CON-90, CON-91)"; "View as is read only: writes to Git storage and Azure DevOps are refused while it is on (CON-92)"); browser check with the Time Writing data fetched: view as a team member — My dashboard and My Tasks [Board] show their hours and work, the menu follows their roles; Save in Monthly Time Writing, a state change in My Tasks [Board] and Save to Git all report "Read only while viewing as …" and nothing changes in Azure DevOps or Git.

**TC-NAV-12 Freshness in the viewer's time zone** — Req NAV-12 — L1 `format.test.mjs` and `app-update.test.mjs` (the same instant in Asia/Kolkata, America/New_York and UTC; the business "today" is UTC, TC-NAV-51); browser check in America/New_York: a fetch at 09:00 UTC shows "05:00 AM EDT".

**TC-OV-10 Releases summary, tracking Feature and approval dates** — Req QV-18, QV-19, OV-10 — L1 `release-overview.test.mjs`, `format.test.mjs`, `release-source.test.mjs` (the same UTC instant is shown as 30 September in New York and 1 October in India, and counted in its UTC month for everyone); browser check in Asia/Kolkata with CP, DP and IOCC loaded from Git: October shows three stream quadrants and the total (3 releases, 4 documents); September shows the CP release approved 29 Sep 18:30 UTC as “September 30, 2026”, in both the quadrant and the CP view.

**TC-PERF-01 Pages load on demand** — Req NFR-08 — L1 `bundle-split.test.mjs` ("NFR-08: pages load on demand — the shell imports only the start pages; the documents come with the Documentation page (TC-PERF-01)"); E2E every page opened through `navigate` (helpers.mjs waits for the page's code) and "TC-DOC-01" (the documents load with the page); browser check: `pnpm build:web` lists the main script under 1 MB and one chunk per page.

**TC-CSP-01 Content-Security-Policy on the built page** — Req NFR-09 — L1 `csp.test.mjs` ("NFR-09: the built page carries a Content-Security-Policy — scripts from the app only, no plugins, no foreign forms (TC-CSP-01)"); E2E `shell.e2e.mjs` ("TC-NAV-01 / TC-NAV-17 …": the meta is on the built page) and every E2E scenario runs under it (a blocked script fails the page); browser check: every menu page with the sample, a CSV export and Documentation open with no "Refused to …" console message; desktop app: opens and fetches with the policy.

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

**TC-CON-41 Windchill releases: header month, sorting and column widths** — Req CON-73 — **UAT** — L1 `windchill-releases.test.mjs` ("the header month filter keeps the releases with a document dated in that month, not only the latest (CON-73)"); E2E `documents-and-data.e2e.mjs` ("TC-CON-41": with the header month 2026-10 the export lists the October releases, 2026-08 only CareLink, All months all; clicking Release name sorts A→Z, again Z→A; a heading has a resize handle).
- Steps:
  1. Import `e2e/fixtures/windchill-export.csv`; set the header month to 2026-10, then 2026-08; choose Show → All months.
  2. Click the "Release name" heading twice; click "Latest Last Modified".
  3. Drag the handle at the right edge of "Release name" to the left; reload; press Reset widths.
- Expected:
  - The header shows the month picker on the export page. For 2026-10 the count reads "4 of 5 releases with a document Last Modified in October 2026 · 5 documents"; for 2026-08 "1 of 5 … August 2026 · 1 document" (CareLink 3.2); All months lists all 5.
  - Release name sorts A→Z (CareLink first), then Z→A; Latest Last Modified sorts newest first again; the active heading shows ▾ or ▴.
  - The column keeps its dragged width after the reload; Reset widths returns it to automatic.


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

**TC-FET-09 Start-up fetch does not wait for slow Git** — Req FET-21, FET-20 — E2E `shell.e2e.mjs` ("TC-FET-09: the start-up fetch does not wait for slow Git and shows in the top bar"); browser check: with Git storage and many on-prem views, opening the app shows "Fetch Azure DevOps at start" in the top bar right after the connection setup is read, with "1 of 1 connection fetched" or the reason (no PAT here, on-premises); with no connection set up nothing is shown.

**TC-FET-10 Fetch Time Writing from the top bar** — Req FET-22 — L1 `app-frame.test.mjs` ("FET-22: Refresh fetches the Time Writing connection first, then the read-only ones; a duplicate Time Writing connection is left out (TC-FET-10)"); browser check with a Time Writing connection and its PAT: ⟳ Time Writing in the top bar fetches it and says it was saved (as Admin → Streams → Fetch does); ↻ Refresh with an on-prem view and no VPN still updates Time Writing first.

**TC-FET-11 Finished states and the close date** — Req FET-23, FET-24, DSK-04 — L1 `closed-history.test.mjs` ("Owner decision 10: finished is Closed, Resolved, Completed or Done — not Removed, Cut, Active"; "Owner decision 10: a finished item without a Closed Date takes its State Change Date, else Resolved Date"; "Owner decision 10: the history gives the change that moved the item into a finished state, the last such one"; "Owner decision 10: history is read only for finished items without a date, at most the limit, and kept per revision"; "Owner decision 10: the desktop proxy reads a work item's history with one GET, nothing else"); browser check with a Time Writing connection: a Resolved Feature with no Closed Date counts in Pulse Check in the month it was resolved, not the month it was last edited.

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

**TC-MON-01 Scope switch** — *(Retired — see TC-ACT-11)* Req MON-01…03, MON-19 — **UAT**
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

**TC-MON-02 Metrics and table** — *(Retired — see TC-ACT-11)* Req MON-04, MON-05, MON-08
- Expected:
  - The four metrics show for the month.
  - The columns are as in MON-05, and the links open the Azure items.
  - The planning and actuals pills show.

**TC-MON-03 Lock boundaries** — Req MON-06, MON-07, MON-09, MON-10, NAV-51. L1 for the rule (`planning-lock.test.mjs`, `business-time.test.mjs`), plus L3 with the system clock or the period settings; every time below is UTC (NAV-51), whatever the computer's time zone:

| Situation | Planning (OE) | Actuals (CW) |
|---|---|---|
| Before M-05 23:59:59, no record | open | open |
| At M-05 23:59:59 exactly | locked | open |
| After M-05, extension M-10, now M-07 | open | open |
| Explicit planning lock, before M-05 | locked | open |
| Explicit lock + active extension | locked (see OI-03) | — |
| At (M+1)-05 23:59:59, no record for M+1 | locked | locked |
| Task tagged ad-hoc, planning open | disabled | open |

**TC-MON-04 Staging, validation and save** — *(Retired — see TC-ACT-11)* Req MON-11…14, MON-16, MON-17 — **UAT**
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

**TC-MON-05 Locked-field rejection** — *(Retired — see TC-ACT-11)* Req MON-13
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

**TC-MON-08 Ad-hoc tag on Tasks created after the lock** — Req MON-20 — L1 `planning-lock.test.mjs` ("ad-hoc after the lock…"), `azure-devops.test.mjs` ("after the planning lock, a new Time Writing Task…"), `my-work.test.mjs` ("Bulk month Tasks after the planning lock…"); browser check:
- Pre: planning of the current month locked (after the 5th, or locked in Settings).
- Steps: (1) New Feature on an Epic: the Time Writing section says the new Task is tagged `ad-hoc`; Save. (2) Bulk actions → Create month tasks: the confirmation says so; confirm.
- Expected:
  - The new month Tasks carry the tag `ad-hoc`; the Feature and User Stories do not; the job result names the tag.
  - An existing month Task that is reused is not tagged.
  - With planning open (or extended in Settings), nothing is tagged.

**TC-MON-09 Period control** — Req MON-21, MON-23 — E2E `shell.e2e.mjs` ("TC-MON-09: Period control shows each month's own plan and actuals lock dates and locks a month early"); browser check with Git storage: set the default days to 5 and 4 — the fields read "Last day to update the plan" and "Last day to update actuals"; November planning shows "Last day to update: 5 Nov (default)" (still open on 5 November, Locked from 6 November), actuals "4 Dec"; set a date of its own for November, Use default, Lock now and Undo early lock; save to Git and open on another computer — the same locks show.

**TC-MON-10 Month locks over the month change and in Git** — Req MON-06, MON-07, MON-22, MON-24 — L1 `planning-lock.test.mjs` ("month locks: by default November planning locks after 5 November and November actuals after 4 December…", "month locks reset when the month rolls over…", "month locks: each month can have its own dates…", "month locks are kept with the capacity settings in the Git planning data…"); browser check: keep Monthly Time Writing open over midnight at a lock date — the pill changes within a minute.

**TC-MON-07 Gaps panel** — *(Retired — see TC-ACT-11)* Req MON-18
- Expected (TD-02a, October 2026):
  - (a) S2 is listed as a Time Writing story with no October Task.
  - (b) T6 is listed under "without a month in the title", and so are T4 and T5, because S1 is a Time Writing story.
  - (c) A November case (T7) appears when November is selected, with "parent: none".
  - The title shows the total count.

### 6.6 My Tasks [Board]

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

**TC-ATM-09 Expand a Feature, then a User Story** — Req ATM-17 — L1 `my-work.test.mjs` ("featureChildren: stories, bugs and tasks under a Feature with their own children, any person, Removed left out"); browser check on sample data (person Ana Costa): ▸ on the Feature shows only its User Stories (and items placed straight under it), no Tasks; ▸ on a User Story then shows its Tasks with planned and recorded hours, and ▾ hides them again; a story without Tasks has no ▸; my New or Active items keep their action, other people's show "Not mine"; ▾ on the Feature closes it all.

**TC-ATM-10 Month tasks: show with / without task, select all** — *(Retired — see TC-ACT-11)* Req ATM-18 — browser check on sample data: the switch Without task / With task / Both filters the list and shows its counts; Select all and Deselect all act only on the shown Features whose task can be created and the "N of M selected" count follows; with nothing creatable both buttons are disabled.

**TC-ATM-11 New Feature and Complete children on My Tasks [Board]** — Req ATM-19, BKL-10 — L1 `my-work.test.mjs` ("Complete children only for a Feature without optional User Stories"); browser check: ＋ New Feature opens the board's "Add Feature under an Epic" editor with the Epic selectable; Complete children shows only on a Feature with no User Story other than its Time Writing story; both are disabled with sample data; after a real create the result shows as a notice and the data refreshes. **UAT**

**TC-ATM-12 Close follow-up: User Stories with the Feature, the Feature with the last User Story** — Req ATM-20 — L1 `my-work.test.mjs` ("closing a Feature offers its open User Stories; closing the last open User Story offers the Feature (ATM-20)": open stories only, the last-story rule, Closed Features and Tasks left alone, the staged states, the question texts; the chain writes each item in order when confirmed, nothing when declined, reports a Resolved Feature and a failed write, sets a New Feature to Active then Closed); browser check (QMS-0025, own test items): Close Feature → the prompt lists its open User Stories → OK closes them and the log says so; close the last open User Story → the prompt offers the Feature → Cancel leaves it open.

**TC-ATM-13 Month Tasks up to the Target date** — *(Retired — see TC-ACT-11)* Req ATM-21 — L1 `my-work.test.mjs` ("Bulk month Tasks up to the Target date …"); browser check:
- Steps: Bulk actions → Create month tasks with a Feature whose Target date is in January 2027 (month October 2026); in the confirmation tick it, enter 20 h; Create tasks. Run it again.
- Expected: Tasks for October, November, December 2026 and January 2027, each with Original Estimate 20 h (October without hours if planning had locked); the result names the later months; the second run creates nothing.

**TC-ATM-14 Shared activities: month Tasks on Features owned by someone else** — Req ATM-22 — L1 `my-work.test.mjs` ("shared activities: a Feature owned by someone else is offered when I had a month Task under it or its Description @mentions me (TC-ATM-14)"); browser check:
- Steps: as Person 2, with a pending Feature assigned to Person 1 whose Description @mentions Person 2, and another where Person 2 had last month's Task; open My Tasks [Board], then Bulk actions → Create month tasks.
- Expected: My Tasks [Board] shows the notice naming both Features; Bulk actions lists them with "Shared · owner Person 1", ticked; Create tasks adds Person 2's month Task under each Feature's Time Writing story.

**TC-ATM-15 Features from my User Stories; my own story on a shared Feature** — Req ATM-23 — L1 `my-work.test.mjs` ("a Feature shared by two people: each one's own User Story brings the Feature up for their month Task (TC-ATM-15)"; "month-task candidates: …" for two stories of the same title), `monthly-hours.test.mjs` ("Month task placement: …"); browser check with the QMS-0025 board: a Feature owned by a colleague where you have a User Story (open or Closed) is listed in Bulk actions → Create month tasks and counted on My Tasks [Board]; with your own Time Writing story under it, the confirmation names that story; after creating, the Task is under your story in Azure DevOps, not under the colleague's; a Feature where your only story is Removed, or that is Closed, is not listed.

**TC-ATM-16 Leave in Bulk actions** — Req ATM-24 — L1 `my-work.test.mjs` ("leave in Bulk actions: my Features under the Epic (leave and training), apart from work; others not (TC-ATM-16)"); browser check: Bulk actions → Create month tasks shows a Leave and training list with your stories under the Epic, unticked, each marked Leave or Training; the work count and My Tasks [Board]'s "tasks missing" do not include them; ticking one adds it to Create n tasks and creates its month Task.

**TC-ATM-17 Others' stories never block my month Task** — Req ATM-25 — L1 `my-work.test.mjs` ("a shared leave Feature where everyone keeps a story of the same title: mine is used, or a new one of mine — never \"Choose story\" (TC-ATM-17)"), `monthly-hours.test.mjs` ("Month task placement: …"); browser check: on a shared PTO Feature with colleagues' "PTO - Time Writing" stories, Bulk actions → Leave shows "Story + task missing" (no story of yours) or "Task missing" (your own story), never "Choose story"; creating puts the Task under your story.

**TC-ATM-18 One leave row per leave story** — Req ATM-26 — L1 `my-work.test.mjs` ("a leave Feature with one story per leave type lists one row per story of mine, never \"Choose story\" (TC-ATM-18)", "ensureStoryMonthTask creates the month Task under the given story once, then reuses it (TC-ATM-18)"); browser check: with a leave Feature "#<id> <your name>" holding your stories PTO and Sick Leave, Bulk actions → Leave shows "<your name> › PTO" and "<your name> › Sick Leave" as separate rows, never "Choose story"; ticking PTO and creating puts "<Month> | PTO" under the PTO story; running again creates nothing.

**TC-ATM-19 Missing leave and training stories** — Req ATM-27 — L1 `my-work.test.mjs` ("a leave Feature with one story per leave type lists one row per story of mine, never \"Choose story\" (TC-ATM-18)", "ensureAbsenceStoryMonthTask creates \"<Name> \| <Type> \| Time Writing\" and its month Task once, or uses my story of that type (TC-ATM-19)"); browser check: with your Feature "#<id> <your name>" under the Absence and Training Epic holding only a PTO story, Bulk actions → Leave and training shows "Story + task missing" rows for Training, Sick Leave and Unplanned Leave; ticking Training and creating adds "<your name> \| Training \| Time Writing" with "<Month> \| <your name> \| Training \| Time Writing" under it, assigned to you; running again creates nothing.

**TC-ATM-20 Sprint check** — Req ATM-07, ATM-08, ATM-09, ATM-20 — E2E `shell.e2e.mjs` ("TC-ATM-20: Sprint check offers the move to the current PI + Sprint and the state checks, without month tasks"); browser check with the Time Writing connection: Find current Sprint, move a User Story from an ended Sprint, close a Feature from the state checks — as on Bulk actions before.

**TC-ATM-21 A Feature becomes Active only through an Active User Story** — Req ATM-28 — L1 `my-work.test.mjs` ("ATM-28: a Feature becomes Active only when one of its User Stories is Active"); browser check with the Time Writing connection: create a Feature — it stays New, also after its month Task is added on Time Writing; on My Tasks [Board] the New Feature shows "Set a User Story to Active first"; set one of its User Stories to Active — the Feature becomes Active and the result says so; in Edit, choosing Active for a Feature without an Active User Story is refused with the reason; a New Feature whose User Story was set Active in Azure DevOps is listed under Sprint check → State checks with Set Feature to Active.

**TC-ATM-22 Sprint check: full-width Sprint panel and the State checks tree** — Req ATM-29 — L1 `my-work.test.mjs` ("ATM-29: State checks expand to the User Stories of a Feature or the Tasks of a User Story; only my New User Stories can be set Active there (TC-ATM-22)"); E2E `shell.e2e.mjs` ("TC-ATM-20: Sprint check offers the move to the current PI + Sprint and the state checks, without month tasks": the Sprint panel spans the page; Nothing to fix for the sample); browser check with the Time Writing connection and an Active Feature of yours whose User Stories are New: State checks shows it as a tree row; Choose a User Story (or ›) lists its User Stories; Set User Story to Active on yours sets it Active after OK and the check goes away; someone else's New story has no button.

**TC-ATM-23 Sprint check: a Feature left in an older PI** — Req ATM-30 — L1 `my-work.test.mjs` ("ATM-30: an Active Feature left in an older PI than its Active User Stories is flagged with the PI to move to (TC-ATM-23)"); browser check with the Time Writing connection and an Active Feature of yours in an older PI whose Active User Story is in the current Sprint: State checks lists it with both PIs; Move Feature to <PI> moves it after OK and the check goes away; a Feature already in the stories' PI is not listed.

**TC-ATM-03 Close an item** — Req ATM-06 — **UAT**
- Steps:
  1. On a New User Story press Set User Story to Active, then Close User Story; on a New Feature press Set Feature to Active, then Close Feature. A Resolved story or Feature shows "Set to Active first".
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

**TC-ATM-05 Month tasks** — *(Retired — see TC-ACT-11)* Req ATM-10…12, TWN-09 — **UAT**
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
  - The "Source details (n)" tab lists at most 100 rows and searches by ID, title, type and state (see TC-BKL-34).

**TC-BKL-02 Create Feature hierarchy** — Req BKL-04…09, BKL-11 — **UAT**
- Steps:
  1. Choose Add Feature under E1 (no Feature setup) and clear the title.
  2. Enter `DP | Core | v5.2` and choose PU.
  3. Load the schedule and pick the current Sprint.
  4. Create.
- Expected:
  - Step 1: Save stays disabled without a title; any free text (e.g. `DP Core`) is accepted, its milestone stories titled "SFV : Review of Deliverables (DP Core)".
  - The PU Feature DoD and SFV, DT and IQOQ stories are offered. Full Release offers PRD as well (see TC-BKL-04 for the DoD).
  - Without a creator email, the BKL-09 message shows.
  - With a schedule that is no longer current, the BKL-08 message shows and nothing is written.
  - Success creates the Feature (assigned to the creator email), the selected milestone stories titled "SFV : Review of Deliverables (Core 5.2)" and so on, the Time Writing story, and the month Task. All are verified, and the BKL-11 message shows.

**TC-BKL-03 Complete children** — Req BKL-10 — L1 `my-work.test.mjs` ("Complete children only for a Feature without optional User Stories")

**TC-BKL-04 Feature DoD mandatory** — Req BKL-13 — L1 `azure-devops.test.mjs` ("the Feature DoD is mandatory: composed into the Description, and creation is refused without one"), `feature-setup.test.mjs` ("Feature DoD in a setup: kept through save, built-in defaults, and required for new or changed setups"); browser check with Azure DevOps mocked (Time Writing connection with email and PAT, one Epic): My Tasks [Board] → ＋ New Feature opens "Add Feature under an Epic" with "Feature DoD" = "DT finished. This is a PU release."; clearing it disables "Create Feature and children" with the title "Enter the Feature DoD first"; the release view's Create Feature is disabled until a DoD is typed. **UAT**

**TC-BKL-09 Title fields in New Feature** — Req BKL-18 — L1 `azure-devops.test.mjs` ("a Feature from a setup with title fields: the typed values fill {Field} placeholders, also with a blank field"; "Release Classification: optional …": the field lines follow it), `feature-setup.test.mjs` ("title fields per Epic …": title, Description lines, on-prem values); browser check (QMS-0025, a CP Epic whose setup has Platform, Release Name, Number): New Feature shows the three inputs and the title follows them; Save gives the Description "Platform : …", "Release Name : …", "Number : …" below the Release Classification; Release Details → Create Feature on a CP release fills the fields from its on-prem items; with the fields only in the shared setup and a personal setup of the Epic, the form says so and “Use the shared setup” shows them.

**TC-BKL-10 New User Story under a Feature** — Req BKL-19 — L1 `my-work.test.mjs` ("New User Story under a Feature: the Azure DevOps story fields …"); E2E `backlog.e2e.mjs` ("TC-BKL-10: ＋ User Story on a Feature opens the New User Story form …"); browser check with a test project:
- Steps: (1) Backlogs → Expand all → ＋ User Story on a Feature. (2) Enter a title, keep the Sprint, set Story Points 3, Priority 2, Risk 2 - Medium, Value area Business; Save. (3) Repeat from My Tasks [Board].
- Expected:
  - The form shows the title, Under Feature (the row's Feature), Assigned to, Sprint, Story Points, Priority, Description, Acceptance criteria and "More fields" (Risk, Value area); no Area or State; Save stays disabled without a title or Sprint.
  - The story's Area Path is the Feature's.
  - The form closes at once; the top bar shows the job; the story appears under the Feature in the Sprint with the values entered, assigned to the person chosen.
  - A Priority, Risk or Value area outside the lists, or Story Points on a Task, is refused by both transports before anything is sent.

**TC-BKL-11 Edit a Feature, User Story or Task, with the Discussion** — Req BKL-20 — L1 `work-item-edit.test.mjs` (all tests); E2E `backlog.e2e.mjs` ("TC-BKL-11: Edit on a Feature, User Story and Task row opens the Edit form …"); browser check with a test project:
- Steps: (1) Backlogs → Edit on a User Story: change the title, Sprint, Story Points and Acceptance criteria; add a comment; Save. (2) Edit the same story in Azure DevOps, then Save again from a form opened before that change. (3) Edit a Feature: move it to another PI and tick "Also move its open User Stories". (4) Edit a month Task after the planning lock: enter Completed Work.
- Expected:
  - (1) Only the changed fields change in Azure DevOps; the Area Path and parent stay; the comment shows in the Discussion.
  - (2) Nothing is saved: "changed in Azure DevOps since you opened it".
  - (3) The Feature and its open User Stories move; the Time Writing story does not.
  - (4) Original Estimate is locked; the Task is tagged ad-hoc when it had no estimate; the iteration and the month in the title cannot change.

**TC-BKL-12 Backlog filtered to me; ＋ Time Writing Task** — Req BKL-21, BKL-22 — E2E `backlog.e2e.mjs` ("TC-BKL-12: QMS-0025 opens filtered to the person browsing; clearing the filter shows everyone; rows offer ＋ Time Writing Task"); L1 `my-work.test.mjs` ("QMS-0025 shows mine by default: my items with everything above and below; featureOf finds the Feature of a Story (TC-BKL-12)"); browser check with the QMS-0025 board and your work email: the backlog shows your items with their Epic / Feature above and the work below; choosing All in Assigned to shows everyone and a restart filters again; ＋ Time Writing Task on a Feature (and on a Story) creates this month's Task for you under your own Time Writing story, or reports that it exists; the same button on My Tasks [Board] rows.

**TC-BKL-13 Parent Epic blank on New Feature** — Req BKL-23 — E2E `backlog.e2e.mjs` ("TC-BKL-13: New Feature opens with the Parent Epic blank; every Epic is offered"); browser check: the same from My Tasks [Board] and from Create Feature on Release Details; Create without an Epic says "Choose the parent Epic."

**TC-BKL-15 Your own User Story on New Feature** — Req BKL-25 — E2E `backlog.e2e.mjs` ("TC-BKL-15: New Feature offers your own User Story (title and description) under the new Feature"); browser check with the Time Writing connection: enter a title and description, Save — the story is created under the new Feature in the Sprint chosen, assigned like the Feature, and named in the result; left empty, nothing extra is created; not shown on Complete Feature children.

**TC-BKL-16 One Feature creation with the same rules everywhere** — Req BKL-26, BKL-14 — L1 `azure-devops.test.mjs` ("BKL-26, BKL-28: Area Path — User Stories, the Time Writing story and the Task take the Feature's"); E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": Time Writing has no Feature form of its own); browser check: create a Feature under the same Epic from Backlogs, My Tasks [Board], Release Details and Time Writing — each uses the Epic's setup, the Epic's Area Path, the preselected current PI → Sprint, and the same Time Writing story and Task titles and paths.

**TC-BKL-17 One User Story creation with the same rules everywhere** — Req BKL-27, BKL-19, BKL-25, ACT-08 — L1 `my-work.test.mjs` ("BKL-27: addUserStory — a current or future Sprint only (checked fresh), the Feature's Area Path, the optional comment"); E2E `backlog.e2e.mjs` ("TC-BKL-10: ＋ User Story on a Feature opens the New User Story form with the Feature as parent and the story fields": a Comment field; "TC-BKL-15: New Feature offers your own User Story (title and description) under the new Feature": a Comment field), `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": a Sprint choice); browser check with the Time Writing connection: add a User Story with a comment from Backlogs, from Time Writing and with a new Feature — each lands in the Feature's Area Path and the Sprint chosen (current preselected), assigned to the person, with the comment in its Discussion.

**TC-BKL-18 One Time Writing Task rule everywhere** — Req BKL-28, BKL-14, BKL-22, CON-52, CON-53 — L1 `azure-devops.test.mjs` ("BKL-28: the Epic setup no longer shapes the Time Writing story or Task — fixed titles, the person, the Feature's area, the project root", "BKL-28: a new month Task gets the Epic setup's default hours; an existing one is reused and keeps its hours"); browser check with the Time Writing connection: under an Epic whose setup has 6 default hours, create a Feature, add a month Task with ＋ Time Writing Task (header month December) and on Time Writing — each Task is "<Month> \| <Feature>" under "<Feature> - Time Writing", assigned to you, in the Feature's Area Path and the project root, with 6h unless hours were typed; a second add for the same month reuses the Task; Settings → Feature setup shows only the default hours for Time Writing.

**TC-BKL-19 New Feature in four sections, shown in order** — Req BKL-29, BKL-30, BKL-24, BKL-25 — E2E `backlog.e2e.mjs` ("TC-BKL-19: New Feature shows its sections one after another: Feature, then the DoD, then the User Stories, then the month estimates": only section 1 and highlighted at first, the missing fields named; section 2 alone after section 1; an emptied DoD keeps section 3 hidden; leaving the DoD shows section 3, leaving the User Stories shows section 4; Save off until then; no Next button; Enter in the title creates nothing; "TC-BKL-15: New Feature offers your own User Story (title and description) under the new Feature" fills section 1 and leaves the DoD first); browser check with the Time Writing connection: create a Feature from Backlogs, My Tasks [Board], Release Details and Time Writing — the DoD, the stories ticked and the hours entered are on the new Feature and its month Task.

**TC-BKL-20 Start date on New Feature** — Req BKL-31 — L1 `feature-months.test.mjs` ("Start Date in a future month: Time Writing starts in that month, not this one (TC-BKL-20)", "the Start Date goes to the Feature’s Start Date field, the same on web and desktop (TC-BKL-20)", "createAzureFeature refuses a malformed Start Date before any write", "month helpers read and write \"Month YYYY\" and ISO dates"); browser check: on New Feature, a Start date next month shows one Task for next month only; an empty Start date says "from today"; the created Feature shows the Start Date in Azure DevOps.

**TC-BKL-21 Time Writing months up to the Target date, hours per month** — Req BKL-32, BKL-31 — **UAT** — L1 `feature-months.test.mjs` ("Target date: one Task for every month from the start up to it, no limit (TC-BKL-21)", "addMonthTasks adds one Task per later month with the hours typed for it, else the setup default (TC-BKL-21)", "addMonthTasks stops at the first failure and reports what it made"); E2E `backlog.e2e.mjs` ("TC-BKL-21: New Feature with a Start Date and a Target date asks for the hours of every month from the start to the target": no dates → this month; Start date next month → that month only; Target date two months later → three months; a Target date before the Start date refused; section 4 names the months, one row per month, no Completed Work for a future month, totals, the summary names the months); UAT: create a Feature starting next month with a Target date two months later, enter hours per month, and check in Azure DevOps that one Task per month exists under "{Feature} - Time Writing" with those hours and none for the current month.

**TC-BKL-22 No built-in Release Classification on New Feature** — Req BKL-33, EPS-07 — E2E `backlog.e2e.mjs` ("TC-BKL-19: New Feature shows its sections one after another…": no Release Classification field for an Epic without its own; "TC-DPF-06: a DoD and User Stories per Release Classification value…": an Epic's own Release Classification field is still asked for and picks its set); L1 `azure-devops.test.mjs` ("the Feature DoD is mandatory: composed into the Description, and creation is refused without one": without a classification no Release Classification line is written); browser check: a Feature created under an Epic without its own field has no "Release Classification :" line in its Description.

**TC-BKL-23 ＋ Time Writing Task: months and hours** — Req BKL-34, BKL-22 — **UAT** — L1 `feature-months.test.mjs` ("BKL-34: ＋ Time Writing Task for several months — each with its hours, from a User Story row to its Feature (TC-BKL-23)", "addMonthTasks adds one Task per later month with the hours typed for it, else the setup default (TC-BKL-21)"); E2E `backlog.e2e.mjs` ("TC-BKL-23: ＋ Time Writing Task asks for the months — the header month first, ＋ Add month, any month changeable — and the hours of each; Assigned to is the person creating (TC-BKL-24); Add runs as a background job (TC-BKL-26)"); UAT: on a Feature, add three months with hours, save, and check one Task per month with those hours in Azure DevOps; repeat for a month you already have and see it kept.

**TC-BKL-24 ＋ Time Writing Task: Assigned to and a month that already has a Task** — Req BKL-35 — L1 `feature-months.test.mjs` ("BKL-35: Time Writing Tasks for the chosen person — an unassigned story is assigned to them; a month they already have is warned about, never duplicated (TC-BKL-24)"); E2E `backlog.e2e.mjs` ("TC-BKL-23: ＋ Time Writing Task asks for the months — the header month first, ＋ Add month, any month changeable — and the hours of each; Assigned to is the person creating (TC-BKL-24); Add runs as a background job (TC-BKL-26)"); browser check with live data: open ＋ Time Writing Task on a Feature where you already have this month's Task — the row says there is already a Time Writing Task for the month with its hours, and Add asks to confirm before overriding the hours; with the right "Assign new work to other people" choose another person and check in Azure DevOps that the Task and its Time Writing story are assigned to them.

**TC-BKL-25 Time Writing titles follow the Feature name** — Req BKL-36 — L1 `feature-months.test.mjs` ("BKL-36: a renamed Feature’s Time Writing story and month Tasks take its new name — everyone’s; leave, holidays and own titles are left alone (TC-BKL-25)"); browser check with live data: rename a Feature in Edit and save — its "… - Time Writing" story and "{Month} | …" Tasks show the new name and the message says how many titles were updated; rename a Feature in Azure DevOps, then save the hours of one of its month Tasks in the app — the titles follow; a leave Feature's story and Tasks keep their titles.

**TC-BKL-26 ＋ Time Writing Task as a background job** — Req BKL-37, NAV-36 — L1 `feature-months.test.mjs` ("BKL-37: ＋ Time Writing Task runs as a background job — progress and result in the top bar; one at a time per Feature and person; Tasks made before a failure are kept (TC-BKL-26)"); E2E `backlog.e2e.mjs` ("TC-BKL-23: ＋ Time Writing Task asks for the months — the header month first, ＋ Add month, any month changeable — and the hours of each; Assigned to is the person creating (TC-BKL-24); Add runs as a background job (TC-BKL-26)"); browser check with live data: Add 2 months — the pop-up closes, the top bar shows “⟳ 1 running” with “Adding the … Task…”, then the result, and the rows show the new Tasks.

**TC-BKL-27 Complete children per Epic** — Req BKL-38, BKL-10 — L1 `feature-setup.test.mjs` ("BKL-38: Complete children per Epic — on unless the shared setup turns it off; kept through a save; mine cannot turn it off (TC-BKL-27)"); E2E `backlog.e2e.mjs` ("TC-EPS-01: Epic setup — its fields appear in New Feature (a value list, required and warning fields), the title follows its pattern, and Admin → Epic setup shows them": the Complete children setting, on and read-only without Git storage); browser check with Git storage: turn it off for an Epic and Save — its Features no longer offer Complete children on Backlogs and My Tasks [Board], another Epic's still do; turn it on — Complete children opens with the Epic's User Stories unticked and Your own User Story, and only the ticked ones (and your own) are created.

**TC-BKL-28 The Close pop-up** — Req BKL-39, ACT-18 — L1 `close-list.test.mjs` ("BKL-39: Close Feature lists everything open under it, parents before children; yours ticked, others’ not (TC-BKL-28)", "BKL-39: Close User Story — the story alone, or with the Feature, Time Writing story and Tasks when it is the last open one (TC-BKL-28)", "BKL-39: closing runs children first; a parent stays open when an item below it could not be closed (TC-BKL-28)"); E2E `shell.e2e.mjs` ("TC-BKL-28: Close on a Feature lists what would close with tick boxes and #ID links — yours ticked, others’ not; ticking the Feature ticks all; hours are confirmed first"); browser check with a Time Writing connection: Close Features on Time Writing and Close on a Feature row list the Feature, its User Stories and Tasks with tick boxes and #ID links; another person's Task is unticked and keeps its story and the Feature unticked; ticking the Feature ticks everything; a month Task ticked asks to confirm the hours; closing the last open User Story lists the Feature, Time Writing story and Tasks; closing another lists the story alone.

**TC-BKL-29 Edit form keeps the PAT field while typing** — Req BKL-40 — E2E `backlog.e2e.mjs` ("TC-BKL-29: Edit without a saved PAT keeps the PAT field while it is typed in; nothing is read until Load"); browser check: Edit on a row without a saved PAT, type a token — the field stays, no "Reading #…" until Load.

**TC-BKL-30 Hours make the Time Writing Task and story Active** — Req BKL-41 — L1 `hours-active.test.mjs` ("BKL-41: hours on a month Task make the Task and its Time Writing story Active, and say so"; "BKL-41: a Closed Task or story is reopened to Active and named; Active ones are left alone; Removed stays Removed"; "BKL-41: nothing changes without hours, for a Task that is not a month Task, or under a story that is not Time Writing"; "BKL-41: a failed write is reported, not thrown"); browser check with a Time Writing connection: enter hours on a New month Task and Save — the message names the Task and the story set to Active; close the story, enter hours again — the story is reopened and named.

**TC-BKL-31 Close Task on Time Writing and My Tasks [Board]** — Req BKL-42 — L1 `close-list.test.mjs` ("BKL-42: Close Tasks lists the ticked Task alone, with the hours question; a User Story close removes later months only when it closes the Feature"); E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline", Close Tasks steps); browser check: My Tasks [Board] → Close on a month Task opens the pop-up with the hours question.

**TC-BKL-32 Early close removes later months' Time Writing Tasks** — Req BKL-43 — L1 `close-list.test.mjs` ("BKL-43: closing a Feature early lists its later months’ Time Writing Tasks to remove (everyone’s, ticked; not those with Completed Work)"; "BKL-43: a later month that cannot be removed keeps its story and the Feature open"); browser check with a Feature whose Time Writing runs to next year: Close Feature — the later months are listed "→ Removed, 0 h", ticked; after Close they are Removed with 0 h Original Estimate.

**TC-BKL-33 Edit keeps an unassigned item unassigned** — Req BKL-44 — L1 `work-item-edit.test.mjs` ("BKL-44: Assigned to starts blank — an unassigned item stays unassigned unless someone is picked"); browser check with a Time Writing connection: Edit an unassigned Task, change only the title, Save — Assigned to is still empty in Azure DevOps; pick a person — that person is set.

**TC-BKL-34 One scroll bar on the board; Source details is its own tab** — Req BKL-45, BKL-12 — E2E `backlog.e2e.mjs` ("TC-BKL-34: QMS-0025 has one scroll bar — the board fills the screen — and Source details is its own tab"); browser check: at 1440 × 900 and with the menu folded, Expand all leaves the page without a scroll bar — also with 40 px added below the page (as taller Windows text or 125 % scaling would, KB-74) — and the table scrolls; at 390 px the page scrolls.

**TC-BKL-35 State and Assigned to multi-select filters** — Req BKL-46, BKL-21 — E2E `backlog.e2e.mjs` ("TC-BKL-35: QMS-0025 filters State and Assigned to with multi-select drop-downs; Reset filters goes back to New + Active and me"); L1 `my-work.test.mjs` ("QMS-0025 shows mine by default: my items with everything above and below; featureOf finds the Feature of a Story (TC-BKL-12)"); browser check with real data: two people chosen show only their work with its Epics and Features; Unassigned shows unassigned items; Closed added to State shows closed items.

**TC-BKL-36 Column order saved for everyone** — Req BKL-47, BKL-03 — L1 `personal-views.test.mjs` ("BKL-47: Save for everyone sets one entry (the QMS-0025 column order) in the defaults and keeps every other default (TC-BKL-36)"); E2E `backlog.e2e.mjs` ("TC-BKL-36: QMS-0025 starts on the column order saved for everyone; Apply keeps my own; Reset to the team default goes back"); browser check with Git storage as a Tool Owner: Save view for everyone (before v10.6 "Save for everyone") writes personal-views-defaults.json with the order and who and when (`by:backlog-columns`), listed under Background jobs; another person (no own order) sees it after a reload; Clear the view for everyone (confirmed) removes it; a person without the right sees no Save view for everyone.

**TC-BKL-14 Release number without "v" in Feature titles** — Req BKL-24 — L1 `release-source.test.mjs` ("Create Feature title from a release: \"Stream | Name | Release\" without a \"v\", mapping back to the release (BKL-24)"), `dp-board-match.test.mjs`, `cp-reporting.test.mjs`; browser check: Create Feature on a DP, CP and Windchill row pre-fills the title with the number and no "v".

**TC-CON-45 Git view data with another query is not applied** — Req CON-77 — L1 `git-snapshots.test.mjs` ("a snapshot fetched with another query than the connection has here is not applied"); browser check:
- Pre: Git storage connected; the DP connection's query changed here; Git holds DP data fetched with the old query.
- Steps: reload the web app; open DP; Load from Git.
- Expected: the DP data here is not replaced by the old-query data; Load from Git says the data in Git was fetched with another query and that the setup should be saved to Git.

**TC-CON-46 Tree and direct-links queries** — Req CON-78 — L1 `release-source.test.mjs` ("tree and direct-links queries (FROM WorkItemLinks … MODE): every item on either end of a link, each once (TC-CON-46)"), `azure-devops.test.mjs` ("desktop bridge constrains credentials to Azure DevOps and rejects writes and oversized batches" — the WorkItemLinks lines); browser check with the desktop app: paste a tree query (Releases with their child Documents, MODE (Recursive)) into a CP connection, save, fetch: no "flat work-item query" error; the view lists the Releases and their Documents with the query's columns; a query with ASOF is refused on save.

**TC-CON-47 Admin stream mapping enforced through Git** — Req CON-79 — L1 `view-definitions.test.mjs` ("Git connection setup is the default: added and followed; the stream mapping is enforced, other views kept when changed here; PATs kept (TC-CON-47)"); browser check with two browsers and Git storage connected: as an admin (Manage shared settings), change the CP query in Settings → Azure DevOps → Stream mapping and Save — the notice says it was saved to Git and the commit "Stream mapping: CP" is in the data repository; as another user, change the CP query locally, reload: the admin's query is back and the start message names CP as applied from the admin's mapping; the user's own extra "CP …" connection is not the one Release Details → CP opens; as the admin with a read-only token, a change says "saved here only" and survives a reload; Save stream mapping to Git writes it once the token can write.

**TC-CON-48 Work email never shared through Git** — Req CON-80 — L1 `view-definitions.test.mjs` ("the work email is personal: never written to Git, ignored in the file, kept here; an inherited one is cleared once (TC-CON-48)"); browser check: as an admin with a Time Writing email, Save connections to Git — `azure-views.json` has no `creatorEmail`; as a new user (empty browser, Git storage connected to a file that still has the admin's email) — after the start sync, Settings → Azure DevOps shows the Time Writing connection with **Work email missing**, the access role is the default one, and after entering their own email and restarting it stays; a user who had already received the admin's email sees the start message asking for their own email once, and their email entered afterwards is kept; no page errors.

**TC-CON-49 Successor and Predecessor IDs of a view of its own** — Req CON-81 — L1 `azure-devops.test.mjs` ("Predecessor and Successor IDs come from the Dependency links of each work item (TC-CON-49)"); browser check (desktop app, on-prem): add a connection with its own name (not a stream name) and a query returning items that have Successor / Predecessor links, fetch — the query view ends with **Successor ID** and **Predecessor ID**, listing each linked ID once ("501, 502"), sortable, found by search and present in the CSV; an item without links shows them empty; the DP / IOCC stream views show no such columns; after Save data to Git the web app shows the same columns.

**TC-CON-50 Work email as its own setting** — Req CON-82 — L1 `work-email.test.mjs` ("your work email is its own setting: saved and read, never taken from the first connection or changed by a Git sync (TC-CON-50)"; "first start: the email on the Time Writing connection becomes the setting only after the shared-email clean-up ran (TC-CON-50)"); E2E `shell.e2e.mjs` (TC-SET-06: *Your work email* is the first section of Azure DevOps); browser check (desktop app): enter the email under Settings → Azure DevOps → Your work email, Force Update and restart — the email is still there, My Tasks [Board] shows your work and the access role is yours; edit and save the Time Writing connection (no email field) — the email is unchanged; Get started points to Your work email while it is empty.

**TC-CON-51 ECP projects from Windchill** — Req CON-83 — L1 `windchill-releases.test.mjs` ("ECP: each release is the second Location folder, \"<project number> <project name>\", with everything under it (TC-CON-51)"), `streams.test.mjs` ("default streams in order; connections and exports found by name"); browser check: import a Windchill export through "＋ ECP" (an export still named "QRE" also shows as ECP) — Release Details → ECP lists each second folder of the Location ("Parent folder/<number> <name>/Phase") once as "<number> <name>" with every document under it, phases and deeper folders included, and the months its documents are dated in; the month filter follows the header month; Pulse Check → Supported shows "ECP [n] : 123456 Name, …"; Create Feature proposes "ECP | 123456 Name".

**TC-CON-52 BRITE placeholder** — Req CON-84 — inspection: Release Details shows BRITE at its root; it opens "BRITE is not set up yet."; Pulse Check and the Monthly pack have no BRITE line.

**TC-CON-53 Import a stream's export from its menu entry** — Req CON-85 — E2E `documents-and-data.e2e.mjs` ("TC-CON-53 / TC-QV-43: \"＋ ECP\" imports the export as the ECP page whatever the file is called, read by project, with the common Release name / Release columns"); browser check: with no ECP export, click "＋ ECP" — the import shows "Import the ECP export" with Name "ECP"; choose a CSV called anything (e.g. "Search Results.csv") — the ECP page opens with its projects, the menu shows ECP (no ＋), and Pulse Check lists ECP.

**TC-CON-54 ECP columns Project No and Project Name** — *(Retired — see TC-QV-43)* Req CON-86 — E2E `documents-and-data.e2e.mjs` ("TC-CON-53 / TC-QV-43: \"＋ ECP\" imports the export as the ECP page whatever the file is called, read by project, with the common Release name / Release columns"); browser check: Release Details → Windchill exports → ECP — the table's columns read Project Name and Project No (and Download CSV has the same headers); S&S IT still reads Release name and Release.
**TC-CON-55 Several ECP setups, each listed on its own** — Req CON-87 — L1 `windchill-releases.test.mjs` ("ECP setups: several ECP exports, each with its own name and project folder (2nd, 3rd…), listed on their own (TC-CON-55)"); E2E `documents-and-data.e2e.mjs` ("TC-CON-55 / TC-QV-28: an ECP setup named \"ECP - Type 2\" reads projects from the 3rd Location folder, is listed on its own, with compact page actions"); browser check: click "＋ ECP" — Logic shows ECP setup; choose Project details at "3rd folder", Name "ECP - Type 2", import — the page lists "123456 Patient Monitor" with all its phases, the menu shows "ECP - Type 2" and "＋ ECP export"; import a second export as "ECP - Type 1" at the 2nd folder — both are listed under Windchill exports and as separate lines in Pulse Check → Supported and the Monthly pack; changing "Project details at" on a page re-reads its projects.

**TC-CON-56 Back up and clean up the connections** — Req CON-88 — L1 `view-definitions.test.mjs` ("back up and clean up: every connection removed, PATs kept per server, the reset applied once per computer (TC-CON-56)"); E2E `shell.e2e.mjs` ("TC-CON-56: Storage → Shared setup in Git offers Back up and clean up; removing all needs Git storage that can save"); browser check (admin, Git storage that can save): Back up and remove all… downloads the backup, adds `azure-views-backups/azure-views-<time>.json` and `azure-views-reset.json` in Git, empties `azure-views.json` and `azure-data/`, and Settings → Azure DevOps lists no connections while the server PATs stay; a second computer started afterwards shows no old connections, then the ones the admin added.

**TC-CON-57 Stream mapping locked to the Tool Owner** — Req CON-93, CON-42 — L1 `access.test.mjs` ("CON-93: the Tool Owner role alone changes the stream mapping; while none exists, those who manage access may; only a Tool Owner changes who holds it (TC-CON-57)"); browser check with access.json in Git: as an Admin without the Tool Owner role, Settings → Azure DevOps → Stream mapping shows the mapping read-only (no Edit, no Save stream mapping to Git, naming patterns read-only); give yourself Tool Owner in Role rights while no Tool Owner exists — saved; as that Tool Owner the mapping is editable; as an Admin, adding another Tool Owner is refused; removing the last Tool Owner is refused.

**TC-CON-58 Role rights as a permission matrix** — Req CON-94, CON-42, CON-89 — L1 `access.test.mjs` ("CON-94: every permission is Allow, Deny or Not set per role; a denial wins; older files keep what they allowed; Check access explains (TC-CON-58)"); E2E `shell.e2e.mjs` ("TC-CON-58: Role rights is a matrix of Allow, Deny and Not set per permission, grouped and searchable; a denial hides what it denies and Check access explains why"); browser check with access.json in Git: Settings → People & access → Role rights shows each permission with Allow / Deny / Not set per role in groups; set Deny on *Export tables* for one of your roles while another allows it — after Save to Git the Export buttons are gone; Check access names the denying role; an access.json saved before v7.27.0 keeps every person's rights.

**TC-CON-59 Feature setup layers** — Req CON-95 — L1 `feature-setup-inheritance.test.mjs` ("Feature setup layers: Mine → Epic (shared) → All Epics → Built in, per field (CON-95, TC-CON-59)"; "Feature setup layers: round trip, DoD rules and Enable for everyone keep the defaults (CON-95, TC-CON-59)").

**TC-CON-60 Setup per Epic** — Req CON-97, CON-95 — L1 `feature-setup-inheritance.test.mjs` ("Feature setup layers: Mine → Epic (shared) → All Epics → Built in, per field (CON-95, TC-CON-59)" — an Epic without its own setup uses All Epics); E2E `shell.e2e.mjs` ("TC-CON-60: Setup per Epic — All Epics defaults, and an Epic showing which sections it customizes, with a preview"), `backlog.e2e.mjs` ("TC-EPS-01: …" — the Epic's fields in Setup per Epic); browser check with Git storage: Admin → Epic & Feature setup → Setup per Epic: All Epics — set a DoD and a story; an Epic: switch on Customize for User Stories (it starts from All Epics' story), add one, change its DoD; the preview follows; one Save to Git writes the setup files; Use my own version — customize the estimate, Save; New Feature under the Epic uses your estimate; Remove my own version; Reset this Epic to the defaults. The Epic list scrolls on its own, stays in view and is at most 600 px tall (KB-57).

**TC-CON-61 Shared connections merged, removed ones restored** — Req CON-98, CON-99 — **UAT** — L1 `removed-connections.test.mjs` ("CON-98: sharing merges with the setup in Git — a connection only in Git stays; only named ones are removed (TC-CON-61)", "CON-99: connections in older versions of the shared setup that are gone now are found once, newest version first (TC-CON-61)", "CON-99: the history of the shared setup is read from GitHub — commits of the file, then the file at a commit; nothing is written"); E2E `shell.e2e.mjs` ("TC-CON-61: Streams → Removed connections finds a connection dropped from the shared setup in Git and restores it, for everyone"); UAT: on the computer that lost the second CP query, Settings → Streams → Removed connections → Look in Git history, Restore it, Fetch, and check it is back in the menu and on a second computer after its next start.

**TC-CON-62 A connection without a role is read-only** — Req CON-100 — L1 `azure-devops.test.mjs` ("CON-100: a connection without a role is read-only, except the one older Time Writing setup"; "ADS configurations retain URL, reason and PAT as one selectable browser-local set"); `app-frame.test.mjs` ("FET-22: Refresh fetches the Time Writing connection first, then the read-only ones; a duplicate Time Writing connection is left out").

**TC-CON-63 Read-only until the roles file is loaded (fail closed)** — Req CON-101, CON-43, CON-44 — **UAT** — L1 `access.test.mjs` ("CON-101: until a roles file is loaded the app is read-only (every menu area, no action, Azure writes refused); only the confirmed absence of access.json lets the viewer set up the first one (TC-CON-63)"; "CON-101: the Azure write guard is closed before the app sets it"; "access: no policy means read-only (CON-101); …"); E2E `shell.e2e.mjs` ("TC-CON-63: without a roles file the app is read-only — a notice says why on every page, every menu area is shown, write actions are disabled"); UAT: in a new browser without Git storage, every page is in the menu, the top says "Read-only" with Connect Git storage, and a change (New Feature, an hours cell, Role rights) cannot be saved; connect Git storage to a repository with access.json — the notice goes and the roles apply; connect a test repository without access.json — the notice offers Set up roles, Role rights → Set up roles → Save to Git writes access.json with you as Admin, and the app then follows it.

**TC-CON-64 Write buttons disabled with the reason when the action is missing** — Req CON-102, CON-101 — L1 `access.test.mjs` ("CON-102: why a button that writes to Azure DevOps is disabled — read-only before the roles load, else the missing permissions (TC-CON-64)"); E2E `shell.e2e.mjs` ("TC-CON-64: before the roles load, the buttons that write to Azure DevOps are disabled and say why; with roles they are enabled"); browser check: without roles, ＋ New Feature on the QMS-0025 board, Edit / ＋ User Story / ＋ Task on its rows, ＋ New Feature / Edit / Close on My Tasks [Board], Save / Close / ＋ Add a new activity on Time Writing, Move and the state buttons on Sprint check, Create Feature and Create Features on the release pages are disabled and a line says why; with a role that lacks one action (e.g. Deny *Edit the fields of a work item*) only its buttons are disabled and the line names it; with every action nothing changes.

**TC-CON-65 Several roles per person** — Req CON-104, CON-94 — L1 `access.test.mjs` ("CON-104: a person can hold several roles — the People section sets them all, in the matrix order; none removes the person; their rights are the union (TC-CON-65)"); browser check with Git storage and Manage access: in People & roles → People open a person, Edit, tick Scrum Master and Product Owner and Save — both are saved in access.json and the person sees both roles' menu areas; unticking one keeps the other; Role rights → Check access names both roles.

**TC-CON-66 Hours and moving disabled inside the forms** — Req CON-105, CON-102 — browser check with a role that may create and edit work items but not enter hours or move (Role rights: Allow azure.write and work.edit, Not set work.hours and work.move): Edit on a Task shows Original Estimate and Completed Work disabled with the line "Your role does not allow “Enter planned and actual hours”…"; changing a Feature's PI shows "Also move its open User Stories" disabled with the reason; ＋ Time Writing Task shows the hours fields disabled and the line "… The month Tasks are created without hours.", and Add still creates the Tasks; with the rights all are enabled.


**TC-CON-44 DP and DHFI defaults** — Req CON-76 — L1 `connections.test.mjs` ("pre-filled connections from the shared setup …": DP reads the Release work items of DHP with DDTDate, SourceProgram, PsName and Release; DHFI [Approved] reads the DHP.Vault documents, hidden from the menu); browser check in a fresh browser with only the on-prem PAT: Settings → Azure DevOps → Stream mapping → Set up DP, Pedestal and DHFI from their defaults; Release Details → DP lists Release items for the DDT month; Get started shows the release streams step done.

**TC-CON-43 Title fields in the Feature setup** — Req CON-75 — L1 `feature-setup.test.mjs` ("title fields per Epic: up to five, unique names, saved with the setup …"); browser check with GitHub mocked: Settings → Feature setup → an Epic → ＋ Add title field three times (Platform / Custom.Platform, Release Name, Number), the preview of a story titled "{Platform} review" with the sample "CP 2 | Atlas | 4.1" shows "CP 2 review"; Save to Git writes titleFields; a sixth field cannot be added.

**TC-BKL-08 Release Classification in the Description (retired — see TC-BKL-22)** — Req BKL-17 — L1 `azure-devops.test.mjs` ("Release Classification: optional, always written below the Feature DoD in the Description"); browser check (QMS-0025, connection with a saved PAT): New Feature shows Release Classification under Planning for an Epic with a setup and one without; choosing Platform Update and saving gives the Feature a Description starting "Feature DoD: …" followed by "Release Classification : Platform Update"; leaving it blank gives "Release Classification :"; the children created are the same either way.

**TC-BKL-07 New Feature form in the Azure DevOps layout** — Req BKL-16 — L1 `npx tsc -b` and `my-work.test.mjs` (the creation paths it calls are unchanged; TC-BKL-02…06 still pass); browser check (QMS-0025, connection with a saved PAT): ＋ New Feature opens “New Feature” with the title on top and the Parent Epic and Release Classification side by side above it, as wide as the title; the strip shows you, New, the Epic’s Area and the current PI → Sprint already chosen; no PAT field is shown; the DoD is prefilled from the setup; Child work items is shown open, headed “n will be created or checked”; there is no Milestone set field; Save creates the same hierarchy as before; at phone width the form fits without sideways scrolling.

**TC-BKL-06 Built-in Review of Deliverables story** — Req BKL-15 — L1 `azure-devops.test.mjs` ("… always creates Time Writing and the month task": the story "Review of Deliverables - <Feature>" is created by default for PU and Release with and without milestones, in the Sprint; "partial hierarchy …": completion adds it; "a Feature from its Epic setup …": it follows the optional stories; "the Time Writing story without set paths …": it goes to the chosen Sprint, and unticked it is not created on either path), `feature-setup.test.mjs` ("built-in stories as a setup …": the title is not part of the setup); browser check: New Feature offers it unticked beside the ticked milestone / optional stories; ticking it clears them, ticking a story clears it, Deselect all clears all of them (it included); without stories to offer it is ticked; after creation the Feature has the story in the current Sprint; unticked, the Feature is created without it; Complete children with it ticked on a Feature without it adds it.

**TC-BKL-05 Time Writing story not tied to a Sprint** — Req BKL-14 — L1 `azure-devops.test.mjs` ("… always creates Time Writing and the month task" for PU and Release: review stories in the PI, the Time Writing story at the project root; "new Feature is assigned to the configured creator email, review stories to the Sprint, the Time Writing story and task to the project root"; "the Time Writing story without set paths: the project root iteration (no PI, Sprint or year) and the Feature area; an existing one is reused wherever it is"), `my-work.test.mjs` (a new Time Writing story from Bulk actions at the project root; "move candidates …": Time Writing stories are never moved); browser check: New Feature shows "Time Writing User Story → QMS (not the PI or Sprint)" in Dates and paths. **UAT**
- Steps:
  1. On a Feature with only its Time Writing story (or no story), choose "Complete children".
  2. Look at a Feature that already has an optional User Story (SFV, DT, a setup story, …).
- Expected:
  - Step 1 creates only the missing items, and the Feature is not recreated.
  - Step 2 shows no "Complete children" button, on the board and on My Tasks [Board].

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
  2. Open Overview, Monthly and My Tasks [Board].
- Expected: that Task appears on none of them.

**TC-QV-05 Releases, Name/Release columns and month filter** — Req QV-12…17 — per-view snapshots: `view-sources.test.mjs`; month: `viewMonthOf` (approval date in UTC, NAV-51, else approval-date field, else Changed Date); browser check: picker shown on read-only views and not on QMS-0025, “All months” shows every item — L1 `release-source.test.mjs` (incl. planned/booked hours per release: month Tasks only, Removed excluded, no double counting), `query-view.test.mjs`.
- L3 steps:
  1. Open the release-source view (TD-01).
  2. Open another read-only view whose items have "…\Name\Release x.y.z" in their Area or Iteration Path.
- Expected:
  - The release-source view is one page with no tabs. The Releases list is flat (no stream grouping), with Name, Release, approved date, documents, and "Tracked · n" or "Not tracked". The documents table is below it.
  - Expanding a release lists its documents.
  - DP | Dose Planning | v4.2 in the sample backlog tracks Dose Planning · 4.2, and v4.2 does not track 4.20.
  - Both views show the Name and Release columns after the ID. QMS-0025 shows neither.

**TC-QV-06 Create Feature from a release** — *(Retired — see TC-QV-16)* Req QV-20, CON-56 — L1 `release-source.test.mjs` ("tracking is an exact match of name and release segments in a Feature title"); browser check: a release without a tracking Feature offers Create Feature; a title that no longer names the release is refused; the confirmation offers the person picker, defaulting to the person creating it. **UAT**

**TC-QV-07 Create Feature title parts** — *(Retired — see TC-QV-16)* Req QV-21 — L1 `release-source.test.mjs` (test removed with the separate form); browser check (needs a DP and a CP connection): DP shows Program, Service and Release, giving "DP | <name> | v<release>"; CP shows a Platform list with Platform 1.0 and Platform 2.0, and "Add…" adds a platform kept in this browser; changing a part rebuilds the title, which stays editable.

**TC-QV-08 DP shows only its query** — Req QV-22 — L1 `query-view.test.mjs` ("column chooser: hidden columns left out in the query order, never all of them, remembered per view"); browser check with Azure DevOps mocked (a release-source connection "DP" whose query selects ID, Title, State, Custom.ReleaseType, Target Date and Area Path; three Release items): Release Details → DP → Fetch → the table has exactly ID, Title, State, Release Type, Target Date, Area Path; no "Time Writing Feature", DHFI or Pedestal text; "Columns (6 of 6)" → untick Area Path → "Columns (5 of 6)" and the column is gone; after a reload it stays hidden; CP still shows its Releases list. **UAT**

**TC-QV-09 Bare field names with a prefix** — Req QV-23 — L1 `query-view.test.mjs` ("a bare field name finds its prefixed reference name (\"SourceProgram\" → Custom.SourceProgram), only when exactly one field ends with it"); browser check with Azure DevOps mocked: a DP query selecting [SourceProgram] over items whose field is Custom.SourceProgram shows RSGMS, RSGMS, DHP in that column, with and without the project's field list (before the fix the column was blank).

**TC-QV-10 DP: DDT month, Completed and Supported Releases** — Req QV-24, QV-25 — L1 `dp-milestones.test.mjs` ("DP counts for a month: Completed = releases with DDT Done in the month; Supported = unique releases with any milestone Done in the month"; "Supported Releases are unique by PsName + Release: two rows of the same release count once; rows without them by work item"; "the DP table month is the DDT Date month; a row without DDT Date has none; release name from PsName and Release"), `streams.test.mjs` ("Pulse Check streams: …": DP supported 1, title "SFV · DT Done"; the same release supported in two months counts once over the period; the Dashboard's streamCounts per month and in total); browser check with Azure DevOps mocked (DP query with PsName, Release and the eight milestone fields; #501 DDT Done 5 Oct + DRfH Done 2 Oct, #502 DDT In Progress 20 Oct + DRPC Done 21 Oct, #503 DDT Done 3 Nov + DRPE Done 8 Oct, #504 DDT Done 10 Sep): DP in October shows "Month filter: by DDT Date", rows 501 and 502, the counts "Releases in October 2026: 2", "Completed: 1", "Supported: 3" with "4 milestones: DT 1 · SFV 1 · PRD 1 · RPE 1" and, under "Supported releases counted", the three releases, #501 once with SFV and DT; Pulse Check → September: DP 1 completed · 1 supported (Release 504, DT Done); Current month (October): DP 1 completed · 3 supported with three titles; no page errors. **UAT**

**TC-QV-11 DP milestone names and query scope** — Req QV-26 — L1 `dp-milestones.test.mjs` ("DP milestones carry the team names: DT, SFV, PRD, RPE"), `streams.test.mjs` (titles "SFV Done", "DT Done"); browser check with Azure DevOps mocked (DP query rows from two projects): the Supported Releases hint reads "DT n · SFV n · PRD n · RPE n", "Supported releases counted" shows "DT · Design Transfer · Completed", "SFV · Start of Verification / Start of Hardening", the legend lists all four names, and rows of both projects are shown and counted.

**TC-QV-12 Rich-text cells as plain text** — Req QV-27 — L1 `query-view.test.mjs` ("rich-text values (Acceptance Criteria) show as text: tags removed, entities decoded, lines joined"; "rich text of any size becomes text in linear time; script and style blocks are dropped (KB-03, TC-QV-12)"); browser check with Azure DevOps mocked (a query with [Microsoft.VSTS.Common.AcceptanceCriteria] holding `<div><b>Given</b>…</div>`): the cell reads "Given … · When … · Then …" with no tags, the hover shows the same, the CSV holds the text; no page errors.

**TC-QV-13 View notes behind Info** — Req QV-28 — browser check with Azure DevOps mocked (DP view, October, a Git save note): no info banners above the counts; the ⓘ Info next to "DP" lists "Month filter: by DDT Date in UTC." and the legend "DT = Design Transfer (DDT) · SFV = … · PRD = … · RPE = …"; a fetch error still shows as a banner; no page errors.

**TC-QV-14 DP rows matched to the QMS-0025 board** — Req QV-29 — L1 `dp-board-match.test.mjs` ("DP row → QMS-0025: SourceProgram + Title, or Title alone when the board title has no SourceProgram"; "name and version must both match: another version or none on the board stays below 80%"; "no match at 80%: the closest item is kept as a hint; nothing in common is no match"; "a new Feature title maps back when it holds the Title; the service part drops the version"; "a Title unlike the PsName: the search combines PsName and Release, so the Feature Create Feature made is found"); browser check with Azure DevOps mocked (QMS-0025 board with a Feature and a User Story naming one DP row's Title, one DP row without a match): the matched row shows "Feature id n%" and "Story id n%" as links; the other shows "no match" and Create Feature, whose opens the default Create Feature form (TC-QV-16); the CSV holds the "QMS-0025 match" column; no page errors. **UAT**

**TC-QV-15 Rearrange the DP columns** — Req QV-30 — L1 `query-view.test.mjs` ("column order: saved order first, new query columns keep their place; move by drag or one step"); browser check with Azure DevOps mocked (DP view): dragging the Title heading onto the first heading makes Title the first column; dragging "QMS-0025 match" onto the second heading puts it second with its cells; Columns → "Move ID right" moves ID one step; the order is kept after a reload; "Query order" restores the query's order with QMS-0025 match last; no page errors.

**TC-QV-16 Create Feature from Release Details opens the default form** — Req QV-31, CON-56 — L1 `dp-board-match.test.mjs` ("Create Feature from a DP row: Program (SourceProgram, else DP) | PsName | vRelease, falling back to the Title"), `release-source.test.mjs` ("Create Feature title from a release: \"Stream | Name | vRelease\", mapping back to the release"); browser check with Azure DevOps mocked (QMS-0025 board with Epic #700 "DP"; DP row #502 SourceProgram DHP, PsName DoseNav, Release 2.1, no match): Create Feature opens "Add Feature under an Epic" with Parent Epic "#700 · DP" and the title "DHP | DoseNav | v2.1"; without a Time Writing connection the button is disabled and says so; no page errors. **UAT**

**TC-QV-17 Supported Releases section in Pulse Check** — Req QV-32, QV-24, QV-25 — L1 `dp-milestones.test.mjs` (the two unique-release tests), `streams.test.mjs` ("Pulse Check streams: …"); E2E `documents-and-data.e2e.mjs` ("TC-QV-17: Pulse Check folds the DP Supported Releases list; Show list opens it and the choice is remembered"); browser check with Azure DevOps mocked (the TC-QV-10 data): Pulse Check → Current month releases (October) shows "Supported Releases · DP · October 2026" with "3 releases · 4 milestones" and no list until **Show list**; opened, #501 RSGMS 3.0.0.2 once with SFV and DT chips and "Completed (DT)"; the Releases tab (September) shows #504 with DT; no page errors.

**TC-QV-18 Supported summary next to Releases, with S&S IT** — Req QV-33 — **UAT** — L1 `windchill-releases.test.mjs` ("Pulse Check Supported line: the export's releases with a document dated in the month, \"name number\", newest first (QV-33)"); E2E `documents-and-data.e2e.mjs` ("TC-QV-18": an S&S IT export imported, Pulse Check → Releases with the header month 2026-11 (the tab shows the month before) shows "SUPPORTED · October 2026 · 4 supported releases" with "S&S IT [4] : …", and for 2026-09 "S&S IT [1] : CareLink 3.2").
- Steps:
  1. Import the S&S IT export (`e2e/fixtures/windchill-export.csv`, named "S&S IT"); with a DP connection fetched (TD-02), open Pulse Check → Releases; set the header month.
- Expected:
  - Next to the RELEASES summary a SUPPORTED summary lists, per stream and in the same format, "DP [n] : name release, …" (its Supported Releases) and "S&S IT [n] : name number, …" (the export's releases with a document whose Last Modified is in the month), with the total in the title; a stream without any shows "none".


**TC-QV-19 Tool Validations: unique tools in the month** — Req QV-34 — L1 `streams.test.mjs` ("Tool Validations: one entry per tool, whatever the number of its documents (QV-34)"); browser check with the Tool Validations connection fetched (TD-02 fixture: five documents in October — Minitab Validation Plan / Protocol / Report under Area Path "…\Tool Validations\Minitab", "JIRA Cloud v9.4 Validation Protocol" and "… Report" under "…\Tool Validations") → Pulse Check → Releases (header month November, the tab shows October) shows "Tool Validations [2] : JIRA Cloud 9.4, Minitab", the Supported summary the same line (October, the tab's month — never the header month's data), the quadrant 2 releases · 5 documents, and the Dashboard delivery table 2 for October; with the header month set to October the Releases tab shows September (0 tools in both summaries) and the Current month releases tab shows the two tools in both summaries.

**TC-QV-20 Tool Validations view without the summary strip** — Req QV-35 — browser check: Release Details → Tool Validations (TD-02 fixture) shows the Releases table and the query table with the search box, sortable headings, resize handles and Export CSV, but no State / Type chips and no People row; Release Details → CP still shows the strip.
- Expected:
  - A tool with several documents in the month is one entry; its document count is the number of documents.
  - A document whose Area Path has no tool folder is named by its Title before the version or the document word.

**TC-QV-21 IOCC Completed and Supported Releases** — Req QV-36 — L1 `streams.test.mjs` ("IOCC: Completed = Release Notes or Verification Report signed, Supported = also Release Plan; each release once (QV-36)"; "Pulse Check streams: the five Azure streams in order …"); browser check with the IOCC connection fetched: Pulse Check → Current month releases shows IOCC's quadrant as completed / supported, the Releases line lists each completed release once with its Type of Release, and the Supported summary lists the supported releases (release plans included); the Dashboard delivery table shows the same counts.

**TC-QV-22 IOCC grouping** — Req QV-37 — L1 `nested-groups.test.mjs` ("nested groups: type, then name, then version; blank last; keys unique per path (QV-37)"), `streams.test.mjs` (the IOCC name without the document words); browser check with the IOCC connection fetched: Release Details → IOCC opens grouped by Type of Release with each group's release count; add then by Name and then by Release (nested, indented); collapse one group, then Collapse all and Expand all; No grouping shows the flat list; a release's notes, report and plan are one row with their documents under it.

**TC-QV-23 Windchill releases matched to the QMS-0025 board** — Req QV-39 — L1 `dp-board-match.test.mjs` ("Windchill release (S&S IT) → QMS-0025: the same search with the release name and number; Create Feature title (TC-QV-23)"); browser check with the QMS-0025 board loaded (one Feature "Remote Diagnostics v1.6") and an S&S IT export holding Remote Diagnostics 1.6 and another release: the first row shows "Feature id n%" as a link; the other shows "no match" or the closest item and Create Feature, which opens the default New Feature form titled "S&S IT | name | vrelease"; sorting by the column and the releases CSV carry the match; no page errors. **UAT**

**TC-QV-26 Create Feature on every stream's releases** — Req QV-46, QV-31 — L1 `dp-board-match.test.mjs` ("IOCC, Content and Tool Validations releases → QMS-0025: the same search, Create Feature when nothing matches (TC-QV-26)"); browser check with the QMS-0025 board loaded and an IOCC and a Tool Validations view fetched: each release table ends with **QMS-0025 match**; a release whose Feature is on the board shows "Feature id n%" (and "Story id n%"); a release without one shows the closest item or "no match" and **Create Feature**, which opens the New Feature form titled "IOCC \| {Type of Release} {name} \| v{release}" (Tool Validations: "Tool Validations \| {tool} \| v{release}") under the Epic named like the stream; the Time Writing Feature column has no button; without the board loaded the cell reads "board not loaded" and Create Feature stays offered (disabled with its reason when it cannot open); no page errors.
**TC-QV-27 Consolidation and raw data on two tabs** — Req QV-47 — E2E `documents-and-data.e2e.mjs` ("TC-CON-39 / TC-CON-37 / TC-QV-27: a Windchill export lists its unique releases, clubbed names included, its raw rows on their own tab, and exports a neutralised CSV"); E2E ("TC-QV-43: every Release page has …"); browser check: open DP, CP, IOCC and Content under Release Details — each shows its releases first and the query rows only on the "Source data (n)" tab; Tool Validations shows the Expiry list first and the query rows on its Tool List [TFS] tab, with no Releases table (TVL-14); open S&S IT and an ECP export — Releases first, the imported rows with search and Export on "Source data (n)"; the tab chosen stays when moving between pages.
**TC-QV-28 Compact page actions** — Req QV-48 — E2E `documents-and-data.e2e.mjs` ("TC-CON-55 / TC-QV-28: an ECP setup named \"ECP - Type 2\" reads projects from the 3rd Location folder, is listed on its own, with compact page actions"); browser check: on DP / IOCC the source bar shows "Show: {month} / All months", a small ↻ (tooltip "Refresh from Azure") and ⋯ with Load from Git and Connection settings (CP: no Show); on a Windchill export a small ↻ (tooltip "Import newer export") and ⋯ with Load from Git and Remove this export…; the menu closes on Escape or a click outside.

**TC-QV-30 CP Platform titles (PF1.0 / PF2.0)** — Req QV-49 — L1 `cp-reporting.test.mjs` ("Platform titles: \"PF1.0 / PF2.0 <Name>-<Number>\" give the name with its variant and an alphanumeric number (QV-49, TC-QV-30)"); browser check: a CP container "PF2.0 Carpo-A12" shows as "PF2.0 Carpo A12" with no warning, and Create Feature offers "PF2.0 Carpo | A12".

**TC-QV-31 Pulse Check over a quarter, half-year or year** — Req QV-50 — L1 `pulse-check.test.mjs` ("Pulse Check periods: calendar quarter, half-year and year against the period before; each release once (QV-50, TC-QV-31)"); E2E `shell.e2e.mjs` (TC-MYD-01: Quarter shows "Releases · Qn yyyy vs Qn yyyy" and the work opened and closed; Month brings the tabs back); browser check: a release seen in two months of the quarter counts once.

**TC-QV-32 Pulse Check opens without recalculating** — Req QV-51 — L1 `streams.test.mjs` ("Pulse Check is worked out once per data set: the same sources and month give the same streams; new data recalculates (QV-51, KB-27)"); browser check with the real DP, CP, IOCC and S&S IT data loaded: open Pulse Check, switch to Year and back, leave and reopen — the page opens without a pause after the first time; Refresh, then the figures follow the new data.

**TC-QV-33 Content releases named by Title** — Req QV-52 — L1 `release-source.test.mjs` ("QV-52: Content releases are named by the Title — one per unique Title, no name and number from the paths"); browser check with the Content connection fetched: the Content page lists one release per Title (in the Release name column, no Release column; no Name / Release columns in the query output); Pulse Check → Releases shows "Content [n] : <Title>, <Title>"; the Monthly pack Content line lists the same Titles.

**TC-QV-34 DP Month & Year and Milestones columns** — Req QV-53 — L1 `dp-milestones.test.mjs` ("QV-53: the DP table shows each release's Month & Year (its DDT Date) and every milestone's month and status"); browser check with the DP data: Release Details → DP shows Month & Year and Milestones after the query's columns; tick All months — releases without a DDT Date show "No DDT Date"; a release counted as Supported has a ✓ on a milestone in the header month; search "No DDT Date" finds them; Export carries both columns.

**TC-QV-35 DP releases planned in the month** — Req QV-54 — L1 `dp-milestones.test.mjs` ("QV-54: a release without a DDT Date is listed in the months of its Planned / ToBePlanned milestones, but not counted"); browser check with the DP data: pick a month in which a release without a DDT Date has an SFV / PRD / RPE date with status Planned or ToBePlanned — it is listed with "… · planned, not counted" in Month & Year; the Completed and Supported Releases counts above the table do not change; the Month filter note names how many releases have neither.

**TC-QV-36 DP Supported never more than the month's list** — Req QV-56 — L1 `dp-milestones.test.mjs` ("DP counts for a month: Completed = releases with DDT Done in the month; Supported = unique listed releases with any milestone Done in the month (QV-56)"); `streams.test.mjs` ("Pulse Check streams: the five Azure streams in order, not-set-up ones listed, each read with its rule"); browser check with the DP data: for a month, Supported Releases ≤ the rows listed for the month; a release with SFV Done this month but its DDT in a later month is not Supported this month.

**TC-QV-37 Release naming patterns** — Req QV-55, QV-52 — L1 `naming-patterns.test.mjs` ("QV-55: wildcard patterns — * any text, {…} the release name; Content up to _RELEASE, IOCC after Conformance Verification / Test Tools"; "QV-55: patterns are shared settings — checked on read, per stream, built in when not saved; same list for the same settings"; "QV-55: Content documents are grouped under their release; IOCC by Conformance Verification and Test Tools names, others as before"); E2E `shell.e2e.mjs` ("TC-QV-37: Stream mapping → Release naming patterns — built-in Content and IOCC patterns, a Title tried, a pattern edited, applied and reset"); browser check with the Content and IOCC data: Release Details → Content shows one row per _RELEASE name with its documents under it; IOCC shows Conformance Verification and Test Tools groups; change a pattern, Apply, Save to Git — another browser shows the same names.

**TC-QV-38 Epics to match Features in** — Req QV-57 — L1 `feature-epics.test.mjs` ("QV-57: per stream, the Epics a release is matched in — checked when read, shared in Git (TC-QV-38)"; "QV-57: the board match searches only the Features and User Stories under the chosen Epics (TC-QV-38)"); E2E `shell.e2e.mjs` ("TC-QV-38: Stream mapping → Epics to match Features in — per stream, chosen from the board, cleared back to the whole board"); browser check with the QMS-0025 board and a stream view: choose the stream's Epics, Save to Git — the Board column matches only Features under them (a same-named Feature in another Epic is no longer offered) and Create Feature's existing-match check follows; Clear — the whole board again; another user loads the setting from Git.

**TC-QV-39 Release counts with entered placeholders** — Req QV-58 — L1 `release-counts.test.mjs` ("QV-58: entered release counts — CP, DP and IOCC only, months YYYY-MM, whole numbers (TC-QV-39)"; "QV-58: a stream without data takes the entered counts, marked; without them it is a placeholder; data always wins (TC-QV-39)"); E2E `shell.e2e.mjs` ("TC-QV-39: an Admin enters CP release counts for a month without data; My dashboard shows them as entered, the others as placeholders"); browser check: with CP not fetched, enter CP Completed 3 / Supported 5 for the month — My dashboard, the CP page, Pulse Check and the Monthly pack show 3 / 5 as entered; fetch CP — its real counts replace them; DP without data and without entered counts shows — and the reason.

**TC-QV-40 IOCC bulk Features and bulk creation Epics** — Req QV-59, DPF-04, CNB-01, ADM-05 — L1 `bulk-epics.test.mjs` ("QV-59: the bulk creation Epic per stream — mine over shared; none built in for any stream (TC-QV-40)"; "QV-59: without a mapped bulk creation Epic, Create Features says why and where to map it (TC-QV-40)"; "QV-59: IOCC releases in bulk — the Epic setup’s DoD and stories (no Release / PU sets, DPF-09), QE by the release name (TC-QV-40)"), `content-bulk.test.mjs` (no Content Epic built in); E2E `shell.e2e.mjs` ("TC-QV-40: Stream mapping → Bulk creation Epics — shared and my own Epic per stream, mine used": every stream "not set" at first, no built-in hint), `documents-and-data.e2e.mjs` ("TC-QV-40: no bulk creation Epic is built in — without one mapped, Create Features is disabled with the reason and opens Bulk creation Epics; a shared mapping saved there is used": DP and Content Create Features disabled with "No DP bulk creation Epic is set: map it in Admin → Stream options → Bulk creation Epics.", Open Bulk creation Epics opens the section, a shared DP Epic saved there enables Create Features and its pop-up works under that Epic); browser check with the QMS-0025 board and IOCC: set the IOCC bulk Epic (shared), its Feature setup (Release / PU sets, QE Mapping columns), tick IOCC releases, Create Features — each Feature is created under that Epic with its set's DoD and stories, assigned to the mapped QE; set my own DP Epic — DP's Create Features uses it, others keep the shared one. ; L1 `bulk-epics.test.mjs` ("QV-59: a shared bulk creation Epic is saved straight to Git — only with a writable Git connection, else the reason (TC-QV-40)"); E2E `shell.e2e.mjs` ("TC-QV-40: Admin → Overview flags a stream without a bulk creation Epic for attention; Save to Git on a shared Epic commits it straight to Git")

**TC-QV-42 IOCC bulk creation uses the IOCC Feature setup** — Req QV-61, QV-59 — L1 `bulk-epics.test.mjs` ("QV-61: IOCC bulk creation uses the IOCC Epic's own Feature setup (DoD and User Stories); without a setup a release is skipped (TC-QV-42)"); browser check: with a Feature setup (DoD and stories) on the IOCC bulk Epic, IOCC → Create Features says it uses that Feature setup and each row lists its User Stories; the created Feature has that DoD and those stories.

**TC-QV-41 My naming patterns** — Req QV-60, CON-93 — L1 `my-naming-patterns.test.mjs` ("My naming patterns: IOCC, Content and Tool Validations only, kept here, used for me instead of the shared ones (QV-60, TC-QV-41)"); E2E `shell.e2e.mjs` ("TC-QV-41: My settings → My naming patterns — your own patterns for IOCC, Content and Tool Validations, kept on this computer, back to the shared ones"); browser check: with Content fetched, My settings → My naming patterns → Content: a pattern of your own changes Release Details → Content and the Content counts for you only (another browser keeps the shared names); Use the shared patterns restores them; DP and CP are not offered.

**TC-QV-43 Every Release page follows UI-STANDARDS §10** — Req QV-62, QV-47, QV-48, QV-64, QV-65 — E2E `documents-and-data.e2e.mjs` ("TC-QV-43: every Release page has the source bar, counts, Releases | Source data tabs (Tool Validations: Expiry list | Master list | Tool List [TFS] | Setup, no Releases table) and the common columns in order": with the synthetic sample read by DP, IOCC, Content and Tool Validations and the S&S IT export imported — each page's source bar has Show {month} / All months, ↻ and ⋯ and no "name · source · fetched" text or ⓘ Info, and ⋯ starts with "source · fetched / imported" (QV-70); the tiles read Releases in {Month} then DP and IOCC Completed, Supported, Tool Validations and S&S IT Supported, Content none more, each with ⓘ What was counted and the numbers 24px; the tabs read Releases, Source data (n) — Tool Validations: Expiry list, Master list, Tool List [TFS], Setup (TVL-14), no Show and no Releases table; DP's table starts with Select and ends with Time Writing Feature, Planned (h), Booked (h), QMS-0025 match (hours right-aligned), with Select all shown, Clear and Create Features (0); Content's columns are Select, Release name, Approved, Documents (right-aligned), Time Writing Feature, Planned (h), Booked (h), QMS-0025 match; S&S IT's Release name, Release, Latest Last Modified, Documents, Time Writing Feature, Planned (h), Booked (h), QMS-0025 match (Documents and hours right-aligned) and its Releases in {Month} tile equals the table's "n of N releases"), ("TC-CON-53 / TC-QV-43: …": ECP's table starts with Release name, Release, no Project columns, and its main tab is Releases); browser check in light and dark mode at 1440 px and 390 px: DP, CP, IOCC, Content, Tool Validations, S&S IT and ECP show the parts in this order; CP has no Show and its counts above the tabs (one Releases panel, no second panel with the same title; Shared activity's Signed documents right-aligned, ▸ opens the evidence); IOCC's group rows indented by level without inline styles; the Windchill Releases controls (Logic, Read from, column, Save locations to Git) wrap within the panel at 390 px; a release name's ▸ opens its documents (CP: its signature evidence); Create Feature, Create Features and Export behave as before (disabled with the reason when the role lacks the right, CON-102); the KPI tiles of My dashboard, Pulse Check, Dashboard and My work keep their layout with 24px numbers.

**TC-QV-44 Action results in Background jobs** — Req QV-63, NAV-36, CON-36 — L1 `background-jobs.test.mjs` ("QV-63: an instant result is a finished entry — done or to check — without blocking a job of the same key (TC-QV-44)"); E2E `documents-and-data.e2e.mjs` ("TC-QV-44: the result of an action on a Release page — a Windchill import, a file that is not an export — is listed in Background jobs, not as a notice on the page": the import is a done entry "Import Windchill export · S&S IT" with "7 results imported from windchill-export.csv."; a newer file that is HTML is an entry that needs a look, the top-bar button says "1 to check", the page shows no notice and the data is unchanged); browser check: on DP (on-prem view, Git storage connected) ↻ and ⋯ → Load from Git each add a running job "Refresh from Azure · DP" / "Load from Git · DP" that ends with the fetch's result; a failed refresh with data shown leaves the warning "Not refreshed: … The data shown is from {date}." on the page; on S&S IT ⋯ → Load from Git, and Save locations to Git (its button disabled with "Saving to Git… (Background jobs)" beside it while it runs), end as entries with their result; on Import Windchill export a file that is not an export stays in the form as an error and is an entry too; the Background jobs panel is readable in light and dark mode.

**TC-QV-45 Counts of Content, Tool Validations and the Windchill streams** — Req QV-64 — L1 `release-source.test.mjs` ("QV-64: Content and Tool Validations count the releases of the month as their Releases table lists them — approved in the month, else changed in it (TC-QV-45)"), `windchill-releases.test.mjs` ("QV-64: a Windchill page counts the releases with a document dated in the month — the Releases table list and Pulse Check's Supported line (TC-QV-45)"); E2E ("TC-QV-43: …" — the tiles of Content, Tool Validations and S&S IT); browser check: for the header month Content's Releases in {Month} equals Pulse Check's Content count and the Releases table's count; Tool Validations' Supported equals the tools on Pulse Check's Supported line; S&S IT's and ECP's Releases in {Month} and Supported equal the table's "n of N" and Pulse Check's Supported line; ⓘ What was counted says why Completed (and for Content Supported) is left out; an export without a date column shows — with the reason.

**TC-QV-46 Time Writing Feature and hours on DP, CP and Windchill** — Req QV-65 — L1 `release-source.test.mjs` ("QV-65: the hours of a matched Feature are its Time Writing Tasks, all months, each once — as the releases matched by name (TC-QV-46)"); E2E ("TC-QV-43: …" — the columns of DP and S&S IT); browser check with the synthetic sample: a DP, CP or S&S IT release whose QMS-0025 match is a Feature at the threshold shows that Feature with its match % and the Planned (h) / Booked (h) of its Time Writing Tasks, the same hours as the Feature shows on Time Writing; a release matched only by a User Story, or not at all, shows — in all three; sorting and Export give the hours as numbers.

**TC-QV-47 Pulse Check — streams not counted** — Req QV-66 — **UAT** — L1 `pulse-streams.test.mjs` ("QV-66: the streams not counted — names compared case-insensitively, unknown names ignored, a new stream counted (TC-QV-47)"; "QV-66: the filter keeps names not offered now when another stream is ticked, and reads only known shapes (TC-QV-47)"; "QV-66: a period’s total and Change leave out the streams not counted in both periods (TC-QV-47)"); E2E `pulse-streams.e2e.mjs` ("TC-QV-47: Pulse Check — S&S IT not counted: greyed and marked, left out of the Supported total, the Windchill exports table and the Quarter total and Change"); browser check at 1440 px (light and dark) and 390 px: with the S&S IT export imported, Streams not counted → S&S IT — its Supported line and Windchill exports row stay, greyed with “Not counted”, the Supported total drops by its releases, ⓘ reads “Not counted (Streams filter): S&S IT.”, Export → CSV has Counted = Not counted; Quarter: its row greyed with its releases, the Releases tile, Total and Change without it in both quarters; the Work closed and opened ⓘ says every Epic counts; Monthly pack says it counts every stream; Reset filters counts it again.

**TC-QV-48 Streams not counted — team default and own choice** — Req QV-67, UI-23 — L1 `pulse-streams.test.mjs` ("QV-67: the team default and each person’s own choice are entries of the views files; own wins, removing it uses the team default (TC-QV-48)"); E2E `pulse-streams.e2e.mjs` ("TC-QV-48: the Tool Owner saves the streams not counted as the team default; another person sees it, changes it for themselves and goes back to it"); browser check with a mocked GitHub: the Tool Owner ticks CP and ECP, Save view for everyone writes `pulse-streams` with who and when to `personal-views-defaults.json`; a People Manager sees “2 selected” and “The view for everyone, saved by …”, no Save option; their own change is kept after a reload and **Use the view for everyone** goes back; with the sample or View as no Save option.

**TC-QV-49 Pulse Check → Year — Completed releases, cumulative** — Req QV-68, QV-69, QV-66 — **UAT** — L1 `cumulative-releases.test.mjs` ("QV-68: each month counts as its Month tab; December’s running total per stream is the sum of the twelve Month tabs (TC-QV-49)"; "QV-68: the Year row counts each release once — the same for DP and Tool Validations; S&S IT’s release in two months and entered counts only in the chart (TC-QV-49)"; "QV-68: the lines stop at the current month; a stream not counted has no line and stays out of the sums (TC-QV-49)"; "QV-69: the switches — per stream and Month sum on, All streams off by default; only booleans read (TC-QV-49)"); E2E `cumulative-releases.e2e.mjs` ("TC-QV-49: Pulse Check → Year — Completed releases cumulative per stream, the All streams line and month sums, switches remembered, the table and its Export, streams not counted left out": with the synthetic sample read by DP, IOCC, Content and Tool Validations and the S&S IT export imported — not in the Quarter view; in the Year view a line per stream and Month sum in the legend, All streams off; the table has January to December, S&S IT's October 4 as its Month tab's Supported line, December empty, Month total and Cumulative total; S&S IT's running total equals the sum of its months and is higher than its Year row (a release dated in September and October), ⓘ says why; the chart's Table view ends on that sum; Export → CSV has the totals; Per stream off and All streams on are kept after a reload; Streams not counted → S&S IT removes its line and column, ⓘ names it, the total changes; Reset filters brings it back); browser check at 1440 px (light and dark) and 390 px: the lines, dashed lines from the sixth stream, the All streams line and the grey month columns readable in both themes; Data labels on — each line's value at the current month beside its column, each column's sum, no label below the axis; the tooltip lists each stream's running total with the month's count (+n); at 390 px the legend wraps, the chart fits the width and the table scrolls inside the panel; a past year has all twelve months.

**TC-QV-50 Source bar without duplicated information** — Req QV-70, QV-62 — E2E `documents-and-data.e2e.mjs` ("TC-QV-43: every Release page has the source bar, …": on DP, IOCC, Tool Validations, Content and S&S IT the bar holds no "name · source · fetched" text and no ⓘ Info, ⋯ "More actions: {name}" starts with the line "source · fetched / imported …"; on DP ⋯ → About this source… opens the pop-up RELEASE PAGE · DP with source · fetched, the month filter rule and the items fetched), ("TC-QV-44: …": after a failed import S&S IT's ⋯ still reads "7 results · imported"), `custom-streams.e2e.mjs` ("TC-STR-06: …": Labeling's ⋯ starts with "example / Labeling · query · fetched"); browser check in light and dark mode at 1440 px and 390 px on DP, CP, IOCC, Content, Tool Validations, S&S IT and ECP: Show, ↻ and ⋯ right-aligned with the warnings below; the ⋯ line wraps inside the menu and is skipped by ↓ / ↑; About this source… closes on Close, × and Escape with the focus back on ⋯; a screen reader names ⋯ "More actions: {view name}".

**TC-QV-51 Selected month / All months toggle on the Release pages** — Req QV-71 — E2E `documents-and-data.e2e.mjs` ("TC-QV-43: every Release page has the source bar, counts, Releases | Source data tabs (Tool Validations: Expiry list | Master list | Azure | Setup) and the common columns in order": the bar's Show is a toggle Selected month | All months, Selected month chosen by default and its tooltip naming the header month; All months shows every month) ; E2E `custom-streams.e2e.mjs` (the custom stream's bar has the toggle) ; browser check: on DP, IOCC, Content and S&S IT the month is not repeated in the bar; switching to All months and back changes the Releases table.

**TC-QV-52 CP: Selected month / All months** — Req QV-72 — L1 `cp-reporting.test.mjs` ("QV-72: CP All months — every release container with a QA/QE signature in any month, completion review only per month (TC-QV-52)") ; browser check: on CP choose All months — the Releases table lists every signed release container of every month, the counts stay the header month's; Selected month returns to the month's releases.

**TC-CON-67 Upload latest export… on a Windchill export page** — Req CON-108 — E2E `documents-and-data.e2e.mjs` ("TC-QV-44: the result of an action on a Release page — a Windchill import, a file that is not an export — is listed in Background jobs, not as a notice on the page": ⋯ → Upload latest export… opens the file picker; the export is imported for the same page, listed in Background jobs) ; browser check: on an existing export page choose ⋯ → Upload latest export… and a newer CSV — the counts and Releases follow the new file, the page keeps its name.

**TC-QV-24 CP releases from the asset Titles** — *(Retired — see TC-QV-25)* Req QV-40 — L1 `streams.test.mjs` ("CP: the release from the asset Title "[Release name] [Release No] [Asset name]", each release once; fuzzy QMS-0025 match (TC-QV-24)"); browser check with a CP query holding three assets of one release in both namings ("Care Pathways 3.1 Test Report", "Care Pathways 3.1.0 SRS", "Risk Analysis v3.1 (Care Pathways)") and one of another (3.2), and a QMS-0025 Feature "CP | Care Pathways | v3.1": Release Details → CP lists two releases (3 and 1 assets), 3.1 with its Feature and %, 3.2 with Create Feature opening the New Feature form titled "Care Pathways | v3.2" (release name and number only) under the CP Epic, and found after it is created; Pulse Check's Releases and Supported summary show "CP [2]"; no page errors. **UAT**

**TC-QV-25 CP release reporting from QA/QE signatures** — Req QV-41…QV-45 — L1 `cp-reporting.test.mjs` ("CP release reporting: Supported and Completed per Release container from QA/QE signatures (TC-QV-25)"; "CP release reporting: slots, roles, dates and month boundaries (TC-QV-25)"; "CP release names: version from the title, Content from the CP_Releases data set, never deciding the count (TC-QV-25)"; "CP Create Feature title: the release name and number only, found again by the board match (TC-QV-25)"; "the CP menu entry: its tree-query connection, listed even when hidden from the menu (TC-QV-25)"; "CP names: the connection with Content is used, a Release with text around the version is read, and a missing version says why (TC-QV-25)"); browser check in the desktop app with the CP connection holding the CP_Release_Folder tree query and a second CP connection with CP_Releases, month October 2026: Release Details → CP shows the counts Releases in October 2026, Completed and Supported, and "n releases · m QA/QE-signed documents" on its Releases table (Release name, Release, Release Notes signed, Documents, Container, Completed, QMS-0025 match); a release with twelve asset folders is one row; a release whose main Release Notes is signed in October is Completed, one with only an asset's Release Notes is not; Clinical Platform Global is under Shared activity; names read "Setebos 26.2" or show their status; a row opens its signatures; Export evidence CSV downloads the month's signatures; Pulse Check's CP quadrant and Supported summary match; no page errors. **UAT**

**TC-CON-42 Auto-fit tables and Wrap text** — Req QV-38 — E2E `documents-and-data.e2e.mjs` ("TC-CON-42": a Windchill export's Releases table starts one line per cell; dragging the first heading's edge 200px to the right widens that column and the table by about 200px while the other columns keep their width; Wrap text on makes cells wrap (pre-wrap), off back to one line); browser check: the same on Release Details (query table and IOCC releases) and on QE Mapping, the choice remembered per table after a reload.


### 6.9 Dashboard and capacity

TC-OVR-01 to TC-OVR-03 tested the earlier Overview and are **retired** with OVR-01 to OVR-08; the Dashboard is tested by TC-OV-11 to TC-OV-14 (§6.2).

**TC-OVR-01 Scope and tabs** — *(Retired — see TC-OV-11)* Req OVR-01…04
- Expected:
  - The default is Team, and the choice is remembered.
  - Individual with no person shows "Choose whose overview to show.".
  - The tabs "This month · {Month}" and "Trends" are remembered.
  - The metrics show utilization, Overloaded, Has capacity and Absence.

**TC-OVR-02 This month content (retired)** — Req OVR-05
- Expected:
  - All the panels of OVR-05 are present for TD-01.
  - The matrix shows at most 8 streams plus Other.
  - "How utilization is calculated" is collapsed by default.

**TC-OVR-03 Trends content (retired)** — Req OVR-06…08
- Steps:
  1. Switch between 6 and 12 months.
  2. Click a month bar.
- Expected:
  - All the charts of OVR-06 render.
  - Epic colours are unchanged between 6 and 12 months.
  - The click changes the header month.

**TC-CAP-02 Holidays and common activities** — Req CAP-04, CAP-05, CAP-10…12 — L1 `capacity.test.mjs` ("holidays and common activities: mapped Epics / Features apply their month Tasks to everyone in scope": PI Planning for everyone lowers each person's available hours and is not their booked work; a region-scoped audit applies to that region only and the nearest mapping wins; a name-based holiday Feature still applies; mapping it explicitly replaces the name rule without counting twice; invalid mappings are dropped); browser check: Settings → Capacity → Holidays and common activities: enter the PI Planning Feature ID, Common activity, Everyone → it is listed with its hours and people for the header month; Pulse Check → Last month shows "… h common activities" per person and a Common activities part of the funded-hours ring; saving the capacity numbers keeps the mapping; Remove restores the Task to its assignee. **UAT**

**TC-CAP-03 NPRA maximum and tracking** — Req CAP-13 — L1 `capacity.test.mjs` ("CAP-38: Utilization = (work + trainings + other NPRA + common activities) ÷ (contractual − absence); NPRA split, checked against the maximum": a Task tagged npra (Other NPRA, 12 h) and a Task under a Feature tagged "NPRA Hours; Training" (Trainings, 30 h, 10 h over the 20 h maximum flagged); nothing deducted, both count as utilized hours; NPRA is no stream; settings without the field take 20 h; normalisation; "NPRA: nobody is charged for NPRA they did not book"), `dashboard.test.mjs` (settings with allowance 0 keep the former numbers); browser check (Pulse Check → Last month with the synthetic sample, whose CP / IOCC / QMS first Features carry "NPRA Hours"): the NPRA metric shows the booked hours and "max 20h per person"; the NPRA table lists each person with booked / planned / maximum / left and "Within 20h" or "n h over the maximum"; "Who has capacity" shows "NPRA nh / 20h" under the person; a person without NPRA Tasks keeps funded − absence as available; Settings → Capacity → Edit shows "NPRA maximum per person per month (h)" and saving 0 removes the flag; no page errors. **UAT**

**TC-CAP-04 Joining and leaving dates** — Req CAP-14 — L1 `capacity.test.mjs` ("joined on / left on: funded hours for the working days employed …"); browser check:
- Steps: Settings → Resources: set Left on 2026-10-14 for one person and Joined on 2026-11-02 for another; open the Dashboard for October 2026.
- Expected: the first person has 10 of 22 days, 80 h funded (8 h/day), and the team's funded total drops accordingly; the second is not counted, and the month view lists their October hours to be checked; without dates everyone keeps the full month.

**TC-CAP-05 Default Joined on** — Req CAP-15 — L1 `capacity.test.mjs` ("default Joined on (1 May 2026 unless changed) …"); browser check: Settings → Resources shows Default Joined on 1 May 2026; the Dashboard for April 2026 shows no capacity and lists the April hours to check; May 2026 counts everyone; give one person their own Joined on 2026-01-05 and April shows that person; Clear the default and April counts everyone again; Edit capacity settings… keeps the default.

**TC-CAP-06 Team Holidays and Training** — Req CAP-16, ATM-24 — L1 `capacity.test.mjs` ("Team Holidays and Training (same Epic ID): training is NPRA, PTO / Sick / Unplanned stay absence; the Epic title is not read (TC-CAP-06)"), `my-work.test.mjs` ("Team Holidays and Training: my Training story is offered in the leave and training list, not as missing work (TC-CAP-06)"); browser check with the QMS-0025 board: Pulse Check → Last month — a person's Training month Task hours appear in the NPRA table and the NPRA total, not in absence; PTO / Sick / Unplanned stay in the absence split; Bulk actions → Create month tasks lists your Training and leave stories in the Leave and training list (Training / Leave marks), unticked, and none of them as missing work; Settings → Capacity & periods names the Epic "Team Holidays and Training".

**TC-CAP-07 Everyone in Resources** — Req CAP-29, CAP-30, CAP-31 — L1 `resources.test.mjs` ("Resources list everyone who can be given a region: Time Writing, assignees, historical hours, team members, added by name (CAP-29, CAP-31)"; "Team members are read from Azure DevOps (read only), groups left out, one entry per name (CAP-30)"); browser check with the Time Writing data fetched: Resources lists the people with Time Writing and, as "No Time Writing yet", the other assignees and the historical-hours people; the team's other members are read when the page opens (or the PAT hint is shown); people not in Azure DevOps are listed apart (v7.0.0, CAP-51); a region set for a leaver applies to their historical holidays.

**TC-CAP-08 Training read from the User Story or a tag** — Req CAP-32 — L1 `capacity.test.mjs` ("training under the absence Epic is read from the User Story or a Training / NPRA tag, not the shared Feature (TC-CAP-08)"); browser check with the QMS-0025 board: a person's Feature under the Absence and Training Epic holds "<Name> \| PTO \| Time Writing" and "<Name> \| Training \| Time Writing" — Pulse Check counts the PTO Task as absence and the Training Task as NPRA; tag a leave Task "Training" or "NPRA" and it moves to NPRA; a Task tagged "Training" in a project stream counts as NPRA.

**TC-CAP-09 Remove a person; who counts in capacity** — Req CAP-33, CAP-34 — L1 `capacity.test.mjs` ("CAP-33: a person removed in Resources is left out of capacity, utilization and team totals (hours too), listed apart; restore brings them back"); E2E `shell.e2e.mjs` ("TC-CAP-09: Capacity & time shows who counts in the month's capacity; Not part of the team takes a person out of capacity, Restore brings them back": the count on Capacity & time → Capacity and absence, Not part of the team from the person's drawer, the person under the Status filter "Not part of the team", Restore in the drawer) — **UAT**; browser check with real data: Capacity & time → Capacity and absence shows "Capacity in <Month>: n people, X h available" and Info lists the people; in People mark a person Not part of the team — the count drops by one, Pulse Check → Last month and the Team overview Utilization tile no longer count them; Save to Git, reload in another browser — still removed; Restore brings them back.

**TC-CAP-10 Old Calculation tab** — Req CAP-35 — L1 `capacity.test.mjs` ("CAP-35: Old Calculation — every hour (absence, holidays, NPRA included) against working days × funded hours; status from planned") ; E2E `shell.e2e.mjs` ("TC-MYD-05: Team overview shows six headline tiles; each opens its analysis, with a trail back; Delivery opens Pulse Check": the Old Calculation tab lists people with the eight columns and a Month choice) — **UAT**; browser check with real data: Team overview → Old Calculation, choose a month — for one person check Net Capacity = working days × 8 h, Planned and Actual Hours include their PTO, holidays and NPRA, the two utilisations and Available Hours by hand; Status follows the Planned Utilisation.

**TC-CAP-11 Standard Hours and their breakup** — Req CAP-36, CAP-35 — L1 `capacity.test.mjs` ("CAP-35/36: Old Calculation — every hour (absence, holidays, NPRA included) against working days × funded hours − Standard Hours; status from planned") ; E2E `shell.e2e.mjs` ("TC-MYD-05: Team overview shows six headline tiles; each opens its analysis, with a trail back; Delivery opens Pulse Check": Standard Hours: 32h shown; Edit Standard Hours with lines Team meetings 8 h and Admin 16 h shows a 24 h total, Save shows the breakup and the first Net Capacity grows by 8 h) — **UAT**; browser check with real data: Team overview → Old Calculation shows Standard Hours: 32h and Net Capacity = working days × 8 h − 32 h; as an Admin, Edit Standard Hours, enter the real breakup, Save, Save to Git, reload in another browser — the same breakup and figures; a role without shared-settings rights sees no Edit.

**TC-CAP-12 Shared-time groups on or off in the Old Calculation** — Req CAP-37, CAP-35 — L1 `capacity.test.mjs` ("CAP-37: Old Calculation — an unticked shared-time group (All, All-<Region>) leaves Planned and Actual Hours") ; E2E `shell.e2e.mjs` ("TC-MYD-05: Team overview shows six headline tiles; each opens its analysis, with a trail back; Delivery opens Pulse Check": All, All-India, All-Netherlands and All-US ticked by default; All-India can be unticked and ticked again) — **UAT**; browser check with real data: Team overview → Old Calculation, untick All-India — an India person's Planned and Actual Hours drop by the All-India hours shown, others do not change; Pulse Check and Capacity and workload do not change; Save to Git and reload elsewhere — still unticked.

**TC-CAP-13 Utilization = utilized ÷ (contractual − absence)** — Req CAP-38, CAP-05, CAP-06, CAP-11, CAP-13, CAP-16, CAP-34 — L1 `capacity.test.mjs` ("CAP-38: Utilization = (work + trainings + other NPRA + common activities) ÷ (contractual − absence); NPRA split, checked against the maximum"; "holidays and common activities: mapped Epics / Features apply their month Tasks to everyone in scope"), `monthly-hours.test.mjs` ("monthly hours series spans the requested months and matches the capacity model per month") ; E2E `shell.e2e.mjs` ("TC-CAP-13: Pulse Check shows Utilization = utilized ÷ (contractual − absence) with Trainings and Other NPRA apart") — **UAT**; browser check with real data: Pulse Check → Last month → Who has capacity — for one person check Contractual = working days × 8 h, Absence = PTO + sick + unplanned + public holidays + other absence, Available = Contractual − Absence, Utilized = Work + Trainings + Other NPRA + Common activities, Utilization = Utilized ÷ Available; the team tile equals Σ Utilized ÷ Σ Available and Team overview shows the same figure.

**TC-CAP-14 Utilization split in Team overview** — Req CAP-39, CAP-38 — E2E `shell.e2e.mjs` ("TC-CAP-14: Team overview shows the utilization split in Workload by person and in a one-month Utilization tab": Workload by person headers; the Utilization tab's table headers, team line and Month choice) — **UAT**; browser check with real data: Team overview → Capacity and workload → Workload by person — for one person over one month, Contractual, Absence, Available, Work, Trainings, Other NPRA, Common activities and Utilized equal Pulse Check → Last month; Team overview → Utilization for that month shows the same rows and a team figure equal to the Utilization tile when no filter is set.

**TC-CAP-15 Unplanned absence counts as planned in the Old Calculation** — Req CAP-40, CAP-35 — L1 `capacity.test.mjs` ("CAP-35/36: Old Calculation — every hour (absence, holidays, NPRA included) against working days × funded hours − Standard Hours; status from planned": PTO 16 h and sick 8 h without an estimate add 24 h to Planned Hours; "CAP-37: Old Calculation — an unticked shared-time group (All, All-<Region>) leaves Planned and Actual Hours") ; browser check with real data: Team overview → Old Calculation — a person with leave booked but not planned shows the leave in Planned Hours; Pulse Check figures do not change.

**TC-CAP-16 Calculation profiles and the default profile** — Req CAP-41, CAP-42 — L1 `calculation-profiles.test.mjs` ("CAP-41/42: the default profile is \"Current (v4)\" (CAP-38) until another one is chosen"; "CAP-41: the built-in \"Old Calculation\" profile gives the Old Calculation figures; status from the plan"; "CAP-41: a custom profile — fixed base, Standard Hours, a deducted, counted and ignored bucket, plan source, status from the plan"; "CAP-41: a shared-time group left out of a profile leaves every bucket"; "CAP-41: profiles read from Git are checked; unknown defaults fall back to \"Current (v4)\""), the CAP-38 figures in `capacity.test.mjs` unchanged under the default profile; E2E `shell.e2e.mjs` ("TC-CAP-16: Settings → Calculation profiles — built-ins, a copied profile edited and made the default for every page": built-ins listed with their formula, not editable; a copy with no counted bucket cannot be saved; saved, made the default, shown on the Utilization tab; deleted) — **UAT**; browser check with real data: make a copy of Current (v4) the default without changes — every figure on Pulse Check and Team overview stays the same; make Old Calculation the default — the Utilization tab's Available, Planned and Utilized equal the Old Calculation tab's Net Capacity, Planned and Actual Hours; Edit capacity settings and save — the profiles, Standard Hours and period lock days are kept (KB-41).

**TC-CAP-17 Lock figures** — Req CAP-43 — L1 `calculation-profiles.test.mjs` ("CAP-43: locked figures stay as locked when the data, the settings or the profile change; unlocking shows the live figures"; "CAP-43: locked figures read from Git are checked"); E2E `shell.e2e.mjs` ("TC-CAP-17: Team overview → Utilization — an Admin locks a month's figures and unlocks them with a reason": Lock figures, the lock note on the tab and the scope line, Unlock needs a reason, history shown) — **UAT**; browser check with real data: as an Admin lock last month, Save to Git; book an extra hour on a Task of that month and refresh — Pulse Check → Last month and Team overview → Utilization keep the locked figures and show the lock note; as a non-Admin there is no Lock or Unlock button; unlock with a reason — the live figures return and the audit log has both entries.

**TC-CAP-18 Profile picker for Admins** — Req CAP-44, CAP-02 — L1 `calculation-profiles.test.mjs` ("CAP-44: viewing a page with another profile changes only the settings that page computes with": the viewed profile's figures, the shared settings unchanged, unknown or no choice gives the default, locked months keep their figures); E2E `shell.e2e.mjs` ("TC-CAP-18: an Admin views Team overview and Pulse Check with another calculation profile, for that page only": default first, Old Calculation chosen changes the team figure and shows the note, Pulse Check still on the default, the shared default unchanged) — **UAT**; browser check with real data: as an Admin choose Old Calculation on Team overview — the Utilization tab equals the Old Calculation tab's Net Capacity, Planned and Actual Hours; a second user (not Admin) sees no picker and the default figures; Settings shows "Working hours per day".

**TC-CAP-19 One set of names for utilization figures** — Req CAP-45, CAP-38, CAP-39 — L1 `calculation-profiles.test.mjs` (the formula texts in "CAP-41/42: the default profile is \"Current (v4)\" (CAP-38) until another one is chosen" and "CAP-41: a custom profile — fixed base, Standard Hours, a deducted, counted and ignored bucket, plan source, status from the plan"); E2E `shell.e2e.mjs` ("TC-CAP-13: Pulse Check shows Utilization = utilized ÷ (contractual − absence) with Trainings and Other NPRA apart" and "TC-CAP-14: Team overview shows the utilization split in Workload by person and in a one-month Utilization tab": the column headers Contractual hours … Actual utilization and the team line "total actual ÷ available hours") ; browser check: Pulse Check → Last month, Team overview → Workload by person and Utilization, and Settings → Resources use the same names; the Old Calculation tab keeps Actual Hours and Actual Utilisation.

**TC-CAP-20 Bucket rules** — Req CAP-46 — L1 `bucket-rules.test.mjs` ("CAP-46: the built-in rules are the words used before"; "CAP-46: custom rules move Tasks between Absence kinds, Training, Other NPRA and Project work"; "CAP-46: bucket rules read from Git are checked; the built-in ones are not stored"), the CAP-16/32/38 figures in `capacity.test.mjs` unchanged with the built-in rules; E2E `shell.e2e.mjs` ("TC-CAP-20: Settings → Bucket rules — built-in words shown, a draft checked against the month, saved and reset") — **UAT**; browser check with real data: add a word your team uses for a leave type (e.g. "maternity" to PTO) — the check table shows the hours moving from Other absence before saving; after saving, Pulse Check → Last month shows the hours under PTO; Use built-in words restores the figures; a role without *Manage shared settings* sees no Edit button.

**TC-CAP-21 Insight thresholds** — Req CAP-47 — L1 `insight-thresholds.test.mjs` ("CAP-47: each insight threshold moves its insight; the built-in values give the results as before"; "CAP-47: insight thresholds read from Git are checked; the built-in values are not stored"), `insights.test.mjs` unchanged with the built-in values; E2E `shell.e2e.mjs` ("TC-CAP-21: Settings → Insight thresholds — edited, checked, shown in Team overview Definitions, reset": amber at or above green blocks saving; the forecast limit changed shows in Definitions; built-in values restored) — **UAT**; browser check with real data: raise the resilience limit — Team overview → Streams shows fewer streams resting on one person; a role without *Manage shared settings* sees no Edit button.

**TC-CAP-22 People & access, Remove and capacity roles** — Req CAP-48, CAP-49, CAP-50, CAP-57, CAP-51, CAP-33 — L1 `people-access.test.mjs` ("CAP-49: a person's work email is kept with their profile (checked, lower case)"; "CAP-57: only the team Role decides capacity — Lead and Manager are not counted by default; app access roles and the People manager tick never count (TC-CAP-29)"; "CAP-50: capacity roles read from Git are checked; the built-in choice is not stored; access roles come from access.json"); E2E `shell.e2e.mjs` ("TC-CAP-22: People & access — one page; names and emails from Azure DevOps (nothing typed); Mark as left; capacity roles": sections People / Team tree / Capacity roles / Role rights, the setup-only columns of the read-only list, no Add a person and no field in the rows, the source line's ⓘ, "No email in Azure DevOps" with the sample, Mapping incomplete in the warning line, Mark as left… on a date sets Left on, Lead / Manager unticked by default, no app access roles) and ("TC-CAP-09: …": Not part of the team removes and Restore brings back) — **UAT**; browser check with real data and Git: add a new colleague to the team in Azure DevOps, refresh — they appear with the name and email from Azure DevOps; in their drawer give them an app access role — access.json has their email and role; set region, role and reports to; mark a leaver Mark as left… at month end — the next month no longer counts them, the earlier months are unchanged; tick Lead in Capacity roles — the lead's hours and capacity appear in Pulse Check.

**TC-CAP-23 People and emails from Azure DevOps** — Req CAP-51, CAP-30, CAP-29 — L1 `people-access.test.mjs` ("CAP-51: a person's work email comes from Azure DevOps (Assigned To); one saved in the profile is used only where Azure has none"); E2E `shell.e2e.mjs` ("TC-CAP-23: People & access lists the Azure DevOps team members with the names and emails Azure gives": the team read on opening, emails lower case, groups left out, "n team members read from <team>" behind the source line's ⓘ, "Team member · no Time Writing yet"); browser check with the Time Writing connection: a PAT without Project and Team (Read) shows the hint (ⓘ and the warning line) and still lists the Assigned To people; ↻ Read the team again reads it again; a person with settings only from the historical hours has the Status "Not in Azure DevOps".

**TC-CAP-24 Calculation profile terms and cards** — Req CAP-52, CAP-45, CAP-41 — L1 `calculation-profiles.test.mjs` ("CAP-52: a profile chooses its Absence kinds and NPRA parts; the cards show its names and formulas"); E2E `shell.e2e.mjs` ("TC-CAP-13: …": the four cards Utilization, Funded Hours, Absence, NPRA Hours with their bracketed formulas; Overloaded and Has capacity counted in the Who has capacity count; the Funded Hours / Absence column names); browser check with Git: copy Current (v4), untick Sick Leave, Unplanned Leave and Other absence and Training, make it the default — the Absence card reads [Holiday + PTO] and its hours drop, NPRA Hours read [Tagged NPRA hours], Available hours rise by the unticked leave; give the profile the name "Contract hours" for Funded Hours under Names — the card, the columns and the formula use it; Save to Git.

**TC-CAP-25 Edit a built-in calculation profile** — Req CAP-53, CAP-41, CAP-52 — L1 `calculation-profiles.test.mjs` ("CAP-53: a built-in profile can be edited; it keeps its id and place, is marked changed, and reset brings the built-in back"; "CAP-41: profiles read from Git are checked; unknown defaults fall back to \"Current (v4)\""); E2E `shell.e2e.mjs` ("TC-CAP-25: a built-in calculation profile can be edited, shows as changed, drives the cards, and resets to the built-in one"); browser check with Git: edit Current (v4), Save to Git, reload in another browser — the change is there; lock a month first and check its figures stay.

**TC-CAP-26 Utilization formula builder** — Req CAP-54, CAP-41 — L1 `calculation-profiles.test.mjs` ("CAP-54: the utilization formula as Top ÷ Bottom follows the profile and its names"); E2E `shell.e2e.mjs` ("TC-CAP-16: …" — ticks figures in the top and the bottom, checks the sentence and that a figure is never in both); browser check: in Settings → Calculation profiles edit a profile, untick Training in the top, tick it in the bottom — the sentence reads "… ÷ (Funded Hours − Absence − Training) × 100", Save, the Pulse Check cards follow.

**TC-CAP-27 Typed utilization formula (fx)** — Req CAP-55 — L1 `formula.test.mjs` ("CAP-55: a typed formula reads like Excel — figures in brackets, + - * / ( ), MAX, MIN, ROUND, IF; blank on / 0"; "CAP-55: a formula that does not read says why"); `calculation-profiles.test.mjs` ("CAP-55: a profile with a typed formula — the v4 formula typed gives the v4 figures; another formula drives person and team"); E2E `shell.e2e.mjs` ("TC-CAP-27: a calculation profile with a typed formula (fx) — starts from the ticks, is checked as typed, is saved and drives the figures"); browser check with the team data: make a copy of Current (v4) with fx on and its starting formula — every person's and the team's figures equal Current (v4); change it to =[Project work] / [Funded Hours] * 100, make it the default — Pulse Check cards, Team overview Utilization and the Monthly pack follow; Save to Git and reload in another browser.

**TC-CAP-28 My capacity under every name; the reason when not counted** — Req CAP-56 — L1 `capacity.test.mjs` ("CAP-56: my capacity is found under every name my work email carries; when I am not counted the reason is given (TC-CAP-28)"); browser check with the Time Writing connection: Time Writing as Me shows the same Capacity as when your name is chosen at the top right; for a month without a Task of yours, or with a Joined on after it, the Capacity tile shows — and the reason, and My dashboard → My hours says “Not counted in <month>: <reason>”.

**TC-CAP-29 Capacity by team Role only** — Req CAP-57, CAP-50 — L1 `people-access.test.mjs` ("CAP-57: only the team Role decides capacity — Lead and Manager are not counted by default; app access roles and the People manager tick never count (TC-CAP-29)"); E2E `shell.e2e.mjs` ("TC-CAP-22: People & access — one page; names and emails from Azure DevOps (nothing typed); Remove asks left or not in the team; capacity roles": no app access roles in Capacity roles); browser check: a person with app access role Admin / People Manager (or the People manager tick) and team Role QE has capacity on Time Writing and in Pulse Check; a person with team Role Lead is listed apart with "team role Lead".

**TC-CAP-30 People list, Status and filters** — Req CAP-58, CAP-29, CAP-33 — L1 `people.test.mjs` ("CAP-58: a person's Status — Not part of the team, Not in Azure DevOps, Left on, Active since (TC-CAP-30)"; "CAP-58: the filters — nothing ticked is all, Status starts on Active and Left, \"Not set\" and \"Default role\" match empty values (TC-CAP-30)"); E2E `people.e2e.mjs` ("TC-CAP-30: the People list is read-only, filtered by Region, Role, Access role and Status (Active and Left by default), with search and Reset filters": no field in the rows, Status starts on two values, Region / Role / search narrow the list and the count, Reset filters, a person Not part of the team leaves the default list and shows under that Status); browser check with real data: Status "Not in Azure DevOps" lists the people of the historical hours who are not in the team; Export gives the columns shown.

**TC-CAP-31 Edit a person in the drawer** — Req CAP-59, CAP-49, CAP-48, CON-102, CON-104 — L1 `people.test.mjs` ("CAP-59: the drawer saves only what changed — profile fields as a patch, the app access roles apart (TC-CAP-31)"); E2E `people.e2e.mjs` ("TC-CAP-31: a person is edited in the drawer — region and app access roles saved in two saves (planning data, access.json), Mark as left removes their access too": view first, Edit, region and two roles, an unsaved edit asks before moving on, Save writes access.json and the Background jobs entries, Save to Git writes the planning data, Mark as left… with "Also remove their app access" ticked removes the roles) — **UAT**; browser check with real data and Git: open a colleague, Edit, set region, role, reports to and an app access role, Save — the list shows them and access.json has the role; as a person without Manage access the roles field is disabled with the reason; ‹ › go through the filtered list; Escape with unsaved edits asks first.

**TC-CAP-32 Bulk edit** — Req CAP-60, CON-102 — L1 `people.test.mjs` ("CAP-60: one change for several people merges into their profiles; one access save sets exactly the roles chosen (TC-CAP-32)"); E2E `people.e2e.mjs` ("TC-CAP-32: bulk edit — tick two people, Set region… saves both in one change; Set access role… is disabled with the reason without Git storage": the bar, the pop-up naming the people, both rows changed, one Background jobs entry and one History entry, Clear selection, the heading box selects every row shown); browser check with Git and Manage access: select three people, Set access role… Team Member — one commit of access.json with the three emails.

**TC-CAP-33 Fewer boxes on People; capacity notices on Capacity & time** — Req CAP-61, CAP-34, CAP-15, CAP-30 — E2E `people.e2e.mjs` ("TC-CAP-33 / TC-CAP-34: fewer boxes — one warning line, Default Time tracking started in the ⋯ menu, the month's capacity on Capacity & time, the Team tree tab": no capacity or holiday notice on People, one folded warning line, ⋯ → Default Time tracking started… changes the Status column, the capacity and regional holidays notices on Capacity & time → Capacity and absence); E2E `shell.e2e.mjs` ("TC-CAP-23: …": the team read behind ⓘ); browser check with the Time Writing connection: a PAT without team read shows the hint in ⓘ and in the warning line.

**TC-CAP-34 Team tree tab** — Req CAP-62, SET-13 — E2E `people.e2e.mjs` ("TC-CAP-33 / TC-CAP-34: …": the Team tree tab with the reporting lines, apart from the list); E2E `shell.e2e.mjs` ("TC-SET-05": the outside manager at the top of the Team tree tab); browser check: a role without "Edit people" sees no Team tree tab.

**TC-CAP-01 Capacity calculation** — Req CAP-01…09, OVR-09 — L1 `capacity.test.mjs`, `monthly-hours.test.mjs`, `azure-insights.test.mjs` (incl. "CAP-03, KB-94: absence is read under the Absence Epic of the capacity settings, not a fixed Epic 37778"). Plus L3 analysis (A) with one person in October 2026:
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

**TC-GIT-06 Default data repository prefilled** — Req GIT-13 — L1 `git-storage.test.mjs` ("the default data repository is a valid config: philips-internal/InD_DemandPlanningStorage, main, planning-data.json"); E2E `shell.e2e.mjs` ("TC-GIT-06": Settings → Storage → Connect Git storage… shows Owner philips-internal, Repository InD_DemandPlanningStorage, Branch main and Data file planning-data.json prefilled with the token empty; the Get started guide's Git step names the repository); browser check: with a connection saved to another repository, Change connection… shows that repository.

**TC-GIT-05 Capacity settings and mappings in Git** — Req GIT-03, GIT-04, GIT-08, CAP-10 — L1 `git-storage.test.mjs` ("capacity settings, holidays and common activities travel in the Git planning file": round-trip without change, mappings sorted by ID, an older file without them loads as before and makes Save to Git appear, invalid mappings dropped); browser check: add a mapping on Settings → Capacity → the sync bar there says "Unsaved changes"; Save to Git; on a second browser Load latest shows the same mapping. **UAT**

**TC-GIT-07 Table defaults and match threshold shared in Git** — Req GIT-14, UI-12 — L1 `git-storage.test.mjs` ("GIT-14: Table defaults and the release-source settings are shared in the planning file; an older file leaves them alone"); E2E `shell.e2e.mjs` ("TC-GIT-08 …": the planning file carries Table defaults); browser check with two browsers: change Settings → Table defaults to Compact and the fuzzy match threshold to 70 %, Save to Git; the other browser (Reload, or wait for GIT-15) shows Compact and 70 %.

**TC-GIT-08 Changes saved by others reach an open app** — Req GIT-15 — L1 `git-watch.test.mjs` ("GIT-15: a check names the shared files whose version in Git is not the one loaded here"; "GIT-15: the banner names the shared files as people know them"); E2E `shell.e2e.mjs` ("TC-GIT-08: while the app is open, newer planning data in Git loads by itself and other newer shared files show on the pages that use them (GIT-18)"); browser check with two browsers: keep the app open in B; in A change a calculation profile and Save to Git — within 5 minutes (or when B's window is brought back) B shows the new profile and "Updated from Git at …"; in A save the Monthly pack setup — B shows the "Newer data in Git: Monthly pack setup" banner, and Reload shows it; with an unsaved change in B, newer planning data shows in the banner instead of loading.
- L3 expected:
  - `my org` is rejected (owner).
  - `a..b` is rejected (branch).
  - `data.txt` is rejected (path).
  - `repo.git` is accepted as `repo`.

**TC-GIT-09 Loading from Git asks before replacing unsaved changes** — Req GIT-16 — L1 `git-storage.test.mjs` ("GIT-16: loading from Git asks first only when there are unsaved changes, and names what is replaced"); browser check with a writable Git connection: change a person's region, then Load latest — the confirmation names what is replaced; Cancel keeps the change; OK loads the copy in Git.

**TC-GIT-10 Saves to shared files are queued and merged, never written over** — Req GIT-17, HIS-04, MYD-09, KPT-03, CON-88, PCK-08 — L1 `git-save-queue.test.mjs` ("GIT-17: the save time is to the second and travels in the commit message"; "GIT-17: merging by key keeps both sides; the later time wins only for an entry both changed"; "GIT-17 / HIS-04: two history imports both survive; the later one wins for the same row and the import details"; "GIT-17: default views by page, the KPI tracker by sheet and backups by connection id"; "GIT-17: two saves with different times are both written, in the order of their time, each as its own commit"; "GIT-17: a conflict at write time reads the file again, merges and saves both changes"; "GIT-17: after the retries the save fails with a clear error and stays in the queue until Retry"; "GIT-17: the Monthly pack template is not merged: an older save never replaces a newer one"); browser check with two browsers A and B on the same writable repository: open My dashboard → Customize in both; in A use as default with one section hidden, in B (without reloading) move another section and use as default — B says "Saved as the default for everyone — merged with a change by someone else", and `personal-views-defaults.json` in GitHub has both changes in two commits ending `[saved …]` in time order; upload a template in A, then another in B: both are commits in GitHub with their `[saved …]` times and B's (the later) is the template (an older-timed save arriving last is covered by L1).

**TC-GIT-11 Newer data in Git shown on the page that uses it** — Req GIT-18, GIT-20, KPT-05 — **UAT** — L1 `git-watch.test.mjs` ("GIT-18: each shared file is shown on the pages that use it; the menu and the views are loaded quietly"); E2E `page-notices.e2e.mjs` ("TC-GIT-11: newer data in Git shows on the page that uses it — never after your own save; on CoNQ only when someone else changed CoNQ; Load the newer data shows it without reloading the app"), `shell.e2e.mjs` ("TC-GIT-08 …": on Data & sharing no notice — the access roles load quietly (GIT-23), the Monthly pack setup waits for its pages); browser check with two browsers A and B (Tool Owner): B on Home; A adds a CoNQ row — within 5 minutes (or when B's window is brought back) nothing shows on Home, Admin → Data & sharing or another page; B opens CoNQ — "Newer data in Git for CoNQ: CoNQ — saved by {A's GitHub name} on {date time}" (a warning on the page, not a pop-up, not in Background jobs); Load the newer data shows the row without a reload (the menu and the page's tab stay); in B open a CoNQ row, Edit and change a value while A saves CoNQ again; after the next check click Load the newer data on the notice — a pop-up names "the row … you are editing in CoNQ" (Cancel keeps the edit; Load the newer data drops it and shows A's change); A changes Pages & menu (moves a page) — B's menu follows quietly, no notice; A saves QE Mapping — B sees the notice on QE Mapping and the Backlogs only.

**TC-GIT-12 Your own saves never raise the newer-data notice** — Req GIT-19 — L1 `git-watch.test.mjs` ("KB-82, GIT-19: this window's own saves never count as newer data saved by someone else; another person's save does"); E2E `page-notices.e2e.mjs` ("TC-GIT-11 …": a row saved in the drawer, then a check — no notice on CoNQ or Home); browser check: in one window save several CoNQ rows quickly one after another, change the columns, an insight, the menu (move a page), My views and the default views, then bring the window back after 5 minutes — no notice anywhere; open the app in a second window of the same browser, save a CoNQ row there — the first window shows the notice on CoNQ "saved by you in another window of this browser".

**TC-GIT-13 Pages added or deleted by someone else appear and leave without a reload** — Req GIT-21 — L1 `page-hide.test.mjs` ("GIT-21: with a newer menu layout only the pages not known here are read; a deleted one is dropped unless it is open with unsaved edits (TC-GIT-13)"); E2E `row-locks.e2e.mjs` ("TC-GIT-13: a page someone else adds appears in the menu without a reload, and leaves it when they delete it"); browser check: with two browsers, one adds a page (or a dashboard) — within 5 minutes (or on coming back to the window) the other shows it in the menu and on Home, no notice; deleting it removes it; with an unsaved row open on that page the other keeps it open with the notice.

**TC-GIT-14 The notice names the app user who saved** — Req GIT-22, GIT-18, GIT-17 — L1 `git-watch.test.mjs` ("GIT-22: every commit the app writes names the app user — display name and work email — and the notice shows them; a commit made outside the app shows its GitHub author (TC-GIT-14)"); E2E `page-notices.e2e.mjs` ("TC-GIT-14: the notice names the app user who saved, not the GitHub account; TC-GIT-15: …"), `page-notices.e2e.mjs` ("TC-GIT-11: …": a commit made outside the app shows its GitHub author); browser check: save a row on CoNQ — the commit in the verified private Git repository ends with `[saved …] [by {your name} <{your work email}>]` and holds no token; the unit test confirms public, internal, and unverified targets omit attribution; in the other browser the notice says "saved by {your name}"; a commit made on github.com shows the GitHub author.

**TC-GIT-15 Access changes load quietly, with an info line** — Req GIT-23, GIT-18, CON-101 — L1 `git-watch.test.mjs` ("GIT-23: a newer access.json loaded quietly — what changed in the viewer's own rights, in words (TC-GIT-15)", "GIT-18: each shared file is shown on the pages that use it; the menu and the views are loaded quietly"); E2E `page-notices.e2e.mjs` ("TC-GIT-14: …; TC-GIT-15: a change of the access roles is loaded quietly — the rights change in place with an info line, the notice only on People & roles"), `shell.e2e.mjs` ("TC-GIT-08 …": access roles created in Git are loaded quietly on Data & sharing); browser check with two browsers: B on CoNQ as a Team Member, A gives Team Members "Edit On-Demand data (rows)" — within 5 minutes B's ＋ Add row is enabled and the line "Your access was changed by {A}: you can now edit On-Demand data (rows)." shows on CoNQ only (not a pop-up, not in Background jobs) and goes on the next page; with B on Admin → People & roles the "Newer data in Git" notice for Access shows instead; with Git unreachable the rights loaded before stay.

**TC-GIT-16 A connection to the old data repository is offered the switch** — Req GIT-24, GIT-13 — L1 `git-storage.test.mjs` ("GIT-24: a connection to the old data repository points to the new one, keeping its branch and data file; any other connection does not (TC-GIT-16)"); E2E `shell.e2e.mjs` ("TC-GIT-16, TC-GIT-17": a connection saved to ponkritz/DemandPlanningStorage shows the notice naming both repositories and is not changed by itself; Switch saves philips-internal/InD_DemandPlanningStorage with the same branch, file and token, reads from the new repository and not the old one, and the notice goes); browser check: with unsaved changes, Switch asks first.

**TC-GIT-17 Change connection opens with the connection in use** — Req GIT-13, GIT-24 — E2E `shell.e2e.mjs` ("TC-GIT-16, TC-GIT-17": the Git storage panel is shown with the old connection, Switch moves it, then Change connection… shows owner philips-internal, repository InD_DemandPlanningStorage, branch main; KB-90).

**TC-GIT-18 A repository the token cannot read is an error, not a missing file** — Req GIT-25 — L1 `git-storage.test.mjs` ("GIT-25: a 404 from a repository the token cannot read is an error, never a missing file — every reader (TC-GIT-18)", "GIT-25: a 404 in a readable repository is a missing file; the repository is probed once and the answer reused (TC-GIT-18)"), `custom-streams.test.mjs` ("GIT-25: the cached custom streams stay when the repository cannot be read; a missing file in a readable one clears them (TC-GIT-18)"); browser check: connect Git storage to a private repository the token cannot see — Data & sharing shows "Repository … or branch … was not found, or the token cannot access it.", the custom streams, connections and PATs of this browser stay, and GitHub is asked for the branch once.

**TC-GIT-19 The first sync from another repository removes no connection** — Req GIT-26 — L1 `view-definitions.test.mjs` ("GIT-26: the first sync from another repository removes no connection or PAT, applies no clean-up, and says what differs (TC-GIT-19)", "GIT-26: the start sync checks for a repository change before any clean-up marker is applied; a failed sync is shown (TC-GIT-19)", "GIT-26: a shared view with the same ID cannot replace or reclassify a personal view (TC-GIT-19)"); browser check: with connections synced from one repository, Change connection… to another whose azure-views.json lists other connections and holds an azure-views-reset.json — after the restart every connection and PAT is still here, the new ones are added, and Admin → Data & sharing (Git storage, and Shared setup in Git) names what was added, what is only here and what differs.

**TC-GIT-20 An unreadable repository keeps what the browser has and offers no Set up roles** — Req GIT-25, CON-101 — E2E `shell.e2e.mjs` ("TC-GIT-20: a data repository the token cannot read (404 for everything) — the custom streams, connection and PAT here stay, the error says the repository cannot be read, and Set up roles is not offered"): GitHub answers 404 for everything in the new repository; the read-only notice says the data repository cannot be read (Open Git storage, no Set up roles), the custom stream stays in the menu, the connection and its server's PAT and the custom streams cache stay in this browser, Data & sharing names the repository, People & roles shows the error and no "No access roles yet", and the branch is probed once.

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

### 6.12 Snapshots (requires TD-04)

**TC-SNP-01 SharePoint central storage** — Req SNP-01…03 — *(Retired with SNP-01…03: SharePoint is in the backlog; nothing to run.)*

**TC-SNP-02 Snapshot saved to Git** — Req SNP-04…07 — L1 `cloud-snapshots.test.mjs` ("SNP-06: snapshots go to lte-snapshots/ beside the planning data in the Git data repository"; "SNP-06: a snapshot is a new file (no version id sent), read back and compared before success, nothing kept in the browser"; "SNP-06: failures, an existing file and a mismatched read-back never report success"; "SNP-04: the page saves only with Git connected and a token that can write; no SharePoint code is left"; "snapshot freezes source data and excludes history/connection secrets"; "SNP-05 (owner decision 11): a snapshot holds all the data present at the moment, hours and release data included").
- Expected (L3, with TD-04):
  - The buttons are disabled without Git storage, with a read-only token and with the synthetic sample.
  - An LTE snapshot creates "lte-snapshots/{month}-LTE-{id}.json" in the data repository as one commit.
  - Success is reported only after the read-back.
  - The file contains exactly the SNP-05 data fields.

**TC-SNP-03 History** — Req SNP-08 — L1 `cloud-snapshots.test.mjs` ("SNP-08: history lists only snapshot files, newest month first; a missing folder is empty; errors are reported").
- Expected:
  - Only matching files are listed, newest month first, each linked to GitHub.
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

**TC-SET-05 Manager not on the board** — Req SET-13 — E2E `shell.e2e.mjs` ("TC-SET-05": synthetic sample, People & roles → People, Chen Wei's drawer → Edit → Reports to → Other (type a name)… → "Maria Lopez" → Save; the drawer and the list show Maria Lopez (not on the board), the Team tree tab shows Maria Lopez at the top marked "not on the board" with Chen Wei under her, and Diya Sharma's Reports to offers Maria Lopez under "Not on the board").

**TC-SET-06 Admin pages, My settings and sections** — Req SET-15, SET-16, NAV-17 — L1 `my-views.test.mjs` ("Admin and My settings: the pages, and older links opening where they moved (SET-15, TC-SET-06)"); E2E `shell.e2e.mjs` ("TC-SET-06: Admin lists the shared setup pages, My settings opens from your name; sections show one at a time with their scope, and the last one is remembered" — also opens the connection editor from Streams, KB-24; also "TC-NAV-01 / TC-NAV-17" for the Admin group and entries); browser check: the menu has an ADMIN group with Streams, Stream options, Feature setup, People & roles, Data & sharing (and, with their permissions, Capacity & time, Reports, Master data, History); each opens its page with its name in the header; your name in the sidebar opens My settings with Your work email · Servers and PATs · My views; every section shows its scope chip; after another page and back, the section last shown is open; Feature setup and Streams have no section row; Get started → Open for the token step lands on My settings → Servers and PATs, for Git on Data & sharing → Git storage; a stream not set up in the menu (＋) opens Streams; no page errors.

**TC-SET-07 My views** — Req SET-17, CON-42 — L1 `my-views.test.mjs` ("My views: on a server with a PAT, never named after a stream, never a stream connection, never in Git, kept when the shared setup is reset (SET-17, TC-SET-07)"); E2E `shell.e2e.mjs` ("TC-SET-07: My views — a view of your own on a server you have a PAT for, under Other views in the menu, never a stream and never in the shared setup"); browser check: My settings → My views offers only servers with a PAT; a view named DP is refused; a view with a name, project and WIQL query is added, fetched and listed under Other views in the menu; it is not in Data & sharing → Other views, not in Shared setup in Git (Save stream mapping to Git leaves it out), not in a JSON backup; Back up and remove all keeps it.

**TC-SET-08 Look & feel** — Req SET-18, UI-12 — L1 `my-views.test.mjs` ("Admin and My settings: the pages, and older links opening where they moved (SET-15, TC-SET-06)"); E2E `shell.e2e.mjs` ("TC-SET-08: Look & feel switches the theme with the top-bar button in step, and the start view"; "TC-NAV-50: every page fills the width beside the menu inside a border, with the margins of Look & feel, also when the menu is folded" — the four tabs); `documents-and-data.e2e.mjs` (Table and chart defaults opened from Look & feel).

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

**TC-STO-04 Restore validation** — Req STO-07, STO-08 — L1 `browser-state.test.mjs` (also "a work item from a backup or Git keeps only an https link or none (KB-06, TC-STO-04)").
- L3: restore each file in TD-05.
- Expected:
  - (a) restores after the checkbox is ticked.
  - (b)–(f) are each rejected with the message of STO-07, and the data is unchanged.

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

**TC-SMP-02 Sample mode writes nothing; the reset asks first** — Req SMP-05, SMP-06 — L1 `sample-guard.test.mjs` ("OI-10: with the synthetic sample loaded, every write to Azure DevOps is refused before anything is sent (TC-SMP-02)"); E2E `shell.e2e.mjs` ("TC-SMP-02: Reset synthetic MVP data asks first and is recorded in History"); browser check: with the sample loaded, New Feature and Time Writing saves report that nothing is written.
- Steps:
  1. From an empty state, press "Load synthetic sample".
  2. Repeat from Settings with real data saved, and cancel.
- Expected:
  - The SMP-01 message and the audit "Load sample" appear.
  - The SMP-03 banner shows, and the chip reads "Sample data".
  - Cancelling keeps the real data.
  - The Azure DevOps project shows no requests or changes.

### 6.18 Documentation

**TC-DOC-01 Documents and rendering** — Req DOC-01…03, DOC-05 — **UAT** — L1 `markdown.test.mjs` (every document in `docs/` is bundled and parses; anchors, tables, nested lists, inline formatting; link schemes); E2E `documents-and-data.e2e.mjs` (one tab per document, each rendered without raw Markdown, the Validation Package tabs present).
- Steps:
  1. Open Documentation.
  2. Open each tab.
- Expected:
  - There is one tab per file in `docs/`, in the order of DOC-01, User guide first.
  - Headings, tables, nested lists, bold text and code display formatted, with no raw Markdown characters such as `|---|` or `**`.
  - The panel shows "docs/{file} · this build".
  - Inspection: the Markdown component builds React elements and does not use `dangerouslySetInnerHTML`.

**TC-DOC-02 Links, sections and download** — Req DOC-04, DOC-06…08 — E2E `documents-and-data.e2e.mjs` (the TEST-PLAN.md §7 link opens the Test plan at section 7; Download .md gives the identical file)
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

**TC-DOC-04 Private Tool Validation Package downloads** — Req DOC-12 — L1 `tool-validation.test.mjs`: configured repository and branch, authenticated read-only GET, fixed folders, path rejection, binary fidelity above 1 MB and safe errors. E2E `tool-validation.e2e.mjs`: missing configuration, list/search, DOCX download bytes, denied access, refresh and connection settings. Execute the same workflow in Web and Windows Desktop; verify downloaded PDF, Word and CSV files open in their native viewers. No private content or PAT is included in app exports or the public build.

**TC-DOC-05 Design documents in the app** — Req DOC-13 — L1 `markdown.test.mjs` ("TC-DOC-05: design links resolve by document path and keep repository source links on GitHub"); E2E `documents-and-data.e2e.mjs` ("TC-DOC-05: open, browse and download bundled design documents"). Open Documentation → Design documents and verify the index, an in-app view link, the source link to GitHub, a nested Settings design in the selector, and an original Markdown download. Inspect the build registry for recursive design-document inclusion.

**TC-DOC-03 Validation Package: documents, traceability and consistency checks** — Req DOC-09, DOC-10, DOC-11 — **UAT** — L1 `traceability.test.mjs` ("requirement IDs expand ranges and keep their width"; "the requirements have three levels, chained without gaps, with unique IDs"; "every test case names known requirements, every UAT day live test cases, every known issue known requirements"; "every source file is a listed software component, with requirement areas that exist"; "the committed traceability matrix is complete and current"), `validation-package.test.mjs` ("every package document has its required sections"; "mitigations, DFMEA rows, findings, risks and issues have unique IDs and the summary counts match"; "every ID cited in the package exists where it is defined"; "the package index lists every document in docs/, and the app bundles them all"); inspection: `node scripts/traceability.mjs --check` prints "Traceability: complete and current."; editing a requirement row without regenerating the matrix, or removing a test case that covers a requirement, makes `pnpm test` fail with the gap named.
- Steps:
  1. Open Documentation → Validation package.
  2. Open Traceability matrix; read the header table and §8.
  3. Open Known issues, Software components, Security assessment, DFMEA and Development process.
  4. In Security assessment §4, follow a mitigation's requirement ID to Requirements and its test case ID to the Test plan.
- Expected:
  - The Validation package tab lists the thirteen documents with their standard clauses and the approval table.
  - The matrix header shows 0 requirements in force without a test case and 0 trace gaps; §8 says "None".
  - Every document opens, rendered; the Known issues register has the KB, OI, residual-risk and limitation tables; the components inventory lists the in-house files by layer, the SOUP table with versions and licences, and the audit result.
  - The IDs resolve: the requirement row exists and the test case exists and names that requirement.

**TC-DOC-06 User guide with screenshots and clips** — Req DOC-14, DOC-15, DOC-16 — L1 `user-guide.test.mjs` ("DOC-15: every screenshot, clip and poster the guide shows is a file of docs/user-guide, and every file there is shown"; "DOC-15: every clip has a poster, a title and a caption, and its steps are written out next to it"; "DOC-15: the guide's pictures and clips stay small"; "DOC-14: every chapter is listed in Contents, and every link in the guide lands on a heading"; "DOC-14: the guide describes the features of its build: no placeholder is left, and My dashboard editing, Save view for everyone and the chart editor's tabs have their sections"; "DOC-14, DOC-16: the user guide is the first document of the Documentation page, and every picture is made by the screenshot script"), `markdown.test.mjs` ("DOC-15: images are inline parts with their alt text, and a video line is a block of plain values, never markup"), `csp.test.mjs` (media-src); E2E `documents-and-data.e2e.mjs` ("TC-DOC-06: the user guide is the first tab and the profile menu's User guide opens it; its screenshots load from the build and its clips play from the build"); inspection: `pnpm build:web && pnpm docs:shots && pnpm docs:videos` remakes every picture and clip and stops on anything but made-up data.
- Steps:
  1. Open the profile menu and choose **User guide**.
  2. Scroll through the guide; open a section from "On this page".
  3. Play a clip.
  4. Read "Edit My dashboard", "Save view for everyone" and "Add a chart or table".
- Expected:
  - Documentation opens on the **User guide** tab, the first tab.
  - Every screenshot shows (no broken image); every picture shows only made-up names (example.com emails, the synthetic sample).
  - The clip plays from the build without sound; the steps next to it describe the same task in full.
  - No section is a placeholder: My dashboard editing, Save view for everyone and the chart editor's tabs are described with their steps and screenshots.

### 6.19 User interface

**TC-UI-01 Theme** — Req UI-01, UI-02 — L1 `theme.test.mjs`.

**TC-UI-02 Buttons** — Req UI-05 — browser check in light and dark theme: Settings → Azure DevOps shows "Open QMS-0025 →" solid indigo with white text and a shadow, "＋ Add server" and "Fetch 1" outlined, disabled "Save PAT" flat grey; Settings → Feature setup list: Edit indigo, Delete red, the Save to Git bar's button green (grey while disabled); every text action in a notice is a tinted pill; the row buttons stay in view.

**TC-UI-03 App name and mark** — Req UI-06 — browser check: the sidebar shows the calendar-and-shield mark with "I&D Quality" over "Demand Planning"; the tab title reads "I&D Quality Demand Planning"; the favicon is the mark on the teal-to-indigo tile; the desktop update feed still names Demand-Planning-Hub-Setup.exe (`scripts/desktop-manifest.cjs`, build-and-deploy.yml unchanged).

**TC-UI-04 Tables follow one design default** — Req UI-07, UI-08, UI-09, UI-10, UI-12 — L1 `table-defaults.test.mjs` ("table defaults: unknown values dropped, missing ones from the built-in default (TC-UI-04)", "column layout: saved order first, new columns where they stand; ↑ ↓ and drag moves (TC-UI-04)"); E2E `documents-and-data.e2e.mjs` ("TC-UI-04 / TC-UI-05: every table follows the table default — move, hide, density, one Export with Excel dates; Settings → Table defaults changes them all"); browser check: on DP, IOCC, a Windchill export's Releases, unique locations and Raw data — drag a heading onto another and use ↑ ↓ in Columns (1, 2, 3 → 2, 3, 1), untick a column, drag a heading edge, switch Wrap text and Compact, reload: the layout stays; Reset layout restores it; each table has one Export (no Export CSV / Export releases CSV buttons left); in Settings → Table defaults untick CSV — every Export offers Excel only; untick Move columns — no table can be rearranged.

**TC-UI-05 Dates exported as Excel date-times** — Req UI-10, UI-11 — L1 `table-defaults.test.mjs` ("export: dates become real date-times in Excel and CSV; numbers stay numbers; formulas neutralised (TC-UI-05)"); E2E `documents-and-data.e2e.mjs` (as TC-UI-04); browser check: export DP's query output as Excel and as CSV, open both in Excel — Changed Date / DDT Date are dates (right-aligned, formattable as Long Date and time), numbers are numbers, a cell starting with "=" stays text.

**TC-UI-06 Page tables on the table default** — Req UI-13 — E2E `documents-and-data.e2e.mjs` ("TC-UI-06: the page tables follow the table default too — My Work keeps its tree, Backlog Health its lists, each with Columns and one Export"); browser check: on Pulse Check (Ongoing activities, Windchill exports, Supported Releases), CP, Baselines, Snapshots, My Tasks [Board], Bulk actions, Monthly Time Writing and Backlog Health — every table has Columns, Wrap text, Comfortable / Compact and one Export ▾ (Excel / CSV); the summary tables — Dashboard, Pulse Check's release counts / last vs this month / work closed and opened, the capacity summaries, Insights, the Monthly pack KPI table and Documentation — stay plain, without that toolbar; open a Feature on My Tasks [Board] — its Stories and Tasks appear as rows under it; Backlog Health has no Export CSV or Columns dialog of its own; Monthly Time Writing's Original Estimate / Completed Work cells still edit.

**TC-UI-07 Desktop zoom and Auto** — Req UI-14 — L1 `desktop-zoom.test.mjs` ("UI-14: Auto zoom fits the 1440 × 880 layout into the window, 67%–100% in 5% steps; − / + in 10% steps, 50%–200%"; "UI-14: the zoom setting is kept per computer — Auto on by default, a hand-set zoom turns it off"); E2E `shell.e2e.mjs` ("TC-UI-07: the desktop app zooms — Auto fits the window, − / + / 100% and Ctrl keys set it by hand and turn Auto off; the browser has no zoom control"); desktop check: on a 1366 × 768 screen (or a smaller window) the app opens zoomed out so the whole page fits; resize the window — the zoom follows; Ctrl + / Ctrl − / Ctrl + wheel change it and untick Auto; restart — the zoom is kept.

**TC-UI-08 My Work page names** — Req UI-15 — L1 `format.test.mjs` ("page registry has unique ids, known groups and header text for every page": My Work lists Time Writing, My Tasks [Board], Sprint check); E2E `shell.e2e.mjs` ("TC-ACT-01: Time Writing is under My Work for everyone; the Testing heading is for the Admin role only"); browser check: the menu shows Time Writing and My Tasks [Board] under My Work, each opens with that heading, and My dashboard's links read Time Writing → and My Tasks [Board] →.

**TC-UI-09 Side menu folds to icons** — Req UI-16 — E2E `shell.e2e.mjs` ("TC-UI-09: the side menu folds to icons and back, names on hover, kept after a reload"); browser check at 1440 px: « folds the menu to icons, hovering shows the page name, » shows the names again, a reload keeps the choice; below 1000 px the toggle is hidden.

**TC-UI-10 Chart axis names and data labels** — Req UI-17 — L1 `chart-labels.test.mjs` ("UI-17: data labels — off by default, the shared default from Table defaults, each chart's own choice wins (TC-UI-10)"); E2E `shell.e2e.mjs` ("TC-UI-10: charts name their axes and show values when Data labels is ticked, kept per chart"); browser check: every chart shows its X and Y axis names; tick Data labels on a chart — its values appear; Settings → Table defaults → Charts → Data labels on — every chart without its own choice shows values.

**TC-UI-11 Pop-ups work with the keyboard** — Req UI-18 — E2E `shell.e2e.mjs` ("TC-UI-11: a pop-up takes the focus, keeps Tab inside, closes on Escape and gives the focus back to its button"); browser check: open a write pop-up with a person picker, open the picker list, Escape closes only the list, a second Escape closes the pop-up.

**TC-UI-12 A click beside a pop-up keeps what was typed** — Req UI-19 — E2E `shell.e2e.mjs` ("TC-UI-12: a click beside a pop-up with input keeps it open with what was typed; pop-ups without input close"); browser check: New Feature, type a title, click beside the pop-up — it stays open with the title.

**TC-UI-13 Which view a table shows** — Req UI-21 — L1 `table-views.test.mjs` ("views for everyone: own view > view for everyone > the table’s built-in view (TC-UI-13)"); browser check: with a view for everyone saved, a viewer who never changed the table sees it; their first change keeps the rest of it; after the Tool Owner saves it again the Columns panel says "A new view for everyone is available — Use it".

**TC-UI-14 Missing and new columns, sort and the own view in the browser** — Req UI-08, UI-22 — L1 `table-views.test.mjs` ("views for everyone: columns that no longer exist are ignored, new ones come at the end shown; sort kept (TC-UI-14)", "views for everyone: only known shapes are read; the own view in the browser folds in the earlier width and wrap entries (TC-UI-14)"); browser check: a view saved before a column was added shows the new column last; a sort on a removed column falls back to the table's default sort; a table's sort is kept after a reload.

**TC-UI-15 Saved and cleared in the shared views defaults** — Req UI-20, UI-23 — L1 `table-views.test.mjs` ("views for everyone: saved and cleared in the shared views defaults with who and when; merged per entry (TC-UI-15)"); browser check: Save view for everyone writes `table:<id>` and `by:table:<id>` to `personal-views-defaults.json` with one commit, listed under Background jobs; Clear the view for everyone asks first and removes both.

**TC-UI-16 The Tool Owner saves a table's view for everyone** — Req UI-20, UI-21, UI-22 — **UAT** — E2E `views-for-everyone.e2e.mjs` ("TC-UI-16: the Tool Owner saves the CoNQ table’s view for everyone; another person sees it first, keeps their own changes and can use the view for everyone again"); browser check: as the Tool Owner hide, move and widen columns of a table and sort it, Save view for everyone; on another browser as a Team Member open the table — the same columns, widths and sort, no Save option; tick a column back, reload — kept; Use the view for everyone — back.
- L3 steps:
  1. Tool Owner (Git connected): CoNQ → Data → Columns: untick Sites, move Cost (EUR) above Category, drag the Category edge wider, sort by Found on (newest first), **Save view for everyone**.
  2. Second person (Team Member, another browser, first visit): open CoNQ → Data, then Columns.
  3. Tick Sites, reload, open Columns, **Use the view for everyone**.
- Expected:
  - Step 1: Background jobs lists the save; the panel reads "The view for everyone, saved by <email> on <date>".
  - Step 2: the table shows the Tool Owner's columns, order, width and sort; no Save view for everyone or Clear.
  - Step 3: Sites stays after the reload with "Your own view · Use the view for everyone"; Use the view for everyone shows the Tool Owner's view again.

**TC-UI-17 Page filters and the People list for everyone** — Req UI-20, UI-23, MYD-08 — L1 `table-views.test.mjs` ("views for everyone: People filters read back only in known shapes (TC-UI-17)"); E2E `views-for-everyone.e2e.mjs` ("TC-UI-17: the People list and its filters saved for everyone by the Tool Owner; an Admin (who holds the right) sees both first and can save too"); browser check: the Team overview, an On-Demand Dashboard page and an Insights page's filter row each offer Save view for everyone beside the filters to the Tool Owner; a person who never changed them starts on the saved period and filters; one who did keeps theirs and sees "Your own view · Use the view for everyone".

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

**TC-CI-02 End-to-end suite** — Req CI-06 — E2E `shell.e2e.mjs`, `documents-and-data.e2e.mjs` (`pnpm test:e2e` after `pnpm build:web`: every scenario passes; each scenario is named after the UAT case it automates); inspection: the workflow job "End-to-end tests" runs on every pull request and push to main and fails the run when a scenario fails.
- Steps:
  1. Run `pnpm build:web && pnpm test:e2e` locally.
  2. Open the CI run of a pull request.
- Expected:
  - All scenarios pass with no page errors; the suite needs no network.
  - The "End-to-end tests" job is present and green; a deliberately failing scenario turns the run red.

**TC-CI-03 CI token scope** — Req CI-07 — inspection of `.github/workflows/build-and-deploy.yml`.
- Expected:
  - The top-level `permissions` is `contents: read`; the jobs that run `pnpm install`, `pnpm lint`, `pnpm test`, `pnpm build:web`, `pnpm test:e2e` or electron-builder have no `contents: write`.
  - Every `actions/checkout` step sets `persist-credentials: false`.
  - The jobs that write to releases (`publish-tagged-release`, `publish-windows`, `publish-macos`) only download artefacts and run `gh release` (with the repository's own scripts `desktop-manifest.cjs` and `release-entry.mjs`, which use no dependencies); their `run:` steps read `$TAG`, `$REPO` and similar environment variables, never `${{ }}` inside the script.

**TC-CI-04 Software Bill of Materials** — Req CI-08 — L1 `swbom.test.mjs` ("the SWBOM lists exactly the components of pnpm-lock.yaml, with scope and licence (TC-CI-04)"; "lockfile keys: scoped names and peer suffixes (TC-CI-04)"); inspection: after a dependency change, `pnpm swbom` rewrites `docs/SWBOM.md` and `docs/swbom.cdx.json`; without it `pnpm test` fails; the Documentation page has a SWBOM tab listing the shipped components (react, react-dom, @azure/msal-browser and their dependencies, Electron) with licences.

**TC-CI-05 Change notes, version and release notes** — Req CI-09 — L1 `release-notes.test.mjs` ("release notes: the newest version is the package version; versions unique, descending, each with an entry (TC-CI-05)"; "release-notes headings are read exactly (TC-CI-05)"), `release-changes.test.mjs` ("CI-09: every waiting change note is valid — a bump type and at least one change (TC-CI-05)"; "CI-09: a change note is read exactly; malformed ones are refused (TC-CI-05)"); inspection: a pull request without a note in `docs/changes/`, or one that changes the version in `package.json`, fails the step *Check the change note* of the Windows job; a Dependabot pull request passes without a note; after the merge the release commit carries the version (TC-CI-07) and CI tags it (TC-CI-06); the Documentation page has the Release notes and Configuration management tabs; the app footer shows the new version.

**TC-CI-06 Automatic version tag and release** — Req CI-10 — L1 `release-notes.test.mjs` ("the versioned release takes its notes from the release-notes entry of its version (TC-CI-06)"; "CI tags every version on main and publishes its release; nobody tags by hand (TC-CI-06)"); inspection after a merge that bumps the version: the run's job *Tag and publish versioned release* is green, the repository has the tag `vX.Y.Z` on the release commit, and the GitHub release `Demand Planning Hub vX.Y.Z` has `Demand-Planning-Hub-Setup.exe`, `Demand-Planning-Hub-mac.dmg`, `SHA256SUMS.txt`, `SHA256SUMS-mac.txt` and the version's release-notes entry; a merge without a bump logs "already exists" and changes nothing; `desktop-latest` and `latest.json` are unchanged by this job.

**TC-CI-07 Release commit** — Req CI-11 — L1 `release-changes.test.mjs` ("CI-11: the highest bump of the waiting notes gives the next version (TC-CI-07)"; "CI-11: the notes become the new version’s entry at the top, each with its pull request (TC-CI-07)"; "CI-11: the release commit is written after every merge by a job that installs nothing; builds use that commit (TC-CI-07)"), `traceability.test.mjs` ("the traceability matrix is complete, and current on main (TC-CI-07)"); inspection after a merge with a change note: the job *Write release commit* is green and `main` has the commit "Release vX.Y.Z [skip ci]" right after the squash commit, with the version in `package.json`, the entry with "PR #N." at the top of RELEASE-NOTES.md, the note removed and the SWBOM and matrix regenerated; the Windows, macOS, end-to-end and web jobs check out that commit, the tag `vX.Y.Z` is on it, and the app shows the new version; two merges in quick succession give two release commits or one with both notes, and no run on main is cancelled.

**TC-CI-08 End-to-end on a slow machine** — Req CI-12 — L1 `e2e-slow.test.mjs` ("CI-12: the E2E scenarios also run on a 4x slower CPU, in their own read-only job (TC-CI-08)"); inspection: `E2E_CPU_SLOWDOWN=4 pnpm test:e2e` passes every scenario (locally: shell 56, backlog 11, documents-and-data 14, monthly-pack 2, about twice the time); a fixed loop in the page takes about four times as long with the throttle; the job *End-to-end tests (slow machine)* runs on every pull request and push to main and turns the run red when a scenario fails.

### 6.21 QE Mapping

**TC-QEM-01 Read an Excel as it is** — Req QEM-02 — L1 `qe-mapping.test.mjs` ("reads an Excel workbook as it is: every sheet, shared / rich / inline strings, dates, numbers, booleans, formulas"; "reads CSV with commas, semicolons or tabs, quotes and line breaks in fields"; "a sheet becomes a table as it is: header from the first non-empty row, names made unique, empty rows and columns dropped"; "a crafted Excel sheet with cells beyond Excel's limits is refused, not padded (KB-04, TC-QEM-01)").

**TC-QEM-02 Edit, filter, group** — Req QEM-03…QEM-06 — L1 `qe-mapping.test.mjs` ("editing: cells, rows and columns keep their ids; filter, group and export").

**TC-QEM-03 Git file and export** — Req QEM-01, QEM-07 — L1 `qe-mapping.test.mjs` ("writes a workbook that reads back the same, sheet names made valid and unique"; "the Git file: round trip, unknown cells dropped, broken files refused, too large refused").

**TC-QEM-04 QE Mapping end to end** — Req QEM-01…QEM-07 — browser check with GitHub mocked (writable token, no qe-mapping.json yet): QE Mapping shows "No QE Mapping yet."; Upload Excel… with a two-sheet workbook (Mapping: Process, QE Owner, Area, Due Date with date cells, 12 rows; Owners: 1 row) → tabs "Mapping 12" and "Owners 1", dates as YYYY-MM-DD; edit a cell to "Dana"; Add row and fill it; select and delete 2 rows → 11; Add column "Status"; rename "QE Owner" to "Owner"; move Status left; hide Due Date → "Columns (4 of 5)"; Group by Area → groups CP 3, DP 3, IOCC 4, (blank) 1; Filter Area "cp" → "3 of 11 rows"; delete the column Owner; Export CSV → the shown columns; Export Excel → both tabs read back; Save to Git → one PUT of qe-mapping.json "Update the QE Mapping (qe-sample.xlsx)" with 11 rows and the new columns; after a reload the mapping comes from Git and the hidden column stays hidden; no page errors. **UAT**

**TC-QEM-05 Compact columns** — Req QEM-08 — browser check: with a QE Mapping of ten or more columns, the headings stay on one line, short columns are only as wide as their content, a long cell wraps with Wrap text on, and the Filter by column row sits right under the headings while scrolling.

**TC-QEM-06 Resizable columns** — Req QEM-09 — browser check: drag the right edge of a QE Mapping heading wider and narrower (the cells and the filter follow; long text wraps inside the new width), reload (the width is kept), switch tab (the other tab keeps its own widths), double-click the edge (that column returns to automatic), resize two columns and press Reset widths (all return to automatic, the button disappears).

**TC-QEM-07 Collapse all / Expand all** — Req QEM-10 — browser check: group the QE Mapping by a column with several values; Collapse all closes every group (only the group rows and their counts stay; Collapse all is disabled, Expand all enabled); Expand all opens them all; open one group by hand after Collapse all (both buttons enabled); with no grouping, or a single group, the buttons are not shown.

**TC-QEM-08 Nested grouping** — Req QEM-11 — L1 `qe-mapping.test.mjs` ("nested grouping: groups within groups, keys unique per path, counts per level (QEM-11)"); browser check: Group by Area, then by Owner — each Area row holds its Owner groups, indented, with their counts; collapse one Owner group under one Area (the same Owner under another Area stays open); Collapse all closes every level and Expand all opens them; change the first level (the second is dropped); in a column menu, Then group by this adds a level and Remove from grouping removes it; a fourth level is the last (no fifth select).
**TC-QEM-09 Add a row in a pop-up, saved to Git, QE Name from Resources** — Req QEM-12 — L1 `qe-mapping.test.mjs` ("add a row: the QE Name column is found for the Resources list, the row comes first with its values (TC-QEM-09)"); browser check (Git connected with a token that can write): QE Mapping → ＋ Add row opens "Add a row" with a field per column, the QE Name a list of the Resources; fill it and Save — the row appears first and "Row added and the QE Mapping saved to Git" links the commit; clicking a QE Name cell offers the same list; with Git refusing (e.g. a concurrent change), the row stays as an unsaved change with the reason.


### 6.22 Monthly pack

**TC-PCK-01 Setup and month files** — Req PCK-02, PCK-06 — L1 `monthly-pack.test.mjs` ("setup and notes files: parse, clean and serialise (PCK-01, PCK-02)": the default setup round-trips; bad ids repaired, duplicates, invalid Epic ids and unknown metrics dropped; a month file keeps only typed text and valid KPI keys, CRLF normalised).

**TC-PCK-02 Epic counts** — Req PCK-04 — L1 `monthly-pack.test.mjs` ("Epic counts: descendants without Tasks, open / closed in month / closed YTD / closed share (PCK-04)").

**TC-PCK-03 The pack: lines, supported counts, YoY, capacity and slide text** — Req PCK-03, PCK-05 — L1 `monthly-pack.test.mjs` ("the pack: releases per line, supported counts, YoY from last year, capacity lines and slide text (PCK-03, PCK-05)": DP this year vs. last year, an Epic-mapped PPU line, the overall change, the capacity, YoY and supported lines, the overload risk line, the copy text of both slides); `monthly-pack.test.mjs` ("the .pptx writer: a zip with the presentation parts, one slide per input, text escaped (PCK-06)").

**TC-PCK-07 Typing stays responsive** — Req PCK-09 — L1 `monthly-pack.test.mjs` ("typing in the pack does not recount the data …"); browser check with the full team data: type a paragraph in Summary and in a KPI value.

**TC-PCK-08 Bullets with + in the Monthly pack** — Req PCK-10 — L1 `monthly-pack.test.mjs` ("PCK-10: typed bullets placed below a generated bullet round-trip through Git and keep their place on the slide"); E2E `monthly-pack.e2e.mjs` ("TC-PCK-08: every Monthly pack box adds bullets with + (below a bullet) and + Add bullet (at the end); Enter adds one below, ✕ removes; Save to Git turns on": a long bullet wraps and its field grows, KB-44; "TC-PCK-04 …": read-only with the sample, no + and no text boxes); browser check with Git connected (writable token) and the team data: + on a generated release line of Actions/Deliverables Realized, type a bullet, Save to Git, reload — it is back below that line, and the .pptx and Copy slide as text show it there.

**TC-PCK-09 Capabilities (Projects & Services) bullet** — Req PCK-11 — L1 `monthly-pack.test.mjs` ("PCK-11: Capabilities (Projects & Services) — unique Features under the chosen Epics with hours recorded in the month"); E2E `monthly-pack.e2e.mjs` ("TC-PCK-04 …": Settings → Monthly pack shows the Capabilities bullet with its label); browser check with the team data and Git: choose the Projects and Services Epics, Save to Git — Pulse Check → Monthly pack shows "Capabilities (Projects & Services) [n]: …" with the Features booked that month, each once; a Feature with only Original Estimate or hours in another month is not listed; the .pptx carries the bullet.

**TC-PCK-10 Capabilities count in Key takeaways** — Req PCK-12, PCK-11 — L1 `monthly-pack.test.mjs` ("PCK-12: Key takeaways — the Capabilities count joins the Supported line"); browser check with the team data: with the Capabilities Epics set, Pulse Check → Monthly pack → Key takeaways shows "Supported: … ; Capabilities (Projects & Services) = n" with n the number of Features in the Capabilities bullet; the .pptx carries it.
- Expected: the characters appear as they are typed; no month of releases is read again while typing; the generated lines and KPIs follow the typed text.

**TC-PCK-06 The pack in the team's PowerPoint template** — Req PCK-01, PCK-08 — L1 `pptx-template.test.mjs` (all tests, with a synthetic template — the real one is never in this repository); browser check with the team template: Also L1 `pptx-template.test.mjs` ("PCK-08: no status chosen is written as \"Not set\" with a grey circle, never a green On Track").
- Steps: (1) Settings → Monthly pack: Upload template… (the team .pptx), set the Department name, Save to Git. (2) Pulse Check → Monthly pack: choose At Risk, type text in every box and a long Risks list; Download .pptx; open it in PowerPoint. (3) Upload a .txt renamed .pptx.
- Expected:
  - (1) "Template saved to Storage", the file is in the data repository only.
  - (2) Page 1 is the Performance Pulse in the template's exact design with the department, month, text, amber ! At Risk and the KPI rows; page 2 the 2x2 with its lines; the long Risks list is shrunk inside its box; the footer and logo are unchanged; the file properties name nobody.
  - (3) Refused: "This is not a PowerPoint (.pptx) file."

**TC-PCK-05 Override any KPI** — Req PCK-07 — L1 `monthly-pack.test.mjs` ("every KPI can be overridden for the month; a typed utilisation also replaces it in the generated lines"); browser check:
- Steps: Pulse Check → Monthly pack; type 95% in Utilization (YTD) and a value in an Epic KPI; Save to Git; Download .pptx; then "Use calculated".
- Expected: the slide and the .pptx show the typed values; the calculated value stays visible as "Overridden · calculated …"; a typed month utilisation also changes Summary, the capacity line and Risks; "Use calculated" brings the calculation back.

**TC-PCK-04 Monthly pack end to end** — Req PCK-01, PCK-05, PCK-06 — **UAT** — E2E `monthly-pack.e2e.mjs` ("TC-PCK-04": synthetic sample, Pulse Check → the Monthly pack tab names the month before the header month; both slides with their boxes, the capacity line, the Summary sentence and the utilisation KPI row; the bullets read-only with the sample (no + and no fields); Download .pptx gives pulse-check-<month>.pptx, a zip with the presentation parts and the box headings; Settings → Monthly pack lists the default lines and KPI rows); browser check with Git connected (writable token): type Focus areas and a KPI value, Save to Git (monthly-pack/<month>.json, View commit), reload — the text is back; in Settings → Monthly pack add an Epic to PPU and change a KPI to "Items closed in the month", Save to Git, the pack shows the Feature titles and the count; Copy a box and Copy slide as text paste as bullets; open the .pptx in PowerPoint (two 16:9 slides).

### 6.23 Insights workspace

**TC-WSP-01 KPI helpers and data completeness** — *(Retired — see TC-MYD-05)* Req WSP-02 — L1 `workspace.test.mjs` ("KPI helpers: deltas, signed text, month utilization and data completeness (WSP-01, WSP-02)": the change in points, the month's planned utilisation, the share of planned Tasks with actuals, people without region or role, a future month without a value, the cumulative sum).

**TC-WSP-02 Exception queue** — *(Retired — see TC-MYD-05)* Req WSP-03 — L1 `workspace.test.mjs` ("exception queue: over baseline, missing baseline and capacity risk, high first then by impact (WSP-03)": +60% high and +30% medium, within 25% and a closed release without scope left out, 95% not a capacity risk, the order, the stream with most planned hours, the month decides the capacity rows).

**TC-WSP-03 Timeline health** — *(Retired — see TC-MYD-05)* Req WSP-04 — L1 `workspace.test.mjs` ("timeline health: Features with a Target Date in the window per Epic — completed, overdue, at risk, planned (WSP-04)": the window, outside dates, Removed, undated Features and User Stories left out, the per-Epic and total counts, the sort by date).

**TC-WSP-04 Insight cards** — *(Retired — see TC-MYD-05)* Req WSP-05 — L1 `workspace.test.mjs` ("insight cards: each rule names its evidence, tone and pack line (WSP-05)": the seven rules with their tones, texts, bars and evidence columns, a stream not set up, the pack lines, the cards without data).

**TC-WSP-05 Page, filters and routing** — *(Retired — see TC-MYD-05)* Req WSP-01 — L1 `format.test.mjs` ("page registry …": the page in the Data Insights group with the header month); browser check: Settings → Access shows the page under Data Insights; a role without that area does not see it.

**TC-WSP-07 Insights workspace hidden** — *(Retired — see TC-MYD-05)* Req WSP-07 — E2E `workspace.e2e.mjs` ("TC-WSP-07": synthetic sample, the menu has no Insights workspace, Data Insights still lists Dashboard and Pulse Check, the Dashboard keeps its six tabs).

**TC-WSP-06 Insights workspace end to end** — *(Retired — see TC-MYD-05)* Req WSP-01…06 — E2E `workspace.e2e.mjs` ("TC-WSP-06": synthetic sample, the KPI tiles with their change, the two charts, the exception queue filtered by a kind chip, the timeline from target dates; the insight cards with filters and what was checked, the evidence rows, Add to monthly pack and the queue count, Save refused with the sample, the presentation preview, a suggested question jumping to the queue filtered on Over 25% baseline; the Dashboard unchanged with its six tabs); browser check with Git connected (writable token): queue two cards, Save to monthly pack, then Pulse Check → Monthly pack of that month shows them under Key takeaways and the Git history has the commit. Suspended while WSP-07 hides the page; its E2E scenario is in the Git history of `workspace.e2e.mjs` and returns with the page.

### 6.24 My dashboard and team insights

**TC-MYD-01 My dashboard** — Req MYD-01…MYD-04 — E2E `shell.e2e.mjs` ("TC-MYD-01: My dashboard — my hours, my open work, my streams and what I signed; Pulse Check offers quarter, half-year and year"); browser check: without a work email or chosen name it asks who you are; with one, the hours match Monthly Time Writing for the month and the counts match My Tasks [Board].

**TC-MYD-02 Team insights for selected roles** — Req MYD-05 — L1 `access.test.mjs` ("Team insights: My dashboard for every role, the team insights for Tool Owner, Admin and People Manager; older files keep them for those three (MYD-05, TC-MYD-02)"); browser check (Git storage with access.json): a Team Member sees My dashboard but not the Dashboard or Pulse Check; a People Manager sees both; ticking Team insights for Scrum Master in Settings → Access shows them to Scrum Masters.

**TC-MYD-03 Personal views model** — Req MYD-06, MYD-09 — L1 `personal-views.test.mjs` ("personal views: a file per person, only known shapes kept, defaults under my own changes (MYD-06…MYD-09, TC-MYD-03)"; "sections in my order: removed sections dropped, new ones placed after their neighbour, hidden apart (MYD-06, TC-MYD-03)").

**TC-MYD-04 Customize sections and menu** — Req MYD-06, MYD-07, MYD-08 — E2E `shell.e2e.mjs` ("TC-MYD-04: a person hides and moves the sections of My dashboard and pins a page to the menu; both survive a reload"); browser check (Git storage, work email): the file `personal-views/<email>.json` appears in Git and the layout comes back on another computer; an admin's "Use as default for everyone" applies to a person who changed nothing; the Dashboard and Pulse Check periods are remembered; Customize menu lists the pages under their menu groups with Pinned and In menu boxes, and the sidebar shows Customize menu and View as… as full-width buttons like Desktop app.

**TC-MYD-05 Team overview tiles and tabs** — Req MYD-10, MYD-11, MYD-12 — E2E `shell.e2e.mjs` ("TC-MYD-05: Team overview shows six headline tiles; each opens its analysis, with a trail back; Delivery opens Pulse Check"); unit tests of the calculations as before (`dashboard.test.mjs`, `insights.test.mjs`); inspection: the menu offers no Insights workspace and `src/workspace.ts` is gone.

**TC-MYD-06 Releases and documents signed by me in a period** — Req MYD-13 — E2E `shell.e2e.mjs` ("TC-MYD-01: My dashboard is the start page: my hours, my open work, my streams and what I signed; Pulse Check offers quarter, half-year and year": the Signed by me panel, This year sets From / To, the streams listed); L1 `my-signatures.test.mjs` ("MYD-13: signature fields are Author, Reviewer or Approver names — not their dates, functions or roles (TC-MYD-06)"; "MYD-13: documents and releases I signed per stream in a from–to period; a release counts once (TC-MYD-06)"; "MYD-13: a Windchill export counts the documents I signed by its Author / Reviewer / Approver columns (TC-MYD-06)"); browser check with the stream views fetched (with their Author / Reviewer / Approver fields) and the Windchill exports imported: My dashboard → Signed by me shows releases and documents per stream for Last 12 months; choose From / To or This quarter — the figures follow; the document list names the stream, release, field and date; a stream without such fields is named.

**TC-MYD-07 My dashboard with blocks of my own from every data source** — Req MYD-14, MYD-15, MYD-16, MYD-17, MYD-18, MYD-23, MYD-24 — **UAT** — E2E `my-dashboard.e2e.mjs` ("TC-MYD-07: My dashboard with blocks of my own from every data source — added, moved, resized, kept, private, per role, reset": the synthetic sample and a mocked GitHub; the default My dashboard shows its five sections in order and no block; ＋ Add block… adds a bar of Azure DevOps work by State, a KPI tile of this month's releases (Releases per stream, filter Month = this month), a line of the Average of Utilization % per month (Capacity and utilization) and a narrative over the Azure DevOps work; Customize moves the bar above Signed by me and makes it full width; a block's ⋯ Move down; the entry `my-dashboard` is kept with the personal views and a reload keeps everything; another person — with Ana's personal views file in Git — sees the default My dashboard; a Team Member (no Team insights) with the same layout sees "Not available for your role." on the capacity block and no figures; Reset to the default My dashboard brings the five sections back and removes the blocks); also run at 4x CPU slowdown (CI-12); UAT: on My dashboard choose ＋ Add block… — the Data source list offers the table pages, Time Writing hours, Azure DevOps work, Releases per stream, Capacity and utilization, QE Mapping, KPI tracker values, Historical hours and each Windchill export (those your role may not see marked "(not available)"); add a KPI tile of Capacity and utilization (Sum of Available hours, period one month) — it equals Team overview's capacity of that month with no filter; add a summary table of Releases per stream by Stream, filtered to Completed, for one month — each stream equals Pulse Check's Completed releases of that month; click a bar of Azure DevOps work — the rows behind it list each item's #ID as a link to Azure DevOps; resize a block by its corner; ask a colleague to open My dashboard — they see their own; an Admin's View as of you shows the default My dashboard; Reset to the default My dashboard.

**TC-MYD-08 The data sources of My dashboard** — Req MYD-15, MYD-16, MYD-17, MYD-18, MYD-19, MYD-20, MYD-21, MYD-22 — L1 `dashboard-sources.test.mjs` ("MYD-15: the registry — every kind declares its fields and the area it needs; keys follow one pattern; a role without the area gets “Not available for your role.” and no rows (TC-MYD-08)", "MYD-16: Azure DevOps work — Features, User Stories and Tasks with their fields, #ID links; only my own for a role with My Tasks but not the backlogs (TC-MYD-08)", "MYD-17: Releases per stream — a row per release Pulse Check counts; Completed and Supported per stream and month equal Pulse Check’s, entered counts included (TC-MYD-08)", "MYD-18: Capacity and utilization — Team overview’s figures per person and month; totals equal Team overview’s (TC-MYD-08)", "MYD-19…MYD-22: QE Mapping sheets, KPI tracker values, historical hours and Windchill exports as sources with their natural fields (TC-MYD-08)"); inspection (MYD-22): Pulse Check and the Monthly pack are covered by the release and capacity sources; browser check: with the KPI tracker copy in Git, a block over KPI tracker values shows "Load the KPI tracker to see this." with **Load the KPI tracker** until chosen, then the values; the same for the QE Mapping and the historical hours.

**TC-MYD-09 My dashboard's personal layout** — Req MYD-14, MYD-23 — L1 `my-dashboard.test.mjs` ("MYD-14: the default My dashboard is the built-in sections in their order; blocks of my own come after them, moved and hidden like sections (TC-MYD-09)", "MYD-23: the layout is kept as my own personal views entry, validated when read; unknown sources dropped; the shared defaults never carry it (TC-MYD-09)"); browser check (Git storage, work email, live data): after a change `personal-views/<email>.json` holds `filters.my-dashboard` with the blocks and no rows or figures; Use as default for everyone writes the sections' order and no block; View as a person shows the default My dashboard with the note that personal layouts are private and no Customize or ＋ Add block…

**TC-MYD-10 Completed releases per stream per month as a data source** — Req MYD-25, MYD-15 — L1 `dashboard-sources.test.mjs` ("MYD-25: Completed releases per stream per month — the Month tabs’ counts by stream and month, Windchill exports included, Counted in Pulse Check per my filter; a line with Running total is the Year chart (TC-MYD-10)", "MYD-15: the registry — …"), `cumulative-releases.test.mjs` ("MYD-25: Completed releases rows — one per stream and month up to the current one, with Counted in Pulse Check (TC-MYD-10)"); browser check with the synthetic sample and the S&S IT export: My dashboard → ＋ Add block → source **Completed releases per stream per month**, a line chart by Month split by Stream with Running total and the period Year — its values at the current month equal Pulse Check's Year chart; a column chart of the Sum by Month equals the panel's Month total; a filter Counted in Pulse Check = Yes leaves out the streams of my Streams not counted filter; a role without Release Details and Team insights sees “Not available for your role.”.

**TC-HIS-01 Historical hours page** — Req HIS-01 — E2E `shell.e2e.mjs` ("TC-HIS-01: Settings → Historical hours explains the import and needs Git storage to upload"); browser check with Git storage and the real planning workbook: Upload Excel… reads TransformedData; the counts (rows May–Sep 2026, people, recorded hours, rows not imported with their reasons) match the workbook; Save to Git writes `history-hours.json` to the data repository (not to the app's repository); the page shows the source, cut-off and the Azure DevOps Tasks left out; Remove history removes the file.

**TC-HIS-02 Reading the workbook** — Req HIS-02, HIS-03 — L1 `history.test.mjs` ("historical hours: the TransformedData sheet read before the cut-off; every other row listed with its reason (HIS-02, HIS-03)").

**TC-HIS-03 The history file in Git** — Req HIS-04, HIS-08 — L1 `history.test.mjs` ("historical hours: the Git file keeps known shapes only (HIS-04)"); browser check: upload again after saving — earlier name and stream choices are kept.

**TC-HIS-04 History in the reports** — Req HIS-05, HIS-07, HIS-09 — L1 `history.test.mjs` ("historical hours in the reports: before the cut-off the history only, from it Azure DevOps only; real Epics and mapped streams used (HIS-05, HIS-07)"); browser check: after the import the Team overview and Pulse Check show May–Sep 2026 per person and stream (a person who has left by name), October from Azure DevOps only; My Tasks [Board], Bulk actions and Monthly Time Writing show no imported row.

**TC-HIS-05 Names** — Req HIS-06 — L1 `history.test.mjs` ("historical hours: Excel names matched to Azure DevOps names in any order; ambiguous or unknown names stay as written (HIS-06)"); browser check: change a report name in the People list and save — the person's history follows the new name.

**TC-HIS-06 Feature ID and Git storage source** — Req HIS-10, HIS-11 — L1 `history.test.mjs` ("historical hours: a Feature ID of a Feature in the data wins over Epic No and stream; disagreements and unknown Features listed (HIS-10)"); browser check with Git storage: put the planning workbook in the data repository (or its history/ folder) — From Git storage… lists it and reads it like an upload; a TransformedData sheet with a Feature ID column shows "By Feature ID" and the warning lists Feature IDs not fetched and those whose Epic No disagrees.

**TC-HIS-07 Holidays, leave and trainings in the history** — Req HIS-12 — L1 `history.test.mjs` ("historical hours: holidays, leave and trainings under their Features count for the row's own person only (HIS-12)"); browser check: after importing a workbook whose holiday rows carry the regional holiday Feature's ID, Capacity and workload shows each person's own holiday hours for the month, not the team's total.

**TC-HIS-08 Group rows (All, All-BLR, All-NL, All-US)** — Req HIS-13 — L1 `history.test.mjs` ("historical hours: All, All-BLR, All-NL and All-US rows apply to everyone in that group (HIS-13)"); browser check: import a workbook with an All-BLR holiday — the check shows the group rows apart from the People list, and after saving every India person has that holiday in the month, Netherlands and US people do not.

**TC-HIS-09 Reading Epic No and Feature No** — Req HIS-14 — L1 `history.test.mjs` ("historical hours: Epic No / Feature No cells written as Excel writes them are read; others are reported, never silently ignored (HIS-14)"); browser check: a stream whose rows carry Feature Nos is not listed under "Streams without an Epic No" when those Features are fetched; when listed, its "Why" names the cause.

**TC-HIS-10 Changing the cut-off after reading** — Req HIS-15 — L1 `history.test.mjs` ("historical hours: the file is read with every month, so a later cut-off brings October back without uploading again (HIS-15)"); browser check: load the workbook, change the cut-off from October to November — Rows imported grows by the October rows and "Left out as expected" says how many rows are from November on; save, and the reports show October from the Excel.

**TC-HIS-11 Tag column** — Req HIS-16, CAP-32 — L1 `history.test.mjs` ("historical hours: a Tag column marks training / NPRA rows; the app's own tags cannot be set from it (TC-HIS-11)"); browser check: add a Tag column to the workbook and mark training rows "Training" under the person's absence Feature — after saving, Pulse Check and My dashboard count them as NPRA and the untagged PTO rows as absence; a Tag "Shared: everyone" is ignored.

### 6.25 Time Writing and Testing

**TC-ACT-01 Testing heading for admins only; Time Writing in My Work** — Req ACT-01, ACT-02, ACT-07 — E2E `shell.e2e.mjs` ("TC-ACT-01: Time Writing is under My Work for everyone; the Testing heading is for the Admin role only"); browser check: with access.json, an Admin sees TESTING › Time Writing, a Team Member does not (also not through View as a Team Member); without a policy nobody sees it; on a phone the cards stack and the stream shows under the activity.

**TC-ACT-02 Time Writing lists the month and saves once** — Req ACT-03, ACT-05, ACT-06 — **UAT** — E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline"); L1 `my-work.test.mjs` (TC-ATM-16…19, the month-task rules it reuses); browser check with the Time Writing connection: a Feature of yours without a task is listed only under Suggested missing items, not in Your activities, and Save stays disabled; Add moves it into Your activities, enter hours, Save adds "<Month> \| <Feature>" with those hours, once; unticking it returns it to the suggestions; change an actual and Save updates Completed Work; tick a leave row and its task is added under your leave story; with sample data or during View as nothing is saved and the reason is shown; the KPI cards, the last day and the suggestions follow.

**TC-ACT-03 Add a new activity** — Req ACT-04, ACT-06 — **UAT** — browser check: choose a stream, then a Feature (yours listed first), enter hours, Save activity — your month task appears under it with the hours; choose a Feature where you already have one — its current hours show in the fields and the hint says what you save replaces them; Save replaces them and adds no second task; only Active Epics and their Active or New Features are offered, each with its ID; only your own Features are listed and typing in the search box narrows them; a Feature can be chosen first and its Epic fills in; the chosen Epic's and Feature's ID and each activity's ID open the item in Azure DevOps.

**TC-ACT-04 Add a User Story** — Req ACT-08, ACT-06 — E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": the User Story choice shows Title, Description and Comment); browser check with the Time Writing connection: choose User Story, an Epic and a Feature, enter a title, a description and a comment, Add User Story — the story appears under the Feature, assigned to you, in the Sprint chosen (the current one preselected), with the description and the comment in its Discussion; without a title the button stays disabled; with sample data or during View as nothing is saved.

**TC-ACT-06 KPI cards on top** — Req ACT-11, ACT-05 — E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": Tasks, Planned hours, Actual hours, Capacity, Monthly update and Unsaved changes above the cards); browser check: with your work email set, Tasks, Planned hours and Actual hours equal Monthly Time Writing in Individual (Me) for the same month, Capacity equals My dashboard; change an hour and Unsaved changes counts it.

**TC-ACT-07 Create a Feature** — *(Retired — see TC-ACT-12)* Req ACT-12, ACT-06, ACT-10 — E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": the Feature choice asks for Feature title and Feature DoD, the month-task box is ticked, Create Feature stays disabled without a DoD); browser check with the Time Writing connection: choose Feature, an Active Epic, enter a title, a DoD and hours, Create Feature — the Feature appears under the Epic, assigned to you, in the current PI, with "Feature DoD: …" in its Description, your month task with the hours under it and the Feature Active; untick the task box and only the Feature is created (state New); with sample data or during View as nothing is saved.

**TC-ACT-08 A User Story with the new Feature** — *(Retired — see TC-ACT-12)* Req ACT-13, ACT-12 — E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": ticking Add a User Story under it asks for its title and keeps Create Feature disabled until one is entered); browser check with the Time Writing connection: create a Feature with a User Story title, description and comment — the story appears under the new Feature, assigned to you, in the current Sprint, with the comment in its Discussion; a failing story is reported and the Feature stays.

**TC-ACT-09 Layout, KPI order and the Feature drop-down** — Req ACT-02, ACT-04, ACT-05, ACT-11 — E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": columns Epic, Activity, Planned, Actual; Save in the heading row of Your activities; KPI cards Capacity, Planned hours, Actual hours, Tasks, Unsaved changes only after an hour is changed; the ring and the last day as tiles in the same row, all tiles one height; suggestions below Your activities; the Feature drop-down lists only your Features, typing narrows it, picking one fills in its Epic); browser check: the % badges equal Planned ÷ Capacity and Actual ÷ Capacity, and Actual's hint shows Actual ÷ Planned.

**TC-ACT-10 Activities of another person** — Req ACT-14 — E2E `shell.e2e.mjs` ("TC-ACT-10: Time Writing can show another person, chosen at the top right"); browser check with the Time Writing connection: as a person without the right to create work for others, choose a colleague — their month shows and saving says it needs that right; with the right, add a task for them — it is assigned to them, not to you; choose Me to go back.

**TC-ACT-11 Time Writing replaces Monthly Time Writing and the Bulk month tasks** — Req ACT-15, ACT-01 — E2E `shell.e2e.mjs` ("TC-ACT-01: Time Writing is under My Work for everyone; the Testing heading is for the Admin role only": the menu lists Time Writing, My Tasks [Board], Sprint check under My Work and no Monthly Time Writing or Bulk actions, also for a Team Member); browser check: My dashboard's My hours link and My Tasks [Board]'s month-tasks links open Time Writing; an old pinned Monthly Time Writing or Bulk actions page in a personal menu no longer shows.

**TC-ACT-12 A new Feature from Time Writing uses the New Feature form** — Req ACT-16, BKL-26 — E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": the Feature choice has no form of its own, only Open New Feature, disabled with the sample-data reason); browser check with the Time Writing connection: Add a new activity → Feature → Open New Feature opens the New Feature form with the person shown as assignee and the header month in "Time Writing (<Month>)"; under an Epic with a Feature setup its title fields, DoD and User Stories appear as on Backlogs; Save creates the Feature in the Epic's Area Path and the chosen PI, the stories in the Sprint and the Time Writing story and Task with the setup's paths (else the project root and the Feature's area).

**TC-ACT-13 A work Task from Time Writing** — Req ACT-17, BKL-27 — L1 `my-work.test.mjs` ("ACT-17: addTask — a work Task under a User Story by the User Story rules; never a Time Writing Task") ; E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": the Task choice asks for the User Story, Title, Description and Comment, and Add Task stays disabled without a title); browser check with the Time Writing connection: Add a new activity → Task, pick a Feature and one of its User Stories, enter a title, description, Sprint and comment → Add Task creates the Task under that story, assigned to the person, in the story's Area Path and the chosen Sprint, with the comment in its Discussion.

**TC-ACT-14 Close Features on Time Writing** — Req ACT-18 — L1 `close-feature.test.mjs` ("ACT-18: Close Feature closes only my open items, children first; the Feature too when nothing else is open (TC-ACT-14)"; "ACT-18: open work of others keeps their story and the Feature open; a Feature of someone else is never closed (TC-ACT-14)"; "ACT-18: closing runs New → Active → Closed for stories and Features; a failure keeps everything above it open (TC-ACT-14)"); E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": Close Features shows tick boxes, Close 1 Feature, nothing written with sample data); browser check with the Time Writing connection: tick Close Features, tick a Feature of yours → the confirmation lists your Tasks, User Stories and the Feature; after OK they are Closed in Azure DevOps, the month row shows Closed · read-only with its hours disabled; a Feature with someone else's open Task keeps that story and the Feature open and says why.

**TC-ACT-15 Add a new activity as a pop-up** — Req ACT-20, ACT-19 — E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": ＋ Add a new activity next to Activities of, the list full width, the form in a pop-up that closes); browser check: ＋ Add a new activity opens the pop-up with Time Writing task / User Story / Task / Feature; a save shows its message in the pop-up; Open New Feature closes it and opens New Feature.

**TC-ACT-16 Time Writing in order of Feature number** — Req ACT-21 — L1 `my-work.test.mjs` ("ACT-21: Time Writing lists in order of Feature number — a Task or story by the Feature above it; rows without a Feature after (TC-ACT-16)"); E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": the #IDs of Your activities rise); browser check: Your activities, the suggestions and Leave and training list by Feature #ID, lowest first.

**TC-ACT-17 Time Writing cards stay at the top; Add a new activity in the list** — Req ACT-22, ACT-20 — E2E `shell.e2e.mjs` ("TC-ACT-17: the top-bar Person list opens over the sticky Time Writing cards, nothing of it hidden"; "TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": scrolled to the end, the cards sit under the top bar; ＋ Add a new activity is in the list's heading row and there is no “Add activities” heading); browser check: scroll a long month — the cards stay at the top.

**TC-ACT-05 Suggestions by state, Add all** — Req ACT-09, ACT-10 — E2E `shell.e2e.mjs` ("TC-ACT-05: suggestions filter by Active / New / Both and Add all moves them into Your activities"); browser check with the Time Writing connection: with a New and an Active Feature of yours without a task, Active / New / Both narrow the suggestions; Add all puts the shown ones in Your activities and Save creates their tasks; the Features keep their state (ATM-28: a New Feature becomes Active only through an Active User Story).

### 6.26 Planning Overview

**TC-OVW-01 Delivery and health by Target date** — Req OVW-03, OVW-07, OVW-01 — L1 `planning-overview.test.mjs` ("Planning Overview: delivery by Target date — done, overdue, open; the absence Epic left out (TC-OVW-01)"); browser check: Testing → Planning Overview — the Delivery tile counts the Features due this month that are done; Delivery health lists the Epics with completed / open / overdue Features of the next six months; only Active Epics in the Epic filter.

**TC-OVW-02 Exceptions and filters** — Req OVW-02, OVW-04, OVW-06, OVW-01 — L1 `planning-overview.test.mjs` ("Planning Overview: exceptions — over 25% baseline, missing baseline, capacity risk; filters narrow them (TC-OVW-02)"); browser check: with baselines set, a release booked more than 25% over its baseline is listed with its % over and the tile counts it; a release without a baseline is "Missing baseline"; a person planned over the overload threshold is "Capacity risk"; Region, Epic and Owner narrow every figure; the type chips filter the queue; an item's ID opens it in Azure DevOps.

**TC-OVW-03 The page for admins** — Req OVW-01, OVW-05, OVW-08 — E2E `shell.e2e.mjs` ("TC-OVW-03: an Admin opens the Planning Overview with its tiles, chart, queue and health"); browser check: the chart shows 12 months with the legend, hover gives the month's figures and "Show as a table" the same numbers; Generate Monthly Pack opens Settings → Monthly pack; a Team Member does not see the page.

### 6.27 Capacity vs Actual

**TC-CVA-01 Tiles, people and Epics** — Req CVA-02, CVA-04, CVA-05 — L1 `capacity-actual.test.mjs` ("Capacity vs Actual: tiles, bands per person and hours by Epic (TC-CVA-01)"); browser check: Testing → Capacity vs Actual — Actual equals the Completed Work booked in the month; utilization = actual ÷ capacity; a person over the overload threshold shows **Over**, below the available threshold **Under**; the Epic list adds up to Actual.

**TC-CVA-02 Filters** — Req CVA-01 — L1 `capacity-actual.test.mjs` ("Capacity vs Actual: Region, Owner and Epic filters (TC-CVA-02)"); browser check: Region and Owner narrow the people and every figure; an Epic narrows the actual hours to that Epic while capacity stays the same; Clear filters restores all.

**TC-CVA-03 The page for admins** — Req CVA-01, CVA-03, CVA-06 — E2E `shell.e2e.mjs` ("TC-CVA-03: an Admin opens Capacity vs Actual with its tiles, chart and people"); browser check: 12 months on the chart, bars over capacity in red, hover and the table view give the same figures; on a phone the tiles stack; a Team Member does not see the page.

**TC-KPT-01 KPI tracker from the Git copy** — Req KPT-01, KPT-04 — E2E `shell.e2e.mjs` ("TC-KPT-01: the KPI tracker page is hidden from the menu (kept in the build)"); L1 `kpi-tracker.test.mjs` ("KPT-04: a sheet shows as a table — the first row with text is the header; blank and repeated headings get names"); browser check: Data Insights has no KPI tracker entry and Customize menu does not offer it (hidden since v7.11.0); once shown again: with Git storage connected and kpi-tracker.json saved, the page shows the table, the Sheet choice and "Showing the copy saved in Git …".

**TC-KPT-02 Read the KPI tracker live in the desktop app** — Req KPT-02, IF-05 — L1 `kpi-tracker.test.mjs` ("KPT-02: the SharePoint link is checked — https, a site, an .xlsx file, no credentials; a \"/:x:/r/\" link works too"; "KPT-02: the desktop read is one GET; sign-in pages, refusals, a missing file and non-Excel answers are reported"); desktop check (needs SharePoint): paste the tracker's link (Copy path), Read from SharePoint → a sign-in message; Sign in to SharePoint → complete the company sign-in in the window → it closes and the table shows "Read live from SharePoint at …"; check in SharePoint that the file's version history has no new version; Sign out, read again → asked to sign in.

**TC-KPT-03 The read is saved to Git for everyone** — Req KPT-03, KPT-05 — L1 `kpi-tracker.test.mjs` ("KPT-03: the workbook is kept as text sheets within the limits; the Git copy is checked when read"); `git-watch.test.mjs` (labels); desktop check with Git: as an admin read the tracker — "Saved to Git"; kpi-tracker.json has one new commit; another browser with the app open shows "Newer data in Git: KPI tracker", Reload shows the new copy; as a Team member (or a read-only token) a read shows "not saved to Git"; with SharePoint unreachable (VPN off) the page still shows the Git copy.

**TC-DPF-01 DP release type and its set (retired — see TC-DPF-08)** — Req DPF-01 — L1 `dp-bulk.test.mjs` ("DPF-08: the type read from x.y.z.a (Major, Minor, MLD, Platform Update) only prefills a bulk row’s Release Classification"); the Release type column and the built-in Release / PU sets are removed (DPF-09).

**TC-DPF-02 QE from the QE Mapping** — Req DPF-02 — L1 `dp-bulk.test.mjs` ("DPF-02: the QE comes from the QE Mapping row naming the product (PsName, else Program); columns chosen in the setup"); browser check: choose the product and QE columns in Feature setup → the DP bulk creation Epic (as mapped, QV-59), Save to Git; the DP table’s QE column shows the mapped QE.

**TC-DPF-03 Possible QEs** — Req DPF-03 — L1 `dp-bulk.test.mjs` ("DPF-03: possible QEs are the people on the earlier releases of the product, newest first, without the QE and the release's own assignee"); browser check with All months: a product with several releases lists the earlier releases’ assignees.

**TC-DPF-04 Create Features in bulk** — Req DPF-04, DPF-05 — L1 `dp-bulk.test.mjs` ("DPF-04 / BLK-01: the bulk plan — title, type, QE with email, or why a release is skipped; a 100% Feature match is never created"); browser check with QMS-0025 (a test Epic first, mapped as the DP bulk creation Epic — without one Create Features is disabled with the reason, TC-QV-40): a DP release with a Feature matching 100 % has its tick disabled (tooltip names the Feature) and Select all shown leaves it out; tick a PU and a Major release (one with a similar Feature below 100 %) → Create Features lists both, the second with "a similar Feature #… exists"; Create → the top bar shows progress and "2 of 2 Features created"; each Feature has the type’s DoD and Release Classification, the type’s User Stories, the Time Writing story and Task, all assigned to the QE.

**TC-DPF-05 QE picked per release in bulk** — Req DPF-06, DPF-04, CNB-02 — L1 `dp-bulk.test.mjs` ("DPF-06: the QE picked in the pop-up replaces the QE Mapping's and lets a release without one be created; other reasons still skip it (TC-DPF-05)"); browser check with the QMS-0025 board and DP / IOCC / Content data: Create Features shows a person drop-down on each release that will be created, prefilled from the QE Mapping (its name under it) or, for Content, from Assign all; a release with no QE in the mapping can be picked and is then created; changing a row assigns that Feature and its stories and Task to the person picked; the result lists each Feature with its person.

**TC-DPF-06 DoD and User Stories per Release Classification value** — Req DPF-07, EPS-07 — **UAT** — L1 `class-sets.test.mjs` ("DPF-07: an Epic keeps a DoD and User Stories per Release Classification value, cleaned and saved (TC-DPF-06)", "DPF-07: the value chosen picks its own set, else the Epic default; old Release / PU sets are not used (TC-DPF-06)", "DPF-07, DPF-09: bulk sets — the value’s set, else the Epic’s own; nothing without a setup (no built-ins)", "DPF-07: my own version without sets per value uses the shared ones", "DPF-07, DPF-09: an Epic’s Release Classification values come from its own List field only (no built-in values)"); `dp-bulk.test.mjs` ("DPF-04 / BLK-01: the bulk plan …": an Epic with a setup uses its own DoD, DP's built-ins only without a setup); E2E `backlog.e2e.mjs` ("TC-DPF-06: a DoD and User Stories per Release Classification value — set up per Epic, picked by the value chosen in New Feature"); UAT: give an Epic's Release Classification values their own DoD and stories, Save to Git, create a Feature for two values and check its DoD and User Stories in Azure DevOps.

**TC-DPF-07 Release Classification per row in bulk** — Req DPF-08, DPF-07 — L1 `class-sets.test.mjs` ("DPF-08: bulk rows — the classification prefilled from the release number, picked per row, and it picks the set (TC-DPF-07)", "DPF-07, DPF-09: an Epic’s Release Classification values come from its own List field only (no built-in values)": the picked value fills the Epic's field); browser check: DP and IOCC Create Features show the drop-down per row, prefilled from the number (by the Epic's rules, TC-DPF-10), and the row's User Stories change with it.

**TC-DPF-08 No built-in Release Classification or Release / PU lists** — Req DPF-09, DPF-01, BKL-06, QV-61, BKL-13, CNB-01 — L1 `dp-bulk.test.mjs` ("DPF-09: no built-in Release / PU sets — the old ones are no longer read; the QE Mapping columns stay", "DPF-04 / BLK-01: the bulk plan …": no setup at all is skipped, no built-in set; "DPF-08: the type read from x.y.z.a …"), `class-sets.test.mjs` ("DPF-07, DPF-09: bulk sets — the value’s set, else the Epic’s own; nothing without a setup (no built-ins)", "DPF-07, DPF-09: an Epic’s Release Classification values come from its own List field only (no built-in values)"), `bulk-epics.test.mjs` ("QV-61: IOCC bulk creation uses the IOCC Epic's own Feature setup (DoD and User Stories); without a setup a release is skipped (TC-QV-42)"), `content-bulk.test.mjs` (no Release Classification), `feature-setup-inheritance.test.mjs` ("Feature setup layers: Mine → Epic (shared) → All Epics → Built in, per field (CON-95, TC-CON-59)": no built-in DoD); E2E `backlog.e2e.mjs` ("TC-BKL-19: New Feature shows its sections one after another…": an Epic without a setup has no built-in DoD and no Release Classification field); browser check: Release Details → DP has no built-in Release type column (its Release Classification (detected) column shows only the bulk Epic’s own values, TC-DPF-11); the DP / IOCC Create Features pop-up has no Release Classification column for an Epic without its own field; Setup per Epic shows no value tabs for such an Epic.

**TC-DPF-09 Release Classification rules set per value in Epic & Feature setup** — Req DPF-10, DPF-12, DPF-11 — **UAT** — L1 `class-rules.test.mjs` ("DPF-10: the rules are read strictly and kept through Save and Load; a file without them reads as before (TC-DPF-09)", "DPF-10: a part may be given to one value only — named in the message; ticking and the usual rules (TC-DPF-09)"); E2E `classification-rules.e2e.mjs` ("TC-DPF-09: a Tool Owner sets the Release Classification rules per value in Epic & Feature setup and saves them to Git; DP Create Features and the DP release table show the detected values, Release name → Version → Release Classification first"); UAT: in Admin → Epic & Feature setup → Setup per Epic, open the DP bulk Epic, under its Release Classification field tick x.0 and x.y for one value, x.y.z and x.y.z.w for others (tick one part twice: the message names it and Save is refused), Save to Git; the fields are listed Release name, Version, Release Classification first; Release Details → DP shows Release name, Version, Release Classification (detected) first, and Create Features pre-fills each row with the value for its number, with "detected from …".

**TC-DPF-10 Release Classification detected from the release number** — Req DPF-11, DPF-08 — L1 `class-rules.test.mjs` ("DPF-11: the value detected from x.0, x.y, x.y.z and x.y.z.w; a leading v; not numeric gives none (TC-DPF-10)", "DPF-11: without rules, today’s behaviour — the value named like the release type (TC-DPF-10)", "DPF-11: DP and IOCC bulk rows are prefilled by the rules, the hint value kept, a pick still wins (TC-DPF-10)"), `class-sets.test.mjs` ("DPF-08: bulk rows — the classification prefilled from the release number…"); E2E `classification-rules.e2e.mjs` ("TC-DPF-09: …": the rows' values and hints); browser check: IOCC Create Features pre-fills by the IOCC bulk Epic's rules and shows "detected from …"; a pick of another value shows "{detected} detected from …".

**TC-DPF-11 Release name, Version, Release Classification first** — Req DPF-12, DPF-04 — E2E `classification-rules.e2e.mjs` ("TC-DPF-09: …": the setup's field order, the Create Features columns and the DP release table's first columns); `documents-and-data.e2e.mjs` ("TC-QV-43: …": DP Select first, then Release name, Version, Release Classification (detected)); browser check: the IOCC release table shows Select, Release name, Version, Release Classification (detected), then Approved; without a mapped IOCC bulk Epic the classification is "—".

**TC-CNB-01 Content Features in bulk** — Req CNB-01, DPF-05 — L1 `content-bulk.test.mjs` ("CNB-01: Content bulk Features — under the mapped Content bulk Epic (none built in), the DoD, one Review of Deliverables story, 4 h; a 100% Feature match is never created, a closer one is named (BLK-01)"); browser check with QMS-0025 (a test Epic first, mapped as the Content bulk creation Epic, QV-59): Release Details → Content: releases with a Feature matching 100 % cannot be ticked; Select all shown, Create Features → the list shows each Feature title, with similar Features named; after Create each Feature is under the mapped Content bulk Epic with "Release Classification : NA", "Feature DoD: All Documents are approved", one "Review of Deliverables - <title>" story in the current Sprint and the month Task with 4 h Original Estimate.

**TC-CNB-02 One person for all** — Req CNB-02 — L1 `content-bulk.test.mjs` ("CNB-02: the pop-up assigns to one person — a name on the board, "Name <email>" or an email"); browser check: Create stays disabled until a person is chosen; typing a board name shows its email; every Feature, story and Task made is assigned to that person.

**TC-EPS-01 Epic setup in New Feature and Admin** — Req EPS-01, EPS-02, SET-15 — E2E `backlog.e2e.mjs` ("TC-EPS-01: Epic setup — its fields appear in New Feature (a value list, required and warning fields), the title follows its pattern, and Admin → Epic setup shows them"); browser check with Git storage: Admin → Epic setup → choose CP's Epic, add Platform (List, Platform list, Block, Title) and Program (Text, Warn, Description), title pattern {platform} \| {feature}; Value lists → add Platform with two values; Save to Git (one commit); New Feature under that Epic offers Platform as a drop-down marked required, shows "Empty: Program", the Title follows the pattern; Create with Platform empty is refused naming it; with it, the Feature's Description has "Program : …"; Admin → Feature setup of that Epic says the Epic setup applies.

**TC-EPS-02 Epic setup file and New Feature rules** — Req EPS-01, EPS-02 — L1 `epic-setup.test.mjs` ("Epic setup file: lists and fields cleaned, round trip stable (EPS-01, TC-EPS-02)"; "Epic setup on a new Feature: Title by the pattern or the Title fields, Description lines, Block and Warn, list values (EPS-02, TC-EPS-02)").

**TC-EPS-03 Epic setup in bulk creation and Copy to Epics** — Req EPS-03, EPS-05 — L1 `epic-setup.test.mjs` ("Epic setup in bulk creation: Block skips, Warn creates and lists, values from the on-prem item, pattern title (EPS-03, TC-EPS-03)"; "Copy to Epics: the fields and pattern to the chosen Epics, replacing theirs (EPS-05, TC-EPS-03)"); browser check: with an Epic setup on the IOCC bulk Epic, Create Features shows a release without its Block field as skipped and one without its Warn field as "Will be created — empty …"; Copy to Epics gives two ECP Epics the same fields after Save to Git.

**TC-EPS-04 Epic setup permissions** — Req EPS-04, CON-94 — L1 `access.test.mjs` ("EPS-04: Edit Epic setup and its value lists — Tool Owner, Admin (and Scrum Master for the fields) by default; a file of v7.27 gets them as in the starting matrix (TC-EPS-04)"); browser check: as a Scrum Master, Admin → Epic setup lets you edit the fields but shows Value lists read-only; Deny “Edit the Epic setup” for the role and the fields become read-only.

**TC-EPS-05 On-prem field drop-down and the old title fields** — Req EPS-06, EPS-07 — L1 `onprem-values.test.mjs` ("On-prem field drop-down: the distinct values of the field across the fetched on-prem data, sorted, case ignored (EPS-06, TC-EPS-05)"), `feature-setup.test.mjs` ("title fields per Epic: up to five, unique names, saved with the setup; title, Description lines, placeholders and on-prem values" — the old title fields are no longer kept); browser check with on-prem data fetched: an Epic setup field Program (Text, on-prem field Custom.Program) is a drop-down of the Program values in New Feature; with a Release Classification field in the Epic setup, the built-in Release Classification picker is gone and the Description has one "Release Classification :" line; Admin → Feature setup → Remove the old title fields from Git commits feature-setup.json without titleFields.
**TC-EPS-06 Epic & Feature setup page** — Req EPS-08, SET-15 — E2E `backlog.e2e.mjs` ("TC-EPS-01: …" — the Epic in Setup per Epic with its fields), `shell.e2e.mjs` ("TC-SET-06: …" — the page's sections Setup per Epic and Value lists); browser check: an old link to the Feature setup or All Epic setups opens Setup per Epic.

**TC-ADM-01 Overview checks and settings search** — Req ADM-01, ADM-03 — L1 `admin-overview.test.mjs` ("Admin overview: open Get started steps and shared-setup checks, required first, each with its fix (ADM-01, TC-ADM-01)"; "Search settings: by name or what it affects, every page reachable (ADM-03, TC-ADM-01)").

**TC-ADM-02 Overview, Ctrl K and History** — Req ADM-01…04 — E2E `shell.e2e.mjs` ("TC-ADM-02: Admin → Overview lists what to set up with links (and the bulk streams without an Epic, TC-ADM-03); Ctrl K finds a setting and opens it; History filters the changes"); browser check with Git storage: change a capacity setting — the ADMIN heading shows 1 and the Overview shows Unsaved shared changes with Save to Git; Save to Git clears both; Ctrl K → "dod" offers Feature setup; History → choose an area and type part of a change.

**TC-ADM-03 Feature setup gaps on the Overview** — Req ADM-05 — L1 `admin-overview.test.mjs` ("ADM-05: bulk creation Epics without a shared Feature setup, and shared setups without a Feature DoD (TC-ADM-03)"; "ADM-05, QV-59: every bulk stream without a mapped Epic (none built in) is listed, as IOCC was (TC-ADM-03)"); E2E `shell.e2e.mjs` ("TC-ADM-02: Admin → Overview lists what to set up with links (and the bulk streams without an Epic, TC-ADM-03); …"): on a fresh start the Overview lists "DP bulk creation Epic is not set", "IOCC …" and "Content …" (no built-in Epic) and the DP item opens Bulk creation Epics; browser check with Git storage: map a DP bulk Epic and its item goes; with a mapped DP Epic without a shared Feature setup the Overview warns "DP bulk creation Epic #… has no Feature setup"; share a Feature setup for it and the warning goes; share a setup with an empty Feature DoD and no All Epics DoD and "Feature setup without a Feature DoD: #…" appears, its button opening Feature setup.

**TC-STT-01 User Story templates: library, tags and linked stories** — Req STT-01, STT-02 — **UAT** — L1 `story-templates.test.mjs` ("STT-01: a User Story template is cleaned and kept with the Epic setup (TC-STT-01)", "STT-01: the templates offered follow their Epic and Release Classification tags (TC-STT-01)"); E2E `backlog.e2e.mjs` ("TC-STT-01: a User Story template, linked in an Epic’s setup, gives New Feature its current title, ticked; Admin lists it with its tags"); UAT: save a story of an Epic's setup as a template, tag it to a second Epic and a Release Classification value, add it there with ＋ Add from templates, Save to Git, change the template's title and check that New Feature under both Epics offers the new title, ticked.

**TC-STT-02 Linked stories follow the template** — Req STT-02 — L1 `story-templates.test.mjs` ("STT-02: a linked story takes the template’s current title and description everywhere; a removed one keeps its copy (TC-STT-02)"); browser check: in Setup per Epic with Git storage that can save, Save as template marks the story Template; ＋ Add from templates adds a linked one; Unlink turns it back into an editable copy.

**TC-STT-03 User Story templates as a list** — Req STT-03, STT-01 — E2E `backlog.e2e.mjs` ("TC-STT-01: a User Story template, linked in an Epic’s setup, gives New Feature its current title, ticked; Admin lists it with its tags": one table row with title, description, Epic, Release Classification and "1 place"; no cards); browser check with Git storage and the right to edit: Edit opens the template in a pop-up; a blank title cannot be saved; Save puts the change in the unsaved bar and Save to Git commits it; ＋ New template adds a row; Remove of a linked template asks first; search, sort and Export work.
### 6.28 On-Demand pages

**TC-OND-01 On-Demand → CoNQ: columns, a row, Save to Git** — Req OND-01, OND-02, OND-03, OND-04, OND-05, OND-09, OND-28, OND-29, OND-30 — **UAT** — L1 `on-demand.test.mjs` ("OND-04: rows — required fields, numbers and dates checked; values cleaned; search, sort values and CSV (TC-OND-03)"); E2E `on-demand.e2e.mjs` ("TC-OND-01: On-Demand → CoNQ — add a Dropdown and a Multi-select column with options, add a row, Save to Git writes on-demand/conq.json, and a reload shows it from Git"); UAT: with Git storage that can save and a role allowed both On-Demand permissions, open On-Demand → CoNQ (its title says Cost of Non-Quality and that it is not in Git yet); Set up columns… → add **Category** (Dropdown: Scrap, Rework) and **Sites** (Multi-select: Berlin, Leeds, Lyon), Save — saved to Git at once, no unsaved-changes bar; ＋ Add row → the row drawer opens → Category Rework, Sites Berlin and Lyon, Save to Git — the drawer shows CONQ-0001; the table shows "Rework" and "Berlin, Lyon" and "1 of 1 row"; Background jobs says "Saved to Git." and the data repository has `on-demand/conq.json` with both columns, their options and the row; on a second computer (or after a reload) CoNQ shows the row; Export gives the row in Excel and CSV.

**TC-OND-02 Page file read back from Git is validated** — Req OND-08, GIT-15 — L1 `on-demand.test.mjs` ("OND-08: an On-Demand page file is validated when read back from Git — unknown types, bad ids and values cleaned, a file that is not a page refused (TC-OND-02)"); browser check: put a hand-edited `on-demand/test.json` with a column of type "formula" and a row with a value of an unknown column in the data repository, Reload from Git — the page shows the column as Text and no unknown value; a file that is not a page is reported as "On-Demand: on-demand/….json: … is not an On-Demand page." and the other pages still show; a change saved from another browser is named "On-Demand page …" in the Newer data in Git banner. L1 `git-storage.test.mjs` verifies that public or unverified repository metadata prevents any upload attempt and that a private repository permits the upload.

**TC-OND-03 Rows in the row drawer** — Req OND-03, OND-04, OND-29 — L1 `on-demand.test.mjs` ("OND-04: rows — required fields, numbers and dates checked; values cleaned; search, sort values and CSV (TC-OND-03)"); browser check: with a required Text column, a Number and a Date column, ＋ Add row with the required field empty says it is required; "abc" in the Number field is refused; Edit changes a row; Remove asks first and takes it out of Git at once; search, sorting by the Number column (as numbers, right-aligned) and Export work.

**TC-OND-04 Column changes keep the values and ask first** — Req OND-05, OND-06 — L1 `on-demand.test.mjs` ("OND-06: changing a column type or removing an option keeps the values and says so first; a renamed option follows in every row (TC-OND-04)"); browser check: on a page with rows, Set up columns… → rename an option in use, remove another in use, change a Multi-select to Dropdown and remove a column, Save — the pop-up lists each effect with its number of rows and asks; Back returns to the columns; Save columns — the renamed option shows in its rows, the removed option's values show "not in the list", the joined values "a, b"; two columns with the same name or a Dropdown without options cannot be saved and say why.

**TC-OND-05 Two saves merged by row and column** — Req OND-09, OND-28, GIT-17 — L1 `on-demand.test.mjs` ("OND-09: two saves of a page are merged — rows and columns by id, the later save wins where both changed the same entry, a removed row stays removed unless changed later (TC-OND-05)"); browser check with two browsers on the same page: each adds a row and the first changes a value the second removes, each saved to Git at once — both new rows are kept, Background jobs says "Saved to Git — merged with a change by someone else.", and the row changed or removed last wins.

**TC-OND-06 On-Demand rights and older roles files** — Req CON-103, OND-07, CON-94 — L1 `on-demand.test.mjs` ("CON-103: the On-Demand rights — area for every role, setup and data editing for Tool Owner and Admin; an older access.json gets them as the starting matrix does (TC-OND-06)"), `access.test.mjs` ("access file: round trip, unknown entries dropped, broken files refused, editor cannot lock themselves out"); browser check: Admin → People & roles → Role rights shows the area "On-Demand pages (CoNQ …)" and the group On-Demand with its two permissions; with an access.json saved before (permissions 3) every listed role sees On-Demand and only Tool Owner and Admin may set up and edit; saving Role rights writes permissions 4.

**TC-OND-07 Read only without the rights** — Req OND-07, CON-103 — E2E `on-demand.e2e.mjs` ("TC-OND-07: a viewer without the On-Demand rights sees the page read only — rows shown, Add row, Edit, Remove and Set up columns… disabled with the reason"); browser check: as a Team Member the rows are shown, a value no longer in its options is marked "not in the list", ＋ Add row, Edit, Remove, Set up columns…, ＋ Add page…, Rename page… and Remove page… are disabled and a line names the missing permissions; without a roles file the line says "Read only: the access roles are not loaded yet, so nothing can be changed on this page."; with the synthetic sample loaded the page says "Synthetic sample data is loaded. Saving to Git is disabled."

**TC-OND-08 Add, rename and remove a page** — Req OND-10, OND-01, OND-02, OND-30 — browser check with "Set up On-Demand pages" and Git storage that can save: ＋ Add page… "Supplier escapes" (description optional) — a commit creates `on-demand/supplier-escapes.json`, the page opens and is listed under On-Demand in name order and on the Home tile; Rename page… → Save to Git commits the new name at once; Remove page… names the page, its rows and columns and that its file is deleted, Cancel keeps it, Remove page deletes the file and opens the next page; removing the last page offers CoNQ again.

**TC-OND-09 Insights: a bar chart and a summary table saved to Git** — Req OND-11, OND-12, OND-15, OND-16, OND-30 — **UAT** — L1 `on-demand-insights.test.mjs` ("OND-16: insights in the page file — written only when there are, validated on read (unknown types and bad ids dropped, broken references kept), merged by id (TC-OND-11)"); E2E `on-demand.e2e.mjs` ("TC-OND-09: Insights — on CoNQ add rows, add a Bar chart of Sum of cost by Category and a Summary table, Save to Git writes them into on-demand/conq.json, a reload shows them and the Table view lists the values"); UAT: with Git storage that can save and a role allowed both On-Demand permissions, on CoNQ with the columns Category (Dropdown), Sites (Multi-select), Cost (EUR) (Number) and Found on (Date) add three rows on the Data tab; open **Insights** — "No charts or tables yet."; ＋ Add chart / table → title "Cost by category", Bar / column, Categories by Category, Measure Sum of Cost (EUR) — the preview shows the bars, largest first; Add chart; ＋ Add chart / table → "Rows by category and site", Summary table, Rows by Category, Columns by Sites — the table shows a Total column and row; each chart is saved to Git as it is added (Background jobs) — `on-demand/conq.json` has both under `insights`; after a reload (or on a second computer) the Insights tab opens again with both; the bar chart's **Table** lists each category with its sum and the total; light and dark mode, and on a phone, the charts are readable.

**TC-OND-10 Aggregation: count, sum, average, Multi-select, months, filters** — Req OND-13, OND-14 — L1 `on-demand-insights.test.mjs` ("OND-13: Count, Sum and Average by a Dropdown — largest first, “(none)” for a value not in the list or empty, rows without a number left out (TC-OND-10)", "OND-13: a Multi-select row counts once in each of its values; totals take each row once; a value not in the list goes to “(none)” (TC-OND-10)", "OND-13: stacking by a second field and the pivot totals — cells per category × series, totals per row, per column and overall (TC-OND-10)", "OND-13: a Date column in months — a line over time fills every month from the first to the last and leaves rows without a date out (TC-OND-10)", "OND-14: filters — a Dropdown / Multi-select value set (with “(none)”) and a Date range from / to month, all applied, stated under the title (TC-OND-10)"); browser check: with a row of two Sites, a summary table by Sites shows the row under both and the Total once, and the note under the table says so; a filter Found on Jan–Mar 2026 changes "{used} of {all} rows counted" and is stated under the title.

**TC-OND-11 Insights in the page file, validated and merged** — Req OND-16, GIT-17 — L1 `on-demand-insights.test.mjs` ("OND-16: insights in the page file — written only when there are, validated on read (unknown types and bad ids dropped, broken references kept), merged by id (TC-OND-11)"); browser check with two browsers on CoNQ: one adds a chart, the other edits another and adds a row, each saved at once — both charts and the row are kept; a hand-edited insight of type "radar" is not shown.

**TC-OND-12 A removed or changed column: a clear message** — Req OND-17 — L1 `on-demand-insights.test.mjs` ("OND-17: a removed column, a changed type or a forbidden combination shows a clear message instead of a chart; a renamed column is followed (TC-OND-12)"); E2E `on-demand.e2e.mjs` ("TC-OND-13: a viewer without the setup right sees the Insights read only — charts shown, Add chart / table disabled with the reason, no chart ⋯ menu"); browser check: rename the Category column — the chart shows the new name; remove the Cost column — the Sum chart says "This chart cannot be shown: The column for the sum is no longer on the page (removed)." and Edit lets you choose another; the other charts still draw.

**TC-OND-13 Insights read only without the setup right** — Req OND-15, OND-11, CON-103 — E2E `on-demand.e2e.mjs` ("TC-OND-13: a viewer without the setup right sees the Insights read only — charts shown, Add chart / table disabled with the reason, no chart ⋯ menu"); browser check: as a Team Member the Insights tab shows the charts; ＋ Add chart / table and Filters… are disabled, the charts have no ⋯ menu (OND-61) and a line names the missing permission "Set up On-Demand pages (pages, columns, options)"; the Data tab is as before.

**TC-OND-14 Line, pie and the pop-up** — Req OND-12, OND-14, OND-15 — L1 `on-demand-insights.test.mjs` ("OND-12: a pie keeps the 5 largest categories and puts the rest, with “(none)”, in “Other”; stacks keep 5 series (TC-OND-14)"); browser check: a Line over time by Found on, one line per Sites, shows every month from the first to the last with a legend and axis names; a Pie by Category with 7 categories shows 5 and "Other"; Average is not offered for a pie; ↑ ↓ reorder (each saved at once); Remove asks in a pop-up and removes the chart from Git; Data labels and Table / Chart work on each chart; a filter with nothing ticked is refused with the reason.

**TC-OND-15 Row keys** — Req OND-18 — L1 `on-demand.test.mjs` ("OND-18: every row has a unique key from the moment it is added — prefix, date, 4 random characters; unique after two saves merge; old rows keyed on save; the prefix fixed once used (TC-OND-15)", "OND-04: rows — …": a new row's key, kept on edit, searchable, in the CSV); E2E `on-demand.e2e.mjs` ("TC-OND-01: …": the Key column, the key matches CONQ-yymmdd-XXXX and is the one saved in on-demand/conq.json); browser check with the real Git repository: two people add a row each at the same time and save; both rows keep different keys; a page saved before keys gets them on its next save; the prefix field is fixed once rows have keys.

**TC-OND-16 Row details: ID, who added it, History, Long text, Currency, descriptions** — Req OND-19, OND-20, OND-21, OND-22, OND-23, OND-25 — **UAT** — L1 `on-demand-rows.test.mjs` ("OND-19: a readable sequential ID per page — given on Save to Git in row order, never changed, the next free number; rows from before numbered (TC-OND-16)", "OND-19: two people add rows at the same time and save on their own — the numbers stay unique after the merge; a number already in Git never changes (TC-OND-16)"); E2E `on-demand.e2e.mjs` ("TC-OND-16: row details — Long text and Currency columns with a description, a row gets CONQ-0001 when it is saved to Git with who added it and when, an edit is logged in History and in the file"); UAT: with your work email set, Git storage that can save and a role allowed both On-Demand permissions, on CoNQ Set up columns… → add **Details** (Long text) and **Cost** (Currency, default USD), each with a Description, Save; the column headings show ⓘ with the description; ＋ Add row — the drawer opens empty, the descriptions are under the fields, the ID says "given when the row is saved to Git"; type a paragraph of two lines and 1200, Save to Git — the drawer shows **CONQ-0001**, the table "1,200.00 USD" right-aligned, the paragraph in at most 3 lines, your email as Added by and the time as Added on; Edit — "Added {time} by {your email}", change the cost to 1500 EUR, Save to Git — the drawer's **History** shows "Changed · {time} · {your email} — Cost: 1,200.00 USD → 1,500.00 EUR" above "Added"; `on-demand/conq.json` holds `seq`, `addedBy`, `addedAt` and the `log`; Columns → tick Last updated by / on; Export (Excel) has ID, Added by / on and Last updated by / on, not the History; on a phone and in dark mode the drawer and the History are readable.

**TC-OND-17 Who added a row, the update log and its merge** — Req OND-20, OND-21, GIT-17 — L1 `on-demand-rows.test.mjs` ("OND-20, OND-21: who added a row and when, set once; every saved edit logged with who, when and what changed (old → new) (TC-OND-17)", "OND-21: two saves of the same row — the later save wins for the values, the logs are merged so no entry is lost (TC-OND-17)"), `on-demand.test.mjs` ("OND-04: rows — required fields, numbers and dates checked; values cleaned; search, sort values and CSV (TC-OND-03)"); browser check with two browsers (two work emails) on the same row: each changes a different field and saves — the later values win, and History lists both changes with each person's email; Save without a change adds no entry; a row saved before shows "—" as Added by / on and "No changes recorded yet" until its first change.

**TC-OND-18 Long text and Currency values** — Req OND-22, OND-23, OND-06, OND-26 — L1 `on-demand-rows.test.mjs` ("OND-22, OND-23: Long text and Currency — kept, validated, shown and sorted; a type change keeps the values (TC-OND-18)"); browser check: a Long text of 10,000 characters is kept and exported in full; "abc" as a Cost is refused with "“Cost” is not an amount."; sorting by Cost sorts by amount; changing a Text column with "250" to Currency shows "250.00 {default}", changing the Currency column to Number marks "1200 EUR" as "not a number" after asking first; JPY amounts show without decimals; Other code… accepts "THB".

**TC-OND-19 Currency in the Insights: one currency at a time** — Req OND-24 — L1 `on-demand-rows.test.mjs` ("OND-24: Sum and Average of a Currency column — one total per currency, never converted; the line says which currencies were found (TC-OND-19)"); browser check: on CoNQ with costs in EUR and USD, a Bar chart of Sum of Cost by Category shows the EUR rows, "Sum of Cost (EUR)" on the axis and legend, and "Currencies found: EUR (3 rows), USD (1 row); shown: EUR"; choosing USD in the Currency list above the chart redraws it with the USD rows only; the summary table and the Table view never add EUR and USD; Count of rows counts every row.

**TC-OND-20 Column descriptions** — Req OND-25, OND-26 — L1 `on-demand-rows.test.mjs` ("OND-25: a column description — kept in the file, set in Set up columns…, capped at 300 characters (TC-OND-20)"); E2E `on-demand.e2e.mjs` ("TC-OND-16: row details — Long text and Currency columns with a description, a row gets CONQ-0001 when it is saved to Git with who added it and when, an edit is logged in History and in the file"); browser check: a description of 301 characters cannot be typed (300 at most); clearing a description removes the ⓘ and the help line; an older app version that saves the page drops the descriptions (LIM-19).

**TC-OND-21 A row in the drawer: view, edit, Save to Git at once** — Req OND-27, OND-28, OND-29, OND-21 — **UAT** — L1 `on-demand-row-save.test.mjs` ("OND-28: a row saved at once — added, changed or removed on the page as last read from Git, with a commit message naming it (TC-OND-22)"); E2E `row-drawer.e2e.mjs` ("TC-OND-21: a CoNQ row opens in a drawer from the right with its values and History; Edit → Save to Git writes the change and its log entry to Git at once; Esc closes; ＋ Add row gets its ID in its save"); UAT: with your work email set, Git storage that can save and a role allowed to edit On-Demand rows, on CoNQ with a few rows click a row — a drawer slides in from the right with the row's ID as its title, its key, who added it and when, every column with its description and value, and its History; ‹ › move to the previous / next row in the table's order (sort by Cost first: the order follows); **Edit** — the values become fields; change the cost; ‹ asks "Discard your changes?" — Keep editing; **Save to Git** — Background jobs shows "Saving to Git…" then "Saved to Git. on-demand/conq.json — updated CONQ-…", the drawer shows the new value and a new History entry with your email, and the commit in the data repository is "CoNQ: update row CONQ-…"; Escape closes it and the row keeps the focus; Tab to another row and press Enter — it opens; ＋ Add row, fill it, Save to Git — the drawer's title becomes the row's new ID; on a phone the drawer takes the full width, in dark mode it is readable.

**TC-OND-22 A row saved at once is merged with what others saved** — Req OND-28, GIT-17, OND-19, OND-21 — L1 `on-demand-row-save.test.mjs` ("OND-28: a row saved at once — added, changed or removed on the page as last read from Git, with a commit message naming it (TC-OND-22)", "OND-28, KB-80: two rows saved one after the other from the same page are both kept — the second is merged with the first, the IDs stay unique, the logs are kept (TC-OND-22)", "OND-28: a row removed at once stays removed unless someone changed it later; a row changed meanwhile by someone else is kept (TC-OND-22)"); browser check with two browsers on CoNQ: each adds a row in the drawer and saves — both rows are in Git with different IDs; one changes a row while the other changes another — both changes and both History entries are kept; with the network off, Save to Git keeps the edit in the drawer with the reason and Retry, and Retry with the network back saves it.

**TC-OND-23 The row drawer read only without the right** — Req OND-27, OND-07, CON-102 — E2E `row-drawer.e2e.mjs` ("TC-OND-23: a viewer without the right to edit rows opens a row in the drawer read only — Edit and Hide row disabled with the reason; a click beside the drawer closes it"); browser check: as a Team Member a row opens in the drawer with its values and History; Edit and Remove row are disabled with "Your role does not allow “Edit On-Demand data (rows)”. …" as their tooltip and as a line in the footer; without a roles file the line says "Read only: the access roles are not loaded yet, so nothing can be changed on this page."; with a read-only Git token it says "View only: your Git token can read but not save."; nothing is written.

**TC-OND-24 Columns, page name and charts saved at once; no unsaved-changes bar** — Req OND-30, OND-10, OND-15, OND-05 — E2E `on-demand.e2e.mjs` ("TC-OND-01: On-Demand → CoNQ — add a Dropdown and a Multi-select column with options, add a row, Save to Git writes on-demand/conq.json, and a reload shows it from Git", "TC-OND-09: Insights — on CoNQ add rows, add a Bar chart of Sum of cost by Category and a Summary table, Save to Git writes them into on-demand/conq.json, a reload shows them and the Table view lists the values"), `page-builder.e2e.mjs` ("TC-PGB-01: a Tool Owner adds the group Quality with the Table page “Supplier issues”, names a group co-owner, sets the page up and adds a row — the page is under Quality in the menu, saved in Git"); browser check: Set up columns… → Save commits the columns at once (the pop-up shows "Saving to Git…" and stays open with the reason when the save fails); Rename page… → Save to Git commits the name; adding, editing, moving and removing a chart each commit at once and show at once; no "Unsaved changes" bar on either tab; with the network off a chart change stays shown with "Not saved to Git: the change to the charts and tables of CoNQ, kept here — …", Retry saves it once the network is back, Discard asks first and drops it, ↻ Reload from Git asks before dropping it.

**TC-OND-25 The drawer: keyboard, focus, phone, themes and reduced motion** — Req OND-27 — E2E `row-drawer.e2e.mjs` ("TC-OND-21: a CoNQ row opens in a drawer from the right with its values and History; Edit → Save to Git writes the change and its log entry to Git at once; Esc closes; ＋ Add row gets its ID in its save"); browser check: with the keyboard only, Tab to a row, Enter opens the drawer and the focus is in it; Tab and Shift+Tab stay inside; Escape closes it and the focus is back on the row; a click on the dimmed page beside it closes it (asking first with unsaved edits); a screen reader announces a dialog named by the row's ID; at 390 px wide the drawer is the full width with the buttons at the bottom; in light and dark mode the text and the buttons are readable; with "reduce motion" on in the system the drawer appears without sliding; a click on Edit or Remove in the table opens the drawer for editing or the remove pop-up, not the plain view.

**TC-OND-26 Convert a page to row files** — Req OND-32, OND-31 — L1 `row-files.test.mjs` ("OND-32: convert → read back equals the original — keys, IDs, logs, columns, insights, colours; the marker in place of the file (TC-OND-26)", "OND-32: rows from before keys or IDs get them on conversion, as their next save would (TC-OND-26)"); E2E `row-locks.e2e.mjs` ("TC-OND-33: …"); browser check: as Tool Owner on a CoNQ in one file, **Convert to row files…** names the rows and the older-app warning; Convert writes one commit with page.json, a file per row, counter.json and the marker; the table, the Insights and a dashboard over CoNQ show the same rows; an app of 9.x lists CoNQ as "is not an On-Demand page" and writes nothing to it; as Admin the button is disabled with the reason. L1 `git-storage.test.mjs` verifies that an unverified or public destination receives no tree, ref, or lock write.

**TC-OND-27 Reading a page of row files: one listing, batches, only changed rows; row keys as file names** — Req OND-31 — L1 `row-files.test.mjs` ("OND-31: reading a row-file page reads only the rows changed since the last read; GraphQL batches, REST when GraphQL is refused (TC-OND-27)", "OND-31: page open time for 500 and 2,000 rows against one file (2,000 rows are over the 900 KB a single file may hold; timed as if it could) — measured with 40 ms per call (TC-OND-27)", "OND-31, SM-106: a row key is a file name only when it is a key — no path outside the page folder (TC-OND-27)"); browser check: on a converted page of a few hundred rows the network panel shows one listing, page.json and the rows tree, then a few GraphQL calls; ↻ Reload from Git after one row changed fetches that row only.

**TC-OND-28 New rows, their IDs and many-row changes on row files** — Req OND-33, OND-19 — L1 `row-files.test.mjs` ("OND-33: two clients add a row at the same moment — one counter update is refused, read again and retried: distinct IDs that never change (TC-OND-28)", "OND-33: a new row is created as its own file, never replacing one — a key clash gets a new key (TC-OND-28)", "OND-33: a column change touching values is one commit over the affected row files and page.json, applied to the rows as they are at that commit (TC-OND-28)"); E2E `row-locks.e2e.mjs` ("TC-OND-33: …"); browser check: two browsers add a row at the same moment — two row files, CONQ-0003 and CONQ-0004; renaming an option used by 3 rows is one commit.

**TC-OND-29 Two saves of the same row merged field by field** — Req OND-34 — L1 `row-files.test.mjs` ("OND-34: two saves of the same row merge field by field — the later save wins only for a field both changed; logs are united (TC-OND-29)"); browser check: with a lock released by an owner while the holder still edits, both people's different fields are kept and both History entries are there.

**TC-OND-30 Row locks: take, refuse, expire, take over, renew, release; the branch or its folder** — Req OND-35, OND-38 — L1 `row-locks.test.mjs` ("OND-35: acquire, conflict, expiry and takeover of a row lock with a fake clock (TC-OND-30)", "OND-35: two people taking over the same expired lock — only one wins (TC-OND-30)", "OND-35: the decision, the holder shown and the lock file read safely (TC-OND-30)", "OND-35: the branch `locks` is made from the data branch; where the repository refuses it, the locks go to the folder locks/ of the data branch (TC-OND-30)"); E2E `row-locks.e2e.mjs` ("TC-OND-33: …"); browser check: Edit creates locks/conq/<key>.json on the branch locks and nothing on the data branch; with a token that may not create branches the info notice shows and the lock is in locks/ of the data branch; View as and a read-only token never write a lock; a lock commit raises no "Newer data in Git".

**TC-OND-31 The inactivity timeout and its setting** — Req OND-36 — L1 `row-locks.test.mjs` ("OND-36: the inactivity timeout — the warning 2 minutes before, the heartbeat only after input, the shared setting (TC-OND-31)"); E2E `row-locks.e2e.mjs` ("TC-OND-33: …"); browser check: with 15 minutes, no input for 13 minutes shows the warning with the countdown and Keep editing (a screen reader announces it once), typing renews the lock at most every 2 minutes; Admin → Pages & menu → Row locks → Change… as Admin and Tool Owner saves row-locks.json, as Team Member it is disabled with the reason, 0 and 241 are refused.

**TC-OND-32 Drafts kept a day and restored** — Req OND-37 — L1 `row-locks.test.mjs` ("OND-37: drafts — kept at the timeout, found for the same repository, page, row and person, restored over the row as it is now, deleted after a day (TC-OND-32)"); E2E `row-locks.e2e.mjs` ("TC-OND-33: …"); browser check: after a timeout the browser storage holds one draft (page, row key, email, values) and nothing else; after 24 hours it is gone; another person in the same browser is not offered it.

**TC-OND-33 Two people on a page of row files** — Req OND-31, OND-32, OND-33, OND-35, OND-36, OND-37, OND-38 — **UAT** — E2E `row-locks.e2e.mjs` ("TC-OND-33: two people on a page of row files — convert as Tool Owner, a row lock with "Being edited by", rows added at the same moment with distinct IDs, the timeout keeping a draft that is restored, and a page co-owner releasing a stuck lock"); UAT: with three colleagues — the Tool Owner, two editors and a co-owner of CoNQ — the Tool Owner sets Admin → Pages & menu → Row locks to 2 minutes and converts CoNQ (the pop-up names its rows); editor A clicks Edit on a row — editor B sees ✎ and A's email on that row, and in its drawer "Being edited by … since …" with Edit disabled and the reason; B and the Tool Owner each add a row at the same moment — both get their own ID; A leaves the edit alone — the warning comes with a countdown and Keep editing, then the edit closes, saying the draft is kept; someone changes the row's Category; A clicks Edit — "Restore your draft from …" names the Category change, Restore draft and Save to Git keep both; the co-owner opens a row locked by someone who closed their browser and releases it with Release lock; the Tool Owner sets the timeout back to 15.

**TC-OND-34 Hide a row, show hidden rows, delete a hidden row** — Req OND-39, OND-40 — L1 `row-files.test.mjs` ("OND-39, OND-40: a row hidden and shown again — kept with its ID, logged, left out of what everyone sees, merged; a deleted row's number is never given again (TC-OND-34)"); E2E `row-locks.e2e.mjs` ("TC-OND-34: an editor hides a row — it leaves the table and the chart for everyone and comes back with Show row; the Tool Owner deletes a hidden row and its number is not given again"); browser check: a hidden row is left out of the table, a chart, its drill-down, Export and a dashboard over the page; Show hidden rows (n) lists it greyed with Hidden, remembered after a reload; as Admin there is no Delete row…; as Tool Owner Delete row… names the ID and the next new row gets the next number.

**TC-OND-40 Insights filter row: set up, narrow every chart, remembered, reset** — Req OND-50, OND-51, OND-52, OND-53, OND-54, OND-55, OND-56 — **UAT** — E2E `insights-filters.e2e.mjs` ("TC-OND-40: the owner sets up a period and a Category filter; the viewer narrows every chart and a drill-down to Q1 and Scrap, the choice kept after a reload, Reset clears it"); browser check (also on a 4x slower CPU, `E2E_CPU_SLOWDOWN=4`): on CoNQ with a bar chart and a KPI and no filter row (none shown, the KPI counts every row), Filters… → Period on Found on, ＋ Add filter Category (the period's column not offered again) → Save to Git writes `insightFilters: { period, fields }` into `on-demand/conq.json` with the charts kept; the row shows Year / Quarter / Month / Category / Reset filters and "Period on Found on: {year} (whole year) · 6 of 8 rows counted (1 without a date in Found on left out)."; Quarter Q1 and Category Scrap narrow the KPI, the bar, its Table view and "Rows behind Scrap" to the same two rows; a reload keeps the choice without writing the page; Reset filters goes back to the whole year; UAT: as a page owner set up a period and a Dropdown filter on a Table + Insights page with at least two charts, then as a colleague choose a quarter and a value — every chart and a click on a bar show only those rows, the line under the row names the choice and the rows counted, the choice is still there the next day (and on another computer with personal views), Reset filters clears it; light and dark mode, and on a phone, the row is readable.

**TC-OND-41 insightFilters in the page file: written only when set, validated, merged** — Req OND-52, OND-56, GIT-17 — L1 `insight-filters.test.mjs` ("OND-52, OND-56: insightFilters in the page file — optional, written only when set, validated on read (shape, repeats, max 6), merged as one entry; a page without it is unchanged (TC-OND-41)"); browser check: put `"insightFilters": { "period": "c1", "fields": ["gone", "c4"] }` by hand into a page file whose c1 is a Text column — the Insights tab shows the row with the c4 filter only and a note naming the Text column and the removed one; the file keeps the field until an owner saves Filters… again.

**TC-OND-42 The filter row narrows the rows: period and field filters; no setup changes nothing** — Req OND-53, OND-54, OND-56 — L1 `insight-filters.test.mjs` ("OND-54, OND-56: the filter row narrows the rows — period (current year by default, rows without a date left out) and field filters together; no setup changes nothing (TC-OND-42)"); browser check: on a page with a Text, a Number and a second Date filter in the row, "contains" (any case), from / to of the Number (a row without a number left out) and from / to month of the Date each narrow every chart; the line names them ("Cost: 50 – 150", "Topic contains “label”").

**TC-OND-43 The filter row on top of each chart's own filters; drill-down and Table view** — Req OND-50, OND-54 — L1 `insight-filters.test.mjs` ("OND-54: the row works on top of each chart’s own filters; the drill-down and the Table view count the same rows (TC-OND-43)"); E2E `insights-filters.e2e.mjs` ("TC-OND-40: the owner sets up a period and a Category filter; the viewer narrows every chart and a drill-down to Q1 and Scrap, the choice kept after a reload, Reset clears it"); browser check: a chart with its own filter "Category: Rework, Complaint" keeps stating it under its title and counts only the rows that pass both.

**TC-OND-44 The viewer's choice remembered and read back** — Req OND-55 — L1 `insight-filters.test.mjs` ("OND-55: the viewer’s choice read back — per page key, unknown shapes dropped, an older period kept; Reset clears it (TC-OND-44)"); browser check: with a work email (personal views in Git), the choice made on one computer is there on another after ↻ Reload from Git of the views; two colleagues on the same page each keep their own choice.

**TC-OND-45 Filters… read only without the setup right** — Req OND-51, CON-102, OND-52 — E2E `insights-filters.e2e.mjs` ("TC-OND-45: a viewer without the setup right sees Filters… disabled with the reason and still narrows the charts with the row"); browser check: as a Team Member Filters… is disabled with "Your role does not allow “Set up On-Demand pages …" as its tooltip, the row works and nothing is written to Git.

**TC-OND-46 Insights filter row: a Currency filter in one chosen currency** — Req OND-57, OND-58, OND-60, OND-55 — **UAT** — L1 `insight-filters.test.mjs` ("OND-57, OND-58: a Currency filter — one chosen currency (the one of most rows by default), the amount from / to in it, rows in other currencies or without an amount left out while a range applies (TC-OND-46)"); E2E `insights-filters.e2e.mjs` ("TC-OND-46: the owner adds a Currency filter; the viewer picks EUR 100–500 — a chart summing the column and its drill-down show the EUR rows in the range, the choice kept after a reload"); browser check (also on a 4x slower CPU, `E2E_CPU_SLOWDOWN=4`): on CoNQ with a Currency column Cost holding EUR and USD amounts and a bar chart of Sum of Cost, Filters… offers "Cost (one currency, from / to amount)"; Save to Git writes it into `insightFilters.fields`; the row shows Cost with "EUR (n rows)" first, "USD (n rows)" and Any currency, and "from EUR" / "to EUR"; EUR, from 100, to 500 → the line reads "Cost: EUR 100–500 · n of m rows counted.", the chart shows "Sum of Cost (EUR)" over those rows only and "Rows behind …" lists only EUR rows within 100–500; a reload keeps the choice; Any currency disables and clears the amounts and filters nothing; UAT: as a page owner add a Currency filter, then as a colleague choose a currency and an amount range — every chart and the rows behind a bar show only rows in that currency within the range, no amount of another currency is added or compared, the line names currency and range, the choice is still there the next day; light and dark mode, and on a phone, the row is readable.

**TC-OND-47 Currency filter amounts: finite numbers, From above To shown and not applied** — Req OND-59, OND-55 — L1 `insight-filters.test.mjs` ("OND-59: Currency filter amounts — finite numbers only, From above To shown as an error and not applied; read back per viewer (TC-OND-47)"); browser check: in the Cost filter type from 500, to 100 — both fields are marked invalid, "Cost: From is above To: the amount range is not applied until it is put right." is shown at the end of the filter row and announced, every chart counts as without the range and the line says "Cost: EUR 500–100 not applied (From is above To)"; putting To to 800 applies it; letters cannot be typed into the amount fields; a remembered choice edited by hand in the personal views file with `"min": "x"` or `"currency": "usd"` is read back without them.

**TC-OND-48 Charts show the filter row's currency** — Req OND-60, OND-24 — L1 `insight-filters.test.mjs` ("OND-60: the filter row’s currency is shown by the charts that measure that column; other charts and Count keep their own (TC-OND-48)"); E2E `insights-filters.e2e.mjs` ("TC-OND-46: the owner adds a Currency filter; the viewer picks EUR 100–500 — a chart summing the column and its drill-down show the EUR rows in the range, the choice kept after a reload"); browser check: with the Cost filter on USD (no amount) the Sum of Cost chart shows USD and its ⓘ names "The filter row’s currency for Cost, USD, …"; a KPI Count of rows and a chart of another Currency column keep their own currency; choosing EUR above the chart shows EUR until the row's currency is changed again; with Any currency every chart keeps its own default.

**TC-OND-49 Compact pages: one main action and the ⋯ menus, with the keyboard** — Req OND-61, OND-15, CON-102 — E2E `chart-resize.e2e.mjs` ("TC-CHT-13: the owner sets a chart to ⅔ × Large with its own axis names in the Edit pop-up and another to ⅓ with the keyboard in Arrange sizes — saved to Git; the page and chart ⋯ menus work with the keyboard"); E2E `page-builder.e2e.mjs` ("TC-PGB-10: a person with no ownership and no rights sees Pages & menu and the added pages with every change disabled and the reason"); browser check: on a table page Tab to ⋯ and press Enter — the menu opens with Rename page… focused, ↓ / ↑ / Home / End move, Escape closes it and the focus is back on ⋯; a disabled item shows its reason as tooltip; Delete page… is in the danger colour; as a viewer no chart has a ⋯ menu.

**TC-OND-50 Convert suggested for a large page** — Req OND-62, OND-32 — L1 `row-files.test.mjs` ("OND-62: a single-file table page is suggested for row files above 500 rows or 600 KB (two thirds of the 900 KB limit) (TC-OND-50)"); E2E `row-locks.e2e.mjs` ("TC-OND-50: a large page in one file — the Tool Owner is offered Convert to row files on the page and can dismiss it for that page; others see nothing"); browser check: as Tool Owner a page in one file with 501 rows shows the info line with Convert to row files… (the pop-up of OND-32) and Dismiss; after Dismiss and a reload it stays hidden for that page; a page with 500 rows, a page of row files and another person (also an Admin) show nothing; a new page is still one file.

**TC-OND-51 The sample rows of a page** — Req OND-64 — L1 `sample-rows.test.mjs` ("OND-64: 50 sample rows from the page’s own columns — types, options, currency, dates of the last 12 months, IDs SAMPLE-0001… (TC-OND-51)", "OND-64: the sample is deterministic for the column setup and new when a column or option changes (TC-OND-51)"); browser check: on a page with a Dropdown, a Multi-select, a Currency column in USD and a Date, Sample shows 50 rows SAMPLE-0001…0050 with values from the options, 1–3 sites, amounts in USD and dates of the last 12 months, none marked "not in the list"; reopening the page shows the same rows; after adding an option the rows change.

**TC-OND-52 Nothing of a page in Sample is written** — Req OND-66, CON-102 — L1 `sample-rows.test.mjs` ("OND-66: a page in Sample is never written — the file writer refuses it; the page’s charts and colours are kept (TC-OND-52)"); E2E `sample-data.e2e.mjs` ("TC-OND-54: Sample on CoNQ — the banner, 50 made-up rows in the table and the charts, changes disabled with the reason, nothing written to Git, the choice kept after a reload"); browser check: in Sample every change on the page and in its ⋯ menu (Rename page…, Delete page…, Convert to row files…) is disabled with "Sample data is shown: nothing is saved. Switch CoNQ to Live to change it." as its tooltip; the GitHub history of `on-demand/conq.json` shows no commit.

**TC-OND-53 The toggle remembered per person; exports marked** — Req OND-63, OND-67 — L1 `sample-rows.test.mjs` ("OND-63, OND-67: the choice per page is read back strictly; exports of sample rows are marked (TC-OND-53)"); browser check: with a work email the choice is in the personal views file as `"data-mode:conq": "sample"` and follows to another computer; a colleague still sees Live; Export (CSV) in Sample downloads `Sample-CoNQ.csv` whose first line is "Sample data — made-up rows, not the page’s data"; a drill-down export and a dashboard table export over the page are named and marked the same.

**TC-OND-54 Live / Sample on CoNQ** — Req OND-63, OND-65, OND-66 — **UAT** — E2E `sample-data.e2e.mjs` ("TC-OND-54: Sample on CoNQ — the banner, 50 made-up rows in the table and the charts, changes disabled with the reason, nothing written to Git, the choice kept after a reload"); browser check (also on a 4x slower CPU, `E2E_CPU_SLOWDOWN=4`): on CoNQ choose Data: Sample — the banner "Sample data — nothing is saved." shows on both tabs, the table says "50 of 50 rows" starting SAMPLE-0001, Edit and ＋ Add row are disabled with the reason, the Insights charts and KPI cards count the sample rows (the filter row and a drill-down too); an On-Demand Dashboard with a block over CoNQ shows the sample figures and the banner naming CoNQ, while a colleague sees the real figures; after a reload Sample is still chosen; Live shows the real rows again.

**TC-OND-55 The PDF footer: date and time of the export in the person's own zone** — Req OND-71, OND-67 — L1 `pdf-export.test.mjs` ("OND-71: the footer’s date and time of the export in the person’s own time zone, with the zone’s name (TC-OND-55)"); browser check: with the computer in Central European Time, a PDF exported at 14:32 on 24 Nov 2026 has "CoNQ · Exported 24 Nov 2026, 14:32 CET" on every page; unticking Time of export leaves "24 Nov 2026"; in Sample "· Sample data" follows.

**TC-OND-56 The print view: paper, margins, page numbers, file name** — Req OND-69, OND-70, OND-72 — L1 `pdf-export.test.mjs` ("OND-69, OND-72: the print view’s page rule, paper widths and file name (TC-OND-56)"); browser check: in Chrome or Edge the saved PDF shows "Page 1 of 4" … "Page 4 of 4" in the bottom right of each page and no chart is cut by a page break; in Firefox the pop-up says the browser cannot number the pages and the PDF shows the footer line without numbers.

**TC-OND-57 Desktop: the PDF saved where the person chooses** — Req OND-72 — L1 `pdf-export.test.mjs` ("OND-69: the desktop handler checks the request, prints with the footer template and saves where the person chose (TC-OND-57)"); browser check (desktop app on Windows): Export PDF… asks where to save "CoNQ-2026-11-24.pdf" in Documents; the file opens in a PDF reader with selectable text, the charts sharp at any zoom, the footer with "Page n of m"; Cancel in the save dialog writes nothing and Background jobs says "Not saved: the save dialog was cancelled."

**TC-OND-58 Export PDF of the Insights** — Req OND-68, OND-69, OND-70, OND-71, OND-72 — **UAT** — E2E `pdf-export.e2e.mjs` ("TC-OND-58: Export PDF of the Insights in a browser — the pop-up, a print view with the chosen charts and the footer, the print dialog opened"); browser check (also on a 4x slower CPU, `E2E_CPU_SLOWDOWN=4`): on CoNQ's Insights ⋯ → Export PDF…, choose a selection of a bar chart and a KPI card, Letter, Portrait — the print view shows only those two (the card first), the footer "CoNQ · Exported {today, now, zone}", and the print dialog opens; with the dark theme the PDF is still on white; with a filter row choice "Q1 · Scrap" the PDF's charts show the same numbers as the screen and "Filter row: …" under the title; unticking Include the active filters gives the numbers of every row.

**TC-OND-59 Export PDF of an On-Demand Dashboard** — Req OND-68, OND-69, OND-70 — browser check: on a dashboard with two KPI tiles and blocks on two tabs, the page ⋯ → Export PDF… lists the tiles (KPI card) and each block with its tab; All exports every tile and block, whatever tab is open, with "Period: 2026 (whole year) · Category: Scrap." when filtered; a block over a page in Sample carries "Sample data" in the footer.

**TC-OND-60 The standalone HTML file: escaped, offline, hidden rows left out** — *(Retired — see TC-OND-92)* Req OND-74, OND-77 — L1 `standalone-html.test.mjs` ("OND-74, OND-77: the file — every value escaped, no external URL, hidden rows left out, the sort and search script with its CSP hash (TC-OND-60)", "OND-77: a chart’s SVG is kept only when it is plain drawing (TC-OND-60)"); browser check: a row with `<img src=x onerror=alert(1)>` in a Text column shows that text in the file and nothing runs; the browser's developer tools show no request when the file is opened from a folder; a chart the check refuses says "This chart could not be included."

**TC-OND-61 The schedule's due times** — Req OND-78, OND-79 — L1 `standalone-html.test.mjs` ("OND-78, OND-79: the schedule — due times with a fake clock, a missed run once at the next start, read back strictly (TC-OND-61)"); the unit test confirms that schedules and targets do not carry over between repositories or publishers; browser check: a schedule Daily at a time two minutes ahead runs once at that time (Background jobs "Scheduled publish · CoNQ"), not again in the same day; with the app closed over that time it runs once at the next start.

**TC-OND-62 Desktop: one file per page, chosen and overwritten** — Req OND-76 — L1 `standalone-html.test.mjs` ("OND-76: the desktop file is chosen, scoped to the repository and publisher, and overwritten using an exclusive temporary file (TC-OND-62)"); browser check (desktop app on Windows): the first Publish now asks where to save "CoNQ.html" (Documents), the next ones overwrite it without asking; after the folder is renamed the publish fails with "The folder … is missing" and the page shows the warning for a scheduled run; `publish-targets.json` in the app's user data folder holds the path, and no Git file changes.

**TC-OND-63 Publish CoNQ as a standalone HTML file** — *(Retired — see TC-OND-94)* Req OND-73, OND-74, OND-76, OND-77, OND-80 — **UAT** — E2E `standalone-html.e2e.mjs` ("TC-OND-63: the Tool Owner publishes CoNQ as a standalone HTML file — the confirmation, the file picked, the rows and charts written without external addresses, sort and search working offline"); browser check (also on a 4x slower CPU, `E2E_CPU_SLOWDOWN=4`): as the Tool Owner in Chrome or Edge, CoNQ ⋯ → Publish standalone HTML… warns "This file contains every row of CoNQ. Anyone who receives it can read them.", Publish now asks for the file (CoNQ.html) and Background jobs says "Published {n} rows of CoNQ to CoNQ.html"; the file opened from a shared folder shows "Published by {you} on {date, time, zone}", the charts and the table, sorts by Cost and finds a row by a word; in Firefox the file is downloaded and Background jobs says so.

**TC-OND-64 Publish disabled in Sample and for others** — Req OND-73, OND-75, CON-102 — E2E `standalone-html.e2e.mjs` ("TC-OND-64: Publish interactive HTML… is disabled with the reason in Sample and for a person who is not an owner of the page"); browser check: a page co-owner (not Tool Owner) may publish; an Admin who is not a co-owner sees the item disabled with the reason; on an On-Demand Dashboard over a page shown in Sample the item says "Switch {page} to Live to publish {dashboard}: sample rows are never published.", and on a dashboard without blocks "No blocks to publish yet.".

**TC-OND-65 A failed scheduled publish warns on the page** — Req OND-79, OND-78 — E2E `standalone-html.e2e.mjs` ("TC-OND-65: a scheduled publish that is due at the start but cannot write its file warns on the page, with Publish interactive HTML… to fix it"); browser check: in Chrome, after the site's file permission is revoked, the next scheduled run fails with "The browser no longer lets the app write CoNQ.html …", Background jobs shows the failure and the page the warning; Publish now asks for the permission once and the warning goes with the next successful scheduled run.

**TC-OND-90 A table page publishes only the rows that pass the filter row** — Req OND-91, OND-93 — L1 `standalone-html.test.mjs` ("OND-91, OND-93: a table page publishes only the rows that pass the publisher’s filter row, never a hidden row, with the filters and counts in its header (TC-OND-90)"); browser check: on CoNQ with the Insights filter row at Q3 and Department QRE the pop-up says "This file contains the {n} rows of CoNQ that pass your filters." with the same {n} as the line under the filter row; with Reset filters (the current year) the number follows; on a Table page (no Insights) it is every row that is not hidden.

**TC-OND-91 A dashboard publishes, per data source, only the rows a block counts** — Req OND-92 — L1 `standalone-html.test.mjs` ("OND-92: a dashboard publishes, for each table page a block reads, only the rows a block counts with the publisher’s period and filters (TC-OND-91)"); browser check: a dashboard with a block over the Time Writing hours says in the pop-up and in the file "1 block over the Time Writing hours is not published."; the file's KPI tiles show the same numbers as the dashboard at publishing.

**TC-OND-92 The interactive file: escaped data block, CSP by hash, no address** — Req OND-94, OND-93 — L1 `standalone-html.test.mjs` ("OND-94: the file — the data block escaped, the viewer inline with its CSP hashes, no address, nothing but its own script and styles (TC-OND-92)"); browser check: a row with `</script><script>alert(1)</script>` in a Text column shows that text in the file's Rows tab and nothing runs; the developer tools show no request and no Content-Security-Policy report when the file is opened from a folder.

**TC-OND-93 The viewer's filter row narrows within the file** — Req OND-95 — L1 `standalone-html.test.mjs` ("OND-95: the viewer’s filter row narrows within the published rows only — every year of the file when nothing is ticked, only the values found (TC-OND-93)"); browser check: in a file cut to QRE, Department offers only QRE; Year "All" counts every row of the file, also of last year.

**TC-OND-94 Publish CoNQ as an interactive HTML dashboard, filtered** — Req OND-73, OND-76, OND-90, OND-91, OND-93, OND-94, OND-95, OND-97, OND-99 — **UAT** — E2E `interactive-html.e2e.mjs` ("TC-OND-94: the Tool Owner publishes CoNQ cut to Q3 and QRE; the file holds only those rows and works offline — header, filter row, charts, drill-down, Rows search, phone"); browser check (also on a 4x slower CPU, `E2E_CPU_SLOWDOWN=4`): as the Tool Owner in Chrome or Edge, CoNQ's Insights filtered to a quarter and a department, CoNQ ⋯ → Publish interactive HTML… warns "This file contains the {n} rows of CoNQ that pass your filters. Anyone who receives it can read them.", Publish now asks for the file (CoNQ.html) and Background jobs says "Published {n} rows of CoNQ ({filters}) to CoNQ.html"; the file opened from a shared folder (no network) shows "Published by {you} on {date, time, zone}" and "Data published: {filters} · {n} of {m} rows", the KPI cards and charts as in the app; a month ticked in its filter row changes every chart; a bar lists the rows behind it; the Rows tab sorts by Cost and finds a row by a word; the theme switches to dark; on a phone it reads in one column; in Firefox the file is downloaded and Background jobs says so.

**TC-OND-95 Publish an On-Demand Dashboard with tabs** — Req OND-73, OND-92, OND-93, OND-95, OND-97 — E2E `interactive-html.e2e.mjs` ("TC-OND-95: an On-Demand Dashboard over two table pages published with its filter row — each source cut, the tabs, the KPI tiles and the Rows of each source in the file"); browser check: a dashboard over CoNQ and a second page with two tabs, Department QRE ticked, published; the file shows both tabs, its KPI tiles open their tab, a Supplier ticked in its filter row changes only the blocks over that page; Rows of → each data source.

**TC-OND-96 A schedule publishes with the filters saved with it** — Req OND-96, OND-78 — L1 `standalone-html.test.mjs` ("OND-96: a schedule keeps the filters saved with it, read back strictly (TC-OND-96)"); E2E `interactive-html.e2e.mjs` ("TC-OND-94: the Tool Owner publishes CoNQ cut to Q3 and QRE; the file holds only those rows and works offline — header, filter row, charts, drill-down, Rows search, phone"); browser check: the pop-up says "A scheduled run publishes the rows that pass the filters saved with the schedule …"; Save schedule shows "Saved with the schedule: {filters}."; the filter row changed afterwards, the next scheduled run still publishes with the saved filters (the file's header says so).

**TC-OND-97 The viewer's size** — Req OND-98 — browser check (inspection): after `pnpm build:web`, `dist/standalone-viewer.js` and `dist/standalone-viewer.css` together are under 600 KB; a published file of CoNQ is that size plus its data; the main app's start-up chunks do not contain the viewer (it loads with the first publish).

### 6.29 Custom streams

**TC-STR-01 Built-in then custom streams everywhere; the longest name wins** — Req STR-02 — L1 `custom-streams.test.mjs` ("STR-02: allStreams — the built-in streams then the custom ones; a connection goes to the stream with the longest name (TC-STR-01)"); browser check as Tool Owner with a custom stream "Labeling" mapped and fetched: it is listed in the Stream mapping (Custom), under Release Details (in A–Z order, NAV-52), on the Home tile Release Details, in Pulse Check (Releases and Supported), in the Dashboard delivery counts, in Reports → Monthly pack setup (stream ticks) and in Release naming patterns; its view is not under Other views; a custom "DP Labels" connection is not DP's

**TC-STR-02 The file read from Git is validated** — Req STR-05 — L1 `custom-streams.test.mjs` ("STR-05: the file read from Git — round trip, each stream checked on its own (unknown rule, CP, built-in names refused with why), a broken file refused whole (TC-STR-02)"); E2E `custom-streams.e2e.mjs` ("TC-STR-07: …": a stream with CP's rule listed as not used, with why); browser check: a hand-edited `custom-streams.json` with a stream named "Content", one with rule "formula" and one valid — the valid one is used, the panel lists the other two with their reasons; a file that is not JSON leaves the streams of the last read in use with a warning

**TC-STR-03 Add, rename and remove; the rules by plain names** — Req STR-01, STR-06 — L1 `custom-streams.test.mjs` ("STR-01, STR-06: add, rename (the old name kept as an earlier name) and remove; the offered rules by plain names (TC-STR-03)"); browser check as Tool Owner: ＋ Add stream… offers the four Azure DevOps rules and, with Source Windchill export, the two Windchill rules, each with what it gives and an example; a name of a built-in stream is refused in the pop-up; Edit → rename "Labeling" to "Labels" — the commit "Rename stream: Labeling → Labels", the connection "Labeling" still feeds it; Remove asks first, names what changes and that the connection and data are kept; after it the view is under Other views

**TC-STR-04 A custom stream “Like IOCC” reads its documents** — Req STR-03, STR-04 — L1 `custom-streams.test.mjs` ("STR-03: a custom stream “Like IOCC” reads its documents into releases grouped by the Area Path after its name, with Completed and Supported (TC-STR-04)"); browser check: a custom stream "Recalls" (Like IOCC, fuzzy on, Epic 13946) on a query whose documents sit under …\Recalls\<type> — the Release page shows Type of Release, Releases in the month, Completed and Supported with "What was counted", the match % against Features of Epic 13946 only, and Select / Create Features

**TC-STR-05 Custom Windchill streams** — Req STR-03, STR-02 — L1 `custom-streams.test.mjs` ("STR-03: a custom Windchill stream — “Like S&S IT” has its export, “Like ECP” its exports read by project; ECP keeps its own (TC-STR-05)"); browser check: a custom stream "Field Actions" (Like ECP): ＋ Field Actions under Windchill exports opens the import with the ECP logic; two exports "Field Actions - EU" and "Field Actions - US" are listed on their own and in Pulse Check, read by project; ECP's own exports stay under ECP

**TC-STR-06 Tool Owner adds “Labeling” and gets its Release page** — Req STR-01, STR-02, STR-03 — **UAT** — E2E `custom-streams.e2e.mjs` ("TC-STR-06: as Tool Owner add a stream “Labeling” (Azure DevOps, Like Content), map a connection named “Labeling” — the menu lists it under Release Details and its Release page has the §10 parts"); UAT with Git storage: add the stream, map its query in the Stream mapping (Add query), open Release Details → Labeling — source bar, Releases in the month with "What was counted", Releases | Source data tabs, the common columns with Time Writing Feature, Planned (h), Booked (h), QMS-0025 match (Create Feature) and Select / Create Features; another computer gets the stream at its next start

**TC-STR-07 Read only without the right** — Req STR-07 — E2E `custom-streams.e2e.mjs` ("TC-STR-07: a viewer without “Change the stream mapping” sees the custom streams read only — ＋ Add stream…, Edit and Remove disabled with the reason; the stream is still in the menu"); browser check: as Team Member ＋ Add stream…, Edit and Remove are disabled with the reason; without Git storage the line says to connect it; with the synthetic sample loaded nothing is saved

### 6.30 Page builder

**TC-PGB-01 A Tool Owner adds a group and a Table page, names a co-owner, sets the page up** — Req PGB-01, PGB-02, PGB-03, PGB-04, PGB-05, PGB-06, PGB-08, PGB-12 — **UAT** — L1 `page-builder.test.mjs` ("PGB-02, PGB-04: the menu groups — built-in ones in menu order (Settings not configurable, On-Demand accepting pages by default), then custom ones by their order; pages of a group by order then name (TC-PGB-03)"); E2E `page-builder.e2e.mjs` ("TC-PGB-01: a Tool Owner adds the group Quality with the Table page “Supplier issues”, names a group co-owner, sets the page up and adds a row — the page is under Quality in the menu, saved in Git"); UAT: with your work email set, Git storage that can save and the Tool Owner role, open Admin → Pages & menu — CoNQ is listed as a Table + Insights page in On-Demand; ＋ Add page… → Page type **Table**, name **Supplier issues**, icon ⚑, Menu group **＋ New group…** "Quality", Add page — the page opens without an Insights tab and the menu has a heading **QUALITY** with "⚑ Supplier issues", Home has a Quality tile; Background jobs names `on-demand/supplier-issues.json` and `menu-layout.json`; in Admin → Pages & menu Edit the group Quality → Group co-owners: a colleague's work email, Save to Git — the row shows the email; on the page Set up columns… (Supplier, Severity with Minor / Major), Save; ＋ Add row, Save to Git in the row drawer — the row gets SUPPLIER-0001; the colleague (second browser, Team Member) sees ⋯ next to QUALITY and can add a page there but not change the group; a third person sees everything disabled with the reason; CoNQ is unchanged; on a phone and in dark mode the pop-up and the lists are readable.

**TC-PGB-02 The menu layout file is validated** — Req PGB-03, PGB-14 — L1 `page-builder.test.mjs` ("PGB-03: the menu layout file is validated when read — bad groups, ids, emails and icons dropped, a file that is not a layout refused — and written in a stable order (TC-PGB-02)"); browser check: a hand-edited `menu-layout.json` that is not JSON is reported in Admin → Pages & menu ("Pages & menu: menu-layout.json is not valid JSON. The menu last read is kept.") while the menu keeps its groups. L1 `git-storage.test.mjs` verifies the same GitHub privacy check for menu settings.

**TC-PGB-03 Menu groups and the order of pages** — Req PGB-02, PGB-04 — L1 `page-builder.test.mjs` ("PGB-02, PGB-04: the menu groups — built-in ones in menu order (Settings not configurable, On-Demand accepting pages by default), then custom ones by their order; pages of a group by order then name (TC-PGB-03)").

**TC-PGB-04 Groups: name, rename, configure, remove only when empty** — Req PGB-06, PGB-02 — L1 `page-builder.test.mjs` ("PGB-06: groups — a name is required and unique (built-in names too), a built-in group is only configured, a custom group is removed only when empty (TC-PGB-04)").

**TC-PGB-05 Rights of the Tool Owner, a group co-owner, a page co-owner and nobody** — Req PGB-08, PGB-09, PGB-10, PGB-11 — L1 `page-builder.test.mjs` ("PGB-08…PGB-11: rights — Tool Owner, group co-owner, page co-owner and nobody for each action; the role-wide On-Demand rights still apply; fail closed (TC-PGB-05)").

**TC-PGB-06 “Manage pages and menu groups” and older roles files** — Req CON-106, PGB-08, CON-94 — L1 `page-builder.test.mjs` ("CON-106: “Manage pages and menu groups” — Tool Owner only in the starting matrix and for an access.json written before permissions 5; while no Tool Owner exists, those who manage access (TC-PGB-06)"); browser check: Admin → People & roles → Role rights lists "Manage pages and menu groups (Tool Owner)" in the On-Demand group, allowed for Tool Owner only.

**TC-PGB-07 CoNQ migrates in place** — Req PGB-13, PGB-01 — L1 `page-builder.test.mjs` ("PGB-13: CoNQ migrates in place — without a placement it is a Table + Insights page in On-Demand, its file untouched; a group removed elsewhere sends its pages back to On-Demand (TC-PGB-07)").

**TC-PGB-08 Two saves of the menu layout merged** — Req PGB-03, GIT-17 — L1 `page-builder.test.mjs` ("PGB-03, GIT-17: two saves of the menu layout are merged by group and page — fields three ways, the later save where both changed, co-owners as sets with removals kept (TC-PGB-08)").

**TC-PGB-09 A group co-owner adds a page but cannot change the group** — Req PGB-09, PGB-05, PGB-11, PGB-12 — E2E `page-builder.e2e.mjs` ("TC-PGB-09: a group co-owner adds a Table + Insights page to Quality and sets it up, but cannot create or change groups"); browser check: as a co-owner of Quality (Team Member role), ＋ New group…, Edit and Remove of every group are disabled with "Only a Tool Owner (“Manage pages and menu groups”) …"; ＋ Add page… offers Quality only; the new page sets up its columns although the role does not allow it.

**TC-PGB-10 No ownership: everything disabled with the reason** — Req PGB-11, PGB-12, OND-07 — E2E `page-builder.e2e.mjs` ("TC-PGB-10: a person with no ownership and no rights sees Pages & menu and the added pages with every change disabled and the reason"); browser check: no ⋯ on the menu groups; Admin → Pages & menu and the page show the rows with every button disabled and the reason as a line and as the tooltip; nothing is written.

**TC-PGB-11 Edit, move, reorder and remove pages; pin and hide them** — Req PGB-07, PGB-04, PGB-06, PGB-14 — browser check as a Tool Owner: Edit a page → change its icon and type to Table + Insights, move it to On-Demand — the menu follows and the Insights tab appears; with unsaved changes on the page a rename is refused with "Save or discard the unsaved changes …"; ↑ ↓ reorder pages in a group and groups of your own; Remove a page names its rows and columns and deletes its file; Remove an empty group asks first; a group holding pages cannot be removed ("Move or remove its N pages first …"); a group set to not accept added pages hides its ⋯ and its co-owners' buttons; Customize menu pins an added page under PINNED and hides another; a page placed in Testing is shown to the Admin role only; the co-owners' emails are shown only in Admin → Pages & menu and the page's ⓘ and are removed with Edit.

**TC-PGB-12 Unique page names** — Req PGB-15, PGB-16 — L1 `page-builder.test.mjs` ("PGB-15, PGB-16: page names are compared ignoring case, spaces and width forms; a clash names the page and its group"); E2E `page-builder.e2e.mjs` ("TC-PGB-12: a page name already in the menu — another case, extra spaces, full-width letters, a built-in page — shows the error at the name field and Save stays disabled (Add page, Edit, Rename page)"); browser check as a Tool Owner: ＋ Add page… named "  conq " — "There is already a page named “CoNQ” (in On-Demand). Choose another name." under the name field, Add page disabled; "DP" (a release stream) and "Pages & menu" (an Admin page) are refused the same way; Rename page… on an On-Demand Dashboard to an existing name is refused; Edit of a page moving it to another group keeps working with its own name.

**TC-PGB-13 Duplicate page names kept and listed** — Req PGB-17 — L1 `page-builder.test.mjs` ("PGB-17: duplicate page names already in Git are kept and listed with their groups; the menu tells them apart"); E2E `page-builder.e2e.mjs` ("TC-PGB-13: two pages with the same name in Git (saved at the same time) are both kept, shown with their group in the menu and listed on Pages & menu with the suggestion to rename one"); browser check: two Tool Owners on two computers add a page "Audits" at the same moment — after both saves both pages are in the menu as "Audits (On-Demand)" and "Audits (Quality)", Pages & menu warns and suggests renaming one; renaming one removes the warning and the group from the menu label.

**TC-PGB-14 Co-owners picked from a list** — Req PGB-18 — L1 `page-builder.test.mjs` ("PGB-18: co-owners are picked from the people the app knows; owners not in the list stay, marked; no email: disabled; at most 50"); E2E `page-builder.e2e.mjs` ("TC-PGB-01 …": the group co-owner and the page co-owner ticked in the list; "TC-PGB-13 …; TC-PGB-14: co-owners picked from a list": an owner not in the list stays ticked, marked "not in Azure DevOps", type to filter); browser check as a Tool Owner after a fetch: Edit a group → Group co-owners lists the team by name with the work email, a person without a work email greyed with the reason; tick two, Save to Git — `menu-layout.json` holds their lower-case emails; the Add page pop-up names Admin → Streams → Stream mapping → ＋ Add stream… for a Release page.

**TC-PGB-15 Hide and show a page; only the Tool Owner deletes one** — Req PGB-19, PGB-20, OND-10 — L1 `page-hide.test.mjs` ("PGB-19: a page is hidden and shown for everyone — a flag of its placement, kept by moves and edits, merged like its other fields (TC-PGB-15)", "PGB-19, PGB-20: who may hide and show (Tool Owner, page and group co-owners, Set up On-Demand pages in On-Demand) and who may delete (Tool Owner only) (TC-PGB-15)"); E2E `row-locks.e2e.mjs` ("TC-PGB-15: a group co-owner hides and shows a page but cannot delete it; the Tool Owner deletes one"), `page-builder.e2e.mjs` ("TC-PGB-09: …", "TC-PGB-10: …"); browser check: a hidden page leaves the menu, Home, search and pinned pages on another computer after its next check, a dashboard over it keeps its numbers, Admin → Pages & menu lists it with Hidden and Show; a page co-owner hides their page; Delete page… is disabled with the reason for everyone but the Tool Owner; deleting a page of row files removes its folder in one commit.

**TC-PGB-16 Co-owners from the Azure DevOps team at start** — Req PGB-21, PGB-18, CAP-30 — L1 `page-builder.test.mjs` ("PGB-21: the Time Writing team is read once per session and its members are offered as co-owners; a refused read offers the others, silently (TC-PGB-16)"); E2E `page-builder.e2e.mjs` ("TC-PGB-16: the co-owner list offers the Azure DevOps team members read at start — without opening People & roles, once per session"); browser check: after a fresh start (without opening Admin → People & roles) Edit a page → Page co-owners lists a team member who has no fetched work, by name with the work email; groups are not listed; with a PAT that may not read the team the list has the other people and no message.

### 6.31 On-Demand Dashboard pages

**TC-DSH-01 A Tool Owner adds an On-Demand Dashboard, builds it and filters it by period** — Req DSH-01, DSH-02, DSH-03, DSH-05, DSH-06, DSH-07, DSH-08, DSH-10, DSH-11, DSH-12 — **UAT** — L1 `dashboard-pages.test.mjs` ("DSH-07: the period keeps the rows whose month is in it; rows without a date are counted apart; the filter row narrows its source (TC-DSH-05)"); E2E `dashboard-pages.e2e.mjs` ("TC-DSH-01: a Tool Owner adds a Dashboard page, builds it from a KPI tile, a bar chart and a summary table over a table page’s rows and filters it by period — saved in Git"); UAT: with your work email set, Git storage that can save and the Tool Owner role, and a table page with a Dropdown, a Currency and a Date column and rows of this year and last year: ＋ Add page… → Page type **On-Demand Dashboard**, name "Quality dashboard" — the page opens with "No blocks yet."; ＋ Add block… → KPI tile "Issues" over the table page (Period filter on: the Date column), Add block — the tile shows this year's rows; add a **Bar chart** by the Dropdown column and a **Summary table** with Sum of the Currency column — largest first, the first 10 rows with Show all, Export (CSV) opens in Excel with the values as text where they look like formulas; Background jobs names `dashboards/quality-dashboard.json`; tick last year in **Year** — the tile, chart and table follow and the line names the period; a month without rows shows "No data for this selection."; Reset filters goes back to this year; reload — your period comes back; Tabs and filters… → tabs Overview and Cost and a filter on the Dropdown column: tiles open their tab; a colleague without the right sees the dashboard read only with the reason; on a phone and in dark mode the tiles, charts and the pop-up are readable.

**TC-DSH-02 On-Demand Dashboard is a page type; a page keeps its family** — Req DSH-01 — L1 `dashboard-pages.test.mjs` ("DSH-01: On-Demand Dashboard is a page type of the page builder; a dashboard page is never a data source (TC-DSH-02)"); browser check: Edit a Table page in Admin → Pages & menu — On-Demand Dashboard is disabled with "A table page cannot become an On-Demand Dashboard: its rows would be hidden. …"; Edit a dashboard — Table and Table + Insights disabled with the reason; a dashboard is not offered as a data source.

**TC-DSH-03 The dashboard file is validated** — Req DSH-08 — L1 `dashboard-pages.test.mjs` ("DSH-08: the dashboard file is validated when read — a file that is not a dashboard refused whole, bad blocks dropped with a message, caps (TC-DSH-03)"); browser check: a hand-edited `dashboards/<page>.json` with one block of an unknown type shows the other blocks and the warning "Dashboard: dashboards/… — “…” has an unknown type …: left out."; a file that is not JSON is reported and the dashboard last read kept. L1 `git-storage.test.mjs` verifies that an unverified or non-private destination receives no dashboard upload.

**TC-DSH-04 Two saves of a dashboard merged** — Req DSH-08, GIT-17 — L1 `dashboard-pages.test.mjs` ("DSH-08, GIT-17: two saves of a dashboard are merged by block — fields three ways, the later save where both changed, removal against change by time (TC-DSH-04)").

**TC-DSH-05 Period and filter row** — Req DSH-07 — L1 `dashboard-pages.test.mjs` ("DSH-07: the period keeps the rows whose month is in it; rows without a date are counted apart; the filter row narrows its source (TC-DSH-05)").

**TC-DSH-06 KPI tiles, charts and summary tables aggregate as the insights** — Req DSH-05, DSH-06 — L1 `dashboard-pages.test.mjs` ("DSH-05: KPI tiles, charts and summary tables aggregate as the On-Demand insights — one currency at a time, largest first (TC-DSH-06)").

**TC-DSH-07 The block editor and broken references** — Req DSH-05, DSH-10 — L1 `dashboard-pages.test.mjs` ("DSH-05, DSH-06: the block editor — a blank block, a type change, the checks before Add block and broken references (TC-DSH-07)"); browser check: remove a column a block uses on its table page — the block says "This block cannot be shown: …" while the others are drawn.

**TC-DSH-08 Table pages are the data sources** — Req DSH-03, DSH-04 — L1 `dashboard-pages.test.mjs` ("DSH-03, DSH-04: the data sources are the table pages as saved in Git — not dashboards, not the page itself, not unsaved changes (TC-DSH-08)"); browser check: the Data source list of ＋ Add block… names every table page and no On-Demand Dashboard; a block saved by hand with a source `tw:people` is dropped with "… has no known data source: left out."; with unsaved changes on a table page the dashboard shows its rows as saved; Team overview, My dashboard and a table page's Insights tab look and work as before.

**TC-DSH-09 Without the right: read only, builder disabled with the reason** — Req DSH-09, DSH-02 — L1 `dashboard-pages.test.mjs` ("DSH-09, CON-107: “Build On-Demand Dashboards” or a co-owner of the page or its group builds the dashboard; “Set up On-Demand pages” no longer does — fail closed without the roles file (TC-DSH-09, TC-DSH-13)"); E2E `dashboard-pages.e2e.mjs` ("TC-DSH-09: a viewer without the right sees the dashboard read only, every builder button disabled with the reason"); browser check: with the roles not loaded every builder button says "Read only: the access roles are not loaded yet …".

**TC-DSH-10 Arrange, tabs and remove** — Req DSH-06, DSH-12, DSH-01 — browser check as a Tool Owner: Arrange blocks… → ↑ ↓ reorder the tiles and panels, Edit opens the block, Remove asks naming the block; Tabs and filters… → add, rename, reorder and remove tabs (the removed tab's blocks show on the first tab); each change is one entry in Background jobs; Remove page… asks naming the blocks and deletes `on-demand/<page>.json` and `dashboards/<page>.json`, the table page untouched.

**TC-DSH-11 A missing data source** — Req DSH-03, DSH-10 — browser check: remove the table page a block uses — the dashboard shows "This block cannot be shown: The table page “…” is no longer there (removed), or you cannot see it." on that block only.

**TC-DSH-12 Compact Dashboard: page ⋯ menu and block ⋯ menus** — Req DSH-13, DSH-09 — E2E `dashboard-pages.e2e.mjs` ("TC-DSH-09: a viewer without the right sees the dashboard read only, every builder button disabled with the reason"); E2E `chart-resize.e2e.mjs` ("TC-CHT-15: a Dashboard block is resized in Arrange blocks… — saved to the dashboard file"); browser check: as a builder ＋ Add block… is the one main action, each chart block's ⋯ offers Move up, Move down, Edit…, Size… and Remove… (Remove asks first naming the block); as a viewer the page ⋯ lists the builder actions disabled with the reason and the blocks have no ⋯.

**TC-DSH-13 “Build On-Demand Dashboards”: its own right; Set up On-Demand pages no longer builds** — Req CON-107, DSH-09 — L1 `dashboard-pages.test.mjs` ("CON-107: “Build On-Demand Dashboards” — Tool Owner only in the starting matrix and for an access.json written before permissions 6; Allow, Deny, Not set (TC-DSH-13)", "DSH-09, CON-107: “Build On-Demand Dashboards” or a co-owner of the page or its group builds the dashboard; “Set up On-Demand pages” no longer does — fail closed without the roles file (TC-DSH-09, TC-DSH-13)"); E2E `dashboard-pages.e2e.mjs` ("TC-DSH-13: “Set up On-Demand pages” alone no longer builds a dashboard — an Admin sees the builder actions disabled with “Build On-Demand Dashboards”"); browser check: Admin → People & roles → Role rights lists **Build On-Demand Dashboards (blocks, tabs, filters — every dashboard)** in the On-Demand group, ticked for Tool Owner only; Allow it for Admin and an Admin builds every dashboard; Deny it on a second role of a Tool Owner and the builder actions are disabled again; a page co-owner without the right still builds their dashboard.

**TC-DSH-14 A summary table's export ends with the Total row** — Req DSH-14, DSH-06 — L1 `dashboard-pages.test.mjs` ("DSH-14: a summary table’s export ends with the Total row, labelled Total (TC-DSH-14)"); E2E `dashboard-pages.e2e.mjs` ("TC-DSH-14: a summary table’s Export (CSV) ends with its Total row, labelled Total"); browser check: Export → Excel of a summary table with columns by a second field — the last row is "Total" with each column's total and the grand total as numbers; a column moved or hidden in Columns moves or leaves the Total row's value with it.

**TC-DSH-15 Copy a block to another dashboard** — Req DSH-15, DSH-13, DSH-12 — L1 `dashboard-pages.test.mjs` ("DSH-15: a block copied to another dashboard — a new id, its settings and data source, the tab of the same name or the first tab (said); a duplicate here (TC-DSH-15)"); E2E `dashboard-pages.e2e.mjs` ("TC-DSH-15: Copy to… copies a block to another dashboard (the first tab when no tab has its name, said) and duplicates it here — each saved to the dashboard’s file"); browser check: a KPI tile is copied from Arrange blocks… → Copy to…; the list holds only the dashboards you may build; a target with 40 blocks refuses the copy with "A dashboard holds at most 40 blocks: remove one first." in the pop-up and in Background jobs.

**TC-DSH-16 Time Writing hours as a data source** — Req DSH-16, DSH-03, DSH-04, DSH-05 — **UAT** — L1 `dashboard-hours.test.mjs` ("DSH-16: the Time Writing hours are Team overview’s figures by team member, region, role, stream, Feature and month — the totals unchanged (TC-DSH-16)", "DSH-16: the hours as a data source — Sum / Average of planned or booked hours, grouped by its fields, the period by month; not available without Team overview (TC-DSH-16)"); E2E `dashboard-pages.e2e.mjs` ("TC-DSH-16: the Time Writing hours as a data source — planned and booked hours by team member over the period; “Not available for your role” without Team overview", "TC-DSH-16: a builder adds a block over the Time Writing hours in the block pop-up — only its settings are saved"); UAT: with the Time Writing data fetched and a role that sees Team overview, on an On-Demand Dashboard you may build: ＋ Add block… → **Data source: Time Writing hours (as in Team overview)** → a KPI tile **Sum of Planned hours** (Period filter on: Month) — the tile equals Team overview's planned hours for the same period with no filter; add a **Summary table** of Sum of **Booked hours** by **Team member** with columns by **Stream** — each person's total equals Team overview's actual hours of that person; a **Bar chart** by **Feature**; tick a quarter in **Quarter** — the blocks follow by month; Export the table — the last row is Total; a colleague without Team insights (e.g. Team Member) sees "This block cannot be shown: Not available for your role." on these blocks while the other blocks are drawn; Team overview shows exactly what it showed before.

### 6.32 Chart options

**TC-CHT-01 The owner makes a Pareto and a stacked horizontal bar with Top 5 + Other, a target line and a pinned colour, drills into them and sets the widths** — Req CHT-01, CHT-04, CHT-08, CHT-09, CHT-10, CHT-11, CHT-12, CHT-14 — **UAT** — L1 `chart-options.test.mjs` ("CHT-12: a Pareto — largest first, “Other” last, each share and the cumulative share up to 100% (TC-CHT-08)"); E2E `chart-options.e2e.mjs` ("TC-CHT-01: the owner makes a Pareto and a stacked horizontal bar with Top 5 + Other and a target line, pins a colour, drills into a bar, sets the widths and saves to Git"); UAT: on a table page with a Dropdown of at least seven values, a Multi-select and a Number column, add a Pareto of the Sum by the Dropdown with Show "Top 5 + Other", a target line and Full width, and a Bar / column stacked by the Multi-select with Top 5 + Other, a target line, one value pinned to Colour 3 and Half width — check the order, "Other" last, the cumulative line ending at 100%, the 80% and target lines, the pinned colour; click a bar and a stack, and press Enter on "Other" — each pop-up lists the rows counted there; Save to Git.

**TC-CHT-02 A viewer sees the charts and a Dashboard Pareto read only and drills into them** — Req CHT-10, CHT-11, CHT-12, CHT-09, CHT-01 — E2E `chart-options.e2e.mjs` ("TC-CHT-02: a viewer without the setup right sees the charts and a Dashboard Pareto read only, and drills into them").

**TC-CHT-03 Charts without options are as before** — Req CHT-13 — L1 `chart-options.test.mjs` ("CHT-13, compatibility: an insight without the new fields aggregates exactly as before, and its file is written byte for byte as before (TC-CHT-03)"); browser check: a page and a dashboard saved before chart options show every chart as before (horizontal bars, months, 5 slices, data labels as chosen, half width); the E2E of On-Demand and Dashboard pages pass unchanged.

**TC-CHT-04 Dates grouped by day, ISO week, month, quarter or year** — Req CHT-03 — L1 `chart-options.test.mjs` ("CHT-03: dates grouped by day, ISO week (Monday, week 1 holds the first Thursday), month, quarter or year; a line fills every period (TC-CHT-04)").

**TC-CHT-05 Top N + Other** — Req CHT-04 — L1 `chart-options.test.mjs` ("CHT-04: Top N + “Other” — the N largest by the measure, the rest summed as “Other”, last; “all” shows every category (TC-CHT-05)").

**TC-CHT-06 Running total and percent of total** — Req CHT-05, CHT-06 — L1 `chart-options.test.mjs` ("CHT-05, CHT-06: running total along the categories, and values as a share of the total (TC-CHT-06)").

**TC-CHT-07 Minimum, Maximum, Distinct count and a KPI** — Req CHT-07, CHT-02 — L1 `chart-options.test.mjs` ("CHT-07, CHT-02: Minimum, Maximum and Distinct count, and a KPI — per category and over all rows (TC-CHT-07)"); browser check: add a KPI (one number) with Maximum of a Number column — one tile with the number and the measure; a Pie / donut shows the total in its middle.

**TC-CHT-08 Pareto** — Req CHT-12 — L1 `chart-options.test.mjs` ("CHT-12: a Pareto — largest first, “Other” last, each share and the cumulative share up to 100% (TC-CHT-08)").

**TC-CHT-09 Drill-down rows** — Req CHT-10 — L1 `chart-options.test.mjs` ("CHT-10: the rows behind a bar, a stack, “Other” and a period are exactly the rows counted there (TC-CHT-09)").

**TC-CHT-10 The options and colours in the page file** — Req CHT-08, CHT-09, CHT-13 — L1 `chart-options.test.mjs` ("CHT-08, CHT-09, CHT-13: options and colour pins are validated when read, written only when set, kept by the merge (TC-CHT-10)"); browser check: a hand-edited page file with `"top": 500`, `"size": "huge"` and a colour 9 shows Top 50, half width and the palette colour.

**TC-CHT-11 Dashboard blocks take the same options** — Req CHT-01, CHT-12, CHT-13 — L1 `chart-options.test.mjs` ("CHT-01, CHT-12, CHT-13: dashboard blocks take the same options — validated, written only when set, Pareto blocks, colours merged (TC-CHT-11)").

**TC-CHT-12 The display options on the editor's tabs** — Req CHT-14, CHT-01, CHT-05, CHT-06 — browser check at 1440 px and 390 px, light and dark: ＋ Add chart / table and ＋ Add block… show Group dates by and Show on Data and the other display options on Format, only those of the type (Orientation for bars, Group dates by only with a Date column, no Show for a line); with Average chosen, Running total and Percent of total are disabled with "Only for Count of rows or Sum: …"; Vertical columns draw the bars as columns, stacked by the second field; every field fits at 390 px.

**TC-CHT-13 The owner sizes charts for everyone: the Edit pop-up, Arrange sizes and the keyboard** — Req CHT-15, CHT-16, CHT-17, CHT-21, CHT-24, OND-61 — **UAT** — L1 `chart-resize.test.mjs` ("CHT-15, CHT-16: the presets — ⅓ / ½ / ⅔ / Full of a 6-column grid and Small / Medium / Large; v10 half and full read as before (TC-CHT-13)"); E2E `chart-resize.e2e.mjs` ("TC-CHT-13: the owner sets a chart to ⅔ × Large with its own axis names in the Edit pop-up and another to ⅓ with the keyboard in Arrange sizes — saved to Git; the page and chart ⋯ menus work with the keyboard"); UAT: as the owner of a table page with three charts open a chart's ⋯ → Edit…, set Width "Two thirds (⅔)", Height "Large" and an X axis name, Save — the chart takes ⅔ of the row and is taller for everyone, the X axis shows the new name; Arrange sizes, focus another chart's corner handle, ← and Enter — it takes ⅓, saved to Git; Done arranging; as a colleague see both sizes.

**TC-CHT-14 The size fields in the page and dashboard files** — Req CHT-22, CHT-15, CHT-16, CHT-13 — L1 `chart-resize.test.mjs` ("CHT-22, CHT-15, CHT-16: the size options are validated when read — unknown widths and heights dropped, no height for a KPI or a summary table (TC-CHT-14)"); browser check: in a copy of a page file set `"size": "third", "height": "large"` on one chart and `"size": "huge"` on another — the first is drawn at ⅓ × Large, the second at half width; open the page in a build from before chart sizing — the first is drawn at half width and Medium (LIM-36).

**TC-CHT-15 Precedence, grid placement and a Dashboard block sized in Arrange blocks…** — Req CHT-17, CHT-18, CHT-19, CHT-20, DSH-13 — L1 `chart-resize.test.mjs` ("CHT-18, CHT-19: precedence — the viewer’s own size, then the owner’s (or shared) default, then the factory size; stored sizes validated (TC-CHT-15)"); L1 `chart-resize.test.mjs` ("CHT-20: grid placement — the 6-column grid only once a chart takes a width the old layout did not have (TC-CHT-15)"); E2E `chart-resize.e2e.mjs` ("TC-CHT-15: a Dashboard block is resized in Arrange blocks… — saved to the dashboard file"); browser check: a dashboard nobody resized looks as before (two half-width blocks per row); after one block is set to ⅓ the blocks follow the 6-column grid.

**TC-CHT-16 A viewer resizes a chart for themselves with the handle — drag and keyboard** — Req CHT-18, CHT-21, CHT-15, CHT-16 — L1 `chart-resize.test.mjs` ("CHT-21: the handle — arrow keys step the presets (clamped), a drag snaps to the nearest preset (TC-CHT-16)"); E2E `chart-resize.e2e.mjs` ("TC-CHT-16: a viewer drags a chart to Full — it snaps, is remembered after a reload, is not written to the page; Reset to default restores it; the keyboard resizes another"); browser check: with a screen reader the handle is announced "Resize {chart}: 6 × 8 (width ½, height Medium)" and each arrow key announces the new size (one column or row); while dragging the grid lines show and the outline names the size it snaps to; View as: a size chosen there is gone after leaving the page and nothing is written to Git.

**TC-CHT-17 Long labels stay inside the chart (KB-83)** — Req CHT-23 — L1 `chart-resize.test.mjs` ("CHT-23 (KB-83): a label is wrapped by words into its space, cut with "…" only when it does not fit (TC-CHT-17)"); E2E `chart-resize.e2e.mjs` ("TC-CHT-16: a viewer drags a chart to Full — it snaps, is remembered after a reload, is not written to the page; Reset to default restores it; the keyboard resizes another"); browser check at 1440 px and 390 px: a Dropdown value of 70 characters is drawn on up to two lines with "…" and its full text as tooltip in a bar chart and a Pareto, at ⅓, ½ and Full; a long axis name ends in "…" with its full text as tooltip; Team overview's charts with short labels look as before.

**TC-CHT-18 Axis names set by the owners** — Req CHT-24 — L1 `chart-resize.test.mjs` ("CHT-24: the owner’s axis titles — validated, written only when set, only for charts with axes; the automatic ones as before (TC-CHT-18)"); E2E `chart-resize.e2e.mjs` ("TC-CHT-13: the owner sets a chart to ⅔ × Large with its own axis names in the Edit pop-up and another to ⅓ with the keyboard in Arrange sizes — saved to Git; the page and chart ⋯ menus work with the keyboard"); browser check: the X and Y axis name fields are offered for bar, line and Pareto with today's names as placeholders, not for a pie, KPI or summary table; emptied, the automatic name comes back; the same in the Dashboard block pop-up.

**TC-CHT-19 A built-in chart: each viewer's size and the Tool Owner's size for everyone** — Req CHT-19, CHT-18, CHT-20 — L1 `chart-resize.test.mjs` ("CHT-18, CHT-19: precedence — the viewer’s own size, then the owner’s (or shared) default, then the factory size; stored sizes validated (TC-CHT-15)"); L1 `chart-resize.test.mjs` ("CHT-20: grid placement — the 6-column grid only once a chart takes a width the old layout did not have (TC-CHT-15)"); E2E `chart-resize.e2e.mjs` ("TC-CHT-19: on Team overview someone resizes a built-in chart for themselves and sees the size a Tool Owner saved for everyone"); browser check with Git connected (not the sample): as a Tool Owner resize Team overview → Streams → Overrun hours to ½, **Save size for everyone** — a Background jobs entry, the entry `chart-size:overview:overrun-hours` in personal-views-defaults.json; another person sees Overrun hours at ½ without "Size: yours"; **Use the factory size for everyone** brings back full width; a person without "Table, chart and page defaults" has neither button.

**TC-CHT-20 Narrow screens: every chart full width, no handle** — Req CHT-20, CHT-15, CHT-21 — E2E `chart-resize.e2e.mjs` ("TC-CHT-20: at 390 px every chart is full width and no resize handle shows; the page does not scroll sideways").

**TC-CHT-21 A short chart header: title, ⓘ and "Filtered"** — Req CHT-25, OND-11, OND-61, DSH-13 — E2E `on-demand.e2e.mjs` ("TC-OND-09: Insights — on CoNQ add rows, add a Bar chart of Sum of cost by Category and a Summary table, Save to Git writes them into on-demand/conq.json, a reload shows them and the Table view lists the values"); E2E `on-demand.e2e.mjs` ("TC-OND-13: a viewer without the setup right sees the Insights read only — charts shown, Add chart / table disabled with the reason, no chart ⋯ menu"); browser check (before / after screenshots at 1440 px and 390 px, light and dark, of CoNQ's Insights tab and a Dashboard): the page actions are one main action and ⋯; the Insights heading, Filters… and ＋ Add chart / table on one line; the filter row on one line with its status at the end; each chart shows its type, title and ⓘ only — ⓘ lists what it measures, its own filters, the filter row's effect, the rows counted and the currency — and "Filtered" only when its own filters or the filter row narrow it; a chart of several currencies keeps its warning visible.

**TC-CHT-22 Charts without chart elements are drawn as before** — Req CHT-35, CHT-26, CHT-27, CHT-31, CHT-32 — L1 `chart-elements.test.mjs` ("CHT-35: without elements every chart resolves to what it drew before — and a file without them is written byte for byte as before (TC-CHT-22)"); E2E `chart-elements.e2e.mjs` ("TC-CHT-30: a viewer sees the owner’s chart elements and switches the data labels for themselves; charts without elements are drawn as before"); browser check: the markup of a bar, stacked bar, columns, Pareto, line and pie without `elements` (data labels on, off and the default) is identical to v10.1.0's.

**TC-CHT-23 The chart elements in the page and dashboard files** — Req CHT-35 — L1 `chart-elements.test.mjs` ("CHT-35: options.elements is validated when read — unknown keys and values dropped, elements the type does not take dropped (TC-CHT-23)"); browser check: a hand-edited page file with `"elements": {"legend": "middle", "trendline": "poly", "gridlines": ["majorH", "x"]}` on a bar chart shows the legend on top, no trendline and a horizontal major gridline; the same chart in v10.1.0 is drawn as before (LIM-38).

**TC-CHT-24 Data label positions, contents and number format** — Req CHT-28 — L1 `chart-elements.test.mjs` ("CHT-28: label positions per type (Excel’s lists), the stacked fallback and the label text (TC-CHT-24)"); browser check: for a horizontal bar, vertical columns, a stacked column, a line and a pie, each position of the type puts the labels where Excel does; Series name + Category name + Value + Percentage on a Percent of total chart reads "Berlin, Rework, 1,200, 26.7%"; 2 decimals with the currency code reads "1,950.00 EUR".

**TC-CHT-25 Labels never overlap or leave the chart** — Req CHT-29 — L1 `chart-elements.test.mjs` ("CHT-29: labels never overlap or leave the chart; pie Best Fit moves small slices outside with leader lines (TC-CHT-25)"); E2E `chart-elements.e2e.mjs` ("TC-CHT-29: the owner sets a pie’s data labels to Outside End with value and percentage, and a bar chart’s legend, gridlines, data table and trendline — saved to Git"); browser check at 1440 px and 390 px: Outside End labels of a horizontal bar chart with long values stay inside the chart; a line with Right labels and 24 months shows no two labels on top of each other; a pie with one large and several small slices and Best Fit puts the small slices' labels outside with leader lines.

**TC-CHT-26 Gridlines and the linear trendline** — Req CHT-31, CHT-33 — L1 `chart-elements.test.mjs` ("CHT-31, CHT-33: minor gridlines and the least-squares trendline per series (TC-CHT-26)"); E2E `chart-elements.e2e.mjs` ("TC-CHT-29: the owner sets a pie’s data labels to Outside End with value and percentage, and a bar chart’s legend, gridlines, data table and trendline — saved to Git"); browser check: each of the four gridline boxes draws its lines on a column and a horizontal bar chart; a stacked column with Linear has one dotted line per series named "Linear ({series})" in the legend; a Pareto and a pie offer no trendline.

**TC-CHT-27 The data table under a chart** — Req CHT-30 — L1 `chart-elements.test.mjs` ("CHT-30: the data table — one column per category, one row per series in the chart’s number format, a Pareto’s cumulative share (TC-CHT-27)"); E2E `chart-elements.e2e.mjs` ("TC-CHT-29: the owner sets a pie’s data labels to Outside End with value and percentage, and a bar chart’s legend, gridlines, data table and trendline — saved to Git"); browser check with a screen reader: the table is announced as "Data table: {title}" with column and row headers; with 20 categories it scrolls inside its region (reachable with Tab) and the page does not scroll sideways at 390 px.

**TC-CHT-28 KPI cards: Show as Card or Panel** — Req CHT-36, CHT-37 — L1 `chart-elements.test.mjs` ("CHT-36, CHT-37: a KPI is a card unless its owners show it as a panel — options.view validated, only for a KPI (TC-CHT-28)"); E2E `chart-elements.e2e.mjs` ("TC-CHT-31: KPI charts are a row of cards — the value never cut, the pop-up’s preview beside the form, no chart type above a chart"); E2E `insights-filters.e2e.mjs` ("TC-OND-40: the owner sets up a period and a Category filter; the viewer narrows every chart and a drill-down to Q1 and Scrap, the choice kept after a reload, Reset clears it"); browser check at 1440, 1280, 1024 and 390 px, light and dark: three KPIs are one row of cards above the charts (two rows at 1024 px when they do not fit), "1,234,567.89 EUR" is shown whole, a long measure takes two lines with "…" and its full text as tooltip; as a viewer the cards have no ⋯.

**TC-CHT-29 The owner sets chart elements: a pie's outside labels and a bar chart's legend, gridlines, data table and trendline** — Req CHT-26, CHT-27, CHT-28, CHT-29, CHT-30, CHT-31, CHT-32, CHT-33, CHT-34 — **UAT** — L1 `chart-elements.test.mjs` ("CHT-28: label positions per type (Excel’s lists), the stacked fallback and the label text (TC-CHT-24)"); E2E `chart-elements.e2e.mjs` ("TC-CHT-29: the owner sets a pie’s data labels to Outside End with value and percentage, and a bar chart’s legend, gridlines, data table and trendline — saved to Git"); UAT: as the owner of CoNQ open a pie's ⋯ → Edit…, on the Elements tab set Data labels "On for everyone", Label position "Outside End" and tick Value and Percentage — the preview shows "3, 27%" outside the ring with leader lines; Save; open a bar chart's Edit…, set Legend "Right", tick Major horizontal and Data table, Trendline "Linear"; Save — the legend is beside the chart with "Linear (…)", the numbers are in a table under it, both are saved to Git; as a colleague see the same and switch the pie's Data labels off for yourself (still off after a reload, the owner's chart unchanged).

**TC-CHT-30 A viewer sees the chart elements and keeps their own Data labels switch** — Req CHT-28, CHT-34, CHT-35 — E2E `chart-elements.e2e.mjs` ("TC-CHT-30: a viewer sees the owner’s chart elements and switches the data labels for themselves; charts without elements are drawn as before"); browser check on an On-Demand Dashboard: a block whose builders set data labels Off starts without labels for a new viewer, one without the setting starts with them on (DSH-06).

**TC-CHT-31 The chart pop-up: preview beside the form, the KPI card, no type eyebrow** — Req CHT-37, CHT-38, CHT-39, CHT-26 — E2E `chart-elements.e2e.mjs` ("TC-CHT-31: KPI charts are a row of cards — the value never cut, the pop-up’s preview beside the form, no chart type above a chart"); browser check at 1440, 1280, 1024 and 390 px, light and dark: in Edit the chart or table and Edit the block, the form and the Preview never overlap (one under the other in a narrow pop-up), the field labels are not clipped, the preview shows the title, ⓘ and "Filtered" only; no chart, block or card shows its type above the title, and ⓘ starts with "Type: …"; with Chart heading off the panel shows ⓘ without the title and a screen reader still reads the title.

**TC-CHT-32 Grouped bars: every measure side by side, Excel's clustered label positions, a trendline per series** — Req CHT-40, CHT-28, CHT-33 — L1 `chart-colors.test.mjs` ("CHT-40: grouped bars — the option validated, every measure allowed side by side, stacked still Count or Sum (TC-CHT-32)"); L1 `chart-colors.test.mjs` ("CHT-40: the layout of a group — bars side by side in the band, centred, never wider than the band (TC-CHT-32)"); E2E `chart-grid.e2e.mjs` ("TC-CHT-37: the owner arranges the charts on the grid — drags one to the top (the others shift, saved to Git), resizes one with the grid lines shown, moves one with the keyboard; grouped bars and an own colour are drawn"); browser check at 1440 px and 390 px, light and dark: a bar chart of the Average of Cost by Category with Stacked by Site says it cannot be stacked and offers Grouped; with Series "Grouped (side by side)" it draws one bar per site in each category, horizontal and as columns; Data labels at Center, Inside End, Inside Base and Outside End sit on each bar; Trendline Linear draws one dotted line per site; a click on one bar lists the rows of that category and site; Series "Stacked" draws the chart as before.

**TC-CHT-33 Own colours per value, the contrast warning and readable labels** — Req CHT-41, CHT-42, CHT-09, CHT-13 — L1 `chart-colors.test.mjs` ("CHT-41: colour pins — a palette colour 1…5 or #rrggbb, validated when read, merged as one entry; old pins as before (TC-CHT-33)"); L1 `chart-colors.test.mjs` ("CHT-41: the WCAG non-text contrast check (3:1 against the chart background, light and dark) and the readable label colour (TC-CHT-33)"); E2E `chart-grid.e2e.mjs` ("TC-CHT-33: the owner picks an own colour with the hex field — the contrast warning for a pale colour, a wrong value refused"); browser check at 1440 px and 390 px, light and dark: on a chart's Format tab pick "Own colour…" for a value, choose a colour with the picker and type `#1f77b4` — the preview and, after Save, every chart of the page use it in both themes; type `#ffff66` — the warning names the light theme and the colour is kept; type `blue` — "Type a colour as #rrggbb" and the pin is unchanged; a page with pins 1…5 shows them as before; the same in the Dashboard block pop-up.

**TC-CHT-34 The presets on the 12-column grid: sizes kept, minimums** — Req CHT-44, CHT-45, CHT-46 — L1 `chart-grid.test.mjs` ("CHT-44, CHT-45: the presets map onto the grid and draw as before — ⅓ ½ ⅔ Full = 4 6 8 12 columns, Small Medium Large = today’s heights in rows (TC-CHT-34)"); L1 `chart-resize.test.mjs` ("CHT-20: grid placement — a page nobody arranged is laid out as before: half-width charts two per row, a full-width one on its own row (TC-CHT-15)"); E2E `chart-resize.e2e.mjs` ("TC-CHT-13: the owner sets a chart to ⅔ × Large with its own axis names in the Edit pop-up and another to ⅓ with the keyboard in Arrange sizes — saved to Git; the page and chart ⋯ menus work with the keyboard"); browser check: before / after screenshots of CoNQ's Insights, an On-Demand Dashboard and Team overview → Streams at 1440 px — the same panels at the same places and sizes; a chart sized ⅔ × Large before the update is 8 × 12.

**TC-CHT-35 Packing, moving and resizing on the grid** — Req CHT-43, CHT-46, CHT-47, CHT-49 — L1 `chart-grid.test.mjs` ("CHT-43, CHT-47: packing — places kept, overlaps resolved by compaction, gaps closed upward, charts without a place after the others (TC-CHT-35)"); L1 `chart-grid.test.mjs` ("CHT-46: the medium-wide grid (6 columns) and the phone (one column, in reading order) (TC-CHT-35)"); L1 `chart-grid.test.mjs` ("CHT-47: moving — dropped on a place, the others shift out of the way and gaps close; the keyboard moves one column or past a neighbour (TC-CHT-35)"); L1 `chart-grid.test.mjs` ("CHT-43, CHT-49: resizing — wider or taller, the others beside or below shift out of the way (TC-CHT-35)"); L1 `chart-resize.test.mjs` ("CHT-21, CHT-49: the handle — arrow keys step one column or row (clamped to the minimum and the grid), a drag snaps to whole columns and rows (TC-CHT-16)"); browser check at 1024 px: the grid has 6 columns, a ⅓ chart takes 2 of them, resizing steps two twelfths, there is no grip.

**TC-CHT-36 The layout in the page and dashboard files, merged per chart, read by an older app** — Req CHT-50, CHT-47, CHT-48 — L1 `chart-grid.test.mjs` ("CHT-47, CHT-48, CHT-50: options.grid and a viewer’s size in grid units — written only when set, with the nearest presets for older apps; merged per chart (TC-CHT-36)"); browser check: a hand-edited page file with two charts at `{"x": 0, "y": 0, "w": 6, "h": 8}` and one at `{"x": 11, "w": 40}` shows them one under the other and the third clamped to full width; the same file in v10.1.0 shows the nearest presets (LIM-41).

**TC-CHT-37 Arrange the charts on the grid: drag to move, resize, keyboard; a viewer resizes but cannot move** — Req CHT-43, CHT-47, CHT-48, CHT-49, CHT-46, CHT-40, CHT-41 — **UAT** — L1 `chart-grid.test.mjs` ("CHT-47: moving — dropped on a place, the others shift out of the way and gaps close; the keyboard moves one column or past a neighbour (TC-CHT-35)"); E2E `chart-grid.e2e.mjs` ("TC-CHT-37: the owner arranges the charts on the grid — drags one to the top (the others shift, saved to Git), resizes one with the grid lines shown, moves one with the keyboard; grouped bars and an own colour are drawn"); E2E `chart-grid.e2e.mjs` ("TC-CHT-37: a viewer resizes a chart on the grid for themselves but cannot move one; at 390 px every chart is full width without handle or grip"); UAT: as the owner of CoNQ (four charts) click **Arrange charts** — the grid's lines and each chart's size ("6 × 8") show; drag the third chart by ⠿ to the top left — the others move down while you drag; release — saved to Git, a colleague sees the new order after reloading; drag another chart's corner two columns narrower ("4 × 8") — saved; focus a chart's ⠿, → and Enter — it moves one column, announced; as a colleague resize a chart with its corner (it stays after a reload, Reset to default brings back the owner's size) and find no ⠿ and no Arrange charts; on a phone every chart is full width without handles; also on an On-Demand Dashboard (⋯ → Arrange on the page).

**TC-CHT-38 KPI cards on the chart grid: the default 3 × 3 in a row above the charts, sizes written only when changed** — Req CHT-51, CHT-52 — L1 `chart-grid.test.mjs` ("CHT-51, CHT-52: KPI cards on the chart grid — 3 × 3 by default, in a row above the charts until moved, at least 2 × 3, written only when resized (TC-CHT-38)"); browser check at 1440 px: a page whose KPI cards nobody resized shows them four to a row above the charts, the charts two by two below them, as in v10.3.

**TC-CHT-39 Match heights in a row** — Req CHT-55, CHT-56 — L1 `chart-grid.test.mjs` ("KB-89, CHT-55: Match heights in this row — every panel starting on the row takes the tallest height; the rows below shift (TC-CHT-39)"); browser check on an On-Demand Dashboard: ⋯ → Arrange on the page, a block's ⋯ → Match heights in this row — the blocks of its row take the tallest height, saved to the dashboard file.

**TC-CHT-40 A ⋯ menu is never clipped** — Req CHT-53, OND-61, DSH-13 — L1 `chart-grid.test.mjs` ("KB-88: a ⋯ menu opens under its button, flips above near the bottom, stays inside the window (TC-CHT-40)"); E2E `chart-grid.e2e.mjs` ("TC-CHT-41: KPI cards — the ⋯ menu is never clipped, the header in one row; the owner resizes a card in Arrange charts (saved to Git), the number grows with it"); browser check at 1440 and 390 px, light and dark: a KPI card's, a chart panel's and an On-Demand Dashboard block's ⋯ menu each open fully on top of the page under ⋯, above it near the bottom of the window; ↓ / ↑ / Escape as before.

**TC-CHT-41 KPI cards: a tidy header, sized by the owners and by each viewer, full width on a phone** — Req CHT-51, CHT-52, CHT-53, CHT-54, CHT-36, CHT-37 — **UAT** — E2E `chart-grid.e2e.mjs` ("TC-CHT-41: KPI cards — the ⋯ menu is never clipped, the header in one row; the owner resizes a card in Arrange charts (saved to Git), the number grows with it"); E2E `chart-grid.e2e.mjs` ("TC-CHT-41: a viewer resizes a KPI card for themselves (not written), Reset to default; at 390 px the cards are full width without a handle"); UAT: on CoNQ's Insights with two KPI cards (one with a long title and its own filters) — the title takes at most two lines with ⓘ beside it, "Filtered" and ⋯ on the right; open a card's ⋯ — every item is fully visible and can be chosen; as the owner Arrange charts and make a card wider and taller with its corner — saved to Git, the number grows, a colleague sees it after reloading; Size… offers 2 or 3 columns and 3…12 rows; as a colleague resize a card for yourself (Reset to default brings back the owner's size); on a phone every card is full width without a handle.

**TC-CHT-42 Charts of one row line up; a height set shows; Match heights** — Req CHT-55, CHT-56, CHT-45, CHT-47 — **UAT** — E2E `chart-grid.e2e.mjs` ("TC-CHT-42: charts in one grid row line up, a resized height shows; the owner matches the heights of a row (Arrange charts and Size…)"); UAT: on CoNQ's Insights a bar chart of three bars beside a column chart — both equally tall; as a colleague make one two rows taller with its corner (↓ ↓) — it grows visibly; as the owner Arrange charts, make one taller, then the other's ⋯ → Match heights in this row — both equally tall, saved to Git; Size… → Height Small with "Same height as the other charts in its row" — both Small.

**TC-CHT-50 Automatic sentences: the total, highest and lowest with the share, a threshold — currency, filters, empty data** — Req CHT-61, CHT-60, CHT-65 — L1 `narratives.test.mjs` ("CHT-61: the total, the highest and lowest category with its share — a Currency measure in one currency (TC-CHT-50)"); L1 `narratives.test.mjs` ("CHT-61: its own filters and the filter row narrow the sentences; no row counted is “nothing to report” (TC-CHT-50)"); L1 `narratives.test.mjs` ("CHT-61: above / below a threshold — the Group by values, or the total without one (TC-CHT-50)").

**TC-CHT-51 Change vs the previous period and the biggest mover, counted outside the period chosen** — Req CHT-62 — L1 `narratives.test.mjs` ("CHT-62: the change against the previous period (month, quarter, year) — counted outside the period chosen (TC-CHT-51)"); browser check: on CoNQ with the filter row's period on Q4, a narrative with Change vs the previous period (Quarter) says "Q4 …, up …% vs Q3 …", not "nothing to compare with".

**TC-CHT-52 Rules in order: every match or the first, the Else sentence, comparisons without a number** — Req CHT-63 — L1 `narratives.test.mjs` ("CHT-63: rules in order — every rule that matches or only the first, and the Else sentence (TC-CHT-52)").

**TC-CHT-53 Placeholders as text, templates as plain text, the data embedded in the HTML file escaped** — Req CHT-64, CHT-67, CHT-69 — L1 `narratives.test.mjs` ("CHT-64: placeholders are replaced by text in one pass — markup stays text, unknown ones are dropped when stored (TC-CHT-53)").

**TC-CHT-54 The narrative field validated, written in a fixed order, merged per insight; a Dashboard block; an unknown type dropped** — Req CHT-68 — L1 `narratives.test.mjs` ("CHT-68: the narrative field validated when read and written in a fixed order; older fields unchanged (TC-CHT-54)"); L1 `narratives.test.mjs` ("CHT-68: merged per insight (GIT-17) and as a Dashboard block; an older type list drops the block (LIM-50) (TC-CHT-54)"); browser check: a page file with a narrative opened in v10.3.0 shows the other charts without it (LIM-50).

**TC-CHT-55 The editor's checks: what needs a Group by or a period, a number, a sentence; the type switch; ⓘ** — Req CHT-66, CHT-65 — L1 `narratives.test.mjs` ("CHT-66: the pop-up’s checks — sentences and rules that need a Group by or a period, a number, a sentence (TC-CHT-55)"); browser check at 1440 and 390 px, light and dark: in the chart pop-up and the block pop-up, type Narrative shows Group by, Period on, the sentence ticks (Change and Biggest mover disabled with the reason until a period is chosen), ＋ Add rule with If / Is / Value / Tone / Then show, ↑ ↓ and ✕, the Else field once a rule exists, and the Width; the Preview follows each change; the labels are not clipped and nothing overlaps.

**TC-CHT-56 The owner adds a Narrative with the total, the highest category and a warning rule; the filter row changes it; the PDF includes it** — Req CHT-60, CHT-61, CHT-63, CHT-64, CHT-65, CHT-66, CHT-67 — **UAT** — E2E `narratives.e2e.mjs` ("TC-CHT-56: the owner adds a Narrative with the total, the highest category and a warning rule — saved to Git; the filter row changes its sentences; the PDF includes it"); UAT: as the owner of CoNQ (a Department, a Cost in EUR and a Found on column, a filter row on Found on and Department) click **＋ Add chart / table**, title "CoNQ summary", type **Narrative (text)**, Measure **Sum** of **Cost**, Group by **Department**; keep **Total** and **Highest category** ticked; **＋ Add rule**: If **Total** Is **>** Value **20000**, Tone **Warning**, Then show "CoNQ cost above budget: {value}"; Width **Full** — the Preview lists the three sentences, the last with a warning border and ⚠; **Add chart** — the page file in Git holds the narrative; the panel shows the sentences and ⓘ lists "Rule 1. If Sum of Cost > 20,000 …"; in the filter row pick Department **Design** — the total and the highest change, the warning is gone and the panel shows "Filtered"; **Export PDF…** — the print view lists the same sentences.

**TC-CHT-57 A viewer reads a Narrative and a Dashboard Narrative block, the tone read out in words** — Req CHT-60, CHT-65, CHT-66 — E2E `narratives.e2e.mjs` ("TC-CHT-57: a viewer sees a Narrative and a Dashboard Narrative block read only, the tone read out in words"); browser check with a screen reader (NVDA or VoiceOver): each sentence is read with its tone first ("Warning: CoNQ cost above budget: …"), the icon is not read; the Dashboard block follows the period and the filter row as its charts do.

**TC-CHT-58 The chart editor in tabs: opens on Data, the preview beside the tabs, arrow keys, a count on Elements, a filter error marks Filters and Save focuses it** — Req CHT-70, CHT-71, CHT-72, CHT-73, CHT-14, CHT-38, CHT-66 — **UAT** — L1 `chart-editor.test.mjs` ("CHT-70: the chart editor shows only the tabs the type takes — Narrative instead of Format and Elements, no Elements for a KPI or table, no Format for a Dashboard KPI (TC-CHT-58)", "CHT-71: each tab counts its settings changed from the defaults; a chart as it was made counts none (TC-CHT-58)", "CHT-72: an error belongs to its tab — the filters to Filters, the rest of the columns to Data — and Save opens the first tab with one (TC-CHT-58)", "CHT-70, CHT-73: both chart pop-ups use the one tab component — a tablist with the arrow keys — the preview beside it and the buttons under it (TC-CHT-58)"); E2E `chart-editor-tabs.e2e.mjs` ("TC-CHT-58: the chart editor opens on Data with the preview beside its tabs — arrow keys, a count on Elements, a filter error marks Filters and Save focuses it"); UAT: as the owner of CoNQ open a bar chart's ⋯ → **Edit…** — the pop-up opens on **Data** (Title, Type, Categories by, Stacked by, Measure, Show, Sort) with the Preview beside the tabs **Data · Filters · Format · Elements**; with the keyboard on a tab, ← → Home End move between them; on **Elements** set Legend **Bottom** — the tab reads "Elements (1)", the Preview shows the legend under the chart and Cancel / Save stay on screen; on **Filters** ＋ Add filter without ticking a value, go back to Data and press **Save** — Filters opens with a red marker, the reason above the buttons and its tooltip; tick a value — the marker goes; Save. A KPI shows Data · Filters · Format, a Narrative Data · Filters · Narrative; at 390 px the tabs scroll sideways and the Preview is under the form; light and dark theme.

**TC-CHT-59 The Dashboard block pop-up in the same tabs: data source, period and tab on Data; a KPI tile only Data and Filters** — Req CHT-70, CHT-71, CHT-72, CHT-73 — E2E `chart-editor-tabs.e2e.mjs` ("TC-CHT-59: the Dashboard block pop-up has the same tabs — data source, period and tab on Data; a KPI tile only Data and Filters"); browser check at 1440 and 390 px, light and dark: ＋ Add block… on a dashboard with tabs shows Data · Filters for a KPI tile (Data source, Period filter on, Opens the tab on Data), Data · Filters · Format · Elements for a bar chart; Width Full on Format reads "Format (1)"; an empty title marks Data and Save to Git opens it; the block is saved as before.

### 6.33 Tool Validations master list

**TC-TVL-01 The master list file in Git: validated when read, merged when saved** — Req TVL-02, GIT-17, GIT-18 — L1 `tool-validations.test.mjs` ("TVL-02: the master list read from Git — round trip, each source and tool checked on its own, a broken file refused whole (TC-TVL-01)", "GIT-17, TVL-02: two saves of the master list are merged — tools by tool, sources by id, co-owners as sets; the file is mapped for “Newer data in Git” (TC-TVL-01)"); L1 `git-storage.test.mjs` ("TC-OND-02, TC-PGB-02, TC-DSH-03 and TC-TVL-01: selected Git writes require a confirmed private repository"); browser check with Git storage: a hand-edited `tool-validations.json` with a tool dated "2026-02-30", one without a name and a source of kind "formula" — the Master list says "Not used — tool-validations.json in Git: …" for each with why and lists the others; a file that is not JSON keeps the list last read, with the warning, and every change disabled with the reason; two browsers each adding a tool at the same time both keep their tool (two commits, each "[saved …] [by …]").

**TC-TVL-02 The same tool from two sources; appended, kept, marked** — Req TVL-03, TVL-04, TVL-05 — L1 `tool-validations.test.mjs` ("TVL-03: the same tool is the same name (case, spaces and punctuation ignored) and version; other versions are other entries (TC-TVL-02)", "TVL-04, TVL-05: a source merged in — new tools appended, values updated (not those changed by hand), a tool gone from its source kept as “not in source now”; nothing changed gives the same file (TC-TVL-02)"); E2E `tool-validations.e2e.mjs` ("TC-TVL-07: …": the fetch saves four tools; the Table page's LabVIEW is linked to the query's entry); browser check: change the query so that one tool is no longer returned and fetch again — the tool stays, marked **Not in source now**, with its dates; a tool named "Lab-VIEW 2020.0" in a Windchill export joins "LabVIEW 2020"; "LabVIEW 2021" is a new entry.

**TC-TVL-03 Due dates and the expiry view** — Req TVL-06, TVL-08 — L1 `tool-validations.test.mjs` ("TVL-06: validation date, validity period (months) and due date — an explicit due date wins; else validation date + period (TC-TVL-03)", "TVL-08, TVL-09: the expiry view — overdue first, then due within N days with days left, then no due date; later ones left out; N 1 to 730 (TC-TVL-03)"); E2E `tool-validations.e2e.mjs` ("TC-TVL-07: …": Overdue 1, Due in the next 60 days 1, No due date 1, the rows in that order with "10 days overdue" and "30 days left"; `documents-and-data.e2e.mjs` "TC-QV-43: …": the Tool Validations tabs are Expiry list, Master list, Tool List [TFS], Setup; the tiles and the window on the Expiry list tab, above its table, not on Master list); browser check at 1440 and 390 px, light and dark: the tiles, the table and its filter bar; Export → CSV holds the rows shown, a tool named "=1+1" is written as text.

**TC-TVL-04 Field mapping: guesses marked, saved for everyone** — Req TVL-07, TVL-01 — L1 `tool-validations.test.mjs` ("TVL-07: each source is read with its field mapping — the guesses until it is saved (TC-TVL-04)"); E2E `tool-validations.e2e.mjs` ("TC-TVL-07: …": a Table page added as a source shows "Guessed Tool name: Tool · Version: Version · Due date: Due date"); browser check as Tool Owner: Edit mapping… on the Tool Validations query shows the guesses (Tool, Version by the Tool Validations rule, the completion date (TVL-29), DueDate) and "These are the app's guesses"; choose another field for the due date and Save to Git — the Sources panel says **Saved**, another browser reads the same mapping, and the due dates follow it at the next fetch.

**TC-TVL-05 The window of days: the team default and my own** — Req TVL-09, TVL-11 — E2E `tool-validations.e2e.mjs` ("TC-TVL-07: …": 10 days drops the tool due in 30 days, Use the team default (60) brings it back; Set 60 days as team default disabled while 60 is the team default; on the Expiry list 45 days → **Set 45 days as team default** saves defaultDays 45 to Git ("Tool Validations: team default 45 days, 0 co-owners"), then "The team default: 45 days." and Use the team default (45) disabled; Setup → Team settings → 30 saved to Git; "TC-TVL-06: …": a Team Member keeps 20 days of their own while the team default is 45, **Set 20 days as team default** disabled with the reason as title and the reason shown in the window line); browser check: my window survives a reload and is the same on a second computer with my work email (personal views); a colleague still sees the team default.

**TC-TVL-06 Read only without the right; corrections by hand kept** — Req TVL-10, TVL-11, TVL-12 — L1 `tool-validations.test.mjs` ("TVL-10, TVL-11: tools added, corrected and removed by hand; only the Tool Owner and the co-owners, never without the roles (TC-TVL-06)"); E2E `tool-validations.e2e.mjs` ("TC-TVL-06: a Team Member reads the master list and the expiry view — every change disabled with the reason — and keeps a window of their own; a tool with only a validation date is due 24 months later (TC-TVL-20)": the Setup tab too — Sources and Team settings shown, ＋ Add source…, Edit mapping…, Merge into master list…, Remove and Edit… disabled with the reason); browser check: as a co-owner named in Setup → Team settings, correct the validation date of a tool merged from a Windchill export and merge again — the date stays ("(entered)"); empty it — the source's date comes back; Remove a tool still in a Windchill export — the pop-up warns that it comes back (a tool of the query cannot be edited or removed, TVL-30); in View as, with the sample, a read-only token and before the roles are loaded every button is disabled with the reason; each save is listed under Background jobs.

**TC-TVL-07 The Tool Owner keeps the master list of validated tools** — Req TVL-01, TVL-04, TVL-05, TVL-08, TVL-09, TVL-10, TVL-14 — **UAT** — E2E `tool-validations.e2e.mjs` ("TC-TVL-07: the Tool Owner maps the Tool Validations query — its tools land in the master list in Git, Validation expiry lists overdue, due soon and no due date; a tool added by hand, the team default changed and a manual list merged in"); UAT with Git storage and the Tool Validations query: fetch it — the master list in Git gets every tool (one per tool and version); open Release Details → Tool Validations — it opens on **Expiry list**: the tiles on top, then the table: the overdue tools first, then the ones due in the next 60 days with the days left, then those without a due date; set your own window and go back to the team default; set a window as the team default with **Set … days as team default** — a colleague sees the new default after reading the list again; open **Master list** — the master list alone (no tiles, no expiry table) — and ＋ Add tool… for a tool validated outside Azure DevOps; the **Azure** tab shows the query's releases of the month and its rows; the **Setup** tab, last, holds Sources and Team settings (not on Master list); on Setup add a Table page "Tool register" as a source — a **Tool register** tab appears after Azure, before Setup, with its rows as mapped — check its mapping and **Merge into master list…** from that tab — the preview names the new tools before saving; export the expiry list to CSV for the review meeting. The co-owners list in Setup → Team settings closes with a click elsewhere in the pop-up, with its own button and with Escape (the pop-up stays open, the focus goes back to the list's button; KB-91).

**TC-TVL-08 The release counts do not change** — Req TVL-13, QV-64 — L1 `streams.test.mjs` ("Tool Validations: one entry per tool, whatever the number of its documents (QV-34)"); browser check: with the master list holding tools added by hand and from a Windchill export, the Tool Validations tiles (Releases in {month}, Supported), Pulse Check's lines and the Monthly pack count only the tools of the query for the month, as before.

**TC-TVL-09 The page's tabs: Expiry list first, Master list, Tool List [TFS], Validation Documents [TFS], one tab per other source, Setup last** — Req TVL-14, TVL-08, TVL-10, TVL-05, TVL-01, TVL-09, TVL-11 — L1 `tool-validations.test.mjs` ("TVL-14: the tabs — Expiry list first, Master list, Tool List [TFS], Validation Documents [TFS] (two queries only), then one per other source in the order added, Setup last; a removed source loses its tab; the tabs remembered before (Azure too) open where their content is now — unknown ones on the Expiry list; room for later tabs before Setup (TC-TVL-09)"); E2E `tool-validations.e2e.mjs` ("TC-TVL-07: …": the tabs read Expiry list, Master list, Tool List [TFS], Setup (one query) and the Expiry list is open with the tiles above the expiry table and the window, and no master list, Sources or Team settings; the Master list tab has only the master list panel — no tiles, no expiry table, no window; in the Master list panel the title, the filter row and the first column heading, and in the Validation expiry panel also the window, start at the same left edge (KB-93); Tool List [TFS] holds the query's rows (5 rows), no Releases table and no window; Setup holds Sources then Team settings and no master list or window; the source "Tool register" added on Setup gets its tab after Tool List [TFS] and before Setup (Setup stays open) with its two rows "Not merged yet", merged from that tab, then "Merged"; removing the source on Setup removes its tab and keeps its tools; "TC-TVL-11: …": the owners' tabs come after the source tabs and before Setup; "TC-TVL-06: …": a Team Member sees Expiry list, Master list, Tool List [TFS], Windchill tools, Setup; whose browser tab kept the Master list tab ("tool-master") opens on Master list (not the Expiry list), the Master list tab read only without the tiles, Setup's buttons disabled with the reason, the Windchill source's tab says "That Windchill export is not in this browser." with how to import it, Edit mapping… and Merge into master list… disabled with the reason, and Tool List [TFS] shows "has not been fetched yet"; `tool-validation-queries.e2e.mjs` "TC-TVL-18: …": with two queries the tabs read Expiry list, Master list, Tool List [TFS], Validation Documents [TFS], Setup and no tab holds a Releases table); `documents-and-data.e2e.mjs` ("TC-QV-43: …"); browser check at 1440 and 390 px, light and dark: the tab row wraps on a phone; Setup is the last tab, also with no other source; in every table panel of the page (and on CoNQ) the toolbar and the table's first column line up with the panel's title (KB-93); choose a source tab, open another page and come back — the same tab opens; when that source has been removed meanwhile (from another browser), the page opens on the Expiry list after the list is read again; a browser tab that kept the old Azure tab opens Tool List [TFS].

**TC-TVL-10 The owners' tabs in the file: validated, merged, in order** — Req TVL-15, TVL-16, TVL-02, GIT-17 — L1 `tool-validations.test.mjs` ("TVL-15, TVL-16: the owners’ tabs in tool-validations.json — validated strictly (page id, name, page type; twice refused), written only when there are some; after the source tabs and before Setup, in their order; add, rename, move ← →, remove (TC-TVL-10)", "GIT-17, TVL-16: two saves of the tabs merged — by page id, a rename and an add both kept, a removal kept, the order of the save that moved them (TC-TVL-10)"); browser check with Git storage: a hand-edited `tool-validations.json` with a tab of kind "release", one without a name and a page listed twice — Setup → Sources says "Not used — tool-validations.json in Git: Tab …" for each with why, the other tabs shown; two browsers, one renaming a tab while the other moves another — both changes kept (two commits).

**TC-TVL-11 The Tool Owner adds, renames, reorders and removes tabs of their own** — Req TVL-15, TVL-16, TVL-17, TVL-18, TVL-14, TVL-24, TVL-25 — **UAT** — E2E `tool-validations.e2e.mjs` ("TC-TVL-11: the Tool Owner adds a Table tab and an On-Demand Dashboard tab, renames and reorders them, adds a row and a chart of the master list, and removes them — the pages are never in the menu": Setup shows Sources, Tabs, Team settings; ＋ Add tab… offers Table, Table + Insights, On-Demand Dashboard (Table first); "Open items" writes `on-demand/open-items.json`, its place in `menu-layout.json` with `hidden: true` and `tabs: [{ pageId: open-items, name: Open items, kind: table }]`, the tab appears after Azure and before Setup with Setup still open; a dashboard tab after it; Rename… renames the tab and the page; ← moves the dashboard first and is then disabled; on the Table tab Set up columns… and ＋ Add row save the row to Git, no ＋ Add page…; on the dashboard tab a bar chart of the Tool Validations master list by Status (no period) shows Overdue 1 and Due soon 1; neither page is in the menu; Remove… of the Table tab offers "Kept in Git, hidden" (chosen first) and "Deleted with its data" — deleted: the page file deleted and its place removed; Remove… of the dashboard tab keeps its page and blocks, hidden); UAT: as Tool Owner add a **Table + Insights** tab for the validation actions, add rows and a chart on its Insights tab; add an **On-Demand Dashboard** tab with a KPI of the Overdue tools (Tool Validations expiry list, Status = Overdue) and a bar chart of the master list by Status; rename and reorder the tabs; check that neither page is in the menu, on Home or in search, and that Admin → Pages & menu lists them as Hidden, **Tab of Tool Validations**, with the list's co-owners as their co-owners ("n from the Tool Validations list"); remove one tab keeping its page and one deleting it; make the kept page a tab again with **＋ Add existing page as tab…** — its data is back on the tab.

**TC-TVL-12 The master list and the expiry list as dashboard sources** — Req TVL-18, DSH-03, DSH-04, MYD-15 — L1 `dashboard-sources.test.mjs` ("TVL-18: the Tool Validations master list and expiry list as data sources — every tool with its dates, Status and Days left as the Expiry list counts them (team default window), the expiry list without OK; closed without Release Details; usable by My dashboard and the On-Demand Dashboards (TC-TVL-12)", "MYD-15: the registry — …"); browser check: on My dashboard ＋ Add block… offers "Tool Validations master list (Tool Validations)" and "Tool Validations expiry list (Tool Validations)"; a KPI of the expiry list equals the Expiry list's tiles at the team default window; a role without Release Details sees them as "(not available)" and a block over them says "Not available for your role."; an On-Demand Dashboard in the menu offers them too.

**TC-TVL-13 The owners' tabs read only without the right** — Req TVL-17, TVL-11, CON-102 — E2E `tool-validations.e2e.mjs` ("TC-TVL-13: a Team Member reads the owners’ tabs — the Table and the dashboard shown, every change disabled with the reason; Setup → Tabs read only": the tabs read Expiry list, Master list, Azure, Tool dashboard, Open actions, Setup; neither page in the menu; the dashboard tab draws its chart of the master list with no ＋ Add block… and the reason "Build On-Demand Dashboards"; the Table tab shows its row with ＋ Add row and Set up columns… disabled and the reason; Setup → Tabs: ＋ Add tab…, ←, Rename… and Remove… disabled with the list's reason; nothing written); browser check: a co-owner named in Setup → Team settings adds rows and blocks on the tabs and removes a tab — the delete choice is disabled with "Only a Tool Owner … can delete a page"; in View as and with the sample everything is disabled with the reason.

**TC-TVL-14 Completed by the completion date (Changed Date by default, or a chosen field)** — Req TVL-21, TVL-20 — L1 `tool-queries.test.mjs` ("TVL-21: Completed by the default completion date, Changed Date (last updated date), in UTC (TC-TVL-14)", "TVL-20, TVL-21: Completed by a chosen completion field; a tool without it is never Completed (TC-TVL-14)"); browser check: with two queries, edit a tool's work item in Azure DevOps and refresh — with Changed Date it moves to this month's Completed; with a date column chosen it stays in its month.

**TC-TVL-15 Supported via Parent and a qualifying Quality signature; documents not in the Tool List (Azure)** — Req TVL-21 — L1 `tool-queries.test.mjs` ("TVL-21: Supported via Parent and a qualifying Quality signature — roles trimmed and case ignored, empty slots and other months not counted (TC-TVL-15)", "TVL-21: documents whose Parent is no tool are “Not linked to a tool”: listed, never counted (TC-TVL-15)", "TVL-21: 20,000 documents are read once into maps — linear, a month is a lookup (TC-TVL-15)"); browser check: a signed document whose Parent is no tool appears in **Validation Documents** as **Not in Tool List (Azure)** on the Azure tab and in ⓘ What was counted, and Supported does not change.

**TC-TVL-16 Two connections told apart; the same counts on the page, in Pulse Check, the Monthly pack and the cumulative chart; one connection as before** — Req TVL-19, TVL-22, QV-64, TVL-13 — L1 `tool-queries.test.mjs` ("TVL-19: the two connections — Signed documents by the setting, by its name or by its columns; with one connection none (TC-TVL-16)", "TVL-22: Pulse Check, the Release page, the Monthly pack and the cumulative chart count the same with two queries (TC-TVL-16)", "TVL-19, QV-64: with one connection Tool Validations counts as before — each tool with a document in the month (TC-TVL-16)"); browser check: Signed documents query set to **None — one query** gives the counts of one query again.

**TC-TVL-17 The Tool Validations queries setting: saved for everyone, validated when read** — Req TVL-20, GIT-14 — L1 `tool-queries.test.mjs` ("TVL-20: the setting is kept in the shared settings and survives the Git round trip; bad values are dropped (TC-TVL-17)"); E2E `tool-validation-queries.e2e.mjs` ("TC-TVL-18: …": the completion field chosen is saved in `planning-data.json` as `releaseSourceSettings.toolValidations`); browser check: as a Team Member the panel's two pickers are disabled with "Set by the Tool Owner (Stream mapping); read only for you."

**TC-TVL-18 The Tool Owner counts Tool Validations from two queries** — Req TVL-19, TVL-20, TVL-21, TVL-22, TVL-14, TVL-31, TVL-33, TVL-34, TVL-35, TVL-36 — **UAT** — E2E `tool-validation-queries.e2e.mjs` ("TC-TVL-18: the Tool Owner sets up the Tools and the Signed documents queries, picks the completion date and sees Completed and Supported on the Tool Validations page and in Pulse Check": Add query on the Tool Validations row and on its Signed documents row; the Tool Validations queries panel shows Tools and Signed documents, "found by its name", Changed Date by default with its note and the query's date column offered; October: Validations 2, Completed 2 (Changed Date), Supported 1 (QA signature; an author's signature does not count) on the Master list, whose Current Month Status reads Completed, Supported (Minitab), Completed (JMP) and blank (LabVIEW) with ID, Used by, Validated and Type (TC-TVL-32); the tabs Tool List [TFS] with 3 rows and Validation Documents [TFS] with 4 documents, 2 not in Tool List (Azure) — the retired tool's name read by ID at ↻ (TC-TVL-28) — and no Releases table; Validation Completed chosen and saved: Completed 1 (LabVIEW Completed, Minitab Supported); Pulse Check → Current month releases: "1 completed 1 supported", the Supported line names the supported tool and the quadrant lists "LabVIEW 2020 ID 502 · Completed" and "Minitab 21 ID 501 · Supported" (TC-TVL-33); Azure DevOps only read); UAT: with the team's real Tools and Signed documents queries, set up the second connection with **Add query**, check the roles in **Tool Validations queries**, compare a month's Completed and Supported with the tools you know were validated and signed by Quality in it, choose another completion date if the query has one, and check that the Master list's Current Month Status, Pulse Check and the Monthly pack show the same numbers; on the Validation Documents [TFS] tab check that it lists every signed document with its tool’s name (a retired tool’s documents marked Not in Tool List (Azure), not counted) and that both tables show the queries’ columns in order (TVL-31).

**TC-TVL-19 The Tool Validations counts on the Master list tab only, as Validations** — Req TVL-23 — E2E `documents-and-data.e2e.mjs` ("TC-QV-43: every Release page has the source bar, counts, Releases | Source data tabs (Tool Validations: Expiry list | Master list | Tool List [TFS] | Setup, no Releases table) and the common columns in order": no counts above the tabs or on the Expiry list; on Master list Validations in {Month} and Supported validations) ; E2E `tool-validation-queries.e2e.mjs` ("TC-TVL-18: the Tool Owner sets up the Tools and the Signed documents queries, picks the completion date and sees Completed and Supported on the Tool Validations page and in Pulse Check": Validations in October 2026, Completed validations, Supported validations on Master list; none on the Tool List [TFS] tab) ; browser check: open Tool Validations — Expiry list, Tool List [TFS], Validation Documents [TFS] and Setup show no count tiles; Master list shows them with What was counted.

**TC-TVL-20 No validity period: due 24 months after the validation date (default)** — Req TVL-06, TVL-08, TVL-10, TVL-18 — L1 `tool-validations.test.mjs` ("TVL-06: no validity period — the due date is the validation date + 24 months (default); an explicit period or due date wins (TC-TVL-20)": 15 Mar 2025 → 15 Mar 2027 "validation date + 24 months (default)", 31 Jan 2025 → 31 Jan 2027, 29 Feb 2024 → 28 Feb 2026; a period from a source or entered by hand and a due date from a source or entered by hand win; no validation date → No due date; the expiry list: only a validation date → overdue / due soon / later, not No due date; the file written without a period), `dashboard-sources.test.mjs` ("TVL-18: …": a tool with only a validation date is Overdue with its due date, days left, Due date from "validation date + 24 months (default)" and Validity (months) 24); E2E `tool-validations.e2e.mjs` ("TC-TVL-06: …; a tool with only a validation date is due 24 months later (TC-TVL-20)": Overdue 2, Due in the next 45 days 2, No due date 0; the Expiry list rows of SAS 9.4 (overdue, from the query: "completion date + 24 months (default)" and "(completion date)", TVL-29) and R 4.3 (due soon, added by hand: "validation date + 24 months (default)") show the due date, the days and "24 (default)", and are highlighted by that due date in the default bands (TVL-28: SAS red "Overdue / today", R amber "≤ 30 days"); the Master list row shows "24 (default)" and the due date); browser check at 1440 px light: the Add tool… pop-up says "Leave empty for 24 months (default)" and its due preview uses 24 months; entering a period or a due date replaces the default.

**TC-TVL-21 A hidden page made a tab again** — Req TVL-24, TVL-16, TVL-25 — L1 `tool-validations.test.mjs` ("TVL-24: the hidden pages that can be made a tab again — hidden from the menu, not a tab yet, no sample pages; a page made a tab leaves the list (TC-TVL-21)"); E2E `tool-validations.e2e.mjs` ("TC-TVL-21: the Tool Owner makes a hidden page a tab again with ＋ Add existing page as tab… — it leaves the list of hidden pages, gets the list’s co-owners, and loses them again when its tab is removed": the pop-up offers only "Old actions (Table, 1 row)" — not the page in the menu — named "Old actions"; Add tab writes `tabs: [{ pageId: old-actions, name: Old actions, kind: table }]` and the page's co-owners `hand@…, ana@…` with `ownersFromList: [ana@…]`, the page still hidden; the tab comes after Azure and before Setup, Setup stays open, the row says "1 from the list · 1 added by hand"; the button is then disabled with "No hidden On-Demand page that is not a tab yet…"; the tab shows the page's row and the page is not in the menu; Remove… keeping the page takes ana@… off it, hand@… stays, and the button is enabled again); browser check: a page left behind by an older version (remove `tabs` from `tool-validations.json` by hand) is offered and comes back with its rows or blocks; a co-owner of the list adds it too; a Team Member sees the button disabled with the list's reason; a changed name renames the page.

**TC-TVL-22 The list's co-owners written to the tab pages** — Req TVL-25, PGB-03, PGB-10, GIT-17 — L1 `tool-validations.test.mjs` ("TVL-25: the list’s co-owners written as co-owners of each tab page — merged with those added by hand, only those the list wrote taken off again; kept in menu-layout.json, merged as sets (TC-TVL-22)"); E2E `tool-validations.e2e.mjs` ("TC-TVL-22: the list’s co-owners are written as co-owners of the tab pages and taken off when they leave the list — the co-owners added by hand stay": a tab page holding only hand@… is named "The co-owners of the list are not yet written to the page of Checklist" with "0 from the list · 1 added by hand"; **Write the co-owners to the tab pages** writes `hand@…, ana@…, ben@…` with `ownersFromList: [ana@…, ben@…]` and the notice goes; Team settings says the co-owners are also written to the pages of the 1 tab; Ben taken off the list's co-owners and saved — the page keeps `hand@…, ana@…`, "1 from the list · 1 added by hand"; "TC-TVL-21: …": a new tab's page gets the list's co-owners, a removed tab's page loses them; "TC-TVL-11: …": a list without co-owners writes none); browser check: as a list co-owner (not a Tool Owner) open a tab's page from Admin → Pages & menu — the page's co-owners list shows "1 from the Tool Validations list" and you may set up its columns or build its dashboard there; after you are taken off the list you may not; with menu-layout.json unreadable a change of the co-owners is refused in the pop-up with the reason, the team default alone is still saved; each write is listed under Background jobs as "Tool Validations · co-owners of the tab pages".

**TC-TVL-23 A dashboard block without the expiry status** — Req TVL-26, TVL-18, DSH-05, MYD-14 — L1 `dashboard-sources.test.mjs` ("TVL-26: “Show expiry status” off — a block on the master list or expiry list neither offers nor shows Status and Days left; fields on them replaced, their filters removed; kept in the dashboard file only when off (TC-TVL-23)"); E2E `tool-validations.e2e.mjs` ("TC-TVL-23: a dashboard block on the Tool Validations master list without the expiry status — Show expiry status off, Status and Days left neither offered nor shown": Edit the block of a bar chart by Status — **Show expiry status** ticked, "team default window of 60 days"; unticked: "Status and Days left are left out of this block.", Categories by no longer offers Status or Days left and is no longer Status; by In source now, Save to Git writes `hideStatus: true` and `category: tv-state`; the block's Table view shows "In source" and no Overdue, Due soon or Days left); browser check: the same on My dashboard (a block of the Tool Validations expiry list); the ⓘ names the team default window after it was changed in Team settings; ticked again, Status and Days left are offered again; a filter of the filter row on Status still narrows the block.

**TC-TVL-24 Due date highlights: bands matched, read strictly, merged** — Req TVL-27, TVL-28, TVL-02, GIT-17, TVL-06 — L1 `tool-validations.test.mjs` ("TVL-27, TVL-28: due date highlights — the narrowest band that holds a tool wins, an overdue tool in the first band, no due date never; the default bands until saved, an empty list none (TC-TVL-24)": a tool with only a validation date is banded by its default due date — validation date + 24 months, TVL-06, TC-TVL-20; "GIT-17, TVL-27: two saves of the highlight bands merged as one value — the later save wins; a save that did not touch them keeps the other one’s (TC-TVL-24)"); browser check with Git storage: a hand-edited `tool-validations.json` with a band of −1 days, one of colour "#ff0000" and 30 days twice — Setup says "Not used — tool-validations.json in Git: Highlight “…”" for each with why, the good bands shown; two browsers, one changing the bands while the other adds a tool — both kept, the bands of the later save when both changed them.

**TC-TVL-25 The Tool Owner sets the due date highlights; everyone sees them** — Req TVL-27, TVL-28, TVL-11, TVL-14 — **UAT** — E2E `tool-validations.e2e.mjs` ("TC-TVL-25: the Tool Owner sets the due date highlights on Setup — saved to Git; the Master list and the Expiry list tint the rows with a pill and a legend; a Team Member sees them read only": with a list without `highlights`, Setup → Due date highlights shows the default bands (Overdue or due today Red, Due within 30 days Amber, Due within 90 days Yellow) with their counts and "not saved in Git yet"; the Master list tints the overdue tool red with "Overdue / today" and the tool due in 20 days amber with "≤ 30 days", the tool with no due date and the one due later untinted, with the legend; Edit… — the 30-day band's colour to Blue, the 90-day band removed, ＋ Add band at 365 days Green, the same days twice refused with the error — Save to Git writes `highlights: [{0 red}, {30 blue}, {365 green}]` ("Tool Validations: due date highlights — …"); the Master list and the Expiry list then show the blue and green tints and pills and the new legend; every band removed saves `highlights: []` and no row is tinted, no legend; a Team Member sees the bands and the tints with Edit… disabled and the reason; nothing written); UAT: as Tool Owner set the bands the team wants (for example overdue red, 30 days amber, 90 days yellow, 180 days green), check them on the Master list and the Expiry list in light and dark mode, and check as a Team Member on another computer that the same rows are highlighted and Edit… is greyed out with the reason.

**TC-TVL-26 Tools from Azure DevOps dated by the completion date; the lock in the logic** — Req TVL-29, TVL-30, TVL-06, TVL-07, TVL-04, TVL-18 — L1 `tool-validations.test.mjs` ("TVL-29: a tool from Azure DevOps takes the completion date as its validation date — a mapped Validation date wins; due = + 24 months unless the source gives a period or a due date (TC-TVL-26)": the guess of an Azure DevOps source is the completion date; Changed Date by default, Closed Date when chosen in Stream mapping (the setting passed in), also with no validation date mapped; a mapped Validation date field wins for every row (a row without it: no date); completion date + 24 months "(default)"; a source period ("completion date + validity period") or due date ("from the source") wins; appended and written to the file as a source's validation date; a later Changed Date moves the date and the due date; "(completion date)" not shown for a source mapping another field, a Windchill-only tool or a date entered by hand; "TVL-30: a tool from Azure DevOps cannot be edited (but its notes) or removed here — Remove allowed once it is not in the source; hand and Windchill tools unchanged; a hand-added duplicate is refused (TC-TVL-27)": the reasons of the Tool Validations query and of another query, editProblem / saveTool / removeTool refuse (a change of the validation date, period, due date, name or version refused with the notes; a change of the notes only accepted and saved with who and when, nothing else changed), a Windchill tool and a hand tool are edited and removed, a hand-added "mini-tab v21.0" refused with the reason and not saved, Remove allowed once the query no longer returns the tool and Edit still refused, a hand-entered due date of a tool the query brings later replaced by the query's values; "TVL-04, TVL-05: …": a date changed by hand is kept when a Windchill export is read; "TVL-07: …": the guess names the completion date), `dashboard-sources.test.mjs` ("TVL-18: …": Due date from "completion date + validity period" for a tool of the query); browser check: Setup → Edit mapping… of the Tool Validations query offers "Completion date (Stream mapping → Tool Validations queries; the default)" and "None — the completion date" for Validation date; choose Author Approval Date and Save to Git — the dates follow it at the next fetch and "(completion date)" goes; pick Completion date again — the completion date comes back (a saved mapping is never changed by the app); pick another completion date in Stream mapping and fetch — the validation dates follow.

**TC-TVL-27 The Tool Owner sees the Azure DevOps tools dated and locked** — Req TVL-29, TVL-30, TVL-10, TVL-11, TVL-08, TVL-03 — **UAT** — E2E `tool-validation-queries.e2e.mjs` ("TC-TVL-27: tools from Azure DevOps are validated on their completion date (TC-TVL-26) and locked — Edit and Remove disabled with the reason, Edit notes… saved; a tool gone from the query removed; a tool added by hand edited; a hand-added twin refused": the Tools query fetched — Minitab 21 written with its Changed Date as validationDate and no period or due date; Polyspace, in Git from the query but not returned, marked Not in source now; the Master list row "Minitab 21 {date} (completion date) 24 (default) {date + 24 months} … (completion date + 24 months (default)) In source"; Edit and Remove of Minitab and LabVIEW disabled with "Comes from Azure DevOps (Tool Validations query): change it there." (Remove: "…; it can be removed here once Azure DevOps no longer returns it.") and the line above the table; Edit notes… on Minitab saves only its notes to Git (dates and sources unchanged) and Edit stays disabled; a tool added by hand has no Edit notes…; ＋ Add tool… "mini-tab" "v21.0" refused in the pop-up with the reason; Polyspace's Edit disabled, Remove enabled — removed and saved; Excel Validator (added by hand) edited and saved; the Expiry list row "Due soon Minitab 21 … completion date + 24 months (default) {date} (completion date) 24 (default)"), `tool-validations.e2e.mjs` ("TC-TVL-07: …": the Tool Owner's only blocked line is the one about the tools of the query; "TC-TVL-06: …": SAS from the query shows "(completion date)" and "completion date + 24 months (default)"); UAT with the team's Tools query: fetch it — every tool of the query has a validation date (its completion date) and a due date 24 months later unless the query gives one; Edit and Remove are greyed out with the reason for them and **Edit notes…** saves their notes, and for a tool added by hand Edit and Remove work; take a tool out of the query (or out of its results) and fetch — it is Not in source now and can be removed; change a tool's work item and fetch — with Changed Date its dates move (LIM-77).

**TC-TVL-28 Validation Documents [TFS] and Tool List [TFS]: every document with its tool's name, the query's columns in order, retired tools listed but not counted** — Req TVL-31, TVL-22, TVL-21 — L1 `tool-queries.test.mjs` ("TVL-31: the Tool of each document — the Tools query’s name, a title read by ID, else #ID with the reason (TC-TVL-28)", "TVL-31, TVL-21: documents of tools not in the Tools query (e.g. retired) are listed, never counted — whatever their names (TC-TVL-28)", "TVL-31: Parent titles read by ID — read only, in batches; a failed batch read one by one; a rejected PAT stops (TC-TVL-28)", "TVL-31: Tool List (Azure) and Validation Documents show every column the query selects, in SELECT order (TC-TVL-28)") ; E2E `tool-validation-queries.e2e.mjs` ("TC-TVL-18: the Tool Owner sets up the Tools and the Signed documents queries, picks the completion date and sees Completed and Supported on the Tool Validations page and in Pulse Check": the tabs Tool List [TFS] and Validation Documents [TFS], each with its one table, no "Not linked to a tool" table and no Releases table; the headings Tool, Parent ID, Tool List (Azure), then the query's SELECT order; the Parents 998 and 999 are read in one batch read as soon as the documents are shown, and again by ↻ — 999 shows "Old Analyzer 1.0", 998 (not returned) "#998" with the reason in ⓘ; "4 documents · 2 not in Tool List (Azure) · not counted"; the retired tool not in the master list and the counts unchanged; the names still shown after a reload and the fetch at start — kept, or read again when missing) ; browser check: with the team's queries, a document of a retired tool shows the tool's name and **Not in Tool List (Azure)**; hide a column with **Columns** and show it again; with an on-premises Signed documents connection the names are read the same way (read only); with the PAT removed, ↻ shows #ID with "No PAT" in ⓘ.

**TC-TVL-29 The category of a source: Tool List or Validation Documents** — Req TVL-32, TVL-02, TVL-04, TVL-05, TVL-07 — L1 `tool-validations.test.mjs` ("TVL-32: the category of a source read and written — \"tools\" or \"documents\"; none reads as Tool List; an unknown value refused; the Tool Validations query always a Tool List (TC-TVL-29)": the two categories and their labels; a source without `category` reads as a Tool List and feeds the master list; `category` written only when set, after the name, and read back the same; "signed" and 7 refused with the reason and the source not used; Validation Documents on the Tool Validations query refused; the category of ＋ Add source… stored; "TVL-32: a Validation Documents source never adds to or updates the master list; changed to it, the tools it fed stay, \"not in source now\" (TC-TVL-29)": a Validation Documents source merged adds and updates nothing (the same file); a Tool List source appends Polyspace and links Minitab; changed to Validation Documents its two tools stay, linked "not in source now" for it (other links unchanged, state Not in source now); back to Tool List they are linked at its next merge; the Tool Validations query stays a Tool List; "GIT-17, TVL-32: two saves merged — a category changed in one save and a tool added in the other both kept; both changed: the later save (TC-TVL-29)") ; browser check: an older tool-validations.json without `category` opens with every source as Tool List and Merge into master list… offered; a hand-edited `"category": "signed"` shows the source under "Not used" with the reason.

**TC-TVL-30 Stream mapping: Add query asks Tool List or Validation Documents** — Req TVL-33, TVL-19, TVL-20, TVL-04 — L1 `tool-queries.test.mjs` ("TVL-33: the roles named Tool List and Validation Documents; the category pre-selected by name or columns (TC-TVL-30)", "TVL-33: the category confirmed at Add query saved as the Validation Documents setting — a Tool List never becomes it (TC-TVL-30)": Validation Documents names the new connection; a Tool List found as such by Automatic leaves the setting; a Tool List named "docs" sets the other documents connection, else None — also when alone; an unknown connection changes nothing) ; E2E `tool-validation-queries.e2e.mjs` ("TC-TVL-30: Stream mapping Add query asks the category — Tool List or Validation Documents, pre-selected by name or columns and confirmed; the queries panel names the roles Tool List and Validation Documents": the row Tool Validations · Validation Documents; Add query on Tool Validations — Category with Tool List pre-selected ("Pre-selected as the Tool List"); the name "Tool Validations Signed docs" moves the pre-selection to Validation Documents (by its name) until Tool List is picked ("Chosen by you."); saved, its role is Tool List and the Validation Documents query None; Add query on the Validation Documents row — Validation Documents pre-selected, Tool List disabled with "Tool Validations already has a Tool List query (…)"; the roles Tool List and Validation Documents, the picker Validation Documents query = that connection, "chosen in Stream mapping → Tool Validations queries", saved to the data repository; "TC-TVL-18: …": Tool List and Validation Documents pre-selected and confirmed, the roles Tool List / Validation Documents, the setting saved with the completion field) ; browser check: as a Team Member Add query is not offered and the panel is read only (the Stream mapping right).

**TC-TVL-31 The Tool Owner adds a Validation Documents source and a Tool List source** — Req TVL-32, TVL-05, TVL-07, TVL-10, TVL-14 — **UAT** — E2E `tool-validations.e2e.mjs` ("TC-TVL-31: the Tool Owner adds a Validation Documents source — its tab lists its rows with every column, the master list unchanged — and a Tool List source whose tools are appended; changed to Validation Documents, its tools stay": Setup → Sources shows the Tool Validations query as Tool List; ＋ Add source… asks Category (Tool List / Validation Documents, required, nothing pre-selected) and adds nothing without it; a Table page "Signed documents register" added as Validation Documents ("No field mapping is needed…") is saved with `category: "documents"`, the master list unchanged; its row says Validation Documents and "Not needed — every column is listed on its tab" without Merge into master list…; its tab lists Document, Tool, Signed by, Signed on and both rows, "2 rows · not in the master list"; the Master list keeps its 4 tools; "Tool register" added as Tool List and merged — Polyspace appended (`category: "tools"`); its Edit mapping… changed to Validation Documents warns that its 2 tools stay, saves "… is Validation Documents — 2 no longer in the source", Polyspace and LabVIEW linked not in source now for it and Polyspace shown Not in source now; "TC-TVL-07: …": the manual list added with Category Tool List) ; UAT with the team's data: add the signed documents list as **Validation Documents** — its tab shows its rows and every column and nothing reaches the master list; add a tool list as **Tool List** and merge it — its tools are appended; change a source's category and see its tools stay, Not in source now.

**TC-TVL-32 The master list's ID, Used by, Validated, Type and Current Month Status** — Req TVL-34, TVL-35, TVL-30, TVL-07 — L1 `tool-validations.test.mjs` ("TVL-34: ID, Used by, Validated and Type guessed by column name — System.Id, Source, State, Type (else the work item type); editable, None kept; Azure DevOps sources only (TC-TVL-32)", "TVL-34: the four values kept in tool-validations.json — read strictly, written, merged from Azure DevOps (Azure wins, a blank never clears) and in two saves (GIT-17) (TC-TVL-32)"), `tool-queries.test.mjs` ("TVL-35: the Current Month Status — Completed, Supported, both or blank; months in UTC; only the Tools query’s tools (TC-TVL-32)", "TVL-35: with one query a master list tool is Supported when a row of the query names it with a document in the month (TC-TVL-32)") ; E2E `tool-validation-queries.e2e.mjs` ("TC-TVL-18: …": the Master list's ID 501 / Used by Lab A / Validated Validated / Type Statistics and Current Month Status "Completed Supported" for Minitab 21, "Completed" for JMP 17, blank for LabVIEW 2020 in October; after Validation Completed is chosen LabVIEW Completed, Minitab Supported, JMP blank) ; browser check at 1440 and 390 px, light and dark: the two pills of "Completed, Supported" sit on one line; sort and filter by Current Month Status and by Used by; Export → CSV writes "Completed, Supported"; Setup → Edit mapping… of the Tool Validations query offers ID, Used by, Validated and Type with the guesses, and None saved stays None after a reload; a Windchill source's Edit mapping… does not offer them; the Expiry list shows the status too; a tool added by hand has no status and Edit still works for it.

**TC-TVL-33 Counts and Pulse Check's Tool Validations list from the master list** — Req TVL-36, TVL-22, TVL-23 — L1 `tool-queries.test.mjs` ("TVL-36: the counts and Pulse Check’s Tool Validations list come from the master list — the same numbers as the two queries (TC-TVL-33)") ; E2E `tool-validation-queries.e2e.mjs` ("TC-TVL-18: …": the Master list tiles 2 / 2 / 1, then 2 / 1 / 1, equal the Current Month Status column; Pulse Check's quadrant "1 completed 1 supported" lists "LabVIEW 2020 ID 502 · Completed" and "Minitab 21 ID 501 · Supported"), `documents-and-data.e2e.mjs` ("TC-QV-43: …": one query, Validations and Supported validations on the Master list) ; browser check: for the header month the Master list's Validations in {Month}, Completed validations and Supported validations equal the number of rows with each status (filter the column), Pulse Check's Tool Validations quadrant, the Monthly pack's Tool validation line and the cumulative chart; remove a tool's link (a tool gone from the Tools query, Not in source now) — its status is blank and the counts drop at once.
### 6.34 PI Review

**TC-PIR-01 The PI list and the default PI** — Req PIR-02 — L1 `pi-review.test.mjs` ("PIR-02: the PI list merges the iterations and the fetched items, ignoring case, newest first (TC-PIR-01)", "PIR-02: the default PI is the current one (UTC); overlapping PIs choose nothing; without iterations the latest PI with Features, said (TC-PIR-01)"); browser check with a test project: the PI list matches the iteration tree, the current PI is chosen with the Current PI chip, the last choice is kept after a reload.

**TC-PIR-02 The Features of a PI and the toggle** — Req PIR-03 — L1 `pi-review.test.mjs` ("PIR-03: the Features of a PI — Removed and absence-Epic Features left out; the toggle adds Features with User Stories in this PI (TC-PIR-02)").

**TC-PIR-03 The whole Discussion as plain text** — Req PIR-05, BKL-20 — L1 `pi-review.test.mjs` ("PIR-05, BKL-20: the Discussion is read page by page with the continuation token, deleted comments dropped, newest first, as plain text (TC-PIR-03)", "PIR-05: the Discussion read stops at the cap (1,000 by default) and says so; a repeated token stops the loop (TC-PIR-03)"), `work-item-edit.test.mjs` ("Discussion: comments newest first as text, …"); browser check with a test project: a Feature with more than 200 comments shows them all in the PI Review drawer and in the Edit form.

**TC-PIR-04 Read all Discussions: 3 at a time, 429 handled** — Req PIR-06 — L1 `pi-review.test.mjs` ("PIR-06: Read all Discussions — 3 at a time; a 429 waits (at most 60 s) and retries once; a second 429 stops with the rest unread (TC-PIR-04)").

**TC-PIR-05 The Discussion page token in both transports** — Req DSK-11, PIR-05 — L1 `pi-review.test.mjs` ("DSK-11, PIR-05: the web transport sends the page token URL-encoded on the read only, at most 2,048 characters; 429 names Retry-After (TC-PIR-05)"), `azure-devops.test.mjs` ("DSK-11: the desktop proxy accepts a Discussion page token on the read only — a text of at most 2,048 characters, URL-encoded on the fixed host and path; 429 names Retry-After (TC-PIR-05)").

**TC-PIR-06 A lead reviews a PI's Features and their Discussions** — Req PIR-01, PIR-02, PIR-03, PIR-04, PIR-05, PIR-06 — **UAT** — E2E `pi-review.e2e.mjs` ("TC-PIR-06: the current PI is preselected, its Features listed, a Discussion read in the drawer as plain text from both pages, and Read all Discussions completes": against a mocked Azure DevOps — the Time Writing fetch, the iterations with PI 2026.4 current and the Comments API in two pages — PI 2026.4 is chosen with the Current PI chip; its two Features are listed by ID, the toggle adds the Feature with a User Story in the PI; the drawer shows the three comments of both pages newest first as text, "@Ana Costa" and "[image]", no markup rendered, the second page asked with the URL-encoded token; Comments shows 3; ↻ Read all Discussions ends with "1 of 1 read." and fills the column); UAT: on the released build a lead opens PI Review on the current PI, reads two Features' Discussions and runs Read all Discussions.

## 7. Requirements coverage matrix

| Requirement | Test cases |
|---|---|
| NAV-01…04 | TC-NAV-01 |
| NAV-05, NAV-06 | TC-NAV-02 |
| NAV-07 | TC-NAV-01 |
| NAV-08…11, NAV-35 | TC-NAV-03 |
| NAV-13 | TC-NAV-04 |
| NAV-14, NAV-15 | TC-NAV-05 |
| NAV-16 | TC-NAV-06 |
| NAV-25 | TC-NAV-25 |
| NAV-26 | TC-NAV-26 |
| NAV-27 | TC-NAV-27 |
| NAV-28 | TC-NAV-28 |
| NAV-29 | TC-NAV-29 |
| NAV-30 | TC-NAV-30 |
| NAV-31 | TC-NAV-31 |
| NAV-32 | TC-NAV-17, TC-NAV-32 |
| NAV-33 | TC-NAV-33 |
| NAV-34 | TC-NAV-34 |
| NAV-36 | TC-NAV-36 |
| NAV-37 | TC-NAV-37 |
| NAV-38 | TC-NAV-38 |
| NAV-39 | TC-NAV-39 |
| NAV-40 | TC-NAV-40 |
| NAV-41 | TC-NAV-41 |
| NAV-42 | TC-NAV-42 |
| NAV-43 | TC-NAV-42 |
| NAV-44 | TC-NAV-42 |
| NAV-45 | TC-NAV-45 |
| NAV-46 | TC-NAV-46 |
| NAV-47 | TC-NAV-47 |
| NAV-48 | TC-NAV-48 |
| NAV-49 | TC-NAV-48 |
| NAV-50 | TC-NAV-50 |
| NAV-51 | TC-NAV-51, TC-NAV-03, TC-MON-03 |
| NAV-52 | TC-NAV-52 |
| CON-01…03 | TC-CON-01 |
| CON-04…08, CON-19 | TC-CON-02 |
| CON-09 | TC-CON-03 |
| CON-10…12 | TC-NAV-02 |
| CON-13, CON-17 | TC-CON-06 |
| CON-14…16 | TC-CON-04, TC-CON-05 |
| CON-18 | TC-INS-01 |
| CON-20 | TC-CON-07 |
| CON-52, CON-53 | TC-CON-23, TC-CON-26, TC-BKL-18 |
| CON-54 | TC-ATM-08 |
| CON-55 | TC-CON-24 |
| CON-56 | TC-QV-16 |
| CON-57 | TC-CON-25 |
| CON-58 | TC-CON-26 |
| CON-59 | TC-CON-27 |
| CON-60 | TC-CON-28 |
| CON-61 | TC-CON-29 |
| CON-62 | TC-CON-30 |
| CON-63 | TC-CON-31 |
| CON-64 | TC-CON-32 |
| CON-65 | TC-CON-33 |
| CON-66 | TC-CON-34 |
| CON-67 | TC-CON-35 |
| CON-68 | TC-CON-36 |
| CON-69 | TC-CON-37 |
| CON-70 | TC-CON-38 |
| CON-71 | TC-CON-39 |
| CON-72 | TC-CON-40 |
| CON-73 | TC-CON-41 |
| CON-74 | TC-ACC-03 |
| CON-75 | TC-CON-43 |
| CON-76 | TC-CON-44 |
| CON-77 | TC-CON-45 |
| CON-78 | TC-CON-46 |
| CON-79 | TC-CON-47 |
| CON-80 | TC-CON-48 |
| CON-81 | TC-CON-49 |
| CON-82 | TC-CON-50 |
| CON-83 | TC-CON-51 |
| CON-84 | TC-CON-52 |
| CON-85 | TC-CON-53 |
| CON-86 | TC-CON-54 |
| CON-87 | TC-CON-55 |
| CON-88 | TC-CON-56 |
| CON-89 | TC-ACC-04 |
| CON-90 | TC-ACC-05 |
| CON-91 | TC-ACC-04 |
| CON-92 | TC-ACC-04, TC-ACC-05 |
| CON-93 | TC-CON-57 |
| CON-94 | TC-CON-58, TC-OND-06 |
| CON-95 | TC-CON-59, TC-CON-60 |
| CON-96 | TC-CON-60 |
| CON-97 | TC-CON-60 |
| CON-98 | TC-CON-61 |
| CON-99 | TC-CON-61 |
| CON-100 | TC-CON-62 |
| CON-101 | TC-CON-63, TC-CON-64 |
| CON-102 | TC-CON-64 |
| QV-20 | TC-QV-06 |
| QV-21 | TC-QV-07 |
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
| FET-20 | TC-FET-08, TC-FET-09 |
| FET-21 | TC-FET-09 |
| FET-22 | TC-FET-10 |
| FET-23, FET-24 | TC-FET-11 |
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
| MON-20 | TC-MON-08 |
| MON-21 | TC-MON-09 |
| MON-22 | TC-MON-10 |
| MON-23 | TC-MON-09 |
| MON-24 | TC-MON-10 |
| ATM-01…03 | TC-ATM-01 |
| ATM-04, ATM-05 | TC-ATM-02 |
| ATM-06 | TC-ATM-03, TC-ATM-08 |
| ATM-07…09 | TC-ATM-04, TC-ATM-20 |
| ATM-10…12 | TC-ATM-05 |
| ATM-13, ATM-14 | TC-ATM-06 |
| ATM-15, ATM-16 | TC-ATM-07 |
| ATM-17 | TC-ATM-09 |
| ATM-18 | TC-ATM-10 |
| ATM-19 | TC-ATM-11 |
| ATM-20 | TC-ATM-12 |
| ATM-21 | TC-ATM-13 |
| ATM-22 | TC-ATM-14 |
| ATM-23 | TC-ATM-15 |
| ATM-24 | TC-ATM-16, TC-CAP-06 |
| ATM-25 | TC-ATM-17 |
| ATM-26 | TC-ATM-18 |
| ATM-27 | TC-ATM-19 |
| ATM-28 | TC-ATM-21 |
| ATM-29 | TC-ATM-22 |
| ATM-30 | TC-ATM-23 |
| BKL-01…03, BKL-12 | TC-BKL-01, TC-BKL-34 |
| BKL-04…09, BKL-11 | TC-BKL-02 |
| BKL-10 | TC-BKL-03, TC-ATM-11 |
| BKL-13 | TC-BKL-04 |
| BKL-14 | TC-BKL-05, TC-BKL-16, TC-BKL-18 |
| BKL-15 | TC-BKL-06 |
| BKL-16 | TC-BKL-07 |
| BKL-17 | TC-BKL-08 |
| BKL-18 | TC-BKL-09 |
| BKL-19 | TC-BKL-10, TC-BKL-17 |
| BKL-20 | TC-BKL-11, TC-PIR-03 |
| BKL-21 | TC-BKL-12 |
| BKL-22 | TC-BKL-12, TC-BKL-18 |
| BKL-23 | TC-BKL-13 |
| BKL-24 | TC-BKL-14 |
| BKL-25 | TC-BKL-15 |
| BKL-26 | TC-BKL-16 |
| BKL-27 | TC-BKL-17 |
| BKL-28 | TC-BKL-18 |
| BKL-29 | TC-BKL-19 |
| BKL-30 | TC-BKL-19 |
| BKL-31 | TC-BKL-20, TC-BKL-21 |
| BKL-32 | TC-BKL-21 |
| BKL-33 | TC-BKL-22 |
| BKL-34 | TC-BKL-23 |
| BKL-35 | TC-BKL-24 |
| BKL-36 | TC-BKL-25 |
| BKL-37 | TC-BKL-26 |
| BKL-38 | TC-BKL-27 |
| BKL-39 | TC-BKL-28 |
| BKL-40 | TC-BKL-29 |
| BKL-41 | TC-BKL-30 |
| BKL-42 | TC-BKL-31 |
| BKL-43 | TC-BKL-32 |
| BKL-44 | TC-BKL-33 |
| BKL-45 | TC-BKL-34 |
| BKL-46 | TC-BKL-35 |
| BKL-47 | TC-BKL-36 |
| QV-01, QV-02 | TC-QV-01 |
| QV-03, QV-05 | TC-QV-02 |
| QV-04 | TC-FET-07 |
| QV-06…10 | TC-QV-03 |
| QV-11 | TC-QV-04 |
| QV-12…17 | TC-QV-05 |
| QV-22 | TC-QV-08 |
| QV-23 | TC-QV-09 |
| QV-24, QV-25 | TC-QV-10 |
| QV-26 | TC-QV-11 |
| QV-27 | TC-QV-12 |
| QV-28 | TC-QV-13 |
| QV-29 | TC-QV-14 |
| QV-30 | TC-QV-15 |
| QV-31 | TC-QV-16 |
| QV-32 | TC-QV-17 |
| QV-33 | TC-QV-18 |
| QV-34 | TC-QV-19 |
| QV-35 | TC-QV-20 |
| QV-36 | TC-QV-21 |
| QV-37 | TC-QV-22 |
| QV-39 | TC-QV-23 |
| QV-40 | TC-QV-24 |
| QV-41 | TC-QV-25 |
| QV-42 | TC-QV-25 |
| QV-43 | TC-QV-25 |
| QV-44 | TC-QV-25 |
| QV-45 | TC-QV-25 |
| QV-46 | TC-QV-26 |
| QV-47 | TC-QV-27 |
| QV-48 | TC-QV-28 |
| QV-49 | TC-QV-30 |
| QV-50 | TC-QV-31 |
| QV-51 | TC-QV-32 |
| QV-52 | TC-QV-33 |
| QV-53 | TC-QV-34 |
| QV-54 | TC-QV-35 |
| QV-55 | TC-QV-37 |
| QV-56 | TC-QV-36 |
| QV-57 | TC-QV-38 |
| QV-58 | TC-QV-39 |
| QV-59 | TC-QV-40 |
| QV-60 | TC-QV-41 |
| QV-61 | TC-QV-42 |
| QV-62 | TC-QV-43 |
| QV-63 | TC-QV-44 |
| QV-64 | TC-QV-45, TC-QV-43, TC-TVL-08, TC-TVL-16, TC-TVL-18 |
| QV-65 | TC-QV-46, TC-QV-43 |
| QV-66 | TC-QV-47, TC-QV-49 |
| QV-67 | TC-QV-48 |
| QV-68 | TC-QV-49 |
| QV-69 | TC-QV-49 |
| QV-70 | TC-QV-50, TC-QV-43 |
| QV-71 | TC-QV-51, TC-QV-43 |
| QV-72 | TC-QV-52 |
| QV-38 | TC-CON-42 |
| OVR-01…08 | retired (TC-OVR-01…03 retired) |
| OV-11 | TC-OV-11 |
| OV-12 | TC-OV-12 |
| OV-13 | TC-OV-13 |
| OV-14 | TC-OV-14 |
| OV-15 | TC-OV-15 |
| OV-16 | TC-OV-15 |
| OVR-09, CAP-01…09 | TC-CAP-01 |
| CAP-04, CAP-05, CAP-10…12 | TC-CAP-02 |
| CAP-13 | TC-CAP-03 |
| CAP-14 | TC-CAP-04 |
| CAP-15 | TC-CAP-05 |
| CAP-16 | TC-CAP-06 |
| CAP-29 | TC-CAP-07 |
| CAP-30 | TC-CAP-07, TC-CAP-23 |
| CAP-31 | TC-CAP-07 |
| CAP-32 | TC-CAP-08, TC-HIS-11 |
| CAP-33, CAP-34 | TC-CAP-09 |
| CAP-35 | TC-CAP-10 |
| CAP-36 | TC-CAP-11 |
| CAP-37 | TC-CAP-12 |
| CAP-38 | TC-CAP-13 |
| CAP-39 | TC-CAP-14 |
| CAP-40 | TC-CAP-15 |
| CAP-41 | TC-CAP-16 |
| CAP-42 | TC-CAP-16 |
| CAP-43 | TC-CAP-17 |
| CAP-44 | TC-CAP-18 |
| CAP-45 | TC-CAP-19 |
| CAP-46 | TC-CAP-20 |
| CAP-47 | TC-CAP-21 |
| CAP-48 | TC-CAP-22, TC-CAP-31 (retired: see CAP-59) |
| CAP-49 | TC-CAP-22 |
| CAP-50 | TC-CAP-22 |
| CAP-51 | TC-CAP-22, TC-CAP-23 |
| CAP-52 | TC-CAP-24 |
| CAP-53 | TC-CAP-25 |
| CAP-54 | TC-CAP-26 |
| CAP-55 | TC-CAP-27 |
| CAP-56 | TC-CAP-28 |
| CAP-57 | TC-CAP-22, TC-CAP-29 |
| CAP-58 | TC-CAP-30 |
| CAP-59 | TC-CAP-31 |
| CAP-60 | TC-CAP-32 |
| CAP-61 | TC-CAP-33 |
| CAP-62 | TC-CAP-34 |
| BAS-01…04 | TC-BAS-01 |
| BAS-05…07 | TC-BAS-02 |
| BAS-08…10 | TC-BAS-03 |
| BAS-11 | TC-BAS-04 |
| GIT-01 | TC-GIT-01 |
| GIT-03, GIT-04, GIT-08 | TC-GIT-02, TC-GIT-05 |
| GIT-02…04, GIT-06, GIT-08, GIT-12 | TC-GIT-02 |
| GIT-13 | TC-GIT-06, TC-GIT-17 |
| GIT-14 | TC-GIT-07 |
| GIT-15 | TC-GIT-08, TC-OND-02 |
| GIT-16 | TC-GIT-09 |
| GIT-17, HIS-04, MYD-09, KPT-03, CON-88, PCK-08 | TC-GIT-10 |
| GIT-18, GIT-20 | TC-GIT-11, TC-GIT-14, TC-GIT-15 |
| GIT-21 | TC-GIT-13 |
| GIT-22 | TC-GIT-14 |
| GIT-23 | TC-GIT-15 |
| GIT-24 | TC-GIT-16 |
| GIT-25 | TC-GIT-18, TC-GIT-20 |
| GIT-26 | TC-GIT-19 |
| GIT-19 | TC-GIT-12 |
| GIT-17 (Tool Validations master list) | TC-TVL-01, TC-TVL-24 |
| GIT-17 (On-Demand pages) | TC-OND-05, TC-OND-11, TC-OND-17, TC-OND-22, TC-PGB-08, TC-DSH-04, TC-OND-41 |
| GIT-05, GIT-07, GIT-11 | TC-GIT-03 |
| GIT-09, GIT-10 | TC-GIT-04 |
| SNP-01…03 | TC-SNP-01 |
| SNP-04…07 | TC-SNP-02 |
| SNP-08 | TC-SNP-03 |
| SNP-09 | TC-SNP-04 |
| SET-01…04 | TC-SET-01 |
| SET-05, SET-06 | TC-SET-02 |
| SET-07…09 | TC-SET-03 |
| SET-13 | TC-SET-05 |
| SET-14 | TC-SET-06 |
| SET-15 | TC-SET-06 |
| SET-16 | TC-SET-06 |
| SET-17 | TC-SET-07 |
| SET-18 | TC-SET-08 |
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
| DSK-11 | TC-PIR-05 |
| SMP-01…04 | TC-SMP-01 |
| SMP-05 | TC-SMP-02 |
| SMP-06 | TC-SMP-02 |
| DOC-01…03, DOC-05 | TC-DOC-01 |
| DOC-04, DOC-06…08 | TC-DOC-02 |
| DOC-12 | TC-DOC-04 |
| DOC-13 | TC-DOC-05 |
| DOC-09…11 | TC-DOC-03 |
| DOC-14 | TC-DOC-06 |
| DOC-15 | TC-DOC-06 |
| DOC-16 | TC-DOC-06 |
| UI-01, UI-02 | TC-UI-01 |
| UI-03, UI-04 | TC-INS-03 |
| UI-05 | TC-UI-02 |
| UI-06 | TC-UI-03 |
| UI-07 | TC-UI-04 |
| UI-08 | TC-UI-04, TC-UI-14 |
| UI-09 | TC-UI-04 |
| UI-10 | TC-UI-04, TC-UI-05 |
| UI-11 | TC-UI-05 |
| UI-12 | TC-UI-04 |
| UI-13 | TC-UI-06 |
| UI-14 | TC-UI-07 |
| UI-15 | TC-UI-08 |
| UI-16 | TC-UI-09 |
| UI-17 | TC-UI-10 |
| UI-18 | TC-UI-11 |
| UI-19 | TC-UI-12 |
| UI-20 | TC-UI-15, TC-UI-16, TC-UI-17 |
| UI-21 | TC-UI-13, TC-UI-16 |
| UI-22 | TC-UI-14, TC-UI-16 |
| UI-23 | TC-UI-15, TC-UI-17 |
| CI-01…04 | TC-INS-04, TC-CI-01 |
| CI-05 | TC-UPD-01 |
| CI-06 | TC-CI-02 |
| CI-07 | TC-CI-03 |
| CI-08 | TC-CI-04 |
| CI-09 | TC-CI-05 |
| CI-10 | TC-CI-06 |
| CI-11 | TC-CI-07 |
| CI-12 | TC-CI-08 |
| QEM-01 | TC-QEM-03, TC-QEM-04 |
| QEM-02 | TC-QEM-01, TC-QEM-04 |
| QEM-03…QEM-06 | TC-QEM-02, TC-QEM-04 |
| QEM-07 | TC-QEM-03, TC-QEM-04 |
| QEM-08 | TC-QEM-05 |
| QEM-09 | TC-QEM-06 |
| QEM-10 | TC-QEM-07 |
| QEM-11 | TC-QEM-08 |
| QEM-12 | TC-QEM-09 |
| PCK-01, PCK-06 | TC-PCK-01, TC-PCK-04 |
| PCK-02 | TC-PCK-01, TC-PCK-04 |
| PCK-03 | TC-PCK-03 |
| PCK-04 | TC-PCK-02 |
| PCK-05 | TC-PCK-03, TC-PCK-04 |
| PCK-07 | TC-PCK-05 |
| PCK-08 | TC-PCK-06 |
| PCK-09 | TC-PCK-07 |
| PCK-10 | TC-PCK-08 |
| PCK-11 | TC-PCK-09 |
| PCK-12 | TC-PCK-10 |
| NFR-01 | TC-INS-04 |
| WSP-01 | TC-WSP-05, TC-WSP-06 |
| WSP-02 | TC-WSP-01, TC-WSP-06 |
| WSP-03 | TC-WSP-02, TC-WSP-06 |
| WSP-04 | TC-WSP-03, TC-WSP-06 |
| WSP-05 | TC-WSP-04, TC-WSP-06 |
| WSP-06 | TC-WSP-06 |
| WSP-07 | TC-WSP-07 |
| MYD-01 | TC-MYD-01 |
| MYD-02 | TC-MYD-01 |
| MYD-03 | TC-MYD-01 |
| MYD-04 | TC-MYD-01 |
| MYD-05 | TC-MYD-02 |
| MYD-06 | TC-MYD-03, TC-MYD-04 |
| MYD-07 | TC-MYD-04 |
| MYD-08 | TC-MYD-04, TC-UI-17 |
| MYD-09 | TC-MYD-03 |
| MYD-10 | TC-MYD-05 |
| MYD-11 | TC-MYD-05 |
| MYD-12 | TC-MYD-05 |
| MYD-13 | TC-MYD-06 |
| MYD-14 | TC-MYD-07, TC-MYD-09 |
| MYD-15 | TC-MYD-07, TC-MYD-08, TC-MYD-10, TC-TVL-12 |
| MYD-16 | TC-MYD-07, TC-MYD-08 |
| MYD-17 | TC-MYD-07, TC-MYD-08 |
| MYD-18 | TC-MYD-07, TC-MYD-08 |
| MYD-19 | TC-MYD-08 |
| MYD-20 | TC-MYD-08 |
| MYD-21 | TC-MYD-08 |
| MYD-22 | TC-MYD-08 |
| MYD-23 | TC-MYD-07, TC-MYD-09 |
| MYD-24 | TC-MYD-07 |
| MYD-25 | TC-MYD-10 |
| HIS-01 | TC-HIS-01 |
| HIS-02 | TC-HIS-02 |
| HIS-03 | TC-HIS-02 |
| HIS-04 | TC-HIS-03 |
| HIS-05 | TC-HIS-04 |
| HIS-06 | TC-HIS-05 |
| HIS-07 | TC-HIS-04 |
| HIS-08 | TC-HIS-03 |
| HIS-09 | TC-HIS-04 |
| HIS-10 | TC-HIS-06 |
| HIS-11 | TC-HIS-06 |
| HIS-12 | TC-HIS-07 |
| HIS-13 | TC-HIS-08 |
| HIS-14 | TC-HIS-09 |
| HIS-15 | TC-HIS-10 |
| HIS-16 | TC-HIS-11 |
| ACT-01 | TC-ACT-01 |
| ACT-02 | TC-ACT-01, TC-ACT-09 |
| ACT-03 | TC-ACT-02 |
| ACT-04 | TC-ACT-03, TC-ACT-09 |
| ACT-05 | TC-ACT-02, TC-ACT-06, TC-ACT-09 |
| ACT-06 | TC-ACT-02, TC-ACT-03 |
| ACT-07 | TC-ACT-01 |
| ACT-08 | TC-ACT-04, TC-BKL-17 |
| ACT-09 | TC-ACT-05 |
| ACT-10 | TC-ACT-05, TC-ACT-07, TC-ATM-21 |
| ACT-11 | TC-ACT-06, TC-ACT-09 |
| ACT-12 | TC-ACT-07, TC-ACT-08 |
| ACT-13 | TC-ACT-08 |
| ACT-14 | TC-ACT-10 |
| ACT-15 | TC-ACT-11 |
| ACT-16 | TC-ACT-12 |
| ACT-17 | TC-ACT-13 |
| ACT-18 | TC-ACT-14 |
| ACT-19 | TC-ACT-15 |
| ACT-20 | TC-ACT-15 |
| ACT-21 | TC-ACT-16 |
| ACT-22 | TC-ACT-17 |
| OVW-01 | TC-OVW-01, TC-OVW-02, TC-OVW-03 |
| OVW-02 | TC-OVW-02 |
| OVW-03 | TC-OVW-01 |
| OVW-04 | TC-OVW-02 |
| OVW-05 | TC-OVW-03 |
| OVW-06 | TC-OVW-02 |
| OVW-07 | TC-OVW-01 |
| OVW-08 | TC-OVW-03 |
| CVA-01 | TC-CVA-02, TC-CVA-03 |
| CVA-02 | TC-CVA-01 |
| CVA-03 | TC-CVA-03 |
| CVA-04 | TC-CVA-01 |
| CVA-05 | TC-CVA-01 |
| CVA-06 | TC-CVA-03 |
| KPT-01 | TC-KPT-01 |
| KPT-02 | TC-KPT-02 |
| KPT-03 | TC-KPT-03 |
| KPT-04 | TC-KPT-01 |
| KPT-05 | TC-KPT-03, TC-GIT-11 |
| DPF-01 | TC-DPF-01 |
| DPF-02 | TC-DPF-02 |
| DPF-03 | TC-DPF-03 |
| DPF-04 | TC-DPF-04, TC-QV-40 |
| DPF-06 | TC-DPF-05 |
| DPF-05 | TC-DPF-04, TC-CNB-01 |
| DPF-07 | TC-DPF-06, TC-DPF-07 |
| DPF-08 | TC-DPF-07, TC-DPF-10 |
| DPF-09 | TC-DPF-08 |
| DPF-10 | TC-DPF-09 |
| DPF-11 | TC-DPF-10, TC-DPF-09 |
| DPF-12 | TC-DPF-11, TC-DPF-09 |
| CNB-01 | TC-CNB-01, TC-QV-40 |
| CNB-02 | TC-CNB-02 |
| EPS-01 | TC-EPS-01, TC-EPS-02 |
| EPS-02 | TC-EPS-01, TC-EPS-02 |
| EPS-03 | TC-EPS-03 |
| EPS-04 | TC-EPS-04 |
| EPS-05 | TC-EPS-03 |
| EPS-06 | TC-EPS-05 |
| EPS-07 | TC-EPS-05 |
| EPS-08 | TC-EPS-06, TC-EPS-01 |
| ADM-01 | TC-ADM-01, TC-ADM-02 |
| ADM-02 | TC-ADM-02 |
| ADM-03 | TC-ADM-01, TC-ADM-02 |
| ADM-04 | TC-ADM-02 |
| ADM-05 | TC-ADM-03, TC-QV-40 |
| STT-01 | TC-STT-01 |
| STT-02 | TC-STT-01, TC-STT-02 |
| STT-03 | TC-STT-03 |
| OND-01 | TC-OND-01, TC-OND-08 |
| OND-02 | TC-OND-01, TC-OND-08 |
| OND-03 | TC-OND-01, TC-OND-03 |
| OND-04 | TC-OND-01, TC-OND-03 |
| OND-05 | TC-OND-01, TC-OND-04 |
| OND-06 | TC-OND-04, TC-OND-18 |
| OND-07 | TC-OND-06, TC-OND-07 |
| OND-08 | TC-OND-02 |
| OND-09 | TC-OND-01, TC-OND-05 |
| OND-10 | TC-OND-08 |
| OND-11 | TC-OND-09, TC-OND-13, TC-CHT-21 |
| OND-12 | TC-OND-09, TC-OND-14 |
| OND-13 | TC-OND-10 |
| OND-14 | TC-OND-10, TC-OND-14 |
| OND-15 | TC-OND-09, TC-OND-13, TC-OND-14, TC-OND-49 |
| OND-16 | TC-OND-09, TC-OND-11 |
| OND-17 | TC-OND-12 |
| OND-18 | TC-OND-15 |
| OND-19 | TC-OND-16 |
| OND-20 | TC-OND-16, TC-OND-17 |
| OND-21 | TC-OND-16, TC-OND-17 |
| OND-22 | TC-OND-16, TC-OND-18 |
| OND-23 | TC-OND-16, TC-OND-18 |
| OND-24 | TC-OND-19 |
| OND-25 | TC-OND-16, TC-OND-20 |
| OND-26 | TC-OND-18, TC-OND-20 |
| OND-27 | TC-OND-21, TC-OND-23, TC-OND-25 |
| OND-28 | TC-OND-21, TC-OND-22 |
| OND-29 | TC-OND-21, TC-OND-03 |
| OND-30 | TC-OND-24, TC-OND-01, TC-OND-08 |
| OND-31 | TC-OND-26, TC-OND-27, TC-OND-33 |
| OND-32 | TC-OND-26, TC-OND-33, TC-OND-50 |
| OND-33 | TC-OND-28, TC-OND-33 |
| OND-34 | TC-OND-29 |
| OND-35 | TC-OND-30, TC-OND-33 |
| OND-36 | TC-OND-31, TC-OND-33 |
| OND-37 | TC-OND-32, TC-OND-33 |
| OND-38 | TC-OND-30, TC-OND-33 |
| OND-39 | TC-OND-34 |
| OND-40 | TC-OND-34 |
| OND-50 | TC-OND-40, TC-OND-43 |
| OND-51 | TC-OND-40, TC-OND-45 |
| OND-52 | TC-OND-40, TC-OND-41, TC-OND-45 |
| OND-53 | TC-OND-40, TC-OND-42 |
| OND-54 | TC-OND-40, TC-OND-42, TC-OND-43 |
| OND-55 | TC-OND-40, TC-OND-44 |
| OND-56 | TC-OND-40, TC-OND-41, TC-OND-42 |
| OND-57 | TC-OND-46 |
| OND-58 | TC-OND-46 |
| OND-59 | TC-OND-47 |
| OND-60 | TC-OND-48, TC-OND-46 |
| OND-61 | TC-OND-49, TC-CHT-13, TC-CHT-21 |
| OND-62 | TC-OND-50 |
| OND-63 | TC-OND-53, TC-OND-54 |
| OND-64 | TC-OND-51 |
| OND-65 | TC-OND-54 |
| OND-66 | TC-OND-52, TC-OND-54 |
| OND-67 | TC-OND-53, TC-OND-55 |
| OND-68 | TC-OND-58, TC-OND-59 |
| OND-69 | TC-OND-56, TC-OND-58, TC-OND-59 |
| OND-70 | TC-OND-56, TC-OND-58, TC-OND-59 |
| OND-71 | TC-OND-55, TC-OND-58 |
| OND-72 | TC-OND-56, TC-OND-57, TC-OND-58 |
| OND-73 | TC-OND-63, TC-OND-64, TC-OND-94, TC-OND-95 |
| OND-74 | TC-OND-60, TC-OND-63 |
| OND-75 | TC-OND-64 |
| OND-76 | TC-OND-62, TC-OND-63, TC-OND-94 |
| OND-77 | TC-OND-60, TC-OND-63 |
| OND-78 | TC-OND-61, TC-OND-65, TC-OND-96 |
| OND-79 | TC-OND-61, TC-OND-65 |
| OND-80 | TC-OND-63 |
| OND-90 | TC-OND-94 |
| OND-91 | TC-OND-90, TC-OND-94 |
| OND-92 | TC-OND-91, TC-OND-95 |
| OND-93 | TC-OND-90, TC-OND-92, TC-OND-94, TC-OND-95 |
| OND-94 | TC-OND-92, TC-OND-94 |
| OND-95 | TC-OND-93, TC-OND-94, TC-OND-95 |
| OND-96 | TC-OND-96 |
| OND-97 | TC-OND-94, TC-OND-95 |
| OND-98 | TC-OND-97 |
| OND-99 | TC-OND-94 |
| CON-103 | TC-OND-06, TC-OND-07, TC-OND-13 |
| CON-104 | TC-CON-65 |
| CON-105 | TC-CON-66 |
| STR-01 | TC-STR-03, TC-STR-06 |
| STR-02 | TC-STR-01, TC-STR-05, TC-STR-06 |
| STR-03 | TC-STR-04, TC-STR-05, TC-STR-06 |
| STR-04 | TC-STR-04 |
| STR-05 | TC-STR-02 |
| STR-06 | TC-STR-03 |
| STR-07 | TC-STR-07 |
| CON-106 | TC-PGB-06 |
| CON-107 | TC-DSH-13 |
| CON-108 | TC-CON-67 |
| PGB-01 | TC-PGB-01, TC-PGB-07 |
| PGB-02 | TC-PGB-01, TC-PGB-03, TC-PGB-04 |
| PGB-03 | TC-PGB-01, TC-PGB-02, TC-PGB-08 |
| PGB-04 | TC-PGB-01, TC-PGB-03, TC-PGB-11 |
| PGB-05 | TC-PGB-01, TC-PGB-09 |
| PGB-06 | TC-PGB-01, TC-PGB-04, TC-PGB-11 |
| PGB-07 | TC-PGB-11 |
| PGB-08 | TC-PGB-01, TC-PGB-05, TC-PGB-06 |
| PGB-09 | TC-PGB-05, TC-PGB-09 |
| PGB-10 | TC-PGB-05 |
| PGB-11 | TC-PGB-05, TC-PGB-09, TC-PGB-10 |
| PGB-12 | TC-PGB-01, TC-PGB-09, TC-PGB-10 |
| PGB-13 | TC-PGB-07 |
| PGB-14 | TC-PGB-02, TC-PGB-11 |
| PGB-15, PGB-16 | TC-PGB-12 |
| PGB-17 | TC-PGB-13 |
| PGB-18 | TC-PGB-14, TC-PGB-16 |
| PGB-19 | TC-PGB-15 |
| PGB-20 | TC-PGB-15 |
| PGB-21 | TC-PGB-16 |
| DSH-01 | TC-DSH-01, TC-DSH-02, TC-DSH-10 |
| DSH-02 | TC-DSH-01, TC-DSH-09 |
| DSH-03 | TC-DSH-01, TC-DSH-08, TC-DSH-11, TC-DSH-16, TC-TVL-12 |
| DSH-04 | TC-DSH-08, TC-DSH-16, TC-TVL-12 |
| DSH-05 | TC-DSH-01, TC-DSH-06, TC-DSH-07, TC-DSH-16 |
| DSH-06 | TC-DSH-01, TC-DSH-06, TC-DSH-10, TC-DSH-14 |
| DSH-07 | TC-DSH-01, TC-DSH-05 |
| DSH-08 | TC-DSH-01, TC-DSH-03, TC-DSH-04 |
| DSH-09 | TC-DSH-09, TC-DSH-12, TC-DSH-13 |
| DSH-10 | TC-DSH-01, TC-DSH-07, TC-DSH-11 |
| DSH-11 | TC-DSH-01 |
| DSH-12 | TC-DSH-01, TC-DSH-10, TC-DSH-15 |
| DSH-13 | TC-DSH-12, TC-CHT-15, TC-CHT-21, TC-DSH-15 |
| DSH-14 | TC-DSH-14 |
| DSH-15 | TC-DSH-15 |
| DSH-16 | TC-DSH-16 |
| CHT-01 | TC-CHT-01, TC-CHT-02, TC-CHT-11, TC-CHT-12 |
| CHT-02 | TC-CHT-07 |
| CHT-03 | TC-CHT-04 |
| CHT-04 | TC-CHT-01, TC-CHT-05 |
| CHT-05, CHT-06 | TC-CHT-06, TC-CHT-12 |
| CHT-07 | TC-CHT-07 |
| CHT-08 | TC-CHT-01, TC-CHT-10 |
| CHT-09 | TC-CHT-01, TC-CHT-02, TC-CHT-10 |
| CHT-10 | TC-CHT-01, TC-CHT-02, TC-CHT-09 |
| CHT-11 | TC-CHT-01, TC-CHT-02, TC-CHT-13 |
| CHT-12 | TC-CHT-01, TC-CHT-02, TC-CHT-08, TC-CHT-11 |
| CHT-13 | TC-CHT-03, TC-CHT-10, TC-CHT-11 |
| CHT-14 | TC-CHT-01, TC-CHT-12, TC-CHT-58 |
| CHT-15 | TC-CHT-13, TC-CHT-14, TC-CHT-16, TC-CHT-20 |
| CHT-16 | TC-CHT-13, TC-CHT-14, TC-CHT-16 |
| CHT-17 | TC-CHT-13, TC-CHT-15 |
| CHT-18 | TC-CHT-15, TC-CHT-16, TC-CHT-19 |
| CHT-19 | TC-CHT-15, TC-CHT-19 |
| CHT-20 | TC-CHT-15, TC-CHT-19, TC-CHT-20 |
| CHT-21 | TC-CHT-13, TC-CHT-16, TC-CHT-20 |
| CHT-22 | TC-CHT-14 |
| CHT-23 | TC-CHT-17 |
| CHT-24 | TC-CHT-18, TC-CHT-13 |
| CHT-25 | TC-CHT-21 |
| CHT-26 | TC-CHT-22, TC-CHT-29, TC-CHT-31 |
| CHT-27 | TC-CHT-22, TC-CHT-29 |
| CHT-28 | TC-CHT-24, TC-CHT-29, TC-CHT-30 |
| CHT-29 | TC-CHT-25, TC-CHT-29 |
| CHT-30 | TC-CHT-27, TC-CHT-29 |
| CHT-31 | TC-CHT-22, TC-CHT-26, TC-CHT-29 |
| CHT-32 | TC-CHT-22, TC-CHT-29 |
| CHT-33 | TC-CHT-26, TC-CHT-29 |
| CHT-34 | TC-CHT-29, TC-CHT-30 |
| CHT-35 | TC-CHT-22, TC-CHT-23, TC-CHT-30 |
| CHT-36 | TC-CHT-28 |
| CHT-37 | TC-CHT-28, TC-CHT-31 |
| CHT-38 | TC-CHT-31, TC-CHT-58 |
| CHT-39 | TC-CHT-31 |
| CHT-40 | TC-CHT-32, TC-CHT-37 |
| CHT-41 | TC-CHT-33, TC-CHT-37 |
| CHT-42 | TC-CHT-33 |
| CHT-43 | TC-CHT-35, TC-CHT-37 |
| CHT-44 | TC-CHT-34 |
| CHT-45 | TC-CHT-34 |
| CHT-46 | TC-CHT-34, TC-CHT-35, TC-CHT-37 |
| CHT-47 | TC-CHT-35, TC-CHT-36, TC-CHT-37 |
| CHT-48 | TC-CHT-36, TC-CHT-37 |
| CHT-49 | TC-CHT-35, TC-CHT-37 |
| CHT-50 | TC-CHT-36 |
| CHT-51 | TC-CHT-38, TC-CHT-41 |
| CHT-52 | TC-CHT-38, TC-CHT-41 |
| CHT-53 | TC-CHT-40, TC-CHT-41 |
| CHT-54 | TC-CHT-41 |
| CHT-55 | TC-CHT-39, TC-CHT-42 |
| CHT-56 | TC-CHT-39, TC-CHT-42 |
| CHT-60 | TC-CHT-50, TC-CHT-56, TC-CHT-57 |
| CHT-61 | TC-CHT-50, TC-CHT-56 |
| CHT-62 | TC-CHT-51 |
| CHT-63 | TC-CHT-52, TC-CHT-56 |
| CHT-64 | TC-CHT-53, TC-CHT-56 |
| CHT-65 | TC-CHT-50, TC-CHT-55, TC-CHT-56, TC-CHT-57 |
| CHT-66 | TC-CHT-55, TC-CHT-56, TC-CHT-57, TC-CHT-58 |
| CHT-67 | TC-CHT-53, TC-CHT-56 |
| CHT-68 | TC-CHT-54 |
| CHT-69 | TC-CHT-53 |
| CHT-70 | TC-CHT-58, TC-CHT-59 |
| CHT-71 | TC-CHT-58, TC-CHT-59 |
| CHT-72 | TC-CHT-58, TC-CHT-59 |
| CHT-73 | TC-CHT-58, TC-CHT-59 |
| TVL-01 | TC-TVL-04, TC-TVL-07 |
| TVL-02 | TC-TVL-01 |
| TVL-03 | TC-TVL-02 |
| TVL-04, TVL-05 | TC-TVL-02, TC-TVL-07 |
| TVL-06 | TC-TVL-03, TC-TVL-20, TC-TVL-24, TC-TVL-26 |
| TVL-07 | TC-TVL-04, TC-TVL-26 |
| TVL-08 | TC-TVL-03, TC-TVL-07, TC-TVL-09, TC-TVL-20 |
| TVL-09 | TC-TVL-05, TC-TVL-07, TC-TVL-09 |
| TVL-10 | TC-TVL-06, TC-TVL-07, TC-TVL-09, TC-TVL-20, TC-TVL-27 |
| TVL-11, TVL-12 | TC-TVL-06 |
| TVL-13 | TC-TVL-08 |
| TVL-14 | TC-TVL-09, TC-TVL-07, TC-TVL-11, TC-TVL-18 |
| TVL-15, TVL-16 | TC-TVL-10, TC-TVL-11 |
| TVL-17 | TC-TVL-11, TC-TVL-13 |
| TVL-18 | TC-TVL-12, TC-TVL-11, TC-TVL-20, TC-TVL-23 |
| TVL-19 | TC-TVL-16, TC-TVL-18 |
| TVL-20 | TC-TVL-14, TC-TVL-17, TC-TVL-18 |
| TVL-21 | TC-TVL-14, TC-TVL-15, TC-TVL-18 |
| TVL-22 | TC-TVL-16, TC-TVL-18, TC-TVL-28, TC-TVL-33 |
| TVL-23 | TC-TVL-19 |
| TVL-24 | TC-TVL-21 |
| TVL-25 | TC-TVL-22, TC-TVL-21 |
| TVL-26 | TC-TVL-23 |
| TVL-27, TVL-28 | TC-TVL-24, TC-TVL-25 |
| TVL-29 | TC-TVL-26, TC-TVL-27 |
| TVL-30 | TC-TVL-26, TC-TVL-27 |
| TVL-31 | TC-TVL-28, TC-TVL-18 |
| TVL-32 | TC-TVL-29, TC-TVL-31 |
| TVL-33 | TC-TVL-30, TC-TVL-18 |
| TVL-34 | TC-TVL-32, TC-TVL-18 |
| TVL-35 | TC-TVL-32, TC-TVL-18 |
| TVL-36 | TC-TVL-33, TC-TVL-18 |
| PIR-01 | TC-PIR-06 |
| PIR-02 | TC-PIR-01, TC-PIR-06 |
| PIR-03 | TC-PIR-02, TC-PIR-06 |
| PIR-04 | TC-PIR-06 |
| PIR-05 | TC-PIR-03, TC-PIR-05, TC-PIR-06 |
| PIR-06 | TC-PIR-04, TC-PIR-06 |
| IF-05 | TC-KPT-02 |
| NFR-02 | TC-STO-01 |
| NFR-03…05 | TC-DSK-02, TC-INS-01 |
| NFR-06 | TC-INS-02 |
| NFR-08 | TC-PERF-01 |
| NFR-09 | TC-CSP-01 |
| NFR-07 | TC-INS-01 |
| IF-01, IF-03, IF-04 | TC-INS-04 |
| IF-02 | TC-DSK-02 |

### Use-case coverage

| Use case | Test cases |
|---|---|
| UC-01 | TC-NAV-01…06, TC-NAV-33, TC-NAV-37, TC-UI-01, TC-UI-02, TC-UI-03, TC-CON-36, TC-CON-38, TC-NAV-38, TC-NAV-39, TC-NAV-40, TC-NAV-41, TC-NAV-42, TC-NAV-45, TC-NAV-46, TC-NAV-47, TC-NAV-48, TC-UI-09, TC-UI-10, TC-UI-11, TC-UI-12, TC-NAV-50, TC-SET-08, TC-NAV-51, TC-NAV-52 |
| UC-02 | TC-CON-01…07, TC-CON-17…19, TC-CON-44, TC-CON-28, TC-NAV-02, TC-NAV-34, TC-QV-14, TC-QV-16, TC-QV-23, TC-QV-24, TC-CON-46, TC-QV-25, TC-CON-47, TC-QV-38, TC-QV-39, TC-QV-40, TC-FET-11, TC-STR-02, TC-STR-03 |
| UC-03 | TC-CON-03, TC-FET-01…06, TC-FET-09 |
| UC-04 | TC-TWN-01, TC-TWN-02, TC-MON-01…06, TC-MON-09, TC-MON-10, TC-ATM-19, TC-BKL-18, TC-ACT-14, TC-ACT-15, TC-ACT-16, TC-ACT-17, TC-BKL-29, TC-BKL-30, TC-BKL-31, TC-BKL-33, TC-NAV-51 |
| UC-05 | TC-MON-07, TC-FET-11 |
| UC-06 | TC-ATM-01…11, TC-ATM-21, TC-ATM-22, TC-ATM-23, TC-TWN-03, TC-CON-20, TC-CON-33, TC-CON-34, TC-CON-43, TC-BKL-30, TC-BKL-31, TC-BKL-32 |
| UC-07 | TC-BKL-01…09, TC-BKL-34, TC-BKL-35, TC-BKL-36, TC-BKL-15, TC-BKL-16, TC-BKL-17, TC-BKL-18, TC-BKL-19, TC-BKL-20, TC-BKL-21, TC-BKL-22, TC-BKL-23, TC-BKL-24, TC-BKL-25, TC-BKL-26, TC-BKL-27, TC-BKL-28, TC-DPF-06, TC-NAV-36, TC-CON-23, TC-CON-25…27, TC-CON-29…32, TC-CON-35 |
| UC-08 | TC-QV-01…05, TC-FET-07, TC-CON-08, TC-CON-11…16, TC-QV-08, TC-QV-09, TC-QV-10, TC-QV-11, TC-QV-12, TC-QV-13, TC-QV-14, TC-QV-15, TC-QV-16, TC-CON-37, TC-CON-38, TC-CON-39, TC-CON-40, TC-CON-41, TC-QV-18, TC-QV-19, TC-QV-20, TC-QV-21, TC-QV-22, TC-CON-42, TC-QV-41, TC-QV-42, TC-CON-61, TC-NAV-51, TC-QV-43, TC-QV-44, TC-QV-45, TC-QV-46, TC-STR-01…07, TC-UI-13…16, TC-TVL-14…18 |
| UC-09 | TC-OV-11…15, TC-CAP-01, TC-CAP-02, TC-CAP-03, TC-CAP-08, TC-CAP-10, TC-CAP-11, TC-CAP-12, TC-CAP-13, TC-CAP-14, TC-CAP-15, TC-CAP-16, TC-CAP-17, TC-CAP-18, TC-CAP-19, TC-CAP-20, TC-CAP-21, TC-CAP-22, TC-CAP-23, TC-CAP-24, TC-CAP-25, TC-CAP-26, TC-CAP-27, TC-QV-17, TC-CON-21, TC-QV-10, TC-QV-11, TC-QV-21, TC-CHT-17, TC-CHT-19 |
| UC-10 | TC-OV-11 (Months, Streams), TC-OV-13 |
| UC-11 | TC-BAS-01…04 |
| UC-12 | TC-GIT-01…04, TC-GIT-05, TC-GIT-06, TC-GIT-07, TC-GIT-08, TC-ACC-03…05, TC-GIT-09, TC-GIT-10, TC-GIT-11, TC-GIT-12, TC-GIT-13, TC-GIT-14, TC-GIT-15, TC-GIT-16, TC-GIT-17, TC-GIT-18, TC-GIT-19, TC-GIT-20, TC-CON-62 |
| UC-13 | TC-SNP-01…03 |
| UC-14 | TC-SET-01…07, TC-CAP-02, TC-CAP-03, TC-NAV-34, TC-CAP-07, TC-CAP-09, TC-CAP-30, TC-CAP-31, TC-CAP-32, TC-CAP-33, TC-CAP-34, TC-UI-15…17 |
| UC-15 | TC-STO-01…04, TC-SNP-04 |
| UC-16 | TC-UPD-01, TC-UPD-02 |
| UC-17 | TC-DSK-01…03, TC-INS-02 |
| UC-18 | TC-SMP-01, TC-ATM-06, TC-GIT-04, TC-SMP-02 |
| UC-19 | TC-INS-04, TC-CI-01, TC-CI-02, TC-CI-03, TC-CI-07, TC-CI-08, TC-DOC-03 |
| UC-20 | TC-DOC-01, TC-DOC-02, TC-DOC-03, TC-DOC-04, TC-DOC-05, TC-DOC-06 |
| UC-21 | TC-SCR-01 |
| UC-22 | TC-ACC-01, TC-ACC-02, TC-CON-57, TC-CON-58, TC-CON-63, TC-CON-64, TC-CON-65, TC-CON-66, TC-PGB-06, TC-GIT-15, TC-MYD-07 |
| UC-23 | TC-QEM-01…08 |
| UC-24 | TC-PCK-01…10 |
| UC-25 | TC-WSP-01…07 |
| UC-26 | TC-MYD-01…05, TC-QV-31, TC-QV-47, TC-QV-48, TC-QV-32, TC-QV-33, TC-QV-34, TC-QV-35, TC-QV-36, TC-QV-37, TC-MYD-06, TC-UI-17, TC-MYD-07, TC-MYD-08, TC-MYD-09, TC-QV-49, TC-MYD-10 |
| UC-27 | TC-HIS-01…11 |
| UC-28 | TC-ACT-01…12, TC-BKL-16, TC-BKL-17, TC-BKL-18, TC-ATM-21 |
| UC-29 | TC-OVW-01…03 |
| UC-30 | TC-CVA-01…03 |
| UC-31 | TC-KPT-01…03 |
| UC-32 | TC-DPF-01…04, TC-DPF-05, TC-DPF-06, TC-DPF-07, TC-DPF-08, TC-DPF-09, TC-DPF-10, TC-DPF-11 |
| UC-33 | TC-CNB-01, TC-CNB-02 |
| UC-34 | TC-EPS-01, TC-EPS-02, TC-EPS-03, TC-EPS-04, TC-EPS-05, TC-EPS-06 |
| UC-35 | TC-ADM-01, TC-ADM-02, TC-ADM-03 |
| UC-36 | TC-STT-01, TC-STT-02, TC-STT-03 |
| UC-37 | TC-OND-01…34, TC-OND-40…65, TC-OND-90…97, TC-CHT-01…42, TC-CHT-50…59 |
| UC-38 | TC-PGB-01…16, TC-DSH-01…16, TC-CHT-02, TC-CHT-11, TC-CHT-13…27, TC-CHT-29…37, TC-CHT-39, TC-CHT-40, TC-CHT-42, TC-CHT-50…57, TC-CHT-59, TC-TVL-12, TC-TVL-23 |
| UC-39 | TC-TVL-01…33 |
| UC-40 | TC-PIR-01…06 |

## 8. Result record

Copy this table for each test run. Status is one of Pass, Fail, Blocked or Not run. Every Fail needs a defect ID.

| Test case | Build | Env | Tester | Date | Status | Defect / note |
|---|---|---|---|---|---|---|
| TC-… | | | | | | |
