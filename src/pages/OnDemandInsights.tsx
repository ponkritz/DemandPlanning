import { useMemo, useState, type ReactNode } from 'react'
import { utcToday } from '../businessTime'
import { ChartOptionsFields } from '../components/ChartOptionsFields'
import { InsightView } from '../components/InsightCharts'
import { MultiSelect } from '../components/MultiSelect'
import { EmptyState, Info, Modal, Notice, Panel, WriteBlocked } from '../components/ui'
import { narrowPeriod, offeredMonths, offeredQuarters, periodQuarters, periodYears, type Period } from '../dashboard'
import { amountProblem, anyCurrency, chartCurrency, cleanSetup, currenciesOf, filterCurrency, filterKind, filterRowColumns, insightsLocalKey, insightsViewerKey, isFiltered, maxInsightFilters, narrowInsightRows, offeredYears, periodColumns, readChoice, resolveFilterSetup, scopeText, emptyChoice, type FieldChoice, type ResolvedSetup, type ViewerChoice } from '../insightFilters'
import { hasOptions, newId, type Insight, type InsightFilter, type InsightFilterSetup, type InsightMeasure, type OnDemandColumn, type OnDemandPage } from '../onDemand'
import type { PersonalViewsStore } from '../usePersonalViews'
import { blankInsight, categoryColumns, filterColumns, filterText, insightError, insightRules, insightSubject, insightTypeLabel, insightTypes, measureColumns, measuresFor, noneKey, noneLabel, secondColumns, secondLabel, withType } from '../onDemandInsights'

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
  return <>
    <Panel className="od-insights-head" eyebrow={eyebrow} title="Insights" detail={`${page.insights.length} chart${page.insights.length === 1 ? '' : 's'} and tables from the ${page.rows.length} row${page.rows.length === 1 ? '' : 's'} of ${page.name}, the same for everyone.`}
      info={<>Charts and summary tables built from the rows on the Data tab: a bar / column chart, a line over time, a pie / donut, a Pareto, a KPI or a summary table, each with Count of rows, Sum, Average, Minimum or Maximum of a Number or Currency column (one currency at a time, never converted) or a Distinct count, filters of its own and display options (orientation, date grouping, Top N, running total, percent of total, a target line, colours, width). Click a bar, slice or point to list the rows behind it. When the filter row has a Currency filter, the currency chosen there is also shown by each chart that sums, averages or takes the minimum or maximum of that column (another can still be chosen above the chart); charts of other columns keep their own currency. Each change is saved to Git at once, with the page, and shown to everyone who sees the page; people allowed to set up On-Demand pages add, edit, reorder and remove them.</>}
      action={<span className="button-row nowrap">
        <button type="button" className="ghost" disabled={Boolean(filtersReason)} title={filtersReason || undefined} onClick={() => setSettingUp(true)}>Filters…</button>
        <button type="button" className="primary" disabled={Boolean(addReason)} title={addReason || undefined} onClick={() => setEditing({ insight: blankInsight(page, newId('i')), isNew: true })}>＋ Add chart / table</button>
      </span>}>
      <WriteBlocked reason={blockNote} />
      {!blockNote && noColumns && canSetup && <p className="muted">{addReason}</p>}
      {setup.dropped.length > 0 && <Notice tone="warning">Filter row: {setup.dropped.join(' ')}{canSetup ? ' Filters… sets it up again.' : ''}</Notice>}
      {!page.insights.length && <EmptyState title="No charts or tables yet." detail={canSetup && !noColumns ? 'Add the first one with ＋ Add chart / table.' : canSetup ? undefined : 'Someone allowed to set up On-Demand pages adds them.'} />}
      {saveBar}
    </Panel>
    {narrowed.active && <>
      <FilterRow page={page} setup={setup} choice={choice} currentYear={currentYear} onChange={update} />
      <p className="muted dsh-scope ins-scope" role="status">{scopeText(setup, choice, narrowed, currentYear)}</p>
    </>}
    <div className="od-insights">
      {page.insights.map((insight, index) => { const currency = narrowed.active ? chartCurrency(insight, narrowed) : ''; return <Panel key={insight.id} className={`od-insight${insight.options?.size === 'full' ? ' od-insight-full' : ''}`} eyebrow={insightTypeLabel(insight.type).toUpperCase()} title={insight.title}
        detail={<><span>{insightSubject(page, insight)}</span><br /><span className="od-insight-filters">Filters: {filterText(page, insight)}</span></>}
        info={<ul className="od-rules">{insightRules(page, insight).map((line) => <li key={line}>{line}</li>)}{currency && <li>The filter row’s currency for {page.columns.find((column) => column.id === insight.value)?.name}, {currency}, is shown to match; choose another currency above the chart to see its rows.</li>}</ul>}
        action={<span className="button-row nowrap">
          <button type="button" className="ghost" disabled={!canSetup} title={setupReason || undefined} aria-label={`Move ${insight.title} up`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" className="ghost" disabled={!canSetup} title={setupReason || undefined} aria-label={`Move ${insight.title} down`} onClick={() => move(index, 1)}>↓</button>
          <button type="button" className="ghost" disabled={!canSetup} title={setupReason || undefined} aria-label={`Edit ${insight.title}`} onClick={() => setEditing({ insight, isNew: false })}>Edit</button>
          <button type="button" className="text-button danger-text" disabled={!canSetup} title={setupReason || undefined} aria-label={`Remove ${insight.title}`} onClick={() => setRemoving(insight)}>Remove</button>
        </span>}>
        <InsightView page={shown} insight={insight} colors={page.colors} narrowed={narrowed.active && narrowed.shown < narrowed.all} currency={currency} />
      </Panel> })}
    </div>
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
function InsightDialog({ page, insight, isNew, onCancel, onSave }: { page: OnDemandPage; insight: Insight; isNew: boolean; onCancel: () => void; onSave: (insight: Insight, colors: Record<string, number> | undefined) => void }) {
  const [draft, setDraft] = useState<Insight>(insight)
  const [pins, setPins] = useState(page.colors)
  const [error, setError] = useState('')
  const edit = (change: Partial<Insight>) => { setDraft({ ...draft, ...change }); setError('') }
  const setFilter = (index: number, change: Partial<InsightFilter>) => edit({ filters: draft.filters.map((filter, at) => at === index ? { ...filter, ...change } : filter) })
  const filterable = filterColumns(page)
  const seconds = secondColumns(page, draft.type).filter((column) => column.id !== draft.category)
  const numbers = measureColumns(page, draft.measure)
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const empty = draft.filters.find((filter) => !filter.values?.length && !filter.from && !filter.to)
    if (empty) { setError(`The filter on “${page.columns.find((column) => column.id === empty.column)?.name ?? '?'}” has nothing chosen: tick a value or give a month, or remove it.`); return }
    const bad = draft.filters.find((filter) => filter.from && filter.to && filter.from > filter.to)
    if (bad) { setError('A date filter ends before it starts: check From and To.'); return }
    const problem = insightError(page, draft)
    if (problem) { setError(problem); return }
    onSave({ ...draft, title: draft.title.trim().replace(/\s+/g, ' ') }, pins)
  }
  const measureNeedsNumber = draft.measure !== 'count'
  return <Modal eyebrow={`ON-DEMAND · ${page.name.toUpperCase()}`} title={isNew ? 'Add a chart or table' : 'Edit the chart or table'} wide onClose={onCancel}>
    <form onSubmit={submit} className="od-insight-form" noValidate>
      <div className="od-insight-editor">
        <div className="od-insight-fields">
          <label>Title<input aria-label="Title" autoFocus required maxLength={120} value={draft.title} placeholder="e.g. Cost by category" onChange={(event) => edit({ title: event.target.value })} /></label>
          <fieldset className="od-types"><legend>Type</legend>
            {insightTypes.map((type) => <label key={type.key} className="check" title={type.hint}><input type="radio" name="insight-type" checked={draft.type === type.key} onChange={() => { setDraft(withType(page, draft, type.key)); setError('') }} />{type.label}</label>)}
            <small>{insightTypes.find((type) => type.key === draft.type)?.hint}</small>
          </fieldset>
          {draft.type !== 'kpi' && <label>{draft.type === 'line' ? 'Months of' : draft.type === 'table' ? 'Rows by' : 'Categories by'}
            <select aria-label={draft.type === 'line' ? 'Months of' : draft.type === 'table' ? 'Rows by' : 'Categories by'} value={draft.category} onChange={(event) => edit({ category: event.target.value, second: draft.second === event.target.value ? '' : draft.second })}>
              {!categoryColumns(page, draft.type).some((column) => column.id === draft.category) && <option value={draft.category}>— Choose —</option>}
              {categoryColumns(page, draft.type).map((column) => <option key={column.id} value={column.id}>{column.name} ({column.type === 'date' ? 'by month' : column.type === 'multi' ? 'Multi-select' : column.type === 'dropdown' ? 'Dropdown' : 'Text'})</option>)}
            </select>
            <small>{draft.type === 'line' ? 'A Date column, grouped by month (or as chosen under Display).' : 'A Dropdown, Multi-select, Text or Date (by month, or as chosen under Display) column.'}</small>
          </label>}
          {draft.type !== 'pie' && draft.type !== 'pareto' && draft.type !== 'kpi' && <label>{secondLabel(draft.type)} (optional)
            <select aria-label={secondLabel(draft.type)} value={draft.second} onChange={(event) => edit({ second: event.target.value })}>
              <option value="">— None —</option>
              {draft.second && !seconds.some((column) => column.id === draft.second) && <option value={draft.second}>(not available)</option>}
              {seconds.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
            <small>{draft.type === 'table' ? 'A second field across: one column per value, with totals.' : 'A Dropdown or Multi-select column.'}</small>
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
          {draft.type !== 'line' && draft.type !== 'pareto' && draft.type !== 'kpi' && <label>Sort
            <select aria-label="Sort" value={draft.sort} onChange={(event) => edit({ sort: event.target.value === 'label' ? 'label' : 'value' })}>
              <option value="value">Largest first</option>
              <option value="label">By option order, month or name</option>
            </select>
          </label>}
          <ChartOptionsFields page={page} insight={draft} pins={pins} onPins={setPins} onOptions={(options) => { const next = { ...draft }; if (options) next.options = options; else delete next.options; setDraft(next); setError('') }} />
          <fieldset className="od-filters"><legend>Filters (optional) <Info label="Filters">Only the rows that pass every filter are counted. A Dropdown / Multi-select filter keeps the rows with any of the ticked values (“{noneLabel}”: no value or one not in the list); a Date filter keeps the rows whose date is in the months from / to (either may be left open). The filters are stated under the chart’s title.</Info></legend>
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
          </fieldset>
        </div>
        <section className="od-insight-preview" aria-label="Preview">
          <p className="eyebrow">PREVIEW</p>
          <h3>{draft.title.trim() || 'Untitled'}</h3>
          <p className="muted">{insightSubject(page, draft)} · Filters: {filterText(page, draft)}</p>
          <InsightView page={page} colors={pins} drill={false} insight={{ ...draft, filters: draft.filters.filter((filter) => filter.values?.length || filter.from || filter.to) }} />
        </section>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <p className="muted">Saved for everyone to Git at once.</p>
      <div className="modal-actions"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary">{isNew ? 'Add chart' : 'Save'}</button></div>
    </form>
  </Modal>
}

// OND-55: the choice remembered for this viewer (personal views), else the one kept in this browser.
function readStoredChoice(pageId: string, stored: unknown): ViewerChoice {
  if (stored && typeof stored === 'object') return readChoice(stored)
  try { return readChoice(JSON.parse(localStorage.getItem(insightsLocalKey(pageId)) ?? 'null')) } catch { return emptyChoice() }
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
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
  return <div className="dash-filters ins-filters" role="group" aria-label="Insights filters">
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
    <button type="button" className="ghost" disabled={!isFiltered(choice)} onClick={() => onChange(emptyChoice())}>Reset filters</button>
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
