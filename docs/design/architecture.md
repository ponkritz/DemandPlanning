# Application architecture

## Runtime and composition

[main.tsx](../../src/main.tsx) applies the saved theme before rendering, mounts React in Strict Mode and catches render errors with ErrorBoundary. [App.tsx](../../src/App.tsx) owns application navigation and selected month, instantiates storage and data hooks, applies permissions, provides context for the page shell, and lazy-loads routes. Dashboards share the Azure workspace but build separate reporting models. [domain.ts](../../src/domain.ts) defines the cross-view state contract. [registry.ts](../../src/pages/registry.ts) describes fixed routes and navigation metadata. [settingsTabs.ts](../../src/settingsTabs.ts) defines settings navigation and old-link redirects.

## Data paths

| Source or state | Implementation | Design |
|---|---|---|
| Azure DevOps | [Workspace](../../src/useAzureWorkspace.ts), [transport](../../src/azureClient.ts), [read layer](../../src/azureRead.ts), [work-item operations](../../src/azureDevOps.ts) | Connection roles determine the editable Time Writing source and read-only query views. Bulk refresh runs Time Writing first. App startup runs one cloud refresh after shared setup arrives or a ten-second wait, with samples excluded. Insight routes can extend the fetched Time Writing data with [imported historical hours](../../src/history.ts). |
| Browser state | [store](../../src/store.ts), [browserState](../../src/browserState.ts) | IndexedDB stores the application state. On first use an existing legacy snapshot can migrate into an empty database. A serialized writer and save status surface persistence failure. Backup import validates data before replacing state. |
| Shared Git | [storage hook](../../src/useGitStorage.ts), [API and schema](../../src/gitStorage.ts), [shared views](../../src/viewDefinitions.ts), [snapshot model](../../src/gitSnapshots.ts) | The Git repository holds shared configuration and selected fetched data. Shared views merge by ID and separate personal views. Writes that use an expected SHA detect concurrent changes. The app can use a compatible stored on-premises snapshot when direct fetch is unavailable. |
| SharePoint | [SharePoint client](../../src/sharepoint.ts), [cloud snapshots](../../src/cloudSnapshots.ts) | Optional central app data uses Microsoft authentication and conditional saving. LTE and PI Review snapshots are separately stored as point-in-time files and verified by read-back. The desktop KPI workbook reader is a separate read path. |
| Windchill | [workspace](../../src/useWindchill.ts), [export parser](../../src/windchillExport.ts), [release grouping](../../src/windchillReleases.ts), [snapshot model](../../src/windchillSnapshots.ts) | Imported or fetched data is parsed and grouped using a view's selected logic. Saved views and results can be shared through Git. |
| Permissions and credentials | [policy](../../src/access.ts), [access hook](../../src/useAccess.ts), [View as guard](../../src/viewAs.ts), [Azure profiles](../../src/azureCredentials.ts) | App role actions control menu visibility and app operations. View as removes write capability in supported write paths. Azure PATs belong to the local user and server, while the personal work email identifies the person for work and reporting scope. Provider permissions are enforced independently by the service. |

## Shared rules

- Monthly Plan and Actual use the month Task's Original Estimate and Completed Work. The parent story provides hierarchy/context for Time Writing. [azureInsights.ts](../../src/azureInsights.ts) and [planningLock.ts](../../src/planningLock.ts) contain the monthly selection and lock primitives. Individual pages can narrow the eligible tasks further.
- The active capacity settings establish the default Plan lock after the 5th and Actuals lock after the 4th of the next month, at the end of the viewer’s local day. Month overrides change the relevant date independently. The post-lock creation rule applies `ad-hoc` to the Time Writing Task. See [Capacity & time](settings/capacity-period.md) and [Time Writing](activities.md).
- Release counts and matching are stream-dependent. See [Release view variants](release-views.md) for the source-specific implementations.

## Web, desktop, and release

The browser build and desktop app use the same renderer. [Electron preload](../../electron/preload.cjs) exposes bounded APIs for Azure DevOps, Windchill, SharePoint file reads, zoom and updates. [Electron main](../../electron/main.cjs) checks IPC senders, owns the session and window lifecycle, and calls the corresponding desktop transport. Cloud Azure is the write target. On-premises Azure is a read path.

[Vite](../../vite.config.ts) emits build metadata and a production content security policy. [GitHub Actions](../../.github/workflows/build-and-deploy.yml) derives the version from pending change notes, regenerates release documents, runs verification, builds and deploys the web app, and packages desktop installers. [Force Update logic](../../src/appUpdate.ts) checks fresh metadata and the HTML build marker on web, with save and preview safeguards. The [desktop updater](../../electron/desktop-update.cjs) validates the platform manifest and verifies installer SHA-256 before launching it.
