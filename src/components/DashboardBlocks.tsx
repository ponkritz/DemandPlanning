import { useState } from 'react'
import { readChartLabels, saveChartLabel } from '../chartLabels'
import { DataTable, type DataColumn } from './DataTable'
import { InsightView } from './InsightCharts'
import { EmptyState, Info, Metric, Modal, Notice, Panel } from './ui'
import { hasOptions, type InsightFilter, type InsightMeasure } from '../onDemand'
import { currencyText, formatValue, insightRules, measureText, measures, noneKey, noneLabel, secondLabel } from '../onDemandInsights'
import { asInsight, noData, blockData, blockError, blockProblems, blockSubject, blockTypeLabel, blockTypes, categoryColumns, filterColumns, kpiText, kpiValue, periodColumns, periodNote, secondColumns, summaryRows, tableLimit, valueColumns, withBlockType, withSource, type Dashboard, type DashboardBlock, type Dataset, type Narrowed, type SummaryRow } from '../dashboardPages'

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

// A chart or a summary table in its panel.
export function BlockPanel({ dataset, block, narrowed }: { dataset: Dataset; block: DashboardBlock; narrowed: Narrowed | null }) {
  const filters = filtersText(dataset, block.filters)
  const problems = narrowed ? blockProblems(dataset, block) : [dataset.problem ?? '']
  return <Panel className={`od-insight dsh-block dsh-block-${block.type}`} eyebrow={`${blockTypeLabel(block.type).toUpperCase()} · ${dataset.name.toUpperCase()}`} title={block.title}
    detail={<><span>{blockSubject(dataset, block)}</span><br /><span className="od-insight-filters">{periodNote(dataset, block)}{filters ? ` · Filters: ${filters}` : ''}{narrowed ? ` · ${counted(narrowed)}` : ''}</span></>}
    info={problems.length || !narrowed ? undefined : <ul className="od-rules">{insightRules(narrowed.page, asInsight(block)).map((line) => <li key={line}>{line}</li>)}<li>The period (Year / Quarter / Month above) keeps the rows whose {dataset.page.columns.find((column) => column.id === block.period)?.name ?? 'date'} falls in it; rows without that date are left out.</li></ul>}>
    <BlockBody dataset={dataset} block={block} narrowed={narrowed} problems={problems} />
  </Panel>
}
function BlockBody({ dataset, block, narrowed, problems }: { dataset: Dataset; block: DashboardBlock; narrowed: Narrowed | null; problems: string[] }) {
  // DSH-06: a dashboard chart starts with its data labels on (UI-17 keeps the viewer's own choice per chart): the choice is
  // set through the shared chart-labels helper once, before the chart reads it — the insight charts stay as they are.
  useState(() => { if (block.type !== 'table' && readChartLabels()[`ondemand-${block.id}`] === undefined) saveChartLabel(`ondemand-${block.id}`, true); return true })
  if (problems.length || !narrowed) return <Notice tone="warning"><strong>This block cannot be shown:</strong> {problems.join(' ')} {dataset.problem ? '' : 'Its owners edit it to choose the columns again, or remove it.'}</Notice>
  const probe = blockData(narrowed.page, block)
  if (!narrowed.page.rows.length || !probe.categories.length) return <EmptyState {...noData} />
  return block.type === 'table' ? <SummaryTable block={block} narrowed={narrowed} /> : <InsightView page={narrowed.page} insight={asInsight(block)} />
}

// DSH-06: the summary table — largest first, the first 10 rows with Show all, the shared table's Export (every row).
function SummaryTable({ block, narrowed }: { block: DashboardBlock; narrowed: Narrowed }) {
  const [all, setAll] = useState(false)
  const [currency, setCurrency] = useState('')
  const data = blockData(narrowed.page, block, currency)
  const rows = summaryRows(data)
  const page = narrowed.page
  const split = Boolean(block.second)
  const measure = measureText(page, asInsight(block), data.currency)
  const category = page.columns.find((column) => column.id === block.category)?.name ?? 'Category'
  const columns: DataColumn<SummaryRow>[] = [
    { id: 'dsh-category', label: `${category}${block.type === 'table' && page.columns.find((column) => column.id === block.category)?.type === 'date' ? ' (month)' : ''}`, sortable: false, value: (row) => row.label },
    ...(split ? data.series.map((ser, at): DataColumn<SummaryRow> => ({ id: `dsh-s${at}`, label: ser.label || noneLabel, align: 'right', sortable: false, value: (row) => row.values[at] ?? '', render: (row) => formatValue(row.values[at]) })) : []),
    { id: 'dsh-total', label: split ? 'Total' : measure, align: 'right', sortable: false, value: (row) => row.total ?? '', render: (row) => formatValue(row.total) },
  ]
  const more = rows.length - tableLimit
  return <>
    {data.currencies.length > 1 && <label className="od-currency-pick">Currency<select aria-label={`Currency of ${block.title}`} value={data.currency} onChange={(event) => setCurrency(event.target.value)}>{data.currencies.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} ({entry.rows} row{entry.rows === 1 ? '' : 's'})</option>)}</select></label>}
    {currencyText(data) && <p className="muted">{currencyText(data)}</p>}
    <DataTable id={`dashboard-block:${block.id}`} columns={columns} rows={rows} rowKey={(row) => row.key} exportName={block.title} limit={all ? undefined : tableLimit}
      status={`${Math.min(rows.length, all ? rows.length : tableLimit)} of ${rows.length} row${rows.length === 1 ? '' : 's'}`}
      totals={{ label: 'Total', values: { ...Object.fromEntries(split ? data.seriesTotals.map((value, at) => [`dsh-s${at}`, formatValue(value)]) : []), 'dsh-total': formatValue(data.total) } }} />
    {(more > 0 || all) && <button type="button" className="text-button" onClick={() => setAll(!all)}>{all ? 'Show the first 10' : `Show all (+${more} more)`}</button>}
    {data.rows.multi && block.measure !== 'average' && <p className="muted od-pivot-note">A row with several values of a Multi-select counts in each of them; the totals take each row once.</p>}
  </>
}

// DSH-05: the pop-up of one block — title, type, data source, the fields, the measure, the period's Date column, the
// tab, filters — with a live preview over the current period. Add block / Save to Git saves the dashboard at once.
export function BlockDialog({ datasets, dashboard, block, isNew, preview, onCancel, onSave }: { datasets: Dataset[]; dashboard: Dashboard; block: DashboardBlock; isNew: boolean; preview: (dataset: Dataset, block: DashboardBlock) => Narrowed | null; onCancel: () => void; onSave: (block: DashboardBlock) => Promise<void> }) {
  const [draft, setDraft] = useState<DashboardBlock>(block)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dataset = datasets.find((entry) => entry.key === draft.source) ?? datasets[0]
  const page = dataset.page
  const edit = (change: Partial<DashboardBlock>) => { setDraft({ ...draft, ...change }); setError('') }
  const setFilter = (index: number, change: Partial<InsightFilter>) => edit({ filters: draft.filters.map((filter, at) => at === index ? { ...filter, ...change } : filter) })
  const filterable = filterColumns(page)
  const chart = draft.type === 'kpi' ? null : draft.type
  const categories = chart ? categoryColumns(page, chart) : []
  const seconds = chart ? secondColumns(page, chart).filter((column) => column.id !== draft.category) : []
  const numbers = valueColumns(page)
  const dates = periodColumns(page)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const problem = blockError(dataset, draft)
    if (problem) { setError(problem); return }
    setBusy(true); setError('')
    try { await onSave({ ...draft, title: draft.title.trim().replace(/\s+/g, ' ') }) } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); setBusy(false) }
  }
  const shown = { ...draft, filters: draft.filters.filter((filter) => filter.values?.length || filter.from || filter.to) }
  const narrowed = dataset.problem ? null : preview(dataset, shown)
  const categoryLabel = draft.type === 'line' ? 'Months of' : draft.type === 'table' ? 'Rows by' : 'Categories by'
  return <Modal eyebrow="DASHBOARD · BLOCK" title={isNew ? 'Add a block' : 'Edit the block'} wide onClose={() => { if (!busy) onCancel() }}>
    <form onSubmit={(event) => void submit(event)} className="od-insight-form" noValidate>
      <div className="od-insight-editor">
        <div className="od-insight-fields">
          <label>Title<input aria-label="Title" autoFocus required maxLength={120} value={draft.title} placeholder="e.g. Cost by category" onChange={(event) => edit({ title: event.target.value })} /></label>
          <fieldset className="od-types"><legend>Type</legend>
            {blockTypes.map((type) => <label key={type.key} className="check" title={type.hint}><input type="radio" name="block-type" checked={draft.type === type.key} onChange={() => { setDraft(withBlockType(dataset, draft, type.key)); setError('') }} />{type.label}</label>)}
            <small>{blockTypes.find((type) => type.key === draft.type)?.hint}</small>
          </fieldset>
          <label>Data source
            <select aria-label="Data source" value={draft.source} onChange={(event) => { const next = datasets.find((entry) => entry.key === event.target.value); if (next) { setDraft(withSource(next, draft)); setError('') } }}>
              {datasets.map((entry) => <option key={entry.key} value={entry.key} disabled={Boolean(entry.problem) && entry.key !== draft.source}>{entry.name}{entry.problem ? ' (not available)' : ' (table page)'}</option>)}
            </select>
            <small>{dataset.problem || `The rows of ${dataset.name} as saved in Git (${page.rows.length} row${page.rows.length === 1 ? '' : 's'}).`}</small>
          </label>
          {chart && <label>{categoryLabel}
            <select aria-label={categoryLabel} value={draft.category} onChange={(event) => edit({ category: event.target.value, second: draft.second === event.target.value ? '' : draft.second })}>
              {!categories.some((column) => column.id === draft.category) && <option value={draft.category}>— Choose —</option>}
              {categories.map((column) => <option key={column.id} value={column.id}>{column.name} ({column.type === 'date' ? 'by month' : column.type === 'multi' ? 'Multi-select' : column.type === 'dropdown' ? 'Dropdown' : 'Text'})</option>)}
            </select>
          </label>}
          {chart && chart !== 'pie' && <label>{secondLabel(chart)} (optional)
            <select aria-label={secondLabel(chart)} value={draft.second} onChange={(event) => edit({ second: event.target.value })}>
              <option value="">— None —</option>
              {draft.second && !seconds.some((column) => column.id === draft.second) && <option value={draft.second}>(not available)</option>}
              {seconds.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
          </label>}
          <div className="form-row">
            <label>Measure
              <select aria-label="Measure" value={draft.measure} onChange={(event) => { const measure = event.target.value as InsightMeasure; edit({ measure, value: measure === 'count' ? '' : draft.value || numbers[0]?.id || '' }) }}>
                {measures.filter((measure) => !(measure.key === 'average' && draft.type === 'pie')).map((measure) => <option key={measure.key} value={measure.key} disabled={measure.key !== 'count' && !numbers.length}>{measure.label}{measure.key !== 'count' && !numbers.length ? ' (needs a Number or Currency column)' : ''}</option>)}
              </select>
            </label>
            {draft.measure !== 'count' && <label>Of the Number column
              <select aria-label="Of the Number column" value={draft.value} onChange={(event) => edit({ value: event.target.value })}>
                {!numbers.some((column) => column.id === draft.value) && <option value={draft.value}>— Choose —</option>}
                {numbers.map((column) => <option key={column.id} value={column.id}>{column.name}{column.type === 'currency' ? ' (Currency)' : ''}</option>)}
              </select>
            </label>}
          </div>
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
          <fieldset className="od-filters"><legend>Filters (optional) <Info label="Filters">Only the rows that pass every filter are counted. A Dropdown / Multi-select filter keeps the rows with any of the ticked values (“{noneLabel}”: no value or one not in the list); a Date filter keeps the rows whose date is in the months from / to. They apply on top of the period and the filter row.</Info></legend>
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
          </fieldset>
        </div>
        <section className="od-insight-preview" aria-label="Preview">
          <p className="eyebrow">PREVIEW · THE PERIOD ABOVE</p>
          <h3>{draft.title.trim() || 'Untitled'}</h3>
          <p className="muted">{blockSubject(dataset, draft)} · {periodNote(dataset, draft)}</p>
          {draft.type === 'kpi' ? <div className="metric-grid compact"><KpiTile dataset={dataset} block={{ ...shown, title: shown.title || 'Untitled' }} narrowed={narrowed} /></div>
            : <BlockBody dataset={dataset} block={shown} narrowed={narrowed} problems={narrowed ? blockProblems(dataset, shown) : [dataset.problem ?? '']} />}
        </section>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <p className="muted">Saved to Git for everyone at once ({`dashboards/${dashboard.id}.json`}).</p>
      <div className="modal-actions"><button type="button" className="ghost" disabled={busy} onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving to Git…' : isNew ? 'Add block' : 'Save to Git'}</button></div>
    </form>
  </Modal>
}
