# Release Details — ECP

ECP shows one menu entry per matching imported project export, each using its saved name. The unmapped entry opens import preselected for ECP. A loaded project export shows Projects and raw results using the shared Windchill route.

[streams.ts](../../src/streams.ts) resolves the project mode from explicit view settings or from the ECP/QRE names as a compatibility fallback. [windchillReleases.ts](../../src/windchillReleases.ts) groups documents by a numbered project folder at the selected depth, defaulting to the second folder. When Location is blank, the model can recover the project from the document name. The project groups retain their document evidence, use document dates for month filtering and can expose QMS-0025 matches. See [Windchill](windchill.md) for controls shared with standard release views.

[Project view settings](../../src/windchillViews.ts) · [Release and project rendering](../../src/components/WindchillReleasesPanel.tsx) · [Matching](../../src/dpBoardMatch.ts)
