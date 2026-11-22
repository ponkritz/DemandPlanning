# Sprint check

[Design index](README.md) · Route `bulk` · [SprintCheckPage](../../src/pages/SprintCheckPage.tsx)

## Default view

The page is scoped to the person in the application header. It presents Move to current PI + Sprint and State checks. New and Active are both selected for the move. The target is empty until the user checks Azure sprint dates. Expanded state-check rows show relevant children with their work item links, states and reasons.

## Sprint move

The date lookup uses the Time Writing connection's team/project iterations. It preselects the first current PI/Sprint pair, allows a choice when multiple current pairs are available, and shows an error when it finds none. A past Sprint has a known finish date strictly before today in India. Move candidates are the selected person's New and/or Active User Stories in past Sprints, excluding Time Writing stories, the absence hierarchy and stories already on the target. Unknown or undated iterations, Features and Tasks are ignored. Candidate rows sort by ID and can be unchecked before the confirmation. The background move writes Iteration Path, reports failures per item and refreshes Azure.

## State checks

- Flag a Feature when all its User Stories are Closed and a story when all its Tasks are Closed, requiring at least one child of the relevant type.
- Flag an Active Feature with no Active User Story and a New Feature with an Active User Story. The page can activate a New story owned by the selected person and can activate its New Feature.
- Flag an Active Feature whose Active stories sit in a later identifiable PI. The target is the latest PI among those stories by numeric comparison of PI names. A missing Feature PI is eligible when a child defines the target.
- Removed children are ignored. The absence hierarchy is excluded. Closure uses the shared selectable Feature/story dialog. Only allowed state transitions are sent.

## Sources, writes and limits

Source items and dates are from Azure DevOps. A missing person, connection or PAT blocks the corresponding operation. Synthetic mode allows closure preview and blocks live changes. Results are shown inline and background move progress is visible in the application header. There is no separate Sprint check export.

[Ownership, iteration and state rules](../../src/myWork.ts) · [Azure operations](../../src/azureDevOps.ts) · [Close helper](../../src/closeList.ts) · [Job status](../../src/backgroundJobs.ts)
