---
name: ui-page-layout
description: How to lay out a page of the Demand Planning app — the Page wrapper, intro sentence, page actions, KPI tiles and panels in order, page-builder pages (UI-STANDARDS §1). Use when adding or changing any page in src/pages or a page-like component.
---

# Page layout (UI-STANDARDS §1)

## Building blocks

- `Page` — `src/components/ui.tsx` (props: `intro`, `actions`, `className`, `embedded`)
- `Metrics` — `src/components/ui.tsx`
- `Panel` — `src/components/ui.tsx`
- `TablePanel` — `src/components/ui.tsx`
- `EmptyState` — `src/components/ui.tsx`

## Rules

- Every page returns `<Page>`; the page title is shown **once, in the top bar** — never repeat it as a heading.
- The page **fills the width** beside the menu (no max-width), inside the thin border, with the margins of Look & feel → Page layout. Never add your own outer margins or max-width.
- Order under the top bar, each part optional:
  1. one **intro sentence** → `intro`
  2. **page actions** (whole-page actions: Export, Refresh ↻, ＋ New …, ⚙ last) → `actions`, right-aligned by `Page`
  3. **KPI tiles** → `<Metrics>` (see `ui-kpi-charts`)
  4. **panels**, top to bottom by importance (see `ui-panels`)
- No free-standing `h2` / `h3` between panels; a heading always belongs to a panel.
- A page with nothing to show yet returns `<Page><EmptyState … /></Page>` (see `ui-messages`).
- **Page-builder pages** (Table, Table + Insights; PGB-01): `Page` with intro and actions (＋ Add page…, Rename page…, Remove page…), then one `TablePanel` with the work table; Table + Insights puts table and Insights under `ResultTabs`. Eyebrow = the page's menu group in CAPITALS.
- A page shown as a tab of another page passes `embedded`.

## Pattern

```tsx
import { EmptyState, Metric, Metrics, Page, Panel, TablePanel } from '../components/ui'

export default function ExamplePage({ rows, refresh }: Props) {
  if (!rows.length) return <Page><EmptyState title="No releases loaded yet." detail="Fetch the stream's connection first." /></Page>
  return <Page
    intro="Releases of the selected month and the Features booked on them."
    actions={<>
      <button type="button" className="ghost" onClick={refresh} aria-label="Read the releases again">↻</button>
      {/* ⚙ last, only when the viewer may open the setup — see ui-buttons */}
    </>}>
    <Metrics>
      <Metric label="Releases in the month" value={rows.length} />
    </Metrics>
    <TablePanel title="Releases" count={`${rows.length} of ${rows.length} releases`}>
      {/* DataTable — see ui-tables */}
    </TablePanel>
    <Panel title="Booked hours" info="What is counted and how.">
      {/* content */}
    </Panel>
  </Page>
}
```

## Do not

- `<h2>{pageTitle}</h2>`, `act-header`, `me-bar` or `p.muted` built as your own intro.
- A Notice used as the intro.
- Content outside a panel, or a page without `Page` (the Windchill pages are a known gap, not an example).

## Checklist

- [ ] `Page` wraps everything; no repeated page title.
- [ ] Intro is one sentence; actions are only whole-page actions, ⚙ last.
- [ ] Tiles before panels; panels ordered by importance.
- [ ] No heading outside a panel.
