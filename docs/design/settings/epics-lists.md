# Value lists

[Back to Settings](../admin.md)

## Default design

Shows alphabetic cards with list name, one option per line and the Epics using the list. With writable Git and `setup.values`, an editor can add a named list, edit its options, discard or save a draft.

## Behavior and storage

Shared list IDs live in `epic-setup.json`; List-type Feature fields refer to those IDs. Duplicate names are rejected case-insensitively and referenced lists cannot be removed. Normalization validates definitions before a SHA-checked save to Git. These lists supply configured Feature inputs, including Release Classification where an Epic has a classification List field.

## Implementation

- [`components/EpicSetupPanel.tsx`](../../../src/components/EpicSetupPanel.tsx)
- [`epicSetup.ts`](../../../src/epicSetup.ts)
- [`useEpicSetup.ts`](../../../src/useEpicSetup.ts)
- [`useGitStorage.ts`](../../../src/useGitStorage.ts)
