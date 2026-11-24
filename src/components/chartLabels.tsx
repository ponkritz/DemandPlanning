import { charsIn, fitLabel } from '../chartUtils'

// UI-17: the Data labels box and the axis names of a chart (the setting itself is in src/chartLabels.ts).
export function DataLabelsToggle({ on, set }: { on: boolean; set: (on: boolean) => void }) {
  return <label className="check viz-labels-toggle"><input type="checkbox" checked={on} onChange={(event) => set(event.target.checked)} />Data labels</label>
}
// The X axis name centred under the plot, the Y axis name turned along the left edge. CHT-23 (KB-83): a name longer
// than its side of the plot ends in "…" with the full name as its tooltip, instead of running out of the chart.
// CHT-27: showX / showY false leaves an axis title out (Chart elements → Axis names).
export function AxisTitles({ x, y, left, right, bottom, height, showX = true, showY = true }: { x: string; y: string; left: number; right: number; bottom: number; height: number; showX?: boolean; showY?: boolean }) {
  const middle = (height) / 2
  const fitX = fitLabel(x, charsIn(Math.max(40, right - left)), 1), fitY = fitLabel(y, charsIn(Math.max(40, height - 8)), 1)
  if (!showX && !showY) return null
  return <g className="viz-axis-titles">
    {showX && <text className="viz-axis-title" x={(left + right) / 2} y={bottom} textAnchor="middle">{fitX.cut && <title>{x}</title>}{fitX.lines[0]}</text>}
    {showY && <text className="viz-axis-title" x={0} y={0} textAnchor="middle" transform={`translate(12 ${middle}) rotate(-90)`}>{fitY.cut && <title>{y}</title>}{fitY.lines[0]}</text>}
  </g>
}

// CHT-23: a category label of up to `lines` lines (tspans) centred on (x, y) — the full text as its tooltip.
export function WrappedLabel({ text, x, y, chars, lines = 2, className = 'viz-tick', anchor = 'middle', middle = false, lineHeight = 13 }: { text: string; x: number; y: number; chars: number; lines?: number; className?: string; anchor?: 'start' | 'middle' | 'end'; middle?: boolean; lineHeight?: number }) {
  const fit = fitLabel(text, chars, lines)
  const top = middle ? y - (fit.lines.length - 1) * lineHeight / 2 : y
  return <text className={className} x={x} y={top} textAnchor={anchor} dominantBaseline={middle ? 'middle' : undefined}><title>{text}</title>{fit.lines.map((line, index) => <tspan key={index} x={x} dy={index ? lineHeight : 0}>{line}</tspan>)}</text>
}
