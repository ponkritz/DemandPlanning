# Bucket rules

[Back to Settings](../admin.md)

## Default design

Fields for unplanned leave, sick leave, PTO, training words/tags, and other NPRA tags; a selected-month preview shows classification changes and the page can reset built-ins.

## Behavior and storage

Requires `capacity.rules`. Title matching is case-insensitive on whole words. A tag matches exactly or when a configured prefix ends at a non-letter/non-digit boundary. Leave priority is unplanned, then sick, then PTO, then Other. Under the absence Epic, training checks a Task or User Story rather than the shared Feature or Epic title. Outside that rule, NPRA and training tags can be inherited through the hierarchy. Blank word lists restore defaults; tag lists can be empty. Save normalizes and audits; Git distributes the settings.

## Implementation

- [`components/BucketRulesPanel.tsx`](../../../src/components/BucketRulesPanel.tsx)
- [`bucketRules.ts`](../../../src/bucketRules.ts)
- [`capacity.ts`](../../../src/capacity.ts)
- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
