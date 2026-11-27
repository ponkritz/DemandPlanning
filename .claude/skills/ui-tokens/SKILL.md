---
name: ui-tokens
description: Colours, type scale and spacing of the Demand Planning app — only the CSS tokens of src/index.css (light and dark), the seven font sizes, no inline style for layout, work-item colours (UI-STANDARDS §11). Use whenever CSS, a colour, a font size or spacing is written.
---

# Colours, type and spacing (UI-STANDARDS §11)

## Building blocks

- `--text` — `src/index.css`, also `--text-2`, `--text-3` (body, secondary, tertiary text)
- `--surface` — `src/index.css`, also `--surface-2`, `--bg` (backgrounds)
- `--line` — `src/index.css`, also `--line-soft`, `--card-border` (borders)
- `--accent` — `src/index.css`, also `--accent-hover`, `--accent-soft`, `--accent-text`, `--link`, `--focus`
- `--success` — `src/index.css`, also `--success-soft`, `--success-line`, `--success-text`
- `--warning` — `src/index.css`, also `--warning-soft`, `--warning-line`, `--warning-text`
- `--danger` — `src/index.css`, also `--danger-soft`, `--danger-line`, `--danger-text`
- `--epic` — `src/index.css`, `--feature` — `src/index.css`, `--story` — `src/index.css` (work-item types)
- `--hl-green-bg` — `src/index.css` (row highlights: `--hl-{green,red,amber,blue,grey,orange,purple,yellow}-{bg,line}`)
- `--viz-series-1` — `src/App.css` (chart colours: see `ui-kpi-charts`)

## Rules

- **Colours: only tokens.** Every colour in CSS or TSX is `var(--token)`. No hex, `rgb()` or named colour. A fallback in `var(--x, #…)` must equal the token's light value. Tokens already switch for dark mode (`[data-theme="dark"]` and `prefers-color-scheme`) — never write a dark-mode colour yourself.
- Work items: Epic `var(--epic)`, Feature `var(--feature)`, User Story `var(--story)` — never their hex.
- A new token is added to `src/index.css` for light **and** both dark blocks, in the same change, and named in the PR.
- **Type scale — nothing else:**

| Use | Size |
|---|---|
| Table headers, eyebrows, small labels | 11px |
| Table cells, help text | 12px |
| Body text, notices, form fields | 13px |
| Sub-headings (h3) | 14px |
| Panel titles (h2) | 16px |
| Top-bar page title | 20px |
| KPI numbers | 24px |

  Most text gets its size from the shared blocks; set a size only for a new class, and only one of these.
- **Spacing**: use the gaps of the shared blocks (`Panel`, forms, `DataTable`). No inline `style` for layout — widths, gaps and indents go in a CSS class in `src/fresh.css` next to the related rules. (`style` is fine for computed geometry such as SVG coordinates or a measured popup position.)
- Do not define a selector a second time (e.g. `.metric-grid article`); extend the existing rule.

## Pattern

```css
/* src/fresh.css — next to the related rules */
.release-match{color:var(--text-2);font-size:12px;border-left:3px solid var(--feature);padding-left:8px}
.release-match.missing{color:var(--warning-text);background:var(--warning-soft)}
```

## Do not

- `#773b93` (use `var(--feature)`), `color: red`, `style={{ marginTop: 12 }}`, `font-size: 15px`.

## Checklist

- [ ] No hard-coded colour; fallbacks equal the token.
- [ ] Font sizes only from the scale.
- [ ] No inline layout style; no duplicated selector.
