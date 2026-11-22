# Git storage

[Back to Settings](../admin.md)

## Default design

Connection card shows repository, branch and file, current synchronization status, and load/save/disconnect controls. With no configured repository the form offers the app’s default private data repository, `main` and `planning-data.json`. The token can be remembered on the current device.

## Behavior and storage

`useGitStorage` validates the configuration, reads the planning file, detects write access and tracks loaded/saved SHAs. A save serializes shared settings, baselines, release scope and resource mappings with conflict detection. The hook observes remote versions periodically and on focus, reloading clean shared planning data or warning when local edits exist. Synthetic sample data blocks Git saves. Disconnect removes device credentials/configuration; Git data stays in place.

## Implementation

- [`components/GitStorage.tsx`](../../../src/components/GitStorage.tsx)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
- [`gitStorage.ts`](../../../src/gitStorage.ts)
- [`gitWatch.ts`](../../../src/gitWatch.ts)
