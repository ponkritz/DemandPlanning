import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Insight, OnDemandPage } from '../onDemand'
import { formatShown } from '../onDemandInsights'
import { cellWhere, columnLabel, drawnColumns, fieldHeading, groupKeys, pivotCap, pivotData, pivotExport, pivotLines, pivotRows, type PivotColumn, type PivotNode } from '../pivotTable'
import { tableLimit } from '../dashboardPages'
import { useCan } from '../useCan'
import { useTableDefaults } from './tableDesign'
import { ExportNoteContext } from '../exportNote'
import { csvCell } from '../csv'
import { tableCsv, tableSheet, type ExportFormat } from '../tableDefaults'
import { downloadCsv, downloadXlsx } from '../download'
import { writeXlsx } from '../xlsx'
import { RowsBehind } from './InsightCharts'

// CHT-74…CHT-82 The nested Pivot table, the same in the Insights tab and on an On-Demand Dashboard (and in a published
// file's viewer): a matrix (UI-STANDARDS §5: a hand-built grid, for its two heading rows) with the row fields in one
// indented first column, ▸ / ▾ on every group (its numbers are its subtotals), Expand all / Collapse all (as the QE
// Mapping's grouping, QEM-10, QEM-11), the first 10 outer rows with Show all, Export (Excel / CSV, the shared table's
// formats and permission) of the flat table, and a click on any number for the rows behind it. What is open or closed is
// this viewer's for this visit only (never saved).

export function NestedPivot({ page, insight, currency = '', drill = true, exportName, limit = tableLimit }: { page: OnDemandPage; insight: Insight; currency?: string; drill?: boolean; exportName?: string; limit?: number }) {
  const data = useMemo(() => pivotData(page, insight, currency), [page, insight, currency])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [all, setAll] = useState(false)
  const [drilled, setDrilled] = useState<{ node: PivotNode | null; column: PivotColumn } | null>(null)
  const groups = groupKeys(data.rows)
  const outer = data.rows.length
  const lines = pivotLines(data, collapsed, all ? undefined : limit)
  const cap = pivotCap(lines.length, data.columns.length)
  const columns = drawnColumns(data.columns, cap.columns)
  const shownLines = lines.slice(0, cap.lines)
  const show = (value: number | null) => formatShown(value, data.unit)
  const toggle = (key: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const nested = data.rowFields.length > 1
  const shownOuter = Math.min(outer, all ? outer : limit)
  const head = data.rowFields.map((field) => fieldHeading(field, insight)).join(' / ')
  const two = data.columnFields.length > 1
  const shownHead = two ? data.head.flatMap((group) => { const span = columns.filter((column) => column.kind !== 'total' && column.path[0] === group.key).length; return span ? [{ ...group, span }] : [] }) : []
  const cell = (node: PivotNode | null, column: PivotColumn, value: number | null) => {
    const where = cellWhere(node, column)
    const className = ['num', column.kind !== 'leaf' ? 'pivot-subtotal-col' : ''].filter(Boolean).join(' ')
    return <td key={column.key} className={className}>{drill ? <button type="button" className="pivot-cell" aria-label={`${where}: ${show(value)} — list the rows behind it`} onClick={() => setDrilled({ node, column })}>{show(value)}</button> : show(value)}</td>
  }
  return <div className="od-pivot-nested">
    <div className="data-table-toolbar">
      <span className="muted data-table-status">{shownOuter} of {outer} {nested ? `group${outer === 1 ? '' : 's'}` : `row${outer === 1 ? '' : 's'}`}</span>
      <span className="data-table-controls">
        {groups.length > 0 && <><button type="button" className="ghost data-table-button" disabled={groups.every((key) => collapsed.has(key))} onClick={() => setCollapsed(new Set(groups))}>Collapse all</button>
          <button type="button" className="ghost data-table-button" disabled={!collapsed.size} onClick={() => setCollapsed(new Set())}>Expand all</button></>}
        {exportName && <PivotExportButton name={exportName} build={() => pivotExport(page, insight, data)} />}
      </span>
    </div>
    <div className="azure-table od-pivot"><table className="matrix viz-table pivot-table">
      <thead>
        <tr><th rowSpan={two ? 2 : 1}>{head}</th>{two ? shownHead.map((group) => <th key={group.key} colSpan={group.span} className="num pivot-col-group">{group.label}</th>) : columns.filter((column) => column.kind !== 'total').map((column) => <th key={column.key} className="num">{column.labels[0]}</th>)}<th rowSpan={two ? 2 : 1} className="num pivot-subtotal-col">{columnLabel(page, insight, data.columns[data.columns.length - 1], data.currency)}</th></tr>
        {two && <tr>{columns.filter((column) => column.kind !== 'total').map((column) => <th key={column.key} className={column.kind === 'subtotal' ? 'num pivot-subtotal-col' : 'num'}>{column.kind === 'subtotal' ? 'Subtotal' : column.labels[1]}</th>)}</tr>}
      </thead>
      <tbody>
        {shownLines.map(({ node, group, open }) => <tr key={node.key || '\u0000none'} className={group ? `pivot-group pivot-level-${Math.min(node.depth, 2)}` : undefined}>
          <td className="pivot-label" style={{ paddingLeft: 8 + node.depth * 18 }}>{group
            ? <button type="button" className="text-button pivot-toggle" aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${node.labels.join(' · ')}`} onClick={() => toggle(node.key)}>{open ? '▾' : '▸'} {node.labels[node.depth]}</button>
            : <span className={nested ? 'pivot-leaf' : undefined}>{node.labels[node.depth]}</span>}</td>
          {columns.map((column) => cell(node, column, node.values[data.columns.indexOf(column)]))}
        </tr>)}
        <tr className="matrix-total"><td>Total</td>{columns.map((column) => cell(null, column, data.total[data.columns.indexOf(column)]))}</tr>
      </tbody>
    </table></div>
    {cap.capped && <p className="od-insight-warning" role="status">Only the first {cap.lines} line{cap.lines === 1 ? '' : 's'}{cap.columns < data.columns.length ? ` and ${cap.columns} of ${data.columns.length} columns` : ''} are shown (at most 2,000 numbers at once). Collapse groups, narrow the filters or use Export for the whole table.</p>}
    {(outer > limit) && <button type="button" className="text-button" onClick={() => setAll(!all)}>{all ? `Show the first ${limit}` : `Show all (+${outer - limit} more)`}</button>}
    {data.counted.multi && insight.measure !== 'average' && <p className="muted od-pivot-note">A row with several values of a Multi-select counts in each of them; the subtotals and totals take each row once.</p>}
    {drilled && <RowsBehind page={page} insight={insight} rows={pivotRows(page, insight, data, drilled.node?.path ?? [], drilled.column.path)} where={cellWhere(drilled.node, drilled.column)} currency={data.currency} onClose={() => setDrilled(null)} />}
  </div>
}

// CHT-80: Export of the flat table, in the formats of Settings → Table defaults and only with "Export tables" (CON-94),
// marked as sample data inside a page shown with sample rows (OND-67) — as the shared table's Export.
function PivotExportButton({ name, build }: { name: string; build: () => { head: string[]; rows: (string | number)[][] } }) {
  const defaults = useTableDefaults()
  const can = useCan()
  const note = useContext(ExportNoteContext)
  const [open, setOpen] = useState(false)
  const menu = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { if (menu.current && !menu.current.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const formats = can('data.export') ? defaults.exportFormats : []
  if (!formats.length) return null
  const run = (format: ExportFormat) => {
    setOpen(false)
    const { head, rows } = build()
    const file = `${note?.prefix ?? ''}${name}`.replace(/[^\w.-]+/g, '-')
    if (format === 'csv') downloadCsv(`${note ? `${csvCell(note.line)}\r\n` : ''}${tableCsv(head, rows)}`, `${file}.csv`)
    else downloadXlsx(writeXlsx([{ name: name.slice(0, 31), rows: [...(note ? [[note.line]] : []), ...tableSheet(head, rows)] }], defaults.excelDateFormat), `${file}.xlsx`)
  }
  return <span className="data-table-export" ref={menu}>
    {formats.length === 1 ? <button type="button" className="ghost data-table-button" onClick={() => run(formats[0])}>Export {formats[0] === 'xlsx' ? 'Excel' : 'CSV'}</button>
      : <button type="button" className="ghost data-table-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>Export ▾</button>}
    {open && <span className="view-actions-menu" role="menu">{formats.map((format) => <button key={format} type="button" role="menuitem" onClick={() => run(format)}>{format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}</button>)}</span>}
  </span>
}
