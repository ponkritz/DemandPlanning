# Sprint check

[Design index](README.md) · Route `bulk` · [SprintCheckPage](../../src/pages/SprintCheckPage.tsx)

## Default view

The page is scoped to the person in the application header. It presents Move to current PI + Sprint and State checks. New and Active are both selected for the move. The target is empty until the user checks Azure sprint dates. Expanded state-check rows show relevant children with their work item links, states and reasons.

## Sprint move

The date lookup uses the Time Writing connection's team/project iterations. It preselects the first current PI/Sprint pair, allows a choice when multiple current pairs are available, and shows an error when it finds none. A past Sprint has a known finish date strictly before today in India. Move candidates are the selected person's New and/or Active User Stories in past Sprints, excluding Time Writing stories, the absence hierarchy and stories already on the target. Unknown or undated iterations, Features and Tasks are ignored. Candidate rows sort by ID and can be unchecked before the confirmation. The background move writes Iteration Path, reports failures per item and refreshes Azure.

## State checks

- Flag a Feature when all its User Stories are Closed and a story when all its Tasks are Closed, requiring at least one child of the relevant type.
- Flag an Active Feature with no Active User Story. Offer activation for a non-Active, non-Removed Feature with an Active direct User Story, including a Closed Feature. A New story owned by the selected person can be activated on the page. The parent’s state change requires its own confirmation.
- Flag an Active Feature whose Active stories sit in a later identifiable PI. The target is the latest PI among those stories by numeric comparison of PI names. A missing Feature PI is eligible when a child defines the target.
- Removed children are ignored. The absence hierarchy is excluded. Sprint check confirms a Feature on its own. For closure the shared dialog lists just that Feature and collects its PI review when the user has permission (PIR-18). Closing a User Story offers only that story. Other pages retain their selectable hierarchy closure dialog under BKL-39.

Before applying a proposed Feature state, read the live Feature and its complete set of direct children. Re-evaluate the story rule using all direct stories, including other assignees. Leave the Feature alone if the evidence is incomplete or the rule no longer applies.

## Sources, writes and limits

Source items and dates are from Azure DevOps. A missing person, connection or PAT blocks the corresponding operation. Synthetic mode allows closure preview and blocks live changes. Results are shown inline and background move progress is visible in the application header. There is no separate Sprint check export.

[Ownership, iteration and state rules](../../src/myWork.ts) · [Azure operations](../../src/azureDevOps.ts) · [Close helper](../../src/closeList.ts) · [Job status](../../src/backgroundJobs.ts)
