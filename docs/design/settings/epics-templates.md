# User Story templates

[Back to Settings](../admin.md)

## Default design

Searchable cards show title, description, Epic tags, Release Classification tags and how often the template is linked in saved Feature setup. Untagged dimensions mean any value. A new draft starts blank without tags.

## Behavior and storage

Requires `setup.values`, live mode and writable Git for edits. `epic-setup.json` stores a stable template ID and validated title. Setup per Epic offers templates filtered by its Epic/classification and can save a story as a template. Linked stories resolve the current template details at creation time; existing Azure Stories are separate work items. Removing a used template asks for confirmation and leaves the copied fallback in its referring setup.

## Implementation

- [`components/StoryTemplatesPanel.tsx`](../../../src/components/StoryTemplatesPanel.tsx)
- [`components/EpicFeatureEditor.tsx`](../../../src/components/EpicFeatureEditor.tsx)
- [`epicSetup.ts`](../../../src/epicSetup.ts)
- [`featureSetup.ts`](../../../src/featureSetup.ts)
- [`useEpicSetup.ts`](../../../src/useEpicSetup.ts)
