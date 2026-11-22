# Calculation profiles

[Back to Settings](../admin.md)

## Default design

Lists built-in and custom profiles, marks the default, and offers editing/reset/copy or removal controls as applicable. Current (v4) is the default when no configured choice exists.

## Behavior and storage

Requires `capacity.settings`. Current counts project work, training, other NPRA and common activities against working-days capacity after absence; plan uses Original Estimate and status uses actuals. Old Calculation counts all buckets, deducts Standard Hours from its base, uses Completed Work for missing absence estimates, and classifies by planned utilization. The editor supports bucket treatment, planned source, capacity base, optional formula and profile terminology; normalization validates settings. Edited built-ins retain their identity. Saving changes planning data and records an audit; Save to Git publishes it.

## Implementation

- [`components/CalculationProfilesPanel.tsx`](../../../src/components/CalculationProfilesPanel.tsx)
- [`calculationProfiles.ts`](../../../src/calculationProfiles.ts)
- [`capacity.ts`](../../../src/capacity.ts)
- [`formula.ts`](../../../src/formula.ts)
- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
