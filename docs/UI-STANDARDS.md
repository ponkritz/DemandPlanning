# I&D Quality Demand Planning — UI Standards

| | |
|---|---|
| Document | UIS-DPH-001 |
| Status | **Approved by the product owner on 2026-11-23.** The app does not follow it everywhere yet; each area is brought in line in its own change. |
| Applies to | Every page and component in `src/pages` and `src/components`, and every new UI change |
| Checked by | The independent UI/UX reviewer (`review-uiux`, [reviews/README.md](reviews/README.md)) and the change team before each pull request |

One way for each kind of component, so every page looks and behaves the same. Each section says **what to use**
(the shared building block in `src/components`), **how it looks** and **what not to do**. Where today's app differs, the
section ends with **Today** — the main differences found in the inventory of 2026-11-23, to be fixed area by area.

## 1. Page layout

- Every page is wrapped in `Page` (`components/ui.tsx`). The page title is shown once, in the top bar; a page never
  repeats it as its own heading.
- The page **fills the width** beside the menu (no maximum width; it widens when the menu is folded) inside a thin
  border, with the margins of **Look & feel → Page layout** (default 10 / 20 / 10 / 20 px, NAV-50).
- Optional, in this order under the top bar: one **intro sentence** (`Page intro`), then the **page actions**
  (`Page actions`, right-aligned) for actions on the whole page (Export, Refresh, ＋ New …).
- Then **KPI tiles** (§9) when the page has them, then **panels** (§2) top to bottom by importance.
- No free-standing `h2` / `h3` between panels: a heading always belongs to a panel.

- **Pages added with the page builder** (PGB-01) — the page types **Table** and **Table + Insights** — follow the
  Board-and-work-page layout of this section: `Page` with the intro and the page actions (＋ Add page…, Rename page…,
  Remove page…), then one `TablePanel` holding the work table (§5); Table + Insights puts the table and the Insights
  under the shared `ResultTabs` (§7). Their eyebrow is the page's menu group in capitals.

**Today:** about nine pages build their own intro (`act-header` with an `h2` repeating the title, `me-bar`, `p.muted`,
a Notice as intro); the Windchill pages (S&S IT, ECP) have no `Page` wrapper.

## 2. Panels

- All content sits in a `Panel`, or a `TablePanel` when the panel is a table (§5).
- Panel heading: **title** (h2, sentence case), optional **eyebrow** (ALL CAPS, area or scope, e.g. `SETTINGS ·
  STORAGE`) and optional **detail** (one short line). Inside a panel, sub-headings are `h3`; never `h4`.
- **Help** goes behind ⓘ (the panel's `info`), not in a Notice and not in a paragraph above the content.
- **Panel actions** go in the panel's `action` slot, top right. The panel's main action is the one primary button there.
- No hand-built cards (`section.act-card`, `div.control-card`, custom `Section` wrappers).

**Today:** about 12 hand-built cards (Planning Overview, Capacity vs Actual, Time Writing, Dashboard sections);
~35 headings outside panels; 13 loose ⓘ and one fake ⓘ (a tooltip on `<small>`).

## 3. Forms

- **Shared settings**: the page shows a `SettingsSummary` of the saved values and an **Edit…** button that opens the
  form in a pop-up (§4). Nothing shared is saved on a keystroke or a single tick: every shared change has a Save.
- **Layout**: one column; per field its label above the input and its help (`<small>`) under it. Group fields with
  `form-row` only when two short fields belong together (From / To).
- **Required and optional**: required fields carry the `required` attribute and no marker; an optional field's label
  ends with **(optional)**.
- **Buttons**: bottom right, **Cancel** (ghost) first, the **main action** (primary) last — in pop-ups and inline forms
  alike. One primary button per form.
- **Labels** of the main action: a verb with its object — **Save**, **Save to Git** (when the result is a commit),
  **Add …**, **Create N Features**, **Close N items**, **Remove …**. Not: Apply, OK, Done, Confirm.
- **Errors**: one `Notice tone="error"` above the buttons, saying what is wrong and what to do. A disabled main button
  always says why — a line of text next to it (not only a tooltip).
- **Missing permission** (CON-102): a button that would change Azure DevOps is disabled, not hidden, when the viewer
  lacks its action; the reason comes from `useWriteBlock()` (`src/useCan.ts`) and is shown with `WriteBlocked`
  (`src/components/ui.tsx`) next to the button — for a table of row buttons once above the table, each row button
  carrying the same reason as its tooltip.

**Today:** most settings edit inline; three save on every change; five places put the primary first; more than eight
verbs for the main action; ~9 hand-built error boxes; 154 of 174 disabled buttons do not say why.

## 4. Pop-ups

- Built with `Modal`: **eyebrow** `AREA · CONTEXT` in ALL CAPS (e.g. `AZURE DEVOPS WRITE`, `SETTINGS · CAPACITY`),
  **title** in sentence case, `wide` only for tables and multi-column editors.
- Footer: `.modal-actions`, Cancel then the main action (§3).
- A pop-up with input stays open on a click beside it; Escape and × close it; the keyboard stays inside (UI-18, UI-19).
- **Confirmations** of a write or a removal use a pop-up that names what will change (like the Close pop-up), not
  `window.confirm`. `window.confirm` is acceptable only for a single, undoable, local change.

**Today:** 35 `window.confirm` calls; footers use three different classes; two titles in Title Case.

## 4a. Drawers

**§4a Drawers.** One record of a table, viewed beside the page it belongs to, uses `Drawer` (`components/ui.tsx`), opened by a click on the table row or Enter / Space on it (`DataTable` `onRowOpen`) — not a pop-up. It slides in from the right (about 520 px; the full width on a phone), over a dimmed overlay. Header: eyebrow `AREA · CONTEXT` in ALL CAPS, the record's own ID as the title (sentence case for a new record, e.g. "New row"), optional ‹ › for the previous / next record in the table's current order with "n of m", and ×. Body: read-only by default — the record's facts first, then label / value pairs (with each field's help under its label), then its History. Footer, always visible, right-aligned: in view mode a destructive text button (**Remove …**) on the left and **Edit** (primary); in edit mode the form fields replace the values in place and the footer is **Cancel** then the main action (§3, e.g. **Save to Git**), with the error and Retry above the buttons. Escape, × and a click on the overlay close it; with unsaved edits closing or moving to another record asks first in a pop-up (**Keep editing** / **Discard changes**). Keyboard as in §4 (focus moves in, Tab stays inside, focus returns to the row). No sliding when the system asks for reduced motion. A missing permission disables Edit and Remove with the reason as a `WriteBlocked` line in the footer (§3). Use a drawer for viewing and editing one record of a list; keep `Modal` for confirmations, multi-record editors and settings.

Approved by the product owner on 2026-11-23.

## 5. Tables

- A list of records uses **`DataTable`** inside a **`TablePanel`**: sortable headers, Export (Excel / CSV), column
  choice, the row count, the "Showing the first N of M" line and the empty message come with it.
- A hand-built `<table>` is only for a **small fixed grid** (a matrix, a settings list of up to about 10 rows); it still
  follows the rules below.
- **Numbers** are right-aligned (`align: 'right'`, or class `num`); the unit goes in the header — **Planned (h)**,
  **Share (%)** — not in the cells.
- **Empty**: the `TablePanel` empty message, a sentence ending with a full stop: "No releases in November 2026."
- **Row actions**: the last column, headed **Actions**: **Edit** (ghost), **Open →** (text button), **Remove**
  (text button, danger colour).
- **Count**: "{shown} of {total} {items}" (e.g. "12 of 40 releases"); a cut list always says so.
- Headers stay visible when the table scrolls (sticky) when it can be longer than the screen.

**Today:** ~82 hand-built tables in 39 files against 16 `DataTable`s; class `num` has no CSS rule, so numbers are
left-aligned; six wordings for the row count and seven schemes for cut lists.

## 6. Buttons

| Kind | Class | Use |
|---|---|---|
| Main action | `primary` | One per form, panel or pop-up |
| Secondary | `ghost` | Other actions, Cancel, Export, Edit |
| Link-like | `text-button` | Open →, Show all, inline actions in text |
| Destructive | `text-button danger-text` in a row; `danger-button` for a page-level irreversible action | Remove, Delete, Reset |

- Symbols, only these: **＋** add, **↻** refresh / read again, **✕** remove a chip or line, **→** go to, **⋯** more
  actions, **▸ / ▾** expand. No other emoji or symbols in labels.
- An icon-only button has an `aria-label` naming the action and its object.

**Today:** private button classes (`act-primary`, `act-ghost`, `backlog-action`); destructive actions in five styles;
both ⟳ and ↻, both ✕ and ×, both ＋ and +.

## 7. Tabs and filters

- **Sections of a page**: `SectionTabs`; **views of one result** (Releases / Source data): `ResultTabs`. One look for
  both, with the chosen tab clearly highlighted; the choice is remembered per page.
- **Filters**: one filter bar under the panel heading: `MultiSelect` for a filter with several values, a segmented
  control for two to four exclusive options, a search box last, and **Reset filters** (ghost) at the end.
- **Period**: the top-bar month is the default everywhere. A page that needs another period offers one control,
  **Show: {month} / All months**, or one period picker — the same on every page.

**Today:** six tab implementations, and the chosen Settings tab is not highlighted; four chip styles; the Region filter
in three forms; "Reset filters" and "Clear filters"; seven period controls.

## 8. Messages

**Owner decision (2026-11-23):** the results of actions go to the top-bar **Background jobs** panel (it keeps its name),
next to the running and finished jobs — not into the page. Warnings about the data shown stay on the page.

| Situation | Use | Wording |
|---|---|---|
| Result of an action (success, error, partly done) | One entry in the top-bar **Background jobs** panel, next to the running and finished jobs; the top-bar button shows how many need a look | "Saved to Git." / "3 of 4 closed. #123: …" — the entry names the item and links to it |
| Long work | A running job in the same panel, turning into its result when it ends | Job label names the item: "Close 2 Features · #123" |
| Warning about the data shown | `Notice` warning on the page (it describes what is on screen, so it stays with it) | What is affected and what to do |
| Help or explanation | ⓘ (`info`) | — |
| No data | `EmptyState` | Title ends with a full stop; the detail says what to do next |
| Loading | `<p className="muted" role="status">` | "Loading {what}…" |

- An error that blocks a form (§3) stays in the form, above its buttons, until it is fixed; it is also kept as a
  Background jobs entry once the form is closed.
- No hand-built `div.notice`; no stacks of old messages on a page.

**Today:** results are shown in the page — 19 hand-built notices and a private `act-message`, ~6 styles each for
loading, success and empty; the "Who are you in Azure DevOps?" empty state has four different details. The top-bar
"Background jobs" panel holds the jobs (New Feature, Bulk actions, Time Writing) and the results of the Release pages'
actions (QV-63); the other pages still show their results in the page.

## 9. KPI tiles and charts

- **Tiles**: `Metrics` / `Metric` only — label, number (one size), optional hint; a change against a previous period
  uses one shared delta format (▲ / ▼ with the difference).
- **Charts**: inside `ChartFrame` (`components/WorkloadCharts.tsx`) — legend, Data labels toggle and **Table / Chart**
  toggle, axis names (UI-17).
- **Colours** of measures are the same everywhere: planned, actual and capacity use the `--viz-series-*` tokens.

**Today:** about eight tile styles (number sizes 22–32px); six charts without `ChartFrame` (no table view); three
palettes for planned / actual / capacity.

## 10. Release pages

Every stream's Release page (DP, CP, IOCC, Content, Tool Validations, S&S IT, ECP) has the same parts in the same
order; a stream leaves out a part it cannot have, and adds its own columns only after the common ones.

1. **Source bar** — view name, source (server / project, or export file), when fetched, ⓘ, **Show: {month} / All
   months**, ↻ and ⋯.
2. **Counts** — `Metrics`: Releases in the month, Completed, Supported (as the stream counts them), with ⓘ "What was
   counted" for the counting rules. **At most three tiles**: a stream's extra count (CP "QA/QE-signed documents") goes in
   the Releases table's count line, not in a fourth tile. A list behind a count stays a folded table under the tiles
   (DP "Supported releases counted"). A tile the stream has no rule for is left out, and ⓘ says why.
3. **Tabs** — **Releases** | **Source data (n)** (the raw query or export rows).
4. **Releases table** (`DataTable`), columns in this order:

| # | Column | Notes |
|---|---|---|
| 1 | Select | Only where bulk Create Features exists; toolbar "n selected · Select all shown · Clear · Create Features (n)" |
| 2 | Release name | Opens the release's documents (▸) |
| 3 | Release | Version or number |
| 4 | Approved | The approval or latest document date; where "Approved" would be wrong the column keeps the stream's own name (Windchill "Latest {date column}", CP "Release Notes signed") |
| 5 | Documents | Count, right-aligned |
| 6… | Stream columns | e.g. Type of Release (IOCC), Container (CP), Locations (Windchill), Milestones (DP) |
| then | Time Writing Feature | With the match % |
| then | Planned (h), Booked (h) | Right-aligned |
| last | QMS-0025 match | Link to the Feature, or ＋ Create Feature |

- The results of the page's actions (Refresh, Import, Load from Git, Save to Git) go to **Background jobs** (§8); the
  source bar keeps only the warnings about the data shown.

The product owner accepted on 2026-11-23, as built: DP's counting rules behind ⓘ with its counted list folded under the
tiles; the stream's own name for the date column where "Approved" would be wrong; at most three tiles, an extra count
in the table's count line.

**Today:** DP's Releases table shows its query's columns between Select and the common end (Time Writing Feature …
QMS-0025 match) instead of Release name / Release / Approved / Documents. (Tiles left out because the stream's data has
no rule for them — Content: Completed and Supported; Tool Validations, S&S IT, ECP: Completed — follow the rule above.)

## 11. Colours, type and spacing

- **Colours**: only the tokens of `src/index.css` (light and dark). No hard-coded colour in CSS or TSX; a fallback in
  `var(--x, #…)` must equal the token.
- **Type scale**, nothing else:

| Use | Size |
|---|---|
| Table headers, eyebrows, small labels | 11px |
| Table cells, help text | 12px |
| Body text, notices, form fields | 13px |
| Panel titles (h2) | 16px |
| Sub-headings (h3) | 14px |
| Top-bar page title | 20px |
| KPI numbers | 24px |

- **Spacing**: the panel, form and table gaps of the shared blocks; no inline `style` for layout (widths and indents
  go in CSS classes).

**Today:** ~200 hard-coded colours (e.g. #773b93 for Features, not the `--feature` token); 33 font sizes; 25 inline
styles; `.metric-grid article` defined six times.

## 12. UI defaults

What a person gets without choosing (the UI/UX reviewer lists every one in its **UI defaults register**):

- **Pre-ticked** only for what is the person's own and safe; never for something that writes for or shares with
  others (other people's items start unticked).
- **Pre-filled** text is a real default the person would keep, never a placeholder that gets saved (e.g. not a
  "Reason for change" that reads as an approval).
- **Pre-selected** choices: when there is exactly one sensible value; with several (overlapping PI / Sprint), nothing
  is chosen and the person must pick.
- **First tab / section**: the overview or the most used one; the last choice is remembered per page.
- **Sort**: newest first for dated lists, by number for work items (Feature number), by name otherwise; the default
  sort shows in the header.
- **Period**: the top-bar month.
- A default that matters is **visible** on the page (not only in a tooltip), and the same on every page that shows the
  same thing.

## Changes to this standard

The product owner approves this document and every change to it; a change is made in its own pull request with a
change note. The UI/UX reviewer reports a case the standard does not cover under "Not covered", and a rule that is
wrong for a real case as an Improvement to the standard.

| Date | Change | Approved by |
|---|---|---|
| 2026-11-23 | §4a Drawers added: one record of a table viewed and edited in a drawer from the right (the On-Demand row drawer, OND-27…OND-29). | Product owner, 2026-11-23 |
