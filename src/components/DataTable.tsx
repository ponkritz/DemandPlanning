import { useContext, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useCan } from '../useCan'
import { ExportNoteContext } from '../exportNote'
import { csvCell } from '../csv'
import { useTableDefaults } from './tableDesign'
import { compareCells, moveId, moveIdTo, orderedIds, tableCsv, tableSheet, totalsRow, type CellValue, type ExportFormat, type TableDensity } from '../tableDefaults'
import { chooseTableView, fitTableView, newerForEveryone, parseTableView, readOwnView, shareableView, startOwnView, writeOwnView, type TableView } from '../tableViews'
import { viewEntryKey } from '../personalViews'
import { resizeHandle, widthStyle } from './columnWidths'
import { ViewForEveryoneBar } from './ViewForEveryone'
import { useViewsForEveryone } from '../useViewsForEveryone'
import { downloadCsv, downloadXlsx } from '../download'
import { writeXlsx } from '../xlsx'
import { Info, Modal } from './ui'
import { StickyScrollbar } from './StickyScrollbar'
import { activeFilters, canCollapseAll, canExpandAll, filterTableRows, groupedOrder, groupKeys, groupLines, groupTree, isGroupOpen, maxGroupLevels, toggleGroup, visibleRows, type GroupState, type ShownValue } from '../tableGroups'

// The one table of the app (UI-07…12). Every table is built on it and follows the design default (Settings → Table
// defaults): resizable columns, columns moved by dragging a heading or with ↑ ↓ in the Columns list, columns ticked on
// or off, Wrap text, Compact / Comfortable, and one Export that offers Excel or CSV — dates written as real date-times.
// A table's own choices (widths, order, hidden columns, wrap, density, sort) are kept per table in the viewer's browser;
// UI-20…UI-23: a Tool Owner can save a table's view for everyone, which a viewer sees until they change their own.
// UI-24: a table wider than its box keeps a horizontal scroll bar at the bottom of the screen, above the footer, while
// its own bottom is out of view (StickyScrollbar).
// UI-25…UI-28 (switched on with groupFilter; first the On-Demand Table pages, OND-132): Group by up to four columns with
// ▸ / ▾ per group and Expand all / Collapse all, and Filter by column — both part of the table's view (own and for
// everyone), "Start collapsed" in the view for everyone; which groups are open is the viewer's, for this visit.

export interface DataColumn<T> {
  id: string
  label: string
  // The cell's value: shown when there is no render, used to sort and to export (a Date or an ISO date is exported as a date-time).
  value?: (row: T) => CellValue
  render?: (row: T) => ReactNode
  // Not offered to sort (e.g. a column of buttons); export: false leaves it out of the export.
  sortable?: boolean
  // false: never exported; 'always': exported even while hidden (e.g. the document names behind a count).
  export?: boolean | 'always'
  // Hidden until the viewer ticks it in the Columns list.
  defaultHidden?: boolean
  // What the column holds or how to fill it, behind ⓘ next to the heading (e.g. an On-Demand column's description).
  hint?: string
  // The value written by Export when it differs from the one sorted by (e.g. "1,200.00 EUR" sorted by 1200).
  exportValue?: (row: T) => CellValue
  // The first click sorts descending (newest / largest first), e.g. a date or a count.
  firstSortDesc?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
  title?: (row: T) => string | undefined
  // Kept first and never hidden or moved (e.g. a selection tick box).
  fixed?: boolean
  // Drawn in the heading instead of the label (e.g. the "select every row shown" tick box); the label stays its name.
  heading?: ReactNode
  // UI-25, UI-26: the value as shown, for Group by and Filter by column (default: the value as text); a list puts the row
  // under each of its values (a Multi-select).
  shown?: (row: T) => ShownValue
  // false: not offered in Group by (e.g. an ID, one group per row); it can still be filtered.
  groupable?: boolean
  // The values of the column's list (Dropdown, Multi-select): Filter by column offers them as a pick list.
  filterOptions?: string[]
}

export interface DataTableProps<T> {
  id: string // stable per table: the viewer's choices are kept under it
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  exportName?: string // file name without extension; no name, no Export
  toolbar?: ReactNode // the table's own controls (search, filters), shown left of the table controls
  status?: ReactNode | ((shown: number) => ReactNode) // e.g. "12 of 40 items"; a function gets the rows left after the column filters
  limit?: number // rows drawn at most (all are exported)
  defaultSort?: { id: string; desc?: boolean }
  sort?: { id: string; desc: boolean } | null // controlled sort (the owner sorts the rows itself)
  onSort?: (sort: { id: string; desc: boolean }) => void
  rowClassName?: (row: T) => string | undefined
  empty?: ReactNode
  footer?: ReactNode // rows after the data, drawn as given
  // A totals row that follows the columns as they are moved or hidden: a value per column id, the label in the first column without one.
  // DSH-14: exportValues — the Total row is also exported (after the rows), with these values (by column id).
  totals?: { label?: string; values: Record<string, ReactNode>; exportValues?: Record<string, CellValue> }
  className?: string
  caption?: string
  // A row's detail (e.g. its documents), drawn under it across all columns when given.
  expand?: (row: T) => ReactNode | null | undefined
  // Grouped rows (e.g. IOCC by Type of Release): the owner lays out group rows and calls row() for each data row; span
  // is the number of columns shown.
  group?: (rows: T[], row: (row: T) => ReactNode[], span: number) => ReactNode[]
  // Child rows drawn under a row with the same columns (a tree, e.g. a Feature's User Stories and Tasks); the owner
  // returns them only while the row is open.
  subRows?: (row: T) => T[] | undefined
  // OND-27: a row opens (e.g. in a drawer) on a click or Enter / Space; the rows are focusable, and the owner gets the
  // rows in the order shown (sort and filter) for Previous / Next. A click on a button, link or field in the row does not open it.
  onRowOpen?: (row: T, shown: T[]) => void
  rowLabel?: (row: T) => string // the accessible name of an opening row
  // CAP-60: rows ticked for a bulk action — a first column of tick boxes (kept first, never exported) with one in the
  // heading that ticks or unticks every row shown; selected holds row keys (rowKey), kept while filters change.
  // UI-31: blocked — why a row cannot be ticked ('' when it can): its tick box is disabled with the reason (its title and
  // accessible name); the heading's tick box ticks and unticks only the rows that can be ticked.
  selection?: { selected: string[]; onChange: (keys: string[]) => void; label?: (row: T) => string; blocked?: (row: T) => string }
  // UI-25…UI-28: Group by, Expand all / Collapse all and Filter by column for this table (OND-132: the On-Demand Table
  // pages). Another table gets them with this one prop.
  groupFilter?: boolean
  // UI-29: kept up to date with the rows actually visible (in the order shown, closed groups left out), for an action
  // outside the row click (e.g. a row's Edit button) that needs Previous / Next in that order.
  shownRef?: { current: T[] }
}

export function DataTable<T>({ id, columns: ownColumns, rows, rowKey, exportName, toolbar, status, limit, defaultSort, sort: controlledSort, onSort, rowClassName, empty, footer, className = '', caption, expand, group, totals, subRows, onRowOpen, rowLabel, selection, groupFilter = false, shownRef }: DataTableProps<T>) {
  const defaults = useTableDefaults()
  // UI-20…UI-23: the viewer's own view (this browser), else the view for everyone (shared views defaults in Git), else
  // the table's built-in one.
  const shared = useViewsForEveryone()
  const viewKey = viewEntryKey('table', id)
  const everyone = parseTableView(shared.everyone(viewKey))
  const everyoneMeta = everyone ? shared.meta(viewKey) : undefined
  const [own, setOwnState] = useState<TableView | undefined>(() => readOwnView(id))
  const setOwn = (next: TableView | undefined) => { setOwnState(next); writeOwnView(id, next) }
  const { view: layout, source } = chooseTableView(own, everyone)
  // A change: the own view, started from the view for everyone the first time.
  const setLayout = (change: Partial<TableView>) => setOwn(own ? { ...own, ...change } : startOwnView(everyone, everyoneMeta?.at, change))
  const [dragWidths, setDragWidths] = useState<Record<string, number> | null>(null)
  const widthMap = dragWidths ?? layout.widths ?? {}
  const wrap = defaults.wrapToggle && layout.wrap !== undefined ? layout.wrap : defaults.defaultWrap
  const widths = {
    style: (column: string) => widthStyle(widthMap, column),
    handle: (column: string, label: string) => resizeHandle({ column, label, widths: widthMap, onLive: setDragWidths, onDone: (next) => { setDragWidths(null); setLayout({ widths: next }) } }),
    tableClass: `resizable ${wrap ? 'wrap' : 'no-wrap'}`,
  }
  const builtInSort = defaultSort ? { id: defaultSort.id, desc: Boolean(defaultSort.desc) } : null
  const viewSortId = layout.sort?.id ?? ''
  const viewSort = viewSortId && ownColumns.some((column) => column.id === viewSortId && column.sortable !== false && column.value) ? layout.sort ?? null : null
  const sort = controlledSort !== undefined ? controlledSort : viewSort ?? builtInSort
  const [picking, setPicking] = useState(false)
  const [dragging, setDragging] = useState('')
  const [exporting, setExporting] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  const scrollBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!exporting) return
    const outside = (event: MouseEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) setExporting(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExporting(false) }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [exporting])

  const valueOf = (column: DataColumn<T>, row: T): CellValue => column.value ? column.value(row) : undefined
  const sortColumn = controlledSort === undefined && sort ? ownColumns.find((entry) => entry.id === sort.id) : undefined
  const sortValue = sortColumn?.value, sortDesc = Boolean(sort?.desc)
  const sorted = useMemo(() => sortValue ? [...rows].sort((a, b) => { const order = compareCells(sortValue(a), sortValue(b)); return sortDesc ? -order : order }) : rows, [rows, sortValue, sortDesc])
  const indexes = useMemo(() => new Map(sorted.map((row, index) => [row, index])), [sorted])
  const keyOf = (row: T) => rowKey(row, indexes.get(row) ?? -1)

  // UI-25…UI-28: the column filters and the grouping of the view, on columns that exist (UI-22: others are ignored).
  const byId = new Map(ownColumns.map((column) => [column.id, column]))
  const filterable = (column: DataColumn<T> | undefined): column is DataColumn<T> => Boolean(groupFilter && column && !column.fixed && (column.shown || column.value))
  const groupable = ownColumns.filter((column) => filterable(column) && column.groupable !== false)
  const shownOf = (row: T, columnId: string): ShownValue => {
    const column = byId.get(columnId)
    if (!column) return ''
    if (column.shown) return column.shown(row)
    const value = valueOf(column, row)
    return value instanceof Date ? value.toLocaleString() : value == null ? '' : String(value)
  }
  const filters: Record<string, string> = Object.fromEntries(activeFilters(layout.filters).filter(([id]) => filterable(byId.get(id))))
  const filterKey = JSON.stringify(filters)
  const levels = groupFilter ? (layout.groupBy ?? []).filter((id) => groupable.some((column) => column.id === id)).slice(0, maxGroupLevels) : []
  // eslint-disable-next-line react-hooks/exhaustive-deps -- filters by its text; shownOf reads the columns
  const filtered = useMemo(() => filterTableRows(sorted, filters, shownOf, (id) => byId.get(id)?.filterOptions), [sorted, filterKey, ownColumns])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- grouped by the level ids; shownOf reads the columns
  const groups = useMemo(() => levels.length ? groupTree(filtered, levels, shownOf) : null, [filtered, levels.join('\n'), ownColumns])
  const allGroupKeys = useMemo(() => groups ? groupKeys(groups) : [], [groups])
  // Every row left, once, in the order shown (by group when grouped): the count and paging.
  const shownRows = useMemo(() => groups ? groupedOrder(groups) : filtered, [groups, filtered])
  // UI-27: which groups are open, for this visit — starting open, or closed with "Start collapsed"; a new grouping (or
  // Reset) starts again.
  const startClosed = Boolean(layout.startCollapsed)
  const groupSig = JSON.stringify([levels, startClosed])
  const [openGroups, setOpenGroups] = useState<{ sig: string; state: GroupState }>({ sig: groupSig, state: { closed: startClosed, flipped: [] } })
  const groupState: GroupState = useMemo(() => openGroups.sig === groupSig ? openGroups.state : { closed: startClosed, flipped: [] }, [openGroups, groupSig, startClosed])
  const setGroupState = (state: GroupState) => setOpenGroups({ sig: groupSig, state })
  // UI-29: the rows actually visible — those in a closed group left out — for Export, "Select every row shown" and
  // Previous / Next; `closedCount` rows match the search and filters but sit in closed groups.
  const visible = useMemo(() => groups ? visibleRows(groups, (key) => isGroupOpen(groupState, key)) : shownRows, [groups, groupState, shownRows])
  const closedCount = shownRows.length - visible.length
  useEffect(() => { if (shownRef) shownRef.current = visible })
  const [filterRow, setFilterRow] = useState(false)
  const [savingView, setSavingView] = useState<{ collapsed: boolean } | null>(null)
  const setFilter = (id: string, text: string) => { const next = { ...filters }; if (text.trim()) next[id] = text; else delete next[id]; setLayout({ filters: next }) }
  const regroup = (next: string[]) => setLayout({ groupBy: next })

  const shownKeys = selection ? visible.filter((row) => !selection.blocked?.(row)).map(keyOf) : []
  const allTicked = Boolean(shownKeys.length) && shownKeys.every((key) => selection!.selected.includes(key))
  const columns: DataColumn<T>[] = selection ? [{ id: '@select', label: 'Select', fixed: true, sortable: false, export: false,
    heading: <input type="checkbox" aria-label={allTicked ? 'Clear the selection of every row shown' : 'Select every row shown'} checked={allTicked} disabled={!shownKeys.length} onChange={() => selection.onChange(allTicked ? selection.selected.filter((key) => !shownKeys.includes(key)) : [...new Set([...selection.selected, ...shownKeys])])} />,
    render: (row: T) => {
      const key = keyOf(row), why = selection.blocked?.(row) ?? '', on = !why && selection.selected.includes(key), name = `Select ${selection.label?.(row) ?? key}`
      return <input type="checkbox" aria-label={why ? `${name} (not possible: ${why})` : name} title={why || undefined} disabled={Boolean(why)} checked={on} onChange={() => selection.onChange(on ? selection.selected.filter((entry) => entry !== key) : [...selection.selected, key])} />
    } }, ...ownColumns] : ownColumns
  const fixed = columns.filter((column) => column.fixed)
  const movable = columns.filter((column) => !column.fixed)
  const order = defaults.reorder ? orderedIds(movable.map((column) => column.id), layout.order) : movable.map((column) => column.id)
  const ordered = order.map((key) => movable.find((column) => column.id === key)!)
  const hidden = defaults.chooseColumns ? (layout.hidden ?? ordered.filter((column) => column.defaultHidden).map((column) => column.id)).filter((key) => ordered.some((column) => column.id === key)) : ordered.filter((column) => column.defaultHidden).map((column) => column.id)
  const shownColumns = [...fixed, ...ordered.filter((column) => !hidden.includes(column.id))]
  const density: TableDensity = defaults.densityToggle ? layout.density ?? defaults.defaultDensity : defaults.defaultDensity

  const drawn = limit ? shownRows.slice(0, limit) : shownRows

  const toggleSort = (column: DataColumn<T>) => {
    if (column.sortable === false || !column.value) return
    const next = { id: column.id, desc: sort?.id === column.id ? !sort.desc : Boolean(column.firstSortDesc) }
    if (onSort) onSort(next); else setLayout({ sort: next })
  }
  // Moving columns: drag a heading onto another, or ↑ ↓ in the Columns list.
  const dragType = 'application/x-table-column'
  const dragProps = (column: DataColumn<T>) => defaults.reorder && !column.fixed ? {
    draggable: true,
    onDragStart: (event: DragEvent) => { event.dataTransfer.setData(dragType, column.id); event.dataTransfer.effectAllowed = 'move'; setDragging(column.id) },
    onDragEnd: () => setDragging(''),
  } : {}
  const dropProps = (column: DataColumn<T>) => defaults.reorder && !column.fixed ? {
    onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes(dragType)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } },
    onDrop: (event: DragEvent) => { const moved = event.dataTransfer.getData(dragType); if (!moved) return; event.preventDefault(); setDragging(''); if (moved !== column.id) setLayout({ order: moveIdTo(order, moved, column.id) }) },
  } : {}

  // prefix: the group a row is drawn in (a Multi-select row can be in several), to keep React's keys unique.
  const rowLines = (row: T, index: number, prefix = ''): ReactNode[] => {
    const key = rowKey(row, index), detail = expand?.(row)
    const opens = onRowOpen ? {
      tabIndex: 0, 'data-row-key': key, 'aria-label': rowLabel?.(row),
      onClick: (event: ReactMouseEvent) => { if (!(event.target instanceof Element) || !event.target.closest('button, a, input, select, textarea, label')) onRowOpen(row, visible) },
      onKeyDown: (event: ReactKeyboardEvent) => { if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) { event.preventDefault(); onRowOpen(row, visible) } },
    } : {}
    return [<tr key={`${prefix}${key}`} className={[rowClassName?.(row), onRowOpen ? 'data-table-row-open' : ''].filter(Boolean).join(' ') || undefined} {...opens}>{shownColumns.map((column) => {
      const value = valueOf(column, row)
      return <td key={column.id} style={defaults.resize ? widths.style(column.id) : undefined} className={[column.align ? `align-${column.align}` : '', column.className ?? ''].filter(Boolean).join(' ') || undefined} title={column.title?.(row) ?? (typeof value === 'string' && value.length > 40 ? value : undefined)}>{column.render ? column.render(row) : value instanceof Date ? value.toLocaleString() : value ?? ''}</td>
    })}</tr>, ...(detail ? [<tr key={`${prefix}${key}/detail`} className="data-table-detail"><td colSpan={shownColumns.length}>{detail}</td></tr>] : []), ...(subRows?.(row) ?? []).flatMap((child, childIndex) => rowLines(child, childIndex, `${prefix}${key}/`))]
  }
  // UI-25: a group row — ▸ / ▾, the column, the value ("(blank)" for none) and its row count — indented by its level.
  const groupBody = (): ReactNode[] => groups ? groupLines(groups, (key) => isGroupOpen(groupState, key), limit).flatMap((line): ReactNode[] => {
    if (line.kind === 'row') return rowLines(line.row, indexes.get(line.row) ?? -1, `${line.group}|`)
    const { group, open } = line, count = group.rows.length, label = byId.get(group.columnId)?.label ?? group.columnId
    return [<tr key={`g:${group.key}`} className={`data-table-group data-table-group-${Math.min(group.depth, 3)}`} data-group-depth={group.depth}><td colSpan={shownColumns.length}>
      <button type="button" className="text-button data-table-group-toggle" style={{ marginLeft: group.depth * 18 }} aria-expanded={open} onClick={() => setGroupState(toggleGroup(groupState, group.key))}>{open ? '▾' : '▸'} {label}: {group.value || '(blank)'}</button>{' '}
      <span className="muted data-table-group-count">{count} row{count === 1 ? '' : 's'}</span>
    </td></tr>]
  }) : []
  // UI-25: a grouped-by column is exported even while hidden, so that the file shows the grouping; no extra columns.
  const exported = [...fixed, ...ordered].filter((column) => column.value && (column.export === 'always' || (column.export !== false && (shownColumns.includes(column) || levels.includes(column.id)))))
  const exportRows = () => [...visible.map((row) => exported.map((column) => column.exportValue ? column.exportValue(row) : valueOf(column, row))), ...(totals?.exportValues ? [totalsRow(exported.map((column) => column.id), totals.exportValues, totals.label ?? 'Total')] : [])]
  const note = useContext(ExportNoteContext)
  const runExport = (format: ExportFormat) => {
    setExporting(false)
    if (!exportName) return
    // OND-67: inside a page shown with sample rows the file is marked (a name prefix and a first line).
    const file = `${note?.prefix ?? ''}${exportName}`.replace(/[^\w.-]+/g, '-')
    if (format === 'csv') downloadCsv(`${note ? `${csvCell(note.line)}\r\n` : ''}${tableCsv(exported.map((column) => column.label), exportRows())}`, `${file}.csv`)
    else downloadXlsx(writeXlsx([{ name: exportName.slice(0, 31), rows: [...(note ? [[note.line]] : []), ...tableSheet(exported.map((column) => column.label), exportRows())] }], defaults.excelDateFormat), `${file}.xlsx`)
  }
  const exportNote = closedCount ? `Exports the ${visible.length} row${visible.length === 1 ? '' : 's'} shown (${closedCount} row${closedCount === 1 ? '' : 's'} in closed groups left out)` : undefined
  // CON-94: export needs "Export tables".
  const can = useCan()
  const formats = exportName && can('data.export') ? defaults.exportFormats : []
  const changed = source === 'own'
  // UI-21: the view as it is now (columns that no longer exist left out), saved for everyone; the Tool Owner then follows it.
  const what = `${caption || exportName || id} table`
  const currentView = (): TableView => shareableView(fitTableView({ order, hidden, widths: layout.widths, wrap, density, ...(controlledSort === undefined && sort ? { sort } : {}), ...(groupFilter ? { groupBy: levels, filters } : {}) }, movable.map((column) => column.id)))
  const saveForEveryone = (startCollapsed = false) => { shared.save(viewKey, { ...currentView(), ...(startCollapsed && levels.length ? { startCollapsed: true } : {}) }, what, () => setOwn(undefined)) }
  const filterNames = Object.keys(filters).map((id) => byId.get(id)?.label ?? id)
  const statusText = typeof status === 'function' ? status(shownRows.length) : status

  return <div className={`data-table data-table-${density} ${className}`}>
    <div className="data-table-toolbar">
      {toolbar}
      {statusText && <span className="muted data-table-status">{statusText}</span>}
      <span className="data-table-controls">
        {(defaults.chooseColumns || defaults.reorder) && movable.length > 1 && <button type="button" className="ghost data-table-button" aria-expanded={picking} onClick={() => setPicking(!picking)}>Columns{hidden.length ? ` (${shownColumns.length - fixed.length} of ${movable.length})` : ''}</button>}
        {defaults.wrapToggle && <label className="check wrap-toggle"><input type="checkbox" checked={wrap} onChange={(event) => setLayout({ wrap: event.target.checked })} />Wrap text</label>}
        {defaults.densityToggle && <select className="data-table-density" aria-label="Row density" value={density} onChange={(event) => setLayout({ density: event.target.value as TableDensity })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select>}
        {changed && <button type="button" className="text-button" title={everyone ? `Back to the view for everyone: its widths, order, columns, wrap, density and sort${groupFilter ? ', grouping and column filters' : ''}` : `Back to the table\u2019s default widths, order, columns, wrap, density and sort${groupFilter ? ', without grouping or column filters' : ''}`} onClick={() => { setOwn(undefined); setOpenGroups({ sig: '', state: { closed: false, flipped: [] } }) }}>Reset layout</button>}
        {formats.length > 0 && <span className="data-table-export" ref={menu}>
          {formats.length === 1 ? <button type="button" className="ghost data-table-button" title={exportNote} onClick={() => runExport(formats[0])}>Export {formats[0] === 'xlsx' ? 'Excel' : 'CSV'}</button>
            : <button type="button" className="ghost data-table-button" aria-haspopup="menu" aria-expanded={exporting} title={exportNote} onClick={() => setExporting(!exporting)}>Export ▾</button>}
          {exporting && <span className="view-actions-menu" role="menu">{exportNote && <span className="muted data-table-export-note" role="note">{exportNote}.</span>}{formats.map((format) => <button key={format} type="button" role="menuitem" onClick={() => runExport(format)}>{format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}</button>)}</span>}
        </span>}
      </span>
    </div>
    {groupFilter && <div className="data-table-toolbar data-table-group-bar" role="group" aria-label="Group and filter the table">
      <button type="button" className="ghost data-table-button" aria-pressed={filterRow || filterNames.length > 0} onClick={() => { if (filterRow || filterNames.length) { setFilterRow(false); if (filterNames.length) setLayout({ filters: {} }) } else setFilterRow(true) }}>{filterRow || filterNames.length ? 'Hide filters' : 'Filter by column'}</button>
      {[...levels, ''].slice(0, maxGroupLevels).map((value, level) => <label key={level} className="inline-select">{level ? 'then by' : 'Group by'}<select aria-label={level ? `Group level ${level + 1}` : 'Group by'} value={value} onChange={(event) => regroup(event.target.value ? [...levels.slice(0, level), event.target.value] : levels.slice(0, level))}><option value="">{level ? '—' : 'No grouping'}</option>{groupable.filter((column) => column.id === value || !levels.slice(0, level).includes(column.id)).map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label>)}
      {levels.length > 0 && <span className="button-row"><button type="button" className="ghost data-table-button" disabled={!canExpandAll(groupState, allGroupKeys)} onClick={() => setGroupState({ closed: false, flipped: [] })}>Expand all</button><button type="button" className="ghost data-table-button" disabled={!canCollapseAll(groupState, allGroupKeys)} onClick={() => setGroupState({ closed: true, flipped: [] })}>Collapse all</button></span>}
      {filterNames.length > 0 && <span className="muted data-table-filter-note">{shownRows.length} of {rows.length} row{rows.length === 1 ? '' : 's'} match the column filter{filterNames.length === 1 ? '' : 's'} on {filterNames.join(', ')} · <button type="button" className="text-button" onClick={() => setLayout({ filters: {} })}>Clear column filters</button></span>}
    </div>}
    {picking && <fieldset className="column-chooser"><legend>Columns — {defaults.chooseColumns ? 'tick the ones to show; ' : ''}{defaults.reorder ? 'drag or use ↑ ↓ to move' : ''}</legend>
      <ViewForEveryoneBar entryKey={viewKey} what={what} source={source} hasEveryone={Boolean(everyone)} newer={newerForEveryone(own, everyoneMeta?.at)} canSave={shared.canSave} meta={everyoneMeta}
        onUse={() => setOwn(undefined)} onSave={() => { if (groupFilter) setSavingView({ collapsed: Boolean(everyone?.startCollapsed) }); else saveForEveryone() }} onClear={() => { shared.clear(viewKey, what) }} />
      {defaults.chooseColumns && <div className="button-row"><button type="button" className="text-button" onClick={() => setLayout({ hidden: [] })}>Show all</button></div>}
      <ol className="column-chooser-list">{ordered.map((column, index) => <li key={column.id} className={`column-choice${dragging === column.id ? ' dragging' : ''}`} {...dragProps(column)} {...dropProps(column)}>
        {defaults.reorder && <span className="drag-grip" aria-hidden="true">⋮⋮</span>}
        {defaults.chooseColumns ? <label className="check"><input type="checkbox" checked={!hidden.includes(column.id)} disabled={!hidden.includes(column.id) && shownColumns.length - fixed.length < 2} onChange={(event) => setLayout({ hidden: event.target.checked ? hidden.filter((key) => key !== column.id) : [...hidden, column.id] })} />{column.label}</label> : <span>{column.label}</span>}
        {defaults.reorder && <span className="column-move"><button type="button" className="text-button" aria-label={`Move ${column.label} up`} disabled={index === 0} onClick={() => setLayout({ order: moveId(order, column.id, -1) })}>↑</button><button type="button" className="text-button" aria-label={`Move ${column.label} down`} disabled={index === ordered.length - 1} onClick={() => setLayout({ order: moveId(order, column.id, 1) })}>↓</button></span>}
      </li>)}</ol>
    </fieldset>}
    {rows.length || !empty ? <><div className="azure-table data-table-scroll" ref={scrollBox}><table className={defaults.resize ? widths.tableClass : wrap ? 'wrap' : 'no-wrap'}>
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead><tr>{shownColumns.map((column) => {
        const active = sort?.id === column.id, canSort = column.sortable !== false && Boolean(column.value)
        return <th key={column.id} style={defaults.resize ? widths.style(column.id) : undefined} className={[column.align ? `align-${column.align}` : '', dragging && dragging !== column.id && !column.fixed ? 'drop-target' : ''].filter(Boolean).join(' ') || undefined} aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : canSort ? 'none' : undefined} {...dropProps(column)}>
          {column.heading ? <>{column.heading}<span className="sr-only">{column.label}</span></> : canSort ? <button type="button" className="sort-button" title={defaults.reorder && !column.fixed ? 'Click to sort; drag onto another heading to move the column' : 'Click to sort'} {...dragProps(column)} onClick={() => toggleSort(column)}>{column.label}{active ? (sort!.desc ? ' ▾' : ' ▴') : ''}</button>
            : <span className="sort-button" title={defaults.reorder && !column.fixed ? 'Drag onto another heading to move the column' : undefined} {...dragProps(column)}>{column.label}</span>}
          {column.hint && <Info iconOnly label={`About ${column.label}`}>{column.hint}</Info>}
          {defaults.resize && widths.handle(column.id, column.label)}
        </th>
      })}</tr>
      {groupFilter && (filterRow || filterNames.length > 0) && <tr className="data-table-filters">{shownColumns.map((column) => <th key={column.id} style={defaults.resize ? widths.style(column.id) : undefined}>{filterable(column) && (column.filterOptions?.length
        ? <select aria-label={`Filter ${column.label}`} value={filters[column.id] ?? ''} onChange={(event) => setFilter(column.id, event.target.value)}><option value="">All</option>{filters[column.id] && !column.filterOptions.some((option) => option.toLowerCase() === filters[column.id].trim().toLowerCase()) && <option value={filters[column.id]}>Contains “{filters[column.id]}”</option>}{column.filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
        : <input type="search" aria-label={`Filter ${column.label}`} placeholder="Filter…" value={filters[column.id] ?? ''} onChange={(event) => setFilter(column.id, event.target.value)} />)}</th>)}</tr>}
      </thead>
      <tbody>{groups ? groupBody() : group ? group(drawn, (row) => rowLines(row, drawn.indexOf(row)), shownColumns.length) : drawn.flatMap((row, index) => rowLines(row, index))}{!shownRows.length && rows.length > 0 && <tr className="data-table-no-match"><td colSpan={shownColumns.length} className="muted">No row matches the column filters.</td></tr>}{totals && <tr className="matrix-total">{shownColumns.map((column, index) => <td key={column.id} className={column.align ? `align-${column.align}` : undefined}>{column.id in totals.values ? totals.values[column.id] : index === shownColumns.findIndex((entry) => !(entry.id in totals.values)) ? totals.label ?? 'Total' : ''}</td>)}</tr>}{footer}</tbody>
    </table></div><StickyScrollbar target={scrollBox} /></> : empty}
    {limit && shownRows.length > limit && <p className="muted">Showing the first {limit} of {shownRows.length} rows; search or filter to narrow{exportName ? ', or Export for all' : ''}.</p>}
    {savingView && <Modal title="Save view for everyone" eyebrow="VIEW FOR EVERYONE" onClose={() => setSavingView(null)}>
      <p>{what}: everyone who has not changed it starts with this view; people with their own view keep theirs (saved to the shared views defaults in Git).</p>
      <ul className="data-table-save-summary">
        <li>Columns, order, widths, Wrap text, density and sort as you see them now.</li>
        <li>Group by: {levels.length ? levels.map((id) => byId.get(id)?.label ?? id).join(' → ') : 'no grouping'}.</li>
        <li>Column filters: {filterNames.length ? Object.entries(filters).map(([id, text]) => `${byId.get(id)?.label ?? id} “${text}”`).join(', ') : 'none'}.</li>
      </ul>
      <label className="check"><input type="checkbox" checked={savingView.collapsed && levels.length > 0} disabled={!levels.length} onChange={(event) => setSavingView({ collapsed: event.target.checked })} />Start collapsed</label>
      <small className="muted">{levels.length ? 'Only the outermost group rows show at first; each person opens the groups they need. Off: the groups open expanded.' : 'Choose a Group by first: without grouping there is nothing to collapse.'}</small>
      <div className="modal-actions"><button type="button" className="ghost" onClick={() => setSavingView(null)}>Cancel</button><button type="button" className="primary" onClick={() => { const collapsed = savingView.collapsed; setSavingView(null); saveForEveryone(collapsed) }}>Save view for everyone</button></div>
    </Modal>}
  </div>
}
