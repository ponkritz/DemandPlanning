# I&D Quality Demand Planning — Design FMEA

| | |
|---|---|
| Document | DFMEA-DPH-001 |
| Part of | [VALIDATION-PACKAGE.md](VALIDATION-PACKAGE.md) |
| Build | `main` at 4e01d37 with the changes of this pull request |
| Status | For review by the product owner; ratings are the development team's estimates |

This design failure mode and effects analysis lists, per function of the system, how the design can fail, what the user would suffer, what causes it, which design controls prevent or detect it (traced to the requirements that implement them and to the mitigations of [SECURITY-ASSESSMENT.md](SECURITY-ASSESSMENT.md) §4 where the failure is a security one), and what remains to do. It is the design part of the risk management file of [DEVELOPMENT-PROCESS.md](DEVELOPMENT-PROCESS.md) §7; the security threats are assessed in SECURITY-ASSESSMENT.md §3 and are referred to here, not repeated.

**Ratings** (1–5 each; RPN = S × O × D, range 1–125):

- **Severity S**: 5 an unintended write to Azure DevOps, credential theft or code execution; 4 loss or silent corruption of planning or effort data; 3 wrong figures that drive a decision (capacity, baseline, release count); 2 a function unavailable with a clear message; 1 cosmetic.
- **Occurrence O**: 5 expected in normal use without the control; 3 plausible with ordinary mistakes or bad data; 1 needs an unusual sequence or a deliberate attack.
- **Detection D** (of the design control, 1 = the failure is prevented or caught automatically before any effect, 5 = only the user would notice later).

An RPN ≥ 40, or S = 5 with D ≥ 3, needs an action. The **Residual RPN** is the rating with the listed controls in place. **Verified by** names the test cases of [TEST-PLAN.md](TEST-PLAN.md) §6 that show the controls work.

## 1. Credentials and connections

| ID | Function | Failure mode | Effect | Cause | S | O | D | RPN | Design controls (requirements) | Residual RPN | Verified by | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DF-01 | Keep PATs and tokens | A credential is written into app data, a backup, a snapshot or a Git file | Credential theft (SM-01) | Serialising the connection object with its token | 5 | 3 | 4 | 60 | Credentials in their own localStorage keys, never in AppState; backup and Git serialisers whitelist fields (CON-18, STO-09, GIT-02, SNP-05, NAV-28) | 5×1×1 = 5 | TC-INS-01, TC-STO-04, TC-NAV-24 | — |
| DF-02 | Share the connection setup through Git | A PAT is sent to a server the Git file now names | PAT disclosure to a foreign host (SM-05) | Setup edited in Git; clone keeps the token | 5 | 2 | 4 | 40 | PAT bound to the server, not to the connection; a moved connection gets no token (CON-68, CON-24, NAV-29) | 5×1×1 = 5 | TC-CON-36, TC-CON-22 | — |
| DF-03 | Show errors from Azure DevOps | The PAT appears in an error message or log | Credential disclosure on screen or in a screenshot | Server echoes the Authorization header | 5 | 2 | 3 | 30 | Trimmed PAT redacted from error text; password fields (NFR-05) | 5×1×1 = 5 | TC-INS-01 | PT-14 fixed in this pull request |
| DF-04 | Validate a server URL | A non-https or credential-bearing URL is saved | PAT sent in clear or to the wrong host | Pasted page address | 5 | 3 | 2 | 30 | https only, no credentials, normalised collection (CON-08, CON-21) | 5×1×1 = 5 | TC-CON-02, TC-CON-11 | — |
| DF-05 | Identify the viewer | The wrong email is used as "me" | Work assigned to or counted for the wrong person | Typo in the connection email; a cloned connection | 3 | 3 | 3 | 27 | Work email required on the Time Writing connection, shown on Assigned to Me and Settings → Access (CON-60, CON-41, ATM-01) | 3×2×2 = 12 | TC-CON-28, TC-ACC-01 | — |

## 2. Reading and writing Azure DevOps

| ID | Function | Failure mode | Effect | Cause | S | O | D | RPN | Design controls (requirements) | Residual RPN | Verified by | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DF-06 | Write effort, states, iterations, new items | A write goes to an on-premises server, or to an item the user did not mean | Unintended change in a controlled system (Critical) | Proxy or client accepts any host; wrong item id | 5 | 2 | 3 | 30 | Writes to dev.azure.com only, fixed write set, confirmation dialogs, read-back after every write (NAV-27, DSK-04, IF-02, NFR-04, ATM-09) | 5×1×1 = 5 | TC-NAV-27, TC-DSK-02, TC-ATM-04 | — |
| DF-07 | Save Monthly Time Writing | A partly saved batch leaves some Tasks changed and others not | Inconsistent effort data; the user believes all is saved | Network error mid-batch; invalid value in one row | 4 | 3 | 3 | 36 | Whole-batch validation before any write; empty or out-of-range values reject the save; refresh after save (MON-11…MON-16) | 4×2×1 = 8 | TC-MON-04, TC-MON-05 | — |
| DF-08 | Lock planning and actuals | Entry is possible after the deadline, or impossible before it | Late changes to governed figures; or users blocked | Period record missing; extension logic; time zone | 3 | 3 | 3 | 27 | Lock rules from the period record with explicit lock, deadline and extension (MON-06…MON-10, SET-05, SET-06) | 3×2×2 = 12 | TC-MON-02, TC-MON-03, TC-SET-02 | OI-02, OI-03 remain open decisions |
| DF-09 | Fetch work items | A failed or empty fetch replaces the saved data | Loss of the working data set | Server down; query returns nothing | 4 | 3 | 2 | 24 | Empty results keep the saved items; failures keep the previous data and say so; batch failure aborts the fetch (FET-03…FET-05, FET-15) | 4×1×1 = 4 | TC-FET-03, TC-FET-04 | — |
| DF-10 | Detect Month Tasks | A Task is counted for the wrong month or not at all | Wrong utilization and gaps | Free-text titles | 3 | 4 | 3 | 36 | Naming rules: leading or trailing month, numeric form, no month in the middle, no prefix words (TWN-01…TWN-06); the not-picked-up panel shows what was left out (MON-18) | 3×2×2 = 12 | TC-TWN-01, TC-TWN-02, TC-MON-07 | — |
| DF-11 | Create a Feature hierarchy | A half-created hierarchy (Feature without stories or task) | Backlog inconsistency; manual repair | Failure after the first write | 3 | 3 | 2 | 18 | Read-back of every created item with a completion report; "Complete Feature children" adds the missing ones (BKL-10, BKL-11) | 3×2×1 = 6 | TC-BKL-02, TC-BKL-03 | — |
| DF-12 | Assign new work | Work is created unassigned or assigned to the wrong person | Unassigned work; wrong ownership | Missing assignee | 3 | 3 | 2 | 18 | Assignee email required, confirmed before creation, person picker with rights (CON-50, CON-51, CON-56) | 3×1×1 = 3 | TC-CON-33, TC-CON-34, TC-QV-16 | — |

## 3. Capacity, baselines and releases

| ID | Function | Failure mode | Effect | Cause | S | O | D | RPN | Design controls (requirements) | Residual RPN | Verified by | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DF-13 | Compute available hours | Absence, holidays, shared time or NPRA deducted twice or not at all | Wrong capacity and overload status | Mapping of Epics/Features; booked vs. reserved | 3 | 3 | 3 | 27 | One capacity model (`capacity.ts`) used everywhere: absence Epic, mapped holidays and common activities, NPRA booked only with a 20 h maximum flagged (CAP-03…CAP-13, OV-14) | 3×2×1 = 6 | TC-CAP-01, TC-CAP-02, TC-CAP-03 | — |
| DF-14 | Count releases per month | A release is counted twice (two documents, two spellings) or in the wrong month | Wrong Pulse Check and Dashboard figures | Name variants; DDT date vs. approval date | 3 | 4 | 3 | 36 | Unique release key (name + version, case and trailing zeros ignored), DDT month rule, Supported Releases table shows the counted rows (QV-24, QV-25, QV-32, CON-71) | 3×2×2 = 12 | TC-QV-10, TC-QV-14, TC-CON-39 | LIM-04: a correction table for Windchill name variants is planned |
| DF-15 | Match DP rows to QMS-0025 Features | A row is matched to a Feature of another version, or not matched | Wrong tracking link; duplicate Features created | Fuzzy match on name only | 3 | 3 | 3 | 27 | Name and version both score; 80 % threshold; closest hint shown; Create Feature uses PsName and Release (QV-29, QV-31, NAV-26) | 3×2×2 = 12 | TC-QV-15, TC-QV-16, TC-NAV-26 | — |
| DF-16 | Baseline vs. actual | Baseline formula applied with wrong units or stream | Wrong variance | Rule editing | 3 | 2 | 3 | 18 | One formula for every stream; rule validation drops invalid rows; scope history with reason (BAS-02, BAS-06, BAS-09) | 3×1×2 = 6 | TC-BAS-01, TC-BAS-03 | OI-12 (baseline values) open |

## 4. Storage, sharing and recovery

| ID | Function | Failure mode | Effect | Cause | S | O | D | RPN | Design controls (requirements) | Residual RPN | Verified by | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DF-17 | Save locally | A save fails silently; the user closes the tab | Loss of the day's work | IndexedDB quota, private window | 4 | 2 | 4 | 32 | Save 200 ms after each change; failure shows a global error with "Export JSON backup now"; unsaved work blocks a reload (STO-01, STO-04, STO-05, UPD-03) | 4×1×1 = 4 | TC-STO-01, TC-STO-02, TC-UPD-02 | — |
| DF-18 | Load saved data at start | Unreadable data is replaced by the seed | Silent loss of everything | Corrupt record; schema change | 4 | 2 | 3 | 24 | Never fall back to the seed; show recovery options; migrate legacy data (STO-02, STO-03) | 4×1×1 = 4 | TC-STO-03 | — |
| DF-19 | Restore a backup | A wrong or malicious file is restored | Data loss; prototype pollution; injection | File chosen by mistake; crafted file | 4 | 2 | 3 | 24 | Schema and size validation, confirmation checkbox, refused during a pending save (STO-07, STO-08; SM-10) | 4×1×1 = 4 | TC-STO-03, TC-STO-04 | — |
| DF-20 | Share through Git | Two people save at once; the later one overwrites | Lost edits | Concurrent saves | 4 | 3 | 2 | 24 | Writes carry the loaded sha; 409/422 shown as a conflict with instructions (GIT-06, GIT-07, GIT-08) | 4×2×1 = 8 | TC-GIT-02, TC-GIT-03 | OI-11 (overwrite of unsaved local edits on load) open |
| DF-21 | Load data planted in Git | A malformed or hostile file crashes or misleads every user | App unusable for the team | Repository writer error or compromise | 3 | 2 | 3 | 18 | Schema checks, non-object rows dropped, ErrorBoundary per view, newer data never replaced by older (GIT-05, CON-70, CON-55; SM-10, SM-20) | 3×1×1 = 3 | TC-GIT-03, TC-CON-38, TC-CON-24 | PT-07 fixed in this pull request; PT-11 open |
| DF-22 | SharePoint central file | Two devices overwrite each other | Lost state | Concurrent saves | 4 | 2 | 2 | 16 | etag check; 412 shown with reload advice; size limit (SNP-02, SNP-03, SNP-07) | 4×1×1 = 4 | TC-SNP-01, TC-SNP-02 | — |

## 5. Exports, imports and rendering

| ID | Function | Failure mode | Effect | Cause | S | O | D | RPN | Design controls (requirements) | Residual RPN | Verified by | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DF-23 | Export CSV | A cell or header runs as a formula in the spreadsheet | Code execution in the user's spreadsheet (SM-12) | Data starting with `=`, `+`, `-`, `@` | 5 | 3 | 3 | 45 | Every cell and the header prefixed when formula-like, quoted when it holds separators (CON-69) | 5×1×1 = 5 | TC-CON-37 | PT-01 fixed in this pull request |
| DF-24 | Render rich text and documents | HTML or script from a field or document runs | Credential theft (SM-09) | Azure rich-text fields; Markdown | 5 | 3 | 2 | 30 | HTML converted to text; Markdown rendered as React elements; https-only links (QV-27, DOC-03, DOC-05) | 5×1×1 = 5 | TC-QV-13, TC-DOC-01 | R-08 (CSP) planned |
| DF-25 | Import an export (CSV, Excel) | A huge or malformed file freezes the tab | Function unavailable (the uploader's tab only) | Crafted or accidental file | 2 | 2 | 3 | 12 | Size limits, 1000 rows shown, ErrorBoundary (QEM-02, STO-07, CON-70) | 2×2×2 = 8 | TC-QEM-02, TC-CON-38 | PT-05, PT-06 caps open (KB-03, KB-04) |
| DF-26 | Read releases from Windchill exports | A release is missed or two spellings are listed twice | Wrong unique-release count | Free-text document names (about one in ten); folder names outside the known shapes | 3 | 4 | 3 | 36 | Location column (controlled folder names) read first — a clubbed folder one release as written, numbers kept as written — document names as fallback; the unique locations with the release read from each are listed and saved to Git for analysis; unmatched documents listed apart (CON-72, CON-71) | 3×2×2 = 12 | TC-CON-39, TC-CON-40 | Review the saved locations against the real exports; correction table if shapes remain outside the parser (LIM-04) |

## 6. Update and deployment

| ID | Function | Failure mode | Effect | Cause | S | O | D | RPN | Design controls (requirements) | Residual RPN | Verified by | Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DF-27 | Desktop self-update | A tampered or wrong installer is started | Code execution (SM-13) | Release or network compromise | 5 | 1 | 3 | 15 | Fixed release URL, installer named for the OS, SHA-256 verified, mismatch deletes the file (DSK-07…DSK-09) | 5×1×1 = 5 | TC-DSK-03, TC-INS-02 | R-06 code signing open |
| DF-28 | CI build and publish | Dependency code in CI replaces the published installers (SM-16) | Code execution on every desktop | Compromised dependency with a write token | 5 | 1 | 4 | 20 | Read-only token for jobs that run dependency code; publishing jobs only download artefacts (CI-07) | 5×1×1 = 5 | TC-CI-03 | PT-02 fixed in this pull request; R-07 SHA pinning open |
| DF-29 | Web update | Users keep running an old build, or reload while a fetch is running | Stale behaviour; interrupted save | Browser cache | 2 | 3 | 2 | 12 | Build id in the HTML, manifest check, reload blocked while busy (UPD-01…UPD-05) | 2×1×1 = 2 | TC-UPD-01, TC-UPD-02 | — |
| DF-31 | Save the Windchill locations analysis to Git | The file goes to the wrong repository or carries document contents | Data in the wrong place | Wrong Git configuration | 3 | 2 | 2 | 12 | Written only to the configured data repository next to the planning data, under windchill-analysis/; holds unique folders, counts and releases only, no rows, no credentials; refused in sample mode and with a read-only token (CON-72, GIT-02, GIT-09) | 3×1×1 = 3 | TC-CON-40 | — |
| DF-30 | Release the documents | The app shows documents that do not match its build | Wrong instructions or requirements | Documents published separately | 2 | 3 | 3 | 18 | Documents bundled at build time; the traceability matrix regenerated and checked in CI (DOC-02, DOC-10) | 2×1×1 = 2 | TC-DOC-01, TC-DOC-03 | — |

## 7. Summary

| | Count |
|---|---|
| Failure modes analysed | 31 |
| With S = 5 | 10 (DF-01…04, 06, 23, 24, 27, 28) — all with residual D = 1 |
| Initial RPN ≥ 40 | 3 (DF-01, DF-02, DF-23) — all reduced to 5 |
| Residual RPN ≥ 15 | 0 (DF-26 reduced to 12 by reading the Location column first; LIM-04 keeps the correction table as a further option) |
| Open actions | R-06 code signing, R-07 SHA pinning, R-08 CSP, KB-03/KB-04 input caps, PT-11 https check, LIM-04 correction table; open decisions OI-02, OI-03, OI-11, OI-12 |

The DFMEA is reviewed with every pull request that adds a function or changes a control (the pull request names the DF rows it touches), and in full at each release.
