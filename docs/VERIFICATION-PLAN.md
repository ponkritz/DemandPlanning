# Verification Plan

Verification is defined in [TEST-PLAN.md](TEST-PLAN.md) (TP-DPH-001), against the requirements in [REQUIREMENTS-SPECIFICATION.md](REQUIREMENTS-SPECIFICATION.md) (SRS-DPH-001). This page summarises the automated part and the evidence to keep.

## Automated checks (every pull request and every push to main)

- `pnpm lint` (oxlint), with zero errors.
- `scripts/verify-version.mjs`: the package version is `x.y.z`, and a release tag matches it.
- `pnpm test`: Node test runner over `tests/*.test.mjs`. The coverage per requirement is in TEST-PLAN.md §7.
- `pnpm build:web` (`tsc -b && vite build`), which emits `build-info.json`.
- The Windows installer (NSIS) and the macOS universal disk image, each with SHA-256 sums.

## Manual verification

Run the L3 system test cases in TEST-PLAN.md §6 on the environments in §3. Record the results in §8, with the build number.

## Evidence

Keep the following for each verified build:

- the CI run link (lint, test and build logs);
- `latest.json` and SHA256SUMS from `desktop-latest`;
- the completed result record;
- screenshots for failed or UAT cases;
- the UAT sign-off.
