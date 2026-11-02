import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTableDefaults } from './tableDesign'
import { compareCells, moveId, moveIdTo, orderedIds, readLayout, saveLayout, tableCsv, tableSheet, type CellValue, type ExportFormat, type TableDensity, type TableLayout } from '../tableDefaults'
import { useColumnWidths } from './columnWidths'
import { downloadCsv, downloadXlsx } from '../download'
import { writeXlsx } from '../xlsx'

// The one table of the app (UI-07…12). Every table is built on it and follows the design default (Settings → Table
// defaults): resizable columns, columns moved by dragging a heading or with ↑ ↓ in the Columns list, columns ticked on
// or off, Wrap text, Compact / Comfortable, and one Export that offers Excel or CSV — dates written as real date-times.
// A table's own choices (widths, order, hidden columns, wrap, density) are kept per table in the viewer's browser.

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
  // The first click sorts descending (newest / largest first), e.g. a date or a count.
  firstSortDesc?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
  title?: (row: T) => string | undefined
  // Kept first and never hidden or moved (e.g. a selection tick box).
  fixed?: boolean
}

export interface DataTableProps<T> {
  id: string // stable per table: the viewer's choices are kept under it
  columns: DataColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  exportName?: string // file name without extension; no name, no Export
  toolbar?: ReactNode // the table's own controls (search, filters), shown left of the table controls
  status?: ReactNode // e.g. "12 of 40 items"
  limit?: number // rows drawn at most (all are exported)
  defaultSort?: { id: string; desc?: boolean }
  sort?: { id: string; desc: boolean } | null // controlled sort (the owner sorts the rows itself)
  onSort?: (sort: { id: string; desc: boolean }) => void
  rowClassName?: (row: T) => string | undefined
  empty?: ReactNode
  footer?: ReactNode // rows after the data, drawn as given
  // A totals row that follows the columns as they are moved or hidden: a value per column id, the label in the first column without one.
  totals?: { label?: string; values: Record<string, ReactNode> }
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
}

export function DataTable<T>({ id, columns, rows, rowKey, exportName, toolbar, status, limit, defaultSort, sort: controlledSort, onSort, rowClassName, empty, footer, className = '', caption, expand, group, totals, subRows }: DataTableProps<T>) {
  const defaults = useTableDefaults()
  const widths = useColumnWidths(`table:${id}`, defaults.defaultWrap)
  const [layout, setLayoutState] = useState<TableLayout>(() => readLayout(id))
  const setLayout = (next: TableLayout) => { setLayoutState(next); saveLayout(id, next) }
  const [ownSort, setOwnSort] = useState<{ id: string; desc: boolean } | null>(defaultSort ? { id: defaultSort.id, desc: Boolean(defaultSort.desc) } : null)
  const sort = controlledSort !== undefined ? controlledSort : ownSort
  const [picking, setPicking] = useState(false)
  const [dragging, setDragging] = useState('')
  const [exporting, setExporting] = useState(false)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!exporting) return
    const outside = (event: MouseEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) setExporting(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExporting(false) }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [exporting])

  const fixed = columns.filter((column) => column.fixed)
  const movable = columns.filter((column) => !column.fixed)
  const order = defaults.reorder ? orderedIds(movable.map((column) => column.id), layout.order) : movable.map((column) => column.id)
  const ordered = order.map((key) => movable.find((column) => column.id === key)!)
  const hidden = defaults.chooseColumns ? (layout.hidden ?? ordered.filter((column) => column.defaultHidden).map((column) => column.id)).filter((key) => ordered.some((column) => column.id === key)) : ordered.filter((column) => column.defaultHidden).map((column) => column.id)
  const shownColumns = [...fixed, ...ordered.filter((column) => !hidden.includes(column.id))]
  const density: TableDensity = defaults.densityToggle ? layout.density ?? defaults.defaultDensity : defaults.defaultDensity

  const valueOf = (column: DataColumn<T>, row: T): CellValue => column.value ? column.value(row) : undefined
  const sorted = useMemo(() => {
    if (!sort || controlledSort !== undefined) return rows
    const column = columns.find((entry) => entry.id === sort.id)
    if (!column?.value) return rows
    return [...rows].sort((a, b) => { const order = compareCells(column.value!(a), column.value!(b)); return sort.desc ? -order : order })
  }, [rows, sort, columns, controlledSort])
  const drawn = limit ? sorted.slice(0, limit) : sorted

  const toggleSort = (column: DataColumn<T>) => {
    if (column.sortable === false || !column.value) return
    const next = { id: column.id, desc: sort?.id === column.id ? !sort.desc : Boolean(column.firstSortDesc) }
    if (onSort) onSort(next); else setOwnSort(next)
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
    onDrop: (event: DragEvent) => { const moved = event.dataTransfer.getData(dragType); if (!moved) return; event.preventDefault(); setDragging(''); if (moved !== column.id) setLayout({ ...layout, order: moveIdTo(order, moved, column.id) }) },
  } : {}

  const rowLines = (row: T, index: number): ReactNode[] => {
    const key = rowKey(row, index), detail = expand?.(row)
    return [<tr key={key} className={rowClassName?.(row)}>{shownColumns.map((column) => {
      const value = valueOf(column, row)
      return <td key={column.id} style={defaults.resize ? widths.style(column.id) : undefined} className={[column.align ? `align-${column.align}` : '', column.className ?? ''].filter(Boolean).join(' ') || undefined} title={column.title?.(row) ?? (typeof value === 'string' && value.length > 40 ? value : undefined)}>{column.render ? column.render(row) : value instanceof Date ? value.toLocaleString() : value ?? ''}</td>
    })}</tr>, ...(detail ? [<tr key={`${key}/detail`} className="data-table-detail"><td colSpan={shownColumns.length}>{detail}</td></tr>] : []), ...(subRows?.(row) ?? []).flatMap((child, childIndex) => rowLines(child, childIndex))]
  }
  const exported = [...fixed, ...ordered].filter((column) => column.value && (column.export === 'always' || (column.export !== false && shownColumns.includes(column))))
  const exportRows = () => sorted.map((row) => exported.map((column) => valueOf(column, row)))
  const runExport = (format: ExportFormat) => {
    setExporting(false)
    if (!exportName) return
    const file = exportName.replace(/[^\w.-]+/g, '-')
    if (format === 'csv') downloadCsv(tableCsv(exported.map((column) => column.label), exportRows()), `${file}.csv`)
    else downloadXlsx(writeXlsx([{ name: exportName.slice(0, 31), rows: tableSheet(exported.map((column) => column.label), exportRows()) }], defaults.excelDateFormat), `${file}.xlsx`)
  }
  const formats = exportName ? defaults.exportFormats : []
  const changed = Boolean(layout.order?.length || layout.hidden?.length || layout.density || widths.resized)

  return <div className={`data-table data-table-${density} ${className}`}>
    <div className="data-table-toolbar">
      {toolbar}
      {status && <span className="muted data-table-status">{status}</span>}
      <span className="data-table-controls">
        {(defaults.chooseColumns || defaults.reorder) && movable.length > 1 && <button type="button" className="ghost data-table-button" aria-expanded={picking} onClick={() => setPicking(!picking)}>Columns{hidden.length ? ` (${shownColumns.length - fixed.length} of ${movable.length})` : ''}</button>}
        {defaults.wrapToggle && <label className="check wrap-toggle"><input type="checkbox" checked={widths.wrap} onChange={(event) => widths.setWrap(event.target.checked)} />Wrap text</label>}
        {defaults.densityToggle && <select className="data-table-density" aria-label="Row density" value={density} onChange={(event) => setLayout({ ...layout, density: event.target.value as TableDensity })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select>}
        {changed && <button type="button" className="text-button" title="Back to the table's default widths, order, columns and density" onClick={() => { setLayout({}); widths.reset() }}>Reset layout</button>}
        {formats.length > 0 && <span className="data-table-export" ref={menu}>
          {formats.length === 1 ? <button type="button" className="ghost data-table-button" onClick={() => runExport(formats[0])}>Export {formats[0] === 'xlsx' ? 'Excel' : 'CSV'}</button>
            : <button type="button" className="ghost data-table-button" aria-haspopup="menu" aria-expanded={exporting} onClick={() => setExporting(!exporting)}>Export ▾</button>}
          {exporting && <span className="view-actions-menu" role="menu">{formats.map((format) => <button key={format} type="button" role="menuitem" onClick={() => runExport(format)}>{format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}</button>)}</span>}
        </span>}
      </span>
    </div>
    {picking && <fieldset className="column-chooser"><legend>Columns — {defaults.chooseColumns ? 'tick the ones to show; ' : ''}{defaults.reorder ? 'drag or use ↑ ↓ to move' : ''}</legend>
      {defaults.chooseColumns && <div className="button-row"><button type="button" className="text-button" onClick={() => setLayout({ ...layout, hidden: [] })}>Show all</button></div>}
      <ol className="column-chooser-list">{ordered.map((column, index) => <li key={column.id} className={`column-choice${dragging === column.id ? ' dragging' : ''}`} {...dragProps(column)} {...dropProps(column)}>
        {defaults.reorder && <span className="drag-grip" aria-hidden="true">⋮⋮</span>}
        {defaults.chooseColumns ? <label className="check"><input type="checkbox" checked={!hidden.includes(column.id)} disabled={!hidden.includes(column.id) && shownColumns.length - fixed.length < 2} onChange={(event) => setLayout({ ...layout, hidden: event.target.checked ? hidden.filter((key) => key !== column.id) : [...hidden, column.id] })} />{column.label}</label> : <span>{column.label}</span>}
        {defaults.reorder && <span className="column-move"><button type="button" className="text-button" aria-label={`Move ${column.label} up`} disabled={index === 0} onClick={() => setLayout({ ...layout, order: moveId(order, column.id, -1) })}>↑</button><button type="button" className="text-button" aria-label={`Move ${column.label} down`} disabled={index === ordered.length - 1} onClick={() => setLayout({ ...layout, order: moveId(order, column.id, 1) })}>↓</button></span>}
      </li>)}</ol>
    </fieldset>}
    {rows.length || !empty ? <div className="azure-table data-table-scroll"><table className={defaults.resize ? widths.tableClass : `${widths.wrap ? 'wrap' : 'no-wrap'}`}>
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead><tr>{shownColumns.map((column) => {
        const active = sort?.id === column.id, canSort = column.sortable !== false && Boolean(column.value)
        return <th key={column.id} style={defaults.resize ? widths.style(column.id) : undefined} className={[column.align ? `align-${column.align}` : '', dragging && dragging !== column.id && !column.fixed ? 'drop-target' : ''].filter(Boolean).join(' ') || undefined} aria-sort={active ? (sort!.desc ? 'descending' : 'ascending') : canSort ? 'none' : undefined} {...dropProps(column)}>
          {canSort ? <button type="button" className="sort-button" title={defaults.reorder && !column.fixed ? 'Click to sort; drag onto another heading to move the column' : 'Click to sort'} {...dragProps(column)} onClick={() => toggleSort(column)}>{column.label}{active ? (sort!.desc ? ' ▾' : ' ▴') : ''}</button>
            : <span className="sort-button" title={defaults.reorder && !column.fixed ? 'Drag onto another heading to move the column' : undefined} {...dragProps(column)}>{column.label}</span>}
          {defaults.resize && widths.handle(column.id, column.label)}
        </th>
      })}</tr></thead>
      <tbody>{group ? group(drawn, (row) => rowLines(row, drawn.indexOf(row)), shownColumns.length) : drawn.flatMap(rowLines)}{totals && <tr className="matrix-total">{shownColumns.map((column, index) => <td key={column.id} className={column.align ? `align-${column.align}` : undefined}>{column.id in totals.values ? totals.values[column.id] : index === shownColumns.findIndex((entry) => !(entry.id in totals.values)) ? totals.label ?? 'Total' : ''}</td>)}</tr>}{footer}</tbody>
    </table></div> : empty}
    {limit && sorted.length > limit && <p className="muted">Showing the first {limit} of {sorted.length} rows; search or filter to narrow{exportName ? ', or Export for all' : ''}.</p>}
  </div>
}
