import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { arcPath, barPath, columnPath, epicSlots, niceTicks, otherColor, useElementWidth } from '../chartUtils'
import { useDataLabels } from '../useDataLabels'
import { useHeightFactor } from '../useChartSize'
import { additive, displayText, rowId, type ColorPins as Pins, type Insight, type OnDemandPage, type OnDemandRow } from '../onDemand'
import { chartData, countLines, currencyText, dateGroupLabels, drillRows, formatShown, formatValue, grainOf, insightProblems, isGrouped, measureText, noneKey, otherKey, valueText, type Bucket, type ChartData, type InsightData } from '../onDemandInsights'
import { darkText, labelOn, pinColor } from '../chartColors'
import { AxisTitles, WrappedLabel } from './chartLabels'
import { barLabelAt, chartKind, dataTableModel, fitText, groupedRowHeight, groupedSlots, inside, keepApart, labelNumber, labelPercent, labelText, lineLabelAt, minorTicks, pieLabels, resolveElements, shortName, textWidth, trendLines, trendName, type LabelContent, type ResolvedElements } from '../chartElements'
import { ChartDataTable, ChartLabel, LegendAround, LegendTrend } from './ChartElements'
import { DataTable, type DataColumn } from './DataTable'
import { Info, Metric, Modal, Notice } from './ui'
import { ChartFrame, LegendBar, LegendLine, Tooltip, TooltipRow } from './WorkloadCharts'
import { NarrativeView } from './NarrativeView'

// OND-12 The charts and the summary table of an On-Demand insight, drawn from aggregate() (src/onDemandInsights.ts) in
// the app's chart frame (UI-STANDARDS §9: legend, Data labels, Table / Chart, axis names) with the --viz-series-*
// colours; "(none)" and "Other" in the neutral colour. Every chart starts its value axis at zero (to scale).
// CHT-01…CHT-12: the chart options — vertical columns, a Pareto, a KPI, Top N, running total, % of total, a target
// line, colours pinned per value, a click (or Enter) that lists the rows behind a bar, slice or point — all drawn
// here, for the Insights tab and the On-Demand Dashboard alike; without options every chart is drawn as before.

type ColorPins = Pins | undefined
const pinOf = (bucket: Bucket, pins: ColorPins) => bucket.key === otherKey || bucket.key === noneKey ? undefined : pins?.[bucket.key]
// Colours by position among the coloured buckets, so "(none)" between them does not shift the others; a value pinned
// to a palette colour (CHT-09) or to any colour "#rrggbb" (CHT-41) takes that colour, the others keep the colour of their place.
const colors = (buckets: Bucket[], pins?: ColorPins) => {
  // Without pins: by position, as before. With pins: the values not pinned take the palette colours no shown value is
  // pinned to, in order, so two values never share a colour while there are colours left (a "#rrggbb" pin takes none).
  const pinned = new Set(buckets.map((bucket) => pinOf(bucket, pins)).filter((slot): slot is number => typeof slot === 'number').map((slot) => epicSlots[(slot - 1) % epicSlots.length]))
  const free = epicSlots.filter((color) => !pinned.has(color))
  let at = 0
  return buckets.map((bucket) => { if (bucket.key === otherKey || bucket.key === noneKey) return otherColor; const pin = pinOf(bucket, pins); if (pin) return pinColor(pin); const list = free.length ? free : epicSlots; const color = list[at % list.length]; at++; return color })
}
// CHT-41: a label drawn on a bar or slice of a "#rrggbb" colour takes the readable text colour (no halo on dark text);
// on a palette colour the chart's label style applies as before.
const onFill = (color: string | undefined) => { const fill = color ? labelOn(color) : ''; return fill ? { fill, stroke: fill === darkText ? 'none' : undefined } : undefined }
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
// el: the chart elements (CHT-26…CHT-35) resolved; raw: with Percent of total, the measured amounts (a label's Value).
interface ChartProps { page: OnDemandPage; insight: Insight; data: ChartData; pins: ColorPins; onDrill?: Drill; el: ResolvedElements; raw?: ChartData }
const drillHint = 'Click a bar, slice or point — or press Enter on the highlighted one — to list the rows behind it.'

// OND-24: a Sum / Average of a Currency column shows one currency at a time — a choice above the chart when the rows
// hold several (not saved: the one with most rows comes first for everyone). Stacking or adding the currencies up would
// draw amounts of different currencies as one total; one currency at a time keeps every bar, slice and total in one unit.
// colors: the page's (or dashboard's) colour pins (CHT-09); drill: false in an editor's preview (CHT-10).
// narrowed (OND-54): the page's rows are those the Insights tab's filter row keeps, so an empty chart says so.
// currency (OND-60): the currency the filter row chose for this chart's column, shown first; the viewer's own pick
// above the chart wins until the filter row's currency changes.
// quiet (CHT-25, the chart panels): the "rows counted" line goes to the panel's ⓘ (ChartCountInfo); only a warning that
// matters for the numbers — several currencies, one shown — stays visible.
// compare (CHT-62): a Narrative's rows for the previous period — the filter row's without its period.
export function InsightView({ page, insight, colors: pins, drill = true, narrowed = false, currency: preferred = '', quiet = false, compare }: { page: OnDemandPage; insight: Insight; colors?: Pins; drill?: boolean; narrowed?: boolean; currency?: string; quiet?: boolean; compare?: OnDemandPage }) {
  const [pick, setPick] = useState({ base: preferred, code: '' })
  const currency = (pick.base === preferred ? pick.code : '') || preferred
  const setCurrency = (code: string) => setPick({ base: preferred, code })
  const [drilled, setDrilled] = useState<{ category: number; series: number | null } | null>(null)
  const problems = insightProblems(page, insight)
  if (problems.length) return <Notice tone="warning"><strong>This {insight.type === 'table' ? 'table' : insight.type === 'narrative' ? 'narrative' : 'chart'} cannot be shown:</strong> {problems.join(' ')} {' '}Edit it to choose the columns again, or remove it.</Notice>
  // CHT-60: a Narrative is text, drawn by its own component.
  if (insight.type === 'narrative') return <NarrativeView page={page} insight={insight} compare={compare} currency={currency} onCurrency={setCurrency} />
  const data = chartData(page, insight, currency)
  const notes = [
    data.rows.noNumber ? `${data.rows.noNumber} row${data.rows.noNumber === 1 ? '' : 's'} without a number left out.` : '',
    data.rows.noDate ? `${data.rows.noDate} row${data.rows.noDate === 1 ? '' : 's'} without a valid date left out.` : '',
    data.rows.otherCurrency ? `${data.rows.otherCurrency} row${data.rows.otherCurrency === 1 ? '' : 's'} in other currencies left out.` : '',
    currencyText(data),
  ].filter(Boolean).join(' ')
  const status = <>
    {data.currencies.length > 1 && <label className="od-currency-pick">Currency<select aria-label={`Currency of ${insight.title || 'the chart'}`} value={data.currency} onChange={(event) => setCurrency(event.target.value)}>{data.currencies.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} ({entry.rows} row{entry.rows === 1 ? '' : 's'})</option>)}</select></label>}
    {quiet ? data.currencies.length > 1 && <p className="od-insight-warning" role="status">Several currencies: {data.currency} shown — amounts in different currencies are not added up.</p>
      : <p className="muted od-insight-count" role="status">{data.rows.used} of {data.rows.all} row{data.rows.all === 1 ? '' : 's'} counted{data.rows.matched < data.rows.all ? ` (${data.rows.matched} match the filters)` : ''}.{notes ? ` ${notes}` : ''}</p>}
  </>
  // CHT-02: a KPI — one number in the shared tile.
  if (insight.type === 'kpi') return <>{status}<div className="metric-grid compact od-kpi"><Metric label={insight.title || 'Untitled'} value={data.total == null ? '—' : `${formatValue(data.total)}${data.currency ? ` ${data.currency}` : ''}`} hint={measureText(page, insight, data.currency)} /></div></>
  if (!data.categories.length) return <>{status}<div className="empty-state"><strong>No rows to show.</strong><p>{page.rows.length ? 'No row matches the filters, or none has the values this needs.' : narrowed ? 'No row matches the filter row above: change it, or Reset filters.' : 'Add rows on the Data tab.'}</p></div></>
  const onDrill: Drill | undefined = drill ? (category, series) => setDrilled({ category, series }) : undefined
  // CHT-26…CHT-35: the owners' chart elements; each default draws the chart as before.
  const el = resolveElements(chartKind(insight.type, insight.options?.orientation) ?? 'bar', insight.options?.elements, { stacked: Boolean(insight.second) && !isGrouped(insight), percent: data.unit === '%' })
  const raw = data.unit === '%' && !el.plain && el.content.includes('value') ? chartData(page, { ...insight, options: { ...insight.options, percent: undefined } }, currency) : undefined
  const props: ChartProps = { page, insight, data, pins, onDrill, el, raw }
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

// CHT-26…CHT-35 What the chart elements share. A label's text from the owner's contents (Value, Percentage, Category
// name, Series name, joined with ", "); with Percent of total, Value is the measured amount and Percentage the share.
function labelMaker({ page, insight, data, raw, el }: ChartProps, short: (value: number) => string) {
  const split = Boolean(insight.second)
  const has = (entry: LabelContent) => el.content.includes(entry)
  return (category: number, col: number, drawn: number, share?: number) => labelText({
    value: has('value') ? labelNumber(raw ? raw.values[category]?.[col] ?? 0 : drawn, { decimals: el.decimals, code: el.code, currency: data.currency, short: raw ? tick : short }) : undefined,
    percent: has('percent') ? labelPercent(share ?? drawn, el.decimals, el.kind === 'pie' ? 0 : 1) : undefined,
    category: has('category') ? shortName(data.categories[category]?.label ?? '') : undefined,
    series: has('series') ? shortName(split ? data.series[col]?.label ?? '' : valueText(page, insight, data.currency)) : undefined,
  }, el.content)
}
// The numbers of the data table and the totals: as the chart shows them, or in the owner's number format (CHT-28).
function valueFormat(el: ResolvedElements, data: ChartData) {
  if (el.decimals == null && !el.code) return (value: number | null | undefined) => formatShown(value, data.unit)
  return (value: number | null | undefined) => value == null ? '—' : data.unit === '%' ? labelPercent(value, el.decimals, 1) : labelNumber(value, { decimals: el.decimals, code: el.code, currency: data.currency, short: formatValue })
}
const seriesNames = (page: OnDemandPage, insight: Insight, data: ChartData) => insight.second ? data.series.map((ser) => ser.label) : [valueText(page, insight, data.currency)]
function TrendLegend({ trends, names, palette }: { trends: { col: number }[]; names: string[]; palette: string[] }) {
  return <>{trends.map((line) => <LegendTrend key={line.col} color={palette[line.col]} label={trendName(names[line.col] ?? '')} />)}</>
}
function DataTableOf({ page, insight, data, el, palette }: ChartProps & { palette: string[] }) {
  const format = valueFormat(el, data)
  const pareto = insight.type === 'pareto' ? data.cumulative : undefined
  return <ChartDataTable title={insight.title || 'Untitled'} palette={palette} model={dataTableModel({ categories: data.categories.map((cat) => cat.label), series: seriesNames(page, insight, data), values: data.values, format, cumulative: pareto })} />
}

// Horizontal bars (long category names stay readable, also on a phone), stacked by the second field — or, grouped
// (CHT-40), one bar per series side by side in each row.
function BarChart(props: ChartProps) {
  const { page, insight, data, pins, onDrill, el } = props
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const labels = useDataLabels(`ondemand-${insight.id}`, el.labels)
  const id = useId()
  const split = Boolean(insight.second)
  const grouped = isGrouped(insight)
  const stacked = split && !grouped
  const palette = split ? colors(data.series, pins) : ['var(--viz-series-1)']
  const show = (value: number | null | undefined) => formatShown(value, data.unit)
  const ticked = tickOf(data.unit)
  const target = insight.options?.target
  const stacks = data.values.map((row) => { let pos = 0, neg = 0; return row.map((value) => { const v = value ?? 0; const start = grouped ? 0 : v >= 0 ? pos : neg; if (!grouped) { if (v >= 0) pos += v; else neg += v } return { start, end: start + v, value: v, empty: value == null } }) })
  const ends = stacks.map((row) => row.reduce((all, part) => all + part.value, 0))
  // CHT-33: the trendlines' ends are on the value axis too.
  const trends = el.trendline ? trendLines(data.values, data.series.length) : []
  const reach = trends.flatMap((line) => [line.from, line.to])
  const min = Math.min(0, target ? target.value : 0, ...stacks.flat().map((part) => Math.min(part.start, part.end)), ...reach), max = Math.max(0, target ? target.value : 0, ...stacks.flat().map((part) => Math.max(part.start, part.end)), ...reach)
  // CHT-16: the panel's height (Small / Medium / Large) scales the rows; Medium is today's 30 px. Grouped bars (CHT-40)
  // take taller rows with more series, each bar side by side in the row.
  const factor = useHeightFactor()
  // KB-89, CHT-56: a chart of few bars fills about the height of a column chart of its size (its rows up to 2½ times
  // as tall, the bars up to 28 px thick) so that charts in one row of the grid line up; many bars keep 30 px rows.
  const plain = Math.round(30 * factor), stretched = Math.min(Math.round(75 * factor), Math.floor((320 * factor - 36) / Math.max(1, data.categories.length)))
  const rowHeight = grouped ? groupedRowHeight(data.series.length, factor) : Math.max(plain, stretched)
  const barHeight = grouped || rowHeight <= plain ? Math.round(18 * Math.min(factor, 1.3)) : Math.round(Math.min(rowHeight * 0.6, 28 * Math.min(factor, 1.3)))
  const slots = groupedSlots(rowHeight, data.series.length, barHeight)
  const narrow = width < 520
  // CHT-28: the owner's data labels (position, contents, number format); the plain labels are drawn as before.
  const custom = labels[0] && !el.plain
  const label = labelMaker(props, ticked)
  const texts = custom || grouped ? data.values.map((row, index) => row.map((value, col) => custom ? label(index, col, value ?? 0) : ticked(value ?? 0))) : []
  const outside = (custom || (grouped && labels[0])) && !stacked && el.position === 'outsideEnd'
  // CHT-27, CHT-28: an axis or its title left out gives its room to the plot; Outside End labels take what they need.
  const pad = { top: target ? 20 : 6, right: outside ? Math.min(Math.round(width * 0.4), Math.max(64, ...texts.flat().map((text) => textWidth(text) + 12))) : 64, bottom: el.axisX ? el.titleX ? 44 : 30 : el.titleX ? 26 : 10, left: el.axisY ? Math.min(narrow ? 110 : 180, Math.round(width * 0.34)) : el.titleY ? 28 : 10 }
  const plotWidth = Math.max(10, width - pad.left - pad.right)
  const ticks = scale(min, max, Math.max(2, Math.min(5, Math.floor(plotWidth / 80))))
  const low = ticks[0], high = ticks[ticks.length - 1]
  const x = (value: number) => pad.left + (value - low) / (high - low || 1) * plotWidth
  const height = pad.top + data.categories.length * rowHeight + pad.bottom
  const rowY = (index: number) => pad.top + index * rowHeight + (rowHeight - barHeight) / 2
  const rowMid = (index: number) => pad.top + index * rowHeight + rowHeight / 2
  const chars = Math.max(6, Math.floor((pad.left - 14) / 6.6))
  const keyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setHover((value) => Math.min(data.categories.length - 1, Math.max(0, (value ?? -1) + (event.key === 'ArrowUp' ? -1 : 1)))) }
    else if (event.key === 'Enter' && hover != null && onDrill) { event.preventDefault(); onDrill(hover, null) }
    else if (event.key === 'Escape') setHover(null)
  }
  // A label along a bar from `base` to `end` (px), at the owner's position; nothing when it does not fit.
  const along = (text: string, base: number, end: number, room: number, thickness = barHeight) => {
    const size = textWidth(text)
    const at = thickness >= 10 ? barLabelAt(el.position, base, end, size, room) : null
    return at == null ? null : { at, text }
  }
  const names = seriesNames(page, insight, data)
  const legend = <>{split ? <Legend series={data.series} palette={palette} /> : <LegendBar color={palette[0]} label={valueText(page, insight, data.currency)} />}<TargetLegend insight={insight} unit={data.unit} /><TrendLegend trends={trends} names={names} palette={palette} /></>
  const rows = data.categories.length
  const named = (index: number) => grouped ? `${data.categories[index].label} (${data.series.map((ser, col) => `${ser.label} ${show(data.values[index][col])}`).join(', ')})` : `${data.categories[index].label} ${show(ends[index])}`
  return <ChartFrame legend={legend} legendAt={el.legend} table={table} setTable={setTable} labels={labels}><LegendAround at={el.legend} legend={legend}><div ref={wrap}>
    {table ? <PivotTable page={page} insight={insight} data={data} /> : <div className="viz-plot">
      <svg className={`viz-fixed${onDrill ? ' viz-drill' : ''}`} width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={onDrill ? `${id}-desc` : undefined} tabIndex={0} onKeyDown={keyDown} onPointerLeave={() => setHover(null)}>
        <title id={`${id}-title`}>{`${insight.title}: ${data.categories.map((_, index) => named(index)).join(', ')}`}</title>
        {onDrill && <desc id={`${id}-desc`}>{drillHint}</desc>}
        {el.grid.minorV && minorTicks(ticks).map((value) => <line key={`minor-${value}`} className="viz-grid viz-grid-minor" x1={x(value)} x2={x(value)} y1={pad.top} y2={height - pad.bottom} />)}
        {el.grid.majorH && Array.from({ length: rows + 1 }, (_, index) => <line key={`major-h-${index}`} className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={pad.top + index * rowHeight} y2={pad.top + index * rowHeight} />)}
        {el.grid.minorH && Array.from({ length: rows }, (_, index) => <line key={`minor-h-${index}`} className="viz-grid viz-grid-minor" x1={pad.left} x2={pad.left + plotWidth} y1={pad.top + (index + 0.5) * rowHeight} y2={pad.top + (index + 0.5) * rowHeight} />)}
        {ticks.map((value) => <g key={value}>{el.grid.majorV && <line className="viz-grid" x1={x(value)} x2={x(value)} y1={pad.top} y2={height - pad.bottom} />}{el.axisX && <text className="viz-tick" x={x(value)} y={height - pad.bottom + 16} textAnchor="middle">{ticked(value)}</text>}</g>)}
        {data.categories.map((cat, index) => {
          const single = custom && !split ? along(texts[index][0], x(0), x(data.values[index][0] ?? 0), (data.values[index][0] ?? 0) >= 0 ? width - x(data.values[index][0] ?? 0) : x(data.values[index][0] ?? 0) - pad.left) : null
          return <g key={cat.key} onPointerEnter={() => setHover(index)} onClick={onDrill ? () => onDrill(index, null) : undefined}>
            <rect className={index === hover ? 'viz-row-active' : 'viz-row-hit'} x={0} y={pad.top + index * rowHeight} width={width} height={rowHeight} rx={4} />
            {el.axisY && <WrappedLabel className="viz-row-label" text={cat.label} x={pad.left - 8} y={grouped ? rowMid(index) : rowY(index) + barHeight / 2} anchor="end" middle chars={chars} lines={rowHeight >= 28 ? 2 : 1} lineHeight={12} />}
            {grouped ? stacks[index].map((part, at) => {
              // CHT-40: one bar per series from zero, side by side; its label at the owner's position (Outside End when plain).
              if (part.empty) return null
              const top = rowMid(index) + slots.offsets[at] - slots.size / 2
              const left = x(Math.min(0, part.value)), w = Math.abs(x(part.value) - x(0))
              const room = part.value >= 0 ? width - x(part.value) : x(part.value) - pad.left
              const placed = labels[0] ? custom ? along(texts[index][at], x(0), x(part.value), room, slots.size) : slots.size >= 9 && room >= textWidth(texts[index][at]) + 6 ? { at: x(part.value) + (part.value >= 0 ? 1 : -1) * (6 + textWidth(texts[index][at]) / 2), text: texts[index][at] } : null : null
              const inBar = placed && (custom ? el.position !== 'outsideEnd' : false)
              return <g key={data.series[at].key} onClick={onDrill ? (event) => { event.stopPropagation(); onDrill(index, at) } : undefined}>
                <path className="viz-bar viz-bar-active" d={part.value > 0 ? barPath(left, top, w, slots.size, Math.min(4, slots.size / 2)) : w > 0 ? `M${left},${top}h${w}v${slots.size}h${-w}Z` : ''} fill={palette[at]} />
                {placed && <text className={inBar ? 'viz-slice-label' : 'viz-end-label'} style={inBar ? onFill(palette[at]) : undefined} x={placed.at} y={top + slots.size / 2} textAnchor="middle" dominantBaseline="middle">{placed.text}</text>}
              </g>
            }) : stacks[index].map((part, at) => {
              const left = x(Math.min(part.start, part.end)), w = Math.abs(x(part.end) - x(part.start))
              const last = at === stacks[index].length - 1 || stacks[index].slice(at + 1).every((next) => next.value === 0)
              const segment = custom && stacked && part.value !== 0 ? along(texts[index][at], x(part.start), x(part.end), 0) : null
              return <g key={data.series[at].key} onClick={onDrill && stacked ? (event) => { event.stopPropagation(); onDrill(index, at) } : undefined}>
                <path className="viz-bar viz-bar-active" d={last && part.value > 0 ? barPath(left, rowY(index), w, barHeight) : w > 0 ? `M${left},${rowY(index)}h${w}v${barHeight}h${-w}Z` : ''} fill={palette[at]} />
                {labels[0] && el.plain && stacked && w > 34 && part.value !== 0 && <text className="viz-slice-label" style={onFill(palette[at])} x={left + w / 2} y={rowY(index) + barHeight / 2} textAnchor="middle" dominantBaseline="middle">{ticked(part.value)}</text>}
                {segment && <text className="viz-slice-label" style={onFill(palette[at])} x={segment.at} y={rowY(index) + barHeight / 2} textAnchor="middle" dominantBaseline="middle">{segment.text}</text>}
              </g>
            })}
            {/* The value at the bar's end, as before — replaced by the owner's data label on a single bar (CHT-28); grouped bars label each bar. */}
            {!grouped && !(custom && !stacked) && <text className="viz-end-label" x={x(Math.max(0, ends[index] > 0 ? stacks[index].reduce((all, part) => Math.max(all, part.end), 0) : 0)) + 6} y={rowY(index) + barHeight / 2} dominantBaseline="middle">{el.plain ? show(stacked ? ends[index] : data.values[index][0]) : valueFormat(el, data)(stacked ? ends[index] : data.values[index][0])}</text>}
            {single && <text className={el.position === 'outsideEnd' ? 'viz-end-label' : 'viz-slice-label'} x={single.at} y={rowY(index) + barHeight / 2} textAnchor="middle" dominantBaseline="middle">{single.text}</text>}
          </g>
        })}
        {low < 0 && <line className="viz-reference" x1={x(0)} x2={x(0)} y1={pad.top} y2={height - pad.bottom} />}
        {trends.map((line) => <line key={`trend-${line.col}`} className="viz-trendline" x1={x(line.from)} x2={x(line.to)} y1={(grouped ? rowMid(0) + slots.offsets[line.col] : rowY(0) + barHeight / 2)} y2={(grouped ? rowMid(rows - 1) + slots.offsets[line.col] : rowY(rows - 1) + barHeight / 2)} stroke={palette[line.col]}><title>{trendName(names[line.col] ?? '')}</title></line>)}
        {target && <g className="viz-target-group"><line className="viz-reference viz-target" x1={x(target.value)} x2={x(target.value)} y1={pad.top - 4} y2={height - pad.bottom} /><text className="viz-reference-label" x={x(target.value)} y={pad.top - 8} textAnchor={x(target.value) > width - 90 ? 'end' : 'middle'}>{target.label || 'Target'} {show(target.value)}</text></g>}
        <AxisTitles x={insight.options?.xTitle || valueText(page, insight, data.currency)} y={insight.options?.yTitle || name(page, insight.category)} left={pad.left} right={pad.left + plotWidth} bottom={height - 4} height={pad.top * 2 + data.categories.length * rowHeight} showX={el.titleX} showY={el.titleY} />
      </svg>
      {hover != null && <Tooltip left={x(Math.max(0, grouped ? Math.max(0, ...data.values[hover].map((value) => value ?? 0)) : ends[hover]))} top={rowY(hover) + rowHeight} width={width}><strong>{data.categories[hover].label}</strong>
        {split ? data.series.map((ser, at) => <TooltipRow key={ser.key} color={palette[at]} value={show(data.values[hover][at])} label={ser.label} />) : <TooltipRow color={palette[0]} value={show(data.values[hover][0])} label={valueText(page, insight, data.currency)} />}
        {split && (stacked || additive(insight.measure)) && <small>Total (each row once): {show(data.categoryTotals[hover])}</small>}</Tooltip>}
    </div>}
    {!table && el.dataTable && <DataTableOf {...props} palette={palette} />}
  </div></LegendAround></ChartFrame>
}

// CHT-01, CHT-12 Vertical columns (stacked by the second field) — and the Pareto: columns largest first, the
// cumulative share as a line on a 0–100% axis on the right, a dashed 80% line.
function ColumnChart(props: ChartProps) {
  const { page, insight, data, pins, onDrill, el } = props
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const labels = useDataLabels(`ondemand-${insight.id}`, el.labels)
  const id = useId()
  const pareto = insight.type === 'pareto' && data.cumulative ? data.cumulative : null
  const split = Boolean(insight.second)
  const grouped = isGrouped(insight)
  const stacked = split && !grouped
  const palette = split ? colors(data.series, pins) : ['var(--viz-series-1)']
  const show = (value: number | null | undefined) => formatShown(value, data.unit)
  const ticked = tickOf(data.unit)
  const target = insight.options?.target
  const stacks = data.values.map((row) => { let pos = 0, neg = 0; return row.map((value) => { const v = value ?? 0; const start = grouped ? 0 : v >= 0 ? pos : neg; if (!grouped) { if (v >= 0) pos += v; else neg += v } return { start, end: start + v, value: v, empty: value == null } }) })
  const ends = stacks.map((row) => row.reduce((all, part) => all + part.value, 0))
  const trends = el.trendline && !pareto ? trendLines(data.values, data.series.length) : []
  const reach = trends.flatMap((line) => [line.from, line.to])
  const min = Math.min(0, target ? target.value : 0, ...stacks.flat().map((part) => Math.min(part.start, part.end)), ...reach), max = Math.max(0, target ? target.value : 0, ...stacks.flat().map((part) => Math.max(part.start, part.end)), ...reach)
  const count = data.categories.length
  const custom = labels[0] && !el.plain
  const label = labelMaker(props, ticked)
  const texts = custom ? data.values.map((row, index) => row.map((value, col) => label(index, col, value ?? 0))) : []
  // Outside End labels take up to two lines of their column's width: the plot starts lower to keep them in the chart.
  const roughBand = Math.max(1, width - 82) / Math.max(1, count)
  const twoLines = custom && !split && el.position === 'outsideEnd' && texts.some((row) => (fitText(row[0], roughBand - 4, 1) == null))
  const height = Math.round(320 * useHeightFactor()), pad = { top: twoLines ? 36 : 24, right: pareto && el.axisY ? 52 : 20, bottom: el.axisX ? el.titleX ? 72 : 56 : el.titleX ? 26 : 10, left: el.axisY ? 62 : el.titleY ? 28 : 10 }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const ticks = scale(min, max, 4)
  const low = ticks[0], high = ticks[ticks.length - 1]
  const band = plotWidth / Math.max(1, count)
  const barWidth = Math.max(4, Math.min(56, band * 0.66))
  // CHT-40: grouped columns — one column per series side by side in the category's band.
  const slots = groupedSlots(band, data.series.length, 40)
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
  // A label along a column from `base` to `end` (px): one line inside the column (it may pass the column's edges but stays
  // within its own category), up to two lines outside it; else nothing.
  const along = (text: string, base: number, end: number, room: number, outsideEnd: boolean, own = band) => {
    const lines = outsideEnd ? fitText(text, own - 4, 2) : fitText(text, Math.max(Math.min(barWidth, own), own - 6) - 4, 1)
    if (!lines) return null
    const at = barLabelAt(el.position, base, end, lines.length * 12, room)
    return at == null ? null : { at, lines }
  }
  const names = seriesNames(page, insight, data)
  const legend = <>
    {split ? <Legend series={data.series} palette={palette} /> : <LegendBar color={palette[0]} label={valueText(page, insight, data.currency)} />}
    {pareto && <LegendLine color="var(--viz-series-2)" label="Cumulative share (%)" />}
    {pareto && <li><i className="viz-key-target" aria-hidden="true" />80%</li>}
    <TargetLegend insight={insight} unit={data.unit} />
    <TrendLegend trends={trends} names={names} palette={palette} />
  </>
  const linePath = pareto ? pareto.map((share, index) => `${index ? 'L' : 'M'}${cx(index).toFixed(1)},${yShare(share).toFixed(1)}`).join('') : ''
  const total = (value: number) => el.decimals == null && !el.code ? ticked(value) : valueFormat(el, data)(value)
  return <ChartFrame legend={legend} legendAt={el.legend} table={table} setTable={setTable} labels={labels}><LegendAround at={el.legend} legend={legend}><div ref={wrap}>
    {table ? <PivotTable page={page} insight={insight} data={data} /> : <div className="viz-plot">
      <svg className={`viz-fixed${onDrill ? ' viz-drill' : ''}`} width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={onDrill ? `${id}-desc` : undefined} tabIndex={0} onKeyDown={keyDown} onPointerLeave={() => setHover(null)}>
        <title id={`${id}-title`}>{`${insight.title}: ${data.categories.map((cat, index) => grouped ? `${cat.label} (${data.series.map((ser, col) => `${ser.label} ${show(data.values[index][col])}`).join(', ')})` : `${cat.label} ${show(ends[index])}${pareto ? ` (cumulative ${pareto[index].toFixed(0)}%)` : ''}`).join(', ')}`}</title>
        {onDrill && <desc id={`${id}-desc`}>{drillHint}</desc>}
        {el.grid.minorH && minorTicks(ticks).map((value) => <line key={`minor-${value}`} className="viz-grid viz-grid-minor" x1={pad.left} x2={pad.left + plotWidth} y1={y(value)} y2={y(value)} />)}
        {el.grid.majorV && Array.from({ length: count + 1 }, (_, index) => <line key={`major-v-${index}`} className="viz-grid" x1={pad.left + band * index} x2={pad.left + band * index} y1={pad.top} y2={pad.top + plotHeight} />)}
        {el.grid.minorV && Array.from({ length: count }, (_, index) => <line key={`minor-v-${index}`} className="viz-grid viz-grid-minor" x1={cx(index)} x2={cx(index)} y1={pad.top} y2={pad.top + plotHeight} />)}
        {ticks.map((value) => <g key={value}>{el.grid.majorH && <line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(value)} y2={y(value)} />}{el.axisY && <text className="viz-tick" x={pad.left - 8} y={y(value)} textAnchor="end" dominantBaseline="middle">{ticked(value)}</text>}</g>)}
        {pareto && el.axisY && [0, 20, 40, 60, 80, 100].map((share) => <text key={share} className="viz-tick" x={pad.left + plotWidth + 6} y={yShare(share)} dominantBaseline="middle">{share}%</text>)}
        {data.categories.map((cat, index) => {
          const value = data.values[index][0] ?? 0
          const single = custom && !split ? along(texts[index][0], y(0), y(value), value >= 0 ? y(value) - 2 : pad.top + plotHeight - y(value), el.position === 'outsideEnd') : null
          return <g key={cat.key} onPointerEnter={() => setHover(index)} onClick={onDrill ? () => onDrill(index, null) : undefined}>
            <rect className={index === hover ? 'viz-row-active' : 'viz-row-hit'} x={pad.left + band * index} y={pad.top} width={band} height={plotHeight} rx={4} />
            {grouped ? stacks[index].map((part, at) => {
              // CHT-40: one column per series from zero, side by side; its label at the owner's position (above it when plain).
              if (part.empty) return null
              const top = y(Math.max(0, part.value)), h = Math.abs(y(part.value) - y(0))
              const left = cx(index) + slots.offsets[at] - slots.size / 2
              const own = slots.size + slots.gap
              const text = custom ? texts[index][at] : ticked(part.value)
              const room = part.value >= 0 ? y(part.value) - 2 : pad.top + plotHeight - y(part.value)
              const placed = !labels[0] ? null : custom ? along(text, y(0), y(part.value), room, el.position === 'outsideEnd', own) : textWidth(text) <= own + 2 && room >= 14 ? { at: y(part.value) + (part.value >= 0 ? -8 : 10), lines: [text] } : null
              const inBar = placed && custom && el.position !== 'outsideEnd'
              return <g key={data.series[at].key} onClick={onDrill ? (event) => { event.stopPropagation(); onDrill(index, at) } : undefined}>
                <path className="viz-bar viz-bar-active" d={part.value > 0 ? columnPath(left, top, slots.size, h, Math.min(4, slots.size / 2)) : h > 0 ? `M${left},${top}h${slots.size}v${h}h${-slots.size}Z` : ''} fill={palette[at]} />
                {placed && <g style={inBar ? onFill(palette[at]) : undefined}><ChartLabel className={inBar ? 'viz-slice-label' : 'viz-data-label'} lines={placed.lines} x={cx(index) + slots.offsets[at]} y={placed.at} /></g>}
              </g>
            }) : stacks[index].map((part, at) => {
              const top = y(Math.max(part.start, part.end)), h = Math.abs(y(part.end) - y(part.start))
              const last = at === stacks[index].length - 1 || stacks[index].slice(at + 1).every((next) => next.value === 0)
              const left = cx(index) - barWidth / 2
              const segment = custom && stacked && part.value !== 0 ? along(texts[index][at], y(part.start), y(part.end), 0, false) : null
              return <g key={data.series[at].key} onClick={onDrill && stacked ? (event) => { event.stopPropagation(); onDrill(index, at) } : undefined}>
                <path className="viz-bar viz-bar-active" d={last && part.value > 0 ? columnPath(left, top, barWidth, h) : h > 0 ? `M${left},${top}h${barWidth}v${h}h${-barWidth}Z` : ''} fill={palette[at]} />
                {labels[0] && el.plain && stacked && h > 16 && barWidth > 30 && part.value !== 0 && <text className="viz-slice-label" style={onFill(palette[at])} x={cx(index)} y={top + h / 2} textAnchor="middle" dominantBaseline="middle">{ticked(part.value)}</text>}
                {segment && <g style={onFill(palette[at])}><ChartLabel className="viz-slice-label" lines={segment.lines} x={cx(index)} y={segment.at} /></g>}
              </g>
            })}
            {labels[0] && !grouped && (el.plain || stacked) && band >= 26 && <text className="viz-data-label" x={cx(index)} y={y(Math.max(0, ...stacks[index].map((part) => part.end))) - 6} textAnchor="middle">{el.plain ? ticked(stacked ? ends[index] : data.values[index][0] ?? 0) : total(ends[index])}</text>}
            {single && <ChartLabel className={el.position === 'outsideEnd' ? 'viz-data-label' : 'viz-slice-label'} lines={single.lines} x={cx(index)} y={single.at} />}
            {el.axisX && index % step === 0 && <WrappedLabel text={cat.label} x={cx(index)} y={height - pad.bottom + 16} chars={chars} />}
          </g>
        })}
        {low < 0 && <line className="viz-reference" x1={pad.left} x2={pad.left + plotWidth} y1={y(0)} y2={y(0)} />}
        {pareto && <g className="viz-pareto">
          <line className="viz-reference viz-target" x1={pad.left} x2={pad.left + plotWidth} y1={yShare(80)} y2={yShare(80)} />
          <path d={linePath} fill="none" stroke="var(--viz-series-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pareto.map((share, index) => <circle key={index} className="viz-marker" cx={cx(index)} cy={yShare(share)} r={index === hover ? 5 : 3.5} fill="var(--viz-series-2)" />)}
        </g>}
        {trends.map((line) => <line key={`trend-${line.col}`} className="viz-trendline" x1={cx(0) + (grouped ? slots.offsets[line.col] : 0)} x2={cx(count - 1) + (grouped ? slots.offsets[line.col] : 0)} y1={y(line.from)} y2={y(line.to)} stroke={palette[line.col]}><title>{trendName(names[line.col] ?? '')}</title></line>)}
        {target && <g className="viz-target-group"><line className="viz-reference viz-target" x1={pad.left} x2={pad.left + plotWidth} y1={y(target.value)} y2={y(target.value)} /><text className="viz-reference-label" x={pad.left + plotWidth - 4} y={y(target.value) - 5} textAnchor="end">{target.label || 'Target'} {show(target.value)}</text></g>}
        <AxisTitles x={insight.options?.xTitle || name(page, insight.category)} y={insight.options?.yTitle || valueText(page, insight, data.currency)} left={pad.left} right={pad.left + plotWidth} bottom={height - 4} height={pad.top * 2 + plotHeight} showX={el.titleX} showY={el.titleY} />
      </svg>
      {hover != null && <Tooltip left={cx(hover)} width={width}><strong>{data.categories[hover].label}</strong>
        {split ? data.series.map((ser, at) => <TooltipRow key={ser.key} color={palette[at]} value={show(data.values[hover][at])} label={ser.label} />) : <TooltipRow color={palette[0]} value={show(data.values[hover][0])} label={valueText(page, insight, data.currency)} />}
        {split && (stacked || additive(insight.measure)) && <small>Total (each row once): {show(data.categoryTotals[hover])}</small>}
        {pareto && data.shares && <small>Share {data.shares[hover].toFixed(1)}% · cumulative {pareto[hover].toFixed(1)}%</small>}</Tooltip>}
    </div>}
    {!table && el.dataTable && <DataTableOf {...props} palette={palette} />}
  </div></LegendAround></ChartFrame>
}

// One line per series over every period (month, or the chosen grouping, CHT-03) from the first to the last.
function LineChart(props: ChartProps) {
  const { page, insight, data, pins, onDrill, el } = props
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const labels = useDataLabels(`ondemand-${insight.id}`, el.labels)
  const id = useId()
  const split = Boolean(insight.second)
  const palette = split ? colors(data.series, pins) : ['var(--viz-series-1)']
  const show = (value: number | null | undefined) => formatShown(value, data.unit)
  const ticked = tickOf(data.unit)
  const target = insight.options?.target
  const trends = el.trendline ? trendLines(data.values, data.series.length) : []
  const all = [...data.values.flat().filter((value): value is number => value != null), ...trends.flatMap((line) => [line.from, line.to])]
  const min = Math.min(0, target ? target.value : 0, ...all), max = Math.max(0, target ? target.value : 0, ...all)
  const count = data.categories.length
  const custom = labels[0] && !el.plain
  const label = labelMaker(props, ticked)
  const texts = custom ? data.values.map((row, index) => row.map((value, col) => value == null ? '' : label(index, col, value))) : []
  // Left / Right labels of the first and last points need room beside the plot.
  const widest = custom ? Math.max(0, ...texts.flat().map((text) => textWidth(text))) : 0
  const side = Math.max(0, widest + 10 - (Math.max(1, width - 82) / Math.max(1, count)) / 2)
  const height = Math.round(300 * useHeightFactor()), pad = { top: 24, right: 20 + (custom && el.position === 'right' ? side : 0), bottom: el.axisX ? el.titleX ? 54 : 34 : el.titleX ? 26 : 10, left: (el.axisY ? 62 : el.titleY ? 28 : 10) + (custom && el.position === 'left' ? side : 0) }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const ticks = scale(min, max, 4)
  const low = ticks[0], high = ticks[ticks.length - 1]
  const band = plotWidth / Math.max(1, count)
  const x = (index: number) => pad.left + band * (index + 0.5)
  const y = (value: number) => pad.top + plotHeight - (value - low) / (high - low || 1) * plotHeight
  const step = Math.max(1, Math.ceil(46 / band))
  const path = (col: number) => { let d = '', open = false; data.values.forEach((row, index) => { const value = row[col]; if (value == null) { open = false; return } d += `${open ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`; open = true }); return d }
  // CHT-28, CHT-29: the owner's labels beside each point — those that would leave the chart or overlap another left out.
  const placed = custom ? keepApart(data.series.flatMap((_ser, col) => data.values.map((row, index) => row[col] == null ? null : { ...lineLabelAt(el.position, x(index), y(row[col]!), textWidth(texts[index][col]), 12), key: `${col}-${index}`, text: texts[index][col] })).filter((box): box is NonNullable<typeof box> => box != null && inside(box, width, height))) : []
  const names = seriesNames(page, insight, data)
  const legend = <>{split ? data.series.map((ser, index) => <LegendLine key={ser.key} color={palette[index]} label={ser.label} />) : <LegendLine color={palette[0]} label={valueText(page, insight, data.currency)} />}<TargetLegend insight={insight} unit={data.unit} /><TrendLegend trends={trends} names={names} palette={palette} /></>
  const pick = (clientX: number, rect: DOMRect) => Math.min(count - 1, Math.max(0, Math.floor((clientX - rect.left - pad.left) / band)))
  const unit = dateGroupLabels[grainOf(insight)].label.replace(/ \(.*$/, '')
  return <ChartFrame legend={legend} legendAt={el.legend} table={table} setTable={setTable} labels={labels}><LegendAround at={el.legend} legend={legend}><div ref={wrap}>
    {table ? <PivotTable page={page} insight={insight} data={data} /> : <div className="viz-plot">
      <svg className={`viz-fixed${onDrill ? ' viz-drill' : ''}`} width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={onDrill ? `${id}-desc` : undefined} tabIndex={0}
        onPointerMove={(event) => setHover(pick(event.clientX, event.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setHover(null)}
        onClick={onDrill ? (event) => onDrill(pick(event.clientX, event.currentTarget.getBoundingClientRect()), null) : undefined}
        onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover((value) => Math.min(count - 1, Math.max(0, (value ?? -1) + (event.key === 'ArrowLeft' ? -1 : 1)))) } else if (event.key === 'Enter' && hover != null && onDrill) { event.preventDefault(); onDrill(hover, null) } else if (event.key === 'Escape') setHover(null) }}>
        <title id={`${id}-title`}>{`${insight.title}: ${data.categories.map((cat, index) => `${cat.label} ${show(data.categoryTotals[index])}`).join(', ')}`}</title>
        {onDrill && <desc id={`${id}-desc`}>{drillHint}</desc>}
        {el.grid.minorH && minorTicks(ticks).map((value) => <line key={`minor-${value}`} className="viz-grid viz-grid-minor" x1={pad.left} x2={pad.left + plotWidth} y1={y(value)} y2={y(value)} />)}
        {el.grid.majorV && Array.from({ length: count + 1 }, (_, index) => <line key={`major-v-${index}`} className="viz-grid" x1={pad.left + band * index} x2={pad.left + band * index} y1={pad.top} y2={pad.top + plotHeight} />)}
        {el.grid.minorV && Array.from({ length: count }, (_, index) => <line key={`minor-v-${index}`} className="viz-grid viz-grid-minor" x1={x(index)} x2={x(index)} y1={pad.top} y2={pad.top + plotHeight} />)}
        {ticks.map((value) => <g key={value}>{el.grid.majorH && <line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(value)} y2={y(value)} />}{el.axisY && <text className="viz-tick" x={pad.left - 8} y={y(value)} textAnchor="end" dominantBaseline="middle">{ticked(value)}</text>}</g>)}
        {hover != null && <rect className="viz-selected-band" x={x(hover) - band / 2} y={pad.top} width={band} height={plotHeight} rx={4} />}
        {data.series.map((ser, col) => <g key={ser.key}>
          <path d={path(col)} fill="none" stroke={palette[col]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.values.map((row, index) => row[col] != null && <circle key={index} className="viz-marker" cx={x(index)} cy={y(row[col]!)} r={index === hover ? 5 : count > 24 ? 2.5 : 4} fill={palette[col]} />)}
          {labels[0] && el.plain && count <= 24 && data.values.map((row, index) => row[col] != null && <text key={index} className="viz-data-label" x={x(index)} y={y(row[col]!) - 9} textAnchor="middle">{ticked(row[col]!)}</text>)}
        </g>)}
        {placed.length > 0 && <g className="viz-data-labels">{placed.map((box) => <text key={box.key} className="viz-data-label" x={box.x + box.width / 2} y={box.y + box.height / 2} textAnchor="middle" dominantBaseline="middle">{box.text}</text>)}</g>}
        {trends.map((line) => <line key={`trend-${line.col}`} className="viz-trendline" x1={x(0)} x2={x(count - 1)} y1={y(line.from)} y2={y(line.to)} stroke={palette[line.col]}><title>{trendName(names[line.col] ?? '')}</title></line>)}
        {target && <g className="viz-target-group"><line className="viz-reference viz-target" x1={pad.left} x2={pad.left + plotWidth} y1={y(target.value)} y2={y(target.value)} /><text className="viz-reference-label" x={pad.left + plotWidth - 4} y={y(target.value) - 5} textAnchor="end">{target.label || 'Target'} {show(target.value)}</text></g>}
        {el.axisX && data.categories.map((cat, index) => index % step === 0 && <text key={cat.key} className="viz-tick" x={x(index)} y={height - pad.bottom + 16} textAnchor="middle">{cat.label.replace(/ (\d{2})(\d{2})$/, ' ’$2')}</text>)}
        <AxisTitles x={insight.options?.xTitle || `${unit} of ${name(page, insight.category)}`} y={insight.options?.yTitle || valueText(page, insight, data.currency)} left={pad.left} right={pad.left + plotWidth} bottom={height - 4} height={pad.top * 2 + plotHeight} showX={el.titleX} showY={el.titleY} />
      </svg>
      {hover != null && <Tooltip left={x(hover)} width={width}><strong>{data.categories[hover].label}</strong>
        {data.series.map((ser, col) => <TooltipRow key={ser.key} color={palette[col]} value={show(data.values[hover][col])} label={split ? ser.label : valueText(page, insight, data.currency)} />)}</Tooltip>}
    </div>}
    {!table && el.dataTable && <DataTableOf {...props} palette={palette} />}
  </div></LegendAround></ChartFrame>
}

// A donut: each category's share of the sum of the slices; the centre shows that sum, or the slice pointed at.
// CHT-28, CHT-32: the owner's labels (Center, Inside End, Outside End, Best Fit — outside ones with leader lines, the
// drawing grown to hold them) and the legend's place (beside it on the right as before, left, top, bottom or none).
function PieChart(props: ChartProps) {
  const { page, insight, data, pins, onDrill, el } = props
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const labels = useDataLabels(`ondemand-${insight.id}`, el.labels)
  const id = useId()
  const palette = colors(data.categories, pins)
  const slices = data.categories.map((cat, index) => ({ ...cat, index, value: Math.max(0, data.values[index][0] ?? 0), color: palette[index] })).filter((slice) => slice.value > 0)
  const total = slices.reduce((all, slice) => all + slice.value, 0)
  const scale = useHeightFactor(), size = Math.round(196 * scale), center = size / 2, outer = Math.round(92 * scale), inner = Math.round(60 * scale)
  const arcs = slices.map((slice, index) => { const before = slices.slice(0, index).reduce((all, entry) => all + entry.value, 0); const start = -Math.PI / 2 + before / total * Math.PI * 2; return { ...slice, start, end: start + slice.value / total * Math.PI * 2, share: slice.value / total * 100 } })
  const active = hover == null ? undefined : arcs[hover]
  const negative = data.values.some((row) => (row[0] ?? 0) < 0)
  const custom = labels[0] && !el.plain
  const label = labelMaker(props, formatValue)
  const texts = custom ? arcs.map((arc) => { const text = label(arc.index, 0, arc.value, arc.share); return fitText(text, 150, 2) ?? fitText(text, 150, 3) ?? [text] }) : []
  const layout = custom ? pieLabels(arcs.map((arc, index) => ({ start: arc.start, end: arc.end, width: Math.max(...texts[index].map((line) => textWidth(line))), lines: texts[index].length })), el.position, inner, outer) : null
  // The drawing: the donut's square as before, grown to hold the outside labels.
  const box = layout ? { left: Math.min(-center, layout.bounds.left - 4), right: Math.max(center, layout.bounds.right + 4), top: Math.min(-center, layout.bounds.top - 2), bottom: Math.max(center, layout.bounds.bottom + 2) } : { left: -center, right: center, top: -center, bottom: center }
  const svgWidth = Math.round(box.right - box.left), svgHeight = Math.round(box.bottom - box.top), cx = -box.left, cy = -box.top
  const at = el.legend
  const list = at === 'none' ? null : <ul className="viz-donut-legend" aria-label={`${insight.title} legend`}>{arcs.map((arc, index) => <li key={arc.key} className={hover === index ? 'active' : ''} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}><i style={{ background: arc.color }} aria-hidden="true" /><span>{arc.label}</span><b>{formatValue(arc.value)}</b><small>{arc.share.toFixed(0)}%</small></li>)}</ul>
  return <ChartFrame legend={null} table={table} setTable={setTable} labels={labels}>
    {table || !total ? <PivotTable page={page} insight={insight} data={data} share /> : <div className={at === 'right' ? 'viz-donut' : `viz-donut viz-donut-legend-${at}`}>
      {(at === 'left' || at === 'top') && list}
      <svg className={onDrill ? 'viz-drill' : undefined} width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby={`${id}-title`} aria-describedby={onDrill ? `${id}-desc` : undefined} tabIndex={0} onPointerLeave={() => setHover(null)} onKeyDown={(event) => { if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); const by = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1; setHover((value) => ((value ?? (by > 0 ? -1 : 0)) + by + arcs.length) % arcs.length) } else if (event.key === 'Enter' && active && onDrill) { event.preventDefault(); onDrill(active.index, null) } else if (event.key === 'Escape') setHover(null) }}>
        <title id={`${id}-title`}>{`${insight.title}: ${arcs.map((arc) => `${arc.label} ${formatValue(arc.value)} (${arc.share.toFixed(0)}%)`).join(', ')}`}</title>
        {onDrill && <desc id={`${id}-desc`}>{drillHint}</desc>}
        {arcs.map((arc, index) => <path key={arc.key} className={hover == null || hover === index ? 'viz-slice' : 'viz-slice viz-slice-dim'} d={arcPath(cx, cy, inner, hover === index ? outer + 3 : outer, arc.start, arc.end)} fill={arc.color} fillRule="evenodd" onPointerEnter={() => setHover(index)} onClick={onDrill ? () => onDrill(arc.index, null) : undefined} />)}
        {labels[0] && el.plain && arcs.map((arc) => { const angle = (arc.start + arc.end) / 2, radius = (inner + outer) / 2; return arc.share >= 6 && <text key={arc.key} className="viz-slice-label" style={onFill(arc.color)} x={cx + radius * Math.cos(angle)} y={cy + radius * Math.sin(angle)} textAnchor="middle" dominantBaseline="middle">{arc.share.toFixed(0)}%</text> })}
        {layout && <g className="viz-data-labels">{layout.labels.map((spot, index) => spot.hidden ? null : <g key={arcs[index].key}>
          {spot.leader && <polyline className="viz-leader" fill="none" points={`${cx + spot.leader[0]},${cy + spot.leader[1]} ${cx + spot.leader[2]},${cy + spot.leader[3]} ${cx + spot.leader[4]},${cy + spot.leader[5]}`} />}
          <g style={spot.outside ? undefined : onFill(arcs[index].color)}><ChartLabel className={spot.outside ? 'viz-data-label' : 'viz-slice-label'} lines={texts[index]} x={cx + spot.x} y={cy + spot.y} anchor={spot.anchor} /></g>
        </g>)}</g>}
        <text className="viz-donut-value" x={cx} y={cy - 2} textAnchor="middle">{formatValue(active ? active.value : total)}</text>
        <text className="viz-donut-label" x={cx} y={cy + 16} textAnchor="middle">{active ? `${active.label.slice(0, 18)} · ${active.share.toFixed(0)}%` : 'Total'}</text>
      </svg>
      {(at === 'right' || at === 'bottom') && list}
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
    { id: 'drill-id', label: 'ID', value: (row) => rowId(page, row) || row.key || '', ...(page.rows.some((row) => row.link) ? { render: (row: OnDemandRow) => row.link && /^https:\/\//.test(row.link) ? <a href={row.link} target="_blank" rel="noreferrer">{rowId(page, row) || row.key || 'Open'}</a> : rowId(page, row) || row.key || '' } : {}) },
    ...page.columns.map((column): DataColumn<OnDemandRow> => ({ id: `drill-${column.id}`, label: column.name, align: column.type === 'number' || column.type === 'currency' ? 'right' : undefined, value: (row) => displayText(column, row.cells[column.id]) })),
  ]
  const where = `${cat?.label ?? ''}${ser ? ` · ${ser.label}` : ''}`
  return <Modal eyebrow={`${insight.type === 'table' ? 'TABLE' : 'CHART'} · ${(insight.title || 'Untitled').toUpperCase()}`} title={`Rows behind ${where}`} wide form={false} onClose={onClose}>
    <p className="muted">{rows.length} row{rows.length === 1 ? '' : 's'} counted in {where} ({measureText(page, insight, data.currency)}{data.currency ? '; rows in the shown currency' : ''}){insight.options?.cumulative ? ' — this category’s own rows; the chart shows the running total' : ''}. Read only: edit rows on the table page.</p>
    <DataTable id={`drill:${page.id}`} columns={columns} rows={rows} rowKey={(row) => row.id} exportName={`${insight.title || 'Rows'} – ${where}`} status={`${rows.length} row${rows.length === 1 ? '' : 's'}`} />
    <div className="modal-actions"><button type="button" className="primary" onClick={onClose}>Close</button></div>
  </Modal>
}

// CHT-36…CHT-38 A KPI (one number) as a compact card in the Insights tab's card row — the look of the Dashboard's KPI
// tiles (the shared metric tiles, UI-STANDARDS §9): the title with ⓘ (and the owners' ⋯), the number, the measure as
// a caption of at most two lines (KB-84: the full text as its tooltip), "Filtered" when narrowed. The number is never
// cut: it wraps before its currency code and, as a last resort, between digits; its full text is the tooltip.
// CHT-53: the header in one row — the title (at most two lines, "…", the full title as its tooltip) with ⓘ at its end,
// "Filtered" and ⋯ on the right. CHT-51, CHT-54: on the chart grid (`frame`) the card fills its columns and rows, and
// the number grows with the card (never cut).
export interface KpiFrame { className?: string; style?: CSSProperties; grip?: ReactNode; footer?: ReactNode; rows?: number }
export function KpiCard({ page, insight, currency: preferred = '', info, action, frame }: { page: OnDemandPage; insight: Insight; currency?: string; info?: ReactNode; action?: ReactNode; frame?: KpiFrame }) {
  const [pick, setPick] = useState({ base: preferred, code: '' })
  const currency = (pick.base === preferred ? pick.code : '') || preferred
  const problems = insightProblems(page, insight)
  const data = problems.length ? null : chartData(page, insight, currency)
  const value = data?.total == null ? '—' : formatValue(data.total)
  const unit = data?.currency ?? ''
  const caption = problems.length ? `Cannot be shown: ${problems.join(' ')}` : measureText(page, insight, unit)
  const title = insight.title || 'Untitled'
  const style = frame ? { ...frame.style, ...(frame.rows ? { '--kpi-rows': frame.rows } : {}) } as CSSProperties : undefined
  return <article className={['od-insight od-kpi-card', frame?.className].filter(Boolean).join(' ')} style={style}>
    <div className="od-kpi-card-head"><h2><span className="od-kpi-title" title={title}>{title}</span>{info && <Info iconOnly label={`Info: ${title}`}>{info}</Info>}</h2>{(frame?.grip || action) && <span className="od-kpi-card-actions">{frame?.grip}{action}</span>}</div>
    <div className="od-kpi"><strong title={`${value}${unit ? ` ${unit}` : ''}`}>{value}{unit && <span className="od-kpi-unit"> {unit}</span>}</strong></div>
    <small className={problems.length ? 'od-kpi-caption dsh-problem' : 'od-kpi-caption'} title={caption}>{caption}</small>
    {data && data.currencies.length > 1 && <label className="od-currency-pick">Currency<select aria-label={`Currency of ${title}`} value={data.currency} onChange={(event) => setPick({ base: preferred, code: event.target.value })}>{data.currencies.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} ({entry.rows} row{entry.rows === 1 ? '' : 's'})</option>)}</select></label>}
    {frame?.footer}
  </article>
}

// CHT-25: the "rows counted" lines of a chart as items of its ⓘ list — computed only when the ⓘ opens.
export function ChartCountInfo({ page, insight, currency = '' }: { page: OnDemandPage; insight: Insight; currency?: string }) {
  if (insightProblems(page, insight).length) return null
  return <>{countLines(chartData(page, insight, currency)).map((line) => <li key={line}>{line}</li>)}</>
}
