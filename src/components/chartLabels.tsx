// UI-17: the Data labels box and the axis names of a chart (the setting itself is in src/chartLabels.ts).
export function DataLabelsToggle({ on, set }: { on: boolean; set: (on: boolean) => void }) {
  return <label className="check viz-labels-toggle"><input type="checkbox" checked={on} onChange={(event) => set(event.target.checked)} />Data labels</label>
}
// The X axis name centred under the plot, the Y axis name turned along the left edge.
export function AxisTitles({ x, y, left, right, bottom, height }: { x: string; y: string; left: number; right: number; bottom: number; height: number }) {
  const middle = (height) / 2
  return <g className="viz-axis-titles">
    <text className="viz-axis-title" x={(left + right) / 2} y={bottom} textAnchor="middle">{x}</text>
    <text className="viz-axis-title" x={0} y={0} textAnchor="middle" transform={`translate(12 ${middle}) rotate(-90)`}>{y}</text>
  </g>
}
