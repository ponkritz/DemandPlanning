import { useState, type ReactNode } from 'react'
import { additive, cleanOptions, hasOptions, maxAxisTitle, maxValueName, paletteSize, type ChartOptions, type ColorPin, type ColorPins, type DateGroup, type Insight, type OnDemandPage } from '../onDemand'
import { contrastWarning, normalizeHex, pinColor, pinHex } from '../chartColors'
import { autoAxisTitles, dateGroupLabels, limitsFor, pivotColumnFields, pivotRowFields, valueText } from '../onDemandInsights'
import { Info } from './ui'
import { SizeFields } from './ChartSize'
import { factoryOf, kindOf, sizeFromOptions, withSizeOptions } from '../chartSize'
import { chartKind, contentLabels, contentsFor, defaultContent, defaultGridlines, defaultLegend, defaultPosition, gridlineKeys, gridlineLabels, labelPositions, legendLabels, legendPositions, positionLabels, resolveElements, trendlineFor, withElement, type ChartElements, type ChartKind, type Gridline, type LabelContent, type LabelPosition, type LegendPosition } from '../chartElements'

// CHT-01…CHT-11, CHT-15, CHT-16 The Display options of a chart, the same in the Insights pop-up and the Dashboard block pop-up,
// in three parts for the editor's tabs (CHT-70): Data (Group dates by, Show), Format, Elements. Only the
// options the chosen type takes are shown, each change validated as the file is (cleanOptions); an option that does not
// fit the measure is shown disabled with the reason (CON-102 style). Colour pins (CHT-09) are the page's or dashboard's,
// for the values of the coloured Dropdown / Multi-select column.

const tops: { value: string; label: string }[] = [{ value: '5', label: 'Top 5 + Other' }, { value: '10', label: 'Top 10 + Other' }, { value: '15', label: 'Top 15 + Other' }, { value: '20', label: 'Top 20 + Other' }, { value: 'all', label: 'All categories' }]
const notAdditive = 'Only for Count of rows or Sum: an average, minimum, maximum or distinct count does not add up.'

export function ChartOptionsFields({ page, insight, pins, onOptions, onPins, scope = 'page', part }: { page: OnDemandPage; insight: Insight; pins: ColorPins | undefined; onOptions: (options: ChartOptions | undefined) => void; onPins: (pins: ColorPins | undefined) => void; scope?: 'page' | 'dashboard'; part: 'data' | 'format' | 'elements' }) {
  const options = insight.options ?? {}
  const [targetText, setTargetText] = useState(options.target ? String(options.target.value) : '')
  const type = insight.type
  const set = (change: Partial<ChartOptions>) => onOptions(cleanOptions(type, insight.measure, { ...options, ...change }))
  const column = (id: string) => page.columns.find((entry) => entry.id === id)
  // CHT-76: a Pivot table's nested fields too — one grain for every Date field.
  const dated = type !== 'kpi' && [...pivotRowFields(insight), ...pivotColumnFields(insight)].some((id) => column(id)?.type === 'date')
  const adds = additive(insight.measure)
  const axes = autoAxisTitles(page, insight)
  // The typed text is kept as typed (spaces between words); the option is the cleaned one.
  const [xText, setXText] = useState(options.xTitle ?? '')
  const [yText, setYText] = useState(options.yTitle ?? '')
  const [valueNameText, setValueNameText] = useState(options.valueName ?? '')
  const usual = limitsFor({ ...insight, options: undefined }).maxCategories
  // The column whose values have colours: the stacks or lines, a pie's slices.
  const colored = type === 'pie' ? column(insight.category) : type === 'bar' || type === 'line' ? column(insight.second) : undefined
  const values = colored && hasOptions(colored.type) ? colored.options : []
  const pin = (value: string, slot: ColorPin | 0) => { const next = { ...(pins ?? {}) }; if (slot) next[value] = slot; else delete next[value]; onPins(Object.keys(next).length ? next : undefined) }
  const setTarget = (text: string, label = options.target?.label ?? '') => {
    setTargetText(text)
    const value = Number(text)
    if (text.trim() === '' || !Number.isFinite(value)) { const rest = { ...options }; delete rest.target; onOptions(cleanOptions(type, insight.measure, rest)); return }
    set({ target: { value, label } })
  }
  const kind = chartKind(type, options.orientation)
  // CHT-44: the owners' size in grid units (the presets, or columns and rows when it is none of them).
  const gridKind = kindOf(type)
  const current = { ...factoryOf(gridKind), ...sizeFromOptions(options, gridKind) }
  // The currency code in a label: only for a Sum, Average, Minimum or Maximum of a Currency column.
  const money = column(insight.value)?.type === 'currency' && insight.measure !== 'count' && insight.measure !== 'distinct'
  // A dashboard's KPI tile sits in the tile row: nothing to choose.
  if (type === 'kpi' && scope === 'dashboard') return null
  // CHT-70: the Data tab takes the grouping of dates and Show (Top N); the rest are the Format and Elements tabs.
  if (part === 'data') return <>
    {/* CHT-83: the value's own name, used wherever the chart names its value. */}
    {type !== 'kpi' && type !== 'narrative' && <label>Value name (optional)
      <input aria-label="Value name" maxLength={maxValueName} value={valueNameText} placeholder={valueText(page, { ...insight, options: { ...options, valueName: undefined } })} onChange={(event) => { setValueNameText(event.target.value); set({ valueName: event.target.value || undefined }) }} />
      <small>Names the value in the legend, the data table, tooltips, data labels, table headings, Rows behind and Export. Empty: the {kind && kind !== 'pie' ? 'value axis title when set, else the ' : ''}measure as written.</small>
    </label>}
    {dated && <label>Group dates by
      <select aria-label="Group dates by" value={options.dateGroup ?? 'month'} onChange={(event) => set({ dateGroup: event.target.value === 'month' ? undefined : event.target.value as DateGroup })}>
        {(Object.keys(dateGroupLabels) as DateGroup[]).map((grain) => <option key={grain} value={grain}>{dateGroupLabels[grain].label}</option>)}
      </select>
    </label>}
    {(type === 'bar' || type === 'pie' || type === 'pareto' || type === 'table') && <label>Show
      <select aria-label="Show" value={options.top ? String(options.top) : ''} onChange={(event) => set({ top: event.target.value === '' ? undefined : event.target.value === 'all' ? 'all' : Number(event.target.value) })}>
        <option value="">{usual ? `As usual (top ${usual} + Other)` : 'As usual (all categories)'}</option>
        {tops.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
      </select>
      <small>The largest categories by the measure; the rest (with “(none)”) summed as “Other”, last.</small>
    </label>}
  </>
  if (part === 'elements') {
    // CHT-26…CHT-35: Excel's chart elements, only those the chart type takes; CHT-24 the axis names typed beside them.
    if (!kind) return null
    const names = (type === 'bar' || type === 'line' || type === 'pareto') ? <div className="form-row">
      <label>X axis name (optional)<input aria-label="X axis name" maxLength={maxAxisTitle} value={xText} placeholder={axes.x} onChange={(event) => { setXText(event.target.value); set({ xTitle: event.target.value || undefined }) }} /></label>
      <label>Y axis name (optional)<input aria-label="Y axis name" maxLength={maxAxisTitle} value={yText} placeholder={axes.y} onChange={(event) => { setYText(event.target.value); set({ yTitle: event.target.value || undefined }) }} /></label>
    </div> : null
    return <ElementsFields kind={kind} stacked={Boolean(insight.second) && options.grouping !== 'grouped'} percent={Boolean(options.percent)} money={money} elements={options.elements} names={names} onChange={(elements) => set({ elements })} />
  }
  return <fieldset className="od-display"><legend>Format <Info label="Format">How the chart is drawn — nothing here changes which rows are counted. Without a choice the chart looks as before: horizontal bars, the values as measured, half width and medium height. The width and height set here are everyone’s; each viewer may still resize a chart for themselves.</Info></legend>
    {type === 'bar' && <label>Orientation
      <select aria-label="Orientation" value={options.orientation ?? 'horizontal'} onChange={(event) => set({ orientation: event.target.value === 'vertical' ? 'vertical' : undefined })}>
        <option value="horizontal">Horizontal bars{insight.second ? ' (stacked)' : ''}</option>
        <option value="vertical">Vertical columns{insight.second ? ' (stacked)' : ''}</option>
      </select>
    </label>}
    {/* CHT-40: with a second field, the series stacked (as before) or grouped side by side (Excel's clustered bars). */}
    {type === 'bar' && insight.second && <label>Series
      <select aria-label="Series" value={options.grouping ?? 'stacked'} onChange={(event) => set({ grouping: event.target.value === 'grouped' ? 'grouped' : undefined })}>
        <option value="stacked">Stacked</option>
        <option value="grouped">Grouped (side by side)</option>
      </select>
      <small>{options.grouping === 'grouped' ? 'One bar per value side by side: any measure (Average, Minimum, Maximum too).' : 'Stacked bars add their parts up: Count of rows or Sum only.'}</small>
    </label>}
    {(type === 'bar' || type === 'line') && <label className="check" title={adds ? undefined : notAdditive}><input type="checkbox" disabled={!adds} checked={Boolean(options.cumulative)} onChange={(event) => set({ cumulative: event.target.checked || undefined })} />Running total</label>}
    {(type === 'bar' || type === 'line' || type === 'table') && <label className="check" title={adds ? undefined : notAdditive}><input type="checkbox" disabled={!adds} checked={Boolean(options.percent)} onChange={(event) => set({ percent: event.target.checked || undefined })} />Percent of total</label>}
    {(type === 'bar' || type === 'line' || type === 'table') && !adds && <small>{notAdditive}</small>}
    {(type === 'bar' || type === 'line' || type === 'pareto') && <div className="form-row">
      <label>Target line (optional)<input aria-label="Target line value" type="number" inputMode="decimal" value={targetText} placeholder="e.g. 1000" onChange={(event) => setTarget(event.target.value)} /></label>
      <label>Its label (optional)<input aria-label="Target line label" maxLength={40} value={options.target?.label ?? ''} disabled={!options.target} title={options.target ? undefined : 'Give the target a value first.'} placeholder="e.g. Budget" onChange={(event) => setTarget(targetText, event.target.value)} /></label>
    </div>}
    {/* CHT-36: a KPI as a card in the Insights tab's card row (the default) or as a chart panel. */}
    {type === 'kpi' && scope === 'page' && <label>Show as
      <select aria-label="Show as" value={options.view ?? 'card'} onChange={(event) => set({ view: event.target.value === 'panel' ? 'panel' : undefined })}>
        <option value="card">Card (in the row of KPI cards)</option>
        <option value="panel">Panel (a chart panel)</option>
      </select>
    </label>}
    {/* CHT-15, CHT-16: the owner's size for everyone (each viewer may still resize the chart for themselves). */}
    {type === 'kpi' && scope === 'page' && options.view !== 'panel' ? <small>A card sits in the row of KPI cards above the charts until it is moved; its size is set with Size… in its ⋯ menu, in Arrange charts or with its corner handle.</small> : <SizeFields size={current} kind={gridKind} heightReason={type === 'kpi' || type === 'table' ? 'A KPI or a summary table takes the height of its content.' : ''}
      onChange={(size) => onOptions(cleanOptions(type, insight.measure, withSizeOptions(options, size, factoryOf(gridKind), Boolean(options.size) || size.h === current.h, gridKind)))} />}
    {values.length > 0 && <div className="od-colors" role="group" aria-label={`Colours of ${colored!.name}`}>
      <small>Colours of “{colored!.name}” — the same in every chart of this {scope}; “Default” keeps the palette order. Colour 1…5 follow the light and dark theme; an own colour (the picker or #rrggbb) is the same in both.</small>
      {values.slice(0, 40).map((value) => <ColorPick key={value} value={value} pin={pins?.[value]} onPin={(slot) => pin(value, slot)} />)}
    </div>}
  </fieldset>
}

// CHT-09, CHT-41 One value's colour: Default, a palette colour (Colour 1…5, the presets) or an own colour — the picker
// or a #rrggbb typed in (only hex digits are taken); a colour with less than 3:1 against the chart background in the
// light or dark theme is kept with a warning (WCAG non-text contrast), never refused.
function ColorPick({ value, pin, onPin }: { value: string; pin: ColorPin | undefined; onPin: (pin: ColorPin | 0) => void }) {
  const hex = pin == null ? '' : pinHex(pin)
  const custom = typeof pin === 'string'
  const [text, setText] = useState(custom ? pin : '')
  const [bad, setBad] = useState(false)
  const warning = custom ? contrastWarning(pin) : ''
  const choose = (next: string) => { const color = normalizeHex(next); setText(next); setBad(Boolean(next.trim()) && !color && (/[^#0-9a-f]/i.test(next.trim()) || next.trim().replace(/^#/, '').length >= 6)); if (color) onPin(color) }
  const pick = (next: string) => {
    if (next === 'custom') { const start = hex || pinHex(1); setText(start); onPin(start); return }
    setText(''); setBad(false); onPin(Number(next))
  }
  return <div className="od-color">
    <i style={{ background: pin == null ? 'transparent' : pinColor(pin) }} aria-hidden="true" /><span title={value}>{value}</span>
    <span className="od-color-pick">
      <select aria-label={`Colour of ${value}`} value={custom ? 'custom' : String(pin ?? 0)} onChange={(event) => pick(event.target.value)}>
        <option value={0}>Default</option>
        {Array.from({ length: paletteSize }, (_, index) => <option key={index} value={index + 1}>Colour {index + 1}</option>)}
        <option value="custom">Own colour…</option>
      </select>
      <input type="color" aria-label={`Pick a colour for ${value}`} value={hex || pinHex(1)} onChange={(event) => choose(event.target.value)} />
      <input className="od-color-hex" aria-label={`#rrggbb for ${value}`} aria-invalid={bad || undefined} maxLength={7} spellCheck={false} placeholder="#rrggbb" value={custom || bad ? text : ''} onChange={(event) => choose(event.target.value)} />
    </span>
    {bad && <small className="field-error od-color-note">Type a colour as #rrggbb (six hex digits, e.g. #1f77b4).</small>}
    {warning && <small className="od-color-warn od-color-note" role="status">{warning}</small>}
  </div>
}

// CHT-34 The "Chart elements" group (the editor's Elements tab, CHT-70), modelled on Excel's Chart Elements: chart heading (Excel's
// Chart Title), axes, axis names (Axis Titles — named so as not to clash with the pop-up's Title field), data labels (on / off for everyone, position, contents, number format), data table, gridlines, legend and
// trendline — only those the chart type takes; each control shows today's look until the owner changes it.
function ElementsFields({ kind, stacked, percent, money, elements, names, onChange }: { kind: ChartKind; stacked: boolean; percent: boolean; money: boolean; elements: ChartElements | undefined; names: ReactNode; onChange: (elements: ChartElements | undefined) => void }) {
  const el = resolveElements(kind, elements, { stacked, percent })
  const type = kind === 'column' || kind === 'bar' ? 'bar' : kind
  const scope = { orientation: kind === 'column' ? 'vertical' as const : undefined, percent: percent ? true as const : undefined }
  const put = <K extends keyof ChartElements>(key: K, value: ChartElements[K] | undefined) => onChange(withElement(type, scope, elements, key, value))
  const axes = kind !== 'pie'
  const positions = labelPositions(kind, stacked)
  const contents = contentsFor(kind, percent)
  const check = (label: string, on: boolean, change: (on: boolean) => void, hint?: string) => <label className="check" title={hint}><input type="checkbox" checked={on} onChange={(event) => change(event.target.checked)} />{label}</label>
  const toggle = (key: 'title' | 'axisX' | 'axisY' | 'titleX' | 'titleY') => (on: boolean) => put(key, on ? undefined : false)
  const setContent = (entry: LabelContent, on: boolean) => { const next = contents.filter((item) => item === entry ? on : el.content.includes(item)); put('content', next.length ? next : defaultContent(kind, percent)) }
  const setGrid = (line: Gridline, on: boolean) => put('gridlines', gridlineKeys.filter((key) => key === line ? on : el.grid[key]))
  return <fieldset className="od-elements"><legend>Chart elements <Info label="Chart elements">As Excel’s Chart Elements, the same for everyone who sees the chart. Without a change the chart looks as before. Each viewer may still switch Data labels on or off for themselves with the box above the chart; the position, contents and number format are the ones set here. A label that does not fit is left out (its value is in the tooltip, the Table view and the data table).</Info></legend>
    {check('Chart heading', el.title, toggle('title'), 'Excel’s Chart Title: the chart’s name above it (still read out by screen readers when hidden)')}
    {axes && <div className="od-elements-row" role="group" aria-label="Axes"><span>Axes</span>
      {check('Horizontal axis', el.axisX, toggle('axisX'))}
      {check('Vertical axis', el.axisY, toggle('axisY'))}
    </div>}
    {axes && <div className="od-elements-row" role="group" aria-label="Axis names"><span>Axis names (Excel’s axis titles)</span>
      {check('Horizontal axis name', el.titleX, toggle('titleX'))}
      {check('Vertical axis name', el.titleY, toggle('titleY'))}
    </div>}
    {names}
    <label>Data labels
      <select aria-label="Data labels" value={el.labels == null ? '' : el.labels ? 'on' : 'off'} onChange={(event) => put('labels', event.target.value === '' ? undefined : event.target.value === 'on')}>
        <option value="">As each viewer chooses (off unless they turn them on)</option>
        <option value="on">On for everyone</option>
        <option value="off">Off for everyone</option>
      </select>
      <small>Each viewer can still switch them on or off for themselves.</small>
    </label>
    <div className="form-row">
      <label>Label position
        <select aria-label="Label position" value={el.position} onChange={(event) => put('position', event.target.value === defaultPosition(kind, stacked) ? undefined : event.target.value as LabelPosition)}>
          {positions.map((position) => <option key={position} value={position}>{positionLabels[position]}{position === defaultPosition(kind, stacked) ? ' (as before)' : ''}</option>)}
        </select>
      </label>
      <label>Number format
        <select aria-label="Number format" value={el.decimals == null ? '' : String(el.decimals)} onChange={(event) => put('decimals', event.target.value === '' ? undefined : Number(event.target.value) as 0 | 1 | 2)}>
          <option value="">Automatic (as before)</option>
          <option value="0">1,235 (no decimals)</option>
          <option value="1">1,234.6 (1 decimal)</option>
          <option value="2">1,234.56 (2 decimals)</option>
        </select>
      </label>
    </div>
    <div className="od-elements-row" role="group" aria-label="Label contains"><span>Label contains</span>
      {contents.map((entry) => <label key={entry} className="check"><input type="checkbox" checked={el.content.includes(entry)} disabled={el.content.length === 1 && el.content[0] === entry} title={el.content.length === 1 && el.content[0] === entry ? 'A label shows at least one thing.' : undefined} onChange={(event) => setContent(entry, event.target.checked)} />{contentLabels[entry]}</label>)}
      {money && check('Currency code', el.code, (on) => put('code', on || undefined))}
    </div>
    {axes && check('Data table (the numbers under the chart)', el.dataTable, (on) => put('dataTable', on || undefined))}
    {axes && <div className="od-elements-row" role="group" aria-label="Gridlines"><span>Gridlines</span>
      {gridlineKeys.map((line) => <label key={line} className="check"><input type="checkbox" checked={el.grid[line]} onChange={(event) => setGrid(line, event.target.checked)} />{gridlineLabels[line]}{defaultGridlines(kind).includes(line) ? ' (as before)' : ''}</label>)}
    </div>}
    <div className="form-row">
      <label>Legend
        <select aria-label="Legend" value={el.legend} onChange={(event) => put('legend', event.target.value === defaultLegend(kind) ? undefined : event.target.value as LegendPosition)}>
          {legendPositions.map((position) => <option key={position} value={position}>{legendLabels[position]}{position === defaultLegend(kind) ? ' (as before)' : ''}</option>)}
        </select>
      </label>
      {trendlineFor(kind) && <label>Trendline
        <select aria-label="Trendline" value={el.trendline ? 'linear' : ''} onChange={(event) => put('trendline', event.target.value === 'linear' ? 'linear' : undefined)}>
          <option value="">None</option>
          <option value="linear">Linear (one per series)</option>
        </select>
      </label>}
    </div>
  </fieldset>
}
