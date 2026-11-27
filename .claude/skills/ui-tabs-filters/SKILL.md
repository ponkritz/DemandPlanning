---
name: ui-tabs-filters
description: How to build tabs, filter bars and period controls in the Demand Planning app — SectionTabs for sections, ResultTabs for views of one result, MultiSelect, segmented controls, search, Reset filters and the "Show: Selected month / All months" toggle (UI-STANDARDS §7). Use for any tab row, filter or period choice.
---

# Tabs and filters (UI-STANDARDS §7)

## Building blocks

- `SectionTabs` — `src/components/SectionTabs.tsx` (sections of a page; `page` is the page's `SettingsTab` key from `src/settingsTabs.ts`; `sections: { key, label, node }[]`; remembered per page)
- `ResultTabs` — `src/components/ResultTabs.tsx` (views of one result, e.g. Releases | Source data (n); remembered per page)
- `MultiSelect` — `src/components/MultiSelect.tsx` (a filter with several values; nothing ticked = All)
- `.segmented` — `src/fresh.css` (two to four exclusive options, `role="radiogroup"`, buttons with `role="radio"` and `aria-checked`)
- `.inline-select` — `src/fresh.css` (a labelled `<select>` inside a toolbar, e.g. Group by)

## Rules

- **Sections of a page** → `SectionTabs`. **Views of one result** → `ResultTabs`. Never a third tab implementation.
- The chosen tab is clearly highlighted and remembered per page (both blocks do it).
- **One filter bar** under the panel heading, in this order: `MultiSelect` filters → segmented controls → search box **last** → **Reset filters** (`ghost`) at the end. The wording is "Reset filters", never "Clear filters".
- **Period**: the top-bar month is the default everywhere. A page needing another period offers **one** control: the segmented toggle **Show: Selected month / All months** (not a drop-down repeating the month), or one period picker — the same on every page.

## Pattern — filter bar

```tsx
<div className="button-row" role="group" aria-label="Release filters">
  <MultiSelect label="Stream" options={streams.map((s) => [s.key, s.name])} value={chosen} onChange={setChosen} />
  <div className="segmented" role="radiogroup" aria-label="Show">
    {(['month', 'all'] as const).map((value) => <button key={value} type="button" role="radio" aria-checked={show === value} className={show === value ? 'active' : ''} onClick={() => setShow(value)}>{value === 'month' ? 'Selected month' : 'All months'}</button>)}
  </div>
  <input type="search" placeholder="Search…" aria-label="Search releases" value={text} onChange={(e) => setText(e.target.value)} />
  <button type="button" className="ghost" onClick={resetFilters}>Reset filters</button>
</div>
```

The wrapper is a `button-row` with `role="group"` and an `aria-label`, as on Pulse Check (`src/pages/PulseCheckPage.tsx`, its period bar). Do not invent a new wrapper class.

## Pattern — tabs

```tsx
<SectionTabs page="resources" sections={[{ key: 'people', label: 'People', node: <PeoplePanel /> }, { key: 'tree', label: 'Team tree', node: <TeamTree /> }]} />
<ResultTabs id="dp-releases" main={<ReleasesTable />} raw={<SourceTable />} rawCount={source.length} />
```

## Do not

- Hand-built tab rows, chip styles or a new Region-filter form.
- "Clear filters"; a search box anywhere but last; several period controls on one page.

## Checklist

- [ ] `SectionTabs` / `ResultTabs` only.
- [ ] Filter bar order: MultiSelect → segmented → search → Reset filters.
- [ ] Period defaults to the top-bar month; one period control at most.
