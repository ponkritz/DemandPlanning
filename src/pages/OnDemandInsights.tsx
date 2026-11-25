import { useId, useMemo, useState, type ReactNode } from 'react'
import { utcToday } from '../businessTime'
import { ChartOptionsFields } from '../components/ChartOptionsFields'
import { PreviewHeading } from '../components/ChartElements'
import { ChartGrid, ChartPanel, GridCell, SizeDialog } from '../components/ChartSize'
import { ViewActions } from '../components/ViewActions'
import { cardFactory, factoryOf, insightChartId, parseGridBox, sizeFromOptions, sizeText, withGridBox, withSizeOptions, type ChartSize, type GridBox } from '../chartSize'
import { matchRowHeights, packLayout, resizePanel, rowOf, type Layout } from '../chartGrid'
import { useChartSizes } from '../useChartSize'
import { ChartCountInfo, InsightView, KpiCard } from '../components/InsightCharts'
import { MultiSelect } from '../components/MultiSelect'
import { EmptyState, Info, Modal, Notice, Panel, Pill, WriteBlocked } from '../components/ui'
import { narrowPeriod, offeredMonths, offeredQuarters, periodQuarters, periodYears, type Period } from '../dashboard'
import { amountProblem, anyCurrency, chartCurrency, cleanSetup, currenciesOf, filterCurrency, filterKind, filterRowColumns, insightsLocalKey, insightsViewerKey, isFiltered, maxInsightFilters, narrowInsightRows, offeredYears, periodColumns, readChoice, resolveFilterSetup, scopeText, emptyChoice, type FieldChoice, type ResolvedSetup, type ViewerChoice } from '../insightFilters'
import { cleanOptions, hasOptions, narrativeError, insightKindOf as kindOf, newId, parseNarrative, type ColorPins, type Insight, type InsightFilter, type InsightFilterSetup, type InsightMeasure, type OnDemandColumn, type OnDemandPage } from '../onDemand'
import type { PersonalViewsStore } from '../usePersonalViews'
import { PageViewForEveryone } from '../components/ViewForEveryone'
import { PdfExport, type PrintItem } from '../components/PrintView'
import { NarrativeFields } from '../components/NarrativeFields'
import { EditorTabs } from '../components/EditorTabs'
import { coloredColumnOf, editorCounts, editorTabLabels, editorTabsFor, filterError, firstErrorTab, panelId, splitProblems, tabId, type EditorTab } from '../chartEditor'
import { narrativeInfo } from '../narratives'
import { blankInsight, categoryColumns, filterColumns, filterText, insightError, insightProblems, insightRules, insightSubject, insightTypeLabel, insightTypes, measureColumns, measuresFor, noneKey, noneLabel, secondColumns, secondLabel, withPivotFields, withType } from '../onDemandInsights'
import { PivotFields } from '../components/PivotFields'

// CHT-36: a KPI (one number) is a card in the row above the charts unless its owners show it as a panel.
const isCard = (insight: Insight) => insight.type === 'kpi' && insight.options?.view !== 'panel'

// OND-11, OND-15 The Insights tab of an On-Demand page: the page's charts and summary tables, one panel each (title,
// what it shows and its filters under the title, ⓘ how it counts), in the order the team set. ＋ Add chart / table,
// Edit, ↑ ↓ and Remove need "Set up On-Demand pages" (CON-103); without it they are disabled with the reason
// (CON-102). Every change is saved for everyone to Git at once (OND-16, OND-30).
// OND-50…OND-56: the filter row above the charts, when the page's owners set one up with Filters… (the period's Date
// column and up to 6 filter columns): each viewer's choice narrows the rows of every chart and table of the tab (their
// drill-down and Table view too), on top of each chart's own filters, and is remembered for that viewer.
// OND-57…OND-60: a Currency filter picks one currency; a chart summing that column shows that currency to match.
export function InsightsTab({ page, canSetup, setupReason, blockNote, saveBar, views, onChange }: { page: OnDemandPage; canSetup: boolean; setupReason: string; blockNote: string; saveBar: ReactNode; views?: PersonalViewsStore; onChange: (page: OnDemandPage, message?: string) => void }) {
  const [editing, setEditing] = useState<{ insight: Insight; isNew: boolean } | null>(null)
  const [removing, setRemoving] = useState<Insight | null>(null)
  const [settingUp, setSettingUp] = useState(false)
  const [sizing, setSizing] = useState<Insight | null>(null)
  // OND-68: Export PDF… (the Insights ⋯).
  const [exporting, setExporting] = useState(false)
  const noColumns = !page.columns.length
  const addReason = setupReason || (noColumns ? 'Set up the page’s columns first (Data tab → Set up columns…).' : '')
  const filtersReason = addReason || (filterRowColumns(page).length ? '' : 'The filter row needs a Date, Dropdown, Multi-select, Text, Number or Currency column.')
  const set = (insights: Insight[]) => onChange({ ...page, insights })
  const move = (index: number, by: number) => { const to = index + by; if (to < 0 || to >= page.insights.length) return; const next = [...page.insights];[next[index], next[to]] = [next[to], next[index]]; set(next) }
  const eyebrow = `ON-DEMAND · ${page.name.toUpperCase()}`
  // OND-53…OND-55: the viewer's choice, remembered per person (else in this browser).
  const currentYear = Number(utcToday().slice(0, 4))
  const [choice, setChoice] = useState<ViewerChoice>(() => readStoredChoice(page.id, views?.filter(insightsViewerKey(page.id), (value) => value)))
  const update = (next: ViewerChoice) => { setChoice(next); try { localStorage.setItem(insightsLocalKey(page.id), JSON.stringify(next)) } catch { /* convenience only */ } views?.setFilter(insightsViewerKey(page.id), next) }
  const setup = useMemo(() => resolveFilterSetup(page), [page])
  const narrowed = useMemo(() => narrowInsightRows(page, setup, choice, currentYear), [page, setup, choice, currentYear])
  const shown = narrowed.page
  // CHT-15…CHT-18: each chart's size — the viewer's own (personal views), else the owners' (the page file), else half
  // width and medium height. Arrange sizes (owners): the corner handle sets the size for everyone, saved to Git at once.
  const sizes = useChartSizes()
  const [arranging, setArranging] = useState(false)
  const arrange = arranging && canSetup
  // CHT-51: a KPI card's factory size is 3 × 3 (a chart's half width, Medium).
  const sizeOf = (insight: Insight) => { const kind = kindOf(insight.type); const resolved = sizes.resolve(insightChartId(page.id, insight.id), isCard(insight) ? cardFactory : factoryOf(kind), sizeFromOptions(insight.options, kind), kind); return arrange ? { ...resolved, size: resolved.base, source: 'owner' as const } : resolved }
  // CHT-51: the cards first (without a place they take the row(s) above the charts), then the charts and tables.
  const cards = page.insights.filter(isCard), panels = page.insights.filter((insight) => !isCard(insight))
  const gridEntry = (insight: Insight, owner: boolean) => ({ id: insight.id, kind: kindOf(insight.type), size: owner ? sizeOf(insight).base : sizeOf(insight).size, box: parseGridBox(insight.options?.grid, kindOf(insight.type)), top: isCard(insight) })
  const entries = [...cards, ...panels].map((insight) => gridEntry(insight, false))
  // The owners' layout as everyone sees it (the owners' sizes, not a viewer's own).
  const ownerGrid = () => packLayout([...cards, ...panels].map((insight) => gridEntry(insight, true)))
  // CHT-17, CHT-51, CHT-55: Size… — a chart's size written as before; a card's (it has no preset that fits) and "Same
  // height as the other charts in its row" save the layout, as Arrange does.
  const ownerSize = (insight: Insight, size: ChartSize, match = false) => {
    if (!match && !isCard(insight)) { onChange({ ...page, insights: page.insights.map((entry) => entry.id === insight.id ? withInsightSize(entry, size) : entry) }, `${page.name}: size of the chart ${insight.title} (${sizeText(size, kindOf(insight.type))})`); return }
    const sized = resizePanel(ownerGrid(), insight.id, size)
    ownerLayout(match ? matchRowHeights(sized, insight.id, size.h) : sized, [], insight.id, match ? 'match' : 'resize')
  }
  // CHT-47: the owners' layout (Arrange mode) — every chart's place and size on the grid, saved for everyone at once.
  const ownerLayout = (layout: Layout, _changed: string[], id: string, mode: 'resize' | 'move' | 'match') => {
    const moved = page.insights.find((entry) => entry.id === id)
    const box = layout[id]
    onChange({ ...page, insights: page.insights.map((entry) => layout[entry.id] ? withInsightBox(entry, layout[entry.id]) : entry) },
      mode === 'move' ? `${page.name}: move the chart ${moved?.title ?? id} (column ${box.x + 1}, row ${box.y + 1})` : mode === 'match' ? `${page.name}: match the heights in the row of ${moved?.title ?? id} (${box.h} rows)` : `${page.name}: size of the chart ${moved?.title ?? id} (${sizeText(box, kindOf(moved?.type ?? 'bar'))})`)
  }
  // CHT-55: Match heights in this row (Arrange mode): every chart starting on its grid row takes the tallest height.
  const matchRow = (insight: Insight) => ownerLayout(matchRowHeights(ownerGrid(), insight.id), [], insight.id, 'match')
  const rowMates = (insight: Insight) => Math.max(0, rowOf(ownerGrid(), insight.id).length - 1)
  // CHT-36: Move up / down moves a card among the cards and a panel among the panels.
  const moveAmong = (list: Insight[], insight: Insight, by: number) => { const other = list[list.indexOf(insight) + by]; if (other) move(page.insights.indexOf(insight), page.insights.indexOf(other) - page.insights.indexOf(insight)) }
  // CHT-25, CHT-39: what a chart's or card's header holds — its title, no type eyebrow (the type is the first line of ⓘ) — ⓘ (what it measures, its filters, the filter row, the rows counted,
  // the currency) and "Filtered" with the owners' ⋯ menu.
  const partsOf = (insight: Insight) => {
    const currency = narrowed.active ? chartCurrency(insight, narrowed) : ''
    const subject = insightSubject(page, insight), filters = filterText(page, insight)
    const rowFiltered = narrowed.active && narrowed.shown < narrowed.all
    const filteredBy = [insight.filters.length ? `its own filters: ${filters}` : '', rowFiltered ? 'the filter row above' : ''].filter(Boolean).join('; ').replace(/^./, (first) => `Filtered by ${first}`)
    const info = <ul className="od-rules"><li>Type: {insightTypeLabel(insight.type)}.</li><li>{subject}.</li><li>Its own filters: {filters}.</li>{narrowed.active && <li>The filter row above: {scopeText(setup, choice, narrowed, currentYear)}</li>}<ChartCountInfo page={shown} insight={insight} currency={currency} />{(insight.type === 'narrative' ? narrativeInfo(page, insight) : insightRules(page, insight)).map((line) => <li key={line}>{line}</li>)}{currency && <li>The filter row’s currency for {page.columns.find((column) => column.id === insight.value)?.name}, {currency}, is shown to match; choose another currency above the chart to see its rows.</li>}</ul>
    const action = (list: Insight[], sizable: boolean) => (filteredBy || canSetup) ? <span className="button-row nowrap">{filteredBy && <span className="chart-filtered" title={filteredBy} aria-label={filteredBy}><Pill>Filtered</Pill></span>}{canSetup && <ViewActions label={insight.title} items={[
      { key: 'up', label: 'Move up', disabled: list.indexOf(insight) === 0, onClick: () => moveAmong(list, insight, -1) },
      { key: 'down', label: 'Move down', disabled: list.indexOf(insight) === list.length - 1, onClick: () => moveAmong(list, insight, 1) },
      { key: 'edit', label: 'Edit…', onClick: () => setEditing({ insight, isNew: false }) },
      ...(sizable ? [{ key: 'size', label: 'Size…', onClick: () => setSizing(insight) }] : []),
      ...(sizable && arrange ? [{ key: 'match', label: 'Match heights in this row', disabled: !rowMates(insight), title: rowMates(insight) ? undefined : 'No other chart starts on its row.', onClick: () => matchRow(insight) }] : []),
      { key: 'remove', label: 'Remove…', danger: true, onClick: () => setRemoving(insight) },
    ]} />}</span> : undefined
    return { currency, info, action, rowFiltered }
  }
  // OND-68, OND-70: the charts and cards for the PDF, drawn by the same components as above (no drill-down, no ⋯),
  // with the active filter row (the viewer's choice) or over every row; each chart's own filters always apply.
  const printItems = (): PrintItem[] => page.insights.map((insight) => {
    const card = isCard(insight), size = sizeOf(insight).size
    const own = insight.filters.length ? `Its own filters: ${filterText(page, insight)}` : undefined
    return { id: insight.id, title: insight.title, card, size, render: (filters: boolean) => {
      const currency = filters && narrowed.active ? chartCurrency(insight, narrowed) : ''
      const rows = filters ? shown : page
      return card ? <KpiCard page={rows} insight={insight} currency={currency} />
        : <ChartPanel className="od-insight" size={size} source="owner" title={insight.title} titleHidden={insight.options?.elements?.title === false} detail={own}>
          <InsightView quiet drill={false} page={rows} insight={insight} colors={page.colors} narrowed={filters && narrowed.active && narrowed.shown < narrowed.all} currency={currency} compare={filters ? narrowed.base : undefined} />
        </ChartPanel>
    } }
  })
  return <>
    {/* OND-61: the heading in one line — the explanation behind ⓘ, Filters… and ＋ Add chart / table beside the title. */}
    <Panel className="od-insights-head" eyebrow={eyebrow} title="Insights"
      info={<>{page.insights.length} chart{page.insights.length === 1 ? '' : 's'} and tables from the {page.rows.length} row{page.rows.length === 1 ? '' : 's'} of {page.name}, the same for everyone. Charts and summary tables built from the rows on the Data tab: a bar / column chart, a line over time, a pie / donut, a Pareto, a KPI or a summary table, each with Count of rows, Sum, Average, Minimum or Maximum of a Number or Currency column (one currency at a time, never converted) or a Distinct count, filters of its own and display options (orientation, date grouping, Top N, running total, percent of total, a target line, colours, width and height). Click a bar, slice or point to list the rows behind it. When the filter row has a Currency filter, the currency chosen there is also shown by each chart that sums, averages or takes the minimum or maximum of that column (another can still be chosen above the chart); charts of other columns keep their own currency. Each change is saved to Git at once, with the page, and shown to everyone who sees the page; people allowed to set up On-Demand pages add, edit, reorder, size and remove them (the chart’s ⋯). Anyone can resize a chart for themselves with the handle on its bottom-right corner (or focus it and use the arrow keys): it is remembered for them, and Reset to default goes back to the owners’ size.</>}
      action={<span className="button-row nowrap">
        <button type="button" className="ghost" disabled={Boolean(filtersReason)} title={filtersReason || undefined} onClick={() => setSettingUp(true)}>Filters…</button>
        {canSetup && page.insights.length > 0 && <button type="button" className="ghost" aria-pressed={arrange} title="Drag a chart by ⠿ to move it, or its corner to size it, for everyone" onClick={() => setArranging(!arrange)}>{arrange ? 'Done arranging' : 'Arrange charts'}</button>}
        <button type="button" className="primary" disabled={Boolean(addReason)} title={addReason || undefined} onClick={() => setEditing({ insight: blankInsight(page, newId('i')), isNew: true })}>＋ Add chart / table</button>
        <ViewActions label="Insights" items={[{ key: 'pdf', label: 'Export PDF…', disabled: !page.insights.length, title: page.insights.length ? undefined : 'No charts or tables to export yet.', onClick: () => setExporting(true) }]} />
      </span>}>
      <WriteBlocked reason={blockNote} />
      {!blockNote && noColumns && canSetup && <p className="muted">{addReason}</p>}
      {arrange && <p className="muted chart-arrange-note" role="status">Arranging the charts for everyone on the 12-column grid: drag a chart by ⠿ to move it (the others make room) and its bottom-right corner to size it — or focus ⠿ or the corner and use the arrow keys (Shift + arrows on the corner move it), Enter to keep. Each change is saved to Git at once. Done arranging goes back to your own view.</p>}
      {setup.dropped.length > 0 && <Notice tone="warning">Filter row: {setup.dropped.join(' ')}{canSetup ? ' Filters… sets it up again.' : ''}</Notice>}
      {!page.insights.length && <EmptyState title="No charts or tables yet." detail={canSetup && !noColumns ? 'Add the first one with ＋ Add chart / table.' : canSetup ? undefined : 'Someone allowed to set up On-Demand pages adds them.'} />}
      {saveBar}
    </Panel>
    {narrowed.active && <div className="ins-bar">
      <FilterRow page={page} setup={setup} choice={choice} currentYear={currentYear} onChange={update} />
      <p className="muted dsh-scope ins-scope" role="status">{scopeText(setup, choice, narrowed, currentYear)}</p>
      <PageViewForEveryone entryKey={insightsViewerKey(page.id)} what={`${page.name} filter row`} value={choice} onUse={(value) => setChoice(readChoice(value))} />
    </div>}
    {/* CHT-36, CHT-51: the KPI cards on the chart grid, in a row above the charts in the charts' order until the owners
        move them (Show as: Panel keeps a KPI among the charts as a panel); each resizable as a chart. */}
    {page.insights.length > 0 && <ChartGrid className="od-insights" entries={entries} arranging={arrange} canMove={canSetup} titleOf={(id) => page.insights.find((entry) => entry.id === id)?.title ?? id}
      onResize={(id, next) => { const insight = page.insights.find((entry) => entry.id === id); if (insight) sizes.setOwn(insightChartId(page.id, id), next, sizeOf(insight).base, kindOf(insight.type)) }} onLayout={ownerLayout}>
      {cards.map((insight) => {
        const parts = partsOf(insight)
        const { size, source } = sizeOf(insight)
        const id = insightChartId(page.id, insight.id)
        return <GridCell key={insight.id} id={insight.id} kind="kpi" title={insight.title || 'Untitled'} size={size} source={source} arranging={arrange}
          onResize={arrange ? (next) => ownerSize(insight, next) : (next) => sizes.setOwn(id, next, sizeOf(insight).base, 'kpi')} onReset={arrange ? undefined : () => sizes.setOwn(id, undefined)}>
          {(cell) => <KpiCard page={shown} insight={insight} currency={parts.currency} info={parts.info} action={parts.action(cards, true)} frame={{ className: cell.className, style: cell.style, grip: cell.grip, footer: cell.footer, rows: cell.shown.h }} />}
        </GridCell>
      })}
      {panels.map((insight) => {
        const { currency, info, action, rowFiltered } = partsOf(insight)
        const { size, source } = sizeOf(insight)
        const id = insightChartId(page.id, insight.id)
        return <ChartPanel key={insight.id} id={insight.id} kind={kindOf(insight.type)} className="od-insight" size={size} source={source} arranging={arrange} title={insight.title} titleHidden={insight.options?.elements?.title === false}
          info={info} action={action(panels, true)}
          onResize={arrange ? (next) => ownerSize(insight, next) : (next) => sizes.setOwn(id, next, sizeOf(insight).base, kindOf(insight.type))} onReset={arrange ? undefined : () => sizes.setOwn(id, undefined)}>
          <InsightView quiet page={shown} insight={insight} colors={page.colors} narrowed={rowFiltered} currency={currency} compare={narrowed.base} />
        </ChartPanel>
      })}
    </ChartGrid>}
    {sizing && <SizeDialog eyebrow={eyebrow} title={sizing.title} kind={kindOf(sizing.type)} size={sizeOf(sizing).base} card={isCard(sizing)} row={rowMates(sizing)} heightReason={isCard(sizing) ? '' : sizing.type === 'kpi' || sizing.type === 'table' || sizing.type === 'narrative' ? 'A KPI, a summary table or a narrative takes the height of its content.' : ''} onCancel={() => setSizing(null)} onSave={(size, match) => { ownerSize(sizing, size, match); setSizing(null) }} />}
    {exporting && <PdfExport eyebrow={eyebrow} pageName={page.name} sample={Boolean(page.sample)} items={printItems()} onClose={() => setExporting(false)}
      filtersLine={(filters) => narrowed.active ? filters ? `Filter row: ${scopeText(setup, choice, narrowed, currentYear)}` : `Without the filter row: all ${page.rows.length} row${page.rows.length === 1 ? '' : 's'} of ${page.name}.` : ''} />}
    {editing && <InsightDialog page={page} insight={editing.insight} isNew={editing.isNew} onCancel={() => setEditing(null)} onSave={(insight, colors) => {
      // CHT-09: the colour pins are the page's, saved with it.
      const next: OnDemandPage = { ...page, insights: editing.isNew ? [...page.insights, insight] : page.insights.map((entry) => entry.id === insight.id ? insight : entry) }
      if (colors) next.colors = colors
      else delete next.colors
      onChange(next); setEditing(null)
    }} />}
    {settingUp && <FilterSetupDialog page={page} onCancel={() => setSettingUp(false)} onSave={(next) => {
      const out: OnDemandPage = { ...page }
      if (next) out.insightFilters = next
      else delete out.insightFilters
      onChange(out, `${page.name}: set up the filter row of the Insights`); setSettingUp(false)
    }} />}
    {removing && <Modal eyebrow={eyebrow} title="Remove the chart" onClose={() => setRemoving(null)}>
      <form onSubmit={(event) => { event.preventDefault(); set(page.insights.filter((entry) => entry.id !== removing.id)); setRemoving(null) }}>
        <p>Remove <strong>{removing.title}</strong> ({insightTypeLabel(removing.type)}) for everyone? The rows stay as they are. It is removed from Git at once.</p>
        <div className="modal-actions"><button type="button" className="ghost" onClick={() => setRemoving(null)}>Cancel</button><button className="danger-button">Remove chart</button></div>
      </form>
    </Modal>}
  </>
}

// OND-15 The pop-up of one insight: title, type, the fields, the measure, filters and sort, with a live preview of the
// chart or table from the page's rows. Add / Save puts it in the page's unsaved changes.
// CHT-70…CHT-73: the form in tabs — Data, Filters, Format, Elements (Narrative for a narrative), only those the type
// takes — each with the count of its settings changed from the defaults and, once Save was tried, a red marker on a tab
// with an error; Save opens and focuses the first of them. The preview stays beside the tabs, the buttons under them.
function InsightDialog({ page, insight, isNew, onCancel, onSave }: { page: OnDemandPage; insight: Insight; isNew: boolean; onCancel: () => void; onSave: (insight: Insight, colors: ColorPins | undefined) => void }) {
  const [draft, setDraft] = useState<Insight>(insight)
  const [pins, setPins] = useState(page.colors)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<EditorTab>('data')
  const [tried, setTried] = useState(false)
  const tabsId = useId()
  const edit = (change: Partial<Insight>) => { setDraft({ ...draft, ...change }); setError('') }
  const setFilter = (index: number, change: Partial<InsightFilter>) => edit({ filters: draft.filters.map((filter, at) => at === index ? { ...filter, ...change } : filter) })
  const filterable = filterColumns(page)
  const seconds = secondColumns(page, draft.type).filter((column) => column.id !== draft.category)
  const numbers = measureColumns(page, draft.measure)
  const tabs = editorTabsFor(draft.type)
  const shownTab = tabs.includes(tab) ? tab : 'data'
  const errors = insightTabErrors(page, draft, tabs)
  const colored = page.columns.find((column) => column.id === coloredColumnOf(draft))
  const counts = editorCounts(draft, pins, colored && hasOptions(colored.type) ? colored.options : [])
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setTried(true)
    const first = firstErrorTab(tabs, errors)
    const problem = first ? errors[first]! : filterError(draft.filters, (id) => page.columns.find((column) => column.id === id)?.name ?? '?') || insightError(page, draft)
    if (problem) { setError(problem); setTab(first ?? 'data'); document.getElementById(tabId(tabsId, first ?? 'data'))?.focus(); return }
    onSave({ ...draft, title: draft.title.trim().replace(/\s+/g, ' '), ...(draft.type === 'narrative' ? { narrative: parseNarrative(draft.narrative) } : {}) }, pins)
  }
  const measureNeedsNumber = draft.measure !== 'count'
  const preview = { ...draft, filters: draft.filters.filter((filter) => filter.values?.length || filter.from || filter.to) }
  const onOptions = (options: Insight['options']) => { const next = { ...draft }; if (options) next.options = options; else delete next.options; setDraft(next); setError('') }
  const panels: Record<EditorTab, () => ReactNode> = {
    data: () => <>
      <label>Title<input aria-label="Title" required maxLength={120} value={draft.title} placeholder="e.g. Cost by category" onChange={(event) => edit({ title: event.target.value })} /></label>
      <fieldset className="od-types"><legend>Type</legend>
        {insightTypes.map((type) => <label key={type.key} className="check" title={type.hint}><input type="radio" name="insight-type" checked={draft.type === type.key} onChange={() => { setDraft(withType(page, draft, type.key)); setError('') }} />{type.label}</label>)}
        <small>{insightTypes.find((type) => type.key === draft.type)?.hint}</small>
      </fieldset>
      {/* CHT-78: a Pivot table's Rows and Columns, each with ＋ then by. */}
      {draft.type === 'table' && <PivotFields page={page} insight={{ ...draft, type: 'table' }} onChange={(rows, columns) => { setDraft(withPivotFields(draft, rows, columns)); setError('') }} />}
      {draft.type !== 'kpi' && draft.type !== 'narrative' && draft.type !== 'table' && <label>{draft.type === 'line' ? 'Months of' : 'Categories by'}
        <select aria-label={draft.type === 'line' ? 'Months of' : 'Categories by'} value={draft.category} onChange={(event) => edit({ category: event.target.value, second: draft.second === event.target.value ? '' : draft.second })}>
          {!categoryColumns(page, draft.type).some((column) => column.id === draft.category) && <option value={draft.category}>— Choose —</option>}
          {categoryColumns(page, draft.type).map((column) => <option key={column.id} value={column.id}>{column.name} ({column.type === 'date' ? 'by month' : column.type === 'multi' ? 'Multi-select' : column.type === 'dropdown' ? 'Dropdown' : 'Text'})</option>)}
        </select>
        <small>{draft.type === 'line' ? 'A Date column, grouped by month (or as chosen in Group dates by).' : 'A Dropdown, Multi-select, Text or Date (by month, or as chosen in Group dates by) column.'}</small>
      </label>}
      {/* CHT-66: a Narrative's Group by takes the place of Categories by. */}
      {draft.type === 'narrative' && <NarrativeFields part="data" page={page} insight={draft} onChange={(next) => { setDraft(next); setError('') }} />}
      {draft.type !== 'pie' && draft.type !== 'pareto' && draft.type !== 'kpi' && draft.type !== 'narrative' && draft.type !== 'table' && <label>{secondLabel(draft.type)} (optional)
        <select aria-label={secondLabel(draft.type)} value={draft.second} onChange={(event) => edit({ second: event.target.value })}>
          <option value="">— None —</option>
          {draft.second && !seconds.some((column) => column.id === draft.second) && <option value={draft.second}>(not available)</option>}
          {seconds.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
        <small>A Dropdown or Multi-select column.</small>
      </label>}
      <div className="form-row">
        <label>Measure
          <select aria-label="Measure" value={draft.measure} onChange={(event) => { const measure = event.target.value as InsightMeasure; const fits = measureColumns(page, measure); setDraft(withType(page, { ...draft, measure, value: measure === 'count' ? '' : fits.some((column) => column.id === draft.value) ? draft.value : fits[0]?.id || '' }, draft.type)); setError('') }}>
            {measuresFor(draft.type).map((measure) => { const none = measure.key !== 'count' && !measureColumns(page, measure.key).length; return <option key={measure.key} value={measure.key} disabled={none}>{measure.label}{none ? measure.key === 'distinct' ? ' (needs a column other than Long text)' : ' (needs a Number or Currency column)' : ''}</option> })}
          </select>
        </label>
        {measureNeedsNumber && <label>{draft.measure === 'distinct' ? 'Of the column' : 'Of the Number column'}
          <select aria-label={draft.measure === 'distinct' ? 'Of the column' : 'Of the Number column'} value={draft.value} onChange={(event) => edit({ value: event.target.value })}>
            {!numbers.some((column) => column.id === draft.value) && <option value={draft.value}>— Choose —</option>}
            {numbers.map((column) => <option key={column.id} value={column.id}>{column.name}{column.type === 'currency' ? ' (Currency)' : ''}</option>)}
          </select>
        </label>}
      </div>
      {draft.type !== 'narrative' && <ChartOptionsFields part="data" page={page} insight={draft} pins={pins} onPins={setPins} onOptions={onOptions} />}
      {draft.type !== 'line' && draft.type !== 'pareto' && draft.type !== 'kpi' && draft.type !== 'narrative' && <label>Sort
        <select aria-label="Sort" value={draft.sort} onChange={(event) => edit({ sort: event.target.value === 'label' ? 'label' : 'value' })}>
          <option value="value">Largest first</option>
          <option value="label">By option order, month or name</option>
        </select>
      </label>}
    </>,
    filters: () => <fieldset className="od-filters"><legend>Filters (optional) <Info label="Filters">Only the rows that pass every filter are counted. A Dropdown / Multi-select filter keeps the rows with any of the ticked values (“{noneLabel}”: no value or one not in the list); a Date filter keeps the rows whose date is in the months from / to (either may be left open). The filters are stated under the chart’s title.</Info></legend>
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
      <button type="button" className="text-button" disabled={!filterable.length} title={filterable.length ? undefined : 'Filters need a Dropdown, Multi-select or Date column.'} onClick={() => edit({ filters: [...draft.filters, { column: filterable[0].id }] })}>＋ Add filter</button>
      {!filterable.length && <small>Filters need a Dropdown, Multi-select or Date column.</small>}
    </fieldset>,
    format: () => <ChartOptionsFields part="format" page={page} insight={draft} pins={pins} onPins={setPins} onOptions={onOptions} />,
    elements: () => <ChartOptionsFields part="elements" page={page} insight={draft} pins={pins} onPins={setPins} onOptions={onOptions} />,
    // CHT-66: a Narrative's own fields — the period, the sentences and rules, the width.
    narrative: () => <NarrativeFields part="narrative" page={page} insight={draft} onChange={(next) => { setDraft(next); setError('') }} />,
  }
  return <Modal eyebrow={`ON-DEMAND · ${page.name.toUpperCase()}`} title={isNew ? 'Add a chart or table' : 'Edit the chart or table'} wide onClose={onCancel}>
    <form onSubmit={submit} className="od-insight-form" noValidate>
      <div className="od-insight-editor">
        <div className="od-insight-fields">
          <EditorTabs id={tabsId} label="Chart settings" current={shownTab} onChoose={setTab} tabs={tabs.map((key) => ({ key, label: editorTabLabels[key], count: counts[key], error: tried ? errors[key] : undefined }))} />
          <div className="od-tab-panel" role="tabpanel" id={panelId(tabsId, shownTab)} aria-label={editorTabLabels[shownTab]}>{panels[shownTab]()}</div>
        </div>
        <section className="od-insight-preview" aria-label="Preview">
          <p className="eyebrow">PREVIEW</p>
          {/* KB-86: the preview shows the chart as its panel (or card) does — title, ⓘ and "Filtered", no long subtitle. */}
          {isCard(draft) ? <div className="metric-grid compact od-kpi-cards"><KpiCard page={page} insight={{ ...preview, title: draft.title.trim() || 'Untitled' }} info={<>{insightSubject(page, draft)}. Its own filters: {filterText(page, draft)}.</>} action={preview.filters.length ? <Pill>Filtered</Pill> : undefined} /></div>
            : <><PreviewHeading title={draft.title.trim() || 'Untitled'} hidden={draft.options?.elements?.title === false} info={<>{insightSubject(page, draft)}. Its own filters: {filterText(page, draft)}.</>} filtered={preview.filters.length > 0} />
              <InsightView quiet page={page} colors={pins} drill={false} insight={preview} /></>}
        </section>
      </div>
      <div className="od-editor-footer">
        {error && <Notice tone="error">{error}</Notice>}
        <p className="muted">Saved for everyone to Git at once.</p>
        <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary">{isNew ? 'Add chart' : 'Save'}</button></div>
      </div>
    </form>
  </Modal>
}

// CHT-72: the error of each tab of the chart pop-up — the title and the columns on Data, the chart's own filters on
// Filters, the target line on Format, the sentences and rules on Narrative; an error of a tab the type does not show
// goes to Data.
function insightTabErrors(page: OnDemandPage, insight: Insight, tabs: EditorTab[]): Partial<Record<EditorTab, string>> {
  const split = splitProblems(insightProblems(page, insight), insightProblems(page, { ...insight, filters: [] }))
  const target = insight.options?.target
  const errors: Partial<Record<EditorTab, string>> = {
    data: !insight.title.trim() ? 'Give the chart or table a title.' : insight.type === 'line' && !categoryColumns(page, 'line').length ? 'A line over time needs a Date column on the page.' : split.data,
    filters: filterError(insight.filters, (id) => page.columns.find((column) => column.id === id)?.name ?? '?') || split.filters,
    format: target && !Number.isFinite(target.value) ? 'The target line needs a number.' : '',
    narrative: insight.type === 'narrative' ? narrativeError(insight.narrative, Boolean(insight.category)) : '',
  }
  for (const key of Object.keys(errors) as EditorTab[]) if (!tabs.includes(key) && errors[key]) { errors.data ||= errors[key]; delete errors[key] }
  return errors
}

function readStoredChoice(pageId: string, stored: unknown): ViewerChoice {
  if (stored && typeof stored === 'object') return readChoice(stored)
  try { return readChoice(JSON.parse(localStorage.getItem(insightsLocalKey(pageId)) ?? 'null')) } catch { return emptyChoice() }
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// CHT-17: an insight with the owners' size written into its options (a factory value left out).
function withInsightSize(insight: Insight, size: ChartSize): Insight {
  const kind = kindOf(insight.type)
  const options = cleanOptions(insight.type, insight.measure, withSizeOptions(insight.options, size, factoryOf(kind), false, kind))
  const out: Insight = { ...insight }
  if (options) out.options = options
  else delete out.options
  return out
}

// CHT-47: an insight with the owners' place on the grid (and the nearest presets for older apps).
function withInsightBox(insight: Insight, box: GridBox): Insight {
  const options = cleanOptions(insight.type, insight.measure, withGridBox(insight.options, box, kindOf(insight.type)))
  const out: Insight = { ...insight }
  if (options) out.options = options
  else delete out.options
  return out
}

// OND-53: the filter row (UI-STANDARDS §7) — Year → Quarter → Month over the period's Date column as on the On-Demand
// Dashboard (DSH-07), then the owners' filters in their order, then Reset filters.
function FilterRow({ page, setup, choice, currentYear, onChange }: { page: OnDemandPage; setup: ResolvedSetup; choice: ViewerChoice; currentYear: number; onChange: (choice: ViewerChoice) => void }) {
  const countingYears = periodYears(choice.period, currentYear)
  const several = countingYears.length > 1
  const setPeriod = (period: Period) => onChange({ ...choice, period: narrowPeriod(period, currentYear) })
  const setField = (column: OnDemandColumn, change: Partial<FieldChoice>) => {
    const next: FieldChoice = { ...choice.fields[column.id], ...change }
    for (const key of Object.keys(next) as (keyof FieldChoice)[]) { const value = next[key]; if (value == null || value === '' || (Array.isArray(value) && !value.length)) delete next[key] }
    const fields = { ...choice.fields }
    if (Object.keys(next).length) fields[column.id] = next
    else delete fields[column.id]
    onChange({ ...choice, fields })
  }
  const numberOrNone = (text: string) => text.trim() === '' || !Number.isFinite(Number(text)) ? undefined : Number(text)
  return <div className="dash-filters ins-filters compact-filters" role="group" aria-label="Insights filters">
    {setup.period && <>
      <MultiSelect label="Year" emptyLabel={String(currentYear)} options={offeredYears(page, setup, choice, currentYear).map((year) => [String(year), String(year)])} value={choice.period.years.map(String)} onChange={(value) => setPeriod({ ...choice.period, years: value.map(Number) })} />
      <MultiSelect label="Quarter" options={offeredQuarters(countingYears).map((quarter) => [quarter, several ? `Q${quarter.slice(6)} ${quarter.slice(0, 4)}` : `Q${quarter.slice(6)}`])} value={choice.period.quarters} onChange={(value) => setPeriod({ ...choice.period, quarters: value })} />
      <MultiSelect label="Month" options={offeredMonths(periodQuarters(choice.period, currentYear)).map((entry) => [entry, several ? `${monthNames[Number(entry.slice(5)) - 1]} ${entry.slice(0, 4)}` : monthNames[Number(entry.slice(5)) - 1]])} value={choice.period.months} onChange={(value) => setPeriod({ ...choice.period, months: value })} />
    </>}
    {setup.fields.map((column) => {
      const value = choice.fields[column.id] ?? {}
      const kind = filterKind(column)
      if (kind === 'values') return <MultiSelect key={column.id} label={column.name} search={column.options.length > 10} options={[...column.options, noneKey].map((option) => [option, option || noneLabel])} value={value.values ?? []} onChange={(values) => setField(column, { values })} />
      if (kind === 'months') return <span key={column.id} className="ins-range">
        <label className="dash-select">{column.name} from<input type="month" aria-label={`${column.name} from month`} value={value.from ?? ''} onChange={(event) => setField(column, { from: event.target.value || undefined })} /></label>
        <label className="dash-select">to<input type="month" aria-label={`${column.name} to month`} value={value.to ?? ''} onChange={(event) => setField(column, { to: event.target.value || undefined })} /></label>
      </span>
      if (kind === 'range') return <span key={column.id} className="ins-range">
        <label className="dash-select">{column.name} from<input type="number" inputMode="decimal" aria-label={`${column.name} at least`} value={value.min ?? ''} onChange={(event) => setField(column, { min: numberOrNone(event.target.value) })} /></label>
        <label className="dash-select">to<input type="number" inputMode="decimal" aria-label={`${column.name} at most`} value={value.max ?? ''} onChange={(event) => setField(column, { max: numberOrNone(event.target.value) })} /></label>
      </span>
      if (kind === 'money') {
        // OND-57…OND-59: the currency (those of the column's rows, most first; Any currency only when there are
        // several), then the amount from / to in it; From above To is an error and is not applied.
        const found = currenciesOf(page, column)
        const code = filterCurrency(page, column, value)
        const list = code === anyCurrency || found.some((entry) => entry.code === code) ? found : [...found, { code, rows: 0 }]
        const any = code === anyCurrency
        const problem = amountProblem(value)
        const anyReason = any ? 'Choose a currency to filter by amount: amounts in different currencies are not compared.' : undefined
        return <span key={column.id} className="ins-range ins-money">
          <label className="dash-select">{column.name}<select aria-label={`${column.name} currency`} value={code} onChange={(event) => setField(column, event.target.value === anyCurrency ? { currency: anyCurrency, min: undefined, max: undefined } : { currency: event.target.value })}>
            {list.map((entry) => <option key={entry.code} value={entry.code}>{entry.code} ({entry.rows} row{entry.rows === 1 ? '' : 's'})</option>)}
            {(found.length > 1 || any) && <option value={anyCurrency}>Any currency</option>}
          </select></label>
          <label className="dash-select">from{any ? '' : ` ${code}`}<input type="number" inputMode="decimal" aria-label={`${column.name} at least`} aria-invalid={problem ? true : undefined} disabled={any} title={anyReason} value={value.min ?? ''} onChange={(event) => setField(column, { min: numberOrNone(event.target.value) })} /></label>
          <label className="dash-select">to{any ? '' : ` ${code}`}<input type="number" inputMode="decimal" aria-label={`${column.name} at most`} aria-invalid={problem ? true : undefined} disabled={any} title={anyReason} value={value.max ?? ''} onChange={(event) => setField(column, { max: numberOrNone(event.target.value) })} /></label>
        </span>
      }
      return <label key={column.id} className="dash-select">{column.name} contains<input type="search" maxLength={120} aria-label={`${column.name} contains`} placeholder="Text" value={value.text ?? ''} onChange={(event) => setField(column, { text: event.target.value || undefined })} /></label>
    })}
    <button type="button" className="text-button" disabled={!isFiltered(choice)} onClick={() => onChange(emptyChoice())}>Reset filters</button>
    {setup.fields.filter((column) => filterKind(column) === 'money' && amountProblem(choice.fields[column.id])).map((column) => <small key={`error-${column.id}`} className="field-error ins-error" role="alert">{column.name}: {amountProblem(choice.fields[column.id])}</small>)}
  </div>
}

// OND-51, OND-52: the owners' setup of the filter row — the period's Date column (or none) and up to 6 filter columns
// (Dropdown, Multi-select, Date, Text, Number, Currency — OND-57) in order; Save to Git saves it with the page at once (OND-30).
const kindText = (column: OnDemandColumn) => ({ values: 'values', months: 'from / to month', range: 'from / to number', money: 'one currency, from / to amount', contains: 'contains' })[filterKind(column)]
function FilterSetupDialog({ page, onCancel, onSave }: { page: OnDemandPage; onCancel: () => void; onSave: (setup: InsightFilterSetup | undefined) => void }) {
  const [initial] = useState(() => resolveFilterSetup(page))
  const [period, setPeriod] = useState(initial.period?.id ?? '')
  const [fields, setFields] = useState<string[]>(initial.fields.map((column) => column.id))
  const dates = periodColumns(page)
  const usable = filterRowColumns(page).filter((column) => column.id !== period)
  const free = (except: string) => usable.filter((column) => column.id === except || !fields.includes(column.id))
  const move = (index: number, by: number) => { const to = index + by; if (to < 0 || to >= fields.length) return; const next = [...fields];[next[index], next[to]] = [next[to], next[index]]; setFields(next) }
  const next = usable.find((column) => !fields.includes(column.id))
  const addReason = fields.length >= maxInsightFilters ? `At most ${maxInsightFilters} filters.` : next ? '' : 'Every column that can filter is in the row already.'
  return <Modal eyebrow={`ON-DEMAND · ${page.name.toUpperCase()}`} title="Filters of the Insights tab" onClose={onCancel}>
    <form onSubmit={(event) => { event.preventDefault(); onSave(cleanSetup(period, fields)) }} className="pgb-form ins-setup" noValidate>
      <p className="muted">A filter row above the charts lets each viewer narrow every chart and table of this tab, on top of each chart’s own filters. Each viewer’s choice is remembered for them; nothing ticked = all.</p>
      <label>Period on (optional)
        <select aria-label="Period on" value={period} onChange={(event) => { setPeriod(event.target.value); setFields(fields.filter((id) => id !== event.target.value)) }}>
          <option value="">— None —</option>
          {dates.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
        <small>{dates.length ? 'Year → Quarter → Month over this Date column; nothing ticked = the current year. Rows without a date in it are left out while it applies.' : 'The period needs a Date column on the page.'}</small>
      </label>
      <fieldset className="od-filters"><legend>Filters of the filter row (optional)</legend>
        <small>Up to {maxInsightFilters}, in this order: a Dropdown or Multi-select (tick values, “{noneLabel}” too), a Date (from / to month), a Text (contains), a Number (from / to) or a Currency (one currency, then from / to amount in it: amounts are never converted or compared across currencies).</small>
        {fields.map((id, index) => <div key={id} className="od-filter-head">
          <select aria-label={`Filter ${index + 1} column`} value={id} onChange={(event) => setFields(fields.map((entry, at) => at === index ? event.target.value : entry))}>
            {free(id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({kindText(entry)})</option>)}
          </select>
          <button type="button" className="ghost" disabled={index === 0} aria-label={`Move filter ${index + 1} up`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" className="ghost" disabled={index === fields.length - 1} aria-label={`Move filter ${index + 1} down`} onClick={() => move(index, 1)}>↓</button>
          <button type="button" className="text-button danger-text" aria-label={`Remove filter ${index + 1}`} onClick={() => setFields(fields.filter((_, at) => at !== index))}>✕</button>
        </div>)}
        <button type="button" className="text-button" disabled={Boolean(addReason)} title={addReason || undefined} onClick={() => { if (next) setFields([...fields, next.id]) }}>＋ Add filter</button>
        {addReason && fields.length > 0 && <small>{addReason}</small>}
      </fieldset>
      <p className="muted">Saved for everyone to Git at once, with the page. Without a period and filters the tab has no filter row.</p>
      <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary">Save to Git</button></div>
    </form>
  </Modal>
}
