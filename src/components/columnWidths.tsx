import { useState, type CSSProperties, type PointerEvent } from 'react'

// Column widths the user drags on a table heading, kept per table in this browser (a convenience only: without
// storage they last for the session). Double-click the handle to return a column to its automatic width.
// The table is as wide as its columns (auto fit, no fixed overall width); "Wrap text" (kept per table in this browser)
// lets long text wrap so the table fits the page, else every cell stays on one line (QV-38).
const storageKey = (table: string) => `demand-planning-column-widths-v1:${table}`
const minWidth = 48
const wrapKey = (table: string) => `demand-planning-table-wrap-v1:${table}`

export function useColumnWidths(table: string) {
  const [widths, setWidths] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem(storageKey(table)) ?? '{}') as Record<string, number> } catch { return {} } })
  const [wrap, setWrapState] = useState(() => { try { return localStorage.getItem(wrapKey(table)) === '1' } catch { return false } })
  const setWrap = (next: boolean) => { setWrapState(next); try { localStorage.setItem(wrapKey(table), next ? '1' : '0') } catch { /* session only */ } }
  const save = (next: Record<string, number>) => { setWidths(next); try { localStorage.setItem(storageKey(table), JSON.stringify(next)) } catch { /* session only */ } }
  const style = (column: string): CSSProperties | undefined => widths[column] ? { width: widths[column], minWidth: widths[column], maxWidth: widths[column] } : undefined
  const handle = (column: string, label = column) => <span role="separator" aria-orientation="vertical" aria-label={`Resize ${label} column`} title="Drag to resize; double-click to reset" className="col-resize"
    onDoubleClick={() => { const next = { ...widths }; delete next[column]; save(next) }}
    onPointerDown={(event: PointerEvent<HTMLSpanElement>) => {
      event.preventDefault(); event.stopPropagation()
      const heading = event.currentTarget.parentElement!
      const startX = event.clientX, startWidth = heading.getBoundingClientRect().width
      let latest = widths
      const move = (moved: globalThis.PointerEvent) => { latest = { ...widths, [column]: Math.max(minWidth, Math.round(startWidth + moved.clientX - startX)) }; setWidths(latest) }
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); save(latest) }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    }} />
  const wrapToggle = <label className="check wrap-toggle"><input type="checkbox" checked={wrap} onChange={(event) => setWrap(event.target.checked)} />Wrap text</label>
  return { style, handle, reset: () => save({}), resized: Object.keys(widths).length > 0, wrap, tableClass: `resizable ${wrap ? 'wrap' : 'no-wrap'}`, wrapToggle }
}
