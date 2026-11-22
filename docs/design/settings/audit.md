# History

[Back to Settings](../admin.md)

## Default design

An All areas selector, text search and matching-count indicator sit above the newest-first changes. The list renders up to 200 matches. Area is an exact entity filter. Text matches entity, detail and action case-insensitively. Rows display action, entity, detail and formatted time.

## Behavior and storage

Requires `storage.shared` to open through the Settings registry. Reads `store.state.audits` rather than querying Git commits. The reset action requires browser confirmation and disappears while connected to live SharePoint. Reset replaces browser planning state with synthetic seed data, records a reset audit and clears fetched Azure items from that state. A Git commit is a separate action.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`settingsTabs.ts`](../../../src/settingsTabs.ts)
- [`store.ts`](../../../src/store.ts)
- [`seed.ts`](../../../src/seed.ts)
