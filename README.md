# Demand Planning Hub

Windows desktop MVP for demand planning, effort tracking, capacity, release milestones, governance and monthly reporting.

## Current baseline

The repository contains a working React/TypeScript application with an Electron desktop shell. It starts with synthetic local data and includes an opt-in Microsoft sign-in adapter for centrally stored SharePoint data.

Implemented in the MVP UI:

- Separate Board view for the parent/child tree, state filters and release Feature/Story/Task creation; Azure DevOps handles connection settings, saved PAT and data fetch ([setup](docs/azure-devops-connection.md)).

- Unified dashboard for plan, actuals, variance, ad-hoc work, utilization and milestones
- Activity register with process owners, resources, bands and measurable complexity
- Monthly planning and actuals; automatic month-level ad-hoc classification after planning freeze
- Independent planning/actuals locks, extensions, reason and audit trail
- Versioned, editable effort baselines and non-blocking ±25% variance flags
- TFS/Windchill/manual release staging model
- Direct `.xlsx` TransformedData-sheet loading plus CSV template, header-driven validation and idempotent import
- Automatic creation of previously unknown team members as Contributors during migration
- LTE/PI Review snapshots plus CSV/JSON export
- Owner, Admin, Process Owner, Contributor and Viewer role model
- Admin-controlled resources, roles and master data
- SharePoint connection, initialization, pull, autosave and edit-conflict detection

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

## GitHub Actions deployment

### Versions, build identity and Force Update

The current release is **v0.2.1**. The authoritative number is `package.json` (`0.2.1` without the display prefix); the UI and release tags use **vX.Y.Z**. Increase **X** for a major/incompatible change (reset Y and Z), **Y** for a new backward-compatible feature (reset Z), and **Z** for bug fixes only. Rebuilding an unchanged release keeps its version and gets a distinct build ID. Do not automatically treat every commit as a release or infer version changes from build counts. Future releases must bump the appropriate component before deployment.

The sidebar shows version, build ID and build date/time in **IST**; the Force Update dialog also shows the source commit. GitHub Actions stamps `GITHUB_RUN_ID.GITHUB_RUN_ATTEMPT`; local builds use a commit/timestamp ID. Metadata is embedded in the app, emitted to `build-info.json`, and stamped into HTML. Both CI jobs verify the version and reject a release tag that does not exactly match `v` plus the package version.

**Force Update** checks a cache-busted, `no-store` build manifest, retrieves fresh same-origin HTML, verifies that its build ID matches the manifest, then navigates using unique update query parameters. Hashed assets include the build metadata and therefore change with each build. An offline/error response or an older HTML response blocks navigation and allows retry. This is a supported best-effort web equivalent of Ctrl+Shift+R; web JavaScript cannot invoke the browser's privileged hard-reload command. The button never clears localStorage, IndexedDB, cookies, PATs or column preferences. Browser/proxy caching policies still apply.

Updates always require acknowledgment of unfinished forms. Pending saves and active Azure fetches block reload. A failed save, SharePoint conflict or unsaved fetched preview requires exporting JSON first; the update backup includes the current preview and its scope. Export does not capture text in unsubmitted forms, so save or cancel those first. Desktop **Force Update** uses a trusted, narrow Electron cache-ignoring reload and reloads the installed package only—it does not download/install a new executable. The web button is also available on the startup/recovery screen, where it never exports an unread dataset as if it had been loaded.

Every push or pull request to `main` runs static analysis, compiles the production web bundle, packages the Windows NSIS installer, calculates its SHA-256 checksum and publishes the result as a 30-day workflow artifact.

Pushing a version tag such as `v0.1.0` runs the same verified pipeline and deploys the installer, blockmap and checksum to a GitHub Release. The workflow uses the repository-scoped `GITHUB_TOKEN`; no personal access token or application secret is required.

Every push to `main` also builds and deploys the browser version to GitHub Pages at `https://ponkritz.github.io/DemandPlanning/`. It uses local browser storage until an Admin configures the approved Entra SPA registration under **Administration → SharePoint connection**.

## Data and security boundary

### Backlogs, columns, refresh and current iterations

The Azure fetch is strictly **the selected team's native Epic backlog**, not all items in a project or area. The default source is the supplied InD Quality Epic-backlog URL. The team embedded in a backlog URL takes precedence over the manual team field. The app reads `/{team}/_apis/work/backlogs/Microsoft.EpicCategory/workItems` for Epic membership, then follows direct parent IDs through descendants using the team's exact/child-area rules and excluding Removed items. Every child query has a parent-ID constraint. An inaccessible or empty backlog never falls back to a project-wide query. Unrelated items in the same area are not fetched. The all-project Epic option has been removed.

Fetched membership is stored with organization/project/team and exact item keys. Older unscoped caches are hidden until a verified refresh. Saving a scoped preview **replaces the Azure cache** rather than merging old out-of-scope records back in; zero-item results can also be saved. Export JSON first if the previous cache is needed. This removes only cached copies, not Azure source work items, activities, effort records or other app data. A failed fetch leaves the old saved data intact. Failure to remember the PAT in small browser settings no longer aborts an otherwise valid in-memory-token fetch.

**Backlogs** (formerly Board) is a compact, expandable table following Epic → Feature → User Story → Task parent links. It defaults to the multi-select **New + Active** state filter. Select additional source states or **All**. Removed items are always excluded, including parent context, level selectors and the source-details table; active descendants remain visible with a missing-parent indicator. Other ancestors outside the state filter are shown as parent context. **Refresh from Azure** reads a fresh snapshot without changing Azure DevOps; **Save fetched work items** persists that snapshot in app storage. Failed refreshes retain the previous data. This is an on-demand refresh, not a background/live subscription.

**Column Options** supports visibility, ordering, reset, cancel and apply. Title is required to retain hierarchy controls. Preferences are saved separately in the browser per organization/project/team and do not modify Azure DevOps or central app state. Default columns: Order, ID, Work Item Type, Title, Description, State, Story Points and Actions. Additional columns: Assigned To, Iteration Path, Area Path, Target Date, Closed Date and Tags. Description is displayed as plain text, never injected HTML. Refresh old snapshots once to populate the newly mapped Description and Story Points fields. Empty numeric values are not replaced with invented estimates. The table has a sticky header, horizontal scrolling and 200-row pagination of expanded rows to bound large-list rendering. Backlog levels promote Features, User Stories or Tasks to the top level without changing their source relationships.

Order is a displayed root-row number, not a write to Azure backlog priority.

### Large browser datasets and storage recovery

Full app data now uses **IndexedDB**, not the small synchronous localStorage snapshot. PATs, connection configuration and column preferences remain separate small browser settings. On first use of this version, an empty IndexedDB imports the previously saved `demand-planning-mvp-v1` snapshot; the old copy is retained, not deleted. Once IndexedDB contains data it takes precedence, so an older legacy snapshot cannot overwrite a newer database. A database read failure or malformed backup blocks startup rather than replacing saved data with demo records. No initial seed is saved before hydration completes.

Autosaves are debounced and serialized; a save is confirmed only on IndexedDB transaction completion. Failed/aborted saves retain the previous committed data, show a persistent warning, offer direct JSON backup and retry controls, and warn on closing with pending saves. Browser privacy policy, disk limits, eviction and clearing site data can still affect persistence. This is browser-local storage, **not** a multi-user central database or a guarantee of unlimited space.

If the old version displays a storage-full warning, keep that tab open and first use **Snapshots → Portable data → JSON**. Open the updated version separately, then use **Snapshots → Browser storage & backup recovery** to select the JSON file, review counts and confirm replacement. Restore does not write to Azure DevOps and is disabled while SharePoint is connected. Wait for a confirmed browser save before closing the old tab. Backups contain app records but not the PAT; protect them as internal data. In-memory-only changes in an old tab cannot be recovered automatically after that tab is reloaded or closed.

`pnpm test:azure` runs both Azure integration checks and storage tests, including a 14,000-item synthetic backlog, legacy migration, failed reads, serialization, aborts and backup validation. `tests/browser-storage-preview.html` is a local-only UI fixture using a separate synthetic test database; it never opens the real app database.

New Features are assigned to the authenticated PAT owner (not the app's local demo user). Every person must use their own PAT for self-assignment. Tokens remain outside exported app state. Identity is read from the fixed organization connectionData endpoint and verified after Feature creation; no project-user-directory permission is added.

Opening the creation form reads team iterations and the project iteration tree. Dated leaf iterations containing today's India calendar date are treated as Sprint candidates; their nearest dated ancestor is the PI. Team-configured Sprint candidates take precedence. Start and finish days are inclusive. A unique pair is preselected; overlapping branches require explicit selection and missing dates/nesting block creation until corrected in Azure settings. The mapping is shown for review: **Feature → PI; all new User Stories → Sprint; Time Writing Task → project root**. Dates are rechecked before a write. Existing Feature/child iterations are not silently changed during completion; conflicting existing children require manual review in Azure.

No production data, tenant identifiers, access tokens, client secrets or employee information belong in Git. The local adapter persists synthetic development records in browser storage.

The central-data MVP uses Microsoft identity delegated authentication and one versioned JSON file in the site's default SharePoint document library. The browser never stores a client secret. An ETag prevents one user from silently overwriting a newer central version.

The migration page accepts the exact 17-column shape of `Demand Planning _ Projects and Services(TransformedData).csv`. Source workbook data must never be committed to this repository.

## Production prerequisites

1. Microsoft Entra single-page application registration with the GitHub Pages and localhost redirect URIs. The Tenant ID is optional in the app; when omitted, Microsoft work-account sign-in discovers it.
2. Approved delegated `User.Read` and `Sites.ReadWrite.All` permissions, or a narrower approved replacement.
3. Access to the I&D Quality SharePoint site and its default document library.
4. Windows code-signing and an approved software distribution route.
5. Authoritative migration workbook access and mapping sign-off.
6. UAT owner, rollback procedure and operational support ownership.

## Planned adapters

- `IndexedDBStateRepository` — offline/local app cache with legacy localStorage migration and JSON recovery
- `SharePointStateClient` — central JSON state with Microsoft sign-in and optimistic concurrency
- `ReleaseImportAdapter` — mapped CSV/Excel exports from TFS and Windchill
- `ReportingAdapter` — PDF, PNG and 2-slide PowerPoint generation
- `InsightsAdapter` — governed AI summaries with source traceability

## Maintenance-risk controls

The solution is intentionally documented, typed, version-controlled and adapter-based to reduce the in-house single-maintainer risk. Before production, Philips should nominate a secondary maintainer, use pull-request review, keep deployment/runbook documentation, and conduct a recorded handover with restore testing.
