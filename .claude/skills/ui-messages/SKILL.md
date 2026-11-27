---
name: ui-messages
description: How to show results, progress, warnings, help, empty and loading states in the Demand Planning app — Background jobs (runInBackground, recordJob) for results of actions, Notice for warnings about the data shown, ⓘ for help, EmptyState, and the loading line (UI-STANDARDS §8). Use whenever something must tell the user what happened or why nothing is shown.
---

# Messages (UI-STANDARDS §8)

## Building blocks

- `runInBackground` — `src/backgroundJobs.ts` (`runInBackground(key, label, async (progress) => ({ text, failed?, action? }))`; returns false when a job with that key is already running)
- `recordJob` — `src/backgroundJobs.ts` (`recordJob(key, label, { text, failed? })` for an instant result)
- `Notice` — `src/components/ui.tsx` (`tone`: `info` | `success` | `warning` | `error`)
- `EmptyState` — `src/components/ui.tsx` (`title`, `detail`)
- `Info` — `src/components/ui.tsx` (help; usually via a panel's `info`)

## Which one

| Situation | Use | Wording |
|---|---|---|
| Result of an action (success, error, partly done) | One entry in the top-bar **Background jobs** panel: `recordJob` (instant) or the result of `runInBackground` | "Saved to Git." / "3 of 4 closed. #123: …" — name the item and link to it |
| Long work | `runInBackground`; call `progress('2 of 5 …')` as it goes | Label names the item: "Close 2 Features · #123" |
| Warning about the data shown | `<Notice tone="warning">` on the page, next to what it describes | What is affected and what to do |
| Help or explanation | ⓘ (`info`) | — |
| No data | `<EmptyState title=… detail=… />` | Title ends with a full stop; detail says what to do next |
| Loading | `<p className="muted" role="status">` | "Loading {what}…" |
| Error blocking a form | `<Notice tone="error">` above the form's buttons (see `ui-forms`) | What is wrong, what to do |

## Rules

- Results of actions go to **Background jobs**, never into the page. Partly done counts as failed (`failed: true`).
- A follow-up the result offers (e.g. **Retry failed**) is the job's `action`.
- No hand-built `div.notice`, no private `act-message`, no stacks of old messages on a page.
- Wording: sentences with a full stop; name the item ("#123", "PI 26.4"); no "Success!", no exclamation marks.

## Pattern

```tsx
import { recordJob, runInBackground } from '../backgroundJobs'

const save = () => runInBackground(`git:${file}`, `Save to Git · ${name}`, async (progress) => {
  progress('Writing…')
  try { await write(); return { text: 'Saved to Git.' } }
  catch (error) { return { text: `Not saved: ${String(error)}`, failed: true } }
})

const importDone = (count: number) => recordJob(`import:${view.id}`, `Import · ${view.name}`, { text: `${count} rows imported.` })

{loading && <p className="muted" role="status">Loading the releases…</p>}
{!loading && !rows.length && <EmptyState title="No releases in November 2026." detail="Choose another month or read the source again with ↻." />}
{stale && <Notice tone="warning">The source was read 3 days ago; the counts may be out of date. Read it again with ↻.</Notice>}
```

## Do not

- `<Notice tone="success">Saved</Notice>` on the page after an action.
- Spinners or loading text without `role="status"`; "Please wait".
- An empty state whose title has no full stop or whose detail does not say what to do.

## Checklist

- [ ] Action results → Background jobs (`recordJob` / `runInBackground`).
- [ ] Warnings about shown data → `Notice` warning on the page.
- [ ] Help → ⓘ; empty → `EmptyState`; loading → muted `role="status"` "Loading {what}…".
