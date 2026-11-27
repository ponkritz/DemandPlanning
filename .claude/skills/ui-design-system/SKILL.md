---
name: ui-design-system
description: Build and preview Demand Planning interfaces with the app's styles and shared components. Start here for changes to its UI, standalone mockups and screenshots, then use the matching component skills.
---

# Demand Planning UI design system

`docs/UI-STANDARDS.md` (UIS-DPH-001, approved by the product owner) is the rule book. These skills are the how-to for it:
for each kind of component they say which **shared building block** to use, give a **copy-ready pattern**, list what
**not** to do and end with a **checklist**. Follow them literally: the point is that two different models given the same
request produce the same markup. Where a skill and UI-STANDARDS.md differ, UI-STANDARDS.md wins; say so in the pull
request and fix the skill in the same change.

## How to use

1. Read this skill, then the skill of **every** component type you touch (table below). Do not build from memory.
2. Use only the building blocks named in the skills. Never hand-build a card, dialog, table, tab row, notice or button
   style that a building block already provides.
3. Copy the pattern, then change only the content (labels, columns, data). Keep the order of parts, the class names and
   the wording rules.
4. Before you push, run the **final checklist** below on your diff.
5. A deliberate exception to the standard is named in the pull request (CLAUDE.md); a new rule needs the product
   owner's approval in UI-STANDARDS.md first — never invent one in code.

| You are building | Skill | UI-STANDARDS |
|---|---|---|
| A page, its intro and page actions | `ui-page-layout` | §1 |
| A box of content, its heading, ⓘ help | `ui-panels` | §2 |
| Fields, Save / Cancel, shared settings, missing permissions | `ui-forms` | §3 |
| A pop-up, a confirmation, a bulk pop-up | `ui-popups` | §4 |
| One record of a table beside the page | `ui-drawers` | §4a |
| A list of records | `ui-tables` | §5 |
| Any button, icon button, ⚙ | `ui-buttons` | §6 |
| Sections, result tabs, filter bar, period | `ui-tabs-filters` | §7 |
| Results, warnings, help, empty, loading | `ui-messages` | §8 |
| KPI tiles, charts, chart sizes | `ui-kpi-charts` | §9 |
| A stream's Release page | `ui-release-pages` | §10 |
| Colours, font sizes, spacing, dark mode | `ui-tokens` | §11 |
| What is pre-ticked, pre-filled, pre-selected, sorted | `ui-defaults` | §12 |

## Standalone previews

Prefer rendering the proposed view inside the app so it inherits the production stylesheet cascade and theme. For an isolated preview, bundle these entry imports from the same checkout in app order:

```ts
import '/src/index.css'
import '/src/App.css'
import '/src/fresh.css'
import '/src/exports.css'
```

For a portable HTML preview, include the compiled CSS and any referenced assets. Reuse the component markup and its surrounding app classes, theme and density. Keep preview-specific layout styles scoped to the new layout so shared controls retain their app styles.

Before sharing the preview or taking a screenshot, compare its buttons with the corresponding app buttons in the same browser, theme, viewport and state. Check dimensions, padding, font, colour, background, border, radius, shadow and focus ring in computed styles. Compare disabled and hover states where applicable.

## Building blocks

Every block below exists in the code (all of them, in one list); `pnpm test` (`tests/ui-skills.test.mjs`, CI-13) fails when a skill names one that
does not.

- `Page` — `src/components/ui.tsx`
- `Panel` — `src/components/ui.tsx`
- `TablePanel` — `src/components/ui.tsx`
- `Info` — `src/components/ui.tsx`
- `Modal` — `src/components/ui.tsx`
- `Drawer` — `src/components/ui.tsx`
- `Notice` — `src/components/ui.tsx`
- `EmptyState` — `src/components/ui.tsx`
- `Metrics` — `src/components/ui.tsx`
- `Metric` — `src/components/ui.tsx`
- `Pill` — `src/components/ui.tsx`
- `WriteBlocked` — `src/components/ui.tsx`
- `SettingsSummary` — `src/components/ui.tsx`
- `SaveQueueStatus` — `src/components/ui.tsx`
- `DataTable` — `src/components/DataTable.tsx`
- `SectionTabs` — `src/components/SectionTabs.tsx`
- `ResultTabs` — `src/components/ResultTabs.tsx`
- `MultiSelect` — `src/components/MultiSelect.tsx`
- `PersonPicker` — `src/components/PersonPicker.tsx`
- `ChartFrame` — `src/components/WorkloadCharts.tsx`
- `PageSettingsButton` — `src/components/PageSettings.tsx`
- `PageSettingsDialog` — `src/components/PageSettings.tsx`
- `useWriteBlock` — `src/useCan.ts`
- `runInBackground` — `src/backgroundJobs.ts`
- `recordJob` — `src/backgroundJobs.ts`

## Checklist

Run this on your diff before every push.

- [ ] Every new page is in `Page`; every piece of content is in a `Panel` or `TablePanel`; no `h2`/`h3` outside a panel; no `h4`.
- [ ] Every list of records is a `DataTable` in a `TablePanel`; numbers right-aligned, unit in the header.
- [ ] Every pop-up is a `Modal` (eyebrow ALL CAPS, title sentence case); footer `.modal-actions`, Cancel first, one primary last.
- [ ] No `window.confirm` for a write or a removal.
- [ ] Main action labels are a verb with its object (Save, Save to Git, Add …, Remove …) — never Apply, OK, Done, Confirm.
- [ ] Every disabled button says why in visible text (`WriteBlocked` for permissions).
- [ ] Results of actions go to Background jobs (`runInBackground` / `recordJob`), not a notice on the page.
- [ ] Only the symbols ＋ ↻ ✕ → ⋯ ▸ ▾ ⚙; icon-only buttons have an `aria-label`.
- [ ] No hard-coded colour, no font size outside the scale, no inline `style` for layout.
- [ ] Nothing that writes for or shares with others is pre-ticked.
- [ ] Quick scan of the diff (each should print nothing new):
  ```
  git diff origin/main -U0 -- src | grep -E '^\+' | grep -nE 'window\.confirm|#[0-9a-fA-F]{3,8}\b|<h4|font-size:\s*[0-9]+px|style=\{\{'
  ```
  A hit is either fixed or named in the pull request as a deliberate exception.
- [ ] UI changed: `pnpm -s build:web` then `pnpm test:e2e` (CLAUDE.md), and the E2E scenario waits on what the step needs, never on time.
