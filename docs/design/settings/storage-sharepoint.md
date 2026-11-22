# SharePoint

[Back to Settings](../admin.md)

## Default design

Connection card displays host, site, configured data path, whether the application ID is set, and a connection status. The default central file is `Demand Planning MVP/demand-planning-state.json` in the configured I&D Quality site. Configure opens a modal with client ID, optional tenant ID, host, site and data file fields. An empty central file state offers Initialize; a connected state offers Pull latest and Disconnect.

## Behavior and storage

Uses Microsoft sign-in through MSAL and Microsoft Graph. The central JSON is read into application state, and live SharePoint mode schedules writes after changes using the last ETag. A conflict prompts a pull before continuing. The browser retains separate cached state; access depends on the SPA registration, delegated access and file permissions. Snapshot actions have their own path and controls.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`sharepoint.ts`](../../../src/sharepoint.ts)
- [`store.ts`](../../../src/store.ts)
- [`browserState.ts`](../../../src/browserState.ts)
- [`cloudSnapshots.ts`](../../../src/cloudSnapshots.ts)
