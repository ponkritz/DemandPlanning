# Time Writing

[Design index](README.md) · Route `activities` · [MyActivitiesPage](../../src/pages/MyActivitiesPage.tsx)

## Default view

The header selects a month and person. Sticky cards show Capacity, Planned hours, Actual hours, Tasks, Monthly update and the last day. Your activities shows existing month tasks, with the Feature title when available, its Epic and a Leave or Training marker where applicable. Rows sort by Feature number. No new suggestions are selected by default. The suggested Feature state filter starts on New and Active. Add a new activity, Close Features and Save sit above the list. An empty source directs the user to fetch Time Writing or load the synthetic sample.

## Data and rules

- Existing rows are Azure DevOps Tasks assigned to the selected person, excluding Removed, with a month parsed from their title. Fields are Task Original Estimate and Completed Work. A User Story contributes context, never hours.
- Work suggestions come from the person's own or shared Features. Shared membership can come from an earlier Task or a description mention. Leave and Training candidates come from the configured absence Epic and are classified separately. The helper detects conflicting matching Time Writing stories instead of creating another.
- For the add dialog, the Epic selector uses Active Epics except the absence Epic. Selectable Features are New or Active and are assigned to the person or contain work assigned to them. The four modes are Time Writing Task, User Story, work Task and new Feature. A work Task uses an open non-Time-Writing story as its parent. Story and work Task creation offers current and future sprint pairs and preselects a unique current sprint.
- Capacity resolves all Azure names associated with the person's email and uses the same capacity model as My dashboard. Plan and Actual cards aggregate the selected person's month's Tasks. A task counts toward monthly update once it has positive actual hours or is a leave row. The denominator includes existing rows and unadded work suggestions. The UI shows an explanation when no capacity row exists.
- Active month controls default to end of the 5th of the selected month for Plan and end of the 4th of the following month for Actuals. Per-month shared settings can move or explicitly lock either date. The selected month drives checks. Closed tasks are read-only. Input validation accepts blank values or numeric hours from 0 to 1,000. An ad-hoc Task has no editable Plan, and eligible late Task creation receives the ad-hoc tag.

## Writes and recovery

Save queues one background job. It handles selected new rows and changed existing rows as individual Azure writes, reports item-level failure, clears the input draft after the loop, and refreshes Azure. It can reuse an existing month Task. Epic setup can seed planned hours while Planning is open. Save can partially succeed. Closing uses a checkbox preview of the open hierarchy, closes descendants first and leaves a parent open if a descendant was kept open or failed. The dialog requires confirmation that Time Writing Task hours are updated before closing selected month Tasks. A missing Time Writing connection, missing PAT or assignee, insufficient assignment rights, or sample mode blocks writes. Optional discussion comments are separate requests and can fail after creation.

## Implementation

- [Monthly task and absence candidates](../../src/myWork.ts), [hour roll-ups](../../src/azureInsights.ts), [capacity model](../../src/capacity.ts) and [month locks](../../src/planningLock.ts).
- [Azure mutation and verification](../../src/azureDevOps.ts), [background jobs](../../src/backgroundJobs.ts), [close selection](../../src/closeList.ts) and [Feature creation form](../../src/components/FeatureEditor.tsx).
- [Azure integration tests](../../tests/azure-devops.test.mjs) and [person and candidate tests](../../tests/my-work.test.mjs).
