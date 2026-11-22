# Capacity and absence

[Back to Settings](../admin.md)

## Default design

Summary and edit modal for the absence Epic, funded hours/day, overload threshold, spare-capacity threshold and monthly NPRA maximum. Defaults are Epic #37778, 8 h/day, overload at 100%, capacity available below 80%, and NPRA maximum 20 h/person/month.

## Behavior and storage

Requires `capacity.settings`. Save normalizes values, resets invalid threshold pairs to built-ins, preserves unrelated capacity policy and writes an audit entry. It updates local planning state. Use Git storage’s save action to distribute changes. The capacity model uses the configured absence Epic and resource/holiday/bucket rules to calculate monthly figures. A zero NPRA maximum still permits reporting NPRA hours.

## Implementation

- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
- [`capacity.ts`](../../../src/capacity.ts)
- [`bucketRules.ts`](../../../src/bucketRules.ts)
- [`calculationProfiles.ts`](../../../src/calculationProfiles.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
