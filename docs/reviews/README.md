# Independent review

An independent review of the code by a separate team of read-only Claude Code agents, each in one discrete role. It is
apart from the change team of [DEVELOPMENT-PROCESS.md](../DEVELOPMENT-PROCESS.md) §4: the reviewers build nothing, edit
no code and judge the code as it is, not as the documents say it is.

| Agent (`.claude/agents/`) | Role | Looks at | Finding IDs |
|---|---|---|---|
| `review-lead` | Plans the review, splits the code into module slices, merges, de-duplicates and ranks the findings, writes the report | everything | — |
| `review-developer` | **Developer** — does each function do what it must, for every input? | logic, edge cases, error handling, async order and races, data integrity, write paths | DEV-nn |
| `review-tester` | **Tester** — what is not proven? | untested functions and branches, tests that cannot fail, missing negative / boundary / E2E cases, flaky waits | TST-nn |
| `review-peer` | **Peer review** — could a new team member safely change it? | readability, naming, size and complexity, duplication, dead code, coupling, comments that disagree with the code | PEER-nn |
| `review-code` | **Code review** — standards, safety and performance | types and casts, lint, security (injection, XSS, secrets, trust boundaries), performance, memory, dependencies, build and CI | CR-nn |
| `review-uiux` | **UI/UX** — can people use it, and does every page look the same way? | accessibility (roles, labels, keyboard, focus, contrast), layout and overflow, responsive, empty / loading / error states, wording; **UI defaults** (pre-ticked, pre-filled, pre-selected, first tab, default sort and filters) and **uniformity** against [UI-STANDARDS.md](../UI-STANDARDS.md) | UX-nn |
| `review-defaults` | **Design defaults** — are the defaults right and safe? | default values and switches, fallbacks, time zones, limits, first-run behaviour, defaults in code vs in the documents | DEF-nn |

## Method

1. **Lead** lists every source file (`git ls-files src electron scripts .github`), groups them into module slices of a
   size one reviewer can read in full, and hands each role the slices in its scope (UI/UX: components, pages, CSS;
   Tester: the slices with their tests; the others: all slices).
2. **Each role** reads every line of its slices — no sampling — and reports findings only in the format below.
3. **Lead** merges the reports, removes duplicates (keeping every role that found the item), checks that each finding
   cites a real location, ranks them and writes `docs/reviews/<YYYY-MM-DD>-independent-review.md`.

Agents do not start other agents: the person running the review (or the main Claude Code session) runs the lead, then
each role on its slices, then the lead again to merge.

## Finding format

One table row per finding:

| ID | Category | Severity | Location | Finding | Evidence | Recommendation | Confidence |
|---|---|---|---|---|---|---|---|

- **Category** — exactly one of: **Bug** (wrong behaviour that can happen), **Open Item** (unfinished or unresolved:
  TODOs, half-built paths, decisions not made), **Future Item** (not needed now, worth planning), **Improvement**
  (works, could be clearly better), **Weak Design** (structure that makes bugs likely or change costly).
- **Severity** — Critical (data loss, wrong writes to Azure DevOps or shared storage, security), High (wrong results
  users rely on), Medium (works around, visible), Low (cosmetic, internal).
- **Location** — `path:line` (or `path:line-line`), always.
- **Evidence** — the code that shows it (quoted briefly) and, for a Bug, the input or sequence that triggers it.
- **Confidence** — High (traced and certain), Medium (likely, one assumption), Low (suspected; say what would confirm it).

## Independence rules

- **Unbiased.** Judge the code, not its comments, requirement IDs, test names or release notes; a comment that disagrees
  with the code is itself a finding. Existing entries in `KNOWN-ISSUES.md` and `CODE-REVIEW-BACKLOG.md` are checked
  again, never assumed fixed or still open.
- **Every line.** Read whole files; report "read in full" per file so gaps are visible.
- **Evidence or nothing.** No finding without a location and evidence; say "not verified" rather than guess.
- **Read only.** Reviewers never edit code, documents or settings, never write to Azure DevOps, Git storage or
  SharePoint, and never print secrets; commands are limited to reading (`git`, `grep`, running the existing tests).
- **No softening.** Severity follows impact, not effort or who wrote it.

## Reports

| Date | Scope | Report |
|---|---|---|
| 2026-11-23 | UI/UX role only, all components, pages and styles (4 slices, 106 files) | [2026-11-23-ui-ux-review.md](2026-11-23-ui-ux-review.md) |
| 2026-11-23 | Design defaults role only, all source, scripts, CI and build settings (6 slices) | [2026-11-23-design-defaults-review.md](2026-11-23-design-defaults-review.md) |
| 2026-11-26 | Admin area: all six reviewer roles on the planned slices, some role × slice pairs not run (5 slices, 83 files; 9 reports, 259 findings merged into 157), with a clean-up proposal per Admin page | [2026-11-26-admin-independent-review.md](2026-11-26-admin-independent-review.md) |
