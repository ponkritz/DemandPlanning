# I&D Quality Demand Planning — Test Plan

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

**TC-OV-11 Dashboard: period, filters and six tabs** — Req OV-11 — L1 `dashboard.test.mjs` (periods: a year with any quarters and months, none = whole year; month status against today; person-month plan, actual, capacity, region, role, plan lines and blank actuals; filters incl. stream; streams and month-on-month change); browser check on sample data at 1500 px and 390 px: the tabs Summary, Insights, Months, People, Streams and Definitions open without console errors or horizontal page scroll; Months switches Recorded / Planned and hides months without entries; People groups by person, role or region; Streams shows the Epic mix and the overrun and ad-hoc Pareto for the period; each tab shows an empty state when nothing is planned or recorded. **UAT**

**TC-OV-12 Rebalancing within role and month** — Req OV-12 — L1 `dashboard.test.mjs` ("overload, persistent overload, concentration and rebalancing within role and month"; "rebalancing leaves people without a role out of the relief and receiver lists, and counts them apart"); browser check: Summary → relief needs and receivers are full width, cut at 8 rows with "Show all (+N more)".

**TC-OV-13 Insights** — Req OV-13 — L1 `insights.test.mjs` (elapsed share; month-end forecast; plan accuracy; stream momentum; resilience; unusual months; health score); browser check: every Insights section has its Info text, and the Delivery section says the Dashboard filters do not apply there. **UAT**

**TC-OV-14 One utilization model from Settings** — Req OV-14 — L1 `dashboard.test.mjs` ("bandOf and plannedOverload follow the Settings thresholds"), `insights.test.mjs` ("the Settings bands decide what counts as over capacity and balanced"); browser check: with Settings → Capacity at 90 / 70, 92% shows ↑ red, 80% green and 65% ↓ blue on every tab, and differences in hours (+ / −) carry no colour.

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

**TC-NAV-33 Get started pop-up** — Req NAV-33 — L1 `setup-guide.test.mjs` ("release streams: DP's Pedestal and DHFI data sets count, and the missing ones are named"; "a first-time user: Git first, the rest waits for the step it depends on"; "partly set up: Git and the connection done, the PAT is next, then Fetch"; "fully set up: nothing required left; region and streams follow the facts and who may change them"); browser check: a new browser without data opens the pop-up by itself with "Connect the shared Git storage" as the next step and the PAT and fetch steps "After the step above"; "Open Storage settings" closes it and shows Settings → Storage; the top bar shows "Setup · 0/4" and reopens it; a reload opens it again; after "Don't show again automatically" a reload does not, the Setup button still does; at 390 × 844 nothing overflows. **UAT**

**TC-NAV-36 Background jobs** — Req NAV-36 — L1 `background-jobs.test.mjs` ("background jobs: run, report progress and the result; the same job is not started twice"; "… a failed result or a thrown error marks the job; Clear finished keeps the running ones"); browser check (QMS-0025 with a saved PAT): New Feature → Save closes the form at once and the top bar shows “⟳ 1 running” with its progress, then “✓ Jobs done” with “#id … Hierarchy complete”; the menu and other pages stay usable meanwhile; Bulk actions → Create month tasks and Move run the same way and their buttons wait while the job runs; Monthly Time Writing → Save leaves a failed Task staged; reloading while a job runs asks first.

**TC-NAV-34 Settings editors as pop-ups** — Req NAV-34 — browser check: Settings → Storage shows the Git storage and SharePoint summaries; "Connect Git storage…" and "Connect to SharePoint…" open pop-ups, a click beside them keeps them open, Cancel closes them; Settings → Azure DevOps: Edit on the Time Writing row and "＋ Add server" open pop-ups; Settings → Capacity & periods: "Edit capacity settings…" opens the form in a pop-up; "＋ Map an Epic or Feature…" maps #424242 and closes, the mapping's Edit opens "Change the mapping of #424242"; Settings → Feature setup: Go to Epic #13946 → the summary and "View setup…" (no Git) open "Shared Feature setup · Epic #13946", Close closes it; every pop-up form is one column (title, input, explanation per field) with Cancel then the main action at the bottom right; at 390 × 844 the connection pop-up fits without horizontal scrolling; no page errors. **UAT**

**TC-CON-28 Work email required for Time Writing** — Req CON-60, CON-02 — browser check: a saved Time Writing connection without an email shows "Work email missing: Edit to add it" in the Stream mapping; Edit → Save without the email is blocked ("Please fill out this field"); with me@company.com it saves, the pop-up closes, the connection stores the email and the hint disappears; in the form at 1300px the PAT and email titles are one line and the inputs of each row line up. **UAT**

**TC-CON-29 All shared Feature setups** — Req CON-61 — L1 `feature-setup.test.mjs` ("all shared setups: by Epic number, with stories, Time Writing story, Task and whether mine replaces it"); browser check with a shared setup of Epics #37810 (two stories, 8h estimate) and #13946 (no stories) in this browser and no Git: "All shared setups (2 Epics, as last loaded in this browser)" lists #13946 first with None, then #37810 with both stories in order and "8h estimate"; Open on #37810 shows "Shared Feature setup · Epic #37810 Digital Platform" with two User Story rows; no page errors.

**TC-CON-30 Edit shared setups in the list** — Req CON-62 — L1 `feature-setup.test.mjs` ("editing in the list: change one Epic in a copy, remove one, leave Epics without a setup alone"); browser check with GitHub mocked (writable token, feature-setup.json with #13946 and #37810, whose first story has a description): both rows offer Edit; on #37810 change story 1, add "IQOQ : Review" and move it up, set the Task title and estimate 6, Done → the row shows the new values and "Changed · not yet in Git"; Edit and Remove #13946 → one row left; Save to Git → one PUT of feature-setup.json "Update the shared Feature setup of Epics #37810, #13946" with only #37810, stories PRD (description kept), IQOQ, SFV, Task "{month} | {service}" 6h; "saved to Git (2 Epics)" with View commit; the bar disappears; no page errors. **UAT**

**TC-CON-31 Feature DoD in the Feature setup** — Req CON-63 — L1 `feature-setup.test.mjs` ("Feature DoD in a setup: kept through save, built-in defaults, and required for new or changed setups"); browser check with GitHub mocked (writable token; shared setups #13946 and #37810 without a DoD): the list's Feature DoD column shows "Missing"; Edit #37810 and change story 1 → Save to Git disabled with "The Feature DoD is mandatory: add it for Epic #37810 to save."; typing the DoD enables it; the commit holds the DoD; Go to Epic #50000 → Create setup… → add a story → Save disabled with the same message for #50000; with "DT finished." it saves, the pop-up closes and the summary reads DoD “DT finished.”. **UAT**

**TC-CON-32 Delete a Feature setup** — Req CON-64 — browser check (same mock): Delete on row #13946 (view mode) → one row left, saved with Save to Git in one commit with #37810 only; "Delete setup" next to Epic #50000's summary → confirmation → commit "Delete the shared Feature setup of Epic #50000" leaving only #37810. **UAT**

**TC-CON-33 Links in Bulk actions** — Req CON-65 — browser check with the synthetic sample: Bulk actions, choose a person with a pending Feature → its row in the Time Writing tasks shows "#100002" as a link to …/_workitems/edit/100002 (target _blank); clicking it opens a new tab and leaves the checkbox unchanged; State checks and Move to current PI + Sprint rows use the same link; no page errors.

**TC-CON-34 Time Writing story paths in the setup** — Req CON-66 — L1 `feature-setup.test.mjs` (rows carry the story's Area and Iteration Path); browser check with GitHub mocked: the row of #37810 shows "Area: the Feature’s · Iteration: project root"; Edit → set Area Path "QMS\Quality Engineering" and Iteration Path "QMS" (with the DoD) → Save to Git → the saved story holds both and the row shows them; the setup pop-up's placeholders say "Empty: the Feature's Area Path" and "Empty: the project root … (no PI, Sprint or year)".

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
  - `windchill-analysis/<id>-locations.json` exists in the data repository with the unique locations and releases, and holds no document rows; the page says "Saved to Git (windchill-analysis/<id>-locations.json)".
  - From Document name the result is the CON-71 one: with this fixture's plain names only the clubbed document counts, as one release ("1 release · 1 of 7 documents · 1 clubbed · from Document name").

**TC-CON-27 Map a Feature setup to an Epic** — Req CON-59 — L1 `feature-setup.test.mjs` ("built-in stories as a setup give exactly the titles of the built-in creation"; "copy a setup to another Epic: replaces the target, keeps the source, no-op without a source"); browser check with a writable Git store holding a personal setup of another Epic: My setup shows it with "applies now" on step 1; "Copy this setup to Epic #" 13946 → the four stories appear under #13946 and the panel says "changed here, not saved yet"; Save to Git commits `feature-setup/<email>.json` holding both Epics and the panel then marks My setup as applying to #13946; "Go to Epic #" another number with no setup offers the two built-in buttons. **UAT**

**TC-CON-26 Personal and shared Feature setup** — Req CON-58, CON-52 — L1 `feature-setup.test.mjs` (one file per email with unsafe characters and runs of dots replaced; my setup of an Epic wins for me, the shared one otherwise, and the form can switch; Enable for everyone replaces only that Epic, as a copy); browser check: Settings → Feature setup opens for every role; with an email on the Time Writing connection it shows My setup and Shared (everyone), else only Shared with a notice; "Start my own from the shared one", "Remove my setup" and "Enable for everyone" save to Git with a writable token. **UAT**

**TC-NAV-22 Default streams and stream rules** — Req NAV-22, NAV-23 — L1 `streams.test.mjs` (stream order and sources; connection and export found by name; DP and IOCC release rules; fuzzy match percentages and the threshold; Pulse Check lists the five Azure streams in order with not-set-up ones); browser check on sample data: Release Details lists DP, CP, IOCC, Content, Tool Validations and S&S IT; a not-set-up stream opens Settings, whose Default streams Set up pre-fills the name and role; Pulse Check → Current month releases shows the five Azure streams in order. **UAT**

**TC-NAV-20 Pulse Check: Release Details and Last month** — Req NAV-20 — L1 `release-overview.test.mjs` (only the given Release Details views, each shown even when not fetched; a release source outside Release Details left out), `pulse-check.test.mjs` (previous month across the year; releases compared per stream; Features and User Stories opened and closed per Epic, absence and Removed left out, narrowed to a person); browser check on sample data: the tabs Releases and Last month; Last month shows the utilization metrics, Releases vs the selected month, Work closed and opened, the Overview month panels and the gaps for the previous month. **UAT**

**TC-CON-25 Configurable Time Writing story** — Req CON-57 — L1 `azure-devops.test.mjs` (a setup file without it keeps “{feature} - Time Writing”; a configured title, Area Path, Iteration Path and assignee are used and the month Task goes under that story). **UAT**

**TC-NAV-17 Menu groups and collapsing** — Req NAV-17, NAV-18, OV-10 — L1 `format.test.mjs` (Data Insights holds Overview, Pulse Check, PI Review; My Work order Assigned to Me, Monthly Time Writing, Bulk actions); browser check on sample data: the menu shows the five headings; Pulse Check shows the month's releases (Overview keeps This month and Trends); collapsing My Work and Windchill exports hides them and stays so after a reload; at 900 px width every page is still reachable. **UAT**

**TC-CON-23 Feature setup per Epic** — Req CON-52, CON-53 — L1 `azure-devops.test.mjs` (placeholders, plain text, unknown braces kept, missing values; the file is parsed and written clean; a Feature from its Epic setup gets the chosen stories, the Time Writing story and the Task with title, Original Estimate, Area Path, Iteration Path and assignee; completing again creates nothing; a placeholder the title cannot fill stops it); browser check with GitHub and Azure DevOps mocked: Settings → Feature setup, add “US 1 ({service})” and “US 4”, Original Estimate 6 → preview shows “US 1 (Service)”; Save to Git writes feature-setup.json; ＋ Feature under that Epic with “CP | Care Pathways | v3.1” lists “US 1 (Care Pathways)” and “US 4” ticked, the Task “October 2026 | CP | Care Pathways | v3.1” with 6 h, and no PU / Full Release choice. **UAT**

**TC-ATM-08 State checks and Feature / User Story states** — Req CON-54, ATM-06 — L1 `my-work.test.mjs` (all stories Closed → close the Feature, Removed ignored; all Tasks Closed → close the story; Active Feature without an Active story, or without stories → flagged; Closed Features, other people's work and the absence Epic left out; Feature New → Set to Active, Active → Close, other states → none; other types → Close); browser check with Azure DevOps mocked: Bulk actions for Ben lists his two Active Features without User Stories with a link to Azure DevOps; Assigned to Me shows Close Feature for Active Features. **UAT**

**TC-CON-24 Load everything from Git; roles by the connection email; QE Mapping** — Req CON-55, CON-41, NAV-19 — browser check with GitHub mocked: Settings → Storage → Load everything from Git reads planning-data.json, azure-views.json, azure-data, windchill-data, access.json and feature-setup.json once each and lists what was loaded; Settings → Access says "You are me@x.com (the email on your Time Writing connection)"; QE Mapping appears under Data & governance (its content: TC-QEM-04). **UAT**

**TC-ACC-01 Roles and access** — Req CON-41, CON-42, CON-43, CON-44 — L1 `access.test.mjs` (no policy = no restrictions; union of roles; default role for unknown or unlisted email; no default role = nothing; Backlog Health only for its roles; unknown roles, areas, actions and invalid emails dropped; broken file refused; the editor cannot remove their own "manage access"; a role without "change work items" is refused before anything is sent while reads still work); browser check with mocked GitHub and Azure DevOps: email shown from the connection's email field, Set up roles → add a member, tick Scrum Master → Save to Git commits access.json once; with a cached Team Member policy the menu has no Backlog Health, Bulk actions, Release Details, Baselines or Snapshots and Settings shows only Azure DevOps, Storage and Access. **UAT**

**TC-ACC-03 Add members by name** — Req CON-74 — browser check with the Time Writing backlog loaded: Settings → Access → Choose a person lists the people Assigned To an item in QMS-0025 by name (members already listed left out; two people with the same name show their email); pick one and Add member adds their email with the everyone-else role; the table shows the name with the email under it, sorted by name; Other (enter an email)… shows the email field and adds a person not in the backlog; without the backlog loaded only the email field and the hint are shown.

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

**TC-CON-41 Windchill releases: header month, sorting and column widths** — Req CON-73 — **UAT** — L1 `windchill-releases.test.mjs` ("the header month filter keeps the releases whose latest date falls in that month (CON-73)"); E2E `documents-and-data.e2e.mjs` ("TC-CON-41": with the header month 2026-10 the export lists the October releases, 2026-08 only CareLink, All months all; clicking Release name sorts A→Z, again Z→A; a heading has a resize handle).
- Steps:
  1. Import `e2e/fixtures/windchill-export.csv`; set the header month to 2026-10, then 2026-08; choose Show → All months.
  2. Click the "Release name" heading twice; click "Latest Last Modified".
  3. Drag the handle at the right edge of "Release name" to the left; reload; press Reset widths.
- Expected:
  - The header shows the month picker on the export page. For 2026-10 the count reads "4 of 5 releases with the latest Last Modified in October 2026 · 5 documents"; for 2026-08 "1 of 5 … August 2026 · 1 document" (CareLink 3.2); All months lists all 5.
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

**TC-MON-08 Ad-hoc tag on Tasks created after the lock** — Req MON-20 — L1 `planning-lock.test.mjs` ("planning lock: the 5th by default…", "ad-hoc after the lock…"), `azure-devops.test.mjs` ("after the planning lock, a new Time Writing Task…"), `my-work.test.mjs` ("Bulk month Tasks after the planning lock…"); browser check:
- Pre: planning of the current month locked (after the 5th, or locked in Settings).
- Steps: (1) New Feature on an Epic: the Time Writing section says the new Task is tagged `ad-hoc`; Save. (2) Bulk actions → Create month tasks: the confirmation says so; confirm.
- Expected:
  - The new month Tasks carry the tag `ad-hoc`; the Feature and User Stories do not; the job result names the tag.
  - An existing month Task that is reused is not tagged.
  - With planning open (or extended in Settings), nothing is tagged.

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

**TC-ATM-09 Expand a Feature, then a User Story** — Req ATM-17 — L1 `my-work.test.mjs` ("featureChildren: stories, bugs and tasks under a Feature with their own children, any person, Removed left out"); browser check on sample data (person Ana Costa): ▸ on the Feature shows only its User Stories (and items placed straight under it), no Tasks; ▸ on a User Story then shows its Tasks with planned and recorded hours, and ▾ hides them again; a story without Tasks has no ▸; my New or Active items keep their action, other people's show "Not mine"; ▾ on the Feature closes it all.

**TC-ATM-10 Month tasks: show with / without task, select all** — Req ATM-18 — browser check on sample data: the switch Without task / With task / Both filters the list and shows its counts; Select all and Deselect all act only on the shown Features whose task can be created and the "N of M selected" count follows; with nothing creatable both buttons are disabled.

**TC-ATM-11 New Feature and Complete children on Assigned to Me** — Req ATM-19, BKL-10 — L1 `my-work.test.mjs` ("Complete children only for a Feature without optional User Stories"); browser check: ＋ New Feature opens the board's "Add Feature under an Epic" editor with the Epic selectable; Complete children shows only on a Feature with no User Story other than its Time Writing story; both are disabled with sample data; after a real create the result shows as a notice and the data refreshes. **UAT**

**TC-ATM-12 Close follow-up: User Stories with the Feature, the Feature with the last User Story** — Req ATM-20 — L1 `my-work.test.mjs` ("closing a Feature offers its open User Stories; closing the last open User Story offers the Feature (ATM-20)": open stories only, the last-story rule, Closed Features and Tasks left alone, the staged states, the question texts; the chain writes each item in order when confirmed, nothing when declined, reports a Resolved Feature and a failed write, sets a New Feature to Active then Closed); browser check (QMS-0025, own test items): Close Feature → the prompt lists its open User Stories → OK closes them and the log says so; close the last open User Story → the prompt offers the Feature → Cancel leaves it open.

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
  - The PU Feature DoD and SFV, DT and IQOQ stories are offered. Full Release offers PRD as well (see TC-BKL-04 for the DoD).
  - Without a creator email, the BKL-09 message shows.
  - With a schedule that is no longer current, the BKL-08 message shows and nothing is written.
  - Success creates the Feature (assigned to the creator email), the selected milestone stories titled "SFV : Review of Deliverables (Core 5.2)" and so on, the Time Writing story, and the month Task. All are verified, and the BKL-11 message shows.

**TC-BKL-03 Complete children** — Req BKL-10 — L1 `my-work.test.mjs` ("Complete children only for a Feature without optional User Stories")

**TC-BKL-04 Feature DoD mandatory** — Req BKL-13 — L1 `azure-devops.test.mjs` ("the Feature DoD is mandatory: composed into the Description, and creation is refused without one"), `feature-setup.test.mjs` ("Feature DoD in a setup: kept through save, built-in defaults, and required for new or changed setups"); browser check with Azure DevOps mocked (Time Writing connection with email and PAT, one Epic): Assigned to Me → ＋ New Feature opens "Add Feature under an Epic" with "Feature DoD" = "DT finished. This is a PU release."; clearing it disables "Create Feature and children" with the title "Enter the Feature DoD first"; the release view's Create Feature is disabled until a DoD is typed. **UAT**

**TC-BKL-09 Title fields in New Feature** — Req BKL-18 — L1 `azure-devops.test.mjs` ("a Feature from a setup with title fields: the typed values fill {Field} placeholders, also with a blank field"; "Release Classification: optional …": the field lines follow it), `feature-setup.test.mjs` ("title fields per Epic …": title, Description lines, on-prem values); browser check (QMS-0025, a CP Epic whose setup has Platform, Release Name, Number): New Feature shows the three inputs and the title follows them; Save gives the Description "Platform : …", "Release Name : …", "Number : …" below the Release Classification; Release Details → Create Feature on a CP release fills the fields from its on-prem items; with the fields only in the shared setup and a personal setup of the Epic, the form says so and “Use the shared setup” shows them.

**TC-BKL-10 New User Story under a Feature** — Req BKL-19 — L1 `my-work.test.mjs` ("New User Story under a Feature: the Azure DevOps story fields …"); E2E `backlog.e2e.mjs` ("TC-BKL-10: ＋ User Story on a Feature opens the New User Story form …"); browser check with a test project:
- Steps: (1) Backlogs → Expand all → ＋ User Story on a Feature. (2) Enter a title, keep the Sprint, set Story Points 3, Priority 2, Risk 2 - Medium, Value area Business; Save. (3) Repeat from Assigned to Me.
- Expected:
  - The form shows the Feature as parent, Assigned to, State New, the Feature's Area, PI → Sprint, Description, Acceptance criteria, Planning and Classification; Save stays disabled without a title or Sprint.
  - The form closes at once; the top bar shows the job; the story appears under the Feature in the Sprint with the values entered, assigned to the person chosen.
  - A Priority, Risk or Value area outside the lists, or Story Points on a Task, is refused by both transports before anything is sent.

**TC-CON-44 DP and DHFI defaults** — Req CON-76 — L1 `connections.test.mjs` ("pre-filled connections from the shared setup …": DP reads the Release work items of DHP with DDTDate, SourceProgram, PsName and Release; DHFI [Approved] reads the DHP.Vault documents, hidden from the menu); browser check in a fresh browser with only the on-prem PAT: Settings → Azure DevOps → Stream mapping → Set up DP, Pedestal and DHFI from their defaults; Release Details → DP lists Release items for the DDT month; Get started shows the release streams step done.

**TC-CON-43 Title fields in the Feature setup** — Req CON-75 — L1 `feature-setup.test.mjs` ("title fields per Epic: up to five, unique names, saved with the setup …"); browser check with GitHub mocked: Settings → Feature setup → an Epic → ＋ Add title field three times (Platform / Custom.Platform, Release Name, Number), the preview of a story titled "{Platform} review" with the sample "CP 2 | Atlas | 4.1" shows "CP 2 review"; Save to Git writes titleFields; a sixth field cannot be added.

**TC-BKL-08 Release Classification in the Description** — Req BKL-17 — L1 `azure-devops.test.mjs` ("Release Classification: optional, always written below the Feature DoD in the Description"); browser check (QMS-0025, connection with a saved PAT): New Feature shows Release Classification under Planning for an Epic with a setup and one without; choosing Platform Update and saving gives the Feature a Description starting "Feature DoD: …" followed by "Release Classification : Platform Update"; leaving it blank gives "Release Classification :"; the children created are the same either way.

**TC-BKL-07 New Feature form in the Azure DevOps layout** — Req BKL-16 — L1 `npx tsc -b` and `my-work.test.mjs` (the creation paths it calls are unchanged; TC-BKL-02…06 still pass); browser check (QMS-0025, connection with a saved PAT): ＋ New Feature opens “New Feature” with the title on top and the Parent Epic and Release Classification side by side above it, as wide as the title; the strip shows you, New, the Epic’s Area and the current PI → Sprint already chosen; no PAT field is shown; the DoD is prefilled from the setup; Child work items is shown open, headed “n will be created or checked”; there is no Milestone set field; Save creates the same hierarchy as before; at phone width the form fits without sideways scrolling.

**TC-BKL-06 Built-in Review of Deliverables story** — Req BKL-15 — L1 `azure-devops.test.mjs` ("… always creates Time Writing and the month task": the story "Review of Deliverables - <Feature>" is created by default for PU and Release with and without milestones, in the Sprint; "partial hierarchy …": completion adds it; "a Feature from its Epic setup …": it follows the optional stories; "the Time Writing story without set paths …": it goes to the chosen Sprint, and unticked it is not created on either path), `feature-setup.test.mjs` ("built-in stories as a setup …": the title is not part of the setup); browser check: New Feature offers it unticked beside the ticked milestone / optional stories; ticking it clears them, ticking a story clears it, Deselect all clears all of them (it included); without stories to offer it is ticked; after creation the Feature has the story in the current Sprint; unticked, the Feature is created without it; Complete children with it ticked on a Feature without it adds it.

**TC-BKL-05 Time Writing story not tied to a Sprint** — Req BKL-14 — L1 `azure-devops.test.mjs` ("… always creates Time Writing and the month task" for PU and Release: review stories in the PI, the Time Writing story at the project root; "new Feature is assigned to the configured creator email, review stories to the Sprint, the Time Writing story and task to the project root"; "the Time Writing story without set paths: the project root iteration (no PI, Sprint or year) and the Feature area; an existing one is reused wherever it is"), `my-work.test.mjs` (a new Time Writing story from Bulk actions at the project root; "move candidates …": Time Writing stories are never moved); browser check: New Feature shows "Time Writing User Story → QMS (not the PI or Sprint)" in Dates and paths. **UAT**
- Steps:
  1. On a Feature with only its Time Writing story (or no story), choose "Complete children".
  2. Look at a Feature that already has an optional User Story (SFV, DT, a setup story, …).
- Expected:
  - Step 1 creates only the missing items, and the Feature is not recreated.
  - Step 2 shows no "Complete children" button, on the board and on Assigned to Me.

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

**TC-QV-06 Create Feature from a release** — *(Retired — see TC-QV-16)* Req QV-20, CON-56 — L1 `release-source.test.mjs` ("tracking is an exact match of name and release segments in a Feature title"); browser check: a release without a tracking Feature offers Create Feature; a title that no longer names the release is refused; the confirmation offers the person picker, defaulting to the person creating it. **UAT**

**TC-QV-07 Create Feature title parts** — *(Retired — see TC-QV-16)* Req QV-21 — L1 `release-source.test.mjs` (test removed with the separate form); browser check (needs a DP and a CP connection): DP shows Program, Service and Release, giving "DP | <name> | v<release>"; CP shows a Platform list with Platform 1.0 and Platform 2.0, and "Add…" adds a platform kept in this browser; changing a part rebuilds the title, which stays editable.

**TC-QV-08 DP shows only its query** — Req QV-22 — L1 `query-view.test.mjs` ("column chooser: hidden columns left out in the query order, never all of them, remembered per view"); browser check with Azure DevOps mocked (a release-source connection "DP" whose query selects ID, Title, State, Custom.ReleaseType, Target Date and Area Path; three Release items): Release Details → DP → Fetch → the table has exactly ID, Title, State, Release Type, Target Date, Area Path; no "Time Writing Feature", DHFI or Pedestal text; "Columns (6 of 6)" → untick Area Path → "Columns (5 of 6)" and the column is gone; after a reload it stays hidden; CP still shows its Releases list. **UAT**

**TC-QV-09 Bare field names with a prefix** — Req QV-23 — L1 `query-view.test.mjs` ("a bare field name finds its prefixed reference name (\"SourceProgram\" → Custom.SourceProgram), only when exactly one field ends with it"); browser check with Azure DevOps mocked: a DP query selecting [SourceProgram] over items whose field is Custom.SourceProgram shows RSGMS, RSGMS, DHP in that column, with and without the project's field list (before the fix the column was blank).

**TC-QV-10 DP: DDT month, Completed and Supported Releases** — Req QV-24, QV-25 — L1 `dp-milestones.test.mjs` ("DP counts for a month: Completed = releases with DDT Done in the month; Supported = unique releases with any milestone Done in the month"; "Supported Releases are unique by PsName + Release: two rows of the same release count once; rows without them by work item"; "the DP table month is the DDT Date month; a row without DDT Date has none; release name from PsName and Release"), `streams.test.mjs` ("Pulse Check streams: …": DP supported 1, title "SFV · DT Done"; the same release supported in two months counts once over the period; the Dashboard's streamCounts per month and in total); browser check with Azure DevOps mocked (DP query with PsName, Release and the eight milestone fields; #501 DDT Done 5 Oct + DRfH Done 2 Oct, #502 DDT In Progress 20 Oct + DRPC Done 21 Oct, #503 DDT Done 3 Nov + DRPE Done 8 Oct, #504 DDT Done 10 Sep): DP in October shows "Month filter: by DDT Date", rows 501 and 502, "Completed Releases · October 2026: 1", "Supported Releases: 3" with "4 milestones: DT 1 · SFV 1 · PRD 1 · RPE 1" and the three releases counted, #501 once with SFV and DT; Pulse Check → September: DP 1 completed · 1 supported (Release 504, DT Done); Current month (October): DP 1 completed · 3 supported with three titles; no page errors. **UAT**

**TC-QV-11 DP milestone names and query scope** — Req QV-26 — L1 `dp-milestones.test.mjs` ("DP milestones carry the team names: DT, SFV, PRD, RPE"), `streams.test.mjs` (titles "SFV Done", "DT Done"); browser check with Azure DevOps mocked (DP query rows from two projects): the Supported Releases hint reads "DT n · SFV n · PRD n · RPE n", "What was counted" shows "DT · Design Transfer · Completed", "SFV · Start of Verification / Start of Hardening", the legend lists all four names, and rows of both projects are shown and counted.

**TC-QV-12 Rich-text cells as plain text** — Req QV-27 — L1 `query-view.test.mjs` ("rich-text values (Acceptance Criteria) show as text: tags removed, entities decoded, lines joined"); browser check with Azure DevOps mocked (a query with [Microsoft.VSTS.Common.AcceptanceCriteria] holding `<div><b>Given</b>…</div>`): the cell reads "Given … · When … · Then …" with no tags, the hover shows the same, the CSV holds the text; no page errors.

**TC-QV-13 View notes behind Info** — Req QV-28 — browser check with Azure DevOps mocked (DP view, October, a Git save note): no info banners above the counts; the ⓘ Info next to "DP" lists "Month filter: by DDT Date in your time zone." and the legend "DT = Design Transfer (DDT) · SFV = … · PRD = … · RPE = …"; a fetch error still shows as a banner; no page errors.

**TC-QV-14 DP rows matched to the QMS-0025 board** — Req QV-29 — L1 `dp-board-match.test.mjs` ("DP row → QMS-0025: SourceProgram + Title, or Title alone when the board title has no SourceProgram"; "name and version must both match: another version or none on the board stays below 80%"; "no match at 80%: the closest item is kept as a hint; nothing in common is no match"; "a new Feature title maps back when it holds the Title; the service part drops the version"); browser check with Azure DevOps mocked (QMS-0025 board with a Feature and a User Story naming one DP row's Title, one DP row without a match): the matched row shows "Feature id n%" and "Story id n%" as links; the other shows "no match" and Create Feature, whose opens the default Create Feature form (TC-QV-16); the CSV holds the "QMS-0025 match" column; no page errors. **UAT**

**TC-QV-15 Rearrange the DP columns** — Req QV-30 — L1 `query-view.test.mjs` ("column order: saved order first, new query columns keep their place; move by drag or one step"); browser check with Azure DevOps mocked (DP view): dragging the Title heading onto the first heading makes Title the first column; dragging "QMS-0025 match" onto the second heading puts it second with its cells; Columns → "Move ID right" moves ID one step; the order is kept after a reload; "Query order" restores the query's order with QMS-0025 match last; no page errors.

**TC-QV-16 Create Feature from Release Details opens the default form** — Req QV-31, CON-56 — L1 `dp-board-match.test.mjs` ("Create Feature from a DP row: Program (SourceProgram, else DP) | PsName | vRelease, falling back to the Title"), `release-source.test.mjs` ("Create Feature title from a release: \"Stream | Name | vRelease\", mapping back to the release"); browser check with Azure DevOps mocked (QMS-0025 board with Epic #700 "DP"; DP row #502 SourceProgram DHP, PsName DoseNav, Release 2.1, no match): Create Feature opens "Add Feature under an Epic" with Parent Epic "#700 · DP" and the title "DHP | DoseNav | v2.1"; without a Time Writing connection the button is disabled and says so; no page errors. **UAT**

**TC-QV-17 Supported Releases section in Pulse Check** — Req QV-32, QV-24, QV-25 — L1 `dp-milestones.test.mjs` (the two unique-release tests), `streams.test.mjs` ("Pulse Check streams: …"); browser check with Azure DevOps mocked (the TC-QV-10 data): Pulse Check → Current month releases (October) shows "Supported Releases · DP · October 2026" with "3 releases · 4 milestones", #501 RSGMS 3.0.0.2 once with SFV and DT chips and "Completed (DT)"; the Releases tab (September) shows #504 with DT; no page errors.

**TC-QV-18 Supported summary next to Releases, with S&S IT** — Req QV-33 — **UAT** — L1 `windchill-releases.test.mjs` ("Pulse Check Supported line: the export's releases with the latest date in the month, \"name number\", newest first (QV-33)"); E2E `documents-and-data.e2e.mjs` ("TC-QV-18": an S&S IT export imported, Pulse Check → Releases with the header month 2026-11 (the tab shows the month before) shows "SUPPORTED · October 2026 · 4 supported releases" with "S&S IT [4] : …", and for 2026-09 "S&S IT [1] : CareLink 3.2").
- Steps:
  1. Import the S&S IT export (`e2e/fixtures/windchill-export.csv`, named "S&S IT"); with a DP connection fetched (TD-02), open Pulse Check → Releases; set the header month.
- Expected:
  - Next to the RELEASES summary a SUPPORTED summary lists, per stream and in the same format, "DP [n] : name release, …" (its Supported Releases) and "S&S IT [n] : name number, …" (the export's releases whose latest Last Modified is in the month), with the total in the title; a stream without any shows "none".


**TC-QV-19 Tool Validations: unique tools in the month** — Req QV-34 — L1 `streams.test.mjs` ("Tool Validations: one entry per tool, whatever the number of its documents (QV-34)"); browser check with the Tool Validations connection fetched (TD-02 fixture: five documents in October — Minitab Validation Plan / Protocol / Report under Area Path "…\Tool Validations\Minitab", "JIRA Cloud v9.4 Validation Protocol" and "… Report" under "…\Tool Validations") → Pulse Check → Releases (header month November, the tab shows October) shows "Tool Validations [2] : JIRA Cloud 9.4, Minitab", the Supported summary the same line (October, the tab's month — never the header month's data), the quadrant 2 releases · 5 documents, and the Dashboard delivery table 2 for October; with the header month set to October the Releases tab shows September (0 tools in both summaries) and the Current month releases tab shows the two tools in both summaries.

**TC-QV-20 Tool Validations view without the summary strip** — Req QV-35 — browser check: Release Details → Tool Validations (TD-02 fixture) shows the Releases table and the query table with the search box, sortable headings, resize handles and Export CSV, but no State / Type chips and no People row; Release Details → CP still shows the strip.
- Expected:
  - A tool with several documents in the month is one entry; its document count is the number of documents.
  - A document whose Area Path has no tool folder is named by its Title before the version or the document word.

**TC-QV-21 IOCC Completed and Supported Releases** — Req QV-36 — L1 `streams.test.mjs` ("IOCC: Completed = Release Notes or Verification Report signed, Supported = also Release Plan; each release once (QV-36)"; "Pulse Check streams: the five Azure streams in order …"); browser check with the IOCC connection fetched: Pulse Check → Current month releases shows IOCC's quadrant as completed / supported, the Releases line lists each completed release once with its Type of Release, and the Supported summary lists the supported releases (release plans included); the Dashboard delivery table shows the same counts.

**TC-QV-22 IOCC grouping** — Req QV-37 — L1 `nested-groups.test.mjs` ("nested groups: type, then name, then version; blank last; keys unique per path (QV-37)"), `streams.test.mjs` (the IOCC name without the document words); browser check with the IOCC connection fetched: Release Details → IOCC opens grouped by Type of Release with each group's release count; add then by Name and then by Release (nested, indented); collapse one group, then Collapse all and Expand all; No grouping shows the flat list; a release's notes, report and plan are one row with their documents under it.

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

**TC-CAP-03 NPRA maximum and tracking** — Req CAP-13 — L1 `capacity.test.mjs` ("NPRA: only booked hours are deducted; tracked against the per-person maximum, hours over it flagged": a Task tagged npra and a Task under a Feature tagged "NPRA Hours"; 12 h booked deducts 12 h, 30 h booked deducts 30 h and flags 10 h over the 20 h maximum; NPRA is no stream and not booked work; maximum 0 tracks only; settings without the field take 20 h; normalisation; "NPRA: nobody is charged for NPRA they did not book"), `dashboard.test.mjs` (settings with allowance 0 keep the former numbers); browser check (Pulse Check → Last month with the synthetic sample, whose CP / IOCC / QMS first Features carry "NPRA Hours"): the NPRA metric shows the booked hours and "max 20h per person"; the NPRA table lists each person with booked / planned / maximum / left and "Within 20h" or "n h over the maximum"; "Who has capacity" shows "NPRA nh / 20h" under the person; a person without NPRA Tasks keeps funded − absence as available; Settings → Capacity → Edit shows "NPRA maximum per person per month (h)" and saving 0 removes the flag; no page errors. **UAT**

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

**TC-GIT-06 Default data repository prefilled** — Req GIT-13 — L1 `git-storage.test.mjs` ("the default data repository is a valid config: ponkritz/DemandPlanningStorage, main, planning-data.json"); E2E `shell.e2e.mjs` ("TC-GIT-06": Settings → Storage → Connect Git storage… shows Owner ponkritz, Repository DemandPlanningStorage, Branch main and Data file planning-data.json prefilled with the token empty; the Get started guide's Git step names the repository); browser check: with a connection saved to another repository, Change connection… shows that repository.

**TC-GIT-05 Capacity settings and mappings in Git** — Req GIT-03, GIT-04, GIT-08, CAP-10 — L1 `git-storage.test.mjs` ("capacity settings, holidays and common activities travel in the Git planning file": round-trip without change, mappings sorted by ID, an older file without them loads as before and makes Save to Git appear, invalid mappings dropped); browser check: add a mapping on Settings → Capacity → the sync bar there says "Unsaved changes"; Save to Git; on a second browser Load latest shows the same mapping. **UAT**
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

**TC-SET-05 Manager not on the board** — Req SET-13 — E2E `shell.e2e.mjs` ("TC-SET-05": synthetic sample, Settings → Resources, Chen Wei reports to → Other (type a name)… → "Maria Lopez" → OK; the select shows Maria Lopez, the reporting lines show Maria Lopez at the top marked "not on the board" with Chen Wei under her, and Diya Sharma's Reports to offers Maria Lopez under "Not on the board").

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

**TC-DOC-01 Documents and rendering** — Req DOC-01…03, DOC-05 — **UAT** — L1 `markdown.test.mjs` (every document in `docs/` is bundled and parses; anchors, tables, nested lists, inline formatting; link schemes); E2E `documents-and-data.e2e.mjs` (one tab per document, each rendered without raw Markdown, the Validation Package tabs present).
- Steps:
  1. Open Documentation.
  2. Open each tab.
- Expected:
  - There is one tab per file in `docs/` (thirteen in this build), in the order of DOC-01, Validation package first.
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

### 6.19 User interface

**TC-UI-01 Theme** — Req UI-01, UI-02 — L1 `theme.test.mjs`.

**TC-UI-02 Buttons** — Req UI-05 — browser check in light and dark theme: Settings → Azure DevOps shows "Open QMS-0025 →" solid indigo with white text and a shadow, "＋ Add server" and "Fetch 1" outlined, disabled "Save PAT" flat grey; Settings → Feature setup list: Edit indigo, Delete red, the Save to Git bar's button green (grey while disabled); every text action in a notice is a tinted pill; the row buttons stay in view.

**TC-UI-03 App name and mark** — Req UI-06 — browser check: the sidebar shows the calendar-and-shield mark with "I&D Quality" over "Demand Planning"; the tab title reads "I&D Quality Demand Planning"; the favicon is the mark on the teal-to-indigo tile; the desktop update feed still names Demand-Planning-Hub-Setup.exe (`scripts/desktop-manifest.cjs`, build-and-deploy.yml unchanged).
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
  - The jobs that write to releases (`publish-tagged-release`, `publish-windows`, `publish-macos`) only download artefacts and run `gh release`; their `run:` steps read `$TAG`, `$REPO` and similar environment variables, never `${{ }}` inside the script.

### 6.21 QE Mapping

**TC-QEM-01 Read an Excel as it is** — Req QEM-02 — L1 `qe-mapping.test.mjs` ("reads an Excel workbook as it is: every sheet, shared / rich / inline strings, dates, numbers, booleans, formulas"; "reads CSV with commas, semicolons or tabs, quotes and line breaks in fields"; "a sheet becomes a table as it is: header from the first non-empty row, names made unique, empty rows and columns dropped").

**TC-QEM-02 Edit, filter, group** — Req QEM-03…QEM-06 — L1 `qe-mapping.test.mjs` ("editing: cells, rows and columns keep their ids; filter, group and export").

**TC-QEM-03 Git file and export** — Req QEM-01, QEM-07 — L1 `qe-mapping.test.mjs` ("writes a workbook that reads back the same, sheet names made valid and unique"; "the Git file: round trip, unknown cells dropped, broken files refused, too large refused").

**TC-QEM-04 QE Mapping end to end** — Req QEM-01…QEM-07 — browser check with GitHub mocked (writable token, no qe-mapping.json yet): QE Mapping shows "No QE Mapping yet."; Upload Excel… with a two-sheet workbook (Mapping: Process, QE Owner, Area, Due Date with date cells, 12 rows; Owners: 1 row) → tabs "Mapping 12" and "Owners 1", dates as YYYY-MM-DD; edit a cell to "Dana"; Add row and fill it; select and delete 2 rows → 11; Add column "Status"; rename "QE Owner" to "Owner"; move Status left; hide Due Date → "Columns (4 of 5)"; Group by Area → groups CP 3, DP 3, IOCC 4, (blank) 1; Filter Area "cp" → "3 of 11 rows"; delete the column Owner; Export CSV → the shown columns; Export Excel → both tabs read back; Save to Git → one PUT of qe-mapping.json "Update the QE Mapping (qe-sample.xlsx)" with 11 rows and the new columns; after a reload the mapping comes from Git and the hidden column stays hidden; no page errors. **UAT**

**TC-QEM-05 Compact columns** — Req QEM-08 — browser check: with a QE Mapping of ten or more columns, the headings stay on one line, short columns are only as wide as their content, a long cell wraps with Wrap text on, and the Filter by column row sits right under the headings while scrolling.

**TC-QEM-06 Resizable columns** — Req QEM-09 — browser check: drag the right edge of a QE Mapping heading wider and narrower (the cells and the filter follow; long text wraps inside the new width), reload (the width is kept), switch tab (the other tab keeps its own widths), double-click the edge (that column returns to automatic), resize two columns and press Reset widths (all return to automatic, the button disappears).

**TC-QEM-07 Collapse all / Expand all** — Req QEM-10 — browser check: group the QE Mapping by a column with several values; Collapse all closes every group (only the group rows and their counts stay; Collapse all is disabled, Expand all enabled); Expand all opens them all; open one group by hand after Collapse all (both buttons enabled); with no grouping, or a single group, the buttons are not shown.

**TC-QEM-08 Nested grouping** — Req QEM-11 — L1 `qe-mapping.test.mjs` ("nested grouping: groups within groups, keys unique per path, counts per level (QEM-11)"); browser check: Group by Area, then by Owner — each Area row holds its Owner groups, indented, with their counts; collapse one Owner group under one Area (the same Owner under another Area stays open); Collapse all closes every level and Expand all opens them; change the first level (the second is dropped); in a column menu, Then group by this adds a level and Remove from grouping removes it; a fourth level is the last (no fifth select).

### 6.22 Monthly pack

**TC-PCK-01 Setup and month files** — Req PCK-02, PCK-06 — L1 `monthly-pack.test.mjs` ("setup and notes files: parse, clean and serialise (PCK-01, PCK-02)": the default setup round-trips; bad ids repaired, duplicates, invalid Epic ids and unknown metrics dropped; a month file keeps only typed text and valid KPI keys, CRLF normalised).

**TC-PCK-02 Epic counts** — Req PCK-04 — L1 `monthly-pack.test.mjs` ("Epic counts: descendants without Tasks, open / closed in month / closed YTD / closed share (PCK-04)").

**TC-PCK-03 The pack: lines, supported counts, YoY, capacity and slide text** — Req PCK-03, PCK-05 — L1 `monthly-pack.test.mjs` ("the pack: releases per line, supported counts, YoY from last year, capacity lines and slide text (PCK-03, PCK-05)": DP this year vs. last year, an Epic-mapped PPU line, the overall change, the capacity, YoY and supported lines, the overload risk line, the copy text of both slides); `monthly-pack.test.mjs` ("the .pptx writer: a zip with the presentation parts, one slide per input, text escaped (PCK-06)").

**TC-PCK-04 Monthly pack end to end** — Req PCK-01, PCK-05, PCK-06 — **UAT** — E2E `monthly-pack.e2e.mjs` ("TC-PCK-04": synthetic sample, Pulse Check → the Monthly pack tab names the month before the header month; both slides with their boxes, the capacity line, the Summary sentence and the utilisation KPI row; the text boxes read-only with the sample; Download .pptx gives pulse-check-<month>.pptx, a zip with the presentation parts and the box headings; Settings → Monthly pack lists the default lines and KPI rows); browser check with Git connected (writable token): type Focus areas and a KPI value, Save to Git (monthly-pack/<month>.json, View commit), reload — the text is back; in Settings → Monthly pack add an Epic to PPU and change a KPI to "Items closed in the month", Save to Git, the pack shows the Feature titles and the count; Copy a box and Copy slide as text paste as bullets; open the .pptx in PowerPoint (two 16:9 slides).

### 6.23 Insights workspace

**TC-WSP-01 KPI helpers and data completeness** — Req WSP-02 — L1 `workspace.test.mjs` ("KPI helpers: deltas, signed text, month utilization and data completeness (WSP-01, WSP-02)": the change in points, the month's planned utilisation, the share of planned Tasks with actuals, people without region or role, a future month without a value, the cumulative sum).

**TC-WSP-02 Exception queue** — Req WSP-03 — L1 `workspace.test.mjs` ("exception queue: over baseline, missing baseline and capacity risk, high first then by impact (WSP-03)": +60% high and +30% medium, within 25% and a closed release without scope left out, 95% not a capacity risk, the order, the stream with most planned hours, the month decides the capacity rows).

**TC-WSP-03 Timeline health** — Req WSP-04 — L1 `workspace.test.mjs` ("timeline health: Features with a Target Date in the window per Epic — completed, overdue, at risk, planned (WSP-04)": the window, outside dates, Removed, undated Features and User Stories left out, the per-Epic and total counts, the sort by date).

**TC-WSP-04 Insight cards** — Req WSP-05 — L1 `workspace.test.mjs` ("insight cards: each rule names its evidence, tone and pack line (WSP-05)": the seven rules with their tones, texts, bars and evidence columns, a stream not set up, the pack lines, the cards without data).

**TC-WSP-05 Page, filters and routing** — Req WSP-01 — L1 `format.test.mjs` ("page registry …": the page in the Data Insights group with the header month); browser check: Settings → Access shows the page under Data Insights; a role without that area does not see it.

**TC-WSP-07 Insights workspace hidden** — Req WSP-07 — **UAT** — E2E `workspace.e2e.mjs` ("TC-WSP-07": synthetic sample, the menu has no Insights workspace, Data Insights still lists Dashboard and Pulse Check, the Dashboard keeps its six tabs).

**TC-WSP-06 Insights workspace end to end** — Req WSP-01…06 — E2E `workspace.e2e.mjs` ("TC-WSP-06": synthetic sample, the KPI tiles with their change, the two charts, the exception queue filtered by a kind chip, the timeline from target dates; the insight cards with filters and what was checked, the evidence rows, Add to monthly pack and the queue count, Save refused with the sample, the presentation preview, a suggested question jumping to the queue filtered on Over 25% baseline; the Dashboard unchanged with its six tabs); browser check with Git connected (writable token): queue two cards, Save to monthly pack, then Pulse Check → Monthly pack of that month shows them under Key takeaways and the Git history has the commit. Suspended while WSP-07 hides the page; its E2E scenario is in the Git history of `workspace.e2e.mjs` and returns with the page.

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
| CON-01…03 | TC-CON-01 |
| CON-04…08, CON-19 | TC-CON-02 |
| CON-09 | TC-CON-03 |
| CON-10…12 | TC-NAV-02 |
| CON-13, CON-17 | TC-CON-06 |
| CON-14…16 | TC-CON-04, TC-CON-05 |
| CON-18 | TC-INS-01 |
| CON-20 | TC-CON-07 |
| CON-52, CON-53 | TC-CON-23, TC-CON-26 |
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
| ATM-01…03 | TC-ATM-01 |
| ATM-04, ATM-05 | TC-ATM-02 |
| ATM-06 | TC-ATM-03, TC-ATM-08 |
| ATM-07…09 | TC-ATM-04 |
| ATM-10…12 | TC-ATM-05 |
| ATM-13, ATM-14 | TC-ATM-06 |
| ATM-15, ATM-16 | TC-ATM-07 |
| ATM-17 | TC-ATM-09 |
| ATM-18 | TC-ATM-10 |
| ATM-19 | TC-ATM-11 |
| ATM-20 | TC-ATM-12 |
| BKL-01…03, BKL-12 | TC-BKL-01 |
| BKL-04…09, BKL-11 | TC-BKL-02 |
| BKL-10 | TC-BKL-03, TC-ATM-11 |
| BKL-13 | TC-BKL-04 |
| BKL-14 | TC-BKL-05 |
| BKL-15 | TC-BKL-06 |
| BKL-16 | TC-BKL-07 |
| BKL-17 | TC-BKL-08 |
| BKL-18 | TC-BKL-09 |
| BKL-19 | TC-BKL-10 |
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
| QV-38 | TC-CON-42 |
| OVR-01…08 | retired (TC-OVR-01…03 retired) |
| OV-11 | TC-OV-11 |
| OV-12 | TC-OV-12 |
| OV-13 | TC-OV-13 |
| OV-14 | TC-OV-14 |
| OVR-09, CAP-01…09 | TC-CAP-01 |
| CAP-04, CAP-05, CAP-10…12 | TC-CAP-02 |
| CAP-13 | TC-CAP-03 |
| BAS-01…04 | TC-BAS-01 |
| BAS-05…07 | TC-BAS-02 |
| BAS-08…10 | TC-BAS-03 |
| BAS-11 | TC-BAS-04 |
| GIT-01 | TC-GIT-01 |
| GIT-03, GIT-04, GIT-08 | TC-GIT-02, TC-GIT-05 |
| GIT-02…04, GIT-06, GIT-08, GIT-12 | TC-GIT-02 |
| GIT-13 | TC-GIT-06 |
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
| DOC-09…11 | TC-DOC-03 |
| UI-01, UI-02 | TC-UI-01 |
| UI-03, UI-04 | TC-INS-03 |
| UI-05 | TC-UI-02 |
| UI-06 | TC-UI-03 |
| CI-01…04 | TC-INS-04, TC-CI-01 |
| CI-05 | TC-UPD-01 |
| CI-06 | TC-CI-02 |
| CI-07 | TC-CI-03 |
| QEM-01 | TC-QEM-03, TC-QEM-04 |
| QEM-02 | TC-QEM-01, TC-QEM-04 |
| QEM-03…QEM-06 | TC-QEM-02, TC-QEM-04 |
| QEM-07 | TC-QEM-03, TC-QEM-04 |
| QEM-08 | TC-QEM-05 |
| QEM-09 | TC-QEM-06 |
| QEM-10 | TC-QEM-07 |
| QEM-11 | TC-QEM-08 |
| PCK-01, PCK-06 | TC-PCK-01, TC-PCK-04 |
| PCK-02 | TC-PCK-01, TC-PCK-04 |
| PCK-03 | TC-PCK-03 |
| PCK-04 | TC-PCK-02 |
| PCK-05 | TC-PCK-03, TC-PCK-04 |
| NFR-01 | TC-INS-04 |
| WSP-01 | TC-WSP-05, TC-WSP-06 |
| WSP-02 | TC-WSP-01, TC-WSP-06 |
| WSP-03 | TC-WSP-02, TC-WSP-06 |
| WSP-04 | TC-WSP-03, TC-WSP-06 |
| WSP-05 | TC-WSP-04, TC-WSP-06 |
| WSP-06 | TC-WSP-06 |
| WSP-07 | TC-WSP-07 |
| NFR-02 | TC-STO-01 |
| NFR-03…05 | TC-DSK-02, TC-INS-01 |
| NFR-06 | TC-INS-02 |
| NFR-07 | TC-INS-01 |
| IF-01, IF-03, IF-04 | TC-INS-04 |
| IF-02 | TC-DSK-02 |

### Use-case coverage

| Use case | Test cases |
|---|---|
| UC-01 | TC-NAV-01…06, TC-NAV-33, TC-UI-01, TC-UI-02, TC-UI-03, TC-CON-36, TC-CON-38 |
| UC-02 | TC-CON-01…07, TC-CON-17…19, TC-CON-44, TC-CON-28, TC-NAV-02, TC-NAV-34, TC-QV-14, TC-QV-16 |
| UC-03 | TC-CON-03, TC-FET-01…06 |
| UC-04 | TC-TWN-01, TC-TWN-02, TC-MON-01…06 |
| UC-05 | TC-MON-07 |
| UC-06 | TC-ATM-01…11, TC-TWN-03, TC-CON-20, TC-CON-33, TC-CON-34, TC-CON-43 |
| UC-07 | TC-BKL-01…09, TC-NAV-36, TC-CON-23, TC-CON-25…27, TC-CON-29…32, TC-CON-35 |
| UC-08 | TC-QV-01…05, TC-FET-07, TC-CON-08, TC-CON-11…16, TC-QV-08, TC-QV-09, TC-QV-10, TC-QV-11, TC-QV-12, TC-QV-13, TC-QV-14, TC-QV-15, TC-QV-16, TC-CON-37, TC-CON-38, TC-CON-39, TC-CON-40, TC-CON-41, TC-QV-18, TC-QV-19, TC-QV-20, TC-QV-21, TC-QV-22, TC-CON-42 |
| UC-09 | TC-OV-11…14, TC-CAP-01, TC-CAP-02, TC-CAP-03, TC-QV-17, TC-CON-21, TC-QV-10, TC-QV-11, TC-QV-21 |
| UC-10 | TC-OV-11 (Months, Streams), TC-OV-13 |
| UC-11 | TC-BAS-01…04 |
| UC-12 | TC-GIT-01…04, TC-GIT-05, TC-GIT-06, TC-ACC-03 |
| UC-13 | TC-SNP-01…03 |
| UC-14 | TC-SET-01…05, TC-CAP-02, TC-CAP-03, TC-NAV-34 |
| UC-15 | TC-STO-01…04, TC-SNP-04 |
| UC-16 | TC-UPD-01, TC-UPD-02 |
| UC-17 | TC-DSK-01…03, TC-INS-02 |
| UC-18 | TC-SMP-01, TC-ATM-06, TC-GIT-04 |
| UC-19 | TC-INS-04, TC-CI-01, TC-CI-02, TC-CI-03, TC-DOC-03 |
| UC-20 | TC-DOC-01, TC-DOC-02, TC-DOC-03 |
| UC-21 | TC-SCR-01 |
| UC-22 | TC-ACC-01, TC-ACC-02 |
| UC-23 | TC-QEM-01…08 |
| UC-24 | TC-PCK-01…04 |
| UC-25 | TC-WSP-01…07 |

## 8. Result record

Copy this table for each test run. Status is one of Pass, Fail, Blocked or Not run. Every Fail needs a defect ID.

| Test case | Build | Env | Tester | Date | Status | Defect / note |
|---|---|---|---|---|---|---|
| TC-… | | | | | | |
