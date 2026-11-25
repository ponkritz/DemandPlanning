import { useId, useState } from 'react'
import { columnPath, epicSlots, longMonth, niceTicks, shortMonth, useElementWidth } from '../chartUtils'
import { useDataLabels } from '../useDataLabels'
import { useHeightFactor } from '../useChartSize'
import type { CumulativeSwitches, CumulativeYear } from '../cumulativeReleases'
import { AxisTitles } from './chartLabels'
import { DataTable, type DataColumn } from './DataTable'
import { Panel } from './ui'
import { ChartFrame, LegendBar, LegendLine, Tooltip, TooltipRow } from './WorkloadCharts'

// QV-68 Pulse Check → Year: the Completed releases of the year, cumulative — one line per counted stream (the running
// total from January), the All streams line and a column of each month's sum, all on one axis of releases. Drawn in the
// app's chart frame (UI-STANDARDS §9: legend, Data labels, Table / Chart, axis names) with the --viz-series-* colours;
// a sixth stream and later take the palette again with a dashed line, the All streams line the text colour, the
// columns the neutral colour. The lines stop at the current month; later months are empty.
const allColor = 'var(--viz-capacity)', sumColor = 'var(--viz-other)'
const streamColor = (index: number) => epicSlots[index % epicSlots.length]
const dashed = (index: number) => index >= epicSlots.length
function LegendDashed({ color, label }: { color: string; label: string }) { return <li><i className="viz-key-dashed" style={{ borderColor: color }} aria-hidden="true" />{label}</li> }

export function CumulativeReleasesChart({ data, switches, title }: { data: CumulativeYear; switches: CumulativeSwitches; title: string }) {
  const [wrap, width] = useElementWidth<HTMLDivElement>()
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const labels = useDataLabels('pulse-cumulative')
  const id = useId()
  const lines = [...(switches.streams ? data.streams.map((line, index) => ({ line, color: streamColor(index), dash: dashed(index), all: false })) : []), ...(switches.all ? [{ line: data.total, color: allColor, dash: false, all: true }] : [])]
  const count = data.months.length
  const values = [...lines.flatMap((entry) => entry.line.cumulative), ...(switches.sums ? data.total.monthly : [])].filter((value): value is number => value != null)
  const ticks = niceTicks(Math.max(1, ...values), 4)
  const top = ticks[ticks.length - 1]
  const narrow = width < 520
  const height = Math.round(300 * useHeightFactor()), pad = { top: 22, right: labels[0] ? 34 : 14, bottom: 52, left: 56 }
  const plotWidth = Math.max(10, width - pad.left - pad.right), plotHeight = height - pad.top - pad.bottom
  const band = plotWidth / Math.max(1, count)
  const x = (index: number) => pad.left + band * (index + 0.5)
  const y = (value: number) => pad.top + plotHeight - value / top * plotHeight
  const barWidth = Math.min(26, band * 0.55)
  const step = band < 30 ? 2 : 1
  const last = data.elapsed - 1
  const path = (series: (number | null)[]) => series.map((value, index) => value == null ? '' : `${index === 0 || series[index - 1] == null ? 'M' : 'L'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join('')
  const pick = (clientX: number, rect: DOMRect) => Math.min(Math.max(0, last), Math.max(0, Math.floor((clientX - rect.left - pad.left) / band)))
  const legend = <>
    {lines.map(({ line, color, dash, all }) => dash ? <LegendDashed key={line.name} color={color} label={line.name} /> : <LegendLine key={`${all ? 'all:' : ''}${line.name}`} color={color} label={all ? 'All streams (cumulative)' : line.name} />)}
    {switches.sums && <LegendBar color={sumColor} label="Month sum" />}
  </>
  const nothing = !lines.length && !switches.sums
  // Data labels: the value of each line at the current month, and each column's sum — every point would crowd the chart.
  // A line still at 0 sits on the axis and is not labelled; labels that would overlap move down, none below the axis;
  // beside the current month's column, so they never cover its sum.
  const endLabels = labels[0] && last >= 0 ? lines.map(({ line, all }) => ({ key: `${all ? 'all:' : ''}${line.name}`, value: line.cumulative[last] ?? 0 })).filter((entry) => entry.value > 0) : []
  const placed: { key: string; value: number; y: number }[] = []
  for (const entry of [...endLabels].sort((a, b) => b.value - a.value)) { const wanted = y(entry.value); const prev = placed[placed.length - 1]; const at = prev && wanted - prev.y < 12 ? prev.y + 12 : wanted; if (at <= pad.top + plotHeight - 4) placed.push({ ...entry, y: at }) }
  const labelX = last >= 0 ? x(last) + (switches.sums ? barWidth / 2 + 4 : 7) : 0
  return <ChartFrame legend={legend} table={table} setTable={setTable} labels={labels}><div ref={wrap}>
    {table ? <div className="azure-table"><table className="viz-table"><thead><tr><th>Month</th>{data.streams.map((line) => <th key={line.name} className="num">{line.name}</th>)}<th className="num">All streams</th><th className="num">Month sum</th></tr></thead><tbody>
      {data.months.map((month, index) => <tr key={month}><td>{longMonth(month)}</td>{data.streams.map((line) => <td key={line.name} className="num">{line.cumulative[index] ?? '—'}</td>)}<td className="num">{data.total.cumulative[index] ?? '—'}</td><td className="num">{data.total.monthly[index] ?? '—'}</td></tr>)}
    </tbody></table></div>
    : nothing ? <div className="empty-state"><strong>Nothing to draw.</strong><p>Turn on Per stream, All streams or Month sum above the chart.</p></div>
    : <div className="viz-plot">
      <svg className="viz-fixed" width={width} height={height} style={{ width, height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-title`} tabIndex={0}
        onPointerMove={(event) => setHover(pick(event.clientX, event.currentTarget.getBoundingClientRect()))} onPointerLeave={() => setHover(null)}
        onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setHover((value) => Math.min(Math.max(0, last), Math.max(0, (value ?? -1) + (event.key === 'ArrowLeft' ? -1 : 1)))) } else if (event.key === 'Escape') setHover(null) }}>
        <title id={`${id}-title`}>{`${title}: ${lines.map(({ line, all }) => `${all ? 'All streams' : line.name} ${last >= 0 ? line.cumulative[last] ?? 0 : 0}`).join(', ')}${last >= 0 ? ` by ${longMonth(data.months[last])}` : ''}`}</title>
        {ticks.map((value) => <g key={value}><line className="viz-grid" x1={pad.left} x2={pad.left + plotWidth} y1={y(value)} y2={y(value)} /><text className="viz-tick" x={pad.left - 8} y={y(value)} textAnchor="end" dominantBaseline="middle">{value}</text></g>)}
        {hover != null && <rect className="viz-selected-band" x={x(hover) - band / 2} y={pad.top} width={band} height={plotHeight} rx={4} />}
        {switches.sums && data.total.monthly.map((value, index) => value == null || value <= 0 ? null : <path key={data.months[index]} className={`viz-bar ${index === hover ? 'viz-bar-active' : ''}`} d={columnPath(x(index) - barWidth / 2, y(value), barWidth, pad.top + plotHeight - y(value))} fill={sumColor}><title>{`${longMonth(data.months[index])}: ${value} completed`}</title></path>)}
        {lines.map(({ line, color, dash, all }) => <g key={`${all ? 'all:' : ''}${line.name}`}>
          <path d={path(line.cumulative)} fill="none" stroke={color} strokeWidth={all ? 3 : 2} strokeDasharray={dash ? '6 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
          {line.cumulative.map((value, index) => value == null ? null : <circle key={index} className="viz-marker" cx={x(index)} cy={y(value)} r={index === hover ? 5 : narrow ? 2.5 : 3.5} fill={color} />)}
        </g>)}
        {labels[0] && switches.sums && data.total.monthly.map((value, index) => value == null || value <= 0 ? null : <text key={`sum-${data.months[index]}`} className="viz-data-label" x={x(index)} y={y(value) - 6} textAnchor="middle">{value}</text>)}
        {placed.map((entry) => <text key={`end-${entry.key}`} className="viz-data-label" x={labelX} y={entry.y} dominantBaseline="middle" textAnchor="start">{entry.value}</text>)}
        {data.months.map((month, index) => index % step === 0 && <text key={month} className="viz-tick" x={x(index)} y={height - pad.bottom + 16} textAnchor="middle">{shortMonth(month)}</text>)}
        <AxisTitles x="Month" y="Completed releases" left={pad.left} right={pad.left + plotWidth} bottom={height - 6} height={pad.top * 2 + plotHeight} />
      </svg>
      {hover != null && hover <= last && <Tooltip left={x(hover)} width={width}><strong>{longMonth(data.months[hover])}</strong>
        {lines.map(({ line, color, all }) => <TooltipRow key={`${all ? 'all:' : ''}${line.name}`} color={color} value={String(line.cumulative[hover] ?? 0)} label={`${all ? 'All streams' : line.name} (+${line.monthly[hover] ?? 0})`} />)}
        {switches.sums && <TooltipRow color={sumColor} value={String(data.total.monthly[hover] ?? 0)} label="Month sum" />}</Tooltip>}
    </div>}
  </div></ChartFrame>
}

// QV-68, QV-69 The Year view's panel: the switches (remembered per person by the page), the chart and below it each
// month's Completed releases per counted stream with the month's total and the running total (the shared table, with
// its Export). ⓘ says how a month is counted, how that differs from the Year row and which streams are not counted.
type MonthRow = { month: string; index: number }
export function CumulativeReleasesPanel({ year, data, switches, onSwitches, note }: { year: string; data: CumulativeYear; switches: CumulativeSwitches; onSwitches: (next: CumulativeSwitches) => void; note: string }) {
  const title = `Completed releases · ${year}, cumulative`
  const current = data.elapsed > 0 ? longMonth(data.months[data.elapsed - 1]) : ''
  const toggle = (key: keyof CumulativeSwitches, label: string) => <label className="check"><input type="checkbox" checked={switches[key]} onChange={(event) => onSwitches({ ...switches, [key]: event.target.checked })} />{label}</label>
  const rows: MonthRow[] = data.months.map((month, index) => ({ month, index }))
  const cell = (series: (number | null)[]) => (row: MonthRow) => series[row.index] ?? ''
  const columns: DataColumn<MonthRow>[] = [
    { id: 'month', label: 'Month', value: (row) => longMonth(row.month), render: (row) => row.index < data.elapsed ? longMonth(row.month) : <span className="muted">{longMonth(row.month)}</span>, sortable: false },
    ...data.streams.map((line): DataColumn<MonthRow> => ({ id: `stream:${line.name}`, label: line.name, align: 'right', sortable: false, value: cell(line.monthly) })),
    { id: 'total', label: 'Month total', align: 'right', sortable: false, value: cell(data.total.monthly) },
    { id: 'cumulative', label: 'Cumulative total', align: 'right', sortable: false, value: cell(data.total.cumulative) },
  ]
  const sum = data.elapsed > 0 ? data.total.cumulative[data.elapsed - 1] ?? 0 : 0
  return <Panel className="pulse-cumulative" title={title} info={<ul>
    <li>Per stream, the Completed releases of each month from January, added up month by month (a running total); the columns are each month's sum over the streams counted, the All streams line their running total.</li>
    <li>A month counts as its Month tab does: DP its Completed Releases, IOCC and CP their Completed, Content its releases, Tool Validations its tools, custom streams by their rule, the Windchill exports their releases with a document dated in the month — and the counts an Admin entered for a month without data.</li>
    <li>The Year row above counts each release once over the year, so a release counted in two months (a Windchill release with documents dated in both) counts twice here and once there, and entered counts are only here: December here can be higher than the Year row.</li>
    <li>{data.elapsed < data.months.length ? `The lines stop at ${current || 'the current month'}; later months are empty.` : 'Every month of the year.'}</li>
    {note && <li>{note} They have no line and are not in the sums.</li>}
  </ul>} action={<span className="record-count">{sum} completed{current ? ` by ${current}` : ''}</span>}>
    <div className="button-row pulse-cumulative-switches" role="group" aria-label="Lines and columns shown">
      {toggle('streams', 'Per stream')}{toggle('all', 'All streams')}{toggle('sums', 'Month sum')}
    </div>
    <CumulativeReleasesChart data={data} switches={switches} title={title} />
    <DataTable id="pulse:cumulative" rows={rows} rowKey={(row) => row.month} exportName={`Completed releases ${year}`} columns={columns} />
  </Panel>
}
