# Code Review Backlog

Source: code re-review of DemandPlanning v3.21.0 on 23 November 2026. All entries are open. P1 denotes delivery priority. **Potential Bug** flags a conflict between behavior and a requirement, permission, metric definition, or release rule. Findings carry evidence from code review unless a runtime observation is noted.

## P1 backlog

| ID | Finding | Acceptance criteria |
|---|---|---|
| CR-P1-01 | Time Writing drafts and selected rows carry across month or person changes. A UI check reproduced drafts carrying from December to January. | Switching month or person keeps edits in their original scope and clears or restores selections for the destination scope. Save verifies each draft belongs to its original month, person and Task. Test a scope switch and partial save. |
| CR-P1-02 | Some month Task creation and bulk-write routes bypass Plan or Actual locks. An ad-hoc Task can receive Original Estimate. | Apply each month's independent locks across every effort write path. New ad-hoc work allows Actual only while Actual is open. Test the cutoff, independent reopening, new and existing Tasks, and explicit zero hours. See CR-PB-01 and the project's ad-hoc hierarchy entry. |
| CR-P1-03 | The generic Azure work-item editor allows state, iteration and hours changes under the general edit permission. | Enforce the capability for each changed field before submitting to Azure. Test title edit access with state, move and hours denied independently, including mixed-field saves. See CR-PB-02. |
| CR-P1-04 | A personal on-premises Azure view can reach shared Git snapshot upload. | Reject personal profiles at the upload boundary on refresh, manual sync and retry. Verify that restore respects the same scope and review prior shared snapshots for unintended personal data. See CR-PB-03. |
| CR-P1-05 | SharePoint autosave may persist sample data to the shared state file. | Isolate demo changes from all shared saves. Test that loading, editing and leaving sample mode produce zero SharePoint writes. See CR-PB-04. |
| CR-P1-06 | Simultaneous SharePoint storage initialization can overwrite central state. | Make first creation atomic and use version checks for subsequent updates. Test two clients initializing the same empty destination and preserve any first successful write. |
| CR-P1-07 | Feature closure can skip open descendants below closed intermediates or omit descendants with unsupported close states. | Traverse the complete hierarchy and report unresolved children or unsupported transitions before closing the Feature. Verify ownership and write permissions and cover both omission cases. See CR-PB-05. |
| CR-P1-08 | Build 140 deployed web and published rolling Windows and macOS installers after both E2E jobs failed. | Gate every public promotion on the relevant tests for the exact commit and artifacts. Test that a failure or skipped required check prevents promotion, and smoke-test packaged desktop artifacts on their target OS. See CR-PB-06. |

## Potential Bug

| ID | Priority | Contradiction | Expected behavior and verification |
|---|---|---|---|
| CR-PB-01 | P1 | The UI shows month-specific Plan and Actual locks, but some Azure Task creation and bulk writes bypass them. Late work can be tagged ad-hoc with a Plan value. | Verify the shared write guards at the deadline and after separately reopening Plan or Actual. Track the fix in CR-P1-02. |
| CR-PB-02 | P1 | Access grants state, iteration and hours operations separately, but the generic editor uses general edit access to submit those fields. | Denied capabilities prevent the corresponding transport call even when general edit access is granted. Track the fix in CR-P1-03. |
| CR-PB-03 | P1 | SET-17 keeps personal view definitions out of shared setup, but an on-premises personal view can reach automatic shared snapshot upload. | Refresh a personal profile with writable Git configured and assert there is no shared write. Verify shared-profile sync still works. Track the fix in CR-P1-04. |
| CR-PB-04 | P1 | Sample mode is intended for isolated test data, but the SharePoint autosave path can treat the sample as shared state. | Observe all shared save calls during a sample session, including when connecting or switching modes. Track the fix in CR-P1-05. |
| CR-PB-05 | P1 | Feature closure can complete even when open descendants would remain beneath it. | A closed intermediary and an unsupported transition both surface the unresolved descendant instead of silently omitting it. Track the fix in CR-P1-07. |
| CR-PB-06 | P1 | Failed end-to-end tests stop the tagged release, but rolling installers and Pages can still be promoted. | Demonstrate that the same release policy gates all public destinations. Track the fix in CR-P1-08. |
| CR-PB-07 | P2 | The plan sets the default Actual cutoff to the fifth of the following month. The active rule defaults to the fourth and uses client-local time. | Apply the approved day and business time zone. The same month has the same lock state for users in different time zones at the cutoff. |
| CR-PB-08 | P2 | Pulse Check falls back to Changed Date when Closed Date is missing, while the dashboard requires Closed Date. Editing a closed item can shift the Pulse count into a later month. | Use one definition of closure and test the same item in both views after a later edit. |
| CR-PB-09 | P2 | Azure data is displayed for the selected connection, but editing the connection in place can reuse cached rows from its old scope. | Bind cached rows and imported snapshots to the source scope. Change project, team or server while a refresh is in flight and verify old rows never become the new result. |
| CR-PB-10 | P2 | Retrying Time Writing title sync can skip Tasks left behind by a partial failure because the parent Story title is already current. | After a Task rename fails, retry updates the remaining Task without repeating successful writes. |
| CR-PB-11 | P2 | A bulk operation can create Azure Stories and Tasks before an hours update fails, then omit the created IDs from its result. | A partial result lists committed IDs and the unrelated failed effort writes. Retry resumes the failed work without duplicating items. |
| CR-PB-12 | P2 | The app claims unassigned stories, but it can overwrite an assignment made by another user between discovery and save. | Use the verified unassigned state and revision from the same read. Confirm a concurrent claim stays with its new assignee. |
| CR-PB-13 | P2 | MON-14 is active, yet its linked behavioral test is retired. The replacement navigation check does not verify permitted writes or Azure read-back. | Link MON-14 to an active behavioral test and require an active case for every active requirement. |

Related project decisions and follow-up remain in the [Project Plan](PROJECT-PLAN.md).
