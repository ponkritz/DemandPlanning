# PI Review

**Routes** `pireview` in Data Insights and `mypireview` in My Work. Both choose their own PI.

## Default design and current behavior

PI Review lists Features for the selected PI using the Time Writing backlog and iteration dates. The Feature drawer shows Azure DevOps Discussions in plain text and the latest review fields. My PI Review filters to the active person, with a person picker for authorized leads.

## Writing reviews

The review form follows **Admin → Feature & PI setup → PI Review form**. A Feature’s assignee, its Epic’s designated Product Owner when eligible, or a viewer with the required posting permission can submit a review through the cloud Azure DevOps connection. A comment counts for a PI when it begins with the corresponding Feature Review heading. An eligible older comment can be converted.

In My PI Review, select eligible Features and use **Update review for N…** to edit an individual row for each Feature. Existing reviews prefill their rows. The background job rereads each Discussion and writes only when the result still matches the confirmed plan. It reports each result and lets users retry failed rows.

Review dates display the latest edit time. The heading determines which PI a review counts for. The review start cutoff still uses the original creation date.

## Meeting presentation

Authorized users can build a PI Review Meeting as an offline HTML presentation. The selected scope supplies the Features, review details, time-writing metrics and long-running counts. Meeting presentation settings control the layout and month limits. Saving a meeting to Git requires verified private storage.

## Code

[PI Review](../../src/pages/PiReviewPage.tsx) · [My PI Review](../../src/pages/MyPiReviewPage.tsx) · [Review form](../../src/pages/PiReviewForm.tsx) · [Write and audit](../../src/piReviewWriter.ts) · [Navigation](../../src/pages/registry.ts)
