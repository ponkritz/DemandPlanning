---
name: ui-buttons
description: Build and preview Demand Planning buttons using the app's action classes, icon labels and page settings controls (UI-STANDARDS §6).
---

# Buttons (UI-STANDARDS §6)

## Building blocks

- `PageSettingsButton` — `src/components/PageSettings.tsx` (⚙ "Settings for <page>")
- `PageSettingsDialog` — `src/components/PageSettings.tsx`
- `SectionTabs` — `src/components/SectionTabs.tsx` (the tabs inside the settings pop-up, `remember={false}`)

## The four kinds — nothing else

| Kind | Class | Use |
|---|---|---|
| Main action | `primary` | One per form, panel or pop-up |
| Secondary | `ghost` | Other actions, Cancel, Export, Edit |
| Link-like | `text-button` | Open →, Show all, inline actions in text |
| Destructive | `text-button danger-text` in a row; `danger-button` for a page-level irreversible action | Remove, Delete, Reset |

Always `type="button"` unless the button submits its form.

For mockups and screenshots, follow [Standalone previews](../ui-design-system/SKILL.md#standalone-previews). Use the matching app button class, parent container and native disabled state so toolbar, row and modal buttons inherit the correct size and appearance.

## Symbols — only these

**＋** add · **↻** refresh / read again · **✕** remove a chip or line · **→** go to · **⋯** more actions · **▸ / ▾** expand · **⚙** open the setup of this page.

Use exactly these characters: full-width ＋ (not +), ↻ (not ⟳), ✕ (not × — × is only the close button `Modal` and `Drawer` draw themselves). No other emoji or symbols in labels.

## Rules

- An **icon-only** button has an `aria-label` naming the action **and its object** ("Read the releases again", not "Refresh").
- **Setup of a page** (one Admin page): icon-only ⚙, `ghost`, **last** in the page actions; `aria-label` and `title` = the setup page's name (e.g. "PI Review Setup"). Shown **exactly when** that Admin page is in the viewer's menu; hidden otherwise.
- **Settings of a page** (several Admin sections): `PageSettingsButton` (⚙ "Settings for <page>") last in the page actions, opening `PageSettingsDialog` with the Admin panels themselves as `SectionTabs` (`remember={false}`), each tab with **Open in Admin →**. Shown only to people who may change at least one section; a tab only when they may change it. Never build a second editor.
- Disabled buttons say why (see `ui-forms`).

## Pattern

```tsx
<button type="button" className="primary" onClick={save}>Save to Git</button>
<button type="button" className="ghost" onClick={close}>Cancel</button>
<button type="button" className="text-button" onClick={openRelease}>Open →</button>
<button type="button" className="text-button danger-text" onClick={askRemove}>Remove</button>
<button type="button" className="ghost" onClick={refresh} aria-label="Read the releases again">↻</button>
<button type="button" className="ghost" aria-label="PI Review Setup" title="PI Review Setup" onClick={openSetup}>⚙</button>
{mayChangeSettings && <PageSettingsButton pageName="Time Writing" onOpen={() => setSettings(true)} />}
```

## Do not

- Private button classes (`act-primary`, `act-ghost`, `backlog-action`) or inline-styled buttons.
- ⟳, +, × in labels; emoji; icon-only buttons without `aria-label`.
- ⚙ shown to people who cannot open its page.

## Checklist

- [ ] One of the four kinds; one primary per form / panel / pop-up.
- [ ] Only the allowed symbols, the exact characters.
- [ ] Icon-only → `aria-label` with action + object.
- [ ] ⚙ last in page actions and only for people who may use it.
