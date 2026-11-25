import { additive, hasOptions, type Insight, type OnDemandColumn, type OnDemandPage, type OnDemandRow } from './onDemand.ts'
import { bucketsOf, dateGroupLabels, grainOf, noneKey, otherKey, pivotColumnFields, pivotRowFields, prepare, valueText, type Bucket, type InsightData } from './onDemandInsights.ts'

// CHT-74…CHT-82 The nested Pivot table (chart type 'table' with more than one row or column field): rows by up to 3
// fields, outermost first, columns by up to 2, a subtotal for every row group (on the group's own row) and for every
// outer column (a Subtotal column), and the grand totals. Every number — a cell, a subtotal or a total — is the measure
// over the rows of that group, each row once (CHT-76): an average, minimum, maximum or distinct count is computed from
// the rows, never by adding up the cells below it. Kept free of React so that every rule is tested on its own
// (tests/pivot-table.test.mjs); drawn by src/components/NestedPivot.tsx.

// A value column of the table: a leaf (a value of the column field, or of both), an outer column's Subtotal, or the Total.
export interface PivotColumn { key: string; path: string[]; labels: string[]; kind: 'leaf' | 'subtotal' | 'total' }
// The first heading row with two column fields: each outer value over its inner values and its Subtotal.
export interface PivotHeadGroup { key: string; label: string; span: number }
// A row of the table: a group (a value of a row field with the next field's values inside it, its numbers the
// subtotals) or a leaf (a value of the last row field). key: the bucket keys of its path, unique in the table.
export interface PivotNode { key: string; path: string[]; labels: string[]; depth: number; children: PivotNode[]; values: (number | null)[] }
export interface PivotData {
  rowFields: OnDemandColumn[]
  columnFields: OnDemandColumn[]
  columns: PivotColumn[]
  head: PivotHeadGroup[] // [] with fewer than two column fields
  rows: PivotNode[] // the outermost groups (or rows), in their order
  total: (number | null)[] // the Total row, one value per column
  unit: '' | '%'
  kept: string[] | null // Show (Top N): the outer values kept, the rest in "Other"; null: all
  counted: InsightData['rows']
  currencies: InsightData['currencies']
  currency: string
}
// CHT-81: the most value cells drawn at once (the rest are in Export) and the most value columns drawn.
export const maxPivotCells = 2000, maxPivotDrawnColumns = 200
const sep = '\u0001', axis = '\u0002'
// The lengths keep "(none)" (key '') apart from the level above it.
const keyOf = (rows: string[], cols: string[]) => `${rows.length}${rows.join(sep)}${axis}${cols.length}${cols.join(sep)}`

interface Acc { sum: number; n: number; min: number; max: number; seen?: Set<string> }
const measured = (measure: Insight['measure'], acc: Acc | undefined): number | null => {
  if (measure === 'count') return acc?.n ?? 0
  if (measure === 'distinct') return acc?.seen?.size ?? 0
  if (!acc || !acc.n) return measure === 'sum' ? 0 : null
  return measure === 'average' ? acc.sum / acc.n : measure === 'min' ? acc.min : measure === 'max' ? acc.max : acc.sum
}
// Every combination of one bucket per field (a Multi-select row is in each of its values).
const combos = (lists: Bucket[][]): Bucket[][] => lists.reduce<Bucket[][]>((all, list) => all.flatMap((combo) => list.map((bucket) => [...combo, bucket])), [[]])
const rank = (bucket: Bucket) => bucket.key === otherKey ? 2 : bucket.key === noneKey ? 1 : 0
// Dropdown / Multi-select by their option order, Date by period, Text by name; "(none)" and "Other" last.
const natural = (column: OnDemandColumn) => (a: Bucket, b: Bucket) => rank(a) - rank(b) || (hasOptions(column.type) ? column.options.indexOf(a.key) - column.options.indexOf(b.key) : 0) || a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: 'base' })

// The buckets of one measured row in each field; the outer row field mapped to "Other" when Show keeps the N largest.
function bucketsFor(fields: OnDemandColumn[], row: OnDemandRow, insight: Insight, kept: Set<string> | null, outer: boolean): Bucket[][] {
  const grain = grainOf(insight)
  return fields.map((field, level) => {
    const list = bucketsOf(field, row.cells[field.id], grain)
    if (!outer || level || !kept) return list
    const mapped = list.map((bucket) => kept.has(bucket.key) ? bucket : { key: otherKey, label: 'Other' })
    return mapped.filter((bucket, index) => mapped.findIndex((entry) => entry.key === bucket.key) === index)
  })
}

export function pivotData(page: OnDemandPage, insight: Insight, currency = ''): PivotData {
  const columnOf = (id: string) => page.columns.find((column) => column.id === id)
  const rowFields = pivotRowFields(insight).map(columnOf).filter((column): column is OnDemandColumn => Boolean(column))
  const columnFields = pivotColumnFields(insight).map(columnOf).filter((column): column is OnDemandColumn => Boolean(column))
  const prep = prepare(page, insight, currency)
  const entries = prep.prepared
  // CHT-04 Show (Top N): the outer row field's N largest values (by the measure over each row once), the rest as "Other".
  const top = insight.options?.top
  let kept: Set<string> | null = null
  if (typeof top === 'number' && rowFields[0]) {
    const totals = new Map<string, Acc>()
    for (const entry of entries) for (const bucket of bucketsFor(rowFields.slice(0, 1), entry.row, insight, null, true)[0]) add(totals, bucket.key, entry.x, entry.d)
    const real = [...totals.keys()].filter((key) => key !== noneKey)
    if (real.length > top) kept = new Set(real.sort((a, b) => (measured(insight.measure, totals.get(b)) ?? 0) - (measured(insight.measure, totals.get(a)) ?? 0) || a.localeCompare(b)).slice(0, top))
  }
  // Each row adds once to every group it is in: the cells, the row groups' subtotals, the outer columns' subtotals and
  // the totals (CHT-76) — a key reached twice by a Multi-select row is counted once.
  const accs = new Map<string, Acc>()
  const seenRows = rowFields.map(() => new Map<string, Bucket>()), seenCols = columnFields.map(() => new Map<string, Bucket>())
  let multi = false
  for (const entry of entries) {
    const rowLists = bucketsFor(rowFields, entry.row, insight, kept, true), colLists = bucketsFor(columnFields, entry.row, insight, null, false)
    if ([...rowLists, ...colLists].some((list) => list.length > 1)) multi = true
    const keys = new Set<string>()
    for (const rowCombo of combos(rowLists)) {
      rowCombo.forEach((bucket, level) => seenRows[level].set(rowCombo.slice(0, level + 1).map((entry) => entry.key).join(sep), bucket))
      for (const colCombo of combos(colLists)) {
        colCombo.forEach((bucket, level) => seenCols[level].set(colCombo.slice(0, level + 1).map((entry) => entry.key).join(sep), bucket))
        for (let r = 0; r <= rowCombo.length; r++) for (let c = 0; c <= colCombo.length; c++) keys.add(keyOf(rowCombo.slice(0, r).map((bucket) => bucket.key), colCombo.slice(0, c).map((bucket) => bucket.key)))
      }
    }
    for (const key of keys) add(accs, key, entry.x, entry.d)
  }
  const value = (rows: string[], cols: string[]) => measured(insight.measure, accs.get(keyOf(rows, cols)))
  // The columns: with one field its values and the Total; with two each outer value's inner values and its Subtotal,
  // then the Total; with none the measure alone (the Total).
  const outerCols = [...seenCols[0]?.values() ?? []].sort(columnFields[0] ? natural(columnFields[0]) : () => 0)
  const columns: PivotColumn[] = []
  const head: PivotHeadGroup[] = []
  for (const outer of outerCols) {
    if (columnFields.length < 2) { columns.push({ key: `L${outer.key}`, path: [outer.key], labels: [outer.label], kind: 'leaf' }); continue }
    const inner = [...seenCols[1].entries()].filter(([path]) => path.split(sep)[0] === outer.key).map(([, bucket]) => bucket).sort(natural(columnFields[1]))
    for (const bucket of inner) columns.push({ key: `L${outer.key}${sep}${bucket.key}`, path: [outer.key, bucket.key], labels: [outer.label, bucket.label], kind: 'leaf' })
    columns.push({ key: `S${outer.key}`, path: [outer.key], labels: [outer.label], kind: 'subtotal' })
    head.push({ key: outer.key, label: outer.label, span: inner.length + 1 })
  }
  columns.push({ key: 'T', path: [], labels: [], kind: 'total' })
  // The rows: the outer values largest first (Sort: Largest first) or in their natural order; inside a group in the
  // natural order (option order, by date, by name); "(none)" and "Other" last.
  const build = (parent: string[], depth: number): PivotNode[] => {
    if (depth >= rowFields.length) return []
    const prefix = parent.join(sep)
    const list = [...seenRows[depth].entries()].filter(([path]) => depth === 0 || path.startsWith(`${prefix}${sep}`) && path.split(sep).length === depth + 1).map(([path, bucket]) => ({ path: path.split(sep), bucket }))
    const order = natural(rowFields[depth])
    list.sort((a, b) => depth === 0 && insight.sort === 'value' ? rank(a.bucket) - rank(b.bucket) || (value(b.path, []) ?? -Infinity) - (value(a.path, []) ?? -Infinity) || order(a.bucket, b.bucket) : order(a.bucket, b.bucket))
    return list.map(({ path }) => ({ key: path.join(sep), path, labels: labelsOf(path, seenRows), depth, children: build(path, depth + 1), values: columns.map((column) => value(path, column.path)) }))
  }
  let rows = build([], 0)
  const total0 = columns.map((column) => value([], column.path))
  // CHT-06 Percent of total: each number as a share of the grand total (Count of rows and Sum only).
  const percent = Boolean(insight.options?.percent) && additive(insight.measure)
  const grand = value([], []) ?? 0
  if (percent) {
    const share = (entry: number | null) => entry == null ? null : grand ? entry / grand * 100 : 0
    const shares = (nodes: PivotNode[]): PivotNode[] => nodes.map((node) => ({ ...node, values: node.values.map(share), children: shares(node.children) }))
    rows = shares(rows)
  }
  return {
    rowFields, columnFields, columns, head, rows, total: percent ? total0.map((entry) => entry == null ? null : grand ? entry / grand * 100 : 0) : total0, unit: percent ? '%' : '', kept: kept ? [...kept] : null,
    counted: { all: page.rows.length, matched: prep.matched.length, used: entries.length, noNumber: insight.measure === 'count' || insight.measure === 'distinct' ? 0 : prep.noNumber, noDate: prep.noDate, multi, otherCurrency: prep.otherCurrency },
    currencies: prep.currencies, currency: prep.currency,
  }
}
function add(map: Map<string, Acc>, key: string, value: number, distinct?: string[]) {
  const acc = map.get(key) ?? { sum: 0, n: 0, min: Infinity, max: -Infinity }
  acc.sum += value; acc.n += 1; acc.min = Math.min(acc.min, value); acc.max = Math.max(acc.max, value)
  if (distinct) { acc.seen ??= new Set(); for (const entry of distinct) acc.seen.add(entry) }
  map.set(key, acc)
}
const labelsOf = (path: string[], seen: Map<string, Bucket>[]) => path.map((_, level) => seen[level].get(path.slice(0, level + 1).join(sep))?.label ?? '')

// ---- the lines drawn (CHT-77, CHT-81) ----
// Every group's key (to close them all); a group is a row with rows inside it.
export function groupKeys(nodes: PivotNode[]): string[] {
  return nodes.flatMap((node) => node.children.length ? [node.key, ...groupKeys(node.children)] : [])
}
// The lines in order — a group's own line (its subtotals) and, while it is open, its rows — for the first `limit` outer
// rows (all when absent). collapsed: the keys of the closed groups.
export interface PivotLine { node: PivotNode; group: boolean; open: boolean }
export function pivotLines(data: Pick<PivotData, 'rows'>, collapsed: ReadonlySet<string> = new Set(), limit?: number): PivotLine[] {
  const walk = (nodes: PivotNode[]): PivotLine[] => nodes.flatMap((node) => {
    const group = node.children.length > 0, open = group && !collapsed.has(node.key)
    return [{ node, group, open }, ...(open ? walk(node.children) : [])]
  })
  return walk(limit == null ? data.rows : data.rows.slice(0, limit))
}
// CHT-81: what is drawn at most — the first 200 value columns (the Total always) and as many lines as keep the cells at
// 2,000 or fewer (at least one); capped says that something was left out (Export has everything).
export function pivotCap(lines: number, columns: number, cells = maxPivotCells): { lines: number; columns: number; capped: boolean } {
  const drawnColumns = Math.min(columns, maxPivotDrawnColumns)
  const drawnLines = Math.min(lines, Math.max(1, Math.floor(cells / Math.max(1, drawnColumns))))
  return { lines: drawnLines, columns: drawnColumns, capped: drawnLines < lines || drawnColumns < columns }
}
// The columns drawn: the first ones and, when columns are left out, the Total last.
export const drawnColumns = (columns: PivotColumn[], count: number) => count >= columns.length ? columns : [...columns.slice(0, count - 1), columns[columns.length - 1]]

// ---- words ----
// The heading of a field: its name, a Date column with its period ("Found on (month)").
export const fieldHeading = (column: OnDemandColumn, insight: Insight) => `${column.name}${column.type === 'date' ? ` (${dateGroupLabels[grainOf(insight)].unit})` : ''}`
export const columnLabel = (page: OnDemandPage, insight: Insight, column: PivotColumn, currency = '') => column.kind === 'total' ? pivotColumnFields(insight).length ? 'Total' : valueText(page, insight, currency) : column.kind === 'subtotal' ? `${column.labels[0]} · Subtotal` : column.labels.join(' · ')
// "Epic A · Feature X · Jan 2026" — the groups of a cell, for the drill-down's title and a cell's accessible name.
export function cellWhere(node: PivotNode | null, column: PivotColumn | null): string {
  const parts = [...(node?.labels ?? []), ...(column && column.kind !== 'total' ? column.labels : [])]
  return parts.length ? parts.join(' · ') : 'Total'
}

// ---- the drill-down (CHT-80) ----
// The rows behind a cell, a subtotal or a total: the measured rows in every group of its row path and column path
// ("Other" for the outer values Show left out), each once.
export function pivotRows(page: OnDemandPage, insight: Insight, data: Pick<PivotData, 'rowFields' | 'columnFields' | 'kept' | 'currency'>, rowPath: string[], colPath: string[]): OnDemandRow[] {
  const kept = data.kept ? new Set(data.kept) : null
  return prepare(page, insight, data.currency).prepared.filter((entry) => {
    const rows = bucketsFor(data.rowFields, entry.row, insight, kept, true), cols = bucketsFor(data.columnFields, entry.row, insight, null, false)
    return rowPath.every((key, level) => rows[level]?.some((bucket) => bucket.key === key)) && colPath.every((key, level) => cols[level]?.some((bucket) => bucket.key === key))
  }).map((entry) => entry.row)
}

// ---- Export (CHT-80) ----
// A flat table: one column per row field, a Line column ("Subtotal" on a group's line, "Total" on the last line, empty
// on a row), then one column per value column — the column fields' combinations ("Stream A · Jan 2026"), the outer
// Subtotals and the Total — as numbers to 2 decimals; every line, whatever is open, shown or capped on screen.
export function pivotExport(page: OnDemandPage, insight: Insight, data: PivotData): { head: string[]; rows: (string | number)[][] } {
  const number = (value: number | null) => value == null ? '' : Number(value.toFixed(2))
  const head = [...data.rowFields.map((field) => fieldHeading(field, insight)), 'Line', ...data.columns.map((column) => columnLabel(page, insight, column, data.currency))]
  const lines = pivotLines(data).map(({ node, group }) => [...data.rowFields.map((_, level) => node.labels[level] ?? ''), group ? 'Subtotal' : '', ...node.values.map(number)])
  const total = [...data.rowFields.map((_, level) => level ? '' : 'Total'), 'Total', ...data.total.map(number)]
  return { head, rows: [...lines, total] }
}
