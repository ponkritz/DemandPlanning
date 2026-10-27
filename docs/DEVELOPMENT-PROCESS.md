# I&D Quality Demand Planning — Software Development Process

| | |
|---|---|
| Document | SDP-DPH-001 |
| Part of | [VALIDATION-PACKAGE.md](VALIDATION-PACKAGE.md) |
| Standards | ISO 13485:2016 §4.1.6 and §7.3; IEC 62304:2006+A1:2015 (applied as the software life-cycle process); FDA guidance *Computer Software Assurance for Production and Quality System Software* (CSA); ISO 14971 for the risk management vocabulary |
| Status | Process description, for approval by the process owner and QA |

This document describes how the software is developed, verified, released and maintained, and maps each activity to the clause that asks for it. It is a description of the as-practised process with the evidence each step leaves; whether the process is **compliant** is decided by the organisation's quality assurance in an audit, not by this document. Where a step is not yet fully in place, it says so (§11).

## 1. Intended use and classification

**Intended use.** The tool supports Quality Engineering planning: it reads work items from Azure DevOps and release documents from Windchill exports, lets team members record planned and actual hours on Azure DevOps Tasks, and shows capacity, utilization, releases and baselines. It does not control, release or record anything in a product's design history file itself; the systems of record stay Azure DevOps, Windchill and the governed Git repository.

**Regulatory status (to be confirmed by QA).** The tool is not part of a medical device and does not implement a function of one. It is **software used in the quality management system** in the sense of ISO 13485 §4.1.6 (and 21 CFR 820.70(i) / the QMSR), which requires its validation for the intended use, proportionate to the risk. IEC 62304 strictly applies to medical device software; it is applied here, at the request of the product owner, as the structured life-cycle model for the development process, with the software treated as **Class A** (no injury or damage to health is possible from a software failure; the worst effect is a wrong planning figure or an unintended work-item change, both recoverable in the system of record). The FDA CSA guidance's **risk-based** approach decides how much assurance each feature needs (§6).

| Decision | Value | Rationale |
|---|---|---|
| IEC 62304 safety class | A (assumed; QA to confirm) | No hazardous situation can arise from the software; see the DFMEA severity scale: the highest severity is an unintended write to Azure DevOps or credential theft, both recoverable and outside patient safety |
| CSA risk of the intended use | **Not high process risk** for most features; **high process risk** features: the writes to Azure DevOps (effort, states, iterations, new items) and the credential handling, because a failure there could compromise the record in a quality-system tool | CSA: "high process risk" = a failure may compromise safety or quality in a way that reaches product quality or patient safety; here the writes reach a controlled record |
| Software of unknown provenance (SOUP) | Listed and version-pinned in [SOFTWARE-COMPONENTS.md](SOFTWARE-COMPONENTS.md) §2; vulnerabilities checked daily | IEC 62304 §5.3.3, §5.3.4, §7.1.3 |

## 2. Roles

| Role (PROJECT-PLAN.md) | Responsibility in this process |
|---|---|
| Product owner / process owner | Approves requirements (design inputs), open-issue decisions, risk acceptance, UAT sign-off, releases |
| Developer (human, with an AI coding assistant) | Implements changes with their documents and tests in one pull request; runs the checks |
| Reviewer | Reviews the pull request (code, documents, traceability) before merge; may be the product owner for a one-person team |
| Application owner | Operates CI, releases, the data repository and access roles |
| QA | Audits this process; confirms the classification (§1) |

## 3. Life-cycle model

The process is **incremental**: every change goes through the whole life cycle in one pull request, from requirement to released build, and the Validation Package is regenerated with it. The documents below are the design history of the software.

| Life-cycle activity | IEC 62304 | ISO 13485 §7.3 | Where it is done | Evidence |
|---|---|---|---|---|
| Planning | 5.1 | 7.3.2 | This document; [PROJECT-PLAN.md](PROJECT-PLAN.md) (phases, risks, ownership); CLAUDE.md (working rules) | Documents in Git |
| Requirements analysis | 5.2 | 7.3.3 (inputs) | [REQUIREMENTS-SPECIFICATION.md](REQUIREMENTS-SPECIFICATION.md): user requirements (UR) → system requirements (SR) → detailed requirements, each with verification method, priority and trace | Requirement rows; the pull request that adds them |
| Architectural design | 5.3 | 7.3.4 (outputs) | [SOFTWARE-COMPONENTS.md](SOFTWARE-COMPONENTS.md) §1 (software items by layer), §2 (SOUP), §3 (platforms); REQUIREMENTS-SPECIFICATION.md §1.2 (system boundary, external systems) | Component inventory kept with every change |
| Detailed design | 5.4 | 7.3.4 | The header comment of every source file states what it does and which rule it implements; the detailed requirements are the design specification of behaviour | Source files |
| Implementation and unit verification | 5.5 | 7.3.4, 7.3.6 | TypeScript with strict typing (`tsc -b`), lint (`oxlint`), unit tests (`node --test tests/*.test.mjs`); every behaviour change comes with a test | CI log of each pull request |
| Integration and integration testing | 5.6 | 7.3.6 | The web build (`vite build`) and the desktop package (electron-builder) in CI; the end-to-end suite (`pnpm test:e2e`) drives the built app in Chromium | CI log; E2E results |
| System testing | 5.7 | 7.3.6 (verification) | [TEST-PLAN.md](TEST-PLAN.md) §6: L1 automated, L2 static, L3 manual system cases with steps and expected results; coverage matrix §7 | Result record TEST-PLAN.md §8; CI log |
| Validation | — | 7.3.7, 4.1.6 | [UAT-PLAN.md](UAT-PLAN.md): the UAT cases performed by non-developer users against the intended use, with sign-off; the E2E suite automates the repeatable UAT scenarios | Signed UAT record; feedback log |
| Release | 5.8 | 7.3.7, 7.3.8 (transfer) | CI publishes the installers with SHA-256 sums and `latest.json`, deploys the web app; the build number and revision are in the app; [VERIFICATION-PLAN.md](VERIFICATION-PLAN.md) lists the evidence to keep | `desktop-latest` release; Pages deployment; VERIFICATION-PLAN.md evidence list |
| Maintenance | 6 | 7.3.9 (changes) | Every change is a pull request with its documents; the daily dependency check; [KNOWN-ISSUES.md](KNOWN-ISSUES.md) as the problem log | Pull request history; KNOWN-ISSUES.md |
| Risk management | 7 | 7.3.3 (inputs), 7.1 | [DFMEA.md](DFMEA.md) (design failures) and [SECURITY-ASSESSMENT.md](SECURITY-ASSESSMENT.md) (threats, risks, mitigations), each control traced to requirements and tests | The two documents, reviewed per pull request |
| Configuration management | 8 | 4.2.4, 7.3.10 (file) | Git (`main` protected by CI), semantic version in `package.json`, frozen lockfile, build number and revision in every build, tagged releases | Repository; `build-info.json` |
| Problem resolution | 9 | 8.3, 8.5.2 | KNOWN-ISSUES.md (known bugs KB, open issues OI, accepted limitations LIM) with severity, status and the fixing pull request | KNOWN-ISSUES.md; pull requests |
| Design review | — | 7.3.5 | The pull request review before merge covers code, documents, traceability and the risk documents; CI must be green | Review and merge record on GitHub |
| Design and development file | — | 7.3.10 | The Validation Package: all documents in `docs/`, bundled with the build and shown in the app | The Documentation page of the running build |

## 4. Change procedure (one pull request)

Every change — feature, fix, dependency update, document correction — follows the same steps. The rules are enforced by CI and by the documents' own tests where they can be.

1. **Requirement.** Add or change the requirement rows (user, system and detailed levels as needed) in REQUIREMENTS-SPECIFICATION.md; retire a row by prefixing `*(Retired — see …)*`, never delete it. State verification method, priority and the use-case trace.
2. **Risk.** Review the DFMEA rows and the security threats the change touches; add a row when a new function or control appears; name the rows in the pull request.
3. **Design and code.** Implement with a header comment per file that states the rule; keep the component inventory (SOFTWARE-COMPONENTS.md) current when a file is added, removed or repurposed.
4. **Tests.** Add or change the L1 unit test, the TEST-PLAN.md §6 case (steps, expected results), the §7 coverage row and, where the case is a user scenario, the E2E scenario and the UAT day.
5. **Documents.** Update README.md and any other `docs/` file that describes the changed area; regenerate the traceability matrix (`pnpm trace`).
6. **Checks before pushing.** `npx tsc -b`, `pnpm lint`, `pnpm test` (which includes the traceability and validation-package checks), `pnpm -s build:web`, and `pnpm test:e2e` when the change touches the UI.
7. **Pull request.** Describe the change and its test plan; CI runs lint, version check, unit tests, the traceability check, the build, the Windows package and the E2E suite; a human reviews.
8. **Merge and release.** Squash-merge to `main`; CI publishes the desktop installers (`desktop-latest`, with SHA-256 sums and `latest.json`) and deploys the web app; the deployment is checked (build number and revision).
9. **Record.** KNOWN-ISSUES.md entries opened or closed by the change carry the pull request number.

## 5. Verification strategy

| Level | What | Tooling | Frequency |
|---|---|---|---|
| L1 unit | Pure functions and parsers; one test per detailed requirement where the method is T | `node --test tests/*.test.mjs` (fake IndexedDB for storage) | Every pull request and push |
| L2 static | Types, lint, version, document consistency (traceability, validation package) | `tsc -b`, `oxlint`, `scripts/verify-version.mjs`, `scripts/traceability.mjs --check`, `tests/validation-package.test.mjs` | Every pull request and push |
| L3 system | UI behaviour in the browser and the desktop app | TEST-PLAN.md §6 manual cases; `pnpm test:e2e` automates the repeatable ones against the built app (no network) | E2E every pull request; manual cases at release and UAT |
| L4 acceptance | Use cases by non-developer users | UAT-PLAN.md | Each release that changes a user-facing feature |
| Security | Code analysis, penetration tests, dependency audit | SECURITY-ASSESSMENT.md §2; daily `pnpm audit` | Daily (dependencies); per release or boundary change (assessment) |

## 6. Computer Software Assurance (FDA CSA) approach

The CSA guidance asks for a **risk-based** choice of assurance activities, for using the vendor's or the development's own evidence where it exists, and for records that are sufficient rather than exhaustive. Applied here:

| Step | How it is done |
|---|---|
| Identify the intended use | §1 of this document and REQUIREMENTS-SPECIFICATION.md §1.1–1.2 |
| Determine the risk-based approach | Per feature: features that **write to the controlled record** (Monthly Time Writing saves, state and iteration changes, work-item creation) and that **handle credentials** are high process risk; reading, dashboards, documents and exports are not |
| Assurance activities for high process risk features | Scripted testing with expected results (TEST-PLAN.md §6 MON, ATM, BKL, CON-50…56, CON-68, NFR-04, NFR-05 cases), automated L1 tests of the write set, read-back confirmation of every write (NFR-04), and UAT by users on the Azure DevOps test project (TD-02) |
| Assurance activities for the other features | Automated L1 tests, the E2E suite and **unscripted / exploratory** testing during UAT (UAT-PLAN.md feedback record), with ad-hoc testing by the developer recorded in the pull request |
| Leverage of existing evidence | SOUP vendors' own release testing (React, Electron, Vite) is leveraged; the project adds the `pnpm audit` check and version pinning (SOFTWARE-COMPONENTS.md §2, §4); GitHub Actions and Pages are used as infrastructure with their vendor's assurance |
| Record | The CI log of the build, the TEST-PLAN.md §8 result record, the UAT sign-off and the Validation Package of the build, as listed in VERIFICATION-PLAN.md; the record states what was tested, by whom, with which result, and the build number |

## 7. Risk management file

The risk management file consists of DFMEA.md (design failure modes with severity, occurrence, detection, controls and residual ratings) and SECURITY-ASSESSMENT.md §3–4 (threats, likelihood, impact, mitigations, residual risk), both traced to the requirements and test cases through the mitigation and control columns, plus KNOWN-ISSUES.md for the accepted residual risks and their decisions. Risk acceptability: no high residual risk; medium residual risks need the product owner's written acceptance in KNOWN-ISSUES.md.

## 8. Configuration management

- **Source:** GitHub repository, `main` protected by the CI checks; changes by pull request only.
- **Identification:** semantic version `x.y.z` in `package.json` (checked by `scripts/verify-version.mjs`), CI build number and Git revision in `build-info.json`, in the app footer and in the Force Update dialog; `latest.json` carries the build number per platform.
- **Dependencies:** `pnpm-lock.yaml` pins every package; CI installs with `--frozen-lockfile`; updates come through the daily check as pull requests.
- **Releases:** `desktop-latest` (installers, SHA256SUMS, `latest.json`) and tagged releases `vX.Y.Z`; GitHub Pages for the web app.
- **Documents:** in `docs/`, versioned with the code, bundled into the build, shown on the Documentation page; the traceability matrix is generated and checked.

## 9. Problem resolution

Problems are recorded in KNOWN-ISSUES.md: **KB** known bugs (behaviour against a requirement in force), **OI** open issues (as-built behaviour needing a decision), **LIM** accepted limitations. Each entry has severity (TEST-PLAN.md §5 scale), status and the affected requirements; a fix is a pull request that references the entry and keeps the row with its closing pull request. Security findings from assessments (PT-NN) are entered as KB rows when they are bugs and as risks (R-NN) when they are hardening actions. UAT defects follow the UAT feedback record and are entered here when confirmed.

## 10. Training and competence

The developer and reviewers know this process, the CLAUDE.md working rules, TypeScript/React and the Azure DevOps REST API; UAT participants are the intended users with a short walkthrough (UAT-PLAN.md participants). Where an AI coding assistant is used, its output is reviewed by a human before merge like any other change, and it does not hold credentials or approve releases.

## 11. Gaps against the standards (as of this revision)

| Gap | Clause | Plan |
|---|---|---|
| The safety classification (§1) and the "software used in the QMS" status are the development team's assessment, not yet confirmed by QA | IEC 62304 §4.3; ISO 13485 §4.1.6 | QA review of §1; record the decision in this document |
| Reviews are recorded as GitHub pull-request approvals; a one-person team may merge its own work when CI is green | ISO 13485 §7.3.5 | Require one reviewer other than the author (branch protection) once a second maintainer is named (PROJECT-PLAN.md risk 1) |
| Installers are not code-signed; the updater verifies SHA-256 only | IEC 62304 §5.8.7 (delivery integrity) | Company certificate (R-06, LIM-05) |
| GitHub Actions pinned by tag, not SHA | IEC 62304 §8 (configuration items) | Pin and let Dependabot update (R-07) |
| Manual L3 system tests and UAT are recorded per release by hand (TEST-PLAN.md §8); no tool enforces the record | ISO 13485 §7.3.6, §7.3.7 | Keep the result record with each release tag; the E2E suite reduces the manual part |
| Behaviour against a real Azure DevOps Server is verified only through UAT | IEC 62304 §5.7 | Test server for CI if one becomes available (LIM-06) |
