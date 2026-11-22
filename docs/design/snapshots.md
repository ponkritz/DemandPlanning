# Snapshots

[Design index](README.md) · Route `snapshots` · [SnapshotsPage](../../src/pages/SnapshotsPage.tsx)

## Default view

Shows SharePoint destination status and the selected month. Three cards offer LTE monthly snapshot, PI review (Learnings & struggles), and portable export (CSV or JSON). Below are IndexedDB status, backup/export/retry/restore controls and SharePoint history sorted newest first. Legacy records appear separately as unverified. Without a SharePoint connection, snapshot creation is disabled and the empty state links the workflow to Settings.

## SharePoint evidence

LTE and PI Review use the same capture path with different type labels. The snapshot freezes the currently loaded state and adds an ID, month, timestamp, author and build information. There is no automatic refresh and the data whitelist is captured broadly, not filtered to the chosen month. It includes saved primary Azure work items, planning and governance state, and excludes connection settings, credentials and recursive history. The folder is `Snapshots` beside the configured SharePoint state file in the document library. Microsoft Graph writes a UUID-based JSON file with conflict behavior set to fail. Size limit is 200 MB. Success is shown only after the file ID is returned and the file is read back with identical contents. If read-back fails, the file may already exist. Refresh history before retrying. History follows Graph pagination and includes only files that match the snapshot filename convention.

## Portable backup and restore

CSV exports the selected month's stored planning effort rows joined to activities and resources. JSON exports the browser app state with personal view data excluded. Restore clears the previous preview, enforces a 200 MB input limit, parses and validates JSON, and presents a confirmation checkbox. Restore is available only in local mode. It replaces app state, and durable success depends on the subsequent browser save status. It does not write to Azure DevOps. The Azure cache is browser app data, while this cloud snapshot operation has no IndexedDB fallback. Snapshots are point-in-time JSON evidence and do not render slide, PDF or image files.

[Snapshot whitelist, upload verification and listing](../../src/cloudSnapshots.ts) · [SharePoint client](../../src/sharepoint.ts) · [Application storage](../../src/store.ts) · [Backup schema validation](../../src/browserState.ts) · [Portable export functions](../../src/download.ts) · [Cloud snapshot tests](../../tests/cloud-snapshots.test.mjs)
