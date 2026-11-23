# Independent review — Design Defaults, 2026-11-23

## 1. Scope and method

- **Role:** Design Defaults only (`review-defaults`, finding prefix DEF). The other roles were not run in this round.
  The UI/UX report of the same day is [2026-11-23-ui-ux-review.md](2026-11-23-ui-ux-review.md); where both found the
  same item, this report names the UX ID.
- **Code reviewed:** branch `claude/confident-babbage-qesuwh` at `56ac8e3` = `main` v7.54.3 plus open PR #343 (Modal
  keyboard / outside click, ask before a Git load replaces unsaved changes (GIT-16), keep the Edit PAT field).
- **Slices:** 6 slices, 240 files, 26,176 lines, every file read in full (table in §7). Slice D6 also read
  `package.json`, `pnpm-workspace.yaml`, `vite.config.ts` and the three `tsconfig*.json` files in full.
- **Read only.** Nothing was edited, nothing was written to Azure DevOps, Git storage or SharePoint, and no external
  service was called.
- **Runtime checks.** Almost all findings come from reading the code. Three were proven by running the slice code under
  Node 22 with type stripping: **DEF-21** (history hours out of range), **DEF-22** (IF / ROUND with a missing figure)
  and **DEF-51** (text dates read as day-month-year). `pnpm test`, `tsc`, `lint` and E2E were not run; no finding
  needed them.
- **Merge.** The lead opened every cited `path:line` at `56ac8e3`. All Critical and High findings were confirmed in the
  code; one location was corrected (see §9). 110 slice findings were merged into **85** findings (DEF-01…DEF-85);
  two more were already UI/UX findings and one is a re-check result (§9). Severities are the reviewers' own; where
  duplicates differed, the highest was kept.

## 2. Executive summary

### Counts (category × severity)

| Category | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Bug | 2 | 5 | 8 | 3 | 18 |
| Open Item | 0 | 0 | 2 | 7 | 9 |
| Future Item | 0 | 0 | 0 | 0 | 0 |
| Improvement | 0 | 0 | 2 | 20 | 22 |
| Weak Design | 0 | 1 | 12 | 23 | 36 |
| **Total** | **2** | **6** | **24** | **53** | **85** |

### Top 10 to act on first

1. **DEF-01** (Critical) — SharePoint autosave writes the synthetic sample over the central SharePoint file.
2. **DEF-02** (Critical) — "Initialize central data" PUTs with no `If-None-Match`, so it can overwrite another client's file.
3. **DEF-03** (High) — CI publishes the rolling macOS update with no tests, and Windows / Pages without E2E.
4. **DEF-04** (High) — "Month" and the lock moment use three time zones; NAV-11 and QV-18 contradict each other.
5. **DEF-05** (High) — Saving the Edit form on an unassigned item silently assigns it to the editor.
6. **DEF-06** (High) — The Edit form needs only `work.edit`, but writes state, Sprint and hours (CR-PB-02 open).
7. **DEF-07** (High) — Default hours are written onto Tasks tagged ad-hoc after the plan lock (CR-PB-01 open).
8. **DEF-08** (High) — Sample people and release scopes stay in planning data and reach Git on the next Save.
9. **DEF-09** (Medium) — Access fails open: no `access.json`, a read error or a slow first load gives every right.
10. **DEF-10** (Medium) — "Overloaded" is `>=` on Dashboard / Team overview but `>` on Capacity vs Actual.

### Decisions the owner must make

These are defaults where the code works as written but the right value is a product decision:

1. **One business time zone** for the month picker, new month Tasks, the current Sprint and the lock moment — India
   (NAV-11) or the viewer's zone (QV-18). (DEF-04, also DEF-61)
2. **Fail open or fail closed** for access: before `access.json` loads, when it cannot be read, and when there is none;
   and how wide the default role is. (DEF-09, DEF-36)
3. **Monthly pack status** with no choice: "On Track" (green) or "Not set". (DEF-12)
4. **Edit form assignee** when the item has none: keep empty, or assign to me. (DEF-05)
5. **Default Joined on 2026-05-01**: keep, clear, or not apply it to imported history months. (DEF-15)
6. **Baseline rules** with nothing saved: the example rules, or none. (DEF-16, OI-12)
7. **Ambiguous text dates**: the history import reads day/month, the Windchill import month/day. Pick one rule or
   ask per file. (DEF-20, DEF-51)
8. **Conflict policy** for shared Git files written last-writer-wins (history, views defaults, KPI tracker, pack
   template, views backups). (DEF-19)
9. **Overloaded at or above** the limit (Settings wording) or strictly above (CVA-04). (DEF-10)
10. **One list of "finished" states** and whether a Changed Date may stand in for a Closed Date. (DEF-34, DEF-50)
11. **Snapshot content**: what an LTE snapshot must hold (OI-04). (DEF-27)
12. **Missing connection role**: fall back to read-only `reference` instead of the write role. (DEF-33)

### The owner's answers (2026-11-23)

Recorded here as given; each is built as its own change (with its requirement rows), one at a time.

| # | Decision | Answer |
|---|---|---|
| 1 | Business time zone | **UTC throughout** — months, new month Tasks, the current Sprint and the lock moment. **Done** (NAV-51, KB-72). |
| 2 | Access fail open or closed | **Allow nothing** until a policy is loaded (fail closed). **Done** (CON-101, KB-71). |
| 3 | Monthly pack status with no choice | **Not set** (no green). |
| 4 | Edit form assignee when the item has none | **Stays unassigned**: Assigned to starts **blank**; the person may choose someone. **Done** (BKL-44, KB-66). |
| 5 | Default Joined on | "Joined on" is really **the date time tracking started** (not the real joining date): it is **renamed "Time tracking started"**; "Left the team on" stays as it is. |
| 6 | Baseline rules with nothing saved | **Backlog** — to be decided later. |
| 7 | Ambiguous text dates | **Backlog** — the owner checks the real files first (PROJECT-PLAN.md → Backlog). |
| 8 | Shared Git files written last-writer-wins | **Queue the saves and save both, in order of their timestamp (to the second).** **Done** (GIT-17, HIS-04, MYD-09, KPT-03, CON-88, PCK-08, KB-73, DF-141, SM-95). |
| 9 | Overloaded | **Strictly above** the limit. |
| 10 | Finished states; Changed Date for Closed Date | Finished = **Closed, Resolved, Completed, Done** everywhere. Without a Closed Date, the close date is **taken from the item's history** (the change that moved it into a finished state), not from the last-changed date. |
| 11 | LTE snapshot content | **All data present at the moment**, including the hours data and the release data. |
| 12 | Missing connection role | **Read-only.** |

## 3. Findings

Rows are sorted by severity, then by reach. **Sources** lists every slice finding merged into the row (D1-01 =
DEF-D1-01 of slice D1) and the UI/UX ID where that review found the same item.

### 3.1 Bugs

| ID | Category | Severity | Location | Finding | Evidence | Recommendation | Confidence | Sources |
|---|---|---|---|---|---|---|---|---|
| DEF-01 | Bug | Critical | src/store.ts:66-83; src/useAzureWorkspace.ts:76-90; src/components/AzureConnections.tsx:283; src/components/DataStatus.tsx:23 | SharePoint autosave writes the synthetic sample over the central SharePoint file. CR-P1-05 / CR-PB-04 still open. | The autosave effect checks only `connection.mode !== 'sharepoint' \|\| !client.current`, then `client.current!.save(state, …)` 900 ms after any change. Load sample replaces `azureWorkItems`, `releaseSource`, adds sample people and scopes; neither Load button checks the connection mode. Steps: connect SharePoint, Admin → Load synthetic sample dataset; ~900 ms later the PUT writes the sample state. | Block Load sample while SharePoint is connected, or skip remote saves while `azureBacklogScope.sample` is set (as Git and Azure writes already do). | High (traced, not run) | D3-01 |
| DEF-02 | Bug | Critical | src/store.ts:125-128; src/sharepoint.ts:67-72 | "Initialize central data" saves with `etag` null, so the PUT has neither `If-Match` nor `If-None-Match: *` and replaces a file another client created meanwhile. CR-P1-06 still open. | `etag.current = await client.current.save(state, null)`; `if (etag) headers['If-Match'] = etag`. Steps: A connects and sees "No central data file exists yet"; B initializes and works; A presses Initialize — B's data is replaced by A's local state (possibly the seed). | With no etag send `If-None-Match: *`; on 412 say "already initialized" and pull. | High | D3-02 |
| DEF-03 | Bug | High | .github/workflows/build-and-deploy.yml:314-367, 369-372, 412-415, 502-505, 176 | CI promotes builds without their tests. `package-macos` has no lint or unit-test step and `publish-macos` needs only it; `publish-windows` needs only `validate-and-package` (no E2E); `deploy-web-site` needs only `build-web-site` (no E2E); the tagged release does not need `end-to-end-slow`. CR-P1-08 / CR-PB-06 still open. | `publish-macos: needs: package-macos`; `publish-windows: needs: validate-and-package`; `deploy-web-site: needs: build-web-site`. A merge whose unit tests fail still writes the darwin entry of `desktop-latest/latest.json`, which installed Macs offer as an update (electron/desktop-update.cjs:40). | Make every public promotion need `validate-and-package`, `end-to-end` and `end-to-end-slow`; run unit tests in `package-macos`. | High | D6-01 |
| DEF-05 | Bug | High | src/components/WorkItemEditor.tsx:90-92, 103, 188 | Saving the Edit form on an unassigned item assigns it to the editor, unasked. People without "create for others" (the default Team Member) see "—" and cannot notice. BKL-20: "Save shall send only the changed fields". | `const assignee = canChoose && assigneeName ? … : current \|\| me`; `if (assignee && assignee !== (item.assignedToEmail ?? '')) edit.assignedTo = assignee`. Steps: Edit an unassigned Task, change only the title, Save → `System.AssignedTo = me`. Also when the assignee's uniqueName is not an email (no `assignedToEmail`), the item moves to the editor. | Keep the current value, even empty; send `assignedTo` only when the user picked someone. | High | D5-01 |
| DEF-06 | Bug | High | src/azureClient.ts:152-160 (line 155); src/azureDevOps.ts:572-599; src/workItemEdit.ts:55-73 | The Edit form needs only `work.edit`, but its patch can set state, Sprint and hours. A role with Deny on `work.state`, `work.move` or `work.hours` can still change them (CON-94). CR-P1-03 / CR-PB-02 still open. | `case 'edit-work-item': return ['work.edit']`; `editPatch` writes `System.State`, `System.IterationPath`, `OriginalEstimate`, `CompletedWork`. Steps: Allow "Edit the fields", Deny "Enter hours"; Edit a month Task, change Completed Work, Save → written. | Derive the needed rights from the changed fields (state → `work.state`, Sprint → `work.move`, hours → `work.hours`, rest → `work.edit`). | High | D1-01 |
| DEF-07 | Bug | High | src/azureDevOps.ts:306-307, 404-405, 528; src/components/ContentBulkCreate.tsx:46, 54; src/contentBulk.ts:12 | Default hours (Epic setup Original Estimate, Content bulk's 4 h) are written onto a new month Task even when it is tagged ad-hoc after the plan lock. The edit rule locks the estimate of ad-hoc Tasks. CR-P1-02 / CR-PB-01 still open. | `createChildItem(…, adhoc)` then `if (defaultHours != null) task = await updateAzureTimeWritingEffort(…, defaultHours, …)` with no `adhoc` check. Content bulk passes `taskEstimate: 4` with `adhoc = adhocAfterLock(month)`. Steps: after the plan lock day, Release Details → Content → Create Features → each Task is ad-hoc with 4 h estimate. | Skip the default estimate when `adhoc` is true (as `editWorkItem` does); add a test. | High | D1-02 |
| DEF-08 | Bug | High | src/useAzureWorkspace.ts:85-87, 432-438; src/useGitStorage.ts:38, 55, 126-134; src/gitStorage.ts:55-60 | Sample people and sample release scopes stay in planning data after a real fetch and are saved to the shared `planning-data.json` on the next Save to Git. | Load sample: `resourceProfiles = { ...sampleProfiles, ...}`, `releaseScopes = [..., ...sampleReleaseScopes(...)]`. `storeFetched` replaces only `azureWorkItems` / `azureBacklogScope`. `planningData()` includes profiles and scopes; `save()` refuses only while `isSample`. Steps: load sample → Fetch Time Writing → change a shared setting → Save to Git. | Tag sample profiles and scopes (as `releasePlans` are), remove them when real data replaces the sample, keep them out of `planningData`. | Medium (traced; Save UI not run) | D3-03 |
| DEF-10 | Bug | Medium | src/capacityActual.ts:17; src/pages/CapacityActualPage.tsx:54, 81; src/capacity.ts:258; src/dashboard.ts:117 | "Overloaded" differs by page: Capacity vs Actual uses `>` the limit; Team overview, Dashboard and Settings ("at or above") use `>=`. At exactly 100 % a person is Overloaded on one page and On track on the other. CVA-04 says "above". | `if (used > settings.overloadedAt) return 'Over'` vs `if (utilization >= settings.overloadedAt) return 'Overloaded'`. | One rule (`>=`) everywhere; align CVA-04. | High | D5-05, D1-08 |
| DEF-11 | Bug | Medium | src/capacity.ts:151, 153, 170; src/pages/AdminPage.tsx:211-223 | Invalid capacity input is replaced silently: if "Has capacity below" is not lower than "Overloaded at", both reset to 80 / 100 and the form still says "Capacity settings saved". No upper limits (80 h a day is accepted). OI-05 still open. | `withLocks.availableBelow < withLocks.overloadedAt ? withLocks : { …, availableBelow: default, overloadedAt: default }`; `number('hoursPerDay', 0.25)` has a minimum only. Steps: Overloaded 90, Below 95, Save → stored 100 / 80, no warning. | Validate in the form and refuse with a message; add upper limits. | High | D5-02, D1-09 |
| DEF-21 | Bug | Medium | src/history.ts:35, 119; src/components/HistoryPanel.tsx:98 | A history row with hours out of range (> 1000 or negative) is reported as "no hours", which the panel files under rows left out by design — a typing error is never shown as a row to check (HIS-03: nothing dropped silently). | `hoursOf` returns undefined outside 0–1000; `reason: 'no hours'`; `expected = /…\|^no hours$/`. **Proven by running:** "1200" and "-4" both give `no hours`. | Own reason ("hours out of range 0–1000"), listed with the rows to check. | High | D2-02 |
| DEF-23 | Bug | Medium | README.md:429 (vs README.md:42, MON-21, src/planningLock.ts:13) | README contradicts itself and the code: line 429 says actuals lock at the end of the 5th of the next month; code, MON-21 and README:42 say the 4th. Users may plan to write hours a day too late. | `defaultActualsLockDay = 4`; README:429 "…locking at the end of the 5th of the following month". | Correct README:429. | High | D2-05, D5-07 |
| DEF-24 | Bug | Medium | src/dpBulk.ts:106-111 | Bulk Create Features finds the QE's email by display name, first match wins. Two people with the same name → the Feature, stories and Task are created for the wrong person (the DPF-06 pop-up shows the email, which softens it). | `board.find((item) => item.assignedToEmail && norm(personName(item.assignedTo ?? '')) === wanted)?.assignedToEmail`. `assignablePeople` (myWork.ts:178-184) already detects duplicate names. | Return '' with "several people named X" when the name maps to more than one email. | Medium | D2-06 |
| DEF-25 | Bug | Medium | src/useAzureWorkspace.ts:32; src/releaseSource.ts:129-132, 211; src/dpReleases.ts:93; src/ioccMilestones.ts:51 | The configured approval date field (Stream options, GIT-14) is used only for release-source fetches. Reference, documents and backlog views and the `viewMonthOf` fallback call `approvalDateFrom(fields)` without settings and take the first field whose name looks like "approval date". | `approvalDate = approvalDateFrom(item.fields)`. With both `…ReviewerApprovalDate` and `…AuthorApprovalDate` present, key order decides the month. | Pass the release-source settings to every `approvalDateFrom` call. | Medium | D3-08 |
| DEF-27 | Bug | Medium | src/pages/SnapshotsPage.tsx:59; src/cloudSnapshots.ts:15 | The LTE snapshot card promises "planning, capacity and release data for the selected month", but the snapshot leaves out capacity settings, profiles, baseline rules and scopes (OI-04, open) and is the whole dataset, not one month. | Whitelist `{ schemaVersion, people, activities, efforts, baselines, periods, releases, audits, masters, azureWorkItems, azureBacklogScope }`. | Correct the card text, or decide OI-04. | High | D5-08 |
| DEF-31 | Bug | Medium | vite.config.ts:9; scripts/desktop-manifest.cjs:32; .github/workflows/build-and-deploy.yml:95, 284, 325, 466 | The revision in `build-info.json`, the Force Update dialog and `latest.json` is the pushed commit, not the release commit actually built, so v7.x.y points at a commit whose `package.json` has the previous version (CONFIGURATION-MANAGEMENT.md:16, :28). | Checkout uses `ref: needs.release-commit.outputs.sha \|\| github.sha`; vite and the manifest use `process.env.GITHUB_SHA`. | Use `git rev-parse HEAD` after checkout, or pass the release SHA. | High | D6-04 |
| DEF-53 | Bug | Low | src/backgroundJobs.ts:17, 26 | The job list keeps 20 jobs including running ones; a running job can be pushed out, then `isRunning(key)` is false, the same write can start twice and its result is never shown. | `jobs = [job, ...jobs].slice(0, 20)`. Steps: one long job, then 20 more before it ends. | Never drop running jobs; trim finished ones only. | Medium | D1-13 |
| DEF-61 | Bug | Low | src/pages/AdminPage.tsx:354 | The default "Left the team on" is the UTC date; in India before 05:30 it is yesterday, so the last working day is lost. | `leftOn: new Date().toISOString().slice(0, 10)`. | Use the local date (`todayIso`). | High | D5-11 |
| DEF-65 | Bug | Low | src/components/WindchillReleasesPanel.tsx:99 | The empty message says "No release has its latest {date} in {month}", but the month filter (CON-73) keeps releases with any document dated in the month. | Message text vs `entry.months.includes(month)`. | "No release has a document dated in …". | High | D5-16 |

### 3.2 Open Items

| ID | Category | Severity | Location | Finding | Evidence | Recommendation | Confidence | Sources |
|---|---|---|---|---|---|---|---|---|
| DEF-29 | Open Item | Medium | electron/main.cjs:89-100, 157-168, 216-230 | No session sets a permission handler, so Electron grants camera, microphone, location, notifications…; both sign-in windows (Windchill and SharePoint) may navigate to any https host with no address bar. PT-09 / R-09 still open; PT-09 names only the Windchill window. | No `setPermissionRequestHandler` anywhere; `will-navigate` checks only `startsWith('https://')`. | Deny permissions on the default, `persist:windchill` and `persist:sharepoint` sessions; limit sign-in navigation to the target and identity hosts; update PT-09. | High | D6-02 |
| DEF-32 | Open Item | Medium | .github/dependabot.yml:5; docs/CONFIGURATION-MANAGEMENT.md:76; docs/DEVELOPMENT-PROCESS.md:22, 96, 121; scripts/swbom.mjs:92 | The documents describe a daily dependency check (`pnpm audit`, updates, SWBOM, PR). The repository has none: the workflow has no schedule and Dependabot watches only `github-actions`. | `package-ecosystem: github-actions` only; triggers push / pull_request / workflow_dispatch. | Add npm to Dependabot or a scheduled audit job, or document where the check runs. | Medium (could run outside the repo) | D6-05 |
| DEF-40 | Open Item | Low | src/sharepoint.ts:30, 41 | Graph scope `Sites.ReadWrite.All` is wider than the one site used (PT-13 / R-12 open); authority falls back to `organizations` (any work tenant) when no tenant ID is given. SECURITY-ASSESSMENT.md:57 cites line 29; it is now 30. | `const scopes = ['User.Read', 'Sites.ReadWrite.All']`; `config.tenantId.trim() \|\| 'organizations'`. | `Sites.Selected`, require the tenant ID, fix the cited line. | High | D3-12 |
| DEF-42 | Open Item | Low | electron/azure-devops.cjs:3-11, 32, 43 | Desktop read requests send the PAT (Basic auth) to any https host the renderer names. PT-10 / R-10 still open; writes are limited to dev.azure.com. | `collectionBase` returns `${url.origin}…` for any https host. | Accept only the saved servers; block private and link-local addresses (R-10). | High | D6-06 |
| DEF-63 | Open Item | Low | src/pages/MyWorkPage.tsx:107; src/pages/SprintCheckPage.tsx:148; src/pages/PulseCheckPage.tsx:158; src/pages/MyDashboardPage.tsx:23; src/pages/MyActivitiesPage.tsx:87, 336; README.md:146 | First-run "who are you" hints send people to four different places for the work email; per CON-82 it is My settings → Your work email. KB-53 (reopened) still holds. | "Set the Feature creator email on your Time Writing connection". | Point every hint and README:146 to My settings → Your work email. | High | D5-13; UX-08 |
| DEF-66 | Open Item | Low | src/pages/registry.ts:26; src/pages/MyActivitiesPage.tsx:23-24 | Texts contradict the code: QE Mapping detail says "QE mapping (planned)" though the page works; the Time Writing header comment says rows to add are ticked, but nothing is ticked (ACT-03). | `detail: 'QE mapping (planned).'`; `ticked[row.key] ?? false`. | Update both texts. | High | D5-17; UX-51 (part) |
| DEF-83 | Open Item | Low | docs/REQUIREMENTS-SPECIFICATION.md:861; .github/workflows/build-and-deploy.yml:317 | CI-02 says every pull request builds the macOS disk image; the workflow (and README:97) skips it on pull requests. | `if: … && github.event_name != 'pull_request'`. | Reword CI-02. | High | D6-09 |
| DEF-84 | Open Item | Low | docs/REQUIREMENTS-SPECIFICATION.md:795; electron/azure-devops.cjs:14, 32, 178-187, 201 | DSK-04's list of allowed proxy operations omits `team-members`, `comments`, `edit-work-item` and `add-comment`, which the proxy accepts. | `writeOperations = [… 'edit-work-item', 'add-comment']`. | Update DSK-04. | High | D6-10 |
| DEF-85 | Open Item | Low | docs/SOFTWARE-COMPONENTS.md:417, 456; package.json:37 | SOFTWARE-COMPONENTS says Electron 44.10.1; package.json has `^44.11.5`. | `"electron": "^44.11.5"`. | Correct the version (or regenerate). | High | D6-17 |

### 3.3 Future Items

None as a separate row. D5-19 (make the +25 % overrun limit an Insight threshold) was rated Future Item and is merged into DEF-55.

### 3.4 Improvements

| ID | Category | Severity | Location | Finding | Evidence | Recommendation | Confidence | Sources |
|---|---|---|---|---|---|---|---|---|
| DEF-12 | Improvement | Medium | src/monthlyPack.ts:285; src/pptxTemplate.ts:134-135; src/components/MonthlyPackPanel.tsx:127 | With no status chosen the Monthly pack reports "On Track" with a green tick — a positive status nobody judged. Unknown status text from Git also gets the green look. Documented in PCK-08. | `status: lines(pulse, 'status')[0] ?? 'On Track'`; `<option value="">On Track (default)</option>`. | "Not set" (no colour) and ask before Download .pptx. | High | D4-03, D2-09 |
| DEF-28 | Improvement | Medium | src/components/PersonalLayout.tsx:29; src/usePersonalViews.ts:70-73 | "Use as default for everyone" writes to Git at once, unconfirmed, and shares the admin's sections for every page plus the whole menu (pins, hidden pages), not just the page shown. | `views.saveAsDefault()`; `serializeViews({ ...emptyViews(), sections: views.sections, menu: views.menu })`. | Confirm first, naming what is shared; consider a menu-free option. | High | D4-04; UX-23 |
| DEF-36 | Improvement | Low | src/access.ts:82, 86, 94 | The starting role matrix gives the default role (every unlisted email, and anyone with no email) edit, state, move, hours and comment writes. Documented (CON-94). | `defaultRole: 'Team Member'`; Team Member gets `workActions`. | Start the default role with `work.hours` (and `azure.write` for own Time Writing) only. | High | D1-15 |
| DEF-37 | Improvement | Low | src/components/GitStorage.tsx:14, 22; src/App.tsx:404 | "Remember token in this browser" is pre-ticked and Get started always remembers, though GIT-02 describes remembering as opt-in. The token can write the shared repository. | `useState(true)`; `git.connect(…, token, true)`. | Untick by default, or state the default in GIT-02 / NAV-38; same choice in Get started. | High | D4-07 |
| DEF-38 | Improvement | Low | src/gitStorage.ts:30 | The prefilled Git repository belongs to a named personal account; every build pre-fills it. Documented (GIT-13, CONFIGURATION-MANAGEMENT.md:17). | `defaultGitRepository = { owner: '<personal account>', repo: 'DemandPlanningStorage', … }`. | Build-time setting or an organisation-owned repository. | High | D2-17 |
| DEF-39 | Improvement | Low | src/connectionPresets.ts:13-19; src/desktopDownloads.ts:2 | Connection presets put an internal on-premises host, collection and project names and WIQL with internal area paths into the web bundle, which is likely public (downloads point to a public GitHub release). | `serverUrl: "https://<internal host>/tfs"`. | Load presets from the private data repository. | Low (bundle visibility not verified) | D1-16 |
| DEF-41 | Improvement | Low | src/useGitStorage.ts:120; src/setupGuide.ts:40 | Connect asks for a GitHub token with "Contents: Read and write", while the guide correctly says Read suffices for viewers. | Quoted strings. | Ask for Read; Read and write only for people who save. | High | D3-13 |
| DEF-44 | Improvement | Low | electron/windchill.cjs:19, 63; electron/sharepoint-file.cjs:33; electron/desktop-update.cjs:34, 45, 51 | Only Azure requests have a timeout (45 s). Windchill, SharePoint, the update check and the installer download can hang forever; the web update check has 15 s. | `fetch(…)` without `signal`. | `AbortSignal.timeout` (and a stall timeout for downloads); document in NFR-03. | High | D6-08 |
| DEF-46 | Improvement | Low | package.json:63-66 | The NSIS uninstaller keeps app data, so stored PATs stay in the profile after uninstall; not stated in README or SECURITY-ASSESSMENT. | `nsis` block sets only `oneClick` and `allowToChangeInstallationDirectory`. | Document it, or offer to remove the data. | Medium | D6-16 |
| DEF-52 | Improvement | Low | src/store.ts:20, 37; src/seed.ts:3-42 | First run starts from synthetic MVP planning data (people, a locked 2026-10 period, efforts), saved to IndexedDB as if real; "Initialize central data" can push it to SharePoint (see DEF-02). | `useState(() => structuredClone(seedState))`; `loadBrowserState(…, seedState)`. | Start empty; keep the seed behind an explicit Load sample. | Medium | D3-10 |
| DEF-56 | Improvement | Low | src/components/SharedTimePanel.tsx:17-18, 41 | A new holiday / activity mapping is preselected as Common activity for Everyone, the broadest scope; a regional holiday mapped as is reserves time for the whole team. | `useState('activity')`; `useState('everyone')`. | No preselection; require a choice. | Medium | D4-10 |
| DEF-57 | Improvement | Low | src/components/AzureConnections.tsx:227; src/pages/AdminPage.tsx:265 | The match threshold is saved on every keystroke (typing 85 saves 8 first and marks shared data dirty). It is editable with `streams.options` while its section is labelled "Tool Owner only". | `onChange={… if (value >= 1 && value <= 100) store.update(…matchThreshold: value…)}`. | Commit on blur / Enter; align permission and label. | High | D4-11 |
| DEF-58 | Improvement | Low | src/components/GapsPanel.tsx:12-14; src/components/HistoryPanel.tsx:159 | Gaps lists stop at 60 and "rows to check" at 500 with no "and N more" (headings show full counts). | `.slice(0, 60)`; `toCheck.slice(0, 500)`. | Add "… and N more", as HistoryPanel.tsx:160 does. | High | D4-12 |
| DEF-64 | Improvement | Low | src/pages/MyWorkPage.tsx:44, 126; src/pages/MyActivitiesPage.tsx:455 | The default parent Epic of "＋ New Feature" differs: My Tasks takes the lowest-ID Epic not Removed (may be Closed or the absence Epic); Time Writing the first Active by title. | `… !== 'removed' … sort((a, b) => a.id - b.id)`. | One rule: Active Epics only, never the absence Epic. | High | D5-15 |
| DEF-67 | Improvement | Low | src/components/TableDefaultsPanel.tsx:41 | "Reset to the built-in defaults" replaces the shared table design for everyone in one click, unconfirmed. | `onClick={() => change(tableDefaults, 'Reset to the built-in defaults')}`. | Confirm first. | High | D5-18 |
| DEF-69 | Improvement | Low | src/settingsTabs.ts:37-38 | Admin first opens on Streams (`connections`); ADM-01 makes Overview the first Admin page. The remembered page is not checked against rights here. | `… : 'connections' } catch { return 'connections' }`. | Default to Overview. | Medium | D3-17 |
| DEF-70 | Improvement | Low | src/useGitStorage.ts:382-410, 449-463 | On-prem view data is committed to Git on every fetch even when unchanged; `pushWindchill` skips unchanged data but does not wait for the token write check, so a read-only token gives an error instead of the read-only note. | `// also when the data is unchanged`; no `writeCheck` in `pushWindchill`. | Skip unchanged on-prem snapshots; add the write check. | High | D3-18 |
| DEF-71 | Improvement | Low | src/releaseSource.ts:139; src/useAzureWorkspace.ts:222-226, 333-334 | A documents or reference connection with no query reads the whole project (every non-Removed item, up to 20,000). | `projectQuery = "… [System.TeamProject] = @project AND [System.State] <> 'Removed'"`. | Require a query for these roles. | Medium | D3-19 |
| DEF-77 | Improvement | Low | src/pptxTemplate.ts:207-218 | "The file properties name nobody" is only partly true: creator and lastModifiedBy are cleared, but app.xml (Company, Manager), custom.xml and comment authors from the template stay. | Only `cp:lastModifiedBy`, `dc:creator`, `dcterms:modified` rewritten. | Clear the rest or correct the comment. | Medium | D2-16 |
| DEF-78 | Improvement | Low | src/kpiTracker.ts:3-5 | Each live KPI read by an admin is committed to Git for everyone, one commit per read, whatever the workbook holds (KPT-03). | Header comment and KPT-03. | Confirm, or let admins switch the Git copy on. | Low (workbook content unknown) | D2-22 |
| DEF-81 | Improvement | Low | scripts/release-changes.mjs:44, 48, 72 | When the commit adding a change note is not a squash titled "… (#N)", the release entry silently has no PR number, though CI-09 requires it. | `prOf` returns undefined; `change.pr && …`. | Warn or fail when no PR number is found. | High | D6-15 |
| DEF-82 | Improvement | Low | electron/azure-devops.cjs:222 | A 401 on a write tells the user to check "Work Items (Read)"; writes need Read & Write (the 403 text already picks the right scope). | `'PAT rejected or expired. Check Work Items (Read) access.'` | Use `writing ? 'Read & Write' : 'Read'`. | High | D6-12 |

### 3.5 Weak Design

| ID | Category | Severity | Location | Finding | Evidence | Recommendation | Confidence | Sources |
|---|---|---|---|---|---|---|---|---|
| DEF-04 | Weak Design | High | src/App.tsx:211; src/format.ts (`todayIso`); src/azureDevOps.ts:109-111 (+ default `monthLabel` at 281, 391, 412, 443, 470, 499, 538); src/azureRead.ts:39-52; src/azureInsights.ts:76-80, 108; src/planningLock.ts:18-25; src/monthTaskAction.ts:14, 20; src/pulseCheck.ts:38; src/releaseSource.ts:210-224; src/windchillReleases.ts:194, 207; src/useAzureWorkspace.ts:78; src/planningOverview.ts:27-29, 83-87; src/myWork.ts:294; src/pages/MyWorkPage.tsx:48; src/components/AzureConnections.tsx:251; docs/REQUIREMENTS-SPECIFICATION.md:95, 254 vs 578; docs/TEST-PLAN.md:877 | "Month" and the lock moment are worked out in several zones. Header month, Pulse Check and release months: viewer's zone. New month Task titles, current Sprint, Feature-closure counts, sample month, My Tasks "missing" month: India. Lock moment: viewer's local clock. Windchill months: UTC wall clock. Planning Overview Target-date month: raw UTC string. Release counts picker: local today, ignoring the header month. Documents disagree: NAV-11 and the glossary say India; QV-18 says viewer's zone; TEST-PLAN:877 says `viewMonthOf` uses India, the code uses the viewer's zone. CR-PB-07 (time zone part) still open. | `useState(() => todayIso().slice(0, 7))` vs `currentIndiaMonth()` / `indiaMonth()` with `timeZone: 'Asia/Kolkata'`; ``endOfDay = new Date(`${date}T23:59:59.999`)``; `feature.targetDate.slice(0, 7)`. Examples: US user 21:00 EST on 30 Nov sees November but a new month Task is "December 2026" and the ad-hoc check uses December; at 21:00 CET on 5 Nov a Netherlands user's plan is open while an India user's is locked; a Feature closed 2026-10-31T20:00Z is October in Pulse Check and November in Insights. | One business time zone for month, Sprint and lock defaults, used everywhere; then align NAV-11, QV-18, glossary, README:431, MON-06/07 and TEST-PLAN:877. | High (code); Medium (user impact) | D3-04, D1-03, D2-04, D2-01, D4-06, D5-10 |
| DEF-09 | Weak Design | Medium | src/access.ts:3-5, 146, 158-159; src/azureClient.ts:146; src/useAccess.ts:17-18, 30-40; src/useCan.ts:7; src/components/AccessPanel.tsx:64, 66 | Access fails open. No `access.json` → every right, including `access.manage` and `streams.manage`. On a new browser the rights are unrestricted while `access.json` loads and for the whole session if the read fails. The Azure write guard starts as allow-all. A file without Tool Owner gives that role every right. `useCan` without a provider allows all (latent). Identity is a typed, unverified email. The no-file case is documented (CON-43, LIM-07, PT-16 accepted); the load / read-error case is not. README:324 / CON-43 also say "without Git nothing is restricted", but the code keeps the last cached policy. PT-16 cites `src/azureDevOps.ts:630`, which is now `addComment`; the guard is `azureClient.ts:146-160`. | `if (!policy) return { areas: new Set(allAreas), actions: new Set(allActions), …, restricted: false }`; `let writesAllowed = () => true`; `policy: current.scope === scope ? current.policy : cachedPolicy()` (null on a new browser); `createContext(() => true)`. | No Azure writes until the policy (or cache) is read; on a read error use the default role or read-only; banner when there is no `access.json`; fix README / CON-43 wording and the PT-16 location. | High | D1-05, D3-05, D4-01, D3-20 |
| DEF-13 | Weak Design | Medium | src/store.ts:96-99; src/useAzureWorkspace.ts:88, 176, 188, 202, 314, 327, 339, 436; src/pages/AdminPage.tsx:134-231, 390; src/components/TableDefaultsPanel.tsx:13; src/pages/BaselinesPage.tsx:38, 49; src/pages/DashboardPage.tsx:92-119; src/components/BulkEpicsPanel.tsx:23 (and 3 more panels); src/App.tsx:415 | Every audit entry has `actor: 'u-owner'` (30 places), the History list shows no actor, and where a name is written an unknown user becomes "Admin" (figure locks, KPI tracker `readBy`, shared through Git). MON-23 asks "who and why"; the store.ts:96 comment and OI-09 say "who" is recorded. Declared out of scope at REQUIREMENTS-SPECIFICATION.md:38. | `actor: 'u-owner'`; `who={my.me.name \|\| 'Admin'}`. | Record the work email, show it in History and Overview, use "unknown" instead of "Admin"; or correct the comment and OI-09. | High | D5-04, D1-14, D3-09, D4-09 |
| DEF-14 | Weak Design | Medium | src/pages/AdminPage.tsx:58, 162, 169, 318 | "Reason for change" starts as "Approved operational extension" and is written into every lock change and `monthLocks[month].reason`, even when nothing was approved. MON-23: reason is optional. | `useState('Approved operational extension')`. | Start empty; record only a typed reason. | High | D5-03; UX-43 |
| DEF-15 | Weak Design | Medium | src/capacity.ts:59, 148, 283; src/pages/AdminPage.tsx:350 | Default Joined on is the fixed date 2026-05-01 for everyone without their own (CAP-15, "for now"). Imported history (HIS-03) holds months before it, so those people get no capacity there and are listed as "outside employment"; a fresh install shows zero capacity before May 2026. An invalid stored value silently falls back to it. | `defaultJoinedOn: '2026-05-01'`; `joinedOn: profiles[name]?.joinedOn ?? (settings.defaultJoinedOn \|\| undefined)`. | Default empty, or do not apply it to history months; warn on import. | Medium | D1-06, D5-14 |
| DEF-16 | Weak Design | Medium | src/baseline.ts:13-19, 26-27 | With no saved baseline rules (or a value that is not a list) the example rules are used silently; the code calls them "illustrative" and DP's "placeholders". A release scoped before anyone edits the rules gets a placeholder baseline. | `if (!Array.isArray(value)) return exampleBaselineRules`. | Default to no rules with an empty state offering "Load example values"; report unreadable values. | High | D1-07 |
| DEF-17 | Weak Design | Medium | src/components/DpBulkCreate.tsx:45, 53, 57, 96; src/components/IoccBulkCreate.tsx:43, 51, 55, 94; src/components/ContentBulkCreate.tsx:32, 37, 41, 78 (vs src/components/FeatureEditor.tsx:132-134, 163-165) | Bulk Create Features preselects the first PI / Sprint when several are current (or the earliest future pair), and does not re-check the schedule at Create. Single New Feature refuses to guess. CNB-02 says the PI / Sprint is "chosen when several are current". | `const [choice, setChoice] = useState(0)`; `setPairs(current.length ? current : futureIterationPairs(options))`. | No choice when more than one pair; block Create until picked; re-check before the job. | High | D4-02 |
| DEF-18 | Weak Design | Medium | src/App.tsx:131-145; src/useGitStorage.ts:165-171; src/viewDefinitions.ts:249-254 | At start, duplicate connections are removed and the shared setup in Git is rewritten without asking, checking only that the token can write, not `streams.manage` (CON-93). `shareViews` re-adds every shared connection on this computer, so connections a Tool Owner removed can come back. NAV-30 mentions only local removal. | `if (git.connected && !git.readOnly && !azure.isSample) { … git.shareViews(listAzureConnectionProfiles(), …) }`. | Remove duplicates locally; leave the shared write to `streams.manage` holders or ask first. | Medium | D1-04 |
| DEF-19 | Weak Design | Medium | src/useHistory.ts:31-35; src/useGitStorage.ts:201, 263, 322, 353 | Several shared Git files are last-writer-wins: the history import writes over a newer file on conflict; views defaults, KPI tracker, pack template and views backups read the latest sha just before writing. Access, Epic / Feature setup and QE Mapping refuse conflicts. HIS-04 does not state the overwrite. | `const fresh = await readHistory(); … git.writeHistory(text, fresh.sha, message)`; `trackWrite(…, await fileSha(target, token), …)`. | Refuse a conflict and ask, as for the other shared files. | High | D3-07 |
| DEF-20 | Weak Design | Medium | src/windchillReleases.ts:152-153 | A slashed Windchill date with both parts ≤ 12 is read as US month/day; the team is in the Netherlands and India, so "05/10/2026" (5 Oct) becomes 10 May and counts in the wrong month. Documented in CON-71. The history import uses the opposite rule (DEF-51). | `const [month, day] = a > 12 ? [b, a] : [a, b]`. | Detect order per column, or a per-export setting defaulting to day/month. | High | D3-06 |
| DEF-22 | Weak Design | Medium | src/formula.ts:3, 72-73 | With a missing figure, IF and ROUND do not give blank as the header and CAP-55 promise: IF takes the else branch, ROUND uses 0 digits. | `return args[0] ? args[1] : args[2]`; `10 ** (args[1] ?? 0)`. **Proven by running:** `=IF([Absence] > 0, [Project work], 999)` with Absence missing gives 999; `=ROUND([Project work],[Absence])` with 50.678 gives 51. | Return null when the IF test or ROUND digits are null. | High | D2-03 |
| DEF-26 | Weak Design | Medium | src/pages/DashboardPage.tsx:184, 593-594, 625; src/App.tsx:411 | Standard Hours and the shared-time groups of the Old Calculation are shared capacity figures (CAP-36/37), but editing them is gated by `layout.defaults`, not `capacity.settings`. | `canEdit={canSetDefault}`, `canSetDefault={access.can('layout.defaults')}`. | Gate by `capacity.settings`. | High | D5-06 |
| DEF-30 | Weak Design | Medium | electron/main.cjs:12-17, 242-247 | The installed app still honours `VITE_DEV_SERVER_URL`: if set, the main window loads it (http allowed) with the preload, and its origin passes the trusted-sender check for every IPC call. | `if (devUrl) window.loadURL(devUrl)`; no `app.isPackaged` check. | Read the variable only when `!app.isPackaged`. | High | D6-03 |
| DEF-33 | Weak Design | Low | src/azureCredentials.ts:42; src/fetchOrder.ts:4-5; src/useAzureWorkspace.ts:54, 144, 270, 280; src/viewDefinitions.ts:27-33 | A connection with no role falls back to `time-tracking`, the role that writes and is shown in the menu. A role-less entry in `azure-views.json` becomes a Time Writing connection on every computer; Fetch All may use it as the Time Writing source, and it stops being shared through Git. | `role: role ?? 'time-tracking'`. | Fall back to `reference` (read-only, hidden) or reject the entry; require a role in `parseViews`. | Medium | D1-10, D2-11, D3-11 |
| DEF-34 | Weak Design | Low | src/myWork.ts:6; src/monthlyPack.ts:129; src/planningOverview.ts:18; src/pulseCheck.ts:28; src/queryView.ts:158; README.md:431 | "Finished" states differ: My Work adds removed / cut; Monthly pack, Planning Overview and Pulse Check use closed / done / completed / resolved; the query summary adds removed / cut / approved; README says Closed, Done or Completed. A Cut item is finished on one page and overdue on another. | Four different `new Set([...])` lists. | One shared, documented list. | Medium (Cut state on QMS-0025 not checked) | D2-20, D3-16 |
| DEF-35 | Weak Design | Low | src/dpBoardMatch.ts:49, 67, 78, 86; src/releaseSource.ts:366; src/components/ReleaseView.tsx:33, 44 (vs src/streams.ts:25) | The match threshold default 80 is a literal in about ten places beside `defaultMatchThreshold`; a change would not reach all. | `threshold = 80`; `options.threshold ?? 80`. | Use `defaultMatchThreshold` everywhere. | High | D2-18, D3-14, D4-14 |
| DEF-43 | Weak Design | Low | package.json:46-77 | electron-builder fuses are not set: RunAsNode on, `NODE_OPTIONS` and `--inspect` accepted, no asar integrity, app not forced to load from asar. Not in SECURITY-ASSESSMENT. | No `electronFuses` in `build`. | Turn those fuses off / on. | High (absent); impact not verified | D6-07 |
| DEF-45 | Weak Design | Low | electron/main.cjs:250-254 | No single-instance lock, so two copies can run on one profile (local storage, IndexedDB). | `requestSingleInstanceLock` never called. | Take the lock and focus the existing window. | Medium | D6-13 |
| DEF-47 | Weak Design | Low | src/history.ts:162-167 | An unreadable `history-hours.json` counts as no history; reports before the cut-off silently switch to Azure DevOps hours. | `try { raw = JSON.parse(textValue) } catch { return null }`. | Show "historical hours file unreadable". | High | D2-14 |
| DEF-48 | Weak Design | Low | src/myViews.ts:51-53; src/download.ts:30 | Excluding My views from backups fails open: if the profile list cannot be read, the set is empty and My views data goes into the JSON backup (SET-17). | `catch { return new Set<string>() }`. | Fail closed: drop sources that are not shared connections. | Low (trigger unlikely) | D2-15 |
| DEF-49 | Weak Design | Low | src/gitSnapshots.ts:16 | `sharedThroughGit` does not exclude My views; the only upload path is guarded (`useGitStorage.ts:394`, `profile.mine`), but the predicate (also used at App.tsx:100) still says "shared". | `Boolean(profile.baseUrl) && profile.role !== 'time-tracking'`. | Add `&& !profile.mine`. | High | D2-12 |
| DEF-50 | Weak Design | Low | src/monthlyPack.ts:141 | A finished item without Closed Date takes its close month from Changed Date, so a later edit moves it into a later month. CR-PB-08 still open (documented in PCK-04). | `isFinished(item) ? approvalMonthOf(item.changedDate, timeZone)`. | One closure definition with the dashboard, or "close date unknown". | High | D2-13 |
| DEF-51 | Weak Design | Low | src/history.ts:71-72 | Text dates in the history import are always day-month-year, undocumented (HIS-02). Excel date cells are not affected. Opposite to the Windchill rule (DEF-20). | **Proven by running:** `'05/01/2026'` → 2026-01; `'12/31/2026'` → no month. | Document it in HIS-02, or treat ambiguous text dates as rows to check. | High | D2-08 |
| DEF-54 | Weak Design | Low | src/capacity.ts:234-237, 247-252 | `excludedAccessRoles: ['People Manager']` and its comment say People Manager is left out of capacity; CAP-57 and `roleExclusion` use only the team role. Stale default still stored. | `defaultCapacityRoles = { …, excludedAccessRoles: ['People Manager'] }`. | Remove it and fix the comment. | High | D1-11 |
| DEF-55 | Weak Design | Low | src/azureInsights.ts:107, 120-121; src/dashboard.ts:113, 149; src/pages/BaselinesPage.tsx:31, 84; src/pages/PlanningOverviewPage.tsx:16, 63 | Defaults fixed in code instead of settings: absence Epic 37778 and 8 h a day in `azureInsights`; overrun factor 1.25 / "Over 25 % baseline" on two pages; `defaultBands` repeats 100 / 80; concentration gap of 10 points. (D5-19 rated the overrun part a Future Item.) | `epicOf(item)?.id === 37778`; `dayCount * 8`; `completedWork > originalEstimate * 1.25`. | Read from capacity settings and Insight thresholds. | High | D1-12, D5-19 |
| DEF-59 | Weak Design | Low | src/components/AzureConnections.tsx:38; src/pages/BaselinesPage.tsx:16 | Permission props default to full rights (`canManage = true`, `canEdit = true`); all current callers pass them, so this is latent. | `canManage = true, canManageStreams = canManage, canEnterCounts = canManage`. | Make them required or default `false`. | High | D4-13 |
| DEF-60 | Weak Design | Low | src/components/ReleaseFeatureEditor.tsx:7-9, 14-17 | The comment says the form is pre-filled with the Epic named like the stream; FeatureEditor always starts with Parent Epic blank (BKL-23). | `useState<AzureWorkItem \| null>(null)`. | Fix the comment; drop the unused matching. | High | D4-08 |
| DEF-62 | Weak Design | Low | src/pages/DashboardPage.tsx:89, 156, 562-564; src/App.tsx:411-412 | Profile picker and Lock figures use different gates (Dashboard: `capacity.periods`; Pulse Check: Admin role), while CAP-43/44 and the page text say "Admin". | `canLock={access.can('capacity.periods')}` vs `roles.includes('Admin')`. | One right; align texts and CAP-43/44. | High | D5-12 |
| DEF-68 | Weak Design | Low | src/pages/SnapshotsPage.tsx:59, 62 | CSV and JSON exports on Snapshots are not gated by `data.export` (Backlog Health and QE Mapping are); the JSON holds people, audits and every work item. | `onClick={() => exportStateJson(store.state)}`. | Apply the `data.export` gate. | High | D5-20 |
| DEF-72 | Weak Design | Low | src/rules.ts:1-48; docs/SOFTWARE-COMPONENTS.md:204 | `rules.ts` is imported nowhere in src or tests, yet listed as the component for period lock rules and the variance flag; its 25 % flag and local-clock lock checks look in force but are not (see OI-07). | `git grep` finds no importer; `Math.abs(variance) > 25`. | Remove or wire in; update SOFTWARE-COMPONENTS and OI-07. | High | D3-15 |
| DEF-73 | Weak Design | Low | src/featureSetup.ts:7, 43-45, 190-191, 246-249, 273-281; src/azureDevOps.ts:13 | Built-in PU / Full Release DoD texts and milestone stories are still defined and the comments say an Epic without a setup keeps them; DPF-09 retired them and they have no app caller. | "An Epic without a setup keeps the built-in PU / Full Release milestones." | Remove dead defaults; fix comments. | High | D2-10 |
| DEF-74 | Weak Design | Low | src/myWork.ts:293 | `monthsUntilTarget` caps at 24 months (BKL-32: no limit); only tests call it. | `max = 24`. | Remove it. | High | D2-19 |
| DEF-75 | Weak Design | Low | src/featureSetup.ts:109-117, 232 | Feature setup still reads, saves and returns the Time Writing story / Task assignee, Area Path and Iteration Path, which BKL-28 says are not used. | `cleanTask` / `cleanTimeWritingStory` keep them. | Drop on read and save, or mark unused. | Medium | D2-21 |
| DEF-76 | Weak Design | Low | docs/REQUIREMENTS-SPECIFICATION.md:266 (NAV-23); src/releaseSource.ts:328; src/dpBoardMatch.ts:8-10 | NAV-23 gives version weights 0.6 / 0.3; code and QV-29 use 0.25 / 0.1. The dpBoardMatch comment cites NAV-26, which has no weights. | `? 0.25 : found[0] === wanted[0] ? 0.1 : 0`. | Correct NAV-23. | High | D2-07 |
| DEF-79 | Weak Design | Low | scripts/swbom.mjs:86, 134; .github/workflows/build-and-deploy.yml:66 | The release commit runs `swbom.mjs` without installed packages; a new package silently gets licence "not recorded", and `--check` ignores licences. | `installedLicence(...) \|\| previous.get(...) \|\| 'not recorded …'`. | Fail `--check` on an unrecorded licence. | Medium | D6-11 |
| DEF-80 | Weak Design | Low | vite.config.ts:12-13; electron/desktop-update.cjs:40, 50 | Local builds use the Git commit count as build number, CI uses the run number; a self-built app may never, or always, be offered an update. | `Number(GITHUB_RUN_NUMBER) \|\| 0` → `git rev-list --count HEAD`. | Build number 0 for local builds, or mark them not updatable. | Medium | D6-14 |

## 4. Defaults register (merged)

One row per default, deduplicated across the six slices and ordered by area. "OK" means the value is safe and matches
the documents.

| Default | Value | Location | Documented as | Verdict |
|---|---|---|---|---|
| **Start-up and navigation** | | | | |
| Start view | Home tiles; classic = My dashboard | homeTiles.ts:30-31; App.tsx:206-207 | NAV-42/46, MYD-01 | OK |
| Get started pop-up | opens until dismissed | App.tsx:292-293 | NAV-41 | OK |
| Folded menu / collapsed headings | off / none | App.tsx:256, 260 | UI-16, NAV-37 | OK |
| Fallback page when none allowed | `admin` | App.tsx:234 | first allowed | OK |
| Admin page opened first | Streams (`connections`) | settingsTabs.ts:38 | ADM-01: Overview | Mismatch (DEF-69) |
| Theme | follows the OS | theme.ts:7, 22; index.css:22 | — | OK |
| Page usage counting | off, local only | usageCounts.ts:10, 15 | NAV-45 | OK |
| Initial app state | synthetic MVP seed | store.ts:20; seed.ts | — | Questionable (DEF-52) |
| Sample data | only via `?sample=1` or Load sample | App.tsx:215-221 | SMP | OK; leaks (DEF-01, DEF-08) |
| Start-up fetch | cloud connections with a PAT, read only, once; waits 10 s for Git | App.tsx:150-163; useAzureWorkspace.ts:418-429 | KB-38, FET-22 | OK |
| Duplicate connections at start | removed and Git rewritten, unasked | App.tsx:131-145 | NAV-30 (local only) | Not safe (DEF-18) |
| Clock refresh | 30 s | useNow.ts:4 | — | OK |
| Docs page | first document, then last chosen | DocsPage.tsx:263 | — | OK |
| **Time and month** | | | | |
| Header month | viewer's local month | App.tsx:211 | NAV-11 / glossary: India; QV-18: viewer | Mismatch (DEF-04) |
| Month of new month Tasks / ＋ Time Writing Task | current India month | azureDevOps.ts:109-111; monthTaskAction.ts:14 | not stated | Mixed zones (DEF-04) |
| Current / past Sprint | India date | azureRead.ts:39-52; myWork.ts:158-164 | ATM-08 | Mixed zones (DEF-04) |
| Feature-closure month (Insights) | India | azureInsights.ts:76-80 | README:431 | Mixed zones (DEF-04) |
| Pulse Check / release months | viewer's zone | pulseCheck.ts:38; releaseSource.ts:210-224 | QV-18; TEST-PLAN:877 says India | Mismatch (DEF-04) |
| Sample dataset month | India | useAzureWorkspace.ts:78 | — | Mixed zones (DEF-04) |
| My Tasks "missing" month | India | MyWorkPage.tsx:48 | — | Mixed zones (DEF-04) |
| Planning Overview Target month | raw UTC string | planningOverview.ts:27-29, 83-87 | QV-18 | Mismatch (DEF-04) |
| Release counts picker month | local today, not header month | AzureConnections.tsx:251 | REQ line 95 | Mismatch (DEF-04) |
| Windchill months | UTC wall clock | windchillReleases.ts:194, 207 | — | Mixed zones (DEF-04) |
| Date display | viewer's zone; '—' when missing | format.ts:7-21 | NAV-12 | OK |
| "Left the team on" | UTC today | AdminPage.tsx:354 | — | Wrong (DEF-61) |
| Backup file name date / release date | UTC | download.ts:30; release-changes.mjs:67 | — | OK |
| **Month locks** | | | | |
| Plan lock day | 5th of the month | planningLock.ts:12 | MON-21, README:42/429 | OK |
| Actuals lock day | 4th of next month | planningLock.ts:13 | MON-21, README:42; README:429 says 5th | README wrong (DEF-23) |
| Lock moment | end of day, viewer's local clock | planningLock.ts:18-25 | MON-06/07 | Mixed zones (DEF-04) |
| Reason for change | "Approved operational extension" | AdminPage.tsx:58 | MON-23: optional | Wrong (DEF-14) |
| **Access and permissions** | | | | |
| Access with no `access.json` | every right | access.ts:158-159; AccessPanel.tsx:64, 66 | CON-43, LIM-07 | Documented; opens everything (DEF-09) |
| Access while loading / on read error (new browser) | every right | useAccess.ts:30-40 | not stated | Fail-open (DEF-09) |
| Access cache when Git is disconnected | last policy kept | useAccess.ts:10-12, 40 | README:324 "nothing restricted" | Doc mismatch (DEF-09) |
| Azure write guard before policy | allow all | azureClient.ts:146 | — | Fail-open (DEF-09) |
| `useCan` with no provider | allow all | useCan.ts:7 | — | Latent fail-open (DEF-09) |
| Tool Owner missing from file | every right | access.ts:146 | CON-93 | Documented |
| Policy default role | Team Member, with all work writes | access.ts:82-94 | CON-94 | Wider than needed (DEF-36) |
| New member's role | "Everyone else" role, else Team Member | AccessPanel.tsx:41 | — | OK |
| Edit form right | `work.edit` only | azureClient.ts:155 | CON-94 | Bypass (DEF-06) |
| Old Calculation edits | `layout.defaults` | DashboardPage.tsx:184 | CAP-36/37 | Too broad (DEF-26) |
| Lock figures / profile picker | `capacity.periods` vs Admin role | DashboardPage.tsx:89; App.tsx:411-412 | CAP-43/44 "Admin" | Inconsistent (DEF-62) |
| Snapshot exports | no right check | SnapshotsPage.tsx:59, 62 | — | Weak (DEF-68) |
| Component permission props | `canManage = true`, `canEdit = true` | AzureConnections.tsx:38; BaselinesPage.tsx:16 | — | Latent (DEF-59) |
| View as | page load only, read-only guard; person / Team Member | viewAs.ts:7, 36-41; ViewAsDialog.tsx:8-10 | CON-89…92 | OK |
| Work email | none until set; never from Git | workEmail.ts:23-31 | CON-80/82 | OK |
| **Connections and Azure DevOps reads** | | | | |
| Missing connection role | `time-tracking` (write role) | azureCredentials.ts:42; fetchOrder.ts:4-5; useAzureWorkspace.ts:54, 270, 280 | — | Unsafe (DEF-33) |
| New connection role | Time Writing if none exists, else Reference | AzureConnections.tsx:33, 253 | — | OK |
| Show in menu | on for Time Writing and backlog views | azureCredentials.ts:110-111 | CON | OK |
| Connection presets | 7 team connections with internal hosts | connectionPresets.ts:12-20 | CON | Internal hosts in bundle (DEF-39) |
| Initial project / team | Time Writing preset | useAzureWorkspace.ts:16, 47 | preset | OK |
| Query for reference / documents with none | whole project, not Removed | releaseSource.ts:139 | — | Broad (DEF-71) |
| Default release query | `State = 'Approved'` | releaseSource.ts:138 | — | OK |
| api-version | 7.1 → 6.0 → 5.0; comments 7.1-preview.4 | azureClient.ts:29, 111, 137-141; azure-devops.cjs:19, 178 | DSK-05 | OK |
| Request timeout (Azure) | 45 s (web and desktop) | azureClient.ts:117; azure-devops.cjs:208 | NFR-03 | OK |
| WIQL `$top` / team members / comments | 1000 (20,000 links) / 1000 / 200 | azureClient.ts:114, 194; azure-devops.cjs:32, 41 | — | OK; cut-off shown in UI not verified |
| Item and link limits | 50,000 fetch ("trial" wording); 20,000 query | azureRead.ts:121, 154; releaseSource.ts:137, 140 | — | OK |
| Batch size / ancestor depth | 200 / 10 | releaseSource.ts:176, 191 | — | OK |
| Approval date field | auto-detect unless set; setting used only by release sources | releaseSource.ts:20, 129-132 | GIT-14 | Not applied everywhere (DEF-25) |
| Empty fetch result | kept as preview, never replaces cache | useAzureWorkspace.ts:444-451 | — | OK |
| Time Writing backlog | QMS-0025 | backlogViews.ts:15 | NAV, README | OK |
| Backlog state filter / "Assigned to me" / page size | New + Active / on per visit / 200 | AzureWorkItemTree.tsx:28, 42; BacklogTable.tsx:13 | README:455, BKL-21 | OK |
| **Azure DevOps writes and creation** | | | | |
| Write hosts | dev.azure.com only (web and desktop) | azure-devops.cjs:14-18 | LIM-02, DSK-04 | OK |
| Sample write guard | every write refused while sample loaded | azureClient.ts:149 | SMP-05 | OK |
| Edit form assignee | current, else me | WorkItemEditor.tsx:92 | BKL-20 | Wrong (DEF-05) |
| Edit concurrency | `test /rev` first | workItemEdit.ts:56 | — | OK |
| Edit states / hours range | Task New/Active/Closed (+ Resolved others) / 0–1,000,000 | workItemEdit.ts:25, 28 | — | OK |
| Default hours on new month Task | setup estimate / Content 4 h, also when ad-hoc | azureDevOps.ts:306-307, 404-405; contentBulk.ts:12 | CNB-01 | Bug (DEF-07) |
| Bulk PI / Sprint | first pair; future pairs if none current | Dp/Iocc/ContentBulkCreate | CNB-02 | Risky (DEF-17) |
| New Feature / Story Sprint | preselected only when exactly one | FeatureEditor.tsx:132-134; StoryEditor.tsx:52-54 | BKL-27 | OK |
| New Feature Parent Epic | blank (My Tasks / Time Writing pick differently) | FeatureEditor.tsx:34; MyWorkPage.tsx:44; MyActivitiesPage.tsx:455 | BKL-23 | Inconsistent (DEF-64) |
| QE email in bulk | first board item with the same name | dpBulk.ts:106-111 | DPF-02/04 | Unsafe on duplicates (DEF-24) |
| Possible QEs | at most 5 | dpBulk.ts:99 | DPF-03 | OK |
| Bulk creation Epics | DP 13946, Content 22919, IOCC none | bulkEpics.ts:7 | QV-59 | OK |
| Content bulk DoD | "All Documents are approved" | contentBulk.ts:12 | CNB-01 | OK |
| Review of Deliverables story | on | azureDevOps.ts:443, 470, 526 | — | OK |
| Complete children | on per Epic; none ticked on New Feature | featureSetup.ts:306; FeatureEditor.tsx:107 | BKL-38 | OK |
| Built-in PU / Release DoD and milestones | defined, unused | featureSetup.ts:43-45 | DPF-09: none | Dead (DEF-73) |
| Feature setup story paths / assignee | still stored | featureSetup.ts:109-117 | BKL-28: not used | Stale (DEF-75) |
| Task / story title templates | `{month} \| {feature}`, `{feature} - Time Writing` | featureSetup.ts:37, 41 | BKL-28 | OK |
| User Story Priority / Value area / Risk | 2 / Business / not set | StoryEditor.tsx:29-31 | "Azure defaults" | OK (not checked on QMS-0025) |
| Close dialog ticks | own items plus the one clicked | closeList.ts:35-40; CloseItemsDialog.tsx:10 | BKL-39 | OK |
| Feature Active with its story | on, unasked | closeChain.ts:7-12 | ATM-28 | OK (documented) |
| Sprint check | Both states / first current pair / all ticked | SprintCheckPage.tsx:47-49, 118 | ATM-07…09 | OK |
| Time Writing page | add Time Writing task; none ticked; Sprint only if exactly one current | MyActivitiesPage.tsx:47-113 | ACT-03, ACT-09, ACT-17 | OK (comment wrong, DEF-66) |
| Background job list | 20, running jobs included | backgroundJobs.ts:26 | — | Bug (DEF-53) |
| **Capacity** | | | | |
| Absence Epic / hours per day | 37778 / 8 (fixed copies in azureInsights) | capacity.ts:59; azureInsights.ts:120-121 | SET-02, CAP-02 | Duplicated (DEF-55) |
| Overloaded at / has capacity below | 100 % / 80 % | capacity.ts:59; dashboard.ts:113 | SET-02, CAP | Duplicated; `>` vs `>=` (DEF-10) |
| Invalid capacity value / pair | silently replaced by default | capacity.ts:151, 170 | SET-03, OI-05 | Open (DEF-11) |
| NPRA maximum / standard hours | 20 h / 32 h | capacity.ts:30, 59 | CAP-13, CAP-36 | OK |
| Default Joined on | 2026-05-01 | capacity.ts:59, 148 | CAP-15 | Clashes with history (DEF-15) |
| Shared-time Task without hours | one working day | capacity.ts:316 | comment | OK |
| Shared-time mapping | Common activity, Everyone | SharedTimePanel.tsx:17-18 | CAP-10: none | Risky (DEF-56) |
| Capacity roles left out | Lead, Manager (+ unused People Manager) | capacity.ts:237; CapacityRolesPanel.tsx:8 | CAP-57 | Stale (DEF-54) |
| Regions | India, Netherlands, US | capacity.ts:64 | CAP | OK |
| Calculation profile | Current (v4); Fixed starts at 160 h | calculationProfiles.ts:85, 97-99; CalculationProfilesPanel.tsx:81 | CAP-41 | OK |
| Figure locks kept | last 5 per month, 500 people | calculationProfiles.ts:283, 288 | CAP-43 | OK |
| Bucket rule words | built-in list; used when list empty (warned) | bucketRules.ts:11-14; BucketRulesPanel.tsx:38 | CAP-46 | OK |
| Insight thresholds | 10/15/20, 3/20/8, 80/90, 50/8/3, 75/50, 3, 20 | insightThresholds.ts:12-18 | CAP-47 | OK; four texts show raw code (UX-13) |
| Concentration gap / overrun flag | 10 points / +25 % (fixed) | dashboard.ts:149; BaselinesPage.tsx:31; PlanningOverviewPage.tsx:16 | — | Not configurable (DEF-55) |
| Overview windows / baseline flag | 12 / 6 months; > 25 % | planningOverview.ts:41, 68, 80 | OVW-04/05/07 | OK |
| Formula limit / missing figure | 1000 chars / blank | formula.ts:18, 54 | CAP-55 | IF / ROUND break it (DEF-22) |
| Team filter | no region, no roles | usePersonScope.ts:23-28; TeamFilterBar.tsx | — | OK |
| **Baselines** | | | | |
| Baseline rules when none saved | example (placeholder) rules | baseline.ts:15-19, 27 | README "illustrative"; BAS-10; OI-12 | Should not be live (DEF-16) |
| Driver / new rule | documents, 1 unit per driver; 0 h | baseline.ts:39; BaselineRulesEditor.tsx:8 | BAS-09 | OK |
| Variance flag (`rules.ts`) | > 25 % | rules.ts:42 | OI-07 | Dead code (DEF-72) |
| **History import** | | | | |
| Cut-off | 2026-10 | history.ts:12 | HIS-03 | OK |
| Row / hours / file limits | 20,000 rows; 0–1000 h; 30 MB | history.ts:13, 35; HistoryPanel.tsx:41 | HIS-04 | Out of range shown as "no hours" (DEF-21) |
| Text date order | day-month-year | history.ts:71 | not documented | DEF-51 |
| Unreadable history file | treated as no history | history.ts:165-167 | HIS-04 | Silent (DEF-47) |
| Conflict on save | writes over the newer file | useHistory.ts:33-35 | HIS-04 silent | DEF-19 |
| **Release matching and sources** | | | | |
| Fuzzy match threshold | 80 % (constant + ~10 literals); range 1–100 | streams.ts:25; dpBoardMatch.ts; releaseSource.ts:48, 366 | QV-29/39/46, NAV-23 | Right value; duplicated (DEF-35); saved per keystroke (DEF-57) |
| Version weights | exact 1, major.minor 0.25, major 0.1 | releaseSource.ts:328 | QV-29; NAV-23 says 0.6 / 0.3 | Docs disagree (DEF-76) |
| Default streams | DP, CP, IOCC, Content, Tool Validations, S&S IT, ECP | streams.ts:15-24 | NAV-22, CON-83 | OK |
| Entered counts / Feature Epics | 0–10,000, 240 months / ≤100 IDs, 30 streams | releaseSource.ts:52-83 | QV-57/58 | OK |
| Finished states | four different lists | myWork.ts:6; monthlyPack.ts:129; planningOverview.ts:18; pulseCheck.ts:28; queryView.ts:158 | README:431 | Inconsistent (DEF-34) |
| Closed month without Closed Date | Changed Date | monthlyPack.ts:141 | PCK-04 | CR-PB-08 open (DEF-50) |
| Month cache | 200,000 then cleared | releaseSource.ts:225 | KB-27 | OK |
| IOCC grouping / release tab | Type of Release / Releases | ReleaseView.tsx:46; ResultTabs.tsx:7 | QV-37, QV-47 | OK |
| Months ahead to Target | max 24 (dead code) | myWork.ts:293 | BKL-32: no limit | Dead (DEF-74) |
| **Windchill** | | | | |
| Settings | host empty, `/Windchill/servlet/odata`, SSO | windchill.ts:6 | info text | OK |
| Limits | 20,000 rows, 100 pages, tab wait 10 min, sign-in window 10 min | windchillBrowser.ts:44-47; useWindchill.ts:68; main.cjs:110, 178 | CON-28/30 | OK |
| Ambiguous slashed date | month/day | windchillReleases.ts:153 | CON-71 | Risky (DEF-20) |
| Source / ECP level / scope | Location column else names / 2nd folder / header month | windchillReleases.ts:165; streams.ts:83; WindchillReleasesPanel.tsx:38 | CON-71/72/73/87 | OK (empty text wrong, DEF-65) |
| Push to Git | only when changed; no write check | useGitStorage.ts:449-463 | — | Minor (DEF-70) |
| **Monthly pack and KPI tracker** | | | | |
| Overall status | On Track (green) | monthlyPack.ts:285; pptxTemplate.ts:134; MonthlyPackPanel.tsx:127 | PCK-08 | Positive default (DEF-12) |
| Lines / KPIs / capabilities label | 7 / 6 / "Capabilities (Projects & Services)" | monthlyPack.ts:25, 65-84 | PCK-02, PCK-11 | OK |
| Template size / file properties | 10 MB / creator cleared, others kept | pptxTemplate.ts:16, 207-218 | PCK-08 | Partly cleared (DEF-77) |
| KPI tracker limits | 20 sheets, 2,000 rows, 100 cols, 1,000 chars | kpiTracker.ts:8 | KPT-03 | OK |
| KPI read copy to Git | every read, automatic | kpiTracker.ts:3-5 | KPT-03 | DEF-78 |
| KPI reader / lockedBy when unknown | "Admin" | App.tsx:415; DashboardPage.tsx:92 | — | Wrong (DEF-13) |
| **Git storage and sharing** | | | | |
| Default repository | personal account / DemandPlanningStorage, `main`, `planning-data.json` | gitStorage.ts:28-30 | GIT-13 | Documented; personal owner (DEF-38) |
| Remember Git token | ticked; always in Get started | GitStorage.tsx:14; App.tsx:404 | GIT-02 (opt-in) | Mismatch (DEF-37) |
| Token right asked on connect | Contents: Read and write | useGitStorage.ts:120 | guide: Read suffices | Too wide (DEF-41) |
| Load with unsaved changes | ask first (PR #343) | gitStorage.ts:234-236; GitStorage.tsx:20, 22 | GIT-16 | OK |
| Write-check probe | empty PUT | gitStorage.ts:102 | TC-CON-18 | OK |
| Git history / removed connections search | 30 (max 100) | gitStorage.ts:130; useGitStorage.ts:174 | CON-99 | OK |
| Git watch | every 5 min; on focus at most once a minute | gitWatch.ts:8-10 | GIT-15 | OK |
| Conflict policy | refuse (access, setups, QE) / overwrite (history, views defaults, KPI, template, backups) | useGitStorage.ts:201, 263, 322, 353 | — | Inconsistent (DEF-19) |
| On-prem snapshot push | every fetch, also unchanged | useGitStorage.ts:382-410 | — | Noisy (DEF-70) |
| My views to Git | blocked at upload; predicate says "shared" | useGitStorage.ts:394; gitSnapshots.ts:16 | SET-17 | Caller-only guard (DEF-49) |
| My views in backups | excluded; fails open on read error | myViews.ts:51-53 | SET-17 | DEF-48 |
| Personal views / defaults | per email; 1.5 s push, one retry; "default for everyone" unconfirmed | usePersonalViews.ts:47, 55, 70-73 | MYD-09 | DEF-28 |
| Table defaults reset | one click, no confirm | TableDefaultsPanel.tsx:41 | — | DEF-67 |
| Audit actor | `u-owner` always | store.ts:99 and 29 more | MON-23 "who"; REQ:38 out of scope | DEF-13 |
| **SharePoint and snapshots** | | | | |
| SharePoint config | site, file path, tenant `organizations` | sharepoint.ts:15-21, 41 | README:493 | Tenant fallback broad (DEF-40) |
| Graph scopes | User.Read, Sites.ReadWrite.All | sharepoint.ts:30 | PT-13 | Too wide (DEF-40) |
| MSAL cache | sessionStorage | sharepoint.ts:42 | SNP-01 | OK |
| Autosave | 900 ms after each change, also in sample mode | store.ts:66-83 | SNP-02 | Unsafe (DEF-01) |
| First write | no precondition | sharepoint.ts:67-72 | — | Unsafe (DEF-02) |
| Browser save delay / IndexedDB open timeout | 200 ms / 15 s | store.ts:49-56; browserState.ts:39 | — | OK |
| Snapshot content | whitelist without capacity, profiles, rules, scopes | cloudSnapshots.ts:15 | card says "capacity"; OI-04 | Wrong text (DEF-27) |
| Snapshot size limit | 200 MB | cloudSnapshots.ts:24 | — | OK |
| **Tables, charts and UI** | | | | |
| Table design | resize, reorder, choose columns, wrap and density toggles on; xlsx + csv; Comfortable; no wrap; yyyy-mm-dd hh:mm | tableDefaults.ts:24 | UI-12 | OK |
| Chart data labels | off unless set | tableDefaults.ts:24; chartLabels.ts:14 | UI-17 | OK |
| Pareto line / chart width / Epic colours | 80 % / 640 px / 5 | chartUtils.ts:32, 51, 70 | UI | OK |
| Rows drawn | Query view 500; DataTable all; source details 100 | QueryView.tsx:59; DataTable.tsx:69; BoardPage.tsx:56 | QV-10 | OK |
| Lists cut short | Gaps 60, rows to check 500, History 200 | GapsPanel.tsx:12-14; HistoryPanel.tsx:159; AdminPage.tsx:390 | — | Silent cut (DEF-58) |
| Modal outside click | does not close forms | ui.tsx:372 | UI-19 | OK |
| Backlog table background | `white` | App.css:19 | — | Dark mode bug (UX-02) |
| Desktop zoom | Auto on, 67–100 %; manual 50–200 %; invalid → 1 | desktopZoom.ts:4-8; main.cjs:204 | UI-14 | OK |
| CSV formula guard | prefix `'` | csv.ts:4-6 | SEC | OK |
| xlsx limits | 100 MB inflate; 5,000,000 cells | xlsx.ts:13, 131 | KB-04 | OK |
| QE Mapping limits / page size | 900,000 bytes; 120 / 32,000 chars; 300 rows, 4 group levels | qeMapping.ts:13, 49, 107; QeMappingPage.tsx:18-19 | QEM | OK |
| Signed by me period | last 12 months | SignedByMe.tsx:17 | MYD-13 | OK |
| Dashboard / Pulse Check start | Overview, quarter of header month / Releases, Month | DashboardPage.tsx:43; PulseCheckPage.tsx:43-51 | MYD, QV-32/50 | OK |
| **Desktop (Electron)** | | | | |
| Window webPreferences | context isolation, sandbox, no Node, all windows | main.cjs:95, 163, 224-229 | DSK-02, SM-18 | OK |
| Permission handler | none (all granted) | main.cjs | PT-09 | Unsafe (DEF-29) |
| Sign-in navigation | any https host | main.cjs:89-100, 157-168 | PT-09 | Too open (DEF-29) |
| Window size / minimum | 1440×920 / 1024×700 | main.cjs:218-221 | NFR-06 | OK |
| New windows | denied; https opened in system browser | main.cjs:236-239 | DSK-02 | OK |
| Dev server URL | honoured in installed builds | main.cjs:12, 242 | — | Unsafe (DEF-30) |
| Read hosts with PAT | any https host | azure-devops.cjs:3-11 | PT-10 | Too broad (DEF-42) |
| Azure redirects | refused | azure-devops.cjs:208, 221 | DSK-06 | OK |
| PAT in error text | removed | azure-devops.cjs:227, 232 | NFR-05 | OK |
| Windchill / SharePoint / update timeouts | none | windchill.cjs; sharepoint-file.cjs; desktop-update.cjs | NFR-03 | DEF-44 |
| SharePoint file limit | 20 MB, GET only, .xlsx under /sites or /teams | sharepoint-file.cjs:6, 18-19 | KPT-02 | OK |
| NTLM sign-on | configured Windchill / SharePoint host only | main.cjs:66, 140 | — | OK |
| Update source / check | fixed `desktop-latest`; size + SHA-256; no signature; 5 s after start, then 4 h | desktop-update.cjs:9, 60-69; BuildStatus.tsx:34 | DSK-07/08/10, R-06 | OK as documented |
| Installed build number if missing / local build number | 0 / commit count | desktop-update.cjs:30; vite.config.ts:12-13 | — | Local inconsistent (DEF-80) |
| Single instance | not enforced | main.cjs:250-254 | — | DEF-45 |
| Electron fuses | not set | package.json:46-77 | — | DEF-43 |
| Installer | NSIS wizard, per user, app data kept on uninstall, unsigned | package.json:57-66 | README:104, LIM-05 | Uninstall not documented (DEF-46) |
| Content-Security-Policy | self / file:, connect any https, frame Microsoft login | vite.config.ts:20-32 | NFR-09 | OK; KB-59 open |
| **CI and release** | | | | |
| Triggers / cancel | push main and tags, PR, manual / cancel on PRs only | build-and-deploy.yml:3-19 | CI-01…12 | OK |
| Token permissions | read; write only for release-commit and publish | build-and-deploy.yml:11-12 and jobs | CI-07 | OK |
| Promotion gates | macOS on no tests; Windows and Pages without E2E | build-and-deploy.yml:369-372, 412-415, 502-505 | CI-03/04/10, CR-P1-08 | Unsafe (DEF-03) |
| macOS build | not on pull requests | build-and-deploy.yml:317 | CI-02: every PR | Requirement mismatch (DEF-83) |
| Build revision | `GITHUB_SHA` | vite.config.ts:9; desktop-manifest.cjs:32 | CONFIGURATION-MANAGEMENT:28 | Wrong commit (DEF-31) |
| Dependency updates | Dependabot for Actions only, weekly | dependabot.yml | "daily check" | npm not covered (DEF-32) |
| SWBOM licence fallback | "not recorded" | swbom.mjs:86 | CI-08 | Silent (DEF-79) |
| PR number in release entry | omitted when not found | release-changes.mjs:44, 48 | CI-09: always | Silent (DEF-81) |
| Version bump / retries / artifact retention | highest bump / 3 / 30 days | release-changes.mjs:35-42; build-and-deploy.yml:63, 161 | CI-09/11 | OK |
| Traceability `--check` | passes a stale matrix unless strict (CI sets it) | traceability.mjs:194-195 | CLAUDE.md | OK |
| Documentation page | 18 fixed `docs/*.md` | src/docs/index.ts:23-42 | CLAUDE.md | OK |

## 5. Re-checks of KNOWN-ISSUES and CODE-REVIEW-BACKLOG

| Entry | Register says | Code at 56ac8e3 | Result |
|---|---|---|---|
| CR-P1-02 / CR-PB-01 | open | default hours still written on ad-hoc Tasks | **Still open** (DEF-07) |
| CR-P1-03 / CR-PB-02 | open | Edit form still needs only `work.edit` | **Still open** (DEF-06) |
| CR-P1-04 / CR-PB-03 | open | upload refused for `profile.mine` (useGitStorage.ts:394); predicate unchanged | **Fixed at the boundary**; residual DEF-49 |
| CR-P1-05 / CR-PB-04 | open | autosave has no sample check | **Still open** (DEF-01) |
| CR-P1-06 | open | first PUT has no precondition | **Still open** (DEF-02) |
| CR-P1-07 / CR-PB-05 | open | not checked by this role | Not re-checked |
| CR-P1-08 / CR-PB-06 | open | publish jobs still not gated on tests | **Still open** (DEF-03) |
| CR-PB-07 | open (5th vs 4th; local time) | code and MON-21 say the 4th; only README:429 says 5th; lock still client-local | Day: **code right, README wrong** (DEF-23). Time zone: **still open** (DEF-04) |
| CR-PB-08 | open | Changed Date fallback remains | **Still open** (DEF-50) |
| OI-04 | open | snapshot whitelist unchanged | **Still open**; card text overstates (DEF-27) |
| OI-05 | open | silent reset to defaults | **Still open** (DEF-11) |
| OI-07 | open (decision) | `isVarianceFlagged` exists only in `rules.ts`, which nothing imports | **Contradicts the entry's premise**: the "older rule" is not in force (DEF-72) |
| OI-09 | closed (PR #322) | reset asks and is audited, but actor is `u-owner` | **Closed, overstated**: "who" is not recorded (DEF-13) |
| OI-11 | **Open** (KNOWN-ISSUES.md:101; DFMEA.md:193) | `confirmReplace(git.dirty, …)` before every Git load (GitStorage.tsx:20, 22), added by PR #343 as GIT-16 / KB-63 | **Fixed in the code, still open in the documents** — close OI-11 with a pointer to KB-63 and update the DFMEA open-actions list (D4-05; UX-03) |
| OI-12 | open | example values still offered and used as default | **Still open**; related DEF-16 |
| KB-53 | reopened | hints still point to four places | **Still holds** (DEF-63) |
| KB-63 | fixed (PR #343) | confirmation present | **Confirmed fixed** |
| KB-43 | — | bullets still anchored to line index (MonthlyPackPanel.tsx:109-112) | **Still present** |
| KB-03, KB-04, KB-05, KB-27 | accepted / fixed limits | linear `htmlToText`, xlsx caps, row filter, caches present | **Still hold** |
| KB-08 / PT-03, PT-02 | fixed | actions pinned to SHAs; read-only job tokens | **Confirmed fixed** |
| KB-26 | — | old email not visible in current AdminPage.tsx | Not visible at HEAD |
| KB-59 | open | not run on desktop | Not re-checked at runtime |
| PT-09 / R-09 | open | no permission handler; SharePoint window also open | **Still open, wider than recorded** (DEF-29) |
| PT-10 / R-10 | open | any https host gets the PAT | **Still open** (DEF-42) |
| PT-13 / R-12 | open | scope unchanged; cited line moved 29 → 30 | **Still open**; fix the line (DEF-40) |
| PT-16 / LIM-07 | accepted | fail-open on load / read error not covered; cites `azureDevOps.ts:630` (now `addComment`) | **Accepted part holds; location wrong; load / error case undocumented** (DEF-09) |
| R-06 / LIM-05 | accepted | installers still unsigned | **Still accepted** |

## 6. Not covered

- **Runtime:** no browser, desktop app, SharePoint session, Save to Git or CI run. DEF-01, DEF-02 and DEF-08 were traced
  in the code only; Electron permission grants, fuses, two instances and KB-59 were not tried.
- **Checks:** `pnpm test`, `npx tsc -b`, `pnpm lint` and E2E were not run.
- **Live data:** how Azure DevOps stores Target Date midnight for India users (DEF-04), whether QMS-0025 has a Cut state
  (DEF-34), whether Priority 2 / Business are the process defaults, whether a role-less entry exists in the live
  `azure-views.json` (DEF-33), and overlapping PI / Sprint branches against real iterations (DEF-17).
- **Outside the repository:** whether the web bundle and repository are public (DEF-39); whether a daily dependency
  check runs elsewhere (DEF-32); whether `Sites.Selected` is possible in the tenant (DEF-40).
- **Not judged by this role:** CSS layout and contrast (UI/UX role); the business acceptability of India time or
  month/day dates (owner decisions, §2); CR-P1-07 / CR-PB-05 (Feature closure traversal).
- **Partly read:** `theme.ts` past line 21 was read by D3 in full, but D4 did not re-read it for its own register.

## 7. Coverage by slice

| Slice | Files | Lines | Read in full | Findings |
|---|---|---|---|---|
| D1 core logic (App … domain) | 36 | 5,269 | all | DEF-04, 06, 07, 09, 10, 11, 13, 15, 16, 18, 33, 36, 39, 53, 54, 55 |
| D2 core logic (download … pptxTemplate) | 40 | 4,881 | all | DEF-04, 12, 21, 22, 23, 24, 33, 34, 35, 38, 47, 48, 49, 50, 51, 73, 74, 75, 76, 77, 78 |
| D3 core logic (pulseCheck … xlsx) | 48 | 5,074 | all | DEF-01, 02, 04, 08, 09, 13, 19, 20, 25, 33, 34, 35, 40, 41, 52, 69, 70, 71, 72 |
| D4 components and pages A | 65 | 4,612 | all | DEF-04, 09, 12, 13, 17, 28, 35, 37, 56, 57, 58, 59, 60 |
| D5 components and pages B | 36 | 4,533 | all | DEF-04, 05, 10, 11, 13, 14, 15, 26, 27, 55, 61, 62, 63, 64, 65, 66, 67, 68 |
| D6 desktop, scripts, CI | 15 (+6 config) | 1,807 | all | DEF-03, 29, 30, 31, 32, 42, 43, 44, 45, 46, 79, 80, 81, 82, 83, 84, 85 |
| **Total** | **240 (+6)** | **26,176** | **all** | **85** |

## 8. Method notes

- Severities follow `docs/reviews/README.md`. The lead kept each reviewer's severity; for merged rows the highest was
  kept. DEF-05, DEF-06 and DEF-07 are wrong single-field writes to Azure DevOps; the rubric would allow Critical, but
  they are visible in the item history and reversible, so the reviewers' High is kept. The two Critical findings can
  replace the whole shared SharePoint file.
- Where a reviewer saw a documented default as unsafe, the row says "Documented" in the register and stays a finding;
  documentation does not make a default safe.

## 9. Dropped or changed at merge

| Source | Change | Reason |
|---|---|---|
| D1-17 | Not numbered; kept in the register | Same as UI/UX **UX-02** (dark-mode white table background); the reviewer listed it only once |
| D5-09 | Not numbered | Same as UI/UX **UX-13** (raw `{T(bands)…}` text) and **UX-27** (hard-coded "3 consecutive") |
| D4-05 | Moved to re-checks (§5, OI-11) | Not a code defect: OI-11 is fixed by PR #343 (GIT-16, KB-63) but still Open in KNOWN-ISSUES and DFMEA |
| D4-11 | Location kept at AzureConnections.tsx:227 | Confirmed: the threshold input shares line 227 with the share button |
| D1-01 | Location widened to azureClient.ts:152-160 | Line 155 holds the case; the function spans 152-160 |
| D5-19 | Merged into DEF-55 (Weak Design) | Same hard-coded +25 % overrun as D1-12; category of the merged row is Weak Design |
| D5-14 | Merged into DEF-15 | Same default (Default Joined on) as D1-06 |
| D4-13, D3-20 | D3-20 merged into DEF-09; D4-13 kept as DEF-59 | D3-20 is a fail-open access default; D4-13 is a component prop default |
| — | Nothing dropped for lack of evidence | Every cited location was found at 56ac8e3 |
