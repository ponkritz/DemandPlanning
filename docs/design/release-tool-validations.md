# Release Details — Tool Validations

## Default design

A release-style table groups fetched Azure work items into tools, with document detail on expansion and a raw query tab. It shows approval, document count and any matching Time Writing work and hours. The raw query uses the configured columns and suppresses the generic summary for this stream.

## Logic and implementation

[releasePath.ts](../../src/releasePath.ts) chooses the deepest usable Area Path folder below the project, skipping stream and release labels. With no usable folder, it derives the tool name from the title before its version or document terms such as plan, protocol and report. The version comes from the path or title if available. [releaseSource.ts](../../src/releaseSource.ts) groups the normalized tool/version and attaches tracking Features with their Task hours. [ReleaseView.tsx](../../src/components/ReleaseView.tsx) renders the list and the document drill-down. The standard connection refresh, month filter and table export rules apply.

For downloading controlled-format validation artifacts from private Git storage, see [Documentation](docs.md).
