# Windchill release and project views

[Design index](README.md) · Route `windchill` · [WindchillViews](../../src/components/WindchillViews.tsx)

## Default view

Without a selected view, users with import permission see a CSV import panel, optionally prefilled with a stream name. Standard release logic is the usual default. ECP-prefilled import uses project logic and defaults to the second project folder. A loaded view displays the result count, fetch/import source and timestamp, then Releases or Projects and Raw data or Query output tabs. Releases default to the header month and sort by the latest readable document date descending. Raw search examines displayed columns. The release table exposes source and column overrides, an All months option and expandable document and location evidence.

## Acquisition, grouping and filters

- Export CSV import retains source columns. Configured live views use entity set, filter rows and selected columns to build an OData search. The desktop bridge and browser sign-in routes can fetch directly when supported. The user can also open a search in Windchill, then import the saved result, paste results, or use the Windchill-tab transfer. Connection errors are surfaced as status and saved data can be loaded from Git.
- Standard grouping prefers a usable Location column, where the deepest version-bearing folder supplies the name/version. Document name is selected automatically when there is no Location column, or explicitly through Read from. A standard-mode row with an unparseable location is reported as unmatched. ECP can parse the project from the document name when the folder value is blank. Delimited name/version pairs in a clubbed entry form one combined release. Document-name grouping normalizes case and trailing zero version parts. Location grouping preserves version spelling. ECP selects a numbered project folder at the configured depth and groups descendant documents under it.
- Month inclusion requires a readable document date in the selected month, even if another document is newer. Undated rows can still contribute to the All months view. Unmatched documents and unique locations can be inspected separately.
- A configured stream can show QMS-0025 matching from the tracking backlog. The match considers eligible stream Epic descendants and the configured threshold. When applicable, Create Feature uses the shared Azure form and a title composed from stream, release/project name and identifier.

## Persistence and exports

View definitions are stored locally. Results are stored by view ID and can be copied to Git when connected, separately from Windchill. A Git snapshot replaces older local results only when it is newer. Save locations to Git writes folder-level analysis metadata under `windchill-analysis/`. Raw/results/locations tables use the shared table export. No document file contents are needed for grouping. Write operations in the optional tracking column target Azure, while Windchill acquisition is read-only.

[Workspace and import paths](../../src/useWindchill.ts) · [OData views](../../src/windchillViews.ts) · [Browser fetch](../../src/windchillBrowser.ts) · [CSV parser](../../src/windchillExport.ts) · [Git snapshots](../../src/windchillSnapshots.ts) · [Release grouping](../../src/windchillReleases.ts) · [Release table](../../src/components/WindchillReleasesPanel.tsx) · [Matching](../../src/dpBoardMatch.ts)
