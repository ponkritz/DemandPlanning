---
name: ui-panels
description: How to build a box of content in the Demand Planning app — Panel and TablePanel, title, eyebrow, detail, ⓘ help, the action slot, sub-headings and the chart header (UI-STANDARDS §2). Use whenever content is added to a page.
---

# Panels (UI-STANDARDS §2)

## Building blocks

- `Panel` — `src/components/ui.tsx` (props: `title`, `eyebrow`, `detail`, `info`, `action`, `titleHidden`, `className`)
- `TablePanel` — `src/components/ui.tsx` (adds `count`, `empty`; use it when the panel is a table)
- `Info` — `src/components/ui.tsx` (the ⓘ; `Panel` renders it from `info` — use `Info` directly only next to a table heading, with `iconOnly` and a `label`)
- `Pill` — `src/components/ui.tsx` (the neutral "Filtered" pill on a chart)

## Rules

- All content sits in a `Panel`, or a `TablePanel` when the panel is a table.
- Heading parts:
  - **title** — `h2`, sentence case ("Booked hours", not "Booked Hours").
  - **eyebrow** (optional) — ALL CAPS area or scope, e.g. `SETTINGS · STORAGE`. Use ` · ` (space, middle dot, space) between parts.
  - **detail** (optional) — one short line.
- Sub-headings inside a panel are `h3`. Never `h4`.
- **Help** goes behind ⓘ (`info`), never in a Notice or a paragraph above the content.
- **Panel actions** go in `action` (top right). The panel's main action is its one `primary` button; the rest are `ghost`.
- **Chart or table panel header**: title + ⓘ only, **no type eyebrow**. ⓘ says what it measures, its type, its filters and the rows counted. A neutral `<Pill>Filtered</Pill>` when its own filters narrow it. Warnings that change the numbers stay visible on the chart.

## Pattern

```tsx
<Panel
  eyebrow="SETTINGS · CAPACITY"
  title="Capacity and absence"
  detail="Used by the Dashboard for available hours."
  info="Available = working days × hours per day − leave − holidays. Leave uses actual hours when recorded, else planned."
  action={<button type="button" className="ghost" onClick={openEditor}>Edit…</button>}>
  <SettingsSummary rows={[['Hours per day', '8'], ['Leave source', 'Actual, else planned']]} />
  <h3>Holidays</h3>
  {/* … */}
</Panel>
```

## Do not

- Hand-built cards: `section.act-card`, `div.control-card`, private `Section` wrappers.
- A heading outside a panel, an `h4`, Title Case titles.
- A loose ⓘ or a "fake" ⓘ (a tooltip on `<small>`); help text as a paragraph.
- More than one `primary` button in a panel.

## Checklist

- [ ] `Panel` / `TablePanel` only; title sentence case; eyebrow ALL CAPS.
- [ ] Help in `info`; actions in `action`; one primary at most.
- [ ] Chart / table panels: no type eyebrow, "Filtered" pill when narrowed.
