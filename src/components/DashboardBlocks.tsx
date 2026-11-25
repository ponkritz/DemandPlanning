import { useId, useState, type ReactNode } from 'react'
import { pairFactory, type ChartSize, type SizeSource } from '../chartSize'
import { ChartPanel } from './ChartSize'
import { readChartLabels, saveChartLabel } from '../chartLabels'
import { DataTable, type DataColumn } from './DataTable'
import { ChartOptionsFields } from './ChartOptionsFields'
import { PreviewHeading } from './ChartElements'
import { ChartCountInfo, InsightView } from './InsightCharts'
import { EmptyState, Info, Metric, Modal, Notice, Pill } from './ui'
import { hasOptions, insightKindOf as kindOf, narrativeError, type ColorPins, type InsightFilter, type InsightMeasure } from '../onDemand'
import { narrativeInfo } from '../narratives'
import { NarrativeFields } from './NarrativeFields'
import { EditorTabs } from './EditorTabs'
import { coloredColumnOf, editorCounts, editorTabLabels, editorTabsFor, filterError, firstErrorTab, panelId, splitProblems, tabId, type EditorTab } from '../chartEditor'
import { currencyText, formatShown, insightRules, measureColumns, measuresFor, noneKey, noneLabel, secondLabel, valueText } from '../onDemandInsights'
import { asInsight, noData, blockData, blockDataset, isToolSource, withStatusShown, blockError, blockProblems, blockSubject, blockTypeLabel, blockTypes, categoryColumns, filterColumns, kpiText, kpiValue, periodColumns, periodNote, secondColumns, summaryExportTotals, summaryRows, tableLimit, withBlockType, withSource, type Dashboard, type DashboardBlock, type Dataset, type Narrowed, type SummaryRow } from '../dashboardPages'

// DSH-05, DSH-06 The blocks of a Dashboard page: a KPI tile (Metric, UI-STANDARDS §9), a bar, line or pie chart — the
// On-Demand insight charts in the shared chart frame (OND-12: legend, Data labels, Table / Chart) — and a summary table
// in the shared table (largest first, the first 10 rows, Show all, Export). Empty: "No data for this selection.".

const filtersText = (dataset: Dataset, filters: InsightFilter[]) => filters.length ? filters.map((filter) => `${dataset.page.columns.find((column) => column.id === filter.column)?.name ?? '(removed column)'}: ${[...(filter.values ?? []).map((value) => value === noneKey ? noneLabel : value), filter.from || filter.to ? `${filter.from ?? '…'} – ${filter.to ?? '…'}` : ''].filter(Boolean).join(', ')}`).join(' · ') : ''
function counted(narrowed: Narrowed) {
  const parts = [narrowed.byPeriod && narrowed.outside ? `${narrowed.outside} outside the period` : '', narrowed.noDate ? `${narrowed.noDate} without a date for the period` : '', narrowed.filtered ? `${narrowed.filtered} filtered out` : ''].filter(Boolean)
  return `${narrowed.page.rows.length} of ${narrowed.all} row${narrowed.all === 1 ? '' : 's'}${parts.length ? ` (${parts.join(', ')})` : ''}`
}

// A KPI tile: the number, what it measures, the period line; "Open {tab} →" when the dashboard has tabs.
export function KpiTile({ dataset, block, narrowed, tabName, onOpenTab }: { dataset: Dataset; block: DashboardBlock; narrowed: Narrowed | null; tabName?: string; onOpenTab?: () => void }) {
  const [currency, setCurrency] = useState('')
  const problems = narrowed ? blockProblems(dataset, block) : [dataset.problem ?? '']
  if (problems.length || !narrowed) return <Metric label={block.title} value="—" hint={<span className="dsh-problem">Cannot be shown: {problems.join(' ')}</span>} />
  const value = kpiValue(narrowed.page, block, currency)
  return <Metric label={block.title} value={narrowed.page.rows.length || block.measure === 'count' ? kpiText(value) : '—'} hint={<>
    <span>{blockSubject(dataset, block, value.currency)} · {narrowed.page.rows.length ? counted(narrowed) : noData.title}</span>
    {value.currencies.length > 1 && <label className="od-currency-pick">Currency<select aria-label={`Currency of ${block.title}`} value={value.currency} onChange={(event) => setCurrency(event.target.value)}>{value.currencies.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} ({entry.rows} row{entry.rows === 1 ? '' : 's'})</option>)}</select></label>}
    {tabName && onOpenTab && <button type="button" className="text-button" aria-label={`Open the tab ${tabName} (${block.title})`} onClick={onOpenTab}>Open {tabName} →</button>}
  </>} />
}

// A chart or a summary table in its panel. CHT-15…CHT-18: its size (the viewer's own, else the owners', else half
// width and medium height), the corner handle and — for the dashboard's builders — its ⋯ menu (DSH-13).
export function BlockPanel({ id, dataset, block, narrowed, colors, size = pairFactory, source = 'factory', arranging = false, action, onResize, onReset }: { id?: string; dataset: Dataset; block: DashboardBlock; narrowed: Narrowed | null; colors?: ColorPins; size?: ChartSize; source?: SizeSource; arranging?: boolean; action?: ReactNode; onResize?: (size: ChartSize) => void; onReset?: () => void }) {
  const filters = filtersText(dataset, block.filters)
  const problems = narrowed ? blockProblems(dataset, block) : [dataset.problem ?? '']
  // CHT-25: the header shows the title and ⓘ only; what the block measures, its period, filters and rows counted are in ⓘ,
  // and a neutral "Filtered" says when its own filters or the filter row's choices narrow it.
  const filteredBy = [block.filters.length ? `its own filters: ${filters}` : '', narrowed?.filtered ? 'the filter row above' : ''].filter(Boolean).join('; ').replace(/^./, (first) => `Filtered by ${first}`)
  const pill = filteredBy ? <span className="chart-filtered" title={filteredBy} aria-label={filteredBy}><Pill>Filtered</Pill></span> : null
  return <ChartPanel id={id} kind={kindOf(block.type)} className={`od-insight dsh-block dsh-block-${block.type}`} size={size} source={source} arranging={arranging} title={block.title} titleHidden={block.options?.elements?.title === false}
    info={problems.length || !narrowed ? undefined : <ul className="od-rules"><li>Type: {blockTypeLabel(block.type)} · from {dataset.name}.</li><li>{blockSubject(dataset, block)}.</li><li>{periodNote(dataset, block)}.</li><li>Its own filters: {filters || 'none'}.</li><li>Rows: {counted(narrowed)}.</li>{block.type !== 'table' && <ChartCountInfo page={narrowed.page} insight={asInsight(block)} />}{(block.type === 'narrative' ? narrativeInfo(narrowed.page, asInsight(block)) : insightRules(narrowed.page, asInsight(block))).map((entry) => <li key={entry}>{entry}</li>)}<li>The period (Year / Quarter / Month above) keeps the rows whose {dataset.page.columns.find((column) => column.id === block.period)?.name ?? 'date'} falls in it; rows without that date are left out.</li></ul>}
    action={pill || action ? <span className="button-row nowrap">{pill}{action}</span> : undefined} onResize={onResize} onReset={onReset}>
    <BlockBody dataset={dataset} block={block} narrowed={narrowed} problems={problems} colors={colors} />
  </ChartPanel>
}
function BlockPreviewBody(props: { dataset: Dataset; block: DashboardBlock; narrowed: Narrowed | null; problems: string[]; colors?: ColorPins }) { return <BlockBody {...props} drill={false} quiet /> }
function BlockBody({ dataset, block, narrowed, problems, colors, drill = true, quiet = drill }: { dataset: Dataset; block: DashboardBlock; narrowed: Narrowed | null; problems: string[]; colors?: ColorPins; drill?: boolean; quiet?: boolean }) {
  // DSH-06: a dashboard chart starts with its data labels on (UI-17 keeps the viewer's own choice per chart): the choice is
  // set through the shared chart-labels helper once, before the chart reads it — the insight charts stay as they are.
  // CHT-28: not when the block's builders set data labels on or off for everyone (their choice is the default then).
  useState(() => { if (block.type !== 'table' && block.options?.elements?.labels === undefined && readChartLabels()[`ondemand-${block.id}`] === undefined) saveChartLabel(`ondemand-${block.id}`, true); return true })
  if (problems.length || !narrowed) return <Notice tone="warning"><strong>This block cannot be shown:</strong> {problems.join(' ')} {dataset.problem ? '' : 'Its owners edit it to choose the columns again, or remove it.'}</Notice>
  const probe = blockData(narrowed.page, block)
  if (!narrowed.page.rows.length || !probe.categories.length) return <EmptyState {...noData} />
  return block.type === 'table' ? <SummaryTable block={block} narrowed={narrowed} /> : <InsightView quiet={quiet} page={narrowed.page} insight={asInsight(block)} colors={colors} drill={drill} compare={narrowed.base} />
}

// DSH-06: the summary table — largest first, the first 10 rows with Show all, the shared table's Export (every row).
function SummaryTable({ block, narrowed }: { block: DashboardBlock; narrowed: Narrowed }) {
  const [all, setAll] = useState(false)
  const [currency, setCurrency] = useState('')
  const data = blockData(narrowed.page, block, currency)
  const rows = summaryRows(data)
  const page = narrowed.page
  const split = Boolean(block.second)
  const measure = valueText(page, asInsight(block), data.currency)
  const show = (value: number | null) => formatShown(value, data.unit)
  const category = page.columns.find((column) => column.id === block.category)?.name ?? 'Category'
  const columns: DataColumn<SummaryRow>[] = [
    { id: 'dsh-category', label: `${category}${block.type === 'table' && page.columns.find((column) => column.id === block.category)?.type === 'date' ? ' (month)' : ''}`, sortable: false, value: (row) => row.label },
    ...(split ? data.series.map((ser, at): DataColumn<SummaryRow> => ({ id: `dsh-s${at}`, label: ser.label || noneLabel, align: 'right', sortable: false, value: (row) => row.values[at] ?? '', render: (row) => show(row.values[at]) })) : []),
    { id: 'dsh-total', label: split ? 'Total' : measure, align: 'right', sortable: false, value: (row) => row.total ?? '', render: (row) => show(row.total) },
  ]
  const more = rows.length - tableLimit
  return <>
    {data.currencies.length > 1 && <label className="od-currency-pick">Currency<select aria-label={`Currency of ${block.title}`} value={data.currency} onChange={(event) => setCurrency(event.target.value)}>{data.currencies.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} ({entry.rows} row{entry.rows === 1 ? '' : 's'})</option>)}</select></label>}
    {currencyText(data) && <p className="muted">{currencyText(data)}</p>}
    <DataTable id={`dashboard-block:${block.id}`} columns={columns} rows={rows} rowKey={(row) => row.key} exportName={block.title} limit={all ? undefined : tableLimit}
      status={`${Math.min(rows.length, all ? rows.length : tableLimit)} of ${rows.length} row${rows.length === 1 ? '' : 's'}`}
      totals={{ label: 'Total', values: { ...Object.fromEntries(split ? data.seriesTotals.map((value, at) => [`dsh-s${at}`, show(value)]) : []), 'dsh-total': show(data.total) }, exportValues: summaryExportTotals(data, split) }} />
    {(more > 0 || all) && <button type="button" className="text-button" onClick={() => setAll(!all)}>{all ? 'Show the first 10' : `Show all (+${more} more)`}</button>}
    {data.rows.multi && block.measure !== 'average' && <p className="muted od-pivot-note">A row with several values of a Multi-select counts in each of them; the totals take each row once.</p>}
  </>
}

// DSH-05: the pop-up of one block — title, type, data source, the fields, the measure, the period's Date column, the
// tab, filters — with a live preview over the current period. Add block / Save to Git saves the dashboard at once.
// CHT-70…CHT-73: the form in the chart editor's tabs, as the Insights pop-up (the data source, the period's Date column
// and the dashboard tab on Data). MYD-14: saveNote / saveLabel — where the block is kept and the save button, for My dashboard's personal blocks.
export function BlockDialog({ datasets, dashboard, block, isNew, preview, onCancel, onSave, saveNote, saveLabel }: { datasets: Dataset[]; dashboard: Dashboard; block: DashboardBlock; isNew: boolean; preview: (dataset: Dataset, block: DashboardBlock) => Narrowed | null; onCancel: () => void; onSave: (block: DashboardBlock, colors: ColorPins | undefined) => Promise<void>; saveNote?: string; saveLabel?: string }) {
  const [draft, setDraft] = useState<DashboardBlock>(block)
  const [pins, setPins] = useState(dashboard.colors)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<EditorTab>('data')
  const [tried, setTried] = useState(false)
  const tabsId = useId()
  const source = datasets.find((entry) => entry.key === draft.source) ?? datasets[0]
  // TVL-26: with "Show expiry status" off, the Tool Validations source without Status and Days left.
  const dataset = blockDataset(source, draft)
  const page = dataset.page
  const edit = (change: Partial<DashboardBlock>) => { setDraft({ ...draft, ...change }); setError('') }
  const setFilter = (index: number, change: Partial<InsightFilter>) => edit({ filters: draft.filters.map((filter, at) => at === index ? { ...filter, ...change } : filter) })
  const filterable = filterColumns(page)
  const chart = draft.type === 'kpi' || draft.type === 'narrative' ? null : draft.type
  const narrative = draft.type === 'narrative'
  const categories = chart ? categoryColumns(page, chart) : []
  const seconds = chart ? secondColumns(page, chart).filter((column) => column.id !== draft.category) : []
  const numbers = measureColumns(page, draft.measure)
  const dates = periodColumns(page)
  const tabs = editorTabsFor(draft.type, 'dashboard')
  const shownTab = tabs.includes(tab) ? tab : 'data'
  const errors = blockTabErrors(dataset, draft, tabs)
  const asDraft = asInsight(draft)
  const colored = page.columns.find((column) => column.id === coloredColumnOf(asDraft))
  const counts = editorCounts(asDraft, pins, colored && hasOptions(colored.type) ? colored.options : [], 'dashboard')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setTried(true)
    const first = firstErrorTab(tabs, errors)
    const problem = first ? errors[first]! : blockError(dataset, draft)
    if (problem) { setError(problem); setTab(first ?? 'data'); document.getElementById(tabId(tabsId, first ?? 'data'))?.focus(); return }
    setBusy(true); setError('')
    try { await onSave({ ...draft, title: draft.title.trim().replace(/\s+/g, ' ') }, pins) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  const shown = { ...draft, filters: draft.filters.filter((filter) => filter.values?.length || filter.from || filter.to) }
  const narrowed = dataset.problem ? null : preview(dataset, shown)
  const categoryLabel = draft.type === 'line' ? 'Months of' : draft.type === 'table' ? 'Rows by' : 'Categories by'
  const onOptions = (options: DashboardBlock['options']) => { const next = { ...draft }; if (options && draft.type !== 'kpi') next.options = options; else delete next.options; setDraft(next); setError('') }
  const onNarrative = (next: ReturnType<typeof asInsight>) => { const out: DashboardBlock = { ...draft, category: next.category }; if (next.narrative) out.narrative = next.narrative; if (next.options) out.options = next.options; else delete out.options; setDraft(out); setError('') }
  const panels: Record<EditorTab, () => ReactNode> = {
    data: () => <>
      <label>Title<input aria-label="Title" required maxLength={120} value={draft.title} placeholder="e.g. Cost by category" onChange={(event) => edit({ title: event.target.value })} /></label>
      <fieldset className="od-types"><legend>Type</legend>
        {blockTypes.map((type) => <label key={type.key} className="check" title={type.hint}><input type="radio" name="block-type" checked={draft.type === type.key} onChange={() => { setDraft(withBlockType(dataset, draft, type.key)); setError('') }} />{type.label}</label>)}
        <small>{blockTypes.find((type) => type.key === draft.type)?.hint}</small>
      </fieldset>
      <label>Data source
        <select aria-label="Data source" value={draft.source} onChange={(event) => { const next = datasets.find((entry) => entry.key === event.target.value); if (next) { setDraft(withSource(next, draft)); setError('') } }}>
          {datasets.map((entry) => <option key={entry.key} value={entry.key} disabled={Boolean(entry.problem) && entry.key !== draft.source}>{entry.name}{entry.problem ? ' (not available)' : ` (${entry.kind ?? 'table page'})`}</option>)}
        </select>
        <small>{dataset.problem || dataset.note || `The rows of ${dataset.name} as saved in Git (${page.rows.length} row${page.rows.length === 1 ? '' : 's'}).`}</small>
      </label>
      {isToolSource(draft.source) && !source.problem && <div className="dsh-status-toggle">
        <label className="check"><input type="checkbox" checked={!draft.hideStatus} onChange={(event) => { setDraft(withStatusShown(source, draft, event.target.checked)); setError('') }} />Show expiry status</label>
        <Info iconOnly label="About the expiry status"><ul><li><strong>Status</strong> (Overdue / Due soon / No due date / OK) and <strong>Days left</strong> use the <strong>team default window of {source.statusDays ?? 60} days</strong> (Tool Validations → Setup → Team settings), the same for every viewer — not a viewer’s own window of the Expiry list.</li><li>Switched off, this block neither offers nor shows Status and Days left — in the block, its table and its drill-down. Fields on them are replaced and their filters removed.</li></ul></Info>
        <small>{draft.hideStatus ? 'Status and Days left are left out of this block.' : `Status and Days left use the team default window of ${source.statusDays ?? 60} days.`}</small>
      </div>}
      {chart && <label>{categoryLabel}
        <select aria-label={categoryLabel} value={draft.category} onChange={(event) => edit({ category: event.target.value, second: draft.second === event.target.value ? '' : draft.second })}>
          {!categories.some((column) => column.id === draft.category) && <option value={draft.category}>— Choose —</option>}
          {categories.map((column) => <option key={column.id} value={column.id}>{column.name} ({column.type === 'date' ? 'by month' : column.type === 'multi' ? 'Multi-select' : column.type === 'dropdown' ? 'Dropdown' : 'Text'})</option>)}
        </select>
      </label>}
      {/* CHT-66: a Narrative's Group by takes the place of Categories by. */}
      {narrative && <NarrativeFields part="data" page={page} insight={asDraft} onChange={onNarrative} />}
      {chart && chart !== 'pie' && chart !== 'pareto' && <label>{secondLabel(chart)} (optional)
        <select aria-label={secondLabel(chart)} value={draft.second} onChange={(event) => edit({ second: event.target.value })}>
          <option value="">— None —</option>
          {draft.second && !seconds.some((column) => column.id === draft.second) && <option value={draft.second}>(not available)</option>}
          {seconds.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
      </label>}
      <div className="form-row">
        <label>Measure
          <select aria-label="Measure" value={draft.measure} onChange={(event) => { const measure = event.target.value as InsightMeasure; const fits = measureColumns(page, measure); setDraft(withBlockType(dataset, { ...draft, measure, value: measure === 'count' ? '' : fits.some((column) => column.id === draft.value) ? draft.value : fits[0]?.id || '' }, draft.type)); setError('') }}>
            {measuresFor(draft.type).map((measure) => { const none = measure.key !== 'count' && !measureColumns(page, measure.key).length; return <option key={measure.key} value={measure.key} disabled={none}>{measure.label}{none ? measure.key === 'distinct' ? ' (needs a column other than Long text)' : ' (needs a Number or Currency column)' : ''}</option> })}
          </select>
        </label>
        {draft.measure !== 'count' && <label>{draft.measure === 'distinct' ? 'Of the column' : 'Of the Number column'}
          <select aria-label={draft.measure === 'distinct' ? 'Of the column' : 'Of the Number column'} value={draft.value} onChange={(event) => edit({ value: event.target.value })}>
            {!numbers.some((column) => column.id === draft.value) && <option value={draft.value}>— Choose —</option>}
            {numbers.map((column) => <option key={column.id} value={column.id}>{column.name}{column.type === 'currency' ? ' (Currency)' : ''}</option>)}
          </select>
        </label>}
      </div>
      {!narrative && <ChartOptionsFields part="data" page={page} insight={asDraft} pins={pins} onPins={setPins} scope="dashboard" onOptions={onOptions} />}
      {(draft.type === 'bar' || draft.type === 'pie') && <label>Sort
        <select aria-label="Sort" value={draft.sort} onChange={(event) => edit({ sort: event.target.value === 'label' ? 'label' : 'value' })}>
          <option value="value">Largest first</option>
          <option value="label">By option order, month or name</option>
        </select>
      </label>}
      <label>Period filter on
        <select aria-label="Period filter on" value={draft.period} onChange={(event) => edit({ period: event.target.value })}>
          <option value="">— Not filtered by the period —</option>
          {draft.period && !dates.some((column) => column.id === draft.period) && <option value={draft.period}>(not available)</option>}
          {dates.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
        <small>The Date column the dashboard’s Year / Quarter / Month filter keeps the rows by.</small>
      </label>
      {dashboard.tabs.length > 0 && <label>{draft.type === 'kpi' ? 'Opens the tab' : 'On the tab'}
        <select aria-label={draft.type === 'kpi' ? 'Opens the tab' : 'On the tab'} value={draft.tab || dashboard.tabs[0].id} onChange={(event) => edit({ tab: event.target.value === dashboard.tabs[0].id ? '' : event.target.value })}>
          {dashboard.tabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.name}</option>)}
        </select>
      </label>}
    </>,
    filters: () => <fieldset className="od-filters"><legend>Filters (optional) <Info label="Filters">Only the rows that pass every filter are counted. A Dropdown / Multi-select filter keeps the rows with any of the ticked values (“{noneLabel}”: no value or one not in the list); a Date filter keeps the rows whose date is in the months from / to. They apply on top of the period and the filter row.</Info></legend>
      {draft.filters.map((filter, index) => {
        const column = page.columns.find((entry) => entry.id === filter.column)
        return <div key={index} className="od-filter">
          <div className="od-filter-head">
            <select aria-label={`Filter ${index + 1} column`} value={filter.column} onChange={(event) => setFilter(index, { column: event.target.value, values: undefined, from: undefined, to: undefined })}>
              {!column && <option value={filter.column}>(removed column)</option>}
              {filterable.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
            <button type="button" className="text-button danger-text" aria-label={`Remove filter ${index + 1}`} onClick={() => edit({ filters: draft.filters.filter((_, at) => at !== index) })}>✕</button>
          </div>
          {column && hasOptions(column.type) && <div className="od-multi">{[...column.options, noneKey].map((option) => <label key={option || '(none)'} className="check"><input type="checkbox" checked={filter.values?.includes(option) ?? false} onChange={(event) => setFilter(index, { values: event.target.checked ? [...(filter.values ?? []), option] : (filter.values ?? []).filter((entry) => entry !== option) })} />{option || noneLabel}</label>)}</div>}
          {column?.type === 'date' && <div className="form-row">
            <label>From (optional)<input type="month" aria-label={`Filter ${index + 1} from month`} value={filter.from ?? ''} onChange={(event) => setFilter(index, { from: event.target.value || undefined })} /></label>
            <label>To (optional)<input type="month" aria-label={`Filter ${index + 1} to month`} value={filter.to ?? ''} onChange={(event) => setFilter(index, { to: event.target.value || undefined })} /></label>
          </div>}
        </div>
      })}
      <button type="button" className="text-button" disabled={!filterable.length || draft.filters.length >= 10} title={filterable.length ? undefined : 'Filters need a Dropdown, Multi-select or Date column.'} onClick={() => edit({ filters: [...draft.filters, { column: filterable[0].id }] })}>＋ Add filter</button>
    </fieldset>,
    format: () => <ChartOptionsFields part="format" page={page} insight={asDraft} pins={pins} onPins={setPins} scope="dashboard" onOptions={onOptions} />,
    elements: () => <ChartOptionsFields part="elements" page={page} insight={asDraft} pins={pins} onPins={setPins} scope="dashboard" onOptions={onOptions} />,
    // CHT-66: a Narrative's own fields — the period, the sentences and rules, the width.
    narrative: () => <NarrativeFields part="narrative" page={page} insight={asDraft} onChange={onNarrative} />,
  }
  return <Modal eyebrow="DASHBOARD · BLOCK" title={isNew ? 'Add a block' : 'Edit the block'} wide onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)} className="od-insight-form" noValidate>
      <div className="od-insight-editor">
        <div className="od-insight-fields">
          <EditorTabs id={tabsId} label="Block settings" current={shownTab} onChoose={setTab} tabs={tabs.map((key) => ({ key, label: editorTabLabels[key], count: counts[key], error: tried ? errors[key] : undefined }))} />
          <div className="od-tab-panel" role="tabpanel" id={panelId(tabsId, shownTab)} aria-label={editorTabLabels[shownTab]}>{panels[shownTab]()}</div>
        </div>
        <section className="od-insight-preview" aria-label="Preview">
          <p className="eyebrow">PREVIEW · THE PERIOD ABOVE</p>
          {/* KB-86: the preview's header is the block's own — its title and ⓘ, "Filtered" when its filters narrow it. */}
          {draft.type === 'kpi' ? <div className="metric-grid compact od-kpi-cards"><KpiTile dataset={dataset} block={{ ...shown, title: shown.title || 'Untitled' }} narrowed={narrowed} /></div>
            : <><PreviewHeading title={draft.title.trim() || 'Untitled'} hidden={draft.options?.elements?.title === false} info={<>{blockSubject(dataset, draft)}. {periodNote(dataset, draft)}.</>} filtered={shown.filters.length > 0} />
              <BlockPreviewBody dataset={dataset} block={shown} narrowed={narrowed} colors={pins} problems={narrowed ? blockProblems(dataset, shown) : [dataset.problem ?? '']} /></>}
        </section>
      </div>
      <div className="od-editor-footer">
        {error && <Notice tone="error">{error}</Notice>}
        <p className="muted">{saveNote ?? `Saved to Git for everyone at once (dashboards/${dashboard.id}.json).`}</p>
        <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? saveLabel ? 'Saving…' : 'Saving to Git…' : isNew ? 'Add block' : saveLabel ?? 'Save to Git'}</button></div>
      </div>
    </form>
  </Modal>
}

// CHT-72: the error of each tab of the block pop-up (blockError, split by tab): the title, the data source and the
// columns on Data, the block's own filters on Filters, the sentences and rules on Narrative.
function blockTabErrors(dataset: Dataset, block: DashboardBlock, tabs: EditorTab[]): Partial<Record<EditorTab, string>> {
  // What blockError finds without the block's own filters and sentences is the Data tab's.
  const { narrative, ...plain } = block
  const split = splitProblems(blockProblems(dataset, block), blockProblems(dataset, { ...block, filters: [] }))
  const errors: Partial<Record<EditorTab, string>> = {
    data: blockError(dataset, { ...plain, filters: [] }),
    filters: filterError(block.filters, (id) => dataset.page.columns.find((column) => column.id === id)?.name ?? '?') || (dataset.problem ? '' : split.filters),
    narrative: block.type === 'narrative' ? narrativeError(narrative, Boolean(block.category)) : '',
  }
  for (const key of Object.keys(errors) as EditorTab[]) if (!tabs.includes(key) && errors[key]) { errors.data ||= errors[key]; delete errors[key] }
  return errors
}
