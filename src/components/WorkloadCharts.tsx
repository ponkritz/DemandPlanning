import { useId, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { formatHours, formatPercent } from '../format'
import type { MonthlyHours, StreamSummary } from '../capacity'
import { arcPath, barPath, columnPath, compactNumber, longMonth, monthTick, niceTicks, paretoSeries, useElementWidth, wrapLabel, type EpicColors } from '../chartUtils'

// Combination charts share ONE unit per plot (never a second y-axis): utilization bars + planned-utilization line
// are both %, Epic stacks + available line are both hours. Marks carry series colour; all text wears text tokens.

function LegendBar({ color, label }: { color: string; label: string }) { return <li><i className="viz-key-bar" style={{ background: color }} aria-hidden="true" />{label}</li> }
function LegendLine({ color, label }: { color: string; label: string }) { return <li><i style={{ background: color }} aria-hidden="true" />{label}</li> }
function LegendTick({ label }: { label: string }) { return <li><i className="viz-key-tick" aria-hidden="true" />{label}</li> }

function ChartFrame({ legend, table, setTable, children }: { legend: ReactNode; table: boolean; setTable: (value: boolean) => void; children: ReactNode }) {
  return <div className="viz-root">
    <div className="viz-toolbar"><ul className="viz-legend" aria-label="Legend">{legend}</ul><button type="button" className="ghost" aria-pressed={table} onClick={() => setTable(!table)}>{table ? 'Chart' : 'Table'}</button></div>
    {children}
  </div>
}

function Tooltip({ left, top = 8, width, children }: { left: number; top?: number; width: number; children: ReactNode }) {
  return <div className="viz-tooltip" role="status" style={{ left: Math.min(width - 96, Math.max(96, left)), top }}>{children}</div>
}

function TooltipRow({ color, value, label }: { color: string; value: string; label: string }) {
  return <div><i style={{ background: color }} aria-hidden="true" /><b>{value}</b><span>{label}</span></div>
}

// Month-axis keyboard: ←/→ move the readout, Enter selects that month, Esc clears.
function monthKeys(event: KeyboardEvent<SVGSVGElement>, count: number, active: number, setHover: (index: number | null) => void, select: () => void) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover(Math.min(count - 1, Math.max(0, active + (event.key === 'ArrowLeft' ? -1 : 1)))) }
  else if (event.key === 'Enter') select()
  else if (event.key === 'Escape') setHover(null)
}

function MonthAxis({ series, selected, x, y, band }: { series: MonthlyHours[]; selected: string; x: (index: number) => number; y: number; band: number }) {
  const step = band < 34 ? 2 : 1
  return <>{series.map((point, index) => (index % step === 0 || point.month === selected) && <text key={point.month} className={`viz-tick ${point.month === selected ? 'viz-tick-selected' : ''}`} x={x(index)} y={y} textAnchor="middle">{monthTick(point.month, index)}</text>)}</>
}

export function UtilizationChart({ series, selected, onSelect, overloadedAt, availableBelow }: { series: MonthlyHours[]; selected: string; onSelect?: (month: string) => void; overloadedAt: number; availableBelow: number }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const id = useId()
  const height = 280, pad = { top: 22, right: 122, bottom: 34, left: 46 }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const values = series.flatMap((point) => [point.utilization, point.plannedUtilization]).filter((value): value is number => value != null)
  const ticks = niceTicks(Math.max(overloadedAt * 1.1, ...values))
  const top = ticks[ticks.length - 1]
  const band = plotWidth / Math.max(1, series.length)
  const x = (index: number) => pad.left + band * (index + 0.5)
  const y = (value: number) => pad.top + plotHeight - Math.min(value, top) / top * plotHeight
  const barWidth = Math.min(24, band * 0.55)
  const selectedIndex = series.findIndex((point) => point.month === selected)
  const active = hover ?? (selectedIndex >= 0 ? selectedIndex : series.length - 1)
  const current = series[active]
  const indexAt = (event: PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return Math.min(series.length - 1, Math.max(0, Math.floor((event.clientX - rect.left - pad.left) / band))) }
  const line = series.map((point, index) => point.plannedUtilization == null ? null : `${index === 0 || series[index - 1].plannedUtilization == null ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.plannedUtilization).toFixed(1)}`).filter(Boolean).join(' ')
  const references = [{ value: overloadedAt, label: `Overloaded ≥ ${overloadedAt}%` }, { value: availableBelow, label: `Capacity < ${availableBelow}%` }]
  const legend = <><LegendBar color="var(--viz-series-1)" label="Actual utilization" /><LegendLine color="var(--viz-series-2)" label="Planned utilization" /></>
  return <ChartFrame legend={legend} table={table} setTable={setTable}><div ref={wrap}>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>Month</th><th>Actual utilization</th><th>Planned utilization</th><th>Booked (h)</th><th>Planned (h)</th><th>Available (h)</th></tr></thead><tbody>{series.map((point) => <tr key={point.month} className={point.month === selected ? 'matrix-total' : ''}><td>{longMonth(point.month)}</td><td>{formatPercent(point.utilization)}</td><td>{formatPercent(point.plannedUtilization)}</td><td>{formatHours(point.actual)}</td><td>{formatHours(point.planned)}</td><td>{formatHours(point.available)}</td></tr>)}</tbody></table></div>
    : <div className="viz-plot">
      <svg className="viz-fixed" width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onPointerMove={(event) => setHover(indexAt(event))} onPointerLeave={() => setHover(null)} onKeyDown={(event) => monthKeys(event, series.length, active, setHover, () => current && onSelect?.(current.month))} onClick={() => current && onSelect?.(current.month)}>
        <title id={`${id}-title`}>Actual and planned utilization per month, with overloaded and capacity thresholds</title>
        {ticks.map((tick) => <g key={tick}><line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(tick)} y2={y(tick)} /><text className="viz-tick" x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{tick}%</text></g>)}
        {selectedIndex >= 0 && <rect className="viz-selected-band" x={x(selectedIndex) - band / 2 + 2} y={pad.top} width={Math.max(4, band - 4)} height={plotHeight} rx={4} />}
        {references.map((reference) => <g key={reference.label}><line className="viz-reference" x1={pad.left} x2={pad.left + plotWidth} y1={y(reference.value)} y2={y(reference.value)} /><text className="viz-reference-label" x={pad.left + plotWidth + 8} y={y(reference.value)} dominantBaseline="middle">{reference.label}</text></g>)}
        {hover != null && <line className="viz-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotHeight} />}
        {series.map((point, index) => point.utilization == null ? null : <path key={point.month} className={`viz-bar ${index === active ? 'viz-bar-active' : ''}`} d={columnPath(x(index) - barWidth / 2, y(point.utilization), barWidth, pad.top + plotHeight - y(point.utilization))} fill="var(--viz-series-1)" />)}
        <path d={line} fill="none" stroke="var(--viz-series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((point, index) => point.plannedUtilization == null ? null : <circle key={point.month} className="viz-marker" cx={x(index)} cy={y(point.plannedUtilization)} r={index === active ? 5 : 4} fill="var(--viz-series-2)" />)}
        {current?.utilization != null && <text className="viz-value-label" x={x(active)} y={Math.max(12, Math.min(y(current.utilization), current.plannedUtilization != null ? y(current.plannedUtilization) : Infinity) - 10)} textAnchor="middle">{formatPercent(current.utilization, 0)}</text>}
        <MonthAxis series={series} selected={selected} x={x} y={height - pad.bottom + 18} band={band} />
      </svg>
      {hover != null && current && <Tooltip left={x(hover)} width={width}><strong>{longMonth(current.month)}</strong><TooltipRow color="var(--viz-series-1)" value={formatPercent(current.utilization)} label="Actual" /><TooltipRow color="var(--viz-series-2)" value={formatPercent(current.plannedUtilization)} label="Planned" /><small>{formatHours(current.actual)}h booked · {formatHours(current.available)}h available</small></Tooltip>}
    </div>}
  </div></ChartFrame>
}

export function EpicMixChart({ series, selected, onSelect, colors }: { series: MonthlyHours[]; selected: string; onSelect?: (month: string) => void; colors: EpicColors }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const id = useId()
  const height = 300, pad = { top: 18, right: 104, bottom: 34, left: 52 }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const groups = [...colors.top.map((entry) => ({ key: entry.key, title: entry.title, color: entry.color })), { key: '__other', title: 'Other Epics', color: colors.other }]
  const stacks = series.map((point) => {
    const values = groups.map((group) => group.key === '__other' ? point.streams.filter((stream) => !colors.isTop(stream.key)).reduce((sum, stream) => sum + stream.work, 0) : point.streams.find((stream) => stream.key === group.key)?.work ?? 0)
    return { point, values, total: values.reduce((sum, value) => sum + value, 0) }
  })
  const shown = stacks.some((stack) => stack.values[groups.length - 1] > 0) ? groups : groups.slice(0, -1)
  const ticks = niceTicks(Math.max(1, ...stacks.map((stack) => Math.max(stack.total, stack.point.available ?? 0))))
  const top = ticks[ticks.length - 1]
  const band = plotWidth / Math.max(1, series.length)
  const x = (index: number) => pad.left + band * (index + 0.5)
  const y = (value: number) => pad.top + plotHeight - value / top * plotHeight
  const barWidth = Math.min(24, band * 0.55)
  const selectedIndex = series.findIndex((point) => point.month === selected)
  const active = hover ?? (selectedIndex >= 0 ? selectedIndex : series.length - 1)
  const current = stacks[active]
  const indexAt = (event: PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return Math.min(series.length - 1, Math.max(0, Math.floor((event.clientX - rect.left - pad.left) / band))) }
  const available = series.map((point, index) => point.available == null ? null : `${index === 0 || series[index - 1].available == null ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.available).toFixed(1)}`).filter(Boolean).join(' ')
  const lastAvailable = [...series.keys()].reverse().find((index) => series[index].available != null)
  const legend = <>{shown.map((group) => <LegendBar key={group.key} color={group.color} label={group.title} />)}<LegendLine color="var(--viz-capacity)" label="Available hours" /></>
  return <ChartFrame legend={legend} table={table} setTable={setTable}><div ref={wrap}>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>Month</th>{shown.map((group) => <th key={group.key}>{group.title}</th>)}<th>Booked (h)</th><th>Available (h)</th></tr></thead><tbody>{stacks.map((stack) => <tr key={stack.point.month} className={stack.point.month === selected ? 'matrix-total' : ''}><td>{longMonth(stack.point.month)}</td>{shown.map((group, index) => <td key={group.key}>{stack.values[index] ? formatHours(stack.values[index]) : '·'}</td>)}<td>{stack.point.actual == null ? '—' : formatHours(stack.total)}</td><td>{formatHours(stack.point.available)}</td></tr>)}</tbody></table></div>
    : <div className="viz-plot">
      <svg className="viz-fixed" width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onPointerMove={(event) => setHover(indexAt(event))} onPointerLeave={() => setHover(null)} onKeyDown={(event) => monthKeys(event, series.length, active, setHover, () => current && onSelect?.(current.point.month))} onClick={() => current && onSelect?.(current.point.month)}>
        <title id={`${id}-title`}>Booked hours per Epic stacked by month, with available hours</title>
        {ticks.map((tick) => <g key={tick}><line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(tick)} y2={y(tick)} /><text className="viz-tick" x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{compactNumber(tick)}</text></g>)}
        {selectedIndex >= 0 && <rect className="viz-selected-band" x={x(selectedIndex) - band / 2 + 2} y={pad.top} width={Math.max(4, band - 4)} height={plotHeight} rx={4} />}
        {hover != null && <line className="viz-crosshair" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + plotHeight} />}
        {stacks.map((stack, index) => {
          const last = stack.values.findLastIndex((value) => value > 0)
          let below = 0
          return <g key={stack.point.month} className={`viz-bar ${index === active ? 'viz-bar-active' : ''}`}>{stack.values.map((value, groupIndex) => {
            if (value <= 0) return null
            const bottom = y(below), topEdge = y(below + value), gap = below > 0 ? 2 : 0
            below += value
            const segmentHeight = Math.max(0, bottom - topEdge - gap)
            if (segmentHeight <= 0) return null
            return groupIndex === last
              ? <path key={groups[groupIndex].key} d={columnPath(x(index) - barWidth / 2, topEdge, barWidth, segmentHeight)} fill={groups[groupIndex].color} />
              : <rect key={groups[groupIndex].key} x={x(index) - barWidth / 2} y={topEdge} width={barWidth} height={segmentHeight} fill={groups[groupIndex].color} />
          })}</g>
        })}
        <path d={available} fill="none" stroke="var(--viz-capacity)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((point, index) => point.available == null ? null : <circle key={point.month} className="viz-marker" cx={x(index)} cy={y(point.available)} r={index === active ? 5 : 4} fill="var(--viz-capacity)" />)}
        {lastAvailable != null && <text className="viz-end-label" x={pad.left + plotWidth + 10} y={y(series[lastAvailable].available!)} dominantBaseline="middle">{formatHours(series[lastAvailable].available)}<tspan className="viz-muted" x={pad.left + plotWidth + 10} dy={15}>available</tspan></text>}
        <MonthAxis series={series} selected={selected} x={x} y={height - pad.bottom + 18} band={band} />
      </svg>
      {hover != null && current && <Tooltip left={x(hover)} width={width}><strong>{longMonth(current.point.month)}</strong><TooltipRow color="var(--viz-capacity)" value={`${formatHours(current.point.available)} h`} label="Available" /><TooltipRow color="var(--text-3)" value={current.point.actual == null ? '—' : `${formatHours(current.total)} h`} label="Booked" />{shown.map((group, index) => current.values[index] > 0 && <TooltipRow key={group.key} color={group.color} value={`${formatHours(current.values[index])} h`} label={group.title} />)}</Tooltip>}
    </div>}
  </div></ChartFrame>
}

export function EpicBulletChart({ streams, colors }: { streams: StreamSummary[]; colors: EpicColors }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const id = useId()
  const rowHeight = 34, barHeight = 16
  const pad = { top: 6, right: 104, bottom: 30, left: 124 }
  const height = pad.top + streams.length * rowHeight + pad.bottom
  const plotWidth = Math.max(10, width - pad.left - pad.right)
  const ticks = niceTicks(Math.max(1, ...streams.flatMap((stream) => [stream.work, stream.planned])), Math.max(2, Math.min(5, Math.floor(plotWidth / 90))))
  const top = ticks[ticks.length - 1]
  const x = (value: number) => pad.left + value / top * plotWidth
  const rowY = (index: number) => pad.top + index * rowHeight + (rowHeight - barHeight) / 2
  const current = hover == null ? undefined : streams[hover]
  const keyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setHover((value) => Math.min(streams.length - 1, Math.max(0, (value ?? -1) + (event.key === 'ArrowUp' ? -1 : 1)))) }
    else if (event.key === 'Escape') setHover(null)
  }
  const legend = <><LegendBar color="var(--text-3)" label="Booked hours (Epic colour)" /><LegendTick label="Planned hours" /></>
  return <ChartFrame legend={legend} table={table} setTable={setTable}><div ref={wrap}>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>Epic</th><th>Booked (h)</th><th>Planned (h)</th><th>Variance (h)</th><th>Share</th><th>People</th></tr></thead><tbody>{streams.map((stream) => <tr key={stream.key}><td>{stream.title}</td><td>{formatHours(stream.work)}</td><td>{formatHours(stream.planned)}</td><td>{formatHours(stream.work - stream.planned)}</td><td>{formatPercent(stream.share, 0)}</td><td>{stream.people}</td></tr>)}</tbody></table></div>
    : <div className="viz-plot">
      <svg className="viz-fixed" width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onKeyDown={keyDown} onPointerLeave={() => setHover(null)}>
        <title id={`${id}-title`}>Booked and planned hours per Epic for the selected month</title>
        {ticks.map((tick) => <g key={tick}><line className="viz-grid" x1={x(tick)} x2={x(tick)} y1={pad.top} y2={height - pad.bottom} /><text className="viz-tick" x={x(tick)} y={height - pad.bottom + 18} textAnchor="middle">{compactNumber(tick)}</text></g>)}
        {streams.map((stream, index) => {
          const label = stream.title.length > 17 ? `${stream.title.slice(0, 16)}…` : stream.title
          return <g key={stream.key} onPointerEnter={() => setHover(index)}>
            <rect className={index === hover ? 'viz-row-active' : 'viz-row-hit'} x={0} y={pad.top + index * rowHeight} width={width} height={rowHeight} rx={4} />
            <text className="viz-row-label" x={pad.left - 10} y={rowY(index) + barHeight / 2} textAnchor="end" dominantBaseline="middle"><title>{stream.title}</title>{label}</text>
            <path d={barPath(pad.left, rowY(index), x(stream.work) - pad.left, barHeight)} fill={colors.colorOf(stream.key)} />
            {stream.planned > 0 && <><line className="viz-tick-ring" x1={x(stream.planned)} x2={x(stream.planned)} y1={rowY(index) - 4} y2={rowY(index) + barHeight + 4} /><line className="viz-tick-mark" x1={x(stream.planned)} x2={x(stream.planned)} y1={rowY(index) - 4} y2={rowY(index) + barHeight + 4} /></>}
            <text className="viz-end-label" x={Math.max(x(stream.work), x(stream.planned)) + 10} y={rowY(index) + barHeight / 2} dominantBaseline="middle">{formatHours(stream.work)}h<tspan className="viz-muted"> · {formatPercent(stream.share, 0)}</tspan></text>
          </g>
        })}
      </svg>
      {current && hover != null && <Tooltip left={x(current.work)} top={rowY(hover) + rowHeight} width={width}><strong>{current.title}</strong><TooltipRow color={colors.colorOf(current.key)} value={`${formatHours(current.work)} h`} label="Booked" /><TooltipRow color="var(--text)" value={`${formatHours(current.planned)} h`} label="Planned" /><small>{current.work - current.planned >= 0 ? '+' : ''}{formatHours(current.work - current.planned)}h vs plan · {current.people} people · {current.features} feature{current.features === 1 ? '' : 's'}</small></Tooltip>}
    </div>}
  </div></ChartFrame>
}

// Pareto on ONE % axis: bars = each cause's share of the problem (largest first), line = cumulative share, reference
// line at the threshold. The vital few up to the crossing stay solid; the long tail is muted (emphasis, not colour).
// Bars carry the colour of their Epic. Fewer than three causes is not a Pareto: those render as a short ranked list.
export interface ParetoItem { key: string; title: string; work: number; colorKey?: string; group?: string }
export function ParetoChart({ items, colors, noun, measure, threshold = 80, shortLabel }: { items: ParetoItem[]; colors: EpicColors; noun: string; measure: string; threshold?: number; shortLabel?: (title: string) => string }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const id = useId()
  const data = paretoSeries(items, threshold)
  const plural = (count: number) => `${count} ${noun}${count === 1 ? '' : 's'}`
  const colorOf = (item: ParetoItem) => colors.colorOf(item.colorKey ?? item.key)
  if (data.length < 3) return <div className="viz-few">
    <p className="muted">{data.length ? `Only ${plural(data.length)} with ${measure} — too few for a Pareto, listed instead.` : `No ${measure} in this range.`}</p>
    {data.map((item) => <div key={item.key} className="viz-few-row"><i style={{ background: colorOf(item) }} aria-hidden="true" /><span title={item.title}>{item.title}{item.group && item.group !== item.title && <small>{item.group}</small>}</span><b>{formatHours(item.work)}h</b><small>{formatPercent(item.share, 0)}</small></div>)}
  </div>
  const vitalCount = data.filter((item) => item.vital).length
  const height = 320, pad = { top: 26, right: 46, bottom: 56, left: 46 }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const band = plotWidth / data.length
  const x = (index: number) => pad.left + band * (index + 0.5)
  const y = (value: number) => pad.top + plotHeight - Math.min(100, value) / 100 * plotHeight
  const barWidth = Math.min(28, band * 0.6)
  const line = data.map((item, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(item.cumulative).toFixed(1)}`).join(' ')
  const crossing = vitalCount - 1
  const current = hover == null ? undefined : data[hover]
  const maxChars = Math.max(4, Math.floor(band / 6.6))
  const indexAt = (event: PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return Math.min(data.length - 1, Math.max(0, Math.floor((event.clientX - rect.left - pad.left) / band))) }
  const legend = <><LegendBar color="var(--text-3)" label={`Share of ${measure} (Epic colour)`} /><LegendLine color="var(--viz-capacity)" label="Cumulative share" /></>
  return <ChartFrame legend={legend} table={table} setTable={setTable}><div ref={wrap}>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>{noun}</th><th>Epic</th><th>Hours</th><th>Share</th><th>Cumulative</th><th>Vital few</th></tr></thead><tbody>{data.map((item) => <tr key={item.key}><td>{item.title}</td><td>{item.group ?? '—'}</td><td>{formatHours(item.work)}</td><td>{formatPercent(item.share)}</td><td>{formatPercent(item.cumulative)}</td><td>{item.vital ? 'Yes' : ''}</td></tr>)}</tbody></table></div>
    : <div className="viz-plot">
      <svg className="viz-fixed" width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onPointerMove={(event) => setHover(indexAt(event))} onPointerLeave={() => setHover(null)} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover((value) => Math.min(data.length - 1, Math.max(0, (value ?? -1) + (event.key === 'ArrowLeft' ? -1 : 1)))) } else if (event.key === 'Escape') setHover(null) }}>
        <title id={`${id}-title`}>{`Pareto of ${measure} by ${noun}: share per ${noun} and cumulative share`}</title>
        {[0, 25, 50, 75, 100].map((tick) => <g key={tick}><line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(tick)} y2={y(tick)} /><text className="viz-tick" x={pad.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">{tick}%</text></g>)}
        <line className="viz-reference" x1={pad.left} x2={pad.left + plotWidth} y1={y(threshold)} y2={y(threshold)} /><text className="viz-reference-label" x={pad.left + plotWidth + 6} y={y(threshold)} dominantBaseline="middle">{threshold}%</text>
        {hover != null && <rect className="viz-selected-band" x={x(hover) - band / 2 + 2} y={pad.top} width={Math.max(4, band - 4)} height={plotHeight} rx={4} />}
        {data.map((item, index) => <path key={item.key} className={item.vital ? 'viz-bar viz-bar-active' : 'viz-bar viz-pareto-tail'} d={columnPath(x(index) - barWidth / 2, y(item.share), barWidth, pad.top + plotHeight - y(item.share))} fill={colorOf(item)} />)}
        <path d={line} fill="none" stroke="var(--viz-capacity)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((item, index) => <circle key={item.key} className="viz-marker" cx={x(index)} cy={y(item.cumulative)} r={index === crossing || index === hover ? 5 : 4} fill="var(--viz-capacity)" />)}
        {crossing >= 0 && <text className="viz-value-label" x={x(crossing)} y={y(data[crossing].cumulative) - 12} textAnchor={crossing === data.length - 1 ? 'end' : crossing === 0 ? 'start' : 'middle'}>{`${formatPercent(data[crossing].cumulative, 0)} from ${plural(vitalCount)}`}</text>}
        {data.map((item, index) => <text key={item.key} className="viz-tick" x={x(index)} y={height - pad.bottom + 16} textAnchor="middle"><title>{item.title}</title>{wrapLabel(shortLabel ? shortLabel(item.title) : item.title, maxChars).map((lineText, lineIndex) => <tspan key={lineIndex} x={x(index)} dy={lineIndex ? 13 : 0}>{lineText}</tspan>)}</text>)}
      </svg>
      {current && hover != null && <Tooltip left={x(hover)} width={width}><strong>{current.title}</strong><TooltipRow color={colorOf(current)} value={`${formatHours(current.work)} h`} label={`${formatPercent(current.share, 0)} of ${measure}`} /><TooltipRow color="var(--viz-capacity)" value={formatPercent(current.cumulative, 0)} label="cumulative" /><small>{current.group && current.group !== current.title ? `${current.group} · ` : ''}{current.vital ? `one of the ${plural(vitalCount)} behind ${threshold}%` : 'long tail'}</small></Tooltip>}
    </div>}
  </div></ChartFrame>
}

// Diverging heatmap: people × months, each cell = utilization (booked ÷ available). Neutral grey at the midpoint
// (the overloaded threshold), blue below = spare capacity, red above = overloaded. It is an HTML table, so the
// numbers are always readable without hovering and it doubles as the table view.
export function UtilizationHeatmap({ series, selected, onSelect, midpoint }: { series: MonthlyHours[]; selected: string; onSelect?: (month: string) => void; midpoint: number }) {
  const months = series.filter((point) => point.byPerson.some((person) => person.utilization != null))
  const cellOf = (point: MonthlyHours, name: string) => point.byPerson.find((person) => person.name === name)
  const average = (name: string) => { const values = months.map((point) => cellOf(point, name)?.utilization).filter((value): value is number => value != null); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }
  const overloadedMonths = (name: string) => months.filter((point) => (cellOf(point, name)?.utilization ?? -1) >= midpoint).length
  const names = [...new Set(months.flatMap((point) => point.byPerson.map((person) => person.name)))].sort((a, b) => (average(b) ?? -1) - (average(a) ?? -1) || a.localeCompare(b))
  const fill = (value: number | null | undefined) => {
    if (value == null) return undefined
    const strength = Math.round(Math.min(1, Math.abs(value - midpoint) / 40) * 62)
    return `color-mix(in srgb, ${value >= midpoint ? 'var(--viz-diverge-hi)' : 'var(--viz-diverge-lo)'} ${strength}%, var(--viz-diverge-mid))`
  }
  if (!months.length) return null
  return <div className="viz-root">
    <div className="viz-toolbar"><div className="viz-scale" aria-hidden="true"><span>Spare capacity</span><i className="viz-scale-bar" /><span>Overloaded</span><small>grey = {midpoint}%</small></div></div>
    <div className="azure-table"><table className="viz-heatmap"><thead><tr><th>Person</th>{months.map((point, index) => <th key={point.month} className={point.month === selected ? 'viz-heat-selected' : ''}><button type="button" className="viz-heat-month" aria-pressed={point.month === selected} onClick={() => onSelect?.(point.month)}>{monthTick(point.month, index)}</button></th>)}<th>Average</th><th>Months ≥ {midpoint}%</th></tr></thead>
      <tbody>{names.map((name) => <tr key={name}><td><strong>{name}</strong></td>{months.map((point) => { const cell = cellOf(point, name); return <td key={point.month} className={`viz-heat ${point.month === selected ? 'viz-heat-selected' : ''}`} style={{ background: fill(cell?.utilization) }} title={cell?.utilization != null ? `${name} · ${longMonth(point.month)}: ${formatPercent(cell.utilization)} (${formatHours(cell.work)}h of ${formatHours(cell.available)}h available) · ${cell.status}` : `${name} · ${longMonth(point.month)}: no bookings`}>{cell?.utilization != null ? formatPercent(cell.utilization, 0) : '·'}</td> })}<td className="viz-heat-avg" style={{ background: fill(average(name)) }}>{formatPercent(average(name), 0)}</td><td className="viz-heat-count">{overloadedMonths(name)} of {months.length}</td></tr>)}</tbody>
    </table></div>
  </div>
}

// Donut for part-to-whole with a few slices (≤ 6). 2px surface gaps between slices; the centre shows the total, or the
// hovered/focused slice. Values and shares are also in the legend beside it and in the table view.
export function DonutChart({ label, segments, centerValue, centerLabel }: { label: string; segments: { key: string; label: string; value: number; color: string }[]; centerValue: string; centerLabel: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const id = useId()
  const shown = segments.filter((segment) => segment.value > 0)
  const total = shown.reduce((sum, segment) => sum + segment.value, 0)
  const size = 196, center = size / 2, outer = 92, inner = 60
  const arcs = shown.map((segment, index) => {
    const before = shown.slice(0, index).reduce((sum, item) => sum + item.value, 0)
    const start = -Math.PI / 2 + before / total * Math.PI * 2
    return { ...segment, start, end: start + segment.value / total * Math.PI * 2, share: segment.value / total * 100 }
  })
  const active = hover == null ? undefined : arcs[hover]
  if (!total) return null
  return <ChartFrame legend={null} table={table} setTable={setTable}>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>{label}</th><th>Hours</th><th>Share</th></tr></thead><tbody>{arcs.map((arc) => <tr key={arc.key}><td>{arc.label}</td><td>{formatHours(arc.value)}</td><td>{formatPercent(arc.share)}</td></tr>)}<tr className="matrix-total"><td>Total</td><td>{formatHours(total)}</td><td>100%</td></tr></tbody></table></div>
    : <div className="viz-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0} onPointerLeave={() => setHover(null)} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1; setHover((value) => ((value ?? (step > 0 ? -1 : 0)) + step + arcs.length) % arcs.length) } else if (event.key === 'Escape') setHover(null) }}>
        <title id={`${id}-title`}>{label}: {arcs.map((arc) => `${arc.label} ${formatHours(arc.value)} hours`).join(', ')}</title>
        {arcs.map((arc, index) => <path key={arc.key} className={hover == null || hover === index ? 'viz-slice' : 'viz-slice viz-slice-dim'} d={arcPath(center, center, inner, hover === index ? outer + 3 : outer, arc.start, arc.end)} fill={arc.color} fillRule="evenodd" onPointerEnter={() => setHover(index)} />)}
        <text className="viz-donut-value" x={center} y={center - 2} textAnchor="middle">{active ? `${formatHours(active.value)}h` : centerValue}</text>
        <text className="viz-donut-label" x={center} y={center + 16} textAnchor="middle">{active ? `${active.label} · ${formatPercent(active.share, 0)}` : centerLabel}</text>
      </svg>
      <ul className="viz-donut-legend" aria-label={`${label} legend`}>{arcs.map((arc, index) => <li key={arc.key} className={hover === index ? 'active' : ''} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}><i style={{ background: arc.color }} aria-hidden="true" /><span>{arc.label}</span><b>{formatHours(arc.value)}h</b><small>{formatPercent(arc.share, 0)}</small></li>)}</ul>
    </div>}
  </ChartFrame>
}
