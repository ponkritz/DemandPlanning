---
name: ui-defaults
description: What a person gets without choosing in the Demand Planning app — what may be pre-ticked, pre-filled or pre-selected, the first tab, the default sort, the default period, and keeping defaults visible and the same on every page (UI-STANDARDS §12). Use whenever a control gets an initial value.
---

# UI defaults (UI-STANDARDS §12)

## Building blocks

- `DataTable` — `src/components/DataTable.tsx` (`defaultSort`, `firstSortDesc`; the default sort shows in the header)
- `SectionTabs` — `src/components/SectionTabs.tsx`, `ResultTabs` — `src/components/ResultTabs.tsx` (remember the last tab per page)

## Rules

- **Pre-ticked** only for what is the person's **own and safe**. Never pre-tick anything that writes for or shares with others — other people's items start unticked.
- **Pre-filled** text is a real default the person would keep — never a placeholder that gets saved (no pre-filled "Reason for change" that reads as an approval). Put examples in `placeholder`, not in `value`.
- **Pre-selected**: only when there is exactly **one** sensible value. With several (overlapping PI / Sprint), nothing is chosen and the person must pick (`required`, empty first option "Choose…").
- **First tab / section**: the overview or the most used one; the last choice is remembered per page (the tab blocks do this).
- **Sort**: newest first for dated lists; by number for work items (Feature number); by name otherwise. The default sort shows in the header.
- **Period**: the top-bar month.
- A default that matters is **visible** on the page (not only in a tooltip) and the **same on every page** that shows the same thing.
- **Approved exception**: in the PI review form (PIR-13) and the Close pop-up's PI review (PIR-18), **Move to next PI = No** is pre-selected, and shows in the form and the Preview. The Review meeting advice has no default.
- A new default that is not obvious goes in the PR description so the UI/UX reviewer can add it to its UI defaults register.

## Pattern

```tsx
// Bulk close: my own items ticked, other people's not.
const [selected, setSelected] = useState(() => items.filter((item) => item.assignedTo === me).map((item) => item.id))

// Several possible Sprints: nothing chosen, the person picks.
<label>Sprint<select required value={sprint} onChange={(e) => setSprint(e.target.value)}>
  <option value="" disabled>Choose…</option>
  {sprints.map((s) => <option key={s.path} value={s.path}>{s.name}</option>)}
</select></label>

// Dated list: newest first.
<DataTable … defaultSort={{ id: 'approved', desc: true }} />
```

## Do not

- Pre-tick "Share with everyone", "Post to Azure DevOps" or other people's items.
- Pre-fill a value that would be saved without the person meaning it.
- Pick one of several overlapping PIs / Sprints for the person.

## Checklist

- [ ] Pre-ticked only own + safe; pre-filled only real defaults; pre-selected only with one sensible value.
- [ ] Default sort and period follow the rules and show on the page.
- [ ] Non-obvious defaults named in the PR.
