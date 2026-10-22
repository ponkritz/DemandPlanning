# Demand Planning Hub

Windows desktop MVP for demand planning, effort tracking, capacity, release milestones, governance and monthly reporting.

## Current baseline

The repository contains a working React/TypeScript application with an Electron desktop shell. It starts with synthetic local data and includes an opt-in Microsoft sign-in adapter for centrally stored SharePoint data.

Implemented in the MVP UI:

- Separate Board view for the parent/child tree, state filters and release Feature/Story/Task creation; Azure DevOps handles connection settings, saved PAT and data fetch ([setup](docs/azure-devops-connection.md)).
- Capacity Overview from Azure Time Writing Tasks: who is overloaded or has capacity, hours per stream (Epic), person × stream matrix, absence split into PTO / Sick Leave / Unplanned Leave / regional public holidays under a configurable absence Epic
- Compact header (page title, one data status with Refresh, month where used, theme) and data notices shown once, not per page
- Read-only release source: a second Azure project queried with a saved WIQL query, releases listed per stream from the Area Path and cross-checked against Time Writing items

- Unified dashboard for plan, actuals, variance, ad-hoc work, utilization and milestones
- Activity register with process owners, resources, bands and measurable complexity
- Monthly planning and actuals; automatic month-level ad-hoc classification after planning freeze
- Independent planning/actuals locks, extensions, reason and audit trail
- Versioned, editable effort baselines and non-blocking ±25% variance flags
- TFS/Windchill/manual release staging model
- LTE/PI Review snapshots plus CSV/JSON export
- Owner, Admin, Process Owner, Contributor and Viewer role model
- Resource list read from Azure (Assigned To), with region, role and reporting line kept in the shared app data; admin-controlled master data
- SharePoint connection, initialization, pull, autosave and edit-conflict detection

## Documentation

The same documents are in the app under **Data & governance → Documentation**, bundled with each build: tabs per document, an "On this page" list, in-app links between documents, and Download .md.

- [Requirements specification](docs/REQUIREMENTS-SPECIFICATION.md): "shall" requirements with rationale, verification method, priority and use-case trace, plus open issues.
- [Test plan](docs/TEST-PLAN.md): test cases with steps and acceptance criteria for every requirement, and the coverage matrix.
- [Verification plan](docs/VERIFICATION-PLAN.md) and [UAT plan](docs/UAT-PLAN.md).
- [Azure DevOps connection setup](docs/azure-devops-connection.md).

## Run

Requires Node.js and pnpm.

```powershell
pnpm install
pnpm dev
```

Desktop development:

```powershell
pnpm dev:desktop
```

Validation and Windows installer:

```powershell
pnpm lint
pnpm build:web
pnpm build
```

macOS disk image (on a Mac): `pnpm build:mac` (universal: Intel + Apple silicon).

### Desktop downloads

CI packages a Windows installer (`Demand-Planning-Hub-Setup.exe`, on `windows-latest`) and a universal macOS disk image (`Demand-Planning-Hub-mac.dmg`, on `macos-latest`) (the Windows installer for every pull request and push; the macOS image, whose runners often queue, only for pushes to `main`, tags and manual runs). On each push to `main`, **Publish Windows installer** and **Publish macOS installer** run separately, each as soon as its own package is ready, and upload it with its SHA-256 checksum to one rolling GitHub pre-release tagged `desktop-latest`, replacing the previous file. `latest.json` keeps a build number and revision per platform (`scripts/desktop-manifest.cjs`); its top-level build number is the oldest of them, so apps from before this change only see an update once both installers are published. The fixed file names give stable links, which the app's **⬇ Desktop app** button (sidebar) offers, highlighting the one for the visitor's operating system:

- Windows: `https://github.com/neurolooom-eng/Test2/releases/download/desktop-latest/Demand-Planning-Hub-Setup.exe`
- macOS: `https://github.com/neurolooom-eng/Test2/releases/download/desktop-latest/Demand-Planning-Hub-mac.dmg`

**Updating the desktop app from the app.** The desktop app also checks quietly at start and every 4 hours; when a newer build is published it shows an **Update available** notice (bottom right, every page) with **Update now** (opens the update dialog) and **Later** (hides it until the next newer build). The sidebar's **↻ Check for updates** button (desktop app only) reads `latest.json`, which the publish job uploads next to the installers (build number = the CI run number the app shows, revision, and each installer's size and SHA-256). When the published build number is higher than the installed one, **Download and install** fetches only this platform's installer from the fixed `desktop-latest` address, verifies size and SHA-256 (a mismatch deletes the file and installs nothing), then on Windows starts the installer and closes the app, and on macOS opens the disk image to drag the app into Applications. Saved data and PATs live in the user profile and are kept. The same backup / unsaved-work checks as Force Update apply first. The check needs the repository's releases to be publicly downloadable; with a private repository it reports that no published build was found. Desktop builds made locally carry their Git commit count as build number and may not see CI builds as newer.

The installers are not code-signed or notarised (no certificates are configured): Windows SmartScreen asks for *More info → Run anyway*, and macOS needs *right-click → Open* the first time (or `xattr -cr "/Applications/Demand Planning Hub.app"` if it reports the app as damaged). Signing needs a Windows code-signing certificate and an Apple Developer ID, added as repository secrets. Version tags `v*` still create a versioned release as before.

## GitHub Actions deployment

### Versions, build identity and Force Update

The current release is **v1.2.2**. The authoritative number is `package.json` (`1.2.2` without the display prefix); the UI and release tags use **vX.Y.Z**. Increase **X** for a major/incompatible change (reset Y and Z), **Y** for a new backward-compatible feature (reset Z), and **Z** for bug fixes only. Rebuilding an unchanged release keeps its version and gets a distinct build ID. Do not automatically treat every commit as a release or infer version changes from build counts. Future releases must bump the appropriate component before deployment.

The sidebar shows version, build ID and build date/time in **IST**; the Force Update dialog also shows the source commit. GitHub Actions stamps the build ID as `GITHUB_RUN_ID.GITHUB_RUN_ATTEMPT` and the build number as `GITHUB_RUN_NUMBER`; local builds use a commit/timestamp ID and the commit count. The version stays fixed between releases; the build number is the internal reference for which deployment is running. Metadata is embedded in the app, emitted to `build-info.json`, and stamped into HTML. Both CI jobs verify the version and reject a release tag that does not exactly match `v` plus the package version.

**Force Update** checks a cache-busted, `no-store` build manifest, retrieves fresh same-origin HTML, verifies that its build ID matches the manifest, then navigates using unique update query parameters. Hashed assets include the build metadata and therefore change with each build. An offline/error response or an older HTML response blocks navigation and allows retry. This is a supported best-effort web equivalent of Ctrl+Shift+R; web JavaScript cannot invoke the browser's privileged hard-reload command. The button never clears localStorage, IndexedDB, cookies, PATs or column preferences. Browser/proxy caching policies still apply.

Updates always require acknowledgment of unfinished forms. Pending saves and active Azure fetches block reload. A failed save, SharePoint conflict or unsaved fetched preview requires exporting JSON first; the update backup includes the current preview and its scope. Export does not capture text in unsubmitted forms, so save or cancel those first. Desktop **Force Update** uses a trusted, narrow Electron cache-ignoring reload and reloads the installed package only—it does not download/install a new executable. The web button is also available on the startup/recovery screen, where it never exports an unread dataset as if it had been loaded.

Every push or pull request to `main` runs static analysis, compiles the production web bundle, packages the Windows NSIS installer, calculates its SHA-256 checksum and publishes the result as a 30-day workflow artifact.

Pushing a version tag such as `v0.1.0` runs the same verified pipeline and deploys the installer, blockmap and checksum to a GitHub Release. The workflow uses the repository-scoped `GITHUB_TOKEN`; no personal access token or application secret is required.

Every push to `main` also builds and deploys the browser version to GitHub Pages at `https://ponkritz.github.io/DemandPlanning/`. It uses local browser storage until an Admin configures the approved Entra SPA registration under **Settings → SharePoint connection**.

## Data and security boundary

### Azure dashboard mapping (v1.0.0)

**Team / Individual.** Overview has a switch above the metrics: **Team** shows everyone; **Individual** shows one person (defaults to you, as identified on My work; any other assignee can be picked). Individual keeps that person's Tasks plus the public holidays of their region, so utilization, monthly hours and streams are theirs alone. The choice is remembered in this browser.

Overview and its deterministic insights consume the exact same scoped `azure.items` workspace as Backlogs: a fresh selected-team preview takes precedence over the verified saved cache. Removed records are excluded. Visual state filters on Backlogs do not change dashboard totals. Refresh is explicit; failed refreshes retain the previous dataset and display the error. There is no local planning/demo fallback.

The selected month Task is the authoritative source: `Microsoft.VSTS.Scheduling.OriginalEstimate` and `Microsoft.VSTS.Scheduling.CompletedWork` are read directly from a Task named, for example, `October 2026 | Feature title`. Its parent story provides context only. Missing Task fields remain unavailable; zero remains zero; populated-field counts are displayed. Variance uses only Tasks with both fields. The >25% alert compares Completed Work to a positive Original Estimate, not a separately approved baseline. **Monthly Time Writing** stages edits across multiple Tasks and saves them in one controlled action. Each changed Task is re-read and must still be a Task whose title starts with a month and year, then Azure confirms the exact saved field(s); the action requires the active ADS configuration PAT to have Work Items (Read & Write). It cannot edit Features, arbitrary fields or another project.

The six-month table uses Original Estimate and Completed Work only on month-named Tasks (see **Time Writing naming**), assigned to months by the month and year at the start of the title. The dashboard and Monthly Time Writing view group these selected stories by traversing Story → Feature → Epic parent links. Items without a resolved Epic appear as `No Epic path`. Undated/unmatched tasks are counted as unmapped, not attributed by Created/Changed Date. Work-field units must be confirmed in the Azure project; Story Points are never treated as hours. Snapshot/revision history is not available, so estimates are not claimed to be frozen monthly plans or time entries.

NPRA Hours remain a separately tracked Feature category (exact tag `NPRA Hours`) and do not adjust utilization. Weekdays only are counted as working days (Monday–Friday). Regional public holidays come only from the absence Epic (see below); partial availability and leave booked outside the absence Epic are not inferred.

### Capacity, absence and utilization

The Overview is built from a capacity model (`src/capacity.ts`) over the same selected-month Time Writing Tasks. Funded hours per person are `working days × hours per day` (default 8). **Absence** is the Completed Work on month Tasks whose Epic is the configured **absence Epic** (default `#37778`); each person's Feature under that Epic, and the Task title, decide whether the hours are **PTO**, **Sick Leave** or **Unplanned Leave** (anything else is "Other absence"). Available hours = funded − absence. **Utilization = booked hours ÷ available × 100**, where booked hours are the Completed Work on all other month Tasks assigned to the person. A person is **Overloaded** at or above the overloaded threshold (default 100 %) and **Has capacity** below the capacity threshold (default 80 %); in between is Balanced; a person with absence only is "No bookings". Streams are the Epics reached by walking Task → Story → Feature → Epic; the person × stream matrix shows booked hours per Epic. The absence Epic ID, hours per day and both thresholds are edited under **Settings → Capacity and absence** and stored with the shared app data (IndexedDB/SharePoint), not per browser; every change is audited. An empty or zero denominator displays unavailable rather than an infinite percentage.

**Release baselines.** The **Baselines** page calculates each release's baseline from **estimation rules** per stream (`src/baseline.ts`): fixed hours by release type (e.g. DP Major 40h, MLD 30h, PU 20h), plus line items priced per unit where *units = base units + driver count × units per driver* (e.g. CP documents: `2h × (14 + 11 × assets)`), with an optional maximum per release (e.g. Serviceability 60h). Releases are the Features under a stream Epic that has a rule. Each release's scope (type and driver counts such as documents or assets) is kept as a dated history: re-baselining after items are scoped in adds a version, so the page shows the first baseline, the current one, the scope growth between them and the actual Completed Work booked on the release's Time Writing Tasks. The rule values shipped are illustrative examples to be replaced with the exact baseline. Rules, scopes and the resource mapping are saved to Git (below).

**Time Writing naming.** The month Task is the anchor, not its story. A Task counts for a month when its title starts **or ends** with the month and year, with any delimiter or none (`October 2026 | …`, `Oct 2026 - …`, `2026-10 | …`, `… | October 2026`, `… - Oct 2026`, `… (October 2026)`, `… 2026-10`). A month in the middle of a title is not used, and a leading month wins if both are present. The User Story above it can have any name — the Feature and Epic (stream) come from the parent links, and a month Task directly under a Feature counts too. A story is treated as a Time Writing story when it holds a month Task or its title says "Time Writing". The rules live in `src/azureInsights.ts` (`timeWritingMonth`, `isMonthTask`, `timeWritingStoryIds`, `planMonthStory`) and are shared by every page. Monthly Time Writing ends with a **Not picked up** check listing open Time Writing stories without the month's Task, Tasks under a Time Writing story without a month prefix (not counted), and month Tasks with no Feature above them (counted, but without a stream). When My work creates your month Task it reuses any month Task of yours under the Feature (any title), and otherwise picks the story titled `<Feature> - Time Writing`, else the story already holding your month Tasks, else the Feature's only Time Writing story; with several candidates it stops and asks you to add the Task in Azure DevOps.

**Assigned to Me.** The **Assigned to Me** page (with a pending count in the sidebar) lists the New / Active items assigned to you — matched by the Time Writing connection's Feature creator email (Azure *Assigned To* unique name), or by a display name chosen on the page — excluding the absence Epic. From there you can:
- **Finish an item**: set a Feature / User Story / Bug to Resolved or Closed, a Task to Closed. Azure DevOps refuses a state the item's process does not allow and the error is shown.
- **Move to the current PI + Sprint**: the Sprint whose dates include today (team iterations, with its PI parent) is found from Azure; only your pending **User Stories still in a past Sprint** (finish date before today) are listed with checkboxes and moved one by one. Stories already in the current or a future Sprint, stories in an undated iteration (such as only the PI), and Features, Tasks and other types are never moved.
- **Create this month's Time Writing tasks**: for each of your pending Features (or Features holding your pending work), the app adds `<Feature> - Time Writing` if missing and a `<Month YYYY> | <Feature>` Task assigned to you. Children are re-read from Azure right before writing, so an existing task of yours is reused and never duplicated; another person's task with the same title is left alone.
Every change is confirmed first, verified by reading the item back, merged into the saved data and recorded in the audit. Only *State* and *Iteration Path* can be changed this way (also in the Windows app's proxy). All actions are disabled while the synthetic sample is loaded.

**Azure connections.** The Azure DevOps section at the top of **Settings** holds any number of connection sets, each with a name, what it is used for, base URL, project, PAT and an optional flat WIQL query (only its WHERE clause is used; results are paged by ID). Uses: **Time Writing** (read & write; without a query the team's Epic backlog is read, with a query its results plus their missing parents up to the Epic; one Time Writing connection is active; refreshed data is saved automatically), **Releases · DHFI** (read only; default: approved documents), **Documents · Vault** and **Reference** (read only; default: all non-removed items in the project; stored as snapshots with the app data). **Fetch all** reads the active Time Writing connection and every read-only connection one after another; nothing is written to Azure when fetching. PATs stay in the browser. As in other Azure DevOps tools, a connection has an optional **server URL** (on-prem only, e.g. `https://tfs.company.com/tfs`), an **organization / collection** (on-prem: the collection name, e.g. `DefaultCollection`) and a **project**; an empty server URL means Azure DevOps Services (`https://dev.azure.com/<organization>`). The API version is detected automatically (7.1, then 6.0 and 5.0 for older Azure DevOps Server, remembered per collection) unless one is set. **Test** checks the address, collection, project and PAT with an empty query. The team's connections — the cloud Time Writing project and the DHP on-prem collection (`https://tfsapac04.ta.philips.com/tfs`, `DHPCollection`, `DHP`) — are pre-filled (`src/connectionPresets.ts`) and listed as *Needs PAT* until saved: **Set up** opens them in the form, where the PAT is entered and any field can be changed; **Dismiss** hides one in this browser. Requests, work-item links and parent links use the connection's own collection. On-prem servers are normally reachable only from the **Windows app** on VPN: it sends requests through Chromium's network stack (Windows certificate store and proxy settings), while the browser page is usually blocked by the server's cross-origin rules or company certificate.

**Azure DevOps views.** Each connection has a **View name** (optional; when empty the Time Writing backlog is named **QMS-0025** and other connections use their connection name) and a **Show in menu** switch (on by default for Time Writing and Backlog view connections, off for release, document and reference sources). Every shown connection is its own page in the sidebar's **Azure DevOps** group (no tab row). **QMS-0025** — the active Time Writing connection — is the editable Epic → Feature → User Story → Task backlog. Every other view shows its query results: a **summary strip** (counts by State and Work Item Type, which also filter the table; counts by person; overdue = open with a passed target date; changed in the last 7 days) and a **query table** with exactly the columns of the connection query's `SELECT`, in that order, named as Azure DevOps names them (read from the project's field list), sorted by the query's `ORDER BY`; any column can be sorted by clicking its heading, all columns are searchable, and **Export CSV** saves the filtered rows. A query that selects only the ID, or a team backlog without a query, shows ID, Type, Title, State, Assigned To and Iteration Path. A **Releases** (release source) view has two tabs: **Register** (stream → release from the Area Path, name, approval date, document count, and whether the Time Writing backlog tracks the release; click a release for its documents) and **Documents** (the query table). View data is fetched read-only, saved locally, and not counted in Overview, Monthly Time Writing, Baselines or Assigned to Me.

**Git storage for planning data.** Baseline rules, release scopes and the region / role / reporting-line mapping are kept in one JSON file (`planning-data.json` by default) in a **separate private GitHub repository**, configured under **Settings → Git storage** (owner, repository, branch, file path and a fine-grained token limited to that repository with *Contents: Read and write*). The token stays in the browser like the Azure PAT and is never written to app data, exports or audits. The file is loaded when the app starts; edits show as *Unsaved changes* on the Baselines and Settings pages until **Save to Git** commits them with a message, so the repository history records who changed which baseline and when. Saving sends the version that was loaded and is refused if the file changed in the meantime (load the latest and re-apply). Saving is disabled while the synthetic sample is loaded. Regional holidays stay in Azure under the absence Epic. Keep the app repository free of planning data: if it is public, so is its GitHub Pages site.

**Regions, roles and regional holidays.** People are read from Azure (Assigned To on Time Writing Tasks); under **Settings → Resources** each person gets a region (India, Netherlands, US), a role (QE, QMS, CAPA, Lead, Manager), an optional people-manager flag and a "reports to" line, shown as a reporting tree. Profiles are keyed by the Azure display name and stored with the shared app data. Regional holidays live in Azure under the absence Epic: a Feature whose title names holidays and a region (for example `Public Holidays - India`; `NL`/`Netherlands`, `US`/`USA` are recognised), with a `… - Time Writing` story and `<Month YYYY> | <Holiday>` Tasks. Each Task's hours (Completed Work, else Original Estimate, else one working day) are added as **Public holiday** absence to every person mapped to that region who has bookings in the month, instead of to the Task's assignee. People without a region are listed as not receiving regional holidays.

### Read-only release source and connection roles

Each ADS configuration now carries a **role**: *Time tracking (Read & Write)* — the active configuration used for Fetch preview, Refresh, Feature creation and Monthly Time Writing — or *Release source (Read only)*, which never writes. Both can be active at once. Under **Azure DevOps → Release source**, select the read-only configuration (for example the DHFI project) and paste its saved work-item query; only the query's WHERE clause is used, wrapped as `SELECT [System.Id] FROM WorkItems WHERE (…) AND [System.Id] > n ORDER BY [System.Id]` so results page safely and the Electron proxy's read-only guard still applies (tree, link and ASOF queries are rejected). Fetched documents are stored with the shared app data (`releaseSource`) and audited. **Feature milestones → Approved releases by stream** reads the release identifier from each document's Area Path (last segment below the project; optionally a capture pattern in `releaseSourceSettings.releasePattern`) and the stream from the segment above it (`releaseSourceSettings.streamSegment`, default 1), lists `Stream (n): Rel1, Rel2, …`, counts approved documents per release, and flags releases that no Feature, User Story or Task title in the time-tracking backlog mentions. The stream rule is provisional until the stream definitions are confirmed.

### Shared layout, themes and clock

**Layout.** The sidebar groups pages as **Overview**; **My Work** (*Assigned to Me*, *Monthly Time Writing*); **Azure DevOps** (the views shown in the menu); and **Data & governance** (*Baselines*, *Snapshots*, *Settings*). The header holds only the page title (its purpose as a tooltip), one data status chip with **↻ Refresh** (refreshes every connection and saves locally), the month where the page uses it, and the theme. Notices about the data (sample data, no data, an empty result to confirm, errors, messages) appear once under the header instead of on every page; where data is saved (browser / SharePoint) is shown in the sidebar footer. **Overview** has two tabs — **This month** (top numbers, who has capacity, streams of work, hours by Epic, funded hours and absence, person × stream matrix, and how utilization is calculated) and **Trends** (hours and utilization by month, the person × month heatmap, Epic mix by month, and the overrun / ad-hoc Pareto charts, over 6 or 12 months); the last tab opened is remembered. **Overview** and **Monthly Time Writing** have a **Team / Individual** switch (Overview defaults to Team, Monthly to Individual = me, each remembered in this browser; any other person can be picked); **Assigned to Me** shows one person, me by default, with a picker. The former Work items list and Feature milestones page were removed (the backlog views show the same items; a release source can be shown as a view).

### Monthly locking and ad-hoc Tasks

Planning defaults to locking at the end of the 5th of the selected month. Actuals for a month default to locking at the end of the 5th of the following month, so Planning for the current month and Actuals for the previous month close on the same date. Settings can explicitly lock either control or extend it independently with a documented reason. When planning is closed, Original Estimate is not editable. A month Task that first receives Completed Work after planning closes is tagged `ad-hoc`; its Original Estimate remains unavailable for edit while Completed Work remains editable until Actuals close. These controls are enforced by the app UI and Azure write request; Azure DevOps administrators should retain their normal project-level permissions as the final source-side control.

Feature closure counts require a completed state (Closed, Done or Completed) and Closed Date, bucketed in India time. Target Date determines overdue non-completed items. Feature completion is not proof of release/milestone sign-off. YoY counts describe only currently fetched backlog membership; historical coverage is not guaranteed and a zero denominator never produces a fabricated percentage. Resource totals use Assigned To on Time Writing stories, not local synthetic people. Bands and lessons remain unavailable pending explicit source mappings. No 160-hour capacity is assumed. The UI provides source-item links and a field-mapping table. No external AI integration is enabled.

Refresh Azure once after updating to populate new scheduling fields in older saved caches. Run `pnpm test:azure` for source mapping, missing/zero values, hierarchy exclusion, monthly attribution and India date-boundary tests. Live tenant field availability must still be verified with an authenticated refresh.

### SharePoint snapshots (v0.3.0)

New LTE/PI Review snapshots are separate JSON files saved directly to the connected site's default document library, in a `Snapshots` folder beside the configured central state file. With the existing default path this is `Demand Planning MVP/Snapshots`. Snapshots do not update the central state file or append a full payload to IndexedDB. The shared history is loaded from SharePoint (with pagination), with links to the files. Legacy app snapshot records remain untouched and are labelled unverified; they are not automatically uploaded.

Configure **Settings → SharePoint connection** and complete Microsoft sign-in first. An approved Entra SPA Client ID, permitted Graph delegated access and site/library write access are required; an Azure DevOps PAT cannot authorize this. Connection can save snapshots even before the central app-state file has been initialized. The browser dataset/cache remains separate and continues to use IndexedDB.

Each snapshot freezes the currently loaded app dataset, selected month/type, signed-in author, UTC creation time and build identity. It includes saved Azure work items, not an unsaved Azure fetch preview; refresh/save source data first. Earlier snapshot payloads and authentication settings are excluded. A unique file name avoids normal multi-user collisions, and upload requests specify conflict failure. Success is reported only after uploading and comparing a read-back with the frozen JSON. Failed/disconnected writes never silently save a browser snapshot. If upload verification is uncertain, refresh history before retrying to avoid duplicate captures. Files are capped at 200 MB. Existing SharePoint access, versioning and retention settings apply; no immutable-record or validated-compliance claim is made.

Before acceptance, test an actual authenticated upload in the Philips tenant, cross-user history visibility, denied write access and network failure. Automated transport tests do not substitute for these checks. Snapshot JSON is not a rendered PPT/PDF report or a normal restore-backup file.

### Backlogs, columns, refresh and current iterations

The Azure fetch is strictly **the selected team's native Epic backlog**, not all items in a project or area. The default source is the supplied InD Quality Epic-backlog URL. The team embedded in a backlog URL takes precedence over the manual team field. The app reads `/{team}/_apis/work/backlogs/Microsoft.EpicCategory/workItems` for Epic membership, then follows direct parent IDs through descendants using the team's exact/child-area rules and excluding Removed items. Every child query has a parent-ID constraint. An inaccessible or empty backlog never falls back to a project-wide query. Unrelated items in the same area are not fetched. The all-project Epic option has been removed.

Fetched membership is stored with organization/project/team and exact item keys. Older unscoped caches are hidden until a verified refresh. **Save and refresh data** on a connection saves its settings and immediately fetches it. Saves that write to Azure DevOps — **Monthly Time Writing** (Save … and refresh) and **My work** (close/resolve, move to the current Sprint, create month tasks) — are followed by a full refresh of the Time Writing backlog, saved locally, so every page shows the current Azure data. Every fetch — Save and refresh, Fetch, Fetch all or Refresh from Azure, for every connection type — is saved locally (browser database, or the desktop app's own storage) without a separate save step; queries are kept with their connection settings. A refresh is **saved automatically** and **replaces the Azure cache** rather than merging old out-of-scope records back in. The one exception: when Azure returns zero work items while saved data exists, the saved data is kept and the empty result is shown as a preview that can be saved or discarded, so a wrong team or query cannot wipe the cache. Export JSON first if the previous cache is needed. This removes only cached copies, not Azure source work items, activities, effort records or other app data. A failed fetch leaves the old saved data intact. Failure to remember the PAT in small browser settings no longer aborts an otherwise valid in-memory-token fetch.

### Azure PAT profiles

Connection settings can store several named ADS configurations. Each configuration is one complete set: **Azure DevOps URL, PAT and reason**—for example **Quality Backlog Read** or **Release Work Item Write**. Select exactly one active configuration; Fetch preview and Refresh use that configuration’s URL and PAT together, while the reason is the visible audit label. Saving a preview replaces the cached Azure dataset with that selected source scope, so dashboards never silently mix different source scopes. Configurations are browser-local only and excluded from IndexedDB app data, JSON backups, SharePoint snapshots, browser exports and GitHub. Use separate least-privilege tokens where possible: a read-only configuration for refresh and a Work Items (Read & Write) configuration only while creating or updating work items. Removing a configuration only removes its local copy; revoke the PAT in Azure DevOps if it should no longer work. Browser-local storage is not an enterprise secret vault, so do not share a browser profile with someone who must not use the token.

**Backlogs** (formerly Board) is a compact, expandable table following Epic → Feature → User Story → Task parent links. It defaults to the multi-select **New + Active** state filter. Select additional source states or **All**. Removed items are always excluded, including parent context, level selectors and the source-details table; active descendants remain visible with a missing-parent indicator. Other ancestors outside the state filter are shown as parent context. **Refresh from Azure** reads a fresh snapshot without changing Azure DevOps; **Save fetched work items** persists that snapshot in app storage. Failed refreshes retain the previous data. This is an on-demand refresh, not a background/live subscription.

**Column Options** supports visibility, ordering, reset, cancel and apply. Title is required to retain hierarchy controls. Preferences are saved separately in the browser per organization/project/team and do not modify Azure DevOps or central app state. Default columns: Order, ID, Work Item Type, Title, Description, State, Story Points and Actions. Additional columns: Assigned To, Iteration Path, Area Path, Target Date, Closed Date and Tags. Description is displayed as plain text, never injected HTML. Refresh old snapshots once to populate the newly mapped Description and Story Points fields. Empty numeric values are not replaced with invented estimates. The table has a sticky header, horizontal scrolling and 200-row pagination of expanded rows to bound large-list rendering. Backlog levels promote Features, User Stories or Tasks to the top level without changing their source relationships.

Order is a displayed root-row number, not a write to Azure backlog priority.

### Large browser datasets and storage recovery

Full app data now uses **IndexedDB**, not the small synchronous localStorage snapshot. PATs, connection configuration and column preferences remain separate small browser settings. On first use of this version, an empty IndexedDB imports the previously saved `demand-planning-mvp-v1` snapshot; the old copy is retained, not deleted. Once IndexedDB contains data it takes precedence, so an older legacy snapshot cannot overwrite a newer database. A database read failure or malformed backup blocks startup rather than replacing saved data with demo records. No initial seed is saved before hydration completes.

Autosaves are debounced and serialized; a save is confirmed only on IndexedDB transaction completion. Failed/aborted saves retain the previous committed data, show a persistent warning, offer direct JSON backup and retry controls, and warn on closing with pending saves. Browser privacy policy, disk limits, eviction and clearing site data can still affect persistence. This is browser-local storage, **not** a multi-user central database or a guarantee of unlimited space.

If the old version displays a storage-full warning, keep that tab open and first use **Snapshots → Portable data → JSON**. Open the updated version separately, then use **Snapshots → Browser storage & backup recovery** to select the JSON file, review counts and confirm replacement. Restore does not write to Azure DevOps and is disabled while SharePoint is connected. Wait for a confirmed browser save before closing the old tab. Backups contain app records but not the PAT; protect them as internal data. In-memory-only changes in an old tab cannot be recovered automatically after that tab is reloaded or closed.

`pnpm test:azure` runs both Azure integration checks and storage tests, including a 14,000-item synthetic backlog, legacy migration, failed reads, serialization, aborts and backup validation. `tests/browser-storage-preview.html` is a local-only UI fixture using a separate synthetic test database; it never opens the real app database.

New Features are assigned to the Feature creator email saved in the active ADS configuration (not the app's local demo user, and not the PAT identity GUID, which Azure DevOps does not accept as Assigned To). The assignment is verified after Feature creation. Tokens remain outside exported app state.

Opening the creation form reads team iterations and the project iteration tree. Dated leaf iterations containing today's India calendar date are treated as Sprint candidates; their nearest dated ancestor is the PI. Team-configured Sprint candidates take precedence. Start and finish days are inclusive. A unique pair is preselected; overlapping branches require explicit selection and missing dates/nesting block creation until corrected in Azure settings. The mapping is shown for review: **Feature → PI; all new User Stories → Sprint; Time Writing Task → project root**. Dates are rechecked before a write. Existing Feature/child iterations are not silently changed during completion; conflicting existing children require manual review in Azure.

No production data, tenant identifiers, access tokens, client secrets or employee information belong in Git. The local adapter persists synthetic development records in browser storage.

The central-data MVP uses Microsoft identity delegated authentication and one versioned JSON file in the site's default SharePoint document library. The browser never stores a client secret. An ETag prevents one user from silently overwriting a newer central version.

## Production prerequisites

1. Microsoft Entra single-page application registration with the GitHub Pages and localhost redirect URIs. The Tenant ID is optional in the app; when omitted, Microsoft work-account sign-in discovers it.
2. Approved delegated `User.Read` and `Sites.ReadWrite.All` permissions, or a narrower approved replacement.
3. Access to the I&D Quality SharePoint site and its default document library.
4. Windows code-signing and an approved software distribution route.
5. UAT owner, rollback procedure and operational support ownership.

## Planned adapters

- `IndexedDBStateRepository` — offline/local app cache with legacy localStorage migration and JSON recovery
- `SharePointStateClient` — central JSON state with Microsoft sign-in and optimistic concurrency
- `ReleaseImportAdapter` — mapped CSV/Excel exports from TFS and Windchill
- `ReportingAdapter` — PDF, PNG and 2-slide PowerPoint generation
- `InsightsAdapter` — governed AI summaries with source traceability

## Maintenance-risk controls

The solution is intentionally documented, typed, version-controlled and adapter-based to reduce the in-house single-maintainer risk. Before production, Philips should nominate a secondary maintainer, use pull-request review, keep deployment/runbook documentation, and conduct a recorded handover with restore testing.
