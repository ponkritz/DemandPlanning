---
name: ui-release-pages
description: How to build or change a stream's Release page in the Demand Planning app (DP, CP, IOCC, Content, Tool Validations, S&S IT, ECP) — source bar, at most three count tiles, Releases | Source data tabs, the Releases table column order, results to Background jobs (UI-STANDARDS §10). Use for any Release page or a new stream.
---

# Release pages (UI-STANDARDS §10)

## Building blocks

- `ResultTabs` — `src/components/ResultTabs.tsx` (Releases | Source data (n))
- `Metrics` — `src/components/ui.tsx`, `Metric` — `src/components/ui.tsx`
- `DataTable` — `src/components/DataTable.tsx`, `TablePanel` — `src/components/ui.tsx`
- `runInBackground` — `src/backgroundJobs.ts`, `recordJob` — `src/backgroundJobs.ts`

Start from the existing shared Release page code (`src/components/ReleasePage.tsx`, `src/components/ReleaseView.tsx`)
rather than a new page; a stream only adds its own columns and rules.

## The parts, in this order

A stream leaves out a part it cannot have; it never reorders them.

1. **Source bar** — only the controls, right-aligned:
   - **Show: Selected month / All months** (segmented, see `ui-tabs-filters`);
   - ↻;
   - ⋯ — its first line (not an action) is "source · when fetched or imported"; **About this source…** at the end opens a pop-up with that line and the data details.
   - No view name, source, fetched time or ⓘ in the bar. Warnings about the data shown go **below** the bar.
2. **Counts** — `Metrics`: Releases in the month, Completed, Supported (as the stream counts them), with ⓘ "What was counted".
   - **At most three tiles.** An extra count goes in the Releases table's count line.
   - A list behind a count is a folded table under the tiles.
   - A tile the stream has no rule for is left out, and ⓘ says why.
   - Tool Validations: counts on the Master list tab only, as Validations in the month / Completed validations / Supported validations.
3. **Tabs** — `ResultTabs`: **Releases** | **Source data (n)**.
4. **Releases table** (`DataTable`), columns in this order:

| # | Column | Notes |
|---|---|---|
| 1 | Select | Only where bulk Create Features exists; toolbar "n selected · Select all shown · Clear · Create Features (n)" |
| 2 | Release name | Opens the release's documents (▸) |
| 3 | Release | Version or number |
| 4 | Approved | Approval or latest document date; keep the stream's own name where "Approved" would be wrong |
| 5 | Documents | Count, right-aligned |
| 6… | Stream columns | Only after the common ones |
| then | Time Writing Feature | With the match % |
| then | Planned (h), Booked (h) | Right-aligned |
| last | QMS-0025 match | Link to the Feature, or ＋ Create Feature |

- Results of the page's actions (Refresh, Import, Load from Git, Save to Git) → **Background jobs** (`ui-messages`).

## Do not

- A fourth tile; the source name or fetched time in the bar; the query's own columns before the common ones.
- Raw source rows at the bottom of the page instead of the Source data tab.
- Result notices on the page.

## Checklist

- [ ] Source bar: Show, ↻, ⋯ only, right-aligned; About this source… in ⋯.
- [ ] ≤ 3 tiles with ⓘ "What was counted".
- [ ] Releases | Source data (n) tabs.
- [ ] Column order as the table above.
- [ ] Action results in Background jobs.
