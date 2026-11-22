# People

[Back to Settings](../admin.md)

## Default design

People table shows source name/email, access role, team region and role, reports to, and inclusive employment dates. It also shows capacity and regional holidays for the selected month, missing mappings, team-read status, and a reporting tree. Default Joined on is 1 May 2026 until changed or cleared.

## Behavior and storage

The section needs `people.edit`. Sources combine Time Writing assignees, other fetched assignees and the configured Azure team roster. Profiles with history or earlier manual settings can be listed separately; removed people have their own restorable list. Azure email supersedes saved fallback. Team lookups need Project and Team Read. Dates and roles determine capacity, independently of app roles. Removing a leaver saves a date; Not part of the team flags the person outside every month. Access role assignment/revocation also needs `access.manage` and writable Git, and saves through the access store. Resource mappings and capacity defaults sync separately with planning data.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`azureDevOps.ts`](../../../src/azureDevOps.ts)
- [`capacity.ts`](../../../src/capacity.ts)
- [`useAccess.ts`](../../../src/useAccess.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
