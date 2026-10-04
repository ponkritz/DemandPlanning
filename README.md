# Demand Planning Hub

Windows desktop MVP for demand planning, effort tracking, capacity, release milestones, governance and monthly reporting.

## Current baseline

The repository contains a working React/TypeScript application with an Electron desktop shell. It deliberately uses synthetic local data while the Philips Entra application registration and SharePoint production connection are being approved.

Implemented in the MVP UI:

- Unified dashboard for plan, actuals, variance, ad-hoc work, utilization and milestones
- Activity register with process owners, resources, bands and measurable complexity
- Monthly planning and actuals; automatic month-level ad-hoc classification after planning freeze
- Independent planning/actuals locks, extensions, reason and audit trail
- Versioned, editable effort baselines and non-blocking ±25% variance flags
- TFS/Windchill/manual release staging model
- CSV migration template, preview, validation and local import
- LTE/PI Review snapshots plus CSV/JSON export
- Owner, Admin, Process Owner, Contributor and Viewer role model
- Admin-controlled master data

## Run

Requires Node.js and pnpm.

```powershell
pnpm install
pnpm dev
```

Desktop development:

```powershell
pnpm dev:desktop
```

Validation and Windows installer:

```powershell
pnpm lint
pnpm build:web
pnpm build
```

## GitHub Actions deployment

Every push or pull request to `main` runs static analysis, compiles the production web bundle, packages the Windows NSIS installer, calculates its SHA-256 checksum and publishes the result as a 30-day workflow artifact.

Pushing a version tag such as `v0.1.0` runs the same verified pipeline and deploys the installer, blockmap and checksum to a GitHub Release. The workflow uses the repository-scoped `GITHUB_TOKEN`; no personal access token or application secret is required.

Every push to `main` also builds and deploys the browser version to GitHub Pages at `https://ponkritz.github.io/DemandPlanning/`. This hosted MVP uses the local development adapter; central multi-user SharePoint persistence is enabled only after the approved Entra/SharePoint adapter is configured.

## Data and security boundary

No production data, tenant identifiers, access tokens, client secrets or employee information belong in Git. The local adapter persists synthetic development records in browser storage.

The production adapter will use Microsoft identity authentication and SharePoint Lists as the central data store. It must use a public-client flow suitable for desktop apps; a client secret must never be embedded in the executable.

## Production prerequisites

1. Microsoft Entra public-client application registration and approved delegated permissions.
2. SharePoint list schemas and least-privilege access groups.
3. Windows code-signing and an approved software distribution route.
4. Authoritative migration workbook access and mapping sign-off.
5. UAT owner, rollback procedure and operational support ownership.

## Planned adapters

- `LocalStorageAdapter` — current safe development adapter
- `SharePointAdapter` — activities, monthly effort, baselines, periods, masters and audit events
- `ReleaseImportAdapter` — mapped CSV/Excel exports from TFS and Windchill
- `ReportingAdapter` — PDF, PNG and 2-slide PowerPoint generation
- `InsightsAdapter` — governed AI summaries with source traceability

## Maintenance-risk controls

The solution is intentionally documented, typed, version-controlled and adapter-based to reduce the in-house single-maintainer risk. Before production, Philips should nominate a secondary maintainer, use pull-request review, keep deployment/runbook documentation, and conduct a recorded handover with restore testing.
