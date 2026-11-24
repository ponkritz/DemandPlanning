import { createContext, useContext, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { chartHeights, chartWidths, clampSize, exactHeight, exactWidth, gridColumns, gridGap, gridColsFor, gridText, heightFactorOf, heightLabels, heightRows, nearestHeight, nearestWidth, rowUnit, sameSize, sizeText, snapHeight, snapWidth, stackFactory, stepSize, widthCols, widthNames, type GridBox, type GridKind, type GridSize, type SizeSource } from '../chartSize'
import { changedPanels, layoutRows, movePanel, packLayout, resizePanel, stepMove, type GridEntry, type Layout } from '../chartGrid'
import { recordJob } from '../backgroundJobs'
import { useElementWidth } from '../chartUtils'
import { ChartHeightContext, type ChartSizes } from '../useChartSize'
import { Modal, Notice, Panel } from './ui'

// CHT-15…CHT-22, CHT-43…CHT-50 The chart grid: chart panels on a 12-column grid (6 columns on a medium-wide screen,
// one on a phone) with rows of 40 px, placed by src/chartGrid.ts. Each panel has a resize handle on its bottom-right
// corner (a pointer drag snapping to columns and rows, or the arrow keys); in Arrange mode the owners also move panels —
// by the grip in the header (pointer drag, or the arrow keys) or Shift + arrows on the handle — and the grid's lines
// and each panel's size ("8 × 6") are shown. The others shift out of the way while dragging; gaps close upward.

interface Preview { id: string; layout: Layout; size: GridSize; mode: 'resize' | 'move' }
interface GridApi {
  cols: number; arranging: boolean; canMove: boolean
  place: (id: string) => GridBox | undefined; sizeOf: (id: string) => GridSize | undefined; kindOf: (id: string) => GridKind
  preview: Preview | null
  start: (id: string, mode: Preview['mode']) => void
  resizeTo: (id: string, size: GridSize) => void
  moveTo: (id: string, x: number, y: number) => void
  keyMove: (id: string, key: string) => boolean
  finish: (keep: boolean) => void
  geometry: () => { left: number; top: number; column: number; width: number }
  say: (text: string) => void
}
const GridContext = createContext<GridApi | null>(null)


// CHT-43…CHT-47 The grid. `entries`: its panels in the page's order, each with the size shown (the viewer's own or the
// owners') and the owners' place when set. Resizing calls onResize (the viewer's own size; or, in Arrange mode, the
// owners' layout with onLayout); moving (owners, Arrange mode, 12 columns) calls onLayout with the new layout.
export function ChartGrid({ className = '', entries, arranging = false, canMove = false, titleOf, onResize, onLayout, role, children }: {
  className?: string; entries: GridEntry[]; arranging?: boolean; canMove?: boolean; titleOf: (id: string) => string; role?: string
  onResize: (id: string, size: GridSize) => void; onLayout?: (layout: Layout, changed: string[], id: string, mode: 'resize' | 'move') => void; children: ReactNode
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(typeof window === 'undefined' ? 1200 : Math.max(200, window.innerWidth - 280))
  const screen = typeof window === 'undefined' ? 1440 : window.innerWidth
  const cols = gridColsFor(width, screen)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [said, setSaid] = useState('')
  const base = useMemo(() => packLayout(entries, cols), [entries, cols])
  const full = useMemo(() => cols === gridColumns ? base : packLayout(entries, gridColumns), [entries, cols, base])
  const shown = preview?.layout ?? base
  const kinds = useMemo(() => new Map(entries.map((entry) => [entry.id, entry.kind])), [entries])
  const sizes = useMemo(() => new Map(entries.map((entry) => [entry.id, entry.size])), [entries])
  const current = useRef<Preview | null>(null)
  const onGrid = (size: GridSize) => cols === gridColumns ? size : { w: Math.min(cols, Math.ceil(size.w * cols / gridColumns)), h: size.h }
  const set = (next: Preview | null) => { current.current = next; setPreview(next) }
  const api: GridApi = {
    cols, arranging, canMove: canMove && arranging && cols === gridColumns && Boolean(onLayout),
    place: (id) => shown[id], sizeOf: (id) => preview?.id === id ? preview.size : sizes.get(id), kindOf: (id) => kinds.get(id) ?? 'chart',
    preview,
    start: (id, mode) => { const size = sizes.get(id); if (size) set({ id, layout: base, size, mode }) },
    resizeTo: (id, size) => {
      const kind = kinds.get(id) ?? 'chart'
      const next = clampSize(size, kind)
      if (current.current?.id === id && sameSize(current.current.size, next) && current.current.mode === 'resize') return
      set({ id, layout: resizePanel(base, id, onGrid(next), cols), size: next, mode: 'resize' })
      setSaid(`${titleOf(id)}: ${sizeText(next, kind)}`)
    },
    moveTo: (id, x, y) => {
      const size = sizes.get(id)
      if (!size || cols !== gridColumns) return
      const layout = movePanel(full, id, x, y)
      const was = current.current?.layout[id], now = layout[id]
      if (was && now && was.x === now.x && was.y === now.y && current.current?.mode === 'move') return
      set({ id, layout, size, mode: 'move' })
      setSaid(`${titleOf(id)}: column ${now.x + 1}, row ${now.y + 1}`)
    },
    keyMove: (id, key) => {
      const size = sizes.get(id)
      if (!size || cols !== gridColumns) return false
      const from = current.current?.mode === 'move' && current.current.id === id ? current.current.layout : full
      const layout = stepMove(from, id, key)
      if (!layout) return false
      const now = layout[id]
      set({ id, layout, size, mode: 'move' })
      setSaid(layout === from ? `${titleOf(id)}: cannot move further` : `${titleOf(id)}: column ${now.x + 1}, row ${now.y + 1}`)
      return true
    },
    finish: (keep) => {
      const done = current.current
      set(null)
      if (!done) return
      const title = titleOf(done.id), kind = kinds.get(done.id) ?? 'chart'
      if (!keep) { setSaid(`${title}: ${done.mode === 'move' ? 'not moved' : `${sizeText(sizes.get(done.id) ?? done.size, kind)} kept`}`); return }
      if (done.mode === 'move') {
        const changed = changedPanels(full, done.layout)
        if (changed.length && onLayout) { onLayout(done.layout, changed, done.id, 'move'); setSaid(`${title}: moved to column ${done.layout[done.id].x + 1}, row ${done.layout[done.id].y + 1}, saved for everyone`) }
        return
      }
      if (sameSize(done.size, sizes.get(done.id) ?? done.size)) return
      if (arranging && onLayout) {
        const layout = resizePanel(full, done.id, done.size)
        onLayout(layout, changedPanels(full, layout), done.id, 'resize')
        setSaid(`${title}: ${sizeText(done.size, kind)}, saved for everyone`)
      } else { onResize(done.id, done.size); setSaid(`${title}: ${sizeText(done.size, kind)}`) }
    },
    geometry: () => {
      const rect = ref.current?.getBoundingClientRect() ?? new DOMRect()
      return { left: rect.left, top: rect.top, width: rect.width, column: (rect.width - (cols - 1) * gridGap) / cols }
    },
    say: setSaid,
  }
  const rows = Math.max(layoutRows(shown), 1)
  const lines = (arranging || preview) && cols > 1
  const classes = ['chart-grid', `chart-grid-${cols}`, lines ? 'chart-grid-fixed' : '', className].filter(Boolean).join(' ')
  return <GridContext.Provider value={api}>
    <div ref={ref} className={classes} role={role} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} data-cols={cols}>
      {lines && <div className="chart-grid-lines" aria-hidden="true" style={{ gridColumn: '1 / -1', gridRow: `1 / span ${rows + (preview ? 2 : 0)}`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{Array.from({ length: cols * (rows + (preview ? 2 : 0)) }, (_, index) => <i key={index} />)}</div>}
      {children}
    </div>
    <span className="sr-only" aria-live="polite">{said}</span>
  </GridContext.Provider>
}

// CHT-15…CHT-18 A chart in a panel of the chart grid: its place and size from the grid (or, outside a grid, its size
// classes), the resize handle, in Arrange mode the move grip, and — when the viewer chose their own size — "Size: yours ·
// Reset to default".
export function ChartPanel({ id, kind = 'chart', title, eyebrow, detail, info, action, className = '', size, source, onResize, onReset, extra, arranging = false, titleHidden = false, children }: {
  id?: string; kind?: GridKind; title: string; eyebrow?: string; detail?: ReactNode; info?: ReactNode; action?: ReactNode; className?: string; titleHidden?: boolean
  size: GridSize; source: SizeSource
  onResize?: (size: GridSize) => void; onReset?: () => void; extra?: ReactNode; arranging?: boolean; children: ReactNode
}) {
  const grid = useContext(GridContext)
  const box = id && grid ? grid.place(id) : undefined
  const shown = (id && grid?.sizeOf(id)) || size
  const moving = Boolean(id && grid?.preview?.id === id)
  const width = exactWidth(shown.w) ?? nearestWidth(shown.w), height = exactHeight(shown.h, kind) ?? nearestHeight(shown.h, kind)
  const classes = [className, 'chart-panel', `chart-w-${width}`, `chart-h-${height}`, arranging ? 'chart-arranging' : '', moving ? 'chart-moving' : ''].filter(Boolean).join(' ')
  const style = box && grid ? grid.cols === 1 ? { gridColumn: '1 / -1' } : { gridColumn: `${box.x + 1} / span ${box.w}`, gridRow: `${box.y + 1} / span ${box.h}` } : undefined
  const resizable = Boolean(onResize) && (!grid || grid.cols > 1)
  const grip = id && grid?.canMove ? <MoveGrip id={id} title={title} /> : null
  return <Panel className={classes} style={style} eyebrow={eyebrow} title={title} detail={detail} info={info} action={grip || action ? <>{grip}{action}</> : undefined} titleHidden={titleHidden}>
    <ChartHeightContext.Provider value={heightFactorOf(shown.h, kind)}>{children}</ChartHeightContext.Provider>
    {(source === 'viewer' && onReset) || extra ? <p className="chart-size-note muted">{source === 'viewer' && onReset && <>Size: yours · <button type="button" className="text-button" aria-label={`Reset ${title} to the default size`} onClick={onReset}>Reset to default</button></>}{extra}</p> : null}
    {(moving || (arranging && grid)) && <div className={moving ? 'chart-resize-outline' : 'chart-size-tag'} aria-hidden="true"><span>{moving ? sizeText(shown, kind) : gridText(shown)}</span></div>}
    {resizable && <ResizeHandle id={id} kind={kind} title={title} size={shown} arranging={arranging} onCommit={onResize!} />}
  </Panel>
}

// CHT-49 The handle: a pointer drag snaps to whole columns and rows (the others shift out of the way, the size shown on
// the panel); focused, → / ← and ↓ / ↑ step one column or row, Shift + arrows move the panel (owners, Arrange mode),
// Enter or leaving it keeps the change, Escape cancels. Hidden on a phone.
export function ResizeHandle({ id, kind, title, size, arranging, onCommit }: { id?: string; kind: GridKind; title: string; size: GridSize; arranging: boolean; onCommit: (size: GridSize) => void }) {
  const grid = useContext(GridContext)
  const drag = useRef<{ x: number; y: number; width: number; size: GridSize } | null>(null)
  const [local, setLocal] = useState<GridSize | null>(null)
  const [said, setSaid] = useState('')
  const self = useRef<HTMLButtonElement>(null)
  const active = Boolean(grid && id && grid.preview?.id === id)
  // Outside a grid (none on the app's pages today) the size is kept here and committed on release.
  const show = (next: GridSize) => {
    if (grid && id) grid.resizeTo(id, next)
    else { setLocal(next); setSaid(`${title}: ${sizeText(next, kind)}`) }
  }
  const finish = (keep: boolean) => {
    drag.current = null
    if (grid && id) { grid.finish(keep); return }
    const target = local
    setLocal(null)
    if (keep && target && !sameSize(target, size)) onCommit(target)
  }
  const cols = grid?.cols ?? gridColumns
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const panel = self.current?.closest('.chart-panel')?.getBoundingClientRect()
    drag.current = { x: event.clientX, y: event.clientY, width: panel?.width ?? 0, size }
    if (grid && id) grid.start(id, 'resize')
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current
    if (!start) return
    const geometry = grid?.geometry()
    const w = geometry ? snapWidth(start.width + event.clientX - start.x, geometry.width, gridGap, cols) : start.size.w
    show(clampSize({ w, h: snapHeight(start.size.h, event.clientY - start.y) }, kind))
  }
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.shiftKey && grid && id && grid.canMove && event.key.startsWith('Arrow')) { event.preventDefault(); grid.keyMove(id, event.key); return }
    const from = (grid && id && grid.preview?.id === id && grid.preview.mode === 'resize' ? grid.preview.size : null) ?? local ?? size
    const next = stepSize(from, event.key, kind, cols)
    if (next) { event.preventDefault(); show(next); return }
    if (event.key === 'Escape' && (active || local)) { event.preventDefault(); event.stopPropagation(); finish(false) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); finish(true) }
  }
  const shown = local ?? size
  return <>
    {local && <div className="chart-resize-outline" aria-hidden="true"><span>{sizeText(local, kind)}</span></div>}
    <button ref={self} type="button" className="chart-resize-handle" aria-label={`Resize ${title}: ${sizeText(shown, kind)}`} title={arranging ? 'Drag (or use the arrow keys) to set the size for everyone; Shift + arrows move the chart' : 'Drag (or use the arrow keys) to resize this chart for yourself'}
      onPointerDown={down} onPointerMove={move} onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => { if (drag.current) finish(true) }}
      onKeyDown={key} onBlur={() => { if ((active || local) && !drag.current) finish(true) }} />
    {!grid && <span className="sr-only" aria-live="polite">{said}</span>}
  </>
}

// CHT-47 The move grip in a panel's header (owners, Arrange mode, 12 columns): a pointer drag moves the panel to the cell
// under it (the others shift out of the way); focused, ← / → move one column, ↑ / ↓ past the panel above or below,
// Enter or leaving it keeps the place, Escape cancels.
function MoveGrip({ id, title }: { id: string; title: string }) {
  const grid = useContext(GridContext)!
  const drag = useRef<{ x: number; y: number; box: GridBox } | null>(null)
  const active = grid.preview?.id === id && grid.preview.mode === 'move'
  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    const box = grid.place(id)
    if (!box) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, box }
    grid.start(id, 'move')
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current
    if (!start) return
    const { column } = grid.geometry()
    const x = start.box.x + Math.round((event.clientX - start.x) / (column + gridGap))
    const y = start.box.y + Math.round((event.clientY - start.y) / (rowUnit + gridGap))
    grid.moveTo(id, x, y)
  }
  const finish = (keep: boolean) => { drag.current = null; grid.finish(keep) }
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key.startsWith('Arrow')) { event.preventDefault(); grid.keyMove(id, event.key); return }
    if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); finish(false) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); finish(true) }
  }
  const box = grid.place(id)
  return <button type="button" className="chart-move-grip" aria-label={`Move ${title}${box ? `: column ${box.x + 1}, row ${box.y + 1}` : ''}`} title="Drag to move this chart for everyone (or use the arrow keys, Enter to keep)"
    onPointerDown={down} onPointerMove={move} onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={() => { if (drag.current) finish(true) }}
    onKeyDown={key} onBlur={() => { if (active && !drag.current) finish(true) }}>⠿</button>
}

// Width and Height as two selects — the chart's Display (Insights and Dashboard pop-ups), Size… and Arrange blocks…: the
// presets, and the size in columns and rows when it is none of them (CHT-44).
export function SizeFields({ size, kind = 'chart', onChange, heightReason = '', label = '' }: { size: GridSize; kind?: GridKind; onChange: (size: GridSize) => void; heightReason?: string; label?: string }) {
  const width = exactWidth(size.w), height = exactHeight(size.h, kind)
  return <div className="form-row chart-size-fields">
    <label>Width
      <select aria-label={label ? `Width of ${label}` : 'Width'} value={width ?? `w${size.w}`} onChange={(event) => { const value = event.target.value; onChange({ ...size, w: value.startsWith('w') ? Number(value.slice(1)) : widthCols[value as keyof typeof widthCols] }) }}>
        {chartWidths.map((entry) => <option key={entry} value={entry}>{widthNames[entry]}</option>)}
        {!width && <option value={`w${size.w}`}>{size.w} of 12 columns</option>}
      </select>
    </label>
    <label>Height
      <select aria-label={label ? `Height of ${label}` : 'Height'} value={heightReason ? 'medium' : height ?? `h${size.h}`} disabled={Boolean(heightReason)} title={heightReason || undefined} onChange={(event) => { const value = event.target.value; onChange({ ...size, h: value.startsWith('h') ? Number(value.slice(1)) : heightRows[kind][value as keyof typeof heightLabels] }) }}>
        {chartHeights.map((entry) => <option key={entry} value={entry}>{heightLabels[entry]}</option>)}
        {!height && !heightReason && <option value={`h${size.h}`}>{size.h} rows</option>}
      </select>
    </label>
  </div>
}

// Size… (the chart's ⋯ menu): the owner's size for everyone, saved to Git.
export function SizeDialog({ eyebrow, title, size, kind = 'chart', heightReason, onCancel, onSave }: { eyebrow: string; title: string; size: GridSize; kind?: GridKind; heightReason?: string; onCancel: () => void; onSave: (size: GridSize) => Promise<void> | void }) {
  const [draft, setDraft] = useState(size)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <Modal eyebrow={eyebrow} title={`Size of ${title}`} onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(''); void Promise.resolve(onSave(draft)).then(() => setBusy(false), (failure: unknown) => { setBusy(false); setError(failure instanceof Error ? failure.message : String(failure)) }) }}>
      <p className="muted">The size everyone sees, unless they resized the chart for themselves. On a narrow screen every chart is full width.</p>
      <SizeFields size={draft} kind={kind} onChange={setDraft} heightReason={heightReason} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving to Git…' : 'Save to Git'}</button></div>
    </form>
  </Modal>
}

// CHT-19, CHT-20 A built-in chart (Team overview …) by its stable id: no owner per page, so its default is the factory
// size (today's: full width, medium) or the size a Tool Owner (layout.defaults) saved for everyone in the shared views
// defaults; every viewer may resize it for themselves (in grid units, CHT-48). Built-in charts are not moved.
export function BuiltInChart({ sizes, id, title, factory = stackFactory, className = 'viz-panel', detail, info, action, children }: { sizes: ChartSizes; id: string; title: string; factory?: GridSize; className?: string; detail?: ReactNode; info?: ReactNode; action?: ReactNode; children: ReactNode }) {
  const { size, source, base } = sizes.resolve(id, factory, sizes.shared(id))
  const { canSetDefault, viewOnly, views } = sizes.env
  const shared = Boolean(sizes.shared(id))
  const share = (next: GridSize | null, label: string) => { void sizes.saveShared(id, next && sameSize(next, factory) ? null : next).then(() => { if (next) sizes.setOwn(id, undefined); recordJob(`chart-size:${id}`, `${label} · ${title}`, { text: next ? `Saved ${sizeText(next)} for everyone in the shared views defaults.` : 'Everyone sees the chart at its factory size again.' }) }, (failure: unknown) => recordJob(`chart-size:${id}`, `${label} · ${title}`, { text: failure instanceof Error ? failure.message : String(failure), failed: true })) }
  const owner = canSetDefault && !viewOnly && views
  const extra = owner && source === 'viewer' ? <> · <button type="button" className="text-button" onClick={() => share(size, 'Save size for everyone')}>Save size for everyone</button></>
    : owner && shared ? <>Size: everyone’s (saved by a Tool Owner) · <button type="button" className="text-button" onClick={() => share(null, 'Factory size for everyone')}>Use the factory size for everyone</button></> : undefined
  return <ChartPanel id={id} className={className} title={title} detail={detail} info={info} action={action} size={size} source={source} extra={extra}
    onResize={(next) => sizes.setOwn(id, next, base)} onReset={() => sizes.setOwn(id, undefined)}>{children}</ChartPanel>
}
// CHT-19: the grid of built-in charts — each at the viewer's own, the shared or the factory size, in their order.
export function BuiltInGrid({ sizes, ids, titles, factory = stackFactory, children }: { sizes: ChartSizes; ids: string[]; titles: Record<string, string>; factory?: GridSize; children: ReactNode }) {
  const entries = ids.map((id) => ({ id, kind: 'chart' as const, size: sizes.resolve(id, factory, sizes.shared(id)).size }))
  return <ChartGrid className="chart-grid-builtin" entries={entries} titleOf={(id) => titles[id] ?? id} onResize={(id, size) => sizes.setOwn(id, size, sizes.resolve(id, factory, sizes.shared(id)).base)}>{children}</ChartGrid>
}
