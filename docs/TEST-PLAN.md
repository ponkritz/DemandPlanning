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

**TC-NAV-37 Expand all / Collapse all in the menu** — Req NAV-37, NAV-17 — E2E `shell.e2e.mjs` ("TC-NAV-37: Expand all and Collapse all open and close every menu heading, and are remembered"); browser check: with a page pinned, Collapse all closes every heading and the Release Details lists while the pinned page stays; Expand all opens them; at 900px the buttons are hidden; on a phone (off-canvas menu) they work.

**TC-NAV-33 Get started pop-up** — Req NAV-33 — L1 `setup-guide.test.mjs` ("release streams: DP's Pedestal and DHFI data sets count, and the missing ones are named"; "a first-time user: Git first, the rest waits for the step it depends on"; "partly set up: Git and the connection done, the PAT is next, then Fetch"; "fully set up: nothing required left; region and streams follow the facts and who may change them"); browser check: a new browser without data opens the pop-up by itself with "Connect the shared Git storage" as the next step and the PAT and fetch steps "After the step above"; "Open Storage settings" closes it and shows Settings → Storage; the top bar shows "Setup · 0/4" and reopens it; a reload opens it again; after "Don't show again automatically" a reload does not, the Setup button still does; at 390 × 844 nothing overflows. **UAT**

**TC-NAV-38 Enter the setup values in the Get started pop-up** — Req NAV-38, NAV-33 — E2E `shell.e2e.mjs` ("TC-NAV-33: a new browser gets the Get started pop-up; dismissing it keeps it closed after a reload": the GitHub token and Azure DevOps PAT fields (hidden input) and Your work email, marked autocomplete "email"; saving the email stores it in this browser and the field goes away) — **UAT**; browser check: in a new browser, paste the GitHub token in step 1 and press Connect & load — the shared setup loads and the step shows Done; click the work email field — the browser offers your saved email; choose it, then enter the Azure DevOps PAT in step 3 — both turn Done without opening Settings; a wrong token shows the refusal in the step.

**TC-NAV-39 Email read from the token; order of the setup steps** — Req NAV-39, NAV-33 — L1 `setup-guide.test.mjs` ("a first-time user: Git first, then the connection and token, then the email (read from the token), then Fetch", "NAV-39: the work email is read from the token owner's work items (@Me): Assigned To first, then Created By, then Changed By"); E2E `shell.e2e.mjs` ("TC-NAV-33: a new browser gets the Get started pop-up; dismissing it keeps it closed after a reload": the steps' order, the email waits for the token, Detect from my token after Save PAT) — **UAT**; browser check with a real token: in a new browser, connect Git, save your PAT, press Detect from my token — your name and work email appear with where they were read (Assigned To / Created By / Changed By); Save email; with a token of someone without any work item the step says the email could not be read.

**TC-NAV-40 A short Get started with Info and token links** — Req NAV-40, NAV-33 — L1 `setup-guide.test.mjs` ("NAV-40: the token links are https only, shared in the planning data and kept through a round trip"); E2E `shell.e2e.mjs` ("TC-NAV-33: a new browser gets the Get started pop-up; dismissing it keeps it closed after a reload": the short titles incl. TFS APAC settings [DP/CP/IOCC/Content], no how-to text on the page, the GitHub and Azure DevOps token links) — **UAT**; browser check: hover Info on a step — why and how show; as an Admin with Git open Token links (admin), set the TFS APAC link and save to Git — after reload in another browser step 6 shows Create a TFS APAC PAT with that link; an http link is not kept.

**TC-NAV-41 Get started opens when the fetch fails** — Req NAV-41 — L1 `setup-guide.test.mjs` ("NAV-41: a failed fetch reopens the token step (token problems) and the Fetch step (any problem)"); E2E `shell.e2e.mjs` ("TC-NAV-41: a fetch that fails shows the reason in Get started and opens the token step again": Azure DevOps answers 401) — **UAT**; browser check: with an expired or revoked PAT, open the app — Get started opens with Could not fetch from Azure DevOps and the token step; save a new PAT and Fetch now — the steps turn Done; with the network off (or VPN for on-prem) the reason says Azure DevOps could not be reached.

**TC-NAV-42 Home: tiles per area, links and search** — Req NAV-42, NAV-43, NAV-44 — **UAT** — L1 `home-tiles.test.mjs` ("NAV-43: a search keeps a matching tile whole, else only its matching links; nothing left out without a match (TC-NAV-42)", "NAV-42: Home is a page of its own, open to everyone, without a month"); E2E `shell.e2e.mjs` ("TC-NAV-42: Home is the start page — a tile per area with links to its pages, a search, and Home first in the menu": the start page and first menu entry, the tiles in order, six links and “+n more” showing the rest, a search keeping only matching links or whole matching tiles, nothing found, a tile opening its area and a link its page; "TC-NAV-01 / TC-NAV-17": the app opens on Home); browser check: dark mode and phone width; a role without Release Details sees no Release Details tile.

**TC-NAV-46 Tile view or classic view** — Req NAV-46, NAV-42 — L1 `home-tiles.test.mjs` ("NAV-46: the tile view opens on Home, the classic view on My dashboard; the choice is kept in this browser (TC-NAV-46)"); E2E `shell.e2e.mjs` ("TC-NAV-46: the menu switches between the tile view (opens on Home) and the classic view (opens on My dashboard, no Home); the choice is kept"); browser check: Classic view opens My dashboard and Home leaves the menu; a reload keeps it; Tile view brings Home back.

**TC-NAV-47 Person picker on the person-based pages** — Req NAV-47, MYD-01, ACT-14 — L1 `app-frame.test.mjs` ("NAV-47: My dashboard always shows you — your work email, else the name you chose before an email; never the Person picked on other pages (TC-NAV-47)"); E2E `shell.e2e.mjs` ("TC-NAV-48: the profile at the top right holds My settings, the view switch and the tools; the footer shows the version and ends the page without covering it; Person only on person-based pages", "TC-ACT-10: Time Writing can show another person, chosen at the top right"); browser check: Person in the top bar on Time Writing, My Tasks [Board] and Sprint check only; choosing someone changes those pages and not My dashboard.

**TC-NAV-48 Profile menu and footer** — Req NAV-48, NAV-49, NAV-15 — E2E `shell.e2e.mjs` ("TC-NAV-48: the profile at the top right holds My settings, the view switch and the tools; the footer shows the version and ends the page without covering it; Person only on person-based pages"); browser check: the profile button at the top right opens My settings, Classic / Tile view, View as… (Admin), Search settings, Customize menu; the footer shows only the desktop app download, “v{x.y.z} (Build n)” and Force Update, whose window shows the build ID, build time and where data is saved; scrolled to the end, the last row of a long table is fully visible above it; in Admin → Epic & Feature setup the Unsaved changes bar sits above the footer; every My settings section has the same width and starts under the tabs (KB-61).

**TC-NAV-45 My page usage** — Req NAV-45 — L1 `usage-counts.test.mjs` ("NAV-45: page usage is off until turned on; nothing is counted or stored while off (TC-NAV-45)"; "NAV-45: on, each opening of a page counts; off deletes the counts; most used first (TC-NAV-45)"; "NAV-45: a tampered or broken entry is read safely (TC-NAV-45)"); E2E `shell.e2e.mjs` ("TC-NAV-45: My page usage is off by default; turned on, it counts the pages opened in this browser; off deletes the counts"); inspection: an exported JSON backup and a Git snapshot contain no usage counts.

**TC-NAV-36 Background jobs** — Req NAV-36 — L1 `background-jobs.test.mjs` ("background jobs: run, report progress and the result; the same job is not started twice"; "… a failed result or a thrown error marks the job; Clear finished keeps the running ones"); browser check (QMS-0025 with a saved PAT): New Feature → Save closes the form at once and the top bar shows “⟳ 1 running” with its progress, then “✓ Jobs done” with “#id … Hierarchy complete”; the menu and other pages stay usable meanwhile; Bulk actions → Create month tasks and Move run the same way and their buttons wait while the job runs; Monthly Time Writing → Save leaves a failed Task staged; reloading while a job runs asks first.

**TC-NAV-34 Settings editors as pop-ups** — Req NAV-34 — browser check: Settings → Storage shows the Git storage and SharePoint summaries; "Connect Git storage…" and "Connect to SharePoint…" open pop-ups, a click beside them keeps them open, Cancel closes them; Settings → Azure DevOps: Edit on the Time Writing row and "＋ Add server" open pop-ups; Settings → Capacity & periods: "Edit capacity settings…" opens the form in a pop-up; "＋ Map an Epic or Feature…" maps #424242 and closes, the mapping's Edit opens "Change the mapping of #424242"; Settings → Feature setup: Go to Epic #13946 → the summary and "View setup…" (no Git) open "Shared Feature setup · Epic #13946", Close closes it; every pop-up form is one column (title, input, explanation per field) with Cancel then the main action at the bottom right; at 390 × 844 the connection pop-up fits without horizontal scrolling; no page errors. **UAT**

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
  - `windchill-analysis/<id>-locations.json` exists in the data repository with the unique locations and releases, and holds no document rows; the page says "Saved to Git (windchill-analysis/<id>-locations.json)".
  - From Document name the result is the CON-71 one: with this fixture's plain names only the clubbed document counts, as one release ("1 release · 1 of 7 documents · 1 clubbed · from Document name").

**TC-CON-27 Map a Feature setup to an Epic** — Req CON-59 — L1 `feature-setup.test.mjs` ("built-in stories as a setup give exactly the titles of the built-in creation"; "copy a setup to another Epic: replaces the target, keeps the source, no-op without a source"); browser check with a writable Git store holding a personal setup of another Epic: My setup shows it with "applies now" on step 1; "Copy this setup to Epic #" 13946 → the four stories appear under #13946 and the panel says "changed here, not saved yet"; Save to Git commits `feature-setup/<email>.json` holding both Epics and the panel then marks My setup as applying to #13946; "Go to Epic #" another number with no setup offers the two built-in buttons. **UAT**

**TC-CON-26 Personal and shared Feature setup** — Req CON-58, CON-52 — L1 `feature-setup.test.mjs` (one file per email with unsafe characters and runs of dots replaced; my setup of an Epic wins for me, the shared one otherwise, and the form can switch; Enable for everyone replaces only that Epic, as a copy); browser check: Settings → Feature setup opens for every role; with an email on the Time Writing connection it shows My setup and Shared (everyone), else only Shared with a notice; "Start my own from the shared one", "Remove my setup" and "Enable for everyone" save to Git with a writable token. **UAT**

**TC-NAV-22 Default streams and stream rules** — Req NAV-22, NAV-23 — L1 `streams.test.mjs` (stream order and sources; connection and export found by name; DP and IOCC release rules; fuzzy match percentages and the threshold; Pulse Check lists the five Azure streams in order with not-set-up ones); browser check on sample data: Release Details lists DP, CP, IOCC, Content, Tool Validations and S&S IT; a not-set-up stream opens Settings, whose Default streams Set up pre-fills the name and role; Pulse Check → Current month releases shows the five Azure streams in order. **UAT**

**TC-NAV-20 Pulse Check: Release Details and Last month** — Req NAV-20 — L1 `release-overview.test.mjs` (only the given Release Details views, each shown even when not fetched; a release source outside Release Details left out), `pulse-check.test.mjs` (previous month across the year; releases compared per stream; Features and User Stories opened and closed per Epic, absence and Removed left out, narrowed to a person); browser check on sample data: the tabs Releases and Last month; Last month shows the utilization metrics, Releases vs the selected month, Work closed and opened, the Overview month panels and the gaps for the previous month. **UAT**

**TC-CON-25 Configurable Time Writing story** — Req CON-57 — L1 `azure-devops.test.mjs` (a setup file without it keeps “{feature} - Time Writing”; a configured title, Area Path, Iteration Path and assignee are used and the month Task goes under that story). **UAT**

**TC-NAV-17 Menu groups and collapsing** — Req NAV-17, NAV-18, OV-10 — L1 `format.test.mjs` (Data Insights holds Overview, Pulse Check, PI Review; My Work order My Tasks [Board], Monthly Time Writing, Bulk actions); browser check on sample data: the menu shows the five headings; Pulse Check shows the month's releases (Overview keeps This month and Trends); collapsing My Work and Windchill exports hides them and stays so after a reload; at 900 px width every page is still reachable. **UAT**

**TC-CON-23 Feature setup per Epic** — Req CON-52, CON-53 — L1 `azure-devops.test.mjs` (placeholders, plain text, unknown braces kept, missing values; the file is parsed and written clean; a Feature from its Epic setup gets the chosen stories, the Time Writing story and the Task with title, Original Estimate, Area Path, Iteration Path and assignee; completing again creates nothing; a placeholder the title cannot fill stops it); browser check with GitHub and Azure DevOps mocked: Settings → Feature setup, add “US 1 ({service})” and “US 4”, Original Estimate 6 → preview shows “US 1 (Service)”; Save to Git writes feature-setup.json; ＋ Feature under that Epic with “CP | Care Pathways | v3.1” lists “US 1 (Care Pathways)” and “US 4” ticked, the Task “October 2026 | CP | Care Pathways | v3.1” with 6 h, and no PU / Full Release choice. **UAT**

**TC-ATM-08 State checks and Feature / User Story states** — Req CON-54, ATM-06 — L1 `my-work.test.mjs` (all stories Closed → close the Feature, Removed ignored; all Tasks Closed → close the story; Active Feature without an Active story, or without stories → flagged; Closed Features, other people's work and the absence Epic left out; Feature New → Set to Active, Active → Close, other states → none; other types → Close); browser check with Azure DevOps mocked: Bulk actions for Ben lists his two Active Features without User Stories with a link to Azure DevOps; My Tasks [Board] shows Close Feature for Active Features. **UAT**

**TC-CON-24 Load everything from Git; roles by the connection email; QE Mapping** — Req CON-55, CON-41, NAV-19 — browser check with GitHub mocked: Settings → Storage → Load everything from Git reads planning-data.json, azure-views.json, azure-data, windchill-data, access.json and feature-setup.json once each and lists what was loaded; Settings → Access says "You are me@x.com (the email on your Time Writing connection)"; QE Mapping appears under Data & governance (its content: TC-QEM-04). **UAT**

**TC-ACC-01 Roles and access** — Req CON-41, CON-42, CON-43, CON-44 — L1 `access.test.mjs` (no policy = no restrictions; union of roles; default role for unknown or unlisted email; no default role = nothing; Backlog Health only for its roles; unknown roles, areas, actions and invalid emails dropped; broken file refused; the editor cannot remove their own "manage access"; a role without "change work items" is refused before anything is sent while reads still work); browser check with mocked GitHub and Azure DevOps: email shown from the connection's email field, Set up roles → add a member, tick Scrum Master → Save to Git commits access.json once; with a cached Team Member policy the menu has no Backlog Health, Bulk actions, Release Details, Baselines or Snapshots and Settings shows only Azure DevOps, Storage and Access. **UAT**

**TC-ACC-03 Add members by name** — Req CON-74 — browser check with the Time Writing backlog loaded: Settings → Access → Choose a person lists the people Assigned To an item in QMS-0025 by name (members already listed left out; two people with the same name show their email); pick one and Add member adds their email with the everyone-else role; the table shows the name with the email under it, sorted by name; Other (enter an email)… shows the email field and adds a person not in the backlog; without the backlog loaded only the email field and the hint are shown.

**TC-ACC-04 View as a role** — Req CON-89, CON-91, CON-92 — E2E `shell.e2e.mjs` ("TC-ACC-04: an Admin views the app as a role, read only, and exits"); L1 `view-as.test.mjs` ("View as: only the Admin role may use it, and only with an access policy (CON-89)"); browser check with Git storage and access.json: a People Manager or Team Member has no View as…; an Admin views as Team Member — the menu loses Team insights, the banner says read only; Exit restores the Admin's menu; a reload ends View as.

**TC-ACC-05 View as a person, read only** — Req CON-90, CON-92 — L1 `view-as.test.mjs` ("View as: a person gets the roles of their work email (else the default role); a role gets that role only (CON-90, CON-91)"; "View as is read only: writes to Git storage and Azure DevOps are refused while it is on (CON-92)"); browser check with the Time Writing data fetched: view as a team member — My dashboard and My Tasks [Board] show their hours and work, the menu follows their roles; Save in Monthly Time Writing, a state change in My Tasks [Board] and Save to Git all report "Read only while viewing as …" and nothing changes in Azure DevOps or Git.

**TC-NAV-12 Freshness in the viewer's time zone** — Req NAV-12 — L1 `format.test.mjs` and `app-update.test.mjs` (the same instant in Asia/Kolkata, America/New_York and UTC; local "today"); browser check in America/New_York: a fetch at 09:00 UTC shows "05:00 AM EDT".

**TC-OV-10 Releases summary, tracking Feature and local approval dates** — Req QV-18, QV-19, OV-10 — L1 `release-overview.test.mjs`, `format.test.mjs`, `release-source.test.mjs` (the same UTC instant is 30 September in New York and 1 October in India); browser check in Asia/Kolkata with CP, DP and IOCC loaded from Git: October shows three stream quadrants and the total (3 releases, 4 documents); September shows the CP release approved 29 Sep 18:30 UTC as “September 30, 2026”, in both the quadrant and the CP view.

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
  - "Source details and dates" lists at most 100 rows and searches by ID, title, type and state.

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

**TC-BKL-12 Backlog filtered to me; ＋ Time Writing Task** — Req BKL-21, BKL-22 — E2E `backlog.e2e.mjs` ("TC-BKL-12: QMS-0025 opens filtered to the person browsing; clearing the filter shows everyone; rows offer ＋ Time Writing Task"); L1 `my-work.test.mjs` ("QMS-0025 shows mine by default: my items with everything above and below; featureOf finds the Feature of a Story (TC-BKL-12)"); browser check with the QMS-0025 board and your work email: the backlog shows your items with their Epic / Feature above and the work below; Assigned to me ✕ clears to everyone and a restart filters again; ＋ Time Writing Task on a Feature (and on a Story) creates this month's Task for you under your own Time Writing story, or reports that it exists; the same button on My Tasks [Board] rows.

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

**TC-CON-51 ECP projects from Windchill** — Req CON-83 — L1 `windchill-releases.test.mjs` ("ECP: each release is the second Location folder, \"<project number> <project name>\", with everything under it (TC-CON-51)"), `streams.test.mjs` ("default streams in order; connections and exports found by name"); browser check: import a Windchill export through "＋ ECP" (an export still named "QRE" also shows as ECP) — Release Details → Windchill exports → ECP lists each second folder of the Location ("Parent folder/<number> <name>/Phase") once as "<number> <name>" with every document under it, phases and deeper folders included, and the months its documents are dated in; the month filter follows the header month; Pulse Check → Supported shows "ECP [n] : 123456 Name, …"; Create Feature proposes "ECP | 123456 Name".

**TC-CON-52 BRITE placeholder** — Req CON-84 — inspection: Release Details shows BRITE at its root; it opens "BRITE is not set up yet."; Pulse Check and the Monthly pack have no BRITE line.

**TC-CON-53 Import a stream's export from its menu entry** — Req CON-85 — E2E `documents-and-data.e2e.mjs` ("TC-CON-53 / TC-CON-54: \"＋ ECP\" imports the export as the ECP page whatever the file is called, read by project, with Project No / Project Name columns"); browser check: with no ECP export, click "＋ ECP" — the import shows "Import the ECP export" with Name "ECP"; choose a CSV called anything (e.g. "Search Results.csv") — the ECP page opens with its projects, the menu shows ECP (no ＋), and Pulse Check lists ECP.

**TC-CON-54 ECP columns Project No and Project Name** — Req CON-86 — E2E `documents-and-data.e2e.mjs` ("TC-CON-53 / TC-CON-54: \"＋ ECP\" imports the export as the ECP page whatever the file is called, read by project, with Project No / Project Name columns"); browser check: Release Details → Windchill exports → ECP — the table's columns read Project Name and Project No (and Download CSV has the same headers); S&S IT still reads Release name and Release.
**TC-CON-55 Several ECP setups, each listed on its own** — Req CON-87 — L1 `windchill-releases.test.mjs` ("ECP setups: several ECP exports, each with its own name and project folder (2nd, 3rd…), listed on their own (TC-CON-55)"); E2E `documents-and-data.e2e.mjs` ("TC-CON-55 / TC-QV-28: an ECP setup named \"ECP - Type 2\" reads projects from the 3rd Location folder, is listed on its own, with compact page actions"); browser check: click "＋ ECP" — Logic shows ECP setup; choose Project details at "3rd folder", Name "ECP - Type 2", import — the page lists "123456 Patient Monitor" with all its phases, the menu shows "ECP - Type 2" and "＋ ECP export"; import a second export as "ECP - Type 1" at the 2nd folder — both are listed under Windchill exports and as separate lines in Pulse Check → Supported and the Monthly pack; changing "Project details at" on a page re-reads its projects.

**TC-CON-56 Back up and clean up the connections** — Req CON-88 — L1 `view-definitions.test.mjs` ("back up and clean up: every connection removed, PATs kept per server, the reset applied once per computer (TC-CON-56)"); E2E `shell.e2e.mjs` ("TC-CON-56: Storage → Shared setup in Git offers Back up and clean up; removing all needs Git storage that can save"); browser check (admin, Git storage that can save): Back up and remove all… downloads the backup, adds `azure-views-backups/azure-views-<time>.json` and `azure-views-reset.json` in Git, empties `azure-views.json` and `azure-data/`, and Settings → Azure DevOps lists no connections while the server PATs stay; a second computer started afterwards shows no old connections, then the ones the admin added.

**TC-CON-57 Stream mapping locked to the Tool Owner** — Req CON-93, CON-42 — L1 `access.test.mjs` ("CON-93: the Tool Owner role alone changes the stream mapping; while none exists, those who manage access may; only a Tool Owner changes who holds it (TC-CON-57)"); browser check with access.json in Git: as an Admin without the Tool Owner role, Settings → Azure DevOps → Stream mapping shows the mapping read-only (no Edit, no Save stream mapping to Git, naming patterns read-only); give yourself Tool Owner in Role rights while no Tool Owner exists — saved; as that Tool Owner the mapping is editable; as an Admin, adding another Tool Owner is refused; removing the last Tool Owner is refused.

**TC-CON-58 Role rights as a permission matrix** — Req CON-94, CON-42, CON-89 — L1 `access.test.mjs` ("CON-94: every permission is Allow, Deny or Not set per role; a denial wins; older files keep what they allowed; Check access explains (TC-CON-58)"); E2E `shell.e2e.mjs` ("TC-CON-58: Role rights is a matrix of Allow, Deny and Not set per permission, grouped and searchable; a denial hides what it denies and Check access explains why"); browser check with access.json in Git: Settings → People & access → Role rights shows each permission with Allow / Deny / Not set per role in groups; set Deny on *Export tables* for one of your roles while another allows it — after Save to Git the Export buttons are gone; Check access names the denying role; an access.json saved before v7.27.0 keeps every person's rights.

**TC-CON-59 Feature setup layers** — Req CON-95 — L1 `feature-setup-inheritance.test.mjs` ("Feature setup layers: Mine → Epic (shared) → All Epics → Built in, per field (CON-95, TC-CON-59)"; "Feature setup layers: round trip, DoD rules and Enable for everyone keep the defaults (CON-95, TC-CON-59)").

**TC-CON-60 Setup per Epic** — Req CON-97, CON-95 — L1 `feature-setup-inheritance.test.mjs` ("Feature setup layers: Mine → Epic (shared) → All Epics → Built in, per field (CON-95, TC-CON-59)" — an Epic without its own setup uses All Epics); E2E `shell.e2e.mjs` ("TC-CON-60: Setup per Epic — All Epics defaults, and an Epic showing which sections it customizes, with a preview"), `backlog.e2e.mjs` ("TC-EPS-01: …" — the Epic's fields in Setup per Epic); browser check with Git storage: Admin → Epic & Feature setup → Setup per Epic: All Epics — set a DoD and a story; an Epic: switch on Customize for User Stories (it starts from All Epics' story), add one, change its DoD; the preview follows; one Save to Git writes the setup files; Use my own version — customize the estimate, Save; New Feature under the Epic uses your estimate; Remove my own version; Reset this Epic to the defaults. The Epic list scrolls on its own, stays in view and is at most 600 px tall (KB-57).

**TC-CON-61 Shared connections merged, removed ones restored** — Req CON-98, CON-99 — **UAT** — L1 `removed-connections.test.mjs` ("CON-98: sharing merges with the setup in Git — a connection only in Git stays; only named ones are removed (TC-CON-61)", "CON-99: connections in older versions of the shared setup that are gone now are found once, newest version first (TC-CON-61)", "CON-99: the history of the shared setup is read from GitHub — commits of the file, then the file at a commit; nothing is written"); E2E `shell.e2e.mjs` ("TC-CON-61: Streams → Removed connections finds a connection dropped from the shared setup in Git and restores it, for everyone"); UAT: on the computer that lost the second CP query, Settings → Streams → Removed connections → Look in Git history, Restore it, Fetch, and check it is back in the menu and on a second computer after its next start.


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

**TC-QV-12 Rich-text cells as plain text** — Req QV-27 — L1 `query-view.test.mjs` ("rich-text values (Acceptance Criteria) show as text: tags removed, entities decoded, lines joined"; "rich text of any size becomes text in linear time; script and style blocks are dropped (KB-03, TC-QV-12)"); browser check with Azure DevOps mocked (a query with [Microsoft.VSTS.Common.AcceptanceCriteria] holding `<div><b>Given</b>…</div>`): the cell reads "Given … · When … · Then …" with no tags, the hover shows the same, the CSV holds the text; no page errors.

**TC-QV-13 View notes behind Info** — Req QV-28 — browser check with Azure DevOps mocked (DP view, October, a Git save note): no info banners above the counts; the ⓘ Info next to "DP" lists "Month filter: by DDT Date in your time zone." and the legend "DT = Design Transfer (DDT) · SFV = … · PRD = … · RPE = …"; a fetch error still shows as a banner; no page errors.

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
**TC-QV-27 Consolidation and raw data on two tabs** — Req QV-47 — E2E `documents-and-data.e2e.mjs` ("TC-CON-39 / TC-CON-37 / TC-QV-27: a Windchill export lists its unique releases, clubbed names included, its raw rows on their own tab, and exports a neutralised CSV"); browser check: open DP, CP, IOCC, Content and Tool Validations under Release Details — each shows its releases (CP report) first and the query rows only on the "Query output (n)" tab; open S&S IT and an ECP export — Releases / Projects first, the imported rows with search and Export CSV on "Raw data (n)"; the tab chosen stays when moving between pages.
**TC-QV-28 Compact page actions** — Req QV-48 — E2E `documents-and-data.e2e.mjs` ("TC-CON-55 / TC-QV-28: an ECP setup named \"ECP - Type 2\" reads projects from the 3rd Location folder, is listed on its own, with compact page actions"); browser check: on DP / IOCC the header shows "All months", a small ↻ (tooltip "Refresh from Azure") and ⋯ with Load from Git and Connection settings; on a Windchill export a small ⤒ (tooltip "Import newer export") and ⋯ with Load from Git and Remove this export…; the menu closes on Escape or a click outside.

**TC-QV-30 CP Platform titles (PF1.0 / PF2.0)** — Req QV-49 — L1 `cp-reporting.test.mjs` ("Platform titles: \"PF1.0 / PF2.0 <Name>-<Number>\" give the name with its variant and an alphanumeric number (QV-49, TC-QV-30)"); browser check: a CP container "PF2.0 Carpo-A12" shows as "PF2.0 Carpo A12" with no warning, and Create Feature offers "PF2.0 Carpo | A12".

**TC-QV-31 Pulse Check over a quarter, half-year or year** — Req QV-50 — L1 `pulse-check.test.mjs` ("Pulse Check periods: calendar quarter, half-year and year against the period before; each release once (QV-50, TC-QV-31)"); E2E `shell.e2e.mjs` (TC-MYD-01: Quarter shows "Releases · Qn yyyy vs Qn yyyy" and the work opened and closed; Month brings the tabs back); browser check: a release seen in two months of the quarter counts once.

**TC-QV-32 Pulse Check opens without recalculating** — Req QV-51 — L1 `streams.test.mjs` ("Pulse Check is worked out once per data set: the same sources and month give the same streams; new data recalculates (QV-51, KB-27)"); browser check with the real DP, CP, IOCC and S&S IT data loaded: open Pulse Check, switch to Year and back, leave and reopen — the page opens without a pause after the first time; Refresh, then the figures follow the new data.

**TC-QV-33 Content releases named by Title** — Req QV-52 — L1 `release-source.test.mjs` ("QV-52: Content releases are named by the Title — one per unique Title, no name and number from the paths"); browser check with the Content connection fetched: the Content page lists one release per Title (Title column, no Release column; no Name / Release columns in the query output); Pulse Check → Releases shows "Content [n] : <Title>, <Title>"; the Monthly pack Content line lists the same Titles.

**TC-QV-34 DP Month & Year and Milestones columns** — Req QV-53 — L1 `dp-milestones.test.mjs` ("QV-53: the DP table shows each release's Month & Year (its DDT Date) and every milestone's month and status"); browser check with the DP data: Release Details → DP shows Month & Year and Milestones after the query's columns; tick All months — releases without a DDT Date show "No DDT Date"; a release counted as Supported has a ✓ on a milestone in the header month; search "No DDT Date" finds them; Export carries both columns.

**TC-QV-35 DP releases planned in the month** — Req QV-54 — L1 `dp-milestones.test.mjs` ("QV-54: a release without a DDT Date is listed in the months of its Planned / ToBePlanned milestones, but not counted"); browser check with the DP data: pick a month in which a release without a DDT Date has an SFV / PRD / RPE date with status Planned or ToBePlanned — it is listed with "… · planned, not counted" in Month & Year; the Completed and Supported Releases counts above the table do not change; the Month filter note names how many releases have neither.

**TC-QV-36 DP Supported never more than the month's list** — Req QV-56 — L1 `dp-milestones.test.mjs` ("DP counts for a month: Completed = releases with DDT Done in the month; Supported = unique listed releases with any milestone Done in the month (QV-56)"); `streams.test.mjs` ("Pulse Check streams: the five Azure streams in order, not-set-up ones listed, each read with its rule"); browser check with the DP data: for a month, Supported Releases ≤ the rows listed for the month; a release with SFV Done this month but its DDT in a later month is not Supported this month.

**TC-QV-37 Release naming patterns** — Req QV-55, QV-52 — L1 `naming-patterns.test.mjs` ("QV-55: wildcard patterns — * any text, {…} the release name; Content up to _RELEASE, IOCC after Conformance Verification / Test Tools"; "QV-55: patterns are shared settings — checked on read, per stream, built in when not saved; same list for the same settings"; "QV-55: Content documents are grouped under their release; IOCC by Conformance Verification and Test Tools names, others as before"); E2E `shell.e2e.mjs` ("TC-QV-37: Stream mapping → Release naming patterns — built-in Content and IOCC patterns, a Title tried, a pattern edited, applied and reset"); browser check with the Content and IOCC data: Release Details → Content shows one row per _RELEASE name with its documents under it; IOCC shows Conformance Verification and Test Tools groups; change a pattern, Apply, Save to Git — another browser shows the same names.

**TC-QV-38 Epics to match Features in** — Req QV-57 — L1 `feature-epics.test.mjs` ("QV-57: per stream, the Epics a release is matched in — checked when read, shared in Git (TC-QV-38)"; "QV-57: the board match searches only the Features and User Stories under the chosen Epics (TC-QV-38)"); E2E `shell.e2e.mjs` ("TC-QV-38: Stream mapping → Epics to match Features in — per stream, chosen from the board, cleared back to the whole board"); browser check with the QMS-0025 board and a stream view: choose the stream's Epics, Save to Git — the Board column matches only Features under them (a same-named Feature in another Epic is no longer offered) and Create Feature's existing-match check follows; Clear — the whole board again; another user loads the setting from Git.

**TC-QV-39 Release counts with entered placeholders** — Req QV-58 — L1 `release-counts.test.mjs` ("QV-58: entered release counts — CP, DP and IOCC only, months YYYY-MM, whole numbers (TC-QV-39)"; "QV-58: a stream without data takes the entered counts, marked; without them it is a placeholder; data always wins (TC-QV-39)"); E2E `shell.e2e.mjs` ("TC-QV-39: an Admin enters CP release counts for a month without data; My dashboard shows them as entered, the others as placeholders"); browser check: with CP not fetched, enter CP Completed 3 / Supported 5 for the month — My dashboard, the CP page, Pulse Check and the Monthly pack show 3 / 5 as entered; fetch CP — its real counts replace them; DP without data and without entered counts shows — and the reason.

**TC-QV-40 IOCC bulk Features and bulk creation Epics** — Req QV-59 — L1 `bulk-epics.test.mjs` ("QV-59: the bulk creation Epic per stream — mine over shared over built in; IOCC has none built in (TC-QV-40)"; "QV-59: IOCC releases in bulk — the Epic setup’s DoD and stories (no Release / PU sets, DPF-09), QE by the release name (TC-QV-40)"); E2E `shell.e2e.mjs` ("TC-QV-40: Stream mapping → Bulk creation Epics — shared and my own Epic per stream, mine used"); browser check with the QMS-0025 board and IOCC: set the IOCC bulk Epic (shared), its Feature setup (Release / PU sets, QE Mapping columns), tick IOCC releases, Create Features — each Feature is created under that Epic with its set's DoD and stories, assigned to the mapped QE; set my own DP Epic — DP's Create Features uses it, others keep the shared one.

**TC-QV-42 IOCC bulk creation uses the IOCC Feature setup** — Req QV-61, QV-59 — L1 `bulk-epics.test.mjs` ("QV-61: IOCC bulk creation uses the IOCC Epic's own Feature setup (DoD and User Stories); without a setup a release is skipped (TC-QV-42)"); browser check: with a Feature setup (DoD and stories) on the IOCC bulk Epic, IOCC → Create Features says it uses that Feature setup and each row lists its User Stories; the created Feature has that DoD and those stories.

**TC-QV-41 My naming patterns** — Req QV-60, CON-93 — L1 `my-naming-patterns.test.mjs` ("My naming patterns: IOCC, Content and Tool Validations only, kept here, used for me instead of the shared ones (QV-60, TC-QV-41)"); E2E `shell.e2e.mjs` ("TC-QV-41: My settings → My naming patterns — your own patterns for IOCC, Content and Tool Validations, kept on this computer, back to the shared ones"); browser check: with Content fetched, My settings → My naming patterns → Content: a pattern of your own changes Release Details → Content and the Content counts for you only (another browser keeps the shared names); Use the shared patterns restores them; DP and CP are not offered.


**TC-QV-24 CP releases from the asset Titles** — *(Retired — see TC-QV-25)* Req QV-40 — L1 `streams.test.mjs` ("CP: the release from the asset Title "[Release name] [Release No] [Asset name]", each release once; fuzzy QMS-0025 match (TC-QV-24)"); browser check with a CP query holding three assets of one release in both namings ("Care Pathways 3.1 Test Report", "Care Pathways 3.1.0 SRS", "Risk Analysis v3.1 (Care Pathways)") and one of another (3.2), and a QMS-0025 Feature "CP | Care Pathways | v3.1": Release Details → CP lists two releases (3 and 1 assets), 3.1 with its Feature and %, 3.2 with Create Feature opening the New Feature form titled "Care Pathways | v3.2" (release name and number only) under the CP Epic, and found after it is created; Pulse Check's Releases and Supported summary show "CP [2]"; no page errors. **UAT**

**TC-QV-25 CP release reporting from QA/QE signatures** — Req QV-41…QV-45 — L1 `cp-reporting.test.mjs` ("CP release reporting: Supported and Completed per Release container from QA/QE signatures (TC-QV-25)"; "CP release reporting: slots, roles, dates and month boundaries (TC-QV-25)"; "CP release names: version from the title, Content from the CP_Releases data set, never deciding the count (TC-QV-25)"; "CP Create Feature title: the release name and number only, found again by the board match (TC-QV-25)"; "the CP menu entry: its tree-query connection, listed even when hidden from the menu (TC-QV-25)"; "CP names: the connection with Content is used, a Release with text around the version is read, and a missing version says why (TC-QV-25)"); browser check in the desktop app with the CP connection holding the CP_Release_Folder tree query and a second CP connection with CP_Releases, month October 2026: Release Details → CP shows Supported, Completed and signed-document counts; a release with twelve asset folders is one row; a release whose main Release Notes is signed in October is Completed, one with only an asset's Release Notes is not; Clinical Platform Global is under Shared activity; names read "Setebos 26.2" or show their status; a row opens its signatures; Export evidence CSV downloads the month's signatures; Pulse Check's CP quadrant and Supported summary match; no page errors. **UAT**

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

**TC-CAP-09 Remove a person; who counts in capacity** — Req CAP-33, CAP-34 — L1 `capacity.test.mjs` ("CAP-33: a person removed in Resources is left out of capacity, utilization and team totals (hours too), listed apart; restore brings them back"); E2E `shell.e2e.mjs` ("TC-CAP-09: Resources shows who counts in the month's capacity; Remove takes a person out of capacity, Restore brings them back") — **UAT**; browser check with real data: Settings → Resources shows "Capacity in <Month>: n people, X h available" and Info lists the people; remove a person who left — the count drops by one, Pulse Check → Last month and the Team overview Utilization tile no longer count them; Save to Git, reload in another browser — still removed; Restore brings them back.

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

**TC-CAP-22 People & access, Remove and capacity roles** — Req CAP-48, CAP-49, CAP-50, CAP-57, CAP-51, CAP-33 — L1 `people-access.test.mjs` ("CAP-49: a person's work email is kept with their profile (checked, lower case)"; "CAP-57: only the team Role decides capacity — Lead and Manager are not counted by default; app access roles and the People manager tick never count (TC-CAP-29)"; "CAP-50: capacity roles read from Git are checked; the built-in choice is not stored; access roles come from access.json"); E2E `shell.e2e.mjs` ("TC-CAP-22: People & access — one page; names and emails from Azure DevOps (nothing typed); Remove asks left or not in the team; capacity roles": sections People / Capacity roles / Role rights, the setup-only columns, no Add a person and no email fields, "No email in Azure DevOps" with the sample, Mapping incomplete, Left the team on sets Left on, Lead / Manager unticked by default, no app access roles) and ("TC-CAP-09: …": Not part of the team removes and Restore brings back) — **UAT**; browser check with real data and Git: add a new colleague to the team in Azure DevOps, refresh — they appear with the name and email from Azure DevOps; give them an app access role — access.json has their email and role; set region, role and reports to; mark a leaver Left the team at month end — the next month no longer counts them, the earlier months are unchanged; tick Lead in Capacity roles — the lead's hours and capacity appear in Pulse Check.

**TC-CAP-23 People and emails from Azure DevOps** — Req CAP-51, CAP-30, CAP-29 — L1 `people-access.test.mjs` ("CAP-51: a person's work email comes from Azure DevOps (Assigned To); one saved in the profile is used only where Azure has none"); E2E `shell.e2e.mjs` ("TC-CAP-23: People & access lists the Azure DevOps team members with the names and emails Azure gives": the team read on opening, emails lower case, groups left out, "n team members read from <team>", "Team member · no Time Writing yet"); browser check with the Time Writing connection: a PAT without Project and Team (Read) shows the hint and still lists the Assigned To people; ↻ Read the team again reads it again; a person with settings only from the historical hours is under "Not in Azure DevOps".

**TC-CAP-24 Calculation profile terms and cards** — Req CAP-52, CAP-45, CAP-41 — L1 `calculation-profiles.test.mjs` ("CAP-52: a profile chooses its Absence kinds and NPRA parts; the cards show its names and formulas"); E2E `shell.e2e.mjs` ("TC-CAP-13: …": the four cards Utilization, Funded Hours, Absence, NPRA Hours with their bracketed formulas; Overloaded and Has capacity counted in the Who has capacity count; the Funded Hours / Absence column names); browser check with Git: copy Current (v4), untick Sick Leave, Unplanned Leave and Other absence and Training, make it the default — the Absence card reads [Holiday + PTO] and its hours drop, NPRA Hours read [Tagged NPRA hours], Available hours rise by the unticked leave; give the profile the name "Contract hours" for Funded Hours under Names — the card, the columns and the formula use it; Save to Git.

**TC-CAP-25 Edit a built-in calculation profile** — Req CAP-53, CAP-41, CAP-52 — L1 `calculation-profiles.test.mjs` ("CAP-53: a built-in profile can be edited; it keeps its id and place, is marked changed, and reset brings the built-in back"; "CAP-41: profiles read from Git are checked; unknown defaults fall back to \"Current (v4)\""); E2E `shell.e2e.mjs` ("TC-CAP-25: a built-in calculation profile can be edited, shows as changed, drives the cards, and resets to the built-in one"); browser check with Git: edit Current (v4), Save to Git, reload in another browser — the change is there; lock a month first and check its figures stay.

**TC-CAP-26 Utilization formula builder** — Req CAP-54, CAP-41 — L1 `calculation-profiles.test.mjs` ("CAP-54: the utilization formula as Top ÷ Bottom follows the profile and its names"); E2E `shell.e2e.mjs` ("TC-CAP-16: …" — ticks figures in the top and the bottom, checks the sentence and that a figure is never in both); browser check: in Settings → Calculation profiles edit a profile, untick Training in the top, tick it in the bottom — the sentence reads "… ÷ (Funded Hours − Absence − Training) × 100", Save, the Pulse Check cards follow.

**TC-CAP-27 Typed utilization formula (fx)** — Req CAP-55 — L1 `formula.test.mjs` ("CAP-55: a typed formula reads like Excel — figures in brackets, + - * / ( ), MAX, MIN, ROUND, IF; blank on / 0"; "CAP-55: a formula that does not read says why"); `calculation-profiles.test.mjs` ("CAP-55: a profile with a typed formula — the v4 formula typed gives the v4 figures; another formula drives person and team"); E2E `shell.e2e.mjs` ("TC-CAP-27: a calculation profile with a typed formula (fx) — starts from the ticks, is checked as typed, is saved and drives the figures"); browser check with the team data: make a copy of Current (v4) with fx on and its starting formula — every person's and the team's figures equal Current (v4); change it to =[Project work] / [Funded Hours] * 100, make it the default — Pulse Check cards, Team overview Utilization and the Monthly pack follow; Save to Git and reload in another browser.

**TC-CAP-28 My capacity under every name; the reason when not counted** — Req CAP-56 — L1 `capacity.test.mjs` ("CAP-56: my capacity is found under every name my work email carries; when I am not counted the reason is given (TC-CAP-28)"); browser check with the Time Writing connection: Time Writing as Me shows the same Capacity as when your name is chosen at the top right; for a month without a Task of yours, or with a Joined on after it, the Capacity tile shows — and the reason, and My dashboard → My hours says “Not counted in <month>: <reason>”.

**TC-CAP-29 Capacity by team Role only** — Req CAP-57, CAP-50 — L1 `people-access.test.mjs` ("CAP-57: only the team Role decides capacity — Lead and Manager are not counted by default; app access roles and the People manager tick never count (TC-CAP-29)"); E2E `shell.e2e.mjs` ("TC-CAP-22: People & access — one page; names and emails from Azure DevOps (nothing typed); Remove asks left or not in the team; capacity roles": no app access roles in Capacity roles); browser check: a person with app access role Admin / People Manager (or the People manager tick) and team Role QE has capacity on Time Writing and in Pulse Check; a person with team Role Lead is listed apart with "team role Lead".

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

**TC-GIT-07 Table defaults and match threshold shared in Git** — Req GIT-14, UI-12 — L1 `git-storage.test.mjs` ("GIT-14: Table defaults and the release-source settings are shared in the planning file; an older file leaves them alone"); E2E `shell.e2e.mjs` ("TC-GIT-08 …": the planning file carries Table defaults); browser check with two browsers: change Settings → Table defaults to Compact and the fuzzy match threshold to 70 %, Save to Git; the other browser (Reload, or wait for GIT-15) shows Compact and 70 %.

**TC-GIT-08 Changes saved by others reach an open app** — Req GIT-15 — L1 `git-watch.test.mjs` ("GIT-15: a check names the shared files whose version in Git is not the one loaded here"; "GIT-15: the banner names the shared files as people know them"); E2E `shell.e2e.mjs` ("TC-GIT-08: while the app is open, newer planning data in Git loads by itself and other newer shared files show a Reload banner"); browser check with two browsers: keep the app open in B; in A change a calculation profile and Save to Git — within 5 minutes (or when B's window is brought back) B shows the new profile and "Updated from Git at …"; in A save the Monthly pack setup — B shows the "Newer data in Git: Monthly pack setup" banner, and Reload shows it; with an unsaved change in B, newer planning data shows in the banner instead of loading.
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

**TC-SET-06 Admin pages, My settings and sections** — Req SET-15, SET-16, NAV-17 — L1 `my-views.test.mjs` ("Admin and My settings: the pages, and older links opening where they moved (SET-15, TC-SET-06)"); E2E `shell.e2e.mjs` ("TC-SET-06: Admin lists the shared setup pages, My settings opens from your name; sections show one at a time with their scope, and the last one is remembered" — also opens the connection editor from Streams, KB-24; also "TC-NAV-01 / TC-NAV-17" for the Admin group and entries); browser check: the menu has an ADMIN group with Streams, Stream options, Feature setup, People & roles, Data & sharing (and, with their permissions, Capacity & time, Reports, Master data, History); each opens its page with its name in the header; your name in the sidebar opens My settings with Your work email · Servers and PATs · My views; every section shows its scope chip; after another page and back, the section last shown is open; Feature setup and Streams have no section row; Get started → Open for the token step lands on My settings → Servers and PATs, for Git on Data & sharing → Git storage; a stream not set up in the menu (＋) opens Streams; no page errors.

**TC-SET-07 My views** — Req SET-17, CON-42 — L1 `my-views.test.mjs` ("My views: on a server with a PAT, never named after a stream, never a stream connection, never in Git, kept when the shared setup is reset (SET-17, TC-SET-07)"); E2E `shell.e2e.mjs` ("TC-SET-07: My views — a view of your own on a server you have a PAT for, under Other views in the menu, never a stream and never in the shared setup"); browser check: My settings → My views offers only servers with a PAT; a view named DP is refused; a view with a name, project and WIQL query is added, fetched and listed under Other views in the menu; it is not in Data & sharing → Other views, not in Shared setup in Git (Save stream mapping to Git leaves it out), not in a JSON backup; Back up and remove all keeps it.

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

**TC-DOC-04 Private Tool Validation Package downloads** — Req DOC-12 — L1 `tool-validation.test.mjs`: configured repository and branch, authenticated read-only GET, fixed folders, path rejection, binary fidelity above 1 MB and safe errors. E2E `tool-validation.e2e.mjs`: missing configuration, list/search, DOCX download bytes, denied access, refresh and connection settings. Execute the same workflow in Web and Windows Desktop; verify downloaded PDF, Word and CSV files open in their native viewers. No private content or PAT is included in app exports or the public build.
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

**TC-UI-04 Tables follow one design default** — Req UI-07, UI-08, UI-09, UI-10, UI-12 — L1 `table-defaults.test.mjs` ("table defaults: unknown values dropped, missing ones from the built-in default (TC-UI-04)", "column layout: saved order first, new columns where they stand; ↑ ↓ and drag moves (TC-UI-04)"); E2E `documents-and-data.e2e.mjs` ("TC-UI-04 / TC-UI-05: every table follows the table default — move, hide, density, one Export with Excel dates; Settings → Table defaults changes them all"); browser check: on DP, IOCC, a Windchill export's Releases, unique locations and Raw data — drag a heading onto another and use ↑ ↓ in Columns (1, 2, 3 → 2, 3, 1), untick a column, drag a heading edge, switch Wrap text and Compact, reload: the layout stays; Reset layout restores it; each table has one Export (no Export CSV / Export releases CSV buttons left); in Settings → Table defaults untick CSV — every Export offers Excel only; untick Move columns — no table can be rearranged.

**TC-UI-05 Dates exported as Excel date-times** — Req UI-10, UI-11 — L1 `table-defaults.test.mjs` ("export: dates become real date-times in Excel and CSV; numbers stay numbers; formulas neutralised (TC-UI-05)"); E2E `documents-and-data.e2e.mjs` (as TC-UI-04); browser check: export DP's query output as Excel and as CSV, open both in Excel — Changed Date / DDT Date are dates (right-aligned, formattable as Long Date and time), numbers are numbers, a cell starting with "=" stays text.

**TC-UI-06 Page tables on the table default** — Req UI-13 — E2E `documents-and-data.e2e.mjs` ("TC-UI-06: the page tables follow the table default too — My Work keeps its tree, Backlog Health its lists, each with Columns and one Export"); browser check: on Pulse Check (Ongoing activities, Windchill exports, Supported Releases), CP, Baselines, Snapshots, My Tasks [Board], Bulk actions, Monthly Time Writing and Backlog Health — every table has Columns, Wrap text, Comfortable / Compact and one Export ▾ (Excel / CSV); the summary tables — Dashboard, Pulse Check's release counts / last vs this month / work closed and opened, the capacity summaries, Insights, the Monthly pack KPI table and Documentation — stay plain, without that toolbar; open a Feature on My Tasks [Board] — its Stories and Tasks appear as rows under it; Backlog Health has no Export CSV or Columns dialog of its own; Monthly Time Writing's Original Estimate / Completed Work cells still edit.

**TC-UI-07 Desktop zoom and Auto** — Req UI-14 — L1 `desktop-zoom.test.mjs` ("UI-14: Auto zoom fits the 1440 × 880 layout into the window, 67%–100% in 5% steps; − / + in 10% steps, 50%–200%"; "UI-14: the zoom setting is kept per computer — Auto on by default, a hand-set zoom turns it off"); E2E `shell.e2e.mjs` ("TC-UI-07: the desktop app zooms — Auto fits the window, − / + / 100% and Ctrl keys set it by hand and turn Auto off; the browser has no zoom control"); desktop check: on a 1366 × 768 screen (or a smaller window) the app opens zoomed out so the whole page fits; resize the window — the zoom follows; Ctrl + / Ctrl − / Ctrl + wheel change it and untick Auto; restart — the zoom is kept.

**TC-UI-08 My Work page names** — Req UI-15 — L1 `format.test.mjs` ("page registry has unique ids, known groups and header text for every page": My Work lists Time Writing, My Tasks [Board], Sprint check); E2E `shell.e2e.mjs` ("TC-ACT-01: Time Writing is under My Work for everyone; the Testing heading is for the Admin role only"); browser check: the menu shows Time Writing and My Tasks [Board] under My Work, each opens with that heading, and My dashboard's links read Time Writing → and My Tasks [Board] →.

**TC-UI-09 Side menu folds to icons** — Req UI-16 — E2E `shell.e2e.mjs` ("TC-UI-09: the side menu folds to icons and back, names on hover, kept after a reload"); browser check at 1440 px: « folds the menu to icons, hovering shows the page name, » shows the names again, a reload keeps the choice; below 1000 px the toggle is hidden.

**TC-UI-10 Chart axis names and data labels** — Req UI-17 — L1 `chart-labels.test.mjs` ("UI-17: data labels — off by default, the shared default from Table defaults, each chart's own choice wins (TC-UI-10)"); E2E `shell.e2e.mjs` ("TC-UI-10: charts name their axes and show values when Data labels is ticked, kept per chart"); browser check: every chart shows its X and Y axis names; tick Data labels on a chart — its values appear; Settings → Table defaults → Charts → Data labels on — every chart without its own choice shows values.

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

**TC-PCK-06 The pack in the team's PowerPoint template** — Req PCK-01, PCK-08 — L1 `pptx-template.test.mjs` (all tests, with a synthetic template — the real one is never in this repository); browser check with the team template:
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

**TC-ACT-17 Time Writing cards stay at the top; Add a new activity in the list** — Req ACT-22, ACT-20 — E2E `shell.e2e.mjs` ("TC-ACT-02: Time Writing shows the person's KPI cards, month tasks, hours and deadline": scrolled to the end, the cards sit under the top bar; ＋ Add a new activity is in the list's heading row and there is no “Add activities” heading); browser check: scroll a long month — the cards stay at the top.

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

**TC-DPF-02 QE from the QE Mapping** — Req DPF-02 — L1 `dp-bulk.test.mjs` ("DPF-02: the QE comes from the QE Mapping row naming the product (PsName, else Program); columns chosen in the setup"); browser check: choose the product and QE columns in Feature setup → Epic 13946, Save to Git; the DP table’s QE column shows the mapped QE.

**TC-DPF-03 Possible QEs** — Req DPF-03 — L1 `dp-bulk.test.mjs` ("DPF-03: possible QEs are the people on the earlier releases of the product, newest first, without the QE and the release's own assignee"); browser check with All months: a product with several releases lists the earlier releases’ assignees.

**TC-DPF-04 Create Features in bulk** — Req DPF-04, DPF-05 — L1 `dp-bulk.test.mjs` ("DPF-04 / BLK-01: the bulk plan — title, type, QE with email, or why a release is skipped; a 100% Feature match is never created"); browser check with QMS-0025 (a test Epic first): a DP release with a Feature matching 100 % has its tick disabled (tooltip names the Feature) and Select all shown leaves it out; tick a PU and a Major release (one with a similar Feature below 100 %) → Create Features lists both, the second with "a similar Feature #… exists"; Create → the top bar shows progress and "2 of 2 Features created"; each Feature has the type’s DoD and Release Classification, the type’s User Stories, the Time Writing story and Task, all assigned to the QE.

**TC-DPF-05 QE picked per release in bulk** — Req DPF-06, DPF-04, CNB-02 — L1 `dp-bulk.test.mjs` ("DPF-06: the QE picked in the pop-up replaces the QE Mapping's and lets a release without one be created; other reasons still skip it (TC-DPF-05)"); browser check with the QMS-0025 board and DP / IOCC / Content data: Create Features shows a person drop-down on each release that will be created, prefilled from the QE Mapping (its name under it) or, for Content, from Assign all; a release with no QE in the mapping can be picked and is then created; changing a row assigns that Feature and its stories and Task to the person picked; the result lists each Feature with its person.

**TC-DPF-06 DoD and User Stories per Release Classification value** — Req DPF-07, EPS-07 — **UAT** — L1 `class-sets.test.mjs` ("DPF-07: an Epic keeps a DoD and User Stories per Release Classification value, cleaned and saved (TC-DPF-06)", "DPF-07: the value chosen picks its own set, else the Epic default; old Release / PU sets are not used (TC-DPF-06)", "DPF-07, DPF-09: bulk sets — the value’s set, else the Epic’s own; nothing without a setup (no built-ins)", "DPF-07: my own version without sets per value uses the shared ones", "DPF-07, DPF-09: an Epic’s Release Classification values come from its own List field only (no built-in values)"); `dp-bulk.test.mjs` ("DPF-04 / BLK-01: the bulk plan …": an Epic with a setup uses its own DoD, DP's built-ins only without a setup); E2E `backlog.e2e.mjs` ("TC-DPF-06: a DoD and User Stories per Release Classification value — set up per Epic, picked by the value chosen in New Feature"); UAT: give an Epic's Release Classification values their own DoD and stories, Save to Git, create a Feature for two values and check its DoD and User Stories in Azure DevOps.

**TC-DPF-07 Release Classification per row in bulk** — Req DPF-08, DPF-07 — L1 `class-sets.test.mjs` ("DPF-08: bulk rows — the classification prefilled from the release number, picked per row, and it picks the set (TC-DPF-07)", "DPF-07, DPF-09: an Epic’s Release Classification values come from its own List field only (no built-in values)": the picked value fills the Epic's field); browser check: DP and IOCC Create Features show the drop-down per row, prefilled from the number, and the row's User Stories change with it.

**TC-DPF-08 No built-in Release Classification or Release / PU lists** — Req DPF-09, DPF-01, BKL-06, QV-61, BKL-13, CNB-01 — L1 `dp-bulk.test.mjs` ("DPF-09: no built-in Release / PU sets — the old ones are no longer read; the QE Mapping columns stay", "DPF-04 / BLK-01: the bulk plan …": no setup at all is skipped, no built-in set; "DPF-08: the type read from x.y.z.a …"), `class-sets.test.mjs` ("DPF-07, DPF-09: bulk sets — the value’s set, else the Epic’s own; nothing without a setup (no built-ins)", "DPF-07, DPF-09: an Epic’s Release Classification values come from its own List field only (no built-in values)"), `bulk-epics.test.mjs` ("QV-61: IOCC bulk creation uses the IOCC Epic's own Feature setup (DoD and User Stories); without a setup a release is skipped (TC-QV-42)"), `content-bulk.test.mjs` (no Release Classification), `feature-setup-inheritance.test.mjs` ("Feature setup layers: Mine → Epic (shared) → All Epics → Built in, per field (CON-95, TC-CON-59)": no built-in DoD); E2E `backlog.e2e.mjs` ("TC-BKL-19: New Feature shows its sections one after another…": an Epic without a setup has no built-in DoD and no Release Classification field); browser check: Release Details → DP has no Release type column; the DP / IOCC Create Features pop-up has no Release Classification column for an Epic without its own field; Setup per Epic shows no value tabs for such an Epic.

**TC-CNB-01 Content Features in bulk** — Req CNB-01, DPF-05 — L1 `content-bulk.test.mjs` ("CNB-01: Content bulk Features — Epic 22919, NA, the DoD, one Review of Deliverables story, 4 h; a 100% Feature match is never created, a closer one is named (BLK-01)"); browser check with QMS-0025 (a test Epic first): Release Details → Content: releases with a Feature matching 100 % cannot be ticked; Select all, Create Features → the list shows each Feature title, with similar Features named; after Create each Feature is under Epic 22919 with "Release Classification : NA", "Feature DoD: All Documents are approved", one "Review of Deliverables - <title>" story in the current Sprint and the month Task with 4 h Original Estimate.

**TC-CNB-02 One person for all** — Req CNB-02 — L1 `content-bulk.test.mjs` ("CNB-02: the pop-up assigns to one person — a name on the board, "Name <email>" or an email"); browser check: Create stays disabled until a person is chosen; typing a board name shows its email; every Feature, story and Task made is assigned to that person.

**TC-EPS-01 Epic setup in New Feature and Admin** — Req EPS-01, EPS-02, SET-15 — E2E `backlog.e2e.mjs` ("TC-EPS-01: Epic setup — its fields appear in New Feature (a value list, required and warning fields), the title follows its pattern, and Admin → Epic setup shows them"); browser check with Git storage: Admin → Epic setup → choose CP's Epic, add Platform (List, Platform list, Block, Title) and Program (Text, Warn, Description), title pattern {platform} \| {feature}; Value lists → add Platform with two values; Save to Git (one commit); New Feature under that Epic offers Platform as a drop-down marked required, shows "Empty: Program", the Title follows the pattern; Create with Platform empty is refused naming it; with it, the Feature's Description has "Program : …"; Admin → Feature setup of that Epic says the Epic setup applies.

**TC-EPS-02 Epic setup file and New Feature rules** — Req EPS-01, EPS-02 — L1 `epic-setup.test.mjs` ("Epic setup file: lists and fields cleaned, round trip stable (EPS-01, TC-EPS-02)"; "Epic setup on a new Feature: Title by the pattern or the Title fields, Description lines, Block and Warn, list values (EPS-02, TC-EPS-02)").

**TC-EPS-03 Epic setup in bulk creation and Copy to Epics** — Req EPS-03, EPS-05 — L1 `epic-setup.test.mjs` ("Epic setup in bulk creation: Block skips, Warn creates and lists, values from the on-prem item, pattern title (EPS-03, TC-EPS-03)"; "Copy to Epics: the fields and pattern to the chosen Epics, replacing theirs (EPS-05, TC-EPS-03)"); browser check: with an Epic setup on the IOCC bulk Epic, Create Features shows a release without its Block field as skipped and one without its Warn field as "Will be created — empty …"; Copy to Epics gives two ECP Epics the same fields after Save to Git.

**TC-EPS-04 Epic setup permissions** — Req EPS-04, CON-94 — L1 `access.test.mjs` ("EPS-04: Edit Epic setup and its value lists — Tool Owner, Admin (and Scrum Master for the fields) by default; a file of v7.27 gets them as in the starting matrix (TC-EPS-04)"); browser check: as a Scrum Master, Admin → Epic setup lets you edit the fields but shows Value lists read-only; Deny “Edit the Epic setup” for the role and the fields become read-only.

**TC-EPS-05 On-prem field drop-down and the old title fields** — Req EPS-06, EPS-07 — L1 `onprem-values.test.mjs` ("On-prem field drop-down: the distinct values of the field across the fetched on-prem data, sorted, case ignored (EPS-06, TC-EPS-05)"), `feature-setup.test.mjs` ("title fields per Epic: up to five, unique names, saved with the setup; title, Description lines, placeholders and on-prem values" — the old title fields are no longer kept); browser check with on-prem data fetched: an Epic setup field Program (Text, on-prem field Custom.Program) is a drop-down of the Program values in New Feature; with a Release Classification field in the Epic setup, the built-in Release Classification picker is gone and the Description has one "Release Classification :" line; Admin → Feature setup → Remove the old title fields from Git commits feature-setup.json without titleFields.
**TC-EPS-06 Epic & Feature setup page** — Req EPS-08, SET-15 — E2E `backlog.e2e.mjs` ("TC-EPS-01: …" — the Epic in Setup per Epic with its fields), `shell.e2e.mjs` ("TC-SET-06: …" — the page's sections Setup per Epic and Value lists); browser check: an old link to the Feature setup or All Epic setups opens Setup per Epic.

**TC-ADM-01 Overview checks and settings search** — Req ADM-01, ADM-03 — L1 `admin-overview.test.mjs` ("Admin overview: open Get started steps and shared-setup checks, required first, each with its fix (ADM-01, TC-ADM-01)"; "Search settings: by name or what it affects, every page reachable (ADM-03, TC-ADM-01)").

**TC-ADM-02 Overview, Ctrl K and History** — Req ADM-01…04 — E2E `shell.e2e.mjs` ("TC-ADM-02: Admin → Overview lists what to set up with links (and the bulk Epic without a setup, TC-ADM-03); Ctrl K finds a setting and opens it; History filters the changes"); browser check with Git storage: change a capacity setting — the ADMIN heading shows 1 and the Overview shows Unsaved shared changes with Save to Git; Save to Git clears both; Ctrl K → "dod" offers Feature setup; History → choose an area and type part of a change.

**TC-ADM-03 Feature setup gaps on the Overview** — Req ADM-05 — L1 `admin-overview.test.mjs` ("ADM-05: bulk creation Epics without a shared Feature setup, and shared setups without a Feature DoD (TC-ADM-03)"); E2E `shell.e2e.mjs` ("TC-ADM-02: Admin → Overview lists what to set up with links (and the bulk Epic without a setup, TC-ADM-03); …"): on a fresh start the Overview warns "DP bulk creation Epic #13946 has no Feature setup"; browser check with Git storage: share a Feature setup for the DP bulk Epic and the warning goes; share a setup with an empty Feature DoD and no All Epics DoD and "Feature setup without a Feature DoD: #…" appears, its button opening Feature setup.

**TC-STT-01 User Story templates: library, tags and linked stories** — Req STT-01, STT-02 — **UAT** — L1 `story-templates.test.mjs` ("STT-01: a User Story template is cleaned and kept with the Epic setup (TC-STT-01)", "STT-01: the templates offered follow their Epic and Release Classification tags (TC-STT-01)"); E2E `backlog.e2e.mjs` ("TC-STT-01: a User Story template, linked in an Epic’s setup, gives New Feature its current title, ticked; Admin lists it with its tags"); UAT: save a story of an Epic's setup as a template, tag it to a second Epic and a Release Classification value, add it there with ＋ Add from templates, Save to Git, change the template's title and check that New Feature under both Epics offers the new title, ticked.

**TC-STT-02 Linked stories follow the template** — Req STT-02 — L1 `story-templates.test.mjs` ("STT-02: a linked story takes the template’s current title and description everywhere; a removed one keeps its copy (TC-STT-02)"); browser check: in Setup per Epic with Git storage that can save, Save as template marks the story Template; ＋ Add from templates adds a linked one; Unlink turns it back into an editable copy.
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
| CON-94 | TC-CON-58 |
| CON-95 | TC-CON-59, TC-CON-60 |
| CON-96 | TC-CON-60 |
| CON-97 | TC-CON-60 |
| CON-98 | TC-CON-61 |
| CON-99 | TC-CON-61 |
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
| BKL-01…03, BKL-12 | TC-BKL-01 |
| BKL-04…09, BKL-11 | TC-BKL-02 |
| BKL-10 | TC-BKL-03, TC-ATM-11 |
| BKL-13 | TC-BKL-04 |
| BKL-14 | TC-BKL-05, TC-BKL-16, TC-BKL-18 |
| BKL-15 | TC-BKL-06 |
| BKL-16 | TC-BKL-07 |
| BKL-17 | TC-BKL-08 |
| BKL-18 | TC-BKL-09 |
| BKL-19 | TC-BKL-10, TC-BKL-17 |
| BKL-20 | TC-BKL-11 |
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
| QV-38 | TC-CON-42 |
| OVR-01…08 | retired (TC-OVR-01…03 retired) |
| OV-11 | TC-OV-11 |
| OV-12 | TC-OV-12 |
| OV-13 | TC-OV-13 |
| OV-14 | TC-OV-14 |
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
| CAP-48 | TC-CAP-22 |
| CAP-49 | TC-CAP-22 |
| CAP-50 | TC-CAP-22 |
| CAP-51 | TC-CAP-22, TC-CAP-23 |
| CAP-52 | TC-CAP-24 |
| CAP-53 | TC-CAP-25 |
| CAP-54 | TC-CAP-26 |
| CAP-55 | TC-CAP-27 |
| CAP-56 | TC-CAP-28 |
| CAP-57 | TC-CAP-22, TC-CAP-29 |
| BAS-01…04 | TC-BAS-01 |
| BAS-05…07 | TC-BAS-02 |
| BAS-08…10 | TC-BAS-03 |
| BAS-11 | TC-BAS-04 |
| GIT-01 | TC-GIT-01 |
| GIT-03, GIT-04, GIT-08 | TC-GIT-02, TC-GIT-05 |
| GIT-02…04, GIT-06, GIT-08, GIT-12 | TC-GIT-02 |
| GIT-13 | TC-GIT-06 |
| GIT-14 | TC-GIT-07 |
| GIT-15 | TC-GIT-08 |
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
| SMP-05 | TC-SMP-02 |
| SMP-06 | TC-SMP-02 |
| DOC-01…03, DOC-05 | TC-DOC-01 |
| DOC-04, DOC-06…08 | TC-DOC-02 |
| DOC-09…11 | TC-DOC-03 |
| DOC-12 | TC-DOC-04 |
| UI-01, UI-02 | TC-UI-01 |
| UI-03, UI-04 | TC-INS-03 |
| UI-05 | TC-UI-02 |
| UI-06 | TC-UI-03 |
| UI-07 | TC-UI-04 |
| UI-08 | TC-UI-04 |
| UI-09 | TC-UI-04 |
| UI-10 | TC-UI-04, TC-UI-05 |
| UI-11 | TC-UI-05 |
| UI-12 | TC-UI-04 |
| UI-13 | TC-UI-06 |
| UI-14 | TC-UI-07 |
| UI-15 | TC-UI-08 |
| UI-16 | TC-UI-09 |
| UI-17 | TC-UI-10 |
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
| MYD-08 | TC-MYD-04 |
| MYD-09 | TC-MYD-03 |
| MYD-10 | TC-MYD-05 |
| MYD-11 | TC-MYD-05 |
| MYD-12 | TC-MYD-05 |
| MYD-13 | TC-MYD-06 |
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
| KPT-05 | TC-KPT-03 |
| DPF-01 | TC-DPF-01 |
| DPF-02 | TC-DPF-02 |
| DPF-03 | TC-DPF-03 |
| DPF-04 | TC-DPF-04 |
| DPF-06 | TC-DPF-05 |
| DPF-05 | TC-DPF-04, TC-CNB-01 |
| DPF-07 | TC-DPF-06, TC-DPF-07 |
| DPF-08 | TC-DPF-07 |
| DPF-09 | TC-DPF-08 |
| CNB-01 | TC-CNB-01 |
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
| ADM-05 | TC-ADM-03 |
| STT-01 | TC-STT-01 |
| STT-02 | TC-STT-01, TC-STT-02 |
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
| UC-01 | TC-NAV-01…06, TC-NAV-33, TC-NAV-37, TC-UI-01, TC-UI-02, TC-UI-03, TC-CON-36, TC-CON-38, TC-NAV-38, TC-NAV-39, TC-NAV-40, TC-NAV-41, TC-NAV-42, TC-NAV-45, TC-NAV-46, TC-NAV-47, TC-NAV-48, TC-UI-09, TC-UI-10 |
| UC-02 | TC-CON-01…07, TC-CON-17…19, TC-CON-44, TC-CON-28, TC-NAV-02, TC-NAV-34, TC-QV-14, TC-QV-16, TC-QV-23, TC-QV-24, TC-CON-46, TC-QV-25, TC-CON-47, TC-QV-38, TC-QV-39, TC-QV-40 |
| UC-03 | TC-CON-03, TC-FET-01…06, TC-FET-09 |
| UC-04 | TC-TWN-01, TC-TWN-02, TC-MON-01…06, TC-MON-09, TC-MON-10, TC-ATM-19, TC-BKL-18, TC-ACT-14, TC-ACT-15, TC-ACT-16, TC-ACT-17 |
| UC-05 | TC-MON-07 |
| UC-06 | TC-ATM-01…11, TC-ATM-21, TC-ATM-22, TC-ATM-23, TC-TWN-03, TC-CON-20, TC-CON-33, TC-CON-34, TC-CON-43 |
| UC-07 | TC-BKL-01…09, TC-BKL-15, TC-BKL-16, TC-BKL-17, TC-BKL-18, TC-BKL-19, TC-BKL-20, TC-BKL-21, TC-BKL-22, TC-BKL-23, TC-BKL-24, TC-BKL-25, TC-BKL-26, TC-BKL-27, TC-DPF-06, TC-NAV-36, TC-CON-23, TC-CON-25…27, TC-CON-29…32, TC-CON-35 |
| UC-08 | TC-QV-01…05, TC-FET-07, TC-CON-08, TC-CON-11…16, TC-QV-08, TC-QV-09, TC-QV-10, TC-QV-11, TC-QV-12, TC-QV-13, TC-QV-14, TC-QV-15, TC-QV-16, TC-CON-37, TC-CON-38, TC-CON-39, TC-CON-40, TC-CON-41, TC-QV-18, TC-QV-19, TC-QV-20, TC-QV-21, TC-QV-22, TC-CON-42, TC-QV-41, TC-QV-42, TC-CON-61 |
| UC-09 | TC-OV-11…14, TC-CAP-01, TC-CAP-02, TC-CAP-03, TC-CAP-08, TC-CAP-10, TC-CAP-11, TC-CAP-12, TC-CAP-13, TC-CAP-14, TC-CAP-15, TC-CAP-16, TC-CAP-17, TC-CAP-18, TC-CAP-19, TC-CAP-20, TC-CAP-21, TC-CAP-22, TC-CAP-23, TC-CAP-24, TC-CAP-25, TC-CAP-26, TC-CAP-27, TC-QV-17, TC-CON-21, TC-QV-10, TC-QV-11, TC-QV-21 |
| UC-10 | TC-OV-11 (Months, Streams), TC-OV-13 |
| UC-11 | TC-BAS-01…04 |
| UC-12 | TC-GIT-01…04, TC-GIT-05, TC-GIT-06, TC-GIT-07, TC-GIT-08, TC-ACC-03…05 |
| UC-13 | TC-SNP-01…03 |
| UC-14 | TC-SET-01…07, TC-CAP-02, TC-CAP-03, TC-NAV-34, TC-CAP-07, TC-CAP-09 |
| UC-15 | TC-STO-01…04, TC-SNP-04 |
| UC-16 | TC-UPD-01, TC-UPD-02 |
| UC-17 | TC-DSK-01…03, TC-INS-02 |
| UC-18 | TC-SMP-01, TC-ATM-06, TC-GIT-04, TC-SMP-02 |
| UC-19 | TC-INS-04, TC-CI-01, TC-CI-02, TC-CI-03, TC-CI-07, TC-CI-08, TC-DOC-03 |
| UC-20 | TC-DOC-01, TC-DOC-02, TC-DOC-03 |
| UC-21 | TC-SCR-01 |
| UC-22 | TC-ACC-01, TC-ACC-02, TC-CON-57, TC-CON-58 |
| UC-23 | TC-QEM-01…08 |
| UC-24 | TC-PCK-01…10 |
| UC-25 | TC-WSP-01…07 |
| UC-26 | TC-MYD-01…05, TC-QV-31, TC-QV-32, TC-QV-33, TC-QV-34, TC-QV-35, TC-QV-36, TC-QV-37, TC-MYD-06 |
| UC-27 | TC-HIS-01…11 |
| UC-28 | TC-ACT-01…12, TC-BKL-16, TC-BKL-17, TC-BKL-18, TC-ATM-21 |
| UC-29 | TC-OVW-01…03 |
| UC-30 | TC-CVA-01…03 |
| UC-31 | TC-KPT-01…03 |
| UC-32 | TC-DPF-01…04, TC-DPF-05, TC-DPF-06, TC-DPF-07, TC-DPF-08 |
| UC-33 | TC-CNB-01, TC-CNB-02 |
| UC-34 | TC-EPS-01, TC-EPS-02, TC-EPS-03, TC-EPS-04, TC-EPS-05, TC-EPS-06 |
| UC-35 | TC-ADM-01, TC-ADM-02, TC-ADM-03 |
| UC-36 | TC-STT-01, TC-STT-02 |

## 8. Result record

Copy this table for each test run. Status is one of Pass, Fail, Blocked or Not run. Every Fail needs a defect ID.

| Test case | Build | Env | Tester | Date | Status | Defect / note |
|---|---|---|---|---|---|---|
| TC-… | | | | | | |
