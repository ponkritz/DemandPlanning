# Snapshots

[Design index](README.md) · Route `snapshots` · [SnapshotsPage](../../src/pages/SnapshotsPage.tsx)

## Default view

Shows the configured Git destination and the selected month. Three cards offer LTE monthly snapshot, PI Review (Learnings & struggles), and portable CSV or JSON export. The page also shows browser storage and backup controls, and lists Git snapshot history newest first. Snapshot creation requires writable Git storage and is disabled while sample data is loaded.

## Git evidence

LTE and PI Review use the same capture path with different type labels. Version 2 freezes the saved application data, including Azure work items and their hours, release data, capacity, people and settings. The selected month is part of the snapshot metadata, alongside the ID, creator, timestamp and build. The export excludes credentials, personal views and earlier snapshots. The app creates a new JSON file in `lte-snapshots/` beside the configured Git planning file, enforces a 50 MB limit and verifies the result by reading it back before reporting success.

## Portable backup and restore

CSV exports the selected month's stored planning effort rows joined to activities and resources. JSON exports browser app state with personal view data excluded. Restore validates the backup and replaces the browser app state after confirmation. Git snapshots and browser backups are separate workflows.

[Snapshot whitelist, upload verification and listing](../../src/cloudSnapshots.ts) · [Git persistence](../../src/useGitStorage.ts) · [Backup schema validation](../../src/browserState.ts) · [Cloud snapshot tests](../../tests/cloud-snapshots.test.mjs)
