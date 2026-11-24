import type { ReactNode } from 'react'
import type { DataTableModel, LegendPosition } from '../chartElements'
import { Info, Pill } from './ui'

// CHT-30…CHT-33 The drawn parts of the Excel-style chart elements (src/chartElements.ts): the legend placed below or
// beside the chart, the data table under it with legend keys, a trendline's legend key. With the default elements none
// of these is drawn and the chart's markup is as before.

// CHT-32: the legend below or beside the plot (Top stays in the chart frame's toolbar, as before; None draws none). The
// legend comes before the plot in the page when it is on the left, after it otherwise — the order it is read in. On a
// narrow screen a side legend goes above (Left) or under (Right) the plot.
export function LegendAround({ at, legend, children }: { at: LegendPosition; legend: ReactNode; children: ReactNode }) {
  if (at === 'top' || at === 'none') return <>{children}</>
  const list = <ul className={`viz-legend viz-legend-${at}`} aria-label="Legend">{legend}</ul>
  if (at === 'bottom') return <>{children}{list}</>
  return <div className={`viz-legend-side viz-legend-side-${at}`}>{at === 'left' && list}<div className="viz-legend-main">{children}</div>{at === 'right' && list}</div>
}

// CHT-33: a trendline's legend entry ("Linear (Sum of Cost)"), a dotted key in its series' colour.
export function LegendTrend({ color, label }: { color: string; label: string }) {
  return <li><i className="viz-key-trend" style={{ borderColor: color }} aria-hidden="true" />{label}</li>
}

// CHT-30: the data table under the chart — a real table (caption, column and row headers) in a scrolling region that the
// keyboard can reach, so many categories never make the page scroll sideways.
export function ChartDataTable({ title, model, palette }: { title: string; model: DataTableModel; palette: string[] }) {
  return <div className="viz-data-table" role="region" aria-label={`Data table: ${title}`} tabIndex={0}>
    <table>
      <caption className="sr-only">Data table: {title}</caption>
      <thead><tr><th scope="col"><span className="sr-only">Series</span></th>{model.categories.map((category, index) => <th key={index} scope="col" className="num">{category}</th>)}</tr></thead>
      <tbody>{model.rows.map((row) => <tr key={row.name}>
        <th scope="row">{row.key != null ? <i className="viz-key-bar" style={{ background: palette[row.key] }} aria-hidden="true" /> : <i className="viz-key-line" aria-hidden="true" />}{row.name}</th>
        {row.cells.map((cell, index) => <td key={index} className="num">{cell}</td>)}
      </tr>)}</tbody>
    </table>
  </div>
}

// CHT-28: a data label of one or two lines centred on (x, y).
export function ChartLabel({ lines, x, y, anchor = 'middle', className = 'viz-data-label', lineHeight = 12 }: { lines: string[]; x: number; y: number; anchor?: 'start' | 'middle' | 'end'; className?: string; lineHeight?: number }) {
  const top = y - (lines.length - 1) * lineHeight / 2
  return <text className={className} x={x} y={top} textAnchor={anchor} dominantBaseline="middle">{lines.map((line, index) => <tspan key={index} x={x} dy={index ? lineHeight : 0}>{line}</tspan>)}</text>
}

// KB-86: the header of a chart pop-up's preview, as the chart's own panel shows it (CHT-25): the title (hidden but read
// out when its Chart heading element is off, CHT-26), ⓘ with what it measures and its filters, "Filtered" when they narrow it.
export function PreviewHeading({ title, hidden = false, info, filtered = false }: { title: string; hidden?: boolean; info: ReactNode; filtered?: boolean }) {
  return <h3 className="od-preview-title">{hidden ? <span className="chart-title-hidden">{title}</span> : title} <Info label="Info">{info}</Info>{filtered && <> <Pill>Filtered</Pill></>}</h3>
}
