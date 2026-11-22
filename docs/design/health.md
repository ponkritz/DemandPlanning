# Backlog Health

[Design index](README.md) · Route `health` · [BacklogHealthPage](../../src/pages/BacklogHealthPage.tsx)

## Default view

Opens on In older Sprints with Feature, User Story and Task included, empty search, all available people, iterations and states. The cards switch among In older Sprints, Features without DoD and Unassigned. Open Features only is checked on the DoD tab. Search examines ID, title, Assigned To and Iteration Path. People filter by assignee, or by Created By and Updated By on the Unassigned tab. A saved per-list column layout is used when available. ID remains fixed. The table can show ancestor links, a plain-text description, state and dates.

## Rules and source

Reads the Time Writing backlog for the entire team. The configured absence Epic and its descendants are excluded by following parent links. An older-Sprint item is pending and has a known iteration finish date before today's India date. DoD detection looks for `DoD` as a word in Description after stripping HTML tags. Unassigned items are pending with blank Assigned To. Default model order is Feature, User Story, Task, then ID. Unknown dates produce no Sprint findings. Sample mode has no live iteration dates. Cache data fetched before author metadata was mapped shows a refresh notice.

## Output and failure states

Each list uses shared table column, sorting, display and export controls. Export all lists produces one CSV with a list label for each row. It exports the underlying list buckets rather than the toolbar-filtered rows and honors the current open-only setting for DoD. This view reports issues without editing Azure items. Missing backlog, missing dates and iteration lookup failures have separate states.

[Health functions and CSV](../../src/backlogHealth.ts) · [Pending-work and past-Sprint rules](../../src/myWork.ts) · [Shared table](../../src/components/DataTable.tsx) · [Unit tests](../../tests/backlog-health.test.mjs)
