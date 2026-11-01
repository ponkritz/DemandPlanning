# Configuration management plan

Document ID: CM-DPH-001 · Applies to: I&D Quality Demand Planning (web app and desktop app) · Related: [DEVELOPMENT-PROCESS.md](DEVELOPMENT-PROCESS.md) §8, [RELEASE-NOTES.md](RELEASE-NOTES.md), [SWBOM.md](SWBOM.md), [VERIFICATION-PLAN.md](VERIFICATION-PLAN.md).

This plan says what is under configuration control, how each item is identified and changed, how a version is built and released, and how its state is recorded and checked (IEC 62304 §8; ISO 13485 §4.2.4, §4.2.5, §7.3.9).

## 1. Configuration items

| Item | Where | Identified by | Changed by |
|---|---|---|---|
| Application source (web, desktop shell, scripts) | This repository: `src/`, `electron/`, `scripts/`, `index.html`, `vite.config.ts`, `tsconfig*.json` | Git revision; version `x.y.z` in `package.json` | Pull request to `main` (§4) |
| Tests and test data | `tests/`, `e2e/` (with `e2e/fixtures`) | Git revision | Pull request, with the requirement and test case it covers |
| Documents (Validation Package, release notes, this plan) | `docs/`, `README.md`, `CLAUDE.md` | Git revision; document ID in each document; bundled into each build (Documentation page) | Pull request, in the same pull request as the code they describe |
| Third-party components (SOUP) | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (overrides) | Exact versions and integrity hashes in the lockfile; [SWBOM.md](SWBOM.md) / `swbom.cdx.json` | Pull request; daily dependency check (§7) |
| Build and release definition | `.github/workflows/build-and-deploy.yml`, `electron-builder` settings in `package.json` | Git revision | Pull request |
| Build outputs | GitHub Pages (web app), GitHub release `desktop-latest` (installers, `SHA256SUMS`, `latest.json`), tagged releases `vX.Y.Z` | Version, CI build number and Git revision in `build-info.json` and `latest.json`; SHA-256 per installer | Only by CI (§5); never by hand |
| Shared team configuration | The private data repository (default `ponkritz/DemandPlanningStorage`): `azure-views.json` (connections and stream mapping), `access.json` (roles), `feature-setup.json`, `qe-mapping.json`, the Monthly pack setup and template, planning data, snapshots and analysis files | Git commit history of that repository | The app, by users whose role allows it (Manage shared settings for the setup files); every save is a commit |
| Per-user configuration | Browser or desktop local storage: PATs (one per server), connections, view preferences | Not identified; never shared | The user; PATs never leave the device (no Git, backups or SharePoint) |

Not configuration items: local `node_modules`, `dist/` and `release/` build folders, and data in Azure DevOps, Windchill or SharePoint (owned by those systems).

## 2. Identification

- **Version** `x.y.z` (semantic) in `package.json`, checked by `scripts/verify-version.mjs`:
  - **major**: a change that breaks existing data, the shared setup files in the data repository, or the way users work (they must be told before they update);
  - **minor**: a new or changed feature, report or rule;
  - **patch**: a fix, a dependency update, or documentation only.
- **Build number**: the CI build of a merge to `main`; with the Git **revision** it is in `build-info.json`, the app (Force Update dialog) and `latest.json` per platform.
- **Tag** `vX.Y.Z` on the merge commit of each version, created by CI (§5, CI-10); a tag pushed by hand must equal the version (CI-05).
- **Documents** carry a document ID (see [VALIDATION-PACKAGE.md](VALIDATION-PACKAGE.md)); their revision is the version they ship with.

## 3. Baselines

A **baseline** is a tagged version: the source, documents, lockfile and workflow at the tag, the build outputs of its CI run, and its Validation Package (the documents bundled into that build). The released baseline is the newest tag whose CI run passed; [RELEASE-NOTES.md](RELEASE-NOTES.md) lists every baseline with what changed.

## 4. Change control

Every change is a pull request to `main`:

1. Start from the request: requirement rows, test cases and document changes are identified first (CLAUDE.md; DEVELOPMENT-PROCESS.md §4).
2. In the same pull request: the code, the tests, the documents (requirements, test plan, UAT, README, known issues, DFMEA, security assessment, software components, regenerated traceability matrix and SWBOM as they apply), **the version bump** (§2) and **the release-notes entry** for the new version.
3. Before pushing: `npx tsc -b`, `pnpm lint`, `pnpm test` (includes the traceability, SWBOM and release-notes checks), `pnpm build:web`, `pnpm test:e2e` when the UI changed.
4. CI runs on the pull request (Windows packaging, unit tests, E2E); the pull request is merged (squash) only when CI is green, with the expected head revision.
5. After the merge: CI builds and publishes the version, tags the merge commit `vX.Y.Z` and publishes its release (§5). Nobody tags by hand.

Emergency fixes follow the same steps; there is no path to `main` that skips CI.

## 5. Build and release

- **Every merge to `main`** builds and tests the app, deploys the web app to GitHub Pages, and publishes the installers with `SHA256SUMS` and `latest.json` to the `desktop-latest` release; the desktop updater downloads only from there and verifies the SHA-256 (DSK-07…09).
- **The tagged release:** when the Windows, macOS and end-to-end jobs of that merge pass, the job *Tag and publish versioned release* tags the merge commit `vX.Y.Z` (the version in `package.json`) and publishes the GitHub release of the version with both installers, their SHA256SUMS files and the version's entry from RELEASE-NOTES.md (`scripts/release-entry.mjs`) (CI-10). It runs no dependency code (CI-07). When that release already exists (the version was not bumped) it changes nothing. A run cancelled by a later merge leaves its version untagged: re-run that workflow run (LIM-13). A tag pushed by hand runs the same job.
- **Rollback:** revert the change by a new pull request (with its own patch version and release-notes entry); a published version is never replaced in place. The web app follows `main`; desktop users update to the newest `desktop-latest` build.

## 6. Status accounting

| Question | Answer kept in |
|---|---|
| What changed in each version, and when? | [RELEASE-NOTES.md](RELEASE-NOTES.md); the merged pull requests; the tags |
| Which version and build is running? | The app (Force Update dialog: version, build number, build ID); `build-info.json`; `latest.json` |
| Which requirements, tests and components does a version have? | [TRACEABILITY-MATRIX.md](TRACEABILITY-MATRIX.md) and [SOFTWARE-COMPONENTS.md](SOFTWARE-COMPONENTS.md) of that version |
| Which third-party components and licences? | [SWBOM.md](SWBOM.md) / `swbom.cdx.json` of that version |
| Which bugs and limitations are open? | [KNOWN-ISSUES.md](KNOWN-ISSUES.md) of that version |
| Who changed the shared setup, and when? | The commit history of the data repository |

## 7. Configuration audits and checks

Automatic, on every pull request and merge (`pnpm test`, CI):

- `scripts/verify-version.mjs`: the version is `x.y.z`; a tag equals the version.
- `tests/release-notes.test.mjs` (TC-CI-06): the release job runs on main after the Windows, macOS and end-to-end jobs, takes its notes from the version's entry and leaves an existing release alone.
- `tests/release-notes.test.mjs`: the newest version in RELEASE-NOTES.md is the version in `package.json`, versions are unique and in descending order, and every version has an entry.
- `scripts/traceability.mjs --check`: the traceability matrix is current and complete.
- `scripts/swbom.mjs --check` (in `tests/swbom.test.mjs`): the SWBOM lists exactly the lockfile's components.
- `pnpm install --frozen-lockfile`: the build uses exactly the locked components.

Daily: the scheduled dependency check runs `pnpm audit`, updates within the allowed ranges, regenerates the SWBOM, scans for secrets and opens a pull request (with a patch version) when anything changed.

Per release, by hand: the UAT and manual checks of the verification plan, recorded with the version and build number (VERIFICATION-PLAN.md; TEST-PLAN.md §8).

## 8. Shared team configuration

The shared setup files in the data repository are configuration of the running app, not of the software: they change without a new version. Control:

- Only roles with **Manage shared settings** change the stream mapping and the other shared setup files in the app; every change is a commit, so it can be inspected and reverted in the data repository.
- The admin's **stream mapping** is enforced on every user at their next start (CON-79); a user's own connections outside it stay local.
- PATs are never written to the data repository, backups or SharePoint; one PAT per server stays in each user's browser or desktop app.
- Writes to Azure DevOps go to dev.azure.com only; on-premises servers are read-only.
