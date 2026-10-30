import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import type { AzureWorkItem } from '../domain'
import { cellValue, columnName, columnOrderKey, defaultViewColumns, extraColumnRef, formatCell, hiddenColumnsKey, moveColumnBy, moveColumnTo, orderColumns, sortItems, viewCsv, viewSummary, visibleColumns, withReleaseColumns, type QueryColumn, type QueryOrder } from '../queryView'
import { downloadCsv } from '../download'
import { todayIso } from '../format'
import { EmptyState } from './ui'
import { useColumnWidths } from './columnWidths'

// Read-only view of a connection's query results: a summary strip (by state, type and person; overdue; changed this
// week), then the query's own columns. Click a heading to sort; search, state and type filters; CSV export.
// summary: false leaves out the summary strip and its State / Type filters (Tool Validations, QV-35).
// unresolved: SELECT entries of the query that are not fields of the project (named in a notice instead of dropped silently).
// queryOnly: exactly the query's columns (no Name / Release read from the paths); choose: a column chooser whose
// choice is remembered per view in this browser, and the columns can be rearranged (drag a heading onto another, or
// ← → in the chooser; the order is remembered per view too). extra: one more column after the query's (DP: the board match),
// searched and exported with its text.
export interface ExtraColumn { name: string; text: (item: AzureWorkItem) => string; cell: (item: AzureWorkItem) => ReactNode }
export function QueryView({ name, items, columns, orderBy = [], unresolved = [], queryOnly = false, choose = false, extra, summary: withSummary = true }: { name: string; items: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[]; queryOnly?: boolean; choose?: boolean; extra?: ExtraColumn; summary?: boolean }) {
  const base = columns?.length ? columns : defaultViewColumns.map((ref) => ({ ref, name: columnName(ref) }))
  const all = queryOnly ? base : withReleaseColumns(base, items, (ref) => ({ ref, name: columnName(ref) }))
  const [hidden, setHidden] = useState<string[]>(() => { if (!choose) return []; try { const saved = JSON.parse(localStorage.getItem(hiddenColumnsKey(name)) ?? '[]'); return Array.isArray(saved) ? saved.filter((ref) => typeof ref === 'string') : [] } catch { return [] } })
  const [picking, setPicking] = useState(false)
  const hide = (next: string[]) => { setHidden(next); try { localStorage.setItem(hiddenColumnsKey(name), JSON.stringify(next)) } catch { /* this visit only */ } }
  const read = (key: string) => { if (!choose) return []; try { const saved = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(saved) ? saved.filter((ref): ref is string => typeof ref === 'string') : [] } catch { return [] } }
  const [order, setOrder] = useState<string[]>(() => read(columnOrderKey(name)))
  const arrange = (next: string[]) => { setOrder(next); try { if (next.length) localStorage.setItem(columnOrderKey(name), JSON.stringify(next)); else localStorage.removeItem(columnOrderKey(name)) } catch { /* this visit only */ } }
  const [dragging, setDragging] = useState('')
  // The extra column (DP: QMS-0025 match) is placed, hidden and moved like the query's columns.
  const ordered = choose ? orderColumns(extra ? [...all, { ref: extraColumnRef, name: extra.name }] : all, order) : extra ? [...all, { ref: extraColumnRef, name: extra.name }] : all
  const refs = ordered.map((column) => column.ref)
  const cols = choose ? visibleColumns(ordered, hidden) : ordered
  // The dragged column travels in the drag data, so a drop right after the drag start still knows it.
  const dragType = 'application/x-query-column'
  const startDrag = (event: DragEvent, ref: string) => { event.dataTransfer.setData(dragType, ref); event.dataTransfer.effectAllowed = 'move'; setDragging(ref) }
  const overDrag = (event: DragEvent) => { if (event.dataTransfer.types.includes(dragType)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } }
  const drop = (event: DragEvent, target: string) => { const ref = event.dataTransfer.getData(dragType); if (!ref) return; event.preventDefault(); if (ref !== target) arrange(moveColumnTo(refs, ref, target)); setDragging('') }
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState<QueryOrder[]>(orderBy)
  const [today] = useState(todayIso)
  const widths = useColumnWidths(`query:${name}`)
  const summary = useMemo(() => viewSummary(items, today), [items, today])
  const shown = useMemo(() => {
    const text = search.trim().toLowerCase()
    const filtered = items.filter((item) => (!state || item.state === state) && (!type || item.workItemType === type) && (!text || cols.some((column) => formatCell(cellValue(item, column.ref)).toLowerCase().includes(text)) || Boolean(extra?.text(item).toLowerCase().includes(text))))
    return sortItems(filtered, sort)
  }, [items, state, type, search, sort, cols, extra])
  const toggleSort = (ref: string) => setSort((current) => current[0]?.ref === ref ? [{ ref, desc: !current[0].desc }] : [{ ref, desc: false }])
  const chips = (rows: [string, number][], active: string, pick: (value: string) => void, limit = 8) => rows.slice(0, limit).map(([label, count]) => <button key={label} type="button" className={`summary-chip ${active === label ? 'summary-chip-active' : ''}`} aria-pressed={active === label} onClick={() => pick(active === label ? '' : label)}><strong>{count}</strong> {label}</button>)
  if (!items.length) return <EmptyState title={`“${name}” returned no work items.`} detail="Check the connection's query in Settings → Azure DevOps." />
  return <div className="query-view">
    {unresolved.length > 0 && <div className="notice warning" role="status">{columns?.length ? "Not shown" : "Showing the default columns"}: {unresolved.map((entry) => `“${entry}”`).join(", ")} {unresolved.length === 1 ? "is" : "are"} not a field of this project. Check the spelling in the query (reference name such as System.Title, or the field name such as Assigned To), then refresh.</div>}
    {withSummary && <div className="view-summary">
      <div className="summary-row"><span className="summary-label">State</span>{chips(summary.byState, state, setState)}<span className="summary-facts"><b>{summary.overdue}</b> overdue · <b>{summary.changedThisWeek}</b> changed in 7 days</span></div>
      <div className="summary-row"><span className="summary-label">Type</span>{chips(summary.byType, type, setType)}</div>
      <div className="summary-row"><span className="summary-label">People</span>{summary.byPerson.slice(0, 8).map(([person, count]) => <span key={person} className="summary-person">{person} <b>{count}</b></span>)}{summary.byPerson.length > 8 && <span className="muted">+{summary.byPerson.length - 8} more</span>}</div>
    </div>}
    <div className="query-toolbar"><input className="search" aria-label={`Search ${name}`} placeholder="Search all columns" value={search} onChange={(event) => setSearch(event.target.value)} /><span className="muted">{shown.length} of {items.length} items{state || type ? ' · filtered' : ''}</span>{widths.wrapToggle}{widths.resized && <button type="button" className="ghost" onClick={widths.reset}>Reset widths</button>}{choose && <button type="button" className="ghost" aria-expanded={picking} onClick={() => setPicking(!picking)}>Columns ({cols.length} of {ordered.length})</button>}<button type="button" className="ghost" onClick={() => downloadCsv(viewCsv(shown, cols, extra), `${name.replace(/[^\w-]+/g, '-')}.csv`)}>Export CSV</button></div>
    {choose && picking && <fieldset className="column-chooser"><legend>Columns — tick the ones to show; drag or use ← → to rearrange</legend>
      <div className="button-row"><button type="button" className="text-button" onClick={() => hide([])}>Show all</button><button type="button" className="text-button" onClick={() => hide(ordered.slice(1).map((column) => column.ref))}>Only the first</button><button type="button" className="text-button" disabled={!order.length} onClick={() => arrange([])}>Query order</button></div>
      <ol className="column-chooser-list">{ordered.map((column, index) => <li key={column.ref} className={`column-choice${dragging === column.ref ? ' dragging' : ''}`} draggable onDragStart={(event) => startDrag(event, column.ref)} onDragEnd={() => setDragging('')} onDragOver={overDrag} onDrop={(event) => drop(event, column.ref)}>
        <span className="drag-grip" aria-hidden="true">⋮⋮</span>
        <label className="check"><input type="checkbox" checked={!hidden.includes(column.ref)} onChange={(event) => hide(event.target.checked ? hidden.filter((ref) => ref !== column.ref) : [...hidden, column.ref])} />{column.name}<small className="muted">{column.ref === extraColumnRef ? 'added by the app' : column.ref}</small></label>
        <span className="column-move"><button type="button" className="text-button" aria-label={`Move ${column.name} left`} disabled={index === 0} onClick={() => arrange(moveColumnBy(refs, column.ref, -1))}>←</button><button type="button" className="text-button" aria-label={`Move ${column.name} right`} disabled={index === ordered.length - 1} onClick={() => arrange(moveColumnBy(refs, column.ref, 1))}>→</button></span>
      </li>)}</ol>
    </fieldset>}
    <div className="azure-table query-table"><table className={widths.tableClass}><thead><tr>{cols.map((column) => { const active = sort[0]?.ref === column.ref; const dragProps = choose ? { draggable: true, onDragStart: (event: DragEvent) => startDrag(event, column.ref), onDragEnd: () => setDragging('') } : {}
        return <th key={column.ref} style={widths.style(column.ref)} className={dragging && dragging !== column.ref ? 'drop-target' : undefined} aria-sort={active ? (sort[0].desc ? 'descending' : 'ascending') : 'none'} onDragOver={overDrag} onDrop={(event) => drop(event, column.ref)}>
          {column.ref === extraColumnRef ? <span className="sort-button" title={choose ? 'Drag onto another heading to move the column' : undefined} {...dragProps}>{column.name}</span> : <button type="button" className="sort-button" title={choose ? `${column.ref} — click to sort, drag onto another heading to move` : column.ref} onClick={() => toggleSort(column.ref)} {...dragProps}>{column.name}{active ? (sort[0].desc ? ' ↓' : ' ↑') : ''}</button>}{widths.handle(column.ref, column.name)}</th> })}</tr></thead>
      <tbody>{shown.slice(0, 500).map((item) => <tr key={item.key}>{cols.map((column) => column.ref === extraColumnRef && extra ? <td key={column.ref} className="extra-cell" style={widths.style(column.ref)} title={extra.text(item)}>{extra.cell(item)}</td> : <td key={column.ref} style={widths.style(column.ref)} title={column.ref === 'System.Id' ? undefined : formatCell(cellValue(item, column.ref)) || undefined}>{column.ref === 'System.Id' ? <a href={item.url} target="_blank" rel="noreferrer">{item.id}</a> : column.ref === 'System.Title' ? <a href={item.url} target="_blank" rel="noreferrer">{formatCell(cellValue(item, column.ref))}</a> : formatCell(cellValue(item, column.ref))}</td>)}</tr>)}</tbody></table></div>
    {shown.length > 500 && <p className="muted">Showing the first 500 of {shown.length} rows; search or filter to narrow, or export CSV for all.</p>}
  </div>
}

