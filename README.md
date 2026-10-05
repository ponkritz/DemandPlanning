# Demand Planning Hub

Windows desktop MVP for demand planning, effort tracking, capacity, release milestones, governance and monthly reporting.

## Current baseline

The repository contains a working React/TypeScript application with an Electron desktop shell. It starts with synthetic local data and includes an opt-in Microsoft sign-in adapter for centrally stored SharePoint data.

Implemented in the MVP UI:

- Unified dashboard for plan, actuals, variance, ad-hoc work, utilization and milestones
- Activity register with process owners, resources, bands and measurable complexity
- Monthly planning and actuals; automatic month-level ad-hoc classification after planning freeze
- Independent planning/actuals locks, extensions, reason and audit trail
- Versioned, editable effort baselines and non-blocking ±25% variance flags
- TFS/Windchill/manual release staging model
- Direct `.xlsx` TransformedData-sheet loading plus CSV template, header-driven validation and idempotent import
- Automatic creation of previously unknown team members as Contributors during migration
- LTE/PI Review snapshots plus CSV/JSON export
- Owner, Admin, Process Owner, Contributor and Viewer role model
- Admin-controlled resources, roles and master data
- SharePoint connection, initialization, pull, autosave and edit-conflict detection

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

Every push to `main` also builds and deploys the browser version to GitHub Pages at `https://ponkritz.github.io/DemandPlanning/`. It uses local browser storage until an Admin configures the approved Entra SPA registration under **Administration → SharePoint connection**.

## Data and security boundary

No production data, tenant identifiers, access tokens, client secrets or employee information belong in Git. The local adapter persists synthetic development records in browser storage.

The central-data MVP uses Microsoft identity delegated authentication and one versioned JSON file in the site's default SharePoint document library. The browser never stores a client secret. An ETag prevents one user from silently overwriting a newer central version.

The migration page accepts the exact 17-column shape of `Demand Planning _ Projects and Services(TransformedData).csv`. Source workbook data must never be committed to this repository.

## Production prerequisites

1. Microsoft Entra single-page application registration with the GitHub Pages and localhost redirect URIs. The Tenant ID is optional in the app; when omitted, Microsoft work-account sign-in discovers it.
2. Approved delegated `User.Read` and `Sites.ReadWrite.All` permissions, or a narrower approved replacement.
3. Access to the I&D Quality SharePoint site and its default document library.
4. Windows code-signing and an approved software distribution route.
5. Authoritative migration workbook access and mapping sign-off.
6. UAT owner, rollback procedure and operational support ownership.

## Planned adapters

- `LocalStorageAdapter` — offline/local cache and synthetic development adapter
- `SharePointStateClient` — central JSON state with Microsoft sign-in and optimistic concurrency
- `ReleaseImportAdapter` — mapped CSV/Excel exports from TFS and Windchill
- `ReportingAdapter` — PDF, PNG and 2-slide PowerPoint generation
- `InsightsAdapter` — governed AI summaries with source traceability

## Maintenance-risk controls

The solution is intentionally documented, typed, version-controlled and adapter-based to reduce the in-house single-maintainer risk. Before production, Philips should nominate a secondary maintainer, use pull-request review, keep deployment/runbook documentation, and conduct a recorded handover with restore testing.
