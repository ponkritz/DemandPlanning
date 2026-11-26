# My Tasks [Board]

[Design index](README.md) · Route `mywork` · [MyWorkPage](../../src/pages/MyWorkPage.tsx)

## Default view

Shows the selected person's identity, pending work and counts for Features, stories, bugs, Tasks and missing month Tasks. The table opens on Feature with ascending work item ID and collapsed child rows. Other type chips and All are available. A non-empty search overrides the type chip and matches every token, without regard to order or casing, across the item and its Feature/Epic context. Search accepts an ID with or without a hash. Use **+** to show child work, including children assigned to other people, and **−** to hide it. Rows without children have no toggle. The missing-task notice links to Time Writing.

## Data and rules

The view reads the Time Writing backlog and matches the person by email first, then by name when applicable. `isPending` excludes Closed, Resolved, Done, Completed, Removed and Cut, so a custom state outside that list can be pending. Epics and the configured absence hierarchy are excluded from the personal pending list. Missing Tasks are calculated for the current India month using owned and shared Feature candidates, independently of the month passed to the add-Task dialog.

A New story can become Active. A New Feature can become Active through this view once an Active story exists, and activating a story can also activate its New parent Feature. Active Features and stories offer Close. Other pending types offer direct Close. Feature and story closure uses a selectable tree with owned work ticked by default. Closing the last open work story can include its Feature, the Time Writing story and Tasks. Children are processed before parents and any kept or failed descendant prevents its parent from closing.

## Actions and persistence

New Feature, Complete Feature children where configured, add story, edit and add month Task reuse the Backlogs dialogs. Status actions require the Time Writing project and PAT. Synthetic data permits viewing the Feature/story close proposal and disables its write. Verified changes are applied to the local workspace before refresh and failures appear in the action log. The table uses shared column and export controls.

## Implementation

[Person identity and pending computation](../../src/useMyWork.ts), [matching, candidates and next states](../../src/myWork.ts), [cascade logic](../../src/closeChain.ts), [close dialog model](../../src/closeList.ts), [month Task dialog](../../src/components/MonthTasksDialog.tsx), [shared table](../../src/components/DataTable.tsx).
