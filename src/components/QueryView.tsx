import { useMemo, useState } from 'react'
import type { AzureWorkItem } from '../domain'
import { cellValue, columnName, defaultViewColumns, formatCell, sortItems, viewCsv, viewSummary, withReleaseColumns, type QueryColumn, type QueryOrder } from '../queryView'
import { downloadCsv } from '../download'
import { todayIso } from '../format'
import { EmptyState } from './ui'
import { useColumnWidths } from './columnWidths'

// Read-only view of a connection's query results: a summary strip (by state, type and person; overdue; changed this
// week), then the query's own columns. Click a heading to sort; search, state and type filters; CSV export.
// unresolved: SELECT entries of the query that are not fields of the project (named in a notice instead of dropped silently).
export function QueryView({ name, items, columns, orderBy = [], unresolved = [] }: { name: string; items: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[] }) {
  const cols = withReleaseColumns(columns?.length ? columns : defaultViewColumns.map((ref) => ({ ref, name: columnName(ref) })), items, (ref) => ({ ref, name: columnName(ref) }))
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState<QueryOrder[]>(orderBy)
  const [today] = useState(todayIso)
  const widths = useColumnWidths(`query:${name}`)
  const summary = useMemo(() => viewSummary(items, today), [items, today])
  const shown = useMemo(() => {
    const text = search.trim().toLowerCase()
    const filtered = items.filter((item) => (!state || item.state === state) && (!type || item.workItemType === type) && (!text || cols.some((column) => formatCell(cellValue(item, column.ref)).toLowerCase().includes(text))))
    return sortItems(filtered, sort)
  }, [items, state, type, search, sort, cols])
  const toggleSort = (ref: string) => setSort((current) => current[0]?.ref === ref ? [{ ref, desc: !current[0].desc }] : [{ ref, desc: false }])
  const chips = (rows: [string, number][], active: string, pick: (value: string) => void, limit = 8) => rows.slice(0, limit).map(([label, count]) => <button key={label} type="button" className={`summary-chip ${active === label ? 'summary-chip-active' : ''}`} aria-pressed={active === label} onClick={() => pick(active === label ? '' : label)}><strong>{count}</strong> {label}</button>)
  if (!items.length) return <EmptyState title={`“${name}” returned no work items.`} detail="Check the connection's query in Settings → Azure DevOps." />
  return <div className="query-view">
    {unresolved.length > 0 && <div className="notice warning" role="status">{columns?.length ? "Not shown" : "Showing the default columns"}: {unresolved.map((entry) => `“${entry}”`).join(", ")} {unresolved.length === 1 ? "is" : "are"} not a field of this project. Check the spelling in the query (reference name such as System.Title, or the field name such as Assigned To), then refresh.</div>}
    <div className="view-summary">
      <div className="summary-row"><span className="summary-label">State</span>{chips(summary.byState, state, setState)}<span className="summary-facts"><b>{summary.overdue}</b> overdue · <b>{summary.changedThisWeek}</b> changed in 7 days</span></div>
      <div className="summary-row"><span className="summary-label">Type</span>{chips(summary.byType, type, setType)}</div>
      <div className="summary-row"><span className="summary-label">People</span>{summary.byPerson.slice(0, 8).map(([person, count]) => <span key={person} className="summary-person">{person} <b>{count}</b></span>)}{summary.byPerson.length > 8 && <span className="muted">+{summary.byPerson.length - 8} more</span>}</div>
    </div>
    <div className="query-toolbar"><input className="search" aria-label={`Search ${name}`} placeholder="Search all columns" value={search} onChange={(event) => setSearch(event.target.value)} /><span className="muted">{shown.length} of {items.length} items{state || type ? ' · filtered' : ''}</span>{widths.resized && <button type="button" className="ghost" onClick={widths.reset}>Reset widths</button>}<button type="button" className="ghost" onClick={() => downloadCsv(viewCsv(shown, cols), `${name.replace(/[^\w-]+/g, '-')}.csv`)}>Export CSV</button></div>
    <div className="azure-table query-table"><table className="resizable"><thead><tr>{cols.map((column) => { const active = sort[0]?.ref === column.ref; return <th key={column.ref} style={widths.style(column.ref)} aria-sort={active ? (sort[0].desc ? 'descending' : 'ascending') : 'none'}><button type="button" className="sort-button" title={column.ref} onClick={() => toggleSort(column.ref)}>{column.name}{active ? (sort[0].desc ? ' ↓' : ' ↑') : ''}</button>{widths.handle(column.ref, column.name)}</th> })}</tr></thead>
      <tbody>{shown.slice(0, 500).map((item) => <tr key={item.key}>{cols.map((column) => <td key={column.ref} style={widths.style(column.ref)}>{column.ref === 'System.Id' ? <a href={item.url} target="_blank" rel="noreferrer">{item.id}</a> : column.ref === 'System.Title' ? <a href={item.url} target="_blank" rel="noreferrer">{formatCell(cellValue(item, column.ref))}</a> : formatCell(cellValue(item, column.ref))}</td>)}</tr>)}</tbody></table></div>
    {shown.length > 500 && <p className="muted">Showing the first 500 of {shown.length} rows; search or filter to narrow, or export CSV for all.</p>}
  </div>
}
