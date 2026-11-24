import { useMemo, useState } from 'react'
import { factoryOf, kindOf, parseGridBox, resolveChartSize, sizeFromOptions } from '../chartSize'
import { BlockPanel, KpiTile } from '../components/DashboardBlocks'
import { ChartGrid, ChartPanel } from '../components/ChartSize'
import { ThemeToggle } from '../components/Clock'
import { DataTable, type DataColumn } from '../components/DataTable'
import { ChartCountInfo, InsightView, KpiCard } from '../components/InsightCharts'
import { ResultTabs } from '../components/ResultTabs'
import { EmptyState, Metrics, Notice, Panel } from '../components/ui'
import { missingDataset, narrowRows, pageDataset, type DashboardBlock, type Dataset } from '../dashboardPages'
import { formatDateTime } from '../format'
import { chartCurrency, emptyChoice, resolveFilterSetup, type ViewerChoice } from '../insightFilters'
import { cellSortValue, cellText, displayText, rowId, type Insight, type OnDemandColumn } from '../onDemand'
import { filterText, insightRules, insightSubject, insightTypeLabel } from '../onDemandInsights'
import { cutLine, dashboardFilterLabel, dashboardRows, sourcePage, type PublishedDashboard, type PublishedFile, type PublishedRow, type PublishedSource } from '../publishData'
import { DashboardFilterRow, TableFilterRow } from './ViewerFilters'
import { emptyPeriod, narrowViewerTable, viewerMonths, yearsIn } from './viewerFilterRules'

// OND-90…OND-99 The viewer of a published interactive HTML file: a small app around the app's own chart, KPI, filter
// and aggregation modules (InsightView, KpiCard, KpiTile, BlockPanel, the filter rules), so every chart type and
// option the app draws is drawn the same here. Top to bottom (UI-STANDARDS §1, §7, §9): the header (the page, who
// published it and when, the filters the data was cut with and the rows it holds, the theme), the filter row (within
// the file's rows), then Insights / Dashboard | Rows (n). Read only: no ⋯, no resize handle, no arranging; tooltips,
// Table view, Data labels and the drill-down to the rows behind a bar, slice or point work as in the app.

const thisYear = () => new Date().getUTCFullYear()
const noRows = (inFile: number) => inFile ? { title: 'No rows of this file match these filters.', detail: 'Change the filters above, or Reset filters.' } : { title: 'This file holds no rows.', detail: 'No row passed the filters it was published with.' }
const isCard = (insight: Insight) => insight.type === 'kpi' && insight.options?.view !== 'panel'
const sizeOf = (type: string, options: Insight['options']) => { const kind = kindOf(type); return resolveChartSize({ owner: sizeFromOptions(options, kind), factory: factoryOf(kind) }).size }

export function ViewerApp({ data }: { data: PublishedFile | null }) {
  if (!data) return <main className="pv-main"><Notice tone="error">This file’s data could not be read: it may be damaged. Publish it again from the app.</Notice></main>
  return <main className="pv-main">
    <Header data={data} />
    {data.kind === 'dashboard' && data.dashboard ? <DashboardView data={data} dashboard={data.dashboard} /> : <TableView data={data} source={data.sources[0]} />}
  </main>
}

// OND-93 The header: what was published, by whom and when, the filters the data was cut with, and that it is a snapshot.
function Header({ data }: { data: PublishedFile }) {
  const { meta } = data
  return <header className="pv-header">
    <div className="pv-heading">
      <div><p className="eyebrow">{data.kind === 'dashboard' ? 'PUBLISHED DASHBOARD' : 'PUBLISHED PAGE'}</p><h1>{data.name}</h1>{data.description && <p className="muted pv-description">{data.description}</p>}</div>
      <ThemeToggle />
    </div>
    <p className="pv-published">Published by <strong>{meta.by || 'unknown'}</strong> on {meta.at}{meta.scheduled ? ' (scheduled publish)' : ''}</p>
    <p className="pv-cut" data-testid="published-cut">{cutLine(data)}</p>
    {meta.notes.map((note) => <p key={note} className="muted pv-note">{note}</p>)}
    <p className="muted pv-note">A snapshot as it was when published: it does not change and reads nothing from anywhere. Hidden rows are never published. The filters below narrow further within these rows only.</p>
  </header>
}

// ---- a table page ----
function TableView({ data, source }: { data: PublishedFile; source: PublishedSource }) {
  const page = useMemo(() => sourcePage(source), [source])
  const setup = useMemo(() => resolveFilterSetup(page), [page])
  const fallback = thisYear()
  const years = useMemo(() => yearsIn(page.rows, [setup.period]), [page, setup])
  const [choice, setChoice] = useState<ViewerChoice>(emptyChoice)
  const narrowed = useMemo(() => narrowViewerTable(page, setup, choice, years, fallback), [page, setup, choice, years, fallback])
  const shown = narrowed.page
  const withRow = Boolean(setup.period || setup.fields.length)
  const ids = useMemo(() => new Set(shown.rows.map((row) => row.id)), [shown])
  const rows = useMemo(() => source.rows.filter((row) => ids.has(row.id)), [source, ids])
  const status = `${shown.rows.length} of ${page.rows.length} row${page.rows.length === 1 ? '' : 's'} of this file shown`
  const filterBar = withRow ? <div className="ins-bar">
    <TableFilterRow page={page} setup={setup} choice={choice} years={years} fallback={fallback} onChange={setChoice} />
    <p className="muted dsh-scope ins-scope" role="status">{status}.</p>
  </div> : null
  const table = <RowsTable source={source} rows={rows} total={page.rows.length} />
  if (!data.charts) return <>{filterBar}{table}</>
  const cards = page.insights.filter(isCard), panels = page.insights.filter((insight) => !isCard(insight))
  const rowFiltered = narrowed.active && narrowed.shown < narrowed.all
  const info = (insight: Insight, currency: string) => <ul className="od-rules"><li>Type: {insightTypeLabel(insight.type)}.</li><li>{insightSubject(page, insight)}.</li><li>Its own filters: {filterText(page, insight)}.</li>{rowFiltered && <li>The filter row above: {status}.</li>}<ChartCountInfo page={shown} insight={insight} currency={currency} />{insightRules(page, insight).map((line) => <li key={line}>{line}</li>)}</ul>
  // No row to count (none in the file, or none the filter row keeps): one message instead of a grid of empty charts.
  const charts = !shown.rows.length ? <EmptyState {...noRows(page.rows.length)} /> : <>
    {cards.length > 0 && <div className="metric-grid compact od-kpi-cards">
      {cards.map((insight) => { const currency = narrowed.active ? chartCurrency(insight, narrowed) : ''; return <KpiCard key={insight.id} page={shown} insight={insight} currency={currency} info={info(insight, currency)} /> })}
    </div>}
    {panels.length > 0 && <ChartGrid className="od-insights" entries={panels.map((insight) => ({ id: insight.id, kind: kindOf(insight.type), size: sizeOf(insight.type, insight.options), box: parseGridBox(insight.options?.grid, kindOf(insight.type)) }))} titleOf={(id) => page.insights.find((entry) => entry.id === id)?.title ?? id} onResize={() => undefined}>
      {panels.map((insight) => {
        const currency = narrowed.active ? chartCurrency(insight, narrowed) : ''
        return <ChartPanel key={insight.id} id={insight.id} kind={kindOf(insight.type)} className="od-insight" size={sizeOf(insight.type, insight.options)} source="owner" title={insight.title} titleHidden={insight.options?.elements?.title === false} info={info(insight, currency)}>
          <InsightView quiet page={shown} insight={insight} colors={page.colors} narrowed={rowFiltered} currency={currency} />
        </ChartPanel>
      })}
    </ChartGrid>}
    {!page.insights.length && <EmptyState title="No charts or tables on this page." />}
  </>
  return <>{filterBar}<ResultTabs id={`published:${page.id}`} main={charts} mainLabel="Insights" raw={table} rawLabel="Rows" rawCount={shown.rows.length} /></>
}

// ---- an On-Demand Dashboard ----
function DashboardView({ data, dashboard }: { data: PublishedFile; dashboard: PublishedDashboard }) {
  const datasets = useMemo(() => data.sources.map((entry) => pageDataset(sourcePage(entry))), [data])
  const datasetOf = (key: string): Dataset => datasets.find((entry) => entry.key === key) ?? missingDataset(key, 'This data source is not in the file.')
  const fallback = thisYear()
  const years = useMemo(() => [...new Set(dashboard.blocks.flatMap((block) => { const found = datasets.find((entry) => entry.key === block.source); return found ? yearsIn(found.page.rows, [found.page.columns.find((column) => column.id === block.period)]) : [] }))].sort((a, b) => a - b), [dashboard, datasets])
  const [period, setPeriod] = useState(emptyPeriod)
  const [choices, setChoices] = useState<Record<string, string[]>>({})
  const [tabId, setTabId] = useState('')
  const [rowsOf, setRowsOf] = useState(datasets[0]?.key ?? '')
  const months = viewerMonths(period, years, fallback)
  const narrow = (dataset: Dataset, block: DashboardBlock) => dataset.problem ? null : narrowRows(dataset, block, months, dashboard.filters, choices)
  const tabs = dashboard.tabs
  const activeTab = tabs.find((tab) => tab.id === tabId) ?? tabs[0]
  const onTab = (block: DashboardBlock) => !tabs.length || (block.tab && tabs.some((tab) => tab.id === block.tab) ? block.tab : tabs[0].id) === activeTab?.id
  const tiles = dashboard.blocks.filter((block) => block.type === 'kpi')
  const panels = dashboard.blocks.filter((block) => block.type !== 'kpi' && onTab(block))
  const labelOf = (filter: PublishedDashboard['filters'][number]) => dashboardFilterLabel(filter, dashboard.filters, (key) => { const found = datasetOf(key); return { name: found.name, columns: found.page.columns } })
  const rowsDataset = datasetOf(rowsOf)
  const rowsSource = data.sources.find((entry) => `page:${entry.id}` === rowsOf)
  const shownRows = new Set(rowsDataset.problem ? [] : dashboardRows(dashboard.blocks, rowsDataset, months, dashboard.filters, choices).map((row) => row.id))
  const rows = rowsSource?.rows.filter((row) => shownRows.has(row.id)) ?? []
  const total = data.sources.reduce((sum, entry) => sum + entry.rows.length, 0)
  const counted = datasets.reduce((sum, dataset) => sum + dashboardRows(dashboard.blocks, dataset, months, dashboard.filters, choices).length, 0)
  const main = <>
    {tiles.length > 0 && <Metrics>{tiles.map((block) => { const dataset = datasetOf(block.source); const target = tabs.length ? tabs.find((tab) => tab.id === block.tab) ?? tabs[0] : undefined; return <KpiTile key={block.id} dataset={dataset} block={block} narrowed={narrow(dataset, block)} tabName={target?.name} onOpenTab={target ? () => setTabId(target.id) : undefined} /> })}</Metrics>}
    {tabs.length > 0 && <div className="overview-tabs dsh-tabs" role="tablist" aria-label="Dashboard tabs">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={tab.id === activeTab?.id} className={`backlog-tab ${tab.id === activeTab?.id ? 'backlog-tab-active' : ''}`} onClick={() => setTabId(tab.id)}>{tab.name}</button>)}</div>}
    {panels.length > 0 && <ChartGrid className="od-insights dsh-panels" role={tabs.length ? 'tabpanel' : undefined} entries={panels.map((block) => ({ id: block.id, kind: kindOf(block.type), size: sizeOf(block.type, block.options), box: parseGridBox(block.options?.grid, kindOf(block.type)) }))} titleOf={(id) => dashboard.blocks.find((block) => block.id === id)?.title ?? id} onResize={() => undefined}>
      {panels.map((block) => { const dataset = datasetOf(block.source); return <BlockPanel key={block.id} id={block.id} dataset={dataset} block={block} narrowed={narrow(dataset, block)} colors={dashboard.colors} size={sizeOf(block.type, block.options)} source="owner" /> })}
    </ChartGrid>}
    {!panels.length && <EmptyState title={tabs.length ? `No charts or tables on ${activeTab?.name}.` : 'No charts or tables on this dashboard.'} />}
  </>
  const rowsTab = <>
    {datasets.length > 1 && <div className="dash-filters compact-filters pv-source"><label className="dash-select">Rows of<select aria-label="Rows of" value={rowsOf} onChange={(event) => setRowsOf(event.target.value)}>{datasets.map((dataset) => <option key={dataset.key} value={dataset.key}>{dataset.name}</option>)}</select></label></div>}
    {rowsSource ? <RowsTable source={rowsSource} rows={rows} total={rowsSource.rows.length} /> : <EmptyState title="No rows in this file." />}
  </>
  return <>
    <div className="ins-bar">
      <DashboardFilterRow filters={dashboard.filters} labelOf={labelOf} pageOf={(key) => datasets.find((entry) => entry.key === key)?.page} period={period} choices={choices} years={years} fallback={fallback} withPeriod={dashboard.blocks.some((block) => block.period)} onChange={(nextPeriod, nextChoices) => { setPeriod(nextPeriod); setChoices(nextChoices) }} />
      <p className="muted dsh-scope" role="status">{counted} of {total} row{total === 1 ? '' : 's'} of this file counted.</p>
    </div>
    <ResultTabs id={`published:dashboard:${data.name}`} main={main} mainLabel="Dashboard" raw={rowsTab} rawLabel="Rows" rawCount={counted} />
  </>
}

// OND-97 The Rows tab: the file's rows as the filter row keeps them — ID, Key, every column, Added by / on, Last updated
// by / on — in the app's table (sort by any column, the Columns choice, Export), with a search over all columns.
function RowsTable({ source, rows, total }: { source: PublishedSource; rows: PublishedRow[]; total: number }) {
  const [search, setSearch] = useState('')
  const words = search.trim().toLowerCase()
  const columnsOf = source.columns
  const textOf = (row: PublishedRow) => [rowId(source, row), row.key ?? '', ...columnsOf.map((column) => displayText(column, row.cells[column.id])), row.addedBy ?? '', row.updatedBy ?? ''].join(' ').toLowerCase()
  const found = words ? rows.filter((row) => textOf(row).includes(words)) : rows
  const cell = (column: OnDemandColumn): DataColumn<PublishedRow> => ({
    id: column.id, label: column.name, hint: column.description, align: column.type === 'number' || column.type === 'currency' ? 'right' : undefined,
    value: (row) => cellSortValue(column, row.cells[column.id]),
    exportValue: (row) => column.type === 'currency' ? displayText(column, row.cells[column.id]) : cellSortValue(column, row.cells[column.id]),
    title: (row) => { const text = cellText(row.cells[column.id]); return text.length > 40 ? text : undefined },
    render: (row) => column.type === 'longtext' ? <span className="od-long">{cellText(row.cells[column.id])}</span> : displayText(column, row.cells[column.id]),
  })
  const columns: DataColumn<PublishedRow>[] = [
    { id: 'pv-id', label: 'ID', value: (row) => row.seq ?? Number.MAX_SAFE_INTEGER, exportValue: (row) => rowId(source, row), render: (row) => row.seq ? <code className="od-key">{rowId(source, row)}</code> : '—' },
    { id: 'pv-key', label: 'Key', value: (row) => row.key ?? '', render: (row) => row.key ? <code className="od-key">{row.key}</code> : '—' },
    ...columnsOf.map(cell),
    { id: 'pv-added-by', label: 'Added by', value: (row) => row.addedBy ?? '' },
    { id: 'pv-added-on', label: 'Added on', firstSortDesc: true, value: (row) => row.addedAt ?? '', render: (row) => row.addedAt ? formatDateTime(row.addedAt) : '—' },
    { id: 'pv-updated-by', label: 'Last updated by', defaultHidden: true, export: 'always', value: (row) => row.updatedBy ?? row.addedBy ?? '' },
    { id: 'pv-updated-on', label: 'Last updated on', defaultHidden: true, export: 'always', firstSortDesc: true, value: (row) => row.updatedAt ?? row.addedAt ?? '', render: (row) => { const at = row.updatedAt ?? row.addedAt; return at ? formatDateTime(at) : '—' } },
  ]
  return <Panel className="pv-rows" eyebrow={source.name.toUpperCase()} title="Rows">
    <DataTable id={`published-rows:${source.id}`} columns={columns} rows={found} rowKey={(row) => row.id} exportName={source.name}
      toolbar={<input type="search" className="pv-search" aria-label="Search all columns" placeholder="Search all columns" value={search} onChange={(event) => setSearch(event.target.value)} />}
      status={`${found.length} of ${total} row${total === 1 ? '' : 's'}`} empty={<EmptyState title="No rows match." detail="Change the search or the filters above." />} />
  </Panel>
}
