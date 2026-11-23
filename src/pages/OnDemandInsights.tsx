import { useState, type ReactNode } from 'react'
import { ChartOptionsFields } from '../components/ChartOptionsFields'
import { InsightView } from '../components/InsightCharts'
import { EmptyState, Info, Modal, Notice, Panel, WriteBlocked } from '../components/ui'
import { hasOptions, newId, type Insight, type InsightFilter, type InsightMeasure, type OnDemandPage } from '../onDemand'
import { blankInsight, categoryColumns, filterColumns, filterText, insightError, insightRules, insightSubject, insightTypeLabel, insightTypes, measureColumns, measuresFor, noneKey, noneLabel, secondColumns, secondLabel, withType } from '../onDemandInsights'

// OND-11, OND-15 The Insights tab of an On-Demand page: the page's charts and summary tables, one panel each (title,
// what it shows and its filters under the title, ⓘ how it counts), in the order the team set. ＋ Add chart / table,
// Edit, ↑ ↓ and Remove need "Set up On-Demand pages" (CON-103); without it they are disabled with the reason
// (CON-102). Every change is saved for everyone to Git at once (OND-16, OND-30).
export function InsightsTab({ page, canSetup, setupReason, blockNote, saveBar, onChange }: { page: OnDemandPage; canSetup: boolean; setupReason: string; blockNote: string; saveBar: ReactNode; onChange: (page: OnDemandPage) => void }) {
  const [editing, setEditing] = useState<{ insight: Insight; isNew: boolean } | null>(null)
  const [removing, setRemoving] = useState<Insight | null>(null)
  const noColumns = !page.columns.length
  const addReason = setupReason || (noColumns ? 'Set up the page’s columns first (Data tab → Set up columns…).' : '')
  const set = (insights: Insight[]) => onChange({ ...page, insights })
  const move = (index: number, by: number) => { const to = index + by; if (to < 0 || to >= page.insights.length) return; const next = [...page.insights];[next[index], next[to]] = [next[to], next[index]]; set(next) }
  const eyebrow = `ON-DEMAND · ${page.name.toUpperCase()}`
  return <>
    <Panel className="od-insights-head" eyebrow={eyebrow} title="Insights" detail={`${page.insights.length} chart${page.insights.length === 1 ? '' : 's'} and tables from the ${page.rows.length} row${page.rows.length === 1 ? '' : 's'} of ${page.name}, the same for everyone.`}
      info={<>Charts and summary tables built from the rows on the Data tab: a bar / column chart, a line over time, a pie / donut, a Pareto, a KPI or a summary table, each with Count of rows, Sum, Average, Minimum or Maximum of a Number or Currency column (one currency at a time, never converted) or a Distinct count, filters of its own and display options (orientation, date grouping, Top N, running total, percent of total, a target line, colours, width). Click a bar, slice or point to list the rows behind it. Each change is saved to Git at once, with the page, and shown to everyone who sees the page; people allowed to set up On-Demand pages add, edit, reorder and remove them.</>}
      action={<button type="button" className="primary" disabled={Boolean(addReason)} title={addReason || undefined} onClick={() => setEditing({ insight: blankInsight(page, newId('i')), isNew: true })}>＋ Add chart / table</button>}>
      <WriteBlocked reason={blockNote} />
      {!blockNote && noColumns && canSetup && <p className="muted">{addReason}</p>}
      {!page.insights.length && <EmptyState title="No charts or tables yet." detail={canSetup && !noColumns ? 'Add the first one with ＋ Add chart / table.' : canSetup ? undefined : 'Someone allowed to set up On-Demand pages adds them.'} />}
      {saveBar}
    </Panel>
    <div className="od-insights">
      {page.insights.map((insight, index) => <Panel key={insight.id} className={`od-insight${insight.options?.size === 'full' ? ' od-insight-full' : ''}`} eyebrow={insightTypeLabel(insight.type).toUpperCase()} title={insight.title}
        detail={<><span>{insightSubject(page, insight)}</span><br /><span className="od-insight-filters">Filters: {filterText(page, insight)}</span></>}
        info={<ul className="od-rules">{insightRules(page, insight).map((line) => <li key={line}>{line}</li>)}</ul>}
        action={<span className="button-row nowrap">
          <button type="button" className="ghost" disabled={!canSetup} title={setupReason || undefined} aria-label={`Move ${insight.title} up`} onClick={() => move(index, -1)}>↑</button>
          <button type="button" className="ghost" disabled={!canSetup} title={setupReason || undefined} aria-label={`Move ${insight.title} down`} onClick={() => move(index, 1)}>↓</button>
          <button type="button" className="ghost" disabled={!canSetup} title={setupReason || undefined} aria-label={`Edit ${insight.title}`} onClick={() => setEditing({ insight, isNew: false })}>Edit</button>
          <button type="button" className="text-button danger-text" disabled={!canSetup} title={setupReason || undefined} aria-label={`Remove ${insight.title}`} onClick={() => setRemoving(insight)}>Remove</button>
        </span>}>
        <InsightView page={page} insight={insight} colors={page.colors} />
      </Panel>)}
    </div>
    {editing && <InsightDialog page={page} insight={editing.insight} isNew={editing.isNew} onCancel={() => setEditing(null)} onSave={(insight, colors) => {
      // CHT-09: the colour pins are the page's, saved with it.
      const next: OnDemandPage = { ...page, insights: editing.isNew ? [...page.insights, insight] : page.insights.map((entry) => entry.id === insight.id ? insight : entry) }
      if (colors) next.colors = colors
      else delete next.colors
      onChange(next); setEditing(null)
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
