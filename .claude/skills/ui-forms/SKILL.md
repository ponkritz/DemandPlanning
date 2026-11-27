---
name: ui-forms
description: How to build forms in the Demand Planning app — shared settings as a summary plus Edit… pop-up, one-column fields, required/optional, Cancel then the main action, button verbs, errors, disabled buttons that say why, and missing Azure DevOps permissions with useWriteBlock / WriteBlocked (UI-STANDARDS §3). Use for any input field, settings editor or write button.
---

# Forms (UI-STANDARDS §3)

## Building blocks

- `SettingsSummary` — `src/components/ui.tsx` (`rows: [label, value][]`; empty values show "—")
- `Modal` — `src/components/ui.tsx` (the editor of shared settings; see `ui-popups`)
- `Notice` — `src/components/ui.tsx` (`tone="error"` above the buttons)
- `WriteBlocked` — `src/components/ui.tsx` (the visible reason line; renders nothing when the reason is empty)
- `useWriteBlock` — `src/useCan.ts` (`why(action)`: one button's reason; `note(...actions)`: one line for a toolbar or table; `noteFor(where, ...actions)`: a Git save)
- `SaveQueueStatus` — `src/components/ui.tsx` (waiting / failed saves of a shared Git file, with Retry)
- `MultiSelect` — `src/components/MultiSelect.tsx`, `PersonPicker` — `src/components/PersonPicker.tsx` (multi-value and person fields)

## Rules

- **Shared settings**: the page shows a `SettingsSummary` of the saved values and an **Edit…** (`ghost`) button that opens the form in a `Modal`. Nothing shared saves on a keystroke or a single tick — every shared change has a Save.
- **Layout**: one column. Per field: label above the input, help (`<small>`) under it. `form-row` only for two short fields that belong together (From / To).
- **Required**: the `required` attribute, no marker. **Optional**: the label ends with **(optional)**.
- **Buttons**: bottom right — **Cancel** (`ghost`) first, the **main action** (`primary`) last. One primary per form. In a pop-up they sit in `.modal-actions`.
- **Main action label**: a verb with its object — **Save**, **Save to Git** (when the result is a commit), **Add …**, **Create N Features**, **Close N items**, **Remove …**. Never Apply, OK, Done, Confirm.
- **Errors**: one `<Notice tone="error">` above the buttons saying what is wrong and what to do. It stays until fixed and is also kept as a Background jobs entry once the form closes.
- **Disabled main button always says why** in visible text next to it — not only a tooltip.
- **Missing permission (CON-102)**: a button that changes Azure DevOps is **disabled, not hidden**; reason from `useWriteBlock()`, shown with `WriteBlocked` next to it. A table of row buttons: one `WriteBlocked` line above the table; each row button carries the same reason as `title`.
- **Exception**: a per-object ⋯ menu (chart, block, row) is **hidden** for people who cannot set that object up, when the page-level ⋯ keeps the same actions disabled with their reason.

## Pattern — field set inside an editor pop-up

```tsx
const { why } = useWriteBlock()
const blocked = why('capacity.settings')
<Modal eyebrow="SETTINGS · CAPACITY" title="Edit capacity" onClose={close}>
  <form onSubmit={(event) => { event.preventDefault(); void save() }}>
    <label>Hours per day<input type="number" required value={hours} onChange={(e) => setHours(e.target.value)} /></label>
    <small>Used for every person without their own hours.</small>
    <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
    {error && <Notice tone="error">{error} Check the value and save again.</Notice>}
    <div className="modal-actions">
      <WriteBlocked reason={blocked} />
      <button type="button" className="ghost" onClick={close}>Cancel</button>
      <button className="primary" disabled={Boolean(blocked) || saving}>{saving ? 'Saving…' : 'Save to Git'}</button>
    </div>
  </form>
</Modal>
```

Copy the label / input / help markup from an existing editor in the same area so field spacing matches; never add inline `style` for spacing.

## Do not

- Inline editing of shared settings, or saving on change.
- Primary first, two primaries, or the verbs Apply / OK / Done / Confirm.
- A hand-built error box (`div.error`, red text).
- A disabled button with only a `title` tooltip, or a write button hidden because of a permission.

## Checklist

- [ ] Shared settings: summary + Edit… + Save.
- [ ] One column, labels above, help below, "(optional)" on optional fields.
- [ ] Cancel (ghost) then one primary with a verb + object.
- [ ] Error Notice above the buttons; every disabled button says why; `WriteBlocked` for permissions.
