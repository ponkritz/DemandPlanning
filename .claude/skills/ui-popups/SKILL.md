---
name: ui-popups
description: How to build pop-ups in the Demand Planning app with Modal — eyebrow and title, default / wide / full sizes, footer order, keyboard and click-outside behaviour, confirmations instead of window.confirm, and the page ⚙ settings pop-up (UI-STANDARDS §4). Use for any dialog, confirmation or bulk-action window.
---

# Pop-ups (UI-STANDARDS §4)

## Building blocks

- `Modal` — `src/components/ui.tsx` (props: `eyebrow` (required), `title`, `onClose`, `wide`, `full`, `form`, `blocking`)
- `PageSettingsDialog` — `src/components/PageSettings.tsx` (the ⚙ "Settings for <page>" pop-up)

## Rules

- **Eyebrow** `AREA · CONTEXT` in ALL CAPS (e.g. `AZURE DEVOPS WRITE`, `SETTINGS · CAPACITY`). **Title** in sentence case.
- **Size**:
  - default — a form;
  - `wide` — a table or a multi-column editor;
  - `full` — a long list or a bulk action: the window less a 20 px margin, header and actions fixed, only the part with class `modal-scroll` scrolls (whole screen on a phone).
- **Footer**: `<div className="modal-actions">` — Cancel (`ghost`) first, the main action (`primary`) last (see `ui-forms`).
- `Modal` already handles: focus moves in, Tab stays inside, Escape and × close, focus returns to the opener. Do not re-implement any of it.
- **Click beside**: a pop-up with input stays open (default `form={true}`); a pop-up without input passes `form={false}` to close on that click.
- `blocking` only for a pop-up that must be answered (no ×, Escape does nothing) — rare; name it in the PR.
- **Confirmations** of a write or a removal: a `Modal` that **names what will change** (like the Close pop-up). `window.confirm` only for a single, undoable, local change.

## Pattern — confirmation of a removal

```tsx
{confirming && <Modal eyebrow="SETTINGS · STREAMS" title={`Remove ${stream.name}?`} onClose={() => setConfirming(false)} form={false}>
  <p>This removes the stream and its mapping for everyone. Its releases stay in Git.</p>
  <div className="modal-actions">
    <button type="button" className="ghost" onClick={() => setConfirming(false)}>Cancel</button>
    <button type="button" className="danger-button" onClick={remove}>Remove {stream.name}</button>
  </div>
</Modal>}
```

## Pattern — full-size bulk pop-up

```tsx
<Modal eyebrow="AZURE DEVOPS WRITE" title={`Create ${rows.length} Features`} full onClose={close}>
  <div className="modal-scroll">{/* DataTable of the rows — see ui-tables */}</div>
  <div className="modal-actions">
    <button type="button" className="ghost" onClick={close}>Cancel</button>
    <button type="button" className="primary" onClick={create}>Create {rows.length} Features</button>
  </div>
</Modal>
```

## Do not

- A hand-built dialog, overlay or backdrop, or a third-party modal.
- Title Case titles; a footer with another class (`dialog-buttons`, `button-row` at the bottom).
- `window.confirm` / `window.alert` for anything that writes or removes.

## Checklist

- [ ] `Modal` with ALL-CAPS eyebrow and a sentence-case title.
- [ ] Right size (default / `wide` / `full` with `modal-scroll`).
- [ ] `.modal-actions`: Cancel first, one primary (or `danger-button`) last.
- [ ] Confirmations name what changes; no `window.confirm` for writes.
