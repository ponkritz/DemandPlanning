# Holidays and common activities

[Back to Settings](../admin.md)

## Default design

Lists configured Epic/Feature mappings and this month’s per-person effect. The add editor starts as Common activity for Everyone and accepts an optional label. Scope can be Everyone, India, Netherlands or US.

## Behavior and storage

Requires `capacity.time`. The nearest configured Epic or Feature ancestor assigns each month Task to everyone in scope; a region uses the People profile’s region. Hours use Original Estimate, then Completed Work, then one funded working day. Holidays count as absence. Common activities have a separate bucket whose treatment follows the calculation profile. Recognized regional holiday Features under the absence Epic continue to work without an explicit mapping. Changes are audited with planning data and saved to Git explicitly.

## Implementation

- [`components/SharedTimePanel.tsx`](../../../src/components/SharedTimePanel.tsx)
- [`capacity.ts`](../../../src/capacity.ts)
- [`calculationProfiles.ts`](../../../src/calculationProfiles.ts)
- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
