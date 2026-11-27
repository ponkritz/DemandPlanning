---
name: ui-kpi-charts
description: How to build KPI tiles and charts in the Demand Planning app — Metrics / Metric tiles with the shared delta format, charts inside ChartFrame with legend, Data labels and Table / Chart toggle, fixed measure colours (--viz-series-*, --viz-capacity), chart sizes and the resize handle (UI-STANDARDS §9). Use for any number tile or chart.
---

# KPI tiles and charts (UI-STANDARDS §9)

## Building blocks

- `Metrics` — `src/components/ui.tsx` (the tile row)
- `Metric` — `src/components/ui.tsx` (`label`, `value`, `hint`, `tone: 'positive' | 'negative'`)
- `ChartFrame` — `src/components/WorkloadCharts.tsx` (`legend`, `table`, `setTable`, `labels`, `legendAt`)
- `Panel` — `src/components/ui.tsx` (every chart sits in one; header rules in `ui-panels`)
- `--viz-series-1` — `src/App.css` (Actual)
- `--viz-series-2` — `src/App.css` (Planned)
- `--viz-capacity` — `src/App.css` (Capacity / available hours)
- `epicSlots` — `src/chartUtils.ts` (colours for per-Epic series, in order)

## Rules — tiles

- `Metrics` / `Metric` only: label, number (one size, 24 px — from the CSS), optional hint. No hand-built tiles, no other number sizes.
- A change against a previous period uses **one** delta format: ▲ / ▼ with the difference (e.g. `▲ 12 h`), as `hint`, with `tone` positive / negative.
- At most what the page needs; Release pages at most three tiles (see `ui-release-pages`).

## Rules — charts

- Every chart is inside `ChartFrame`: legend, **Data labels** toggle and **Table / Chart** toggle come with it, plus axis names (UI-17). A chart without a table view is not allowed.
- **Measure colours are fixed everywhere**: Actual `var(--viz-series-1)`, Planned `var(--viz-series-2)`, Capacity `var(--viz-capacity)`. Per-Epic series take `epicSlots` in order. Never pick your own palette; never hard-code a hex.
- Charts are inline SVG built like the existing ones in `src/components/WorkloadCharts.tsx` / `InsightCharts.tsx`; no external chart library.
- **Size**: Width ⅓ / ½ / ⅔ / Full of the 6-column grid, Height Small / Medium / Large; owner sets it in the chart's pop-up (Display), Size… or Arrange; every viewer may resize for themselves with the resize handle; "Size: yours · Reset to default" on a chart with an own size; below 720 px full width, no handle. Use the existing chart-size code (`src/components/ChartSize.tsx`) — do not build a second one.
- **Resize handle**: the only drag control — 20 px button bottom-right, snaps to presets with a dashed outline naming the size, arrow keys step, Enter keeps, Escape cancels, `aria-label` "Resize {object}: {size}" plus a polite live region; never on phones.

## Pattern

```tsx
<Metrics>
  <Metric label="Planned (h)" value={formatHours(planned)} />
  <Metric label="Actual (h)" value={formatHours(actual)} hint={`${actual >= last ? '▲' : '▼'} ${formatHours(Math.abs(actual - last))} h vs October`} tone={actual >= last ? 'positive' : 'negative'} />
</Metrics>

<Panel title="Hours per month" info="Bar chart. Actual hours booked on Month Tasks against planned hours, per month of the PI.">
  <ChartFrame legend={<>{/* legend items in the series colours */}</>} table={asTable} setTable={setAsTable} labels={[labels, setLabels]}>
    {asTable ? <DataTable … /> : <svg …>{/* bars in var(--viz-series-1), line in var(--viz-series-2) */}</svg>}
  </ChartFrame>
</Panel>
```

Copy the legend items and SVG markup from `WorkloadCharts.tsx` (it uses `LegendBar` / `LegendLine` and the series tokens).

## Do not

- Tiles with their own markup or font size; a second delta format.
- A chart outside `ChartFrame`, without the table view, or in a colour other than its measure's token.
- A chart type eyebrow in the panel header.

## Checklist

- [ ] `Metrics` / `Metric`; delta ▲ / ▼ with the difference.
- [ ] `ChartFrame` with legend, Data labels, Table / Chart.
- [ ] Actual / Planned / Capacity colours from the tokens.
- [ ] Sizes and resize from the shared chart-size code.
