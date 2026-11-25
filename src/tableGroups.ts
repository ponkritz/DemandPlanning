// UI-25…UI-28 Group by and Filter by column in the shared DataTable (built once, switched on per table; first for the
// On-Demand Table pages, OND-132). The same rules as the QE Mapping (QEM-03, QEM-06, QEM-10, QEM-11), which uses
// groupTree too: a column filter keeps the rows whose value as shown contains the text, in any case; Group by nests up
// to four columns, outermost first, each group in natural order with "(blank)" last. A cell may hold several values
// (a Multi-select): the row is in the group of each of its values, so the counts of one level can add up to more than
// the rows; it is filtered on any of them.

export const maxGroupLevels = 4

// A cell as shown, as a list of values (one, several for a Multi-select, none for an empty cell).
export type ShownValue = string | string[] | undefined
export const shownValues = (value: ShownValue): string[] => (Array.isArray(value) ? value : [value ?? '']).map((entry) => entry.trim()).filter(Boolean)

// QEM-03: contains, in any case. UI-26: a column with a pick list (Dropdown, Multi-select) matches a value of the list
// exactly (any case), so "Open" does not also keep "Reopened"; any other text is still a "contains" filter.
export function matchesColumnFilter(values: string[], filter: string, options?: string[]) {
  const wanted = filter.trim().toLowerCase()
  if (!wanted) return true
  if (options?.some((option) => option.toLowerCase() === wanted)) return values.some((value) => value.toLowerCase() === wanted)
  return values.some((value) => value.toLowerCase().includes(wanted))
}
export const activeFilters = (filters: Record<string, string> | undefined) => Object.entries(filters ?? {}).filter(([, value]) => value.trim())

// The rows every active column filter keeps (all of them: the filters add up, after the table's own search).
export function filterTableRows<T>(rows: T[], filters: Record<string, string> | undefined, valueOf: (row: T, columnId: string) => ShownValue, optionsOf: (columnId: string) => string[] | undefined = () => undefined): T[] {
  const active = activeFilters(filters)
  if (!active.length) return rows
  const options = active.map(([id]) => optionsOf(id))
  return rows.filter((row) => active.every(([id, filter], index) => matchesColumnFilter(shownValues(valueOf(row, id)), filter, options[index])))
}

// Group values in natural order (2 before 10, any case), "(blank)" (the empty value) last.
export const compareGroupValues = (a: string, b: string) => a === '' ? (b === '' ? 0 : 1) : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

// One group: its key is the path of values from the outermost level (unique across levels, so that each group can be
// opened and closed on its own); rows are the rows under it, in the order given (the table's sort).
export interface TableGroup<T> { key: string; columnId: string; value: string; depth: number; rows: T[]; children: TableGroup<T>[] }
export function groupTree<T>(rows: T[], columnIds: string[], valueOf: (row: T, columnId: string) => ShownValue, path: string[] = []): TableGroup<T>[] {
  const [first, ...rest] = columnIds
  if (!first) return []
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const values = shownValues(valueOf(row, first))
    for (const value of values.length ? [...new Set(values)] : ['']) { const list = groups.get(value); if (list) list.push(row); else groups.set(value, [row]) }
  }
  return [...groups.entries()].sort(([a], [b]) => compareGroupValues(a, b)).map(([value, items]) => ({ key: JSON.stringify([...path, value]), columnId: first, value, depth: path.length, rows: items, children: groupTree(items, rest, valueOf, [...path, value]) }))
}
export const groupKeys = <T>(groups: TableGroup<T>[]): string[] => groups.flatMap((group) => [group.key, ...groupKeys(group.children)])
// Every row once, in the order the groups show them (a Multi-select row where it first appears): for Export and for
// Previous / Next in the row drawer.
export function groupedOrder<T>(groups: TableGroup<T>[]): T[] {
  const seen = new Set<T>(), out: T[] = []
  const walk = (list: TableGroup<T>[]) => { for (const group of list) { if (group.children.length) walk(group.children); else for (const row of group.rows) if (!seen.has(row)) { seen.add(row); out.push(row) } } }
  walk(groups)
  return out
}

// What is drawn: each group row, and under an open group its sub-groups or its rows; at most `limit` data rows in all
// ("Show more" / paging). The open / closed state is the viewer's, for this visit (UI-27).
export type GroupLine<T> = { kind: 'group'; group: TableGroup<T>; open: boolean } | { kind: 'row'; row: T; group: string }
export function groupLines<T>(groups: TableGroup<T>[], isOpen: (key: string) => boolean, limit = Infinity): GroupLine<T>[] {
  const out: GroupLine<T>[] = []
  let left = limit
  const walk = (list: TableGroup<T>[]) => {
    for (const group of list) {
      if (left <= 0) return
      const open = isOpen(group.key)
      out.push({ kind: 'group', group, open })
      if (!open) continue
      if (group.children.length) walk(group.children)
      else for (const row of group.rows) { if (left <= 0) return; out.push({ kind: 'row', row, group: group.key }); left-- }
    }
  }
  walk(groups)
  return out
}

// UI-27: the open / closed state of the groups for this visit: every group starts open, or closed with "Start
// collapsed" (the view for everyone); `flipped` holds the groups opened or closed since. Expand all / Collapse all set
// every group, at every level, one way; Collapse all leaves only the outermost group rows.
export interface GroupState { closed: boolean; flipped: string[] }
export const isGroupOpen = (state: GroupState, key: string) => state.closed === state.flipped.includes(key)
export const toggleGroup = (state: GroupState, key: string): GroupState => ({ ...state, flipped: state.flipped.includes(key) ? state.flipped.filter((entry) => entry !== key) : [...state.flipped, key] })
export const canExpandAll = (state: GroupState, keys: string[]) => keys.some((key) => !isGroupOpen(state, key))
export const canCollapseAll = (state: GroupState, keys: string[]) => keys.some((key) => isGroupOpen(state, key))

// UI-29: the rows actually visible — every row once, in the order of the groups, under a group whose every level is
// open (a Multi-select row is visible when any of its groups is open, and listed where it first shows). Export, "Select every row shown" and Previous /
// Next in the row drawer act on these only; opening a group brings its rows back.
export function visibleRows<T>(groups: TableGroup<T>[], isOpen: (key: string) => boolean): T[] {
  const seen = new Set<T>(), out: T[] = []
  const walk = (list: TableGroup<T>[]) => { for (const group of list) { if (!isOpen(group.key)) continue; if (group.children.length) walk(group.children); else for (const row of group.rows) if (!seen.has(row)) { seen.add(row); out.push(row) } } }
  walk(groups)
  return out
}
