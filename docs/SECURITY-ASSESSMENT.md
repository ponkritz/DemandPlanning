# I&D Quality Demand Planning — Security Assessment

| | |
|---|---|
| Document | SA-DPH-001 |
| Part of | [VALIDATION-PACKAGE.md](VALIDATION-PACKAGE.md) |
| Build assessed | `main` at 4e01d37 (27 October 2026), with the fixes of this pull request |
| Method | Static code analysis of `src/`, `electron/`, `scripts/`, the CI workflow; dynamic penetration tests against a local build in Chromium (Playwright) and Node, with every network request blocked or mocked; `pnpm audit` |
| Status | For review by the product owner and the information security officer |

This document holds (1) the **code analysis and penetration test** of the build, (2) the **product security risk assessment** — threats, their risk before and after mitigation — and (3) the **mitigation list**, each mitigation traced to the requirement that implements it and to the test case that verifies it. It is the security part of the risk management file of [DEVELOPMENT-PROCESS.md](DEVELOPMENT-PROCESS.md) §7. The numbers in it (CVSS-style scores, likelihoods) are the assessor's estimates and should be confirmed by the information security officer; nothing here is an external audit.

## 1. Scope and assets

**System.** The single-page web app (GitHub Pages) and the Electron desktop shell, as described in [REQUIREMENTS-SPECIFICATION.md](REQUIREMENTS-SPECIFICATION.md) §1.2. There is no server component: the app talks directly, with the user's own credentials, to Azure DevOps (Services and on-premises Server), the GitHub contents API (private data repository), Microsoft Graph (optional SharePoint) and the `desktop-latest` GitHub release (installers and `latest.json`).

**Assets to protect.**

| Asset | Where it lives | Harm if compromised |
|---|---|---|
| A1 Azure DevOps PATs (one per server) | Browser localStorage `demand-planning-azure-connection-profiles-v1` / desktop profile | Read and write access to work items as the user |
| A2 GitHub fine-grained token | localStorage `demand-planning-git-token-v1` | Read/write of the private data repository (planning data, setup, exports) |
| A3 Microsoft Entra session (MSAL, sessionStorage) | Browser | Access to the SharePoint site |
| A4 Planning data, time bookings, release data, QE mapping | IndexedDB; the data repository; SharePoint | Integrity of time writing and planning decisions; confidentiality of names and effort |
| A5 Work items in Azure DevOps Services | dev.azure.com | Unintended writes (the Critical severity of TEST-PLAN.md §5) |
| A6 The published app and installers | GitHub Pages; `desktop-latest` release | Code execution on every user's machine (supply chain) |
| A7 The source repository and CI | GitHub | Everything above |

**Trust boundaries.** (B1) browser ↔ external services over https; (B2) renderer ↔ Electron main process over IPC; (B3) desktop main process ↔ Azure DevOps Server / Windchill; (B4) data repository ↔ every user who loads it (a repository writer can plant data for everyone); (B5) CI ↔ published artefacts.

## 2. Code analysis and penetration test

### 2.1 What was tested

- **Static analysis** of every file in `src/`, `electron/`, `scripts/`, `.github/workflows/build-and-deploy.yml`, `vite.config.ts` and `index.html` for: HTML injection sinks, URL and host validation, credential leakage (logs, errors, URLs, Git files, backups, snapshots), Electron hardening (context isolation, sandbox, navigation and window-open handlers, IPC sender checks, the proxy's host and method allow-list), updater integrity, Content-Security-Policy, GitHub Actions permissions and pinning, prototype pollution in JSON imports, regular expressions on untrusted input, MSAL configuration.
- **Dynamic tests** against `vite preview` of the production build, in Chromium with all non-localhost requests blocked and GitHub mocked where needed: malicious CSV and Windchill imports (formulas, HTML, `__proto__` columns), backup restore with crafted JSON (`__proto__`, `constructor.prototype`, `javascript:` and `data:` URLs), QE Mapping imports from CSV and Git, Markdown link schemes on the Documentation page, connection forms with `http://`, credentials in the URL, `javascript:` and `file:` URLs, exported CSVs, exported backups, Git sync of connections to another host (CON-68). In Node: the desktop proxy (writes to on-premises hosts, SSRF, redirects, PAT redaction), the Windchill desktop client (off-host next pages, path traversal), the desktop updater (tampered installer, tampered manifest, foreign URLs), the xlsx reader and `htmlToText` with pathological inputs.
- **Dependencies:** `pnpm audit --json` on the lockfile of the build.

### 2.2 Findings

Severity follows CVSS 3.1 qualitative bands as estimated by the assessor. **Status** is as of this pull request; KB numbers refer to [KNOWN-ISSUES.md](KNOWN-ISSUES.md).

| ID | Finding | Severity | Evidence (file:line, verification) | Disposition |
|---|---|---|---|---|
| PT-01 | The CSV export of a Windchill view wrote the **header row** without formula neutralisation and without quoting, so a crafted column name (from an import, or planted in `windchill-data/*.json` in the data repository) opened as a formula in a spreadsheet; body cells were safe. | Medium (~4.6: needs a crafted file and a victim opening the CSV) | `src/components/WindchillViews.tsx:93` built the header with `columns.join(',')`. Confirmed dynamically: imported header `=HYPERLINK(...)` was exported raw; a Git snapshot with column `=cmd\|' /C calc'!A0` reached every user. | **Fixed** (KB-01): header and cells both go through `csvCell` in `windchillCsv`; unit test in `windchill-views.test.mjs`; CON-69 now names the header row. |
| PT-02 | The CI job that runs dependency code (install, lint, tests, build, electron-builder) held a `contents: write` token, and `actions/checkout` persisted it in `.git/config`; code running in any of those steps could have replaced the installers and `latest.json` on `desktop-latest`, which the updater installs after a hash check (PT-04). | Medium (needs a compromised dependency or action; impact is code execution on desktop clients) | `.github/workflows/build-and-deploy.yml`: job-level `permissions: contents: write`; `persist-credentials` default. Static. | **Fixed** (KB-02): the validate job is `contents: read`, every checkout has `persist-credentials: false`, and the tagged release is published by a separate job that only downloads the built artefact (CI-07). |
| PT-03 | GitHub Actions are pinned to mutable tags (`@v4`, `@v5`, `@v3`), including the third-party `pnpm/action-setup`, not to commit SHAs. | Low | 18 `uses:` lines in the workflow. Static. | **Open** (R-07): pin to full SHAs with a version comment and let Dependabot update them. Not done in this pull request because the SHAs cannot be verified offline; scheduled with the daily dependency check. |
| PT-04 | The desktop updater verifies **integrity** (SHA-256 from `latest.json` in the same release) but not **authenticity**: the installers are not code-signed and the manifest is not signed, so whoever can write the release can ship code. | Low (needs release or repository compromise) | `electron/desktop-update.cjs`; `electron/main.cjs:40` starts the verified file. Dynamic: a tampered installer was rejected ("failed its checksum") and deleted; a manifest naming `../../evil.exe` or a wrong sha was rejected; only the two fixed `desktop-latest` URLs were fetched. | **Open** (R-06, LIM-05): code signing (Authenticode / Developer ID) needs the company certificate (PROJECT-PLAN.md dependencies); until then PT-02's fix and the fixed-URL + SHA-256 rule are the controls. |
| PT-05 | `htmlToText` (rich-text fields such as Acceptance Criteria) uses regular expressions with quadratic worst-case time; very large field values freeze the tab. | Low (client-side availability; needs edit rights on a work item; whether Azure allows such sizes is unconfirmed) | `src/queryView.ts:109`. Dynamic: `<script>` × 20 000 took 394 ms; 1 MB took 16 s. | **Open** (KB-03): cap the input length or use a linear scan. |
| PT-06 | The in-house `.xlsx` reader pads rows and columns up to the row/column numbers written in the file and inflates every zip entry up to 100 MB each, so a crafted file can exhaust memory or time in the uploader's own tab. | Low (local, user-initiated, affects only the uploader) | `src/xlsx.ts:125–141`. Dynamic: a 657-byte file with `<row r="30000000">` produced 30 M rows (1.4 GB heap). | **Open** (KB-04): reject rows above 1 048 576 and columns above 16 384, cap total cells and total inflated bytes. |
| PT-07 | A Windchill snapshot in the data repository whose `rows` held non-objects (`null`, numbers) made the view throw for every user who loaded it; the ErrorBoundary contained it (no blank app). | Low (needs repository write) | `src/windchillSnapshots.ts:20` checked only `Array.isArray`. Dynamic: "This view could not be drawn…". | **Fixed** (KB-05): rows that are not plain objects are dropped at parse time; unit test. |
| PT-08 | No Content-Security-Policy in the web app or in Electron. | Low (defence in depth; no injection was found to amplify) | `index.html`, `electron/main.cjs`. Static. | **Open** (R-08): add a `<meta http-equiv="Content-Security-Policy">` with `default-src 'self'` and the four API origins, and an `onHeadersReceived` policy in Electron. Needs a browser check of MSAL and GitHub Pages before enabling. |
| PT-09 | Electron sets no permission handlers (camera, notifications, … are granted by default), and the Windchill sign-in window may navigate to any https host without an address bar. | Low | `electron/main.cjs:89–99`. Static. | **Open** (R-09): deny all permission requests on both sessions; limit the sign-in window to the Windchill host and the identity provider and show the host in the title. |
| PT-10 | The desktop Azure proxy sends the PAT, as Basic auth, in read requests to any https host the renderer names (SSRF surface, reachable only from a compromised renderer; writes are refused everywhere but dev.azure.com). | Low | `electron/azure-devops.cjs:3–12`. Dynamic: `https://169.254.169.254/latest` received a GET with the PAT; paths fixed, redirects refused, JSON only; http, credentials in URL, `javascript:`, `file:`, unknown operations and non-SELECT WIQL refused. | **Open** (R-10): accept only hosts saved by the user in Settings (the one-PAT-per-server list) and block private and link-local addresses. |
| PT-11 | Work-item and Windchill URLs restored from backups or Git are not checked to be https before being rendered as links. | Info | `src/browserState.ts:4`; `WindchillViews.tsx:33`. Dynamic: React 19 neutralised `javascript:` hrefs; Chromium blocked `data:` navigation. | **Open** (KB-06): require `https:` in `validAzureWorkItem` and the snapshot parsers. |
| PT-12 | Company server names and the SharePoint site path are in the client bundle (`connectionPresets.ts`, `sharepoint.ts`). | Info (depends on whether the Pages site is public — unconfirmed) | Static. | **Accepted for now** (R-11): move to the Git-shared setup if the site is public. |
| PT-13 | The Microsoft Graph scope `Sites.ReadWrite.All` is broader than the one site the app uses. | Info | `src/sharepoint.ts:29`. Static. | **Open** (R-12): `Sites.Selected` or a site-scoped permission; needs the Entra administrator. |
| PT-14 | PAT redaction in error messages replaced the PAT as entered, while the request used the trimmed PAT; a PAT entered with spaces could survive redaction. | Info | `electron/azure-devops.cjs:150,155`; `src/azureDevOps.ts:670,675`. Dynamic. | **Fixed** (KB-07): the trimmed PAT is redacted (NFR-05). |
| PT-15 | The Windchill tab is opened with an opener, so that page can navigate the app tab; intentional for the bookmarklet bridge, which checks origin, source and nonce. | Info | `src/useWindchill.ts:101`. | Accepted (documented behaviour, CON-32). |
| PT-16 | Roles in `access.json` are enforced in the client only; the real limits are the user's own tokens. | Info | `src/azureDevOps.ts:630`. | Accepted and documented (LIM-07, CON-42). |

### 2.3 Controls confirmed working

Each line is a test that passed; together they are the evidence that the security requirements hold in this build.

| Control | Requirements | What was shown |
|---|---|---|
| No HTML or script injection | QV-27, DOC-03, DOC-05 | Payloads (`<img onerror>`, `<svg onload>`, inline `<script>`) in Windchill imports (header, cells, view name shown in the menu), restored backups (people, activities, work-item titles), Git-synced connection names and planning profiles, QE Mapping from Git and CSV were all rendered as text; `window.__pwned` stayed unset. Markdown links: only `#` anchors or https; `javascript:`, `data:`, `vbscript:`, `http:`, `//host` and a tab-split `java\tscript:` rejected by `linkTarget`. |
| No prototype pollution | STO-07, GIT-05, CON-70 | `__proto__`, `constructor.prototype` (nested too) in backups, `planning-data.json`, Windchill columns (`Object.fromEntries` makes them own properties) and a QE Mapping column id left `({}).polluted` undefined. |
| CSV formula neutralisation (cells) | CON-69 | `=`, `@`, `+cmd`, `-2+3+cmd`, tab and CR prefixed with `'`; `-3`, `+1`, `+1.5` unchanged — Windchill body, QE Mapping CSV (Git and upload, headers included), `csvCell` probes. Header gap: PT-01, fixed. |
| PAT never follows a connection to another server | CON-68, NAV-28 | Git moved a connection from `dev.azure.com/org1` to `https://evil.example/tfs/Coll`: restored with an empty token, no server PAT created for the new host; a Git-added `dev.azure.com/attackerorg` connection got no PAT. |
| Server URL validation | CON-08 | Settings → Add server refused `http://`, `https://user:secret@…`, `javascript:`, `file:///`, `?x=1`; stored nothing; echoed no credentials. |
| Writes to dev.azure.com only | NAV-27, DSK-04, IF-02 | Desktop proxy refused update, create and effort writes to an on-premises host, to `dev.azure.com.evil.example` and to `dev.azure.com.` (trailing dot); normalised `DEV.AZURE.COM`; `..` in org/project stays on dev.azure.com; `@` in the org percent-encoded; a 302 is refused; PATs redacted in 400 messages. |
| Windchill desktop requests stay on the configured host | CON-28, DSK-06 | `windchillUrl` refused http, credentials, `/Windchill/../..`, `//evil.example/Windchill/`; an off-host next page stopped with "next page outside the service". |
| Electron hardening | DSK-02, DSK-03 | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; `setWindowOpenHandler` denies (https opens externally); `will-navigate` / `will-redirect` limited to the bundled `file://` page; every IPC handler checks the sender is the main frame of the bundled app; the preload exposes only fixed, narrow functions. |
| Updater integrity | DSK-07, DSK-08, DSK-09 | A tampered installer: "failed its checksum", file deleted. A manifest with `../../evil.exe` or a bad sha: rejected. Only the two fixed `desktop-latest` URLs fetched. |
| No tokens in exports, the repository or foreign hosts | STO-09, NFR-07, GIT-02 | The exported JSON backup contains no `pat` or `token`; GitHub requests carry the token only in `Authorization`; `git grep` and `git log -S` found no `ghp_` / `github_pat_`; in the Git tests the only host contacted was the mocked api.github.com. |
| Workflow script injection | CI-01…05 | `run:` steps use environment variables (`$env:GITHUB_REF_NAME`), not `${{ }}` interpolation; top-level `permissions: contents: read`; Pages deploy has `pages: write` and `id-token: write` only. |
| Dependencies | SR-23 | `pnpm audit --json`: 0 advisories at every severity over 370 packages (lockfile of this build). CI installs with `--frozen-lockfile`. |

## 3. Product security risk assessment

**Method.** Threats were listed per trust boundary with STRIDE, then scored on **likelihood** (1 rare … 5 expected, given the attacker position needed) and **impact** (1 cosmetic … 5 unintended writes to Azure DevOps, credential theft or code execution on users' machines — the Critical of TEST-PLAN.md §5). Risk = likelihood × impact; ≥ 15 is **high** (must be mitigated before release), 8–14 **medium** (mitigate or accept with the product owner's signature), ≤ 7 **low** (accept, monitor). The residual column is the risk after the mitigations of §4 that are in place in this build.

| ID | Threat (STRIDE) | Boundary / asset | Likelihood | Impact | Risk | Mitigations in place | Residual | Open actions |
|---|---|---|---|---|---|---|---|---|
| R-01 | Credential theft: a PAT or Git token leaves the device — in a backup, a snapshot, a Git file, a URL, an error message or a log (Information disclosure) | B1, B4 / A1, A2 | 2 | 5 | 10 | SM-01, SM-02, SM-03, SM-04 | 1 × 5 = 5 | — |
| R-02 | A PAT is sent to a server it was not issued for, after the shared setup in Git is edited or a connection is cloned (Spoofing, Information disclosure) | B4 / A1 | 2 | 5 | 10 | SM-05 | 1 × 5 = 5 | — |
| R-03 | An unintended or unconfirmed write to Azure DevOps, or a write to an on-premises server (Tampering) | B1, B3 / A5 | 2 | 5 | 10 | SM-06, SM-07, SM-08 | 1 × 5 = 5 | — |
| R-04 | Script injection through data the app renders: work-item fields, imports, Git files, documents (Tampering → credential theft) | B1, B4 / A1–A4 | 3 | 5 | 15 | SM-09, SM-10, SM-11 | 1 × 5 = 5 | R-08 (CSP) as defence in depth |
| R-05 | CSV formula injection: an exported CSV runs a formula in the user's spreadsheet (Tampering) | B4 / A4 | 3 | 3 | 9 | SM-12 | 1 × 3 = 3 | — (PT-01 fixed) |
| R-06 | Supply chain: a tampered installer, manifest or web build is served to users (Tampering, Elevation) | B5 / A6 | 2 | 5 | 10 | SM-13, SM-14, SM-15, SM-16 | 2 × 5 = 10 (medium) | Code signing (PT-04), SHA pinning (PT-03 → R-07) |
| R-07 | A GitHub Action or dependency is replaced behind its mutable tag or version range (Tampering) | B5 / A7 | 2 | 4 | 8 | SM-16, SM-17 | 2 × 4 = 8 (medium) | Pin actions to SHAs; Dependabot |
| R-08 | Absence of a Content-Security-Policy lets any future injection run (Tampering) | B1 / A1–A4 | 2 | 4 | 8 | SM-09 (no sinks) | 2 × 4 = 8 (medium) | Add CSP (PT-08) |
| R-09 | Electron grants browser permissions by default; a sign-in window without an address bar can be used for phishing (Spoofing) | B2 / A1, A3 | 1 | 4 | 4 | SM-18 | 1 × 4 = 4 | Permission handlers, host allow-list (PT-09) |
| R-10 | A compromised renderer uses the desktop proxy to reach internal hosts with the PAT (Information disclosure, SSRF) | B2, B3 / A1 | 1 | 4 | 4 | SM-07, SM-18 | 1 × 4 = 4 | Host allow-list in the main process (PT-10) |
| R-11 | Company host names in the public bundle (Information disclosure) | B1 | 2 | 2 | 4 | — | 4 | Move presets to the Git-shared setup if the site is public (PT-12) |
| R-12 | Over-broad Graph scope `Sites.ReadWrite.All` (Elevation) | B1 / A3 | 1 | 3 | 3 | SM-19 | 3 | Site-scoped permission (PT-13) |
| R-13 | A repository writer plants data that crashes or misleads every user (Tampering, Denial of service) | B4 / A4 | 2 | 3 | 6 | SM-10, SM-20 | 1 × 3 = 3 | PT-11 https check |
| R-14 | Resource exhaustion by a crafted import or a huge field (Denial of service, the user's own tab) | B1 | 2 | 2 | 4 | SM-20 (ErrorBoundary, size limits) | 4 | PT-05, PT-06 caps |
| R-15 | Local data loss or corruption that hides a failed save (Repudiation of effort data) | — / A4 | 2 | 4 | 8 | SM-21 | 1 × 4 = 4 | — |
| R-16 | Roles are enforced in the client only; a user bypasses the menu (Elevation) | — / A4, A5 | 3 | 2 | 6 | SM-22 | 6 | Accepted (LIM-07): the user's own token is the real limit |
| R-17 | A known vulnerability in a dependency is shipped (Tampering) | B5 / A6 | 2 | 4 | 8 | SM-17 | 1 × 4 = 4 | — |

No high residual risk remains. R-06, R-07 and R-08 are medium residual risks that the product owner accepts for this release with the open actions scheduled (they need a code-signing certificate, verified action SHAs and a browser check of the CSP, none of which this pull request can supply); they stay in [KNOWN-ISSUES.md](KNOWN-ISSUES.md) until closed.

## 4. Mitigations and their trace to the requirements

Each mitigation is implemented by the named requirements and verified by the named test cases ([TEST-PLAN.md](TEST-PLAN.md) §6; the matrix in [TRACEABILITY-MATRIX.md](TRACEABILITY-MATRIX.md) §4 shows their automated tests and UAT days). The mitigation IDs are used in §3 and in [DFMEA.md](DFMEA.md).

| ID | Mitigation | Requirements | Verified by |
|---|---|---|---|
| SM-01 | PATs and the Git token live only in browser / desktop local storage, one PAT per server; they are never part of the app state, a backup, a snapshot or a Git file. | CON-18, NAV-28, GIT-02, STO-09, SNP-05 | TC-INS-01, TC-STO-04, TC-NAV-24, E2E `documents-and-data.e2e.mjs` |
| SM-02 | PAT fields are password fields; error text from Azure DevOps has the (trimmed) PAT redacted before it is shown. | NFR-05 | TC-INS-01 |
| SM-03 | The Git token is sent only in the `Authorization` header to the configured GitHub API; GitHub errors are mapped to fixed messages. | GIT-02, GIT-11, IF-03 | TC-GIT-01, TC-INS-04 |
| SM-04 | The source repository holds no production data, tokens or employee details; CI builds from a frozen lockfile. | NFR-07, CI-01 | TC-INS-01, TC-CI-01 |
| SM-05 | A PAT never follows a connection to another server: restoring or syncing connections from Git re-binds the PAT by server; a connection moved to another host gets no token. | CON-68, CON-24, NAV-29 | TC-CON-36, TC-CON-22 |
| SM-06 | Writes go to Azure DevOps Services only; on-premises servers are read-only in the web app and in the desktop proxy; the write set is limited to the listed fields and types. | NAV-27, DSK-04, IF-02, FET-17 | TC-NAV-27, TC-DSK-02, TC-FET-01 |
| SM-07 | The desktop proxy validates every request: https only, no credentials in the URL, fixed API paths, allow-listed operations, no redirects, JSON only, PAT redacted. | DSK-04, DSK-05, DSK-06, CON-08 | TC-DSK-02, TC-CON-02 |
| SM-08 | Every write is confirmed by reading the item back; a write that cannot be confirmed is reported and never retried automatically; writes are blocked in sample mode and without an assignee email. | NFR-04, BKL-11, ATM-13, CON-50 | TC-BKL-02, TC-ATM-06, TC-CON-33 |
| SM-09 | No HTML injection sink: rich-text fields are converted to text, Markdown is rendered to React elements, no `dangerouslySetInnerHTML`; only https links are clickable. | QV-27, DOC-03, DOC-05, CON-70 | TC-QV-13, TC-DOC-01, TC-CON-38 |
| SM-10 | Every file the app reads (backup, Git data, Windchill snapshot, QE Mapping, Excel/CSV) is validated against its schema; prototype keys cannot pollute; non-object rows are dropped; size limits apply. | STO-07, GIT-05, CON-70, QEM-02, SNP-07 | TC-STO-03, TC-GIT-03, TC-CON-38, TC-QEM-02 |
| SM-11 | Server URLs are https only, without credentials; `?`, `javascript:` and `file:` are refused. | CON-08, CON-21 | TC-CON-02, TC-CON-11 |
| SM-12 | Every CSV export neutralises formula-like cells and the header row, and quotes cells with separators. | CON-69, QV-09 | TC-CON-37, TC-QV-04, E2E `documents-and-data.e2e.mjs` |
| SM-13 | The desktop updater downloads only the installer named for this OS from the fixed `desktop-latest` release and verifies its SHA-256 before starting it; a mismatch deletes the file. | DSK-07, DSK-08, DSK-09 | TC-DSK-03, TC-INS-02 |
| SM-14 | The web app reloads only to the build the deployment manifest names, with no-store, no credentials, no redirects. | UPD-04, UPD-05 | TC-UPD-01, TC-UPD-02 |
| SM-15 | Installers are published with SHA256SUMS files and `latest.json`; the build number and revision are in the app. | CI-03, UPD-01, NAV-15 | TC-CI-01, TC-DSK-01 |
| SM-16 | CI jobs that run dependency code hold a read-only token and do not persist Git credentials; only publishing jobs that download built artefacts may write to releases; workflow steps take their inputs from environment variables, not `${{ }}` interpolation. | CI-07 | TC-CI-03 |
| SM-17 | A daily scheduled check runs `pnpm audit`, updates dependencies within their ranges and opens a pull request; CI fails on lint, type or test errors. | CI-01, CI-04, SR-23 | TC-CI-01, TC-INS-04 |
| SM-18 | The desktop window runs with context isolation, sandbox and no Node integration; navigation and window opening are restricted; IPC accepts only the bundled main frame. | DSK-02, DSK-03 | TC-DSK-02 |
| SM-19 | SharePoint uses delegated Microsoft Graph v1.0 with MSAL (sessionStorage), etag-checked writes and a size limit; SharePoint is optional. | IF-04, SNP-01, SNP-03, SNP-07 | TC-SNP-01, TC-INS-04 |
| SM-20 | A rendering error is contained by the ErrorBoundary with a way back; imports and snapshots have size limits (200 MB backups, 100 MB inflate, 1000 rows shown). | CON-70, STO-07, QV-10 | TC-CON-38, TC-STO-03, TC-QV-05 |
| SM-21 | Saves are automatic and failures are shown with an immediate backup offer; restore is validated and confirmed; unsaved work blocks a reload. | STO-01, STO-03, STO-04, STO-08, UPD-03 | TC-STO-01, TC-STO-02, TC-STO-04, TC-UPD-02 |
| SM-22 | Roles decide what the app shows and offers; the policy is kept in Git and applied per email; the user's own tokens remain the real limit (documented). | CON-41, CON-42, CON-43, CON-51 | TC-ACC-01, TC-ACC-02, TC-CON-24 |

## 5. Re-assessment

This assessment is repeated (§2.2 re-run, §3 re-scored) when: a trust boundary changes (a new external service, a server component, direct Windchill access); a new import or export format is added; Electron or MSAL has a major update; a security finding is reported; and at least once a year. The daily dependency check (SM-17) covers the dependency part continuously. Results are recorded in [KNOWN-ISSUES.md](KNOWN-ISSUES.md) and in a new revision of this document.
