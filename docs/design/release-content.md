# Release Details — Content

## Default design

The release tab starts with a Title-based register and expandable source documents, alongside a raw query tab. It displays approval, matched work, planned and booked task hours, and a QMS-0025 match. Authorized users can select rows and open the bulk Feature dialog.

## Logic and implementation

[namingPatterns.ts](../../src/namingPatterns.ts) supplies the built-in Content pattern and supports configured replacements. [releasePath.ts](../../src/releasePath.ts) uses a matched title prefix, typically ending at `_RELEASE`, and falls back to the complete normalized title. The result has no separate version column. [releaseSource.ts](../../src/releaseSource.ts) aggregates documents and attaches tracking work. [ReleaseView.tsx](../../src/components/ReleaseView.tsx) renders the register, document details, and the board match entry point.

[ContentBulkCreate.tsx](../../src/components/ContentBulkCreate.tsx) asks for one assignee across the selected batch and shows the planned writes. [contentBulk.ts](../../src/contentBulk.ts) defines the target Epic, the DoD, four-hour Task estimate, and skip rules for exact existing matches or invalid titles. The dialog creates the review story and Time Writing hierarchy against Azure's work backlog. The view uses the table export rules and source-month filtering shared with the other query views.
