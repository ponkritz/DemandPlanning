import type { OnDemandColumn, OnDemandPage } from '../onDemand'
import { maxPivotColumns, maxPivotRows, pivotColumnFields, pivotRowFields, secondColumns } from '../onDemandInsights'

// CHT-78 The Data tab's fields of a Pivot table, the same in the chart pop-up (Insights) and the block pop-up
// (Dashboard): **Rows** — "Rows by" and "＋ then by" up to 3 fields — and **Columns** — "Columns by (optional)" and
// "＋ then by" up to 2 — outermost first, each line with ↑ ↓ to move it and ✕ to remove it (UI-STANDARDS §6 symbols).
// A column is offered once: the fields already used elsewhere are left out of each list.
type Fields = { type: 'table'; category: string; second: string; rows2?: string; rows3?: string; second2?: string }
const kind = (column: OnDemandColumn) => column.type === 'date' ? 'by month' : column.type === 'multi' ? 'Multi-select' : column.type === 'dropdown' ? 'Dropdown' : 'Text'
const move = (list: string[], index: number, by: -1 | 1) => { const out = [...list]; [out[index], out[index + by]] = [out[index + by], out[index]]; return out }

export function PivotFields({ page, insight, onChange }: { page: OnDemandPage; insight: Fields; onChange: (rows: string[], columns: string[]) => void }) {
  const fits = secondColumns(page, 'table')
  const rows = pivotRowFields(insight).length ? pivotRowFields(insight) : [insight.category]
  const columns = pivotColumnFields(insight)
  const used = [...rows, ...columns]
  const name = (id: string) => page.columns.find((column) => column.id === id)?.name ?? '(removed column)'
  const free = fits.filter((column) => !used.includes(column.id))
  const options = (current: string) => fits.filter((column) => column.id === current || !used.includes(column.id))
  const line = (part: 'rows' | 'columns', list: string[], index: number) => {
    const id = list[index]
    const label = index === 0 ? part === 'rows' ? 'Rows by' : 'Columns by' : `${part === 'rows' ? 'Rows' : 'Columns'} then by (level ${index + 1})`
    const set = (next: string[]) => part === 'rows' ? onChange(next, columns) : onChange(rows, next)
    const known = fits.some((column) => column.id === id)
    return <div key={`${part}-${index}`} className="pivot-field">
      <select aria-label={label} value={id} onChange={(event) => set(event.target.value ? list.map((entry, at) => at === index ? event.target.value : entry) : list.filter((_, at) => at !== index))}>
        {part === 'columns' && index === 0 && <option value="">— None —</option>}
        {!known && id && <option value={id}>(not available)</option>}
        {part === 'rows' && !id && <option value="">— Choose —</option>}
        {options(id).map((column) => <option key={column.id} value={column.id}>{part === 'rows' ? `${column.name} (${kind(column)})` : column.name}</option>)}
      </select>
      {list.length > 1 && <span className="column-move">
        <button type="button" className="text-button" aria-label={`Move ${name(id)} up in the ${part}`} disabled={index === 0} onClick={() => set(move(list, index, -1))}>↑</button>
        <button type="button" className="text-button" aria-label={`Move ${name(id)} down in the ${part}`} disabled={index === list.length - 1} onClick={() => set(move(list, index, 1))}>↓</button>
      </span>}
      {(part === 'columns' || list.length > 1) && id && <button type="button" className="text-button danger-text" aria-label={`Remove ${name(id)} from the ${part}`} onClick={() => set(list.filter((_, at) => at !== index))}>✕</button>}
    </div>
  }
  const add = (part: 'rows' | 'columns') => {
    const list = part === 'rows' ? rows : columns, max = part === 'rows' ? maxPivotRows : maxPivotColumns
    const full = list.length >= max
    const reason = full ? `At most ${max} ${part === 'rows' ? 'row' : 'column'} fields.` : !free.length ? 'Every column that fits is used.' : ''
    return <button type="button" className="text-button" disabled={Boolean(reason)} title={reason || undefined} aria-label={`＋ then by (${part})`} onClick={() => { const next = [...list, free[0].id]; if (part === 'rows') onChange(next, columns); else onChange(rows, next) }}>＋ then by</button>
  }
  return <>
    <fieldset className="pivot-fields"><legend>Rows</legend>
      {rows.map((_, index) => line('rows', rows, index))}
      {rows[0] && add('rows')}
      <small>Up to {maxPivotRows} fields, outermost first (e.g. Epic, then Feature, then State): a Dropdown, Multi-select, Text or Date (by month, or as chosen in Group dates by) column. Each group gets a subtotal.</small>
    </fieldset>
    <fieldset className="pivot-fields"><legend>Columns (optional)</legend>
      {(columns.length ? columns : ['']).map((_, index, list) => line('columns', list, index))}
      {columns[0] && add('columns')}
      <small>Up to {maxPivotColumns} fields across (e.g. Stream, then Month): one column per value, a Subtotal column per outer value, and the totals.</small>
    </fieldset>
  </>
}
