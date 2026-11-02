import { Children, Fragment, cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode, type TableHTMLAttributes, type CSSProperties } from 'react'
import { csvCell } from '../csv'
import { downloadCsv, downloadXlsx } from '../download'
import { writeXlsx } from '../xlsx'
import './DataTable.css'

type CellProps = { children?: ReactNode; colSpan?: number; style?: CSSProperties; className?: string }
type Cell = ReactElement<CellProps>
type Preferences = { order: string[]; hidden: string[]; widths: Record<string, number>; wrap: boolean; density: 'compact' | 'comfortable' }
const defaults = (): Preferences => ({ order: [], hidden: [], widths: {}, wrap: false, density: 'compact' })
function elements(nodes: ReactNode): Cell[] {
  return Children.toArray(nodes).flatMap(node => isValidElement<CellProps>(node) ? node.type === Fragment ? elements(node.props.children) : [node] : [])
}
function text(nodes: ReactNode): string {
  return Children.toArray(nodes).map(node => typeof node === 'string' || typeof node === 'number' ? String(node) : isValidElement<CellProps>(node) ? text(node.props.children) : '').join(' ').trim()
}
function firstRow(nodes: ReactNode): Cell | undefined {
  for (const node of elements(nodes)) { if (node.type === 'tr') return node; const found = firstRow(node.props.children); if (found) return found }
}
function withoutLegacyHandles(nodes: ReactNode): ReactNode {
  return Children.map(nodes, node => {
    if (!isValidElement<CellProps>(node)) return node
    if (node.props.className?.split(' ').includes('col-resize')) return null
    return typeof node.type === 'string' || node.type === Fragment ? cloneElement(node, {}, withoutLegacyHandles(node.props.children)) : node
  })
}
function read(key: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!value || typeof value !== 'object') return defaults()
    return { order: Array.isArray(value.order) ? value.order.filter((s: unknown) => typeof s === 'string') : [], hidden: Array.isArray(value.hidden) ? value.hidden.filter((s: unknown) => typeof s === 'string') : [], widths: Object.fromEntries(Object.entries(value.widths ?? {}).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n >= 48 && n <= 1600)) as Record<string, number>, wrap: value.wrap === true, density: value.density === 'comfortable' ? 'comfortable' : 'compact' }
  } catch { return defaults() }
}

/** Shared table presentation. Row handlers, inputs, links and source ordering are preserved. */
export function DataTable({ children, className = '', tableId, ...props }: TableHTMLAttributes<HTMLTableElement> & { tableId?: string }) {
  const sections = elements(children)
  const header = sections.find(node => node.type === 'thead')
  const headers = elements(firstRow(header?.props.children)?.props.children)
  const columns = headers.map((cell, index) => ({ id: String(cell.key ?? index), label: text(cell.props.children).replace(/\s*[↑↓]\s*$/, '') || `Column ${index + 1}`, index }))
  const schema = columns.map(column => column.id).join('|')
  const key = `demand-planning-table-v1:${tableId ?? props['aria-label'] ?? className}:${columns.map(c => c.label).join('|')}`
  // A schema switch remounts the settings, so a different view never inherits another view's preferences.
  return <TableView key={`${key}:${schema}`} {...props} className={className} storageKey={key} columns={columns}>{children}</TableView>
}
function TableView({ children, className, storageKey, columns, ...props }: TableHTMLAttributes<HTMLTableElement> & { storageKey: string; columns: { id: string; label: string; index: number }[] }) {
  const [prefs, setPrefs] = useState(() => read(storageKey))
  const [storageFailed, setStorageFailed] = useState(false)
  const table = useRef<HTMLTableElement>(null)
  const drag = useRef('')
  const resizeCleanup = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanup.current?.(), [])
  const save = (next: Preferences) => { setPrefs(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageFailed(false) } catch { setStorageFailed(true) } }
  const ordered = [...prefs.order.filter(id => columns.some(c => c.id === id)), ...columns.map(c => c.id).filter(id => !prefs.order.includes(id))]
  const visible = ordered.filter(id => !prefs.hidden.includes(id))
  const shown = visible.length ? visible : ordered.slice(0, 1)
  const move = (source: string, target: string) => { if (!ordered.includes(source) || !ordered.includes(target) || source === target) return; const order = ordered.filter(id => id !== source); order.splice(order.indexOf(target), 0, source); save({ ...prefs, order }) }
  const exportRows = () => Array.from(table.current?.rows ?? []).filter(row => row.closest('table') === table.current).map(row => Array.from(row.cells).map(cell => {
    const copy = cell.cloneNode(true) as HTMLElement
    copy.querySelectorAll('button:not(.sort-button),.dt-resize,.col-resize').forEach(node => node.remove())
    const inputs = cell.querySelectorAll('input:not([type=password]):not([type=hidden]),select,textarea')
    if (cell.querySelector('input[type=password]')) return '[redacted]'
    return inputs.length ? Array.from(inputs).map(input => input instanceof HTMLInputElement && input.type === 'checkbox' ? String(input.checked) : (input as HTMLInputElement).value).join(' · ') : copy.textContent?.trim() ?? ''
  }))
  const filename = (props['aria-label'] ?? 'table').replace(/[^\w-]+/g, '-')
  const transform = (nodes: ReactNode, inHead = false): ReactNode => Children.map(nodes, node => {
    if (!isValidElement<CellProps>(node)) return node
    if (node.type === 'tr') {
      const cells = elements(node.props.children)
      const spanning = cells.some(cell => (cell.props.colSpan ?? 1) > 1)
      if (spanning) return cloneElement(node, {}, cells.map((cell, index) => cloneElement(cell, { key: cell.key ?? index, colSpan: cell.props.colSpan === columns.length ? shown.length : cell.props.colSpan })))
      if (cells.length !== columns.length) return node
      return cloneElement(node, {}, shown.map(id => {
        const column = columns.find(c => c.id === id)!
        const cell = cells[column.index]
        const width = prefs.widths[id]
        return cloneElement(cell, { key: id, style: { ...cell.props.style, ...(width ? { width, minWidth: width, maxWidth: width } : {}) } }, withoutLegacyHandles(cell.props.children), inHead && <button type="button" role="separator" aria-orientation="vertical" className="dt-resize" aria-label={`Resize ${column.label}`} title="Drag to resize; arrow keys adjust; double-click resets" onDoubleClick={() => { const widths = { ...prefs.widths }; delete widths[id]; save({ ...prefs, widths }) }} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); save({ ...prefs, widths: { ...prefs.widths, [id]: Math.max(48, Math.min(1600, (width ?? 160) + (event.key === 'ArrowRight' ? 16 : -16))) } }) } }} onPointerDown={event => {
          event.preventDefault(); event.stopPropagation(); resizeCleanup.current?.()
          const handle = event.currentTarget, start = event.clientX, initial = handle.parentElement!.getBoundingClientRect().width
          const update = (e: PointerEvent) => { const next = Math.max(48, Math.min(1600, initial + e.clientX - start)); const index = shown.indexOf(id); Array.from(table.current?.rows ?? []).forEach(row => { const cell = row.cells[index]; if (row.cells.length === shown.length && cell) { cell.style.width = `${next}px`; cell.style.minWidth = `${next}px`; cell.style.maxWidth = `${next}px` } }); return next }
          let latest = initial
          const movePointer = (e: PointerEvent) => { latest = update(e) }
          const cleanup = () => { window.removeEventListener('pointermove', movePointer); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
          const up = () => { cleanup(); save({ ...prefs, widths: { ...prefs.widths, [id]: latest } }) }
          resizeCleanup.current = cleanup
          window.addEventListener('pointermove', movePointer); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
        }} />)
      }))
    }
    if (node.type === 'colgroup') return null
    if (typeof node.type !== 'string' && node.type !== Fragment) return node
    return cloneElement(node, {}, transform(node.props.children, inHead || node.type === 'thead'))
  })
  return <div className={`dt-shell dt-${prefs.density} ${prefs.wrap ? 'dt-wrap' : 'dt-nowrap'}`}>
    {columns.length > 0 && <div className="dt-toolbar" aria-label="Table options">
      <details><summary>Columns ({shown.length}/{columns.length})</summary><div className="dt-columns"><p>Drag to reorder, or use the arrows.</p>{ordered.map((id, index) => { const column = columns.find(c => c.id === id)!; return <div key={id} draggable onDragStart={event => { drag.current = id; event.dataTransfer.setData('text/plain', id) }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); move(drag.current, id); drag.current = '' }} onDragEnd={() => { drag.current = '' }}><span aria-hidden="true">⠿</span><label><input type="checkbox" checked={shown.includes(id)} disabled={shown.length === 1 && shown.includes(id)} onChange={event => save({ ...prefs, hidden: event.target.checked ? prefs.hidden.filter(c => c !== id) : [...prefs.hidden, id] })} />{column.label}</label><button type="button" aria-label={`Move ${column.label} left`} disabled={!index} onClick={() => move(id, ordered[index - 1])}>←</button><button type="button" aria-label={`Move ${column.label} right`} disabled={index === ordered.length - 1} onClick={() => { const order = [...ordered]; [order[index], order[index + 1]] = [order[index + 1], order[index]]; save({ ...prefs, order }) }}>→</button></div> })}</div></details>
      <label><input type="checkbox" checked={prefs.wrap} onChange={event => save({ ...prefs, wrap: event.target.checked })} /> Wrap text</label>
      <select aria-label="Table density" value={prefs.density} onChange={event => save({ ...prefs, density: event.target.value as Preferences['density'] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select>
      <button type="button" onClick={() => save(defaults())}>Reset view</button>
      <button type="button" onClick={() => downloadCsv(exportRows().map(row => row.map(csvCell).join(',')).join('\r\n'), `${filename}.csv`)}>CSV</button>
      <button type="button" onClick={() => downloadXlsx(writeXlsx([{ name: 'Table', rows: exportRows() }]), `${filename}.xlsx`)}>Excel</button>
      <small>Exports displayed rows</small>{storageFailed && <small role="status">View preferences apply this session only.</small>}
    </div>}
    <div className="dt-scroll"><table {...props} ref={table} className={`${(className ?? '').replace(/\b(?:wrap|no-wrap)\b/g, '')} dt-table ${prefs.wrap ? 'wrap' : 'no-wrap'}`}>{columns.length ? transform(children) : children}</table></div>
  </div>
}
