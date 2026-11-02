import { useMemo, useState, type ReactNode } from 'react'
import type { AzureWorkItem } from '../domain'
import { cellValue, columnName, columnOrderKey, defaultViewColumns, extraColumnRef, formatCell, hiddenColumnsKey, sortItems, viewSummary, withReleaseColumns, type QueryColumn, type QueryOrder } from '../queryView'
import { todayIso } from '../format'
import { EmptyState } from './ui'

// A field's value for sorting and export: dates as they are (exported as date-times), numbers as numbers, the rest as shown.
const exportValue = (value: ReturnType<typeof cellValue>) => typeof value === 'number' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) ? value : formatCell(value)
import { DataTable, type DataColumn } from './DataTable'
import { readLayout, saveLayout } from '../tableDefaults'

// Read-only view of a connection's query results: a summary strip (by state, type and person; overdue; changed this
// week), then the query's own columns. Click a heading to sort; search, state and type filters; CSV export.
// summary: false leaves out the summary strip and its State / Type filters (Tool Validations, QV-35).
// unresolved: SELECT entries of the query that are not fields of the project (named in a notice instead of dropped silently).
// queryOnly: exactly the query's columns (no Name / Release read from the paths); choose: a column chooser whose
// choice is remembered per view in this browser, and the columns can be rearranged (drag a heading onto another, or
// ← → in the chooser; the order is remembered per view too). extra: one more column after the query's (DP: the board match),
// searched and exported with its text.
export interface ExtraColumn { name: string; text: (item: AzureWorkItem) => string; cell: (item: AzureWorkItem) => ReactNode }
export function QueryView({ name, items, columns, orderBy = [], unresolved = [], queryOnly = false, extra, summary: withSummary = true }: { name: string; items: AzureWorkItem[]; columns?: QueryColumn[]; orderBy?: QueryOrder[]; unresolved?: string[]; queryOnly?: boolean; choose?: boolean; extra?: ExtraColumn; summary?: boolean }) {
  const base = columns?.length ? columns : defaultViewColumns.map((ref) => ({ ref, name: columnName(ref) }))
  const all = queryOnly ? base : withReleaseColumns(base, items, (ref) => ({ ref, name: columnName(ref) }))
  // The column choice and order kept before the table default (per view) carry over once to the table's own layout.
  useState(() => { const id = `query:${name}`, current = readLayout(id); if (current.order || current.hidden) return; try { const list = (key: string) => { const saved = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(saved) ? saved.filter((ref): ref is string => typeof ref === 'string') : [] }; const hidden = list(hiddenColumnsKey(name)), order = list(columnOrderKey(name)); if (hidden.length || order.length) saveLayout(id, { ...current, ...(hidden.length ? { hidden } : {}), ...(order.length ? { order } : {}) }) } catch { /* nothing to carry over */ } })
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState<QueryOrder[]>(orderBy)
  const [today] = useState(todayIso)
  const summary = useMemo(() => viewSummary(items, today), [items, today])
  const shown = useMemo(() => {
    const text = search.trim().toLowerCase()
    const filtered = items.filter((item) => (!state || item.state === state) && (!type || item.workItemType === type) && (!text || all.some((column) => formatCell(cellValue(item, column.ref)).toLowerCase().includes(text)) || Boolean(extra?.text(item).toLowerCase().includes(text))))
    return sortItems(filtered, sort)
  }, [items, state, type, search, sort, all, extra])
  const chips = (rows: [string, number][], active: string, pick: (value: string) => void, limit = 8) => rows.slice(0, limit).map(([label, count]) => <button key={label} type="button" className={`summary-chip ${active === label ? 'summary-chip-active' : ''}`} aria-pressed={active === label} onClick={() => pick(active === label ? '' : label)}><strong>{count}</strong> {label}</button>)
  // The query's columns (and the extra one) as table columns: shown formatted; sorted and exported with their values
  // (dates as date-times, numbers as numbers).
  const tableColumns: DataColumn<AzureWorkItem>[] = all.map((column) => ({
    id: column.ref, label: column.name,
    value: (item: AzureWorkItem) => exportValue(cellValue(item, column.ref)),
    title: (item: AzureWorkItem) => column.ref === 'System.Id' ? undefined : formatCell(cellValue(item, column.ref)) || undefined,
    render: (item: AzureWorkItem) => column.ref === 'System.Id' ? <a href={item.url} target="_blank" rel="noreferrer">{item.id}</a> : column.ref === 'System.Title' ? <a href={item.url} target="_blank" rel="noreferrer">{formatCell(cellValue(item, column.ref))}</a> : formatCell(cellValue(item, column.ref)),
  }))
  if (extra) tableColumns.push({ id: extraColumnRef, label: extra.name, value: extra.text, render: extra.cell, sortable: false, className: 'extra-cell', title: extra.text })
  if (!items.length) return <EmptyState title={`“${name}” returned no work items.`} detail="Check the connection's query in Settings → Azure DevOps." />
  return <div className="query-view">
    {unresolved.length > 0 && <div className="notice warning" role="status">{columns?.length ? "Not shown" : "Showing the default columns"}: {unresolved.map((entry) => `“${entry}”`).join(", ")} {unresolved.length === 1 ? "is" : "are"} not a field of this project. Check the spelling in the query (reference name such as System.Title, or the field name such as Assigned To), then refresh.</div>}
    {withSummary && <div className="view-summary">
      <div className="summary-row"><span className="summary-label">State</span>{chips(summary.byState, state, setState)}<span className="summary-facts"><b>{summary.overdue}</b> overdue · <b>{summary.changedThisWeek}</b> changed in 7 days</span></div>
      <div className="summary-row"><span className="summary-label">Type</span>{chips(summary.byType, type, setType)}</div>
      <div className="summary-row"><span className="summary-label">People</span>{summary.byPerson.slice(0, 8).map(([person, count]) => <span key={person} className="summary-person">{person} <b>{count}</b></span>)}{summary.byPerson.length > 8 && <span className="muted">+{summary.byPerson.length - 8} more</span>}</div>
    </div>}
    {/* UI-07…12: the table follows the shared design default (resize, move, choose columns, wrap, density, Export). */}
    <DataTable id={`query:${name}`} columns={tableColumns} rows={shown} rowKey={(item) => item.key} exportName={name} limit={500}
      sort={sort[0] ? { id: sort[0].ref, desc: Boolean(sort[0].desc) } : null} onSort={(next) => setSort([{ ref: next.id, desc: next.desc }])}
      toolbar={<input className="search" aria-label={`Search ${name}`} placeholder="Search all columns" value={search} onChange={(event) => setSearch(event.target.value)} />}
      status={`${shown.length} of ${items.length} items${state || type ? ' · filtered' : ''}`} />
  </div>
}

