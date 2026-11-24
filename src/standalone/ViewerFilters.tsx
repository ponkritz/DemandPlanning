import { offeredMonths, offeredQuarters, periodQuarters, type Period } from '../dashboard'
import type { ViewerFilter } from '../dashboardPages'
import { amountProblem, anyCurrency, currenciesOf, emptyChoice, filterCurrency, filterKind, isFiltered, type FieldChoice, type ResolvedSetup, type ViewerChoice } from '../insightFilters'
import type { OnDemandColumn, OnDemandPage } from '../onDemand'
import { noneLabel } from '../onDemandInsights'
import { MultiSelect } from '../components/MultiSelect'
import { countingYears, isEmptyPeriod, narrowViewerPeriod, offeredValues } from './viewerFilterRules'

// OND-95 The filter row of a published file (UI-STANDARDS §7, the app's filter-row look: MultiSelect, Reset filters
// last): Year → Quarter → Month over the years of the file's rows ("All" when nothing is ticked), then the page's or
// dashboard's filters with only the values found in the file's rows. It narrows within the published rows only.

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function PeriodPicker({ period, years, fallback, onChange }: { period: Period; years: number[]; fallback: number; onChange: (period: Period) => void }) {
  const counting = countingYears(period, years, fallback)
  const several = counting.length > 1
  const set = (next: Period) => onChange(narrowViewerPeriod(next, years, fallback))
  return <>
    <MultiSelect label="Year" emptyLabel="All" options={years.map((year) => [String(year), String(year)])} value={period.years.map(String)} onChange={(value) => set({ ...period, years: value.map(Number) })} />
    <MultiSelect label="Quarter" options={offeredQuarters(counting).map((quarter) => [quarter, several ? `Q${quarter.slice(6)} ${quarter.slice(0, 4)}` : `Q${quarter.slice(6)}`])} value={period.quarters} onChange={(value) => set({ ...period, quarters: value })} />
    <MultiSelect label="Month" options={offeredMonths(periodQuarters({ ...period, years: counting }, fallback)).map((entry) => [entry, several ? `${monthNames[Number(entry.slice(5)) - 1]} ${entry.slice(0, 4)}` : monthNames[Number(entry.slice(5)) - 1]])} value={period.months} onChange={(value) => set({ ...period, months: value })} />
  </>
}

// A table page: the period over its period column, then its filters (as the app's Insights filter row, OND-53).
export function TableFilterRow({ page, setup, choice, years, fallback, onChange }: { page: OnDemandPage; setup: ResolvedSetup; choice: ViewerChoice; years: number[]; fallback: number; onChange: (choice: ViewerChoice) => void }) {
  const setField = (column: OnDemandColumn, change: Partial<FieldChoice>) => {
    const next: FieldChoice = { ...choice.fields[column.id], ...change }
    for (const key of Object.keys(next) as (keyof FieldChoice)[]) { const value = next[key]; if (value == null || value === '' || (Array.isArray(value) && !value.length)) delete next[key] }
    const fields = { ...choice.fields }
    if (Object.keys(next).length) fields[column.id] = next
    else delete fields[column.id]
    onChange({ ...choice, fields })
  }
  const numberOrNone = (text: string) => text.trim() === '' || !Number.isFinite(Number(text)) ? undefined : Number(text)
  return <div className="dash-filters ins-filters compact-filters" role="group" aria-label="Filters">
    {setup.period && <PeriodPicker period={choice.period} years={years} fallback={fallback} onChange={(period) => onChange({ ...choice, period })} />}
    {setup.fields.map((column) => {
      const value = choice.fields[column.id] ?? {}
      const kind = filterKind(column)
      if (kind === 'values') { const offered = offeredValues(page.rows, column); return <MultiSelect key={column.id} label={column.name} search={offered.length > 10} options={offered.map((option) => [option, option || noneLabel])} value={value.values ?? []} onChange={(values) => setField(column, { values })} /> }
      if (kind === 'months') return <span key={column.id} className="ins-range">
        <label className="dash-select">{column.name} from<input type="month" aria-label={`${column.name} from month`} value={value.from ?? ''} onChange={(event) => setField(column, { from: event.target.value || undefined })} /></label>
        <label className="dash-select">to<input type="month" aria-label={`${column.name} to month`} value={value.to ?? ''} onChange={(event) => setField(column, { to: event.target.value || undefined })} /></label>
      </span>
      if (kind === 'range') return <span key={column.id} className="ins-range">
        <label className="dash-select">{column.name} from<input type="number" inputMode="decimal" aria-label={`${column.name} at least`} value={value.min ?? ''} onChange={(event) => setField(column, { min: numberOrNone(event.target.value) })} /></label>
        <label className="dash-select">to<input type="number" inputMode="decimal" aria-label={`${column.name} at most`} value={value.max ?? ''} onChange={(event) => setField(column, { max: numberOrNone(event.target.value) })} /></label>
      </span>
      if (kind === 'money') {
        // OND-57…OND-59 within the file: the currencies of the file's rows, then the amount from / to in the one chosen.
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

// A dashboard: the period over the blocks' Date columns, then its filters (DSH-07), each over its data source's rows.
export function DashboardFilterRow({ filters, labelOf, pageOf, period, choices, years, fallback, withPeriod, onChange }: { filters: ViewerFilter[]; labelOf: (filter: ViewerFilter) => string; pageOf: (source: string) => OnDemandPage | undefined; period: Period; choices: Record<string, string[]>; years: number[]; fallback: number; withPeriod: boolean; onChange: (period: Period, choices: Record<string, string[]>) => void }) {
  const filtered = !isEmptyPeriod(period) || Object.values(choices).some((value) => value.length)
  return <div className="dash-filters compact-filters" role="group" aria-label="Filters">
    {withPeriod && <PeriodPicker period={period} years={years} fallback={fallback} onChange={(next) => onChange(next, choices)} />}
    {filters.map((filter) => {
      const page = pageOf(filter.source), column = page?.columns.find((entry) => entry.id === filter.column)
      const offered = page && column ? offeredValues(page.rows, column) : []
      return <MultiSelect key={filter.id} label={labelOf(filter)} search={offered.length > 10} options={offered.map((option) => [option, option || noneLabel])} value={choices[filter.id] ?? []}
        disabled={!column} onChange={(value) => onChange(period, { ...choices, [filter.id]: value })} />
    })}
    <button type="button" className="text-button" disabled={!filtered} onClick={() => onChange({ years: [], quarters: [], months: [] }, {})}>Reset filters</button>
  </div>
}
