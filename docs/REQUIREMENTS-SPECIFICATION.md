# Demand Planning Hub — System Requirements Specification

| | |
|---|---|
| Document | SRS-DPH-001 |
| Product version | v1.2.2 (build tracked by CI run number) |
| Baseline | `main` at the Feature-milestones removal, Overview tabs and query views (PR #29) |
| Status | As-built baseline, for review |
| Companion | [TEST-PLAN.md](TEST-PLAN.md) — test cases traced to every requirement ID below |

## 1. Introduction

### 1.1 Purpose

This specification records, as verifiable requirements, what the Demand Planning Hub does in the build named above. It is the reference for verification ([TEST-PLAN.md](TEST-PLAN.md)), for UAT, and for judging later changes.

### 1.2 Scope and system boundary

The **system** ("the app") is the Demand Planning Hub single-page web application. It runs:

- in a browser from GitHub Pages; and
- inside the Demand Planning Hub desktop shell (Electron) on Windows and macOS.

External systems, which the system uses but does not control:

| External system | Interaction |
|---|---|
| Azure DevOps Services / Azure DevOps Server | Reads work items, iterations, areas and fields over REST. Writes a constrained set of fields. PAT authentication. |
| GitHub (repository contents API) | Reads and writes one planning-data JSON file (baselines, scopes, resource mapping). |
| GitHub Releases (`desktop-latest`) | Source of desktop installers and `latest.json`, for download and self-update. |
| Microsoft Entra ID + Microsoft Graph (SharePoint) | Optional central app-state file and snapshot files. |
| Browser storage (IndexedDB, localStorage, sessionStorage) | Local persistence of app data, settings and credentials. |

Out of scope:

- server-side components;
- role-based authorization (all audit entries are attributed to the single local actor `u-owner`);
- rendered PPT, PDF or PNG reports.

### 1.3 Conventions

The requirements are written to the characteristics of good requirements that the INCOSE *Guide for Writing Requirements* describes:

- necessary
- appropriate
- unambiguous
- complete
- singular
- feasible
- verifiable
- correct
- conforming

In practice:

- **Wording.** Each requirement is a single "The app shall …" statement with one result. Where a statement lists alternatives, the list is closed and named. Vague terms ("user-friendly", "fast", "etc.", "and/or") are not used. Numbers carry units.
- **Definitions.** Terms with a specific meaning are defined in §1.4 and used consistently.
- **Conditions.** These are written as "When …" or "If …" clauses at the start of the statement.
- **Attributes.** Every requirement carries:
  - **ID**: unique and stable, never reused.
  - **Rationale**: why it is needed.
  - **Verification method**:
    - **T** Test: automated or manual execution with a pass/fail result.
    - **D** Demonstration: operating the app and observing the result.
    - **I** Inspection: reading code, configuration or documents.
    - **A** Analysis: calculation or reasoning from other evidence.
  - **Priority**:
    - **M** Must: release-blocking.
    - **S** Should.
    - **C** Could.
  - **Trace**: up to the use cases (§2) and across to test cases (TEST-PLAN.md §6).
- **Rationale placement.** Rationale is kept out of the requirement text. Where several requirements share one rationale, the rationale is given once at the head of the group.
- **UI strings.** Quoted strings are the exact UI text and are part of the requirement.

Known deviations from the INCOSE guide:

- Some requirements describe as-built behaviour that has an open question attached. These are cross-referenced to §6 (Open issues) instead of being changed silently.
- This document is a self-assessment against the guide's characteristics. It has not been reviewed against a specific edition of the guide by an INCOSE-qualified reviewer.

### 1.4 Definitions

| Term | Definition |
|---|---|
| Connection | A saved Azure DevOps configuration in this browser. Fields: name, view name, show-in-menu, role, base URL (collection), project, optional team, PAT, optional WIQL query, optional creator email, optional API version. |
| Role (of a connection) | One of: `time-tracking` (Time Writing, read & write), `backlog-view` (read only), `release-source` (DHFI release documents, read only), `documents` (read only), `reference` (read only). |
| Active Time Writing connection | The selected `time-tracking` connection whose data feeds Overview, Monthly Time Writing, Assigned to Me and Baselines. |
| Month Task | An Azure DevOps Task whose title starts or ends with a month and year (§3.4). |
| Time Writing story | A User Story that is the parent of at least one Month Task, or whose title contains "Time Writing" (case-insensitive; space, `_` or `-` allowed between the words). |
| Absence Epic | The Epic whose ID is set in Capacity settings (default 37778). Tasks under it count as absence, not work. |
| Selected month | The `YYYY-MM` month chosen in the header month picker. Defaults to the current month in India time (Asia/Kolkata). |
| Pending | Not in the state Closed, Resolved, Done, Completed, Removed or Cut (case-insensitive). |
| Me | The identity used for "my" work: the Feature creator email of the active Time Writing connection, or a person name chosen in the app. |
| Saved data | The app state in IndexedDB database `demand-planning-data-v1`, store `snapshots`, key `current`. |
| Sample mode | The state after "Load synthetic sample" (`azureBacklogScope.sample = true`), until a fetch from Azure replaces it. |
| Build number | The CI run number (`GITHUB_RUN_NUMBER`) of the build that produced the app. |

## 2. Stakeholders and use cases

Stakeholders:

- **Team member** (QE/QMS/CAPA): writes their own time.
- **Team lead / manager**: plans capacity and reviews utilization.
- **Process owner**: sets periods, baselines and estimation rules.
- **App owner**: connections, storage, releases and deployment.

| ID | Use case | Primary actor |
|---|---|---|
| UC-01 | Navigate between pages and see data status in one place | All |
| UC-02 | Configure Azure DevOps connections and menu views | App owner |
| UC-03 | Fetch Azure DevOps data and have it saved automatically | All |
| UC-04 | Enter monthly Original Estimate and Completed Work on Month Tasks | Team member |
| UC-05 | Review gaps: items not picked up for the month | Team member, lead |
| UC-06 | Work through items assigned to me (finish, move to the current Sprint, create month tasks) | Team member |
| UC-07 | Browse and extend the Time Writing backlog (create a Feature hierarchy) | Team member, lead |
| UC-08 | View read-only query views and the Releases register | Lead, app owner |
| UC-09 | Review team or individual capacity for a month (Overview → This month) | Lead, manager |
| UC-10 | Review trends and problem areas over 6 or 12 months (Overview → Trends) | Lead, manager |
| UC-11 | Maintain estimation rules, release scopes and baselines | Process owner |
| UC-12 | Keep baselines and the resource mapping in a private Git repository | Process owner |
| UC-13 | Save LTE/PI snapshots to SharePoint and use SharePoint as central storage | Lead, app owner |
| UC-14 | Configure capacity, periods, resources, master data; review the audit | Process owner |
| UC-15 | Back up, restore and recover local data | All |
| UC-16 | Update the web app to the latest deployed build | All |
| UC-17 | Install and update the desktop app | All |
| UC-18 | Explore the app with a synthetic sample dataset | All |
| UC-19 | Build, verify and deploy the app | App owner (CI) |
| UC-20 | Read the requirements, test plan and other project documents in the app | All |

## 3. Functional requirements

### 3.1 Navigation and layout (NAV) — UC-01

*Group rationale: the user asked for a compact header with refresh and data notices in one place, and a sidebar grouped by purpose.*

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| NAV-01 | The app shall show a sidebar with the groups, in this order: "Overview", "My Work", "Azure DevOps", "Data & governance". | D | M | UC-01 |
| NAV-02 | The app shall list "Overview" under the group "Overview". | D | M | UC-01 |
| NAV-03 | The app shall list "Assigned to Me", "Bulk actions" and "Monthly Time Writing", in that order, under the group "My Work". | D | M | UC-01 |
| NAV-04 | The app shall list "Baselines", "Snapshots", "Settings" and "Documentation", in that order, under the group "Data & governance". | D | M | UC-01 |
| NAV-05 | The app shall list one entry under "Azure DevOps" for each view returned by the view rules in CON-10 to CON-12. | T | M | UC-01, UC-02 |
| NAV-06 | When no Azure DevOps view exists, the app shall hide the "Azure DevOps" group. | D | S | UC-01 |
| NAV-07 | The app shall show Azure DevOps views as separate sidebar entries, not as tabs within one page. | D | M | UC-01 |
| NAV-08 | The header shall contain only: the page title, the page's Team/Individual switch (Overview and Monthly Time Writing), the data-status chip with its refresh button (FET-10), the month picker on pages that use a month, and the theme toggle. | I | M | UC-01 |
| NAV-09 | The header shall show the month picker on Overview, Monthly Time Writing, Baselines, Snapshots and Settings. It shall hide the picker on Assigned to Me, the Azure DevOps views and Documentation. | D | M | UC-01 |
| NAV-10 | The month picker shall accept only values of the form `YYYY-MM`. | T | M | UC-01 |
| NAV-11 | The month picker shall default to the current month in the Asia/Kolkata time zone. | T | S | UC-01 |
| NAV-12 | Every date and time that tells when data was fetched, saved or built (view bars, connection list, header status tooltip, build details, Git commit messages) shall be shown in the viewer's own time zone with the zone named (e.g. "20 Oct 2026, 21:05 CEST"), and "today" (overdue, changed in 7 days, plan checks) shall be the viewer's local date. Month assignment of Time Writing stays on Asia/Kolkata (NAV-11). | T | S | UC-01 |
| NAV-12 | The page title's tooltip shall carry the page description from the page registry. Pages shall not repeat a page header inside the content. | I | S | UC-01 |
| NAV-13 | The app shall show the data notices (FET-12 to FET-16) once, directly below the header, on every page. | D | M | UC-01, UC-03 |
| NAV-14 | The sidebar footer shall show the storage label, exactly one of: "● Live SharePoint", "⚠ Not saved locally", "◌ Saving locally", "○ Local IndexedDB". | D | S | UC-15 |
| NAV-15 | The sidebar footer shall show the app version as "v{x.y.z}", "Build {n} · ID {buildId}", and the local build time. | D | M | UC-16 |
| NAV-16 | A modal dialog shall render above all page content, with nothing from the page drawn over it. Page scrolling behind it shall be blocked while it is open. | D | M | UC-01 |

### 3.2 Azure DevOps connections and views (CON) — UC-02

*Group rationale: several Azure DevOps sources differ by query or by base URL. Only some of them are views; the rest serve as backend data.*

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| CON-01 | The app shall show the Azure DevOps connections as the first section of Settings, with anchor `settings-connections`. | D | M | UC-02 |
| CON-02 | The connection form shall provide these fields: "Name" (required), "View name (optional)" (max 80 characters), "Show in menu", "Used for", "Server URL (on-prem only)", "Organization / collection" (required), "Project" (required), "API version (optional)", "PAT", and "Query (optional, WIQL)". It shall also show "Team" for the time-tracking and backlog-view roles, and "Feature creator email (optional)" for the time-tracking role. | D | M | UC-02 |
| CON-03 | When the role in the form changes, the form shall set "Show in menu" to on for the time-tracking and backlog-view roles, and to off for the release-source, documents and reference roles. | T | M | UC-02 |
| CON-04 | The app shall reject a save without a name, with "Give the connection a name, e.g. "Time Writing" or "DHFI releases"." | T | M | UC-02 |
| CON-05 | The app shall reject a time-tracking connection that has neither a team nor a query, with "A Time Writing connection needs a team (its Epic backlog is read) or a query." The equivalent rule applies to a backlog-view, with "A backlog view needs a team (its Epic backlog is shown) or a query." | T | M | UC-02 |
| CON-06 | The app shall reject an API version that does not match `NN.N` with an optional `-preview[.N]` suffix, with "API version looks like 7.1, 6.0 or 5.0." | T | S | UC-02 |
| CON-07 | The app shall reject a new connection without a PAT, with "Enter the PAT for this connection." When an existing connection is edited and the PAT field is left empty, the saved PAT shall be kept. | T | M | UC-02 |
| CON-08 | The app shall accept only https base URLs without credentials. Without a server URL, the base shall be `https://dev.azure.com/{organization}`. With a server URL, the base shall be the server URL followed by the collection. | T | M | UC-02 |
| CON-09 | The button "Save and refresh data" shall save the connection and then fetch it immediately (FET-01). | D | M | UC-02, UC-03 |
| CON-10 | The view list shall contain the active Time Writing view when no time-tracking connection exists, or when the active one has Show in menu on. | T | M | UC-02 |
| CON-11 | The Time Writing view shall be named by its connection's View name, otherwise "QMS-0025". | T | M | UC-02 |
| CON-12 | The view list shall contain, after the Time Writing view, every other connection with Show in menu on. Each is read only and named by its View name, otherwise its connection name. | T | M | UC-02 |
| CON-13 | The connection table shall show, for each connection, "In menu as "{view name}"" or "Hidden from menu (backend only)". | D | S | UC-02 |
| CON-14 | The connection table shall provide the actions Fetch, Test, Edit, Clone and Remove for each connection. | D | M | UC-02 |
| CON-15 | Remove shall ask "Remove "{name}" from this browser? Its PAT is not revoked in Azure DevOps." before deleting the connection. | D | M | UC-02 |
| CON-16 | Test shall run a read-only WIQL query that returns no items. On success it shall report "Connection works: {project} is reachable with this PAT." | T | S | UC-02 |
| CON-17 | The app shall offer the built-in presets (QMS-0025 as Time Writing, view name "QMS-0025", in menu; DHP on-prem as reference, hidden from menu) until each is set up or dismissed. Dismissals shall be remembered in this browser. | D | C | UC-02 |
| CON-18 | The app shall store connections and their PATs only in localStorage key `demand-planning-azure-connection-profiles-v1`, never in the app state. | I, T | M | UC-02 |
| CON-19 | The app shall mark a connection with a base URL as "On-prem" in the connection table. | D | C | UC-02 |
| CON-20 | "Clone" shall open the connection form as a new connection with every setting of the chosen one (name and view name suffixed "(copy)"). Saving it without a PAT shall use the chosen connection's saved PAT. The chosen connection shall not change. | T | S | UC-02 |
| CON-21 | Settings shall have a "Windchill host" section: host (https only, no user name or password; a pasted page address is reduced to its origin), service path (under /Windchill/, default /Windchill/servlet/odata), login (Windows single sign-on), object type, search parameters and columns to return. It shall be saved in this browser only, with no password stored. | T | S | UC-02 |
| CON-22 | In the desktop app, "Test connection" shall make one read-only GET to the saved host's service path, offering Windows single sign-on to that host only, and report: connected with the listed service names, sign-on refused (401/403), redirected to a sign-in page on another host (redirects on the same host are followed, as in a browser), another status, not JSON, or not reachable. In the web version the test shall be disabled with a note that it runs in the desktop app. | T | S | UC-02 |
| CON-23 | Settings → "Views in Git" shall save every Azure DevOps connection (ID, name, view name, role, shown in menu, project URL, on-prem server, API version, creator email, query) — never a PAT — as azure-views.json in the Git data repository, next to the planning data file, as one commit with a description; an unchanged file shall not be committed again. Saving shall be disabled with sample data. | T | S | UC-02 |
| CON-24 | "Restore from Git" shall, after confirmation, add or overwrite the connections in the file by ID and leave other connections unchanged. A restored connection shall keep the PAT it already has in this browser, else use the PAT entered for the restore, else the PAT of a saved connection to the same organisation or on-prem server; connections with no PAT shall be listed as not restored. | T | S | UC-02 |
| CON-25 | In the desktop app with Git storage connected, every successful fetch of an on-prem read-only connection (a server address; not Time Writing) shall be committed to azure-data/<connection ID>.json in the Git data repository: the connection settings (no PAT) and the fetched snapshot. A fetch whose data is unchanged (ignoring fetch times) shall not be committed again. The view shall show whether it was saved, unchanged or not saved and why. Nothing shall be committed with sample data. | T | S | UC-08 |
| CON-26 | The web app shall load the on-prem view snapshots from Git once at start (Git storage connected) and from "Load on-prem data from Git": a view's data shall be replaced only by a newer fetch, connections not in this browser shall be added without a PAT (view only), and the view shall say its data came from the desktop app via Git. A connection without a PAT shall not fetch and shall say why. | T | S | UC-08 |
| CON-27 | Settings → "Windchill views" shall define searches without query syntax: a name, an object type (Domain/Set, e.g. DocMgmt/Documents), filter rows (field, condition — equals, is not, starts with, contains, after/at least, before/at most — and value; dates as YYYY-MM-DD) and the columns to show, saved in this browser; field names and the object type are validated and values escaped, and the app builds one OData query from them. Views marked "Show in the menu" appear under Windchill in the sidebar. | T | S | UC-08 |
| CON-28 | In the desktop app, Fetch shall run a Windchill view read-only (GET under the configured service root, Windows sign-on to that host only, next pages followed on the same host up to 20,000 results) and store the results with the app data; with Git storage connected they shall be committed to windchill-data/<view>.json (the view and results, no credentials) when changed. The web app shall load these at start, add views it does not have, and show the results with "(desktop app, via Git)". A view page shows the chosen columns with search and CSV export. | T | S | UC-08 |
| CON-29 | When Windchill answers with a login page, the desktop app shall offer "Sign in": a sandboxed window (no app access, https only, no pop-ups) opens the service address in a separate persistent Windchill session where the user completes the company login; after each page on the Windchill host the connection is tested, and the window closes once the service answers. Test connection and Fetch shall use that session; the app shall never read or store a password, and "Sign out" shall clear the session. A Fetch that gets a login page shall say to sign in. | T | S | UC-08 |
| CON-30 | Each Windchill view shall offer "Open in browser" (the view's search address, opened in the default browser where the company sign-in works), "Import file" (a page saved from the browser) and "Paste results" (copied text), in the web and desktop app. An import shall accept only a Windchill result list ({"value": [...]}), say so for a web page, the domain list or a Windchill error, replace the view's results, and be stored and saved to Git like a Fetch. When the result has a next-page link on the same https service, the view shall offer "Open next page" and "Import next page"/"Paste next page", which add to the results (at most 20,000). | T | S | UC-08 |
| CON-31 | In the web app, Test connection and a Windchill view's Fetch shall run from the browser itself (read-only GETs with the browser's own Windchill sign-in sent along, following next pages on the same service, at most 20,000 results), as the Azure DevOps cloud views do. When the browser cannot read the answer (Windchill does not allow the app's address, or no sign-in), the app shall say to sign in to Windchill in another tab or ask the Windchill administrator to allow the app's address, and point to Open in browser and Import. | T | S | UC-08 |
| CON-32 | In the web app, Settings → Windchill host shall offer a "Windchill → app" bookmark (drag to favourites, or copy its code), and each Windchill view "Fetch via Windchill tab": the app opens the service address in a tab; the bookmark clicked there asks the app (its opener, the app's own origin only) for the searches, runs them read-only on Windchill (next pages on the same service, at most 20,000 results) and sends the results back. The app shall accept only messages from the Windchill origin, from the tab it opened, carrying that request's one-time code and only for the requested views; results are stored and saved to Git like a Fetch, and a request without an answer within 10 minutes shall be reported. | T | S | UC-08 |
| CON-33 | The sidebar shall list the cloud Azure DevOps views under "I&D Board" and the on-prem (Azure DevOps Server) views under "Release Details", followed there by the imported Windchill exports and "Import Windchill export". An import shall take a CSV (comma, semicolon or tab separated) exported from a Windchill search, find the header row (below any title line), keep the file's columns, report Excel or HTML files and files without results, and store the export like a Windchill view's results (saved to Git when connected); an export can be replaced with a newer file or removed. The Windchill host and Windchill views setup shall be hidden from Settings. | T | S | UC-08 |
| CON-34 | With Git storage connected, an on-prem view shall offer "Load from Git" (the data the desktop app saved to azure-data/, replacing the data here only when newer), and a Fetch that fails or has no PAT in this browser shall fall back to it, saying why and when the Git data was fetched. At start (web and desktop) the connection setup in azure-views.json shall be every user's default: connections missing here are added (PAT from a connection to the same server, else view only), connections not changed here since the last sync follow Git, and connections changed here are kept; nothing is deleted, and saving to or restoring from Git makes the connections follow Git again. | T | S | UC-02 |
| CON-35 | With Git storage connected, the app shall check whether the token can write to the repository (the repository's permissions, then a write without content that GitHub refuses for a read-only token and that can change nothing). With a read-only token, Baselines (estimation rules and release scopes) shall be shown but not editable, and the Git bar shall say view only and whom to ask; when the check is inconclusive, editing stays available. | T | S | UC-02 |

### 3.3 Fetching and saving Azure DevOps data (FET) — UC-03

*Group rationale: the user asked that "every time a Fetch happens, it should save automatically", and that Save means save and refresh.*

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| FET-01 | When a time-tracking connection is fetched without a query, the app shall read the team's Epic backlog: the team's area paths, every work item in them, and their parents. | T | M | UC-03 |
| FET-02 | When a time-tracking connection is fetched with a query, the app shall read the query's results and their parent chain. | T | M | UC-03 |
| FET-03 | The app shall read work items in batches of at most 200 IDs. If any batch fails, it shall import nothing from that fetch. | T | M | UC-03 |
| FET-04 | When a time-tracking fetch returns one or more items, the app shall replace the saved Azure work items with the result and write an audit entry with action "Sync". | T | M | UC-03 |
| FET-05 | When a time-tracking fetch returns no items and saved items exist, the app shall keep the saved items and hold the result as a preview, with "Azure returned no work items, so the saved data was kept. Check the team or query; save the empty preview only if that is expected." | T | M | UC-03 |
| FET-06 | "Save preview — replace Azure cache" shall save the preview only when its scope equals the current connection. Otherwise it shall show "The source changed after fetching. Refresh the selected backlog before saving." | T | M | UC-03 |
| FET-07 | When a backlog-view, documents or reference connection is fetched, the app shall save its items under that connection's ID in `azureSources`, with the fetch time. | T | M | UC-03, UC-08 |
| FET-08 | When a release-source connection is fetched, the app shall save its items as `releaseSource`, with the fetch time. | T | M | UC-03, UC-08 |
| FET-09 | "Fetch all" shall fetch every connection, one after another. | D | M | UC-03 |
| FET-10 | The header refresh button (↻) shall run "Fetch all" when connections exist. Otherwise it shall refresh the active configuration. It shall be disabled while a fetch is running. | D | M | UC-01, UC-03 |
| FET-11 | The app shall refuse a second Time Writing fetch while one is running, with "A Time Writing fetch is already running." | T | S | UC-03 |
| FET-12 | The data-status chip shall show exactly one of: "Refreshing…", "Unsaved result", "Sample data", "{n} items · {relative time}", "No data". | D | M | UC-01 |
| FET-13 | When a preview exists, the app shall show the preview notice with the buttons "Save preview — replace Azure cache" and "Discard". | D | M | UC-03 |
| FET-14 | When no work items are saved and no fetch is running, the app shall show "No source data loaded yet." with a link to fetch and a "Load synthetic sample" button. | D | S | UC-03, UC-18 |
| FET-15 | When a fetch fails, the app shall show the error followed by "Previously loaded data has been retained." and keep the saved data unchanged. | T | M | UC-03 |
| FET-16 | When saved work items lack a verified scope for the active team backlog, the app shall hide them and show the scoped-refresh notice. | T | S | UC-03 |
| FET-17 | Fetching shall not write to Azure DevOps. | I, T | M | UC-03 |
| FET-18 | When a connection's query selects fields, the app shall store those field values per item, with identities reduced to their display name. | T | M | UC-08 |
| FET-19 | When a query is fetched, the app shall read Azure DevOps field names through the read-only `fields` operation. On failure it shall fall back to readable reference names. | T | S | UC-08 |

### 3.4 Time Writing naming rules (TWN) — UC-04, UC-05

*Group rationale: story names are free text ("what I wrote randomly"). The Month Task is the anchor.*

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| TWN-01 | The app shall treat a Task as a Month Task for month M when its title starts with M, given as a full or 3-letter English month name (case-insensitive, optional ".") followed by a 4-digit year, with any of the separators space `,` `.` `_` `/` `-` or none. | T | M | UC-04 |
| TWN-02 | The app shall treat a Task as a Month Task for month M when its title starts with `YYYY-MM`, `YYYY/MM` or `YYYY.MM` (month 1–12, optional leading zero) not followed by a digit. | T | M | UC-04 |
| TWN-03 | The app shall treat a Task as a Month Task for month M when its title ends with M in the forms of TWN-01 or TWN-02. Trailing spaces, `.`, `)` or `]` are allowed. A letter shall not come directly before the month name. | T | M | UC-04 |
| TWN-04 | When a title both starts and ends with a month, the leading month shall be used. | T | M | UC-04 |
| TWN-05 | The app shall not treat a month that appears only in the middle of a title as the Task's month. | T | M | UC-04 |
| TWN-06 | The app shall not treat a word that merely begins with a month name (e.g. "Octopus 2026", "Mayday 2026") as a month. | T | M | UC-04 |
| TWN-07 | The app shall take a Month Task's Feature and Epic from its parent chain, whatever the parent story is called. | T | M | UC-04 |
| TWN-08 | The app shall identify Time Writing stories per the definition in §1.4. | T | M | UC-05 |
| TWN-09 | When placing a new Month Task under a Feature, the app shall choose, in this order: (1) an existing live Task of mine for that month, which is reused rather than created; (2) the one live story titled exactly "{Feature} - Time Writing"; (3) the one story holding my Month Tasks; (4) the Feature's only Time Writing story; (5) a new story. When more than one candidate exists at step 2, 3 or 5, the result shall be a conflict and nothing shall be created. | T | M | UC-06 |

### 3.5 Monthly Time Writing (MON) — UC-04, UC-05

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| MON-01 | The page shall provide, in the page header, a Team/Individual switch labelled "Time writing for", defaulting to Individual. The choice shall be remembered in localStorage `demand-planning-monthly-view-v1`. | D | M | UC-04 |
| MON-02 | In Individual mode the page shall show only the chosen person's Tasks. In Team mode it shall show every person's Tasks. | T | M | UC-04 |
| MON-03 | In Individual mode with no person chosen and no Me, the page shall show "Choose whose time writing to show, or set your Azure email on the Time Writing connection to make "Me" the default." and list no Tasks. | D | M | UC-04 |
| MON-04 | The page shall show the metrics "Tasks", "Original Estimate", "Completed Work" and "Staged changes" for the selected month. | D | M | UC-04 |
| MON-05 | The page shall list each Month Task of the selected month with: Epic, Feature (the nearest Feature above the Task), Month Task, State, Original Estimate, Completed Work, Tags. Epic, Feature and Task shall link to Azure DevOps. | D | M | UC-04 |
| MON-06 | Planning for month M shall be locked when the period record of M is explicitly locked, or when the current time is at or after its planning extension (if set), otherwise its planning deadline (default `M-05T23:59:59` local). See OI-03. | T | M | UC-04 |
| MON-07 | Actuals for month M shall be locked when the period record of M+1 is explicitly locked for actuals, or when the current time is at or after its actuals extension (if set), otherwise its actuals deadline (default `(M+1)-05T23:59:59` local). See OI-02. | T | M | UC-04 |
| MON-08 | The page shall show the pills "Planning open"/"Planning locked" and "Actuals open"/"Actuals locked". | D | M | UC-04 |
| MON-09 | The Original Estimate input shall be disabled while planning is locked, when the Task is tagged `ad-hoc`, or while saving. | T | M | UC-04 |
| MON-10 | The Completed Work input shall be disabled while actuals are locked or while saving. | T | M | UC-04 |
| MON-11 | Edits shall be held as staged changes until "Save {n} staged task(s) and refresh" is pressed. "Discard staged changes" shall clear them. | D | M | UC-04 |
| MON-12 | The app shall reject the whole save, writing nothing, when any staged value is empty, not a finite number, or negative, with "Original Estimate and Completed Work must be non-negative numbers." | T | M | UC-04 |
| MON-13 | The app shall reject the whole save, writing nothing, when any staged change falls in a locked field, with "A staged change is in a locked field. Unlock the period in Settings before saving." | T | M | UC-04 |
| MON-14 | Saving shall write only Original Estimate and/or Completed Work (and Tags when MON-15 applies) to each changed Task, then read the Task back and verify it. | T | M | UC-04 |
| MON-15 | When planning is locked and a Task with no Original Estimate first receives Completed Work, the save shall add the tag `ad-hoc` to that Task. | T | M | UC-04 |
| MON-16 | After a successful save, the app shall clear the staged changes and refresh the Time Writing data from Azure DevOps (FET-04). | D | M | UC-04 |
| MON-17 | The save button shall be disabled when there are no staged changes, while saving, or when the active connection has no PAT. | D | M | UC-04 |
| MON-18 | The page shall show a check panel, titled "Not picked up for {Month YYYY} ({n})" or "Everything picked up for {Month YYYY}". It shall list: (a) open Time Writing stories with no Month Task for the month; (b) Tasks under a Time Writing story with no month in the title; (c) Month Tasks with no Feature above them, with the parent shown. | T | M | UC-05 |
| MON-19 | In Individual mode, the check panel shall list only the chosen person's stories: those assigned to them, or holding one of their Tasks. | T | S | UC-05 |

### 3.6 Assigned to Me (ATM) — UC-06

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| ATM-01 | The page shall show whose work is shown, plus a "Show work for" selector offering Me (connection email) and each known person. The choice shall be remembered in this browser. | D | M | UC-06 |
| ATM-02 | When neither Me nor a chosen person is known, the page shall show "Who are you in Azure DevOps?" and no actions. | D | M | UC-06 |
| ATM-03 | An item shall count as mine when its assigned-to email equals Me's email (case-insensitive), or, when either email is missing, its assigned-to name equals Me's name (case-insensitive). | T | M | UC-06 |
| ATM-04 | The page shall list my pending items, excluding Epics and items under the Absence Epic, always in ascending ID order. | T | M | UC-06 |
| ATM-05 | The page shall filter the pending list by type, with the chips All, Feature, User Story, Bug, Task, Other, opening on Feature. | D | S | UC-06 |
| ATM-06 | The page shall offer finishing states per type (Feature, User Story and Bug: Resolved or Closed; Task: Closed). After confirmation it shall write only the State field, verify the result, and then refresh. | T | M | UC-06 |
| ATM-07 | The bulk actions (ATM-07 to ATM-12) shall be on their own page, "Bulk actions", with the same person selector; both of its lists shall be in ascending ID order. "Find current Sprint" shall read the team's iterations and offer each PI → Sprint pair whose Sprint dates cover today. When none exists it shall show "No current Sprint found: no team iteration with start and finish dates covering today under a PI." | T | M | UC-06 |
| ATM-08 | Move to current Sprint shall offer only my pending User Stories whose iteration is a Sprint with a finish date before today (India time) and that differ from the target. Stories in the current Sprint, a future Sprint or an undated iteration shall be left untouched, as shall Features, Bugs and Tasks. See OI-08. | T | M | UC-06 |
| ATM-09 | The move shall write only the Iteration Path, after confirmation. It shall report the moved and failed counts, then refresh. | T | M | UC-06 |
| ATM-10 | The month-tasks panel shall list each pending Feature that is mine, or that holds my pending work, outside the Absence Epic. Each shall carry one status: "Has task", "Task missing", "Story + task missing" or "Choose story". | T | M | UC-06 |
| ATM-11 | Creating month tasks shall re-read the Feature's children from Azure DevOps and apply TWN-09. It shall create at most one "{Feature} - Time Writing" story and one "{Month YYYY} \| {Feature}" Task assigned to Me's email, and never a duplicate. | T | M | UC-06 |
| ATM-12 | Creating month tasks shall be refused when Me has no email, with the message beginning "Month tasks are created for you only". | T | M | UC-06 |
| ATM-13 | In sample mode, or without a Time Writing connection and PAT, every write action on the page shall be disabled, with the reason shown. | T | M | UC-06, UC-18 |
| ATM-14 | The page shall keep the last 8 action results as notices. | D | C | UC-06 |

### 3.7 Time Writing backlog view (BKL) — UC-07

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| BKL-01 | The Time Writing view shall show the saved work items as an expandable Epic → Feature → User Story → Task tree, with the view name as its heading. | D | M | UC-07 |
| BKL-02 | The tree shall exclude items in the state Removed. | T | M | UC-07 |
| BKL-03 | The tree shall remember the column preferences in this browser. | T | S | UC-07 |
| BKL-04 | "Add Feature under an Epic" shall require a title of the form "Program \| Service \| vRelease", else "Use the Feature title format Program \| Service \| vRelease." | T | M | UC-07 |
| BKL-05 | The Feature form shall offer "Release classification" PU or Full Release. It shall set the description to "Feature DoD: DT finished. This is a PU release." or "Feature DoD: IQOQ finished and Checklist uploaded into the Feature." accordingly. | T | M | UC-07 |
| BKL-06 | The form shall offer optional milestone User Stories SFV, DT and IQOQ (PU), or PRD, SFV, DT and IQOQ (Full Release), titled "{milestone} : Review of Deliverables ({Service} {Release})". | T | M | UC-07 |
| BKL-07 | Creation shall always add a "{Feature} - Time Writing" story in the selected Sprint and a "{Month YYYY} \| {Feature}" Task. The Feature shall be assigned to the creator email, and the children shall not be assigned. | T | M | UC-07 |
| BKL-08 | Creation shall require a dated PI → Sprint selection, and shall refuse if the selection is no longer current, with "The selected PI/Sprint is no longer current. Reload the schedule and review it before creating. No write was attempted." | T | M | UC-07 |
| BKL-09 | Creation shall be refused without a creator email, with "Configure the Feature creator email in Azure DevOps settings before creating a Feature." | T | M | UC-07 |
| BKL-10 | "Complete Feature children" shall add only the missing children of an existing Feature, without recreating the Feature. | T | M | UC-07 |
| BKL-11 | After creation, the app shall read every created item back and report "Hierarchy complete: {n} milestone stories, Time Writing story and {month} task verified." | T | M | UC-07 |
| BKL-12 | The view shall offer a collapsible "Source details and dates" table, with search, counts by type, and at most 100 rows. | D | C | UC-07 |

### 3.8 Read-only query views and Releases (QV) — UC-08

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| QV-01 | A read-only view shall show its connection name, organization/project, item count and fetch time, plus "Refresh from Azure" (or "Fetch from Azure") and "Connection settings". | D | M | UC-08 |
| QV-02 | Before the first fetch, the view shall show ""{name}" has not been fetched yet." and state that nothing is written to Azure DevOps. | D | M | UC-08 |
| QV-03 | The view's columns shall be the query's SELECT fields, in query order. Each entry shall be resolved against the project's field list, whether written as a reference name (any letter case, with or without square brackets) or as a field name such as Title or Assigned To; common field names shall resolve even when the field list cannot be read. Entries that are not fields of the project shall be named in a notice. When the saved data was fetched with other columns than the connection's current query, the view shall show the current query's columns and ask for a refresh. When the query selects only `System.Id`, or has no query, the columns shall be ID, Work Item Type, Title, State, Assigned To, Iteration Path. | T | M | UC-08 |
| QV-04 | The column headings shall use Azure DevOps field names when read (FET-19), else built-in names, else the reference name split into words. | T | S | UC-08 |
| QV-05 | Rows shall initially follow the query's ORDER BY, including DESC. Clicking a heading shall sort by that column, and clicking it again shall reverse the order. Empty values shall sort last. | T | M | UC-08 |
| QV-06 | The view shall show a summary strip with counts by State, by Work Item Type and by person. It shall also show the count of overdue items (open, target date before today) and of items changed in the last 7 days. | T | M | UC-08 |
| QV-07 | Clicking a State or Type chip shall filter the rows by that value, and clicking it again shall clear the filter. | D | S | UC-08 |
| QV-08 | The search box shall filter the rows to those where any shown column contains the text (case-insensitive). | T | S | UC-08 |
| QV-09 | "Export CSV" shall download the filtered rows with the shown columns. Values containing `"`, `,`, CR or LF shall be quoted. | T | S | UC-08 |
| QV-10 | The table shall show at most 500 rows, with a note when more match. | D | C | UC-08 |
| QV-11 | Read-only view items shall not count in Overview, Monthly Time Writing or Assigned to Me. | T | M | UC-08 |
| QV-12 | Every read-only Azure DevOps view shall be its own sidebar page with no tabs inside it. A release-source view shall show, on one page, the Releases list (QV-13) above the documents (QV-14). | D | M | UC-08 |
| QV-13 | The Releases list shall be one flat list with no grouping by stream: one row per Name + Release, where a path segment "Release x.y.z" gives the release: when the Iteration Path has such a segment, the release shall come from it and the name from the Area Path (its last segment; the segment above a release segment if the Area Path has one; the segment above the release in the Iteration Path if the Area Path is the project alone); otherwise both shall come from the Area Path, the name being the segment above the release segment. Each row shall show the approval date, the document count, and "Tracked · {n}" or "Not tracked" depending on whether a Feature, User Story or Task in the Time Writing backlog has a title naming both the name and the exact release number. Each row shall also show Planned (h) and Booked (h): the sum of Original Estimate and of Completed Work, over all months, on the Time Writing Tasks (month Tasks, or Tasks under a Time Writing story) under the Features that track the release, plus any tracking Task itself; Removed Tasks are excluded, negative values count as 0, each Task is counted once, and a release with no such Task shows "—". | T | M | UC-08 |
| QV-14 | The documents shall be shown as a query view (QV-03 to QV-10). |  D | M | UC-08 |
| QV-15 | When any item of a read-only view has a release in its paths (QV-13), the view shall show the columns Name and Release after the ID. The QMS-0025 Time Writing backlog shall not use this. | T | S | UC-08 |
| QV-16 | Every read-only Azure DevOps view (not QMS-0025) shall show the header month picker and, by default, only the items whose month (India time) is the selected month: the Author Approval Date (configured field, else any approval-date field), else the Changed Date. On a release-source view this filters both the Releases list and the documents; planned and booked hours stay all-months. An "All months" checkbox shall turn the filter off, and a month with no items shall say so and give the total. | T | M | UC-08 |
| QV-17 | Every read-only connection, release sources included, shall keep its own fetched snapshot (by connection ID), so each view shows only the results of its own query. A release snapshot saved before this (one shared snapshot) shall be shown only for the connection whose query it was fetched with, or when there is one release source, and shall be dropped at the next release-source fetch. | T | M | UC-08 |
| QV-18 | Dates of work items (Author Approval Date, Target Date, query date columns) are stored in UTC; they shall be shown as long dates in the viewer's time zone (e.g. "30 September 2026"), and that local date shall decide the month for the ADS month filter, the Releases list and the Overview counts. The header month shall start on the viewer's current month. A filtered view shall say how many items have no approval date (their Changed Date is used). | T | M | UC-08 |
| OV-10 | Overview shall have a "Releases · {month}" tab that starts with the summary: one line per read-only view whose documents carry releases in their paths, as "{view} [{count}] : {name} {release}, …" (releases with documents approved in the month, by Author Approval Date in the viewer's time zone; "[0] : —" when none). Below it a 2×2 section: one quadrant per view with its release and document counts and the Title (from the query) of each document approved in the month, linked, with its release and approval date, and a last quadrant with releases and documents per view and in total. A separate query (e.g. Content) is its own view. | T | S | UC-01 |
| QV-19 | The Releases list shall show, for each release, the QMS-0025 Feature(s) tracking it as links (#ID title); "Not tracked" when none. A Feature tracks a release when its title, in any order and format and with any extra words (e.g. an Art), contains the release name as whole words and the exact version, optionally preceded by "v", "v.", "Rel" or "Release" (e.g. "Art-A, Dose Planning, v.1.1.0.1", "Dose Planning 1.1.0.1"); a version with other digits around it (1.1.0.10, 11.1.0.1) or another version (1.1.0.2) does not count. Versions that differ only by trailing zero parts are the same (3 = 3.0.0.0, 3.1 = 3.1.0.0, 3.1.1 = 3.1.1.0), both for this match and for grouping documents into releases. A Feature matching several releases counts for the one with the longest name. Stories and tasks do not attach releases to Features. Planned and booked hours come from the Time Writing Tasks under the tracking Features. | T | M | UC-08 |
| QV-20 | A release that is not tracked shall offer "Create Feature": a QMS-0025 Feature with an editable title, pre-filled as "{view} \| {name} \| v{release}" (the mapping from the Release work item fields is still to be supplied); Create is allowed only while the title still names the release and its version (QV-19), under the Epic named like the view (or one chosen), assigned to the Time Writing creator email, validated by Azure DevOps before saving and verified after; after creation the release shows it as its Feature. Disabled with sample data or without the Time Writing PAT or creator email. | T | S | UC-08 |

### 3.9 Overview (OVR) — UC-09, UC-10

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| OVR-01 | The Overview shall provide, in the page header, a Team/Individual switch labelled "Overview for", defaulting to Team. The choice shall be remembered in localStorage `demand-planning-overview-view-v1`. | D | M | UC-09 |
| OVR-02 | In Individual mode the Overview shall use only the chosen person's Tasks, while still applying regional holidays by region. With no person chosen it shall show "Choose whose overview to show." | T | M | UC-09 |
| OVR-03 | The Overview shall show the metrics: utilization (team, or "{person} · utilization"), "Overloaded", "Has capacity" and "Absence". | D | M | UC-09 |
| OVR-04 | The Overview shall provide the tabs "This month · {Month YYYY}" and "Trends", remembering the selection in localStorage `demand-planning-overview-tab-v1`. | D | M | UC-09, UC-10 |
| OVR-05 | "This month" shall show: "Who has capacity" (person, status, available, planned, booked, utilization, main stream); "Streams of work"; "Hours by Epic"; the "Funded hours" and "Absence" donuts; "Hours by person and stream" (top 8 streams, the rest as Other); and a collapsed "How utilization is calculated". | D | M | UC-09 |
| OVR-06 | "Trends" shall offer "6 months" or "12 months". It shall show "Hours by month", "Utilization by month", "Utilization by person and month", "Epic mix by month", and Pareto charts for "Overrun hours" and "Ad-hoc hours", each grouped by Feature or Epic. | D | M | UC-10 |
| OVR-07 | Clicking a month in a Trends chart shall set the selected month. | D | S | UC-10 |
| OVR-08 | An Epic's colour shall not change when switching between 6 and 12 months. | T | S | UC-10 |
| OVR-09 | Overrun hours shall be Completed Work above Original Estimate on Tasks that have an estimate. Ad-hoc hours shall be Completed Work on Tasks tagged `ad-hoc`. | T | M | UC-10 |

### 3.10 Capacity model (CAP) — UC-09, UC-14

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| CAP-01 | Working days of a month shall be its Monday–Friday dates. | T | M | UC-09 |
| CAP-02 | Funded hours per person shall be working days × hours per day (default 8). | T | M | UC-09 |
| CAP-03 | Absence shall be the Completed Work on Month Tasks under the Absence Epic, split into PTO, Sick Leave, Unplanned Leave and public holidays by Feature and Task titles. | T | M | UC-09 |
| CAP-04 | A public holiday booked under a Feature titled "Public Holidays - {India\|Netherlands\|US}" shall count as absence for every person mapped to that region. | T | M | UC-09 |
| CAP-05 | Available hours shall be funded − absence. | T | M | UC-09 |
| CAP-06 | Utilization shall be booked hours (Completed Work on Month Tasks outside the Absence Epic) ÷ available × 100. | T | M | UC-09 |
| CAP-07 | Status shall be: "No bookings" when utilization is undefined; "Overloaded" when ≥ the overloaded threshold (default 100%); "Has capacity" when < the capacity threshold (default 80%); otherwise "Balanced". | T | M | UC-09 |
| CAP-08 | Streams shall be the Epics above the booked Month Tasks, excluding the Absence Epic. | T | M | UC-09 |
| CAP-09 | People shall be the assignees of Month Tasks, excluding "Unassigned". | T | M | UC-09, UC-14 |

### 3.11 Baselines (BAS) — UC-11

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| BAS-01 | A release shall be a Feature, not Removed, whose parent Epic title equals a rule's stream (trimmed, case-insensitive). | T | M | UC-11 |
| BAS-02 | Every stream shall use the same formula: baseline hours = hours per unit × (fixed units per release + units per driver × driver count). When a maximum is set and the result exceeds it, the baseline shall equal the maximum. There shall be no release types. | T | M | UC-11 |
| BAS-03 | Actual hours for a release shall be the Completed Work (negatives treated as 0) on its Month Tasks, and on Tasks under its Time Writing stories, rolled up to the nearest Feature. | T | M | UC-11 |
| BAS-04 | The table shall show, per release: stream, release, scope, baseline, actual, variance (actual − current baseline), and scope growth (current baseline − first baseline). | T | M | UC-11 |
| BAS-05 | "Set scope" / "Re-baseline" shall require the driver count (when the rule has units per driver > 0) before "Save baseline" is enabled. | T | M | UC-11 |
| BAS-06 | Saving a scope shall append a version {time, driver count, reason} to the release's history and write an audit entry "Baseline" or "Re-baseline". | T | M | UC-11 |
| BAS-07 | When a scope is identical to the current one, the form shall warn "Same scope as the current baseline; saving adds a version with no change." and still allow saving. | D | C | UC-11 |
| BAS-08 | The rules editor shall maintain one row per stream with: hours per unit, fixed units per release, driver, units per driver and maximum hours, and shall show the resulting formula. It shall warn about streams whose hours per unit is 0. | D | M | UC-11 |
| BAS-09 | Saving rules shall drop empty or duplicate stream names, replace negative or non-finite numbers with 0, and drop a maximum of 0. Rules saved in the earlier shape (release types and line items) shall be read as the uniform formula: the first line item is kept, and a types-only rule becomes 0h per document. Saving shall write an audit "Update"/"BaselineRules". | T | M | UC-11 |
| BAS-10 | "Load example values" shall load the example rules into the draft without saving. | D | C | UC-11 |
| BAS-11 | The "Task plan check · this month" panel shall flag a Month Task with ">25%" when Original Estimate > 0 and Completed Work > 1.25 × Original Estimate. See OI-07. | T | S | UC-11 |

### 3.12 Git storage (GIT) — UC-12

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| GIT-01 | The app shall accept an owner and repository matching `^[A-Za-z0-9_.-]{1,100}$` (a trailing `.git` is removed), a branch matching `^[A-Za-z0-9._/-]{1,200}$` without `..`, and a path ending in `.json` without empty or `..` segments. | T | M | UC-12 |
| GIT-02 | The app shall keep the GitHub token in localStorage `demand-planning-git-token-v1` only when "Remember token in this browser" is ticked, and otherwise in memory for the session. | T | M | UC-12 |
| GIT-03 | The Git file shall contain exactly `{schema: 1, baselineRules, releaseScopes, resourceProfiles}`, as 2-space-indented JSON with a trailing newline. | T | M | UC-12 |
| GIT-04 | "Connect & load" and "Load latest" shall replace those three fields in the app with the file's content. When the file does not exist and the branch exists, the app shall report that saving will create it. | T | M | UC-12 |
| GIT-05 | The app shall reject a file that is not JSON, or is not schema 1, loading nothing. | T | M | UC-12 |
| GIT-06 | "Save to Git" shall write the file with the loaded version id (sha) and the entered change description as the commit message. | T | M | UC-12 |
| GIT-07 | When GitHub reports a conflict (HTTP 409 or 422), the app shall show "The data file changed in Git since it was loaded here. Load the latest version, then make your change again." and set the status "Conflict". | T | M | UC-12 |
| GIT-08 | The sync bar shall show "Unsaved changes — not yet in Git" whenever the current three fields differ from the last synced file. | T | M | UC-12 |
| GIT-09 | In sample mode the app shall refuse to save to Git. | T | M | UC-12, UC-18 |
| GIT-10 | "Disconnect" shall remove the Git config and token from this browser, leaving app data and the repository unchanged. | T | S | UC-12 |
| GIT-11 | The app shall map HTTP 401, 403 and 404 to the specific messages listed in the code (`gitStorage.ts`). | T | S | UC-12 |
| GIT-12 | When Git is connected and a token is available, the app shall load the Git file automatically once at start. | D | S | UC-12 |

### 3.13 SharePoint and snapshots (SNP) — UC-13

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| SNP-01 | The SharePoint connection shall require an Application (client) ID. It shall sign in with an MSAL popup (scopes `User.Read`, `Sites.ReadWrite.All`; cache in sessionStorage). | D | M | UC-13 |
| SNP-02 | When connected, the app shall save the full app state to the central SharePoint file 900 ms after the last change, using the file's etag. | T | M | UC-13 |
| SNP-03 | When SharePoint rejects a save because the etag changed (HTTP 412), the app shall show "Another user updated the central data. Pull the latest version before editing again." | T | M | UC-13 |
| SNP-04 | The snapshot buttons "Save snapshot to SharePoint" (LTE) and "Save PI snapshot to SharePoint" shall be disabled unless SharePoint is connected and no upload is running. | T | M | UC-13 |
| SNP-05 | A snapshot shall contain its format, version, id, title, type, month, creation time, creator, build, and the data fields: schemaVersion, people, activities, efforts, baselines, periods, releases, audits, masters, azureWorkItems, azureBacklogScope. See OI-04. | T | M | UC-13 |
| SNP-06 | A snapshot shall be uploaded to "{state folder}/Snapshots/{month}-{type}-{id}.json" with conflict behaviour "fail". It shall be read back and compared byte for byte before success is reported. | T | M | UC-13 |
| SNP-07 | The app shall reject a snapshot larger than 200 MB, and shall never store a snapshot in the browser. | T | M | UC-13 |
| SNP-08 | Snapshot history shall list only matching snapshot files, newest first, following pagination only within `graph.microsoft.com/v1.0/`. | T | M | UC-13 |
| SNP-09 | The Snapshots page shall offer CSV and JSON exports. | D | S | UC-15 |

### 3.14 Settings (SET) — UC-14

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| SET-01 | Settings shall provide section links: Azure DevOps, Storage, Capacity & periods, Resources, Master data, Audit. | D | S | UC-14 |
| SET-02 | Capacity settings shall provide: Absence Epic ID (default 37778), funded hours per working day (default 8), overloaded at or above % (default 100), has capacity below % (default 80). | D | M | UC-14 |
| SET-03 | When availableBelow ≥ overloadedAt, the app shall store the defaults 80 and 100. An invalid value shall be replaced by its default. See OI-05. | T | M | UC-14 |
| SET-04 | Saving capacity settings shall write an audit "Update"/"CapacitySettings". | T | S | UC-14 |
| SET-05 | Period control shall lock or unlock planning and actuals separately for the selected month, with a reason. Each toggle shall be audited ("Lock planning", "Unlock planning", "Lock actuals", "Unlock actuals"). | T | M | UC-14 |
| SET-06 | "Extend until" shall set the planning or actuals extension to the chosen date at 23:59:59 local time. See OI-01. | T | M | UC-14 |
| SET-07 | Resources shall list the people per CAP-09 and allow setting Region (India, Netherlands, US), Role (QE, QMS, CAPA, Lead, Manager), People manager and Reports to. Each change shall be audited. | T | M | UC-14 |
| SET-08 | The app shall not allow a person to report to themself, and shall report circular reporting lines as "Circular reporting line, not shown above: {names}." | T | M | UC-14 |
| SET-09 | The Resources section shall list the regional holidays of the selected month, and the people without a region. | D | S | UC-14 |
| SET-10 | Master data shall allow adding a value to: Release Type, Activity Type, Status, Resource Band, Complexity. See OI-06. | D | C | UC-14 |
| SET-11 | The Audit section shall show the 8 most recent entries (action, entity, detail, time). | D | M | UC-14 |
| SET-12 | "Reset synthetic MVP data" shall replace the app state with the seed state. See OI-09. | D | C | UC-14 |

### 3.15 Local storage, backup and recovery (STO) — UC-15

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| STO-01 | The app shall save the app state to IndexedDB 200 ms after the last change, with saves queued in order. A save shall count as done only when its transaction completes. | T | M | UC-15 |
| STO-02 | On start, the app shall load IndexedDB. Otherwise it shall migrate the legacy localStorage copy `demand-planning-mvp-v1` (keeping it), and otherwise it shall use the seed state. | T | M | UC-15 |
| STO-03 | When saved data cannot be read, the app shall not fall back to the seed state and shall not overwrite the saved data. It shall show "Saved data could not be loaded. Nothing was overwritten." and a "Retry loading saved data" button. | T | M | UC-15 |
| STO-04 | When a save fails, the app shall show a global error with "Export JSON backup now" and "Retry browser save". | T | M | UC-15 |
| STO-05 | While a local save, snapshot upload or SharePoint save is pending, the app shall warn before the page is unloaded. | D | S | UC-15 |
| STO-06 | "Export current JSON backup" shall download the full app state as `demand-planning-backup-YYYY-MM-DD.json`. | T | M | UC-15 |
| STO-07 | Restore shall reject: a file over 200 MB; a file that is not an object; schemaVersion ≠ 1; required arrays missing; optional fields of the wrong shape; and Azure work items missing required fields. In each case the existing data shall be left unchanged. | T | M | UC-15 |
| STO-08 | Restore shall require the confirmation checkbox, and shall be refused while SharePoint is connected. | T | M | UC-15 |
| STO-09 | PATs, connection profiles, the Git token and the SharePoint configuration shall never be part of the app state, a JSON backup, a snapshot, the SharePoint state file or the Git file. | I, T | M | UC-15 |

### 3.16 Web update (UPD) — UC-16

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| UPD-01 | The build shall emit `build-info.json` with app, formatVersion, version, buildId, builtAt, revision and buildNumber, and inject `<meta name="app-build-id">` into the HTML. | T, I | M | UC-16, UC-19 |
| UPD-02 | "↻ Force Update" shall open a dialog showing the running version, build number, build ID, built time and revision, and the deployed build. | D | M | UC-16 |
| UPD-03 | The reload shall be blocked, with the first applicable reason shown, while: a fetch is running; a save is pending; a failed save or an unsaved preview exists without a JSON export; or the acknowledgement is not ticked. | T | M | UC-16 |
| UPD-04 | The app shall reload only when the fetched HTML's build id equals the deployed manifest's build id. Otherwise it shall show "The deployment is still propagating, or the server returned an older page. Please retry shortly. Nothing was reloaded." | T | M | UC-16 |
| UPD-05 | The update check shall use no-store, no credentials, no redirects and a 15 s timeout. | T | M | UC-16 |
| UPD-06 | Force Update shall not clear IndexedDB data, PAT settings or column preferences. | T | M | UC-16 |

### 3.17 Desktop app and updater (DSK) — UC-17

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| DSK-01 | The web app shall offer "⬇ Desktop app" with the Windows (.exe) and macOS (.dmg, universal) downloads from the `desktop-latest` release, recommending the detected OS. | D | M | UC-17 |
| DSK-02 | The desktop window shall run with contextIsolation on, nodeIntegration off and sandbox on. It shall deny new windows, opening https links in the system browser. | I | M | UC-17 |
| DSK-03 | The desktop app shall accept IPC requests only from its own main frame (the bundled index.html, or the dev server origin). | T | M | UC-17 |
| DSK-04 | The desktop Azure DevOps proxy shall allow only the read operations areas, backlog-epics, iterations, iteration-tree, fields, query and items, plus the constrained writes create-feature, create-child, update-time-writing-effort and update-work-item. | T | M | UC-17 |
| DSK-05 | The desktop proxy shall try API versions 7.1, 6.0 and 5.0 on a version error, and shall remember the working one per collection. | T | M | UC-17 |
| DSK-06 | The desktop proxy shall not follow redirects. It shall report a redirect as a sign-in problem. | T | M | UC-17 |
| DSK-07 | "Check for updates" shall read `latest.json` from `https://github.com/neurolooom-eng/Test2/releases/download/desktop-latest/` and report an update only when its buildNumber is greater than the installed one. | T | M | UC-17 |
| DSK-08 | The desktop updater shall download only the installer named for this OS from that fixed address. It shall install it only when its size and SHA-256 equal `latest.json`, and shall delete it otherwise. | T | M | UC-17 |
| DSK-09 | On Windows the updater shall start the verified installer and close the app. On macOS it shall open the verified disk image. | D | M | UC-17 |
| DSK-10 | The desktop app shall check quietly 5 s after start and every 4 hours. It shall show "Update available" with "Update now" and "Later". "Later" shall hide the notice until a newer build appears. | D | S | UC-17 |

### 3.18 Sample data (SMP) — UC-18

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| SMP-01 | "Load synthetic sample" shall replace the Time Writing cache and release source with a deterministic generated dataset, without reading from or writing to Azure DevOps, and shall audit "Load sample". | T | M | UC-18 |
| SMP-02 | When saved Azure data exists, loading the sample from Settings shall ask for confirmation first. | D | M | UC-18 |
| SMP-03 | In sample mode the app shall show "Showing a synthetic sample dataset, not Azure DevOps data. Refresh from Azure to replace it." | D | M | UC-18 |
| SMP-04 | The sample shall cover every model the pages use: people with profiles, streams, absence, holidays for three regions, the release source, and release scopes including a re-baseline. | T | S | UC-18 |

### 3.19 Documentation (DOC) — UC-20

*Group rationale: the user asked for a documentation page in the app that holds these documents.*

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| DOC-01 | The Documentation page shall show, as tabs, every Markdown document in `docs/`: Requirements, Test plan, Verification plan, UAT plan, Azure DevOps setup, Project plan. | T | M | UC-20 |
| DOC-02 | The page shall show the documents bundled with the running build. | I | M | UC-20 |
| DOC-03 | The page shall render headings, paragraphs, nested lists, tables, rules, inline code, bold, italic and links as formatted text. It shall not inject HTML from the documents. | T, I | M | UC-20 |
| DOC-04 | A link to another bundled document shall open that document in the page, at the linked section when an anchor is given. A link to a section shall scroll to it. | T, D | M | UC-20 |
| DOC-05 | Only https links shall be clickable external links, opening in a new tab. Links of any other scheme shall be shown as plain text. | T | M | UC-20 |
| DOC-06 | The page shall show an "On this page" list of the document's level-2 sections, linking to each. | D | S | UC-20 |
| DOC-07 | "Download .md" shall download the shown document under its file name. | D | S | UC-20 |
| DOC-08 | The page shall remember the selected document in localStorage `demand-planning-docs-tab-v1`. | D | C | UC-20 |

### 3.20 User interface (UI)

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| UI-01 | The theme toggle shall cycle Auto → Light → Dark, remembering the choice in localStorage `demand-planning-theme`, and shall apply it before first paint. | T | S | UC-01 |
| UI-02 | `?theme=dark\|light\|system` shall apply that theme once and remember it. | T | C | UC-01 |
| UI-03 | Every icon-only button shall have an accessible label. | I | S | UC-01 |
| UI-04 | Tab rows shall use `role="tablist"`/`role="tab"` with `aria-selected`, and sortable headings shall carry `aria-sort`. | I | S | UC-08, UC-09 |

### 3.21 Build and deployment (CI) — UC-19

| ID | Requirement | Ver. | Pri. | Trace |
|---|---|---|---|---|
| CI-01 | Every pull request to main shall run, on Windows: install with a frozen lockfile, lint, version check, unit tests, the web build, and the Windows installer package. | I | M | UC-19 |
| CI-02 | Every pull request to main shall build the macOS universal disk image. | I | M | UC-19 |
| CI-03 | A push to main shall publish the installers, their SHA256SUMS files and `latest.json` to the `desktop-latest` prerelease. | I, D | M | UC-19 |
| CI-04 | A push to main shall run the tests, build the web app, and deploy it to GitHub Pages. | I, D | M | UC-19 |
| CI-05 | The build shall fail when the package version is not `x.y.z`, or when a release tag does not equal the version. | T | M | UC-19 |

## 4. Non-functional requirements

| ID | Requirement | Ver. | Pri. |
|---|---|---|---|
| NFR-01 | The app shall function with no server component other than static hosting and the external systems in §1.2. | I | M |
| NFR-02 | The app shall keep at least 14,000 work items in IndexedDB and reload them. | T | M |
| NFR-03 | Requests to Azure DevOps from the desktop proxy shall time out after 45 s. Web update checks shall time out after 15 s. | T | S |
| NFR-04 | Every write to Azure DevOps shall be confirmed by reading the item back. When confirmation is not possible, the app shall say the write could not be confirmed and shall not retry automatically. | T | M |
| NFR-05 | PAT input fields shall be password fields, and the desktop proxy shall remove the PAT from any Azure DevOps error text it returns. | I, T | M |
| NFR-06 | The desktop window shall open at 1440 × 920 px and shall not be resizable below 1024 × 700 px. | I, D | S |
| NFR-07 | The source repository shall contain no production data, tokens or employee details. | I | M |

## 5. Interface requirements

| ID | Requirement | Ver. | Pri. |
|---|---|---|---|
| IF-01 | Azure DevOps: the app shall use REST API version 7.1 by default, or the connection's API version, falling back per DSK-05 in the desktop app. | T | M |
| IF-02 | Azure DevOps writes shall be limited to: creating Features, User Stories and Tasks (title, area, description, acceptance criteria, iteration, assigned to, target date, parent); Original Estimate, Completed Work and Tags on Tasks; and State and Iteration Path on any item. | I, T | M |
| IF-03 | GitHub: the app shall use the repository contents API with a fine-grained token that has Contents: Read and write. | I | M |
| IF-04 | Microsoft Graph: the app shall use the `/v1.0/` endpoint for the SharePoint site's default document library. | I | M |

## 6. Open issues

These describe as-built behaviour that is ambiguous, inconsistent, or may not match intent. Each needs a decision from the product owner. None is changed in this baseline.

| ID | Observation | Affects |
|---|---|---|
| OI-01 | "Extend until" writes no audit entry, and does nothing when the month has no period record yet. | SET-06 |
| OI-02 | The Settings actuals card for month M governs the Monthly page's actuals for month M−1. A toggle-created period sets the planning and actuals deadlines both to M-05, in UTC (`Z`). The Monthly page's defaults use local time. | MON-07, SET-05 |
| OI-03 | On the Monthly page an explicit lock always locks, even while an extension is active (`rules.ts` treats an active extension as open). After the deadline, "Unlock" alone does not reopen entry; an extension is also needed. | MON-06, MON-07 |
| OI-04 | Snapshots exclude capacity settings, baseline rules, release scopes, resource profiles, release source, release plans and read-only sources. | SNP-05 |
| OI-05 | Invalid capacity input is replaced by defaults silently, and the success message still shows. | SET-03 |
| OI-06 | Master data has no activate/deactivate control, no duplicate or blank-trim check, and no audit. | SET-10 |
| OI-07 | The task plan check flags overruns only. The older effort rule (`isVarianceFlagged`) flags \|variance\| > 25% in both directions. | BAS-11 |
| OI-08 | Stories in undated iterations (e.g. only a PI) are not moved to the current Sprint. Confirm whether they should be. | ATM-08 |
| OI-09 | "Reset synthetic MVP data" has no confirmation and no audit. In SharePoint mode the reset state is then saved to SharePoint. | SET-12 |
| OI-10 | Writes to Azure DevOps are blocked in sample mode only on Assigned to Me. Monthly Time Writing saves and Feature creation are not blocked. | ATM-13 |
| OI-11 | "Load latest" and "Update & load" from Git overwrite unsaved local baseline and resource edits without asking. | GIT-04 |
| OI-12 | Exact baseline values per stream, and the Vault field/query for document counts, are not yet supplied. | BAS-08, QV-13 |
| OI-13 | Behaviour against a real Azure DevOps Server (on-prem) has been verified only with synthetic fixtures. | DSK-04, DSK-05 |

## 7. Traceability summary

| Use case | Requirements |
|---|---|
| UC-01 | NAV-01…16, FET-10, FET-12, UI-01…03 |
| UC-02 | CON-01…20, NAV-05 |
| UC-03 | FET-01…17, CON-09 |
| UC-04 | TWN-01…07, MON-01…17 |
| UC-05 | TWN-08, MON-18, MON-19 |
| UC-06 | TWN-09, ATM-01…14 |
| UC-07 | BKL-01…12 |
| UC-08 | QV-01…15, FET-07, FET-08, FET-18, FET-19 |
| UC-09 | OVR-01…05, CAP-01…09 |
| UC-10 | OVR-06…09 |
| UC-11 | BAS-01…11 |
| UC-12 | GIT-01…12 |
| UC-13 | SNP-01…08 |
| UC-14 | SET-01…12, CAP-09 |
| UC-15 | STO-01…09, SNP-09, NAV-14 |
| UC-16 | UPD-01…06, NAV-15 |
| UC-17 | DSK-01…10 |
| UC-18 | SMP-01…04, FET-14, GIT-09, ATM-13 |
| UC-19 | CI-01…05, UPD-01 |
| UC-20 | DOC-01…08 |

The forward trace, from requirement to test cases, is in [TEST-PLAN.md §7](TEST-PLAN.md#7-requirements-coverage-matrix).
