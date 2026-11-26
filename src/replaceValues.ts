import { capLog, cellText, currentValue, listRefs, newId, valuesOf, type LogEntry, type OnDemandColumn, type OnDemandPage, type OnDemandValue } from './onDemand.ts'

// OND-100…OND-102 Replace…: one value of one column replaced by another in every row that holds it — e.g. a QE
// who leaves hands their releases over to one person. A cell matches when it is the value as a whole, ignoring case and
// the spaces around it ("alex example " matches "Alex Example"; "Alex Example Jr" does not). The new value is written as
// typed (trimmed). A cell that already holds exactly the new value is not changed. In a Multi-select cell each value of
// the list is compared on its own.
export const normalValue = (value: string) => value.trim().toLowerCase()
export const sameValue = (cell: string, find: string) => normalValue(find) !== '' && normalValue(cell) === normalValue(find)

// The distinct values of a column with how many rows hold each, most rows first (then A–Z); values that differ only in
// case or surrounding spaces count as one, shown as the spelling most rows use (the first one met on a tie). Blank
// cells are left out.
export interface ValueCount { value: string; count: number }
export function distinctValues(cells: string[][]): ValueCount[] {
  const groups = new Map<string, { spellings: Map<string, number>; rows: number }>()
  for (const values of cells) {
    for (const key of new Set(values.map(normalValue).filter(Boolean))) {
      const group = groups.get(key) ?? { spellings: new Map(), rows: 0 }
      group.rows++
      groups.set(key, group)
    }
    for (const value of values) { const key = normalValue(value); if (key) { const group = groups.get(key)!; const shown = value.trim(); group.spellings.set(shown, (group.spellings.get(shown) ?? 0) + 1) } }
  }
  return [...groups.values()].map((group) => ({ value: [...group.spellings].sort((a, b) => b[1] - a[1])[0][0], count: group.rows }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, undefined, { sensitivity: 'base', numeric: true }))
}

// One row the replace changes: its label (the ID or key shown), the old and the new text.
export interface ReplaceChange { id: string; label: string; from: string; to: string }
// What Replace would do: the rows it changes and the rows it leaves although they match (locked by someone else, hidden).
export interface ReplacePlan { changes: ReplaceChange[]; locked: number; hidden: number }
export const maxReplaceValue = 2000
export const replaceMessage = (find: string, to: string, column: string) => `Replaced “${find.trim()}” with “${to.trim()}” in ${column}`

// ---- On-Demand pages (OND-100…OND-102) ----
// The columns whose values can be replaced: Text, Long text, Dropdown and Multi-select (a Number, Currency or Date is a
// value of its own, not a name that is handed over).
export const replaceableTypes: OnDemandColumn['type'][] = ['text', 'longtext', 'dropdown', 'multi']
export const replaceableColumns = (page: Pick<OnDemandPage, 'columns'>) => page.columns.filter((column) => replaceableTypes.includes(column.type))
// The value a cell gets: the matching value replaced (in a Multi-select list each one; a value the list then holds twice
// is kept once); null when nothing changes.
function replacedValue(column: OnDemandColumn, value: OnDemandValue | undefined, find: string, to: string): OnDemandValue | null {
  if (column.type === 'multi') {
    const list = valuesOf(value)
    if (!list.some((item) => sameValue(item, find))) return null
    const next = [...new Set(list.map((item) => sameValue(item, find) ? to : item))]
    return next.join('\u0000') === list.join('\u0000') ? null : next
  }
  const text = cellText(value)
  return sameValue(text, find) && text !== to ? to : null
}
// Why the replace cannot be done ('' when it can): a value to find and a new one are needed; a Dropdown or Multi-select
// takes only a value of its list (add it with Set up columns… first), so no row is left "not in the list".
export function replaceError(column: OnDemandColumn | undefined, find: string, to: string): string {
  if (!column) return 'Choose a column.'
  if (!replaceableTypes.includes(column.type)) return `${column.name} is a ${column.type === 'currency' ? 'Currency' : column.type === 'number' ? 'Number' : 'Date'} column: only Text, Long text, Dropdown and Multi-select values are replaced.`
  if (!find.trim()) return 'Choose or type the value to find.'
  if (!to.trim()) return 'Type the new value.'
  if (to.trim().length > maxReplaceValue) return `The new value is longer than ${maxReplaceValue.toLocaleString('en-US')} characters.`
  // LST-10: a built-in list column takes only a value of its list (the list is changed in Admin, not here).
  if (column.list && !column.options.includes(to.trim())) return `“${to.trim()}” is not in the built-in list of ${column.name}. Choose one of its values, or add it to the list (Admin → Epic & Feature setup → Value lists) first.`
  if ((column.type === 'dropdown' || column.type === 'multi') && !column.options.includes(to.trim())) return `“${to.trim()}” is not an option of ${column.name}. Add it with Set up columns… first, or choose one of its options.`
  return ''
}
// OND-101: the rows a replace changes. Hidden rows (OND-39) are left as they are; rows locked by someone else (OND-35,
// `locked`: their keys) are skipped and counted, so an edit in progress is never overwritten.
export function onDemandReplacePlan(page: OnDemandPage, columnId: string, find: string, to: string, { locked = new Set<string>(), label = (row: OnDemandPage['rows'][number]) => row.key ?? row.id }: { locked?: Set<string>; label?: (row: OnDemandPage['rows'][number]) => string } = {}): ReplacePlan {
  const column = page.columns.find((entry) => entry.id === columnId)
  const target = to.trim()
  const plan: ReplacePlan = { changes: [], locked: 0, hidden: 0 }
  if (!column || !replaceableTypes.includes(column.type) || !target) return plan
  for (const row of page.rows) {
    // LST-09: a built-in list value is found by the name the list has now (a renamed person).
    const next = replacedValue(column, currentValue(column, row), find, target)
    if (next == null) continue
    if (row.hidden) plan.hidden++
    else if (row.key && locked.has(row.key)) plan.locked++
    else plan.changes.push({ id: row.id, label: label(row), from: cellText(row.cells[columnId]), to: cellText(next) })
  }
  return plan
}
// OND-101: the page with the replace done — each changed row gets one entry in its update log (OND-21): who, when, the
// field old → new and the comment "Replaced “X” with “Y” in {column}". Applied to the page as it is in Git when the save
// is made (GIT-17, OND-33), so a row changed meanwhile is judged on its value then.
export interface ReplaceEdit { by?: string; locked?: Set<string>; random?: () => number; now?: () => number }
export function applyOnDemandReplace(page: OnDemandPage, columnId: string, find: string, to: string, edit: ReplaceEdit = {}): { page: OnDemandPage; changed: number; locked: number } {
  const { random = Math.random, now = Date.now, locked = new Set<string>() } = edit
  const column = page.columns.find((entry) => entry.id === columnId)
  const plan = onDemandReplacePlan(page, columnId, find, to, { locked })
  if (!column || !plan.changes.length) return { page, changed: 0, locked: plan.locked }
  const by = edit.by?.trim().slice(0, 200) || 'unknown', at = new Date(now()).toISOString(), target = to.trim()
  const ids = new Set(plan.changes.map((change) => change.id))
  const comment = replaceMessage(find, target, column.name).slice(0, 500)
  const rows = page.rows.map((row) => {
    if (!ids.has(row.id)) return row
    const value = replacedValue(column, currentValue(column, row), find, target)!
    const entry: LogEntry = { id: newId('l', random, now), at, by, comment, changes: [{ column: columnId, from: cellText(row.cells[columnId]).slice(0, 500), to: cellText(value).slice(0, 500) }] }
    // LST-09: the keys follow the new value (the new person's email from the list, the others' kept).
    const { refs: before, ...rest } = row
    const keys = listRefs(column, value, { cells: { [columnId]: currentValue(column, row) ?? '' }, refs: before })
    const refs = { ...before, ...(keys ? { [columnId]: keys } : {}) }
    if (!keys) delete refs[columnId]
    return { ...rest, ...(Object.keys(refs).length ? { refs } : {}), cells: { ...row.cells, [columnId]: value }, log: capLog([...(row.log ?? []), entry]) }
  })
  return { page: { ...page, rows }, changed: ids.size, locked: plan.locked }
}
export const onDemandReplaceCommit = (page: Pick<OnDemandPage, 'name'>, column: string, find: string, to: string, changed: number) => `${page.name}: replace “${find.trim()}” with “${to.trim()}” in ${column} (${changed} row${changed === 1 ? '' : 's'})`
