import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatHours } from '../format'
import type { MonthlyHours } from '../capacity'
import { compactNumber as compact, longMonth as monthLabel, niceTicks, shortMonth } from '../chartUtils'

// Multi-line chart: Funded, Available and Actual hours per month. Marks carry the series colour (CSS tokens
// --viz-series-1..3, validated for light and dark); all text wears text tokens. Crosshair tooltip lists every
// series at the hovered month; the table view carries the same numbers without hovering.
const hoursSeries = [
  { key: 'funded', label: 'Funded', token: 'var(--viz-series-1)' },
  { key: 'available', label: 'Available', token: 'var(--viz-series-2)' },
  { key: 'actual', label: 'Actual', token: 'var(--viz-series-3)' },
] as const
type SeriesKey = typeof hoursSeries[number]['key']

const width = 960, height = 300, pad = { top: 18, right: 84, bottom: 34, left: 52 }

// End labels must not stack onto each other: push apart by a minimum gap, keeping order.
function spreadLabels(positions: number[], gap = 14, min = pad.top, max = height - pad.bottom) {
  const order = positions.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < order.length; i++) if (order[i].y - order[i - 1].y < gap) order[i].y = order[i - 1].y + gap
  for (let i = order.length - 1; i >= 0; i--) { if (order[i].y > max) order[i].y = max; if (i < order.length - 1 && order[i + 1].y - order[i].y < gap) order[i].y = order[i + 1].y - gap }
  for (const entry of order) if (entry.y < min) entry.y = min
  const result = [...positions]; for (const entry of order) result[entry.index] = entry.y
  return result
}

export function HoursTrendChart({ series, selected, onSelect, defaultView = 'chart' }: { series: MonthlyHours[]; selected: string; onSelect?: (month: string) => void; defaultView?: 'chart' | 'table' }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(defaultView === 'table')
  const svgRef = useRef<SVGSVGElement>(null)
  const id = useId()
  const plotWidth = width - pad.left - pad.right, plotHeight = height - pad.top - pad.bottom
  const max = Math.max(1, ...series.flatMap((point) => hoursSeries.map((item) => point[item.key] ?? 0)))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const x = (index: number) => pad.left + (series.length > 1 ? index / (series.length - 1) : 0.5) * plotWidth
  const y = (value: number) => pad.top + plotHeight - value / top * plotHeight
  const active = hover ?? Math.max(0, series.findIndex((point) => point.month === selected))
  const current = series[active]
  const endLabelY = spreadLabels(hoursSeries.map((item) => { const last = [...series].reverse().find((point) => point[item.key] != null); return last ? y(last[item.key]!) : height }))

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect(); if (!rect || !series.length) return
    const px = (event.clientX - rect.left) / rect.width * width
    const index = Math.round(Math.min(1, Math.max(0, (px - pad.left) / plotWidth)) * (series.length - 1))
    setHover(index)
  }
  function keyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover((value) => Math.min(series.length - 1, Math.max(0, (value ?? active) + (event.key === 'ArrowLeft' ? -1 : 1)))) }
    if (event.key === 'Enter' && current && onSelect) onSelect(current.month)
    if (event.key === 'Escape') setHover(null)
  }
  const path = (key: SeriesKey) => series.map((point, index) => point[key] == null ? null : `${index === 0 || series[index - 1][key] == null ? 'M' : 'L'}${x(index).toFixed(1)},${y(point[key]!).toFixed(1)}`).filter(Boolean).join(' ')
  if (!series.length) return null
  return <div className="viz-root hours-trend">
    <div className="viz-toolbar">
      {table ? <span /> : <ul className="viz-legend" aria-label="Series">{hoursSeries.map((item) => <li key={item.key}><i style={{ background: item.token }} aria-hidden="true" />{item.label}</li>)}</ul>}
      <button type="button" className="ghost" aria-pressed={table} onClick={() => setTable((value) => !value)}>{table ? 'Chart' : 'Table'}</button>
    </div>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>Month</th>{hoursSeries.map((item) => <th key={item.key}>{item.label} (h)</th>)}<th>People</th></tr></thead><tbody>{series.map((point) => <tr key={point.month} className={point.month === selected ? 'matrix-total' : ''}><td>{monthLabel(point.month)}</td>{hoursSeries.map((item) => <td key={item.key}>{formatHours(point[item.key])}</td>)}<td>{point.people}</td></tr>)}</tbody></table></div>
    : <div className="viz-plot">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onPointerMove={pointerMove} onPointerLeave={() => setHover(null)} onKeyDown={keyDown} onClick={() => current && onSelect?.(current.month)}>
        <title id={`${id}-title`}>Funded, available and actual hours per month</title>
        {ticks.map((tick) => <g key={tick}><line className="viz-grid" x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} /><text className="viz-tick" x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{compact(tick)}</text></g>)}
        {series.map((point, index) => <text key={point.month} className={`viz-tick ${point.month === selected ? 'viz-tick-selected' : ''}`} x={x(index)} y={height - pad.bottom + 18} textAnchor="middle">{shortMonth(point.month)}{point.month.endsWith('-01') || index === 0 ? ` ’${point.month.slice(2, 4)}` : ''}</text>)}
        {series.findIndex((point) => point.month === selected) >= 0 && <rect className="viz-selected-band" x={x(series.findIndex((point) => point.month === selected)) - 14} y={pad.top} width={28} height={plotHeight} rx={4} />}
        {hover != null && <line className="viz-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} />}
        {hoursSeries.map((item) => <path key={item.key} d={path(item.key)} fill="none" stroke={item.token} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
        {hoursSeries.map((item) => series.map((point, index) => point[item.key] == null ? null : <circle key={`${item.key}-${point.month}`} cx={x(index)} cy={y(point[item.key]!)} r={index === active ? 5 : 4} fill={item.token} className="viz-marker" />))}
        {hoursSeries.map((item, seriesIndex) => { const last = [...series].reverse().find((point) => point[item.key] != null); if (!last) return null; const lastIndex = series.indexOf(last); return <g key={`label-${item.key}`}><line className="viz-leader" x1={x(lastIndex) + 6} x2={width - pad.right + 6} y1={y(last[item.key]!)} y2={endLabelY[seriesIndex]} /><text className="viz-end-label" x={width - pad.right + 10} y={endLabelY[seriesIndex]} dominantBaseline="middle">{formatHours(last[item.key])}</text></g> })}
      </svg>
      {current && hover != null && <div className="viz-tooltip" style={{ left: `${x(hover) / width * 100}%` }} role="status"><strong>{monthLabel(current.month)}</strong>{hoursSeries.map((item) => <div key={item.key}><i style={{ background: item.token }} aria-hidden="true" /><b>{formatHours(current[item.key])} h</b><span>{item.label}</span></div>)}<small>{current.people} people · {current.workingDays} working days</small></div>}
    </div>}
  </div>
}
