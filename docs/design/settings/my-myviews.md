# My views

[Back to Settings](../admin.md)

## Default design

Lists personal views with name, server/project, status and Fetch or Remove. An add form appears only if a server already has a PAT. The form starts with blank name, server, project and WIQL, and retains server/project after a successful add.

## Behavior and storage

`newMyView` validates the name, known server, project, query and duplicate conditions. The view is marked personal and read-only, saved locally, added to Other views, and fetched. Removal asks for confirmation. Personal definitions and results are omitted from shared views, generated backups and SharePoint payloads. Cloud menu routing doesn’t convert these into shared streams.

## Implementation

- [`components/MyViewsPanel.tsx`](../../../src/components/MyViewsPanel.tsx)
- [`myViews.ts`](../../../src/myViews.ts)
- [`azureCredentials.ts`](../../../src/azureCredentials.ts)
- [`useAzureWorkspace.ts`](../../../src/useAzureWorkspace.ts)
- [`backlogViews.ts`](../../../src/backlogViews.ts)
