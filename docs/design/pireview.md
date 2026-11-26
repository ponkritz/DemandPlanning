# PI Review

**Routes** `pireview` in Data Insights and `mypireview` in My Work. Both choose their own PI.

## Default design and current behavior

PI Review lists Features for the selected PI using the Time Writing backlog and iteration dates. The Feature drawer shows Azure DevOps Discussions in plain text and the latest review fields. My PI Review filters to the active person, with a person picker for authorized leads.

## Writing reviews

The review form follows the shared PI Review Setup. A Feature’s assignee or a viewer with the required posting permission can submit a review through the cloud Azure DevOps connection. In My PI Review, select eligible Features and use **Update review for N…** to apply one form to all. The background job rereads each Discussion and adds or replaces the viewer’s review only when it still matches the confirmed plan. It reports each result and continues after individual failures.

Review dates display the latest edit time. PI matching continues to use the original creation date.

## Code

[PI Review](../../src/pages/PiReviewPage.tsx) · [My PI Review](../../src/pages/MyPiReviewPage.tsx) · [Review form](../../src/pages/PiReviewForm.tsx) · [Write and audit](../../src/piReviewWriter.ts) · [Navigation](../../src/pages/registry.ts)
