import { useId, useState, type KeyboardEvent } from 'react'
import { arcPath, barPath, columnPath, epicSlots, niceTicks, otherColor, useElementWidth, wrapLabel } from '../chartUtils'
import { useDataLabels } from '../useDataLabels'
import { displayText, rowId, type Insight, type OnDemandPage, type OnDemandRow } from '../onDemand'
import { chartData, currencyText, dateGroupLabels, drillRows, formatShown, formatValue, grainOf, insightProblems, measureText, noneKey, otherKey, valueText, type Bucket, type ChartData, type InsightData } from '../onDemandInsights'
import { AxisTitles } from './chartLabels'
import { DataTable, type DataColumn } from './DataTable'
import { Metric, Modal, Notice } from './ui'
import { ChartFrame, LegendBar, LegendLine, Tooltip, TooltipRow } from './WorkloadCharts'

// OND-12 The charts and the summary table of an On-Demand insight, drawn from aggregate() (src/onDemandInsights.ts) in
// the app's chart frame (UI-STANDARDS §9: legend, Data labels, Table / Chart, axis names) with the --viz-series-*
// colours; "(none)" and "Other" in the neutral colour. Every chart starts its value axis at zero (to scale).
// CHT-01…CHT-12: the chart options — vertical columns, a Pareto, a KPI, Top N, running total, % of total, a target
// line, colours pinned per value, a click (or Enter) that lists the rows behind a bar, slice or point — all drawn
// here, for the Insights tab and the On-Demand Dashboard alike; without options every chart is drawn as before.

type ColorPins = Record<string, number> | undefined
const pinOf = (bucket: Bucket, pins: ColorPins) => bucket.key === otherKey || bucket.key === noneKey ? undefined : pins?.[bucket.key]
// Colours by position among the coloured buckets, so "(none)" between them does not shift the others; a value pinned
// to a palette colour (CHT-09) takes that colour, the others keep the colour of their place.
const colors = (buckets: Bucket[], pins?: ColorPins) => {
  // Without pins: by position, as before. With pins: the values not pinned take the palette colours no shown value is
  // pinned to, in order, so two values never share a colour while there are colours left.
  const pinned = new Set(buckets.map((bucket) => pinOf(bucket, pins)).filter(Boolean).map((slot) => epicSlots[(slot! - 1) % epicSlots.length]))
  const free = epicSlots.filter((color) => !pinned.has(color))
  let at = 0
  return buckets.map((bucket) => { if (bucket.key === otherKey || bucket.key === noneKey) return otherColor; const pin = pinOf(bucket, pins); if (pin) return `var(--viz-series-${pin})`; const list = free.length ? free : epicSlots; const color = list[at % list.length]; at++; return color })
}
const tick = (value: number) => Math.abs(value) >= 10000 ? `${Number((value / 1000).toFixed(1))}K` : formatValue(value)
const tickOf = (unit: '' | '%') => (value: number) => unit === '%' ? `${formatValue(value)}%` : tick(value)
// Ticks over [min, max] with zero on the axis.
function scale(min: number, max: number, count: number) {
  if (min >= 0) return niceTicks(max > 0 ? max : 1, count)
  const step = niceTicks(Math.max(1e-9, max - min), count)[1] || 1
  const low = Math.floor(min / step) * step, high = Math.ceil(Math.max(0, max) / step) * step
  return Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => Number((low + index * step).toFixed(6)))
}
type Drill = (category: number, series: number | null) => void
interface ChartProps { page: OnDemandPage; insight: Insight; data: ChartData; pins: ColorPins; onDrill?: Drill }
const drillHint = 'Click a bar, slice or point — or press Enter on the highlighted one — to list the rows behind it.'

// OND-24: a Sum / Average of a Currency column shows one currency at a time — a choice above the chart when the rows
// hold several (not saved: the one with most rows comes first for everyone). Stacking or adding the currencies up would
// draw amounts of different currencies as one total; one currency at a time keeps every bar, slice and total in one unit.
// colors: the page's (or dashboard's) colour pins (CHT-09); drill: false in an editor's preview (CHT-10).
// narrowed (OND-54): the page's rows are those the Insights tab's filter row keeps, so an empty chart says so.
// currency (OND-60): the currency the filter row chose for this chart's column, shown first; the viewer's own pick
// above the chart wins until the filter row's currency changes.
export function InsightView({ page, insight, colors: pins, drill = true, narrowed = false, currency: preferred = '' }: { page: OnDemandPage; insight: Insight; colors?: Record<string, number>; drill?: boolean; narrowed?: boolean; currency?: string }) {
  const [pick, setPick] = useState({ base: preferred, code: '' })
  const currency = (pick.base === preferred ? pick.code : '') || preferred
  const setCurrency = (code: string) => setPick({ base: preferred, code })
  const [drilled, setDrilled] = useState<{ category: number; series: number | null } | null>(null)
  const problems = insightProblems(page, insight)
  if (problems.length) return <Notice tone="warning"><strong>This {insight.type === 'table' ? 'table' : 'chart'} cannot be shown:</strong> {problems.join(' ')} {' '}Edit it to choose the columns again, or remove it.</Notice>
  const data = chartData(page, insight, currency)
  const notes = [
    data.rows.noNumber ? `${data.rows.noNumber} row${data.rows.noNumber === 1 ? '' : 's'} without a number left out.` : '',
    data.rows.noDate ? `${data.rows.noDate} row${data.rows.noDate === 1 ? '' : 's'} without a valid date left out.` : '',
    data.rows.otherCurrency ? `${data.rows.otherCurrency} row${data.rows.otherCurrency === 1 ? '' : 's'} in other currencies left out.` : '',
    currencyText(data),
  ].filter(Boolean).join(' ')
  const status = <>
    {data.currencies.length > 1 && <label className="od-currency-pick">Currency<select aria-label={`Currency of ${insight.title || 'the chart'}`} value={data.currency} onChange={(event) => setCurrency(event.target.value)}>{data.currencies.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} ({entry.rows} row{entry.rows === 1 ? '' : 's'})</option>)}</select></label>}
    <p className="muted od-insight-count" role="status">{data.rows.used} of {data.rows.all} row{data.rows.all === 1 ? '' : 's'} counted{data.rows.matched < data.rows.all ? ` (${data.rows.matched} match the filters)` : ''}.{notes ? ` ${notes}` : ''}</p>
  </>
  // CHT-02: a KPI — one number in the shared tile.
  if (insight.type === 'kpi') return <>{status}<div className="metric-grid compact od-kpi"><Metric label={insight.title || 'Untitled'} value={data.total == null ? '—' : `${formatValue(data.total)}${data.currency ? ` ${data.currency}` : ''}`} hint={measureText(page, insight, data.currency)} /></div></>
  if (!data.categories.length) return <>{status}<div className="empty-state"><strong>No rows to show.</strong><p>{page.rows.length ? 'No row matches the filters, or none has the values this needs.' : narrowed ? 'No row matches the filter row above: change it, or Reset filters.' : 'Add rows on the Data tab.'}</p></div></>
  const onDrill: Drill | undefined = drill ? (category, series) => setDrilled({ category, series }) : undefined
  const props: ChartProps = { page, insight, data, pins, onDrill }
  return <>
    {status}
    {insight.type === 'table' ? <PivotTable page={page} insight={insight} data={data} />
      : insight.type === 'pareto' || insight.type === 'bar' && insight.options?.orientation === 'vertical' ? <ColumnChart {...props} />
      : insight.type === 'bar' ? <BarChart {...props} />
      : insight.type === 'line' ? <LineChart {...props} />
      : <PieChart {...props} />}
    {drilled && <DrillDialog page={page} insight={insight} data={data} category={drilled.category} series={drilled.series} onClose={() => setDrilled(null)} />}
  </>
}

const name = (page: OnDemandPage, id: string) => page.columns.find((column) => column.id === id)?.name ?? ''

// The summary table and the Table view of every chart: categories down, the second field across, the measure in each
// cell, a Total column and row (each row once). A Pareto (CHT-12) lists the value, its share and the cumulative share.
export function PivotTable({ page, insight, data, share = false }: { page: OnDemandPage; insight: Insight; data: InsightData & Partial<ChartData>; share?: boolean }) {
  const split = Boolean(insight.second)
  const unit = data.unit ?? ''
  const measure = unit || insight.options?.cumulative ? valueText(page, insight, data.currency) : measureText(page, insight, data.currency)
  const show = (value: number | null | undefined) => formatShown(value, unit)
  const sum = data.values.reduce((all, row) => all + (row[0] ?? 0), 0)
  const pareto = insight.type === 'pareto' && data.shares && data.cumulative
  const grain = insight.type === 'line' || page.columns.find((column) => column.id === insight.category)?.type === 'date' ? grainOf(insight) : 'month'
  return <div className="azure-table od-pivot"><table className="matrix viz-table">
    <thead><tr><th>{name(page, insight.category)}{insight.type === 'line' ? ` (${dateGroupLabels[grain].unit})` : ''}</th>{split ? data.series.map((ser) => <th key={ser.key} className="num">{ser.label}</th>) : null}<th className="num">{split ? 'Total' : measure}</th>{share && <th className="num">Share (%)</th>}{pareto && <><th className="num">Share (%)</th><th className="num">Cumulative (%)</th></>}</tr></thead>
    <tbody>{data.categories.map((cat, row) => <tr key={cat.key}><td>{cat.label}</td>{split ? data.values[row].map((value, col) => <td key={data.series[col].key} className="num">{show(value)}</td>) : null}<td className="num">{show(data.categoryTotals[row])}</td>{share && <td className="num">{sum ? (((data.values[row][0] ?? 0) / sum) * 100).toFixed(1) : '—'}</td>}{pareto && <><td className="num">{data.shares![row].toFixed(1)}</td><td className="num">{data.cumulative![row].toFixed(1)}</td></>}</tr>)}
      <tr className="matrix-total"><td>Total</td>{split ? data.seriesTotals.map((value, col) => <td key={data.series[col].key} className="num">{show(value)}</td>) : null}<td className="num">{show(data.total)}</td>{share && <td className="num">100</td>}{pareto && <><td className="num">100</td><td className="num" /></>}</tr></tbody>
  </table>{data.rows.multi && insight.measure !== 'average' && <p className="muted od-pivot-note">A row with several values of a Multi-select counts in each of them; the totals take each row once.</p>}</div>
}

function Legend({ series, palette }: { series: Bucket[]; palette: string[] }) {
  return <>{series.map((ser, index) => <LegendBar key={ser.key} color={palette[index]} label={ser.label} />)}</>
}
// CHT-08: the target line's legend entry.
function TargetLegend({ insight, unit }: { insight: Insight; unit: '' | '%' }) {
  const target = insight.options?.target
  return target ? <li><i className="viz-key-target" aria-hidden="true" />{target.label || 'Target'} ({formatShown(target.value, unit)})</li> : null
}

// Horizontal bars (long category names stay readable, also on a phone), stacked by the second field.
function BarChart({ page, insight, data, pins, onDrill }: ChartProps) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const labels = useDataLabels(`ondemand-${insight.id}`)
  const id = useId()
  const stacked = Boolean(insight.second)
  const palette = stacked ? colors(data.series, pins) : ['var(--viz-series-1)']
  const show = (value: number | null | undefined) => formatShown(value, data.unit)
  const ticked = tickOf(data.unit)
  const target = insight.options?.target
  const stacks = data.values.map((row) => { let pos = 0, neg = 0; return row.map((value) => { const v = value ?? 0; const start = v >= 0 ? pos : neg; if (v >= 0) pos += v; else neg += v; return { start, end: start + v, value: v } }) })
  const ends = stacks.map((row) => row.reduce((all, part) => all + part.value, 0))
  const min = Math.min(0, target ? target.value : 0, ...stacks.flat().map((part) => Math.min(part.start, part.end))), max = Math.max(0, target ? target.value : 0, ...stacks.flat().map((part) => Math.max(part.start, part.end)))
  const rowHeight = 30, barHeight = 18
  const narrow = width < 520
  const pad = { top: target ? 20 : 6, right: 64, bottom: 44, left: Math.min(narrow ? 110 : 180, Math.round(width * 0.34)) }
  const plotWidth = Math.max(10, width - pad.left - pad.right)
  const ticks = scale(min, max, Math.max(2, Math.min(5, Math.floor(plotWidth / 80))))
  const low = ticks[0], high = ticks[ticks.length - 1]
  const x = (value: number) => pad.left + (value - low) / (high - low || 1) * plotWidth
  const height = pad.top + data.categories.length * rowHeight + pad.bottom
  const rowY = (index: number) => pad.top + index * rowHeight + (rowHeight - barHeight) / 2
  const chars = Math.max(6, Math.floor((pad.left - 14) / 6.6))
  const keyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setHover((value) => Math.min(data.categories.length - 1, Math.max(0, (value ?? -1) + (event.key === 'ArrowUp' ? -1 : 1)))) }
    else if (event.key === 'Enter' && hover != null && onDrill) { event.preventDefault(); onDrill(hover, null) }
    else if (event.key === 'Escape') setHover(null)
  }
  const legend = <>{stacked ? <Legend series={data.series} palette={palette} /> : <LegendBar color={palette[0]} label={valueText(page, insight, data.currency)} />}<TargetLegend insight={insight} unit={data.unit} /></>
  return <ChartFrame legend={legend} table={table} setTable={setTable} labels={labels}><div ref={wrap}>
    {table ? <PivotTable page={page} insight={insight} data={data} /> : <div className="viz-plot">
      <svg className={`viz-fixed${onDrill ? ' viz-drill' : ''}`} width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={onDrill ? `${id}-desc` : undefined} tabIndex={0} onKeyDown={keyDown} onPointerLeave={() => setHover(null)}>
        <title id={`${id}-title`}>{`${insight.title}: ${data.categories.map((cat, index) => `${cat.label} ${show(ends[index])}`).join(', ')}`}</title>
        {onDrill && <desc id={`${id}-desc`}>{drillHint}</desc>}
        {ticks.map((value) => <g key={value}><line className="viz-grid" x1={x(value)} x2={x(value)} y1={pad.top} y2={height - pad.bottom} /><text className="viz-tick" x={x(value)} y={height - pad.bottom + 16} textAnchor="middle">{ticked(value)}</text></g>)}
        {data.categories.map((cat, index) => <g key={cat.key} onPointerEnter={() => setHover(index)} onClick={onDrill ? () => onDrill(index, null) : undefined}>
          <rect className={index === hover ? 'viz-row-active' : 'viz-row-hit'} x={0} y={pad.top + index * rowHeight} width={width} height={rowHeight} rx={4} />
          <text className="viz-row-label" x={pad.left - 8} y={rowY(index) + barHeight / 2} textAnchor="end" dominantBaseline="middle"><title>{cat.label}</title>{wrapLabel(cat.label, chars)[0]}{wrapLabel(cat.label, chars).length > 1 ? '…' : ''}</text>
          {stacks[index].map((part, at) => {
            const left = x(Math.min(part.start, part.end)), w = Math.abs(x(part.end) - x(part.start))
            const last = at === stacks[index].length - 1 || stacks[index].slice(at + 1).every((next) => next.value === 0)
            return <g key={data.series[at].key} onClick={onDrill && stacked ? (event) => { event.stopPropagation(); onDrill(index, at) } : undefined}>
              <path className="viz-bar viz-bar-active" d={last && part.value > 0 ? barPath(left, rowY(index), w, barHeight) : w > 0 ? `M${left},${rowY(index)}h${w}v${barHeight}h${-w}Z` : ''} fill={palette[at]} />
              {labels[0] && stacked && w > 34 && part.value !== 0 && <text className="viz-slice-label" x={left + w / 2} y={rowY(index) + barHeight / 2} textAnchor="middle" dominantBaseline="middle">{ticked(part.value)}</text>}
            </g>
          })}
          <text className="viz-end-label" x={x(Math.max(0, ends[index] > 0 ? stacks[index].reduce((all, part) => Math.max(all, part.end), 0) : 0)) + 6} y={rowY(index) + barHeight / 2} dominantBaseline="middle">{show(stacked ? ends[index] : data.values[index][0])}</text>
        </g>)}
        {low < 0 && <line className="viz-reference" x1={x(0)} x2={x(0)} y1={pad.top} y2={height - pad.bottom} />}
        {target && <g className="viz-target-group"><line className="viz-reference viz-target" x1={x(target.value)} x2={x(target.value)} y1={pad.top - 4} y2={height - pad.bottom} /><text className="viz-reference-label" x={x(target.value)} y={pad.top - 8} textAnchor={x(target.value) > width - 90 ? 'end' : 'middle'}>{target.label || 'Target'} {show(target.value)}</text></g>}
        <AxisTitles x={valueText(page, insight, data.currency)} y={name(page, insight.category)} left={pad.left} right={pad.left + plotWidth} bottom={height - 4} height={pad.top * 2 + data.categories.length * rowHeight} />
      </svg>
      {hover != null && <Tooltip left={x(Math.max(0, ends[hover]))} top={rowY(hover) + rowHeight} width={width}><strong>{data.categories[hover].label}</strong>
        {stacked ? data.series.map((ser, at) => <TooltipRow key={ser.key} color={palette[at]} value={show(data.values[hover][at])} label={ser.label} />) : <TooltipRow color={palette[0]} value={show(data.values[hover][0])} label={valueText(page, insight, data.currency)} />}
        {stacked && <small>Total (each row once): {show(data.categoryTotals[hover])}</small>}</Tooltip>}
    </div>}
  </div></ChartFrame>
}

// CHT-01, CHT-12 Vertical columns (stacked by the second field) — and the Pareto: columns largest first, the
// cumulative share as a line on a 0–100% axis on the right, a dashed 80% line.
function ColumnChart({ page, insight, data, pins, onDrill }: ChartProps) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const labels = useDataLabels(`ondemand-${insight.id}`)
  const id = useId()
  const pareto = insight.type === 'pareto' && data.cumulative ? data.cumulative : null
  const stacked = Boolean(insight.second)
  const palette = stacked ? colors(data.series, pins) : ['var(--viz-series-1)']
  const show = (value: number | null | undefined) => formatShown(value, data.unit)
  const ticked = tickOf(data.unit)
  const target = insight.options?.target
  const stacks = data.values.map((row) => { let pos = 0, neg = 0; return row.map((value) => { const v = value ?? 0; const start = v >= 0 ? pos : neg; if (v >= 0) pos += v; else neg += v; return { start, end: start + v, value: v } }) })
  const ends = stacks.map((row) => row.reduce((all, part) => all + part.value, 0))
  const min = Math.min(0, target ? target.value : 0, ...stacks.flat().map((part) => Math.min(part.start, part.end))), max = Math.max(0, target ? target.value : 0, ...stacks.flat().map((part) => Math.max(part.start, part.end)))
  const height = 320, pad = { top: 24, right: pareto ? 52 : 20, bottom: 72, left: 62 }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const ticks = scale(min, max, 4)
  const low = ticks[0], high = ticks[ticks.length - 1]
  const count = data.categories.length
  const band = plotWidth / Math.max(1, count)
  const barWidth = Math.max(4, Math.min(56, band * 0.66))
  const cx = (index: number) => pad.left + band * (index + 0.5)
  const y = (value: number) => pad.top + plotHeight - (value - low) / (high - low || 1) * plotHeight
  const yShare = (share: number) => pad.top + plotHeight - share / 100 * plotHeight
  const step = Math.max(1, Math.ceil(40 / band))
  const chars = Math.max(4, Math.min(14, Math.floor(band * step / 6.6)))
  const keyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover((value) => Math.min(count - 1, Math.max(0, (value ?? -1) + (event.key === 'ArrowLeft' ? -1 : 1)))) }
    else if (event.key === 'Enter' && hover != null && onDrill) { event.preventDefault(); onDrill(hover, null) }
    else if (event.key === 'Escape') setHover(null)
  }
  const legend = <>
    {stacked ? <Legend series={data.series} palette={palette} /> : <LegendBar color={palette[0]} label={valueText(page, insight, data.currency)} />}
    {pareto && <LegendLine color="var(--viz-series-2)" label="Cumulative share (%)" />}
    {pareto && <li><i className="viz-key-target" aria-hidden="true" />80%</li>}
    <TargetLegend insight={insight} unit={data.unit} />
  </>
  const linePath = pareto ? pareto.map((share, index) => `${index ? 'L' : 'M'}${cx(index).toFixed(1)},${yShare(share).toFixed(1)}`).join('') : ''
  return <ChartFrame legend={legend} table={table} setTable={setTable} labels={labels}><div ref={wrap}>
    {table ? <PivotTable page={page} insight={insight} data={data} /> : <div className="viz-plot">
      <svg className={`viz-fixed${onDrill ? ' viz-drill' : ''}`} width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={onDrill ? `${id}-desc` : undefined} tabIndex={0} onKeyDown={keyDown} onPointerLeave={() => setHover(null)}>
        <title id={`${id}-title`}>{`${insight.title}: ${data.categories.map((cat, index) => `${cat.label} ${show(ends[index])}${pareto ? ` (cumulative ${pareto[index].toFixed(0)}%)` : ''}`).join(', ')}`}</title>
        {onDrill && <desc id={`${id}-desc`}>{drillHint}</desc>}
        {ticks.map((value) => <g key={value}><line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(value)} y2={y(value)} /><text className="viz-tick" x={pad.left - 8} y={y(value)} textAnchor="end" dominantBaseline="middle">{ticked(value)}</text></g>)}
        {pareto && [0, 20, 40, 60, 80, 100].map((share) => <text key={share} className="viz-tick" x={pad.left + plotWidth + 6} y={yShare(share)} dominantBaseline="middle">{share}%</text>)}
        {data.categories.map((cat, index) => <g key={cat.key} onPointerEnter={() => setHover(index)} onClick={onDrill ? () => onDrill(index, null) : undefined}>
          <rect className={index === hover ? 'viz-row-active' : 'viz-row-hit'} x={pad.left + band * index} y={pad.top} width={band} height={plotHeight} rx={4} />
          {stacks[index].map((part, at) => {
            const top = y(Math.max(part.start, part.end)), h = Math.abs(y(part.end) - y(part.start))
            const last = at === stacks[index].length - 1 || stacks[index].slice(at + 1).every((next) => next.value === 0)
            const left = cx(index) - barWidth / 2
            return <g key={data.series[at].key} onClick={onDrill && stacked ? (event) => { event.stopPropagation(); onDrill(index, at) } : undefined}>
              <path className="viz-bar viz-bar-active" d={last && part.value > 0 ? columnPath(left, top, barWidth, h) : h > 0 ? `M${left},${top}h${barWidth}v${h}h${-barWidth}Z` : ''} fill={palette[at]} />
              {labels[0] && stacked && h > 16 && barWidth > 30 && part.value !== 0 && <text className="viz-slice-label" x={cx(index)} y={top + h / 2} textAnchor="middle" dominantBaseline="middle">{ticked(part.value)}</text>}
            </g>
          })}
          {labels[0] && band >= 26 && <text className="viz-data-label" x={cx(index)} y={y(Math.max(0, ...stacks[index].map((part) => part.end))) - 6} textAnchor="middle">{ticked(stacked ? ends[index] : data.values[index][0] ?? 0)}</text>}
          {index % step === 0 && <text className="viz-tick" x={cx(index)} y={height - pad.bottom + 16} textAnchor="middle"><title>{cat.label}</title>{wrapLabel(cat.label, chars)[0]}{wrapLabel(cat.label, chars).length > 1 ? '…' : ''}</text>}
        </g>)}
        {low < 0 && <line className="viz-reference" x1={pad.left} x2={pad.left + plotWidth} y1={y(0)} y2={y(0)} />}
        {pareto && <g className="viz-pareto">
          <line className="viz-reference viz-target" x1={pad.left} x2={pad.left + plotWidth} y1={yShare(80)} y2={yShare(80)} />
          <path d={linePath} fill="none" stroke="var(--viz-series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pareto.map((share, index) => <circle key={index} className="viz-marker" cx={cx(index)} cy={yShare(share)} r={index === hover ? 5 : 3.5} fill="var(--viz-series-2)" />)}
        </g>}
        {target && <g className="viz-target-group"><line className="viz-reference viz-target" x1={pad.left} x2={pad.left + plotWidth} y1={y(target.value)} y2={y(target.value)} /><text className="viz-reference-label" x={pad.left + plotWidth - 4} y={y(target.value) - 5} textAnchor="end">{target.label || 'Target'} {show(target.value)}</text></g>}
        <AxisTitles x={name(page, insight.category)} y={valueText(page, insight, data.currency)} left={pad.left} right={pad.left + plotWidth} bottom={height - 4} height={pad.top * 2 + plotHeight} />
      </svg>
      {hover != null && <Tooltip left={cx(hover)} width={width}><strong>{data.categories[hover].label}</strong>
        {stacked ? data.series.map((ser, at) => <TooltipRow key={ser.key} color={palette[at]} value={show(data.values[hover][at])} label={ser.label} />) : <TooltipRow color={palette[0]} value={show(data.values[hover][0])} label={valueText(page, insight, data.currency)} />}
        {stacked && <small>Total (each row once): {show(data.categoryTotals[hover])}</small>}
        {pareto && data.shares && <small>Share {data.shares[hover].toFixed(1)}% · cumulative {pareto[hover].toFixed(1)}%</small>}</Tooltip>}
    </div>}
  </div></ChartFrame>
}

// One line per series over every period (month, or the chosen grouping, CHT-03) from the first to the last.
function LineChart({ page, insight, data, pins, onDrill }: ChartProps) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const labels = useDataLabels(`ondemand-${insight.id}`)
  const id = useId()
  const split = Boolean(insight.second)
  const palette = split ? colors(data.series, pins) : ['var(--viz-series-1)']
  const show = (value: number | null | undefined) => formatShown(value, data.unit)
  const ticked = tickOf(data.unit)
  const target = insight.options?.target
  const all = data.values.flat().filter((value): value is number => value != null)
  const min = Math.min(0, target ? target.value : 0, ...all), max = Math.max(0, target ? target.value : 0, ...all)
  const height = 300, pad = { top: 24, right: 20, bottom: 54, left: 62 }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const ticks = scale(min, max, 4)
  const low = ticks[0], high = ticks[ticks.length - 1]
  const count = data.categories.length
  const band = plotWidth / Math.max(1, count)
  const x = (index: number) => pad.left + band * (index + 0.5)
  const y = (value: number) => pad.top + plotHeight - (value - low) / (high - low || 1) * plotHeight
  const step = Math.max(1, Math.ceil(46 / band))
  const path = (col: number) => { let d = '', open = false; data.values.forEach((row, index) => { const value = row[col]; if (value == null) { open = false; return } d += `${open ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`; open = true }); return d }
  const legend = <>{split ? data.series.map((ser, index) => <LegendLine key={ser.key} color={palette[index]} label={ser.label} />) : <LegendLine color={palette[0]} label={valueText(page, insight, data.currency)} />}<TargetLegend insight={insight} unit={data.unit} /></>
  const pick = (clientX: number, rect: DOMRect) => Math.min(count - 1, Math.max(0, Math.floor((clientX - rect.left - pad.left) / band)))
  const unit = dateGroupLabels[grainOf(insight)].label.replace(/ \(.*$/, '')
  return <ChartFrame legend={legend} table={table} setTable={setTable} labels={labels}><div ref={wrap}>
    {table ? <PivotTable page={page} insight={insight} data={data} /> : <div className="viz-plot">
      <svg className={`viz-fixed${onDrill ? ' viz-drill' : ''}`} width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={onDrill ? `${id}-desc` : undefined} tabIndex={0}
        onPointerMove={(event) => setHover(pick(event.clientX, event.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setHover(null)}
        onClick={onDrill ? (event) => onDrill(pick(event.clientX, event.currentTarget.getBoundingClientRect()), null) : undefined}
        onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover((value) => Math.min(count - 1, Math.max(0, (value ?? -1) + (event.key === 'ArrowLeft' ? -1 : 1)))) } else if (event.key === 'Enter' && hover != null && onDrill) { event.preventDefault(); onDrill(hover, null) } else if (event.key === 'Escape') setHover(null) }}>
        <title id={`${id}-title`}>{`${insight.title}: ${data.categories.map((cat, index) => `${cat.label} ${show(data.categoryTotals[index])}`).join(', ')}`}</title>
        {onDrill && <desc id={`${id}-desc`}>{drillHint}</desc>}
        {ticks.map((value) => <g key={value}><line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(value)} y2={y(value)} /><text className="viz-tick" x={pad.left - 8} y={y(value)} textAnchor="end" dominantBaseline="middle">{ticked(value)}</text></g>)}
        {hover != null && <rect className="viz-selected-band" x={x(hover) - band / 2} y={pad.top} width={band} height={plotHeight} rx={4} />}
        {data.series.map((ser, col) => <g key={ser.key}>
          <path d={path(col)} fill="none" stroke={palette[col]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.values.map((row, index) => row[col] != null && <circle key={index} className="viz-marker" cx={x(index)} cy={y(row[col]!)} r={index === hover ? 5 : count > 24 ? 2.5 : 4} fill={palette[col]} />)}
          {labels[0] && count <= 24 && data.values.map((row, index) => row[col] != null && <text key={index} className="viz-data-label" x={x(index)} y={y(row[col]!) - 9} textAnchor="middle">{ticked(row[col]!)}</text>)}
        </g>)}
        {target && <g className="viz-target-group"><line className="viz-reference viz-target" x1={pad.left} x2={pad.left + plotWidth} y1={y(target.value)} y2={y(target.value)} /><text className="viz-reference-label" x={pad.left + plotWidth - 4} y={y(target.value) - 5} textAnchor="end">{target.label || 'Target'} {show(target.value)}</text></g>}
        {data.categories.map((cat, index) => index % step === 0 && <text key={cat.key} className="viz-tick" x={x(index)} y={height - pad.bottom + 16} textAnchor="middle">{cat.label.replace(/ (\d{2})(\d{2})$/, ' ’$2')}</text>)}
        <AxisTitles x={`${unit} of ${name(page, insight.category)}`} y={valueText(page, insight, data.currency)} left={pad.left} right={pad.left + plotWidth} bottom={height - 4} height={pad.top * 2 + plotHeight} />
      </svg>
      {hover != null && <Tooltip left={x(hover)} width={width}><strong>{data.categories[hover].label}</strong>
        {data.series.map((ser, col) => <TooltipRow key={ser.key} color={palette[col]} value={show(data.values[hover][col])} label={split ? ser.label : valueText(page, insight, data.currency)} />)}</Tooltip>}
    </div>}
  </div></ChartFrame>
}

// A donut: each category's share of the sum of the slices; the centre shows that sum, or the slice pointed at.
function PieChart({ page, insight, data, pins, onDrill }: ChartProps) {
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const labels = useDataLabels(`ondemand-${insight.id}`)
  const id = useId()
  const palette = colors(data.categories, pins)
  const slices = data.categories.map((cat, index) => ({ ...cat, index, value: Math.max(0, data.values[index][0] ?? 0), color: palette[index] })).filter((slice) => slice.value > 0)
  const total = slices.reduce((all, slice) => all + slice.value, 0)
  const size = 196, center = size / 2, outer = 92, inner = 60
  const arcs = slices.map((slice, index) => { const before = slices.slice(0, index).reduce((all, entry) => all + entry.value, 0); const start = -Math.PI / 2 + before / total * Math.PI * 2; return { ...slice, start, end: start + slice.value / total * Math.PI * 2, share: slice.value / total * 100 } })
  const active = hover == null ? undefined : arcs[hover]
  const negative = data.values.some((row) => (row[0] ?? 0) < 0)
  return <ChartFrame legend={null} table={table} setTable={setTable} labels={labels}>
    {table || !total ? <PivotTable page={page} insight={insight} data={data} share /> : <div className="viz-donut">
      <svg className={onDrill ? 'viz-drill' : undefined} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={onDrill ? `${id}-desc` : undefined} tabIndex={0} onPointerLeave={() => setHover(null)} onKeyDown={(event) => { if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); const by = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1; setHover((value) => ((value ?? (by > 0 ? -1 : 0)) + by + arcs.length) % arcs.length) } else if (event.key === 'Enter' && active && onDrill) { event.preventDefault(); onDrill(active.index, null) } else if (event.key === 'Escape') setHover(null) }}>
        <title id={`${id}-title`}>{`${insight.title}: ${arcs.map((arc) => `${arc.label} ${formatValue(arc.value)} (${arc.share.toFixed(0)}%)`).join(', ')}`}</title>
        {onDrill && <desc id={`${id}-desc`}>{drillHint}</desc>}
        {arcs.map((arc, index) => <path key={arc.key} className={hover == null || hover === index ? 'viz-slice' : 'viz-slice viz-slice-dim'} d={arcPath(center, center, inner, hover === index ? outer + 3 : outer, arc.start, arc.end)} fill={arc.color} fillRule="evenodd" onPointerEnter={() => setHover(index)} onClick={onDrill ? () => onDrill(arc.index, null) : undefined} />)}
        {labels[0] && arcs.map((arc) => { const angle = (arc.start + arc.end) / 2, radius = (inner + outer) / 2; return arc.share >= 6 && <text key={arc.key} className="viz-slice-label" x={center + radius * Math.cos(angle)} y={center + radius * Math.sin(angle)} textAnchor="middle" dominantBaseline="middle">{arc.share.toFixed(0)}%</text> })}
        <text className="viz-donut-value" x={center} y={center - 2} textAnchor="middle">{formatValue(active ? active.value : total)}</text>
        <text className="viz-donut-label" x={center} y={center + 16} textAnchor="middle">{active ? `${active.label.slice(0, 18)} · ${active.share.toFixed(0)}%` : 'Total'}</text>
      </svg>
      <ul className="viz-donut-legend" aria-label={`${insight.title} legend`}>{arcs.map((arc, index) => <li key={arc.key} className={hover === index ? 'active' : ''} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}><i style={{ background: arc.color }} aria-hidden="true" /><span>{arc.label}</span><b>{formatValue(arc.value)}</b><small>{arc.share.toFixed(0)}%</small></li>)}</ul>
      {negative && <p className="muted">Categories below zero are left out of the pie; the Table view lists them.</p>}
    </div>}
  </ChartFrame>
}

// CHT-10: the rows behind a bar, slice or point — read only, in the shared table (ID and every column, Export); the
// pop-up names the category (and series) and the chart.
function DrillDialog({ page, insight, data, category, series, onClose }: { page: OnDemandPage; insight: Insight; data: ChartData; category: number; series: number | null; onClose: () => void }) {
  const rows = drillRows(page, insight, data, category, series)
  const cat = data.categories[category]
  const ser = series != null && insight.second ? data.series[series] : undefined
  const columns: DataColumn<OnDemandRow>[] = [
    { id: 'drill-id', label: 'ID', value: (row) => rowId(page, row) || row.key || '' },
    ...page.columns.map((column): DataColumn<OnDemandRow> => ({ id: `drill-${column.id}`, label: column.name, align: column.type === 'number' || column.type === 'currency' ? 'right' : undefined, value: (row) => displayText(column, row.cells[column.id]) })),
  ]
  const where = `${cat?.label ?? ''}${ser ? ` · ${ser.label}` : ''}`
  return <Modal eyebrow={`${insight.type === 'table' ? 'TABLE' : 'CHART'} · ${(insight.title || 'Untitled').toUpperCase()}`} title={`Rows behind ${where}`} wide form={false} onClose={onClose}>
    <p className="muted">{rows.length} row{rows.length === 1 ? '' : 's'} counted in {where} ({measureText(page, insight, data.currency)}{data.currency ? '; rows in the shown currency' : ''}){insight.options?.cumulative ? ' — this category’s own rows; the chart shows the running total' : ''}. Read only: edit rows on the table page.</p>
    <DataTable id={`drill:${page.id}`} columns={columns} rows={rows} rowKey={(row) => row.id} exportName={`${insight.title || 'Rows'} – ${where}`} status={`${rows.length} row${rows.length === 1 ? '' : 's'}`} />
    <div className="modal-actions"><button type="button" className="primary" onClick={onClose}>Close</button></div>
  </Modal>
}
