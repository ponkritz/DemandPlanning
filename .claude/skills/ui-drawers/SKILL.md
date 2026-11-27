---
name: ui-drawers
description: How to show and edit one record of a table in the Demand Planning app with Drawer — opened from a DataTable row, header with ID and ‹ › n of m, read-only body, footer with Remove and Edit, edit mode with Cancel and Save, unsaved-changes question (UI-STANDARDS §4a). Use when a table row needs a detail or edit view.
---

# Drawers (UI-STANDARDS §4a)

## Building blocks

- `Drawer` — `src/components/ui.tsx` (props: `eyebrow`, `title`, `onClose`, `footer`, `headerActions`, `restoreFocus`, `className`)
- `DataTable` — `src/components/DataTable.tsx` (`onRowOpen(row, shown)` opens it on click or Enter / Space; `rowLabel` names the row)
- `WriteBlocked` — `src/components/ui.tsx`
- `Modal` — `src/components/ui.tsx` (only for the "unsaved changes" question)

## Rules

- **When**: viewing / editing **one record of a list**. Keep `Modal` for confirmations, multi-record editors and settings.
- Opens from the table row (`onRowOpen`), slides in from the right (~520 px; full width on a phone), over a dimmed overlay. `Drawer` does the layout, keyboard and focus; do not re-implement them.
- **Header**: eyebrow `AREA · CONTEXT` ALL CAPS; title = the record's own ID ("New row" for a new record); optional ‹ › with "n of m" in the table's **current order** (use the `shown` array `onRowOpen` gives you) via `headerActions`; × comes with `Drawer`.
- **Body (view mode)**: the record's facts first, then label / value pairs (each field's help under its label), then its History.
- **Footer** (always visible, right-aligned):
  - view mode: **Remove …** (`text-button danger-text`) on the left, **Edit** (`primary`);
  - edit mode: fields replace the values in place; footer **Cancel** then the main action (e.g. **Save to Git**), error and Retry above the buttons.
- Closing or moving to another record with unsaved edits asks first in a `Modal`: **Keep editing** / **Discard changes**.
- Missing permission: Edit and Remove disabled, reason as a `WriteBlocked` line in the footer.
- No slide animation when the system asks for reduced motion (handled by the drawer's CSS — do not add your own animation).

## Pattern

```tsx
<DataTable id="ond-rows" columns={columns} rows={rows} rowKey={(r) => r.id} onRowOpen={(row, shown) => setOpen({ row, shown })} rowLabel={(r) => `Open ${r.id}`} />
{open && <Drawer
  eyebrow="ON-DEMAND · ROW"
  title={open.row.id}
  onClose={tryClose}
  headerActions={<>
    <button type="button" className="icon-button" aria-label="Previous row" disabled={index === 0} onClick={() => go(-1)}>‹</button>
    <span className="muted">{index + 1} of {open.shown.length}</span>
    <button type="button" className="icon-button" aria-label="Next row" disabled={index === open.shown.length - 1} onClick={() => go(1)}>›</button>
  </>}
  footer={editing
    ? <><WriteBlocked reason={blocked} /><button type="button" className="ghost" onClick={cancel}>Cancel</button><button type="button" className="primary" disabled={Boolean(blocked)} onClick={save}>Save to Git</button></>
    : <><button type="button" className="text-button danger-text" disabled={Boolean(blocked)} onClick={askRemove}>Remove row…</button><WriteBlocked reason={blocked} /><button type="button" className="primary" disabled={Boolean(blocked)} onClick={edit}>Edit</button></>}>
  {/* facts, then label / value pairs, then History */}
</Drawer>}
```

Copy the exact footer and body markup from the On-Demand row drawer (OND-27…OND-29) so spacing matches.

## Do not

- A `Modal` for a single record's details; a drawer for settings or confirmations.
- Your own previous / next order (it must follow the table as shown).
- Closing with unsaved edits without asking.

## Checklist

- [ ] Opened by `onRowOpen`; title is the record ID; ‹ › follow the shown order.
- [ ] View footer: Remove … left, Edit primary; edit footer: Cancel, main action.
- [ ] Unsaved edits ask Keep editing / Discard changes.
- [ ] Permissions: disabled with `WriteBlocked`.
