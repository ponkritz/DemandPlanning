# Capacity roles

[Back to Settings](../admin.md)

## Default design

Shows one checkbox per team role. Defaults count QE, QMS and CAPA and leave out Lead and Manager. A reset restores the built-in choices.

## Behavior and storage

Permission is `people.capacityRoles`. Only the team role drives this setting; access roles and the People manager tick are separate. Excluded roles contribute neither hours nor capacity to current figures and can be displayed apart. Existing figure locks preserve their captured values. Edits normalize into capacity settings and audit before the explicit Git save.

## Implementation

- [`components/CapacityRolesPanel.tsx`](../../../src/components/CapacityRolesPanel.tsx)
- [`capacity.ts`](../../../src/capacity.ts)
- [`calculationProfiles.ts`](../../../src/calculationProfiles.ts)
- [`pages/AdminPage.tsx`](../../../src/pages/AdminPage.tsx)
