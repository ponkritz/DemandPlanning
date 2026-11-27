---
name: ui-tables
description: How to build any list of records in the Demand Planning app — DataTable inside TablePanel with sortable headers, Export, Columns, counts, empty message, right-aligned numbers with units in headers, the Actions column, sticky headers and scroll bar, Group by / Filter by column, selection for bulk actions (UI-STANDARDS §5). Use whenever rows of data are shown.
---

# Tables (UI-STANDARDS §5)

## Building blocks

- `DataTable` — `src/components/DataTable.tsx` (the one table of the app)
- `TablePanel` — `src/components/ui.tsx` (heading, `count`, `action`, `empty`)
- `WriteBlocked` — `src/components/ui.tsx` (one reason line above a table of row buttons)

`DataTable` props you will use most: `id` (stable, required — viewer choices are kept under it), `columns`, `rows`,
`rowKey`, `exportName` (no name → no Export), `toolbar`, `status`, `limit`, `defaultSort`, `empty`, `totals`,
`onRowOpen` + `rowLabel` (drawer, see `ui-drawers`), `selection` (bulk tick boxes), `groupFilter` (Group by / Filter by
column), `expand`, `subRows`. Column (`DataColumn<T>`): `id`, `label`, `value`, `render`, `align`, `sortable`, `export`,
`defaultHidden`, `hint`, `firstSortDesc`, `fixed`, `shown`, `groupable`, `filterOptions`.

## Rules

- **Every list of records** = `DataTable` in a `TablePanel`. You get sorting, Export (Excel / CSV), Columns, resizing, wrap, density, the "Showing the first N of M" line, the empty message, the sticky header and the **sticky horizontal scroll bar** — never build any of them yourself.
- A hand-built `<table>` only for a **small fixed grid** (a matrix, a settings list of up to ~10 rows); it still follows the rules below.
- **Numbers**: `align: 'right'` (or class `num` on a hand-built grid). The **unit goes in the header** — `Planned (h)`, `Share (%)` — never in the cells.
- **Empty**: a sentence ending with a full stop — "No releases in November 2026."
- **Count**: "{shown} of {total} {items}" — "12 of 40 releases". A cut list always says so.
- **Row actions**: last column, headed **Actions**: **Edit** (`ghost`), **Open →** (`text-button`), **Remove** (`text-button danger-text`). Set `sortable: false, export: false` on it.
- **Missing permission on row buttons**: one `WriteBlocked` line above the table; each row button disabled with the same reason as `title`.
- **Sort default**: newest first for dated lists (`firstSortDesc` / `defaultSort: { id, desc: true }`), by number for work items, by name otherwise (see `ui-defaults`).
- **Group by / Filter by column**: switch on with `groupFilter`; never build your own. Give list columns `filterOptions`, and `groupable: false` on ID columns.
- **Bulk selection**: `selection={{ selected, onChange, label, blocked }}`; `blocked(row)` returns why a row cannot be ticked.
- Inside a `TablePanel` the toolbar, first column and read-only line align with the panel title automatically — do not add padding.

## Pattern

```tsx
import { DataTable, type DataColumn } from '../components/DataTable'
import { TablePanel, WriteBlocked } from '../components/ui'

const { why } = useWriteBlock()
const blocked = why('release.edit')
const columns: DataColumn<Release>[] = [
  { id: 'name', label: 'Release name', value: (r) => r.name },
  { id: 'approved', label: 'Approved', value: (r) => r.approved, firstSortDesc: true },
  { id: 'documents', label: 'Documents', value: (r) => r.documents.length, align: 'right' },
  { id: 'planned', label: 'Planned (h)', value: (r) => r.planned, align: 'right' },
  { id: 'actions', label: 'Actions', sortable: false, export: false, render: (r) => <div className="button-row">
    <button type="button" className="ghost" disabled={Boolean(blocked)} title={blocked || undefined} onClick={() => edit(r)}>Edit</button>
    <button type="button" className="text-button" onClick={() => open(r)}>Open →</button>
  </div> },
]

<TablePanel title="Releases" info="One row per release approved in the month." count={`${shown.length} of ${rows.length} releases`}>
  <WriteBlocked reason={blocked} />
  <DataTable id="dp-releases" columns={columns} rows={shown} rowKey={(r) => r.id} exportName="DP releases"
    defaultSort={{ id: 'approved', desc: true }} empty="No releases in November 2026." />
</TablePanel>
```

## Do not

- A hand-built `<table>` for a list of records, or your own sort / export / scroll bar / group / filter code.
- Units in cells ("12 h"), left-aligned numbers, an empty message without a full stop.
- Other count wordings ("Total: 12", "12 items found") or a silent cut list.

## Checklist

- [ ] `DataTable` in `TablePanel` with a stable `id`.
- [ ] Numbers right-aligned, units in headers.
- [ ] Count "{shown} of {total} {items}"; empty sentence with full stop.
- [ ] Actions column last (Edit / Open → / Remove), not sortable, not exported.
- [ ] Default sort follows `ui-defaults`.
