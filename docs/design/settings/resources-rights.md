# Role rights

[Back to Settings](../admin.md)

## Default design

Shows effective identity, default role and a capability matrix by role, grouped by menu area and action. Each cell offers Allow, Deny or Not set. Check access explains a chosen person/capability. Membership assignment is in People in this host.

## Behavior and storage

When no policy exists, actions/areas are unrestricted in the app; the starting policy uses Team Member as the default and can seed the configured email as Admin. Explicit memberships combine allowed rights and Deny wins. `access.manage`, writable Git and live mode permit edits to `access.json`. Validation prevents editing away the current administrator’s access and enforces Tool Owner stream-governance constraints. A concurrent write conflict is reported. Azure and Git permissions still govern actual service operations.

## Implementation

- [`components/AccessPanel.tsx`](../../../src/components/AccessPanel.tsx)
- [`access.ts`](../../../src/access.ts)
- [`useAccess.ts`](../../../src/useAccess.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
