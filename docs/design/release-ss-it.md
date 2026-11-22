# Release Details — S&S IT

The S&S IT menu entry resolves to the first matching imported Windchill export with standard release logic. With no matching export it opens the import form with the stream name prefilled. The loaded view defaults to the selected month and exposes the release grouping alongside the raw source rows.

[windchillReleases.ts](../../src/windchillReleases.ts) groups documents using the version-bearing folder when the Location column supplies the source. The user can select document-name grouping instead. Monthly membership comes from a document date within the selected month. Each release expands to its source evidence and may expose a tracking Feature match. Unparseable records can be inspected through the unmatched work. See [Windchill](windchill.md) for import, storage, export and optional Azure creation.

[Stream selection](../../src/streams.ts) · [Rendered panels](../../src/components/WindchillReleasesPanel.tsx)
