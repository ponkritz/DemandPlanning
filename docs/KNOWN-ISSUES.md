# I&D Quality Demand Planning — Known Issues Register

| | |
|---|---|
| Document | KI-DPH-001 |
| Part of | [VALIDATION-PACKAGE.md](VALIDATION-PACKAGE.md) |
| Status | Living register, updated in the same pull request as the change that opens or closes an entry |

This register lists every known bug, open issue and accepted limitation of the build that shows it. It is the issue log that the UAT entry criteria require and the problem-resolution record of the development process ([DEVELOPMENT-PROCESS.md](DEVELOPMENT-PROCESS.md) §9). An entry is closed by a pull request that fixes it (the row keeps its ID with the fixing pull request) or by a documented decision to accept it.

**Severity** follows TEST-PLAN.md §5: Critical (data loss or an unintended Azure DevOps write), High (a Must requirement fails), Medium (a Should requirement fails), Low (a Could requirement fails or cosmetic), Info (no requirement affected; a decision or a limitation).

## 1. Known bugs (KB)

A known bug is behaviour that contradicts a requirement in force, or a defect found by a security assessment or UAT. Every requirement in force has a passing test case in the CI run of this build ([TRACEABILITY-MATRIX.md](TRACEABILITY-MATRIX.md) §4); the open KB rows below are the low-severity findings of [SECURITY-ASSESSMENT.md](SECURITY-ASSESSMENT.md) §2.2 that are not yet fixed. Bugs found later are added here with the next free KB-NN before or with the fix.

| ID | Observation | Severity | Status | Affects |
|---|---|---|---|---|
| KB-01 | The CSV export of a Windchill view wrote the header row without formula neutralisation or quoting (SECURITY-ASSESSMENT.md PT-01). | Medium | Fixed in the Validation Package pull request: `windchillCsv` passes the header through `csvCell`; unit test added | CON-69 |
| KB-02 | The CI job that runs dependency code held a write token with persisted Git credentials (PT-02). | Medium | Fixed in the Validation Package pull request: read-only token, `persist-credentials: false`, separate publishing job | CI-07 |
| KB-03 | `htmlToText` on rich-text fields has quadratic worst-case time; a field of 1 MB freezes the tab for seconds (PT-05). | Low | Open — cap the input length or use a linear scan | QV-27 |
| KB-04 | The in-house `.xlsx` reader pads rows and columns to the numbers written in the file and inflates every zip entry; a crafted file can exhaust the uploader's tab (PT-06). | Low | Open — reject rows above 1 048 576 and columns above 16 384, cap total cells and inflated bytes | QEM-02 |
| KB-05 | A Windchill snapshot in Git with non-object rows made the view throw for everyone who loaded it (contained by the ErrorBoundary) (PT-07). | Low | Fixed in the Validation Package pull request: non-object rows dropped at parse time; unit test added | CON-70 |
| KB-06 | Work-item and Windchill URLs restored from backups or Git are not required to be https before being rendered as links; React and Chromium neutralise `javascript:` and `data:` today (PT-11). | Info | Open — require `https:` in `validAzureWorkItem` and the snapshot parsers | STO-07, CON-70 |
| KB-07 | PAT redaction in error messages used the PAT as entered rather than the trimmed PAT the request sends (PT-14). | Info | Fixed in the Validation Package pull request | NFR-05 |
| KB-08 | GitHub Actions are pinned to mutable tags, not commit SHAs (PT-03, risk R-07). | Low | Open — pin to full SHAs with Dependabot updates; scheduled with the daily dependency check | CI-01, CI-07 |
| KB-09 | The Insights workspace froze the tab on a large board: the person-month model re-scanned every item with the Time Writing title regex per month, ran a second capacity pass for the pack preview, and recomputed everything on every render because the settings object was rebuilt each time (WSP-01, WSP-02). | Medium | Fixed in the Insights workspace performance pull request: month Tasks bucketed once in `personMonths` (same results), the pack utilisation taken from the rows already computed, settings keyed by content on the workspace and the Monthly pack tab; unit test for the equivalence | WSP-01, WSP-02, PCK-04 |
| KB-10 | First-time setup of DP was off: the built-in DP default fetched the approved DHFI documents (DHP.Vault) instead of the DHP Release work items, so the DP page (filtered by DDT Date) stayed empty; there was no DHFI default, and Get started marked the release streams ready without Pedestal and DHFI (NAV-33, CON-76). | Medium | Fixed in the New Feature layout pull request: DP default reads the Release items, a DHFI [Approved] default, Get started counts Pedestal and DHFI. A DP connection already saved from the old default keeps its query until it is set up again or loaded from Git. | NAV-33, CON-76 |

## 2. Open issues (OI)

As-built behaviour that is ambiguous, inconsistent or may not match the intent. Each needs a decision from the product owner; none is changed silently (REQUIREMENTS-SPECIFICATION.md §8).

| ID | Observation | Severity | Status | Affects |
|---|---|---|---|---|
| OI-01 | "Extend until" writes no audit entry, and does nothing when the month has no period record yet. | Low | Open — product owner decision | SET-06 |
| OI-02 | The Settings actuals card for month M governs the Monthly page's actuals for month M−1. A toggle-created period sets the planning and actuals deadlines both to M-05, in UTC (`Z`). The Monthly page's defaults use local time. | Medium | Open — product owner decision | MON-07, SET-05 |
| OI-03 | On the Monthly page an explicit lock always locks, even while an extension is active (`rules.ts` treats an active extension as open). After the deadline, "Unlock" alone does not reopen entry; an extension is also needed. | Medium | Open — product owner decision | MON-06, MON-07 |
| OI-04 | Snapshots exclude capacity settings, baseline rules, release scopes, resource profiles, release source, release plans and read-only sources. | Low | Open — product owner decision | SNP-05 |
| OI-05 | Invalid capacity input is replaced by defaults silently, and the success message still shows. | Low | Open — product owner decision | SET-03 |
| OI-06 | Master data has no activate/deactivate control, no duplicate or blank-trim check, and no audit. | Low | Open — product owner decision | SET-10 |
| OI-07 | The task plan check flags overruns only. The older effort rule (`isVarianceFlagged`) flags \|variance\| > 25% in both directions. | Low | Open — product owner decision | BAS-11 |
| OI-08 | Stories in undated iterations (e.g. only a PI) are not moved to the current Sprint. Confirm whether they should be. | Low | Open — product owner decision | ATM-08 |
| OI-09 | "Reset synthetic MVP data" has no confirmation and no audit. In SharePoint mode the reset state is then saved to SharePoint. | Medium | Open — product owner decision | SET-12 |
| OI-10 | Writes to Azure DevOps are blocked in sample mode only on Assigned to Me. Monthly Time Writing saves and Feature creation are not blocked. | Medium | Open — product owner decision | ATM-13 |
| OI-11 | "Load latest" and "Update & load" from Git overwrite unsaved local baseline and resource edits without asking. | Medium | Open — product owner decision | GIT-04 |
| OI-12 | Exact baseline values per stream, and the Vault field/query for document counts, are not yet supplied. | Low | Open — product owner decision | BAS-08, QV-13 |
| OI-13 | Behaviour against a real Azure DevOps Server (on-prem) has been verified only with synthetic fixtures. | Medium | Open — product owner decision | DSK-04, DSK-05 |
| OI-14 | Backlog (DP, Release Details): *(the board match is back as QV-29)* matching DP releases to their QMS-0025 Time Writing Feature (NAV-23 DP rule, NAV-26 fuzzy match, QV-19…QV-21 Create Feature) and linking DHFI documents and the Pedestal register (NAV-25) were removed from the DP page, which shows only its query (QV-22). To be decided again when needed. DP is now counted from its query by its milestones (QV-24, QV-25). | Info | Open — product owner decision | NAV-23, NAV-25, NAV-26, QV-22 |

## 3. Accepted residual risks

Medium residual security risks of [SECURITY-ASSESSMENT.md](SECURITY-ASSESSMENT.md) §3 that the product owner accepts for this release, with the action that will close them. Acceptance is recorded by the signature in VALIDATION-PACKAGE.md §5.

| ID | Risk | Residual | Action | Affects |
|---|---|---|---|---|
| R-06 | Installers and the update manifest are integrity-checked (SHA-256) but not signed; a release compromise could ship code. | Medium | Code signing with the company certificate (LIM-05); until then the read-only CI token (CI-07) and the fixed-URL rule (DSK-07, DSK-08) are the controls. | DSK-07, DSK-08, DSK-09 |
| R-07 | GitHub Actions pinned by mutable tag (KB-08). | Medium | Pin to SHAs; Dependabot. | CI-01, CI-07 |
| R-08 | No Content-Security-Policy as defence in depth against a future injection. | Medium | Add a CSP meta tag and an Electron header policy after a browser check of MSAL and GitHub Pages. | DOC-03, QV-27, DSK-02 |

## 4. Accepted limitations

Behaviour that is by design and will not be changed in this release. Each is traced to the requirement or document that states it.

| ID | Limitation | Reason | Affects |
|---|---|---|---|
| LIM-01 | No server component: every user keeps their own PATs, Git token and local data in their browser or desktop profile; there is no central user directory. | NFR-01, UR-19: no infrastructure to host; credentials never leave the device. | NFR-01, CON-18, GIT-02 |
| LIM-02 | Writes go to Azure DevOps Services (dev.azure.com) only; on-premises servers are read-only in the web app and the desktop proxy. | Change control on the on-premises servers is outside this tool. | NAV-27, DSK-04 |
| LIM-03 | Direct Windchill access is not available (corporate sign-in, CORS and browser policy); Windchill data comes from CSV exports imported into the app. | Company sign-in rules. | CON-21, CON-22, CON-31, CON-71 |
| LIM-04 | Releases in a Windchill export are read from the Location column (folder path) first and from the document names as fallback. A folder shape outside the two known ones (name + version in one folder; version folder under the name folder), or a document name with no version, another spelling or a digit inside a word (about one name in ten, per the product owner), is not recognised automatically. The unique locations are saved to the Git data repository for analysis; a correction table (rename, merge, assign, not-a-release) stays planned if shapes remain outside the parser. | Naming in Windchill is free text; the folder shapes are to be confirmed against the real exports. | CON-71, CON-72 |
| LIM-05 | The desktop installer and update feed are still named Demand-Planning-Hub, and the installer is not code-signed. | Renaming the release feed would break the updater of installed versions; the signing certificate is outside this project (PROJECT-PLAN.md risks). | DSK-07, DSK-08, UI-06 |
| LIM-06 | Behaviour against a real Azure DevOps Server (on-premises) is verified with synthetic fixtures and by UAT, not by automated tests. | No test server is available to CI. | DSK-04, DSK-05, OI-13 |
| LIM-08 | The Monthly pack's narrative boxes (Observations, Focus areas, Decision required, …) are typed, not suggested: the app has no rule yet for what to propose, and a language model would send team data off the device. The .pptx download is a plain 16:9 layout to restyle in the corporate template, not the template itself. | PCK-06: the data for suggestions is partly outside the app; no approved LLM endpoint. | PCK-01, PCK-06 |
| LIM-09 | The Insights workspace has no free-text "Ask the data": the mock-up's questions are buttons that open the section holding the evidence. A natural-language answer needs a language model, and the app has no backend or approved endpoint, so team data would leave the device. Milestone closure rate and a single data-completeness score across every stream are not computed either: only DP and IOCC carry document milestones; completeness is the share of planned Tasks with recorded hours. | WSP-05, WSP-06: no approved LLM endpoint; milestone fields exist for DP and IOCC only. | WSP-02, WSP-06 |
| LIM-07 | The app has no role-based authorization on the server side: roles decide what the menu shows and what the app offers, and a user who edits the browser storage can bypass them; Azure DevOps and GitHub enforce the real permissions with the user's own token. | NFR-01: no server. | CON-42, CON-43 |
