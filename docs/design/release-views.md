# Release Details and configured views

The **Release Details** menu resolves configured Azure queries and Windchill exports to streams. Missing connections lead to Stream mapping or import. Custom views marked for the menu can appear under Other views. They use the same query/backlog or Windchill renderer with their own source shape, so a user-created view inherits its renderer’s default design.

| View | Design |
|---|---|
| DP | [DP query, milestones, board match and bulk creation](release-dp.md) |
| CP | [CP folder and signature report](release-cp.md) |
| IOCC | [IOCC document evidence and release grouping](release-iocc.md) |
| Content | [Content naming and bulk creation](release-content.md) |
| Tool Validations | [Tool validation work-item register](release-tool-validations.md) |
| S&S IT | [Windchill release view](release-ss-it.md) |
| ECP | [Windchill project view](release-ecp.md) |
| BRITE | [BRITE placeholder](brite.md) |
| Other Azure views | [Backlogs and custom query renderer](board.md) |

[streams.ts](../../src/streams.ts) matches a connection's label or reason against stream names, excludes personal views and the Time Writing connection from shared mapping, and prefers a hierarchy query for CP. [BoardPage.tsx](../../src/pages/BoardPage.tsx) takes the current connection and cached result, applies the month rule, and selects the render path. The source header shows fetch state and can offer a Git snapshot for eligible connections. Release actions that create Features send writes to the separate Azure Time Writing connection.
