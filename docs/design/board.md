# Backlogs and configured Azure views

[Design index](README.md) · Route `board` · [BoardPage](../../src/pages/BoardPage.tsx) · [View resolver](../../src/backlogViews.ts)

## Default team backlog

The Time Writing connection supplies the editable team backlog. The toolbar shows New Feature, multi-select states, search, expand/collapse, backlog level and Column Options. Default states are New and Active. The hierarchy starts at Epic with nodes collapsed. Where the user's email is known, Assigned to me is enabled for a new browser session and keeps their work plus ancestors and descendants as context. Search reveals matching hierarchy. Scope requires matching organization and project. Removed work items stay excluded even with All. A matching child retains its filter-mismatched ancestors as context. A missing parent is identified on the row.

The hierarchy table pages expanded rows at 200, keeps Title fixed, uses configured column widths and stores shown columns and order per organization/project/team in the browser. This tree has its own Column Options with up/down controls. Query views use the shared DataTable and its table defaults and export. [Tree view](../../src/components/AzureWorkItemTree.tsx) · [Tree construction](../../src/azureHierarchy.ts) · [Hierarchy table](../../src/components/BacklogTable.tsx) · [Columns and visible rows](../../src/backlogView.ts)

The initial columns are Order, ID, Work Item Type, Title, Description, State, Story Points and Actions. A separate collapsed Source details and dates panel shows per-type counts and up to 100 matching fetched records with parent, target, close and fetch information.

## Writes and data lifecycle

- New Feature is created under the selected Epic. The shared editor resolves the Epic's setup, optional stories, assignee, iteration and Time Writing children. For configured Epics that allow completion, Complete children opens when optional stories are absent. The editors surface verified IDs and partial failures.
- Feature rows can add User Stories. User Story rows can add Tasks with the parent iteration initially filled. Feature, story and Task rows have Edit where the view is writable. The month-task dialog is available on Features and stories when creator identity is configured. Creation validates against Azure and merges verified items into the workspace.
- Primary cache refresh is scoped to the actual team backlog. Saving or replacing a fetched cache updates local application data. The cache operation does not delete Azure records. The source view shows connection and fetch state and gives a setup path if the project is missing. Azure writes require the supported cloud connection and application permissions.

The shared month Task dialog starts on the supplied month or the current India month and supports adding more months. Duplicate month rows are rejected. It suppresses Completed Work for future months, reuses a matching month Task and asks before overriding existing hours. Work continues as a background job, with partial work item IDs retained if a later write fails. The dialog accepts entered hours up to 1,000,000, while the Time Writing page's bulk form has a 1,000-hour input limit. [Month Task dialog](../../src/components/MonthTasksDialog.tsx) · [Job and retry behavior](../../src/monthTaskAction.ts)

## Configured view variants

Each secondary connection, including a secondary backlog connection, uses its own saved source and the read-only results renderer. The page's secondary branch renders query or release views. Only the primary Time Writing branch mounts the editable hierarchy. Their default scope is the header month, with an All months switch for eligible views. Query columns use the saved SELECT layout and ordering. A changed query can render its current column list with a stale-data warning pending refresh. Standalone queries can add dependency columns when fetched items contain them.

Recognized stream views add release-specific tabs and counts over the same query data. Ordinary rows use approval date and fall back to Changed Date. DP uses DDT month, or dated planned milestones as display fallback. CP's folder-report view takes the complete tree and uses QA/QE signature month, with a separate enrichment source for names. Any creation action from a read-only release view targets the cloud tracking backlog, with its own gate and Feature setup. Source status, Fetch and where supported Load from Git are exposed together.

[Query layout](../../src/queryView.ts) · [Per-connection cache](../../src/viewSources.ts) · [Release rules](../../src/releaseSource.ts) · [Release tabs](../../src/components/ResultTabs.tsx) · [Feature editor](../../src/components/FeatureEditor.tsx) · [Azure workspace](../../src/useAzureWorkspace.ts)
