# I&D Quality Demand Planning — Validation Package

| | |
|---|---|
| Document | VP-DPH-001 |
| Product | I&D Quality Demand Planning, v1.2.2 (build number and revision in the app footer and in `build-info.json`) |
| Purpose | The validation file of the software: the documents that show what it must do, how it was built, how it was verified and validated, what its risks are and how they are controlled |
| Standards | ISO 13485:2016 §4.1.6 and §7.3; IEC 62304 (life-cycle process, Class A assumed); FDA guidance on Computer Software Assurance (CSA) — see [DEVELOPMENT-PROCESS.md](DEVELOPMENT-PROCESS.md) §1 for the classification and its caveats |
| Status | For approval (§5) |

Every document of the package lives in `docs/`, is versioned with the code, is bundled into each build and is shown on the Documentation page of the running app, so the package always describes the build that shows it. The traceability matrix is generated from the other documents and checked by the test suite, so the chain from user need to test result cannot silently break.

## 1. Documents of the package

| # | Document | ID | Content | Standard clause |
|---|---|---|---|---|
| 1 | [REQUIREMENTS-SPECIFICATION.md](REQUIREMENTS-SPECIFICATION.md) | SRS-DPH-001 | Intended use and system boundary; stakeholders and use cases; **user requirements** (UR), **system requirements** (SR) and **detailed requirements** (verifiable "shall" rows with verification method, priority and trace); non-functional and interface requirements | ISO 13485 §7.3.3; IEC 62304 §5.2 |
| 2 | [TRACEABILITY-MATRIX.md](TRACEABILITY-MATRIX.md) | generated | End-to-end trace: use case → UR → SR → detailed requirement → test case → UAT day → automated test → software component, with a gap list (empty in a valid build) | ISO 13485 §7.3.10; IEC 62304 §5.1.1(c), §5.7.4 |
| 3 | [TEST-PLAN.md](TEST-PLAN.md) | TP-DPH-001 | Test levels, environments, test data, test cases with steps and expected results, coverage matrix, result record | ISO 13485 §7.3.6; IEC 62304 §5.5–5.7 |
| 4 | [VERIFICATION-PLAN.md](VERIFICATION-PLAN.md) | — | What CI runs on every change, the manual verification, and the evidence to keep per build | ISO 13485 §7.3.6 |
| 5 | [UAT-PLAN.md](UAT-PLAN.md) | — | Acceptance testing by the intended users: participants, the eleven-day sequence of UAT cases, entry and exit criteria, feedback record | ISO 13485 §7.3.7; CSA (unscripted and scripted testing) |
| 6 | [SOFTWARE-COMPONENTS.md](SOFTWARE-COMPONENTS.md) | SC-DPH-001 | Every software component: in-house items by layer, third-party components (SOUP) with version, licence and failure effect, platforms, and the known vulnerabilities of the components with their handling | IEC 62304 §5.3, §5.3.3, §8.1.2 |
| 7 | [KNOWN-ISSUES.md](KNOWN-ISSUES.md) | KI-DPH-001 | Known bugs (KB), open issues needing a decision (OI) and accepted limitations (LIM), with severity, status and affected requirements | ISO 13485 §8.3, §8.5.2; IEC 62304 §9 |
| 8 | [SECURITY-ASSESSMENT.md](SECURITY-ASSESSMENT.md) | SA-DPH-001 | Code analysis and penetration test of the build (findings and confirmed controls); product security risk assessment (threats, likelihood, impact, residual risk); mitigations traced to requirements and tests | ISO 14971 vocabulary; IEC 62304 §7 |
| 9 | [DFMEA.md](DFMEA.md) | DFMEA-DPH-001 | Design failure mode and effects analysis per function, with S/O/D ratings, design controls traced to requirements, residual ratings and open actions | ISO 13485 §7.3.3(c), §7.1; IEC 62304 §7 |
| 10 | [DEVELOPMENT-PROCESS.md](DEVELOPMENT-PROCESS.md) | SDP-DPH-001 | The development life cycle mapped to ISO 13485 §7.3, IEC 62304 and FDA CSA; the change procedure; verification strategy; configuration management; problem resolution; gaps | ISO 13485 §7.3.2; IEC 62304 §5.1 |
| 11 | [PROJECT-PLAN.md](PROJECT-PLAN.md) | — | Objective, phases, dependencies, project risks, operating ownership, backlog | ISO 13485 §7.3.2 |
| 12 | [azure-devops-connection.md](azure-devops-connection.md) | — | Set-up guide for the Azure DevOps connections | User documentation |
| 13 | [README.md](https://github.com/neurolooom-eng/Test2/blob/main/README.md) (repository root) | — | User-facing description of every feature, storage model and roles | User documentation |

## 2. How the package is kept valid

| Rule | Enforced by |
|---|---|
| Every change updates the requirements, test cases, coverage matrix, UAT plan, README and the affected package documents in the same pull request | CLAUDE.md working rules; pull-request review |
| Every requirement in force has at least one test case; every test case names existing requirements; every UAT day names live test cases; the requirement levels chain UR → SR → detailed without gaps | `tests/traceability.test.mjs` (part of `pnpm test`, run by CI on every pull request) |
| The traceability matrix equals the one generated from the documents of the build | `tests/traceability.test.mjs` (`node scripts/traceability.mjs --check`) |
| Each package document has its required sections; every requirement, test-case, mitigation, DFMEA and issue ID cited in the package exists | `tests/validation-package.test.mjs` |
| Every source file is listed as a software component | `tests/traceability.test.mjs` |
| The documents shown in the app are the ones of its build | `src/docs/index.ts` bundles `docs/*.md`; `tests/markdown.test.mjs` fails when a document is not bundled |
| The repeatable UAT scenarios pass against the built app | `pnpm test:e2e` (Playwright, Chromium) in CI |
| Third-party components have no known vulnerability | Daily scheduled `pnpm audit` and update; CI with a frozen lockfile |

## 3. Validation summary for this build

| Item | Result | Evidence |
|---|---|---|
| Requirements | 20 user, 24 system, 340 detailed in force (15 retired) | TRACEABILITY-MATRIX.md header |
| Trace gaps | 0 | TRACEABILITY-MATRIX.md §8 |
| Automated tests | `pnpm test`: all unit, storage, document and traceability tests pass; `pnpm test:e2e`: the UAT scenarios of SOFTWARE-COMPONENTS.md §1.10 pass | CI log of the build (VERIFICATION-PLAN.md) |
| Static checks | `tsc -b`, `oxlint`, version check: clean | CI log |
| Dependency audit | 0 advisories (370 packages) | SOFTWARE-COMPONENTS.md §4 |
| Security assessment | 16 findings: 4 fixed in this build (PT-01, PT-02, PT-07, PT-14), the rest low/informational with planned actions; no high residual risk | SECURITY-ASSESSMENT.md §2–3 |
| DFMEA | 30 failure modes; every S = 5 mode has a residual detection of 1; one residual RPN ≥ 15 with a planned mitigation | DFMEA.md §7 |
| Known bugs open | 4 low-severity (KB-03, KB-04, KB-06 and the CI pinning KB-08), none blocking | KNOWN-ISSUES.md §1 |
| Manual system tests (L3) and UAT (L4) | To be run on the released build per TEST-PLAN.md §8 and UAT-PLAN.md; the result record and the UAT sign-off complete this package | TEST-PLAN.md §8; UAT feedback record |

## 4. Intended use statement

The software supports Quality Engineering demand planning: reading work items from Azure DevOps and release documents from Windchill exports; recording planned and actual hours on Azure DevOps Tasks; showing capacity, utilization, releases and baselines; sharing planning data through a private Git repository. It is used by the I&D Quality team in a browser (GitHub Pages) or as a desktop application. It is not part of a medical device, does not make or record product decisions by itself, and leaves Azure DevOps, Windchill and the governed repository as the systems of record. Validation covers this use and the risk classification in DEVELOPMENT-PROCESS.md §1.

## 5. Approval

The package for a build is approved when the CI run of that build is green, the result record and the UAT sign-off are filed, and the people below have signed.

| Role | Name | Date | Signature |
|---|---|---|---|
| Product / process owner | | | |
| Application owner | | | |
| Quality assurance | | | |
| Information security (for SECURITY-ASSESSMENT.md) | | | |
